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

test('inflected words and dynamic card choices translate as complete English phrases', () => {
  const samples = new Map([
    ['Životi', 'Life'],
    ['Napadači +X/+X', 'Attackers +X/+X'],
    ['Svi žrtvuju stvorenje', 'Each player sacrifices a creature'],
    ['Svi odbacuju', 'Each player discards'],
    ['Do jednog stvorenja igrača Ada', 'Up to one creature controlled by Ada'],
    ['Do 3 stvorenja', 'Up to 3 creatures'],
    ['Do jedne target creature karte iz svog groblja', 'Up to one target creature card from your graveyard'],
    ['Stvorenje koje ti je nanijelo štetu', 'Creature that dealt damage to you'],
    ['Bontu: žrtvuj bilo koliko', 'Bontu: sacrifice any number'],
    ['Žrtvuj bilo koliko, vuci toliko', 'Sacrifice any number, draw that many'],
    ['Citadel Siege: tapni stvorenje koje kontroliše Ada', 'Citadel Siege: tap a creature controlled by Ada'],
    ['Poredaj simultane triggere (dno stacka → vrh stacka)', 'Order simultaneous triggers (bottom of stack → top of stack)'],
    ['Tvoje za fight', 'Your creature for the fight'],
    ['Ne može biti blokiran', 'Cannot be blocked'],
    ['Nema Siltlurker ne može biti žrtvovan.', 'Nema Siltlurker cannot be sacrificed.'],
    ['Goaduj stvorenje; ne može blokirati ovaj potez', "Goad creature; can't block this turn"],
    ['Proliferate kad se tapuje', 'Proliferate when it becomes tapped'],
    ['Sljedeći spell plaćaš životima', 'Pay life for the next spell'],
    ['The Ring: bloker se žrtvuje', 'The Ring: sacrifice the blocker'],
    ["Forger's Foundry: izaberi spellove koje bacaš besplatno", "Forger's Foundry: choose spells to cast for free"],
    ['Izaberi do dva spella za besplatno bacanje', 'Choose up to two spells to cast for free'],
    ['Magma Opus: do četiri mete za podjelu 4 štete', 'Magma Opus: choose up to four targets to divide 4 damage'],
    ['Seize the Spotlight: slava ili bogatstvo?', 'Seize the Spotlight: fame or fortune?'],
    ['Tajno glasaj: stun za...', 'Secretly vote: stun for...'],
    ['2 mačke', '2 Cats'],
    ['Žrtvuj 2 artefakta: vrati u ruku', 'Sacrifice 2 artifacts: return to hand'],
    ['Furygale Flocking: elementali za svakog protivnika!', 'Furygale Flocking: Elementals for each opponent!'],
    ['Koma je tapnut i ne može aktivirati sposobnosti ovaj potez.', 'Koma is tapped and cannot activate abilities this turn.'],
    ['Scavenger Grounds: sva groblja egzilirana!', 'Scavenger Grounds: all graveyards exiled!'],
    ['smanjuje najveću prijetnju', 'reduces the greatest threat'],
    ['razvija ili čuva resurse', 'develops or preserves resources'],
    ['najvrjedniji legalan izbor', 'the most valuable legal choice'],
    ['Saga poglavlje', 'Saga chapter'],
    ['You proliferira (2 izabrano).', 'You proliferate (2 selected).'],
    ['The World Tree — poglavlje 2.', 'The World Tree — chapter 2.'],
    ['AI Wolf glasa: fellowship.', 'AI Wolf votes: fellowship.'],
    ['Istraga', 'Investigate'],
    ['Tapped Treasurei', 'Tapped Treasures'],
    ['Letovi modifikovanima', 'Flying for modified creatures'],
    ['Beledros: landovi untapovani.', 'Beledros: lands untapped.'],
    ['P/T Ime (npr: 4/4 Angel flying)', 'P/T Name (e.g. 4/4 Angel flying)'],
  ]);

  for (const [source, expected] of samples) {
    assert.equal(MTG.uiText(source), expected, source);
    // Labels also pass through the DOM localizer after being escaped/rendered.
    assert.equal(MTG.uiText(expected), expected, `English must remain stable: ${expected}`);
  }
});

test('localization preserves catalog card names, English Oracle text, and names embedded in logs', () => {
  const failures = [];
  for (const name of Object.keys(MTG.DEFS)) {
    if (MTG.uiText(name) !== name) failures.push(name);
    const log = `${name} — uncounterable. Its controller's choice.`;
    if (MTG.uiText(log) !== log) failures.push(log);
    const oracle = MTG.DEFS[name].oracle;
    if (oracle && MTG.uiText(oracle) !== oracle) failures.push(`${name}: ${oracle}`);
  }
  assert.deepEqual(failures, []);
});

test('localization does not consume word fragments, apostrophes, or English spacing', () => {
  for (const text of [
    'uncounterable', 'counterable', 'mechanic-uncounterable', 'Bushido 2',
    "Forger's Foundry", 'Tri-Sentinel: choose a creature', 'Nema Siltlurker attacks.',
    "Player’s turn", 'Burrog Banemaker', 'Cards  •  Counters',
  ]) assert.equal(MTG.uiText(text), text);
  assert.equal(MTG.uiText('⚔️ Životi: 40; napadači: 2.'), '⚔️ Life: 40; attackers: 2.');
});
