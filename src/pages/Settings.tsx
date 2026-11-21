import { useRef, useState } from 'react';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { PageHeader } from '../components/Layout';
import { ProxySettings } from '../components/ProxySettings';
import { useT } from '../i18n';
import { confirmAction } from '../lib/confirm';
import { hasProxy } from '../lib/providers';
import { updateSettings, useSettings } from '../lib/settings';
import { clearAll, exportAll, importAll } from '../lib/store';

export function SettingsPage() {
  const t = useT();
  const s = useSettings();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  async function doExport(includeKeys: boolean) {
    const data = await exportAll(includeKeys);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `dissentry-${new Date().toISOString().slice(0, 10)}.json` }).click();
    URL.revokeObjectURL(url);
  }
  async function doImport(f: File) {
    try { await importAll(JSON.parse(await f.text())); setMsg(t('settings.imported')); }
    catch (e) { setMsg(t('settings.importFailed', { error: (e as Error).message })); }
  }

  const section = 'border-b border-slate-200/80 px-4 py-5';
  const btn = 'rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold hover:bg-slate-50';
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className={section}>
        <h2 className="text-[15px] font-bold text-ink">{t('settings.profile')}</h2>
        <div className="mt-3 flex flex-wrap items-end gap-6">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{t('settings.name')}</span>
            <input value={s.userName} placeholder={t('post.youName')} onChange={(e) => updateSettings({ userName: e.target.value })}
              className="w-56 rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100" />
          </label>
          <div>
            <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{t('layout.language')}</span>
            <div className="rounded-xl border border-slate-200 px-3 py-1"><LanguageSwitcher /></div>
          </div>
        </div>
      </div>
      <label className={`${section} flex cursor-pointer items-start gap-3`}>
        <input type="checkbox" className="mt-1 accent-amber-500" checked={s.autoCheck} onChange={(e) => updateSettings({ autoCheck: e.target.checked })} />
        <span><b className="text-[15px] text-ink">{t('settings.autoCheck')}</b><br /><span className="text-[13px] text-slate-500">{t('settings.autoCheckDesc')}</span></span>
      </label>
      <div className={section}>
        {hasProxy() ? (
          <>
            <h2 className="text-[15px] font-bold text-ink">{t('proxy.title')}</h2>
            <p className="mt-1 text-[13px] text-slate-500">{t('proxy.localDesc')}</p>
            <ProxySettings />
          </>
        ) : (
          <>
            <h2 className="text-[15px] font-bold text-ink">{t('connection.title')}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{t('connection.hostedDesc')}</p>
          </>
        )}
      </div>
      <div className={section}>
        <h2 className="text-[15px] font-bold text-ink">{t('settings.data')}</h2>
        <p className="mt-1 text-[13px] text-slate-500">{t('settings.dataDesc')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn} onClick={() => void doExport(false)}>{t('settings.export')}</button>
          <button className={btn} onClick={() => void doExport(true)}>{t('settings.exportKeys')}</button>
          <button className={btn} onClick={() => file.current?.click()}>{t('settings.import')}</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void doImport(e.target.files[0])} />
          <button className={`${btn} border-red-200 text-red-600 hover:bg-red-50`} onClick={async () => {
            if (await confirmAction({ title: t('settings.clear'), body: t('settings.clearConfirm'), confirmLabel: t('settings.clear'), danger: true })) {
              await clearAll(); setMsg(t('settings.cleared'));
            }
          }}>{t('settings.clear')}</button>
        </div>
        {msg && <p className="mt-2 text-[13px]">{msg}</p>}
      </div>
    </>
  );
}
