import { ArrowRight, BadgeCheck, Check, Code2, Coins, Copy, Globe2, ImageDown, Layers, Lock, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { LihaiLaBrandLink, LihaiLaFooter, lihailaUrl } from '../components/LihaiLa';
import { Logo } from '../components/Logo';
import { OpenRouterButton } from '../components/OpenRouterButton';
import { useLang, useT, type TKey } from '../i18n';
import { presetLogo } from '../lib/logos';
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

const FAQ: [TKey, TKey][] = [
  ['land.q1', 'land.a1'],
  ['land.q2', 'land.a2'],
  ['land.q3', 'land.a3'],
  ['land.q4', 'land.a4'],
  ['land.q5', 'land.a5'],
  ['land.q6', 'land.a6'],
  ['land.q7', 'land.a7'],
];

export function LandingPage() {
  const t = useT();
  const lang = useLang();
  const [copiedCmd, setCopiedCmd] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Nav — matches Lihai La's product header pattern (Lihai La | Product) */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
          <div className="flex shrink-0 items-center gap-2.5">
            <LihaiLaBrandLink />
            <span aria-hidden className="h-4 w-px bg-slate-200" />
            <Link href="/welcome" className="shrink-0"><Logo size={25} /></Link>
          </div>
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-5 text-[14px] font-medium text-slate-600 lg:flex">
            <a href="#how" className="transition hover:text-ink">{t('land.navHow')}</a>
            <a href="#features" className="transition hover:text-ink">{t('land.navFeatures')}</a>
            <a href="#faq" className="transition hover:text-ink">{t('land.navFaq')}</a>
            <a href="https://github.com/Lihaila/dissentry" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 transition hover:text-ink"><Code2 size={15} />GitHub</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <LanguageSwitcher compact />
            <Link href="/" onClick={markStarted} className="rounded-full bg-ink px-4 py-2 text-[13.5px] font-semibold text-white shadow-xs transition hover:bg-slate-800 active:scale-[.98]">
              {t('land.openApp')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-amber-200/60 blur-3xl" />
            <div className="absolute -right-32 top-6 h-[460px] w-[460px] rounded-full bg-pink-200/50 blur-3xl" />
            <div className="absolute bottom-[-180px] left-1/3 h-[500px] w-[620px] rounded-full bg-indigo-200/50 blur-3xl" />
          </div>
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
                <span onClick={markStarted}><OpenRouterButton size="lg" /></span>
                <Link href="/models" onClick={markStarted} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300/90 bg-white/85 px-5 py-3 text-[15px] font-semibold text-ink shadow-2xs transition hover:border-slate-400 hover:bg-white active:scale-[.98]">
                  {t('land.ctaKeys')} <ArrowRight size={16} />
                </Link>
              </div>
              <p className="mt-4 text-[13px] text-slate-500">{t('land.trustLine')}</p>
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
              <span onClick={markStarted}><OpenRouterButton size="lg" /></span>
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
    </div>
  );
}
