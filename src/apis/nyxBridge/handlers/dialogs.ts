// src/apis/nyxBridge/handlers/dialogs.ts
//
// One-shot dialog handler. NyxAI calls handleNext() BEFORE triggering
// an action that would open a JS dialog (alert/confirm/prompt) so
// chobitsu's Page.handleJavaScriptDialog auto-responds when it fires.

import { register } from './index';
import { DDXError } from '../types';
import type { TabTarget } from '../api';

register('dialogs.handleNext', async (ctx, args: [TabTarget, 'accept' | 'dismiss', string?] | { target: TabTarget; action: 'accept' | 'dismiss'; promptText?: string }) => {
	if (!ctx.cdp) throw new DDXError('not_supported', 'CDP unavailable');
	const [target, action, promptText] = Array.isArray(args)
		? args
		: [args.target, args.action, args.promptText];
	await ctx.cdp.send(target.tabId, 'Page.handleJavaScriptDialog', {
		accept: action === 'accept',
		promptText: promptText ?? undefined,
	});
});
