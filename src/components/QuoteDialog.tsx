import { useLiveQuery } from 'dexie-react-hooks';
import { Quote, X } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useT } from '../i18n';
import { isLocalProfile } from '../lib/providers';
import { displayName, useSettings } from '../lib/settings';
import { isThreadLocalOnly } from '../lib/store';
import type { Post, Profile } from '../lib/types';
import { Composer } from './Composer';
import { Markdown } from './Markdown';
import { QuotedHeader } from './PostCard';

export function QuoteDialog({ post, profiles, onClose }: { post: Post; profiles: Map<string, Profile>; onClose: () => void }) {
  const t = useT();
  const [, navigate] = useLocation();
  const userName = displayName(useSettings(), t('post.youName'));
  const localOnly = useLiveQuery(() => isThreadLocalOnly(post), [post.id, post.rootId, post.localOnly]) ?? !!post.localOnly;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const eligible = [...profiles.values()].filter((p) => p.enabled && (!localOnly || isLocalProfile(p)));
  const other = eligible.find((p) => p.id !== post.profileId) ?? eligible[0];

  return (
    <div
      className="modal-backdrop animate-backdrop fixed inset-0 z-50 flex cursor-default items-start justify-center overflow-y-auto bg-slate-900/35 p-3 pb-16 pt-[6vh] backdrop-blur-[3px] sm:pt-[8vh]"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('quote.title')}
        className="surface-card animate-modal w-full max-w-[600px] rounded-3xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200/90"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink"
            aria-label={t('common.close')}
          >
            <X size={17} />
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
            <Quote size={12} />
            {t('quote.title')}
          </span>
          <span className="w-8" />
        </div>

        {/* X-style quote layout: your commentary composer on top, embedded quoted post card below */}
        <Composer
          compact
          autoFocus
          quoteOfId={post.id}
          initialText={other ? `@${other.handle} ` : ''}
          forceLocalOnly={localOnly}
          placeholder={other ? t('quote.placeholder', { handle: other.handle }) : t('quote.placeholderPlain')}
          onPosted={(id) => { onClose(); navigate(`/post/${id}`); }}
        />

        <div className="mx-4 mb-4 max-h-56 overflow-y-auto rounded-2xl border border-slate-200/90 bg-slate-50/50 p-3">
          <QuotedHeader post={post} profiles={profiles} userName={userName} />
          {post.text && <div className="text-[14px] text-slate-700"><Markdown text={post.text} /></div>}
        </div>
      </div>
    </div>
  );
}
