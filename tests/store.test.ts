import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { runChecks, runReply } from '../src/lib/engine';
import { clearAll, deletePostTree, exportAll, getThreadNotes, getThreadPosts, importAll, isThreadLocalOnly } from '../src/lib/store';
import { getSettings, updateSettings } from '../src/lib/settings';
import { trackStream, untrackStream } from '../src/lib/streams';
import type { Post, Profile } from '../src/lib/types';

const p = (id: string, parentId?: string, rootId = 'r'): Post => ({ id, kind: parentId ? 'model' : 'user', text: id, parentId, rootId, status: 'done', createdAt: Date.now() });

describe('deletePostTree', () => {
  beforeEach(async () => { await db.posts.clear(); await db.notes.clear(); await db.checks.clear(); });
  it('deletes a thread root with all replies, notes and checks and returns deleted ids', async () => {
    await db.posts.bulkAdd([p('r'), p('a', 'r'), p('b', 'a'), p('other', undefined, 'other')]);
    await db.notes.add({ id: 'n', postId: 'a', profileId: 'x', agreeProfileIds: [], claim: 'c', correction: 'd', severity: 'minor', status: 'open', createdAt: 0 });
    await db.checks.add({ postId: 'a', profileId: 'x', verdict: 'ok', createdAt: 0 });
    const deleted = await deletePostTree('r');
    expect(deleted.sort()).toEqual(['a', 'b', 'r']);
    expect((await db.posts.toArray()).map((x) => x.id)).toEqual(['other']);
    expect(await db.notes.count()).toBe(0);
    expect(await db.checks.count()).toBe(0);
  });

  it('aborts active streams in the deleted subtree without touching unrelated streams', async () => {
    await db.posts.bulkAdd([p('r'), p('a', 'r'), p('other', undefined, 'other')]);
    const inTree = new AbortController();
    const outside = new AbortController();
    trackStream('a', inTree);
    trackStream('other', outside);
    try {
      await deletePostTree('r');
      expect(inTree.signal.aborted).toBe(true);
      expect(outside.signal.aborted).toBe(false);
    } finally {
      untrackStream('a');
      untrackStream('other');
    }
  });

  it('aborts all active streams on clearAll', async () => {
    const ctrl = new AbortController();
    trackStream('s1', ctrl);
    try {
      await clearAll();
      expect(ctrl.signal.aborted).toBe(true);
    } finally {
      untrackStream('s1');
    }
  });
});

describe('shared thread memory', () => {
  beforeEach(async () => { await db.posts.clear(); await db.notes.clear(); });

  it('includes earlier sibling answers across the same thread while excluding concurrent replies and errors', async () => {
    const root: Post = { id: 'r', kind: 'user', text: '@claude @qwen compare A and B', rootId: 'r', status: 'done', createdAt: 10 };
    const ansClaude: Post = { id: 'a1', kind: 'model', profileId: 'c', text: 'Claude says A', parentId: 'r', rootId: 'r', status: 'done', createdAt: 20 };
    const ansQwen: Post = { id: 'a2', kind: 'model', profileId: 'q', text: 'Qwen says B', parentId: 'r', rootId: 'r', status: 'done', createdAt: 30 };
    const errReply: Post = { id: 'e1', kind: 'model', profileId: 'g', text: 'partial', parentId: 'r', rootId: 'r', status: 'error', createdAt: 35 };
    const follow: Post = { id: 'u2', kind: 'user', text: '@gemini who is right?', parentId: 'a1', rootId: 'r', status: 'done', createdAt: 40 };
    const concurrent: Post = { id: 'a3', kind: 'model', profileId: 'c', text: 'sibling reply to u2', parentId: 'u2', rootId: 'r', status: 'done', createdAt: 50 };
    const otherThread: Post = { id: 'o1', kind: 'user', text: 'unrelated', rootId: 'o1', status: 'done', createdAt: 15 };
    await db.posts.bulkAdd([root, ansClaude, ansQwen, errReply, follow, concurrent, otherThread]);

    const shared = await getThreadPosts(follow, ['excluded']);
    expect(shared.map((x) => x.id)).toEqual(['r', 'a1', 'a2', 'u2']);
  });

  it('returns open and accepted notes for thread posts while skipping dismissed notes', async () => {
    const a1: Post = { id: 'a1', kind: 'model', profileId: 'c', text: 'ans', parentId: 'r', rootId: 'r', status: 'done', createdAt: 20 };
    await db.notes.bulkAdd([
      { id: 'n1', postId: 'a1', profileId: 'q', agreeProfileIds: [], claim: 'c1', correction: 'fix1', severity: 'major', status: 'open', createdAt: 1 },
      { id: 'n2', postId: 'a1', profileId: 'g', agreeProfileIds: [], claim: 'c2', correction: 'fix2', severity: 'minor', status: 'dismissed', createdAt: 2 },
      { id: 'n3', postId: 'a1', profileId: 'q', agreeProfileIds: [], claim: 'c3', correction: 'fix3', severity: 'critical', status: 'accepted', createdAt: 3 },
    ]);
    const notes = await getThreadNotes([a1]);
    expect(notes.a1?.map((n) => n.id)).toEqual(['n1', 'n3']);
  });

  it('exports and restores local userName and userAvatar', async () => {
    updateSettings({ userName: 'Wade', userAvatar: 'data:image/png;base64,AAAA' });
    const dump = await exportAll(false);
    expect(dump.userProfile).toEqual({ userName: 'Wade', userAvatar: 'data:image/png;base64,AAAA' });
    updateSettings({ userName: '', userAvatar: '' });
    await importAll(dump);
    expect(getSettings().userName).toBe('Wade');
    expect(getSettings().userAvatar).toBe('data:image/png;base64,AAAA');
    updateSettings({ userName: '', userAvatar: '' });
  });

  it('enforces local-only thread privacy so cloud models and cloud checkers are never invoked', async () => {
    await db.profiles.clear();
    const localProf: Profile = {
      id: 'loc', handle: 'llama', name: 'Llama', color: '#333', presetId: 'ollama', protocol: 'openai',
      baseUrl: 'http://localhost:11434/v1', modelId: 'llama3.2', apiKey: '', useProxy: false,
      systemPrompt: '', enabled: true, isChecker: true, createdAt: 1,
    };
    const cloudProf: Profile = {
      id: 'cld', handle: 'claude', name: 'Claude', color: '#d97', presetId: 'anthropic', protocol: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1', modelId: 'claude-sonnet-5-5', apiKey: 'sk-test', useProxy: false,
      systemPrompt: '', enabled: true, isChecker: true, createdAt: 2,
    };
    await db.profiles.bulkAdd([localProf, cloudProf]);

    const root: Post = { id: 'lr', kind: 'user', text: 'private note', rootId: 'lr', status: 'done', localOnly: true, createdAt: 10 };
    const localAns: Post = { id: 'la', kind: 'model', profileId: 'loc', parentId: 'lr', rootId: 'lr', text: 'local answer', status: 'done', createdAt: 20 };
    await db.posts.bulkAdd([root, localAns]);

    expect(await isThreadLocalOnly(root)).toBe(true);
    expect(await isThreadLocalOnly(localAns)).toBe(true);

    // Attempting to run a cloud reply on a local-only thread must refuse without storing or sending anything.
    const refused = await runReply(cloudProf, root);
    expect(refused.status).toBe('stopped');
    expect(await db.posts.get(refused.id)).toBeUndefined();

    // Running checks on a local-only answer must skip cloud checkers (0 checks created for cloudProf).
    await runChecks(localAns);
    expect(await db.checks.where('postId').equals('la').count()).toBe(0);
  });
});
