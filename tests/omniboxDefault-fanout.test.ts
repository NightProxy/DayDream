import { describe, it, expect, vi } from 'vitest';
import { renderDefaultMode, type DefaultModeDeps } from '@browser/omnibox/modes/default';

function fakeDeps(overrides: Partial<DefaultModeDeps> = {}): DefaultModeDeps {
	return {
		query: 'hello',
		searchEngines: {
			getDefault: () => ({ id: '1', name: 'DuckDuckGo', bang: 'ddg', urlTemplate: 'https://duckduckgo.com/?q=%s', builtIn: true }),
		} as any,
		tabs: { searchOpen: vi.fn().mockReturnValue([]) } as any,
		history: { searchEntries: vi.fn().mockReturnValue([]) } as any,
		bookmarks: { searchBookmarks: vi.fn().mockReturnValue([]) } as any,
		protocols: { listRoutes: vi.fn().mockReturnValue([]), navigate: vi.fn() } as any,
		fetchSuggestions: vi.fn().mockResolvedValue([]),
		signal: new AbortController().signal,
		onNavigate: vi.fn(),
		...overrides,
	};
}

describe('renderDefaultMode', () => {
	it('returns primary action row for any non-empty query', async () => {
		const result = await renderDefaultMode(fakeDeps());
		expect(result.primaryRow).toBeDefined();
		expect(result.primaryRow.label.toLowerCase()).toContain('search');
	});

	it('returns "Go to:" primary row for URL-shaped input', async () => {
		const result = await renderDefaultMode(fakeDeps({ query: 'https://example.com/' }));
		expect(result.primaryRow.label.toLowerCase()).toContain('go to');
	});

	it('aborts pending sources when signal aborts', async () => {
		const ctrl = new AbortController();
		const fetchSuggestions = vi.fn().mockImplementation((_q: string, signal: AbortSignal) => {
			return new Promise((_resolve, reject) => {
				signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
			});
		});
		const deps = fakeDeps({ signal: ctrl.signal, fetchSuggestions });
		const promise = renderDefaultMode(deps);
		ctrl.abort();
		const result = await promise;
		// Search-suggestions section should be empty (or absent) because the fetch was aborted.
		expect(result.sections.find((s) => s.id === 'search')?.rows ?? []).toEqual([]);
	});

	it('failed sources do not break other sections', async () => {
		const deps = fakeDeps({
			fetchSuggestions: vi.fn().mockRejectedValue(new Error('boom')),
			tabs: { searchOpen: vi.fn().mockReturnValue([{ tabId: 't1', title: 'Tab 1', url: 'https://x.com/', favicon: null }]) } as any,
		});
		const result = await renderDefaultMode(deps);
		expect(result.sections.find((s) => s.id === 'tabs')?.rows.length).toBe(1);
	});

	it('respects per-section caps', async () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ tabId: `t${i}`, title: `Tab ${i}`, url: 'https://x.com/', favicon: null }));
		const deps = fakeDeps({
			tabs: { searchOpen: vi.fn().mockReturnValue(many) } as any,
		});
		const result = await renderDefaultMode(deps);
		const tabsSection = result.sections.find((s) => s.id === 'tabs');
		expect(tabsSection?.rows.length).toBe(3);
		expect(tabsSection?.hasMore).toBe(true);
	});
});
