// src/apis/nyxBridge/handlers/search.ts
//
// search.query: routes to protocols.navigate (default) or
// tabs.createTab (when disposition === 'NEW_TAB').

import { register } from './index';
import { DDXError } from '../types';

register('search.query', async (ctx, args: { text: string; disposition?: string; tabId?: number }) => {
	if (args.disposition === 'NEW_TAB') {
		const tabs = ctx.tabs as { createTab?: (url: string) => Promise<unknown> } | null;
		if (!tabs?.createTab) throw new DDXError('not_supported', 'tabs.createTab unavailable');
		await tabs.createTab(args.text);
		return;
	}
	const protocols = ctx.protocols as { navigate?: (text: string) => Promise<unknown> } | null;
	if (!protocols?.navigate) throw new DDXError('not_supported', 'protocols.navigate unavailable');
	await protocols.navigate(args.text);
});
