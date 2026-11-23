import { getSettings, subscribeSettings, type Settings } from './settings';

export type ThemeBg = 'light' | 'paper' | 'dim' | 'dark';
export type ThemeAccent = 'ink' | 'blue' | 'amber' | 'rose' | 'violet' | 'orange' | 'emerald';
export type ThemeFontSize = 0 | 1 | 2 | 3 | 4;

export interface BgPreset {
  id: ThemeBg;
  /** Preview card surface color (always rendered verbatim regardless of active theme). */
  surface: string;
  /** Preview card border color. */
  border: string;
  /** Preview card primary text color. */
  fg: string;
  /** Browser `<meta name="theme-color">` value. */
  metaColor: string;
  /** True when the theme uses dark color-scheme. */
  dark: boolean;
}

export interface AccentPreset {
  id: ThemeAccent;
  /** Swatch display color. */
  swatch: string;
  /** Checkmark color rendered on top of the swatch. */
  swatchFg: string;
}

export const THEME_BGS: readonly BgPreset[] = [
  { id: 'light', surface: '#ffffff', border: '#e2e8f0', fg: '#0f172a', metaColor: '#ffffff', dark: false },
  { id: 'paper', surface: '#fbf8f2', border: '#ddd2c0', fg: '#231d18', metaColor: '#fbf8f2', dark: false },
  { id: 'dim', surface: '#15202b', border: '#38444d', fg: '#f7f9f9', metaColor: '#15202b', dark: true },
  { id: 'dark', surface: '#000000', border: '#2f3336', fg: '#e7e9ea', metaColor: '#000000', dark: true },
] as const;

export const THEME_ACCENTS: readonly AccentPreset[] = [
  { id: 'ink', swatch: '#0f172a', swatchFg: '#ffffff' },
  { id: 'blue', swatch: '#1d9bf0', swatchFg: '#ffffff' },
  { id: 'amber', swatch: '#f59e0b', swatchFg: '#0f172a' },
  { id: 'rose', swatch: '#f43f5e', swatchFg: '#ffffff' },
  { id: 'violet', swatch: '#7c3aed', swatchFg: '#ffffff' },
  { id: 'orange', swatch: '#f97316', swatchFg: '#ffffff' },
  { id: 'emerald', swatch: '#10b981', swatchFg: '#ffffff' },
] as const;

export const THEME_FONT_SIZES: readonly ThemeFontSize[] = [0, 1, 2, 3, 4] as const;

export const DEFAULT_THEME_BG: ThemeBg = 'light';
export const DEFAULT_THEME_ACCENT: ThemeAccent = 'ink';
export const DEFAULT_THEME_FONT_SIZE: ThemeFontSize = 2;

const BG_SET = new Set<string>(THEME_BGS.map((b) => b.id));
const ACCENT_SET = new Set<string>(THEME_ACCENTS.map((a) => a.id));

export function isThemeBg(v: unknown): v is ThemeBg {
  return typeof v === 'string' && BG_SET.has(v);
}

export function isThemeAccent(v: unknown): v is ThemeAccent {
  return typeof v === 'string' && ACCENT_SET.has(v);
}

export function isThemeFontSize(v: unknown): v is ThemeFontSize {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4;
}

export function accentSwatch(id: ThemeAccent, bg: ThemeBg): string {
  if (id === 'ink' && (bg === 'dim' || bg === 'dark')) return '#eff3f4';
  return THEME_ACCENTS.find((a) => a.id === id)?.swatch ?? '#0f172a';
}

export function isDarkTheme(bg: ThemeBg): boolean {
  return bg === 'dim' || bg === 'dark';
}

/** Apply current display settings to `<html>` data attributes and `<meta name="theme-color">`. */
export function applyTheme(s: Pick<Settings, 'themeBg' | 'themeAccent' | 'themeFontSize'>): void {
  if (typeof document === 'undefined') return;
  const bg = isThemeBg(s.themeBg) ? s.themeBg : DEFAULT_THEME_BG;
  const accent = isThemeAccent(s.themeAccent) ? s.themeAccent : DEFAULT_THEME_ACCENT;
  const fontSize = isThemeFontSize(s.themeFontSize) ? s.themeFontSize : DEFAULT_THEME_FONT_SIZE;

  const root = document.documentElement;
  root.dataset.theme = bg;
  root.dataset.accent = accent;
  root.dataset.font = String(fontSize);

  const preset = THEME_BGS.find((b) => b.id === bg) ?? THEME_BGS[0];
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = preset.metaColor;
}

let themeInitialized = false;

/** Synchronously apply saved display theme on startup and stay in sync with settings updates. */
export function initTheme(): void {
  applyTheme(getSettings());
  if (themeInitialized) return;
  themeInitialized = true;
  subscribeSettings(() => applyTheme(getSettings()));
}
