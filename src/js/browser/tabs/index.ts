import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { NightmarePlugins } from "@browser/nightmarePlugins";
import { Protocols } from "@browser/protocols";
import { Items } from "@browser/items";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";
import { Proxy } from "@apis/proxy";
import { BookmarkManager as BM } from "@apis/bookmarks";
import { TabDragHandler } from "./drag";
import { TabGroupManager } from "./group";
import { TabPinManager } from "./pin";
import { ChiiDevTools } from "@browser/functions";

import type { TabsInterface, TabGroup, TabData } from "./types";
import { BookmarkManager } from "./bookmarks";
import { TabLayout } from "./layout";
import { TabLifecycle } from "./lifecycle";
import { TabManipulation } from "./manipulation";
import { TabContextMenu } from "./contextMenu";
import { TabPageClient } from "./pageClient";
import { TabMetaWatcher } from "./metaWatcher";
import { TabHistoryIntegration } from "./historyIntegration";

class Tabs implements TabsInterface {
  render: any;
  ui: UI;
  proto: Protocols;
  items: Items;
  logger: Logger;
  settings: SettingsAPI;
  eventsAPI: EventSystem;
  tabCount: number;
  tabs: TabData[];
  groups: TabGroup[];
  el: HTMLDivElement;
  instanceId: number;
  styleEl: HTMLStyleElement;
  proxy: Proxy;
  bookmarkManager: BM;
  swConfig: any;
  proxySetting: string;
  nightmarePlugins: NightmarePlugins;
  dragHandler: TabDragHandler;
  groupManager: TabGroupManager;
  pinManager: TabPinManager;
  keyboard: any;

  private bookmarkModule: BookmarkManager;
  private layoutModule: TabLayout;
  private lifecycleModule: TabLifecycle;
  private manipulationModule: TabManipulation;
  private contextMenuModule: TabContextMenu;
  pageClientModule: TabPageClient;
  private metaWatcherModule: TabMetaWatcher;
  private historyIntegration: TabHistoryIntegration;

  constructor(
    render: any,
    proto: any,
    swConfig: any,
    proxySetting: string,
    items: Items,
    proxy: Proxy,
  ) {
    this.render = render;
    this.ui = new UI();
    this.proto = proto;
    this.items = items;
    this.logger = new Logger();
    this.settings = new SettingsAPI();
    this.eventsAPI = new EventSystem();
    this.tabCount = 0;
    this.tabs = [];
    this.groups = [];
    this.el = render.container;
    this.proxy = proxy;
    this.bookmarkManager = new BM();
    this.swConfig = swConfig;
    this.proxySetting = proxySetting;
    this.nightmarePlugins = new NightmarePlugins();

    this.instanceId = 0;
    this.instanceId += 1;

    this.styleEl = document.createElement("style");
    this.el.appendChild(this.styleEl);

    this.dragHandler = new TabDragHandler(this);
    this.groupManager = new TabGroupManager(this);
    this.pinManager = new TabPinManager(this);

    this.bookmarkModule = new BookmarkManager(this);
    this.layoutModule = new TabLayout(this);
    this.lifecycleModule = new TabLifecycle(this);
    this.manipulationModule = new TabManipulation(this);
    this.contextMenuModule = new TabContextMenu(this);
    this.pageClientModule = new TabPageClient(this);
    this.metaWatcherModule = new TabMetaWatcher(this);
    this.historyIntegration = new TabHistoryIntegration(this);

    this.initBookmarkManager();
    this.initKeyboardShortcuts();
  }

  private initKeyboardShortcuts() {
    const keyboard = this.keyboard;
    if (!keyboard?.keybindManager) return;

    keyboard.keybindManager.registerAction("create_tab_group", () => {
      const activeTabs = this.tabs.filter((tab) =>
        tab.tab.classList.contains("active"),
      );
      if (activeTabs.length > 0) {
        this.groupManager.createGroupWithTab(activeTabs[0].id);
      }
    });

    keyboard.keybindManager.registerAction("ungroup_tab", () => {
      const activeTabs = this.tabs.filter((tab) =>
        tab.tab.classList.contains("active"),
      );
      if (activeTabs.length > 0 && activeTabs[0].groupId) {
        this.groupManager.removeTabFromGroup(activeTabs[0].id);
      }
    });

    keyboard.keybindManager.registerAction("pin_tab", () => {
      const activeTabs = this.tabs.filter((tab) =>
        tab.tab.classList.contains("active"),
      );
      if (activeTabs.length > 0) {
        this.pinManager.togglePinTab(activeTabs[0].id);
      }
    });

    keyboard.keybindManager.registerAction("duplicate_tab", () => {
      const activeTabs = this.tabs.filter((tab) =>
        tab.tab.classList.contains("active"),
      );
      if (activeTabs.length > 0) {
        this.duplicateTab(activeTabs[0].id);
      }
    });

    keyboard.keybindManager.registerAction("reload_tab", () => {
      const activeTabs = this.tabs.filter((tab) =>
        tab.tab.classList.contains("active"),
      );
      if (activeTabs.length > 0) {
        this.reloadTab(activeTabs[0].id);
      }
    });

    keyboard.keybindManager.registerAction("refresh_tab", () => {
      const activeTabs = this.tabs.filter((tab) =>
        tab.tab.classList.contains("active"),
      );
      if (activeTabs.length > 0) {
        this.refreshTab(activeTabs[0].id);
      }
    });

    keyboard.keybindManager.registerAction("close_tab", () => {
      const activeTabs = this.tabs.filter((tab) =>
        tab.tab.classList.contains("active"),
      );
      if (activeTabs.length > 0) {
        this.closeTabById(activeTabs[0].id);
      }
    });
  }

  private async initBookmarkManager() {
    await this.bookmarkModule.init();

    this.groupManager.initializeGroupVisuals();
  }

  get tabEls() {
    return Array.prototype.slice.call(
      this.ui.queryComponentAll("tab", this.el),
    );
  }

  get pinnedTabEls() {
    return this.pinManager.pinnedTabEls;
  }

  get unpinnedTabEls() {
    return this.pinManager.unpinnedTabEls;
  }

  get tabContentWidths() {
    return this.layoutModule.tabContentWidths;
  }

  get tabContentPositions() {
    return this.layoutModule.tabContentPositions;
  }

  get tabPositions() {
    return this.layoutModule.tabPositions;
  }

  get tabContentHeights() {
    return this.layoutModule.tabContentHeights;
  }

  get tabContentPositionsY() {
    return this.layoutModule.tabContentPositionsY;
  }

  get tabPositionsY() {
    return this.layoutModule.tabPositionsY;
  }

  get bookmarkUI() {
    return this.bookmarkModule;
  }

  popGlow = (el: HTMLElement) => {
    this.layoutModule.popGlow(el);
  };

  createTab = async (url: string) => {
    return await this.lifecycleModule.createTab(url);
  };

  closeTabById = async (id: string) => {
    return await this.lifecycleModule.closeTabById(id);
  };

  closeCurrentTab = async () => {
    return await this.lifecycleModule.closeCurrentTab();
  };

  closeAllTabs = async () => {
    return await this.lifecycleModule.closeAllTabs();
  };

  selectTab = async (tabId: string) => {
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
    tabEl: HTMLElement,
  ) => {
    return this.metaWatcherModule.startMetaWatcher(tabId, iframe, tabEl);
  };

  stopMetaWatcher = async (tabId: string) => {
    return await this.metaWatcherModule.stopMetaWatcher(tabId);
  };

  renameGroup = (groupId: string, newName?: string): boolean => {
    return this.groupManager.renameGroup(groupId, newName);
  };

  changeGroupColor = (groupId: string, color: string): boolean => {
    return this.groupManager.changeGroupColor(groupId, color);
  };

  ungroupAllTabs = (groupId: string): boolean => {
    return this.groupManager.ungroupAllTabs(groupId);
  };

  deleteGroup = (groupId: string): boolean => {
    return this.groupManager.deleteGroup(groupId);
  };

  togglePinTab = (tabId: string) => {
    this.pinManager.togglePinTab(tabId);
  };

  isPinned = (tabId: string): boolean => {
    return this.pinManager.isPinned(tabId);
  };

  createGroupWithTab = (tabId: string, groupName?: string): string | null => {
    return this.groupManager.createGroupWithTab(tabId, groupName);
  };

  addTabToGroup = (tabId: string, groupId: string): boolean => {
    return this.groupManager.addTabToGroup(tabId, groupId);
  };

  removeTabFromGroup = (tabId: string): boolean => {
    return this.groupManager.removeTabFromGroup(tabId);
  };

  toggleGroup = (groupId: string): boolean => {
    return this.groupManager.toggleGroup(groupId);
  };

  getTabGroup = (tabId: string): TabGroup | null => {
    return this.groupManager.getTabGroup(tabId);
  };

  getGroupTabs = (groupId: string): TabData[] => {
    return this.groupManager.getGroupTabs(groupId);
  };

  closeAllTabsInGroup = (groupId: string): boolean => {
    return this.groupManager.closeAllTabsInGroup(groupId);
  };

  getHistoryManager = () => {
    return this.historyIntegration.getHistoryManager();
  };

  toggleChiiDevTools = () => {
    const activeTab = this.tabs.find((tab) =>
      tab.tab.classList.contains("active"),
    );
    if (!activeTab) {
      console.warn("[Tabs] No active tab found for ChiiDevTools toggle");
      return;
    }

    const chiiDevTools = new ChiiDevTools(activeTab, this.logger);
    chiiDevTools.toggleInspect();
  };

  layoutTabs = () => {
    this.layoutModule.renderGroupHeaders();
  };

  setupTabContextMenu = (tabElement: HTMLElement, tabId: string) => {
    return this.contextMenuModule.setupTabContextMenu(tabElement, tabId);
  };

  setupSortable = () => {
    this.dragHandler.setupSortable();

    const tabEls = this.tabEls;
    tabEls.forEach((tabEl: HTMLElement) => {
      const tabId = tabEl.id;
      if (!tabEl.hasAttribute("data-context-menu-setup")) {
        this.setupTabContextMenu(tabEl, tabId);
        tabEl.setAttribute("data-context-menu-setup", "true");
      }
    });

    this.groupManager.initializeGroupVisuals();
    this.layoutTabs();
  };

  async saveSession() {
    const tabsCache = this.tabs.map((tab, index) => {
      let cleanUrl = tab.url || "";

      if (cleanUrl.includes(this.swConfig.sj?.config?.prefix)) {
        try {
          cleanUrl = decodeURIComponent(
            cleanUrl.replace(this.swConfig.sj.config.prefix, ""),
          );
        } catch (e) {
          console.warn("Failed to decode scramjet URL:", cleanUrl);
        }
      } else if (cleanUrl.includes(this.swConfig.uv?.config?.prefix)) {
        try {
          cleanUrl = this.swConfig.uv.config.decodeUrl(
            cleanUrl.replace(this.swConfig.uv.config.prefix, ""),
          );
        } catch (e) {
          console.warn("Failed to decode UV URL:", cleanUrl);
        }
      }

      return {
        id: tab.id,
        url: cleanUrl,
        title: tab.iframe?.contentDocument?.title || "New Tab",
        favicon: "",
        pinned: tab.isPinned || false,
        groupId: tab.groupId,
        order: index,
      };
    });

    const groupsCache = this.groups.map((group, index) => ({
      id: group.id,
      name: group.name,
      color: group.color,
      collapsed: group.isCollapsed,
      order: index,
    }));

    const activeTab = this.tabs.find((tab) =>
      tab.tab.classList.contains("active"),
    );

    await window.cache.saveSession({
      tabs: tabsCache,
      groups: groupsCache,
      activeTabId: activeTab?.id,
    });
  }

  async restoreSession() {
    const cached = await window.cache.getCache();

    if (!cached.tabs || cached.tabs.length === 0) {
      return false;
    }

    for (const group of cached.groups || []) {
      this.groups.push({
        id: group.id,
        name: group.name,
        color: group.color,
        isCollapsed: group.collapsed,
        tabIds: [],
      });
    }

    for (const tabCache of cached.tabs) {
      await this.createTab(tabCache.url);

      const tabData = this.tabs[this.tabs.length - 1];
      if (tabData) {
        if (tabCache.pinned) {
          this.pinManager.togglePinTab(tabData.id);
        }
        if (tabCache.groupId) {
          tabData.groupId = tabCache.groupId;
          const group = this.groups.find((g) => g.id === tabCache.groupId);
          if (group && !group.tabIds.includes(tabData.id)) {
            group.tabIds.push(tabData.id);
          }
        }
      }
    }

    if (cached.activeTabId) {
      const activeTab = this.tabs.find((t) => t.id === cached.activeTabId);
      if (activeTab) {
        activeTab.tab.click();
      }
    }

    this.setupSortable();
    return true;
  }
}

export { Tabs };
