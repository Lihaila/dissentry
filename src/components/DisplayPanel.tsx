import { Check, RotateCcw, Sparkles } from 'lucide-react';
import { useT, type TKey } from '../i18n';
import { updateSettings, useSettings } from '../lib/settings';
import {
  accentSwatch,
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_BG,
  DEFAULT_THEME_FONT_SIZE,
  THEME_ACCENTS,
  THEME_BGS,
  THEME_FONT_SIZES,
  type ThemeAccent,
  type ThemeBg,
  type ThemeFontSize,
} from '../lib/theme';

const FONT_STEP_KEYS: Record<ThemeFontSize, TKey> = {
  0: 'display.font.0',
  1: 'display.font.1',
  2: 'display.font.2',
  3: 'display.font.3',
  4: 'display.font.4',
};

const BG_KEYS: Record<ThemeBg, { name: TKey; desc: TKey }> = {
  light: { name: 'display.bg.light', desc: 'display.bg.lightDesc' },
  paper: { name: 'display.bg.paper', desc: 'display.bg.paperDesc' },
  dim: { name: 'display.bg.dim', desc: 'display.bg.dimDesc' },
  dark: { name: 'display.bg.dark', desc: 'display.bg.darkDesc' },
};

const ACCENT_KEYS: Record<ThemeAccent, TKey> = {
  ink: 'display.color.ink',
  blue: 'display.color.blue',
  amber: 'display.color.amber',
  rose: 'display.color.rose',
  violet: 'display.color.violet',
  orange: 'display.color.orange',
  emerald: 'display.color.emerald',
};

/**
 * X-inspired Display Theme controls: live preview card + 5-step font size track +
 * 7 accent swatches + 4 background theme cards. Rendered on the Settings page.
 */
export function DisplayPanel() {
  const t = useT();
  const s = useSettings();
  const fontSize = s.themeFontSize;
  const accent = s.themeAccent;
  const bg = s.themeBg;
  const isCustom = bg !== DEFAULT_THEME_BG || accent !== DEFAULT_THEME_ACCENT || fontSize !== DEFAULT_THEME_FONT_SIZE;

  function resetAll() {
    updateSettings({
      themeBg: DEFAULT_THEME_BG,
      themeAccent: DEFAULT_THEME_ACCENT,
      themeFontSize: DEFAULT_THEME_FONT_SIZE,
    });
  }

  return (
    <div className="space-y-5">
      {/* Live Interactive Dissentry Preview Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-colors sm:p-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-xs" style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}>
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px]">
              <span className="font-bold text-ink">Dissentry</span>
              <span className="text-slate-500">@dissentry</span>
              <span className="text-slate-300">·</span>
              <span className="text-[12.5px] text-slate-400">{t('display.previewNow')}</span>
              <span className="ml-auto inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold pill-accent">
                {t('common.checker')}
              </span>
            </div>

            <p className="post-body-text mt-1 text-ink">
              {t('display.previewBefore')}
              <span className="rounded border px-1 py-0.5 font-medium pill-accent">@claude</span>
              {t('display.previewAfter')}{' '}
              <span className="md inline">
                <del>{t('display.previewClaim')}</del>
              </span>
            </p>

            {/* Miniature Dissent Note showing live amber glass + font scale */}
            <div className="note-card mt-2.5 overflow-hidden rounded-xl border border-amber-300/80 bg-amber-50/75 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="font-bold text-amber-900">{t('note.title')}</span>
                <span className="text-slate-500">@gpt · @gemini</span>
                <span className="ml-auto text-[11.5px] font-semibold text-accent">{t('display.previewLink')}</span>
              </div>
              <p className="mt-1 leading-snug text-slate-700" style={{ fontSize: 'var(--fs-note)' }}>
                {t('display.previewNote')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 1. Font Size (5-step X-style slider) */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold tracking-tight text-ink">{t('display.fontSize')}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-slate-600">
            {t(FONT_STEP_KEYS[fontSize])}
          </span>
        </div>
        <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
          <button
            type="button"
            disabled={fontSize === 0}
            onClick={() => updateSettings({ themeFontSize: Math.max(0, fontSize - 1) as ThemeFontSize })}
            aria-label={t('display.font.0')}
            className="shrink-0 select-none px-1 text-[12px] font-semibold text-slate-500 transition hover:text-ink disabled:opacity-35"
          >
            Aa
          </button>

          <div
            role="radiogroup"
            aria-label={t('display.fontSize')}
            className="relative flex flex-1 items-center py-2"
          >
            {/* Background track */}
            <div className="h-1 w-full rounded-full bg-slate-200" />
            {/* Active accent fill */}
            <div
              className="pointer-events-none absolute left-0 h-1 rounded-full transition-all duration-200"
              style={{
                width: `${(fontSize / 4) * 100}%`,
                backgroundColor: 'var(--accent)',
              }}
            />
            {/* 5 tactile stops */}
            <div className="absolute inset-0 flex items-center justify-between">
              {THEME_FONT_SIZES.map((step) => {
                const active = step === fontSize;
                const filled = step <= fontSize;
                return (
                  <button
                    key={step}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={t(FONT_STEP_KEYS[step])}
                    title={t(FONT_STEP_KEYS[step])}
                    onClick={() => updateSettings({ themeFontSize: step })}
                    className="group relative flex h-8 w-8 -mx-2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                    style={{ ['--tw-ring-color' as string]: 'var(--accent)' }}
                  >
                    <span
                      className={`block rounded-full transition-all duration-150 ${
                        active ? 'h-4.5 w-4.5 scale-105' : 'h-3 w-3 group-hover:scale-125'
                      }`}
                      style={{
                        backgroundColor: filled ? 'var(--accent)' : 'var(--color-slate-300)',
                        boxShadow: active
                          ? '0 0 0 5px var(--accent-soft), 0 1px 4px rgba(0, 0, 0, 0.25)'
                          : undefined,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={fontSize === 4}
            onClick={() => updateSettings({ themeFontSize: Math.min(4, fontSize + 1) as ThemeFontSize })}
            aria-label={t('display.font.4')}
            className="shrink-0 select-none px-1 text-[21px] font-bold leading-none text-slate-500 transition hover:text-ink disabled:opacity-35"
          >
            Aa
          </button>
        </div>
      </div>

      {/* 2. Accent Color (7 tactile circles) */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold tracking-tight text-ink">{t('display.color')}</span>
          <span className="text-[12px] font-semibold text-accent">{t(ACCENT_KEYS[accent])}</span>
        </div>
        <div
          role="radiogroup"
          aria-label={t('display.color')}
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-3.5 sm:px-5"
        >
          {THEME_ACCENTS.map((item) => {
            const active = item.id === accent;
            const displaySwatch = accentSwatch(item.id, bg);
            const fg = item.id === 'ink' && (bg === 'dim' || bg === 'dark') ? '#0f1419' : item.swatchFg;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={t(ACCENT_KEYS[item.id])}
                title={t(ACCENT_KEYS[item.id])}
                onClick={() => updateSettings({ themeAccent: item.id })}
                className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110 active:scale-95 sm:h-10 sm:w-10 ${
                  active ? 'scale-105' : ''
                }`}
                style={{
                  backgroundColor: displaySwatch,
                  color: fg,
                  boxShadow: active
                    ? `0 0 0 3px var(--bg-subtle), 0 0 0 5.5px ${displaySwatch}`
                    : item.id === 'ink'
                      ? 'inset 0 0 0 1px rgba(148, 163, 184, 0.35)'
                      : 'inset 0 0 0 1px rgba(0, 0, 0, 0.08)',
                }}
              >
                {active && <Check size={17} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Background Theme (4 authentic visual cards) */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[13px] font-bold tracking-tight text-ink">{t('display.bg')}</span>
          {isCustom && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-ink"
            >
              <RotateCcw size={12} />
              <span>{t('display.reset')}</span>
            </button>
          )}
        </div>
        <div
          role="radiogroup"
          aria-label={t('display.bg')}
          className="grid grid-cols-2 gap-2.5"
        >
          {THEME_BGS.map((item) => {
            const active = item.id === bg;
            const keys = BG_KEYS[item.id];
            const mutedColor = item.dark ? 'rgba(255,255,255,0.58)' : 'rgba(15,23,42,0.52)';
            const miniBar = item.dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.12)';
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateSettings({ themeBg: item.id })}
                className="group flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left transition-all duration-150 active:scale-[.98]"
                style={{
                  backgroundColor: item.surface,
                  color: item.fg,
                  border: active ? '2px solid var(--accent)' : `1.5px solid ${item.border}`,
                  boxShadow: active ? '0 0 0 3px var(--accent-soft)' : '0 1px 2px rgba(0, 0, 0, 0.04)',
                }}
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition"
                  style={
                    active
                      ? { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }
                      : { border: `2px solid ${item.dark ? 'rgba(255,255,255,0.34)' : 'rgba(15,23,42,0.24)'}` }
                  }
                >
                  {active && <Check size={12} strokeWidth={3.2} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold leading-tight">{t(keys.name)}</span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight" style={{ color: mutedColor }}>
                    {t(keys.desc)}
                  </span>
                </span>
                <span aria-hidden className="hidden shrink-0 flex-col gap-1 sm:flex">
                  <span className="block h-1 w-5 rounded-full" style={{ backgroundColor: miniBar }} />
                  <span className="block h-1 w-3.5 rounded-full" style={{ backgroundColor: item.dark ? 'rgba(251,191,36,0.55)' : 'rgba(245,158,11,0.55)' }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
