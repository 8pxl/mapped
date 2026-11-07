import { useEffect, useRef, type ReactNode } from 'react';
import type { Mode } from '../game';
import type { RegionDef } from '../regions';

/** Game types on the menu. Adding a game is one entry here plus its rules in game.ts. */
export const MODES: { id: Mode; code: string; title: string; blurb: string }[] = [
  { id: 'name', code: 'N+F', title: 'Name + Flag', blurb: 'See the name and flag. Find the country on the map.' },
  { id: 'flag', code: 'F', title: 'Flag only', blurb: 'See only the flag. Work out the country, then find it.' },
];

export const modeTitle = (m: Mode) => MODES.find((x) => x.id === m)!.title;

export const RANKS: [number, string][] = [
  [0.97, 'Cartographer'],
  [0.88, 'Navigator'],
  [0.75, 'Explorer'],
  [0.55, 'Wanderer'],
  [0, 'Lost at sea'],
];

export const badgeText = (r: RegionDef) => (r.line ? String(r.line) : 'W');

/** A region's numbered disc in its line colour. */
export function Badge({ region, className = '' }: { region: RegionDef; className?: string }) {
  return (
    <span className={`badge${region.line ? '' : ' light'} ${className}`} style={{ '--line': region.color } as React.CSSProperties}>
      {badgeText(region)}
    </span>
  );
}

/** A native <dialog> driven by an `open` prop: modal, Escape-closable, with a click on the backdrop closing it too. */
export function Dialog({
  open,
  onClose,
  id,
  className,
  dismissOnBackdrop = true,
  children,
}: {
  open: boolean;
  onClose: () => void;
  id?: string;
  className?: string;
  dismissOnBackdrop?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      d.showModal();
      // React doesn't write the autofocus attribute, so pick the starting focus here.
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      id={id}
      className={className}
      onClose={onClose}
      onClick={(e) => {
        if (dismissOnBackdrop && e.target === ref.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}
