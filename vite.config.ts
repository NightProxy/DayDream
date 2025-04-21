import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import { sync } from "glob";
import { resolve } from "path";

const pages: Record<string, string> = {
  index: resolve(__dirname, "index.html"),
};

const internalPages = sync("internal/**/index.html");

for (const path of internalPages) {
  const name = path.split("/")[1];
  pages[name] = resolve(__dirname, path);
}

function prettyUrlsPlugin() {
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

export default defineConfig({
  plugins: [tsconfigPaths(), ViteMinifyPlugin(), prettyUrlsPlugin()],
  appType: "mpa",
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: pages,
    },
  },
});
