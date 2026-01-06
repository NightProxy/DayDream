import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { Items } from "@browser/items";
import { Proxy } from "@apis/proxy";

interface RouteEntry {
  url: string;
  proxy: boolean;
}

interface ProtoInterface {
  logging: Logger;
  settings: SettingsAPI;
  items: Items;
  proxy: Proxy;
  register(proto: string, path: string, url: string, proxy: boolean): void;
  processUrl(url: string): Promise<string | void>;
  getInternalURL(url: string): Promise<string | void>;
  navigate(url: string): void;
  isRegisteredProtocol(url: string): boolean;
}

class Protocols implements ProtoInterface {
  logging: Logger;
  settings: SettingsAPI;
  items: Items;
  proxy: Proxy;
  private routes: Map<string, Map<string, RouteEntry>>;
  private swConfig: Record<any, any>;
  private proxySetting: string;

  constructor(swConfig: Record<any, any>, proxySetting: string, proxy: Proxy) {
    this.logging = new Logger();
    this.settings = new SettingsAPI();
    this.items = new Items();
    this.proxy = proxy;
    this.routes = new Map();
    this.swConfig = swConfig;
    this.proxySetting = proxySetting;
    this.register("ddx", "*", "/internal", false);
  }

  register(proto: string, path: string, url: string, proxy: boolean): void {
    const cleanProto = proto.toLowerCase();
    if (!this.routes.has(cleanProto)) {
      this.routes.set(cleanProto, new Map());
    }
    const protoMap = this.routes.get(cleanProto)!;
    const isOverride = protoMap.has(path);
    protoMap.set(path, { url, proxy });
    console.log(`[Protocols] ${isOverride ? 'Overriding' : 'Registering'} ${cleanProto}://${path} -> ${url} (proxy: ${proxy})`);
  }

  async processUrl(url: string): Promise<string | void> {
    console.log("[Protocols] processUrl() called with:", url);
    if (url.startsWith("javascript:")) {
      const js = url.slice("javascript:".length);
      const iframe = document.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      if (iframe?.contentWindow) {
        (iframe.contentWindow as any).eval(js);
      }
    }

    const match = url.match(/^([a-zA-Z0-9+.-]+):\/\/(.+)/);
    
    if (match) {
      const proto = match[1].toLowerCase();
      const pathRaw = match[2];
      const path = pathRaw.replace(/\/+$/, "");
      const protoRoutes = this.routes.get(proto);

      console.log("[Protocols] Matched protocol:", proto, "raw path:", pathRaw, "normalized:", path);

      if (protoRoutes) {
        let resolved: RouteEntry | undefined;

        if (protoRoutes.has(path)) {
          resolved = protoRoutes.get(path);
        } else if (protoRoutes.has("*")) {
          const wildcard = protoRoutes.get("*");
          if (wildcard) {
            const fullUrl = this.joinURL(wildcard.url, path);
            console.log("[Protocols] Using wildcard route, fullUrl:", fullUrl, "proxy:", wildcard.proxy);
            return wildcard.proxy
              ? await this.proxy.convertURL(
                  this.swConfig,
                  this.proxySetting,
                  fullUrl,
                )
              : fullUrl;
          }
        }

        if (resolved) {
          console.log("[Protocols] Resolved route, url:", resolved.url, "proxy:", resolved.proxy);
          return resolved.proxy
            ? await this.proxy.convertURL(
                this.swConfig,
                this.proxySetting,
                resolved.url,
              )
            : resolved.url;
        }
      }
    }

    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("/") ||
      url.startsWith("data:")
    ) {
      if (url.startsWith("http://") || url.startsWith("https://")) {
        try {
          const urlObj = new URL(url);
          if (urlObj.host !== location.host) {
            return await this.proxy.convertURL(
              this.swConfig,
              this.proxySetting,
              url,
            );
          }
        } catch (error) {
          console.error("Error parsing URL for proxy check:", error);
        }
      }
      return url;
    }

    return "/internal/" + url;
  }

  getInternalURL(url: string): Promise<string | void> {
    for (const [proto, pathMap] of this.routes.entries()) {
      for (const [pathKey, { url: baseUrl }] of pathMap.entries()) {
        if (pathKey === "*") {
          if (url.startsWith(baseUrl)) {
            const remainingPath = url.slice(baseUrl.length).replace(/^\/+/, "");
            return Promise.resolve(`${proto}://${remainingPath}`);
          }
        } else {
          if (url === baseUrl) {
            return Promise.resolve(`${proto}://${pathKey}`);
          }
        }
      }
    }

    if (url.startsWith("/internal/")) {
      return Promise.resolve("ddx://" + url.slice("/internal/".length));
    }

    return Promise.resolve(url);
  }

  async navigate(url: string): Promise<void> {
    console.log("[Protocols] navigate() called with url:", url);
    try {
      const processedUrl = (await this.processUrl(url)) || "/internal/error/";
      console.log("[Protocols] Processed URL:", processedUrl);
      
      if (!this.items.frameContainer) {
        this.logging.createLog("iframeContainer is not available.");
        return;
      }
      
      const iframe = this.items.frameContainer!.querySelector(
        "iframe.active",
      ) as HTMLIFrameElement | null;
      
      if (iframe) {
        console.log("[Protocols] Setting iframe src to:", processedUrl);
        iframe.setAttribute("src", processedUrl);
        this.logging.createLog(`Navigated to: ${processedUrl}`);

        window.dispatchEvent(
          new CustomEvent("tabNavigated", {
            detail: {
              tabId: iframe.getAttribute("data-tab-id") || "unknown",
              url: processedUrl,
              fromProtocol: true,
            },
          }),
        );
      } else {
        console.log("[Protocols] No active iframe found");
      }
    } catch (error) {
      console.error("[Protocols] Error in navigate():", error);
    }
  }

  private joinURL(base: string, path: string): string {
    const endsWithSlash = base.endsWith("/");
    const startsWithSlash = path.startsWith("/");
    if (endsWithSlash && startsWithSlash) {
      return base + path.slice(1);
    } else if (!endsWithSlash && !startsWithSlash) {
      return base + "/" + path;
    }
    return base + path;
  }

  isRegisteredProtocol(url: string): boolean {
    const match = url.match(/^([a-zA-Z0-9+.-]+):\/\//);
    if (!match) {
      return false;
    }
    const proto = match[1].toLowerCase();
    return this.routes.has(proto);
  }
}

export { Protocols };
