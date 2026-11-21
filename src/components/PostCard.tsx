import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, MessageCircle, Quote, RefreshCw, ScanSearch, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { db } from '../lib/db';
import { regenerate, runChecks, stop } from '../lib/engine';
import { useSettings } from '../lib/settings';
import { deletePostTree } from '../lib/store';
import { timeAgo } from '../lib/time';
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

  const pending = checks.filter((c) => c.verdict === 'pending');
  const passed = checks.filter((c) => c.verdict === 'ok');
  const failed = checks.filter((c) => c.verdict === 'error');
  const visibleNotes = notes.filter((n) => n.status !== 'dismissed' || focused);
  const name = post.kind === 'user' ? settings.userName : profile?.name ?? 'Deleted model';
  const handle = post.kind === 'user' ? 'you' : profile?.handle ?? 'deleted';
  const open = () => { if (!focused) navigate(`/post/${post.id}`); };

  return (
    <article
      onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button,pre,input,textarea') && !window.getSelection()?.toString()) open(); }}
      className={`relative flex gap-3 px-4 pt-3 ${lineBelow ? 'pb-1' : 'border-b border-slate-200 pb-2 dark:border-slate-800'} ${focused ? '' : 'cursor-pointer hover:bg-slate-50/70 dark:hover:bg-white/[0.02]'}`}
    >
      <div className="flex flex-col items-center">
        <Avatar profile={profile} user={post.kind === 'user' ? settings.userName : undefined} />
        {lineBelow && <div className="mt-1 w-0.5 flex-1 bg-slate-200 dark:bg-slate-800" />}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex items-baseline gap-1.5 text-[15px]">
          <span className="truncate font-bold">{name}</span>
          <span className="truncate text-slate-500">@{handle}</span>
          {profile && <span className="hidden truncate rounded bg-slate-100 px-1.5 text-[11px] text-slate-500 sm:inline dark:bg-slate-900">{profile.modelId}</span>}
          <span className="text-slate-500">·</span>
          <span className="shrink-0 text-slate-500" title={new Date(post.createdAt).toLocaleString()}>{timeAgo(post.createdAt)}</span>
        </div>
        {respondsTo && <p className="text-[13px] text-slate-500">Responding to a note from @{profiles.get(respondsTo.profileId)?.handle}</p>}

        <div className={`mt-0.5 ${focused ? 'text-[17px]' : ''}`}>
          {post.kind === 'user'
            ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{highlightMentions(post.text)}</p>
            : post.text
              ? <Markdown text={post.text} streaming={post.status === 'streaming'} />
              : post.status === 'streaming' && <span className="dots text-2xl leading-none text-slate-400"><span>•</span><span>•</span><span>•</span></span>}
        </div>

        {post.status === 'error' && (
          <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-[13.5px] text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {post.error}
            <button onClick={() => void regenerate(post)} className="ml-2 font-semibold underline">Retry</button>
          </div>
        )}
        {post.status === 'stopped' && <p className="mt-1 text-[13px] text-slate-500">Stopped.</p>}

        {quoted && (
          <div onClick={(e) => { e.stopPropagation(); navigate(`/post/${quoted.id}`); }}
            className="mt-2 max-h-56 cursor-pointer overflow-hidden rounded-2xl border border-slate-200 p-3 [mask-image:linear-gradient(to_bottom,black_75%,transparent)] dark:border-slate-800">
            <QuotedHeader post={quoted} profiles={profiles} userName={settings.userName} />
            <div className="text-[14px]"><Markdown text={quoted.text} /></div>
          </div>
        )}

        {visibleNotes.map((n) => <NoteCard key={n.id} note={n} profiles={profiles} author={profile} />)}

        {post.kind === 'model' && checks.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 text-[12.5px] text-slate-500">
            {pending.length > 0 && <span>Checking with {pending.map((c) => `@${profiles.get(c.profileId)?.handle}`).join(' ')}<span className="dots"><span>.</span><span>.</span><span>.</span></span></span>}
            {passed.length > 0 && <span className="text-emerald-600 dark:text-emerald-500">✓ No dissent from {passed.map((c) => `@${profiles.get(c.profileId)?.handle}`).join(' ')}</span>}
            {failed.map((c) => <span key={c.profileId} className="text-red-500" title={c.error}>⚠ @{profiles.get(c.profileId)?.handle} could not check</span>)}
          </div>
        )}

        <div className="-ml-2 mt-1 flex max-w-md justify-between text-slate-500">
          <Action label="Reply" onClick={() => (onReply ? onReply() : navigate(`/post/${post.id}?reply=1`))} icon={<MessageCircle size={17} />} count={replyCount} hover="hover:text-sky-500" />
          <Action label="Quote" onClick={() => setQuoting(true)} icon={<Quote size={17} />} hover="hover:text-emerald-500" />
          {post.kind === 'model' && post.status === 'streaming' && <Action label="Stop" onClick={() => stop(post.id)} icon={<Square size={16} />} hover="hover:text-red-500" />}
          {post.kind === 'model' && post.status === 'done' && <Action label="Check again" onClick={() => void runChecks(post)} icon={<ScanSearch size={17} />} hover="hover:text-amber-500" />}
          {post.kind === 'model' && post.status !== 'streaming' && <Action label="Regenerate" onClick={() => void regenerate(post)} icon={<RefreshCw size={16} />} hover="hover:text-violet-500" />}
          <Action label={copied ? 'Copied' : 'Copy'} onClick={() => { void navigator.clipboard.writeText(post.text); setCopied(true); setTimeout(() => setCopied(false), 1200); }} icon={<Copy size={16} />} hover="hover:text-sky-500" />
          <Action label="Delete" onClick={() => { if (window.confirm('Delete this post and its replies?')) void deletePostTree(post.id).then(() => focused && navigate('/')); }} icon={<Trash2 size={16} />} hover="hover:text-red-500" />
        </div>
      </div>
      {quoting && <QuoteDialog post={post} profiles={profiles} onClose={() => setQuoting(false)} />}
    </article>
  );
}

function Action({ label, onClick, icon, count, hover }: { label: string; onClick: () => void; icon: React.ReactNode; count?: number; hover: string }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={label} aria-label={label}
      className={`group flex items-center gap-1 rounded-full p-2 text-[13px] transition-colors ${hover}`}>
      {icon}{count ? <span>{count}</span> : null}
    </button>
  );
}

export function QuotedHeader({ post, profiles, userName }: { post: Post; profiles: Map<string, Profile>; userName: string }) {
  const p = post.profileId ? profiles.get(post.profileId) : undefined;
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[14px]">
      <Avatar profile={p} user={post.kind === 'user' ? userName : undefined} size={20} />
      <b className="truncate">{post.kind === 'user' ? userName : p?.name}</b>
      <span className="truncate text-slate-500">@{post.kind === 'user' ? 'you' : p?.handle} · {timeAgo(post.createdAt)}</span>
    </div>
  );
}

function highlightMentions(text: string) {
  return text.split(/(@[a-z0-9][a-z0-9_.-]*)/gi).map((part, i) =>
    part.startsWith('@') ? <span key={i} className="text-sky-600 dark:text-sky-400">{part}</span> : part);
}
