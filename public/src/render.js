import { COLS, VISIBLE_ROWS, HIDDEN_ROWS, SHAPES, pieceCells } from './engine.js';

export const COLORS = {
  I: '#4fd1ff',
  O: '#ffd84f',
  T: '#b678ff',
  S: '#5ee08a',
  Z: '#ff5d6c',
  J: '#5b7cff',
  L: '#ff9a4d',
};

const BOARD_BG = '#0e1126';
const GRID = 'rgba(120, 135, 220, 0.09)';
const FLASH_MS = 220;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function fit(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function tile(ctx, x, y, s, color, ghost = false) {
  const pad = Math.max(1, s * 0.055);
  const size = s - pad * 2;
  const radius = s * 0.2;
  if (ghost) {
    const lw = Math.max(1.5, s * 0.08);
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    roundRectPath(ctx, x + pad + lw / 2, y + pad + lw / 2, size - lw, size - lw, radius);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = color;
  roundRectPath(ctx, x + pad, y + pad, size, size, radius);
  ctx.fill();
  ctx.save();
  roundRectPath(ctx, x + pad, y + pad, size, size, radius);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.24)';
  ctx.fillRect(x + pad, y + pad, size, size * 0.3);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + pad, y + pad + size * 0.72, size, size * 0.28);
  ctx.restore();
}

function drawPreview(ctx, type, cx, cy, cell, dim = false) {
  const shape = SHAPES[type][0];
  let minR = 9, maxR = -1, minC = 9, maxC = -1;
  shape.forEach((row, r) => row.forEach((v, c) => {
    if (!v) return;
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }));
  const w = (maxC - minC + 1) * cell;
  const h = (maxR - minR + 1) * cell;
  const ox = cx - w / 2;
  const oy = cy - h / 2;
  ctx.save();
  if (dim) ctx.globalAlpha = 0.35;
  shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) tile(ctx, ox + (c - minC) * cell, oy + (r - minR) * cell, cell, COLORS[type]);
  }));
  ctx.restore();
}

export class Renderer {
  constructor({ board, hold, next }) {
    this.board = board;
    this.hold = hold;
    this.next = next;
    this.bctx = board.getContext('2d');
    this.hctx = hold.getContext('2d');
    this.nctx = next.getContext('2d');
    this.flashes = [];
  }

  flash(rows) {
    if (reducedMotion) return;
    this.flashes.push({ rows, t0: performance.now() });
  }

  draw(game, now, showPiece = true) {
    this._drawBoard(game, now, showPiece);
    this._drawHold(game);
    this._drawNext(game);
  }

  _drawBoard(game, now, showPiece) {
    const ctx = this.bctx;
    const { w, h } = fit(this.board);
    const cell = w / COLS;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BOARD_BG;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < COLS; c++) {
      ctx.moveTo(Math.round(c * cell) + 0.5, 0);
      ctx.lineTo(Math.round(c * cell) + 0.5, h);
    }
    for (let r = 1; r < VISIBLE_ROWS; r++) {
      ctx.moveTo(0, Math.round(r * cell) + 0.5);
      ctx.lineTo(w, Math.round(r * cell) + 0.5);
    }
    ctx.stroke();

    for (let r = HIDDEN_ROWS; r < game.board.length; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = game.board[r][c];
        if (t) tile(ctx, c * cell, (r - HIDDEN_ROWS) * cell, cell, COLORS[t]);
      }
    }

    if (showPiece && game.piece && !game.over) {
      const p = game.piece;
      const gy = game.ghostY();
      if (gy !== p.y) {
        for (const [x, y] of pieceCells(p.type, p.rot, p.x, gy)) {
          if (y >= HIDDEN_ROWS) tile(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, COLORS[p.type], true);
        }
      }
      for (const [x, y] of pieceCells(p.type, p.rot, p.x, p.y)) {
        if (y >= HIDDEN_ROWS) tile(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, COLORS[p.type]);
      }
    }

    this.flashes = this.flashes.filter((f) => now - f.t0 < FLASH_MS);
    for (const f of this.flashes) {
      ctx.fillStyle = `rgba(255,255,255,${1 - (now - f.t0) / FLASH_MS})`;
      for (const r of f.rows) ctx.fillRect(0, r * cell, w, cell);
    }
  }

  _drawHold(game) {
    const ctx = this.hctx;
    const { w, h } = fit(this.hold);
    ctx.clearRect(0, 0, w, h);
    if (game.held) drawPreview(ctx, game.held, w / 2, h / 2, w / 5, game.holdUsed);
  }

  _drawNext(game) {
    const ctx = this.nctx;
    const { w, h } = fit(this.next);
    ctx.clearRect(0, 0, w, h);
    const list = game.nextTypes(4);
    const slot = h / list.length;
    list.forEach((t, i) => drawPreview(ctx, t, w / 2, slot * i + slot / 2, w / 5));
  }
}
