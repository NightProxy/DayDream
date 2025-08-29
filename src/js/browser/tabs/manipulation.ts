import type { TabsInterface } from "./types";

export class TabManipulation {
  private tabs: TabsInterface;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  duplicateTab = (tabId: string): string | null => {
    const tabInfo = this.tabs.tabs.find((t) => t.id === tabId);
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
      this.tabs.createTab(url);
      return `tab-${this.tabs.tabCount}`;
    }
    return null;
  };

  refreshTab = (tabId: string) => {
    const tabInfo = this.tabs.tabs.find((t) => t.id === tabId);
    if (!tabInfo) return;

    if (tabInfo.iframe && tabInfo.iframe.src) {
      tabInfo.iframe.src = tabInfo.iframe.src;
      this.tabs.logger.createLog(`Refreshed tab: ${tabId}`);
    }
  };

  closeTabsToRight = (tabId: string): void => {
    const targetIndex = this.tabs.tabs.findIndex((t) => t.id === tabId);
    if (targetIndex === -1 || targetIndex === this.tabs.tabs.length - 1) return;

    const tabsToClose = this.tabs.tabs.slice(targetIndex + 1);
    for (let i = tabsToClose.length - 1; i >= 0; i--) {
      this.tabs.closeTabById(tabsToClose[i].id);
    }

    this.tabs.logger.createLog(
      `Closed ${tabsToClose.length} tabs to the right of ${tabId}`,
    );
  };

  reorderTabElements = () => {
    const container = this.tabs.items.tabBar;
    if (!container) return;

    const fragment = document.createDocumentFragment();
    this.tabs.tabs.forEach((tabData) => {
      const tabElement = document.getElementById(tabData.id);
      if (tabElement && tabElement.parentNode === container) {
        fragment.appendChild(tabElement);
      }
    });

    container.appendChild(fragment);
  };

  setFavicon(tabElement: HTMLElement, iframe: HTMLIFrameElement): void {
    iframe.addEventListener("load", async () => {
      try {
        if (!iframe.contentDocument) {
          console.error(
            "Unable to access iframe content due to cross-origin restrictions.",
          );
          return;
        }

        let favicon: HTMLLinkElement | null = null;
        const nodeList =
          iframe.contentDocument.querySelectorAll("link[rel~='icon']");

        for (let i = 0; i < nodeList.length; i++) {
          const relAttr = nodeList[i].getAttribute("rel");
          if (relAttr && relAttr.includes("icon")) {
            favicon = nodeList[i] as HTMLLinkElement;
            break;
          }
        }

        if (favicon) {
          let faviconUrl: string | null | undefined =
            favicon.href || favicon.getAttribute("href");
          const faviconImage = tabElement.querySelector(".tab-favicon");

          faviconUrl = await this.tabs.proxy.getFavicon(faviconUrl as string);

          if (faviconUrl && faviconImage) {
            faviconImage.setAttribute(
              "style",
              `background-image: url('${faviconUrl}');`,
            );
          } else {
            console.error("Favicon URL or favicon element is missing.");
          }
        } else {
          console.error(
            "No favicon link element found within the iframe document.",
          );
        }
      } catch (error) {
        console.error("An error occurred while setting the favicon:", error);
      }
    });
  }
}
