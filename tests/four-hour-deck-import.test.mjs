import assert from 'node:assert/strict';
import test from 'node:test';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();

test('combined printing, foil and commander suffixes import a complete Yuriko deck in any order', () => {
  const commander = 'Yuriko, the Tiger’s Shadow';
  const suffixes = [
    '(C18) 52 *CMDR* *F*',
    '(C18) 52 *F* *CMDR*',
    '*CMDR* (C18) 52 *FOIL*',
    '*C* [C18:52] *F*',
    '[Commander] (C18) 52 *F*',
    '*F* (C18) 52 # Commander',
  ];
  for (const suffix of suffixes) {
    const result = M.importCommanderDeck(`1 ${commander} ${suffix}\n1 Sol Ring (C21) 263 *F*\n98 Island`);
    assert.equal(result.ok, true, `${suffix}: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(Array.from(result.commanders), ["Yuriko, the Tiger's Shadow"]);
    assert.equal(result.summary.inputCards, 100);
    const record = M.createImportedDeckRecord(result);
    assert.equal(M.validateImportedDeckRecord(record).ok, true, `${suffix}: saved list remains valid`);
  }
});

test('chosen-color lands apply the same Commander color gate for canonical and normalized names', () => {
  const defs = M.DEFS, spires = defs['Cryptic Spires'];
  for (const name of ['Cryptic Spires', 'cryptic spires', 'CRYPTIC SPIRES']) {
    for (const colors of ['U,B', 'W,U']) {
      const result = M.importCommanderDeck(`Commander\n1 Talion, the Kindly Lord\nDeck\n1 ${name} [colors=${colors}]\n98 Island`);
      assert.equal(result.ok, colors === 'U,B', `${name} [colors=${colors}]: ${JSON.stringify(result.errors)}`);
      if (colors === 'W,U') assert.ok(result.errors.some(error => error.code === 'invalid-commanders'));
      else {
        const record = M.createImportedDeckRecord(result);
        assert.equal(M.validateImportedDeckRecord(record).ok, true, `${name}: canonical saved list remains valid`);
      }
      assert.equal(M.DEFS, defs);
      assert.equal(M.DEFS['Cryptic Spires'], spires);
    }
  }
});

test('normalized names of a chosen-color commander preserve its color identity through saving', () => {
  for (const name of ['The Prismatic Piper', 'the prismatic piper']) {
    const result = M.importCommanderDeck(`Commander\n1 ${name} [colors=R]\n1 Sakashima of a Thousand Faces\nDeck\n98 Mountain`);
    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.errors)}`);
    assert.deepEqual(Array.from(result.summary.colorIdentity).sort(), ['R', 'U']);
    const record = M.createImportedDeckRecord(result);
    assert.deepEqual(Array.from(record.auxiliaryV87.colors['The Prismatic Piper']), ['R']);
    assert.equal(M.validateImportedDeckRecord(record).ok, true);
    assert.equal(M.validateCommanders(result.deck, result.commanders, M.DEFS).ok, true);
    assert.deepEqual(Array.from(M.legalCommanders(result.deck), row => row.name).sort(),
      ['Sakashima of a Thousand Faces', 'The Prismatic Piper']);
    assert.deepEqual(Array.from(M.defaultCommanders(result.deck)), Array.from(result.commanders));
  }
});

test('auxiliary quantities are bounded before expansion and invalid imports cannot be saved', () => {
  const main = 'Commander\n1 Ashling, the Limitless\nDeck\n99 Plains';
  for (const section of ['Sideboard', 'Outside game', 'Attractions', 'Sticker sheets']) {
    for (const count of [501, Number.MAX_SAFE_INTEGER]) {
      const result = M.importCommanderDeck(`${main}\n${section}\n${count} Plains`);
      assert.equal(result.ok, false, `${section}: ${count}`);
      assert.ok(result.errors.some(error => error.code === 'auxiliary-list'), `${section}: ${count}`);
      assert.throws(() => M.createImportedDeckRecord(result), /valid/i);
    }
  }
  const allowed = M.importCommanderDeck(`${main}\nSideboard\n500 Plains`);
  assert.equal(allowed.ok, true, JSON.stringify(allowed.errors));
  assert.equal(allowed.deck.auxiliaryV87.outsideGame.length, 500);
  const cumulative = M.importCommanderDeck(`${main}\nSideboard\n499 Plains\n2 Island`);
  assert.equal(cumulative.ok, false);
  assert.ok(cumulative.errors.some(error => error.code === 'auxiliary-list'));
  assert.equal(cumulative.draftDeck.auxiliaryV87.outsideGame.length, 499);
});

test('imported partners remain commanders for default Solo AI and Commander Live seats', () => {
  const commanders = ['Tymna the Weaver', "Kraum, Ludevic's Opus"];
  const result = M.importCommanderDeck(`Commander\n1 ${commanders[0]}\n1 ${commanders[1]}\nDeck\n49 Island\n49 Plains`,
    {name: 'Imported partner defaults', register: true});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  // The lobby sends this default list when an imported deck is selected.
  const defaults = M.defaultCommanders(result.deck, M.DEFS);
  assert.deepEqual(Array.from(defaults), commanders);
  defaults.pop();
  assert.deepEqual(Array.from(result.deck.commanders), commanders, 'return an independent selection array');
  const remoteController = {decide: async () => ({kind: 'pass'})};
  for (const role of ['human', 'ai', 'remote']) {
    const game = M.newGame({
      humanDeck: role === 'human' ? result.deck.name : 'Quick Draw',
      aiDecks: role === 'ai' ? [result.deck.name] : [],
      ...(role === 'remote' ? {remoteHumans: [{deck: result.deck.name, name: 'Live partner seat',
        commanders: M.defaultCommanders(result.deck), controller: remoteController}]} : {}),
      seed: 123, paced: false, maxTurns: 1,
    });
    const player = game.players.find(player => player.deckName === result.deck.name);
    assert.deepEqual(Array.from(player.command, card => card.name), commanders, role);
    assert.equal(player.command.length + player.library.length, 100, role);
    assert.equal(player.library.length, 98, role);
    assert.equal(player.library.some(card => commanders.includes(card.name)), false, role);
    assert.equal(game.log.some(entry => /Invalid commander selection/.test(entry.msg)), false, role);
  }
});

test('setup honors chosen commander colors and rejects chosen land colors outside that identity', () => {
  const defs = M.DEFS, piper = defs['The Prismatic Piper'], faceless = defs['Faceless One'];
  for (const commander of ['The Prismatic Piper', 'Faceless One']) {
    const result = M.importCommanderDeck(`Commander\n1 ${commander} [colors=R]\nDeck\n1 Cryptic Spires [colors=R,U]\n98 Mountain`);
    assert.equal(result.ok, false, 'blue Spires is outside red commander identity');
    assert.equal(M.validateCommanders(result.draftDeck, result.commanders).ok, false, commander);
    const valid = M.importCommanderDeck(`Commander\n1 ${commander} [colors=R]\nDeck\n99 Mountain`);
    assert.equal(valid.ok, true, JSON.stringify(valid.errors));
    assert.equal(M.validateCommanders(valid.deck, valid.commanders).ok, true, commander);
    assert.equal(M.legalCommanders(valid.deck).length, 1, commander);
    const game = new M.Game({seed: 12, paced: false});
    const player = game.addPlayer('Chosen color', valid.deck, null, true);
    game.buildDeck(player, valid.deck, M.DEFS);
    assert.deepEqual(Array.from(player.colorIdentity), ['R'], commander);
    assert.equal(player.command.length, 1, commander);
    assert.equal(player.library.length, 99, commander);
  }
  assert.equal(M.DEFS, defs);
  assert.equal(M.DEFS['The Prismatic Piper'], piper);
  assert.equal(M.DEFS['Faceless One'], faceless);
});

test('both physical faces contribute their printed Commander identity, including color indicators', () => {
  let checked = 0;
  for (const [name, catalog] of Object.entries(M.CARD_CATALOG)) {
    const def = M.DEFS[name];
    if (!catalog.deckImportEligible || !def?.oracleFaces) continue;
    assert.deepEqual(Array.from(M.cardColorIdentity(def)).sort(), Array.from(catalog.colorIdentity).sort(), name);
    checked++;
  }
  assert.ok(checked > 400, 'compare every available physical DFC against its recorded Oracle identity');
  for (const [name, identity] of [
    ['Extus, Oriq Overlord', ['B', 'R', 'W']],
    ['Grist, Voracious Larva', ['B', 'G']],
    ['Phyrexian Dragon Engine', ['R']],
    ['The Mightstone and Weakstone', []],
    ['Wear // Tear', ['R', 'W']],
    ['Animating Faerie // Bring to Life', ['U']],
    ['Benthic Infiltrator', ['U']],
    ['Crypt Ghast', ['B']],
    ['Transguild Courier', ['B', 'G', 'R', 'U', 'W']],
  ]) {
    const canonical = M.resolveDeckCardName(name);
    assert.ok(canonical, name);
    assert.deepEqual(Array.from(M.cardColorIdentity(M.DEFS[canonical])).sort(), identity, name);
  }
});

test('double-faced commanders permit both sides colors and off-color physical cards stay out of a deck', () => {
  for (const [commander, basic, identity] of [
    ['Extus, Oriq Overlord', 'Mountain', ['B', 'R', 'W']],
    ['Jadzi, Oracle of Arcavios', 'Forest', ['G', 'U']],
    ['Grist, Voracious Larva', 'Swamp', ['B', 'G']],
    ['Terra, Magical Adept', 'Island', ['B', 'G', 'R', 'U', 'W']],
  ]) {
    const result = M.importCommanderDeck(`Commander\n1 ${commander}\nDeck\n99 ${basic}`);
    assert.equal(result.ok, true, `${commander}: ${JSON.stringify(result.errors)}`);
    const record = M.createImportedDeckRecord(result);
    assert.equal(M.validateImportedDeckRecord(record).ok, true, commander);
    const game = new M.Game({seed: 7, paced: false});
    const player = game.addPlayer('Double-faced commander', result.deck, null, true);
    game.buildDeck(player, result.deck, M.DEFS);
    assert.deepEqual(Array.from(player.colorIdentity).sort(), identity, commander);
    assert.equal(player.library.length, 99, commander);
  }
  for (const [commander, card, basic] of [
    ['Talion, the Kindly Lord', 'Jadzi, Oracle of Arcavios', 'Island'],
    ['Goreclaw, Terror of Qal Sisma', 'Blex, Vexing Pest', 'Forest'],
    ['Goreclaw, Terror of Qal Sisma', 'Grist, Voracious Larva', 'Forest'],
  ]) {
    const result = M.importCommanderDeck(`Commander\n1 ${commander}\nDeck\n1 ${card}\n98 ${basic}`);
    assert.equal(result.ok, false, `${card} outside ${commander}'s identity`);
    assert.ok(result.errors.some(error => error.code === 'invalid-commanders'), card);
  }
});
