// Tiny synthesized sound effects, so the game ships no audio files.
let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted() {
  try {
    return localStorage.getItem('pinpoint:muted') === '1';
  } catch {
    return false;
  }
}

export const isMuted = () => muted;

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem('pinpoint:muted', value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function play(fn: () => void) {
  if (muted) return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  fn();
}

export const sfx = {
  correct: (streak: number) =>
    play(() => {
      const lift = Math.min(streak, 8) * 40;
      tone(140, 0, 0.09, 'triangle', 0.35, 60);
      tone(660 + lift, 0.03, 0.14, 'square', 0.06);
      tone(990 + lift, 0.09, 0.2, 'square', 0.05);
    }),
  late: () =>
    play(() => {
      tone(140, 0, 0.09, 'triangle', 0.3, 60);
      tone(520, 0.03, 0.16, 'square', 0.05);
    }),
  wrong: () =>
    play(() => {
      tone(180, 0, 0.16, 'sawtooth', 0.07, 110);
    }),
  reveal: () =>
    play(() => {
      tone(300, 0, 0.18, 'square', 0.05, 200);
      tone(220, 0.16, 0.26, 'square', 0.05, 140);
    }),
  click: () => play(() => tone(900, 0, 0.04, 'square', 0.03)),
  finish: () =>
    play(() => {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 'square', 0.05));
    }),
};
