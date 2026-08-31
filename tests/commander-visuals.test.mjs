import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('svaki default main commander ima zaseban cinematic asset', () => {
  const defaults = Object.values(MTG.DECKS).flatMap(deck => MTG.defaultCommanders(deck, MTG.DEFS));
  assert.equal(new Set(defaults).size, 28);
  assert.equal(Object.keys(MTG.COMMANDER_INTROS).length, 28);
  for (const name of defaults) {
    const asset = MTG.COMMANDER_INTROS[name];
    assert.ok(asset, `${name} nema cinematic mapiranje`);
    assert.match(asset, /^\.\/assets\/commander-intros\/[a-z0-9-]+\.mp4$/);
    const file = path.join(root, asset.slice(2));
    assert.ok(fs.existsSync(file), `${name} nema lokalni video ${file}`);
    assert.ok(fs.statSync(file).size > 10_000, `${name} video je prazan ili nepotpun`);
  }
});

test('Turtle Power default je Leonardo plus Michelangelo kao legalan partner duo', () => {
  const deck = MTG.DECKS['Turtle Power'];
  const pair = MTG.defaultCommanders(deck, MTG.DEFS);
  assert.deepEqual(Array.from(pair), ['Leonardo, the Balance', 'Michelangelo, the Heart']);
  assert.equal(MTG.validateCommanders(deck, pair, MTG.DEFS).ok, true);
  assert.notEqual(MTG.COMMANDER_INTROS[pair[0]], MTG.COMMANDER_INTROS[pair[1]]);

  const game = new MTG.Game({ seed: 240826, paced: false, maxTurns: 5 });
  const player = game.addPlayer('TMNT', deck, null, false);
  game.buildDeck(player, deck, MTG.DEFS);
  assert.deepEqual(Array.from(player.commanders, card => card.name), Array.from(pair));
  assert.equal(player.library.some(card => pair.includes(card.name)), false);
});

test('only the 27 predefined decks receive commander videos, including both Turtle partners', () => {
  const predefined = Object.values(MTG.DECKS).filter(deck => !deck.custom && !deck.imported);
  assert.equal(predefined.length, 27);
  for (const deck of predefined) {
    for (const name of MTG.defaultCommanders(deck, MTG.DEFS)) {
      assert.equal(MTG.commanderIntroForDeck(deck, name), MTG.COMMANDER_INTROS[name], `${deck.name}: ${name}`);
      assert.equal(MTG.commanderIntroForDeck({ ...deck }, name), MTG.COMMANDER_INTROS[name]);
      assert.equal(MTG.commanderIntroForDeck({ ...deck, custom: true }, name), null);
      assert.equal(MTG.commanderIntroForDeck({ ...deck, imported: true }, name), null);
    }
  }
  assert.equal(MTG.commanderIntroForDeck(null, 'Rootha, Mastering the Moment'), null);
  assert.equal(MTG.commanderIntroForDeck({ name: 'Unknown deck' }, 'Rootha, Mastering the Moment'), null);
  assert.equal(MTG.commanderIntroForDeck(MTG.DECKS['Prismari Artistry'], 'Sauron, the Dark Lord'), null);
});

test('lokalni UI icon sprite pokriva ključne arena kontrole', () => {
  const sprite = fs.readFileSync(path.join(root, 'assets/icons/game-ui.svg'), 'utf8');
  for (const icon of ['crown', 'stack', 'log', 'deals', 'hold', 'mana', 'menu', 'attack', 'shield', 'library', 'cards', 'graveyard', 'exile', 'effects', 'player', 'info', 'ring',
    'counterspell', 'indestructible', 'hexproof', 'shroud', 'first-strike', 'double-strike', 'minus-counter', 'proliferate']) {
    assert.match(sprite, new RegExp(`id="icon-${icon}"`), `nedostaje icon-${icon}`);
    assert.match(MTG.icon(icon), new RegExp(`#icon-${icon}`));
  }
});

test('commander arrival koristi autoplay video uz image i reduced-motion fallback', () => {
  const ui = fs.readFileSync(path.join(root, 'src/modules/ui.js'), 'utf8');
  assert.match(ui, /class="arrivalvideo" autoplay muted playsinline/);
  assert.match(ui, /class="arrivalfallback" hidden/);
  assert.match(ui, /prefers-reduced-motion: reduce/);
  assert.match(ui, /video\.addEventListener\('error', fallback/);
});
