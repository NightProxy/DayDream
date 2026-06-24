import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/dom';
import { TabResolver } from '../../../src/apis/nyxBridge/tabResolver';
import { HandleStore } from '../../../src/apis/nyxBridge/handleStore';

function ctxWithDom(html: string) {
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
	return {
		ctx: {
			tabResolver: resolver,
			handleStore: new HandleStore(),
			cdp: null,
			proxy: null,
			tabs,
			protocols: null,
			settings: null,
		} as any,
		tabNum: resolver.toNum('tab-1'),
		iframe,
	};
}

describe('dom.interact handlers', () => {
	it('click triggers a click event', async () => {
		const { ctx, tabNum, iframe } = ctxWithDom(`<button id="b">x</button>`);
		let clicked = false;
		iframe.contentDocument!.querySelector('#b')!.addEventListener('click', () => { clicked = true; });
		await HANDLERS['dom.click']!(ctx, [{ tabId: tabNum }, '#b']);
		expect(clicked).toBe(true);
	});

	it('type sets value and dispatches input event', async () => {
		const { ctx, tabNum, iframe } = ctxWithDom(`<input id="i">`);
		let inputFired = false;
		iframe.contentDocument!.querySelector('#i')!.addEventListener('input', () => { inputFired = true; });
		await HANDLERS['dom.type']!(ctx, [{ tabId: tabNum }, '#i', 'hello']);
		expect((iframe.contentDocument!.querySelector('#i') as HTMLInputElement).value).toBe('hello');
		expect(inputFired).toBe(true);
	});

	it('type with clear:true wipes prior value first', async () => {
		const { ctx, tabNum, iframe } = ctxWithDom(`<input id="i" value="abc">`);
		await HANDLERS['dom.type']!(ctx, [{ tabId: tabNum }, '#i', 'X', { clear: true }]);
		expect((iframe.contentDocument!.querySelector('#i') as HTMLInputElement).value).toBe('X');
	});

	it('select sets <select> value', async () => {
		const { ctx, tabNum, iframe } = ctxWithDom(`<select id="s"><option value="a">A</option><option value="b">B</option></select>`);
		await HANDLERS['dom.select']!(ctx, [{ tabId: tabNum }, '#s', 'b']);
		expect((iframe.contentDocument!.querySelector('#s') as HTMLSelectElement).value).toBe('b');
	});

	it('check / uncheck toggle a checkbox', async () => {
		const { ctx, tabNum, iframe } = ctxWithDom(`<input id="c" type="checkbox">`);
		await HANDLERS['dom.check']!(ctx, [{ tabId: tabNum }, '#c']);
		expect((iframe.contentDocument!.querySelector('#c') as HTMLInputElement).checked).toBe(true);
		await HANDLERS['dom.uncheck']!(ctx, [{ tabId: tabNum }, '#c']);
		expect((iframe.contentDocument!.querySelector('#c') as HTMLInputElement).checked).toBe(false);
	});

	it('focus / blur', async () => {
		const { ctx, tabNum, iframe } = ctxWithDom(`<input id="i"><input id="j">`);
		await HANDLERS['dom.focus']!(ctx, [{ tabId: tabNum }, '#i']);
		expect(iframe.contentDocument!.activeElement?.id).toBe('i');
		await HANDLERS['dom.blur']!(ctx, [{ tabId: tabNum }, '#i']);
		expect(iframe.contentDocument!.activeElement?.id).not.toBe('i');
	});

	it('uploadFile throws not_supported when CDP unavailable', async () => {
		const { ctx, tabNum } = ctxWithDom(`<input id="i" type="file">`);
		await expect(HANDLERS['dom.uploadFile']!(ctx, [{ tabId: tabNum }, '#i', []])).rejects.toMatchObject({ code: 'not_supported' });
	});

	it('uploadFile attempts CDP DOM.getDocument when CDP available', async () => {
		const { ctx, tabNum } = ctxWithDom(`<input id="i" type="file">`);
		const calls: string[] = [];
		ctx.cdp = {
			send: async (_t: any, method: string, _p: any) => {
				calls.push(method);
				if (method === 'DOM.getDocument') return { root: { nodeId: 1 } };
				if (method === 'DOM.querySelector') return { nodeId: 2 };
				return {};
			},
		};
		// No files → no fetch calls needed
		await HANDLERS['dom.uploadFile']!(ctx, [{ tabId: tabNum }, '#i', []]);
		expect(calls).toEqual(['DOM.getDocument', 'DOM.querySelector', 'DOM.setFileInputFiles']);
	});
});
