import { useEffect, useRef, useState } from 'react';
import { PALETTE } from '../data';
import { useStore } from '../store';

/** A word for each milestone, and the colour of its label. */
function tierOf(streak: number) {
  if (streak >= 20) return { word: 'Legendary', tone: '#ee352e' };
  if (streak >= 15) return { word: 'Unstoppable', tone: '#ee352e' };
  if (streak >= 10) return { word: 'On fire', tone: 'var(--c3)' };
  if (streak >= 5) return { word: 'On a roll', tone: 'var(--c2)' };
  return { word: 'Combo', tone: 'var(--c1)' };
}

const LIFE = 1150;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The streak popup at the top centre of the map: "×5" with a word, a burst of confetti in the line colours and,
 * from ×10, a small kick to the map. It never takes clicks and clears in about a second.
 */
export function ComboPop({ shakeTarget }: { shakeTarget: React.RefObject<HTMLElement | null> }) {
  const combo = useStore((s) => s.combo);
  // Only milestones reached while this round is on screen; a stale one from an earlier round never replays.
  const seen = useRef(combo?.id ?? 0);
  const [shown, setShown] = useState<{ id: number; streak: number } | null>(null);
  const burst = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!combo || combo.id === seen.current) return;
    seen.current = combo.id;
    // With reduced motion the toast's "streak ×N" says it; no popup, confetti or shake.
    if (reducedMotion()) return;
    setShown(combo);
    const timer = window.setTimeout(() => setShown(null), LIFE);
    if (combo.streak >= 10) kick(shakeTarget.current, combo.streak >= 15 ? 4 : 3);
    return () => clearTimeout(timer);
  }, [combo, shakeTarget]);

  // Confetti fires once the popup is in the DOM.
  useEffect(() => {
    if (shown && burst.current) confetti(burst.current, shown.streak);
  }, [shown]);

  if (!shown) return null;
  const { word, tone } = tierOf(shown.streak);
  return (
    <div key={shown.id} className={`combo${shown.streak >= 10 ? ' big' : ''}`} style={{ '--tone': tone } as React.CSSProperties} aria-hidden="true">
      <div ref={burst} className="combo-burst" />
      <div className="combo-n">
        <span>×</span>
        {shown.streak}
      </div>
      <div className="combo-word">{word}</div>
    </div>
  );
}

/** Small squares and bars flung out from the popup, falling a little as they fade. */
function confetti(host: HTMLElement, streak: number) {
  const count = Math.min(14 + streak, 34);
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    const bar = Math.random() < 0.4;
    bit.style.cssText = `width:${bar ? 3 : 6}px;height:${bar ? 10 : 6}px;background:${PALETTE[i % PALETTE.length]}`;
    host.append(bit);
    // Mostly sideways and up, so the burst frames the number rather than covering the map below.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
    const dist = 60 + Math.random() * 70;
    const dx = Math.cos(angle) * dist * 1.4;
    const dy = Math.sin(angle) * dist * 0.6;
    const spin = (Math.random() - 0.5) * 540;
    bit
      .animate(
        [
          { transform: 'translate(0, 0) rotate(0deg) scale(0.6)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${spin * 0.7}deg) scale(1)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${dx * 1.15}px, ${dy + 34}px) rotate(${spin}deg) scale(0.9)`, opacity: 0 },
        ],
        { duration: 750 + Math.random() * 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', delay: 40 },
      )
      .finished.then(() => bit.remove(), () => bit.remove());
  }
}

/** A short, small shake: a few px over a quarter second, enough to feel without moving the target much. */
function kick(el: HTMLElement | null, px: number) {
  el?.animate(
    [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-px}px, ${px / 2}px)` },
      { transform: `translate(${px}px, ${-px / 2}px)` },
      { transform: `translate(${-px / 2}px, 0)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: 240, easing: 'ease-out' },
  );
}
