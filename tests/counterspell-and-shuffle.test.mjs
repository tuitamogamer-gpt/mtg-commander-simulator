import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const ai = readFileSync(new URL('../src/modules/ai-v2.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function counterspellDeckCard(MTG) {
  return Object.keys(MTG.DEFS).find(name => {
    const def = MTG.DEFS[name];
    return def && def.types?.includes('Instant') && /^Counter target spell\.$/m.test(String(def.oracle || ''));
  });
}

test('a local AI never answers its own spell with a counter', async () => {
  const MTG = loadEngine();
  const counter = counterspellDeckCard(MTG);
  assert.ok(counter, 'the catalog has a plain counterspell');

  const game = new MTG.Game({ seed: 90210, paced: false, maxTurns: 4 });
  const bot = game.addPlayer('Bot', { name: 'Bot' }, null, true);
  const human = game.addPlayer('You', { name: 'You' }, { decide: async () => ({ kind: 'pass' }) }, false);
  bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  game.turnPlayer = bot;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  for (const player of [bot, human]) {
    for (let index = 0; index < 20; index++) {
      const land = new MTG.CardInst(MTG.DEFS.Island, player);
      land.zone = 'battlefield';
      land.sick = false;
      game.battlefield.push(land);
    }
  }
  game.recalc();

  const held = new MTG.CardInst(MTG.DEFS[counter], bot);
  held.zone = 'hand';
  bot.hand.push(held);
  const ownSpell = new MTG.CardInst(MTG.DEFS['Grizzly Bears'] || MTG.DEFS[counter], bot);
  ownSpell.zone = 'stack';
  game.stack.push({ kind: 'spell', card: ownSpell, ctrl: bot, name: ownSpell.name, targets: [] });

  const plan = await bot.controller.decide(game, { type: 'priority' });
  assert.notEqual(plan?.kind, 'cast',
    'the bot holds the counter while only its own spell is on the Stack');
});

test('the counterspell heuristics are written as hard rules, not preferences', () => {
  assert.match(ai, /const opposing = game\.stack\.filter\(object => object\.kind === 'spell' && object\.ctrl !== player\)/,
    'the cast decision looks for an opposing spell');
  assert.match(ai, /if \(!opposing\.length\) breakdown\.timing -= 1000;/,
    'with nothing of theirs on the Stack the counter is never cast');
  assert.match(ai, /if \(!hostile && hint === 'counter'\) return -1000;/,
    'its own spell is never chosen as the target of a counter');
});

test('every library is fully shuffled before the opening hand', () => {
  const MTG = loadEngine();
  const deckName = Object.keys(MTG.DECKS)[0];
  const deck = MTG.DECKS[deckName];
  const controller = { decide: async () => false };
  const openings = new Set();
  let unshuffled = 0;
  const positions = new Set();

  for (let run = 0; run < 60; run++) {
    const game = new MTG.Game({ seed: 5000 + run, paced: false, maxTurns: 1 });
    const player = game.addPlayer('P', deck, controller, false);
    game.buildDeck(player, deck, MTG.DEFS, null);
    const built = player.library.map(card => card.name).join('|');
    MTG.shuffle(player.library, game.rnd);
    const after = player.library.map(card => card.name);
    if (after.join('|') === built) unshuffled += 1;
    openings.add(after.slice(-7).join('|'));
    const forest = after.indexOf('Forest');
    if (forest >= 0) positions.add(forest);
  }

  assert.equal(unshuffled, 0, 'no game starts with the library in deck-list order');
  assert.ok(openings.size >= 55, `opening hands differ between games (${openings.size}/60 distinct)`);
  assert.ok(positions.size >= 10, `a given card lands across the whole library (${positions.size} distinct positions)`);
});

test('a permanent shows its other counters inside the card tile at every size', () => {
  // The badge used to sit at a fixed 48px offset, which falls outside the
  // smaller in-game tile and was clipped away by the tile's own overflow.
  const rule = /\.mini \.cnt2 \{([^}]*)\}/.exec(css);
  assert.ok(rule, 'the other-counter badge has its own rule');
  assert.match(rule[1], /bottom:\s*15px/, 'the badge is anchored to the tile, not to a fixed top offset');
  assert.doesNotMatch(rule[1], /top:\s*\d+px/, 'no fixed top offset can push it out of a smaller tile');
  assert.match(rule[1], /z-index:\s*3/, 'the badge paints above the card art and name strip');
});
