import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'server/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: false,
  external: ['hono', '@hono/node-server', 'undici'],
});
