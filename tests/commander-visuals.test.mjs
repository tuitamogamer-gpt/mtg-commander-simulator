import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {precons} from '../scripts/import-c15-c16-precons.mjs';
import {precons as nextPrecons} from '../scripts/import-c17-c19-precons.mjs';
import {precons as newestPrecons} from '../scripts/import-c19-c20-znc-precons.mjs';
import {precons as zncKhcPrecons} from '../scripts/import-znc-cmr-khc-precons.mjs';
import {precons as bomPrecons} from '../scripts/import-brc-onc-moc-sld-precons.mjs';
import {precons as clbDmc40kPrecons} from '../scripts/import-clb-dmc-40k-precons.mjs';
import {precons as vocNccPrecons} from '../scripts/import-voc-ncc-precons.mjs';
import {precons as afcMicPrecons} from '../scripts/import-afc-mic-precons.mjs';
import {precons as ltcCmmPrecons} from '../scripts/import-ltc-cmm-precons.mjs';
import {precons as cwwPrecons} from '../scripts/import-cmm-woc-who-precons.mjs';
import {precons as wlmPrecons} from '../scripts/import-who-lcc-sld-mkc-precons.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('postojeći cinematic asseti ostaju dostupni; novi preconi koristi slike bez novih videa', () => {
  const defaults = Object.values(MTG.DECKS).flatMap(deck => MTG.defaultCommanders(deck, MTG.DEFS));
  assert.equal(new Set(defaults).size, 136);
  assert.equal(Object.keys(MTG.COMMANDER_INTROS).length, 28);
  for (const name of defaults) {
    const asset = MTG.COMMANDER_INTROS[name];
    if([...precons.concat(nextPrecons,newestPrecons,zncKhcPrecons,afcMicPrecons,vocNccPrecons,clbDmc40kPrecons,bomPrecons,ltcCmmPrecons,cwwPrecons,wlmPrecons).flatMap(d=>[d.commander,...(d.partner?[d.partner]:[])]),'Isperia, Supreme Judge','Gisa and Geralf','Kardur, Doomscourge','Atarka, World Render','Emmara, Soul of the Accord','Osgir, the Reconstructor','Zaffai, Thunder Conductor','Adrix and Nev, Twincasters','Breena, the Demagogue','Willowdusk, Essence Seer','Nahiri, the Lithomancer','Teferi, Temporal Archmage','Ob Nixilis of the Black Oath','Daretti, Scrap Savant',"Freyalise, Llanowar's Fury"].map(n=>MTG.resolveDeckCardName(n)||n).includes(name)){
      assert.equal(asset,undefined,`${name}: no new commander video`);continue;
    }
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

test('130 predefined decks use available videos or a still image; custom decks never inherit videos', () => {
  const predefined = Object.values(MTG.DECKS).filter(deck => !deck.custom && !deck.imported);
  assert.equal(predefined.length, 130);
  for (const deck of predefined) {
    for (const name of MTG.defaultCommanders(deck, MTG.DEFS)) {
      assert.equal(MTG.commanderIntroForDeck(deck, name), MTG.COMMANDER_INTROS[name]||null, `${deck.name}: ${name}`);
      assert.equal(MTG.commanderIntroForDeck({ ...deck }, name), MTG.COMMANDER_INTROS[name]||null);
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
