import { Nightmare as UI } from '@pkgs/Nightmare';
import { Protocols } from '@browser/protocols';
import { Items } from '@browser/items';
import { Logger } from '@apis/logging';
import { SettingsAPI } from '@apis/settings';
import { EventSystem } from '@apis/events';
import { Proxy } from '@apis/proxy';
import { BookmarkManager as BM } from '@apis/bookmarks';
import { ChiiDevTools } from '@browser/functions';

import type {
	TabsInterface,
	TabGroup,
	TabData,
	TabSplitPlacement,
	TabCacheEntry
} from './types';
import { BookmarkManager } from './bookmarks';
import { TabLifecycle } from './lifecycle';
import { TabManipulation } from './manipulation';
import { TabContextMenu } from './contextMenu';
import { TabPageClient } from './pageClient';
import { TabMetaWatcher } from './metaWatcher';
import { TabHistoryIntegration } from './historyIntegration';

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

	private chiiInstances: Map<string, ChiiDevTools> = new Map();

	private bookmarkModule: BookmarkManager;
	private lifecycleModule: TabLifecycle;
	private manipulationModule: TabManipulation;
	private contextMenuModule: TabContextMenu;
	pageClientModule: TabPageClient;
	private metaWatcherModule: TabMetaWatcher;
	private historyIntegration: TabHistoryIntegration;
	private verticalTabsEnabled: boolean = false;
	private verticalTabsCollapsed: boolean = true;

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
		this.pinnedTabIds = new Set();
		this.splitByTabId = new Map();
		this.tabCacheById = new Map();
		this.el = window.d.querySelector('#root') as HTMLDivElement;
		this.proxy = proxy;
		this.bookmarkManager = new BM();
		this.swConfig = swConfig;
		this.proxySetting = proxySetting;

		this.instanceId = 0;
		this.instanceId += 1;

		this.styleEl = document.createElement('style');
		this.el.appendChild(this.styleEl);

		this.bookmarkModule = new BookmarkManager(this);
		this.lifecycleModule = new TabLifecycle(this);
		this.manipulationModule = new TabManipulation(this);
		this.contextMenuModule = new TabContextMenu(this);
		this.pageClientModule = new TabPageClient(this);
		this.metaWatcherModule = new TabMetaWatcher(this);
		this.historyIntegration = new TabHistoryIntegration(this);

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

	getTabsInOrder = () => {
		return this.tabs;
	};

	getTabById = (id: string) => {
		return this.tabs.find(tab => tab.id === id);
	};

	getTabIndex = (id: string) => {
		return this.tabs.findIndex(tab => tab.id === id);
	};

	registerTab = (tabData: TabData) => {
		this.tabs.push(tabData);
		this.tabElementById.set(tabData.id, tabData.tab);
		this.frameByTabId.set(tabData.id, tabData.iframe);
		this.splitByTabId.set(tabData.id, tabData.splitPlacement);

		if (tabData.isPinned) {
			this.pinnedTabIds.add(tabData.id);
		}

		if (tabData.groupId) {
			let groupSet = this.tabIdsByGroupId.get(tabData.groupId);
			if (!groupSet) {
				groupSet = new Set<string>();
				this.tabIdsByGroupId.set(tabData.groupId, groupSet);
			}
			groupSet.add(tabData.id);
		}

		if (tabData.cache) {
			this.tabCacheById.set(tabData.id, tabData.cache);
		}
	};

	removeTab = (id: string) => {
		const tab = this.getTabById(id);
		if (!tab) return undefined;

		this.tabs = this.tabs.filter(t => t.id !== id);
		this.tabElementById.delete(id);
		this.frameByTabId.delete(id);
		this.pinnedTabIds.delete(id);
		this.splitByTabId.delete(id);
		this.tabCacheById.delete(id);

		if (tab.groupId) {
			const groupSet = this.tabIdsByGroupId.get(tab.groupId);
			groupSet?.delete(id);
			if (groupSet && groupSet.size === 0) {
				this.tabIdsByGroupId.delete(tab.groupId);
			}
		}

		if (this.activeTabId === id) {
			this.activeTabId = null;
		}

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
		if (draggedIndex < targetIndex) targetIndex--;
		this.tabs.splice(targetIndex, 0, removed);
	};

	getGroups = () => {
		return this.groups;
	};

	getGroupById = (groupId: string) => {
		return this.groups.find(group => group.id === groupId);
	};

	registerGroup = (group: TabGroup) => {
		const existing = this.getGroupById(group.id);
		if (existing) return;
		this.groups.push(group);
		if (!this.tabIdsByGroupId.has(group.id)) {
			this.tabIdsByGroupId.set(group.id, new Set(group.tabIds || []));
		}
	};

	updateTabGroup = (tabId: string, groupId: string | undefined) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;

		if (tab.groupId) {
			const previousGroupSet = this.tabIdsByGroupId.get(tab.groupId);
			previousGroupSet?.delete(tabId);
			if (previousGroupSet && previousGroupSet.size === 0) {
				this.tabIdsByGroupId.delete(tab.groupId);
			}
		}

		tab.groupId = groupId;

		if (groupId) {
			let nextGroupSet = this.tabIdsByGroupId.get(groupId);
			if (!nextGroupSet) {
				nextGroupSet = new Set<string>();
				this.tabIdsByGroupId.set(groupId, nextGroupSet);
			}
			nextGroupSet.add(tabId);
		}
	};

	isTabPinned = (tabId: string) => {
		return this.pinnedTabIds.has(tabId);
	};

	setTabPinned = (tabId: string, pinned: boolean) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		tab.isPinned = pinned;
		if (pinned) {
			this.pinnedTabIds.add(tabId);
		} else {
			this.pinnedTabIds.delete(tabId);
		}
	};

	setTabSplitPlacement = (tabId: string, placement: TabSplitPlacement) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		tab.splitPlacement = placement;
		this.splitByTabId.set(tabId, placement);
	};

	setTabCache = (tabId: string, cache: TabCacheEntry | undefined) => {
		const tab = this.getTabById(tabId);
		if (!tab) return;
		tab.cache = cache;
		if (cache) {
			this.tabCacheById.set(tabId, cache);
		} else {
			this.tabCacheById.delete(tabId);
		}
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

	createTab = async (url: string) => {
		return await this.lifecycleModule.createTab(url);
	};

	closeTabById = async (id: string) => {
		// Clean up ChiiDevTools instance for this tab before closing
		const chiiInstance = this.chiiInstances.get(id);
		if (chiiInstance) {
			chiiInstance.cleanup();
			this.chiiInstances.delete(id);
		}
		return await this.lifecycleModule.closeTabById(id);
	};

	closeCurrentTab = async () => {
		return await this.lifecycleModule.closeCurrentTab();
	};

	closeAllTabs = async () => {
		return await this.lifecycleModule.closeAllTabs();
	};

	selectTab = async (tabId: string) => {
		this.activeTabId = tabId;
		return await this.lifecycleModule.selectTab(tabId);
	};

	selectTabById = (id: string) => {
		return this.lifecycleModule.selectTabById(id);
	};

	updateTabAttributes = () => {
		return this.lifecycleModule.updateTabAttributes();
	};

	duplicateTab = (tabId: string): string | null => {
		return this.manipulationModule.duplicateTab(tabId);
	};

	refreshTab = (tabId: string) => {
		return this.manipulationModule.refreshTab(tabId);
	};

	reloadTab = (tabId: string) => {
		return this.manipulationModule.refreshTab(tabId);
	};

	closeTabsToRight = (tabId: string): void => {
		return this.manipulationModule.closeTabsToRight(tabId);
	};

	reorderTabElements = () => {
		return this.manipulationModule.reorderTabElements();
	};

	setFavicon = (tabElement: HTMLElement, iframe: HTMLIFrameElement): void => {
		return this.manipulationModule.setFavicon(tabElement, iframe);
	};

	pageClient = (iframe: HTMLIFrameElement) => {
		return this.pageClientModule.pageClient(iframe);
	};

	startMetaWatcher = (
		tabId: string,
		iframe: HTMLIFrameElement,
		tabEl: HTMLElement
	) => {
		return this.metaWatcherModule.startMetaWatcher(tabId, iframe, tabEl);
	};

	stopMetaWatcher = async (tabId: string) => {
		return await this.metaWatcherModule.stopMetaWatcher(tabId);
	};

	getHistoryManager = () => {
		return this.historyIntegration.getHistoryManager();
	};

	toggleChiiDevTools = () => {
		const activeTab = this.tabs.find(tab =>
			tab.tab.classList.contains('active')
		);
		if (!activeTab) {
			console.warn('[Tabs] No active tab found for ChiiDevTools toggle');
			return;
		}

		// Reuse existing ChiiDevTools instance for this tab, or create one
		let chiiDevTools = this.chiiInstances.get(activeTab.id);
		if (!chiiDevTools) {
			chiiDevTools = new ChiiDevTools(activeTab, this.logger);
			this.chiiInstances.set(activeTab.id, chiiDevTools);
		}
		chiiDevTools.toggleInspect();
	};

	setupTabContextMenu = (tabElement: HTMLElement, tabId: string) => {
		return this.contextMenuModule.setupTabContextMenu(tabElement, tabId);
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
		if (tabBar) {
			tabBar.setAttribute(
				'styleMode',
				enabled ? 'vertical' : 'horizontal'
			);
		}

		const existingTabs = window.d.querySelectorAll<HTMLElement>(
			'[data-component="tab"]'
		);
		existingTabs.forEach(tab => {
			tab.setAttribute('styleMode', enabled ? 'vertical' : 'horizontal');
		});

		movableNodes.forEach(node => {
			const destinationName = enabled
				? node.dataset.verticalTarget
				: node.dataset.verticalHome;

			if (!destinationName) {
				return;
			}

			const destination = window.d.querySelector(
				`[data-component="${destinationName}"]`
			) as HTMLElement | null;

			if (destination && node.parentElement !== destination) {
				destination.appendChild(node);
			}
		});
	};

	toggleVerticalTabsLayout = () => {
		this.verticalTabsEnabled = !this.verticalTabsEnabled;
		this.applyVerticalTabsLayout();
		return this.verticalTabsEnabled;
	};

	toggleVerticalTabsCollapsed = () => {
		if (!this.verticalTabsEnabled) {
			return false;
		}

		this.verticalTabsCollapsed = !this.verticalTabsCollapsed;
		this.applyVerticalTabsLayout();
		return this.verticalTabsCollapsed;
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
}

export { Tabs };
