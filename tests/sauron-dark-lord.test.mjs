import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const manifest = JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/sauron-dark-lord-moxfield.json', import.meta.url), 'utf8'));
const importReport = JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/sauron-dark-lord-cards.json', import.meta.url), 'utf8'));

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
  if (query.type === 'surveil') return { top: query.cards.slice(), graveyard: [] };
  return null;
}

function rulesGame(deciders = [], count = 2) {
  const game = new MTG.Game({ seed: 8292026, paced: false, maxTurns: 80 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Sauron player',
    { name: index ? `Opponent ${index}` : 'Sauron import' },
    { decide: async (g, query) => deciders[index] ? deciders[index](g, query) : defaultDecision(g, query) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players };
}

function permanent(game, player, name, options = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = options.sick ?? false;
  card.commander = options.commander ?? false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 300) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 300, 'Sauron trigger/stack loop did not settle');
}

function exactDeckText() {
  const commander = manifest.sections.Commander[0];
  const main = Object.entries(manifest.sections)
    .filter(([section]) => section !== 'Commander')
    .flatMap(([, entries]) => entries);
  return [
    'Commander',
    `${commander.quantity} ${commander.name} *CMDR*`,
    '',
    'Deck',
    ...main.map(entry => `${entry.quantity} ${entry.name}`),
  ].join('\n');
}

function importExact(name, register = false) {
  return MTG.importCommanderDeck(exactDeckText(), { name, register });
}

test('tačan javni Moxfield list importuje 100 karata i svih 58 novih Oracle definicija', () => {
  assert.equal(manifest.deck.publicId, '8Xcac_CNTUiWNEOG4B5UQw');
  assert.equal(Object.values(manifest.sections).flat().reduce((sum, entry) => sum + entry.quantity, 0), 100);
  assert.equal(importReport.occurrenceCount, 100);
  assert.equal(importReport.uniqueCount, 79);
  assert.equal(importReport.importedCount, 58);
  assert.equal(importReport.batch.cards.length, 58);

  const imported = importExact('Sauron Moxfield Import QA', true);
  assert.equal(imported.ok, true, imported.errors.map(error => error.message).join('\n'));
  assert.equal(imported.commanders[0], 'Sauron, the Dark Lord');
  assert.equal(imported.summary.inputCards, 100);
  assert.equal(imported.summary.resolvedCards, 100);
  assert.equal(imported.summary.uniqueCards, 79);
  assert.equal(imported.interactions.batchCards, 58);
  assert.equal(imported.interactions.ready, true);
  for (const contract of ['amass-army', 'ring-temptation', 'ward-alternative-cost', 'draw-discard-replacement']) {
    assert.ok(imported.interactions.contracts.some(entry => entry.id === contract), contract);
  }

  for (const entry of importReport.batch.cards) {
    const name = entry.raw.name;
    const def = MTG.DEFS[name];
    const script = MTG.SCRIPTS[name];
    const catalog = MTG.CARD_CATALOG[name];
    assert.ok(def, `${name}: engine definition`);
    assert.equal(def.oracle, entry.raw.oracle, `${name}: exact Oracle text`);
    assert.equal(!!def.simplified, false, `${name}: not simplified`);
    assert.equal(script.oracleImplemented, true, `${name}: implementation marker`);
    assert.equal(script.oracleId, entry.oracleId, `${name}: Oracle id`);
    assert.ok(script.oracleContracts.length > 0, `${name}: explicit interaction contracts`);
    assert.equal(catalog.commanderLegality, 'legal', `${name}: Commander legal`);
    assert.equal(catalog.semanticClass, 'manual-deck-semantic', `${name}: manual semantics`);
  }

  const deck = MTG.DECKS[imported.deck.name];
  const game = new MTG.Game({ seed: 829, paced: false, maxTurns: 2 });
  const human = game.addPlayer('Human importer', deck, { decide: async (g, q) => defaultDecision(g, q) }, false);
  game.buildDeck(human, deck, MTG.DEFS, imported.commanders);
  assert.equal(human.command.length, 1);
  assert.equal(human.command[0].name, 'Sauron, the Dark Lord');
  assert.equal(human.library.length, 99);
  assert.ok(human.library.some(card => card.name === 'Lord of the Nazgûl'));
  assert.ok(human.library.some(card => card.name === 'Mauhúr, Uruk-hai Captain'));
});

test('Amass koristi jednu Army, Mauhúr dodaje counter, a Mirkwood Bats prati token i sacrifice', async () => {
  const { game, players: [sauron, opponent] } = rulesGame();
  permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
  permanent(game, sauron, 'Mirkwood Bats');
  opponent.life = 40;

  const army = await MTG.E.amass(game, sauron, 1, 'Orc');
  await resolveAll(game);
  assert.ok(army.isToken);
  assert.equal(army.hasSub('Army'), true);
  assert.equal(army.hasSub('Orc'), true);
  assert.equal(army.counters['+1/+1'], 2, 'Mauhúr turns one counter into two');
  assert.equal(opponent.life, 39, 'Bats sees the created Army token');

  const sameArmy = await MTG.E.amass(game, sauron, 1, 'Zombie');
  await resolveAll(game);
  assert.equal(sameArmy, army);
  assert.equal(game.creatures(sauron).filter(card => card.hasSub('Army')).length, 1);
  assert.equal(army.hasSub('Zombie'), true, 'an existing Army permanently gains the new Army kind');
  assert.equal(army.counters['+1/+1'], 4);
  assert.equal(opponent.life, 39, 'no token was created by the second amass');

  await game.makeTokens('treasure', sauron, { n: 3 });
  assert.equal(game.pendingTriggers.filter(trigger => trigger.src?.name === 'Mirkwood Bats').length, 3,
    'Mirkwood Bats creates one trigger per created token');
  await resolveAll(game);
  assert.equal(opponent.life, 36);

  assert.equal(await game.sacrifice(sauron, army), true);
  await resolveAll(game);
  assert.equal(opponent.life, 35, 'Bats sees a sacrificed token');
});

test('Lord of the Nazgûl affects later Wraiths, Lens creates one optional trigger per blocker, and Foray is the damage source', async () => {
  const { game, players: [sauron, opponent] } = rulesGame();
  permanent(game, sauron, 'Lord of the Nazgûl');
  const wraith = {
    name: 'Wraith QA', cost: null, super: [], types: ['Creature'], subtypes: ['Wraith'],
    power: '3', toughness: '3', oracle: 'Menace', colorsOverride: ['B'], kws: ['menace'], isTokenDef: true,
  };
  await game.makeTokens(wraith, sauron, { n: 7 });
  const spell = inZone(sauron, 'Murder', 'exile');
  await game.emit('castIS', { player: sauron, card: spell, mv: 3, so: { card: spell, ctrl: sauron } });
  await resolveAll(game);
  assert.equal(game.creatures(sauron).filter(card => card.hasSub('Wraith')).length, 9);
  assert.ok(game.creatures(sauron).filter(card => card.hasSub('Wraith')).every(card => card.power === 9));
  const later = (await game.makeTokens(wraith, sauron))[0];
  assert.equal(later.power, 9, 'the until-EOT Wraith base P/T effect is continuous');

  const lens = permanent(game, sauron, 'Infiltration Lens');
  const attacker = permanent(game, sauron, 'Elite Vanguard');
  lens.attachedTo = attacker.iid;
  attacker.attachments.push(lens.iid);
  const blockerA = permanent(game, opponent, 'Aegis Turtle');
  const blockerB = permanent(game, opponent, 'Arachnoid');
  for (const name of ['Island', 'Mountain', 'Swamp', 'Island']) inZone(sauron, name, 'library');
  await game.emit('becomesBlockedByCreature', { attacker, blocker: blockerA, blockers: [blockerA, blockerB] });
  await game.emit('becomesBlockedByCreature', { attacker, blocker: blockerB, blockers: [blockerA, blockerB] });
  assert.equal(game.pendingTriggers.filter(trigger => trigger.src === lens).length, 2);
  await resolveAll(game);
  assert.equal(sauron.hand.length, 4);

  const forayGame = rulesGame();
  const [caster, defendingPlayer] = forayGame.players;
  const target = permanent(forayGame.game, defendingPlayer, 'Aegis Turtle');
  const foray = inZone(caster, 'Foray of Orcs', 'exile');
  await MTG.DEFS['Foray of Orcs'].resolve({ g: forayGame.game, you: caster, src: foray, targets: [] });
  const army = forayGame.game.creatures(caster).find(card => card.hasSub('Army'));
  army.def.kws = [...new Set([...(army.def.kws || []), 'deathtouch'])];
  forayGame.game.recalc();
  await resolveAll(forayGame.game);
  assert.equal(target.zone, 'battlefield', 'Army deathtouch does not belong to Foray of Orcs');
  assert.equal(target.damage, 2);
});

test('Sauronov Ring trigger bira stvarnog nosioca, odbacuje ruku i vuče četiri', async () => {
  let bearer;
  const chooseSauron = (game, query) => {
    if (query.type === 'chooseCards' && query.aiHint?.kind === 'ringBearer') return [bearer];
    if (query.type === 'chooseOption' && query.aiHint?.kind === 'optTrigger') return 'yes';
    return defaultDecision(game, query);
  };
  const { game, players: [sauron] } = rulesGame([chooseSauron]);
  bearer = permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
  permanent(game, sauron, 'Sauron, the Dark Lord', { commander: true });
  const discarded = [inZone(sauron, 'Mountain', 'hand'), inZone(sauron, 'Swamp', 'hand')];
  for (const name of ['Island', 'Mountain', 'Swamp', 'Island', 'Mountain']) inZone(sauron, name, 'library');

  const selected = await MTG.E7.ringTempts(game, sauron);
  await resolveAll(game);
  assert.equal(selected, bearer);
  assert.equal(bearer.meta.ringBearer, true);
  assert.equal(sauron.ringLevel, 1);
  assert.equal(sauron.hand.length, 4);
  assert.ok(discarded.every(card => card.zone === 'graveyard'));
});

test("Sauron's Ransom privatno otkriva četiri karte protivniku, zatim skriva gomilu i iskušava Prsten", async () => {
  let bearer;
  let opponent;
  let sawPrivateCards = false;
  const ownerDecision = (game, query) => {
    if (query.type === 'chooseOption' && query.aiHint?.kind === 'ransomPile') return 'down';
    if (query.type === 'chooseCards' && query.aiHint?.kind === 'ringBearer') return [bearer];
    return defaultDecision(game, query);
  };
  const opponentDecision = (game, query) => {
    if (query.type === 'chooseCards' && query.aiHint?.kind === 'ransomSplit') {
      sawPrivateCards = query.from.every(card => card.faceDown && card.meta.revealedTo?.includes(opponent.idx));
      return query.from.slice(0, 2);
    }
    return defaultDecision(game, query);
  };
  const { game, players: [sauron, ransomOpponent] } = rulesGame([ownerDecision, opponentDecision]);
  opponent = ransomOpponent;
  bearer = permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
  for (const name of ['Island', 'Mountain', 'Swamp', 'Murder']) inZone(sauron, name, 'library');
  const ransom = inZone(sauron, "Sauron's Ransom", 'exile');

  await MTG.DEFS["Sauron's Ransom"].resolve({ g: game, you: sauron, src: ransom, targets: [] });
  await resolveAll(game);
  assert.equal(sauron.hand.length, 2);
  assert.equal(sauron.graveyard.length, 2);
  assert.equal(sawPrivateCards, true, 'the chosen opponent can inspect all four face-down cards while splitting them');
  assert.ok([...sauron.hand, ...sauron.graveyard].every(card => card.faceDown === false));
  assert.ok([...sauron.hand, ...sauron.graveyard].every(card => !card.meta.revealedTo));
  assert.equal(bearer.meta.ringBearer, true);
  assert.equal(sauron.ringLevel, 1);
});

test('Sauron ward žrtvuje odabrani legendary permanent, a Lazotep Plating štiti igrača i Army', async () => {
  let wardPayment;
  const payerDecision = (game, query) => {
    if (query.type === 'chooseCards' && query.aiHint?.payment === 'sacrificeLegendary') return [wardPayment];
    return defaultDecision(game, query);
  };
  const { game, players: [sauron, opponent] } = rulesGame([null, payerDecision]);
  const darkLord = permanent(game, sauron, 'Sauron, the Dark Lord', { commander: true });
  wardPayment = permanent(game, opponent, 'Phial of Galadriel');
  const wardSpell = inZone(opponent, 'Murder', 'exile');
  const stackObject = { kind: 'spell', name: 'Murder', card: wardSpell, ctrl: opponent };
  game.stack.push(stackObject);
  game.queueWardTriggers(stackObject, { wardTargets: [{ target: darkLord, ward: darkLord.cur.wardCost }] });
  assert.equal(game.pendingTriggers[0].name, 'Ward—Sacrifice a legendary artifact or creature');
  game.pendingTriggers.length = 0;
  game.stack.length = 0;
  assert.equal(await game.payWard(opponent, darkLord, darkLord.cur.wardCost), true);
  assert.equal(wardPayment.zone, 'graveyard');

  const plating = inZone(sauron, 'Lazotep Plating', 'exile');
  await MTG.DEFS['Lazotep Plating'].resolve({ g: game, you: sauron, src: plating, targets: [] });
  const source = inZone(opponent, 'Murder', 'hand');
  const legalPlayers = game.legalTargets({ what: 'player' }, source, opponent);
  assert.equal(legalPlayers.includes(sauron), false);
  assert.equal(legalPlayers.includes(opponent), true);
  assert.equal(game.creatures(sauron).some(card => card.hasSub('Army') && card.kw('hexproof')), true);
});

test('Call of the Ring rechecks the life payment when its trigger resolves', async () => {
  const { game, players: [sauron] } = rulesGame();
  const bearer = permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
  permanent(game, sauron, 'Call of the Ring');
  inZone(sauron, 'Island', 'library');
  sauron.life = 2;
  await game.emit('ringTempted', { player: sauron, bearer, level: 1 });
  assert.equal(game.pendingTriggers.some(trigger => trigger.src?.name === 'Call of the Ring'), true);
  sauron.life = 1;
  await resolveAll(game);
  assert.equal(sauron.life, 1);
  assert.equal(sauron.hand.length, 0);
});

test('Library of Leng i Phial of Galadriel rade kroz centralne discard/draw replacement putanje', async () => {
  const { game, players: [sauron] } = rulesGame();
  permanent(game, sauron, 'Library of Leng');
  permanent(game, sauron, 'Phial of Galadriel');
  inZone(sauron, 'Island', 'library');
  inZone(sauron, 'Mountain', 'library');
  const replaced = inZone(sauron, 'Swamp', 'hand');

  await game.discard(sauron, [replaced]);
  assert.equal(replaced.zone, 'library');
  assert.equal(sauron.hand.length, 0);
  assert.equal(await game.draw(sauron, 1), 2, 'Phial replaces an empty-hand draw with two draws');
  assert.equal(sauron.hand.length, 2);
  assert.ok(sauron.hand.includes(replaced));

  const costDiscard = inZone(sauron, 'Island', 'hand');
  await game.discard(sauron, [costDiscard], { noReplacement: true });
  assert.equal(costDiscard.zone, 'graveyard', 'additional-cost discards cannot use Library of Leng');
});

test("Lobelia koristi last-known power, a Life's Finale stvarno premješta tri library creature karte", async () => {
  let finalePicks = [];
  const searchDecision = (game, query) => {
    if (query.type === 'chooseCards' && query.search && /up to three creatures/i.test(query.prompt || '')) {
      finalePicks = query.from.slice(0, query.max);
      return finalePicks;
    }
    return defaultDecision(game, query);
  };
  const { game, players: [sauron, opponent] } = rulesGame([searchDecision]);
  const victim = permanent(game, opponent, 'Elite Vanguard');
  game.addCounters(victim, '+1/+1', 3, false, opponent);
  game.recalc();
  assert.equal(victim.power, 5);
  await game.destroy(victim);
  assert.equal(victim.meta._fromBattlefieldTurn, game.turnNo);
  const lobelia = permanent(game, sauron, 'Lobelia Sackville-Baggins');
  await game.emit('etb', { card: lobelia, ctrl: sauron });
  await resolveAll(game);
  assert.equal(victim.zone, 'exile');
  assert.equal(game.bf().filter(card => card.ctrl === sauron && card.isToken && card.hasSub('Treasure')).length, 5);

  for (const name of ['Aegis Turtle', 'Elite Vanguard', 'A.I.M. Bot', 'Arachnoid']) inZone(opponent, name, 'library');
  inZone(opponent, 'Island', 'library');
  const ownCreature = permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
  const finale = inZone(sauron, "Life's Finale", 'exile');
  await MTG.DEFS["Life's Finale"].resolve({ g: game, you: sauron, src: finale, targets: [opponent] });
  assert.equal(ownCreature.zone, 'graveyard');
  assert.equal(finalePicks.length, 3);
  assert.ok(finalePicks.every(card => card.zone === 'graveyard'));
});

test('Gandalf daje sorcery flash, a Thryx smanjuje i štiti mana-value-5 spell', () => {
  const { game, players: [sauron, opponent] } = rulesGame();
  permanent(game, sauron, 'Gandalf, Friend of the Shire');
  const scheming = inZone(sauron, "Taigam's Scheming", 'hand');
  game.turnPlayer = opponent;
  game.phase = 'main1';
  assert.equal(game.canCastTiming(sauron, scheming), true);

  permanent(game, sauron, 'Thryx, the Sudden Storm');
  const endgame = inZone(sauron, 'Enter the God-Eternals', 'hand');
  const cost = game.spellCost(sauron, endgame);
  assert.equal(cost.generic, 1);
  assert.equal(MTG.isUncounterable(game, { kind: 'spell', card: endgame, ctrl: sauron }), true);
});

test('Infiltration Lens dobija po jedan trigger iz stvarne deklaracije svakog blokera', async () => {
  let attacker;
  let blockerA;
  let blockerB;
  const attackDecision = (game, query) => {
    if (query.type === 'attackers') return [{ card: attacker, target: game.players[1] }];
    return defaultDecision(game, query);
  };
  const blockDecision = (game, query) => {
    if (query.type === 'blockers') return [
      { blocker: blockerA, attacker },
      { blocker: blockerB, attacker },
    ];
    return defaultDecision(game, query);
  };
  const { game, players: [sauron, opponent] } = rulesGame([attackDecision, blockDecision]);
  const lens = permanent(game, sauron, 'Infiltration Lens');
  attacker = permanent(game, sauron, 'Elite Vanguard');
  blockerA = permanent(game, opponent, 'Aegis Turtle');
  blockerB = permanent(game, opponent, 'Arachnoid');
  lens.attachedTo = attacker.iid;
  attacker.attachments.push(lens.iid);
  for (const name of ['Island', 'Mountain', 'Swamp', 'Island']) inZone(sauron, name, 'library');

  await game.combatPhase(sauron);
  await resolveAll(game);
  assert.equal(sauron.hand.length, 4,
    'two declared blockers produce two Lens draw-two triggers');
});

test('Elrond second creature, Gorbag nested reward, and Grishnákh temporary theft resolve through choices', async () => {
  {
    const { game, players: [sauron] } = rulesGame();
    permanent(game, sauron, 'Elrond, Lord of Rivendell');
    const bearer = permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
    for (const name of ['Island', 'Mountain']) inZone(sauron, name, 'library');
    await game.emit('etb', { card: bearer, ctrl: sauron });
    await resolveAll(game);
    const second = permanent(game, sauron, 'A.I.M. Bot');
    await game.emit('etb', { card: second, ctrl: sauron });
    await resolveAll(game);
    assert.equal(sauron.ringLevel, 1, 'Elrond tempts only after the second creature ETB resolves');
  }

  {
    const treasureReward = (game, query) => query.aiHint?.kind === 'gorbagReward'
      ? 'treasure' : defaultDecision(game, query);
    const { game, players: [sauron, opponent] } = rulesGame([treasureReward]);
    permanent(game, sauron, 'Gorbag of Minas Morgul');
    const raider = permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
    await game.emit('combatDamageToPlayer', { card: raider, player: opponent, n: 2 });
    await resolveAll(game);
    assert.equal(raider.zone, 'graveyard');
    assert.equal(game.bf().filter(card => card.ctrl === sauron && card.isToken && card.hasSub('Treasure')).length, 1);
  }

  {
    const { game, players: [sauron, opponent] } = rulesGame();
    const victim = permanent(game, opponent, 'Elite Vanguard');
    const grishnakh = permanent(game, sauron, 'Grishnákh, Brash Instigator');
    await game.emit('etb', { card: grishnakh, ctrl: sauron });
    await resolveAll(game);
    assert.equal(victim.ctrl, sauron, 'eligible nonlegendary creature is stolen');
    assert.equal(victim.meta.tempHaste, true);
    await game.emit('endStep', { player: sauron });
    await resolveAll(game);
    assert.equal(victim.ctrl, opponent, 'control returns at the end step');
    assert.equal(victim.meta.tempHaste, undefined);
  }
});

test('Sauron, Lord of the Rings cast package and commander-death Ring trigger both resolve', async () => {
  const { game, players: [sauron, opponent] } = rulesGame();
  const source = permanent(game, sauron, 'Sauron, Lord of the Rings');
  permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
  for (const name of ['Island', 'Mountain', 'Aegis Turtle', 'Swamp', 'Elite Vanguard']) inZone(sauron, name, 'library');

  await source.def.triggers[0].run({ g: game, you: sauron, src: source, data: { card: source } });
  assert.ok(game.creatures(sauron).some(card => card.hasSub('Army') && card.counters['+1/+1'] >= 5));
  assert.ok(game.creatures(sauron).some(card => ['Aegis Turtle', 'Elite Vanguard'].includes(card.name)), 'milled creature is reanimated');

  await game.emit('dies', {
    card: null,
    snap: { commander: true, ctrl: opponent, types: ['Creature'], super: ['Legendary'] },
  });
  await resolveAll(game);
  assert.equal(sauron.ringLevel, 1);
});

test('Sauron, the Necromancer makes attacking Wraith copies and honors both delayed-exile branches', async () => {
  const { game, players: [sauron, opponent] } = rulesGame();
  const source = permanent(game, sauron, 'Sauron, the Necromancer');
  source.attacking = opponent;
  game.combat = { attackers: [source], defenders: new Map() };
  inZone(sauron, 'Aegis Turtle', 'graveyard');

  await game.emit('attacks', { card: source, player: sauron, defender: opponent });
  await resolveAll(game);
  let token = game.creatures(sauron).find(card => card.isToken && card.hasSub('Wraith'));
  assert.ok(token && token.tapped && token.attacking === opponent,
    `Wraith state=${JSON.stringify(token && { tapped: token.tapped, attacking: token.attacking?.name, zone: token.zone, subtypes: token.cur?.subtypes })}`);
  await game.emit('endStep', { player: sauron });
  await resolveAll(game);
  assert.equal(token.zone, 'ceased', 'the exiled token ceases to exist when Sauron is not the Ring-bearer');

  source.meta.ringBearer = true;
  inZone(sauron, 'Elite Vanguard', 'graveyard');
  await game.emit('attacks', { card: source, player: sauron, defender: opponent });
  await resolveAll(game);
  token = game.creatures(sauron).find(card => card.isToken && card.hasSub('Wraith'));
  await game.emit('endStep', { player: sauron });
  await resolveAll(game);
  assert.equal(token.zone, 'battlefield', 'copy remains while Sauron is the Ring-bearer');
});

test('high-risk Sauron sorceries resolve bounce, drain, tutor, recursion, and Army board damage', async () => {
  const { game, players: [sauron, opponent] } = rulesGame();
  const bounceTarget = permanent(game, opponent, 'Phial of Galadriel');
  const dismissal = inZone(sauron, 'Callous Dismissal', 'exile');
  await dismissal.def.resolve({ g: game, you: sauron, src: dismissal, targets: [bounceTarget] });
  assert.equal(bounceTarget.zone, 'hand');
  assert.ok(game.creatures(sauron).some(card => card.hasSub('Zombie') && card.hasSub('Army')));

  const damageTarget = permanent(game, opponent, 'Aegis Turtle');
  for (const name of ['Island', 'Mountain', 'Swamp', 'Murder']) inZone(opponent, name, 'library');
  sauron.life = 30;
  const eternals = inZone(sauron, 'Enter the God-Eternals', 'exile');
  await eternals.def.resolve({ g: game, you: sauron, src: eternals, targets: [damageTarget, opponent] });
  assert.equal(damageTarget.damage, 4);
  assert.equal(sauron.life, 34);
  assert.equal(opponent.graveyard.length, 4);

  permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
  const tutorCard = inZone(sauron, 'Cast Down', 'library');
  const ringsight = inZone(sauron, 'Ringsight', 'exile');
  await ringsight.def.resolve({ g: game, you: sauron, src: ringsight, targets: [] });
  assert.equal(tutorCard.zone, 'hand');

  const recursionTarget = inZone(sauron, 'Murder', 'graveyard');
  const treason = inZone(sauron, 'Treason of Isengard', 'exile');
  await treason.def.resolve({ g: game, you: sauron, src: treason, targets: [recursionTarget] });
  assert.equal(recursionTarget.zone, 'library');

  const nonArmy = permanent(game, opponent, 'Elite Vanguard');
  const brutality = inZone(sauron, 'Widespread Brutality', 'exile');
  await brutality.def.resolve({ g: game, you: sauron, src: brutality, targets: [] });
  assert.equal(nonArmy.zone, 'graveyard');
  assert.ok(game.creatures(sauron).some(card => card.hasSub('Army')));
});

test('Sauron removal, sacrifice draw, counterspell, and modal protection cover both conditional branches', async () => {
  const { game, players: [sauron, opponent] } = rulesGame();
  for (const name of ['Island', 'Mountain', 'Swamp', 'Island', 'Mountain']) inZone(sauron, name, 'library');
  const nasty = inZone(sauron, 'Nasty End', 'exile');
  await nasty.def.resolve({ g: game, you: sauron, src: nasty, so: { sacdSnaps: [{ super: ['Legendary'] }] }, targets: [] });
  assert.equal(sauron.hand.length, 3);
  await nasty.def.resolve({ g: game, you: sauron, src: nasty, so: { sacdSnaps: [{ super: [] }] }, targets: [] });
  assert.equal(sauron.hand.length, 5);

  const artifact = permanent(game, sauron, 'Dimir Signet');
  const victim = permanent(game, opponent, 'Aegis Turtle');
  const disintegration = inZone(sauron, 'Unlicensed Disintegration', 'exile');
  const lifeBefore = opponent.life;
  await disintegration.def.resolve({ g: game, you: sauron, src: disintegration, targets: [victim] });
  assert.equal(victim.zone, 'graveyard');
  assert.equal(opponent.life, lifeBefore - 3);
  await game.move(artifact, 'graveyard');

  const turnAside = inZone(sauron, 'Turn Aside', 'exile');
  const protectedPermanent = permanent(game, sauron, 'Library of Leng');
  const hostileCard = inZone(opponent, 'Murder', 'exile');
  const hostileSpell = { kind: 'spell', name: 'Murder', card: hostileCard, ctrl: opponent, targets: [protectedPermanent] };
  game.stack.push(hostileSpell);
  assert.equal(turnAside.def.targets[0].filter(game, hostileSpell, sauron), true);
  await turnAside.def.resolve({ g: game, you: sauron, src: turnAside, targets: [hostileSpell] });
  assert.equal(game.stack.includes(hostileSpell), false);

  const medicineTarget = permanent(game, sauron, 'Elite Vanguard');
  const medicine = inZone(sauron, 'Orcish Medicine', 'exile');
  await medicine.def.resolve({ g: game, you: sauron, src: medicine, targets: [medicineTarget] });
  assert.equal(medicineTarget.kw('indestructible'), true);
  assert.ok(game.creatures(sauron).some(card => card.hasSub('Orc') && card.hasSub('Army')));
});

test('Sauron artifacts, Sagas, and enters-tapped lands execute their activated and chapter paths', async () => {
  const scryDecision = (game, query) => query.type === 'chooseOption' && query.aiHint?.kind === 'keywordChoice'
    ? 'lifelink' : defaultDecision(game, query);
  const { game, players: [sauron, opponent] } = rulesGame([scryDecision]);
  const lantern = permanent(game, sauron, "Seer's Lantern");
  inZone(sauron, 'Island', 'library');
  await lantern.def.abilities[0].run({ g: game, you: sauron, src: lantern, targets: [] });
  assert.equal(sauron.library.length, 1, 'scry ability resolves without moving a kept card');

  const wheel = permanent(game, sauron, 'Spinning Wheel');
  const tapTarget = permanent(game, opponent, 'Elite Vanguard');
  await wheel.def.abilities[0].run({ g: game, you: sauron, src: wheel, targets: [tapTarget] });
  assert.equal(tapTarget.tapped, true);

  const book = permanent(game, sauron, 'Book of Mazarbul');
  await book.def.saga[0].run({ g: game, you: sauron, src: book, targets: [] });
  await book.def.saga[1].run({ g: game, you: sauron, src: book, targets: [] });
  const army = game.creatures(sauron).find(card => card.hasSub('Army'));
  const powerBefore = army.power;
  await book.def.saga[2].run({ g: game, you: sauron, src: book, targets: [] });
  assert.equal(army.power, powerBefore + 1);
  assert.equal(army.kw('menace'), true);

  const oneRing = permanent(game, sauron, 'One Ring to Rule Them All');
  permanent(game, sauron, 'Mauhúr, Uruk-hai Captain');
  const ordinary = permanent(game, opponent, 'Aegis Turtle');
  await oneRing.def.saga[1].run({ g: game, you: sauron, src: oneRing, targets: [] });
  assert.equal(ordinary.zone, 'graveyard');

  const backwater = new MTG.CardInst(MTG.DEFS['Dismal Backwater'], sauron);
  backwater.zone = 'nowhere';
  const beforeLife = sauron.life;
  await game.move(backwater, 'battlefield', { ctrl: sauron });
  await resolveAll(game);
  assert.equal(backwater.tapped, true);
  assert.equal(sauron.life, beforeLife + 1);
});

test('uvezeni Sauron špil završava pune determinističke partije kao human seat i kao lokalni bot', { timeout: 45_000 }, async () => {
  const imported = importExact('Sauron Moxfield Human Bot QA', true);
  assert.equal(imported.ok, true, imported.errors.map(error => error.message).join('\n'));
  const profile = MTG.getDeckAIProfile(imported.deck.name);
  assert.ok(profile);
  assert.equal(profile.deckId, imported.deck.name);
  assert.ok(profile.primarySynergies.length > 0);

  let humanDecisions = 0;
  const asPlayer = MTG.newGame({
    humanDeck: imported.deck.name,
    humanCommanders: imported.commanders,
    aiDecks: ['Quick Draw', 'Abzan Armor', 'Elven Council'],
    aiStyles: ['balanced', 'balanced', 'balanced'],
    humanController: () => ({
      decide: async (game, query) => {
        humanDecisions += 1;
        return defaultDecision(game, query);
      },
    }),
    difficulty: 'normal', seed: 829301, maxTurns: 260, paced: false,
  });
  assert.equal(asPlayer.human().isAI, false);
  await asPlayer.start();
  assert.equal(asPlayer.gameOver, true);
  assert.ok(asPlayer.winner);
  assert.ok(asPlayer.turnNo < asPlayer.maxTurns);
  assert.equal(asPlayer.pendingTriggers.length, 0);
  assert.ok(humanDecisions > 0, 'the imported human seat received real controller decisions');
  assert.equal(asPlayer.log.some(entry => /AI V2 fallback/i.test(entry.msg)), false);

  // `aiDecisionLog` keeps only the most recent 160 decisions, so an early
  // elimination of the imported seat would hide its decisions; count them as
  // they happen instead.
  const botDecisions = [];
  const asBot = MTG.newGame({
    humanDeck: 'Quick Draw',
    aiDecks: [imported.deck.name, 'Abzan Armor', 'Elven Council'],
    aiStyles: ['balanced', 'balanced', 'balanced'],
    difficulty: 'normal', seed: 829302, maxTurns: 260, paced: false,
    onEvent: event => {
      if (event.type === 'aiDecision' && event.player && event.player.deckName === imported.deck.name) botDecisions.push(event.decision);
    },
  });
  const importedBot = asBot.players.find(player => player.deckName === imported.deck.name);
  assert.ok(importedBot, 'custom imported deck is accepted in an AI seat');
  await asBot.start();
  assert.equal(asBot.gameOver, true);
  assert.ok(asBot.winner);
  assert.ok(asBot.turnNo < asBot.maxTurns);
  assert.equal(asBot.pendingTriggers.length, 0);
  assert.ok(botDecisions.length > 0, 'the local AI made decisions for the imported deck');
  assert.equal(botDecisions.some(entry => entry.fallback), false);
  assert.equal(asBot.log.some(entry => /AI V2 fallback/i.test(entry.msg)), false);
});
