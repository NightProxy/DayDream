importScripts("/baremux/index.js");

const PROXIED_ENDPOINTS = ["/api/results/", "/api/plus/", "/api/store/", "/auth/"];

const PRODUCTION_BASE = "https://daydreamx.pro";

function shouldProxyRequest(url) {
  const urlObj = new URL(url);
  return PROXIED_ENDPOINTS.some((endpoint) =>
    urlObj.pathname.startsWith(endpoint),
  );
}

async function proxyRequest(request) {
  try {
    const client = new BareMux.BareClient();

    const originalUrl = new URL(request.url);
    const productionUrl = new URL(
      originalUrl.pathname + originalUrl.search,
      PRODUCTION_BASE,
    );

    const headers = {};
    for (const [key, value] of request.headers.entries()) {
      if (key.toLowerCase() !== "host") {
        headers[key] = value;
      }
    }

    const fetchOptions = {
      method: request.method,
      headers: headers,
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      fetchOptions.body = await request.clone().arrayBuffer();
    }

    const response = await client.fetch(productionUrl.toString(), fetchOptions);

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
    console.error("Error proxying request:", error);
    return new Response(
      JSON.stringify({
        error: "Proxy error",
        message: "Failed to proxy request to backend",
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

self.addEventListener("install", (event) => {
  console.log("[Static API Proxy SW] Installing...");
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("[Static API Proxy SW] Activating...");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (!shouldProxyRequest(event.request.url)) {
    return;
  }

  if (event.request.method === "OPTIONS") {
    event.respondWith(
      new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      }),
    );
    return;
  }

  console.log("[Static API Proxy SW] Proxying:", event.request.url);
  event.respondWith(proxyRequest(event.request));
});
