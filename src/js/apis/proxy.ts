import * as BareMux from "@mercuryworkshop/bare-mux";
import { Logger } from "@apis/logging";
import { SettingsAPI } from "@apis/settings";
import { HostingAPI } from "@apis/static/hosting";
import { ServerListAPI } from "@apis/static/serverlist";

interface ProxyInterface {
  connection: BareMux.BareMuxConnection;
  searchVar: string;
  transportVar: string;
  wispUrl: string;
  logging: Logger;
  settings: SettingsAPI;
  hosting: HostingAPI;
  serverList: ServerListAPI;
  isStaticBuild: boolean;
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
  findWorkingWispServer(): Promise<string>;
  setupStaticBuild(): Promise<void>;
}
class Proxy implements ProxyInterface {
  connection!: BareMux.BareMuxConnection;
  searchVar!: string;
  transportVar!: string;
  wispUrl!: string;
  settings!: SettingsAPI;
  logging!: Logger;
  hosting!: HostingAPI;
  serverList!: ServerListAPI;
  isStaticBuild: boolean = false;

  constructor() {
    this.connection = new BareMux.BareMuxConnection("/baremux/worker.js");

    this.settings = new SettingsAPI();
    this.hosting = new HostingAPI();
    this.serverList = new ServerListAPI();

    (async () => {
      // Detect if running on static build
      this.isStaticBuild = !(await this.hosting.detectServer());

      this.searchVar =
        (await this.settings.getItem("search")) ||
        "https://www.duckduckgo.com/?q=%s";
      this.transportVar =
        (await this.settings.getItem("transports")) || "libcurl";

      // Setup wisp URL based on build type
      if (this.isStaticBuild) {
        await this.setupStaticBuild();
      } else {
        this.wispUrl =
          (await this.settings.getItem("wisp")) ||
          (location.protocol === "https:" ? "wss" : "ws") +
            "://" +
            location.host +
            "/wisp/";
      }

      this.logging = new Logger();
    })();
  }

  async setTransports() {
    const transports = this.transportVar;
    const transportMap: Record<any, string> = {
      epoxy: "/epoxy/index.mjs",
      libcurl: "/libcurl/index.mjs",
    };

    const transportFile = transportMap[transports] || "/libcurl/index.mjs";

    const transportOptions: Record<string, any> = {
      wisp: this.wispUrl,
    };

    const remoteProxyServer = await this.getRemoteProxyServer();
    if (
      remoteProxyServer &&
      remoteProxyServer !== "undefined" &&
      remoteProxyServer !== "null" &&
      remoteProxyServer !== "disabled" &&
      remoteProxyServer !== "false" &&
      transportFile === "/libcurl/index.mjs"
    ) {
      transportOptions.remoteProxy = remoteProxyServer;
    }

    const isRefluxEnabled = await this.getRefluxStatus();

    if (isRefluxEnabled) {
      await this.connection.setTransport("/reflux/index.mjs", [
        { base: transportFile, ...transportOptions },
      ]);
    } else {
      await this.connection.setTransport(transportFile, [transportOptions]);
    }

    if (this.logging) {
      this.logging.createLog(`Transport Set: ${this.connection.getTransport}`);
    }
  }

  async getTransports() {
    const transport = await this.connection.getTransport();
    return transport;
  }

  search(input: string) {
    input = input.trim();
    const searchTemplate = this.searchVar || "https://www.duckduckgo.com/?q=%s";
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
    switch (swConfig.type) {
      case "sw":
        if ("serviceWorker" in navigator) {
          const scpe: string =
            swConfig.config.prefix.match(/^\/[^/]+\//)?.[0] || "";
          await navigator.serviceWorker.register(swConfig.file, {
            scope: scpe,
          });

          navigator.serviceWorker.ready.then(async () => {
            await this.setTransports().then(async () => {
              const transport = await this.connection.getTransport();
              if (transport == null) {
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
      const response = await fetch("/json/p.json");
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
        file: "/data/sw.js",
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
    let swConfigSettings: Record<any, any> | null = null;
    if (proxySetting === "auto") {
      swConfigSettings = await this.automatic(this.search(url), swConfig);
    } else {
      swConfigSettings = swConfig[proxySetting];
    }

    if (!swConfigSettings) return;

    await this.registerSW(swConfigSettings);
    await this.setTransports();

    const activeIframe: HTMLIFrameElement | null =
      document.querySelector("iframe.active");
    if (!activeIframe) return;

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
    let swConfigSettings: Record<any, any> | null = null;
    if (proxySetting === "auto") {
      swConfigSettings = await this.automatic(this.search(url), swConfig);
    } else {
      swConfigSettings = swConfig[proxySetting];
    }

    if (!swConfigSettings) return this.search(url);

    await this.registerSW(swConfigSettings);
    await this.setTransports();

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
    return new Promise((resolve) => {
      const websocket = new WebSocket(server);
      const startTime = Date.now();
      websocket.addEventListener("open", () => {
        const pingTime = Date.now() - startTime;
        websocket.close();
        resolve({ online: true, ping: pingTime });
      });
      websocket.addEventListener("message", () => {
        const pingTime = Date.now() - startTime;
        websocket.close();
        resolve({ online: true, ping: pingTime });
      });
      websocket.addEventListener("error", () => {
        websocket.close();
        resolve({ online: false, ping: "N/A" });
      });
      setTimeout(() => {
        websocket.close();
        resolve({ online: false, ping: "N/A" });
      }, 5000);
    });
  }

  async setRemoteProxyServer(server: string) {
    await this.settings.setItem("prx-server", server);
  }

  async getRemoteProxyServer(): Promise<string> {
    return await this.settings.getItem("prx-server");
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

  async findWorkingWispServer(): Promise<string> {
    try {
      const customWisp = await this.settings.getItem("wisp");
      if (customWisp && customWisp !== "") {
        const result = await this.ping(customWisp);
        if (result.online) {
          return customWisp;
        }
      }

      const servers = await this.serverList.fetchServerList();

      if (!servers || servers.length === 0) {
        throw new Error("No wisp servers available");
      }

      const maxParallel = 5;
      const workingServers: Array<{ url: string; ping: number }> = [];

      for (let i = 0; i < servers.length; i += maxParallel) {
        const batch = servers.slice(i, i + maxParallel);
        const results = await Promise.all(
          batch.map(async (server) => {
            const result = await this.ping(server.url);
            if (result.online && typeof result.ping === "number") {
              return { url: server.url, ping: result.ping };
            }
            return null;
          }),
        );

        results.forEach((result) => {
          if (result) workingServers.push(result);
        });

        if (workingServers.length > 0) break;
      }

      if (workingServers.length === 0) {
        throw new Error("No working wisp servers found");
      }

      workingServers.sort((a, b) => a.ping - b.ping);
      const fastestServer = workingServers[0].url;

      await this.settings.setItem("static-wisp-server", fastestServer);

      if (this.logging) {
        this.logging.createLog(
          `Selected wisp server: ${fastestServer} (${workingServers[0].ping}ms)`,
        );
      }

      return fastestServer;
    } catch (error) {
      console.error("Error finding working wisp server:", error);
      return "wss://wisp.mercurywork.shop/wisp/";
    }
  }

  async setupStaticBuild(): Promise<void> {
    try {
      const cachedWisp = await this.settings.getItem("static-wisp-server");
      if (cachedWisp && cachedWisp !== "") {
        const result = await this.ping(cachedWisp);
        if (result.online) {
          this.wispUrl = cachedWisp;
          if (this.logging) {
            this.logging.createLog(`Using cached wisp server: ${cachedWisp}`);
          }
        } else {
          this.wispUrl = await this.findWorkingWispServer();
        }
      } else {
        this.wispUrl = await this.findWorkingWispServer();
      }

      if ("serviceWorker" in navigator) {
        try {
          await navigator.serviceWorker.register("/static.sw.js", {
            scope: "/api/",
          });

          if (this.logging) {
            this.logging.createLog(
              "Static build API proxy service worker registered",
            );
          }
        } catch (swError) {
          console.warn("Failed to register API proxy service worker:", swError);
        }
      }
    } catch (error) {
      console.error("Error setting up static build:", error);
      this.wispUrl = "wss://wisp.mercurywork.shop/wisp/";
    }
  }
}

export { Proxy };
