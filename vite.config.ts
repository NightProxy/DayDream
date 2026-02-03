import { defineConfig } from "vite";
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
import { ContentInsertionPlugin } from "./srv/vite/contentInsertion";
import { allowedHosts } from "./srv/vite/hosts";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsconfigPaths({
      ignoreConfigErrors: true,
      projects: ["./tsconfig.json"],
    }),
    prettyUrlsPlugin(),
    fontObfuscationPlugin(),
    ContentInsertionPlugin(),
    viteStaticCopy(copyRoutes()),
    ViteMinifyPlugin(minifyConfig),
    vitePluginBundleObfuscator(obfuscationConfig as any),
    {
      name: "remove-debugger-statements",
      enforce: "post",
      generateBundle(_, bundle) {
        for (const file in bundle) {
          const chunk = bundle[file];
          if (chunk.type === "chunk" && chunk.code) {
            chunk.code = chunk.code.replace(/\bdebugger\s*;?/g, "");
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
        drop_console: process.env.NODE_ENV === "production",
        drop_debugger: true,
        hoist_funs: false, // Reduces processing time
        hoist_props: false, // Reduces processing time
        hoist_vars: false,
        inline: 1, // Reduced from 2 for faster builds
        join_vars: true,
        loops: true,
        passes: 1, // Reduced from 3 - single pass is much faster
        pure_funcs: [
          "console.log",
          "console.info",
          "console.debug",
          "console.warn",
        ],
        reduce_vars: false, // EXPENSIVE - disabled for performance
        sequences: true,
        side_effects: false,
        switches: true,
        top_retain: [],
        typeofs: false, // Reduces processing time
        unsafe: false,
        unsafe_arrows: false, // Conservative for compatibility
        unsafe_methods: false, // Conservative for compatibility
        unsafe_proto: false, // Conservative for compatibility
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
      maxWorkers: 4, // Parallel terser processing
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
        // Increase chunk size to reduce number of files to obfuscate
        experimentalMinChunkSize: 50000, // 50kb minimum
        assetFileNames: (assetInfo) => {
          if (
            assetInfo.name?.endsWith(".woff2") ||
            assetInfo.name?.endsWith(".ttf")
          ) {
            // Keep font files as-is for the font obfuscation system
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
    // Define environment variables for runtime obfuscation
    __OBFUSCATION_SEED__: JSON.stringify(
      Math.random().toString(36).substring(2),
    ),
    __BUILD_TIME__: JSON.stringify(Date.now()),
  },
});
