import { generateText } from 'ai';
import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Layout';
import { OpenRouterButton } from '../components/OpenRouterButton';
import { useT } from '../i18n';
import { confirmAction } from '../lib/confirm';
import { db, uid } from '../lib/db';
import { useProfiles } from '../lib/hooks';
import { toHandle } from '../lib/mentions';
import { PRESETS, presetById } from '../lib/presets';
import { friendlyError, hasProxy, languageModel, listModels } from '../lib/providers';
import type { Profile } from '../lib/types';

function blank(presetId = 'anthropic', taken: string[] = []): Profile {
  const pr = presetById(presetId);
  let handle = pr.handle;
  for (let i = 2; taken.includes(handle); i++) handle = `${pr.handle}${i}`;
  return {
    id: uid(), handle, name: pr.label.replace(/ \(.*\)$/, ''), color: pr.color, presetId: pr.id,
    protocol: pr.protocol, baseUrl: pr.baseUrl, modelId: '', apiKey: '', useProxy: true,
    systemPrompt: '', enabled: true, isChecker: false, createdAt: Date.now(),
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
  const toggle = (p: Profile, key: 'enabled' | 'isChecker') => db.profiles.update(p.id, { [key]: !p[key] });

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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200/80 bg-gradient-to-r from-indigo-50/70 to-white px-4 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-ink">{t('or.cardTitle')}</p>
          <p className="text-[12.5px] text-slate-500">{t('or.pitch')}</p>
        </div>
        <OpenRouterButton />
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
        <p className="text-[13px] text-slate-500">{t('models.checkerHint')}</p>
        <button onClick={() => { setEditing(blank('anthropic', (profiles ?? []).map((p) => p.handle))); setIsNew(true); }}
          className="shrink-0 rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-slate-800">{t('models.add')}</button>
      </div>
      {profiles?.length === 0 && !editing && <div className="p-6 text-[14.5px] leading-relaxed text-slate-500">{t('models.empty')}</div>}
      {editing && isNew && <Editor value={editing} isNew taken={(profiles ?? []).map((p) => p.handle)} onDone={() => setEditing(null)} />}
      {profiles?.map((p) => editing?.id === p.id && !isNew ? (
        <Editor key={p.id} value={editing} taken={(profiles ?? []).filter((x) => x.id !== p.id).map((x) => x.handle)} onDone={() => setEditing(null)} />
      ) : (
        <div key={p.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200/80 px-4 py-3.5 transition hover:bg-slate-50/60 ${p.enabled ? '' : 'opacity-55'}`}>
          <Avatar profile={p} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5"><b className="truncate text-ink">{p.name}</b><span className="truncate text-[13.5px] text-slate-500">@{p.handle}</span></div>
            <div className="truncate text-[12px] text-slate-500">{p.modelId || <i>{t('models.noModel')}</i>} · {presetById(p.presetId).label}</div>
          </div>
          <div className="flex items-center gap-1.5 max-sm:w-full max-sm:pl-[52px]">
            <Switch label={t('common.checker')} on={p.isChecker} onClick={() => toggle(p, 'isChecker')} tone="amber" />
            <Switch label={t('models.on')} on={p.enabled} onClick={() => toggle(p, 'enabled')} />
            <button onClick={() => { setEditing({ ...p }); setIsNew(false); }} className="ml-auto rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 sm:ml-0">{t('common.edit')}</button>
          </div>
        </div>
      ))}
    </>
  );
}

function Switch({ label, on, onClick, tone }: { label: string; on: boolean; onClick: () => void; tone?: 'amber' }) {
  const active = tone === 'amber' ? 'bg-amber-100/90 text-amber-800 ring-amber-200/90' : 'bg-emerald-50 text-emerald-700 ring-emerald-200/90';
  return (
    <button onClick={onClick} aria-pressed={on}
      className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 transition active:scale-[.97] ${on ? active : 'bg-white text-slate-400 ring-slate-200 hover:text-slate-600'}`}>
      {on ? '✓ ' : ''}{label}
    </button>
  );
}

function Editor({ value, isNew, taken, onDone }: { value: Profile; isNew?: boolean; taken: string[]; onDone: () => void }) {
  const t = useT();
  const [p, setP] = useState<Profile>(value);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'busy'; text: string } | null>(null);
  const preset = presetById(p.presetId);
  const set = (patch: Partial<Profile>) => setP((cur) => ({ ...cur, ...patch }));
  const handleTaken = taken.includes(p.handle);
  const valid = p.handle && !handleTaken && p.modelId && p.baseUrl && (!preset.needsKey || p.apiKey);

  function choosePreset(id: string) {
    const pr = presetById(id);
    const fresh = blank(id, taken);
    setP((cur) => ({ ...cur, presetId: id, protocol: pr.protocol, baseUrl: pr.baseUrl, color: pr.color, modelId: '',
      ...(isNew ? { handle: fresh.handle, name: fresh.name } : {}) }));
    setModels([]);
    setStatus(null);
  }

  async function fetchModels() {
    setStatus({ kind: 'busy', text: t('editor.fetching') });
    try {
      const list = await listModels(p);
      setModels(list);
      setStatus({ kind: 'ok', text: t('editor.modelsFound', { n: list.length }) });
      if (!p.modelId && list[0]) set({ modelId: list[0] });
    } catch (e) {
      setStatus({ kind: 'err', text: friendlyError(e, p) });
    }
  }

  async function test() {
    setStatus({ kind: 'busy', text: t('editor.testing') });
    try {
      const t0 = performance.now();
      const { text } = await generateText({ model: languageModel(p), prompt: 'Reply with the single word: OK', maxRetries: 0 });
      setStatus({ kind: 'ok', text: t('editor.connected', { ms: Math.round(performance.now() - t0), reply: text.trim().slice(0, 40) }) });
    } catch (e) {
      setStatus({ kind: 'err', text: friendlyError(e, p) });
    }
  }

  async function save() { await db.profiles.put({ ...p, handle: toHandle(p.handle) }); onDone(); }
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
      <Field label={t('editor.baseUrl')}><input className={input} value={p.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} /></Field>
      <Field label={preset.needsKey ? t('editor.key') : t('editor.keyOptional')}>
        <input className={input} type="password" autoComplete="off" value={p.apiKey}
          placeholder={preset.needsKey ? t('editor.keyPlaceholder') : t('editor.keyLocal')} onChange={(e) => set({ apiKey: e.target.value.trim() })} />
        {preset.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] font-medium text-sky-600 hover:underline">{t('editor.getKey')}</a>}
      </Field>
      <Field label={t('editor.model')}>
        <div className="flex gap-2">
          <input className={input} list={`models-${p.id}`} value={p.modelId} placeholder={preset.modelHint} onChange={(e) => set({ modelId: e.target.value.trim() })} />
          <datalist id={`models-${p.id}`}>{models.map((m) => <option key={m} value={m} />)}</datalist>
          <button onClick={() => void fetchModels()} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold hover:bg-slate-50">{t('editor.fetch')}</button>
        </div>
      </Field>
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
      <Field label={t('editor.instructions')}>
        <textarea className={input} rows={2} value={p.systemPrompt} placeholder={t('editor.instructionsPlaceholder')} onChange={(e) => set({ systemPrompt: e.target.value })} />
      </Field>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-amber-500" checked={p.isChecker} onChange={(e) => set({ isChecker: e.target.checked })} /> {t('editor.checker')}</label>
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
