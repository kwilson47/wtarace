/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** In development, /players/<id>/ (built by scripts/prerender.ts for real) serves the player template. */
function devPlayerPages(): Plugin {
  return {
    name: 'dev-player-pages',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const match = /^\/players\/([a-z0-9-]+)\/?$/.exec(req.url?.split('?')[0] ?? '');
        if (match) req.url = `/player.html?id=${match[1]}`;
        next();
      });
    },
  };
}

// Two page templates: the homepage and the player page. scripts/prerender.ts fills them after the build
// (and writes the sitemap).
export default defineConfig({
  plugins: [react(), devPlayerPages()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        player: fileURLToPath(new URL('./player.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
