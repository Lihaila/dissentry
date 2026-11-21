import Dexie, { type Table } from 'dexie';
import type { Check, Note, Post, Profile } from './types';

export interface KVEntry {
  key: string;
  value: unknown;
}

export class DissentryDB extends Dexie {
  profiles!: Table<Profile, string>;
  posts!: Table<Post, string>;
  notes!: Table<Note, string>;
  checks!: Table<Check, [string, string]>;
  kv!: Table<KVEntry, string>;

  constructor() {
    super('dissentry');
    this.version(1).stores({
      profiles: 'id, handle, createdAt',
      posts: 'id, rootId, parentId, quoteOfId, profileId, createdAt',
      notes: 'id, postId, profileId, status, createdAt',
      checks: '[postId+profileId], postId, profileId',
    });
    this.version(2).stores({
      kv: 'key',
    });
  }
}

export const db = new DissentryDB();

export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
