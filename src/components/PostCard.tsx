import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Brain, Check, ChevronDown, ChevronRight, Copy, Download, FileText, Film, Globe, Image as ImageIcon, ImageDown, Lock, MessageCircle, Paperclip, Quote, RefreshCw, ScanSearch, Square, Trash2, Volume2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useT } from '../i18n';
import { db } from '../lib/db';
import { regenerate, runChecks, stop } from '../lib/engine';
import { fmtBytes } from '../lib/files';
import { displayName, useSettings } from '../lib/settings';
import { confirmAction } from '../lib/confirm';
import { deletePostTree } from '../lib/store';
import { fullDate, timeAgo } from '../lib/time';
import type { Attachment, Check as CheckRow, GeneratedMedia, Post, Profile } from '../lib/types';
import { markClaims } from '../lib/claims';
import { costOf, fmtCost, fmtTokens } from '../lib/usage';
import { Avatar } from './Avatar';
import { Markdown } from './Markdown';
import { NoteCard } from './NoteCard';
import { QuoteDialog } from './QuoteDialog';
import { ReplyDialog } from './ReplyDialog';
import { ShareDialog } from './ShareDialog';

interface Props {
  post: Post;
  profiles: Map<string, Profile>;
  /** Draw a connector line down to the next post in a thread. */
  lineBelow?: boolean;
  /** Optional handle of the post being replied to, shown as X-style "Replying to @handle". */
  replyingTo?: string;
  focused?: boolean;
  onReply?: () => void;
  /** Called after sending a reply from this post's ReplyDialog. */
  onReplied?: (replyId: string) => void;
}

const COLLAPSE_MAX_PX = 160; // ~6.5 lines (~280 Latin / ~140 CJK chars), matching X's "Show more" fold
const COLLAPSE_OVERFLOW_PX = 24; // avoid showing "Show more" for a tiny 1-line overflow

function isLongPost(text: string): boolean {
  if (!text) return false;
  let weight = 0;
  let lines = 1;
  for (const ch of text) {
    if (ch === '\n') lines++;
    // X-style weighting: CJK/full-width counts as 2, Latin/ASCII as 1.
    weight += /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe6f\uff00-\uffef]/.test(ch) ? 2 : 1;
    if (weight > 280 || lines > 6) return true;
  }
  return false;
}

export function PostCard({ post, profiles, lineBelow, replyingTo, focused, onReply, onReplied }: Props) {
  const t = useT();
  const [, navigate] = useLocation();
  const settings = useSettings();
  const [replying, setReplying] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  // Posts that are streaming (or finished streaming while on screen) stay expanded so they never snap shut mid-read.
  const [expanded, setExpanded] = useState(post.status === 'streaming');
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (post.status === 'streaming') setExpanded(true);
  }, [post.status]);

  const collapsible = !focused && post.status !== 'streaming' && isLongPost(post.text);

  useLayoutEffect(() => {
    if (!collapsible) {
      setOverflows(false);
      return;
    }
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > COLLAPSE_MAX_PX + COLLAPSE_OVERFLOW_PX);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsible, post.text]);
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
      onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button,pre,.code-block,input,textarea,[data-no-open]') && !window.getSelection()?.toString()) open(); }}
      className={`relative flex gap-3 px-3.5 pt-3.5 sm:px-4 ${lineBelow ? 'pb-0.5' : 'pb-2.5'} ${focused ? 'pb-3 pt-4' : 'cursor-pointer transition-colors hover:bg-slate-50/70'}`}
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
          {post.localOnly && !post.parentId && (
            <span title={t('route.localOnlyLocked')} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
              <Lock size={10} /> {t('route.localOnly')}
            </span>
          )}
        </div>
        {respondsTo ? (
          <p className="mt-0.5 text-[12.5px] text-slate-500">{t('post.respondingTo', { handle: profiles.get(respondsTo.profileId)?.handle ?? '?' })}</p>
        ) : replyingTo ? (
          <p className="mt-0.5 text-[12.5px] text-slate-500">{t('reply.replyingTo', { handle: replyingTo })}</p>
        ) : null}

        {!isUser && (post.reasoning || (post.status === 'streaming' && post.deepThink && !post.text)) && (
          <ThinkingPanel reasoning={post.reasoning} thinking={post.status === 'streaming' && !post.text} />
        )}

        <div
          ref={bodyRef}
          className={`mt-1 text-slate-800 ${focused ? 'text-[15.5px]' : ''} ${
            collapsible && overflows && !expanded
              ? 'max-h-[160px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]'
              : ''
          }`}
        >
          {isUser
            ? (post.text ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{highlightMentions(post.text)}</p> : null)
            : post.text
              ? <Markdown text={post.status === 'done' ? markClaims(post.text, notes) : post.text} streaming={post.status === 'streaming'} />
              : post.status === 'streaming' && !post.deepThink && (
                post.mediaStatus ? (
                  <MediaProgressPill status={post.mediaStatus} />
                ) : post.webSearch ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50/90 px-2.5 py-1 text-[12.5px] font-medium text-sky-700 ring-1 ring-sky-200/70">
                    <Globe size={13} className="animate-pulse" />
                    {t('post.searching')}<span className="dots"><span>.</span><span>.</span><span>.</span></span>
                  </span>
                ) : (
                  <span className="dots text-2xl leading-none text-slate-400"><span>•</span><span>•</span><span>•</span></span>
                )
              )}
        </div>
        {collapsible && overflows && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="mt-1 text-[13.5px] font-medium text-sky-600 transition hover:text-sky-700 hover:underline"
          >
            {expanded ? t('post.showLess') : t('post.showMore')}
          </button>
        )}

        {post.media && post.media.length > 0 && (
          <MediaGallery media={post.media} />
        )}

        {post.attachments && post.attachments.length > 0 && (
          <AttachmentList attachments={post.attachments} />
        )}

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
            className="mt-2.5 max-h-52 cursor-pointer overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/50 p-3 transition hover:border-slate-300 hover:bg-slate-50">
            <QuotedHeader post={quoted} profiles={profiles} userName={displayName(settings, t('post.youName'))} />
            {quoted.text && <div className="line-clamp-5 text-[14px] text-slate-700"><Markdown text={quoted.text} /></div>}
            {quoted.attachments && quoted.attachments.length > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-slate-500">
                <Paperclip size={12} /> {quoted.attachments.map((a) => a.name).join(', ')}
              </p>
            )}
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
          <Action label={t('post.reply')} onClick={() => (onReply ? onReply() : setReplying(true))} icon={<MessageCircle size={16} />} count={replyCount} hover="hover:text-sky-600 hover:bg-sky-50" />
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
          {post.kind === 'model' && post.status === 'done' && post.text.trim() && <Action label={t('post.checkAgain')} onClick={() => void runChecks(post)} icon={<ScanSearch size={16} />} hover="hover:text-amber-600 hover:bg-amber-50" />}
          {post.kind === 'model' && post.status === 'done' && post.text.trim() && <Action label={t('post.share')} onClick={() => setSharing(true)} icon={<ImageDown size={16} />} hover="hover:text-ink hover:bg-slate-100" />}
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
      {replying && <ReplyDialog post={post} profiles={profiles} onClose={() => setReplying(false)} onReplied={onReplied} />}
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
      {(post.deepThink || post.reasoning) && (
        <span className="inline-flex items-center gap-1 text-violet-600/85">
          <Brain size={11} />
          <span>{t('composer.deepThink')}</span>
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

function useObjectUrl(blob: Blob | undefined, fallback: string): string {
  const [url, setUrl] = useState(fallback);
  useEffect(() => {
    if (!blob) { setUrl(fallback); return; }
    const obj = URL.createObjectURL(blob);
    setUrl(obj);
    return () => URL.revokeObjectURL(obj);
  }, [blob, fallback]);
  return url;
}

function MediaProgressPill({ status }: { status: string }) {
  const t = useT();
  const [kind, phase] = status.split(':');
  const label = kind === 'audio' ? t('post.generatingAudio') : kind === 'video' ? t('post.generatingVideo') : t('post.generatingImage');
  const style =
    kind === 'audio' ? 'bg-teal-50/90 text-teal-700 ring-teal-200/70'
    : kind === 'video' ? 'bg-indigo-50/90 text-indigo-700 ring-indigo-200/70'
    : 'bg-sky-50/90 text-sky-700 ring-sky-200/70';
  const Icon = kind === 'audio' ? Volume2 : kind === 'video' ? Film : ImageIcon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium ring-1 ${style}`}>
      <Icon size={13} className="animate-pulse" />
      {label}{phase ? ` · ${phase}` : ''}<span className="dots"><span>.</span><span>.</span><span>.</span></span>
    </span>
  );
}

function MediaGallery({ media }: { media: GeneratedMedia[] }) {
  const t = useT();
  const [lightbox, setLightbox] = useState<GeneratedMedia | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  return (
    <div data-no-open className="mt-2.5 space-y-2.5" onClick={(e) => e.stopPropagation()}>
      {media.map((m) =>
        m.kind === 'image' ? (
          <div key={m.id} className="group relative inline-block max-w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50">
            <button type="button" onClick={() => setLightbox(m)} className="block cursor-zoom-in">
              <img src={m.url} alt={m.name ?? 'Generated image'} className="max-h-[460px] max-w-full object-contain" />
            </button>
            <a
              href={m.url}
              download={m.name ?? 'image.png'}
              title={t('post.download')}
              aria-label={t('post.download')}
              className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-slate-900/75 px-2.5 py-1 text-[11.5px] font-semibold text-white opacity-90 backdrop-blur-xs transition hover:bg-slate-900 group-hover:opacity-100"
            >
              <Download size={12} /> {t('post.download')}
            </a>
          </div>
        ) : m.kind === 'audio' ? (
          <AudioItem key={m.id} item={m} />
        ) : (
          <VideoItem key={m.id} item={m} />
        ),
      )}

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name ?? 'Generated image'}
          onClick={() => setLightbox(null)}
          className="animate-backdrop fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
        >
          <div className="relative flex max-h-[90vh] max-w-[92vw] flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label={t('common.close')}
              className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/90 text-white shadow-lg ring-1 ring-white/20 transition hover:bg-slate-800"
            >
              <X size={18} />
            </button>
            <img src={lightbox.url} alt={lightbox.name ?? 'Generated image'} className="max-h-[84vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}

function AudioItem({ item }: { item: GeneratedMedia }) {
  const t = useT();
  const src = useObjectUrl(item.blob, item.url);
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-slate-50/85 p-3">
      <audio controls src={src} className="h-9 min-w-[200px] flex-1" />
      <a
        href={src}
        download={item.name ?? 'audio.mp3'}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-ink"
      >
        <Download size={13} /> {t('post.download')}
      </a>
    </div>
  );
}

function VideoItem({ item }: { item: GeneratedMedia }) {
  const t = useT();
  const src = useObjectUrl(item.blob, item.url);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-950">
      <video controls playsInline src={src} className="max-h-[460px] w-full bg-black" />
      <div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
        <span className="truncate font-medium text-ink">{item.name ?? 'video.mp4'}</span>
        <a
          href={src}
          download={item.name ?? 'video.mp4'}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-ink"
        >
          <Download size={12} /> {t('post.download')}
        </a>
      </div>
    </div>
  );
}

function ThinkingPanel({ reasoning, thinking }: { reasoning?: string; thinking: boolean }) {
  const t = useT();
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? thinking;
  const hasBody = !!reasoning?.trim();

  return (
    <div data-no-open className="mt-2 mb-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={!hasBody}
        onClick={() => setUserOpen((cur) => !(cur ?? thinking))}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ring-1 transition ${
          thinking
            ? 'bg-violet-50/90 text-violet-700 ring-violet-200/80'
            : 'bg-slate-50 text-slate-600 ring-slate-200/80 hover:bg-slate-100/80 hover:text-ink'
        } disabled:cursor-default`}
      >
        <Brain size={13} className={thinking ? 'animate-pulse text-violet-600' : 'text-violet-500'} />
        <span>
          {thinking ? (
            <>{t('post.thinking')}<span className="dots"><span>.</span><span>.</span><span>.</span></span></>
          ) : (
            t('post.thoughtProcess')
          )}
        </span>
        {hasBody && (open ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />)}
      </button>
      {open && hasBody && (
        <div className="mt-1.5 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-violet-200/70 bg-violet-50/35 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600">
          {reasoning}
        </div>
      )}
    </div>
  );
}

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const t = useT();
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const images = attachments.filter((a) => a.kind === 'image' && a.dataUrl);
  const files = attachments.filter((a) => a.kind !== 'image');

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  return (
    <div data-no-open className="mt-2.5 space-y-2" onClick={(e) => e.stopPropagation()}>
      {images.length > 0 && (
        <div className={images.length === 1 ? '' : 'grid grid-cols-2 gap-2 sm:grid-cols-3'}>
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setLightbox(img)}
              title={img.name}
              className="group relative block overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50 text-left transition hover:border-slate-300"
            >
              <img
                src={img.dataUrl}
                alt={img.name}
                className={images.length === 1 ? 'max-h-72 max-w-full object-contain' : 'h-36 w-full object-cover transition group-hover:scale-[1.02]'}
              />
            </button>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((f) => {
            const isOpen = !!expanded[f.id];
            return (
              <div key={f.id} className="overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/80">
                <div className="flex items-center gap-2.5 px-3 py-2 text-[12.5px]">
                  <FileText size={15} className="shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink" title={f.name}>{f.name}</span>
                  <span className="shrink-0 text-[11.5px] text-slate-400">{fmtBytes(f.size)}</span>
                  {f.kind === 'file' ? (
                    f.dataUrl ? (
                      <a
                        href={f.dataUrl}
                        download={f.name}
                        className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-ink"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-200/70 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">PDF</span>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpanded((cur) => ({ ...cur, [f.id]: !cur[f.id] }))}
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-ink"
                    >
                      {isOpen ? t('post.hideFile') : t('post.viewFile')}
                      {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                  )}
                </div>
                {f.kind === 'text' && isOpen && f.text !== undefined && (
                  <pre className="max-h-64 overflow-auto border-t border-slate-200/80 bg-white px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-700">
                    {f.text}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {lightbox && lightbox.dataUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          onClick={() => setLightbox(null)}
          className="animate-backdrop fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
        >
          <div className="relative flex max-h-[90vh] max-w-[92vw] flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightbox(null)}
              aria-label={t('common.close')}
              className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/90 text-white shadow-lg ring-1 ring-white/20 transition hover:bg-slate-800"
            >
              <X size={18} />
            </button>
            <img src={lightbox.dataUrl} alt={lightbox.name} className="max-h-[84vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl" />
            <p className="mt-2 max-w-[85vw] truncate rounded-full bg-slate-900/75 px-3 py-1 text-[12px] font-medium text-slate-200">
              {lightbox.name} · {fmtBytes(lightbox.size)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
