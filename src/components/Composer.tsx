import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'wouter';
import { useT } from '../i18n';
import { submitPost } from '../lib/engine';
import { useProfiles } from '../lib/hooks';
import { mentionQueryAt, parseMentions } from '../lib/mentions';
import { displayName, useSettings } from '../lib/settings';
import type { Profile } from '../lib/types';
import { closeNewThread } from '../lib/ui';
import { Avatar } from './Avatar';
import { OpenRouterButton } from './OpenRouterButton';

interface Props {
  parentId?: string;
  quoteOfId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Handle addressed implicitly (replying to a model post). */
  implicitHandle?: string;
  onPosted?: (postId: string) => void;
  compact?: boolean;
}

export function Composer({ parentId, quoteOfId, placeholder, autoFocus, implicitHandle, onPosted, compact }: Props) {
  const t = useT();
  const profiles = useProfiles();
  const settings = useSettings();
  const enabled = useMemo(() => (profiles ?? []).filter((p) => p.enabled), [profiles]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ query: string; start: number } | null>(null);
  const [sel, setSel] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);

  const mentioned = parseMentions(text, enabled.map((p) => p.handle));
  const askers = mentioned.length ? mentioned : implicitHandle ? [implicitHandle] : [];
  const askerProfiles = askers.map((h) => enabled.find((p) => p.handle === h)).filter(Boolean) as Profile[];
  // A model never checks its own answer, so a sole asker is left out of the checker list.
  const checkers = enabled.filter((p) => p.isChecker && !(askers.length === 1 && askers[0] === p.handle));
  const matches = menu
    ? [...enabled.filter((p) => p.handle.startsWith(menu.query) || p.name.toLowerCase().includes(menu.query)),
       ...(('all'.startsWith(menu.query) && enabled.length > 1) ? [{ id: '__all', handle: 'all', name: t('composer.everyModel') }] : [])].slice(0, 8)
    : [];

  const refreshMenu = (value: string, caret: number) => { setMenu(mentionQueryAt(value, caret)); setSel(0); };
  const focusAt = (pos: number) => requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(pos, pos); });

  function pick(handle: string) {
    if (!menu || !ta.current) return;
    const caret = ta.current.selectionStart;
    const next = `${text.slice(0, menu.start)}@${handle} ${text.slice(caret)}`;
    setText(next);
    setMenu(null);
    focusAt(menu.start + handle.length + 2);
  }

  /** Quick chip: add or remove @handle at the start of the text. */
  function toggleMention(handle: string) {
    const re = new RegExp(`(^|\\s)@${handle.replace(/[.]/g, '\\.')}(?![\\w.-])\\s?`, 'i');
    const next = re.test(text) ? text.replace(re, '$1').replace(/^\s+/, '') : `@${handle} ${text}`;
    setText(next);
    focusAt(next.length);
  }

  async function send() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const value = text;
    setText('');
    setMenu(null);
    try {
      const post = await submitPost({ text: value, parentId, quoteOfId });
      onPosted?.(post.id);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menu && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % matches.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + matches.length) % matches.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[sel].handle); return; }
      if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
  }

  if (profiles && profiles.length === 0) {
    // Any choice here leaves the composer, so close the New thread dialog if this is inside it.
    return (
      <div className="px-5 py-6">
        <p className="text-[15px] text-slate-600">{t('composer.noModels')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span onClick={closeNewThread}><OpenRouterButton /></span>
          <Link href="/models?add=1" onClick={closeNewThread}
            className="inline-flex rounded-full border border-slate-200 px-4 py-2 text-[13.5px] font-semibold text-ink hover:bg-slate-50">
            {t('composer.addFirst')}
          </Link>
        </div>
      </div>
    );
  }

  const label = parentId ? t('composer.reply') : quoteOfId ? t('composer.quote') : t('composer.post');
  return (
    <div className={`relative flex gap-3 px-4 ${compact ? 'py-3' : 'pb-3 pt-4'}`}>
      <Avatar user={displayName(settings, t('post.youName'))} />
      <div className="min-w-0 flex-1">
        <textarea
          ref={ta}
          value={text}
          autoFocus={autoFocus}
          rows={compact ? 2 : 3}
          placeholder={placeholder ?? t('composer.placeholder', { handle: enabled[0]?.handle ?? 'claude' })}
          onChange={(e) => { setText(e.target.value); refreshMenu(e.target.value, e.target.selectionStart); }}
          onKeyDown={onKey}
          onClick={(e) => refreshMenu(text, (e.target as HTMLTextAreaElement).selectionStart)}
          onBlur={() => setTimeout(() => setMenu(null), 150)}
          className="w-full resize-none bg-transparent pt-1.5 text-[17px] leading-relaxed outline-none placeholder:text-slate-400"
          style={{ fieldSizing: 'content', minHeight: compact ? 52 : 76 } as React.CSSProperties}
        />
        {menu && matches.length > 0 && (
          <ul className="absolute z-40 mt-1 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-900/10">
            {matches.map((m, i) => {
              const prof = enabled.find((p) => p.id === m.id);
              return (
                <li key={m.id}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m.handle); }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === sel ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                    {prof ? <Avatar profile={prof} size={32} /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">ALL</div>}
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{m.name}</span>
                      <span className="block truncate text-[12px] text-slate-500">@{m.handle}{prof ? ` · ${prof.modelId}` : ''}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {!parentId && enabled.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {enabled.slice(0, 8).map((p) => {
              const on = mentioned.includes(p.handle);
              return (
                <button key={p.id} type="button" onClick={() => toggleMention(p.handle)} title={`@${p.handle} · ${p.modelId}`}
                  className={`flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-[12.5px] font-medium transition ${on ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                  <Avatar profile={p} size={22} />@{p.handle}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-500">
            {askerProfiles.length > 0 ? (
              <span className="flex items-center gap-1.5">{t('composer.asking')} <AvatarStack profiles={askerProfiles} /></span>
            ) : (
              <span>{t('composer.mentionHint')}</span>
            )}
            {settings.autoCheck && checkers.length > 0 && askerProfiles.length > 0 && (
              <span className="flex items-center gap-1.5">{t('composer.checkedBy')} <AvatarStack profiles={checkers} /></span>
            )}
          </div>
          <button
            onClick={() => void send()}
            disabled={!text.trim() || busy}
            className="shrink-0 rounded-full bg-ink px-5 py-2 text-[14.5px] font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
            title="⌘/Ctrl + Enter"
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}

function AvatarStack({ profiles }: { profiles: Profile[] }) {
  return (
    <span className="flex -space-x-1.5">
      {profiles.slice(0, 5).map((p) => (
        <span key={p.id} title={`@${p.handle}`} className="rounded-full ring-2 ring-white"><Avatar profile={p} size={22} /></span>
      ))}
      {profiles.length > 5 && <span className="flex h-[22px] items-center pl-2.5 text-[11px]">+{profiles.length - 5}</span>}
    </span>
  );
}
