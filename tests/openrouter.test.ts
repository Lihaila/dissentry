import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db';
import {
  addOpenRouterProfiles,
  finishOpenRouterSignIn,
  getOpenRouterAccount,
  maskOpenRouterKey,
  OPENROUTER_ACCOUNT_KEY,
  OR_BASE,
  saveOpenRouterAccount,
  signOutOpenRouter,
  startOpenRouterSignIn,
} from '../src/lib/openrouter';
import { clearAll, exportAll, importAll } from '../src/lib/store';

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear() { map.clear(); },
    getItem(k: string) { return map.get(k) ?? null; },
    key(i: number) { return [...map.keys()][i] ?? null; },
    removeItem(k: string) { map.delete(k); },
    setItem(k: string, v: string) { map.set(k, String(v)); },
  };
}

describe('OpenRouter auth and account lifecycle', () => {
  const origFetch = globalThis.fetch;
  let assignedUrl = '';

  beforeEach(async () => {
    assignedUrl = '';
    vi.stubGlobal('sessionStorage', makeStorage());
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('location', {
      origin: 'https://dissentry.lihaila.com',
      assign(url: string) { assignedUrl = url; },
    });
    await db.kv.clear();
    await clearAll();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.unstubAllGlobals();
  });

  it('persists OpenRouter login immediately on code exchange and survives sessionStorage loss (mobile redirect)', async () => {
    await startOpenRouterSignIn();
    const redirect = new URL(assignedUrl);
    const state = redirect.searchParams.get('state')!;
    expect(state).toBeTruthy();

    // Simulate mobile browser losing sessionStorage across the OAuth redirect / tab switch.
    sessionStorage.clear();

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ key: 'sk-or-v1-testkey1234' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

    const key = await finishOpenRouterSignIn(`code=auth_code_1&state=${encodeURIComponent(state)}`);
    expect(key).toBe('sk-or-v1-testkey1234');

    // Account is immediately persisted even before adding any models.
    const account = await getOpenRouterAccount();
    expect(account?.apiKey).toBe('sk-or-v1-testkey1234');
    expect(await db.profiles.count()).toBe(0);
  });

  it('rejects mismatched CSRF state', async () => {
    await startOpenRouterSignIn();
    await expect(finishOpenRouterSignIn('code=auth_code_1&state=wrong_state')).rejects.toThrow('state');
    expect(await getOpenRouterAccount()).toBeNull();
  });

  it('detects legacy OpenRouter logins from existing OpenRouter profiles', async () => {
    await db.profiles.add({
      id: 'p-or-1',
      handle: 'claude',
      name: 'Claude',
      color: '#6467f2',
      presetId: 'openrouter',
      protocol: 'openai',
      baseUrl: OR_BASE,
      modelId: 'anthropic/claude-sonnet-4',
      apiKey: 'sk-or-v1-legacy9999',
      useProxy: true,
      systemPrompt: '',
      enabled: true,
      isChecker: true,
      createdAt: 1000,
    });
    const account = await getOpenRouterAccount();
    expect(account?.apiKey).toBe('sk-or-v1-legacy9999');
    expect(account?.connectedAt).toBe(1000);
  });

  it('signs out cleanly: removes OpenRouter key and OpenRouter models, keeps other models and posts', async () => {
    await addOpenRouterProfiles('sk-or-v1-abc1234567', [
      { handle: 'claude', label: 'Claude', modelId: 'anthropic/claude-sonnet-4' },
      { handle: 'gpt', label: 'GPT', modelId: 'openai/gpt-5' },
    ]);
    await db.profiles.add({
      id: 'p-local',
      handle: 'ollama',
      name: 'Ollama',
      color: '#111111',
      presetId: 'ollama',
      protocol: 'openai',
      baseUrl: 'http://localhost:11434/v1',
      modelId: 'llama3.3',
      apiKey: '',
      useProxy: true,
      systemPrompt: '',
      enabled: true,
      isChecker: false,
      createdAt: 2000,
    });
    await db.posts.add({
      id: 'post-1',
      kind: 'user',
      text: 'hello',
      rootId: 'post-1',
      status: 'done',
      createdAt: 3000,
    });

    const removed = await signOutOpenRouter();
    expect(removed).toBe(2);
    expect(await getOpenRouterAccount()).toBeNull();
    expect(await db.kv.get(OPENROUTER_ACCOUNT_KEY)).toBeUndefined();
    const remainingProfiles = await db.profiles.toArray();
    expect(remainingProfiles.map((p) => p.id)).toEqual(['p-local']);
    expect(await db.posts.count()).toBe(1);
  });

  it('round-trips OpenRouter account in export/import and strips key when exporting without keys', async () => {
    await saveOpenRouterAccount('sk-or-v1-backup5678');

    const safeDump = await exportAll(false);
    expect(safeDump.openrouter).toBeNull();

    const fullDump = await exportAll(true);
    expect(fullDump.openrouter?.apiKey).toBe('sk-or-v1-backup5678');

    await clearAll();
    expect(await getOpenRouterAccount()).toBeNull();

    await importAll(fullDump);
    expect((await getOpenRouterAccount())?.apiKey).toBe('sk-or-v1-backup5678');
  });

  it('masks keys cleanly for display', () => {
    expect(maskOpenRouterKey('sk-or-v1-abcdef1234567890')).toBe('sk-or-…7890');
    expect(maskOpenRouterKey('short')).toBe('••••');
  });
});
