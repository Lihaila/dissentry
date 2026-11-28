import { ArrowUpRight } from 'lucide-react';
import { Link } from 'wouter';
import { useLang, useT, type Lang } from '../i18n';

const SITE_LOCALE: Record<Lang, 'en' | 'cn' | 'jp' | 'kr'> = {
  en: 'en',
  zh: 'cn',
  ja: 'jp',
  ko: 'kr',
};

/** Localized URL on lihaila.com (e.g. /en/, /cn/privacy). */
export function lihailaUrl(lang: Lang, path = ''): string {
  const loc = SITE_LOCALE[lang];
  return path ? `https://lihaila.com/${loc}/${path.replace(/^\/+/, '')}` : `https://lihaila.com/${loc}/`;
}

/** Official Lihai La monogram mark (matches lihaila.com). */
export function LihaiLaMark({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="4" y="3" width="3.2" height="12" rx=".7" />
      <rect x="4" y="11.8" width="9" height="3.2" rx=".7" />
      <rect x="16.8" y="9" width="3.2" height="12" rx=".7" />
      <rect x="11" y="9" width="9" height="3.2" rx=".7" />
    </svg>
  );
}

/** Clickable parent-brand link back to lihaila.com, matching Pickwise & HitPost headers. */
export function LihaiLaBrandLink({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  const lang = useLang();
  const t = useT();
  return (
    <a
      href={lihailaUrl(lang)}
      title={t('brand.backHome')}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg font-semibold tracking-tight text-slate-600 transition hover:text-ink ${compact ? 'text-[13px]' : 'text-[13.5px] sm:text-[14.5px]'} ${className}`}
    >
      <LihaiLaMark size={compact ? 16 : 19} className={`shrink-0 text-[#c15f3c] ${compact ? '' : 'max-sm:h-4 max-sm:w-4'}`} />
      <span>Lihai La</span>
    </a>
  );
}

/** Compact "More from Lihai La" card for the app sidebar so users always see the family and can return to lihaila.com. */
export function LihaiLaFamilyCard() {
  const lang = useLang();
  const t = useT();
  const loc = SITE_LOCALE[lang];
  const links = [
    { label: lang === 'zh' ? '风筝GEO助手' : 'KiteGEO', href: `https://lihaila.com/geo/${loc}/` },
    { label: lang === 'zh' ? '慧选' : 'Pickwise', href: `https://lihaila.com/models/${loc}/` },
    { label: 'HitPost', href: 'https://lihaila.si/' },
    { label: 'OpenVidSI', href: `https://lihaila.com/openvidsi/${loc}/` },
    { label: lang === 'zh' ? '织课' : 'CourseWeaver', href: lang === 'zh' ? 'https://courseweaver.app/' : 'https://courseweaver.app/?lang=en' },
  ];
  return (
    <section className="surface-card rounded-2xl border border-slate-200/70 bg-white/75 p-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <a href={lihailaUrl(lang)} className="inline-flex items-center gap-1.5 text-[13.5px] font-bold tracking-tight text-ink transition hover:text-sky-700">
          <LihaiLaMark size={16} />
          <span>{t('brand.moreFrom')}</span>
        </a>
        <a href={lihailaUrl(lang)} className="inline-flex items-center gap-0.5 text-[12px] font-medium text-slate-500 transition hover:text-ink">
          {t('brand.allProducts')}
          <ArrowUpRight size={12} />
        </a>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {links.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[12px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-ink"
          >
            {item.label}
          </a>
        ))}
      </div>
    </section>
  );
}

/** Full 5-column official Lihai La footer (matches lihaila.com across all four languages). */
export function LihaiLaFooter() {
  const lang = useLang();
  const t = useT();
  const loc = SITE_LOCALE[lang];
  const linkCls = 'block text-[13.5px] text-slate-600 transition hover:text-ink';
  const headCls = 'mb-3 text-[12px] font-bold uppercase tracking-wider text-slate-400';

  const webApps = [
    { label: lang === 'zh' ? '风筝GEO助手' : 'KiteGEO', href: `https://lihaila.com/geo/${loc}/` },
    { label: lang === 'zh' ? '慧选' : 'Pickwise', href: `https://lihaila.com/models/${loc}/` },
    { label: 'HitPost', href: 'https://lihaila.si/' },
    { label: 'OpenVidSI', href: `https://lihaila.com/openvidsi/${loc}/` },
    { label: lang === 'zh' ? '织课' : 'CourseWeaver', href: lang === 'zh' ? 'https://courseweaver.app/' : 'https://courseweaver.app/?lang=en' },
  ];

  const products = [
    { label: 'Ultimate Book Writer', href: lihailaUrl(lang, 'ultimate-book-writer') },
    { label: 'SuiSui', href: lihailaUrl(lang, 'suisui') },
    { label: 'LiveTranslate', href: lihailaUrl(lang, 'livetranslate') },
    { label: 'Parrovo', href: lihailaUrl(lang, 'parrovo') },
    { label: 'Annua', href: lihailaUrl(lang, 'annua') },
    { label: 'Rungs', href: lihailaUrl(lang, 'rungs') },
    ...(lang !== 'zh' ? [{ label: 'Skylark', href: lihailaUrl(lang, 'skylark') }] : []),
    { label: t('footer.agentSkills'), href: lihailaUrl(lang, 'skills') },
  ];

  return (
    <footer className="border-t border-slate-200/80 bg-slate-50/80 text-slate-600">
      <div className="mx-auto max-w-6xl px-5 pb-10 pt-14">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.55fr]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <a href={lihailaUrl(lang)} className="inline-flex items-center gap-2 text-[17px] font-extrabold tracking-tight text-ink transition hover:opacity-80">
              <LihaiLaMark size={22} />
              <span>Lihai La</span>
            </a>
            <p className="mt-3 max-w-xs text-[13.5px] leading-relaxed text-slate-500">{t('footer.blurb')}</p>
            <a
              href={lihailaUrl(lang)}
              className="mt-4 inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-ink shadow-2xs transition hover:border-slate-300 hover:bg-slate-50"
            >
              <span>{t('brand.backHome')}</span>
              <ArrowUpRight size={13} />
            </a>
          </div>

          <div>
            <h4 className={headCls}>{t('footer.webApps')}</h4>
            <div className="space-y-2">
              {webApps.map((item) => (
                <a key={item.href} href={item.href} className={linkCls}>{item.label}</a>
              ))}
              <Link href="/welcome" className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
                <span>Dissentry</span>
                <span className="rounded-full bg-amber-100/90 px-1.5 py-px text-[10.5px] font-semibold text-amber-800">{t('footer.current')}</span>
              </Link>
            </div>
          </div>

          <div>
            <h4 className={headCls}>{t('footer.products')}</h4>
            <div className="space-y-2">
              {products.map((item) => (
                <a key={item.href} href={item.href} className={linkCls}>{item.label}</a>
              ))}
            </div>
          </div>

          <div>
            <h4 className={headCls}>{t('footer.company')}</h4>
            <div className="space-y-2">
              <a href={lihailaUrl(lang, 'about')} className={linkCls}>{t('footer.about')}</a>
              <a href={lihailaUrl(lang, 'changelog')} className={linkCls}>{t('footer.changelog')}</a>
              <Link href="/privacy" className={linkCls}>{t('footer.privacy')}</Link>
              <Link href="/terms" className={linkCls}>{t('footer.terms')}</Link>
              <a href={lihailaUrl(lang, 'delete-account')} className={linkCls}>{t('footer.deleteAccount')}</a>
              <div className="pt-2">
                <a href="https://github.com/Lihaila/dissentry" target="_blank" rel="noopener noreferrer" className={linkCls}>GitHub (MIT)</a>
                <a href="https://www.npmjs.com/package/dissentry" target="_blank" rel="noopener noreferrer" className={`${linkCls} mt-2`}>npm · dissentry</a>
              </div>
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <h4 className={headCls}>{t('footer.contact')}</h4>
            <div className="space-y-2">
              <a href="mailto:contact@lihaila.com" className={linkCls}>contact@lihaila.com</a>
              <a href="tel:+16462104451" className={linkCls}>(646) 210-4451</a>
              <address className="pt-1 text-[12.5px] not-italic leading-relaxed text-slate-500">
                Lihai La LLC<br />
                1111B S Governors Ave STE 34093<br />
                Dover, DE 19904
              </address>
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <SocialIcon href="https://x.com/LihaiLaLLC" label="Lihai La on X">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </SocialIcon>
                <SocialIcon href="https://www.linkedin.com/company/lihaila/" label="Lihai La on LinkedIn">
                  <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45z" />
                </SocialIcon>
                <SocialIcon href="https://github.com/Lihaila" label="Lihai La on GitHub">
                  <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
                </SocialIcon>
                <SocialIcon href="https://www.youtube.com/@lihaila" label="Lihai La on YouTube">
                  <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.6 15.57V8.43L15.82 12z" />
                </SocialIcon>
                <SocialIcon href="https://www.instagram.com/lihaila_usa/" label="Lihai La on Instagram">
                  <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 0 1-1.38-.9 3.72 3.72 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63a5.88 5.88 0 0 0-2.13 1.38A5.88 5.88 0 0 0 .63 4.14C.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.13a5.88 5.88 0 0 0 2.13 1.38c.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.88 5.88 0 0 0 2.13-1.38 5.88 5.88 0 0 0 1.38-2.13c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.88 5.88 0 0 0-1.38-2.13A5.88 5.88 0 0 0 19.86.63C19.1.33 18.22.13 16.95.07 15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" />
                </SocialIcon>
                <SocialIcon href="https://www.tiktok.com/@lihaila_usa" label="Lihai La on TikTok">
                  <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-2.59-2.59c.27 0 .53.04.78.12v-3.2a5.8 5.8 0 0 0-.78-.06 5.79 5.79 0 1 0 5.79 5.79V9.01a7.35 7.35 0 0 0 4.29 1.38V7.3a4.29 4.29 0 0 1-3.34-1.48z" />
                </SocialIcon>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200/80 pt-6 text-[12.5px] text-slate-400">
          <span>© 2026 Lihai La LLC. {t('footer.rights')}</span>
          <span>{t('footer.location')}</span>
        </div>
      </div>
    </footer>
  );
}

function SocialIcon({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-ink"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{children}</svg>
    </a>
  );
}
