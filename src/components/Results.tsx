import { sfx } from '../audio';
import { COLOUR_OF } from '../atlas';
import { countriesFor, type Country } from '../data';
import { useEffect, useRef, useState } from 'react';
import { formatTime, type Outcome } from '../game';
import { beats, describe, runOf, shareScore, shareText } from '../share';
import { useStore } from '../store';
import { Badge, Dialog, modeTitle, RANKS } from './shared';
import { dailyShareText, dailyStreak, judgeGuess, loadRun, saveGuess, untilNext } from '../daily';

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
  if (session.daily) return <DailyResults />;

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

const GUESSES = 3;

/**
 * The daily's results, in two steps. First the guess: what links the countries just found? Free text, up to three
 * tries, judged by judgeGuess. Then the answer and its fun fact, with the time, the streak and sharing.
 * Replays skip the guess: the answer is already known.
 */
function DailyResults() {
  const session = useStore((s) => s.session)!;
  const { goMenu, setResultsOpen, startDaily } = useStore.getState();
  const { game: g, daily, resultsOpen } = session;
  const { n, theme, first } = daily!;
  const [shared, setShared] = useState<'copied' | 'failed' | null>(null);
  const [text, setText] = useState('');
  const [tries, setTries] = useState<{ guess: string; verdict: 'close' | 'wrong' }[]>([]);
  const [verdict, setVerdict] = useState<'right' | 'wrong' | null>(() => (first ? null : loadRun(n)?.guess ?? 'wrong'));
  const resetTimer = useRef(0);
  useEffect(() => () => clearTimeout(resetTimer.current), []);
  // The day's first run is the one that counts and gets shared; a replay just shows how it went.
  const kept = loadRun(n) ?? { time: g.elapsed, misses: g.misses };
  const act = (fn: () => void) => () => {
    sfx.click();
    fn();
  };
  const settle = (v: 'right' | 'wrong') => {
    setVerdict(v);
    saveGuess(n, v);
    if (v === 'right') sfx.finish();
  };
  const onGuess = (e: React.FormEvent) => {
    e.preventDefault();
    const guess = text.trim();
    if (!guess) return;
    const v = judgeGuess(theme, guess);
    if (v === 'right') return settle('right');
    sfx.wrong();
    const next = [...tries, { guess, verdict: v }];
    setTries(next);
    setText('');
    if (next.length >= GUESSES) settle('wrong');
  };
  const onShare = async () => {
    sfx.click();
    const outcome = await shareScore(dailyShareText(n, { ...kept, guess: verdict ?? undefined }, g.pool.length));
    if (outcome !== 'copied' && outcome !== 'failed') return;
    setShared(outcome);
    clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setShared(null), 1800);
  };

  return (
    <Dialog id="results" open={resultsOpen} onClose={() => setResultsOpen(false)} className="results" dismissOnBackdrop={false}>
      <div id="results-body">
        <div className="res-main" tabIndex={-1} data-autofocus>
          <header className="res-top">
            <span className="res-kicker">
              <span>Daily #{n}</span>
              <span className="sep">/</span>
              <span>
                {formatTime(g.elapsed)} · {g.misses ? `${g.misses} ${g.misses === 1 ? 'miss' : 'misses'}` : 'no misses'}
              </span>
            </span>
            {verdict && (
              <button className={`share-btn${shared ? ` ${shared}` : ''}`} onClick={onShare} aria-live="polite">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 15V3M7 8l5-5 5 5M5 13v7h14v-7" />
                </svg>
                <span>{shared === 'copied' ? 'Copied' : shared === 'failed' ? 'Copy failed' : 'Share'}</span>
              </button>
            )}
          </header>
          <ul className="daily-found">
            {g.pool.map((c) => (
              <li key={c.code}>
                <img src={c.flag} alt="" />
                {c.name}
              </li>
            ))}
          </ul>
          {verdict === null ? (
            <form className="guess" onSubmit={onGuess}>
              <label htmlFor="guess-input">What links these {g.pool.length} countries?</label>
              <div className="guess-row">
                <input
                  id="guess-input"
                  autoComplete="off"
                  autoFocus
                  placeholder="Your guess"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={120}
                />
                <button className="btn" disabled={!text.trim()}>
                  Guess
                </button>
              </div>
              <div className="guess-foot">
                <ul className="guess-tries" aria-live="polite">
                  {tries.map((t, i) => (
                    <li key={i} className={t.verdict}>
                      <span>{t.verdict === 'close' ? 'Close' : 'No'}</span>
                      {t.guess}
                    </li>
                  ))}
                </ul>
                <span className="guess-left">
                  {GUESSES - tries.length} {GUESSES - tries.length === 1 ? 'guess' : 'guesses'} left ·{' '}
                  <button type="button" className="linkish" onClick={() => settle('wrong')}>
                    Give up
                  </button>
                </span>
              </div>
            </form>
          ) : (
            <section className={`daily-answer ${verdict}`}>
              <p className="daily-verdict">{first ? (verdict === 'right' ? 'You got it' : 'The link was') : 'The link'}</p>
              <h3>{theme.title}</h3>
              <p>{theme.fact}</p>
            </section>
          )}
          {verdict && (
            <dl className="res-stats">
              <div>
                <dt>{first ? 'Time' : 'First run'}</dt>
                <dd>{formatTime(kept.time)}</dd>
              </div>
              <div>
                <dt>Day streak</dt>
                <dd>{dailyStreak()}</dd>
              </div>
              <div>
                <dt>Next in</dt>
                <dd className="next-in">{untilNext()}</dd>
              </div>
            </dl>
          )}
        </div>
        {verdict && (
          <footer className="res-actions no-retry">
            <button className="btn" data-act="again" onClick={act(startDaily)}>
              Play again
            </button>
            <button className="btn alt" data-act="map" onClick={act(() => setResultsOpen(false))}>
              Map
            </button>
            <button className="btn alt" data-act="menu" onClick={act(goMenu)}>
              Menu
            </button>
          </footer>
        )}
      </div>
    </Dialog>
  );
}
