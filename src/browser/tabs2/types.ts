export interface TabGroup {
	id: string;
	name: string;
	color: string;
	isCollapsed: boolean;
	tabIds: string[];
}

export type TabSplitPlacement =
	| 'main'
	| 'split-left'
	| 'split-right'
	| 'sidepanel-left'
	| 'sidepanel-right'
	| 'devtools';

export interface TabCacheEntry {
	title: string;
	favicon: string | null;
	url: string;
	timestamp: number;
}

export interface TabData {
	id: string;
	tab: HTMLElement;
	iframe: HTMLIFrameElement;
	title: string;
	favicon: string | null;
	url: string;
	groupId: string | undefined;
	isPinned: boolean;
	splitPlacement: TabSplitPlacement;
	frameId: string;
	lastInternalRoute: string | undefined;
	lastAddressShown: string | undefined;
	cache: TabCacheEntry | undefined;
	chiiPanel:
		| {
				isActive: boolean;
				devtoolsIframe: HTMLIFrameElement | null;
				container: HTMLDivElement | null;
				resizeHandle: HTMLDivElement | null;
				height: number;
				messageRelaySetup?: boolean;
				messageHandler?: (event: MessageEvent) => void;
		  }
		| undefined;
}

export interface TabsInterface {
	ui: any;
	proto: any;
	items: any;
	logger: any;
	settings: any;
	eventsAPI: any;
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
	proxy: any;
	bookmarkManager: any;
	swConfig: any;
	proxySetting: string;

	tabEls: HTMLElement[];
	bookmarkUI: any;

	createTab: (url: string) => Promise<void>;
	closeTabById: (id: string) => Promise<void>;
	closeCurrentTab: () => Promise<void>;
	closeAllTabs: () => Promise<void>;
	selectTab: (tabId: string) => Promise<void>;
	selectTabById: (id: string) => void;
	updateTabAttributes: () => void;

	getTabsInOrder: () => TabData[];
	getTabById: (id: string) => TabData | undefined;
	getTabIndex: (id: string) => number;
	registerTab: (tabData: TabData) => void;
	removeTab: (id: string) => TabData | undefined;
	moveTabInOrder: (
		draggedTabId: string,
		targetTabId: string,
		placeAfter?: boolean
	) => void;

	getGroups: () => TabGroup[];
	getGroupById: (groupId: string) => TabGroup | undefined;
	registerGroup: (group: TabGroup) => void;
	updateTabGroup: (tabId: string, groupId: string | undefined) => void;

	isTabPinned: (tabId: string) => boolean;
	setTabPinned: (tabId: string, pinned: boolean) => void;

	setTabSplitPlacement: (tabId: string, placement: TabSplitPlacement) => void;

	setTabCache: (tabId: string, cache: TabCacheEntry | undefined) => void;
	updateTabMetadata: (
		tabId: string,
		data: Partial<Pick<TabData, 'title' | 'favicon' | 'url'>>
	) => void;

	duplicateTab: (tabId: string) => string | null;
	refreshTab: (tabId: string) => void;
	closeTabsToRight: (tabId: string) => void;
	reorderTabElements: () => void;
	setFavicon: (tabElement: HTMLElement, iframe: HTMLIFrameElement) => void;

	pageClient: (iframe: HTMLIFrameElement) => void;
	pageClientModule?: {
		cleanupIframe: (iframeId: string) => void;
		cleanupAll: () => void;
	};

	startMetaWatcher: (
		tabId: string,
		iframe: HTMLIFrameElement,
		tabEl: HTMLElement
	) => void;
	stopMetaWatcher: (tabId: string) => Promise<void>;

	setupTabContextMenu: (tabElement: HTMLElement, tabId: string) => void;
	setupVerticalTabsToggle: () => void;
	toggleVerticalTabsLayout: () => boolean;
	toggleVerticalTabsCollapsed: () => boolean;

	groupManager?: any;
	pinManager?: any;
	nightmarePlugins?: any;
	closeAllTabsInGroup?: (groupId: string) => void;
}
