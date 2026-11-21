import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'wouter';
import { submitPost } from '../lib/engine';
import { useProfiles } from '../lib/hooks';
import { mentionQueryAt, parseMentions } from '../lib/mentions';
import { useSettings } from '../lib/settings';
import { Avatar } from './Avatar';

interface Props {
  parentId?: string;
  quoteOfId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  /** Handle(s) addressed implicitly (replying to a model post). */
  implicitHandle?: string;
  onPosted?: (postId: string) => void;
  compact?: boolean;
}

export function Composer({ parentId, quoteOfId, placeholder, autoFocus, implicitHandle, onPosted, compact }: Props) {
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
  // A model never checks its own answer, so a sole asker is excluded from the checker hint.
  const checkers = enabled.filter((p) => p.isChecker && !(askers.length === 1 && askers[0] === p.handle));
  const matches = menu
    ? [...enabled.filter((p) => p.handle.startsWith(menu.query) || p.name.toLowerCase().includes(menu.query)),
       ...(('all'.startsWith(menu.query) && enabled.length > 1) ? [{ id: '__all', handle: 'all', name: 'Every enabled model' }] : [])].slice(0, 8)
    : [];

  function refreshMenu(value: string, caret: number) {
    const m = mentionQueryAt(value, caret);
    setMenu(m);
    setSel(0);
  }

  function pick(handle: string) {
    if (!menu || !ta.current) return;
    const caret = ta.current.selectionStart;
    const next = `${text.slice(0, menu.start)}@${handle} ${text.slice(caret)}`;
    setText(next);
    setMenu(null);
    const pos = menu.start + handle.length + 2;
    requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(pos, pos); });
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
      if (e.key === 'Escape') { setMenu(null); return; }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
  }

  if (profiles && profiles.length === 0) {
    return (
      <div className="border-b border-slate-200 p-5">
        <p className="text-[15px]">Add a model to start. Cloud models use your own API key; local models (Ollama, LM Studio) need no key.</p>
        <Link href="/models" className="mt-3 inline-block rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Add your first model</Link>
      </div>
    );
  }

  return (
    <div className={`relative flex gap-3 ${compact ? 'px-4 py-3' : 'border-b border-slate-200 px-4 py-3'}`}>
      <Avatar user={settings.userName} />
      <div className="min-w-0 flex-1">
        <textarea
          ref={ta}
          value={text}
          autoFocus={autoFocus}
          rows={compact ? 2 : 3}
          placeholder={placeholder ?? `Ask something. @mention models, e.g. @${enabled[0]?.handle ?? 'claude'}`}
          onChange={(e) => { setText(e.target.value); refreshMenu(e.target.value, e.target.selectionStart); }}
          onKeyDown={onKey}
          onClick={(e) => refreshMenu(text, (e.target as HTMLTextAreaElement).selectionStart)}
          onBlur={() => setTimeout(() => setMenu(null), 150)}
          className="w-full resize-none bg-transparent pt-2 text-[17px] outline-none placeholder:text-slate-500"
          style={{ fieldSizing: 'content', minHeight: compact ? 48 : 72 } as React.CSSProperties}
        />
        {menu && matches.length > 0 && (
          <ul className="absolute z-30 mt-1 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            {matches.map((m, i) => {
              const prof = enabled.find((p) => p.id === m.id);
              return (
                <li key={m.id}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m.handle); }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === sel ? 'bg-slate-100' : ''}`}>
                    {prof ? <Avatar profile={prof} size={30} /> : <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-slate-200 text-xs font-bold">ALL</div>}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{m.name}</span>
                      <span className="block truncate text-xs text-slate-500">@{m.handle}{prof ? ` · ${prof.modelId}` : ''}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[13px] text-slate-500">
          <span>{askers.length ? <>Asking <b className="text-sky-600">{askers.map((h) => `@${h}`).join(' ')}</b></> : 'No model mentioned yet'}</span>
          {settings.autoCheck && checkers.length > 0 && askers.length > 0 && (
            <span>· checked by {checkers.map((c) => `@${c.handle}`).join(' ')}</span>
          )}
          <button
            onClick={() => void send()}
            disabled={!text.trim() || busy}
            className="ml-auto rounded-full bg-sky-500 px-4 py-1.5 text-[15px] font-bold text-white hover:bg-sky-600 disabled:opacity-50"
            title="⌘/Ctrl + Enter"
          >
            {parentId ? 'Reply' : quoteOfId ? 'Quote' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
