import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app';

const app = createApp({ allowedHosts: ['localhost'], webDir: join(import.meta.dirname, '..', 'public') });
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
  it('serves webp landing assets with image/webp MIME type', async () => {
    const r = await req('/landing/thread.webp');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/webp');
  });
});

describe('local disk persistence API', () => {
  it('saves, reads, and deletes snapshots atomically with owner-only permissions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dissentry-store-'));
    try {
      const sApp = createApp({ allowedHosts: ['localhost'], dataDir: dir, dataFileDisplay: '~/.dissentry/data.json' });
      const call = (path: string, init: RequestInit = {}) =>
        sApp.request(`http://localhost:4317${path}`, { ...init, headers: { host: 'localhost:4317', ...(init.headers as Record<string, string>) } });

      const health = await (await call('/api/health')).json();
      expect(health.storage).toBe(true);
      expect(health.dataFile).toBe('~/.dissentry/data.json');

      expect(await (await call('/api/storage')).json()).toEqual({ empty: true });

      const bad = await call('/api/storage', { method: 'PUT', body: JSON.stringify({ app: 'other' }) });
      expect(bad.status).toBe(400);

      const snapshot = { app: 'dissentry', version: 1, profiles: [{ id: 'p1', handle: 'llama', apiKey: 'k' }], posts: [] };
      const put = await call('/api/storage', { method: 'PUT', body: JSON.stringify(snapshot) });
      expect(put.status).toBe(200);

      const mode = statSync(join(dir, 'data.json')).mode & 0o777;
      expect(mode).toBe(0o600);

      const loaded = await (await call('/api/storage')).json();
      expect(loaded).toEqual(snapshot);

      const del = await call('/api/storage', { method: 'DELETE' });
      expect(del.status).toBe(200);
      expect(await (await call('/api/storage')).json()).toEqual({ empty: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
