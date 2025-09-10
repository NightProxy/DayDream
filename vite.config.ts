import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import path from "path";
import obfuscatorPlugin from "vite-plugin-javascript-obfuscator";
import vitePluginBundleObfuscator from "vite-plugin-bundle-obfuscator";
import { viteStaticCopy } from "vite-plugin-static-copy";
import htmlMinify from "vite-plugin-html-minify";
import { fontObfuscationPlugin } from "./srv/vite/font";

import { prettyUrlsPlugin, pageRoutes } from "./srv/vite/routes";
import { copyRoutes, routePaths } from "./srv/vite/copy";

import tailwindcss from "@tailwindcss/vite";
import { obfuscationConfig } from "./srv/vite/obfusc-config";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    ViteMinifyPlugin(),
    prettyUrlsPlugin(),
    fontObfuscationPlugin(),
    viteStaticCopy(copyRoutes()),

    vitePluginBundleObfuscator(obfuscationConfig) as any,
    htmlMinify({
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      useShortDoctype: true,
      minifyCSS: true,
      minifyJS: false,
    }),
  ],
  appType: "mpa",
  server: {
    allowedHosts: [
      "desert-checklist-treo-hdtv.trycloudflare.com",
      "significance-cindy-award-coated.trycloudflare.com",
    ],
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/wisp/": {
        target: "ws://localhost:8080/wisp/",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/wisp\//, ""),
      },
    },
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: pageRoutes(),
      output: {
        entryFileNames: "[hash].js",
        chunkFileNames: (chunk) => {
          if (chunk.name === "vendor-modules")
            return "chunks/vendor-modules.js";
          return "chunks/[hash].js";
        },
        assetFileNames: "assets/[hash].[ext]",
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor-modules";
        },
      },
    },
  },
  esbuild: {
    legalComments: "none",
  },
  css: {
    modules: {
      generateScopedName: () => {
        return (
          String.fromCharCode(97 + Math.floor(Math.random() * 17)) +
          Math.random().toString(36).substring(2, 8)
        );
      },
    },
  },
});
