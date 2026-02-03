import type { TabsInterface } from "./types";

export class TabPageClient {
  private tabs: TabsInterface;
  private observers: Map<string, MutationObserver> = new Map();
  private intervalIds: Map<string, number[]> = new Map();

  constructor(tabs: TabsInterface) {
    this.tabs = tabs;
  }

  pageClient = (iframe: HTMLIFrameElement): void => {
    this.setupWindowOpenInterceptor(iframe);
    this.setupClickListener(iframe);
    this.setupErrorPageRedirect(iframe);
    this.setupNavigationTracking(iframe);
    this.setupChiiInjection(iframe);
    this.setupKeyboardHandler(iframe);
    // this.polyfillAlertAPI(iframe);
  };

  cleanupIframe = (iframeId: string): void => {
    const observer = this.observers.get(iframeId);
    if (observer) {
      observer.disconnect();
      this.observers.delete(iframeId);
    }

    const intervals = this.intervalIds.get(iframeId);
    if (intervals) {
      intervals.forEach((id) => clearTimeout(id));
      this.intervalIds.delete(iframeId);
    }
  };

  cleanupAll = (): void => {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers.clear();

    this.intervalIds.forEach((intervals) => {
      intervals.forEach((id) => clearTimeout(id));
    });
    this.intervalIds.clear();
  };

  private setupWindowOpenInterceptor(iframe: HTMLIFrameElement): void {
    if (!iframe.contentWindow) return;

    iframe.contentWindow.window.open = (url?: string | URL): Window | null => {
      this.handleWindowOpen(url);
      return null;
    };
  }

  private async handleWindowOpen(url?: string | URL): Promise<void> {
    try {
      if (!url) return;

      const urlString = url instanceof URL ? url.href : url.toString();
      console.log("Opening new tab with URL:", urlString);

      await this.tabs.createTab(urlString);
      this.tabs.logger.createLog(
        `New tab opened via window.open: ${urlString}`,
      );
    } catch (error) {
      console.error("Error opening new tab via window.open:", error);
    }
  }

  private setupClickListener(iframe: HTMLIFrameElement): void {
    iframe.contentWindow?.document.body.addEventListener("click", () => {
      window.parent.eventsAPI.emit("ddx:page.clicked", null);
    });
  }

  private setupNavigationTracking(iframe: HTMLIFrameElement): void {
    if (!iframe.contentWindow) return;

    const iframeId = iframe.id;
    let lastKnownUrl = iframe.contentWindow.location.href;

    const checkUrlChange = () => {
      try {
        const currentUrl = iframe.contentWindow?.location?.href;
        if (currentUrl && currentUrl !== lastKnownUrl) {
          lastKnownUrl = currentUrl;
          this.handleUrlChange(iframe);
        }
      } catch (e) {
        console.warn("Could not check URL change:", e);
      }
    };

    iframe.contentWindow.document.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "A" || target.closest("a")) {
        setTimeout(checkUrlChange, 100);
        setTimeout(checkUrlChange, 500);
        setTimeout(checkUrlChange, 1000);
      }
    });

    iframe.contentWindow.document.addEventListener("submit", () => {
      setTimeout(checkUrlChange, 100);
      setTimeout(checkUrlChange, 500);
      setTimeout(checkUrlChange, 1000);
    });

    const observer = new MutationObserver(() => {
      checkUrlChange();
    });

    observer.observe(iframe.contentWindow.document.documentElement, {
      childList: true,
      subtree: true,
    });

    this.observers.set(iframeId, observer);
  }

  private handleUrlChange(iframe: HTMLIFrameElement): void {
    const iframeLoadedEvent = new CustomEvent("iframeLoaded", {
      detail: {
        tabId: iframe.id.replace("iframe-", "tab-"),
        iframe,
        tabElement: document.getElementById(
          iframe.id.replace("iframe-", "tab-"),
        ),
      },
    });
    document.dispatchEvent(iframeLoadedEvent);
  }

  private setupErrorPageRedirect(iframe: HTMLIFrameElement): void {
    iframe.addEventListener("load", () => {
      this.checkForErrorTrace(iframe);
    });
  }

  private checkForErrorTrace(iframe: HTMLIFrameElement): void {
    const currentUrl = iframe.src;

    if (this.isErrorPage(currentUrl)) return;

    const errorTrace = iframe.contentWindow?.document.getElementById(
      "errorTrace",
    ) as HTMLTextAreaElement | null;

    if (errorTrace?.value) {
      this.redirectToErrorPage(iframe, errorTrace.value);
    }
  }

  private setupChiiInjection(iframe: HTMLIFrameElement): void {
    if (!iframe.contentWindow) return;

    const tabId = iframe.id.replace("iframe-", "tab-");
    const tabData = this.tabs.tabs.find((tab) => tab.id === tabId);

    if (!tabData?.chiiPanel?.isActive) return;

    this.injectChiiTarget(iframe);
  }

  private setupKeyboardHandler(iframe: HTMLIFrameElement): void {
    if (!iframe.contentWindow) return;

    try {
      iframe.contentWindow.document.addEventListener(
        "keydown",
        async (event) => {
          const keyboardManager = (window as any).functions?.keyboardManager;
          if (
            keyboardManager &&
            typeof keyboardManager.handleKeyDown === "function"
          ) {
            await keyboardManager.handleKeyDown(event);
          }
        },
        true,
      );
      console.log("[PageClient] Keyboard handler attached to iframe");
    } catch (error) {
      console.warn("[PageClient] Could not attach keyboard handler:", error);
    }
  }

  private async injectChiiTarget(iframe: HTMLIFrameElement): Promise<void> {
    try {
      const iframeWin = iframe.contentWindow;
      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeWin || !iframeDoc) return;

      const tabId = iframe.id.replace("iframe-", "tab-");
      const tabData = this.tabs.tabs.find((tab) => tab.id === tabId);

      if (!tabData?.chiiPanel?.devtoolsIframe) {
        console.error("[PageClient] No devtools iframe found for tab", tabId);
        return;
      }

      if (!window.proxy) {
        console.error("[PageClient] proxy not available");
        return;
      }

      (iframeWin as any).ChiiDevtoolsIframe = tabData.chiiPanel.devtoolsIframe;
      console.log(
        "[PageClient] Set ChiiDevtoolsIframe on proxied window for tab",
        tabId,
      );

      const targetSrc = "https://unpkg.com/chii@1.15.5/public/target.js";
      const code = `
        const existingScript = document.querySelector('script[src*="chii/target.js"]');
        if (existingScript) {
          console.log('[PageClient] Removing old Chii target.js');
          existingScript.remove();
        }

        const script = document.createElement('script');
        script.src = '${targetSrc}';
        script.setAttribute('embedded', 'true');
        script.setAttribute('cdn', 'https://unpkg.com/chii@1.15.5/public/');
        script.onload = () => {
          console.log('[PageClient] Chii target.js loaded in proxied page');
        };
        script.onerror = () => {
          console.error('[PageClient] Failed to load Chii target.js');
        };
        document.head.appendChild(script);
      `;

      await window.proxy.eval(window.SWconfig, iframe, code);
      console.log(
        "[PageClient] Injected Chii target via liveInject for tab",
        tabId,
      );
    } catch (error) {
      console.error("[PageClient] Error setting up Chii injection:", error);
    }
  }

  private isErrorPage(url: string): boolean {
    try {
      const internalUrl = this.tabs.proto.getInternalURL(url);
      return internalUrl === "ddx://error/" || url.includes("/internal/error/");
    } catch {
      return url.includes("/internal/error/");
    }
  }

  private redirectToErrorPage(
    iframe: HTMLIFrameElement,
    errorMessage: string,
  ): void {
    const errorPageHandler = (): void => {
      try {
        const errorTextarea = iframe.contentWindow?.document.getElementById(
          "error-textarea",
        ) as HTMLTextAreaElement | null;

        if (errorTextarea) {
          errorTextarea.value = errorMessage;
        }
      } catch (err) {
        console.error("Failed to populate error textarea:", err);
      } finally {
        iframe.removeEventListener("load", errorPageHandler);
      }
    };

    iframe.addEventListener("load", errorPageHandler);
    this.tabs.proto.navigate("error");
  }

  /*private polyfillAlertAPI(iframe: HTMLIFrameElement): void {
    if (!iframe.contentWindow) return;
    const win = iframe.contentWindow;

    const originalAlert = win.alert;

    win.alert = (message?: string): void => {
      window.parent.nightmare?.alert?.display(message || "Alert");
    }
  }*/
}
