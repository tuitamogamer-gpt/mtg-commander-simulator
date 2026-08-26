import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { loadEngine } from './helpers/load-engine.mjs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
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
  assert.ok(index.includes('<link rel="stylesheet" href="./src/client-v3.css">'));
  assert.ok(index.indexOf('./src/client-v3.css') > index.indexOf('./src/styles.css'));
  assert.match(css, /#desktop-only \{ display: none !important; \}/);
  assert.match(css, /@media \(max-width: 1279px\)/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /body\.game-active #game \{ display: grid !important; \}/);
});

test('setup mode never leaves the inactive Arena below the Main Page', () => {
  const inactiveArenaGate = css.indexOf('body:not(.game-active) #game { display: none !important; }');
  const responsiveOverrides = css.indexOf('@media (max-width: 1279px)');
  assert.ok(inactiveArenaGate >= 0, 'inactive Arena needs an explicit state gate');
  assert.ok(inactiveArenaGate < responsiveOverrides, 'Arena state gate must apply at desktop widths too');
});

test('Main Page V3 keeps discovery and mobile pod controls functional', () => {
  assert.match(main, /placeholder="Search decks or commanders"/);
  assert.match(main, /data-filter="color"/);
  assert.match(main, /data-filter="strategy"/);
  assert.match(main, /mtgDeckFavorites/);
  assert.match(main, /const filterDecks = \(\) =>/);
  assert.match(main, /const mobileBar = el\('div', 'setupmobilebar'\)/);
  assert.match(main, /right\.classList\.add\('mobile-open'\)/);
  assert.match(main, /deckselectedmark/);
  assert.match(css, /#setup \.deckcard\.selected::after \{[\s\S]*?content: none !important;[\s\S]*?display: none !important;/);
  assert.match(css, /#setup \.deckcard\.selected \.deckselectedmark \{ display: inline-flex; \}/);
});

test('Main Page V3 contains its war-room artwork inside the hero', () => {
  assert.match(index, /commander-war-room\.jpg" media="\(min-width: 701px\)"/);
  assert.match(css, /body:has\(#setup\)::before,[\s\S]*?#setup::before \{[\s\S]*?content: none !important;[\s\S]*?display: none !important;/);
  assert.match(css, /#setup \{[\s\S]*?background: var\(--v3-bg\) !important;/);
  assert.match(css, /@media \(min-width: 1280px\) \{[\s\S]*?url\('\.\.\/assets\/backgrounds\/commander-war-room\.jpg'\) center 18% \/ cover no-repeat !important;/);
  assert.match(css, /@media \(min-width: 701px\) and \(max-width: 1279px\) \{[\s\S]*?commander-war-room\.jpg/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?#setup \.menuhead \{[\s\S]*?radial-gradient\(circle at 84% 24%/);
  assert.match(css, /body\.game-active #game \{[\s\S]*?commander-arena-table\.jpg/);
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

test('every active deck has complete setup metadata and real mana-symbol colors', () => {
  const MTG = loadEngine();
  for (const [name, deck] of Object.entries(MTG.DECKS)) {
    const meta = MTG.DECK_META[name];
    assert.ok(meta, `${name} is missing DECK_META`);
    assert.ok(meta.icon, `${name} is missing its table icon`);
    assert.ok(meta.style, `${name} is missing its setup playstyle`);
    assert.ok(meta.blurb, `${name} is missing its setup description`);
    assert.match(meta.set || '', /\(20\d{2}\)$/, `${name} is missing a setup release year`);
    assert.deepEqual(
      Array.from(meta.colors).sort(),
      Array.from(MTG.deckColorIdentity(deck, MTG.DEFS)).sort(),
      `${name} setup mana icons do not match its complete deck color identity`,
    );
  }
  assert.match(main, /class="deckmana" src="\.\/assets\/mana\/\$\{c\}\.svg"/);
});

test('Arena V3 uses a compact HUD and utilities without bypassing action review', () => {
  assert.match(ui, /renderTopbar\(g\) \{ return this\.renderArenaHeader\(g\); \}/);
  assert.match(ui, /renderMobileViewTabs\(g\)/);
  assert.match(ui, /renderUtilityRail\(g\)/);
  assert.match(ui, /renderQuickMenu\(g\)/);
  assert.match(ui, /<span>HOLD<\/span>/);
  assert.match(ui, /<span>MANA<\/span>/);
  assert.match(ui, /<span>MENU<\/span>/);
  assert.match(ui, /el\('button', 'politicsstatus/);
  assert.match(ui, /items\.push\(\['diplomacy'/);
  assert.match(ui, /const stage = blocked \? null : this\.renderActionStage\(g\)/);
  assert.match(ui, /const sp = blocked \? null : this\.renderStackPopup\(g\)/);
  assert.match(ui, /RECIPROCITY CHECK/);
  assert.match(ui, /Commitment scope: receive/);
});

test('Arena groups creatures, support permanents, and mana artifacts into stable battlefield lanes', () => {
  const harness = loadUIForKeyboardTest();
  const arena = new harness.UI();
  const player = { name: 'You' };
  const card = (name, types, extra = {}) => ({
    name, ctrl: player, attachedTo: null,
    def: { mana: extra.mana || null }, cur: { extraMana: extra.extraMana || [] },
    is(type) { return types.includes(type); },
  });
  const creature = card('Bear', ['Creature']);
  const artifactCreature = card('Mana Myr', ['Artifact', 'Creature'], { mana: {} });
  const manaRock = card('Sol Ring', ['Artifact'], { mana: {} });
  const enchantment = card('Rhystic Study', ['Enchantment']);
  const utilityArtifact = card('Skullclamp', ['Artifact']);
  const planeswalker = card('Teferi', ['Planeswalker']);
  const animatedLand = card('Restless Spire', ['Land', 'Creature']);
  const normalLand = card('Island', ['Land']);
  const game = {
    bf() { return [utilityArtifact, manaRock, creature, planeswalker, enchantment, artifactCreature, normalLand, animatedLand]; },
    lands() { return [normalLand, animatedLand]; },
    byIid() { return null; },
  };

  const groups = arena.battlefieldGroups(game, player);
  assert.deepEqual(Array.from(groups.creatures, item => item.name), ['Bear', 'Mana Myr', 'Restless Spire']);
  assert.deepEqual(Array.from(groups.manaArtifacts, item => item.name), ['Sol Ring']);
  assert.deepEqual(Array.from(groups.support, item => item.name), ['Rhystic Study', 'Skullclamp', 'Teferi']);
  assert.deepEqual(Object.keys(arena.landGroups(game, player)), ['Island']);
  assert.match(ui, /'CREATURES'/);
  assert.match(ui, /'ENCHANTMENTS · SUPPORT'/);
  assert.match(ui, /'LANDS · MANA'/);
  assert.match(ui, /className: 'creaturelane'/);
  assert.match(ui, /className: 'supportlane'/);
  assert.match(css, /#game \.mybattlefieldmain/);
  assert.match(css, /#game \.resourcezone/);
  assert.match(css, /#game \.oppboardmain/);
  assert.match(ui, /LAND CREATURE/);
  assert.match(styles, /\.mini\.landcreature/);
  assert.match(styles, /\.animatedpermanentstate/);
  assert.match(main, /landCreature: c\.is\('Land'\) && c\.is\('Creature'\)/);
  assert.match(css, /#game\[data-mobile-view="table"\] \.opprow \{[\s\S]*?flex-direction: column !important;/);
  assert.match(css, /#game\[data-mobile-view="table"\] \.oppresourcelane \{[\s\S]*?flex-basis: 78px;/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?#game \.landrow \{ flex-direction: column;/);
});

test('Arena re-zones Station Spacecraft from support to creatures using current types', () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 43, paced: false, maxTurns: 20 });
  const player = game.addPlayer('You', { name: 'Counter Intelligence' }, null, false);
  const arena = new (loadUIForKeyboardTest().UI)();
  const inspirit = new MTG.CardInst(MTG.DEFS['Inspirit, Flagship Vessel'], player);
  inspirit.ctrl = player; inspirit.zone = 'battlefield'; inspirit.sick = false;
  game.battlefield.push(inspirit);

  inspirit.counters.charge = 7;
  game.recalc();
  let groups = arena.battlefieldGroups(game, player);
  assert.equal(inspirit.is('Creature'), false);
  assert.equal(groups.support.includes(inspirit), true);
  assert.equal(groups.creatures.includes(inspirit), false);

  game.addCounters(inspirit, 'charge', 1, true, player);
  groups = arena.battlefieldGroups(game, player);
  assert.equal(inspirit.is('Creature'), true);
  assert.equal(groups.creatures.includes(inspirit), true);
  assert.equal(groups.support.includes(inspirit), false);

  game.removeCounters(inspirit, 'charge', 1);
  groups = arena.battlefieldGroups(game, player);
  assert.equal(inspirit.is('Creature'), false);
  assert.equal(groups.support.includes(inspirit), true);
  assert.match(main, /Station is \$\{stationVessel\.is\('Creature'\) \? 'online in CREATURES' : 'offline in SUPPORT'\}/);
});

test('Arena keeps decoded card images and ambient AI state stable across bot renders', () => {
  assert.match(ui, /captureRenderedImages\(root\)/);
  assert.match(ui, /reuseRenderedImages\(root, pool\)/);
  assert.match(ui, /const renderedImages = this\.captureRenderedImages\(root\);/);
  assert.match(ui, /this\.reuseRenderedImages\(root, renderedImages\);/);
  assert.match(ui, /fresh\.replaceWith\(existing\);/);
  assert.match(css, /#game\.ai-turn \.opprow\.active,[\s\S]*?animation: none;[\s\S]*?filter: brightness\(1\.045\);/);
  assert.match(css, /#game\.ai-turn \.stackempty span \{[\s\S]*?animation: none;/);
});

test('Suspend stays visible from the hand through counters and automatic exile casting', () => {
  assert.match(ui, /class="suspendtrayhead"><b>⏳ SUSPENDED<\/b>/);
  assert.match(ui, /YOUR UPKEEP −1 · AT 0 AUTO-CAST FREE/);
  assert.match(ui, /next counter comes off at your upkeep/);
  assert.match(ui, /class="handsuspendtag\$\{canSuspendNow \? ' ready' : ''\}"/);
  assert.match(ui, /Suspend .*— exile with .* time counters/);
  assert.match(ui, /the game casts this card automatically for free if able/);
  assert.match(ui, /you do not cast it manually from exile/);
  assert.match(ui, /classList\.add\('suspendedcard'\)/);
  assert.match(styles, /\.suspendtray \{/);
  assert.match(styles, /\.suspendcounter \{/);
  assert.match(styles, /\.handsuspendtag\.ready/);
  assert.match(styles, /\.suspendstate\.exile/);
  assert.match(main, /smokeScenario === 'suspendVisibility'/);
  assert.match(main, /suspended: c\.meta && Object\.prototype\.hasOwnProperty\.call\(c\.meta, 'suspended'\)/);
  assert.match(main, /entry\.suspend \? `Suspend \$\{entry\.card\.def\.suspend\.cost\} with \$\{entry\.card\.def\.suspend\.n\} time counters`/);
});

test('player effect indicators expose public persistent choices without leaking secret choices', () => {
  const harness = loadUIForKeyboardTest();
  const arena = new harness.UI();
  const player = { name: 'You', cityBlessing: true, emblems: [], noMaxHandForever: false };
  const publicChoice = { iid: 10, name: 'Patchwork Banner', ctrl: player, meta: { chosenType: 'Human' } };
  const classCard = { iid: 11, name: "Gourmand's Talent", ctrl: player, meta: { level: 2 } };
  const secretChoice = { iid: 12, name: 'Stalking Leonin', ctrl: player, meta: { chosen: 3 } };
  const game = {
    monarch: null, battlefield: [publicChoice, classCard, secretChoice], untilEffects: [],
    bf() { return this.battlefield; },
  };

  const effects = arena.playerStatusEffects(game, player);
  assert.deepEqual(Array.from(effects, effect => effect.label), ["City's Blessing", 'Chosen creature type', 'Class level']);
  assert.equal(effects.find(effect => effect.label === 'Chosen creature type').detail, 'Human');
  assert.equal(effects.find(effect => effect.label === 'Class level').detail, 'Level 2');
  assert.equal(effects.some(effect => /Stalking Leonin|secret/i.test(`${effect.label} ${effect.detail}`)), false);
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
