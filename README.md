# Tetris

Tetris nel browser: HTML + JavaScript vanilla, zero dipendenze lato client, zero build. Il gioco gira interamente su Cloudflare Workers: la UI è servita come asset statico e un piccolo Worker espone l'unica API necessaria, la classifica online.

## Struttura

```
public/            # tutto ciò che viene pubblicato come sito statico
  index.html        # schermate: menu, impostazioni, record, pausa, game over, board di gioco
  style.css
  _headers          # header di sicurezza (CSP, nosniff, ...) per gli asset statici
  manifest.webmanifest  # manifest PWA (installabilità su Android/desktop)
  sw.js             # service worker: cache dell'app shell, gioco offline
  audio/
    bitwise-adventure.mp3  # musica di sottofondo
  images/
    bg.svg          # illustrazione di sfondo (tetramini + bagliori)
    icon.svg        # favicon
    icon-192.png, icon-512.png  # icone PWA (manifest), generate da icon.svg
    apple-touch-icon.png  # icona per la home screen iOS, generata da icon.svg
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
- Punteggio: 100 / 300 / 500 / 800 per 1-4 linee × livello, +1 per cella di soft drop, +2 per cella di hard drop; +20% su tutti i punti se il ghost piece è disattivato in Impostazioni
- Livello +1 ogni 10 linee, gravità con curva Tetris Guideline
- Musica di sottofondo in loop a volume basso, mute e slider volume in Impostazioni (preferenze salvate in `localStorage`); parte al primo "Nuova partita" per rispettare le policy di autoplay del browser
- Sfondo illustrato in SVG (`public/images/bg.svg`), fitto di sagome dei sette tetramini classici sparse su tutto il canvas, bagliori sfumati e un leggero effetto scanline in stile CRT vintage; resta dietro pannelli e board, che restano opachi

## Menu e schermate

Il gioco si apre sul **menu principale a schermo intero**: il logo "TETRIS" si assembla con un'entrata cinematografica (mattoncini colorati che cadono a cascata da sinistra a destra, come tetramini, con un piccolo flash finale), sottotitolo "by Flax" e i pulsanti del menu, che compaiono in sequenza. L'animazione gioca una sola volta all'avvio; tornando al menu in seguito (da Impostazioni, Record o dalla pausa) il logo è già assemblato, senza rifare l'ingresso. Rispetta `prefers-reduced-motion`: chi lo richiede vede tutto già a posto, senza animazioni.

Il menu principale ha tre voci:

- **Nuova partita** — avvia subito una partita.
- **Impostazioni** — volume/mute della musica, difficoltà iniziale (livello 1-10) e visibilità del ghost piece; tutte si applicano alla prossima "Nuova partita", una partita già in corso non cambia. Disattivare il ghost piece dà un bonus di +20% su tutto il punteggio della partita. "Indietro" torna al menu.
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

**Deploy in produzione** — il KV namespace `TetrisLeaderboard` è già creato e il suo id è già in `wrangler.jsonc`, quindi basta:

```bash
npx wrangler login
npx wrangler deploy
```

Se in futuro serve ricreare il namespace (es. altro account Cloudflare, o un fork del progetto):

```bash
npx wrangler kv namespace create LEADERBOARD
```

Il comando stampa un `id`: va incollato in `wrangler.jsonc` al posto di quello esistente, prima del deploy.

## Installazione come app (PWA)

Il sito è una PWA installabile: `manifest.webmanifest` (nome, icone 192/512px, colori) più `sw.js` (service worker che mette in cache l'app shell) soddisfano i criteri di installabilità di Android/Chrome desktop, e permettono di rigiocare offline una volta caricata la pagina almeno una volta (la classifica online resta esclusa dalla cache, richiede sempre la rete).

Da sapere:
- Su iOS/Safari non esiste un popup automatico: si installa da Condividi → "Aggiungi alla schermata Home" (le meta tag `apple-mobile-web-app-*` e `apple-touch-icon` sono già a posto per quel percorso).
- Su Android/Chrome il popup automatico ("Aggiungi a schermata Home") non è garantito al primo caricamento: Chrome applica un'euristica di "engagement" (a volte richiede una seconda visita o qualche decina di secondi sulla pagina) e lo sopprime se l'utente lo ha già chiuso in passato per questo sito. Se non compare da solo, il menu di Chrome (⋮) ha comunque sempre la voce "Installa app"/"Aggiungi a schermata Home" quando il sito è installabile.

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

Il KV namespace è già configurato in `wrangler.jsonc` (vedi "Classifica online: setup" sopra).

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
