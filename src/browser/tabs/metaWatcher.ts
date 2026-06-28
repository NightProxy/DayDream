import type { TabsInterface } from './types';
import { decodeProxiedUrl } from './urlDecoder';

export class TabMetaWatcher {
	private tabs: TabsInterface;
	private currentActiveTabId: string | null = null;
	private historyManager: any = null;
	private metaWatchers: Map<string, MutationObserver> = new Map();

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
		this.setupEventListeners();
		this.initHistoryManager();
	}

	private async initHistoryManager() {
		try {
			const { HistoryManager } = await import('@apis/history');
			// Use the shared singleton; multiple HistoryManager instances would
			// each open their own OPFS handle to /data/history.json and race
			// each other (EIO on concurrent writes).
			this.historyManager = HistoryManager.getInstance();
			await this.historyManager.loadFromStorage();
		} catch (error) {
			console.warn('Failed to initialize history manager:', error);
		}
	}

	private setupEventListeners = () => {
		document.addEventListener(
			'tabSelected',
			this.onTabSelected as EventListener
		);

		document.addEventListener(
			'iframeLoaded',
			this.onIframeLoaded as EventListener
		);
	};

	private onTabSelected = (event: Event) => {
		const customEvent = event as CustomEvent;
		const { tabId } = customEvent.detail;

		this.currentActiveTabId = tabId;
	};

	private onIframeLoaded = (event: Event) => {
		const customEvent = event as CustomEvent;
		const { tabId, iframe, tabElement } = customEvent.detail;

		if (tabId === this.currentActiveTabId) {
			this.updateTabMeta(tabId, iframe, tabElement);
		}
	};

	private updateTabMeta = async (
		tabId: string,
		iframe: HTMLIFrameElement,
		tabEl: HTMLElement
	) => {
		const tabData = this.tabs.getTabById(tabId);
		if (!tabData) return;

		const titleEl = tabEl.querySelector('.tab-title') as HTMLElement;
		const faviconEl = tabEl.querySelector(
			'.tab-favicon'
		) as HTMLImageElement;

		let d: Document | null = null;
		let locHref: string | null = null;

		try {
			d = iframe.contentDocument;
			locHref = iframe.contentWindow?.location?.href || null;
		} catch (e) {
			console.warn('Could not access iframe content:', e);
		}

		let pageTitle = 'New Tab';
		let currentUrl = tabData.url;
		let faviconUrl: string | null = null;

		try {
			if (d) {
				pageTitle = d.title?.trim() || 'New Tab';
				if (titleEl && titleEl.textContent !== pageTitle) {
					titleEl.textContent = pageTitle;
					titleEl.setAttribute('title', pageTitle);
				}
				this.tabs.updateTabMetadata(tabId, { title: pageTitle });
				document.dispatchEvent(new CustomEvent('tabMetaChanged', {
					detail: { tabId, changes: { title: pageTitle } },
				}));
			}
		} catch (e) {
			console.warn('Could not update title:', e);
		}

		// Decode up-front so history always gets a clean URL even when
		// updateAddressBar's early-return path (user is typing in the address
		// bar) hands back the raw scramjet URL.
		const decodedFromIframe = locHref
			? decodeProxiedUrl(locHref, this.tabs.proxy)
			: null;
		if (decodedFromIframe) currentUrl = decodedFromIframe;
		this.tabs.updateTabMetadata(tabId, { url: currentUrl });
		document.dispatchEvent(new CustomEvent('tabMetaChanged', {
			detail: { tabId, changes: { url: currentUrl } },
		}));

		try {
			if (locHref && tabEl.classList.contains('active')) {
				const fromAddressBar = await this.updateAddressBar(
					locHref,
					tabId
				);
				// Trust whichever value is more decoded. updateAddressBar may
				// return raw locHref when the address bar is focused; in that
				// case we keep our up-front decode.
				if (
					fromAddressBar &&
					fromAddressBar !== locHref &&
					!fromAddressBar.includes(
						(window as any).SWconfig?.[
							(window as any).ProxySettings
						]?.config?.prefix || '\0'
					)
				) {
					currentUrl = fromAddressBar;
				}
			}
		} catch (e) {
			console.warn('Could not update address bar:', e);
		}

		try {
			if (d && faviconEl) {
				faviconUrl = await this.updateFavicon(
					d,
					iframe,
					faviconEl,
					tabEl
				);
				this.tabs.updateTabMetadata(tabId, {
					favicon: faviconUrl || null
				});
				document.dispatchEvent(new CustomEvent('tabMetaChanged', {
					detail: { tabId, changes: { favicon: faviconUrl || null } },
				}));
				this.tabs.setTabCache(tabId, {
					title: pageTitle,
					favicon: faviconUrl || null,
					url: currentUrl,
					timestamp: Date.now()
				});
			}
		} catch (e) {
			console.warn('Could not update favicon:', e);
		}

		if (this.historyManager && currentUrl && pageTitle !== 'New Tab') {
			try {
				if (
					!window.protocols?.isRegisteredProtocol(currentUrl) &&
					!currentUrl.includes('/internal/')
				) {
					await this.historyManager.addEntry({
						title: pageTitle,
						url: currentUrl,
						favicon: faviconUrl,
						tabId: tabId
					});
				}
			} catch (error) {
				console.warn('Failed to add entry to browsing history:', error);
			}
		}
	};

	private updateAddressBar = async (
		locHref: string,
		tabId: string
	): Promise<string> => {
		// Don't clobber the user's in-progress typing in the address bar.
		// Even though we still return a "best effort" URL, the caller
		// (updateTabMeta) only trusts our return value when it's clearly
		// decoded.
		if (
			this.tabs.items.addressBar &&
			document.activeElement === this.tabs.items.addressBar
		) {
			return locHref;
		}

		let liveURL: URL | null = null;
		try {
			liveURL = new URL(locHref);
		} catch {
			return locHref;
		}

		const tabRef = this.tabs.getTabById(tabId);

		// First chance: the path itself maps to an internal/protocol URL
		// (e.g. /internal/newtab → ddx://newtab).
		const internalCheck = await this.tabs.proto.getInternalURL(
			liveURL.pathname
		);
		if (
			typeof internalCheck === 'string' &&
			window.protocols?.isRegisteredProtocol(internalCheck)
		) {
			const nextVal = internalCheck;
			if (tabRef) tabRef.lastInternalRoute = nextVal;
			if (this.tabs.items.addressBar && nextVal) {
				this.tabs.items.addressBar.value = nextVal;
				if (tabRef) tabRef.lastAddressShown = nextVal;
			}
			return nextVal;
		}

		// Centralized decode (active iframe → registered frames → SWconfig).
		// Preserves the hash if `decodeProxiedUrl` lost it (the per-frame
		// `extractEncodedUrl` codec may not include it).
		let decoded = decodeProxiedUrl(locHref, this.tabs.proxy);
		const hash = liveURL.hash || '';
		if (hash && decoded && !decoded.includes('#')) {
			decoded = decoded + hash;
		}

		// Second chance: decoded path maps to a protocol URL.
		const maybeInternal = await this.tabs.proto.getInternalURL(decoded);
		let nextVal: string;
		if (
			typeof maybeInternal === 'string' &&
			window.protocols?.isRegisteredProtocol(maybeInternal)
		) {
			nextVal = maybeInternal;
			if (tabRef) tabRef.lastInternalRoute = nextVal;
		} else {
			nextVal = decoded;
		}

		if (this.tabs.items.addressBar && nextVal) {
			this.tabs.items.addressBar.value = nextVal;
			if (tabRef) tabRef.lastAddressShown = nextVal;
		}

		return nextVal || locHref;
	};

	private updateFavicon = async (
		document: Document,
		iframe: HTMLIFrameElement,
		faviconEl: HTMLImageElement,
		tabEl: HTMLElement
	): Promise<string | null> => {
		const isHttpIcon = (
			value: string | null | undefined
		): value is string => {
			if (!value) return false;
			return value.startsWith('http://') || value.startsWith('https://');
		};

		const link = document.querySelector<HTMLLinkElement>(
			"link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
		);

		let faviconUrl: string | null = null;

		if (link) {
			faviconUrl = new URL(
				link.getAttribute('href') || '',
				document.baseURI
			).href;
		} else if (iframe.contentWindow?.location?.origin) {
			faviconUrl = iframe.contentWindow.location.origin + '/favicon.ico';
		}

		if (faviconUrl) {
			try {
				// Decode through the central helper so favicon resolution
				// works regardless of whether the URL came in as a
				// per-frame-prefixed scramjet URL or a global-prefix legacy
				// URL.
				const decodedUrl = decodeProxiedUrl(
					faviconUrl,
					this.tabs.proxy
				);

				const iconTarget = isHttpIcon(decodedUrl)
					? decodedUrl
					: isHttpIcon(faviconUrl)
						? faviconUrl
						: null;

				if (!iconTarget) {
					this.clearFavicon(faviconEl, tabEl);
					return null;
				}

				const proxyFavicon =
					await this.tabs.proxy.getFavicon(iconTarget);

				if (
					proxyFavicon &&
					faviconEl.getAttribute('data-favicon') !== proxyFavicon
				) {
					faviconEl.src = proxyFavicon;
					faviconEl.setAttribute('data-favicon', proxyFavicon);
					tabEl.classList.add('has-favicon');
					return proxyFavicon;
				}

				if (faviconEl.getAttribute('data-favicon') !== iconTarget) {
					faviconEl.src = iconTarget;
					faviconEl.setAttribute('data-favicon', iconTarget);
					tabEl.classList.add('has-favicon');
				}

				return iconTarget;
			} catch (e) {
				console.warn('Could not load favicon:', e);
				this.clearFavicon(faviconEl, tabEl);
				return null;
			}
		} else {
			this.clearFavicon(faviconEl, tabEl);
		}

		return null;
	};

	private clearFavicon = (
		faviconEl: HTMLImageElement,
		tabEl: HTMLElement
	) => {
		faviconEl.removeAttribute('src');
		faviconEl.removeAttribute('data-favicon');
		tabEl.classList.remove('has-favicon');
	};

	startMetaWatcher = (
		tabId: string,
		iframe: HTMLIFrameElement,
		tabEl: HTMLElement
	) => {
		this.updateTabMeta(tabId, iframe, tabEl);

		const observer = new MutationObserver(() => {
			this.updateTabMeta(tabId, iframe, tabEl);
		});

		iframe.addEventListener('load', () => {
			const targetNode = iframe.contentDocument?.querySelector('title');
			if (targetNode) {
				observer.observe(targetNode, {
					childList: true,
					subtree: true
				});
			}
		});

		this.metaWatchers.set(tabId, observer);
	};

	stopMetaWatcher = (tabId: string) => {
		const observer = this.metaWatchers.get(tabId);
		if (observer) {
			observer.disconnect();
			this.metaWatchers.delete(tabId);
		}

		if (
			this.historyManager &&
			typeof this.historyManager.recordTabClose === 'function'
		) {
			this.historyManager.recordTabClose(tabId);
		}
	};

	destroy = () => {
		if (
			this.historyManager &&
			typeof this.historyManager.endCurrentSession === 'function'
		) {
			this.historyManager.endCurrentSession().catch((error: any) => {
				console.warn('Failed to end history session:', error);
			});
		}

		document.removeEventListener(
			'tabSelected',
			this.onTabSelected as EventListener
		);
		document.removeEventListener(
			'iframeLoaded',
			this.onIframeLoaded as EventListener
		);
	};
}
