// Motore di gioco puro: nessun accesso al DOM, quindi testabile con Node.
// Regole: SRS (rotazioni + wall kick), 7-bag, hold, ghost, lock delay con reset limitati.

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;
export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const LOCK_DELAY = 500; // ms a terra prima del lock
export const MAX_LOCK_RESETS = 15; // reset del lock delay per singolo "livello" raggiunto
const SOFT_DROP_FACTOR = 20;
const LINE_POINTS = [0, 100, 300, 500, 800];

const BASE = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};

function rotateCW(m) {
  const n = m.length;
  return m.map((_, r) => m.map((_, c) => m[n - 1 - c][r]));
}

// SHAPES[tipo][rotazione 0..3]
export const SHAPES = Object.fromEntries(
  TYPES.map((t) => {
    const states = [BASE[t]];
    for (let i = 1; i < 4; i++) states.push(rotateCW(states[i - 1]));
    return [t, states];
  })
);

// Tabelle SRS con y verso l'alto (come da specifica); in applicazione si inverte y.
const KICKS_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

export function pieceCells(type, rot, x, y) {
  const shape = SHAPES[type][rot];
  const out = [];
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) out.push([x + c, y + r]);
    }
  }
  return out;
}

export function gravityInterval(level) {
  const l = Math.max(1, level) - 1;
  return Math.max(1, Math.pow(0.8 - l * 0.007, l) * 1000);
}

export class Game {
  constructor(opts = {}) {
    this.rng = opts.rng ?? Math.random;
    this.startLevel = opts.startLevel ?? 1;
    this.scoreMultiplier = opts.scoreMultiplier ?? 1;
    this.onEvent = opts.onEvent ?? null;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.bag = [];
    this.queue = [];
    this.held = null;
    this.holdUsed = false;
    this.score = 0;
    this.lines = 0;
    this.level = this.startLevel;
    this.over = false;
    this.paused = false;
    this.softDropping = false;
    this.piece = null;
    this._fillQueue();
    this._spawn(this.queue.shift());
    this._fillQueue();
  }

  get active() {
    return !!this.piece && !this.over && !this.paused;
  }

  nextTypes(n = 4) {
    return this.queue.slice(0, n);
  }

  ghostY() {
    if (!this.piece) return 0;
    const { type, rot, x } = this.piece;
    let y = this.piece.y;
    while (this._fits(type, rot, x, y + 1)) y++;
    return y;
  }

  // ---- input ----
  move(dx) {
    if (!this.active) return false;
    const p = this.piece;
    if (!this._fits(p.type, p.rot, p.x + dx, p.y)) return false;
    p.x += dx;
    this._onAdjust();
    return true;
  }

  rotate(dir) {
    if (!this.active || this.piece.type === 'O') return false;
    const p = this.piece;
    const from = p.rot;
    const to = (from + dir + 4) % 4;
    const table = p.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    for (const [kx, ky] of table[`${from}${to}`]) {
      const nx = p.x + kx;
      const ny = p.y - ky;
      if (this._fits(p.type, to, nx, ny)) {
        p.rot = to;
        p.x = nx;
        p.y = ny;
        this._trackLowest();
        this._onAdjust();
        return true;
      }
    }
    return false;
  }

  setSoftDrop(on) {
    this.softDropping = !!on;
  }

  hardDrop() {
    if (!this.active) return;
    const p = this.piece;
    const target = this.ghostY();
    this._addScore(2 * (target - p.y));
    p.y = target;
    this._lock();
  }

  hold() {
    if (!this.active || this.holdUsed) return false;
    const current = this.piece.type;
    let next;
    if (this.held === null) {
      next = this.queue.shift();
      this._fillQueue();
    } else {
      next = this.held;
    }
    this.held = current;
    this._spawn(next);
    this.holdUsed = true;
    return true;
  }

  togglePause() {
    if (this.over) return;
    this.paused = !this.paused;
  }

  // ---- loop ----
  tick(dt) {
    if (!this.active) return;
    if (this._grounded()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_DELAY) this._lock();
      return;
    }
    this.lockTimer = 0;
    const base = gravityInterval(this.level);
    const interval = this.softDropping ? Math.max(base / SOFT_DROP_FACTOR, 20) : base;
    this.gravityAcc += dt;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (!this._step()) break;
      if (this.softDropping) this._addScore(1);
    }
  }

  // ---- internals ----
  _fits(type, rot, x, y) {
    for (const [cx, cy] of pieceCells(type, rot, x, y)) {
      if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
      if (cy >= 0 && this.board[cy][cx]) return false;
    }
    return true;
  }

  _grounded() {
    const p = this.piece;
    return !this._fits(p.type, p.rot, p.x, p.y + 1);
  }

  _step() {
    const p = this.piece;
    if (!this._fits(p.type, p.rot, p.x, p.y + 1)) return false;
    p.y += 1;
    this._trackLowest();
    return true;
  }

  _trackLowest() {
    if (this.piece.y > this.lowestY) {
      this.lowestY = this.piece.y;
      this.lockResets = 0;
    }
  }

  _onAdjust() {
    if (this._grounded()) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    } else {
      this.lockTimer = 0;
    }
  }

  _fillQueue() {
    while (this.queue.length < 7) {
      if (this.bag.length === 0) {
        this.bag = [...TYPES];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.rng() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop());
    }
  }

  _spawn(type) {
    this.piece = { type, rot: 0, x: type === 'O' ? 4 : 3, y: 1 };
    this.gravityAcc = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lowestY = this.piece.y;
    if (!this._fits(type, 0, this.piece.x, this.piece.y)) this._gameOver();
  }

  _gameOver() {
    this.over = true;
    this.softDropping = false;
    this._emit('gameover', { score: this.score, lines: this.lines, level: this.level });
  }

  _lock() {
    const p = this.piece;
    const cells = pieceCells(p.type, p.rot, p.x, p.y);
    for (const [cx, cy] of cells) this.board[cy][cx] = p.type;
    this._emit('lock', { type: p.type });

    const fullRows = [];
    for (let r = 0; r < ROWS; r++) {
      if (this.board[r].every(Boolean)) fullRows.push(r);
    }
    if (fullRows.length) {
      const keep = this.board.filter((_, r) => !fullRows.includes(r));
      const fresh = Array.from({ length: fullRows.length }, () => Array(COLS).fill(null));
      this.board = [...fresh, ...keep];
      this._addScore(LINE_POINTS[fullRows.length] * this.level);
      this.lines += fullRows.length;
      const newLevel = Math.max(this.startLevel, Math.floor(this.lines / 10) + 1);
      this._emit('clear', { rows: fullRows.map((r) => r - HIDDEN_ROWS), count: fullRows.length });
      if (newLevel > this.level) {
        this.level = newLevel;
        this._emit('levelup', { level: newLevel });
      }
    }

    // lock out: pezzo bloccato interamente sopra la zona visibile
    if (cells.every(([, cy]) => cy < HIDDEN_ROWS)) {
      this.piece = null;
      this._gameOver();
      return;
    }

    this.holdUsed = false;
    this._fillQueue();
    this._spawn(this.queue.shift());
    this._fillQueue();
  }

  _addScore(points) {
    this.score += Math.round(points * this.scoreMultiplier);
  }

  _emit(type, data) {
    if (this.onEvent) this.onEvent(type, data);
  }
}
