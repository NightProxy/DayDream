// src/apis/nyxBridge/handlers/windows.ts
//
// V1: DDX is single-window. Methods return a synthetic window with
// id=1 representing the host. multi-window create/remove rejects.

import { register } from './index';
import { DDXError } from '../types';
import type { WindowInfo } from '../api';

function getCurrentWindow(ctx: any, populate: boolean): WindowInfo {
	return {
		id: 1,
		focused: true,
		state: 'normal',
		type: 'normal',
		tabs: populate ? ctx.tabResolver.all() : undefined,
	};
}

register('windows.getCurrent', async (ctx, args: { populate?: boolean } | undefined) => getCurrentWindow(ctx, !!args?.populate));
register('windows.getLastFocused', async (ctx, args: { populate?: boolean } | undefined) => getCurrentWindow(ctx, !!args?.populate));
register('windows.getAll', async (ctx, args: { populate?: boolean } | undefined) => [getCurrentWindow(ctx, !!args?.populate)]);
register('windows.get', async (ctx, args: number | [number, { populate?: boolean }?]) => {
	const id = typeof args === 'number' ? args : args[0];
	const populate = typeof args === 'number' ? false : !!args[1]?.populate;
	if (id !== 1) throw new DDXError('not_supported', 'only window 1 in single-window mode');
	return getCurrentWindow(ctx, populate);
});
register('windows.create', async () => {
	throw new DDXError('not_supported', 'multi-window unsupported in v1');
});
register('windows.remove', async () => {
	throw new DDXError('not_supported', 'cannot remove main window');
});
register('windows.update', async (ctx, args: [number, any]) => {
	if (args[0] !== 1) throw new DDXError('not_supported', 'only window 1');
	return getCurrentWindow(ctx, false);
});
