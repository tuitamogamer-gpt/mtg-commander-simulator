import test from 'node:test';
import assert from 'node:assert/strict';
import {createImportPlan, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const rawCard = (name, oracle_text, extra = {}) => ({
  name, oracle_text, type_line: extra.type_line || 'Enchantment Creature — Nymph',
  layout: 'normal', mana_cost: extra.mana_cost || '{1}{G}', power: extra.power || '2', toughness: extra.toughness || '2',
  oracle_id: 'bestow-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  id: 'bestow-print-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), games: ['paper'],
  legalities: {commander: 'legal'}, color_identity: ['G'],
});

const sources = [
  rawCard('V8 Bestow Dryad', 'Bestow {3}{G}\nFlying\nEnchanted creature gets +2/+2 and has flying.'),
  rawCard('V8 Bestow X', 'Bestow {X}{G}{G}\nTrample\nEnchanted creature gets +1/+1 and has trample.', {mana_cost: '{2}{G}', power: '3', toughness: '3'}),
  rawCard('V8 Bestow Commander', 'Bestow {3}{G}\nVigilance\nEnchanted creature gets +2/+2 and has vigilance.', {type_line: 'Legendary Enchantment Creature — Nymph'}),
];

const plan = createImportPlan({cards: sources, bulk: {updated_at: '2026-08-31T00:00:00Z'}, sequence: 9958, limit: sources.length, compilerVersion: 8});
assert.equal(plan.report.cards.length, sources.length);
const M = loadEngine();
M.registerOracleBatch(plan.report); M.initData(M.RAW_DATA);

const fixture = (name, extra = {}) => ({
  name, cost: extra.cost || '{1}{G}', super: extra.super || [], types: extra.types || ['Creature'], subtypes: extra.subtypes || ['Bear'],
  oracle: '', kws: extra.kws || [], power: extra.power || '2', toughness: extra.toughness || '20', statics: extra.statics || [],
  colorsOverride: extra.colorsOverride || ['G'], ...extra,
});

function put(game, player, definition, zone = 'battlefield') {
  const card = new M.CardInst(typeof definition === 'string' ? M.DEFS[definition] : definition, player);
  card.zone = zone; card.ctrl = player; card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
  game.recalc();
  return card;
}

function context(role = 'human') {
  const decisions = [];
  const human = {decide: async (game, query) => {
    if (query.type === 'priority') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return query.candidates.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseCards') return query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption') return query.options.find(option => option.key === 'yes')?.key ?? query.options[0]?.key;
    if (query.type === 'orderTriggers') return query.triggers;
    return null;
  }};
  const game = new M.Game({seed: 127203, paced: false});
  const a = game.addPlayer('Bestow A', {name: 'Bestow A'}, human, role === 'ai');
  const b = game.addPlayer('Bestow B', {name: 'Bestow B'}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (currentGame, query) => { const answer = await decide(currentGame, query); decisions.push({query, answer}); return answer; };
  game.turnPlayer = a; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  // Keep the real Stack object inspectable. Individual tests resolve it with
  // resolveTop, so this only suppresses the harness' automatic pass loop.
  game.priorityRound = async () => {};
  for (const player of [a, b]) for (let index = 0; index < 20; index++) put(game, player, 'Forest', 'library');
  return {game, a, b, decisions, role};
}

function fund(player, n = 30) {
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = n;
}

async function settle(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 60) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}

function bestowOption(game, player, card) {
  const rows = game.castableList(player).filter(row => row.card === card);
  assert.ok(rows.some(row => !row.alt), card.name + ': ordinary creature cast remains offered');
  const row = rows.find(candidate => candidate.alt?.bestow);
  assert.ok(row, card.name + ': exact Bestow action is offered');
  return row;
}

test('v8 Bestow grammar emits one exact contract and rejects malformed or wrong-type markers', () => {
  for (const source of sources) {
    const semantic = semanticClass(source, {compilerVersion: 8});
    assert.ok(semantic.semanticClass, source.name);
    const operation = semantic.implementation.find(row => row.kind === 'mechanic-bestow');
    assert.deepEqual(operation, {kind: 'mechanic-bestow', cost: source.oracle_text.match(/^Bestow ([^\n]+)/)[1], contract: 'mechanic-bestow'});
    assert.ok(semantic.oracleContracts.includes('mechanic-bestow'));
    const def = M.DEFS[source.name];
    assert.equal(def.bestowCost, operation.cost); assert.equal(def.bestowTarget.length, 1); assert.equal(def.bestowTarget[0].oracleBestow, true);
    assert.ok(def.altCosts.some(row => row.bestow && row.altCostStr === operation.cost));
  }
  const invalid = [
    rawCard('Bad creature Bestow', 'Bestow {3}{G}', {type_line: 'Creature — Nymph'}),
    rawCard('Bad enchantment Bestow', 'Bestow {3}{G}', {type_line: 'Enchantment'}),
    rawCard('Bad missing cost Bestow', 'Bestow'),
    rawCard('Bad rider Bestow', 'Bestow {3}{G}, sacrifice a creature.'),
    rawCard('Bad dash Bestow', 'Bestow—{R}, Collect evidence 6.'),
    rawCard('Bad unclosed Bestow', 'Bestow {3}{G'),
  ];
  for (const source of invalid) assert.equal(semanticClass(source, {compilerVersion: 8}).semanticClass, undefined, source.name);
});

for (const role of ['human', 'ai']) test(`v8 Bestow ${role}: normal and bestowed casts use real targeting, payment and attachment`, async () => {
  {
    const {game, a} = context(role), source = put(game, a, 'V8 Bestow Dryad', 'hand'); fund(a);
    const options = game.castableList(a).filter(row => row.card === source);
    assert.equal(options.filter(row => !row.alt).length, 1); assert.equal(options.filter(row => row.alt?.bestow).length, 0, 'Bestow is hidden without a legal creature target');
    assert.equal(await game.castSpell(a, source, {from: 'hand'}), true);
    const spell = game.stack.at(-1);
    assert.equal(source.zone, 'stack'); assert.equal(source.is('Creature'), true); assert.equal(source.is('Enchantment'), true); assert.equal(source.hasSub('Aura'), false);
    assert.equal(game.isCreatureSpell(spell), true); assert.equal(game.stackSpellManaValue(spell), 2);
    await settle(game);
    assert.equal(source.zone, 'battlefield'); assert.equal(source.is('Creature'), true); assert.equal(source.hasSub('Aura'), false); assert.equal(source.attachedTo, null);
  }
  {
    const ctx = context(role), {game, a, decisions} = ctx, host = put(game, a, fixture('V8 Bestow sole host'));
    const source = put(game, a, 'V8 Bestow Dryad', 'hand'); fund(a);
    const row = bestowOption(game, a, source), before = Object.values(a.pool).reduce((sum, n) => sum + n, 0);
    assert.equal(await game.castSpell(a, source, {from: row.from, alt: row.alt}), true);
    const spell = game.stack.at(-1);
    assert.equal(source.zone, 'stack'); assert.equal(source.is('Creature'), false); assert.equal(source.is('Enchantment'), true); assert.equal(source.hasSub('Aura'), true);
    assert.equal(game.isCreatureSpell(spell), false); assert.equal(game.stackSpellManaValue(spell), 2, 'alternative cost does not change printed mana value');
    assert.equal(spell.targets[0], host); assert.equal(before - Object.values(a.pool).reduce((sum, n) => sum + n, 0), 4, 'the exact alternative cost is paid');
    await settle(game);
    assert.equal(source.zone, 'battlefield'); assert.equal(source.is('Creature'), false); assert.equal(source.hasSub('Aura'), true); assert.equal(source.attachedTo, host.iid);
    assert.ok(host.attachments.includes(source.iid)); assert.equal(host.cur.power, 4); assert.equal(host.cur.toughness, 22); assert.equal(host.kw('flying'), true);
    assert.ok(decisions.some(row => row.query.type === 'chooseTargets' && row.answer[0] === host), 'the seat controller selected the physical host');
    if (role === 'ai') assert.ok(a.controller instanceof M.AIController, 'real local AI controller made the target decision');
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
  }
});

for (const role of ['human', 'ai']) test(`v8 Bestow ${role}: an illegal resolving target yields the ordinary creature spell`, async () => {
  const {game, a} = context(role), host = put(game, a, fixture('V8 Bestow doomed host'));
  const source = put(game, a, 'V8 Bestow Dryad', 'hand'); fund(a);
  const row = bestowOption(game, a, source);
  assert.equal(await game.castSpell(a, source, {from: row.from, alt: row.alt}), true);
  assert.equal(game.stack.at(-1).targets[0], host);
  await game.move(host, 'graveyard');
  await settle(game);
  assert.equal(source.zone, 'battlefield'); assert.equal(source.is('Creature'), true); assert.equal(source.is('Enchantment'), true);
  assert.equal(source.hasSub('Aura'), false); assert.equal(source.attachedTo, null); assert.equal(source.cur.power, 2); assert.equal(source.cur.toughness, 2); assert.equal(source.kw('flying'), true);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
});

test('v8 Bestow ceases before Aura SBA when the host leaves or gains protection', async () => {
  const first = context(), host = put(first.game, first.a, fixture('V8 Bestow departing host'));
  const source = put(first.game, first.a, 'V8 Bestow Dryad', 'hand'); fund(first.a);
  const row = bestowOption(first.game, first.a, source); assert.equal(await first.game.castSpell(first.a, source, {from: row.from, alt: row.alt}), true); await settle(first.game);
  await first.game.move(host, 'graveyard'); await settle(first.game);
  assert.equal(source.zone, 'battlefield'); assert.equal(source.is('Creature'), true); assert.equal(source.hasSub('Aura'), false); assert.equal(source.attachedTo, null);

  const second = context();
  const protectedHost = put(second.game, second.a, fixture('V8 Bestow protected host', {statics: [{apply: (game, self) => {
    if (self.meta.protectionOn) self.cur.protectionFrom.push((g, candidate) => candidate.is('Enchantment'));
  }}]}));
  const aura = put(second.game, second.a, 'V8 Bestow Dryad', 'hand'); fund(second.a);
  const protectedRow = bestowOption(second.game, second.a, aura); assert.equal(await second.game.castSpell(second.a, aura, {from: protectedRow.from, alt: protectedRow.alt}), true); await settle(second.game);
  protectedHost.meta.protectionOn = true; second.game.recalc(); await second.game.checkSBA(); await settle(second.game);
  assert.equal(aura.zone, 'battlefield'); assert.equal(aura.is('Creature'), true); assert.equal(aura.hasSub('Aura'), false); assert.equal(aura.attachedTo, null);
  assert.equal(protectedHost.attachments.includes(aura.iid), false); assert.equal(protectedHost.cur.power, 2); assert.equal(protectedHost.kw('flying'), false);
});

test('v8 Bestow spell copies stay bestowed while permanent copies use printed creature characteristics', async () => {
  const {game, a} = context(), host = put(game, a, fixture('V8 Bestow copy host'));
  const source = put(game, a, 'V8 Bestow Dryad', 'hand'); fund(a);
  const row = bestowOption(game, a, source); assert.equal(await game.castSpell(a, source, {from: row.from, alt: row.alt}), true);
  const original = game.stack.at(-1), spellCopy = await game.copySpell(original, a, {mayNewTargets: false});
  assert.equal(spellCopy.castOpts.bestow, true); assert.equal(game.stackSpellManaValue(spellCopy), 2); assert.equal(spellCopy.targets.length, 1); assert.equal(spellCopy.targets[0], host);
  await game.resolveTop(); await game.flushTriggers();
  const copiedAura = game.bf().find(card => card.isToken && card.name === source.name);
  assert.ok(copiedAura); assert.equal(copiedAura.is('Creature'), false); assert.equal(copiedAura.hasSub('Aura'), true); assert.equal(copiedAura.attachedTo, host.iid);
  await settle(game);
  assert.equal(source.zone, 'battlefield'); assert.equal(source.hasSub('Aura'), true); assert.equal(host.attachments.length, 2);

  const [permanentCopy] = await game.copyPermanentToken(source, a); await settle(game);
  assert.equal(permanentCopy.isToken, true); assert.equal(permanentCopy.is('Creature'), true); assert.equal(permanentCopy.hasSub('Aura'), false); assert.equal(permanentCopy.attachedTo, null);
  await game.move(host, 'graveyard'); await settle(game);
  assert.equal(source.zone, 'battlefield'); assert.equal(source.is('Creature'), true); assert.equal(copiedAura.zone, 'battlefield'); assert.equal(copiedAura.is('Creature'), true);
});

test('v8 Bestow preserves commander tax, X payment, zone reset and permission type checks', async () => {
  const commanderCtx = context(); put(commanderCtx.game, commanderCtx.a, fixture('V8 Bestow commander host'));
  const commander = put(commanderCtx.game, commanderCtx.a, 'V8 Bestow Commander', 'command');
  commander.commander = true; commander.cmdCasts = 1; fund(commanderCtx.a);
  const commanderAlt = bestowOption(commanderCtx.game, commanderCtx.a, commander).alt;
  const commanderCost = commanderCtx.game.spellCost(commanderCtx.a, commander, commanderAlt);
  assert.equal(commanderCost.generic, 5); assert.equal(Array.from(commanderCost.pips.flat()).join(','), 'G');

  const xCtx = context(), host = put(xCtx.game, xCtx.a, fixture('V8 Bestow X host'));
  const xCard = put(xCtx.game, xCtx.a, 'V8 Bestow X', 'hand'); fund(xCtx.a);
  const xRow = bestowOption(xCtx.game, xCtx.a, xCard);
  assert.equal(await xCtx.game.castSpell(xCtx.a, xCard, {from: xRow.from, alt: xRow.alt, xVal: 3}), true);
  const xSpell = xCtx.game.stack.at(-1); assert.equal(xSpell.x, 3); assert.equal(xCtx.game.stackSpellManaValue(xSpell), 3, 'printed mana cost supplies mana value, not the Bestow X cost');
  await settle(xCtx.game); assert.equal(xCard.attachedTo, host.iid);
  await xCtx.game.move(xCard, 'hand'); assert.equal(xCard.meta.oracleBestowed, undefined); assert.equal(xCard.hasSub('Aura'), false); assert.equal(xCard.is('Creature'), true);
  fund(xCtx.a); assert.equal(await xCtx.game.castSpell(xCtx.a, xCard, {from: 'hand'}), true); await settle(xCtx.game); assert.equal(xCard.is('Creature'), true); assert.equal(xCard.attachedTo, null);

  const permission = context(), top = put(permission.game, permission.a, 'V8 Bestow Dryad', 'library');
  put(permission.game, permission.a, fixture('V8 creature top permission', {types: ['Enchantment'], playTop: (game, source, candidate) => candidate.is('Creature')}));
  fund(permission.a);
  const topRows = permission.game.castableList(permission.a).filter(option => option.card === top);
  assert.ok(topRows.some(option => !option.alt?.bestow), 'printed creature can use the creature-only permission');
  assert.equal(topRows.some(option => option.alt?.bestow), false, 'Bestow cast view cannot use a creature-only permission');

  const forged = context(), forgedHost = put(forged.game, forged.a, fixture('V8 Bestow forged host'));
  const forgedCard = put(forged.game, forged.a, 'V8 Bestow Dryad', 'hand'); fund(forged.a); const pool = {...forged.a.pool};
  assert.equal(await forged.game.castSpell(forged.a, forgedCard, {from: 'hand', alt: {bestow: true, free: true, altCostStr: '{3}{G}'}}), false);
  assert.equal(await forged.game.castSpell(forged.a, forgedCard, {from: 'hand', alt: {bestow: true, altCostStr: '{2}{G}'}}), false);
  assert.equal(forgedCard.zone, 'hand'); assert.equal(JSON.stringify(forged.a.pool), JSON.stringify(pool)); assert.equal(forgedHost.zone, 'battlefield');
});

for (const role of ['human', 'ai']) test(`v8 Bestow ${role}: copied Aura spells retain their announced attachment without token-creation replacements`, async () => {
  const {game, a} = context(role);
  for (const name of ['Chatterfang, Squirrel General', 'Parallel Lives']) {
    const source = put(game, a, name, 'hand'); fund(a);
    assert.equal(await game.castSpell(a, source, {from: 'hand'}), true); await settle(game);
  }
  const source = put(game, a, 'V8 Bestow Dryad', 'hand'); fund(a);
  const row = bestowOption(game, a, source), count = a.turnState.tokensCreated;
  assert.equal(await game.castSpell(a, source, {from: row.from, alt: row.alt}), true);
  const original = game.stack.at(-1), host = original.targets[0];
  await game.copySpell(original, a, {mayNewTargets: false});
  await settle(game);
  const copies = game.bf().filter(card => card.isToken);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].name, source.name); assert.equal(copies[0].hasSub('Aura'), true);
  assert.equal(copies[0].is('Creature'), false); assert.equal(copies[0].attachedTo, host.iid);
  assert.equal(a.turnState.tokensCreated, count);
});

test('an ordinary Aura permanent copy chooses a legal attachment when no attachment was prescribed', async () => {
  const {game, a} = context(), host = put(game, a, fixture('Untargeted Aura copy host'));
  const aura = put(game, a, 'Rancor', 'hand'); fund(a);
  assert.equal(await game.castSpell(a, aura, {from: 'hand'}), true); await settle(game);
  assert.equal(aura.attachedTo, host.iid);
  const [copy] = await game.copyPermanentToken(aura, a); await settle(game);
  assert.ok(copy); assert.equal(copy.isToken, true); assert.equal(copy.attachedTo, host.iid);
  assert.equal(host.power, 6, 'both real Rancor Auras grant their printed bonus');
});
