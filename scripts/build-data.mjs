// Builds src/data/countries.json: the quizzable countries, their regions, and how to find each one's shape in world-atlas.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wc = require('world-countries/countries.json');
const atlas = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));

const EXTRA = new Set(['VA', 'PS', 'XK', 'TW']);
// Countries quizzed in a second region as well as their home one.
const ALSO = { RU: ['asia'], TR: ['europe'] };
// Friendlier display names than world-countries' "common" name.
const RENAME = {
  CD: 'DR Congo',
  CG: 'Republic of the Congo',
  VA: 'Vatican City',
  FM: 'Micronesia',
};

function homeRegion(c) {
  if (c.region === 'Americas') return c.subregion === 'South America' ? 'south-america' : 'north-america';
  return c.region.toLowerCase();
}

const geomIds = new Set(atlas.objects.countries.geometries.map((g) => g.id).filter(Boolean));

const out = wc
  .filter((c) => c.unMember || EXTRA.has(c.cca2))
  .map((c) => {
    const geom = c.cca2 === 'XK' ? 'n:Kosovo' : geomIds.has(c.ccn3) ? c.ccn3 : null;
    return {
      code: c.cca2.toLowerCase(),
      name: RENAME[c.cca2] ?? c.name.common,
      official: c.name.official,
      capital: c.capital?.[0] ?? null,
      regions: [homeRegion(c), ...(ALSO[c.cca2] ?? [])],
      latlng: c.latlng,
      geom,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(new URL('../src/data/countries.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${out.length} countries (${out.filter((c) => !c.geom).map((c) => c.name).join(', ') || 'all'} without shapes)`);
