
import { register } from './index';
import { DDXError } from '../types';
import type { TabTarget } from '../api';

function need(ctx: any) {
	if (!ctx.cdp) throw new DDXError('not_supported', 'CDP unavailable');
	return ctx.cdp;
}

function encodeModifiers(mods: string[] | undefined): number {
	if (!mods) return 0;
	let m = 0;
	if (mods.includes('Alt')) m |= 1;
	if (mods.includes('Control')) m |= 2;
	if (mods.includes('Meta')) m |= 4;
	if (mods.includes('Shift')) m |= 8;
	return m;
}

register('input.keyboard.down', async (ctx, args: [TabTarget, string, { modifiers?: string[] }?]) => {
	const [target, key, opts] = args;
	await need(ctx).send(target.tabId, 'Input.dispatchKeyEvent', {
		type: 'keyDown', key, modifiers: encodeModifiers(opts?.modifiers),
	});
});

register('input.keyboard.up', async (ctx, args: [TabTarget, string]) => {
	const [target, key] = args;
	await need(ctx).send(target.tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key });
});

register('input.keyboard.press', async (ctx, args: [TabTarget, string, { modifiers?: string[] }?]) => {
	const [target, key, opts] = args;
	const cdp = need(ctx);
	const mods = encodeModifiers(opts?.modifiers);
	await cdp.send(target.tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers: mods });
	await cdp.send(target.tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers: mods });
});

register('input.keyboard.type', async (ctx, args: [TabTarget, string, { delay?: number }?]) => {
	const [target, text, opts] = args;
	const cdp = need(ctx);
	for (const ch of text) {
		await cdp.send(target.tabId, 'Input.insertText', { text: ch });
		if (opts?.delay) await new Promise((r) => setTimeout(r, opts.delay));
	}
});

register('input.mouse.move', async (ctx, args: [TabTarget, number, number]) => {
	const [target, x, y] = args;
	await need(ctx).send(target.tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
});

register('input.mouse.down', async (ctx, args: [TabTarget, { button?: string }?]) => {
	const [target, opts] = args;
	await need(ctx).send(target.tabId, 'Input.dispatchMouseEvent', {
		type: 'mousePressed', button: opts?.button ?? 'left', clickCount: 1, x: 0, y: 0,
	});
});

register('input.mouse.up', async (ctx, args: [TabTarget, { button?: string }?]) => {
	const [target, opts] = args;
	await need(ctx).send(target.tabId, 'Input.dispatchMouseEvent', {
		type: 'mouseReleased', button: opts?.button ?? 'left', clickCount: 1, x: 0, y: 0,
	});
});

register('input.mouse.click', async (ctx, args: [TabTarget, number, number, { button?: string; clickCount?: number }?]) => {
	const [target, x, y, opts] = args;
	const cdp = need(ctx);
	const button = opts?.button ?? 'left';
	const count = opts?.clickCount ?? 1;
	await cdp.send(target.tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', button, clickCount: count, x, y });
	await cdp.send(target.tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', button, clickCount: count, x, y });
});

register('input.mouse.wheel', async (ctx, args: [TabTarget, number, number]) => {
	const [target, dx, dy] = args;
	await need(ctx).send(target.tabId, 'Input.dispatchMouseEvent', {
		type: 'mouseWheel', x: 0, y: 0, deltaX: dx, deltaY: dy,
	});
});
