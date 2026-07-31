import { describe, it, expect } from 'vitest';
import { TabResolver } from '../../src/apis/nyxBridge/tabResolver';

function fakeIframe(id: string): HTMLIFrameElement {
	const el = document.createElement('iframe');
	el.id = `iframe-${id.replace('tab-', '')}`;
	return el;
}

function fakeTabs(initial: Array<{ id: string; url?: string; title?: string }> = []) {
	const tabs = [...initial];
	const map = new Map<string, HTMLIFrameElement>();
	for (const t of tabs) map.set(t.id, fakeIframe(t.id));
	let active: string | null = tabs[0]?.id ?? null;
	return {
		frameByTabId: map,
		// Getter so callers see the live value after selectTab.
		get activeTabId() { return active; },
		set activeTabId(v: string | null) { active = v; },
		getTabById: (id: string) => tabs.find((t) => t.id === id),
		getTabsInOrder: () => tabs,
		selectTab: async (id: string) => { active = id; },
		createTab: async (url: string) => {
			const id = `tab-${tabs.length + 1}`;
			tabs.push({ id, url, title: '' });
			map.set(id, fakeIframe(id));
			return id;
		},
		closeTabById: async (id: string) => {
			const idx = tabs.findIndex((t) => t.id === id);
			if (idx >= 0) tabs.splice(idx, 1);
			map.delete(id);
		},
	};
}

describe('TabResolver', () => {
	it('assigns numeric ids stable for a tab lifetime', () => {
		const tabs = fakeTabs([{ id: 'tab-1' }, { id: 'tab-2' }]);
		const r = new TabResolver(tabs);
		const n1 = r.toNum('tab-1');
		const n2 = r.toNum('tab-2');
		expect(n1).not.toBe(n2);
		expect(r.toNum('tab-1')).toBe(n1); // stable
		expect(r.toDdxId(n1)).toBe('tab-1');
	});

	it('resolveIframe returns the right element', () => {
		const tabs = fakeTabs([{ id: 'tab-1' }]);
		const r = new TabResolver(tabs);
		const n = r.toNum('tab-1');
		expect(r.resolveIframe(n)).toBe(tabs.frameByTabId.get('tab-1'));
	});

	it('throws tab_not_found for unknown id', () => {
		const tabs = fakeTabs([{ id: 'tab-1' }]);
		const r = new TabResolver(tabs);
		expect(() => r.resolveIframe(99999)).toThrow(/tab_not_found|not found/i);
	});

	it('ensureActive switches the tab if needed', async () => {
		const tabs = fakeTabs([{ id: 'tab-1' }, { id: 'tab-2' }]);
		const r = new TabResolver(tabs);
		const n = r.toNum('tab-2');
		await r.ensureActive(n);
		expect(tabs.activeTabId).toBe('tab-2');
	});

	it('getCurrentNum returns the active tab number', () => {
		const tabs = fakeTabs([{ id: 'tab-1' }, { id: 'tab-2' }]);
		const r = new TabResolver(tabs);
		const n1 = r.toNum('tab-1');
		expect(r.getCurrentNum()).toBe(n1);
	});

	it('info returns TabInfo shape', () => {
		const tabs = fakeTabs([{ id: 'tab-1', url: 'https://x', title: 'X' }]);
		const r = new TabResolver(tabs);
		const n = r.toNum('tab-1');
		const info = r.info(n);
		expect(info.id).toBe(n);
		expect(info.url).toBe('https://x');
		expect(info.title).toBe('X');
		expect(info.active).toBe(true);
	});
});
