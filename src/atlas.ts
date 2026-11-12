/**
 * The detailed (1:50m) world atlas and everything derived from it. Only the play screen needs it, and it's
 * about half the app's download, so it lives in the play screen's lazily loaded chunk: the menu shows first.
 */
import { feature, neighbors } from 'topojson-client';
import atlas50 from 'world-atlas/countries-50m.json';
import meta from './data/countries.json';
import { ABSORB, buildShapes, geomKey, PALETTE, type CountriesTopology } from './data';

const topo = atlas50 as unknown as CountriesTopology;

export const SHAPES = buildShapes(topo);

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

const NEIGHBOURS = landNeighbours(topo);
/** Countries with no land border: candidates for an enlarged click zone. */
export const ISLANDS = new Set([...NEIGHBOURS].filter(([, n]) => n.size === 0).map(([code]) => code));
export const COLOUR_OF = colourCountries(NEIGHBOURS);
export const LAND = feature(topo, topo.objects.land);
