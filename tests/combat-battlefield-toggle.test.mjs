import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');

test('svaki puni combat overlay nudi isti Show Battlefield toggle', () => {
  const showButtons = uiSource.match(/🗺 Show Battlefield/g) || [];
  assert.equal(showButtons.length, 3, 'attackers, combat review i blockers moraju imati isti toggle');
  assert.match(uiSource, /renderAttackersModal[\s\S]*pd\.q\.type !== 'attackers' \|\| pd\.boardPeek/);
  assert.match(uiSource, /q\.type === 'combatReview' && pd\.boardPeek/);
  assert.match(uiSource, /renderBlockersModal[\s\S]*pd\.q\.type !== 'blockers' \|\| pd\.boardPeek/);
});

test('battlefield pogled vraća igrača u isti combat korak bez gubitka izbora', () => {
  assert.match(uiSource, /Back to Attack Overview[\s\S]*pd\.boardPeek = false/);
  assert.match(uiSource, /Back to Combat Review[\s\S]*pd\.boardPeek = false/);
  assert.match(uiSource, /Back to Block Overview[\s\S]*pd\.boardPeek = false/);
  assert.match(uiSource, /Battlefield view · \$\{n\} attacker/);
  assert.match(uiSource, /pd\.sel\.map\(entry => \(\{ card: entry\.card, target: entry\.target \}\)\)/,
    'attacker assignmenti ostaju u pending odluci dok je tabla otvorena');
  assert.match(uiSource, /for \(const \[b, a\] of pd\.assigns\)/,
    'blocker assignmenti ostaju u pending odluci dok je tabla otvorena');
});
