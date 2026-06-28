// src/apis/nyxBridge/tabResolver.ts
//
// Resolves between DDX's string tab IDs (`tab-1`, `tab-2`, ...) and the
// numeric IDs exposed to NyxAI through the contract (chrome.tabs-style).
// Numeric IDs are auto-assigned on first sight and stable for the
// lifetime of the underlying DDX tab.

import { DDXError } from './types';
import type { TabId, TabInfo } from './api';

interface TabRecord {
	id: string;
	url?: string;
	title?: string;
	favIconUrl?: string;
	status?: string;
	isPinned?: boolean;
	groupId?: string;
}

export interface TabsLike {
	frameByTabId: Map<string, HTMLIFrameElement>;
	activeTabId: string | null;
	getTabById(id: string): TabRecord | undefined;
	getTabsInOrder(): Array<TabRecord>;
	selectTab(id: string): Promise<unknown> | unknown;
	createTab(url: string): Promise<string | null>;
	closeTabById(id: string): Promise<unknown> | unknown;
}

// ── groupId hash helpers ────────────────────────────────────────────
//
// DDX's group IDs are strings; chrome.tabs.Tab.groupId is a number.
// We assign monotonically increasing numbers per unique string id, with
// -1 as the "no group" sentinel (TAB_GROUP_ID_NONE).
const groupIdToNum = new Map<string, number>();
const numToGroupId = new Map<number, string>();
let nextGroupNum = 1;

export function hashGroupId(s: string | undefined): number {
	if (!s) return -1;
	let n = groupIdToNum.get(s);
	if (n === undefined) {
		n = nextGroupNum++;
		groupIdToNum.set(s, n);
		numToGroupId.set(n, s);
	}
	return n;
}

export function getDdxGroupId(num: number): string | undefined {
	return numToGroupId.get(num);
}

export class TabResolver {
	private nextNum = 1;
	private numToDdx = new Map<number, string>();
	private ddxToNum = new Map<string, number>();

	constructor(private tabs: TabsLike | null) {}

	toNum(ddxId: string): TabId {
		let n = this.ddxToNum.get(ddxId);
		if (n != null) return n;
		n = this.nextNum++;
		this.numToDdx.set(n, ddxId);
		this.ddxToNum.set(ddxId, n);
		return n;
	}

	toDdxId(n: TabId): string | null {
		return this.numToDdx.get(n) ?? null;
	}

	resolveIframe(n: TabId): HTMLIFrameElement {
		if (!this.tabs) throw new DDXError('tab_not_found', 'tab_not_found: tabs API unavailable');
		const ddxId = this.toDdxId(n);
		if (!ddxId) throw new DDXError('tab_not_found', `tab_not_found: unknown tab ${n}`);
		const iframe = this.tabs.frameByTabId.get(ddxId);
		if (!iframe) throw new DDXError('tab_not_found', `tab_not_found: iframe missing for ${ddxId}`);
		return iframe;
	}

	async ensureActive(n: TabId): Promise<void> {
		if (!this.tabs) throw new DDXError('tab_not_found', 'tab_not_found: tabs API unavailable');
		const ddxId = this.toDdxId(n);
		if (!ddxId) throw new DDXError('tab_not_found', `tab_not_found: unknown tab ${n}`);
		if (this.tabs.activeTabId === ddxId) return;
		await this.tabs.selectTab(ddxId);
		await new Promise((r) => setTimeout(r, 0));
	}

	getCurrentNum(): TabId | undefined {
		if (!this.tabs?.activeTabId) return undefined;
		return this.toNum(this.tabs.activeTabId);
	}

	info(n: TabId): TabInfo {
		if (!this.tabs) throw new DDXError('tab_not_found', 'tab_not_found: tabs API unavailable');
		const ddxId = this.toDdxId(n);
		if (!ddxId) throw new DDXError('tab_not_found', `tab_not_found: unknown tab ${n}`);
		const t = this.tabs.getTabById(ddxId);
		if (!t) throw new DDXError('tab_not_found', `tab_not_found: tab data missing for ${ddxId}`);
		const order = this.tabs.getTabsInOrder();
		const idx = order.findIndex((x) => x?.id === ddxId);
		const info: TabInfo = {
			id: n,
			index: idx >= 0 ? idx : 0,
			active: this.tabs.activeTabId === ddxId,
			url: t.url,
			title: t.title,
			favIconUrl: t.favIconUrl,
			status: (t.status as TabInfo['status']) ?? 'complete',
			pinned: t.isPinned === true,
			highlighted: this.tabs.activeTabId === ddxId,
			discarded: false,
			windowId: 1,
			groupId: hashGroupId(t.groupId),
			incognito: false,
		};
		// openerTabId is optional with exactOptionalPropertyTypes; omit when unset.
		return info;
	}

	all(): TabInfo[] {
		if (!this.tabs) return [];
		return this.tabs.getTabsInOrder().map((t) => this.info(this.toNum(t.id)));
	}

	resolveIframeForSource(source: Window): HTMLIFrameElement | null {
		const all = document.querySelectorAll('iframe');
		for (const f of all) if (f.contentWindow === source) return f as HTMLIFrameElement;
		return null;
	}

	/**
	 * Reverse lookup: given a Scramjet-owned iframe element, return the
	 * numeric tab id. Iterates `tabs.frameByTabId`; O(n) but n is tiny
	 * (open tab count). If we ever care about per-request hot-path
	 * cost, add a WeakMap reverse index updated on tab open/close.
	 *
	 * Returns -1 when:
	 *   - tabs API is unavailable
	 *   - iframe is not the active frame for any DDX tab (e.g. a
	 *     transient frame mid-swap, or a sub-frame Scramjet built
	 *     internally that isn't tied to a tab)
	 */
	toNumFromIframe(iframe: HTMLIFrameElement): number {
		if (!this.tabs) return -1;
		for (const [ddxId, frame] of this.tabs.frameByTabId) {
			if (frame === iframe) return this.toNum(ddxId);
		}
		return -1;
	}

	dropDdxId(ddxId: string): void {
		const n = this.ddxToNum.get(ddxId);
		if (n != null) {
			this.ddxToNum.delete(ddxId);
			this.numToDdx.delete(n);
		}
	}
}
