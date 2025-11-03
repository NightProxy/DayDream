import type { TabsInterface } from "./types";

export class TabMetaWatcher {
  private tabs: TabsInterface;
  private currentActiveTabId: string | null = null;
  private historyManager: any = null;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
    this.setupEventListeners();
    this.initHistoryManager();
  }

  private async initHistoryManager() {
    try {
      const { HistoryManager } = await import("../../apis/history");
      this.historyManager = new HistoryManager();
      await this.historyManager.loadFromStorage();
    } catch (error) {
      console.warn("Failed to initialize history manager:", error);
    }
  }

  private setupEventListeners = () => {
    document.addEventListener(
      "tabSelected",
      this.onTabSelected as EventListener,
    );

    document.addEventListener(
      "iframeLoaded",
      this.onIframeLoaded as EventListener,
    );
  };

  private onTabSelected = (event: Event) => {
    const customEvent = event as CustomEvent;
    const { tabId } = customEvent.detail;

    this.currentActiveTabId = tabId;
  };

  private onIframeLoaded = (event: Event) => {
    const customEvent = event as CustomEvent;
    const { tabId, iframe, tabElement } = customEvent.detail;

    if (tabId === this.currentActiveTabId) {
      this.updateTabMeta(tabId, iframe, tabElement);
    }
  };

  private updateTabMeta = async (
    tabId: string,
    iframe: HTMLIFrameElement,
    tabEl: HTMLElement,
  ) => {
    const tabData = this.tabs.tabs.find((t) => t.id === tabId);
    if (!tabData) return;

    const titleEl = tabEl.querySelector(".tab-title") as HTMLElement;
    const faviconEl = tabEl.querySelector(".tab-favicon") as HTMLImageElement;

    let d: Document | null = null;
    let locHref: string | null = null;

    try {
      d = iframe.contentDocument;
      locHref = iframe.contentWindow?.location?.href || null;
    } catch (e) {
      console.warn("Could not access iframe content:", e);
    }

    let pageTitle = "New Tab";
    let currentUrl = tabData.url;
    let faviconUrl: string | null = null;

    try {
      if (d) {
        pageTitle = d.title?.trim() || "New Tab";
        if (titleEl && titleEl.textContent !== pageTitle) {
          titleEl.textContent = pageTitle;
          titleEl.setAttribute("title", pageTitle);
        }
      }
    } catch (e) {
      console.warn("Could not update title:", e);
    }

    try {
      if (locHref && tabEl.classList.contains("active")) {
        currentUrl = await this.updateAddressBar(locHref, tabId);
      }
    } catch (e) {
      console.warn("Could not update address bar:", e);
    }

    try {
      if (d && faviconEl) {
        faviconUrl = await this.updateFavicon(d, iframe, faviconEl, tabEl);
      }
    } catch (e) {
      console.warn("Could not update favicon:", e);
    }

    if (this.historyManager && currentUrl && pageTitle !== "New Tab") {
      try {
        if (
          !currentUrl.startsWith("ddx://") &&
          !currentUrl.includes("/internal/")
        ) {
          await this.historyManager.addEntry({
            title: pageTitle,
            url: currentUrl,
            favicon: faviconUrl,
            tabId: tabId,
          });
        }
      } catch (error) {
        console.warn("Failed to add entry to browsing history:", error);
      }
    }
  };

  private updateAddressBar = async (
    locHref: string,
    tabId: string,
  ): Promise<string> => {
    if (
      this.tabs.items.addressBar &&
      document.activeElement === this.tabs.items.addressBar
    ) {
      return locHref;
    }

    let liveURL: URL | null = null;
    try {
      liveURL = new URL(locHref);
    } catch {
      return locHref;
    }

    const tabRef = this.tabs.tabs.find((t) => t.id === tabId);
    const maybeInternal = await this.tabs.proto.getInternalURL(
      liveURL.pathname,
    );
    let nextVal: string | null = null;

    if (
      typeof maybeInternal === "string" &&
      maybeInternal.startsWith("ddx://")
    ) {
      nextVal = maybeInternal;
      if (tabRef) {
        tabRef.lastInternalRoute = nextVal;
      }
    } else {
      const prefix =
        window.SWconfig[window.ProxySettings as keyof typeof window.SWconfig]
          .config.prefix;
      let path = liveURL.pathname.replace(prefix, "");

      try {
        const decoded = (window as any).__uv$config.decodeUrl(path);
        const hash = liveURL.hash || "";
        nextVal =
          decoded.indexOf("#") === -1
            ? hash
              ? decoded + hash
              : decoded
            : decoded;
      } catch {
        nextVal = locHref;
      }
    }

    if (!nextVal || tabRef?.lastAddressShown === nextVal)
      return nextVal || locHref;

    if (this.tabs.items.addressBar) {
      this.tabs.items.addressBar.value = nextVal;
      if (tabRef) tabRef.lastAddressShown = nextVal;
    }

    return nextVal;
  };

  private updateFavicon = async (
    document: Document,
    iframe: HTMLIFrameElement,
    faviconEl: HTMLImageElement,
    tabEl: HTMLElement,
  ): Promise<string | null> => {
    const link = document.querySelector<HTMLLinkElement>(
      "link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']",
    );

    let faviconUrl: string | null = null;

    if (link) {
      faviconUrl = new URL(link.getAttribute("href") || "", document.baseURI)
        .href;
    } else if (iframe.contentWindow?.location?.origin) {
      faviconUrl = iframe.contentWindow.location.origin + "/favicon.ico";
    }

    if (faviconUrl) {
      try {
        let decodedUrl = faviconUrl;
        if (
          faviconUrl.includes(
            window.SWconfig[
              window.ProxySettings as keyof typeof window.SWconfig
            ].config.prefix,
          )
        ) {
          const prefix =
            window.SWconfig[
              window.ProxySettings as keyof typeof window.SWconfig
            ].config.prefix;
          const path = new URL(faviconUrl).pathname.replace(prefix, "");
          decodedUrl = (window as any).__uv$config.decodeUrl(path);
        }

        const proxyFavicon = await this.tabs.proxy.getFavicon(decodedUrl);

        if (
          proxyFavicon &&
          faviconEl.getAttribute("data-favicon") !== proxyFavicon
        ) {
          faviconEl.src = proxyFavicon;
          faviconEl.setAttribute("data-favicon", proxyFavicon);
          tabEl.classList.add("has-favicon");
          return proxyFavicon;
        }
      } catch (e) {
        console.warn("Could not load favicon:", e);
        this.clearFavicon(faviconEl, tabEl);
        return null;
      }
    } else {
      this.clearFavicon(faviconEl, tabEl);
    }

    return null;
  };

  private clearFavicon = (faviconEl: HTMLImageElement, tabEl: HTMLElement) => {
    faviconEl.removeAttribute("src");
    faviconEl.removeAttribute("data-favicon");
    tabEl.classList.remove("has-favicon");
  };

  startMetaWatcher = (
    tabId: string,
    iframe: HTMLIFrameElement,
    tabEl: HTMLElement,
  ) => {
    this.updateTabMeta(tabId, iframe, tabEl);
  };

  stopMetaWatcher = (tabId: string) => {
    if (
      this.historyManager &&
      typeof this.historyManager.recordTabClose === "function"
    ) {
      this.historyManager.recordTabClose(tabId);
    }
  };

  destroy = () => {
    if (
      this.historyManager &&
      typeof this.historyManager.endCurrentSession === "function"
    ) {
      this.historyManager.endCurrentSession().catch((error: any) => {
        console.warn("Failed to end history session:", error);
      });
    }

    document.removeEventListener(
      "tabSelected",
      this.onTabSelected as EventListener,
    );
    document.removeEventListener(
      "iframeLoaded",
      this.onIframeLoaded as EventListener,
    );
  };
}
