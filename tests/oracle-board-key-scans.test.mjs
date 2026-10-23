import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// Battlefield scans for printed keys (Yixlid Jailer, Rootpath Purifier,
// Painter's Servant) are reused between board changes. Every way the board
// changes must still be seen by the next read.
const MTG = loadEngine();

function table() {
  const game = new MTG.Game({ seed: 3, paced: false });
  const you = game.addPlayer('You', { name: 'you' }, null, false);
  const opp = game.addPlayer('Opp', { name: 'opp' }, null, false);
  const put = (name, player, zone = 'battlefield') => {
    const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone; card.ctrl = player;
    if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
    return card;
  };
  game.turnPlayer = you; game.turnNo = 3; game.phase = 'main1'; game.step = 'main';
  return { game, you, opp, put };
}

test('a graveyard card loses and regains its abilities as Yixlid Jailer comes and goes', async () => {
  const { game, you, opp, put } = table();
  const twice = put('Think Twice', you, 'hand');
  await game.move(twice, 'graveyard');
  game.recalc();
  assert.ok(twice.def.flashback, 'flashback before any Jailer');
  const jailer = put('Yixlid Jailer', opp);
  assert.equal(twice.def.flashback, undefined, 'a Jailer pushed onto the battlefield is seen at once');
  jailer.phasedOut = true;
  assert.ok(twice.def.flashback, 'a phased-out Jailer is ignored');
  jailer.phasedOut = false;
  assert.equal(twice.def.flashback, undefined);
  await game.move(jailer, 'graveyard');
  assert.ok(twice.def.flashback, 'the Jailer leaving the battlefield restores the graveyard card');
  const second = put('Yixlid Jailer', opp, 'hand');
  await game.move(second, 'battlefield');
  assert.equal(twice.def.flashback, undefined, 'a Jailer moved onto the battlefield is seen at once');
});

test('Rootpath Purifier makes library lands basic only while it is on its controller\'s battlefield', async () => {
  const { game, you, opp, put } = table();
  const tower = put('Command Tower', you, 'library');
  assert.equal(tower.is('Basic'), false);
  const purifier = put('Rootpath Purifier', you);
  assert.equal(tower.is('Basic'), true);
  const theirs = put('Command Tower', opp, 'library');
  assert.equal(theirs.is('Basic'), false, 'only its controller\'s library');
  await game.move(purifier, 'exile');
  assert.equal(tower.is('Basic'), false);
});

test('Painter\'s Servant colors follow the Servant on and off the battlefield', async () => {
  const { game, you, put } = table();
  const bear = put('Grizzly Bears', you);
  const servant = put("Painter's Servant", you); servant.meta.painterV88 = 'U';
  game.recalc();
  assert.ok(bear.colors.includes('U'));
  await game.move(servant, 'graveyard');
  game.recalc();
  assert.equal(bear.colors.includes('U'), false);
});
