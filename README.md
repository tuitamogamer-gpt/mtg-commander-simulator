# MTG Commander Simulator

Desktop-only, browser-based Magic: The Gathering Commander simulator for 20 fixed, scripted preconstructed decks. The UI is in Bosnian (`lang="bs"`) and is designed for screens at least 1280 px wide.

Every opponent nonland spell is shown on a central action stage and waits for **Proceed**. The client also exposes real stack/priority passes, configurable end-step/combat/full-control stops, visible combat assignments, and deck/card certification reports.

## Running locally

Install dependencies and run a local static server:

```bash
npm install
npm run serve
```

Then visit `http://127.0.0.1:8000`.

## Verification

```bash
npm run check
npm test
npm run audit
npm run certify:strict
```

The generated per-deck/per-card results are in `reports/card-certification.md` and `reports/card-certification.json`.

## External services

The app calls one public, keyless service at runtime:

- **Scryfall** — `/cards/named` and card-symbol endpoints for card art and mana symbols

Deck data is bundled. Arbitrary/Moxfield deck import is intentionally not part of this product. No API keys or credentials are required or stored.

## Deployment

Deployed as a static site on Vercel. `index.html` loads the ES modules under `src/`; there is no production build step.
