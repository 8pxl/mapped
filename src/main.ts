import './style.css';
import { isMuted, setMuted, sfx } from './audio';
import { COLOUR_OF, countriesIn, type Country, type Shape } from './data';
import { Game, MAX_ATTEMPTS, formatTime, loadBest, saveBest, type Mode, type Outcome } from './game';
import { MapView, thumbnail, type ClientPoint, type Paint, type PickEvent } from './map';
import { REGIONS, regionById, type RegionDef, type RegionId } from './regions';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

const prefs = {
  mode: (readPref('mode') as Mode) || 'name',
  hints: readPref('hints') === '1',
  region: (REGIONS.some((r) => r.id === readPref('region')) ? readPref('region') : 'world') as RegionId,
};


// Storage keys keep the original "pinpoint:" prefix so saved settings and best scores survive the rename.
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

/** Game types on the menu. Adding a game is one entry here plus its rules in game.ts. */
const MODES: { id: Mode; code: string; title: string; blurb: string }[] = [
  { id: 'name', code: 'N+F', title: 'Name + Flag', blurb: 'See the name and flag. Find the country on the map.' },
  { id: 'flag', code: 'F', title: 'Flag only', blurb: 'See only the flag. Work out the country, then find it.' },
];
const modeTitle = (m: Mode) => MODES.find((x) => x.id === m)!.title;

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

const thumbs = new Map<RegionId, string>();
const thumbFor = (r: RegionDef) => {
  if (!thumbs.has(r.id)) thumbs.set(r.id, thumbnail(r, new Set(countriesIn(r.id).map((c) => c.code)), 560, 320));
  return thumbs.get(r.id)!;
};

function renderMenu() {
  $('#modes', menu).innerHTML = MODES.map(
    (m) => `
    <button class="mode-tab" role="radio" data-mode="${m.id}" aria-checked="${m.id === prefs.mode}">
      <span class="route route-${m.id}">${m.code}</span><span>${m.title}</span>
    </button>`,
  ).join('');
  $('#mode-desc', menu).textContent = MODES.find((m) => m.id === prefs.mode)!.blurb;

  const groups = [...new Set(REGIONS.map((r) => r.group))];
  $('#regions', menu).innerHTML = groups
    .map(
      (group) => `
    <div class="region-group">
      <h3>${group}</h3>
      <ul>${REGIONS.filter((r) => r.group === group)
        .map((r) => {
          const best = loadBest(prefs.mode, r.id);
          return `<li><button class="region-row" data-region="${r.id}" aria-pressed="${r.id === prefs.region}" style="--line: ${r.color}">
            ${badge(r)}
            <span class="row-name">${r.name}<small>${r.tagline}</small></span>
            <span class="row-count">${countriesIn(r.id).length}</span>
            <span class="row-best">${best ? `${Math.round(best.score * 100)}%` : '—'}</span>
          </button></li>`;
        })
        .join('')}</ul>
    </div>`,
    )
    .join('');
  renderSelection();
}

/** Updates the highlighted row, the preview and the start bar for the selected region. */
function renderSelection() {
  const r = regionById(prefs.region);
  menu.querySelectorAll<HTMLElement>('.region-row').forEach((row) => row.setAttribute('aria-pressed', String(row.dataset.region === r.id)));
  const best = loadBest(prefs.mode, r.id);
  $('#preview', menu).innerHTML = `
    <div class="preview-map" style="--line: ${r.color}">${thumbFor(r)}</div>
    <div class="preview-body">
      <div class="preview-head">${badge(r)}<h2>${r.name}</h2></div>
      <p class="preview-tag">${r.tagline}</p>
      <dl class="preview-stats">
        <div><dt>Countries</dt><dd>${countriesIn(r.id).length}</dd></div>
        <div><dt>Best</dt><dd>${best ? `${Math.round(best.score * 100)}%` : '—'}</dd></div>
        <div><dt>Best time</dt><dd>${best ? formatTime(best.time) : '—'}</dd></div>
      </dl>
      <button class="btn start-btn" data-start>Start <span>${modeTitle(prefs.mode)}</span><kbd>Enter</kbd></button>
    </div>`;
  $('#start-bar').innerHTML = `
    <span class="start-bar-label">${badge(r)}<span><b>${r.name}</b><small>${modeTitle(prefs.mode)}</small></span></span>
    <button class="btn" data-start>Start</button>`;
}

function selectRegion(id: RegionId) {
  if (id === prefs.region) return;
  prefs.region = id;
  writePref('region', id);
  renderSelection();
}

function startSelected() {
  history.pushState({ fromMenu: true }, '', routeUrl(prefs.region, prefs.mode));
  start(prefs.region, countriesIn(prefs.region), true);
}

const pickRegion = (e: Event) => {
  const t = e.target as HTMLElement;
  const mode = t.closest<HTMLElement>('[data-mode]')?.dataset.mode as Mode | undefined;
  if (mode && mode !== prefs.mode) {
    prefs.mode = mode;
    writePref('mode', mode);
    sfx.click();
    renderMenu();
  }
  const region = t.closest<HTMLElement>('[data-region]')?.dataset.region as RegionId | undefined;
  if (region) selectRegion(region);
  if (t.closest('[data-start]')) startSelected();
  if (t.closest('#open-settings')) settings.showModal();
};
menu.addEventListener('click', pickRegion);
// Double-clicking a region starts it straight away.
menu.addEventListener('dblclick', (e) => {
  if ((e.target as HTMLElement).closest('[data-region]')) startSelected();
});

const settings = $<HTMLDialogElement>('#settings');
settings.addEventListener('click', (e) => {
  // Close on the ✕ or a click on the backdrop.
  if ((e.target as HTMLElement).closest('[data-close]') || e.target === settings) settings.close();
});

$('#opt-hints').addEventListener('change', (e) => {
  prefs.hints = (e.target as HTMLInputElement).checked;
  writePref('hints', prefs.hints ? '1' : '0');
});
$('#opt-sound').addEventListener('change', (e) => setMuted(!(e.target as HTMLInputElement).checked));
$<HTMLInputElement>('#opt-hints').checked = prefs.hints;
$<HTMLInputElement>('#opt-sound').checked = !isMuted();

// Arrow keys move through regions and Enter starts, on the menu only.
document.addEventListener('keydown', (e) => {
  if (menu.hidden || settings.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const i = REGIONS.findIndex((r) => r.id === prefs.region);
    const next = REGIONS[(i + (e.key === 'ArrowDown' ? 1 : -1) + REGIONS.length) % REGIONS.length];
    selectRegion(next.id);
    // Focus follows the selection, so Enter starts it rather than pressing whatever button had focus.
    menu.querySelector<HTMLElement>(`[data-region="${next.id}"]`)?.focus();
  }
  const onButton = (e.target as HTMLElement).closest('button');
  if (e.key === 'Enter' && (!onButton || onButton.matches('.region-row'))) {
    e.preventDefault();
    startSelected();
  }
});

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
  if (full && region !== prefs.region) {
    prefs.region = region;
    writePref('region', region);
  }
  pending = null;
  ranked = full && !prefs.hints;
  menu.hidden = true;
  play.hidden = false;
  document.title = `${regionById(region).name} · mapped!`;
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
  // One span, so the message wraps as a sentence beside the dot rather than as separate flex items.
  toastEl.innerHTML = `<span>${html}</span>`;
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
    navigator.vibrate?.(35);
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
  const region = regionById(g.region);
  const swatch = (c: Country, o: Outcome) =>
    o === 0 ? '<i class="swatch missed"></i>' : `<i class="swatch${o > 1 ? ' retry' : ''}" style="--k: ${COLOUR_OF.get(c.code)}"></i>`;
  $('#results-body').innerHTML = `
    <div class="res-main" tabindex="-1" autofocus>
      <header class="res-top">
        <span class="res-kicker">${badge(region)}<span>${region.name}</span><span class="sep">/</span><span>${g.mode === 'name' ? 'Name + Flag' : 'Flag only'}</span></span>
      </header>
      <div class="res-hero">
        <div class="res-score">${Math.round(score * 100)}<span>%</span></div>
        <div class="res-badges">
          ${record ? '<span class="record">New best</span>' : ''}
          <div class="rank-stamp">${rank}</div>
        </div>
      </div>
      <dl class="res-stats">
        <div><dt>Time</dt><dd>${formatTime(g.elapsed)}</dd></div>
        <div><dt>First try</dt><dd>${firstTry}<small>/${g.pool.length}</small></dd></div>
        <div><dt>Streak</dt><dd>${g.bestStreak}</dd></div>
      </dl>
      ${
        slips.length
          ? `<section class="res-review">
        <h3 class="res-sub">To review <span>${slips.length}</span></h3>
        <ul class="slips">${slips
          .map((c) => {
            const o = g.results.get(c.code)!;
            return `<li>${swatch(c, o)}<img src="${c.flag}" alt=""><span>${c.name}</span><em>${o ? `${o} tries` : 'Missed'}</em></li>`;
          })
          .join('')}</ul>
      </section>`
          : '<p class="flawless">Flawless. Every country on the first try.</p>'
      }
    </div>
    <footer class="res-actions${slips.length ? '' : ' no-retry'}">
      ${slips.length ? `<button class="btn res-primary" data-act="retry">Retry ${slips.length} to review</button>` : ''}
      <button class="btn ${slips.length ? 'alt' : ''}" data-act="again">Play again</button>
      <button class="btn alt" data-act="map">Map</button>
      <button class="btn alt" data-act="menu">Menu</button>
    </footer>`;
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
  if (act === 'menu') goMenu();
});

function toMenu() {
  results.close();
  clearInterval(timer);
  game = null;
  pending = null;
  play.hidden = true;
  menu.hidden = false;
  $('#show-results').hidden = true;
  document.title = 'mapped!';
  renderMenu();
}

play.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('#skip')) {
    game?.skip();
    sfx.click();
    showPrompt();
  }
  if (t.closest('#back')) goMenu();
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
  if (e.key === 'Escape') goMenu();
});

document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && !play.hidden && !results.open) e.preventDefault();
});

// ---------- Routing ----------
// "/" is the menu; "/<region>" plays it, with "?mode=flag" for Flag only. Browser back/forward move between them.

const isRegion = (id: string): id is RegionId => REGIONS.some((r) => r.id === id);

function routeUrl(region: RegionId, mode: Mode) {
  return `/${region}${mode === 'flag' ? '?mode=flag' : ''}`;
}

function applyRoute() {
  const id = location.pathname.replace(/^\/+|\/+$/g, '');
  if (!isRegion(id)) {
    if (id) history.replaceState(null, '', '/');
    toMenu();
    return;
  }
  const mode: Mode = new URLSearchParams(location.search).get('mode') === 'flag' ? 'flag' : 'name';
  if (mode !== prefs.mode) {
    prefs.mode = mode;
    writePref('mode', mode);
  }
  start(id, countriesIn(id), true);
}

/** Leaves a round for the menu: steps back through history when the menu is where we came from. */
function goMenu() {
  if (history.state?.fromMenu) history.back();
  else {
    history.replaceState(null, '', '/');
    toMenu();
  }
}

window.addEventListener('popstate', applyRoute);

// iOS Safari zooms the whole page on a pinch outside the map (HUD, prompt card); the map handles its own pinch.
document.addEventListener('gesturestart', (e) => {
  if (!play.hidden) e.preventDefault();
});

syncSound();
applyRoute();
