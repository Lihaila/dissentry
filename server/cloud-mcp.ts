import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import pkg from '../package.json' with { type: 'json' };
import type { Profile, Protocol } from '../src/lib/types';
import { handleMcpHttpRequest } from './mcp';

const OR_FAMILIES: { vendor: string; handle: string; label: string; match?: RegExp }[] = [
  { vendor: 'anthropic', handle: 'claude', label: 'Claude', match: /sonnet|opus/ },
  { vendor: 'openai', handle: 'gpt', label: 'GPT', match: /gpt/ },
  { vendor: 'google', handle: 'gemini', label: 'Gemini', match: /gemini.*(flash|pro)/ },
  { vendor: 'deepseek', handle: 'deepseek', label: 'DeepSeek' },
  { vendor: 'qwen', handle: 'qwen', label: 'Qwen' },
  { vendor: 'x-ai', handle: 'grok', label: 'Grok' },
];
const OR_SKIP = /(:free|preview|image|audio|tts|embed|vision|search|online|guard|realtime|transcribe|-mini-?high|codex|distill|experimental|beta)/i;

function suggestOrModels(raw: { id: string; created?: number; pricing?: { prompt?: string; completion?: string } }[]) {
  const all = raw.map((m) => ({
    id: m.id,
    created: m.created ?? 0,
    inPrice: m.pricing?.prompt ? Number(m.pricing.prompt) * 1e6 : 0,
    outPrice: m.pricing?.completion ? Number(m.pricing.completion) * 1e6 : 0,
  }));
  const out: { handle: string; label: string; modelId: string }[] = [];
  for (const f of OR_FAMILIES) {
    const candidates = all
      .filter((m) => m.id.startsWith(`${f.vendor}/`) && !OR_SKIP.test(m.id) && (!f.match || f.match.test(m.id)))
      .sort((a, b) => b.created - a.created);
    const pick = candidates.find((m) => m.inPrice <= 3 && m.outPrice <= 15) ?? candidates[0];
    if (pick) out.push({ handle: f.handle, label: f.label, modelId: pick.id });
  }
  return out;
}

export interface CloudMcpOptions {
  /** Canonical public origin, e.g. https://dissentry.lihaila.com (no trailing slash). */
  publicOrigin: string;
  /** Secret used to derive the AES-256-GCM key for stateless OAuth tokens and DCR client IDs. */
  secret: string;
  /** Path for the Streamable HTTP MCP resource (defaults to /v1/mcp). */
  mcpPath?: string;
  /** Optional fetch implementation (for tests). */
  fetchImpl?: typeof fetch;
  /** Optional clock in ms (for tests). */
  now?: () => number;
}

interface CloudProviderModel {
  h: string; // handle
  n: string; // display name
  p: string; // presetId
  pr: Protocol;
  u: string; // allowlisted base URL
  m: string; // modelId
  k: string; // API key
  c?: 1; // isChecker
}

interface CloudUserConfig {
  models: CloudProviderModel[];
}

interface SealedTokenPayload {
  typ: 'at' | 'rt';
  exp: number;
  aud: string;
  cid: string;
  cfg: CloudUserConfig;
}

interface SealedDcrClient {
  typ: 'dcr';
  name: string;
  uris: string[];
  iat: number;
}

interface PendingOAuthSession {
  id: string;
  csrf: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope: string;
  resource: string;
  createdAt: number;
  orState?: string;
  orVerifier?: string;
  orApiKey?: string;
  orSuggestions?: { handle: string; label: string; modelId: string }[];
  error?: string;
}

interface PendingAuthCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  scope: string;
  cfg: CloudUserConfig;
  expiresAt: number;
}

const ALLOWED_PROVIDER_HOSTS = new Set([
  'openrouter.ai',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'dashscope-us.aliyuncs.com',
  'api.x.ai',
  'api.mistral.ai',
  'api.groq.com',
]);

const OR_BASE = 'https://openrouter.ai/api/v1';

const DEFAULT_OR_MODELS: { handle: string; label: string; modelId: string }[] = [
  { handle: 'claude', label: 'Claude', modelId: 'anthropic/claude-sonnet-4' },
  { handle: 'gpt', label: 'GPT', modelId: 'openai/gpt-4.1' },
  { handle: 'gemini', label: 'Gemini', modelId: 'google/gemini-2.5-flash' },
  { handle: 'deepseek', label: 'DeepSeek', modelId: 'deepseek/deepseek-chat' },
  { handle: 'qwen', label: 'Qwen', modelId: 'qwen/qwen-plus' },
];

const QWEN_REGIONS: Record<string, string> = {
  cn: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  intl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  us: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
};

const ACCESS_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const REFRESH_TOKEN_TTL_SEC = 180 * 24 * 60 * 60; // 180 days
const SESSION_TTL_MS = 15 * 60 * 1000; // 15 minutes
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PENDING_ENTRIES = 2000;
const MAX_BODY_BYTES = 256 * 1024; // 256 KB

const MCP_CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id',
  'access-control-expose-headers': 'WWW-Authenticate, Mcp-Session-Id',
};

function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  try {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
  } catch {
    return null;
  }
}

function sha256B64Url(input: string): string {
  return b64url(createHash('sha256').update(input, 'utf8').digest());
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 10) return '••••';
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  const proto = u.protocol.toLowerCase();
  if (proto === 'javascript:' || proto === 'data:' || proto === 'vbscript:' || proto === 'file:') return false;
  if (proto === 'https:') return Boolean(u.hostname);
  if (proto === 'http:') {
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  }
  // Native desktop/mobile custom URI schemes (e.g. cursor://, claude://, vscode://, google://).
  return /^[a-z][a-z0-9+.-]{1,31}:$/.test(proto);
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h === '::1' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^127\.|^10\.|^192\.168\.|^169\.254\.|^0\./.test(h)) return true;
  const m172 = /^172\.(\d+)\./.exec(h);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  if (/^(fc|fd|fe80)/i.test(h)) return true;
  return false;
}

/** Strict SSRF-safe fetch wrapper: only public HTTPS allowlisted AI provider hosts, no redirects. */
export function makeCloudSafeFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new Error('Invalid upstream URL'); }
    if (url.protocol !== 'https:') throw new Error(`Blocked non-HTTPS upstream URL: ${url.protocol}`);
    if (url.port && url.port !== '443') throw new Error(`Blocked non-443 upstream port: ${url.port}`);
    if (!ALLOWED_PROVIDER_HOSTS.has(url.hostname.toLowerCase())) {
      throw new Error(`Upstream host not allowlisted in Cloud MCP: ${url.hostname}`);
    }
    return baseFetch(url.toString(), { ...init, redirect: 'error' });
  }) as typeof fetch;
}

function normalizeResourceUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return url.trim().replace(/\/+$/, '');
  }
}

function toProfiles(cfg: CloudUserConfig): Profile[] {
  const now = Date.now();
  return cfg.models
    .filter((m) => {
      try {
        const u = new URL(m.u);
        return u.protocol === 'https:' && ALLOWED_PROVIDER_HOSTS.has(u.hostname.toLowerCase()) && Boolean(m.k.trim()) && Boolean(m.m.trim());
      } catch {
        return false;
      }
    })
    .map((m, i) => ({
      id: `cloud-${i}-${m.h}`,
      handle: m.h,
      name: m.n,
      color: '#6467f2',
      presetId: m.p,
      protocol: m.pr,
      baseUrl: m.u,
      modelId: m.m,
      apiKey: m.k,
      useProxy: false,
      systemPrompt: '',
      enabled: true,
      isChecker: m.c !== undefined ? m.c === 1 : true,
      webSearch: true,
      deepThink: false,
      createdAt: now + i,
    }));
}

function buildByokConfig(form: Record<string, string>): CloudUserConfig {
  const models: CloudProviderModel[] = [];
  const clean = (k: string) => (form[k] ?? '').trim();

  const orKey = clean('openrouter_key');
  if (orKey) {
    for (const def of DEFAULT_OR_MODELS.slice(0, 4)) {
      models.push({ h: def.handle, n: def.label, p: 'openrouter', pr: 'openai', u: OR_BASE, m: def.modelId, k: orKey, c: 1 });
    }
  }
  const anthropicKey = clean('anthropic_key');
  if (anthropicKey && !models.some((m) => m.h === 'claude')) {
    models.push({ h: 'claude', n: 'Claude', p: 'anthropic', pr: 'anthropic', u: 'https://api.anthropic.com/v1', m: clean('anthropic_model') || 'claude-sonnet-4-20250514', k: anthropicKey, c: 1 });
  }
  const openaiKey = clean('openai_key');
  if (openaiKey && !models.some((m) => m.h === 'gpt')) {
    models.push({ h: 'gpt', n: 'GPT', p: 'openai', pr: 'openai', u: 'https://api.openai.com/v1', m: clean('openai_model') || 'gpt-4.1', k: openaiKey, c: 1 });
  }
  const geminiKey = clean('gemini_key');
  if (geminiKey && !models.some((m) => m.h === 'gemini')) {
    models.push({ h: 'gemini', n: 'Gemini', p: 'google', pr: 'google', u: 'https://generativelanguage.googleapis.com/v1beta', m: clean('gemini_model') || 'gemini-2.5-flash', k: geminiKey, c: 1 });
  }
  const deepseekKey = clean('deepseek_key');
  if (deepseekKey && !models.some((m) => m.h === 'deepseek')) {
    models.push({ h: 'deepseek', n: 'DeepSeek', p: 'deepseek', pr: 'openai', u: 'https://api.deepseek.com/v1', m: clean('deepseek_model') || 'deepseek-chat', k: deepseekKey, c: 1 });
  }
  const qwenKey = clean('qwen_key');
  if (qwenKey && !models.some((m) => m.h === 'qwen')) {
    const region = QWEN_REGIONS[clean('qwen_region')] ?? QWEN_REGIONS.cn;
    models.push({ h: 'qwen', n: 'Qwen', p: 'qwen', pr: 'openai', u: region, m: clean('qwen_model') || 'qwen-plus', k: qwenKey, c: 1 });
  }
  const xaiKey = clean('xai_key');
  if (xaiKey && !models.some((m) => m.h === 'grok')) {
    models.push({ h: 'grok', n: 'Grok', p: 'xai', pr: 'openai', u: 'https://api.x.ai/v1', m: clean('xai_model') || 'grok-3', k: xaiKey, c: 1 });
  }

  return { models: models.slice(0, 8) };
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limit: number, private windowMs: number, private now: () => number) {}
  allow(key: string): boolean {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(t);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) {
        if (v.every((ts) => ts <= cutoff)) this.hits.delete(k);
      }
    }
    return true;
  }
}

function renderConsentHtml(session: PendingOAuthSession, publicOrigin: string): string {
  const clientName = escapeHtml(session.clientName || 'MCP Client');
  const orModels = session.orSuggestions?.length ? session.orSuggestions : DEFAULT_OR_MODELS;
  const errorBanner = session.error
    ? `<div class="err">${escapeHtml(session.error)}</div>`
    : '';

  const orSection = session.orApiKey
    ? `
      <div class="card card-ok">
        <div class="badge-ok">✓ OpenRouter connected (${escapeHtml(maskKey(session.orApiKey))})</div>
        <p class="muted">Select the models Dissentry should use for fact-checking and second opinions:</p>
        <form method="POST" action="/oauth/authorize">
          <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}" />
          <input type="hidden" name="sid" value="${escapeHtml(session.id)}" />
          <input type="hidden" name="mode" value="openrouter" />
          <div class="models">
            ${orModels.map((m, idx) => `
              <label class="model-row">
                <input type="checkbox" name="or_model" value="${escapeHtml(`${m.handle}|${m.label}|${m.modelId}`)}" ${idx < 4 ? 'checked' : ''} />
                <span><strong>@${escapeHtml(m.handle)}</strong> <span class="mono">${escapeHtml(m.modelId)}</span></span>
              </label>
            `).join('')}
          </div>
          <div class="actions">
            <button type="submit" name="action" value="approve" class="btn btn-primary">Approve &amp; Connect</button>
            <button type="submit" name="action" value="deny" class="btn btn-ghost">Cancel</button>
          </div>
        </form>
      </div>`
    : `
      <div class="card">
        <div class="section-title">Fastest: Sign in with OpenRouter</div>
        <p class="muted">One login for Claude, GPT, Gemini, DeepSeek, Qwen and more, billed directly to your OpenRouter account.</p>
        <form method="POST" action="/oauth/openrouter/start">
          <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}" />
          <input type="hidden" name="sid" value="${escapeHtml(session.id)}" />
          <button type="submit" class="btn btn-primary btn-full">Sign in with OpenRouter →</button>
        </form>
      </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Connect Dissentry Cloud MCP</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif; background: #f8fafc; color: #0f172a; line-height: 1.5; padding: 24px 16px 48px; }
  .wrap { max-width: 520px; margin: 0 auto; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .brand span { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
  .pill { display: inline-block; font-size: 12px; font-weight: 600; color: #92400e; background: #fef3c7; border: 1px solid #fde68a; border-radius: 999px; padding: 2px 10px; margin-left: auto; }
  h1 { font-size: 22px; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.02em; }
  .lead { font-size: 14.5px; color: #475569; margin: 0 0 18px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; padding: 20px; margin-bottom: 14px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
  .card-ok { border-color: #a7f3d0; background: #f0fdf4; }
  .badge-ok { font-size: 13.5px; font-weight: 700; color: #065f46; margin-bottom: 6px; }
  .section-title { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
  .muted { font-size: 13.5px; color: #475569; margin: 0 0 14px; }
  .err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 14px; padding: 11px 14px; font-size: 13.5px; margin-bottom: 14px; }
  .models { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .model-row { display: flex; align-items: center; gap: 9px; background: #fff; border: 1px solid #d1fae5; border-radius: 12px; padding: 9px 12px; font-size: 13.5px; cursor: pointer; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #64748b; }
  .field { margin-bottom: 10px; }
  .field label { display: block; font-size: 12.5px; font-weight: 600; color: #334155; margin-bottom: 4px; }
  .field input, .field select { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-size: 13.5px; background: #fff; color: #0f172a; }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 480px) { .row-2 { grid-template-columns: 1fr; } }
  .actions { display: flex; gap: 10px; align-items: center; margin-top: 14px; }
  .btn { appearance: none; border: 0; border-radius: 999px; padding: 10px 18px; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
  .btn-primary { background: #0f172a; color: #fff; }
  .btn-primary:hover { background: #1e293b; }
  .btn-ghost { background: #e2e8f0; color: #0f172a; }
  .btn-full { width: 100%; }
  details summary { cursor: pointer; font-size: 14px; font-weight: 700; color: #0f172a; list-style: none; display: flex; justify-content: space-between; align-items: center; }
  details summary::-webkit-details-marker { display: none; }
  details[open] summary { margin-bottom: 12px; }
  .privacy { font-size: 12.5px; color: #64748b; line-height: 1.55; padding: 0 4px; }
  .privacy a { color: #0f172a; font-weight: 600; }
  .tools { font-size: 12.5px; color: #475569; margin: 10px 0 0; padding-left: 18px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#0f172a"/>
        <path d="M18 16h14a16 16 0 0 1 0 32H18z" fill="none" stroke="#f8fafc" stroke-width="6"/>
        <circle cx="46" cy="18" r="7" fill="#f59e0b"/>
      </svg>
      <span>Dissentry</span>
      <span class="pill">Cloud MCP</span>
    </div>

    <h1>Authorize ${clientName}</h1>
    <p class="lead"><strong>${clientName}</strong> wants to use Dissentry's multi-model fact-checker (<code>dissentry_check</code>, <code>dissentry_ask</code>, <code>dissentry_list_models</code>).</p>

    ${errorBanner}
    ${orSection}

    <div class="card">
      <details ${session.orApiKey ? '' : ''}>
        <summary>Or bring your own API keys (OpenAI, Anthropic, Gemini, DeepSeek, Qwen, xAI) <span>+</span></summary>
        <form method="POST" action="/oauth/authorize">
          <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}" />
          <input type="hidden" name="sid" value="${escapeHtml(session.id)}" />
          <input type="hidden" name="mode" value="byok" />
          <p class="muted">Paste one or more provider API keys. Adding 2+ providers lets different model families check each other.</p>
          <div class="field"><label for="openrouter_key">OpenRouter API Key (optional)</label><input id="openrouter_key" name="openrouter_key" type="password" autocomplete="off" placeholder="sk-or-v1-..." /></div>
          <div class="row-2">
            <div class="field"><label for="anthropic_key">Anthropic (Claude)</label><input id="anthropic_key" name="anthropic_key" type="password" autocomplete="off" placeholder="sk-ant-..." /></div>
            <div class="field"><label for="openai_key">OpenAI (GPT)</label><input id="openai_key" name="openai_key" type="password" autocomplete="off" placeholder="sk-..." /></div>
          </div>
          <div class="row-2">
            <div class="field"><label for="gemini_key">Google Gemini</label><input id="gemini_key" name="gemini_key" type="password" autocomplete="off" placeholder="AIza..." /></div>
            <div class="field"><label for="deepseek_key">DeepSeek</label><input id="deepseek_key" name="deepseek_key" type="password" autocomplete="off" placeholder="sk-..." /></div>
          </div>
          <div class="row-2">
            <div class="field"><label for="qwen_key">Qwen / DashScope</label><input id="qwen_key" name="qwen_key" type="password" autocomplete="off" placeholder="sk-..." /></div>
            <div class="field">
              <label for="qwen_region">Qwen Region</label>
              <select id="qwen_region" name="qwen_region">
                <option value="cn">China Mainland (aliyuncs)</option>
                <option value="intl">International (Singapore)</option>
                <option value="us">US (Virginia)</option>
              </select>
            </div>
          </div>
          <div class="field"><label for="xai_key">xAI (Grok)</label><input id="xai_key" name="xai_key" type="password" autocomplete="off" placeholder="xai-..." /></div>
          <div class="actions">
            <button type="submit" name="action" value="approve" class="btn btn-primary">Approve &amp; Connect</button>
            <button type="submit" name="action" value="deny" class="btn btn-ghost">Cancel</button>
          </div>
        </form>
      </details>
    </div>

    ${!session.orApiKey ? `
      <form method="POST" action="/oauth/authorize" style="margin-bottom:14px">
        <input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}" />
        <input type="hidden" name="sid" value="${escapeHtml(session.id)}" />
        <button type="submit" name="action" value="deny" class="btn btn-ghost btn-full">Cancel and return to ${clientName}</button>
      </form>` : ''}

    <p class="privacy">
      <strong>Zero-database privacy:</strong> Your keys are encrypted inside your OAuth Bearer token (AES-256-GCM) and never stored in any server database. Tool requests are forwarded in memory directly to your chosen providers and never logged.
      <a href="${escapeHtml(publicOrigin)}/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> ·
      <a href="${escapeHtml(publicOrigin)}/terms" target="_blank" rel="noopener noreferrer">Terms</a>
    </p>
  </div>
</body>
</html>`;
}

function renderErrorHtml(title: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)} — Dissentry</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;background:#f8fafc;color:#0f172a;padding:48px 16px}.box{max-width:460px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:20px;padding:24px}h1{margin:0 0 8px;font-size:20px}p{margin:0;color:#475569;font-size:14.5px;line-height:1.6}</style>
</head>
<body><div class="box"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div></body></html>`;
}

export function createCloudMcpApp(opts: CloudMcpOptions) {
  if (!opts.secret || opts.secret.length < 32) {
    throw new Error('Cloud MCP secret must be at least 32 characters');
  }
  const publicOrigin = opts.publicOrigin.replace(/\/+$/, '');
  const mcpPath = (opts.mcpPath ?? '/v1/mcp').replace(/\/+$/, '') || '/v1/mcp';
  const resourceUrl = `${publicOrigin}${mcpPath}`;
  const resourceMetaPath = `/.well-known/oauth-protected-resource${mcpPath}`;
  const resourceMetaUrl = `${publicOrigin}${resourceMetaPath}`;
  const isSecureOrigin = publicOrigin.startsWith('https://');

  const encKey = createHash('sha256').update(`dissentry-cloud-mcp:v1:${opts.secret}`, 'utf8').digest();
  const now = opts.now ?? (() => Date.now());
  const rawFetch = opts.fetchImpl ?? fetch;
  const cloudFetch = makeCloudSafeFetch(rawFetch);

  const sessions = new Map<string, PendingOAuthSession>();
  const authCodes = new Map<string, PendingAuthCode>();
  const mcpLimiter = new SlidingWindowLimiter(60, 60_000, now);
  const oauthLimiter = new SlidingWindowLimiter(30, 60_000, now);

  function sealJson(prefix: string, obj: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encKey, iv);
    const pt = Buffer.from(JSON.stringify(obj), 'utf8');
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${prefix}${b64url(Buffer.concat([iv, tag, ct]))}`;
  }

  function openJson<T>(prefix: string, token: string): T | null {
    if (!token.startsWith(prefix)) return null;
    const raw = unb64url(token.slice(prefix.length));
    if (!raw || raw.length < 29) return null;
    try {
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ct = raw.subarray(28);
      const decipher = createDecipheriv('aes-256-gcm', encKey, iv);
      decipher.setAuthTag(tag);
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
      return JSON.parse(pt) as T;
    } catch {
      return null;
    }
  }

  function pruneMaps() {
    const t = now();
    for (const [k, v] of sessions) {
      if (t - v.createdAt > SESSION_TTL_MS) sessions.delete(k);
    }
    for (const [k, v] of authCodes) {
      if (t > v.expiresAt) authCodes.delete(k);
    }
    while (sessions.size > MAX_PENDING_ENTRIES) {
      const first = sessions.keys().next().value;
      if (!first) break;
      sessions.delete(first);
    }
    while (authCodes.size > MAX_PENDING_ENTRIES) {
      const first = authCodes.keys().next().value;
      if (!first) break;
      authCodes.delete(first);
    }
  }

  async function resolveClient(clientId: string): Promise<{ name: string; redirectUris: string[] } | null> {
    if (!clientId) return null;
    if (clientId.startsWith('dcr_')) {
      const parsed = openJson<SealedDcrClient>('dcr_', clientId);
      if (!parsed || parsed.typ !== 'dcr' || !Array.isArray(parsed.uris) || parsed.uris.length === 0) return null;
      return { name: parsed.name || 'MCP Client', redirectUris: parsed.uris };
    }
    // MCP 2025-11-25 Client ID Metadata Document (CIMD): HTTPS URL identifying the client.
    if (clientId.startsWith('https://')) {
      let url: URL;
      try { url = new URL(clientId); } catch { return null; }
      if (isPrivateOrLocalHost(url.hostname)) return null;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      try {
        const res = await rawFetch(url.toString(), {
          headers: { accept: 'application/json' },
          redirect: 'error',
          signal: ac.signal,
        });
        if (!res.ok) return null;
        const text = await res.text();
        if (text.length > 32 * 1024) return null;
        const doc = JSON.parse(text) as { client_id?: string; client_name?: string; redirect_uris?: unknown };
        if (doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return null;
        const uris = doc.redirect_uris.filter((u): u is string => typeof u === 'string' && isAllowedRedirectUri(u));
        if (uris.length === 0) return null;
        return { name: typeof doc.client_name === 'string' && doc.client_name.trim() ? doc.client_name.trim().slice(0, 80) : url.hostname, redirectUris: uris };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  function clientIp(req: Request): string {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    return req.headers.get('x-real-ip')?.trim() || 'unknown';
  }

  function oauthHtmlResponse(html: string, status = 200, extraHeaders: Record<string, string> = {}) {
    return new Response(html, {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        // Omit form-action so Chromium/WebKit allow 302 redirects from POST /oauth/authorize to registered client redirect_uris (https://, http://localhost, cursor://, etc.).
        'content-security-policy': "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'",
        ...extraHeaders,
      },
    });
  }

  const app = new Hono();

  // Health endpoint (distinct from /api/health so hosted web app keeps client-only detection).
  app.get('/v1/mcp/health', (c) => c.json({ ok: true, service: 'dissentry-cloud-mcp', version: pkg.version, resource: resourceUrl }));

  // RFC 9728: OAuth 2.0 Protected Resource Metadata (both path-scoped and root fallback).
  const protectedResourceMeta = () => ({
    resource: resourceUrl,
    authorization_servers: [publicOrigin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp:tools'],
    resource_name: 'Dissentry',
    resource_documentation: `${publicOrigin}/mcp`,
  });

  app.options('/.well-known/*', () => new Response(null, { status: 204, headers: MCP_CORS_HEADERS }));
  app.get(resourceMetaPath, (c) => c.json(protectedResourceMeta(), 200, { ...MCP_CORS_HEADERS, 'cache-control': 'public, max-age=300' }));
  app.get('/.well-known/oauth-protected-resource', (c) => c.json(protectedResourceMeta(), 200, { ...MCP_CORS_HEADERS, 'cache-control': 'public, max-age=300' }));

  // RFC 8414: OAuth 2.0 Authorization Server Metadata.
  const authServerMeta = () => ({
    issuer: publicOrigin,
    authorization_endpoint: `${publicOrigin}/oauth/authorize`,
    token_endpoint: `${publicOrigin}/oauth/token`,
    registration_endpoint: `${publicOrigin}/oauth/register`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp:tools'],
    service_documentation: `${publicOrigin}/mcp`,
    client_id_metadata_document_supported: true,
  });

  app.get('/.well-known/oauth-authorization-server', (c) => c.json(authServerMeta(), 200, { ...MCP_CORS_HEADERS, 'cache-control': 'public, max-age=300' }));
  app.get('/.well-known/openid-configuration', (c) => c.json(authServerMeta(), 200, { ...MCP_CORS_HEADERS, 'cache-control': 'public, max-age=300' }));

  // RFC 7591: Stateless Dynamic Client Registration.
  app.options('/oauth/*', () => new Response(null, { status: 204, headers: MCP_CORS_HEADERS }));
  app.post('/oauth/register', async (c) => {
    if (!oauthLimiter.allow(`reg:${clientIp(c.req.raw)}`)) {
      return c.json({ error: 'too_many_requests', error_description: 'Rate limit exceeded' }, 429, MCP_CORS_HEADERS);
    }
    let body: Record<string, unknown>;
    try { body = await c.req.json(); } catch {
      return c.json({ error: 'invalid_client_metadata', error_description: 'Invalid JSON body' }, 400, MCP_CORS_HEADERS);
    }
    const rawUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    const uris = rawUris.filter((u): u is string => typeof u === 'string' && isAllowedRedirectUri(u)).slice(0, 10);
    if (uris.length === 0) {
      return c.json({ error: 'invalid_redirect_uri', error_description: 'At least one valid redirect_uri is required' }, 400, MCP_CORS_HEADERS);
    }
    const clientName = typeof body.client_name === 'string' && body.client_name.trim()
      ? body.client_name.trim().slice(0, 80)
      : 'MCP Client';
    const iat = Math.floor(now() / 1000);
    const clientId = sealJson('dcr_', { typ: 'dcr', name: clientName, uris, iat } satisfies SealedDcrClient);
    return c.json({
      client_id: clientId,
      client_name: clientName,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_id_issued_at: iat,
    }, 201, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
  });

  // OAuth 2.1 Authorization Endpoint (GET displays consent UI).
  app.get('/oauth/authorize', async (c) => {
    pruneMaps();
    const q = c.req.query();

    // Returning from OpenRouter callback with an existing session ID?
    if (q.sid && !q.client_id) {
      const cookieSid = parseCookie(c.req.header('cookie'), 'dissentry_oauth');
      const session = sessions.get(q.sid);
      if (!session || !cookieSid || !safeEqual(cookieSid, session.id)) {
        return oauthHtmlResponse(renderErrorHtml('Session expired', 'Please restart the connection from your MCP client.'), 400);
      }
      return oauthHtmlResponse(renderConsentHtml(session, publicOrigin));
    }

    const responseType = q.response_type ?? '';
    const clientId = q.client_id ?? '';
    const redirectUri = q.redirect_uri ?? '';
    const codeChallenge = q.code_challenge ?? '';
    const codeChallengeMethod = q.code_challenge_method ?? '';
    const state = q.state ?? '';
    const scope = q.scope?.trim() || 'mcp:tools';
    const resource = q.resource ? normalizeResourceUrl(q.resource) : resourceUrl;

    const client = await resolveClient(clientId);
    if (!client) {
      return oauthHtmlResponse(renderErrorHtml('Unknown client', 'The OAuth client_id is invalid or could not be verified.'), 400);
    }
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      return oauthHtmlResponse(renderErrorHtml('Invalid redirect_uri', 'The requested redirect_uri is not registered for this client.'), 400);
    }

    const redirectError = (code: string, desc: string) => {
      const target = new URL(redirectUri);
      target.searchParams.set('error', code);
      target.searchParams.set('error_description', desc);
      if (state) target.searchParams.set('state', state);
      return c.redirect(target.toString(), 302);
    };

    if (responseType !== 'code') return redirectError('unsupported_response_type', 'Only response_type=code is supported.');
    if (!codeChallenge || codeChallengeMethod !== 'S256') {
      return redirectError('invalid_request', 'PKCE S256 code_challenge is required.');
    }
    if (resource !== normalizeResourceUrl(resourceUrl)) {
      return redirectError('invalid_target', `Requested resource does not match ${resourceUrl}.`);
    }

    const sid = b64url(randomBytes(24));
    const csrf = b64url(randomBytes(24));
    const session: PendingOAuthSession = {
      id: sid,
      csrf,
      clientId,
      clientName: client.name,
      redirectUri,
      codeChallenge,
      state,
      scope,
      resource,
      createdAt: now(),
    };
    sessions.set(sid, session);
    const cookie = `dissentry_oauth=${encodeURIComponent(sid)}; Path=/oauth; HttpOnly; SameSite=Lax; Max-Age=900${isSecureOrigin ? '; Secure' : ''}`;
    return oauthHtmlResponse(renderConsentHtml(session, publicOrigin), 200, { 'set-cookie': cookie });
  });

  // Start OpenRouter PKCE handoff from inside the OAuth consent page.
  app.post('/oauth/openrouter/start', async (c) => {
    pruneMaps();
    const form = await c.req.parseBody();
    const sid = typeof form.sid === 'string' ? form.sid : '';
    const csrf = typeof form.csrf === 'string' ? form.csrf : '';
    const cookieSid = parseCookie(c.req.header('cookie'), 'dissentry_oauth');
    const session = sessions.get(sid);
    if (!session || !cookieSid || !safeEqual(cookieSid, session.id) || !safeEqual(csrf, session.csrf)) {
      return oauthHtmlResponse(renderErrorHtml('Session expired', 'Please restart the connection from your MCP client.'), 400);
    }
    const verifier = b64url(randomBytes(32));
    const orState = b64url(randomBytes(18));
    session.orVerifier = verifier;
    session.orState = orState;
    session.error = undefined;

    const url = new URL('https://openrouter.ai/auth');
    url.searchParams.set('callback_url', `${publicOrigin}/oauth/openrouter/callback`);
    url.searchParams.set('code_challenge', sha256B64Url(verifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', orState);
    url.searchParams.set('key_label', 'Dissentry Cloud MCP');
    return c.redirect(url.toString(), 302);
  });

  // OpenRouter PKCE callback: exchanges code for user's OpenRouter API key in RAM only.
  app.get('/oauth/openrouter/callback', async (c) => {
    pruneMaps();
    const q = c.req.query();
    const cookieSid = parseCookie(c.req.header('cookie'), 'dissentry_oauth');
    const session = cookieSid ? sessions.get(cookieSid) : undefined;
    if (!session) {
      return oauthHtmlResponse(renderErrorHtml('Session expired', 'Please restart the connection from your MCP client.'), 400);
    }
    if (!q.code) {
      session.error = 'OpenRouter sign-in was cancelled.';
      return c.redirect(`/oauth/authorize?sid=${encodeURIComponent(session.id)}`, 302);
    }
    if (!session.orVerifier || !session.orState || q.state !== session.orState) {
      session.error = 'OpenRouter sign-in state expired. Please try again.';
      return c.redirect(`/oauth/authorize?sid=${encodeURIComponent(session.id)}`, 302);
    }
    try {
      const res = await cloudFetch(`${OR_BASE}/auth/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: q.code, code_verifier: session.orVerifier, code_challenge_method: 'S256' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { key?: string };
      if (!data?.key || typeof data.key !== 'string') throw new Error('No key returned');
      session.orApiKey = data.key.trim();
      session.orVerifier = undefined;
      session.orState = undefined;
      session.error = undefined;

      // Best-effort live model suggestions from OpenRouter catalog (4s timeout; falls back to defaults).
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 4000);
      try {
        const mr = await cloudFetch(`${OR_BASE}/models`, { signal: ac.signal });
        if (mr.ok) {
          const mj = (await mr.json()) as { data?: { id: string; created?: number; pricing?: { prompt?: string; completion?: string } }[] };
          const picks = suggestOrModels(mj.data ?? []).slice(0, 6);
          if (picks.length > 0) session.orSuggestions = picks;
        }
      } catch {
        // Keep curated defaults.
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      session.error = `Could not connect OpenRouter (${(e as Error).message}). Please try again.`;
    }
    return c.redirect(`/oauth/authorize?sid=${encodeURIComponent(session.id)}`, 302);
  });

  // OAuth 2.1 Authorization Approval / Denial submission.
  app.post('/oauth/authorize', async (c) => {
    pruneMaps();
    if (!oauthLimiter.allow(`auth:${clientIp(c.req.raw)}`)) {
      return oauthHtmlResponse(renderErrorHtml('Too many requests', 'Please wait a moment and try again.'), 429);
    }
    const formData = await c.req.formData();
    const str = (k: string) => {
      const v = formData.get(k);
      return typeof v === 'string' ? v : '';
    };
    const sid = str('sid');
    const csrf = str('csrf');
    const cookieSid = parseCookie(c.req.header('cookie'), 'dissentry_oauth');
    const session = sessions.get(sid);
    if (!session || !cookieSid || !safeEqual(cookieSid, session.id) || !safeEqual(csrf, session.csrf)) {
      return oauthHtmlResponse(renderErrorHtml('Session expired', 'Please restart the connection from your MCP client.'), 400);
    }

    const action = str('action');
    if (action === 'deny') {
      sessions.delete(session.id);
      const target = new URL(session.redirectUri);
      target.searchParams.set('error', 'access_denied');
      if (session.state) target.searchParams.set('state', session.state);
      return c.redirect(target.toString(), 302);
    }

    const mode = str('mode');
    let cfg: CloudUserConfig;
    if (mode === 'openrouter') {
      if (!session.orApiKey) {
        session.error = 'Please sign in with OpenRouter first.';
        return oauthHtmlResponse(renderConsentHtml(session, publicOrigin), 400);
      }
      const rawPicks = formData.getAll('or_model').filter((v): v is string => typeof v === 'string');
      const models: CloudProviderModel[] = [];
      for (const raw of rawPicks.slice(0, 6)) {
        const [h, n, m] = raw.split('|');
        if (h && m && /^[a-z0-9_-]{1,32}$/i.test(h) && /^[a-z0-9._:/-]{2,120}$/i.test(m)) {
          models.push({ h: h.toLowerCase(), n: (n || h).slice(0, 40), p: 'openrouter', pr: 'openai', u: OR_BASE, m, k: session.orApiKey, c: 1 });
        }
      }
      if (models.length === 0) {
        session.error = 'Select at least one model to continue.';
        return oauthHtmlResponse(renderConsentHtml(session, publicOrigin), 400);
      }
      cfg = { models };
    } else {
      const fields: Record<string, string> = {};
      for (const [k, v] of formData.entries()) {
        if (typeof v === 'string') fields[k] = v;
      }
      cfg = buildByokConfig(fields);
      if (cfg.models.length === 0) {
        session.error = 'Enter at least one provider API key to continue.';
        return oauthHtmlResponse(renderConsentHtml(session, publicOrigin), 400);
      }
    }

    sessions.delete(session.id);
    const code = `dsc_code_${b64url(randomBytes(24))}`;
    authCodes.set(code, {
      clientId: session.clientId,
      redirectUri: session.redirectUri,
      codeChallenge: session.codeChallenge,
      resource: session.resource,
      scope: session.scope,
      cfg,
      expiresAt: now() + AUTH_CODE_TTL_MS,
    });

    const target = new URL(session.redirectUri);
    target.searchParams.set('code', code);
    if (session.state) target.searchParams.set('state', session.state);
    const clearCookie = `dissentry_oauth=; Path=/oauth; HttpOnly; SameSite=Lax; Max-Age=0${isSecureOrigin ? '; Secure' : ''}`;
    return new Response(null, { status: 302, headers: { location: target.toString(), 'set-cookie': clearCookie, 'cache-control': 'no-store' } });
  });

  // OAuth 2.1 Token Endpoint (authorization_code with mandatory PKCE S256, and refresh_token).
  app.post('/oauth/token', async (c) => {
    pruneMaps();
    if (!oauthLimiter.allow(`tok:${clientIp(c.req.raw)}`)) {
      return c.json({ error: 'too_many_requests' }, 429, MCP_CORS_HEADERS);
    }
    const ct = (c.req.header('content-type') ?? '').toLowerCase();
    const params: Record<string, string> = {};
    try {
      if (ct.includes('application/json')) {
        const j = (await c.req.json()) as Record<string, unknown>;
        for (const [k, v] of Object.entries(j)) if (typeof v === 'string') params[k] = v;
      } else {
        const text = await c.req.text();
        const sp = new URLSearchParams(text);
        for (const [k, v] of sp.entries()) params[k] = v;
      }
    } catch {
      return c.json({ error: 'invalid_request' }, 400, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
    }

    const grantType = params.grant_type ?? '';
    const clientId = params.client_id ?? '';
    const nowSec = Math.floor(now() / 1000);

    const issueTokens = (cid: string, aud: string, scope: string, cfg: CloudUserConfig) => {
      const accessToken = sealJson('dsc_at_', { typ: 'at', exp: nowSec + ACCESS_TOKEN_TTL_SEC, aud, cid, cfg } satisfies SealedTokenPayload);
      const refreshToken = sealJson('dsc_rt_', { typ: 'rt', exp: nowSec + REFRESH_TOKEN_TTL_SEC, aud, cid, cfg } satisfies SealedTokenPayload);
      return c.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SEC,
        refresh_token: refreshToken,
        scope,
      }, 200, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store', pragma: 'no-cache' });
    };

    if (grantType === 'authorization_code') {
      const code = params.code ?? '';
      const redirectUri = params.redirect_uri ?? '';
      const codeVerifier = params.code_verifier ?? '';
      const record = authCodes.get(code);
      // Single-use code: always consume immediately.
      authCodes.delete(code);
      if (!record || now() > record.expiresAt) {
        return c.json({ error: 'invalid_grant', error_description: 'Authorization code is invalid or expired.' }, 400, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
      }
      if (clientId && record.clientId !== clientId) {
        return c.json({ error: 'invalid_grant', error_description: 'client_id mismatch.' }, 400, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
      }
      if (redirectUri !== record.redirectUri) {
        return c.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch.' }, 400, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
      }
      if (!codeVerifier || !safeEqual(sha256B64Url(codeVerifier), record.codeChallenge)) {
        return c.json({ error: 'invalid_grant', error_description: 'Invalid PKCE code_verifier.' }, 400, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
      }
      if (params.resource && normalizeResourceUrl(params.resource) !== record.resource) {
        return c.json({ error: 'invalid_target', error_description: 'Resource indicator mismatch.' }, 400, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
      }
      return issueTokens(record.clientId, record.resource, record.scope, record.cfg);
    }

    if (grantType === 'refresh_token') {
      const rt = params.refresh_token ?? '';
      const payload = openJson<SealedTokenPayload>('dsc_rt_', rt);
      if (!payload || payload.typ !== 'rt' || payload.exp <= nowSec) {
        return c.json({ error: 'invalid_grant', error_description: 'Refresh token is invalid or expired.' }, 400, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
      }
      if (clientId && payload.cid !== clientId) {
        return c.json({ error: 'invalid_grant', error_description: 'client_id mismatch.' }, 400, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
      }
      return issueTokens(payload.cid, payload.aud, params.scope || 'mcp:tools', payload.cfg);
    }

    return c.json({ error: 'unsupported_grant_type' }, 400, { ...MCP_CORS_HEADERS, 'cache-control': 'no-store' });
  });

  // Protected Streamable HTTP Cloud MCP Endpoint.
  app.options(mcpPath, () => new Response(null, { status: 204, headers: MCP_CORS_HEADERS }));
  app.all(mcpPath, async (c) => {
    const authHeader = c.req.header('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
    const unauthorized = (desc: string) =>
      new Response(JSON.stringify({ error: 'unauthorized', error_description: desc }), {
        status: 401,
        headers: {
          ...MCP_CORS_HEADERS,
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'www-authenticate': `Bearer realm="dissentry", resource_metadata="${resourceMetaUrl}", scope="mcp:tools"`,
        },
      });

    if (!match) return unauthorized('Bearer access token required.');
    const payload = openJson<SealedTokenPayload>('dsc_at_', match[1]);
    const nowSec = Math.floor(now() / 1000);
    if (!payload || payload.typ !== 'at' || payload.exp <= nowSec || payload.aud !== normalizeResourceUrl(resourceUrl)) {
      return unauthorized('Access token is invalid or expired.');
    }

    if (!mcpLimiter.allow(`mcp:${clientIp(c.req.raw)}`)) {
      return c.json({ error: 'rate_limited', error_description: 'Too many requests; please try again shortly.' }, 429, MCP_CORS_HEADERS);
    }

    const contentLen = Number(c.req.header('content-length') ?? 0);
    if (contentLen > MAX_BODY_BYTES) {
      return c.json({ error: 'payload_too_large' }, 413, MCP_CORS_HEADERS);
    }

    const profiles = toProfiles(payload.cfg);
    const res = await handleMcpHttpRequest(c.req.raw, {
      staticConfig: {
        profiles,
        settings: { webSearch: true },
        source: 'Dissentry Cloud MCP (OAuth)',
      },
      fetchImpl: cloudFetch,
    });

    const outHeaders = new Headers(res.headers);
    for (const [k, v] of Object.entries(MCP_CORS_HEADERS)) outHeaders.set(k, v);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
  });

  return app;
}
