import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

test('svaki face commander pokriva color identity svog fabričkog decka', () => {
  const MTG = loadEngine();
  for (const deck of Object.values(MTG.DECKS)) {
    const result = MTG.validateCommanders(deck, [deck.commander], MTG.DEFS);
    assert.equal(result.ok, true, `${deck.name}: ${result.why}`);
  }
});

test('oracle mana simbol ulazi u color identity commandera', () => {
  const MTG = loadEngine();
  assert.deepEqual(Array.from(MTG.cardColorIdentity(MTG.DEFS['Shalai, Voice of Plenty'])), ['W', 'G']);
});

test('Abzan Armor nudi samo solo commandere ili članove legalnog partner para', () => {
  const MTG = loadEngine();
  const deck = MTG.DECKS['Abzan Armor'];
  const names = MTG.legalCommanders(deck, MTG.DEFS).map(entry => entry.name).sort();
  assert.deepEqual(Array.from(names), [
    "Betor, Ancestor's Voice",
    'Felothar the Steadfast',
    'Ikra Shidiqi, the Usurper',
    'Sidar Kondo of Jamuraa',
  ]);
  assert.equal(MTG.validateCommanders(deck, ['Ikra Shidiqi, the Usurper'], MTG.DEFS).ok, false);
  assert.equal(MTG.validateCommanders(deck, ['Ikra Shidiqi, the Usurper', 'Sidar Kondo of Jamuraa'], MTG.DEFS).ok, true);
});

test('player color identity dolazi iz izabranog commandera, ne iz svih 100 karata', () => {
  const MTG = loadEngine();
  const deck = MTG.DECKS['Abzan Armor'];
  const game = new MTG.Game({ seed: 4, paced: false, maxTurns: 20 });
  const player = game.addPlayer('Test', deck, null, true);
  player.chosenCommanders = ["Betor, Ancestor's Voice"];
  game.buildDeck(player, deck, MTG.DEFS);
  assert.deepEqual(Array.from(player.colorIdentity), ['W', 'B', 'G']);
  assert.deepEqual(Array.from(player.commanderNames), ["Betor, Ancestor's Voice"]);
});
