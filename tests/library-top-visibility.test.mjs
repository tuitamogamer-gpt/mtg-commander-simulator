import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';

function fixture() {
  const MTG = { ...loadEngine() }, window = { addEventListener() {} };
  const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; } };
  const sandbox = { MTG, window, document, console, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} } };
  for (const module of ['ui', 'main']) runInNewContext(readFileSync(new URL(`../src/modules/${module}.js`, import.meta.url), 'utf8'), sandbox);
  const game = new MTG.Game({ seed: 90490, paced: false });
  const controller = { decide: async (_g, q) => q.type === 'chooseTargets' ? q.candidates.slice(0, q.min ?? 1)
    : q.type === 'priority' ? { kind: 'pass' } : q.type === 'chooseCards' ? q.from.slice(0, q.min ?? 0) : null };
  const human = game.addPlayer('You', { name: 'Reveal test' }, controller, false);
  const bot = game.addPlayer('Local bot', { name: 'Reveal test' }, null, true);
  bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  game.turnPlayer = human; game.turnNo = 5; game.phase = 'main1'; game.step = 'main'; game.priorityRound = async () => {};
  const ui = new MTG.UI(); ui.me = human; ui.game = game; window._ui = ui; window._game = game;
  const put = (name, player, zone = 'battlefield') => {
    const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
    game.recalc(); return card;
  };
  for (const p of [human, bot]) { put('Divination', p, 'library'); put('Forest', p, 'library'); }
  const state = p => JSON.parse(window.render_game_to_text()).players.find(row => row.name === p.name);
  return { MTG, game, human, bot, ui, put, state };
}

for (const role of ['human', 'local-ai']) test(`${role}: paid Oracle of Mul Daya reveals its controller's top to the human and text state until Lignify removes the ability`, async () => {
  const { game, human, bot, ui, put, state } = fixture(), owner = role === 'human' ? human : bot;
  const oracle = put('Oracle of Mul Daya', owner, 'hand');
  Object.assign(owner.pool, { C: 3, G: 1 }); game.turnPlayer = owner;
  assert.equal(await game.castSpell(owner, oracle, { from: 'hand' }), true); assert.equal(game.stack.at(-1).manaSpent, 4);
  await game.resolveTop();
  assert.equal(oracle.def.revealAllTop, true);
  assert.equal(ui.visibleLibraryTop(game, owner).name, 'Forest'); assert.equal(state(owner).visibleLibraryTop.name, 'Forest');
  assert.equal(state(owner === human ? bot : human).visibleLibraryTop, undefined, 'only the source controller reveals a top card');
  if (owner === bot) assert.equal(state(bot).hand, undefined, 'public top is not permission to inspect the opponent hand');
  await game.draw(owner, 1);
  assert.equal(ui.visibleLibraryTop(game, owner).name, 'Divination'); assert.equal(state(owner).visibleLibraryTop.name, 'Divination');
  const lignify = put('Lignify', human, 'hand'); game.turnPlayer = human;
  Object.assign(human.pool, { C: 1, G: 1 });
  assert.equal(await game.castSpell(human, lignify, { from: 'hand' }), true); await game.resolveTop();
  assert.equal(oracle.cur.abilitiesDisabled, true);
  assert.equal(ui.visibleLibraryTop(game, owner), null); assert.equal(state(owner).visibleLibraryTop, undefined);
  await game.move(lignify, 'graveyard');
  assert.equal(ui.visibleLibraryTop(game, owner).name, 'Divination'); assert.equal(state(owner).visibleLibraryTop.name, 'Divination');
});

for (const name of ['Realmwalker', 'Augur of Autumn', 'Summoning Materia', "Fortune Teller's Talent", 'Thundermane Dragon']) {
  test(`${name}: private top remains controller-only in both UI visibility and text serialization`, () => {
    const { game, human, bot, ui, put, state } = fixture(), source = put(name, bot);
    assert.equal(source.def.revealOwnTop, true); assert.equal(!!source.def.revealAllTop, false);
    assert.equal(ui.visibleLibraryTop(game, bot), null); assert.equal(state(bot).visibleLibraryTop, undefined);
    ui.me = bot;
    assert.equal(ui.visibleLibraryTop(game, bot).name, 'Forest'); assert.equal(state(bot).visibleLibraryTop.name, 'Forest');
    source.cur.abilitiesDisabled = true;
    assert.equal(ui.visibleLibraryTop(game, bot), null); assert.equal(state(bot).visibleLibraryTop, undefined);
    source.cur.abilitiesDisabled = false; source.ctrl = human; game.recalc();
    assert.equal(ui.visibleLibraryTop(game, bot), null, 'control change removes the previous controller permission');
    ui.me = human;
    assert.equal(ui.visibleLibraryTop(game, human).name, 'Forest'); assert.equal(state(human).visibleLibraryTop.name, 'Forest');
  });
}

test('an empty publicly revealed library exposes no card or stale previous top', async () => {
  const { game, bot, ui, put, state } = fixture(); put('Oracle of Mul Daya', bot);
  for (const card of bot.library.slice()) await game.move(card, 'hand');
  assert.equal(ui.visibleLibraryTop(game, bot), null); assert.equal(state(bot).visibleLibraryTop, undefined);
});
