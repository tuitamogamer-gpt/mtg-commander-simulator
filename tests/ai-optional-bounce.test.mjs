import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function table() {
  const game = new MTG.Game({ seed: 5, paced: false });
  const bot = game.addPlayer('Bot', { name: 'bot' }, null, true);
  const opp = game.addPlayer('Opp', { name: 'opp' }, { decide: async (g, q) => q.type === 'priority' ? { kind: 'pass' } : q.type === 'main' ? { kind: 'done' } : [] }, false);
  bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  const put = (name, player, zone = 'battlefield') => {
    const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone; card.ctrl = player; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
    return card;
  };
  for (const player of game.players) for (let i = 0; i < 20; i++) put('Island', player, 'library');
  for (let i = 0; i < 4; i++) { put('Island', bot); put('Plains', bot); }
  game.turnPlayer = bot; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  const answers = [];
  const decide = bot.controller.decide.bind(bot.controller);
  bot.controller.decide = async (g, q) => { const result = await decide(g, q); answers.push({ q, result }); return result; };
  return { game, bot, opp, put, answers };
}

async function castAndResolve(t, name) {
  const card = t.put(name, t.bot, 'hand');
  t.game.recalc();
  assert.equal(await t.game.castSpell(t.bot, card, { from: 'hand' }), true);
  for (let n = 0; n < 12 && (t.game.stack.length || t.game.pendingTriggers.length); n++) {
    await t.game.flushTriggers();
    if (t.game.stack.length) await t.game.resolveTop();
  }
  return card;
}

const optional = t => t.answers.find(row => row.q.type === 'chooseOption' && row.q.aiHint?.kind === 'optTrigger');

test('an optional trigger the bot does not model (Pestermite) is used, not declined as worthless', async () => {
  const t = table();
  const ring = t.put('Sol Ring', t.opp);
  await castAndResolve(t, 'Pestermite');
  assert.equal(optional(t).result, 'yes');
  assert.equal(ring.tapped, true);
});

test('a "return target land" trigger bounces an opposing land, never the bot\'s own', async () => {
  const t = table();
  const forest = t.put('Forest', t.opp);
  await castAndResolve(t, 'Glowing Anemone');
  assert.equal(optional(t).result, 'yes');
  assert.equal(forest.zone, 'hand');
  assert.equal(t.game.battlefield.filter(card => card.ctrl === t.bot && card.is('Land')).length, 8);
});

test('the bot keeps an unthreatened creature instead of bouncing it for nothing', async () => {
  const t = table();
  const bear = t.put('Grizzly Bears', t.bot);
  await castAndResolve(t, 'Deputy of Acquittals');
  assert.equal(optional(t).result, 'no');
  assert.equal(bear.zone, 'battlefield');
});

test('the bot returns its creature to hand in response to removal aimed at it', async () => {
  const t = table();
  const bear = t.put('Grizzly Bears', t.bot);
  const murder = t.put('Murder', t.opp, 'exile');
  t.game.stack.push({ kind: 'spell', name: 'Murder', card: murder, srcCard: murder, ctrl: t.opp, targets: [bear] });
  const deputy = t.put('Deputy of Acquittals', t.bot, 'hand');
  t.game.recalc();
  assert.equal(await t.game.castSpell(t.bot, deputy, { from: 'hand' }), true);
  for (let n = 0; n < 6 && t.game.stack.at(-1)?.card !== murder; n++) {
    await t.game.flushTriggers();
    if (t.game.stack.at(-1)?.card !== murder) await t.game.resolveTop();
  }
  await t.game.flushTriggers();
  while (t.game.stack.at(-1) && t.game.stack.at(-1).card !== murder) { await t.game.resolveTop(); await t.game.flushTriggers(); }
  assert.equal(optional(t).result, 'yes');
  assert.equal(bear.zone, 'hand');
});

test('Estrid puts the Mask on another of the bot\'s permanents, never on itself or an opponent\'s', async () => {
  const t = table();
  const estrid = t.put('Estrid, the Masked', t.bot); estrid.counters.loyalty = 5;
  const bear = t.put('Grizzly Bears', t.bot);
  t.put('Serra Angel', t.opp); t.put('Sol Ring', t.opp);
  t.game.recalc();
  const row = t.game.activatableList(t.bot).find(entry => entry.card === estrid && /Mask/.test(entry.ability?.label || ''));
  assert.ok(row);
  assert.equal(t.game.legalTargets(row.ability.targets[0], estrid, t.bot).includes(estrid), false, 'another permanent excludes Estrid');
  assert.equal(await t.game.activateAbility(t.bot, row), true);
  for (let n = 0; n < 6 && t.game.stack.length; n++) await t.game.resolveTop();
  const mask = t.game.bf().find(card => card.name === 'Mask');
  assert.equal(t.game.byIid(mask.attachedTo), bear);
});
