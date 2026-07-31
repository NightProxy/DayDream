
import { RequestResponseChannel } from '../eventsBridge';
import type { Handshake } from './handshake';
import type { TabId, ErrorCode } from './api';
import { dispatchEventToFrame } from './frameDispatch';

export interface NyxChannelOpts {
	handshake: Handshake;
	dispatchMethod: (method: string, args: unknown) => Promise<unknown>;
	resolveIframeForSource: (source: Window) => HTMLIFrameElement | null;
	resolveRealUrl: (iframe: HTMLIFrameElement) => string;
	reqMarker?: string;
	resMarker?: string;
	/**
	 * Fired once per iframe after the handshake successfully completes
	 * and `{ok:true}` has been queued for return. NyxBridge uses this
	 * to drain any pending prefill payloads (see queuePrefill) into the
	 * newly-trusted frame.
	 */
	onHandshakeComplete?: (iframe: HTMLIFrameElement, source: Window) => void;
}

const HANDSHAKE_INIT = '__handshake.init';
const HANDSHAKE_COMPLETE = '__handshake.complete';

export class NyxChannel {
	private opts: NyxChannelOpts;
	private channel: RequestResponseChannel;
	private perTabQueue = new Map<TabId, Promise<unknown>>();
	private installed = false;

	constructor(opts: NyxChannelOpts) {
		this.opts = opts;
		this.channel = new RequestResponseChannel({
			reqMarker: opts.reqMarker ?? '__nyx_req',
			resMarker: opts.resMarker ?? '__nyx_res',
			replyTransport: (source, wrapped) => {
				const detail = (wrapped as { __nyx_res?: unknown }).__nyx_res;
				dispatchEventToFrame(source as Window | null, '__nyx_res', detail);
			},
		});
		this.channel.registerHandler(HANDSHAKE_INIT, (req, source) => this.onInit(req, source));
		this.channel.registerHandler(HANDSHAKE_COMPLETE, (req, source) => this.onComplete(req, source));
	}

	install(): void {
		if (this.installed) return;
		this.channel.install();
		this.installed = true;
	}

	uninstall(): void {
		if (!this.installed) return;
		this.channel.uninstall();
		this.installed = false;
	}

	/**
	 * Register every method name from METHOD_REGISTRY. Called by NyxBridge
	 * before install(). Keeping this out of the constructor avoids forcing
	 * channel.ts to import api.ts (which keeps unit tests lighter).
	 */
	registerMethods(methods: readonly string[]): void {
		for (const m of methods) {
			if (m === HANDSHAKE_INIT || m === HANDSHAKE_COMPLETE) continue;
			this.channel.registerHandler(m, (req, source) => this.onMethod(m, req, source));
		}
	}

	private async onInit(req: Record<string, unknown>, source: any): Promise<unknown> {
		void req;
		const iframe = source ? this.opts.resolveIframeForSource(source as Window) : null;
		if (!iframe) this.err('permission_denied', 'no_iframe');
		const realUrl = this.opts.resolveRealUrl(iframe);
		const res = await this.opts.handshake.handleInit({ iframe, realUrl });
		if (!res.ok) this.err(res.code, res.reason);
		return { nonce: res.nonce, sessionId: res.sessionId };
	}

	private async onComplete(req: Record<string, unknown>, source: any): Promise<unknown> {
		const iframe = source ? this.opts.resolveIframeForSource(source as Window) : null;
		if (!iframe) this.err('permission_denied', 'no_iframe');
		const args = req.args as { sessionId?: string; token?: string } | undefined;
		if (!args?.sessionId || !args.token) this.err('invalid_argument', 'missing_args');
		const res = await this.opts.handshake.handleComplete({
			sessionId: args.sessionId,
			token: args.token,
			iframe,
		});
		if (!res.ok) this.err(res.code, res.reason);
		if (this.opts.onHandshakeComplete) {
			const cb = this.opts.onHandshakeComplete;
			const src = source as Window;
			queueMicrotask(() => {
				try {
					cb(iframe, src);
				} catch (e) {
					console.warn('[nyxBridge] onHandshakeComplete threw:', e);
				}
			});
		}
		return { ok: true };
	}

	private async onMethod(method: string, req: Record<string, unknown>, source: any): Promise<unknown> {
		const sessionId = req.sessionId as string | undefined;
		const trust = this.opts.handshake.verify(sessionId, source as Window | null);
		if (!trust.ok) this.err(trust.code ?? 'handshake_required', trust.reason ?? 'untrusted');

		const args = req.args as { tabId?: TabId; target?: { tabId?: TabId } } | undefined;
		const tabId = args?.target?.tabId ?? args?.tabId;
		if (typeof tabId === 'number') {
			const prev = this.perTabQueue.get(tabId) ?? Promise.resolve();
			const next = prev.then(() => this.runOne(method, args));
			this.perTabQueue.set(tabId, next.catch(() => undefined));
			return next;
		}
		return this.runOne(method, args);
	}

	private async runOne(method: string, args: unknown): Promise<unknown> {
		try {
			return await this.opts.dispatchMethod(method, args);
		} catch (e: any) {
			this.err((e?.code as ErrorCode) ?? 'cdp_error', e?.message ?? String(e));
		}
	}

	private err(code: ErrorCode, message: string): never {
		const err = new Error(message) as Error & { code: ErrorCode };
		err.code = code;
		throw err;
	}
}
