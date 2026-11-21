import type { Check, Post, Profile, Usage } from './types';

export const costOf = (u: Usage | undefined, p?: Pick<Profile, 'inPrice' | 'outPrice'>): number | undefined =>
  u && p?.inPrice !== undefined && p?.outPrice !== undefined ? (u.input * p.inPrice + u.output * p.outPrice) / 1e6 : undefined;

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1e6) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
  return `${(n / 1e6).toFixed(2)}M`;
}

export function fmtCost(c: number): string {
  if (c === 0) return '$0';
  if (c < 0.01) return `$${c.toFixed(4)}`;
  if (c < 1) return `$${c.toFixed(3)}`;
  return `$${c.toFixed(2)}`;
}

export interface UsageRow {
  profile: Profile;
  answerTokens: number;
  checkTokens: number;
  cost: number;
  /** True when every counted call had a known price. */
  priced: boolean;
  calls: number;
}

export interface UsageSummary {
  rows: UsageRow[];
  total: { tokens: number; cost: number; answerTokens: number; checkTokens: number; priced: boolean };
}

/** Aggregate usage since `since` (ms). Posts are answers; checks are checker calls. */
export function summarize(profiles: Profile[], posts: Post[], checks: Check[], since = 0): UsageSummary {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const rows = new Map<string, UsageRow>();
  const row = (id: string) => {
    const p = byId.get(id);
    if (!p) return undefined;
    if (!rows.has(id)) rows.set(id, { profile: p, answerTokens: 0, checkTokens: 0, cost: 0, priced: true, calls: 0 });
    return rows.get(id)!;
  };
  const add = (r: UsageRow | undefined, u: Usage | undefined, kind: 'answer' | 'check') => {
    if (!r || !u) return;
    const n = u.input + u.output;
    if (kind === 'answer') r.answerTokens += n; else r.checkTokens += n;
    const c = costOf(u, r.profile);
    if (c === undefined) r.priced = false; else r.cost += c;
    r.calls++;
  };
  for (const p of posts) if (p.kind === 'model' && p.profileId && p.createdAt >= since) add(row(p.profileId), p.usage, 'answer');
  for (const c of checks) if (c.createdAt >= since) add(row(c.profileId), c.usage, 'check');
  const list = [...rows.values()].filter((r) => r.calls > 0).sort((a, b) => b.answerTokens + b.checkTokens - (a.answerTokens + a.checkTokens));
  const total = list.reduce((t, r) => ({
    tokens: t.tokens + r.answerTokens + r.checkTokens, cost: t.cost + r.cost,
    answerTokens: t.answerTokens + r.answerTokens, checkTokens: t.checkTokens + r.checkTokens, priced: t.priced && r.priced,
  }), { tokens: 0, cost: 0, answerTokens: 0, checkTokens: 0, priced: true });
  return { rows: list, total };
}
