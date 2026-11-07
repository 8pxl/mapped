import { geoGraticule10, geoNaturalEarth1, geoPath } from 'd3-geo';
import { useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { continentBlocks } from '../blocks';
import { CONTINENTS, type ContinentId, type RegionDef } from '../regions';
import { Badge } from './shared';

const W = 1000;
const H = 510;
/** The visible slice of the map: Antarctica, which no quiz includes, is cropped off the bottom. */
const VIEW = { y: 2, h: 452 };
// The --ease-out and --ease-in-out tokens from style.css, for WAAPI.
const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';

interface BlockGeo {
  def: RegionDef;
  id: ContinentId;
  d: string;
  bounds: [[number, number], [number, number]];
  label: [number, number];
}

let geoCache: { blocks: BlockGeo[]; other: string; sphere: string; graticule: string } | null = null;

function pickerGeo() {
  if (geoCache) return geoCache;
  const projection = geoNaturalEarth1().rotate([-11, 0]).fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
  const path = geoPath(projection);
  const { continents, other } = continentBlocks();
  geoCache = {
    blocks: CONTINENTS.map((def) => {
      const f = continents.get(def.id as ContinentId)!;
      return { def, id: def.id as ContinentId, d: path(f) ?? '', bounds: path.bounds(f), label: projection(def.label!)! };
    }),
    other: other.map((f) => path(f) ?? '').join(''),
    sphere: path({ type: 'Sphere' }) ?? '',
    graticule: path(geoGraticule10()) ?? '',
  };
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
  const { blocks, other, sphere, graticule } = pickerGeo();
  const fills = useRef(new Map<ContinentId, SVGPathElement>());
  const zoomLayer = useRef<SVGGElement>(null);
  /** Where each pending change should pour from, and whether it animates. */
  const origins = useRef(new Map<ContinentId, { at: [number, number]; animate: boolean }>());
  const shown = useRef<Set<ContinentId> | null>(null);
  const intro = useRef(!introPlayed);

  // Selected continents fill with their colour through a circular mask that grows from the click point.
  useLayoutEffect(() => {
    const now = new Set(selection);
    if (!shown.current) {
      // First paint: set the masks without animating.
      for (const b of blocks) setMask(b, now.has(b.id));
      shown.current = now;
      introPlayed = true;
      return;
    }
    const changed = blocks.filter((b) => shown.current!.has(b.id) !== now.has(b.id));
    changed.forEach((b, i) => {
      const origin = origins.current.get(b.id) ?? { at: b.label, animate: true };
      pour(b, now.has(b.id), origin.at, origin.animate, changed.length > 1 ? i * 45 : 0);
    });
    origins.current.clear();
    shown.current = now;
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  const radiusFrom = (b: BlockGeo, [x, y]: [number, number]) => {
    const [[x0, y0], [x1, y1]] = b.bounds;
    return Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([cx, cy]) => Math.hypot(cx - x, cy - y))) + 4;
  };

  /**
   * The fill is clipped by a CSS circle in the path's own box (fill-box, in map units). Animating an SVG <clipPath>
   * child doesn't repaint reliably, so the circle lives in `clip-path` on the fill itself.
   */
  const circle = (b: BlockGeo, r: number, [x, y]: [number, number]) => `circle(${r}px at ${x - b.bounds[0][0]}px ${y - b.bounds[0][1]}px)`;

  function setMask(b: BlockGeo, on: boolean) {
    const fill = fills.current.get(b.id)!;
    fill.style.clipPath = on ? 'none' : 'circle(0px at 50% 50%)';
  }

  /** The circle's current radius, so an interrupted pour carries on from where it got to. */
  const currentRadius = (fill: SVGPathElement) => {
    const m = /circle\(([\d.]+)px/.exec(getComputedStyle(fill).clipPath);
    return m ? parseFloat(m[1]) : getComputedStyle(fill).clipPath === 'none' ? Infinity : 0;
  };

  function pour(b: BlockGeo, on: boolean, at: [number, number], animate: boolean, delay: number) {
    const fill = fills.current.get(b.id)!;
    const full = radiusFrom(b, at);
    const from = Math.min(currentRadius(fill), full);
    for (const a of fill.getAnimations()) a.cancel();
    if (!animate || reducedMotion()) {
      // Keyboard and reduced motion: a short fade, no movement.
      fill.style.clipPath = 'none';
      fill.animate([{ opacity: on ? 0 : 1 }, { opacity: on ? 1 : 0 }], { duration: 150, easing: 'ease' }).onfinish = () => setMask(b, on);
      if (on) setMask(b, true);
      return;
    }
    const to = on ? full : 0;
    const anim = fill.animate([{ clipPath: circle(b, from, at) }, { clipPath: circle(b, to, at) }], {
      duration: on ? 340 : 220,
      delay,
      easing: EASE_OUT,
      fill: 'backwards',
    });
    anim.onfinish = () => setMask(b, on);
    // Hold the end state underneath the animation.
    fill.style.clipPath = circle(b, to, at);
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
      const k = Math.min(3.2, 0.9 / Math.max((x1 - x0) / W, (y1 - y0) / VIEW.h));
      const tx = W / 2 - k * ((x0 + x1) / 2);
      const ty = VIEW.y + VIEW.h / 2 - k * ((y0 + y1) / 2);
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

  return (
    <div className={`picker-map${intro.current ? ' intro' : ''}`}>
      <svg viewBox={`0 ${VIEW.y} ${W} ${VIEW.h}`} aria-hidden="true">
        <defs>
          <pattern id="picker-dots" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3.5" r="0.8" fill="#fff" fillOpacity="0.16" />
          </pattern>
        </defs>
        <g ref={zoomLayer} className="picker-zoom">
          <path className="picker-sea" d={sphere} />
          <path className="picker-graticule" d={graticule} />
          <path className="picker-other" d={other} />
          {blocks.map((b, i) => (
            <g
              key={b.id}
              className="block"
              data-region={b.id}
              aria-pressed={selection.includes(b.id)}
              style={{ '--line': b.def.color, '--i': i } as React.CSSProperties}
              onClick={(e) => toggleAt(b.id, e)}
            >
              <path className="block-base" d={b.d} />
              <path
                ref={(el) => {
                  if (el) fills.current.set(b.id, el);
                }}
                className="block-fill"
                d={b.d}
              />
              <path className="block-edge" d={b.d} />
            </g>
          ))}
        </g>
      </svg>
      {blocks.map((b, i) => (
        <button
          key={b.id}
          className="region-pill"
          aria-pressed={selection.includes(b.id)}
          style={{ left: `${(b.label[0] / W) * 100}%`, top: `${((b.label[1] - VIEW.y) / VIEW.h) * 100}%`, '--line': b.def.color, '--i': i } as React.CSSProperties}
          onClick={(e) => toggleAt(b.id, e)}
        >
          <Badge region={b.def} />
          <span>{b.def.name}</span>
        </button>
      ))}
    </div>
  );
}
