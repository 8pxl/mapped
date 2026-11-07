import type { ReactNode } from 'react';
import { create } from 'zustand';
import { isMuted, setMuted, sfx } from './audio';
import { countriesFor, type Country } from './data';
import { Game, saveBest, type Mode, type Outcome } from './game';
import type { MapView, Paint, PickEvent } from './map';
import { readPref, writePref } from './prefs';
import { CONTINENTS, isContinent, parseRegionKey, selectionDef, type ContinentId, type RegionDef } from './regions';

export const PAINT_FOR: Record<Outcome, Paint> = { 0: 'missed', 1: 'c1', 2: 'c2', 3: 'c3' };

export interface Toast {
  id: number;
  content: ReactNode;
  tone: 'good' | 'bad' | 'meh';
}

/** One round of play. `game` is mutated in place; `tick` in the store re-renders after each change. */
export interface Session {
  game: Game;
  def: RegionDef;
  /** Counts toward best scores: a full region with hints off. */
  ranked: boolean;
  /** A whole region, not a retry of the ones to review. */
  full: boolean;
  /** A missed country that keeps flashing until the player clicks it. */
  pending: Country | null;
  finished: boolean;
  record: boolean;
  resultsOpen: boolean;
}

interface State {
  mode: Mode;
  hints: boolean;
  /** Continents picked on the menu. */
  selection: ContinentId[];
  muted: boolean;
  screen: 'menu' | 'play';
  session: Session | null;
  tick: number;
  toast: Toast | null;
  /** Bumped to replay the prompt card's shake. */
  shake: number;

  setMode: (mode: Mode) => void;
  setHints: (on: boolean) => void;
  setSelection: (ids: ContinentId[]) => void;
  toggleMuted: () => void;
  start: (def: RegionDef, pool: Country[], full: boolean) => void;
  startSelected: () => void;
  goMenu: () => void;
  applyRoute: () => void;
  pick: (e: PickEvent) => void;
  skip: () => void;
  showToast: (content: ReactNode, tone?: Toast['tone']) => void;
  setResultsOpen: (open: boolean) => void;
}

/** The live map, registered by the play screen while it is mounted. */
let map: MapView | null = null;
export const registerMap = (m: MapView | null) => {
  map = m;
};
export const getMap = () => map;

let toastTimer = 0;
let toastId = 0;

export const routeUrl = (region: RegionDef, mode: Mode) => `/${region.id}${mode === 'flag' ? '?mode=flag' : ''}`;

const ALL = CONTINENTS.map((c) => c.id as ContinentId);

/** The saved selection, carrying over the single region the earlier menu remembered. */
function savedSelection(): ContinentId[] {
  const saved = readPref('selection');
  if (saved) return saved.split(',').filter(isContinent);
  const old = readPref('region');
  if (old === 'world') return ALL;
  return isContinent(old) ? [old] : [];
}

export const useStore = create<State>()((set, get) => {
  const bump = () => set((s) => ({ tick: s.tick + 1 }));
  const patchSession = (patch: Partial<Session>) => set((s) => (s.session ? { session: { ...s.session, ...patch } } : {}));

  const toMenu = () => {
    clearTimeout(toastTimer);
    set({ screen: 'menu', session: null, toast: null });
  };

  const finish = () => {
    const s = get().session!;
    const g = s.game;
    sfx.finish();
    const record = s.ranked && saveBest(g.mode, g.region, { score: g.finalScore, time: g.elapsed });
    patchSession({ finished: true, record });
    setTimeout(() => {
      if (get().session?.game === g) patchSession({ resultsOpen: true });
    }, 650);
  };

  const advance = () => {
    bump();
    if (get().session!.game.done) finish();
  };

  return {
    mode: (readPref('mode') as Mode) || 'name',
    hints: readPref('hints') === '1',
    selection: savedSelection(),
    muted: isMuted(),
    screen: 'menu',
    session: null,
    tick: 0,
    toast: null,
    shake: 0,

    setMode: (mode) => {
      writePref('mode', mode);
      set({ mode });
    },
    setHints: (hints) => {
      writePref('hints', hints ? '1' : '0');
      set({ hints });
    },
    setSelection: (selection) => {
      writePref('selection', selection.join(','));
      set({ selection });
    },
    toggleMuted: () => {
      setMuted(!isMuted());
      set({ muted: isMuted() });
    },

    start: (def, pool, full) => {
      const { mode, hints } = get();
      if (full) get().setSelection(def.members);
      clearTimeout(toastTimer);
      set({
        screen: 'play',
        toast: null,
        session: {
          game: new Game(mode, def.id, pool),
          def,
          ranked: full && !hints,
          full,
          pending: null,
          finished: false,
          record: false,
          resultsOpen: false,
        },
      });
    },

    startSelected: () => {
      const { selection, mode, start } = get();
      const def = selectionDef(selection);
      if (!def) return;
      history.pushState({ fromMenu: true }, '', routeUrl(def, mode));
      start(def, countriesFor(def), true);
    },

    /** Leaves a round for the menu: steps back through history when the menu is where we came from. */
    goMenu: () => {
      if (history.state?.fromMenu) history.back();
      else {
        history.replaceState(null, '', '/');
        toMenu();
      }
    },

    /** "/" is the menu; "/<region>" plays it ("/europe+africa" for a mix), with "?mode=flag" for Flag only. */
    applyRoute: () => {
      const key = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ''));
      const def = key ? parseRegionKey(key) : null;
      if (!def) {
        if (key) history.replaceState(null, '', '/');
        toMenu();
        return;
      }
      const mode: Mode = new URLSearchParams(location.search).get('mode') === 'flag' ? 'flag' : 'name';
      if (mode !== get().mode) get().setMode(mode);
      get().start(def, countriesFor(def), true);
    },

    pick: ({ shape, active, at }) => {
      const s = get().session;
      if (!s || !map) return;
      const { game } = s;
      const toast = get().showToast;
      const shake = () => set((st) => ({ shake: st.shake + 1 }));

      if (s.pending) {
        if (shape.code !== s.pending.code) {
          toast(
            <>
              That's {shape.name || 'the sea'}. <small>Click the flashing country</small>
            </>,
            'bad',
          );
          shake();
          return;
        }
        map.clearReveal();
        map.stamp(at, s.pending.code, 'missed');
        sfx.click();
        toast(
          <>
            {s.pending.name} <small>noted for review</small>
          </>,
        );
        patchSession({ pending: null });
        advance();
        return;
      }
      if (game.done) return;
      if (!active) {
        if (shape.name)
          toast(
            <>
              {shape.name} <small>isn't in this quiz</small>
            </>,
          );
        return;
      }
      const code = shape.code!;
      if (game.results.has(code)) {
        toast(
          <>
            {shape.name} <small>already found</small>
          </>,
        );
        return;
      }
      const target = game.current!;
      const r = game.answer(code);
      if (r.kind === 'correct') {
        const paint = PAINT_FOR[r.attempt as Outcome];
        map.paint(code, paint);
        map.stamp(at, code, paint);
        if (r.attempt === 1) sfx.correct(r.streak);
        else sfx.late();
        toast(
          <>
            {target.name}
            {r.attempt === 1 && r.streak >= 3 && <small> streak ×{r.streak}</small>}
          </>,
          'good',
        );
        advance();
      } else if (r.kind === 'wrong') {
        map.flash(code);
        map.miss(at);
        sfx.wrong();
        navigator.vibrate?.(35);
        shake();
        // Point toward the answer; in Flag-only mode say where it is without naming it.
        const hint = map.pointToward(at, target.code);
        const where = hint ? `${hint.km ? `${hint.km.toLocaleString()} km ` : ''}${hint.dir}` : '';
        const subject = game.mode === 'flag' ? "It's" : `${target.name} is`;
        toast(
          <>
            That's {shape.name}.{' '}
            <small>{where ? `${subject} ${where}` : `${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left`}</small>
          </>,
          'bad',
        );
        bump();
      } else {
        map.flash(code);
        map.miss(at);
        map.paint(target.code, 'missed');
        map.reveal(target.code);
        sfx.reveal();
        shake();
        toast(
          <>
            That's {shape.name}. <b>{target.name}</b> <small>is flashing, click it</small>
          </>,
          'bad',
        );
        patchSession({ pending: target });
        bump();
      }
    },

    skip: () => {
      const s = get().session;
      if (!s || s.pending || s.game.pool.length - s.game.answered < 2) return;
      s.game.skip();
      sfx.click();
      bump();
    },

    showToast: (content, tone = 'meh') => {
      clearTimeout(toastTimer);
      set({ toast: { id: ++toastId, content, tone } });
      toastTimer = window.setTimeout(() => set({ toast: null }), 1600);
    },

    setResultsOpen: (resultsOpen) => patchSession({ resultsOpen }),
  };
});
