import { geoAzimuthalEqualArea, geoNaturalEarth1, type GeoProjection, type GeoPermissibleObjects } from 'd3-geo';

export type RegionId = 'world' | 'europe' | 'asia' | 'africa' | 'north-america' | 'south-america' | 'oceania';

export interface RegionDef {
  id: RegionId;
  name: string;
  tagline: string;
  /** Heading the region is listed under in the menu. */
  group: string;
  /** Line number and colour, transit-map style. */
  line: number;
  color: string;
  projection: () => GeoProjection;
  /** Lon/lat box the view is fitted to; omitted means the whole sphere. Longitudes may run past 180. */
  bounds?: [[number, number], [number, number]];
}

const azimuthal = (lon: number, lat: number) => () => geoAzimuthalEqualArea().rotate([-lon, -lat]).clipAngle(90);

export const REGIONS: RegionDef[] = [
  { id: 'world', name: 'The World', tagline: 'Every flag, every border', group: 'Global', line: 0, color: '#f4f4f0', projection: () => geoNaturalEarth1().rotate([-11, 0]) },
  { id: 'europe', name: 'Europe', tagline: 'Microstates & old borders', group: 'Continents', line: 1, color: '#2f6fe8', projection: azimuthal(15, 53), bounds: [[-25, 34], [45, 71]] },
  { id: 'asia', name: 'Asia', tagline: 'From the Levant to Japan', group: 'Continents', line: 2, color: '#ee352e', projection: azimuthal(88, 30), bounds: [[26, -11], [146, 55]] },
  { id: 'africa', name: 'Africa', tagline: 'Fifty-four nations', group: 'Continents', line: 3, color: '#ff6319', projection: azimuthal(17, 3), bounds: [[-26, -36], [60, 38]] },
  { id: 'north-america', name: 'North America', tagline: 'Central America & Caribbean', group: 'Continents', line: 4, color: '#7b4fe0', projection: azimuthal(-92, 38), bounds: [[-168, 7], [-55, 70]] },
  { id: 'south-america', name: 'South America', tagline: 'Andes to Amazon', group: 'Continents', line: 5, color: '#8cc63f', projection: azimuthal(-60, -20), bounds: [[-82, -56], [-34, 13]] },
  { id: 'oceania', name: 'Oceania', tagline: 'Islands of the Pacific', group: 'Continents', line: 6, color: '#b933ad', projection: azimuthal(160, -12), bounds: [[110, -48], [205, 15]] },
];

export const regionById = (id: RegionId) => REGIONS.find((r) => r.id === id)!;

/** The geometry a region's projection gets fitted to: a grid of points over its box, or the sphere. */
export function fitTarget(region: RegionDef): GeoPermissibleObjects {
  if (!region.bounds) return { type: 'Sphere' };
  const [[lon0, lat0], [lon1, lat1]] = region.bounds;
  const coordinates: [number, number][] = [];
  for (let lon = lon0; lon <= lon1; lon += 2.5) for (let lat = lat0; lat <= lat1; lat += 2.5) coordinates.push([lon, lat]);
  return { type: 'MultiPoint', coordinates };
}

export function fittedProjection(region: RegionDef, width: number, height: number, pad: number) {
  return region.projection().fitExtent([[pad, pad], [width - pad, height - pad]], fitTarget(region));
}
