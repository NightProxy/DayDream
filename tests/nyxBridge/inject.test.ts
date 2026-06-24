import { describe, it, expect, vi, afterEach } from 'vitest';
import { NyxBridge } from '../../src/apis/nyxBridge';

describe('NyxBridge.init() registers client injection', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('registers a scriptInjectionRegistry entry that matches Nyx origins', async () => {
		const registered: any[] = [];
		vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(
			new Response('console.log("stub client");') as any,
		);
		const bridge = new NyxBridge({
			scriptInjectionRegistry: {
				register: (e) => registered.push(e),
				unregister: () => false,
			},
			tabs: {} as any,
			proxy: {} as any,
			settings: { getItem: async () => null } as any,
		});
		await bridge.init();

		expect(registered.length).toBe(1);
		expect(registered[0].id).toBe('nyx-bridge-client');
		expect(registered[0].match(new URL('https://nyx.night-x.com/'))).toBe(true);
		expect(registered[0].match(new URL('https://nyx.ampscat.dev/chat'))).toBe(true);
		expect(registered[0].match(new URL('https://example.com/'))).toBe(false);

		expect(registered[0].scripts.length).toBe(1);
		expect(registered[0].scripts[0].kind).toBe('inline');
		expect(registered[0].scripts[0].code).toContain('__NYX_HOST_MARKER');
		expect(registered[0].scripts[0].code).toContain('console.log("stub client")');
	});

	it('skips registration if fetch fails', async () => {
		const registered: any[] = [];
		vi.spyOn(globalThis, 'fetch' as any).mockRejectedValue(new Error('404'));
		const bridge = new NyxBridge({
			scriptInjectionRegistry: {
				register: (e) => registered.push(e),
				unregister: () => false,
			},
			tabs: {} as any,
			proxy: {} as any,
			settings: { getItem: async () => null } as any,
		});
		await bridge.init();
		expect(registered.length).toBe(0);
	});
});
