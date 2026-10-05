import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';
import { auditNativeCatalog } from './helpers/native-execution-audit.mjs';

const MTG = loadEngine();
const BATCH_ID = 'manual-commander-staples';
const report = JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/commander-staples-cards.json', import.meta.url), 'utf8'));

// Exact Oracle wording supplied for the hand-entered batch.
const ORACLE = {
  'Smothering Tithe': "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.",
  'Esper Sentinel': "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power.",
  'Orcish Bowmasters': 'Flash\nWhen this creature enters and whenever an opponent draws a card except the first one they draw in each of their draw steps, this creature deals 1 damage to any target. Then amass Orcs 1.',
  'Necropotence': 'Skip your draw step.\nWhenever you discard a card, exile that card from your graveyard.\nPay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step.',
  'Underworld Breach': "Each nonland card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\nAt the beginning of the end step, sacrifice this enchantment.",
  'Mana Drain': "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value.",
  'Urza, Lord High Artificer': 'When Urza enters, create a 0/0 colorless Construct artifact creature token with "This creature gets +1/+1 for each artifact you control."\nTap an untapped artifact you control: Add {U}.\n{5}: Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost.',
};
const NAMES = Object.keys(ORACLE);
const CHARACTERISTICS = {
  'Smothering Tithe': ['{3}{W}', 'Enchantment', ['W']],
  'Esper Sentinel': ['{W}', 'Artifact Creature — Human Soldier', ['W'], '1', '1'],
  'Orcish Bowmasters': ['{1}{B}', 'Creature — Orc Archer', ['B'], '1', '1'],
  'Necropotence': ['{B}{B}{B}', 'Enchantment', ['B']],
  'Underworld Breach': ['{1}{R}', 'Enchantment', ['R']],
  'Mana Drain': ['{U}{U}', 'Instant', ['U']],
  'Urza, Lord High Artificer': ['{2}{U}{U}', 'Legendary Creature — Human Artificer', ['U'], '1', '4'],
};

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers' || q.type === 'combatReview') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min ?? 1);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

// Seats listed in `ai` use the real AI controller; the others answer through
// `deciders` (a function per query type) or the default human-like choices.
function rulesGame({ deciders = [], ai = [], count = 3 } = {}) {
  const game = new MTG.Game({ seed: 20261005, paced: false, maxTurns: 60 });
  const players = Array.from({ length: count }, (_, index) => {
    const overrides = deciders[index] || {};
    const human = { decide: async (g, q) => overrides[q.type] ? overrides[q.type](g, q) : defaultDecision(g, q) };
    const player = game.addPlayer(['Alice', 'Bob', 'Cara', 'Dmitri'][index], { name: `Seat ${index}` }, human, ai.includes(index));
    if (ai.includes(index)) player.controller = new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' });
    return player;
  });
  game.turnPlayer = players[0];
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  return { game, players };
}

function permanent(game, player, name, { sick = false } = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = sick;
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
  assert.ok(guard < 300, 'stack and triggers settle');
}

const treasures = (game, player) => game.bf().filter(card => card.ctrl === player && card.hasSub('Treasure')).length;
const armies = (game, player) => game.creatures(player).filter(card => card.hasSub('Army'));
const noAiFallback = game => assert.equal(game.aiDecisionLog?.some(row => row.fallback) || false, false, 'AI decisions do not fall back');

async function botAction(game, player, window) {
  const result = await MTG.chooseBotAction({ gameState: game, botPlayerId: player.idx, difficulty: 'hard', seed: 5, actionWindow: window });
  assert.equal(result.log.fallback, false, 'AI V2 decides without fallback');
  return MTG.unwrapBotDecisionAction(result.action);
}
const mainWindow = (game, player) => {
  game.recalc();
  return { type: 'main', player, casts: game.castableList(player), acts: game.activatableList(player), lands: game.playableLands(player), phase: game.phase };
};
const priorityWindow = (game, player) => ({ type: 'priority', player, casts: game.castableList(player), acts: game.activatableList(player, true), stack: game.stack, phase: game.phase });

// ------------------------------------------------------------------ catalog
test('the manual batch preserves its provenance and registers seven certified, import-eligible cards', () => {
  const batch = MTG.ORACLE_BATCHES.find(row => row.id === BATCH_ID);
  assert.ok(batch, 'manual batch is registered');
  assert.equal(JSON.stringify(batch), JSON.stringify(report.batch), 'runtime batch exactly matches its provenance report');
  assert.equal(report.importedCount, 7);
  assert.deepEqual(report.importedNames, NAMES);
  assert.equal(batch.source.verifiedAgainstPinnedSnapshot, false);
  assert.equal(batch.source.pinnedSnapshot.bulkSha256, 'a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528');
  assert.match(report.provenance.oracleText, /by hand/);
  assert.match(report.provenance.requiredVerification, /pinned Scryfall oracle_cards snapshot/);
  assert.match(report.provenance.scryfallIds, /by card name/);
  assert.match(report.provenance.catalogExport, /intentionally left unchanged/);

  const pinned = new Map(fs.readFileSync(new URL('../docs/catalog/remaining-cards.csv', import.meta.url), 'utf8')
    .trim().split('\n').slice(1).map(line => line.slice(1, -1).split('","')).map(row => [row[0], row]));
  for (const [index, name] of NAMES.entries()) {
    const entry = batch.cards[index], def = MTG.DEFS[name], script = MTG.SCRIPTS[name], catalog = MTG.CARD_CATALOG[name];
    const [cost, typeLine, identity, power, toughness] = CHARACTERISTICS[name];
    assert.equal(entry.raw.name, name);
    assert.equal(entry.oracleId, pinned.get(name)[1], `${name}: Oracle ID from the pinned export`);
    assert.equal(entry.raw.cost, pinned.get(name)[2], `${name}: mana cost matches the pinned export`);
    assert.equal(pinned.get(name)[3], typeLine, `${name}: type line matches the pinned export`);
    assert.equal(entry.scryfallId, null);
    assert.equal(def.oracle, ORACLE[name], `${name}: exact hand-entered Oracle text`);
    assert.equal(def.cost, cost);
    if (power !== undefined) assert.deepEqual([def.power, def.toughness], [power, toughness]);
    assert.equal(!!def.autoScripted || !!def.simplified, false, `${name}: explicit implementation`);
    assert.equal(script.oracleImplemented, true);
    assert.equal(script.oracleId, entry.oracleId);
    assert.ok(script.oracleContracts.length > 1);
    for (const contract of script.oracleContracts) assert.ok(MTG.ORACLE_INTERACTION_CONTRACTS[contract], `${name}: known contract ${contract}`);
    assert.equal(catalog.engineStatus, 'certified');
    assert.equal(catalog.deckImportEligible, true);
    assert.equal(catalog.engineBatch, BATCH_ID);
    assert.equal(catalog.semanticClass, 'manual-deck-semantic');
    assert.equal(catalog.commanderLegality, 'legal');
    assert.equal(catalog.typeLine, typeLine);
    assert.deepEqual(Array.from(catalog.colorIdentity), identity);
    assert.equal(catalog.scryfallId, null);
    // No print ID is recorded, so the image is looked up by card name.
    for (const [variant, version] of [[undefined, 'normal'], ['art', 'art_crop']]) {
      const url = new URL(MTG.cardImageURL(name, variant));
      assert.equal(url.origin + url.pathname, MTG.CARD_IMAGE_API_BASE, `${name}: Scryfall name lookup`);
      assert.equal(url.searchParams.get('format'), 'image');
      assert.equal(url.searchParams.get('version'), version);
      assert.equal(url.searchParams.get('fuzzy'), name);
    }
  }
  // AI-facing hints on every decision the cards add.
  assert.equal(MTG.DEFS['Mana Drain'].targets[0].aiHint.goal, 'counter');
  assert.equal(MTG.DEFS['Orcish Bowmasters'].triggers.every(trigger => trigger.targets[0].aiHint.goal === 'damage'), true);
  assert.equal(typeof MTG.DEFS.Necropotence.abilities[0].aiScore, 'function');
  assert.equal(typeof MTG.DEFS['Urza, Lord High Artificer'].abilities[0].aiScore, 'function');
  assert.equal(MTG.DEFS['Orcish Bowmasters'].kws.includes('flash'), true);
});

test('a legal 100-card list with all seven staples imports, is interaction-ready and builds', () => {
  const basics = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
  const text = ['Commander', '1 Sliver Hivelord *CMDR*', '', 'Deck', ...NAMES.map(name => `1 ${name}`),
    ...basics.map((name, index) => `${index < 2 ? 19 : 18} ${name}`)].join('\n');
  const imported = MTG.importCommanderDeck(text, { name: 'Commander staples import' });
  assert.equal(imported.ok, true, JSON.stringify(imported.errors));
  assert.equal(imported.summary.resolvedCards, 100);
  assert.equal(imported.interactions.ready, true);
  assert.equal(imported.interactions.batchCards, 8, 'the seven staples plus the Oracle-batch commander');
  for (const contract of ['amass-army', 'spell-counter', 'mechanic-escape', 'mechanic-skip-draw-v9', 'mana-source']) {
    assert.ok(imported.interactions.contracts.some(entry => entry.id === contract), contract);
  }
  const game = new MTG.Game({ seed: 77, paced: false });
  const player = game.addPlayer('Importer', imported.deck, { decide: async (g, q) => defaultDecision(g, q) }, false);
  game.buildDeck(player, imported.deck, MTG.DEFS, imported.commanders);
  assert.equal(player.library.length, 99);
  for (const name of NAMES) assert.ok(player.library.some(card => card.name === name), name);
});

// ------------------------------------------------------------------ Smothering Tithe
test('Smothering Tithe: the drawing opponent decides; declining or being unable to pay creates a Treasure', async () => {
  const prompts = [];
  let answer = 'no';
  const { game, players: [alice, bob, cara] } = rulesGame({ deciders: [{ chooseOption: () => assert.fail('the Tithe controller is never asked') },
    { chooseOption: (g, q) => { prompts.push(q); return answer; } }] });
  permanent(game, alice, 'Smothering Tithe');
  for (let i = 0; i < 6; i++) { inZone(bob, 'Island', 'library'); inZone(alice, 'Island', 'library'); inZone(cara, 'Island', 'library'); }
  permanent(game, bob, 'Island'); permanent(game, bob, 'Island');

  await game.draw(bob, 1); await resolveAll(game);
  assert.equal(treasures(game, alice), 1, 'declined: Treasure');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].player, bob);
  assert.equal(prompts[0].aiHint.kind, 'oracleUnlessPayment');
  assert.deepEqual(Array.from(prompts[0].options, option => option.key), ['yes', 'no']);
  assert.match(prompts[0].options[0].label, /Pay \{2\}/);

  answer = 'yes';
  await game.draw(bob, 1); await resolveAll(game);
  assert.equal(treasures(game, alice), 1, 'paid: no Treasure');
  assert.equal(game.bf().filter(card => card.ctrl === bob && card.tapped).length, 2, 'Bob actually paid {2}');

  await game.draw(bob, 2); await resolveAll(game);
  assert.equal(prompts.length, 2, 'without mana Bob is not asked');
  assert.equal(treasures(game, alice), 3, 'one trigger and one Treasure per card drawn');

  await game.draw(alice, 2); await resolveAll(game);
  assert.equal(treasures(game, alice), 3, "the controller's own draws do not trigger");

  // Unlike Orcish Bowmasters, an opponent's first draw in their draw step counts.
  game.turnPlayer = cara; game.phase = 'draw';
  await game.draw(cara, 1); await resolveAll(game);
  assert.equal(treasures(game, alice), 4);
});

test('Smothering Tithe: an AI opponent pays with spare mana but keeps its mana while developing', async () => {
  {
    const { game, players: [alice, bob] } = rulesGame({ ai: [1] });
    permanent(game, alice, 'Smothering Tithe');
    for (let i = 0; i < 4; i++) { permanent(game, bob, 'Island'); inZone(bob, 'Island', 'library'); }
    inZone(bob, 'Divination', 'hand');
    await game.draw(bob, 1); await resolveAll(game);
    assert.equal(treasures(game, alice), 0, "on another player's turn the AI pays");
    assert.equal(game.bf().filter(card => card.ctrl === bob && card.tapped).length, 2);
    noAiFallback(game);
  }
  {
    const { game, players: [alice, bob] } = rulesGame({ ai: [1] });
    permanent(game, alice, 'Smothering Tithe');
    for (let i = 0; i < 3; i++) { permanent(game, bob, 'Island'); inZone(bob, 'Island', 'library'); }
    inZone(bob, 'Divination', 'hand');
    game.turnPlayer = bob; game.phase = 'draw';
    await game.draw(bob, 1); await resolveAll(game);
    assert.equal(treasures(game, alice), 1, 'with three lands and a spell to cast on its own turn the AI declines');
    assert.equal(game.bf().filter(card => card.ctrl === bob && card.tapped).length, 0);
    noAiFallback(game);
  }
  {
    const { game, players: [, bob] } = rulesGame({ ai: [1] });
    for (let i = 0; i < 9; i++) permanent(game, bob, 'Island');
    const policy = MTG.CommanderStaples.aiShouldPayTax;
    assert.equal(policy(game, bob, 2, 2), true);
    assert.equal(policy(game, bob, 3, 2), false, 'never pays more than the opponent would gain');
    assert.equal(policy(game, bob, 0, 2), true);
  }
});

// ------------------------------------------------------------------ Esper Sentinel
test('Esper Sentinel: only an opponent’s first noncreature spell each turn triggers, and X is the power on resolution', async () => {
  const prompts = [];
  let answer = 'no';
  const { game, players: [alice, bob, cara] } = rulesGame({ deciders: [{}, { chooseOption: (g, q) => { prompts.push(q); return answer; } },
    { chooseOption: (g, q) => { prompts.push(q); return 'no'; },
      chooseTargets: (g, q) => [q.candidates.find(candidate => candidate instanceof MTG.Player && candidate.name === 'Bob')] }] });
  const sentinel = permanent(game, alice, 'Esper Sentinel');
  for (let i = 0; i < 8; i++) { inZone(alice, 'Island', 'library'); inZone(bob, 'Island', 'library'); }
  game.turnPlayer = bob;
  bob.pool.G = 2; bob.pool.U = 12;
  const bears = inZone(bob, 'Grizzly Bears', 'hand');
  assert.equal(await game.castSpell(bob, bears, { from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(prompts.length, 0, 'a creature spell does not trigger');

  const first = inZone(bob, 'Divination', 'hand');
  assert.equal(await game.castSpell(bob, first, { from: 'hand' }), true);
  await game.flushTriggers();
  sentinel.counters['+1/+1'] = 2; game.recalc();
  const before = alice.hand.length;
  await resolveAll(game);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].player, bob, 'the caster decides');
  assert.match(prompts[0].options[0].label, /Pay \{3\}/, 'X is read on resolution');
  assert.equal(alice.hand.length, before + 1, 'declined: Alice draws');

  const second = inZone(bob, 'Divination', 'hand');
  assert.equal(await game.castSpell(bob, second, { from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(prompts.length, 1, "Bob's second noncreature spell this turn does not trigger");

  // Another opponent's first noncreature spell in the same turn triggers.
  cara.pool.R = 1; cara.pool.C = 3;
  const bolt = inZone(cara, 'Lightning Bolt', 'hand');
  const beforeCara = alice.hand.length;
  assert.equal(await game.castSpell(cara, bolt, { from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[1].player, cara);
  assert.equal(alice.hand.length, beforeCara + 1);

  // Paying stops the draw.
  game.turnNo++; bob.turnState = bob.freshTurnState();
  answer = 'yes';
  Object.assign(bob.pool, { W: 0, U: 9, B: 0, R: 0, G: 0, C: 0 });
  const pool = bob.pool.U;
  const third = inZone(bob, 'Divination', 'hand');
  assert.equal(await game.castSpell(bob, third, { from: 'hand' }), true);
  const drawn = alice.hand.length;
  await resolveAll(game);
  assert.equal(prompts.length, 3);
  assert.equal(alice.hand.length, drawn, 'paid: no draw');
  assert.equal(pool - bob.pool.U, 3 + 3, 'Bob paid Divination plus X = 3');

  // Alice's own noncreature spells never trigger.
  game.turnPlayer = alice; alice.pool.U = 3;
  const own = inZone(alice, 'Divination', 'hand');
  assert.equal(await game.castSpell(alice, own, { from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(prompts.length, 3);
});

test('Esper Sentinel: X uses last known power after the creature leaves, and the AI pays only a small X', async () => {
  {
    const prompts = [];
    const { game, players: [alice, bob] } = rulesGame({ deciders: [{}, { chooseOption: (g, q) => { prompts.push(q); return 'no'; } }] });
    const sentinel = permanent(game, alice, 'Esper Sentinel');
    inZone(alice, 'Island', 'library');
    sentinel.counters['+1/+1'] = 3; game.recalc();
    for (let i = 0; i < 3; i++) inZone(bob, 'Island', 'library');
    game.turnPlayer = bob; bob.pool.U = 9;
    assert.equal(await game.castSpell(bob, inZone(bob, 'Divination', 'hand'), { from: 'hand' }), true);
    await game.flushTriggers();
    await game.destroy(sentinel);
    assert.equal(sentinel.zone, 'graveyard');
    await resolveAll(game);
    assert.match(prompts[0].options[0].label, /Pay \{4\}/, 'last known power 4');
  }
  for (const [counters, paid] of [[0, true], [3, false]]) {
    const { game, players: [alice, bob] } = rulesGame({ ai: [1] });
    const sentinel = permanent(game, alice, 'Esper Sentinel');
    for (let i = 0; i < 3; i++) inZone(alice, 'Island', 'library');
    sentinel.counters['+1/+1'] = counters; game.recalc();
    for (let i = 0; i < 6; i++) { permanent(game, bob, 'Island'); inZone(bob, 'Island', 'library'); }
    game.turnPlayer = bob;
    const before = alice.hand.length;
    assert.equal(await game.castSpell(bob, inZone(bob, 'Divination', 'hand'), { from: 'hand' }), true);
    await resolveAll(game);
    assert.equal(alice.hand.length, before + (paid ? 0 : 1), `X=${1 + counters}: AI ${paid ? 'pays' : 'declines'}`);
    assert.equal(game.bf().filter(card => card.ctrl === bob && card.tapped).length, 3 + (paid ? 1 : 0));
    noAiFallback(game);
  }
});

// ------------------------------------------------------------------ Orcish Bowmasters
test('Orcish Bowmasters: flash, entry shot and amass, and the first draw-step draw exception', async () => {
  let targetChoice = null;
  const { game, players: [alice, bob, cara] } = rulesGame({ deciders: [{ chooseTargets: (g, q) => [targetChoice(q)] }] });
  game.turnPlayer = bob;
  const bowmasters = inZone(alice, 'Orcish Bowmasters', 'hand');
  const bears = inZone(alice, 'Grizzly Bears', 'hand');
  alice.pool.B = 4; alice.pool.G = 4;
  const casts = game.castableList(alice).map(row => row.card);
  assert.ok(casts.includes(bowmasters), "flash: castable on Bob's turn");
  assert.equal(casts.includes(bears), false);

  const elf = permanent(game, bob, 'Llanowar Elves');
  targetChoice = q => q.candidates.find(candidate => candidate === elf);
  assert.equal(await game.castSpell(alice, bowmasters, { from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(elf.zone, 'graveyard', 'the entry trigger dealt 1 damage');
  let [army] = armies(game, alice);
  assert.ok(army, 'amass created an Army');
  assert.equal(army.isToken, true);
  assert.equal(army.hasSub('Orc'), true);
  assert.deepEqual([army.power, army.toughness, army.counters['+1/+1']], [1, 1, 1]);
  assert.ok(army.colors.includes('B'));

  for (let i = 0; i < 12; i++) { inZone(bob, 'Island', 'library'); inZone(alice, 'Island', 'library'); inZone(cara, 'Island', 'library'); }
  targetChoice = q => q.candidates.find(candidate => candidate === cara);
  // Bob's own draw step: the first card is exempt, the second is not.
  game.turnPlayer = bob; game.phase = 'draw'; bob.turnState.c1920DrawStepN = 0;
  await game.draw(bob, 1); await resolveAll(game);
  assert.equal(cara.life, 40, 'first draw in Bob’s draw step is ignored');
  await game.draw(bob, 1); await resolveAll(game);
  assert.equal(cara.life, 39);
  // Cara draws during Bob's draw step: that is not her own draw step.
  await game.draw(cara, 1); await resolveAll(game);
  assert.equal(cara.life, 38);
  game.phase = 'main1';
  await game.draw(bob, 3); await resolveAll(game);
  assert.equal(cara.life, 35, 'one trigger per card drawn');
  await game.draw(alice, 2); await resolveAll(game);
  assert.equal(cara.life, 35, "Alice's own draws do not trigger");
  [army] = armies(game, alice);
  assert.equal(armies(game, alice).length, 1, 'amass grows the same Army');
  assert.equal(army.counters['+1/+1'], 6);

  // If its only target becomes illegal, the whole ability does nothing.
  const goblin = permanent(game, bob, 'Llanowar Elves');
  targetChoice = q => q.candidates.find(candidate => candidate === goblin);
  await game.draw(bob, 1);
  await game.flushTriggers();
  await game.destroy(goblin);
  await resolveAll(game);
  assert.equal(army.counters['+1/+1'], 6, 'fizzled: no amass');
});

test('Orcish Bowmasters: the AI aims the shot at an opposing X/1 creature, not its own', async () => {
  const { game, players: [alice, bob] } = rulesGame({ ai: [0] });
  const bowmasters = inZone(alice, 'Orcish Bowmasters', 'hand');
  permanent(game, alice, 'Swamp'); permanent(game, alice, 'Swamp');
  const ownElf = permanent(game, alice, 'Llanowar Elves');
  const elf = permanent(game, bob, 'Llanowar Elves');
  permanent(game, bob, 'Colossal Dreadmaw');
  assert.equal(await game.castSpell(alice, bowmasters, { from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(elf.zone, 'graveyard');
  assert.equal(ownElf.zone, 'battlefield');
  assert.equal(armies(game, alice).length, 1);
  noAiFallback(game);
});

// ------------------------------------------------------------------ Necropotence
test('Necropotence: skips the draw step and exiles every card its controller discards', async () => {
  for (const withNecropotence of [true, false]) {
    const { game, players: [alice] } = rulesGame();
    if (withNecropotence) permanent(game, alice, 'Necropotence');
    for (let i = 0; i < 5; i++) inZone(alice, 'Island', 'library');
    game.turnPlayer = alice;
    await game.runBeginningPhase(alice);
    assert.equal(alice.hand.length, withNecropotence ? 0 : 1, withNecropotence ? 'draw step skipped' : 'control game draws');
    assert.equal(alice.library.length, withNecropotence ? 5 : 4);
  }
  const { game, players: [alice, bob] } = rulesGame();
  permanent(game, alice, 'Necropotence');
  const discarded = inZone(alice, 'Divination', 'hand');
  await game.discard(alice, [discarded]); await resolveAll(game);
  assert.equal(discarded.zone, 'exile', 'own discard is exiled');
  assert.equal(discarded.faceDown, false);
  const theirs = inZone(bob, 'Divination', 'hand');
  await game.discard(bob, [theirs]); await resolveAll(game);
  assert.equal(theirs.zone, 'graveyard', "an opponent's discard is unaffected");
  const moved = inZone(alice, 'Grizzly Bears', 'hand');
  await game.discard(alice, [moved]);
  await game.flushTriggers();
  await game.move(moved, 'hand');
  await resolveAll(game);
  assert.equal(moved.zone, 'hand', 'a card that already left the graveyard is not exiled');
});

test('Necropotence: Pay 1 life exiles the top card face down until your next end step', async () => {
  const { game, players: [alice, bob] } = rulesGame();
  const necropotence = permanent(game, alice, 'Necropotence');
  for (let i = 0; i < 3; i++) inZone(alice, 'Island', 'library');
  const top = inZone(alice, 'Divination', 'library');
  const entry = game.activatableList(alice).find(row => row.card === necropotence);
  assert.ok(entry);
  game.turnPlayer = bob; // activated during an opponent's turn
  assert.equal(await game.activateAbility(alice, entry), true);
  await resolveAll(game);
  assert.equal(alice.life, 39);
  assert.equal(top.zone, 'exile');
  assert.equal(top.faceDown, true);
  assert.deepEqual(Array.from(top.meta.revealedTo), [], 'nobody may look at it');
  await game.emit('endStep', { player: bob }); await resolveAll(game);
  assert.equal(top.zone, 'exile', "an opponent's end step is not yours");
  assert.equal(top.faceDown, true);
  game.turnPlayer = alice;
  await game.emit('endStep', { player: alice }); await resolveAll(game);
  assert.equal(top.zone, 'hand', 'returned at your next end step');
  assert.equal(top.faceDown, false);
  await game.emit('endStep', { player: alice }); await resolveAll(game);
  assert.equal(alice.hand.filter(card => card === top).length, 1, 'the delayed trigger fires once');

  alice.library.length = 0;
  const empty = game.activatableList(alice).find(row => row.card === necropotence);
  assert.equal(await game.activateAbility(alice, empty), true);
  await resolveAll(game);
  assert.equal(alice.life, 38, 'life is a cost even with an empty library');
  assert.equal(game.delayed.some(row => row.staplesNecropotence), false);
});

test('Necropotence: the AI pays life only with a safe life total and room in hand', async () => {
  const { game, players: [alice, bob] } = rulesGame({ ai: [0] });
  const necropotence = permanent(game, alice, 'Necropotence');
  for (let i = 0; i < 12; i++) inZone(alice, i % 2 ? 'Island' : 'Divination', 'library');
  let action = await botAction(game, alice, mainWindow(game, alice));
  assert.equal(action.kind, 'activate');
  assert.equal(action.entry.card, necropotence);
  assert.equal(await game.performAction(alice, action), true);
  await resolveAll(game);
  assert.equal(alice.life, 39);
  const score = necropotence.def.abilities[0].aiScore;
  assert.ok(score(game, necropotence, alice) > 0.2);
  for (let i = 0; i < 6; i++) inZone(alice, 'Island', 'hand');
  assert.equal(score(game, necropotence, alice), 0, 'hand plus pending cards reach the maximum hand size');
  alice.hand.length = 0;
  alice.life = 14;
  assert.ok(score(game, necropotence, alice) > 0.2, 'still above the floor');
  alice.life = 13;
  assert.equal(score(game, necropotence, alice), 0, 'too little life');
  alice.life = 25;
  permanent(game, bob, 'Colossal Dreadmaw'); permanent(game, bob, 'Colossal Dreadmaw'); permanent(game, bob, 'Colossal Dreadmaw');
  assert.equal(score(game, necropotence, alice), 0, 'opposing board threatens the life total');
  game.turnPlayer = bob;
  assert.equal(score(game, necropotence, alice), 0, "not on an opponent's turn");
  noAiFallback(game);
});

// ------------------------------------------------------------------ Underworld Breach
test('Underworld Breach: escape for nonland cards in its controller’s graveyard with three other cards', async () => {
  const exiledChoices = [];
  const { game, players: [alice, bob] } = rulesGame({ deciders: [{
    chooseCards: (g, q) => { exiledChoices.push(q); return q.from.slice(0, q.min); },
    chooseTargets: (g, q) => [q.candidates.find(candidate => candidate === bob)],
  }] });
  const bolt = inZone(alice, 'Lightning Bolt', 'graveyard');
  const land = inZone(alice, 'Mountain', 'graveyard');
  inZone(alice, 'Grizzly Bears', 'graveyard');
  alice.pool.R = 5;
  const breachOffers = () => game.castableList(alice).filter(row => row.alt?.starterPermission === 'staplesBreach');
  assert.equal(breachOffers().length, 0, 'no Breach, no escape');
  const breach = permanent(game, alice, 'Underworld Breach');
  assert.equal(breachOffers().length, 0, 'only two other cards in the graveyard');
  inZone(alice, 'Divination', 'graveyard');
  const vision = inZone(alice, 'Ancestral Vision', 'graveyard');
  const offered = breachOffers().map(row => row.card);
  assert.ok(offered.includes(bolt));
  assert.equal(offered.includes(land), false, 'lands do not gain escape');
  assert.equal(offered.includes(vision), false, 'no mana cost: unpayable escape cost');
  for (const name of ['Lightning Bolt', 'Divination', 'Grizzly Bears', 'Mountain']) inZone(bob, name, 'graveyard');
  bob.pool.R = 5;
  assert.equal(game.castableList(bob).some(row => row.alt?.starterPermission === 'staplesBreach'), false, "opponents' graveyards are unaffected");

  const offer = breachOffers().find(row => row.card === bolt);
  assert.deepEqual({ escape: offer.alt.escape, exileN: offer.alt.exileN, cost: offer.alt.altCostStr }, { escape: true, exileN: 3, cost: '{R}' });
  const graveBefore = alice.graveyard.length;
  assert.equal(await game.castSpell(alice, bolt, { from: 'graveyard', alt: offer.alt }), true);
  assert.equal(exiledChoices.length, 1);
  assert.equal(exiledChoices[0].min, 3);
  assert.equal(exiledChoices[0].from.includes(bolt), false, 'three OTHER cards');
  assert.equal(alice.exile.length, 3);
  assert.equal(alice.pool.R, 4, 'paid the mana cost');
  await resolveAll(game);
  assert.equal(bob.life, 37);
  assert.equal(bolt.zone, 'graveyard', 'an escaped instant returns to the graveyard');
  assert.equal(alice.graveyard.length, graveBefore - 3);

  // At the beginning of EVERY end step, including an opponent's.
  game.turnPlayer = bob;
  await game.emit('endStep', { player: bob }); await resolveAll(game);
  assert.equal(breach.zone, 'graveyard', 'sacrificed');
});

test('Underworld Breach: a double-faced card escapes as its front face', async () => {
  const { game, players: [alice, bob] } = rulesGame({ deciders: [{
    chooseTargets: (g, q) => [q.candidates.find(candidate => candidate.ctrl && candidate.ctrl.name === 'Bob')],
  }] });
  permanent(game, alice, 'Underworld Breach');
  const hagra = inZone(alice, 'Hagra Mauling', 'graveyard');
  for (const name of ['Island', 'Forest', 'Plains']) inZone(alice, name, 'graveyard');
  const bears = permanent(game, bob, 'Grizzly Bears');
  alice.pool.B = 4;
  const offer = game.castableList(alice).find(row => row.card === hagra && row.alt?.starterPermission === 'staplesBreach');
  assert.ok(offer, 'the modal double-faced spell gains escape');
  assert.deepEqual([offer.alt.oracleFace, offer.alt.altCostStr], ['front', '{2}{B}{B}']);
  assert.equal(await game.castSpell(alice, hagra, { from: 'graveyard', alt: offer.alt }), true);
  await resolveAll(game);
  assert.equal(bears.zone, 'graveyard');
  assert.equal(hagra.zone, 'graveyard');
  assert.equal(alice.exile.length, 3);
});

test('Underworld Breach: an escaped permanent counts as escaped (Uro stays)', async () => {
  const { game, players: [alice] } = rulesGame();
  const breach = permanent(game, alice, 'Underworld Breach');
  const uro = inZone(alice, "Uro, Titan of Nature's Wrath", 'graveyard');
  for (const name of ['Island', 'Forest', 'Divination']) inZone(alice, name, 'graveyard');
  for (let i = 0; i < 3; i++) inZone(alice, 'Island', 'library');
  alice.pool.G = 1; alice.pool.U = 2;
  const offer = game.castableList(alice).find(row => row.card === uro && row.alt?.starterPermission === 'staplesBreach');
  assert.ok(offer, 'Breach adds an escape for its mana cost');
  assert.equal(offer.alt.altCostStr, '{1}{G}{U}');
  assert.equal(await game.castSpell(alice, uro, { from: 'graveyard', alt: offer.alt }), true);
  await resolveAll(game);
  assert.equal(uro.zone, 'battlefield', 'escaped, so its sacrifice trigger does nothing');
  assert.equal(uro.castMeta.alt.escape, true);
  await game.emit('endStep', { player: alice }); await resolveAll(game);
  assert.equal(breach.zone, 'graveyard', "also sacrificed at its controller's own end step");
});

test('Underworld Breach: the AI escapes a removal spell from its graveyard', async () => {
  const { game, players: [alice, bob] } = rulesGame({ ai: [0] });
  permanent(game, alice, 'Underworld Breach');
  const murder = inZone(alice, 'Murder', 'graveyard');
  for (const name of ['Island', 'Plains', 'Forest']) inZone(alice, name, 'graveyard');
  for (let i = 0; i < 3; i++) permanent(game, alice, 'Swamp');
  const dreadmaw = permanent(game, bob, 'Colossal Dreadmaw');
  const action = await botAction(game, alice, mainWindow(game, alice));
  assert.equal(action.kind, 'cast');
  assert.equal(action.card, murder);
  assert.equal(action.alt.starterPermission, 'staplesBreach');
  assert.equal(await game.performAction(alice, action), true);
  await resolveAll(game);
  assert.equal(dreadmaw.zone, 'graveyard');
  assert.equal(alice.exile.length, 3);
  assert.equal(murder.zone, 'graveyard');
  noAiFallback(game);
});

// ------------------------------------------------------------------ Mana Drain
async function drain(game, caster, opponent, spellName, payment, xVal) {
  const spell = inZone(opponent, spellName, 'hand');
  Object.assign(opponent.pool, payment);
  assert.equal(await game.castSpell(opponent, spell, { from: 'hand', ...(xVal !== undefined ? { xVal } : {}) }), true);
  const manaDrain = inZone(caster, 'Mana Drain', 'hand');
  caster.pool.U += 2;
  assert.equal(await game.castSpell(caster, manaDrain, { from: 'hand' }), true);
  return { spell, manaDrain };
}

test('Mana Drain: counters, then adds {C} equal to the spell’s mana value at the caster’s next main phase', async () => {
  const { game, players: [alice, bob] } = rulesGame({ deciders: [{ chooseTargets: (g, q) => [q.candidates[0]] }, { chooseTargets: (g, q) => [q.candidates.find(c => c !== bob) || q.candidates[0]] }] });
  // Cast on an opponent's turn: only Alice's next main phase pays out.
  game.turnPlayer = bob;
  const { spell } = await drain(game, alice, bob, 'Fireball', { R: 4 }, 3);
  await resolveAll(game);
  assert.equal(spell.zone, 'graveyard', 'countered');
  await game.emitMainPhase(bob); await resolveAll(game);
  assert.equal(alice.pool.C, 0, "not during an opponent's main phase");
  game.turnPlayer = alice;
  await game.emitMainPhase(alice, { precombat: true }); await resolveAll(game);
  assert.equal(alice.pool.C, 4, 'Fireball with X=3 has mana value 4');
  assert.deepEqual(['W', 'U', 'B', 'R', 'G'].map(color => alice.pool[color]), [0, 0, 0, 0, 0], 'colorless only');
  assert.equal(game.delayed.some(row => row.staplesNextMainPhase), false);
  game.emptyPool();

  // Cast in your precombat main phase: the postcombat main of this turn.
  game.phase = 'main1';
  await drain(game, alice, bob, 'Lightning Bolt', { R: 1 });
  await resolveAll(game);
  await game.emitMainPhase(alice); await resolveAll(game);
  assert.equal(alice.pool.C, 1);
  game.emptyPool();

  // Cast in your postcombat main phase: your next turn's precombat main.
  game.phase = 'main2';
  await drain(game, alice, bob, 'Lightning Bolt', { R: 1 });
  await resolveAll(game);
  game.turnPlayer = bob; await game.emitMainPhase(bob, { precombat: true }); await resolveAll(game);
  assert.equal(alice.pool.C, 0);
  game.turnPlayer = alice; await game.emitMainPhase(alice, { precombat: true }); await resolveAll(game);
  assert.equal(alice.pool.C, 1);
});

test('Mana Drain: an uncounterable spell still yields mana; a vanished target fizzles', async () => {
  const { game, players: [alice, bob] } = rulesGame();
  game.turnPlayer = bob;
  const { spell } = await drain(game, alice, bob, 'Carnage Tyrant', { G: 6 });
  await resolveAll(game);
  assert.equal(spell.zone, 'battlefield', "Carnage Tyrant can't be countered");
  game.turnPlayer = alice;
  await game.emitMainPhase(alice, { precombat: true }); await resolveAll(game);
  assert.equal(alice.pool.C, 6);
  game.emptyPool();

  game.turnPlayer = bob;
  const { manaDrain } = await drain(game, alice, bob, 'Lightning Bolt', { R: 1 });
  const target = game.stack.find(row => row.card?.name === 'Lightning Bolt');
  await game.counterStackObject(target);
  await resolveAll(game);
  assert.equal(manaDrain.zone, 'graveyard');
  assert.equal(game.delayed.some(row => row.staplesNextMainPhase), false, 'fizzled: no delayed mana');
});

test('Mana Drain: the AI counters an opponent’s spell with open blue mana', async () => {
  const { game, players: [alice, bob] } = rulesGame({ ai: [0] });
  const manaDrain = inZone(alice, 'Mana Drain', 'hand');
  permanent(game, alice, 'Island'); permanent(game, alice, 'Island');
  game.turnPlayer = bob;
  bob.pool.U = 3;
  const divination = inZone(bob, 'Divination', 'hand');
  assert.equal(await game.castSpell(bob, divination, { from: 'hand' }), true);
  const action = await botAction(game, alice, priorityWindow(game, alice));
  assert.equal(action.kind, 'cast');
  assert.equal(action.card, manaDrain);
  assert.equal(await game.performAction(alice, action), true);
  await resolveAll(game);
  assert.equal(divination.zone, 'graveyard');
  game.turnPlayer = alice;
  await game.emitMainPhase(alice, { precombat: true }); await resolveAll(game);
  assert.equal(alice.pool.C, 3);
  noAiFallback(game);
});

// ------------------------------------------------------------------ Urza, Lord High Artificer
test('Urza: the Construct counts artifacts and the mana ability can tap a summoning-sick artifact creature', async () => {
  const tapChoices = [];
  const { game, players: [alice] } = rulesGame({ deciders: [{ chooseCards: (g, q) => { tapChoices.push(q); return [q.from.find(card => card.hasSub('Construct'))]; } }] });
  const urza = inZone(alice, 'Urza, Lord High Artificer', 'hand');
  alice.pool.U = 4;
  assert.equal(await game.castSpell(alice, urza, { from: 'hand' }), true);
  await resolveAll(game);
  const construct = game.bf().find(card => card.ctrl === alice && card.hasSub('Construct'));
  assert.ok(construct);
  assert.deepEqual([construct.isToken, construct.is('Artifact'), construct.is('Creature'), construct.colors.length], [true, true, true, 0]);
  assert.deepEqual([construct.power, construct.toughness], [1, 1], 'counts itself');
  const ring = permanent(game, alice, 'Sol Ring');
  assert.deepEqual([construct.power, construct.toughness], [2, 2]);
  assert.equal(construct.sick && urza.sick, true, 'both are summoning sick');

  const source = game.manaSources(alice, null).find(row => row.card === urza);
  assert.ok(source, "Urza's mana ability is available while Urza is summoning sick");
  assert.equal(await game.activateManaSource(alice, source, { U: 1 }), true);
  assert.equal(alice.pool.U, 1);
  assert.equal(tapChoices.length, 1);
  assert.equal(tapChoices[0].from.includes(ring), true);
  assert.equal(tapChoices[0].from.includes(urza), false, 'Urza is not an artifact');
  assert.equal(construct.tapped, true, 'the sick Construct paid the cost');
  assert.equal(urza.tapped, false);
});

test('Urza: {5} exiles the shuffled top card, playable free this turn only', async () => {
  for (const kind of ['spell', 'land']) {
    const { game, players: [alice] } = rulesGame();
    const urza = permanent(game, alice, 'Urza, Lord High Artificer');
    for (let i = 0; i < 4; i++) inZone(alice, kind === 'spell' ? 'Divination' : 'Island', 'library');
    alice.pool.C = 5;
    const entry = game.activatableList(alice).find(row => row.card === urza && row.ability);
    assert.equal(await game.activateAbility(alice, entry), true);
    await resolveAll(game);
    assert.equal(alice.pool.C, 0);
    const exiled = alice.exile.at(-1);
    assert.ok(exiled, 'top card exiled face up');
    assert.equal(exiled.faceDown, false);
    if (kind === 'spell') {
      const offer = game.castableList(alice).find(row => row.card === exiled);
      assert.ok(offer, 'castable from exile');
      assert.equal(offer.alt.free, true, 'without paying its mana cost');
      assert.equal(await game.castSpell(alice, exiled, { from: 'exile', alt: offer.alt }), true);
      await resolveAll(game);
      assert.equal(exiled.zone, 'graveyard');
      assert.equal(alice.hand.length, 2, 'Divination resolved for free');
    } else {
      assert.ok(game.playableLands(alice).includes(exiled), 'a land can be played from exile');
      assert.equal(await game.playLand(alice, exiled), true);
      assert.equal(exiled.zone, 'battlefield');
    }
  }
  const { game, players: [alice] } = rulesGame();
  const urza = permanent(game, alice, 'Urza, Lord High Artificer');
  for (let i = 0; i < 4; i++) inZone(alice, 'Divination', 'library');
  alice.pool.C = 5;
  assert.equal(await game.activateAbility(alice, game.activatableList(alice).find(row => row.card === urza && row.ability)), true);
  await resolveAll(game);
  const exiled = alice.exile.at(-1);
  game.turnNo++;
  assert.equal(game.castableList(alice).some(row => row.card === exiled), false, 'the permission ends with the turn');
});

test('Urza: the AI pays with Urza’s mana ability, activates {5} and plays the exiled card free', async () => {
  const { game, players: [alice] } = rulesGame({ ai: [0] });
  const urza = permanent(game, alice, 'Urza, Lord High Artificer', { sick: true });
  const construct = (await game.makeTokens(MTG.TOKENS.bomConstruct, alice))[0];
  assert.equal(construct.sick, true);
  for (let i = 0; i < 6; i++) inZone(alice, 'Divination', 'library');
  const opt = inZone(alice, 'Opt', 'hand');
  assert.equal(await game.castSpell(alice, opt, { from: 'hand' }), true, 'the only blue source is Urza tapping the sick Construct');
  assert.equal(construct.tapped, true);
  assert.equal(urza.tapped, false);
  await resolveAll(game);

  for (let i = 0; i < 5; i++) permanent(game, alice, 'Island');
  alice.hand.length = 0;
  let action = await botAction(game, alice, mainWindow(game, alice));
  assert.equal(action.kind, 'activate');
  assert.equal(action.entry.card, urza);
  assert.equal(await game.performAction(alice, action), true);
  await resolveAll(game);
  const exiled = alice.exile.at(-1);
  assert.equal(exiled.name, 'Divination');
  action = await botAction(game, alice, mainWindow(game, alice));
  assert.equal(action.kind, 'cast');
  assert.equal(action.card, exiled);
  assert.equal(action.alt.free, true);
  assert.equal(await game.performAction(alice, action), true);
  await resolveAll(game);
  assert.equal(exiled.zone, 'graveyard');
  noAiFallback(game);
});

// ------------------------------------------------------------------ shared native smoke
test('the shared native/manual smoke runs all seven cards for a human and an AI controller', { timeout: 120_000 }, async () => {
  const result = await auditNativeCatalog(MTG, NAMES);
  assert.deepEqual(result.results.filter(row => row.status === 'error'), []);
  assert.equal(result.results.length, 14);
  assert.deepEqual(result.results.filter(row => row.status !== 'runtime-smoke-pass').map(row => `${row.name}/${row.role}: ${row.status}`), []);
});
