import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function fixture() {
  const game = new M.Game({seed: 10092026, paced: false});
  game.speedFactor = 0;
  const trace = [], selections = [];
  const f = {game, trace, selections};
  const answer = async (p, q) => {
    if (q.type === 'priority') {
      trace.push({player: p, phase: game.phase, step: game.step,
        acts: q.acts.slice(), casts: q.casts.slice(),
        splitSecond: game.hasSplitSecond(),
        stack: game.stack.map(o => ({kind: o.kind, name: o.name, card: o.card, srcCard: o.srcCard}))});
      await f.onPriority?.(p, q);
      const selected = await f.select?.(p, q);
      if (selected) {selections.push(selected); return selected;}
      return {kind: 'pass'};
    }
    const choice = f.choose?.(p, q);
    if (choice !== undefined) return choice;
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(o => o.key === 'yes')?.key || q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards.slice(), bottom: []};
    if (q.type === 'chooseX') return q.min || 0;
    if (q.type === 'main') return {kind: 'done'};
    if (['attackers', 'blockers', 'combatReview'].includes(q.type)) return [];
    return null;
  };
  const players = ['You', 'Opponent'].map(name => {
    let p;
    p = game.addPlayer(name, {name}, {decide: async (g, q) => answer(p, q)}, false);
    return p;
  });
  const [me, rival] = players;
  Object.assign(f, {players, me, rival});
  game.turnPlayer = me; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  f.put = (name, zone = 'battlefield', owner = me) => {
    assert.ok(M.DEFS[name], `native definition: ${name}`);
    const c = new M.CardInst(M.DEFS[name], owner);
    c.zone = zone; c.ctrl = owner; c.sick = false;
    if (zone === 'battlefield') game.battlefield.push(c); else owner[zone].push(c);
    game.recalc(); return c;
  };
  for (const p of players) for (let i = 0; i < 12; i++) f.put('Forest', 'library', p);
  f.lands = (names, owner = me) => names.map(name => f.put(name, 'battlefield', owner));
  f.selectOnce = predicate => {f.select = (p, q) => {
    if (p !== me || selections.length) return null;
    const entry = q.acts.find(predicate);
    return entry ? {kind: 'activate', entry} : null;
  };};
  f.done = () => {
    assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
    assertGameStateInvariants(game);
  };
  return f;
}

function rivalCombat(f) {
  f.game.turnPlayer = f.rival; f.game.phase = 'combat'; f.game.step = 'attackers';
}

test('Teferi, Master of Time reaches real opponent combat priority and pays once-per-turn loyalty', async () => {
  const f = fixture(), teferi = f.put('Teferi, Master of Time');
  teferi.counters.loyalty = 3;
  const top = f.me.library.at(-1);
  rivalCombat(f);
  f.choose = (p, q) => p === f.me && q.type === 'chooseCards' && q.from.includes(top) ? [top] : undefined;
  f.selectOnce(e => e.card === teferi && e.ability.loyalty === 1);
  await f.game.priorityRound(f.me);
  assert.equal(f.selections.length, 1, 'the granted instant-speed loyalty action reaches its player');
  assert.equal(teferi.counters.loyalty, 4);
  assert.equal(top.zone, 'graveyard', 'the native draw/discard effect resolved');
  assert.equal(f.game.activatableList(f.me, true).some(e => e.card === teferi), false,
    'instant timing does not permit another loyalty activation in the same turn');
  f.game.turnNo++;
  assert.ok(f.game.activatableList(f.me, true).some(e => e.card === teferi),
    'the allowance resets on the next actual turn number');
  f.done();
});

test('The Wandering Emperor flashed into combat exposes entry-turn loyalty through real priority', async () => {
  const f = fixture(), emperor = f.put('The Wandering Emperor', 'hand'), bear = f.put('Grizzly Bears');
  const lands = f.lands(['Plains', 'Plains', 'Island', 'Island']);
  rivalCombat(f);
  assert.equal(await f.game.castSpell(f.me, emperor, {from: 'hand'}), true);
  f.choose = (p, q) => p === f.me && q.type === 'chooseTargets' && q.candidates.includes(bear) ? [bear] : undefined;
  f.selectOnce(e => e.card === emperor && e.ability.loyalty === 1);
  await f.game.priorityRound(f.me);
  assert.equal(f.selections.length, 1, 'the new permanent can activate before the combat window closes');
  assert.equal(emperor.counters.loyalty, 4);
  assert.equal(bear.counters['+1/+1'], 1);
  assert.equal(bear.kw('first strike'), true);
  assert.ok(lands.every(c => c.tapped), 'the original flash cast used four actual lands');
  f.game.turnNo++;
  assert.equal(f.game.activatableList(f.me, true).some(e => e.card === emperor), false,
    'the timing exception expires after the entry turn');
  f.done();
});

test('an earned Teferi emblem carries its granted loyalty timing through the final priority filter', async () => {
  const f = fixture(), archmage = f.put('Teferi, Temporal Archmage'), jace = f.put('Jace Beleren');
  archmage.counters.loyalty = 11; jace.counters.loyalty = 3;
  const ultimate = f.game.activatableList(f.me).find(e => e.card === archmage && e.ability.loyalty === -10);
  assert.ok(ultimate);
  assert.equal(await f.game.activateAbility(f.me, ultimate), true);
  assert.ok(f.me.emblems.some(e => e.c14Teferi), 'the native ultimate produced the timing permission');
  rivalCombat(f);
  const before = f.players.map(p => p.hand.length);
  f.selectOnce(e => e.card === jace && e.ability.loyalty === 2);
  await f.game.priorityRound(f.me);
  assert.equal(f.selections.length, 1);
  assert.equal(jace.counters.loyalty, 5);
  assert.deepEqual(f.players.map(p => p.hand.length), before.map(n => n + 1));
  f.done();
});

test('ordinary planeswalker loyalty remains unavailable in opponent combat', async () => {
  const f = fixture(), jace = f.put('Jace Beleren'); jace.counters.loyalty = 3;
  rivalCombat(f);
  await f.game.askPriorityAction(f.me);
  assert.equal(f.trace.at(-1).acts.some(e => e.card === jace), false);
  assert.equal(await f.game.activateAbility(f.me, {card: jace, ability: jace.def.abilities[0], idx: 0}), false);
  assert.equal(jace.counters.loyalty, 3);
  f.done();
});

test('granted instant-speed loyalty still pays Suppression Field before adding loyalty', async () => {
  const f = fixture(), teferi = f.put('Teferi, Master of Time'); teferi.counters.loyalty = 3;
  f.put('Suppression Field'); rivalCombat(f);
  assert.equal(f.game.activatableList(f.me, true).some(e => e.card === teferi), false,
    'a timing permission does not waive the activation tax');
  const lands = f.lands(['Island', 'Island']);
  f.selectOnce(e => e.card === teferi && e.ability.loyalty === 1);
  await f.game.priorityRound(f.me);
  assert.equal(f.selections.length, 1); assert.equal(teferi.counters.loyalty, 4);
  assert.ok(lands.every(c => c.tapped));
  f.done();
});

for (const name of ['Drannith Healer', 'Krosan Tusker']) {
  test(`Grand Abolisher permits native ${name} Cycling from hand while blocking battlefield abilities`, async () => {
    const f = fixture(), card = f.put(name, 'hand'), ring = f.put('Sol Ring');
    const ab = f.put('Grand Abolisher', 'battlefield', f.rival);
    const sage = f.put('Somberwald Sage');
    const lands = f.lands(['Forest', 'Island', 'Island']);
    rivalCombat(f);
    assert.equal(f.game.manaSources(f.me, null).some(s => s.card === ring || s.card === sage), false,
      'the prohibition still covers artifact and creature mana abilities on the battlefield');
    const before = f.me.library.length;
    f.selectOnce(e => e.card === card && e.cycling);
    await f.game.priorityRound(f.me);
    assert.equal(f.selections.length, 1, 'the card in hand is not a creature permanent under CR 109.2');
    assert.equal(card.zone, 'graveyard');
    assert.ok(f.me.library.length < before, 'the native Cycling draw and any search trigger resolved');
    assert.ok(lands.some(c => c.tapped));
    assert.equal(ring.tapped, false); assert.equal(sage.tapped, false);
    assert.equal(ab.zone, 'battlefield');
    f.done();
  });
}

test('Cosmos Charger grants creature Foretell through Grand Abolisher because it is a special action', async () => {
  const f = fixture(), charger = f.put('Cosmos Charger', 'hand');
  f.put('Cosmos Charger'); f.put('Grand Abolisher', 'battlefield', f.rival);
  const land = f.put('Island'); rivalCombat(f);
  f.selectOnce(e => e.card === charger && e.foretell);
  await f.game.priorityRound(f.me);
  assert.equal(f.selections.length, 1);
  assert.equal(charger.zone, 'exile'); assert.equal(charger.faceDown, true);
  assert.equal(charger.meta.foretold, true); assert.equal(land.tapped, true);
  assert.equal(f.me.turnState.spellsCast || 0, 0, 'Foretell does not cast the card');
  f.done();
});

test('Grand Abolisher still prohibits opposing instant casts on its controller turn', async () => {
  const f = fixture(), brainstorm = f.put('Brainstorm', 'hand'), land = f.put('Island');
  f.put('Grand Abolisher', 'battlefield', f.rival); rivalCombat(f);
  assert.equal(f.game.castableList(f.me).some(e => e.card === brainstorm), false);
  assert.equal(await f.game.castSpell(f.me, brainstorm, {from: 'hand'}), false);
  assert.equal(brainstorm.zone, 'hand'); assert.equal(land.tapped, false);
  f.done();
});

async function faceDownCast(f, name, kind = 'morph') {
  const c = f.put(name, 'hand');
  f.lands(['Island', 'Island', 'Island']);
  const offered = f.game.castableList(f.me).find(e => e.card === c && e.alt?.faceDownCast === kind);
  assert.ok(offered, 'the native face-down alternative is affordable');
  assert.equal(await f.game.castSpell(f.me, c, {from: offered.from, alt: offered.alt}), true);
  await f.game.priorityRound(f.me);
  assert.equal(c.zone, 'battlefield'); assert.equal(c.faceDown, true);
  assert.equal(c.is('Creature'), true, 'a face-down permanent has creature characteristics');
  assert.equal(c.is('Land'), false, 'the printed land type is hidden');
  assert.equal(c.power, 2); assert.equal(c.toughness, 2);
  assert.deepEqual(Array.from(c.colors), [], 'the face-down permanent is colorless');
  assert.equal(c.def.rulesNoName, true, 'its hidden printed name is not a characteristic');
  assert.equal(f.game.manaSources(f.me, null).some(s => s.card === c), false,
    'the face-down creature must not have its printed mana ability');
  return c;
}

test('Willbender turns face up under split second and its native trigger redirects Krosan Grip', async () => {
  const f = fixture(), willbender = await faceDownCast(f, 'Willbender');
  const faceUpLands = f.lands(['Island', 'Island']);
  const protectedRing = f.put('Sol Ring'), otherRing = f.put('Sol Ring', 'battlefield', f.rival);
  const grip = f.put('Krosan Grip', 'hand', f.rival);
  f.lands(['Forest', 'Island', 'Island'], f.rival);
  rivalCombat(f);
  let originalSpell;
  f.choose = (p, q) => {
    if (p !== f.me || q.type !== 'chooseTargets') return undefined;
    const spell = q.candidates.find(o => o.card === grip);
    if (spell) {originalSpell = spell; return [spell];}
    if (q.candidates.includes(otherRing)) return [otherRing];
  };
  f.selectOnce(e => e.card === willbender && e.turnFaceUp);
  assert.equal(await f.game.castSpell(f.rival, grip, {from: 'hand', quickTargets: [protectedRing]}), true);
  assert.equal(f.selections.length, 1);
  assert.equal(willbender.faceDown, false);
  assert.ok(faceUpLands.every(c => c.tapped));
  assert.ok(f.trace.some(q => q.player === f.me && q.splitSecond && q.acts.some(e => e.card === willbender && e.turnFaceUp)));
  assert.ok(f.trace.some(q => q.stack.some(o => o.kind === 'trigger' && o.srcCard === willbender)),
    'split second still permits the triggered ability on the actual Stack');
  assert.equal(protectedRing.zone, 'battlefield'); assert.equal(otherRing.zone, 'graveyard');
  assert.equal(grip.zone, 'graveyard'); assert.equal(originalSpell.ctrl, f.rival);
  f.done();
});

test('split second permits stackless Zoetic Cavern Morph, causing Sudden Shock to lose its only target', async () => {
  const f = fixture(), cavern = await faceDownCast(f, 'Zoetic Cavern');
  f.put('Suppression Field');
  const lands = f.lands(['Island', 'Island']);
  const shock = f.put('Sudden Shock', 'hand', f.rival);
  f.lands(['Mountain', 'Forest'], f.rival); rivalCombat(f);
  const casts = f.me.turnState.spellsCast;
  f.selectOnce(e => e.card === cavern && e.turnFaceUp);
  assert.equal(await f.game.castSpell(f.rival, shock, {from: 'hand', quickTargets: [cavern]}), true);
  assert.equal(f.selections.length, 1); assert.equal(cavern.faceDown, false);
  assert.equal(cavern.is('Land'), true); assert.equal(cavern.zone, 'battlefield');
  assert.equal(cavern.damage, 0);
  assert.ok(lands.every(c => c.tapped), 'Morph paid only its printed two mana, without activation tax');
  assert.equal(f.me.turnState.spellsCast, casts, 'turning face up did not cast a spell');
  assert.equal(f.trace.some(q => q.stack.some(o => o.kind === 'ability' && o.srcCard === cavern)), false);
  assert.equal(shock.zone, 'graveyard');
  f.done();
});

test('split second permits Foretell and automatic mana abilities without adding Suppression Field tax', async () => {
  const f = fixture(), voyage = f.put('Haunting Voyage', 'hand'), ring = f.put('Sol Ring');
  f.put('Suppression Field');
  const shock = f.put('Sudden Shock', 'hand', f.rival);
  f.lands(['Mountain', 'Island'], f.rival);
  f.game.phase = 'combat'; f.game.step = 'blockers';
  const life = f.me.life;
  f.selectOnce(e => e.card === voyage && e.foretell);
  assert.equal(await f.game.castSpell(f.rival, shock, {from: 'hand', quickTargets: [f.me]}), true);
  assert.equal(f.selections.length, 1); assert.equal(voyage.zone, 'exile');
  assert.equal(voyage.faceDown, true); assert.equal(ring.tapped, true);
  assert.equal(f.me.life, life - 2, 'the original split-second spell resolved after the special action');
  assert.equal(f.trace.some(q => q.stack.some(o => o.kind === 'ability' && o.srcCard === voyage)), false);
  f.done();
});

test('split second blocks Counterspell, Cycling and target-based Deathrite mana production', async () => {
  const f = fixture(), counter = f.put('Counterspell', 'hand'), cycling = f.put('Drannith Healer', 'hand');
  const shaman = f.put('Deathrite Shaman'); f.put('Forest', 'graveyard');
  f.lands(['Island', 'Island', 'Forest']);
  const shock = f.put('Sudden Shock', 'hand', f.rival); f.lands(['Mountain', 'Island'], f.rival);
  rivalCombat(f);
  let checked = false;
  f.onPriority = async (p, q) => {
    if (p !== f.me || !f.game.hasSplitSecond() || checked) return;
    checked = true;
    assert.equal(q.casts.some(e => e.card === counter), false);
    assert.equal(q.acts.some(e => e.card === cycling || e.card === shaman), false);
    assert.equal(await f.game.castSpell(f.me, counter, {from: 'hand'}), false);
    assert.equal(await f.game.activateAbility(f.me, {card: cycling, cycling: true}), false);
    assert.equal(await f.game.activateAbility(f.me, {card: shaman, ability: shaman.def.abilities[0], idx: 0}), false,
      'an ability with a target is not a mana ability under CR 605.1a');
  };
  assert.equal(await f.game.castSpell(f.rival, shock, {from: 'hand', quickTargets: [f.me]}), true);
  assert.equal(checked, true, 'the controls were checked during the native split-second window');
  assert.equal(cycling.zone, 'hand'); assert.equal(shaman.tapped, false);
  await f.game.priorityRound(f.me); f.done();
});

test('Rattleclaw Mystic face-up mana is a respondable trigger rather than an activated mana ability', async () => {
  const f = fixture(), mystic = await faceDownCast(f, 'Rattleclaw Mystic');
  const lands = f.lands(['Island', 'Island']);
  f.selectOnce(e => e.card === mystic && e.turnFaceUp);
  await f.game.priorityRound(f.me);
  assert.equal(f.selections.length, 1); assert.equal(mystic.faceDown, false);
  assert.ok(lands.every(c => c.tapped));
  assert.ok(f.trace.some(q => q.stack.some(o => o.kind === 'trigger' && o.srcCard === mystic)),
    'a trigger caused by turning face up does not meet CR 605.1b');
  assert.deepEqual(['G', 'U', 'R'].map(color => f.me.pool[color]), [1, 1, 1]);
  f.done();
});

test('native Branch of Vitu-Ghazi Disguise retains hidden 2/2 ward characteristics until paid face-up action', async () => {
  const f = fixture(), branch = await faceDownCast(f, 'Branch of Vitu-Ghazi', 'disguise');
  assert.equal(branch.cur.wardCost?.mana, '{2}');
  const lands = f.lands(['Island', 'Island', 'Island']);
  f.put('Suppression Field'); rivalCombat(f);
  f.selectOnce(e => e.card === branch && e.turnFaceUp && e.faceUpKind === 'disguise');
  await f.game.priorityRound(f.me);
  assert.equal(f.selections.length, 1); assert.equal(branch.faceDown, false);
  assert.equal(branch.is('Land'), true); assert.equal(branch.cur.wardCost, null);
  assert.ok(lands.every(c => c.tapped), 'a special action pays the printed three mana without activation tax');
  f.done();
});

test('Cryptic Coat native cloak creates a hidden ward creature and printed creature-mana face-up action', async () => {
  const f = fixture(), bear = f.put('Grizzly Bears', 'library'), coat = f.put('Cryptic Coat', 'hand');
  f.lands(['Island', 'Island', 'Island']);
  assert.equal(await f.game.castSpell(f.me, coat, {from: 'hand'}), true);
  assert.equal(bear.zone, 'battlefield'); assert.equal(bear.faceDown, true);
  assert.equal(bear.meta.faceDownKind, 'cloak'); assert.equal(coat.attachedTo, bear.iid);
  assert.equal(bear.cur.wardCost?.mana, '{2}'); assert.equal(bear.power, 3);
  const lands = f.lands(['Forest', 'Island']);
  f.put('Suppression Field'); rivalCombat(f);
  f.selectOnce(e => e.card === bear && e.turnFaceUp && e.faceUpKind === 'mana cost');
  await f.game.priorityRound(f.me);
  assert.equal(f.selections.length, 1); assert.equal(bear.faceDown, false);
  assert.equal(bear.name, 'Grizzly Bears'); assert.equal(bear.cur.wardCost, null);
  assert.equal(coat.attachedTo, bear.iid); assert.ok(lands.every(c => c.tapped));
  f.done();
});

test('manifest permits printed creature mana under Humility while intrinsic Morph is unavailable', async () => {
  const f = fixture(), willbender = f.put('Willbender', 'hand');
  await f.game.manifestCard(f.me, willbender);
  f.put('Humility');
  const lands = f.lands(['Island', 'Island']); rivalCombat(f);
  const costs = Array.from(f.game.faceUpCosts(willbender), e => e.kind);
  assert.deepEqual(costs, ['mana cost'], 'Manifest supplies its own action even after all printed abilities are lost');
  f.selectOnce(e => e.card === willbender && e.turnFaceUp);
  await f.game.priorityRound(f.me);
  assert.equal(f.selections.length, 1); assert.equal(willbender.faceDown, false);
  assert.equal(willbender.power, 1); assert.equal(willbender.toughness, 1);
  assert.ok(lands.every(c => c.tapped));
  f.done();
});

test('manifested sorcery and a creature without a mana cost have no mana face-up action', async () => {
  const f = fixture(), sorcery = f.put('Haunting Voyage', 'hand'), arbor = f.put('Dryad Arbor', 'hand');
  await f.game.manifestCard(f.me, sorcery); await f.game.manifestCard(f.me, arbor);
  f.lands(['Island', 'Island', 'Forest']); rivalCombat(f);
  await f.game.askPriorityAction(f.me);
  assert.equal(f.trace.at(-1).acts.some(e => [sorcery, arbor].includes(e.card) && e.turnFaceUp), false);
  assert.equal(await f.game.turnFaceUp(f.me, sorcery), false);
  assert.equal(await f.game.turnFaceUp(f.me, arbor), false);
  assert.equal(sorcery.faceDown, true); assert.equal(arbor.faceDown, true);
  f.done();
});
