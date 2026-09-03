import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers' || q.type === 'combatReview') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(count = 3) {
  const game = new MTG.Game({ seed: 5, paced: false, maxTurns: 100 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'You',
    { name: index ? `Opp ${index}` : 'Elven Council' },
    { decide: async (g, q) => defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 10;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players };
}

function permanent(game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 200) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 200, 'Gandalf trigger/stack loop did not settle');
}

function table({ withGandalf = true, tops = ['Forest', 'Forest'], spellName = 'Thragtusk' } = {}) {
  const { game, players: [you, one, two] } = rulesGame(3);
  if (withGandalf) permanent(game, you, 'Gandalf, Westward Voyager');
  for (const player of [you, one, two]) for (let i = 0; i < 4; i++) inZone(player, 'Forest', 'library');
  inZone(one, tops[0], 'library');
  inZone(two, tops[1], 'library');
  const spell = inZone(you, spellName, 'hand');
  Object.assign(you.pool, { G: 3, U: 3, C: 6, W: 3, B: 3, R: 3 });
  return { game, you, one, two, spell };
}

test('Gandalf copies a mana value 5 spell when an opponent reveals a card sharing its type, and every opponent draws', async () => {
  const { game, you, one, two, spell } = table({ tops: ['Llanowar Elves', 'Forest'] });
  assert.equal(await game.castSpell(you, spell, { from: 'hand' }), true);
  await resolveAll(game);
  const tusks = game.bf().filter(card => card.ctrl === you && card.name === 'Thragtusk');
  assert.equal(tusks.length, 2);
  assert.equal(tusks.filter(card => card.isToken).length, 1);
  assert.equal(one.hand.length, 1);
  assert.equal(two.hand.length, 1);
  assert.equal(you.hand.length, 0);
  assert.ok(game.log.some(entry => /Gandalf, Westward Voyager: Llanowar Elves shares a card type with Thragtusk/.test(entry.msg)));
});

test('Gandalf draws you a card when no revealed card shares a type with the spell', async () => {
  const { game, you, one, two, spell } = table({ tops: ['Forest', 'Forest'] });
  assert.equal(await game.castSpell(you, spell, { from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(game.bf().filter(card => card.ctrl === you && card.name === 'Thragtusk').length, 1);
  assert.equal(you.hand.length, 1);
  assert.equal(one.hand.length, 0);
  assert.equal(two.hand.length, 0);
  assert.ok(game.log.some(entry => /Gandalf, Westward Voyager: no revealed card shares a type with Thragtusk; you draw a card/.test(entry.msg)));
});

test('Gandalf does not trigger on spells below mana value 5 or on its own casting', async () => {
  const cheap = table({ spellName: 'Llanowar Elves' });
  assert.equal(await cheap.game.castSpell(cheap.you, cheap.spell, { from: 'hand' }), true);
  await resolveAll(cheap.game);
  assert.equal(cheap.you.hand.length, 0);
  assert.equal(cheap.game.log.some(entry => /reveals/.test(entry.msg)), false);

  const self = table({ withGandalf: false, spellName: 'Gandalf, Westward Voyager', tops: ['Llanowar Elves', 'Forest'] });
  assert.equal(await self.game.castSpell(self.you, self.spell, { from: 'hand' }), true);
  await resolveAll(self.game);
  assert.equal(self.game.bf().filter(card => card.ctrl === self.you && card.name === 'Gandalf, Westward Voyager').length, 1);
  assert.equal(self.you.hand.length, 0);
  assert.equal(self.game.log.some(entry => /reveals/.test(entry.msg)), false);
});
