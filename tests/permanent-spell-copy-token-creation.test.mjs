import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();
const total = player => Object.values(player.pool).reduce((sum, value) => sum + value, 0);
async function cast(f, name) {
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) f.a.pool[color] = 30;
  const card = put(M, f.game, f.a, name, 'hand'), before = total(f.a);
  assert.equal(await f.game.castSpell(f.a, card, {from: 'hand'}), true, name + ': real paid cast');
  assert.ok(total(f.a) < before, name + ': mana paid');
  return card;
}

for (const role of ['human', 'ai']) test(`${role}: a copied permanent spell enters without creating a token; a paid copy effect still creates tokens`, async () => {
  const f = context(M, role), {game, a, b} = f;
  for (const name of ['Chatterfang, Squirrel General', 'Parallel Lives', 'Mirkwood Bats', 'Soul Warden', 'Gandalf, Westward Voyager']) {
    await cast(f, name); await settle(game);
  }
  // The real Gandalf cast trigger sees a matching public revealed card and
  // copies the paid creature spell before either permanent enters.
  put(M, game, b, 'Grizzly Bears', 'library');
  const events = [], emit = game.emit.bind(game);
  game.emit = async (name, data) => { if (['tokenCreated', 'tokensCreated', 'etb'].includes(name)) events.push({name, data}); return emit(name, data); };
  const before = {created: a.turnState.tokensCreated, ownLife: a.life, opposingLife: b.life};
  const dragon = await cast(f, 'Shivan Dragon');
  await game.flushTriggers();
  assert.ok(game.stack.some(so => so.srcCard?.name === 'Gandalf, Westward Voyager'));
  await game.resolveTop();
  const copy = game.stack.find(so => so.isCopy);
  assert.ok(copy, 'Gandalf produced an actual permanent spell copy on the Stack');
  await settle(game);
  const copied = game.bf().filter(card => card.isToken && card.name === dragon.name);
  assert.equal(copied.length, 1, 'creation doublers cannot duplicate a resolving permanent spell copy');
  assert.equal(game.bf().filter(card => card.isToken && card.hasSub('Squirrel')).length, 0);
  assert.equal(a.turnState.tokensCreated, before.created);
  assert.equal(events.filter(row => ['tokenCreated', 'tokensCreated'].includes(row.name)).length, 0);
  assert.equal(events.filter(row => row.name === 'etb' && row.data.card === copied[0]).length, 1);
  assert.equal(a.life, before.ownLife + 2, 'both physical and copied creatures trigger Soul Warden');
  assert.equal(b.life, before.opposingLife, 'Mirkwood Bats cannot see token creation');

  const start = {created: a.turnState.tokensCreated, ownLife: a.life, opposingLife: b.life, events: events.length};
  const spell = await cast(f, 'Cackling Counterpart');
  const target = game.stack.find(so => so.card === spell).targets[0];
  assert.ok(target?.is('Creature') && target.ctrl === a, 'the seat selected its legal copy target');
  await settle(game);
  const creation = events.slice(start.events).filter(row => row.name === 'tokenCreated');
  assert.equal(creation.length, 4, 'ordinary token creation still gets both replacements');
  assert.equal(creation.filter(row => row.data.token.hasSub('Squirrel') && !row.data.token.isCopyOf).length, 2);
  assert.equal(creation.filter(row => row.data.token.name === target.name).length, 2);
  assert.equal(a.turnState.tokensCreated, start.created + 4);
  assert.equal(a.life, start.ownLife + 4);
  assert.equal(b.life, start.opposingLife - 4);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
});

for (const role of ['human', 'ai']) test(`${role}: a copied player Aura keeps its announced target during entry without choosing again`, async () => {
  const f = context(M, role), {game, a} = f;
  const source = await cast(f, 'Curse of Clinging Webs');
  const original = game.stack.find(so => so.card === source), target = original.targets[0];
  assert.ok(target instanceof M.Player);
  await game.copySpell(original, a, {mayNewTargets: false});
  const before = f.trace.length, entries = [], emit = game.emit.bind(game);
  game.emit = async (name, data) => {
    if (name === 'etb' && data.card.isToken) entries.push({card: data.card, player: data.card.meta.cursedPlayer});
    return emit(name, data);
  };
  await settle(game);
  assert.equal(entries.length, 1); assert.ok(entries[0].player === target, 'the ETB event sees the announced player');
  assert.ok(entries[0].card.meta.cursedPlayer === target, 'the copy keeps its announced player after resolving');
  assert.equal(f.trace.slice(before).filter(row => row.q.aiHint?.kind === 'auraHost').length, 0);
});
