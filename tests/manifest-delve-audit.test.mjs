import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
function answer(q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'chooseCards') return q.from.slice(0, q.aiHint?.kind === 'delve' ? q.max : q.min || 0);
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'chooseManaSources') return { cards: q.suggested };
  return null;
}
function fixture(role = 'human', decide) {
  const game = new MTG.Game({ seed: 950505, paced: false });
  const trace = [];
  const player = game.addPlayer('Actor', { name: 'Test' }, null, role === 'ai');
  const opponent = game.addPlayer('Opponent', { name: 'Test' }, { decide: async (_, q) => answer(q) }, false);
  const ai = new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' });
  player.controller = { decide: async (g, q) => {
    trace.push(q);
    if (decide) { const result = decide(g, q); if (result !== undefined) return result; }
    return role === 'ai' ? ai.decide(g, q) : answer(q);
  } };
  game.turnPlayer = player; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  // Keep each announced spell on the real Stack until the test resolves it.
  game.priorityRound = async () => {};
  const put = (name, zone = 'library', owner = player) => {
    const card = new MTG.CardInst(typeof name === 'string' ? MTG.DEFS[name] : name, owner);
    card.zone = zone; card.ctrl = owner;
    if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
    return card;
  };
  for (const owner of [player, opponent]) for (let i = 0; i < 12; i++) put('Forest', 'library', owner);
  return { game, player, opponent, put, trace };
}
const actionFor = (game, player, card) => game.activatableList(player).find(a => a.card === card && a.turnFaceUp);

for (const role of ['human', 'ai']) {
  for (const [spellName, mana] of [['Soul Summons', { C: 1, W: 1 }], ['Manifest Dread', { C: 1, G: 1 }]]) {
    test(`${role}: paid ${spellName} manifests a real creature and offers a paid face-up action`, async () => {
      const { game, player, put } = fixture(role);
      const bear = put('Grizzly Bears');
      const spell = put(spellName, 'hand'); Object.assign(player.pool, mana); game.recalc();
      assert.equal(await game.castSpell(player, spell), true);
      await game.resolveTop();
      assert.equal(bear.zone, 'battlefield'); assert.equal(bear.faceDown, true); assert.equal(bear.isToken, false);
      assert.equal(bear.power, 2); assert.equal(bear.mv, 0);
      assert.equal(actionFor(game, player, bear), undefined, 'no mana remaining after the spell');
      const forest = put('Forest', 'battlefield'), island = put('Island', 'battlefield'); game.recalc();
      const q = { type: 'main', player, casts: [], lands: [], acts: game.activatableList(player), phase: game.phase };
      const action = role === 'ai' ? await player.controller.decide(game, q) : { kind: 'activate', entry: actionFor(game, player, bear) };
      assert.equal(action.kind, 'activate'); assert.equal(action.entry.card, bear);
      assert.equal(await game.performAction(player, action), true);
      assert.equal(bear.faceDown, false); assert.equal(bear.name, 'Grizzly Bears');
      assert.equal(forest.tapped, true); assert.equal(island.tapped, true);
      assert.equal(game.stack.length, 0); assert.ok(!game.aiDecisionLog?.some(row => row.fallback));
    });
  }
  test(`${role}: delve pays only generic mana using exact graveyard cards`, async () => {
    const { game, player, put } = fixture(role);
    const spell = put('Treasure Cruise', 'hand');
    const fodder = Array.from({ length: 7 }, () => put('Forest', 'graveyard'));
    put('Island', 'battlefield'); game.recalc();
    const offer = game.castableList(player).find(e => e.card === spell && e.alt?.delve);
    assert.ok(offer);
    const hand = player.hand.length;
    assert.equal(await game.castSpell(player, spell, { from: offer.from, alt: offer.alt }), true);
    assert.equal(spell.castMeta?.manaSpent ?? game.stack.at(-1).manaSpent, 1);
    assert.ok(fodder.every(card => card.zone === 'exile'));
    await game.resolveTop(); assert.equal(player.hand.length, hand - 1 + 3);
  });
}

for (const name of ['Forest', 'Swords to Plowshares', 'Treasure Cruise', 'Sol Ring']) {
  test(`manifest ${name}: a noncreature has no printed-mana-cost face-up action`, async () => {
    const { game, player, put } = fixture(); const card = put(name);
    for (const color of Object.keys(player.pool)) player.pool[color] = 20;
    await game.manifestTop(player);
    assert.equal(actionFor(game, player, card), undefined);
    assert.equal(await game.turnFaceUp(player, card), false);
    assert.equal(card.faceDown, true); assert.equal(card.power, 2);
  });
}

test('manifested delve creature must pay its full printed cost to turn face up', async () => {
  const { game, player, put } = fixture(); const card = put('Gurmag Angler');
  const fodder = Array.from({ length: 6 }, () => put('Forest', 'graveyard'));
  player.pool.B = 1; await game.manifestTop(player);
  assert.equal(actionFor(game, player, card), undefined);
  assert.equal(await game.turnFaceUp(player, card), false);
  player.pool.C = 6;
  assert.equal(await game.activateAbility(player, actionFor(game, player, card)), true);
  assert.equal(card.power, 5); assert.ok(fodder.every(c => c.zone === 'graveyard'));
});

for (const name of ['Logic Knot', 'Empty the Pits']) {
  test(`delve ${name}: graveyard payment contributes to the selectable X`, async () => {
    const { game, player, opponent, put, trace } = fixture();
    if (name === 'Logic Knot') {
      game.turnPlayer = opponent;
      const target = put('Grizzly Bears', 'hand', opponent); opponent.pool.G = 1; opponent.pool.C = 1;
      assert.equal(await game.castSpell(opponent, target), true);
    }
    const spell = put(name, 'hand'); const count = name === 'Logic Knot' ? 5 : 6;
    const fodder = Array.from({ length: count }, () => put('Forest', 'graveyard'));
    Object.assign(player.pool, name === 'Logic Knot' ? { U: 2 } : { B: 4 }); game.recalc();
    const alt = spell.def.altCosts.find(a => a.delve);
    assert.equal(game.maxAffordableX(player, game.spellCost(player, spell, alt), spell, { castOpts: alt }), name === 'Logic Knot' ? 5 : 3);
    assert.equal(await game.castSpell(player, spell, { alt }), true);
    assert.equal(game.stack.at(-1).x, name === 'Logic Knot' ? 5 : 3);
    assert.equal(trace.find(q => q.aiHint?.kind === 'delve').max, count);
    assert.ok(fodder.every(c => c.zone === 'exile'));
    await game.resolveTop();
    if (name === 'Empty the Pits') assert.equal(game.creatures(player).filter(c => c.isToken && c.hasSub('Zombie') && c.tapped).length, 3);
    else assert.equal(game.stack.length, 0);
  });
}

for (const invalid of ['duplicate', 'foreign', 'too-many', 'cancel']) {
  test(`delve rejects ${invalid} payment without consuming mana or cards`, async () => {
    let selection;
    const { game, player, opponent, put } = fixture('human', (_, q) => q.aiHint?.kind === 'delve' ? selection : undefined);
    const spell = put('Gurmag Angler', 'hand'); const fodder = Array.from({ length: 7 }, () => put('Forest', 'graveyard'));
    const foreign = put('Island', 'graveyard', opponent);
    selection = invalid === 'duplicate' ? Array(6).fill(fodder[0]) : invalid === 'foreign' ? [foreign] : invalid === 'too-many' ? fodder : { kind: 'cancel' };
    player.pool.B = 1; player.pool.C = 6; game.recalc();
    assert.equal(await game.castSpell(player, spell, { alt: spell.def.altCosts[0] }), false);
    assert.equal(spell.zone, 'hand'); assert.equal(player.pool.B, 1); assert.equal(player.pool.C, 6);
    assert.ok(fodder.every(c => c.zone === 'graveyard')); assert.equal(foreign.zone, 'graveyard');
    assert.equal(game.stack.length, 0);
  });
}

test('delve cannot replace a missing colored pip and a failed payment exiles nothing', async () => {
  const { game, player, put } = fixture(); const spell = put('Gurmag Angler', 'hand');
  const fodder = Array.from({ length: 7 }, () => put('Forest', 'graveyard')); game.recalc();
  assert.ok(!game.castableList(player).some(e => e.card === spell));
  assert.equal(await game.castSpell(player, spell, { alt: spell.def.altCosts[0] }), false);
  assert.ok(fodder.every(c => c.zone === 'graveyard')); assert.equal(spell.zone, 'hand');
});

for (const role of ['human', 'ai']) test(`${role}: Tasigur with four lands and two graveyard cards pays both required delve cards`, async () => {
  const { game, player, put, trace } = fixture(role);
  const spell = put('Tasigur, the Golden Fang', 'hand');
  const lands = ['Forest', 'Forest', 'Island', 'Woodland Cemetery'].map(name => put(name, 'battlefield'));
  const fodder = ['Foreboding Landscape', 'Rampant Growth'].map(name => put(name, 'graveyard'));
  game.recalc();
  const offer = game.castableList(player).find(e => e.card === spell && e.alt?.delve); assert.ok(offer);
  assert.equal(await game.castSpell(player, spell, { alt: offer.alt }), true);
  const question = trace.find(q => q.aiHint?.kind === 'delve');
  assert.equal(question.min, 2); assert.equal(question.max, 2);
  assert.ok(fodder.every(c => c.zone === 'exile')); assert.ok(lands.every(c => c.tapped));
  assert.equal(game.stack.at(-1).manaSpent, 4); await game.resolveTop(); assert.equal(spell.zone, 'battlefield');
});

test('delve remains optional when the full printed mana cost is available', async () => {
  const { game, player, put, trace } = fixture('human', (_, q) => q.aiHint?.kind === 'delve' ? [] : undefined);
  const spell = put('Gurmag Angler', 'hand'); const fodder = put('Forest', 'graveyard');
  player.pool.C = 6; player.pool.B = 1; game.recalc();
  assert.equal(await game.castSpell(player, spell), true);
  assert.equal(trace.find(q => q.aiHint?.kind === 'delve').min, 0);
  assert.equal(fodder.zone, 'graveyard'); assert.equal(game.stack.at(-1).manaSpent, 7);
});

test('delve cannot be invented on a spell without the ability', async () => {
  const { game, player, put } = fixture(); const spell = put('Grizzly Bears', 'hand');
  const fodder = put('Forest', 'graveyard'); player.pool.G = 1; game.recalc();
  assert.equal(await game.castSpell(player, spell, { alt: { delve: true } }), false);
  assert.equal(fodder.zone, 'graveyard'); assert.equal(player.pool.G, 1);
});

test('delve pays an alternative cost and an additional generic tax', async () => {
  const { game, player, put } = fixture();
  const spell = put({ ...MTG.DEFS['Gurmag Angler'], altCosts: [{ delve: true }, { label: 'Test alternative', altCostStr: '{3}{B}' }] }, 'hand');
  const fodder = Array.from({ length: 4 }, () => put('Forest', 'graveyard'));
  put({ name: 'Audit generic tax', cost: '{2}', super: [], types: ['Artifact'], subtypes: [], kws: [], oracle: 'Spells cost {1} more to cast.', costMods: [() => 1] }, 'battlefield');
  player.pool.B = 1; game.recalc();
  const alt = spell.def.altCosts[1];
  assert.ok(game.castableList(player).some(e => e.card === spell && e.alt?.altCostStr === '{3}{B}'));
  assert.equal(await game.castSpell(player, spell, { alt }), true);
  assert.ok(fodder.every(c => c.zone === 'exile')); assert.equal(game.stack.at(-1).manaSpent, 1);
});

test('delve never increases X for an activated ability on a delve creature', async () => {
  const { game, player, put } = fixture(); const fiend = put('Necropolis Fiend', 'battlefield');
  for (let i = 0; i < 6; i++) put('Forest', 'graveyard');
  player.pool.C = 2; game.recalc();
  assert.equal(game.maxAffordableX(player, MTG.parseCost('{X}'), fiend), 2);
});

test('manifest turns up tapped and summoning-sick cards in opponent priority without an ETB', async () => {
  const { game, player, opponent, put } = fixture();
  const card = put('Llanowar Visionary'); put('Mastery of the Unseen', 'battlefield');
  await game.manifestTop(player); card.tapped = true;
  assert.equal(card.sick, true);
  game.turnPlayer = opponent; game.phase = 'combat'; game.step = 'blockers';
  player.pool.C = 2; player.pool.G = 1; const hand = player.hand.length, life = player.life;
  const version = card.zoneVersion;
  assert.equal(await game.activateAbility(player, actionFor(game, player, card)), true);
  assert.equal(card.tapped, true); assert.equal(card.sick, true); assert.equal(card.zoneVersion, version);
  assert.equal(player.hand.length, hand, 'Llanowar Visionary does not enter again or draw a card');
  await game.flushTriggers(); while (game.stack.length) await game.resolveTop();
  assert.equal(player.life, life + 1, 'Mastery of the Unseen sees the face-up event');
});

test('manifest offers the front of a double-faced creature and restores it when turned up', async () => {
  const { game, player, put } = fixture();
  const def = Object.values(MTG.DEFS).find(d => d.oracleFaces && d.types.includes('Creature') && d.cost);
  assert.ok(def, 'catalog includes a creature with two faces');
  const card = put(def); await game.manifestTop(player);
  for (const color of Object.keys(player.pool)) player.pool[color] = 20;
  const action = actionFor(game, player, card); assert.ok(action, def.name);
  assert.equal(await game.activateAbility(player, action), true);
  assert.equal(card.faceDown, false); assert.equal(card.oracleFace, 'front'); assert.equal(card.name, def.name);
});

test('local AI does not reveal an unchosen face-up action in its public decision log', async () => {
  const { game, player, put } = fixture('ai'); const card = put('Gurmag Angler');
  await game.manifestTop(player); player.pool.C = 6; player.pool.B = 1;
  const q = { type: 'priority', player, casts: [], acts: game.activatableList(player) };
  const decision = await player.controller.decide(game, q);
  assert.equal(decision.kind, 'pass'); assert.equal(card.faceDown, true);
  assert.doesNotMatch(JSON.stringify(game.aiDecisionLog), /Gurmag Angler/);
});

test('Manifest Dread keeps both privately viewed identities out of the public AI log', async () => {
  const { game, player, put } = fixture('ai'); const card = put('Grizzly Bears');
  await game.manifestDread(player);
  assert.equal(card.faceDown, true);
  assert.doesNotMatch(JSON.stringify(game.aiDecisionLog), /Grizzly Bears|Forest/);
  assert.equal(game.aiDecisionLog.at(-1).chosen, 'Choose a card to manifest');
});
