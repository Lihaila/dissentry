import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel, ToolSet, streamText } from 'ai';
import { t } from '../i18n';
import { getSettings } from './settings';
import type { ModelKind, Profile } from './types';

type ProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>;

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

/** Whether this provider has a native web-search integration Dissentry can enable. */
export function supportsWebSearch(p: Pick<Profile, 'protocol' | 'baseUrl'>): boolean {
  if (p.protocol === 'google' || p.protocol === 'anthropic') return true;
  const url = p.baseUrl.toLowerCase();
  return url.includes('openrouter.ai') || url.includes('api.openai.com') || url.includes('api.x.ai') || url.includes('aliyuncs.com');
}

/** Whether web search is enabled for a specific model profile. */
export const profileWebSearchEnabled = (p: Pick<Profile, 'protocol' | 'baseUrl' | 'webSearch'>) =>
  supportsWebSearch(p) && p.webSearch !== false;

/** Whether this provider can be sent a DeepThink / reasoning parameter. */
export function supportsDeepThink(_p: Pick<Profile, 'protocol' | 'baseUrl'>): boolean {
  return true;
}

export interface ModelCallConfig {
  model: LanguageModel;
  tools?: ToolSet;
  reasoning?: 'high';
  providerOptions?: ProviderOptions;
  searchActive: boolean;
  thinkActive: boolean;
}

export function modelCall(
  p: Profile,
  opts: { webSearch?: boolean; deepThink?: boolean; fetchImpl?: typeof fetch } = {},
): ModelCallConfig {
  const f = opts.fetchImpl ?? fetchFor(p);
  const baseURL = trimSlash(p.baseUrl);
  const wantSearch = opts.webSearch === false ? false : Boolean(opts.webSearch) && p.webSearch !== false;
  const wantThink = opts.deepThink === undefined ? !!p.deepThink : Boolean(opts.deepThink);

  switch (p.protocol) {
    case 'anthropic': {
      const provider = createAnthropic({
        apiKey: p.apiKey,
        baseURL,
        fetch: f,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      });
      return {
        model: provider(p.modelId),
        tools: wantSearch ? { web_search: provider.tools.webSearch_20250305({ maxUses: 3 }) } : undefined,
        reasoning: wantThink ? 'high' : undefined,
        searchActive: wantSearch,
        thinkActive: wantThink,
      };
    }
    case 'google': {
      const provider = createGoogle({ apiKey: p.apiKey, baseURL, fetch: f });
      return {
        model: provider(p.modelId),
        tools: wantSearch ? { google_search: provider.tools.googleSearch({}) } : undefined,
        reasoning: wantThink ? 'high' : undefined,
        providerOptions: wantThink ? { google: { thinkingConfig: { includeThoughts: true } } } : undefined,
        searchActive: wantSearch,
        thinkActive: wantThink,
      };
    }
    default: {
      const lower = baseURL.toLowerCase();
      const isOpenAI = lower.includes('api.openai.com');
      const isXai = lower.includes('api.x.ai');
      // OpenAI uses Responses API for native web_search AND reasoning summaries; xAI uses it for native web_search.
      if ((isOpenAI && (wantSearch || wantThink)) || (isXai && wantSearch)) {
        const provider = createOpenAI({ apiKey: p.apiKey || undefined, baseURL, fetch: f });
        return {
          model: provider.responses(p.modelId),
          tools: wantSearch ? { web_search: provider.tools.webSearch({}) } : undefined,
          reasoning: wantThink ? 'high' : undefined,
          providerOptions: wantThink && isOpenAI ? { openai: { reasoningSummary: 'auto' } } : undefined,
          searchActive: wantSearch,
          thinkActive: wantThink,
        };
      }
      const isOpenRouter = lower.includes('openrouter.ai');
      const isQwen = lower.includes('aliyuncs.com');
      const isDeepSeek = lower.includes('api.deepseek.com');
      const isOllama = p.presetId === 'ollama' || /:11434(\/|$)/.test(lower);
      const searchActive = wantSearch && (isOpenRouter || isQwen);
      const thinkActive = wantThink;
      const needsTransform = searchActive || thinkActive;
      const provider = createOpenAICompatible({
        name: p.handle || 'custom',
        baseURL,
        apiKey: p.apiKey || undefined,
        fetch: f,
        includeUsage: true,
        // OpenRouter attributes usage to apps by these headers (shows Dissentry in its app rankings).
        headers: isOpenRouter ? { 'HTTP-Referer': 'https://dissentry.lihaila.com', 'X-Title': 'Dissentry' } : undefined,
        transformRequestBody: needsTransform
          ? (args) => {
              const body: Record<string, unknown> = { ...args };
              if (searchActive) {
                if (isOpenRouter) body.plugins = [{ id: 'web' }];
                else if (isQwen) body.enable_search = true;
              }
              if (thinkActive) {
                if (isOpenRouter) body.reasoning = { effort: 'high' };
                else if (isDeepSeek) body.thinking = { type: 'enabled' };
                else if (isQwen) body.enable_thinking = true;
                else if (isOllama) body.think = true;
                else body.reasoning_effort = 'high';
              }
              return body;
            }
          : undefined,
      });
      return { model: provider(p.modelId), searchActive, thinkActive };
    }
  }
}

export function languageModel(p: Profile, fetchImpl?: typeof fetch) {
  return modelCall(p, { deepThink: false, fetchImpl }).model;
}

/** True when an error likely came from a specific model rejecting web-search tools/plugins. */
export function isSearchUnsupportedError(e: unknown): boolean {
  const err = e as { statusCode?: number; message?: string; responseBody?: string };
  if (err?.statusCode === 401 || err?.statusCode === 403 || err?.statusCode === 429) return false;
  const text = `${err?.message ?? ''} ${err?.responseBody ?? ''}`;
  if (err?.statusCode === 400 || err?.statusCode === 404 || err?.statusCode === 422) {
    return /tool|search|plugin|unsupported|not support|unknown.*param|invalid.*param|responses|grounding|enable_search/i.test(text);
  }
  return false;
}

/** True when a specific model rejected DeepThink / reasoning parameters. */
export function isReasoningUnsupportedError(e: unknown): boolean {
  const err = e as { statusCode?: number; message?: string; responseBody?: string };
  if (err?.statusCode === 401 || err?.statusCode === 403 || err?.statusCode === 429) return false;
  const text = `${err?.message ?? ''} ${err?.responseBody ?? ''}`;
  if (err?.statusCode === 400 || err?.statusCode === 404 || err?.statusCode === 422) {
    return /think|reason|effort|budget|unsupported|not support|unknown.*param|invalid.*param|extra_forbidden|unrecognized/i.test(text);
  }
  return false;
}

/** True when a text-only model rejected attached images or binary PDF files. */
export function isMediaUnsupportedError(e: unknown): boolean {
  const err = e as { statusCode?: number; message?: string; responseBody?: string };
  if (err?.statusCode === 401 || err?.statusCode === 403 || err?.statusCode === 429) return false;
  const text = `${err?.message ?? ''} ${err?.responseBody ?? ''}`;
  if (err?.statusCode === 400 || err?.statusCode === 404 || err?.statusCode === 422) {
    return /image|vision|multimodal|image_url|pdf|file.*not.*support|does not support.*(image|file|media|attachment)|invalid.*content.*type/i.test(text);
  }
  return false;
}

export interface ModelOption {
  id: string;
  name?: string;
  inPrice?: number;
  outPrice?: number;
  /** Detected model capability: chat, image, audio, video, or other (embeddings/rerank/ASR). */
  kind: ModelKind | 'other';
}

const OTHER_MODEL = new RegExp(
  '(^|[/:._-])(' +
    [
      'embed(?:ding)?s?', 'rerank(?:er)?', 'moderation', 'aqa',
      'whisper', 'asr', 'transcribe', 'paraformer', 'sensevoice', 'fun-?asr', 'gummy',
      'realtime', 'babbage', 'davinci', 'wordart', 'facechain', 'farui',
    ].join('|') +
    ')($|[/:._-])',
  'i',
);

const VIDEO_MODEL = new RegExp(
  '(^|[/:._-])(' +
    [
      'sora', 'veo', 't2v', 'i2v', 'r2v', 'kf2v', 's2v', 'v2v', 'vace', 'video(?:edit)?', 'liveportrait', 'animate-?anyone', 'videoretalk', 'emo',
      'kling', 'runway', 'pika', 'luma', 'hailuo', 'seedance', 'vidu',
    ].join('|') +
    ')($|[/:._-])',
  'i',
);

const AUDIO_MODEL = new RegExp(
  '(^|[/:._-])(tts|cosyvoice|sambert|lyria|speech|audio-?gen|music)($|[/:._-])',
  'i',
);

const IMAGE_MODEL = new RegExp(
  '(^|[/:._-])(' +
    [
      'dall-?e', 'imagen', 'flux', 'sdxl', 'stable-?diffusion', 'recraft', 'ideogram', 'midjourney', 'kolors',
      'wanx\\d*', 'wan\\d+(?:\\.\\d+)?', 'image', 't2i', 'i2i', 'img2img', 'txt2img', 'seedream', 'cogview',
    ].join('|') +
    ')($|[/:._-])',
  'i',
);

/** Classify a model ID into chat, image, audio, video, or non-generative utility ('other'). */
export function detectModelKind(id: string): ModelKind | 'other' {
  if (OTHER_MODEL.test(id)) return 'other';
  if (VIDEO_MODEL.test(id)) return 'video';
  if (AUDIO_MODEL.test(id)) return 'audio';
  if (IMAGE_MODEL.test(id)) return 'image';
  return 'chat';
}

/** Resolve the active capability mode for a Profile (falls back to auto-detection from modelId). */
export function profileKind(p: Pick<Profile, 'kind' | 'modelId'>): ModelKind {
  if (p.kind) return p.kind;
  const detected = detectModelKind(p.modelId);
  return detected === 'other' ? 'chat' : detected;
}

/** Backwards-compatible helper: true for non-chat models. */
export function isNonChatModel(id: string): boolean {
  return detectModelKind(id) !== 'chat';
}

/** List models available to this profile's key, including names, detected capability, and pricing. */
export async function listModelOptions(
  p: Pick<Profile, 'protocol' | 'baseUrl' | 'apiKey' | 'useProxy'>,
  fetchImpl?: typeof fetch,
): Promise<ModelOption[]> {
  const f = fetchImpl ?? (p.useProxy && hasProxy() ? proxyFetch : fetch);
  const base = trimSlash(p.baseUrl.trim());
  const endpoint = base.endsWith('/models') ? base : `${base}/models`;
  let res: Response;
  if (p.protocol === 'anthropic') {
    res = await f(`${endpoint}?limit=100`, {
      headers: { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    });
  } else if (p.protocol === 'google') {
    res = await f(`${endpoint}?pageSize=200`, { headers: { 'x-goog-api-key': p.apiKey } });
  } else {
    res = await f(endpoint, { headers: p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {} });
  }
  if (!res.ok) throw new Error(await errorText(res));
  const json = await res.json();
  if (p.protocol === 'google') {
    return (json.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) =>
        !m.supportedGenerationMethods ||
        m.supportedGenerationMethods.some((g) => g === 'generateContent' || g === 'predict' || g === 'predictLongRunning'),
      )
      .map((m: { name: string; displayName?: string }): ModelOption => {
        const id = m.name.replace(/^models\//, '');
        return { id, name: m.displayName, kind: detectModelKind(id) };
      })
      .filter((m: ModelOption) => !!m.id)
      .sort((a: ModelOption, b: ModelOption) => a.id.localeCompare(b.id));
  }
  const perMillion = (v?: string | number) => {
    if (v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 10000) / 10000 : undefined;
  };
  return (json.data ?? json.models ?? [])
    .map((m: { id?: string; name?: string; display_name?: string; pricing?: { prompt?: string; completion?: string } }): ModelOption => {
      const id = m.id ?? m.name ?? '';
      return {
        id,
        name: m.display_name ?? (m.name && m.name !== m.id ? m.name : undefined),
        inPrice: perMillion(m.pricing?.prompt),
        outPrice: perMillion(m.pricing?.completion),
        kind: detectModelKind(id),
      };
    })
    .filter((m: ModelOption) => !!m.id)
    .sort((a: ModelOption, b: ModelOption) => a.id.localeCompare(b.id));
}

/** List model IDs available to this profile's key. */
export async function listModels(p: Pick<Profile, 'protocol' | 'baseUrl' | 'apiKey' | 'useProxy'>): Promise<string[]> {
  return (await listModelOptions(p)).map((m) => m.id);
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
  if (err?.name === 'AbortError') return t('post.stopped');
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
  if (!msg?.trim()) msg = err?.statusCode ? `HTTP ${err.statusCode} · ${p.baseUrl}` : t('err.unreachable', { url: p.baseUrl });
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    const local = p.baseUrl.includes('localhost') || p.baseUrl.includes('127.0.0.1');
    if (!hasProxy()) return local ? t('err.localHosted', { url: p.baseUrl, origin: location.origin }) : t('err.blockedHosted', { url: p.baseUrl });
    return t('err.unreachable', { url: p.baseUrl });
  }
  if (err?.statusCode === 401 || /\b401\b|(invalid|incorrect|wrong).{0,20}key|key.{0,20}(not valid|invalid)|unauthori|authentication fail/i.test(msg)) return t('err.auth', { handle: p.handle, msg });
  if (err?.statusCode === 404 || /model.*not.*found|does not exist/i.test(msg)) return t('err.model', { model: p.modelId, handle: p.handle, msg });
  if (err?.statusCode === 429 || /rate.?limit|quota|insufficient.{0,10}(balance|credit)/i.test(msg)) return t('err.quota', { handle: p.handle, msg });
  return msg;
}
