import { useEffect } from 'react';
import { Menu } from './components/Menu';
import { Play } from './components/Play';
import { useStore } from './store';

export function App() {
  const screen = useStore((s) => s.screen);
  const title = useStore((s) => (s.session ? `${s.session.def.name} · mapped!` : 'mapped!'));

  // Browser back/forward move between the menu and rounds.
  useEffect(() => {
    const { applyRoute } = useStore.getState();
    applyRoute();
    window.addEventListener('popstate', applyRoute);
    return () => window.removeEventListener('popstate', applyRoute);
  }, []);

  useEffect(() => {
    document.title = title;
  }, [title]);

  return screen === 'play' ? <Play /> : <Menu />;
}
