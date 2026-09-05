import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

const NEW_CARDS = [
  "Eshki, Temur's Roar", 'Dragonmaster Outcast', 'Deceptive Frostkite', "Dragonlord's Servant",
  'Gadrak, the Crown-Scourge', 'Nogi, Draco-Zealot', 'Sarkhan, Soul Aflame', 'Taurean Mauler',
  'Atsushi, the Blazing Sky', 'Leyline Tyrant', 'Opportunistic Dragon', 'Parapet Thrasher',
  'Territorial Hellkite', 'Thunderbreak Regent', 'Thundermane Dragon', 'Verix Bladewing',
  'Glorybringer', 'Harbinger of the Hunt', 'Nesting Dragon', 'Rapacious Dragon', 'Skarrgan Hellkite',
  'Stormbreath Dragon', 'Stormshriek Feral', 'Whirlwing Stormbrood', 'Hammerhead Tyrant',
  'Hellkite Courser', 'Keiga, the Tide Star', 'Lathliss, Dragon Queen', 'Scourge of the Throne',
  'Atarka, World Render', 'Broodcaller Scourge', 'Dragonlord Atarka', 'Ureni of the Unwritten',
  'Spit Flame', 'Draconic Lore', 'Zenith Festival', "Kodama's Reach", 'Migration Path',
  "Storm's Wrath", 'Become the Avalanche', "Selvala's Stampede", 'Will of the Temur',
  "Dragon's Hoard", 'Dragon Tempest', 'Elemental Bond', 'Temur Ascendancy',
  'Encroaching Dragonstorm', 'Frontier Siege', 'Breaching Dragonstorm', 'Reflections of Littjara',
  'Bountiful Landscape', 'Frontier Bivouac', 'Haven of the Spirit Dragon', 'Kessig Wolf Run',
  'Rockfall Vale', 'Temple of the Dragon Queen', 'Yavimaya Coast',
];
const REUSED = ["Kodama's Reach", 'Frontier Bivouac', 'Yavimaya Coast'];

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.max;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 1).map(option => option.key);
  if (query.type === 'orderTriggers') return query.triggers;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 3) {
  const game = new MTG.Game({ seed: 250823, paced: false, maxTurns: 100 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Temur',
    { name: index ? `Opponent deck ${index}` : 'Temur Roar' },
    { decide: async (g, query) => deciders[index] ? deciders[index](g, query) : defaultDecision(g, query) },
    index > 0,
  ));
  game.turnPlayer = players[0]; game.turnNo = 20; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = opts.ctrl || player; card.zone = 'battlefield'; card.sick = false;
  game.battlefield.push(card); game.recalc(); return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone; player[zone].push(card); return card;
}

async function enter(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = 'nowhere';
  await game.move(card, 'battlefield', { ctrl: player, ...opts }); return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 800) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 800, 'Temur stack did not settle');
}

test('Temur Roar has the exact deck shell, Oracle text, and explicit scripts for all 57 intake cards', () => {
  const deck = MTG.DECKS['Temur Roar'];
  assert.equal(deck.commander, 'Ureni of the Unwritten');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 89);
  assert.equal(NEW_CARDS.length, 57);
  const report = JSON.parse(fs.readFileSync(new URL('../reports/new-deck-oracle.json', import.meta.url), 'utf8'));
  for (const name of NEW_CARDS) {
    assert.ok(MTG.SCRIPTS[name], `${name} needs an explicit script`);
    assert.ok(MTG.DEFS[name], `${name} needs a definition`);
    assert.equal(MTG.DEFS[name].simplified, undefined, `${name} may not use simplified fallback`);
    const oracle = report.cards.find(entry => entry.requestedName === name);
    if (oracle) assert.equal(MTG.DEFS[name].oracle, oracle.raw.oracle, `${name} Oracle text drifted`);
  }
  const source = fs.readFileSync(new URL('../src/modules/scripts-temur.js', import.meta.url), 'utf8');
  for (const name of REUSED) assert.equal(source.includes(`SC['${name}'] =`), false, `${name} must be reused, not reassigned`);
  assert.equal(MTG.DEFS['Thundermane Dragon'].revealOwnTop, true, 'Thundermane privately reveals the library top to its controller');
});

test('Omen halves use the shared shuffle path and Zenith Festival uses true Harmonize', async () => {
  let helper;
  const decider = (g, query) => {
    if (query.aiHint?.kind === 'harmonize') return [helper];
    if (query.type === 'chooseCards' && /Flush Out/.test(query.prompt)) return [query.from[0]];
    return defaultDecision(g, query);
  };
  const { game, players: [temur] } = rulesGame([decider], 2);
  const feral = inZone(temur, 'Stormshriek Feral', 'hand');
  const discard = inZone(temur, 'Forest', 'hand');
  inZone(temur, 'Mountain', 'library'); inZone(temur, 'Island', 'library');
  temur.pool.R = 1; temur.pool.C = 1;
  const omenCast = game.castableList(temur).find(entry => entry.card === feral && entry.alt?.omen);
  assert.ok(omenCast); assert.equal(feral.def.adventure.omen, true);
  assert.equal(await game.castSpell(temur, feral, { from: 'hand', alt: omenCast.alt }), true);
  await resolveAll(game);
  assert.equal(discard.zone, 'graveyard'); assert.equal(feral.zone, 'library');
  assert.equal(temur.hand.length, 2);

  helper = permanent(game, temur, 'Rapacious Dragon');
  const festival = inZone(temur, 'Zenith Festival', 'graveyard');
  for (let i = 0; i < 7; i++) inZone(temur, i % 2 ? 'Forest' : 'Mountain', 'library');
  temur.pool.R = 2; temur.pool.C = 0;
  const harmonize = game.castableList(temur).find(entry => entry.card === festival && entry.alt?.harmonize);
  assert.ok(harmonize); assert.equal(festival.def.harmonize.cost, '{X}{R}{R}');
  assert.equal(await game.castSpell(temur, festival, { from: 'graveyard', alt: harmonize.alt }), true);
  await resolveAll(game);
  assert.equal(helper.tapped, true); assert.equal(festival.zone, 'exile');
  assert.equal(temur.exile.filter(card => card !== festival).length, 3, 'power 3 helper pays X=3');
});

test("Selvala's Stampede performs public APNAP council voting and executes every wild/free vote", async () => {
  const revealedCounts = [];
  const picks = ['wild', 'free', 'wild'];
  const deciders = picks.map((vote, index) => (g, query) => {
    if (query.aiHint?.kind === 'vote') {
      revealedCounts[index] = query.aiHint.revealedVotes.length; return vote;
    }
    if (query.type === 'chooseCards' && /put up to/.test(query.prompt)) return [query.from[0]];
    return defaultDecision(g, query);
  });
  const { game, players: [temur] } = rulesGame(deciders, 3);
  const freePermanent = inZone(temur, "Dragon's Hoard", 'hand');
  const bottom = inZone(temur, 'Forest', 'library');
  const second = inZone(temur, 'Rapacious Dragon', 'library');
  const middle = inZone(temur, 'Island', 'library');
  const first = inZone(temur, 'Dragonmaster Outcast', 'library');
  temur.library = [bottom, second, middle, first];
  const stampede = new MTG.CardInst(MTG.DEFS["Selvala's Stampede"], temur);
  await stampede.def.resolve({ g: game, src: stampede, you: temur, targets: [], so: { castOpts: {} } });
  await resolveAll(game);
  assert.deepEqual(revealedCounts, [0, 1, 2]);
  assert.equal(first.zone, 'battlefield'); assert.equal(second.zone, 'battlefield');
  assert.equal(freePermanent.zone, 'battlefield');
  assert.equal(temur.library.includes(bottom), true); assert.equal(temur.library.includes(middle), true);
});

test('Ureni, Lathliss, Dragon Tempest, Dragon Hoard, and Atarka compose through Dragon hooks', async () => {
  const decider = (g, query) => {
    if (query.type === 'chooseCards' && /top eight/.test(query.prompt)) return [query.from[0]];
    if (query.type === 'chooseTargets') return [query.candidates.find(candidate => candidate === opponentRef) || query.candidates[0]];
    return defaultDecision(g, query);
  };
  let opponentRef;
  const { game, players: [temur, opponent] } = rulesGame([decider], 2);
  opponentRef = opponent;
  const lathliss = permanent(game, temur, 'Lathliss, Dragon Queen');
  permanent(game, temur, 'Dragon Tempest');
  const hoard = permanent(game, temur, "Dragon's Hoard");
  const atarka = permanent(game, temur, 'Atarka, World Render');
  const ureni = permanent(game, temur, 'Ureni of the Unwritten');
  for (let i = 0; i < 7; i++) inZone(temur, i % 2 ? 'Forest' : 'Island', 'library');
  const dragon = inZone(temur, 'Rapacious Dragon', 'library');
  await game.emit('etb', { card: ureni }); await resolveAll(game);
  assert.equal(dragon.zone, 'battlefield');
  assert.equal(game.creatures(temur).some(card => card.isToken && card.power === 5 && card.hasSub('Dragon')), true);
  assert.ok((hoard.counters.gold || 0) >= 2);
  assert.equal(game.bf().filter(card => card.ctrl === temur && card.hasSub('Treasure')).length, 2);
  assert.ok(opponent.life < 40, 'Dragon Tempest deals real Dragon-count damage');

  dragon.attacking = opponent; game.combat = { attackers: [dragon], blockers: new Map() };
  await game.emit('attacks', { card: dragon, player: temur, defender: opponent }); await resolveAll(game);
  assert.equal(dragon.kw('double strike'), true);
  assert.equal(lathliss.zone, 'battlefield'); assert.equal(atarka.zone, 'battlefield');
});

test('dethrone and the first-attack clause schedule exactly one additional combat per turn', async () => {
  const { game, players: [temur, leader] } = rulesGame([], 2);
  leader.life = 45;
  const scourge = permanent(game, temur, 'Scourge of the Throne');
  const ally = permanent(game, temur, 'Rapacious Dragon');
  scourge.tapped = true; ally.tapped = true; scourge.attacking = leader; ally.attacking = leader;
  game.combat = { attackers: [scourge, ally], blockers: new Map() };
  await game.emit('attacks', { card: scourge, player: temur, defender: leader }); await resolveAll(game);
  assert.equal(scourge.counters['+1/+1'], 1); assert.equal(scourge.tapped, false); assert.equal(ally.tapped, false);
  assert.equal(game._extraCombats, 1);
  scourge.tapped = true;
  await game.emit('attacks', { card: scourge, player: temur, defender: leader }); await resolveAll(game);
  assert.equal(scourge.counters['+1/+1'], 2); assert.equal(game._extraCombats, 1);
});

test('Dragonlord Atarka locks divided damage and Glorybringer uses a real exert reflexive trigger', async () => {
  const decider = (g, query) => {
    if (query.type === 'chooseTargets' && /Any number/.test(query.prompt)) return query.candidates.slice(0, 2);
    if (query.type === 'chooseX') return query.allocation?.index === 0 ? 2 : query.max;
    return defaultDecision(g, query);
  };
  const { game, players: [temur, opponent] } = rulesGame([decider], 2);
  const small = permanent(game, opponent, 'Dragonmaster Outcast');
  const large = permanent(game, opponent, 'Atarka, World Render');
  const atarka = permanent(game, temur, 'Dragonlord Atarka');
  await game.emit('etb', { card: atarka }); await resolveAll(game);
  assert.notEqual(small.zone, 'battlefield');
  assert.equal(large.damage, 3);

  const target = permanent(game, opponent, 'Dragonmaster Outcast');
  const glory = permanent(game, temur, 'Glorybringer');
  await game.emit('attacks', { card: glory, player: temur, defender: opponent }); await resolveAll(game);
  assert.equal(glory.meta.oracleExertedBy, undefined, 'the attack event alone cannot retroactively choose an exert cost');
  const prior=temur.controller.decide.bind(temur.controller);temur.controller.decide=async(g,q)=>q.type==='attackers'?[{card:glory,target:opponent}]:prior(g,q);
  game.priorityRound=async()=>resolveAll(game);await game.combatPhase(temur);
  assert.ok(glory.meta.oracleExertedBy.includes(temur.idx)); assert.notEqual(target.zone, 'battlefield');
});

test('copy and control effects preserve their exact duration and Dragon-copy exceptions', async () => {
  const decider = (g, query) => {
    if (query.type === 'chooseCards') return [query.from[0]];
    if (query.type === 'chooseTargets') return [query.candidates[0]];
    if (query.type === 'chooseMulti') return query.options.map(option => option.key);
    return defaultDecision(g, query);
  };
  const { game, players: [temur, opponent] } = rulesGame([decider], 2);
  const big = permanent(game, temur, 'Atarka, World Render');
  const frostkite = await enter(game, temur, 'Deceptive Frostkite');
  assert.equal(frostkite.name, big.name); assert.equal(frostkite.hasSub('Dragon'), true); assert.equal(frostkite.kw('flying'), true);

  const artifact = permanent(game, opponent, 'Arcane Signet');
  const opportunist = permanent(game, temur, 'Opportunistic Dragon');
  await game.emit('etb', { card: opportunist }); await resolveAll(game);
  assert.equal(artifact.ctrl, temur); assert.equal(artifact.cur.abilitiesDisabled, true);
  await game.move(opportunist, 'hand'); await resolveAll(game);
  assert.equal(artifact.ctrl, opponent); assert.equal(artifact.cur.abilitiesDisabled, false);

  const commander = permanent(game, temur, 'Ureni of the Unwritten'); commander.commander = true;
  const will = new MTG.CardInst(MTG.DEFS['Will of the Temur'], temur);
  for (let i = 0; i < 8; i++) inZone(temur, 'Forest', 'library');
  const before = temur.hand.length;
  await will.def.resolve({ g: game, src: will, you: temur, mode: [0, 1], targets: [artifact, temur], so: { castOpts: {} } });
  const copy = game.creatures(temur).find(card => card.isToken && card.name === artifact.name);
  assert.ok(copy); assert.equal(copy.power, 4); assert.equal(copy.hasSub('Dragon'), true); assert.equal(copy.kw('flying'), true);
  assert.equal(temur.hand.length, before + Math.max(...game.bf().filter(card => card.ctrl === temur).map(card => card.mv)));
});

test('resource, graveyard, and command-zone Dragon paths resolve without manual handling', async () => {
  const decider = (g, query) => {
    if (query.type === 'chooseCards') return [query.from[0]];
    if (query.type === 'chooseTargets') return [query.candidates[0]];
    if (query.type === 'chooseOption' && /Breaching/.test(query.prompt)) return 'cast';
    return defaultDecision(g, query);
  };
  const { game, players: [temur] } = rulesGame([decider], 2);
  const tyrant = permanent(game, temur, 'Leyline Tyrant'); temur.pool.R = 5; game.recalc(); game.emptyPool();
  assert.equal(temur.pool.R, 5);
  await game.move(tyrant, 'hand'); await resolveAll(game); game.emptyPool(); assert.equal(temur.pool.R, 0);

  const spit = inZone(temur, 'Spit Flame', 'graveyard'); temur.pool.R = 1;
  const dragon = permanent(game, temur, 'Rapacious Dragon');
  await game.emit('etb', { card: dragon }); await resolveAll(game); assert.equal(spit.zone, 'hand');

  const commander = inZone(temur, 'Ureni of the Unwritten', 'command'); commander.commander = true;
  const courser = permanent(game, temur, 'Hellkite Courser');
  await game.emit('etb', { card: courser }); await resolveAll(game);
  assert.equal(commander.zone, 'battlefield'); assert.equal(commander.kw('haste'), true);
  await game.emit('endStep', { player: temur }); await resolveAll(game); assert.equal(commander.zone, 'command');

  const breach = permanent(game, temur, 'Breaching Dragonstorm');
  const hit = inZone(temur, 'Dragonmaster Outcast', 'library');
  const exiledLand = inZone(temur, 'Forest', 'library');
  temur.library = [hit, exiledLand];
  await game.emit('etb', { card: breach }); await resolveAll(game);
  assert.equal(exiledLand.zone, 'exile'); assert.equal(hit.zone, 'battlefield');
});

test('Dragon cost, cast, targeting, upkeep, landfall, and riot/monstrosity hooks execute', async () => {
  const { game, players: [temur, opponent] } = rulesGame([], 2);
  const servant = permanent(game, temur, "Dragonlord's Servant");
  const lore = inZone(temur, 'Draconic Lore', 'hand');
  const dragon = inZone(temur, 'Rapacious Dragon', 'hand');
  assert.equal(game.spellCost(temur, dragon).generic, 3);
  assert.equal(game.spellCost(temur, lore).generic, 5);
  permanent(game, temur, 'Atarka, World Render');
  assert.equal(game.spellCost(temur, lore).generic, 3);

  const mauler = permanent(game, temur, 'Taurean Mauler');
  const regent = permanent(game, temur, 'Thunderbreak Regent');
  const eshki = permanent(game, temur, "Eshki, Temur's Roar");
  for (let i = 0; i < 3; i++) inZone(temur, 'Forest', 'library');
  const castCard = new MTG.CardInst(MTG.DEFS['Dragonlord Atarka'], temur);
  await game.emit('cast', { player: temur, card: castCard, isCreature: true, mv: 7, so: { from: 'hand' } });
  await game.emit('cast', { player: opponent, card: new MTG.CardInst(MTG.DEFS['Sol Ring'], opponent), isCreature: false, mv: 1, so: { from: 'hand' } });
  await game.emit('targeted', { card: regent, byPlayer: opponent, src: castCard, isSpell: true });
  await resolveAll(game);
  assert.equal(eshki.counters['+1/+1'], 1); assert.ok(opponent.life < 37); assert.equal(mauler.counters['+1/+1'], 1);

  for (let i = 0; i < 6; i++) permanent(game, temur, i % 2 ? 'Forest' : 'Mountain');
  permanent(game, temur, 'Dragonmaster Outcast');
  await game.emit('upkeep', { player: temur }); await resolveAll(game);
  assert.equal(game.creatures(temur).some(card => card.isToken && card.power === 5), true);

  const nesting = permanent(game, temur, 'Nesting Dragon');
  await game.emit('landfall', { card: game.lands(temur)[0] }); await resolveAll(game);
  const egg = game.creatures(temur).find(card => card.isToken && card.hasSub('Egg')); assert.ok(egg);
  await game.sacrifice(temur, egg); await resolveAll(game);
  assert.equal(game.creatures(temur).some(card => card.isToken && card.power === 2 && card.hasSub('Dragon')), true);

  const hellkite = await enter(game, temur, 'Skarrgan Hellkite');
  assert.equal(hellkite.counters['+1/+1'], 1);
  const stormbreath = permanent(game, temur, 'Stormbreath Dragon');
  opponent.hand.push(new MTG.CardInst(MTG.DEFS.Forest, opponent), new MTG.CardInst(MTG.DEFS.Island, opponent));
  await stormbreath.def.abilities[0].run({ g: game, src: stormbreath, you: temur, targets: [] }); await resolveAll(game);
  assert.equal(stormbreath.meta.monstrous, true); assert.equal(stormbreath.counters['+1/+1'], 3);
  assert.ok(opponent.life <= 35); assert.equal(servant.zone, 'battlefield'); assert.equal(nesting.zone, 'battlefield');
});

test('territorial, Broodcaller, Hammerhead, Keiga, and Frontier Siege choices use legal hooks', async () => {
  let victim;
  const decider = (g, query) => {
    if (query.type === 'chooseCards') return [query.from[0]];
    if (query.type === 'chooseTargets') return [victim && query.candidates.includes(victim) ? victim : query.candidates[0]];
    return defaultDecision(g, query);
  };
  const { game, players: [temur, opponent, other] } = rulesGame([decider], 3);
  const territorial = permanent(game, temur, 'Territorial Hellkite');
  await game.emit('beginCombat', { player: temur }); await resolveAll(game);
  assert.ok([opponent, other].includes(territorial.meta.mustAttackPlayer));

  const broodcaller = permanent(game, temur, 'Broodcaller Scourge');
  const free = inZone(temur, "Dragon's Hoard", 'hand');
  await game.emit('combatDamageGroupToPlayer', { player: opponent, cards: [broodcaller], hits: [{ card: broodcaller, n: 6 }] });
  await resolveAll(game); assert.equal(free.zone, 'battlefield');

  const bounce = permanent(game, opponent, 'Arcane Signet');
  const hammerhead = permanent(game, temur, 'Hammerhead Tyrant');
  const spell = new MTG.CardInst(MTG.DEFS['Rapacious Dragon'], temur);
  await game.emit('cast', { player: temur, card: spell, isCreature: true, mv: 5, so: { from: 'hand' } });
  await resolveAll(game); assert.equal(bounce.zone, 'hand');

  victim = permanent(game, opponent, 'Dragonmaster Outcast');
  const keiga = permanent(game, temur, 'Keiga, the Tide Star');
  await game.destroy(keiga); await resolveAll(game); assert.equal(victim.ctrl, temur);

  const siege = permanent(game, temur, 'Frontier Siege'); siege.meta.siegeMode = 'khans';
  await game.emit('precombatMain', { player: temur }); await resolveAll(game); assert.equal(temur.pool.G, 2);
  siege.meta.siegeMode = 'dragons';
  const enemy = permanent(game, opponent, 'Taurean Mauler');
  const flyer = permanent(game, temur, 'Rapacious Dragon');
  await game.emit('etb', { card: flyer }); await resolveAll(game);
  assert.notEqual(enemy.zone, 'battlefield'); assert.equal(hammerhead.zone, 'battlefield');
});

test('sorcery sweep, Avalanche, lands, and Temple choices use executable rules paths', async () => {
  const decider = (g, query) => {
    if (query.type === 'chooseCards' && /Temple/.test(query.prompt)) return [query.from[0]];
    if (query.type === 'chooseOption' && /choose a color/.test(query.prompt)) return 'U';
    return defaultDecision(g, query);
  };
  const { game, players: [temur, opponent] } = rulesGame([decider], 2);
  const mine = permanent(game, temur, 'Rapacious Dragon');
  const theirs = permanent(game, opponent, 'Taurean Mauler');
  const wrath = new MTG.CardInst(MTG.DEFS["Storm's Wrath"], temur);
  await wrath.def.resolve({ g: game, src: wrath, you: temur, targets: [], so: { castOpts: {} } });
  assert.notEqual(mine.zone, 'battlefield'); assert.notEqual(theirs.zone, 'battlefield');

  const beater = permanent(game, temur, 'Atarka, World Render');
  for (let i = 0; i < 5; i++) inZone(temur, 'Forest', 'library');
  const avalanche = new MTG.CardInst(MTG.DEFS['Become the Avalanche'], temur);
  await avalanche.def.resolve({ g: game, src: avalanche, you: temur, targets: [], so: { castOpts: {} } });
  assert.equal(temur.hand.length, 1); assert.equal(beater.power, 7);

  const reveal = inZone(temur, 'Rapacious Dragon', 'hand');
  const temple = await enter(game, temur, 'Temple of the Dragon Queen');
  assert.equal(temple.tapped, false); assert.equal(temple.meta.chosenColor, 'U');
  const templeMana = temple.def.mana.produce(game, temple);
  assert.equal(templeMana.length, 1); assert.equal(templeMana[0].U, 1);
  await enter(game, temur, 'Forest');
  const vale1 = await enter(game, temur, 'Rockfall Vale'); assert.equal(vale1.tapped, false, 'two existing lands keep Rockfall untapped');
  assert.equal(MTG.DEFS['Bountiful Landscape'].cycling.cost, '{G}{U}{R}');
  assert.equal(MTG.DEFS['Migration Path'].cycling.cost, '{2}');
  assert.equal(reveal.zone, 'hand');
});

test('Temur AI chooses vote, mode, targets, and X without fallback', async () => {
  const { game, players: [bot, opponent] } = rulesGame([], 2); bot.isAI = true;
  const dragon = permanent(game, bot, 'Rapacious Dragon');
  const enemy = permanent(game, opponent, 'Taurean Mauler');
  const queries = [
    { type: 'chooseOption', options: [{ key: 'wild', label: 'Wild' }, { key: 'free', label: 'Free' }],
      aiHint: { kind: 'vote', src: new MTG.CardInst(MTG.DEFS["Selvala's Stampede"], bot), voter: bot, forWhom: bot, revealedVotes: [] } },
    { type: 'chooseTargets', candidates: [dragon, enemy], min: 1, max: 1, aiHint: { goal: 'removal' } },
    { type: 'chooseX', min: 0, max: 7, card: new MTG.CardInst(MTG.DEFS['Zenith Festival'], bot), aiHint: { kind: 'chooseX' } },
  ];
  for (let index = 0; index < queries.length; index++) {
    const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 250830 + index,
      actionWindow: queries[index] });
    assert.equal(decision.log.fallback, false);
    assert.notEqual(MTG.unwrapBotDecisionAction(decision.action), undefined);
  }
});

test('Temur Roar completes deterministic full games in both seats without AI fallback', { timeout: 80_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Temur Roar', aiDecks: ['Dance of the Elements', 'Turtle Power', 'Elven Council'], seed: 250840 },
    { humanDeck: 'Turtle Power', aiDecks: ['Temur Roar', 'Dance of the Elements', 'Elven Council'], seed: 250841 },
  ];
  for (const scenario of scenarios) {
    const game = MTG.newGame({ ...scenario, aiStyles: ['balanced', 'balanced', 'balanced'],
      difficulty: 'normal', maxTurns: 220, paced: false });
    await game.start();
    assert.equal(game.gameOver, true); assert.ok(game.winner); assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerName && game.players.some(player =>
      player.name === entry.playerName && player.deckName === 'Temur Roar'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
