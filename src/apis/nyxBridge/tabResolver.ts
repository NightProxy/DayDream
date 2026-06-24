// src/apis/nyxBridge/tabResolver.ts
//
// Resolves between DDX's string tab IDs (`tab-1`, `tab-2`, ...) and the
// numeric IDs exposed to NyxAI through the contract (chrome.tabs-style).
// Numeric IDs are auto-assigned on first sight and stable for the
// lifetime of the underlying DDX tab.

import { DDXError } from './types';
import type { TabId, TabInfo } from './api';

export interface TabsLike {
	frameByTabId: Map<string, HTMLIFrameElement>;
	activeTabId: string | null;
	getTabById(id: string): { id: string; url?: string; title?: string; favIconUrl?: string; status?: string } | undefined;
	getTabsInOrder(): Array<{ id: string; url?: string; title?: string; favIconUrl?: string; status?: string }>;
	selectTab(id: string): Promise<unknown> | unknown;
	createTab(url: string): Promise<string | null>;
	closeTabById(id: string): Promise<unknown> | unknown;
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
		return {
			id: n,
			index: order.findIndex((x) => x.id === ddxId),
			active: this.tabs.activeTabId === ddxId,
			url: t.url,
			title: t.title,
			favIconUrl: t.favIconUrl,
			status: (t.status as TabInfo['status']) ?? 'complete',
			pinned: false,
			highlighted: this.tabs.activeTabId === ddxId,
			discarded: false,
		};
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

	dropDdxId(ddxId: string): void {
		const n = this.ddxToNum.get(ddxId);
		if (n != null) {
			this.ddxToNum.delete(ddxId);
			this.numToDdx.delete(n);
		}
	}
}
