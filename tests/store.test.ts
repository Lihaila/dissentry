import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { clearAll, deletePostTree } from '../src/lib/store';
import { trackStream, untrackStream } from '../src/lib/streams';
import type { Post } from '../src/lib/types';

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
