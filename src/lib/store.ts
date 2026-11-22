// All persistence goes through here, so a sync backend can replace Dexie later without touching the UI.
import { db } from './db';
import { OPENROUTER_ACCOUNT_KEY, type OpenRouterAccount } from './openrouter';
import { getSettings, updateSettings, type Settings } from './settings';
import { abortAllStreams, abortStream } from './streams';
import type { Note, Post, Profile } from './types';

let clearHook: (() => Promise<void> | void) | null = null;
/** Register a callback invoked when clearAll() runs (used by disk persistence). */
export function onClearAll(fn: () => Promise<void> | void) { clearHook = fn; }

export async function getAncestors(post: Post): Promise<Post[]> {
  const chain: Post[] = [post];
  let cur = post;
  const seen = new Set([post.id]);
  while (cur.parentId && !seen.has(cur.parentId)) {
    const parent = await db.posts.get(cur.parentId);
    if (!parent) break;
    chain.unshift(parent);
    seen.add(parent.id);
    cur = parent;
  }
  return chain;
}

/**
 * Shared thread memory: returns every completed post in `upTo`'s thread chronologically up to `upTo`,
 * so all models in the same thread share one memory (including sibling answers from other models),
 * while excluding concurrent replies to `upTo` itself and any `excludeIds`.
 */
export async function getThreadPosts(upTo: Post, excludeIds: string[] = []): Promise<Post[]> {
  const excluded = new Set(excludeIds);
  const ancestors = await getAncestors(upTo);
  const ancestorIds = new Set(ancestors.map((p) => p.id));
  const all = await db.posts.where('rootId').equals(upTo.rootId).sortBy('createdAt');
  const included = all.filter((p) => {
    if (excluded.has(p.id)) return false;
    if (p.id === upTo.id) return false;
    if (ancestorIds.has(p.id)) return true;
    if (p.parentId === upTo.id) return false;
    if (p.status === 'streaming' || p.status === 'error') return false;
    return p.createdAt <= upTo.createdAt;
  });
  included.sort((a, b) => a.createdAt - b.createdAt);
  if (!excluded.has(upTo.id)) included.push(upTo);
  return included;
}

/** Active (non-dismissed) dissent notes keyed by postId, so follow-up turns remember corrections. */
export async function getThreadNotes(posts: Post[]): Promise<Record<string, Note[]>> {
  if (!posts.length) return {};
  const notes = await db.notes.where('postId').anyOf(posts.map((p) => p.id)).toArray();
  const out: Record<string, Note[]> = {};
  for (const n of notes) {
    if (n.status === 'dismissed') continue;
    (out[n.postId] ??= []).push(n);
  }
  return out;
}

/** True when `post` or its thread root is locked to local models only. */
export async function isThreadLocalOnly(post: Pick<Post, 'id' | 'rootId' | 'localOnly'>): Promise<boolean> {
  if (post.localOnly) return true;
  if (post.rootId && post.rootId !== post.id) {
    const root = await db.posts.get(post.rootId);
    if (root?.localOnly) return true;
  }
  return false;
}

/** Quoted-post chains for every quote in `chain` (quoted post and up to 3 posts above it). */
export async function getQuotes(chain: Post[]): Promise<Record<string, Post[]>> {
  const out: Record<string, Post[]> = {};
  for (const p of chain) {
    if (!p.quoteOfId || out[p.quoteOfId]) continue;
    const q = await db.posts.get(p.quoteOfId);
    if (q) out[q.id] = (await getAncestors(q)).slice(-4);
  }
  return out;
}

export async function profileMap(): Promise<Map<string, Profile>> {
  const all = await db.profiles.toArray();
  return new Map(all.map((p) => [p.id, p]));
}

/** Delete a post, its whole reply subtree, and their notes/checks. Returns deleted post IDs. */
export async function deletePostTree(id: string): Promise<string[]> {
  const ids: string[] = [];
  await db.transaction('rw', db.posts, db.notes, db.checks, async () => {
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift()!;
      ids.push(cur);
      const kids = await db.posts.where('parentId').equals(cur).primaryKeys();
      queue.push(...kids);
    }
    ids.forEach(abortStream);
    await db.posts.bulkDelete(ids);
    await db.notes.where('postId').anyOf(ids).delete();
    await db.checks.where('postId').anyOf(ids).delete();
  });
  return ids;
}

export async function exportAll(includeKeys: boolean) {
  const profiles = (await db.profiles.toArray()).map((p) => (includeKeys ? p : { ...p, apiKey: '' }));
  const posts = (await db.posts.toArray()).map((post) =>
    post.media?.some((m) => m.blob)
      ? { ...post, media: post.media.map(({ blob: _b, ...rest }) => rest) }
      : post,
  );
  const orRec = includeKeys ? await db.kv.get(OPENROUTER_ACCOUNT_KEY) : undefined;
  const openrouter = (orRec?.value as OpenRouterAccount | undefined)?.apiKey ? (orRec!.value as OpenRouterAccount) : null;
  const s = getSettings();
  return {
    app: 'dissentry',
    version: 1,
    exportedAt: new Date().toISOString(),
    userProfile: { userName: s.userName, userAvatar: s.userAvatar },
    settings: s,
    openrouter,
    profiles,
    posts,
    notes: await db.notes.toArray(),
    checks: await db.checks.toArray(),
  };
}

export async function importAll(data: Partial<Awaited<ReturnType<typeof exportAll>>>) {
  if (data?.app !== 'dissentry') throw new Error('Not a Dissentry export file');
  await db.transaction('rw', db.profiles, db.posts, db.notes, db.checks, db.kv, async () => {
    // Keep existing keys when the import has none.
    for (const p of data.profiles ?? []) {
      const existing = await db.profiles.get(p.id);
      await db.profiles.put({ ...p, apiKey: p.apiKey || existing?.apiKey || '' });
    }
    if (data.openrouter?.apiKey) {
      await db.kv.put({ key: OPENROUTER_ACCOUNT_KEY, value: data.openrouter });
    }
    await db.posts.bulkPut(data.posts ?? []);
    await db.notes.bulkPut(data.notes ?? []);
    await db.checks.bulkPut(data.checks ?? []);
  });
  const patch: Partial<Settings> = {};
  if (data.settings) {
    if (typeof data.settings.userName === 'string') patch.userName = data.settings.userName;
    if (typeof data.settings.userAvatar === 'string') patch.userAvatar = data.settings.userAvatar;
    if (typeof data.settings.autoCheck === 'boolean') patch.autoCheck = data.settings.autoCheck;
    if (typeof data.settings.webSearch === 'boolean') patch.webSearch = data.settings.webSearch;
    if (typeof data.settings.deepThink === 'boolean') patch.deepThink = data.settings.deepThink;
    if (data.settings.proxyMode === 'system' || data.settings.proxyMode === 'direct' || data.settings.proxyMode === 'custom') patch.proxyMode = data.settings.proxyMode;
    if (typeof data.settings.proxyUrl === 'string') patch.proxyUrl = data.settings.proxyUrl;
    if (typeof data.settings.proxyBypass === 'string') patch.proxyBypass = data.settings.proxyBypass;
  }
  if (data.userProfile) {
    if (typeof data.userProfile.userName === 'string') patch.userName = data.userProfile.userName;
    if (typeof data.userProfile.userAvatar === 'string') patch.userAvatar = data.userProfile.userAvatar;
  }
  if (Object.keys(patch).length) updateSettings(patch);
}

export async function clearAll() {
  abortAllStreams();
  await db.transaction('rw', db.profiles, db.posts, db.notes, db.checks, db.kv, async () => {
    await Promise.all([
      db.profiles.clear(),
      db.posts.clear(),
      db.notes.clear(),
      db.checks.clear(),
      db.kv.delete(OPENROUTER_ACCOUNT_KEY),
    ]);
  });
  await clearHook?.();
}
