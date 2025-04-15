import { defineConfig } from 'vite';

export default defineConfig({
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