// "Sign in with OpenRouter" (OAuth PKCE): the user approves once on openrouter.ai and we receive
// an API key tied to their own account and credits. No server involved: openrouter.ai allows
// browser calls (CORS *) for both the key exchange and the public model list.
import { db, uid } from './db';
import { toHandle } from './mentions';
import { markStarted } from './started';
import type { Profile } from './types';

export const OR_BASE = 'https://openrouter.ai/api/v1';
const VERIFIER = 'dissentry.or.verifier';
const STATE = 'dissentry.or.state';
export const CALLBACK_PATH = '/auth/openrouter';

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function startOpenRouterSignIn() {
  markStarted();
  const verifier = random();
  const state = random(16);
  sessionStorage.setItem(VERIFIER, verifier);
  sessionStorage.setItem(STATE, state);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const url = new URL('https://openrouter.ai/auth');
  url.searchParams.set('callback_url', location.origin + CALLBACK_PATH);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('key_label', 'Dissentry');
  location.assign(url.toString());
}

/** Finish the redirect: verify state, exchange the one-time code for the user's key. */
export async function finishOpenRouterSignIn(search: string): Promise<string> {
  const q = new URLSearchParams(search);
  const code = q.get('code');
  const verifier = sessionStorage.getItem(VERIFIER);
  const expected = sessionStorage.getItem(STATE);
  sessionStorage.removeItem(VERIFIER);
  sessionStorage.removeItem(STATE);
  if (!code) throw new Error('cancelled');
  if (!verifier || (expected && q.get('state') !== expected)) throw new Error('state');
  const r = await fetch(`${OR_BASE}/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { key } = await r.json();
  if (!key) throw new Error('no key');
  return key as string;
}

/** Prices are USD per million tokens. */
export interface OrModel { id: string; name: string; created: number; inPrice?: number; outPrice?: number }

/** Families we suggest, in order; the newest general-purpose model of each is pre-filled. */
export const FAMILIES: { vendor: string; handle: string; label: string; match?: RegExp }[] = [
  { vendor: 'anthropic', handle: 'claude', label: 'Claude', match: /sonnet|opus/ },
  { vendor: 'openai', handle: 'gpt', label: 'GPT', match: /gpt/ },
  { vendor: 'google', handle: 'gemini', label: 'Gemini', match: /gemini.*(flash|pro)/ },
  { vendor: 'deepseek', handle: 'deepseek', label: 'DeepSeek' },
  { vendor: 'qwen', handle: 'qwen', label: 'Qwen' },
  { vendor: 'x-ai', handle: 'grok', label: 'Grok' },
  { vendor: 'meta-llama', handle: 'llama', label: 'Llama' },
  { vendor: 'moonshotai', handle: 'kimi', label: 'Kimi' },
];

/** Default price ceiling, USD per million tokens (input / output). */
const MAX_IN = 3;
const MAX_OUT = 15;

const SKIP = /(:free|preview|image|audio|tts|embed|vision|search|online|guard|realtime|transcribe|-mini-?high|codex|distill|experimental|beta)/i;

export async function listOpenRouterModels(): Promise<OrModel[]> {
  const r = await fetch(`${OR_BASE}/models`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return (j.data ?? []).map(toOrModel);
}

export function toOrModel(m: { id: string; name?: string; created?: number; pricing?: { prompt?: string; completion?: string } }): OrModel {
  const per = (v?: string) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) * 1e6 : undefined);
  return { id: m.id, name: m.name ?? m.id, created: m.created ?? 0, inPrice: per(m.pricing?.prompt), outPrice: per(m.pricing?.completion) };
}

export function suggestModels(all: OrModel[]): { family: (typeof FAMILIES)[number]; model: OrModel }[] {
  const out: { family: (typeof FAMILIES)[number]; model: OrModel }[] = [];
  for (const f of FAMILIES) {
    const candidates = all
      .filter((m) => m.id.startsWith(`${f.vendor}/`) && !SKIP.test(m.id) && (!f.match || f.match.test(m.id)))
      .sort((a, b) => b.created - a.created);
    // Users pay per call, so default to the newest model at a mainstream price, not the priciest flagship.
    const affordable = candidates.find((m) => (m.inPrice ?? 0) <= MAX_IN && (m.outPrice ?? 0) <= MAX_OUT);
    const pick = affordable ?? candidates[0];
    if (pick) out.push({ family: f, model: pick });
  }
  return out;
}

/** Add the chosen models as profiles sharing the OpenRouter key. All become checkers. */
export async function addOpenRouterProfiles(key: string, picks: { handle: string; label: string; modelId: string; inPrice?: number; outPrice?: number }[]) {
  const existing = await db.profiles.toArray();
  const taken = new Set(existing.map((p) => p.handle));
  const now = Date.now();
  const profiles: Profile[] = picks.map((p, i) => {
    let handle = toHandle(p.handle);
    for (let n = 2; taken.has(handle); n++) handle = `${toHandle(p.handle)}${n}`;
    taken.add(handle);
    return {
      id: uid(), handle, name: p.label, color: '#6467f2', presetId: 'openrouter', protocol: 'openai',
      baseUrl: OR_BASE, modelId: p.modelId, apiKey: key, useProxy: true, systemPrompt: '',
      enabled: true, isChecker: true, webSearch: true, deepThink: false, inPrice: p.inPrice, outPrice: p.outPrice, createdAt: now + i,
    };
  });
  await db.profiles.bulkAdd(profiles);
  return profiles;
}
