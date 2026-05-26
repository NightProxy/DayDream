import { describe, it, expect } from 'vitest';
import { SearchEngineRegistry, BUILTIN_SEARCH_ENGINES } from '@apis/searchEngines';
import { FakeSettings } from './helpers/fakeSettings';
import type { SettingsAPI } from '@apis/settings';

function newRegistry(seed?: { engines?: unknown; defaultId?: string }) {
	const settings = new FakeSettings();
	if (seed?.engines !== undefined) settings._set('searchEngines', seed.engines);
	if (seed?.defaultId !== undefined) settings._set('defaultSearchEngineId', seed.defaultId);
	const reg = new SearchEngineRegistry(settings as unknown as SettingsAPI);
	return { reg, settings };
}

describe('SearchEngineRegistry — at field', () => {
	it('load() seeds built-ins with the at field populated', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const ddg = reg.list().find((e) => e.bang === 'ddg');
		expect(ddg?.at).toBe('ddg');
		const google = reg.list().find((e) => e.bang === 'g');
		expect(google?.at).toBe('google');
	});

	it('migration-safe: engines persisted without `at` still load', async () => {
		const legacyEngines = BUILTIN_SEARCH_ENGINES.map((e, i) => ({
			id: `legacy-${i}`,
			name: e.name,
			bang: e.bang,
			urlTemplate: e.urlTemplate,
			builtIn: e.builtIn,
		}));
		const { reg } = newRegistry({ engines: legacyEngines, defaultId: 'legacy-0' });
		await reg.load();
		expect(reg.list()).toHaveLength(BUILTIN_SEARCH_ENGINES.length);
		const ddg = reg.list().find((e) => e.bang === 'ddg');
		expect(ddg?.at).toBeUndefined();
	});

	it('add() with both bang and at succeeds', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const created = await reg.add({ name: 'Kagi', bang: 'k', at: 'kagi', urlTemplate: 'https://kagi.com/?q=%s' });
		expect(created.bang).toBe('k');
		expect(created.at).toBe('kagi');
	});

	it('add() with neither bang nor at rejects', async () => {
		const { reg } = newRegistry();
		await reg.load();
		await expect(
			reg.add({ name: 'Bad', bang: '', at: '', urlTemplate: 'https://x.com/?q=%s' }),
		).rejects.toThrow(/at least one/i);
	});

	it('add() with only bang succeeds (at optional)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const created = await reg.add({ name: 'BangOnly', bang: 'bo', urlTemplate: 'https://x.com/?q=%s' });
		expect(created.at).toBeUndefined();
	});

	it('add() with only at succeeds (bang optional)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const created = await reg.add({ name: 'AtOnly', bang: '', at: 'at-only', urlTemplate: 'https://x.com/?q=%s' });
		expect(created.bang).toBe('');
		expect(created.at).toBe('at-only');
	});

	it('add() rejects duplicate at (case-insensitive)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		await expect(
			reg.add({ name: 'Goog2', bang: 'g2', at: 'GOOGLE', urlTemplate: 'https://x.com/?q=%s' }),
		).rejects.toThrow(/duplicate|already/i);
	});

	it('at namespace is independent from bang namespace', async () => {
		const { reg } = newRegistry();
		await reg.load();
		// Add an engine whose `at` matches an existing engine's `bang` (g).
		// Should succeed because the namespaces are independent.
		const created = await reg.add({
			name: 'YT Alt',
			bang: 'yt2',
			at: 'g',          // same as Google's bang, but Google's `at` is 'google'
			urlTemplate: 'https://example.com/?q=%s',
		});
		expect(created.at).toBe('g');
	});

	it('update() allows changing at to its current value (idempotent)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const ddg = reg.list().find((e) => e.bang === 'ddg')!;
		await expect(reg.update(ddg.id, { at: 'ddg' })).resolves.toBeUndefined();
	});

	it('findByAt returns the engine for a known at key', async () => {
		const { reg } = newRegistry();
		await reg.load();
		expect(reg.findByAt('google')?.bang).toBe('g');
	});

	it('findByAt is case-insensitive', async () => {
		const { reg } = newRegistry();
		await reg.load();
		expect(reg.findByAt('GOOGLE')?.bang).toBe('g');
	});

	it('findByAt returns undefined for unknown key', async () => {
		const { reg } = newRegistry();
		await reg.load();
		expect(reg.findByAt('nope')).toBeUndefined();
	});
});
