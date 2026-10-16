import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, play, event} from './helpers/c21-fixtures.mjs';

const wire = value => JSON.parse(JSON.stringify(value));

async function enchantedTable(name = 'Overencumbered', targetSeat = 2) {
  const f = setup('human', 3), target = f.game.players[targetSeat];
  f.decide = (p, q) => q.type === 'chooseTargets' && q.candidates.includes(target) ? [target] : undefined;
  const aura = await play(f, name);
  const attacker = body(f, target);
  if (name === 'Overencumbered') card(f, 'Mind Stone', 'battlefield', target);
  for (const p of f.game.players) { for (const color in p.pool) p.pool[color] = 0; p.poolMeta = []; }
  f.game.turnPlayer = target;
  const snapshot = wire(M.captureGameState(f.game));
  assert.ok(snapshot, 'the real aura and its tokens have a saveable board');
  return Object.assign(f, {target, aura, attacker, snapshot});
}

for (const pay of [true, false]) test(`restored Overencumbered offers its enchanted player the four-artifact payment (${pay ? 'pay' : 'decline'})`, async () => {
  const f = await enchantedTable(), restored = setup('human', 3);
  const saved = f.snapshot.cards.find(c => c.iid === f.aura.iid);
  assert.equal(saved.enchantedPlayer, f.target.idx);
  assert.equal(saved.meta?.cursedPlayer, undefined, 'wire data never carries a live Player object');
  M.restoreGameState(restored.game, f.snapshot);
  const aura = restored.game.byIid(f.aura.iid), target = restored.game.players[f.target.idx];
  assert.ok(aura.meta.cursedPlayer === target, 'restored Aura points at the restored player');
  assert.ok(aura.meta.cursedPlayer !== f.target, 'restored Aura does not point into the old game');
  assert.equal(M.gameStateFingerprint(restored.game), M.gameStateFingerprint(f.game));
  assert.equal(restored.game.bf().filter(c => c.isToken && c.ctrl === target).length, 3, 'resume does not repeat ETB');
  target.pool.C = 4;
  const asked = [];
  restored.decide = (p, q) => {
    if (q.type !== 'chooseOption') return undefined;
    asked.push({p, prompt: q.prompt}); return pay ? 'yes' : 'no';
  };
  await event(restored, 'beginCombat', {player: restored.game.players[1]});
  assert.equal(asked.length, 0, 'another opponent is not enchanted');
  await event(restored, 'beginCombat', {player: target});
  assert.equal(asked.length, 1);
  assert.ok(asked[0].p === target, 'the payment question belongs to the enchanted player');
  assert.match(asked[0].prompt, /Overencumbered.*\{4\}/);
  assert.equal(target.pool.C, pay ? 0 : 4);
  assert.equal(restored.game.canAttackTarget(restored.game.byIid(f.attacker.iid), restored.a), pay);
  assert.equal(aura.zone, 'battlefield');
});

test('player-Aura saves preserve a legal self enchantment and independent opponent seats', async () => {
  const f = await enchantedTable('Curse of the Nightly Hunt', 0);
  const other = f.game.players[3];
  f.game.turnPlayer = f.a;
  f.decide = (p, q) => q.type === 'chooseTargets' && q.candidates.includes(other) ? [other] : undefined;
  const second = await play(f, 'Overencumbered');
  const snapshot = wire(M.captureGameState(f.game)), restored = setup('human', 3);
  M.restoreGameState(restored.game, snapshot);
  assert.ok(restored.game.byIid(f.aura.iid).meta.cursedPlayer === restored.a, 'a player Aura may enchant its own controller');
  assert.ok(restored.game.byIid(second.iid).meta.cursedPlayer === restored.game.players[3], 'independent Aura keeps its own host');
});

test('saved native Curses retain both Aura target formats and reward attacks on their enchanted player', async () => {
  for (const [name, subtype] of [['Curse of Opulence', 'Gold'], ['Curse of Disturbance', 'Zombie']]) {
    const f = await enchantedTable(name), restored = setup('human', 3);
    const row = f.snapshot.cards.find(c => c.iid === f.aura.iid);
    assert.equal(row.enchantedPlayer, f.target.idx, name + ' keeps its chosen seat');
    if (name === 'Curse of Disturbance') {
      assert.equal(f.aura.def.auraTarget, undefined, 'exercise the legacy isPlayerAura + targets format');
      assert.equal(f.aura.def.isPlayerAura, true);
    }
    M.restoreGameState(restored.game, f.snapshot);
    const target = restored.game.players[f.target.idx], attackingPlayer = restored.game.players[1];
    assert.ok(restored.game.byIid(f.aura.iid).meta.cursedPlayer === target);
    const attacker = body(restored, attackingPlayer);
    const rewardCount = player => restored.game.bf().filter(c => c.ctrl === player && c.isToken && c.hasSub(subtype)).length;
    attacker.attacking = restored.game.players[3];
    await event(restored, 'attackersDeclared', {player: attackingPlayer, attackers: [attacker]});
    assert.equal(rewardCount(restored.a), 0, 'attacking a different player does not trigger the Curse');
    attacker.attacking = target;
    await event(restored, 'attackersDeclared', {player: attackingPlayer, attackers: [attacker]});
    assert.equal(rewardCount(restored.a), 1, name + ' rewards its controller');
    assert.equal(rewardCount(attackingPlayer), 1, name + ' rewards the attacking opponent');
    assert.equal(rewardCount(target), 0, 'the enchanted player receives no attack reward');
  }
});

test('older player-Aura snapshots fail explicitly before changing the current board', async () => {
  const f = await enchantedTable(), restored = setup('human', 3);
  delete f.snapshot.cards.find(c => c.iid === f.aura.iid).enchantedPlayer;
  const before = M.gameStateFingerprint(restored.game);
  assert.throws(() => M.restoreGameState(restored.game, f.snapshot), /Overencumbered.*missing its enchanted player/);
  assert.equal(M.gameStateFingerprint(restored.game), before);
});

test('invalid enchanted-player records cannot change the current board', async () => {
  const f = await enchantedTable(), restored = setup('human', 3);
  const changes = [
    entry => { entry.enchantedPlayer = -1; },
    entry => { entry.enchantedPlayer = 4; },
    entry => { entry.enchantedPlayer = 1.5; },
    entry => { entry.enchantedPlayer = '2'; },
    entry => { entry.enchantedPlayer = 0; },
    entry => { entry.zone = 'hand'; },
    entry => { entry.attachedTo = f.attacker.iid; },
    (entry, snapshot) => { snapshot.players[entry.enchantedPlayer].lost = true; },
    entry => { entry.name = 'Grizzly Bears'; },
  ];
  for (const change of changes) {
    const snapshot = wire(f.snapshot), entry = snapshot.cards.find(c => c.iid === f.aura.iid);
    change(entry, snapshot);
    const before = M.gameStateFingerprint(restored.game);
    assert.throws(() => M.restoreGameState(restored.game, snapshot), /invalid enchanted player/);
    assert.equal(M.gameStateFingerprint(restored.game), before);
  }
});

test('an Aura outside the battlefield and an older unaffected board still restore', async () => {
  const f = setup('human', 3);
  const aura = card(f, 'Overencumbered', 'hand');
  const snapshot = wire(M.captureGameState(f.game)), restored = setup('human', 3);
  assert.equal(snapshot.cards.find(c => c.iid === aura.iid).enchantedPlayer, undefined);
  M.restoreGameState(restored.game, snapshot);
  assert.equal(restored.game.byIid(aura.iid).zone, 'hand');
});

test('face-down and transformed non-Auras do not need an enchanted-player field', () => {
  const f = setup('human', 3), hidden = card(f, 'Overencumbered');
  hidden.meta.faceDownDef = hidden.def;
  hidden.meta.faceDownKind = 'manifest';
  hidden.faceDown = true;
  hidden.def = f.game.faceDownCreatureDef('manifest');
  const transformed = card(f, 'Curse of Leeches // Leeching Lurker');
  assert.equal(M.OracleV8Faces.setFace(transformed, 'back'), true);
  f.game.recalc();
  const snapshot = wire(M.captureGameState(f.game)), restored = setup('human', 3);
  assert.ok(snapshot);
  M.restoreGameState(restored.game, snapshot);
  assert.equal(restored.game.byIid(hidden.iid).faceDown, true);
  assert.equal(restored.game.byIid(transformed.iid).oracleFace, 'back');
  assert.equal(restored.game.byIid(transformed.iid).hasSub('Aura'), false);
});

test('an already damaged Aura attachment cannot overwrite a good checkpoint', async () => {
  const f = await enchantedTable();
  delete f.aura.meta.cursedPlayer;
  assert.ok(M.gameStateSnapshotBlockers(f.game).some(reason => /enchanted player/.test(reason)));
  assert.equal(M.captureGameState(f.game), null);
});

test('AI simulations keep the enchanted player inside the cloned game', async () => {
  const f = await enchantedTable(), clone = M.cloneGameForAISimulation(f.game, 135);
  assert.ok(clone.byIid(f.aura.iid).meta.cursedPlayer === clone.players[f.target.idx]);
  assert.ok(clone.byIid(f.aura.iid).meta.cursedPlayer !== f.target);
  assert.ok(f.aura.meta.cursedPlayer === f.target);
});
