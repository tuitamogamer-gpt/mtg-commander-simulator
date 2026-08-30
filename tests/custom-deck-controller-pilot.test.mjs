import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const manifest = JSON.parse(fs.readFileSync(
  new URL('../reports/oracle-import/sauron-dark-lord-moxfield.json', import.meta.url),
  'utf8',
));
const PILOT_CARD = 'Dreadhorde Invasion';

function exactSauronDeckText() {
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

function fallbackDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'mulligan') return false;
  if (query.type === 'bottomCards') return [];
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.max;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 1).map(option => option.key);
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function importPilotDeck(name) {
  const imported = MTG.importCommanderDeck(exactSauronDeckText(), { name, register: true });
  assert.equal(imported.ok, true, imported.errors.map(error => error.message).join('\n'));
  assert.equal(imported.deck.custom, true);
  assert.equal(MTG.CARD_CATALOG[PILOT_CARD].semanticClass, 'manual-deck-semantic');
  return imported;
}

function takeFromLibrary(player, name) {
  const index = player.library.findIndex(card => card.name === name);
  assert.notEqual(index, -1, `${name} must be present in the imported custom deck`);
  return player.library.splice(index, 1)[0];
}

function stagePilotMainPhase(imported, { customIsAI, customController, seed }) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 2, difficulty: 'normal' });
  const custom = game.addPlayer(
    customIsAI ? 'Imported deck bot' : 'Imported deck human',
    MTG.DECKS[imported.deck.name],
    null,
    customIsAI,
  );
  custom.chosenCommanders = imported.commanders.slice();
  game.buildDeck(custom, custom.deck, MTG.DEFS);
  custom.deckName = imported.deck.name;
  custom.controller = customController(custom);

  const opponent = game.addPlayer(
    'Priority-pass opponent',
    { name: 'Priority-pass fixture' },
    { decide: async (currentGame, query) => fallbackDecision(query) },
    false,
  );
  opponent.deckName = 'Priority-pass fixture';

  const firstSwamp = takeFromLibrary(custom, 'Swamp');
  firstSwamp.ctrl = custom;
  firstSwamp.zone = 'battlefield';
  firstSwamp.tapped = false;
  game.battlefield.push(firstSwamp);

  const landDrop = takeFromLibrary(custom, 'Swamp');
  landDrop.zone = 'hand';
  custom.hand.push(landDrop);
  const pilotSpell = takeFromLibrary(custom, PILOT_CARD);
  pilotSpell.zone = 'hand';
  custom.hand.push(pilotSpell);

  game.turnPlayer = custom;
  game.turnNo = 3;
  game.phase = 'main1';
  game.step = '';
  custom.landsPlayed = 0;
  game.recalc();
  return { game, custom, landDrop, pilotSpell };
}

test('imported custom deck: real human main-phase decisions play a land and cast/resolve an imported card', async () => {
  const imported = importPilotDeck('Sauron Custom Human Controller Pilot');
  const decisions = [];
  let playedLand = false;
  let castPilot = false;
  const { game, custom, landDrop, pilotSpell } = stagePilotMainPhase(imported, {
    seed: 830101,
    customIsAI: false,
    customController: () => ({
      decide: async (currentGame, query) => {
        decisions.push({ type: query.type, phase: currentGame.phase });
        if (query.type === 'main' && !playedLand) {
          const land = query.lands.find(card => card === landDrop);
          assert.ok(land, 'engine offered the imported human seat its staged legal land drop');
          playedLand = true;
          return { kind: 'land', card: land };
        }
        if (query.type === 'main' && !castPilot) {
          const cast = query.casts.find(entry => entry.card === pilotSpell);
          assert.ok(cast, 'engine offered the imported human seat the now-payable pilot spell');
          castPilot = true;
          return { kind: 'cast', card: cast.card, alt: cast.alt, from: cast.from };
        }
        return fallbackDecision(query);
      },
    }),
  });

  assert.equal(custom.isAI, false);
  await game.mainPhase(custom);

  assert.equal(playedLand, true, 'the human controller submitted a real land action');
  assert.equal(castPilot, true, 'the human controller submitted a real cast action');
  assert.equal(landDrop.zone, 'battlefield');
  assert.equal(game.lands(custom).filter(card => card.name === 'Swamp').length, 2);
  assert.equal(pilotSpell.zone, 'battlefield', `${PILOT_CARD} resolved as a permanent`);
  assert.ok(game.bf().includes(pilotSpell));
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
  assert.ok(decisions.filter(entry => entry.type === 'main').length >= 3);
  assert.ok(game.log.some(entry => /plays a land: Swamp/i.test(entry.msg)));
  assert.ok(game.log.some(entry => new RegExp(`casts?\\s+${PILOT_CARD}`, 'i').test(entry.msg)));
  assert.ok(game.log.some(entry => new RegExp(`Rezolvira se: ${PILOT_CARD}`, 'i').test(entry.msg)));
});

test('imported custom deck: genuine local AIController plays and casts from its custom deck without fallback', async () => {
  const imported = importPilotDeck('Sauron Custom Local AI Pilot');
  const { game, custom, landDrop, pilotSpell } = stagePilotMainPhase(imported, {
    seed: 830102,
    customIsAI: true,
    customController: player => new MTG.AIController(player, { difficulty: 'normal', style: 'balanced' }),
  });

  assert.equal(custom.isAI, true);
  assert.ok(custom.controller instanceof MTG.AIController);
  assert.equal(custom.deck.custom, true);
  await game.mainPhase(custom);

  assert.equal(landDrop.zone, 'battlefield', 'local AI made the real custom-deck land play');
  assert.equal(pilotSpell.zone, 'battlefield', `local AI cast and resolved ${PILOT_CARD}`);
  const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerId === custom.idx);
  assert.ok(decisions.some(entry => entry.chosen === 'Play land Swamp'), 'AI decision log contains the land play');
  assert.ok(decisions.some(entry => entry.chosen === `Cast ${PILOT_CARD}`), 'AI decision log contains the imported-card cast');
  assert.equal(decisions.some(entry => entry.fallback), false);
  assert.equal(game.log.some(entry => /AI V2 fallback/i.test(entry.msg)), false);
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
});
