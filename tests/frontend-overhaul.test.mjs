import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../index.html');
const design = read('../DESIGN.md');
const tokens = read('../src/design-system.css');
const overhaul = read('../src/frontend-overhaul.css');
const main = read('../src/modules/main.js');
const ui = read('../src/modules/ui.js');
const visuals = read('../src/modules/visuals.js');

test('design contract and gradual cascade architecture are explicit and loaded after legacy compatibility', () => {
  assert.match(design, /NOW[\s\S]*REVIEW[\s\S]*ACTIVITY/);
  assert.match(design, /Deck → Pod → Review/);
  assert.match(design, /must never expose another player's hand/);
  assert.match(tokens, /@layer commander\.tokens, commander\.primitives/);
  assert.match(tokens, /--ds-touch: 44px/);
  assert.match(overhaul, /Temporary bridge loaded after the legacy sheets/);
  assert.ok(index.indexOf('design-system.css') > index.indexOf('client-v3.css'));
  assert.ok(index.indexOf('frontend-overhaul.css') > index.indexOf('design-system.css'));
});

test('mobile Setup is a true three-stage flow with quick recommendations and recoverable empty results', () => {
  assert.match(main, /setupStage: 'deck'/);
  assert.match(main, /const setSetupStage = stage =>/);
  assert.match(main, /setSetupStage\('pod'\)/);
  assert.match(main, /setSetupStage\('review'\)/);
  assert.match(main, /class="playstylechoices"/);
  assert.match(main, /RECOMMENDED FOR YOU/);
  assert.match(main, /No exact matches/);
  assert.match(main, /const closestDeckEntries = \(\) =>/);
  assert.match(main, /class="debugimportbtn">↺ Import debug snapshot/);
  assert.match(overhaul, /#setup\[data-setup-stage="review"\] \.podstage \{ display: none; \}/);
  assert.match(overhaul, /#setup \.setupstagepanel > \* \{ flex-shrink: 0; \}/);
});

test('Arena has one-level destinations, public activity hierarchy and a compact empty hand', () => {
  assert.doesNotMatch(ui, /const tabs = el\('div', 'sidebartabs'\)/);
  assert.match(ui, /\['mine', 'player', 'MINE'\], \['table', 'cards', 'TABLE'\], \['stack', 'stack'/);
  assert.match(ui, /renderTurnTimeline\(g, player\)/);
  assert.match(ui, /g\.log\.filter\(entry => entry\.t === g\.turnNo\)/);
  assert.doesNotMatch(ui.slice(ui.indexOf('renderTurnTimeline'), ui.indexOf('renderCenter')), /aiDecisionLog|library|\.hand/);
  assert.match(ui, /effectnotice activity/);
  assert.match(ui, /while \(stack\.children\.length > 2\)/);
  assert.match(ui, /handView\.classList\.contains\('is-empty'\)/);
  assert.match(overhaul, /#game \.hand\.is-empty[\s\S]*height: 46px !important/);
});

test('motion, dialog, sync, fatal recovery and recap paths remain visible and recoverable', () => {
  assert.match(visuals, /MTG\.enhanceDialog = function enhanceDialog/);
  assert.match(visuals, /aria-modal/);
  assert.match(visuals, /event\.key !== 'Tab'/);
  assert.match(ui, /action\('Reduced motion'/);
  assert.match(ui, /class="arrivalskip">Skip/);
  assert.match(ui, /renderSystemStatus\(\)/);
  assert.match(ui, /renderFatalRecovery\(g\)/);
  assert.match(ui, /Rematch same pod/);
  assert.match(main, /MTG\.rematchLastGame = \(\) => startGame/);
  assert.match(main, /const rematchDecks = aiDecks\.slice\(\)/);
  assert.match(main, /aiDecks: rematchDecks\.slice\(\)/);
  assert.match(main, /ui\.setSyncError/);
  assert.match(main, /ui\.handleFatal\(err\)/);
});

test('text-state diagnostics expose the same blocking decision actions as the visible modal', () => {
  assert.match(main, /pending\.type === 'mulligan'[\s\S]*?label: 'Keep hand'[\s\S]*?label: 'Mulligan'/);
  assert.match(main, /pending\.type === 'main'[\s\S]*?label: `Play \$\{card\.name\}`[\s\S]*?label: phaseLabel/);
  assert.match(main, /pending\.type === 'priority'[\s\S]*?label: MTG\.isLastEndStepBeforeMyTurn[\s\S]*?value: \{ kind: 'pass' \}/);
  assert.match(main, /pending\.type === 'combatReview' \|\| pending\.type === 'effectReview' \|\| pending\.type === 'cardReveal'[\s\S]*?label: 'Proceed'/);
  assert.match(main, /pending\.type === 'threatAlert'[\s\S]*?label: 'Got it'[\s\S]*?label: 'I will respond \(HOLD\)'/);
  assert.match(main, /pending\.type === 'attackers'[\s\S]*?Confirm attack/);
  assert.match(main, /pending\.type === 'blockers'[\s\S]*?Confirm blocks/);
  assert.match(main, /pending\.type === 'chooseTargets'/);
  assert.match(main, /actions: pendingDecisionActions\.concat/);
  assert.match(main, /ui\.pending\.q\.eligible \|\| ui\.pending\.q\.potential \|\| ui\.pending\.q\.candidates \|\| ui\.pending\.q\.from/);
  assert.match(main, /legalAssignments/);
  assert.match(main, /candidate\.faceDown && candidate\.ctrl !== ui\.me/);
});
