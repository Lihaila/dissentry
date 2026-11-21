import { Route, Switch } from 'wouter';
import { useT } from './i18n';
import { Layout } from './components/Layout';
import { HomePage } from './pages/Home';
import { ThreadPage } from './pages/Thread';
import { ModelsPage } from './pages/Models';
import { TrustPage } from './pages/Trust';
import { SettingsPage } from './pages/Settings';

export function App() {
  const t = useT();
  return (
    <Layout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/post/:id">{(p) => <ThreadPage id={p.id} />}</Route>
        <Route path="/models" component={ModelsPage} />
        <Route path="/trust" component={TrustPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route><div className="p-8 text-slate-500">{t('common.notFound')}</div></Route>
      </Switch>
    </Layout>
  );
}
