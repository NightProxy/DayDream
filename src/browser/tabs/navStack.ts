/**
 * Per-tab shadow back/forward history stack.
 *
 * The iframe's native `Window.history` object is opaque — we can call
 * `back()`/`forward()`/`go(n)` on it but we can't enumerate entries.
 * Browser-style "right-click on Back to see jump targets" requires
 * the entries to be visible, so we maintain a parallel stack populated
 * by observing commits.
 *
 * What we observe:
 *   - `iframeLoaded` event from lifecycle.ts (every committed navigation)
 *   - explicit `notifyBackward(tabId)` / `notifyForward(tabId)` calls from
 *     `navigation.ts` so the cursor follows host-initiated back/forward
 *
 * What we DON'T capture cleanly:
 *   - SPA pushState that doesn't change the visible URL/title (rare;
 *     iframeLoaded won't fire for these). Out of scope for v1.
 *
 * The stack is per-session, in-memory. Cleared when a tab closes.
 *
 * URLs are stored decoded (user-meaningful form), since this is what
 * we'll display in the dropdown. We never re-issue navigation through
 * this URL — we only call `iframe.contentWindow.history.go(delta)`
 * with a relative offset, which the native History handles.
 */

import type { TabsInterface } from './types';
import { decodeIframeUrl } from './urlDecoder';

export interface NavEntry {
	url: string;
	title: string;
	favicon: string | null;
	timestamp: number;
}

interface PerTabState {
	stack: NavEntry[];
	cursor: number;
}

const MAX_PER_TAB = 100;

export class TabNavStack {
	private tabs: TabsInterface;
	private byTabId: Map<string, PerTabState> = new Map();

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		document.addEventListener(
			'iframeLoaded',
			this.onIframeLoaded as EventListener
		);
		document.addEventListener(
			'tabClosed',
			this.onTabClosed as EventListener
		);
	}

	private onIframeLoaded = (event: Event): void => {
		const ce = event as CustomEvent;
		const { tabId, iframe, tabElement } = ce.detail ?? {};
		if (!tabId || !iframe) return;
		this.recordCommit(tabId, iframe, tabElement);
	};

	private onTabClosed = (event: Event): void => {
		const ce = event as CustomEvent;
		const tabId = ce.detail?.tabId;
		if (tabId) this.byTabId.delete(tabId);
	};

	/**
	 * Record a committed navigation. If the new URL equals the current
	 * cursor entry, we treat it as a refresh and update title/favicon
	 * in place. If we're not at the tip of the stack (i.e., user went
	 * back and then clicked a link), we truncate the forward portion
	 * before pushing — matching native History behavior.
	 */
	private recordCommit(
		tabId: string,
		iframe: HTMLIFrameElement,
		tabElement: HTMLElement | undefined
	): void {
		const url = decodeIframeUrl(iframe, this.tabs.proxy);
		if (!url || url === 'about:blank') return;

		let title = 'Untitled';
		try {
			const docTitle = iframe.contentDocument?.title?.trim();
			if (docTitle) title = docTitle;
		} catch {
			const titleEl = tabElement?.querySelector('.tab-title');
			if (titleEl?.textContent) title = titleEl.textContent.trim();
		}

		let favicon: string | null = null;
		const faviconEl = tabElement?.querySelector(
			'.tab-favicon'
		) as HTMLImageElement | null;
		if (faviconEl?.src) favicon = faviconEl.src;

		let state = this.byTabId.get(tabId);
		if (!state) {
			state = { stack: [], cursor: -1 };
			this.byTabId.set(tabId, state);
		}

		const currentEntry = state.stack[state.cursor];
		if (currentEntry && currentEntry.url === url) {
			currentEntry.title = title;
			currentEntry.favicon = favicon ?? currentEntry.favicon;
			currentEntry.timestamp = Date.now();
			return;
		}

		if (state.cursor < state.stack.length - 1) {
			state.stack.splice(state.cursor + 1);
		}

		state.stack.push({ url, title, favicon, timestamp: Date.now() });
		state.cursor = state.stack.length - 1;

		if (state.stack.length > MAX_PER_TAB) {
			const overflow = state.stack.length - MAX_PER_TAB;
			state.stack.splice(0, overflow);
			state.cursor -= overflow;
		}
	}

	/**
	 * Called by `navigation.ts` after issuing `history.back()` on the
	 * iframe. Moves our cursor to track the iframe's actual position.
	 * Safe to call when no shadow state exists (no-op).
	 */
	notifyBackward(tabId: string): void {
		const state = this.byTabId.get(tabId);
		if (!state || state.cursor <= 0) return;
		state.cursor -= 1;
	}

	/** Mirror of notifyBackward for forward navigation. */
	notifyForward(tabId: string): void {
		const state = this.byTabId.get(tabId);
		if (!state) return;
		if (state.cursor >= state.stack.length - 1) return;
		state.cursor += 1;
	}

	/**
	 * Get the back history entries for a tab, ordered nearest-first
	 * (entry that would be reached by one history.back() comes first).
	 * Cap at `limit` items.
	 */
	getBack(tabId: string, limit: number = 10): NavEntry[] {
		const state = this.byTabId.get(tabId);
		if (!state || state.cursor <= 0) return [];
		const slice = state.stack.slice(
			Math.max(0, state.cursor - limit),
			state.cursor
		);
		return slice.reverse();
	}

	/**
	 * Get the forward history entries for a tab, ordered nearest-first
	 * (entry that would be reached by one history.forward() comes first).
	 * Cap at `limit` items.
	 */
	getForward(tabId: string, limit: number = 10): NavEntry[] {
		const state = this.byTabId.get(tabId);
		if (!state) return [];
		const start = state.cursor + 1;
		if (start >= state.stack.length) return [];
		return state.stack.slice(start, start + limit);
	}

	hasBack(tabId: string): boolean {
		const state = this.byTabId.get(tabId);
		return !!state && state.cursor > 0;
	}

	hasForward(tabId: string): boolean {
		const state = this.byTabId.get(tabId);
		return !!state && state.cursor < state.stack.length - 1;
	}

	/**
	 * Jump to a specific entry in the stack by relative offset from the
	 * current cursor (negative = back, positive = forward). Uses
	 * `iframe.contentWindow.history.go(delta)` to drive the actual
	 * navigation; the cursor update follows via `notifyBackward/Forward`.
	 *
	 * Returns true if the jump was issued, false if the tab/iframe is
	 * missing or the offset is out of bounds.
	 */
	jumpRelative(tabId: string, delta: number): boolean {
		if (delta === 0) return false;
		const state = this.byTabId.get(tabId);
		if (!state) return false;

		const targetCursor = state.cursor + delta;
		if (targetCursor < 0 || targetCursor >= state.stack.length) {
			return false;
		}

		const tabInfo = this.tabs.getTabById(tabId);
		const iframe = tabInfo?.iframe;
		if (!iframe?.contentWindow?.history) return false;

		try {
			iframe.contentWindow.history.go(delta);
		} catch (error) {
			console.warn(
				`[navStack] history.go(${delta}) failed for ${tabId}:`,
				error
			);
			return false;
		}

		state.cursor = targetCursor;
		return true;
	}

	destroy(): void {
		document.removeEventListener(
			'iframeLoaded',
			this.onIframeLoaded as EventListener
		);
		document.removeEventListener(
			'tabClosed',
			this.onTabClosed as EventListener
		);
		this.byTabId.clear();
	}
}
