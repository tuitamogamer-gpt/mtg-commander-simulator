import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table() {
  const g = new M.Game({ seed: 101026714, paced: false, maxTurns: 30 });
  const f = { g, questions: [] };
  f.a = g.addPlayer('Caster', { name: 'Extended native zones' }, null, false);
  f.b = g.addPlayer('Rival', { name: 'Extended native zones' }, null, false);
  for (const p of [f.a, f.b]) p.controller = { decide: async (_game, q) => {
    f.questions.push({ p, q });
    if (q.type === 'priority') return f.priority?.(p, q) || { kind: 'pass' };
    if (q.type === 'main') return { kind: 'done' };
    if (q.type === 'chooseTargets') return f.targets?.(p, q) || (q.quickTarget ? [q.quickTarget] : q.candidates.slice(0, q.min || 0));
    if (q.type === 'chooseCards') return f.cards?.(p, q) || q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return f.option?.(p, q) ?? q.options.find(o => o.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseManaSources') return { cards: q.suggested };
    if (q.type === 'chooseX') return f.x?.(p, q) ?? q.min ?? 0;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return { top: q.cards, bottom: [] };
    if (q.type === 'cardReveal') return null;
    if (q.type === 'attackers') return f.attackers?.(p, q) || [];
    if (q.type === 'blockers') return f.blockers?.(p, q) || [];
    if (q.type === 'combatReview') return [];
    throw new Error('Unhandled native zone decision: ' + q.type);
  } };
  g.turnPlayer = f.a; g.turnNo = 8; g.phase = 'main1'; g.step = 'main';
  f.put = (name, zone = 'battlefield', owner = f.a) => {
    assert.ok(M.DEFS[name], 'registered definition: ' + name);
    const c = new M.CardInst(M.DEFS[name], owner);
    c.zone = zone; c.sick = false;
    if (zone === 'battlefield') g.battlefield.push(c); else owner[zone].push(c);
    g.recalc(); return c;
  };
  f.lands = (names, p = f.a) => names.map(n => f.put(n, 'battlefield', p));
  f.cast = async (name, targets = [], p = f.a, alt = {}) => {
    const c = f.put(name, 'hand', p);
    assert.ok(g.castableList(p).some(row => row.card === c), 'native cast offered: ' + name);
    assert.equal(await g.castSpell(p, c, { from: 'hand', quickTargets: targets, alt }), true, 'paid native cast: ' + name);
    assert.equal(g.stack.length, 0, 'native priority resolves all spells and triggers');
    assertGameStateInvariants(g);
    return c;
  };
  for (const p of [f.a, f.b]) for (let i = 0; i < 36; i++) f.put('Forest', 'library', p);
  return f;
}

for (const blink of [false, true]) test(`Grothama keeps this object's damage record when ${blink ? 'Cloudshift immediately returns it' : 'Swords exiles it'}`, async () => {
  const f = table();
  f.lands(['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Mountain', 'Plains']);
  const gro = await f.cast('Grothama, All-Devouring');
  const oldVersion = gro.zoneVersion;
  await f.cast('Lightning Bolt', [gro]);
  assert.equal(gro.damage, 3);
  assert.equal(gro.meta._damageByCtrl.by[f.a.idx], 3);
  const before = f.a.hand.length;
  await f.cast(blink ? 'Cloudshift' : 'Swords to Plowshares', [gro]);
  assert.equal(f.a.hand.length, before + 3, 'departing Grothama draws for the old battlefield incarnation');
  assert.equal(gro.zone, blink ? 'battlefield' : 'exile');
  if (blink) {
    assert.equal(gro.zoneVersion, oldVersion + 2);
    assert.equal(gro.damage, 0);
    assert.equal(gro.meta._damageByCtrl, undefined, 'new battlefield object starts a fresh damage history');
  }
});

for (const leave of ['stay', 'die', 'blink']) test(`Palace Jailer: all exact prisoners return when an opponent becomes monarch after source ${leave}`, async () => {
  const f = table();
  f.lands(['Plains', 'Plains', 'Plains', 'Forest', 'Plains']);
  f.lands(Array(7).fill('Swamp'), f.b);
  const first = f.put('Grizzly Bears', 'battlefield', f.b);
  f.targets = (_p, q) => q.candidates.includes(first) ? [first] : undefined;
  const jailer = await f.cast('Palace Jailer');
  assert.equal(f.g.monarch, f.a);
  assert.equal(first.zone, 'exile');
  let second;
  if (leave === 'die') await f.cast('Murder', [jailer], f.b);
  if (leave === 'blink') {
    second = f.put('Grizzly Bears', 'battlefield', f.b);
    f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(second) ? [second] : undefined;
    await f.cast('Cloudshift', [jailer]);
    assert.equal(second.zone, 'exile');
  }
  f.g.turnPlayer = f.b;
  await f.cast('Thorn of the Black Rose', [], f.b);
  assert.equal(f.g.monarch, f.b);
  assert.equal(first.zone, 'battlefield', 'the duration does not depend on the Jailer remaining on the battlefield');
  assert.equal(first.ctrl, f.b);
  if (second) assert.equal(second.zone, 'battlefield', 'prisoners from both Jailer incarnations return');
});

test('Palace Jailer: a card leaving and reentering exile is no longer the imprisoned object', async () => {
  const f = table();
  f.lands(['Plains', 'Plains', 'Plains', 'Forest', 'Plains', 'Forest', 'Forest', 'Forest']);
  f.lands(Array(4).fill('Swamp'), f.b);
  const first = f.put('Grizzly Bears', 'battlefield', f.b);
  f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(first) ? [first] : undefined;
  await f.cast('Palace Jailer');
  const exileVersion = first.zoneVersion;
  await f.cast('Pull from Eternity', [first]);
  assert.equal(first.zone, 'graveyard');
  const ooze = await f.cast('Scavenging Ooze');
  const action = f.g.activatableList(f.a).find(row => row.card === ooze && row.ability);
  assert.ok(action);
  assert.equal(await f.g.activateAbility(f.a, action), true);
  await f.g.priorityRound(f.a);
  assert.equal(first.zone, 'exile');
  assert.notEqual(first.zoneVersion, exileVersion);
  f.g.turnPlayer = f.b;
  await f.cast('Thorn of the Black Rose', [], f.b);
  assert.equal(first.zone, 'exile', 'CR 400.7: the later exile is a different object');
});

test("Hazel's Brewmaster: Food abilities stop tracking a creature that left and returned to exile", async () => {
  const f = table();
  f.lands(['Swamp', 'Swamp', 'Swamp', 'Swamp', 'Plains', 'Forest', 'Forest', 'Forest']);
  const arcanis = f.put('Arcanis the Omnipotent', 'graveyard');
  f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(arcanis) ? [arcanis] : undefined;
  await f.cast("Hazel's Brewmaster");
  assert.equal(arcanis.zone, 'exile');
  const food = f.g.bf().find(c => c.isToken && c.hasSub('Food'));
  assert.ok(food);
  assert.ok(f.g.activatableList(f.a).some(row => row.card === food && /Draw three cards/.test(row.ability?.label)), 'exact exiled Arcanis grants its native draw ability');
  const version = arcanis.zoneVersion;
  await f.cast('Pull from Eternity', [arcanis]);
  const ooze = await f.cast('Scavenging Ooze');
  const action = f.g.activatableList(f.a).find(row => row.card === ooze && row.ability);
  assert.equal(await f.g.activateAbility(f.a, action), true);
  await f.g.priorityRound(f.a);
  assert.equal(arcanis.zone, 'exile');
  assert.notEqual(arcanis.zoneVersion, version);
  assert.equal(f.g.activatableList(f.a).some(row => row.card === food && /Draw three cards/.test(row.ability?.label)), false, 'the newer exile belongs to Scavenging Ooze, not the Brewmaster');
});

test('Urianger Draw Arcanum creates a new face-down exile object and records its exact identity', async () => {
  const f = table();
  f.lands(['Plains', 'Island']);
  const urianger = await f.cast('Urianger Augurelt');
  urianger.sick = false;
  const top = f.put('Grizzly Bears', 'library'), version = top.zoneVersion;
  const action = f.g.activatableList(f.a).find(row => row.card === urianger && /Draw Arcanum/.test(row.ability?.label));
  assert.ok(action);
  assert.equal(await f.g.activateAbility(f.a, action), true);
  await f.g.priorityRound(f.a);
  assert.equal(urianger.tapped, true);
  assert.equal(top.zone, 'exile');
  assert.equal(top.faceDown, true);
  assert.equal(top.zoneVersion, version + 1, 'CR 400.7: the hidden exile is a new object');
  assert.ok(top.meta.revealedTo.includes(f.a.idx));
});

for (const changed of [false, true]) test(`Currency Converter ${changed ? 'cannot convert a later exile object' : 'converts its exact discarded and exiled card'}`, async () => {
  const f = table();
  f.lands(['Forest', 'Swamp', 'Plains', 'Forest', 'Forest', 'Forest']);
  const converter = await f.cast('Currency Converter');
  const imp = await f.cast('Putrid Imp');
  imp.sick = false;
  const bear = f.put('Grizzly Bears', 'hand');
  f.cards = (_p, q) => q.from.includes(bear) ? [bear] : undefined;
  f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(bear) ? [bear] : undefined;
  const discard = f.g.activatableList(f.a).find(row => row.card === imp && row.ability);
  assert.ok(discard);
  assert.equal(await f.g.activateAbility(f.a, discard), true);
  await f.g.priorityRound(f.a);
  assert.equal(bear.zone, 'exile', 'native discard trigger exiles the actual discarded card');
  const version = bear.zoneVersion;
  if (changed) {
    await f.cast('Pull from Eternity', [bear]);
    const ooze = await f.cast('Scavenging Ooze');
    assert.equal(await f.g.activateAbility(f.a, f.g.activatableList(f.a).find(row => row.card === ooze && row.ability)), true);
    await f.g.priorityRound(f.a);
    assert.equal(bear.zone, 'exile');
    assert.notEqual(bear.zoneVersion, version);
  }
  const conversion = f.g.activatableList(f.a).find(row => row.card === converter && /Convert an exiled card/.test(row.ability?.label));
  if (changed) assert.equal(!!conversion, false, 'no card remains exiled with this Converter');
  else {
    assert.ok(conversion);
    assert.equal(await f.g.activateAbility(f.a, conversion), true);
    await f.g.priorityRound(f.a);
    assert.equal(bear.zone, 'graveyard');
    assert.ok(f.g.creatures(f.a).some(c => c.isToken && c.hasSub('Rogue')));
  }
});

test('Evercoat Ursine performs both native Hideaway choices as private new exile objects', async () => {
  const f = table();
  f.lands(Array(5).fill('Forest'));
  const before = new Map(f.a.library.map(c => [c.iid, c.zoneVersion]));
  await f.cast('Evercoat Ursine');
  assert.equal(f.a.exile.length, 2);
  for (const hidden of f.a.exile) {
    assert.equal(hidden.faceDown, true, 'Hideaway exiles face down');
    assert.equal(hidden.zoneVersion, before.get(hidden.iid) + 1, 'the hidden card is a new exile object');
    assert.ok(hidden.meta.revealedTo?.includes(f.a.idx), 'the controller can look at the hidden card');
    assert.equal(hidden.meta.revealedTo?.includes(f.b.idx), false, 'opponents do not gain permission to look');
  }
});

test('Grothama: two native blinks keep independent damage records and the original damage controllers', async () => {
  const f = table();
  f.lands(['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Mountain', 'Plains', 'Plains']);
  f.lands(['Mountain'], f.b);
  const gro = await f.cast('Grothama, All-Devouring');
  await f.cast('Lightning Bolt', [gro]);
  await f.cast('Cloudshift', [gro]);
  assert.equal(f.a.hand.length, 3);
  await f.cast('Lightning Bolt', [gro], f.b);
  await f.cast('Cloudshift', [gro]);
  assert.equal(f.a.hand.length, 3, 'new incarnation does not repeat the previous draw');
  assert.equal(f.b.hand.length, 3, 'the later draw belongs to the controller of the actual second Bolt');
  assert.equal(gro.meta._damageByCtrl, undefined);
});

test('Palace Jailer: AI graph clone preserves a departed source duration and exact prisoner identities', async () => {
  const f = table();
  f.lands(['Plains', 'Plains', 'Plains', 'Forest']);
  f.lands(Array(7).fill('Swamp'), f.b);
  const victim = f.put('Grizzly Bears', 'battlefield', f.b);
  f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(victim) ? [victim] : undefined;
  const jailer = await f.cast('Palace Jailer');
  await f.cast('Murder', [jailer], f.b);
  const clone = M.cloneGameForAISimulation(f.g, 101026715);
  assert.equal(clone.byIid(victim.iid).zone, 'exile');
  await clone.becomeMonarch(clone.players[f.b.idx]);
  assert.equal(clone.byIid(victim.iid).zone, 'battlefield');
  assert.equal(victim.zone, 'exile', 'simulated duration return does not mutate the live game');
  assert.equal(clone.oracleExileDurations.length, 0);
});

for (const name of ['Reassembling Skeleton', 'Drownyard Temple', "Multani, Yavimaya's Avatar", 'World Breaker']) for (const changed of [false, true]) test(`${name}: paid graveyard return ${changed ? 'ignores a later graveyard object' : 'returns its unchanged graveyard object'}`, async () => {
  const f = table();
  f.g.turnPlayer = f.b;
  f.lands(['Forest', 'Forest', 'Forest'], f.b);
  const ooze = await f.cast('Scavenging Ooze', [], f.b);
  f.g.turnPlayer = f.a;
  const payment = f.lands(['Forest', 'Swamp', 'Forest', 'Plains', 'Wastes']);
  const card = f.put(name, 'graveyard'), version = card.zoneVersion;
  const pull = changed ? f.put('Pull from Eternity', 'hand') : null;
  f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(card) ? [card] : undefined;
  let exiled = false, pulled = false;
  if (changed) f.priority = (p, q) => {
    if (p === f.b && !exiled && card.zone === 'graveyard') {
      const row = q.acts.find(entry => entry.card === ooze && entry.ability);
      if (row) { exiled = true; return {kind: 'activate', entry: row}; }
    }
    if (p === f.a && !pulled && card.zone === 'exile' && q.casts.some(row => row.card === pull)) {
      pulled = true; return {kind: 'cast', card: pull, from: 'hand', quickTargets: [card]};
    }
  };
  const action = f.g.activatableList(f.a).find(row => row.card === card && row.gyAbility);
  assert.ok(action);
  assert.equal(await f.g.activateAbility(f.a, action), true);
  if (changed) {
    assert.equal(exiled, true, 'opponent responds with the native paid graveyard exile');
    assert.equal(pulled, true, 'the native paid instant returns that exile to a new graveyard object');
    assert.equal(card.zone, 'graveyard', 'the older ability cannot return the new incarnation');
    assert.equal(card.zoneVersion, version + 2);
    assert.equal(pull.zone, 'graveyard');
  } else {
    assert.equal(card.zone, name === "Multani, Yavimaya's Avatar" || name === 'World Breaker' ? 'hand' : 'battlefield');
    if (card.zone === 'battlefield') assert.equal(card.tapped, true);
    assert.equal(card.zoneVersion, version + 1);
  }
  assert.ok(payment.some(c => c.tapped || c.zone === 'hand' || c.zone === 'graveyard'), 'real mana sources and required additional costs pay the original ability');
  assertGameStateInvariants(f.g);
});

for (const changed of [false, true]) test(`God-Eternal Bontu: native death ${changed ? 'ignores a later graveyard object' : 'creates a new library object third from the top'}`, async () => {
  const f = table();
  f.g.turnPlayer = f.b;
  f.lands(['Forest', 'Forest', 'Forest'], f.b);
  const ooze = await f.cast('Scavenging Ooze', [], f.b);
  f.g.turnPlayer = f.a;
  f.lands(['Swamp', 'Swamp', 'Forest', 'Plains']);
  const card = f.put('God-Eternal Bontu'), version = card.zoneVersion;
  const pull = changed ? f.put('Pull from Eternity', 'hand') : null;
  f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(card) ? [card] : undefined;
  let exiled = false, pulled = false;
  if (changed) f.priority = (p, q) => {
    if (p === f.b && !exiled && card.zone === 'graveyard') {
      const row = q.acts.find(entry => entry.card === ooze && entry.ability);
      if (row) { exiled = true; return { kind: 'activate', entry: row }; }
    }
    if (p === f.a && !pulled && card.zone === 'exile' && q.casts.some(row => row.card === pull)) {
      pulled = true; return { kind: 'cast', card: pull, from: 'hand', quickTargets: [card] };
    }
  };
  await f.cast('Murder', [card]);
  if (changed) {
    assert.equal(exiled, true); assert.equal(pulled, true);
    assert.equal(card.zone, 'graveyard', 'the old death trigger cannot move a later incarnation');
    assert.equal(card.zoneVersion, version + 3);
  } else {
    assert.equal(card.zone, 'library');
    assert.equal(f.a.library.at(-3)?.iid, card.iid);
    assert.equal(card.zoneVersion, version + 2, 'moving from graveyard to library creates a new object');
  }
  assertGameStateInvariants(f.g);
});

for (const laterExile of [false, true]) test(`Urianger: native Play Arcanum ${laterExile ? 'does not grant permission or a discount to a later exile object' : 'keeps its granted permission after a paid source blink'}`, async () => {
  const f = table();
  const payment = f.lands(['Plains', 'Plains', 'Forest', 'Forest', 'Forest', 'Forest', 'Swamp', 'Swamp', 'Swamp']);
  const urianger = f.put('Urianger Augurelt');
  const card = f.put('Grizzly Bears', 'library');
  const draw = f.g.activatableList(f.a).find(row => row.card === urianger && /Draw Arcanum/.test(row.ability?.label));
  assert.ok(draw);
  assert.equal(await f.g.activateAbility(f.a, draw), true);
  assert.equal(card.faceDown, true);
  const hiddenVersion = card.zoneVersion;
  for (const p of [f.a, f.b]) {
    const bot = M.createBotPlayerView(f.g, p.idx).players.find(row => row.id === f.a.idx).exile.find(row => row.id === card.iid);
    const remote = M.onlineGameViewFor(f.g, p).players.find(row => row.seat === f.a.idx).exile.find(row => row.token === 'c:' + card.iid);
    assert.equal(bot.known, p === f.a);
    assert.equal(remote.hidden, p !== f.a);
  }
  await f.cast('Burst of Energy', [urianger]);
  const play = f.g.activatableList(f.a).find(row => row.card === urianger && /Play Arcanum/.test(row.ability?.label));
  assert.ok(play);
  assert.equal(await f.g.activateAbility(f.a, play), true);
  if (!laterExile) {
    await f.cast('Cloudshift', [urianger]);
    assert.equal(M.OracleV24Permanents.linked(f.g, urianger, 'urianger-arcanum').length, 0, 'the returned source has no old linked Arcanum');
  }
  const offer = f.g.castableList(f.a).find(row => row.card === card && row.from === 'exile');
  assert.ok(offer, 'native exact permission offers the hidden spell');
  assert.equal(f.g.spellCost(f.a, card, { from: 'exile', ...offer.alt }).generic, 0);
  assert.equal(await f.g.castSpell(f.a, card, { from: offer.from, alt: offer.alt }), true);
  assert.equal(card.zone, 'battlefield'); assert.equal(card.faceDown, false);
  assert.equal(f.a.life, 42, 'native exile cast gains two life');
  if (laterExile) {
    f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(card) ? [card] : undefined;
    await f.cast('Murder', [card]);
    const ooze = await f.cast('Scavenging Ooze');
    const action = f.g.activatableList(f.a).find(row => row.card === ooze && row.ability);
    assert.ok(action); assert.equal(await f.g.activateAbility(f.a, action), true);
    assert.equal(card.zone, 'exile'); assert.notEqual(card.zoneVersion, hiddenVersion);
    assert.equal(f.g.castableList(f.a).some(row => row.card === card), false);
    assert.equal(f.g.spellCost(f.a, card, { from: 'exile' }).generic, 1, 'the old discount does not recognize the later object');
  }
  assert.ok(payment.some(c => c.tapped));
  assertGameStateInvariants(f.g);
});

test('Evercoat Ursine: actual unblocked combat damage casts one native hidden spell for free', async () => {
  const f = table();
  f.lands(Array(5).fill('Forest'));
  f.put('Grizzly Bears', 'library');
  f.put('Grizzly Bears', 'library');
  f.put('Grizzly Bears', 'library');
  f.put('Grizzly Bears', 'library');
  const ursine = await f.cast('Evercoat Ursine');
  assert.equal(f.a.exile.length, 2);
  f.attackers = p => p === f.a ? [{ card: ursine, target: f.b }] : [];
  f.cards = (_p, q) => q.prompt === 'Play for free:' ? q.from.filter(c => c.is('Creature')).slice(0, 1) : undefined;
  const hiddenIds = f.a.exile.map(c => c.iid);
  await f.g.runTurn();
  assert.equal(f.b.life, 34, 'the printed power of six deals six unblocked combat damage');
  assert.equal(f.a.exile.length, 1, 'only one hidden card is played');
  assert.equal(f.g.creatures(f.a).filter(c => hiddenIds.includes(c.iid)).length, 1);
  assert.ok(f.questions.some(({ q }) => q.type === 'chooseOption' && /Cast Grizzly Bears for free/.test(q.prompt)));
  assertGameStateInvariants(f.g);
});

test('God-Eternal Bontu: native library return offers the commander replacement after declining graveyard return', async () => {
  const f = table();
  f.lands(['Swamp', 'Swamp', 'Forest']);
  const card = f.put('God-Eternal Bontu'); card.commander = true;
  const destinations = [];
  f.option = (_p, q) => {
    if (q.aiHint?.kind !== 'commanderZone') return undefined;
    destinations.push(q.aiHint.toZone);
    return q.aiHint.toZone === 'graveyard' ? 'stay' : 'cz';
  };
  await f.cast('Murder', [card]);
  assert.deepEqual(destinations, ['graveyard', 'library'], 'both real commander-zone decisions must be offered');
  assert.equal(card.zone, 'command'); assert.equal(card.zoneVersion, 2);
  assertGameStateInvariants(f.g);
});

for (const changed of [false, true]) test(`Genesis: native upkeep ${changed ? 'does not pay for a later graveyard source incarnation' : 'pays and returns its native creature target'}`, async () => {
  const f = table();
  f.g.turnPlayer = f.b;
  f.lands(['Forest', 'Forest', 'Forest'], f.b);
  const ooze = await f.cast('Scavenging Ooze', [], f.b);
  f.g.turnPlayer = f.a;
  const forests = f.lands(['Forest', 'Forest', 'Forest']); f.lands(['Plains']);
  const genesis = f.put('Genesis', 'graveyard'), version = genesis.zoneVersion;
  const target = f.put('Grizzly Bears', 'graveyard');
  const pull = changed ? f.put('Pull from Eternity', 'hand') : null;
  f.targets = (p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(genesis) && p === f.b ? [genesis] : q.candidates.includes(target) ? [target] : undefined;
  let exiled = false, pulled = false;
  if (changed) f.priority = (p, q) => {
    if (p === f.b && !exiled && genesis.zone === 'graveyard') {
      const row = q.acts.find(entry => entry.card === ooze && entry.ability);
      if (row) { exiled = true; return { kind: 'activate', entry: row }; }
    }
    if (p === f.a && !pulled && genesis.zone === 'exile' && q.casts.some(row => row.card === pull)) {
      pulled = true; return { kind: 'cast', card: pull, from: 'hand', quickTargets: [genesis] };
    }
  };
  await f.g.runBeginningPhase(f.a);
  assert.equal(genesis.zone, 'graveyard');
  assert.equal(genesis.zoneVersion, version + (changed ? 2 : 0));
  if (changed) {
    assert.equal(exiled, true); assert.equal(pulled, true);
    assert.equal(target.zone, 'graveyard');
    assert.ok(forests.every(c => !c.tapped), 'a failed intervening source condition does not offer or pay 2G');
  } else {
    assert.equal(target.zone, 'hand');
    assert.ok(forests.every(c => c.tapped), 'three real Forests pay the optional 2G');
  }
  assertGameStateInvariants(f.g);
});

test("Hazel's Brewmaster: a paid Lazav copy change cannot link the older attack to the new copy lifetime", async () => {
  const f = table();
  f.lands(Array(8).fill('Forest'));
  const lazav = f.put('Lazav, the Multifarious');
  const brew = f.put("Hazel's Brewmaster", 'graveyard');
  const arcanis = f.put('Arcanis the Omnipotent', 'graveyard');
  f.x = () => 4;
  f.targets = (_p, q) => q.candidates.includes(arcanis) && q.spec?.upTo ? [arcanis] : q.candidates.includes(brew) ? [brew] : undefined;
  const copy = f.g.activatableList(f.a).find(row => row.card === lazav && /Become a copy/.test(row.ability?.label));
  assert.ok(copy); assert.equal(await f.g.activateAbility(f.a, copy), true);
  assert.equal(!!lazav.isCopyOf, true);
  const epoch = lazav.copyEpoch;
  f.attackers = p => p === f.a ? [{ card: lazav, target: f.b }] : [];
  let recopied = false;
  f.priority = (p, q) => {
    if (p !== f.a || recopied || !f.g.stack.some(so => so.kind === 'trigger' && so.name.endsWith('Food + exile'))) return;
    const action = q.acts.find(row => row.card === lazav && /Become a copy/.test(row.ability?.label));
    if (action) { recopied = true; return { kind: 'activate', entry: action }; }
  };
  await f.g.combatPhase(f.a);
  assert.equal(recopied, true, 'native priority offers and pays for the second copy before the older trigger resolves');
  assert.equal(lazav.copyEpoch, epoch + 1);
  assert.equal(arcanis.zone, 'exile');
  const food = f.g.bf().find(c => c.isToken && c.hasSub('Food'));
  assert.ok(food);
  assert.equal(f.g.activatableList(f.a).some(row => row.card === food && /Draw three cards/.test(row.ability?.label)), false, 'new copy lifetime cannot inherit cards exiled by the old copy trigger');
  assertGameStateInvariants(f.g);
});

test('Evercoat Ursine: native control change grants hidden-card look and play permission to the new controller', async () => {
  const f = table();
  f.lands(Array(5).fill('Forest'));
  f.lands(['Island', 'Island', 'Forest', 'Forest'], f.b);
  for (let i = 0; i < 4; i++) f.put('Grizzly Bears', 'library');
  const ursine = await f.cast('Evercoat Ursine');
  const hiddenIds = f.a.exile.map(c => c.iid);
  assert.equal(hiddenIds.length, 2);
  f.g.turnPlayer = f.b;
  await f.cast('Control Magic', [ursine], f.b);
  assert.equal(ursine.ctrl.idx, f.b.idx);
  for (const hidden of f.a.exile) {
    assert.ok(hidden.meta.revealedTo?.includes(f.b.idx));
    const remote = M.onlineGameViewFor(f.g, f.b).players.find(row => row.seat === f.a.idx).exile.find(row => row.token === 'c:' + hidden.iid);
    assert.equal(remote.hidden, false);
  }
  f.attackers = p => p === f.b ? [{ card: ursine, target: f.a }] : [];
  f.cards = (_p, q) => q.prompt === 'Play for free:' ? q.from.filter(c => c.is('Creature')).slice(0, 1) : undefined;
  await f.g.runTurn();
  const played = f.g.creatures(f.b).filter(c => hiddenIds.includes(c.iid));
  assert.equal(played.length, 1, 'the stolen source controller actually casts one linked card from its owner’s exile');
  assert.equal(played[0].owner.idx, f.a.idx); assert.equal(played[0].ctrl.idx, f.b.idx);
  assert.equal(f.a.life, 34);
  assertGameStateInvariants(f.g);
});

test('Currency Converter: an old discard trigger cannot acquire a later graveyard incarnation', async () => {
  const f = table();
  f.g.turnPlayer = f.b;
  f.lands(['Forest', 'Forest', 'Forest'], f.b);
  const ooze = await f.cast('Scavenging Ooze', [], f.b);
  f.g.turnPlayer = f.a;
  f.lands(['Forest', 'Swamp', 'Plains', 'Forest', 'Forest', 'Forest']);
  const converter = await f.cast('Currency Converter');
  const imp = await f.cast('Putrid Imp');
  const bear = f.put('Grizzly Bears', 'hand'), version = bear.zoneVersion;
  const pull = f.put('Pull from Eternity', 'hand');
  f.cards = (_p, q) => q.from.includes(bear) ? [bear] : undefined;
  f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : q.candidates.includes(bear) ? [bear] : undefined;
  let exiled = false, pulled = false;
  f.priority = (p, q) => {
    if (p === f.b && !exiled && bear.zone === 'graveyard') {
      const action = q.acts.find(row => row.card === ooze && row.ability);
      if (action) { exiled = true; return { kind: 'activate', entry: action }; }
    }
    if (p === f.a && !pulled && bear.zone === 'exile' && q.casts.some(row => row.card === pull)) {
      pulled = true; return { kind: 'cast', card: pull, from: 'hand', quickTargets: [bear] };
    }
  };
  const action = f.g.activatableList(f.a).find(row => row.card === imp && row.ability);
  assert.ok(action); assert.equal(await f.g.activateAbility(f.a, action), true);
  assert.equal(exiled, true); assert.equal(pulled, true);
  assert.equal(bear.zone, 'graveyard'); assert.equal(bear.zoneVersion, version + 3);
  assert.equal(f.g.activatableList(f.a).some(row => row.card === converter && /Convert an exiled card/.test(row.ability?.label)), false);
  assertGameStateInvariants(f.g);
});

for (const commander of [false, true]) test(`Learn from the Past: native graveyard shuffle ${commander ? 'offers the owner’s commander library replacement' : 'creates new card objects through the native move pipeline'}`, async () => {
  const f = table();
  f.lands(['Island', 'Forest', 'Forest', 'Forest']);
  const card = f.put(commander ? 'God-Eternal Bontu' : 'Grizzly Bears', 'graveyard'), version = card.zoneVersion;
  card.commander = commander;
  const decisions = [];
  f.option = (_p, q) => {
    if (q.aiHint?.kind !== 'commanderZone') return undefined;
    decisions.push(q.aiHint.toZone); return 'cz';
  };
  await f.cast('Learn from the Past', [f.a]);
  if (commander) {
    assert.deepEqual(decisions, ['library']);
    assert.equal(card.zone, 'command'); assert.equal(card.zoneVersion, version + 1);
  } else {
    assert.ok(['library', 'hand'].includes(card.zone));
    assert.equal(card.zoneVersion, version + (card.zone === 'hand' ? 2 : 1));
  }
  assertGameStateInvariants(f.g);
});

for (const borrowed of [false, true]) test(`Ultimate Nullification: native ${borrowed ? 'Gonti exile cast returns to the spell owner’s library' : 'paid cast returns as a new bottom-of-library object'}`, async () => {
  const f = table();
  let card, stackVersion;
  f.priority = () => { if (card?.zone === 'stack') stackVersion ??= card.zoneVersion; };
  if (borrowed) {
    f.g.turnPlayer = f.b;
    f.lands(['Swamp', 'Swamp', ...Array(8).fill('Forest')], f.b);
    card = f.put('Ultimate Nullification', 'library');
    f.cards = (_p, q) => q.from.includes(card) ? [card] : undefined;
    const gonti = await f.cast('Gonti, Lord of Luxury', [f.a], f.b);
    assert.equal(card.zone, 'exile');
    const offer = f.g.castableList(f.b).find(row => row.card === card && row.from === 'exile');
    assert.ok(offer); assert.equal(await f.g.castSpell(f.b, card, { from: offer.from, alt: offer.alt }), true);
    assert.equal(gonti.zone, 'exile', 'the real legendary sacrifice is also exiled by the spell');
    assert.equal(f.a.library[0]?.iid, card.iid, 'the original owner receives the spell');
    assert.equal(f.b.library.some(c => c.iid === card.iid), false);
  } else {
    f.lands(['Plains', ...Array(4).fill('Forest')]);
    const sacrifice = f.put('Lazav, the Multifarious');
    card = f.put('Ultimate Nullification', 'hand');
    assert.ok(f.g.castableList(f.a).some(row => row.card === card));
    assert.equal(await f.g.castSpell(f.a, card, { from: 'hand' }), true);
    assert.equal(sacrifice.zone, 'exile');
    assert.equal(f.a.library[0]?.iid, card.iid);
  }
  assert.equal(typeof stackVersion, 'number');
  assert.equal(card.zoneVersion, stackVersion + 1, 'native stack→library entry creates a new object');
  assert.equal(card.zone, 'library');
  assertGameStateInvariants(f.g);
});

test('Ultimate Nullification: a native Fork copy ceases while the original resolves to its owner’s library', async () => {
  const f = table();
  f.lands(['Plains', ...Array(6).fill('Mountain'), ...Array(4).fill('Forest')]);
  f.put('Lazav, the Multifarious');
  const card = f.put('Ultimate Nullification', 'hand');
  const fork = f.put('Fork', 'hand');
  f.targets = (_p, q) => q.quickTarget ? [q.quickTarget] : undefined;
  let copied = false, copyObserved = false, afterCopy = false, originalStayed = false;
  f.priority = (p, q) => {
    const original = f.g.stack.find(so => so.kind === 'spell' && so.card === card && !so.isCopy);
    const copy = f.g.stack.some(so => so.kind === 'spell' && so.card === card && so.isCopy);
    if (copy) copyObserved = true;
    if (copyObserved && original && !copy && !f.g.stack.some(so => so.card === fork)) {
      afterCopy = true; originalStayed = card.zone === 'stack';
    }
    if (p === f.a && !copied && original && q.casts.some(row => row.card === fork)) {
      copied = true; return { kind: 'cast', card: fork, from: 'hand', quickTargets: [original] };
    }
  };
  assert.equal(await f.g.castSpell(f.a, card, { from: 'hand' }), true);
  assert.equal(copied, true, 'paid Fork is cast in the original spell’s priority window');
  assert.equal(copyObserved, true, 'the native copy reaches the stack');
  assert.equal(afterCopy, true, 'priority returns after the native copy resolves');
  assert.equal(originalStayed, true, 'the copy resolves while the original physical spell remains on the stack');
  assert.equal(f.a.library.filter(c => c.name === 'Ultimate Nullification').length, 1);
  assert.equal(f.a.library[0]?.iid, card.iid);
  assert.equal(f.a.library.some(c => c.isCopySpell), false, 'no spell copy becomes a card in the library');
  assertGameStateInvariants(f.g);
});

for (const commander of [false, true]) test(`Finale of Revelation: paid X=10 shuffle ${commander ? 'offers the commander library replacement' : 'creates a new graveyard card object'}`, async () => {
  const f = table();
  f.lands(['Island', 'Island', ...Array(10).fill('Forest')]);
  f.x = () => 10;
  const card = f.put(commander ? 'God-Eternal Bontu' : 'Grizzly Bears', 'graveyard'), version = card.zoneVersion;
  card.commander = commander;
  const decisions = [];
  f.option = (_p, q) => {
    if (q.aiHint?.kind !== 'commanderZone') return undefined;
    decisions.push(q.aiHint.toZone); return 'cz';
  };
  const finale = await f.cast('Finale of Revelation');
  assert.equal(finale.zone, 'exile');
  assert.equal(f.a.hand.length, 10, 'the paid X=10 spell draws ten cards');
  if (commander) {
    assert.deepEqual(decisions, ['library']);
    assert.equal(card.zone, 'command'); assert.equal(card.zoneVersion, version + 1);
  } else {
    assert.ok(['library', 'hand'].includes(card.zone));
    assert.equal(card.zoneVersion, version + (card.zone === 'hand' ? 2 : 1));
  }
  assertGameStateInvariants(f.g);
});

for (const commander of [false, true]) test(`Midnight Clock: twelve paid native hour activations ${commander ? 'offer the commander library replacement' : 'create new hand and graveyard card objects'}`, async () => {
  const f = table();
  f.lands(Array(40).fill('Island'));
  const clock = await f.cast('Midnight Clock');
  const hand = f.put('Grizzly Bears', 'hand'), handVersion = hand.zoneVersion;
  const grave = f.put(commander ? 'God-Eternal Bontu' : 'Grizzly Bears', 'graveyard'), graveVersion = grave.zoneVersion;
  grave.commander = commander;
  const decisions = [];
  f.option = (_p, q) => {
    if (q.aiHint?.kind !== 'commanderZone') return undefined;
    decisions.push(q.aiHint.toZone); return 'cz';
  };
  for (let i = 0; i < 12; i++) {
    const action = f.g.activatableList(f.a).find(row => row.card === clock && row.ability?.label === 'Hour counter');
    assert.ok(action, `printed hour ability ${i + 1} is offered with native mana remaining`);
    assert.equal(await f.g.activateAbility(f.a, action), true, 'native {2}{U} hour payment succeeds');
    await f.g.priorityRound(f.a);
    if (i < 11) assert.equal(clock.counters.hour, i + 1);
  }
  assert.equal(clock.zone, 'exile');
  assert.equal(f.a.hand.length, 7);
  if (commander) {
    assert.deepEqual(decisions, ['library']);
    assert.equal(grave.zone, 'command'); assert.equal(grave.zoneVersion, graveVersion + 1);
  } else {
    assert.ok(['library', 'hand'].includes(grave.zone));
    assert.equal(grave.zoneVersion, graveVersion + (grave.zone === 'hand' ? 2 : 1));
  }
  assert.ok(['library', 'hand'].includes(hand.zone));
  assert.equal(hand.zoneVersion, handVersion + (hand.zone === 'hand' ? 2 : 1));
  assertGameStateInvariants(f.g);
});

test('Midnight Clock: its twelfth hour creates a separate native trigger that an opponent can Stifle', async () => {
  const f = table();
  f.lands(Array(43).fill('Island')); f.lands(['Island'], f.b);
  const clock = await f.cast('Midnight Clock');
  const bear = f.put('Grizzly Bears', 'hand');
  const stifle = f.put('Stifle', 'hand', f.b);
  let answered = false, observed = false;
  f.priority = (p, q) => {
    const trigger = f.g.stack.find(so => so.kind === 'trigger' && so.srcCard === clock && clock.counters.hour === 12);
    if (trigger) observed = true;
    if (p === f.b && trigger && !answered && q.casts.some(row => row.card === stifle)) {
      answered = true; return { kind: 'cast', card: stifle, from: 'hand', quickTargets: [trigger] };
    }
  };
  for (let i = 0; i < 12; i++) {
    const action = f.g.activatableList(f.a).find(row => row.card === clock && row.ability?.label === 'Hour counter');
    assert.ok(action); assert.equal(await f.g.activateAbility(f.a, action), true);
    await f.g.priorityRound(f.a);
  }
  assert.equal(observed, true, 'the printed twelfth-counter trigger reaches the stack after the hour ability resolves');
  assert.equal(answered, true, 'an actual paid Stifle responds to that native trigger');
  assert.equal(clock.zone, 'battlefield'); assert.equal(clock.counters.hour, 12);
  assert.equal(bear.zone, 'hand'); assert.equal(bear.zoneVersion, 0);
  assert.equal(stifle.zone, 'graveyard');
  const thirteenth = f.g.activatableList(f.a).find(row => row.card === clock && row.ability?.label === 'Hour counter');
  assert.ok(thirteenth); assert.equal(await f.g.activateAbility(f.a, thirteenth), true);
  await f.g.priorityRound(f.a);
  assert.equal(clock.zone, 'battlefield'); assert.equal(clock.counters.hour, 13);
  assert.equal(bear.zoneVersion, 0, 'the thirteenth counter does not repeat a Stifled twelfth-counter trigger');
  assertGameStateInvariants(f.g);
});

test('Midnight Clock: destroying the source before its native hour ability resolves cannot put counters on a graveyard object', async () => {
  const f = table();
  f.lands(Array(6).fill('Island')); f.lands(['Plains', 'Forest'], f.b);
  const clock = await f.cast('Midnight Clock'), version = clock.zoneVersion;
  const disenchant = f.put('Disenchant', 'hand', f.b);
  let answered = false;
  f.priority = (p, q) => {
    const ability = f.g.stack.find(so => so.kind === 'ability' && so.srcCard === clock);
    if (p === f.b && ability && !answered && q.casts.some(row => row.card === disenchant)) {
      answered = true; return { kind: 'cast', card: disenchant, from: 'hand', quickTargets: [clock] };
    }
  };
  const action = f.g.activatableList(f.a).find(row => row.card === clock && row.ability?.label === 'Hour counter');
  assert.ok(action); assert.equal(await f.g.activateAbility(f.a, action), true);
  await f.g.priorityRound(f.a);
  assert.equal(answered, true, 'actual paid Disenchant resolves before the hour ability');
  assert.equal(clock.zone, 'graveyard'); assert.equal(clock.zoneVersion, version + 1);
  assert.equal(clock.counters.hour || 0, 0, 'the old source ability cannot put a counter on the newer graveyard object');
  assertGameStateInvariants(f.g);
});

test('Midnight Clock: its native twelfth-counter trigger shuffles and draws after Disenchant removes the source', async () => {
  const f = table();
  f.lands(Array(40).fill('Island')); f.lands(['Plains', 'Forest'], f.b);
  const clock = await f.cast('Midnight Clock');
  const bear = f.put('Grizzly Bears', 'hand');
  const disenchant = f.put('Disenchant', 'hand', f.b);
  let answered = false;
  f.priority = (p, q) => {
    const trigger = f.g.stack.find(so => so.kind === 'trigger' && so.srcCard === clock && clock.counters.hour === 12);
    if (p === f.b && trigger && !answered && q.casts.some(row => row.card === disenchant)) {
      answered = true; return { kind: 'cast', card: disenchant, from: 'hand', quickTargets: [clock] };
    }
  };
  for (let i = 0; i < 12; i++) {
    const action = f.g.activatableList(f.a).find(row => row.card === clock && row.ability?.label === 'Hour counter');
    assert.ok(action); assert.equal(await f.g.activateAbility(f.a, action), true);
    await f.g.priorityRound(f.a);
  }
  assert.equal(answered, true, 'actual paid Disenchant responds to the separate printed trigger');
  assert.equal(f.a.hand.length, 7, 'the trigger still shuffles and draws after its source leaves');
  assert.ok(['library', 'hand'].includes(clock.zone), 'the newer graveyard Clock is shuffled without being exiled as the old battlefield object');
  assert.ok(bear.zoneVersion >= 1);
  assertGameStateInvariants(f.g);
});
