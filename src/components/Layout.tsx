import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Bot, Code2, Home, Settings, ShieldCheck } from 'lucide-react';
import { Logo } from './Logo';

const NAV = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/models', label: 'Models', icon: Bot },
  { href: '/trust', label: 'Trust', icon: ShieldCheck },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Layout({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const active = (href: string) => (href === '/' ? loc === '/' || loc.startsWith('/post') : loc.startsWith(href));
  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px]">
      <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col gap-1 px-3 py-4 sm:flex">
        <Link href="/" className="mb-4 flex items-center gap-2 px-3 py-2"><Logo /></Link>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={`flex items-center gap-4 rounded-full px-3 py-2.5 text-[17px] hover:bg-slate-100 ${active(href) ? 'font-bold' : ''}`}>
            <Icon size={22} strokeWidth={active(href) ? 2.6 : 1.8} />{label}
          </Link>
        ))}
        <div className="mt-auto px-3 text-xs leading-relaxed text-slate-500">
          Local-first: your posts and keys stay in this browser.
          <a className="mt-2 flex items-center gap-1 hover:underline" href="https://github.com/Lihaila/dissentry" target="_blank" rel="noreferrer"><Code2 size={13} /> Open source (MIT)</a>
        </div>
      </aside>
      <main className="min-h-screen w-full max-w-[640px] border-slate-200 pb-20 sm:border-x">
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-slate-200 bg-white/90 py-2 backdrop-blur sm:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-label={label} className="p-2"><Icon size={24} strokeWidth={active(href) ? 2.6 : 1.8} /></Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, sub, back }: { title: string; sub?: string; back?: boolean }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-6 border-b border-slate-200 bg-white/85 px-4 py-2.5 backdrop-blur">
      {back && (
        <button onClick={() => history.length > 1 ? history.back() : (location.href = '/')} aria-label="Back" className="-ml-2 rounded-full p-2 hover:bg-slate-100">←</button>
      )}
      <div>
        <h1 className="text-xl font-bold leading-tight">{title}</h1>
        {sub && <p className="text-[13px] text-slate-500">{sub}</p>}
      </div>
    </header>
  );
}
