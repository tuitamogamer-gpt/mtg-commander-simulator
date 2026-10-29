import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M, setup, card, body, play, activate, event, settle, fuel} from './helpers/c21-fixtures.mjs';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

const assignment = JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-trc-2026-10-29/assignments-borg.json', import.meta.url)));
const tokens = (f, p = f.a) => f.game.creatures(p).filter(c => c.isToken && c.hasSub('Borg'));
const ctx = (f, src, you = f.a) => ({g: f.game, src, you, sourceZoneVersion: src.zoneVersion});
const choose = (f, opts = {}) => {f.decide = (p, q) => {
  if (q.type === 'chooseTargets' && opts.targets) return opts.targets.filter(c => q.candidates.includes(c)).slice(0, q.max);
  if (q.type === 'chooseCards' && opts.cards) {const selected = opts.cards.filter(c => q.from.includes(c)); if (selected.length || opts.empty) return selected.slice(0, q.max);}
  if (q.type === 'chooseOption' && opts.option && q.options.some(o => o.key === opts.option)) return opts.option;
  if (q.type === 'chooseOption' && opts.mode !== undefined && q.aiHint?.kind === 'mode') return String(opts.mode);
  if (q.type === 'chooseX' && opts.x !== undefined) return Math.min(opts.x, q.max);
  if (q.type === 'chooseMulti' && opts.modes) return opts.modes.map(String);
};};

test('Borg assignment has 37 complete native rules', () => {
  assert.equal(assignment.cards.length, 37);
  for (const c of assignment.cards) {assert.ok(M.SCRIPTS[c.raw.name], c.raw.name); assert.equal(!!M.DEFS[c.raw.name].simplified, false);}
});

test('Assimilation replaces creature types, preserves other characteristics, and applies before ETB', async () => {
  const f = setup(), source = card(f, 'Sol Ring'), victim = card(f, 'Grizzly Bears', 'exile', f.b);
  let observed;
  const emit = f.game.emit.bind(f.game); f.game.emit = async (on, d) => {if (on === 'etb' && d.card === victim) observed = {artifact: victim.is('Artifact'), borg: victim.hasSub('Borg'), bear: victim.hasSub('Bear'), n: victim.counters['+1/+1'], owner: victim.owner}; return emit(on, d);};
  await M.StarTrek.assimilate(ctx(f, source), victim); await settle(f.game);
  assert.equal(observed.owner === f.b, true); delete observed.owner;
  assert.deepEqual(observed, {artifact: true, borg: true, bear: false, n: 1}); assert.equal(victim.ctrl === f.a, true); assert.equal(victim.power, 3);
  await f.game.move(victim, 'hand'); await f.game.putPermanentOntoBattlefield(victim, f.b);
  assert.equal(victim.hasSub('Bear'), true); assert.equal(victim.is('Artifact'), false); assert.equal(victim.counters['+1/+1'] || 0, 0);
});

test('Queen exiles through a noncreature, assimilates the hit and bottoms the rest', async () => {
  const f = setup(), hit = card(f, 'Grizzly Bears', 'library', f.b), rest = card(f, 'Island', 'library', f.b); choose(f, {targets: [f.b]});
  const queen = await play(f, 'The Borg Queen');
  assert.equal(hit.ctrl === f.a, true); assert.equal(hit.power, 5); assert.equal(queen.power, 6); assert.equal(f.b.library[0] === rest, true);
  const token = (await f.game.makeTokens(M.StarTrek.borg, f.a))[0]; assert.equal(token.power, 3); assert.equal(body(f).power, 2);
});

test('Gift reveals for each opponent but assimilates exactly one creature', async () => {
  const f = setup('human', 2), a = card(f, 'Grizzly Bears', 'library', f.b), b = card(f, 'Rootbreaker Wurm', 'library', f.others[1]);
  choose(f, {cards: [b]}); await play(f, 'Gift of Perfection');
  assert.equal(b.ctrl === f.a, true); assert.equal(b.zone, 'battlefield'); assert.equal(a.zone, 'library'); assert.equal(f.b.library[0] === a, true);
});

test('Granted combat triggers belong to each artifact creature and stack independently', async () => {
  const f = setup(); card(f, 'Locutus of Borg'); card(f, 'Co-Option Adjutant'); card(f, 'Supplementation Node'); card(f, 'Hive Mind Coprocessor');
  const c = card(f, 'Command Subadjunct'), n = f.a.hand.length, life = f.a.life;
  await f.game.damageBatch([{src: c, target: f.b, n: 2}], {combat: true}); await settle(f.game);
  assert.equal(tokens(f).length, 1); assert.equal(f.a.hand.length, n + 2); assert.equal(f.a.life, life - 1); assert.equal(c.counters['+1/+1'], 1);
  await f.game.damageAny(body(f), f.b, 1, {combat: true}); await settle(f.game); assert.equal(tokens(f).length, 1);
});

test('Borg Incursion protects its newly created tokens; Regeneration covers noncreature artifacts too', async () => {
  const f = setup(), ring = card(f, 'Sol Ring'); choose(f, {option: 'R'}); await play(f, 'Borg Incursion');
  const red = card(f, 'Lightning Bolt', 'hand', f.b); assert.equal(tokens(f).length, 2); assert.ok(f.game.isProtectedFrom(tokens(f)[0], red));
  await play(f, 'Emergency Regeneration'); assert.ok(ring.kw('indestructible')); assert.ok(ring.kw('hexproof')); assert.ok(tokens(f)[0].kw('hexproof'));
});

test('Join counts only successfully destroyed nonartifact creatures and Stratagem uses last known power', async () => {
  const f = setup(), emulator = card(f, 'Stratagem Emulator'); f.game.addCounters(emulator, '+1/+1', 3);
  body(f); const safe = body(f, f.b); safe.cur.kw.add('indestructible');
  // A printed indestructible definition survives recalculation during casting.
  safe.def = {...safe.def, kws: ['indestructible']}; f.game.recalc();
  await play(f, 'Join the Collective');
  assert.equal(safe.zone, 'battlefield'); assert.equal(tokens(f).length, 6);
});

test('Station thresholds gate the entire tier and Transwarp Hub never becomes a creature', async () => {
  const f = setup(), vessel = card(f, 'Type-03 Borg Vessel');
  assert.equal(f.game.spellCost(f.a, card(f, 'Sol Ring', 'hand')).generic, 0);
  await play(f, 'Arcane Signet'); assert.equal(tokens(f).length, 0);
  f.game.addCounters(vessel, 'charge', 7); await play(f, 'Arcane Signet'); assert.equal(tokens(f).length, 1); assert.ok(vessel.is('Creature')); assert.ok(vessel.kw('flying'));
  const sphere = card(f, 'Borg Scout Sphere'), cube = card(f, 'Class-4 Tactical Cube'), hub = card(f, 'Transwarp Hub'), t = tokens(f)[0];
  assert.equal(t.kw('flying'), false); assert.equal(t.power, 1); f.game.addCounters(sphere, 'charge', 6); f.game.addCounters(cube, 'charge', 7); f.game.addCounters(hub, 'charge', 20);
  assert.ok(t.kw('flying')); assert.equal(t.power, 2); assert.equal(hub.is('Creature'), false);
  choose(f, {targets: [t]}); await activate(f, hub, 1); assert.equal(f.game.canBlock(body(f, f.b), t), false);
});

test('Station taps another creature, uses its power, and refuses instant-speed activation', async () => {
  const f = setup(), vessel = card(f, 'Type-03 Borg Vessel'), b = body(f); choose(f, {cards: [b]});
  await activate(f, vessel); assert.equal(b.tapped, true); assert.equal(vessel.counters.charge, 2);
  f.game.phase = 'combat'; b.tapped = false; assert.equal(f.game.activatableList(f.a).some(e => e.card === vessel), false);
});

test('Optimization Annex affects only artifact charge counters and obeys replacement order', async () => {
  const f = setup(), annex = card(f, 'Optimization Annex'), season = card(f, 'Doubling Season'), ring = card(f, 'Sol Ring'), b = body(f);
  f.a.v91CounterOrder = [annex.iid, season.iid]; f.game.addCounters(ring, 'charge', 2); assert.equal(ring.counters.charge, 6);
  f.a.v91CounterOrder = [season.iid, annex.iid]; f.game.addCounters(ring, 'charge', 2); assert.equal(ring.counters.charge, 11);
  f.game.addCounters(b, 'charge', 1); assert.equal(b.counters.charge, 2);
  f.game.addCounters(ring, '+1/+1', 1); assert.equal(ring.counters['+1/+1'], 2);
  f.game.addCounters(ring, 'charge', 0); assert.equal(ring.counters.charge, 11);
});

test('Seven of Nine uses a separate targeted reflexive trigger after discarding a nonland', async () => {
  const f = setup(), seven = card(f, 'Seven of Nine, Tertiary Adjunct'), ring = card(f, 'Sol Ring'), discard = card(f, 'Grizzly Bears', 'hand');
  choose(f, {cards: [discard], targets: [ring]}); await activate(f, seven);
  assert.equal(discard.zone, 'graveyard'); assert.equal(ring.counters.charge, 2); assert.equal(f.a.hand.length, 1);
  seven.tapped = false; const land = card(f, 'Forest', 'hand'); choose(f, {cards: [land], targets: [ring]}); await activate(f, seven); assert.equal(ring.counters.charge, 2);
});

test('Hub only retrieves artifacts among the five milled cards', async () => {
  const f = setup(), old = card(f, 'Sol Ring', 'graveyard'), hit = card(f, 'Arcane Signet', 'library'); choose(f, {cards: [hit]});
  await play(f, 'Transwarp Hub'); assert.equal(hit.zone, 'hand'); assert.equal(old.zone, 'graveyard'); assert.equal(f.a.graveyard.length, 5);
});

test('Võx discounts the next artifact creature and next Spacecraft independently and persists after leaving', async () => {
  const f = setup('human', 3), vox = await play(f, 'Võx, Child of the Collective'); await f.game.move(vox, 'exile');
  const creature = card(f, 'Assimilation Assessor', 'hand'), vessel = card(f, 'Type-03 Borg Vessel', 'hand');
  assert.equal(f.game.spellCost(f.a, creature).generic, 1); assert.equal(f.game.spellCost(f.a, vessel).generic, 0);
  await play(f, creature.name, {card: creature}); assert.equal(f.game.spellCost(f.a, card(f, 'Stratagem Emulator', 'hand')).generic, 2);
  assert.equal(f.game.spellCost(f.a, vessel).generic, 0); await play(f, vessel.name, {card: vessel}); assert.equal(f.game.spellCost(f.a, card(f, 'Class-4 Tactical Cube', 'hand')).generic, 3);
});

test('Wounded accepts battlefield deaths this turn, excluding mill/discard and new graveyard objects', async () => {
  const f = setup('human', 2), died = body(f, f.b), stale = body(f, f.b), milled = card(f, 'Rootbreaker Wurm', 'library', f.b), other = body(f, f.others[1]);
  await f.game.destroyMany([died, stale, other]); await f.game.mill(f.b, 1); await f.game.move(stale, 'hand'); await f.game.move(stale, 'graveyard');
  const spell = card(f, 'Assimilate the Wounded', 'hand'), specs = spell.def.targets(f.game, spell, {player: f.a});
  assert.ok(specs[0].filter(f.game, died)); assert.equal(specs[0].filter(f.game, milled), false); assert.equal(specs[0].filter(f.game, stale), false);
  choose(f, {targets: [died, other]}); await play(f, spell.name, {card: spell}); assert.equal(died.ctrl === f.a, true); assert.equal(other.ctrl === f.a, true); assert.equal(milled.zone, 'graveyard');
});

test('Assessor links its exiled creatures to its own incarnation', async () => {
  const f = setup(), hit = card(f, 'Grizzly Bears', 'graveyard', f.b); choose(f, {targets: [f.b], cards: [hit]}); const source = await play(f, 'Assimilation Assessor');
  assert.equal(hit.zone, 'exile'); await event(f, 'attacks', {card: source, player: f.a}); assert.equal(hit.ctrl === f.a, true);
  const second = card(f, 'Rootbreaker Wurm', 'graveyard', f.b); await f.game.move(source, 'hand'); await f.game.putPermanentOntoBattlefield(source, f.a); await settle(f.game);
  await f.game.move(source, 'hand'); await f.game.putPermanentOntoBattlefield(source, f.a); await settle(f.game); await event(f, 'attacks', {card: source, player: f.a}); assert.equal(second.zone, 'exile');
});

test('Wolf 359 snapshots artifact-creature count; Extraction debuffs every blocker independently', async () => {
  const f = setup(), a = card(f, 'Extraction Integrant'), b = card(f, 'Command Subadjunct'), enemy = card(f, 'Rootbreaker Wurm', 'battlefield', f.b);
  await play(f, 'Battle of Wolf 359'); assert.equal(enemy.power, 4); assert.ok(a.kw('menace')); assert.ok(b.kw('menace'));
  await event(f, 'blocks', {attacker: b, blocker: enemy}); assert.equal(enemy.power, 3);
  await f.game.move(b, 'hand'); assert.equal(enemy.power, 3);
});

test('Reclamation only sacrifices artifact creatures, including itself', async () => {
  const f = setup(), source = card(f, 'Reclamation Specialist'), ordinary = body(f), token = (await f.game.makeTokens(M.StarTrek.borg, f.a))[0];
  assert.equal(source.def.abilities[0].cost.sac(f.game, ordinary), false); choose(f, {cards: [token]}); await activate(f, source); assert.notEqual(token.zone, 'battlefield'); assert.equal(f.a.hand.length, 1);
  choose(f, {cards: [source]}); await activate(f, source); assert.equal(source.zone, 'graveyard'); assert.equal(f.a.hand.length, 2);
});

test('Best of Both Worlds links a battlefield assimilation and returns it unmodified to its owner', async () => {
  const f = setup(), victim = body(f, f.b); choose(f, {targets: [victim]}); const saga = await play(f, 'The Best of Both Worlds');
  assert.equal(victim.ctrl === f.a, true); assert.equal(victim.is('Artifact'), true); assert.equal(victim.power, 3);
  f.game.addCounters(saga, 'lore', 1); await settle(f.game); assert.equal(victim.power, 5);
  f.game.addCounters(saga, 'lore', 1); await settle(f.game); assert.equal(victim.ctrl === f.b, true); assert.equal(victim.is('Artifact'), false); assert.equal(victim.power, 2); assert.equal(saga.zone, 'graveyard');
});

test('Deliver uses the exiled permanent’s mana value; Jurati triggers once per damaged player', async () => {
  const f = setup('human', 2), enemy = card(f, 'Rootbreaker Wurm', 'battlefield', f.b); choose(f, {targets: [enemy]}); await play(f, 'Deliver from Chaos'); assert.equal(tokens(f).length, 7);
  card(f, 'Jurati, Cordial Queen'); const [a, b] = tokens(f); choose(f, {targets: [a]});
  await f.game.damageBatch([{src: a, target: f.b, n: 1}, {src: b, target: f.b, n: 1}, {src: a, target: f.others[1], n: 1}], {combat: true});
  await f.game.flushTriggers(); assert.equal(f.game.stack.filter(s => s.srcCard?.name === 'Jurati, Cordial Queen').length, 2); await settle(f.game); assert.equal(tokens(f).length, 9);
});

test('One grants all five combat keywords and an independent ward instance', () => {
  const f = setup(); card(f, 'One, Borg Evolved'); const c = card(f, 'Command Subadjunct');
  for (const k of ['flying', 'double strike', 'vigilance', 'menace', 'lifelink']) assert.ok(c.kw(k), k);
  assert.ok([c.cur.wardCost, ...c.cur.extraWards].some(w => w?.mana === '{2}'));
});

test('Reconnaissance can remove any counter, and its search enters the land tapped', async () => {
  const f = setup(), source = await play(f, 'Reconnaissance Partition'); source.sick = false; assert.equal(source.counters.charge, 2);
  f.game.removeCounters(source, 'charge', 2); f.game.addCounters(source, '+1/+1', 1); choose(f, {mode: 1}); await activate(f, source); assert.equal(source.counters['+1/+1'], 0); assert.equal(f.a.hand.length, 1);
  source.tapped = false; f.game.addCounters(source, 'charge', 1); choose(f, {mode: 0}); await activate(f, source);
  assert.equal(f.game.lands(f.a).length, 1); assert.equal(f.game.lands(f.a)[0].tapped, true);
});

test('Shore Leave copies copiable characteristics, removes legendary, adds Robot and Artifact, then expires', async () => {
  const f = setup(), source = card(f, 'Shore Leave Planet'), model = card(f, 'Locutus of Borg'); choose(f, {targets: [model]}); await activate(f, source);
  assert.equal(source.name, 'Locutus of Borg'); assert.equal(source.is('Land'), false); assert.equal(source.hasSub('Robot'), true); assert.equal(source.hasSub('Borg'), true); assert.equal(source.cur.super.includes('Legendary'), false);
  f.game.untilEffects = f.game.untilEffects.filter(e => e.expires !== 'eot'); f.game.recalc();
  assert.equal(source.name, 'Shore Leave Planet'); assert.equal(source.is('Land'), true); assert.equal(source.hasSub('Robot'), false);
});

test('Conquest counts nontoken artifact entries and doubles tokens from the sixth quest onward', async () => {
  const f = setup(), source = card(f, 'Conquest Mission'); f.game.addCounters(source, 'quest', 4); await play(f, 'Sol Ring'); assert.equal(tokens(f).length, 1);
  await play(f, 'Arcane Signet'); assert.equal(source.counters.quest, 6); assert.equal(tokens(f).length, 3);
});

test('Locutus from hand pays mana and discard, uses the stack, deals two and gains two', async () => {
  const f = setup(), source = card(f, 'Locutus, the One Who Speaks', 'hand'), target = body(f, f.b); choose(f, {targets: [target]}); fuel(f.a);
  const entry = f.game.activatableList(f.a).find(e => e.card === source && e.handAbility); assert.ok(entry); assert.ok(await f.game.activateAbility(f.a, entry)); assert.equal(source.zone, 'graveyard'); await settle(f.game);
  assert.equal(target.zone, 'graveyard'); assert.equal(f.a.life, 42);
});

test('Hugh replicate pays {2}{U} per copy and creates artifact permanent tokens', async () => {
  const f = setup(); card(f, 'Hugh, First of Many'); choose(f, {x: 2}); const spell = await play(f, 'Sol Ring');
  assert.equal(spell.castMeta.manaSpent, 7);
  assert.equal(f.game.bf().filter(c => c.name === 'Sol Ring').length, 3); assert.equal(f.game.bf().filter(c => c.name === 'Sol Ring' && c.isToken).length, 2);
});

test('Queen’s Diamond restricts its one-color mana to casting its controller’s commander', () => {
  const f = setup(), source = card(f, "Queen's Diamond"), commander = card(f, 'The Borg Queen', 'command'), spell = card(f, 'Sol Ring', 'hand'); commander.commander = true; f.game.addCounters(source, 'charge', 4);
  assert.equal(source.def.mana.produce(f.game, source)[0].W, 4);
  assert.equal(source.def.mana.restrict(f.game, {card: commander}, source), true); assert.equal(source.def.mana.restrict(f.game, {card: spell}, source), false); assert.equal(source.def.mana.restrict(f.game, {card: commander, isAbility: true}, source), false);
  const frozen = source.def.mana.freezeRestrictV20(f.game, source); source.ctrl = f.b;
  assert.equal(frozen(f.game, {card: commander}), true, 'floating mana keeps the original controller’s restriction');
});

test('Collective Override chooses both while a commander is controlled and retains that choice', async () => {
  const f = setup(), commander = card(f, 'Command Subadjunct'), a = body(f), b = body(f, f.b); commander.commander = true; a.attacking = f.b; b.attacking = f.a;
  const spell = card(f, 'Collective Override', 'hand'); choose(f, {modes: [0, 1]}); fuel(f.a);
  assert.ok(await f.game.castSpell(f.a, spell, {from: 'hand'})); await f.game.move(commander, 'exile'); await settle(f.game);
  assert.equal(tokens(f).length, 2); assert.equal(f.a.hand.length, 2);
  const before = f.a.hand.length; choose(f, {mode: 1}); await play(f, 'Collective Override'); assert.equal(f.a.hand.length, before + 2); assert.equal(tokens(f).length, 2);
});

test('Ambulatory Reactor grants restricted mana only to artifact creatures', () => {
  const f = setup(); card(f, 'Ambulatory Reactor'); const borg = card(f, 'Command Subadjunct'), bear = body(f), ring = card(f, 'Sol Ring', 'hand'), bolt = card(f, 'Lightning Bolt', 'hand');
  const mana = borg.cur.extraMana[0]; assert.ok(mana); assert.equal(bear.cur.extraMana.length, 0);
  assert.equal(mana.restrict(f.game, {card: ring}), true); assert.equal(mana.restrict(f.game, {card: bolt}), false);
  assert.equal(mana.restrict(f.game, {card: borg, isAbility: true}), true); assert.equal(mana.restrict(f.game, {card: bear, isAbility: true}), false);
});

test('Korok counts distinct declared opponents across combat phases', async () => {
  const f = setup('human', 3), korok = card(f, 'Korok, Liberated Rage'), other = body(f); korok.attacking = f.b; other.attacking = f.others[1];
  await event(f, 'attackersDeclared', {player: f.a, attackers: [korok, other]});
  await event(f, 'attacks', {player: f.a, card: korok, defender: f.b}); assert.equal(korok.power, 4); assert.equal(other.power, 4);
  await event(f, 'attacks', {player: f.a, card: korok, defender: f.others[2]}); assert.equal(korok.power, 7);
});

test('Assimilation strips new Vulcan and Officer creature types while retaining legendary', async () => {
  const f = setup(), source = card(f, 'Sol Ring'), victim = card(f, 'Tuvok, Chief Tactical Officer', 'exile', f.b);
  await M.StarTrek.assimilate(ctx(f, source), victim); await settle(f.game);
  assert.equal(victim.hasSub('Borg'), true); assert.equal(victim.hasSub('Vulcan'), false); assert.equal(victim.hasSub('Officer'), false); assert.ok(victim.cur.super.includes('Legendary'));
  const changeling = card(f, 'Universal Automaton', 'exile', f.b); await M.StarTrek.assimilate(ctx(f, source), changeling);
  assert.equal(changeling.hasSub('Borg'), true); assert.equal(changeling.hasSub('Elf'), false); assert.equal(changeling.hasSub('Shapeshifter'), false);
});

test('AI clones retain assimilation and independently consume Võx’s next-spell permissions', async () => {
  const f = nativeFixture(), vox = await f.cast('Võx, Child of the Collective', ['Island', 'Wastes', 'Wastes', 'Wastes', 'Wastes']), victim = f.put('Grizzly Bears', 'battlefield', f.rival);
  await M.StarTrek.assimilate({g: f.game, src: vox, you: f.me, sourceZoneVersion: vox.zoneVersion}, victim);
  await f.game.flushTriggers(); await f.settle();
  const next = f.put('Stratagem Emulator', 'hand'), simulation = M.cloneGameForAISimulation(f.game, 299), p = simulation.players[f.me.idx];
  const cloned = simulation.byIid(victim.iid), spell = simulation.byIid(next.iid);
  assert.equal(cloned === victim, false); assert.equal(cloned.ctrl === p, true); assert.equal(cloned.hasSub('Borg'), true); assert.equal(cloned.counters['+1/+1'], 1);
  const liveDiscount = f.game.spellCost(f.me, next).xReduction || 0;
  simulation.priorityRound = async () => {}; fuel(p);
  assert.equal(await simulation.castSpell(p, spell, {from: 'hand'}), true); await settle(simulation);
  assert.equal(simulation.spellCost(p, spell).generic, 2); assert.equal(f.game.spellCost(f.me, next).xReduction || 0, liveDiscount); assert.equal(f.game.spellCost(f.me, next).generic, 1);
});

test('AI pays for artifact sacrifice and resolves the card-draw ability through priority', async () => {
  const f = setup('ai'), source = card(f, 'Reclamation Specialist'), token = (await f.game.makeTokens(M.StarTrek.borg, f.a))[0];
  const n = f.a.hand.length; await activate(f, source);
  assert.equal(f.a.hand.length, n + 1); assert.equal([source, token].filter(c => c.zone === 'battlefield').length, 1); assert.equal((f.game.aiDecisionLog || []).some(d => d.fallback), false);
});

test('Checkpoint guard rejects active assimilation and next-spell effects instead of discarding them', async () => {
  const f = setup(), source = card(f, 'Sol Ring'), victim = body(f, f.b);
  await M.StarTrek.assimilate(ctx(f, source), victim);
  assert.ok(M.gameStateSnapshotBlockers(f.game).some(reason => /lasting effect/.test(reason)));
  assert.equal(M.canSnapshotGameState(f.game), false);
  await play(f, 'Võx, Child of the Collective'); assert.equal(M.canSnapshotGameState(f.game), false);
});

test('Maturation charges on artifact casts and uses last known charge count after removal', async () => {
  const f = setup(), chamber = await play(f, 'Maturation Chamber'); assert.equal(chamber.counters.charge || 0, 0);
  await play(f, 'Sol Ring'); assert.equal(chamber.counters.charge, 1); f.game.addCounters(chamber, 'charge', 2);
  await activate(f, chamber); assert.equal(tokens(f).length, 3);
  chamber.tapped = false; fuel(f.a); const entry = f.game.activatableList(f.a).find(e => e.card === chamber);
  assert.ok(await f.game.activateAbility(f.a, entry)); await f.game.move(chamber, 'graveyard'); await settle(f.game); assert.equal(tokens(f).length, 6);
});

test('Scout Sphere draws on entry and Tactical Cube creates its two Borg before being stationed', async () => {
  const f = setup(), sphere = await play(f, 'Borg Scout Sphere'); assert.equal(f.a.hand.length, 1); assert.equal(sphere.is('Creature'), false);
  const cube = await play(f, 'Class-4 Tactical Cube'); assert.equal(tokens(f).length, 2); assert.equal(cube.is('Creature'), false); assert.equal(tokens(f)[0].power, 1);
});

test('Võx triggers only on the first main phase that actually begins', async () => {
  const f = setup(), vox = card(f, 'Võx, Child of the Collective'), spell = card(f, 'Stratagem Emulator', 'hand');
  await event(f, 'postcombatMain', {player: f.a, ordinal: 1}); assert.equal(f.game.spellCost(f.a, spell).generic, 0);
  const n = f.game.untilEffects.filter(e => e.kind === 'trcUndaunted').length;
  await event(f, 'precombatMain', {player: f.a, ordinal: 2}); assert.equal(f.game.untilEffects.filter(e => e.kind === 'trcUndaunted').length, n); assert.equal(vox.zone, 'battlefield');
});
