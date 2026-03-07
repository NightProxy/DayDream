import * as BareMux from "@mercuryworkshop/bare-mux";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { HostingAPI } from "@apis/platform/hosting";
import { NetworkAPI } from "@apis/platform/network";
import { basePath, resolvePath } from "@js/utils/basepath";

interface ProxyInterface {
  connection: BareMux.BareMuxConnection;
  searchVar: string;
  transportVar: string;
  wispUrl: string;
  logging: Logger;
  settings: SettingsAPI;
  hosting: HostingAPI;
  network: NetworkAPI;
  isStaticBuild: boolean;
  initReady: Promise<void>;
  setTransports(): Promise<void>;
  search(input: string): string;
  registerSW(swConfig: any): Promise<void>;
  updateSW(): void;
  uninstallSW(): void;
  fetchProxyMapping(): Promise<any>;
  getDomainFromUrl(url: string): string | null;
  determineProxy(domain: string): Promise<string>;
  automatic(input: string, swConfig: Record<any, any>): Promise<any>;
  redirect(
    swConfig: Record<any, any>,
    proxySetting: string,
    url: string,
  ): Promise<void>;
  fetch(url: string, params?: any): Promise<string>;
  getFavicon(url: string): Promise<string | null>;
  generateWispServer(): string;
  swapWispServer(url?: string): Promise<void>;
}
class Proxy implements ProxyInterface {
  connection!: BareMux.BareMuxConnection;
  searchVar!: string;
  transportVar!: string;
  wispUrl!: string;
  settings!: SettingsAPI;
  logging!: Logger;
  hosting!: HostingAPI;
  network!: NetworkAPI;
  isStaticBuild: boolean = false;
  initReady: Promise<void>;

  constructor() {
    this.connection = new BareMux.BareMuxConnection(
      resolvePath("bmworker/worker.js"),
    );

    this.settings = new SettingsAPI();
    this.hosting = new HostingAPI();
    this.network = new NetworkAPI();
    this.logging = new Logger();
    this.isStaticBuild = false;

    this.initReady = (async () => {
      this.searchVar =
        (await this.settings.getItem("search")) ||
        "https://www.duckduckgo.com/?q=%s";
      this.transportVar =
        (await this.settings.getItem("transports")) || "libcurl";

      const savedWisp = await this.settings.getItem("wisp");
      if (savedWisp) {
        this.wispUrl = savedWisp;
        console.log(`[Proxy] Using saved WISP: ${this.wispUrl}`);
      } else if (!this.hosting.hasBackend()) {
        const generated = this.generateWispServer();
        this.wispUrl = generated;
        await this.settings.setItem("wisp", generated);
        console.log(
          `[Proxy] No WISP configured on static deploy, generated: ${generated}`,
        );
      } else {
        this.wispUrl =
          (location.protocol === "https:" ? "wss" : "ws") +
          "://" +
          location.host +
          "/wisp/";
        console.log(`[Proxy] Using local WISP: ${this.wispUrl}`);
      }
    })();
  }

  generateWispServer(): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const length = 16 + Math.floor(Math.random() * 17);
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return `wss://${result}.nightwisp.me.cdn.cloudflare.net/wisp/`;
  }

  async swapWispServer(url?: string): Promise<void> {
    const newWisp = url || this.generateWispServer();
    this.wispUrl = newWisp;
    await this.settings.setItem("wisp", newWisp);
    console.log(`[Proxy] WISP server swapped to: ${newWisp}`);
    await this.setTransports();
  }

  async setTransports() {
    await this.initReady;
    console.log("[Proxy] setTransports() called, wispUrl:", this.wispUrl);
    const transports = this.transportVar || "libcurl";
    const transportMap: Record<any, string> = {
      epoxy: resolvePath("epoxy/index.mjs"),
      libcurl: resolvePath("libcurl/index.mjs"),
    };

    const transportFile =
      transportMap[transports] || resolvePath("libcurl/index.mjs");

    const wispUrl =
      this.wispUrl ||
      (location.protocol === "https:" ? "wss" : "ws") +
        "://" +
        location.host +
        "/wisp/";

    const transportOptions: Record<string, any> = {
      base: transportFile,
      wisp: wispUrl,
      modules: [],
    };

    const remoteProxyServer = await this.getRemoteProxyServer();
    if (
      remoteProxyServer &&
      remoteProxyServer !== "undefined" &&
      remoteProxyServer !== "null" &&
      remoteProxyServer !== "disabled" &&
      remoteProxyServer !== "false" &&
      transportFile === resolvePath("libcurl/index.mjs")
    ) {
      transportOptions.proxy = remoteProxyServer;
    }

    const isRefluxEnabled = await this.getRefluxStatus();

    if (isRefluxEnabled) {
      transportOptions.modules.push(resolvePath("reflux/module.mjs"));
    }

    await this.connection.setTransport(resolvePath("enigma/index.mjs"), [
      { ...transportOptions },
    ]);

    console.log("[Proxy] Transport set with options:", transportOptions);
    if (this.logging) {
      this.logging.createLog(`Transport Set: ${this.connection.getTransport}`);
    }

    this.notifySwTransportReady();
  }

  private async notifySwTransportReady() {
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration?.active) {
        registration.active.postMessage({ type: "transportReady" });
        console.log("[Proxy] Sent transportReady to SW");
      }
    } catch (err) {
      console.warn("[Proxy] Failed to notify SW of transport ready:", err);
    }
  }

  async getTransports() {
    const transport = await this.connection.getTransport();
    return transport;
  }

  search(input: string) {
    input = input.trim();
    const searchTemplate = this.searchVar || "https://www.duckduckgo.com/?q=%s";

    if (input.includes(".") && input.includes(" ")) {
      return searchTemplate.replace("%s", encodeURIComponent(input));
    }

    try {
      return new URL(input).toString();
    } catch (err) {
      try {
        const url = new URL(`http://${input}`);
        if (url.hostname.includes(".")) {
          return url.toString();
        }
        throw new Error("Invalid hostname");
      } catch (err) {
        return searchTemplate.replace("%s", encodeURIComponent(input));
      }
    }
  }

  async registerSW(swConfig: Record<any, any>) {
    console.log(
      "[Proxy] registerSW() called with type:",
      swConfig.type,
      "file:",
      swConfig.file,
    );
    switch (swConfig.type) {
      case "sw":
        if ("serviceWorker" in navigator) {
          const scpe: string =
            basePath +
            (swConfig.config.prefix
              .slice(basePath.length)
              .match(/^[^/]+\//)?.[0] || "");
          console.log("[Proxy] Registering service worker with scope:", scpe);
          await navigator.serviceWorker.register(swConfig.file, {
            scope: scpe,
          });

          navigator.serviceWorker.ready.then(async () => {
            console.log("[Proxy] Service worker ready, setting up transports");
            await this.setTransports().then(async () => {
              const transport = await this.connection.getTransport();
              if (transport == null) {
                console.log("[Proxy] Transport null, retrying setTransports");
                this.setTransports();
              }
            });
            this.updateSW();
          });
        }
        break;
      case "iframe":
        console.log("iframe proxy selected");
        break;
      case "multi":
        console.log("multi proxy selected");
        break;
    }
  }

  updateSW() {
    const self = this;
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach((registration) => {
        registration.update();
        self.logging.createLog(
          `Service Worker at ${registration.scope} Updated`,
        );
      });
    });
  }

  uninstallSW() {
    const self = this;
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach((registration) => {
        registration.unregister();
        self.logging.createLog(
          `Service Worker at ${registration.scope} Unregistered`,
        );
      });
    });
  }

  async fetchProxyMapping() {
    try {
      const response = await fetch(resolvePath("json/p.json"));
      if (!response.ok) throw new Error("Failed to load proxy mappings.");
      return await response.json();
    } catch (error) {
      console.error("Error fetching proxy mappings:", error);
      return null;
    }
  }

  getDomainFromUrl(url: string) {
    try {
      if (!url || typeof url !== "string") {
        return null;
      }

      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }

      return new URL(url).hostname;
    } catch (error) {
      console.error("Invalid URL format:", error);
      return null;
    }
  }

  async determineProxy(domain: string) {
    const proxyMapping = await this.fetchProxyMapping();
    if (proxyMapping) {
      return proxyMapping[domain] || proxyMapping["default"];
    }
    return "sj";
  }

  async automatic(input: string, swConfig: Record<any, any>) {
    const domain = this.getDomainFromUrl(input);
    if (domain) {
      const selectedProxy = await this.determineProxy(domain);

      var {
        type: swType,
        file: swFile,
        config: swConfigSettings,
        func: swFunction,
      } = swConfig[selectedProxy] ?? {
        type: "sw",
        file: resolvePath("sw.js"),
        config: window.__uv$config,
        func: null,
      };

      if (swFunction) swFunction();

      await this.registerSW({
        type: swType,
        file: swFile,
        config: swConfigSettings,
      });
      await this.setTransports();

      return { type: swType, file: swFile, config: swConfigSettings };
    } else {
      return null;
    }
  }

  async redirect(swConfig: Record<any, any>, proxySetting: string, url: any) {
    console.log(
      "[Proxy] redirect() called with url:",
      url,
      "proxySetting:",
      proxySetting,
    );
    let swConfigSettings: Record<any, any> | null = null;
    if (proxySetting === "auto") {
      swConfigSettings = await this.automatic(this.search(url), swConfig);
    } else {
      swConfigSettings = swConfig[proxySetting];
    }

    if (!swConfigSettings) {
      console.log("[Proxy] No swConfigSettings found, returning");
      return;
    }

    await this.registerSW(swConfigSettings);
    await this.setTransports();

    const activeIframe: HTMLIFrameElement | null =
      document.querySelector("iframe.active");
    if (!activeIframe) {
      console.log("[Proxy] No active iframe found");
      return;
    }

    switch (swConfigSettings.type) {
      case "sw": {
        let encodedUrl: string;

        if (proxySetting === "dy") {
          encodedUrl =
            swConfigSettings.config.prefix +
            "route?url=" +
            window.__uv$config.encodeUrl(this.search(url));
        } else {
          encodedUrl =
            swConfigSettings.config.prefix +
            window.__uv$config.encodeUrl(this.search(url));
        }
        console.log("[Proxy] Redirecting iframe to:", encodedUrl);
        activeIframe.src = encodedUrl;
        break;
      }
    }
  }

  async convertURL(
    swConfig: Record<any, any>,
    proxySetting: string,
    url: string,
  ) {
    console.log(
      "[Proxy] convertURL() called with url:",
      url,
      "proxySetting:",
      proxySetting,
    );
    let swConfigSettings: Record<any, any> | null = null;
    if (proxySetting === "auto") {
      swConfigSettings = await this.automatic(this.search(url), swConfig);
    } else {
      swConfigSettings = swConfig[proxySetting];
    }

    if (!swConfigSettings) {
      console.log("[Proxy] No swConfigSettings, returning search url");
      return this.search(url);
    }

    await this.registerSW(swConfigSettings);
    await this.setTransports();

    let encodedUrl: string =
      swConfigSettings.config.prefix +
      window.__uv$config.encodeUrl(this.search(url));
    console.log("[Proxy] Converted URL to:", encodedUrl);
    return encodedUrl;
  }

  async fetch(url: any, params?: any) {
    await this.setTransports();
    const client = new BareMux.BareClient();
    let response: Response;

    if (params) {
      response = await client.fetch(url, params);
    } else {
      response = await client.fetch(url);
    }

    return await response.text();
  }

  async eval(
    swConfig: Record<any, any>,
    frame: HTMLIFrameElement,
    code: string,
  ) {
    console.log("[Proxy.eval] Starting eval", {
      hasSrc: !!frame.src,
      src: frame.src,
      codeLength: code.length,
      codePreview: code.substring(0, 100),
    });

    if (!frame.src) {
      console.warn("[Proxy.eval] Cannot eval: frame has no src");
      return;
    }

    let activeProxy: string | null = null;

    for (const [proxyName, proxyConfig] of Object.entries(swConfig)) {
      if (
        proxyConfig.config?.prefix &&
        frame.src.includes(proxyConfig.config.prefix)
      ) {
        activeProxy = proxyName;
        console.log(
          "[Proxy.eval] Detected proxy:",
          proxyName,
          "with prefix:",
          proxyConfig.config.prefix,
        );
        break;
      }
    }

    if (!activeProxy) {
      console.warn(
        "[Proxy.eval] Cannot eval: frame src does not match any proxy prefix",
        {
          frameSrc: frame.src,
          availablePrefixes: Object.entries(swConfig).map(([name, config]) => ({
            name,
            prefix: (config as any).config?.prefix,
          })),
        },
      );
      return;
    }

    try {
      if (activeProxy === "uv") {
        console.log("[Proxy.eval] Using UV eval");
        const uvEval = (frame.contentWindow as any)?.__uv$eval;
        if (!uvEval) {
          console.error(
            "[Proxy.eval] UV eval function not found on contentWindow",
          );
          return;
        }
        uvEval(code);
        console.log("[Proxy.eval] UV eval succeeded");
      } else if (activeProxy === "sj") {
        console.log("[Proxy.eval] Using Scramjet eval");
        const contentWindow = frame.contentWindow;
        if (!contentWindow) {
          console.error("[Proxy.eval] contentWindow is null");
          return;
        }
        const scramjetWrap = (contentWindow as any).$scramjet$wrap;
        if (!scramjetWrap) {
          console.error(
            "[Proxy.eval] Scramjet $scramjet$wrap not found on contentWindow",
          );
          return;
        }
        contentWindow.$scramjet$wrap(
          (contentWindow as any).eval.call(contentWindow, code),
        );
        console.log("[Proxy.eval] Scramjet eval succeeded");
      } else if (new URL(frame.src).pathname.includes("/internal/")) {
        console.log("[Proxy.eval] Using direct eval for internal page");
        const directEval = (frame.contentWindow as any)?.eval;
        if (!directEval) {
          console.error(
            "[Proxy.eval] Direct eval function not found on contentWindow",
          );
          return;
        }
        directEval(code);
        console.log("[Proxy.eval] Direct eval succeeded");
      } else {
        console.warn(
          "[Proxy.eval] Cannot eval: unsupported proxy type for eval",
          {
            activeProxy,
            frameSrc: frame.src,
          },
        );
      }
    } catch (error) {
      console.error("[Proxy.eval] Eval failed with error:", error, {
        activeProxy,
        frameSrc: frame.src,
        code: code.substring(0, 200),
      });
    }
  }

  private faviconCache = new Map<string, string>();
  private bookmarkManager: any = null;

  public setBookmarkManager(bookmarkManager: any): void {
    this.bookmarkManager = bookmarkManager;
  }

  async getFavicon(url: string) {
    try {
      const domain = this.getDomainFromUrl(url);
      if (!domain) {
        return null;
      }

      if (this.bookmarkManager) {
        const cachedFavicon = this.bookmarkManager.getCachedFavicon(url);
        if (cachedFavicon) {
          return cachedFavicon;
        }
      }

      if (this.faviconCache.has(domain)) {
        return this.faviconCache.get(domain) || null;
      }

      const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

      let retries = 3;
      while (retries > 0) {
        try {
          await this.setTransports();
          break;
        } catch (transportError) {
          retries--;
          if (retries === 0) throw transportError;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      const client = new BareMux.BareClient();
      const response = await client.fetch(googleFaviconUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const dataUrl = `data:image/png;base64,${base64}`;

      this.faviconCache.set(domain, dataUrl);

      if (this.bookmarkManager) {
        await this.bookmarkManager.cacheFavicon(url, dataUrl);
      }

      return dataUrl;
    } catch (error) {
      console.warn("Failed to fetch favicon:", error);
      return null;
    }
  }

  async ping(
    server: string,
  ): Promise<{ online: boolean; ping: number | string }> {
    return this.network.wsPing(server);
  }

  async setRemoteProxyServer(server: string) {
    await this.network.setRemoteProxyServer(server);
  }

  async getRemoteProxyServer(): Promise<string> {
    return await this.network.getRemoteProxyServer();
  }

  async disableReflux() {
    await this.settings.setItem("RefluxStatus", "false");
  }

  async enableReflux() {
    await this.settings.setItem("RefluxStatus", "true");
  }

  async getRefluxStatus(): Promise<boolean> {
    const status = await this.settings.getItem("RefluxStatus");
    return status !== "false";
  }

  async getAuthUrl(): Promise<string> {
    try {
      const productionAuthUrl = await this.settings.getItem(
        "production_auth_url",
      );
      if (productionAuthUrl && typeof productionAuthUrl === "string") {
        return productionAuthUrl;
      }
      return (
        (location.protocol === "https:" ? "https://" : "http://") +
        location.host +
        resolvePath("auth")
      );
    } catch (error) {
      console.error("[Proxy] Error determining auth URL:", error);
      return "https://demoplussrv.night-x.com/auth";
    }
  }

  async checkAuthentication(): Promise<boolean> {
    try {
      const basePlusPath = resolvePath("plus");
      const fileName = "index.mjs";
      const module = await import(`${basePlusPath}/${fileName}`);
      const PlusClient = module.default;
      const client = new PlusClient();
      const sessionToken = await client.getSessionToken();
      return sessionToken !== null;
    } catch (error) {
      console.error("[Proxy] Error checking authentication:", error);
      return false;
    }
  }
}

export { Proxy };
