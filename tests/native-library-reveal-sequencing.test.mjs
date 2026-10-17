import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();

function fixture({ paced = true, humanIndex = 0, option = 'no' } = {}) {
  const game = new M.Game({ seed: 171026, paced });
  const questions = [], gates = [];
  const players = ['Caster', 'Rival', 'Third'].map((name, i) => game.addPlayer(name, { name }, {
    decide: async (g, q) => {
      questions.push(q);
      if (q.type === 'cardReveal') return new Promise(resolve => gates.push({ q, resolve }));
      if (q.type === 'chooseOption') return option === 'first' ? q.options[0]?.key : option;
      if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
      if (q.type === 'chooseX') return q.min || 0;
      if (q.type === 'orderTriggers') return q.triggers;
      if (q.type === 'priority') return { kind: 'pass' };
      return null;
    },
  }, i !== humanIndex));
  game.turnPlayer = players[0]; game.turnNo = 7; game.phase = 'main1'; game.step = 'main';
  game.pace = async () => {};
  game.priorityRound = async () => {};
  const put = (name, player = players[0], zone = 'library') => {
    const card = new M.CardInst(M.DEFS[name], player);
    card.zone = zone;
    if (zone === 'battlefield') game.battlefield.push(card);
    else player[zone].push(card);
    game.recalc();
    return card;
  };
  const resolveEffect = (source, run, extra = {}) => {
    const ctx = { g: game, src: source, you: players[0], targets: [], data: {}, ...extra };
    game.stack.push({ kind: 'trigger', name: source.name, srcCard: source, ctrl: players[0], ctx, run, targets: [] });
    return game.resolveTop();
  };
  const next = async () => {
    for (let i = 0; i < 100 && !gates.length; i++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(gates.length, 'the effect must wait for a card review');
    return gates.shift();
  };
  return { game, players, questions, put, resolveEffect, next, gates };
}

for (const humanIndex of [0, 1]) {
  test(`Etali shows every player's top card before any cast choice (human seat ${humanIndex})`, async () => {
    const f = fixture({ humanIndex });
    const etali = f.put('Etali, Primal Storm', f.players[0], 'battlefield');
    const top = [f.put('Sol Ring'), f.put('Forest', f.players[1]), f.put('Arcane Signet', f.players[2])];
    const resolving = f.resolveEffect(etali, etali.def.triggers.find(t => t.on === 'attacks').run);
    const start = await f.next();
    assert.equal(start.q.revealStage, 'start');
    assert.equal(start.q.cards.length, 0);
    assert.equal(start.q.card, undefined);
    assert.ok(top.every(card => card.zone === 'library'), 'nothing moves before the first click');
    start.resolve(null);
    for (let i = 0; i < top.length; i++) {
      const step = await f.next();
      assert.equal(step.q.card, top[i]);
      assert.deepEqual(Array.from(step.q.cards), top.slice(0, i + 1));
      assert.equal(top[i].zone, 'exile');
      assert.ok(top.slice(i + 1).every(card => card.zone === 'library'), 'future top cards stay hidden');
      assert.equal(f.questions.some(q => q.aiHint?.kind === 'freeCast'), false, 'cast choices wait for all reveals');
      step.resolve(null);
    }
    await resolving;
    assert.equal(f.questions.filter(q => q.aiHint?.kind === 'freeCast').length, 2, 'lands stay exiled without a cast choice');
    assert.ok(top.every(card => card.zone === 'exile'));
  });
}

test('Discover pauses on lands and the qualifying hit, then moves the chosen hit to hand cleanly', async () => {
  const f = fixture({ option: 'hand' });
  const source = f.put('Etali, Primal Storm', f.players[0], 'battlefield');
  const untouched = f.put('Island');
  const hit = f.put('Arcane Signet');
  const land = f.put('Forest');
  const resolving = f.resolveEffect(source, () => M.E7.discover(f.game, f.players[0], 2, source));
  (await f.next()).resolve(null);
  let step = await f.next();
  assert.equal(step.q.card, land);
  assert.equal(hit.zone, 'library');
  step.resolve(null);
  step = await f.next();
  assert.equal(step.q.card, hit);
  assert.equal(f.questions.some(q => q.aiHint?.kind === 'freeCastOrHand'), false);
  assert.equal(untouched.zone, 'library');
  step.resolve(null);
  await resolving;
  assert.equal(hit.zone, 'hand');
  assert.equal(f.players[0].hand.filter(card => card === hit).length, 1);
  assert.equal(f.players[0].exile.length, 0, 'no stale exiled references remain after cleanup');
  assert.deepEqual(Array.from(f.players[0].library), [land, untouched]);
});

test('Discover casts from its real exile zone and cleans up all remaining cards', async () => {
  const f = fixture({ paced: false, option: 'cast' });
  const hit = f.put('Sol Ring');
  const land = f.put('Forest');
  await M.E7.discover(f.game, f.players[0], 1, hit);
  assert.equal(hit.zone, 'stack');
  assert.equal(f.game.stack.find(so => so.card === hit)?.from, 'exile');
  assert.equal(f.players[0].exile.length, 0);
  assert.deepEqual(Array.from(f.players[0].library), [land]);
  assert.equal(f.questions.some(q => q.type === 'cardReveal'), false, 'headless simulations never wait for presentation');
});

test('Discover puts an uncastable spell into hand instead of losing it from all zones', async () => {
  const f = fixture({ paced: false, option: 'cast' });
  const hit = f.put('Doom Blade');
  await M.E7.discover(f.game, f.players[0], 2, hit);
  assert.equal(hit.zone, 'hand');
  assert.equal(f.players[0].hand.includes(hit), true);
  assert.equal(f.players[0].exile.includes(hit), false);
  assert.equal(f.game.stack.some(so => so.card === hit), false);
});

test('Escape to the Wilds waits for all impulse reveals before granting the extra land play', async () => {
  const f = fixture();
  const spell = f.put('Escape to the Wilds', f.players[0], 'hand');
  const cards = [f.put('Forest'), f.put('Sol Ring')];
  const before = f.players[0].maxLands;
  const resolving = f.resolveEffect(spell, spell.def.resolve);
  (await f.next()).resolve(null);
  for (const card of cards.slice().reverse()) {
    const step = await f.next();
    assert.equal(step.q.card, card);
    assert.equal(f.players[0].maxLands, before);
    step.resolve(null);
  }
  await resolving;
  assert.equal(f.players[0].maxLands, before + 1);
  for (const card of cards) {
    assert.equal(card.zone, 'exile');
    assert.equal(card.meta.playableBy, f.players[0]);
    assert.equal(card.meta.playableUntilOwnTurn, f.players[0].turnsStarted + 1);
  }
});

test('Epic Experiment waits for its full public reveal before casting or moving misses to the graveyard', async () => {
  const f = fixture();
  const spell = f.put('Epic Experiment', f.players[0], 'hand');
  const instant = f.put('Brainstorm');
  const land = f.put('Forest');
  const resolving = f.resolveEffect(spell, spell.def.resolve, { x: 2 });
  (await f.next()).resolve(null);
  let step = await f.next();
  assert.equal(step.q.card, land);
  assert.equal(instant.zone, 'library');
  step.resolve(null);
  step = await f.next();
  assert.equal(step.q.card, instant);
  assert.equal(land.zone, 'exile');
  assert.equal(f.questions.some(q => q.aiHint?.kind === 'freeCast'), false);
  step.resolve(null);
  await resolving;
  assert.equal(instant.zone, 'graveyard');
  assert.equal(land.zone, 'graveyard');
});

test('Tectonic Giant exiles and reveals both cards before choosing which one can be played', async () => {
  const f = fixture({ option: 'impulse' });
  const giant = f.put('Tectonic Giant', f.players[0], 'battlefield');
  const cards = [f.put('Forest'), f.put('Sol Ring')];
  const resolving = f.resolveEffect(giant, giant.def.triggers.find(t => t.on === 'attacks').run);
  (await f.next()).resolve(null);
  for (const card of cards.slice().reverse()) {
    const step = await f.next();
    assert.equal(step.q.card, card);
    assert.equal(f.questions.some(q => q.type === 'chooseCards'), false);
    step.resolve(null);
  }
  await resolving;
  assert.ok(cards.every(card => card.zone === 'exile'), 'both exiled cards remain in exile');
  assert.equal(f.players[0].library.length, 0);
  assert.equal(cards[1].meta.playableBy, f.players[0]);
  assert.equal(cards[0].meta.playableBy, undefined, 'only the selected card gains permission');
});

test('Path of Discovery reveals a land before explore moves it into hand', async () => {
  const f = fixture();
  const path = f.put('Path of Discovery', f.players[0], 'battlefield');
  const creature = f.put('Etali, Primal Storm', f.players[0], 'battlefield');
  const land = f.put('Forest');
  const resolving = f.resolveEffect(path, path.def.triggers[0].run, { data: { card: creature } });
  (await f.next()).resolve(null);
  const step = await f.next();
  assert.equal(step.q.card, land);
  assert.equal(land.zone, 'library');
  assert.equal(f.players[0].library.includes(land), true, 'the card remains available to Live inspection');
  assert.equal(f.players[0].hand.length, 0);
  step.resolve(null);
  await resolving;
  assert.equal(land.zone, 'hand');
  assert.equal(f.players[0].hand.includes(land), true);
});

for (const name of ['Satyr Wayfinder', 'Shigeki, Jukai Visionary', 'Grisly Salvage']) {
  test(`${name} publicly reviews top cards in order before choosing a land`, async () => {
    const f = fixture();
    const source = f.put(name, f.players[0], 'battlefield');
    const bottom = f.put('Forest');
    const top = f.put('Sol Ring');
    const run = name === 'Satyr Wayfinder' ? source.def.triggers[0].run
      : name === 'Grisly Salvage' ? source.def.resolve : source.def.abilities[0].run;
    const resolving = f.resolveEffect(source, run);
    (await f.next()).resolve(null);
    for (const card of [top, bottom]) {
      const step = await f.next();
      assert.equal(step.q.card, card);
      assert.equal(f.players[0].library.length, 2);
      assert.equal(f.game.byIid(top.iid), top);
      assert.equal(f.game.byIid(bottom.iid), bottom);
      assert.equal(f.questions.some(q => q.type === 'chooseCards'), false);
      step.resolve(null);
    }
    await resolving;
    assert.equal(top.zone, 'graveyard');
    assert.equal(bottom.zone, 'graveyard', 'declined land remains part of the graveyard batch');
  });
}

test('Transforming Flourish exiles a rival library one card at a time before their free cast choice', async () => {
  const f = fixture();
  const spell = f.put('Transforming Flourish', f.players[0], 'hand');
  const target = f.put('Sol Ring', f.players[1], 'battlefield');
  const hit = f.put('Arcane Signet', f.players[1]);
  const land = f.put('Forest', f.players[1]);
  const resolving = f.resolveEffect(spell, spell.def.resolve, { targets: [target] });
  (await f.next()).resolve(null);
  for (const card of [land, hit]) {
    const step = await f.next();
    assert.equal(step.q.card, card);
    assert.equal(step.q.ctrl, f.players[1]);
    assert.equal(card.zone, 'exile');
    assert.equal(f.questions.some(q => q.aiHint?.kind === 'freeCast'), false);
    if (card === land) assert.equal(hit.zone, 'library');
    step.resolve(null);
  }
  await resolving;
  assert.equal(target.zone, 'graveyard');
  assert.equal(f.questions.filter(q => q.aiHint?.kind === 'freeCast').length, 1);
  assert.equal(hit.zone, 'exile');
});
