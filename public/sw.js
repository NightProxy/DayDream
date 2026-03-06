if (navigator.userAgent.includes("Firefox")) {
  // some bs with firefox
  Object.defineProperty(globalThis, "crossOriginIsolated", {
    value: true,
    writable: false,
  });
}

importScripts("/baremux/index.js"); // BareMux
importScripts("/core/localforage/localforage.min.js"); // localforage
importScripts("/data/bundle.js", "/data/config.js", "/data/worker.js"); // UV
importScripts("/assets/all.js"); // SCRAM!! jet

const CACHE_NAME = "DaydreamSPAPages";

// --- Settings API (mirrors src/js/apis/settings.ts, same localforage instance) ---

const settingsStore = localforage.createInstance({
  name: "settings",
  storeName: "settings",
});

class DDXWorker {
  constructor() {
    const { ScramjetServiceWorker } = $scramjetLoadWorker();
    this.sj = new ScramjetServiceWorker();
    this.uv = new UVServiceWorker();
    // library shit
    this.cfBlockPatterns = ["**/cdn-cgi/**"]; //paths to block for SOME cf support
    this.restoredEndpoints = [
      "/api/results/",
      "/api/plus",
      "/api/store/",
      "/auth/",
    ];
    this.productionUrl = "https://daydreamx.pro";
    this.wispReady = false;

    // Single BareClient instance — reused across all restoreRequest calls.
    // The BareClient internally retries port acquisition from window clients,
    // so creating one early is fine; it will wait for a client to respond.
    this.bareClient = null;

    // Promise that resolves when the main thread confirms transport is configured.
    // restoreRequest() awaits this before making any BareClient.fetch() calls.
    this._transportReadyResolve = null;
    this.transportReady = new Promise((resolve) => {
      this._transportReadyResolve = resolve;
    });
  }

  generateRandomString() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const length = 16 + Math.floor(Math.random() * 17); // 16-32
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  async ensureWisp() {
    if (this.wispReady) return true;

    try {
      let wispUrl = await settingsStore.getItem("wisp");
      console.log(`[DDXWorker] ensureWisp: current value = ${wispUrl}`);

      if (!wispUrl) {
        // Generate a new wisp server (fallback if app-side init didn't run yet)
        const subdomain = this.generateRandomString();
        wispUrl = `wss://${subdomain}.nightwisp.me.cdn.cloudflare.net/wisp/`;
        await settingsStore.setItem("wisp", wispUrl);
        console.log(`[DDXWorker] Generated WISP server: ${wispUrl}`);
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
      .some((rule) => rule.test(url)); // cf route detection
  }

  async handleRequest(event) {
    const url = new URL(event.request.url);

    await this.sj.loadConfig();

    // Ensure WISP is configured on the first request (no-op after first success)
    await this.ensureWisp();

    if (this.isCfRequest(event.request.url))
      return new Response(null, { status: 204 }); // some CF support works if we just delete it lmfao

    // Internal page routing — anything under /internal/ gets resolved and served
    if (this.isInternalRoute(url.pathname)) {
      return this.serveInternalPage(url.pathname);
    }

    // OPTIONS preflight for API routes
    if (
      event.request.method === "OPTIONS" &&
      this.shouldRestoreRequest(event.request.url)
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

    // Prod API proxy — restored endpoints go to production backend
    if (this.shouldRestoreRequest(event.request.url)) {
      return this.restoreRequest(event.request);
    }

    // Proxy engines
    if (this.sj.route(event)) {
      return this.sj.fetch(event);
    }
    if (this.uv.route(event)) {
      return await this.uv.fetch(event);
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

  // Called when the main thread sends {type: "transportReady"} to the SW.
  onTransportReady() {
    console.log("[DDXWorker] Transport ready signal received from main thread");
    if (this._transportReadyResolve) {
      this._transportReadyResolve();
      this._transportReadyResolve = null;
    }
  }

  // Get or create the singleton BareClient.
  getBareClient() {
    if (!this.bareClient) {
      console.log("[DDXWorker] Creating singleton BareClient");
      this.bareClient = new BareMux.BareClient();
    }
    return this.bareClient;
  }

  shouldRestoreRequest(url) {
    const urlObj = new URL(url);
    return this.restoredEndpoints.some((endpoint) =>
      urlObj.pathname.startsWith(endpoint),
    );
  }

  async restoreRequest(request) {
    const originalUrl = new URL(request.url);
    const productionUrl = new URL(
      originalUrl.pathname + originalUrl.search,
      this.productionUrl,
    );

    console.log(
      `[DDXWorker] restoreRequest: ${request.method} ${originalUrl.pathname} -> ${productionUrl.toString()}`,
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

    // Wait for the main thread to confirm transport is configured.
    // The BareClient's internal getPortFromClients() will retry infinitely
    // until a window client responds, but the SharedWorker won't have a
    // transport set until setTransports() completes on the main thread.
    // We cap the wait at 15s to avoid hanging forever on broken setups.
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

    // Use the singleton BareClient — its internal port acquisition retries
    // independently, and we only need one instance.
    const client = this.getBareClient();

    try {
      const response = await client.fetch(
        productionUrl.toString(),
        fetchOptions,
      );

      console.log(
        `[DDXWorker] restoreRequest OK: ${response.status} ${originalUrl.pathname}`,
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

      // If BareClient fails, it may be a stale port — reset the client
      // so the next request gets a fresh one.
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

  // --- Internal page routing ---
  // Mirrors how Protocols works: ddx://* -> /internal/{path}
  // No hardcoded list — if it's under /internal/, we serve it.

  isInternalRoute(pathname) {
    return pathname.startsWith("/internal/");
  }

  resolveInternalHtml(pathname) {
    // Normalize: strip trailing slash, then assume index.html
    const clean = pathname.replace(/\/+$/, "");
    // If it already ends with a file extension, leave it alone
    if (/\.\w+$/.test(clean)) return clean;
    return `${clean}/index.html`;
  }

  async serveInternalPage(pathname) {
    const htmlPath = this.resolveInternalHtml(pathname);

    // Try cache first
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(htmlPath);
    if (cached) return cached;

    // Fetch from network, cache if successful
    try {
      const response = await fetch(htmlPath);
      if (response.ok) {
        cache.put(htmlPath, response.clone());
        return response;
      }
      // Let non-ok responses fall through as-is
      return response;
    } catch (err) {
      console.error(
        `[DDXWorker] Failed to serve internal page: ${pathname}`,
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

// --- Lifecycle events ---

self.addEventListener("install", (event) => {
  console.log("[DDXWorker] Installing...");
  // No pre-cache list — internal pages are cached dynamically on first fetch,
  // same philosophy as Protocols: assume the route exists, serve it when asked.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[DDXWorker] Activating...");
  // Clean old caches, claim clients, and ensure WISP is configured
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        );
      })
      .then(() => self.clients.claim())
      .then(() => ddx.ensureWisp()),
  );
});

// Listen for messages from the main thread
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
  event.respondWith(ddx.handleRequest(event));
});
