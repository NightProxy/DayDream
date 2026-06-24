// src/apis/nyxBridge/handlers/dom.ts
//
// dom.* handlers. Read methods come first; interact methods are appended
// in Task 5.3.

import { register } from './index';
import { getDoc, resolveRef, isVisible, snapshotElements } from './_dom_helpers';
import type { TabTarget, ElementHandle } from '../api';

function unpack2<A, B>(args: unknown): [A, B] {
	if (Array.isArray(args)) return [args[0] as A, args[1] as B];
	const o = args as any;
	return [o.target ?? o[0], o.ref ?? o.selector ?? o[1]];
}

function unpack3<A, B, C>(args: unknown): [A, B, C] {
	if (Array.isArray(args)) return [args[0] as A, args[1] as B, args[2] as C];
	const o = args as any;
	return [o.target ?? o[0], o.ref ?? o.selector ?? o[1], o.name ?? o.text ?? o.value ?? o[2]];
}

register('dom.readPage', async (ctx, args: [TabTarget, { interactiveOnly?: boolean; maxElements?: number }?] | TabTarget) => {
	const [target, opts] = Array.isArray(args)
		? [args[0], args[1]]
		: [args as TabTarget, undefined];
	const iframe = ctx.tabResolver.resolveIframe(target.tabId);
	const doc = getDoc(iframe);
	return {
		url: iframe.contentWindow?.location.href ?? iframe.src,
		title: doc.title,
		text: (doc.body?.innerText ?? '').slice(0, 50_000),
		elements: snapshotElements(doc, opts),
	};
});

register('dom.querySelector', async (ctx, args) => {
	const [target, sel] = unpack2<TabTarget, string>(args);
	const iframe = ctx.tabResolver.resolveIframe(target.tabId);
	const el = getDoc(iframe).querySelector(sel);
	if (!el || !ctx.handleStore) return null;
	return ctx.handleStore.create(target.tabId, el);
});

register('dom.querySelectorAll', async (ctx, args) => {
	const [target, sel] = unpack2<TabTarget, string>(args);
	const iframe = ctx.tabResolver.resolveIframe(target.tabId);
	const list = Array.from(getDoc(iframe).querySelectorAll(sel));
	if (!ctx.handleStore) return [];
	return list.map((el) => ctx.handleStore!.create(target.tabId, el));
});

register('dom.getText', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	const el = resolveRef(ctx, target, ref) as HTMLElement;
	return el.innerText ?? el.textContent ?? '';
});

register('dom.getAttribute', async (ctx, args) => {
	const [target, ref, name] = unpack3<TabTarget, string | ElementHandle, string>(args);
	const el = resolveRef(ctx, target, ref);
	return el.getAttribute(name);
});

register('dom.getValue', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	const el = resolveRef(ctx, target, ref) as HTMLInputElement;
	return el.value ?? '';
});

register('dom.getOuterHTML', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	return resolveRef(ctx, target, ref).outerHTML;
});

register('dom.getInnerHTML', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	return resolveRef(ctx, target, ref).innerHTML;
});

register('dom.boundingBox', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	const el = resolveRef(ctx, target, ref) as HTMLElement;
	const r = el.getBoundingClientRect();
	if (!r.width && !r.height) return null;
	return { x: r.x, y: r.y, width: r.width, height: r.height };
});

register('dom.isVisible', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	return isVisible(resolveRef(ctx, target, ref));
});

register('dom.openOrClosedShadowRoot', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	const el = resolveRef(ctx, target, ref);
	const root = (el as any).shadowRoot ?? (el as any).openOrClosedShadowRoot?.();
	if (!root || !ctx.handleStore) return null;
	return ctx.handleStore.create(target.tabId, root as Element);
});

// ── Interact handlers ───────────────────────────────────────────────

import { DDXError } from '../types';

function dispatchMouseEvent(el: Element, type: string, opts: Partial<MouseEventInit> = {}) {
	const win = (el.ownerDocument as Document).defaultView!;
	const ev = new win.MouseEvent(type, { bubbles: true, cancelable: true, view: win, ...opts });
	el.dispatchEvent(ev);
}

function dispatchKeyEvent(el: Element, type: string, key: string, opts: Partial<KeyboardEventInit> = {}) {
	const win = (el.ownerDocument as Document).defaultView!;
	const ev = new win.KeyboardEvent(type, { bubbles: true, cancelable: true, key, ...opts });
	el.dispatchEvent(ev);
}

register('dom.click', async (ctx, args) => {
	const [target, ref, opts] = unpack3<TabTarget, string | ElementHandle, { clickCount?: number } | undefined>(args);
	const el = resolveRef(ctx, target, ref);
	const count = opts?.clickCount ?? 1;
	for (let i = 0; i < count; i++) {
		dispatchMouseEvent(el, 'mousedown');
		dispatchMouseEvent(el, 'mouseup');
		(el as HTMLElement).click();
	}
});

register('dom.dblclick', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	const el = resolveRef(ctx, target, ref);
	dispatchMouseEvent(el, 'dblclick');
});

register('dom.hover', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	const el = resolveRef(ctx, target, ref);
	dispatchMouseEvent(el, 'mouseover');
	dispatchMouseEvent(el, 'mousemove');
});

register('dom.type', async (ctx, args) => {
	const arr = Array.isArray(args) ? args : null;
	const target = (arr ? arr[0] : (args as any).target) as TabTarget;
	const ref = (arr ? arr[1] : (args as any).ref) as string | ElementHandle;
	const text = (arr ? arr[2] : (args as any).text) as string;
	const opts = (arr ? arr[3] : (args as any).opts) as { delay?: number; clear?: boolean } | undefined;
	const el = resolveRef(ctx, target, ref);
	const win = (el.ownerDocument as Document).defaultView!;
	if (el instanceof win.HTMLInputElement || el instanceof win.HTMLTextAreaElement) {
		if (opts?.clear) el.value = '';
		el.value = (el.value ?? '') + String(text);
		el.dispatchEvent(new win.Event('input', { bubbles: true }));
		el.dispatchEvent(new win.Event('change', { bubbles: true }));
	} else {
		(el as HTMLElement).focus();
		for (const ch of String(text)) {
			dispatchKeyEvent(el, 'keydown', ch);
			dispatchKeyEvent(el, 'keypress', ch);
			(el as HTMLElement).textContent = ((el as HTMLElement).textContent ?? '') + ch;
			dispatchKeyEvent(el, 'keyup', ch);
		}
		el.dispatchEvent(new win.Event('input', { bubbles: true }));
	}
});

register('dom.press', async (ctx, args) => {
	const [target, ref, key] = unpack3<TabTarget, string | ElementHandle, string>(args);
	const el = resolveRef(ctx, target, ref);
	dispatchKeyEvent(el, 'keydown', key);
	dispatchKeyEvent(el, 'keypress', key);
	dispatchKeyEvent(el, 'keyup', key);
});

register('dom.select', async (ctx, args) => {
	const [target, ref, value] = unpack3<TabTarget, string | ElementHandle, string | string[]>(args);
	const el = resolveRef(ctx, target, ref) as HTMLSelectElement;
	const win = (el.ownerDocument as Document).defaultView!;
	if (Array.isArray(value)) {
		for (const opt of Array.from(el.options)) opt.selected = value.includes(opt.value);
	} else {
		el.value = value;
	}
	el.dispatchEvent(new win.Event('change', { bubbles: true }));
});

register('dom.check', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	const el = resolveRef(ctx, target, ref) as HTMLInputElement;
	const win = (el.ownerDocument as Document).defaultView!;
	if (!el.checked) {
		el.checked = true;
		el.dispatchEvent(new win.Event('change', { bubbles: true }));
	}
});

register('dom.uncheck', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	const el = resolveRef(ctx, target, ref) as HTMLInputElement;
	const win = (el.ownerDocument as Document).defaultView!;
	if (el.checked) {
		el.checked = false;
		el.dispatchEvent(new win.Event('change', { bubbles: true }));
	}
});

register('dom.focus', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	(resolveRef(ctx, target, ref) as HTMLElement).focus();
});

register('dom.blur', async (ctx, args) => {
	const [target, ref] = unpack2<TabTarget, string | ElementHandle>(args);
	(resolveRef(ctx, target, ref) as HTMLElement).blur();
});

register('dom.scroll', async (ctx, args) => {
	const [target, ref, opts] = unpack3<TabTarget, string | ElementHandle, { x?: number; y?: number; intoView?: boolean } | undefined>(args);
	const el = resolveRef(ctx, target, ref) as HTMLElement;
	if (opts?.intoView) {
		el.scrollIntoView({ behavior: 'auto', block: 'center' });
	} else if (opts) {
		el.scrollTo({ left: opts.x ?? el.scrollLeft, top: opts.y ?? el.scrollTop });
	}
});

register('dom.dragAndDrop', async (ctx, args) => {
	const arr = Array.isArray(args) ? args : null;
	const target = (arr ? arr[0] : (args as any).target) as TabTarget;
	const source = (arr ? arr[1] : (args as any).source) as string | ElementHandle;
	const dest = (arr ? arr[2] : (args as any).dest) as string | ElementHandle;
	const src = resolveRef(ctx, target, source);
	const dst = resolveRef(ctx, target, dest);
	dispatchMouseEvent(src, 'mousedown');
	dispatchMouseEvent(src, 'mousemove');
	dispatchMouseEvent(dst, 'mousemove');
	dispatchMouseEvent(dst, 'mouseup');
	const srcWin = (src.ownerDocument as Document).defaultView!;
	const dstWin = (dst.ownerDocument as Document).defaultView!;
	src.dispatchEvent(new srcWin.DragEvent('dragstart', { bubbles: true }));
	dst.dispatchEvent(new dstWin.DragEvent('drop', { bubbles: true }));
});

register('dom.uploadFile', async (ctx, args: [TabTarget, string | ElementHandle, Array<{ name: string; mimeType: string; data: string }>]) => {
	if (!ctx.cdp) throw new DDXError('not_supported', 'CDP unavailable');
	const [target, ref, files] = args;
	const el = resolveRef(ctx, target, ref) as HTMLElement;
	const docRes = await ctx.cdp.send(target.tabId, 'DOM.getDocument', {}) as { root: { nodeId: number } };
	const selector = typeof ref === 'string' ? ref : `[data-nyx-handle="${(ref as ElementHandle).__handle}"]`;
	if (typeof ref !== 'string') el.setAttribute('data-nyx-handle', (ref as ElementHandle).__handle);
	const qs = await ctx.cdp.send(target.tabId, 'DOM.querySelector', { nodeId: docRes.root.nodeId, selector }) as { nodeId: number };
	const filePaths: string[] = [];
	for (const f of files) {
		const blob = await (await fetch(`data:${f.mimeType};base64,${f.data}`)).blob();
		const url = URL.createObjectURL(new File([blob], f.name, { type: f.mimeType }));
		filePaths.push(url);
	}
	await ctx.cdp.send(target.tabId, 'DOM.setFileInputFiles', { nodeId: qs.nodeId, files: filePaths });
});
