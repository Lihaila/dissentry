import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useT } from '../i18n';
import { closeNewThread, useNewThreadOpen } from '../lib/ui';
import { Composer } from './Composer';

export function NewThreadDialog() {
  const open = useNewThreadOpen();
  const t = useT();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeNewThread();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/30 p-3 pt-[10vh] backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && closeNewThread()}>
      <div className="w-full max-w-[600px] overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <button onClick={closeNewThread} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label={t('common.close')}>✕</button>
          <span className="text-[14px] font-semibold">{t('nav.newThread')}</span>
          <span className="w-8" />
        </div>
        <Composer autoFocus onPosted={(id) => { closeNewThread(); navigate(`/post/${id}`); }} />
      </div>
    </div>
  );
}
