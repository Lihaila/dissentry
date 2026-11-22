import { Globe } from 'lucide-react';
import { LANGS, setLang, useLang, useT, type Lang } from '../i18n';

export function LanguageSwitcher({ compact }: { compact?: boolean }) {
  const lang = useLang();
  const t = useT();
  return (
    <label className={`flex shrink-0 items-center gap-1.5 text-slate-500 ${compact ? 'text-[13px]' : 'text-[13px]'}`} title={t('layout.language')}>
      <Globe size={15} className="shrink-0" />
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={t('layout.language')}
        className="cursor-pointer rounded-md bg-transparent py-1 pr-1 font-medium text-slate-600 outline-none hover:text-ink">
        {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>
  );
}
