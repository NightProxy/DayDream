import { describe, it, expect, vi } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/cookies';

function ctxWithCdp(sendImpl: (method: string, params: any) => any) {
	const cdp = { send: vi.fn(async (_t: any, m: string, p: any) => sendImpl(m, p)) };
	return {
		tabResolver: { getCurrentNum: () => 1, resolveIframe: () => null, ensureActive: async () => {} },
		handleStore: null, cdp, proxy: null, tabs: null, protocols: null, settings: null,
	} as any;
}

describe('cookies handlers', () => {
	it('get returns single cookie', async () => {
		const ctx = ctxWithCdp((m) => m === 'Network.getCookies' ? { cookies: [{ name: 'x', value: 'v', domain: 'd', path: '/', secure: false, httpOnly: false }] } : {});
		const r = await HANDLERS['cookies.get']!(ctx, { url: 'https://d/', name: 'x' });
		expect(r).toMatchObject({ name: 'x' });
	});

	it('getAll returns array', async () => {
		const ctx = ctxWithCdp(() => ({ cookies: [{ name: 'a', value: '1', domain: 'd', path: '/', secure: false, httpOnly: false }] }));
		const r = (await HANDLERS['cookies.getAll']!(ctx, { url: 'https://d/' })) as any[];
		expect(r.length).toBe(1);
	});

	it('set returns the cookie back', async () => {
		const ctx = ctxWithCdp((m) => m === 'Network.setCookies' ? {} : { cookies: [{ name: 'x', value: 'v', domain: 'd', path: '/', secure: false, httpOnly: false }] });
		const r = await HANDLERS['cookies.set']!(ctx, { url: 'https://d/', name: 'x', value: 'v' });
		expect(r).toMatchObject({ name: 'x' });
	});

	it('remove returns identifier', async () => {
		const ctx = ctxWithCdp(() => ({}));
		const r = await HANDLERS['cookies.remove']!(ctx, { url: 'https://d/', name: 'x' });
		expect(r).toMatchObject({ url: 'https://d/', name: 'x' });
	});

	it('getAllCookieStores returns single store', async () => {
		const ctx = ctxWithCdp(() => ({}));
		const r = await HANDLERS['cookies.getAllCookieStores']!(ctx, undefined);
		expect(r).toEqual([{ id: '0', tabIds: [] }]);
	});
});
