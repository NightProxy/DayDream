import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import path from "path";
import obfuscatorPlugin from "vite-plugin-javascript-obfuscator";
import { viteStaticCopy } from "vite-plugin-static-copy";
import htmlMinify from "vite-plugin-html-minify";
import { fontObfuscationPlugin } from "./srv/vite/font";
// import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { prettyUrlsPlugin, pageRoutes } from "./srv/vite/routes";
import { copyRoutes, routePaths } from "./srv/vite/copy";
//import { cssObfuscationPlugin } from "./srv/vite/classnames";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    ViteMinifyPlugin(),
    prettyUrlsPlugin(),
    fontObfuscationPlugin(),
    viteStaticCopy(copyRoutes()),
    /*cssObfuscationPlugin({
      enabled: true,
      prefix: '_',
      exclude: [], // Add class names you want to exclude from obfuscation
      preserveClasses: [] // Add class names you want to preserve
    }),*/
    /*obfuscatorPlugin({
      options: {
        compact: true,
        controlFlowFlattening: false, // safer, more compatible
        deadCodeInjection: false,     // can break some code if true
        debugProtection: false,
        disableConsoleOutput: true,   // optionally strip console.* calls
        identifierNamesGenerator: 'hexadecimal',
        renameGlobals: false,         // can break scope-based logic
        renameProperties: false,      // breaks DOM & Tailwind if on
        selfDefending: false,         // makes debugging harder
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 10,
        stringArray: true,
        stringArrayThreshold: 0.75,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayEncoding: ['base64'],
        stringArrayWrappersType: 'variable',
        stringArrayWrappersCount: 1,
        target: 'browser',
        unicodeEscapeSequence: false,
        exclude: [
          `${routePaths.scramjet}/*`,
          `${routePaths.uv}/*`,
          "core/inspect.js",
          "epoxy/*",
          "libcurl/*",
          "baremux/*",
        ]
      }
    }),
    htmlMinify({
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      useShortDoctype: true,
      minifyCSS: true,
      minifyJS: false, // JS is obfuscated separately
    }),*/
  ],
  appType: "mpa",
  server: {
    allowedHosts: [
      "desert-checklist-treo-hdtv.trycloudflare.com",
      "significance-cindy-award-coated.trycloudflare.com"
    ],
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: pageRoutes(),
    },
  },
});
