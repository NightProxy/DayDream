import { describe, it, expect } from 'vitest';
import { HANDLERS } from '../../../src/apis/nyxBridge/handlers';
import '../../../src/apis/nyxBridge/handlers/scripting';

function ctx() {
	const iframe = document.createElement('iframe');
	document.body.appendChild(iframe);
	return {
		tabResolver: { resolveIframe: () => iframe },
	} as any;
}

describe('scripting', () => {
	it('executeScript runs func and returns result', async () => {
		const c = ctx();
		const res = await HANDLERS['scripting.executeScript']!(c, {
			target: { tabId: 1 },
			func: () => 42,
		}) as any[];
		expect(res[0].result).toBe(42);
	});
	it('executeScript rejects when files specified', async () => {
		const c = ctx();
		await expect(HANDLERS['scripting.executeScript']!(c, {
			target: { tabId: 1 },
			files: ['x.js'],
		})).rejects.toMatchObject({ code: 'not_supported' });
	});
	it('insertCSS appends a style', async () => {
		const c = ctx();
		await HANDLERS['scripting.insertCSS']!(c, { target: { tabId: 1 }, css: 'body { color: red }' });
		// A style tag should be in the iframe's head:
		const iframe = c.tabResolver.resolveIframe();
		expect(iframe.contentDocument!.head.querySelector('style')).toBeTruthy();
	});
});
