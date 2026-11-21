import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useT } from '../i18n';
import { displayName, useSettings } from '../lib/settings';
import type { Post, Profile } from '../lib/types';
import { Composer } from './Composer';
import { Markdown } from './Markdown';
import { QuotedHeader } from './PostCard';

export function QuoteDialog({ post, profiles, onClose }: { post: Post; profiles: Map<string, Profile>; onClose: () => void }) {
  const t = useT();
  const [, navigate] = useLocation();
  const userName = displayName(useSettings(), t('post.youName'));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const other = [...profiles.values()].find((p) => p.enabled && p.id !== post.profileId);

  return (
    <div className="animate-backdrop fixed inset-0 z-50 flex cursor-default items-start justify-center bg-slate-900/35 p-3 pt-[8vh] backdrop-blur-[3px]"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="animate-modal w-full max-w-[600px] rounded-3xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200/90" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink" aria-label={t('common.close')}>
            <X size={17} />
          </button>
          <span className="text-[13px] font-medium text-slate-500">{t('quote.hint')}</span>
          <span className="w-8" />
        </div>
        <Composer compact autoFocus quoteOfId={post.id}
          placeholder={other ? t('quote.placeholder', { handle: other.handle }) : t('quote.placeholderPlain')}
          onPosted={(id) => { onClose(); navigate(`/post/${id}`); }} />
        <div className="mx-4 mb-4 max-h-72 overflow-y-auto rounded-2xl border border-slate-200/90 bg-slate-50/40 p-3">
          <QuotedHeader post={post} profiles={profiles} userName={userName} />
          <div className="text-[14px]"><Markdown text={post.text} /></div>
        </div>
      </div>
    </div>
  );
}
