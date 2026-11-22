import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { Route, Switch, useLocation } from 'wouter';
import { db } from './lib/db';
import { getOpenRouterAccount } from './lib/openrouter';
import { LandingPage } from './pages/Landing';
import { useStarted } from './lib/started';
import { useLang, useT } from './i18n';
import { Layout } from './components/Layout';
import { HomePage } from './pages/Home';
import { ThreadPage } from './pages/Thread';
import { ModelsPage } from './pages/Models';
import { TrustPage } from './pages/Trust';
import { UsagePage } from './pages/Usage';
import { SettingsPage } from './pages/Settings';
import { OpenRouterCallbackPage } from './pages/OpenRouterCallback';
import { PrivacyPage, TermsPage } from './pages/Legal';

export function App() {
  const t = useT();
  const lang = useLang();
  const [loc] = useLocation();
  // First-time visitors (nothing set up yet) see the landing page; returning users go straight to the app.
  const started = useStarted();
  const fresh = useLiveQuery(
    async () => (await db.profiles.count()) === 0 && (await db.posts.count()) === 0 && !(await getOpenRouterAccount()),
    [],
  );
  const isPrivacy = loc === '/privacy';
  const isTerms = loc === '/terms';
  const isMcp = loc === '/mcp';
  const isLanding = loc === '/welcome' || isMcp || (loc === '/' && fresh && !started);

  useEffect(() => {
    const suffix = 'Dissentry · Lihai La';
    const title = isPrivacy ? `${t('footer.privacy')} · ${suffix}`
      : isTerms ? `${t('footer.terms')} · ${suffix}`
      : isMcp ? `MCP · ${suffix}`
      : isLanding ? `Dissentry — ${t('land.h1')} | Lihai La`
      : loc.startsWith('/models') ? `${t('models.title')} · ${suffix}`
      : loc.startsWith('/trust') ? `${t('trust.title')} · ${suffix}`
      : loc.startsWith('/usage') ? `${t('usage.title')} · ${suffix}`
      : loc.startsWith('/settings') ? `${t('settings.title')} · ${suffix}`
      : loc.startsWith('/post/') ? `${t('thread.title')} · ${suffix}`
      : `${t('home.title')} · ${suffix}`;
    document.title = title;
  }, [loc, lang, isLanding, isMcp, isPrivacy, isTerms, t]);

  if (isPrivacy) return <PrivacyPage />;
  if (isTerms) return <TermsPage />;
  if (isLanding) return <LandingPage initialSection={isMcp ? 'mcp' : undefined} />;
  if (loc === '/' && fresh === undefined) return null; // avoid flashing the app before we know
  return (
    <Layout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/post/:id">{(p) => <ThreadPage id={p.id} />}</Route>
        <Route path="/models" component={ModelsPage} />
        <Route path="/trust" component={TrustPage} />
        <Route path="/usage" component={UsagePage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/auth/openrouter" component={OpenRouterCallbackPage} />
        <Route><div className="p-8 text-slate-500">{t('common.notFound')}</div></Route>
      </Switch>
    </Layout>
  );
}
