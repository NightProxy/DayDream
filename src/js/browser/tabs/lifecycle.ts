import { createIcons, icons } from "lucide";
import type { TabsInterface, TabData } from "./types";

export class TabLifecycle {
  private tabs: TabsInterface;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  createTab = async (url: string) => {
    this.tabs.tabCount++;
    let tabTitle = "New Tab";

    const id = `tab-${this.tabs.tabCount}`;
    const iframe = this.tabs.ui.createElement("iframe", {
      src: await this.tabs.proto.processUrl(url),
      id: `iframe-${this.tabs.tabCount}`,
      title: `Iframe #${this.tabs.tabCount}`,
    }) as HTMLIFrameElement;

    const tab = this.tabs.ui.createElement(
      "div",
      {
        class: "tab inactive transition-all duration-200 ease-out tab-anim",
        id: id,
        component: "tab",
      },
      [
        this.tabs.ui.createElement("div", { class: "tab-content" }, [
          this.tabs.ui.createElement("div", { class: "tab-group-color" }),
          this.tabs.ui.createElement("img", { class: "tab-favicon" }),
          this.tabs.ui.createElement("div", { class: "tab-title" }, [tabTitle]),
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
        ]),
      ],
    );

    iframe.addEventListener("load", async () => {
      try {
        if (iframe.contentWindow) {
          this.tabs.pageClient(iframe);
        } else {
          console.error("Iframe contentWindow is not accessible.");
        }

        const iframeLoadedEvent = new CustomEvent("iframeLoaded", {
          detail: {
            tabId: id,
            iframe,
            tabElement: tab,
          },
        });
        document.dispatchEvent(iframeLoadedEvent);

        this.tabs.startMetaWatcher(id, iframe, tab);
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
    };

    this.tabs.tabs.push(tabData);

    this.selectTab(id);

    this.tabs.setupSortable();
    this.tabs.logger.createLog(`Created tab: ${url}`);
  };

  closeTabById = async (id: string) => {
    const tabInfo = this.tabs.tabs.find((tab) => tab.id === id);
    if (!tabInfo) return;

    const currentTabIndex = this.tabs.tabs.findIndex((tab) => tab.id === id);

    this.tabs.stopMetaWatcher(id);

    tabInfo.tab.remove();
    tabInfo.iframe.remove();

    this.tabs.tabs = this.tabs.tabs.filter((tab) => tab.id !== id);
    this.updateTabAttributes();

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

  closeCurrentTab = () => {
    const activeTab = Array.from(
      this.tabs.ui.queryComponentAll("tab", this.tabs.el),
    ).find((tab: any) =>
      (tab as HTMLElement).classList.contains("active"),
    ) as HTMLElement;
    const activeIFrame = document.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;

    if (!activeTab || !activeIFrame) return;

    const activeIframeUrl = activeIFrame.src;
    const tabPosition = parseInt(activeTab.getAttribute("tab") || "0");

    this.tabs.stopMetaWatcher(activeTab.id);

    activeTab.remove();
    activeIFrame.remove();

    const activeTabId = activeTab.id.replace("tab-", "");
    this.tabs.tabs = this.tabs.tabs.filter((tab) => tab.id !== activeTabId);

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

  closeAllTabs = () => {
    this.tabs.ui.queryComponentAll("tab").forEach((tab: HTMLElement) => {
      tab.remove();
    });
    this.tabs.items
      .frameContainer!.querySelectorAll("iframe")
      .forEach((page: HTMLIFrameElement) => {
        page.remove();
      });
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

    let check = await this.tabs.proto.getInternalURL(
      new URL(iframe.src).pathname,
    );
    if (typeof check === "string" && check.startsWith("ddx://")) {
      this.tabs.items.addressBar!.value = check;
    } else {
      let url = new URL(iframe.src).pathname;
      url = url.replace(
        window.SWconfig[window.ProxySettings as keyof typeof window.SWconfig]
          .config.prefix,
        "",
      );
      try {
        url = window.__uv$config.decodeUrl(url);
      } catch (error) {
        console.warn("Failed to decode URL:", error);
      }
      this.tabs.items.addressBar!.value = url;
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
