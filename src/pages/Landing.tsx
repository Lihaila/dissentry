import { ArrowRight, ArrowUpRight, BadgeCheck, Check, Code2, Coins, Copy, Globe2, ImageDown, Layers, Lock, Play, Plug, Sparkles, Terminal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { LihaiLaBrandLink, LihaiLaFooter, lihailaUrl } from '../components/LihaiLa';
import { Logo } from '../components/Logo';
import { OpenRouterButton } from '../components/OpenRouterButton';
import { useLang, useT, type TKey } from '../i18n';
import { useProfiles } from '../lib/hooks';
import { presetLogo } from '../lib/logos';
import { useOpenRouterAccount } from '../lib/openrouter';
import { markStarted } from '../lib/started';

const PROVIDERS = ['openai', 'anthropic', 'google', 'deepseek', 'qwen', 'xai', 'mistral', 'groq', 'openrouter', 'ollama'];

const FEATURES: { icon: typeof Sparkles; title: TKey; body: TKey }[] = [
  { icon: BadgeCheck, title: 'land.f1t', body: 'land.f1b' },
  { icon: Layers, title: 'land.f2t', body: 'land.f2b' },
  { icon: Sparkles, title: 'land.f3t', body: 'land.f3b' },
  { icon: ImageDown, title: 'land.f4t', body: 'land.f4b' },
  { icon: Lock, title: 'land.f5t', body: 'land.f5b' },
  { icon: Coins, title: 'land.f6t', body: 'land.f6b' },
];

const MCP_TOOLS: { name: string; desc: TKey }[] = [
  { name: 'dissentry_check', desc: 'land.mcpToolCheck' },
  { name: 'dissentry_ask', desc: 'land.mcpToolAsk' },
  { name: 'dissentry_list_models', desc: 'land.mcpToolList' },
  { name: 'dissentry_trust', desc: 'land.mcpToolTrust' },
];

type McpTabId = 'cloud' | 'google' | 'json' | 'claude' | 'qwen' | 'dsh' | 'http';

const MCP_TABS: { id: McpTabId; label: string | TKey; isKey?: boolean; hint: TKey; code: string }[] = [
  {
    id: 'cloud',
    label: 'land.mcpTabCloud',
    isKey: true,
    hint: 'land.mcpHintCloud',
    code: `# Hosted Cloud MCP URL (Streamable HTTP + OAuth 2.1):
https://dissentry.lihaila.com/v1/mcp

# Works with zero install in:
# • Google App (Gemini) → Cloud MCP
# • Claude (Web / Desktop / Mobile) → Custom Connector
# • Cursor / ChatGPT / Qwen Work → Remote MCP URL
# Sign in once with OpenRouter (or your API keys) in the OAuth popup.`,
  },
  {
    id: 'google',
    label: 'Google App',
    hint: 'land.mcpHintGoogle',
    code: `# Option A — Cloud MCP (easiest, zero install, no sandbox setup):
Setup method:  Cloud MCP
URL:           https://dissentry.lihaila.com/v1/mcp

# Option B — Local MCP (uses ~/.dissentry/data.json & local Ollama):
Setup method:  Local MCP
Server Name:   Dissentry
Command:       npx -y dissentry mcp
# (nvm on macOS? Use absolute node + dissentry paths after \`npm i -g dissentry\`)
# Sandbox → Customize Sandbox (⌘⇧. for dotfiles):
#   ~/.dissentry → R   |   ~/.nvm → R + X   |   Outbound network ✓`,
  },
  {
    id: 'json',
    label: 'Cursor / Antigravity / WorkBuddy',
    hint: 'land.mcpHintJson',
    code: `{
  "mcpServers": {
    "dissentry": {
      "command": "npx",
      "args": ["-y", "dissentry", "mcp"]
    }
  }
}`,
  },
  {
    id: 'claude',
    label: 'Claude Code',
    hint: 'land.mcpHintClaude',
    code: `# Hosted Cloud MCP (OAuth 2.1, zero local setup)
claude mcp add --transport http dissentry https://dissentry.lihaila.com/v1/mcp

# Or Local stdio (reuses ~/.dissentry/data.json)
claude mcp add dissentry -- npx -y dissentry mcp

# Optional: lock local checks strictly to Ollama / LM Studio
claude mcp add dissentry -- npx -y dissentry mcp --local-only`,
  },
  {
    id: 'qwen',
    label: 'Qwen Work',
    hint: 'land.mcpHintQwen',
    code: `# Stdio
qwen mcp add dissentry -- npx -y dissentry mcp

# Or Streamable HTTP (while \`npx dissentry\` is running)
qwen mcp add --transport http dissentry http://127.0.0.1:4317/mcp`,
  },
  {
    id: 'dsh',
    label: 'DSH',
    hint: 'land.mcpHintDsh',
    code: `- id: mcp-dissentry
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: dissentry
    transport: stdio
    command: npx
    args:
      - '-y'
      - 'dissentry'
      - 'mcp'`,
  },
  {
    id: 'http',
    label: 'land.mcpTabHttp',
    isKey: true,
    hint: 'land.mcpHintHttp',
    code: `# Exposed automatically at http://127.0.0.1:4317/mcp
npx dissentry

# Or run headless Streamable HTTP (default :4318/mcp)
npx -y dissentry mcp --http

# Client config: "url": "http://127.0.0.1:4317/mcp" (Qwen: "httpUrl")`,
  },
];

const FAQ: [TKey, TKey][] = [
  ['land.q1', 'land.a1'],
  ['land.q2', 'land.a2'],
  ['land.q3', 'land.a3'],
  ['land.q4', 'land.a4'],
  ['land.q5', 'land.a5'],
  ['land.q6', 'land.a6'],
  ['land.q7', 'land.a7'],
];

const PROMO_VIDEO_URL =
  typeof window !== 'undefined' && window.location.hostname === 'dissentry.lihaila.com'
    ? '/promo.mp4'
    : 'https://dissentry.lihaila.com/promo.mp4';

export function LandingPage({ initialSection }: { initialSection?: string } = {}) {
  const t = useT();
  const lang = useLang();
  const orAccount = useOpenRouterAccount();
  const profiles = useProfiles();
  const isReady = Boolean(orAccount) || (profiles?.length ?? 0) > 0;
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [mcpTab, setMcpTab] = useState<McpTabId>('cloud');
  const [copiedMcp, setCopiedMcp] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);

  const activeMcp = MCP_TABS.find((tab) => tab.id === mcpTab) ?? MCP_TABS[0];

  useEffect(() => {
    const targetId = initialSection || (typeof window !== 'undefined' && window.location.hash ? window.location.hash.slice(1) : '');
    if (!targetId) return;
    const id = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView();
    });
    return () => window.cancelAnimationFrame(id);
  }, [initialSection]);

  useEffect(() => {
    if (!videoOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVideoOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [videoOpen]);

  return (
    <div className="theme-light-lock min-h-screen bg-white text-slate-900">
      {/* Nav — matches Lihai La's product header pattern (Lihai La | Product) */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-4 sm:px-5">
          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <LihaiLaBrandLink />
            <span aria-hidden className="h-4 w-px bg-slate-200" />
            <Link href="/welcome" className="shrink-0"><Logo size={25} /></Link>
          </div>
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-5 text-[14px] font-medium text-slate-600 lg:flex">
            <a href="#how" className="whitespace-nowrap transition hover:text-ink">{t('land.navHow')}</a>
            <a href="#features" className="whitespace-nowrap transition hover:text-ink">{t('land.navFeatures')}</a>
            <a href="#faq" className="whitespace-nowrap transition hover:text-ink">{t('land.navFaq')}</a>
            <a href="https://github.com/Lihaila/dissentry" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 whitespace-nowrap transition hover:text-ink"><Code2 size={15} />GitHub</a>
            <a href="#mcp" className="flex items-center gap-1 whitespace-nowrap transition hover:text-ink"><Plug size={15} />MCP</a>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <LanguageSwitcher compact />
            <Link href="/" onClick={markStarted} className="hidden whitespace-nowrap rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-white shadow-xs transition hover:bg-slate-800 active:scale-[.98] sm:inline-flex">
              {t('land.openApp')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          {/* three.js: model threads weave into agreement, one dissents (public/lh-fx.js) */}
          <div aria-hidden className="lh-fx" data-fx="dissent" data-calm="main section:first-child h1, main section:first-child h1 + p" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-12 lg:grid-cols-[0.98fr_1.08fr] lg:gap-12 lg:pb-24 lg:pt-16">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200/90 bg-white/80 px-3 py-1 text-[12.5px] font-semibold text-amber-800 shadow-2xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{t('land.eyebrow')}
                </span>
                <a
                  href={lihailaUrl(lang)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/75 px-2.5 py-1 text-[12px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white hover:text-ink"
                >
                  {t('brand.byLihaiLa')}
                </a>
              </div>
              <h1 className="mt-5 text-balance text-[42px] font-extrabold leading-[1.06] tracking-tight text-ink sm:text-[54px]">{t('land.h1')}</h1>
              <p className="mt-5 max-w-xl text-pretty text-[17.5px] leading-relaxed text-slate-600">{t('land.sub')}</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                {isReady ? (
                  <>
                    <Link href="/" onClick={markStarted} className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[.98]">
                      {t('land.openApp')} <ArrowRight size={16} />
                    </Link>
                    {orAccount ? (
                      <Link href="/models" onClick={markStarted} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50/90 px-4 py-3 text-[14.5px] font-semibold text-emerald-800 shadow-2xs transition hover:border-emerald-300 hover:bg-emerald-50 active:scale-[.98]">
                        <Check size={15} strokeWidth={2.8} /> OpenRouter · {t('or.connectedBadge')}
                      </Link>
                    ) : (
                      <Link href="/models" onClick={markStarted} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300/90 bg-white/85 px-5 py-3 text-[15px] font-semibold text-ink shadow-2xs transition hover:border-slate-400 hover:bg-white active:scale-[.98]">
                        {t('nav.models')} <ArrowRight size={16} />
                      </Link>
                    )}
                  </>
                ) : (
                  <>
                    <span onClick={markStarted}><OpenRouterButton size="lg" /></span>
                    <Link href="/models" onClick={markStarted} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300/90 bg-white/85 px-5 py-3 text-[15px] font-semibold text-ink shadow-2xs transition hover:border-slate-400 hover:bg-white active:scale-[.98]">
                      {t('land.ctaKeys')} <ArrowRight size={16} />
                    </Link>
                  </>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => setVideoOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-200/90 bg-white/90 py-1.5 pl-2 pr-3.5 text-[13.5px] font-semibold text-ink shadow-2xs transition hover:border-amber-300 hover:bg-amber-50/90 active:scale-[.98]"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-2xs">
                    <Play size={11} className="ml-0.5 fill-current" />
                  </span>
                  {t('land.watchDemo')}
                </button>
                <p className="text-[13px] text-slate-500">{t('land.trustLine')}</p>
              </div>
            </div>

            {/* Hero visual: generous bottom pad so the floating dissent card is cleanly framed, never clipped */}
            <div className="relative sm:pb-12 sm:pl-6">
              <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/15">
                <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/90 px-3.5 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-300" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                  <span className="ml-3 truncate rounded-md bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-400 ring-1 ring-slate-200/80">dissentry.lihaila.com</span>
                </div>
                <img src="/landing/thread.webp" alt={t('land.shotAlt')} className="block w-full" width={1512} height={714} fetchPriority="high" />
              </div>
              <img src="/landing/share-card.webp" alt={t('land.cardAlt')} width={1200} height={1030}
                className="absolute bottom-0 left-0 hidden w-[39%] rotate-[-4deg] rounded-2xl shadow-2xl shadow-slate-900/25 ring-1 ring-slate-200/90 sm:block" />
            </div>
          </div>
        </section>

        {/* Providers */}
        <section className="border-y border-slate-200/70 bg-slate-50/70">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-4 px-5 py-6">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">{t('land.worksWith')}</span>
            {PROVIDERS.map((id) => (
              <img key={id} src={presetLogo(id)} alt={id} title={id} className="h-7 w-7 opacity-80 grayscale transition hover:scale-110 hover:opacity-100 hover:grayscale-0" />
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <h2 className="text-center text-[32px] font-extrabold tracking-tight text-ink sm:text-[36px]">{t('land.howTitle')}</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {([['land.s1t', 'land.s1b'], ['land.s2t', 'land.s2b'], ['land.s3t', 'land.s3b']] as [TKey, TKey][]).map(([title, body], i) => (
              <div key={title} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs transition hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-md">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[15px] font-bold text-white">{i + 1}</div>
                <h3 className="mt-4 text-[18px] font-bold text-ink">{t(title)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{t(body)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 bg-gradient-to-b from-amber-50/60 via-amber-50/20 to-white">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="text-center text-[32px] font-extrabold tracking-tight text-ink sm:text-[36px]">{t('land.featTitle')}</h2>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs transition hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-md">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100/90 text-amber-700"><Icon size={20} /></span>
                  <h3 className="mt-4 text-[17px] font-bold text-ink">{t(title)}</h3>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed text-slate-600">{t(body)}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-[13px] text-slate-500">
              <Globe2 size={15} /> English · 简体中文 · 日本語 · 한국어
            </div>
          </div>
        </section>

        {/* MCP Server */}
        <section id="mcp" className="scroll-mt-20 border-y border-slate-200/70 bg-slate-50/70">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/90 bg-white px-3 py-1 text-[12.5px] font-semibold text-amber-800 shadow-2xs">
                <Plug size={13} />
                {t('land.mcpBadge')}
              </span>
              <h2 className="mt-4 text-balance text-[32px] font-extrabold tracking-tight text-ink sm:text-[36px]">
                {t('land.mcpTitle')}
              </h2>
              <p className="mt-3 text-pretty text-[16px] leading-relaxed text-slate-600">
                {t('land.mcpSub')}
              </p>
            </div>

            <div className="mt-10 grid items-start gap-6 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="space-y-5">
                <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs">
                  <h3 className="text-[17px] font-bold text-ink">{t('land.mcpSetupTitle')}</h3>
                  <ol className="mt-4 space-y-3.5 text-[14.5px] leading-relaxed text-slate-600">
                    <li className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">1</span>
                      <span>{t('land.mcpStep1')}</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">2</span>
                      <span>{t('land.mcpStep2')}</span>
                    </li>
                  </ol>
                </div>

                <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs">
                  <h3 className="text-[17px] font-bold text-ink">{t('land.mcpToolsTitle')}</h3>
                  <ul className="mt-3.5 space-y-3">
                    {MCP_TOOLS.map(({ name, desc }) => (
                      <li key={name} className="text-[14px] leading-relaxed text-slate-600">
                        <code className="rounded-md bg-amber-50 px-1.5 py-0.5 font-mono text-[12.5px] font-semibold text-amber-900 ring-1 ring-amber-200/80">
                          {name}
                        </code>
                        <p className="mt-1">{t(desc)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="min-w-0 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs sm:p-6">
                <div role="tablist" aria-label="MCP Clients" className="flex flex-wrap gap-1.5">
                  {MCP_TABS.map((tab) => {
                    const active = tab.id === activeMcp.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => { setMcpTab(tab.id); setCopiedMcp(false); }}
                        className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition ${
                          active
                            ? 'bg-ink text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-ink'
                        }`}
                      >
                        {tab.isKey ? t(tab.label as TKey) : tab.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl bg-slate-950 text-slate-100 ring-1 ring-slate-900/10">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
                    <span className="flex min-w-0 items-center gap-2 text-[12px] text-slate-300">
                      <Terminal size={13} className="shrink-0 text-amber-400" />
                      <span className="truncate">{t(activeMcp.hint)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(activeMcp.code);
                        setCopiedMcp(true);
                        setTimeout(() => setCopiedMcp(false), 1500);
                      }}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-[12px] font-medium text-white transition hover:bg-white/20 active:scale-[.98]"
                    >
                      {copiedMcp ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      <span>{copiedMcp ? t('post.copied') : t('post.copy')}</span>
                    </button>
                  </div>
                  <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed text-slate-100">
                    <code>{activeMcp.code}</code>
                  </pre>
                </div>

                <p className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-[13px] leading-relaxed text-slate-700">
                  {t('land.mcpTipGlobal')}
                </p>

                <div className="mt-4 flex justify-end">
                  <a
                    href="https://github.com/Lihaila/dissentry#mcp-server-google-app-claude-code-cursor-dsh-workbuddy-qwen-work-antigravity"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-ink transition hover:text-amber-700"
                  >
                    <span>{t('land.mcpDocsLink')}</span>
                    <ArrowUpRight size={15} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-20">
          <h2 className="text-center text-[32px] font-extrabold tracking-tight text-ink sm:text-[36px]">{t('land.faqTitle')}</h2>
          <div className="mt-8 divide-y divide-slate-200/80 rounded-3xl border border-slate-200/90 bg-white shadow-2xs">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-6 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-ink">
                  {t(q)}<span className="text-xl font-normal text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2.5 text-[15px] leading-relaxed text-slate-600">{t(a)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-5 pb-20">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[36px] border border-amber-200/50 bg-gradient-to-br from-amber-100 via-rose-100 to-indigo-100 px-8 py-14 text-center shadow-sm">
            <h2 className="text-balance text-[32px] font-extrabold tracking-tight text-ink sm:text-[40px]">{t('land.ctaTitle')}</h2>
            <p className="mx-auto mt-3 max-w-xl text-[16px] text-slate-700">{t('land.ctaSub')}</p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              {isReady ? (
                <Link href="/" onClick={markStarted} className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[.98]">
                  {t('land.openApp')} <ArrowRight size={16} />
                </Link>
              ) : (
                <span onClick={markStarted}><OpenRouterButton size="lg" /></span>
              )}
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText('npx dissentry'); setCopiedCmd(true); setTimeout(() => setCopiedCmd(false), 1400); }}
                className="inline-flex items-center gap-2 rounded-full bg-white/85 px-5 py-3 font-mono text-[14px] font-medium text-ink ring-1 ring-slate-200/90 transition hover:bg-white active:scale-[.98]"
                title={t('post.copy')}
              >
                <span>npx dissentry</span>
                {copiedCmd ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} className="text-slate-400" />}
              </button>
            </div>
          </div>
        </section>
      </main>

      <LihaiLaFooter />

      {videoOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('land.watchDemo')}
          onClick={() => setVideoOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:p-6"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl overflow-hidden rounded-2xl bg-slate-950 shadow-2xl ring-1 ring-white/15"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-white/90">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white">
                  <Play size={10} className="ml-0.5 fill-current" />
                </span>
                Dissentry · {t('land.watchDemo')}
              </span>
              <button
                type="button"
                onClick={() => setVideoOpen(false)}
                aria-label={t('land.closeVideo')}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <video
              src={PROMO_VIDEO_URL}
              controls
              autoPlay
              playsInline
              className="block aspect-video w-full bg-black"
            />
          </div>
        </div>
      )}
    </div>
  );
}
