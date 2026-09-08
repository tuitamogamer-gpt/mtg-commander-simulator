import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body, play, activate, event, settle, target, fuel, mana} from './helpers/znc-khc-fixtures.mjs';
const spirits = f => f.game.creatures(f.a).filter(c => c.isToken && c.hasSub('Spirit'));
const clear = p => {for (const key of Object.keys(p.pool)) p.pool[key] = 0; p.poolMeta = [];};
const foretold = async (f, c) => {
  const e = f.game.activatableList(f.a).find(e => e.card === c && e.foretell); assert.ok(e);
  assert.equal(await f.game.activateAbility(f.a, e), true); await settle(f.game);
};
for (const role of ['human', 'ai']) {
  test(role + ': Ranar gives one free foretell per turn with no Stack special action or same-turn cast', async () => {
    const f = setup(role); await play(f, 'Ranar the Ever-Watchful'); clear(f.a);
    const a = card(f, 'Tales of the Ancestors', 'hand'), b = card(f, 'Stoic Farmer', 'hand');
    await foretold(f, a); assert.equal(mana(f.a), 0); assert.equal(a.faceDown, true); assert.equal(spirits(f).length, 1);
    assert.equal(f.game.activatableList(f.a).some(e => e.card === b && e.foretell), false);
    assert.equal(f.game.castableList(f.a).some(e => e.card === a), false);
    fuel(f.a); const before = mana(f.a); await foretold(f, b); assert.equal(mana(f.a), before - 2); assert.equal(spirits(f).length, 2);
    f.game.turnNo++; const cast = f.game.castableList(f.a).find(e => e.card === b && e.alt?.foretell); assert.ok(cast);
    await play(f, b.name, {card: b, from: 'exile', alt: cast.alt}); assert.equal(b.zone, 'battlefield'); assert.equal(b.castMeta.zkWasForetold, true);
  });
  test(role + ': Valkyrie grants lasting foretell, preserves the printed option, and does not consume Ranar’s special-action discount', async () => {
    const f = setup(role); await play(f, 'Ranar the Ever-Watchful'); const poison = card(f, 'Poison the Cup', 'hand');
    f.decide = (p, q) => q.type === 'chooseCards' && /Ethereal Valkyrie/.test(q.prompt) ? [poison] : undefined;
    const valkyrie = await play(f, 'Ethereal Valkyrie'); assert.equal(poison.zone, 'exile'); assert.equal(poison.faceDown, true);
    assert.equal(f.a.turnState.zkForetold || 0, 0); assert.equal(f.game.foretellActionCost(f.a), '{0}');
    await f.game.move(valkyrie, 'graveyard'); f.game.turnNo++; body(f, f.b);
    const offers = f.game.castableList(f.a).filter(e => e.card === poison && e.alt?.foretell);
    assert.equal(offers.length, 2); assert.ok(offers.some(e => e.alt.altCostStr === '{1}{B}'));
    const granted = offers.find(e => e.alt.zkForetellGranted); assert.ok(granted);
    assert.equal(f.game.spellCost(f.a, poison, {...granted.alt, from: 'exile'}).generic, 0);
    const victim = f.game.creatures(f.b)[0]; target(f, victim); let scried = 0;
    const decide = f.decide; f.decide = (p, q) => q.type === 'scry' ? (scried += q.cards.length, {top: q.cards, bottom: []}) : decide(p, q);
    await play(f, poison.name, {card: poison, from: 'exile', alt: granted.alt}); assert.equal(victim.zone, 'graveyard'); assert.equal(scried, 2);
    assert.equal(poison.meta.zkForetell, undefined);
  });
  test(role + ': Ranar and Hero count one simultaneous exile instruction; Soulherder counts each creature and tokens', async () => {
    const f = setup(role); const ranar = await play(f, 'Ranar the Ever-Watchful'), hero = await play(f, 'Hero of Bretagard'), soul = await play(f, 'Soulherder');
    const a = body(f), b = body(f, f.b); const before = spirits(f).length;
    f.game.stack.push({kind: 'ability', name: 'Test exile instruction', srcCard: ranar, ctrl: f.a, ctx: {g: f.game, src: ranar, you: f.a, targets: []}, targets: [], run: ctx => ctx.g.exileMany([a, b])});
    await settle(f.game); assert.equal(spirits(f).length, before + 1); assert.equal(hero.counters['+1/+1'], 2); assert.equal(soul.counters['+1/+1'], 2);
    const token = spirits(f)[0]; await f.game.exileMany([token]); await settle(f.game); assert.equal(soul.counters['+1/+1'], 3);
    assert.equal(hero.counters['+1/+1'], 2); assert.equal(spirits(f).length, before);
    f.game.addCounters(hero, 'charge', 8); f.game.recalc(); assert.ok(hero.kw('flying') && hero.kw('indestructible')); assert.ok(hero.hasSub('Angel') && hero.hasSub('God'));
  });
  test(role + ': simultaneous self-exile retains Ranar’s old ability and controller', async () => {
    const f = setup(role), ranar = await play(f, 'Ranar the Ever-Watchful'), bear = body(f);
    await play(f, 'Synthetic Destiny'); assert.equal(ranar.zone, 'exile'); assert.equal(bear.zone, 'exile'); assert.equal(spirits(f).length, 1);
  });
  test(role + ': Cosmic Intervention replaces deaths, returns exact cards to their owners, and ignores stale exile incarnations', async () => {
    const f = setup(role), a = body(f), b = body(f); const stolen = card(f, 'Llanowar Elves', 'battlefield', f.b);
    M.OracleV8Control.gain(f.game, stolen, f.a); f.game.recalc();
    await play(f, 'Cosmic Intervention'); await f.game.destroyMany([a, b, stolen]); await settle(f.game);
    assert.equal(a.zone, 'exile'); assert.equal(stolen.zone, 'exile'); assert.equal(f.game.diedThisTurn.length, 0);
    await f.game.move(b, 'graveyard'); await f.game.move(b, 'exile');
    await event(f, 'endStep', {player: f.a}); assert.equal(a.zone, 'battlefield'); assert.equal(stolen.zone, 'battlefield'); assert.equal(stolen.ctrl, f.b); assert.equal(b.zone, 'exile');
  });
  test(role + ': Cosmic replacement retains the resolving spell’s controller for Ranar and Hero', async () => {
    const f = setup(role); await play(f, 'Ranar the Ever-Watchful'); const hero = await play(f, 'Hero of Bretagard');
    const a = body(f), b = body(f); await play(f, 'Cosmic Intervention');
    target(f, a); await play(f, 'Doom Blade', {player: f.b});
    assert.equal(a.zone, 'exile'); assert.equal(spirits(f).length, 0); assert.equal(hero.counters['+1/+1'] || 0, 0);
    target(f, b); await play(f, 'Doom Blade');
    assert.equal(b.zone, 'exile'); assert.equal(spirits(f).length, 1); assert.equal(hero.counters['+1/+1'], 1);
  });
  test(role + ': lethal-damage state-based exile does not trigger Ranar or Hero', async () => {
    const f = setup(role); await play(f, 'Ranar the Ever-Watchful'); const hero = await play(f, 'Hero of Bretagard'), bear = body(f);
    await play(f, 'Cosmic Intervention'); target(f, bear); await play(f, 'Lightning Bolt');
    assert.equal(bear.zone, 'exile'); assert.equal(spirits(f).length, 0); assert.equal(hero.counters['+1/+1'] || 0, 0);
  });
  test(role + ': a sacrifice for mana during Numa’s resolution does not become a Ranar exile effect', async () => {
    const f = setup(role); const ranar = await play(f, 'Ranar the Ever-Watchful');
    await play(f, 'Numa, Joraga Chieftain'); card(f, "Ashnod's Altar"); const bear = body(f);
    await play(f, 'Cosmic Intervention'); clear(f.a);
    f.decide = (p, q) => q.type === 'chooseX' ? 1 : q.type === 'chooseCards' && q.from.includes(bear) ? [bear] : undefined;
    await event(f, 'beginCombat', {player: f.a});
    assert.equal(bear.zone, 'exile'); assert.equal(ranar.zone, 'battlefield'); assert.equal(spirits(f).length, 0);
  });
  test(role + ': Emeria offers the Plains destination and Trove returns only its linked incarnation', async () => {
    const f = setup(role); const shepherd = await play(f, 'Emeria Shepherd'), dead = card(f, 'Sol Ring', 'graveyard'); target(f, dead);
    const land = card(f, 'Plains', 'hand'); await f.game.move(land, 'battlefield', {ctrl: f.a}); await settle(f.game);
    assert.ok(dead.zone === 'battlefield' || dead.zone === 'hand');
    await f.game.move(shepherd, 'graveyard'); const trove = await play(f, 'Trove Warden'), elf = card(f, 'Llanowar Elves', 'graveyard'); target(f, elf);
    await f.game.move(card(f, 'Forest', 'hand'), 'battlefield', {ctrl: f.a}); await settle(f.game); assert.equal(elf.zone, 'exile');
    await f.game.destroy(trove); await settle(f.game); assert.equal(elf.zone, 'battlefield'); assert.equal(elf.ctrl, f.a);
  });
  test(role + ': Soul-Jar grants one creature cast per activation and survives the artifact leaving', async () => {
    const f = setup(role), jar = await play(f, "Serpent's Soul-Jar"), a = card(f, 'Llanowar Elves'), b = card(f, 'Marwyn, the Nurturer');
    await f.game.destroyMany([a, b]); await settle(f.game); assert.equal(a.zone, 'exile'); assert.equal(b.zone, 'exile');
    jar.sick = false; const before = f.a.life; await activate(f, jar); assert.equal(f.a.life, before - 2); await f.game.destroy(jar); await settle(f.game);
    const offer = f.game.castableList(f.a).find(e => e.card === a); assert.ok(offer); await play(f, a.name, {card: a, from: 'exile', alt: offer.alt});
    assert.equal(f.game.castableList(f.a).some(e => e.card === b), false);
  });
  test(role + ': Tiana schedules a delayed optional return and never follows a new graveyard object', async () => {
    const f = setup(role); await play(f, "Tiana, Ship's Caretaker"); const a = card(f, 'Bonesplitter'), b = card(f, 'Sword of Vengeance');
    await f.game.destroyMany([a, b]); await settle(f.game); assert.equal(a.zone, 'graveyard');
    await f.game.move(b, 'hand'); await f.game.move(b, 'graveyard');
    await event(f, 'endStep', {player: f.b}); assert.equal(a.zone, 'hand'); assert.equal(b.zone, 'graveyard');
  });
  test(role + ': Artisan copies a hand creature and exiles only its tokens at the next end step', async () => {
    const f = setup(role), artisan = await play(f, 'Arcane Artisan'), elf = card(f, 'Llanowar Elves', 'hand'); artisan.sick = false;
    f.decide = (p, q) => q.type === 'chooseTargets' && q.candidates.includes(f.a) ? [f.a] : q.type === 'chooseCards' && /Arcane Artisan/.test(q.prompt) ? [elf] : undefined;
    await activate(f, artisan); const token = f.game.creatures(f.a).find(c => c.isToken && c.name === elf.name); assert.ok(token); assert.equal(elf.zone, 'exile');
    await f.game.move(artisan, 'exile'); await settle(f.game); assert.equal(token.zone, 'battlefield');
    await event(f, 'endStep', {player: f.a}); assert.equal(token.zone, 'ceased'); assert.equal(elf.zone, 'exile');
  });
  test(role + ': Replicating Ring removes all night counters and makes eight functional snow artifacts', async () => {
    const f = setup(role), ring = await play(f, 'Replicating Ring'); f.game.addCounters(ring, 'night', 7);
    await event(f, 'upkeep', {player: f.a}); assert.equal(ring.counters.night || 0, 0);
    const tokens = f.game.bf().filter(c => c.isToken && c.name === 'Replicated Ring'); assert.equal(tokens.length, 8);
    assert.ok(tokens.every(c => c.cur.super.includes('Snow') && c.is('Artifact') && !c.is('Creature')));
    const manaSource = f.game.manaSources(f.a).find(s => s.card === tokens[0]); assert.ok(manaSource);
    const before = f.a.pool.U; await f.game.activateManaSource(f.a, manaSource, {U: 1}); assert.equal(f.a.pool.U, before + 1);
  });
  test(role + ': Niko’s chapters count foretold cards, restrict mana, and target printed foretell in the graveyard', async () => {
    const f = setup(role), foretoldCard = card(f, 'Stoic Farmer', 'hand'); fuel(f.a); await foretold(f, foretoldCard);
    const life = f.a.life, saga = await play(f, 'Niko Defies Destiny'); assert.equal(f.a.life, life + 2);
    clear(f.a); f.game.addCounters(saga, 'lore', 1); await settle(f.game); assert.equal(mana(f.a), 2);
    const other = card(f, 'Arcane Signet', 'hand'); assert.equal(f.game.canPayMana(f.a, M.parseCost('{2}'), {card: other}), false);
    const next = card(f, 'Tales of the Ancestors', 'hand'); await foretold(f, next); assert.equal(mana(f.a), 0);
    const dead = card(f, 'Poison the Cup', 'graveyard'); target(f, dead); f.game.addCounters(saga, 'lore', 1); await settle(f.game); assert.equal(dead.zone, 'hand'); assert.equal(saga.zone, 'graveyard');
  });
}
