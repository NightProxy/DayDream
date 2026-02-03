import { sync } from "glob";
import { resolve } from "path";

export function prettyUrlsPlugin() {
  return {
    name: "vite-plugin-pretty-urls",
    configureServer(server: any) {
      server.middlewares.use((req: any, _res: any, next: any) => {
        if (
          req.url &&
          /^\/internal\/[^/]+$/.test(req.url) &&
          !req.url.endsWith(".html")
        ) {
          req.url += "/index.html";
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

  const internalPages = sync("internal/**/index.html", {
    cwd: resolve(__dirname, "../.."),
  });

  for (const path of internalPages) {
    const name = path.split("/")[1];
    pages[name] = resolve(__dirname, "../../", path);
  }
  return pages;
}
