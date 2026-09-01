import test from 'node:test';
import assert from 'node:assert/strict';
import {createImportPlan, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const card = (name, oracle_text, type_line = 'Legendary Creature — Human', extra = {}) => ({
  name, oracle_text, type_line, layout: 'normal', mana_cost: type_line.includes('Planeswalker') ? '{2}{U}' : '{1}{G}',
  ...(type_line.includes('Creature') ? {power: '2', toughness: '2'} : {}),
  ...(type_line.includes('Planeswalker') ? {loyalty: '4'} : {}),
  oracle_id: 'pair-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  id: 'pair-print-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), games: ['paper'],
  legalities: {commander: 'legal'}, color_identity: type_line.includes('Planeswalker') ? ['U'] : ['G'], ...extra,
});
const linked = name => ({all_parts: [{object: 'related_card', component: 'combo_piece', name}]});
const sources = [
  card('V8 Pair Partner', 'Partner'),
  card('V8 Pair Friends', 'Friends forever'),
  card('V8 Pair Named', 'Partner—Survivors'),
  card('V8 Pair Background Choice', 'Choose a Background'),
  card('V8 Pair Companion', "Doctor's companion"),
  card('V8 Pair With', 'Partner with V8 Exact Mate', undefined, linked('V8 Exact Mate')),
  card('V8 Pair With Common', 'Partner with V8 Common Mate', 'Creature — Human', linked('V8 Common Mate')),
  card('V8 Pair With Walker', 'Partner with V8 Walker Mate', 'Legendary Planeswalker — Proof', linked('V8 Walker Mate')),
];
const plan = createImportPlan({cards: sources, bulk: {updated_at: '2026-08-31T00:00:00Z'}, sequence: 9959, limit: sources.length, compilerVersion: 8});
assert.equal(plan.report.cards.length, sources.length);
const M = loadEngine();
M.registerOracleBatch(plan.report); M.initData(M.RAW_DATA);

const plain = (name, options = {}) => ({name, cost: options.cost ?? null, super: options.super ?? ['Legendary'],
  types: options.types ?? ['Creature'], subtypes: options.subtypes ?? ['Human'], oracle: options.oracle || '', kws: [], power: '2', toughness: '2'});

test('v8 pairing grammar emits one closed descriptor and rejects wrong contexts or names', () => {
  const expected = new Map([
    ['V8 Pair Partner', {variant: 'partner'}],
    ['V8 Pair Friends', {variant: 'named', label: 'Friends forever'}],
    ['V8 Pair Named', {variant: 'named', label: 'Survivors'}],
    ['V8 Pair Background Choice', {variant: 'background'}],
    ['V8 Pair Companion', {variant: 'doctorsCompanion'}],
    ['V8 Pair With', {variant: 'with', partnerName: 'V8 Exact Mate', search: true}],
    ['V8 Pair With Common', {variant: 'with', partnerName: 'V8 Common Mate', search: true}],
    ['V8 Pair With Walker', {variant: 'with', partnerName: 'V8 Walker Mate', search: true}],
  ]);
  for (const source of sources) {
    const result = semanticClass(source, {compilerVersion: 8});
    assert.ok(result.semanticClass, source.name);
    assert.deepEqual(result.implementation, [{kind: 'commander-pairing', ...expected.get(source.name), contract: 'commander-pairing'}]);
    assert.deepEqual(result.oracleContracts, ['commander-pairing']);
    assert.equal(JSON.stringify(M.SCRIPTS[source.name].oracleCommanderPairing), JSON.stringify(
      {variant: expected.get(source.name).variant, ...(expected.get(source.name).label ? {label: expected.get(source.name).label} : {}), ...(expected.get(source.name).partnerName ? {partnerName: expected.get(source.name).partnerName} : {})}));
  }
  const invalid = [
    card('Bad ordinary partner', 'Partner', 'Creature — Human'),
    card('Bad artifact partner', 'Partner', 'Legendary Artifact'),
    card('Bad ordinary friends', 'Friends forever', 'Creature — Human'),
    card('Bad ordinary background', 'Choose a Background', 'Creature — Human'),
    card('Bad enchantment companion', "Doctor's companion", 'Legendary Enchantment'),
    card('Bad empty label', 'Partner—'),
    card('Bad missing link', 'Partner with V8 Exact Mate'),
    card('Bad wrong link', 'Partner with V8 Exact Mate and draw a card.', undefined, linked('V8 Exact Mate')),
    card('Bad artifact with', 'Partner with V8 Exact Mate', 'Legendary Artifact', linked('V8 Exact Mate')),
  ];
  for (const source of invalid) assert.equal(semanticClass(source, {compilerVersion: 8}).semanticClass, undefined, source.name);
});

test('loader pairing authority enforces names, labels, Background and the exact Doctor type', () => {
  const partner = M.DEFS['V8 Pair Partner'];
  const partnerMate = plain('Ordinary Partner Mate', {oracle: 'Partner'});
  assert.equal(M.canPartner(partner, partnerMate), true);
  assert.equal(M.canPartner(partner, plain('No marker')), false);

  const named = M.DEFS['V8 Pair Named'];
  assert.equal(M.canPartner(named, plain('Matching Survivor', {oracle: 'Partner—survivors'})), true, 'shared labels compare case-insensitively');
  assert.equal(M.canPartner(named, plain('Different Survivor', {oracle: 'Partner—Friends forever'})), false);

  const withCard = M.DEFS['V8 Pair With'];
  assert.equal(M.canPartner(withCard, plain('V8 Exact Mate')), true);
  assert.equal(M.canPartner(withCard, plain('V8 Exact Mate typo')), false);

  const backgroundChoice = M.DEFS['V8 Pair Background Choice'];
  const background = plain('Exact Background', {cost: '{U}', types: ['Enchantment'], subtypes: ['Background']});
  assert.equal(M.canPartner(backgroundChoice, background), true);
  assert.equal(M.canPartner(backgroundChoice, plain('Nonlegendary Background', {super: [], types: ['Enchantment'], subtypes: ['Background']})), false);
  assert.equal(M.canPartner(backgroundChoice, plain('Creature Background', {types: ['Creature'], subtypes: ['Background']})), false);
  assert.equal(M.canBeCommander(background), true);
  assert.equal(M.canBeCommander(plain('Fake Background', {super: [], types: ['Enchantment'], subtypes: ['Background']})), false);

  const companion = M.DEFS['V8 Pair Companion'];
  const doctor = plain('Exact Doctor', {cost: '{U}', subtypes: ['Time', 'Lord', 'Doctor']});
  assert.equal(M.canPartner(companion, doctor), true);
  assert.equal(M.canPartner(companion, plain('Extra Doctor', {subtypes: ['Time', 'Lord', 'Doctor', 'Alien']})), false);
  assert.equal(M.canPartner(companion, plain('Not Time Lord', {subtypes: ['Doctor']})), false);
  assert.equal(M.canPartner(companion, plain('Doctor Enchantment', {types: ['Enchantment'], subtypes: ['Time', 'Lord', 'Doctor']})), false);
});

for (const role of ['human', 'ai']) test(`v8 pairing ${role}: real deck setup accepts a legal pair and rejects either single color identity`, () => {
  const source = M.DEFS['V8 Pair Partner'];
  const mate = plain('Blue Partner Mate', {cost: '{U}', oracle: 'Partner'});
  const filler = plain('Blue Pair Filler', {cost: '{U}', super: [], types: ['Instant']});
  const defs = {...M.DEFS, [mate.name]: mate, [filler.name]: filler};
  const deck = {name: 'Pair setup ' + role, commander: source.name, trustedFaceCommander: false,
    cards: [{n: 1, name: source.name}, {n: 1, name: mate.name}, {n: 1, name: filler.name}]};
  assert.equal(M.validateCommanders(deck, [source.name], defs).ok, false, 'green alone cannot cover the blue deck card');
  assert.equal(M.validateCommanders(deck, [mate.name], defs).ok, false, 'blue alone cannot cover the green deck card');
  assert.equal(M.validateCommanders(deck, [source.name, mate.name], defs).ok, true, 'the exact pair supplies combined identity');
  assert.equal(M.validateCommanders(deck, [source.name, filler.name], defs).ok, false, 'ordinary second legendary is not a partner');
  const game = new M.Game({seed: 88913, paced: false});
  const controller = role === 'human' ? {decide: async () => null} : null;
  const player = game.addPlayer('Pair seat', deck, controller, role === 'ai');
  if (role === 'ai') player.controller = new M.AIController(player, {difficulty: 'hard', style: 'balanced'});
  const chosen = role === 'ai' ? M.randomCommanders(deck, () => 0, defs) : [source.name, mate.name];
  assert.deepEqual(new Set(chosen), new Set([source.name, mate.name]));
  game.buildDeck(player, deck, defs, chosen);
  assert.equal(player.command.length, 2);
  assert.deepEqual(Array.from(player.commanderNames), Array.from(chosen));
  assert.ok(player.commanders.every(card => card.commander && card.cmdCasts === 0));
});

for (const role of ['human', 'ai']) test(`v8 pairing ${role}: Partner with uses the chosen player's real optional search and shuffle`, async () => {
  const game = new M.Game({seed: 88917, paced: false});
  const human = {decide: async (g, query) => query.aiHint?.kind === 'partnerSearch' ? 'yes' : query.options?.[0]?.key ?? null};
  const owner = game.addPlayer('Owner', {}, human, role === 'ai');
  const recipient = game.addPlayer('Recipient', {}, human, role === 'ai');
  if (role === 'ai') recipient.controller = new M.AIController(recipient, {difficulty: 'hard', style: 'balanced'});
  const source = new M.CardInst(M.DEFS['V8 Pair With'], owner); source.zone = 'battlefield'; game.battlefield.push(source); game.recalc();
  const mateDef = plain('V8 Exact Mate');
  const mate = new M.CardInst(mateDef, recipient); mate.zone = 'library'; recipient.library.push(mate);
  for (let index = 0; index < 3; index++) {const filler = new M.CardInst(M.DEFS.Forest, recipient); filler.zone = 'library'; recipient.library.push(filler);}
  const trigger = source.def.triggers.find(row => row.desc === 'Partner with V8 Exact Mate');
  assert.ok(trigger);
  assert.deepEqual(new Set(game.legalTargets(trigger.targets[0], source, owner)), new Set([owner, recipient]));
  let shuffles = 0; const shuffle = M.shuffle; M.shuffle = (...args) => {shuffles++; return shuffle(...args);};
  try {await trigger.run({g: game, src: source, you: owner, targets: [recipient]});}
  finally {M.shuffle = shuffle;}
  assert.equal(mate.zone, 'hand'); assert.ok(recipient.hand.includes(mate)); assert.equal(shuffles, 1);
  if (role === 'ai') assert.ok(recipient.controller instanceof M.AIController);

  const declined = new M.CardInst(mateDef, recipient); declined.zone = 'library'; recipient.library.push(declined);
  const decide = recipient.controller.decide.bind(recipient.controller);
  recipient.controller.decide = (g, query) => query.aiHint?.kind === 'partnerSearch' ? 'no' : decide(g, query);
  await trigger.run({g: game, src: source, you: owner, targets: [recipient]});
  assert.equal(declined.zone, 'library', 'declining leaves the exact named card in the library');
});
