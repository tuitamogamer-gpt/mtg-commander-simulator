import test from 'node:test';
import assert from 'node:assert/strict';
import {createImportPlan, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const rawCard = (name, oracle_text, extra = {}) => ({
  name, oracle_text, type_line: extra.type_line || 'Instant', layout: 'normal', mana_cost: extra.mana_cost || '{1}{U}',
  oracle_id: 'entwine-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  id: 'entwine-print-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), games: ['paper'],
  legalities: {commander: 'legal'}, color_identity: extra.color_identity || ['U'],
});

const sources = [
  rawCard('V8 Entwine Order', 'Choose one —\n• Tap target creature.\n• Untap target creature.\nEntwine {1}'),
  rawCard('V8 Entwine Value', 'Choose one —\n• You draw two cards.\n• You gain 3 life.\nEntwine {2}', {type_line: 'Sorcery', mana_cost: '{1}{G}', color_identity: ['G']}),
  rawCard('V8 Entwine Lands', 'Choose one —\n• You gain 2 life.\n• Draw a card.\nEntwine—Sacrifice two lands.', {type_line: 'Sorcery', mana_cost: '{1}{G}', color_identity: ['G']}),
  rawCard('V8 Entwine Four', 'Choose two —\n• You gain 1 life.\n• You gain 2 life.\n• Draw a card.\n• Create a 1/1 white Soldier creature token.\nEntwine {3}', {type_line: 'Sorcery', mana_cost: '{2}{W}', color_identity: ['W']}),
  rawCard('V8 Entwine Split Targets', 'Choose one —\n• Destroy target artifact.\n• Destroy target land.\nEntwine {1}', {mana_cost: '{1}{R}', color_identity: ['R']}),
];

const plan = createImportPlan({cards: sources, bulk: {updated_at: '2026-08-31T00:00:00Z'}, sequence: 9956, limit: sources.length, compilerVersion: 8});
assert.equal(plan.report.cards.length, sources.length);
const M = loadEngine(); M.registerOracleBatch(plan.report); M.initData(M.RAW_DATA);

const fixture = (name, types = ['Creature'], extra = {}) => ({name, cost: extra.cost || '{1}', super: extra.super || [], types,
  subtypes: extra.subtypes || [], oracle: '', kws: extra.kws || [], power: types.includes('Creature') ? extra.power || '2' : undefined,
  toughness: types.includes('Creature') ? extra.toughness || '20' : undefined, ...extra});

function put(game, player, definition, zone = 'battlefield') {
  const card = new M.CardInst(typeof definition === 'string' ? M.DEFS[definition] : definition, player);
  card.zone = zone; card.ctrl = player; card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
  game.recalc(); return card;
}

function context(role = 'human', state = {}) {
  const decisions = [];
  const human = {decide: async (game, query) => {
    if (query.type === 'priority') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return query.candidates.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseCards') return query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption') {
      if (query.aiHint?.kind === 'entwine') return state.entwine ?? 'no';
      if (query.aiHint?.kind === 'mode') return String(state.mode ?? 0);
      return query.options.find(option => option.key === 'yes')?.key ?? query.options[0]?.key;
    }
    if (query.type === 'chooseMulti') return (state.modes || query.options.slice(0, query.min || 1).map(option => option.key)).map(String);
    if (query.type === 'orderTriggers') return query.triggers;
    return null;
  }};
  const game = new M.Game({seed: 127219, paced: false});
  const a = game.addPlayer('Entwine A', {name: 'Entwine A'}, human, role === 'ai');
  const b = game.addPlayer('Entwine B', {name: 'Entwine B'}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (currentGame, query) => {const answer = await decide(currentGame, query); decisions.push({query, answer}); return answer;};
  game.turnPlayer = a; game.turnNo = 4; game.phase = 'main1'; game.step = 'main'; game.priorityRound = async () => {};
  for (const player of [a, b]) for (let index = 0; index < 30; index++) put(game, player, 'Forest', 'library');
  return {game, a, b, decisions, role};
}

function fund(player, n = 30) {for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = n;}
const totalMana = player => Object.values(player.pool).reduce((sum, n) => sum + n, 0);
async function settle(game) {let guard = 0; while ((game.pendingTriggers.length || game.stack.length) && guard++ < 60) {await game.flushTriggers(); if (game.stack.length) await game.resolveTop();}
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0); assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);}

test('v8 Entwine grammar emits a closed modifier plus an independently complete modal spell', () => {
  const expectations = new Map([
    ['V8 Entwine Order', {cost: {kind: 'mana', mana: '{1}'}, modeCount: 2, printedChoice: {min: 1, max: 1}}],
    ['V8 Entwine Value', {cost: {kind: 'mana', mana: '{2}'}, modeCount: 2, printedChoice: {min: 1, max: 1}}],
    ['V8 Entwine Lands', {cost: {kind: 'sacrifice', type: 'Land', n: 2}, modeCount: 2, printedChoice: {min: 1, max: 1}}],
    ['V8 Entwine Four', {cost: {kind: 'mana', mana: '{3}'}, modeCount: 4, printedChoice: {min: 2, max: 2}}],
    ['V8 Entwine Split Targets', {cost: {kind: 'mana', mana: '{1}'}, modeCount: 2, printedChoice: {min: 1, max: 1}}],
  ]);
  for (const source of sources) {
    const semantic = semanticClass(source, {compilerVersion: 8}); assert.ok(semantic.semanticClass, source.name);
    const [modifier, modal] = semantic.implementation;
    assert.deepEqual(JSON.parse(JSON.stringify(modifier)), {kind: 'mechanic-entwine', ...expectations.get(source.name), contract: 'mechanic-entwine'});
    assert.equal(modal.kind, 'spell-modal-generic'); assert.equal(modal.modes.length, modifier.modeCount);
    assert.deepEqual(JSON.parse(JSON.stringify(modal.choose)), modifier.printedChoice);
    assert.ok(semantic.oracleContracts.includes('mechanic-entwine')); assert.ok(semantic.oracleContracts.includes('spell-modal-generic-effect'));
    assert.equal(JSON.stringify(M.DEFS[source.name].entwine), JSON.stringify(expectations.get(source.name)));
  }
  const invalid = [
    rawCard('Bad nonmodal Entwine', 'Draw a card.\nEntwine {1}'),
    rawCard('Bad creature Entwine', 'Choose one —\n• Draw a card.\n• You gain 1 life.\nEntwine {1}', {type_line: 'Creature — Wizard'}),
    rawCard('Bad period Entwine', 'Choose one —\n• Draw a card.\n• You gain 1 life.\nEntwine {1}.'),
    rawCard('Bad rider Entwine', 'Choose one —\n• Draw a card.\n• You gain 1 life.\nEntwine {1}, discard a card.'),
    rawCard('Bad discard Entwine', 'Choose one —\n• Draw a card.\n• You gain 1 life.\nEntwine—Discard a card.'),
    rawCard('Bad all-modes Entwine', 'Choose one or more —\n• Draw a card.\n• You gain 1 life.\nEntwine {1}'),
    rawCard('Bad mode Entwine', 'Choose one —\n• Exchange target permanent.\n• Draw a card.\nEntwine {1}'),
  ];
  for (const source of invalid) assert.equal(semanticClass(source, {compilerVersion: 8}).semanticClass, undefined, source.name);
});

test('v8 Entwine human: declining pays only the printed cost and announces one mode', async () => {
  const {game, a, decisions} = context('human', {entwine: 'no', mode: 0}); const host = put(game, a, fixture('Entwine decline host'));
  const source = put(game, a, 'V8 Entwine Order', 'hand'); fund(a); const before = totalMana(a);
  assert.equal(await game.castSpell(a, source, {from: 'hand'}), true); const spell = game.stack.at(-1);
  assert.equal(spell.castOpts.entwined, undefined); assert.equal(JSON.stringify(spell.mode), '[0]'); assert.equal(spell.targets.length, 1); assert.equal(spell.targets[0], host);
  assert.equal(before - totalMana(a), 2); assert.ok(decisions.some(row => row.query.aiHint?.kind === 'entwine' && row.answer === 'no'));
  assert.ok(decisions.some(row => row.query.aiHint?.kind === 'mode' && row.answer === '0'));
  await settle(game); assert.equal(host.tapped, true);
});

for (const role of ['human', 'ai']) test(`v8 Entwine ${role}: paying selects every mode, announces every target and resolves in printed order`, async () => {
  const {game, a, decisions} = context(role, {entwine: 'yes'}); const host = put(game, a, fixture('Entwine ordered host')); host.tapped = false;
  const source = put(game, a, 'V8 Entwine Order', 'hand'); fund(a); const before = totalMana(a);
  assert.equal(await game.castSpell(a, source, {from: 'hand'}), true); const spell = game.stack.at(-1);
  assert.equal(spell.castOpts.entwined, true); assert.equal(JSON.stringify(spell.mode), '[0,1]'); assert.equal(spell.targets.length, 2);
  assert.equal(spell.targets[0], host); assert.equal(spell.targets[1], host); assert.equal(before - totalMana(a), 3);
  const choice = decisions.find(row => row.query.aiHint?.kind === 'entwine'); assert.ok(choice); assert.equal(choice.answer, 'yes');
  assert.equal(decisions.some(row => row.query.aiHint?.kind === 'mode' || row.query.aiHint?.kind === 'modes'), false, 'Entwine itself supplies all mode choices');
  if (role === 'ai') assert.ok(a.controller instanceof M.AIController);
  await settle(game); assert.equal(host.tapped, false, 'tap resolves before untap regardless of UI choice order');
});

test('v8 Entwine cannot be offered when a printed mode lacks legal targets or the added mana is unavailable', async () => {
  const targets = context('human', {entwine: 'yes', mode: 0}); const artifact = put(targets.game, targets.b, fixture('Only artifact target', ['Artifact']));
  const split = put(targets.game, targets.a, 'V8 Entwine Split Targets', 'hand'); fund(targets.a);
  assert.equal(await targets.game.castSpell(targets.a, split, {from: 'hand'}), true); const splitSpell = targets.game.stack.at(-1);
  assert.equal(splitSpell.castOpts.entwined, undefined); assert.equal(JSON.stringify(splitSpell.mode), '[0]'); assert.equal(splitSpell.targets[0], artifact);
  assert.equal(targets.decisions.some(row => row.query.aiHint?.kind === 'entwine'), false); await settle(targets.game); assert.equal(artifact.zone, 'graveyard');

  const mana = context('human', {entwine: 'yes', mode: 0}); const card = put(mana.game, mana.a, 'V8 Entwine Value', 'hand');
  mana.a.pool.G = 1; mana.a.pool.C = 1; const beforeLife = mana.a.life, beforeLibrary = mana.a.library.length;
  assert.equal(await mana.game.castSpell(mana.a, card, {from: 'hand'}), true); const spell = mana.game.stack.at(-1);
  assert.equal(spell.castOpts.entwined, undefined); assert.equal(JSON.stringify(spell.mode), '[0]'); assert.equal(mana.decisions.some(row => row.query.aiHint?.kind === 'entwine'), false);
  await settle(mana.game); assert.equal(mana.a.library.length, beforeLibrary - 2); assert.equal(mana.a.life, beforeLife);
});

test('v8 Entwine sacrifice cost is chosen after targets and paid before the spell reaches the Stack', async () => {
  const {game, a, decisions} = context('human', {entwine: 'yes'}); fund(a);
  const lands = Array.from({length: 6}, (_, index) => put(game, a, fixture('Entwine land ' + index, ['Land'], {cost: null})));
  const source = put(game, a, 'V8 Entwine Lands', 'hand'); const life = a.life, library = a.library.length;
  assert.equal(await game.castSpell(a, source, {from: 'hand'}), true); const spell = game.stack.at(-1);
  assert.equal(spell.castOpts.entwined, true); assert.equal(JSON.stringify(spell.mode), '[0,1]');
  const paid = lands.filter(card => card.zone === 'graveyard'); assert.equal(paid.length, 2); assert.equal(spell.sacdN, 2);
  assert.ok(decisions.find(row => row.query.aiHint?.kind === 'entwine')?.answer === 'yes');
  assert.ok(decisions.some(row => row.query.aiHint?.kind === 'entwine' && row.query.type === 'chooseCards'));
  await settle(game); assert.equal(a.life, life + 2); assert.equal(a.library.length, library - 1);
});

test('v8 Entwine free cast still pays the additional cost and a spell copy keeps all modes without paying again', async () => {
  const {game, a} = context('human', {entwine: 'yes'}), source = put(game, a, 'V8 Entwine Value', 'hand'); fund(a); const before = totalMana(a);
  assert.equal(await game.castSpell(a, source, {from: 'hand', alt: {free: true}}), true); const original = game.stack.at(-1);
  assert.equal(original.castOpts.entwined, true); assert.equal(before - totalMana(a), 2, 'free replaces the base cost but not Entwine');
  const afterCast = totalMana(a), copy = await game.copySpell(original, a, {mayNewTargets: false});
  assert.equal(copy.castOpts.entwined, true); assert.equal(JSON.stringify(copy.mode), '[0,1]'); assert.equal(totalMana(a), afterCast);
  const life = a.life, library = a.library.length; await settle(game);
  assert.equal(a.life, life + 6); assert.equal(a.library.length, library - 4, 'both original and copy resolve both modes');
});

test('v8 Entwine supports Choose two/all four and rejects forged or invalid announcements without payment', async () => {
  const all = context('human', {entwine: 'yes'}), source = put(all.game, all.a, 'V8 Entwine Four', 'hand'); fund(all.a);
  assert.equal(await all.game.castSpell(all.a, source, {from: 'hand'}), true); assert.equal(JSON.stringify(all.game.stack.at(-1).mode), '[0,1,2,3]'); await settle(all.game);

  const forged = context('human'), card = put(forged.game, forged.a, 'V8 Entwine Value', 'hand'); fund(forged.a); const before = totalMana(forged.a);
  assert.equal(await forged.game.castSpell(forged.a, card, {from: 'hand', alt: {entwined: true}}), false);
  assert.equal(await forged.game.castSpell(forged.a, card, {from: 'hand', alt: {entwine: true}}), false);
  assert.equal(card.zone, 'hand'); assert.equal(totalMana(forged.a), before); assert.equal(forged.game.stack.length, 0);
});
