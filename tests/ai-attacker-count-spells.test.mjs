// Spells whose effect counts the attacking creatures ("where X is the number
// of attacking creatures", "for each attacking creature") do nothing without a
// combat. Reported from play: a bot cast one on its own turn although nobody
// was attacking. Galadhrim Ambush also prevents the combat damage of non-Elf
// creatures, so it is not cast on the bot's own attack of non-Elves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup, card, fuel} from './helpers/c21-fixtures.mjs';

async function decision(name, window) {
  const f = setup('ai', 3), bot = f.a, opponent = f.b, third = f.game.players[2], game = f.game;
  for (const land of ['Forest', 'Forest', 'Island', 'Plains', 'Swamp']) card(f, land, 'battlefield', bot);
  const mine = [card(f, 'Grizzly Bears', 'battlefield', bot), card(f, 'Grizzly Bears', 'battlefield', bot)];
  const theirs = [card(f, 'Grizzly Bears', 'battlefield', opponent), card(f, 'Grizzly Bears', 'battlefield', opponent), card(f, 'Grizzly Bears', 'battlefield', opponent)];
  const spell = card(f, name, 'hand', bot);
  game.turnPlayer = window.startsWith('own') ? bot : opponent;
  game.phase = {'own main1': 'main1', 'own main2': 'main2', 'opponent end step': 'end'}[window] || 'combat';
  game.step = game.phase === 'combat' ? 'blockers' : '';
  const attack = (cards, target) => { for (const creature of cards) { creature.attacking = target; creature.blockedBy = []; } game.combat = {attackers: cards.slice()}; };
  if (window === 'own attack') attack(mine, opponent);
  if (window === 'opponent attacks the bot') attack(theirs, bot);
  if (window === 'opponent attacks another player') attack(theirs, third);
  game.recalc(); fuel(bot);
  const action = game.phase.startsWith('main') && game.turnPlayer === bot
    ? await bot.controller.decide(game, {type: 'main', player: bot, casts: game.castableList(bot), acts: [], lands: [], phase: game.phase})
    : await game.askPriorityAction(bot);
  return action?.kind === 'cast' && action.card === spell;
}

const expectations = {
  'Galadhrim Ambush': {'own main1': false, 'own main2': false, 'opponent end step': false, 'own attack': false,
    'opponent attacks the bot': true},
  'Collective Override': {'own main1': false, 'own main2': false, 'opponent end step': false, 'own attack': true,
    'opponent attacks the bot': true, 'opponent attacks another player': true},
};
for (const [name, windows] of Object.entries(expectations)) for (const [window, casts] of Object.entries(windows)) {
  test(`${name}, ${window}: a bot ${casts ? 'casts it' : 'waits'}`, async () => {
    assert.equal(await decision(name, window), casts);
  });
}
