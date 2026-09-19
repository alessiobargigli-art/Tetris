import { Game } from './engine.js';
import { Renderer } from './render.js';

const $ = (id) => document.getElementById(id);

const DAS = 140; // ms prima dell'auto-repeat
const ARR = 35; // ms tra uno spostamento e l'altro
const BEST_KEY = 'tetris.best';
const VOLUME_KEY = 'tetris.musicVolume';
const MUTED_KEY = 'tetris.musicMuted';
const DEFAULT_VOLUME = 20; // percentuale, volume basso per non coprire gli effetti

let mode = 'ready'; // ready | playing | paused | over
let best = loadBest();

const game = new Game({ onEvent });
const renderer = new Renderer({ board: $('board'), hold: $('hold'), next: $('next') });

const hud = { score: $('score'), level: $('level'), lines: $('lines'), best: $('best') };
const overlay = { root: $('overlay'), title: $('overlay-title'), text: $('overlay-text'), btn: $('overlay-btn') };
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

// il primo play() avviene dentro un gesto utente (click/tasto "Gioca"),
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

// ---------- eventi del motore ----------
function onEvent(type, data) {
  if (type === 'clear') renderer.flash(data.rows);
  if (type === 'gameover') {
    if (game.score > best) { best = game.score; saveBest(best); }
    mode = 'over';
    releaseAll();
    showOverlay('Game over', `Punteggio ${game.score.toLocaleString('it-IT')} · ${game.lines} linee`, 'Riprova');
  }
}

// ---------- overlay ----------
function showOverlay(title, text, btn) {
  overlay.title.textContent = title;
  overlay.text.textContent = text;
  overlay.btn.textContent = btn;
  overlay.root.hidden = false;
  overlay.btn.focus({ preventScroll: true });
}
function hideOverlay() {
  overlay.root.hidden = true;
  overlay.btn.blur();
}

// ---------- stato ----------
function start() {
  game.reset();
  mode = 'playing';
  releaseAll();
  hideOverlay();
  startMusic();
}
function pause() {
  if (mode !== 'playing') return;
  mode = 'paused';
  game.paused = true;
  releaseAll();
  showOverlay('In pausa', 'Il gioco è fermo.', 'Riprendi');
  pauseMusic();
}
function resume() {
  if (mode !== 'paused') return;
  mode = 'playing';
  game.paused = false;
  hideOverlay();
  resumeMusic();
}
function primaryAction() {
  if (mode === 'paused') resume();
  else if (mode === 'ready' || mode === 'over') start();
}

overlay.btn.addEventListener('click', primaryAction);

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
  const isButton = e.target instanceof HTMLButtonElement;

  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (e.repeat) return;
    if (mode === 'playing') pause();
    else if (mode === 'paused') resume();
    return;
  }
  if (e.code === 'Enter' || (e.code === 'Space' && mode !== 'playing')) {
    if (isButton) return; // il click sul bottone gestisce già l'azione
    e.preventDefault();
    if (!e.repeat) primaryAction();
    return;
  }
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
  if (document.hidden) pause();
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
  renderer.draw(game, now, mode !== 'ready');
  updateHud();
  requestAnimationFrame(frame);
}

showOverlay('Tetris', 'Frecce per muovere, Su per ruotare, Spazio per il drop.', 'Gioca');
requestAnimationFrame(frame);
