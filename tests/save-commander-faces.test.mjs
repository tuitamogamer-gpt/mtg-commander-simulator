import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const wire = value => JSON.parse(JSON.stringify(value));
const front = "Jill, Shiva's Dominant";
const canonical = "Jill, Shiva's Dominant // Shiva, Warden of Ice";

function importedDeck(name) {
  const result = M.importCommanderDeck(`Commander\n1 Talrand, Sky Summoner\nDeck\n1 ${front}\n98 Island`, {name});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const record = M.createImportedDeckRecord(result);
  assert.equal(M.hydrateImportedDeckLibrary([record], {source: 'guest'}).entries[0].ready, true);
  return record;
}

const decisions = async (_game, q) => {
  if (q.type === 'mulligan') return false;
  if (q.type === 'priority') return {kind: 'pass'};
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'cardReveal') return null;
  assert.fail('Unexpected commander replay decision: ' + q.type);
};

for (const legacy of [false, true]) test(`boardless Continue preserves the selected DFC commander (${legacy ? 'old front-face save' : 'canonical save'})`, async () => {
  const record = importedDeck('DFC Continue ' + legacy), timeline = [];
  const options = {humanDeck: record.name, humanCommanders: [canonical], aiDecks: ['Quick Draw'],
    aiStyles: ['balanced'], seed: 10112513, paced: false};
  const original = M.newGame({...options, humanController: p => ({decide: async (g, q) => {
    const answer = await decisions(g, q);
    timeline.push({kind: 'decision', ...M.recordSaveDecision(q, p, answer)});
    return answer;
  }})});
  const player = original.human();
  assert.equal(player.command[0].name, front);
  assert.equal(player.library.length, 99);
  for (const p of original.players) M.shuffle(p.library, original.rnd);
  await original.openingHand(player);
  const setup = {deck: record.name, commanders: M.canonicalCommanderNames(player.deck, player.commanders.map(c => c.name)),
    ai: 1, aiDecks: options.aiDecks, aiStyles: options.aiStyles, seed: String(options.seed)};
  const saved = wire(M.buildAccountSave(original, setup, timeline, 'match-dfc-commander-continue-' + legacy));
  assert.deepEqual(saved.setup.commanders, [canonical]);
  assert.equal(saved.state, null, 'exercise a complete replay before the first board checkpoint');
  if (legacy) saved.setup.commanders = [front];
  M.hydrateImportedDeckLibrary([], {source: 'guest'});
  const resumed = M.validateAccountSave(saved);
  let cursor = 0;
  const restored = M.newGame({...options, humanCommanders: resumed.setup.commanders,
    humanController: p => ({decide: async (g, q) => q.type === 'mulligan'
      ? M.restoreSaveDecision(q, p, resumed.decisions[cursor++]) : decisions(g, q)})});
  const human = restored.human();
  assert.equal(human.command[0].name, front, 'Continue keeps the selected Jill instead of the default Talrand');
  assert.equal(human.library.some(c => c.name === 'Talrand, Sky Summoner'), true);
  assert.equal(restored.log.some(entry => /Invalid commander selection/.test(entry.msg)), false);
  for (const p of restored.players) M.shuffle(p.library, restored.rnd);
  await restored.openingHand(human);
  assert.equal(cursor, resumed.decisions.length);
  assert.deepEqual(Array.from(human.hand, c => c.name), Array.from(player.hand, c => c.name));
  assert.deepEqual(Array.from(human.library, c => c.name), Array.from(player.library, c => c.name));

  restored.turnPlayer = human; restored.turnNo = 1; restored.phase = 'main1'; restored.step = 'main';
  for (let n = 0; n < 3; n++) {
    const land = human.library.find(c => c.name === 'Island');
    await restored.putPermanentOntoBattlefield(land, human);
  }
  const commander = human.command[0], offer = restored.castableList(human).find(row => row.card === commander);
  assert.ok(offer, 'the continued commander has a real paid command-zone cast');
  assert.equal(await restored.castSpell(human, commander, {from: offer.from, alt: offer.alt}), true);
  assert.equal(commander.zone, 'battlefield');
  assert.equal(restored.bf().filter(c => c.ctrl === human && c.is('Land') && c.tapped).length, 3);
});

for (const role of ['ai', 'remote']) test(`${role} seats resolve an explicit DFC front-face commander selection`, () => {
  const record = importedDeck('DFC seat ' + role);
  const game = M.newGame({humanDeck: 'Quick Draw', humanController: () => ({decide: decisions}),
    aiDecks: role === 'ai' ? [record.name] : [], aiCommanders: [[front]], aiStyles: ['balanced'],
    ...(role === 'remote' ? {remoteHumans: [{deck: record.name, commanders: [front], controller: {decide: decisions}}]} : {}),
    seed: 23, paced: false});
  const player = game.players.find(p => p.deckName === record.name);
  assert.equal(player.command[0].name, front);
  assert.equal(player.library.length, 99);
  assert.equal(game.log.some(entry => /Invalid commander selection/.test(entry.msg)), false);
});

test('commander normalization preserves ordered partner selections and exact built-in names', () => {
  for (const deck of Object.values(M.DECKS).filter(deck => !deck.custom)) {
    const defaults = M.defaultCommanders(deck);
    assert.deepEqual(Array.from(M.canonicalCommanderNames(deck, defaults)), Array.from(defaults), deck.name);
  }
  const names = ['Tymna the Weaver', "Kraum, Ludevic's Opus"];
  const result = M.importCommanderDeck(`Commander\n1 ${names[0]}\n1 ${names[1]}\nDeck\n49 Island\n49 Plains`,
    {name: 'Explicit saved partner aliases', register: true});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  for (const role of ['human', 'ai']) {
    const game = M.newGame({humanDeck: role === 'human' ? result.deck.name : 'Quick Draw',
      humanController: () => ({decide: decisions}),
      humanCommanders: role === 'human' ? names.map(name => name.toLowerCase()) : undefined,
      aiDecks: role === 'ai' ? [result.deck.name] : ['Quick Draw'],
      aiCommanders: role === 'ai' ? [names.map(name => name.toLowerCase())] : undefined,
      aiStyles: ['balanced'], seed: 27, paced: false});
    const player = game.players.find(p => p.deckName === result.deck.name);
    assert.deepEqual(Array.from(player.command, c => c.name), names, role);
    assert.equal(player.library.length, 98, role);
    assert.equal(game.log.some(entry => /Invalid commander selection/.test(entry.msg)), false);
  }
  assert.deepEqual(Array.from(M.canonicalCommanderNames(result.deck, ['Not a card'])), ['Not a card']);
});
