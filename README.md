# Tetris

Tetris nel browser: HTML + JavaScript vanilla, zero dipendenze, zero build. Pensato per il hosting statico gratuito su Cloudflare.

## Struttura

```
public/            # tutto ciò che viene pubblicato
  index.html
  style.css
  _headers         # header di sicurezza (CSP, nosniff, ...)
  audio/
    bitwise-adventure.mp3  # musica di sottofondo
  src/
    engine.js      # logica di gioco pura (nessun DOM)
    render.js      # rendering su canvas
    main.js        # input, game loop, overlay, audio
test/
  engine.test.mjs  # test del motore (node:test)
wrangler.jsonc     # config per deploy con Wrangler
```

Il motore è separato dal rendering, quindi si testa da Node senza browser.

## Regole implementate

- Rotazioni SRS con wall kick, 7-bag, hold (una volta per pezzo), ghost piece, next queue (4 pezzi)
- Lock delay 500 ms con massimo 15 reset
- Punteggio: 100 / 300 / 500 / 800 per 1-4 linee × livello, +1 per cella di soft drop, +2 per cella di hard drop
- Livello +1 ogni 10 linee, gravità con curva Tetris Guideline
- Record salvato in `localStorage`
- Musica di sottofondo in loop a volume basso, con pulsante mute e slider volume (preferenze salvate in `localStorage`); parte al primo "Gioca" per rispettare le policy di autoplay del browser

## Comandi

| Tasto | Azione |
| --- | --- |
| ← → | Muovi (auto-repeat DAS 140 ms / ARR 35 ms) |
| ↑ / X | Ruota in senso orario |
| Z | Ruota in senso antiorario |
| ↓ | Discesa veloce |
| Spazio | Hard drop |
| C / Shift | Hold |
| P / Esc | Pausa |
| Invio | Inizia / riprendi |

Su touch compaiono i pulsanti a schermo.

## Sviluppo

```bash
npm test          # test del motore
npx wrangler dev  # server locale (oppure: npx serve public)
```

## Deploy su Cloudflare (piano free)

**Opzione A: collegando il repo GitHub (deploy automatico a ogni push)**

1. Dashboard Cloudflare → Workers & Pages → Create → collega il repo `alessiobargigli-art/Tetris`.
2. Build command: vuoto. Output directory: `public`.
3. Ogni push su `main` ripubblica il sito.

**Opzione B: da riga di comando**

```bash
npx wrangler login
npx wrangler deploy
```

`wrangler.jsonc` punta già a `./public`.
