import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, BarChart3, Bot, Check, Code2, Home, PenSquare, Plus, Settings, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { db } from '../lib/db';
import { useProfiles } from '../lib/hooks';
import { openNewThread, threadTitle } from '../lib/ui';
import { useLang, useT } from '../i18n';
import { confirmAction } from '../lib/confirm';
import { profileKind } from '../lib/providers';
import { deletePostTree } from '../lib/store';
import { Avatar } from './Avatar';
import { ConfirmHost } from './ConfirmHost';
import { LanguageSwitcher } from './LanguageSwitcher';
import { LihaiLaBrandLink, LihaiLaFamilyCard, LihaiLaMark, lihailaUrl } from './LihaiLa';
import { Logo } from './Logo';
import { NewThreadDialog } from './NewThreadDialog';

export function Layout({ children }: { children: ReactNode }) {
  const t = useT();
  const lang = useLang();
  const [loc] = useLocation();
  const NAV = [
    { href: '/', label: t('nav.home'), icon: Home },
    { href: '/models', label: t('nav.models'), icon: Bot },
    { href: '/trust', label: t('nav.trust'), icon: ShieldCheck },
    { href: '/usage', label: t('nav.usage'), icon: BarChart3 },
    { href: '/settings', label: t('nav.settings'), icon: Settings },
  ];
  const active = (href: string) => (href === '/' ? loc === '/' : loc.startsWith(href));

  // "n" opens a new thread, like compose shortcuts elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !el.closest('input,textarea,select,[contenteditable]') && !document.querySelector('[aria-modal="true"]')) {
        e.preventDefault();
        openNewThread();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1320px] justify-center md:px-3 lg:gap-4">
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col px-3 py-5 md:flex">
        <div className="mb-5 px-2">
          <Link href="/" className="-ml-1.5 inline-flex rounded-xl px-1.5 py-1 transition hover:bg-slate-200/50"><Logo /></Link>
          <a
            href={lihailaUrl(lang)}
            title={t('brand.backHome')}
            className="mt-0.5 inline-flex items-center gap-1.5 pl-0.5 text-[12px] font-medium text-slate-500 transition hover:text-ink"
          >
            <LihaiLaMark size={13} className="text-slate-600" />
            <span>{t('brand.byLihaiLa')}</span>
            <span aria-hidden className="text-slate-300">·</span>
            <span className="text-slate-400 hover:underline">lihaila.com</span>
          </a>
        </div>

        <button onClick={openNewThread}
          className="mb-5 flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14.5px] font-semibold text-white shadow-sm shadow-slate-900/15 transition hover:bg-slate-800 active:scale-[.98]">
          <PenSquare size={17} />
          <span>{t('nav.newThread')}</span>
          <kbd className="ml-0.5 hidden rounded bg-white/15 px-1.5 py-0.5 font-sans text-[10.5px] font-medium text-white/80 lg:inline">N</kbd>
        </button>

        <nav className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition ${active(href) ? 'bg-slate-200/70 font-semibold text-ink' : 'text-slate-600 hover:bg-slate-200/45 hover:text-ink'}`}>
              <Icon size={19} strokeWidth={active(href) ? 2.3 : 1.8} />{label}
            </Link>
          ))}
        </nav>

        <RecentThreads />

        <div className="mt-auto space-y-2.5 border-t border-slate-200/70 px-2 pt-3.5">
          <LanguageSwitcher />
          <p className="text-[11.5px] leading-relaxed text-slate-400">{t('layout.localFirst')}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-slate-400">
            <a href={lihailaUrl(lang)} className="font-medium text-slate-500 transition hover:text-ink">Lihai La</a>
            <Link href="/welcome" className="transition hover:text-slate-700">{t('layout.about')}</Link>
            <Link href="/privacy" className="transition hover:text-slate-700">{t('footer.privacy')}</Link>
            <Link href="/terms" className="transition hover:text-slate-700">{t('footer.terms')}</Link>
            <a className="inline-flex items-center gap-1 transition hover:text-slate-700" href="https://github.com/Lihaila/dissentry" target="_blank" rel="noopener noreferrer">
              <Code2 size={12} /> {t('layout.openSource')}
            </a>
          </div>
        </div>
      </aside>

      <main className="min-h-screen w-full max-w-[660px] flex-1 border-slate-200/80 bg-white pb-24 shadow-xs shadow-slate-900/[0.02] md:border-x md:pb-12">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-2.5 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2">
            <LihaiLaBrandLink compact />
            <span aria-hidden className="h-3.5 w-px bg-slate-200" />
            <Link href="/"><Logo size={23} /></Link>
          </div>
          <LanguageSwitcher compact />
        </div>
        {children}
      </main>

      <RightPanel />

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200/90 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-label={label} className={`p-3.5 transition ${active(href) ? 'text-ink' : 'text-slate-400 hover:text-slate-600'}`}>
            <Icon size={22} strokeWidth={active(href) ? 2.4 : 1.8} />
          </Link>
        ))}
      </nav>
      <button onClick={openNewThread} aria-label={t('nav.newThread')}
        className="fixed bottom-20 right-5 z-30 flex h-13 w-13 items-center justify-center rounded-full bg-ink text-white shadow-lg shadow-slate-900/25 transition active:scale-95 md:hidden">
        <Plus size={24} />
      </button>
      <NewThreadDialog />
      <ConfirmHost />
    </div>
  );
}

function RecentThreads() {
  const t = useT();
  const [loc, navigate] = useLocation();
  async function remove(id: string) {
    if (!(await confirmAction({ title: t('post.deleteThreadTitle'), body: t('post.deleteBody'), confirmLabel: t('post.delete'), danger: true }))) return;
    const deleted = await deletePostTree(id);
    const curId = loc.startsWith('/post/') ? loc.slice('/post/'.length) : null;
    if (curId && deleted.includes(curId)) navigate('/');
  }
  const roots = useLiveQuery(() => db.posts.orderBy('createdAt').reverse().filter((p) => !p.parentId).limit(14).toArray(), []);
  if (!roots?.length) return null;
  return (
    <div className="mt-5 min-h-0 flex-1 overflow-y-auto pb-2">
      <h3 className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{t('layout.recent')}</h3>
      <div className="space-y-0.5">
        {roots.map((r) => {
          const isActive = loc === `/post/${r.id}`;
          return (
            <div key={r.id} className={`group flex items-center rounded-lg transition ${isActive ? 'bg-slate-200/70 font-medium text-ink' : 'text-slate-600 hover:bg-slate-200/45 hover:text-ink'}`}>
              <Link href={`/post/${r.id}`} className="flex min-w-0 flex-1 items-center gap-2 truncate px-3 py-1.5 text-[13px]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full transition ${isActive ? 'bg-amber-500' : 'bg-slate-300 group-hover:bg-slate-400'}`} />
                <span className="truncate">{threadTitle(r.text, 48, r.attachments?.[0]?.name)}</span>
              </Link>
              <button onClick={() => void remove(r.id)} aria-label={t('post.deleteThreadTitle')} title={t('post.deleteThreadTitle')}
                className="mr-1 shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100">
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RightPanel() {
  const t = useT();
  const profiles = useProfiles();
  const enabled = (profiles ?? []).filter((p) => p.enabled);
  const toggleChecker = (id: string, cur: boolean) => void db.profiles.update(id, { isChecker: !cur });

  return (
    <aside className="sticky top-0 hidden h-screen w-[328px] shrink-0 space-y-4 overflow-y-auto px-3 py-5 xl:block">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs shadow-slate-900/[0.03]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14.5px] font-bold tracking-tight text-ink">{t('panel.yourModels')}</h2>
          <Link href="/models" className="text-[12.5px] font-semibold text-sky-600 transition hover:text-sky-700 hover:underline">{t('panel.manage')}</Link>
        </div>
        {enabled.length === 0 && <p className="text-[13px] leading-relaxed text-slate-500">{t('panel.noModels')}</p>}
        <ul className="space-y-1">
          {enabled.map((p) => {
            const k = profileKind(p);
            return (
              <li key={p.id} className="group -mx-1.5 flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition hover:bg-slate-50">
                <Avatar profile={p} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold leading-tight text-ink">{p.name}</div>
                  <div className="truncate text-[11.5px] text-slate-500">@{p.handle} · {p.modelId}</div>
                </div>
                {k === 'chat' ? (
                  <button
                    type="button"
                    onClick={() => toggleChecker(p.id, p.isChecker)}
                    title={t('editor.checker')}
                    aria-pressed={p.isChecker}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
                      p.isChecker
                        ? 'bg-amber-100/90 text-amber-800 ring-1 ring-amber-200/80 hover:bg-amber-200/70'
                        : 'text-slate-400 opacity-0 ring-1 ring-slate-200 hover:bg-white hover:text-slate-600 focus:opacity-100 group-hover:opacity-100'
                    }`}
                  >
                    {p.isChecker && <Check size={10} strokeWidth={3} />}
                    {t('common.checker')}
                  </button>
                ) : (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ${
                    k === 'image' ? 'bg-sky-50 text-sky-700 ring-sky-200/80'
                    : k === 'audio' ? 'bg-teal-50 text-teal-700 ring-teal-200/80'
                    : 'bg-indigo-50 text-indigo-700 ring-indigo-200/80'
                  }`}>
                    {t(`kind.${k}`)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <Link href="/models?add=1" className="mt-3 flex items-center gap-1.5 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[12.5px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-ink">
          <Plus size={14} /> {t('panel.addModel')}
        </Link>
      </section>
      <section className="rounded-2xl border border-slate-200/70 bg-white/75 p-4">
        <h2 className="mb-3 text-[14.5px] font-bold tracking-tight text-ink">{t('panel.howTitle')}</h2>
        <ol className="space-y-2.5 text-[13px] leading-relaxed text-slate-600">
          {(['panel.how1', 'panel.how2', 'panel.how3'] as const).map((k, i) => (
            <li key={k} className="flex gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100/90 text-[11px] font-bold text-amber-900">{i + 1}</span>
              <span>{t(k)}</span>
            </li>
          ))}
        </ol>
      </section>
      <LihaiLaFamilyCard />
    </aside>
  );
}

export function PageHeader({ title, sub, back }: { title: string; sub?: string; back?: boolean }) {
  const t = useT();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur-md max-md:top-[49px]">
      {back && (
        <button onClick={() => (history.length > 1 ? history.back() : (location.href = '/'))} aria-label={t('common.back')}
          className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-ink">
          <ArrowLeft size={18} />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-[18px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
        {sub && <p className="truncate text-[12.5px] text-slate-500">{sub}</p>}
      </div>
    </header>
  );
}
