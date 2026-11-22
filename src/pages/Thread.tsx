import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import { PageHeader } from '../components/Layout';
import { PostCard } from '../components/PostCard';
import { ReplyDialog } from '../components/ReplyDialog';
import { buildByParent, ReplyBranch } from '../components/ReplyTree';
import { useT } from '../i18n';
import { db } from '../lib/db';
import { useProfileMap, useTick } from '../lib/hooks';
import { getAncestors } from '../lib/store';
import type { Post } from '../lib/types';
import { threadTitle } from '../lib/ui';

export function ThreadPage({ id }: { id: string }) {
  const t = useT();
  useTick();
  const profiles = useProfileMap();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const wantsReply = params.has('reply');
  const scrollTargetParam = params.get('to');

  const [replyOpen, setReplyOpen] = useState(wantsReply);
  const [pendingReplyId, setPendingReplyId] = useState<string | null>(scrollTargetParam);
  const focusRef = useRef<HTMLDivElement>(null);
  const scrolledIdRef = useRef<string | null>(null);

  const data = useLiveQuery(async () => {
    const post = await db.posts.get(id);
    if (!post) return { missing: true as const };
    const chain = await getAncestors(post);
    const root = chain[0];
    // Load the full thread tree so nested multi-level replies and live model responses render inline immediately.
    const all = await db.posts.where('rootId').equals(root.id).sortBy('createdAt');
    const byParent = buildByParent(all);
    const replies = byParent.get(id) ?? [];
    const quotes = await db.posts.where('quoteOfId').equals(id).count();
    return { missing: false as const, post, ancestors: chain.slice(0, -1), root, replies, byParent, quotes };
  }, [id]);

  const loaded = Boolean(data && !data.missing);

  useEffect(() => {
    if (wantsReply) {
      setReplyOpen(true);
      history.replaceState(null, '', location.pathname);
    }
  }, [wantsReply, id]);

  useEffect(() => {
    if (scrollTargetParam) {
      setPendingReplyId(scrollTargetParam);
      history.replaceState(null, '', location.pathname);
    }
  }, [scrollTargetParam, id]);

  // Scroll to the focused post when entering a thread (unless jumping straight to a newly sent reply).
  useEffect(() => {
    if (!loaded || pendingReplyId || scrollTargetParam) return;
    if (scrolledIdRef.current === id) return;
    scrolledIdRef.current = id;
    focusRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [id, loaded, pendingReplyId, scrollTargetParam]);

  // After sending a reply, scroll directly to it so its live AI response is immediately visible.
  useEffect(() => {
    if (!pendingReplyId || !loaded) return;
    const el = document.getElementById(`post-${pendingReplyId}`);
    if (!el) return;
    scrolledIdRef.current = id;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setPendingReplyId(null);
  }, [pendingReplyId, loaded, data, id]);

  if (!data) return <PageHeader title={t('thread.title')} back />;
  if (data.missing) return (<><PageHeader title={t('thread.title')} back /><p className="p-8 text-slate-500">{t('thread.deleted')}</p></>);

  const { post, ancestors, replies, byParent, quotes, root } = data;
  const threadLocal = Boolean(root.localOnly || post.localOnly);
  const handleOf = (p: Post) => (p.kind === 'user' ? t('post.you') : profiles.get(p.profileId ?? '')?.handle);

  return (
    <div className="pb-28 md:pb-16">
      <PageHeader title={threadTitle(root.text, 50, root.attachments?.[0]?.name)} sub={threadLocal ? `${t('thread.title')} · ${t('route.localOnly')}` : t('thread.title')} back />
      {ancestors.map((a, i) => (
        <PostCard
          key={a.id}
          post={a}
          profiles={profiles}
          lineBelow
          replyingTo={i > 0 && ancestors[i - 1].kind === 'model' ? handleOf(ancestors[i - 1]) : undefined}
        />
      ))}
      <div ref={focusRef} className="scroll-mt-28 md:scroll-mt-16">
        <PostCard
          post={post}
          profiles={profiles}
          focused
          replyingTo={ancestors.length > 0 && ancestors[ancestors.length - 1].kind === 'model' ? handleOf(ancestors[ancestors.length - 1]) : undefined}
          onReply={() => setReplyOpen(true)}
        />
      </div>
      {quotes > 0 && <p className="border-t border-slate-100 px-4 py-2 text-[13px] text-slate-500">{t('thread.quoted', { n: quotes })}</p>}
      <div className="border-y border-slate-200/80 bg-slate-50/50 px-4 py-3">
        <button
          type="button"
          onClick={() => setReplyOpen(true)}
          className="w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 text-left text-[14.5px] text-slate-400 shadow-2xs transition hover:border-slate-300 hover:text-slate-500"
        >
          {t('thread.postReply')}
        </button>
      </div>
      {replies.map((r) => (
        <div key={r.id} className="border-b border-slate-200/80">
          <ReplyBranch
            post={r}
            parent={post}
            byParent={byParent}
            profiles={profiles}
            handleOf={handleOf}
            onReplied={(replyId) => setPendingReplyId(replyId)}
          />
        </div>
      ))}
      {replyOpen && (
        <ReplyDialog
          post={post}
          profiles={profiles}
          onClose={() => setReplyOpen(false)}
          onReplied={(replyId) => setPendingReplyId(replyId)}
        />
      )}
    </div>
  );
}
