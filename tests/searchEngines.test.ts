import { describe, it, expect } from 'vitest';
import { parseBang, type SearchEngine } from '@apis/searchEngines';

// Minimal mock registry interface — only what parseBang needs.
function makeRegistryMock(engines: Pick<SearchEngine, 'bang' | 'urlTemplate' | 'name'>[]) {
	const list = engines.map((e, i) => ({
		id: `id-${i}`,
		name: e.name,
		bang: e.bang,
		urlTemplate: e.urlTemplate,
		builtIn: true,
	})) as SearchEngine[];
	return {
		findByBang: (bang: string) =>
			list.find((e) => e.bang.toLowerCase() === bang.toLowerCase()),
	};
}

describe('parseBang', () => {
	const yt = { name: 'YouTube', bang: 'yt', urlTemplate: 'https://www.youtube.com/results?search_query=%s' };

	it('matches "!yt cats" → YouTube + "cats"', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('!yt cats', r)).toEqual({
			engine: expect.objectContaining({ bang: 'yt' }),
			query: 'cats',
		});
	});

	it('matches "!yt" alone → YouTube + empty query', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('!yt', r)).toEqual({
			engine: expect.objectContaining({ bang: 'yt' }),
			query: '',
		});
	});

	it('is case-insensitive for the bang', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('!YT cats', r)?.engine.bang).toBe('yt');
	});

	it('returns null for unknown bang', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('!UNKNOWN cats', r)).toBeNull();
	});

	it('returns null when bang is not at the start', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('cats !yt', r)).toBeNull();
	});

	it('treats a second `!` inside the query literally (no nesting)', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('!yt !hd cats', r)?.query).toBe('!hd cats');
	});

	it('returns null when input starts with http://', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('http://example.com/!yt', r)).toBeNull();
	});

	it('returns null when input starts with https://', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('https://example.com/!yt', r)).toBeNull();
	});

	it('returns null when input starts with data:', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('data:text/plain,!yt', r)).toBeNull();
	});

	it('returns null when input starts with javascript:', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('javascript:!yt', r)).toBeNull();
	});

	it('returns null for empty input', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('', r)).toBeNull();
	});

	it('allows leading whitespace before the bang', () => {
		const r = makeRegistryMock([yt]);
		expect(parseBang('  !yt cats', r)?.query).toBe('cats');
	});

	it('preserves trailing whitespace in the captured query (no trim)', () => {
		const r = makeRegistryMock([yt]);
		// Input "!yt  cats  " — the regex `\s+` after the bang consumes "  ",
		// captured group = "cats  " (trailing whitespace preserved).
		expect(parseBang('!yt  cats  ', r)?.query).toBe('cats  ');
	});

	it('accepts bang chars [A-Za-z0-9._-]', () => {
		const r = makeRegistryMock([
			{ name: 'WeirdBang', bang: 'w-2.x_y', urlTemplate: 'https://example.com/?q=%s' },
		]);
		expect(parseBang('!w-2.x_y foo', r)?.engine.bang).toBe('w-2.x_y');
	});
});

import { SearchEngineRegistry, BUILTIN_SEARCH_ENGINES } from '@apis/searchEngines';
import { FakeSettings } from './helpers/fakeSettings';
import type { SettingsAPI } from '@apis/settings';

function newRegistry(seed?: { search?: string; engines?: unknown; defaultId?: string }) {
	const settings = new FakeSettings();
	if (seed?.search !== undefined) settings._set('search', seed.search);
	if (seed?.engines !== undefined) settings._set('searchEngines', seed.engines);
	if (seed?.defaultId !== undefined) settings._set('defaultSearchEngineId', seed.defaultId);
	const reg = new SearchEngineRegistry(settings as unknown as SettingsAPI);
	return { reg, settings };
}

describe('SearchEngineRegistry — load and seed', () => {
	it('load() with empty settings seeds 8 built-ins with DuckDuckGo default', async () => {
		const { reg, settings } = newRegistry();
		await reg.load();
		expect(reg.list()).toHaveLength(BUILTIN_SEARCH_ENGINES.length);
		expect(reg.getDefault().bang).toBe('ddg');
		// Persisted
		expect(settings._get('searchEngines')).toHaveLength(BUILTIN_SEARCH_ENGINES.length);
		expect(settings._get('defaultSearchEngineId')).toBe(reg.getDefault().id);
	});

	it('load() migrates legacy `search` matching a built-in template → that engine becomes default', async () => {
		const { reg } = newRegistry({ search: 'https://www.google.com/search?q=%s' });
		await reg.load();
		expect(reg.getDefault().bang).toBe('g');
		expect(reg.list().some((e) => e.bang === 'ddg')).toBe(true); // full seed present
	});

	it('load() with legacy `search` matching unknown template → appends Custom + makes it default', async () => {
		const { reg } = newRegistry({ search: 'https://kagi.com/search?q=%s' });
		await reg.load();
		const def = reg.getDefault();
		expect(def.name).toBe('Custom');
		expect(def.bang).toBe('custom');
		expect(def.urlTemplate).toBe('https://kagi.com/search?q=%s');
	});

	it('load() with corrupt `searchEngines` value → backs up and reseeds', async () => {
		const { reg, settings } = newRegistry({ engines: 'not-an-array' as any });
		await reg.load();
		expect(reg.list()).toHaveLength(BUILTIN_SEARCH_ENGINES.length);
		expect(settings._get('searchEngines.backup')).toBe('not-an-array');
	});

	it('load() with missing defaultSearchEngineId → picks first engine and persists', async () => {
		const engines = BUILTIN_SEARCH_ENGINES.map((e, i) => ({ ...e, id: `seed-${i}` }));
		const { reg, settings } = newRegistry({ engines, defaultId: undefined });
		await reg.load();
		expect(reg.getDefault().id).toBe('seed-0');
		expect(settings._get('defaultSearchEngineId')).toBe('seed-0');
	});

	it('load() with defaultSearchEngineId pointing to removed engine → cascades to first', async () => {
		const engines = BUILTIN_SEARCH_ENGINES.map((e, i) => ({ ...e, id: `seed-${i}` }));
		const { reg } = newRegistry({ engines, defaultId: 'nonexistent' });
		await reg.load();
		expect(reg.getDefault().id).toBe('seed-0');
	});

	it('getDefault() before load() returns hardcoded DuckDuckGo bootstrap', () => {
		const { reg } = newRegistry();
		const d = reg.getDefault();
		expect(d.bang).toBe('ddg');
		expect(d.urlTemplate).toBe('https://duckduckgo.com/?q=%s');
		expect(d.id).toBe('__bootstrap__');
	});
});

describe('SearchEngineRegistry — mutations', () => {
	it('add() rejects template missing %s', async () => {
		const { reg } = newRegistry();
		await reg.load();
		await expect(
			reg.add({ name: 'Bad', bang: 'bad', urlTemplate: 'https://example.com/' }),
		).rejects.toThrow(/%s/);
	});

	it('add() rejects duplicate bang (case-insensitive)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		await expect(
			reg.add({ name: 'Goog', bang: 'G', urlTemplate: 'https://x/?q=%s' }),
		).rejects.toThrow(/duplicate|already/i);
	});

	it('add() returns the created engine with a uuid id', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const created = await reg.add({ name: 'Kagi', bang: 'k', urlTemplate: 'https://kagi.com/?q=%s' });
		// UUID v4 shape: 8-4-4-4-12 hex, version nibble '4', variant nibble [89ab].
		expect(created.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		expect(created.builtIn).toBe(false);
		expect(reg.list().some((e) => e.id === created.id)).toBe(true);
	});

	it('update() allows changing bang to its current value (idempotent)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const ddg = reg.list().find((e) => e.bang === 'ddg')!;
		await expect(reg.update(ddg.id, { bang: 'ddg' })).resolves.toBeUndefined();
	});

	it('update() rejects duplicate bang on a different engine', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const ddg = reg.list().find((e) => e.bang === 'ddg')!;
		await expect(reg.update(ddg.id, { bang: 'g' })).rejects.toThrow(/duplicate|already/i);
	});

	it('remove() of default cascades default to next engine', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const ddg = reg.list().find((e) => e.bang === 'ddg')!;
		await reg.remove(ddg.id);
		expect(reg.getDefault().bang).not.toBe('ddg');
		expect(reg.list().some((e) => e.id === ddg.id)).toBe(false);
	});

	it('remove() cascades reseed when list empties', async () => {
		const { reg } = newRegistry();
		await reg.load();
		for (const e of [...reg.list()]) await reg.remove(e.id);
		expect(reg.list()).toHaveLength(BUILTIN_SEARCH_ENGINES.length);
	});

	it('reset() wipes and reseeds built-ins with DuckDuckGo default', async () => {
		const { reg } = newRegistry();
		await reg.load();
		await reg.add({ name: 'Kagi', bang: 'k', urlTemplate: 'https://kagi.com/?q=%s' });
		await reg.reset();
		expect(reg.list()).toHaveLength(BUILTIN_SEARCH_ENGINES.length);
		expect(reg.getDefault().bang).toBe('ddg');
	});

	it('findByBang is case-insensitive', async () => {
		const { reg } = newRegistry();
		await reg.load();
		expect(reg.findByBang('YT')?.bang).toBe('yt');
		expect(reg.findByBang('yt')?.bang).toBe('yt');
	});

	it('onChange fires after add/update/remove/setDefault/reset', async () => {
		const { reg } = newRegistry();
		await reg.load();
		let count = 0;
		const off = reg.onChange(() => { count++; });
		const created = await reg.add({ name: 'Kagi', bang: 'k', urlTemplate: 'https://kagi.com/?q=%s' });
		await reg.update(created.id, { name: 'Kagi2' });
		await reg.setDefault(created.id);
		await reg.remove(created.id);
		await reg.reset();
		expect(count).toBe(5);
		off();
	});

	it('add() with at: "" stores at as undefined (normalized)', async () => {
		const { reg, settings } = newRegistry();
		await reg.load();
		const created = await reg.add({ name: 'NoAt', bang: 'na', at: '', urlTemplate: 'https://example.com/?q=%s' });
		expect(created.at).toBeUndefined();
		const persisted = (settings._get('searchEngines') as Array<{ at?: string }>).find((e) => (e as { name: string }).name === 'NoAt');
		expect(persisted?.at).toBeUndefined();
	});

	it('add() trims whitespace from bang and at', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const created = await reg.add({ name: 'Trimmed', bang: '  trm  ', at: '  trm-at  ', urlTemplate: 'https://example.com/?q=%s' });
		expect(created.bang).toBe('trm');
		expect(created.at).toBe('trm-at');
	});

	it('update() with at: "" clears the at field to undefined', async () => {
		const { reg } = newRegistry();
		await reg.load();
		const ddg = reg.list().find((e) => e.bang === 'ddg')!;
		expect(ddg.at).toBe('ddg');
		await reg.update(ddg.id, { at: '' });
		const refreshed = reg.list().find((e) => e.id === ddg.id);
		expect(refreshed?.at).toBeUndefined();
	});

	it('findByAt("") returns undefined (does not match engines with empty at)', async () => {
		const { reg } = newRegistry();
		await reg.load();
		expect(reg.findByAt('')).toBeUndefined();
	});
});
