import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/client-v3.css', import.meta.url), 'utf8');
const baseCss = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const engine2 = readFileSync(new URL('../src/modules/engine2.js', import.meta.url), 'utf8');
const scriptsV7a = readFileSync(new URL('../src/modules/scripts_v7a.js', import.meta.url), 'utf8');
const scriptsV7c = readFileSync(new URL('../src/modules/scripts_v7c.js', import.meta.url), 'utf8');
const scriptsV7d = readFileSync(new URL('../src/modules/scripts_v7d.js', import.meta.url), 'utf8');

test('Oracle of Mul Daya reveals and permits a land on top of its controller library', () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 240824, paced: false, maxTurns: 10 });
  const controller = { decide: async () => ({ kind: 'done' }) };
  const player = game.addPlayer('You', MTG.DECKS['World Shaper'], controller, false);
  game.turnPlayer = player;
  game.turnNo = 5;
  game.phase = 'main1';
  game.step = 'main';

  const oracle = new MTG.CardInst(MTG.DEFS['Oracle of Mul Daya'], player);
  oracle.ctrl = player;
  oracle.zone = 'battlefield';
  game.battlefield.push(oracle);
  const topLand = new MTG.CardInst(MTG.DEFS.Forest, player);
  topLand.zone = 'library';
  player.library.push(topLand);
  game.recalc();

  assert.equal(oracle.def.revealOwnTop, true);
  assert.equal(oracle.def.playTop(game, oracle, topLand, player), true);
  assert.equal(game.playableLands(player).includes(topLand), true);
});

test('visible library top has a named, accessible card control instead of an ambiguous eye icon', () => {
  assert.match(ui, /topCard\.dataset\.testid = 'library-top-peek'/);
  assert.match(ui, /Top of library: \$\{libraryTop\.name\}/);
  assert.match(ui, /PLAYABLE FROM TOP/);
  assert.match(ui, /playerRail\.appendChild\(topCard\)/);
  assert.match(ui, /const landStrip = el\('div', 'landstrip'\)/);
  assert.match(ui, /landStrip\.appendChild\(lc\)/);
  assert.doesNotMatch(ui, /\$\{libraryTop \? ' · 👁' : ''\}/);
  assert.match(css, /#game \.librarytoppeek\.playable/);
  assert.match(css, /#game \.landrow:has\(\.playerrail\.has-library-top\)/);
  assert.match(main, /smokeScenario === 'libraryTop'/);
});

test('setup progress does not promise inaccessible screens before a deck is selected', () => {
  assert.match(main, /setupSteps\.filter\(step => step\.dataset\.step !== 'deck'\)/);
  assert.match(main, /step\.disabled = true/);
  assert.match(main, /Select deck →/);
  assert.match(main, /class='selecteddecksummary'|el\('div', 'selecteddecksummary'\)/);
  assert.match(main, /deckSummary\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(main, /<small>Selected deck<\/small><b>\$\{esc\(state\.deck\)\}<\/b>/);
  assert.match(css, /#setup \.selecteddecksummary/);
  assert.doesNotMatch(main, /View deck →/);
  assert.match(css, /#setup \.setupstep:disabled/);
});

test('Arena removes tiny table controls from the board and exposes them in the game menu', () => {
  assert.match(ui, /action\('Opponent card size'/);
  assert.match(ui, /action\('Opponent area height'/);
  assert.match(css, /#game \.oppsizebar,[\s\S]*?#game \.oppresize \{ display: none !important; \}/);
  assert.match(ui, /class="utilityicon"/);
  assert.match(ui, /class="utilitylabel"/);
});

test('the closed Arena utility drawer cannot trap keyboard or assistive focus offscreen', () => {
  assert.match(ui, /const sidebarAccessible = this\.utilityDrawerOpen \|\| this\.mobileView === 'stack'/);
  assert.match(ui, /side\.setAttribute\('aria-hidden', sidebarAccessible \? 'false' : 'true'\)/);
  assert.match(ui, /side\.inert = !sidebarAccessible/);
});

test('overlay toasts and responsive controls preserve clear action targets', () => {
  assert.match(css, /body\.game-active \.toastmsg/);
  assert.match(css, /body:has\(#game \.overlay\) \.toastmsg/);
  assert.match(css, /#game \.zbtns \.zbtn \{ min-width: 44px; min-height: 44px/);
  assert.match(css, /#game \.opphead \.tbtn\.small \{ width: 44px; min-height: 44px/);
  assert.match(css, /#game \.opphead \.tbtn\.small \{ width: 36px; min-height: 36px; \}/);
  assert.match(css, /#game \.zbtn \{ min-width: 40px; min-height: 36px; \}/);
  assert.match(css, /grid-template-areas: "chev seat name name info" "chev seat meta life cmd"/);
  assert.match(css, /#game \.activeaitag \{[\s\S]*?position: absolute;[\s\S]*?white-space: nowrap;/);
  assert.match(css, /@media \(min-width: 1025px\)[\s\S]*?#game \.opprow\.activeai \.personachip \{ display: none; \}[\s\S]*?grid-area: persona;/);
  assert.match(css, /\.effectnoticestack,[\s\S]*?\.spellcopynoticestack \{[\s\S]*?top: 128px;[\s\S]*?width: auto;/);
  assert.match(baseCss, /@media \(max-width: 520px\) \{[\s\S]*?\.attackallocfoot \.btnrow \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(baseCss, /\.attackallocfoot \.pbtn \{ min-width: 0; min-height: 44px;/);
  assert.match(baseCss, /\.overlay \.modal:has\(> \.cardgrid\) > \.btnrow \{[\s\S]*?position: sticky;[\s\S]*?bottom: 0;/);
  assert.match(baseCss, /@media \(max-width: 700px\) \{[\s\S]*?\.combatreviewhead \{[\s\S]*?display: grid;[\s\S]*?\.combatreviewlane \{ grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(baseCss, /\.combatreviewactions \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
});

test('manual mana choices use consistent English player-facing copy', () => {
  assert.match(engine2, /choose mana sources/);
  assert.match(engine2, /sacrifice this card/);
  assert.match(engine2, /granted by/);
  assert.doesNotMatch(engine2, /izaberi mana izvore|žrtvuj ovu kartu|daje \$\{source\.grantedBy\.name\}/);
});

test('command-zone artwork sizing never enlarges mana symbols in the commander cost', () => {
  assert.match(baseCss, /\.czcard\s*>\s*img\s*\{[^}]*width:\s*40px;[^}]*height:\s*54px;/s);
  assert.match(baseCss, /#game\s+\.czcard\s*>\s*img\s*\{[^}]*width:\s*34px;[^}]*height:\s*46px;/s);
  assert.doesNotMatch(baseCss, /(?:^|[,}\s])(?:#game\s+)?\.czcard\s+img\s*\{/m);
});

test('central stack action becomes a usable single-column sheet on phones', () => {
  assert.match(baseCss, /@media \(max-width: 700px\) \{[\s\S]*?\.actionstage \{[\s\S]*?display: block;[\s\S]*?overflow-y: auto;/);
  assert.match(baseCss, /\.actionstageart \{ display: none; \}/);
  assert.match(baseCss, /\.actionstagebuttons \{[\s\S]*?position: sticky;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(baseCss, /\.actionstagebuttons \.pbtn \{ min-width: 0; min-height: 48px;/);
});

test('life, zone, and opponent-detail controls explain their click targets to keyboard and assistive users', () => {
  assert.match(ui, /class="opplife" role="button" tabindex="0" aria-label=/);
  assert.match(ui, /aria-label="Open \$\{esc\(p\.name\)\} player details"/);
  assert.match(ui, /class="melife" role="button" tabindex="0" aria-label=/);
  assert.match(ui, /data-z="graveyard" aria-label="Graveyard:/);
  assert.match(ui, /data-z="exile" aria-label="Exile:/);
  assert.match(ui, /e\.key !== 'Enter' && e\.key !== ' '/);
  assert.match(ui, /d\.setAttribute\('aria-label', `\$\{c\.name\}\. \$\{handAction\}`\)/);
  assert.match(ui, /d\.onkeydown = event =>/);
  assert.match(ui, /event\.stopPropagation\(\);[\s\S]*?d\.click\(\);/);
  assert.match(ui, /makeKeyboardButton\(node, label\)/);
  assert.match(ui, /Select this spell as a target\./);
  assert.match(ui, /Open commander actions\./);
  assert.match(ui, /Face-down permanent/);
  assert.match(ui, /aria-hidden="true" onerror="MTG\.imgFail\(this\)"/);
  assert.match(css, /#game \.sheet \.pbtn \{ min-height: 44px; \}/);
});

test('focused controls do not leak Enter into the global primary-action shortcut', () => {
  assert.match(ui, /ev\.target\.closest\('button, \[role="button"\], a\[href\], input, textarea, select, \[contenteditable="true"\]'\)\) return;/);
  assert.match(ui, /HOLD: armed for the next priority window/);
  assert.doesNotMatch(ui, /HOLD: stajem|HOLD otkazan/);
});

test('gift and life-gain opponent prompts are fully English instead of partially translated', () => {
  const playerFacing = [main, scriptsV7a, scriptsV7c, scriptsV7d].join('\n');
  assert.match(playerFacing, /Who gets Humble Defector\?/);
  assert.match(playerFacing, /who gets the Treefolk\?/);
  assert.match(playerFacing, /who gets the Elf Warriors\?/);
  assert.match(playerFacing, /Who gains the life\?/);
  assert.doesNotMatch(playerFacing, /\b[Kk]o dobija\b|Izabran protivnik|je legalan iz exilea/);
});

test('mobile diplomacy and long help keep their controls readable and reachable', () => {
  assert.match(baseCss, /@media \(max-width: 520px\)[\s\S]*?\.dipfields\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.match(ui, /const head = el\('div', 'sheettitlebar'\)/);
  assert.match(ui, /dismiss\.setAttribute\('aria-label', 'Close help'\)/);
  assert.match(baseCss, /\.sheettitlebar\s*\{[^}]*position:\s*sticky/);
});

test('the narrow Pod Builder keeps every bot control inside its drawer', () => {
  assert.match(css, /#setup \.setupright \.controlintro \{ width: calc\(100% \+ 40px\) !important; \}/);
  assert.match(css, /#setup \.setupright > \* \{ width: 100% !important; flex-shrink: 0; \}/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?#setup \.botstylerow \{[\s\S]*?display: grid !important;[\s\S]*?grid-template-columns: 34px minmax\(0, 1fr\) !important;/);
  assert.match(css, /#setup \.botfields \{ grid-column: 1 \/ -1; width: 100%; min-width: 0; \}/);
  assert.match(css, /#setup \.botfield \{ display: grid !important; grid-template-columns: minmax\(0, 1fr\) !important;/);
});

test('short phones keep card-sheet actions above the fold without removing card art', () => {
  assert.match(css, /@media \(max-width: 420px\) and \(max-height: 700px\)[\s\S]*?#game \.sheetimg:not\(\.noimg\) \{ width: min\(46 \* var\(--vwu\), 150px\); max-height: 210px; object-fit: contain; \}/);
  assert.match(css, /@media \(max-width: 767px\) and \(max-height: 700px\)[\s\S]*?#game\[data-mobile-view="mine"\]:has\(\.promptbar \.btnrow \.pbtn\) \{[\s\S]*?grid-template-rows: 76px 48px 96px minmax\(112px, 1fr\) 96px 108px !important;/);
  assert.match(css, /#game:has\(\.promptbar \.btnrow \.pbtn\) \.promptbar \{ min-height: 96px; max-height: 96px; \}/);
  assert.match(css, /#game \.myboard \{[^}]*justify-content: flex-start;[^}]*overflow-y: auto !important;[^}]*overscroll-behavior: contain;/);
  assert.match(css, /#game \.landrow \{ min-height: 52px; flex-shrink: 0; \}/);
  assert.match(css, /#game \.czrow \{ flex-shrink: 0; \}/);
  assert.match(css, /#game \.myboard:has\(\.playerrail\.has-library-top\) \.landrow \{ order: -1; \}/);
  assert.match(css, /#game \.myboard:has\(\.playerrail\.has-library-top\) \.playerrail \{ order: -1; \}/);
});

test('short tablets reserve a complete row for the visible library-top control', () => {
  assert.match(css, /@media \(min-width: 768px\) and \(max-width: 1279px\) and \(max-height: 760px\)[\s\S]*?#game \.landrow:has\(\.playerrail\.has-library-top\) \{ min-height: 48px !important; flex-shrink: 0; \}/);
  assert.match(css, /#game \.librarytoppeek \{ width: 210px; min-height: 46px;/);
});

test('minimum-height desktop gives the player battlefield enough room to avoid cropped cards', () => {
  assert.match(css, /@media \(min-width: 1280px\) and \(max-height: 700px\)[\s\S]*?grid-template-rows: 58px 20px minmax\(118px, \.55fr\) auto minmax\(210px, 1fr\) auto 108px !important;/);
  assert.match(css, /#game \.cardrow \{ min-height: 78px !important; \}/);
  assert.match(css, /#game \.hand \{ min-height: 96px !important; height: 96px;/);
  assert.match(css, /#game \.sheetimg:not\(\.noimg\) \{ width: min\(30 \* var\(--vhu\), 200px\); max-height: 280px; object-fit: contain; \}/);
});

test('all registered player-facing labels clear the expanded Bosnian leftover audit', () => {
  const MTG = loadEngine();
  const visibleKeys = new Set(['label', 'prompt', 'desc', 'title', 'subtitle', 'text', 'reason', 'message']);
  const leftovers = /\b(?:prokuni|prokletstvo|tapni|enchantaj|goaduj|sačuvaj|ciljaj|bira|izaberi|odaberi|vrati|uništi|egzilaj|žrtvuj|odbaci|plati|stavi|dodaj|ukloni|kopiraj|igrača|protivnika|stvorenje|kartu|život|groblje|ruku|biblioteku|dobija|izgubi|vuci|vući|dva|jedno|svog|tvoje|drugo|najveće|najmanje|može|nema|svaki|svako|kraja|poteza|dok|ako)\b/iu;
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
