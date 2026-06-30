
import { register, type HandlerContext } from './index';
import { DDXError } from '../types';
import type { TabTarget, TabId, ElementHandle, FrameDetails } from '../api';
import { decodeIframeUrl } from '@browser/tabs/urlDecoder';

const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_MS = 50;

/**
 * Safely read the current human-readable URL of an iframe.
 *
 * Three things this guards against:
 *
 *   1. **Cross-origin throws.** Accessing
 *      `iframe.contentWindow.location.href` on a frame whose document
 *      is in a transient cross-origin state (mid-navigation, srcdoc
 *      reset, scramjet rehydrating) throws synchronously. uBlock
 *      Origin's popup hit exactly this path: `webNavigation.getFrame`
 *      returned a rejected promise / undefined URL, uBO's
 *      `safePunycodeToUnicode(undefined)` blew up at
 *      `mapDomain(undefined).split('.')`. Wrap the access in
 *      try/catch and fall back to `iframe.src`.
 *
 *   2. **Encoded URL leak.** `iframe.contentWindow.location.href`
 *      and `iframe.src` for proxied tabs are scramjet-encoded
 *      gibberish like `https://service.tomp.app/scramjet/url/...`.
 *      Extensions like uBO derive hostnames from this URL — they need
 *      the REAL site URL (`https://example.com/page`), not the
 *      proxy host. `decodeProxiedUrl` reverses the encoding.
 *
 *   3. **Empty / null safety.** Always returns a string (never
 *      undefined / null) so downstream consumers don't crash on
 *      property access.
 */
function safeIframeUrl(iframe: HTMLIFrameElement | null, ctx: HandlerContext): string {
	const proxy = ctx.proxy as Parameters<typeof decodeIframeUrl>[1];
	return decodeIframeUrl(iframe, proxy) || (iframe?.src ?? '');
}

async function pollUntil<T>(predicate: () => T | null, timeoutMs: number): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const r = predicate();
		if (r != null) return r;
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
	throw new DDXError('timeout', `polled for ${timeoutMs}ms`);
}

function isVisible(el: Element): boolean {
	const win = (el.ownerDocument as Document).defaultView;
	if (!win) return false;
	const style = win.getComputedStyle(el as HTMLElement);
	if (style.display === 'none' || style.visibility === 'hidden') return false;
	const rect = (el as HTMLElement).getBoundingClientRect();
	return rect.width > 0 && rect.height > 0;
}

function mainFrameDetails(ctx: HandlerContext, tabId: TabId): FrameDetails {
	const iframe = ctx.tabResolver.resolveIframe(tabId);
	return { frameId: 0, parentFrameId: -1, url: safeIframeUrl(iframe, ctx) };
}

register('webNavigation.getFrame', async (ctx, args: { tabId: TabId; frameId: number }) => {
	if (args.frameId !== 0) {
		throw new DDXError('frame_not_found', `frameId ${args.frameId} (only 0 supported in v1)`);
	}
	return mainFrameDetails(ctx, args.tabId);
});

register('webNavigation.getAllFrames', async (ctx, args: { tabId: TabId }) => {
	return [mainFrameDetails(ctx, args.tabId)];
});

register('webNavigation.waitForLoad', async (ctx, args: [TabTarget, { timeout?: number }?] | { target: TabTarget; opts?: { timeout?: number } }) => {
	const [target, opts] = Array.isArray(args) ? args : [args.target, args.opts];
	const iframe = ctx.tabResolver.resolveIframe(target.tabId);
	const timeout = opts?.timeout ?? DEFAULT_TIMEOUT_MS;
	const url = await pollUntil(() => {
		const doc = iframe.contentDocument;
		let ready: string | undefined;
		try { ready = doc?.readyState; } catch { ready = undefined; }
		if (ready === 'complete') return safeIframeUrl(iframe, ctx) || '<unknown>';
		return null;
	}, timeout);
	return { url };
});

register('webNavigation.waitForNavigation', async (ctx, args: [TabTarget, { timeout?: number; urlPattern?: string }?] | { target: TabTarget; opts?: { timeout?: number; urlPattern?: string } }) => {
	const [target, opts] = Array.isArray(args) ? args : [args.target, args.opts];
	const iframe = ctx.tabResolver.resolveIframe(target.tabId);
	const start = safeIframeUrl(iframe, ctx);
	const pattern = opts?.urlPattern;
	const url = await pollUntil(() => {
		const u = safeIframeUrl(iframe, ctx);
		if (!u || u === start) return null;
		if (pattern && !u.includes(pattern)) return null;
		return u;
	}, opts?.timeout ?? DEFAULT_TIMEOUT_MS);
	return { url, status: 200 };
});

register('webNavigation.waitForSelector', async (ctx, args: [TabTarget, string, { timeout?: number; state?: string }?] | { target: TabTarget; selector: string; opts?: { timeout?: number; state?: string } }) => {
	const [target, selector, opts] = Array.isArray(args)
		? args
		: [args.target, args.selector, args.opts];
	const iframe = ctx.tabResolver.resolveIframe(target.tabId);
	const state = opts?.state ?? 'attached';
	const timeout = opts?.timeout ?? DEFAULT_TIMEOUT_MS;
	const el = await pollUntil<Element>(() => {
		const doc = iframe.contentDocument;
		if (!doc) return null;
		const e = doc.querySelector(selector);
		if (state === 'attached' || state === 'visible') {
			if (!e) return null;
			if (state === 'visible' && !isVisible(e)) return null;
			return e;
		}
		if (state === 'hidden') {
			if (e && !isVisible(e)) return e;
			return null;
		}
		if (state === 'detached') {
			if (!e) return doc.documentElement;
			return null;
		}
		return null;
	}, timeout);
	if (!ctx.handleStore) throw new DDXError('not_supported', 'handleStore unavailable');
	return ctx.handleStore.create(target.tabId, el) satisfies ElementHandle;
});

register('webNavigation.waitForFunction', async (ctx, args: [TabTarget, string, unknown[]?, { timeout?: number }?] | { target: TabTarget; fnSource: string; args?: unknown[]; opts?: { timeout?: number } }) => {
	let target: TabTarget;
	let fnSource: string;
	let fnArgs: unknown[] | undefined;
	let opts: { timeout?: number } | undefined;
	if (Array.isArray(args)) {
		[target, fnSource, fnArgs, opts] = args;
	} else {
		target = args.target;
		fnSource = args.fnSource;
		fnArgs = args.args;
		opts = args.opts;
	}
	const iframe = ctx.tabResolver.resolveIframe(target.tabId);
	const timeout = opts?.timeout ?? DEFAULT_TIMEOUT_MS;
	const result = await pollUntil<{ value: unknown }>(() => {
		try {
			const win = iframe.contentWindow as any;
			if (!win) return null;
			const wrapped = `(${fnSource}).apply(null, ${JSON.stringify(fnArgs ?? [])})`;
			const v = win.eval(wrapped);
			return v ? { value: v } : null;
		} catch {
			return null;
		}
	}, timeout);
	return result.value;
});
