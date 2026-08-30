import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';

const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');

function browserHarness() {
  const MTG = { ...loadEngine() };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    querySelector() { return null; },
    createElement(tagName) {
      return {
        tagName, className: '', innerHTML: '', children: [],
        appendChild(child) { this.children.push(child); return child; },
      };
    },
  };
  const window = { addEventListener() {} };
  const sandbox = {
    MTG, document, window, console, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} },
  };
  runInNewContext(uiSource, sandbox);
  runInNewContext(mainSource, sandbox);
  const ui = new MTG.UI();
  const game = new MTG.Game({ seed: 9001, paced: false, maxTurns: 5 });
  const human = game.addPlayer('You', { name: 'Poison UI test' }, null, false);
  const bot = game.addPlayer('Local bot', { name: 'Poison UI test' }, null, true);
  game.turnPlayer = human;
  ui.game = game;
  ui.me = human;
  window._game = game;
  window._ui = ui;
  return { MTG, game, human, bot, ui, window };
}

function markup(node) {
  return `${node.innerHTML || ''}${(node.children || []).map(markup).join('')}`;
}

test('poison HUD hides zero and shows an accessible separate /10 counter with danger thresholds', () => {
  const { ui } = browserHarness();
  for (const poison of [undefined, 0, -1, NaN, Infinity]) {
    assert.equal(ui.poisonBadge({ poison }), '', `no badge for ${poison}`);
  }
  for (const poison of [1, 7, 8, 9, 10, 12]) {
    const html = ui.poisonBadge({ poison });
    assert.match(html, new RegExp(`<b>${poison}<i>/10</i></b>`));
    assert.match(html, /<small>POISON<\/small>/);
    assert.match(html, /role="img" aria-label="\d+ poison counters?\. 10 poison counters = loss\./);
    assert.equal(/class="poisonbadge danger/.test(html), poison >= 8);
    assert.equal(/class="poisonbadge danger lethal/.test(html), poison >= 10);
  }
  assert.match(uiSource, /this\.poisonBadge\(p\)/, 'opponent HUD uses the shared renderer');
  assert.match(uiSource, /this\.poisonBadge\(me\)/, 'human HUD uses the same renderer');
});

test('Player Details displays public poison amount and removal/loss semantics, then clears it at zero', () => {
  const { ui, game, human } = browserHarness();
  human.poison = 9;
  ui.playerSheet = human;
  const effects = ui.playerStatusEffects(game, human);
  const poison = effects.find(effect => effect.key === 'poison');
  assert.equal(poison.kind, 'counter');
  assert.equal(poison.label, 'Poison counters');
  assert.equal(poison.detail, '9/10 poison counters. 10 poison counters = loss. 1 more to the loss threshold.');
  assert.match(poison.duration, /until an effect removes them/);
  const sheet = markup(ui.renderPlayerSheet(game));
  assert.match(sheet, /Poison counters/);
  assert.match(sheet, /9\/10 poison counters/);
  assert.match(sheet, /10 poison counters = loss/);
  human.poison = 0;
  assert.equal(ui.playerStatusEffects(game, human).some(effect => effect.key === 'poison'), false);
  assert.doesNotMatch(markup(ui.renderPlayerSheet(game)), /Poison counters/);
});

for (const recipient of ['human', 'bot']) {
  test(`${recipient}: actual infect damage updates life-independent HUD, public text state, and details`, async () => {
    const { MTG, game, human, bot, ui, window } = browserHarness();
    const defender = recipient === 'human' ? human : bot;
    const attacker = recipient === 'human' ? bot : human;
    const source = new MTG.CardInst(MTG.DEFS['Plague Stinger'], attacker);
    source.zone = 'battlefield';
    source.ctrl = attacker;
    game.battlefield.push(source);
    game.recalc();
    let state = JSON.parse(window.render_game_to_text());
    assert.deepEqual(state.players.map(player => player.poison), [0, 0]);
    await game.damagePlayer(source, defender, 9, { combat: true });
    assert.equal(defender.life, 40, 'infect does not subtract life');
    assert.equal(defender.poison, 9);
    assert.match(ui.poisonBadge(defender), /class="poisonbadge danger"/);
    state = JSON.parse(window.render_game_to_text());
    const visible = state.players.find(player => player.name === defender.name);
    assert.equal(visible.poison, 9);
    assert.equal(visible.life, 40);
    assert.match(visible.activeEffects.find(effect => effect.label === 'Poison counters').detail, /9\/10/);
    assert.equal(state.players.find(player => player.isAI).hand, undefined, 'public poison must not expose a bot hand');
    ui.playerSheet = defender;
    assert.match(markup(ui.renderPlayerSheet(game)), /9\/10 poison counters/);
  });
}
