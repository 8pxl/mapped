import type { Country } from './data';

export type Mode = 'name' | 'flag';
export const MAX_ATTEMPTS = 3;
/** Share of a point earned when the right country is found on the 1st, 2nd or 3rd try. */
const CREDIT = [1, 0.5, 0.25];

/** Attempts used to find a country (1-3), or 0 when it was revealed. */
export type Outcome = 0 | 1 | 2 | 3;

export type AnswerResult =
  | { kind: 'correct'; attempt: number; streak: number }
  | { kind: 'wrong'; attemptsLeft: number }
  | { kind: 'reveal' };

export class Game {
  readonly results = new Map<string, Outcome>();
  private queue: Country[];
  /** Wrong-or-right clicks spent per country, kept across skips. */
  private spent = new Map<string, number>();
  private startedAt = performance.now();
  private finishedAt: number | null = null;
  streak = 0;
  bestStreak = 0;

  constructor(
    readonly mode: Mode,
    /** Region key (see RegionDef.id), used for best scores. */
    readonly region: string,
    readonly pool: Country[],
  ) {
    this.queue = shuffle([...pool]);
  }

  get current(): Country | null {
    return this.queue[0] ?? null;
  }
  get done() {
    return this.queue.length === 0;
  }
  get attemptsUsed() {
    return this.current ? this.spent.get(this.current.code) ?? 0 : 0;
  }
  get elapsed() {
    return (this.finishedAt ?? performance.now()) - this.startedAt;
  }
  get answered() {
    return this.results.size;
  }
  get score() {
    let earned = 0;
    for (const o of this.results.values()) earned += o ? CREDIT[o - 1] : 0;
    return this.results.size ? earned / this.results.size : 1;
  }
  get finalScore() {
    let earned = 0;
    for (const o of this.results.values()) earned += o ? CREDIT[o - 1] : 0;
    return earned / this.pool.length;
  }
  /** Countries not found on the first try. */
  get missed() {
    return this.pool.filter((c) => this.results.get(c.code) === 0 || (this.results.get(c.code) ?? 0) > 1);
  }

  answer(code: string): AnswerResult {
    const target = this.current!;
    const attempts = this.attemptsUsed + 1;
    this.spent.set(target.code, attempts);
    if (code === target.code) {
      this.settle(attempts as Outcome);
      this.streak = attempts === 1 ? this.streak + 1 : 0;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      return { kind: 'correct', attempt: this.results.get(target.code)!, streak: this.streak };
    }
    this.streak = 0;
    if (attempts >= MAX_ATTEMPTS) {
      this.settle(0);
      return { kind: 'reveal' };
    }
    return { kind: 'wrong', attemptsLeft: MAX_ATTEMPTS - attempts };
  }

  /** Moves the current country to the back of the queue. Attempts already spent on it still count. */
  skip() {
    if (this.queue.length < 2) return;
    this.queue.push(this.queue.shift()!);
  }

  private settle(outcome: Outcome) {
    this.results.set(this.queue.shift()!.code, outcome);
    if (this.done) this.finishedAt = performance.now();
  }
}

function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface Best {
  score: number;
  time: number;
}

const bestKey = (mode: Mode, region: string) => `pinpoint:best:${mode}:${region}`;

export function loadBest(mode: Mode, region: string): Best | null {
  try {
    return JSON.parse(localStorage.getItem(bestKey(mode, region)) ?? 'null');
  } catch {
    return null;
  }
}

/** Saves the run if it beats the stored best (higher score, then faster time). Returns true on a new record. */
export function saveBest(mode: Mode, region: string, run: Best) {
  const prev = loadBest(mode, region);
  if (prev && (prev.score > run.score || (prev.score === run.score && prev.time <= run.time))) return false;
  try {
    localStorage.setItem(bestKey(mode, region), JSON.stringify(run));
  } catch {
    /* storage unavailable */
  }
  return true;
}
