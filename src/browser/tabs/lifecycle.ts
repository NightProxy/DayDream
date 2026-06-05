import { createIcons, icons } from 'lucide';
import type { TabsInterface, TabData } from './types';
import { decodeProxiedUrl } from './urlDecoder';

export class TabLifecycle {
	private tabs: TabsInterface;
	scramFrame: any;

	constructor(tabs: TabsInterface) {
		this.tabs = tabs;
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

		const managedFrame = await this.tabs.frameManager!.createManagedFrame(
			id,
			url,
			'main'
		);
		const iframe = managedFrame.iframe;

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
					// First check if the raw path maps directly to an internal
					// URL (e.g. /internal/newtab → ddx://newtab).
					const rawPath = new URL(iframe.src).pathname;
					const internalCheck =
						await this.tabs.proto.getInternalURL(rawPath);
					if (
						typeof internalCheck === 'string' &&
						this.tabs.proto.isRegisteredProtocol(internalCheck)
					) {
						this.tabs.items.addressBar!.value = internalCheck;
					} else {
						// Centralized decode of the iframe URL.
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

		// Snapshot pre-teardown for the recently-closed stack. Must run
		// before iframe.src is cleared / contentWindow is stopped so
		// `closedTabStack.push` can read the live URL/favicon.
		this.tabs.closedTabStack?.push(tabInfo);

		// If this tab is in a split, dissolve the pair so the partner returns
		// to a normal main-pane tab before we tear down.
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

		// Snapshot for the recently-closed stack BEFORE teardown.
		this.tabs.closedTabStack?.push(this.tabs.getTabById(activeTab.id));

		// Capture the URL for the close-log message in decoded form so we
		// don't dump scramjet-encoded gibberish into the user-facing log.
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

		// Snapshot ALL tabs to the recently-closed stack in display order.
		// Pushed oldest-first so the rightmost tab ends up on top (matches
		// Chrome's "Reopen Closed Tab" repeated-press behavior of reopening
		// tabs from right to left).
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

		// Tab strip visual active state. Only the focused/active tab gets
		// `.active`. In a split pair the active tab is whichever side the
		// user is currently focused on; the partner stays `.inactive` but
		// remains visible (it's still a tab). The capsule itself gets a
		// `.has-active` marker so CSS can style the whole capsule.
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

		// Resolve the split pair state, if any.
		const partnerId = tabInfo.splitPartnerId;
		const partner = partnerId
			? this.tabs.getTabById(partnerId)
			: undefined;
		const inSplit = !!partner;

		// When the user clicks one side of a split capsule we want THAT side
		// to become the focused frame (Edge behavior). Update the focus map
		// before reading it.
		if (inSplit && partner && this.tabs.focusedSplitSideByPairKey) {
			this.tabs.focusedSplitSideByPairKey.set(tabInfo.id, tabInfo.id);
			this.tabs.focusedSplitSideByPairKey.set(partner.id, tabInfo.id);

			// Update the capsule indicator (which side has the underline)
			// without a full strip re-render. The data-split-focused attr
			// is read by CSS to draw the focus underline.
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

		// Decide which iframe owns the address bar / nav buttons / legacy
		// `.active` selector. In a split pair this is the user-focused side.
		const focusedTabId = inSplit
			? this.tabs.getSplitFocusedTabId?.(tabId) ?? tabId
			: tabId;
		const focusedTab = this.tabs.getTabById(focusedTabId) ?? tabInfo;
		const focusedIframe =
			this.tabs.frameByTabId.get(focusedTab.id) ??
			(document.getElementById(focusedTab.frameId) as HTMLIFrameElement | null);

		// CSS hides every iframe by default. Visible iframes carry one of
		// these classes:
		//   .active         — the focused frame. Exactly one in the DOM.
		//                     Legacy call-sites that querySelector(
		//                     'iframe.active') get this one.
		//   .split-visible  — the non-focused half of a split pair. Visible
		//                     but not the focus target.
		// Selecting a tab clears all of them and re-applies fresh.
		if (this.tabs.items.frameContainer) {
			this.tabs.items.frameContainer
				.querySelectorAll('iframe.active, iframe.split-visible')
				.forEach((el: Element) => {
					el.classList.remove('active');
					el.classList.remove('split-visible');
				});
		}
		if (focusedIframe) focusedIframe.classList.add('active');

		// Non-focused split partner stays visible alongside the focused one.
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

		// Hand the layout the iframes per pane. In split mode we put the
		// pair's left+right iframes into the split panes; in main mode we
		// show whichever non-split tab is active.
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

		// Devtools panel toggling — delegate to the new manager.
		(window as any).devtools?.onTabSelect(tabId);

		const tabSelectedEvent = new CustomEvent('tabSelected', {
			detail: {
				tabId,
				iframe: focusedIframe,
				tabElement
			}
		});
		document.dispatchEvent(tabSelectedEvent);

		// Address bar reflects the focused iframe's URL.
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
