import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useT } from '../i18n';
import { displayName, useSettings } from '../lib/settings';
import { isThreadLocalOnly } from '../lib/store';
import { timeAgo } from '../lib/time';
import type { Post, Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { Composer } from './Composer';
import { Markdown } from './Markdown';

interface Props {
  post: Post;
  profiles: Map<string, Profile>;
  onClose: () => void;
  /** Optional custom handler after posting (used by ThreadPage to stay inline when already in the thread). */
  onReplied?: (replyId: string) => void;
}

export function ReplyDialog({ post, profiles, onClose, onReplied }: Props) {
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

  const author = post.profileId ? profiles.get(post.profileId) : undefined;
  const isUser = post.kind === 'user';
  const name = isUser ? userName : author?.name ?? t('post.deletedModel');
  const handle = isUser ? t('post.you') : author?.handle ?? '—';

  return (
    <div
      className="animate-backdrop fixed inset-0 z-50 flex cursor-default items-start justify-center overflow-y-auto bg-slate-900/35 p-3 pb-16 pt-[6vh] backdrop-blur-[3px] sm:pt-[8vh]"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('reply.title')}
        className="animate-modal w-full max-w-[600px] rounded-3xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200/90"
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
          <span className="text-[13.5px] font-semibold text-ink">{t('reply.title')}</span>
          <span className="w-8" />
        </div>

        {/* X-style parent post preview with vertical thread connector leading into your reply composer */}
        <div className="flex gap-3 px-4 pt-3.5">
          <div className="flex flex-col items-center">
            <Avatar profile={author} user={isUser ? userName : undefined} size={34} />
            <div className="mt-1.5 w-[2px] flex-1 rounded-full bg-slate-200/90" />
          </div>
          <div className="min-w-0 flex-1 pb-2">
            <div className="flex items-center gap-1.5 text-[14px]">
              <span className="truncate font-bold text-ink">{name}</span>
              <span className="truncate text-slate-500">@{handle}</span>
              <span className="text-slate-300">·</span>
              <span className="shrink-0 text-[12.5px] text-slate-400">{timeAgo(post.createdAt)}</span>
            </div>
            {post.text && (
              <div className="mt-1 max-h-36 overflow-y-auto text-[14px] text-slate-700">
                <Markdown text={post.text} />
              </div>
            )}
            <p className="mt-2 text-[12.5px] text-slate-500">
              {t('reply.replyingTo', { handle })}
            </p>
          </div>
        </div>

        <Composer
          compact
          autoFocus
          parentId={post.id}
          implicitHandle={author?.handle}
          forceLocalOnly={localOnly}
          placeholder={author ? t('thread.replyTo', { handle: author.handle }) : t('thread.replyMention')}
          onPosted={(replyId) => {
            onClose();
            if (onReplied) {
              onReplied(replyId);
            } else {
              navigate(`/post/${post.id}?to=${replyId}`);
            }
          }}
        />
      </div>
    </div>
  );
}
