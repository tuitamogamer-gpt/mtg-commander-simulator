import assert from 'node:assert/strict';
export async function untapStep(game, player) {
  const stop = Symbol('after real untap'), emit = game.emit;
  game.turnPlayer = player;
  game.emit = async function (event, ...args) { if (event === 'upkeep') throw stop; return emit.call(this, event, ...args); };
  try { await game.runTurn(); assert.fail('untap proof must reach upkeep'); } catch (error) { if (error !== stop) throw error; } finally { game.emit = emit; }
}
export async function phasingKeywordProof(M, entry, role, h) {
  const ctx = h.gameFor(M, [h.decision(), h.decision()], { ai: role === 'ai' }), { game, a, b } = ctx;
  h.assertControllerRole(M, ctx, entry.raw.name + '/' + role + '/phasing');
  h.fund(a); h.fillLibrary(M, a, 10); h.fillLibrary(M, b, 10);
  const source = h.zoneCard(M, a, entry.raw.name, 'hand');
  const grant = entry.implementation.find(operation => operation.kind === 'attachment-grant' && operation.keywords?.includes('phasing'));
  const host = grant ? h.permanent(M, game, a, 'Grizzly Bears') : source;
  if (source.is('Land')) assert.equal(await game.playLand(a, source), true);
  else { assert.equal(await game.castSpell(a, source, { from: 'hand' }), true); await h.resolveAll(game); }
  if (grant) assert.equal(source.attachedTo, host.iid);
  assert.equal(host.kw('phasing'), true);
  const version = host.zoneVersion; host.tapped = true; game.addCounters(host, 'charge', 2);
  await untapStep(game, a); assert.equal(host.phasedOut, true); assert.equal(host.tapped, true); assert.equal(game.bf().includes(host), false);
  await untapStep(game, b); assert.equal(host.phasedOut, true);
  await untapStep(game, a); assert.equal(host.phasedOut, false); assert.equal(host.tapped, false); assert.equal(host.zoneVersion, version); assert.equal(host.counters.charge, 2);
  if (grant) { assert.equal(source.phasedOut, false); assert.equal(source.attachedTo, host.iid); }
  return 10;
}
