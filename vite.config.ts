import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { getRequestListener } from '@hono/node-server';
import { createApp } from './server/app.ts';

// In dev, mount the same Hono API (proxy + health) inside Vite so `npm run dev` is one process.
function dissentryApi(): Plugin {
  return {
    name: 'dissentry-api',
    configureServer(server) {
      const app = createApp({ allowedHosts: ['localhost', '127.0.0.1', '[::1]'] });
      const listener = getRequestListener(app.fetch);
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/api/')) listener(req, res);
        else next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dissentryApi()],
  build: { outDir: 'dist/web', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  test: { environment: 'node' },
} as never);
