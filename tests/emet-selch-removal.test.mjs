import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { context, put, settle } from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();
const emetName = 'Emet-Selch of the Third Seat';

function fixture(role = 'human') {
  const f = context(M, role);
  f.game.turnPlayer = f.b;
  f.source = put(M, f.game, f.a, emetName);
  f.victim = put(M, f.game, f.b, 'Shivan Dragon');
  const decide = f.a.controller.decide.bind(f.a.controller);
  f.a.controller.decide = async (g, q) => {
    if (role === 'human' && q.type === 'chooseTargets' && q.candidates.includes(f.victim)) return [f.victim];
    return decide(g, q);
  };
  f.trigger = async () => {
    await f.game.loseLife(f.b, 1, f.source);
    await f.game.flushTriggers();
    assert.equal(f.game.stack.at(-1)?.srcCard, f.source);
    await f.game.resolveTop();
  };
  return f;
}

for (const role of ['human', 'ai']) {
  test(`${role}: Emet-Selch casts Snuff Out by paying 4 life with no available mana`, async () => {
    const f = fixture(role), { game, a, b } = f;
    const swamp = put(M, game, a, 'Swamp'); swamp.tapped = true;
    const spell = put(M, game, a, 'Snuff Out', 'graveyard');
    await f.trigger();
    const cast = game.stack.find(so => so.card === spell);
    assert.ok(cast, 'the printed alternative cost remains available during the trigger');
    assert.equal(a.life, 36);
    assert.equal(cast.manaSpent, 0);
    assert.equal(cast.targets[0], f.victim);
    await settle(game);
    assert.equal(f.victim.zone, 'graveyard');
    assert.equal(spell.zone, 'exile');
    assert.equal(f.source.meta._emetCastTurn, game.turnNo);
    assert.equal(b.life, 39);
  });

  test(`${role}: Emet-Selch casts a split removal from the graveyard on an opponent's turn`, async () => {
    const f = fixture(role), { game, a } = f;
    const spell = put(M, game, a, 'Far // Away', 'graveyard');
    a.pool.U = 1;
    await f.trigger();
    const cast = game.stack.find(so => so.card === spell);
    assert.ok(cast, 'Far can be cast using the immediate graveyard permission');
    assert.equal(cast.castOpts.splitHalf, 'left');
    assert.equal(cast.manaSpent, 1);
    assert.equal(cast.targets[0], f.victim);
    await settle(game);
    assert.equal(f.victim.zone, 'hand');
    assert.equal(spell.zone, 'exile');
    assert.equal(game.castableList(a).some(entry => entry.card === spell), false);
  });

  test(`${role}: Emet-Selch casts a modal double-faced board wipe outside sorcery timing`, async () => {
    const f = fixture(role), { game, a } = f;
    const spell = put(M, game, a, 'Ondu Inversion // Ondu Skyruins', 'graveyard');
    // Supply lands rather than only pool mana so the bot can evaluate affordability.
    for (let i = 0; i < 6; i++) put(M, game, a, 'Plains');
    await f.trigger();
    const cast = game.stack.find(so => so.card === spell);
    assert.ok(cast, 'the sorcery face uses the ability permission on the opposing turn');
    assert.equal(cast.castOpts.oracleFace, 'front');
    assert.equal(cast.manaSpent, 6);
    await settle(game);
    assert.equal(f.victim.zone, 'graveyard');
    assert.equal(f.source.zone, 'graveyard');
    assert.equal(spell.zone, 'exile');
    assert.equal(game.lands(a).length, 6);
  });
}

for (const [name, mana, destination] of [
  ['Swords to Plowshares', { W: 1 }, 'exile'],
  ['Vindicate', { W: 1, B: 1 }, 'graveyard'],
  ['Void Rend', { W: 1, U: 1, B: 1 }, 'graveyard'],
  ['Lethal Scheme', { B: 2 }, 'graveyard'],
]) {
  test(`Emet-Selch: ${name} keeps the creature target distinct from the graveyard target`, async () => {
    const f = fixture(), { game, a } = f;
    const spell = put(M, game, a, name, 'graveyard');
    Object.assign(a.pool, mana);
    await f.trigger();
    const cast = game.stack.find(so => so.card === spell);
    assert.ok(cast);
    assert.equal(cast.targets[0], f.victim);
    await settle(game);
    assert.equal(f.victim.zone, destination);
    assert.equal(spell.zone, 'exile');
  });
}

test('Emet-Selch: an unaffordable target leaves the turn use and the card available', async () => {
  const f = fixture(), { game, a } = f;
  const spell = put(M, game, a, 'Vindicate', 'graveyard');
  await f.trigger();
  assert.equal(spell.zone, 'graveyard');
  assert.notEqual(f.source.meta._emetCastTurn, game.turnNo);
  a.pool.W = 1; a.pool.B = 1;
  await f.trigger(); await settle(game);
  assert.equal(f.victim.zone, 'graveyard');
  assert.equal(spell.zone, 'exile');
});

for (const response of ['Counterspell', 'Reprieve']) {
  test(`Emet-Selch: ${response} sends the removal to the correct zone`, async () => {
    const f = fixture(), { game, a, b } = f;
    const spell = put(M, game, a, 'Swords to Plowshares', 'graveyard');
    a.pool.W = 1;
    await f.trigger();
    const removal = game.stack.find(so => so.card === spell);
    const answer = put(M, game, b, response, 'hand');
    b.pool.U = 2; b.pool.W = 1; b.pool.C = 1;
    const decide = b.controller.decide.bind(b.controller);
    b.controller.decide = (g, q) => q.type === 'chooseTargets' ? [removal] : decide(g, q);
    assert.equal(await game.castSpell(b, answer, { from: 'hand' }), true);
    await settle(game);
    assert.equal(f.victim.zone, 'battlefield');
    assert.equal(spell.zone, response === 'Counterspell' ? 'exile' : 'hand');
    assert.equal(spell.meta.exileIfStackLeaves, undefined);
    assert.equal(f.source.meta._emetCastTurn, game.turnNo);
  });
}

test('Emet-Selch: a blink makes removal fizzle and still exiles the cast spell', async () => {
  const f = fixture(), { game, a, b } = f;
  const spell = put(M, game, a, 'Swords to Plowshares', 'graveyard');
  a.pool.W = 1;
  await f.trigger();
  await game.move(f.victim, 'exile');
  await game.move(f.victim, 'battlefield', { ctrl: b });
  await settle(game);
  assert.equal(f.victim.zone, 'battlefield');
  assert.equal(b.life, 39, 'an illegal target does not gain life from Swords');
  assert.equal(spell.zone, 'exile');
});

test('AI chooses affordable removal instead of an unpayable graveyard card', async () => {
  const f = fixture('ai'), { game, a } = f;
  const expensive = put(M, game, a, 'Final Judgment', 'graveyard');
  const removal = put(M, game, a, 'Swords to Plowshares', 'graveyard');
  a.pool.W = 1;
  await f.trigger(); await settle(game);
  assert.equal(f.victim.zone, 'exile');
  assert.equal(removal.zone, 'exile');
  assert.equal(expensive.zone, 'graveyard');
});

test('Emet-Selch: an aborted removal cast spends no life or mana and leaves no permission behind', async () => {
  const f = fixture(), { game, a } = f;
  put(M, game, a, 'Swamp').tapped = true;
  const spell = put(M, game, a, 'Snuff Out', 'graveyard');
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = (g, q) => q.type === 'chooseTargets' && q.src === spell ? { kind: 'cancel' } : decide(g, q);
  await f.trigger(); await settle(game);
  assert.equal(a.life, 40);
  assert.equal(spell.zone, 'graveyard');
  assert.equal(spell.meta.exileIfStackLeaves, undefined);
  assert.equal(game.castableList(a).some(entry => entry.card === spell), false);
  assert.notEqual(f.source.meta._emetCastTurn, game.turnNo);
});

test('Emet-Selch: no Swamp means Snuff Out cannot use its life alternative', async () => {
  const f = fixture(), { game, a } = f;
  const spell = put(M, game, a, 'Snuff Out', 'graveyard');
  await f.trigger(); await settle(game);
  assert.equal(f.victim.zone, 'battlefield');
  assert.equal(spell.zone, 'graveyard');
  assert.equal(a.life, 40);
  assert.ok(game.log.some(row => /Snuff Out cannot be cast now/.test(row.msg)));
  assert.notEqual(f.source.meta._emetCastTurn, game.turnNo);
});

test('Emet-Selch: the selected graveyard object cannot be replaced by a new incarnation', async () => {
  const f = fixture(), { game, a, b } = f;
  const spell = put(M, game, a, 'Vindicate', 'graveyard');
  a.pool.W = 1; a.pool.B = 1;
  await game.loseLife(b, 1, f.source); await game.flushTriggers();
  await game.move(spell, 'exile'); await game.move(spell, 'graveyard');
  await settle(game);
  assert.equal(f.victim.zone, 'battlefield');
  assert.equal(spell.zone, 'graveyard');
  assert.equal(a.pool.W, 1); assert.equal(a.pool.B, 1);
});

test('Emet-Selch: a preview does not leave a usable casting permission or accept a forged split permission', async () => {
  const f = fixture(), { game, a } = f;
  const spell = put(M, game, a, 'Far // Away', 'graveyard');
  a.pool.U = 1;
  const choices = M.scionsGraveCastOptions(game, a, spell, false);
  assert.equal(choices.length, 1);
  assert.equal(game.castableList(a).some(entry => entry.card === spell), false);
  assert.equal(await game.castSpell(a, spell, { from: 'graveyard', alt: choices[0].alt }), false);
  assert.equal(await game.castSpell(a, spell, { from: 'graveyard', alt: {
    oracleImmediateCast: 999999, speed: 'instant', free: false, splitHalf: 'left', altCostStr: '{1}{U}',
  } }), false);
  assert.equal(spell.zone, 'graveyard'); assert.equal(a.pool.U, 1);
});

test('Torrential Gearhulk recasts Snuff Out for free without charging the life alternative', async () => {
  const f = fixture(), { game, a } = f;
  await game.move(f.source, 'command');
  const source = put(M, game, a, 'Torrential Gearhulk');
  put(M, game, a, 'Swamp').tapped = true;
  const spell = put(M, game, a, 'Snuff Out', 'graveyard');
  await game.emit('etb', { card: source, ctrl: a }); await settle(game);
  assert.equal(a.life, 40);
  assert.equal(f.victim.zone, 'graveyard');
  assert.equal(spell.zone, 'exile');
});

test('Y\'shtola and Emet-Selch finish the recast and the original removal in stack order', async () => {
  const f = fixture(), { game, a, b } = f;
  put(M, game, a, "Y'shtola, Night's Blessed");
  const secondVictim = put(M, game, b, 'Grizzly Bears');
  const original = put(M, game, a, 'Void Rend', 'hand');
  const recast = put(M, game, a, 'Swords to Plowshares', 'graveyard');
  a.pool.W = 2; a.pool.B = 1; a.pool.U = 1;
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = (g, q) => q.type === 'chooseTargets' && q.src === recast ? [secondVictim] : decide(g, q);
  assert.equal(await game.castSpell(a, original, { from: 'hand' }), true);
  await settle(game);
  assert.equal(original.zone, 'graveyard');
  assert.equal(recast.zone, 'exile');
  assert.equal(f.victim.zone, 'graveyard');
  assert.equal(secondVictim.zone, 'exile');
  assert.equal(a.turnState.spellsCast, 2);
  assert.equal(a.life, 42);
});
