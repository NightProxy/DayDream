import { Nightmare as UI } from "@libs/Nightmare/nightmare";
import { NightmarePlugins } from "@browser/nightmarePlugins";
import { Protocols } from "@browser/protocols";
import { Utils } from "@js/utils";
import { Items } from "@browser/items";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { EventSystem } from "@apis/events";
import { Proxy } from "@apis/proxy";
import { TabDragHandler } from "./drag";
import { TabGroupManager } from "./group";
import { TabPinManager } from "./pin";
import { createIcons, icons } from "lucide";

interface TabGroup {
  id: string;
  name: string;
  color: string;
  isCollapsed: boolean;
  tabIds: string[];
}

interface TabsInterface {
  render: any;
  ui: UI;
  proto: Protocols;
  utils: Utils;
  items: Items;
  logger: Logger;
  settings: SettingsAPI;
  eventsAPI: EventSystem;
  tabCount: number;
  tabs: any[];
  groups: TabGroup[];
  el: HTMLDivElement;
  instanceId: number;
  styleEl: HTMLStyleElement;
  proxy: Proxy;
  swConfig: any;
  proxySetting: string;
  nightmarePlugins: NightmarePlugins;
  dragHandler: TabDragHandler;
  groupManager: TabGroupManager;
  pinManager: TabPinManager;
}

class Tabs implements TabsInterface {
  render: any;
  ui: UI;
  proto: Protocols;
  utils: Utils;
  items: Items;
  logger: Logger;
  settings: SettingsAPI;
  eventsAPI: EventSystem;
  tabCount: number;
  tabs: any[];
  groups: TabGroup[];
  el: HTMLDivElement;
  instanceId: number;
  styleEl: HTMLStyleElement;
  proxy: Proxy;
  swConfig: any;
  proxySetting: string;
  nightmarePlugins: NightmarePlugins;
  dragHandler: TabDragHandler;
  groupManager: TabGroupManager;
  pinManager: TabPinManager;

  constructor(render: any, proto: any, swConfig: any, proxySetting: string) {
    this.render = render;
    this.ui = new UI();
    this.proto = proto;
    this.utils = new Utils();
    this.items = new Items();
    this.logger = new Logger();
    this.settings = new SettingsAPI();
    this.eventsAPI = new EventSystem();
    this.tabCount = 0;
    this.tabs = [];
    this.groups = [];
    this.el = render.container;
    this.proxy = new Proxy();
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
  }

  get tabEls() {
    //return Array.prototype.slice.call(this.el.querySelectorAll(".tab"));
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

  popGlow = (el: HTMLElement) => {
    el.style.transition = ".4s ease-out";
  };

  get tabContentWidths() {
    const numberOfTabs = this.tabEls.length;
    const tabsContentWidth =
      this.el.querySelector(".tabs-content")!.clientWidth;
    const tabsCumulativeOverlappedWidth = (numberOfTabs - 1) * 1;
    const targetWidth =
      (tabsContentWidth - 2 * 9 + tabsCumulativeOverlappedWidth) / numberOfTabs;
    const clampedTargetWidth = Math.max(24, Math.min(240, targetWidth));
    const flooredClampedTargetWidth = Math.floor(clampedTargetWidth);
    const totalTabsWidthUsingTarget =
      flooredClampedTargetWidth * numberOfTabs +
      2 * 9 -
      tabsCumulativeOverlappedWidth;
    const totalExtraWidthDueToFlooring =
      tabsContentWidth - totalTabsWidthUsingTarget;

    const widths = [];
    let extraWidthRemaining = totalExtraWidthDueToFlooring;
    for (let i = 0; i < numberOfTabs; i += 1) {
      const extraWidth =
        flooredClampedTargetWidth < 240 && extraWidthRemaining > 0 ? 1 : 0;
      widths.push(flooredClampedTargetWidth + extraWidth);
    }

    return widths;
  }

  get tabContentPositions() {
    const positions: any[] = [];
    const tabContentWidths = this.tabContentWidths;

    let position = 9;
    tabContentWidths.forEach((width, i) => {
      const offset = i * 1;
      positions.push(position + 4 - offset);
      position += width;
    });

    return positions;
  }

  get tabPositions() {
    const positions: any[] = [];

    this.tabContentPositions.forEach((contentPosition) => {
      positions.push(contentPosition);
    });

    return positions;
  }

  get tabContentHeights() {
    const numberOfTabs = this.tabEls.length;
    const tabsContentHeight =
      this.el.querySelector(".tabs-content")!.clientHeight;
    const tabsCumulativeOverlappedHeight = (numberOfTabs - 1) * 1;
    const targetHeight =
      (tabsContentHeight + tabsCumulativeOverlappedHeight) / numberOfTabs;
    const clampedTargetHeight = Math.max(24, Math.min(36, targetHeight));
    const flooredClampedTargetHeight = Math.floor(clampedTargetHeight);
    const totalTabsHeightUsingTarget =
      flooredClampedTargetHeight * numberOfTabs -
      tabsCumulativeOverlappedHeight;
    const totalExtraHeightDueToFlooring =
      tabsContentHeight - totalTabsHeightUsingTarget;

    const heights = [];
    let extraHeightRemaining = totalExtraHeightDueToFlooring;
    for (let i = 0; i < numberOfTabs; i += 1) {
      const extraHeight =
        flooredClampedTargetHeight < 36 && extraHeightRemaining > 0 ? 1 : 0;
      heights.push(flooredClampedTargetHeight + extraHeight);
    }

    return heights;
  }

  get tabContentPositionsY() {
    const positions: any[] = [];
    const tabContentHeights = this.tabContentHeights;

    let position = 9;
    tabContentHeights.forEach((height, i) => {
      const offset = i * 1;
      positions.push(position + 4 - offset);
      position += height;
    });

    return positions;
  }

  get tabPositionsY() {
    const positions: any[] = [];

    this.tabContentPositionsY.forEach((contentPosition) => {
      positions.push(contentPosition);
    });

    return positions;
  }

  createTab = async (url: string) => {
    this.tabCount++;
    let tabTitle = "New Tab";

    const id = `tab-${this.tabCount}`;
    const iframe = this.ui.createElement("iframe", {
      src: await this.proto.processUrl(url),
      id: `iframe-${this.tabCount}`,
      title: `Iframe #${this.tabCount}`,
    }) as HTMLIFrameElement;

    const tab = this.ui.createElement(
      "div",
      {
        class: "tab inactive transition-all duration-200 ease-out tab-anim",
        id: id,
      },
      [
        this.ui.createElement("div", { class: "tab-content" }, [
          this.ui.createElement("div", { class: "tab-group-color" }),
          this.ui.createElement("div", { class: "tab-favicon" }),
          this.ui.createElement("div", { class: "tab-title" }, [tabTitle]),
          this.ui.createElement("div", { class: "tab-drag-handle" }),
          this.ui.createElement(
            "button",
            {
              class: "tab-close",
              id: `close-${id}`,
            },
            [
              this.ui.createElement("span", { class: "x" }, [
                this.ui.createElement(
                  "i",
                  { "data-lucide": "x", class: "h-3.5 w-3.5" },
                  [],
                ),
              ]),
            ],
          ),
        ]),
      ],
    );

    iframe.addEventListener("load", async () => {
      try {
        if (iframe.contentWindow) {
          this.pageClient(iframe);
        } else {
          console.error("Iframe contentWindow is not accessible.");
        }
        this.startMetaWatcher(id, iframe, tab);
      } catch (error) {
        console.error("An error occurred while loading the iframe:", error);
      }
    });

    tab.addEventListener("click", () => {
      this.selectTab(id);
    });

    tab.querySelector(`#close-${id}`)!.addEventListener("click", async () => {
      await this.closeTabById(id);
    });

    this.items.tabBar!.appendChild(tab);
    this.items.frameContainer!.appendChild(iframe);
    createIcons({ icons });

    const tabData = {
      id,
      tab,
      iframe,
      url,
      groupId: undefined,
      isPinned: false,
      metaInterval: undefined as number | undefined,
      lastInternalRoute: undefined as string | undefined,
      lastAddressShown: undefined as string | undefined,
    };

    this.tabs.push(tabData);

    this.selectTab(id);

    this.setupSortable();
    this.logger.createLog(`Created tab: ${url}`);
  };

  updateTabAttributes = () => {
    const tabElements = this.ui.queryComponentAll("tab", this.items.tabBar!);

    tabElements.forEach((element, index) => {
      element.setAttribute("tab", index.toString());
    });
  };

  closeTabById = async (id: string) => {
    const tabInfo = this.tabs.find((tab) => tab.id === id);
    if (!tabInfo) return;

    const currentTabIndex = this.tabs.findIndex((tab) => tab.id === id);
    const isCurrentTabActive = tabInfo.tab.classList.contains("active");

    this.eventsAPI.emit("tab:closed", {
      url: tabInfo.iframe.src,
      iframe: tabInfo.iframe.id,
    });

    this.stopMetaWatcher(id);

    tabInfo.tab.remove();
    tabInfo.iframe.remove();

    this.tabs = this.tabs.filter((tab) => tab.id !== id);
    this.updateTabAttributes();
    console.log(this.tabs, currentTabIndex, isCurrentTabActive);
    if (this.tabs.length > 0) {
      let nextTabToSelect: any = null;
      console.log(nextTabToSelect + 11);
      switch (true) {
        case currentTabIndex > 0 &&
          this.tabs[currentTabIndex - 1] !== undefined:
          nextTabToSelect = this.tabs[currentTabIndex - 1];
          break;
        case this.tabs[currentTabIndex] !== undefined:
          nextTabToSelect = this.tabs[currentTabIndex];
          break;
        default:
          nextTabToSelect = this.tabs[this.tabs.length - 1];
      }
      console.log(nextTabToSelect);
      if (nextTabToSelect) {
        console.log(nextTabToSelect);
        this.selectTab(nextTabToSelect.id);
      }
    } else if (this.tabs.length === 0) {
      this.createTab("daydream://newtab");
    }

    this.logger.createLog(`Closed tab: ${id}`);
  };

  closeCurrentTab = () => {
    const activeTab = Array.from(
      this.ui.queryComponentAll("tab", this.el),
    ).find((tab: HTMLElement) => tab.classList.contains("active"));
    const activeIFrame = document.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;

    if (!activeTab || !activeIFrame) return;

    const activeIframeUrl = activeIFrame.src;
    const tabPosition = parseInt(activeTab.getAttribute("tab") || "0");

    this.stopMetaWatcher(activeTab.id);
    this.eventsAPI.emit("tab:closed", {
      url: activeIframeUrl,
      iframe: activeIFrame.id,
    });

    activeTab.remove();
    activeIFrame.remove();

    const activeTabId = activeTab.id.replace("tab-", "");
    this.tabs = this.tabs.filter((tab) => tab.id !== activeTabId);

    this.updateTabAttributes();

    const remainingTabs = document.querySelectorAll(".tab");
    if (remainingTabs.length > 0) {
      let nextTabToSelect: HTMLElement | null = null;

      for (const tab of remainingTabs) {
        if (parseInt(tab.getAttribute("tab") || "0") === tabPosition) {
          nextTabToSelect = tab as HTMLElement;
          break;
        }
      }

      if (!nextTabToSelect && tabPosition > 0) {
        for (const tab of remainingTabs) {
          if (parseInt(tab.getAttribute("tab") || "0") === tabPosition - 1) {
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

    this.logger.createLog(`Closed tab: ${activeIframeUrl}`);
  };

  closeAllTabs = () => {
    this.ui.queryComponentAll("tab").forEach((tab) => {
      tab.remove();
    });
    this.items.frameContainer!.querySelectorAll("iframe").forEach((page) => {
      page.remove();
    });
    this.logger.createLog(`Closed all tabs`);
  };

  selectTab = async (tabId: string) => {
    const tabInfo = this.tabs.find((t) => t.id === tabId);
    if (!tabInfo) return;

    const iframeId = `iframe-${tabId.replace("tab-", "")}`;
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    const tabElement = document.getElementById(tabId) as HTMLElement;

    if (!iframe || !tabElement) return;

    const allTabs = this.items.tabBar!.querySelectorAll(".tab");
    allTabs.forEach((tab) => {
      tab.classList.remove("active");
      tab.classList.add("inactive");
    });

    const allIframes = this.items.frameContainer!.querySelectorAll("iframe");
    allIframes.forEach((iframe) => {
      iframe.classList.remove("active");
    });

    tabElement.classList.remove("inactive");
    tabElement.classList.add("active");
    iframe.classList.add("active");

    this.eventsAPI.emit("tab:selected", {
      url: iframe.src,
      iframe: iframe.id,
    });

    let check = await this.proto.getInternalURL(new URL(iframe.src).pathname);
    if (typeof check === "string" && check.startsWith("daydream://")) {
      this.items.addressBar!.value = check;
    } else {
      let url = new URL(iframe.src).pathname;
      url = url.replace(
        window.SWconfig[window.ProxySettings as keyof typeof window.SWconfig],
        "",
      );
      url = window.__uv$config.decodeUrl(url);
      this.items.addressBar!.value = url;
    }

    this.logger.createLog(`Selected tab: ${tabInfo.url || tabId}`);
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

  duplicateTab = (tabId: string): string | null => {
    const tabInfo = this.tabs.find((t) => t.id === tabId);
    if (!tabInfo) return null;

    let url = tabInfo.url;
    if (!url && tabInfo.iframe.src) {
      try {
        let iframeUrl = new URL(tabInfo.iframe.src).pathname;
        iframeUrl = iframeUrl.replace(
          window.SWconfig[window.ProxySettings as keyof typeof window.SWconfig],
          "",
        );
        url = window.__uv$config.decodeUrl(iframeUrl);
      } catch (e) {
        url = tabInfo.iframe.src;
      }
    }

    if (url) {
      this.createTab(url);
      return `tab-${this.tabCount}`;
    }
    return null;
  };

  selectTabById = (id: string) => {
    this.selectTab(id);
    this.logger.createLog(`Selected tab: ${id}`);
  };

  refreshTab = (tabId: string) => {
    const tabInfo = this.tabs.find((t) => t.id === tabId);
    if (!tabInfo) return;

    if (tabInfo.iframe && tabInfo.iframe.src) {
      tabInfo.iframe.src = tabInfo.iframe.src;
      this.logger.createLog(`Refreshed tab: ${tabId}`);
    }
  };

  closeTabsToRight = (tabId: string): void => {
    const targetIndex = this.tabs.findIndex((t) => t.id === tabId);
    if (targetIndex === -1 || targetIndex === this.tabs.length - 1) return;

    const tabsToClose = this.tabs.slice(targetIndex + 1);
    for (let i = tabsToClose.length - 1; i >= 0; i--) {
      this.closeTabById(tabsToClose[i].id);
    }

    this.logger.createLog(
      `Closed ${tabsToClose.length} tabs to the right of ${tabId}`,
    );
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
  };

  reorderTabElements = () => {
    const container = this.items.tabBar;
    if (!container) return;

    const fragment = document.createDocumentFragment();
    this.tabs.forEach((tabData) => {
      const tabElement = document.getElementById(tabData.id);
      if (tabElement && tabElement.parentNode === container) {
        fragment.appendChild(tabElement);
      }
    });

    container.appendChild(fragment);
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

  getGroupTabs = (groupId: string): any[] => {
    return this.groupManager.getGroupTabs(groupId);
  };

  setupTabContextMenu = (tabElement: HTMLElement, tabId: string) => {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return this.ui.createElement("div");

    const menuItems = [];

    const isPinned = this.isPinned(tabId);
    menuItems.push(
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.togglePinTab(tabId),
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            [isPinned ? "push_pin" : "push_pin"],
          ),
          this.ui.createElement("span", { class: "menu-label" }, [
            isPinned ? "Unpin Tab" : "Pin Tab",
          ]),
        ],
      ),
    );

    if (!tab.groupId && !isPinned) {
      menuItems.push(
        this.ui.createElement(
          "div",
          {
            class: "menu-item",
            onclick: () => this.createGroupWithTab(tabId),
          },
          [
            this.ui.createElement(
              "span",
              { class: "material-symbols-outlined" },
              ["folder_open"],
            ),
            this.ui.createElement("span", { class: "menu-label" }, [
              "Add to New Group",
            ]),
          ],
        ),
      );

      if (this.groups.length > 0) {
        this.groups.forEach((group) => {
          menuItems.push(
            this.ui.createElement(
              "div",
              {
                class: "menu-item",
                onclick: () => this.addTabToGroup(tabId, group.id),
              },
              [
                this.ui.createElement("span", {
                  class: "group-color-indicator",
                  style: `background-color: ${group.color}; width: 12px; height: 12px; border-radius: 50%; display: inline-block; margin-right: 8px;`,
                }),
                this.ui.createElement("span", { class: "menu-label" }, [
                  `Add to ${group.name}`,
                ]),
              ],
            ),
          );
        });
      }
    } else if (tab.groupId) {
      menuItems.push(
        this.ui.createElement(
          "div",
          {
            class: "menu-item",
            onclick: () => this.removeTabFromGroup(tabId),
          },
          [
            this.ui.createElement(
              "span",
              { class: "material-symbols-outlined" },
              ["folder_off"],
            ),
            this.ui.createElement("span", { class: "menu-label" }, [
              "Remove from Group",
            ]),
          ],
        ),
      );
    }

    menuItems.push(this.ui.createElement("div", { class: "menu-separator" }));

    menuItems.push(
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.duplicateTab(tabId),
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["content_copy"],
          ),
          this.ui.createElement("span", { class: "menu-label" }, [
            "Duplicate Tab",
          ]),
        ],
      ),
    );

    menuItems.push(
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.refreshTab(tabId),
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["refresh"],
          ),
          this.ui.createElement("span", { class: "menu-label" }, [
            "Refresh Tab",
          ]),
        ],
      ),
    );

    menuItems.push(
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.closeTabsToRight(tabId),
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["call_made"],
          ),
          this.ui.createElement("span", { class: "menu-label" }, [
            "Close Tabs to the Right",
          ]),
        ],
      ),
    );

    menuItems.push(this.ui.createElement("div", { class: "menu-separator" }));

    menuItems.push(
      this.ui.createElement(
        "div",
        {
          class: "menu-item",
          onclick: () => this.closeTabById(tabId),
        },
        [
          this.ui.createElement(
            "span",
            { class: "material-symbols-outlined" },
            ["close"],
          ),
          this.ui.createElement("span", { class: "menu-label" }, ["Close Tab"]),
        ],
      ),
    );

    const menu = this.ui.createElement(
      "div",
      { class: "context-menu-content" },
      menuItems,
    );

    this.nightmarePlugins.rightclickmenu.attachTo(tabElement, () => {
      return menu;
    });
  };

  pageClient = (iframe: HTMLIFrameElement) => {
    iframe.contentWindow!.window.open = (url?: string | URL): Window | null => {
      (async () => {
        try {
          if (!url) return;

          const urlString = url instanceof URL ? url.href : url.toString();
          console.log("Opening new tab with URL:", urlString);

          await this.createTab(urlString);

          this.logger.createLog(`New tab opened via window.open: ${urlString}`);
        } catch (error) {
          console.error("Error opening new tab via window.open:", error);
        }
      })();

      return null;
    };

    iframe.contentWindow?.document.body.addEventListener("click", async () => {
      window.parent.eventsAPI.emit("ddx:page.clicked", null);
    });
  };

  startMetaWatcher = (
    tabId: string,
    iframe: HTMLIFrameElement,
    tabEl: HTMLElement,
  ) => {
    const tabData = this.tabs.find((t) => t.id === tabId);
    if (!tabData) return;
    if (tabData.metaInterval) clearInterval(tabData.metaInterval);

    const titleEl = tabEl.querySelector(".tab-title") as HTMLElement;
    const faviconEl = tabEl.querySelector(".tab-favicon") as HTMLElement;

    const tick = async () => {
      let d: Document | null = null;
      let locHref: string | null = null;
      try {
        d = iframe.contentDocument!;
        locHref = iframe.contentWindow?.location?.href || null;
      } catch {}

      try {
        if (d) {
          const t = d.title?.trim() || "New Tab";
          if (titleEl && titleEl.textContent !== t) titleEl.textContent = t;
        }
      } catch {}

      try {
        if (locHref && tabEl.classList.contains("active")) {
          if (
            this.items.addressBar &&
            document.activeElement === this.items.addressBar
          )
            return;

          let liveURL: URL | null = null;
          try {
            liveURL = new URL(locHref);
          } catch {}
          if (!liveURL) return;

          const liveHash = liveURL.hash || "";
          const currentVal = this.items.addressBar?.value || "";
          const tabRef = this.tabs.find((t) => t.id === tabId);

          const mapHashToInternal = (hash: string): string | null => {
            const h = hash || "";
            let m: RegExpMatchArray | null = null;

            switch (true) {
              case !!(m = h.match(/^#\/?settings(?:\/([^/?#]+))?/i)):
                return m && m[1]
                  ? `daydream://settings#${decodeURIComponent(m[1])}`
                  : "daydream://settings";
              case /^#\/?history(?:[/?#]|$)/i.test(h):
                return "daydream://history";
              default:
                return null;
            }
          };

          const maybeInternal = await this.proto.getInternalURL(
            liveURL.pathname,
          );
          let nextVal: string | null = null;

          switch (true) {
            case typeof maybeInternal === "string" &&
              maybeInternal.startsWith("daydream://"): {
              const byHash = mapHashToInternal(liveHash);
              nextVal = byHash || maybeInternal;
              switch (true) {
                case nextVal !== "daydream://newtab":
                  if (tabRef) tabRef.lastInternalRoute = nextVal;
                  break;
                case !!tabRef?.lastInternalRoute:
                  nextVal = tabRef!.lastInternalRoute!;
                  break;
              }
              break;
            }
            default: {
              const prefix =
                window.SWconfig[
                  window.ProxySettings as keyof typeof window.SWconfig
                ].config.prefix;
              let p = liveURL.pathname.replace(prefix, "");
              const decoded = (window as any).__uv$config.decodeUrl(p);
              nextVal =
                decoded.indexOf("#") === -1
                  ? liveHash
                    ? decoded + liveHash
                    : decoded
                  : decoded;
            }
          }

          if (!nextVal) return;
          if (tabRef?.lastAddressShown === nextVal) return;
          if (this.items.addressBar && nextVal !== currentVal) {
            this.items.addressBar.value = nextVal;
            if (tabRef) tabRef.lastAddressShown = nextVal;
          }
        }
      } catch {}

      try {
        if (d && faviconEl) {
          const link = d.querySelector<HTMLLinkElement>(
            "link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']",
          );
          let href: string | null = null;
          switch (true) {
            case link !== null:
              href = new URL(link!.getAttribute("href") || "", d.baseURI).href;
              break;
            case !!iframe.contentWindow?.location?.origin:
              href = iframe.contentWindow.location.origin + "/favicon.ico";
              break;
          }
          if (href) {
            const prox = await this.proxy.getFavicon(
              href,
              this.swConfig,
              this.proxySetting,
            );
            if (prox && faviconEl.getAttribute("data-favicon") !== prox) {
              faviconEl.setAttribute(
                "style",
                `background-image: url('${prox}');`,
              );
              faviconEl.setAttribute("data-favicon", prox);
              tabEl.classList.add("has-favicon");
            }
          } else {
            faviconEl.removeAttribute("style");
            faviconEl.removeAttribute("data-favicon");
            tabEl.classList.remove("has-favicon");
          }
        }
      } catch {}
    };

    tick();
    tabData.metaInterval = window.setInterval(tick, 250);
  };

  stopMetaWatcher = (tabId: string) => {
    const tabData = this.tabs.find((t) => t.id === tabId);
    if (tabData && tabData.metaInterval) {
      clearInterval(tabData.metaInterval);
      delete tabData.metaInterval;
    }
  };
}

export { Tabs };
