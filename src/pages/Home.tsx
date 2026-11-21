import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Composer } from '../components/Composer';
import { PageHeader } from '../components/Layout';
import { PostCard } from '../components/PostCard';
import { db } from '../lib/db';
import { useProfileMap, useTick } from '../lib/hooks';
import type { Post } from '../lib/types';

const PAGE = 30;

export function HomePage() {
  useTick();
  const profiles = useProfileMap();
  const [limit, setLimit] = useState(PAGE);
  const roots = useLiveQuery(async () => {
    const posts = await db.posts.orderBy('createdAt').reverse().filter((p) => !p.parentId).limit(limit).toArray();
    const replies = await db.posts.where('parentId').anyOf(posts.map((p) => p.id)).sortBy('createdAt');
    const byParent = new Map<string, Post[]>();
    for (const r of replies) byParent.set(r.parentId!, [...(byParent.get(r.parentId!) ?? []), r]);
    return posts.map((p) => ({ post: p, replies: byParent.get(p.id) ?? [] }));
  }, [limit]);

  return (
    <>
      <PageHeader title="Home" sub="Ask one model. Let the others dissent." />
      <Composer />
      {roots?.length === 0 && profiles.size > 0 && <EmptyState />}
      {roots?.map(({ post, replies }) => (
        <div key={post.id} className="border-b border-slate-200">
          <PostCard post={post} profiles={profiles} lineBelow={replies.length > 0} />
          {replies.map((r, i) => (
            <PostCard key={r.id} post={r} profiles={profiles} lineBelow={i < replies.length - 1} />
          ))}
        </div>
      ))}
      {roots && roots.length >= limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="w-full py-4 text-sky-600 hover:bg-slate-50">Show more</button>
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="px-8 py-12 text-center">
      <h2 className="text-2xl font-extrabold">Don’t take one model’s word for it.</h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] text-slate-500">
        @mention a model to ask it anything. Models marked as <b>checkers</b> review every answer and attach a
        dissent note only when they find a problem. Accept or dismiss notes to see which models you can trust.
      </p>
      <p className="mt-4 text-[13px] text-slate-500">Tip: let a cheap or local model answer and a strong model check: you only pay for the long reply when it’s needed.</p>
    </div>
  );
}
