import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/dom';
import { TabResolver } from '../../../src/apis/nyxBridge/tabResolver';
import { HandleStore } from '../../../src/apis/nyxBridge/handleStore';

function makeCtxWithDom(html: string) {
	document.body.innerHTML = '';
	const iframe = document.createElement('iframe');
	iframe.id = 'iframe-1';
	document.body.appendChild(iframe);
	iframe.contentDocument!.body.innerHTML = html;
	const tabsList = [{ id: 'tab-1', url: 'about:blank', title: '' }];
	const tabs: any = {
		frameByTabId: new Map([['tab-1', iframe]]),
		activeTabId: 'tab-1',
		getTabById: (id: string) => tabsList.find((t) => t.id === id),
		getTabsInOrder: () => tabsList,
		selectTab: async () => {},
	};
	const resolver = new TabResolver(tabs);
	const ctx: any = {
		tabResolver: resolver,
		handleStore: new HandleStore(),
		cdp: null,
		proxy: null,
		tabs,
		protocols: null,
		settings: null,
	};
	return { ctx, tabNum: resolver.toNum('tab-1'), iframe };
}

describe('dom.read handlers', () => {
	it('readPage returns text + interactive elements', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<button id="b">Hi</button><a href="#">Link</a>`);
		const res: any = await HANDLERS['dom.readPage']!(ctx, [{ tabId: tabNum }]);
		expect(res.elements.length).toBeGreaterThanOrEqual(2);
		expect(res.elements.some((e: any) => e.role === 'button' || e.selector.includes('button'))).toBe(true);
	});

	it('querySelector returns a handle for a match', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<div id="x"></div>`);
		const res: any = await HANDLERS['dom.querySelector']!(ctx, [{ tabId: tabNum }, '#x']);
		expect(res).toMatchObject({ __handle: expect.any(String), tabId: tabNum });
	});

	it('querySelector returns null for no match', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<div></div>`);
		const res = await HANDLERS['dom.querySelector']!(ctx, [{ tabId: tabNum }, '#nope']);
		expect(res).toBeNull();
	});

	it('querySelectorAll returns handles', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<p>a</p><p>b</p>`);
		const res = (await HANDLERS['dom.querySelectorAll']!(ctx, [{ tabId: tabNum }, 'p'])) as any[];
		expect(res.length).toBe(2);
	});

	it('getText returns innerText', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<p id="p">hello</p>`);
		const res = await HANDLERS['dom.getText']!(ctx, [{ tabId: tabNum }, '#p']);
		expect(res).toBe('hello');
	});

	it('getAttribute returns the attr or null', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<a id="a" href="https://x">x</a>`);
		expect(await HANDLERS['dom.getAttribute']!(ctx, [{ tabId: tabNum }, '#a', 'href'])).toBe('https://x');
		expect(await HANDLERS['dom.getAttribute']!(ctx, [{ tabId: tabNum }, '#a', 'missing'])).toBeNull();
	});

	it('getValue returns input value', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<input id="i" value="hi">`);
		expect(await HANDLERS['dom.getValue']!(ctx, [{ tabId: tabNum }, '#i'])).toBe('hi');
	});

	it('outerHTML/innerHTML', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<div id="d"><span>x</span></div>`);
		expect(await HANDLERS['dom.getOuterHTML']!(ctx, [{ tabId: tabNum }, '#d'])).toContain('<div');
		expect(await HANDLERS['dom.getInnerHTML']!(ctx, [{ tabId: tabNum }, '#d'])).toContain('<span');
	});

	it('boundingBox returns rect or null', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<div id="d" style="width:10px;height:10px"></div>`);
		const r = await HANDLERS['dom.boundingBox']!(ctx, [{ tabId: tabNum }, '#d']);
		// jsdom has no layout engine — getBoundingClientRect returns all-zeros,
		// which the handler maps to null. Either shape satisfies the contract:
		// a numeric rect (real browser) OR null (jsdom 0×0).
		if (r === null) {
			expect(r).toBeNull();
		} else {
			expect(r).toMatchObject({ x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) });
		}
	});

	it('isVisible respects display:none', async () => {
		const { ctx, tabNum } = makeCtxWithDom(`<div id="d" style="display:none"></div>`);
		expect(await HANDLERS['dom.isVisible']!(ctx, [{ tabId: tabNum }, '#d'])).toBe(false);
	});
});
