import { DevToolsInterface } from "./types";
import { Logger } from "@apis/logging";
import { Items } from "@browser/items";
import type { TabData } from "@browser/tabs/types";

export class DevTools implements DevToolsInterface {
  private logger: Logger;
  private items: Items;
  private devToggle: boolean;
  private erudaScriptLoaded: boolean;
  private erudaScriptInjecting: boolean;

  constructor(
    logger: Logger,
    items: Items,
    devToggle: boolean,
    erudaScriptLoaded: boolean,
    erudaScriptInjecting: boolean,
  ) {
    this.logger = logger;
    this.items = items;
    this.devToggle = devToggle;
    this.erudaScriptLoaded = erudaScriptLoaded;
    this.erudaScriptInjecting = erudaScriptInjecting;
  }

  injectErudaScript(_iframeDocument: Document): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log("[DevTools.injectErudaScript] Starting injection");

      if (this.erudaScriptLoaded) {
        console.log("[DevTools.injectErudaScript] Script already loaded");
        resolve("Loaded!");
        return;
      }

      if (this.erudaScriptInjecting) {
        console.warn(
          "[DevTools.injectErudaScript] Script is already being injected",
        );
        resolve("Already Injecting!");
        return;
      }

      this.erudaScriptInjecting = true;

      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement;

      if (!iframe) {
        console.error("[DevTools.injectErudaScript] No active iframe found");
        this.erudaScriptInjecting = false;
        reject(new Error("Iframe not available"));
        return;
      }

      if (!window.proxy) {
        console.error(
          "[DevTools.injectErudaScript] window.proxy not available",
        );
        this.erudaScriptInjecting = false;
        reject(new Error("Proxy not available"));
        return;
      }

      const code = `
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = '${location.origin}/core/i/eruda/eruda.js';
        script.onload = () => {
          window.parent.postMessage({ type: 'eruda-loaded' }, '*');
        };
        script.onerror = () => {
          window.parent.postMessage({ type: 'eruda-error' }, '*');
        };
        document.body.appendChild(script);
      `;

      const messageHandler = (event: MessageEvent) => {
        if (event.data.type === "eruda-loaded") {
          console.log(
            "[DevTools.injectErudaScript] Eruda script loaded successfully",
          );
          this.erudaScriptLoaded = true;
          this.erudaScriptInjecting = false;
          window.removeEventListener("message", messageHandler);
          resolve("Injected!");
        } else if (event.data.type === "eruda-error") {
          console.error(
            "[DevTools.injectErudaScript] Failed to load Eruda script",
          );
          this.erudaScriptInjecting = false;
          window.removeEventListener("message", messageHandler);
          reject(new Error("Failed to load Eruda script"));
        }
      };

      window.addEventListener("message", messageHandler);

      console.log("[DevTools.injectErudaScript] Calling proxy.eval with code");
      try {
        window.proxy.eval(window.SWconfig, iframe, code);
        console.log("[DevTools.injectErudaScript] proxy.eval call completed");
      } catch (error) {
        console.error(
          "[DevTools.injectErudaScript] proxy.eval threw error:",
          error,
        );
        this.erudaScriptInjecting = false;
        window.removeEventListener("message", messageHandler);
        reject(error);
      }
    });
  }

  injectShowScript(_iframeDocument: Document): Promise<void> {
    return new Promise((resolve) => {
      console.log("[DevTools.injectShowScript] Starting show script injection");

      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement;

      if (!iframe) {
        console.error("[DevTools.injectShowScript] No active iframe found");
        resolve();
        return;
      }

      if (!window.proxy) {
        console.error("[DevTools.injectShowScript] window.proxy not available");
        resolve();
        return;
      }

      const code = `
        eruda.init({
          defaults: {
            displaySize: 50,
            transparency: 0.85,
            theme: 'Night Owl'
          }
        });
        eruda.show();
      `;

      try {
        console.log("[DevTools.injectShowScript] Calling proxy.eval");
        window.proxy.eval(window.SWconfig, iframe, code);
        console.log(
          "[DevTools.injectShowScript] Show script injected successfully",
        );
        resolve();
      } catch (error) {
        console.error(
          "[DevTools.injectShowScript] Failed to inject show script:",
          error,
        );
        resolve();
      }
    });
  }

  injectHideScript(_iframeDocument: Document): Promise<void> {
    return new Promise((resolve) => {
      console.log("[DevTools.injectHideScript] Starting hide script injection");

      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement;

      if (!iframe) {
        console.error("[DevTools.injectHideScript] No active iframe found");
        resolve();
        return;
      }

      if (!window.proxy) {
        console.error("[DevTools.injectHideScript] window.proxy not available");
        resolve();
        return;
      }

      const code = `
        eruda.hide();
        eruda.destroy();
      `;

      try {
        console.log("[DevTools.injectHideScript] Calling proxy.eval");
        window.proxy.eval(window.SWconfig, iframe, code);
        console.log(
          "[DevTools.injectHideScript] Hide script injected successfully",
        );
        resolve();
      } catch (error) {
        console.error(
          "[DevTools.injectHideScript] Failed to inject hide script:",
          error,
        );
        resolve();
      }
    });
  }

  inspectElement(): void {
    console.log("[DevTools.inspectElement] Inspect element triggered");

    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    if (!iframe || !iframe.contentWindow) {
      console.error(
        "[DevTools.inspectElement] Iframe not found or inaccessible. \\(°□°)/ (This shouldn't happen btw)",
      );
      return;
    }

    let iframeDocument: Document;
    let currentHref: string;

    try {
      iframeDocument = iframe.contentWindow.document;
      currentHref = iframe.contentWindow.location.href;
      console.log(
        "[DevTools.inspectElement] Iframe accessible, href:",
        currentHref,
      );
    } catch (error) {
      console.error(
        "[DevTools.inspectElement] Cannot access iframe document or location:",
        error,
      );
      return;
    }

    const forbiddenSrcs = ["about:blank", null, "a%60owt8bnalk", "a`owt8bnalk"];
    if (forbiddenSrcs.includes(currentHref)) {
      console.warn(
        "[DevTools.inspectElement] Iframe src is forbidden, skipping:",
        currentHref,
      );
      return;
    }

    try {
      if (iframeDocument.readyState === "loading") {
        console.warn(
          "[DevTools.inspectElement] Iframe has not finished loading, skipping Eruda injection. Be patient.",
        );
        return;
      }
      console.log(
        "[DevTools.inspectElement] Iframe is ready, readyState:",
        iframeDocument.readyState,
      );
    } catch (error) {
      console.error(
        "[DevTools.inspectElement] Cannot check iframe readyState:",
        error,
      );
      return;
    }

    console.log(
      "[DevTools.inspectElement] Starting Eruda injection, current devToggle:",
      this.devToggle,
    );

    this.injectErudaScript(iframeDocument)
      .then(() => {
        console.log(
          "[DevTools.inspectElement] Eruda script injection complete, devToggle:",
          this.devToggle,
        );
        if (!this.devToggle) {
          console.log("[DevTools.inspectElement] Showing devtools");
          this.injectShowScript(iframeDocument);
        } else {
          console.log("[DevTools.inspectElement] Hiding devtools");
          this.injectHideScript(iframeDocument);
        }

        this.devToggle = !this.devToggle;
        console.log(
          "[DevTools.inspectElement] Toggled devToggle to:",
          this.devToggle,
        );
      })
      .catch((error) => {
        console.error(
          "[DevTools.inspectElement] Error injecting Eruda script:",
          error,
        );
      });

    try {
      iframe.contentWindow.addEventListener(
        "unload",
        () => {
          this.devToggle = false;
          this.erudaScriptLoaded = false;
          this.erudaScriptInjecting = false;
          console.log("Iframe navigation detected, Eruda toggle reset.");
        },
        { once: true, passive: true },
      );
    } catch (error) {
      console.warn("Could not attach unload listener to iframe:", error);
    }

    this.logger.createLog("Toggled Inspect Element");
  }

  getDevToggle(): boolean {
    return this.devToggle;
  }

  getErudaScriptLoaded(): boolean {
    return this.erudaScriptLoaded;
  }

  getErudaScriptInjecting(): boolean {
    return this.erudaScriptInjecting;
  }

  updateDevState(
    devToggle: boolean,
    erudaScriptLoaded: boolean,
    erudaScriptInjecting: boolean,
  ): void {
    this.devToggle = devToggle;
    this.erudaScriptLoaded = erudaScriptLoaded;
    this.erudaScriptInjecting = erudaScriptInjecting;
  }
}

export class ChiiDevTools {
  private tabData: TabData;
  private logger: Logger;
  private defaultHeight: number = 400;
  private minHeight: number = 100;
  private isDragging: boolean = false;
  private navigationListener: EventListener | null = null;

  constructor(tabData: TabData, logger: Logger) {
    this.tabData = tabData;
    this.logger = logger;
    this.setupNavigationListener();
  }

  toggleInspect(): void {
    if (!this.tabData.chiiPanel) {
      this.initializePanel();
    }

    if (this.tabData.chiiPanel!.isActive) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  private setupNavigationListener(): void {
    this.navigationListener = ((event: CustomEvent) => {
      const { iframe } = event.detail;

      if (iframe.id !== `iframe-${this.tabData.id.replace("tab-", "")}`) return;

      if (this.tabData.chiiPanel?.isActive) {
        console.log(
          "[ChiiDevTools] Page navigated, re-injecting Chii for new page",
          this.tabData.id,
        );
        this.setupChiiConnection();

        const tabs = (window as any).tabs;
        if (tabs?.pageClientModule) {
          setTimeout(() => {
            tabs.pageClientModule.pageClient(this.tabData.iframe);
          }, 100);
        }
      }
    }) as EventListener;

    document.addEventListener("iframeLoaded", this.navigationListener);
  }

  private setupChiiConnection(): void {
    const targetFrame = this.tabData.iframe;

    const devtoolsIframe = this.tabData.chiiPanel?.devtoolsIframe;

    if (!targetFrame || !devtoolsIframe || !this.tabData.chiiPanel) return;
    if (targetFrame.contentWindow) {
      targetFrame.contentWindow.ChiiDevtoolsIframe = devtoolsIframe;
    }
    console.log(
      "[ChiiDevTools] Set ChiiDevtoolsIframe on target window",
      this.tabData.id,
    );

    if (!this.tabData.chiiPanel.messageRelaySetup) {
      const messageHandler = (event: MessageEvent) => {
        if (
          this.tabData.iframe.contentWindow &&
          this.tabData.chiiPanel?.isActive
        ) {
          try {
            this.tabData.iframe.contentWindow.postMessage(
              event.data,
              event.origin,
            );
          } catch (e) {
            console.warn("[ChiiDevTools] Failed to relay message:", e);
          }
        }
      };
      window.addEventListener("message", messageHandler);
      this.tabData.chiiPanel.messageRelaySetup = true;
      this.tabData.chiiPanel.messageHandler = messageHandler;
      console.log(
        "[ChiiDevTools] Set up message relay for tab",
        this.tabData.id,
      );
    }
  }

  private initializePanel(): void {
    const container = document.createElement("div");
    container.className = "chii-devtools-container";
    container.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: ${this.defaultHeight}px;
      background: #1e1e1e;
      border-top: 2px solid #007acc;
      display: none;
      z-index: 100;
      overflow: hidden;
      pointer-events: auto;
    `;

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "chii-resize-handle";
    resizeHandle.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      cursor: ns-resize;
      background: #3c3c3c;
      z-index: 20;
      user-select: none;
    `;

    resizeHandle.addEventListener("mousedown", this.startResize.bind(this));

    const devtoolsIframe = document.createElement("iframe");
    devtoolsIframe.className = "chii-devtools-iframe";
    devtoolsIframe.style.cssText = `
      position: absolute;
      top: 4px;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      height: calc(100% - 4px);
      border: none;
      background: #1e1e1e;
      display: block;
      z-index: 10;
    `;
    devtoolsIframe.setAttribute("frameborder", "0");

    container.appendChild(resizeHandle);
    container.appendChild(devtoolsIframe);

    const iframeParent = this.tabData.iframe.parentElement;
    if (iframeParent) {
      iframeParent.style.position = "relative";
      iframeParent.appendChild(container);
    }

    this.tabData.chiiPanel = {
      isActive: false,
      devtoolsIframe,
      container,
      resizeHandle,
      height: this.defaultHeight,
    };
  }

  private showPanel(): void {
    if (!this.tabData.chiiPanel) return;

    const { container, devtoolsIframe, height } = this.tabData.chiiPanel;

    console.log("[ChiiDevTools] Showing panel", {
      container,
      devtoolsIframe,
      height,
      parent: this.tabData.iframe.parentElement,
    });

    const isActiveTab = this.tabData.tab.classList.contains("active");

    if (isActiveTab) {
      container!.style.display = "block";
      container!.style.height = `${height}px`;
      this.tabData.iframe.style.height = `calc(100% - ${height}px)`;
    }

    console.log("[ChiiDevTools] Container display:", container!.style.display);
    console.log(
      "[ChiiDevTools] Container in DOM:",
      document.body.contains(container!),
    );
    console.log(
      "[ChiiDevTools] Container dimensions:",
      container!.getBoundingClientRect(),
    );

    this.tabData.chiiPanel.isActive = true;

    this.setupChiiConnection();

    const tabs = (window as any).tabs;
    if (tabs?.pageClientModule) {
      tabs.pageClientModule.pageClient(this.tabData.iframe);
    }

    this.logger.createLog("Chii DevTools Opened");
  }

  private hidePanel(): void {
    if (!this.tabData.chiiPanel) return;

    this.tabData.chiiPanel.container!.style.display = "none";
    this.tabData.iframe.style.height = "100%";
    this.tabData.chiiPanel.isActive = false;
    this.logger.createLog("Chii DevTools Closed");
  }

  cleanup(): void {
    if (this.navigationListener) {
      document.removeEventListener("iframeLoaded", this.navigationListener);
      this.navigationListener = null;
    }
    if (this.tabData.chiiPanel?.messageHandler) {
      window.removeEventListener(
        "message",
        this.tabData.chiiPanel.messageHandler,
      );
      this.tabData.chiiPanel.messageHandler = undefined;
      this.tabData.chiiPanel.messageRelaySetup = false;
    }
    if (this.tabData.chiiPanel?.container) {
      this.tabData.chiiPanel.container.remove();
    }
  }

  private startResize(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = true;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";

    this.tabData.iframe.style.pointerEvents = "none";
    if (this.tabData.chiiPanel?.devtoolsIframe) {
      this.tabData.chiiPanel.devtoolsIframe.style.pointerEvents = "none";
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!this.isDragging || !this.tabData.chiiPanel) return;

      const iframeParent = this.tabData.iframe.parentElement;
      if (!iframeParent) return;

      const parentRect = iframeParent.getBoundingClientRect();
      const mouseY = e.clientY - parentRect.top;
      const newHeight = parentRect.height - mouseY;

      if (newHeight >= this.minHeight && newHeight <= parentRect.height - 100) {
        this.tabData.chiiPanel.height = newHeight;
        this.tabData.chiiPanel.container!.style.height = `${newHeight}px`;
        this.tabData.iframe.style.height = `${mouseY}px`;
      }
    };

    const onMouseUp = () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      this.tabData.iframe.style.pointerEvents = "";
      if (this.tabData.chiiPanel?.devtoolsIframe) {
        this.tabData.chiiPanel.devtoolsIframe.style.pointerEvents = "";
      }
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  isActive(): boolean {
    return this.tabData.chiiPanel?.isActive ?? false;
  }
}
