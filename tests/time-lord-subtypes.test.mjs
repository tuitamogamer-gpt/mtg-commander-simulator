import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();
const doctors = ['Jenny, Generated Anomaly', 'Romana II', 'The Sixth Doctor'];
const same = (a, b) => assert.deepEqual(Array.from(a), Array.from(b));
// Source rule: https://magic.wizards.com/en/news/feature/magic-the-gathering-doctor-who-release-notes
test('pinned Time Lord source data stays intact while runtime types and Changeling use one subtype', () => {
  for (const name of doctors) {
    const raw = M.RAW_DATA.cards[name], def = M.DEFS[name];
    same(raw.subtypes.slice(0, 2), ['Time', 'Lord']);
    same(def.subtypes, ['Time Lord', raw.subtypes[2]]);
    assert.notEqual(def.subtypes, raw.subtypes);
  }
  assert.equal(M.CREATURE_SUBTYPES.has('Time Lord'), true);
  assert.equal(M.CREATURE_SUBTYPES.has('Time'), false);
  assert.equal(M.CREATURE_SUBTYPES.has('Lord'), false);
  const game = new M.Game({ seed: 207, paced: false }), player = game.addPlayer('You', {}, null, false);
  for (const name of [...doctors, 'Universal Automaton']) {
    const card = new M.CardInst(M.DEFS[name], player); card.zone = 'battlefield'; game.battlefield.push(card);
    game.recalc();
    assert.equal(card.hasSub('Time Lord'), true, name);
    assert.equal(card.hasSub('Time'), false, name);
    assert.equal(card.hasSub('Lord'), false, name);
  }
});

test('runtime normalization is idempotent for canonical, compound and copied definitions', () => {
  const canonical = ['Time Lord', 'Doctor'];
  same(M.normalizeSubtypes(canonical), canonical);
  const raw = { name: 'Face type regression', types: ['Creature'], subtypes: ['Time', 'Lord', 'Doctor'] };
  const defs = M.buildDefs({ [raw.name]: raw }, { [raw.name]: { oracleFaces: { faces: [] } } }, { registerTypes: false });
  same(defs[raw.name].subtypes, canonical);
  same(raw.subtypes, ['Time', 'Lord', 'Doctor']);
  same(M.normalizeSubtypes(['Eldrazi', 'Spawn']), ['Eldrazi', 'Spawn']);
  same(M.normalizeSubtypes(['Assembly-Worker']), ['Assembly-Worker']);
});

test("Doctor's companion accepts the canonical Doctor, rejects extra creature types and keeps legacy incoming definitions compatible", () => {
  const companion = M.DEFS['Romana II'], doctor = M.DEFS['The Sixth Doctor'];
  assert.equal(M.canPartner(companion, doctor), true);
  assert.equal(M.canPartner(companion, M.DEFS['Jenny, Generated Anomaly']), false);
  assert.equal(M.canPartner(companion, { ...doctor, name: 'Additional type', subtypes: ['Time Lord', 'Doctor', 'Alien'] }), false);
  assert.equal(M.canPartner(companion, { ...doctor, name: 'Every creature type', kws: ['changeling'] }), false);
  assert.equal(M.canPartner(companion, { ...doctor, name: 'Characteristic Changeling', changeling: true }), false);
  assert.equal(M.canPartner(companion, { ...doctor, name: 'Legacy incoming definition', subtypes: ['Time', 'Lord', 'Doctor'] }), true);
  assert.equal(M.canPartner(companion, { ...doctor, name: 'Doctor only', subtypes: ['Doctor'] }), false);
});

for (const role of ['human', 'ai']) test(`${role}: real Romana II and Sixth Doctor setup and paid commander cast retain the canonical subtype`, async () => {
  const chosen = ['Romana II', 'The Sixth Doctor'];
  const deck = { name: 'Time Lord source regression', commander: chosen[0], cards: chosen.map(name => ({ name, n: 1 })) };
  assert.equal(M.validateCommanders(deck, chosen, M.DEFS).ok, true);
  const game = new M.Game({ seed: 208, paced: false });
  const human = { decide: async (_game, q) => q.type === 'priority' ? { kind: 'pass' } : q.type === 'orderTriggers' ? q.triggers : q.options?.[0]?.key ?? null };
  const player = game.addPlayer('You', deck, human, role === 'ai'); game.addPlayer('Opponent', {}, human, false);
  if (role === 'ai') player.controller = new M.AIController(player, { difficulty: 'hard', style: 'balanced' });
  const selection = role === 'ai' ? M.randomCommanders(deck, () => 0, M.DEFS) : chosen;
  same([...selection].sort(), [...chosen].sort());
  game.buildDeck(player, deck, M.DEFS, selection);
  for (const card of player.command) assert.equal(card.hasSub('Time Lord'), true, 'command zone predicates');
  game.turnPlayer = player; game.turnNo = 1; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {}; game.revealToHuman = async () => {};
  for (const color of ['W', 'U', 'G', 'C']) player.pool[color] = 10;
  const card = player.command.find(row => row.name === 'The Sixth Doctor');
  assert.equal(await game.castSpell(player, card, { from: 'command' }), true);
  assert.ok(Object.values(player.pool).reduce((n, v) => n + v, 0) < 40);
  assert.equal(card.zone, 'stack'); assert.equal(card.hasSub('Time Lord'), true);
  await game.resolveTop();
  assert.equal(card.zone, 'battlefield'); assert.equal(card.hasSub('Time Lord'), true);
  assert.equal(card.hasSub('Doctor'), true); assert.equal(card.hasSub('Lord'), false);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
});
