import type { CheckNoteDraft, CheckResult, Note, Severity } from './types';

const SEVERITIES: Severity[] = ['minor', 'major', 'critical'];

/** Extract the first balanced JSON object from model output (tolerates code fences and chatter). */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error('No JSON object in checker output');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
  }
  throw new Error('Unterminated JSON in checker output');
}

export function parseCheckResult(text: string): CheckResult {
  const obj = extractJson(text) as { verdict?: unknown; notes?: unknown };
  const rawNotes = Array.isArray(obj.notes) ? obj.notes : [];
  const notes: CheckNoteDraft[] = [];
  for (const n of rawNotes.slice(0, 3)) {
    if (!n || typeof n !== 'object') continue;
    const r = n as Record<string, unknown>;
    const claim = String(r.claim ?? '').trim();
    const correction = String(r.correction ?? '').trim();
    if (!claim || !correction) continue;
    const sev = String(r.severity ?? '').toLowerCase() as Severity;
    notes.push({ claim: claim.slice(0, 300), correction: correction.slice(0, 1500), severity: SEVERITIES.includes(sev) ? sev : 'minor' });
  }
  const verdict = obj.verdict === 'note' && notes.length > 0 ? 'note' : 'ok';
  return { verdict, notes: verdict === 'note' ? notes : [] };
}

// Splits on non-letters; CJK characters become individual tokens so overlap works for Chinese/Japanese too.
function tokens(s: string): Set<string> {
  const out = new Set<string>();
  const lower = s.toLowerCase();
  for (const w of lower.match(/[a-z0-9]+(?:['._-][a-z0-9]+)*/g) ?? []) if (w.length >= 3 || /\d/.test(w)) out.add(w);
  for (const c of lower.match(/[぀-ヿ㐀-鿿가-힯]/g) ?? []) out.add(c);
  return out;
}

/** Overlap coefficient of the two notes' claim + correction token sets (0..1). */
export function noteSimilarity(a: Pick<Note, 'claim' | 'correction'>, b: Pick<Note, 'claim' | 'correction'>): number {
  const ta = tokens(`${a.claim} ${a.claim} ${a.correction}`);
  const tb = tokens(`${b.claim} ${b.claim} ${b.correction}`);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

export const MERGE_THRESHOLD = 0.5;

/** The existing note this draft duplicates, if any (written by a different checker). */
export function findMatchingNote(existing: Note[], draft: CheckNoteDraft, checkerId: string): Note | undefined {
  let best: Note | undefined;
  let bestScore = MERGE_THRESHOLD;
  for (const n of existing) {
    if (n.profileId === checkerId || n.agreeProfileIds.includes(checkerId)) continue;
    const s = noteSimilarity(n, draft);
    if (s >= bestScore) { best = n; bestScore = s; }
  }
  return best;
}

export const maxSeverity = (a: Severity, b: Severity): Severity =>
  SEVERITIES[Math.max(SEVERITIES.indexOf(a), SEVERITIES.indexOf(b))];
