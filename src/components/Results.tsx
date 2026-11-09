import { sfx } from '../audio';
import { COLOUR_OF, countriesFor, type Country } from '../data';
import { useEffect, useRef, useState } from 'react';
import { formatTime, type Outcome } from '../game';
import { beats, describe, runOf, shareScore, shareText } from '../share';
import { useStore } from '../store';
import { Badge, Dialog, modeTitle, RANKS } from './shared';

function Swatch({ country, outcome }: { country: Country; outcome: Outcome }) {
  if (outcome === 0) return <i className="swatch missed" />;
  return <i className={`swatch${outcome > 1 ? ' retry' : ''}`} style={{ '--k': COLOUR_OF.get(country.code) } as React.CSSProperties} />;
}

export function Results() {
  const session = useStore((s) => s.session)!;
  const { start, goMenu, setResultsOpen } = useStore.getState();
  const { game: g, def, record, resultsOpen, challenge } = session;
  const [shared, setShared] = useState<'copied' | 'failed' | null>(null);
  const resetTimer = useRef(0);
  useEffect(() => () => clearTimeout(resetTimer.current), []);
  if (!session.finished) return null;

  const onShare = async () => {
    sfx.click();
    const outcome = await shareScore(shareText(def, modeTitle(g.mode), g, session.full && !session.ranked));
    if (outcome !== 'copied' && outcome !== 'failed') return;
    setShared(outcome);
    clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setShared(null), 1800);
  };
  const won = challenge && beats(runOf(g), challenge);
  /** A hand-picked list or a review: playing again repeats the same countries. */
  const picked = def.id === 'custom' || def.id === 'review';

  const score = g.finalScore;
  const rank = RANKS.find(([min]) => score >= min)![1];
  const firstTry = [...g.results.values()].filter((o) => o === 1).length;
  const slips = g.missed;
  const act = (fn: () => void) => () => {
    sfx.click();
    fn();
  };

  return (
    <Dialog id="results" open={resultsOpen} onClose={() => setResultsOpen(false)} className="results" dismissOnBackdrop={false}>
      <div id="results-body">
        <div className="res-main" tabIndex={-1} data-autofocus>
          <header className="res-top">
            <span className="res-kicker">
              <Badge region={def} />
              <span>{def.name}</span>
              <span className="sep">/</span>
              <span>{modeTitle(g.mode)}</span>
            </span>
            {session.full && (
              <button className={`share-btn${shared ? ` ${shared}` : ''}`} onClick={onShare} aria-live="polite">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7" />
                </svg>
                <span>{shared === 'copied' ? 'Copied' : shared === 'failed' ? 'Copy failed' : 'Share'}</span>
              </button>
            )}
          </header>
          <div className="res-hero">
            <div className="res-score">
              {Math.round(score * 100)}
              <span>%</span>
            </div>
            <div className="res-badges">
              {record && <span className="record">New best</span>}
              <div className="rank-stamp">{rank}</div>
            </div>
          </div>
          {challenge && (
            <p className={`res-challenge${won ? ' won' : ''}`}>
              <span>{won ? 'Challenge beaten' : 'Not beaten'}</span>
              {won ? `You topped ${describe(challenge)}.` : `${describe(challenge)} still stands.`}
            </p>
          )}
          <dl className="res-stats">
            <div>
              <dt>Time</dt>
              <dd>{formatTime(g.elapsed)}</dd>
            </div>
            <div>
              <dt>First try</dt>
              <dd>
                {firstTry}
                <small>/{g.pool.length}</small>
              </dd>
            </div>
            <div>
              <dt>Streak</dt>
              <dd>{g.bestStreak}</dd>
            </div>
          </dl>
          {slips.length ? (
            <section className="res-review">
              <h3 className="res-sub">
                To review <span>{slips.length}</span>
              </h3>
              <ul className="slips">
                {slips.map((c) => {
                  const o = g.results.get(c.code)!;
                  return (
                    <li key={c.code}>
                      <Swatch country={c} outcome={o} />
                      <img src={c.flag} alt="" />
                      <span>{c.name}</span>
                      <em>{o ? `${o} tries` : 'Missed'}</em>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <p className="flawless">Flawless. Every country on the first try.</p>
          )}
        </div>
        <footer className={`res-actions${slips.length ? '' : ' no-retry'}`}>
          {slips.length > 0 && (
            <button className="btn res-primary" data-act="retry" onClick={act(() => start(def, g.missed, false))}>
              Retry {slips.length} to review
            </button>
          )}
          <button className={`btn${slips.length ? ' alt' : ''}`} data-act="again" onClick={act(() => (picked ? start(def, g.pool, false, session.field) : start(def, countriesFor(def), true)))}>
            Play again
          </button>
          <button className="btn alt" data-act="map" onClick={act(() => setResultsOpen(false))}>
            Map
          </button>
          <button className="btn alt" data-act="menu" onClick={act(goMenu)}>
            Menu
          </button>
        </footer>
      </div>
    </Dialog>
  );
}
