import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../index.html');
const publicEntry = read('../src/public-entry.js');
const main = read('../src/modules/main.js');
const ui = read('../src/modules/ui.js');
const css = read('../src/public-menu.css');
const api = read('../api/ws.js');
const vercel = JSON.parse(read('../vercel.json'));
const packageScript = read('../scripts/package-public.mjs');
const publicGuide = read('../PUBLIC_RELEASE.md');

test('public home is the default entry and exposes clear Solo, Live, import, guide, and setup routes', () => {
  assert.match(index, /id="setup" data-app-view="home" aria-busy="true"/);
  assert.match(index, /class="mainmenu mainmenu-boot"/);
  assert.match(index, /class="mainmenu-primary" data-menu-action="solo"/);
  assert.match(index, /class="mainmenu-import-action" data-menu-action="import"/);
  assert.match(index, /assets\/menu\/invisible-woman\.webp/);
  assert.match(index, /width="300" height="418" decoding="async"/);
  assert.match(index, /class="mainmenu-skip" href="#primary-actions"/);
  assert.match(index, /class="mainmenu mainmenu-boot"[^>]*>[\s\S]*?class="mainmenu-skip"/);
  assert.match(main, /if \(!bootPage\) page\.innerHTML = `[\s\S]*?class="mainmenu-skip"/);
  assert.match(index, /class="mainmenu-navlinks" aria-label="Explore Commander Simulator"/);
  assert.match(publicEntry, /id="how-it-works"/);
  assert.match(index, /viewport-fit=cover/);
  assert.doesNotMatch(index, /id="desktop-only"/);
  assert.match(index, /type="module" src="\.\/src\/public-entry\.js"/);
  assert.doesNotMatch(index, /type="module" src="\.\/src\/(?:app|data)\.js"/);
  assert.match(index, /rel="preload" as="image" href="\.\/assets\/backgrounds\/commander-war-room\.webp" type="image\/webp" fetchpriority="high"/);
  assert.match(main, /function renderMainMenu\(\)/);
  assert.match(main, /renderMainMenu\(\);[\s\S]*const smoke = initialParams/);
  assert.match(main, /data-menu-action="solo"/);
  assert.match(main, /data-menu-action="live"/);
  assert.match(main, /data-menu-action="import"/);
  assert.match(main, /data-menu-action="tour"/);
  assert.match(main, /mtgOnboardingComplete/);
  assert.match(main, /root\.removeAttribute\('aria-busy'\)/);
  assert.match(main, /function renderSetup\(options = \{\}\) \{[\s\S]*?root\.innerHTML = '';[\s\S]*?root\.removeAttribute\('aria-busy'\)/);
  assert.match(main, /const pendingSetupMode = window\.__mtgPendingSetupMode/);
  assert.match(main, /document\.readyState === 'loading'/);
  assert.match(main, /renderSetup\(\{ mode: continueMode \|\| 'solo' \}\)/);
  assert.match(main, /renderSetup\(\{ mode: 'online' \}\)/);
  assert.match(main, /head\.querySelector\('\.setuphome'\)\.onclick = \(\) => \{[\s\S]*?renderMainMenu\(\)/);
  assert.match(main, /mode: 'menu'/);
});

test('main menu decklist import is a persistent fail-closed library gateway with an external Moxfield builder link', () => {
  assert.match(index, /Import your decklist here/);
  assert.match(main, /<h2 id="deckimport-title">Import your decklist here<\/h2>/);
  assert.match(main, /class="mainmenu-deckimport-text"/);
  assert.match(main, /class="mainmenu-deckimport-check">Check decklist/);
  assert.match(main, /class="mainmenu-deckimport-start" disabled>Save to My Library/);
  assert.match(main, /class="mainmenu-decklibrary"/);
  assert.match(main, /U\.importCommanderDeck\(textInput\.value/);
  assert.match(main, /saveImportedDeckToLibrary\(currentValidation\)/);
  assert.match(main, /U\.prepareSavedImportedCommanderDeck\(card\.dataset\.deckId\)/);
  assert.match(main, /U\.prepareSavedImportedCommanderDeck\(saved\.id\)/);
  assert.match(main, /renderSetup\(\{ mode: 'solo', importedDeckId: id \}\)/);
  assert.match(main, /startBtn\.onclick = \(\) => state\.importedDeckId \? setSetupStage\('review'\)/);
  assert.match(main, /state\.importedLibraryOwner !== currentImportedLibraryOwner\(\)/);
  assert.match(main, /if \(!saved \|\| saved\.id !== record\.id\) throw new Error/);
  assert.match(main, /U\.validateImportedDeckRecord\(record\)/);
  assert.match(main, /U\.loadGuestImportedDeckLibrary\(\)/);
  assert.match(main, /https:\/\/moxfield\.com\//);
  assert.match(main, /Commander Simulator is the play table, not the deck builder/);
  assert.match(main, /Cards not yet certified for this engine are listed before the game starts/);
  assert.match(publicEntry, /loadGame\('import'\)/);
  assert.match(publicEntry, /globalThis\.MTG\?\.showDeckImport\?\.\(\)/);
  assert.match(css, /\.mainmenu-deckimport-panel/);
  assert.match(css, /\.mainmenu-deckimport-result\[data-state="error"\]/);
  assert.match(css, /\.mainmenu-deckimport-start:disabled/);
  assert.match(css, /\.mainmenu-decklibrary-card\.is-unavailable/);
});

test('first-game onboarding explains the complete user decision model without external AI claims', () => {
  const home = main.slice(main.indexOf('function renderMainMenu'), main.indexOf('function renderSetup'));
  assert.match(home, /Your deck is complete/);
  assert.match(home, /You control one seat/);
  assert.match(home, /HOLD opens priority/);
  assert.match(home, /Proceed protects clarity/);
  assert.match(home, /without an external model API/);
  assert.doesNotMatch(home, /[—–]/);
  assert.match(home, /U\.enhanceDialog\(overlay, dialog/);
  assert.match(publicEntry, /Your deck is complete/);
  assert.match(publicEntry, /HOLD opens priority/);
  assert.match(publicEntry, /dialog\.setAttribute\('role', 'dialog'\)/);
  assert.match(publicEntry, /closeButton\.focus\(\{ preventScroll: true \}\)/);
  assert.match(publicEntry, /dialog\.scrollTop = 0/);
  assert.match(publicEntry, /document\.body\.classList\.add\('mainmenu-dialog-open'\)/);
  assert.match(main, /initialFocus: dialog\.querySelector\('\.mainmenu-onboarding-close'\)/);
  assert.match(main, /setupTitle\.tabIndex = -1/);
  assert.match(main, /setupTitle\.focus\(\{ preventScroll: true \}\)/);
});

test('heavy rules and deck modules wait for a real setup or deep-link request', () => {
  assert.match(publicEntry, /await import\('\.\/data\.js'\)/);
  assert.match(publicEntry, /await import\('\.\/app\.js'\)/);
  assert.match(publicEntry, /window\.__mtgPendingSetupMode = mode/);
  assert.match(publicEntry, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(publicEntry, /room.*onlineSmoke.*smokeDeck/s);
  assert.match(publicEntry, /root\.appendChild\(veil\)/);
  assert.match(publicEntry, /page\.inert = true/);
});

test('public menu is responsive, motion-safe, and uses real game artwork', () => {
  assert.ok(index.indexOf('./src/public-menu.css') < index.indexOf('./src/frontend-overhaul.css'));
  assert.match(index, /\.\/src\/frontend-overhaul\.css" media="print" onload="this\.media='all'"/);
  assert.match(css, /#setup\[data-app-view="home"\]/);
  assert.match(css, /commander-war-room\.webp/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /@media \(max-width: 900px\) and \(max-height: 650px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-height: 100dvh/);
  assert.match(css, /\.mainmenu-card img \{[\s\S]*?height: auto/);
  assert.match(css, /\.mainmenu-proof \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /:is\(a, button\):focus-visible/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /translateY\(calc\(-100% - max\(10px, env\(safe-area-inset-top\)\)\)\)/);
  assert.doesNotMatch(css, /addEventListener\(['"]scroll/);
});

test('cold and warm landing menus keep the same public content and accessibility contract', () => {
  for (const source of [publicEntry, main]) {
    assert.match(source, /THE FULL GAME, MADE READABLE/);
    assert.match(source, /Three local AI opponents/);
    assert.match(source, /Account optional; no public lobby/);
    assert.match(source, /Pick a deck\. We will set the table\./);
    assert.match(source, /class="mainmenu-livecheck"[^>]*role="status" aria-live="polite"/);
    assert.match(source, /id="ways-to-play"/);
    assert.match(source, /data-menu-action="solo"/);
    assert.match(source, /data-menu-action="live"/);
  }
  assert.match(index, /Play instantly\. Save when you sign in\./);
  assert.match(main, /Play instantly\. Save when you sign in\./);
  assert.match(index, /class="mainmenu-trust"/);
  assert.match(main, /class="mainmenu-trust"/);
});

test('share previews and the official fan-project notice are present', () => {
  assert.match(index, /name="description"/);
  assert.match(index, /property="og:title"/);
  assert.match(index, /property="og:image" content="https:\/\/mtg-commander-simulator\.vercel\.app\/assets\/backgrounds\/commander-war-room\.jpg"/);
  assert.match(index, /name="twitter:card" content="summary_large_image"/);
  assert.match(main, /unofficial Fan Content permitted under the/);
  assert.match(main, /company\.wizards\.com\/en\/legal\/fancontentpolicy/);
  assert.match(publicGuide, /Fan project notice/);
});

test('Arena exits return to the new main menu instead of bypassing it', () => {
  assert.match(ui, /action\('Main menu', soloSaveAvailable/);
  assert.match(ui, /typeof MTG\.exitToMainMenu === 'function'/);
  assert.match(ui, /const setup = el\('button', 'pbtn', 'Main menu'\)/);
  assert.match(main, /MTG\.exitToMainMenu = \(\) => \{[\s\S]*?location\.replace\(location\.pathname\)/);
});

test('public backend response and hosting headers are safe for an audience build', () => {
  assert.match(api, /response\.set\('Cache-Control', 'no-store'\)/);
  assert.match(api, /Live room storage is unavailable\./);
  const headers = vercel.headers.flatMap(rule => rule.headers).map(header => `${header.key}:${header.value}`);
  assert.ok(headers.some(value => value.startsWith('X-Content-Type-Options:nosniff')));
  assert.ok(headers.some(value => value.startsWith('Referrer-Policy:strict-origin-when-cross-origin')));
  assert.ok(headers.some(value => value.startsWith('Permissions-Policy:')));
  assert.ok(headers.some(value => value.includes('max-age=31536000, immutable')));
});

test('public archive script includes local media, backend, tests, and integrity verification', () => {
  assert.match(packageScript, /'assets'/);
  assert.match(packageScript, /'api'/);
  assert.match(packageScript, /'tests'/);
  assert.match(packageScript, /spawnSync\('unzip', \['-tq', output\]/);
  assert.match(packageScript, /commander-simulator-public\.zip/);
});
