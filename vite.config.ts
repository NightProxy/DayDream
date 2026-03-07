import { defineConfig } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { minify } from "terser";
import tsconfigPaths from "vite-tsconfig-paths";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { ViteMinifyPlugin } from "vite-plugin-minify";
import vitePluginBundleObfuscator from "vite-plugin-bundle-obfuscator";
import { fontObfuscationPlugin } from "./srv/vite/font";
import { prettyUrlsPlugin, pageRoutes } from "./srv/vite/routes";
import { copyRoutes } from "./srv/vite/copy";
import tailwindcss from "@tailwindcss/vite";
import { obfuscationConfig } from "./srv/vite/obfusc-config";
import { minifyConfig } from "./srv/vite/minify-config";
import { allowedHosts } from "./srv/vite/hosts";
import { svgWrapperPlugin } from "./srv/vite/svg";

export default defineConfig({
  base: "./",
  plugins: [
    tailwindcss(),
    tsconfigPaths({
      ignoreConfigErrors: true,
      projects: ["./tsconfig.json"],
    }),
    prettyUrlsPlugin(),
    fontObfuscationPlugin(),
    viteStaticCopy(copyRoutes()),
    ViteMinifyPlugin(minifyConfig),
    vitePluginBundleObfuscator(obfuscationConfig as any),
    svgWrapperPlugin(),
    {
      name: "strip-console-and-debugger",
      enforce: "post",
      generateBundle(_, bundle) {
        for (const file in bundle) {
          const chunk = bundle[file];
          if (chunk.type === "chunk" && chunk.code) {
            chunk.code = chunk.code.replace(/\bdebugger\s*;?/g, "");
          }
        }
      },
      async closeBundle() {
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const outDir = resolve(__dirname, "dist");

        // Files in public/ and font runtime bypass terser — process them here
        // sw.js has a console polyfill that preserves warn/error, so we only
        // strip the other console methods (drop_console would kill the polyfill)
        const swPath = resolve(outDir, "sw.js");
        if (existsSync(swPath)) {
          const code = readFileSync(swPath, "utf-8");
          const result = await minify(code, {
            compress: {
              drop_debugger: true,
              pure_funcs: [
                "console.log",
                "console.info",
                "console.debug",
                "console.trace",
                "console.dir",
                "console.table",
                "console.count",
                "console.time",
                "console.timeEnd",
                "console.timeLog",
                "console.group",
                "console.groupEnd",
                "console.groupCollapsed",
                "console.clear",
                "console.profile",
                "console.profileEnd",
              ],
            },
            mangle: false,
            format: {
              comments: false,
              beautify: false,
            },
          });
          if (result.code) {
            writeFileSync(swPath, result.code, "utf-8");
          }
        }

        // ob-fonts.js has no polyfill — strip all console calls aggressively
        const obFontsPath = resolve(outDir, "ob-fonts.js");
        if (existsSync(obFontsPath)) {
          const code = readFileSync(obFontsPath, "utf-8");
          const result = await minify(code, {
            compress: {
              drop_console: true,
              drop_debugger: true,
              pure_funcs: [
                "console.log",
                "console.info",
                "console.debug",
                "console.warn",
                "console.error",
              ],
            },
            mangle: false,
            format: {
              comments: false,
              beautify: false,
            },
          });
          if (result.code) {
            writeFileSync(obFontsPath, result.code, "utf-8");
          }
        }
      },
    },
  ],
  appType: "mpa",
  server: {
    allowedHosts: allowedHosts,
    watch: {
      ignored: [
        "**/concepting/**",
        "**/plus-backend/**",
        "**/.github/**",
        "**/hostlist.uo*",
      ],
    },
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
      "/auth": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    emptyOutDir: true,
    target: ["es2020", "chrome80", "firefox78", "safari14"],
    minify: "terser",
    terserOptions: {
      compress: {
        arguments: true,
        drop_console: true,
        drop_debugger: true,
        hoist_funs: false,
        hoist_props: false,
        hoist_vars: false,
        inline: 1,
        join_vars: true,
        loops: true,
        passes: 1,
        pure_funcs: [
          "console.log",
          "console.info",
          "console.debug",
          "console.warn",
          "console.error",
        ],
        reduce_vars: false,
        sequences: true,
        side_effects: false,
        switches: true,
        top_retain: [],
        typeofs: false,
        unsafe: false,
        unsafe_arrows: false,
        unsafe_methods: false,
        unsafe_proto: false,
        unused: true,
      },
      mangle: {
        properties: false,
        toplevel: true,
        safari10: false,
      },
      format: {
        comments: false,
        beautify: false,
        preserve_annotations: false,
      },
      maxWorkers: 4,
    },
    rollupOptions: {
      input: pageRoutes(),
      output: {
        entryFileNames: (chunkInfo) => {
          const hash = Math.random().toString(36).substring(2, 12);
          return `${hash}.js`;
        },
        chunkFileNames: (chunk) => {
          if (chunk.name === "vendor-modules") {
            const hash = Math.random().toString(36).substring(2, 10);
            return `chunks/vendor-${hash}.js`;
          }
          const hash = Math.random().toString(36).substring(2, 12);
          return `chunks/${hash}.js`;
        },
        experimentalMinChunkSize: 50000,
        assetFileNames: (assetInfo) => {
          if (
            assetInfo.name?.endsWith(".woff2") ||
            assetInfo.name?.endsWith(".ttf")
          ) {
            return `assets/${assetInfo.name}`;
          }
          const hash = Math.random().toString(36).substring(2, 12);
          const ext = assetInfo.name?.split(".").pop();
          return `assets/${hash}.${ext}`;
        },
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor-modules";
        },
      },
    },
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
  },
  esbuild: {
    legalComments: "none",
    treeShaking: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    target: "es2020",
  },
  css: {
    modules: {
      generateScopedName: () => {
        const chars = "abcdefghijklmnopqrstuvwxyz";
        const numbers = "0123456789";
        let result = chars[Math.floor(Math.random() * chars.length)];

        for (let i = 0; i < 7; i++) {
          const useNumber = Math.random() > 0.7;
          const charset = useNumber ? numbers : chars;
          result += charset[Math.floor(Math.random() * charset.length)];
        }

        return result;
      },
    },
  },
  define: {
    __OBFUSCATION_SEED__: JSON.stringify(
      Math.random().toString(36).substring(2),
    ),
    __BUILD_TIME__: JSON.stringify(Date.now()),
  },
});
