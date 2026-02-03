import { createIcons, icons } from "lucide";
import type { TabsInterface, TabData } from "./types";

export class TabLifecycle {
  private tabs: TabsInterface;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  createTab = async (url: string) => {
    this.tabs.tabCount++;
    console.log(
      "[TabLifecycle] createTab() called for url:",
      url,
      "tabCount:",
      this.tabs.tabCount,
    );
    let tabTitle = "New Tab";

    const id = `tab-${this.tabs.tabCount}`;
    const iframe = this.tabs.ui.createElement("iframe", {
      src: await this.tabs.proto.processUrl(url),
      id: `iframe-${this.tabs.tabCount}`,
      title: `Iframe #${this.tabs.tabCount}`,
    }) as HTMLIFrameElement;

    console.log("[TabLifecycle] Created iframe:", iframe.id, "for tabId:", id);

    const tab = this.tabs.ui.createElement(
      "div",
      {
        class: "tab inactive transition-all duration-200 ease-out tab-anim",
        id: id,
        component: "tab",
      },
      [
        this.tabs.ui.createElement(
          "div",
          { class: "tab-content flex gap-1 items-center" },
          [
            this.tabs.ui.createElement("div", { class: "tab-group-color" }),
            this.tabs.ui.createElement("img", {
              class: "tab-favicon max-w-4 max-h-4",
            }),
            this.tabs.ui.createElement("div", { class: "tab-title" }, [
              tabTitle,
            ]),
            this.tabs.ui.createElement("div", { class: "tab-drag-handle" }),
            this.tabs.ui.createElement(
              "button",
              {
                class: "tab-close",
                id: `close-${id}`,
              },
              [
                this.tabs.ui.createElement("span", { class: "x" }, [
                  this.tabs.ui.createElement(
                    "i",
                    { "data-lucide": "x", class: "h-3.5 w-3.5" },
                    [],
                  ),
                ]),
              ],
            ),
          ],
        ),
      ],
    );

    iframe.addEventListener("load", async () => {
      console.log("[TabLifecycle] iframe load event fired for:", iframe.id);
      try {
        if (iframe.contentWindow) {
          this.tabs.pageClient(iframe);
        } else {
          console.error("Iframe contentWindow is not accessible.");
        }

        const tabInfo = this.tabs.tabs.find((t) => t.id === id);
        if (tabInfo && tabInfo.tab.classList.contains("active")) {
          let url = new URL(iframe.src).pathname;

          const internalCheck = await this.tabs.proto.getInternalURL(url);
          if (
            typeof internalCheck === "string" &&
            this.tabs.proto.isRegisteredProtocol(internalCheck)
          ) {
            this.tabs.items.addressBar!.value = internalCheck;
          } else {
            const proxyConfig =
              window.SWconfig?.[
                window.ProxySettings as keyof typeof window.SWconfig
              ];
            if (proxyConfig?.config?.prefix) {
              url = url.replace(proxyConfig.config.prefix, "");
            }
            try {
              url = window.__uv$config.decodeUrl(url);
            } catch (error) {
              console.warn("Failed to decode URL:", error);
            }

            const decodedCheck = await this.tabs.proto.getInternalURL(url);
            if (
              typeof decodedCheck === "string" &&
              this.tabs.proto.isRegisteredProtocol(decodedCheck)
            ) {
              this.tabs.items.addressBar!.value = decodedCheck;
            } else {
              this.tabs.items.addressBar!.value = url;
            }
          }
        }

        const iframeLoadedEvent = new CustomEvent("iframeLoaded", {
          detail: {
            tabId: id,
            iframe,
            tabElement: tab,
          },
        });
        document.dispatchEvent(iframeLoadedEvent);

        console.log("[TabLifecycle] Starting metaWatcher for tabId:", id);
        this.tabs.startMetaWatcher(id, iframe, tab);
      } catch (error) {
        console.error("An error occurred while loading the iframe:", error);
      }
    });

    tab.addEventListener("click", () => {
      this.selectTab(id);
    });

    const closeButton = tab.querySelector(`#close-${id}`);
    if (closeButton) {
      closeButton.addEventListener("click", async () => {
        await this.closeTabById(id);
      });
    } else {
      console.warn(`Close button not found for tab: ${id}`);
    }

    this.tabs.items.tabBar!.appendChild(tab);
    this.tabs.items.frameContainer!.appendChild(iframe);
    createIcons({ icons });

    const tabData: TabData = {
      id,
      tab,
      iframe,
      url,
      groupId: undefined,
      isPinned: false,
      lastInternalRoute: undefined,
      lastAddressShown: undefined,
      chiiPanel: undefined,
    };

    this.tabs.tabs.push(tabData);

    this.selectTab(id);

    this.tabs.setupSortable();
    this.tabs.logger.createLog(`Created tab: ${url}`);
  };

  closeTabById = async (id: string) => {
    console.log("[TabLifecycle] closeTabById() called for tabId:", id);
    const tabInfo = this.tabs.tabs.find((tab) => tab.id === id);
    if (!tabInfo) {
      console.log("[TabLifecycle] Tab not found:", id);
      return;
    }

    const currentTabIndex = this.tabs.tabs.findIndex((tab) => tab.id === id);

    console.log("[TabLifecycle] Stopping metaWatcher for tabId:", id);
    await this.tabs.stopMetaWatcher(id);
    console.log(
      "[TabLifecycle] Cleaning up pageClient for iframe:",
      tabInfo.iframe.id,
    );
    this.tabs.pageClientModule?.cleanupIframe(tabInfo.iframe.id);

    try {
      tabInfo.iframe.src = "about:blank";
      tabInfo.iframe.contentWindow?.stop();
      console.log(
        "[TabLifecycle] Cleared iframe content for:",
        tabInfo.iframe.id,
      );
    } catch (e) {
      console.warn("Could not clear iframe:", e);
    }

    tabInfo.tab.remove();
    tabInfo.iframe.remove();
    console.log("[TabLifecycle] Removed tab and iframe DOM elements");

    this.tabs.tabs = this.tabs.tabs.filter((tab) => tab.id !== id);
    console.log(
      "[TabLifecycle] Removed tab from tabs array, remaining tabs:",
      this.tabs.tabs.length,
    );
    this.updateTabAttributes();

    this.tabs.saveSession();

    const tabClosedEvent = new CustomEvent("tabClosed", {
      detail: { tabId: id },
    });
    document.dispatchEvent(tabClosedEvent);

    if (this.tabs.tabs.length > 0) {
      let nextTabToSelect: TabData | null = null;

      switch (true) {
        case currentTabIndex > 0 &&
          this.tabs.tabs[currentTabIndex - 1] !== undefined:
          nextTabToSelect = this.tabs.tabs[currentTabIndex - 1];
          break;
        case this.tabs.tabs[currentTabIndex] !== undefined:
          nextTabToSelect = this.tabs.tabs[currentTabIndex];
          break;
        default:
          nextTabToSelect = this.tabs.tabs[this.tabs.tabs.length - 1];
      }

      if (nextTabToSelect) {
        this.selectTab(nextTabToSelect.id);
      }
    } else if (this.tabs.tabs.length === 0) {
      this.createTab("ddx://newtab/");
    }

    this.tabs.logger.createLog(`Closed tab: ${id}`);
  };

  closeCurrentTab = async () => {
    console.log("[TabLifecycle] closeCurrentTab() called");
    const activeTab = Array.from(
      this.tabs.ui.queryComponentAll("tab", this.tabs.el),
    ).find((tab: any) =>
      (tab as HTMLElement).classList.contains("active"),
    ) as HTMLElement;
    const activeIFrame = document.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;

    if (!activeTab || !activeIFrame) {
      console.log("[TabLifecycle] No active tab or iframe found");
      return;
    }

    console.log(
      "[TabLifecycle] Closing active tab:",
      activeTab.id,
      "iframe:",
      activeIFrame.id,
    );

    const activeIframeUrl = activeIFrame.src;
    const tabPosition = parseInt(activeTab.getAttribute("tab") || "0");

    console.log(
      "[TabLifecycle] Stopping metaWatcher for active tab:",
      activeTab.id,
    );
    await this.tabs.stopMetaWatcher(activeTab.id);
    console.log(
      "[TabLifecycle] Cleaning up pageClient for active iframe:",
      activeIFrame.id,
    );
    this.tabs.pageClientModule?.cleanupIframe(activeIFrame.id);

    try {
      activeIFrame.src = "about:blank";
      activeIFrame.contentWindow?.stop();
      console.log("[TabLifecycle] Cleared active iframe content");
    } catch (e) {
      console.warn("Could not clear iframe:", e);
    }

    const tabClosedEvent = new CustomEvent("tabClosed", {
      detail: { tabId: activeTab.id },
    });
    document.dispatchEvent(tabClosedEvent);

    activeTab.remove();
    activeIFrame.remove();

    this.tabs.tabs = this.tabs.tabs.filter((tab) => tab.id !== activeTab.id);

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

    this.tabs.logger.createLog(`Closed tab: ${activeIframeUrl}`);
  };

  closeAllTabs = async () => {
    console.log(
      "[TabLifecycle] closeAllTabs() called, total tabs:",
      this.tabs.tabs.length,
    );
    await Promise.all(
      this.tabs.tabs.map(async (tabData) => {
        console.log(
          "[TabLifecycle] Stopping metaWatcher for tabId:",
          tabData.id,
        );
        await this.tabs.stopMetaWatcher(tabData.id);

        const tabClosedEvent = new CustomEvent("tabClosed", {
          detail: { tabId: tabData.id },
        });
        document.dispatchEvent(tabClosedEvent);
      }),
    );

    console.log("[TabLifecycle] Cleaning up all pageClient resources");
    this.tabs.pageClientModule?.cleanupAll();

    this.tabs.items
      .frameContainer!.querySelectorAll("iframe")
      .forEach((page: HTMLIFrameElement) => {
        try {
          page.src = "about:blank";
          page.contentWindow?.stop();
        } catch (e) {
          console.warn("Could not clear iframe:", e);
        }
        page.remove();
      });
    console.log("[TabLifecycle] Removed all iframes");

    this.tabs.ui.queryComponentAll("tab").forEach((tab: HTMLElement) => {
      tab.remove();
    });
    console.log("[TabLifecycle] Removed all tab elements");

    this.tabs.tabs = [];
    console.log("[TabLifecycle] Cleared tabs array");

    this.tabs.logger.createLog(`Closed all tabs`);
  };

  async selectTab(tabId: string) {
    const tabInfo = this.tabs.tabs.find((t) => t.id === tabId);
    if (!tabInfo) return;

    const iframeId = `iframe-${tabId.replace("tab-", "")}`;
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    const tabElement = document.getElementById(tabId) as HTMLElement;

    if (!iframe || !tabElement) return;

    const allTabs = this.tabs.items.tabBar!.querySelectorAll(".tab");
    allTabs.forEach((tab: Element) => {
      tab.classList.remove("active");
      tab.classList.add("inactive");
    });

    const allIframes =
      this.tabs.items.frameContainer!.querySelectorAll("iframe");
    allIframes.forEach((iframe: Element) => {
      iframe.classList.remove("active");
    });

    this.tabs.tabs.forEach((tab) => {
      if (tab.chiiPanel?.container) {
        if (tab.id === tabId && tab.chiiPanel.isActive) {
          tab.chiiPanel.container.style.display = "block";
          tab.iframe.style.height = `calc(100% - ${tab.chiiPanel.height}px)`;
        } else {
          tab.chiiPanel.container.style.display = "none";
          if (tab.id === tabId) {
            tab.iframe.style.height = "100%";
          }
        }
      } else if (tab.id === tabId) {
        tab.iframe.style.height = "100%";
      }
    });

    tabElement.classList.remove("inactive");
    tabElement.classList.add("active");
    iframe.classList.add("active");

    const tabSelectedEvent = new CustomEvent("tabSelected", {
      detail: {
        tabId,
        iframe,
        tabElement,
      },
    });
    document.dispatchEvent(tabSelectedEvent);

    let url = new URL(iframe.src).pathname;

    const internalCheck = await this.tabs.proto.getInternalURL(url);
    if (
      typeof internalCheck === "string" &&
      this.tabs.proto.isRegisteredProtocol(internalCheck)
    ) {
      this.tabs.items.addressBar!.value = internalCheck;
    } else {
      const proxyConfig =
        window.SWconfig?.[window.ProxySettings as keyof typeof window.SWconfig];
      if (proxyConfig?.config?.prefix) {
        url = url.replace(proxyConfig.config.prefix, "");
      }
      try {
        url = window.__uv$config.decodeUrl(url);
      } catch (error) {
        console.warn("Failed to decode URL:", error);
      }

      const decodedCheck = await this.tabs.proto.getInternalURL(url);
      if (
        typeof decodedCheck === "string" &&
        this.tabs.proto.isRegisteredProtocol(decodedCheck)
      ) {
        this.tabs.items.addressBar!.value = decodedCheck;
      } else {
        this.tabs.items.addressBar!.value = url;
      }
    }

    this.tabs.logger.createLog(`Selected tab: ${tabInfo.url || tabId}`);
  }

  selectTabById = (id: string) => {
    this.selectTab(id);
    this.tabs.logger.createLog(`Selected tab: ${id}`);
  };

  updateTabAttributes = () => {
    const tabElements = this.tabs.ui.queryComponentAll(
      "tab",
      this.tabs.items.tabBar!,
    );

    tabElements.forEach((element: HTMLElement, index: number) => {
      element.setAttribute("tab", index.toString());
    });
  };
}
