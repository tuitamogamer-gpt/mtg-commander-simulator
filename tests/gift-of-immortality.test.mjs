import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function decision(game, q) {
  if (q.aiHint?.kind === 'commanderZone') return 'stay';
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 1);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'orderTriggers') return q.triggers;
  return null;
}

function add(game, owner, name, zone = 'battlefield') {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else owner[zone].push(card);
  game.recalc();
  return card;
}

async function settle(game) {
  await game.checkSBA();
  for (let n = 0; n < 60 && (game.pendingTriggers.length || game.stack.length); n++) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.pendingTriggers.length, 0);
  assert.equal(game.stack.length, 0);
  assert.equal(game.log.some(row => /AI V2 fallback/.test(row.msg)), false);
}

async function setup({ difficulty, chooseCommand = false, cast = false } = {}) {
  const game = new MTG.Game({ seed: 31831, paced: false, maxTurns: 20 });
  game.speedFactor = 0;
  const choices = [];
  const human = { decide: async (g, q) => {
    if (q.aiHint?.kind === 'commanderZone') {
      choices.push(q);
      return chooseCommand ? 'cz' : 'stay';
    }
    return decision(g, q);
  } };
  const owner = game.addPlayer('Avengers', { name: 'Avengers Assemble' }, human, !!difficulty);
  if (difficulty) owner.controller = new MTG.AIController(owner, { difficulty, style: 'balanced' });
  const opponent = game.addPlayer('Opponent', { name: 'Quick Draw' }, { decide: async (g, q) => decision(g, q) }, false);
  game.turnPlayer = owner;
  game.turnNo = 12;
  game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  const captain = add(game, owner, 'Captain America, Team Leader');
  captain.commander = true; captain.cmdCasts = 2; owner.commanders.push(captain);
  const gift = add(game, owner, 'Gift of Immortality', cast ? 'hand' : 'battlefield');
  if (cast) {
    for (let n = 0; n < 3; n++) add(game, owner, 'Plains');
    assert.equal(await game.castSpell(owner, gift), true);
    assert.equal(game.stack.at(-1).targets[0], captain);
    await settle(game);
    assert.equal(gift.castMeta.manaSpent, 3);
  } else await game.attach(gift, captain);
  return { game, owner, opponent, captain, gift, choices };
}

async function endStep({ game, opponent }) {
  game.phase = 'end'; game.step = 'end';
  await game.emit('endStep', { player: opponent });
  await settle(game);
}

for (const cause of ['destroy', 'damage', 'sacrifice', 'wipe-aura-first', 'wipe-creature-first']) {
  test(`Gift returns the commander through ${cause} and reattaches at the next end step`, async () => {
    const s = await setup({ cast: true });
    const { game, owner, opponent, captain, gift, choices } = s;
    if (cause === 'damage') {
      await game.damageCreature(add(game, opponent, 'Professor Hulk'), captain, 20);
      await game.checkSBA();
    } else if (cause === 'sacrifice') await game.sacrifice(owner, captain);
    else if (cause.startsWith('wipe')) await game.destroyMany(cause === 'wipe-aura-first' ? [gift, captain] : [captain, gift]);
    else await game.destroy(captain);
    assert.equal(captain.zone, 'graveyard');
    assert.equal(gift.zone, 'graveyard');
    await settle(game);
    assert.equal(captain.zone, 'battlefield');
    assert.equal(captain.ctrl, owner);
    assert.equal(captain.cmdCasts, 2, 'return is not a command-zone cast');
    assert.equal(captain.damage, 0);
    assert.equal(captain.sick, true);
    assert.equal(gift.zone, 'graveyard');
    assert.match(choices[0].prompt, /Gift of Immortality/);
    assert.equal(choices[0].aiHint.graveyardReturn, true);
    await endStep(s);
    assert.equal(gift.zone, 'battlefield');
    assert.equal(gift.attachedTo, captain.iid);
    assert.ok(captain.attachments.includes(gift.iid));
    assert.equal(game.delayed.length, 0);
  });
}

test('choosing the command zone prevents Gift from returning the commander or Aura', async () => {
  const s = await setup({ chooseCommand: true });
  await s.game.destroy(s.captain);
  await settle(s.game);
  await endStep(s);
  assert.equal(s.captain.zone, 'command');
  assert.equal(s.gift.zone, 'graveyard');
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`${difficulty} local AI leaves its commander in the graveyard for Gift`, async () => {
    const s = await setup({ difficulty });
    await s.game.destroy(s.captain);
    assert.equal(s.captain.zone, 'graveyard');
    await settle(s.game);
    assert.equal(s.captain.zone, 'battlefield');
    await endStep(s);
    assert.equal(s.gift.attachedTo, s.captain.iid);
  });
}

test('Gift reanimation emits the actual graveyard-leave events for creature and Aura', async () => {
  const s = await setup();
  const events = [];
  const emit = s.game.emit.bind(s.game);
  s.game.emit = async (name, data) => {
    if (name === 'cardLeftGraveyard') events.push(data.card);
    return emit(name, data);
  };
  await s.game.destroy(s.captain);
  await settle(s.game);
  await endStep(s);
  assert.deepEqual(events.map(card => card.iid), [s.captain.iid, s.gift.iid]);
});

test('returning Gift is already attached during its ETB event', async () => {
  const s = await setup();
  let attachedAtEntry = false;
  const emit = s.game.emit.bind(s.game);
  s.game.emit = async (name, data) => {
    if (name === 'etb' && data.card === s.gift) attachedAtEntry = s.gift.attachedTo === s.captain.iid;
    return emit(name, data);
  };
  await s.game.destroy(s.captain);
  await settle(s.game);
  await endStep(s);
  assert.equal(attachedAtEntry, true);
});

test('simultaneously destroyed Gift triggers for its battlefield controller', async () => {
  const s = await setup();
  s.gift.ctrl = s.opponent;
  await s.game.destroyMany([s.gift, s.captain]);
  await s.game.flushTriggers();
  assert.equal(s.game.stack.length, 1);
  assert.equal(s.game.stack[0].ctrl, s.opponent);
  await settle(s.game);
  await endStep(s);
  assert.equal(s.captain.ctrl, s.owner);
  assert.equal(s.gift.ctrl, s.owner);
});

for (const moved of ['creature-before-trigger', 'creature-before-end', 'aura-before-trigger', 'aura-before-end']) {
  test(`Gift does not follow a new object after ${moved}`, async () => {
    const s = await setup();
    await s.game.destroy(s.captain);
    if (moved === 'creature-before-trigger') {
      await s.game.move(s.captain, 'exile', { noCmdReplace: true });
      await s.game.move(s.captain, 'graveyard', { noCmdReplace: true });
    } else if (moved === 'aura-before-trigger') {
      await s.game.move(s.gift, 'exile');
      await s.game.move(s.gift, 'graveyard');
    }
    await settle(s.game);
    if (moved === 'creature-before-end') {
      await s.game.move(s.captain, 'exile', { noCmdReplace: true });
      await s.game.move(s.captain, 'battlefield');
    } else if (moved === 'aura-before-end') {
      await s.game.move(s.gift, 'exile');
      await s.game.move(s.gift, 'graveyard');
    }
    await endStep(s);
    assert.equal(s.gift.zone, 'graveyard');
    assert.equal(s.captain.zone, moved === 'creature-before-trigger' ? 'graveyard' : 'battlefield');
  });
}

test('removing only Gift before death gives no return trigger', async () => {
  const s = await setup();
  await s.game.destroy(s.gift);
  await s.game.destroy(s.captain);
  await settle(s.game);
  await endStep(s);
  assert.equal(s.captain.zone, 'graveyard');
  assert.equal(s.gift.zone, 'graveyard');
});

test('a token cannot return and does not bring Gift back', async () => {
  const s = await setup();
  s.captain.commander = false; s.captain.isToken = true;
  await s.game.destroy(s.captain);
  await settle(s.game);
  await endStep(s);
  assert.equal(s.captain.zone, 'ceased');
  assert.equal(s.gift.zone, 'graveyard');
});

test('Gift can protect the same commander again after the Aura returns', async () => {
  const s = await setup();
  for (let cycle = 0; cycle < 2; cycle++) {
    await s.game.destroy(s.captain);
    await settle(s.game);
    assert.equal(s.captain.zone, 'battlefield');
    assert.equal(s.gift.zone, 'graveyard');
    await endStep(s);
    assert.equal(s.gift.attachedTo, s.captain.iid);
  }
});

test('a second death before the Aura returns leaves the commander dead', async () => {
  const s = await setup();
  await s.game.destroy(s.captain);
  await settle(s.game);
  await s.game.destroy(s.captain);
  await settle(s.game);
  await endStep(s);
  assert.equal(s.captain.zone, 'graveyard');
  assert.equal(s.gift.zone, 'graveyard');
});

test('dying after an end step begins schedules the Aura for the following end step', async () => {
  const s = await setup();
  await endStep(s);
  await s.game.destroy(s.captain);
  await settle(s.game);
  assert.equal(s.captain.zone, 'battlefield');
  assert.equal(s.gift.zone, 'graveyard');
  assert.equal(s.game.delayed.length, 1);
  await endStep(s);
  assert.equal(s.gift.zone, 'battlefield');
});

for (const effect of ['shroud', 'hexproof', 'protection', 'not-creature', 'phased-out']) {
  test(`Gift delayed attachment respects ${effect}`, async () => {
    const s = await setup();
    await s.game.destroy(s.captain);
    await settle(s.game);
    s.game.untilEffects.push({ apply: () => {
      if (effect === 'protection') s.captain.cur.protectionFrom = [(_g, source) => source.colors.includes('W')];
      else if (effect === 'not-creature') s.captain.cur.types = ['Artifact'];
      else if (effect === 'phased-out') s.captain.phasedOut = true;
      else s.captain.cur.kw.add(effect);
    } });
    s.game.recalc();
    await endStep(s);
    assert.equal(s.gift.zone, ['shroud', 'hexproof'].includes(effect) ? 'battlefield' : 'graveyard');
  });
}

test('removing the Aura in response does not counter its creature-return trigger', async () => {
  const s = await setup();
  await s.game.destroy(s.captain);
  await s.game.flushTriggers();
  await s.game.move(s.gift, 'exile');
  await settle(s.game);
  assert.equal(s.captain.zone, 'battlefield');
  await endStep(s);
  assert.equal(s.gift.zone, 'exile');
});

test('removing the creature in response to the delayed trigger leaves Gift in the graveyard', async () => {
  const s = await setup();
  await s.game.destroy(s.captain);
  await settle(s.game);
  await s.game.emit('endStep', { player: s.opponent });
  await s.game.flushTriggers();
  await s.game.move(s.captain, 'exile', { noCmdReplace: true });
  await settle(s.game);
  assert.equal(s.gift.zone, 'graveyard');
});

for (const scenario of ['no-gift', 'disabled-gift', 'exile', 'finality']) {
  test(`local AI keeps choosing the command zone for ${scenario}`, async () => {
    const s = await setup({ difficulty: 'hard' });
    if (scenario === 'no-gift') await s.game.destroy(s.gift);
    if (scenario === 'disabled-gift') {
      s.game.untilEffects.push({ apply: () => { s.gift.cur.abilitiesDisabled = true; } });
      s.game.recalc();
    }
    if (scenario === 'finality') s.game.addCounters(s.captain, 'finality', 1);
    if (scenario === 'exile') await s.game.move(s.captain, 'exile');
    else await s.game.destroy(s.captain);
    await settle(s.game);
    await endStep(s);
    assert.equal(s.captain.zone, 'command');
    assert.equal(s.gift.zone, 'graveyard');
  });
}
