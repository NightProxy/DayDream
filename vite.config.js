import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    rollupOptions: {
      input: {
        index: "index.html",
        settings: "internal/settings/index.html",
        error: "internal/error/index.html",
        games: "internal/games/index.html",
        newtab: "internal/newtab/index.html",
        extensions: "internal/extensions/index.html",
        history: "internal/history/index.html",
      },
    },
  },
});
