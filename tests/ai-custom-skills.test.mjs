import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';
const MTG = loadEngine();
const clone = value => JSON.parse(JSON.stringify(value));
const template = () => clone(MTG.aiSkillTemplate());
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), data };
};
const options = keys => ({ humanDeck: 'Quandrix Unlimited', aiDecks: ['Elven Council'], aiStyles: keys,
  humanController: () => ({ decide: async () => null }), seed: 83096, paced: false });

function card(game, player, name, zone = 'battlefield') {
  const c = new MTG.CardInst(MTG.DEFS[name], player);
  c.ctrl = player; c.zone = zone; c.sick = false;
  if (zone === 'battlefield') game.battlefield.push(c); else player[zone].push(c);
  return c;
}
function fixture(style, difficulty = 'normal') {
  const game = new MTG.Game({ seed: 83096, paced: false });
  const player = game.addPlayer('Bot', MTG.DECKS['Quandrix Unlimited'], null, true);
  const opponent = game.addPlayer('Rival', MTG.DECKS['Elven Council'], { decide: async () => null }, false);
  player.deckName = 'Quandrix Unlimited'; player.turnsStarted = 3;
  player.controller = new MTG.AIController(player, { style, difficulty });
  game.turnPlayer = player; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  return { game, player, opponent };
}

test('template and creation prompt share a valid format and bounded settings', () => {
  const example = JSON.parse(fs.readFileSync(new URL('../docs/examples/patient-engine.json', import.meta.url)));
  assert.deepEqual(clone(MTG.parseAISkill(example)), template());
  assert.match(MTG.aiSkillPrompt(), /DESCRIBE YOUR STYLE HERE/);
  assert.match(MTG.aiSkillPrompt(), /without Markdown fences/);
  assert.equal(MTG.parseAISkill('\uFEFF' + JSON.stringify(example)).id, example.id);
  const reordered = Object.fromEntries(Object.entries(example).reverse());
  assert.equal(MTG.aiSkillKey(reordered), MTG.aiSkillKey(example));
});

test('untrusted imports reject executable fields, prototype keys, typos and malformed values', () => {
  for (const bad of [
    '', '```json\n{}\n```', 'null', '[]', '{broken', 'x'.repeat(32769),
    { ...template(), schema: 'v2' }, { ...template(), id: '__proto__' },
    { ...template(), baseStyle: 'constructor' }, { ...template(), baseStyle: 'random' },
    { ...template(), script: 'fetch("https://example.com")' }, { ...template(), portrait: 'https://example.com/x' },
    { ...template(), name: 'line\nbreak' }, { ...template(), description: 'x'.repeat(401) },
    { ...template(), profileMultipliers: { cardAdvantage: '2' } }, { ...template(), profileMultipliers: null },
    { ...template(), profileMultipliers: { cardAdvantage: 2.01 } }, { ...template(), profileMultipliers: { lifeSafety: NaN } },
    { ...template(), profileMultipliers: { mana: 1 } }, { ...template(), roleBonuses: { engine: -7 } },
    { ...template(), roleBonuses: { engine: 1, creature: 1, ramp: 1, finisher: 1, tutor: 1 } },
    { ...template(), reserveMana: 1.2 }, { ...template(), reserveMana: 5 },
    JSON.stringify(template()).replace('"profileMultipliers":{', '"profileMultipliers":{"__proto__":1,'),
  ]) assert.throws(() => MTG.parseAISkill(bad), /AI skill:/);
  assert.equal({}.polluted, undefined);
});

test('local save, replacement, reload, export and removal preserve immutable revisions', () => {
  const store = storage(), doc = template();
  const key = MTG.saveAISkill(doc, store);
  const firstRuntime = MTG.AI_STYLES[key];
  assert.equal(MTG.readAISkillLibrary(store).records.length, 1);
  doc.profileMultipliers.cardAdvantage = 0.5;
  const newer = MTG.saveAISkill(doc, store);
  assert.notEqual(newer, key);
  assert.equal(MTG.readAISkillLibrary(store).records.length, 1);
  assert.equal(firstRuntime.document.profileMultipliers.cardAdvantage, 1.3);
  assert.equal(MTG.getAIStyleSkill(key).profileMultipliers.cardAdvantage, 1.35 * 1.3);
  assert.equal(MTG.getAIStyleSkill(newer).profileMultipliers.cardAdvantage, 1.35 * 0.5);
  assert.equal(MTG.aiSkillKey(JSON.stringify(MTG.readAISkillLibrary(store).records[0])), newer);
  MTG.removeAISkill(doc.id, store);
  assert.equal(MTG.readAISkillLibrary(store).records.length, 0);
  assert.equal(MTG.AI_STYLES[key], firstRuntime, 'active games keep the exact original policy');
});

test('capacity, corruption and storage denial never silently discard existing skills', () => {
  const store = storage();
  for (let i = 0; i < 20; i++) MTG.saveAISkill({ ...template(), id: `skill-${i}` }, store);
  const before = store.getItem(MTG.AI_SKILL_FORMAT.storageKey);
  assert.throws(() => MTG.saveAISkill(template(), store), /full/);
  assert.equal(store.getItem(MTG.AI_SKILL_FORMAT.storageKey), before);
  const denied = { getItem: store.getItem, setItem: () => { throw Error('QuotaExceeded'); } };
  assert.throws(() => MTG.saveAISkill({ ...template(), id: 'skill-0', name: 'Replacement' }, denied), /No changes/);
  assert.equal(store.getItem(MTG.AI_SKILL_FORMAT.storageKey), before);
  store.setItem(MTG.AI_SKILL_FORMAT.storageKey, '{corrupt');
  assert.ok(MTG.readAISkillLibrary(store).error);
  assert.throws(() => MTG.saveAISkill(template(), store), /unavailable/);
  assert.equal(store.getItem(MTG.AI_SKILL_FORMAT.storageKey), '{corrupt');
  MTG.resetAISkillLibrary(store);
  assert.equal(MTG.readAISkillLibrary(store).error, null);
});

test('registered styles inherit every base policy while keeping custom identity and cached weights separate', () => {
  for (const baseStyle of MTG.AI_SKILL_FORMAT.bases) {
    const key = MTG.registerAISkill({ ...template(), baseStyle });
    const { game, player } = fixture(key);
    assert.equal(MTG.getAIBaseStyle(player.aiStyle), baseStyle);
    assert.equal(player.controller.persona.atkThr, MTG.AI_STYLES[baseStyle].atkThr);
    assert.equal(MTG.AI_STYLES[key].signature, false);
    assert.equal(MTG.AI_STYLES[key].portrait, undefined);
    const profile = MTG.getBotEvaluationProfile(player);
    const original = MTG.getDeckAIProfile(player.deckName);
    const baseWeight = MTG.getAIStyleSkill(baseStyle)?.profileMultipliers.cardAdvantage ?? 1;
    assert.equal(profile.weights.cardAdvantage, Math.round(original.weights.cardAdvantage * baseWeight * 1.3 * 100) / 100);
    assert.equal(MTG.getAIStyleMode(game, player), MTG.getAIStyleMode(game, Object.assign(Object.create(Object.getPrototypeOf(player)), player, { aiStyle: baseStyle })));
    assert.strictEqual(MTG.getBotEvaluationProfile(player), profile);
  }
});

test('custom preferences change a real local controller cast decision and resolve through normal mana and Stack', async () => {
  const outcomes = [];
  for (const bonus of [-6, 6]) {
    const key = MTG.registerAISkill({ ...template(), baseStyle: 'balanced', profileMultipliers: {}, roleBonuses: { 'mana-rock': bonus, 'protection': -bonus }, reserveMana: 0 });
    const { game, player } = fixture(key);
    card(game, player, 'Forest'); card(game, player, 'Forest');
    card(game, player, 'Arcane Signet', 'hand'); card(game, player, 'Lightning Greaves', 'hand');
    game.recalc();
    const q = { type: 'main', player, casts: game.castableList(player), acts: [], lands: [], phase: 'main1' };
    const decision = await player.controller.decide(game, q);
    assert.equal(decision.kind, 'cast');
    outcomes.push(decision.card.name);
    const log = game.aiDecisionLog.at(-1);
    assert.equal(log.fallback, false);
    assert.equal(log.skill, key);
    assert.equal(player.controller.lastV2Decision.consideredActions.find(item => item.action === 'Cast Arcane Signet').scoreBreakdown.customSkill, bonus);
    const stackSizes = [];
    game.onEvent = event => { if (event.type === 'stack') stackSizes.push(game.stack.length); };
    assert.equal(await game.castSpell(player, decision.card, decision), true);
    assert.equal(game.lands(player).filter(c => c.tapped).length, 2);
    assert.ok(stackSizes.includes(1), 'spell was announced on the real Stack');
    assert.equal(decision.card.zone, 'battlefield');
    assert.equal(game.stack.length, 0);
    assert.equal(game.pendingTriggers.length, 0);
  }
  assert.deepEqual(outcomes, ['Lightning Greaves', 'Arcane Signet']);
});

test('reserve mana changes the cast score only while holding interaction', async () => {
  const scores = [];
  for (const reserveMana of [0, 4]) {
    const key = MTG.registerAISkill({ ...template(), baseStyle: 'balanced', profileMultipliers: {}, roleBonuses: {}, reserveMana });
    const { game, player } = fixture(key);
    for (let i = 0; i < 5; i++) card(game, player, 'Forest');
    const spell = card(game, player, 'Arcane Signet', 'hand'); card(game, player, 'Beast Within', 'hand');
    game.recalc();
    const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: player.idx, seed: 4, forceSearch: false,
      actionWindow: { type: 'main', player, casts: [{ card: spell, from: 'hand' }], acts: [], lands: [] } });
    assert.equal(decision.action.kind, reserveMana ? 'done' : 'cast');
    scores.push(decision.consideredActions.find(item => item.action === 'Cast Arcane Signet').scoreBreakdown.customSkill);
  }
  assert.deepEqual(scores, [0, -5.5]);
});

test('private save and public debug replay are portable without the browser library and reject missing/tampered revisions', () => {
  const key = MTG.registerAISkill(template());
  const game = MTG.newGame(options([key]));
  const setup = { deck: 'Quandrix Unlimited', ai: 1, aiDecks: ['Elven Council'], aiStyles: [key], seed: '83096' };
  const save = clone(MTG.buildAccountSave(game, setup, [], 'match-custom-skill-0001'));
  const bundle = clone(MTG.buildDebugBundle(game, {}));
  delete MTG.AI_STYLES[key]; // Simulate another browser with an empty library.
  assert.equal(MTG.validateAccountSave(save), save);
  const replay = MTG.parseDebugBundle(bundle);
  assert.equal(replay.aiCustomSkills[0].id, template().id);
  assert.throws(() => MTG.validateAccountSave({ ...save, setup: { ...save.setup, aiCustomSkills: [] } }), /missing or invalid/);
  const tampered = clone(save); tampered.setup.aiCustomSkills[0].reserveMana = 0;
  assert.throws(() => MTG.validateAccountSave(tampered), /missing or invalid/);
  const restored = MTG.newGame({ ...options(save.setup.aiStyles), aiCustomSkills: save.setup.aiCustomSkills });
  assert.equal(restored.players.find(p => p.isAI).aiStyle, key);
  assert.equal(MTG.getAIStyleSkill(key).reserveMana, 2);
});

test('custom installs never change Random style or seeded turn order', () => {
  const before = MTG.newGame(options(['random']));
  for (let i = 0; i < 10; i++) MTG.registerAISkill({ ...template(), id: `random-test-${i}` });
  const after = MTG.newGame(options(['random']));
  assert.deepEqual(after.players.map(p => [p.name, p.aiStyle]), before.players.map(p => [p.name, p.aiStyle]));
  assert.equal(after.players.some(p => MTG.AI_STYLES[p.aiStyle]?.custom), false);
});

for (const baseStyle of MTG.AI_SKILL_FORMAT.bases) {
  test(`custom ${baseStyle} keeps its only shield at low life on every difficulty`, async () => {
    const key = MTG.registerAISkill({ ...template(), baseStyle, profileMultipliers: { lifeSafety: 0.5, boardPresence: 2 }, roleBonuses: { creature: 6 } });
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const { game, player, opponent } = fixture(key, difficulty);
      const strong = game.addPlayer('Strong rival', MTG.DECKS['Quick Draw'], null, true);
      player.life = 4; opponent.life = 3; game.turnNo = 35; game.phase = 'combat'; game.step = 'attackers';
      const make = (owner, name, power, toughness) => {
        const c = new MTG.CardInst({ name, types: ['Creature'], super: [], subtypes: [], cost: '{3}', power: String(power), toughness: String(toughness), kws: [], oracle: '', abilities: [] }, owner);
        c.ctrl = owner; c.zone = 'battlefield'; c.sick = false; game.battlefield.push(c); return c;
      };
      const shield = make(player, 'Only shield', 4, 6); make(strong, 'Next threat', 5, 5).tapped = true;
      game.recalc();
      const result = await player.controller.decide(game, { type: 'attackers', player, eligible: [shield], opponents: player.opponents(game), forced: [] });
      assert.equal(result.length, 0, difficulty);
      assert.equal(game.aiDecisionLog.at(-1).fallback, false);
    }
  });
}

test('custom skill completes a deterministic real four-player game without fallback', async () => {
  const key = MTG.registerAISkill(template());
  const summaries = [];
  for (let run = 0; run < 2; run++) {
    const game = MTG.newGame({ humanDeck: 'Squirreled Away', aiDecks: ['The Fantastic Four', 'Counter Intelligence', 'Elven Council'],
      aiStyles: [key, 'passive', 'balanced'], difficulty: 'normal', seed: 82711, maxTurns: 200, paced: false });
    await game.start();
    assert.equal(game.gameOver, true); assert.ok(game.winner); assert.ok(game.turnNo < 200);
    assert.equal(game.pendingTriggers.length, 0);
    assert.equal(game.aiDecisionLog.some(entry => entry.fallback), false);
    assert.ok(game.aiDecisionLog.some(entry => entry.skill === key && entry.mode));
    summaries.push([game.winner.name, game.turnNo, game.players.map(p => [p.name, p.life, p.lost])]);
  }
  assert.deepEqual(summaries[0], summaries[1]);
});
