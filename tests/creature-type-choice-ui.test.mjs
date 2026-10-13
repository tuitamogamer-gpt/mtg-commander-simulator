import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';

const engine = loadEngine();
const source = readFileSync(process.env.MTG_UI_SOURCE_PATH || new URL('../src/modules/ui.js', import.meta.url), 'utf8');
function harness() {
  const M = {...engine};
  const document = {readyState: 'loading', addEventListener() {}, querySelector() {return null;}, createElement(tagName) {
    const node = {tagName, children: [], dataset: {}, attributes: {}, listeners: {}, innerHTML: '', value: '',
      style: {setProperty() {}}, appendChild(child) {this.children.push(child); return child;},
      replaceChildren(...children) {this.children = children;}, setAttribute(key, value) {this.attributes[key] = value;},
      addEventListener(type, fn) {this.listeners[type] = fn;}, querySelectorAll() {return [];}};
    node.classList = {add(...names) {node.className = `${node.className || ''} ${names.join(' ')}`;},
      contains(name) {return (node.className || '').split(/\s+/).includes(name);}};
    return node;
  }};
  runInNewContext(source, {MTG: M, document, window: {addEventListener() {}}, console, setTimeout, clearTimeout,
    localStorage: {getItem() {return null;}, setItem() {}}});
  const game = new M.Game({seed: 10132026, paced: false});
  const human = game.addPlayer('You', {name: 'Native type choice'}, null, false);
  game.addPlayer('Other', {name: 'Native type choice'}, {decide: async () => ({kind: 'pass'})}, true);
  game.turnPlayer = human; game.turnNo = 6; game.phase = 'main1'; game.step = 'main';
  const ui = new M.UI();
  Object.assign(ui, {game, me: human, prioMode: 'off', render() {this.view = this.renderDecisionModal(game);}});
  human.controller = ui.controllerFor(human);
  return {M, game, human, ui};
}
const nodes = root => root ? [root, ...(root.children || []).flatMap(nodes)] : [];
const search = ui => nodes(ui.view).find(node => node.type === 'search');
const options = ui => nodes(ui.view).filter(node => node.tagName === 'button' && node.dataset.choiceKey);
const status = ui => nodes(ui.view).find(node => node.attributes.role === 'status');
const input = (node, value) => {node.value = value; node.listeners.input({});};
const enter = node => {let prevented = false; node.listeners.keydown({key: 'Enter', preventDefault() {prevented = true;}}); return prevented;};

test('native Throne entry remains searchable across redraws, supports keyboard choice and retains every legal type', async t => {
  const {M, game, human, ui} = harness();
  const throne = new M.CardInst(M.DEFS['Roaming Throne'], human);
  throne.zone = 'hand'; human.hand.push(throne);
  const entering = game.move(throne, 'battlefield', {ctrl: human});
  for (let n = 0; n < 30 && !ui.pending; n++) await new Promise(resolve => setImmediate(resolve));
  const pd = ui.pending;
  t.after(() => {if (ui.pending === pd) ui.resolvePendingEntry(pd, 'Ninja');});
  assert.equal(pd.q.aiHint.kind, 'chooseType');
  assert.equal(pd.q.options.length, M.CREATURE_SUBTYPES.size);
  assert.equal(search(ui)?.attributes['aria-label'], 'Creature type');
  assert.equal(options(ui).length, 50, 'bounded initial DOM does not remove choices from the rules query');
  input(search(ui), 'not-a-creature-type');
  assert.equal(options(ui).length, 0);
  assert.match(status(ui).textContent, /No creature types match/);
  assert.equal(enter(search(ui)), false);
  assert.equal(ui.pending, pd);
  input(search(ui), 'dra');
  assert.ok(options(ui).length > 1);
  assert.equal(enter(search(ui)), false, 'an ambiguous search never chooses a type for the player');
  input(search(ui), '  nInJa  ');
  ui.render();
  assert.equal(search(ui).value, '  nInJa  ');
  assert.equal(options(ui).length, 1);
  assert.equal(options(ui)[0].dataset.choiceKey, 'Ninja');
  assert.equal(status(ui).attributes['aria-live'], 'polite');
  assert.equal(enter(search(ui)), true);
  await entering;
  assert.equal(throne.meta.cslType, 'Ninja');
  assert.equal(throne.hasSub('Ninja'), true);
  assert.equal(throne.power, 4);
  assert.equal(throne.zoneVersion, 1);
  assert.equal(ui.pending, null);
});

test('existing card-name search keeps its label and rejects a stale click after a later choice opens', async () => {
  const {game, human, ui} = harness();
  const first = human.controller.decide(game, {type: 'chooseOption', searchableChoices: true,
    options: [{key: 'Lightning Bolt', label: 'Lightning Bolt'}, {key: 'Counterspell', label: 'Counterspell'}]});
  assert.equal(search(ui).attributes['aria-label'], 'Card name');
  input(search(ui), 'counter');
  ui.render();
  assert.equal(search(ui).value, 'counter');
  const oldButton = options(ui)[0];
  oldButton.onclick();
  assert.equal(await first, 'Counterspell');
  const next = human.controller.decide(game, {type: 'chooseOption', options: [{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No'}]});
  const pending = ui.pending;
  oldButton.onclick();
  assert.equal(ui.pending, pending, 'the earlier search result cannot answer the next decision');
  ui.resolvePendingEntry(pending, 'no');
  assert.equal(await next, 'no');
});

test('a short creature-type choice retains its direct buttons', async () => {
  const {game, human, ui} = harness();
  const answer = human.controller.decide(game, {type: 'chooseOption', aiHint: {kind: 'creatureType'},
    options: [{key: 'Ninja', label: 'Ninja'}, {key: 'Dragon', label: 'Dragon'}]});
  assert.equal(search(ui), undefined);
  assert.deepEqual(options(ui).map(node => node.dataset.choiceKey), ['Ninja', 'Dragon']);
  options(ui)[0].onclick();
  assert.equal(await answer, 'Ninja');
});
