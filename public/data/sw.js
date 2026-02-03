importScripts("/data/bundle.js");
importScripts("/data/config.js");
importScripts(__uv$config.sw || "/data/worker.js");

const uv = new UVServiceWorker();

const INTERNAL_PATHS = ["/core/"];
const isInternalPath = (url) => {
  try {
    const urlObj = new URL(url);
    return INTERNAL_PATHS.some((path) => urlObj.pathname.startsWith(path));
  } catch {
    return false;
  }
};

async function handleRequest(event) {
  if (isInternalPath(event.request.url)) return await fetch(event.request);
  if (uv.route(event)) {
    return await uv.fetch(event);
  }

  return await fetch(event.request);
}

self.addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event));
});
