import type { Feature, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { feature, merge, neighbors } from 'topojson-client';
import atlas50 from 'world-atlas/countries-50m.json';
import atlas110 from 'world-atlas/countries-110m.json';
import meta from './data/countries.json';
import type { RegionId } from './regions';

export interface Country {
  code: string;
  name: string;
  official: string;
  capital: string | null;
  regions: RegionId[];
  latlng: [number, number];
  flag: string;
}

/** A shape on the map. `code` is set when the shape is a quizzable country. */
export interface Shape {
  key: string;
  name: string;
  code: string | null;
  feature: Feature<Geometry | null>;
}

type CountriesTopology = Topology<{ countries: GeometryCollection<{ name: string }>; land: GeometryCollection }>;

const flagUrls = import.meta.glob<string>('../node_modules/flag-icons/flags/4x3/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const flagFor = (code: string) => flagUrls[`../node_modules/flag-icons/flags/4x3/${code}.svg`] ?? '';

export const COUNTRIES: Country[] = meta.map((c) => ({
  code: c.code,
  name: c.name,
  official: c.official,
  capital: c.capital,
  regions: c.regions as RegionId[],
  latlng: c.latlng as [number, number],
  flag: flagFor(c.code),
}));

export const countryByCode = new Map(COUNTRIES.map((c) => [c.code, c]));

// Breakaway areas drawn as part of the country that the quiz asks about.
const ABSORB: Record<string, string> = { 'n:Somaliland': '706', 'n:N. Cyprus': '196' };

const geomKey = (g: { id?: string | number; properties?: { name?: string } | null }) =>
  g.id != null ? String(g.id) : `n:${g.properties?.name}`;

/**
 * One shape per country. Geometries sharing a key are merged: absorbed breakaway areas, and atlas
 * entries that reuse a country's id (Ashmore and Cartier Is. is also "036", Australia).
 */
function buildShapes(topo: CountriesTopology): Shape[] {
  const codeByGeom = new Map(meta.filter((c) => c.geom).map((c) => [c.geom!, c.code]));
  const groups = new Map<string, typeof topo.objects.countries.geometries>();
  for (const g of topo.objects.countries.geometries) {
    const key = ABSORB[geomKey(g)] ?? geomKey(g);
    groups.set(key, [...(groups.get(key) ?? []), g]);
  }
  return [...groups].map(([key, gs], i) => {
    const f = feature(topo, gs[0]) as Feature<Geometry | null>;
    if (gs.length > 1) f.geometry = merge(topo, gs as never);
    const code = codeByGeom.get(key) ?? null;
    const name = code ? countryByCode.get(code)!.name : (gs[0].properties as { name?: string } | null)?.name ?? '';
    return { key: code ?? `x${i}`, name, code, feature: f };
  });
}

export const SHAPES = buildShapes(atlas50 as unknown as CountriesTopology);

/** Subway-line colours (after NYC MTA and London Underground), nudged brighter where they'd vanish on black. */
export const PALETTE = [
  '#ee352e', // red
  '#ff6319', // orange
  '#fccc0a', // yellow
  '#8cc63f', // lime
  '#00a650', // green
  '#00a4a7', // teal
  '#2f6fe8', // blue
  '#7b4fe0', // violet
  '#b933ad', // magenta
  '#f49ac1', // pink
  '#b5793a', // brown
];

/** Which quizzable countries share a land border, from the atlas topology. */
function landNeighbours(topo: CountriesTopology) {
  const geoms = topo.objects.countries.geometries;
  const codeByGeom = new Map(meta.filter((c) => c.geom).map((c) => [c.geom!, c.code]));
  const owner = (i: number) => {
    const key = geomKey(geoms[i]);
    return codeByGeom.get(ABSORB[key] ?? key) ?? null;
  };
  const adj = new Map<string, Set<string>>(meta.map((c) => [c.code, new Set<string>()]));
  neighbors(geoms as never).forEach((list, i) => {
    const a = owner(i);
    if (!a) return;
    for (const j of list) {
      const b = owner(j);
      if (b && b !== a) adj.get(a)!.add(b);
    }
  });
  return adj;
}

/**
 * Gives every country its own colour, never the same as a neighbour's.
 * Greedy colouring, busiest countries first, picking the least-used allowed colour so the palette spreads evenly.
 */
function colourCountries(adj: Map<string, Set<string>>) {
  const used = new Map(PALETTE.map((c) => [c, 0]));
  const colour = new Map<string, string>();
  const order = [...adj.keys()].sort((a, b) => adj.get(b)!.size - adj.get(a)!.size || a.localeCompare(b));
  for (const code of order) {
    const taken = new Set([...adj.get(code)!].map((n) => colour.get(n)));
    const pick = PALETTE.filter((c) => !taken.has(c)).sort((x, y) => used.get(x)! - used.get(y)!)[0] ?? PALETTE[0];
    colour.set(code, pick);
    used.set(pick, used.get(pick)! + 1);
  }
  return colour;
}

const NEIGHBOURS = landNeighbours(atlas50 as unknown as CountriesTopology);
/** Countries with no land border: candidates for an enlarged click zone. */
export const ISLANDS = new Set([...NEIGHBOURS].filter(([, n]) => n.size === 0).map(([code]) => code));
export const COLOUR_OF = colourCountries(NEIGHBOURS);
export const LAND = feature(atlas50 as unknown as CountriesTopology, (atlas50 as unknown as CountriesTopology).objects.land);
/** Coarser shapes for small thumbnails. */
export const SHAPES_LOW = buildShapes(atlas110 as unknown as CountriesTopology);

export const countriesIn = (region: RegionId) =>
  region === 'world' ? COUNTRIES : COUNTRIES.filter((c) => c.regions.includes(region));
