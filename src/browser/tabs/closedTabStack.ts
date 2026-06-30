/**
 * Recently-closed tab stack — backs the "Reopen Closed Tab" UX.
 *
 * Captures enough context per closure to recreate the tab approximately:
 * URL (decoded back to its original form, never scramjet-encoded), title,
 * favicon, pinned state, and the group it belonged to (by id; if the
 * group is also gone by reopen time we just drop it on the floor and
 * the tab reopens ungrouped).
 *
 * Bounded FIFO with a hard cap (default 25) — anything older is evicted.
 * Per-session only; not persisted across hard reloads of the host shell.
 *
 * Single owner: `TabClosedStack`. Mutators are call sites in `lifecycle.ts`
 * close paths and any future bulk-close action. Readers are the menu
 * builders + keyboard shortcut handler. The stack itself is intentionally
 * dumb — it doesn't know how to recreate a tab; that's the consumer's job
 * via `tabs.createTab(url)` plus optional re-pin / re-group calls.
 */

import type { TabData, TabsInterface } from './types';
import { decodeProxiedUrl, decodeIframeUrl } from './urlDecoder';

export interface ClosedTabRecord {
	url: string;
	title: string;
	favicon: string | null;
	wasPinned: boolean;
	groupId: string | undefined;
	closedAt: number;
}

const DEFAULT_MAX_SIZE = 25;

export class TabClosedStack {
	private tabs: TabsInterface;
	private stack: ClosedTabRecord[] = [];
	private maxSize: number;

	constructor(tabs: TabsInterface, maxSize: number = DEFAULT_MAX_SIZE) {
		this.tabs = tabs;
		this.maxSize = maxSize;
	}

	/**
	 * Snapshot a tab's state and push onto the stack. Must be called BEFORE
	 * the iframe is torn down, since we read live data from `tabInfo.iframe`
	 * (URL, favicon img). Safe to call on tabs we don't want to track
	 * (newtab, internal `ddx://` pages) — they're filtered out here so
	 * close call sites don't have to think about it.
	 */
	push(tabInfo: TabData | undefined): void {
		if (!tabInfo) return;

		const url = this.resolveUrl(tabInfo);
		if (!url || this.shouldSkip(url)) return;

		const record: ClosedTabRecord = {
			url,
			title: tabInfo.title || 'Untitled',
			favicon: tabInfo.favicon ?? null,
			wasPinned: tabInfo.isPinned === true,
			groupId: tabInfo.groupId,
			closedAt: Date.now()
		};

		this.stack.push(record);

		if (this.stack.length > this.maxSize) {
			this.stack.splice(0, this.stack.length - this.maxSize);
		}
	}

	/** Pop the most recent record without removing it. */
	peek(): ClosedTabRecord | undefined {
		return this.stack[this.stack.length - 1];
	}

	/** Pop and remove the most recent record. */
	popMostRecent(): ClosedTabRecord | undefined {
		return this.stack.pop();
	}

	/** Read-only snapshot, newest-first. */
	list(): ClosedTabRecord[] {
		return this.stack.slice().reverse();
	}

	/** Remove a specific record by closedAt timestamp (a stable id within session). */
	removeByTimestamp(closedAt: number): void {
		const idx = this.stack.findIndex(r => r.closedAt === closedAt);
		if (idx >= 0) this.stack.splice(idx, 1);
	}

	clear(): void {
		this.stack = [];
	}

	private resolveUrl(tabInfo: TabData): string {
		const fromIframe = decodeIframeUrl(tabInfo.iframe, this.tabs.proxy);
		if (fromIframe && fromIframe !== 'about:blank') return fromIframe;
		return tabInfo.url
			? decodeProxiedUrl(tabInfo.url, this.tabs.proxy)
			: '';
	}

	private shouldSkip(url: string): boolean {
		if (!url) return true;
		if (url === 'about:blank') return true;
		if (url.startsWith('ddx://newtab')) return true;
		if (url.startsWith('ddx://home')) return true;
		return false;
	}
}
