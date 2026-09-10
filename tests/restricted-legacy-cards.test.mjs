import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, play, activate, settle, mana, fuel} from './helpers/c21-fixtures.mjs';

const target = (f, value) => {f.decide = (_, q) => q.type === 'chooseTargets' ? [value] : undefined;};
const hit = (f, src, player, n, combat = false) => f.game.damagePlayer(src, player, n, {combat});
const shield = (f, p = f.a) => card(f, 'Indomitable Ancients', 'battlefield', p);
const walk = (f, p = f.a) => {const c = card(f, 'Jace, Mirror Mage', 'battlefield', p); c.counters.loyalty = 8; return c;};

for (const role of ['human', 'ai']) {
  test(`${role}: Boros Reckoner pays hybrid mana and deals the actual received damage`, async () => {
    const f = setup(role), source = body(f, f.b); target(f, f.b);
    const c = await play(f, 'Boros Reckoner');
    await activate(f, c); assert.equal(c.kw('first strike'), true);
    await f.game.damageCreature(source, c, 2); await settle(f.game);
    assert.equal(f.b.life, 38); assert.equal(c.damage, 2);
  });
  test(`${role}: Darien makes one white Soldier for each damage dealt, including noncombat damage`, async () => {
    const f = setup(role), source = body(f, f.b);
    f.decide = (_, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'yes') ? 'yes' : undefined;
    await play(f, 'Darien, King of Kjeldor'); await hit(f, source, f.a, 3); await settle(f.game);
    const tokens = f.game.creatures(f.a).filter(c => c.isToken);
    assert.equal(tokens.length, 3);
    for (const c of tokens) {assert.equal(c.power, 1); assert.equal(c.toughness, 1); assert.equal(c.hasSub('Soldier'), true); assert.ok(c.colors.includes('W'));}
  });
  test(`${role}: Feather copies a targeted spell only after paying two additional mana`, async () => {
    const f = setup(role), extra = body(f), c = await play(f, 'Feather, Radiant Arbiter');
    f.decide = (_, q) => q.type === 'chooseTargets' ? [c] : q.type === 'chooseCards' ? [extra] : undefined;
    const spell = await play(f, 'Giant Growth');
    assert.equal(spell.castMeta.manaSpent, 1); assert.equal(mana(f.a), 177);
    assert.equal(extra.power, 5); assert.equal(c.power, 7);
    assert.equal(f.a.turnState.spellsCast, 2, 'copies are not cast');
    assert.equal(c.kw('flying'), true); assert.equal(c.kw('lifelink'), true);
  });
  test(`${role}: Fiendish Duo doubles opponents' damage without doubling damage to its controller or creatures`, async () => {
    const f = setup(role), source = shield(f), victim = shield(f, f.b);
    const duo = await play(f, 'Fiendish Duo'); assert.equal(duo.kw('first strike'), true);
    assert.equal(await hit(f, source, f.b, 3), 6);
    assert.equal(await hit(f, source, f.a, 3), 3);
    assert.equal(await f.game.damageCreature(source, victim, 3), 3);
  });
  test(`${role}: Gideon's Sacrifice chooses without targeting and redirects player and permanent damage`, async () => {
    const f = setup(role), chosen = shield(f), other = shield(f), pw = walk(f), source = shield(f, f.b);
    f.decide = (_, q) => q.type === 'chooseCards' ? [chosen] : undefined;
    const spell = await play(f, "Gideon's Sacrifice"); assert.equal(spell.def.targets, undefined);
    await hit(f, source, f.a, 2); await f.game.damageCreature(source, other, 2); await f.game.damageCreature(source, pw, 2);
    assert.equal(f.a.life, 40); assert.equal(other.damage, 0); assert.equal(pw.counters.loyalty, 8); assert.equal(chosen.damage, 6);
    await f.game.move(chosen, 'exile'); await f.game.putPermanentOntoBattlefield(chosen, f.a);
    assert.equal(await hit(f, source, f.a, 1), 1, 'a returned physical card is a new object');
  });
  test(`${role}: Havoc Eater targets up to one creature per opponent and sums their powers`, async () => {
    const f = setup(role), b = body(f, f.b), c = body(f, f.others[1]);
    f.game.addCounters(b, '+1/+1', 1); f.game.recalc();
    f.decide = (_, q) => q.type === 'chooseTargets' ? q.candidates.slice(0, 1) : undefined;
    const eater = await play(f, 'Havoc Eater');
    assert.equal(eater.counters['+1/+1'], 5); assert.ok(f.game.isGoaded(b)); assert.ok(f.game.isGoaded(c));
    assert.equal(eater.kw('flying'), true);
  });
  test(`${role}: Hot Pursuit's goad ends with its source while suspicion remains`, async () => {
    const f = setup(role), b = body(f, f.b); target(f, b);
    const c = await play(f, 'Hot Pursuit'); assert.equal(b.meta.suspected, true); assert.ok(f.game.isGoaded(b));
    await f.game.move(c, 'graveyard'); assert.equal(f.game.isGoaded(b), false); assert.equal(b.meta.suspected, true);
    assert.equal(b.kw('menace'), true); assert.equal(f.game.canBlock(b, body(f)), false);
  });
  test(`${role}: Immortal Obligation applies a duty counter, goad, attack and block restrictions for that duration`, async () => {
    const f = setup(role), c = card(f, 'Grizzly Bears', 'graveyard', f.b), own = body(f), pw = walk(f); target(f, c);
    await play(f, 'Immortal Obligation');
    assert.equal(c.zone, 'battlefield'); assert.equal(c.ctrl, f.b); assert.equal(c.counters.duty, 1); assert.ok(f.game.isGoaded(c));
    assert.equal(f.game.canAttackTarget(c, f.a), false); assert.equal(f.game.canAttackTarget(c, pw), false);
    assert.equal(f.game.canBlock(c, own), false); assert.equal(f.game.canAttackTarget(c, f.others[1]), true);
    f.game.removeCounters(c, 'duty', 1); f.game.addCounters(c, 'duty', 1); f.game.recalc();
    assert.equal(f.game.isGoaded(c), false, 'adding a later duty counter cannot restart the expired effect');
    assert.equal(f.game.canAttackTarget(c, f.a), true); assert.equal(f.game.canBlock(c, own), true);
  });
  test(`${role}: Labyrinth produces colorless mana and pays four plus tapping to remove a blocker`, async () => {
    const f = setup(role), c = card(f, 'Labyrinth of Skophos', 'hand');
    assert.equal(await f.game.playLand(f.a, c), true);
    for (const k of Object.keys(f.a.pool)) f.a.pool[k] = 0;
    assert.equal(await f.game.payMana(f.a, M.parseCost('{C}')), true); assert.equal(c.tapped, true); f.game.untap(c);
    const attacker = body(f), blocker = body(f, f.b); attacker.attacking = f.b; blocker.blocking = attacker;
    attacker.blockedBy = [blocker]; attacker.wasBlocked = true; f.game.combat = {attackers: [attacker], defenderPlayers: [f.b]};
    target(f, blocker); await activate(f, c);
    assert.equal(blocker.blocking, null); assert.equal(attacker.blockedBy.length, 0); assert.equal(c.tapped, true);
    assert.equal(mana(f.a), 176);
  });
  test(`${role}: Loran destroys an optional target and both chosen players draw`, async () => {
    const f = setup(role), artifact = card(f, 'Sol Ring', 'battlefield', f.b); target(f, artifact);
    const c = await play(f, 'Loran of the Third Path'); assert.equal(artifact.zone, 'graveyard'); assert.ok(c.kw('vigilance'));
    c.sick = false; target(f, f.b); await activate(f, c);
    assert.equal(f.a.hand.length, 1); assert.equal(f.b.hand.length, 1); assert.equal(c.tapped, true);
  });
  test(`${role}: Mob Verdict keeps votes secret, accepts nontargeted player choices and resolves each vote`, async () => {
    const f = setup(role), logs = [], victims = [body(f, f.b), body(f, f.others[1])];
    const lg = f.game.lg.bind(f.game); f.game.lg = (msg, ...args) => {logs.push(msg); return lg(msg, ...args);};
    let decisions = 0;
    f.decide = (p, q) => {
      if (q.prompt?.startsWith('Mob Verdict:')) {
        assert.equal(q.type, 'chooseOption'); assert.equal(q.aiHint.secret, true);
        assert.equal(logs.some(s => /votes against/.test(s)), false); decisions++;
        return String((p.idx + 1) % f.game.players.length);
      }
    };
    await play(f, 'Mob Verdict'); assert.equal(decisions, 3);
    assert.equal(f.a.hand.length, 1); assert.equal(f.b.life, 38); assert.equal(f.others[1].life, 38);
    assert.ok(victims.every(c => c.zone === 'graveyard'));
  });
  test(`${role}: Nelly suspects on attack and draws once per opposing controller per simultaneous combat damage event`, async () => {
    const f = setup(role), b = body(f, f.b), b2 = body(f, f.b), c = body(f, f.others[1]);
    const nelly = await play(f, 'Nelly Borca, Impulsive Accuser'); target(f, b);
    await f.game.emit('attacks', {card: nelly, player: f.a, defender: f.b}); await settle(f.game);
    assert.equal(b.meta.suspected, true); assert.ok(f.game.isGoaded(b)); assert.ok(nelly.kw('vigilance'));
    await f.game.damageBatch([{src: b, target: f.others[1], n: 1}, {src: b2, target: f.others[1], n: 1}], {combat: true});
    await settle(f.game); assert.equal(f.a.hand.length, 1); assert.equal(f.b.hand.length, 1);
    await f.game.damageBatch([{src: b, target: f.others[1], n: 1}, {src: c, target: f.b, n: 1}], {combat: true});
    await settle(f.game); assert.equal(f.a.hand.length, 3); assert.equal(f.b.hand.length, 2); assert.equal(f.others[1].hand.length, 1);
    await hit(f, b, f.a, 1, true); await settle(f.game); assert.equal(f.a.hand.length, 3);
  });
  test(`${role}: Otherworldly Escort returns as a Spirit with entry counters, pays its charge cost and stays dead the second time`, async () => {
    const f = setup(role), offender = shield(f, f.b), innocent = body(f, f.b);
    const c = await play(f, 'Otherworldly Escort'); assert.ok(c.kw('flash'));
    await f.game.destroy(c); await settle(f.game);
    assert.equal(c.zone, 'battlefield'); assert.equal(c.hasSub('Spirit'), true); assert.equal(c.hasSub('Detective'), true); assert.equal(c.hasSub('Human'), false); assert.equal(c.counters.charge, 4);
    await hit(f, offender, f.a, 1); await settle(f.game); c.sick = false;
    assert.deepEqual(Array.from(f.game.legalTargets(c.def.abilities[0].targets[0], c, f.a)), [offender]);
    target(f, offender); fuel(f.a);
    const entry = f.game.activatableList(f.a).find(e => e.card === c); assert.ok(entry);
    assert.equal(await f.game.activateAbility(f.a, entry), true); assert.equal(c.counters.charge, 3, 'cost is paid before resolution');
    await settle(f.game); assert.equal(offender.zone, 'graveyard'); assert.equal(innocent.zone, 'battlefield');
    await f.game.destroy(c); await settle(f.game); assert.equal(c.zone, 'graveyard');
  });
  for (const choices of [['silence', 'silence'], ['snitch', 'snitch'], ['silence', 'snitch']]) {
    test(`${role}: Prisoner's Dilemma resolves secret choices ${choices.join('/')}`, async () => {
      const f = setup(role);
      f.decide = (p, q) => q.aiHint?.kind === 'dilemma' ? choices[p.idx - 1] : undefined;
      await play(f, "Prisoner's Dilemma");
      assert.equal(f.b.life, choices.every(k => k === 'silence') ? 36 : choices.every(k => k === 'snitch') ? 32 : 28);
      assert.equal(f.others[1].life, choices.every(k => k === 'silence') ? 36 : choices.every(k => k === 'snitch') ? 32 : 40);
    });
  }
  test(`${role}: Redemption Arc enchants its controller's creature and exiles it with a paid ability`, async () => {
    const f = setup(role), c = body(f); target(f, c);
    const aura = await play(f, 'Redemption Arc'); assert.equal(aura.attachedTo, c.iid); assert.ok(c.kw('indestructible')); assert.ok(f.game.isGoaded(c));
    assert.equal(await f.game.destroy(c), false);
    await activate(f, aura); assert.equal(c.zone, 'exile'); assert.equal(aura.zone, 'graveyard');
  });
  test(`${role}: Take the Bait shields its controller and planeswalker, untaps and goads attackers and adds combat`, async () => {
    const f = setup(role), attacker = shield(f, f.b), own = shield(f), pw = walk(f);
    f.game.turnPlayer = f.b; f.game.phase = 'combat'; f.game.step = 'declareAttackers';
    attacker.attacking = f.a; attacker.tapped = true; f.game.combat = {attackers: [attacker], defenderPlayers: [f.a]};
    await play(f, 'Take the Bait'); assert.equal(attacker.tapped, false); assert.ok(f.game.isGoaded(attacker));
    assert.equal(f.game._additionalPhases[0].kind, 'combat');
    assert.equal(await hit(f, attacker, f.a, 3, true), 0);
    assert.equal(await f.game.damageCreature(attacker, pw, 3, {combat: true}), 0);
    assert.equal(await f.game.damageCreature(attacker, own, 2, {combat: true}), 2);
    assert.equal(await hit(f, attacker, f.a, 1), 1);
  });
  test(`${role}: Trouble in Pairs triggers for separate opponents and repeated combats`, async () => {
    const f = setup(role), attackers = [body(f, f.b), body(f, f.b)];
    await play(f, 'Trouble in Pairs');
    await f.game.draw(f.b, 3); await settle(f.game); assert.equal(f.a.hand.length, 1);
    await f.game.draw(f.others[1], 2); await settle(f.game); assert.equal(f.a.hand.length, 2);
    for (const c of attackers) c.attacking = f.a;
    for (let i = 0; i < 2; i++) {await f.game.emit('attackersDeclared', {player: f.b, attackers}); await settle(f.game);}
    assert.equal(f.a.hand.length, 4);
    f.game.turnPlayer = f.b; await play(f, 'Sol Ring', {player: f.b}); await play(f, 'Arcane Signet', {player: f.b});
    assert.equal(f.a.hand.length, 5);
  });
  test(`${role}: Vow of Lightning restricts attacks on its current controller and planeswalkers only while attached`, async () => {
    const f = setup(role), c = body(f, f.b), pw = walk(f); target(f, c);
    const aura = await play(f, 'Vow of Lightning'); assert.equal(c.power, 4); assert.equal(c.toughness, 4); assert.ok(c.kw('first strike'));
    assert.equal(f.game.canAttackTarget(c, f.a), false); assert.equal(f.game.canAttackTarget(c, pw), false);
    assert.equal(f.game.canAttackTarget(c, f.others[1]), true);
    await f.game.move(aura, 'graveyard'); assert.equal(f.game.canAttackTarget(c, f.a), true); assert.equal(f.game.canAttackTarget(c, pw), true); assert.equal(c.power, 2);
  });
}

test('Trouble in Pairs evaluates each extra turn when it would begin and preserves later queued turns', async () => {
  const f = setup(), trouble = card(f, 'Trouble in Pairs');
  f.game.scheduleExtraTurn(f.b); f.game.scheduleExtraTurn(f.a);
  f.game.advanceTurnPlayer(f.a); assert.equal(f.game.turnPlayer, f.a); assert.equal(f.game.extraTurns.length, 1);
  await f.game.move(trouble, 'graveyard'); f.game.advanceTurnPlayer(f.a); assert.equal(f.game.turnPlayer, f.b);
  await f.game.putPermanentOntoBattlefield(trouble, f.a);
  f.game.scheduleExtraTurn(f.others[1]); f.game.advanceTurnPlayer(f.b);
  assert.equal(f.game.extraTurns.length, 0); assert.equal(f.game.turnPlayer, f.b, 'normal turn after the original anchor is retained');
});
