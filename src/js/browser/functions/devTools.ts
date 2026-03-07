import { DevToolsInterface } from "./types";
import { Logger } from "@apis/logging";
import { Items } from "@browser/items";
import type { TabData } from "@browser/tabs/types";

const ERUDA_INJECT_TIMEOUT_MS = 10000;

export class DevTools implements DevToolsInterface {
  private logger: Logger;
  private items: Items;
  private devToggle: boolean = false;
  private erudaScriptLoaded: boolean = false;
  private erudaScriptInjecting: boolean = false;

  constructor(logger: Logger, items: Items) {
    this.logger = logger;
    this.items = items;
  }

  private getActiveIframe(): HTMLIFrameElement | null {
    return this.items.frameContainer?.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement | null;
  }

  async injectErudaScript(): Promise<string> {
    console.log("[DevTools.injectErudaScript] Starting injection");

    if (this.erudaScriptLoaded) {
      console.log("[DevTools.injectErudaScript] Script already loaded");
      return "Loaded!";
    }

    if (this.erudaScriptInjecting) {
      console.warn(
        "[DevTools.injectErudaScript] Script is already being injected",
      );
      return "Already Injecting!";
    }

    this.erudaScriptInjecting = true;

    const iframe = this.getActiveIframe();

    if (!iframe) {
      console.error("[DevTools.injectErudaScript] No active iframe found");
      this.erudaScriptInjecting = false;
      throw new Error("Iframe not available");
    }

    if (!window.proxy) {
      console.error("[DevTools.injectErudaScript] window.proxy not available");
      this.erudaScriptInjecting = false;
      throw new Error("Proxy not available");
    }

    const code = `
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'https://unpkg.com/eruda@3.4.3/eruda.js';
      script.onload = () => {
        window.parent.postMessage({ type: 'eruda-loaded' }, '*');
      };
      script.onerror = () => {
        window.parent.postMessage({ type: 'eruda-error' }, '*');
      };
      document.body.appendChild(script);
    `;

    // Set up message listener with timeout
    const messagePromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", messageHandler);
        this.erudaScriptInjecting = false;
        console.error(
          "[DevTools.injectErudaScript] Timed out waiting for eruda script load",
        );
        reject(new Error("Eruda script injection timed out"));
      }, ERUDA_INJECT_TIMEOUT_MS);

      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === "eruda-loaded") {
          clearTimeout(timeout);
          console.log(
            "[DevTools.injectErudaScript] Eruda script loaded successfully",
          );
          this.erudaScriptLoaded = true;
          this.erudaScriptInjecting = false;
          window.removeEventListener("message", messageHandler);
          resolve("Injected!");
        } else if (event.data?.type === "eruda-error") {
          clearTimeout(timeout);
          console.error(
            "[DevTools.injectErudaScript] Failed to load Eruda script",
          );
          this.erudaScriptInjecting = false;
          window.removeEventListener("message", messageHandler);
          reject(new Error("Failed to load Eruda script"));
        }
      };

      window.addEventListener("message", messageHandler);
    });

    // Execute the injection via proxy.eval and check if it succeeded
    console.log("[DevTools.injectErudaScript] Calling proxy.eval with code");
    try {
      const success = await window.proxy.eval(window.SWconfig, iframe, code);
      if (!success) {
        console.error(
          "[DevTools.injectErudaScript] proxy.eval failed to execute code",
        );
        this.erudaScriptInjecting = false;
        throw new Error(
          "proxy.eval failed - proxy may not be active for this page",
        );
      }
      console.log("[DevTools.injectErudaScript] proxy.eval call completed");
    } catch (error) {
      console.error(
        "[DevTools.injectErudaScript] proxy.eval threw error:",
        error,
      );
      this.erudaScriptInjecting = false;
      throw error;
    }

    return messagePromise;
  }

  async injectShowScript(): Promise<void> {
    console.log("[DevTools.injectShowScript] Starting show script injection");

    const iframe = this.getActiveIframe();

    if (!iframe) {
      console.error("[DevTools.injectShowScript] No active iframe found");
      return;
    }

    if (!window.proxy) {
      console.error("[DevTools.injectShowScript] window.proxy not available");
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
      const success = await window.proxy.eval(window.SWconfig, iframe, code);
      if (!success) {
        console.error(
          "[DevTools.injectShowScript] proxy.eval failed to execute show code",
        );
        return;
      }
      console.log(
        "[DevTools.injectShowScript] Show script injected successfully",
      );
    } catch (error) {
      console.error(
        "[DevTools.injectShowScript] Failed to inject show script:",
        error,
      );
    }
  }

  async injectHideScript(): Promise<void> {
    console.log("[DevTools.injectHideScript] Starting hide script injection");

    const iframe = this.getActiveIframe();

    if (!iframe) {
      console.error("[DevTools.injectHideScript] No active iframe found");
      return;
    }

    if (!window.proxy) {
      console.error("[DevTools.injectHideScript] window.proxy not available");
      return;
    }

    const code = `
      eruda.hide();
      eruda.destroy();
    `;

    try {
      console.log("[DevTools.injectHideScript] Calling proxy.eval");
      const success = await window.proxy.eval(window.SWconfig, iframe, code);
      if (!success) {
        console.error(
          "[DevTools.injectHideScript] proxy.eval failed to execute hide code",
        );
        return;
      }
      console.log(
        "[DevTools.injectHideScript] Hide script injected successfully",
      );
    } catch (error) {
      console.error(
        "[DevTools.injectHideScript] Failed to inject hide script:",
        error,
      );
    }
  }

  async inspectElement(): Promise<void> {
    console.log("[DevTools.inspectElement] Inspect element triggered");

    const iframe = this.getActiveIframe();
    if (!iframe) {
      console.error("[DevTools.inspectElement] No active iframe found");
      return;
    }

    // Basic validation: skip about:blank and similar non-content frames
    const frameSrc = iframe.src || "";
    const forbiddenSrcs = ["about:blank", "", "a%60owt8bnalk", "a`owt8bnalk"];
    if (forbiddenSrcs.includes(frameSrc)) {
      console.warn(
        "[DevTools.inspectElement] Iframe src is forbidden, skipping:",
        frameSrc,
      );
      return;
    }

    console.log(
      "[DevTools.inspectElement] Starting Eruda toggle, current devToggle:",
      this.devToggle,
    );

    try {
      await this.injectErudaScript();
      console.log(
        "[DevTools.inspectElement] Eruda script injection complete, devToggle:",
        this.devToggle,
      );
      if (!this.devToggle) {
        console.log("[DevTools.inspectElement] Showing devtools");
        await this.injectShowScript();
      } else {
        console.log("[DevTools.inspectElement] Hiding devtools");
        await this.injectHideScript();
      }

      this.devToggle = !this.devToggle;
      console.log(
        "[DevTools.inspectElement] Toggled devToggle to:",
        this.devToggle,
      );
    } catch (error) {
      console.error(
        "[DevTools.inspectElement] Error during Eruda toggle:",
        error,
      );
    }

    // Reset state on iframe navigation
    try {
      iframe.contentWindow?.addEventListener(
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

  resetState(): void {
    this.devToggle = false;
    this.erudaScriptLoaded = false;
    this.erudaScriptInjecting = false;
  }
}

const CHII_TARGET_SRC = "https://unpkg.com/chii@1.15.5/public/target.js";
const CHII_CDN = "https://unpkg.com/chii@1.15.5/public/";
const CHII_INJECT_TIMEOUT_MS = 15000;

export class ChiiDevTools {
  private tabData: TabData;
  private logger: Logger;
  private defaultHeight: number = 400;
  private minHeight: number = 100;
  private isDragging: boolean = false;
  private navigationListener: EventListener | null = null;
  private devtoolsIframeId: string;
  private injecting: boolean = false;

  constructor(tabData: TabData, logger: Logger) {
    this.tabData = tabData;
    this.logger = logger;
    // Unique ID so proxy.eval code can find the devtools iframe via parent document
    this.devtoolsIframeId = `chii-devtools-${tabData.id.replace("tab-", "")}`;
    this.setupNavigationListener();
  }

  async toggleInspect(): Promise<void> {
    if (!this.tabData.chiiPanel) {
      this.initializePanel();
    }

    if (this.tabData.chiiPanel!.isActive) {
      this.hidePanel();
    } else {
      await this.showPanel();
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
        // Re-inject only the chii target script into the new page, NOT full pageClient()
        this.injectChiiTarget();
      }
    }) as EventListener;

    document.addEventListener("iframeLoaded", this.navigationListener);
  }

  /**
   * Injects Chii target.js into the proxied iframe using proxy.eval.
   *
   * Following the demo pattern from node_modules/chii/test/iframe.js:
   * 1. Set window.ChiiDevtoolsIframe = <devtools iframe element> (via proxy.eval
   *    referencing window.parent.document.getElementById)
   * 2. Create and inject <script src="target.js" embedded="true" cdn="...">
   * 3. Parent relays messages from devtools iframe back to target iframe
   */
  private async injectChiiTarget(): Promise<boolean> {
    const targetFrame = this.tabData.iframe;
    const devtoolsIframe = this.tabData.chiiPanel?.devtoolsIframe;

    if (!targetFrame || !devtoolsIframe || !this.tabData.chiiPanel) {
      console.error("[ChiiDevTools] Missing target frame or devtools iframe");
      return false;
    }

    if (!window.proxy) {
      console.error("[ChiiDevTools] window.proxy not available");
      return false;
    }

    if (this.injecting) {
      console.warn("[ChiiDevTools] Already injecting, skipping");
      return false;
    }

    this.injecting = true;

    // The code that runs inside the proxied iframe context.
    // window.parent.document is the DDX parent document (not proxied),
    // so we can find our devtools iframe by its unique ID.
    const code = `
      (function() {
        // Step 1: Set ChiiDevtoolsIframe so target.js knows where to load the frontend
        var dtIframe = window.parent.document.getElementById('${this.devtoolsIframeId}');
        if (!dtIframe) {
          console.error('[ChiiDevTools] Could not find devtools iframe by ID: ${this.devtoolsIframeId}');
          window.parent.postMessage({ type: 'chii-inject-error', error: 'devtools-iframe-not-found' }, '*');
          return;
        }
        window.ChiiDevtoolsIframe = dtIframe;
        console.log('[ChiiDevTools] Set window.ChiiDevtoolsIframe via proxy.eval');

        // Step 2: Remove any existing chii target.js script to avoid duplicates
        var existing = document.querySelector('script[src*="chii"][src*="target.js"]');
        if (existing) {
          console.log('[ChiiDevTools] Removing existing chii target.js');
          existing.remove();
        }

        // Step 3: Inject target.js with embedded=true and cdn attribute
        var script = document.createElement('script');
        script.src = '${CHII_TARGET_SRC}';
        script.setAttribute('embedded', 'true');
        script.setAttribute('cdn', '${CHII_CDN}');
        script.onload = function() {
          console.log('[ChiiDevTools] target.js loaded successfully in proxied page');
          window.parent.postMessage({ type: 'chii-target-loaded' }, '*');
        };
        script.onerror = function() {
          console.error('[ChiiDevTools] Failed to load target.js');
          window.parent.postMessage({ type: 'chii-inject-error', error: 'script-load-failed' }, '*');
        };
        document.head.appendChild(script);
        console.log('[ChiiDevTools] Injected target.js script element');
      })();
    `;

    // Set up message listener with timeout for injection result
    const resultPromise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", handler);
        console.error("[ChiiDevTools] Chii injection timed out");
        this.injecting = false;
        resolve(false);
      }, CHII_INJECT_TIMEOUT_MS);

      const handler = (event: MessageEvent) => {
        if (event.data?.type === "chii-target-loaded") {
          clearTimeout(timeout);
          window.removeEventListener("message", handler);
          console.log("[ChiiDevTools] Chii target.js confirmed loaded");
          this.injecting = false;
          resolve(true);
        } else if (event.data?.type === "chii-inject-error") {
          clearTimeout(timeout);
          window.removeEventListener("message", handler);
          console.error(
            "[ChiiDevTools] Chii injection error:",
            event.data.error,
          );
          this.injecting = false;
          resolve(false);
        }
      };

      window.addEventListener("message", handler);
    });

    // Execute the code in the proxied context
    try {
      console.log("[ChiiDevTools] Calling proxy.eval to inject chii target");
      const success = await window.proxy.eval(
        window.SWconfig,
        targetFrame,
        code,
      );
      if (!success) {
        console.error(
          "[ChiiDevTools] proxy.eval failed - proxy may not be active for this page",
        );
        this.injecting = false;
        return false;
      }
    } catch (error) {
      console.error("[ChiiDevTools] proxy.eval threw error:", error);
      this.injecting = false;
      return false;
    }

    return resultPromise;
  }

  /**
   * Set up message relay: messages posted to the parent window (from the devtools
   * frontend iframe) need to be forwarded into the target (proxied) iframe.
   * This mirrors the demo: window.addEventListener('message', e => targetIframe.contentWindow.postMessage(e.data, e.origin))
   *
   * We use proxy.eval to postMessage into the target so it reaches the proxied context.
   * Actually, per the demo, plain postMessage to contentWindow works because
   * the message event listener is on the real window. The proxy wrappers don't
   * intercept postMessage. So we use direct postMessage here.
   */
  private setupMessageRelay(): void {
    if (!this.tabData.chiiPanel || this.tabData.chiiPanel.messageRelaySetup) {
      return;
    }

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
    console.log("[ChiiDevTools] Set up message relay for tab", this.tabData.id);
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
    devtoolsIframe.id = this.devtoolsIframeId;
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

  private async showPanel(): Promise<void> {
    if (!this.tabData.chiiPanel) return;

    const { container, height } = this.tabData.chiiPanel;

    console.log("[ChiiDevTools] Showing panel for tab", this.tabData.id);

    const isActiveTab = this.tabData.tab.classList.contains("active");

    if (isActiveTab) {
      container!.style.display = "block";
      container!.style.height = `${height}px`;
      this.tabData.iframe.style.height = `calc(100% - ${height}px)`;
    }

    this.tabData.chiiPanel.isActive = true;

    // Set up message relay (parent -> target iframe) per the demo pattern
    this.setupMessageRelay();

    // Inject chii target.js into the proxied page via proxy.eval
    const injected = await this.injectChiiTarget();
    if (!injected) {
      console.error(
        "[ChiiDevTools] Failed to inject chii target, panel shown but devtools may not work",
      );
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
