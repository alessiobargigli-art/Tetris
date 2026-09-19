import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeName, validateEntry, insertEntry, MAX_ENTRIES, NAME_MAX_LEN, SCORE_MAX } from '../worker/leaderboard.js';

test('sanitizeName: rimuove HTML/simboli e taglia la lunghezza', () => {
  assert.equal(sanitizeName('  Mario  '), 'Mario');
  assert.equal(sanitizeName('<script>alert(1)</script>'), 'scriptalert1');
  assert.equal(sanitizeName('a'.repeat(50)).length, NAME_MAX_LEN);
});

test('sanitizeName: nome vuoto o assente diventa "Anonimo"', () => {
  assert.equal(sanitizeName(''), 'Anonimo');
  assert.equal(sanitizeName('   '), 'Anonimo');
  assert.equal(sanitizeName(undefined), 'Anonimo');
  assert.equal(sanitizeName('!!!'), 'Anonimo');
});

test('validateEntry: accetta un punteggio plausibile', () => {
  const e = validateEntry({ name: 'Ada', score: 1200, lines: 10, level: 2 }, 123);
  assert.deepEqual(e, { name: 'Ada', score: 1200, lines: 10, level: 2, ts: 123 });
});

test('validateEntry: rifiuta valori non interi, negativi o fuori range', () => {
  assert.equal(validateEntry({ score: 1.5, lines: 1, level: 1 }), null);
  assert.equal(validateEntry({ score: -1, lines: 1, level: 1 }), null);
  assert.equal(validateEntry({ score: SCORE_MAX + 1, lines: 1, level: 1 }), null);
  assert.equal(validateEntry({ score: 1, lines: -1, level: 1 }), null);
  assert.equal(validateEntry({ score: 1, lines: 1, level: 0 }), null);
  assert.equal(validateEntry({ score: 'x', lines: 1, level: 1 }), null);
});

test('insertEntry: ordina per punteggio decrescente e limita a MAX_ENTRIES', () => {
  let list = [];
  for (let i = 0; i < MAX_ENTRIES + 5; i++) {
    list = insertEntry(list, { name: `p${i}`, score: i, lines: 0, level: 1, ts: i });
  }
  assert.equal(list.length, MAX_ENTRIES);
  const scores = list.map((e) => e.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  assert.equal(scores[0], MAX_ENTRIES + 4);
});
