import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import { Composer } from '../components/Composer';
import { PageHeader } from '../components/Layout';
import { PostCard } from '../components/PostCard';
import { useT } from '../i18n';
import { db } from '../lib/db';
import { useProfileMap, useTick } from '../lib/hooks';
import { getAncestors } from '../lib/store';
import { threadTitle } from '../lib/ui';

export function ThreadPage({ id }: { id: string }) {
  const t = useT();
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
    return { missing: false as const, post, ancestors: chain.slice(0, -1), root: chain[0], replies, quotes };
  }, [id]);

  useEffect(() => { setReplyOpen(new URLSearchParams(search).has('reply')); }, [search, id]);
  useEffect(() => { focusRef.current?.scrollIntoView({ block: 'start' }); }, [id, data?.missing]);

  if (!data) return <PageHeader title={t('thread.title')} back />;
  if (data.missing) return (<><PageHeader title={t('thread.title')} back /><p className="p-8 text-slate-500">{t('thread.deleted')}</p></>);

  const { post, ancestors, replies, quotes, root } = data;
  const author = post.profileId ? profiles.get(post.profileId) : undefined;
  const threadLocal = Boolean(root.localOnly || post.localOnly);

  return (
    <>
      <PageHeader title={threadTitle(root.text, 50, root.attachments?.[0]?.name)} sub={threadLocal ? `${t('thread.title')} · ${t('route.localOnly')}` : t('thread.title')} back />
      {ancestors.map((a) => <PostCard key={a.id} post={a} profiles={profiles} lineBelow />)}
      <div ref={focusRef} className="scroll-mt-16">
        <PostCard post={post} profiles={profiles} focused onReply={() => setReplyOpen(true)} />
      </div>
      {quotes > 0 && <p className="border-t border-slate-100 px-4 py-2 text-[13px] text-slate-500">{t('thread.quoted', { n: quotes })}</p>}
      <div className="border-y border-slate-200/80 bg-slate-50/50">
        {replyOpen || replies.length === 0 ? (
          <Composer compact key={id} parentId={post.id} autoFocus={replyOpen} implicitHandle={author?.handle} forceLocalOnly={threadLocal}
            placeholder={author ? t('thread.replyTo', { handle: author.handle }) : t('thread.replyMention')}
            onPosted={() => setReplyOpen(false)} />
        ) : (
          <div className="px-4 py-3">
            <button onClick={() => setReplyOpen(true)}
              className="w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-left text-[15px] text-slate-400 shadow-2xs transition hover:border-slate-300 hover:text-slate-500">
              {t('thread.postReply')}
            </button>
          </div>
        )}
      </div>
      {replies.map((r) => <div key={r.id} className="border-b border-slate-200/80"><PostCard post={r} profiles={profiles} /></div>)}
    </>
  );
}
