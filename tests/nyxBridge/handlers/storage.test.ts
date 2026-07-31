import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/storage';

function ctx() {
	const iframe = document.createElement('iframe');
	document.body.appendChild(iframe);
	return {
		tabResolver: { resolveIframe: () => iframe },
		handleStore: null, cdp: null, proxy: null, tabs: null, protocols: null, settings: null,
	} as any;
}

describe('storage handlers', () => {
	it('local round trip', async () => {
		const c = ctx();
		await HANDLERS['storage.local.set']!(c, [{ tabId: 1 }, { foo: 'bar', n: 42 }]);
		const got: any = await HANDLERS['storage.local.get']!(c, [{ tabId: 1 }, ['foo', 'n']]);
		expect(got.foo).toBe('bar');
		expect(got.n).toBe('42');
		const keys = await HANDLERS['storage.local.getKeys']!(c, [{ tabId: 1 }]);
		expect(keys).toContain('foo');
		await HANDLERS['storage.local.remove']!(c, [{ tabId: 1 }, 'foo']);
		expect(await HANDLERS['storage.local.get']!(c, [{ tabId: 1 }, ['foo']])).toEqual({});
		await HANDLERS['storage.local.clear']!(c, [{ tabId: 1 }]);
		expect(await HANDLERS['storage.local.getKeys']!(c, [{ tabId: 1 }])).toEqual([]);
	});

	it('session is independent of local', async () => {
		const c = ctx();
		await HANDLERS['storage.local.set']!(c, [{ tabId: 1 }, { x: '1' }]);
		await HANDLERS['storage.session.set']!(c, [{ tabId: 1 }, { x: '2' }]);
		expect((await HANDLERS['storage.local.get']!(c, [{ tabId: 1 }, ['x']]) as any).x).toBe('1');
		expect((await HANDLERS['storage.session.get']!(c, [{ tabId: 1 }, ['x']]) as any).x).toBe('2');
	});
});
