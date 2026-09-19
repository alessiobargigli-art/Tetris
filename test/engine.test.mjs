import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Game, COLS, ROWS, TYPES, LOCK_DELAY, pieceCells, gravityInterval,
} from '../public/src/engine.js';

function seeded(seed = 1) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const newGame = (seed = 1) => new Game({ rng: seeded(seed) });

test('7-bag: i primi 7 pezzi sono tutti diversi', () => {
  const g = newGame();
  const seq = [g.piece.type, ...g.nextTypes(6)];
  assert.equal(new Set(seq).size, 7);
  assert.deepEqual([...seq].sort(), [...TYPES].sort());
});

test('spawn: il pezzo entra senza collisioni ed è nei limiti', () => {
  for (let s = 1; s <= 20; s++) {
    const g = newGame(s);
    assert.equal(g.over, false);
    for (const [x, y] of pieceCells(g.piece.type, g.piece.rot, g.piece.x, g.piece.y)) {
      assert.ok(x >= 0 && x < COLS && y >= 0 && y < ROWS);
    }
  }
});

test('move: si ferma contro il muro sinistro e destro', () => {
  const g = newGame();
  for (let i = 0; i < 20; i++) g.move(-1);
  const minX = Math.min(...pieceCells(g.piece.type, g.piece.rot, g.piece.x, g.piece.y).map(([x]) => x));
  assert.equal(minX, 0);
  for (let i = 0; i < 20; i++) g.move(1);
  const maxX = Math.max(...pieceCells(g.piece.type, g.piece.rot, g.piece.x, g.piece.y).map(([x]) => x));
  assert.equal(maxX, COLS - 1);
});

test('hardDrop: blocca il pezzo sul fondo, assegna 2 punti a cella e spawna il successivo', () => {
  const g = newGame();
  const expectedNext = g.nextTypes(1)[0];
  const startY = g.piece.y;
  const ghost = g.ghostY();
  g.hardDrop();
  assert.equal(g.score, 2 * (ghost - startY));
  assert.equal(g.piece.type, expectedNext);
  assert.ok(g.board[ROWS - 1].some(Boolean));
});

test('scoreMultiplier: raddoppia esattamente il punteggio a parità di azioni (hard drop)', () => {
  function playHardDrop(scoreMultiplier) {
    const g = new Game({ rng: seeded(1), scoreMultiplier });
    g.hardDrop();
    return g.score;
  }
  assert.equal(playHardDrop(2), playHardDrop(1) * 2);
});

test('scoreMultiplier: raddoppia esattamente il punteggio a parità di azioni (linea)', () => {
  function playLineClear(scoreMultiplier) {
    const g = new Game({ rng: seeded(1), scoreMultiplier });
    g.board[ROWS - 1] = Array(COLS).fill('Z');
    for (const c of [3, 4, 5, 6]) g.board[ROWS - 1][c] = null;
    g.piece = { type: 'I', rot: 0, x: 3, y: 1 };
    g.hardDrop();
    return g.score;
  }
  assert.equal(playLineClear(2), playLineClear(1) * 2);
});

test('linea singola: 100 punti x livello e la riga sparisce', () => {
  const g = newGame();
  g.board[ROWS - 1] = Array(COLS).fill('Z');
  for (const c of [3, 4, 5, 6]) g.board[ROWS - 1][c] = null;
  g.piece = { type: 'I', rot: 0, x: 3, y: 1 };
  g.hardDrop();
  assert.equal(g.lines, 1);
  assert.ok(g.score >= 100);
  assert.equal(g.board[ROWS - 1].every((c) => c === null), true);
});

test('tetris: 4 righe = 800 punti al livello 1', () => {
  const g = newGame();
  for (let r = ROWS - 4; r < ROWS; r++) {
    g.board[r] = Array(COLS).fill('Z');
    g.board[r][9] = null;
  }
  // I verticale (rot 1) occupa la colonna x+2
  g.piece = { type: 'I', rot: 1, x: 7, y: 0 };
  g.hardDrop();
  assert.equal(g.lines, 4);
  assert.ok(g.score >= 800);
});

test('livello sale ogni 10 linee', () => {
  const g = newGame();
  g.lines = 9;
  g.board[ROWS - 1] = Array(COLS).fill('Z');
  for (const c of [3, 4, 5, 6]) g.board[ROWS - 1][c] = null;
  g.piece = { type: 'I', rot: 0, x: 3, y: 1 };
  g.hardDrop();
  assert.equal(g.level, 2);
});

test('hold: scambia una volta sola per pezzo', () => {
  const g = newGame();
  const first = g.piece.type;
  assert.equal(g.hold(), true);
  assert.equal(g.held, first);
  assert.equal(g.hold(), false);
  g.hardDrop();
  assert.equal(g.hold(), true);
});

test('rotazione contro il muro usa i wall kick', () => {
  const g = newGame();
  g.piece = { type: 'T', rot: 0, x: 3, y: 5 };
  for (let i = 0; i < 20; i++) g.move(-1);
  assert.equal(g.rotate(1), true);
  const xs = pieceCells('T', g.piece.rot, g.piece.x, g.piece.y).map(([x]) => x);
  assert.ok(Math.min(...xs) >= 0);
});

test('O non ruota', () => {
  const g = newGame();
  g.piece = { type: 'O', rot: 0, x: 4, y: 5 };
  assert.equal(g.rotate(1), false);
});

test('lock delay: a terra il pezzo si blocca dopo LOCK_DELAY', () => {
  const g = newGame();
  g.piece.y = g.ghostY();
  const lockedBefore = g.board.flat().filter(Boolean).length;
  g.tick(LOCK_DELAY - 10);
  assert.equal(g.board.flat().filter(Boolean).length, lockedBefore);
  g.tick(20);
  assert.equal(g.board.flat().filter(Boolean).length, lockedBefore + 4);
});

test('gravità: cade di una riga dopo un intervallo', () => {
  const g = newGame();
  const y0 = g.piece.y;
  g.tick(gravityInterval(1) + 1);
  assert.equal(g.piece.y, y0 + 1);
});

test('game over: se lo spawn è bloccato', () => {
  const g = newGame();
  // righe piene tranne l'ultima colonna, così non vengono cancellate al lock
  for (let r = 0; r < 4; r++) {
    g.board[r] = Array(COLS).fill('Z');
    g.board[r][COLS - 1] = null;
  }
  g.hardDrop();
  assert.equal(g.over, true);
});

test('pausa blocca tick e input', () => {
  const g = newGame();
  const y0 = g.piece.y;
  g.togglePause();
  g.tick(5000);
  assert.equal(g.move(1), false);
  assert.equal(g.piece.y, y0);
});
