import type { DevToolsInterface } from "./types";
import { Logger } from "@apis/logging";
import { Items } from "@browser/items";

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
