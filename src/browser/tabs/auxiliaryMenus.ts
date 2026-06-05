/**
 * Auxiliary context menus for the browser shell.
 *
 * The existing `TabContextMenu` covers per-tab and group-header right-clicks.
 * This module covers the rest:
 *
 *   1. **Tab strip background** — right-click on the empty area of `items.tabBar`
 *      (NOT on a tab; tab-level menu still wins via stopPropagation).
 *
 *   2. **Forward / Back / Reload buttons** — right-click on each of the navbar
 *      navigation buttons. Forward/Back show a per-tab history dropdown
 *      sourced from `tabs.navStack`. Reload shows reload-mode options.
 *
 *   3. **History list items** — right-click on a row in `ddx://history`. Note:
 *      this menu is NOT installed by this module since the history page lives
 *      inside its own iframe; instead, a tiny shim runs inside that page that
 *      uses the page's own `Nightmare` instance. We keep the menu-content
 *      *builder* in this file so the shape stays consistent with the others.
 *
 *   4. **Page background (inside proxied iframes)** — installed by `pageClient.ts`
 *      via `setupPageBackgroundContextBridge`, which calls into here for the
 *      menu content.
 *
 * All menu builders return an `HTMLElement` ready to hand to
 * `RightClickMenu.openMenu(...)`. Click handlers close the menu themselves
 * via the passed-in `closeMenu` callback so we don't have to re-resolve the
 * singleton in every handler.
 */

import type { TabsInterface } from './types';
import { decodeIframeUrl } from './urlDecoder';

interface MenuItemSpec {
	icon: string;
	label: string;
	onclick?: () => void | Promise<void>;
	disabled?: boolean;
	danger?: boolean;
}

interface MenuSection {
	items: MenuItemSpec[];
}

export class AuxiliaryMenus {
	private tabs: TabsInterface;

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
	}

	private getRightClickMenu() {
		return (
			this.tabs.ui?.rightclickmenu ??
			this.tabs.ui?.np?.rightclickmenu ??
			this.tabs.nightmarePlugins?.rightclickmenu
		);
	}

	private closeContextMenu() {
		this.getRightClickMenu()?.closeMenu();
	}

	/* ---------- shared item builder ---------- */

	private buildItem(spec: MenuItemSpec): HTMLElement {
		const baseClass =
			'flex items-center gap-3 px-4 py-2 w-full text-left text-sm rounded-md transition-colors';
		const stateClass = spec.disabled
			? 'opacity-60 cursor-not-allowed'
			: spec.danger
				? 'hover:bg-[var(--red-15,rgba(255,0,0,0.15))] text-[var(--red,#ef4444)]'
				: 'hover:bg-[var(--white-05)]';

		const attrs: any = {
			class: `${baseClass} ${stateClass}`
		};
		if (spec.disabled) {
			attrs.disabled = true;
		} else if (spec.onclick) {
			attrs.onclick = async () => {
				try {
					await spec.onclick!();
				} catch (error) {
					console.error('[AuxiliaryMenus] action failed:', error);
				}
				this.closeContextMenu();
			};
		}

		return this.tabs.ui.createElement('button', attrs, [
			this.tabs.ui.createElement(
				'i',
				{ 'data-lucide': spec.icon, class: 'h-4 w-4' },
				[]
			),
			this.tabs.ui.createElement('span', {}, [spec.label])
		]);
	}

	private buildSeparator(): HTMLElement {
		return this.tabs.ui.createElement('div', {
			class: 'h-px bg-[var(--white-08)] my-1'
		});
	}

	private buildLabel(text: string, opts?: { mono?: boolean }): HTMLElement {
		return this.tabs.ui.createElement(
			'div',
			{
				class: `px-4 py-1 text-xs text-[var(--text)]/60 truncate ${opts?.mono ? 'font-mono' : ''}`
			},
			[text]
		);
	}

	private buildMenu(sections: MenuSection[]): HTMLElement {
		const children: HTMLElement[] = [];
		sections.forEach((section, idx) => {
			if (idx > 0) children.push(this.buildSeparator());
			section.items.forEach(item => children.push(this.buildItem(item)));
		});

		return this.tabs.ui.createElement(
			'div',
			{
				class: 'fixed z-50 bg-[var(--bg-1)] border border-[var(--white-08)] rounded-lg shadow-xl py-2 min-w-56',
				style: 'backdrop-filter: blur(8px);'
			},
			children
		);
	}

	/* ---------- (1) Tab strip background ---------- */

	private getActiveTabId(): string | null {
		return this.tabs.activeTabId;
	}

	buildTabStripMenu(): HTMLElement {
		const hasClosed = this.tabs.closedTabStack?.peek() != null;
		const closedList = this.tabs.closedTabStack?.list() ?? [];
		const recentlyClosedItems: MenuItemSpec[] = closedList
			.slice(0, 8)
			.map(record => ({
				icon: 'rotate-ccw',
				label: this.truncate(record.title || record.url, 40),
				onclick: async () => {
					// Reopen this specific entry: remove it, then create a tab.
					this.tabs.closedTabStack?.removeByTimestamp(
						record.closedAt
					);
					await this.tabs.createTab(record.url);
				}
			}));

		const isVerticalActive = false; // No public getter; toggle is purely state-flip.

		const sections: MenuSection[] = [
			{
				items: [
					{
						icon: 'plus',
						label: 'New Tab',
						onclick: () => {
							this.tabs.createTab('ddx://newtab/');
						}
					},
					{
						icon: 'rotate-ccw',
						label: hasClosed
							? 'Reopen Closed Tab'
							: 'Reopen Closed Tab (none)',
						disabled: !hasClosed,
						onclick: hasClosed
							? async () => {
									await this.tabs.reopenClosedTab();
								}
							: undefined
					}
				]
			}
		];

		if (recentlyClosedItems.length > 0) {
			sections.push({ items: recentlyClosedItems });
		}

		sections.push({
			items: [
				{
					icon: 'bookmark-plus',
					label: 'Bookmark All Tabs',
					onclick: () => this.bookmarkAllTabs()
				},
				{
					icon: 'panel-left',
					label: isVerticalActive
						? 'Disable Vertical Tabs'
						: 'Enable Vertical Tabs',
					onclick: () => {
						this.tabs.toggleVerticalTabsLayout();
					}
				}
			]
		});

		sections.push({
			items: [
				{
					icon: 'x',
					label: 'Close All Tabs',
					danger: true,
					onclick: () => this.tabs.closeAllTabs()
				}
			]
		});

		return this.buildMenu(sections);
	}

	/* ---------- (2) Back / Forward / Reload buttons ---------- */

	buildBackMenu(): HTMLElement {
		const tabId = this.getActiveTabId();
		const back = tabId ? this.tabs.navStack?.getBack(tabId, 10) ?? [] : [];

		const sections: MenuSection[] = [];

		if (back.length === 0) {
			sections.push({
				items: [
					{
						icon: 'history',
						label: 'No back history',
						disabled: true
					}
				]
			});
		} else {
			sections.push({
				items: back.map((entry, idx) => ({
					icon: 'arrow-left',
					label: this.truncate(entry.title || entry.url, 50),
					onclick: () => {
						if (!tabId) return;
						this.tabs.navStack?.jumpRelative(tabId, -(idx + 1));
					}
				}))
			});
		}

		return this.buildMenu(sections);
	}

	buildForwardMenu(): HTMLElement {
		const tabId = this.getActiveTabId();
		const forward = tabId
			? this.tabs.navStack?.getForward(tabId, 10) ?? []
			: [];

		const sections: MenuSection[] = [];

		if (forward.length === 0) {
			sections.push({
				items: [
					{
						icon: 'history',
						label: 'No forward history',
						disabled: true
					}
				]
			});
		} else {
			sections.push({
				items: forward.map((entry, idx) => ({
					icon: 'arrow-right',
					label: this.truncate(entry.title || entry.url, 50),
					onclick: () => {
						if (!tabId) return;
						this.tabs.navStack?.jumpRelative(tabId, idx + 1);
					}
				}))
			});
		}

		return this.buildMenu(sections);
	}

	buildReloadMenu(): HTMLElement {
		const tabId = this.getActiveTabId();
		const sections: MenuSection[] = [
			{
				items: [
					{
						icon: 'rotate-cw',
						label: 'Normal Reload',
						onclick: () => {
							if (tabId) this.tabs.refreshTab(tabId);
						}
					},
					{
						icon: 'refresh-cw',
						label: 'Hard Reload',
						onclick: () => {
							if (tabId) this.tabs.hardReloadTab(tabId);
						}
					},
					{
						icon: 'eraser',
						label: 'Empty Cache and Hard Reload',
						// Real impl waits on per-site permissions / cache mgmt.
						disabled: true
					}
				]
			},
			{
				items: [
					{
						icon: 'square',
						label: 'Stop Loading',
						onclick: () => {
							if (tabId) this.tabs.stopTab(tabId);
						}
					}
				]
			}
		];

		return this.buildMenu(sections);
	}

	/* ---------- (3) History list items ---------- */

	/**
	 * Build a context menu for a single history entry. The history page
	 * passes us the entry's URL and title (extracted from the row's
	 * `data-history-url` attribute and visible text). Action handlers
	 * coordinate with the host's `tabs` API + `HistoryManager` directly.
	 *
	 * We expose this as a public builder so the history page (which lives
	 * in its own iframe) can call into it without re-implementing the menu.
	 */
	buildHistoryItemMenu(opts: {
		url: string;
		title: string;
		entryId: string;
		hostname?: string;
		onRemoveEntry?: () => void;
		onRemoveAllFromSite?: () => void;
	}): HTMLElement {
		const { url, title, entryId, hostname } = opts;

		const sections: MenuSection[] = [
			{
				items: [
					{
						icon: 'external-link',
						label: 'Open',
						onclick: async () => {
							await this.tabs.createTab(url);
						}
					},
					{
						icon: 'plus-square',
						label: 'Open in New Tab',
						onclick: async () => {
							await this.tabs.createTab(url);
						}
					},
					{
						icon: 'columns-2',
						label: 'Open in Split View',
						disabled: true
					}
				]
			},
			{
				items: [
					{
						icon: 'copy',
						label: 'Copy URL',
						onclick: async () => {
							try {
								await navigator.clipboard.writeText(url);
							} catch (error) {
								console.warn(
									'[AuxiliaryMenus] copy URL failed:',
									error
								);
							}
						}
					},
					{
						icon: 'bookmark-plus',
						label: 'Bookmark This',
						onclick: async () => {
							const bm: any = (this.tabs as any).bookmarkManager;
							if (typeof bm?.createBookmark !== 'function') {
								console.warn(
									'[AuxiliaryMenus] bookmarkManager missing'
								);
								return;
							}
							try {
								await bm.createBookmark({ title, url });
								this.tabs.logger?.createLog?.(
									`Bookmarked from history: ${title}`
								);
							} catch (error) {
								console.error(
									'[AuxiliaryMenus] bookmark failed:',
									error
								);
							}
						}
					}
				]
			},
			{
				items: [
					{
						icon: 'trash-2',
						label: 'Remove from History',
						danger: true,
						onclick: () => opts.onRemoveEntry?.()
					},
					{
						icon: 'trash',
						label: hostname
							? `Delete All from ${this.truncate(hostname, 32)}`
							: 'Delete All from This Site',
						danger: true,
						disabled: !hostname,
						onclick: () => opts.onRemoveAllFromSite?.()
					}
				]
			}
		];

		// Suppress unused-var lint hint for entryId — kept in the signature
		// because callers may want it for telemetry/logging.
		void entryId;

		const menu = this.buildMenu(sections);
		menu.appendChild(this.buildSeparator());
		menu.appendChild(this.buildLabel(url));
		return menu;
	}

	/* ---------- (4) Page background (proxied iframe) ---------- */

	buildPageBackgroundMenu(iframe: HTMLIFrameElement): HTMLElement {
		const tabId = iframe.getAttribute('data-tab-id') || null;
		const decodedUrl = decodeIframeUrl(iframe, this.tabs.proxy);
		const hasUrl = !!decodedUrl && decodedUrl !== 'about:blank';

		const sections: MenuSection[] = [
			{
				items: [
					{
						icon: 'arrow-left',
						label: 'Back',
						disabled:
							!tabId || !this.tabs.navStack?.hasBack(tabId),
						onclick: () => {
							if (!tabId) return;
							this.tabs.navStack?.jumpRelative(tabId, -1);
						}
					},
					{
						icon: 'arrow-right',
						label: 'Forward',
						disabled:
							!tabId || !this.tabs.navStack?.hasForward(tabId),
						onclick: () => {
							if (!tabId) return;
							this.tabs.navStack?.jumpRelative(tabId, 1);
						}
					},
					{
						icon: 'rotate-cw',
						label: 'Reload',
						onclick: () => {
							if (tabId) this.tabs.refreshTab(tabId);
						}
					},
					{
						icon: 'square',
						label: 'Stop',
						onclick: () => {
							if (tabId) this.tabs.stopTab(tabId);
						}
					}
				]
			},
			{
				items: [
					{
						icon: 'download',
						label: 'Save Page',
						disabled: !hasUrl,
						onclick: () => {
							if (tabId) this.tabs.savePage(tabId);
						}
					},
					{
						icon: 'code',
						// Disabled until the view-source page lands.
						label: 'View Source',
						disabled: true
					},
					{
						icon: 'languages',
						label: 'Translate',
						disabled: true
					}
				]
			},
			{
				items: [
					{
						icon: 'copy',
						label: 'Copy Page URL',
						disabled: !hasUrl,
						onclick: async () => {
							if (!hasUrl) return;
							try {
								await navigator.clipboard.writeText(decodedUrl);
							} catch (error) {
								console.warn(
									'[AuxiliaryMenus] copy URL failed:',
									error
								);
							}
						}
					},
					{
						icon: 'inspect',
						label: 'Inspect Element',
						disabled: !tabId,
						onclick: () => {
							// Prefer the tab the user actually right-clicked
							// on; fall back to the active tab if that's missing.
							const w = window as any;
							let id: string | null = tabId ?? null;
							if (!id) {
								id = this.tabs.activeTabId ?? null;
							}
							if (!id) {
								const iframe = document.querySelector(
									'iframe.active'
								) as HTMLIFrameElement | null;
								id = iframe?.getAttribute('data-tab-id') ?? null;
							}
							if (!id) {
								console.warn(
									'[devtools] Inspect Element: no tab id available'
								);
								return;
							}
							if (!w.devtools) {
								console.warn(
									'[devtools] Inspect Element: window.devtools missing'
								);
								return;
							}
							try {
								w.devtools.toggle(id);
							} catch (err) {
								console.error(
									'[devtools] Inspect Element toggle threw:',
									err
								);
							}
						}
					}
				]
			}
		];

		const menu = this.buildMenu(sections);
		if (hasUrl) {
			menu.appendChild(this.buildSeparator());
			menu.appendChild(this.buildLabel(decodedUrl));
		}
		return menu;
	}

	/* ---------- helpers ---------- */

	private async bookmarkAllTabs(): Promise<void> {
		try {
			const allTabs = this.tabs.getTabsInOrder();
			if (allTabs.length === 0) return;

			const bookmarkManager: any = (this.tabs as any).bookmarkManager;
			if (!bookmarkManager?.createBookmark) {
				console.warn(
					'[AuxiliaryMenus] bookmarkManager.createBookmark missing'
				);
				return;
			}

			const folderTitle = `Bookmarked Tabs — ${new Date().toLocaleString()}`;
			let parentId: string | undefined;
			if (typeof bookmarkManager.createFolder === 'function') {
				try {
					const folder = await bookmarkManager.createFolder({
						title: folderTitle
					});
					parentId = folder?.id;
				} catch (error) {
					console.warn(
						'[AuxiliaryMenus] createFolder failed; bookmarking flat:',
						error
					);
				}
			}

			for (const tab of allTabs) {
				const url = decodeIframeUrl(tab.iframe, this.tabs.proxy);
				if (!url || url === 'about:blank') continue;
				try {
					await bookmarkManager.createBookmark({
						title: tab.title || url,
						url,
						parentId
					});
				} catch (error) {
					console.warn(
						`[AuxiliaryMenus] bookmark of ${url} failed:`,
						error
					);
				}
			}

			this.tabs.logger?.createLog?.(
				`Bookmarked ${allTabs.length} tabs into "${folderTitle}"`
			);
		} catch (error) {
			console.error('[AuxiliaryMenus] bookmarkAllTabs failed:', error);
		}
	}

	private truncate(s: string, max: number): string {
		if (!s) return '';
		return s.length <= max ? s : s.slice(0, max - 1) + '\u2026';
	}

	/* ---------- installers ---------- */

	/**
	 * Install all auxiliary menu listeners that bind to host-shell elements.
	 * Call once after `items` is populated and tabs are initialised. The
	 * page-background and history-page menus are installed elsewhere
	 * (page-bg via `pageClient.setupPageBackgroundContextBridge`, history
	 * via the history page itself reading `buildHistoryItemMenu`).
	 */
	installHostShellMenus(): void {
		const rcm = this.getRightClickMenu();
		if (!rcm) {
			console.warn(
				'[AuxiliaryMenus] no rightclickmenu instance; skipping install'
			);
			return;
		}

		const items = this.tabs.items;

		if (items.tabBar) {
			// Guard so right-clicks on a tab go to the tab-level menu via its
			// own listener (which calls stopPropagation). We only fire when
			// the event target is the tabBar itself or the bare strip area.
			items.tabBar.addEventListener('contextmenu', (event: MouseEvent) => {
				const target = event.target as HTMLElement | null;
				if (!target) return;
				// If the click is on a tab or group header, let those listeners win.
				if (
					target.closest('[data-component="tab"]') ||
					target.closest('[data-dnd-kind="groupHeader"]')
				) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				rcm.closeMenu();
				rcm.openMenu(items.tabBar!, event, () =>
					this.buildTabStripMenu()
				);
			});
		}

		if (items.backButton) {
			rcm.attachTo(items.backButton, () => this.buildBackMenu());
		}
		if (items.forwardButton) {
			rcm.attachTo(items.forwardButton, () => this.buildForwardMenu());
		}
		if (items.reloadButton) {
			rcm.attachTo(items.reloadButton, () => this.buildReloadMenu());
		}
	}
}
