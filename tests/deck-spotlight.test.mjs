import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/app.js');
const main = read('../src/modules/main.js');
const css = read('../src/frontend-overhaul.css');
const ui = read('../src/modules/ui.js');

test('custom-deck Judge is a game-menu action and never an extra main-phase action', () => {
  const menu = ui.slice(ui.indexOf('    renderQuickMenu(g)'), ui.indexOf('    renderLastResortConfirm()'));
  const mainPhase = ui.slice(ui.indexOf("        case 'main':"), ui.indexOf("        case 'priority':"));
  assert.match(menu, /action\('Judge', 'Manual card actions'/);
  assert.match(menu, /this\.quickMenuOpen = false;\s*this\.showJudge = true;/);
  assert.match(menu, /const canUseJudge = \(\) => \['main', 'manualResolve'\]\.includes\(this\.pending\?\.q\.type\)/);
  assert.match(menu, /if \(!canUseJudge\(\)\) return;/, 'recheck the safe decision point when clicked');
  assert.match(menu, /judge\.disabled = !canUseJudge\(\)/);
  assert.doesNotMatch(mainPhase, /Judge|judgeBtn/);
  assert.match(ui, /case 'manualResolve':[\s\S]*?Open Judge panel/, 'manual resolution retains its required contextual control');
});

test('custom deck names are attribute-escaped in explorer recommendations and alternatives', () => {
  assert.ok(main.includes('data-deck-rec="${escAttr(entry.dataset.deck)}"'));
  assert.ok(main.includes('data-alt-deck="${escAttr(entry.dataset.deck)}"'));
});

test('every active deck has a complete spotlight guide with real signature cards', () => {
  const MTG = loadEngine();
  const activeDecks = Object.entries(MTG.DECKS).filter(([, deck]) => !deck.custom);
  assert.equal(Object.keys(MTG.DECK_GUIDES).length, activeDecks.length);

  for (const [name, deck] of activeDecks) {
    const guide = MTG.DECK_GUIDES[name];
    assert.ok(guide, `${name} is missing a Deck Spotlight guide`);
    assert.ok(MTG.DECK_GUIDE_ROUTES[guide.route], `${name} uses an unknown rhythm route`);
    assert.match(guide.pace, /\S/);
    assert.match(guide.complexity, /^(Approachable|Intermediate|Advanced)$/);
    for (const field of ['theme', 'plan', 'mulligan', 'tip']) {
      assert.ok(guide[field].length >= 40, `${name} ${field} is too thin to guide a player`);
    }
    assert.equal(guide.keys.length, 3, `${name} should spotlight exactly three key cards`);
    assert.equal(new Set(guide.keys).size, 3, `${name} key cards should be distinct`);
    const deckCards = new Set(deck.cards.map(card => card.name));
    for (const cardName of guide.keys) {
      assert.ok(deckCards.has(cardName), `${name} spotlight key is not in the deck: ${cardName}`);
      assert.ok(MTG.DEFS[cardName], `${name} spotlight key has no card definition: ${cardName}`);
    }
  }
});

test('deck selection opens an accessible, actionable spotlight without disrupting replay import', () => {
  assert.ok(app.indexOf("import './modules/deck-guides.js'") < app.indexOf("import './modules/loader.js'"));
  assert.match(main, /const openDeckSpotlight = \(name, returnFocus\) =>/);
  assert.match(main, /class="deckspotlightvideo" muted autoplay loop playsinline/);
  assert.match(main, /class="deckspotlightrhythm"/);
  assert.match(main, /class="deckspotlightfieldguide"/);
  assert.match(main, /class="deckspotlightkeys"/);
  assert.match(main, /if \(!state\.applyingReplay\) openDeckSpotlight\(name, card\)/);
  assert.match(main, /U\.enhanceDialog\(overlay, dialog/);
  assert.match(main, /event\.key !== 'Escape'/);
  assert.match(main, /deckspotlightcontinue[\s\S]*?close\('pod'\)/);
});

test('spotlight remains readable and operable from desktop through phone widths', () => {
  assert.match(css, /#setup \.deckspotlightoverlay \{[\s\S]*?position: fixed;[\s\S]*?z-index: 600;/);
  assert.match(css, /#setup \.deckspotlighthero \{[\s\S]*?grid-template-columns:/);
  assert.match(css, /#setup \.deckspotlightactions \{[\s\S]*?position: sticky;/);
  assert.match(css, /@media \(max-width: 640px\) \{[\s\S]*?#setup \.deckspotlight \{[\s\S]*?max-height: calc\(100 \* var\(--dvhu\)\);/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?#setup \.deckspotlightrhythm \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?#setup \.deckspotlightvideo \{ display: none; \}/);
  assert.match(main, /spotlight: spotlight \? \{/);
  assert.match(main, /actions: \[\.\.\.spotlight\.querySelectorAll\('button'\)\]/);
});
