import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
const M = loadEngine();
for (const [index, commander] of ['Nelly Borca, Impulsive Accuser', 'Feather, Radiant Arbiter'].entries()) {
  test(`reviewed custom deck led by ${commander} completes a four-seat game`, {timeout: 300_000}, async () => {
    M.initData(M.RAW_DATA);
    const original = M.RAW_DATA.decks.find(d => d.name === 'Blame Game');
    const text = ['Commander', '1 ' + commander + ' *CMDR*', '', 'Deck',
      ...original.cards.filter(c => c.name !== commander).map(c => c.n + ' ' + c.name)].join('\n');
    const result = M.importCommanderDeck(text, {name: 'Reviewed native game ' + index});
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const record = M.createImportedDeckRecord(result, {id: 'deck-reviewed-native-game-' + index, now: '2026-09-10T22:00:00.000Z'});
    const values = new Map(), storage = {getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v)};
    M.upsertGuestImportedDeck(record, {storage});
    const game = M.newGame({humanDeck: result.deck.name,
      aiDecks: ['Enduring Enchantments', 'Fae Dominion', 'Timey-Wimey'],
      aiStyles: ['balanced', 'aggressive', 'balanced'], difficulty: 'normal',
      seed: 91018 + index, maxTurns: 200, paced: false});
    await game.start();
    assert.ok(game.gameOver); assert.ok(game.winner); assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    assert.equal((game.aiDecisionLog || []).filter(row => row.fallback).length, 0);
    console.log(JSON.stringify({commander, seed: 91018 + index, turn: game.turnNo, winner: game.winner.name, pending: game.pendingTriggers.length}));
    M.removeGuestImportedDeck(record.id, {storage}); M.initData(M.RAW_DATA);
  });
}
