# MTG Commander Simulator

Responsive, browser-based Magic: The Gathering Commander simulator for 27 fixed, scripted preconstructed decks. The UI is in English (`lang="en"`) and supports desktop, tablet, and mobile layouts.

Every opponent nonland spell is shown on a central action stage and waits for **Proceed**. The client also exposes real stack/priority passes, configurable end-step/combat/full-control stops, visible combat assignments, and deck/card certification reports.

Bots use the local heuristic/simulation-based **Commander AI Engine V2**. It has hidden-information-safe player views, per-deck profiles, multiplayer threat evaluation, seedable beam search and a structured decision log; it uses no AI/model/API service. See [`docs/COMMANDER_AI_ENGINE.md`](docs/COMMANDER_AI_ENGINE.md).

## Running locally

Install dependencies and run a local static server:

```bash
npm install
npm run serve
```

Then visit `http://127.0.0.1:8000`.

## Debug snapshots and replay

During a solo game, open **Game Menu → Download debug snapshot** to save a share-safe `mtg-commander-debug/v1` JSON report. It includes the seed, table configuration, public checkpoint, recent public log, and AI decision trace, while redacting hand, library, exile, and controller-only face-down identities.

Use **Import debug snapshot** on the Main Page to validate the file and restore its deck, commanders, AI decks/styles, difficulty, Politics, house rule, and seed. The imported configuration starts deterministically from turn 1; the public checkpoint is reference evidence rather than a mid-game save. Online-room snapshots are reported but are not currently accepted by the solo replay importer.

## Verification

```bash
npm run check
npm test
npm run audit
npm run certify:strict
npm run test:ai
npm run benchmark:ai
```

The generated per-deck/per-card results are in `reports/card-certification.md` and `reports/card-certification.json`.

## Card images and external services

Card art and mana symbols are bundled locally. The 17 flavor-name prints that cannot be resolved by Scryfall's collection endpoint use its named image API at runtime, with the local card back as an error fallback. `npm run sync:card-images` is the explicit maintenance command that resolves the fixed deck/token inventory through Scryfall, converts it to WebP, and regenerates the hardcoded manifest in `src/card-images.js`.

Deck data is also bundled. Arbitrary/Moxfield deck import is intentionally not part of this product. No API keys or credentials are required or stored.

## Deployment

Deployed as a static site on Vercel. `index.html` loads the ES modules under `src/`; there is no production build step.
