import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Menu } from './components/Menu';
import { useStore } from './store';

// The play screen carries the detailed world atlas, about half the download. Load it apart so the menu shows
// sooner on a slow connection, and start fetching it as soon as the first screen is up.
/**
 * The play screen is a separate file whose name changes with every deploy. A tab opened before a deploy asks for the
 * old name, which no longer exists (the server answers with the app's HTML), so reload once to pick up the new build.
 * The timestamp keeps a real outage from reloading in a loop.
 */
const RELOADED = 'mapped:reloaded-for-update';
const loadPlay = () =>
  import('./components/Play').catch((err: unknown) => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOADED) ?? 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(RELOADED, String(Date.now()));
        location.reload();
        return new Promise<never>(() => {});
      }
    } catch {
      // No storage: fall through to the error.
    }
    throw err;
  });
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

/** If the play screen can't load at all (offline, or still failing after the reload), say so instead of a blank page. */
class LoadFailed extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="boot" role="alert">
        <span>Couldn’t load the map. Check your connection.</span>
        <button className="btn" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  }
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
    <LoadFailed>
      <Suspense fallback={<Loading />}>
        <Play />
      </Suspense>
    </LoadFailed>
  ) : (
    <Menu />
  );
}
