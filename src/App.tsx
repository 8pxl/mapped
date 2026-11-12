import { lazy, Suspense, useEffect } from 'react';
import { Menu } from './components/Menu';
import { useStore } from './store';

// The play screen carries the detailed world atlas, about half the download. Load it apart so the menu shows
// sooner on a slow connection, and start fetching it as soon as the first screen is up.
const loadPlay = () => import('./components/Play');
const Play = lazy(() => loadPlay().then((m) => ({ default: m.Play })));

/** Shown while the play screen's code downloads. Matches the splash in index.html. */
function Loading() {
  return (
    <div className="boot" role="status">
      <span className="boot-lines" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>Loading the map…</span>
    </div>
  );
}

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

  // A sideways two-finger swipe would navigate back. Nothing here scrolls sideways, so swallow it everywhere;
  // the map listens on its own element first and still pans. overscroll-behavior covers Chrome, this covers Safari.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    void loadPlay();
  }, []);

  return screen === 'play' ? (
    <Suspense fallback={<Loading />}>
      <Play />
    </Suspense>
  ) : (
    <Menu />
  );
}
