import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/lib/db';
import { deletePostTree } from '../src/lib/store';
import type { Post } from '../src/lib/types';

const p = (id: string, parentId?: string, rootId = 'r'): Post => ({ id, kind: parentId ? 'model' : 'user', text: id, parentId, rootId, status: 'done', createdAt: Date.now() });

describe('deletePostTree', () => {
  beforeEach(async () => { await db.posts.clear(); await db.notes.clear(); await db.checks.clear(); });
  it('deletes a thread root with all replies, notes and checks', async () => {
    await db.posts.bulkAdd([p('r'), p('a', 'r'), p('b', 'a'), p('other', undefined, 'other')]);
    await db.notes.add({ id: 'n', postId: 'a', profileId: 'x', agreeProfileIds: [], claim: 'c', correction: 'd', severity: 'minor', status: 'open', createdAt: 0 });
    await db.checks.add({ postId: 'a', profileId: 'x', verdict: 'ok', createdAt: 0 });
    await deletePostTree('r');
    expect((await db.posts.toArray()).map((x) => x.id)).toEqual(['other']);
    expect(await db.notes.count()).toBe(0);
    expect(await db.checks.count()).toBe(0);
  });
});
