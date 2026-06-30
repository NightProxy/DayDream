
import { register } from './index';
import { DDXError } from '../types';
import type { TabId } from '../api';

register('debugger.attach', async () => {
	/* no-op: agent attaches automatically when hookInstaller runs */
});

register('debugger.detach', async () => {
	/* no-op */
});

register('debugger.sendCommand', async (ctx, args: [{ tabId: TabId }, string, object?]) => {
	if (!ctx.cdp) throw new DDXError('not_supported', 'CDP unavailable');
	const [target, method, params] = args;
	return ctx.cdp.send(target.tabId, method, params ?? {});
});

register('debugger.getTargets', async (ctx) => {
	return (ctx.tabResolver.all() as any[]).map((t) => ({
		targetId: `tab-${t.id}`,
		type: 'page',
		title: t.title ?? '',
		url: t.url ?? '',
		attached: true,
		tabId: t.id,
	}));
});
