import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import { sync } from "glob";
import { resolve } from "path";
import path from "path";
import fs from "fs";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { URL } from "url";

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


function UVSystem() {
  return {
    name: "dev-file-alias-middleware",
    configureServer(server) {
      console.log("uvPath resolved to:", uvPath);
      console.log("Expected file:", path.join(uvPath, "uv.bundle.js"));

      const filenameMapping = {
        "bundle.js": "uv.bundle.js",
        "handler.js": "uv.handler.js",
        "client.js": "uv.client.js",
        "config.js": "uv.config.js",
        "sww.js": "uv.sw.js",
      };

      server.middlewares.use("/@", (req, res, next) => {
        const parsedUrl = new URL(req.url, "http://localhost");
        // Get the pathname and remove "/@/"
        const requestedFile = parsedUrl.pathname.slice(1); // removes "/@/"
        console.log("Requested file:", req.url);
        console.log("Parsed URL:", parsedUrl);
        console.log("Requested:", requestedFile);

        const mappedFileName = filenameMapping[requestedFile];
        if (mappedFileName) {
          const filePath = path.join(uvPath, mappedFileName);
          console.log("Mapped to:", mappedFileName);
          console.log("File path:", filePath);

            // Set the response header for JavaScript files
            res.setHeader("Content-Type", "application/javascript");

            // Use createReadStream to send the file
            fs.createReadStream(filePath)
              .on('error', (err) => {
                res.statusCode = 500;
                res.end("Server error: " + err.message);
              })
              .pipe(res); // Pipe the file stream to the response
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    ViteMinifyPlugin(),
    prettyUrlsPlugin(),
    UVSystem(),
  ],
  appType: "mpa",
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: pages,
    },
  },
});
