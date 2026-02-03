if (navigator.userAgent.includes("Firefox")) {
  Object.defineProperty(globalThis, "crossOriginIsolated", {
    value: true,
    writable: false,
  });
}

importScripts("/assets/all.js");
importScripts("/data/config.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();

const BLOCK_RULES = ["**/cdn-cgi/**"];

function wildcardToRegex(pattern) {
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

const BLOCK_REGEX = BLOCK_RULES.map(wildcardToRegex);
const isAdRequest = (url) => BLOCK_REGEX.some((rule) => rule.test(url));

async function handleRequest(event) {
  await scramjet.loadConfig();
  if (isAdRequest(event.request.url))
    return new Response(null, { status: 204 });
  if (scramjet.route(event)) {
    return scramjet.fetch(event);
  }

  return fetch(event.request);
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});
