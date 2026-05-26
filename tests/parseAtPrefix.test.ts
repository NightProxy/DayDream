import { describe, it, expect } from 'vitest';
import { parseAtPrefix, type SearchEngine, type SearchEngineRegistryReader } from '@apis/searchEngines';

function makeRegistryMock(engines: Pick<SearchEngine, 'bang' | 'at' | 'urlTemplate' | 'name'>[]): SearchEngineRegistryReader {
	const list = engines.map((e, i) => ({
		id: `id-${i}`,
		name: e.name,
		bang: e.bang,
		at: e.at,
		urlTemplate: e.urlTemplate,
		builtIn: true,
	})) as SearchEngine[];
	return {
		findByBang: (bang: string) =>
			list.find((e) => e.bang.toLowerCase() === bang.toLowerCase()),
		findByAt: (at: string) =>
			list.find((e) => e.at?.toLowerCase() === at.toLowerCase()),
	};
}

describe('parseAtPrefix', () => {
	const yt = { name: 'YouTube', bang: 'yt', at: 'yt', urlTemplate: 'https://www.youtube.com/results?search_query=%s' };

	it('matches "@yt cats" -> YouTube + "cats"', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@yt cats', r)).toEqual({
			engine: expect.objectContaining({ at: 'yt' }),
			query: 'cats',
		});
	});

	it('matches "@yt" alone -> YouTube + empty query', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@yt', r)).toEqual({
			engine: expect.objectContaining({ at: 'yt' }),
			query: '',
		});
	});

	it('is case-insensitive for the at key', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@YT cats', r)?.engine.at).toBe('yt');
	});

	it('returns null for unknown at key', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@UNKNOWN cats', r)).toBeNull();
	});

	it('returns null when @ is not at the start', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('cats @yt', r)).toBeNull();
	});

	it('treats a second `@` inside the query literally', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@yt @hd cats', r)?.query).toBe('@hd cats');
	});

	it('returns null when input starts with http://', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('http://example.com/@yt', r)).toBeNull();
	});

	it('returns null when input starts with https://', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('https://example.com/@yt', r)).toBeNull();
	});

	it('returns null when input starts with data:', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('data:text/plain,@yt', r)).toBeNull();
	});

	it('returns null when input starts with javascript:', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('javascript:@yt', r)).toBeNull();
	});

	it('returns null for empty input', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('', r)).toBeNull();
	});

	it('allows leading whitespace before the @', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('  @yt cats', r)?.query).toBe('cats');
	});

	it('preserves trailing whitespace in the captured query (no trim)', () => {
		const r = makeRegistryMock([yt]);
		expect(parseAtPrefix('@yt  cats  ', r)?.query).toBe('cats  ');
	});
});
