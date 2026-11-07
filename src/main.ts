import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './style.css';
import { isMuted, setMuted, sfx } from './audio';
import { countriesIn, type Country, type Shape } from './data';
import { Game, MAX_ATTEMPTS, formatTime, loadBest, saveBest, type Mode, type Outcome } from './game';
import { MapView, thumbnail, type ClientPoint, type Paint, type PickEvent } from './map';
import { REGIONS, regionById, type RegionDef, type RegionId } from './regions';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const prefs = {
  mode: (readPref('mode') as Mode) || 'name',
  hints: readPref('hints') === '1',
};


function readPref(key: string) {
  try {
    return localStorage.getItem(`pinpoint:${key}`) ?? '';
  } catch {
    return '';
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`pinpoint:${key}`, value);
  } catch {
    /* storage unavailable */
  }
}

const MODES: { id: Mode; code: string; title: string; blurb: string }[] = [
  { id: 'name', code: 'N+F', title: 'Name + Flag', blurb: 'Given the name and its flag, find the country on the map.' },
  { id: 'flag', code: 'F', title: 'Flag only', blurb: 'Given only the flag. Identify it, then find it.' },
];

const badgeText = (r: RegionDef) => (r.line ? String(r.line) : 'W');
const badge = (r: RegionDef) => `<span class="badge${r.line ? '' : ' light'}" style="--line: ${r.color}">${badgeText(r)}</span>`;

const PAINT_FOR: Record<Outcome, Paint> = { 0: 'missed', 1: 'c1', 2: 'c2', 3: 'c3' };

const RANKS: [number, string][] = [
  [0.97, 'Cartographer'],
  [0.88, 'Navigator'],
  [0.75, 'Explorer'],
  [0.55, 'Wanderer'],
  [0, 'Lost at sea'],
];

// ---------- Menu ----------

const menu = $('#menu');
const play = $('#play');

function renderMenu() {
  $('#modes', menu).innerHTML = MODES.map(
    (m) => `
    <button class="mode${m.id === prefs.mode ? ' on' : ''}" data-mode="${m.id}" aria-pressed="${m.id === prefs.mode}">
      <span class="route route-${m.id}">${m.code}</span>
      <span class="mode-text">
        <span class="mode-title">${m.title}</span>
        <span class="mode-blurb">${m.blurb}</span>
      </span>
      <span class="mode-check" aria-hidden="true"></span>
    </button>`,
  ).join('');

  $('#regions', menu).innerHTML = REGIONS.map((r) => {
    const pool = countriesIn(r.id);
    const best = loadBest(prefs.mode, r.id);
    const wide = r.id === 'world';
    return `
    <button class="region${wide ? ' wide' : ''}" data-region="${r.id}" style="--line: ${r.color}">
      <span class="region-map">${thumbnail(r, new Set(pool.map((c) => c.code)), wide ? 420 : 220, wide ? 210 : 140)}</span>
      <span class="region-meta">
        <span class="region-head">${badge(r)}<span class="region-name">${r.name}</span></span>
        <span class="region-rail" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="region-tag">${r.tagline}</span>
        <span class="region-foot">
          <span class="region-count">${pool.length} countries</span>
          <span class="region-best">${best ? `<b>${Math.round(best.score * 100)}%</b> ${formatTime(best.time)}` : '—'}</span>
        </span>
      </span>
    </button>`;
  }).join('');

  $<HTMLInputElement>('#opt-hints').checked = prefs.hints;
  $<HTMLInputElement>('#opt-sound').checked = !isMuted();
}

menu.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const mode = t.closest<HTMLElement>('[data-mode]')?.dataset.mode as Mode | undefined;
  if (mode) {
    prefs.mode = mode;
    writePref('mode', mode);
    sfx.click();
    renderMenu();
  }
  const region = t.closest<HTMLElement>('[data-region]')?.dataset.region as RegionId | undefined;
  if (region) start(region, countriesIn(region), true);
});

$('#opt-hints').addEventListener('change', (e) => {
  prefs.hints = (e.target as HTMLInputElement).checked;
  writePref('hints', prefs.hints ? '1' : '0');
});
$('#opt-sound').addEventListener('change', (e) => setMuted(!(e.target as HTMLInputElement).checked));


// ---------- Play ----------

const ticket = $('#ticket');
const map = new MapView($('#map-host'));
// Keep the map clear of the prompt card: beside it on wide screens, above it on phones.
map.insets = () => {
  const host = $('#map-host').getBoundingClientRect();
  const card = ticket.getBoundingClientRect();
  if (!card.width) return { top: 0, right: 0, bottom: 0, left: 0 };
  return host.width > 760
    ? { top: 0, right: 0, bottom: 0, left: card.right - host.left }
    : { top: 0, right: 0, bottom: host.bottom - card.top, left: 0 };
};
const tooltip = $('#tooltip');
const toastEl = $('#toast');
const results = $<HTMLDialogElement>('#results');

let game: Game | null = null;
/** A missed country that keeps flashing until the player clicks it. */
let pending: Country | null = null;
let ranked = false;
let timer = 0;

function start(region: RegionId, pool: Country[], full: boolean) {
  results.close();
  game = new Game(prefs.mode, region, pool);
  pending = null;
  ranked = full && !prefs.hints;
  menu.hidden = true;
  play.hidden = false;
  play.dataset.mode = prefs.mode;
  const def = regionById(region);
  play.style.setProperty('--line', def.color);
  $('#hud-badge').textContent = badgeText(def);
  $('#hud-badge').classList.toggle('light', !def.line);
  $('#hud-region').textContent = def.name;
  $('#hud-mode').textContent = prefs.mode === 'name' ? 'Name + Flag' : 'Flag only';
  $('#hud-practice').hidden = ranked;
  $('#hud-practice').textContent = full ? 'Hints on · unranked' : 'Retry · unranked';
  clearInterval(timer);
  timer = window.setInterval(updateHud, 250);
  showPrompt();
  map.show(def, new Set(pool.map((c) => c.code)), pool.filter((c) => c.code === 'tv'));
  updateHud();
}

function showPrompt() {
  const c = game!.current;
  if (!c) return;
  const flagOnly = game!.mode === 'flag';
  ticket.innerHTML = `
    <div class="ticket-label"><span>${flagOnly ? 'Whose flag?' : 'Find'}</span><span class="ticket-count">${game!.answered + 1} / ${game!.pool.length}</span></div>
    <div class="ticket-body">
      <img class="flag" src="${c.flag}" alt="${flagOnly ? 'Flag to find' : `Flag of ${c.name}`}" draggable="false">
      ${flagOnly ? '<div class="ticket-name unknown">?</div>' : `<div class="ticket-name">${c.name}</div>`}
    </div>
    <div class="ticket-foot">
      <span class="pips" aria-label="Attempts">${Array.from({ length: MAX_ATTEMPTS }, (_, i) => `<i class="${i < game!.attemptsUsed ? 'used' : ''}"></i>`).join('')}</span>
      <button class="btn-ghost" id="skip" ${game!.pool.length - game!.answered < 2 ? 'disabled' : ''}>Skip <kbd>S</kbd></button>
    </div>`;
  ticket.classList.remove('deal');
  void ticket.offsetWidth;
  ticket.classList.add('deal');
}

/** After the last try: show the answer on the card and wait for the player to click it on the map. */
function showReveal(c: Country) {
  ticket.innerHTML = `
    <div class="ticket-label"><span class="ticket-alert">Missed · click it to continue</span></div>
    <div class="ticket-body">
      <img class="flag" src="${c.flag}" alt="Flag of ${c.name}" draggable="false">
      <div class="ticket-name">${c.name}</div>
    </div>
    <div class="ticket-foot">
      <span class="pips" aria-label="Attempts">${'<i class="used"></i>'.repeat(MAX_ATTEMPTS)}</span>
      <span class="ticket-hint">It's flashing</span>
    </div>`;
  ticket.classList.add('missed');
}

function advance() {
  ticket.classList.remove('missed');
  updateHud();
  if (game!.done) finish();
  else showPrompt();
}

function updatePips() {
  ticket.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('used', i < game!.attemptsUsed));
}

function updateHud() {
  if (!game) return;
  const total = game.pool.length;
  $('#hud-progress').innerHTML = `${game.answered}<small>/${total}</small>`;
  $('#hud-bar').style.setProperty('--fill', `${(game.answered / total) * 100}%`);
  $('#hud-score').textContent = `${Math.round(game.score * 100)}%`;
  $('#hud-time').textContent = formatTime(game.elapsed);
  const streak = $('#hud-streak');
  streak.hidden = game.streak < 3;
  streak.textContent = `×${game.streak} streak`;
}

let toastTimer = 0;
function toast(html: string, tone: 'good' | 'bad' | 'meh' = 'meh') {
  toastEl.innerHTML = html;
  toastEl.className = `toast show tone-${tone}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1600);
}

function shake() {
  ticket.classList.remove('shake');
  void ticket.offsetWidth;
  ticket.classList.add('shake');
}

map.onPick = ({ shape, active, at }: PickEvent) => {
  if (!game) return;
  if (pending) {
    if (shape.code !== pending.code) {
      toast(`That's ${shape.name || 'the sea'}. <small>Click the flashing country</small>`, 'bad');
      shake();
      return;
    }
    map.clearReveal();
    map.stamp(at, pending.code, 'missed');
    sfx.click();
    toast(`${pending.name} <small>noted for review</small>`);
    pending = null;
    advance();
    return;
  }
  if (game.done) return;
  if (!active) {
    if (shape.name) toast(`${shape.name} <small>isn't in this quiz</small>`);
    return;
  }
  const code = shape.code!;
  if (game.results.has(code)) {
    toast(`${shape.name} <small>already found</small>`);
    return;
  }
  const target = game.current!;
  const r = game.answer(code);
  if (r.kind === 'correct') {
    const paint = PAINT_FOR[r.attempt as Outcome];
    map.paint(code, paint);
    map.stamp(at, code, paint);
    if (r.attempt === 1) sfx.correct(r.streak);
    else sfx.late();
    toast(`${target.name}${r.attempt === 1 && r.streak >= 3 ? ` <small>streak ×${r.streak}</small>` : ''}`, 'good');
  } else if (r.kind === 'wrong') {
    map.flash(code);
    map.miss(at);
    sfx.wrong();
    shake();
    // Point toward the answer; in Flag-only mode say where it is without naming it.
    const hint = map.pointToward(at, target.code);
    const where = hint ? `${hint.km ? `${hint.km.toLocaleString()} km ` : ''}${hint.dir}` : '';
    const subject = game.mode === 'flag' ? "It's" : `${target.name} is`;
    toast(`That's ${shape.name}. <small>${where ? `${subject} ${where}` : `${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left`}</small>`, 'bad');
    updatePips();
    updateHud();
    return;
  } else {
    map.flash(code);
    map.miss(at);
    map.paint(target.code, 'missed');
    map.reveal(target.code);
    sfx.reveal();
    shake();
    toast(`That's ${shape.name}. <b>${target.name}</b> <small>is flashing, click it</small>`, 'bad');
    pending = target;
    showReveal(target);
    updateHud();
    return;
  }
  advance();
};

map.onHover = (shape: Shape | null, active: boolean, ev: ClientPoint) => {
  if (!game || !shape?.name) {
    tooltip.hidden = true;
    play.classList.remove('pointing');
    return;
  }
  const found = active && game.results.has(shape.code!);
  const show = !active || found || prefs.hints || game.done;
  play.classList.toggle('pointing', (active && !found) || shape.code === pending?.code);
  tooltip.hidden = !show;
  if (!show) return;
  tooltip.textContent = shape.name;
  tooltip.className = `tooltip${active ? '' : ' off'}`;
  const host = $('#map-host').getBoundingClientRect();
  tooltip.style.transform = `translate(${ev.clientX - host.left + 14}px, ${ev.clientY - host.top + 16}px)`;
};

function finish() {
  const g = game!;
  clearInterval(timer);
  updateHud();
  sfx.finish();
  ticket.innerHTML = `
    <div class="ticket-label"><span>Done</span><span class="ticket-count">${g.pool.length} / ${g.pool.length}</span></div>
    <div class="ticket-done">Round complete</div>`;
  const run = { score: g.finalScore, time: g.elapsed };
  const record = ranked && saveBest(g.mode, g.region, run);
  setTimeout(() => showResults(g, record), 650);
}

function showResults(g: Game, record: boolean) {
  const score = g.finalScore;
  const rank = RANKS.find(([min]) => score >= min)![1];
  const firstTry = [...g.results.values()].filter((o) => o === 1).length;
  const slips = g.missed;
  $('#results-body').innerHTML = `
    <div class="res-head">
      <div class="res-kicker">${badge(regionById(g.region))}${regionById(g.region).name} · ${g.mode === 'name' ? 'Name + Flag' : 'Flag only'}</div>
      <div class="res-score">${Math.round(score * 100)}<span>%</span></div>
      <div class="rank-stamp">${rank}</div>
      ${record ? '<div class="record">New personal best</div>' : ''}
    </div>
    <dl class="res-stats">
      <div><dt>Time</dt><dd>${formatTime(g.elapsed)}</dd></div>
      <div><dt>First try</dt><dd>${firstTry}/${g.pool.length}</dd></div>
      <div><dt>Best streak</dt><dd>${g.bestStreak}</dd></div>
    </dl>
    ${
      slips.length
        ? `<h3 class="res-sub">To review <span>${slips.length}</span></h3>
      <ul class="slips">${slips
        .map((c) => {
          const o = g.results.get(c.code)!;
          return `<li class="p-${PAINT_FOR[o]}"><i class="dot"></i><img src="${c.flag}" alt=""><span>${c.name}</span><em>${o ? `${o} tries` : 'missed'}</em></li>`;
        })
        .join('')}</ul>`
        : '<p class="flawless">Flawless. Every country on the first try.</p>'
    }
    <div class="res-actions">
      ${slips.length ? `<button class="btn" data-act="retry">Retry the ${slips.length} to review</button>` : ''}
      <button class="btn ${slips.length ? 'alt' : ''}" data-act="again">Play again</button>
      <button class="btn-ghost" data-act="map">View map</button>
      <button class="btn-ghost" data-act="menu">Menu</button>
    </div>`;
  results.showModal();
}

results.addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (!act || !game) return;
  sfx.click();
  if (act === 'retry') start(game.region, game.missed, false);
  if (act === 'again') start(game.region, countriesIn(game.region), true);
  if (act === 'map') {
    results.close();
    $('#show-results').hidden = false;
  }
  if (act === 'menu') toMenu();
});

function toMenu() {
  results.close();
  clearInterval(timer);
  game = null;
  pending = null;
  play.hidden = true;
  menu.hidden = false;
  $('#show-results').hidden = true;
  renderMenu();
}

play.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('#skip')) {
    game?.skip();
    sfx.click();
    showPrompt();
  }
  if (t.closest('#back')) toMenu();
  if (t.closest('#zoom-in')) map.zoomBy(1.8);
  if (t.closest('#zoom-out')) map.zoomBy(1 / 1.8);
  if (t.closest('#zoom-reset')) map.resetZoom();
  if (t.closest('#show-results')) {
    $('#show-results').hidden = true;
    results.showModal();
  }
  if (t.closest('#hud-sound')) {
    setMuted(!isMuted());
    syncSound();
  }
});

function syncSound() {
  $('#hud-sound').classList.toggle('off', isMuted());
  $('#hud-sound').setAttribute('aria-label', isMuted() ? 'Unmute' : 'Mute');
}

document.addEventListener('keydown', (e) => {
  if (play.hidden || results.open || e.metaKey || e.ctrlKey) return;
  if (e.key === ' ') {
    // Space picks whatever is under the cursor; keep it from also pressing a focused button.
    e.preventDefault();
    if (!e.repeat) map.pickAtPointer();
  }
  if (e.key === 's' || e.key === 'S') $<HTMLButtonElement>('#skip')?.click();
  if (e.key === '+' || e.key === '=') map.zoomBy(1.8);
  if (e.key === '-') map.zoomBy(1 / 1.8);
  if (e.key === '0') map.resetZoom();
  if (e.key === 'Escape') toMenu();
});

document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && !play.hidden && !results.open) e.preventDefault();
});

renderMenu();
syncSound();
