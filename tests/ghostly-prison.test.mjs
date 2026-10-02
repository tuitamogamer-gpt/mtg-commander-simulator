import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();

function setup(role = 'human', opponents = 1) {
  const choice = { attackers: [] }, journal = { attackers: [], payments: [], taps: [], reviews: [] };
  const human = { async decide(game, q) {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'attackers') return choice.attackers;
    if (q.type === 'blockers') return [];
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    return null;
  } };
  const game = new M.Game({ seed: 155, paced: false });
  const a = game.addPlayer('Attacker', { name: 'A' }, human, role === 'ai');
  const others = Array.from({ length: opponents }, (_, i) => game.addPlayer('Defender ' + i, { name: 'B' + i }, human, false));
  if (role === 'ai') a.controller = new M.AIController(a, { difficulty: 'hard', style: 'balanced' });
  game.turnNo = 5; game.turnPlayer = a; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {}; game.spotlight = async () => {}; game.pace = async () => {};
  game.reviewCombatWithHuman = async review => { journal.reviews.push(review); };
  const emit = game.emit.bind(game), pay = game.payMana.bind(game), tap = game.tap.bind(game);
  game.emit = async (event, data) => {
    if (event === 'attackersDeclared') journal.attackers.push(...data.attackers.map(card => ({ card, target: card.attacking })));
    return emit(event, data);
  };
  game.payMana = async (player, cost, spell, opts) => {
    const before = { ...player.pool }, result = await pay(player, cost, spell, opts);
    journal.payments.push({ player, cost, result, before, after: { ...player.pool }, reserved: opts?.excludeCards?.slice() || [] });
    return result;
  };
  game.tap = (card, opts) => { journal.taps.push({ card, attackerDeclaration: !!opts?.attackerDeclaration }); return tap(card, opts); };
  const put = (definition, player = a) => {
    const card = new M.CardInst(typeof definition === 'string' ? M.DEFS[definition] : definition, player);
    card.ctrl = player; card.zone = 'battlefield'; card.sick = false;
    game.battlefield.push(card); game.recalc(); return card;
  };
  const body = (name = 'Tax witness') => put({ name, cost: '{1}', types: ['Creature'], subtypes: ['Bear'], super: [], power: '6', toughness: '20', kws: [], oracle: '', colorsOverride: [] });
  return { game, a, b: others[0], others, choice, journal, put, body };
}

function assertPayments(f, amounts, sources = ['Ghostly Prison']) {
  assert.deepEqual(f.journal.payments.map(row => row.cost.generic), amounts);
  assert.ok(f.journal.payments.every(row => row.result && row.player === f.a));
  const receipts = f.journal.reviews.flatMap(review => review.attackTaxPayments || []);
  assert.deepEqual(receipts.map(row => ({ generic: row.cost.generic, x: row.cost.x, pips: Array.from(row.cost.pips) })), amounts.map(generic => ({ generic, x: 0, pips: [] })));
  assert.ok(receipts.every(row => Array.from(row.sources).join('|') === sources.join('|')));
  assert.ok(receipts.every(row => f.journal.attackers.some(declared => declared.card === row.card && declared.target === row.target)));
  assert.equal((f.game.aiDecisionLog || []).some(row => row.fallback), false);
}

for (const role of ['human', 'ai']) {
  test(role + ': Ghostly Prison rejects an unpaid attack without tapping its creature', async () => {
    const f = setup(role), card = f.body(); f.put('Ghostly Prison', f.b);
    f.choice.attackers = [{ card, target: f.b }];
    await f.game.combatPhase(f.a);
    assert.equal(f.journal.attackers.length, 0); assert.equal(f.journal.taps.length, 0);
    assert.equal(f.b.life, 40); assertPayments(f, []);
  });

  for (const [mana, count] of [[2, 1], [4, 2]]) {
    test(role + ': Ghostly Prison charges two mana for each of ' + count + ' declared attackers', async () => {
      const f = setup(role), cards = [f.body('First attacker'), f.body('Second attacker')];
      f.put('Ghostly Prison', f.b); f.a.pool.C = mana;
      f.choice.attackers = cards.map(card => ({ card, target: f.b }));
      await f.game.combatPhase(f.a);
      assert.equal(f.journal.attackers.length, count); assertPayments(f, Array(count).fill(2));
      assert.equal(f.journal.payments.reduce((sum, row) => sum + row.before.C - row.after.C, 0), mana);
      assert.equal(f.b.life, 40 - 6 * count);
      assert.equal(cards.filter(card => card.tapped).length, count);
    });
  }
}

for (const [mana, count] of [[3, 0], [4, 1]]) {
  test('Ghostly Prison and Windborn Muse together require four mana per attacker (' + mana + ' available)', async () => {
    const f = setup(), card = f.body(); f.put('Ghostly Prison', f.b); f.put('Windborn Muse', f.b);
    f.a.pool.C = mana; f.choice.attackers = [{ card, target: f.b }];
    await f.game.combatPhase(f.a);
    assert.equal(f.journal.attackers.length, count); assertPayments(f, count ? [4] : [], ['Ghostly Prison', 'Windborn Muse']);
    assert.equal(card.tapped, !!count);
  });
}

test('colored floating mana pays the generic Ghostly Prison tax', async () => {
  const f = setup(), card = f.body(); f.put('Ghostly Prison', f.b);
  f.a.pool.W = 1; f.a.pool.G = 1; f.choice.attackers = [{ card, target: f.b }];
  await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 1); assertPayments(f, [2]);
  assert.equal(f.journal.payments[0].before.W + f.journal.payments[0].before.G, 2);
  assert.equal(f.journal.payments[0].after.W + f.journal.payments[0].after.G, 0);
});

test('Ghostly Prison taps available lands to pay its attack tax', async () => {
  const f = setup(), card = f.body(), lands = [f.put('Forest'), f.put('Forest')]; f.put('Ghostly Prison', f.b);
  f.choice.attackers = [{ card, target: f.b }]; await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 1); assertPayments(f, [2]);
  assert.ok(lands.every(land => land.tapped));
  assert.equal(f.journal.taps.filter(row => !row.attackerDeclaration && lands.includes(row.card)).length, 2);
});

test('a declared nonvigilant mana creature cannot pay its own Ghostly Prison tax', async () => {
  const f = setup(), card = f.put('Llanowar Elves'), land = f.put('Forest'); f.put('Ghostly Prison', f.b);
  f.choice.attackers = [{ card, target: f.b }]; await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 0); assertPayments(f, []);
  assert.equal(card.tapped, false); assert.equal(land.tapped, false);
});

test('a mana creature kept out of combat can pay another creature’s Ghostly Prison tax', async () => {
  const f = setup(), card = f.body(), elf = f.put('Llanowar Elves'), land = f.put('Forest'); f.put('Ghostly Prison', f.b);
  f.choice.attackers = [{ card, target: f.b }]; await f.game.combatPhase(f.a);
  assert.deepEqual(f.journal.attackers.map(row => row.card), [card]); assertPayments(f, [2]);
  assert.ok(elf.tapped && land.tapped); assert.ok(f.journal.payments[0].reserved.includes(card));
  assert.equal(f.journal.payments[0].reserved.includes(elf), false);
});

test('Ghostly Prison protects only its controller, and tapping it does not switch off the tax', async () => {
  const f = setup('human', 2), card = f.body(), prison = f.put('Ghostly Prison', f.b); prison.tapped = true;
  f.choice.attackers = [{ card, target: f.others[1] }]; await f.game.combatPhase(f.a);
  assert.deepEqual(f.journal.attackers.map(row => row.target), [f.others[1]]); assertPayments(f, []);
  assert.equal(f.b.life, 40); assert.equal(f.others[1].life, 34);
  card.tapped = false; f.journal.attackers.length = 0; f.journal.taps.length = 0;
  f.choice.attackers = [{ card, target: f.b }]; await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 0); assert.equal(card.tapped, false); assertPayments(f, []);
});

test('Ghostly Prison does not charge for attacking its controller’s planeswalker', async () => {
  const f = setup(), card = f.body(); f.put('Ghostly Prison', f.b);
  const walker = f.put({ name: 'Planeswalker witness', cost: '{1}', types: ['Planeswalker'], subtypes: [], super: [], loyalty: 10, kws: [], oracle: '', colorsOverride: [] }, f.b);
  walker.counters.loyalty = 10; f.game.recalc();
  f.choice.attackers = [{ card, target: walker }]; await f.game.combatPhase(f.a);
  assert.deepEqual(f.journal.attackers.map(row => row.target), [walker]); assertPayments(f, []);
  assert.equal(f.b.life, 40); assert.equal(walker.counters.loyalty, 4);
});

test('Ghostly Prison stops taxing after leaving the battlefield', async () => {
  const f = setup(), card = f.body(), prison = f.put('Ghostly Prison', f.b);
  await f.game.move(prison, 'graveyard'); f.choice.attackers = [{ card, target: f.b }];
  await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 1); assertPayments(f, []); assert.equal(f.b.life, 34);
});

test('a Windborn Muse with its abilities removed no longer adds to Ghostly Prison’s tax', async () => {
  const f = setup(), card = f.body(), muse = f.put('Windborn Muse', f.b); f.put('Ghostly Prison', f.b);
  const lignify = f.put('Lignify'); await f.game.attach(lignify, muse); f.game.recalc();
  assert.equal(muse.cur.abilitiesDisabled, true);
  f.a.pool.C = 2; f.choice.attackers = [{ card, target: f.b }]; await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 1); assertPayments(f, [2]);
});

test('goad does not force a declined attack through Ghostly Prison even when mana is available', async () => {
  const f = setup(), card = f.body(); f.put('Ghostly Prison', f.b); M.E.goad(f.game, card, f.b); f.game.recalc();
  f.a.pool.C = 2; f.choice.attackers = [];
  assert.equal(f.game.isGoaded(card), true); assert.equal(f.game.isForcedToAttack(card), false);
  await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 0); assert.equal(card.tapped, false); assert.equal(f.a.pool.C, 2);
  assertPayments(f, []);
});

test('a player can voluntarily pay Ghostly Prison’s tax to attack with a goaded creature', async () => {
  const f = setup(), card = f.body(); f.put('Ghostly Prison', f.b); M.E.goad(f.game, card, f.b); f.game.recalc();
  f.a.pool.C = 2; f.choice.attackers = [{ card, target: f.b }]; await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 1); assertPayments(f, [2]); assert.equal(f.b.life, 34);
});

test('an omitted goaded attacker uses a legal free opponent instead of automatically paying Ghostly Prison', async () => {
  const f = setup('human', 3), card = f.body(), taxed = f.others[1], free = f.others[2];
  f.put('Ghostly Prison', taxed); M.E.goad(f.game, card, f.b); f.game.recalc();
  f.game.rnd = () => 0; f.a.pool.C = 2; f.choice.attackers = [];
  assert.equal(f.game.isForcedToAttack(card), true); await f.game.combatPhase(f.a);
  assert.deepEqual(f.journal.attackers.map(row => row.target), [free]); assertPayments(f, []);
  assert.equal(taxed.life, 40); assert.equal(free.life, 34); assert.equal(f.a.pool.C, 2);
});

test('an unaffordable declared goaded attack redirects to a free required opponent', async () => {
  const f = setup('human', 3), card = f.body(), taxed = f.others[1], free = f.others[2];
  f.put('Ghostly Prison', taxed); M.E.goad(f.game, card, f.b); f.game.recalc();
  f.choice.attackers = [{ card, target: taxed }];
  assert.equal(f.game.isForcedToAttack(card), true); await f.game.combatPhase(f.a);
  assert.deepEqual(f.journal.attackers.map(row => row.target), [free]); assertPayments(f, []);
  assert.equal(taxed.life, 40); assert.equal(free.life, 34); assert.equal(card.tapped, true);
});

test('an attacks-each-combat requirement does not automatically pay Ghostly Prison', async () => {
  const f = setup(), card = f.body(); card.meta.mustAttackTurn = f.game.turnNo; f.put('Ghostly Prison', f.b);
  f.a.pool.C = 2; f.choice.attackers = []; await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 0); assert.equal(card.tapped, false); assert.equal(f.a.pool.C, 2);
  assertPayments(f, []);
});

test('a goaded creature may attack its goader for free when the other opponent requires Ghostly Prison payment', async () => {
  const f = setup('human', 2), card = f.body(), taxed = f.others[1];
  f.put('Ghostly Prison', taxed); M.E.goad(f.game, card, f.b); f.game.recalc();
  f.a.pool.C = 2; f.choice.attackers = [{ card, target: f.b }];
  assert.ok(f.game.legalDeclarationAttackTargets(card).includes(f.b));
  await f.game.combatPhase(f.a);
  assert.deepEqual(f.journal.attackers.map(row => row.target), [f.b]); assertPayments(f, []);
  assert.equal(f.b.life, 34); assert.equal(taxed.life, 40); assert.equal(f.a.pool.C, 2);
});

test('multiple goaders permit either tied free player instead of forcing a tax to satisfy both goads', async () => {
  const f = setup('human', 3), card = f.body(), secondGoader = f.others[1], taxed = f.others[2];
  f.put('Ghostly Prison', taxed); M.E.goad(f.game, card, f.b); M.E.goad(f.game, card, secondGoader); f.game.recalc();
  f.a.pool.C = 2; f.choice.attackers = []; f.game.rnd = () => 0;
  const legal = f.game.legalDeclarationAttackTargets(card);
  assert.ok(legal.includes(f.b)); assert.ok(legal.includes(secondGoader));
  await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 1);
  assert.ok([f.b, secondGoader].includes(f.journal.attackers[0].target)); assertPayments(f, []);
  assert.equal(taxed.life, 40); assert.equal(f.a.pool.C, 2);
});

function encoreRequirement(f, card, target) {
  f.game.untilEffects.push({ kind: 'oracleEncoreAttack', iid: card.iid, version: card.zoneVersion,
    timestamp: card.timestamp, turn: f.game.turnNo, targetPlayer: target, expires: 'eot' });
}

function gideonRequirement(f, walker) {
  walker.counters.loyalty = 10;
  f.game.untilEffects.push({ kind: 'starterGideonRequirement', player: f.a,
    nextTurn: f.a.turnsStarted, iid: walker.iid, version: walker.zoneVersion });
}

test('Encore and goad retain a required free attack on the goader when the assigned opponent has Ghostly Prison', async () => {
  const f = setup('human', 2), card = f.body(), assigned = f.others[1]; f.put('Ghostly Prison', assigned);
  encoreRequirement(f, card, assigned); M.E.goad(f.game, card, f.b); f.game.recalc(); f.a.pool.C = 2;
  assert.ok(f.game.legalDeclarationAttackTargets(card).includes(f.b));
  assert.equal(f.game.isForcedToAttack(card), true); await f.game.combatPhase(f.a);
  assert.deepEqual(f.journal.attackers.map(row => row.target), [f.b]); assertPayments(f, []);
  assert.equal(f.b.life, 34); assert.equal(assigned.life, 40); assert.equal(f.a.pool.C, 2);
});

test('Gideon, Encore and goad preserve a free required planeswalker attack after declining Ghostly Prison', async () => {
  const f = setup('human', 2), card = f.body(), walker = f.put('Gideon Jura', f.b); f.put('Ghostly Prison', f.b);
  gideonRequirement(f, walker); encoreRequirement(f, card, f.b); M.E.goad(f.game, card, f.others[1]); f.game.recalc(); f.a.pool.C = 2;
  const legal = f.game.legalDeclarationAttackTargets(card);
  assert.ok(legal.includes(walker)); assert.ok(legal.includes(f.b)); assert.equal(legal.includes(f.others[1]), false);
  assert.equal(f.game.isForcedToAttack(card), true); await f.game.combatPhase(f.a);
  assert.deepEqual(f.journal.attackers.map(row => row.target.iid), [walker.iid]); assertPayments(f, []);
  assert.equal(f.b.life, 40); assert.equal(f.a.pool.C, 2);
});

test('an Encore requirement can decline an assigned Ghostly Prison attack even with enough mana', async () => {
  const f = setup(), card = f.body(); f.put('Ghostly Prison', f.b); encoreRequirement(f, card, f.b); f.a.pool.C = 2;
  assert.equal(f.game.isForcedToAttack(card), false); await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 0); assertPayments(f, []);
  assert.equal(card.tapped, false); assert.equal(f.a.pool.C, 2); assert.equal(f.b.life, 40);
});

test('Gideon does not force payment when Norn’s Annex taxes every destination', async () => {
  const f = setup(), card = f.body(), walker = f.put('Gideon Jura', f.b); f.put("Norn's Annex", f.b);
  gideonRequirement(f, walker); f.a.pool.W = 1;
  assert.equal(f.game.isForcedToAttack(card), false); await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 0); assertPayments(f, []);
  assert.equal(card.tapped, false); assert.equal(f.a.pool.W, 1); assert.equal(f.a.life, 40);
});

test('declining a taxed Gideon requirement does not force an unrelated free attack', async () => {
  const f = setup('human', 2), card = f.body(), walker = f.put('Gideon Jura', f.b); f.put("Norn's Annex", f.b);
  gideonRequirement(f, walker); f.a.pool.W = 1;
  assert.ok(f.game.legalDeclarationAttackTargets(card).includes(f.others[1]));
  assert.equal(f.game.isForcedToAttack(card), false); await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 0); assertPayments(f, []);
  assert.equal(f.others[1].life, 40); assert.equal(f.a.pool.W, 1);
});

test('declining an Encore attack taxed by Norn’s Annex does not force an unrelated free attack', async () => {
  const f = setup('human', 2), card = f.body(); f.put("Norn's Annex", f.b); encoreRequirement(f, card, f.b); f.a.pool.W = 1;
  assert.ok(f.game.legalDeclarationAttackTargets(card).includes(f.others[1]));
  assert.equal(f.game.isForcedToAttack(card), false); await f.game.combatPhase(f.a);
  assert.equal(f.journal.attackers.length, 0); assertPayments(f, []);
  assert.equal(f.others[1].life, 40); assert.equal(f.a.pool.W, 1);
});
