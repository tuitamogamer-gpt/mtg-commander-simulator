import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Exercise production palette callbacks and card visibility without loading the
// rules engine. Layout and native event dispatch are covered by browser checks.
function palette() {
  const document = {activeElement: null};
  class Element {
    constructor(tag) {
      this.tagName = tag; this.children = []; this.attributes = new Map(); this.dataset = {}; this.value = '';
      this.className = ''; this.style = {setProperty() {}};
      this.classList = {contains: name => this.className.split(' ').includes(name), toggle: (name, enabled) => {
        const names = new Set(this.className.split(' ').filter(Boolean));
        if (enabled) names.add(name); else names.delete(name); this.className = [...names].join(' ');
      }};
    }
    append(...children) {for (const child of children) {child.remove(); child.parent = this; this.children.push(child);}}
    appendChild(child) {this.append(child); return child;}
    remove() {if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null;}
    replaceChildren(...children) {for (const child of [...this.children]) child.remove(); this.append(...children);}
    get isConnected() {return this === document.body || !!this.parent?.isConnected;}
    get textContent() {return (this.text || '') + this.children.map(child => child.textContent).join('');}
    set textContent(value) {this.text = String(value);}
    setAttribute(key, value) {this.attributes.set(key, String(value));}
    getAttribute(key) {return this.attributes.get(key) ?? null;}
    insertAdjacentHTML(_position, html) {this.innerHTML = (this.innerHTML || '') + html;}
    descendants() {return this.children.flatMap(child => [child, ...child.descendants()]);}
    querySelectorAll(selector) {return this.descendants().filter(child => selector[0] === '.' ? child.classList.contains(selector.slice(1)) : child.tagName === selector);}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    focus() {for (let item = this; item; item = item.parent) if (item.inert) return; document.activeElement = this; this.onfocus?.();}
    click() {this.onclick?.({target: this});}
    scrollIntoView() {}
  }
  document.createElement = tag => new Element(tag);
  document.body = new Element('body'); document.activeElement = document.body;
  document.documentElement = new Element('html');
  const gameRoot = document.body.appendChild(new Element('div'));
  const trigger = gameRoot.appendChild(new Element('button')); trigger.className = 'commandbutton'; trigger.focus();
  document.querySelector = selector => selector === '#game' ? gameRoot : document.body.querySelector(selector);
  const U = {UI: class {}, DECKS: {}, cardArtHTML: card => `<img data-card="${card.iid}" alt="${card.name}">`};
  const sandbox = {document, MTG: U, localStorage: {getItem: () => null, setItem() {}}};
  for (const name of ['visuals', 'player-tools', 'arena-tools']) vm.runInNewContext(readFileSync(new URL(`../src/modules/${name}.js`, import.meta.url), 'utf8'), sandbox);
  const me = {name: 'You', hand: [], command: [], graveyard: [], exile: []};
  const opponent = {name: 'Raven', command: [], graveyard: [], exile: []};
  Object.defineProperty(opponent, 'hand', {get() {throw Error('private hand read');}});
  Object.defineProperty(opponent, 'library', {get() {throw Error('private library read');}});
  const game = {players: [me, opponent], stack: [], battlefield: [], bf() {return this.battlefield;}};
  const rendered = [], notices = [];
  const ui = Object.assign(new U.UI(), {game, me, render() {rendered.push(this.quickMenuOpen);}, toast: message => notices.push(message), openUtility: name => rendered.push(name)});
  const card = (name, owner = me, zone = 'hand', extra = {}) => ({iid: name, name, owner, ctrl: owner, zone, def: {types: ['Creature']}, ...extra});
  const find = selector => document.body.querySelector(selector);
  const search = value => {const input = find('.commandsearch'); input.value = value; input.oninput();};
  const key = (name, target = document.activeElement, extra = {}) => {
    const event = {key: name, target, preventDefault() {this.prevented = true;}, stopPropagation() {}, ...extra};
    find('.commandpalette').onkeydown(event); return event;
  };
  const results = () => document.body.querySelectorAll('.commandresult');
  return {U, ui, me, opponent, game, gameRoot, document, trigger, rendered, notices, card, find, search, key, results};
}

test('multiword command search finds settings aliases and routes card backs and playmats', () => {
  const f = palette(); f.ui.openCommandPalette();
  f.search('backs card');
  assert.equal(f.results().length, 1);
  assert.equal(f.results()[0].dataset.command, 'cardbacks');
  assert.match(f.results()[0].querySelector('.commandresulticon').innerHTML, /<svg.*icon-cards/);
  f.results()[0].click();
  assert.equal(f.ui.quickMenuOpen, 'cardbacks');
  assert.equal(f.gameRoot.inert, false);
  f.ui.openCommandPalette(); f.search('play mats'); f.key('Enter', f.find('.commandsearch'));
  assert.equal(f.ui.quickMenuOpen, 'playmats');
  f.ui.openCommandPalette(); f.search('motion accessibility');
  assert.equal(f.results()[0].dataset.command, 'settings');
});

test('search groups public cards separately and never reads private zones or renders concealed identities', () => {
  const f = palette();
  f.me.hand.push(f.card('Card of Dawn'));
  f.opponent.graveyard.push(f.card('Card of Ash', f.opponent, 'graveyard'));
  f.opponent.exile.push(f.card('Card of Secrets', f.opponent, 'exile', {meta: {foretold: true}}));
  f.game.battlefield.push(f.card('Card of Mystery', f.opponent, 'battlefield', {faceDown: true}));
  f.ui.openCommandPalette(); f.search('card');
  assert.deepEqual(f.document.body.querySelectorAll('.commandgrouphead').map(item => item.textContent.replace(/\d+$/, '')), ['Commands', 'Cards']);
  assert.deepEqual(f.results().filter(item => item.dataset.cardId).map(item => item.dataset.cardId), ['Card of Dawn', 'Card of Ash']);
  assert.doesNotMatch(f.document.body.textContent, /Secrets|Mystery/);
  f.search('ash raven graveyard');
  assert.equal(f.results().length, 1);
  assert.equal(f.results()[0].dataset.cardId, 'Card of Ash');
});

test('a card becoming private cannot be opened from a stale result', () => {
  const f = palette(), card = f.card('Visible spell', f.opponent, 'graveyard');
  f.opponent.graveyard.push(card); f.ui.openCommandPalette(); f.search('visible');
  const result = f.results()[0];
  f.opponent.graveyard.length = 0; card.zone = 'hand'; result.click();
  assert.equal(f.ui.sheet, undefined);
  assert.deepEqual(f.notices, ['That card is no longer in a visible zone.']);
});

test('closed results and replaced games cannot execute stale commands', () => {
  const f = palette(); f.ui.openCommandPalette(); f.search('cardbacks');
  const stale = f.results()[0], oldClose = f.ui.closeCommandPalette;
  oldClose(); f.ui.openCommandPalette(); stale.click(); oldClose();
  assert.equal(f.ui.commandPaletteOpen, true);
  assert.equal(f.gameRoot.inert, true);
  assert.equal(f.ui.quickMenuOpen, undefined);
  f.search('playmats'); const oldGameResult = f.results()[0];
  f.ui.game = {...f.game}; oldGameResult.click();
  assert.equal(f.ui.quickMenuOpen, undefined);
});

test('keyboard navigation wraps, contains focus, and restores the opening control', () => {
  const f = palette(); f.ui.openCommandPalette();
  assert.equal(f.document.activeElement, f.find('.commandsearch'));
  assert.equal(f.gameRoot.inert, true);
  f.key('ArrowUp'); assert.equal(f.document.activeElement, f.results().at(-1));
  f.key('ArrowDown'); assert.equal(f.document.activeElement, f.results()[0]);
  f.key('End'); assert.equal(f.document.activeElement, f.results().at(-1));
  f.key('Tab'); assert.equal(f.document.activeElement, f.find('.commandclose'));
  f.key('Tab', f.document.activeElement, {shiftKey: true}); assert.equal(f.document.activeElement, f.results().at(-1));
  f.key('Home'); assert.equal(f.document.activeElement, f.results()[0]);
  f.key('Escape'); assert.equal(f.gameRoot.inert, false);
  assert.equal(f.document.activeElement, f.trigger);
});

test('empty search recovery and labelled clear keep focus in the search field', () => {
  const f = palette(); f.ui.openCommandPalette(); f.search('xyzzynotfound');
  assert.equal(f.results().length, 0);
  assert.match(f.find('.commandempty').textContent, /No matches yet/);
  const clear = f.find('.commandclear'); assert.equal(clear.getAttribute('aria-label'), 'Clear search');
  assert.equal(clear.hidden, false);
  f.find('.commandemptyreset').click();
  assert.equal(f.find('.commandsearch').value, ''); assert.ok(f.results().length > 0);
  assert.equal(f.document.activeElement, f.find('.commandsearch'));
  f.search('settings'); clear.click(); assert.equal(clear.hidden, true);
  f.ui.closeCommandPalette();
});

test('dismissing search preserves an already inert game and composing Enter does not activate', () => {
  const f = palette(); f.gameRoot.inert = true; f.ui.openCommandPalette(); f.search('cardbacks');
  f.key('Enter', f.find('.commandsearch'), {isComposing: true});
  assert.equal(f.ui.quickMenuOpen, undefined);
  f.ui.closeCommandPalette(); assert.equal(f.gameRoot.inert, true);
});

test('inspecting a public result preserves the pending decision and opens the ordinary search sheet', () => {
  const f = palette(), card = f.card('Visible spell');
  f.me.hand.push(card);
  const pending = {q: {type: 'cardReveal'}, resolve() {throw Error('search answered a game decision');}};
  f.ui.pendings = [pending]; f.ui.openCommandPalette(); f.search('visible'); f.results()[0].click();
  assert.equal(f.ui.sheet.card, card);
  assert.equal(f.ui.sheet.fromSearch, true);
  assert.deepEqual(f.ui.pendings, [pending]);
  assert.equal(f.ui.commandPaletteOpen, false);
});

test('destination commands replace higher inspection surfaces without changing engine state or drafts', () => {
  for (const [origin, value, query, destination, expected] of [
    ['sheet', {card: {}}, 'cardbacks', 'quickMenuOpen', 'cardbacks'],
    ['quickMenuOpen', true, 'priority stops', 'showStops', true],
    ['zoneBrowse', {zone: 'graveyard'}, 'help shortcuts', 'showHelp', true],
    ['playerSheet', {name: 'Raven'}, 'your graveyard', 'zoneBrowse', 'graveyard'],
    ['dungeonPanel', {player: {}}, 'arena settings', 'quickMenuOpen', true],
    ['lastResortConfirm', true, 'game log', null, 'log'],
    ['showJudge', true, 'stack table', null, 'table'],
  ]) {
    const f = palette(), pending = {q: {type: 'cardReveal'}, resolve() {throw Error('navigation answered a decision');}};
    const report = {text: 'Unsent report'}, diplomacy = {text: 'Unsent proposal'};
    Object.assign(f.ui, {[origin]: value, pendings: [pending], lastResortActive: true, problemReportDraft: report, diplomacyComposer: diplomacy, mobileView: 'hand'});
    f.ui.openCommandPalette(); f.search(query); assert.equal(f.results().length, 1, query); f.results()[0].click();
    if (destination) assert.equal(destination === 'zoneBrowse' ? f.ui[destination].zone : f.ui[destination], expected, query);
    else assert.equal(f.rendered.at(-1), expected, query);
    assert.ok(!f.ui[origin], `${origin} must no longer occlude ${query}`);
    assert.equal(f.ui.pendings[0], pending); assert.equal(f.ui.lastResortActive, true);
    assert.equal(f.ui.problemReportDraft, report); assert.equal(f.ui.diplomacyComposer, diplomacy);
    assert.equal(f.ui.mobileView, 'hand');
  }
});

test('dismissal restores the exact inspection and focused control, while public card navigation replaces it', () => {
  const f = palette(), card = f.card('Visible spell'), origin = {player: f.me};
  f.me.hand.push(card); f.ui.dungeonPanel = origin;
  const originControl = f.document.createElement('button'); f.gameRoot.appendChild(originControl); originControl.focus();
  f.ui.openCommandPalette(); f.search('visible'); f.key('Escape');
  assert.equal(f.ui.dungeonPanel, origin); assert.equal(f.document.activeElement, originControl);
  f.ui.openCommandPalette(); f.search('visible'); f.results()[0].click();
  assert.equal(f.ui.dungeonPanel, null); assert.equal(f.ui.sheet.card, card);
});

test('a stale public result preserves the original inspection instead of navigating to an empty table', () => {
  const f = palette(), card = f.card('Visible spell', f.opponent, 'graveyard'), origin = {zone: 'graveyard', query: 'ring'};
  f.opponent.graveyard.push(card); f.ui.zoneBrowse = origin;
  f.ui.openCommandPalette(); f.search('visible'); const result = f.results()[0];
  f.opponent.graveyard.length = 0; card.zone = 'hand'; result.click();
  assert.equal(f.ui.zoneBrowse, origin); assert.equal(f.ui.sheet, undefined);
  assert.deepEqual(f.notices, ['That card is no longer in a visible zone.']);
});

test('result cap announces truncation and empty-state controls remain in the focus trap', () => {
  const f = palette();
  for (let i = 0; i < 45; i++) f.me.hand.push(f.card(`Test creature ${i}`));
  f.ui.openCommandPalette(); f.search('test creature');
  assert.equal(f.results().length, 40);
  assert.match(f.find('.commandstatus').textContent, /45 cards.*first 40 cards shown/);
  f.find('.commandclose').focus(); f.key('Tab', f.document.activeElement, {shiftKey: true});
  assert.equal(f.document.activeElement, f.results().at(-1));
  f.search('nothing matches');
  f.find('.commandemptyreset').focus(); f.key('Tab');
  assert.equal(f.document.activeElement, f.find('.commandclose'));
});
