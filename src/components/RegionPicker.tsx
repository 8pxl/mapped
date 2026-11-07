import { geoBounds, geoNaturalEarth1, geoPath } from 'd3-geo';
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { continentBlocks } from '../blocks';
import { CONTINENTS, type ContinentId, type RegionDef } from '../regions';
import { Badge } from './shared';

const W = 1000;
const H = 510;
/** Room around the land so outlines and the zoom-out fade never touch the edge. */
const PAD = 14;
// The --ease-in-out token from style.css, for WAAPI.
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
/** Selecting and deselecting, in ms. The labels' colour transitions in style.css use the same times. */
const POUR_IN = 420;
const POUR_OUT = 280;
const STAGGER = 45;
/** The reveal circle is solid out to this fraction of its radius, then fades: a soft edge where white meets colour. */
const SOFT = 0.65;

/** A CSS cubic-bezier() as a function, so the rAF-driven reveal eases exactly like the labels' transitions. */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (s: number, a: number, b: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  const slope = (s: number, a: number, b: number) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
  return (t: number) => {
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = at(s, x1, x2) - t;
      const d = slope(s, x1, x2);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      s = Math.min(1, Math.max(0, s - err / d));
    }
    return at(s, y1, y2);
  };
}
/** The --ease-out token. */
const easeOut = cubicBezier(0.22, 1, 0.36, 1);

interface BlockGeo {
  def: RegionDef;
  id: ContinentId;
  d: string;
  bounds: [[number, number], [number, number]];
  label: [number, number];
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

let geoCache: { blocks: BlockGeo[]; other: string; view: View } | null = null;

function pickerGeo() {
  if (geoCache) return geoCache;
  const projection = geoNaturalEarth1().rotate([-11, 0]).fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
  const path = geoPath(projection);
  const { continents } = continentBlocks();
  // Antarctica is in no quiz; leaving it out lets the map end at the land instead of a cropped edge.
  const other = continentBlocks().other.filter((f) => geoBounds(f)[1][1] > -60);
  const blocks = CONTINENTS.map((def) => {
    const f = continents.get(def.id as ContinentId)!;
    return { def, id: def.id as ContinentId, d: path(f) ?? '', bounds: path.bounds(f), label: projection(def.label!)! };
  });
  const all = [...blocks.map((b) => b.bounds), ...other.map((f) => path.bounds(f))];
  const x0 = Math.min(...all.map((b) => b[0][0])) - PAD;
  const y0 = Math.min(...all.map((b) => b[0][1])) - PAD;
  const x1 = Math.max(...all.map((b) => b[1][0])) + PAD;
  const y1 = Math.max(...all.map((b) => b[1][1])) + PAD;
  geoCache = { blocks, other: other.map((f) => path(f) ?? '').join(''), view: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  return geoCache;
}

export interface PickerHandle {
  /** Zooms toward the selected continents; resolves when the move ends. */
  zoomToSelection: () => Promise<void>;
}

/** Plays the opening stagger only on the first menu of a visit, not every return to it. */
let introPlayed = false;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function RegionPicker({
  selection,
  onToggle,
  ref,
}: {
  selection: ContinentId[];
  /** `animate` is false for keyboard toggles, which never animate. */
  onToggle: (id: ContinentId, animate: boolean) => void;
  ref?: React.Ref<PickerHandle>;
}) {
  const { blocks, other, view } = pickerGeo();
  const lines = useRef(new Map<ContinentId, SVGPathElement>());
  const dots = useRef(new Map<ContinentId, SVGCircleElement>());
  const pills = useRef(new Map<ContinentId, HTMLButtonElement>());
  /** The reveal in progress (or last finished) per continent: its radius, so an interrupted one carries on. */
  const runs = useRef(new Map<ContinentId, { r: number; raf: number; timer: number }>());
  const zoomLayer = useRef<SVGGElement>(null);
  /** Where each pending change should pour from, and whether it animates. */
  const origins = useRef(new Map<ContinentId, { at: [number, number]; animate: boolean }>());
  const shown = useRef<Set<ContinentId> | null>(null);
  const intro = useRef(!introPlayed);
  /** One hover for both the outline and the label, so either lights up both the same way. */
  const [hovered, setHovered] = useState<ContinentId | null>(null);

  // Selected continents trace their outline in colour, revealed by a soft circle that grows from the click point.
  useLayoutEffect(() => {
    const now = new Set(selection);
    if (!shown.current) {
      for (const b of blocks) settle(b.id, now.has(b.id));
      shown.current = now;
      introPlayed = true;
      return;
    }
    const changed = blocks.filter((b) => shown.current!.has(b.id) !== now.has(b.id));
    changed.forEach((b, i) => {
      const origin = origins.current.get(b.id) ?? { at: b.label, animate: true };
      pour(b, now.has(b.id), origin.at, origin.animate, changed.length > 1 ? i * STAGGER : 0);
    });
    origins.current.clear();
    shown.current = now;
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      for (const run of runs.current.values()) {
        cancelAnimationFrame(run.raf);
        clearTimeout(run.timer);
      }
    },
    [],
  );

  const run = (id: ContinentId) => {
    if (!runs.current.has(id)) runs.current.set(id, { r: 0, raf: 0, timer: 0 });
    return runs.current.get(id)!;
  };

  /** The resting state: the coloured outline fully shown, or hidden, with no mask. */
  function settle(id: ContinentId, on: boolean) {
    const line = lines.current.get(id)!;
    line.removeAttribute('mask');
    line.style.visibility = on ? '' : 'hidden';
    run(id).r = on ? Infinity : 0;
  }

  /** How far the circle must reach from `at` to cover the whole continent, soft edge included. */
  const radiusFrom = (b: BlockGeo, [x, y]: [number, number]) => {
    const [[x0, y0], [x1, y1]] = b.bounds;
    return (Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([cx, cy]) => Math.hypot(cx - x, cy - y))) + 6) / SOFT;
  };

  function pour(b: BlockGeo, on: boolean, at: [number, number], animate: boolean, delay: number) {
    const line = lines.current.get(b.id)!;
    const dot = dots.current.get(b.id)!;
    const state = run(b.id);
    cancelAnimationFrame(state.raf);
    for (const a of line.getAnimations()) a.cancel();
    // The label waits out the same stagger, so its colour turns with the outline's.
    const pill = pills.current.get(b.id)!;
    clearTimeout(state.timer);
    pill.style.setProperty('--delay', `${delay}ms`);
    state.timer = window.setTimeout(() => pill.style.removeProperty('--delay'), delay + POUR_IN);

    if (!animate || reducedMotion()) {
      // Keyboard and reduced motion: a short fade, no movement.
      line.removeAttribute('mask');
      line.style.visibility = '';
      line.animate([{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { duration: 150, easing: 'ease' }).onfinish = () => settle(b.id, on);
      state.r = on ? Infinity : 0;
      return;
    }

    const full = radiusFrom(b, at);
    const from = Math.min(state.r, full);
    const to = on ? full : 0;
    const duration = on ? POUR_IN : POUR_OUT;
    dot.setAttribute('cx', String(at[0]));
    dot.setAttribute('cy', String(at[1]));
    dot.setAttribute('r', String(from));
    line.setAttribute('mask', `url(#pour-${b.id})`);
    line.style.visibility = '';
    state.r = from;
    const start = performance.now() + delay;
    const frame = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      state.r = from + (to - from) * easeOut(t);
      dot.setAttribute('r', String(state.r));
      if (t < 1) state.raf = requestAnimationFrame(frame);
      else settle(b.id, on);
    };
    state.raf = requestAnimationFrame(frame);
  }

  useImperativeHandle(ref, () => ({
    zoomToSelection: () => {
      const layer = zoomLayer.current!;
      const picked = blocks.filter((b) => selection.includes(b.id));
      if (!picked.length || reducedMotion()) return Promise.resolve();
      const x0 = Math.min(...picked.map((b) => b.bounds[0][0]));
      const y0 = Math.min(...picked.map((b) => b.bounds[0][1]));
      const x1 = Math.max(...picked.map((b) => b.bounds[1][0]));
      const y1 = Math.max(...picked.map((b) => b.bounds[1][1]));
      const k = Math.min(3.2, 0.9 / Math.max((x1 - x0) / view.w, (y1 - y0) / view.h));
      const tx = view.x + view.w / 2 - k * ((x0 + x1) / 2);
      const ty = view.y + view.h / 2 - k * ((y0 + y1) / 2);
      return layer
        .animate([{ transform: 'none' }, { transform: `translate(${tx}px, ${ty}px) scale(${k})` }], {
          duration: 380,
          easing: EASE_IN_OUT,
          fill: 'forwards',
        })
        .finished.then(() => undefined);
    },
  }));

  const toggleAt = (id: ContinentId, e: React.MouseEvent) => {
    // A click with no pointer (Enter or Space on a focused label) is keyboard-initiated: no animation.
    const animate = e.detail > 0;
    const svg = (e.currentTarget as Element).closest('.picker-map')!.querySelector('svg')!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    const b = blocks.find((x) => x.id === id)!;
    origins.current.set(id, { at: animate && e.currentTarget instanceof SVGElement ? [pt.x, pt.y] : b.label, animate });
    onToggle(id, animate);
  };

  /** Hover handlers shared by a continent's outline and its label. Touch has no hover. */
  const hoverProps = (id: ContinentId) => ({
    onPointerEnter: (e: React.PointerEvent) => e.pointerType !== 'touch' && setHovered(id),
    onPointerLeave: () => setHovered((h) => (h === id ? null : h)),
  });

  const blockProps = (b: BlockGeo, i: number) => ({
    'data-region': b.id,
    'aria-pressed': selection.includes(b.id),
    'data-hover': hovered === b.id || undefined,
    style: { '--line': b.def.color, '--i': i } as React.CSSProperties,
    d: b.d,
  });

  // Three layers, so no continent's outline paints over a neighbour's along a shared border (the Urals, Panama):
  // the dim outlines, then the hover outline, then the coloured outlines of selected continents.
  return (
    <div className={`picker-map${intro.current ? ' intro' : ''}`} style={{ aspectRatio: `${view.w} / ${view.h}` }}>
      <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} aria-hidden="true">
        <defs>
          <radialGradient id="pour-soft">
            <stop offset={0} stopColor="#fff" />
            <stop offset={SOFT} stopColor="#fff" />
            <stop offset={1} stopColor="#fff" stopOpacity={0} />
          </radialGradient>
          {blocks.map((b) => (
            <mask
              key={b.id}
              id={`pour-${b.id}`}
              maskUnits="userSpaceOnUse"
              x={b.bounds[0][0] - 10}
              y={b.bounds[0][1] - 10}
              width={b.bounds[1][0] - b.bounds[0][0] + 20}
              height={b.bounds[1][1] - b.bounds[0][1] + 20}
            >
              <circle
                ref={(el) => {
                  if (el) dots.current.set(b.id, el);
                }}
                fill="url(#pour-soft)"
                r={0}
              />
            </mask>
          ))}
        </defs>
        <g ref={zoomLayer} className="picker-zoom">
          <path className="picker-other" d={other} />
          {blocks.map((b, i) => (
            <path key={b.id} className="block" {...blockProps(b, i)} onClick={(e) => toggleAt(b.id, e)} {...hoverProps(b.id)} />
          ))}
          {blocks.map((b, i) => (
            <path key={b.id} className="block-hover" {...blockProps(b, i)} />
          ))}
          {blocks.map((b, i) => (
            <path
              key={b.id}
              ref={(el) => {
                if (el) lines.current.set(b.id, el);
              }}
              className="block-line"
              {...blockProps(b, i)}
            />
          ))}
        </g>
      </svg>
      {blocks.map((b, i) => (
        <button
          key={b.id}
          ref={(el) => {
            if (el) pills.current.set(b.id, el);
          }}
          className="region-pill"
          aria-pressed={selection.includes(b.id)}
          data-hover={hovered === b.id || undefined}
          style={{ left: `${((b.label[0] - view.x) / view.w) * 100}%`, top: `${((b.label[1] - view.y) / view.h) * 100}%`, '--line': b.def.color, '--i': i } as React.CSSProperties}
          onClick={(e) => toggleAt(b.id, e)}
          {...hoverProps(b.id)}
        >
          <Badge region={b.def} />
          <span>{b.def.name}</span>
        </button>
      ))}
    </div>
  );
}
