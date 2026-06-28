// src/apis/nyxBridge/handlers/tabs.ts

import { register } from './index';
import { DDXError } from '../types';
import type { TabId, TabInfo } from '../api';
import { hashGroupId, getDdxGroupId } from '../tabResolver-helpers';

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

// Inline shape of the subset of the browser `Tabs` API we touch in
// this file. Tabs lives in src/browser/tabs/index.ts and is bound
// here as ctx.tabs (typed `unknown` to avoid pulling in the full
// browser shell). Methods are typed precisely so call-site mistakes
// (wrong arity / wrong argument types) get caught by tsc. groupManager
// is optional on the live Tabs instance (see src/browser/tabs/index.ts:99)
// because it is constructed lazily; we mirror that optionality here.
interface TabsApi {
	moveTabInOrder: (
		draggedTabId: string,
		targetTabId: string,
		placeAfter?: boolean,
	) => void;
	getTabsInOrder: () => Array<{ id: string }>;
	groupManager?: {
		addTabToGroup: (tabId: string, groupId: string, targetIndex?: number) => boolean;
		createGroupWithTab: (tabId: string) => string | null;
		removeTabFromGroup: (tabId: string, toUngroupedIndex?: number) => boolean;
	};
	hardReloadTab?: (id: string) => void;
}

register('tabs.move', async (ctx, args: { tabIds: TabId | TabId[]; properties: { windowId?: number; index: number } }) => {
	if (args.properties.windowId !== undefined && args.properties.windowId !== 1 && args.properties.windowId !== -2 /* WINDOW_ID_CURRENT */) {
		throw new DDXError('not_supported', 'DDX is single-window; windowId must be 1');
	}
	const ids = Array.isArray(args.tabIds) ? args.tabIds : [args.tabIds];
	const results: TabInfo[] = [];
	const tabs = ctx.tabs as TabsApi;
	for (let i = 0; i < ids.length; i++) {
		const id = ids[i];
		if (id === undefined) continue;
		const ddxId = ctx.tabResolver.toDdxId(id);
		if (!ddxId) continue;
		// Tabs.moveTabInOrder takes a TARGET tab id, not an absolute
		// index. Translate the requested numeric index (chrome-API
		// shape) into the id of the tab currently at that position;
		// when the index lies beyond the end, anchor on the last tab
		// and ask Tabs to place AFTER it.
		const order = tabs.getTabsInOrder();
		const wantedIdx = args.properties.index + i;
		const lastIdx = order.length - 1;
		let placeAfter = false;
		let targetIdx = wantedIdx;
		if (wantedIdx > lastIdx) {
			targetIdx = lastIdx;
			placeAfter = true;
		} else if (wantedIdx < 0) {
			targetIdx = 0;
		}
		const targetTab = order[targetIdx];
		if (targetTab && targetTab.id !== ddxId) {
			tabs.moveTabInOrder(ddxId, targetTab.id, placeAfter);
		}
		results.push(ctx.tabResolver.info(id));
	}
	return Array.isArray(args.tabIds) ? results : (results[0] ?? null);
});

register('tabs.group', async (ctx, args: { tabIds: TabId | TabId[]; groupId?: number; createProperties?: { windowId?: number } }) => {
	const ids = Array.isArray(args.tabIds) ? args.tabIds : [args.tabIds];
	const tabs = ctx.tabs as TabsApi;
	const gm = tabs.groupManager;
	if (!gm) {
		// groupManager is lazily constructed in the live browser shell.
		// If it isn't present, tab grouping isn't available — return
		// the Chrome "no group" sentinel id rather than throw.
		return -1;
	}
	let ddxGroupId: string;
	if (args.groupId !== undefined) {
		const existing = getDdxGroupId(args.groupId);
		if (!existing) throw new DDXError('invalid_argument', `group ${args.groupId} not found`);
		ddxGroupId = existing;
		for (const n of ids) {
			if (n === undefined) continue;
			const ddxId = ctx.tabResolver.toDdxId(n);
			if (ddxId) gm.addTabToGroup(ddxId, ddxGroupId);
		}
	} else {
		const first = ids[0];
		if (first === undefined) throw new DDXError('invalid_argument', 'tabs.group requires at least one tabId');
		const firstDdx = ctx.tabResolver.toDdxId(first);
		if (!firstDdx) throw new DDXError('tab_not_found', 'first tabId invalid');
		const created = gm.createGroupWithTab(firstDdx);
		if (!created) return -1;
		ddxGroupId = created;
		for (let i = 1; i < ids.length; i++) {
			const n = ids[i];
			if (n === undefined) continue;
			const ddxId = ctx.tabResolver.toDdxId(n);
			if (ddxId) gm.addTabToGroup(ddxId, ddxGroupId);
		}
	}
	return hashGroupId(ddxGroupId);
});

register('tabs.ungroup', async (ctx, args: TabId | TabId[]) => {
	const ids = Array.isArray(args) ? args : [args];
	const tabs = ctx.tabs as TabsApi;
	const gm = tabs.groupManager;
	if (!gm) return;
	for (const n of ids) {
		if (n === undefined) continue;
		const ddxId = ctx.tabResolver.toDdxId(n);
		if (ddxId) gm.removeTabFromGroup(ddxId);
	}
});

register('tabs.hardReload', async (ctx, args: { tabId?: TabId } | undefined) => {
	const n = args?.tabId ?? ctx.tabResolver.getCurrentNum();
	if (n === undefined) throw new DDXError('tab_not_found', 'no active tab');
	const tabs = ctx.tabs as TabsApi;
	const ddxId = ctx.tabResolver.toDdxId(n);
	if (ddxId && typeof tabs.hardReloadTab === 'function') {
		tabs.hardReloadTab(ddxId);
	} else {
		const iframe = ctx.tabResolver.resolveIframe(n);
		try { (iframe.contentWindow as Window | null)?.location.reload(); } catch { /* ignore */ }
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
