import { describe, it, expect, vi } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/debugger';

describe('debugger', () => {
	it('sendCommand delegates to cdp.send', async () => {
		const send = vi.fn(async () => ({ ok: true }));
		const ctx: any = { cdp: { send } };
		const r = await HANDLERS['debugger.sendCommand']!(ctx, [{ tabId: 1 }, 'Page.reload', { ignoreCache: true }]);
		expect(send).toHaveBeenCalledWith(1, 'Page.reload', { ignoreCache: true });
		expect(r).toEqual({ ok: true });
	});

	it('getTargets returns one target per tab', async () => {
		const ctx: any = { tabResolver: { all: () => [{ id: 1, url: 'https://x', title: 'X' }, { id: 2, url: 'https://y', title: 'Y' }] } };
		const targets = await HANDLERS['debugger.getTargets']!(ctx, undefined) as any[];
		expect(targets.length).toBe(2);
		expect(targets[0]).toMatchObject({ tabId: 1, url: 'https://x', type: 'page' });
	});

	it('sendCommand throws not_supported when cdp is null', async () => {
		const ctx: any = { cdp: null };
		await expect(HANDLERS['debugger.sendCommand']!(ctx, [{ tabId: 1 }, 'X', {}])).rejects.toMatchObject({ code: 'not_supported' });
	});
});
