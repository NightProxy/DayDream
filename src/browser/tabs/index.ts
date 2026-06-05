import { Nightmare as UI } from '@pkgs/Nightmare';
import { Protocols } from '@browser/protocols';
import { Items } from '@browser/items';
import { Logger } from '@apis/logging';
import { SettingsAPI } from '@apis/settings';
import { EventSystem } from '@apis/events';
import { Proxy } from '@apis/proxy';
import { BookmarkManager as BM } from '@apis/bookmarks';
import { arrayMove } from '@dnd-kit/sortable';

import type {
	TabsInterface,
	TabGroup,
	TabData,
	TabSplitPlacement,
	TabCacheEntry,
	VisualOrderMode,
	VisualTabOrderEntry
} from './types';
import {
	getPinnedTabs,
	getUngroupedUnpinnedTabs,
	getGroupTabs,
	getVisualTabOrder,
	runInvariantChecks,
	shouldRunInvariantChecks
} from './invariants';
import { BookmarkManager } from './bookmarks';
import { TabLifecycle } from './lifecycle';
import { TabManipulation } from './manipulation';
import { TabContextMenu } from './contextMenu';
import { TabPageClient } from './pageClient';
import { TabMetaWatcher } from './metaWatcher';
import { TabHistoryIntegration } from './historyIntegration';
import { TabPinManager2 } from './pinManager';
import { TabGroupManager2 } from './groupManager';
import { TabFrameManager } from './frameManager';
import { SplitLayoutManager } from './splitLayout';
import { TabClosedStack } from './closedTabStack';
import { TabNavStack } from './navStack';
import { AuxiliaryMenus } from './auxiliaryMenus';
import { decodeIframeUrl, decodeProxiedUrl } from './urlDecoder';

type DragItemKind = 'tab' | 'group';

interface DragAction {
	type:
		| 'REORDER_PINNED'
		| 'REORDER_UNGROUPED'
		| 'REORDER_WITHIN_GROUP'
		| 'MOVE_TAB_TO_GROUP'
		| 'MOVE_TAB_BETWEEN_GROUPS'
		| 'MOVE_TAB_OUT_OF_GROUP'
		| 'MOVE_PINNED_TO_GROUP'
		| 'REORDER_GROUPS';
	tabId?: string;
	groupId?: string;
	toGroupId?: string;
	fromGroupId?: string;
	toIndex?: number;
}

class Tabs implements TabsInterface {
	ui: UI;
	proto: Protocols;
	items: Items;
	logger: Logger;
	settings: SettingsAPI;
	eventsAPI: EventSystem;
	tabCount: number;
	activeTabId: string | null;
	tabs: TabData[];
	groups: TabGroup[];
	frameByTabId: Map<string, HTMLIFrameElement>;
	tabElementById: Map<string, HTMLElement>;
	tabIdsByGroupId: Map<string, Set<string>>;
	groupHeaderElementById: Map<string, HTMLElement>;
	pinnedTabIds: Set<string>;
	splitByTabId: Map<string, TabSplitPlacement>;
	tabCacheById: Map<string, TabCacheEntry>;
	el: HTMLDivElement;
	instanceId: number;
	styleEl: HTMLStyleElement;
	proxy: Proxy;
	bookmarkManager: BM;
	swConfig: any;
	proxySetting: string;
	keyboard: any;

	pageClientModule: TabPageClient;
	frameManager?: TabFrameManager;
	splitLayout?: SplitLayoutManager;
	/**
	 * For a split pair {a,b}, this map holds focusedSplitSideByPairKey[a]=focused
	 * and focusedSplitSideByPairKey[b]=focused (same value). The "focused" tabId
	 * is which side of the pair owns the address bar / nav buttons / page input.
	 */
	focusedSplitSideByPairKey: Map<string, string> = new Map();
	groupManager?: TabGroupManager2;
	pinManager?: TabPinManager2;
	closedTabStack: TabClosedStack;
	navStack: TabNavStack;
	auxiliaryMenus: AuxiliaryMenus;
	nightmarePlugins?: any;
	closeAllTabsInGroup?: (groupId: string) => Promise<void>;

	private bookmarkModule: BookmarkManager;
	private lifecycleModule: TabLifecycle;
	private manipulationModule: TabManipulation;
	private contextMenuModule: TabContextMenu;
	private metaWatcherModule: TabMetaWatcher;
	private historyIntegration: TabHistoryIntegration;
	private verticalTabsEnabled = false;
	private verticalTabsCollapsed = true;
	private dragActiveId: string | null = null;
	private dragActiveKind: DragItemKind | null = null;
	private dragPreviewTargetId: string | null = null;
	private headerExtentRafHandle: number | null = null;

	constructor(
		proto: any,
		swConfig: any,
		proxySetting: string,
		items: Items,
		proxy: Proxy
	) {
		this.ui = new UI();
		this.proto = proto;
		this.items = items;
		this.logger = new Logger();
		this.settings = new SettingsAPI();
		this.eventsAPI = new EventSystem();
		this.tabCount = 0;
		this.activeTabId = null;
		this.tabs = [];
		this.groups = [];
		this.frameByTabId = new Map();
		this.tabElementById = new Map();
		this.tabIdsByGroupId = new Map();
		this.groupHeaderElementById = new Map();
		this.pinnedTabIds = new Set();
		this.splitByTabId = new Map();
		this.tabCacheById = new Map();
		this.el = window.d.querySelector('#root') as HTMLDivElement;
		this.proxy = proxy;
		this.bookmarkManager = new BM();
		this.swConfig = swConfig;
		this.proxySetting = proxySetting;
		this.instanceId = 1;

		this.styleEl = document.createElement('style');
		this.el.appendChild(this.styleEl);

		this.bookmarkModule = new BookmarkManager(this);
		this.frameManager = new TabFrameManager(this);
		this.splitLayout = new SplitLayoutManager(this);
		this.lifecycleModule = new TabLifecycle(this);
		this.manipulationModule = new TabManipulation(this);
		this.contextMenuModule = new TabContextMenu(this);
		this.pageClientModule = new TabPageClient(this);
		this.metaWatcherModule = new TabMetaWatcher(this);
		this.historyIntegration = new TabHistoryIntegration(this);
		this.pinManager = new TabPinManager2(this);
		this.groupManager = new TabGroupManager2(this);
		this.closedTabStack = new TabClosedStack(this);
		this.navStack = new TabNavStack(this);
		this.auxiliaryMenus = new AuxiliaryMenus(this);
		this.closeAllTabsInGroup = (groupId: string) =>
			this.groupManager!.closeAllTabsInGroup(groupId);

		this.initBookmarkManager();
	}

	private async initBookmarkManager() {
		await this.bookmarkModule.init();
	}

	get tabEls() {
		return Array.prototype.slice.call(
			this.items.queryComponentAll('tab', this.el)
		);
	}

	get bookmarkUI() {
		return this.bookmarkModule;
	}

	getTabsInOrder = () => this.tabs;

	searchOpen(query: string): Array<{ tabId: string; title: string; url: string; favicon: string | null }> {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return this.tabs
			.filter((t) => {
				const title = (t.title || '').toLowerCase();
				const url = (t.url || '').toLowerCase();
				return title.includes(q) || url.includes(q);
			})
			.map((t) => ({
				tabId: t.id,
				title: t.title || '(untitled)',
				url: t.url || '',
				favicon: t.favicon,
			}));
	}

	getPinnedTabs = () => getPinnedTabs(this.tabs);

	getUngroupedUnpinnedTabs = () => getUngroupedUnpinnedTabs(this.tabs);

	getGroupTabs = (groupId: string) => getGroupTabs(this, groupId);

	getVisualTabOrder = (mode: VisualOrderMode): VisualTabOrderEntry[] => {
		return getVisualTabOrder(this, mode);
	};

	getTabById = (id: string) => this.tabs.find(tab => tab.id === id);

	getTabIndex = (id: string) => this.tabs.findIndex(tab => tab.id === id);

	registerTab = (tabData: TabData) => {
		this.tabs.push(tabData);
		this.tabElementById.set(tabData.id, tabData.tab);
		this.frameByTabId.set(tabData.id, tabData.iframe);
		this.splitByTabId.set(tabData.id, tabData.splitPlacement);
		if (tabData.isPinned) this.pinnedTabIds.add(tabData.id);
		if (tabData.cache) this.tabCacheById.set(tabData.id, tabData.cache);
		this.syncGroupSets();
	};

	removeTab = (id: string) => {
		const tab = this.getTabById(id);
		if (!tab) return undefined;

		if (tab.groupId) {
			const group = this.getGroupById(tab.groupId);
			if (group) {
				group.tabIds = group.tabIds.filter(tabId => tabId !== id);
				if (group.tabIds.length === 0) {
					this.groups = this.groups.filter(g => g.id !== group.id);
				}
			}
		}

		this.tabs = this.tabs.filter(t => t.id !== id);
		this.tabElementById.delete(id);
		this.frameByTabId.delete(id);
		this.pinnedTabIds.delete(id);
		this.splitByTabId.delete(id);
		this.tabCacheById.delete(id);
		if (this.activeTabId === id) this.activeTabId = null;
		this.syncGroupSets();
		return tab;
	};

	moveTabInOrder = (
		draggedTabId: string,
		targetTabId: string,
		placeAfter = false
	) => {
		const draggedIndex = this.getTabIndex(draggedTabId);
		let targetIndex = this.getTabIndex(targetTabId);
		if (draggedIndex === -1 || targetIndex === -1) return;
		if (placeAfter) targetIndex += 1;
		const [removed] = this.tabs.splice(draggedIndex, 1);
		if (!removed) return;
		if (draggedIndex < targetIndex) targetIndex -= 1;
		this.tabs.splice(targetIndex, 0, removed);
	};

	reorderPinned = (tabId: string, toIndex: number) => {
		const pinned = this.getPinnedTabs();
		const fromIndex = pinned.findIndex(tab => tab.id === tabId);
		if (fromIndex === -1) return;
		const nextPinned = arrayMove(
			pinned,
			fromIndex,
			Math.max(0, Math.min(toIndex, pinned.length - 1))
		);
		const pinnedIds = new Set(nextPinned.map(tab => tab.id));
		const rest = this.tabs.filter(tab => !pinnedIds.has(tab.id));
		this.tabs = [...nextPinned, ...rest];
	};

	reorderUngrouped = (tabId: string, toIndex: number) => {
		const ungrouped = this.getUngroupedUnpinnedTabs();
		const fromIndex = ungrouped.findIndex(tab => tab.id === tabId);
		if (fromIndex === -1) return;
		const nextUngrouped = arrayMove(
			ungrouped,
			fromIndex,
			Math.max(0, Math.min(toIndex, ungrouped.length - 1))
		);
		const map = new Map(nextUngrouped.map((tab, idx) => [tab.id, idx]));
		const ungroupedSet = new Set(nextUngrouped.map(tab => tab.id));
		const stable = this.tabs.filter(tab => !ungroupedSet.has(tab.id));
		const sortedUngrouped = [...nextUngrouped].sort(
			(a, b) => (map.get(a.id) ?? 0) - (map.get(b.id) ?? 0)
		);
		this.tabs = [...stable, ...sortedUngrouped];
		this.rebuildTabsOrderFromLanes();
	};

	reorderWithinGroup = (tabId: string, groupId: string, toIndex: number) => {
		const group = this.getGroupById(groupId);
		if (!group) return;
		const fromIndex = group.tabIds.indexOf(tabId);
		if (fromIndex === -1) return;
		group.tabIds = arrayMove(
			group.tabIds,
			fromIndex,
			Math.max(0, Math.min(toIndex, group.tabIds.length - 1))
		);
		this.rebuildTabsOrderFromLanes();
	};

	reorderGroups = (groupId: string, toIndex: number) => {
		const fromIndex = this.groups.findIndex(group => group.id === groupId);
		if (fromIndex === -1) return;
		this.groups = arrayMove(
			this.groups,
			fromIndex,
			Math.max(0, Math.min(toIndex, this.groups.length - 1))
		);
		this.rebuildTabsOrderFromLanes();
	};

	getGroups = () => this.groups;

	getGroupById = (groupId: string) =>
		this.groups.find(group => group.id === groupId);

	registerGroup = (group: TabGroup) => {
		if (this.getGroupById(group.id)) return;
		this.groups.push(group);
		this.syncGroupSets();
	};

	updateTabGroup = (tabId: string, groupId: string | undefined) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		if (tab.groupId) {
			const previous = this.getGroupById(tab.groupId);
			if (previous)
				previous.tabIds = previous.tabIds.filter(id => id !== tabId);
		}
		tab.groupId = groupId;
		if (groupId) {
			const next = this.getGroupById(groupId);
			if (next && !next.tabIds.includes(tabId)) next.tabIds.push(tabId);
		}
		this.syncGroupSets();
	};

	isTabPinned = (tabId: string) => this.pinnedTabIds.has(tabId);

	setTabPinned = (tabId: string, pinned: boolean) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		tab.isPinned = pinned;
		if (pinned) {
			this.pinnedTabIds.add(tabId);
			tab.groupId = undefined;
		} else {
			this.pinnedTabIds.delete(tabId);
		}
	};

	syncTabVisualState = (tabId: string) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		this.ui.setState(tab.tab, tab.isPinned ? 'pinned' : null);
		tab.tab.classList.toggle('pinned', tab.isPinned);
		if (tab.groupId) {
			tab.tab.setAttribute('data-group-id', tab.groupId);
			const group = this.getGroupById(tab.groupId);
			if (group) tab.tab.style.setProperty('--group-color', group.color);
		} else {
			tab.tab.removeAttribute('data-group-id');
			tab.tab.style.removeProperty('--group-color');
		}
	};

	private syncTabGroupPosition(
		tabId: string,
		visibleTabIds: Set<string>
	): void {
		const tab = this.getTabById(tabId);
		if (!tab?.groupId) {
			tab?.tab.removeAttribute('data-group-position');
			return;
		}

		const group = this.getGroupById(tab.groupId);
		const visibleGroupTabs = (group?.tabIds || []).filter(id =>
			visibleTabIds.has(id)
		);
		const index = visibleGroupTabs.indexOf(tabId);
		let position = 'middle';

		if (visibleGroupTabs.length <= 1) {
			position = 'single';
		} else if (index === 0) {
			position = 'start';
		} else if (index === visibleGroupTabs.length - 1) {
			position = 'end';
		}

		tab.tab.setAttribute('data-group-position', position);
	}

	setTabSplitPlacement = (tabId: string, placement: TabSplitPlacement) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		tab.splitPlacement = placement;
		this.splitByTabId.set(tabId, placement);
		this.frameManager?.setFramePlacement(tabId, placement);
	};

	/**
	 * Pair `partnerTabId` with the active tab into a 2-pane split. The active
	 * tab becomes split-left, the partner becomes split-right. The active tab
	 * keeps its existing focus. If either tab is already in a split, that
	 * existing split is dissolved first.
	 */
	splitWithActiveTab = (partnerTabId: string): boolean => {
		const activeId = this.activeTabId;
		if (!activeId) return false;
		if (activeId === partnerTabId) return false;
		const active = this.getTabById(activeId);
		const partner = this.getTabById(partnerTabId);
		if (!active || !partner) return false;
		if (active.isPinned || partner.isPinned) return false;

		// Dissolve any pre-existing splits both tabs may be in.
		if (active.splitPartnerId) this.unsplitTab(active.id);
		if (partner.splitPartnerId) this.unsplitTab(partner.id);

		active.splitPartnerId = partner.id;
		partner.splitPartnerId = active.id;
		this.setTabSplitPlacement(active.id, 'split-left');
		this.setTabSplitPlacement(partner.id, 'split-right');

		// Default focus = the partner tab the user just split off into.
		this.focusedSplitSideByPairKey.set(active.id, partner.id);
		this.focusedSplitSideByPairKey.set(partner.id, partner.id);

		this.renderTabStrip();
		this.selectTab(activeId);
		return true;
	};

	/** Dissolve the split that `tabId` is part of. Both tabs return to main. */
	unsplitTab = (tabId: string): void => {
		const tab = this.getTabById(tabId);
		if (!tab || !tab.splitPartnerId) return;
		const partner = this.getTabById(tab.splitPartnerId);
		tab.splitPartnerId = undefined;
		this.setTabSplitPlacement(tab.id, 'main');
		this.focusedSplitSideByPairKey.delete(tab.id);
		if (partner) {
			partner.splitPartnerId = undefined;
			this.setTabSplitPlacement(partner.id, 'main');
			this.focusedSplitSideByPairKey.delete(partner.id);
		}
		this.renderTabStrip();
		if (this.activeTabId) this.selectTab(this.activeTabId);
	};

	/**
	 * Set the focused side of a split pair. `tabId` is whichever side of the
	 * pair should now own the address bar / nav buttons / tab-strip
	 * indicator. This becomes the new active tab.
	 */
	setSplitFocus = (tabId: string): void => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		const pairId = tab.splitPartnerId;
		if (!pairId) return;
		this.focusedSplitSideByPairKey.set(tab.id, tab.id);
		this.focusedSplitSideByPairKey.set(pairId, tab.id);
		// Make the focused side the active tab. selectTab handles the
		// capsule indicator swap + address bar update.
		this.selectTab(tab.id);
	};

	/**
	 * Resolve the focused tabId for whatever pair the given tabId is in.
	 * If the tab isn't in a split, returns the tabId itself.
	 */
	getSplitFocusedTabId = (tabId: string): string => {
		const tab = this.getTabById(tabId);
		if (!tab || !tab.splitPartnerId) return tabId;
		return this.focusedSplitSideByPairKey.get(tabId) ?? tabId;
	};

	setTabCache = (tabId: string, cache: TabCacheEntry | undefined) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		tab.cache = cache;
		if (cache) this.tabCacheById.set(tabId, cache);
		else this.tabCacheById.delete(tabId);
	};

	updateTabMetadata = (
		tabId: string,
		data: Partial<Pick<TabData, 'title' | 'favicon' | 'url'>>
	) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		if (typeof data.title === 'string') tab.title = data.title;
		if (typeof data.favicon !== 'undefined') tab.favicon = data.favicon;
		if (typeof data.url === 'string') tab.url = data.url;
	};

	createTab = async (url: string) => this.lifecycleModule.createTab(url);

	createTabToRight = async (
		referenceTabId: string,
		url = 'ddx://newtab/'
	) => {
		const newTabId = await this.createTab(url);
		if (!newTabId) return null;
		const fromIndex = this.getTabIndex(newTabId);
		const referenceIndex = this.getTabIndex(referenceTabId);
		if (fromIndex === -1 || referenceIndex === -1) return newTabId;
		const [tab] = this.tabs.splice(fromIndex, 1);
		this.tabs.splice(referenceIndex + 1, 0, tab);
		this.renderTabStrip();
		return newTabId;
	};

	closeTabById = async (id: string) => this.lifecycleModule.closeTabById(id);

	closeOtherTabs = async (tabId: string) => {
		const keep = this.getTabById(tabId);
		if (!keep) return;
		const toClose = this.tabs
			.filter(tab => tab.id !== tabId)
			.map(tab => tab.id);
		for (const id of toClose) {
			await this.closeTabById(id);
		}
	};

	closeCurrentTab = async () => this.lifecycleModule.closeCurrentTab();

	closeAllTabs = async () => this.lifecycleModule.closeAllTabs();

	selectTab = async (tabId: string) => {
		this.activeTabId = tabId;
		return this.lifecycleModule.selectTab(tabId);
	};

	selectTabById = (id: string) => this.lifecycleModule.selectTabById(id);

	updateTabAttributes = () => this.lifecycleModule.updateTabAttributes();

	duplicateTab = (tabId: string): string | null =>
		this.manipulationModule.duplicateTab(tabId);

	refreshTab = (tabId: string) => this.manipulationModule.refreshTab(tabId);

	reloadTab = (tabId: string) => this.manipulationModule.refreshTab(tabId);

	hardReloadTab = (tabId: string) =>
		this.manipulationModule.hardReloadTab(tabId);

	stopTab = (tabId: string) => this.manipulationModule.stopTab(tabId);

	savePage = (tabId: string) => this.manipulationModule.savePage(tabId);

	/**
	 * Reopen the most recently-closed tab. Pops the top of the stack;
	 * if the closed entry was pinned and/or grouped, attempts to restore
	 * those affordances on the freshly-created tab. Group restore is
	 * best-effort: if the group has since been deleted we just leave the
	 * reopened tab ungrouped.
	 *
	 * Returns the new tab id, or null if there was nothing to reopen.
	 */
	reopenClosedTab = async (): Promise<string | null> => {
		const record = this.closedTabStack.popMostRecent();
		if (!record) return null;

		const newTabId = await this.createTab(record.url);
		if (!newTabId) return null;

		// Re-pin if needed.
		if (record.wasPinned && this.pinManager) {
			try {
				this.pinManager.pinTab(newTabId);
			} catch (error) {
				console.warn('[Tabs] reopenClosedTab: re-pin failed:', error);
			}
		}

		// Re-attach to original group if it still exists.
		if (record.groupId && this.groupManager) {
			const groupStillExists = this.groups.some(
				g => g.id === record.groupId
			);
			if (groupStillExists) {
				try {
					this.groupManager.addTabToGroup(
						newTabId,
						record.groupId
					);
				} catch (error) {
					console.warn(
						'[Tabs] reopenClosedTab: re-group failed:',
						error
					);
				}
			}
		}

		this.logger.createLog(`Reopened closed tab: ${record.url}`);
		return newTabId;
	};

	closeTabsToRight = (tabId: string): void =>
		this.manipulationModule.closeTabsToRight(tabId);

	reorderTabElements = () => this.renderTabStrip();

	setFavicon = (tabElement: HTMLElement, iframe: HTMLIFrameElement): void => {
		this.manipulationModule.setFavicon(tabElement, iframe);
	};

	pageClient = (iframe: HTMLIFrameElement) =>
		this.pageClientModule.pageClient(iframe);

	startMetaWatcher = (
		tabId: string,
		iframe: HTMLIFrameElement,
		tabEl: HTMLElement
	) => {
		this.metaWatcherModule.startMetaWatcher(tabId, iframe, tabEl);
	};

	stopMetaWatcher = async (tabId: string) =>
		this.metaWatcherModule.stopMetaWatcher(tabId);

	getHistoryManager = () => this.historyIntegration.getHistoryManager();

	renderTabStrip = () => {
		const container = this.items.tabBar;
		if (!container) return;

		this.groupHeaderElementById.forEach(el => el.remove());
		this.groupHeaderElementById.clear();

		const mode: VisualOrderMode = this.verticalTabsEnabled
			? 'vertical'
			: 'horizontal';
		const pinnedCount = this.getPinnedTabs().length;
		const fragment = document.createDocumentFragment();
		const visual = this.getVisualTabOrder(mode);
		let renderedPinnedTabs = 0;
		let insertedPinnedDivider = false;
		const visibleGroupedTabIds = new Set(
			visual
				.filter(entry => entry.kind === 'tab' && entry.tabId)
				.map(entry => entry.tabId!)
		);

		// Track which split-paired tabs have already been emitted as part
		// of a capsule, so we don't render them twice.
		const consumedBySplit = new Set<string>();

		for (const entry of visual) {
			if (
				this.verticalTabsEnabled &&
				this.verticalTabsCollapsed &&
				!insertedPinnedDivider &&
				pinnedCount > 0 &&
				renderedPinnedTabs >= pinnedCount
			) {
				const divider = this.ui.createElement('div', {
					class: 'tab-pinned-divider',
					'aria-hidden': 'true'
				});
				fragment.appendChild(divider);
				insertedPinnedDivider = true;
			}

			if (entry.kind === 'groupHeader' && entry.groupId) {
				const header = this.createGroupHeader(entry.groupId);
				this.groupHeaderElementById.set(entry.groupId, header);
				fragment.appendChild(header);
				continue;
			}

			if (entry.kind === 'tab' && entry.tabId) {
				const tab = this.getTabById(entry.tabId);
				if (!tab) continue;
				if (consumedBySplit.has(tab.id)) continue;

				tab.tab.setAttribute('draggable', 'true');
				tab.tab.setAttribute('data-tab-id', tab.id);
				tab.tab.setAttribute('data-dnd-kind', 'tab');
				tab.tab.setAttribute('data-dnd-lane', this.getLaneForTab(tab));
				if (!tab.tab.hasAttribute('data-context-menu-setup')) {
					this.setupTabContextMenu(tab.tab, tab.id);
					tab.tab.setAttribute('data-context-menu-setup', 'true');
				}
				this.setupTabDragHandlers(tab.tab, tab.id);
				this.syncTabVisualState(tab.id);
				this.syncTabGroupPosition(tab.id, visibleGroupedTabIds);

				const partnerId = tab.splitPartnerId;
				const partner = partnerId
					? this.getTabById(partnerId)
					: undefined;

				if (partner && !consumedBySplit.has(partner.id)) {
					// Render both halves wrapped in a split capsule. Use
					// the left-hand tab of the pair on the left.
					const leftTab =
						tab.splitPlacement === 'split-left' ? tab : partner;
					const rightTab =
						tab.splitPlacement === 'split-right'
							? tab
							: partner;

					[leftTab, rightTab].forEach(t => {
						t.tab.setAttribute('draggable', 'true');
						t.tab.setAttribute('data-tab-id', t.id);
						t.tab.setAttribute('data-dnd-kind', 'tab');
						t.tab.setAttribute(
							'data-dnd-lane',
							this.getLaneForTab(t)
						);
						if (
							!t.tab.hasAttribute('data-context-menu-setup')
						) {
							this.setupTabContextMenu(t.tab, t.id);
							t.tab.setAttribute(
								'data-context-menu-setup',
								'true'
							);
						}
						this.setupTabDragHandlers(t.tab, t.id);
						this.syncTabVisualState(t.id);
						this.syncTabGroupPosition(
							t.id,
							visibleGroupedTabIds
						);
					});

					const focused = this.getSplitFocusedTabId(tab.id);
					leftTab.tab.dataset.splitSide = 'left';
					rightTab.tab.dataset.splitSide = 'right';
					leftTab.tab.dataset.splitFocused =
						focused === leftTab.id ? 'true' : 'false';
					rightTab.tab.dataset.splitFocused =
						focused === rightTab.id ? 'true' : 'false';

					const splitPipe = this.ui.createElement(
						'div',
						{
							class:
								this.activeTabId === leftTab.id ||
								this.activeTabId === rightTab.id
									? 'split-pipe is-active'
									: 'split-pipe',
							'aria-hidden': 'true'
						},
						['|']
					);

					fragment.appendChild(leftTab.tab);
					fragment.appendChild(splitPipe);
					fragment.appendChild(rightTab.tab);
					consumedBySplit.add(leftTab.id);
					consumedBySplit.add(rightTab.id);
					if (tab.isPinned) renderedPinnedTabs += 1;
					if (partner.isPinned) renderedPinnedTabs += 1;
					continue;
				}

				// Non-split tab: clean up any leftover split markers.
				delete tab.tab.dataset.splitSide;
				delete tab.tab.dataset.splitFocused;

				fragment.appendChild(tab.tab);
				if (tab.isPinned) {
					renderedPinnedTabs += 1;
				}
			}
		}

		container.replaceChildren(fragment);
		this.updateTabAttributes();
		this.scheduleGroupUnderlineExtents();
	};

	/**
	 * Measures each rendered group header's width and writes it as the
	 * `--header-extent` CSS variable onto the first tab of that group. The
	 * tab's group underline (start-position) then uses this value to extend
	 * leftward and visually merge with a line beneath the header chip,
	 * producing one continuous group-colored line under header + all tabs.
	 *
	 * Run inside requestAnimationFrame so it sees the post-layout box sizes
	 * of the elements that renderTabStrip just inserted.
	 */
	private scheduleGroupUnderlineExtents(): void {
		if (this.headerExtentRafHandle !== null) {
			cancelAnimationFrame(this.headerExtentRafHandle);
		}
		this.headerExtentRafHandle = requestAnimationFrame(() => {
			this.headerExtentRafHandle = null;
			this.applyGroupHeaderExtents();
		});
	}

	private applyGroupHeaderExtents(): void {
		// Clear stale extent vars from every tab so a tab that just left
		// the start position (e.g., reorder, ungroup) doesn't keep the line.
		this.tabs.forEach(t =>
			t.tab.style.removeProperty('--header-extent')
		);

		// Effective gap between header chip and the first grouped tab.
		//
		// Horizontal mode: parent flex `gap-2` adds 8px; the CSS rule
		// `.tab-group-header + .tab[data-group-id] { margin-left: -0.25rem; }`
		// pulls 4px back for a Chrome-style tight grouping.
		//
		// Vertical mode: navbar tab-bar is `flex-col` with no flex gap and
		// header sits flush with first tab, so the gap is 0. The base
		// `.tab[data-group-id]::after` rule for vertical already extends the
		// accent bar `top: -0.28rem` past the tab's top edge, so the value
		// here only needs to carry the header's actual size.
		const HEADER_GAP_PX = this.verticalTabsEnabled ? 0 : 4;

		this.groupHeaderElementById.forEach((headerEl, groupId) => {
			const group = this.getGroupById(groupId);
			if (!group) return;
			const firstVisibleTabId = group.tabIds.find(id => {
				const t = this.getTabById(id);
				return !!t?.tab.isConnected;
			});
			if (!firstVisibleTabId) return;
			const firstTab = this.getTabById(firstVisibleTabId);
			if (!firstTab) return;

			// In horizontal mode the underline grows along x → header width.
			// In vertical mode the accent bar grows along y → header height.
			const headerExtent = this.verticalTabsEnabled
				? headerEl.offsetHeight
				: headerEl.offsetWidth;
			if (headerExtent <= 0) {
				firstTab.tab.style.removeProperty('--header-extent');
				return;
			}
			firstTab.tab.style.setProperty(
				'--header-extent',
				`${headerExtent + HEADER_GAP_PX}px`
			);
		});
	}

	setupTabContextMenu = (tabElement: HTMLElement, tabId: string) => {
		this.contextMenuModule.setupTabContextMenu(tabElement, tabId);
	};

	ensureStateInvariants = (): boolean => {
		if (!shouldRunInvariantChecks()) return true;
		return runInvariantChecks(this);
	};

	runStateTransaction = (label: string, mutate: () => void): boolean => {
		const tabSnapshot = this.tabs.map(tab => ({
			id: tab.id,
			groupId: tab.groupId,
			isPinned: tab.isPinned
		}));
		const groupSnapshot = this.groups.map(group => ({
			...group,
			tabIds: [...group.tabIds]
		}));
		const orderSnapshot = this.tabs.map(tab => tab.id);

		mutate();
		this.syncGroupSets();
		this.rebuildTabsOrderFromLanes();

		if (!this.ensureStateInvariants()) {
			for (const tabState of tabSnapshot) {
				const tab = this.getTabById(tabState.id);
				if (!tab) continue;
				tab.groupId = tabState.groupId;
				tab.isPinned = tabState.isPinned;
			}
			this.groups = groupSnapshot;
			this.tabs = orderSnapshot
				.map(id => this.getTabById(id))
				.filter((tab): tab is TabData => Boolean(tab));
			this.syncGroupSets();
			this.renderTabStrip();
			console.warn(
				'[Tabs2] Transaction rolled back due to invariant failure',
				label
			);
			return false;
		}

		this.renderTabStrip();
		return true;
	};

	togglePinTab = (tabId: string) => this.pinManager?.togglePinTab(tabId);

	switchToNextTab = () => {
		if (!this.tabs.length) return;
		const currentIndex = this.tabs.findIndex(
			tab => tab.id === this.activeTabId
		);
		const nextIndex =
			currentIndex === -1 ? 0 : (currentIndex + 1) % this.tabs.length;
		this.selectTabById(this.tabs[nextIndex].id);
	};

	switchToPreviousTab = () => {
		if (!this.tabs.length) return;
		const currentIndex = this.tabs.findIndex(
			tab => tab.id === this.activeTabId
		);
		const prevIndex =
			currentIndex === -1
				? this.tabs.length - 1
				: (currentIndex - 1 + this.tabs.length) % this.tabs.length;
		this.selectTabById(this.tabs[prevIndex].id);
	};

	saveSession = async () => {
		const tabsCache = this.tabs.map((tab, index) => {
			const cleanUrl =
				decodeIframeUrl(tab.iframe, this.proxy) ||
				decodeProxiedUrl(tab.url, this.proxy);
			return {
				id: tab.id,
				url: cleanUrl,
				title:
					tab.iframe?.contentDocument?.title ||
					tab.title ||
					'New Tab',
				favicon: tab.favicon || '',
				pinned: tab.isPinned,
				groupId: tab.groupId,
				splitPlacement: tab.splitPlacement,
				splitPartnerId: tab.splitPartnerId,
				order: index
			};
		});

		const groupsCache = this.groups.map((group, index) => ({
			id: group.id,
			name: group.name,
			color: group.color,
			collapsed: group.isCollapsed,
			order: index
		}));

		await window.cache.saveSession({
			tabs: tabsCache,
			groups: groupsCache,
			activeTabId: this.activeTabId ?? undefined
		});
	};

	restoreSession = async () => {
		const cached = await window.cache.getCache();
		if (!cached.tabs || cached.tabs.length === 0) return false;

		this.groups = (cached.groups || [])
			.sort((a: any, b: any) => a.order - b.order)
			.map((group: any) => ({
				id: group.id,
				name: group.name,
				color: group.color,
				isCollapsed: group.collapsed,
				tabIds: []
			}));

		// Map persisted IDs to freshly created IDs so we can rewire split
		// pair references after every tab exists.
		const persistedToCreated = new Map<string, string>();

		for (const tabCache of [...cached.tabs].sort(
			(a: any, b: any) => a.order - b.order
		)) {
			const tabId = await this.createTab(tabCache.url);
			const tabData = this.getTabById(tabId);
			if (!tabData) continue;
			persistedToCreated.set(tabCache.id, tabId);
			if (tabCache.pinned) this.pinManager?.pinTab(tabData.id);
			if (tabCache.groupId) {
				const group = this.getGroupById(tabCache.groupId);
				if (group)
					this.groupManager?.addTabToGroup(tabData.id, group.id);
			}
		}

		// Re-create split pairs after all tabs exist.
		for (const tabCache of cached.tabs as any[]) {
			if (!tabCache.splitPartnerId) continue;
			const createdId = persistedToCreated.get(tabCache.id);
			const createdPartnerId = persistedToCreated.get(
				tabCache.splitPartnerId
			);
			if (!createdId || !createdPartnerId) continue;
			const me = this.getTabById(createdId);
			const partner = this.getTabById(createdPartnerId);
			if (!me || !partner) continue;
			// Only set up the pair once (skip the partner half).
			if (me.splitPartnerId) continue;
			me.splitPartnerId = partner.id;
			partner.splitPartnerId = me.id;
			this.setTabSplitPlacement(
				me.id,
				tabCache.splitPlacement === 'split-right'
					? 'split-right'
					: 'split-left'
			);
			this.setTabSplitPlacement(
				partner.id,
				me.splitPlacement === 'split-left'
					? 'split-right'
					: 'split-left'
			);
			this.focusedSplitSideByPairKey.set(me.id, me.id);
			this.focusedSplitSideByPairKey.set(partner.id, me.id);
		}

		if (cached.activeTabId) {
			const active = this.getTabById(cached.activeTabId);
			if (active) this.selectTabById(active.id);
		}

		this.renderTabStrip();
		return true;
	};

	private applyVerticalTabsLayout = () => {
		const enabled = this.verticalTabsEnabled;
		this.ui.setStyle(
			this.items.navbar,
			enabled ? 'vertical' : 'horizontal'
		);
		this.ui.setStyle(
			this.items.topBar,
			enabled ? 'vertical' : 'horizontal'
		);
		this.ui.setState(
			this.ui.queryComponent('navbar'),
			enabled && this.verticalTabsCollapsed ? 'collapsed' : null
		);

		const movableNodes = window.d.querySelectorAll<HTMLElement>(
			'[data-vertical-move]'
		);
		const tabBar = window.d.querySelector(
			'[data-component="tab-bar"]'
		) as HTMLElement | null;
		if (tabBar)
			tabBar.setAttribute(
				'styleMode',
				enabled ? 'vertical' : 'horizontal'
			);

		const existingTabs = window.d.querySelectorAll<HTMLElement>(
			'[data-component="tab"]'
		);
		existingTabs.forEach(tab =>
			tab.setAttribute('styleMode', enabled ? 'vertical' : 'horizontal')
		);

		movableNodes.forEach(node => {
			const destinationName = enabled
				? node.dataset.verticalTarget
				: node.dataset.verticalHome;
			if (!destinationName) return;
			const destination = window.d.querySelector(
				`[data-component="${destinationName}"]`
			) as HTMLElement | null;
			if (destination && node.parentElement !== destination)
				destination.appendChild(node);
		});

		this.renderTabStrip();
	};

	toggleVerticalTabsLayout = () => {
		this.verticalTabsEnabled = !this.verticalTabsEnabled;
		this.applyVerticalTabsLayout();
		return this.verticalTabsEnabled;
	};

	toggleVerticalTabsCollapsed = () => {
		if (!this.verticalTabsEnabled) return false;
		this.verticalTabsCollapsed = !this.verticalTabsCollapsed;
		this.applyVerticalTabsLayout();
		return this.verticalTabsCollapsed;
	};

	initSplitLayout = () => {
		if (!this.items.frameContainer) return;
		this.splitLayout?.mount(this.items.frameContainer);
	};

	setupVerticalTabsToggle = () => {
		const verticalTabsButton = window.d.querySelector(
			'[data-component="vertical-tabs"]'
		) as HTMLButtonElement | null;
		verticalTabsButton?.addEventListener('click', () => {
			const enabled = this.toggleVerticalTabsLayout();
			verticalTabsButton.setAttribute(
				'aria-pressed',
				enabled ? 'true' : 'false'
			);
		});
		this.applyVerticalTabsLayout();
	};

	private createGroupHeader(groupId: string): HTMLElement {
		const group = this.getGroupById(groupId)!;
		const groupLabel = group.name || 'Group';
		const header = this.ui.createElement(
			'div',
			{
				class: `tab-group-header ${group.isCollapsed ? 'collapsed' : ''}`,
				'data-group-id': group.id,
				'data-dnd-kind': 'groupHeader',
				'data-dnd-lane': 'groups-order',
				'data-tooltip': groupLabel,
				'data-side': 'right',
				'data-align': 'center',
				draggable: true,
				style: `--group-color: ${group.color};`
			},
			[
				this.ui.createElement(
					'span',
					{ class: 'tab-group-indicator' },
					[]
				),
				this.ui.createElement(
					'i',
					{
						class: 'tab-group-collapse-icon',
						'data-lucide': group.isCollapsed
							? 'chevron-down'
							: 'chevron-up'
					},
					[]
				)
			]
		);

		header.addEventListener('click', () => {
			this.groupManager?.toggleGroupCollapse(group.id);
		});

		this.setupGroupHeaderDragHandlers(header, group.id);
		this.contextMenuModule.setupGroupHeaderContextMenu(header, group.id);
		this.ui.setState(header, group.isCollapsed ? 'collapsed' : null);
		this.applyBasecoatTooltip(header, groupLabel);
		return header;
	}

	private applyBasecoatTooltip(target: HTMLElement, label: string): void {
		const tooltipFactory = (window as any).basecoat?.tooltip;
		if (typeof tooltipFactory !== 'function') {
			return;
		}

		try {
			tooltipFactory(target, {
				content: label,
				side: 'right',
				align: 'center'
			});
		} catch {
			// no-op fallback to CSS tooltip attributes
		}
	}

	private setupTabDragHandlers(tabEl: HTMLElement, tabId: string): void {
		tabEl.ondragstart = event => {
			this.dragActiveId = tabId;
			this.dragActiveKind = 'tab';
			tabEl.classList.add('is-dragging-tab');
			event.dataTransfer?.setData('text/plain', `tab:${tabId}`);
			event.dataTransfer!.effectAllowed = 'move';
		};

		tabEl.ondragover = event => {
			event.preventDefault();
			event.dataTransfer!.dropEffect = 'move';
			this.previewTabReorder(tabId, event);
		};

		tabEl.ondrop = event => {
			event.preventDefault();
			this.handleDrop(event, tabEl);
		};

		tabEl.ondragend = () => {
			tabEl.classList.remove('is-dragging-tab');
			this.clearDragPreviewStyles();
			this.dragActiveId = null;
			this.dragActiveKind = null;
			this.renderTabStrip();
		};
	}

	private setupGroupHeaderDragHandlers(
		groupHeader: HTMLElement,
		groupId: string
	): void {
		groupHeader.ondragstart = event => {
			this.dragActiveId = groupId;
			this.dragActiveKind = 'group';
			event.dataTransfer?.setData('text/plain', `group:${groupId}`);
			event.dataTransfer!.effectAllowed = 'move';
		};

		groupHeader.ondragover = event => {
			event.preventDefault();
			event.dataTransfer!.dropEffect = 'move';
		};

		groupHeader.ondrop = event => {
			event.preventDefault();
			this.handleDrop(event, groupHeader);
		};
	}

	private handleDrop(_event: DragEvent, target: HTMLElement): void {
		const action = this.resolveDragAction(target);
		this.clearDragPreviewStyles();
		if (!action) return;
		this.commitDragAction(action);
		this.dragActiveId = null;
		this.dragActiveKind = null;
	}

	private previewTabReorder(targetTabId: string, event: DragEvent): void {
		if (!this.dragActiveId || this.dragActiveKind !== 'tab') return;
		if (this.dragActiveId === targetTabId) return;

		const draggedTab = this.getTabById(this.dragActiveId);
		const targetTab = this.getTabById(targetTabId);
		if (!draggedTab || !targetTab) return;

		const sourceLane = this.getLaneForTab(draggedTab);
		const targetLane = this.getLaneForTab(targetTab);
		if (sourceLane !== targetLane) {
			this.clearDragPreviewStyles();
			return;
		}

		const container = this.items.tabBar;
		if (!container) return;

		const draggedEl = this.tabElementById.get(draggedTab.id);
		const targetEl = this.tabElementById.get(targetTab.id);
		if (!draggedEl || !targetEl || draggedEl === targetEl) return;

		const rect = targetEl.getBoundingClientRect();
		const isVertical = this.verticalTabsEnabled;
		const shouldPlaceAfter = isVertical
			? event.clientY > rect.top + rect.height / 2
			: event.clientX > rect.left + rect.width / 2;

		this.clearDragPreviewStyles();
		targetEl.classList.add(
			shouldPlaceAfter ? 'drag-preview-after' : 'drag-preview-before'
		);
		this.dragPreviewTargetId = targetTabId;

		const insertionPoint = shouldPlaceAfter
			? targetEl.nextElementSibling
			: targetEl;
		if (insertionPoint === draggedEl) return;
		if (shouldPlaceAfter && draggedEl.nextElementSibling === insertionPoint)
			return;

		this.flipAnimateLayout(container, () => {
			container.insertBefore(draggedEl, insertionPoint);
		});
	}

	private clearDragPreviewStyles(): void {
		if (!this.dragPreviewTargetId) return;
		const previewEl = this.tabElementById.get(this.dragPreviewTargetId);
		previewEl?.classList.remove(
			'drag-preview-before',
			'drag-preview-after'
		);
		this.dragPreviewTargetId = null;
	}

	private flipAnimateLayout(
		container: HTMLElement,
		mutator: () => void
	): void {
		const selector = '[data-dnd-kind="tab"], [data-dnd-kind="groupHeader"]';
		const before = new Map<HTMLElement, DOMRect>();
		container.querySelectorAll<HTMLElement>(selector).forEach(node => {
			before.set(node, node.getBoundingClientRect());
		});

		mutator();

		container.querySelectorAll<HTMLElement>(selector).forEach(node => {
			const from = before.get(node);
			if (!from) return;
			const to = node.getBoundingClientRect();
			const dx = from.left - to.left;
			const dy = from.top - to.top;
			if (!dx && !dy) return;

			node.style.transition = 'none';
			node.style.transform = `translate(${dx}px, ${dy}px)`;
			void node.offsetWidth;
			node.style.transition =
				'transform 180ms cubic-bezier(0.2, 0.75, 0.25, 1)';
			node.style.transform = '';
			window.setTimeout(() => {
				node.style.transition = '';
			}, 200);
		});
	}

	private resolveDragAction(target: HTMLElement): DragAction | null {
		if (!this.dragActiveId || !this.dragActiveKind) return null;

		if (this.dragActiveKind === 'group') {
			const targetGroupHeader = target.closest(
				'[data-dnd-kind="groupHeader"]'
			) as HTMLElement | null;
			if (!targetGroupHeader) return null;
			const targetGroupId =
				targetGroupHeader.getAttribute('data-group-id');
			if (!targetGroupId || targetGroupId === this.dragActiveId)
				return null;
			const toIndex = this.groups.findIndex(
				group => group.id === targetGroupId
			);
			return {
				type: 'REORDER_GROUPS',
				groupId: this.dragActiveId,
				toIndex
			};
		}

		const activeTab = this.getTabById(this.dragActiveId);
		if (!activeTab) return null;

		const targetTabEl = target.closest(
			'[data-dnd-kind="tab"]'
		) as HTMLElement | null;
		const targetGroupHeader = target.closest(
			'[data-dnd-kind="groupHeader"]'
		) as HTMLElement | null;

		if (targetGroupHeader) {
			const targetGroupId =
				targetGroupHeader.getAttribute('data-group-id');
			if (!targetGroupId) return null;
			if (activeTab.isPinned) {
				return {
					type: 'MOVE_PINNED_TO_GROUP',
					tabId: activeTab.id,
					toGroupId: targetGroupId
				};
			}
			if (activeTab.groupId && activeTab.groupId !== targetGroupId) {
				return {
					type: 'MOVE_TAB_BETWEEN_GROUPS',
					tabId: activeTab.id,
					fromGroupId: activeTab.groupId,
					toGroupId: targetGroupId
				};
			}
			if (!activeTab.groupId) {
				return {
					type: 'MOVE_TAB_TO_GROUP',
					tabId: activeTab.id,
					toGroupId: targetGroupId
				};
			}
		}

		if (!targetTabEl) return null;
		const targetTabId = targetTabEl.getAttribute('data-tab-id');
		if (!targetTabId || targetTabId === activeTab.id) return null;
		const targetTab = this.getTabById(targetTabId);
		if (!targetTab) return null;

		if (activeTab.isPinned && targetTab.isPinned) {
			const toIndex = this.getPinnedTabs().findIndex(
				tab => tab.id === targetTab.id
			);
			return { type: 'REORDER_PINNED', tabId: activeTab.id, toIndex };
		}

		if (activeTab.isPinned && !targetTab.isPinned) {
			if (targetTab.groupId) {
				const group = this.getGroupById(targetTab.groupId);
				const toIndex =
					group?.tabIds.findIndex(id => id === targetTab.id) ??
					undefined;
				return {
					type: 'MOVE_PINNED_TO_GROUP',
					tabId: activeTab.id,
					toGroupId: targetTab.groupId,
					toIndex
				};
			}
			return null;
		}

		if (activeTab.groupId && targetTab.groupId === activeTab.groupId) {
			const group = this.getGroupById(activeTab.groupId);
			const toIndex = group?.tabIds.findIndex(id => id === targetTab.id);
			return {
				type: 'REORDER_WITHIN_GROUP',
				tabId: activeTab.id,
				groupId: activeTab.groupId,
				toIndex
			};
		}

		if (
			activeTab.groupId &&
			targetTab.groupId &&
			targetTab.groupId !== activeTab.groupId
		) {
			const group = this.getGroupById(targetTab.groupId);
			const toIndex = group?.tabIds.findIndex(id => id === targetTab.id);
			return {
				type: 'MOVE_TAB_BETWEEN_GROUPS',
				tabId: activeTab.id,
				fromGroupId: activeTab.groupId,
				toGroupId: targetTab.groupId,
				toIndex
			};
		}

		if (activeTab.groupId && !targetTab.groupId) {
			const toIndex = this.getUngroupedUnpinnedTabs().findIndex(
				tab => tab.id === targetTab.id
			);
			return {
				type: 'MOVE_TAB_OUT_OF_GROUP',
				tabId: activeTab.id,
				fromGroupId: activeTab.groupId,
				toIndex
			};
		}

		if (!activeTab.groupId && targetTab.groupId) {
			const group = this.getGroupById(targetTab.groupId);
			const toIndex = group?.tabIds.findIndex(id => id === targetTab.id);
			return {
				type: 'MOVE_TAB_TO_GROUP',
				tabId: activeTab.id,
				toGroupId: targetTab.groupId,
				toIndex
			};
		}

		if (!activeTab.groupId && !targetTab.groupId) {
			const toIndex = this.getUngroupedUnpinnedTabs().findIndex(
				tab => tab.id === targetTab.id
			);
			return { type: 'REORDER_UNGROUPED', tabId: activeTab.id, toIndex };
		}

		return null;
	}

	private commitDragAction(action: DragAction): void {
		this.runStateTransaction(`drag:${action.type}`, () => {
			switch (action.type) {
				case 'REORDER_PINNED':
					if (action.tabId && typeof action.toIndex === 'number') {
						this.reorderPinned(action.tabId, action.toIndex);
					}
					break;
				case 'REORDER_UNGROUPED':
					if (action.tabId && typeof action.toIndex === 'number') {
						this.reorderUngrouped(action.tabId, action.toIndex);
					}
					break;
				case 'REORDER_WITHIN_GROUP':
					if (
						action.tabId &&
						action.groupId &&
						typeof action.toIndex === 'number'
					) {
						this.reorderWithinGroup(
							action.tabId,
							action.groupId,
							action.toIndex
						);
					}
					break;
				case 'MOVE_TAB_TO_GROUP':
					if (action.tabId && action.toGroupId) {
						this.groupManager?.addTabToGroup(
							action.tabId,
							action.toGroupId,
							action.toIndex
						);
					}
					break;
				case 'MOVE_TAB_BETWEEN_GROUPS':
					if (action.tabId && action.toGroupId) {
						this.groupManager?.addTabToGroup(
							action.tabId,
							action.toGroupId,
							action.toIndex
						);
					}
					break;
				case 'MOVE_TAB_OUT_OF_GROUP':
					if (action.tabId) {
						this.groupManager?.removeTabFromGroup(
							action.tabId,
							action.toIndex
						);
					}
					break;
				case 'MOVE_PINNED_TO_GROUP':
					if (action.tabId && action.toGroupId) {
						this.pinManager?.unpinTab(action.tabId);
						this.groupManager?.addTabToGroup(
							action.tabId,
							action.toGroupId,
							action.toIndex
						);
					}
					break;
				case 'REORDER_GROUPS':
					if (action.groupId && typeof action.toIndex === 'number') {
						this.reorderGroups(action.groupId, action.toIndex);
					}
					break;
			}
		});
	}

	private getLaneForTab(tab: TabData): string {
		if (tab.isPinned) return 'pinned';
		if (tab.groupId) return `group:${tab.groupId}`;
		return 'ungrouped';
	}

	private syncGroupSets(): void {
		this.tabIdsByGroupId.clear();
		for (const group of this.groups) {
			this.tabIdsByGroupId.set(group.id, new Set(group.tabIds));
		}
	}

	private rebuildTabsOrderFromLanes(): void {
		const tabById = new Map(this.tabs.map(tab => [tab.id, tab]));
		const result: TabData[] = [];
		const seen = new Set<string>();

		for (const tab of this.getPinnedTabs()) {
			if (!seen.has(tab.id)) {
				result.push(tab);
				seen.add(tab.id);
			}
		}

		for (const group of this.groups) {
			for (const tabId of group.tabIds) {
				const tab = tabById.get(tabId);
				if (tab && !seen.has(tab.id)) {
					result.push(tab);
					seen.add(tab.id);
				}
			}
		}

		for (const tab of this.tabs) {
			if (!seen.has(tab.id)) {
				result.push(tab);
				seen.add(tab.id);
			}
		}

		this.tabs = result;
	}
}

export { Tabs };
