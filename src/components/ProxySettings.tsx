import { useState } from 'react';
import { useT } from '../i18n';
import { getSystemProxy, proxyFetch } from '../lib/providers';
import { updateSettings, useSettings, type Settings } from '../lib/settings';

const TEST_TARGETS = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1/models' },
  { label: 'Anthropic', url: 'https://api.anthropic.com/v1/models' },
  { label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models' },
  { label: 'xAI', url: 'https://api.x.ai/v1/models' },
  { label: 'DeepSeek', url: 'https://api.deepseek.com/v1/models' },
  { label: 'Qwen (China)', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models' },
];

function validate(url: string, t: ReturnType<typeof useT>): string | null {
  if (!url.trim()) return t('proxy.enterAddress');
  try {
    const u = new URL(url.trim());
    if (!['http:', 'https:', 'socks5:', 'socks5h:', 'socks:'].includes(u.protocol)) return t('proxy.badScheme');
    return u.hostname ? null : t('proxy.badUrl');
  } catch {
    return t('proxy.badUrl');
  }
}

/** Only rendered when the local Dissentry server is present (npx / Docker). */
export function ProxySettings() {
  const t = useT();
  const s = useSettings();
  const [target, setTarget] = useState(TEST_TARGETS[0].url);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sys = getSystemProxy();
  const urlError = s.proxyMode === 'custom' ? validate(s.proxyUrl, t) : null;

  async function test() {
    setBusy(true);
    setResult(null);
    const t0 = performance.now();
    try {
      // No API key: any HTTP answer (usually 401) proves the provider is reachable through this route.
      const r = await proxyFetch(target, { method: 'GET' });
      const ms = Math.round(performance.now() - t0);
      if (r.status === 502 || r.status === 400) {
        const j = await r.json().catch(() => ({}));
        setResult({ ok: false, text: j.error?.message ?? `HTTP ${r.status}` });
      } else {
        setResult({ ok: true, text: t('proxy.reachable', { ms, status: r.status }) });
      }
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const opt = (mode: Settings['proxyMode'], title: string, desc: React.ReactNode) => (
    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3.5 py-3 transition ${s.proxyMode === mode ? 'border-sky-300 bg-sky-50/60 ring-4 ring-sky-50' : 'border-slate-200 hover:bg-slate-50'}`}>
      <input type="radio" name="proxyMode" className="mt-1 accent-sky-600" checked={s.proxyMode === mode} onChange={() => { updateSettings({ proxyMode: mode }); setResult(null); }} />
      <span><b className="text-[14px] text-ink">{title}</b><br /><span className="text-[13px] text-slate-500">{desc}</span></span>
    </label>
  );

  const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100';
  return (
    <div className="mt-3 space-y-2">
      {opt('system', t('proxy.system'), sys ? <>{t('proxy.systemFound')} <code>{sys}</code></> : t('proxy.systemNone'))}
      {opt('direct', t('proxy.direct'), t('proxy.directDesc'))}
      {opt('custom', t('proxy.custom'), t('proxy.customDesc'))}
      {s.proxyMode === 'custom' && (
        <div className="space-y-3 px-1 pt-1">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{t('proxy.address')}</span>
            <input className={input} value={s.proxyUrl} placeholder="http://127.0.0.1:7890  ·  socks5://127.0.0.1:1080"
              onChange={(e) => { updateSettings({ proxyUrl: e.target.value }); setResult(null); }} spellCheck={false} autoComplete="off" />
            <span className="mt-1 block text-[12px] text-slate-500">{t('proxy.addressHelp')}</span>
            {s.proxyUrl && urlError && <span className="mt-1 block text-[12px] text-red-500">{urlError}</span>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-semibold text-slate-600">{t('proxy.bypass')}</span>
            <input className={input} value={s.proxyBypass} placeholder=".aliyuncs.com, api.deepseek.com" onChange={(e) => updateSettings({ proxyBypass: e.target.value })} spellCheck={false} />
            <span className="mt-1 block text-[12px] text-slate-500">{t('proxy.bypassHelp')}</span>
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <select value={target} onChange={(e) => { setTarget(e.target.value); setResult(null); }} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px]">
          {TEST_TARGETS.map((x) => <option key={x.url} value={x.url}>{x.label}</option>)}
        </select>
        <button onClick={() => void test()} disabled={busy || !!urlError} className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[13px] font-semibold hover:bg-slate-50 disabled:opacity-50">
          {busy ? t('proxy.testing') : t('proxy.test')}
        </button>
      </div>
      {result && <p className={`rounded-xl px-3 py-2 text-[13px] ${result.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{result.text}</p>}
    </div>
  );
}
