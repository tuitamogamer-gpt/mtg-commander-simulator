import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, play, activate, event, settle, target, fuel} from './helpers/znc-khc-fixtures.mjs';

for (const role of ['human', 'ai']) {
  test(role + ': Elf power, Marwyn mana, Miara payment, and Winnower choice', async () => {
    const f = setup(role), ab = card(f, 'Abomination of Llanowar'), marwyn = await play(f, 'Marwyn, the Nurturer');
    card(f, 'Llanowar Elves', 'graveyard');
    await play(f, 'Llanowar Elves');
    assert.equal(marwyn.counters['+1/+1'], 1); assert.equal(ab.power, 4); assert.ok(ab.kw('menace') && ab.kw('vigilance'));
    marwyn.sick = false; const source = f.game.manaSources(f.a).find(s => s.card === marwyn); assert.ok(source);
    const green = f.a.pool.G; assert.equal(await f.game.activateManaSource(f.a, {...source, produce: [{G: 2}]}, {G: 2}), true); assert.equal(f.a.pool.G, green + 2);
    const miara = await play(f, 'Miara, Thorn of the Glade'), hand = f.a.hand.length, life = f.a.life;
    await f.game.destroy(miara); await settle(f.game); assert.equal(f.a.hand.length, hand + 1); assert.equal(f.a.life, life - 1);
    await play(f, 'Ruthless Winnower'); const bear = body(f, f.b); const elf = card(f, 'Llanowar Elves', 'battlefield', f.b);
    await event(f, 'upkeep', {player: f.b}); assert.equal(bear.zone, 'graveyard'); assert.equal(elf.zone, 'battlefield');
  });
  test(role + ': Prowess observes ownership and nontoken Elves, including a Kindred enchantment', async () => {
    const f = setup(role); await play(f, 'Prowess of the Fair'); const elf = card(f, 'Llanowar Elves');
    await f.game.destroy(elf); await settle(f.game); assert.equal(f.game.creatures(f.a).filter(c => c.isToken && c.hasSub('Elf')).length, 1);
    const token = f.game.creatures(f.a).find(c => c.isToken); await f.game.destroy(token); await settle(f.game);
    assert.equal(f.game.creatures(f.a).filter(c => c.isToken).length, 0);
    const second = card(f, 'Prowess of the Fair');
    const abomination = card(f, 'Abomination of Llanowar');
    assert.equal(abomination.power, 4, 'two Kindred Elf enchantments, this creature and the graveyard Elf all count');
    await f.game.destroy(second); await settle(f.game);
    assert.equal(f.game.creatures(f.a).filter(c => c.isToken && c.hasSub('Elf')).length, 1);
    assert.equal(abomination.power, 5, 'the dead Elf enchantment still counts in the graveyard and makes a token');
  });
  test(role + ': Bounty reveals six, moves one land and Elf, and Roots uses the whole graveyard', async () => {
    const f = setup(role), land = card(f, 'Forest', 'library'), elf = card(f, 'Llanowar Elves', 'library');
    f.decide = (p, q) => q.type === 'chooseCards' && /Bounty/.test(q.prompt) ? q.from.includes(land) ? [land] : [elf] : undefined;
    await play(f, 'Bounty of Skemfar'); assert.equal(land.zone, 'battlefield'); assert.equal(land.tapped, true); assert.equal(elf.zone, 'hand');
    const dead = card(f, 'Marwyn, the Nurturer', 'graveyard');
    f.decide = (p, q) => q.type === 'chooseCards' && /Roots/.test(q.prompt) ? [dead] : undefined;
    await play(f, 'Roots of Wisdom'); assert.equal(dead.zone, 'hand');
    const bear = body(f); await play(f, 'Eyeblight Massacre'); assert.equal(bear.zone, 'graveyard'); assert.equal(f.game.bf().includes(land), true);
  });
  test(role + ': Shadowsage counts one shared type, and Numa pays XX before targeted distribution', async () => {
    const f = setup(role), elf = card(f, 'Llanowar Elves'); const shadow = await play(f, 'Skemfar Shadowsage');
    assert.ok(f.b.life === 38 && f.others[1].life === 38 || f.a.life === 42);
    const numa = await play(f, 'Numa, Joraga Chieftain'); fuel(f.a); f.x = 2;
    f.decide = (p, q) => q.type === 'chooseX' ? 2 : q.type === 'chooseTargets' && q.candidates.includes(elf) ? [elf] : undefined;
    const before = Object.values(f.a.pool).reduce((a, b) => a + b, 0);
    await event(f, 'beginCombat', {player: f.a});
    assert.equal(Object.values(f.a.pool).reduce((a, b) => a + b, 0), before - 4); assert.equal(elf.counters['+1/+1'], 2);
    assert.equal(numa.zone, 'battlefield'); assert.equal(shadow.zone, 'battlefield');
    const kindred = card(f, 'Prowess of the Fair');
    f.decide = (p, q) => q.type === 'chooseX' ? 1 : q.type === 'chooseTargets' && q.candidates.includes(kindred) ? [kindred] : undefined;
    await event(f, 'beginCombat', {player: f.a});
    assert.equal(kindred.counters['+1/+1'], 1, 'target Elves includes a noncreature Kindred Elf permanent');
  });
  test(role + ': Pact chooses a type, Peel keeps ownership, and Jaya requires a legendary permanent', async () => {
    const f = setup(role); card(f, 'Llanowar Elves'); card(f, 'Marwyn, the Nurturer');
    const hand = f.a.hand.length, life = f.a.life;
    f.decide = (p, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'Elf') ? 'Elf' : q.type === 'chooseTargets' && q.candidates.includes(f.a) ? [f.a] : undefined;
    await play(f, 'Pact of the Serpent'); assert.equal(f.a.hand.length, hand + 2); assert.equal(f.a.life, life - 2);
    const own = body(f), other = body(f, f.b); target(f, own, other); await play(f, 'Peel from Reality'); assert.equal(own.zone, 'hand'); assert.equal(other.zone, 'hand');
    const fire = card(f, "Jaya's Immolating Inferno", 'hand'); fuel(f.a); target(f, f.b, f.others[1]); f.x = 4;
    await play(f, fire.name, {card: fire, xVal: 4}); assert.equal(f.b.life, 36); assert.equal(f.others[1].life, 36);
    await f.game.move(f.game.bf().find(c => c.name.startsWith('Marwyn')), 'graveyard');
    const again = card(f, fire.name, 'hand'); assert.equal(f.game.castableList(f.a).some(r => r.card === again), false);
    assert.equal(await f.game.castSpell(f.a, again, {from: 'hand'}), false);
  });
  test(role + ': Wyleth counts both kinds of attachment; fabricate and renown use real triggers', async () => {
    const f = setup(role), w = await play(f, 'Wyleth, Soul of Steel');
    const equipment = card(f, 'Bonesplitter'), aura = card(f, 'Pacifism'); await f.game.attach(equipment, w); await f.game.attach(aura, w);
    const before = f.a.hand.length; await event(f, 'attacks', {card: w, player: f.a, defender: f.b}); assert.equal(f.a.hand.length, before + 2);
    const cultivator = await play(f, 'Cultivator of Blades'); assert.equal((cultivator.counters['+1/+1'] || 0) + f.game.creatures(f.a).filter(c => c.hasSub('Servo')).length, 2);
    const seeker = await play(f, 'Relic Seeker'), sword = card(f, 'Sword of Vengeance', 'library');
    f.decide = (p, q) => q.type === 'chooseCards' && q.search && q.from.includes(sword) ? [sword] : undefined;
    await event(f, 'combatDamageToPlayer', {card: seeker, src: seeker, player: f.b, combat: true, n: 2});
    assert.equal(seeker.meta.renowned, true); assert.equal(seeker.counters['+1/+1'], 1); assert.equal(sword.zone, 'hand');
  });
  test(role + ': sea-monster exceptions, kicked Slinn Voda and equalized hands', async () => {
    const f = setup(role), merfolk = card(f, 'Merfolk Looter'), kraken = card(f, 'Shipbreaker Kraken'), bear = body(f, f.b);
    await play(f, 'Whelming Wave'); assert.equal(merfolk.zone, 'hand'); assert.equal(bear.zone, 'hand'); assert.equal(kraken.zone, 'battlefield');
    const again = card(f, 'Merfolk Looter'), bear2 = body(f, f.b);
    let prompt = '';
    f.decide = (p, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'kicker' ? (prompt = q.prompt, 'yes') : undefined;
    const slinn = await play(f, 'Slinn Voda, the Rising Deep');
    assert.match(prompt, /Kicker \{1\}\{U\}/); assert.doesNotMatch(prompt, /undefined/);
    assert.equal(slinn.castMeta.manaSpent, 10, 'printed eight mana plus the two-mana kicker are paid');
    assert.equal(again.zone, 'battlefield'); assert.equal(bear2.zone, 'hand');
    for (let n = 0; n < 5; n++) card(f, 'Forest', 'hand', f.b);
    await play(f, 'Tales of the Ancestors'); assert.equal(f.a.hand.length, f.b.hand.length); assert.equal(f.others[1].hand.length, f.b.hand.length);
  });
}
