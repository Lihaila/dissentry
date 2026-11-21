import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';

const app = createApp({ allowedHosts: ['localhost'] });
const req = (path: string, headers: Record<string, string> = {}, init: RequestInit = {}) =>
  app.request(`http://localhost:4317${path}`, { ...init, headers: { host: 'localhost:4317', ...headers } });

describe('server guard', () => {
  it('serves health on localhost', async () => {
    expect((await req('/api/health')).status).toBe(200);
  });
  it('rejects foreign Host headers (DNS rebinding)', async () => {
    expect((await req('/api/health', { host: 'evil.example:4317' })).status).toBe(403);
  });
  it('rejects cross-origin requests', async () => {
    expect((await req('/api/proxy', { origin: 'https://evil.example', 'x-dissentry-target': 'https://example.com' })).status).toBe(403);
  });
  it('requires an http(s) target', async () => {
    expect((await req('/api/proxy', { 'x-dissentry-target': 'file:///etc/passwd' })).status).toBe(400);
    expect((await req('/api/proxy')).status).toBe(400);
  });
  it('reports unreachable upstreams clearly', async () => {
    const r = await req('/api/proxy', { origin: 'http://localhost:4317', 'x-dissentry-target': 'http://127.0.0.1:9/v1/models' });
    expect(r.status).toBe(502);
    expect((await r.json()).error.message).toMatch(/127\.0\.0\.1:9/);
  });
});
