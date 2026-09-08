import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, play, activate, event, settle, target, fuel, mana} from './helpers/znc-khc-fixtures.mjs';
for (const role of ['human', 'ai']) {
  test(role + ': Brass Squire attaches Equipment and On Serra’s Wings grants all printed characteristics', async () => {
    const f = setup(role), squire = await play(f, 'Brass Squire'), creature = body(f), sword = card(f, 'Bonesplitter'); squire.sick = false;
    target(f, sword, creature); await activate(f, squire); assert.equal(sword.attachedTo, creature.iid); assert.equal(creature.power, 4);
    target(f, creature); const wings = await play(f, "On Serra's Wings"); assert.equal(wings.attachedTo, creature.iid);
    assert.equal(creature.power, 5); assert.ok(creature.cur.super.includes('Legendary')); assert.ok(['flying', 'vigilance', 'lifelink'].every(k => creature.kw(k)));
    await f.game.destroy(wings); await settle(f.game); assert.equal(creature.power, 4); assert.equal(creature.kw('flying'), false);
  });
  test(role + ': Timely Ward has flash only when targeting a commander and still pays its printed cost', async () => {
    const f = setup(role), commander = card(f, 'Wyleth, Soul of Steel'); commander.commander = true; f.a.commanders.push(commander); const other = body(f);
    const ward = card(f, 'Timely Ward', 'hand'); fuel(f.a); f.game.turnPlayer = f.b; f.game.phase = 'main1';
    let offers = f.game.castableList(f.a).filter(e => e.card === ward); assert.equal(offers.length, 1); assert.equal(offers[0].alt.zkCommanderWard, true);
    const specs = f.game.spellTargetSpecs(ward, offers[0].alt); assert.deepEqual(Array.from(f.game.legalTargets(specs[0], ward, f.a), c => c.iid), [commander.iid]);
    target(f, commander); const before = mana(f.a); assert.equal(await f.game.castSpell(f.a, ward, {from: 'hand', alt: offers[0].alt}), true); await settle(f.game);
    assert.equal(mana(f.a), before - 3); assert.equal(ward.attachedTo, commander.iid); assert.equal(commander.kw('indestructible'), true); assert.equal(other.kw('indestructible'), false);
  });
  test(role + ': Blazing Sunsteel uses equipped-creature damage and the equipment controller’s opponents', async () => {
    const f = setup(role), creature = body(f), steel = await play(f, 'Blazing Sunsteel'); await f.game.attach(steel, creature); assert.equal(creature.power, 4);
    target(f, f.b); await f.game.damageCreature(body(f, f.b), creature, 1); await settle(f.game); assert.equal(f.b.life, 39);
    const before = f.b.life; await f.game.damageCreature(body(f, f.b), creature, 1); await settle(f.game); assert.equal(f.b.life, before - 1);
  });
  test(role + ': Trench Behemoth returns a real land as cost and its next-combat requirement expires', async () => {
    const f = setup(role), behemoth = await play(f, 'Trench Behemoth'), land = card(f, 'Forest'); behemoth.tapped = true;
    f.decide = (p, q) => q.type === 'chooseCards' && q.from.includes(land) ? [land] : undefined;
    await activate(f, behemoth); assert.equal(land.zone, 'hand'); assert.equal(behemoth.tapped, false); assert.equal(behemoth.kw('hexproof'), true);
    const victim = body(f, f.b); target(f, victim); await f.game.move(land, 'battlefield', {ctrl: f.a}); await settle(f.game);
    await event(f, 'beginCombat', {player: f.b}); f.game.recalc(); assert.equal(f.game.isForcedToAttack(victim), true);
    await event(f, 'endCombat', {player: f.b}); f.game.recalc(); assert.equal(f.game.isForcedToAttack(victim), false);
  });
  test(role + ': Tromokratis requires every defending creature and loses hexproof during combat', async () => {
    const f = setup(role), t = await play(f, 'Tromokratis'), a = body(f, f.b), b = body(f, f.b); assert.equal(t.kw('hexproof'), true);
    t.attacking = f.b; f.game.recalc(); assert.equal(t.kw('hexproof'), false); assert.equal(f.game.blockerBounds(t).min, 2);
    assert.equal(f.game.blockDeclarationLegal([t], [{attacker: t, blocker: a}]), false);
    assert.equal(f.game.blockDeclarationLegal([t], [{attacker: t, blocker: a}, {attacker: t, blocker: b}]), true);
    b.tapped = true; assert.equal(f.game.canBlock(b, t), false); t.blockedBy = [a]; a.blocking = t.iid; f.game.pruneBlockDeclaration([t]); assert.equal(t.blockedBy.length, 0);
  });
  test(role + ': Master Warcraft chooses attackers while the active player chooses destinations, and rejects late casting', async () => {
    const f = setup(role), selected = body(f, f.b), left = body(f, f.b); selected.sick = false; left.sick = false;
    f.game.turnPlayer = f.b; fuel(f.a); await play(f, 'Master Warcraft');
    let selectedBy = null, targetedBy = null;
    f.decide = (p, q) => {
      if (q.type === 'chooseCards' && /Master Warcraft/.test(q.prompt)) {selectedBy = p; return [selected];}
      if (q.type === 'attackers') {targetedBy = p; return [{card: selected, target: f.others[1]}];}
      return undefined;
    };
    const answer = await f.b.controller.decide(f.game, {type: 'attackers', eligible: [selected, left], opponents: [f.a, f.others[1]], attackTargets: [f.a, f.others[1]], forced: []});
    assert.equal(selectedBy, f.a); assert.equal(targetedBy, f.b); assert.equal(answer.length, 1); assert.equal(answer[0].target, f.others[1]);
    f.b.turnState.reachedDeclareAttackers = true; const late = card(f, 'Master Warcraft', 'hand'); assert.equal(await f.game.castSpell(f.a, late, {from: 'hand'}), false);
  });
  test(role + ': Stumpsquall distributes cast X without targeting, including an opposing commander', async () => {
    const f = setup(role), commander = card(f, 'Teferi, Temporal Archmage', 'battlefield', f.b); commander.commander = true; commander.counters.loyalty = 5;
    f.decide = (p, q) => q.type === 'chooseCards' && /Stumpsquall/.test(q.prompt) ? [commander] : undefined;
    await play(f, 'Stumpsquall Hydra', {xVal: 3}); assert.equal(commander.counters['+1/+1'], 3);
  });
  test(role + ': Murkfiend grants separate green/blue bonuses and selects only those creatures for other untap steps', async () => {
    const f = setup(role), liege = await play(f, 'Murkfiend Liege'), green = body(f), both = card(f, 'Coiling Oracle'), artifact = card(f, 'Sol Ring');
    assert.equal(green.power, 3); assert.equal(both.power, 3); assert.equal(liege.power, 4);
    const cards = f.game.bf(); assert.equal(M.ZK.otherUntap(f.game, green, f.b, cards), true); assert.equal(M.ZK.otherUntap(f.game, both, f.b, cards), true); assert.equal(M.ZK.otherUntap(f.game, artifact, f.b, cards), false);
    await f.game.move(liege, 'graveyard'); assert.equal(green.power, 2); assert.equal(M.ZK.otherUntap(f.game, green, f.b, f.game.bf()), false);
  });
  test(role + ': reused commanders retain Obuun land animation, Aesi’s second land, and Lathril’s eleven-Elf payment', async () => {
    const f = setup(role), obuun = card(f, 'Obuun, Mul Daya Ancestor'), land = card(f, 'Forest');
    target(f, land); await event(f, 'beginCombat', {player: f.a}); assert.equal(land.is('Creature'), true); assert.equal(land.power, obuun.power); assert.ok(land.kw('haste') && land.kw('trample'));
    const aesi = card(f, 'Aesi, Tyrant of Gyre Strait'); assert.equal(f.game.landPlayLimit(f.a), 2); await f.game.move(aesi, 'graveyard'); assert.equal(f.game.landPlayLimit(f.a), 1);
    await f.game.move(obuun, 'graveyard'); const lathril = card(f, 'Lathril, Blade of the Elves'); lathril.sick = false;
    await f.game.damagePlayer(lathril, f.b, 3, {combat: true}); await event(f, 'combatDamageToPlayer', {card:lathril,src:lathril,player:f.b,combat:true,n:3}); assert.equal(f.game.creatures(f.a).filter(c => c.isToken && c.hasSub('Elf')).length, 3);
    for (let n = 0; n < 7; n++) card(f, 'Llanowar Elves');
    const entry = f.game.activatableList(f.a).find(e => e.card === lathril); assert.ok(entry); const life = f.a.life;
    await f.game.activateAbility(f.a, entry); await settle(f.game); assert.equal(lathril.tapped, true); assert.equal(f.game.creatures(f.a).filter(c => c.hasSub('Elf') && c.tapped).length, 11); assert.equal(f.a.life, life + 10);
  });
}
