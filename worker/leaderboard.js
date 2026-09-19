// Logica pura della classifica: nessuna API di Cloudflare, testabile da Node.

export const MAX_ENTRIES = 10;
export const NAME_MAX_LEN = 16;
export const SCORE_MAX = 9_999_999; // tetto di sicurezza, ben oltre ciò che è raggiungibile in una partita reale

export function sanitizeName(raw) {
  const trimmed = String(raw ?? '').trim().slice(0, NAME_MAX_LEN);
  const cleaned = trimmed.replace(/[^\p{L}\p{N} _.-]/gu, '');
  return cleaned || 'Anonimo';
}

// Valida un payload grezzo e restituisce una entry pulita, o null se non valido.
// Nota: punteggio, linee e livello arrivano dal client e non sono verificabili
// lato server senza rigiocare la partita, quindi qui si controllano solo
// tipo e range plausibili (vedi README, sezione "Limiti della classifica").
export function validateEntry(body, now = Date.now()) {
  const score = Number(body?.score);
  const lines = Number(body?.lines);
  const level = Number(body?.level);
  if (!Number.isInteger(score) || score < 0 || score > SCORE_MAX) return null;
  if (!Number.isInteger(lines) || lines < 0) return null;
  if (!Number.isInteger(level) || level < 1) return null;
  return { name: sanitizeName(body?.name), score, lines, level, ts: now };
}

export function insertEntry(list, entry) {
  const next = [...list, entry];
  next.sort((a, b) => b.score - a.score);
  return next.slice(0, MAX_ENTRIES);
}
