import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Copy, Download, Share2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { db } from '../lib/db';
import { displayName, useSettings } from '../lib/settings';
import { canShareFiles, copyPng, downloadBlob, renderPng, SHARE_URL, xIntentUrl } from '../lib/share';
import { getAncestors } from '../lib/store';
import type { Post, Profile } from '../lib/types';
import { ShareCard } from './ShareCard';

export function ShareDialog({ post, profiles, onClose }: { post: Post; profiles: Map<string, Profile>; onClose: () => void }) {
  const t = useT();
  const settings = useSettings();
  const cardRef = useRef<HTMLDivElement>(null);
  const [withQuestion, setWithQuestion] = useState(true);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(true);
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const data = useLiveQuery(async () => {
    const chain = await getAncestors(post);
    const question = [...chain.slice(0, -1)].reverse().find((p) => p.kind === 'user');
    return {
      question,
      notes: await db.notes.where('postId').equals(post.id).sortBy('createdAt'),
      checks: await db.checks.where('postId').equals(post.id).toArray(),
    };
  }, [post.id]);

  const author = post.profileId ? profiles.get(post.profileId) : undefined;
  const previewUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : ''), [blob]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Re-render the PNG whenever the card changes.
  useEffect(() => {
    if (!data || !cardRef.current) return;
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const b = await renderPng(cardRef.current!);
        if (!cancelled) { setBlob(b); setError(''); }
      } catch (e) {
        if (!cancelled) setError(t('share.failed', { error: (e as Error).message }));
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [data, withQuestion, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shownNotes = (data?.notes ?? []).filter((n) => n.status !== 'dismissed');
  const passed = (data?.checks ?? []).filter((c) => c.verdict === 'ok');
  const name = author?.name ?? 'AI';
  const names = (ids: string[]) => [...new Set(ids)].map((id) => profiles.get(id)?.name).filter(Boolean).join(', ');
  const postText = shownNotes.length
    ? t('share.tweetNote', { author: name, checkers: names(shownNotes.flatMap((n) => [n.profileId, ...n.agreeProfileIds])) })
    : passed.length
      ? t('share.tweetOk', { author: name, checkers: names(passed.map((c) => c.profileId)) })
      : t('share.tweetPlain', { author: name });
  const fileName = `dissentry-${(author?.handle ?? 'answer')}-${post.id.slice(0, 6)}.png`;

  const say = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(''), 2500); };

  async function onCopy() {
    if (!blob) return;
    say((await copyPng(blob)) ? t('share.copied') : t('share.copyUnsupported'));
  }

  async function onPostX() {
    if (!blob) return;
    const copied = await copyPng(blob);
    if (!copied) downloadBlob(blob, fileName);
    window.open(xIntentUrl(`${postText}\n\n${SHARE_URL}`), '_blank', 'noopener');
    say(copied ? t('share.pasteHint') : t('share.attachHint'));
  }

  async function onNative() {
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], fileName, { type: 'image/png' })], text: `${postText} ${SHARE_URL}` });
    } catch { /* user cancelled */ }
  }

  const btn = 'flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[14px] font-semibold transition disabled:opacity-50';
  return (
    <div className="animate-backdrop fixed inset-0 z-50 flex cursor-default items-start justify-center overflow-y-auto bg-slate-900/40 p-3 py-[5vh] backdrop-blur-[3px]"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="animate-modal w-full max-w-[600px] rounded-3xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200/90" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-ink" aria-label={t('common.close')}>
            <X size={17} />
          </button>
          <span className="text-[14px] font-semibold text-ink">{t('share.title')}</span>
          <span className="w-8" />
        </div>

        <div className="p-6 pb-4">
          <div className="relative overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200" style={{ aspectRatio: previewUrl ? undefined : '1200 / 900' }}>
            {previewUrl && <img src={previewUrl} alt={t('share.title')} className="block w-full" />}
            {busy && (
              <div className={`flex items-center justify-center ${previewUrl ? 'absolute inset-0 bg-white/40' : 'h-full'}`}>
                <span className="rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 shadow-sm">{t('share.rendering')}</span>
              </div>
            )}
          </div>
          {/* The real card, at full size and off-screen, is what gets exported. */}
          <div aria-hidden style={{ position: 'fixed', left: -100000, top: 0, pointerEvents: 'none' }}>
            {data && (
              <ShareCard ref={cardRef} question={withQuestion ? data.question : undefined} answer={post} author={author}
                notes={data.notes} checks={data.checks} profiles={profiles} userName={displayName(settings, t('post.youName'))} />
            )}
          </div>

          {data?.question && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13.5px] text-slate-600">
              <input type="checkbox" className="accent-slate-900" checked={withQuestion} onChange={(e) => setWithQuestion(e.target.checked)} />
              {t('share.includeQuestion')}
            </label>
          )}
          {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button onClick={() => void onPostX()} disabled={!blob} className={`${btn} col-span-2 bg-ink text-white hover:bg-slate-800 sm:col-span-1`}>
              <XLogo /> {t('share.postX')}
            </button>
            <button onClick={() => void onCopy()} disabled={!blob} className={`${btn} border border-slate-200 hover:bg-slate-50`}>
              <Copy size={16} /> {t('share.copy')}
            </button>
            <button onClick={() => blob && downloadBlob(blob, fileName)} disabled={!blob} className={`${btn} border border-slate-200 hover:bg-slate-50`}>
              <Download size={16} /> {t('share.download')}
            </button>
            {canShareFiles() && (
              <button onClick={() => void onNative()} disabled={!blob} className={`${btn} col-span-2 border border-slate-200 hover:bg-slate-50 sm:col-span-3`}>
                <Share2 size={16} /> {t('share.native')}
              </button>
            )}
          </div>
          <p className="mt-3 flex min-h-[20px] items-center gap-1.5 text-[12.5px] text-slate-500">
            {flash ? <><Check size={14} className="text-emerald-600" />{flash}</> : t('share.privacy')}
          </p>
        </div>
      </div>
    </div>
  );
}

function XLogo() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>;
}
