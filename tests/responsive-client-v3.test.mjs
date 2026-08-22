import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/client-v3.css', import.meta.url), 'utf8');

function loadDeckStrategy() {
  const globalThis = { MTG: {} };
  runInNewContext(main, { globalThis });
  return globalThis.MTG.deckStrategy;
}

function loadUIForKeyboardTest() {
  let keydown = null;
  const document = {
    addEventListener(type, handler) { if (type === 'keydown') keydown = handler; },
    querySelector() { return null; },
  };
  const localStorage = { getItem() { return null; }, setItem() {} };
  const sandbox = { document, localStorage, console, setTimeout, clearTimeout };
  runInNewContext(ui, sandbox);
  return { UI: sandbox.MTG.UI, keydown: () => keydown };
}

test('responsive V3 stylesheet replaces the former desktop-only gate', () => {
  assert.ok(index.includes('<link rel="stylesheet" href="/src/client-v3.css">'));
  assert.ok(index.indexOf('/src/client-v3.css') > index.indexOf('/src/styles.css'));
  assert.match(css, /#desktop-only \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 1279px\)/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /body\.game-active #game \{ display: grid !important; \}/);
});

test('Main Page V3 keeps discovery and mobile pod controls functional', () => {
  assert.match(main, /placeholder="Search decks or commanders"/);
  assert.match(main, /data-filter="color"/);
  assert.match(main, /data-filter="strategy"/);
  assert.match(main, /mtgDeckFavorites/);
  assert.match(main, /const filterDecks = \(\) =>/);
  assert.match(main, /const mobileBar = el\('div', 'setupmobilebar'\)/);
  assert.match(main, /right\.classList\.add\('mobile-open'\)/);
});

test('deck strategy filter classifies every supported archetype without false combat fallbacks', () => {
  const strategy = loadDeckStrategy();
  assert.equal(strategy('Tokens and sacrifice'), 'tokens');
  assert.equal(strategy('+1/+1 counters and Coven'), 'counters');
  assert.equal(strategy('Villains and connive'), 'spells');
  assert.equal(strategy('Clues and card draw'), 'artifacts');
  assert.equal(strategy('Group slug'), 'politics');
  assert.equal(strategy('Aggressive combat'), 'combat');
});

test('Arena V3 uses a compact HUD and utilities without bypassing action review', () => {
  assert.match(ui, /renderTopbar\(g\) \{ return this\.renderArenaHeader\(g\); \}/);
  assert.match(ui, /renderMobileViewTabs\(g\)/);
  assert.match(ui, /renderUtilityRail\(g\)/);
  assert.match(ui, /renderQuickMenu\(g\)/);
  assert.match(ui, /<span>HOLD<\/span>/);
  assert.match(ui, /<span>MANA<\/span>/);
  assert.match(ui, /<span>MENU<\/span>/);
  assert.match(ui, /const stage = blocked \? null : this\.renderActionStage\(g\)/);
  assert.match(ui, /const sp = blocked \? null : this\.renderStackPopup\(g\)/);
});

test('Arena menus own keyboard input and new human decisions return mobile UI to Mine', async () => {
  const harness = loadUIForKeyboardTest();
  const arena = new harness.UI();
  let prevented = false;
  let renders = 0;
  arena.render = () => { renders++; };
  arena.initKeys();

  arena.quickMenuOpen = true;
  harness.keydown()({ key: 'Enter', target: { tagName: 'BODY' }, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(renders, 0);

  harness.keydown()({ key: 'Escape', target: { tagName: 'BODY' }, preventDefault() { prevented = true; } });
  assert.equal(arena.quickMenuOpen, false);
  assert.equal(prevented, true);
  assert.equal(renders, 1);

  arena.mobileView = 'table';
  arena.utilityDrawerOpen = true;
  arena.autoAnswer = () => undefined;
  arena.openReactWindow = () => false;
  const decision = arena.controllerFor({}).decide({}, { type: 'chooseCards' });
  assert.equal(arena.mobileView, 'mine');
  assert.equal(arena.utilityDrawerOpen, false);
  arena.resolvePending({ cards: [] });
  await decision;
});
