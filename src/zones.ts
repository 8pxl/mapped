import { Delaunay } from 'd3-delaunay';
import polygonClipping, { type Polygon as ClipPolygon } from 'polygon-clipping';

type Point = [number, number];
type Box = [Point, Point];

/** A point sampled from a coastline, in projected (pre-zoom) map coordinates. */
export interface Site {
  at: Point;
  /** The quizzable country it belongs to, or null for land that only claims its share of the sea. */
  code: string | null;
  /** Set for sites of zoned countries: the padded box around their island that the zone may not leave. */
  box?: Box;
}

/**
 * Seterra-style click zones for small island countries.
 *
 * Every coastline point claims the sea closest to it (a Voronoi cell). A zoned country's zone is the union of its
 * points' cells, each kept inside a padded box around its own island, so zones hug their archipelagos and never
 * overlap each other or reach past the halfway line to a neighbour's coast.
 */
export function islandZones(sites: Site[], width: number, height: number, outline?: Point[]) {
  const zones = new Map<string, Point[][][]>();
  if (sites.length < 2) return zones;
  const voronoi = Delaunay.from(sites.map((s) => s.at)).voronoi([-width, -height, width * 2, height * 2]);
  const cellsByCode = new Map<string, ClipPolygon[]>();
  sites.forEach((site, i) => {
    if (!site.code || !site.box) return;
    const cell = voronoi.cellPolygon(i) as Point[] | null;
    if (!cell) return;
    const clipped = clipToBox(cell, site.box);
    if (clipped.length < 3) return;
    cellsByCode.set(site.code, [...(cellsByCode.get(site.code) ?? []), [clipped]]);
  });
  for (const [code, cells] of cellsByCode) {
    const [first, ...rest] = cells;
    let zone = polygonClipping.union(first, ...rest);
    // Keep zones on the globe: never past the map's outer edge.
    if (outline) zone = polygonClipping.intersection(zone, [outline]);
    if (zone.length) zones.set(code, zone as Point[][][]);
  }
  return zones;
}

export const zonePath = (zone: Point[][][]) =>
  zone.map((poly) => poly.map((ring) => `M${ring.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`).join('')).join('');

/** Sutherland–Hodgman clip of a convex cell against an axis-aligned box. */
function clipToBox(poly: Point[], [[x0, y0], [x1, y1]]: Box): Point[] {
  const edges: [(p: Point) => boolean, (a: Point, b: Point) => Point][] = [
    [(p) => p[0] >= x0, (a, b) => lerpX(a, b, x0)],
    [(p) => p[0] <= x1, (a, b) => lerpX(a, b, x1)],
    [(p) => p[1] >= y0, (a, b) => lerpY(a, b, y0)],
    [(p) => p[1] <= y1, (a, b) => lerpY(a, b, y1)],
  ];
  let out = poly;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

const lerpX = (a: Point, b: Point, x: number): Point => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
const lerpY = (a: Point, b: Point, y: number): Point => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
