// A destroy does nothing to an indestructible permanent. Compiled Oracle
// cards tell the bot that their removal is a destroy (removalKind, covered by
// oracle-ai-destroy-indestructible.test.mjs). Hand-written scripts say it in a
// prompt or a label, or not at all, and the bot spent them on a creature that
// wore Darksteel Plate, turn after turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function fallbackDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function addCard(game, player, name, zone) {
  assert.ok(MTG.DEFS[name], `${name} is defined`);
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

// A bot in its first main phase against an opponent whose best creature wears
// Darksteel Plate. It is the most valuable thing to remove, as an equipped
// commander is, so a bot that only weighs value aims at it.
async function table(seed, difficulty = 'normal') {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 20, difficulty });
  const bot = game.addPlayer('Bot', { name: 'Destroy regression' }, null, true);
  const opponent = game.addPlayer('Opponent', { name: 'Opponent deck' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  bot.controller = new MTG.AIController(bot, { difficulty, style: 'balanced' });
  game.turnNo = 9;
  game.turnPlayer = bot;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  for (const player of [bot, opponent]) for (let i = 0; i < 12; i++) addCard(game, player, 'Island', 'library');
  const sphinx = addCard(game, opponent, 'Consecrated Sphinx', 'battlefield');
  const plate = addCard(game, opponent, 'Darksteel Plate', 'battlefield');
  await game.attach(plate, sphinx);
  game.recalc();
  // Every destroy that met indestructible, as the engine itself reports it.
  const prevented = [];
  const note = game.note.bind(game);
  game.note = (event, data, ...rest) => {
    if (event === 'gameEffect' && data?.kind === 'keyword' && data.keyword === 'indestructible' && data.state === 'prevented') prevented.push(data.card.name);
    return note(event, data, ...rest);
  };
  return { game, bot, opponent, sphinx, plate, prevented };
}

function fill(bot) {
  for (const color of ['W', 'U', 'B', 'R', 'G']) bot.pool[color] = 6;
  bot.pool.C = 12;
}

function mainWindow(game, bot) {
  return { type: 'main', player: bot, casts: game.castableList(bot), acts: game.activatableList(bot), lands: [], phase: game.phase };
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 40) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 40, 'the stack settles');
}

// The bot acts as in its main phase until it is done.
async function play(game, bot, limit = 4) {
  const done = [];
  for (let step = 0; step < limit; step++) {
    fill(bot);
    const decision = await bot.controller.decide(game, mainWindow(game, bot));
    if (!decision || decision.kind === 'done' || decision.kind === 'pass') break;
    done.push(`${decision.kind}:${(decision.card || decision.entry?.card)?.name}`);
    if (await game.performAction(bot, decision) === false) break;
    await resolveAll(game);
  }
  return done;
}

test('the creature that wears Darksteel Plate and the Plate itself cannot be destroyed', async () => {
  const { game, sphinx, plate, prevented } = await table(4101);
  assert.equal(sphinx.kw('indestructible'), true, 'equipped creature has indestructible');
  assert.equal(plate.kw('indestructible'), true, 'Darksteel Plate has indestructible');
  assert.equal(await game.destroy(sphinx), false);
  assert.equal(await game.destroy(plate), false);
  assert.equal(sphinx.zone, 'battlefield');
  assert.equal(plate.zone, 'battlefield');
  assert.deepEqual(prevented, ['Consecrated Sphinx', 'Darksteel Plate']);
});

// Hand-written scripts: a removal goal without a kind, or no hint at all.
const HAND_WRITTEN = ['Beast Within', "Assassin's Trophy", 'Generous Gift', 'Feed the Swarm', 'Lethal Scheme', 'Putrefy', 'Phthisis'];

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`${difficulty} bot aims a hand-written destroy at what it can destroy, never at the creature wearing Darksteel Plate`, async () => {
    for (const [index, name] of HAND_WRITTEN.entries()) {
      const { game, bot, opponent, sphinx, plate, prevented } = await table(4200 + index, difficulty);
      const spell = addCard(game, bot, name, 'hand');
      const dragon = addCard(game, opponent, 'Shivan Dragon', 'battlefield');
      const spec = game.spellTargetSpecs(spell, {}, bot)[0];
      assert.notEqual(spec.aiHint?.removalKind, 'destroy', `${name} carries no destroy hint: its script is hand-written`);
      assert.ok(game.legalTargets(spec, spell, bot).includes(sphinx), `${name}: the indestructible creature stays a legal target`);

      // The spell is cast; which permanent it is aimed at is the bot's choice.
      fill(bot);
      assert.equal(await game.castSpell(bot, spell, {}), true, `${name} is cast`);
      await resolveAll(game);

      assert.deepEqual(prevented, [], `${name}: no destroy is spent on an indestructible permanent`);
      assert.equal(sphinx.zone, 'battlefield');
      assert.equal(plate.zone, 'battlefield');
      assert.equal(dragon.zone, 'graveyard', `${name} destroys the creature that can be destroyed`);
    }
  });
}

test('a bot keeps a hand-written destroy spell when all it could aim at is indestructible', async () => {
  for (const [index, name] of ['Feed the Swarm', 'Lethal Scheme', 'Putrefy'].entries()) {
    const { game, bot, sphinx, plate, prevented } = await table(4300 + index);
    const spell = addCard(game, bot, name, 'hand');
    fill(bot);
    assert.ok(game.castableList(bot).some(entry => entry.card === spell), `${name} can be cast: the rules allow the target`);

    const done = await play(game, bot, 1);

    assert.deepEqual(done, [], `${name} stays in hand`);
    assert.equal(spell.zone, 'hand');
    assert.deepEqual(prevented, []);
    assert.equal(sphinx.zone, 'battlefield');
    assert.equal(plate.zone, 'battlefield');
  }
});

test('an enters trigger with no hint at all takes the creature it can destroy', async () => {
  const { game, bot, opponent, sphinx, prevented } = await table(4401);
  const drone = addCard(game, bot, 'Dalek Drone', 'hand');
  const dragon = addCard(game, opponent, 'Shivan Dragon', 'battlefield');
  const trigger = MTG.DEFS['Dalek Drone'].triggers.find(row => row.on === 'etb');
  const specs = typeof trigger.targets === 'function' ? trigger.targets(game, drone, { card: drone }) : trigger.targets;
  assert.equal(specs[0].aiHint, undefined, 'the script gives its target no hint');

  fill(bot);
  assert.equal(await game.castSpell(bot, drone, {}), true);
  await resolveAll(game);

  assert.equal(drone.zone, 'battlefield');
  assert.deepEqual(prevented, []);
  assert.equal(dragon.zone, 'graveyard');
  assert.equal(sphinx.zone, 'battlefield');
});

test('an activated destroy is not paid for when it has only an indestructible creature to aim at', async () => {
  const { game, bot, opponent, sphinx, prevented } = await table(4501);
  const assassin = addCard(game, bot, 'Stronghold Assassin', 'battlefield');
  const fodder = addCard(game, bot, 'Mulldrifter', 'battlefield');
  fill(bot);
  assert.ok(game.activatableList(bot).some(entry => entry.card === assassin), 'the ability can be activated: the rules allow the target');

  assert.deepEqual(await play(game, bot), [], 'nothing is sacrificed for a destroy that does nothing');
  assert.equal(fodder.zone, 'battlefield');
  assert.equal(assassin.tapped, false);
  assert.deepEqual(prevented, []);

  // With something it can destroy, the same ability is used on that.
  const dragon = addCard(game, opponent, 'Shivan Dragon', 'battlefield');
  const done = await play(game, bot, 1);
  assert.deepEqual(done, ['activate:Stronghold Assassin']);
  assert.equal(dragon.zone, 'graveyard');
  assert.equal(sphinx.zone, 'battlefield');
  assert.deepEqual(prevented, []);
});

test('"destroy target … with mana value X": X follows what can be destroyed', async () => {
  const { game, bot, opponent, sphinx, prevented } = await table(4601);
  const elemental = addCard(game, bot, 'Deepfire Elemental', 'battlefield');
  const wurm = addCard(game, opponent, 'Impervious Greatwurm', 'battlefield');
  const dragon = addCard(game, opponent, 'Shivan Dragon', 'battlefield');
  assert.ok(wurm.mv > dragon.mv, 'the indestructible creature has the larger mana value');

  const done = await play(game, bot);

  assert.ok(done.includes('activate:Deepfire Elemental'), 'the ability is used');
  assert.equal(dragon.zone, 'graveyard', 'X is the mana value of the creature that can be destroyed');
  assert.deepEqual(prevented, [], 'no activation is aimed at an indestructible permanent');
  assert.equal(wurm.zone, 'battlefield');
  assert.equal(sphinx.zone, 'battlefield');
  assert.equal(elemental.zone, 'battlefield');
});

test('damage with no number in its hint is not put on the creature that cannot die', async () => {
  // No hint, a damage hint whose amount is counted at resolution, a removal hint.
  for (const [index, name] of ['Chain Lightning', 'Tendrils of Corruption', 'Enter the God-Eternals'].entries()) {
    const { game, bot, opponent, sphinx, prevented } = await table(4650 + index);
    const spell = addCard(game, bot, name, 'hand');
    const drifter = addCard(game, opponent, 'Mulldrifter', 'battlefield');
    for (let i = 0; i < 5; i++) addCard(game, bot, 'Swamp', 'battlefield');
    const spec = game.spellTargetSpecs(spell, {}, bot)[0];
    assert.equal(Number.isFinite(Number(spec.aiHint?.amount ?? NaN)), false, `${name}: the hint gives the bot no number to weigh`);
    assert.ok(game.legalTargets(spec, spell, bot).includes(sphinx), `${name}: the indestructible creature stays a legal target`);

    fill(bot);
    assert.equal(await game.castSpell(bot, spell, {}), true, `${name} is cast`);
    await resolveAll(game);

    assert.equal(sphinx.damage, 0, `${name}: no damage is spent on the indestructible creature`);
    assert.equal(sphinx.zone, 'battlefield');
    assert.deepEqual(prevented, []);
    assert.ok(drifter.zone === 'graveyard' || opponent.life < 40, `${name} is aimed at something it can hurt`);
  }
});

test('two compiled destroy abilities no longer tell the bot that they help their target', () => {
  const assassin = MTG.DEFS["Tsabo's Assassin"].abilities.find(ability => /Destroy target creature/.test(ability.label));
  assert.deepEqual({ goal: assassin.targets[0].aiHint.goal, removalKind: assassin.targets[0].aiHint.removalKind },
    { goal: 'removal', removalKind: 'destroy' }, "Tsabo's Assassin destroyed the bot's own creature");
  const channel = MTG.DEFS['Boseiju, Who Endures'].handAbility;
  assert.match(channel.label, /Destroy target artifact, enchantment, or nonbasic land/);
  assert.deepEqual({ goal: channel.targets[0].aiHint.goal, removalKind: channel.targets[0].aiHint.removalKind },
    { goal: 'removal', removalKind: 'destroy' });
});

test('the printed text says which target choice is a destroy', async () => {
  const { game, bot, opponent, sphinx: dragon } = await table(4701);
  const artifact = addCard(game, opponent, 'Sol Ring', 'battlefield');
  const enchantment = addCard(game, opponent, 'Propaganda', 'battlefield');
  const land = addCard(game, opponent, 'Island', 'battlefield');
  const mine = addCard(game, bot, 'Mulldrifter', 'battlefield');
  const kind = (name, candidates, extra) => MTG.targetChoiceRemovalKind(game, bot, { src: { def: MTG.DEFS[name] }, candidates, ...extra });
  const spell = { so: { kind: 'spell' } };
  const rows = [
    ['Beast Within', [dragon, artifact, land], spell, 'destroy'],
    ['Vindicate', [dragon, land], spell, 'destroy'],
    ['Terminate', [dragon], spell, 'destroy'],
    ['Swords to Plowshares', [dragon], spell, 'other'],
    ['Chaos Warp', [dragon], spell, 'other'],
    ['Dismember', [dragon], spell, 'other'],
    ['Lightning Bolt', [dragon], spell, 'damage'],
    ['Tendrils of Corruption', [dragon], spell, 'damage'],
    // One instruction for each target step.
    ['Decimate', [land], { ...spell, targetStep: 4, targetSteps: 4 }, 'destroy'],
    ['Closing Statement', [dragon], { ...spell, targetStep: 1, targetSteps: 2 }, 'destroy'],
    ['Closing Statement', [mine], { ...spell, targetStep: 2, targetSteps: 2 }, 'other'],
    // A mode is told by what it may choose.
    ['Abrade', [artifact], spell, 'destroy'],
    ['Abrade', [dragon], spell, 'damage'],
    // "a new target", "each target beyond the first" and a card in a graveyard choose no permanent.
    ['Chain of Acid', [artifact], spell, 'destroy'],
    ['Consign to Dust', [artifact, enchantment], spell, 'destroy'],
    ['Lethal Protection', [dragon], spell, 'destroy'],
    // A label, a trigger's own words, a chapter.
    ['Stronghold Assassin', [dragon], { ability: MTG.DEFS['Stronghold Assassin'].abilities[0] }, 'destroy'],
    ['Reclamation Sage', [artifact, enchantment], { effectText: 'Destroy art/ench' }, 'destroy'],
    ['The Curse of Fenric', [dragon], { effectText: 'Poglavlje 1' }, 'destroy'],
    // "would be destroyed" destroys nothing.
    ['Pyramids', [land], { ability: {} }, 'other'],
  ];
  for (const [name, candidates, extra, expected] of rows) {
    assert.equal(kind(name, candidates, extra), expected, `${name}: ${String(MTG.DEFS[name].oracle).replace(/\n/g, ' / ')}`);
  }
  // A hint that names the kind is believed before any text.
  assert.equal(MTG.targetChoiceRemovalKind(game, bot, { src: { def: MTG.DEFS['Beast Within'] }, candidates: [dragon], aiHint: { goal: 'removal', removalKind: 'exile' } }), 'other');
});

test('the fallback controller also prefers what a destroy can destroy', async () => {
  const { game, bot, opponent, sphinx } = await table(4801);
  const dragon = addCard(game, opponent, 'Shivan Dragon', 'battlefield');
  const spell = addCard(game, bot, 'Beast Within', 'hand');
  const spec = game.spellTargetSpecs(spell, {}, bot)[0];
  const question = extra => ({ type: 'chooseTargets', spec, candidates: [sphinx, dragon], min: 1, max: 1, src: spell, so: { kind: 'spell' }, prompt: spec.prompt, ...extra });
  assert.deepEqual(bot.controller.chooseTargets(game, question({ aiHint: spec.aiHint })), [dragon]);
  // The same question for an exile still takes the more dangerous creature.
  assert.deepEqual(bot.controller.chooseTargets(game, question({ aiHint: { goal: 'removal', removalKind: 'exile' } })), [sphinx]);
});
