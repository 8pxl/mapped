import { geoArea, geoDistance } from 'd3-geo';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import polygonClipping, { type Polygon as ClipPolygon } from 'polygon-clipping';
import { countryByCode, SHAPES_LOW } from './data';
import { CONTINENTS, type ContinentId } from './regions';

type Point = [number, number];

/** Russia west of the Urals (roughly 60°E) is drawn as part of Europe; the rest belongs to Asia. */
const EUROPEAN_RUSSIA: ClipPolygon = [
  [
    [0, 30],
    [60, 30],
    [60, 85],
    [0, 85],
    [0, 30],
  ],
];

/** Polygons this far (radians, about 34°) from their country's centre are overseas parts, like French Guiana. */
const OVERSEAS = 0.6;

export interface Blocks {
  continents: Map<ContinentId, Feature<MultiPolygon>>;
  /** Land in no quiz: Greenland, Antarctica, Western Sahara and the like. */
  other: Feature[];
}

let cache: Blocks | null = null;

/**
 * One merged shape per continent for the menu map, from the coarse atlas. Each country polygon joins its home
 * continent, except overseas parts (assigned to the continent they sit in) and Russia (split at the Urals).
 */
export function continentBlocks(): Blocks {
  if (cache) return cache;
  const parts = new Map<ContinentId, ClipPolygon[]>();
  const add = (id: ContinentId, poly: ClipPolygon) => parts.set(id, [...(parts.get(id) ?? []), poly]);
  const other: Feature[] = [];

  for (const shape of SHAPES_LOW) {
    const g = shape.feature.geometry;
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
    if (!shape.code) {
      other.push(shape.feature as Feature);
      continue;
    }
    const country = countryByCode.get(shape.code)!;
    const home = country.regions[0] as ContinentId;
    for (const raw of (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as ClipPolygon[]) {
      const poly = unwrap(raw);
      if (shape.code === 'ru') {
        for (const p of polygonClipping.intersection(poly, EUROPEAN_RUSSIA)) add('europe', p);
        for (const p of polygonClipping.difference(poly, EUROPEAN_RUSSIA)) add('asia', p);
        continue;
      }
      const centre = ringCentre(poly[0] as Point[]);
      const far = geoDistance(centre, [country.latlng[1], country.latlng[0]]) > OVERSEAS;
      const where = far ? CONTINENTS.find((c) => c.boxes!.some((b) => inBox(centre, b)))?.id : null;
      add((where as ContinentId | undefined) ?? home, poly);
    }
  }

  const continents = new Map<ContinentId, Feature<MultiPolygon>>();
  for (const [id, polys] of parts) {
    const [first, ...rest] = polys;
    const merged = polygonClipping.union(first, ...rest);
    continents.set(id, { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: merged.map(forD3) } });
  }
  cache = { continents, other };
  return cache;
}

/**
 * polygon-clipping returns GeoJSON winding (counter-clockwise outer rings); d3-geo reads that as "everything but
 * this shape". Reverse rings, and check by area in case a polygon still comes out inside-out.
 */
function forD3(poly: Point[][]): Point[][] {
  const flipped = poly.map((ring) => [...ring].reverse());
  const area = geoArea({ type: 'Polygon', coordinates: flipped } as Polygon);
  return area > 2 * Math.PI ? poly : flipped;
}

/**
 * Polygons crossing the antimeridian (Fiji, eastern Russia) jump from +180° to -180° mid-ring. Planar clipping reads
 * that as a band around the whole world, so shift the western half past 180° to keep each ring continuous.
 */
function unwrap(poly: ClipPolygon): ClipPolygon {
  const lons = poly[0].map((p) => p[0]);
  if (Math.max(...lons) - Math.min(...lons) <= 180) return poly;
  return poly.map((ring) => ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat] as Point));
}

function ringCentre(ring: Point[]): Point {
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}

const inBox = ([lon, lat]: Point, [[lon0, lat0], [lon1, lat1]]: [Point, Point]) => {
  const l = lon < lon0 ? lon + 360 : lon;
  return l >= lon0 && l <= lon1 && lat >= lat0 && lat <= lat1;
};
