import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, Bot, Code2, Home, PenSquare, Plus, Settings, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { db } from '../lib/db';
import { useProfiles } from '../lib/hooks';
import { openNewThread, threadTitle } from '../lib/ui';
import { useT } from '../i18n';
import { confirmAction } from '../lib/confirm';
import { deletePostTree } from '../lib/store';
import { Avatar } from './Avatar';
import { ConfirmHost } from './ConfirmHost';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { NewThreadDialog } from './NewThreadDialog';

export function Layout({ children }: { children: ReactNode }) {
  const t = useT();
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
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey && !el.closest('input,textarea,select,[contenteditable]')) {
        e.preventDefault();
        openNewThread();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1280px] justify-center">
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col px-4 py-5 md:flex">
        <Link href="/" className="mb-6 px-2"><Logo /></Link>
        <button onClick={openNewThread}
          className="mb-5 flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-[15px] font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[.98]">
          <PenSquare size={18} /> {t('nav.newThread')}
        </button>
        <nav className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}
              className={`flex items-center gap-3.5 rounded-xl px-3 py-2.5 text-[15.5px] transition ${active(href) ? 'bg-slate-100 font-semibold text-ink' : 'text-slate-600 hover:bg-slate-50 hover:text-ink'}`}>
              <Icon size={20} strokeWidth={active(href) ? 2.4 : 1.8} />{label}
            </Link>
          ))}
        </nav>
        <RecentThreads />
        <div className="mt-auto space-y-3 px-2 pt-4">
          <LanguageSwitcher />
          <p className="text-[12px] leading-relaxed text-slate-400">{t('layout.localFirst')}</p>
          <Link href="/welcome" className="block text-[12px] text-slate-400 hover:text-slate-600">{t('layout.about')}</Link>
          <a className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-600" href="https://github.com/Lihaila/dissentry" target="_blank" rel="noreferrer">
            <Code2 size={13} /> {t('layout.openSource')}
          </a>
        </div>
      </aside>

      <main className="min-h-screen w-full max-w-[640px] border-slate-200/80 bg-white pb-24 md:border-x md:pb-10">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-2.5 backdrop-blur md:hidden">
          <Link href="/"><Logo size={24} /></Link>
          <LanguageSwitcher compact />
        </div>
        {children}
      </main>

      <RightPanel />

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-label={label} className={`p-3.5 ${active(href) ? 'text-ink' : 'text-slate-400'}`}>
            <Icon size={23} strokeWidth={active(href) ? 2.4 : 1.8} />
          </Link>
        ))}
      </nav>
      <button onClick={openNewThread} aria-label={t('nav.newThread')}
        className="fixed bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white shadow-lg shadow-slate-900/25 md:hidden">
        <Plus size={26} />
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
    await deletePostTree(id);
    if (loc.startsWith('/post/')) navigate('/');
  }
  const roots = useLiveQuery(() => db.posts.orderBy('createdAt').reverse().filter((p) => !p.parentId).limit(12).toArray(), []);
  if (!roots?.length) return null;
  return (
    <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
      <h3 className="px-3 pb-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">{t('layout.recent')}</h3>
      {roots.map((r) => (
        <div key={r.id} className={`group flex items-center rounded-lg transition ${loc === `/post/${r.id}` ? 'bg-slate-100 text-ink' : 'text-slate-600 hover:bg-slate-50'}`}>
          <Link href={`/post/${r.id}`} className="min-w-0 flex-1 truncate px-3 py-1.5 text-[13.5px]">{threadTitle(r.text, 48)}</Link>
          <button onClick={() => void remove(r.id)} aria-label={t('post.deleteThreadTitle')} title={t('post.deleteThreadTitle')}
            className="mr-1 shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function RightPanel() {
  const t = useT();
  const profiles = useProfiles();
  const enabled = (profiles ?? []).filter((p) => p.enabled);
  return (
    <aside className="sticky top-0 hidden h-screen w-[320px] shrink-0 space-y-4 overflow-y-auto px-5 py-5 xl:block">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold">{t('panel.yourModels')}</h2>
          <Link href="/models" className="text-[13px] font-medium text-sky-600 hover:underline">{t('panel.manage')}</Link>
        </div>
        {enabled.length === 0 && <p className="text-[13.5px] text-slate-500">{t('panel.noModels')}</p>}
        <ul className="space-y-2.5">
          {enabled.map((p) => (
            <li key={p.id} className="flex items-center gap-2.5">
              <Avatar profile={p} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold leading-tight">{p.name}</div>
                <div className="truncate text-[12px] text-slate-500">@{p.handle} · {p.modelId}</div>
              </div>
              {p.isChecker && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{t('common.checker')}</span>}
            </li>
          ))}
        </ul>
        <Link href="/models" className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-slate-600 hover:text-ink"><Plus size={15} /> {t('panel.addModel')}</Link>
      </section>
      <section className="rounded-2xl bg-slate-50 p-4">
        <h2 className="mb-2.5 text-[15px] font-bold">{t('panel.howTitle')}</h2>
        <ol className="space-y-2.5 text-[13.5px] leading-relaxed text-slate-600">
          {(['panel.how1', 'panel.how2', 'panel.how3'] as const).map((k, i) => (
            <li key={k} className="flex gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-ink ring-1 ring-slate-200">{i + 1}</span>
              <span>{t(k)}</span>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

export function PageHeader({ title, sub, back }: { title: string; sub?: string; back?: boolean }) {
  const t = useT();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur max-md:top-[49px]">
      {back && (
        <button onClick={() => (history.length > 1 ? history.back() : (location.href = '/'))} aria-label={t('common.back')}
          className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-lg hover:bg-slate-100">←</button>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-[19px] font-bold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="truncate text-[13px] text-slate-500">{sub}</p>}
      </div>
    </header>
  );
}
