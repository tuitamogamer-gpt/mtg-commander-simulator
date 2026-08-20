// Regresije za prijavljene bugove (2026-08-19): Olivia sac-Treasure tok,
// main-phase trigger stall (Bojuka Bog), Twinflame single target, Tempestra
// nonlegendary kopija, Tree of Perdition AI meta, Blasphemous Act simetrija i
// AI combat procjena (free block / prazan defender).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 4) {
  const game = new MTG.Game({ seed: 20260819, paced: false, maxTurns: 60 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Hero',
    { name: index ? `Opp ${index}` : 'Hero deck' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 11;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function synthetic(name, { types = ['Creature'], subtypes = [], cost = '{2}', oracle = '', power = 2, toughness = 2, kws = [], sup = [] } = {}) {
  return {
    name, super: sup, types, subtypes, cost, oracle,
    power: String(power), toughness: String(toughness), kws, abilities: [], mana: null,
  };
}

function addSynthetic(game, owner, def, zone = 'battlefield') {
  const card = new MTG.CardInst(def, owner);
  card.ctrl = owner;
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else owner[zone].push(card);
  game.recalc();
  return card;
}

function inHand(player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = 'hand';
  player.hand.push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 200) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 200, 'stack/trigger petlja se nije smirila');
}

// ---------------------------------------------------------------
// OLIVIA — "{3}, Sacrifice two Treasures"
// ---------------------------------------------------------------
test('Olivia ability se NE nudi sa samo jednim Treasure tokenom', async () => {
  const { game, players: [hero] } = rulesGame();
  const olivia = permanent(game, hero, 'Olivia, Opulent Outlaw');
  for (let i = 0; i < 4; i++) permanent(game, hero, 'Swamp');
  await game.makeTokens('treasure', hero, { n: 1 });
  game.recalc();
  const offered = game.activatableList(hero).some(entry => entry.card === olivia && entry.ability);
  assert.equal(offered, false, 'sa 1 Treasure ability ne smije biti ponuđen');
});

test('Olivia sa dva Treasure-a: mana NE jede žrtve, counteri sjednu, ništa ne visi', async () => {
  const deciders = [];
  const { game, players: [hero] } = rulesGame(deciders);
  const olivia = permanent(game, hero, 'Olivia, Opulent Outlaw');
  const swamps = Array.from({ length: 3 }, () => permanent(game, hero, 'Swamp'));
  await game.makeTokens('treasure', hero, { n: 2 });
  game.recalc();
  const treasures = game.bf().filter(card => card.ctrl === hero && card.hasSub('Treasure'));
  assert.equal(treasures.length, 2);

  const entry = game.activatableList(hero).find(e => e.card === olivia && e.ability);
  assert.ok(entry, 'sa 2 Treasure-a ability mora biti ponuđen');
  const ok = await game.activateAbility(hero, entry);
  assert.equal(ok, true, 'aktivacija mora uspjeti');
  await resolveAll(game);

  assert.equal(game.bf().filter(card => card.hasSub('Treasure')).length, 0, 'oba Treasure-a su žrtvovana');
  assert.equal(olivia.counters['+1/+1'], 2, 'Olivia dobija dva +1/+1 countera');
  assert.equal(swamps.filter(land => land.tapped).length, 3, '{3} je plaćeno iz landova, ne iz Treasure-a');
});

// ---------------------------------------------------------------
// MAIN PHASE — land trigger (Bojuka Bog) ne smije "pojesti" fazu
// ---------------------------------------------------------------
test('Bojuka Bog trigger se rezolvira U main fazi; faza se ne završava sama', async () => {
  const deciders = [];
  const { game, players: [hero, victim] } = rulesGame(deciders);
  const bog = new MTG.CardInst(MTG.DEFS['Bojuka Bog'], hero);
  bog.zone = 'hand';
  hero.hand.push(bog);
  for (const name of ['Swamp', 'Swamp']) {
    const dead = new MTG.CardInst(MTG.DEFS[name], victim);
    dead.zone = 'graveyard';
    victim.graveyard.push(dead);
  }
  hero.landsPlayed = 0;
  hero.maxLands = 1;

  let mainCalls = 0;
  let stackAtSecondMain = null;
  let graveAtSecondMain = null;
  deciders[0] = (g, q) => {
    if (q.type === 'main') {
      mainCalls++;
      if (mainCalls === 1) return { kind: 'land', card: bog };
      stackAtSecondMain = g.stack.length;
      graveAtSecondMain = victim.graveyard.length;
      return { kind: 'done' };
    }
    if (q.type === 'chooseTargets') return [victim];
    return defaultDecision(g, q);
  };

  await game.mainPhase(hero);
  assert.equal(mainCalls >= 2, true, 'igrač mora dobiti main prozor i POSLIJE landa');
  assert.equal(stackAtSecondMain, 0, 'trigger je rezolviran prije novog main prozora');
  assert.equal(graveAtSecondMain, 0, 'groblje mete je egzilirano');
  assert.equal(victim.exile.length, 2);
});

// ---------------------------------------------------------------
// TWINFLAME — jedno stvorenje na stolu (count=1 putanja)
// ---------------------------------------------------------------
test('Twinflame sa JEDNIM stvorenjem pravi kopiju i egzilira je na end stepu', async () => {
  const deciders = [];
  const { game, players: [hero] } = rulesGame(deciders);
  const grunt = addSynthetic(game, hero, synthetic('Twin Grunt', { power: 3, toughness: 3 }));
  const twinflame = inHand(hero, 'Twinflame');
  deciders[0] = (g, q) => {
    if (q.type === 'chooseTargets') return [grunt];
    return defaultDecision(g, q);
  };
  const ok = await game.castSpell(hero, twinflame, { alt: { free: true }, from: 'hand' });
  assert.equal(ok, true);
  await resolveAll(game);

  const copies = game.bf().filter(card => card.isToken && card.name === 'Twin Grunt');
  assert.equal(copies.length, 1, 'kopija MORA nastati i kad je meta jedna');
  assert.equal(copies[0].meta.tempHaste, true, 'kopija ima haste');

  await game.emit('endStep', { player: hero });
  await resolveAll(game);
  assert.equal(game.bf().filter(card => card.isToken && card.name === 'Twin Grunt').length, 0, 'kopija je egzilirana na end stepu');
});

// ---------------------------------------------------------------
// TEMPESTRA — kopija je nonlegendary i ne može kopirati sebe
// ---------------------------------------------------------------
test('Tempestra pravi NONLEGENDARY kopiju i ne nudi sebe kao metu', async () => {
  const deciders = [];
  const { game, players: [hero] } = rulesGame(deciders);
  const tempestra = permanent(game, hero, 'Tempestra, Dame of Games');
  const legend = addSynthetic(game, hero, synthetic('Grand Marshal', { power: 5, toughness: 5, sup: ['Legendary'] }));
  addSynthetic(game, hero, synthetic('Spare Idol', { types: ['Artifact'], power: 0, toughness: 0 }));
  for (let i = 0; i < 3; i++) permanent(game, hero, 'Mountain');
  game.recalc();

  const entry = game.activatableList(hero).find(e => e.card === tempestra && e.ability);
  assert.ok(entry, 'Tempestra ability mora biti dostupan');
  const legalTargets = game.legalTargets(entry.ability.targets[0], tempestra, hero);
  assert.equal(legalTargets.includes(tempestra), false, '"another target creature" — ne smije nuditi sebe');
  assert.equal(legalTargets.includes(legend), true);

  deciders[0] = (g, q) => {
    if (q.type === 'chooseTargets') return [legend];
    return defaultDecision(g, q);
  };
  const ok = await game.activateAbility(hero, entry);
  assert.equal(ok, true);
  await resolveAll(game);

  const copy = game.bf().find(card => card.isToken && card.name === 'Grand Marshal');
  assert.ok(copy, 'kopija mora nastati');
  assert.equal((copy.cur.super || []).includes('Legendary'), false, 'kopija NIJE legendary');
  assert.equal(legend.zone, 'battlefield', 'original preživljava (nema legend rule sudara)');
});

// ---------------------------------------------------------------
// TREE OF PERDITION — AI bira protivnika sa NAJVIŠE života
// ---------------------------------------------------------------
test('Tree of Perdition AI cilja protivnika kojem razmjena ODUZIMA život', async () => {
  const { game, players: [bot, low, high] } = rulesGame([], 3);
  const tree = permanent(game, bot, 'Tree of Perdition');
  low.life = 7;
  high.life = 39;
  game.recalc();
  const q = {
    type: 'chooseTargets', player: bot, candidates: [low, high], min: 1, max: 1,
    src: tree, prompt: 'Kome?', aiHint: { goal: 'lifeSwap' },
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 5, actionWindow: q });
  const picks = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(picks[0], high, 'bot mora izabrati igrača sa 39 života, ne onog sa 7');
});

// ---------------------------------------------------------------
// BLASPHEMOUS ACT — ubija i VLASTITA stvorenja (engine simetrija)
// ---------------------------------------------------------------
test('Blasphemous Act ubija i stvorenja kontrolora koji ga baca', async () => {
  const { game, players: [caster, enemy] } = rulesGame();
  addSynthetic(game, caster, synthetic('My Brute', { power: 4, toughness: 4 }));
  addSynthetic(game, caster, synthetic('My Second Brute', { power: 6, toughness: 6 }));
  addSynthetic(game, enemy, synthetic('Enemy Brute', { power: 5, toughness: 5 }));
  const act = inHand(caster, 'Blasphemous Act');
  const ok = await game.castSpell(caster, act, { alt: { free: true }, from: 'hand' });
  assert.equal(ok, true);
  await resolveAll(game);
  assert.equal(game.bf().filter(card => card.is('Creature')).length, 0, 'sva stvorenja (i vlastita) su mrtva');
  assert.equal(caster.graveyard.filter(card => card.is('Creature')).length, 2);
});

test('AI board-wipe procjena: Blasphemous vrijedi kad protivnici dominiraju, ne kad ja dominiram', () => {
  const build = mineDominates => {
    const { game, players: [bot, foe] } = rulesGame();
    bot.deckName = Object.keys(MTG.DECKS)[0];
    const big = ['A', 'B', 'C'];
    for (const suffix of big) {
      addSynthetic(game, mineDominates ? bot : foe, synthetic(`Titan ${suffix}`, { power: 7, toughness: 7 }));
    }
    const act = inHand(bot, 'Blasphemous Act');
    game.recalc();
    const view = MTG.createBotPlayerView(game, bot.idx);
    const profile = MTG.getDeckAIProfile(bot.deckName) || { weights: {}, primarySynergies: [], importantEngines: [], finishers: [], commanderImportance: 1 };
    return MTG.quickScoreBotAction(view, { kind: 'cast', card: act, alt: null, from: 'hand' }, profile, null).total;
  };
  const whenIDominate = build(true);
  const whenTheyDominate = build(false);
  assert.ok(whenTheyDominate > whenIDominate + 10,
    `wipe mora biti mnogo bolji kad protivnik dominira (mine=${whenIDominate}, theirs=${whenTheyDominate})`);
});

// ---------------------------------------------------------------
// AI COMBAT — free block znači NE napadaj; prazan defender znači napadaj
// ---------------------------------------------------------------
test('AI ne šalje 2/2 u napad kad branilac ima slobodnog 3/3 blokera', async () => {
  const { game, players: [bot, foe] } = rulesGame([], 2);
  const grunt = addSynthetic(game, bot, synthetic('Small Grunt', { power: 2, toughness: 2 }));
  addSynthetic(game, foe, synthetic('Big Wall Bear', { power: 3, toughness: 3 }));
  game.phase = 'combat';
  game.step = 'attackers';
  game.recalc();
  const q = { type: 'attackers', player: bot, eligible: [grunt], opponents: [foe], forced: [] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 9, actionWindow: q });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action).length, 0, 'napad u free block je čist gubitak');
});

test('AI napada kad defender nema blokere', async () => {
  const { game, players: [bot, foe] } = rulesGame();
  const grunt = addSynthetic(game, bot, synthetic('Small Grunt', { power: 2, toughness: 2 }));
  game.phase = 'combat';
  game.step = 'attackers';
  game.recalc();
  const q = { type: 'attackers', player: bot, eligible: [grunt], opponents: [foe], forced: [] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 9, actionWindow: q });
  const picks = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(picks.length, 1, 'bez blokera napad je besplatan damage');
  assert.equal(picks[0].target, foe);
});

test('AI na turnu 2 ne tapuje Birds of Paradise za dobrovoljni napad od 0 štete', async () => {
  const { game, players: [bot, foe] } = rulesGame([], 2);
  const birds = permanent(game, bot, 'Birds of Paradise');
  game.turnNo = 2;
  game.phase = 'combat';
  game.step = 'attackers';
  game.recalc();
  const q = { type: 'attackers', player: bot, eligible: [birds], opponents: [foe], forced: [] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 9, actionWindow: q });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action).length, 0, 'Birds treba ostati untapped mana izvor');
  assert.equal(birds.tapped, false);
});

test('Birds of Paradise i dalje napada kada je napad obavezan', async () => {
  const { game, players: [bot, foe] } = rulesGame([], 2);
  const birds = permanent(game, bot, 'Birds of Paradise');
  game.turnNo = 2;
  game.phase = 'combat';
  game.step = 'attackers';
  game.recalc();
  const q = { type: 'attackers', player: bot, eligible: [birds], opponents: [foe], forced: [birds] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 9, actionWindow: q });
  const picks = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(picks.length, 1, 'must attack pravilo ima prednost nad AI procjenom vrijednosti');
  assert.equal(picks[0].card, birds);
  assert.equal(picks[0].target, foe);
});

test('AI swarm: sa više napadača od blokera napad postaje isplativ', async () => {
  const { game, players: [bot, foe] } = rulesGame();
  const attackers = ['One', 'Two', 'Three'].map(suffix =>
    addSynthetic(game, bot, synthetic(`Raider ${suffix}`, { power: 3, toughness: 3 })));
  addSynthetic(game, foe, synthetic('Lone Guard', { power: 4, toughness: 4 }));
  foe.life = 9;
  game.phase = 'combat';
  game.step = 'attackers';
  game.recalc();
  const q = { type: 'attackers', player: bot, eligible: attackers, opponents: [foe], forced: [] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 3, actionWindow: q });
  const picks = MTG.unwrapBotDecisionAction(decision.action);
  assert.ok(picks.length >= 2, `swarm mora ući preko jednog blokera (izabrano: ${picks.length})`);
});

// ---------------------------------------------------------------
// KURBIS — enters counteri = potrošena mana; prevencija štiti drugo stvorenje
// ---------------------------------------------------------------
test('Kurbis ulazi sa counterima po potrošenoj mani i sprječava štetu drugom stvorenju', async () => {
  const { game, players: [hero, enemy] } = rulesGame();
  for (let i = 0; i < 5; i++) permanent(game, hero, 'Forest');
  const kurbis = inHand(hero, 'Kurbis, Harvest Celebrant');
  const ok = await game.castSpell(hero, kurbis, { from: 'hand', xVal: 3 });
  assert.equal(ok, true, 'Kurbis {X}{G}{G} sa X=3 mora proći uz 5 šuma');
  await resolveAll(game);
  assert.equal(kurbis.zone, 'battlefield');
  assert.equal(kurbis.counters['+1/+1'], 5, 'X=3 + {G}{G} → 5 potrošene mane → 5 countera');

  const ward = addSynthetic(game, hero, synthetic('Counter Bearer', { power: 2, toughness: 2 }));
  game.addCounters(ward, '+1/+1', 1);
  const entry = game.activatableList(hero).find(e => e.card === kurbis && e.ability);
  assert.ok(entry, 'prevencijski ability mora biti dostupan');
  const targets = game.legalTargets(entry.ability.targets[0], kurbis, hero);
  assert.equal(targets.includes(ward), true, 'stvorenje sa +1/+1 counterom je legalna meta');
  assert.equal(targets.includes(kurbis), false, '"another target creature" — Kurbis ne štiti sebe');

  const deciders = game.players.map(() => null);
  hero.controller.decide = async (g, q) => q.type === 'chooseTargets' ? [ward] : defaultDecision(g, q);
  const activated = await game.activateAbility(hero, entry);
  assert.equal(activated, true);
  await resolveAll(game);
  assert.equal(kurbis.counters['+1/+1'], 4, 'cijena skida jedan counter sa Kurbisa');

  const bolt = addSynthetic(game, enemy, synthetic('Burn Source', { types: ['Sorcery'], power: 0, toughness: 0 }), 'hand');
  await game.damageCreature(bolt, ward, 3);
  assert.equal(ward.zone, 'battlefield', 'sva šteta ovog poteza je spriječena');
  assert.equal(ward.damage, 0);
});

// ---------------------------------------------------------------
// AI TEMPO — instant se drži za tuđi potez
// ---------------------------------------------------------------
test('AI radije baca draw instant na kraju TUĐEG poteza nego u svojoj main fazi', () => {
  const build = phase => {
    const { game, players: [bot, other] } = rulesGame();
    bot.deckName = Object.keys(MTG.DECKS)[0];
    const draw = addSynthetic(game, bot, synthetic('Sudden Insight', {
      types: ['Instant'], cost: '{1}{U}', oracle: 'Draw two cards.', power: 0, toughness: 0,
    }), 'hand');
    if (phase === 'end') { game.phase = 'end'; game.turnPlayer = other; }
    game.recalc();
    const view = MTG.createBotPlayerView(game, bot.idx);
    const profile = MTG.getDeckAIProfile(bot.deckName) || { weights: {}, primarySynergies: [], importantEngines: [], finishers: [], commanderImportance: 1 };
    return MTG.quickScoreBotAction(view, { kind: 'cast', card: draw, alt: null, from: 'hand' }, profile, null).total;
  };
  const mainScore = build('main1');
  const endScore = build('end');
  assert.ok(endScore > mainScore, `end-step cast mora biti bolji (main=${mainScore}, end=${endScore})`);
});
