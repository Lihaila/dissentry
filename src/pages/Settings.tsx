import { useRef, useState } from 'react';
import { PageHeader } from '../components/Layout';
import { ProxySettings } from '../components/ProxySettings';
import { hasProxy } from '../lib/providers';
import { updateSettings, useSettings } from '../lib/settings';
import { clearAll, exportAll, importAll } from '../lib/store';

export function SettingsPage() {
  const s = useSettings();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  async function doExport(includeKeys: boolean) {
    const data = await exportAll(includeKeys);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `dissentry-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function doImport(f: File) {
    try {
      await importAll(JSON.parse(await f.text()));
      setMsg('Imported.');
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  }

  const row = 'border-b border-slate-200 px-4 py-4 dark:border-slate-800';
  const btn = 'rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold dark:border-slate-700';
  return (
    <>
      <PageHeader title="Settings" />
      <div className={row}>
        <label className="block text-[13px] font-semibold text-slate-600 dark:text-slate-400">Your display name</label>
        <input value={s.userName} onChange={(e) => updateSettings({ userName: e.target.value })}
          className="mt-1 w-64 rounded-lg border border-slate-300 bg-transparent px-3 py-2 outline-none focus:border-sky-500 dark:border-slate-700" />
      </div>
      <label className={`${row} flex items-start gap-3`}>
        <input type="checkbox" className="mt-1" checked={s.autoCheck} onChange={(e) => updateSettings({ autoCheck: e.target.checked })} />
        <span><b>Check every answer automatically</b><br /><span className="text-[13px] text-slate-500">Checkers review each answer when it finishes. Turn off to check manually with the 🔍 button (saves tokens).</span></span>
      </label>
      <div className={row}>
        <b>Network proxy</b>
        <p className="mt-1 text-[13px] text-slate-500">{hasProxy()
          ? 'Provider requests go through the local Dissentry server (no CORS problems; keys are passed through, never stored). Choose how that server connects out.'
          : ''}</p>
        <ProxySettings />
      </div>
      <div className={row}>
        <b>Your data</b>
        <p className="mt-1 text-[13px] text-slate-500">Everything lives in this browser’s IndexedDB. Export to back up or move to another device.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn} onClick={() => void doExport(false)}>Export (without keys)</button>
          <button className={btn} onClick={() => void doExport(true)}>Export with API keys</button>
          <button className={btn} onClick={() => file.current?.click()}>Import…</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
          <button className={`${btn} border-red-300 text-red-600 dark:border-red-900`} onClick={() => {
            if (window.confirm('Delete all posts, notes and models from this browser? This cannot be undone.')) void clearAll().then(() => setMsg('All data cleared.'));
          }}>Clear all data</button>
        </div>
        {msg && <p className="mt-2 text-[13px]">{msg}</p>}
      </div>
    </>
  );
}
