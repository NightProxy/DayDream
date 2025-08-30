import type { TabsInterface } from "./types";

export class TabMetaWatcher {
  private tabs: TabsInterface;
  private currentActiveTabId: string | null = null;

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
    this.setupEventListeners();
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

    try {
      if (d) {
        const title = d.title?.trim() || "New Tab";
        if (titleEl && titleEl.textContent !== title) {
          titleEl.textContent = title;
        }
      }
    } catch (e) {
      console.warn("Could not update title:", e);
    }

    try {
      if (locHref && tabEl.classList.contains("active")) {
        await this.updateAddressBar(locHref, tabId);
      }
    } catch (e) {
      console.warn("Could not update address bar:", e);
    }

    try {
      if (d && faviconEl) {
        await this.updateFavicon(d, iframe, faviconEl, tabEl);
      }
    } catch (e) {
      console.warn("Could not update favicon:", e);
    }
  };

  private updateAddressBar = async (locHref: string, tabId: string) => {
    if (
      this.tabs.items.addressBar &&
      document.activeElement === this.tabs.items.addressBar
    ) {
      return;
    }

    let liveURL: URL | null = null;
    try {
      liveURL = new URL(locHref);
    } catch {
      return;
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

    if (!nextVal || tabRef?.lastAddressShown === nextVal) return;

    if (this.tabs.items.addressBar) {
      this.tabs.items.addressBar.value = nextVal;
      if (tabRef) tabRef.lastAddressShown = nextVal;
    }
  };

  private updateFavicon = async (
    document: Document,
    iframe: HTMLIFrameElement,
    faviconEl: HTMLImageElement,
    tabEl: HTMLElement,
  ) => {
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
        }
      } catch (e) {
        console.warn("Could not load favicon:", e);
        this.clearFavicon(faviconEl, tabEl);
      }
    } else {
      this.clearFavicon(faviconEl, tabEl);
    }
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

  stopMetaWatcher = (_tabId: string) => {};

  destroy = () => {
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
