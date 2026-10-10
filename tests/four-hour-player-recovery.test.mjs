import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function table() {
  const game = new M.Game({seed: 101026708, paced: false});
  const decide = async (_g, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'chooseTargets') return q.quickTarget ? [q.quickTarget] : q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options[0]?.key;
    throw new Error(`Unhandled native recovery decision: ${q.type}`);
  };
  const me = game.addPlayer('Human', {name: 'Recovery audit'}, {decide}, false);
  game.addPlayer('Rival', {name: 'Recovery audit'}, {decide}, false);
  game.turnPlayer = me; game.turnNo = 7; game.phase = 'main1'; game.step = 'main';
  const put = (name, zone = 'battlefield') => {
    const card = new M.CardInst(M.DEFS[name], me);
    card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : me[zone]).push(card);
    game.recalc(); return card;
  };
  return {game, me, put};
}

for (const destination of ['graveyard','exile','hand','command']) test(`Last Resort can remove a native paid Soldier token to ${destination}`, async () => {
  const f = table(); f.put('Plains'); f.put('Wastes');
  const alarm = f.put('Raise the Alarm', 'hand');
  assert.ok(f.game.castableList(f.me).some(row => row.card === alarm));
  assert.equal(await f.game.castSpell(f.me, alarm, {from: 'hand'}), true);
  const token = f.game.bf().find(card => card.isToken && card.hasSub('Soldier'));
  assert.ok(token, 'printed Raise the Alarm produced a native token');
  assert.doesNotThrow(() => f.game.applyLastResortAction(f.me, {type: 'moveCard', cardToken: `c:${token.iid}`, toZone: destination}));
  assert.equal(token.zone, 'ceased');
  assert.equal(f.game.battlefield.includes(token), false);
  assert.equal(f.me[destination].includes(token), false);
  assertGameStateInvariants(f.game);
});

test('Last Resort still moves a physical native card to its owner hand', () => {
  const f = table(), bear = f.put('Grizzly Bears');
  f.game.applyLastResortAction(f.me, {type: 'moveCard', cardToken: `c:${bear.iid}`, toZone: 'hand'});
  assert.equal(bear.zone, 'hand'); assert.equal(f.me.hand.includes(bear), true);
  assertGameStateInvariants(f.game);
});
