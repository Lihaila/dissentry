import { useState } from 'react';
import { getSystemProxy, hasProxy, proxyFetch } from '../lib/providers';
import { updateSettings, useSettings, type Settings } from '../lib/settings';

const TEST_TARGETS = [
  { label: 'OpenAI', url: 'https://api.openai.com/v1/models' },
  { label: 'Anthropic', url: 'https://api.anthropic.com/v1/models' },
  { label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models' },
  { label: 'xAI', url: 'https://api.x.ai/v1/models' },
  { label: 'DeepSeek', url: 'https://api.deepseek.com/v1/models' },
  { label: 'Qwen (China)', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models' },
];

function validate(url: string): string | null {
  if (!url.trim()) return 'Enter a proxy address.';
  try {
    const u = new URL(url.trim());
    if (!['http:', 'https:', 'socks5:', 'socks5h:', 'socks:'].includes(u.protocol)) return 'Use http://, https:// or socks5://';
    if (!u.hostname) return 'Missing host.';
    return null;
  } catch {
    return 'Looks like: http://127.0.0.1:7890 or socks5://127.0.0.1:1080';
  }
}

export function ProxySettings() {
  const s = useSettings();
  const [target, setTarget] = useState(TEST_TARGETS[0].url);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sys = getSystemProxy();
  const urlError = s.proxyMode === 'custom' ? validate(s.proxyUrl) : null;

  if (!hasProxy()) {
    return (
      <p className="mt-1 text-[13px] text-slate-500">
        This copy runs without the local server, so requests use your browser’s / operating system’s proxy.
        Run <code>npx dissentry</code> to choose a proxy here.
      </p>
    );
  }

  async function test() {
    setBusy(true);
    setResult(null);
    const t0 = performance.now();
    try {
      // No API key: any HTTP answer (usually 401) proves the provider is reachable through this route.
      const r = await proxyFetch(target, { method: 'GET' });
      const msec = Math.round(performance.now() - t0);
      if (r.status === 502 || r.status === 400) {
        const j = await r.json().catch(() => ({}));
        setResult({ ok: false, text: j.error?.message ?? `Failed (${r.status})` });
      } else {
        setResult({ ok: true, text: `Reachable in ${msec} ms (HTTP ${r.status}${r.status === 401 || r.status === 403 ? ', expected without a key' : ''}).` });
      }
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const opt = (mode: Settings['proxyMode'], title: string, desc: React.ReactNode) => (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${s.proxyMode === mode ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-500/10' : 'border-slate-200 dark:border-slate-800'}`}>
      <input type="radio" name="proxyMode" className="mt-1" checked={s.proxyMode === mode} onChange={() => { updateSettings({ proxyMode: mode }); setResult(null); }} />
      <span><b className="text-[14px]">{title}</b><br /><span className="text-[13px] text-slate-500">{desc}</span></span>
    </label>
  );

  const input = 'w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-[14px] outline-none focus:border-sky-500 dark:border-slate-700';
  return (
    <div className="mt-3 space-y-2">
      {opt('system', 'System', sys
        ? <>Use the proxy from the environment: <code>{sys}</code></>
        : <>Use HTTPS_PROXY / HTTP_PROXY if set when Dissentry starts. None detected, so requests go direct.</>)}
      {opt('direct', 'No proxy', 'Connect to every provider directly.')}
      {opt('custom', 'Custom proxy', 'For example your Clash, V2Ray or Shadowsocks client, or a company proxy.')}
      {s.proxyMode === 'custom' && (
        <div className="space-y-2 pl-1">
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-slate-600 dark:text-slate-400">Proxy address</span>
            <input className={input} value={s.proxyUrl} placeholder="http://127.0.0.1:7890  or  socks5://127.0.0.1:1080"
              onChange={(e) => { updateSettings({ proxyUrl: e.target.value }); setResult(null); }} spellCheck={false} autoComplete="off" />
            <span className="mt-1 block text-[12px] text-slate-500">HTTP, HTTPS and SOCKS5 are supported. For a login use http://user:pass@host:port.</span>
            {s.proxyUrl && urlError && <span className="mt-1 block text-[12px] text-red-500">{urlError}</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] font-semibold text-slate-600 dark:text-slate-400">Don’t use the proxy for (optional)</span>
            <input className={input} value={s.proxyBypass} placeholder=".aliyuncs.com, api.deepseek.com"
              onChange={(e) => updateSettings({ proxyBypass: e.target.value })} spellCheck={false} />
            <span className="mt-1 block text-[12px] text-slate-500">Comma-separated hosts; a leading dot matches subdomains. Local addresses (localhost, Ollama, LM Studio) always connect directly.</span>
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <select value={target} onChange={(e) => { setTarget(e.target.value); setResult(null); }}
          className="rounded-full border border-slate-300 bg-transparent px-3 py-1.5 text-sm dark:border-slate-700">
          {TEST_TARGETS.map((t) => <option key={t.url} value={t.url}>{t.label}</option>)}
        </select>
        <button onClick={() => void test()} disabled={busy || !!urlError}
          className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700">
          {busy ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {result && (
        <p className={`rounded-lg px-3 py-2 text-[13px] ${result.ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'}`}>{result.text}</p>
      )}
    </div>
  );
}
