import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M, setup, card, body, play, activate, event, settle, fuel, mana} from './helpers/c21-fixtures.mjs';
import {buildIntake} from '../scripts/import-soc-precons.mjs';
const count = c => c.counters['+1/+1'] || 0;
const choose = (f, fn) => {f.decide = (p, q) => fn(p, q);};
const aim = (f, ...targets) => choose(f, (p, q) => q.type === 'chooseTargets' ? targets.filter(c => q.candidates.includes(c)).slice(0, q.max) : undefined);
const spirits = f => f.game.creatures(f.a).filter(c => c.hasSub('Spirit') && c.isToken);
async function prepared(f, c, name, xVal) {
  const copy = f.a.exile.find(x => x.meta.preparedBy === c.iid); assert.ok(copy, name + ' prepared'); assert.equal(copy.name, name);
  const oracle = JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-soc-2026-09-18/oracle.json', import.meta.url))).cards;
  const face = oracle.find(r => r.requestedName === c.name).faces[1];
  assert.equal(copy.def.cost, face.mana_cost); assert.equal(copy.def.types.join(' '), face.type_line); assert.equal(copy.def.oracle, face.oracle_text);
  fuel(f.a); const before = mana(f.a);
  assert.equal(await f.game.castSpell(f.a, copy, {from: 'exile', ...(xVal === undefined ? {} : {xVal})}), true);
  assert.ok(mana(f.a) < before); assert.equal(c.meta.prepared, false); await settle(f.game); return copy;
}

for (const role of ['human', 'ai']) {
  test(role + ': Augusta counts nonlands and puts counters on a chosen attacker', async () => {
    const f = setup(role), s = card(f, 'Augusta, Order Returned'); s.attacking = f.b;
    card(f, 'Sol Ring', 'graveyard'); card(f, 'Forest', 'graveyard', f.b); card(f, 'Grizzly Bears', 'graveyard', f.others[1]); aim(f, s);
    await event(f, 'attacks', {card: s, player: f.a}); assert.equal(count(s), 2); assert.equal(f.game.players.reduce((n, p) => n + p.exile.length, 0), 3);
  });
  test(role + ': Fateful Tempest handles zero present votes and mill damage', async () => {
    const f = setup(role); card(f, 'Sol Ring', 'library');
    choose(f, (p, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'past') ? 'past' : undefined);
    const n = f.a.library.length; await play(f, 'Fateful Tempest'); assert.equal(f.a.library.length, n - 3); assert.equal(f.a.exile.length, 0); assert.equal(f.b.life, 39);
  });
  test(role + ': Fateful Tempest grants play through the end of your next turn', async () => {
    const f = setup(role); choose(f, (p, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'present') ? 'present' : undefined);
    await play(f, 'Fateful Tempest'); assert.equal(f.a.exile.length, 3); const c = f.a.exile[0]; assert.ok(f.game.playableLands(f.a).includes(c));
    f.game.turnNo++; f.a.turnsStarted++; assert.ok(f.game.playableLands(f.a).includes(c)); f.a.turnsStarted++; assert.equal(f.game.playableLands(f.a).includes(c), false);
  });
  test(role + ': Ceaseless Conflict counts finality exile but preserves indestructible creatures', async () => {
    const f = setup(role), doomed = body(f), safe = card(f, 'Darksteel Myr'); f.game.addCounters(doomed, 'finality', 1);
    await play(f, 'Ceaseless Conflict'); assert.equal(doomed.zone, 'exile'); assert.equal(safe.zone, 'battlefield'); assert.equal(spirits(f).length, 1);
  });
  test(role + ': Primary Research recovers a small permanent; Relic Retriever works on an opposing end step', async () => {
    const f = setup(role), c = card(f, 'Sol Ring', 'graveyard'); card(f, 'Relic Retriever'); aim(f, c); await play(f, 'Primary Research'); assert.equal(c.zone, 'battlefield');
    await event(f, 'endStep', {player: f.b}); assert.equal(f.game.bf().filter(c => c.hasSub('Treasure')).length, 1); assert.equal(f.a.hand.length, 0);
    await event(f, 'endStep', {player: f.a}); assert.equal(f.a.hand.length, 1);
  });
  test(role + ': Spirit of Resilience copies a departing creature while retaining its counter', async () => {
    const f = setup(role), s = card(f, 'Spirit of Resilience'), c = card(f, 'Grizzly Bears', 'graveyard');
    choose(f, (p, q) => q.type === 'chooseCards' && q.from.includes(c) ? [c] : undefined);
    await f.game.move(c, 'hand'); await settle(f.game); assert.equal(s.name, 'Grizzly Bears'); assert.equal(count(s), 1); assert.equal(s.power, 3);
  });
  test(role + ': Ao can place multiple permanents within its total mana value budget', async () => {
    const f = setup(role), s = card(f, 'Ao, the Dawn Sky'), c = card(f, 'Sol Ring', 'library'), b = card(f, 'Grizzly Bears', 'library');
    choose(f, (p, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'mode' ? '0' : q.type === 'chooseCards' ? [c, b].filter(c => q.from.includes(c)).slice(0, 1) : undefined);
    await f.game.sacrifice(f.a, s); await settle(f.game); assert.equal(c.zone, 'battlefield'); assert.equal(b.zone, 'battlefield');
  });
  test(role + ': Ao’s counter mode affects creatures and uncrewed Vehicles', async () => {
    const f = setup(role), s = card(f, 'Ao, the Dawn Sky'), b = body(f), v = card(f, "Smuggler's Copter");
    choose(f, (p, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'mode' ? '1' : undefined);
    await f.game.sacrifice(f.a, s); await settle(f.game); assert.equal(count(b), 2); assert.equal(count(v), 2);
  });
  test(role + ': White Orchid Phantom replaces a nonbasic with an optional tapped basic', async () => {
    const f = setup(role), c = card(f, 'Command Tower', 'battlefield', f.b); aim(f, c); await play(f, 'White Orchid Phantom'); assert.equal(c.zone, 'graveyard'); assert.equal(f.game.lands(f.b).length, 1); assert.ok(f.game.lands(f.b)[0].tapped);
  });
  test(role + ': Quintorius Loremaster links exile cards and sends a free resolved spell to the library bottom', async () => {
    const f = setup(role), s = card(f, 'Quintorius, Loremaster'), c = card(f, 'Cultivate', 'graveyard'); aim(f, c);
    await event(f, 'endStep', {player: f.a}); assert.equal(c.zone, 'exile'); assert.equal(spirits(f).length, 1);
    await activate(f, s); assert.equal(spirits(f).length, 0); const offer = f.game.castableList(f.a).find(r => r.card === c); assert.ok(offer?.alt.free);
    assert.equal(await f.game.castSpell(f.a, c, {from: 'exile', alt: offer.alt}), true); await settle(f.game); assert.equal(c.zone, 'library'); assert.equal(f.a.library[0], c);
  });
  test(role + ': Forum Filibuster returns an Aura attached to its new Inkling', async () => {
    const f = setup(role); card(f, 'Forum Filibuster'); const c = card(f, "Raffine's Guidance", 'graveyard'); aim(f, c);
    await event(f, 'upkeep', {player: f.a}); const ink = f.game.creatures(f.a).find(c => c.hasSub('Inkling')); assert.ok(ink); assert.equal(c.zone, 'battlefield'); assert.equal(c.attachedTo, ink.iid); assert.equal(ink.power, 3);
  });
  test(role + ': Intermediate Chirography grows on first life loss and replaces a modified death each end step', async () => {
    const f = setup(role), s = await play(f, 'Intermediate Chirography'), b = f.game.creatures(f.a)[0]; aim(f, b);
    await activate(f, s, 0); await f.game.loseLife(f.a, 1); await settle(f.game); await f.game.loseLife(f.a, 1); await settle(f.game); assert.equal(count(b), 1);
    await activate(f, s, 1); await f.game.sacrifice(f.a, b); await settle(f.game); await event(f, 'endStep', {player: f.b}); assert.equal(f.game.creatures(f.a).filter(c => c.hasSub('Inkling')).length, 1);
  });
  test(role + ': Armored Skyhunter can attach a recovered Equipment', async () => {
    const f = setup(role), s = card(f, 'Armored Skyhunter'), c = card(f, 'Swiftfoot Boots', 'library');
    choose(f, (p, q) => q.type === 'chooseCards' ? q.from.includes(c) ? [c] : q.from.includes(s) ? [s] : undefined : undefined);
    await event(f, 'attacks', {card: s, player: f.a}); assert.equal(c.zone, 'battlefield'); assert.equal(c.attachedTo, s.iid);
  });
  test(role + ': Firemane rewards opposing attackers only when none attacks you; Tomik punishes two at you', async () => {
    const f = setup(role); card(f, 'Firemane Commando'); card(f, 'Tomik, Wielder of Law'); const a = body(f, f.b), b = body(f, f.b);
    a.attacking = b.attacking = f.others[1]; await event(f, 'attackersDeclared', {player: f.b, attackers: [a, b]}); assert.equal(f.b.hand.length, 1); assert.equal(f.a.hand.length, 0);
    a.attacking = b.attacking = f.a; await event(f, 'attackersDeclared', {player: f.b, attackers: [a, b]}); assert.equal(f.b.hand.length, 1); assert.equal(f.a.hand.length, 1); assert.equal(f.b.life, 37);
  });
  test(role + ': Pearl-Ear discounts enchantments for Auras and draws only for a modified friendly target', async () => {
    const f = setup(role), b = body(f); card(f, 'Pearl-Ear, Imperial Advisor'); f.game.addCounters(b, '+1/+1', 1); aim(f, b);
    await play(f, "Raffine's Guidance"); assert.equal(f.a.hand.length, 1); const c = card(f, 'Ghostly Prison', 'hand'); assert.equal(f.game.spellCost(f.a, c).generic, 1);
  });
  test(role + ': Screams from Within returns after its host dies and enchants a surviving creature', async () => {
    const f = setup(role), b = body(f, f.b), survivor = card(f, 'Wind Drake'); aim(f, b); const aura = await play(f, 'Screams from Within');
    choose(f, (p, q) => q.type === 'chooseCards' && q.from.includes(survivor) ? [survivor] : q.type === 'chooseTargets' && q.candidates.includes(survivor) ? [survivor] : undefined);
    await f.game.sacrifice(f.b, b); await settle(f.game); assert.equal(aura.zone, 'battlefield'); assert.equal(aura.attachedTo, survivor.iid);
  });
  test(role + ': Witherbloom Command resolves both selected modes in printed order', async () => {
    const f = setup(role), land = card(f, 'Forest', 'graveyard');
    choose(f, (p, q) => q.type === 'chooseMulti' ? ['0', '3'] : q.type === 'chooseTargets' ? [f.b] : q.type === 'chooseCards' && q.from.includes(land) ? [land] : undefined);
    await play(f, 'Witherbloom Command'); assert.equal(f.b.graveyard.length, 3); assert.equal(land.zone, 'hand'); assert.equal(f.b.life, 38); assert.equal(f.a.life, 42);
  });
  test(role + ': Dina sacrifices another creature for its power and draws only once per turn', async () => {
    const f = setup(role), s = card(f, 'Dina, Essence Brewer'), b = body(f), target = card(f, 'Wind Drake');
    choose(f, (p, q) => q.type === 'chooseTargets' ? [target] : q.type === 'chooseCards' && q.from.includes(b) ? [b] : undefined);
    await activate(f, s); assert.equal(b.zone, 'graveyard'); assert.equal(f.a.hand.length, 1); assert.equal(f.a.life, 42); assert.equal(count(target), 2);
    await f.game.sacrifice(f.a, target); await settle(f.game); assert.equal(f.a.hand.length, 1);
  });
  test(role + ': Killian Decisive Mentor taps and goads after an enchantment enters and draws for an enchanted attack', async () => {
    const f = setup(role); card(f, 'Killian, Decisive Mentor'); const b = body(f, f.b); aim(f, b); await play(f, "Raffine's Guidance"); assert.ok(b.tapped); assert.ok(f.game.goadersOf(b).includes(f.a));
    b.attacking = f.others[1]; await event(f, 'attackersDeclared', {player: f.b, attackers: [b]}); assert.equal(f.a.hand.length, 1);
  });
  test(role + ': prepared sorceries obey timing, require mana and are invalid after their source leaves', async () => {
    const f = setup(role), s = card(f, 'Kirol, History Buff'), c = card(f, 'Forest', 'graveyard'), b = body(f); aim(f, b);
    await f.game.move(c, 'exile'); await settle(f.game); const copy = f.a.exile.find(c => c.meta.preparedBy === s.iid); fuel(f.a);
    f.game.phase = 'combat'; assert.equal(await f.game.castSpell(f.a, copy, {from: 'exile'}), false); f.game.phase = 'main1';
    for (const k of Object.keys(f.a.pool)) f.a.pool[k] = 0; assert.equal(await f.game.castSpell(f.a, copy, {from: 'exile'}), false);
    fuel(f.a); await f.game.move(s, 'hand'); assert.equal(await f.game.castSpell(f.a, copy, {from: 'exile'}), false);
  });
}
test('three original SOC lists retain exact quantities, importability and native definitions', () => {
  const intake = buildIntake(M); assert.equal(intake.decks.length, 3); assert.equal(intake.newNames.length, 0);
  const initial = JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-soc-2026-09-18/intake.json', import.meta.url)));
  assert.equal(initial.newCards, 48); assert.equal(initial.reusedCards, 189);
  for (const d of intake.decks) {
    assert.equal(d.cards.reduce((n, c) => n + c.n, 0), 100);
    assert.deepEqual(JSON.parse(JSON.stringify(M.DECKS[d.name].cards)), d.cards);
    for (const c of d.cards) {assert.ok(M.CARD_CATALOG[c.name].deckImportEligible, c.name); assert.ok(!M.DEFS[c.name].simplified && !M.DEFS[c.name].autoScripted, c.name);}
  }
});
for (const role of ['human', 'ai']) {
  test(role + ': Quintorius makes one Spirit for grouped graveyard departures and loyalty costs work', async () => {
    const f = setup(role), q = await play(f, 'Quintorius, History Chaser');
    const a = card(f, 'Forest', 'graveyard'), b = card(f, 'Sol Ring', 'graveyard');
    await f.game.moveGraveyardBatch([a, b], 'exile'); await settle(f.game);
    assert.equal(spirits(f).length, 1); assert.equal(spirits(f)[0].power, 3);
    const discard = card(f, 'Forest', 'hand'); const loyalty = q.counters.loyalty;
    choose(f, (p, q) => q.type === 'chooseCards' && q.from.includes(discard) ? [discard] : undefined);
    await activate(f, q, 0); assert.equal(q.counters.loyalty, loyalty + 1); assert.equal(f.a.hand.length, 2);
  });
  test(role + ': Excava returns a 1/1 flying Spirit with finality', async () => {
    const f = setup(role), s = card(f, 'Excava, the Risen Past'), c = card(f, 'Sol Ring', 'graveyard'); aim(f, c);
    await event(f, 'attacks', {card: s, player: f.a, target: f.b});
    assert.equal(c.zone, 'battlefield'); assert.equal(c.power, 1); assert.ok(c.hasSub('Spirit') && c.is('Creature') && c.is('Artifact') && c.kw('flying'));
    await f.game.sacrifice(f.a, c); assert.equal(c.zone, 'exile');
  });
  test(role + ': Ceaseless Conflict counts only your destroyed nontoken creatures', async () => {
    const f = setup(role); body(f); body(f, f.b); await f.game.makeTokens(M.TOKENS.pest, f.a); await play(f, 'Ceaseless Conflict');
    assert.equal(spirits(f).length, 1);
  });
  test(role + ': Advanced Reconstruction levels gate damage and reduce nonhand costs', async () => {
    const f = setup(role), s = card(f, 'Advanced Reconstruction'); await activate(f, s, 0);
    const c = card(f, 'Forest', 'graveyard'); await f.game.move(c, 'exile'); await settle(f.game); assert.equal(f.b.life, 38);
    f.game.turnNo++; s.meta.loyaltyTurn = null; await activate(f, s, 1);
    const spell = card(f, 'Cultivate', 'exile'); assert.equal(f.game.spellCost(f.a, spell).generic, 0);
    await f.game.move(spell, 'hand'); assert.equal(f.game.spellCost(f.a, spell).generic, 2);
  });
  test(role + ': Claim Jumper checks the land gap again before a second search', async () => {
    const f = setup(role); card(f, 'Forest', 'battlefield', f.b); card(f, 'Plains', 'library'); card(f, 'Plains', 'library');
    choose(f, (p, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'yes') ? 'yes' : undefined);
    await play(f, 'Claim Jumper'); assert.equal(f.game.lands(f.a).length, 1); assert.ok(f.game.lands(f.a)[0].tapped);
  });
  test(role + ': Serra Paragon permits one graveyard play and grants its death trigger', async () => {
    const f = setup(role); card(f, 'Serra Paragon'); const c = card(f, 'Grizzly Bears', 'graveyard'); fuel(f.a);
    const offer = f.game.castableList(f.a).find(r => r.card === c && r.alt?.socMode === 'paragon'); assert.ok(offer);
    assert.equal(await f.game.castSpell(f.a, c, {from: 'graveyard', alt: offer.alt}), true); await settle(f.game);
    const second = card(f, 'Sol Ring', 'graveyard'); assert.equal(f.game.castableList(f.a).some(r => r.card === second), false);
    await f.game.sacrifice(f.a, c); await settle(f.game); assert.equal(c.zone, 'exile'); assert.equal(f.a.life, 42);
  });
  test(role + ': a stale Serra Paragon offer cannot bypass the source or mana cost', async () => {
    const f = setup(role), s = card(f, 'Serra Paragon'), c = card(f, 'Sol Ring', 'graveyard'); fuel(f.a);
    const offer = f.game.castableList(f.a).find(r => r.card === c); assert.ok(offer);
    assert.equal(await f.game.castSpell(f.a, c, {from: 'graveyard', alt: {...offer.alt, free: true}}), false);
    await f.game.move(s, 'exile'); assert.equal(await f.game.castSpell(f.a, c, {from: 'graveyard', alt: offer.alt}), false);
  });
  test(role + ': Containment Construct permits the discarded land only this turn', async () => {
    const f = setup(role); card(f, 'Containment Construct'); const c = card(f, 'Forest', 'hand');
    choose(f, (p, q) => q.type === 'chooseCards' && q.from.includes(c) ? [c] : undefined);
    await f.game.discard(f.a, [c]); await settle(f.game); assert.equal(c.zone, 'exile'); assert.ok(f.game.playableLands(f.a).includes(c));
    f.game.turnNo++; assert.equal(f.game.playableLands(f.a).includes(c), false);
  });
  test(role + ': Conspiracy Theorist offers one of all simultaneously discarded nonlands', async () => {
    const f = setup(role); card(f, 'Conspiracy Theorist'); const a = card(f, 'Sol Ring', 'hand'), b = card(f, 'Grizzly Bears', 'hand');
    choose(f, (p, q) => q.type === 'chooseCards' && q.from.includes(b) ? [b] : undefined);
    await f.game.discard(f.a, [a, b]); await settle(f.game); assert.equal(a.zone, 'graveyard'); assert.equal(b.zone, 'exile');
  });
  test(role + ': Hofri returns the exiled card only when its Spirit copy leaves', async () => {
    const f = setup(role); card(f, 'Hofri Ghostforge'); const c = body(f);
    await f.game.sacrifice(f.a, c); await settle(f.game); assert.equal(c.zone, 'exile'); const copy = spirits(f)[0]; assert.ok(copy); assert.equal(copy.power, 3);
    await f.game.move(copy, 'exile'); await settle(f.game); assert.equal(c.zone, 'graveyard');
  });
  test(role + ': Lorehold Archivist prepares and pays Restore Relic', async () => {
    const f = setup(role), s = card(f, 'Lorehold Archivist'), c = card(f, 'Sol Ring', 'graveyard'); body(f); card(f, 'Grizzly Bears', 'graveyard'); card(f, 'Wind Drake', 'graveyard'); aim(f, c);
    await event(f, 'upkeep', {player: f.a}); await prepared(f, s, 'Restore Relic'); assert.equal(c.zone, 'exile'); assert.ok(f.game.bf().some(c => c.isToken && c.name === 'Sol Ring'));
  });
  test(role + ': Kirol prepares Pack a Punch after a graveyard departure', async () => {
    const f = setup(role), s = card(f, 'Kirol, History Buff'), c = card(f, 'Forest', 'graveyard'), b = body(f); aim(f, b);
    await f.game.move(c, 'exile'); await settle(f.game); await prepared(f, s, 'Pack a Punch'); assert.equal(count(b), 2); assert.ok(b.kw('trample'));
  });
  test(role + ': Naktamun Lorespinner prepares Wheel of Fortune and discards before drawing', async () => {
    const f = setup(role), s = card(f, 'Naktamun Lorespinner'); await event(f, 'upkeep', {player: f.a}); await prepared(f, s, 'Wheel of Fortune'); assert.equal(f.a.hand.length, 7); assert.equal(f.b.hand.length, 7);
  });
  test(role + ': Scriv attaches a Contract and rewards attacks at your opponent', async () => {
    const f = setup(role, 3), b = body(f, f.b); aim(f, b); await play(f, 'Scriv, the Obligator');
    const aura = f.game.bf().find(c => c.name === 'Contract'); assert.ok(aura); assert.equal(aura.attachedTo, b.iid);
    b.attacking = f.game.players[2]; await event(f, 'attacks', {card: b, player: f.b}); assert.equal(b.power, 4);
    b.attacking = f.a; await event(f, 'attacks', {card: b, player: f.b}); assert.equal(f.b.life, 38);
  });
  test(role + ': Changing Loyalty returns its enchanted creature under your control', async () => {
    const f = setup(role), b = body(f, f.b); aim(f, b); f.x = 0; await play(f, 'Changing Loyalty');
    await f.game.sacrifice(f.b, b); await settle(f.game); assert.equal(b.zone, 'battlefield'); assert.equal(b.ctrl, f.a);
  });
  test(role + ': Coercive Impetus grants goad and draws on the enchanted attack', async () => {
    const f = setup(role), b = body(f, f.b); aim(f, b); await play(f, 'Coercive Impetus'); assert.ok(f.game.goadersOf(b).includes(f.a));
    await event(f, 'attacks', {card: b, player: f.b}); assert.equal(f.a.hand.length, 1); assert.equal(f.a.life, 39);
  });
  test(role + ': Eriette forbids attacks at you and drains for your Auras', async () => {
    const f = setup(role), b = body(f, f.b); card(f, 'Eriette of the Charmed Apple'); aim(f, b); await play(f, "Raffine's Guidance");
    assert.equal(f.game.canAttackTarget(b, f.a), false); await event(f, 'endStep', {player: f.a}); assert.equal(f.b.life, 39); assert.equal(f.a.life, 41);
  });
  test(role + ': Flickering Ward protects its host while remaining attached and can return to hand', async () => {
    const f = setup(role), b = body(f); choose(f, (p, q) => q.type === 'chooseTargets' ? [b] : q.type === 'chooseOption' && q.options.some(o => o.key === 'W') ? 'W' : undefined);
    const a = await play(f, 'Flickering Ward'); assert.equal(a.zone, 'battlefield'); assert.equal(a.attachedTo, b.iid); assert.ok(f.game.isProtectedFrom(b, a)); await activate(f, a); assert.equal(a.zone, 'hand');
  });
  test(role + ': Raffine’s Guidance pays its graveyard alternative cost', async () => {
    const f = setup(role), b = body(f), c = card(f, "Raffine's Guidance", 'graveyard'); aim(f, b); fuel(f.a);
    const offer = f.game.castableList(f.a).find(r => r.card === c); const before = mana(f.a); assert.ok(offer);
    assert.equal(await f.game.castSpell(f.a, c, {from: 'graveyard', alt: offer.alt}), true); await settle(f.game); assert.equal(before - mana(f.a), 3); assert.equal(b.power, 3);
  });
  test(role + ': Hateful Eidolon draws for each Aura you controlled on a dying creature', async () => {
    const f = setup(role), b = body(f, f.b); card(f, 'Hateful Eidolon'); aim(f, b); await play(f, "Raffine's Guidance"); await f.game.sacrifice(f.b, b); await settle(f.game); assert.equal(f.a.hand.length, 1);
  });
  test(role + ': Killian, Ink Duelist discounts a creature-targeted spell', async () => {
    const f = setup(role), b = body(f, f.b); card(f, 'Killian, Ink Duelist'); aim(f, b); const spell = card(f, 'Murder', 'hand'); fuel(f.a); const before = mana(f.a);
    assert.equal(await f.game.castSpell(f.a, spell, {from: 'hand'}), true); assert.equal(before - mana(f.a), 2); await settle(f.game); assert.equal(b.zone, 'graveyard');
  });
  test(role + ': Eiganjo Dynastorian prepares Replenish after two attackers', async () => {
    const f = setup(role), s = card(f, 'Eiganjo Dynastorian'), b = body(f), e = card(f, 'Ghostly Prison', 'graveyard');
    await event(f, 'attackersDeclared', {player: f.a, attackers: [s, b]}); await prepared(f, s, 'Replenish'); assert.equal(e.zone, 'battlefield');
  });
  test(role + ': Defacing Duskmage prepares on the second opposing draw', async () => {
    const f = setup(role), s = card(f, 'Defacing Duskmage'); await f.game.draw(f.b, 1); await settle(f.game); assert.equal(!!s.meta.prepared, false);
    await f.game.draw(f.b, 1); await settle(f.game); await prepared(f, s, "Vandal's Edit"); assert.equal(f.a.hand.length, 2); assert.equal(f.a.life, 38); assert.equal(f.b.life, 38);
  });
  test(role + ': Gorma counts earlier creature deaths for entering nontoken creatures', async () => {
    const f = setup(role), g = card(f, 'Gorma, the Gullet'), b = body(f); await f.game.sacrifice(f.a, b); await settle(f.game); assert.equal(count(g), 1);
    const c = await play(f, 'Grizzly Bears'); assert.equal(count(c), 1); const [token] = await f.game.makeTokens(M.TOKENS.pest, f.a); assert.equal(count(token), 0);
  });
  test(role + ': Ominous Harvest counts dead permanents for gravestorm', async () => {
    const f = setup(role), c = card(f, 'Sol Ring'); await f.game.sacrifice(f.a, c); aim(f, f.b); await play(f, 'Ominous Harvest'); assert.equal(f.b.life, 38); assert.equal(f.b.hand.length, 2);
  });
  test(role + ': gravestorm includes sacrificed tokens and ignores discarded cards', async () => {
    const f = setup(role), [token] = await f.game.makeTokens(M.TOKENS.pest, f.a), discarded = card(f, 'Forest', 'hand');
    await f.game.sacrifice(f.a, token); await settle(f.game); await f.game.discard(f.a, [discarded]); aim(f, f.b);
    await play(f, 'Ominous Harvest'); assert.equal(f.b.life, 38); assert.equal(f.b.hand.length, 2);
  });
  test(role + ': Gorma does not apply its own replacement as it enters', async () => {
    const f = setup(role), b = body(f); await f.game.sacrifice(f.a, b); await settle(f.game);
    const s = await play(f, 'Gorma, the Gullet'); assert.equal(count(s), 0); const c = await play(f, 'Grizzly Bears'); assert.equal(count(c), 1);
  });
  test(role + ': Serra Paragon uses its one play for a graveyard land and grants the leave trigger', async () => {
    const f = setup(role); card(f, 'Serra Paragon'); const c = card(f, 'Forest', 'graveyard'); assert.ok(f.game.playableLands(f.a).includes(c));
    assert.equal(await f.game.playLand(f.a, c), true); assert.equal(c.zone, 'battlefield'); const spell = card(f, 'Sol Ring', 'graveyard'); fuel(f.a);
    assert.equal(f.game.castableList(f.a).some(r => r.card === spell), false); await f.game.sacrifice(f.a, c); await settle(f.game); assert.equal(c.zone, 'exile'); assert.equal(f.a.life, 42);
  });
  test(role + ': Ribtruss Roaster devours and creates that many Pests', async () => {
    const f = setup(role), a = body(f), b = body(f); choose(f, (p, q) => q.type === 'chooseCards' && q.prompt.includes('Devour') ? [a, b] : undefined);
    const s = await play(f, 'Ribtruss Roaster'); assert.equal(count(s), 2); await event(f, 'endStep', {player: f.a}); assert.equal(f.game.creatures(f.a).filter(c => c.hasSub('Pest')).length, 2);
  });
  test(role + ': Immoral Bargain sacrifices X creatures during casting', async () => {
    const f = setup(role), a = body(f), b = body(f), x = card(f, 'Sol Ring', 'battlefield', f.b), y = body(f, f.b); aim(f, x, y);
    const c = card(f, 'Immoral Bargain', 'hand'); fuel(f.a); assert.equal(await f.game.castSpell(f.a, c, {from: 'hand', xVal: 2}), true);
    assert.equal(a.zone, 'graveyard'); assert.equal(b.zone, 'graveyard'); assert.equal(x.zone, 'battlefield'); await settle(f.game); assert.equal(x.zone, 'graveyard'); assert.equal(y.zone, 'graveyard');
  });
  test(role + ': Jadar creates a single decayed Zombie and does not duplicate it', async () => {
    const f = setup(role); card(f, 'Jadar, Ghoulcaller of Nephalia'); await event(f, 'endStep', {player: f.a}); await event(f, 'endStep', {player: f.a}); assert.equal(f.game.creatures(f.a).filter(c => c.kw('decayed')).length, 1);
  });
  test(role + ': Priest pays two other creatures and then produces BB and a card', async () => {
    const f = setup(role), s = card(f, 'Priest of Forgotten Gods'); body(f); body(f); const enemy = body(f, f.b); aim(f, f.b);
    await activate(f, s); assert.equal(enemy.zone, 'graveyard'); assert.equal(f.b.life, 38); assert.equal(f.a.pool.B, 32); assert.equal(f.a.hand.length, 1);
  });
  test(role + ': Deadly Brew excludes the permanent sacrificed by its controller', async () => {
    const f = setup(role), b = body(f), old = card(f, 'Sol Ring', 'graveyard'); body(f, f.b);
    choose(f, (p, q) => q.type === 'chooseCards' && q.from.includes(old) ? [old] : undefined); await play(f, 'Deadly Brew'); assert.equal(b.zone, 'graveyard'); assert.equal(old.zone, 'hand');
  });
  test(role + ': Eccentric Pestfinder prepares Turn Stones after gaining life', async () => {
    const f = setup(role, 3), s = card(f, 'Eccentric Pestfinder'); await f.game.gainLife(f.a, 1); await event(f, 'endStep', {player: f.b}); await prepared(f, s, 'Turn Stones'); assert.equal(f.game.creatures(f.a).filter(c => c.hasSub('Pest')).length, 3);
  });
  test(role + ': Stensian Sanguinist prepares Exsanguinate from marked combat damage', async () => {
    const f = setup(role), s = card(f, 'Stensian Sanguinist'), b = body(f); aim(f, b); await event(f, 'attackersDeclared', {player: f.a, attackers: [b]}); assert.ok(b.kw('deathtouch'));
    await event(f, 'damageToPlayer', {src: b, player: f.b, n: 2, combat: true}); await prepared(f, s, 'Exsanguinate', 4); assert.equal(f.b.life, 36); assert.equal(f.a.life, 48);
  });
}
