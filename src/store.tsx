import type { ReactNode } from 'react';
import { create } from 'zustand';
import { isMuted, setMuted, sfx } from './audio';
import { countriesFor, countryByCode, type Country } from './data';
import { Game, isComboMilestone, saveBest, type Mode, type Outcome } from './game';
import type { MapView, Paint, PickEvent } from './map';
import { readPref, writePref } from './prefs';
import { dueCodes, loadDeck, recordOutcome } from './review';
import { parseChallenge, type Challenge } from './share';
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
  /**
   * Every country on the map that can be clicked: the whole region, even when only some of it is asked. Clicking
   * one that isn't asked is a wrong answer like any other, so a short round still has to be told apart from its
   * neighbours.
   */
  field: Country[];
  /** A missed country that keeps flashing until the player clicks it. */
  pending: Country | null;
  finished: boolean;
  record: boolean;
  /** A friend's score to beat, from a shared link for this same round. */
  challenge: Challenge | null;
  resultsOpen: boolean;
}

/** How the menu picks what to play: continents on the map, a hand-picked list, or the review deck. */
export type PickerTab = 'map' | 'custom' | 'review';

/** Plays just these countries. The map is the smallest continent mix that holds them all, and all of it is live. */
export function poolDef(codes: string[], kind: 'custom' | 'review'): { def: RegionDef; pool: Country[] } | null {
  const pool = codes.map((c) => countryByCode.get(c)).filter((c): c is Country => !!c);
  const ids = [...new Set(pool.flatMap((c) => c.regions))].filter(isContinent);
  const base = selectionDef(ids);
  if (!base || !pool.length) return null;
  return { def: { ...base, id: kind, name: kind === 'custom' ? 'Custom' : 'Review' }, pool };
}

interface State {
  mode: Mode;
  hints: boolean;
  /** Continents picked on the menu. */
  selection: ContinentId[];
  picker: PickerTab;
  /** Countries hand-picked on the menu's list, by code. */
  custom: string[];
  muted: boolean;
  screen: 'menu' | 'play';
  session: Session | null;
  /** The score to beat from the link that opened the app. It lasts until the player returns to the menu. */
  challenge: Challenge | null;
  tick: number;
  toast: Toast | null;
  /** Bumped to replay the prompt card's shake. */
  shake: number;

  setMode: (mode: Mode) => void;
  setHints: (on: boolean) => void;
  setSelection: (ids: ContinentId[]) => void;
  setPicker: (tab: PickerTab) => void;
  setCustom: (codes: string[]) => void;
  /** Plays a hand-picked list ("custom") or the review deck's due countries ("review"). */
  startPool: (kind: 'custom' | 'review', codes: string[]) => void;
  toggleMuted: () => void;
  start: (def: RegionDef, pool: Country[], full: boolean, field?: Country[]) => void;
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
    set({ screen: 'menu', session: null, toast: null, challenge: null });
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
    picker: (['map', 'custom', 'review'] as const).find((t) => t === readPref('picker')) ?? 'map',
    custom: readPref('custom').split(',').filter((c) => countryByCode.has(c)),
    muted: isMuted(),
    screen: 'menu',
    session: null,
    challenge: null,
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
    setPicker: (picker) => {
      writePref('picker', picker);
      set({ picker });
    },
    setCustom: (custom) => {
      writePref('custom', custom.join(','));
      set({ custom });
    },

    startPool: (kind, codes) => {
      const round = poolDef(codes, kind);
      if (!round) return;
      const { mode } = get();
      const params = new URLSearchParams();
      if (mode === 'flag') params.set('mode', 'flag');
      if (kind === 'custom') params.set('c', round.pool.map((c) => c.code).join(','));
      const query = params.toString().replace(/%2C/g, ',');
      history.pushState({ fromMenu: true }, '', `/${kind}${query ? `?${query}` : ''}`);
      get().start(round.def, round.pool, false);
    },

    toggleMuted: () => {
      setMuted(!isMuted());
      set({ muted: isMuted() });
    },

    start: (def, pool, full, field = countriesFor(def)) => {
      const { mode, hints, challenge } = get();
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
          field,
          pending: null,
          finished: false,
          record: false,
          resultsOpen: false,
          challenge: full && challenge?.region === def.id && challenge.mode === mode ? challenge : null,
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

    /**
     * "/" is the menu; "/<region>" plays it ("/europe+africa" for a mix), with "?mode=flag" for Flag only.
     * "/custom?c=fr,de" plays a hand-picked list and "/review" the countries due for review.
     */
    applyRoute: () => {
      const key = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ''));
      const params = new URLSearchParams(location.search);
      if (key === 'custom' || key === 'review') {
        const mode: Mode = params.get('mode') === 'flag' ? 'flag' : 'name';
        if (mode !== get().mode) get().setMode(mode);
        const deck = loadDeck(mode);
        const codes = key === 'custom' ? (params.get('c') ?? '').split(',') : dueCodes(deck).length ? dueCodes(deck) : Object.keys(deck);
        const round = poolDef(codes, key);
        if (round) {
          set({ challenge: null });
          get().start(round.def, round.pool, false);
          return;
        }
      }
      const def = key ? parseRegionKey(key) : null;
      if (!def) {
        if (key) history.replaceState(null, '', '/');
        toMenu();
        return;
      }
      const mode: Mode = params.get('mode') === 'flag' ? 'flag' : 'name';
      if (mode !== get().mode) get().setMode(mode);
      set({ challenge: parseChallenge(params, def.id, mode) });
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
        // Slips join the review deck; first-try finds move deck cards along (unless hints made them easy).
        recordOutcome(game.mode, code, r.attempt as Outcome, !get().hints);
        const paint = PAINT_FOR[r.attempt as Outcome];
        map.paint(code, paint);
        map.stamp(at, code, paint);
        if (r.attempt === 1) sfx.correct(r.streak);
        else sfx.late();
        if (r.attempt === 1 && isComboMilestone(r.streak)) {
          sfx.combo(r.streak);
          // With reduced motion the HUD's streak count says it instead.
          if (!matchMedia('(prefers-reduced-motion: reduce)').matches) map.combo(at, r.streak);
        }
        // No toast for a find: the stamp says it. Clear a leftover miss message so it doesn't linger.
        clearTimeout(toastTimer);
        set({ toast: null });
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
        recordOutcome(game.mode, target.code, 0);
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
