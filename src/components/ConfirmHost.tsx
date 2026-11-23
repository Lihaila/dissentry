import { useEffect, useRef } from 'react';
import { useT } from '../i18n';
import { settleConfirm, usePendingConfirm } from '../lib/confirm';

export function ConfirmHost() {
  const req = usePendingConfirm();
  const t = useT();
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!req) return;
    ok.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); settleConfirm(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [req]);
  if (!req) return null;
  return (
    <div className="modal-backdrop animate-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[3px]"
      onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) settleConfirm(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
        className="surface-card animate-modal w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl shadow-slate-900/20 ring-1 ring-slate-200/90" onClick={(e) => e.stopPropagation()}>
        <h2 id="confirm-title" className="text-[18px] font-bold tracking-tight text-ink">{req.title}</h2>
        {req.body && <p className="mt-2 text-[14px] leading-relaxed text-slate-600">{req.body}</p>}
        <div className="mt-6 flex flex-col gap-2">
          <button ref={ok} onClick={() => settleConfirm(true)}
            className={`rounded-full px-5 py-2.5 text-[14.5px] font-semibold shadow-xs transition active:scale-[.98] ${req.danger ? 'bg-[#dc2626] text-white hover:bg-[#b91c1c]' : 'btn-accent'}`}>
            {req.confirmLabel}
          </button>
          <button onClick={() => settleConfirm(false)} className="rounded-full border border-slate-200 px-5 py-2.5 text-[14.5px] font-semibold text-ink transition hover:bg-slate-50 active:scale-[.98]">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
