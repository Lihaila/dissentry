import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useSettings } from '../lib/settings';
import type { Post, Profile } from '../lib/types';
import { Composer } from './Composer';
import { Markdown } from './Markdown';
import { QuotedHeader } from './PostCard';

export function QuoteDialog({ post, profiles, onClose }: { post: Post; profiles: Map<string, Profile>; onClose: () => void }) {
  const [, navigate] = useLocation();
  const { userName } = useSettings();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const author = post.profileId ? profiles.get(post.profileId) : undefined;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/40 p-4 pt-[8vh] backdrop-blur-sm dark:bg-slate-700/40"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[600px] cursor-default rounded-2xl bg-white shadow-2xl dark:bg-black" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-3">
          <button onClick={onClose} className="rounded-full p-1.5 text-lg leading-none hover:bg-slate-100 dark:hover:bg-slate-900" aria-label="Close">✕</button>
          <span className="text-[13px] text-slate-500">Quote with a note, then @mention who should respond</span>
        </div>
        <Composer
          compact
          autoFocus
          quoteOfId={post.id}
          placeholder={author ? `Add a note, e.g. "@${[...profiles.values()].find((p) => p.id !== author.id)?.handle ?? 'model'} is this right?"` : 'Add a note…'}
          onPosted={(id) => { onClose(); navigate(`/post/${id}`); }}
        />
        <div className="mx-4 mb-4 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <QuotedHeader post={post} profiles={profiles} userName={userName} />
          <div className="text-[14px]"><Markdown text={post.text} /></div>
        </div>
      </div>
    </div>
  );
}
