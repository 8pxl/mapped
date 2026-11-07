import { geoDistance, geoGraticule10, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
import { select, type Selection } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { COLOUR_OF, ISLANDS, LAND, PALETTE, SHAPES, SHAPES_LOW, type Country, type Shape } from './data';
import { fitTarget, fittedProjection, type RegionDef } from './regions';
import { islandZones, zonePath, type Site } from './zones';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Countries smaller than this share of the map's width get a round marker so they can still be clicked. */
const TINY_SHARE = 0.0065;

export type Paint = 'c1' | 'c2' | 'c3' | 'missed';

export interface PickEvent {
  shape: Shape;
  active: boolean;
  /** Point clicked, in map (pre-zoom) coordinates. */
  at: [number, number];
}

export interface ClientPoint {
  clientX: number;
  clientY: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Marker {
  el: SVGGElement;
  at: [number, number];
  size: number;
}

interface Fx {
  el: SVGGElement;
  at: [number, number];
}

export class MapView {
  readonly svg: SVGSVGElement;
  onPick: (e: PickEvent) => void = () => {};
  onHover: (shape: Shape | null, active: boolean, at: ClientPoint) => void = () => {};
  /** Space covered by overlays (px), kept clear when fitting the map. */
  insets: () => Insets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });

  private region: RegionDef | null = null;
  private active = new Set<string>();
  private pointsOnly: Country[] = [];
  private paints = new Map<string, Paint>();
  private paths = new Map<string, SVGPathElement>();
  private markers = new Map<string, Marker>();
  private centroids = new Map<string, [number, number]>();
  private bounds = new Map<string, [[number, number], [number, number]]>();
  private fx: Fx[] = [];
  private path!: GeoPath;
  private width = 0;
  private height = 0;
  private transform: ZoomTransform = zoomIdentity;
  private zoomer: ZoomBehavior<SVGSVGElement, unknown>;
  private sel: Selection<SVGSVGElement, unknown, null, undefined>;
  private zoomLayer!: SVGGElement;
  private markerLayer!: SVGGElement;
  private fxLayer!: SVGGElement;
  private paintLayer!: SVGGElement;
  private zoneLayer!: SVGGElement;
  private zones = new Map<string, SVGPathElement>();
  private projection!: GeoProjection;
  private hoverOutline!: SVGPathElement;
  private defs!: SVGDefsElement;
  private revealed: string | null = null;
  private beacon: Fx | null = null;
  /** Last mouse position over the map, so hover and Space can follow content moving under a still cursor. */
  private pointer: ClientPoint | null = null;
  private repoll = 0;
  private hovered: string | null = null;
  private frame = 0;
  private resizer: ResizeObserver;
  /** The starting view; zoomed in on tall screens so wide maps aren't a thin strip. */
  private home: ZoomTransform = zoomIdentity;
  private patterns: SVGPatternElement[] = [];
  private patternK = 0;
  private tiny = 9;
  private markerR = 5.5;

  constructor(private host: HTMLElement) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.classList.add('map');
    host.append(this.svg);
    this.sel = select(this.svg);
    this.zoomer = zoom<SVGSVGElement, unknown>()
      .clickDistance(6)
      // Wheel and trackpad gestures are handled in handleWheel instead.
      .filter((e) => e.type !== 'wheel' && !e.ctrlKey && !e.button)
      .on('zoom', (e) => this.applyTransform(e.transform));

    this.svg.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    this.svg.addEventListener('click', (e) => this.handleClick(e));
    this.svg.addEventListener('pointermove', (e) => this.handleHover(e));
    this.svg.addEventListener('pointerleave', (e) => {
      this.pointer = null;
      this.setHover(null, e);
    });

    let pending = 0;
    this.resizer = new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        if (this.region && (host.clientWidth !== this.width || host.clientHeight !== this.height)) this.render();
      });
    });
    this.resizer.observe(host);
  }

  /** Stops watching the host's size and removes the map, for when its screen goes away. */
  destroy() {
    this.resizer.disconnect();
    cancelAnimationFrame(this.frame);
    this.svg.remove();
  }

  show(region: RegionDef, active: Set<string>, pointsOnly: Country[]) {
    this.region = region;
    this.active = active;
    this.pointsOnly = pointsOnly;
    this.paints.clear();
    this.revealed = null;
    this.render();
  }

  paint(code: string, paint: Paint) {
    this.paints.set(code, paint);
    this.applyPaint(code);
  }

  flash(code: string) {
    for (const el of this.elementsFor(code)) {
      el.classList.remove('flash');
      void el.getBoundingClientRect();
      el.classList.add('flash');
    }
  }

  /** Keeps a country blinking under a pulsing beacon until clearReveal(), bringing it into view if needed. */
  reveal(code: string) {
    this.clearReveal();
    this.revealed = code;
    this.placeReveal();
    const at = this.centroids.get(code);
    if (!at) return;
    const [x, y] = this.transform.apply(at);
    const margin = 40;
    if (x < margin || y < margin || x > this.width - margin || y > this.height - margin) this.focus(code);
  }

  clearReveal() {
    if (!this.revealed) return;
    for (const el of this.elementsFor(this.revealed)) el.classList.remove('reveal');
    this.removeFx(this.beacon);
    this.beacon = null;
    this.revealed = null;
  }

  private placeReveal() {
    const code = this.revealed!;
    for (const el of this.elementsFor(code)) el.classList.add('reveal');
    const at = this.centroids.get(code);
    if (at) this.beacon = this.addFx(at, beaconFx());
  }

  /** Drops a station badge in the country's own colour (white when it was missed). */
  stamp(at: [number, number], code: string, paint: Paint) {
    this.addFx(at, stampFx(paint === 'missed' ? 'var(--missed)' : colourOf(code), code.toUpperCase()), 1500);
  }

  miss(at: [number, number]) {
    this.addFx(at, crossFx(), 900);
  }

  zoomBy(factor: number) {
    this.sel.transition().duration(300).call(this.zoomer.scaleBy, factor);
  }

  resetZoom() {
    this.sel.transition().duration(500).call(this.zoomer.transform, this.home);
  }

  /** Zooms so a country fills a comfortable share of the view. */
  focus(code: string) {
    const b = this.bounds.get(code);
    if (!b) return;
    const [[x0, y0], [x1, y1]] = b;
    const k = Math.min(8, 0.5 / Math.max((x1 - x0) / this.width, (y1 - y0) / this.height));
    const scale = Math.max(1, Math.min(k, this.transform.k));
    const t = zoomIdentity
      .translate(this.width / 2, this.height / 2)
      .scale(scale)
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    this.sel.transition().duration(650).call(this.zoomer.transform, t);
  }

  private render() {
    const region = this.region!;
    this.width = this.host.clientWidth;
    this.height = this.host.clientHeight;
    const { width: w, height: h } = this;
    const pad = Math.min(w, h) * 0.04;
    this.tiny = Math.max(3, Math.min(9, w * TINY_SHARE));
    this.markerR = w < 600 ? 4 : 5.5;
    const inset = this.insets();
    const projection = region
      .projection()
      .fitExtent([[inset.left + pad, inset.top + pad], [w - inset.right - pad, h - inset.bottom - pad]], fitTarget(region));
    this.path = geoPath(projection);
    this.projection = projection;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.replaceChildren();
    this.paths.clear();
    this.zones.clear();
    this.markers.clear();
    this.centroids.clear();
    this.bounds.clear();
    this.fx = [];

    this.svg.insertAdjacentHTML('afterbegin', defs());
    this.patterns = [...this.svg.querySelectorAll<SVGPatternElement>('pattern.scaled')];
    this.patternK = 0;
    const zoomLayer = el('g', { class: 'zoom-layer' });
    zoomLayer.append(
      el('path', { class: 'sea', d: this.path({ type: 'Sphere' }) ?? '' }),
      el('path', { class: 'sea-dots', d: this.path({ type: 'Sphere' }) ?? '' }),
      el('path', { class: 'graticule', d: this.path(geoGraticule10()) ?? '' }),
    );
    this.zoneLayer = el('g', { class: 'zones' });
    zoomLayer.append(this.zoneLayer);
    const countries = el('g', { class: 'countries' });
    const tiny: Shape[] = [];
    for (const shape of SHAPES) {
      if (!shape.feature.geometry) continue;
      const d = this.path(shape.feature);
      if (!d) continue;
      const isActive = !!shape.code && this.active.has(shape.code);
      const p = el<SVGPathElement>('path', { class: `land ${isActive ? 'active' : 'inactive'}`, d, 'data-key': shape.key });
      countries.append(p);
      if (!shape.code) continue;
      this.paths.set(shape.code, p);
      this.bounds.set(shape.code, this.path.bounds(shape.feature as Feature));
      this.centroids.set(shape.code, this.path.centroid(largestPart(shape.feature as Feature)));
      if (isActive && sizeOf(this.bounds.get(shape.code)!) < this.tiny) tiny.push(shape);
    }
    this.paintLayer = el('g', { class: 'paints' });
    this.hoverOutline = el<SVGPathElement>('path', { class: 'hover-outline' });
    zoomLayer.append(
      countries,
      el('path', { class: 'coast', d: this.path(LAND) ?? '' }),
      this.paintLayer,
      this.hoverOutline,
      el('path', { class: 'rim', d: this.path({ type: 'Sphere' }) ?? '' }),
    );
    this.defs = this.svg.querySelector('defs')!;
    this.zoomLayer = zoomLayer;

    this.markerLayer = el('g', { class: 'markers' });
    for (const shape of tiny) this.addMarker(shape.code!, shape.key, this.centroids.get(shape.code!)!, sizeOf(this.bounds.get(shape.code!)!));
    for (const c of this.pointsOnly) {
      const at = projection([c.latlng[1], c.latlng[0]]);
      if (!at) continue;
      this.centroids.set(c.code, at);
      this.bounds.set(c.code, [at, at]);
      this.addMarker(c.code, c.code, at, 0);
    }
    this.buildZones(projection, w, h);
    this.fxLayer = el('g', { class: 'fx' });
    this.svg.append(zoomLayer, this.markerLayer, this.fxLayer);

    for (const code of this.paints.keys()) this.applyPaint(code);
    if (this.revealed) this.placeReveal();

    const maxK = region.id === 'world' ? 48 : 24;
    this.zoomer
      .scaleExtent([1, maxK])
      .translateExtent([[-inset.left, -inset.top], [w + inset.right, h + inset.bottom]])
      .extent([[0, 0], [w, h]]);
    this.sel.call(this.zoomer).on('dblclick.zoom', null);
    this.home = this.homeView(region, inset, w, h);
    this.sel.call(this.zoomer.transform, this.home);
  }

  /**
   * Gives small island countries a larger click zone around their islands (see zones.ts). Coastline points of every
   * visible shape take part, so a zone stops halfway to the next coast, including coasts that aren't in the quiz.
   */
  private buildZones(projection: GeoProjection, w: number, h: number) {
    const pad = Math.max(14, w * 0.022);
    const zonedBelow = w * 0.03;
    const clip = projection.clipAngle();
    const [lon, lat] = projection.rotate();
    // Azimuthal views hide the far hemisphere; points there would project onto the visible disc.
    // An unclipped projection reports a clip angle of 0.
    const visible = (p: [number, number]) => !clip || geoDistance(p, [-lon, -lat]) < (clip * Math.PI) / 180 - 0.01;
    const inView = ([x, y]: [number, number]) => x > -w && x < 2 * w && y > -h && y < 2 * h;
    const sites: Site[] = [];
    for (const shape of SHAPES) {
      const g = shape.feature.geometry;
      if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
      const code = shape.code && this.active.has(shape.code) ? shape.code : null;
      const zoned = !!code && ISLANDS.has(code) && sizeOf(this.path.bounds(largestPart(shape.feature as Feature))) < zonedBelow;
      for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
        const ring = poly[0];
        const step = Math.max(1, Math.ceil(ring.length / 30));
        const pts: [number, number][] = [];
        for (let i = 0; i < ring.length; i += step) {
          const lonlat = ring[i] as [number, number];
          const p = visible(lonlat) ? projection(lonlat) : null;
          if (p && inView(p)) pts.push(p);
        }
        if (!pts.length) continue;
        const box = zoned ? padBox(pts, pad) : undefined;
        for (const at of pts) sites.push({ at, code, box });
      }
    }
    for (const c of this.pointsOnly) {
      const at = this.centroids.get(c.code);
      if (at) sites.push({ at, code: c.code, box: padBox([at], pad) });
    }
    for (const [code, zone] of islandZones(sites, w, h, sphereOutline(this.path))) {
      const p = el<SVGPathElement>('path', { class: 'zone', d: zonePath(zone), 'data-key': code });
      this.zoneLayer.append(p);
      this.zones.set(code, p);
    }
  }

  /**
   * Draws an arrow from a wrong click toward the right country.
   * Returns the great-circle distance and a compass direction for the toast.
   */
  pointToward(at: [number, number], code: string) {
    const target = this.centroids.get(code);
    if (!target) return null;
    const [x0, y0] = this.transform.apply(at);
    const [x1, y1] = this.transform.apply(target);
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const from = this.projection.invert?.(at);
    const to = this.projection.invert?.(target);
    const km = from && to ? Math.round((geoDistance(from, to) * 6371) / 10) * 10 : null;
    const dir = COMPASS[Math.round(((-angle * 180) / Math.PI + 360) / 45) % 8];
    this.addFx(at, arrowFx(angle, km ? `${km.toLocaleString()} km` : ''), 1700);
    return { km, dir };
  }

  /**
   * On a screen much taller than the map (a phone in portrait), start zoomed so the map fills the height,
   * centred on it; the rest is a swipe away. Otherwise show it all.
   */
  private homeView(region: RegionDef, inset: Insets, w: number, h: number) {
    const [[x0, y0], [x1, y1]] = this.path.bounds(fitTarget(region));
    const freeH = h - inset.top - inset.bottom;
    // Only on tall screens: a wide, short map (like a mix spanning the Pacific) on a desktop must stay whole.
    if (freeH <= w - inset.left - inset.right) return zoomIdentity;
    const fill = (freeH * 0.92) / (y1 - y0);
    if (fill < 1.3) return zoomIdentity;
    const k = Math.min(fill, 2.6);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    return zoomIdentity
      .translate(w / 2, inset.top + freeH / 2)
      .scale(k)
      .translate(-cx, -cy);
  }

  private addMarker(code: string, key: string, at: [number, number], size: number) {
    const g = el('g', { class: 'marker', 'data-key': key });
    // Fingers need a bigger target than a cursor.
    const reach = matchMedia('(pointer: coarse)').matches ? 13 : 6;
    g.append(el('circle', { class: 'hit', r: String(this.markerR + reach) }), el('circle', { class: 'dot', r: String(this.markerR) }));
    this.markerLayer.append(g);
    this.markers.set(code, { el: g, at, size });
  }

  /**
   * Records the new transform at once (clicks and effects read it) but writes the DOM at most once per frame:
   * trackpads fire wheel events faster than the display refreshes.
   */
  private applyTransform(t: ZoomTransform) {
    this.transform = t;
    if (!this.frame) this.frame = requestAnimationFrame(() => this.drawTransform());
  }

  private drawTransform() {
    this.frame = 0;
    const t = this.transform;
    this.zoomLayer.setAttribute('transform', t.toString());
    // Patterns only need rescaling when the zoom level changes, not on every pan.
    if (t.k !== this.patternK) {
      this.patternK = t.k;
      const inv = `scale(${1 / t.k})`;
      for (const p of this.patterns) p.setAttribute('patternTransform', `${inv} ${p.dataset.turn ? `rotate(${p.dataset.turn})` : ''}`);
    }
    for (const m of this.markers.values()) {
      const [x, y] = t.apply(m.at);
      m.el.setAttribute('transform', `translate(${x},${y})`);
      m.el.classList.toggle('hidden', m.size * t.k > 20);
    }
    for (const f of this.fx) {
      const [x, y] = t.apply(f.at);
      f.el.setAttribute('transform', `translate(${x},${y})`);
    }
    // Panning or zooming moves countries under a still cursor; re-check what it is over.
    if (this.pointer && !this.repoll) {
      this.repoll = requestAnimationFrame(() => {
        this.repoll = 0;
        if (this.pointer) this.setHover(this.shapeUnderPointer(), this.pointer);
      });
    }
  }

  private shapeUnderPointer(): Shape | null {
    if (!this.pointer) return null;
    const hit = document.elementFromPoint(this.pointer.clientX, this.pointer.clientY);
    return hit && this.svg.contains(hit) ? this.shapeAt(hit) : null;
  }

  /** Picks whatever is under the cursor, as if it were clicked. Returns false when the cursor is off the map. */
  pickAtPointer() {
    const shape = this.shapeUnderPointer();
    if (!shape || !this.pointer) return false;
    this.pick(shape, this.pointer);
    return true;
  }

  /** Pins an effect to a map point. Without a lifetime it stays until removeFx. */
  private addFx(at: [number, number], inner: SVGElement, life?: number) {
    const g = el('g', {});
    g.append(inner);
    const [x, y] = this.transform.apply(at);
    g.setAttribute('transform', `translate(${x},${y})`);
    this.fxLayer.append(g);
    const fx = { el: g, at };
    this.fx.push(fx);
    if (life) setTimeout(() => this.removeFx(fx), life);
    return fx;
  }

  private removeFx(fx: Fx | null) {
    if (!fx) return;
    fx.el.remove();
    this.fx = this.fx.filter((f) => f !== fx);
  }

  private handleWheel(e: WheelEvent) {
    if (!this.region) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1;
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinches arrive as ctrl+wheel; ⌘/Ctrl + mouse wheel zooms too.
      const rect = this.svg.getBoundingClientRect();
      const factor = Math.pow(2, -e.deltaY * unit * (e.ctrlKey ? 0.02 : 0.002));
      this.zoomer.scaleBy(this.sel, factor, [e.clientX - rect.left, e.clientY - rect.top]);
    } else {
      // Two-finger trackpad drags (and plain mouse wheels) pan.
      const k = this.transform.k;
      this.zoomer.translateBy(this.sel, (-e.deltaX * unit) / k, (-e.deltaY * unit) / k);
    }
  }

  private elementsFor(code: string): Element[] {
    return [this.paths.get(code), this.markers.get(code)?.el, this.zones.get(code)].filter((e): e is SVGPathElement | SVGGElement => !!e);
  }

  /**
   * Hatches a found country in its own colour and traces its border. The outcome shows in the border style:
   * solid for first try, dashed for retries; misses are white crosshatching (see style.css).
   */
  private applyPaint(code: string) {
    const paint = this.paints.get(code);
    const colour = colourOf(code);
    for (const e of this.elementsFor(code)) {
      e.classList.remove('p-c1', 'p-c2', 'p-c3', 'p-missed');
      (e as SVGElement).style.removeProperty('--fill');
      if (!paint) continue;
      e.classList.add(`p-${paint}`);
      if (paint === 'missed') continue;
      (e as SVGElement).style.setProperty('--fill', colour);
      (e as SVGElement).style.setProperty('--hatch', `url(#hatch-${PALETTE.indexOf(colour)})`);
    }
    this.defs.querySelector(`#clip-${code}`)?.remove();
    this.defs.querySelector(`#outline-${code}`)?.remove();
    this.paintLayer.querySelector(`[data-ring="${code}"]`)?.remove();
    const d = this.paths.get(code)?.getAttribute('d');
    if (!paint || !d) return;
    // One copy of the outline in <defs>; the clip and every paint layer reference it.
    const ref = { href: `#outline-${code}` };
    const clip = el('clipPath', { id: `clip-${code}` });
    clip.append(el('use', ref));
    // The attribute (not CSS) keeps strokes a fixed screen width: <use> copies carry it, but CSS rules don't reach them.
    this.defs.append(el('path', { id: `outline-${code}`, d, 'vector-effect': 'non-scaling-stroke' }), clip);
    // The border, clipped to the inside so neighbouring borders sit side by side instead of overlapping.
    const g = el('g', { class: `paint p-${paint}`, 'clip-path': `url(#clip-${code})`, 'data-ring': code });
    g.append(el('use', { ...ref, class: 'edge' }));
    if (paint !== 'missed') g.style.setProperty('--fill', colour);
    this.paintLayer.append(g);
  }

  private shapeAt(target: EventTarget | null): Shape | null {
    const key = (target as Element | null)?.closest?.('[data-key]')?.getAttribute('data-key');
    if (!key) return null;
    return SHAPES.find((s) => s.key === key) ?? pointShape(this.pointsOnly.find((c) => c.code === key));
  }

  private handleClick(e: MouseEvent) {
    const shape = this.shapeAt(e.target);
    if (shape) this.pick(shape, e);
  }

  private pick(shape: Shape, p: ClientPoint) {
    const rect = this.svg.getBoundingClientRect();
    const at = this.transform.invert([p.clientX - rect.left, p.clientY - rect.top]);
    this.onPick({ shape, active: !!shape.code && this.active.has(shape.code), at });
  }

  private handleHover(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    this.pointer = { clientX: e.clientX, clientY: e.clientY };
    this.setHover(this.shapeAt(e.target), e);
  }

  private setHover(shape: Shape | null, e: ClientPoint) {
    const key = shape?.code ?? shape?.key ?? null;
    if (key !== this.hovered) {
      if (this.hovered) this.elementsFor(this.hovered).forEach((x) => x.classList.remove('hover'));
      this.hovered = key;
      const isActive = !!key && !!shape?.code && this.active.has(key);
      if (isActive) this.elementsFor(key).forEach((x) => x.classList.add('hover'));
      // Outline the hovered country above its neighbours' borders so even small ones stand out.
      const d = isActive ? this.paths.get(key)?.getAttribute('d') : null;
      if (d) this.hoverOutline.setAttribute('d', d);
      else this.hoverOutline.removeAttribute('d');
    }
    this.onHover(shape, !!shape?.code && this.active.has(shape.code), e);
  }
}

const pointShape = (c: Country | undefined): Shape | null =>
  c ? { key: c.code, name: c.name, code: c.code, feature: { type: 'Feature', geometry: null, properties: {} } } : null;

function el<T extends SVGElement = SVGGElement>(tag: string, attrs: Record<string, string>) {
  const e = document.createElementNS(SVG_NS, tag) as T;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** The projected outline of the globe as one ring, for trimming shapes to the map's edge. */
function sphereOutline(path: GeoPath): [number, number][] | undefined {
  const ring: [number, number][] = [];
  const collect = {
    moveTo: (x: number, y: number) => ring.push([x, y]),
    lineTo: (x: number, y: number) => ring.push([x, y]),
    closePath: () => {},
    arc: () => {},
  };
  geoPath(path.projection(), collect as never)({ type: 'Sphere' });
  return ring.length > 2 ? ring : undefined;
}

const COMPASS = ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'];

function padBox(pts: [number, number][], pad: number): [[number, number], [number, number]] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [[x0 - pad, y0 - pad], [x1 + pad, y1 + pad]];
}

/** An arrow pointing from a wrong click toward the answer, with the distance written past its tip. */
function arrowFx(angle: number, label: string) {
  const g = el('g', { class: 'hint' });
  const arrow = el('g', { class: 'hint-arrow', transform: `rotate(${(angle * 180) / Math.PI})` });
  arrow.append(el('path', { d: 'M16 0H52M44-7L53 0 44 7' }));
  g.append(arrow);
  if (label) {
    const t = el('text', { class: 'hint-label', x: String(Math.cos(angle) * 74), y: String(Math.sin(angle) * 74 + 4), 'text-anchor': 'middle' });
    t.textContent = label;
    g.append(t);
  }
  return g;
}

const sizeOf = ([[x0, y0], [x1, y1]]: [[number, number], [number, number]]) => Math.max(x1 - x0, y1 - y0);

/** The biggest polygon of a country, so markers land on the mainland rather than between islands. */
function largestPart(f: Feature): Feature {
  const g = f.geometry as Polygon | MultiPolygon;
  if (g.type !== 'MultiPolygon') return f;
  const area = (ring: number[][]) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    return Math.abs(a);
  };
  const best = g.coordinates.reduce((a, b) => (area(b[0]) > area(a[0]) ? b : a));
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: best } };
}

const colourOf = (code: string) => COLOUR_OF.get(code) ?? '#fff';

/** A transit-style station badge: a bold disc carrying the country code. */
function stampFx(colour: string, label: string) {
  const g = el('g', { class: 'stamp' });
  g.style.setProperty('--tone', colour);
  g.append(el('circle', { class: 'stamp-halo', r: '16' }), el('circle', { class: 'stamp-disc', r: '16' }));
  const t = el('text', { class: 'stamp-text', 'text-anchor': 'middle', y: '5' });
  t.textContent = label;
  g.append(t);
  return g;
}

function crossFx() {
  const g = el('g', { class: 'cross' });
  g.append(el('circle', { r: '11' }), el('path', { d: 'M-4.5-4.5L4.5 4.5M4.5-4.5L-4.5 4.5' }));
  return g;
}

function beaconFx() {
  const g = el('g', { class: 'beacon' });
  g.append(el('circle', { class: 'beacon-ring', r: '12' }), el('circle', { class: 'beacon-ring late', r: '12' }), el('circle', { class: 'beacon-core', r: '4' }));
  return g;
}

const defs = () => `<defs>
  <pattern id="stipple" class="scaled" width="7" height="7" patternUnits="userSpaceOnUse">
    <circle cx="3.5" cy="3.5" r="0.75" fill="#fff" fill-opacity="0.17"/>
  </pattern>
  <pattern id="hatch" class="scaled" data-turn="45" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="6" height="6" style="fill: var(--land)"/>
    <path d="M0 0V6M0 0H6" style="stroke: var(--missed); stroke-width: 1.4; stroke-opacity: 0.7"/>
  </pattern>
  ${PALETTE.map(
    (c, i) => `<pattern id="hatch-${i}" class="scaled" data-turn="45" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="5" height="5" style="fill: var(--land)"/>
    <rect width="5" height="5" fill="${c}" fill-opacity="0.12"/>
    <path d="M0 0V5" stroke="${c}" stroke-width="1.5" stroke-opacity="0.9"/>
  </pattern>`,
  ).join('')}
</defs>`;

/** A small static map of a region for the menu cards. */
export function thumbnail(region: RegionDef, active: Set<string>, w: number, h: number) {
  const path = geoPath(fittedProjection(region, w, h, 4));
  const parts = SHAPES_LOW.map((s) => {
    const d = s.feature.geometry ? path(s.feature) : null;
    if (!d) return '';
    return s.code && active.has(s.code) ? `<path d="${d}" class="on" style="--c: ${colourOf(s.code)}"/>` : `<path d="${d}" class="off"/>`;
  });
  return `<svg class="thumb" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path class="thumb-sea" d="${path({ type: 'Sphere' })}"/>${parts.join('')}</svg>`;
}
