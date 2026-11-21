import { Camera, Check, FolderSync, HardDrive, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'wouter';
import { Avatar } from '../components/Avatar';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { PageHeader } from '../components/Layout';
import { lihailaUrl } from '../components/LihaiLa';
import { ProxySettings } from '../components/ProxySettings';
import { useLang, useT } from '../i18n';
import { confirmAction } from '../lib/confirm';
import { AVATAR_ACCEPT, readAvatarImage } from '../lib/files';
import {
  canPickBackupFile,
  getPersistenceState,
  linkBackupFile,
  requestBrowserPersistence,
  syncPersistenceNow,
  unlinkBackupFile,
  usePersistence,
} from '../lib/persistence';
import { hasProxy } from '../lib/providers';
import { displayName, updateSettings, useSettings } from '../lib/settings';
import { clearAll, exportAll, importAll } from '../lib/store';
import { fullDate } from '../lib/time';

export function SettingsPage() {
  const t = useT();
  const lang = useLang();
  const s = useSettings();
  const persist = usePersistence();
  const file = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [avatarErr, setAvatarErr] = useState('');
  const [saveFx, setSaveFx] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function onManualSave(requestFilePermission = false) {
    if (saveFx === 'saving') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveFx('saving');
    const started = Date.now();
    await syncPersistenceNow({ requestFilePermission });
    const wait = Math.max(0, 220 - (Date.now() - started));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    const after = getPersistenceState();
    if (after.diskStatus === 'error' || (requestFilePermission && after.backupFileNeedsPerm)) {
      setSaveFx('idle');
      return;
    }
    setSaveFx('saved');
    saveTimer.current = setTimeout(() => setSaveFx('idle'), 1800);
  }

  async function onPickAvatar(f: File) {
    setAvatarErr('');
    try {
      const dataUrl = await readAvatarImage(f);
      updateSettings({ userAvatar: dataUrl });
    } catch {
      setAvatarErr(t('settings.avatarInvalid'));
    }
  }

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
        <div className="mt-3.5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => avatarInput.current?.click()}
            title={t('settings.avatarChange')}
            aria-label={t('settings.avatarChange')}
            className="group relative shrink-0 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
          >
            <Avatar user={displayName(s, t('post.youName'))} size={64} />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/45 text-white opacity-0 transition group-hover:opacity-100">
              <Camera size={18} />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={`${btn} inline-flex items-center gap-1.5`} onClick={() => avatarInput.current?.click()}>
                <Camera size={14} /> {t('settings.avatarChange')}
              </button>
              {s.userAvatar && (
                <button
                  type="button"
                  onClick={() => { updateSettings({ userAvatar: '' }); setAvatarErr(''); }}
                  className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-ink"
                >
                  <RotateCcw size={13.5} /> {t('settings.avatarRemove')}
                </button>
              )}
              <input
                ref={avatarInput}
                type="file"
                accept={AVATAR_ACCEPT}
                hidden
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  e.target.value = '';
                  if (picked) void onPickAvatar(picked);
                }}
              />
            </div>
            <p className="mt-1.5 text-[12px] text-slate-500">{t('settings.avatarHint')}</p>
            {avatarErr && <p className="mt-1 text-[12px] font-medium text-red-600">{avatarErr}</p>}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-6">
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
      <label className={`${section} flex cursor-pointer items-start gap-3`}>
        <input type="checkbox" className="mt-1 accent-sky-600" checked={s.webSearch} onChange={(e) => updateSettings({ webSearch: e.target.checked })} />
        <span><b className="text-[15px] text-ink">{t('settings.webSearch')}</b><br /><span className="text-[13px] text-slate-500">{t('settings.webSearchDesc')}</span></span>
      </label>
      <label className={`${section} flex cursor-pointer items-start gap-3`}>
        <input type="checkbox" className="mt-1 accent-violet-600" checked={s.deepThink} onChange={(e) => updateSettings({ deepThink: e.target.checked })} />
        <span><b className="text-[15px] text-ink">{t('settings.deepThink')}</b><br /><span className="text-[13px] text-slate-500">{t('settings.deepThinkDesc')}</span></span>
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

        {persist.diskEnabled ? (
          <div className="mt-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/55 p-3.5 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-900">
                <HardDrive size={15} className="text-emerald-600" />
                {t('persist.diskTitle')}
              </span>
              <button
                type="button"
                disabled={saveFx === 'saving'}
                onClick={() => void onManualSave()}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition active:scale-95 ${
                  saveFx === 'saved'
                    ? 'animate-pop border-emerald-500 bg-emerald-600 text-white shadow-xs'
                    : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                {saveFx === 'saving' ? (
                  <><Loader2 size={12.5} className="animate-spin text-emerald-600" /> {t('persist.saving')}</>
                ) : saveFx === 'saved' ? (
                  <><Check size={12.5} strokeWidth={2.8} /> {t('persist.saved')}</>
                ) : (
                  t('persist.saveNow')
                )}
              </button>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-900/80">
              {t('persist.diskDesc')}{' '}
              {persist.diskPath && <code className="rounded bg-white/90 px-1.5 py-0.5 font-mono text-[11.5px] text-ink ring-1 ring-emerald-200/80">{persist.diskPath}</code>}
            </p>
            {persist.diskSavedAt && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-emerald-700">
                <Check size={12} strokeWidth={2.6} /> {t('persist.lastSaved', { time: fullDate(persist.diskSavedAt) })}
              </p>
            )}
            {persist.diskError && <p className="mt-1 text-[12px] font-medium text-red-600">{persist.diskError}</p>}
          </div>
        ) : (
          <div className="mt-3 space-y-2.5 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 text-[13px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold text-ink">
                  <ShieldCheck size={15} className={persist.browserPersisted ? 'text-emerald-600' : 'text-slate-400'} />
                  <span>{t('persist.browserTitle')}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${
                    persist.browserPersisted
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/80'
                      : 'bg-amber-50 text-amber-800 ring-amber-200/80'
                  }`}>
                    {persist.browserPersisted ? t('persist.protected') : t('persist.standard')}
                  </span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{t('persist.browserDesc')}</p>
              </div>
              {!persist.browserPersisted && (
                <button type="button" onClick={() => void requestBrowserPersistence()} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-slate-50">
                  {t('persist.request')}
                </button>
              )}
            </div>

            {canPickBackupFile() && (
              <div className="border-t border-slate-200/70 pt-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <FolderSync size={15} className="text-sky-600" />
                      <span>{t('persist.fileTitle')}</span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
                      {persist.backupFileName
                        ? t('persist.fileLinked', { name: persist.backupFileName })
                        : t('persist.fileDesc')}
                    </p>
                    {persist.backupFileSavedAt && (
                      <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-emerald-700">
                        <Check size={12} strokeWidth={2.6} /> {t('persist.lastSaved', { time: fullDate(persist.backupFileSavedAt) })}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {persist.backupFileName ? (
                      <>
                        <button
                          type="button"
                          disabled={saveFx === 'saving'}
                          onClick={() => void onManualSave(true)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition active:scale-95 ${
                            saveFx === 'saved'
                              ? 'animate-pop border-emerald-500 bg-emerald-600 text-white shadow-xs'
                              : 'border-slate-200 bg-white text-ink hover:bg-slate-50'
                          }`}
                        >
                          {saveFx === 'saving' ? (
                            <><Loader2 size={12.5} className="animate-spin text-sky-600" /> {t('persist.saving')}</>
                          ) : saveFx === 'saved' ? (
                            <><Check size={12.5} strokeWidth={2.8} /> {t('persist.saved')}</>
                          ) : persist.backupFileNeedsPerm ? (
                            t('persist.reconnect')
                          ) : (
                            t('persist.saveNow')
                          )}
                        </button>
                        <button type="button" onClick={() => void unlinkBackupFile()} className="rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-200/60 hover:text-ink">
                          {t('persist.unlink')}
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => void linkBackupFile()} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-slate-50">
                        {t('persist.linkFile')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-5 text-[13px] text-slate-500 md:hidden">
        <Link href="/privacy" className="font-medium transition hover:text-ink hover:underline">{t('footer.privacy')}</Link>
        <Link href="/terms" className="font-medium transition hover:text-ink hover:underline">{t('footer.terms')}</Link>
        <Link href="/welcome" className="transition hover:text-ink hover:underline">{t('layout.about')}</Link>
        <a href={lihailaUrl(lang)} className="transition hover:text-ink hover:underline">{t('brand.backHome')}</a>
      </div>
    </>
  );
}
