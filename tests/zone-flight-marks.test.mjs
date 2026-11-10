// The table names a card flying to the graveyard "DISCARDED" or "MILLED" only
// from the engine's own marks. The marks hold the zone version the card got in
// the graveyard, so they stop counting when the card moves again, and they are
// published to Live guests, who cannot see hands or libraries.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const MTG = loadEngine();
function table() {
  const game = new MTG.Game({seed: 1110, paced: false});
  const decide = async (g, q) => q.type === 'priority' ? {kind: 'pass'} : null;
  const [you, opponent] = ['You', 'Opponent'].map(name => game.addPlayer(name, {name}, {decide}, false));
  game.turnPlayer = you; game.turnNo = 5; game.phase = 'main1';
  const put = (name, owner, zone) => {
    const card = new MTG.CardInst(MTG.DEFS[name], owner); card.zone = zone; owner[zone].push(card); return card;
  };
  return {game, you, opponent, put};
}

test('a mill marks each milled card with its graveyard zone version', async () => {
  const {game, you, put} = table();
  const bottom = put('Forest', you, 'library'), second = put('Grizzly Bears', you, 'library'), top = put('Serra Angel', you, 'library');
  await game.mill(you, 2);
  assert.deepEqual([top.zone, second.zone, bottom.zone], ['graveyard', 'graveyard', 'library']);
  for (const card of [top, second]) assert.equal(card.meta._milledZoneVersion, card.zoneVersion);
  assert.equal(bottom.meta._milledZoneVersion, undefined);
  // The mark belongs to that stay in the graveyard only.
  await game.move(top, 'hand');
  assert.notEqual(top.meta._milledZoneVersion, top.zoneVersion);
  // A card put into the graveyard from the library by another effect is not milled.
  await game.move(bottom, 'graveyard');
  assert.equal(bottom.meta._milledZoneVersion, undefined);
});

test('a discard marks the card, and the mark stops counting once the card moves on', async () => {
  const {game, you, put} = table();
  const card = put('Grizzly Bears', you, 'hand');
  await game.discard(you, [card]);
  assert.equal(card.zone, 'graveyard');
  assert.equal(card.meta._discardedZoneVersion, card.zoneVersion);
  await game.move(card, 'hand');
  await game.move(card, 'graveyard');
  assert.notEqual(card.meta._discardedZoneVersion, card.zoneVersion, 'a later trip to the graveyard is not that discard');
});

test('a Live guest receives the marks of public cards and nothing of hidden ones', async () => {
  const {game, you, opponent, put} = table();
  const discarded = put('Grizzly Bears', opponent, 'hand');
  put('Serra Angel', opponent, 'library');
  await game.discard(opponent, [discarded]);
  const [milled] = await game.mill(opponent, 1);
  const seenDiscard = MTG.onlineCardPresentation(discarded, you), seenMill = MTG.onlineCardPresentation(milled, you);
  assert.equal(seenDiscard.zoneVersion, discarded.zoneVersion);
  assert.equal(seenDiscard.meta._discardedZoneVersion, discarded.zoneVersion);
  assert.equal(seenDiscard.meta._discardedTurn, 5);
  assert.equal(seenMill.meta._milledZoneVersion, milled.zoneVersion);
  // Back in the opponent's hand the card is hidden again: no mark travels with it.
  await game.move(discarded, 'hand');
  const hidden = MTG.onlineCardPresentation(discarded, you);
  assert.equal(hidden.hidden, true);
  assert.deepEqual(Object.keys(hidden.meta), []);
});
