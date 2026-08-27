import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/frontend-overhaul.css', import.meta.url), 'utf8');

test('every Command Zone signature style has a local portrait and complete display metadata', () => {
  const MTG = loadEngine();
  const expected = {
    jimmy: ['Jimmy Wong', 'Aggressive'],
    rachel: ['Rachel Weeks', 'Balanced'],
    post: ['Post Malone', 'Opportunist'],
    olivia: ['Olivia Gobert-Hicks', 'Saboteur'],
    josh: ['Josh Lee Kwai', 'Defensive'],
  };

  for (const [key, [name, archetype]] of Object.entries(expected)) {
    const style = MTG.AI_STYLES[key];
    assert.equal(style.signature, true, `${key} must be grouped as a signature style`);
    assert.equal(style.name, name);
    assert.equal(style.archetype, archetype);
    assert.match(style.portrait, /^\.\/assets\/ai-personas\/[a-z-]+\.webp$/);
    const file = new URL(`../${style.portrait.slice(2)}`, import.meta.url);
    assert.ok(statSync(file).size > 5_000, `${key} portrait should be a real local image`);
    assert.equal(readFileSync(file).subarray(0, 4).toString('ascii'), 'RIFF');
  }
});

test('setup keeps native style controls, groups signatures, and confirms styles before starting', () => {
  assert.match(main, /const styleGroups = \[/);
  assert.match(main, /\['Core archetypes'/);
  assert.match(main, /\['Command Zone signatures'/);
  assert.match(main, /document\.createElement\('optgroup'\)/);
  assert.match(main, /sel\.onchange = \(\) => \{/);
  assert.match(main, /updateStylePresentation\(sel\.value\)/);
  assert.match(main, /class="reviewstyle"/);
  assert.match(main, /style && style\.portrait/);
  assert.match(main, /portrait\.loading = 'eager'/);
  assert.match(css, /#setup \.styledesc \{[\s\S]*?display: grid !important;/);
  assert.match(css, /#setup \.pbadge\.hasportrait img/);
  assert.match(css, /#setup \.reviewstyle img/);
  assert.match(css, /#setup\[data-setup-stage="review"\] \.podstage \{ display: none; \}/);
  assert.match(css, /#setup\[data-setup-stage="review"\] \.reviewstage \{ display: block;/);
});

test('Arena carries the selected signature portrait into the public persona chip', () => {
  assert.match(ui, /personachip\$\{styleMeta\.portrait \? ' hasportrait' : ''\}/);
  assert.match(ui, /styleMeta\.portrait \? `<img src="\$\{styleMeta\.portrait\}"/);
  assert.match(css, /#game \.personachip img/);
});
