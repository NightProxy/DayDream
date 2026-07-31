import { describe, it, expect, beforeEach } from 'vitest';
import { CachePolicyRegistry } from '@apis/cachePlugins/registry';

/**
 * Minimal duck-typed SettingsAPI replacement for tests. The registry
 * only ever calls `getItem` / `setItem`, so we don't need NightFS / OPFS
 * to exercise the policy logic.
 */
function makeSettings(): {
	getItem: (k: string) => Promise<unknown>;
	setItem: (k: string, v: unknown) => Promise<unknown>;
	store: Record<string, unknown>;
} {
	const store: Record<string, unknown> = {};
	return {
		store,
		getItem: async (k: string) => store[k] ?? null,
		setItem: async (k: string, v: unknown) => {
			store[k] = v;
			return v;
		}
	};
}

function makeRegistry() {
	const settings = makeSettings();
	// `as any` bridge — we duck-type SettingsAPI (only getItem/setItem
	// are used) and the registry doesn't care about the rest.
	const registry = new CachePolicyRegistry(settings as any);
	return { registry, settings };
}

describe('CachePolicyRegistry — defaults', () => {
	let r: { registry: CachePolicyRegistry; settings: ReturnType<typeof makeSettings> };
	beforeEach(() => {
		r = makeRegistry();
	});

	it('seeds a catch-all default policy on first run', async () => {
		await r.registry.ready();
		const list = r.registry.list();
		expect(list.length).toBe(1);
		expect(list[0]!.id).toBe('default');
		expect(list[0]!.hostPatterns).toEqual(['*']);
		expect(list[0]!.enabled).toBe(true);
	});

	it('persists the default to settings', async () => {
		await r.registry.ready();
		expect(r.settings.store['cachePolicies']).toBeDefined();
	});

	it('global enabled defaults to true', async () => {
		await r.registry.ready();
		expect(r.registry.isEnabled()).toBe(true);
	});
});

describe('CachePolicyRegistry — policyFor', () => {
	it('catch-all matches any host', async () => {
		const { registry } = makeRegistry();
		await registry.ready();
		expect(registry.policyFor('https://example.com/foo')?.id).toBe('default');
		expect(registry.policyFor('https://api.github.com/')?.id).toBe('default');
	});

	it('more specific policy wins over the catch-all', async () => {
		const { registry } = makeRegistry();
		await registry.ready();
		await registry.register({
			id: 'gh',
			hostPatterns: ['*.github.com'],
			cacheName: 'gh-cache'
		});
		const winner = registry.policyFor('https://api.github.com/');
		expect(winner?.id).toBe('gh');
		// non-matching URL still falls through to default
		const fallback = registry.policyFor('https://example.com/');
		expect(fallback?.id).toBe('default');
	});

	it('exact-match beats wildcard at same label depth', async () => {
		const { registry } = makeRegistry();
		await registry.ready();
		await registry.register({
			id: 'gh-wild',
			hostPatterns: ['*.github.com'],
			cacheName: 'a'
		});
		await registry.register({
			id: 'gh-exact',
			hostPatterns: ['github.com'],
			cacheName: 'b'
		});
		expect(registry.policyFor('https://github.com/')?.id).toBe('gh-exact');
		// And subdomain still goes to wildcard
		expect(registry.policyFor('https://api.github.com/')?.id).toBe('gh-wild');
	});

	it('disabled policy still wins by specificity (negative rule)', async () => {
		const { registry } = makeRegistry();
		await registry.ready();
		await registry.register({
			id: 'no-bank',
			hostPatterns: ['*.bank.com', 'chase.com'],
			cacheName: 'unused',
			enabled: false
		});
		const p = registry.policyFor('https://chase.com/');
		expect(p?.id).toBe('no-bank');
		expect(p?.enabled).toBe(false);
	});

	it('returns null for an unparseable URL', async () => {
		const { registry } = makeRegistry();
		await registry.ready();
		expect(registry.policyFor('not a url')).toBe(null);
	});
});

describe('CachePolicyRegistry — register/unregister', () => {
	it('register is idempotent on id (replaces)', async () => {
		const { registry } = makeRegistry();
		await registry.ready();
		await registry.register({
			id: 'x',
			hostPatterns: ['a.com'],
			cacheName: 'one'
		});
		await registry.register({
			id: 'x',
			hostPatterns: ['b.com'],
			cacheName: 'two'
		});
		expect(registry.list().length).toBe(2); // default + x
		expect(registry.get('x')?.cacheName).toBe('two');
		expect(registry.get('x')?.hostPatterns).toEqual(['b.com']);
	});

	it('unregister returns false for unknown id', async () => {
		const { registry } = makeRegistry();
		await registry.ready();
		expect(await registry.unregister('not-a-thing')).toBe(false);
	});

	it('unregister removes the policy', async () => {
		const { registry } = makeRegistry();
		await registry.ready();
		await registry.register({
			id: 'temp',
			hostPatterns: ['x.com'],
			cacheName: 'tmp'
		});
		expect(await registry.unregister('temp')).toBe(true);
		expect(registry.get('temp')).toBe(null);
	});
});

describe('CachePolicyRegistry — global gate', () => {
	it('setEnabled persists', async () => {
		const { registry, settings } = makeRegistry();
		await registry.ready();
		await registry.setEnabled(false);
		expect(registry.isEnabled()).toBe(false);
		expect(settings.store['cacheEnabled']).toBe(false);
		await registry.setEnabled(true);
		expect(registry.isEnabled()).toBe(true);
	});
});
