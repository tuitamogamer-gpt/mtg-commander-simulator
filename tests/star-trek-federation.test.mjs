import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M, setup, card, body, play, activate, event, settle, fuel} from './helpers/c21-fixtures.mjs';
const assigned = JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-trc-2026-10-29/assignments-federation.json', import.meta.url))).cards;
const tokens = (f, type, p = f.a) => f.game.bf().filter(c => c.ctrl === p && c.isToken && c.hasSub(type));
const choose = (f, {targets, cards, option, yes, targetByPrompt} = {}) => {f.decide = (p, q) => {
  if (q.type === 'chooseTargets' && targetByPrompt) {const chosen = targetByPrompt(q); if (chosen) return chosen.filter(c => q.candidates.includes(c)).slice(0, q.max);}
  if (q.type === 'chooseTargets' && targets) return targets.filter(c => q.candidates.includes(c)).slice(0, q.max);
  if (q.type === 'chooseCards' && cards && cards.some(c => q.from.includes(c))) return cards.filter(c => q.from.includes(c)).slice(0, q.max);
  if (q.type === 'chooseOption' && option && q.options.some(o => o.key === option)) return option;
  if (q.type === 'chooseOption' && yes !== undefined && q.options.some(o => o.key === 'yes')) return yes ? 'yes' : 'no';
};};
const draw = async (f, n = 2, p = f.a) => {await f.game.draw(p, n); await settle(f.game);};
const counter = (c, kind = '+1/+1') => c.counters[kind] || 0;
const attack = async (f, c, p = f.b) => {c.attacking = p; f.game.phase = 'combat'; f.game.step = 'attackers'; f.game.combat = {attackers: [c]}; await event(f, 'attacks', {card: c, player: c.ctrl, target: p});};

test('all 33 Federation additions have native executable definitions and exact Oracle text', () => {
  assert.equal(assigned.length, 33);
  for (const r of assigned) {const d = M.DEFS[r.raw.name]; assert.ok(M.SCRIPTS[r.raw.name]); assert.equal(!!d.simplified, false); assert.equal(!!d.autoScripted, false); assert.equal(d.oracle, r.raw.oracle);}
});
for (const role of ['human', 'ai']) {
  test(role + ': Picard distinguishes historic mana value, then seek out triggers exactly on second draw', async () => {
    const f = setup(role), picard = card(f, 'Jean-Luc Picard, Luminary'), creature = body(f), ship = card(f, 'U.S.S. Stargazer, Here and There');
    choose(f, {targets: [creature, ship]}); const cheap = card(f, 'Sol Ring'); await event(f, 'etb', {card: cheap}); assert.equal(f.a.hand.length, 0);
    await event(f, 'etb', {card: ship}); assert.equal(f.a.hand.length, 1); await event(f, 'etb', {card: creature}); assert.equal(f.a.hand.length, 1);
    await draw(f, 1); assert.equal(counter(creature), 1); assert.equal(counter(ship, 'charge'), 2); assert.equal(counter(picard), 0);
    await draw(f, 1); assert.equal(counter(ship, 'charge'), 2);
    f.a.turnState = f.a.freshTurnState(); f.game.turnPlayer = f.b; await draw(f, 2); assert.equal(counter(ship, 'charge'), 4);
  });
  test(role + ': seek out life, counters, tapped Treasures, damage and Officers resolve through Stack', async () => {
    const f = setup(role), beverly = card(f, "Beverly Crusher, Ship's Doctor"), julian = card(f, 'Julian Bashir, Frontier Doctor');
    card(f, 'Dr. Pulaski, Cynical Clinician'); card(f, 'Rom and Leeta, Unlikely Pair'); card(f, 'Ro Laren, Double Agent'); card(f, 'Worf, Son of Mogh');
    choose(f, {targets: [beverly]}); await draw(f, 1); assert.equal(f.a.life, 40); await draw(f, 1);
    assert.equal(f.a.life, 44); assert.equal(f.b.life, 38); assert.equal(counter(beverly), 1); assert.equal(counter(julian), 1);
    assert.equal(tokens(f, 'Treasure').length, 2); assert.ok(tokens(f, 'Treasure').every(c => c.tapped)); assert.equal(tokens(f, 'Officer')[0].power, 2);
    await draw(f, 1); assert.equal(tokens(f, 'Officer').length, 1);
  });
  test(role + ': Janeway combines simultaneous Officer hits per recipient and can tap herself', async () => {
    const f = setup(role), janeway = card(f, 'Captain Janeway, Endgame'), riker = card(f, 'Commander William Riker');
    await f.game.damageBatch([{src: janeway, target: f.b, n: 3}, {src: riker, target: f.b, n: 3}], {combat: true}); await settle(f.game);
    assert.equal(f.a.hand.length, 1); assert.equal(tokens(f, 'Officer').length, 1);
    janeway.sick = true; choose(f, {cards: [janeway]}); await activate(f, janeway); assert.equal(janeway.tapped, true); assert.equal(janeway.cur.unblockable, true);
  });
  test(role + ': Parley reveals all players’ tops and counts nonlands before draws', async () => {
    const f = setup(role), c = card(f, "Ambassador K'Ehleyr"); card(f, 'Sol Ring', 'library', f.b); card(f, 'Grizzly Bears', 'library', f.others[1]);
    await event(f, 'beginCombat', {player: f.a}); assert.equal(counter(c), 2); assert.ok(f.game.players.every(p => p.hand.length === 1)); assert.ok(c.kw('vigilance'));
  });
  test(role + ': Kim checks the intervening condition again and pays counters across creatures', async () => {
    const f = setup(role), kim = card(f, 'Ensign Harry Kim, Operations'), c = body(f);
    await f.game.emit('etb', {card: c}); await f.game.flushTriggers(); f.game.addCounters(kim, '+1/+1', 2); await settle(f.game); assert.equal(counter(kim), 2);
    f.game.removeCounters(kim, '+1/+1', 1); f.game.addCounters(c, '+1/+1', 1); await activate(f, kim); assert.equal(counter(kim) + counter(c), 0); assert.equal(f.a.hand.length, 1);
  });
  test(role + ': Guinan counts newly placed counters and O’Brien doubles every kind', async () => {
    const f = setup(role), guinan = card(f, 'Guinan, Ancient Advisor'), c = body(f); c.meta._enteredTurn = f.game.turnNo;
    await activate(f, guinan); assert.equal(counter(c), 1); assert.equal(f.a.hand.length, 0); guinan.tapped = false; guinan.meta._enteredTurn = f.game.turnNo;
    await activate(f, guinan); assert.equal(f.a.hand.length, 1); const chief = card(f, "Chief Miles O'Brien"); f.game.addCounters(c, 'charge', 3); choose(f, {targets: [c]}); await draw(f, 1);
    assert.equal(counter(c), 4); assert.equal(counter(c, 'charge'), 6); assert.ok(chief);
  });
  test(role + ': Julian reanimates only creatures within current power and Data discovers four', async () => {
    const f = setup(role), julian = card(f, 'Julian Bashir, Frontier Doctor'), small = card(f, 'Grizzly Bears', 'graveyard'), huge = card(f, 'Rootbreaker Wurm', 'graveyard');
    f.game.addCounters(julian, '+1/+1', 1); choose(f, {targets: [small]}); await attack(f, julian); assert.equal(small.zone, 'battlefield'); assert.equal(huge.zone, 'graveyard');
    card(f, 'Data, Exploring Humanity'); const found = card(f, 'Sol Ring', 'library'); card(f, 'Forest', 'library'); card(f, 'Forest', 'library'); await draw(f, 2);
    assert.ok(['hand', 'battlefield'].includes(found.zone));
  });
  test(role + ': Spot creates Food for nontoken legends and spends it to destroy an artifact', async () => {
    const f = setup(role), spot = await play(f, 'Spot, Felis catus'); assert.equal(tokens(f, 'Food').length, 1);
    const legend = card(f, 'Commander William Riker'); await event(f, 'etb', {card: legend}); assert.equal(tokens(f, 'Food').length, 2);
    const artifact = card(f, 'Sol Ring', 'battlefield', f.b); choose(f, {targets: [artifact]}); await activate(f, spot); assert.equal(artifact.zone, 'graveyard'); assert.equal(tokens(f, 'Food').length, 1);
  });
  test(role + ': Geordi and Shoulders grant only their conditional evasion', async () => {
    const f = setup(role), geordi = card(f, 'Geordi La Forge, Innovator'), ordinary = body(f); card(f, 'On the Shoulders of Giants');
    assert.equal(geordi.cur.unblockable, false); assert.ok(geordi.kw('flying')); assert.equal(ordinary.kw('flying'), false);
    const ship = card(f, 'U.S.S. Stargazer, Here and There'); assert.equal(geordi.cur.unblockable, true); await f.game.damageAny(geordi, f.b, 2, {combat: true}); await settle(f.game); assert.equal(f.a.hand.length, 1);
    await f.game.move(ship, 'exile'); assert.equal(geordi.cur.unblockable, false);
  });
  test(role + ': Kes draws after adding the counter and sacrifices at nine', async () => {
    const f = setup(role), kes = card(f, 'Kes, Evolving Telepath'); f.game.addCounters(kes, 'time', 8); await event(f, 'endStep', {player: f.a}); assert.equal(f.a.hand.length, 9); assert.equal(kes.zone, 'graveyard');
  });
  test(role + ': B’Elanna surveils before revealing and gains counters when no card was drawn', async () => {
    const f = setup(role), c = card(f, "B'Elanna Torres, Scrapper"); choose(f, {yes: false}); await activate(f, c); assert.equal(counter(c), 2); c.tapped = false;
    card(f, 'Sol Ring', 'library'); f.decide = (p, q) => q.type === 'scry' && q.surveil ? {top: q.cards, bottom: []} : q.type === 'chooseOption' && q.options.some(o => o.key === 'yes') ? 'yes' : undefined;
    await activate(f, c); assert.equal(f.a.hand.length, 1); assert.equal(counter(c), 2);
  });
  test(role + ': Riker draws for both players and Ro Laren pays discard as activation cost', async () => {
    const f = setup(role), riker = card(f, 'Commander William Riker'); choose(f, {targets: [f.b]}); await activate(f, riker); assert.equal(f.a.hand.length, 2); assert.equal(f.b.hand.length, 2);
    const ro = card(f, 'Ro Laren, Double Agent'); await activate(f, ro); assert.equal(f.a.hand.length, 2); assert.equal(f.a.graveyard.length, 1);
  });
  test(role + ': Reg copies copiable artifact/Illusion/haste exceptions and exiles only that token', async () => {
    const f = setup(role), reg = card(f, 'Reg Barclay, Fidgety Fantasist'), model = card(f, 'Commander William Riker'); choose(f, {targets: [model]}); await draw(f);
    const copy = tokens(f, 'Illusion')[0]; assert.ok(copy.is('Artifact')); assert.ok(copy.kw('haste')); assert.equal(copy.def.super.includes('Legendary'), false); assert.equal(copy.name, model.name);
    await event(f, 'endStep', {player: f.b}); assert.notEqual(copy.zone, 'battlefield'); assert.equal(reg.zone, 'battlefield');
  });
  test(role + ': Paris and Fontaine buff the current team and selected targets until cleanup', async () => {
    const f = setup(role), paris = card(f, 'Tom Paris, Risk-Taker'), vic = card(f, 'Vic Fontaine, One Night Only'), c = body(f); choose(f, {targets: [c]}); await draw(f);
    for (const kw of ['flying', 'double strike', 'vigilance', 'haste', 'lifelink']) assert.ok(c.kw(kw), kw); assert.equal(c.power, 4); assert.equal(paris.kw('lifelink'), false); assert.equal(vic.kw('double strike'), true);
    const late = body(f); assert.equal(late.kw('flying'), false);
  });
}

test('Ezri copies only the current graveyard object put there from the battlefield this turn', async () => {
  const f = setup(), valid = card(f, 'Commander William Riker'), invalid = card(f, 'Rootbreaker Wurm', 'graveyard');
  await f.game.destroy(valid); choose(f, {cards: [valid]}); const ezri = await play(f, 'Ezri Dax, Newly Joined'); assert.equal(ezri.name, 'Ezri Dax, Newly Joined'); assert.equal(ezri.power, 3); assert.ok(ezri.hasSub('Trill')); assert.ok(ezri.hasSub('Human')); assert.ok(ezri.kw('haste'));
  await f.game.move(ezri, 'exile'); await f.game.move(valid, 'hand'); await f.game.move(valid, 'graveyard'); choose(f, {cards: [valid, invalid]}); const other = await play(f, 'Ezri Dax, Newly Joined'); assert.equal(other.power, 2);
});
test('Temporal Tribulation exiles exactly two permanents and returns them to their owners next end step', async () => {
  const f = setup(), a = body(f), b = card(f, 'Sol Ring'); choose(f, {targets: [a, b]}); await play(f, 'Temporal Tribulation'); assert.equal(a.zone, 'exile'); assert.equal(b.zone, 'exile');
  await f.game.move(b, 'hand'); await f.game.move(b, 'exile'); await event(f, 'endStep', {player: f.b}); assert.equal(a.zone, 'battlefield'); assert.equal(b.zone, 'exile');
});
test('Tuvok reselects up to two attackers only when entering in declare attackers', async () => {
  const f = setup(), a = body(f, f.b), b = card(f, 'Rootbreaker Wurm', 'battlefield', f.b); a.attacking = f.a; b.attacking = f.a; f.game.phase = 'combat'; f.game.step = 'attackers'; f.game.turnPlayer = f.b;
  choose(f, {targets: [a, b], option: '1'}); await play(f, 'Tuvok, Chief Tactical Officer'); assert.equal(a.attacking, f.others[1]); assert.equal(b.attacking, f.others[1]);
});
test('Troi targets only the active opponent and draws when that opponent declines', async () => {
  const f = setup(), troi = card(f, 'Cmdr. Troi, Outgoing Empath'); f.game.turnPlayer = f.b;
  choose(f, {targets: [f.b]}); await activate(f, troi); assert.equal(f.a.hand.length, 1);
  troi.tapped = false; f.game.turnPlayer = f.a; assert.equal(f.game.activatableList(f.a).some(e => e.card === troi), false);
});
test('Troi copies a permanent spell cast for free by the active opponent', async () => {
  const f = setup(), troi = card(f, 'Cmdr. Troi, Outgoing Empath'), ring = card(f, 'Sol Ring', 'hand', f.b); f.game.turnPlayer = f.b;
  choose(f, {targets: [f.b], cards: [ring]}); await activate(f, troi); assert.equal(ring.zone, 'battlefield'); assert.equal(ring.ctrl, f.b); assert.ok(f.game.bf().some(c => c.ctrl === f.a && c.name === 'Sol Ring' && c.isToken)); assert.equal(f.a.hand.length, 0);
});
test('Unification executes all three chapters with owner draw, Spacecraft entry and mutual draw', async () => {
  const f = setup(), creature = body(f, f.b); choose(f, {targets: [creature]}); const saga = await play(f, 'Unification'); assert.equal(creature.zone, 'library'); assert.equal(f.b.hand.length, 2);
  const ship = card(f, 'U.S.S. Stargazer, Here and There', 'graveyard'); choose(f, {cards: [ship]}); f.game.addCounters(saga, 'lore', 1); await settle(f.game); assert.equal(ship.zone, 'battlefield');
  choose(f, {targets: [f.b]}); f.game.addCounters(saga, 'lore', 1); await settle(f.game); assert.equal(f.a.hand.length, 2); assert.equal(f.b.hand.length, 4); assert.equal(saga.zone, 'graveyard');
});
test('Spacecraft station uses another sick creature, current power and exact source incarnation', async () => {
  const f = setup(), ship = card(f, 'U.S.S. Defiant, Tough Little Ship'), creature = body(f); creature.sick = true; choose(f, {cards: [creature]}); fuel(f.a);
  const entry = f.game.activatableList(f.a).find(e => e.card === ship); assert.ok(entry); await f.game.activateAbility(f.a, entry); f.game.addCounters(creature, '+1/+1', 3); await settle(f.game);
  assert.equal(counter(ship, 'charge'), 5); assert.ok(ship.is('Creature')); assert.ok(ship.kw('hexproof')); assert.ok(ship.kw('flying'));
  creature.tapped = false; await f.game.activateAbility(f.a, entry); await f.game.move(ship, 'exile'); await f.game.putPermanentOntoBattlefield(ship, f.a); choose(f, {targets: []}); await settle(f.game); assert.equal(counter(ship, 'charge'), 0);
});
test('Enterprise-E destroys tapped creatures; Defiant destroys an optional artifact', async () => {
  const f = setup(), dead = body(f, f.b), live = body(f); dead.tapped = true; const enterprise = await play(f, 'U.S.S. Enterprise-E, Sovereign'); assert.equal(dead.zone, 'graveyard'); assert.equal(live.zone, 'battlefield'); assert.equal(enterprise.is('Creature'), false);
  const ring = card(f, 'Sol Ring', 'battlefield', f.b); choose(f, {targets: [ring]}); const defiant = await play(f, 'U.S.S. Defiant, Tough Little Ship'); assert.equal(ring.zone, 'graveyard'); assert.equal(defiant.is('Creature'), false);
});
test('Enterprise-C wheels only discarded cards on entry and death', async () => {
  const f = setup(); card(f, 'Forest', 'hand'); card(f, 'Island', 'hand'); choose(f, {yes: true}); const ship = await play(f, 'U.S.S. Enterprise-C, Time-Tossed'); assert.equal(f.a.hand.length, 2); assert.equal(f.a.graveyard.length, 2);
  await f.game.destroy(ship); await settle(f.game); assert.equal(f.a.hand.length, 2); assert.equal(f.a.graveyard.length, 5);
});
test('Prometheus requires eight charge counters for splash and Stargazer expires at end combat', async () => {
  const f = setup(), prometheus = card(f, 'U.S.S. Prometheus, Prototype'); f.game.addCounters(prometheus, 'charge', 4); await f.game.damageAny(prometheus, f.b, 6, {combat: true}); await settle(f.game); assert.equal(f.others[1].life, 40);
  f.game.addCounters(prometheus, 'charge', 4); await f.game.damageAny(prometheus, f.b, 6, {combat: true}); await settle(f.game); assert.equal(f.others[1].life, 34);
  const ship = card(f, 'U.S.S. Stargazer, Here and There'); await attack(f, ship); assert.equal(tokens(f, 'Spacecraft').length, 0, 'externally animated ship below six has no attack ability'); f.game.addCounters(ship, 'charge', 6); await attack(f, ship); const token = tokens(f, 'Spacecraft')[0]; assert.equal(token.power, 4); assert.equal(token.toughness, 3); assert.ok(token.attacking); assert.ok(token.tapped); await event(f, 'endCombat', {player: f.a}); assert.notEqual(token.zone, 'battlefield');
});
test('Holodeck returns its exact exile when it leaves; removal before ETB prevents exile', async () => {
  const f = setup(), victim = body(f, f.b); choose(f, {targets: [victim]}); const holo = await play(f, 'Malfunctioning Holodeck'); assert.equal(victim.zone, 'exile'); await f.game.destroy(holo); assert.equal(victim.zone, 'battlefield'); assert.equal(victim.ctrl, f.b);
  const other = card(f, 'Malfunctioning Holodeck'); await f.game.emit('etb', {card: other}); await f.game.flushTriggers(); await f.game.destroy(other); await settle(f.game); assert.equal(victim.zone, 'battlefield');
});


test('Julian uses last known power after leaving but rechecks a power reduction before resolution', async () => {
  const f = setup(), julian = card(f, 'Julian Bashir, Frontier Doctor'), bear = card(f, 'Grizzly Bears', 'graveyard'); f.game.addCounters(julian, '+1/+1', 1); choose(f, {targets: [bear]});
  await f.game.emit('attacks', {card: julian, player: f.a, target: f.b}); await f.game.flushTriggers(); await f.game.destroy(julian); await settle(f.game); assert.equal(bear.zone, 'battlefield');
  const second = card(f, 'Julian Bashir, Frontier Doctor'), again = card(f, 'Grizzly Bears', 'graveyard'); f.game.addCounters(second, '+1/+1', 1); choose(f, {targets: [again]});
  await f.game.emit('attacks', {card: second, player: f.a, target: f.b}); await f.game.flushTriggers(); f.game.removeCounters(second, '+1/+1', 1); await settle(f.game); assert.equal(again.zone, 'graveyard');
});
test('Temporal Tribulation flashback pays its graveyard cost and exiles the spell', async () => {
  const f = setup(), a = body(f), b = card(f, 'Sol Ring'), spell = card(f, 'Temporal Tribulation', 'graveyard'); choose(f, {targets: [a, b]}); fuel(f.a);
  const entry = f.game.castableList(f.a).find(e => e.card === spell && e.alt?.flashback); assert.ok(entry); assert.ok(await f.game.castSpell(f.a, spell, {from: 'graveyard', alt: entry.alt})); await settle(f.game);
  assert.equal(spell.zone, 'exile'); assert.equal(a.zone, 'exile'); assert.equal(b.zone, 'exile');
});
