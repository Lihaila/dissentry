import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'server/index.ts',
    mcp: 'server/mcp-cli.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  splitting: true,
  minify: true,
  clean: true,
  external: ['hono', '@hono/node-server', 'undici'],
  // Allow CJS-style dynamic require() inside bundled third-party SDK helpers (e.g. @vercel/oidc).
  banner: {
    js: "import { createRequire as __dissentryCreateRequire } from 'node:module'; const require = __dissentryCreateRequire(import.meta.url);",
  },
});
