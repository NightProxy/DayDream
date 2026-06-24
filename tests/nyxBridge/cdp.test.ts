import { describe, it, expect } from 'vitest';
import { CdpHelper } from '../../src/apis/nyxBridge/cdp';

describe('CdpHelper', () => {
	it('round-trips a CDP request via the fake receive', async () => {
		const helper = new CdpHelper();
		const fakeWin: any = {
			__nyxBridgeReceive: (_frameId: string, payload: string) => {
				const msg = JSON.parse(payload);
				queueMicrotask(() =>
					helper.handleAgentMessage(
						'frame-1',
						{
							kind: 'cdp-out',
							frameId: 'frame-1',
							payload: JSON.stringify({ id: msg.id, result: { ok: true, echoMethod: msg.method } }),
						},
						fakeWin,
					),
				);
			},
		};
		helper.registerFrame(1, 'frame-1', fakeWin);
		const res: any = await helper.send(1, 'Network.getCookies', { urls: ['https://x'] });
		expect(res.ok).toBe(true);
		expect(res.echoMethod).toBe('Network.getCookies');
	});

	it('rejects when frame is unknown', async () => {
		const helper = new CdpHelper();
		await expect(helper.send(42, 'Network.getCookies', {})).rejects.toMatchObject({ code: 'frame_not_found' });
	});

	it('drops mapping on frame-gone', async () => {
		const helper = new CdpHelper();
		const fakeWin: any = { __nyxBridgeReceive: () => {} };
		helper.registerFrame(1, 'frame-1', fakeWin);
		helper.handleAgentMessage('frame-1', { kind: 'frame-gone', frameId: 'frame-1' }, fakeWin);
		await expect(helper.send(1, 'X', {})).rejects.toMatchObject({ code: 'frame_not_found' });
	});

	it('times out if agent never responds', async () => {
		const helper = new CdpHelper({ timeoutMs: 30 });
		const fakeWin: any = { __nyxBridgeReceive: () => {} };
		helper.registerFrame(1, 'frame-1', fakeWin);
		await expect(helper.send(1, 'X', {})).rejects.toMatchObject({ code: 'timeout' });
	});
});
