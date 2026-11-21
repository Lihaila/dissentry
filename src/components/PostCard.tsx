import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Check, Copy, Globe, ImageDown, MessageCircle, Quote, RefreshCw, ScanSearch, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useT } from '../i18n';
import { db } from '../lib/db';
import { regenerate, runChecks, stop } from '../lib/engine';
import { displayName, useSettings } from '../lib/settings';
import { confirmAction } from '../lib/confirm';
import { deletePostTree } from '../lib/store';
import { fullDate, timeAgo } from '../lib/time';
import type { Check as CheckRow, Post, Profile } from '../lib/types';
import { markClaims } from '../lib/claims';
import { costOf, fmtCost, fmtTokens } from '../lib/usage';
import { Avatar } from './Avatar';
import { Markdown } from './Markdown';
import { NoteCard } from './NoteCard';
import { QuoteDialog } from './QuoteDialog';
import { ShareDialog } from './ShareDialog';

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
  const [sharing, setSharing] = useState(false);
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
      onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button,pre,.code-block,input,textarea') && !window.getSelection()?.toString()) open(); }}
      className={`relative flex gap-3 px-4 pt-3.5 ${lineBelow ? 'pb-0.5' : 'pb-2.5'} ${focused ? 'pb-3 pt-4' : 'cursor-pointer transition-colors hover:bg-slate-50/70'}`}
    >
      <div className="flex flex-col items-center">
        <Avatar profile={profile} user={isUser ? displayName(settings, t('post.youName')) : undefined} />
        {lineBelow && <div className="my-1.5 w-[2px] flex-1 rounded-full bg-slate-200/90" />}
      </div>
      <div className="min-w-0 flex-1 pb-0.5">
        <div className="flex items-center gap-1.5 text-[14.5px]">
          <span className="truncate font-bold text-ink">{name}</span>
          <span className="truncate text-slate-500">@{handle}</span>
          {profile && (
            <span className="hidden truncate rounded-md border border-slate-200/70 bg-slate-50 px-1.5 py-px font-mono text-[10.5px] font-medium text-slate-500 sm:inline">
              {profile.modelId}
            </span>
          )}
          <span className="text-slate-300">·</span>
          <span className="shrink-0 text-[13px] text-slate-400" title={fullDate(post.createdAt)}>{timeAgo(post.createdAt)}</span>
        </div>
        {respondsTo && (
          <p className="mt-0.5 text-[12.5px] text-slate-500">{t('post.respondingTo', { handle: profiles.get(respondsTo.profileId)?.handle ?? '?' })}</p>
        )}

        <div className={`mt-1 text-slate-800 ${focused ? 'text-[15.5px]' : ''}`}>
          {isUser
            ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{highlightMentions(post.text)}</p>
            : post.text
              ? <Markdown text={post.status === 'done' ? markClaims(post.text, notes) : post.text} streaming={post.status === 'streaming'} />
              : post.status === 'streaming' && (
                post.webSearch ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50/90 px-2.5 py-1 text-[12.5px] font-medium text-sky-700 ring-1 ring-sky-200/70">
                    <Globe size={13} className="animate-pulse" />
                    {t('post.searching')}<span className="dots"><span>.</span><span>.</span><span>.</span></span>
                  </span>
                ) : (
                  <span className="dots text-2xl leading-none text-slate-400"><span>•</span><span>•</span><span>•</span></span>
                )
              )}
        </div>

        {post.sources && post.sources.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5" aria-label={t('post.sources')}>
            {post.sources.map((src) => {
              let host = src.url;
              try { host = new URL(src.url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
              return (
                <a
                  key={src.url}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title={src.title ? `${src.title} — ${src.url}` : src.url}
                  className="inline-flex max-w-[220px] items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 px-2.5 py-0.5 text-[11.5px] font-medium text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                >
                  <Globe size={11} className="shrink-0 text-slate-400" />
                  <span className="truncate">{src.title || host}</span>
                </a>
              );
            })}
          </div>
        )}

        {post.status === 'error' && (
          <div className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-red-200/90 bg-red-50/90 p-3 text-[13px] text-red-800">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-500" />
            <span className="flex-1 leading-relaxed">{post.error}</span>
            <button onClick={(e) => { e.stopPropagation(); void regenerate(post); }}
              className="shrink-0 rounded-full bg-white px-2.5 py-0.5 text-[12px] font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100/60">
              {t('post.retry')}
            </button>
          </div>
        )}
        {post.status === 'stopped' && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-medium text-slate-500">
            {t('post.stopped')}
          </p>
        )}

        {quoted && (
          <div onClick={(e) => { e.stopPropagation(); navigate(`/post/${quoted.id}`); }}
            className="mt-2.5 max-h-56 cursor-pointer overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/40 p-3 transition [mask-image:linear-gradient(to_bottom,black_75%,transparent)] hover:border-slate-300 hover:bg-slate-50">
            <QuotedHeader post={quoted} profiles={profiles} userName={displayName(settings, t('post.youName'))} />
            <div className="text-[14px]"><Markdown text={quoted.text} /></div>
          </div>
        )}

        {visibleNotes.map((n) => <NoteCard key={n.id} note={n} profiles={profiles} author={profile} />)}

        {post.kind === 'model' && checks.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[12px]">
            {pending.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50/90 px-2.5 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200/70">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                {t('post.checking', { handles: handles(pending) })}<span className="dots"><span>.</span><span>.</span><span>.</span></span>
              </span>
            )}
            {passed.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50/90 px-2.5 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200/70">
                <Check size={12} strokeWidth={2.6} />{t('post.noDissent', { handles: handles(passed) })}
              </span>
            )}
            {failed.map((c) => (
              <span key={c.profileId} title={c.error}
                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 font-medium text-red-600 ring-1 ring-red-200/70">
                <AlertTriangle size={11} /> {t('post.couldNotCheck', { handle: profiles.get(c.profileId)?.handle ?? '?' })}
              </span>
            ))}
          </div>
        )}

        {post.kind === 'model' && post.usage && <UsageLine post={post} checks={checks} profiles={profiles} />}

        <div className="-ml-2 mt-1.5 flex items-center gap-0.5 text-slate-400 sm:gap-1">
          <Action label={t('post.reply')} onClick={() => (onReply ? onReply() : navigate(`/post/${post.id}?reply=1`))} icon={<MessageCircle size={16} />} count={replyCount} hover="hover:text-sky-600 hover:bg-sky-50" />
          <Action label={t('post.quote')} onClick={() => setQuoting(true)} icon={<Quote size={16} />} hover="hover:text-emerald-600 hover:bg-emerald-50" />
          {post.kind === 'model' && post.status === 'streaming' && (
            <button
              onClick={(e) => { e.stopPropagation(); stop(post.id); }}
              className="mx-1 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-[12px] font-semibold text-red-600 ring-1 ring-red-200/80 transition hover:bg-red-100 active:scale-95"
            >
              <Square size={11} className="fill-current" />
              {t('post.stop')}
            </button>
          )}
          {post.kind === 'model' && post.status === 'done' && <Action label={t('post.checkAgain')} onClick={() => void runChecks(post)} icon={<ScanSearch size={16} />} hover="hover:text-amber-600 hover:bg-amber-50" />}
          {post.kind === 'model' && post.status === 'done' && <Action label={t('post.share')} onClick={() => setSharing(true)} icon={<ImageDown size={16} />} hover="hover:text-ink hover:bg-slate-100" />}
          {post.kind === 'model' && post.status !== 'streaming' && <Action label={t('post.regenerate')} onClick={() => void regenerate(post)} icon={<RefreshCw size={15} />} hover="hover:text-violet-600 hover:bg-violet-50" />}
          <Action label={copied ? t('post.copied') : t('post.copy')} onClick={() => { void navigator.clipboard.writeText(post.text); setCopied(true); setTimeout(() => setCopied(false), 1200); }} icon={copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />} hover="hover:text-sky-600 hover:bg-sky-50" />
          <div className="ml-auto">
            <Action label={t('post.delete')} onClick={async () => {
              const isRoot = !post.parentId;
              const ok = await confirmAction({ title: isRoot ? t('post.deleteThreadTitle') : t('post.deleteTitle'), body: t('post.deleteBody'), confirmLabel: t('post.delete'), danger: true });
              if (ok) { await deletePostTree(post.id); if (focused) navigate(post.parentId ? `/post/${post.parentId}` : '/'); }
            }} icon={<Trash2 size={15} />} hover="hover:text-red-600 hover:bg-red-50" />
          </div>
        </div>
      </div>
      {quoting && <QuoteDialog post={post} profiles={profiles} onClose={() => setQuoting(false)} />}
      {sharing && <ShareDialog post={post} profiles={profiles} onClose={() => setSharing(false)} />}
    </article>
  );
}

function Action({ label, onClick, icon, count, hover }: { label: string; onClick: () => void; icon: React.ReactNode; count?: number; hover: string }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={label} aria-label={label}
      className={`flex items-center gap-1 rounded-full p-2 text-[12.5px] transition active:scale-95 ${hover}`}>
      {icon}{count ? <span className="tabular-nums font-medium">{count}</span> : null}
    </button>
  );
}

export function QuotedHeader({ post, profiles, userName }: { post: Post; profiles: Map<string, Profile>; userName: string }) {
  const t = useT();
  const p = post.profileId ? profiles.get(post.profileId) : undefined;
  return (
    <div className="mb-1 flex items-center gap-1.5 text-[13.5px]">
      <Avatar profile={p} user={post.kind === 'user' ? userName : undefined} size={20} />
      <b className="truncate text-ink">{post.kind === 'user' ? userName : p?.name}</b>
      <span className="truncate text-slate-500">@{post.kind === 'user' ? t('post.you') : p?.handle} · {timeAgo(post.createdAt)}</span>
    </div>
  );
}

function highlightMentions(text: string) {
  return text.split(/(@[a-z0-9][a-z0-9_.-]*)/gi).map((part, i) =>
    part.startsWith('@') ? <span key={i} className="rounded bg-sky-50 px-1 py-0.5 font-medium text-sky-700">{part}</span> : part);
}

function UsageLine({ post, checks, profiles }: { post: Post; checks: CheckRow[]; profiles: Map<string, Profile> }) {
  const t = useT();
  const author = post.profileId ? profiles.get(post.profileId) : undefined;
  const ans = post.usage!;
  const checkUse = checks.filter((c) => c.usage);
  const checkTokens = checkUse.reduce((n, c) => n + c.usage!.input + c.usage!.output, 0);
  const costs = [costOf(ans, author), ...checkUse.map((c) => costOf(c.usage, profiles.get(c.profileId)))];
  const known = costs.every((c) => c !== undefined);
  const total = costs.reduce<number>((a, c) => a + (c ?? 0), 0);
  const tip = t('usage.postTip', { i: ans.input, o: ans.output, c: checkTokens });
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11.5px] tabular-nums text-slate-400" title={tip}>
      {post.webSearch && (
        <span className="inline-flex items-center gap-1 text-sky-600/80">
          <Globe size={11} />
          <span>{t('composer.web')}</span>
          <span className="text-slate-300">·</span>
        </span>
      )}
      <span>
        {checkTokens ? t('usage.postLine', { a: fmtTokens(ans.input + ans.output), c: fmtTokens(checkTokens) }) : `${fmtTokens(ans.input + ans.output)} ${t('usage.tokens')}`}
        {total > 0 && <> · {known ? '' : '≥ '}{fmtCost(total)}</>}
      </span>
    </p>
  );
}
