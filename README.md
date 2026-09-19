# Tetris

Tetris nel browser: HTML + JavaScript vanilla, zero dipendenze lato client, zero build. Il gioco gira interamente su Cloudflare Workers: la UI è servita come asset statico e un piccolo Worker espone l'unica API necessaria, la classifica online.

## Struttura

```
public/            # tutto ciò che viene pubblicato come sito statico
  index.html        # schermate: menu, impostazioni, record, pausa, game over, board di gioco
  style.css
  _headers          # header di sicurezza (CSP, nosniff, ...) per gli asset statici
  audio/
    bitwise-adventure.mp3  # musica di sottofondo
  src/
    engine.js       # logica di gioco pura (nessun DOM)
    render.js       # rendering su canvas
    main.js         # input, game loop, menu/overlay, audio, classifica
worker/
  index.js          # Worker: serve gli asset e risponde a /api/leaderboard
  leaderboard.js     # logica pura di validazione/ordinamento (testata con node:test)
test/
  engine.test.mjs      # test del motore (node:test)
  leaderboard.test.mjs # test della logica della classifica (node:test)
wrangler.jsonc      # config Worker: asset statici + KV per la classifica
```

Il motore e la logica della classifica sono separati dal DOM/Cloudflare, quindi si testano da Node senza browser.

## Regole implementate

- Rotazioni SRS con wall kick, 7-bag, hold (una volta per pezzo), ghost piece, next queue (4 pezzi)
- Lock delay 500 ms con massimo 15 reset
- Punteggio: 100 / 300 / 500 / 800 per 1-4 linee × livello, +1 per cella di soft drop, +2 per cella di hard drop
- Livello +1 ogni 10 linee, gravità con curva Tetris Guideline
- Musica di sottofondo in loop a volume basso, mute e slider volume in Impostazioni (preferenze salvate in `localStorage`); parte al primo "Nuova partita" per rispettare le policy di autoplay del browser

## Menu e schermate

Il gioco si apre sul **menu principale** con tre voci:

- **Nuova partita** — avvia subito una partita.
- **Impostazioni** — volume/mute della musica. "Indietro" torna al menu.
- **Record** — classifica online con i migliori punteggi (vedi sotto). "Indietro" torna al menu.

Durante la partita, **P** o **Esc** aprono il **menu di pausa**:

- **Continua** — riprende la partita esattamente da dove si era.
- **Menu principale** — abbandona la partita in corso e torna al menu (la partita non viene salvata).

Il gioco entra in pausa automaticamente anche quando la scheda del browser perde il focus.

Alla fine della partita (**Game over**) viene mostrato il punteggio con un campo nome per salvarlo in classifica ("Salva punteggio"), più "Rigioca" e "Menu principale".

Il miglior punteggio personale (locale, per browser) resta visibile nella barra laterale come "Record" della sessione corrente, indipendentemente dalla classifica online.

## Classifica online: come funziona

Il sito è statico, quindi **senza un backend un punteggio "salvato" esisterebbe solo nel browser di chi gioca** (localStorage), non condiviso con nessun altro. Per avere una classifica visibile a tutti i giocatori il repo include un piccolo **Cloudflare Worker**:

- `GET /api/leaderboard` → restituisce i migliori 10 punteggi.
- `POST /api/leaderboard` → `{ name, score, lines, level }`, valida i dati e aggiorna la classifica.

I punteggi sono salvati in un **KV namespace** (`LEADERBOARD`) come un'unica lista JSON ordinata.

### Limiti della classifica (da sapere)

- **Non è a prova di manomissione.** Il punteggio arriva dal client: chiunque può inviare una richiesta `POST` diretta con un valore a piacere. Il server valida solo che i dati siano del tipo e nel range plausibile (interi, non negativi, punteggio sotto un tetto di sicurezza) — non può verificare che una partita reale abbia davvero prodotto quel punteggio, perché servirebbe rigiocare l'intera partita lato server.
- **Nessun anti-spam/rate-limit.** Chiunque può inviare molte richieste; per un gioco personale il rischio è basso, ma è un limite noto.
- **KV non è transazionale.** Se due persone salvano un punteggio nello stesso istante, in rari casi una scrittura può sovrascrivere l'altra (vince l'ultima). Accettabile per un piccolo gioco, non per una classifica competitiva seria.
- Il nome giocatore è ripulito lato server (solo lettere/numeri/spazi/`_.-`, max 16 caratteri) per evitare che finisca HTML o markup nella lista.

Se in futuro serve una classifica "seria" (anti-cheat reale, storicizzazione, rate-limit) la strada è sostituire il KV con una convalida server-side del replay della partita e/o D1 + Durable Objects — un lavoro sostanzialmente più grande di questo setup.

### Classifica online: setup

**Sviluppo locale** — funziona subito, senza account Cloudflare: `npx wrangler dev` avvia il Worker con una copia locale del KV (dati non condivisi con la produzione).

**Deploy in produzione** — il file `wrangler.jsonc` contiene un id KV segnaposto (`REPLACE_WITH_KV_NAMESPACE_ID`). Prima del primo deploy:

```bash
npx wrangler login
npx wrangler kv namespace create LEADERBOARD
```

Il comando stampa un `id`: incollalo in `wrangler.jsonc` al posto del segnaposto, poi:

```bash
npx wrangler deploy
```

Se deployi collegando il repo GitHub da dashboard (vedi sotto), aggiorna comunque `wrangler.jsonc` con l'id reale **prima** di collegare/pushare, altrimenti il primo deploy fallirà o resterà senza classifica funzionante.

## Comandi

| Tasto | Azione |
| --- | --- |
| ← → | Muovi (auto-repeat DAS 140 ms / ARR 35 ms) |
| ↑ / X | Ruota in senso orario |
| Z | Ruota in senso antiorario |
| ↓ | Discesa veloce |
| Spazio | Hard drop |
| C / Shift | Hold |
| P / Esc | Pausa / riprendi |

Nei menu, Tab/Invio/Spazio navigano e attivano i pulsanti come di consueto nel browser. Su touch compaiono i pulsanti a schermo durante la partita.

## Sviluppo

```bash
npm test          # test del motore e della classifica (node:test)
npx wrangler dev   # server locale: asset statici + Worker (API classifica inclusa)
```

`npx serve public` serve solo i file statici: utile per un'occhiata rapida alla UI, ma senza `wrangler dev` la schermata Record non troverà l'API e mostrerà "Classifica non disponibile".

## Deploy su Cloudflare (piano free)

Prima di tutto, crea il KV namespace e aggiorna `wrangler.jsonc` come descritto sopra in "Classifica online: setup".

**Opzione A: collegando il repo GitHub (deploy automatico a ogni push)**

1. Dashboard Cloudflare → Workers & Pages → Create → collega il repo `alessiobargigli-art/Tetris`.
2. Build command: vuoto. Output directory: `public`.
3. Assicurati che il binding KV `LEADERBOARD` sia configurato sul Worker anche da dashboard (Settings → Bindings), oltre che in `wrangler.jsonc`.
4. Ogni push su `main` ripubblica il sito.

**Opzione B: da riga di comando**

```bash
npx wrangler login
npx wrangler deploy
```

`wrangler.jsonc` punta già a `./public` per gli asset e a `worker/index.js` come entry point del Worker.
