import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionTable, button, M} from './helpers/ui-decision-fixtures.mjs';

function keyboard(node, key) {
  const event = {target: node, key, preventDefault() {this.prevented = true;}, stopPropagation() {this.stopped = true;}};
  node.onkeydown?.(event);
  return event;
}
function input(node, value) {node.value = value; node.oninput?.({target: node});}
function html(root) {return [root, ...root.descendants()].map(node => node.innerHTML || '').join('\n');}
function zones(f, state) {
  f.ui.zoneBrowse = state;
  f.ui.renderArena = function () {
    f.root.replaceChildren();
    if (this.sheet) f.root.appendChild(this.renderCardSheet(f.game));
    else if (this.zoneBrowse) f.root.appendChild(this.renderZoneBrowser(f.game));
  };
  f.ui.render();
}

test('card choices support keyboard toggles, selected states, and an initially disabled confirmation', async () => {
  const f = decisionTable(), cards = [f.put('Sol Ring', 'hand'), f.put('Mountain', 'hand')];
  const answer = f.me.controller.decide(f.game, {type: 'chooseCards', from: cards, min: 1, max: 1});
  assert.equal(button(f, /^Confirm/).disabled, true);
  const first = f.root.querySelector('.bigcard');
  assert.equal(first.getAttribute('role'), 'button');
  assert.equal(first.getAttribute('tabindex'), '0');
  assert.equal(first.getAttribute('aria-pressed'), 'false');
  assert.equal(keyboard(first, ' ').prevented, true);
  assert.equal(f.root.querySelector('.bigcard').getAttribute('aria-pressed'), 'true');
  assert.equal(button(f, /^Confirm/).disabled, false);
  button(f, /^Confirm/).click();
  assert.deepEqual([...await answer], [cards[0]]);
});

test('a detached card selection cannot mutate the next decision', async () => {
  const f = decisionTable(), card = f.put('Sol Ring', 'hand');
  const first = f.me.controller.decide(f.game, {type: 'chooseCards', from: [card], min: 0, max: 1});
  const old = f.root.querySelector('.bigcard'); button(f, /^Confirm/).click(); await first;
  const second = f.me.controller.decide(f.game, {type: 'chooseCards', from: [card], min: 0, max: 1});
  old.click(); keyboard(old, 'Enter');
  assert.deepEqual([...f.ui.pending.sel], []);
  button(f, /^Confirm/).click(); await second;
});

test('scry destination is a separate named button and ordering cannot toggle its destination', async () => {
  const f = decisionTable(), cards = [f.put('Sol Ring', 'library'), f.put('Mountain', 'library')];
  const answer = f.me.controller.decide(f.game, {type: 'scry', cards});
  const destinations = f.root.querySelectorAll('.scry-destination');
  assert.match(destinations[0].getAttribute('aria-label'), /Sol Ring: top. Move to bottom/);
  destinations[0].onclick({stopPropagation() {}});
  assert.equal(f.root.querySelector('.scry-destination').getAttribute('aria-pressed'), 'false');
  const later = f.root.querySelectorAll('button').find(node => node.getAttribute('aria-label') === 'Move Sol Ring later');
  later.onclick({stopPropagation() {}});
  assert.equal(f.ui.pending.scryState[0], 'bottom');
  assert.equal(f.ui.pending.scryOrder[1], cards[0]);
  button(f, /^Confirm/).click();
  const result = await answer;
  assert.deepEqual([...result.top], [cards[1]]); assert.deepEqual([...result.bottom], [cards[0]]);
});

test('X entry rejects empty, fractional, out-of-range, and unsafe values while retaining the question', async () => {
  const f = decisionTable();
  const answer = f.me.controller.decide(f.game, {type: 'chooseX', min: 0, max: 120, suggested: 3});
  const field = f.root.querySelector('.xinput'), pending = f.ui.pending;
  for (const value of ['', '-1', '121', '3.5', 'Infinity', '9007199254740992']) {
    input(field, value);
    assert.equal(field.getAttribute('aria-invalid'), 'true', value);
    assert.equal(button(f, /^Confirm X/).disabled, true);
    keyboard(field, 'Enter'); assert.equal(f.ui.pending, pending);
  }
  input(field, '96');
  assert.equal(field.getAttribute('aria-invalid'), 'false');
  assert.equal(f.ui.pending.xVal, 96);
  keyboard(field, 'Enter'); assert.equal(await answer, 96);
});

test('X entry enforces a sparse legal-value list and updates the displayed total for repeated X costs', async () => {
  const f = decisionTable();
  const answer = f.me.controller.decide(f.game, {type: 'chooseX', min: 0, max: 9, values: [0, 3, 9], cost: M.parseCost('{1}{X}{X}{R}')});
  const field = f.root.querySelector('.xinput');
  input(field, '4'); assert.equal(button(f, /^Confirm X/).disabled, true);
  input(field, '9'); assert.equal(button(f, /^Confirm X=9/).disabled, false);
  assert.match(f.root.querySelector('.manapickhint').textContent, /2 × 9 = 18 mana/);
  button(f, /^Confirm X=9/).click(); assert.equal(await answer, 9);
});

test('a detached X input cannot change or submit the next question', async () => {
  const f = decisionTable();
  const first = f.me.controller.decide(f.game, {type: 'chooseX', min: 0, max: 5});
  const old = f.root.querySelector('.xinput'); button(f, /^Confirm X/).click(); await first;
  const second = f.me.controller.decide(f.game, {type: 'chooseX', min: 0, max: 30});
  const current = f.ui.pending;
  input(old, '4'); keyboard(old, 'Enter');
  assert.equal(f.ui.pending, current); assert.equal(current.xVal, 0);
  button(f, /^Confirm X/).click(); await second;
});

test('zone search, type filters, and sorting leave the engine zone order unchanged', () => {
  const f = decisionTable(), cards = [f.put('Sol Ring', 'graveyard'), f.put('Mountain', 'graveyard'), f.put('Colossal Dreadmaw', 'graveyard')];
  zones(f, {player: f.me, zone: 'graveyard'});
  const search = f.root.querySelector('.zonebrowsersearch');
  input(search, 'trample'); assert.equal(f.root.querySelectorAll('.bigcard').length, 1);
  assert.equal(f.root.querySelector('.bigcard').dataset.cardName, 'Colossal Dreadmaw');
  input(search, '');
  const sort = f.root.querySelector('.zonebrowsersort'); sort.value = 'name'; sort.onchange();
  assert.deepEqual(f.root.querySelectorAll('.bigcard').map(node => node.dataset.cardName), ['Colossal Dreadmaw', 'Mountain', 'Sol Ring']);
  const filter = f.root.querySelector('.zonebrowserfilter'); filter.value = 'land'; filter.onchange();
  assert.equal(f.root.querySelector('.bigcard').dataset.cardName, 'Mountain');
  assert.deepEqual([...f.me.graveyard], cards);
});

test('a zone filter with no matches has an actionable empty state', () => {
  const f = decisionTable(); f.put('Sol Ring', 'exile'); zones(f, {player: f.me, zone: 'exile'});
  input(f.root.querySelector('.zonebrowsersearch'), 'missing card');
  assert.match(f.root.textContent, /No matching cards/);
  button(f, 'Clear filters').click();
  assert.equal(f.root.querySelectorAll('.bigcard').length, 1);
  assert.equal(f.ui.zoneBrowse.query, '');
});

test('search and sorting cannot inspect the identity or mana value of an unknown face-down exile card', () => {
  const f = decisionTable(), hidden = f.put('Sol Ring', 'exile', f.rival);
  hidden.faceDown = true;
  hidden.meta.faceDownDef = hidden.def;
  zones(f, {player: f.rival, zone: 'exile'});
  assert.equal(f.root.querySelector('.bigcard').dataset.cardName, 'Face-down card');
  assert.equal(html(f.root).includes('Sol Ring'), false);
  input(f.root.querySelector('.zonebrowsersearch'), 'Sol Ring');
  assert.equal(f.root.querySelectorAll('.bigcard').length, 0);
  input(f.root.querySelector('.zonebrowsersearch'), '');
  const filter = f.root.querySelector('.zonebrowserfilter'); filter.value = 'noncreature'; filter.onchange();
  assert.equal(f.root.querySelectorAll('.bigcard').length, 0);
});

test('an attempted private-zone browser reads only the public count', () => {
  const f = decisionTable();
  const hiddenZone = new Proxy({}, {get(_target, key) {if (key === 'length') return 7; throw Error('Private identity was accessed: ' + String(key));}});
  f.rival.hand = hiddenZone;
  zones(f, {player: f.rival, zone: 'hand'});
  assert.match(f.root.textContent, /7 hidden cards/);
  assert.equal(f.root.querySelector('.zonebrowsersearch'), null);
  assert.equal(f.root.querySelector('.bigcard'), null);
});

test('inspecting a zone card keeps search state and returns without answering a decision', () => {
  const f = decisionTable(); const card = f.put('Sol Ring', 'graveyard');
  const pending = {q: {type: 'chooseCards'}, sel: []}; f.ui.pendings = [pending];
  const state = {player: f.me, zone: 'graveyard', query: 'ring', sort: 'name'};
  zones(f, state);
  f.root.querySelector('.bigcard').click();
  assert.equal(f.ui.sheet.card, card); assert.equal(f.ui.pending, pending);
  button(f, '← Back to cards').click();
  assert.equal(f.ui.zoneBrowse, state); assert.equal(f.ui.sheet, null); assert.equal(f.ui.pending, pending);
  assert.equal(f.root.querySelector('.zonebrowsersearch').value, 'ring');
});

test('manual mana sources announce their selected state and stale rows cannot toggle a later payment', async () => {
  const f = decisionTable(), land = f.put('Mountain');
  f.game.manualManaSelectionSolution = (_player, _cost, _spell, selected) => selected.length === 1;
  const q = {type: 'chooseManaSources', player: f.me, cost: M.parseCost('{1}'), sources: [], candidates: [land], suggested: [land]};
  const first = f.me.controller.decide(f.game, q);
  const old = f.root.querySelector('.manasourcerow');
  assert.equal(old.getAttribute('aria-pressed'), 'true');
  assert.equal(f.root.querySelector('.manavalid').getAttribute('role'), 'status');
  old.click(); assert.equal(f.root.querySelector('.manasourcerow').getAttribute('aria-pressed'), 'false');
  assert.equal(button(f, 'Tap selected sources ✓').disabled, true);
  button(f, 'Use automatic mana this time').click(); await first;
  const second = f.me.controller.decide(f.game, {...q, suggested: []});
  old.click(); assert.equal(f.ui.pending.sel.length, 0);
  f.root.querySelector('.manasourcerow').click(); button(f, 'Tap selected sources ✓').click();
  assert.deepEqual([...(await second).cards], [land]);
});

test('the game log searches public events and groups their turn without changing the source log', () => {
  const f = decisionTable();
  f.game.log = [{t: 2, msg: 'Opponent played Mountain', cls: ''}, {t: 3, msg: 'You cast Sol Ring', cls: ''}, {t: 3, msg: 'Opponent drew a card', cls: ''}];
  const original = [...f.game.log];
  f.ui.showLog = true;
  f.root.replaceChildren(f.ui.renderLog(f.game));
  assert.deepEqual(f.root.querySelectorAll('.logturn').map(node => node.textContent), ['Turn 3', 'Turn 2']);
  input(f.root.querySelector('.logsearch'), 'Sol Ring');
  assert.equal(f.root.querySelectorAll('.logline').length, 1);
  assert.match(f.root.textContent, /You cast Sol Ring/);
  assert.deepEqual(f.game.log, original);
});

test('enlarging card art is presentation-only and keeps a hidden face concealed', () => {
  const f = decisionTable(), card = f.put('Colossal Dreadmaw', 'exile', f.rival);
  card.faceDown = true; card.meta.faceDownDef = card.def;
  const pending = {q: {type: 'cardReveal', libraryReveal: true}, sel: []};
  f.ui.pendings = [pending];
  f.ui.sheet = {card, returnReveal: String(card.iid)};
  f.ui.renderArena = function () {f.root.replaceChildren(); if (this.sheet) f.root.appendChild(this.renderCardSheet(f.game));};
  f.ui.render();
  const sheet = f.ui.sheet;
  button(f, 'Enlarge card').click();
  assert.equal(f.ui.sheet, sheet); assert.equal(f.ui.sheet.artExpanded, true); assert.equal(f.ui.pending, pending);
  assert.equal(f.root.querySelector('.cardinspection').classList.contains('sheetart-expanded'), true);
  assert.equal(button(f, 'Compact view').getAttribute('aria-pressed'), 'true');
  assert.equal(html(f.root).includes('Colossal Dreadmaw'), false);
  assert.equal(html(f.root).includes('6/6'), false, 'a hidden exile card cannot reveal printed creature stats');
  const oldToggle = button(f, 'Compact view'); oldToggle.click();
  assert.equal(f.ui.sheet.artExpanded, false); assert.equal(f.ui.pending, pending);
  f.ui.closeCardInspection(); oldToggle.click();
  assert.equal(f.ui.sheet, null); assert.equal(f.ui.pending, pending);
});
