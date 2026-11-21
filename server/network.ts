import { EnvHttpProxyAgent, ProxyAgent, Socks5ProxyAgent, type Dispatcher } from 'undici';

export const PROXY_HEADER = 'x-dissentry-proxy';
export const BYPASS_HEADER = 'x-dissentry-proxy-bypass';

const ENV_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy'];
export const envProxyUrl = (): string | undefined => ENV_KEYS.map((k) => process.env[k]).find(Boolean);

/** host:port of a proxy URL, without credentials (safe to show in the UI). */
export function describeProxy(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { const u = new URL(url); return `${u.protocol}//${u.host}`; } catch { return 'invalid'; }
}

/** Validate a user-supplied proxy URL. Returns an error message or null. */
export function validateProxyUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return 'Proxy must be a URL like http://127.0.0.1:7890 or socks5://127.0.0.1:1080'; }
  if (!['http:', 'https:', 'socks5:', 'socks5h:', 'socks:'].includes(u.protocol)) return `Unsupported proxy type "${u.protocol}" (use http, https or socks5)`;
  if (!u.hostname || !u.port && u.protocol.startsWith('socks')) return 'Proxy URL needs a host and port';
  return null;
}

/** Does `host` match a bypass list like "localhost, 127.0.0.1, *.aliyuncs.com, .deepseek.com"? */
export function isBypassed(host: string, bypass: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return bypass.split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean).some((rule) => {
    if (rule === '*') return true;
    const r = rule.replace(/^\*\./, '.').replace(/^\[|\]$/g, '');
    return r.startsWith('.') ? h === r.slice(1) || h.endsWith(r) : h === r;
  });
}

const cache = new Map<string, Dispatcher>();
let envAgent: Dispatcher | undefined;

function agentFor(raw: string): Dispatcher {
  let agent = cache.get(raw);
  if (agent) return agent;
  const u = new URL(raw);
  const username = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  if (u.protocol.startsWith('socks')) {
    const clean = `socks5://${u.hostname}:${u.port || 1080}`;
    agent = new Socks5ProxyAgent(clean, username ? { username, password } : undefined);
  } else {
    const clean = `${u.protocol}//${u.host}`;
    agent = new ProxyAgent({
      uri: clean,
      ...(username ? { token: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` } : {}),
    });
  }
  if (cache.size > 8) cache.clear(); // users rarely switch proxies; keep it bounded
  cache.set(raw, agent);
  return agent;
}

/**
 * Pick the dispatcher for one upstream request.
 *  mode header absent / "system": use HTTPS_PROXY etc. if set (NO_PROXY respected), else direct
 *  "direct": no proxy
 *  any URL: that proxy, unless the target host is in the bypass list
 * Local addresses are always reached directly.
 */
export function dispatcherFor(target: URL, mode: string | undefined, bypass = ''): Dispatcher | undefined {
  const host = target.hostname;
  if (isBypassed(host, 'localhost, 127.0.0.1, ::1, host.docker.internal')) return undefined;
  const m = (mode ?? '').trim();
  if (m === 'direct') return undefined;
  if (!m || m === 'system') {
    if (!envProxyUrl()) return undefined;
    return (envAgent ??= new EnvHttpProxyAgent());
  }
  if (isBypassed(host, bypass)) return undefined;
  return agentFor(m);
}
