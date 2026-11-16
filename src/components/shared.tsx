import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Mode } from '../game';
import type { RegionDef } from '../regions';

/** Game types on the menu. Adding a game is one entry here plus its rules in game.ts. */
export const MODES: { id: Mode; code: string; title: string; blurb: string }[] = [
  { id: 'name', code: 'N+F', title: 'Name + Flag', blurb: 'See the name and flag. Find the country on the map.' },
  { id: 'flag', code: 'F', title: 'Flag only', blurb: 'See only the flag. Work out the country, then find it.' },
  { id: 'pick', code: 'N→F', title: 'Pick the flag', blurb: 'See the name. Pick its flag from every flag in the region.' },
  { id: 'capital', code: 'C', title: 'Capitals', blurb: 'See a capital city. Find its country on the map.' },
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

type SegKind = 'nav' | 'tabs' | 'radio';

/**
 * The menu's selectors (Daily | Learn, the game, what to play). The highlighted look is a second copy of the row,
 * clipped to the selected option; the clip slides on change, so the highlight's colour and position move as one.
 * Its first placement, on mount, is instant, so nothing slides in when a panel appears.
 */
export function Segmented<T extends string>({
  kind,
  items,
  value,
  onChange,
  className,
  itemClassName,
  ...aria
}: {
  kind: SegKind;
  items: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  className: string;
  itemClassName?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}) {
  const row = useRef<HTMLDivElement & HTMLElement>(null);
  const highlight = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<T, HTMLButtonElement>());
  const placed = useRef(false);

  useLayoutEffect(() => {
    const measure = () => {
      const tab = buttons.current.get(value);
      const box = row.current;
      const hl = highlight.current;
      if (!tab || !box || !hl) return;
      const top = tab.offsetTop;
      const left = tab.offsetLeft;
      const right = box.scrollWidth - left - tab.offsetWidth;
      const bottom = box.clientHeight - top - tab.offsetHeight;
      const clip = `inset(${top}px ${right}px ${bottom}px ${left}px round ${getComputedStyle(tab).borderTopLeftRadius})`;
      if (placed.current) {
        hl.style.clipPath = clip;
        return;
      }
      hl.style.transition = 'none';
      hl.style.clipPath = clip;
      void hl.offsetWidth;
      hl.style.transition = '';
      placed.current = true;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row.current!);
    return () => ro.disconnect();
  }, [value]);

  const state = (on: boolean) =>
    kind === 'nav'
      ? { 'aria-current': on ? ('page' as const) : undefined }
      : kind === 'tabs'
        ? { role: 'tab', 'aria-selected': on }
        : { role: 'radio', 'aria-checked': on };

  const render = (copy: boolean) =>
    items.map((it) => (
      <button
        key={it.id}
        type="button"
        ref={
          copy
            ? undefined
            : (el) => {
                if (el) buttons.current.set(it.id, el);
              }
        }
        className={`seg-item${itemClassName ? ` ${itemClassName}` : ''}`}
        data-id={copy ? undefined : it.id}
        tabIndex={copy ? -1 : undefined}
        {...(copy ? {} : state(it.id === value))}
        onClick={copy ? undefined : () => it.id !== value && onChange(it.id)}
      >
        {it.label}
      </button>
    ));

  const Tag = kind === 'nav' ? 'nav' : 'div';
  return (
    <Tag className={`seg ${className}`} ref={row} role={kind === 'tabs' ? 'tablist' : kind === 'radio' ? 'radiogroup' : undefined} {...aria}>
      {render(false)}
      <div className="seg-active" ref={highlight} aria-hidden="true" inert style={{ clipPath: 'inset(0 100% 100% 0)' }}>
        {render(true)}
      </div>
    </Tag>
  );
}
