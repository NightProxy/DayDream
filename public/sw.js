if (navigator.userAgent.includes("Firefox")) {
  Object.defineProperty(globalThis, "crossOriginIsolated", {
    value: true,
    writable: false,
  });
}

// Console polyfill — only allow warn and error, silence everything else
(function () {
  const _warn = console.warn.bind(console);
  const _error = console.error.bind(console);
  const noop = function () {};
  self.console = {
    ...console,
    log: noop,
    info: noop,
    debug: noop,
    trace: noop,
    dir: noop,
    table: noop,
    count: noop,
    time: noop,
    timeEnd: noop,
    timeLog: noop,
    group: noop,
    groupEnd: noop,
    groupCollapsed: noop,
    clear: noop,
    profile: noop,
    profileEnd: noop,
    warn: _warn,
    error: _error,
  };
})();

self.__ddxBase = self.location.pathname.replace(/[^/]*$/, "");

const _base = self.__ddxBase;

importScripts(_base + "baremux/index.js");
importScripts(_base + "core/localforage/localforage.min.js");
importScripts(
  _base + "data/bundle.js",
  _base + "data/config.js",
  _base + "data/worker.js",
);
importScripts(_base + "assets/all.js");

const CACHE_NAME = "DaydreamSPAPages";

function stripBase(pathname) {
  if (_base !== "/" && pathname.startsWith(_base)) {
    return "/" + pathname.slice(_base.length);
  }
  return pathname;
}

const settingsStore = localforage.createInstance({
  name: "settings",
  storeName: "settings",
});

class DDXWorker {
  constructor() {
    const { ScramjetServiceWorker } = $scramjetLoadWorker();
    this.sj = new ScramjetServiceWorker();
    this.uv = new UVServiceWorker();
    this.cfBlockPatterns = ["**/cdn-cgi/**"];
    this.restoredEndpoints = [
      "/api/results/",
      "/api/plus",
      "/api/store/",
      "/auth/",
    ];
    this.productionUrl = "https://daydreamx.pro";
    this.wispReady = false;

    this.bareClient = null;

    this._transportReadyResolve = null;
    this.transportReady = new Promise((resolve) => {
      this._transportReadyResolve = resolve;
    });
  }

  generateRandomString() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const length = 16 + Math.floor(Math.random() * 17);
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  checkServerWisp() {
    const proto = self.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${self.location.host}/wisp/`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 5000);

      const ws = new WebSocket(url);

      ws.addEventListener("open", () => {
        clearTimeout(timeout);
        console.log(`[DDXWorker] Server /wisp/ endpoint found at ${url}`);
        ws.close();
        resolve(true);
      });

      ws.addEventListener("error", () => {
        clearTimeout(timeout);
        console.log("[DDXWorker] Server /wisp/ endpoint not available");
        resolve(false);
      });
    });
  }

  async ensureWisp() {
    if (this.wispReady) return true;

    try {
      let wispUrl = await settingsStore.getItem("wisp");
      console.log(`[DDXWorker] ensureWisp: current value = ${wispUrl}`);

      if (!wispUrl) {
        const hasServerWisp = await this.checkServerWisp();

        if (hasServerWisp) {
          const proto = self.location.protocol === "https:" ? "wss:" : "ws:";
          wispUrl = `${proto}//${self.location.host}/wisp/`;
          await settingsStore.setItem("wisp", wispUrl);
          console.log(
            `[DDXWorker] Using server-provided WISP endpoint: ${wispUrl}`,
          );
        } else {
          const subdomain = this.generateRandomString();
          wispUrl = `wss://${subdomain}.nightwisp.me.cdn.cloudflare.net/wisp/`;
          await settingsStore.setItem("wisp", wispUrl);
          console.log(`[DDXWorker] Generated WISP server: ${wispUrl}`);
        }
      }

      this.wispReady = true;
      return true;
    } catch (err) {
      console.error("[DDXWorker] ensureWisp failed:", err);
      return false;
    }
  }

  isCfRequest(url) {
    return this.cfBlockPatterns
      .map(this.wildcardToRegex)
      .some((rule) => rule.test(url));
  }

  async handleRequest(event) {
    const url = new URL(event.request.url);
    const relativePath = stripBase(url.pathname);

    try {
      await this.sj.loadConfig();
    } catch (e) {
      console.warn("[DDXWorker] sj.loadConfig() failed:", e);
    }

    await this.ensureWisp();

    if (this.isCfRequest(event.request.url))
      return new Response(null, { status: 204 });

    if (this.isInternalRoute(relativePath)) {
      if (!/\.\w+$/.test(relativePath) && !relativePath.endsWith("/")) {
        const redirectUrl = new URL(event.request.url);
        redirectUrl.pathname += "/";
        return Response.redirect(redirectUrl.toString(), 301);
      }
      return this.serveInternalPage(relativePath);
    }

    if (
      event.request.method === "OPTIONS" &&
      this.shouldRestoreRequest(relativePath)
    ) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (this.shouldRestoreRequest(relativePath)) {
      return this.restoreRequest(event.request);
    }

    try {
      if (this.sj.config && this.sj.route(event)) {
        return this.sj.fetch(event);
      }
    } catch (e) {
      console.warn("[DDXWorker] Scramjet route/fetch error:", e);
    }

    try {
      if (this.uv.route(event)) {
        return await this.uv.fetch(event);
      }
    } catch (e) {
      console.warn("[DDXWorker] UV route/fetch error:", e);
    }

    return fetch(event.request);
  }

  wildcardToRegex(pattern) {
    return new RegExp(
      "^" +
        pattern
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, ".*")
          .replace(/\*/g, "[^/]*") +
        "$",
      "i",
    );
  }

  onTransportReady() {
    console.log("[DDXWorker] Transport ready signal received from main thread");
    if (this._transportReadyResolve) {
      this._transportReadyResolve();
      this._transportReadyResolve = null;
    }
  }

  getBareClient() {
    if (!this.bareClient) {
      console.log("[DDXWorker] Creating singleton BareClient");
      this.bareClient = new BareMux.BareClient();
    }
    return this.bareClient;
  }

  shouldRestoreRequest(relativePath) {
    return this.restoredEndpoints.some((endpoint) =>
      relativePath.startsWith(endpoint),
    );
  }

  async restoreRequest(request) {
    const originalUrl = new URL(request.url);
    const relativePath = stripBase(originalUrl.pathname);
    const productionUrl = new URL(
      relativePath + originalUrl.search,
      this.productionUrl,
    );

    console.log(
      `[DDXWorker] restoreRequest: ${request.method} ${relativePath} -> ${productionUrl.toString()}`,
    );

    const headers = {};
    for (const [key, value] of request.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower === "host") continue;
      headers[key] = value;
    }

    const fetchOptions = {
      method: request.method,
      headers: headers,
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      fetchOptions.body = await request.clone().arrayBuffer();
    }

    const TRANSPORT_TIMEOUT_MS = 15000;
    try {
      await Promise.race([
        this.transportReady,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Transport ready timeout")),
            TRANSPORT_TIMEOUT_MS,
          ),
        ),
      ]);
    } catch (err) {
      console.warn(
        `[DDXWorker] Transport not ready within ${TRANSPORT_TIMEOUT_MS}ms, attempting fetch anyway:`,
        err.message,
      );
    }

    const client = this.getBareClient();

    try {
      const response = await client.fetch(
        productionUrl.toString(),
        fetchOptions,
      );

      console.log(
        `[DDXWorker] restoreRequest OK: ${response.status} ${relativePath}`,
      );

      const responseHeaders = new Headers();
      for (const [key, value] of response.headers.entries()) {
        responseHeaders.set(key, value);
      }

      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      responseHeaders.set("Access-Control-Allow-Headers", "*");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error(
        "[DDXWorker] restoreRequest failed:",
        error.message || error,
      );

      this.bareClient = null;

      return new Response(
        JSON.stringify({
          error: "Proxy error",
          message: "Failed to proxy request to backend",
          details: String(error),
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
  }

  isInternalRoute(relativePath) {
    return relativePath.startsWith("/internal/");
  }

  resolveInternalHtml(relativePath) {
    const clean = relativePath.replace(/\/+$/, "");
    if (/\.\w+$/.test(clean)) return clean;
    return `${clean}/index.html`;
  }

  async serveInternalPage(relativePath) {
    const htmlRelative = this.resolveInternalHtml(relativePath);
    const fetchPath = _base + htmlRelative.replace(/^\//, "");

    const cache = await caches.open(CACHE_NAME);

    try {
      const response = await fetch(fetchPath);
      if (response.ok) {
        cache.put(fetchPath, response.clone());
        const body = await response.arrayBuffer();
        const hdrs = new Headers(response.headers);
        hdrs.set("Content-Type", "text/html; charset=utf-8");
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: hdrs,
        });
      }
      return response;
    } catch (err) {
      const cached = await cache.match(fetchPath);
      if (cached) {
        console.warn(
          `[DDXWorker] Network failed for ${relativePath}, serving from cache`,
        );
        const body = await cached.arrayBuffer();
        const hdrs = new Headers(cached.headers);
        hdrs.set("Content-Type", "text/html; charset=utf-8");
        return new Response(body, {
          status: cached.status,
          statusText: cached.statusText,
          headers: hdrs,
        });
      }

      console.error(
        `[DDXWorker] Failed to serve internal page: ${relativePath}`,
        err,
      );
      return new Response("Page not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }
  }
}

const ddx = new DDXWorker();

self.addEventListener("install", (event) => {
  console.log("[DDXWorker] Installing...");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[DDXWorker] Activating...");
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => ddx.ensureWisp()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case "transportReady":
      ddx.onTransportReady();
      break;
    default:
      console.log("[DDXWorker] Unknown message type:", data.type);
      break;
  }
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    ddx.handleRequest(event).catch((err) => {
      console.error("[DDXWorker] handleRequest failed, passing through:", err);
      return fetch(event.request);
    }),
  );
});
