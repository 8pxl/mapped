import type { Mode, Outcome } from './game';

/**
 * A spaced-repetition deck of the countries a player has slipped on, one deck per game type.
 *
 * Missing a country, or needing retries, puts it in the deck due now. Each first-try find after that pushes it
 * further out along STEPS; past the last step it graduates and leaves the deck. Any slip sends it back to the start.
 */
export interface Card {
  /** How many first-try finds in a row since the last slip; indexes STEPS. */
  step: number;
  /** When it is next due, ms since epoch. */
  due: number;
  /** Slips in total, for sorting and display. */
  slips: number;
  /** The last slip, ms since epoch. */
  slipped: number;
}

const DAY = 86_400_000;
/** The wait after each first-try find: 1 day, then 3, 7 and 16. One more find graduates it. */
const STEPS = [DAY, 3 * DAY, 7 * DAY, 16 * DAY];

export type Deck = Record<string, Card>;

const key = (mode: Mode) => `pinpoint:review:${mode}`;

export function loadDeck(mode: Mode): Deck {
  try {
    return JSON.parse(localStorage.getItem(key(mode)) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function saveDeck(mode: Mode, deck: Deck) {
  try {
    localStorage.setItem(key(mode), JSON.stringify(deck));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Updates the deck with how a country went. A first-try find only matters for countries already in the deck;
 * `learning` is false when the find doesn't prove much (hints were on), so it can't advance a card.
 */
export function recordOutcome(mode: Mode, code: string, outcome: Outcome, learning = true, now = Date.now()) {
  const deck = loadDeck(mode);
  const card = deck[code];
  if (outcome === 1) {
    if (!card || !learning) return;
    if (card.step >= STEPS.length) delete deck[code];
    else deck[code] = { ...card, due: now + STEPS[card.step], step: card.step + 1 };
  } else {
    deck[code] = { step: 0, due: now, slips: (card?.slips ?? 0) + 1, slipped: now };
  }
  saveDeck(mode, deck);
}

export function removeCard(mode: Mode, code: string) {
  const deck = loadDeck(mode);
  delete deck[code];
  saveDeck(mode, deck);
}

/** Cards due now, most overdue first. */
export const dueCodes = (deck: Deck, now = Date.now()) =>
  Object.entries(deck)
    .filter(([, c]) => c.due <= now)
    .sort(([, a], [, b]) => a.due - b.due)
    .map(([code]) => code);

/** "due", or how long until it is: "in 5h", "in 3d". */
export function dueLabel(card: Card, now = Date.now()) {
  const wait = card.due - now;
  if (wait <= 0) return 'Due';
  const h = Math.ceil(wait / 3_600_000);
  return h < 24 ? `In ${h}h` : `In ${Math.round(wait / DAY)}d`;
}

/** How far along a card is, 0 to 1, for a progress pip. */
export const progressOf = (card: Card) => card.step / (STEPS.length + 1);
