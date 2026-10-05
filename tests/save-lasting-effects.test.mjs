import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// Lasting effects that are plain data are part of a turn save. Effects bound to
// an object that has since left are history and must not block every later
// save. Closures and unknown shapes still block.

const MTG = loadEngine();
// Engine objects come from another realm; compare their data.
const plain = value => JSON.parse(JSON.stringify(value));

function table() {
  const controller = { decide: async (game, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 1);
    if (q.type === 'orderTriggers') return q.triggers;
    return [];
  } };
  const game = new MTG.Game({ seed: 905, paced: false, maxTurns: 30 });
  const players = ['First', 'Second', 'Third'].map((name, index) =>
    game.addPlayer(name, { name: 'Diagnostic' }, controller, index > 0));
  game.turnPlayer = players[0];
  game.turnNo = 7;
  game.phase = 'main1';
  game.step = 'main';
  const put = (name, owner) => {
    const card = new MTG.CardInst(MTG.DEFS[name], owner);
    card.zone = 'battlefield';
    card.sick = false;
    game.battlefield.push(card);
    game.recalc();
    return card;
  };
  return { game, players, put };
}

function roundTrip(game) {
  assert.deepEqual(Array.from(MTG.gameStateSnapshotBlockers(game)), []);
  const snapshot = MTG.captureGameState(game);
  assert.ok(snapshot);
  const fresh = table().game;
  MTG.restoreGameState(fresh, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(MTG.gameStateFingerprint(fresh), MTG.gameStateFingerprint(game));
  return { snapshot, fresh };
}

test('a token that cannot attack its maker keeps that restriction across a save', async () => {
  const { game, players: [maker, owner, third] } = table();
  const [rager] = await game.makeTokens('lightningRager', owner);
  rager.sick = false;
  // Rite of the Raging Storm's restriction, exactly as the card records it.
  game.untilEffects.push({ kind: 'cantAttackPlayerCard', iid: rager.iid, notPlayer: maker, expires: 'never' });
  assert.equal(game.canAttackTarget(rager, maker), false);
  assert.equal(game.canAttackTarget(rager, third), true);
  const { snapshot, fresh } = roundTrip(game);
  assert.deepEqual(plain(snapshot.attackRestrictions), [{ kind: 'cantAttackPlayerCard', iid: rager.iid, notPlayer: 0, expires: 'never' }]);
  const restored = fresh.byIid(rager.iid);
  assert.equal(fresh.canAttackTarget(restored, fresh.players[0]), false, 'still cannot attack its maker');
  assert.equal(fresh.canAttackTarget(restored, fresh.players[2]), true);
});

test('a restriction left behind by a vanished token no longer blocks saves', async () => {
  const { game, players: [maker, owner] } = table();
  const [rager] = await game.makeTokens('lightningRager', owner);
  game.untilEffects.push({ kind: 'cantAttackPlayerCard', iid: rager.iid, notPlayer: maker, expires: 'never', unknownField: 1 });
  assert.match(MTG.gameStateSnapshotBlockers(game).join(' '), /lasting effect/, 'an unknown shape blocks while its card exists');
  await game.sacrifice(owner, rager);
  assert.equal(rager.zone, 'ceased');
  const { snapshot } = roundTrip(game);
  assert.deepEqual(plain(snapshot.attackRestrictions), []);
});

test('a player who cannot be attacked until their next turn stays protected after a resume', () => {
  const { game, players: [protectedPlayer, attacker], put } = table();
  const bear = put('Grizzly Bears', attacker);
  game.untilEffects.push({ kind: 'cantAttackPlayer', who: attacker, notPlayer: protectedPlayer, expires: 'untilTurnOf', whoTurn: protectedPlayer });
  assert.equal(game.canAttackTarget(bear, protectedPlayer), false);
  const { snapshot, fresh } = roundTrip(game);
  assert.deepEqual(plain(snapshot.attackRestrictions), [{ kind: 'cantAttackPlayer', who: 1, notPlayer: 0, expires: 'untilTurnOf', whoTurn: 0 }]);
  const restored = fresh.byIid(bear.iid);
  assert.equal(fresh.canAttackTarget(restored, fresh.players[0]), false);
  assert.equal(fresh.canAttackTarget(restored, fresh.players[2]), true);
  assert.equal(fresh.untilEffects.find(effect => effect.kind === 'cantAttackPlayer').whoTurn, fresh.players[0],
    'the restriction still ends when the protected player begins a turn');
});

test('haste granted for as long as a permanent stays is restored with the permanent', () => {
  const { game, players: [me], put } = table();
  const bear = put('Grizzly Bears', me);
  bear.sick = true;
  game.untilEffects.push({ kind: 'oracleGrantedOperation', expires: 'object', iid: bear.iid, zoneVersion: bear.zoneVersion,
    timestamp: game.nextOracleTimestamp(), field: 'extraAbilities', grants: [], keywords: ['haste'] });
  game.recalc();
  assert.ok(bear.kw('haste'));
  const { snapshot, fresh } = roundTrip(game);
  assert.equal(snapshot.grantedKeywords.length, 1);
  assert.ok(fresh.byIid(bear.iid).kw('haste'));
});

test('a granted ability with closures blocks while its permanent lives, but not after it died', async () => {
  const { game, players: [me], put } = table();
  const bear = put('Grizzly Bears', me);
  game.untilEffects.push({ kind: 'oracleGrantedOperation', expires: 'object', iid: bear.iid, zoneVersion: bear.zoneVersion,
    field: 'extraTriggers', grants: [{ on: 'attacks', run: async () => {} }], keywords: [] });
  assert.match(MTG.gameStateSnapshotBlockers(game).join(' '), /lasting effect/);
  await game.destroy(bear);
  assert.equal(bear.zone, 'graveyard');
  const { snapshot, fresh } = roundTrip(game);
  assert.deepEqual(plain(snapshot.grantedKeywords), []);
  assert.equal(fresh.untilEffects.length, 0);
});

test('an object effect waiting for a future zone version still blocks', () => {
  const { game, players: [me] } = table();
  const card = new MTG.CardInst(MTG.DEFS['Grizzly Bears'], me);
  card.zone = 'graveyard';
  me.graveyard.push(card);
  // Rise from the Grave style: recorded for the version that will enter next.
  game.untilEffects.push({ kind: 'oracleCharacteristics', expires: 'object', iid: card.iid, zoneVersion: card.zoneVersion + 1,
    timestamp: game.nextOracleTimestamp(), colors: ['B'] });
  assert.match(MTG.gameStateSnapshotBlockers(game).join(' '), /lasting effect/);
});

test('malformed attack restrictions and keyword grants still block, and bad saved seats are refused', () => {
  const { game, players: [maker, owner], put } = table();
  const bear = put('Grizzly Bears', owner);
  for (const effect of [
    { kind: 'cantAttackPlayerCard', iid: bear.iid, notPlayer: 0, expires: 'never' },
    { kind: 'cantAttackPlayerCard', iid: bear.iid, notPlayer: maker, expires: 'eot' },
    { kind: 'cantAttackPlayer', who: owner, notPlayer: maker, expires: 'eot', whoTurn: maker },
    { kind: 'cantAttackPlayer', who: owner, notPlayer: maker, expires: 'untilTurnOf', whoTurn: maker, apply() {} },
    { kind: 'oracleGrantedOperation', expires: 'object', iid: bear.iid, zoneVersion: bear.zoneVersion,
      field: 'extraAbilities', grants: [], keywords: ['haste'], apply() {} },
    { kind: 'oracleGrantedOperation', expires: 'object', iid: bear.iid, zoneVersion: -1,
      field: 'extraAbilities', grants: [], keywords: ['haste'] },
  ]) {
    game.untilEffects = [effect];
    assert.match(MTG.gameStateSnapshotBlockers(game).join(' '), /lasting effect/, `${effect.kind}: ${Object.keys(effect).join(',')}`);
    assert.equal(MTG.captureGameState(game), null);
  }
  game.untilEffects = [{ kind: 'cantAttackPlayerCard', iid: bear.iid, notPlayer: maker, expires: 'never' }];
  const badSeat = JSON.parse(JSON.stringify(MTG.captureGameState(game)));
  badSeat.attackRestrictions[0].notPlayer = 7;
  assert.throws(() => MTG.restoreGameState(table().game, badSeat), /attack restrictions/);
  game.untilEffects = [{ kind: 'oracleGrantedOperation', expires: 'object', iid: bear.iid, zoneVersion: bear.zoneVersion,
    timestamp: game.nextOracleTimestamp(), field: 'extraAbilities', grants: [], keywords: ['haste'] }];
  const badGrant = JSON.parse(JSON.stringify(MTG.captureGameState(game)));
  badGrant.grantedKeywords[0].grants = [{ on: 'attacks' }];
  assert.throws(() => MTG.restoreGameState(table().game, badGrant), /granted keywords/);
});
