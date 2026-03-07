if (navigator.userAgent.includes("Firefox")) {
  // some bs with firefox
  Object.defineProperty(globalThis, "crossOriginIsolated", {
    value: true,
    writable: false,
  });
}

// --- Runtime base path detection ---
// sw.js lives at the deployment root (e.g. /myapp/sw.js).
// Strip the filename to get the base directory.
self.__ddxBase = self.location.pathname.replace(/[^/]*$/, "");

const _base = self.__ddxBase;

importScripts(_base + "baremux/index.js"); // BareMux
importScripts(_base + "core/localforage/localforage.min.js"); // localforage
importScripts(
  _base + "data/bundle.js",
  _base + "data/config.js",
  _base + "data/worker.js",
); // UV
importScripts(_base + "assets/all.js"); // SCRAM!! jet

const CACHE_NAME = "DaydreamSPAPages";

/**
 * Strip the deployment base prefix from an absolute pathname so route
 * matching can use canonical paths like "/internal/...", "/api/..." etc.
 *
 * stripBase("/myapp/api/results/foo") => "/api/results/foo"
 * stripBase("/api/results/foo")       => "/api/results/foo"  (base is "/")
 */
function stripBase(pathname) {
  if (_base !== "/" && pathname.startsWith(_base)) {
    return "/" + pathname.slice(_base.length);
  }
  return pathname;
}

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
    const relativePath = stripBase(url.pathname);

    // Try to load Scramjet config for proxy routing.
    // Don't let failure block internal pages, API proxy, or static files.
    // On early requests (before ScramjetController.init() populates IndexedDB),
    // loadConfig() may reject or set this.sj.config to undefined — either way
    // we skip proxy routing but keep everything else working.
    try {
      await this.sj.loadConfig();
    } catch (e) {
      console.warn("[DDXWorker] sj.loadConfig() failed:", e);
    }

    // Ensure WISP is configured on the first request (no-op after first success)
    await this.ensureWisp();

    if (this.isCfRequest(event.request.url))
      return new Response(null, { status: 204 }); // some CF support works if we just delete it lmfao

    // Internal page routing — anything under /internal/ gets resolved and served.
    // Enforce trailing slash for directory-style internal routes so that the
    // browser's base URL for relative path resolution is the directory itself
    // (e.g. /dist/internal/newtab/) and not its parent (/dist/internal/).
    // Without this, Vite's ../../ asset paths resolve one level too far up.
    if (this.isInternalRoute(relativePath)) {
      // If the path has no file extension and no trailing slash, redirect
      if (!/\.\w+$/.test(relativePath) && !relativePath.endsWith("/")) {
        const redirectUrl = new URL(event.request.url);
        redirectUrl.pathname += "/";
        return Response.redirect(redirectUrl.toString(), 301);
      }
      return this.serveInternalPage(relativePath);
    }

    // OPTIONS preflight for API routes
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

    // Prod API proxy — restored endpoints go to production backend
    if (this.shouldRestoreRequest(relativePath)) {
      return this.restoreRequest(event.request);
    }

    // Proxy engines — guarded so that config / routing failures never
    // prevent normal static-file requests from reaching the network.
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

  /**
   * Check if a base-stripped pathname matches a restored endpoint.
   * @param {string} relativePath - pathname with base already stripped (e.g. "/api/results/foo")
   */
  shouldRestoreRequest(relativePath) {
    return this.restoredEndpoints.some((endpoint) =>
      relativePath.startsWith(endpoint),
    );
  }

  async restoreRequest(request) {
    const originalUrl = new URL(request.url);
    // Strip base so production URL is always /api/... not /myapp/api/...
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

  /**
   * @param {string} relativePath - pathname with base already stripped
   */
  isInternalRoute(relativePath) {
    return relativePath.startsWith("/internal/");
  }

  resolveInternalHtml(relativePath) {
    // Normalize: strip trailing slash, then assume index.html
    const clean = relativePath.replace(/\/+$/, "");
    // If it already ends with a file extension, leave it alone
    if (/\.\w+$/.test(clean)) return clean;
    return `${clean}/index.html`;
  }

  /**
   * @param {string} relativePath - canonical path like "/internal/newtab/"
   */
  async serveInternalPage(relativePath) {
    const htmlRelative = this.resolveInternalHtml(relativePath);
    // Re-add base prefix for the actual network fetch / cache key
    const fetchPath = _base + htmlRelative.replace(/^\//, "");

    const cache = await caches.open(CACHE_NAME);

    // Network-first strategy: always try to get the latest HTML from the
    // network so that rebuilt assets (with new hashed filenames) are never
    // stale.  Fall back to cache only when the network is unavailable.
    try {
      const response = await fetch(fetchPath);
      if (response.ok) {
        cache.put(fetchPath, response.clone());
        // IMPORTANT: Wrap in a new Response so the browser uses the
        // intercepted request URL (with trailing slash) as the document
        // base for relative path resolution — NOT the fetch() response
        // URL (which points to the .html file).  Without this, ../../
        // in built asset paths resolves one level too far up.
        const body = await response.arrayBuffer();
        const hdrs = new Headers(response.headers);
        hdrs.set("Content-Type", "text/html; charset=utf-8");
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: hdrs,
        });
      }
      // Non-ok but not a network error — return as-is (e.g. 404)
      return response;
    } catch (err) {
      // Network failed — try the cache as a fallback
      const cached = await cache.match(fetchPath);
      if (cached) {
        console.warn(
          `[DDXWorker] Network failed for ${relativePath}, serving from cache`,
        );
        // Same wrapping for cached responses
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

// --- Lifecycle events ---

self.addEventListener("install", (event) => {
  console.log("[DDXWorker] Installing...");
  // No pre-cache list — internal pages are cached dynamically on first fetch,
  // same philosophy as Protocols: assume the route exists, serve it when asked.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[DDXWorker] Activating...");
  // Purge ALL caches (including our own internal-page cache) so that a new
  // SW deployment never serves stale HTML referencing old hashed assets.
  // With network-first strategy the cache is only a fallback anyway, so
  // clearing it on activate is safe — pages will be re-cached on first visit.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
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
  event.respondWith(
    ddx.handleRequest(event).catch((err) => {
      // Safety net: if anything unexpected throws in handleRequest, let the
      // browser handle the request normally instead of showing a network error.
      console.error("[DDXWorker] handleRequest failed, passing through:", err);
      return fetch(event.request);
    }),
  );
});
