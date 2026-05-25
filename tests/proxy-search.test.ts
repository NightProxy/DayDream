import { describe, it, expect, beforeEach } from 'vitest';
// We test search() in isolation by extracting it into a helper-shaped function
// that mirrors the production body. The actual Proxy class pulls in BareMux +
// SW registration which is unsuitable for unit tests. The test asserts the
// *contract* — bang routing, default routing, URL passthrough — and the
// production Proxy.search() calls the same helper.
import { SearchEngineRegistry, searchImpl } from '@apis/searchEngines';
import { FakeSettings } from './helpers/fakeSettings';
import type { SettingsAPI } from '@apis/settings';

describe('proxy.search() via searchImpl', () => {
	let registry: SearchEngineRegistry;
	beforeEach(async () => {
		registry = new SearchEngineRegistry(new FakeSettings() as unknown as SettingsAPI);
		await registry.load();
	});

	it('plain text → default engine search (DuckDuckGo)', () => {
		expect(searchImpl('hello world', registry))
			.toBe('https://duckduckgo.com/?q=hello%20world');
	});

	it('full URL → passthrough', () => {
		expect(searchImpl('https://example.com/', registry))
			.toBe('https://example.com/');
	});

	it('bare hostname → http:// passthrough', () => {
		expect(searchImpl('example.com', registry))
			.toBe('http://example.com/');
	});

	it('bang → engine template', () => {
		expect(searchImpl('!yt cats', registry))
			.toBe('https://www.youtube.com/results?search_query=cats');
	});

	it('unknown bang → default engine search of literal string', () => {
		expect(searchImpl('!nope cats', registry))
			.toBe('https://duckduckgo.com/?q=!nope%20cats');
	});

	it('bang with empty query → engine template with empty %s', () => {
		expect(searchImpl('!yt', registry))
			.toBe('https://www.youtube.com/results?search_query=');
	});

	it('changing default engine changes plain-text routing', async () => {
		const google = registry.list().find((e) => e.bang === 'g');
		expect(google, 'expected seed list to include Google (bang `g`)').toBeDefined();
		await registry.setDefault(google!.id);
		expect(searchImpl('hello world', registry))
			.toBe('https://www.google.com/search?q=hello%20world');
	});

	it('input with dot and space → default engine search (heuristic)', () => {
		expect(searchImpl('hello.world foo', registry))
			.toBe('https://duckduckgo.com/?q=hello.world%20foo');
	});
});
