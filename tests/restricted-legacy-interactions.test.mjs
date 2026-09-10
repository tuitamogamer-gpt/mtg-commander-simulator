import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, play, settle, fuel} from './helpers/c21-fixtures.mjs';
const cast = async (f, c, match = () => true) => {
  fuel(f.a);
  const entry = f.game.castableList(f.a).find(e => e.card === c && match(e));
  assert.ok(entry, c.name + ' is offered');
  assert.equal(await f.game.castSpell(f.a, c, {from: entry.from, alt: entry.alt}), true);
  return f.game.stack.find(so => so.card === c && !so.isCopy);
};
const target = (f, chosen) => {f.decide = (_, q) => q.type === 'chooseTargets' ? [chosen] : undefined;};

for (const role of ['human', 'ai']) {
  test(`${role}: Mob Verdict emits the voting event after revealing all votes`, async () => {
    const f = setup(role); card(f, 'Erestor of the Council');
    f.decide = (p, q) => q.prompt?.startsWith('Mob Verdict:') ? String(p === f.b ? f.a.idx : f.b.idx) : undefined;
    await play(f, 'Mob Verdict');
    assert.equal(f.a.hand.length, 2, 'one vote for you and Erestor each draw a card');
    assert.equal(f.game.bf().filter(c => c.ctrl === f.others[1] && c.hasSub('Treasure')).length, 1);
  });
  test(`${role}: Boros Reckoner's lethal-damage trigger survives its death`, async () => {
    const f = setup(role), reckoner = card(f, 'Boros Reckoner'), source = body(f, f.b); target(f, f.b);
    await f.game.damageCreature(source, reckoner, 5); assert.equal(reckoner.zone, 'graveyard');
    await settle(f.game); assert.equal(f.b.life, 35);
  });
  test(`${role}: Darien can decline tokens and does not trigger from life loss`, async () => {
    const f = setup(role), source = body(f, f.b); card(f, 'Darien, King of Kjeldor');
    f.decide = (_, q) => q.type === 'chooseOption' ? 'no' : undefined;
    await f.game.damagePlayer(source, f.a, 3); await settle(f.game);
    await f.game.loseLife(f.a, 3); await settle(f.game);
    assert.equal(f.game.creatures(f.a).filter(c => c.isToken).length, 0);
  });
  test(`${role}: Feather copies the last known spell even if its original was countered`, async () => {
    const f = setup(role), feather = card(f, 'Feather, Radiant Arbiter'), extra = body(f);
    f.decide = (_, q) => q.type === 'chooseTargets' ? [feather] : q.type === 'chooseCards' ? [extra] : undefined;
    const so = await cast(f, card(f, 'Giant Growth', 'hand'));
    await f.game.counterStackObject(so); await settle(f.game);
    assert.equal(extra.power, 5); assert.equal(feather.power, 4);
  });
  test(`${role}: Feather's Aura copy becomes a token attached to the chosen creature`, async () => {
    const f = setup(role), feather = card(f, 'Feather, Radiant Arbiter'), extra = body(f);
    f.decide = (_, q) => q.type === 'chooseTargets' ? [feather] : q.type === 'chooseCards' ? [extra] : undefined;
    await play(f, 'Redemption Arc');
    const copies = f.game.bf().filter(c => c.name === 'Redemption Arc');
    assert.equal(copies.length, 2); assert.equal(copies.filter(c => c.isToken).length, 1);
    assert.equal(copies.find(c => c.isToken).attachedTo, extra.iid);
    assert.ok(extra.kw('indestructible')); assert.ok(feather.kw('indestructible'));
  });
  test(`${role}: Havoc Eater's targets are announced before resolution and invalid targets contribute no counters`, async () => {
    const f = setup(role), a = body(f, f.b), b = body(f, f.others[1]);
    f.decide = (_, q) => q.type === 'chooseTargets' ? q.candidates.slice(0, 1) : undefined;
    const c = card(f, 'Havoc Eater', 'hand'); await cast(f, c); await f.game.resolveTop(); await f.game.flushTriggers();
    const trigger = f.game.stack.find(so => so.kind === 'trigger' && so.ctx?.src === c); assert.ok(trigger);
    assert.deepEqual(new Set(trigger.ctx.targets.flat()), new Set([a, b]));
    await f.game.move(a, 'exile'); await settle(f.game);
    assert.equal(c.counters['+1/+1'], 2); assert.ok(f.game.isGoaded(b));
  });
  test(`${role}: Havoc Eater can choose no targets and sums signed powers`, async () => {
    const f = setup(role); f.decide = (_, q) => q.type === 'chooseTargets' ? [] : undefined;
    body(f, f.b); const empty = await play(f, 'Havoc Eater'); assert.equal(empty.counters['+1/+1'] || 0, 0);
    const negative = f.game.creatures(f.b)[0], positive = body(f, f.others[1]);
    f.game.addOracleBasePT(negative, {power: -2}); f.game.addOracleBasePT(positive, {power: 3});
    f.decide = (_, q) => q.type === 'chooseTargets' ? q.candidates.slice(0, 1) : undefined;
    const c = await play(f, 'Havoc Eater'); assert.equal(c.counters['+1/+1'], 1);
  });
  test(`${role}: Hot Pursuit leaving before its ETB trigger resolves suspects without goading`, async () => {
    const f = setup(role), targetCard = body(f, f.b); target(f, targetCard);
    const c = card(f, 'Hot Pursuit', 'hand'); await cast(f, c); await f.game.resolveTop(); await f.game.flushTriggers();
    await f.game.move(c, 'graveyard'); await settle(f.game);
    assert.equal(targetCard.meta.suspected, true); assert.equal(f.game.isGoaded(targetCard), false);
  });
  test(`${role}: Hot Pursuit does not follow a blinked target and gains control after two players leave`, async () => {
    const f = setup(role, 3), c = body(f, f.b); target(f, c);
    await play(f, 'Hot Pursuit'); await f.game.move(c, 'exile'); await f.game.putPermanentOntoBattlefield(c, f.b);
    assert.equal(f.game.isGoaded(c), false); assert.equal(!!c.meta.suspected, false);
    M.E.suspect(f.game, c); c.tapped = true; f.others[1].lost = true; f.others[2].lost = true;
    await f.game.emit('beginCombat', {player: f.a}); await settle(f.game);
    assert.equal(c.ctrl, f.a); assert.equal(c.tapped, false); assert.ok(c.kw('haste'));
    f.game.untilEffects = f.game.untilEffects.filter(e => e.expires !== 'eot'); f.game.recalc();
    assert.equal(c.ctrl, f.b); assert.equal(c.kw('haste'), false);
  });
  test(`${role}: Immortal Obligation has a graveyard target and its restriction cannot follow a blink`, async () => {
    const f = setup(role), own = card(f, 'Grizzly Bears', 'graveyard'), c = card(f, 'Grizzly Bears', 'graveyard', f.b);
    const spell = card(f, 'Immortal Obligation', 'hand');
    assert.equal(f.game.legalTargets(spell.def.targets[0], spell, f.a).includes(own), false); target(f, c);
    await cast(f, spell); await settle(f.game); await f.game.move(c, 'exile'); await f.game.putPermanentOntoBattlefield(c, f.b);
    assert.equal(f.game.isGoaded(c), false); assert.equal(f.game.canAttackTarget(c, f.a), true);
  });
  test(`${role}: Escort sees its Spirit type and counters during ETB; blinking resets its creature types`, async () => {
    const f = setup(role), c = await play(f, 'Otherworldly Escort');
    const entries = [], emit = f.game.emit.bind(f.game);
    f.game.emit = (event, data) => {if (event === 'etb' && data.card === c) entries.push({spirit: c.hasSub('Spirit'), charge: c.counters.charge}); return emit(event, data);};
    await f.game.destroy(c); await settle(f.game); assert.deepEqual(entries, [{spirit: true, charge: 4}]);
    await f.game.move(c, 'exile'); await f.game.putPermanentOntoBattlefield(c, f.a);
    assert.equal(c.hasSub('Human'), true); assert.equal(c.hasSub('Spirit'), false);
    await f.game.destroy(c); await settle(f.game); assert.equal(c.zone, 'battlefield'); assert.equal(c.hasSub('Spirit'), true);
  });
  test(`${role}: Escort cannot return a different graveyard incarnation or destroy a blinked damage source`, async () => {
    const f = setup(role), c = card(f, 'Otherworldly Escort'), src = body(f, f.b);
    await f.game.destroy(c); await f.game.flushTriggers();
    await f.game.move(c, 'hand'); await f.game.move(c, 'graveyard'); await settle(f.game); assert.equal(c.zone, 'graveyard');
    await f.game.putPermanentOntoBattlefield(c, f.a); await f.game.damagePlayer(src, f.a, 1);
    await f.game.move(src, 'exile'); await f.game.putPermanentOntoBattlefield(src, f.b);
    assert.equal(f.game.legalTargets(c.def.abilities[0].targets[0], c, f.a).includes(src), false);
    assert.equal(f.game.activatableList(f.a).some(e => e.card === c), false, 'no charge counter, so no activation');
  });
  test(`${role}: Prisoner's Dilemma pays its flashback cost and is exiled after resolution`, async () => {
    const f = setup(role), c = card(f, "Prisoner's Dilemma", 'graveyard');
    f.decide = (_, q) => q.aiHint?.kind === 'dilemma' ? 'silence' : undefined;
    await cast(f, c, e => e.alt?.flashback); assert.equal(c.castMeta.manaSpent, 7);
    await settle(f.game); assert.equal(c.zone, 'exile'); assert.equal(f.b.life, 36);
  });
  test(`${role}: Redemption Arc's activated ability uses its last attachment if the Aura leaves in response`, async () => {
    const f = setup(role), c = body(f, f.b); target(f, c); const aura = await play(f, 'Redemption Arc'); fuel(f.a);
    const ability = f.game.activatableList(f.a).find(e => e.card === aura); assert.ok(ability);
    assert.equal(await f.game.activateAbility(f.a, ability), true);
    await f.game.move(aura, 'graveyard'); await settle(f.game); assert.equal(c.zone, 'exile');
  });
  test(`${role}: Take the Bait is not offered outside an opponent's combat`, () => {
    const f = setup(role), c = card(f, 'Take the Bait', 'hand'); fuel(f.a);
    assert.equal(f.game.castableList(f.a).some(e => e.card === c), false);
    f.game.phase = 'combat'; assert.equal(f.game.castableList(f.a).some(e => e.card === c), false);
    f.game.turnPlayer = f.b; assert.equal(f.game.castableList(f.a).some(e => e.card === c), true);
    f.game.phase = 'main2'; assert.equal(f.game.castableList(f.a).some(e => e.card === c), false);
  });
  test(`${role}: Vow of Lightning follows a control change of the Aura`, async () => {
    const f = setup(role), c = body(f, f.b); target(f, c); const aura = await play(f, 'Vow of Lightning');
    M.OracleV8Control.gain(f.game, aura, f.others[1]); f.game.recalc();
    assert.equal(f.game.canAttackTarget(c, f.a), true); assert.equal(f.game.canAttackTarget(c, f.others[1]), false);
  });
}
