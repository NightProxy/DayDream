// src/apis/nyxBridge/handlers/tabs.ts

import { register } from './index';
import { DDXError } from '../types';
import type { TabId } from '../api';

register('tabs.query', async (ctx, args: { active?: boolean; url?: string | string[]; title?: string } | undefined) => {
	const all = ctx.tabResolver.all();
	let out = all;
	if (args?.active === true) out = out.filter((t) => t.active);
	if (args?.active === false) out = out.filter((t) => !t.active);
	if (args?.url) {
		const patterns = Array.isArray(args.url) ? args.url : [args.url];
		out = out.filter((t) => t.url && patterns.some((p) => urlMatches(p, t.url!)));
	}
	if (args?.title) out = out.filter((t) => t.title === args.title);
	return out;
});

register('tabs.get', async (ctx, tabId: TabId) => ctx.tabResolver.info(tabId));

register('tabs.getCurrent', async (ctx) => {
	const n = ctx.tabResolver.getCurrentNum();
	return n != null ? ctx.tabResolver.info(n) : undefined;
});

register('tabs.create', async (ctx, args: { url?: string; active?: boolean } | undefined) => {
	const url = args?.url ?? 'ddx://newtab/';
	const tabs = ctx.tabs as { createTab: (url: string) => Promise<string | null> };
	const ddxId = await tabs.createTab(url);
	if (!ddxId) throw new DDXError('cdp_error', 'createTab returned null');
	const n = ctx.tabResolver.toNum(ddxId);
	return ctx.tabResolver.info(n);
});

register('tabs.update', async (ctx, args: [TabId, { url?: string; active?: boolean; muted?: boolean }] | { tabId: TabId; props?: { url?: string; active?: boolean; muted?: boolean } }) => {
	const [tabId, props] = Array.isArray(args)
		? args
		: [args.tabId, args.props ?? (args as any)];
	if (props?.url) {
		const iframe = ctx.tabResolver.resolveIframe(tabId);
		const proxy = ctx.proxy as { navigateFrame: (iframe: HTMLIFrameElement, url: string) => Promise<boolean> };
		const ok = await proxy.navigateFrame(iframe, props.url);
		if (!ok) throw new DDXError('nav_aborted', `navigateFrame failed for ${props.url}`);
	}
	if (props?.active === true) {
		await ctx.tabResolver.ensureActive(tabId);
	}
	return ctx.tabResolver.info(tabId);
});

register('tabs.remove', async (ctx, args: TabId | TabId[]) => {
	const ids = Array.isArray(args) ? args : [args];
	const tabs = ctx.tabs as { closeTabById: (id: string) => Promise<unknown> | unknown };
	for (const n of ids) {
		const ddxId = ctx.tabResolver.toDdxId(n);
		if (!ddxId) continue;
		await tabs.closeTabById(ddxId);
		ctx.tabResolver.dropDdxId(ddxId);
	}
});

register('tabs.duplicate', async (ctx, tabId: TabId) => {
	const src = ctx.tabResolver.info(tabId);
	const tabs = ctx.tabs as { createTab: (url: string) => Promise<string | null> };
	const ddxId = await tabs.createTab(src.url ?? 'ddx://newtab/');
	if (!ddxId) throw new DDXError('cdp_error', 'duplicate failed');
	return ctx.tabResolver.info(ctx.tabResolver.toNum(ddxId));
});

register('tabs.reload', async (ctx, tabId: TabId | undefined) => {
	const n = tabId ?? ctx.tabResolver.getCurrentNum();
	if (n == null) throw new DDXError('tab_not_found', 'no active tab');
	const iframe = ctx.tabResolver.resolveIframe(n);
	try {
		(iframe.contentWindow as Window | null)?.location.reload();
	} catch (e: any) {
		throw new DDXError('cdp_error', e?.message ?? String(e));
	}
});

register('tabs.goBack', async (ctx, tabId: TabId | undefined) => {
	const n = tabId ?? ctx.tabResolver.getCurrentNum();
	if (n == null) throw new DDXError('tab_not_found', 'no active tab');
	const iframe = ctx.tabResolver.resolveIframe(n);
	try {
		(iframe.contentWindow as Window | null)?.history.back();
	} catch (e: any) {
		throw new DDXError('cdp_error', e?.message ?? String(e));
	}
});

register('tabs.goForward', async (ctx, tabId: TabId | undefined) => {
	const n = tabId ?? ctx.tabResolver.getCurrentNum();
	if (n == null) throw new DDXError('tab_not_found', 'no active tab');
	const iframe = ctx.tabResolver.resolveIframe(n);
	try {
		(iframe.contentWindow as Window | null)?.history.forward();
	} catch (e: any) {
		throw new DDXError('cdp_error', e?.message ?? String(e));
	}
});

register('tabs.captureVisibleTab', async (ctx, args: [number?, { format?: 'png' | 'jpeg'; quality?: number }?] | { format?: 'png' | 'jpeg'; quality?: number } | undefined) => {
	if (!ctx.cdp) throw new DDXError('not_supported', 'CDP unavailable');
	const opts = Array.isArray(args) ? args[1] : args;
	const tabId = ctx.tabResolver.getCurrentNum();
	if (tabId == null) throw new DDXError('tab_not_found', 'no active tab');
	const r = await ctx.cdp.send(tabId, 'Page.captureScreenshot', {
		format: opts?.format ?? 'png',
		quality: opts?.quality,
	}) as { data: string };
	return `data:image/${opts?.format ?? 'png'};base64,${r.data}`;
});

register('tabs.sendMessage', async (ctx, args: [TabId, unknown, { frameId?: number }?] | { tabId: TabId; message: unknown }) => {
	const [tabId, message] = Array.isArray(args)
		? args
		: [args.tabId, args.message];
	const iframe = ctx.tabResolver.resolveIframe(tabId);
	const target = iframe.contentWindow as Window | null;
	if (!target) throw new DDXError('frame_not_found', 'no contentWindow');
	try {
		target.postMessage(message, '*');
		return undefined;
	} catch (e: any) {
		throw new DDXError('cdp_error', e?.message ?? String(e));
	}
});

function urlMatches(pattern: string, url: string): boolean {
	if (pattern === url) return true;
	if (pattern.includes('*')) {
		const re = new RegExp('^' + pattern.split('*').map(escapeRe).join('.*') + '$');
		return re.test(url);
	}
	return url.startsWith(pattern);
}

function escapeRe(s: string): string {
	return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
