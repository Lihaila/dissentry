import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { getSettings } from './settings';
import type { Profile } from './types';

const TARGET_HEADER = 'x-dissentry-target';

let proxyAvailable: boolean | null = null;
let systemProxy: string | null = null;
/** Proxy found in the server's environment (HTTPS_PROXY etc.), as protocol://host:port. */
export const getSystemProxy = () => systemProxy;

/** Is the local Dissentry server present? (false when the app is hosted as static files.) */
export async function detectProxy(): Promise<boolean> {
  if (proxyAvailable !== null) return proxyAvailable;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const j = r.ok ? await r.json() : {};
    proxyAvailable = j.proxy === true;
    systemProxy = j.systemProxy ?? null;
  } catch {
    proxyAvailable = false;
  }
  return proxyAvailable;
}
export const hasProxy = () => proxyAvailable === true;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** fetch that sends the request to our local server, which forwards it to the real URL. */
export const proxyFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set(TARGET_HEADER, urlOf(input));
  const s = getSettings();
  if (s.proxyMode === 'direct') headers.set('x-dissentry-proxy', 'direct');
  else if (s.proxyMode === 'custom' && s.proxyUrl.trim()) {
    headers.set('x-dissentry-proxy', s.proxyUrl.trim());
    if (s.proxyBypass.trim()) headers.set('x-dissentry-proxy-bypass', s.proxyBypass.trim());
  }
  return fetch('/api/proxy', {
    ...init,
    method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
    headers,
    body: init?.body ?? (input instanceof Request ? input.body : undefined),
  });
};

export const fetchFor = (p: Profile): typeof fetch => (p.useProxy && hasProxy() ? proxyFetch : fetch);

const trimSlash = (s: string) => s.replace(/\/+$/, '');

export function languageModel(p: Profile, fetchImpl?: typeof fetch) {
  const f = fetchImpl ?? fetchFor(p);
  const baseURL = trimSlash(p.baseUrl);
  switch (p.protocol) {
    case 'anthropic':
      return createAnthropic({
        apiKey: p.apiKey,
        baseURL,
        fetch: f,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(p.modelId);
    case 'google':
      return createGoogle({ apiKey: p.apiKey, baseURL, fetch: f })(p.modelId);
    default:
      return createOpenAICompatible({
        name: p.handle || 'custom',
        baseURL,
        apiKey: p.apiKey || undefined,
        fetch: f,
        includeUsage: true,
      })(p.modelId);
  }
}

/** List model IDs available to this profile's key. */
export async function listModels(p: Pick<Profile, 'protocol' | 'baseUrl' | 'apiKey' | 'useProxy'>): Promise<string[]> {
  const f = p.useProxy && hasProxy() ? proxyFetch : fetch;
  const base = trimSlash(p.baseUrl);
  let res: Response;
  if (p.protocol === 'anthropic') {
    res = await f(`${base}/models?limit=100`, {
      headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    });
  } else if (p.protocol === 'google') {
    res = await f(`${base}/models?pageSize=200`, { headers: { 'x-goog-api-key': p.apiKey } });
  } else {
    res = await f(`${base}/models`, { headers: p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {} });
  }
  if (!res.ok) throw new Error(await errorText(res));
  const json = await res.json();
  if (p.protocol === 'google') {
    return (json.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: { name: string }) => m.name.replace(/^models\//, ''));
  }
  return (json.data ?? json.models ?? []).map((m: { id?: string; name?: string }) => m.id ?? m.name ?? '').filter(Boolean).sort();
}

async function errorText(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  try {
    const j = JSON.parse(body);
    const msg = j.error?.message ?? j.error ?? j.message;
    if (msg) return `${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
  } catch { /* not json */ }
  return `${res.status} ${res.statusText}${body ? `: ${body.slice(0, 200)}` : ''}`;
}

/** Turn SDK / network errors into something a user can act on. */
export function friendlyError(e: unknown, p: Profile): string {
  const err = e as { message?: string; statusCode?: number; responseBody?: string; name?: string };
  if (err?.name === 'AbortError') return 'Stopped.';
  let msg = err?.message ?? String(e);
  if (err?.responseBody) {
    try {
      // Providers disagree: {error:{message}}, {error:"text"} (xAI), {message}, {detail}.
      const j = JSON.parse(err.responseBody);
      const fromBody = typeof j.error === 'string' ? j.error : j.error?.message ?? j.message ?? j.detail;
      if (typeof fromBody === 'string' && fromBody.trim()) msg = fromBody;
    } catch {
      if (err.responseBody.trim()) msg = err.responseBody.slice(0, 300);
    }
  }
  if (!msg?.trim()) msg = err?.statusCode ? `HTTP ${err.statusCode} from ${p.baseUrl}` : `Request to ${p.baseUrl} failed.`;
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    if (!hasProxy()) {
      return p.baseUrl.includes('localhost') || p.baseUrl.includes('127.0.0.1')
        ? `Could not reach ${p.baseUrl}. Is it running? Ollama must allow this site: start it with OLLAMA_ORIGINS=${location.origin} ollama serve (your browser may also ask to allow local network access). Or run "npx dissentry" on your computer.`
        : `Your browser could not reach ${p.baseUrl}. If this provider is blocked on your network, turn on your VPN/proxy, or run "npx dissentry" and set a proxy in Settings.`;
    }
    return `Could not reach ${p.baseUrl}. Check Settings → Network proxy.`;
  }
  if (err?.statusCode === 401 || /\b401\b|(invalid|incorrect|wrong).{0,20}key|key.{0,20}(not valid|invalid)|unauthori|authentication fail/i.test(msg)) return `Authentication failed for @${p.handle}: check the API key. (${msg})`;
  if (err?.statusCode === 404 || /model.*not.*found|does not exist/i.test(msg)) return `Model "${p.modelId}" not found for @${p.handle}. (${msg})`;
  return msg;
}
