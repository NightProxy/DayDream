
import { register } from './index';
import { DDXError } from '../types';
import type { TabInfo, WindowInfo } from '../api';
import type { HandlerContext } from './index';

function getCurrentWindow(ctx: HandlerContext, populate: boolean): WindowInfo {
	return {
		id: 1,
		focused: typeof document !== 'undefined' ? document.hasFocus() : true,
		state: typeof document !== 'undefined' && document.fullscreenElement !== null ? 'fullscreen' : 'normal',
		type: 'normal',
		tabs: populate ? ctx.tabResolver.all() : undefined,
	};
}

register('windows.getCurrent', async (ctx, args: { populate?: boolean } | undefined) => getCurrentWindow(ctx, !!args?.populate));
register('windows.getLastFocused', async (ctx, args: { populate?: boolean } | undefined) => getCurrentWindow(ctx, !!args?.populate));
register('windows.getAll', async (ctx, args: { populate?: boolean } | undefined) => [getCurrentWindow(ctx, !!args?.populate)]);
register('windows.get', async (ctx, args: { windowId: number; populate?: boolean } | number | [number, { populate?: boolean }?]) => {
	let id: number;
	let populate: boolean;
	if (typeof args === 'number') { id = args; populate = false; }
	else if (Array.isArray(args)) { id = args[0]; populate = !!args[1]?.populate; }
	else { id = args.windowId; populate = !!args.populate; }
	if (id !== 1 && id !== -2) {
		throw new DDXError('not_supported', `window ${id} not found`);
	}
	return getCurrentWindow(ctx, populate);
});
register('windows.create', async (ctx, args: { url?: string | string[]; tabId?: number; focused?: boolean; state?: string } | undefined) => {
	const urls = Array.isArray(args?.url) ? args!.url : (args?.url ? [args.url] : ['ddx://newtab/']);
	const tabsApi = ctx.tabs as { createTab: (url: string) => Promise<string | null> };
	const createdTabs: TabInfo[] = [];
	for (const url of urls) {
		try {
			const ddxId = await tabsApi.createTab(url);
			if (ddxId) {
				const num = ctx.tabResolver.toNum(ddxId);
				createdTabs.push(ctx.tabResolver.info(num));
			}
		} catch (err) {
			console.warn('[nyxBridge/windows.create] createTab failed:', err);
		}
	}
	if (args?.state === 'fullscreen' && typeof document !== 'undefined') {
		try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
	}
	const result = getCurrentWindow(ctx, false);
	result.tabs = createdTabs;
	return result;
});
register('windows.remove', async (_ctx, args: { windowId?: number } | number) => {
	const id = typeof args === 'number' ? args : args?.windowId;
	if (id !== 1 && id !== -2) {
		throw new DDXError('not_supported', `window ${id} not found`);
	}
	// Don't actually close DDX; treat as no-op.
});
register('windows.update', async (ctx, args: { windowId: number; updateInfo: { state?: string; focused?: boolean } } | [number, { state?: string; focused?: boolean }]) => {
	const windowId = Array.isArray(args) ? args[0] : args.windowId;
	const updateInfo = Array.isArray(args) ? args[1] : args.updateInfo;
	if (windowId !== 1 && windowId !== -2) {
		throw new DDXError('not_supported', `window ${windowId} not found`);
	}
	if (typeof document !== 'undefined') {
		try {
			if (updateInfo?.state === 'fullscreen') {
				await document.documentElement.requestFullscreen();
			} else if (updateInfo?.state === 'normal' && document.fullscreenElement) {
				await document.exitFullscreen();
			}
		} catch { /* ignore */ }
	}
	return getCurrentWindow(ctx, false);
});
