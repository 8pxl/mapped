/**
 * The daily puzzle: a handful of countries linked by a theme, the same for everyone on a given day. Find them all on
 * the map, in any order, as fast as possible; a wrong click costs PENALTY_MS.
 */
export interface Theme {
  /** The link, shown before playing: "They all touch the Danube". */
  title: string;
  /** The fun fact, shown after. */
  fact: string;
  /** 5 to 10 countries. */
  codes: string[];
}

export const PENALTY_MS = 5000;

/**
 * Append new themes at the end: the order of play is a seeded shuffle of this list, and inserting in the middle
 * would change which theme falls on days already played.
 */
export const THEMES: Theme[] = [
  {
    title: 'Their names end in “-stan”',
    fact: '“-stan” is Persian for “place of” or “land”: Uzbekistan is the land of the Uzbeks.',
    codes: ['af', 'kz', 'kg', 'pk', 'tj', 'tm', 'uz'],
  },
  {
    title: 'Named after a person',
    fact: 'Bolivia after Simón Bolívar, Colombia after Columbus, the Philippines after Philip II of Spain, Saudi Arabia after the House of Saud, Seychelles after a French finance minister, the Marshall Islands after a British captain, Mauritius after Maurice of Nassau, and San Marino after a stonemason saint.',
    codes: ['bo', 'co', 'ph', 'sa', 'sc', 'mh', 'mu', 'sm'],
  },
  {
    title: 'They drive on the left',
    fact: 'About a third of the world’s people drive on the left, mostly in places once under British rule. Japan never was: it picked up the habit anyway.',
    codes: ['gb', 'ie', 'jp', 'in', 'au', 'nz', 'za', 'th'],
  },
  {
    title: 'English is the main language',
    fact: 'Most people in each of these speak English as their first language. Guyana is the only one in South America.',
    codes: ['us', 'gb', 'ie', 'au', 'nz', 'jm', 'gy', 'bs'],
  },
  {
    title: 'Portuguese is an official language',
    fact: 'Portuguese has more speakers in the southern hemisphere than any other language. Equatorial Guinea added it in 2010.',
    codes: ['pt', 'br', 'ao', 'mz', 'cv', 'gw', 'st', 'tl', 'gq'],
  },
  {
    title: 'The Danube flows through or along them',
    fact: 'The Danube touches ten countries, more than any other river in the world, on its way from the Black Forest to the Black Sea.',
    codes: ['de', 'at', 'sk', 'hu', 'hr', 'rs', 'ro', 'bg', 'md', 'ua'],
  },
  {
    title: 'The kingdoms of Europe',
    fact: 'Seven European countries still have a king or queen. Add the grand duke of Luxembourg and the princes of Monaco, Liechtenstein and Andorra for the full set of European monarchies.',
    codes: ['gb', 'es', 'se', 'no', 'dk', 'nl', 'be'],
  },
  {
    title: 'The eight largest countries',
    fact: 'Russia alone covers about an eighth of the world’s land. Together these eight cover about half of it.',
    codes: ['ru', 'ca', 'cn', 'us', 'br', 'au', 'in', 'ar'],
  },
  {
    title: 'The eight most populous countries',
    fact: 'India overtook China as the most populous country in 2023. Together these eight hold about half the world’s people.',
    codes: ['in', 'cn', 'us', 'id', 'pk', 'ng', 'br', 'bd'],
  },
  {
    title: 'Island nations of the Caribbean',
    fact: 'Cuba is the largest island in the Caribbean, over 1,200 km from end to end. Grenada would fit into it more than 300 times.',
    codes: ['cu', 'jm', 'bs', 'bb', 'tt', 'lc', 'gd', 'dm'],
  },
  {
    title: 'They all border Brazil',
    fact: 'Brazil borders every South American country except Chile and Ecuador, and France too, through French Guiana.',
    codes: ['ar', 'bo', 'co', 'gy', 'py', 'pe', 'sr', 'uy', 've'],
  },
  {
    title: 'They all border China',
    fact: 'China ties with Russia for the most neighbours: fourteen countries each.',
    codes: ['af', 'bt', 'in', 'kz', 'kp', 'mn', 'mm', 'np', 'pk', 'vn'],
  },
  {
    title: 'They’ve hosted the Summer Olympics',
    fact: 'Greece hosted the first modern Games in 1896. France, the UK and the US have each hosted three times or more.',
    codes: ['gr', 'fr', 'gb', 'us', 'se', 'fi', 'mx', 'jp', 'kr', 'br'],
  },
  {
    title: 'World Cup winners',
    fact: 'Brazil has won the men’s FIFA World Cup five times. The UK is here for England, the 1966 winners.',
    codes: ['br', 'de', 'it', 'ar', 'fr', 'uy', 'es', 'gb'],
  },
  {
    title: 'The capital has the same name',
    fact: 'Mexico City, Guatemala City, Panama City, Kuwait City, Singapore, Luxembourg, San Marino and Djibouti: in each, the capital shares the country’s name.',
    codes: ['mx', 'gt', 'pa', 'kw', 'sg', 'lu', 'sm', 'dj'],
  },
  {
    title: 'In the basin of the Nile',
    fact: 'The Nile drains about a tenth of Africa. Its White Nile rises around Lake Victoria; the Blue Nile, which carries most of its water, in Ethiopia.',
    codes: ['eg', 'sd', 'ss', 'ug', 'et', 'ke', 'tz', 'rw'],
  },
  {
    title: 'The Arctic Circle crosses them',
    fact: 'In Iceland the Arctic Circle only touches Grímsey, a small island off the north coast.',
    codes: ['no', 'se', 'fi', 'ru', 'us', 'ca', 'is'],
  },
  {
    title: 'The Tropic of Capricorn crosses them',
    fact: 'The Tropic of Capricorn marks where the sun is straight overhead at noon on the December solstice.',
    codes: ['cl', 'ar', 'py', 'br', 'na', 'bw', 'za', 'mz', 'mg', 'au'],
  },
  {
    title: 'The Equator crosses them',
    fact: 'The Equator crosses thirteen countries. Ecuador is named after it, and Kiribati straddles it far out in the Pacific.',
    codes: ['ec', 'co', 'br', 'ga', 'cg', 'cd', 'ug', 'ke', 'so', 'id'],
  },
  {
    title: 'A crescent moon on the flag',
    fact: 'The crescent is often read as a symbol of Islam, but it was on the flags of the Ottoman Empire long before that, and Singapore’s stands for a young nation on the rise.',
    codes: ['tr', 'tn', 'dz', 'pk', 'my', 'mv', 'az', 'mr'],
  },
  {
    title: 'The Union Jack is on their flag',
    fact: 'Tuvalu and Fiji still fly the Union Jack in their flags’ corner, as do Australia and New Zealand.',
    codes: ['gb', 'au', 'nz', 'fj', 'tv'],
  },
  {
    title: 'The Nordic countries',
    fact: 'Scandinavia is strictly Denmark, Norway and Sweden. Nordic adds Finland and Iceland.',
    codes: ['no', 'se', 'dk', 'fi', 'is'],
  },
  {
    title: 'The Alps reach into them',
    fact: 'Mont Blanc, on the French–Italian border, is the highest point of the Alps at about 4,800 m.',
    codes: ['fr', 'ch', 'it', 'de', 'at', 'li', 'si', 'mc'],
  },
  {
    title: 'The Andes run through them',
    fact: 'The Andes are the longest mountain range above water, about 7,000 km from Venezuela to the tip of Argentina.',
    codes: ['ve', 'co', 'ec', 'pe', 'bo', 'cl', 'ar'],
  },
  {
    title: 'They use the euro outside the EU',
    fact: 'Andorra, Monaco, San Marino and Vatican City use the euro by agreement with the EU. Montenegro and Kosovo simply adopted it.',
    codes: ['me', 'xk', 'ad', 'mc', 'sm', 'va'],
  },
  {
    title: 'They use the US dollar',
    fact: 'Ecuador and El Salvador swapped their own currencies for the dollar around 2000. Panama has used it since 1904.',
    codes: ['ec', 'sv', 'pa', 'tl', 'fm', 'mh', 'pw'],
  },
  {
    title: 'French is official in Africa',
    fact: 'More French speakers live in Africa than in France. Kinshasa, in DR Congo, is the largest French-speaking city in the world.',
    codes: ['sn', 'ci', 'cm', 'cd', 'mg', 'td', 'ga', 'bj'],
  },
  {
    title: 'Arabic is an official language',
    fact: 'Arabic is official in more than twenty countries, from Morocco on the Atlantic to Oman on the Arabian Sea.',
    codes: ['eg', 'sa', 'ma', 'dz', 'iq', 'jo', 'om', 'ye'],
  },
  {
    title: 'Island nations of the Indian Ocean',
    fact: 'Madagascar split from India about 88 million years ago. Most of its animals live nowhere else.',
    codes: ['mg', 'mu', 'sc', 'km', 'mv', 'lk'],
  },
  {
    title: 'Once part of Yugoslavia',
    fact: 'Yugoslavia broke up between 1991 and 2008, when Kosovo declared independence.',
    codes: ['si', 'hr', 'ba', 'rs', 'me', 'mk', 'xk'],
  },
  {
    title: 'Once part of the Soviet Union',
    fact: 'Fifteen countries came out of the Soviet Union when it broke up in 1991.',
    codes: ['ee', 'lv', 'lt', 'by', 'ua', 'md', 'ge', 'am', 'az', 'kz'],
  },
  {
    title: 'No permanent rivers',
    fact: 'Saudi Arabia is the largest country without a permanent river. Its water comes from aquifers and desalination.',
    codes: ['sa', 'ly', 'ye', 'om', 'ae', 'kw', 'qa', 'bh'],
  },
  {
    title: 'The Himalayas reach into them',
    fact: 'All fourteen mountains over 8,000 m are in the Himalaya and Karakoram, shared by these countries.',
    codes: ['in', 'np', 'bt', 'cn', 'pk'],
  },
];

const DAY = 86_400_000;
/** Puzzle #1. Dates are local, so a new puzzle starts at the player's midnight. */
const FIRST = new Date(2026, 10, 11);

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Today's puzzle number, from 1. Rounded, so a daylight-saving shift doesn't skip or repeat a day. */
export const todayNumber = (now = new Date()) => Math.round((dayStart(now).getTime() - FIRST.getTime()) / DAY) + 1;

/** A small seeded random generator (mulberry32), so every player gets the same order. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The theme for puzzle `n`: each pass through THEMES is shuffled, so no theme repeats until all have been played. */
export function themeFor(n: number): Theme {
  const i = Math.max(0, n - 1);
  const pass = Math.floor(i / THEMES.length);
  const rand = seeded(pass + 1);
  const order = THEMES.map((_, k) => k);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  return THEMES[order[i % THEMES.length]];
}

export interface DailyRun {
  /** Time including penalties, ms. */
  time: number;
  misses: number;
}

const runKey = (n: number) => `pinpoint:daily:${n}`;

export function loadRun(n: number): DailyRun | null {
  try {
    return JSON.parse(localStorage.getItem(runKey(n)) ?? 'null');
  } catch {
    return null;
  }
}

/** Keeps the first run of the day: replays are for fun and don't replace it. */
export function saveRun(n: number, run: DailyRun) {
  if (loadRun(n)) return;
  try {
    localStorage.setItem(runKey(n), JSON.stringify(run));
  } catch {
    /* storage unavailable */
  }
}

/** Days in a row with a daily played, ending today, or yesterday when today isn't played yet. */
export function dailyStreak(today = todayNumber()) {
  let n = loadRun(today) ? today : today - 1;
  let streak = 0;
  while (n >= 1 && loadRun(n)) {
    streak++;
    n--;
  }
  return streak;
}

/** Time until the next puzzle, as "5h 12m". */
export function untilNext(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.ceil((next.getTime() - now.getTime()) / 60_000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const SPEED = ['🟩', '🟨', '🟧', '🟥'];

/** The text to paste: puzzle number, theme, time and misses. The theme is no spoiler: it's shown before playing. */
export function dailyShareText(n: number, theme: Theme, run: DailyRun, count: number) {
  const perCountry = run.time / count / 1000;
  const square = SPEED[perCountry < 3 ? 0 : perCountry < 5 ? 1 : perCountry < 8 ? 2 : 3];
  const s = Math.floor(run.time / 1000);
  return [
    `mapped! daily #${n}`,
    theme.title,
    `${square} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}${run.misses ? ` · ${run.misses} ${run.misses === 1 ? 'miss' : 'misses'}` : ' · no misses'}`,
    `${location.origin}/daily`,
  ].join('\n');
}
