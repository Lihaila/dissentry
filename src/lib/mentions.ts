const MENTION_RE = /(^|[^\w@])@([a-z0-9][a-z0-9_.-]*)/gi;

/** Normalise a display name into a handle: lowercase, [a-z0-9_.-]. */
export function toHandle(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_.-]/g, '').replace(/^[^a-z0-9]+/, '').slice(0, 30);
}

/**
 * Returns the handles mentioned in `text` that exist in `known`, in order of first appearance.
 * `@all` expands to every known handle.
 */
export function parseMentions(text: string, known: string[]): string[] {
  const set = new Set(known.map((h) => h.toLowerCase()));
  const out: string[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const h = m[2].toLowerCase().replace(/[.-]+$/, '');
    if (h === 'all') {
      for (const k of known) if (!out.includes(k.toLowerCase())) out.push(k.toLowerCase());
    } else if (set.has(h) && !out.includes(h)) {
      out.push(h);
    }
  }
  return out;
}

/** The partial @token immediately before the caret, if any (for autocomplete). */
export function mentionQueryAt(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = /(^|[^\w@])@([a-z0-9_.-]*)$/i.exec(before);
  if (!m) return null;
  return { query: m[2].toLowerCase(), start: caret - m[2].length - 1 };
}
