import { forwardRef } from 'react';
import { useT } from '../i18n';
import { markClaims } from '../lib/claims';
import { clipMarkdown, SHARE_URL } from '../lib/share';
import type { Check, Note, Post, Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { Markdown } from './Markdown';

export interface ShareCardData {
  question?: Post;
  answer: Post;
  author?: Profile;
  notes: Note[];
  checks: Check[];
  profiles: Map<string, Profile>;
  userName: string;
}

const SEV = {
  minor: { bg: '#fef3c7', fg: '#92400e' },
  major: { bg: '#ffedd5', fg: '#9a3412' },
  critical: { bg: '#fee2e2', fg: '#b91c1c' },
};

/** The shareable image, laid out at 1200px wide. Rendered to PNG by ShareDialog. */
export const ShareCard = forwardRef<HTMLDivElement, ShareCardData>(function ShareCard(
  { question, answer, author, notes, checks, profiles, userName }, ref,
) {
  const t = useT();
  const shown = notes.filter((n) => n.status !== 'dismissed').slice(0, 2);
  const passed = checks.filter((c) => c.verdict === 'ok').map((c) => profiles.get(c.profileId)).filter(Boolean) as Profile[];
  const host = SHARE_URL.replace(/^https:\/\//, '');

  return (
    <div ref={ref} className="share-card" style={{
      width: 1200, padding: 56, fontFamily: 'var(--font-sans)', position: 'relative', overflow: 'hidden',
      background: 'radial-gradient(900px 500px at 0% 0%, #fde68a 0%, transparent 60%), radial-gradient(800px 600px at 100% 10%, #fbcfe8 0%, transparent 55%), radial-gradient(900px 700px at 60% 110%, #c7d2fe 0%, transparent 60%), #fff7ed',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="44" height="44" viewBox="0 0 64 64" aria-hidden><rect width="64" height="64" rx="14" fill="#0f172a" /><path d="M18 16h14a16 16 0 0 1 0 32H18z" fill="none" stroke="#fff" strokeWidth="6" /><circle cx="46" cy="18" r="7" fill="#f59e0b" /></svg>
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5, color: '#0f172a' }}>Dissentry</span>
        </div>
        <Stamp kind={shown.length ? 'dissent' : passed.length ? 'checked' : null} label={shown.length ? t('card.stampDissent') : t('card.stampChecked')} />
      </div>

      <div style={{ background: '#fff', borderRadius: 36, boxShadow: '0 1px 0 rgba(15,23,42,.04), 0 30px 80px -30px rgba(15,23,42,.35)', padding: 48 }}>
        {question && (
          <div style={{ display: 'flex', gap: 20, marginBottom: 32, paddingBottom: 32, borderBottom: '1px solid #f1f5f9' }}>
            <Avatar user={userName} size={56} />
            <p style={{ fontSize: 30, lineHeight: 1.45, color: '#0f172a', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {clipMarkdown(question.text, 400)}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 20 }}>
          <Avatar profile={author} size={64} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>{author?.name ?? '—'}</span>
              <span style={{ fontSize: 24, color: '#64748b' }}>@{author?.handle}</span>
              {author && <span style={{ fontSize: 18, color: '#64748b', background: '#f1f5f9', borderRadius: 8, padding: '3px 10px' }}>{author.modelId}</span>}
            </div>
            <div className="share-md"><Markdown text={markClaims(clipMarkdown(answer.text), shown)} /></div>
          </div>
        </div>

        {shown.map((n) => {
          const writers = [profiles.get(n.profileId), ...n.agreeProfileIds.map((id) => profiles.get(id))].filter(Boolean) as Profile[];
          const sev = SEV[n.severity];
          return (
            <div key={n.id} style={{ marginTop: 28, borderRadius: 24, border: '2px solid #fcd34d', background: 'linear-gradient(180deg,#fffbeb,#fffdf5)', padding: '26px 30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex' }}>{writers.slice(0, 4).map((p, i) => <span key={p.id} style={{ marginLeft: i ? -10 : 0, borderRadius: 999, boxShadow: '0 0 0 3px #fffbeb' }}><Avatar profile={p} size={36} /></span>)}</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: '#78350f' }}>📝 {t('note.title')}</span>
                <span style={{ fontSize: 22, color: '#57534e' }}>
                  {writers.map((p) => `@${p.handle}`).join(' · ')}{writers.length > 1 ? ` · ${t('card.agree')}` : ''}
                </span>
                <span style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, background: sev.bg, color: sev.fg, borderRadius: 999, padding: '4px 12px' }}>{t(`sev.${n.severity}`)}</span>
              </div>
              <p style={{ margin: '16px 0 0', paddingLeft: 16, borderLeft: '4px solid #fcd34d', fontSize: 24, fontStyle: 'italic', color: '#57534e', lineHeight: 1.45 }}>{n.claim}</p>
              <div className="share-md share-md-note" style={{ marginTop: 12 }}><Markdown text={clipMarkdown(n.correction, 420)} /></div>
            </div>
          );
        })}

        {shown.length === 0 && passed.length > 0 && (
          <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 14, borderRadius: 20, background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '18px 24px' }}>
            <span style={{ fontSize: 26, color: '#047857', fontWeight: 800 }}>✓</span>
            <span style={{ display: 'flex' }}>{passed.slice(0, 5).map((p, i) => <span key={p.id} style={{ marginLeft: i ? -10 : 0, borderRadius: 999, boxShadow: '0 0 0 3px #ecfdf5' }}><Avatar profile={p} size={34} /></span>)}</span>
            <span style={{ fontSize: 24, color: '#065f46' }}>{t('card.noDissent', { handles: passed.map((p) => `@${p.handle}`).join(' ') })}</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 30 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: -0.3 }}>{t('card.tagline')}</span>
        <span style={{ fontSize: 22, fontWeight: 600, color: '#0f172a', background: 'rgba(255,255,255,.7)', borderRadius: 999, padding: '8px 18px' }}>{host}</span>
      </div>
    </div>
  );
});

function Stamp({ kind, label }: { kind: 'dissent' | 'checked' | null; label: string }) {
  if (!kind) return null;
  const c = kind === 'dissent' ? { fg: '#b45309', ring: '#f59e0b', bg: '#fffbeb' } : { fg: '#047857', ring: '#10b981', bg: '#ecfdf5' };
  return (
    <span style={{
      transform: 'rotate(-4deg)', display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 22px',
      borderRadius: 14, border: `4px solid ${c.ring}`, background: c.bg, color: c.fg,
      fontSize: 26, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', boxShadow: '0 10px 30px -12px rgba(15,23,42,.3)',
    }}>
      {kind === 'dissent' ? '📝' : '✓'} {label}
    </span>
  );
}
