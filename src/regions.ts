import { geoAzimuthalEqualArea, geoNaturalEarth1, type GeoProjection, type GeoPermissibleObjects } from 'd3-geo';

export type RegionId = 'world' | 'europe' | 'asia' | 'africa' | 'north-america' | 'south-america' | 'oceania';
/** The pickable building blocks: every region except the whole world. */
export type ContinentId = Exclude<RegionId, 'world'>;

type Box = [[number, number], [number, number]];

export interface RegionDef {
  /** Route and best-score key: a region id, or continents joined with "+". */
  id: string;
  name: string;
  tagline: string;
  /** Line number and colour, transit-map style. The colour may be a gradient for a mix of regions. */
  line: number;
  color: string;
  /** The continents this covers. */
  members: ContinentId[];
  projection: () => GeoProjection;
  /** Lon/lat boxes the view is fitted to; omitted means the whole sphere. Longitudes may run past 180. */
  boxes?: Box[];
  /** Where the region's name sits on the menu map. */
  label?: [number, number];
}

const azimuthal = (lon: number, lat: number) => () => geoAzimuthalEqualArea().rotate([-lon, -lat]).clipAngle(90);

export const CONTINENTS: RegionDef[] = [
  { id: 'europe', name: 'Europe', tagline: 'Microstates & old borders', line: 1, color: '#2f6fe8', members: ['europe'], projection: azimuthal(15, 53), boxes: [[[-25, 34], [45, 71]]], label: [16, 55] },
  { id: 'asia', name: 'Asia', tagline: 'From the Levant to Japan', line: 2, color: '#ee352e', members: ['asia'], projection: azimuthal(88, 30), boxes: [[[26, -11], [146, 55]]], label: [96, 44] },
  { id: 'africa', name: 'Africa', tagline: 'Fifty-four nations', line: 3, color: '#ff6319', members: ['africa'], projection: azimuthal(17, 3), boxes: [[[-26, -36], [60, 38]]], label: [20, 6] },
  { id: 'north-america', name: 'North America', tagline: 'Central America & Caribbean', line: 4, color: '#7b4fe0', members: ['north-america'], projection: azimuthal(-92, 38), boxes: [[[-168, 7], [-55, 70]]], label: [-100, 46] },
  { id: 'south-america', name: 'South America', tagline: 'Andes to Amazon', line: 5, color: '#8cc63f', members: ['south-america'], projection: azimuthal(-60, -20), boxes: [[[-82, -56], [-34, 13]]], label: [-60, -14] },
  { id: 'oceania', name: 'Oceania', tagline: 'Islands of the Pacific', line: 6, color: '#b933ad', members: ['oceania'], projection: azimuthal(160, -12), boxes: [[[110, -48], [205, 15]]], label: [134, -25] },
];

export const WORLD: RegionDef = {
  id: 'world',
  name: 'The World',
  tagline: 'Every flag, every border',
  line: 0,
  color: '#f4f4f0',
  members: CONTINENTS.map((c) => c.id as ContinentId),
  projection: () => geoNaturalEarth1().rotate([-11, 0]),
};

export const REGIONS: RegionDef[] = [WORLD, ...CONTINENTS];

const continent = (id: ContinentId) => CONTINENTS.find((c) => c.id === id)!;
export const isContinent = (id: string): id is ContinentId => CONTINENTS.some((c) => c.id === id);

/**
 * The region to play for a set of continents: one continent plays its own map, all of them play the world,
 * and any other mix plays a world projection framed on just those continents.
 */
export function selectionDef(ids: ContinentId[]): RegionDef | null {
  const members = CONTINENTS.map((c) => c.id as ContinentId).filter((id) => ids.includes(id));
  if (!members.length) return null;
  if (members.length === CONTINENTS.length) return WORLD;
  if (members.length === 1) return continent(members[0]);
  const parts = members.map(continent);
  const boxes = parts.flatMap((p) => p.boxes!);
  // Centre the projection on the mean direction of the boxes, so a mix across the Pacific isn't split at the edge.
  let x = 0;
  let y = 0;
  for (const [[lon0], [lon1]] of boxes) {
    const mid = (((lon0 + lon1) / 2) * Math.PI) / 180;
    x += Math.cos(mid);
    y += Math.sin(mid);
  }
  const centre = (Math.atan2(y, x) * 180) / Math.PI;
  return {
    id: members.join('+'),
    name: parts.length === 2 ? `${parts[0].name} + ${parts[1].name}` : `${parts.length} regions`,
    tagline: parts.map((p) => p.name).join(', '),
    line: parts.length,
    color: `conic-gradient(${parts.map((p, i) => `${p.color} ${(i / parts.length) * 360}deg ${((i + 1) / parts.length) * 360}deg`).join(', ')})`,
    members,
    projection: () => geoNaturalEarth1().rotate([-centre, 0]),
    boxes,
  };
}

/** Parses a route key: "world", a region id, or continents joined with "+". */
export function parseRegionKey(key: string): RegionDef | null {
  if (key === 'world') return WORLD;
  const ids = key.split('+');
  return ids.every(isContinent) ? selectionDef(ids) : null;
}

/** The geometry a region's projection gets fitted to: a grid of points over its boxes, or the sphere. */
export function fitTarget(region: RegionDef): GeoPermissibleObjects {
  if (!region.boxes) return { type: 'Sphere' };
  const coordinates: [number, number][] = [];
  for (const [[lon0, lat0], [lon1, lat1]] of region.boxes)
    for (let lon = lon0; lon <= lon1; lon += 2.5) for (let lat = lat0; lat <= lat1; lat += 2.5) coordinates.push([lon, lat]);
  return { type: 'MultiPoint', coordinates };
}

export function fittedProjection(region: RegionDef, width: number, height: number, pad: number) {
  return region.projection().fitExtent([[pad, pad], [width - pad, height - pad]], fitTarget(region));
}
