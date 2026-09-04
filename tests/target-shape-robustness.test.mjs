import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// A multi-card target arrives as an array, but a one-card pick can arrive as
// the card itself. A script that calls .filter on it crashes the whole game
// at resolution — found by a benchmark seed that Channelled Shigeki for X=1.

const MTG = loadEngine();

test('Shigeki’s Channel resolves whether its pick arrives as a card or as a list', async () => {
  const game = new MTG.Game({ seed: 3, paced: false, maxTurns: 20 });
  const player = game.addPlayer('You', { name: 'You deck' }, { decide: async () => null }, false);
  game.turnPlayer = player;
  const def = MTG.DEFS['Shigeki, Jukai Visionary'];
  assert.ok(def && def.handAbility, 'the card and its Channel ability exist');
  const inGraveyard = name => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.zone = 'graveyard';
    player.graveyard.push(card);
    return card;
  };
  const source = new MTG.CardInst(def, player);
  source.zone = 'hand';
  player.hand.push(source);

  const single = inGraveyard('Grizzly Bears');
  await def.handAbility.run({ g: game, you: player, src: source, targets: [single], xVal: 1 });
  assert.equal(single.zone, 'hand', 'a single card target is returned to hand');

  const first = inGraveyard('Grizzly Bears');
  const second = inGraveyard('Forest');
  await def.handAbility.run({ g: game, you: player, src: source, targets: [[first, second]], xVal: 2 });
  assert.equal(first.zone, 'hand');
  assert.equal(second.zone, 'hand', 'a list of targets still works');
});
