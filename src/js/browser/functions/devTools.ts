import { DevToolsInterface } from "./types";
import { Logger } from "@apis/logging";
import { Items } from "@browser/items";

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

  injectErudaScript(iframeDocument: Document): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.erudaScriptLoaded) {
        resolve("Loaded!");
        return;
      }

      if (this.erudaScriptInjecting) {
        console.warn("Eruda script is already being injected.");
        resolve("Already Injecting!");
        return;
      }

      this.erudaScriptInjecting = true;

      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.src = location.origin + "/core/inspect.js";
      script.onload = () => {
        this.erudaScriptLoaded = true;
        this.erudaScriptInjecting = false;
        resolve("Injected!");
      };
      script.onerror = (event: Event | string) => {
        this.erudaScriptInjecting = false;
        reject(new Error(`Failed to load Eruda script: ${event}`));
      };
      iframeDocument.body.appendChild(script);
    });
  }

  injectShowScript(iframeDocument: Document): Promise<void> {
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.textContent = `
			eruda.init({
				defaults: {
					displaySize: 50,
					transparency: 0.65,
					theme: 'Night Owl'
				}
			});
			eruda.show();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }

  injectHideScript(iframeDocument: Document): Promise<void> {
    return new Promise((resolve) => {
      const script = iframeDocument.createElement("script");
      script.type = "text/javascript";
      script.textContent = `
			eruda.hide();
      eruda.destroy();
			document.currentScript.remove();
		`;
      iframeDocument.body.appendChild(script);
      resolve();
    });
  }

  inspectElement(): void {
    const iframe = this.items.frameContainer!.querySelector(
      "iframe.active",
    ) as HTMLIFrameElement;
    if (!iframe || !iframe.contentWindow) {
      console.error(
        "Iframe not found or inaccessible. \\(°□°)/ (This shouldn't happen btw)",
      );
      return;
    }

    const iframeDocument = iframe.contentWindow.document;

    const forbiddenSrcs = ["about:blank", null, "a%60owt8bnalk", "a`owt8bnalk"];
    if (forbiddenSrcs.includes(iframe.contentWindow.location.href)) {
      console.warn("Iframe src is forbidden, skipping.");
      return;
    }

    if (iframe.contentWindow.document.readyState == "loading") {
      console.warn(
        "Iframe has not finished loading, skipping Eruda injection. Be patient, jesus fuck.",
      );
      return;
    }

    this.injectErudaScript(iframeDocument)
      .then(() => {
        if (!this.devToggle) {
          this.injectShowScript(iframeDocument);
        } else {
          this.injectHideScript(iframeDocument);
        }

        this.devToggle = !this.devToggle;
      })
      .catch((error) => {
        console.error("Error injecting Eruda script:", error);
      });

    iframe.contentWindow.addEventListener("unload", () => {
      this.devToggle = false;
      this.erudaScriptLoaded = false;
      this.erudaScriptInjecting = false;
      console.log("Iframe navigation detected, Eruda toggle reset.");
    });

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
