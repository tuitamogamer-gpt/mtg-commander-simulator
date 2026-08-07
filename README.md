# MTG Commander Simulator

A single-file, browser-based Magic: The Gathering Commander (EDH) simulator. No build step, no dependencies, no server — open `index.html` and play.

The UI is in Bosnian (`lang="bs"`).

## Running locally

Open the file directly:

```bash
open index.html
```

Or serve it over HTTP (needed for the Scryfall/Moxfield lookups to behave like production):

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000

## External services

The app calls two public, keyless APIs at runtime:

- **Scryfall** — `api.scryfall.com/cards/collection` and `/cards/named` for card data and images
- **Moxfield** — `api2.moxfield.com/v3/decks/all/{id}` for importing decklists

No API keys or credentials are required or stored.

## Deployment

Deployed as a static site on Vercel. `index.html` at the repository root is served as-is; there is no build step.
