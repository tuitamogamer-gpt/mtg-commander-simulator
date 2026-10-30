import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

// Bots cast X spells that did nothing: Exsanguinate and Lavalanche for X=0,
// Savage Twister and Martial Coup valued as full wipes whatever X they could
// pay, and easy bots announcing X=0 from a near-tie with X=1 or X=2.
const M = loadEngine();
const BASIC = {W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest'};

function table(difficulty, seed = 4100) {
  const game = new M.Game({seed, paced: false});
  game.speedFactor = 0;
  game.priorityRound = async () => {};
  const bot = game.addPlayer('Bot', {name: 'Bot'}, null, true);
  const opponent = game.addPlayer('Opponent', {name: 'Table'}, null, true);
  bot.controller = new M.AIController(bot, {difficulty, style: 'balanced'});
  opponent.controller = {decide: async (g, q) => q.type === 'priority' ? {kind: 'pass'} : []};
  game.turnPlayer = bot; game.turnNo = 9; game.phase = 'main1'; game.step = 'main';
  function add(name, owner = bot, zone = 'battlefield') {
    const card = new M.CardInst(M.DEFS[name], owner);
    assert.ok(card.def, name);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
    return card;
  }
  for (let i = 0; i < 20; i++) { add('Island', bot, 'library'); add('Island', opponent, 'library'); }
  return {game, bot, opponent, add};
}

// Lands for the colored pips and generic part of the cost, plus `extra` per X.
function landsFor(add, name, extra) {
  const cost = M.DEFS[name].cost;
  const pips = (cost.match(/\{([WUBRG])\}/g) || []).map(symbol => BASIC[symbol[1]]);
  const generic = Number((cost.match(/\{(\d+)\}/) || [0, 0])[1]);
  const xs = (cost.match(/\{X\}/g) || []).length;
  for (const land of pips) add(land);
  for (let i = 0; i < generic + extra * xs; i++) add(pips[0] || 'Wastes');
}

async function mainChoice(game, bot, card) {
  game.recalc();
  const casts = game.castableList(bot);
  assert.ok(casts.some(entry => entry.card === card), card.name + ' is castable');
  const act = await bot.controller.decide(game, {type: 'main', player: bot, casts, acts: game.activatableList(bot), lands: [], phase: 'main1'});
  return act?.kind === 'cast' && act.card === card ? act : null;
}
// Compare names only: a failed assertion would otherwise inspect the whole game.
const castName = async (game, bot, card) => (await mainChoice(game, bot, card))?.card.name ?? null;

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(difficulty + ': a bot holds X spells it could only cast for X=0', async () => {
    for (const name of ['Exsanguinate', 'Lavalanche', 'Savage Twister', 'Martial Coup', 'Hydroid Krasis', 'Starstorm']) {
      for (const seed of [4100, 4177, 4254]) {
        const {game, bot, opponent, add} = table(difficulty, seed);
        landsFor(add, name, 0);
        add('Grizzly Bears', opponent); add('Hill Giant', opponent);
        const card = add(name, bot, 'hand');
        assert.equal(await castName(game, bot, card), null, `${name} (seed ${seed}) is not cast for X=0`);
      }
    }
  });

  test(difficulty + ': a bot that casts an X spell announces an X that does something', async () => {
    for (const name of ['Entreat the Angels', 'Exsanguinate', 'Hydroid Krasis', 'Decree of Justice', 'Villainous Wealth', 'Stroke of Genius']) {
      for (const seed of [4100, 4177, 4254, 4331]) {
        const {game, bot, opponent, add} = table(difficulty, seed);
        landsFor(add, name, 2);
        add('Grizzly Bears', opponent);
        const card = add(name, bot, 'hand');
        const act = await mainChoice(game, bot, card);
        if (!act) continue;
        await game.performAction(bot, act);
        const spell = game.stack.find(object => object.card === card);
        assert.ok(spell, name + ' is on the Stack');
        assert.ok(spell.x >= 1, `${name} (seed ${seed}) announced X=${spell.x}`);
      }
    }
  });
}

test('a sweeper is valued by what the payable X kills', async () => {
  const {game, bot, opponent, add} = table('normal');
  landsFor(add, 'Savage Twister', 2);
  add('Grizzly Bears'); add('Hill Giant', opponent); add('Hill Giant', opponent);
  const twister = add('Savage Twister', bot, 'hand');
  assert.equal(await castName(game, bot, twister), null, 'X=2 kills only the bot’s own Bears');
  add('Forest');
  assert.equal(await castName(game, bot, twister), 'Savage Twister', 'X=3 kills both Hill Giants');
});

test('Martial Coup below X=5 is not valued as a wipe', async () => {
  const {game, bot, opponent, add} = table('hard');
  landsFor(add, 'Martial Coup', 1);
  for (const name of ['Hill Giant', 'Hill Giant', 'Grizzly Bears']) add(name, opponent);
  const coup = add('Martial Coup', bot, 'hand');
  assert.equal(await castName(game, bot, coup), null, 'one Soldier is not worth the card');
});

test('the fallback controller keeps X at least 1 when it can pay for it', () => {
  const {game, bot} = table('normal');
  const card = new M.CardInst(M.DEFS['Exsanguinate'], bot);
  for (let i = 0; i < 40; i++) {
    game.rnd = () => i / 40;
    assert.equal(bot.controller.chooseX(game, {type: 'chooseX', min: 0, max: 1, card}), 1);
    assert.ok(bot.controller.chooseX(game, {type: 'chooseX', min: 0, max: 4, card}) >= 3);
    assert.equal(bot.controller.chooseX(game, {type: 'chooseX', min: 0, max: 0, card}), 0);
  }
});
