import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const CARD_NAME = 'Signed X Regression';

function sourceCard() {
  return {
    id: 'scryfall-signed-x-regression',
    oracle_id: 'oracle-signed-x-regression',
    name: CARD_NAME,
    layout: 'normal',
    mana_cost: '{X}{U}',
    type_line: 'Instant',
    oracle_text: 'Target attacking creature gets -X/-0 until end of turn.',
    color_identity: ['U'],
    colors: ['U'],
    keywords: [],
    games: ['paper'],
    legalities: { commander: 'legal' },
    set: 'tst',
    set_name: 'Runtime Tests',
    collector_number: 'signed-x',
    rarity: 'common',
    released_at: '2026-01-01',
    scryfall_uri: 'https://example.invalid/signed-x-regression',
  };
}

function ensureCard() {
  if (MTG.DEFS[CARD_NAME]) return;
  const source = sourceCard();
  const semantics = semanticClass(source);
  assert.equal(semantics.reason, undefined, 'signed -X fixture passes the exact importer');
  assert.equal(semantics.implementation[0].power, '-X', 'the compiler preserves the negative sign');
  MTG.registerOracleBatch({
    id: 'oracle-signed-x-runtime-fixture',
    sequence: 10001,
    cards: [{
      position: 1,
      oracleId: source.oracle_id,
      scryfallId: source.id,
      raw: {
        name: source.name,
        cost: source.mana_cost,
        super: [],
        types: ['Instant'],
        subtypes: [],
        oracle: source.oracle_text,
        _ci: source.color_identity,
        _oracleId: source.oracle_id,
        _scryfallId: source.id,
        _layout: source.layout,
        _set: source.set,
        _collectorNumber: source.collector_number,
        _rarity: source.rarity,
      },
      catalog: {
        typeLine: source.type_line,
        colorIdentity: source.color_identity,
        colors: source.colors,
        keywords: source.keywords,
        commanderLegality: 'legal',
      },
      ...semantics,
    }],
  });
  MTG.initData(MTG.RAW_DATA);
}

function fallbackDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function synthetic(name, extras = {}) {
  return Object.assign({
    name,
    cost: '{1}',
    super: [],
    types: ['Creature'],
    subtypes: [],
    oracle: '',
    kws: [],
    power: '2',
    toughness: '2',
  }, extras);
}

function permanent(game, player, definition) {
  const card = new MTG.CardInst(definition, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  return card;
}

function combatGame(role) {
  ensureCard();
  const game = new MTG.Game({ seed: role === 'ai' ? 9312 : 9311, paced: false, maxTurns: 4, difficulty: 'hard' });
  const defender = game.addPlayer(role === 'ai' ? 'Signed X bot' : 'Signed X human', { name: `${role} signed X` }, null, role === 'ai');
  const opponent = game.addPlayer('Signed X opponent', { name: 'opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  opponent.controller.player = opponent;

  const spell = new MTG.CardInst(MTG.DEFS[CARD_NAME], defender);
  spell.zone = 'hand';
  defender.hand.push(spell);
  defender.pool.U = 1;
  defender.pool.C = 8;
  defender.life = 5;
  opponent.life = 40;

  const attacker = permanent(game, opponent, synthetic('Signed X lethal attacker', {
    power: '5', toughness: '5',
  }));
  const friendlyDecoy = permanent(game, defender, synthetic('Signed X friendly decoy', {
    power: '10', toughness: '10',
  }));
  attacker.attacking = defender;
  game.combat = { attackers: [attacker], defenders: new Map([[defender.idx, [attacker]]]) };
  game.turnNo = 6;
  game.turnPlayer = opponent;
  game.phase = 'combat';
  game.step = 'attackers';

  const state = { submitted: false, trace: [], xHints: [] };
  if (role === 'ai') {
    defender.controller = new MTG.AIController(defender, { difficulty: 'hard', style: 'balanced' });
  } else {
    defender.controller = {
      decide: async (currentGame, query) => {
        state.trace.push(query.type);
        if (query.type === 'priority' && !state.submitted) {
          const cast = query.casts.find(candidate => candidate.card === spell);
          if (cast) {
            state.submitted = true;
            return { kind: 'cast', card: cast.card, alt: cast.alt, from: cast.from };
          }
        }
        if (query.type === 'chooseX') {
          state.xHints.push(query.aiHint?.kind);
          return 5;
        }
        if (query.type === 'chooseTargets') return [attacker];
        return fallbackDecision(query);
      },
    };
  }

  game.recalc();
  return { game, defender, opponent, spell, attacker, friendlyDecoy, state };
}

for (const role of ['human', 'ai']) {
  test(`${role}: signed -X ide kroz pravi priority, Stack, X izbor i protivničku metu`, async () => {
    const context = combatGame(role);
    await context.game.priorityRound(context.defender);

    assert.ok(context.spell.castMeta, `${role}: card was actually cast`);
    assert.equal(context.spell.castMeta.alt.free, undefined, `${role}: mana was paid normally`);
    assert.equal(context.spell.castMeta.x, 5, `${role}: X exactly matches the attacker's power`);
    assert.equal(context.spell.castMeta.manaSpent, 6, `${role}: no X overpayment`);
    assert.equal(context.spell.zone, 'graveyard', `${role}: resolved Instant reaches the graveyard`);
    assert.equal(context.attacker.power, 0, `${role}: -X reduces the hostile attacker instead of pumping it`);
    assert.equal(context.attacker.toughness, 5, `${role}: printed -0 leaves toughness unchanged`);
    assert.equal(context.friendlyDecoy.power, 10, `${role}: a higher-value friendly creature is not selected`);
    assert.equal(context.game.stack.length, 0, `${role}: Stack fully settles`);
    assert.equal(context.game.pendingTriggers.length, 0, `${role}: no pending triggers remain`);

    if (role === 'human') {
      assert.equal(context.state.submitted, true, 'human received and selected the real cast action');
      assert.ok(context.state.trace.includes('chooseTargets'), 'human received the target interaction');
      assert.deepEqual(context.state.xHints, ['oracleXDebuff'], 'human X prompt carries the signed-debuff contract');
    } else {
      const decisions = (context.game.aiDecisionLog || []).filter(decision => decision.playerId === context.defender.idx);
      assert.ok(decisions.some(decision => String(decision.chosen).includes(CARD_NAME)),
        `real local AI selected the signed-X card: ${decisions.map(decision => decision.chosen).join(' | ')}`);
      assert.equal(decisions.some(decision => decision.fallback), false, 'AI never used a fallback decision');
    }
  });
}
