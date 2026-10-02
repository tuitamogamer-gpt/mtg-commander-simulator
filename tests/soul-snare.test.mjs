import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();

function table(role = 'human') {
  const game = new M.Game({ seed: 1002, paced: false });
  const decisions = [];
  const decide = async (g, q) => {
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min);
    if (q.type === 'chooseOption') return q.options.find(o => o.key === 'no')?.key || q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'priority') return { kind: 'pass' };
    return [];
  };
  const you = game.addPlayer('Defender', { name: 'Blame Game' }, { decide }, role === 'ai');
  const opponent = game.addPlayer('Attacker', { name: 'Opponent' }, { decide }, false);
  const other = game.addPlayer('Other defender', { name: 'Other' }, { decide }, false);
  const controller = role === 'ai' ? new M.AIController(you, { difficulty: 'hard' }) : { decide };
  you.controller = { decide: async (g, q) => {
    decisions.push(q);
    return controller.decide(g, q);
  } };
  game.turnPlayer = opponent;
  game.turnNo = 54;
  game.phase = 'combat';
  game.step = 'blockers';
  game.priorityRound = async () => {};
  game.combat = { attackers: [], defenderPlayers: [you, other], hadAttackers: true };
  const permanent = (p, nameOrDef) => {
    const def = typeof nameOrDef === 'string' ? M.DEFS[nameOrDef] : nameOrDef;
    const card = new M.CardInst(def, p);
    card.zone = 'battlefield';
    card.sick = false;
    game.battlefield.push(card);
    game.recalc();
    return card;
  };
  const attack = (destination = you, extra = {}) => {
    const card = permanent(opponent, {
      ...M.DEFS['Grizzly Bears'], name: 'Test attacker', ...extra,
    });
    card.attacking = destination;
    game.combat.attackers.push(card);
    return card;
  };
  const snare = permanent(you, 'Soul Snare');
  you.pool.W = 1;
  const entry = () => game.activatableList(you).find(e => e.card === snare);
  return { game, you, opponent, other, decisions, permanent, attack, snare, entry };
}

for (const role of ['human', 'ai']) {
  test(`${role}: Soul Snare announces an attacker before sacrificing and exiles it on resolution`, async () => {
    const f = table(role), attacker = f.attack();
    assert.ok(f.entry());
    assert.equal(await f.game.activateAbility(f.you, f.entry()), true);
    const ability = f.game.stack.find(so => so.kind === 'ability');
    assert.equal(ability.targets[0], attacker, 'the announced target is visible on the Stack');
    assert.equal(f.decisions.filter(q => q.type === 'chooseTargets').length, 1);
    assert.equal(f.snare.zone, 'graveyard');
    assert.equal(f.you.pool.W, 0);
    assert.equal(attacker.zone, 'battlefield', 'opponents may respond before exile');
    await f.game.resolveTop();
    assert.equal(attacker.zone, 'exile');
    assert.equal(f.game.combat.attackers.includes(attacker), false);
    assert.equal(f.decisions.filter(q => q.type === 'chooseTargets').length, 1, 'no new target at resolution');
  });
}

test('Soul Snare can target an attacker of a controlled planeswalker', async () => {
  const f = table(), walker = f.permanent(f.you, 'Jace, Mirror Mage');
  walker.counters.loyalty = 4;
  const attacker = f.attack(walker);
  assert.ok(f.entry());
  assert.equal(await f.game.activateAbility(f.you, f.entry()), true);
  assert.equal(f.game.stack[0].targets[0], attacker);
  await f.game.resolveTop();
  assert.equal(attacker.zone, 'exile');
  assert.equal(walker.counters.loyalty, 4);
});

test('Soul Snare retains its creature target when the attack is redirected to another controlled planeswalker', async () => {
  const f = table(), first = f.permanent(f.you, 'Jace, Mirror Mage');
  const second = f.permanent(f.you, 'Garruk, Primal Hunter');
  first.counters.loyalty = second.counters.loyalty = 4;
  const attacker = f.attack(first);
  assert.equal(await f.game.activateAbility(f.you, f.entry()), true);
  attacker.attacking = second;
  await f.game.resolveTop();
  assert.equal(attacker.zone, 'exile');
  assert.equal(second.counters.loyalty, 4);
});

test('Soul Snare only offers creatures attacking its controller or their planeswalker', () => {
  const f = table(), yours = f.attack();
  const walker = f.permanent(f.you, 'Jace, Mirror Mage');
  const atWalker = f.attack(walker);
  const theirWalker = f.permanent(f.other, 'Jace, Mirror Mage');
  theirWalker.counters.loyalty = 4;
  f.attack(f.other);
  f.attack(theirWalker);
  const battle = f.permanent(f.you, { ...M.DEFS['Grizzly Bears'], name: 'Test battle', types: ['Battle'] });
  f.attack(battle);
  f.permanent(f.opponent, 'Grizzly Bears');
  const entry = f.entry();
  assert.ok(entry.ability.targets?.length);
  assert.deepEqual(Array.from(f.game.legalTargets(entry.ability.targets[0], f.snare, f.you)), [yours, atWalker]);
});

for (const keyword of ['hexproof', 'shroud']) {
  test(`Soul Snare cannot pay or sacrifice for a sole ${keyword} attacker`, async () => {
    const f = table();
    f.attack(f.you, { kws: [keyword] });
    assert.ok(!f.entry());
    const retained = { card: f.snare, ability: f.snare.def.abilities[0], idx: 0 };
    assert.equal(await f.game.activateAbility(f.you, retained), false);
    assert.equal(f.snare.zone, 'battlefield');
    assert.equal(f.you.pool.W, 1);
    assert.equal(f.game.stack.length, 0);
  });
}

test('Soul Snare respects protection from white', () => {
  const f = table(), attacker = f.attack();
  attacker.cur.protectionFrom = [(g, source) => source.colors.includes('W')];
  assert.ok(!f.entry());
});

test('Soul Snare cannot activate without white mana or a legal attacker', () => {
  const f = table();
  assert.ok(!f.entry());
  const attacker = f.attack(f.other);
  assert.ok(!f.entry());
  attacker.attacking = f.you;
  f.you.pool.W = 0;
  assert.ok(!f.entry());
  f.permanent(f.you, 'Plains');
  assert.ok(f.entry(), 'automatic mana may use an untapped Plains');
});

test('cancelling target selection keeps Soul Snare and its mana', async () => {
  const f = table();
  f.attack();
  f.you.controller = { decide: async () => [] };
  assert.equal(await f.game.activateAbility(f.you, f.entry()), false);
  assert.equal(f.snare.zone, 'battlefield');
  assert.equal(f.you.pool.W, 1);
  assert.equal(f.game.stack.length, 0);
});

for (const change of ['remove from combat', 'gain hexproof', 'bounce and return']) {
  test(`Soul Snare revalidates its announced target after ${change}`, async () => {
    const f = table(), attacker = f.attack(), survivor = f.attack();
    assert.equal(await f.game.activateAbility(f.you, f.entry()), true);
    if (change === 'remove from combat') f.game.removeFromCombat(attacker);
    if (change === 'gain hexproof') attacker.cur.kw.add('hexproof');
    if (change === 'bounce and return') {
      await f.game.move(attacker, 'hand');
      await f.game.putPermanentOntoBattlefield(attacker, f.opponent);
      attacker.attacking = f.you;
    }
    await f.game.resolveTop();
    assert.equal(attacker.zone, 'battlefield');
    assert.equal(survivor.zone, 'battlefield', 'the ability cannot choose another attacker');
    assert.equal(f.snare.zone, 'graveyard');
  });
}

for (const change of ['leave', 'change controller', 'blink', 'phase out']) {
  test(`Soul Snare fails when the attacked planeswalker ${change}`, async () => {
    const f = table(), walker = f.permanent(f.you, 'Jace, Mirror Mage');
    walker.counters.loyalty = 4;
    const attacker = f.attack(walker);
    assert.ok(f.entry());
    assert.equal(await f.game.activateAbility(f.you, f.entry()), true);
    if (change === 'leave') await f.game.move(walker, 'graveyard');
    if (change === 'change controller') walker.ctrl = f.other;
    if (change === 'phase out') walker.phasedOut = true;
    if (change === 'blink') {
      await f.game.move(walker, 'exile');
      await f.game.putPermanentOntoBattlefield(walker, f.you);
      walker.counters.loyalty = 4;
    }
    await f.game.resolveTop();
    assert.equal(attacker.zone, 'battlefield');
    assert.equal(f.snare.zone, 'graveyard');
  });
}

test('Soul Snare triggers ward and is countered when its controller declines payment', async () => {
  const f = table(), attacker = f.attack(f.you, { ward: { mana: '{2}' } });
  assert.equal(await f.game.activateAbility(f.you, f.entry()), true);
  assert.equal(f.game.stack.length, 2, 'ward is above the targeted ability');
  await f.game.resolveTop();
  assert.equal(f.game.stack.length, 0);
  assert.equal(attacker.zone, 'battlefield');
  assert.equal(f.snare.zone, 'graveyard', 'ward does not refund the sacrifice');
});
