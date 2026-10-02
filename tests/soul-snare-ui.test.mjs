import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';

const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');

function browserHarness() {
  const MTG = { ...loadEngine() };
  const document = {
    readyState: 'loading',
    addEventListener() {},
    querySelector() { return null; },
    createElement(tagName) {
      const node = {
        tagName, className: '', innerHTML: '', children: [], dataset: {}, attributes: {},
        style: { setProperty() {} },
        appendChild(child) { this.children.push(child); return child; },
        prepend(child) { this.children.unshift(child); },
        insertAdjacentHTML(position, html) {
          assert.equal(position, 'beforeend');
          this.children.push({ innerHTML: html, children: [] });
        },
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
    MTG, document, window: { addEventListener() {} }, console, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} },
  });
  const ui = new MTG.UI();
  const game = new MTG.Game({ seed: 61002, paced: false, maxTurns: 5 });
  const human = game.addPlayer('You', { name: 'Soul Snare UI test' }, null, false);
  const bot = game.addPlayer('Local bot', { name: 'Soul Snare UI test' }, null, true);
  game.turnPlayer = bot;
  game.phase = 'combat';
  game.step = 'blockers';
  ui.game = game;
  ui.me = human;
  ui.prioMode = 'end';
  ui.render = () => {};
  ui.scrollPromptIntoView = () => {};
  human.controller = ui.controllerFor(human);
  const permanent = (name, owner = human) => {
    const card = new MTG.CardInst(MTG.DEFS[name], owner);
    card.zone = 'battlefield';
    game.battlefield.push(card);
    game.recalc();
    return card;
  };
  const source = permanent('Soul Snare');
  const attacker = permanent('Serra Angel', bot);
  attacker.attacking = human;
  game.combat = { attackers: [attacker], blockersDeclared: true };
  human.pool.W = 1;
  ui.sheet = { card: source };
  return { MTG, game, human, bot, ui, source, attacker, permanent };
}

function descendants(node) {
  return [node, ...(node.children || []).flatMap(descendants)];
}

function markup(node) {
  return `${node.innerHTML || ''}${node.textContent || ''}${(node.children || []).map(markup).join('')}`;
}

function abilityButton(sheet) {
  return descendants(sheet).find(node => node.tagName === 'button' &&
    node.className.split(/\s+/).includes('abilitybtn') && !node.disabled);
}

test('Soul Snare can submit its legal activation directly from a combat reaction card sheet', async () => {
  const { game, human, ui, source } = browserHarness();
  const response = game.askPriorityAction(human);
  const reaction = ui.react;
  assert.equal(reaction?.q.type, 'priority');
  assert.equal(ui.pending, null);
  const entry = reaction.q.acts.find(entry => entry.card === source);
  assert.ok(entry, 'the real priority question offers Soul Snare');
  const button = abilityButton(ui.renderCardSheet(game));
  assert.ok(button, 'the reaction sheet exposes the legal activation');
  button.onclick();
  const action = await response;
  assert.equal(action.kind, 'activate');
  assert.equal(action.entry, entry);
  assert.equal(ui.react, null);
  assert.equal(ui.pending, null);
  assert.equal(ui.sheet, null);
  assert.equal(source.zone, 'battlefield', 'the UI submits the action for the engine to validate');
  assert.equal(human.pool.W, 1);
  button.onclick();
  assert.equal(ui.pending, null, 'a second click cannot create another decision');
});

test('Live reaction actions retain their projected activation token', async () => {
  const { game, human, ui, source } = browserHarness();
  game.onlinePresentation = true;
  const entry = { card: source, ability: { label: 'Sacrifice: exile an attacker' },
    token: 'activate:soul-snare:0' };
  const response = human.controller.decide(game, {
    type: 'priority', acts: [entry], casts: [], autoPass: { end: false },
  });
  const sheet = ui.renderCardSheet(game);
  assert.equal(descendants(sheet).filter(node => node.tagName === 'button' &&
    node.className.split(/\s+/).includes('abilitybtn')).length, 1,
  'projected labels do not duplicate the printed ability as unavailable');
  abilityButton(sheet).onclick();
  const action = await response;
  assert.equal(action.entry, entry);
  assert.equal(action.entry.token, 'activate:soul-snare:0');
  assert.equal(ui.react, null);
  assert.equal(ui.pending, null);
});

test('blocker selection explains the next response window without allowing an activation', () => {
  const { game, ui, source } = browserHarness();
  let resolutions = 0;
  const decision = { q: { type: 'blockers' }, resolve() { resolutions++; } };
  ui.pending = decision;
  const sheet = ui.renderCardSheet(game);
  assert.match(markup(sheet), /Confirm blockers first/);
  assert.match(markup(sheet), /response window before combat damage/);
  assert.equal(abilityButton(sheet), undefined);
  assert.equal(ui.pending, decision);
  assert.equal(resolutions, 0);
  assert.equal(source.zone, 'battlefield');
});

test('a reaction sheet only exposes abilities offered by the current legal question', () => {
  const { game, ui } = browserHarness();
  ui.react = { q: { type: 'priority', acts: [], casts: [] }, resolve() {} };
  const sheet = ui.renderCardSheet(game);
  assert.equal(abilityButton(sheet), undefined);
  assert.match(markup(sheet), /unavailable now/);
});

test('a stale reaction sheet cannot resolve a newer blocker decision', () => {
  const { game, ui, source } = browserHarness();
  let reactionResolutions = 0, blockerResolutions = 0;
  const reaction = { q: { type: 'priority', acts: [{ card: source,
    ability: source.def.abilities[0] }], casts: [] }, resolve() { reactionResolutions++; } };
  ui.react = reaction;
  const button = abilityButton(ui.renderCardSheet(game));
  assert.ok(button);
  const blockers = { q: { type: 'blockers' }, resolve() { blockerResolutions++; } };
  ui.pending = blockers;
  button.onclick();
  assert.equal(ui.pending, blockers);
  assert.equal(ui.react, reaction);
  assert.equal(reactionResolutions, 0);
  assert.equal(blockerResolutions, 0);
});

test('the blocker timing hint is limited to your battlefield cards with abilities', () => {
  const { game, ui, bot, permanent } = browserHarness();
  ui.pending = { q: { type: 'blockers' }, resolve() {} };
  for (const card of [permanent('Soul Snare', bot), permanent('Serra Angel')]) {
    ui.sheet = { card };
    assert.doesNotMatch(markup(ui.renderCardSheet(game)), /Confirm blockers first/);
  }
});
