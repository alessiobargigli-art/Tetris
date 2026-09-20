import { Game } from './engine.js';
import { Renderer } from './render.js';

const $ = (id) => document.getElementById(id);

const DAS = 140; // ms prima dell'auto-repeat
const ARR = 35; // ms tra uno spostamento e l'altro
const BEST_KEY = 'tetris.best';
const VOLUME_KEY = 'tetris.musicVolume';
const MUTED_KEY = 'tetris.musicMuted';
const NAME_KEY = 'tetris.playerName';
const START_LEVEL_KEY = 'tetris.startLevel';
const SHOW_GHOST_KEY = 'tetris.showGhost';
const DEFAULT_VOLUME = 20; // percentuale, volume basso per non coprire gli effetti
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 10;
const NO_GHOST_SCORE_MULTIPLIER = 1.2; // bonus punteggio se si disattiva il ghost piece
const LEADERBOARD_URL = '/api/leaderboard';

// schermate mostrate prima/senza una partita attiva: il pezzo non va disegnato
const MENU_MODES = new Set(['menu', 'settings', 'leaderboard']);

// ---------- logo "TETRIS" a mattoncini (menu principale) ----------
// font a matrice di punti 5x7, un carattere per riga di stringa ('1' = mattoncino)
const LOGO_GLYPHS = {
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
};
const LOGO_WORD = ['T', 'E', 'T', 'R', 'I', 'S'];
const LOGO_COLORS = ['#4fd1ff', '#ffd84f', '#b678ff', '#5ee08a', '#ff5d6c', '#5b7cff'];
const LOGO_LETTER_WIDTH = 5;
const LOGO_LETTER_GAP = 1;
const LOGO_STAGGER_MS = 22; // sfasamento tra una colonna e l'altra, per l'effetto "cascata"

function buildLogo() {
  const el = $('tetris-logo');
  let col = 0;
  LOGO_WORD.forEach((letter, li) => {
    const glyph = LOGO_GLYPHS[letter];
    const color = LOGO_COLORS[li % LOGO_COLORS.length];
    for (let r = 0; r < glyph.length; r++) {
      for (let c = 0; c < LOGO_LETTER_WIDTH; c++) {
        if (glyph[r][c] !== '1') continue;
        const brick = document.createElement('span');
        brick.className = 'brick';
        brick.style.gridColumn = String(col + c + 1);
        brick.style.gridRow = String(r + 1);
        brick.style.setProperty('--tcolor', color);
        brick.style.animationDelay = `${(col + c) * LOGO_STAGGER_MS}ms`;
        el.appendChild(brick);
      }
    }
    col += LOGO_LETTER_WIDTH + LOGO_LETTER_GAP;
  });
  el.style.setProperty('--cols', String(col - LOGO_LETTER_GAP));
}

let mode = 'menu'; // menu | settings | leaderboard | playing | paused | gameover
let best = loadBest();

const game = new Game({ onEvent });
const renderer = new Renderer({ board: $('board'), hold: $('hold'), next: $('next') });

const hud = { score: $('score'), level: $('level'), lines: $('lines'), best: $('best') };
const overlayRoot = $('overlay');
const screens = {
  menu: $('screen-menu'),
  settings: $('screen-settings'),
  leaderboard: $('screen-leaderboard'),
  paused: $('screen-pause'),
  gameover: $('screen-gameover'),
};
let shown = {};

// ---------- storage ----------
function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* storage non disponibile */ }
}
function loadVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 100 ? v : DEFAULT_VOLUME;
  } catch { return DEFAULT_VOLUME; }
}
function loadMuted() {
  try { return localStorage.getItem(MUTED_KEY) === '1'; } catch { return false; }
}
function loadName() {
  try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}
function loadStartLevel() {
  try {
    const raw = localStorage.getItem(START_LEVEL_KEY);
    if (raw === null) return MIN_START_LEVEL;
    const v = Number(raw);
    return Number.isInteger(v) && v >= MIN_START_LEVEL && v <= MAX_START_LEVEL ? v : MIN_START_LEVEL;
  } catch { return MIN_START_LEVEL; }
}
function loadShowGhost() {
  try {
    const raw = localStorage.getItem(SHOW_GHOST_KEY);
    return raw === null ? true : raw === '1';
  } catch { return true; }
}
function saveSetting(key, v) {
  try { localStorage.setItem(key, String(v)); } catch { /* storage non disponibile */ }
}

// ---------- musica di sottofondo ----------
const bgm = $('bgm');
const muteBtn = $('mute-btn');
const volumeSlider = $('volume');
let musicStarted = false;

function updateMuteBtn() {
  const silent = bgm.muted || bgm.volume === 0;
  muteBtn.textContent = silent ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', String(bgm.muted));
}

volumeSlider.value = String(loadVolume());
bgm.volume = Number(volumeSlider.value) / 100;
bgm.muted = loadMuted();
updateMuteBtn();

volumeSlider.addEventListener('input', () => {
  bgm.volume = Number(volumeSlider.value) / 100;
  saveSetting(VOLUME_KEY, volumeSlider.value);
  if (bgm.volume > 0 && bgm.muted) {
    bgm.muted = false;
    saveSetting(MUTED_KEY, '0');
  }
  updateMuteBtn();
});

muteBtn.addEventListener('click', () => {
  bgm.muted = !bgm.muted;
  saveSetting(MUTED_KEY, bgm.muted ? '1' : '0');
  updateMuteBtn();
});

// ---------- difficoltà iniziale ----------
const startLevelSelect = $('start-level');
startLevelSelect.value = String(loadStartLevel());
startLevelSelect.addEventListener('change', () => {
  saveSetting(START_LEVEL_KEY, startLevelSelect.value);
});

// ---------- suggerimento (ghost piece) ----------
const showGhostCheckbox = $('show-ghost');
showGhostCheckbox.checked = loadShowGhost();
let ghostVisible = showGhostCheckbox.checked; // catturato all'avvio della partita, vedi startGame()
showGhostCheckbox.addEventListener('change', () => {
  saveSetting(SHOW_GHOST_KEY, showGhostCheckbox.checked ? '1' : '0');
});

// il primo play() avviene dentro un gesto utente (click su "Nuova partita"),
// come richiesto dalle policy di autoplay dei browser
function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  bgm.play().catch(() => { musicStarted = false; });
}
function resumeMusic() {
  if (musicStarted) bgm.play().catch(() => {});
}
function pauseMusic() {
  bgm.pause();
}

// ---------- classifica online ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function renderLeaderboard(entries) {
  const list = $('leaderboard-list');
  if (!entries || entries.length === 0) {
    list.innerHTML = '<li class="leaderboard-empty">Nessun punteggio ancora. Sii il primo!</li>';
    return;
  }
  list.innerHTML = entries.map((e, i) => `
    <li>
      <span class="rank">${i + 1}</span>
      <span class="name">${escapeHtml(e.name)}</span>
      <span class="score">${Number(e.score).toLocaleString('it-IT')}</span>
    </li>
  `).join('');
}

async function loadLeaderboard() {
  const list = $('leaderboard-list');
  list.innerHTML = '<li class="leaderboard-empty">Caricamento…</li>';
  try {
    const res = await fetch(LEADERBOARD_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const { entries } = await res.json();
    renderLeaderboard(entries);
  } catch {
    list.innerHTML = '<li class="leaderboard-empty">Classifica non disponibile al momento.</li>';
  }
}

async function submitScore(name, score, lines, level) {
  const res = await fetch(LEADERBOARD_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, score, lines, level }),
  });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

$('score-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('player-name').value.trim() || 'Anonimo';
  saveSetting(NAME_KEY, name);
  const btn = e.currentTarget.querySelector('button[type="submit"]');
  const status = $('score-status');
  btn.disabled = true;
  status.textContent = 'Invio…';
  try {
    await submitScore(name, game.score, game.lines, game.level);
    status.textContent = 'Punteggio salvato!';
  } catch {
    status.textContent = 'Impossibile salvare il punteggio. Riprova più tardi.';
    btn.disabled = false;
  }
});

// ---------- eventi del motore ----------
function onEvent(type, data) {
  if (type === 'clear') renderer.flash(data.rows);
  if (type === 'gameover') {
    if (game.score > best) { best = game.score; saveBest(best); }
    mode = 'gameover';
    releaseAll();
    $('gameover-text').textContent = `Punteggio ${game.score.toLocaleString('it-IT')} · ${game.lines} linee`;
    $('player-name').value = loadName();
    $('score-status').textContent = '';
    $('score-form').querySelector('button[type="submit"]').disabled = false;
    showScreen('gameover');
  }
}

// ---------- schermate overlay ----------
let introPlayed = false;
function showScreen(name) {
  overlayRoot.hidden = false;
  // il backdrop-filter su #overlay crea un containing block per i figli
  // "position: fixed", impedendo al menu a schermo intero di coprire il
  // viewport: lo disattiviamo solo mentre è mostrato quel menu
  overlayRoot.classList.toggle('overlay-plain', name === 'menu');
  if (name === 'menu') {
    // passare da display:none a visibile fa ripartire le animazioni CSS dei
    // figli: l'ingresso cinematografico deve giocare solo la prima volta
    screens.menu.classList.toggle('no-intro', introPlayed);
    introPlayed = true;
  }
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  screens[name].querySelector('button, input')?.focus({ preventScroll: true });
}
function hideOverlay() {
  overlayRoot.hidden = true;
}

// ---------- stato / navigazione ----------
function openMenu() {
  mode = 'menu';
  releaseAll();
  showScreen('menu');
}
function openSettings() {
  mode = 'settings';
  showScreen('settings');
}
function openLeaderboard() {
  mode = 'leaderboard';
  showScreen('leaderboard');
  loadLeaderboard();
}
function startGame() {
  game.startLevel = Number(startLevelSelect.value) || MIN_START_LEVEL;
  ghostVisible = showGhostCheckbox.checked;
  game.scoreMultiplier = ghostVisible ? 1 : NO_GHOST_SCORE_MULTIPLIER;
  game.reset();
  mode = 'playing';
  releaseAll();
  hideOverlay();
  startMusic();
}
function pauseGame() {
  if (mode !== 'playing') return;
  mode = 'paused';
  game.paused = true;
  releaseAll();
  showScreen('paused');
  pauseMusic();
}
function resumeGame() {
  if (mode !== 'paused') return;
  mode = 'playing';
  game.paused = false;
  hideOverlay();
  resumeMusic();
}

overlayRoot.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-menu]');
  if (!btn) return;
  const action = btn.dataset.menu;
  if (action === 'play') startGame();
  else if (action === 'settings') openSettings();
  else if (action === 'leaderboard') openLeaderboard();
  else if (action === 'back') openMenu();
  else if (action === 'resume') resumeGame();
  else if (action === 'quit') openMenu();
});

// ---------- input: auto-repeat laterale ----------
const held = []; // stack delle direzioni premute (l'ultima vince)
const das = { dir: 0, wait: 0, acc: 0 };

function pressDir(d) {
  if (!held.includes(d)) held.push(d);
  das.dir = d;
  das.wait = DAS;
  das.acc = 0;
  if (mode === 'playing') game.move(d);
}
function releaseDir(d) {
  const i = held.indexOf(d);
  if (i >= 0) held.splice(i, 1);
  const next = held[held.length - 1] ?? 0;
  if (next !== das.dir) {
    das.dir = next;
    das.wait = DAS;
    das.acc = 0;
  }
}
function releaseAll() {
  held.length = 0;
  das.dir = 0;
  game.setSoftDrop(false);
}
function updateInput(dt) {
  if (!das.dir) return;
  if (das.wait > 0) {
    das.wait -= dt;
    if (das.wait > 0) return;
    das.acc = -das.wait;
    das.wait = 0;
  } else {
    das.acc += dt;
  }
  while (das.acc >= ARR) {
    das.acc -= ARR;
    game.move(das.dir);
  }
}

// ---------- azioni condivise tra tastiera e touch ----------
const actions = {
  left: { down: () => pressDir(-1), up: () => releaseDir(-1) },
  right: { down: () => pressDir(1), up: () => releaseDir(1) },
  soft: { down: () => game.setSoftDrop(true), up: () => game.setSoftDrop(false) },
  rotcw: { down: () => game.rotate(1) },
  rotccw: { down: () => game.rotate(-1) },
  hard: { down: () => game.hardDrop() },
  hold: { down: () => game.hold() },
};

function run(name, phase) {
  if (mode !== 'playing') return;
  actions[name]?.[phase]?.();
}

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowDown: 'soft', KeyS: 'soft',
  ArrowUp: 'rotcw', KeyX: 'rotcw', KeyW: 'rotcw',
  KeyZ: 'rotccw',
  Space: 'hard',
  KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
};

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (e.repeat) return;
    if (mode === 'playing') pauseGame();
    else if (mode === 'paused') resumeGame();
    return;
  }
  // durante i menu i tasti di gioco non intercettano nulla: frecce/spazio/tab
  // restano liberi per la navigazione nativa tra i pulsanti
  if (mode !== 'playing') return;
  const name = KEYMAP[e.code];
  if (!name) return;
  e.preventDefault();
  if (e.repeat) return;
  run(name, 'down');
});

window.addEventListener('keyup', (e) => {
  const name = KEYMAP[e.code];
  if (name) run(name, 'up');
});

// touch / mouse sui pulsanti a schermo
document.querySelectorAll('[data-action]').forEach((btn) => {
  const name = btn.dataset.action;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('is-down');
    run(name, 'down');
  });
  const end = () => {
    btn.classList.remove('is-down');
    run(name, 'up');
  };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
});

// pausa automatica quando la scheda perde il focus
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
window.addEventListener('blur', () => releaseAll());

// ---------- HUD + loop ----------
function updateHud() {
  const next = {
    score: game.score,
    level: game.level,
    lines: game.lines,
    best: Math.max(best, game.score),
  };
  for (const k of Object.keys(next)) {
    if (shown[k] !== next[k]) {
      hud[k].textContent = next[k].toLocaleString('it-IT');
      shown[k] = next[k];
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  if (mode === 'playing') {
    updateInput(dt);
    game.tick(dt);
  }
  renderer.draw(game, now, !MENU_MODES.has(mode), ghostVisible);
  updateHud();
  requestAnimationFrame(frame);
}

buildLogo();
showScreen('menu');
requestAnimationFrame(frame);

// registra il service worker: abilita l'installazione come PWA e il replay offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline/PWA non essenziale al gioco */ });
  });
}
