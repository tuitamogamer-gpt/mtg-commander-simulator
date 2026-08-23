import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

test('presentation layer translates core game prompts and logs into English', () => {
  const samples = new Map([
    ['Igra počinje. Redoslijed: You → AI Zmaj.', 'The game begins. Turn order: You → AI Dragon.'],
    ['You zadržava 7 karata.', 'You keeps 7 cards.'],
    ['——— Potez 4: AI Vuk ———', '——— Turn 4: AI Wolf ———'],
    ['Odbaci do 7 u ruci (2)', 'Discard down to 7 cards in hand (2)'],
    ['Coven: izaberi bilo koji broj stvorenja, ali svako mora imati različitu snagu.',
      'Coven: choose any number of creatures, but each must have different power.'],
    ['Uništi artefakt', 'Destroy artifact'],
    ['Dupliraj countere', 'Double counters'],
    ['Sačuvaj countere', 'Preserve counters'],
    ['Preuzmi goadovana/osumnjičena stvorenja', 'Take control of goaded/suspected creatures'],
    ['Tapni i ugasi aktivacije', 'Tap and prevent activated abilities'],
    ['Magma Opus: tačno dva permanenta za tapovanje', 'Magma Opus: exactly two permanents to tap'],
  ]);

  for (const [source, expected] of samples) assert.equal(MTG.uiText(source), expected);
});

test('discard localization does not get corrupted by the cast translation', () => {
  assert.equal(MTG.uiText('Odbaci kartu'), 'Discard card');
  assert.equal(MTG.uiText('Baci spell'), 'Cast spell');
});

test('browser text-state mirrors the English presentation used by the visible UI', () => {
  const mainSource = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  assert.match(mainSource, /prompt: pending\.prompt \? MTG\.uiText\(pending\.prompt\) : null/);
  assert.match(mainSource, /recentLog: g\.log\.slice\(-10\)\.map\(entry => \(\{ \.\.\.entry, msg: MTG\.uiText\(entry\.msg\) \}\)\)/);
  assert.match(mainSource, /assignments: ui\.pending\.q\.type === 'attackers'[\s\S]*?filter\(entry => entry && entry\.card && entry\.target\)/);
  assert.doesNotMatch(mainSource, /`Igraj \$\{entry\.card/);
  assert.doesNotMatch(mainSource, /`Baci \$\{entry\.card/);
  const engineSource = readFileSync(new URL('../src/modules/engine.js', import.meta.url), 'utf8');
  const coreLogLines = engineSource.split('\n').filter(line => /\.lg\(/.test(line)).join('\n');
  assert.doesNotMatch(coreLogLines, /\b(?:uvodi|vuče|melje|odbacuje|pravi)\b/);
  const phaseSource = readFileSync(new URL('../src/modules/engine2.js', import.meta.url), 'utf8');
  const phaseLogLines = phaseSource.split('\n').filter(line => /(?:\.lg\(|spotlight\()/.test(line)).join('\n');
  assert.doesNotMatch(phaseLogLines, /\b(?:napada|TEBE|ILI|TVOJ)\b/);
  assert.doesNotMatch(phaseSource, /napada TEBE ILI TVOJ PLANESWALKER/);
  assert.equal(MTG.playerVerb({ name: 'You' }, 'draw', 'draws'), 'You draw');
  assert.equal(MTG.playerVerb({ name: 'AI Wolf' }, 'draw', 'draws'), 'AI Wolf draws');
  assert.match(engineSource, /U\.playerVerb\(p, 'draw', 'draws'\)/);
  assert.match(engineSource, /U\.playerVerb\(p, 'discard', 'discards'\)/);
  assert.match(engineSource, /U\.playerVerb\(ctrl, 'create', 'creates'\)/);
  assert.doesNotMatch(phaseSource, /\$\{p\.name\} (?:casts|plays|activates|draws|pays)\b/);
});

test('scripted player-facing labels do not retain known Bosnian fragments', () => {
  const visibleKeys = new Set(['label', 'prompt', 'desc', 'title', 'subtitle', 'text', 'reason', 'message']);
  const leftovers = /[čćžšđČĆŽŠĐ]|\b(?:artefakt|dupliraj|counteri|countere|tapni|skini|ukradi|napadaju|humani|elfovi|ptice|goblini|ninje|vojnika|baciti|tapovanje|opremljeno|legendarna|permanenta|basica|vuka)\b/iu;
  const seen = new Set();
  const failures = [];

  const visit = (value, path, key = '', depth = 0) => {
    if (value == null || depth > 12) return;
    if (typeof value === 'string') {
      if (visibleKeys.has(key)) {
        const translated = MTG.uiText(value);
        if (leftovers.test(translated)) failures.push(`${path}: ${translated}`);
      }
      return;
    }
    if ((typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
    seen.add(value);
    for (const childKey of Object.keys(value)) visit(value[childKey], `${path}.${childKey}`, childKey, depth + 1);
  };

  visit(MTG.DEFS, 'DEFS');
  assert.deepEqual(failures, []);
});
