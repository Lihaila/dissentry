import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Copy, MessageCircle, Quote, RefreshCw, ScanSearch, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useT } from '../i18n';
import { db } from '../lib/db';
import { regenerate, runChecks, stop } from '../lib/engine';
import { displayName, useSettings } from '../lib/settings';
import { deletePostTree } from '../lib/store';
import { fullDate, timeAgo } from '../lib/time';
import type { Post, Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { Markdown } from './Markdown';
import { NoteCard } from './NoteCard';
import { QuoteDialog } from './QuoteDialog';

interface Props {
  post: Post;
  profiles: Map<string, Profile>;
  /** Draw a connector line down to the next post in a thread. */
  lineBelow?: boolean;
  focused?: boolean;
  onReply?: () => void;
}

export function PostCard({ post, profiles, lineBelow, focused, onReply }: Props) {
  const t = useT();
  const [, navigate] = useLocation();
  const settings = useSettings();
  const [quoting, setQuoting] = useState(false);
  const [copied, setCopied] = useState(false);
  const profile = post.profileId ? profiles.get(post.profileId) : undefined;
  const notes = useLiveQuery(() => db.notes.where('postId').equals(post.id).sortBy('createdAt'), [post.id]) ?? [];
  const checks = useLiveQuery(() => db.checks.where('postId').equals(post.id).toArray(), [post.id]) ?? [];
  const replyCount = useLiveQuery(() => db.posts.where('parentId').equals(post.id).count(), [post.id]) ?? 0;
  const quoted = useLiveQuery(() => (post.quoteOfId ? db.posts.get(post.quoteOfId) : undefined), [post.quoteOfId]);
  const respondsTo = useLiveQuery(() => (post.respondsToNoteId ? db.notes.get(post.respondsToNoteId) : undefined), [post.respondsToNoteId]);

  const handles = (ids: string[]) => ids.map((id) => `@${profiles.get(id)?.handle ?? '?'}`).join(' ');
  const pending = checks.filter((c) => c.verdict === 'pending').map((c) => c.profileId);
  const passed = checks.filter((c) => c.verdict === 'ok').map((c) => c.profileId);
  const failed = checks.filter((c) => c.verdict === 'error');
  const visibleNotes = notes.filter((n) => n.status !== 'dismissed' || focused);
  const isUser = post.kind === 'user';
  const name = isUser ? displayName(settings, t('post.youName')) : profile?.name ?? t('post.deletedModel');
  const handle = isUser ? t('post.you') : profile?.handle ?? '—';
  const open = () => { if (!focused) navigate(`/post/${post.id}`); };

  return (
    <article
      onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button,pre,input,textarea') && !window.getSelection()?.toString()) open(); }}
      className={`relative flex gap-3 px-4 pt-3.5 ${lineBelow ? 'pb-0.5' : 'pb-2'} ${focused ? '' : 'cursor-pointer transition-colors hover:bg-slate-50/60'}`}
    >
      <div className="flex flex-col items-center">
        <Avatar profile={profile} user={isUser ? displayName(settings, t('post.youName')) : undefined} />
        {lineBelow && <div className="mt-1.5 w-0.5 flex-1 rounded-full bg-slate-200" />}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-baseline gap-1.5 text-[15px]">
          <span className="truncate font-bold text-ink">{name}</span>
          <span className="truncate text-slate-500">@{handle}</span>
          {profile && <span className="hidden truncate rounded-md bg-slate-100 px-1.5 py-px text-[11px] font-medium text-slate-500 sm:inline">{profile.modelId}</span>}
          <span className="text-slate-300">·</span>
          <span className="shrink-0 text-slate-500" title={fullDate(post.createdAt)}>{timeAgo(post.createdAt)}</span>
        </div>
        {respondsTo && <p className="text-[13px] text-slate-500">{t('post.respondingTo', { handle: profiles.get(respondsTo.profileId)?.handle ?? '?' })}</p>}

        <div className={`mt-0.5 text-slate-800 ${focused ? 'text-[16.5px]' : ''}`}>
          {isUser
            ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{highlightMentions(post.text)}</p>
            : post.text
              ? <Markdown text={post.text} streaming={post.status === 'streaming'} />
              : post.status === 'streaming' && <span className="dots text-2xl leading-none text-slate-400"><span>•</span><span>•</span><span>•</span></span>}
        </div>

        {post.status === 'error' && (
          <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-[13.5px] text-red-800">
            <span className="flex-1">{post.error}</span>
            <button onClick={(e) => { e.stopPropagation(); void regenerate(post); }} className="shrink-0 font-semibold underline">{t('post.retry')}</button>
          </div>
        )}
        {post.status === 'stopped' && <p className="mt-1 text-[13px] text-slate-500">{t('post.stopped')}</p>}

        {quoted && (
          <div onClick={(e) => { e.stopPropagation(); navigate(`/post/${quoted.id}`); }}
            className="mt-2.5 max-h-56 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 p-3 transition [mask-image:linear-gradient(to_bottom,black_75%,transparent)] hover:bg-slate-50/60">
            <QuotedHeader post={quoted} profiles={profiles} userName={displayName(settings, t('post.youName'))} />
            <div className="text-[14px]"><Markdown text={quoted.text} /></div>
          </div>
        )}

        {visibleNotes.map((n) => <NoteCard key={n.id} note={n} profiles={profiles} author={profile} />)}

        {post.kind === 'model' && checks.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-slate-500">
            {pending.length > 0 && <span>{t('post.checking', { handles: handles(pending) })}<span className="dots"><span>.</span><span>.</span><span>.</span></span></span>}
            {passed.length > 0 && <span className="flex items-center gap-1 text-emerald-700"><Check size={13} />{t('post.noDissent', { handles: handles(passed) })}</span>}
            {failed.map((c) => <span key={c.profileId} className="text-red-500" title={c.error}>⚠ {t('post.couldNotCheck', { handle: profiles.get(c.profileId)?.handle ?? '?' })}</span>)}
          </div>
        )}

        <div className="-ml-2 mt-1 flex max-w-md justify-between text-slate-400">
          <Action label={t('post.reply')} onClick={() => (onReply ? onReply() : navigate(`/post/${post.id}?reply=1`))} icon={<MessageCircle size={17} />} count={replyCount} hover="hover:text-sky-600 hover:bg-sky-50" />
          <Action label={t('post.quote')} onClick={() => setQuoting(true)} icon={<Quote size={17} />} hover="hover:text-emerald-600 hover:bg-emerald-50" />
          {post.kind === 'model' && post.status === 'streaming' && <Action label={t('post.stop')} onClick={() => stop(post.id)} icon={<Square size={16} />} hover="hover:text-red-600 hover:bg-red-50" />}
          {post.kind === 'model' && post.status === 'done' && <Action label={t('post.checkAgain')} onClick={() => void runChecks(post)} icon={<ScanSearch size={17} />} hover="hover:text-amber-600 hover:bg-amber-50" />}
          {post.kind === 'model' && post.status !== 'streaming' && <Action label={t('post.regenerate')} onClick={() => void regenerate(post)} icon={<RefreshCw size={16} />} hover="hover:text-violet-600 hover:bg-violet-50" />}
          <Action label={copied ? t('post.copied') : t('post.copy')} onClick={() => { void navigator.clipboard.writeText(post.text); setCopied(true); setTimeout(() => setCopied(false), 1200); }} icon={copied ? <Check size={16} /> : <Copy size={16} />} hover="hover:text-sky-600 hover:bg-sky-50" />
          <Action label={t('post.delete')} onClick={() => { if (window.confirm(t('post.deleteConfirm'))) void deletePostTree(post.id).then(() => focused && navigate('/')); }} icon={<Trash2 size={16} />} hover="hover:text-red-600 hover:bg-red-50" />
        </div>
      </div>
      {quoting && <QuoteDialog post={post} profiles={profiles} onClose={() => setQuoting(false)} />}
    </article>
  );
}

function Action({ label, onClick, icon, count, hover }: { label: string; onClick: () => void; icon: React.ReactNode; count?: number; hover: string }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={label} aria-label={label}
      className={`flex items-center gap-1 rounded-full p-2 text-[13px] transition-colors ${hover}`}>
      {icon}{count ? <span>{count}</span> : null}
    </button>
  );
}

export function QuotedHeader({ post, profiles, userName }: { post: Post; profiles: Map<string, Profile>; userName: string }) {
  const t = useT();
  const p = post.profileId ? profiles.get(post.profileId) : undefined;
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[14px]">
      <Avatar profile={p} user={post.kind === 'user' ? userName : undefined} size={20} />
      <b className="truncate">{post.kind === 'user' ? userName : p?.name}</b>
      <span className="truncate text-slate-500">@{post.kind === 'user' ? t('post.you') : p?.handle} · {timeAgo(post.createdAt)}</span>
    </div>
  );
}

function highlightMentions(text: string) {
  return text.split(/(@[a-z0-9][a-z0-9_.-]*)/gi).map((part, i) =>
    part.startsWith('@') ? <span key={i} className="font-medium text-sky-600">{part}</span> : part);
}
