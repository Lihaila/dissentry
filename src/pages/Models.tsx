import { generateText } from 'ai';
import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/Layout';
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
  const profiles = useProfiles();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [isNew, setIsNew] = useState(false);

  const toggle = (p: Profile, key: 'enabled' | 'isChecker') => db.profiles.update(p.id, { [key]: !p[key] });

  return (
    <>
      <PageHeader title="Models" sub="Bring your own keys, cloud or local" />
      {!hasProxy() && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Running without the local server, so some providers may be blocked by browser CORS rules. Run <code className="font-semibold">npx dissentry</code> to use every provider.
        </p>
      )}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <p className="text-[13px] text-slate-500">Turn on <b>Checker</b> for models that should review other models’ answers.</p>
        <button onClick={() => { setEditing(blank('anthropic', (profiles ?? []).map((p) => p.handle))); setIsNew(true); }}
          className="shrink-0 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-bold text-white dark:bg-white dark:text-black">+ Add model</button>
      </div>
      {profiles?.length === 0 && !editing && (
        <div className="p-6 text-[15px] text-slate-500">
          No models yet. Try <b>Ollama</b> for a free local model, or add a cloud provider with your API key.
          Keys are stored only in this browser and sent only to the provider you choose.
        </div>
      )}
      {editing && isNew && <Editor value={editing} isNew taken={(profiles ?? []).map((p) => p.handle)} onDone={() => setEditing(null)} />}
      {profiles?.map((p) => editing?.id === p.id && !isNew ? (
        <Editor key={p.id} value={editing} taken={(profiles ?? []).filter((x) => x.id !== p.id).map((x) => x.handle)} onDone={() => setEditing(null)} />
      ) : (
        <div key={p.id} className={`flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800 ${p.enabled ? '' : 'opacity-50'}`}>
          <Avatar profile={p} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5"><b className="truncate">{p.name}</b><span className="truncate text-slate-500">@{p.handle}</span></div>
            <div className="truncate text-[13px] text-slate-500">{p.modelId || <i>no model selected</i>} · {presetById(p.presetId).label}</div>
          </div>
          <Toggle label="Checker" on={p.isChecker} onClick={() => toggle(p, 'isChecker')} />
          <Toggle label="On" on={p.enabled} onClick={() => toggle(p, 'enabled')} />
          <button onClick={() => { setEditing({ ...p }); setIsNew(false); }} className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold dark:border-slate-700">Edit</button>
        </div>
      ))}
    </>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`hidden rounded-full px-2.5 py-1 text-[12px] font-semibold sm:block ${on ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-900'}`}>
      {on ? '✓ ' : ''}{label}
    </button>
  );
}

function Editor({ value, isNew, taken, onDone }: { value: Profile; isNew?: boolean; taken: string[]; onDone: () => void }) {
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
    setStatus({ kind: 'busy', text: 'Fetching models…' });
    try {
      const list = await listModels(p);
      setModels(list);
      setStatus({ kind: 'ok', text: `${list.length} models available` });
      if (!p.modelId && list[0]) set({ modelId: list[0] });
    } catch (e) {
      setStatus({ kind: 'err', text: friendlyError(e, p) });
    }
  }

  async function test() {
    setStatus({ kind: 'busy', text: 'Testing…' });
    try {
      const t0 = performance.now();
      const { text } = await generateText({ model: languageModel(p), prompt: 'Reply with the single word: OK', maxRetries: 0 });
      setStatus({ kind: 'ok', text: `Connected in ${Math.round(performance.now() - t0)} ms. Replied “${text.trim().slice(0, 40)}”` });
    } catch (e) {
      setStatus({ kind: 'err', text: friendlyError(e, p) });
    }
  }

  async function save() {
    await db.profiles.put({ ...p, handle: toHandle(p.handle) });
    onDone();
  }

  async function remove() {
    if (!window.confirm(`Remove @${p.handle}? Its posts stay in your timeline.`)) return;
    await db.profiles.delete(p.id);
    onDone();
  }

  const input = 'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-[15px] outline-none focus:border-sky-500 dark:border-slate-700';
  return (
    <div className="space-y-3 border-b border-slate-200 bg-slate-50/60 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/50">
      <Field label="Provider">
        <select value={p.presetId} onChange={(e) => choosePreset(e.target.value)} className={input}>
          {PRESETS.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
        </select>
        {preset.note && <p className="mt-1 text-[12px] text-slate-500">{preset.note}</p>}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Display name"><input className={input} value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Handle (for @mentions)">
          <input className={input} value={p.handle} onChange={(e) => set({ handle: toHandle(e.target.value) })} />
          {handleTaken && <p className="mt-1 text-[12px] text-red-500">@{p.handle} is already used</p>}
        </Field>
      </div>
      <Field label="Base URL"><input className={input} value={p.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} /></Field>
      <Field label={preset.needsKey ? 'API key' : 'API key (optional)'}>
        <input className={input} type="password" autoComplete="off" value={p.apiKey} placeholder={preset.needsKey ? 'Stored only in this browser' : 'Not needed for local servers'} onChange={(e) => set({ apiKey: e.target.value.trim() })} />
        {preset.keyUrl && <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] text-sky-600 hover:underline">Get a key →</a>}
      </Field>
      <Field label="Model">
        <div className="flex gap-2">
          <input className={input} list={`models-${p.id}`} value={p.modelId} placeholder={preset.modelHint} onChange={(e) => set({ modelId: e.target.value.trim() })} />
          <datalist id={`models-${p.id}`}>{models.map((m) => <option key={m} value={m} />)}</datalist>
          <button onClick={() => void fetchModels()} className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold dark:border-slate-700">Fetch models</button>
        </div>
      </Field>
      <Field label="Extra instructions (optional)">
        <textarea className={input} rows={2} value={p.systemPrompt} placeholder="e.g. Answer like a senior SRE. Cite sources." onChange={(e) => set({ systemPrompt: e.target.value })} />
      </Field>
      <div className="flex flex-wrap items-center gap-4 text-[14px]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.isChecker} onChange={(e) => set({ isChecker: e.target.checked })} /> Checker: reviews other models’ answers</label>
        <label className="flex items-center gap-2"><input type="color" value={p.color} onChange={(e) => set({ color: e.target.value })} className="h-6 w-8 cursor-pointer bg-transparent" /> Color</label>
        {hasProxy() && (
          <label className="flex items-center gap-2" title="Send requests through the local Dissentry server to avoid browser CORS blocks. Keys are passed through, never stored.">
            <input type="checkbox" checked={p.useProxy} onChange={(e) => set({ useProxy: e.target.checked })} /> Use local proxy
          </label>
        )}
      </div>
      {status && (
        <p className={`rounded-lg px-3 py-2 text-[13px] ${status.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : status.kind === 'err' ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-900'}`}>{status.text}</p>
      )}
      <div className="flex gap-2">
        <button disabled={!valid} onClick={() => void save()} className="rounded-full bg-sky-500 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50">Save</button>
        <button disabled={!p.modelId} onClick={() => void test()} className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">Test connection</button>
        <button onClick={onDone} className="rounded-full px-4 py-1.5 text-sm font-semibold text-slate-500">Cancel</button>
        {!isNew && <button onClick={() => void remove()} className="ml-auto rounded-full px-3 py-1.5 text-sm font-semibold text-red-500">Remove</button>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[13px] font-semibold text-slate-600 dark:text-slate-400">{label}</span>{children}</label>;
}
