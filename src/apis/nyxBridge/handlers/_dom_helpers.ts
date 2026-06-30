
import { DDXError } from '../types';
import type { ElementHandle, TabTarget } from '../api';
import type { HandlerContext } from './index';

export function getDoc(iframe: HTMLIFrameElement): Document {
	const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
	if (!doc) throw new DDXError('frame_not_found', 'iframe has no contentDocument');
	return doc;
}

export function resolveRef(
	ctx: HandlerContext,
	target: TabTarget,
	ref: string | ElementHandle,
): Element {
	const iframe = ctx.tabResolver.resolveIframe(target.tabId);
	const doc = getDoc(iframe);
	if (typeof ref === 'string') {
		const el = doc.querySelector(ref);
		if (!el) throw new DDXError('element_not_found', `selector did not match: ${ref}`);
		return el;
	}
	if (!ctx.handleStore) throw new DDXError('not_supported', 'handleStore unavailable');
	const el = ctx.handleStore.resolve(ref);
	if (!el) throw new DDXError('element_not_found', `handle stale: ${ref.__handle}`);
	if (el.ownerDocument !== doc) throw new DDXError('element_not_found', 'handle is not in target tab');
	return el;
}

export function isVisible(el: Element): boolean {
	const win = (el.ownerDocument as Document).defaultView;
	if (!win) return false;
	const style = win.getComputedStyle(el as HTMLElement);
	if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
	const rect = (el as HTMLElement).getBoundingClientRect();
	return rect.width > 0 && rect.height > 0;
}

export function buildSelector(el: Element): string {
	const parts: string[] = [];
	let cur: Element | null = el;
	while (cur && cur.nodeType === 1 && parts.length < 8) {
		let part = cur.nodeName.toLowerCase();
		if (cur.id) {
			part += `#${cur.id}`;
			parts.unshift(part);
			break;
		}
		const cls = (cur.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
		if (cls.length) part += '.' + cls.join('.');
		const parent: Element | null = cur.parentElement;
		if (parent) {
			const curNode: Element = cur;
			const siblings: Element[] = Array.from(parent.children).filter((s: Element) => s.nodeName === curNode.nodeName);
			if (siblings.length > 1) {
				const idx = siblings.indexOf(curNode) + 1;
				part += `:nth-of-type(${idx})`;
			}
		}
		parts.unshift(part);
		cur = parent;
	}
	return parts.join(' > ');
}

const INTERACTIVE = 'a, button, input, select, textarea, label, [role], [onclick], [tabindex], [aria-pressed], [aria-checked], [aria-selected]';

export interface SnapshotEntry {
	selector: string;
	role: string;
	type?: string;
	text?: string;
	attrs: Record<string, string>;
	visible: boolean;
}

export function snapshotElements(
	doc: Document,
	opts?: { interactiveOnly?: boolean; maxElements?: number },
): SnapshotEntry[] {
	const max = opts?.maxElements ?? 1000;
	const sel = opts?.interactiveOnly === false ? '*' : INTERACTIVE;
	const els = Array.from(doc.querySelectorAll(sel)).slice(0, max);
	return els.map((el) => ({
		selector: buildSelector(el),
		role: el.getAttribute('role') ?? el.nodeName.toLowerCase(),
		type: el.getAttribute('type') ?? undefined,
		text: ((el as HTMLElement).innerText ?? '').slice(0, 200) || undefined,
		attrs: Array.from(el.attributes).reduce<Record<string, string>>((acc, a) => { acc[a.name] = a.value; return acc; }, {}),
		visible: isVisible(el),
	}));
}
