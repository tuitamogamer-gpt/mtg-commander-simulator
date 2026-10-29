import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M, setup, card, body, play, activate, event, settle, fuel} from './helpers/c21-fixtures.mjs';
const assigned = JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-trc-2026-10-29/assignments-landing.json', import.meta.url))).cards;
if (assigned.some(c => !M.DEFS[c.requestedName])) {
  for (const row of assigned) M.RAW_DATA.cards[row.requestedName] ||= row.raw;
  M.initData(M.RAW_DATA);
}
const tokens = (f, sub, p = f.a) => f.game.creatures(p).filter(c => c.isToken && c.hasSub(sub));
const choose = (f, config = {}) => {f.decide = (p, q) => {
  if (q.type === 'chooseTargets' && config.targets) return config.targets.filter(c => q.candidates.includes(c)).slice(0, q.max);
  if (q.type === 'chooseCards' && config.cards) return config.cards.filter(c => q.from.includes(c)).slice(0, q.max);
  if (q.type === 'chooseOption' && config.option && q.options.some(o => o.key === config.option)) return config.option;
  if (q.type === 'chooseOption' && config.yes !== undefined && q.options.some(o => o.key === 'yes')) return config.yes ? 'yes' : 'no';
};};
const land = async (f, name = 'Forest') => {const c = card(f, name, 'hand'); await f.game.putPermanentOntoBattlefield(c, f.a); await settle(f.game); return c;};
const attacks = async (f, c, defender = f.b) => {c.attacking = defender; await event(f, 'attacks', {card: c, player: c.ctrl, target: defender});};
const hits = (f, c, n = 1, player = f.b) => event(f, 'damageToPlayer', {src: c, player, n, combat: true});

test('Landing Party registers every assigned card as a native script', () => {
  assert.equal(assigned.length, 36);
  for (const row of assigned) {
    const d = M.DEFS[row.requestedName]; assert.ok(d, row.requestedName);
    assert.ok(M.SCRIPTS[row.requestedName]); assert.equal(!!d.simplified, false); assert.equal(!!d.autoScripted, false);
  }
});

test('Spock counts distinct names, casts qualifying spells free, and draws a rejected high-mana card', async () => {
  const f = setup(); card(f, 'Forest'); card(f, 'Forest'); card(f, 'Island');
  const hit = card(f, 'Grizzly Bears', 'library'); choose(f, {cards: [hit]});
  const s = await play(f, 'Commander Spock'); assert.equal(hit.zone, 'battlefield'); assert.equal(M.StarTrekLanding.names(f.game, f.a), 2);
  const high = card(f, 'Planet Killer', 'library'); choose(f, {cards: [high]});
  await attacks(f, s); assert.equal(high.zone, 'hand');
  const forest = card(f, 'Forest', 'library'); choose(f, {cards: [], yes: true});
  await attacks(f, s); assert.equal(forest.zone, 'battlefield'); assert.equal(forest.tapped, true);
});

test('Spock does not draw from an empty library', async () => {
  const f = setup(), s = card(f, 'Commander Spock'); f.a.library.length = 0;
  await attacks(f, s); assert.equal(f.a.lost, false);
});

test('Kirk searches either zone and only strengthens Spacecraft creatures', async () => {
  const f = setup(), ship = card(f, 'Starship Enterprise'), unit = body(f), target = card(f, 'Island', 'graveyard');
  choose(f, {cards: [target], option: 'graveyard'}); const k = await play(f, 'Captain Kirk, Boldly Going'); assert.equal(target.zone, 'hand'); assert.equal(unit.power, 2);
  assert.equal(ship.is('Creature'), false); ship.counters.charge = 16; f.game.recalc(); assert.equal(ship.power, 7); assert.equal(ship.toughness, 9);
  const found = card(f, 'Starship Enterprise', 'library'); choose(f, {cards: [found], option: 'both'}); await attacks(f, k); assert.equal(found.zone, 'hand');
});

test('Balance of Terror destroys another artifact and delayed blink cannot follow a changed exile identity', async () => {
  const f = setup(), artifact = card(f, 'Sol Ring', 'battlefield', f.b); choose(f, {targets: [artifact]});
  const saga = await play(f, 'Balance of Terror'); assert.equal(artifact.zone, 'graveyard');
  const c = body(f); choose(f, {targets: [c]}); f.game.addCounters(saga, 'lore', 1); await settle(f.game); assert.equal(c.zone, 'exile');
  await f.game.move(c, 'graveyard'); await f.game.move(c, 'exile'); await event(f, 'endStep', {player: f.a}); assert.equal(c.zone, 'exile');
});

test('Merciful Mandate untaps creatures outside combat and can exile the stack while ending combat', async () => {
  const f = setup(), c = body(f); c.tapped = true; await play(f, 'Merciful Mandate'); assert.equal(c.tapped, false);
  c.tapped = true; c.attacking = f.b; f.game.combat = {attackers: [c]}; f.game.phase = 'combat'; f.game.step = 'attackers';
  choose(f, {yes: true}); const spell = card(f, 'Merciful Mandate', 'hand'); fuel(f.a);
  assert.equal(await f.game.castSpell(f.a, spell, {from: 'hand'}), true); await settle(f.game);
  assert.equal(spell.zone, 'exile'); assert.equal(c.tapped, false); assert.equal(c.attacking, null); assert.equal(f.game.phase, 'main2');
});

test('M’Ress and unstationed Galileo each trigger landfall; the flying attack tier requires six charge', async () => {
  const f = setup(); card(f, "M'Ress, Crew Coordinator"); const ship = card(f, 'Shuttlecraft Galileo');
  await land(f); assert.equal(tokens(f, 'Officer').length, 3); assert.equal(ship.is('Creature'), false); assert.equal(ship.kw('flying'), false);
  ship.counters.charge = 6; f.game.recalc(); assert.equal(ship.is('Creature'), true); assert.equal(ship.kw('flying'), true);
  const c = body(f); c.attacking = f.b; choose(f, {targets: [c]}); await attacks(f, ship); assert.equal(c.kw('flying'), true);
});

test('Tribble Cluster uses its last battlefield power and creates tokens that cannot block', async () => {
  const f = setup(), c = card(f, 'Tribble Cluster'); await event(f, 'beginCombat', {player: f.a}); assert.equal(c.power, 2);
  M.C13.buff({g: f.game, you: f.a, src: c}, c, 3, 0); await f.game.destroy(c); await settle(f.game);
  assert.equal(tokens(f, 'Tribble').length, 5); for (const t of tokens(f, 'Tribble')) assert.equal(t.cur.cantBlock, true);
});

test('Colossal Clone Master copies abilities but replaces legendary status and characteristic power/toughness', async () => {
  const f = setup(); card(f, 'Forest'); card(f, 'Forest'); card(f, 'Island'); const model = card(f, 'Christine Chapel, Combat Medic'); choose(f, {cards: [model]});
  const clone = await play(f, 'Colossal Clone Master'); assert.equal(clone.name, model.name); assert.equal(clone.def.super.includes('Legendary'), false);
  assert.equal(clone.cur.basePower, 2); assert.equal(clone.cur.baseToughness, 2); assert.equal(clone.counters['+1/+1'], 2);
  await land(f, 'Plains'); assert.equal(clone.cur.basePower, 3);
});

test('Pike requires exactly two other targets and tap/untap abilities use the stack', async () => {
  const f = setup(), pike = card(f, 'Fleet Captain Christopher Pike'), a = body(f), b = body(f, f.b); a.tapped = b.tapped = true;
  choose(f, {targets: [a, b]}); await activate(f, pike, 0); assert.equal(a.tapped, false); assert.equal(b.tapped, false); assert.equal(pike.tapped, true);
  f.game.untap(pike); await activate(f, pike, 1); assert.equal(a.tapped, true); assert.equal(b.tapped, true);
});

test('Amoeba weakens a defending creature and creates its complete copy', async () => {
  const f = setup(), c = card(f, 'Giant Space Amoeba'), victim = body(f, f.b); choose(f, {targets: [victim]});
  await attacks(f, c); assert.equal(victim.power, -1); assert.equal(tokens(f, 'Germ').length, 1); assert.equal(tokens(f, 'Germ')[0].kw('flying'), true);
});

test('Uhura exiles only distinct-land-count cards, casts a qualifying spell and bottoms all uncast cards', async () => {
  const f = setup(), c = card(f, 'Lieutenant Nyota Uhura'); card(f, 'Forest'); card(f, 'Forest'); card(f, 'Island');
  const rest = card(f, 'Grizzly Bears', 'library', f.b), hit = card(f, 'Cultivate', 'library', f.b); choose(f, {cards: [hit]});
  await activate(f, c); assert.equal(hit.zone, 'graveyard'); assert.equal(rest.zone, 'library'); assert.equal(f.b.library[0], rest); assert.equal(f.b.exile.length, 0);
});

test('Sam Kirk investigates only opposing creature casts', async () => {
  const f = setup(); card(f, 'Sam Kirk, Xenoanthropologist');
  await play(f, 'Grizzly Bears'); assert.equal(f.game.bf().filter(c => c.hasSub('Clue')).length, 0);
  f.game.turnPlayer = f.b; await play(f, 'Grizzly Bears', {player: f.b}); assert.equal(f.game.bf().filter(c => c.ctrl === f.a && c.hasSub('Clue')).length, 1);
});

test('Amanda affinity and Amanda/Syndicate landfall counters are applied separately', async () => {
  const f = setup(); card(f, 'Commander Spock'); const amanda = card(f, "Amanda Grayson, Logic's Link", 'hand');
  assert.equal(f.game.spellCost(f.a, amanda).generic, 2); await f.game.putPermanentOntoBattlefield(amanda, f.a);
  card(f, 'Syndicate Liquidators'); const c = body(f); choose(f, {targets: [c]}); await land(f); assert.equal(c.counters['+1/+1'], 4);
});

test('Christine gains life by distinct names and adds two counters for each separate gain', async () => {
  const f = setup(); card(f, 'Forest'); card(f, 'Forest'); card(f, 'Island'); const life = f.a.life;
  const c = await play(f, 'Christine Chapel, Combat Medic'); assert.equal(f.a.life, life + 2); assert.equal(c.counters['+1/+1'], 2);
  await f.game.gainLife(f.a, 6); await settle(f.game); assert.equal(c.counters['+1/+1'], 4);
});

test('Janice triggers for a commander entry and attack and puts each revealed land in tapped', async () => {
  const f = setup(); card(f, 'Janice Rand, Essential Aide'); const commander = body(f); commander.commander = true;
  const hit = card(f, 'Island', 'library'), miss = card(f, 'Sol Ring', 'library'); await event(f, 'etb', {card: commander});
  assert.equal(commander.counters['+1/+1'], 1); assert.equal(hit.zone, 'battlefield'); assert.equal(hit.tapped, true); assert.equal(f.a.library[0], miss);
  await attacks(f, commander); assert.equal(commander.counters['+1/+1'], 2);
});

test('Sulu explores when tapped and grants unblockable for the turn', async () => {
  const f = setup(), c = card(f, 'Lieutenant Hikaru Sulu'), top = card(f, 'Island', 'library'); f.game.tap(c); await settle(f.game); assert.equal(top.zone, 'hand');
  const target = body(f), blocker = body(f, f.b); choose(f, {targets: [target]}); await activate(f, c); assert.equal(f.game.canBlock(blocker, target), false);
});

test('Kyle delays blinking another creature and never targets itself', async () => {
  const f = setup(), kyle = card(f, 'Chief Kyle, Transporter Tech'), c = body(f); choose(f, {targets: [c]}); await land(f);
  assert.equal(c.zone, 'exile'); assert.equal(kyle.zone, 'battlefield'); await event(f, 'endStep', {player: f.a}); assert.equal(c.zone, 'battlefield');
});

test('Scott supplies charge counters to Spacecraft and plus counters to creatures', async () => {
  const f = setup(), scott = card(f, 'Chief Montgomery Scott'); card(f, 'Forest'); card(f, 'Island'); card(f, 'Forest');
  const ship = card(f, 'Starship Enterprise', 'hand'); choose(f, {cards: [ship]}); await activate(f, scott); assert.equal(ship.counters.charge, 2); assert.equal(ship.counters['+1/+1'] || 0, 0);
  f.game.untap(scott); const c = card(f, 'Grizzly Bears', 'hand'); choose(f, {cards: [c]}); await activate(f, scott); assert.equal(c.counters['+1/+1'], 2);
});

test('Arex has a CDA in every zone and draws then puts up to three lands in tapped', async () => {
  const f = setup(); card(f, 'Forest'); card(f, 'Island'); card(f, 'Forest'); const c = card(f, 'Lt. Arex, Ever-Adapting', 'hand'); assert.equal(c.power, 2);
  const lands = ['Plains', 'Island', 'Forest'].map(n => card(f, n, 'library')); choose(f, {cards: lands}); await play(f, c.name, {card: c});
  for (const l of lands) {assert.equal(l.zone, 'battlefield'); assert.equal(l.tapped, true);} assert.equal(c.power, 3);
});

test('McCoy grows each creature on Doctor entry and grants lifelink for any kind of counter', async () => {
  const f = setup(), c = body(f); const mc = await play(f, 'McCoy, Not a Bricklayer'); assert.equal(c.counters['+1/+1'], 1); assert.equal(mc.counters['+1/+1'], 1); assert.equal(c.kw('lifelink'), true);
  c.counters = {stun: 1}; f.game.recalc(); assert.equal(c.kw('lifelink'), true); c.counters = {}; f.game.recalc(); assert.equal(c.kw('lifelink'), false);
});

test('Chekov replaces a draw with chosen land/nonland and does not emit a draw event', async () => {
  const f = setup(); card(f, 'Pavel Chekov, First Posting'); const hit = card(f, 'Sol Ring', 'library'), miss = card(f, 'Island', 'library');
  choose(f, {option: 'nonland', yes: true}); await f.game.draw(f.a, 1); await settle(f.game);
  assert.equal(hit.zone, 'hand'); assert.equal(miss.zone, 'library'); assert.equal(f.a.turnState.cardsDrawn || 0, 0);
});

test('T’Pring tracks both fighters dying simultaneously and draws for each', async () => {
  const f = setup(), a = body(f), b = body(f, f.b); choose(f, {targets: [a, b], yes: true}); const before = f.a.hand.length;
  await play(f, "T'Pring, Never Parted"); assert.equal(a.zone, 'graveyard'); assert.equal(b.zone, 'graveyard'); assert.equal(f.a.hand.length, before + 2);
});

test('Command Chair has separate three-mana and greatest-commander-mana-value abilities', async () => {
  const f = setup(), chair = card(f, 'Command Chair'), cmd = card(f, 'Planet Killer'); cmd.commander = true;
  assert.equal(chair.def.mana[0].produce[0].W, 3); assert.equal(chair.def.mana[1].produce(f.game, chair, f.a)[0].W, 8);
  await f.game.move(cmd, 'exile'); assert.equal(chair.def.mana[1].produce(f.game, chair, f.a)[0].W, 0);
});

test('Guardian pays sacrifice as a cost and delayed return is bound to the sacrificed object', async () => {
  const f = setup(), guardian = card(f, 'The Guardian of Forever'), c = body(f); choose(f, {cards: [c]});
  await activate(f, guardian); assert.equal(c.zone, 'graveyard'); await event(f, 'endStep', {player: f.b}); assert.equal(c.zone, 'battlefield');
});

test('Jefferies Tube counters artifacts, makes your creature unblockable and draws/puts a tapped land', async () => {
  const f = setup(), tube = card(f, 'Jefferies Tube'), ship = card(f, 'Starship Enterprise'), c = body(f); choose(f, {targets: [ship]});
  await activate(f, tube, 0); assert.equal(ship.counters.charge, 2); f.game.untap(tube); choose(f, {targets: [c]}); await activate(f, tube, 1); assert.equal(c.cur.unblockable, true);
  f.game.untap(tube); const top = card(f, 'Island', 'library'); choose(f, {cards: [top]}); await activate(f, tube, 2); assert.equal(top.zone, 'battlefield'); assert.equal(top.tapped, true);
});

test('Planet Killer must attack and grows for the damaged player’s lands', async () => {
  const f = setup(), c = card(f, 'Planet Killer'); card(f, 'Forest', 'battlefield', f.b); card(f, 'Island', 'battlefield', f.b);
  assert.equal(c.kw('indestructible'), true); assert.equal(c.def.mustAttack, true); await hits(f, c); assert.equal(c.counters['+1/+1'], 2);
});

test('Botany Bay links exiled cards to this incarnation and returns only its controller’s creature cards at eight charge', async () => {
  const f = setup(), ship = card(f, 'S.S. Botany Bay'), own = card(f, 'Grizzly Bears', 'graveyard'), opponent = card(f, 'Grizzly Bears', 'graveyard', f.b);
  choose(f, {cards: [own, opponent]}); await activate(f, ship, 0); assert.equal(own.zone, 'exile'); assert.equal(opponent.zone, 'exile');
  ship.counters.charge = 8; f.game.recalc(); await hits(f, ship); assert.equal(own.zone, 'battlefield'); assert.equal(opponent.zone, 'exile');
});

test('Communicator copies its cast and grants a trigger to the equipped creature’s controller', async () => {
  const f = setup(), equipment = await play(f, 'Starfleet Communicator');
  const copy = f.game.bf().find(c => c !== equipment && c.hasSub('Communicator')); assert.ok(copy); assert.equal(copy.isToken, true);
  const a = body(f), b = body(f); await f.game.attach(equipment, a); await f.game.attach(copy, b);
  choose(f, {cards: []}); const before = f.a.hand.length; await attacks(f, a); assert.equal(f.a.hand.length, before + 1);
});

test('Enterprise landfall stations it at sixteen and combat damage draws only after the tier is active', async () => {
  const f = setup(), ship = card(f, 'Starship Enterprise'); for (let n = 0; n < 4; n++) await land(f);
  assert.equal(ship.counters.charge, 16); assert.equal(ship.is('Creature'), true); assert.equal(ship.kw('flying'), true);
  const before = f.a.hand.length; await hits(f, ship, 4); assert.equal(f.a.hand.length, before + 4);
});

test('Mirror Migrant phases itself and the selected creature without changing their zone identity', async () => {
  const f = setup(), c = body(f), version = c.zoneVersion; choose(f, {targets: [c]}); const ship = await play(f, 'U.S.S. Defiant, Mirror Migrant');
  assert.equal(ship.phasedOut, true); assert.equal(c.phasedOut, true); assert.equal(c.zoneVersion, version);
});

test('Farragut grants haste, bottoms the creature at next end step, and queues a separate draw trigger', async () => {
  const f = setup(); card(f, 'U.S.S. Farragut, Bold Explorer'); const c = card(f, 'Grizzly Bears', 'hand'); choose(f, {cards: [c]});
  await land(f); assert.equal(c.zone, 'battlefield'); assert.equal(c.kw('haste'), true); const before = f.a.hand.length;
  await event(f, 'endStep', {player: f.a}); assert.equal(c.zone, 'library'); assert.equal(f.a.library[0], c); assert.equal(f.a.hand.length, before + 1);
});

test('Cold-Blooded Crew grants entry counters and excludes power-two blockers; dual lands enter tapped and gain life', async () => {
  const f = setup(), target = body(f); choose(f, {targets: [target]}); const crew = await play(f, 'Cold-Blooded Crew'); assert.equal(target.counters['+1/+1'], 2);
  const blocker = body(f, f.b); assert.equal(f.game.canBlock(blocker, crew), false); blocker.counters['+1/+1'] = 1; f.game.recalc(); assert.equal(f.game.canBlock(blocker, crew), true);
  assert.equal(crew.def.cycling.cost, '{2}');
  for (const name of ['Earth, Sector 001', 'Risa', 'Vulcan']) {const life = f.a.life, c = await land(f, name); assert.equal(c.tapped, true); assert.equal(f.a.life, life + 1);}
});

test('Named-land counting respects nameless and overlapping multiple-name objects', () => {
  const f = setup(), a = card(f, 'Forest'), b = card(f, 'Island'), c = card(f, 'Plains');
  for (const [card, value] of [[a, ['First', 'Second']], [b, ['Second']], [c, ['Third']]]) Object.defineProperty(card, 'rulesNames', {value, configurable: true});
  assert.equal(M.StarTrekLanding.names(f.game, f.a), 2);
  Object.defineProperty(c, 'rulesNames', {value: []}); assert.equal(M.StarTrekLanding.names(f.game, f.a), 1);
});

test('Scott computes the counter kind after a Clone copies an animated Spacecraft', async () => {
  const f = setup(), scott = card(f, 'Chief Montgomery Scott'), ship = card(f, 'Starship Enterprise');
  card(f, 'Forest'); card(f, 'Island'); ship.counters.charge = 16; f.game.recalc();
  const clone = card(f, 'Colossal Clone Master', 'hand'); choose(f, {cards: [clone, ship]}); await activate(f, scott);
  assert.equal(clone.hasSub('Spacecraft'), true); assert.equal(clone.is('Creature'), false); assert.equal(clone.counters.charge, 2); assert.equal(clone.counters['+1/+1'] || 0, 0);
});

test('Station reads the tapped crew’s last power after it grows and dies with the ability pending', async () => {
  const f = setup(), ship = card(f, 'Shuttlecraft Galileo'), crew = body(f); choose(f, {cards: [crew]});
  const entry = f.game.activatableList(f.a).find(e => e.card === ship && e.ability.label === 'Station'); assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.a, entry), true); assert.equal(crew.tapped, true);
  M.C13.buff({g: f.game, you: f.a, src: crew}, crew, 4, 0); await f.game.destroy(crew); await settle(f.game);
  assert.equal(ship.counters.charge, 6);
});

test('Sulu still explores a land if he leaves before the tap trigger resolves', async () => {
  const f = setup(), sulu = card(f, 'Lieutenant Hikaru Sulu'), top = card(f, 'Island', 'library');
  f.game.tap(sulu); await f.game.move(sulu, 'exile'); await settle(f.game); assert.equal(top.zone, 'hand');
});

test('Station cannot add charge counters to a source that left and returned before resolution', async () => {
  const f = setup(), ship = card(f, 'Shuttlecraft Galileo'), crew = body(f); choose(f, {cards: [crew]});
  const entry = f.game.activatableList(f.a).find(e => e.card === ship && e.ability.label === 'Station'); assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.a, entry), true);
  await f.game.move(ship, 'exile'); await f.game.putPermanentOntoBattlefield(ship, f.a); await settle(f.game);
  assert.equal(ship.counters.charge || 0, 0);
});

test('Amoeba retains its defending player and copiable values if it leaves before its attack trigger is stacked', async () => {
  const f = setup(), amoeba = card(f, 'Giant Space Amoeba'), victim = body(f, f.b); choose(f, {targets: [victim]});
  amoeba.attacking = f.b; await f.game.emit('attacks', {card: amoeba, player: f.a, defender: f.b});
  await f.game.move(amoeba, 'exile'); await settle(f.game); assert.equal(victim.power, -1); assert.equal(tokens(f, 'Germ').length, 1);
});

test('Station uses last known toughness when Tapestry Warden modifies the crew’s station contribution', async () => {
  const f = setup(), ship = card(f, 'Shuttlecraft Galileo'), crew = card(f, 'Fleet Captain Christopher Pike'); card(f, 'Tapestry Warden'); choose(f, {cards: [crew]});
  assert.equal(crew.cur.stationByToughnessV89, true);
  const entry = f.game.activatableList(f.a).find(e => e.card === ship && e.ability.label === 'Station'); assert.ok(entry);
  assert.equal(await f.game.activateAbility(f.a, entry), true);
  M.C13.buff({g: f.game, you: f.a, src: crew}, crew, 0, 2); await f.game.destroy(crew); await settle(f.game); assert.equal(ship.counters.charge, 8);
});

test('A new Botany Bay incarnation cannot return cards linked to its old incarnation', async () => {
  const f = setup(), ship = card(f, 'S.S. Botany Bay'), own = card(f, 'Grizzly Bears', 'graveyard'); choose(f, {cards: [own]}); await activate(f, ship, 0);
  await f.game.move(ship, 'exile'); await f.game.putPermanentOntoBattlefield(ship, f.a); ship.counters.charge = 8; f.game.recalc();
  await hits(f, ship); assert.equal(own.zone, 'exile');
});

test('Farragut does not move a creature that left and returned or draw for an unperformed bottom action', async () => {
  const f = setup(); card(f, 'U.S.S. Farragut, Bold Explorer'); const c = card(f, 'Grizzly Bears', 'hand'); choose(f, {cards: [c]}); await land(f);
  await f.game.move(c, 'exile'); await f.game.putPermanentOntoBattlefield(c, f.a); const before = f.a.hand.length;
  await event(f, 'endStep', {player: f.a}); assert.equal(c.zone, 'battlefield'); assert.equal(f.a.hand.length, before);
});
