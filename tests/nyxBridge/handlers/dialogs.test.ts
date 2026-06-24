import { describe, it, expect, vi } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/dialogs';

describe('dialogs', () => {
	it('handleNext sends Page.handleJavaScriptDialog with accept:true', async () => {
		const send = vi.fn(async () => ({}));
		const ctx: any = { cdp: { send }, tabResolver: { resolveIframe: () => null, ensureActive: async () => {} } };
		await HANDLERS['dialogs.handleNext']!(ctx, [{ tabId: 1 }, 'accept']);
		expect(send).toHaveBeenCalledWith(1, 'Page.handleJavaScriptDialog', { accept: true, promptText: undefined });
	});

	it('handleNext with action=dismiss sends accept:false', async () => {
		const send = vi.fn(async () => ({}));
		const ctx: any = { cdp: { send }, tabResolver: { resolveIframe: () => null, ensureActive: async () => {} } };
		await HANDLERS['dialogs.handleNext']!(ctx, [{ tabId: 1 }, 'dismiss']);
		expect(send).toHaveBeenCalledWith(1, 'Page.handleJavaScriptDialog', { accept: false, promptText: undefined });
	});
});
