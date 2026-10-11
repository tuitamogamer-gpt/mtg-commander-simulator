import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const uiSource = readFileSync(process.env.MTG_UI_SOURCE_PATH || new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const engine = loadEngine();
const {createMobileCombat} = await import(process.env.MTG_MOBILE_SOURCE_PATH || new URL('../src/modules/mobile-combat.js', import.meta.url));

function harness() {
  const MTG = {...engine};
  const document = {
    readyState: 'loading', addEventListener() {}, querySelector() { return null; },
    createElement(tagName) {
      const node = {
        tagName, className: '', innerHTML: '', children: [], dataset: {}, attributes: {},
        style: {setProperty() {}},
        appendChild(child) { this.children.push(child); return child; },
        append(...children) { children.forEach(child => this.appendChild(child)); },
        setAttribute(key, value) { this.attributes[key] = value; },
      };
      node.classList = {
        add(...names) { node.className += ` ${names.join(' ')}`; },
        contains(name) { return node.className.split(/\s+/).includes(name); },
      };
      return node;
    },
  };
  runInNewContext(uiSource, {
    MTG, document, window: {addEventListener() {}}, console, setTimeout, clearTimeout,
    localStorage: {getItem() { return null; }, setItem() {}},
  });
  const game = new MTG.Game({seed: 10112525, paced: false});
  const human = game.addPlayer('You', {name: 'Throne entry preview'}, null, false);
  const defender = game.addPlayer('AI Wolf', {name: 'Throne entry preview'}, null, true);
  game.turnPlayer = human;
  game.turnNo = 6;
  game.phase = 'combat';
  game.step = 'blockers';
  game.combat = {attackers: [], defenders: new Map()};
  const ui = new MTG.UI();
  ui.game = game;
  ui.me = human;
  const handCard = name => {
    const card = new MTG.CardInst(MTG.DEFS[name], human);
    card.zone = 'hand';
    human.hand.push(card);
    return card;
  };
  return {game, human, defender, ui, handCard, document, MTG};
}

function descendants(node) {
  return [node, ...(node.children || []).flatMap(descendants)];
}

function preview(ui, game) {
  const nodes = descendants(ui.renderCenter(game));
  return {
    attackers: nodes.filter(node => node.className.split(/\s+/).includes('combatunit')),
    damage: nodes.find(node => node.className.split(/\s+/).includes('combatdefender'))?.innerHTML,
  };
}

function mobileHistory(ui, game, document) {
  const root = document.createElement('div');
  return descendants(createMobileCombat(ui, game, root, null))
    .filter(node => node.className.split(/\s+/).includes('ct-mobile-combat-matchup'));
}

test('attacking Throne copy waits for its entry choice without breaking combat views, then contributes its damage', {timeout: 15_000}, async t => {
  const {game, human, defender, ui, handCard, document, MTG} = harness();
  const previousDocument = globalThis.document, previousMTG = globalThis.MTG;
  globalThis.document = document;
  globalThis.MTG = MTG;
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousMTG === undefined) delete globalThis.MTG; else globalThis.MTG = previousMTG;
  });
  let resolveChoice, choiceQuestion;
  const choiceReady = new Promise(resolve => { choiceQuestion = resolve; });
  human.controller = {decide: async (_game, q) => {
    assert.equal(q.type, 'chooseOption');
    assert.equal(q.aiHint?.kind, 'chooseType');
    if (!q.aiHint.src.isToken) return 'Dragon';
    return new Promise(resolve => {
      resolveChoice = resolve;
      choiceQuestion(q);
    });
  }};
  t.after(() => resolveChoice?.('Ninja'));

  // Native zone transitions establish both completed attackers, and the same
  // native token-copy path supplies the unfinished tapped-and-attacking token.
  const throne = handCard('Roaming Throne');
  const dragon = handCard('Colossal Dreadmaw');
  for (const card of [throne, dragon]) await game.move(card, 'battlefield', {ctrl: human, tapped: true, attacking: defender});
  const before = preview(ui, game);
  assert.equal(before.attackers.length, 2);
  assert.match(before.damage, /2 attackers.*up to 10 damage/);
  assert.deepEqual(mobileHistory(ui, game, document).map(node => node.dataset.attackerId),
    [throne, dragon].map(card => String(card.iid)), 'mobile history shows the completed attackers');

  const copying = game.copyPermanentToken(throne, human, {tapped: true, attacking: defender});
  const q = await choiceReady;
  const token = q.aiHint.src;
  assert.equal(q.prompt, 'Roaming Throne: choose a creature type');
  assert.ok(q.options.some(option => option.key === 'Ninja'));
  assert.equal(token.isToken, true);
  assert.equal(token.zone, 'battlefield');
  assert.equal(token.attacking, defender);
  assert.equal(token.cur, null, 'the native entry replacement has not finished');
  assert.ok(game.battlefield.includes(token));
  assert.ok(game.combat.attackers.includes(token));
  assert.equal(game.bf().includes(token), false);

  let waiting;
  assert.doesNotThrow(() => { waiting = preview(ui, game); }, 'the human entry choice must remain renderable');
  assert.equal(waiting.attackers.length, 2);
  assert.match(waiting.damage, /2 attackers.*up to 10 damage/);
  assert.deepEqual(waiting.attackers.map(node => node.innerHTML), before.attackers.map(node => node.innerHTML),
    'completed attackers retain their preview while the copy waits');
  let waitingMobile;
  assert.doesNotThrow(() => { waitingMobile = mobileHistory(ui, game, document); },
    'mobile combat remains renderable during the same native entry choice');
  assert.deepEqual(waitingMobile.map(node => node.dataset.attackerId), [throne, dragon].map(card => String(card.iid)),
    'mobile history waits for the new attacker to finish entering');

  resolveChoice('Ninja');
  const made = await copying;
  assert.equal(made.length, 1);
  assert.equal(made[0], token);
  assert.equal(token.meta.cslType, 'Ninja');
  assert.equal(token.hasSub('Ninja'), true);
  assert.equal(token.tapped, true);
  assert.equal(token.power, 4);
  assert.equal(token.toughness, 4);
  assert.ok(game.bf().includes(token));
  const complete = preview(ui, game);
  assert.equal(complete.attackers.length, 3);
  assert.match(complete.damage, /3 attackers.*up to 14 damage/);
  const completeMobile = mobileHistory(ui, game, document);
  assert.deepEqual(completeMobile.map(node => node.dataset.attackerId), [throne, dragon, token].map(card => String(card.iid)));
  const tokenRow = completeMobile.find(node => node.dataset.attackerId === String(token.iid));
  assert.ok(descendants(tokenRow).some(node => node.tagName === 'strong' && node.textContent === '4/4'),
    'mobile combat shows the copy’s final power and toughness after choosing Ninja');
  assertGameStateInvariants(game, 'Throne copy completed after its native creature-type choice');
});
