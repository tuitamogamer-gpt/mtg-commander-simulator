import assert from 'node:assert/strict';

// Each imported Aura is cast with its real targets and mana cost. The opponent
// then casts a paid removal spell, so the return of control is also observed
// through an ordinary resolving spell rather than a fabricated attachment.
export async function auraControlProof(MTG, entry, operation, role, helpers) {
  assert.equal(operation.kind, 'aura-control-v8');
  let host, source;
  const context = helpers.gameFor(MTG, [helpers.decision({chooseTargets: (game, query) => query.candidates.includes(host) ? [host] : query.candidates.slice(0, query.min || 1)}),
    helpers.decision({chooseTargets: (game, query) => query.candidates.includes(source) ? [source] : query.candidates.slice(0, query.min || 1)})], {ai: role === 'ai'});
  helpers.assertControllerRole?.(MTG, context, entry.raw.name + '/' + role);
  const {game, a, b} = context, target = entry.implementation.find(op => op.kind === 'aura-target');
  assert.ok(target, entry.raw.name + ': Aura has its printed enchant restriction');
  host = helpers.stageGenericTarget(MTG, context, {what: target.what, zone: 'battlefield', controller: 'opponent'}, 'control-host');
  const originalController = host.ctrl, originalOwner = host.owner;
  for (const player of game.players) {helpers.fund(player, 100); helpers.fillLibrary(MTG, player, 20);}
  helpers.stageCardCosts?.(MTG, context, entry);
  source = helpers.zoneCard(MTG, a, entry.raw.name, 'hand');
  const pool = player => Object.values(player.pool).reduce((sum, n) => sum + Number(n), 0);
  const beforeMana = pool(a);
  assert.equal(await game.castSpell(a, source, {from: 'hand'}), true, entry.raw.name + ': actual Aura cast');
  await helpers.resolveAll(game);
  assert.ok(pool(a) < beforeMana, entry.raw.name + ': printed mana paid');
  assert.equal(source.zone, 'battlefield'); assert.equal(source.attachedTo, host.iid);
  assert.equal(host.ctrl, a, entry.raw.name + ': continuous control applies to the enchanted object');
  assert.equal(host.owner, originalOwner, entry.raw.name + ': ownership is unchanged');
  assert.equal(source.ctrl, a); assert.equal(source.meta.oracleAuraControlAttachment.hostVersion, host.zoneVersion);
  const removal = helpers.zoneCard(MTG, b, 'Disenchant', 'hand');
  game.turnPlayer = b; game.phase = 'main1';
  const opponentMana = pool(b);
  assert.equal(await game.castSpell(b, removal, {from: 'hand'}), true, entry.raw.name + ': opposing removal is cast');
  await helpers.resolveAll(game);
  assert.ok(pool(b) < opponentMana, entry.raw.name + ': opposing removal pays mana');
  assert.equal(source.zone, 'graveyard'); assert.equal(removal.zone, 'graveyard');
  assert.equal(host.ctrl, originalController, entry.raw.name + ': removing the Aura restores prior control');
  assert.equal(host.owner, originalOwner); assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
  return 8;
}
