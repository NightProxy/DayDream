export interface TabGroup {
	id: string;
	name: string;
	color: string;
	isCollapsed: boolean;
	tabIds: string[];
}

export type VisualOrderMode = 'horizontal' | 'vertical';

export interface VisualTabOrderEntry {
	kind: 'tab' | 'groupHeader';
	id: string;
	groupId?: string;
	tabId?: string;
}

export type TabSplitPlacement = 'main' | 'split-left' | 'split-right';

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
	/**
	 * If set, this tab is paired with another tab in a 2-pane split.
	 * Both tabs reference each other (a.splitPartnerId === b.id, and
	 * b.splitPartnerId === a.id). The left/right assignment is given
	 * by each tab's splitPlacement.
	 */
	splitPartnerId: string | undefined;
	frameId: string;
	lastInternalRoute: string | undefined;
	lastAddressShown: string | undefined;
	cache: TabCacheEntry | undefined;
	devtoolsPanel:
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
	groupHeaderElementById: Map<string, HTMLElement>;
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

	createTab: (url: string) => Promise<string>;
	createTabToRight: (
		referenceTabId: string,
		url?: string
	) => Promise<string | null>;
	closeTabById: (id: string) => Promise<void>;
	closeOtherTabs: (tabId: string) => Promise<void>;
	closeCurrentTab: () => Promise<void>;
	closeAllTabs: () => Promise<void>;
	selectTab: (tabId: string) => Promise<void>;
	selectTabById: (id: string) => void;
	updateTabAttributes: () => void;

	getTabsInOrder: () => TabData[];
	getPinnedTabs: () => TabData[];
	getUngroupedUnpinnedTabs: () => TabData[];
	getGroupTabs: (groupId: string) => TabData[];
	getVisualTabOrder: (mode: VisualOrderMode) => VisualTabOrderEntry[];
	getTabById: (id: string) => TabData | undefined;
	getTabIndex: (id: string) => number;
	registerTab: (tabData: TabData) => void;
	removeTab: (id: string) => TabData | undefined;
	moveTabInOrder: (
		draggedTabId: string,
		targetTabId: string,
		placeAfter?: boolean
	) => void;
	reorderPinned: (tabId: string, toIndex: number) => void;
	reorderUngrouped: (tabId: string, toIndex: number) => void;
	reorderWithinGroup: (
		tabId: string,
		groupId: string,
		toIndex: number
	) => void;
	reorderGroups: (groupId: string, toIndex: number) => void;
	renderTabStrip: () => void;
	ensureStateInvariants: () => boolean;
	runStateTransaction: (label: string, mutate: () => void) => boolean;

	getGroups: () => TabGroup[];
	getGroupById: (groupId: string) => TabGroup | undefined;
	registerGroup: (group: TabGroup) => void;
	updateTabGroup: (tabId: string, groupId: string | undefined) => void;

	isTabPinned: (tabId: string) => boolean;
	setTabPinned: (tabId: string, pinned: boolean) => void;
	syncTabVisualState: (tabId: string) => void;

	setTabSplitPlacement: (tabId: string, placement: TabSplitPlacement) => void;

	setTabCache: (tabId: string, cache: TabCacheEntry | undefined) => void;
	updateTabMetadata: (
		tabId: string,
		data: Partial<Pick<TabData, 'title' | 'favicon' | 'url'>>
	) => void;

	duplicateTab: (tabId: string) => string | null;
	refreshTab: (tabId: string) => void;
	hardReloadTab: (tabId: string) => void;
	stopTab: (tabId: string) => void;
	savePage: (tabId: string) => Promise<void>;
	reopenClosedTab: () => Promise<string | null>;
	closedTabStack: import('./closedTabStack').TabClosedStack;
	navStack: import('./navStack').TabNavStack;
	auxiliaryMenus: import('./auxiliaryMenus').AuxiliaryMenus;
	closeTabsToRight: (tabId: string) => void;
	reorderTabElements: () => void;
	setFavicon: (tabElement: HTMLElement, iframe: HTMLIFrameElement) => void;

	pageClient: (iframe: HTMLIFrameElement) => void;
	pageClientModule?: {
		cleanupIframe: (iframeId: string) => void;
		cleanupAll: () => void;
	};
	frameManager?: {
		createManagedFrame: (
			tabId: string,
			url: string,
			placement?: TabSplitPlacement
		) => Promise<{
			iframe: HTMLIFrameElement;
			frameId: string;
			proxyHandle: any;
		}>;
		attachFrame: (tabId: string, container: HTMLElement) => void;
		navigateFrame: (tabId: string, url: string) => Promise<void>;
		cleanupFrame: (tabId: string) => void;
		setFramePlacement: (
			tabId: string,
			splitPlacement: TabSplitPlacement
		) => void;
	};
	splitLayout?: import('./splitLayout').SplitLayoutManager;
	/**
	 * Pair the given tab with the active tab in a 2-pane split. The
	 * active tab becomes split-left, partnerTabId becomes split-right.
	 * Returns true on success.
	 */
	splitWithActiveTab?: (partnerTabId: string) => boolean;
	/** Dissolve the split that the given tab is part of. */
	unsplitTab?: (tabId: string) => void;
	/**
	 * For a split tab pair, which side is the focused frame.
	 * The keys are tabId of either side; both keys map to the same value.
	 */
	focusedSplitSideByPairKey?: Map<string, string>;
	setSplitFocus?: (tabId: string) => void;
	getSplitFocusedTabId?: (tabId: string) => string;

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

	groupManager?: {
		createGroupWithTab: (tabId: string) => string | null;
		addTabToGroup: (
			tabId: string,
			groupId: string,
			targetIndex?: number
		) => boolean;
		removeTabFromGroup: (
			tabId: string,
			toUngroupedIndex?: number
		) => boolean;
		deleteGroup: (groupId: string) => boolean;
		ungroupAllTabs: (groupId: string) => boolean;
		toggleGroupCollapse: (groupId: string) => boolean;
		renameGroup: (groupId: string, nextName?: string) => boolean;
		changeGroupColor: (groupId: string, color: string) => boolean;
		closeAllTabsInGroup: (groupId: string) => Promise<void>;
	};
	pinManager?: {
		pinTab: (tabId: string) => boolean;
		unpinTab: (tabId: string) => boolean;
		togglePin: (tabId: string) => boolean;
		isPinned: (tabId: string) => boolean;
	};
	nightmarePlugins?: any;
	closeAllTabsInGroup?: (groupId: string) => Promise<void>;
}
