import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();
if (!M.SCRIPTS['Worf, Defiant Commander']) vm.runInNewContext(fs.readFileSync(new URL('../src/modules/scripts-star-trek-klingon.js', import.meta.url), 'utf8'), {MTG: M});
const fixture = JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-trc-2026-10-29/assignments-klingon.json', import.meta.url), 'utf8'));
for (const c of fixture.cards) if (!M.RAW_DATA.cards[c.raw.name]) M.RAW_DATA.cards[c.raw.name] = c.raw;
M.initData(M.RAW_DATA);
const setup = (opponents = 3) => context(M, 'human', opponents);
const ctx = (game, a, src, extra = {}) => ({g: game, you: a, src, sourceZoneVersion: src.zoneVersion, targets: [], ...extra});
const ownChoice = (p, fn) => {const decide = p.controller.decide; p.controller.decide = (g, q) => fn(q) ?? decide(g, q);};
async function enter(s, name, p = s.a) {const c = put(M, s.game, p, name, 'hand'); await s.game.putPermanentOntoBattlefield(c, p); await settle(s.game); return c;}
async function declare(s, pairs) {
  const attackers = pairs.map(([c, p]) => {c.attacking = p; c.tapped = true; c.meta._attackedTurn = s.game.turnNo; return c;});
  s.game.combat = {attackers, defenders: new Map(), declaredAttackTargets: [...new Set(pairs.map(([, p]) => p))], hadAttackers: true};
  for (const c of attackers) await s.game.emit('attacks', {card: c, player: c.ctrl, defender: c.attacking});
  await s.game.emit('attackersDeclared', {player: s.a, attackers}); await settle(s.game);
}

test('all 31 assigned Klingon cards have native implementations with exact source text', () => {
  assert.equal(fixture.cards.length, 31);
  for (const {raw} of fixture.cards) {
    assert.ok(M.SCRIPTS[raw.name], raw.name); assert.equal(M.DEFS[raw.name].oracle, raw.oracle);
    assert.ok(!M.DEFS[raw.name].simplified && !M.DEFS[raw.name].autoScripted, raw.name);
  }
});

test('Battlefront accumulates declarations across combats, excludes nonplayer and entering attackers, and resets each turn', async () => {
  const s = setup(), c = put(M, s.game, s.a, 'Grizzly Bears'), d = put(M, s.game, s.a, 'Grizzly Bears');
  await declare(s, [[c, s.b]]); assert.equal(M.StarTrek.battlefront(s.game, s.a), 1);
  const entering = await s.game.makeTokens(M.StarTrek.klingon, s.a, {attacking: s.others[1]});
  assert.equal(M.StarTrek.battlefront(s.game, s.a), 1); assert.equal(entering.length, 1);
  await declare(s, [[c, s.b], [d, s.others[1]]]); assert.equal(M.StarTrek.battlefront(s.game, s.a), 2);
  s.b.lost = true; assert.equal(M.StarTrek.battlefront(s.game, s.a), 2);
  const walker = put(M, s.game, s.others[2], 'Jace Beleren'); await declare(s, [[c, walker]]); assert.equal(M.StarTrek.battlefront(s.game, s.a), 2);
  s.game.turnNo++; assert.equal(M.StarTrek.battlefront(s.game, s.a), 0);
});

test('Worf makes the printed token and exiles according to turn history with next-own-turn play permission', async () => {
  const s = setup(), worf = await enter(s, 'Worf, Defiant Commander');
  const token = s.game.creatures(s.a).find(c => c.isToken); assert.equal(token.power, 2); assert.equal(token.toughness, 1); assert.ok(token.kw('haste') && token.hasSub('Klingon') && token.hasSub('Warrior'));
  await declare(s, [[worf, s.b]]); assert.equal(s.a.exile.length, 1);
  await declare(s, [[worf, s.others[1]]]); assert.equal(s.a.exile.length, 3);
  assert.equal(s.game.c1719Permissions.length, 3); assert.ok(s.game.c1719Permissions.every(r => r.c1920UntilOwnTurn === s.a.turnsStarted + 1));
  assert.equal(s.game.playableLands(s.a).filter(c => c.zone === 'exile').length, 3);
});

test('Kurn and Martok use accumulated Battlefront; melee uses the current combat only', async () => {
  const s = setup(), kurn = put(M, s.game, s.a, 'Kurn, Son of Mogh'), colonist = put(M, s.game, s.a, 'Ferocious Colonist');
  put(M, s.game, s.a, 'Martok, Hero of the Empire');
  ownChoice(s.a, q => q.type === 'chooseTargets' ? q.candidates.slice(0, Math.min(q.max, 2)) : undefined);
  await declare(s, [[kurn, s.b], [colonist, s.others[1]]]); assert.equal(s.a.hand.length, 2); assert.equal(s.a.life, 38);
  assert.equal(kurn.counters['+1/+1'], 1); assert.equal(colonist.counters['+1/+1'], 1); assert.equal(colonist.power, 3);
  await declare(s, [[kurn, s.b]]); assert.equal(s.a.hand.length, 4); assert.equal(s.a.life, 36);
});

test('Kor sacrifices another creature, draws once and buffs only Klingons and Warriors', async () => {
  const s = setup(), kor = put(M, s.game, s.a, 'Kor, Cause of Vengeance'), bear = put(M, s.game, s.a, 'Grizzly Bears'), other = put(M, s.game, s.a, 'Grizzly Bears');
  ownChoice(s.a, q => q.type === 'chooseCards' && q.prompt.includes('Sacrifice another') ? [bear] : undefined);
  await declare(s, [[kor, s.b]]); assert.equal(bear.zone, 'graveyard'); assert.equal(s.a.hand.length, 1); assert.equal(kor.power, 6); assert.equal(other.power, 2);
  const oldVersion = kor.zoneVersion; await s.game.move(kor, 'exile'); await s.game.putPermanentOntoBattlefield(kor, s.a);
  ownChoice(s.a, q => q.type === 'chooseCards' && q.prompt.includes('Sacrifice another') ? [kor] : undefined);
  await kor.def.triggers[0].run(ctx(s.game, s.a, kor, {sourceZoneVersion: oldVersion}));
  assert.equal(kor.zone, 'graveyard', 'a new incarnation of Kor is another creature relative to the old trigger');
});

test('Klingon entry and death synergy grants lifelink, deals damage and returns only eligible hand cards', async () => {
  const s = setup(), slinger = put(M, s.game, s.a, 'Gagh Slinger'), healer = await enter(s, 'Indelicate Healer');
  assert.equal(s.b.life, 39); assert.ok(slinger.kw('lifelink') && healer.kw('lifelink'));
  const curzon = put(M, s.game, s.a, 'Curzon Dax, Bound by Blood');
  await s.game.sacrifice(s.a, healer); await settle(s.game); assert.equal(s.b.life, 38);
  const small = put(M, s.game, s.a, 'Grizzly Bears', 'hand'); put(M, s.game, s.a, 'Gnarling Targ', 'hand');
  ownChoice(s.a, q => q.type === 'chooseCards' && q.from.includes(small) ? [small] : undefined);
  await s.game.sacrifice(s.a, curzon); await settle(s.game); assert.equal(small.zone, 'battlefield');
});

test('Promise of Kahless excludes its sacrificed creature and Voq copies graveyard characteristics with added types and menace', async () => {
  const s = setup(), sacrifice = put(M, s.game, s.a, 'Kurn, Son of Mogh'), returned = put(M, s.game, s.a, "Cha'DIch Investigator", 'graveyard'), ignored = put(M, s.game, s.a, 'Grizzly Bears', 'graveyard');
  ownChoice(s.a, q => q.type === 'chooseCards' && q.prompt.includes('Sacrifice a Klingon') ? [sacrifice] : undefined);
  const promise = put(M, s.game, s.a, 'The Promise of Kahless', 'hand'); await promise.def.resolve(ctx(s.game, s.a, promise)); await settle(s.game);
  assert.equal(sacrifice.zone, 'graveyard'); assert.equal(returned.zone, 'battlefield'); assert.equal(ignored.zone, 'graveyard');
  ownChoice(s.a, q => q.type === 'chooseCards' && q.prompt.includes('Voq:') ? [ignored] : undefined);
  const voq = await enter(s, 'Voq, Torchbearer'); assert.equal(voq.name, 'Grizzly Bears'); assert.ok(voq.hasSub('Bear') && voq.hasSub('Klingon') && voq.hasSub('Spy') && voq.kw('menace')); assert.equal(voq.power, 2);
});

test('Station thresholds gate creature status and keywords; ship-wide abilities work below threshold', () => {
  const s = setup(), warrior = put(M, s.game, s.a, 'Kurn, Son of Mogh');
  const flagship = put(M, s.game, s.a, "I.K.S. Negh'Var, Imperial Flagship"), raider = put(M, s.game, s.a, "K'Vort-Class Raider"), cruiser = put(M, s.game, s.a, "K't'inga-Class Battle Cruiser");
  assert.ok(warrior.kw('vigilance') && warrior.kw('hexproof')); assert.ok(raider.kw('hexproof')); assert.ok(!flagship.is('Creature') && !flagship.kw('flying') && !raider.kw('haste'));
  s.game.addCounters(flagship, 'charge', 10, false, s.a); s.game.addCounters(raider, 'charge', 4, false, s.a); s.game.addCounters(cruiser, 'charge', 4, false, s.a); s.game.recalc();
  assert.ok(flagship.is('Creature') && flagship.kw('flying') && flagship.kw('vigilance')); assert.ok(raider.is('Creature') && raider.kw('menace') && raider.kw('haste')); assert.ok(cruiser.is('Creature') && cruiser.kw('flying'));
  s.game.turnPlayer = s.b; s.game.recalc(); assert.ok(!raider.kw('hexproof') && !warrior.kw('hexproof'));
});

test('Kang goads both creatures only while continuously controlled and Koloth grants Tribble rules', async () => {
  const s = setup(), enemy = put(M, s.game, s.b, 'Grizzly Bears'), kang = await enter(s, 'Kang, Suspicious Captain');
  assert.ok(s.game.goadersOf(enemy).includes(s.a)); assert.ok(s.game.goadersOf(kang).includes(s.a));
  M.OracleV8Control.gain(s.game, kang, s.b); s.game.recalc(); assert.equal(s.game.goadersOf(enemy).length, 0); assert.equal(s.game.goadersOf(kang).length, 0);
  const koloth = put(M, s.game, s.a, 'Koloth, Tribble Hunter'); await s.game.emit('endStep', {player: s.a}); await settle(s.game);
  for (const p of s.game.players) {const tokens = s.game.creatures(p).filter(c => c.hasSub('Tribble')); assert.equal(tokens.length, 2); assert.ok(tokens.every(c => c.power === 2 && s.game.goadersOf(c).includes(s.a) && !s.game.canBlock(c, kang)));}
  await s.game.move(koloth, 'exile'); s.game.recalc(); assert.ok(s.game.creatures(s.a).filter(c => c.hasSub('Tribble')).every(c => c.power === 1));
});

test('Grilka borrows its target and gives combat damage tapped Treasures; Right of Vengeance survives source departure', async () => {
  const s = setup(), enemy = put(M, s.game, s.b, 'Grizzly Bears'); enemy.tapped = true;
  await enter(s, 'Grilka, Widowed Warrior'); assert.equal(enemy.ctrl, s.a); assert.equal(enemy.tapped, false); assert.ok(enemy.kw('trample') && enemy.kw('haste'));
  await s.game.emit('combatDamageToPlayer', {card: enemy, player: s.b, n: 3}); await settle(s.game);
  const treasures = s.game.bf().filter(c => c.ctrl === s.a && c.hasSub('Treasure')); assert.equal(treasures.length, 3); assert.ok(treasures.every(c => c.tapped));
  const vengeance = put(M, s.game, s.a, 'Right of Vengeance', 'graveyard'); await vengeance.def.resolve(ctx(s.game, s.a, vengeance));
  const attacker = put(M, s.game, s.b, 'Grizzly Bears'); await s.game.emit('combatDamageToPlayer', {card: attacker, player: s.a, n: 2}); await settle(s.game);
  assert.equal(attacker.zone, 'graveyard'); assert.equal(s.game.creatures(s.a).filter(c => c.isToken && c.hasSub('Klingon')).length, 1);
});

test('Own the Day discounts by turn history, untaps all declared attackers and schedules combat then main; Quartermaster retains mana', async () => {
  const s = setup(), quartermaster = put(M, s.game, s.a, "Qo'noS Quartermaster"), other = put(M, s.game, s.a, 'Grizzly Bears');
  await declare(s, [[quartermaster, s.b], [other, s.others[1]]]); assert.equal(s.a.pool.W, 1); s.game.emptyPool(); assert.equal(s.a.pool.W, 1);
  const day = put(M, s.game, s.a, 'Own the Day', 'hand'); assert.equal(s.game.spellCost(s.a, day).generic, 2);
  await day.def.resolve(ctx(s.game, s.a, day)); assert.equal(quartermaster.tapped, false); assert.equal(other.tapped, false); assert.deepEqual(Array.from(s.game._additionalPhases, p => p.kind), ['combat', 'main']);
});

test('Sword attack ability belongs to equipped creature controller and puts only a qualifying creature onto battlefield', async () => {
  const s = setup(), sword = put(M, s.game, s.a, 'The Sword of Kahless'), bearer = put(M, s.game, s.a, 'Grizzly Bears');
  const hit = put(M, s.game, s.a, 'Kurn, Son of Mogh', 'library'); const before = s.a.library.length;
  ownChoice(s.a, q => q.type === 'chooseCards' && q.from.includes(hit) ? [hit] : undefined);
  await s.game.attach(sword, bearer); assert.equal(bearer.power, 4);
  await declare(s, [[bearer, s.b]]); assert.equal(hit.zone, 'battlefield'); assert.equal(s.a.library.length, before - 1); assert.equal(bearer.power, 4);
});

test('Klingon spell discount, Beacon mana and entry investigator use their exact scopes', async () => {
  const s = setup(); put(M, s.game, s.a, 'Gagh Slinger');
  const warrior = put(M, s.game, s.a, 'Cha\'DIch Investigator', 'hand'), bear = put(M, s.game, s.a, 'Grizzly Bears', 'hand');
  assert.equal(s.game.spellCost(s.a, warrior).generic, 3); assert.equal(s.game.spellCost(s.a, bear).generic, 1);
  await s.game.putPermanentOntoBattlefield(warrior, s.a); await settle(s.game);
  assert.equal(s.game.creatures(s.a).filter(c => c.isToken && c.hasSub('Klingon')).length, 1); assert.equal(s.b.life, 38);
  const beacon = put(M, s.game, s.a, 'The Beacon of Kahless'); await declare(s, [[warrior, s.b]]);
  assert.deepEqual(JSON.parse(JSON.stringify(beacon.def.mana[1].produce(s.game, beacon, s.a))), [{W:1},{U:1},{B:1},{R:1},{G:1}]);
});

test('Squad copies and kicked Champion grant their keywords without granting them to later entrants', async () => {
  const s = setup(), original = put(M, s.game, s.a, 'Imperial Hullbreachers', 'hand'); original.meta.paidTimes = 2;
  await s.game.putPermanentOntoBattlefield(original, s.a, {entryMeta: {paidTimes: 2}, castMeta: {paidTimes: 2}}); await settle(s.game);
  assert.equal(s.game.creatures(s.a).filter(c => c.isToken && c.name === original.name).length, 2);
  const existing = put(M, s.game, s.a, 'Grizzly Bears'), champion = put(M, s.game, s.a, 'Blood-Sport Champion', 'hand'); champion.castMeta = {kicked: true};
  M.FRC.effectOn(ctx(s.game, s.a, champion), existing, (g, c) => {c.cur.cantSacrifice = true;});
  await s.game.putPermanentOntoBattlefield(champion, s.a, {castMeta: {kicked: true}}); await settle(s.game); assert.ok(existing.kw('deathtouch'));
  const later = await enter(s, 'Grizzly Bears'); assert.ok(!later.kw('deathtouch'));
});

test('Glory grants melee and Rite creates the correct number of tokens without adding Battlefront history', async () => {
  const s = setup(), glory = await enter(s, 'Glory to the Empire!'); put(M, s.game, s.a, 'Rite of Ascension');
  const before = s.game.creatures(s.a).filter(c => c.isToken); assert.equal(before.length, 3);
  await declare(s, [[before[0], s.b], [before[1], s.others[1]]]);
  const after = s.game.creatures(s.a).filter(c => c.isToken); assert.equal(after.length, 5); assert.equal(M.StarTrek.battlefront(s.game, s.a), 2); assert.equal(before[0].power, 4);
  assert.ok(after.slice(3).every(c => c.tapped && c.attacking && c.power === 2)); assert.equal(glory.zone, 'battlefield');
});

test('Alexander reveals then draws for everyone and chooses an opponent at random; Gorkon can target up to two creatures', async () => {
  const s = setup(), alexander = put(M, s.game, s.a, "Alexander, Ship's Fool"), top = put(M, s.game, s.b, 'Gnarling Targ', 'library');
  await alexander.def.abilities[0].run(ctx(s.game, s.a, alexander)); assert.equal(top.zone, 'hand'); assert.ok(s.game.players.every(p => p.hand.length === 1)); assert.equal(s.others.reduce((n, p) => n + 40 - p.life, 0), 5);
  const gorkon = put(M, s.game, s.a, 'Chancellor Gorkon'), a = put(M, s.game, s.b, 'Grizzly Bears'), b = put(M, s.game, s.others[1], 'Grizzly Bears');
  ownChoice(s.a, q => q.type === 'chooseTargets' ? [a,b].filter(c => q.candidates.includes(c)) : undefined);
  await s.game.sacrifice(s.a, gorkon); await settle(s.game); assert.equal(a.zone, 'exile'); assert.equal(b.zone, 'exile');
});

test('Sins of the Father sacrifices only nontokens, produces Warriors and counts exiled creature cards; Cruiser targets only your warriors', async () => {
  const s = setup(), saga = put(M, s.game, s.a, 'Sins of the Father'), enemy = put(M, s.game, s.b, 'Gnarling Targ');
  await s.game.makeTokens(M.StarTrek.klingon, s.b); await saga.def.saga[0].run(ctx(s.game, s.a, saga)); await settle(s.game); assert.equal(enemy.zone, 'graveyard'); assert.equal(s.game.creatures(s.b).filter(c => c.isToken).length, 1);
  await saga.def.saga[1].run(ctx(s.game, s.a, saga)); assert.equal(s.game.creatures(s.a).filter(c => c.isToken).length, 3);
  put(M, s.game, s.b, 'Forest', 'graveyard'); await saga.def.saga[2].run(ctx(s.game, s.a, saga, {targets: [s.b]})); assert.equal(s.b.graveyard.length, 0); assert.equal(s.b.life, 39); assert.equal(s.others[1].life, 39);
  const cruiser = put(M, s.game, s.a, "K't'inga-Class Battle Cruiser"), targets = s.game.legalTargets(cruiser.def.triggers[0].targets[0], cruiser, s.a); assert.equal(targets.length, 3); assert.ok(targets.every(c => c.ctrl === s.a));
});

test('Tenor goads selected targets, Targ buffs only Klingons and Warriors, and battle cry excludes its own attacker', async () => {
  const s = setup(), tenor = put(M, s.game, s.a, 'Galvanizing Tenor'), kurn = put(M, s.game, s.a, 'Kurn, Son of Mogh'), targ = put(M, s.game, s.a, 'Gnarling Targ'), enemy = put(M, s.game, s.b, 'Grizzly Bears');
  ownChoice(s.a, q => q.type === 'chooseTargets' && q.candidates.includes(enemy) ? [enemy] : undefined);
  await declare(s, [[tenor, s.b], [kurn, s.others[1]]]); s.game.recalc();
  assert.ok(s.game.isGoaded(enemy)); assert.equal(kurn.power, 4); assert.ok(kurn.kw('trample')); assert.equal(targ.power, 4);
  const kang = put(M, s.game, s.a, 'Kang, Suspicious Captain');
  ownChoice(s.a, q => q.type === 'chooseTargets' && q.candidates.includes(kang) ? [kang] : undefined);
  enemy.attacking = s.others[2]; await s.game.emit('attackersDeclared', {player: s.b, attackers: [enemy]}); await settle(s.game); assert.equal(kang.counters['+1/+1'], 1);
  const t = setup(), hull = put(M, t.game, t.a, 'Imperial Hullbreachers'), bear = put(M, t.game, t.a, 'Grizzly Bears');
  await declare(t, [[hull, t.b], [bear, t.b]]); assert.equal(hull.power, 2); assert.equal(bear.power, 3);
});

test('Station activation taps another creature for its power and Worf permissions end after the next own turn', async () => {
  const s = setup(), ship = put(M, s.game, s.a, "K'Vort-Class Raider"), worker = put(M, s.game, s.a, 'Gnarling Targ');
  const action = s.game.activatableList(s.a).find(e => e.card === ship && e.ability.label === 'Station'); assert.ok(action);
  assert.equal(await s.game.activateAbility(s.a, action), true); assert.equal(worker.tapped, true); await settle(s.game); assert.equal(ship.counters.charge, 4); assert.ok(ship.is('Creature'));
  const worf = put(M, s.game, s.a, 'Worf, Defiant Commander'); await declare(s, [[worf, s.b]]); const exiled = s.a.exile[0];
  assert.ok(s.game.playableLands(s.a).includes(exiled)); s.game.expireOwnTurnExilePermissions(s.a); assert.ok(s.game.playableLands(s.a).includes(exiled));
  s.a.turnsStarted++; s.game.expireOwnTurnExilePermissions(s.a); assert.ok(!s.game.playableLands(s.a).includes(exiled));
});

test('unqualified Klingon or Warrior wording includes noncreature Kindred permanents', async () => {
  const s = setup(), slinger = put(M, s.game, s.a, 'Gagh Slinger'); put(M, s.game, s.a, 'Indelicate Healer');
  const axe = await enter(s, 'Obsidian Battle-Axe'); assert.ok(axe.hasSub('Warrior') && !axe.is('Creature')); assert.equal(s.b.life, 39); assert.ok(slinger.kw('lifelink'));
  const cruiser = put(M, s.game, s.a, "K't'inga-Class Battle Cruiser"); assert.ok(s.game.legalTargets(cruiser.def.triggers[0].targets[0], cruiser, s.a).includes(axe));
  const dead = put(M, s.game, s.a, 'Kurn, Son of Mogh', 'graveyard'), promise = put(M, s.game, s.a, 'The Promise of Kahless', 'hand');
  ownChoice(s.a, q => q.type === 'chooseCards' && q.prompt.includes('Sacrifice a Klingon') ? [axe] : undefined);
  await promise.def.resolve(ctx(s.game, s.a, promise)); await settle(s.game); assert.equal(axe.zone, 'graveyard'); assert.equal(dead.zone, 'battlefield');
});

test('off-turn simultaneous sacrifice choices follow active-player order', async () => {
  const s = setup(), saga = put(M, s.game, s.a, 'Sins of the Father'), order = [];
  for (const p of s.others) {
    put(M, s.game, p, 'Grizzly Bears'); const decide = p.controller.decide.bind(p.controller);
    p.controller = {...p.controller, decide: async (g, q) => {if (q.type === 'chooseCards' && q.prompt.includes('Sacrifice a nontoken')) order.push(p); return decide(g, q);}};
  }
  s.game.turnPlayer = s.others[1]; await saga.def.saga[0].run(ctx(s.game, s.a, saga));
  assert.deepEqual(order.map(p => p.idx), [s.others[1].idx, s.others[2].idx, s.b.idx]);
});
