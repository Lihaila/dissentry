import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { ja } from '../src/i18n/ja';
import { ko } from '../src/i18n/ko';
import { zh } from '../src/i18n/zh';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  for (const [name, dict] of Object.entries({ zh, ja, ko })) {
    it(`${name} keeps every placeholder of the English string`, () => {
      for (const [key, value] of Object.entries(en)) {
        expect(placeholders(dict[key as keyof typeof en]), `${name}:${key}`).toEqual(placeholders(value));
      }
    });
    it(`${name} is actually translated`, () => {
      const same = Object.keys(en).filter((k) => dict[k as keyof typeof en] === en[k as keyof typeof en] && /[a-z]{4}/.test(en[k as keyof typeof en]));
      // Only technical labels may stay identical (e.g. "Base URL").
      expect(same.filter((k) => k !== 'editor.baseUrl')).toEqual([]);
    });
  }
});
