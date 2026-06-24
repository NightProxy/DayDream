import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/tabs'; // side-effect: registers
import { TabResolver } from '../../../src/apis/nyxBridge/tabResolver';

function setContentWindow(el: HTMLIFrameElement, value: unknown): void {
	Object.defineProperty(el, 'contentWindow', { value, configurable: true });
}

function makeCtx(initialTabs: Array<{ id: string; url?: string; title?: string }> = []) {
	const tabsList = [...initialTabs];
	const frameMap = new Map<string, HTMLIFrameElement>();
	for (const t of tabsList) {
		const el = document.createElement('iframe');
		el.id = `iframe-${t.id.replace('tab-', '')}`;
		frameMap.set(t.id, el);
	}
	let active: string | null = tabsList[0]?.id ?? null;
	const tabs: any = {
		frameByTabId: frameMap,
		get activeTabId() { return active; },
		set activeTabId(v: string | null) { active = v; },
		getTabById: (id: string) => tabsList.find((t) => t.id === id),
		getTabsInOrder: () => tabsList,
		selectTab: async (id: string) => { active = id; },
		createTab: async (url: string) => {
			const id = `tab-${tabsList.length + 1}`;
			tabsList.push({ id, url, title: '' });
			const el = document.createElement('iframe');
			el.id = `iframe-${tabsList.length}`;
			frameMap.set(id, el);
			active = id;
			return id;
		},
		closeTabById: async (id: string) => {
			const i = tabsList.findIndex((t) => t.id === id);
			if (i >= 0) tabsList.splice(i, 1);
			frameMap.delete(id);
		},
		closeCurrentTab: async () => {},
	};
	const proxy = {
		navigateFrame: async (_iframe: any, _url: string) => true,
		extractEncodedUrl: () => '',
	};
	const resolver = new TabResolver(tabs);
	return {
		tabResolver: resolver, handleStore: null, cdp: null,
		proxy, tabs, protocols: null, settings: null,
	} as any;
}

describe('tabs handlers', () => {
	it('tabs.getCurrent returns active tab info', async () => {
		const ctx = makeCtx([{ id: 'tab-1', url: 'https://a', title: 'A' }]);
		const res: any = await HANDLERS['tabs.getCurrent']!(ctx, undefined);
		expect(res?.url).toBe('https://a');
		expect(res?.active).toBe(true);
	});

	it('tabs.query filters by active', async () => {
		const ctx = makeCtx([{ id: 'tab-1', url: 'https://a' }, { id: 'tab-2', url: 'https://b' }]);
		const res = (await HANDLERS['tabs.query']!(ctx, { active: true })) as any[];
		expect(res.length).toBe(1);
		expect(res[0].url).toBe('https://a');
	});

	it('tabs.get returns the tab', async () => {
		const ctx = makeCtx([{ id: 'tab-1', url: 'https://a' }]);
		const n = ctx.tabResolver.toNum('tab-1');
		const res: any = await HANDLERS['tabs.get']!(ctx, n);
		expect(res.id).toBe(n);
	});

	it('tabs.create creates a new tab and returns its info', async () => {
		const ctx = makeCtx([{ id: 'tab-1' }]);
		const res: any = await HANDLERS['tabs.create']!(ctx, { url: 'https://new' });
		expect(res.url).toBe('https://new');
	});

	it('tabs.update navigates via proxy.navigateFrame when url given', async () => {
		const ctx = makeCtx([{ id: 'tab-1', url: 'https://a' }]);
		let navTo: string | null = null;
		ctx.proxy.navigateFrame = async (_i: any, url: string) => { navTo = url; return true; };
		const n = ctx.tabResolver.toNum('tab-1');
		await HANDLERS['tabs.update']!(ctx, [n, { url: 'https://b' }]);
		expect(navTo).toBe('https://b');
	});

	it('tabs.remove closes the tab', async () => {
		const ctx = makeCtx([{ id: 'tab-1' }, { id: 'tab-2' }]);
		const n = ctx.tabResolver.toNum('tab-1');
		await HANDLERS['tabs.remove']!(ctx, n);
		expect(ctx.tabs.frameByTabId.has('tab-1')).toBe(false);
	});

	it('tabs.reload calls iframe.contentWindow.location.reload', async () => {
		const ctx = makeCtx([{ id: 'tab-1' }]);
		const iframe = ctx.tabs.frameByTabId.get('tab-1')!;
		let reloaded = false;
		setContentWindow(iframe, { location: { reload: () => { reloaded = true; } } });
		const n = ctx.tabResolver.toNum('tab-1');
		await HANDLERS['tabs.reload']!(ctx, n);
		expect(reloaded).toBe(true);
	});

	it('tabs.goBack calls iframe history.back', async () => {
		const ctx = makeCtx([{ id: 'tab-1' }]);
		const iframe = ctx.tabs.frameByTabId.get('tab-1')!;
		let backed = false;
		setContentWindow(iframe, { history: { back: () => { backed = true; } } });
		const n = ctx.tabResolver.toNum('tab-1');
		await HANDLERS['tabs.goBack']!(ctx, n);
		expect(backed).toBe(true);
	});

	it('tabs.captureVisibleTab calls Page.captureScreenshot when CDP is available', async () => {
		const ctx = makeCtx([{ id: 'tab-1' }]);
		ctx.cdp = { send: async () => ({ data: 'AAAA' }) };
		const r = await HANDLERS['tabs.captureVisibleTab']!(ctx, undefined);
		expect(typeof r).toBe('string');
		expect(r).toContain('data:image/');
	});

	it('tabs.captureVisibleTab throws not_supported when CDP unavailable', async () => {
		const ctx = makeCtx([{ id: 'tab-1' }]);
		await expect(HANDLERS['tabs.captureVisibleTab']!(ctx, undefined)).rejects.toMatchObject({ code: 'not_supported' });
	});
});
