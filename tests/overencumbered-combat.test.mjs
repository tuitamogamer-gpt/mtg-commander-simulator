import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {put} from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();
async function table({pay = true, available = 4, manual = false} = {}) {
  const g = new M.Game({seed: 1337, paced: false}); g.speedFactor = 0;
  const trace = [], f = {g, trace, pay, attack: true};
  const controller = p => ({decide: async (_g, q) => {
    trace.push({player: p.idx, type: q.type, prompt: q.prompt, keys: q.options?.map(o => o.key)});
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseTargets') return q.candidates.includes(f.you) ? [f.you] : q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return f.pay && q.options.some(o => o.key === 'yes') ? 'yes' : 'no';
    if (q.type === 'chooseManaSources') return {cards: q.candidates};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'attackers') return f.attack ? q.eligible.map(card => ({card, target: f.raven})) : [];
    if (['blockers', 'combatReview'].includes(q.type)) return [];
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    return null;
  }});
  f.you = g.addPlayer('You', {name: 'Blame Game'}, null, false);
  f.raven = g.addPlayer('Raven', {name: 'Science'}, null, false);
  for (const p of g.players) {
    p.controller = controller(p);
    for (let i = 0; i < 12; i++) put(M, g, p, 'Forest', 'library');
  }
  g.turnPlayer = f.raven; g.turnNo = 12; g.phase = 'main1'; g.step = 'main';
  for (let i = 0; i < 2; i++) put(M, g, f.raven, 'Plains');
  f.aura = put(M, g, f.raven, 'Overencumbered', 'hand');
  assert.equal(await g.castSpell(f.raven, f.aura, {from: 'hand'}), true);
  await g.priorityRound(f.raven);
  assert.equal(f.aura.meta.cursedPlayer === f.you, true);
  assert.deepEqual(Array.from(g.bf().filter(c => c.isToken && c.ctrl === f.you), c => c.name).sort(), ['Clue Token', 'Food Token', 'Junk Token']);
  f.nelly = put(M, g, f.you, 'Nelly Borca, Impulsive Accuser');
  f.sources = ['Plains', 'Mountain', 'Sunhome, Fortress of the Legion', 'Mind Stone'].map(name => put(M, g, f.you, name));
  f.sources.slice(available).forEach(c => {c.tapped = true;});
  f.you.manualMana = manual;
  g.turnPlayer = f.you; g.turnNo = 13; g.phase = 'main1'; g.step = 'main';
  trace.length = 0;
  return f;
}
const payment = f => f.trace.filter(q => q.type === 'chooseOption' && q.prompt?.startsWith('Overencumbered:'));

test('Overencumbered asks the enchanted player at combat and pays exactly four real sources', async () => {
  const f = await table();
  assert.equal(payment(f).length, 0, 'there is no payment during Main 1');
  await f.g.combatPhase(f.you);
  assert.equal(payment(f).length, 1);
  assert.equal(payment(f)[0].player, f.you.idx);
  assert.match(payment(f)[0].prompt, /pay \{4\} for 4 artifacts/);
  assert.equal(f.sources.every(c => c.tapped), true);
  assert.equal(f.raven.life, 38);
  assert.ok(f.g.log.some(row => /You paid \{4\} for 4 artifacts/.test(typeof row === 'string' ? row : row.msg)));
});

test('declining Overencumbered preserves mana and never offers illegal attackers', async () => {
  const f = await table({pay: false});
  await f.g.combatPhase(f.you);
  assert.equal(payment(f).length, 1);
  assert.equal(f.sources.some(c => c.tapped), false);
  assert.equal(f.trace.some(q => q.type === 'attackers'), false);
  assert.equal(f.g.canAttackAtAll(f.nelly), false);
  assert.equal(f.g.canAttackTarget(f.nelly, f.raven), false);
  assert.equal(f.raven.life, 40);
});

test('insufficient mana still explains the four-artifact restriction to the human player', async () => {
  const f = await table({available: 3});
  await f.g.combatPhase(f.you);
  assert.equal(payment(f).length, 1, 'unaffordable triggers must not silently disappear');
  assert.match(payment(f)[0].prompt, /Cannot pay \{4\} for 4 artifacts/);
  assert.deepEqual(Array.from(payment(f)[0].keys), ['no']);
  assert.equal(f.sources.filter(c => c.tapped).length, 1, 'no partial payment is spent');
  assert.equal(f.trace.some(q => q.type === 'attackers'), false);
  assert.equal(f.raven.life, 40);
  assert.ok(f.g.log.some(row => /cannot pay \{4\}.*cannot attack this combat/.test(typeof row === 'string' ? row : row.msg)));
});

test('manual mana follows the same optional payment with an explicit source choice', async () => {
  const f = await table({manual: true});
  await f.g.combatPhase(f.you);
  assert.equal(payment(f).length, 1);
  assert.equal(f.trace.filter(q => q.type === 'chooseManaSources').length, 1);
  assert.equal(f.sources.every(c => c.tapped), true);
  assert.equal(f.raven.life, 38);
});

for (const pay of [true, false]) test(`zero artifacts still allows the optional zero payment (${pay ? 'pay' : 'decline'})`, async () => {
  const f = await table({pay});
  for (const c of f.g.bf().filter(c => c.ctrl === f.you && c.is('Artifact'))) await f.g.sacrifice(f.you, c);
  await f.g.combatPhase(f.you);
  assert.match(payment(f)[0].prompt, /pay \{0\} for 0 artifacts/);
  assert.deepEqual(Array.from(payment(f)[0].keys), ['yes', 'no']);
  assert.equal(f.raven.life, pay ? 38 : 40);
  assert.equal(f.sources.filter(c => c.zone === 'battlefield').some(c => c.tapped), false);
});

test('artifact count is taken when the queued trigger resolves and removing the Aura does not counter it', async () => {
  const f = await table(); f.attack = false;
  f.g.phase = 'combat'; f.g.step = 'begin';
  await f.g.emit('beginCombat', {player: f.you});
  await f.g.flushTriggers();
  const clue = f.g.bf().find(c => c.ctrl === f.you && c.hasSub('Clue'));
  await f.g.sacrifice(f.you, clue);
  await f.g.move(f.aura, 'graveyard');
  await f.g.priorityRound(f.you);
  assert.match(payment(f)[0].prompt, /pay \{3\} for 3 artifacts/);
  assert.equal(f.sources.filter(c => c.tapped).length, 3);
});

test('an unpaid restriction expires for a later combat even if the Aura has left', async () => {
  const f = await table({pay: false});
  await f.g.combatPhase(f.you);
  assert.equal(f.raven.life, 40);
  await f.g.move(f.aura, 'graveyard');
  await f.g.combatPhase(f.you);
  assert.equal(payment(f).length, 1);
  assert.equal(f.raven.life, 38);
});
