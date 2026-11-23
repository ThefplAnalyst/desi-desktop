import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const page = (path: string) => fileURLToPath(new URL(`app/${path}`, import.meta.url));

// Multipage build (spec 4.3): /, /help/, /about/, /privacy/ and the 404 page
// that the assets-only Worker serves for unknown paths (spec 6.8).
export default defineConfig({
  root: 'app',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // No polyfill: it is dead weight for supported browsers and keeps JS small (NFR-PERF).
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: {
        index: page('index.html'),
        help: page('help/index.html'),
        about: page('about/index.html'),
        privacy: page('privacy/index.html'),
        notFound: page('404.html'),
      },
    },
  },
  preview: { port: 4173, strictPort: true },
});
