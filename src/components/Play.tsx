import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { Country } from '../data';
import { PENALTY_MS } from '../daily';
import { formatTime, MAX_ATTEMPTS } from '../game';
import { MapView } from '../map';
import { boardFor, registerMap, struckFor, useStore, type Session, type Toast } from '../store';
import { Results } from './Results';
import { Badge, modeTitle } from './shared';

export function Play() {
  const mode = useStore((s) => s.session!.game.mode);
  return mode === 'pick' ? <FlagPlay /> : <MapPlay />;
}

/** Pick the flag has no map: a board of every flag in the region, and a card naming the one to pick. */
function FlagPlay() {
  const session = useStore((s) => s.session)!;
  useStore((s) => s.tick);
  const noMap = useRef<MapView | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  useKeys(noMap);
  return (
    <main id="play" className="screen" data-mode="pick" style={{ '--line': session.def.color } as React.CSSProperties}>
      <Hud session={session} />
      <div className="board-host">
        <FlagBoard session={session} />
        <Ticket ref={ticketRef} session={session} />
        <ToastView />
        {session.finished && !session.resultsOpen && (
          <button id="show-results" className="btn" onClick={() => useStore.getState().setResultsOpen(true)}>
            Show results
          </button>
        )}
      </div>
      <Results />
    </main>
  );
}

const OUTCOME_CLASS = { 1: 'c1', 2: 'c2', 3: 'c3', 0: 'missed' } as const;

function FlagBoard({ session }: { session: Session }) {
  const hints = useStore((s) => s.hints);
  const { game, pending, finished } = session;
  const { order } = boardFor(session);
  const target = pending ?? game.current;
  const struck = target && !finished ? struckFor(session, target) : null;
  return (
    <div className="flag-board">
      {order.map((c) => {
        const outcome = game.results.get(c.code);
        const isAnswer = pending?.code === c.code;
        const done = outcome !== undefined && !isAnswer;
        const out = !!struck?.has(c.code);
        // Names show once they're no help: found, a wrong pick (so the miss teaches), hints on, or the round over.
        const named = done || out || hints || finished || isAnswer;
        return (
          <button
            key={c.code}
            className={`flag-cell${done ? ` done ${OUTCOME_CLASS[outcome]}` : ''}${out ? ' struck' : ''}${isAnswer ? ' answer' : ''}`}
            // After three misses the right flag may be scrolled away: bring it into view.
            ref={isAnswer ? (el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) : undefined}
            disabled={done || out || finished}
            onClick={() => useStore.getState().pickFlag(c.code)}
            aria-label={named ? c.name : 'Flag'}
          >
            <img className="flag" src={c.flag} alt="" draggable={false} loading="lazy" />
            <span className="fc-name">{named ? c.name : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function MapPlay() {
  const session = useStore((s) => s.session)!;
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const playRef = useRef<HTMLElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const { game, def, field } = session;

  // The map is imperative D3: create it once per mount and route its events into the store.
  useLayoutEffect(() => {
    const view = new MapView(mapRef.current!);
    viewRef.current = view;
    registerMap(view);
    // Keep the map clear of the prompt card: beside it on wide screens, above it on phones.
    view.insets = () => {
      const host = hostRef.current!.getBoundingClientRect();
      const card = ticketRef.current?.getBoundingClientRect();
      if (!card?.width) return { top: 0, right: 0, bottom: 0, left: 0 };
      return host.width > 760
        ? { top: 0, right: 0, bottom: 0, left: card.right - host.left }
        : { top: 0, right: 0, bottom: host.bottom - card.top, left: 0 };
    };
    view.onPick = (e) => useStore.getState().pick(e);
    // Hover runs on every pointer move, so it writes the tooltip directly instead of re-rendering.
    view.onHover = (shape, active, ev) => {
      const { session: s, hints } = useStore.getState();
      const tip = tooltipRef.current!;
      const playEl = playRef.current!;
      if (!s || !shape?.name) {
        tip.hidden = true;
        playEl.classList.remove('pointing');
        return;
      }
      const found = active && s.game.results.has(shape.code!);
      // The daily ignores hints: naming countries on hover would give it away.
      const show = !active || found || (hints && !s.daily) || s.finished;
      playEl.classList.toggle('pointing', (active && !found) || shape.code === s.pending?.code);
      tip.hidden = !show;
      if (!show) return;
      tip.textContent = shape.name;
      tip.className = `tooltip${active ? '' : ' off'}`;
      const host = hostRef.current!.getBoundingClientRect();
      tip.style.transform = `translate(${ev.clientX - host.left + 14}px, ${ev.clientY - host.top + 16}px)`;
    };
    return () => {
      registerMap(null);
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // A new round (new Game object) redraws the map for its region. All of the field is live, not just the pool.
  useLayoutEffect(() => {
    viewRef.current!.show(def, new Set(field.map((c) => c.code)), field.filter((c) => c.code === 'tv'));
  }, [game, def, field]);

  useKeys(viewRef);

  // iOS Safari zooms the whole page on a pinch outside the map (HUD, prompt card); the map handles its own pinch.
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop);
    return () => document.removeEventListener('gesturestart', stop);
  }, []);

  return (
    <main id="play" className="screen" ref={playRef} data-mode={game.mode} style={{ '--line': def.color } as React.CSSProperties}>
      <Hud session={session} />
      <div ref={hostRef} className="map-host">
        <div ref={mapRef} className="map-layer" />
        <Ticket ref={ticketRef} session={session} />
        <ToastView />
        <div ref={tooltipRef} className="tooltip" hidden />
        <div className="zoom">
          <button id="zoom-in" className="pointer-only" onClick={() => viewRef.current?.zoomBy(1.8)} aria-label="Zoom in">
            +
          </button>
          <button id="zoom-out" className="pointer-only" onClick={() => viewRef.current?.zoomBy(1 / 1.8)} aria-label="Zoom out">
            &minus;
          </button>
          <button id="zoom-reset" onClick={() => viewRef.current?.resetZoom()} aria-label="Reset view">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6" />
            </svg>
          </button>
        </div>
        {session.finished && !session.resultsOpen && (
          <button id="show-results" className="btn" onClick={() => useStore.getState().setResultsOpen(true)}>
            Show results
          </button>
        )}
        <aside className="legend" aria-label="Map key">
          <h3>Key</h3>
          <ul>
            <li>
              <i className="k-first" />
              First try
            </li>
            <li>
              <i className="k-retry" />
              Took retries
            </li>
            <li>
              <i className="k-missed" />
              Missed
            </li>
          </ul>
        </aside>
      </div>
      <Results />
    </main>
  );
}

function Hud({ session }: { session: Session }) {
  const { game, def, ranked, full, finished, challenge } = session;
  const muted = useStore((s) => s.muted);
  useStore((s) => s.tick);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // The clock ticks on its own; everything else re-renders with the store.
  useEffect(() => {
    if (finished) return;
    const id = setInterval(redraw, 250);
    return () => clearInterval(id);
  }, [finished]);
  const total = game.pool.length;
  return (
    <header className="hud">
      <div className="hud-left">
        <button className="btn-ghost" id="back" onClick={() => useStore.getState().goMenu()} aria-label="Back to menu">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <Badge region={def} />
        <div className="hud-title">
          <span>{def.name}</span>
          <small>
            <span>{session.daily ? 'Daily' : modeTitle(game.mode)}</span>
            {!ranked && !session.daily && (
              <span className="practice">
                {full ? 'Hints on · unranked' : def.id === 'custom' || def.id === 'review' ? 'Unranked' : 'Retry · unranked'}
              </span>
            )}
          </small>
        </div>
      </div>
      <div className="hud-mid">
        <span className="track" style={{ '--fill': `${(game.answered / total) * 100}%` } as React.CSSProperties}>
          <i />
        </span>
        <span className="figure">
          {game.answered}
          <small>/{total}</small>
        </span>
        {challenge && (
          <span className="stat challenge" title="The score you were challenged to beat">
            <small>To beat</small>
            <b className="figure">
              {challenge.score}% <small>{formatTime(challenge.seconds * 1000)}</small>
            </b>
          </span>
        )}
      </div>
      <div className="hud-right">
        {game.streak >= 3 && <span className="streak">×{game.streak} streak</span>}
        {session.daily ? (
          <span className="stat">
            <small>Misses</small>
            <b className="figure">{game.misses}</b>
          </span>
        ) : (
          <span className="stat">
            <small>Score</small>
            <b className="figure">{Math.round(game.score * 100)}%</b>
          </span>
        )}
        <span className="stat">
          <small>Time</small>
          <b className="figure">{formatTime(game.elapsed)}</b>
        </span>
        <button className={`icon-btn${muted ? ' off' : ''}`} onClick={() => useStore.getState().toggleMuted()} aria-label={muted ? 'Unmute' : 'Mute'}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" />
            <path className="wave" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
            <path className="slash" d="M16 9l6 6M22 9l-6 6" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function Ticket({ session, ref }: { session: Session; ref: React.Ref<HTMLDivElement> }) {
  useStore((s) => s.tick);
  const shake = useStore((s) => s.shake);
  const el = useRef<HTMLDivElement | null>(null);
  const { game, pending, finished } = session;
  const current = pending ?? game.current;
  // The daily's card stays put while its list ticks off; the others deal a new card per question.
  const promptKey = finished ? 'done' : session.daily ? 'daily' : `${game.answered}:${current?.code}:${pending ? 'reveal' : ''}`;

  // Replay a CSS animation by removing its class and forcing a reflow before adding it back.
  const replay = (cls: string) => {
    const t = el.current;
    if (!t) return;
    t.classList.remove(cls);
    void t.offsetWidth;
    t.classList.add(cls);
  };
  useEffect(() => {
    if (!pending && !finished) replay('deal');
  }, [promptKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (shake) replay('shake');
  }, [shake]);

  const setRef = (node: HTMLDivElement | null) => {
    el.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = node;
  };

  if (finished)
    return (
      <div ref={setRef} className="ticket">
        <div className="ticket-label">
          <span>Done</span>
          <span className="ticket-count">
            {game.pool.length} / {game.pool.length}
          </span>
        </div>
        <div className="ticket-done">Round complete</div>
      </div>
    );

  if (session.daily && !finished) return <DailyTicket ref={setRef} session={session} />;
  if (!current) return <div ref={setRef} className="ticket" />;
  if (game.mode === 'pick') return <PickTicket ref={setRef} session={session} target={current} />;
  const flagOnly = game.mode === 'flag';

  if (pending)
    return (
      <div ref={setRef} className="ticket missed" aria-live="polite">
        <div className="ticket-label">
          <span className="ticket-alert">Missed · click it to continue</span>
        </div>
        <div className="ticket-body">
          <img className="flag" src={pending.flag} alt={`Flag of ${pending.name}`} draggable={false} />
          <div className="ticket-name">{pending.name}</div>
        </div>
        <div className="ticket-foot">
          <span className="pips" aria-label="Attempts">
            {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
              <i key={i} className="used" />
            ))}
          </span>
          <span className="ticket-hint">It's flashing</span>
        </div>
      </div>
    );

  return (
    <div ref={setRef} className="ticket" aria-live="polite">
      <div className="ticket-label">
        <span>{flagOnly ? 'Whose flag?' : 'Find'}</span>
        <span className="ticket-count">
          {game.answered + 1} / {game.pool.length}
        </span>
      </div>
      <div className="ticket-body">
        <img className="flag" src={current.flag} alt={flagOnly ? 'Flag to find' : `Flag of ${current.name}`} draggable={false} />
        {flagOnly ? <div className="ticket-name unknown">?</div> : <div className="ticket-name">{current.name}</div>}
      </div>
      <div className="ticket-foot">
        <span className="pips" aria-label="Attempts">
          {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
            <i key={i} className={i < game.attemptsUsed ? 'used' : ''} />
          ))}
        </span>
        <button className="btn-ghost" id="skip" disabled={game.pool.length - game.answered < 2} onClick={() => useStore.getState().skip()}>
          Skip <kbd>S</kbd>
        </button>
      </div>
    </div>
  );
}

/** The daily's card: the theme, and every country to find, ticked off as they're found in any order. */
function DailyTicket({ session, ref }: { session: Session; ref: React.Ref<HTMLDivElement> }) {
  const { game, daily } = session;
  const list = [...game.pool].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div ref={ref} className="ticket daily-ticket" aria-live="polite">
      <div className="ticket-label">
        <span>Daily #{daily!.n}</span>
        <span className="ticket-count">
          {game.answered} / {game.pool.length}
        </span>
      </div>
      <div className="daily-theme">{daily!.theme.title}</div>
      <ul className="daily-list">
        {list.map((c) => (
          <li key={c.code} className={game.results.has(c.code) ? 'found' : ''}>
            <i aria-hidden="true" />
            {c.name}
          </li>
        ))}
      </ul>
      <p className="daily-rule">Any order · wrong click +{PENALTY_MS / 1000}s</p>
    </div>
  );
}

/** Pick the flag's card: just the name to pick, the tries and Skip. The flags are on the board. */
function PickTicket({ session, target, ref }: { session: Session; target: Country; ref: React.Ref<HTMLDivElement> }) {
  const { game, pending } = session;
  return (
    <div ref={ref} className={`ticket${pending ? ' missed' : ''}`} aria-live="polite">
      <div className="ticket-label">
        {pending ? (
          <span className="ticket-alert">Missed · pick it to continue</span>
        ) : (
          <>
            <span>Pick the flag of</span>
            <span className="ticket-count">
              {game.answered + 1} / {game.pool.length}
            </span>
          </>
        )}
      </div>
      <div className="ticket-name">{target.name}</div>
      <div className="ticket-foot">
        <span className="pips" aria-label="Attempts">
          {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
            <i key={i} className={pending || i < game.attemptsUsed ? 'used' : ''} />
          ))}
        </span>
        {pending ? (
          <span className="ticket-hint">It's flashing</span>
        ) : (
          <button className="btn-ghost" id="skip" disabled={game.pool.length - game.answered < 2} onClick={() => useStore.getState().skip()}>
            Skip <kbd>S</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

/** The status line. It stays mounted so it can fade out still showing its last message. */
function ToastView() {
  const toast = useStore((s) => s.toast);
  const last = useRef<Toast | null>(null);
  if (toast) last.current = toast;
  const shown = last.current;
  return (
    <div className={`toast${toast ? ' show' : ''} tone-${shown?.tone ?? 'meh'}`} role="status">
      {/* One span, so the message wraps as a sentence beside the dot rather than as separate flex items. */}
      <span>{shown?.content}</span>
    </div>
  );
}

function useKeys(viewRef: React.RefObject<MapView | null>) {
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const { session, skip, goMenu } = useStore.getState();
      if (!session || session.resultsOpen || e.metaKey || e.ctrlKey) return;
      const view = viewRef.current;
      if (e.key === ' ') {
        // Space picks whatever is under the cursor; keep it from also pressing a focused button.
        e.preventDefault();
        if (!e.repeat) view?.pickAtPointer();
      }
      if (e.key === 's' || e.key === 'S') skip();
      if (e.key === '+' || e.key === '=') view?.zoomBy(1.8);
      if (e.key === '-') view?.zoomBy(1 / 1.8);
      if (e.key === '0') view?.resetZoom();
      if (e.key === 'Escape') goMenu();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && !useStore.getState().session?.resultsOpen) e.preventDefault();
    };
    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup', onUp);
    return () => {
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup', onUp);
    };
  }, [viewRef]);
}
