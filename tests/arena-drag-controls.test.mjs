import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function put(game, player, name, zone = 'battlefield') {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  assert.ok(card.def, name);
  card.ctrl = player;
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

function context() {
  const trace = [];
  const controller = {
    async decide(game, query) {
      trace.push(query);
      if (query.type === 'chooseTargets') {
        return query.quickTarget ? [query.quickTarget] : query.candidates.slice(0, query.min || 0);
      }
      if (query.type === 'chooseOption') return query.options[0]?.key;
      if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
      if (query.type === 'chooseX') return query.min || 0;
      return [];
    },
  };
  const game = new MTG.Game({ seed: 90421, paced: false });
  const you = game.addPlayer('You', { name: 'Drag deck' }, controller, false);
  const opponent = game.addPlayer('Opponent', { name: 'Target deck' }, controller, false);
  game.turnPlayer = you;
  game.turnNo = 5;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  return { game, you, opponent, trace };
}

test('direct cast target travels through performAction and the authoritative target picker', async () => {
  const { game, you, opponent, trace } = context();
  const spell = put(game, you, 'Swords to Plowshares', 'hand');
  const target = put(game, opponent, 'Riders of Gavony');
  you.pool.W = 1;

  const entry = game.castableList(you).find(candidate => candidate.card === spell);
  assert.ok(entry, 'the ordinary legal-action list offers the spell');
  assert.equal(await game.performAction(you, {
    kind: 'cast', card: spell, alt: entry.alt, from: entry.from, quickTarget: target,
  }), true);

  const question = trace.find(query => query.type === 'chooseTargets');
  assert.equal(question.quickTarget, target, 'drag supplies a suggestion to the normal target question');
  assert.ok(question.candidates.includes(target));
  assert.deepEqual(Array.from(game.stack.at(-1).targets), [target]);
  assert.equal(spell.zone, 'stack');
  assert.equal(you.pool.W, 0, 'the normal cast path still pays mana');
});

test('an illegal or stale drag target is never forwarded as an automatic target', async () => {
  const { game, you, opponent, trace } = context();
  const spell = put(game, you, 'Swords to Plowshares', 'hand');
  const legal = put(game, opponent, 'Riders of Gavony');
  const illegal = put(game, opponent, 'Sol Ring');
  you.pool.W = 1;

  assert.equal(await game.performAction(you, {
    kind: 'cast', card: spell, from: 'hand', quickTarget: illegal,
  }), true);
  const question = trace.find(query => query.type === 'chooseTargets');
  assert.equal(question.quickTarget, undefined);
  assert.ok(question.candidates.includes(legal));
  assert.ok(!question.candidates.includes(illegal));
  assert.deepEqual(Array.from(game.stack.at(-1).targets), [legal], 'the controller must make an ordinary legal choice');
});
