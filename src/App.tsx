import { useCallback, useEffect, useState } from 'react';
import { api } from './api/index.ts';
import { Toast } from './components/Notice.tsx';
import type { MeView, StageNo } from './core/types.ts';
import { Ctx, errorText, useHashRoute, type AppCtx } from './hooks.ts';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { JuryScreen } from './screens/JuryScreen.tsx';
import { LeaderboardScreen } from './screens/LeaderboardScreen.tsx';
import { LoginScreen } from './screens/LoginScreen.tsx';
import { OrganizerScreen } from './screens/OrganizerScreen.tsx';
import { ProfileScreen } from './screens/ProfileScreen.tsx';
import { StageScreen } from './screens/StageScreen.tsx';
import { IdeaScreen } from './screens/IdeaScreen.tsx';

type State = { kind: 'loading' } | { kind: 'login' } | { kind: 'ready'; me: MeView };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [toast, setToast] = useState<{ text: string; kind: 'error' | 'ok' } | null>(null);
  const [route, go] = useHashRoute();

  const refresh = useCallback(async () => {
    const me = await api.me();
    setState({ kind: 'ready', me });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (await api.hasSession()) await refresh();
        else setState({ kind: 'login' });
      } catch {
        await api.logout();
        setState({ kind: 'login' });
      }
    })();
  }, [refresh]);

  const error = useCallback((e: unknown) => setToast({ text: errorText(e), kind: 'error' }), []);
  const info = useCallback((text: string) => setToast({ text, kind: 'ok' }), []);
  const closeToast = useCallback(() => setToast(null), []);

  const logout = useCallback(async () => {
    await api.logout();
    go('/');
    setState({ kind: 'login' });
  }, [go]);

  let body: React.ReactNode = null;
  if (state.kind === 'loading') {
    body = <div className="container center muted" style={{ paddingTop: 80 }}>Загрузка…</div>;
  } else if (state.kind === 'login') {
    body = (
      <LoginScreen
        onLogin={async (code) => {
          await api.login(code);
          go('/');
          await refresh();
        }}
      />
    );
  } else {
    const ctx: AppCtx = { me: state.me, refresh, error, info, logout, go };
    body = <Ctx.Provider value={ctx}>{screenFor(state.me, route)}</Ctx.Provider>;
  }

  return (
    <div className="app">
      {body}
      {toast && <Toast text={toast.text} kind={toast.kind} onClose={closeToast} />}
    </div>
  );
}

function screenFor(me: MeView, route: string) {
  if (me.role === 'organizer') return <OrganizerScreen />;
  if (me.role === 'jury') return <JuryScreen />;
  if (!me.nick || route === '/profile') return <ProfileScreen />;
  const m = route.match(/^\/stage\/([1-5])$/);
  if (m) {
    const stage = Number(m[1]) as StageNo;
    return stage === 5 ? <IdeaScreen key="idea" /> : <StageScreen key={stage} stage={stage} />;
  }
  if (route === '/rating') return <LeaderboardScreen />;
  return <HomeScreen />;
}
