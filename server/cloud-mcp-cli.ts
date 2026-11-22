import { serve } from '@hono/node-server';
import { createCloudMcpApp } from './cloud-mcp';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 8795);
const publicOrigin = (process.env.DISSENTRY_PUBLIC_ORIGIN ?? 'https://dissentry.lihaila.com').replace(/\/+$/, '');
const secret = process.env.DISSENTRY_CLOUD_SECRET ?? '';

if (!secret || secret.length < 32) {
  console.error('Fatal: DISSENTRY_CLOUD_SECRET must be set (at least 32 characters).');
  process.exit(1);
}

const app = createCloudMcpApp({ publicOrigin, secret });

serve({ fetch: app.fetch, hostname: host, port }, (info) => {
  console.log(`Dissentry Cloud MCP listening on http://${host}:${info.port} (public: ${publicOrigin}/v1/mcp)`);
});
