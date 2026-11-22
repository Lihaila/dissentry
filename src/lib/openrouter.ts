// "Sign in with OpenRouter" (OAuth PKCE): the user approves once on openrouter.ai and we receive
// an API key tied to their own account and credits. No server involved: openrouter.ai allows
// browser calls (CORS *) for both the key exchange and the public model list.
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from './db';
import { toHandle } from './mentions';
import { hasProxy, proxyFetch } from './providers';
import { markStarted } from './started';
import type { Profile } from './types';

export const OR_BASE = 'https://openrouter.ai/api/v1';
export const OPENROUTER_ACCOUNT_KEY = 'openrouter.account';
export const CALLBACK_PATH = '/auth/openrouter';

const PKCE_KEY = 'dissentry.or.pkce';
const LEGACY_VERIFIER = 'dissentry.or.verifier';
const LEGACY_STATE = 'dissentry.or.state';
const PKCE_TTL_MS = 15 * 60 * 1000;

interface PendingPkce {
  verifier: string;
  state: string;
  createdAt: number;
}

export interface OpenRouterAccount {
  apiKey: string;
  connectedAt: number;
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

const orFetch = (): typeof fetch => (hasProxy() ? proxyFetch : fetch);

function readLocalPkceList(): PendingPkce[] {
  try {
    const raw = localStorage.getItem(PKCE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const now = Date.now();
    return list.filter((p): p is PendingPkce =>
      Boolean(p) && typeof p === 'object'
      && typeof (p as PendingPkce).verifier === 'string'
      && typeof (p as PendingPkce).state === 'string'
      && typeof (p as PendingPkce).createdAt === 'number'
      && now - (p as PendingPkce).createdAt <= PKCE_TTL_MS,
    );
  } catch {
    return [];
  }
}

function writePendingPkce(pending: PendingPkce) {
  // Store in both sessionStorage and localStorage: mobile browsers (iOS Safari, Android Chrome,
  // PWAs) can lose sessionStorage across OAuth redirects or tab switches.
  try { sessionStorage.setItem(PKCE_KEY, JSON.stringify(pending)); } catch { /* ignore */ }
  try {
    const list = readLocalPkceList().slice(-4);
    list.push(pending);
    localStorage.setItem(PKCE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

function consumePendingPkce(returnedState: string | null): PendingPkce | null {
  const now = Date.now();
  let matched: PendingPkce | null = null;

  try {
    const raw = sessionStorage.getItem(PKCE_KEY);
    sessionStorage.removeItem(PKCE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<PendingPkce>;
      if (p.verifier && typeof p.state === 'string' && typeof p.createdAt === 'number' && now - p.createdAt <= PKCE_TTL_MS) {
        if (!p.state || returnedState === p.state) matched = p as PendingPkce;
      }
    }
  } catch { /* ignore */ }

  try {
    const list = readLocalPkceList();
    if (!matched && returnedState) {
      matched = list.find((p) => p.state === returnedState) ?? null;
    }
    const remaining = matched ? list.filter((p) => p.state !== matched!.state) : list;
    if (remaining.length) localStorage.setItem(PKCE_KEY, JSON.stringify(remaining));
    else localStorage.removeItem(PKCE_KEY);
  } catch { /* ignore */ }

  if (!matched) {
    // Backward compatibility if a sign-in started before this version deployed.
    try {
      const verifier = sessionStorage.getItem(LEGACY_VERIFIER);
      const state = sessionStorage.getItem(LEGACY_STATE) ?? '';
      sessionStorage.removeItem(LEGACY_VERIFIER);
      sessionStorage.removeItem(LEGACY_STATE);
      if (verifier && (!state || returnedState === state)) {
        matched = { verifier, state, createdAt: now };
      }
    } catch { /* ignore */ }
  }

  return matched;
}

function clearPendingPkce() {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      store().removeItem(PKCE_KEY);
      store().removeItem(LEGACY_VERIFIER);
      store().removeItem(LEGACY_STATE);
    } catch { /* ignore */ }
  }
}

export function maskOpenRouterKey(key: string): string {
  const k = key.trim();
  if (k.length <= 10) return '••••';
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

export async function saveOpenRouterAccount(apiKey: string): Promise<OpenRouterAccount> {
  const account: OpenRouterAccount = { apiKey: apiKey.trim(), connectedAt: Date.now() };
  await db.kv.put({ key: OPENROUTER_ACCOUNT_KEY, value: account });
  markStarted();
  return account;
}

export async function getOpenRouterAccount(): Promise<OpenRouterAccount | null> {
  const rec = await db.kv.get(OPENROUTER_ACCOUNT_KEY);
  const val = rec?.value as Partial<OpenRouterAccount> | undefined;
  if (typeof val?.apiKey === 'string' && val.apiKey.trim()) {
    return {
      apiKey: val.apiKey.trim(),
      connectedAt: typeof val.connectedAt === 'number' ? val.connectedAt : 0,
    };
  }
  // Backward compatibility: detect existing OpenRouter logins created before openrouter.account was stored.
  const orProfile = await db.profiles
    .filter((p) => p.presetId === 'openrouter' && Boolean(p.apiKey.trim()))
    .first();
  if (orProfile) {
    return { apiKey: orProfile.apiKey.trim(), connectedAt: orProfile.createdAt };
  }
  return null;
}

export function useOpenRouterAccount(): OpenRouterAccount | null | undefined {
  return useLiveQuery(() => getOpenRouterAccount(), []);
}

/** Disconnect OpenRouter: removes the saved API key and all OpenRouter model profiles from this browser. */
export async function signOutOpenRouter(): Promise<number> {
  clearPendingPkce();
  let removed = 0;
  await db.transaction('rw', db.kv, db.profiles, async () => {
    await db.kv.delete(OPENROUTER_ACCOUNT_KEY);
    const orProfiles = await db.profiles.filter((p) => p.presetId === 'openrouter').toArray();
    removed = orProfiles.length;
    if (orProfiles.length) {
      await db.profiles.bulkDelete(orProfiles.map((p) => p.id));
    }
  });
  return removed;
}

export async function startOpenRouterSignIn() {
  markStarted();
  const verifier = random();
  const state = random(16);
  writePendingPkce({ verifier, state, createdAt: Date.now() });
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const url = new URL('https://openrouter.ai/auth');
  url.searchParams.set('callback_url', location.origin + CALLBACK_PATH);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  url.searchParams.set('key_label', 'Dissentry');
  location.assign(url.toString());
}

/** Finish the redirect: verify state, exchange the one-time code for the user's key, and persist it immediately. */
export async function finishOpenRouterSignIn(search: string): Promise<string> {
  const q = new URLSearchParams(search);
  const code = q.get('code');
  const returnedState = q.get('state');
  if (!code) {
    clearPendingPkce();
    throw new Error('cancelled');
  }
  const pending = consumePendingPkce(returnedState);
  if (!pending?.verifier || (pending.state && returnedState !== pending.state)) throw new Error('state');
  const r = await orFetch()(`${OR_BASE}/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: pending.verifier, code_challenge_method: 'S256' }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const { key } = await r.json();
  if (!key || typeof key !== 'string') throw new Error('no key');
  // Persist right away so navigating away before picking models never drops the sign-in.
  await saveOpenRouterAccount(key);
  return key;
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
  const r = await orFetch()(`${OR_BASE}/models`);
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
  await saveOpenRouterAccount(key);
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
  if (profiles.length) await db.profiles.bulkAdd(profiles);
  return profiles;
}
