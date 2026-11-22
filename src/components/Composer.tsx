import { ArrowUp, Brain, Check, Cloud, FileText, Globe, Lock, Paperclip, Shield, X } from 'lucide-react';
import { useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type RefObject } from 'react';
import { Link } from 'wouter';
import { useT } from '../i18n';
import { submitPost } from '../lib/engine';
import { FILE_ACCEPT, fmtBytes, MAX_ATTACHMENTS, readAttachments, type FileReject } from '../lib/files';
import { useProfiles } from '../lib/hooks';
import { mentionQueryAt, parseMentions } from '../lib/mentions';
import { useOpenRouterAccount } from '../lib/openrouter';
import { isLocalProfile, profileKind, profileWebSearchEnabled } from '../lib/providers';
import { displayName, updateSettings, useSettings } from '../lib/settings';
import type { Attachment, Profile } from '../lib/types';
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
  /** Lock composer to local models only (inherited from a local-only thread or quoted post). */
  forceLocalOnly?: boolean;
  /** Optional ref to the underlying textarea for imperative focus. */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  onPosted?: (postId: string) => void;
  compact?: boolean;
}

export function Composer({ parentId, quoteOfId, placeholder, autoFocus, implicitHandle, forceLocalOnly, inputRef, onPosted, compact }: Props) {
  const t = useT();
  const profiles = useProfiles();
  const orAccount = useOpenRouterAccount();
  const settings = useSettings();
  const enabled = useMemo(() => (profiles ?? []).filter((p) => p.enabled), [profiles]);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachErr, setAttachErr] = useState('');
  const [dragging, setDragging] = useState(false);
  const [localOnly, setLocalOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ query: string; start: number } | null>(null);
  const [sel, setSel] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const hasLocalModel = useMemo(() => enabled.some(isLocalProfile), [enabled]);
  const isLocalLocked = Boolean(forceLocalOnly || localOnly);
  const pool = useMemo(() => (isLocalLocked ? enabled.filter(isLocalProfile) : enabled), [enabled, isLocalLocked]);

  const mentioned = parseMentions(text, pool.map((p) => p.handle));
  const allMentioned = /(^|\s)@all(?![\w.-])/i.test(text);
  const effectiveImplicit = implicitHandle && pool.some((p) => p.handle === implicitHandle) ? implicitHandle : undefined;
  const askers = mentioned.length ? mentioned : effectiveImplicit ? [effectiveImplicit] : [];
  const askerProfiles = askers.map((h) => pool.find((p) => p.handle === h)).filter(Boolean) as Profile[];
  const hasChatAsker = askerProfiles.some((p) => profileKind(p) === 'chat');
  // A model never checks its own answer, only chat models act as checkers, and local-only threads exclude cloud checkers.
  const checkers = pool.filter((p) => p.isChecker && profileKind(p) === 'chat' && !(askers.length === 1 && askers[0] === p.handle));

  const recipientMap = new Map<string, Profile>();
  for (const p of askerProfiles) recipientMap.set(p.id, p);
  if (settings.autoCheck && hasChatAsker) {
    for (const c of checkers) recipientMap.set(c.id, c);
  }
  const recipients = [...recipientMap.values()];
  const localRecipients = recipients.filter(isLocalProfile);
  const cloudRecipients = recipients.filter((p) => !isLocalProfile(p));

  const matches = menu
    ? [...pool.filter((p) => p.handle.startsWith(menu.query) || p.name.toLowerCase().includes(menu.query)),
       ...(('all'.startsWith(menu.query) && pool.length > 1) ? [{ id: '__all', handle: 'all', name: t('composer.everyModel') }] : [])].slice(0, 8)
    : [];

  const refreshMenu = (value: string, caret: number) => { setMenu(mentionQueryAt(value, caret)); setSel(0); };
  const focusAt = (pos: number) => requestAnimationFrame(() => { ta.current?.focus(); ta.current?.setSelectionRange(pos, pos); });

  function formatReject(err: FileReject): string {
    if (err.reason === 'limit') return t('composer.attachLimit', { n: err.max });
    if (err.reason === 'tooBig') return t('composer.attachTooBig', { name: err.name, max: err.max });
    return t('composer.attachUnsupported', { name: err.name });
  }

  async function addFiles(list: File[]) {
    if (!list.length) return;
    setAttachErr('');
    const { added, error } = await readAttachments(list, attachments.length);
    if (added.length) setAttachments((cur) => [...cur, ...added].slice(0, MAX_ATTACHMENTS));
    if (error) setAttachErr(formatReject(error));
  }

  function removeAttachment(id: string) {
    setAttachments((cur) => cur.filter((a) => a.id !== id));
    setAttachErr('');
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items.filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter((f): f is File => !!f);
    if (!files.length) return;
    if (!e.clipboardData.getData('text/plain')) e.preventDefault();
    void addFiles(files);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    if (!dragging) setDragging(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    void addFiles(files);
  }

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
    if ((!text.trim() && attachments.length === 0) || busy) return;
    setBusy(true);
    const value = text;
    const files = attachments;
    setText('');
    setAttachments([]);
    setAttachErr('');
    setMenu(null);
    try {
      const post = await submitPost({
        text: value,
        parentId,
        quoteOfId,
        webSearch: isLocalLocked ? false : settings.webSearch,
        deepThink: settings.deepThink,
        localOnly: isLocalLocked,
        attachments: files,
      });
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
        <p className="text-[14.5px] leading-relaxed text-slate-600">{t('composer.noModels')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {orAccount ? (
            <Link href="/auth/openrouter" onClick={closeNewThread}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-white transition hover:bg-slate-800">
              {t('or.chooseModels')}
            </Link>
          ) : (
            <span onClick={closeNewThread}><OpenRouterButton /></span>
          )}
          <Link href="/models?add=1" onClick={closeNewThread}
            className="inline-flex rounded-full border border-slate-200 px-4 py-2 text-[13.5px] font-semibold text-ink transition hover:bg-slate-50">
            {t('composer.addFirst')}
          </Link>
        </div>
      </div>
    );
  }

  const label = parentId ? t('composer.reply') : quoteOfId ? t('composer.quote') : t('composer.post');
  const canSend = (!!text.trim() || attachments.length > 0) && !busy;

  const cloudHandles = cloudRecipients.map((p) => `@${p.handle}`).join(' ');

  const statusLine = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-slate-500">
      {askerProfiles.length > 0 ? (
        <span className="flex items-center gap-1.5">{t('composer.asking')} <AvatarStack profiles={askerProfiles} /></span>
      ) : (
        <span className="text-slate-400">{t('composer.mentionHint')}</span>
      )}
      {settings.autoCheck && checkers.length > 0 && hasChatAsker && (
        <span className="flex items-center gap-1.5">{t('composer.checkedBy')} <AvatarStack profiles={checkers} /></span>
      )}
      {recipients.length > 0 && cloudRecipients.length === 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
          <Lock size={10.5} /> {t('route.staysLocal')}
        </span>
      )}
      {localRecipients.length > 0 && cloudRecipients.length > 0 && (
        <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200/80">
          <Cloud size={11} className="shrink-0" />
          <span>{t('route.sharesWithCloud', { handles: cloudHandles })}</span>
          {!forceLocalOnly && (
            <button
              type="button"
              onClick={() => setLocalOnly(true)}
              className="rounded-full bg-white px-2 py-px text-[10.5px] font-bold text-emerald-700 ring-1 ring-amber-300/80 transition hover:bg-emerald-50"
            >
              {t('route.keepLocal')}
            </button>
          )}
        </span>
      )}
      {localRecipients.length === 0 && cloudRecipients.length > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100/90 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200/80">
          <Cloud size={10.5} /> {t('route.sentToCloud', { handles: cloudHandles })}
        </span>
      )}
    </div>
  );

  return (
    <div className={`relative flex gap-3 px-4 ${compact ? 'py-3' : 'py-4'}`}>
      <div className="pt-1.5"><Avatar user={displayName(settings, t('post.youName'))} size={compact ? 34 : 38} /></div>
      <div className="min-w-0 flex-1">
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`relative rounded-2xl border bg-white shadow-xs shadow-slate-900/[0.03] transition-all focus-within:border-slate-300 focus-within:shadow-md focus-within:shadow-slate-900/[0.05] focus-within:ring-4 focus-within:ring-slate-900/[0.03] ${
            dragging ? 'border-sky-400 ring-4 ring-sky-100' : 'border-slate-200/90'
          }`}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-sky-400 bg-sky-50/85 backdrop-blur-[1px]">
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-sky-700 shadow-xs ring-1 ring-sky-200">
                <Paperclip size={14} /> {t('composer.dropHint')}
              </span>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3.5 pt-3">
              {attachments.map((a) =>
                a.kind === 'image' && a.dataUrl ? (
                  <div key={a.id} className="group relative h-16 w-16 shrink-0">
                    <img src={a.dataUrl} alt={a.name} title={a.name} className="h-full w-full rounded-xl border border-slate-200/90 object-cover" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={t('common.remove')}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/85 text-white shadow-xs transition hover:bg-red-600"
                    >
                      <X size={11} strokeWidth={2.6} />
                    </button>
                  </div>
                ) : (
                  <div key={a.id} className="inline-flex max-w-[230px] items-center gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 py-1.5 pl-2.5 pr-1.5 text-[12px]">
                    <FileText size={15} className="shrink-0 text-slate-500" />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink" title={a.name}>{a.name}</div>
                      <div className="text-[10.5px] text-slate-400">{fmtBytes(a.size)}{a.kind === 'file' ? ' · PDF' : ''}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      aria-label={t('common.remove')}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200/80 hover:text-ink"
                    >
                      <X size={12} strokeWidth={2.4} />
                    </button>
                  </div>
                ),
              )}
            </div>
          )}

          {attachErr && (
            <p className="px-4 pt-2 text-[12px] font-medium text-red-600">{attachErr}</p>
          )}

          <textarea
            ref={(el) => {
              ta.current = el;
              if (inputRef) inputRef.current = el;
            }}
            value={text}
            autoFocus={autoFocus}
            rows={1}
            placeholder={placeholder ?? t('composer.placeholder', { handle: enabled[0]?.handle ?? 'claude' })}
            onChange={(e) => { setText(e.target.value); refreshMenu(e.target.value, e.target.selectionStart); }}
            onKeyDown={onKey}
            onPaste={onPaste}
            onClick={(e) => refreshMenu(text, (e.target as HTMLTextAreaElement).selectionStart)}
            onBlur={() => setTimeout(() => setMenu(null), 150)}
            className="block max-h-[40vh] w-full resize-none overflow-y-auto bg-transparent px-4 pb-2 pt-3 text-[15.5px] leading-relaxed text-ink outline-none placeholder:text-slate-400"
            style={{ fieldSizing: 'content', minHeight: compact ? 42 : 54 } as React.CSSProperties}
          />

          {!parentId && pool.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
              {pool.slice(0, 10).map((p) => {
                const on = mentioned.includes(p.handle);
                const local = isLocalProfile(p);
                return (
                  <button key={p.id} type="button" onClick={() => toggleMention(p.handle)} title={`@${p.handle} · ${p.modelId} (${local ? t('route.local') : t('route.cloud')})`}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border py-[3px] pl-[3px] pr-2.5 text-[12px] font-medium transition active:scale-[.97] ${
                      on
                        ? 'border-sky-300/90 bg-sky-50 text-sky-700 shadow-2xs'
                        : 'border-slate-200/70 bg-slate-50/90 text-slate-600 hover:border-slate-300 hover:bg-slate-100/80 hover:text-ink'
                    }`}>
                    <Avatar profile={p} size={19} />
                    <span>@{p.handle}</span>
                    {local && !on && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title={t('route.local')} />}
                    {on && <Check size={11} strokeWidth={2.8} className="text-sky-600" />}
                  </button>
                );
              })}
              {pool.length > 1 && (
                <button type="button" onClick={() => toggleMention('all')} title={t('composer.everyModel')}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-[4px] text-[12px] font-medium transition active:scale-[.97] ${
                    allMentioned
                      ? 'border-sky-300/90 bg-sky-50 text-sky-700 shadow-2xs'
                      : 'border-dashed border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-ink'
                  }`}>
                  @all
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-slate-100/90 px-3 py-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={FILE_ACCEPT}
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void addFiles(files);
                }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={attachments.length >= MAX_ATTACHMENTS}
                title={t('composer.attach')}
                aria-label={t('composer.attach')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-ink active:scale-[.97] disabled:opacity-45"
              >
                <Paperclip size={14.5} />
              </button>
              {!isLocalLocked && enabled.some(profileWebSearchEnabled) && (
                <button
                  type="button"
                  onClick={() => updateSettings({ webSearch: !settings.webSearch })}
                  aria-pressed={settings.webSearch}
                  title={t('composer.webTip')}
                  className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition active:scale-[.97] ${
                    settings.webSearch
                      ? 'border-sky-300/90 bg-sky-50 text-sky-700 shadow-2xs'
                      : 'border-slate-200/80 bg-white text-slate-500 hover:border-slate-300 hover:text-ink'
                  }`}
                >
                  <Globe size={13.5} />
                  <span>{t('composer.web')}</span>
                </button>
              )}
              {pool.length > 0 && (
                <button
                  type="button"
                  onClick={() => updateSettings({ deepThink: !settings.deepThink })}
                  aria-pressed={settings.deepThink}
                  title={t('composer.deepThinkTip')}
                  className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition active:scale-[.97] ${
                    settings.deepThink
                      ? 'border-violet-300/90 bg-violet-50 text-violet-700 shadow-2xs'
                      : 'border-slate-200/80 bg-white text-slate-500 hover:border-slate-300 hover:text-ink'
                  }`}
                >
                  <Brain size={13.5} />
                  <span>{t('composer.deepThink')}</span>
                </button>
              )}
              {(hasLocalModel || forceLocalOnly) && (
                <button
                  type="button"
                  disabled={forceLocalOnly}
                  onClick={() => setLocalOnly((v) => !v)}
                  aria-pressed={isLocalLocked}
                  title={forceLocalOnly ? t('route.localOnlyLocked') : t('route.localOnlyTip')}
                  className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition active:scale-[.97] disabled:cursor-default ${
                    isLocalLocked
                      ? 'border-emerald-300/90 bg-emerald-50 text-emerald-700 shadow-2xs'
                      : 'border-slate-200/80 bg-white text-slate-500 hover:border-slate-300 hover:text-ink'
                  }`}
                >
                  {isLocalLocked ? <Lock size={13} /> : <Shield size={13} />}
                  <span>{t('route.localOnly')}</span>
                </button>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <kbd className="hidden rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-slate-400 sm:inline">⌘↵</kbd>
              <button
                onClick={() => void send()}
                disabled={!canSend}
                aria-label={label}
                title={`${label} (⌘/Ctrl + Enter)`}
                className={`flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-full transition ${
                  canSend
                    ? 'bg-ink text-white shadow-xs hover:bg-slate-800 active:scale-95'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                <ArrowUp size={17} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {menu && matches.length > 0 && (
          <ul className="animate-pop absolute z-40 mt-1.5 w-72 overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-xl shadow-slate-900/12">
            {matches.map((m, i) => {
              const prof = pool.find((p) => p.id === m.id);
              const local = prof ? isLocalProfile(prof) : false;
              return (
                <li key={m.id} className="px-1.5">
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(m.handle); }}
                    className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${i === sel ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                    {prof ? <Avatar profile={prof} size={30} /> : <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-slate-100 text-[10.5px] font-bold text-slate-600">ALL</div>}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-[13.5px] font-semibold text-ink">
                        <span className="truncate">{m.name}</span>
                        {prof && (
                          <span className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold ${local ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {local ? t('route.local') : t('route.cloud')}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11.5px] text-slate-500">@{m.handle}{prof ? ` · ${prof.modelId}` : ''}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-2 flex min-h-[22px] items-center px-1">
          {statusLine}
        </div>
      </div>
    </div>
  );
}

function AvatarStack({ profiles }: { profiles: Profile[] }) {
  return (
    <span className="flex -space-x-1.5">
      {profiles.slice(0, 5).map((p) => (
        <span key={p.id} title={`@${p.handle}`} className="rounded-full ring-2 ring-white"><Avatar profile={p} size={20} /></span>
      ))}
      {profiles.length > 5 && <span className="flex h-[20px] items-center pl-2 text-[11px] font-medium">+{profiles.length - 5}</span>}
    </span>
  );
}
