import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
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
  const wantsReply = new URLSearchParams(search).has('reply');
  const [replyOpen, setReplyOpen] = useState(wantsReply);
  const focusRef = useRef<HTMLDivElement>(null);
  const aboveReplyRef = useRef<HTMLDivElement>(null);
  const replyBoxRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrolledIdRef = useRef<string | null>(null);

  const data = useLiveQuery(async () => {
    const post = await db.posts.get(id);
    if (!post) return { missing: true as const };
    const chain = await getAncestors(post);
    const replies = await db.posts.where('parentId').equals(id).sortBy('createdAt');
    const quotes = await db.posts.where('quoteOfId').equals(id).count();
    return { missing: false as const, post, ancestors: chain.slice(0, -1), root: chain[0], replies, quotes };
  }, [id]);

  const loaded = Boolean(data && !data.missing);

  useEffect(() => { setReplyOpen(wantsReply); }, [wantsReply, id]);

  // On navigation into a thread: jump straight to the reply box when ?reply=1 is set
  // (keeping it centered as async notes/checks/images settle), or to the focused post otherwise.
  useEffect(() => {
    if (!loaded) return;
    if (!wantsReply) {
      if (scrolledIdRef.current === id) return;
      scrolledIdRef.current = id;
      focusRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      return;
    }

    scrolledIdRef.current = id;
    let stopped = false;
    const centerReply = () => {
      if (stopped) return;
      replyBoxRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
      replyInputRef.current?.focus({ preventScroll: true });
    };

    const raf = requestAnimationFrame(centerReply);
    const stop = () => { stopped = true; };
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('pointerdown', stop, { passive: true });

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && aboveReplyRef.current) {
      ro = new ResizeObserver(centerReply);
      ro.observe(aboveReplyRef.current);
    }
    const timer = setTimeout(() => {
      stopped = true;
      ro?.disconnect();
    }, 600);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      ro?.disconnect();
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('pointerdown', stop);
    };
  }, [id, loaded, wantsReply]);

  // Keep the reply box visible when the mobile soft keyboard resizes the visual viewport.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (document.activeElement && replyInputRef.current && document.activeElement === replyInputRef.current) {
        replyBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  function openReply() {
    // Synchronously mount Composer inside the tap/click gesture so mobile browsers open the keyboard immediately.
    flushSync(() => setReplyOpen(true));
    replyInputRef.current?.focus({ preventScroll: true });
    replyBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (!data) return <PageHeader title={t('thread.title')} back />;
  if (data.missing) return (<><PageHeader title={t('thread.title')} back /><p className="p-8 text-slate-500">{t('thread.deleted')}</p></>);

  const { post, ancestors, replies, quotes, root } = data;
  const author = post.profileId ? profiles.get(post.profileId) : undefined;
  const threadLocal = Boolean(root.localOnly || post.localOnly);

  return (
    <div className="pb-44 md:pb-24">
      <PageHeader title={threadTitle(root.text, 50, root.attachments?.[0]?.name)} sub={threadLocal ? `${t('thread.title')} · ${t('route.localOnly')}` : t('thread.title')} back />
      <div ref={aboveReplyRef}>
        {ancestors.map((a) => <PostCard key={a.id} post={a} profiles={profiles} lineBelow />)}
        <div ref={focusRef} className="scroll-mt-28 md:scroll-mt-16">
          <PostCard post={post} profiles={profiles} focused onReply={openReply} />
        </div>
        {quotes > 0 && <p className="border-t border-slate-100 px-4 py-2 text-[13px] text-slate-500">{t('thread.quoted', { n: quotes })}</p>}
      </div>
      <div ref={replyBoxRef} className="scroll-mb-36 scroll-mt-28 border-y border-slate-200/80 bg-slate-50/50 md:scroll-mb-16 md:scroll-mt-16">
        {replyOpen || replies.length === 0 ? (
          <Composer
            compact
            key={id}
            parentId={post.id}
            autoFocus={replyOpen}
            inputRef={replyInputRef}
            implicitHandle={author?.handle}
            forceLocalOnly={threadLocal}
            placeholder={author ? t('thread.replyTo', { handle: author.handle }) : t('thread.replyMention')}
            onPosted={() => {
              setReplyOpen(false);
              if (new URLSearchParams(location.search).has('reply')) history.replaceState(null, '', location.pathname);
            }}
          />
        ) : (
          <div className="px-4 py-3">
            <button onClick={openReply}
              className="w-full rounded-2xl border border-slate-200/90 bg-white px-4 py-3 text-left text-[15px] text-slate-400 shadow-2xs transition hover:border-slate-300 hover:text-slate-500">
              {t('thread.postReply')}
            </button>
          </div>
        )}
      </div>
      {replies.map((r) => <div key={r.id} className="border-b border-slate-200/80"><PostCard post={r} profiles={profiles} /></div>)}
    </div>
  );
}
