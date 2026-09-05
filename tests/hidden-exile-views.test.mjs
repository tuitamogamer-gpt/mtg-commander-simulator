import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
function fixture() {
  const game = new MTG.Game({ seed: 950540, paced: false });
  const players = ['Caster', 'Owner', 'Observer'].map(name => game.addPlayer(name, { name }, null, false));
  game.turnPlayer = players[0]; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  for (const player of players) player.controller = new MTG.AIController(player, { difficulty: 'normal' });
  const put = (name, player, zone = 'library') => {
    const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone;
    if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
    return card;
  };
  return { game, players, put };
}

test('paid Extract Power exposes face-down exile to its caster, not the card owner or another player', async () => {
  const { game, players: [caster, owner, observer], put } = fixture();
  for (const player of game.players) put('Forest', player);
  const stolen = put('Swords to Plowshares', owner);
  const spell = put('Extract Power', caster, 'hand');
  Object.assign(caster.pool, { C: 10, U: 10, B: 10 }); game.recalc();
  assert.equal(await game.castSpell(caster, spell, { from: 'hand' }), true);
  await game.resolveTop();
  assert.equal(stolen.zone, 'exile'); assert.equal(stolen.faceDown, true);
  for (const viewer of [owner, observer, caster]) {
    const bot = MTG.createBotPlayerView(game, viewer.idx).players.find(p => p.id === owner.idx).exile.find(c => c.id === stolen.iid);
    const remote = MTG.onlineGameViewFor(game, viewer).players.find(p => p.seat === owner.idx).exile.find(c => c.token === `c:${stolen.iid}`);
    assert.equal(bot.known, viewer === caster, `${viewer.name}: local AI permission`);
    assert.equal(remote.hidden, viewer !== caster, `${viewer.name}: remote human permission`);
    assert.equal(remote.name, viewer === caster ? stolen.name : 'Hidden card');
  }
  await game.move(stolen, 'graveyard');
  for (const viewer of [caster, owner, observer]) {
    assert.equal(MTG.onlineGameViewFor(game, viewer).players.find(p => p.seat === owner.idx).graveyard.find(c => c.token === `c:${stolen.iid}`).name, 'Swords to Plowshares');
  }
});

test('manifested creatures retain public combat characteristics for a remote opponent', async () => {
  const { game, players: [controller, observer], put } = fixture();
  const card = put('Colossal Dreadmaw', controller);
  await game.manifestCard(controller, card); game.recalc();
  const view = MTG.onlineGameViewFor(game, observer).battlefield.find(c => c.token === `c:${card.iid}`);
  assert.equal(view.hidden, true);
  assert.equal(view.power, 2); assert.equal(view.toughness, 2);
  assert.deepEqual(Array.from(view.types), ['Creature']);
  assert.equal(JSON.stringify(view).includes('Dreadmaw'), false);
});

test('a stolen manifested card is known to its controller rather than its owner', async () => {
  const { game, players: [owner, controller], put } = fixture();
  const card = put('Colossal Dreadmaw', owner);
  await game.manifestCard(controller, card); game.recalc();
  for (const viewer of [controller, owner]) {
    const row = MTG.createBotPlayerView(game, viewer.idx).battlefield.find(c => c.id === card.iid);
    assert.equal(row.known, viewer === controller);
    const remote = MTG.onlineGameViewFor(game, viewer).battlefield.find(c => c.token === `c:${card.iid}`);
    assert.equal(remote.hidden, viewer !== controller);
    assert.equal(remote.name, viewer === controller ? 'Colossal Dreadmaw' : 'Hidden card');
    assert.equal(remote.power, 2);
  }
});

test('Plaza of Heroes allows a real local AI reveal choice while Furycalm Snarl enters', async () => {
  const { game, players: [bot], put } = fixture();
  const plaza = put('Plaza of Heroes', bot, 'battlefield');
  put('Plains', bot, 'hand'); const snarl = put('Furycalm Snarl', bot, 'hand'); game.recalc();
  const errors = []; game.onEvent = event => { if (event.type === 'log' && /fallback/.test(event.msg)) errors.push(event.msg); };
  const queries = [], decide = bot.controller.decide;
  bot.controller.decide = async function(g,q) { queries.push(q.type); return decide.call(this,g,q); };
  assert.equal(await game.playLand(bot, snarl), true);
  assert.ok(queries.includes('chooseCards'), 'actual as-enters reveal decision ran');
  assert.equal(snarl.zone, 'battlefield'); assert.equal(plaza.zone, 'battlefield');
  assert.deepEqual(errors, []); assert.ok(bot.controller.lastV2Decision);
});

for (const role of ['human', 'local-ai']) test(`${role}: a land choosing its type as it enters is unavailable for mana until entry finishes`, async () => {
  const { game, players: [player], put } = fixture();
  put('Plaza of Heroes', player, 'battlefield');
  put('Colossal Dreadmaw', player, 'library');
  const land = put('Secluded Courtyard', player, 'hand'); game.recalc();
  let choices = 0;
  const ai = player.controller, decide = ai.decide.bind(ai);
  player.controller = { decide: async (g,q) => {
    if (q.type === 'chooseOption') {
      choices++;
      assert.equal(g.bf().includes(land), false, 'entrant is absent from pre-entry battlefield');
      assert.equal(g.manaSources(player).some(s => s.card === land), false, 'entrant cannot produce mana during its replacement choice');
    }
    return role === 'local-ai' ? decide(g,q) : q.type === 'chooseOption' ? q.options[0].key : [];
  } };
  assert.equal(await game.playLand(player, land), true);
  assert.ok(choices > 0); assert.ok(game.bf().includes(land));
  assert.ok(game.manaSources(player).some(s => s.card === land), 'normal mana ability becomes available after entry');
});
