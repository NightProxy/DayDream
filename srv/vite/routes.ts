import { sync } from "glob";
import { resolve } from "path";

export function prettyUrlsPlugin() {
  return {
    name: "vite-plugin-pretty-urls",
    configureServer(server: any) {
      server.middlewares.use((req: any, _res: any, next: any) => {
        const originalUrl = req.url;
        const routeOnly = req.url ? req.url.split("?")[0] : "";
        const query = req.url?.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
        if (
          routeOnly &&
          /^\/internal\/[^/]+$/.test(routeOnly) &&
          !routeOnly.endsWith(".html")
        ) {
          req.url = `${routeOnly}/index.html${query}`;
        }

        const resolvedRoute = (req.url || "").split("?")[0];
        const internalMatch = resolvedRoute.match(/^\/internal\/([^/]+)\/index\.html$/);

        if (internalMatch) {
          const page = internalMatch[1];
          const mapped = `/src/pages/${page}/index.html${query}`;
          const beforeMap = req.url;
          req.url = mapped;
        } else if (req.url && req.url.startsWith("/internal")) {
          // No rewrite needed
        }
        next();
      });
    },
  };
}
export function pageRoutes() {
  const pages: Record<string, string> = {
    index: resolve(__dirname, "../../index.html"),
  };

  const internalPages = sync("src/pages/**/index.html", {
    cwd: resolve(__dirname, "../.."),
  });

  for (const filePath of internalPages) {
    const match = filePath.match(/^src\/pages\/([^/]+)\/index\.html$/);
    if (!match) continue;
    const name = match[1];
    const routeKey = `internal/${name}/index`;
    const resolvedPath = resolve(__dirname, "../../", filePath);
    pages[routeKey] = resolvedPath;
  }
  return pages;
}
