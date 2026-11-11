import { formatTime, type Game, type Mode, type Outcome } from './game';
import type { RegionDef } from './regions';

/** A score to beat, carried in a shared link as `?vs=<percent>-<seconds>`. */
export interface Challenge {
  /** The region key and game type it was set on: it only applies to that same round. */
  region: string;
  mode: Mode;
  /** Accuracy as a whole percent, as the results screen shows it. */
  score: number;
  seconds: number;
}

export function parseChallenge(params: URLSearchParams, region: string, mode: Mode): Challenge | null {
  const m = /^(\d{1,3})-(\d{1,6})$/.exec(params.get('vs') ?? '');
  if (!m) return null;
  const score = Number(m[1]);
  const seconds = Number(m[2]);
  return score <= 100 ? { region, mode, score, seconds } : null;
}

/** A finished run as it is shared and compared: whole percent, whole seconds. */
export const runOf = (g: Game) => ({ score: Math.round(g.finalScore * 100), seconds: Math.floor(g.elapsed / 1000) });

/** Higher accuracy wins; equal accuracy goes to the faster time. A dead heat doesn't beat it. */
export const beats = (run: { score: number; seconds: number }, c: Challenge) =>
  run.score > c.score || (run.score === c.score && run.seconds < c.seconds);

export const describe = (c: { score: number; seconds: number }) => `${c.score}% in ${formatTime(c.seconds * 1000)}`;

const SQUARE: Record<Outcome, string> = { 1: '🟩', 2: '🟨', 3: '🟧', 0: '🟥' };
/** Above this many countries a grid gets too long to paste, so the text gives counts instead. */
const GRID_MAX = 60;

function outcomes(g: Game) {
  const list = [...g.results.values()];
  if (list.length <= GRID_MAX) {
    const rows: string[] = [];
    for (let i = 0; i < list.length; i += 10) rows.push(list.slice(i, i + 10).map((o) => SQUARE[o]).join(''));
    return rows.join('\n');
  }
  return ([1, 2, 3, 0] as Outcome[])
    .map((o) => [o, list.filter((x) => x === o).length] as const)
    .filter(([, n]) => n)
    .map(([o, n]) => `${SQUARE[o]} ${n}`)
    .join('  ');
}

export function shareUrl(def: RegionDef, mode: Mode, g: Game) {
  const { score, seconds } = runOf(g);
  const params = new URLSearchParams();
  if (mode !== 'name') params.set('mode', mode);
  params.set('vs', `${score}-${seconds}`);
  return `${location.origin}/${def.id}?${params}`;
}

export function shareText(def: RegionDef, modeTitle: string, g: Game, hints: boolean) {
  const run = runOf(g);
  return [
    `mapped! ${def.name} · ${modeTitle}${hints ? ' · hints on' : ''}`,
    `${run.score}% accuracy in ${formatTime(run.seconds * 1000)}`,
    outcomes(g),
    `Beat it: ${shareUrl(def, g.mode, g)}`,
  ].join('\n');
}

/**
 * Hands the text to the share sheet on phones, or copies it elsewhere.
 * Resolves to what happened, so the button can say so; 'cancelled' when the sheet was dismissed.
 */
export async function shareScore(text: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    // No async clipboard outside a secure context (a dev server over plain http): fall back to execCommand.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    // Inside the open dialog: a modal dialog makes the rest of the page inert, selection included.
    (document.querySelector('dialog[open]') ?? document.body).append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok ? 'copied' : 'failed';
  }
}
