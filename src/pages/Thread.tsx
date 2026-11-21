import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import { Composer } from '../components/Composer';
import { PageHeader } from '../components/Layout';
import { PostCard } from '../components/PostCard';
import { db } from '../lib/db';
import { useProfileMap, useTick } from '../lib/hooks';
import { getAncestors } from '../lib/store';

export function ThreadPage({ id }: { id: string }) {
  useTick();
  const profiles = useProfileMap();
  const search = useSearch();
  const [replyOpen, setReplyOpen] = useState(false);
  const focusRef = useRef<HTMLDivElement>(null);

  const data = useLiveQuery(async () => {
    const post = await db.posts.get(id);
    if (!post) return { missing: true as const };
    const chain = await getAncestors(post);
    const replies = await db.posts.where('parentId').equals(id).sortBy('createdAt');
    const quotes = await db.posts.where('quoteOfId').equals(id).count();
    return { missing: false as const, post, ancestors: chain.slice(0, -1), replies, quotes };
  }, [id]);

  useEffect(() => { setReplyOpen(new URLSearchParams(search).has('reply')); }, [search, id]);
  useEffect(() => { focusRef.current?.scrollIntoView({ block: 'start' }); }, [id, data?.missing]);

  if (!data) return <PageHeader title="Post" back />;
  if (data.missing) return (<><PageHeader title="Post" back /><p className="p-8 text-slate-500">This post was deleted.</p></>);

  const { post, ancestors, replies, quotes } = data;
  const author = post.profileId ? profiles.get(post.profileId) : undefined;

  return (
    <>
      <PageHeader title="Post" back />
      {ancestors.map((a) => <PostCard key={a.id} post={a} profiles={profiles} lineBelow />)}
      <div ref={focusRef} className="scroll-mt-14">
        <PostCard post={post} profiles={profiles} focused onReply={() => setReplyOpen(true)} />
      </div>
      {quotes > 0 && <p className="border-b border-slate-200 px-4 py-2 text-[13px] text-slate-500">Quoted {quotes} time{quotes > 1 ? 's' : ''}</p>}
      {replyOpen || replies.length === 0 ? (
        <div className="border-b border-slate-200">
          <Composer
            compact
            key={id}
            parentId={post.id}
            autoFocus={replyOpen}
            implicitHandle={author?.handle}
            placeholder={author ? `Reply to @${author.handle} (or @mention another model)` : 'Reply and @mention a model'}
            onPosted={() => setReplyOpen(false)}
          />
        </div>
      ) : (
        <button onClick={() => setReplyOpen(true)} className="w-full border-b border-slate-200 px-4 py-3 text-left text-[15px] text-slate-500 hover:bg-slate-50">
          Post your reply…
        </button>
      )}
      {replies.map((r) => <PostCard key={r.id} post={r} profiles={profiles} />)}
    </>
  );
}
