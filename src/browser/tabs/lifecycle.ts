import { createIcons, icons } from 'lucide';
import type { TabsInterface, TabData } from './types';
import { decodeProxiedUrl } from './urlDecoder';

interface UrlOverridesLike {
	getActiveExtId: (kind: 'newtab' | 'bookmarks' | 'history') => string | null;
}

interface ExtMgrLike {
	createExtensionPlugin: (extId: string, opts?: { enforceHostPolicy?: boolean }) => unknown;
	wireAuxiliaryViewChannel?: (
		ctx: unknown,
		iframe: HTMLIFrameElement,
		opts?: { isBackground: boolean },
	) => unknown;
	getRunningContext?: (extId: string) => { ctx: unknown; iframe: HTMLIFrameElement } | undefined;
}

const extensionTabChannels = new Map<string, { close: () => void }>();

export class TabLifecycle {
	private tabs: TabsInterface;
	scramFrame: any;

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
	}

	/**
	 * If `url` is one of the `chrome_url_overrides` slot URLs
	 * (`ddx://newtab`, `ddx://bookmarks`, `ddx://history`) AND an
	 * extension currently owns that slot, return the owning extId
	 * and the absolute `https://<extId>.ddx/<path>` URL to navigate
	 * to. Otherwise null.
	 *
	 * Reads from the host-side `ExtensionUrlOverrides` coordinator
	 * (exposed at `window.extensionUrlOverrides`).
	 */
	private async resolveExtensionOverride(
		url: string,
	): Promise<{ extId: string; url: string } | null> {
		const overrides = (window as { extensionUrlOverrides?: UrlOverridesLike }).extensionUrlOverrides;
		if (!overrides) return null;

		const m = url.match(/^ddx:\/\/([a-z]+)\/*$/i);
		if (!m) return null;
		const kind = m[1].toLowerCase();
		if (kind !== 'newtab' && kind !== 'bookmarks' && kind !== 'history') {
			return null;
		}
		const extId = overrides.getActiveExtId(kind);
		if (!extId) return null;

		const mgr = (window as { extensions?: { getManifest?: (id: string) => unknown } }).extensions;
		const manifest = mgr?.getManifest?.(extId) as { chrome_url_overrides?: Record<string, string> } | null;
		const overridePath = manifest?.chrome_url_overrides?.[kind];
		if (typeof overridePath !== 'string' || overridePath.length === 0) return null;

		const path = overridePath.replace(/^\/+/, '');
		return { extId, url: `https://${extId}.ddx/${path}` };
	}

	/**
	 * Construct a fresh HeliumExtensionPlugin for the given extId,
	 * configured for use in a regular tab (not a hidden extension
	 * iframe).
	 *
	 * `enforceHostPolicy: false` is important: when the user types
	 * a new URL in the address bar of an extension-newtab tab, that
	 * navigation goes through this plugin's request hook. The default
	 * policy would 403 any URL not in the extension's
	 * `host_permissions`, breaking the user's ability to leave the
	 * newtab. The plugin only synthesizes responses for the
	 * extension's `<extId>.ddx` host anyway; everything else falls
	 * through naturally when policy is off.
	 */
	private getExtensionPlugin(extId: string): unknown | null {
		const mgr = (window as { extensions?: ExtMgrLike }).extensions;
		if (!mgr?.createExtensionPlugin) return null;
		try { return mgr.createExtensionPlugin(extId, { enforceHostPolicy: false }); }
		catch (err) {
			console.warn('[TabLifecycle] createExtensionPlugin failed:', err);
			return null;
		}
	}

	/**
	 * Wire the auxiliary channel so the extension-newtab page gets
	 * full chrome.* RPC functionality. Same recipe as popupHost +
	 * offscreen. Stores the channel keyed by tabId so `closeTabById`
	 * can close it cleanly.
	 */
	private wireExtensionChannel(
		extId: string,
		iframe: HTMLIFrameElement,
		tabId: string,
	): void {
		const mgr = (window as { extensions?: ExtMgrLike }).extensions;
		if (!mgr?.wireAuxiliaryViewChannel || !mgr.getRunningContext) {
			console.warn('[TabLifecycle] extension manager API not ready; chrome.* RPCs will hang in this tab');
			return;
		}
		const running = mgr.getRunningContext(extId);
		if (!running) return;
		try {
			const channel = mgr.wireAuxiliaryViewChannel(running.ctx, iframe, { isBackground: false }) as { close: () => void };
			if (channel && typeof channel.close === 'function') {
				extensionTabChannels.set(tabId, channel);
			}
		} catch (err) {
			console.warn('[TabLifecycle] wireAuxiliaryViewChannel failed:', err);
		}
	}

	createTab = async (url: string = 'ddx://newtab') => {
		this.tabs.tabCount++;
		console.log(
			'[TabLifecycle] createTab() called for url:',
			url,
			'tabCount:',
			this.tabs.tabCount
		);
		let tabTitle = 'New Tab';

		const id = `tab-${this.tabs.tabCount}`;

		const overrideInfo = await this.resolveExtensionOverride(url);
		const plugins: unknown[] = [];
		let overrideExtId: string | null = null;
		let overrideAbsoluteUrl: string | null = null;
		if (overrideInfo) {
			overrideExtId = overrideInfo.extId;
			overrideAbsoluteUrl = overrideInfo.url;
			const plugin = this.getExtensionPlugin(overrideInfo.extId);
			if (plugin) plugins.push(plugin);
		}

		const managedFrame = await this.tabs.frameManager!.createManagedFrame(
			id,
			overrideAbsoluteUrl ?? url,
			'main',
			plugins.length > 0 ? { plugins } : undefined,
		);
		const iframe = managedFrame.iframe;

		if (overrideExtId && plugins.length > 0) {
			this.wireExtensionChannel(overrideExtId, iframe, id);
		}

		console.log(
			'[TabLifecycle] Created iframe:',
			iframe.id,
			'for tabId:',
			id,
			'src:',
			iframe.getAttribute('src')
		);

		const tab = this.tabs.ui.createElement(
			'div',
			{
				class: 'tab inactive transition-all duration-200 ease-out tab-anim',
				id: id,
				'data-component': 'tab'
			},
			[
				this.tabs.ui.createElement(
					'div',
					{ class: 'tab-content flex gap-1 items-center' },
					[
						this.tabs.ui.createElement('div', {
							class: 'tab-group-color'
						}),
						this.tabs.ui.createElement('img', {
							class: 'tab-favicon max-w-4 max-h-4'
						}),
						this.tabs.ui.createElement(
							'div',
							{ class: 'tab-title' },
							[tabTitle]
						),
						this.tabs.ui.createElement('div', {
							class: 'tab-drag-handle'
						}),
						this.tabs.ui.createElement(
							'button',
							{
								class: 'tab-close',
								id: `close-${id}`
							},
							[
								this.tabs.ui.createElement(
									'span',
									{ class: 'x' },
									[
										this.tabs.ui.createElement(
											'i',
											{
												'data-lucide': 'x',
												class: 'h-3.5 w-3.5'
											},
											[]
										)
									]
								)
							]
						)
					]
				)
			]
		);

		const tabStyleMode = this.tabs.items.tabBar?.getAttribute('styleMode');
		if (tabStyleMode) {
			tab.setAttribute('styleMode', tabStyleMode);
		}

		iframe.addEventListener('load', async () => {
			console.log(
				'[TabLifecycle] iframe load event fired for:',
				iframe.id
			);
			try {
				if (iframe.contentWindow) {
					this.tabs.pageClient(iframe);
				} else {
					console.error('Iframe contentWindow is not accessible.');
				}

				const tabInfo = this.tabs.getTabById(id);
				if (tabInfo && tabInfo.tab.classList.contains('active')) {
					const rawPath = new URL(iframe.src).pathname;
					const internalCheck =
						await this.tabs.proto.getInternalURL(rawPath);
					if (
						typeof internalCheck === 'string' &&
						this.tabs.proto.isRegisteredProtocol(internalCheck)
					) {
						this.tabs.items.addressBar!.value = internalCheck;
					} else {
						const decoded = decodeProxiedUrl(
							iframe.src,
							this.tabs.proxy
						);
						const decodedCheck =
							await this.tabs.proto.getInternalURL(decoded);
						if (
							typeof decodedCheck === 'string' &&
							this.tabs.proto.isRegisteredProtocol(decodedCheck)
						) {
							this.tabs.items.addressBar!.value = decodedCheck;
						} else {
							this.tabs.items.addressBar!.value = decoded;
						}
					}
				}

				const iframeLoadedEvent = new CustomEvent('iframeLoaded', {
					detail: {
						tabId: id,
						iframe,
						tabElement: tab
					}
				});
				document.dispatchEvent(iframeLoadedEvent);

				console.log(
					'[TabLifecycle] Starting metaWatcher for tabId:',
					id
				);
				this.tabs.startMetaWatcher(id, iframe, tab);
			} catch (error) {
				console.error(
					'An error occurred while loading the iframe:',
					error
				);
			}
		});

		tab.addEventListener('click', () => {
			this.selectTab(id);
		});

		const closeButton = tab.querySelector(`#close-${id}`);
		if (closeButton) {
			closeButton.addEventListener('click', async () => {
				await this.closeTabById(id);
			});
		} else {
			console.warn(`Close button not found for tab: ${id}`);
		}

		this.tabs.items.tabBar!.appendChild(tab);
		const mainPane =
			(this.tabs.splitLayout?.getPane('main') as HTMLElement | null) ??
			(this.tabs.items.frameContainer!.querySelector(
				'[data-pane="main"]'
			) as HTMLElement | null);
		this.tabs.frameManager!.attachFrame(
			id,
			mainPane ?? this.tabs.items.frameContainer!
		);
		createIcons({ icons });

		const tabData: TabData = {
			id,
			tab,
			iframe,
			title: tabTitle,
			favicon: null,
			url,
			groupId: undefined,
			isPinned: false,
			splitPlacement: 'main',
			splitPartnerId: undefined,
			frameId: managedFrame.frameId,
			lastInternalRoute: undefined,
			lastAddressShown: undefined,
			cache: undefined,
			devtoolsPanel: undefined
		};

		this.tabs.registerTab(tabData);
		document.dispatchEvent(new CustomEvent('tabCreated', {
			detail: { tabId: id, url, title: tabTitle, iframe, tabElement: tab },
		}));
		this.tabs.syncTabVisualState(id);
		this.tabs.renderTabStrip();

		this.selectTab(id);

		this.tabs.logger.createLog(`Created tab: ${url}`);
		return id;
	};

	closeTabById = async (id: string) => {
		console.log('[TabLifecycle] closeTabById() called for tabId:', id);
		const tabInfo = this.tabs.getTabById(id);
		if (!tabInfo) {
			console.log('[TabLifecycle] Tab not found:', id);
			return;
		}

		this.tabs.closedTabStack?.push(tabInfo);

		if (tabInfo.splitPartnerId) {
			this.tabs.unsplitTab?.(id);
		}

		const orderedTabs = this.tabs.getTabsInOrder();
		const currentTabIndex = orderedTabs.findIndex(tab => tab.id === id);

		console.log('[TabLifecycle] Stopping metaWatcher for tabId:', id);
		await this.tabs.stopMetaWatcher(id);
		console.log(
			'[TabLifecycle] Cleaning up pageClient for iframe:',
			tabInfo.iframe.id
		);
		this.tabs.pageClientModule?.cleanupIframe(tabInfo.iframe.id);
		(window as any).devtools?.onTabClose(id);

		try {
			tabInfo.iframe.src = 'about:blank';
			tabInfo.iframe.contentWindow?.stop();
			console.log(
				'[TabLifecycle] Cleared iframe content for:',
				tabInfo.iframe.id
			);
		} catch (e) {
			console.warn('Could not clear iframe:', e);
		}

		tabInfo.tab.remove();
		this.tabs.frameManager?.cleanupFrame(id);
		console.log(
			'[TabLifecycle] Removed tab and iframe DOM elements via frame manager'
		);

		const extChannel = extensionTabChannels.get(id);
		if (extChannel) {
			try { extChannel.close(); } catch (err) {
				console.warn('[TabLifecycle] extension channel close threw:', err);
			}
			extensionTabChannels.delete(id);
		}

		this.tabs.removeTab(id);
		this.tabs.renderTabStrip();
		console.log(
			'[TabLifecycle] Removed tab from tabs array, remaining tabs:',
			this.tabs.getTabsInOrder().length
		);
		this.updateTabAttributes();

		const tabClosedEvent = new CustomEvent('tabClosed', {
			detail: { tabId: id }
		});
		document.dispatchEvent(tabClosedEvent);

		const remainingTabs = this.tabs.getTabsInOrder();
		if (remainingTabs.length > 0) {
			let nextTabToSelect: TabData | null = null;

			switch (true) {
				case currentTabIndex > 0 &&
					remainingTabs[currentTabIndex - 1] !== undefined:
					nextTabToSelect = remainingTabs[currentTabIndex - 1];
					break;
				case remainingTabs[currentTabIndex] !== undefined:
					nextTabToSelect = remainingTabs[currentTabIndex];
					break;
				default:
					nextTabToSelect = remainingTabs[remainingTabs.length - 1];
			}

			if (nextTabToSelect) {
				this.selectTab(nextTabToSelect.id);
			}
		} else if (remainingTabs.length === 0) {
			this.createTab('ddx://newtab/');
		}

		this.tabs.logger.createLog(`Closed tab: ${id}`);
	};

	closeCurrentTab = async () => {
		console.log('[TabLifecycle] closeCurrentTab() called');
		const activeTabId = this.tabs.activeTabId;
		const activeTab = activeTabId
			? this.tabs.tabElementById.get(activeTabId)
			: (Array.from(
					this.tabs.ui.queryComponentAll('tab', this.tabs.el)
				).find((tab: any) =>
					(tab as HTMLElement).classList.contains('active')
				) as HTMLElement | undefined);
		const activeIFrame = activeTab?.id
			? this.tabs.frameByTabId.get(activeTab.id)
			: undefined;

		if (!activeTab || !activeIFrame) {
			console.log('[TabLifecycle] No active tab or iframe found');
			return;
		}

		console.log(
			'[TabLifecycle] Closing active tab:',
			activeTab.id,
			'iframe:',
			activeIFrame.id
		);

		this.tabs.closedTabStack?.push(this.tabs.getTabById(activeTab.id));

		const activeIframeUrl = decodeProxiedUrl(
			activeIFrame.src,
			this.tabs.proxy
		);
		const tabPosition = parseInt(activeTab.getAttribute('tab') || '0');

		console.log(
			'[TabLifecycle] Stopping metaWatcher for active tab:',
			activeTab.id
		);
		await this.tabs.stopMetaWatcher(activeTab.id);
		console.log(
			'[TabLifecycle] Cleaning up pageClient for active iframe:',
			activeIFrame.id
		);
		this.tabs.pageClientModule?.cleanupIframe(activeIFrame.id);

		try {
			activeIFrame.src = 'about:blank';
			activeIFrame.contentWindow?.stop();
			console.log('[TabLifecycle] Cleared active iframe content');
		} catch (e) {
			console.warn('Could not clear iframe:', e);
		}

		const tabClosedEvent = new CustomEvent('tabClosed', {
			detail: { tabId: activeTab.id }
		});
		document.dispatchEvent(tabClosedEvent);

		activeTab.remove();
		this.tabs.frameManager?.cleanupFrame(activeTab.id);
		console.log('[TabLifecycle] Active iframe removed via frame manager');

		this.tabs.removeTab(activeTab.id);
		this.tabs.renderTabStrip();

		this.updateTabAttributes();

		const remainingTabs = document.querySelectorAll('.tab');
		if (remainingTabs.length > 0) {
			let nextTabToSelect: HTMLElement | null = null;

			for (const tab of remainingTabs) {
				if (parseInt(tab.getAttribute('tab') || '0') === tabPosition) {
					nextTabToSelect = tab as HTMLElement;
					break;
				}
			}

			if (!nextTabToSelect && tabPosition > 0) {
				for (const tab of remainingTabs) {
					if (
						parseInt(tab.getAttribute('tab') || '0') ===
						tabPosition - 1
					) {
						nextTabToSelect = tab as HTMLElement;
						break;
					}
				}
			}

			if (!nextTabToSelect && remainingTabs.length > 0) {
				nextTabToSelect = remainingTabs[0] as HTMLElement;
			}

			if (nextTabToSelect) {
				nextTabToSelect.click();
			}
		}

		this.tabs.logger.createLog(`Closed tab: ${activeIframeUrl}`);
	};

	closeAllTabs = async () => {
		console.log(
			'[TabLifecycle] closeAllTabs() called, total tabs:',
			this.tabs.getTabsInOrder().length
		);

		for (const tabData of this.tabs.getTabsInOrder()) {
			this.tabs.closedTabStack?.push(tabData);
		}

		await Promise.all(
			this.tabs.getTabsInOrder().map(async tabData => {
				console.log(
					'[TabLifecycle] Stopping metaWatcher for tabId:',
					tabData.id
				);
				await this.tabs.stopMetaWatcher(tabData.id);

				const tabClosedEvent = new CustomEvent('tabClosed', {
					detail: { tabId: tabData.id }
				});
				document.dispatchEvent(tabClosedEvent);
			})
		);

		console.log('[TabLifecycle] Cleaning up all pageClient resources');
		this.tabs.pageClientModule?.cleanupAll();

		this.tabs.getTabsInOrder().forEach(tabData => {
			this.tabs.frameManager?.cleanupFrame(tabData.id);
		});
		console.log('[TabLifecycle] Removed all iframes');

		this.tabs.ui.queryComponentAll('tab').forEach((tab: HTMLElement) => {
			tab.remove();
		});
		console.log('[TabLifecycle] Removed all tab elements');

		this.tabs.getTabsInOrder().forEach(tab => {
			this.tabs.removeTab(tab.id);
		});
		this.tabs.renderTabStrip();
		console.log('[TabLifecycle] Cleared tabs array');

		this.tabs.logger.createLog(`Closed all tabs`);
	};

	async selectTab(tabId: string) {
		const tabInfo = this.tabs.getTabById(tabId);
		if (!tabInfo) return;

		const tabElement =
			this.tabs.tabElementById.get(tabId) ||
			(document.getElementById(tabId) as HTMLElement);
		if (!tabElement) return;

		const allTabs = this.tabs.items.tabBar!.querySelectorAll('.tab');
		allTabs.forEach((tab: Element) => {
			tab.classList.remove('active');
			tab.classList.add('inactive');
		});
		this.tabs.items.tabBar!.querySelectorAll(
			'[data-component="split-capsule"]'
		).forEach((c: Element) => c.classList.remove('has-active'));

		tabElement.classList.remove('inactive');
		tabElement.classList.add('active');
		const capsule = tabElement.closest(
			'[data-component="split-capsule"]'
		) as HTMLElement | null;
		if (capsule) capsule.classList.add('has-active');

		const partnerId = tabInfo.splitPartnerId;
		const partner = partnerId
			? this.tabs.getTabById(partnerId)
			: undefined;
		const inSplit = !!partner;

		if (inSplit && partner && this.tabs.focusedSplitSideByPairKey) {
			this.tabs.focusedSplitSideByPairKey.set(tabInfo.id, tabInfo.id);
			this.tabs.focusedSplitSideByPairKey.set(partner.id, tabInfo.id);

			const capsuleEl = tabInfo.tab.closest(
				'[data-component="split-capsule"]'
			) as HTMLElement | null;
			if (capsuleEl) {
				capsuleEl
					.querySelectorAll<HTMLElement>('.tab')
					.forEach(t => {
						const tid = t.getAttribute('data-tab-id');
						t.dataset.splitFocused =
							tid === tabInfo.id ? 'true' : 'false';
					});
			}
		}

		const focusedTabId = inSplit
			? this.tabs.getSplitFocusedTabId?.(tabId) ?? tabId
			: tabId;
		const focusedTab = this.tabs.getTabById(focusedTabId) ?? tabInfo;
		const focusedIframe =
			this.tabs.frameByTabId.get(focusedTab.id) ??
			(document.getElementById(focusedTab.frameId) as HTMLIFrameElement | null);

		if (this.tabs.items.frameContainer) {
			this.tabs.items.frameContainer
				.querySelectorAll('iframe.active, iframe.split-visible')
				.forEach((el: Element) => {
					el.classList.remove('active');
					el.classList.remove('split-visible');
				});
		}
		if (focusedIframe) focusedIframe.classList.add('active');

		if (inSplit && partner) {
			const partnerIframe = this.tabs.frameByTabId.get(partner.id);
			if (partnerIframe && partnerIframe !== focusedIframe) {
				partnerIframe.classList.add('split-visible');
			}
			const myIframe = this.tabs.frameByTabId.get(tabInfo.id);
			if (myIframe && myIframe !== focusedIframe) {
				myIframe.classList.add('split-visible');
			}
		}

		if (inSplit && partner) {
			const leftTab =
				tabInfo.splitPlacement === 'split-left' ? tabInfo : partner;
			const rightTab =
				tabInfo.splitPlacement === 'split-right' ? tabInfo : partner;
			const leftIframe =
				this.tabs.frameByTabId.get(leftTab.id) ?? null;
			const rightIframe =
				this.tabs.frameByTabId.get(rightTab.id) ?? null;
			this.tabs.splitLayout?.apply({
				mainIframe: null,
				leftIframe,
				rightIframe,
				focusedSide:
					focusedTabId === leftTab.id ? 'left' : 'right'
			});
		} else {
			this.tabs.splitLayout?.apply({
				mainIframe:
					this.tabs.frameByTabId.get(tabId) ?? null,
				leftIframe: null,
				rightIframe: null,
				focusedSide: null
			});
		}

		(window as any).devtools?.onTabSelect(tabId);

		const tabSelectedEvent = new CustomEvent('tabSelected', {
			detail: {
				tabId,
				iframe: focusedIframe,
				tabElement
			}
		});
		document.dispatchEvent(tabSelectedEvent);

		if (focusedIframe) {
			const rawPath = new URL(focusedIframe.src).pathname;
			const internalCheck = await this.tabs.proto.getInternalURL(
				rawPath
			);
			if (
				typeof internalCheck === 'string' &&
				this.tabs.proto.isRegisteredProtocol(internalCheck)
			) {
				this.tabs.items.addressBar!.value = internalCheck;
			} else {
				const decoded = decodeProxiedUrl(
					focusedIframe.src,
					this.tabs.proxy
				);
				const decodedCheck =
					await this.tabs.proto.getInternalURL(decoded);
				if (
					typeof decodedCheck === 'string' &&
					this.tabs.proto.isRegisteredProtocol(decodedCheck)
				) {
					this.tabs.items.addressBar!.value = decodedCheck;
				} else {
					this.tabs.items.addressBar!.value = decoded;
				}
			}
		}

		this.tabs.logger.createLog(
			`Selected tab: ${focusedTab.url || focusedTab.id}`
		);
	}

	selectTabById = (id: string) => {
		this.selectTab(id);
		this.tabs.logger.createLog(`Selected tab: ${id}`);
	};

	updateTabAttributes = () => {
		const tabElements = this.tabs.ui.queryComponentAll(
			'tab',
			this.tabs.items.tabBar!
		);

		tabElements.forEach((element: HTMLElement, index: number) => {
			element.setAttribute('tab', index.toString());
		});
	};
}
