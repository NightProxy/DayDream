// src/apis/nyxBridge/handlers/cookies.ts
//
// Cookie operations via CDP Network.{get,set,delete}Cookies. All
// operations target the current active tab; cross-tab cookie reads
// are not supported in v1.

import { register } from './index';
import { DDXError } from '../types';
import type { Cookie } from '../api';

function requireCdp(ctx: any) {
	if (!ctx.cdp) throw new DDXError('not_supported', 'CDP unavailable');
	return ctx.cdp;
}

function currentTabNum(ctx: any): number {
	const n = ctx.tabResolver.getCurrentNum();
	if (n == null) throw new DDXError('tab_not_found', 'no active tab');
	return n;
}

register('cookies.get', async (ctx, args: { url: string; name: string }) => {
	const cdp = requireCdp(ctx);
	const r = await cdp.send(currentTabNum(ctx), 'Network.getCookies', { urls: [args.url] });
	return ((r as { cookies: Cookie[] }).cookies).find((c) => c.name === args.name) ?? null;
});

register('cookies.getAll', async (ctx, args: any) => {
	const cdp = requireCdp(ctx);
	const r = await cdp.send(currentTabNum(ctx), 'Network.getCookies', args?.url ? { urls: [args.url] } : {});
	return ((r as { cookies: Cookie[] }).cookies).filter((c) => {
		if (args?.domain && c.domain !== args.domain) return false;
		if (args?.name && c.name !== args.name) return false;
		if (args?.path && c.path !== args.path) return false;
		if (args?.secure != null && c.secure !== args.secure) return false;
		return true;
	});
});

register('cookies.set', async (ctx, args: any) => {
	const cdp = requireCdp(ctx);
	await cdp.send(currentTabNum(ctx), 'Network.setCookies', { cookies: [args] });
	const r = await cdp.send(currentTabNum(ctx), 'Network.getCookies', { urls: [args.url] });
	return ((r as { cookies: Cookie[] }).cookies).find((c) => c.name === args.name) ?? null;
});

register('cookies.remove', async (ctx, args: { url: string; name: string }) => {
	const cdp = requireCdp(ctx);
	await cdp.send(currentTabNum(ctx), 'Network.deleteCookies', { url: args.url, name: args.name });
	return { url: args.url, name: args.name };
});

register('cookies.getAllCookieStores', async () => {
	return [{ id: '0', tabIds: [] }];
});
