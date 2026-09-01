import test from 'node:test';
import assert from 'node:assert/strict';
import {createImportPlan, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {faceProofEntry, withFaceProof, installFaceProof, selectFixtureFace} from './helpers/oracle-v8-face-proof.mjs';

const M = loadEngine();
const face = (name, type_line, mana_cost, oracle_text, extra = {}) => ({name, type_line, mana_cost, oracle_text, ...extra});
const definitions = [
  ['Study', face('V8 Face Study', 'Sorcery', '{1}{U}', 'Draw two cards.'), face('V8 Face Shore', 'Land', '', 'This land enters tapped.\n{T}: Add {U}.')],
  ['Creature', face('V8 Face Student', 'Creature — Human Wizard', '{1}{U}', 'Prowess', {power: '2', toughness: '3'}), face('V8 Face Mentor', 'Creature — Bird Wizard', '{3}{W}', 'Flying\nWhen this creature enters, you gain 2 life.', {power: '4', toughness: '5'})],
  ['Spells', face('V8 Face Insight', 'Sorcery', '{2}{U}', 'Draw two cards.'), face('V8 Face Spark', 'Instant', '{R}', 'V8 Face Spark deals 2 damage to target creature.')],
  ['Land', face('V8 Face Ridge', 'Land', '', '{T}: Add {R}.'), face('V8 Face Grove', 'Land', '', '{T}: Add {G}.')],
  ['Commander', face('V8 Face Leader', 'Legendary Creature — Elf', '{G}', 'When this creature enters, you gain 1 life.', {power: '2', toughness: '3'}), face('V8 Face Book', 'Legendary Artifact', '{1}{U}', '{T}: Draw a card.')],
];
const sources = definitions.map(([label, front, back], index) => ({name: front.name + ' // ' + back.name,
  layout: 'modal_dfc', card_faces: [front, back], type_line: front.type_line + ' // ' + back.type_line,
  oracle_id: 'v8-face-' + index, id: 'v8-face-print-' + index, games: ['paper'],
  legalities: {commander: 'legal'}, color_identity: [...new Set((front.mana_cost + back.mana_cost + front.oracle_text + back.oracle_text).match(/[WUBRG](?=\})/g) || [])], label}));
const normalSources = [
  face('V8 Face Token Maker', 'Sorcery', '{2}{U}', "Create a token that's a copy of target creature you control."),
  face('V8 Face Clone', 'Creature — Shapeshifter', '{3}{U}', 'You may have this creature enter as a copy of any creature on the battlefield.', {power: '0', toughness: '0'}),
  face('V8 Face Temporary Copy', 'Instant', '{U}', 'Target creature you control becomes a copy of another target creature until end of turn.'),
].map((card, index) => ({...card, layout: 'normal', oracle_id: 'v8-face-normal-' + index, id: 'v8-face-normal-print-' + index,
  games: ['paper'], legalities: {commander: 'legal'}, color_identity: ['U']}));
const plan = createImportPlan({cards: [...sources, ...normalSources], bulk: {updated_at: '2026-08-31T00:00:00Z'}, sequence: 9961, limit: sources.length + normalSources.length, compilerVersion: 8});
M.registerOracleBatch(plan.report); M.initData(M.RAW_DATA);
const names = Object.fromEntries(sources.map(card => [card.label, card.name]));

function put(game, player, name, zone = 'hand') {
  const card = new M.CardInst(typeof name === 'string' ? M.DEFS[names[name] || name] : name, player);
  assert.ok(card.def, String(name)); card.zone = zone; card.ctrl = player; card.sick = false;
  if (zone === 'battlefield') {game.battlefield.push(card); game.recalc();} else player[zone].push(card);
  return card;
}
function creature(name, extra = {}) {
  return {name, cost: '{2}{G}', types: ['Creature'], subtypes: ['Bear'], super: [], kws: [], power: '3', toughness: '6', ...extra};
}
function context(role = 'human') {
  const trace = [], state = {};
  const human = {decide: async (game, query) => {
    if (query.type === 'priority' || query.type === 'main') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return state.targets?.(query) ?? query.candidates.slice(0, query.min ?? query.max ?? 1);
    if (query.type === 'chooseCards') return state.cards?.(query) ?? query.from.slice(0, query.min ?? query.max ?? 1);
    if (query.type === 'chooseOption') return state.option?.(query) ?? query.options.find(option => ['yes', 'stay'].includes(option.key))?.key ?? query.options[0]?.key;
    if (query.type === 'chooseX') return query.min || 0;
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'scry') return {top: query.cards, bottom: []};
    return [];
  }};
  const game = new M.Game({seed: 127712, paced: false});
  const a = game.addPlayer('A', {name: 'A'}, {...human}, role === 'ai'), b = game.addPlayer('B', {name: 'B'}, {...human}, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => {const answer = await decide(g, query); trace.push({query, answer}); return answer;};
  game.turnPlayer = a; game.turnNo = 5; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {}; game.revealToHuman = async () => {}; game.reviewGlobalEffectWithHuman = async () => {};
  for (const player of [a, b]) for (let n = 0; n < 20; n++) put(game, player, 'Forest', 'library');
  return {game, a, b, state, trace};
}
async function settle(game) {
  for (let n = 0; n < 100 && (game.stack.length || game.pendingTriggers.length); n++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}
function mana(player, amounts) {for (const key of Object.keys(player.pool)) player.pool[key] = 0; Object.assign(player.pool, amounts);}
function pool(player) {return Object.values(player.pool).reduce((sum, n) => sum + n, 0);}
async function castFace(ctx, card, key, amounts, options = {}) {
  mana(ctx.a, amounts);
  const before = pool(ctx.a), cost = ctx.game.spellCost(ctx.a, card, {oracleFace: key, from: card.zone, ...options});
  const total = cost.generic + cost.pips.length;
  assert.equal(await ctx.game.castSpell(ctx.a, card, {from: card.zone, alt: {oracleFace: key, ...options}}), true);
  assert.equal(pool(ctx.a), before - total, 'the selected face pays its actual mana cost');
  return ctx.game.stack.at(-1);
}

test('v8 faces preserve the combined catalog identity while compiling both complete faces independently', () => {
  for (const source of sources) {
    const entry = plan.report.cards.find(card => card.raw.name === source.name), def = M.DEFS[source.name];
    assert.equal(entry.raw.name, source.name); assert.equal(entry.raw._layout, 'modal_dfc');
    assert.equal(def.name, source.card_faces[0].name); assert.equal(def.oracleFace, 'front');
    assert.equal(def.oracleFaces.faces.length, 2);
    for (const printed of source.card_faces) assert.equal(M.resolveDeckCardName(printed.name.toLowerCase()), source.name);
    assert.equal(M.resolveDeckCardName(source.name), source.name);
  }
  const source = structuredClone(sources[0]); source.card_faces[1].oracle_text += '\nIf a potato wins, invent a new game.';
  assert.equal(semanticClass(source).semanticClass, undefined, 'an unimplemented back face cannot be discarded');
  source.card_faces.pop(); assert.equal(semanticClass(source).semanticClass, undefined);
  assert.equal(semanticClass({...sources[0], layout: 'transform'}).semanticClass, undefined, 'transform is not implicitly admitted by the MDFC implementation');
  assert.equal(M.DEFS[names.Creature].triggers.filter(trigger => trigger.desc === 'Prowess').length, 1, 'keyword loader adds the front Prowess once');
});

test('v8 face bulk proof adapter uses one canonical physical card and the selected actual face', async () => {
  const entry = plan.report.cards.find(card => card.raw.name === names.Study), descriptor = entry.implementation[0];
  for (const face of descriptor.faces) {
    const proofEntry = faceProofEntry(entry, face);
    await withFaceProof(proofEntry, async () => {
      const ctx = context('human'); installFaceProof(M, ctx.game);
      const card = put(ctx.game, ctx.a, 'Study'); assert.equal(card.oracleFace, 'front');
      if (face.raw.types.includes('Land')) assert.equal(await ctx.game.playLand(ctx.a, card), true);
      else {mana(ctx.a, {U: 1, C: 1}); assert.equal(await ctx.game.castSpell(ctx.a, card, {from: 'hand'}), true);}
      assert.equal(card.oracleFace, face.key); assert.equal(card.name, face.raw.name); assert.equal(card.oracleFaces.canonicalName, entry.raw.name);
      if (card.zone === 'stack') await settle(ctx.game);
      if (card.zone === 'battlefield') {M.OracleV8Faces.setFace(card, 'front'); selectFixtureFace(M, ctx.game, card); assert.equal(card.oracleFace, face.key);}
    });
  }
});

for (const role of ['human', 'ai']) {
  test(`v8 faces ${role}: cast a printed front spell, resolve its effect, and forbid casting its land back`, async () => {
    const ctx = context(role), {game, a} = ctx, card = put(game, a, 'Study');
    mana(a, {U: 1, C: 1}); const legal = game.castableList(a).filter(row => row.card === card);
    assert.deepEqual(Array.from(legal, row => row.alt.oracleFace), ['front']);
    assert.equal(await game.castSpell(a, card, {alt: {oracleFace: 'back'}, from: 'hand'}), false);
    assert.equal(card.zone, 'hand'); assert.equal(pool(a), 2); const hand = a.hand.length;
    const so = await castFace(ctx, card, 'front', {U: 1, C: 1});
    assert.equal(so.name, 'V8 Face Study'); assert.equal(card.zone, 'stack'); assert.equal(game.stackSpellManaValue(so), 2);
    await settle(game); assert.equal(card.zone, 'graveyard'); assert.equal(a.hand.length, hand + 1);
    assert.equal(card.oracleFace, 'front'); assert.equal(card.name, 'V8 Face Study');
  });
  test(`v8 faces ${role}: land face is a land drop with its own entry and mana abilities`, async () => {
    const ctx = context(role), {game, a} = ctx, card = put(game, a, 'Study');
    assert.ok(game.playableLands(a).includes(card)); assert.equal(card.is('Land'), false, 'hand characteristics remain the front');
    assert.equal(await game.playLand(a, card), true); assert.equal(a.landsPlayed, 1); assert.equal(game.stack.length, 0);
    assert.equal(card.name, 'V8 Face Shore'); assert.equal(card.oracleFace, 'back'); assert.equal(card.is('Land'), true);
    assert.equal(card.mv, 0); assert.equal(card.tapped, true); assert.equal(card.def.resolve, undefined);
    await game.untap(card); const entry = game.manaSources(a).find(row => row.card === card);
    assert.ok(entry, 'land back has its printed mana ability');
    assert.equal(await game.activateManaSource(a, entry, entry.produce[0]), true); assert.equal(a.pool.U, 1);
    const extra = put(game, a, 'Land'); assert.equal(await game.playLand(a, extra, {oracleFace: 'back'}), false); assert.equal(extra.zone, 'hand');
  });
  test(`v8 faces ${role}: selected back spell has independent timing, targets, cost, color and Stack identity`, async () => {
    const ctx = context(role), {game, a, b, state} = ctx, card = put(game, a, 'Spells');
    const target = put(game, b, creature('Spark target'), 'battlefield'); state.targets = () => [target];
    game.turnPlayer = b; game.phase = 'upkeep'; mana(a, {R: 1, U: 1, C: 2});
    assert.deepEqual(Array.from(game.castableList(a).filter(row => row.card === card), row => row.alt.oracleFace), ['back']);
    assert.equal(await game.castSpell(a, card, {alt: {oracleFace: 'front'}, from: 'hand'}), false); assert.equal(pool(a), 4);
    const seen = []; const decide = a.controller.decide.bind(a.controller);
    a.controller.decide = async (g, q) => {if (q.type === 'chooseTargets') seen.push([card.name, card.zone, card.oracleFace]); return decide(g, q);};
    const so = await castFace(ctx, card, 'back', {R: 1});
    assert.deepEqual(seen, [['V8 Face Insight', 'hand', 'front']], 'no asynchronous temporary face mutation in hand');
    assert.equal(so.card, card); assert.equal(so.name, 'V8 Face Spark'); assert.equal(card.is('Instant'), true);
    assert.equal(card.mv, 1); assert.deepEqual(Array.from(card.colors), ['R']); assert.equal(game.stackSpellManaValue(so), 1);
    await settle(game); assert.equal(target.damage, 2); assert.equal(card.zone, 'graveyard'); assert.equal(card.name, 'V8 Face Insight'); assert.equal(card.mv, 3);
  });
  test(`v8 faces ${role}: back permanent keeps its complete abilities and moves with front reset and back LKI`, async () => {
    const ctx = context(role), {game, a} = ctx, card = put(game, a, 'Creature');
    const version = card.zoneVersion; await castFace(ctx, card, 'back', {W: 1, C: 3}); await settle(game);
    assert.equal(card.zone, 'battlefield'); assert.equal(card.name, 'V8 Face Mentor'); assert.equal(card.power, 4); assert.equal(card.kw('flying'), true); assert.equal(card.kw('prowess'), false);
    assert.equal(card.mv, 4); assert.equal(a.life, 42); assert.ok(card.zoneVersion > version);
    const snapshot = game.snapshot(card); await game.move(card, 'graveyard');
    assert.equal(snapshot.name, 'V8 Face Mentor'); assert.equal(snapshot.oracleFace, 'back'); assert.equal(snapshot.oracleFaces, card.oracleFaces);
    assert.equal(card.name, 'V8 Face Student'); assert.equal(card.oracleFace, 'front'); assert.equal(card.mv, 2);
    await game.move(card, 'battlefield', {ctrl: a}); await settle(game);
    assert.equal(card.name, 'V8 Face Student'); assert.equal(card.kw('prowess'), true); assert.equal(card.power, 2); assert.equal(a.life, 42);
  });
  test(`v8 faces ${role}: direct nonstack entry cannot put a sorcery front onto the battlefield`, async () => {
    const {game, a} = context(role), card = put(game, a, 'Study', 'graveyard');
    await game.move(card, 'battlefield', {ctrl: a});
    assert.equal(card.zone, 'graveyard'); assert.ok(a.graveyard.includes(card)); assert.equal(game.bf().includes(card), false);
    assert.equal(card.oracleFace, 'front');
  });
  test(`v8 faces ${role}: real token-copy resolution copies both faces but an existing Clone remains single-faced`, async () => {
    const ctx = context(role), {game, a, state} = ctx, original = put(game, a, 'Creature');
    await castFace(ctx, original, 'back', {W: 1, C: 3}); await settle(game);
    const maker = put(game, a, 'V8 Face Token Maker'); state.targets = query => query.candidates.includes(original) ? [original] : query.candidates.slice(0, 1);
    mana(a, {U: 1, C: 2}); assert.equal(await game.castSpell(a, maker, {from: 'hand'}), true); await settle(game);
    const token = game.bf().find(card => card.isToken && card.name === original.name);
    assert.ok(token); assert.equal(token.oracleFace, 'back'); assert.equal(token.oracleFaces.faces.length, 2);
    assert.equal(token.oracleFaces.faces[0].def.name, 'V8 Face Student'); assert.equal(token.oracleFaces.faces[1].def.name, 'V8 Face Mentor'); assert.equal(token.mv, 4);
    const clone = put(game, a, 'V8 Face Clone'); state.cards = query => query.from.includes(original) ? [original] : query.from.slice(0, 1);
    mana(a, {U: 1, C: 3}); assert.equal(await game.castSpell(a, clone, {from: 'hand'}), true); await settle(game);
    assert.equal(clone.name, 'V8 Face Mentor'); assert.equal(clone.oracleFaces, null); assert.equal(clone.oracleFace, null);
    const [cloneToken] = await game.copyPermanentToken(clone, a); assert.equal(cloneToken.oracleFaces, null); assert.equal(cloneToken.name, 'V8 Face Mentor');
    await game.move(clone, 'hand'); assert.equal(clone.name, 'V8 Face Clone'); assert.equal(clone.oracleFaces, null);
  });
  test(`v8 faces ${role}: a copied back permanent spell resolves as that face after the original was countered`, async () => {
    const ctx = context(role), {game, a} = ctx, card = put(game, a, 'Creature');
    const so = await castFace(ctx, card, 'back', {W: 1, C: 3}), copy = await game.copySpell(so, a, {mayNewTargets: false});
    assert.equal(copy.card, card); assert.equal(game.stackSpellManaValue(copy), 4);
    await game.counterStackObject(so); assert.equal(card.zone, 'graveyard'); assert.equal(card.name, 'V8 Face Student');
    assert.ok(game.stack.includes(copy)); assert.equal(game.stackSpellManaValue(copy), 4);
    await settle(game); const token = game.bf().find(row => row.isToken);
    assert.ok(token); assert.equal(token.name, 'V8 Face Mentor'); assert.equal(token.oracleFace, 'back'); assert.equal(token.oracleFaces.faces[0].def.name, 'V8 Face Student');
    assert.equal(token.kw('flying'), true); assert.equal(a.life, 42); assert.equal(card.zone, 'graveyard');
  });
  test(`v8 faces ${role}: command tax follows the physical commander across both spell faces`, async () => {
    const ctx = context(role), {game, a} = ctx, card = put(game, a, 'Commander', 'command');
    card.commander = true; a.commanders.push(card);
    await castFace(ctx, card, 'back', {U: 1, C: 1}); await settle(game);
    assert.equal(card.name, 'V8 Face Book'); assert.equal(card.cmdCasts, 1); assert.equal(card.is('Artifact'), true);
    const hand = a.hand.length, entry = game.activatableList(a).find(row => row.card === card && row.ability);
    assert.ok(entry); assert.equal(await game.activateAbility(a, entry), true); await settle(game); assert.equal(a.hand.length, hand + 1);
    await game.move(card, 'command'); assert.equal(card.name, 'V8 Face Leader');
    await castFace(ctx, card, 'front', {G: 1, C: 2}); await settle(game);
    assert.equal(card.cmdCasts, 2); assert.equal(a.life, 41); assert.equal(card.name, 'V8 Face Leader');
    await game.move(card, 'command'); mana(a, {U: 1, C: 4});
    assert.equal(game.castableList(a).some(row => row.card === card && row.alt.oracleFace === 'back'), false, 'second recast needs the back cost plus four tax');
    assert.equal(await game.castSpell(a, card, {from: 'command', alt: {oracleFace: 'back'}}), false); assert.equal(pool(a), 5);
  });
  test(`v8 faces ${role}: graveyard permissions test the chosen face and consume only its permitted permanent type`, async () => {
    const ctx = context(role), {game, a} = ctx, land = put(game, a, 'Study', 'graveyard'), commander = put(game, a, 'Commander', 'graveyard');
    mana(a, {U: 2, G: 1, C: 3});
    assert.equal(game.playableLands(a).includes(land), false); assert.equal(game.castableList(a).some(row => row.card === commander), false);
    assert.equal(await game.castSpell(a, commander, {from: 'graveyard', alt: {oracleFace: 'back'}}), false); assert.equal(commander.zone, 'graveyard');
    const permission = put(game, a, creature('Permanent permission', {grantsGraveyardPermanentTypes: true}), 'battlefield');
    assert.ok(game.playableLands(a).includes(land)); assert.equal(await game.playLand(a, land), true); assert.equal(land.name, 'V8 Face Shore');
    assert.ok(a.turnState.gravePermanentTypesUsed.includes('Land'));
    const option = game.castableList(a).find(row => row.card === commander && row.alt.oracleFace === 'back'); assert.ok(option);
    await castFace(ctx, commander, 'back', {U: 1, C: 1}, option.alt); await settle(game);
    assert.ok(a.turnState.gravePermanentTypesUsed.includes('Artifact')); assert.equal(a.turnState.gravePermanentTypesUsed.includes('Creature'), false);
    await game.move(commander, 'graveyard'); mana(a, {G: 1, U: 1, C: 1});
    assert.deepEqual(Array.from(game.castableList(a).filter(row => row.card === commander), row => row.alt.oracleFace), ['front']);
    assert.equal(await game.castSpell(a, commander, {from: 'graveyard', alt: {oracleFace: 'back', muldrotha: true}}), false);
    await game.move(permission, 'hand'); assert.equal(game.castableList(a).some(row => row.card === commander), false);
  });
  test(`v8 faces ${role}: spell-only exile permission excludes a land back and expires for stale actions`, async () => {
    const ctx = context(role), {game, a, b} = ctx, card = put(game, b, 'Study', 'exile');
    mana(a, {U: 1, C: 1}); assert.equal(game.playableLands(a).includes(card), false); assert.equal(game.castableList(a).some(row => row.card === card), false);
    assert.equal(await game.castSpell(a, card, {from: 'exile', free: true, alt: {oracleFace: 'front'}}), false, 'free does not grant exile permission');
    Object.assign(card.meta, {playableBy: a, playableUntil: game.turnNo, spellsOnly: true});
    const row = game.castableList(a).find(row => row.card === card); assert.ok(row); assert.equal(row.alt.oracleFace, 'front');
    assert.equal(game.playableLands(a).includes(card), false); assert.equal(await game.playLand(a, card, {oracleFace: 'back'}), false);
    card.meta.playableUntil = game.turnNo - 1;
    assert.equal(await game.castSpell(a, card, {from: row.from, alt: row.alt}), false); assert.equal(card.zone, 'exile'); assert.equal(pool(a), 2);
    card.meta.playableUntil = game.turnNo; delete card.meta.spellsOnly;
    assert.equal(await game.playLand(a, card, {oracleFace: 'back'}), true); assert.equal(card.ctrl, a); assert.equal(card.owner, b); assert.equal(card.name, 'V8 Face Shore');
  });
  test(`v8 faces ${role}: top-library permission checks the proposed face without revealing a deeper card`, async () => {
    const ctx = context(role), {game, a} = ctx, lower = put(game, a, 'Study', 'library'), top = put(game, a, 'Study', 'library');
    const permission = put(game, a, {name: 'Top lands permission', cost: '{2}{G}', types: ['Enchantment'], subtypes: [], super: [], kws: [], playTop: (g, src, candidate) => candidate.is('Land')}, 'battlefield');
    assert.ok(game.playableLands(a).includes(top)); assert.equal(game.playableLands(a).includes(lower), false);
    mana(a, {U: 1, C: 1}); assert.equal(game.castableList(a).some(row => row.card === top), false);
    assert.equal(await game.playLand(a, lower), false); assert.equal(lower.zone, 'library');
    assert.equal(await game.playLand(a, top), true); assert.equal(top.name, 'V8 Face Shore');
    await game.move(permission, 'hand'); a.landsPlayed = 0; assert.equal(game.playableLands(a).includes(lower), false);
  });
  test(`v8 faces ${role}: copying a back instant spell preserves its damage effect after original resolution`, async () => {
    const ctx = context(role), {game, a, b, state} = ctx, card = put(game, a, 'Spells'), target = put(game, b, creature('Durable target'), 'battlefield');
    state.targets = () => [target]; const so = await castFace(ctx, card, 'back', {R: 1});
    const controllers = [], damageCreature = game.damageCreature;
    game.damageCreature = async function(source, recipient, amount, options) {controllers.push(source.ctrl); return damageCreature.call(this, source, recipient, amount, options);};
    const copy = await game.copySpell(so, b, {mayNewTargets: false});
    game.stack.splice(game.stack.indexOf(so), 1); game.stack.push(so);
    await game.resolveTop(); assert.equal(card.zone, 'graveyard'); assert.equal(card.name, 'V8 Face Insight'); assert.equal(target.damage, 2);
    assert.equal(game.stackSpellManaValue(copy), 1); await settle(game); assert.equal(target.damage, 4); assert.deepEqual(controllers, [a, b], 'spell copy is controlled by its new controller');
    assert.equal(a.hand.length, 0, 'copy cannot run front draw effect');
  });
  test(`v8 faces ${role}: main decision and two-land face choice use actual legal engine actions`, async () => {
    const ctx = context(role), {game, a, state, trace} = ctx, land = put(game, a, 'Land');
    state.option = query => query.aiHint?.kind === 'oracleLandFace' ? 'back' : undefined;
    const decide = a.controller.decide.bind(a.controller);
    if (role === 'human') a.controller.decide = (g, query) => query.type === 'main' ? {kind: 'land', card: query.lands[0]} : decide(g, query);
    const action = await a.controller.decide(game, {type: 'main', player: a, phase: game.phase, casts: game.castableList(a), acts: game.activatableList(a), lands: game.playableLands(a)});
    assert.equal(action.kind, 'land'); assert.equal(action.card, land); assert.equal(await game.performAction(a, action), true);
    assert.ok(['front', 'back'].includes(land.oracleFace)); assert.equal(land.name, land.oracleFace === 'front' ? 'V8 Face Ridge' : 'V8 Face Grove');
    const choice = trace.find(row => row.query.aiHint?.kind === 'oracleLandFace'); assert.ok(choice); assert.equal(choice.answer, land.oracleFace);
    const source = game.manaSources(a).find(row => row.card === land); assert.ok(source);
    assert.equal(source.produce[0][land.oracleFace === 'front' ? 'R' : 'G'], 1);
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
    const savedFace = M.recordSaveDecision(choice.query, a, choice.answer);
    const replay = context(role), replayLand = put(replay.game, replay.a, 'Land');
    const replayDecide = replay.a.controller.decide.bind(replay.a.controller);
    replay.a.controller.decide = (g, query) => query.aiHint?.kind === 'oracleLandFace'
      ? M.restoreSaveDecision(query, replay.a, JSON.parse(JSON.stringify(savedFace))) : replayDecide(g, query);
    assert.equal(await replay.game.playLand(replay.a, replayLand), true);
    assert.equal(replayLand.name, land.name); assert.equal(replayLand.oracleFace, land.oracleFace, 'portable save choice reproduces the same land face');
  });
  test(`v8 faces ${role}: actual main action casts an affordable back face and portable replay retains it`, async () => {
    const ctx = context(role), {game, a, b, state} = ctx, card = put(game, a, 'Spells');
    const target = put(game, b, creature('Face action target', {power: '5', toughness: '2'}), 'battlefield');
    state.targets = () => [target]; mana(a, {R: 1});
    const query = {type: 'main', player: a, phase: game.phase, casts: game.castableList(a), acts: game.activatableList(a), lands: []};
    const action = role === 'ai' ? await a.controller.decide(game, query) : {kind: 'cast', ...query.casts[0]};
    assert.equal(action.kind, 'cast'); assert.equal(action.card, card); assert.equal(action.alt.oracleFace, 'back');
    const saved = JSON.parse(JSON.stringify(M.recordSaveDecision(query, a, action)));
    assert.equal(card.oracleFace, 'front'); assert.equal(pool(a), 1, 'local AI search cannot mutate the live face or mana');
    assert.equal(await game.performAction(a, action), true); await settle(game); assert.equal(target.zone, 'graveyard'); assert.equal(pool(a), 0);
    const replay = context(role), replayCard = put(replay.game, replay.a, 'Spells');
    const replayTarget = put(replay.game, replay.b, creature('Face action target', {power: '5', toughness: '2'}), 'battlefield');
    replay.state.targets = () => [replayTarget]; mana(replay.a, {R: 1});
    const replayQuery = {type: 'main', player: replay.a, phase: replay.game.phase, casts: replay.game.castableList(replay.a), acts: replay.game.activatableList(replay.a), lands: []};
    const restored = M.restoreSaveDecision(replayQuery, replay.a, saved);
    assert.equal(restored.card, replayCard); assert.equal(restored.alt.oracleFace, 'back');
    assert.equal(await replay.game.performAction(replay.a, restored), true); await settle(replay.game); assert.equal(replayTarget.zone, 'graveyard');
  });
  test(`v8 faces ${role}: a temporary copy preserves the original physical faces and resets to its own front`, async () => {
    const ctx = context(role), {game, a, b, state} = ctx, card = put(game, a, 'Creature');
    await castFace(ctx, card, 'back', {W: 1, C: 3}); await settle(game);
    const model = put(game, b, creature('Borrowed green shape', {power: '7', toughness: '8'}), 'battlefield'), root = card.oracleFaces;
    const spell = put(game, a, 'V8 Face Temporary Copy'); let targetIndex = 0;
    state.targets = query => [targetIndex++ === 0 ? card : model]; mana(a, {U: 1});
    assert.equal(await game.castSpell(a, spell, {from: 'hand'}), true); await settle(game);
    assert.equal(card.name, model.name); assert.equal(card.oracleFaces, root); assert.equal(card.oracleFace, 'back'); assert.equal(card.power, 7);
    const [copiedToken] = await game.copyPermanentToken(card, a);
    assert.equal(copiedToken.oracleFace, 'back'); assert.equal(copiedToken.oracleFaces.faces[0].def.name, model.name);
    assert.equal(copiedToken.oracleFaces.faces[1].def.name, model.name, 'a double-faced source under a copy effect supplies those copiable values to both token faces');
    await game.move(card, 'hand'); assert.equal(card.name, 'V8 Face Student'); assert.equal(card.oracleFace, 'front'); assert.equal(card.isCopyOf, null);
    assert.equal(card.oracleFaces, root); assert.equal(model.name, 'Borrowed green shape');
  });
  test(`v8 faces ${role}: manifest has ordinary face-down characteristics and turns up only its front face`, async () => {
    const ctx = context(role), {game, a} = ctx, card = put(game, a, 'Creature', 'library');
    await game.manifestCard(a, card); await settle(game);
    assert.equal(card.faceDown, true); assert.equal(card.oracleFace, 'front'); assert.equal(card.power, 2); assert.equal(card.mv, 0);
    assert.equal(card.kw('prowess'), false); assert.equal(card.kw('flying'), false);
    mana(a, {U: 1, C: 1}); assert.equal(await game.turnFaceUp(a, card), true);
    assert.equal(pool(a), 0); assert.equal(card.name, 'V8 Face Student'); assert.equal(card.oracleFace, 'front'); assert.equal(card.faceDown, false);
    assert.equal(card.kw('prowess'), true); assert.equal(a.life, 40, 'turning face up does not enter as either printed face');
    const version = card.zoneVersion, original = card.def;
    assert.equal(await game.putFaceDown(a, card), null, 'CR 712.16 forbids turning an existing double-faced permanent face down');
    assert.equal(card.def, original); assert.equal(card.zoneVersion, version); assert.equal(card.faceDown, false);
    const noncreature = put(game, a, 'Study', 'library'); await game.manifestCard(a, noncreature); await settle(game);
    assert.equal(game.faceUpCosts(noncreature).length, 0); assert.equal(await game.turnFaceUp(a, noncreature), false);
  });
}
