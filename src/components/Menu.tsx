import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sfx } from '../audio';
import { countriesFor } from '../data';
import { formatTime, loadBest, type Mode } from '../game';
import { CONTINENTS, selectionDef, type ContinentId } from '../regions';
import { useStore } from '../store';
import { dueCodes, loadDeck, removeCard } from '../review';
import { CountryList, PickerTabs, ReviewList } from './CountryPicker';
import { RegionPicker, type PickerHandle } from './RegionPicker';
import { Settings } from './Settings';
import { Badge, MODES } from './shared';
import { dailyStreak, loadRun, PENALTY_MS, themeFor, todayNumber, untilNext } from '../daily';

const ALL = CONTINENTS.map((c) => c.id as ContinentId);

export function Menu() {
  const mode = useStore((s) => s.mode);
  const selection = useStore((s) => s.selection);
  const setMode = useStore((s) => s.setMode);
  const setSelection = useStore((s) => s.setSelection);
  const startSelected = useStore((s) => s.startSelected);
  const tab = useStore((s) => s.picker);
  const custom = useStore((s) => s.custom);
  const section = useStore((s) => s.section);
  const { setPicker, setCustom, startPool, setSection } = useStore.getState();
  const [deck, setDeck] = useState(() => loadDeck(mode));
  useEffect(() => setDeck(loadDeck(mode)), [mode]);
  const due = dueCodes(deck);
  const inDeck = Object.keys(deck);
  // Nothing due yet: the review can still be played early, with everything in it.
  const reviewCodes = due.length ? due : inDeck;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const picker = useRef<PickerHandle>(null);

  const def = selectionDef(selection);
  const count = def ? countriesFor(def).length : 0;
  const best = def ? loadBest(mode, def.id) : null;
  const allPicked = selection.length === ALL.length;

  const toggle = (id: ContinentId) => {
    const next = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
    setSelection(next);
    sfx.click();
  };

  const canStart = tab === 'map' ? !!def : tab === 'custom' ? custom.length > 0 : reviewCodes.length > 0;

  /** From a pointer: zoom into the selection, then start. From the keyboard: start at once, no animation. */
  const mapIt = async (fromPointer: boolean) => {
    if (!canStart || leaving) return;
    if (tab !== 'map') {
      startPool(tab, tab === 'custom' ? custom : reviewCodes);
      return;
    }
    if (fromPointer) {
      setLeaving(true);
      await picker.current?.zoomToSelection();
    }
    startSelected();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || section !== 'learn' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button, input, label')) {
        e.preventDefault();
        mapIt(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <main id="menu" className={`screen${leaving ? ' leaving' : ''}`}>
      <div className="menu-wrap">
        <header className="topbar">
          <a className="brand" href="/" aria-label="mapped! home">
            <span className="brand-lines" aria-hidden="true">
              {['#2f6fe8', '#ee352e', '#ff6319', '#8cc63f'].map((c) => (
                <i key={c} style={{ '--c': c } as React.CSSProperties} />
              ))}
            </span>
            mapped!
          </a>
          <button id="open-settings" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="8" cy="17" r="2" />
            </svg>
          </button>
        </header>

        <nav className="section-nav" aria-label="Sections">
          {(['daily', 'learn'] as const).map((id) => (
            <button
              key={id}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => {
                if (section === id) return;
                sfx.click();
                setSection(id);
              }}
            >
              {id === 'daily' ? 'Daily' : 'Learn'}
            </button>
          ))}
        </nav>

        {section === 'daily' ? (
          <DailyPanel />
        ) : (
          <>
            <section className="menu-section game-section" aria-labelledby="game-label">
              <h2 className="eyebrow" id="game-label">
                <span className="step-num">1</span> Game
              </h2>
              <ModeTabs
                mode={mode}
                onChange={(m) => {
                  setMode(m);
                  sfx.click();
                }}
              />
              <p className="mode-desc">{MODES.find((m) => m.id === mode)!.blurb}</p>
            </section>

            <section className="menu-section region-section" aria-labelledby="region-label">
              <div className="section-head">
                <h2 className="eyebrow" id="region-label">
                  <span className="step-num">2</span> Countries
                </h2>
                {tab === 'map' && (
                  <button className="btn-ghost select-all" onClick={() => setSelection(allPicked ? [] : ALL)}>
                    {allPicked ? 'Clear all' : 'Select all'}
                  </button>
                )}
                {tab === 'custom' && custom.length > 0 && (
                  <button className="btn-ghost select-all" onClick={() => setCustom([])}>
                    Clear all
                  </button>
                )}
              </div>
              <PickerTabs tab={tab} due={due.length} onChange={setPicker} />
              {tab === 'map' && <RegionPicker ref={picker} selection={selection} onToggle={toggle} />}
              {tab === 'custom' && <CountryList selected={custom} onChange={setCustom} />}
              {tab === 'review' && (
                <ReviewList
                  deck={deck}
                  onRemove={(code) => {
                    removeCard(mode, code);
                    setDeck(loadDeck(mode));
                    sfx.click();
                  }}
                />
              )}
            </section>

            <div className="cta">
              <p className="cta-summary" aria-live="polite">
                {tab === 'custom' ? (
                  custom.length ? (
                    <>
                      <b>Custom</b>
                      <span>
                        {custom.length} {custom.length === 1 ? 'country' : 'countries'}
                      </span>
                    </>
                  ) : (
                    <span>Tick the countries to play</span>
                  )
                ) : tab === 'review' ? (
                  due.length ? (
                    <>
                      <b>Review</b>
                      <span>{due.length} due</span>
                    </>
                  ) : inDeck.length ? (
                    <span>Nothing due. Play all {inDeck.length} early?</span>
                  ) : (
                    <span>Nothing to review yet</span>
                  )
                ) : def ? (
                  <>
                    <Badge region={def} />
                    <b>{def.name}</b>
                    <span>{count} countries</span>
                    {best && (
                      <span>
                        Best {Math.round(best.score * 100)}% · {formatTime(best.time)}
                      </span>
                    )}
                  </>
                ) : (
                  <span>Pick one or more regions on the map</span>
                )}
              </p>
              <button className="btn map-it" disabled={!canStart} onClick={(e) => mapIt(e.detail > 0)}>
                map it!
              </button>
            </div>
          </>
        )}
      </div>
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}

/**
 * Game tabs. The active look is a second copy of the tabs, clipped to the selected one; the clip slides on change,
 * so the highlight's colour and position move as one (see the tab-indicator recipe).
 */
function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<Mode, HTMLButtonElement>());
  const [clip, setClip] = useState('inset(0 100% 0 0 round 12px)');

  useLayoutEffect(() => {
    const measure = () => {
      const tab = tabs.current.get(mode);
      const box = row.current;
      if (!tab || !box) return;
      const left = tab.offsetLeft;
      const right = box.scrollWidth - left - tab.offsetWidth;
      setClip(`inset(0 ${right}px 0 ${left}px round 12px)`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row.current!);
    return () => ro.disconnect();
  }, [mode]);

  const render = (active: boolean) =>
    MODES.map((m) => (
      <button
        key={m.id}
        ref={
          active
            ? undefined
            : (el) => {
                if (el) tabs.current.set(m.id, el);
              }
        }
        className="mode-tab"
        data-mode={active ? undefined : m.id}
        role={active ? undefined : 'radio'}
        aria-checked={active ? undefined : m.id === mode}
        tabIndex={active ? -1 : undefined}
        onClick={active ? undefined : () => m.id !== mode && onChange(m.id)}
      >
        <span className={`route route-${m.id}`}>{m.code}</span>
        <span>{m.title}</span>
      </button>
    ));

  return (
    <div className="mode-tabs" ref={row} role="radiogroup" aria-labelledby="game-label">
      {render(false)}
      <div className="mode-tabs-active" aria-hidden="true" style={{ clipPath: clip }}>
        {render(true)}
      </div>
    </div>
  );
}

/** Today's puzzle: its theme up front, the names only once playing. After a run, the time and the fact behind it. */
function DailyPanel() {
  const n = todayNumber();
  const theme = themeFor(n);
  const run = loadRun(n);
  const streak = dailyStreak(n);
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const play = () => {
    sfx.click();
    useStore.getState().startDaily();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button, input, label, dialog')) play();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  return (
    <section className="daily-panel" aria-labelledby="daily-title">
      <p className="eyebrow">
        Daily #{n} <span className="daily-date">· {date}</span>
      </p>
      <h1 className="daily-headline" id="daily-title">
        {theme.title}
      </h1>
      <p className="daily-how">
        Find all <b>{theme.codes.length} countries</b> on the map, in any order, as fast as you can. Each wrong click adds{' '}
        {PENALTY_MS / 1000} seconds.
      </p>
      {run && (
        <div className="daily-run">
          <div className="daily-run-stats">
            <span>
              <small>Your time</small>
              <b className="figure">{formatTime(run.time)}</b>
            </span>
            <span>
              <small>Misses</small>
              <b className="figure">{run.misses}</b>
            </span>
          </div>
          <p>{theme.fact}</p>
        </div>
      )}
      <div className="daily-meta">
        <span>
          <small>Day streak</small>
          <b className="figure">{streak}</b>
        </span>
        <span>
          <small>Next puzzle in</small>
          <b className="figure">{untilNext()}</b>
        </span>
      </div>
      <button className="btn map-it daily-play" onClick={play}>
        {run ? 'Play again' : 'Play today’s'}
      </button>
    </section>
  );
}
