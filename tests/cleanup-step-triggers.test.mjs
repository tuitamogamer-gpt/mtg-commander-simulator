import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();

function fixture() {
  const game = new M.Game({ seed: 51403, paced: false, maxTurns: 50 });
  const answer = async (g, q) => {
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'priority' || q.type === 'main') return { kind: 'pass' };
    if (q.type === 'attackers') return [];
    if (q.type === 'blockers') return [];
    return null;
  };
  const you = game.addPlayer('You', { name: 'Cleanup' }, { decide: answer }, false);
  const opponent = game.addPlayer('Opponent', { name: 'Waste Not' }, { decide: answer }, true);
  const put = (name, owner, zone) => {
    assert.ok(M.DEFS[name], name);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.ctrl = owner; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
    return card;
  };
  for (let index = 0; index < 20; index++) put('Forest', you, 'library');
  for (let index = 0; index < 20; index++) put('Forest', opponent, 'library');
  game.turnPlayer = you; game.turnNo = 3;
  game.recalc();
  return { game, you, opponent, put };
}

test('abilities triggered by the cleanup discard resolve in that cleanup step (CR 514.3a)', async () => {
  const f = fixture();
  f.put('Waste Not', f.opponent, 'battlefield');
  // Nine creature cards: the draw makes ten, cleanup discards three of them.
  for (let index = 0; index < 9; index++) f.put('Birds of Paradise', f.you, 'hand');
  f.game.recalc();
  await f.game.runTurn();
  assert.equal(f.you.hand.length, 7, 'discarded down to seven');
  assert.equal(f.game.pendingTriggers.length, 0, 'no discard trigger waits for the next turn');
  const zombies = f.game.bf().filter(card => card.isToken && card.ctrl === f.opponent && card.name.includes('Zombie'));
  assert.equal(zombies.length, 3, 'each discarded creature card made its Zombie before the turn ended');
  assert.equal(f.game.turnPlayer, f.opponent, 'the turn still passes normally');
});

test('a permanent targeted by an opponent\'s triggered ability draws Mila\'s card instead of crashing the filter', async () => {
  const f = fixture();
  const mila = f.put('Mila, Crafty Companion', f.you, 'battlefield');
  const target = f.put('Birds of Paradise', f.you, 'battlefield');
  const source = f.put('Birds of Paradise', f.opponent, 'battlefield');
  f.game.recalc();
  await f.game.emit('targeted', {
    card: target, byPlayer: f.opponent, src: source, isSpell: false, isInstantSorcery: false,
    isActivatedAbility: false, isTriggeredAbility: true, ability: null, so: null,
  });
  assert.equal(f.game.pendingTriggers.filter(trigger => trigger.src === mila).length, 1);
  f.game.pendingTriggers.length = 0;
  await f.game.emit('targeted', {
    card: target, byPlayer: f.you, src: mila, isSpell: false, isInstantSorcery: false,
    isActivatedAbility: false, isTriggeredAbility: true, ability: null, so: null,
  });
  assert.equal(f.game.pendingTriggers.length, 0, 'your own abilities do not trigger Mila');
});
