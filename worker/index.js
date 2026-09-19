import { validateEntry, insertEntry } from './leaderboard.js';

const KV_KEY = 'top';

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

async function readLeaderboard(env) {
  const raw = await env.LEADERBOARD.get(KV_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function handleGet(env) {
  return json({ entries: await readLeaderboard(env) });
}

async function handlePost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON non valido' }, { status: 400 });
  }

  const entry = validateEntry(body);
  if (!entry) return json({ error: 'Punteggio non valido' }, { status: 400 });

  // Nota: KV non offre transazioni. Due submit concorrenti possono in rari
  // casi sovrascriversi a vicenda (l'ultimo write vince). Accettabile per
  // una classifica di un piccolo gioco, vedi README.
  const current = await readLeaderboard(env);
  const updated = insertEntry(current, entry);
  await env.LEADERBOARD.put(KV_KEY, JSON.stringify(updated));

  return json({ entries: updated }, { status: 201 });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/leaderboard') {
      if (request.method === 'GET') return handleGet(env);
      if (request.method === 'POST') return handlePost(request, env);
      return json({ error: 'Metodo non permesso' }, { status: 405, headers: { allow: 'GET, POST' } });
    }
    return env.ASSETS.fetch(request);
  },
};
