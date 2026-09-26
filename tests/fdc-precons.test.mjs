import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M, setup, card, body, play, activate, event, settle, fuel, mana} from './helpers/c21-fixtures.mjs';
import {buildIntake, precons, sourceDir} from '../scripts/import-fdc-precons.mjs';

const tokens = (f, type, p = f.a) => f.game.creatures(p).filter(c => c.isToken && c.hasSub(type));
const empty = p => {for (const k of Object.keys(p.pool)) p.pool[k] = 0; p.poolMeta = [];};
const aim = (f, ...chosen) => {f.decide = (p, q) => q.type === 'chooseTargets' ? chosen.filter(c => q.candidates.includes(c)).slice(0, q.max) : undefined;};
const yes = (p, q) => q.type === 'chooseOption' && q.options.some(o => o.key === 'yes') ? 'yes' : undefined;

test('FDC preserves five complete official lists, reuses 304 identities and adds 17 native definitions', () => {
  const intake = buildIntake(M), initial = JSON.parse(fs.readFileSync(sourceDir + '/intake.json'));
  assert.equal(initial.reusedCards, 304); assert.equal(initial.newCards, 17); assert.equal(intake.names.length, 321);
  assert.equal(intake.newNames.length, 0); assert.equal(Object.keys(M.DECKS).length, 175);
  for (const n of initial.newNames) {
    assert.ok(M.SCRIPTS[n], n); assert.ok(!M.SCRIPTS[n].autoScripted, n); assert.ok(!M.DEFS[n].simplified, n);
    assert.equal(M.CARD_CATALOG[n].deckImportEligible, true, n);
  }
  for (const row of precons) {
    const deck = M.DECKS[row.name]; assert.ok(deck, row.name);
    assert.equal(deck.cards.reduce((n, c) => n + c.n, 0), 100);
    assert.deepEqual(Array.from(M.defaultCommanders(deck)), [row.commander]);
    assert.equal(M.importCommanderDeck(fs.readFileSync(sourceDir + '/' + row.slug + '.txt', 'utf8'), {name: row.name}).ok, true);
    assert.ok(M.DECK_META[row.name]); assert.ok(M.AI_DECK_PROFILE_HINTS[row.name]);
    const guide = M.DECK_GUIDES[row.name]; assert.equal(M.DECK_GUIDE_ROUTES[guide.route].length, 3);
    for (const name of guide.keys) assert.ok(deck.cards.some(c => c.name === name), row.name + ': ' + name);
  }
});

for (const role of ['human', 'ai']) {
  test(role + ': Giada adds counters for existing Angels and restricts her mana to Angel spells', async () => {
    const f = setup(role), giada = card(f, 'Giada, Font of Hope');
    const angel = await play(f, 'Segovian Angel'); assert.equal(angel.counters['+1/+1'], 1);
    const next = await play(f, 'Angel of Vitality'); assert.equal(next.counters['+1/+1'], 2);
    empty(f.a); const source = f.game.manaSources(f.a).find(s => s.card === giada);
    assert.ok(await f.game.activateManaSource(f.a, source, source.produce[0]));
    const ring = card(f, 'Sol Ring', 'hand'); assert.equal(await f.game.castSpell(f.a, ring, {from: 'hand'}), false);
    const cheap = card(f, 'Segovian Angel', 'hand'); assert.ok(await f.game.castSpell(f.a, cheap, {from: 'hand'})); await settle(f.game);
  });
  test(role + ': Sai creates flying artifact Thopters and pays two sacrifices to draw', async () => {
    const f = setup(role), sai = card(f, 'Sai, Master Thopterist'); await play(f, 'Sol Ring'); await play(f, 'Mind Stone');
    const thopters = tokens(f, 'Thopter'); assert.equal(thopters.length, 2); assert.ok(thopters.every(c => c.is('Artifact') && c.kw('flying')));
    f.decide = (p, q) => q.type === 'chooseCards' && q.from.includes(thopters[0]) ? thopters : undefined;
    const before = f.a.hand.length; await activate(f, sai); assert.equal(f.a.hand.length, before + 1); assert.equal(tokens(f, 'Thopter').length, 0);
  });
  test(role + ': Gisa creates Zombies using the sacrificed creature’s last power', async () => {
    const f = setup(role), gisa = card(f, 'Ghoulcaller Gisa'), bear = body(f); M.FDC.buff({g: f.game, src: gisa, you: f.a}, bear, 3, 0);
    f.decide = (p, q) => q.type === 'chooseCards' && q.from.includes(bear) ? [bear] : undefined;
    await activate(f, gisa); assert.equal(bear.zone, 'graveyard'); assert.equal(tokens(f, 'Zombie').length, 5);
  });
  test(role + ': Lathliss produces a 5/5 only for another nontoken Dragon', async () => {
    const f = setup(role), lathliss = card(f, 'Lathliss, Dragon Queen'); await play(f, 'Dragon Whelp');
    assert.equal(tokens(f, 'Dragon').length, 1); assert.equal(tokens(f, 'Dragon')[0].power, 5);
    await activate(f, lathliss); assert.equal(tokens(f, 'Dragon')[0].power, 6); assert.equal(tokens(f, 'Dragon').length, 1);
  });
  test(role + ': Ghalta’s reduction covers generic mana including commander tax', async () => {
    const f = setup(role), ghalta = card(f, 'Ghalta, Primal Hunger', 'command'); ghalta.commander = true; f.a.commanders = [ghalta];
    card(f, 'Gigantosaurus'); empty(f.a); f.a.pool.G = 2;
    assert.ok(await f.game.castSpell(f.a, ghalta, {from: 'command'})); await settle(f.game); assert.equal(mana(f.a), 0); assert.ok(ghalta.kw('trample'));
    await f.game.move(ghalta, 'command'); empty(f.a); f.a.pool.G = 2;
    assert.equal(await f.game.castSpell(f.a, ghalta, {from: 'command'}), false);
    f.a.pool.C = 2; assert.ok(await f.game.castSpell(f.a, ghalta, {from: 'command'})); await settle(f.game); assert.equal(mana(f.a), 0);
  });
  test(role + ': Carnelian Orb gives haste to a Dragon creature paid with its mana', async () => {
    const f = setup(role), orb = await play(f, 'Carnelian Orb of Dragonkind'); empty(f.a);
    const source = f.game.manaSources(f.a).find(s => s.card === orb); assert.ok(await f.game.activateManaSource(f.a, source, source.produce[0]));
    f.a.pool.R++; f.a.pool.C = 2; const dragon = card(f, 'Dragon Whelp', 'hand');
    assert.ok(await f.game.castSpell(f.a, dragon, {from: 'hand'})); await settle(f.game); assert.ok(dragon.kw('haste')); assert.equal(mana(f.a), 0);
  });
  test(role + ': Carnelian mana pays for a non-Dragon creature without giving haste', async () => {
    const f = setup(role), orb = card(f, 'Carnelian Orb of Dragonkind'); empty(f.a);
    const source = f.game.manaSources(f.a).find(s => s.card === orb); await f.game.activateManaSource(f.a, source, source.produce[0]);
    const minion = card(f, 'Minion of the Mighty', 'hand'); assert.ok(await f.game.castSpell(f.a, minion, {from: 'hand'})); await settle(f.game); assert.equal(minion.kw('haste'), false);
  });
  test(role + ': Consumed by Greed sacrifices greatest power and returns the gifted graveyard target', async () => {
    const f = setup(role), small = body(f, f.b), big = card(f, 'Gigantosaurus', 'battlefield', f.b), dead = card(f, 'Wind Drake', 'graveyard'); aim(f, f.b, dead);
    const before = f.b.hand.length; await play(f, 'Consumed by Greed', {alt: {bdfGift: true}});
    assert.equal(big.zone, 'graveyard'); assert.equal(small.zone, 'battlefield'); assert.equal(dead.zone, 'hand'); assert.equal(f.b.hand.length, before + 1);
  });
  test(role + ': Consumed by Greed works without a gift or a graveyard card', async () => {
    const f = setup(role), victim = body(f, f.b); aim(f, f.b); const before = f.b.hand.length;
    await play(f, 'Consumed by Greed'); assert.equal(victim.zone, 'graveyard'); assert.equal(f.b.hand.length, before);
  });
  test(role + ': Dragonhawk counts on resolution, permits lands, expires before the delayed damage resolves', async () => {
    const f = setup(role), dragon = await play(f, "Dragonhawk, Fate's Tempest");
    const exiled = f.a.exile.slice(); assert.equal(exiled.length, 1); assert.ok(f.game.playableLands(f.a).includes(exiled[0]));
    await f.game.move(dragon, 'graveyard'); await f.game.emit('endStep', {player: f.a});
    assert.equal(f.game.playableLands(f.a).includes(exiled[0]), false); await settle(f.game); assert.equal(f.b.life, 38);
  });
  test(role + ': Dragonhawk’s separate triggers track only their own exile objects', async () => {
    const f = setup(role), dragon = card(f, "Dragonhawk, Fate's Tempest");
    await event(f, 'attacks', {card: dragon, player: f.a}); await event(f, 'attacks', {card: dragon, player: f.a}); assert.equal(f.a.exile.length, 2);
    const old = f.a.exile[0]; await f.game.move(old, 'hand'); await f.game.move(old, 'exile');
    await event(f, 'endStep', {player: f.b}); assert.equal(f.b.life, 40);
    await event(f, 'endStep', {player: f.a}); assert.equal(f.b.life, 38);
  });
  test(role + ': Fall from Favor taps a creature, creates a monarch and conditionally prevents untapping', async () => {
    const f = setup(role), bear = body(f, f.b); aim(f, bear); await play(f, 'Fall from Favor');
    assert.equal(f.game.monarch, f.a); assert.equal(bear.tapped, true); f.game.recalc(); assert.equal(bear.cur.cantUntap, true);
    await f.game.becomeMonarch(f.b); f.game.recalc(); assert.ok(!bear.cur.cantUntap);
  });
  test(role + ': Goddric’s celebration changes type and base power while retaining counters', async () => {
    const f = setup(role), goddric = await play(f, 'Goddric, Cloaked Reveler'); assert.equal(goddric.hasSub('Dragon'), false);
    f.game.addCounters(goddric, '+1/+1', 1); await play(f, 'Sol Ring');
    assert.equal(goddric.hasSub('Dragon'), true); assert.equal(goddric.hasSub('Human'), false); assert.equal(goddric.power, 5); assert.ok(goddric.kw('flying'));
    const entry = f.game.activatableList(f.a).find(e => e.card === goddric); assert.ok(entry); assert.ok(await f.game.activateAbility(f.a, entry)); await settle(f.game); assert.equal(goddric.power, 6);
    await f.game.move(f.game.bf().find(c => c.name === 'Sol Ring'), 'graveyard'); assert.equal(goddric.hasSub('Dragon'), true);
    f.a.turnState = f.a.freshTurnState(); f.game.untilEffects = []; f.game.recalc(); assert.equal(goddric.hasSub('Human'), true); assert.equal(goddric.power, 4);
  });
  test(role + ': Hit the Mother Lode discovers and then creates the correct tapped Treasures', async () => {
    const f = setup(role), hit = card(f, 'Sol Ring', 'library'); await play(f, 'Hit the Mother Lode');
    assert.notEqual(hit.zone, 'library'); const treasures = f.game.bf().filter(c => c.isToken && c.hasSub('Treasure'));
    assert.equal(treasures.length, 9); assert.ok(treasures.every(c => c.tapped));
  });
  test(role + ': Kalitas replaces opposing nontoken deaths even in a simultaneous board wipe', async () => {
    const f = setup(role), kalitas = card(f, 'Kalitas, Traitor of Ghet'), bear = body(f, f.b), drake = card(f, 'Wind Drake', 'battlefield', f.b);
    await f.game.destroyMany([kalitas, bear, drake]); await settle(f.game);
    assert.equal(kalitas.zone, 'graveyard'); assert.equal(bear.zone, 'exile'); assert.equal(drake.zone, 'exile'); assert.equal(tokens(f, 'Zombie').length, 2);
    assert.equal(f.game.diedThisTurn.some(s => s.name === 'Grizzly Bears'), false);
  });
  test(role + ': Kalitas ignores token deaths and pays another Vampire or Zombie as a cost', async () => {
    const f = setup(role), kalitas = card(f, 'Kalitas, Traitor of Ghet'); const [enemy] = await f.game.makeTokens(M.TOKENS.zombie22, f.b);
    await f.game.destroy(enemy); await settle(f.game); assert.equal(tokens(f, 'Zombie').length, 0);
    const [own] = await f.game.makeTokens(M.TOKENS.zombie22, f.a); f.decide = (p, q) => q.type === 'chooseCards' && q.from.includes(own) ? [own] : undefined;
    await activate(f, kalitas); assert.equal(own.zone, 'ceased'); assert.equal(kalitas.counters['+1/+1'], 2);
  });
  test(role + ': Minion checks attack power and puts a Dragon into combat against a chosen defender', async () => {
    const f = setup(role), minion = card(f, 'Minion of the Mighty'), giant = card(f, 'Gigantosaurus'), dragon = card(f, 'Dragon Whelp', 'hand');
    f.game.phase = 'combat'; f.game.combat = {attackers: [minion, giant]}; minion.attacking = f.b; giant.attacking = f.b;
    f.decide = (p, q) => q.type === 'chooseCards' && q.from.includes(dragon) ? [dragon] : undefined;
    await event(f, 'attacks', {card: minion, player: f.a}); assert.equal(dragon.zone, 'battlefield'); assert.ok(f.a.opponents(f.game).includes(dragon.attacking)); assert.equal(dragon.tapped, true);
  });
  test(role + ': Minion does not trigger below six attack power', async () => {
    const f = setup(role), minion = card(f, 'Minion of the Mighty'), dragon = card(f, 'Dragon Whelp', 'hand'); f.game.combat = {attackers: [minion]};
    await event(f, 'attacks', {card: minion, player: f.a}); assert.equal(dragon.zone, 'hand');
  });
  test(role + ': Ram Through splits excess damage from a trampler simultaneously', async () => {
    const f = setup(role), source = card(f, 'Ghalta, Primal Hunger'), target = body(f, f.b); aim(f, source, target);
    await play(f, 'Ram Through'); assert.equal(target.zone, 'graveyard'); assert.equal(f.b.life, 30);
  });
  test(role + ': Ram Through uses one lethal damage with deathtouch and requires both targets', async () => {
    const f = setup(role), source = card(f, 'Ghalta, Primal Hunger'), target = card(f, 'Gigantosaurus', 'battlefield', f.b);
    M.FDC.grant({g: f.game, src: source, you: f.a}, source, ['deathtouch']); aim(f, source, target);
    await play(f, 'Ram Through'); assert.equal(f.b.life, 29);
    const other = body(f, f.b), spell = card(f, 'Ram Through', 'hand'); aim(f, source, other); fuel(f.a);
    assert.ok(await f.game.castSpell(f.a, spell, {from: 'hand'})); await f.game.move(other, 'hand'); const life = f.b.life; await settle(f.game); assert.equal(f.b.life, life);
  });
  test(role + ': Razorlash returns with a counter and discounts only for four nonbasic lands', async () => {
    const f = setup(role), razor = card(f, 'Razorlash Transmogrant', 'graveyard');
    for (let n = 0; n < 4; n++) card(f, 'Swamp', 'battlefield', f.b); empty(f.a); f.a.pool.B = 2;
    assert.equal(f.game.activatableList(f.a).some(e => e.card === razor), false);
    for (const name of ['Command Tower', 'War Room', 'Bojuka Bog', 'Barren Moor']) card(f, name, 'battlefield', f.b);
    const entry = f.game.activatableList(f.a).find(e => e.card === razor && e.gyAbility); assert.ok(entry); assert.ok(await f.game.activateAbility(f.a, entry)); await settle(f.game);
    assert.equal(razor.zone, 'battlefield'); assert.equal(razor.counters['+1/+1'], 1); assert.equal(mana(f.a), 0);
    assert.equal(f.game.canBlock(razor, body(f, f.b)), false);
  });
  test(role + ': Sarkhan beholds a Dragon and grows when a Dragon enters', async () => {
    const f = setup(role), dragon = card(f, 'Dragon Whelp', 'hand');
    f.decide = (p, q) => q.type === 'chooseCards' && q.from.includes(dragon) ? [dragon] : undefined;
    const sarkhan = await play(f, 'Sarkhan, Dragon Ascendant'); assert.equal(f.game.bf().filter(c => c.hasSub('Treasure')).length, 1);
    await play(f, 'Dragon Whelp', {card: dragon}); assert.equal(sarkhan.counters['+1/+1'], 1); assert.ok(sarkhan.hasSub('Dragon')); assert.ok(sarkhan.kw('flying')); assert.ok(sarkhan.hasSub('Human'));
  });
  test(role + ': Scrapshooter gives the promised card and destroys an opposing artifact', async () => {
    const f = setup(role), artifact = card(f, 'Sol Ring', 'battlefield', f.b); aim(f, artifact); const hand = f.b.hand.length;
    const shooter = await play(f, 'Scrapshooter', {alt: {bdfGift: true}}); assert.ok(shooter.kw('reach')); assert.equal(artifact.zone, 'graveyard'); assert.equal(f.b.hand.length, hand + 1);
  });
  test(role + ': Scrapshooter without a gift keeps opposing permanents intact', async () => {
    const f = setup(role), artifact = card(f, 'Sol Ring', 'battlefield', f.b); await play(f, 'Scrapshooter'); assert.equal(artifact.zone, 'battlefield'); assert.equal(f.b.hand.length, 0);
  });
  test(role + ': Serra Avenger counts own turns and permits off-turn flash', async () => {
    const f = setup(role), avenger = card(f, 'Serra Avenger', 'hand'); fuel(f.a);
    for (const turn of [1, 2, 3]) {f.a.turnsStarted = turn; assert.equal(await f.game.castSpell(f.a, avenger, {from: 'hand'}), false);}
    f.a.turnsStarted = 4; await play(f, 'Serra Avenger', {card: avenger}); assert.ok(avenger.kw('flying') && avenger.kw('vigilance'));
    const other = card(f, 'Serra Avenger', 'hand'); card(f, 'Vedalken Orrery'); f.a.turnsStarted = 1; f.game.turnPlayer = f.b;
    assert.ok(await f.game.castSpell(f.a, other, {from: 'hand'})); await settle(f.game);
  });
  test(role + ': Elder Dragon War can read ahead to its Dragon without earlier chapters', async () => {
    const f = setup(role), bear = body(f); f.decide = (p, q) => q.type === 'chooseOption' && /Read ahead/.test(q.prompt) ? '3' : undefined;
    const saga = await play(f, 'The Elder Dragon War'); assert.equal(saga.zone, 'graveyard'); assert.equal(bear.zone, 'battlefield'); assert.equal(f.b.life, 40);
    const made = tokens(f, 'Dragon'); assert.equal(made.length, 1); assert.equal(made[0].power, 4); assert.ok(made[0].kw('flying'));
  });
  test(role + ': Elder Dragon War first chapter damages all creatures and only opponents', async () => {
    const f = setup(role), own = body(f), enemy = body(f, f.b); f.decide = (p, q) => q.type === 'chooseOption' && /Read ahead/.test(q.prompt) ? '1' : undefined;
    await play(f, 'The Elder Dragon War'); assert.equal(own.zone, 'graveyard'); assert.equal(enemy.zone, 'graveyard'); assert.equal(f.a.life, 40); assert.equal(f.b.life, 38);
  });
  test(role + ': Elder Dragon War second chapter discards and draws the selected count', async () => {
    const f = setup(role), a = card(f, 'Forest', 'hand'), b = card(f, 'Mountain', 'hand');
    f.decide = (p, q) => q.type === 'chooseOption' && /Read ahead/.test(q.prompt) ? '2' : q.type === 'chooseCards' && q.from.includes(a) ? [a, b] : undefined;
    await play(f, 'The Elder Dragon War'); assert.equal(a.zone, 'graveyard'); assert.equal(b.zone, 'graveyard'); assert.equal(f.a.hand.length, 2); assert.equal(f.b.life, 40);
  });
  test(role + ': Undead Butler mills and its optional exile creates a targeted return trigger', async () => {
    const f = setup(role), dead = card(f, 'Wind Drake', 'graveyard'); const before = f.a.library.length;
    const butler = await play(f, 'Undead Butler'); assert.equal(f.a.library.length, before - 3);
    f.decide = (p, q) => q.type === 'chooseTargets' ? [dead] : yes(p, q);
    await f.game.destroy(butler); await settle(f.game); assert.equal(butler.zone, 'exile'); assert.equal(dead.zone, 'hand');
  });
  test(role + ': Wojek investigates once per opponent with a larger hand', async () => {
    const f = setup(role, 3); await play(f, 'Wojek Investigator'); card(f, 'Forest', 'hand', f.b); card(f, 'Island', 'hand', f.others[1]);
    await event(f, 'upkeep', {player: f.a}); assert.equal(f.game.bf().filter(c => c.hasSub('Clue') && c.ctrl === f.a).length, 2);
  });
  test(role + ': Zul Ashur grants a paid Zombie cast for this turn and loses stale permission', async () => {
    const f = setup(role), zul = card(f, 'Zul Ashur, Lich Lord'), zombie = card(f, 'Undead Butler', 'graveyard'); aim(f, zombie); await activate(f, zul);
    const offer = f.game.castableList(f.a).find(r => r.card === zombie); assert.ok(offer); empty(f.a);
    assert.equal(await f.game.castSpell(f.a, zombie, {from: 'graveyard', alt: offer.alt}), false); fuel(f.a);
    assert.ok(await f.game.castSpell(f.a, zombie, {from: 'graveyard', alt: offer.alt})); await settle(f.game); assert.equal(zombie.zone, 'battlefield');
    await f.game.move(zombie, 'graveyard'); assert.equal(f.game.castableList(f.a).some(r => r.card === zombie), false);
  });
  test(role + ': Zul Ashur ward asks an opponent to pay two life', async () => {
    const f = setup(role), zul = card(f, 'Zul Ashur, Lich Lord'); aim(f, zul); const life = f.b.life;
    f.decide = (p, q) => q.type === 'chooseTargets' ? [zul] : yes(p, q);
    await play(f, 'Unsummon', {player: f.b}); assert.equal(f.b.life, life - 2); assert.equal(zul.zone, 'hand');
  });
}
