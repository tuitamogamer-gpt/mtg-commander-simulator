import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const ui = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/public-entry.js', import.meta.url), 'utf8');

test('a losing seat leaves the remaining players in a live game', async () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 4711, paced: false, maxTurns: 5 });
  const controller = { decide: async () => ({ kind: 'pass' }) };
  const you = game.addPlayer('You', { name: 'You' }, controller, false);
  const bots = [1, 2, 3].map(index => game.addPlayer(`AI ${index}`, { name: `AI ${index}` }, controller, true));

  await game.playerLoses(you, 'test elimination');

  assert.equal(you.lost, true, 'the human seat is eliminated');
  assert.equal(game.gameOver, false, 'three opponents keep the table alive');
  assert.equal(game.winner, null, 'no winner while the table is still contested');
  // The engine runs in its own vm realm, so the names are compared as values.
  assert.equal(Array.from(game.alivePlayers(), player => player.name).join(','),
    bots.map(player => player.name).join(','), 'only the remaining seats stay in the game');
});

test('the last opponent standing still ends the match normally', async () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 4712, paced: false, maxTurns: 5 });
  const controller = { decide: async () => ({ kind: 'pass' }) };
  const you = game.addPlayer('You', { name: 'You' }, controller, false);
  const bot = game.addPlayer('AI 1', { name: 'AI 1' }, controller, true);

  await game.playerLoses(you, 'test elimination');

  assert.equal(game.gameOver, true, 'a single survivor ends the match');
  assert.equal(game.winner, bot, 'the survivor wins');
});

test('an eliminated seat is offered an explicit exit to its profile', () => {
  assert.match(ui, /renderEliminated\(g\)/, 'the eliminated overlay exists');
  assert.match(ui, /this\.me\.lost && !gameOverHidden && !this\.eliminationDismissed/,
    'the overlay is armed only for a live game the human has already lost');
  assert.match(ui, /el\('button', 'pbtn primary', 'I lost'\)/, 'the primary action is the printed I lost control');
  assert.match(ui, /lost\.onclick = \(\) => this\.leaveAsLoss\(lost\)/, 'the control leaves the table');
  assert.match(ui, /watch\.onclick = \(\) => \{ this\.eliminationDismissed = true/,
    'the overlay can be dismissed to keep watching');
  assert.match(ui, /action\('I lost', 'Record the loss and return to your profile'/,
    'the same exit stays reachable from the game menu');
  assert.match(ui, /this\.eliminationDismissed = false;/, 'a new game re-arms the overlay');
});

test('leaving as a loss records the match before returning to the profile', () => {
  assert.match(main, /MTG\.leaveAsLoss = async \(\) => \{/, 'the exit is exposed to the UI');
  assert.match(main, /if \(!ui\.me \|\| !ui\.me\.lost\) return false;/, 'only an eliminated seat may use it');
  assert.match(main, /await completeAccountMatch\(\)/, 'the completed loss is written before leaving');
  assert.match(main, /params\.set\('view', 'profile'\)/, 'a signed-in player returns to the profile view');
  assert.match(main, /new URLSearchParams\(location\.search\)/, 'the existing address is preserved');
  assert.match(entry, /initialParams\.get\('view'\) === 'profile'/, 'the entry page reopens that view on load');
  assert.match(entry, /if \(account\.user\) account\.open\('profile'\)/, 'the profile panel opens for a signed-in player');
  assert.match(entry, /history\.replaceState\(null, '', window\.location\.pathname/, 'the marker is dropped from the address');
});
