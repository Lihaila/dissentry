import { getLang } from '../i18n';

const UNITS: Record<string, [string, string, string]> = {
  en: ['s', 'm', 'h'], zh: ['秒', '分钟', '小时'], ja: ['秒', '分', '時間'], ko: ['초', '분', '시간'],
};

/** Compact, X-style relative time: 12s · 5m · 3h · Nov 20 (localized). */
export function timeAgo(ts: number): string {
  const lang = getLang();
  const [su, mu, hu] = UNITS[lang] ?? UNITS.en;
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}${su}`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}${mu}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}${hu}`;
  const d = new Date(ts);
  const locale = { en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR' }[lang] ?? 'en-US';
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

export function fullDate(ts: number): string {
  const locale = { en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR' }[getLang()] ?? 'en-US';
  return new Date(ts).toLocaleString(locale);
}
