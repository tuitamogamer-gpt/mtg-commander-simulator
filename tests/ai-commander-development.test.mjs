import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();

// After a wipe: ten Forests, nothing else on the table, the commander in the
// command zone with tax, and a hand of the given cards.
function table({paced, commander, casts, hand}) {
  const game = new M.Game({seed: 51723, paced, maxTurns: 30});
  game.speedFactor = 0;
  const passive = {decide: async (g, q) => q.type === 'orderTriggers' ? q.triggers : {kind: 'pass'}};
  const bot = game.addPlayer('Bot', M.DECKS['Wade into Battle'], passive, true);
  const opponent = game.addPlayer('Opponent', {name: 'Test'}, passive, true);
  bot.deckName = 'Wade into Battle';
  bot.controller = new M.AIController(bot, {difficulty: 'normal', style: 'balanced'});
  const put = (name, zone, player = bot) => {
    const card = new M.CardInst(M.DEFS[name], player);
    card.zone = zone; card.ctrl = player; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
    return card;
  };
  const cmd = put(commander, 'command');
  cmd.commander = true; cmd.cmdCasts = casts; bot.commanders = [cmd];
  for (let i = 0; i < 10; i++) put('Forest', 'battlefield');
  for (const name of hand) put(name, 'hand');
  for (let i = 0; i < 20; i++) { put('Forest', 'library'); put('Island', 'library', opponent); }
  put('Grizzly Bears', 'battlefield', opponent);
  bot.landsPlayed = 1;
  game.turnPlayer = bot; game.turnNo = 14; game.phase = 'main1'; game.step = 'main';
  game.recalc();
  return {game, bot, cmd};
}
const fullHand = ['Grizzly Bears', 'Centaur Courser', 'Trained Armodon', 'Kalonian Tusker', 'Elvish Visionary',
  'Eternal Witness', 'Forest', 'Forest'];

for (const paced of [false, true]) {
  test(`a full hand is deployed before a taxed commander that would take the whole turn (paced=${paced})`, async () => {
    const {game, bot, cmd} = table({paced, commander: "Multani, Yavimaya's Avatar", casts: 2, hand: fullHand});
    assert.equal(game.spellCost(bot, cmd, {from: 'command'}).generic + game.spellCost(bot, cmd, {from: 'command'}).pips.length, 10);
    const first = await bot.controller.decide(game, {type: 'main', player: bot, phase: game.phase,
      casts: game.castableList(bot), acts: game.activatableList(bot), lands: game.playableLands(bot)});
    assert.equal(first.kind, 'cast');
    assert.notEqual(first.card, cmd, 'the first play comes from the hand');
    await game.mainPhase(bot);
    assert.equal(cmd.zone, 'command', 'the commander waits for a turn with fewer cards to deploy');
    const deployed = game.battlefield.filter(card => card.ctrl === bot && fullHand.includes(card.name) && card.name !== 'Forest');
    assert.ok(deployed.length >= 3, `deployed: ${deployed.map(card => card.name).join(', ')}`);
  });

  test(`the commander is still the play when the hand has nothing else to cast (paced=${paced})`, async () => {
    const {game, cmd} = table({paced, commander: "Multani, Yavimaya's Avatar", casts: 2, hand: ['Forest', 'Forest']});
    await game.mainPhase(game.players[0]);
    assert.notEqual(cmd.zone, 'command');
  });
}
