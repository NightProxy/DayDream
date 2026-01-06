export interface TabGroup {
  id: string;
  name: string;
  color: string;
  isCollapsed: boolean;
  tabIds: string[];
}

export interface TabData {
  id: string;
  tab: HTMLElement;
  iframe: HTMLIFrameElement;
  url: string;
  groupId: string | undefined;
  isPinned: boolean;
  lastInternalRoute: string | undefined;
  lastAddressShown: string | undefined;
}

export interface TabsInterface {
  render: any;
  ui: any;
  proto: any;
  items: any;
  logger: any;
  settings: any;
  eventsAPI: any;
  tabCount: number;
  tabs: TabData[];
  groups: TabGroup[];
  el: HTMLDivElement;
  instanceId: number;
  styleEl: HTMLStyleElement;
  proxy: any;
  bookmarkManager: any;
  swConfig: any;
  proxySetting: string;
  nightmarePlugins: any;
  dragHandler: any;
  groupManager: any;
  pinManager: any;

  tabEls: HTMLElement[];
  pinnedTabEls: HTMLElement[];
  unpinnedTabEls: HTMLElement[];

  tabContentWidths: number[];
  tabContentPositions: number[];
  tabPositions: number[];
  tabContentHeights: number[];
  tabContentPositionsY: number[];
  tabPositionsY: number[];
  popGlow: (el: HTMLElement) => void;

  createTab: (url: string) => Promise<void>;
  closeTabById: (id: string) => Promise<void>;
  closeCurrentTab: () => Promise<void>;
  closeAllTabs: () => Promise<void>;
  selectTab: (tabId: string) => Promise<void>;
  selectTabById: (id: string) => void;
  updateTabAttributes: () => void;

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
    tabEl: HTMLElement,
  ) => void;
  stopMetaWatcher: (tabId: string) => Promise<void>;

  setupTabContextMenu: (tabElement: HTMLElement, tabId: string) => void;
  setupSortable: () => void;
  layoutTabs: () => void;

  renameGroup: (groupId: string, newName?: string) => boolean;
  changeGroupColor: (groupId: string, color: string) => boolean;
  ungroupAllTabs: (groupId: string) => boolean;
  deleteGroup: (groupId: string) => boolean;
  createGroupWithTab: (tabId: string, groupName?: string) => string | null;
  addTabToGroup: (tabId: string, groupId: string) => boolean;
  removeTabFromGroup: (tabId: string) => boolean;
  toggleGroup: (groupId: string) => boolean;
  getTabGroup: (tabId: string) => TabGroup | null;
  getGroupTabs: (groupId: string) => TabData[];
  closeAllTabsInGroup: (groupId: string) => boolean;

  togglePinTab: (tabId: string) => void;
  isPinned: (tabId: string) => boolean;
}
