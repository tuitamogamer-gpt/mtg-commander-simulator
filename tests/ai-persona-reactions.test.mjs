import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const moments = ['counter', 'bigHit', 'wipe', 'monarch', 'copy', 'engine'];

function table(style = 'josh') {
  const game = new MTG.Game({ seed: 29, paced: false, maxTurns: 20 });
  const human = game.addPlayer('You', { name: 'Human deck' }, null, false);
  const bot = game.addPlayer('AI Dragon', { name: 'Bot deck' }, null, true);
  bot.isAI = true;
  bot.aiStyle = style;
  game.turnPlayer = bot;
  game.turnNo = 7;
  return { game, human, bot };
}

test('all five Command Zone signatures carry varied comments for every supported good-play moment', () => {
  const keys = ['jimmy', 'rachel', 'post', 'olivia', 'josh'];
  for (const key of keys) {
    const style = MTG.AI_STYLES[key];
    assert.equal(style.signature, true);
    assert.match(style.portrait, /^\.\/assets\/ai-personas\//);
    for (const moment of moments) {
      assert.equal(style.signatureComments[moment].length, 2, `${key}.${moment} needs two variants`);
      assert.ok(style.signatureComments[moment].every(line => line.length >= 18));
    }
  }
  assert.equal(new Set(keys.map(key => MTG.AI_STYLES[key].signatureComments.counter[0])).size, keys.length);
});

test('classifier reacts only after attributable, materially good public outcomes', () => {
  {
    const { game, human, bot } = table('josh');
    const source = { name: 'Counterspell', ctrl: bot };
    const event = { type: 'gameEffect', kind: 'counterspell', source, stackObject: { name: 'Expropriate', ctrl: human } };
    const reaction = MTG.signatureReactionForEvent(game, event);
    assert.equal(reaction.moment, 'counter');
    assert.equal(reaction.personaName, 'Josh Lee Kwai');
    assert.equal(reaction.duration, 3200);
    assert.ok(MTG.AI_STYLES.josh.signatureComments.counter.includes(reaction.comment));
    assert.equal(MTG.signatureReactionForEvent(game, event), null, 'same moment may appear only once per persona turn');
    game.turnNo++;
    assert.equal(MTG.signatureReactionForEvent(game, event).moment, 'counter');
  }

  {
    const { game, human, bot } = table('jimmy');
    const source = { name: 'Inferno Titan', ctrl: bot, commander: false };
    assert.equal(MTG.signatureReactionForEvent(game, {
      type: 'gameEffect', kind: 'damage', targetKind: 'player', source, targetPlayer: human, amount: 5, combat: true,
    }), null, 'small hits should not interrupt the table');
    assert.equal(MTG.signatureReactionForEvent(game, {
      type: 'gameEffect', kind: 'damage', targetKind: 'player', source, targetPlayer: human, amount: 8, combat: true,
    }).moment, 'bigHit');
  }

  {
    const { game, human, bot } = table('rachel');
    const source = { name: 'Supreme Verdict', ctrl: bot };
    const own = [{ ctrl: bot }, { ctrl: bot }];
    assert.equal(MTG.signatureReactionForEvent(game, {
      type: 'gameEffect', kind: 'boardWipe', source, cards: own.concat([{ ctrl: human }]),
    }), null, 'a wipe that loses more of the persona board is not celebrated');
    assert.equal(MTG.signatureReactionForEvent(game, {
      type: 'gameEffect', kind: 'boardWipe', source, cards: own.concat([{ ctrl: human }, { ctrl: human }, { ctrl: human }]),
    }).moment, 'wipe');
  }
});

test('crown, copy and engine events map to the selected signature while core archetypes stay silent', () => {
  const crown = table('olivia');
  assert.equal(MTG.signatureReactionForEvent(crown.game, {
    type: 'monarchChanged', player: crown.bot, previous: crown.human,
  }).moment, 'monarch');

  const copy = table('post');
  assert.equal(MTG.signatureReactionForEvent(copy.game, {
    type: 'effectNotice', kind: 'spellCopy', player: copy.bot, spell: { name: 'Big Score' },
  }).moment, 'copy');

  const engine = table('josh');
  assert.equal(MTG.signatureReactionForEvent(engine.game, {
    type: 'battlefieldArrival', kind: 'commander', player: engine.bot, card: { name: 'Shorikai' },
  }).moment, 'engine');

  const core = table('balanced');
  assert.equal(MTG.signatureReactionForEvent(core.game, {
    type: 'monarchChanged', player: core.bot, previous: core.human,
  }), null);
});

test('Arena queues a centered portrait reaction, exposes it to text state, and provides a real browser canary', () => {
  assert.match(mainSource, /gameRef && MTG\.signatureReactionForEvent && MTG\.signatureReactionForEvent\(gameRef, e\)/);
  assert.match(mainSource, /smokeScenario === 'personaReaction'/);
  assert.match(mainSource, /g\._signatureReactionDuration = 15000/);
  assert.match(mainSource, /await g\.damagePlayer\(source, ui\.me, 8, \{ combat: true \}\)/);
  assert.match(mainSource, /signatureReaction: ui && ui\.activePersonaReaction/);
  assert.match(uiSource, /showPersonaReaction\(reaction\)/);
  assert.match(uiSource, /personaReactionQueue/);
  assert.match(uiSource, /el\('div', `personareaction style-\$\{reaction\.style\}`\)/);
  assert.match(uiSource, /aria-live', 'polite'/);
  assert.match(cssSource, /\.personareaction \{[\s\S]*?left:50%; top:50%; z-index:185;/);
  assert.match(cssSource, /\.personareactionportrait img/);
  assert.match(cssSource, /@media \(max-width:767px\)[\s\S]*?\.personareaction/);
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.personareaction/);
});
