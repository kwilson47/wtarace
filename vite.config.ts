/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** In development, /players/, /tournaments/ and their pages (built by scripts/prerender.ts for real) serve their templates. */
function devPlayerPages(): Plugin {
  return {
    name: 'dev-player-pages',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        const player = /^\/players\/([a-z0-9-]+)\/?$/.exec(path);
        const tournament = /^\/tournaments\/([a-z0-9-]+)\/?$/.exec(path);
        if (player) req.url = `/player.html?id=${player[1]}`;
        else if (tournament) req.url = `/tournament.html?id=${tournament[1]}`;
        else if (/^\/(players|tournaments)\/?$/.test(path)) req.url = `/list.html?page=${path.includes('players') ? 'players' : 'tournaments'}`;
        next();
      });
    },
  };
}

// Page templates: the homepage, player pages, tournament pages and the two index pages (list.html).
// scripts/prerender.ts fills them after the build (and writes the sitemap).
export default defineConfig({
  plugins: [react(), devPlayerPages()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        player: fileURLToPath(new URL('./player.html', import.meta.url)),
        tournament: fileURLToPath(new URL('./tournament.html', import.meta.url)),
        list: fileURLToPath(new URL('./list.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
