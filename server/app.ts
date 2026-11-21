import { Hono } from 'hono';
import { fetch as undiciFetch, type Dispatcher } from 'undici';
import { BYPASS_HEADER, describeProxy, dispatcherFor, envProxyUrl, PROXY_HEADER, validateProxyUrl } from './network';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

export interface AppOptions {
  /** Hostnames allowed in the Host header. `*` disables the check (only do this behind your own auth). */
  allowedHosts: string[];
  /** Directory of the built web app. Omit in dev (Vite serves it). */
  webDir?: string;
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
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function hostname(hostHeader: string | undefined): string {
  if (!hostHeader) return '';
  if (hostHeader.startsWith('[')) return hostHeader.slice(0, hostHeader.indexOf(']') + 1);
  return hostHeader.split(':')[0].toLowerCase();
}

export function createApp(opts: AppOptions) {
  const app = new Hono();
  const anyHost = opts.allowedHosts.includes('*');

  // Guard every API call:
  //  - Host must be ours (blocks DNS-rebinding attacks from random websites).
  //  - Origin, if sent, must match Host (blocks other sites from using this as an open proxy).
  app.use('/api/*', async (c, next) => {
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
  });

  app.get('/api/health', (c) => c.json({ ok: true, proxy: true, systemProxy: describeProxy(envProxyUrl()) ?? null }));

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
