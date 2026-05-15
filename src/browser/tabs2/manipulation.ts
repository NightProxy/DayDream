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

		// Decode iframe.src before passing to createTab. createTab → processUrl
		// → convertURL re-encodes through the proxy; passing an already-encoded
		// scramjet URL would double-encode it. Falls back to tabInfo.url (the
		// original creation URL) which is generally already plain.
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
