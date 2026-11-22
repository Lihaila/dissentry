import { generateText } from 'ai';
import { Check, ChevronDown, Film, Image as ImageIcon, Loader2, MessageSquare, Search, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Layout';
import { OpenRouterAccountCard } from '../components/OpenRouterAccountCard';
import { useT } from '../i18n';
import { confirmAction } from '../lib/confirm';
import { db, uid } from '../lib/db';
import { useProfiles } from '../lib/hooks';
import { toHandle } from '../lib/mentions';
import { useOpenRouterAccount } from '../lib/openrouter';
import { PRESETS, presetById } from '../lib/presets';
import { detectModelKind, friendlyError, hasProxy, isLocalProfile, languageModel, listModelOptions, profileKind, supportsWebSearch, type ModelOption } from '../lib/providers';
import type { ModelKind, Profile } from '../lib/types';

function blank(presetId = 'anthropic', taken: string[] = []): Profile {
  const pr = presetById(presetId);
  let handle = pr.handle;
  for (let i = 2; taken.includes(handle); i++) handle = `${pr.handle}${i}`;
  return {
    id: uid(), handle, name: pr.label.replace(/ \(.*\)$/, ''), color: pr.color, presetId: pr.id,
    protocol: pr.protocol, baseUrl: pr.baseUrl, modelId: '', apiKey: '', useProxy: true,
    systemPrompt: '', enabled: true, isChecker: false, webSearch: true, deepThink: false, createdAt: Date.now(),
  };
}

export function ModelsPage() {
  const t = useT();
  const profiles = useProfiles();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const search = useSearch();
  const [, navigate] = useLocation();
  // /models?add=1 opens the "add model" form straight away (used by "Add your first model").
  useEffect(() => {
    if (!profiles || !new URLSearchParams(search).has('add')) return;
    setEditing(blank('anthropic', profiles.map((p) => p.handle)));
    setIsNew(true);
    navigate('/models', { replace: true });
  }, [search, profiles, navigate]);
  const toggle = (p: Profile, key: 'enabled' | 'isChecker' | 'deepThink') => db.profiles.update(p.id, { [key]: !p[key] });
  const toggleWeb = (p: Profile) => db.profiles.update(p.id, { webSearch: p.webSearch === false });

  return (
    <>
      <PageHeader title={t('models.title')} sub={t('models.sub')} />
      {!hasProxy() && (
        <div className="border-b border-slate-200/80 bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
          <b className="text-ink">{t('models.hostedTitle')}</b> {t('models.hostedBody')}{' '}
          {t('models.hostedOllama')} <code className="rounded bg-white px-1 ring-1 ring-slate-200">OLLAMA_ORIGINS={location.origin}</code>{' '}
          {t('models.hostedNpx')} <code className="rounded bg-white px-1 ring-1 ring-slate-200">npx dissentry</code>
        </div>
      )}
      <OpenRouterAccountCard variant="models" />
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
        <p className="text-[13px] text-slate-500">{t('models.optionsHint')}</p>
        <button onClick={() => { setEditing(blank('anthropic', (profiles ?? []).map((p) => p.handle))); setIsNew(true); }}
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-slate-800">{t('models.add')}</button>
      </div>
      {profiles?.length === 0 && !editing && <div className="p-6 text-[14.5px] leading-relaxed text-slate-500">{t('models.empty')}</div>}
      {editing && isNew && <Editor value={editing} isNew taken={(profiles ?? []).map((p) => p.handle)} onDone={() => setEditing(null)} />}
      {profiles?.map((p) => {
        if (editing?.id === p.id && !isNew) {
          return <Editor key={p.id} value={editing} taken={(profiles ?? []).filter((x) => x.id !== p.id).map((x) => x.handle)} onDone={() => setEditing(null)} />;
        }
        const kind = profileKind(p);
        const local = isLocalProfile(p);
        return (
          <div key={p.id} className={`border-b border-slate-200/80 px-4 py-3.5 transition hover:bg-slate-50/60 ${p.enabled ? '' : 'opacity-55'}`}>
            <div className="flex items-center gap-3">
              <Avatar profile={p} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <b className="truncate text-ink">{p.name}</b>
                  <span className="truncate text-[13.5px] text-slate-500">@{p.handle}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${local ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/80' : 'bg-slate-100 text-slate-500 ring-slate-200/80'}`}>
                    {local ? t('route.local') : t('route.cloud')}
                  </span>
                  {kind !== 'chat' && <KindBadge kind={kind} />}
                </div>
                <div className="truncate text-[12px] text-slate-500">{p.modelId || <i>{t('models.noModel')}</i>} · {presetById(p.presetId).label}</div>
              </div>
              <button onClick={() => { setEditing({ ...p, kind }); setIsNew(false); }} className="shrink-0 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink shadow-2xs transition hover:border-slate-300 hover:bg-slate-50">{t('common.edit')}</button>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[52px]">
              <Switch label={t('models.on')} on={p.enabled} onClick={() => toggle(p, 'enabled')} />
              {kind === 'chat' && (
                <>
                  <Switch label={t('common.checker')} on={p.isChecker} onClick={() => toggle(p, 'isChecker')} tone="amber" />
                  {supportsWebSearch(p) && (
                    <Switch label={t('composer.web')} on={p.webSearch !== false} onClick={() => toggleWeb(p)} tone="sky" />
                  )}
                  <Switch label={t('composer.deepThink')} on={!!p.deepThink} onClick={() => toggle(p, 'deepThink')} tone="violet" />
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Switch({ label, on, onClick, tone }: { label: string; on: boolean; onClick: () => void; tone?: 'amber' | 'sky' | 'violet' }) {
  const active =
    tone === 'amber' ? 'bg-amber-100/90 text-amber-800 ring-amber-200/90'
    : tone === 'sky' ? 'bg-sky-50 text-sky-700 ring-sky-200/90'
    : tone === 'violet' ? 'bg-violet-50 text-violet-700 ring-violet-200/90'
    : 'bg-emerald-50 text-emerald-700 ring-emerald-200/90';
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 transition active:scale-[.97] ${on ? active : 'bg-white text-slate-400 ring-slate-200 hover:text-slate-600'}`}>
      {on ? '✓ ' : ''}{label}
    </button>
  );
}

function KindBadge({ kind }: { kind: ModelKind }) {
  const t = useT();
  const styles: Record<ModelKind, string> = {
    chat: 'bg-slate-100 text-slate-600 ring-slate-200/80',
    image: 'bg-sky-50 text-sky-700 ring-sky-200/80',
    audio: 'bg-teal-50 text-teal-700 ring-teal-200/80',
    video: 'bg-indigo-50 text-indigo-700 ring-indigo-200/80',
  };
  const Icon = kind === 'image' ? ImageIcon : kind === 'audio' ? Volume2 : kind === 'video' ? Film : MessageSquare;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${styles[kind]}`}>
      <Icon size={11} /> {t(`kind.${kind}`)}
    </span>
  );
}

const KINDS: ModelKind[] = ['chat', 'image', 'audio', 'video'];

function Editor({ value, isNew, taken, onDone }: { value: Profile; isNew?: boolean; taken: string[]; onDone: () => void }) {
  const t = useT();
  const orAccount = useOpenRouterAccount();
  const [p, setP] = useState<Profile>(value);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [fetching, setFetching] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [cat, setCat] = useState<'all' | ModelKind>('all');
  const [fetchErr, setFetchErr] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'busy'; text: string } | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const preset = presetById(p.presetId);
  const kind = profileKind(p);
  const set = (patch: Partial<Profile>) => setP((cur) => ({ ...cur, ...patch }));
  const handleTaken = taken.includes(p.handle);
  const valid = p.handle && !handleTaken && p.modelId && p.baseUrl && (!preset.needsKey || p.apiKey);

  const catCounts = useMemo(() => {
    const counts = { chat: 0, image: 0, audio: 0, video: 0 };
    for (const m of models) {
      if (m.kind !== 'other') counts[m.kind]++;
    }
    return counts;
  }, [models]);

  const visiblePool = useMemo(() => {
    if (cat === 'all') {
      const gen = models.filter((m) => m.kind !== 'other');
      return gen.length ? gen : models;
    }
    return models.filter((m) => m.kind === cat);
  }, [models, cat]);

  const filteredModels = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return visiblePool;
    // When searching explicitly, search across every model returned by the provider (including 'other').
    const source = cat === 'all' ? models : visiblePool;
    return source.filter((m) => m.id.toLowerCase().includes(q) || (m.name?.toLowerCase().includes(q) ?? false));
  }, [models, visiblePool, cat, filter]);

  useEffect(() => {
    if (pickerOpen) requestAnimationFrame(() => filterRef.current?.focus());
  }, [pickerOpen]);

  function choosePreset(id: string) {
    const pr = presetById(id);
    const fresh = blank(id, taken);
    setP((cur) => ({
      ...cur,
      presetId: id,
      protocol: pr.protocol,
      baseUrl: pr.baseUrl,
      color: pr.color,
      modelId: '',
      kind: 'chat',
      ...(isNew ? { handle: fresh.handle, name: fresh.name } : {}),
      ...(isNew && id === 'openrouter' && orAccount?.apiKey && !cur.apiKey ? { apiKey: orAccount.apiKey } : {}),
      ...(isNew && id !== 'openrouter' && orAccount?.apiKey && cur.apiKey === orAccount.apiKey ? { apiKey: '' } : {}),
    }));
    setModels([]);
    setPickerOpen(false);
    setFilter('');
    setCat('all');
    setFetchErr('');
    setStatus(null);
  }

  async function fetchModels() {
    if (fetching) return;
    setFetching(true);
    setFetchErr('');
    setStatus({ kind: 'busy', text: t('editor.fetching') });
    try {
      const list = await listModelOptions(p);
      setModels(list);
      setCat('all');
      setFilter('');
      setPickerOpen(list.length > 0);
      const genCount = list.filter((m) => m.kind !== 'other').length || list.length;
      setStatus({ kind: 'ok', text: t('editor.modelsFound', { n: genCount }) });
    } catch (e) {
      const msg = friendlyError(e, p);
      setFetchErr(msg);
      setStatus({ kind: 'err', text: msg });
    } finally {
      setFetching(false);
    }
  }

  function pickModel(m: ModelOption) {
    const nextKind: ModelKind = m.kind === 'other' ? 'chat' : m.kind;
    const patch: Partial<Profile> = {
      modelId: m.id,
      kind: nextKind,
      ...(nextKind !== 'chat' ? { isChecker: false } : {}),
    };
    if (m.inPrice !== undefined) patch.inPrice = m.inPrice;
    if (m.outPrice !== undefined) patch.outPrice = m.outPrice;
    set(patch);
    setPickerOpen(false);
  }

  function onModelIdChange(val: string) {
    const detected = detectModelKind(val);
    const nextKind: ModelKind = detected === 'other' ? (p.kind ?? 'chat') : detected;
    set({
      modelId: val,
      kind: nextKind,
      ...(nextKind !== 'chat' ? { isChecker: false } : {}),
    });
  }

  async function test() {
    setStatus({ kind: 'busy', text: t('editor.testing') });
    try {
      const t0 = performance.now();
      if (kind !== 'chat') {
        await listModelOptions(p);
        setStatus({
          kind: 'ok',
          text: t('editor.mediaReady', { ms: Math.round(performance.now() - t0), model: p.modelId, kind: t(`kind.${kind}`) }),
        });
        return;
      }
      const { text } = await generateText({ model: languageModel(p), prompt: 'Reply with the single word: OK', maxRetries: 0 });
      setStatus({ kind: 'ok', text: t('editor.connected', { ms: Math.round(performance.now() - t0), reply: text.trim().slice(0, 40) }) });
    } catch (e) {
      setStatus({ kind: 'err', text: friendlyError(e, p) });
    }
  }

  async function save() {
    await db.profiles.put({
      ...p,
      kind,
      isChecker: kind === 'chat' ? p.isChecker : false,
      handle: toHandle(p.handle),
    });
    onDone();
  }
  async function remove() {
    if (!(await confirmAction({ title: t('editor.removeTitle', { handle: p.handle }), body: t('editor.removeConfirm', { handle: p.handle }), confirmLabel: t('common.remove'), danger: true }))) return;
    await db.profiles.delete(p.id);
    onDone();
  }

  const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14.5px] outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100';
  return (
    <div className="border-b border-slate-200/80 px-3 py-3">
      <div className="space-y-3.5 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-xs">
      <Field label={t('editor.provider')}>
        <div className="flex items-center gap-3">
          <Avatar profile={p} size={40} />
          <select value={p.presetId} onChange={(e) => choosePreset(e.target.value)} className={input}>
            {PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
          </select>
        </div>
        {preset.note && <p className="mt-1 text-[12px] text-slate-500">{preset.note}</p>}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('editor.name')}><input className={input} value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label={t('editor.handle')}>
          <input className={input} value={p.handle} onChange={(e) => set({ handle: toHandle(e.target.value) })} />
          {handleTaken && <p className="mt-1 text-[12px] text-red-500">{t('editor.handleTaken', { handle: p.handle })}</p>}
        </Field>
      </div>
      <div>
        <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{t('editor.baseUrl')}</span>
        <input className={input} value={p.baseUrl} onChange={(e) => { set({ baseUrl: e.target.value }); setFetchErr(''); }} />
        {preset.endpoints && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {preset.endpoints.map((ep) => {
              const active = p.baseUrl.trim().replace(/\/+$/, '') === ep.url;
              return (
                <button
                  key={ep.url}
                  type="button"
                  onClick={() => { set({ baseUrl: ep.url }); setFetchErr(''); setModels([]); setPickerOpen(false); }}
                  className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition ${
                    active
                      ? 'border-sky-300 bg-sky-50 text-sky-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-ink'
                  }`}
                >
                  {ep.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <Field label={preset.needsKey ? t('editor.key') : t('editor.keyOptional')}>
        <input className={input} type="password" autoComplete="off" value={p.apiKey}
          placeholder={preset.needsKey ? t('editor.keyPlaceholder') : t('editor.keyLocal')} onChange={(e) => { set({ apiKey: e.target.value.trim() }); setFetchErr(''); }} />
        {preset.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] font-medium text-sky-600 hover:underline">{t('editor.getKey')}</a>}
      </Field>
      <div>
        <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{t('editor.model')}</span>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              className={`${input} ${models.length ? 'pr-9' : ''}`}
              value={p.modelId}
              placeholder={preset.modelHint}
              onChange={(e) => onModelIdChange(e.target.value.trim())}
            />
            {models.length > 0 && (
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                aria-label={t('editor.modelsFound', { n: models.length })}
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink"
              >
                <ChevronDown size={16} className={`transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={fetching}
            onClick={() => void fetchModels()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-ink transition hover:bg-slate-50 disabled:opacity-60"
          >
            {fetching && <Loader2 size={14} className="animate-spin text-sky-600" />}
            <span>{fetching ? t('editor.fetching') : t('editor.fetch')}</span>
          </button>
        </div>

        {fetchErr && (
          <p className="mt-1.5 rounded-xl bg-red-50 px-3 py-2 text-[12.5px] text-red-700">{fetchErr}</p>
        )}

        {pickerOpen && models.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <Search size={14} className="shrink-0 text-slate-400" />
              <input
                ref={filterRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setPickerOpen(false); }}
                placeholder={t('editor.filterModels')}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-slate-400"
              />
              <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">
                {filteredModels.length}/{visiblePool.length}
              </span>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label={t('common.close')}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
            {(catCounts.image > 0 || catCounts.audio > 0 || catCounts.video > 0) && (
              <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50/70 px-2.5 py-1.5">
                <button
                  type="button"
                  onClick={() => setCat('all')}
                  className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition ${cat === 'all' ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-200/60'}`}
                >
                  {t('usage.range.all')}
                </button>
                {KINDS.filter((k) => catCounts[k] > 0).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setCat(k)}
                    className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition ${cat === k ? 'bg-ink text-white' : 'text-slate-600 hover:bg-slate-200/60'}`}
                  >
                    {t(`kind.${k}`)} ({catCounts[k]})
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredModels.length === 0 ? (
                <p className="px-3 py-4 text-center text-[13px] text-slate-400">{t('editor.noMatchingModels')}</p>
              ) : (
                filteredModels.slice(0, 200).map((m) => {
                  const selected = m.id === p.modelId;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => pickModel(m)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition ${selected ? 'bg-sky-50/90 text-sky-900' : 'hover:bg-slate-50'}`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-sky-600">
                        {selected && <Check size={14} strokeWidth={2.6} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[12.5px] font-medium text-ink">{m.id}</span>
                        {m.name && <span className="block truncate text-[11.5px] text-slate-500">{m.name}</span>}
                      </span>
                      {m.kind !== 'chat' && m.kind !== 'other' && <KindBadge kind={m.kind} />}
                      {m.inPrice !== undefined && m.outPrice !== undefined && (
                        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                          ${m.inPrice}/${m.outPrice}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <p className="border-t border-slate-100 bg-slate-50/70 px-3 py-2 text-[11.5px] leading-relaxed text-slate-500">
              {t('editor.fetchTip')}
            </p>
          </div>
        )}
      </div>
      <div>
        <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{t('editor.kind')}</span>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const active = kind === k;
            const Icon = k === 'image' ? ImageIcon : k === 'audio' ? Volume2 : k === 'video' ? Film : MessageSquare;
            return (
              <button
                key={k}
                type="button"
                onClick={() => set({ kind: k, ...(k !== 'chat' ? { isChecker: false } : {}) })}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold transition ${
                  active
                    ? 'border-ink bg-ink text-white shadow-2xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-ink'
                }`}
              >
                <Icon size={13} />
                <span>{t(`kind.${k}`)}</span>
              </button>
            );
          })}
        </div>
        <p className={`mt-2 rounded-xl px-3 py-2 text-[12px] leading-relaxed ring-1 ${
          kind === 'image' ? 'bg-sky-50/70 text-sky-900 ring-sky-200/70'
          : kind === 'audio' ? 'bg-teal-50/70 text-teal-900 ring-teal-200/70'
          : kind === 'video' ? 'bg-indigo-50/70 text-indigo-900 ring-indigo-200/70'
          : 'bg-white/80 text-slate-600 ring-slate-200/70'
        }`}>
          {t(`kind.${kind}Desc`)}
        </p>
      </div>
      {kind === 'chat' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('editor.inPrice')}>
              <input className={input} inputMode="decimal" placeholder="—" value={p.inPrice ?? ''}
                onChange={(e) => set({ inPrice: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) || 0 })} />
            </Field>
            <Field label={t('editor.outPrice')}>
              <input className={input} inputMode="decimal" placeholder="—" value={p.outPrice ?? ''}
                onChange={(e) => set({ outPrice: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) || 0 })} />
            </Field>
          </div>
          <p className="-mt-2 text-[12px] text-slate-500">{t('editor.priceHelp')}</p>
        </>
      )}
      {kind === 'chat' && (
        <Field label={t('editor.instructions')}>
          <textarea
            className={input}
            rows={2}
            value={p.systemPrompt}
            placeholder={t('editor.instructionsPlaceholder')}
            onChange={(e) => set({ systemPrompt: e.target.value })}
          />
        </Field>
      )}
      {kind === 'audio' && (
        <Field label={t('editor.voice')}>
          <input
            className={input}
            value={p.systemPrompt}
            placeholder={t('editor.voiceHint')}
            onChange={(e) => set({ systemPrompt: e.target.value })}
          />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 text-[14px]">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-emerald-600" checked={p.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> {t('editor.enabled')}</label>
        {kind === 'chat' && (
          <>
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-amber-500" checked={p.isChecker} onChange={(e) => set({ isChecker: e.target.checked })} /> {t('editor.checker')}</label>
            {supportsWebSearch(p) && (
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-sky-600" checked={p.webSearch !== false} onChange={(e) => set({ webSearch: e.target.checked })} /> {t('editor.webSearch')}</label>
            )}
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-violet-600" checked={!!p.deepThink} onChange={(e) => set({ deepThink: e.target.checked })} /> {t('editor.deepThink')}</label>
          </>
        )}
        <label className="flex items-center gap-2"><input type="color" value={p.color} onChange={(e) => set({ color: e.target.value })} className="h-6 w-8 cursor-pointer rounded bg-transparent" /> {t('editor.color')}</label>
        {hasProxy() && (
          <label className="flex items-center gap-2" title={t('editor.routeHint')}>
            <input type="checkbox" checked={p.useProxy} onChange={(e) => set({ useProxy: e.target.checked })} /> {t('editor.route')}
          </label>
        )}
      </div>
      {status && (
        <p className={`rounded-xl px-3 py-2 text-[13px] ${status.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : status.kind === 'err' ? 'bg-red-50 text-red-800' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>{status.text}</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <button disabled={!valid} onClick={() => void save()} className="rounded-full bg-ink px-5 py-2 text-[13.5px] font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">{t('common.save')}</button>
        <button disabled={!p.modelId} onClick={() => void test()} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13.5px] font-semibold hover:bg-slate-50 disabled:opacity-50">{t('editor.test')}</button>
        <button onClick={onDone} className="rounded-full px-4 py-2 text-[13.5px] font-semibold text-slate-500 hover:text-ink">{t('common.cancel')}</button>
        {!isNew && <button onClick={() => void remove()} className="ml-auto rounded-full px-3 py-2 text-[13.5px] font-semibold text-red-500 transition hover:bg-red-50">{t('common.remove')}</button>}
      </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{label}</span>{children}</label>;
}
