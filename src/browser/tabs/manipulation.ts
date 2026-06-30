import type { TabsInterface } from './types';
import { decodeProxiedUrl, decodeIframeUrl } from './urlDecoder';

export class TabManipulation {
	private tabs: TabsInterface;

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
	}

	duplicateTab = (tabId: string): string | null => {
		const tabInfo = this.tabs.getTabById(tabId);
		if (!tabInfo) return null;

		const decodedFromIframe = decodeIframeUrl(
			tabInfo.iframe,
			this.tabs.proxy
		);
		const url =
			decodedFromIframe ||
			(tabInfo.url ? decodeProxiedUrl(tabInfo.url, this.tabs.proxy) : '');

		if (url && url !== 'about:blank') {
			this.tabs.createTab(url);
			return `tab-${this.tabs.tabCount + 1}`;
		}
		return null;
	};

	refreshTab = (tabId: string) => {
		const tabInfo = this.tabs.getTabById(tabId);
		if (!tabInfo) return;

		if (tabInfo.iframe && tabInfo.iframe.src) {
			tabInfo.iframe.src = tabInfo.iframe.src;
			this.tabs.logger.createLog(`Refreshed tab: ${tabId}`);
		}
	};

	/**
	 * Hard reload — "Empty Cache and Hard Reload" variant.
	 *
	 * Bumps the per-origin cache epoch via SiteDataManager (which also
	 * invalidates the Scramjet HTTP cache plugin if present) AND
	 * appends a unique cache-busting query param to force network
	 * revalidation. The two together approximate Chrome's
	 * Ctrl+Shift+R behavior.
	 *
	 * Best-effort: if SiteDataManager isn't loaded yet (very early
	 * boot), the cache-buster query param alone is enough to force a
	 * fresh network round-trip — the HTTP proxy honors it as a new
	 * request URL.
	 */
	hardReloadTab = (tabId: string) => {
		const tabInfo = this.tabs.getTabById(tabId);
		if (!tabInfo?.iframe) return;

		const currentSrc = tabInfo.iframe.src;
		if (!currentSrc) return;

		try {
			const url = new URL(currentSrc);
			let originForClear = currentSrc;
			try {
				const decoded = (this.tabs.proxy as { decodeUrl?: (u: string) => string }).decodeUrl?.(currentSrc);
				if (decoded) originForClear = decoded;
			} catch { /* swallow */ }
			void import('@apis/siteData').then(({ SiteDataManager }) => {
				try { void SiteDataManager.getInstance().clearCache(originForClear); }
				catch { /* swallow */ }
			}).catch(() => { /* manager not available */ });
			url.searchParams.set('__ddxHardReload', String(Date.now()));
			tabInfo.iframe.src = url.toString();
			this.tabs.logger.createLog(`Hard reloaded tab: ${tabId}`);
		} catch (error) {
			console.warn(
				`[Tabs] hardReloadTab fell back to plain refresh for ${tabId}:`,
				error
			);
			tabInfo.iframe.src = currentSrc;
			this.tabs.logger.createLog(
				`Hard reload fell back to refresh: ${tabId}`
			);
		}
	};

	/**
	 * Stop loading: equivalent to the browser's Stop button. Halts the
	 * current navigation/resource fetches inside the proxied iframe.
	 * Safe to call on a tab that isn't currently loading (no-op).
	 */
	stopTab = (tabId: string) => {
		const tabInfo = this.tabs.getTabById(tabId);
		if (!tabInfo?.iframe) return;

		try {
			tabInfo.iframe.contentWindow?.stop();
			this.tabs.logger.createLog(`Stopped tab: ${tabId}`);
		} catch (error) {
			console.warn(`[Tabs] stopTab failed for ${tabId}:`, error);
		}
	};

	/**
	 * Save Page: fetch the tab's current URL through the proxy and
	 * trigger a browser-level download of the rendered HTML.
	 *
	 * For proxied tabs we fetch via `this.tabs.proxy.fetch(url)` so the
	 * request goes through the same transport / WISP server the tab
	 * itself uses, getting around CORS that would block a direct fetch.
	 * For internal `ddx://` pages we just fetch directly — they're same
	 * origin to the host.
	 *
	 * Filename is derived from the URL host + path. Defaults to
	 * `page.html` when we can't derive anything meaningful.
	 */
	savePage = async (tabId: string): Promise<void> => {
		const tabInfo = this.tabs.getTabById(tabId);
		if (!tabInfo?.iframe) return;

		const decoded = decodeIframeUrl(tabInfo.iframe, this.tabs.proxy);
		if (!decoded || decoded === 'about:blank') {
			this.tabs.logger.createLog(`Save page: nothing to save`);
			return;
		}

		try {
			let response: Response;
			if (decoded.startsWith('ddx://') || decoded.startsWith('/')) {
				response = await fetch(decoded);
			} else if (
				typeof this.tabs.proxy?.fetch === 'function'
			) {
				response = await this.tabs.proxy.fetch(decoded);
			} else {
				response = await fetch(decoded);
			}

			const blob = await response.blob();
			const downloadUrl = URL.createObjectURL(blob);
			const filename = this.derivePageFilename(decoded);

			const anchor = document.createElement('a');
			anchor.href = downloadUrl;
			anchor.download = filename;
			anchor.style.display = 'none';
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();

			setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);

			this.tabs.logger.createLog(`Saved page: ${filename}`);
		} catch (error) {
			console.error(`[Tabs] savePage failed for ${tabId}:`, error);
			this.tabs.logger.createLog(`Save page failed: ${error}`);
		}
	};

	private derivePageFilename(url: string): string {
		try {
			const u = new URL(url);
			const host = u.hostname || 'page';
			const path = u.pathname.replace(/[\/\s]+/g, '_').replace(/^_+|_+$/g, '');
			const base = path && path !== '_' ? `${host}_${path}` : host;
			return `${base}.html`.slice(0, 200);
		} catch {
			return 'page.html';
		}
	}

	closeTabsToRight = (tabId: string): void => {
		const orderedTabs = this.tabs.getTabsInOrder();
		const targetIndex = orderedTabs.findIndex(t => t.id === tabId);
		if (targetIndex === -1 || targetIndex === orderedTabs.length - 1)
			return;

		const tabsToClose = orderedTabs.slice(targetIndex + 1);
		for (let i = tabsToClose.length - 1; i >= 0; i--) {
			this.tabs.closeTabById(tabsToClose[i].id);
		}

		this.tabs.logger.createLog(
			`Closed ${tabsToClose.length} tabs to the right of ${tabId}`
		);
	};

	reorderTabElements = () => {
		const container = this.tabs.items.tabBar;
		if (!container) return;

		const fragment = document.createDocumentFragment();
		this.tabs.getTabsInOrder().forEach(tabData => {
			const tabElement = document.getElementById(tabData.id);
			if (tabElement && tabElement.parentNode === container) {
				fragment.appendChild(tabElement);
			}
		});

		container.appendChild(fragment);
	};

	setFavicon(tabElement: HTMLElement, iframe: HTMLIFrameElement): void {
		iframe.addEventListener('load', async () => {
			try {
				if (!iframe.contentDocument) {
					console.error(
						'Unable to access iframe content due to cross-origin restrictions.'
					);
					return;
				}

				let favicon: HTMLLinkElement | null = null;
				const nodeList =
					iframe.contentDocument.querySelectorAll(
						"link[rel~='icon']"
					);

				for (let i = 0; i < nodeList.length; i++) {
					const relAttr = nodeList[i].getAttribute('rel');
					if (relAttr && relAttr.includes('icon')) {
						favicon = nodeList[i] as HTMLLinkElement;
						break;
					}
				}

				if (favicon) {
					let faviconUrl: string | null | undefined =
						favicon.href || favicon.getAttribute('href');
					const faviconImage = tabElement.querySelector(
						'.tab-favicon'
					) as HTMLImageElement;

					faviconUrl = await this.tabs.proxy.getFavicon(
						faviconUrl as string
					);

					if (faviconUrl && faviconImage) {
						faviconImage.src = faviconUrl;
					} else {
						console.error(
							'Favicon URL or favicon element is missing.'
						);
					}
				} else {
					console.error(
						'No favicon link element found within the iframe document.'
					);
				}
			} catch (error) {
				console.error(
					'An error occurred while setting the favicon:',
					error
				);
			}
		});
	}

	moveTabToPosition(draggedTabId: string, targetTabId: string, e: DragEvent) {
		const orderedTabs = this.tabs.getTabsInOrder();
		const draggedIndex = orderedTabs.findIndex(
			(t: any) => t.id === draggedTabId
		);
		let targetIndex = orderedTabs.findIndex(
			(t: any) => t.id === targetTabId
		);
		if (draggedIndex === -1 || targetIndex === -1) return;

		const targetElement = document.querySelector(
			`[data-tab-id="${targetTabId}"]`
		) as HTMLElement;
		let placeAfter = false;
		if (targetElement) {
			const rect = targetElement.getBoundingClientRect();
			const isRightSide = e.clientX > rect.left + rect.width / 2;
			if (isRightSide) {
				targetIndex++;
				placeAfter = true;
			}
		}

		this.tabs.moveTabInOrder(draggedTabId, targetTabId, placeAfter);
	}

	shouldUngroupBasedOnEdge(
		e: DragEvent,
		draggedTab: any,
		targetTab: any,
		targetElement: HTMLElement
	): boolean {
		if (
			!draggedTab.groupId ||
			!targetTab.groupId ||
			draggedTab.groupId !== targetTab.groupId
		) {
			return draggedTab.groupId && !targetTab.groupId;
		}

		const group = this.tabs
			.getGroups()
			.find((g: any) => g.id === draggedTab.groupId);
		if (!group) return false;

		const groupTabs = this.tabs
			.getTabsInOrder()
			.map((tab: any, index: number) => ({ ...tab, index }))
			.filter((t: any) => t.groupId === group.id)
			.sort((a: any, b: any) => a.index - b.index);

		if (groupTabs.length <= 1) return false;

		const rect = targetElement.getBoundingClientRect();
		const edgeThreshold = Math.min(Math.max(rect.width * 0.3, 50), 100);
		const isFirstTab = groupTabs[0]?.id === targetTab.id;
		const isLastTab = groupTabs[groupTabs.length - 1]?.id === targetTab.id;

		return (
			(isFirstTab && e.clientX < rect.left + edgeThreshold) ||
			(isLastTab && e.clientX > rect.right - edgeThreshold)
		);
	}
}
