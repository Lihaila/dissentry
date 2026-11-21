import { tokens } from './notes';
import type { Note } from './types';

const norm = (s: string) => s.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Mark the sentences that notes dispute, using GFM strikethrough (~~…~~), which the UI styles as a
 * wavy amber underline rather than a strike. Only exact (case/emphasis-insensitive) matches outside
 * code blocks are marked; anything else is left untouched.
 */
export function markClaims(markdown: string, notes: Pick<Note, 'claim' | 'status'>[]): string {
  const claims = notes
    .filter((n) => n.status !== 'dismissed')
    .map((n) => n.claim.replace(/^["“'‘]+|["”'’.。!?！？]+$/g, '').trim())
    .filter((c) => c.length >= 8);
  if (!claims.length) return markdown;
  const parts = markdown.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (i % 2 === 1) return part; // code block
    let out = part;
    for (const claim of claims) {
      const target = norm(claim);
      // Walk the text, mapping normalized positions back to original indices.
      const map: number[] = [];
      let flat = '';
      for (let j = 0; j < out.length; j++) {
        const ch = out[j];
        if (/[*_`]/.test(ch)) continue;
        if (/\s/.test(ch)) { if (flat.endsWith(' ')) continue; flat += ' '; map.push(j); continue; }
        flat += ch.toLowerCase();
        map.push(j);
      }
      const at = flat.indexOf(target);
      if (at < 0) { out = markBestSentence(out, claim); continue; }
      let start = map[at];
      let end = map[at + target.length - 1] + 1;
      const raw = out.slice(start, end);
      // If the match cuts a **bold** span in half, absorb the dangling marker on the other side.
      if (((raw.match(/\*\*|__/g) ?? []).length) % 2 === 1) {
        const after = out.slice(end, end + 2);
        if (after === '**' || after === '__') end += 2;
        else if (['**', '__'].includes(out.slice(start - 2, start))) start -= 2;
      }
      const inner = out.slice(start, end).replace(/\*\*|__/g, '');
      if (inner.includes('\n') || inner.includes('~~')) continue;
      out = `${out.slice(0, start)}~~${inner}~~${out.slice(end)}`;
    }
    return out;
  }).join('');
}

/** Checkers often paraphrase: mark the sentence that shares most of the claim's words (if clearly similar). */
function markBestSentence(text: string, claim: string): string {
  const want = tokens(claim);
  if (want.size < 3) return text;
  let best: { start: number; end: number; score: number } | null = null;
  for (const m of text.matchAll(/[^.!?。！？\n]+[.!?。！？]?/g)) {
    const sentence = m[0];
    if (sentence.includes('~~') || /^\s*([#>|-]|\d+\.)/.test(sentence)) continue;
    const have = tokens(sentence);
    let inter = 0;
    for (const w of want) if (have.has(w)) inter++;
    const score = inter / want.size;
    if (score >= 0.7 && (!best || score > best.score)) {
      const lead = sentence.length - sentence.trimStart().length;
      best = { start: m.index! + lead, end: m.index! + sentence.trimEnd().length, score };
    }
  }
  if (!best) return text;
  const inner = text.slice(best.start, best.end).replace(/\*\*|__/g, '');
  return `${text.slice(0, best.start)}~~${inner}~~${text.slice(best.end)}`;
}
