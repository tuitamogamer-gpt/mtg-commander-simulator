import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table(extraSeat = false) {
  const game = new M.Game({seed: 101026701, paced: false});
  const f = {game, decisions: []};
  const controller = {decide: async (_g, q) => {
    f.decisions.push(q);
    if (q.type === 'priority') return f.priority?.(q) ?? {kind: 'pass'};
    if (q.type === 'chooseTargets') return f.targets?.(q) ?? (q.quickTarget ? [q.quickTarget] : q.candidates.slice(0, q.min || 0));
    if (q.type === 'chooseCards') return f.cards?.(q) ?? q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(o => o.mana?.G || o.key === 'G' || o.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'chooseX') return f.x?.(q) ?? q.min ?? 0;
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'attackers') return f.attackers?.(q) ?? [];
    if (q.type === 'blockers' || q.type === 'combatReview') return [];
    if (q.type === 'cardReveal') return null;
    throw new Error(`Unhandled native save decision: ${q.type}`);
  }};
  f.me = game.addPlayer('Saver', {name: 'Native save audit'}, controller, false);
  f.rival = game.addPlayer('Rival', {name: 'Native save audit'}, controller, false);
  if (extraSeat) game.addPlayer('Bystander', {name: 'Native save audit'}, controller, false);
  game.turnPlayer = f.me; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  f.put = (name, zone = 'battlefield', owner = f.me) => {
    assert.ok(M.DEFS[name], `Native definition: ${name}`);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.ctrl = owner; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
    game.recalc(); return card;
  };
  f.cast = async (name, targets = [], player = f.me) => {
    const card = f.put(name, 'hand', player);
    assert.ok(game.castableList(player).some(row => row.card === card), `Native offer: ${name}`);
    assert.equal(await game.castSpell(player, card, {from: 'hand', quickTargets: targets}), true);
    assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
    assertGameStateInvariants(game); return card;
  };
  f.restore = () => {
    const snapshot = M.captureGameState(game);
    assert.ok(snapshot, M.gameStateSnapshotBlockers(game).join(', '));
    const next = table(game.players.length === 3);
    M.restoreGameState(next.game, JSON.parse(JSON.stringify(snapshot)));
    assert.equal(M.gameStateFingerprint(next.game), M.gameStateFingerprint(game));
    assertGameStateInvariants(next.game); return next;
  };
  for (const player of game.players) for (let i = 0; i < 12; i++) f.put('Forest', 'library', player);
  return f;
}

test('A native Lazav copy lifetime is preserved or explicitly blocks the checkpoint', async t => {
  const f = table();
  for (let i = 0; i < 8; i++) f.put('Forest');
  const lazav = f.put('Lazav, the Multifarious');
  const brew = f.put("Hazel's Brewmaster", 'graveyard');
  const arcanis = f.put('Arcanis the Omnipotent', 'graveyard');
  f.x = () => 4;
  f.targets = q => q.candidates.includes(arcanis) && q.spec?.upTo ? [arcanis] : q.candidates.includes(brew) ? [brew] : [];
  const copy = f.game.activatableList(f.me).find(row => row.card === lazav && /Become a copy/.test(row.ability?.label));
  assert.ok(copy); assert.equal(await f.game.activateAbility(f.me, copy), true);
  const epoch = lazav.copyEpoch;
  f.attackers = () => [{card: lazav, target: f.rival}];
  let recopied = false;
  f.priority = q => {
    if (recopied || !f.game.stack.some(so => so.kind === 'trigger' && so.name.endsWith('Food + exile'))) return;
    const row = q.acts.find(entry => entry.card === lazav && /Become a copy/.test(entry.ability?.label));
    if (row) { recopied = true; return {kind: 'activate', entry: row}; }
  };
  await f.game.combatPhase(f.me);
  assert.equal(recopied, true); assert.equal(lazav.copyEpoch, epoch + 1);
  const food = f.game.bf().find(c => c.isToken && c.hasSub('Food'));
  assert.ok(food); assert.equal(arcanis.zone, 'exile');
  assert.equal(f.game.activatableList(f.me).some(row => row.card === food && /Draw three cards/.test(row.ability?.label)), false);
  const snapshot = M.captureGameState(f.game);
  if (!snapshot) {
    const blockers = M.gameStateSnapshotBlockers(f.game);
    assert.ok(blockers.length, 'unsupported copied state keeps the prior checkpoint and decision tail');
    t.diagnostic(JSON.stringify({checkpoint: 'blocked', blockers}));
    return;
  }
  const next = table(); M.restoreGameState(next.game, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(next.game.byIid(lazav.iid).copyEpoch, lazav.copyEpoch);
  assert.equal(next.game.byIid(lazav.iid).def.name, lazav.def.name);
  assert.equal(next.game.activatableList(next.me).some(row => row.card.iid === food.iid && /Draw three cards/.test(row.ability?.label)), false);
  assertGameStateInvariants(next.game);
});

test('A paid Clone entry cannot save its linked copy as an ordinary printed creature', async () => {
  const f = table();
  for (const name of ['Island', 'Forest', 'Forest', 'Forest']) f.put(name);
  const brew = f.put("Hazel's Brewmaster");
  const arcanis = f.put('Arcanis the Omnipotent', 'graveyard');
  f.cards = q => q.from.includes(brew) ? [brew] : q.from.slice(0, q.min || 0);
  f.targets = q => q.quickTarget ? [q.quickTarget] : q.candidates.includes(arcanis) ? [arcanis] : q.candidates.slice(0, q.min || 0);
  const clone = await f.cast('Clone');
  assert.equal(clone.isToken, false); assert.equal(!!clone.isCopyOf, true);
  assert.equal(clone.def.name, brew.def.name); assert.equal(arcanis.zone, 'exile');
  const food = f.game.bf().find(c => c.isToken && c.hasSub('Food'));
  assert.ok(food); assert.ok(f.game.activatableList(f.me).some(row => row.card === food && /Draw three cards/.test(row.ability?.label)));
  assert.equal(M.captureGameState(f.game), null, 'retain the last complete board and native action tail instead of losing the physical Clone identity and linked copy epoch');
  assert.ok(M.gameStateSnapshotBlockers(f.game).some(reason => /non-token copy/.test(reason)));
  for (let i = 0; i < 3; i++) f.put('Swamp');
  await f.cast('Murder', [clone]);
  assert.equal(clone.zone, 'graveyard'); assert.equal(clone.def.name, 'Clone');
  assert.ok(M.captureGameState(f.game), 'a safe board checkpoint is offered after the unsupported battlefield copy leaves');
});

test('An expired paid Mirage Mirror copy cannot restore functionless copy history', async () => {
  const f = table();
  for (let i = 0; i < 5; i++) f.put('Forest');
  const brew = f.put("Hazel's Brewmaster");
  const arcanis = f.put('Arcanis the Omnipotent', 'graveyard');
  const mirror = await f.cast('Mirage Mirror');
  f.targets = q => q.quickTarget ? [q.quickTarget] : q.candidates.includes(brew) ? [brew] : q.candidates.includes(arcanis) ? [arcanis] : q.candidates.slice(0, q.min || 0);
  let row = f.game.activatableList(f.me).find(entry => entry.card === mirror && /Copy a permanent/.test(entry.ability?.label));
  assert.ok(row); assert.equal(await f.game.activateAbility(f.me, row), true);
  const epoch = mirror.copyEpoch;
  f.attackers = () => [{card: mirror, target: f.rival}];
  await f.game.runTurn();
  assert.equal(mirror.def.name, 'Mirage Mirror'); assert.equal(!!mirror.isCopyOf, false);
  assert.equal(mirror.copyEpoch, epoch + 1); assert.equal(arcanis.zone, 'exile');
  assert.ok(mirror.meta.oracleCopyState);
  const food = f.game.bf().find(card => card.isToken && card.hasSub('Food'));
  assert.ok(food); assert.equal(f.game.activatableList(f.me).some(entry => entry.card === food && /Draw three cards/.test(entry.ability?.label)), false);
  assert.equal(M.captureGameState(f.game), null, 'compiled copy history stays in the live engine and recorded tail instead of being converted to plain JSON');
  assert.ok(M.gameStateSnapshotBlockers(f.game).some(reason => /temporary-copy history/.test(reason)));
  row = f.game.activatableList(f.me).find(entry => entry.card === mirror && /Copy a permanent/.test(entry.ability?.label));
  assert.equal(typeof row?.ability?.run, 'function');
  assert.equal(await f.game.activateAbility(f.me, row), true);
  assert.equal(f.game.activatableList(f.me).some(entry => entry.card === food && /Draw three cards/.test(entry.ability?.label)), false);
  f.put('Swamp'); f.put('Swamp'); await f.cast('Murder', [mirror]);
  assert.equal(mirror.zone, 'graveyard'); assert.ok(M.captureGameState(f.game));
});

test('A native restricted-mana checkpoint cannot silently restore Sage mana as unrestricted', async () => {
  const f = table(), sage = f.put('Somberwald Sage'), sol = f.put('Sol Ring', 'hand');
  const action = f.game.activatableList(f.me).find(row => row.card === sage && row.manaAbility);
  assert.ok(action); assert.equal(await f.game.activateAbility(f.me, action), true);
  assert.equal(f.me.pool.G, 3); assert.equal(sage.tapped, true);
  assert.equal(f.game.castableList(f.me).some(row => row.card === sol), false);
  assert.equal(M.captureGameState(f.game), null, 'the previous safe checkpoint is retained when executable mana restrictions cannot be serialized');
  assert.ok(M.gameStateSnapshotBlockers(f.game).some(reason => /floating mana/i.test(reason)));
  f.game.emptyPool(); assert.ok(M.captureGameState(f.game), 'saving resumes after the restricted mana expires');
});

test('Native Rousing Refrain mana still survives the next phase after JSON save', async () => {
  const f = table();
  for (const name of ['Mountain', 'Mountain', 'Wastes', 'Wastes', 'Wastes']) f.put(name);
  for (let i = 0; i < 5; i++) f.put('Forest', 'hand', f.rival);
  await f.cast('Rousing Refrain', [f.rival]);
  assert.equal(f.me.pool.R, 5); assert.equal(f.me.persistMana.R, 5);
  const next = f.restore();
  next.game.emptyPool();
  assert.equal(next.me.pool.R, 5, 'printed until-end-of-turn mana retention survives restoring');
});

for (const departure of ['stay', 'die', 'blink']) test(`Palace Jailer prisoners survive JSON save after source ${departure}`, async () => {
  const f = table();
  for (let i = 0; i < 6; i++) f.put('Plains');
  for (let i = 0; i < 7; i++) f.put('Swamp', 'battlefield', f.rival);
  const prisoner = f.put('Grizzly Bears', 'battlefield', f.rival);
  const jailer = await f.cast('Palace Jailer');
  assert.equal(prisoner.zone, 'exile'); assert.equal(f.game.monarch, f.me);
  if (departure === 'die') await f.cast('Murder', [jailer], f.rival);
  let second;
  if (departure === 'blink') {
    second = f.put('Grizzly Bears', 'battlefield', f.rival);
    await f.cast('Cloudshift', [jailer]);
    assert.equal(second.zone, 'exile');
  }
  const next = f.restore();
  next.game.turnPlayer = next.rival;
  await next.cast('Thorn of the Black Rose', [], next.rival);
  assert.equal(next.game.byIid(prisoner.iid).zone, 'battlefield');
  if (second) assert.equal(next.game.byIid(second.iid).zone, 'battlefield');
});

test('Native Banisher Priest source-duration exile survives JSON save and releases on paid removal', async () => {
  const f = table();
  for (let i = 0; i < 3; i++) f.put('Plains');
  for (let i = 0; i < 3; i++) f.put('Swamp', 'battlefield', f.rival);
  const prisoner = f.put('Grizzly Bears', 'battlefield', f.rival);
  const priest = await f.cast('Banisher Priest');
  assert.equal(prisoner.zone, 'exile');
  const next = f.restore(); next.game.turnPlayer = next.rival;
  await next.cast('Murder', [next.game.byIid(priest.iid)], next.rival);
  assert.equal(next.game.byIid(prisoner.iid).zone, 'battlefield');
});

test('Native Brewmaster linked creature abilities survive JSON save', async () => {
  const f = table();
  for (let i = 0; i < 4; i++) f.put('Swamp');
  const arcanis = f.put('Arcanis the Omnipotent', 'graveyard');
  f.targets = q => q.candidates.includes(arcanis) ? [arcanis] : undefined;
  f.cards = q => q.from.includes(arcanis) ? [arcanis] : undefined;
  await f.cast("Hazel's Brewmaster");
  const food = f.game.bf().find(card => card.isToken && card.hasSub('Food'));
  assert.ok(food);
  assert.ok(f.game.activatableList(f.me).some(row => row.card === food && /Draw three cards/.test(row.ability?.label)));
  const next = f.restore(), restoredFood = next.game.byIid(food.iid);
  const draw = next.game.activatableList(next.me).find(row => row.card === restoredFood && /Draw three cards/.test(row.ability?.label));
  assert.ok(!!draw, 'the native linked Arcanis still grants its ability');
  const before = next.me.hand.length;
  assert.equal(await next.game.activateAbility(next.me, draw), true);
  await next.game.priorityRound(next.me);
  assert.equal(next.me.hand.length, before + 3);
});

test('Native hidden Evercoat cards retain exact links and private look permission through save', async () => {
  const f = table();
  for (let i = 0; i < 5; i++) f.put('Forest');
  const ursine = await f.cast('Evercoat Ursine');
  const linked = M.OracleV24Permanents.linked(f.game, ursine, 'evercoat-hideaway');
  assert.equal(linked.length, 2);
  const next = f.restore();
  const restored = M.OracleV24Permanents.linked(next.game, next.game.byIid(ursine.iid), 'evercoat-hideaway');
  assert.equal(restored.length, 2);
  for (const card of restored) {
    assert.equal(card.faceDown, true);
    assert.ok(card.meta.revealedTo.includes(next.me.idx));
    assert.equal(card.meta.revealedTo.includes(next.rival.idx), false);
  }
});

test('A departed monarch passes the crown and releases Jailer prisoners before the table is saved', async () => {
  const f = table(true);
  for (let i = 0; i < 4; i++) f.put('Plains');
  for (let i = 0; i < 4; i++) f.put('Swamp', 'battlefield', f.rival);
  f.put('Mountain', 'battlefield', f.rival);
  const prisoner = f.put('Grizzly Bears', 'battlefield', f.rival);
  await f.cast('Palace Jailer');
  f.me.life = 3;
  await f.cast('Lightning Bolt', [f.me], f.rival);
  assert.equal(f.me.lost, true); assert.equal(prisoner.zone, 'battlefield');
  assert.equal(f.game.monarch, f.rival, 'CR 725.4: the next surviving player takes a departing active monarch crown');
  const next = f.restore(); next.game.turnPlayer = next.rival;
  await next.cast('Thorn of the Black Rose', [], next.rival);
  assert.equal(next.game.byIid(prisoner.iid).zone, 'battlefield');
});

test('A resumed native shuffle follows the exact saved random stream', async () => {
  const f = table();
  for (let i = 0; i < 3; i++) f.put('Forest');
  const next = f.restore();
  await f.cast('Cultivate');
  await next.cast('Cultivate');
  assert.deepEqual(Array.from(next.me.library, card => card.iid), Array.from(f.me.library, card => card.iid),
    'checkpoint-tail decision replay receives the same shuffled library and draw choices');
});

test('A nonmonarch Jailer owner may depart while its exact prisoners remain portable', async () => {
  const f = table(true), bystander = f.game.players[2];
  for (let i = 0; i < 4; i++) f.put('Swamp', 'battlefield', f.rival);
  f.game.turnPlayer = f.rival;
  await f.cast('Thorn of the Black Rose', [], f.rival);
  f.game.turnPlayer = f.me;
  for (let i = 0; i < 4; i++) f.put('Plains');
  f.put('Island');
  f.put('Mountain', 'battlefield', f.rival);
  const prisoner = f.put('Grizzly Bears', 'battlefield', f.rival), stifle = f.put('Stifle', 'hand');
  f.targets = q => q.candidates.includes(prisoner) ? [prisoner] : undefined;
  let responded = false;
  f.priority = q => {
    if (q.player !== f.me || responded) return;
    const crown = q.stack.find(so => so.kind === 'trigger' && /monarch/i.test(so.name));
    if (!crown) return;
    const offered = q.casts.find(row => row.card === stifle);
    assert.ok(offered); responded = true;
    return {kind: 'cast', card: stifle, from: offered.from, alt: offered.alt, quickTarget: crown};
  };
  const jailer = await f.cast('Palace Jailer');
  assert.equal(responded, true); assert.equal(f.game.monarch?.idx, f.rival.idx);
  assert.equal(prisoner.zone, 'exile');
  f.me.life = 3;
  await f.cast('Lightning Bolt', [f.me], f.rival);
  assert.equal(f.me.lost, true); assert.equal(prisoner.zone, 'exile');
  assert.equal(!!f.game.byIid(jailer.iid), false, 'a departing player removes its owned source from the table');
  const next = f.restore();
  assert.doesNotThrow(() => M.gameStateSnapshotBlockers(next.game), 'departed Jailer sources do not crash checkpoint checks');
  assert.ok(M.captureGameState(next.game), 'a monarch duration remains serializable without its departed source');
  for (let i = 0; i < 4; i++) next.put('Swamp', 'battlefield', next.game.players[bystander.idx]);
  next.game.turnPlayer = next.game.players[bystander.idx];
  await next.cast('Thorn of the Black Rose', [], next.game.players[bystander.idx]);
  assert.equal(next.game.byIid(prisoner.iid).zone, 'battlefield');
});

test('Saved shuffle streams and linked exile identities reject malformed account data', async () => {
  const f = table();
  for (let i = 0; i < 5; i++) f.put('Forest');
  await f.cast('Evercoat Ursine');
  const snapshot = JSON.parse(JSON.stringify(M.captureGameState(f.game)));
  assert.ok(snapshot.linkedExiles.length);
  for (const randomState of [-1, 0x100000000, 1.5, '0', null]) {
    assert.throws(() => M.restoreGameState(table().game, {...snapshot, randomState}), /invalid random state/);
  }
  const zero = table(); M.restoreGameState(zero.game, {...snapshot, randomState: 0});
  assert.equal(zero.game.rnd.state, 0, 'zero is a valid exact saved stream');
  for (const change of [
    row => {row.sourceIid = -1;},
    row => {row.lifetime = 'copy:NaN';},
    row => {row.cards[0].zoneVersion += 1;},
    row => {row.cards[0].iid = -1;},
  ]) {
    const invalid = structuredClone(snapshot); change(invalid.linkedExiles[0]);
    assert.throws(() => M.restoreGameState(table().game, invalid), /invalid linked exiles/);
  }
  const legacy = structuredClone(snapshot); delete legacy.randomState; delete legacy.linkedExiles;
  assert.doesNotThrow(() => M.restoreGameState(table().game, legacy), 'older board saves remain readable');
});
