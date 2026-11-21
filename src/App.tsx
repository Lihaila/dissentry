import { useLiveQuery } from 'dexie-react-hooks';
import { Route, Switch, useLocation } from 'wouter';
import { db } from './lib/db';
import { LandingPage } from './pages/Landing';
import { useStarted } from './lib/started';
import { useT } from './i18n';
import { Layout } from './components/Layout';
import { HomePage } from './pages/Home';
import { ThreadPage } from './pages/Thread';
import { ModelsPage } from './pages/Models';
import { TrustPage } from './pages/Trust';
import { UsagePage } from './pages/Usage';
import { SettingsPage } from './pages/Settings';
import { OpenRouterCallbackPage } from './pages/OpenRouterCallback';

export function App() {
  const t = useT();
  const [loc] = useLocation();
  // First-time visitors (nothing set up yet) see the landing page; returning users go straight to the app.
  const started = useStarted();
  const fresh = useLiveQuery(async () => (await db.profiles.count()) === 0 && (await db.posts.count()) === 0, []);
  if (loc === '/welcome' || (loc === '/' && fresh && !started)) return <LandingPage />;
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
