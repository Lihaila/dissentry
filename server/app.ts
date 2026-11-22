import { Hono } from 'hono';
import { fetch as undiciFetch, type Dispatcher } from 'undici';
import { handleMcpHttpRequest } from './mcp';
import { BYPASS_HEADER, describeProxy, dispatcherFor, envProxyUrl, PROXY_HEADER, validateProxyUrl } from './network';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export interface AppOptions {
  /** Hostnames allowed in the Host header. `*` disables the check (only do this behind your own auth). */
  allowedHosts: string[];
  /** Directory of the built web app. Omit in dev (Vite serves it). */
  webDir?: string;
  /** Directory for local disk persistence (e.g. ~/.dissentry). Omit to disable disk backup. */
  dataDir?: string;
  /** Human-friendly display path for dataFile shown in Settings (e.g. ~/.dissentry/data.json). */
  dataFileDisplay?: string;
  /** Lock the built-in Streamable HTTP /mcp endpoint strictly to local models. */
  mcpLocalOnly?: boolean;
}

export const TARGET_HEADER = 'x-dissentry-target';

// Node's built-in fetch ignores proxy settings, so requests that need a proxy go through undici
// with an explicit dispatcher. The user picks the proxy in Settings; it arrives per request.
const upstreamFetch = (url: URL, init: Record<string, unknown>, dispatcher?: Dispatcher) =>
  (dispatcher ? undiciFetch(url, { ...init, dispatcher } as never) : fetch(url, init as RequestInit)) as Promise<Response>;

// Headers we never forward upstream: hop-by-hop, browser identity, and our own control headers.
const STRIP_REQUEST = new Set([
  'host', 'origin', 'referer', 'cookie', 'connection', 'content-length', 'accept-encoding',
  'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
  TARGET_HEADER, PROXY_HEADER, BYPASS_HEADER,
]);
const STRIP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie']);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function hostname(hostHeader: string | undefined): string {
  if (!hostHeader) return '';
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1);
  return hostHeader.split(':')[0].toLowerCase();
}

export function createApp(opts: AppOptions) {
  const app = new Hono();
  const anyHost = opts.allowedHosts.includes('*');

  // Guard every API and MCP call:
  //  - Host must be ours (blocks DNS-rebinding attacks from random websites).
  //  - Origin, if sent, must match Host (blocks other sites from using this as an open proxy or MCP client).
  const guardLocal = async (c: Parameters<Parameters<typeof app.use>[1]>[0], next: () => Promise<void>) => {
    const host = c.req.header('host');
    if (!anyHost && !opts.allowedHosts.includes(hostname(host))) {
      return c.json({ error: 'Host not allowed' }, 403);
    }
    const origin = c.req.header('origin');
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { /* invalid */ }
      if (originHost !== host) return c.json({ error: 'Cross-origin requests are not allowed' }, 403);
    }
    await next();
  };
  app.use('/api/*', guardLocal);
  app.use('/mcp', guardLocal);

  // Built-in Streamable HTTP MCP endpoint so DSH, WorkBuddy, Qwen Work/Code, Claude Code, and Cursor
  // can connect directly to http://127.0.0.1:4317/mcp whenever `npx dissentry` is running.
  app.all('/mcp', (c) => handleMcpHttpRequest(c.req.raw, { dataDir: opts.dataDir, forceLocalOnly: opts.mcpLocalOnly }));

  const dataFile = opts.dataDir ? join(opts.dataDir, 'data.json') : undefined;

  app.get('/api/health', (c) => c.json({
    ok: true,
    proxy: true,
    mcp: '/mcp',
    systemProxy: describeProxy(envProxyUrl()) ?? null,
    storage: Boolean(dataFile),
    dataFile: dataFile ? (opts.dataFileDisplay ?? dataFile) : null,
  }));

  if (opts.dataDir && dataFile) {
    const dir = opts.dataDir;
    const file = dataFile;
    app.get('/api/storage', async (c) => {
      try {
        const raw = await readFile(file, 'utf8');
        return c.body(raw, 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      } catch (e) {
        if ((e as { code?: string }).code === 'ENOENT') return c.json({ empty: true }, 200);
        return c.json({ error: (e as Error).message }, 500);
      }
    });

    app.put('/api/storage', async (c) => {
      const raw = await c.req.text();
      if (raw.length > 100 * 1024 * 1024) return c.json({ error: 'Payload too large' }, 413);
      let parsed: { app?: string };
      try { parsed = JSON.parse(raw); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
      if (parsed?.app !== 'dissentry') return c.json({ error: 'Not a Dissentry snapshot' }, 400);
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, raw, { encoding: 'utf8', mode: 0o600 });
      await rename(tmp, file);
      return c.json({ ok: true, savedAt: Date.now() });
    });

    app.delete('/api/storage', async (c) => {
      await rm(file, { force: true });
      return c.json({ ok: true });
    });
  }

  // Stateless pass-through. Keys travel in the request headers and are never stored or logged.
  app.all('/api/proxy', async (c) => {
    const target = c.req.header(TARGET_HEADER);
    let url: URL;
    try { url = new URL(target ?? ''); } catch { return c.json({ error: `Missing or invalid ${TARGET_HEADER}` }, 400); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return c.json({ error: 'Only http(s) targets' }, 400);

    const proxyMode = c.req.header(PROXY_HEADER);
    if (proxyMode && proxyMode !== 'system' && proxyMode !== 'direct') {
      const bad = validateProxyUrl(proxyMode);
      if (bad) return c.json({ error: { message: bad } }, 400);
    }
    let dispatcher: Dispatcher | undefined;
    try { dispatcher = dispatcherFor(url, proxyMode, c.req.header(BYPASS_HEADER) ?? ''); }
    catch (e) { return c.json({ error: { message: `Invalid proxy: ${(e as Error).message}` } }, 400); }
    const via = dispatcher ? ` via proxy ${describeProxy(proxyMode && proxyMode !== 'system' ? proxyMode : envProxyUrl())}` : '';

    const headers = new Headers();
    c.req.raw.headers.forEach((v, k) => { if (!STRIP_REQUEST.has(k.toLowerCase())) headers.set(k, v); });

    const method = c.req.method;
    const hasBody = method !== 'GET' && method !== 'HEAD';
    let upstream: Response;
    try {
      upstream = await upstreamFetch(url, {
        method,
        headers,
        body: hasBody ? c.req.raw.body : undefined,
        signal: c.req.raw.signal,
        redirect: 'follow',
        duplex: hasBody ? 'half' : undefined, // required for streamed request bodies
      }, dispatcher);
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause;
      const code = cause?.code ?? '';
      const detail = code === 'ECONNREFUSED'
        ? (via ? 'the proxy refused the connection. Is it running?' : 'connection refused. Is the server running?')
        : !via && /ECONNRESET|TIMEOUT|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH/.test(code)
          ? `${cause?.message ?? code}. The provider may be blocked on your network: set a proxy in Settings → Network proxy.`
        : /TIMEOUT/.test(code) ? 'timed out through the proxy'
        : (cause?.message ?? (e as Error).message);
      return c.json({ error: { message: `Could not reach ${url.host}${via}: ${detail}` } }, 502);
    }
    const out = new Headers();
    upstream.headers.forEach((v, k) => { if (!STRIP_RESPONSE.has(k.toLowerCase())) out.set(k, v); });
    out.set('cache-control', 'no-store');
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
  });

  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

  if (opts.webDir) {
    const root = normalize(opts.webDir);
    app.get('*', async (c) => {
      const reqPath = decodeURIComponent(new URL(c.req.url).pathname);
      let file = normalize(join(root, reqPath));
      if (file !== root && !file.startsWith(root + sep)) return c.text('Forbidden', 403);
      let isFile = false;
      try { isFile = (await stat(file)).isFile(); } catch { /* missing */ }
      if (!isFile) file = join(root, 'index.html'); // SPA fallback
      const body = await readFile(file);
      const type = MIME[extname(file)] ?? 'application/octet-stream';
      const immutable = file.includes(`${sep}assets${sep}`);
      return c.body(body, 200, {
        'content-type': type,
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      });
    });
  }

  return app;
}
