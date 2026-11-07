import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { sfx } from '../audio';
import { countriesFor } from '../data';
import { formatTime, loadBest, type Mode } from '../game';
import { CONTINENTS, selectionDef, type ContinentId } from '../regions';
import { useStore } from '../store';
import { RegionPicker, type PickerHandle } from './RegionPicker';
import { Settings } from './Settings';
import { Badge, MODES } from './shared';

const ALL = CONTINENTS.map((c) => c.id as ContinentId);

export function Menu() {
  const mode = useStore((s) => s.mode);
  const selection = useStore((s) => s.selection);
  const setMode = useStore((s) => s.setMode);
  const setSelection = useStore((s) => s.setSelection);
  const startSelected = useStore((s) => s.startSelected);
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

  /** From a pointer: zoom into the selection, then start. From the keyboard: start at once, no animation. */
  const mapIt = async (fromPointer: boolean) => {
    if (!def || leaving) return;
    if (fromPointer) {
      setLeaving(true);
      await picker.current?.zoomToSelection();
    }
    startSelected();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button')) {
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
              <span className="step-num">2</span> Regions
            </h2>
            <button className="btn-ghost select-all" onClick={() => setSelection(allPicked ? [] : ALL)}>
              {allPicked ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <RegionPicker ref={picker} selection={selection} onToggle={toggle} />
        </section>

        <div className="cta">
          <p className="cta-summary" aria-live="polite">
            {def ? (
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
          <button className="btn map-it" disabled={!def} onClick={(e) => mapIt(e.detail > 0)}>
            map it!
          </button>
        </div>
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
