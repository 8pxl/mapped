import { useEffect, useMemo, useRef, useState } from 'react';
import { sfx } from '../audio';
import { countriesIn } from '../data';
import { formatTime, loadBest } from '../game';
import { thumbnail } from '../map';
import { REGIONS, regionById, type RegionDef, type RegionId } from '../regions';
import { useStore } from '../store';
import { Settings } from './Settings';
import { Badge, MODES, modeTitle } from './shared';

const thumbs = new Map<RegionId, string>();
const thumbFor = (r: RegionDef) => {
  if (!thumbs.has(r.id)) thumbs.set(r.id, thumbnail(r, new Set(countriesIn(r.id).map((c) => c.code)), 560, 320));
  return thumbs.get(r.id)!;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function Menu() {
  const mode = useStore((s) => s.mode);
  const region = useStore((s) => s.region);
  const setMode = useStore((s) => s.setMode);
  const setRegion = useStore((s) => s.setRegion);
  const startSelected = useStore((s) => s.startSelected);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rowRefs = useRef(new Map<RegionId, HTMLButtonElement>());

  const selected = regionById(region);
  const best = loadBest(mode, region);
  const groups = useMemo(() => [...new Set(REGIONS.map((r) => r.group))], []);

  // Arrow keys move through regions and Enter starts, on the menu only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = REGIONS.findIndex((r) => r.id === useStore.getState().region);
        const next = REGIONS[(i + (e.key === 'ArrowDown' ? 1 : -1) + REGIONS.length) % REGIONS.length];
        setRegion(next.id);
        // Focus follows the selection, so Enter starts it rather than pressing whatever button had focus.
        rowRefs.current.get(next.id)?.focus();
      }
      const onButton = (e.target as HTMLElement).closest('button');
      if (e.key === 'Enter' && (!onButton || onButton.matches('.region-row'))) {
        e.preventDefault();
        startSelected();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [settingsOpen, setRegion, startSelected]);

  return (
    <main id="menu" className="screen">
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

        <div className="menu-grid">
          <div className="picker">
            <section className="pick-section" aria-labelledby="game-label">
              <h2 className="eyebrow" id="game-label">
                Game
              </h2>
              <div className="mode-tabs" role="radiogroup" aria-labelledby="game-label">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    className="mode-tab"
                    data-mode={m.id}
                    role="radio"
                    aria-checked={m.id === mode}
                    onClick={() => {
                      if (m.id === mode) return;
                      setMode(m.id);
                      sfx.click();
                    }}
                  >
                    <span className={`route route-${m.id}`}>{m.code}</span>
                    <span>{m.title}</span>
                  </button>
                ))}
              </div>
              <p className="mode-desc">{MODES.find((m) => m.id === mode)!.blurb}</p>
            </section>

            <section className="pick-section" aria-labelledby="region-label">
              <div className="region-cols">
                <h2 className="eyebrow" id="region-label">
                  Region
                </h2>
                <span aria-hidden="true">Countries</span>
                <span aria-hidden="true">Best</span>
              </div>
              <div className="region-list">
                {groups.map((group) => (
                  <div className="region-group" key={group}>
                    <h3>{group}</h3>
                    <ul>
                      {REGIONS.filter((r) => r.group === group).map((r) => {
                        const rowBest = loadBest(mode, r.id);
                        return (
                          <li key={r.id}>
                            <button
                              ref={(el) => {
                                if (el) rowRefs.current.set(r.id, el);
                              }}
                              className="region-row"
                              data-region={r.id}
                              aria-pressed={r.id === region}
                              style={{ '--line': r.color } as React.CSSProperties}
                              onClick={() => setRegion(r.id)}
                              onDoubleClick={startSelected}
                            >
                              <Badge region={r} />
                              <span className="row-name">
                                {r.name}
                                <small>{r.tagline}</small>
                              </span>
                              <span className="row-count">{countriesIn(r.id).length}</span>
                              <span className="row-best">{rowBest ? pct(rowBest.score) : '—'}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="preview" aria-live="polite">
            <div className="preview-map" dangerouslySetInnerHTML={{ __html: thumbFor(selected) }} />
            <div className="preview-body">
              <div className="preview-head">
                <Badge region={selected} />
                <h2>{selected.name}</h2>
              </div>
              <p className="preview-tag">{selected.tagline}</p>
              <dl className="preview-stats">
                <div>
                  <dt>Countries</dt>
                  <dd>{countriesIn(region).length}</dd>
                </div>
                <div>
                  <dt>Best</dt>
                  <dd>{best ? pct(best.score) : '—'}</dd>
                </div>
                <div>
                  <dt>Best time</dt>
                  <dd>{best ? formatTime(best.time) : '—'}</dd>
                </div>
              </dl>
              <button className="btn start-btn" onClick={startSelected}>
                Start <span>{modeTitle(mode)}</span>
                <kbd>Enter</kbd>
              </button>
            </div>
          </aside>
        </div>
      </div>
      <div className="start-bar">
        <span className="start-bar-label">
          <Badge region={selected} />
          <span>
            <b>{selected.name}</b>
            <small>{modeTitle(mode)}</small>
          </span>
        </span>
        <button className="btn" onClick={startSelected}>
          Start
        </button>
      </div>
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
