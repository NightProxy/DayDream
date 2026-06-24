import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/webNavigation'; // side-effect: registers
import { TabResolver } from '../../../src/apis/nyxBridge/tabResolver';
import { HandleStore } from '../../../src/apis/nyxBridge/handleStore';

function makeCtx() {
	document.body.innerHTML = '';
	const iframe = document.createElement('iframe');
	iframe.id = 'iframe-1';
	document.body.appendChild(iframe);
	const doc = iframe.contentDocument!;
	const tabsList = [{ id: 'tab-1', url: 'about:blank', title: '' }];
	const tabs: any = {
		frameByTabId: new Map([['tab-1', iframe]]),
		activeTabId: 'tab-1',
		getTabById: (id: string) => tabsList.find((t) => t.id === id),
		getTabsInOrder: () => tabsList,
		selectTab: async () => {},
		createTab: async () => 'tab-1',
		closeTabById: async () => {},
	};
	const resolver = new TabResolver(tabs);
	const handleStore = new HandleStore();
	return {
		ctx: {
			tabResolver: resolver,
			handleStore,
			cdp: null,
			proxy: { eval: async () => true },
			tabs,
			protocols: null,
			settings: null,
		} as any,
		tabNum: resolver.toNum('tab-1'),
		iframe,
		doc,
	};
}

describe('webNavigation handlers', () => {
	it('waitForLoad resolves when readyState is complete', async () => {
		const { ctx, tabNum, iframe } = makeCtx();
		Object.defineProperty(iframe.contentDocument!, 'readyState', { configurable: true, get: () => 'complete' });
		const res = await HANDLERS['webNavigation.waitForLoad']!(ctx, [{ tabId: tabNum }, { timeout: 1000 }]);
		expect(res).toMatchObject({ url: expect.any(String) });
	});

	it('waitForSelector resolves with handle when element appears', async () => {
		const { ctx, tabNum, doc } = makeCtx();
		setTimeout(() => {
			const div = doc.createElement('div');
			div.id = 'target';
			doc.body.appendChild(div);
		}, 10);
		const res: any = await HANDLERS['webNavigation.waitForSelector']!(ctx, [{ tabId: tabNum }, '#target', { timeout: 1000 }]);
		expect(res).toMatchObject({ __handle: expect.any(String), tabId: tabNum });
	});

	it('waitForSelector times out', async () => {
		const { ctx, tabNum } = makeCtx();
		await expect(HANDLERS['webNavigation.waitForSelector']!(ctx, [{ tabId: tabNum }, '#nope', { timeout: 30 }]))
			.rejects.toMatchObject({ code: 'timeout' });
	});

	it('getFrame returns the main frame', async () => {
		const { ctx, tabNum } = makeCtx();
		const res: any = await HANDLERS['webNavigation.getFrame']!(ctx, { tabId: tabNum, frameId: 0 });
		expect(res.frameId).toBe(0);
		expect(res.parentFrameId).toBe(-1);
	});

	it('getAllFrames returns one entry (no nested traversal in v1)', async () => {
		const { ctx, tabNum } = makeCtx();
		const res: any = await HANDLERS['webNavigation.getAllFrames']!(ctx, { tabId: tabNum });
		expect(res.length).toBe(1);
	});
});
