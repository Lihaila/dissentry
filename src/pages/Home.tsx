import { useLiveQuery } from 'dexie-react-hooks';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Composer } from '../components/Composer';
import { PageHeader } from '../components/Layout';
import { OpenRouterButton } from '../components/OpenRouterButton';
import { buildByParent, ReplyBranch } from '../components/ReplyTree';
import { useT } from '../i18n';
import { db } from '../lib/db';
import { useProfileMap, useTick } from '../lib/hooks';
import { presetLogo } from '../lib/logos';
import { useOpenRouterAccount } from '../lib/openrouter';
import type { Post } from '../lib/types';

const PAGE = 30;

export function HomePage() {
  const t = useT();
  useTick();
  const profiles = useProfileMap();
  const [limit, setLimit] = useState(PAGE);
  const [pendingReplyId, setPendingReplyId] = useState<string | null>(null);
  const roots = useLiveQuery(async () => {
    const posts = await db.posts.orderBy('createdAt').reverse().filter((p) => !p.parentId).limit(limit).toArray();
    if (!posts.length) return [];
    const threadPosts = await db.posts.where('rootId').anyOf(posts.map((p) => p.id)).sortBy('createdAt');
    const byParent = buildByParent(threadPosts);
    return posts.map((post) => ({ post, byParent }));
  }, [limit]);

  useEffect(() => {
    if (!pendingReplyId) return;
    const el = document.getElementById(`post-${pendingReplyId}`);
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setPendingReplyId(null);
  }, [pendingReplyId, roots]);

  const handleOf = (p: Post) => (p.kind === 'user' ? t('post.you') : profiles.get(p.profileId ?? '')?.handle);

  return (
    <>
      <PageHeader title={t('home.title')} sub={t('home.sub')} />
      {profiles.size === 0 ? <Welcome /> : (
        <div className="border-b border-slate-200/80"><Composer /></div>
      )}
      {roots?.length === 0 && profiles.size > 0 && <Tips />}
      {roots && roots.length > 0 && (
        <div className="space-y-3 bg-slate-100/80 px-2.5 py-3 md:space-y-0 md:bg-transparent md:p-0">
          {roots.map(({ post, byParent }) => (
            <section
              key={post.id}
              className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs md:rounded-none md:border-x-0 md:border-t-0 md:border-b md:border-slate-200/80 md:shadow-none"
            >
              <ReplyBranch
                post={post}
                parent={null}
                byParent={byParent}
                profiles={profiles}
                handleOf={handleOf}
                onReplied={(replyId) => setPendingReplyId(replyId)}
              />
            </section>
          ))}
        </div>
      )}
      {roots && roots.length >= limit && (
        <button onClick={() => setLimit((l) => l + PAGE)} className="w-full py-4 text-[14px] font-medium text-sky-600 hover:bg-slate-50">{t('home.more')}</button>
      )}
    </>
  );
}

const HERO_LOGOS = ['openai', 'anthropic', 'google', 'deepseek', 'qwen', 'xai'];

function Welcome() {
  const t = useT();
  const orAccount = useOpenRouterAccount();
  return (
    <div className="px-6 pb-12 pt-10 text-center sm:px-10">
      <div className="mx-auto mb-7 flex w-fit -space-x-2.5">
        {HERO_LOGOS.map((id, i) => (
          <span key={id} className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm ring-4 ring-white"
            style={{ transform: `translateY(${i % 2 ? 6 : 0}px)` }}>
            <img src={presetLogo(id)} alt="" className="h-6 w-6" />
          </span>
        ))}
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400 text-xl shadow-sm ring-4 ring-white">📝</span>
      </div>
      <h2 className="text-balance text-[28px] font-extrabold leading-tight tracking-tight text-ink sm:text-[32px]">{t('welcome.title')}</h2>
      <p className="mx-auto mt-3 max-w-md text-balance text-[15.5px] leading-relaxed text-slate-600">{t('welcome.body')}</p>
      <div className="mx-auto mt-8 grid max-w-lg gap-3 text-left sm:grid-cols-3">
        {(['welcome.step1', 'welcome.step2', 'welcome.step3'] as const).map((k, i) => (
          <div key={k} className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5">
            <div className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">{i + 1}</div>
            <p className="text-[13.5px] leading-snug text-slate-700">{t(k)}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-col items-center gap-3">
        {orAccount ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-800 ring-1 ring-emerald-200/80">
              <Check size={14} strokeWidth={2.8} /> {t('or.connected')}
            </span>
            <Link href="/auth/openrouter" className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-white shadow-sm shadow-slate-900/10 transition hover:bg-slate-800 active:scale-[.98]">
              {t('or.chooseModels')}
            </Link>
          </>
        ) : (
          <>
            <OpenRouterButton size="lg" />
            <p className="max-w-xs text-[12.5px] text-slate-500">{t('or.pitch')}</p>
          </>
        )}
        <Link href="/models" className="text-[14px] font-semibold text-slate-600 underline-offset-4 hover:text-ink hover:underline">{t('welcome.cta')}</Link>
      </div>
      <p className="mx-auto mt-4 max-w-sm text-[12.5px] text-slate-400">{t('welcome.privacy')}</p>
    </div>
  );
}

function Tips() {
  const t = useT();
  return (
    <div className="px-8 py-12 text-center">
      <div className="mb-3 text-3xl">📝</div>
      <h2 className="text-[22px] font-extrabold tracking-tight text-ink">{t('tips.title')}</h2>
      <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-slate-600">{t('tips.body')}</p>
      <p className="mx-auto mt-4 max-w-md rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">{t('tips.saving')}</p>
    </div>
  );
}
