import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    rollupOptions: {
      input: {
        index: 'public/index.html',
        settings: 'public/internal/settings/index.html',
        error: 'public/internal/error/index.html',
        games: 'public/internal/games/index.html',
        newtab: 'public/internal/newtab/index.html',
        extensions: 'public/internal/extensions/index.html',
        history: 'public/internal/history/index.html',
      },
    },
  },
});