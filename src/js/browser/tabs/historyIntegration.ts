import type { TabsInterface } from "./types";
import { HistoryManager } from "../../apis/history";

export class TabHistoryIntegration {
  private historyManager: HistoryManager;

  constructor(_tabs: TabsInterface) {
    this.historyManager = new HistoryManager();
    this.init();
  }

  private async init() {
    await this.historyManager.loadFromStorage();
    this.setupEventListeners();
  }

  private setupEventListeners() {
    document.addEventListener(
      "tabSelected",
      this.onTabSelected as EventListener,
    );

    document.addEventListener(
      "iframeLoaded",
      this.onIframeLoaded as EventListener,
    );

    document.addEventListener("tabClosed", this.onTabClosed as EventListener);

    window.addEventListener(
      "tabNavigated",
      this.onTabNavigated as EventListener,
    );
  }

  private onTabSelected = async (event: Event) => {
    const customEvent = event as CustomEvent;
    const { tabId, iframe, tabElement } = customEvent.detail;

    if (iframe && iframe.src) {
      await this.recordPageVisit(tabId, iframe, tabElement);
    }
  };

  private onIframeLoaded = async (event: Event) => {
    const customEvent = event as CustomEvent;
    const { tabId, iframe, tabElement } = customEvent.detail;

    await this.recordPageVisit(tabId, iframe, tabElement);
  };

  private onTabClosed = async (event: Event) => {
    const customEvent = event as CustomEvent;
    const { tabId } = customEvent.detail;

    await this.historyManager.recordTabClose(tabId);
  };

  private onTabNavigated = async (event: Event) => {
    const customEvent = event as CustomEvent;
    const {
      tabId,
      url,
      action,
      fromProtocol,
      fromNavigation,
      fromSearch,
      fromGame,
      gameTitle,
    } = customEvent.detail;

    if (
      fromNavigation &&
      (action === "back" || action === "forward" || action === "refresh")
    ) {
      return;
    }

    if (fromProtocol && url) {
      try {
        const currentUrl = this.decodeProxiedUrl(url);

        if (
          !window.protocols?.isRegisteredProtocol(currentUrl) &&
          !currentUrl.includes("/internal/")
        ) {
          const faviconUrl = await this.getFavicon(currentUrl);

          await this.historyManager.addEntry({
            title: "Loading...",
            url: currentUrl,
            tabId,
            favicon: faviconUrl || undefined,
          });
        }
      } catch (error) {
        console.warn("Failed to log protocol navigation to history:", error);
      }
    }

    if (fromSearch && url) {
      try {
        const currentUrl = this.decodeProxiedUrl(url);

        if (
          !window.protocols?.isRegisteredProtocol(currentUrl) &&
          !currentUrl.includes("/internal/")
        ) {
          const faviconUrl = await this.getFavicon(currentUrl);

          await this.historyManager.addEntry({
            title: "Loading...",
            url: currentUrl,
            tabId,
            favicon: faviconUrl || undefined,
          });
        }
      } catch (error) {
        console.warn("Failed to log search navigation to history:", error);
      }
    }

    if (fromGame && url) {
      try {
        const currentUrl = this.decodeProxiedUrl(url);

        if (
          !window.protocols?.isRegisteredProtocol(currentUrl) &&
          !currentUrl.includes("/internal/")
        ) {
          const faviconUrl = await this.getFavicon(currentUrl);

          await this.historyManager.addEntry({
            title: gameTitle || "Game",
            url: currentUrl,
            tabId,
            favicon: faviconUrl || undefined,
          });
        }
      } catch (error) {
        console.warn("Failed to log game navigation to history:", error);
      }
    }
  };

  private async recordPageVisit(
    tabId: string,
    iframe: HTMLIFrameElement,
    tabElement: HTMLElement,
  ) {
    try {
      let currentUrl = "";
      let pageTitle = "New Tab";

      try {
        if (iframe.contentWindow?.location?.href) {
          currentUrl = iframe.contentWindow.location.href;
        } else {
          currentUrl = iframe.src;
        }

        if (iframe.contentDocument?.title) {
          pageTitle = iframe.contentDocument.title.trim() || "New Tab";
        }
      } catch (e) {
        currentUrl = iframe.src;
        const titleEl = tabElement.querySelector(".tab-title");
        if (titleEl?.textContent) {
          pageTitle = titleEl.textContent.trim();
        }
      }

      currentUrl = this.decodeProxiedUrl(currentUrl);

      if (
        !currentUrl ||
        window.protocols?.isRegisteredProtocol(currentUrl) ||
        currentUrl.includes("/internal/") ||
        currentUrl === "about:blank" ||
        pageTitle === "New Tab"
      ) {
        return;
      }

      let faviconUrl: string | undefined;
      const faviconEl = tabElement.querySelector(
        ".tab-favicon",
      ) as HTMLImageElement;
      if (faviconEl?.src && faviconEl.src !== "") {
        faviconUrl = faviconEl.src;
      }

      await this.historyManager.addEntry({
        title: pageTitle,
        url: currentUrl,
        favicon: faviconUrl,
        tabId: tabId,
      });
    } catch (error) {
      console.warn("Failed to record page visit:", error);
    }
  }

  private decodeProxiedUrl(url: string): string {
    try {
      if (
        window.protocols?.isRegisteredProtocol(url) ||
        url.includes("/internal/")
      ) {
        return url;
      }

      if (window.__uv$config && url.includes(window.__uv$config.prefix)) {
        const prefix = window.__uv$config.prefix;
        const encodedPart = new URL(url).pathname.replace(prefix, "");
        if (encodedPart) {
          return window.__uv$config.decodeUrl(encodedPart);
        }
      }

      if (url.includes("/scramjet/")) {
        const urlMatch = url.match(/\/scramjet\/.*?\/([^/]+)/);
        if (urlMatch && urlMatch[1]) {
          return decodeURIComponent(urlMatch[1]);
        }
      }

      if (window.SWconfig && window.ProxySettings) {
        const config =
          window.SWconfig[window.ProxySettings as keyof typeof window.SWconfig];
        if (config?.config?.prefix && url.includes(config.config.prefix)) {
          const prefix = config.config.prefix;
          let path = new URL(url).pathname.replace(prefix, "");

          if (
            window.__uv$config &&
            typeof window.__uv$config.decodeUrl === "function"
          ) {
            try {
              return window.__uv$config.decodeUrl(path);
            } catch {}
          }
        }
      }

      return url;
    } catch (error) {
      console.warn("Failed to decode proxied URL:", error);
      return url;
    }
  }

  public getHistoryManager(): HistoryManager {
    return this.historyManager;
  }

  public destroy() {
    document.removeEventListener(
      "tabSelected",
      this.onTabSelected as EventListener,
    );
    document.removeEventListener(
      "iframeLoaded",
      this.onIframeLoaded as EventListener,
    );
    document.removeEventListener(
      "tabClosed",
      this.onTabClosed as EventListener,
    );
    window.removeEventListener(
      "tabNavigated",
      this.onTabNavigated as EventListener,
    );
  }

  private async getFavicon(url: string): Promise<string | null> {
    try {
      const proxy = (window as any).proxy;
      if (proxy && proxy.getFavicon) {
        return await proxy.getFavicon(url);
      }
      return null;
    } catch (error) {
      console.warn("Failed to get favicon for history entry:", error);
      return null;
    }
  }
}
