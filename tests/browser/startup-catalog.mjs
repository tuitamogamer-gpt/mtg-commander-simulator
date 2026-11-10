// The table opens with the cards of built-in decks only. The rest of the card
// collection is loaded when an imported deck needs it: here, when My Library
// opens. `?catalog=startup` asks for that path; a page under automation would
// otherwise load the complete collection before the table opens.
// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package; GAME_URL may select an existing preview.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = process.env.GAME_URL ? null : express().use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const errors = [];

async function open(viewport, catalog) {
  const page = await browser.newPage(viewport);
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.addInitScript(() => localStorage.setItem('mtgOnboardingComplete', '1'));
  const url = new URL(base);
  url.searchParams.set('catalog', catalog);
  await page.goto(url.href);
  const batches = () => requests.filter(path => path.includes('/src/oracle-batches/')).length;
  return {page, requests, batches};
}

try {
  for (const [label, viewport] of [['1440px', {viewport: {width: 1440, height: 900}}],
    ['390px', {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}]]) {
    const {page, requests, batches} = await open(viewport, 'startup');
    const started = Date.now();
    await page.locator('[data-menu-action="solo"]').first().click();
    await page.locator('.deckentry').first().waitFor({timeout: 120000});
    const opened = Date.now() - started;
    const table = await page.evaluate(() => ({complete: MTG.oracleCatalogComplete(), definitions: Object.keys(MTG.DEFS).length,
      decks: Object.keys(MTG.DECKS).length, counted: MTG.landingCounts().importableCards, summary: MTG.CATALOG_SUMMARY.importableCards}));
    assert.equal(table.complete, false, `${label}: the table opens before the complete collection`);
    assert.equal(batches(), 0, `${label}: no Oracle batch is requested to open the table`);
    assert.ok(requests.some(path => path.endsWith('/src/app-startup.js')) && !requests.some(path => path.endsWith('/src/app.js')),
      `${label}: the page loads the startup list`);
    assert.ok(table.decks >= 180 && table.definitions > 6000 && table.definitions < 12000, `${label}: ${JSON.stringify(table)}`);
    assert.equal(table.counted, table.summary, `${label}: the page still counts every importable card`);
    console.log(`PASS ${label} the table opens with ${table.definitions} definitions and no Oracle batch (${opened} ms)`);

    // A real game with built-in decks, through the setup screens.
    const startupNames = await page.evaluate(() => Object.keys(MTG.DEFS));
    await page.locator('.decksearch input').fill('Quick Draw');
    await page.locator('.deckcard:visible').first().click();
    await page.locator('.deckspotlightcontinue').click();
    await page.locator('.podpresets').evaluate(details => { details.open = true; });
    await page.locator('[data-pod-preset="classic"]').click();
    await page.locator('.setupnext').click();
    await page.locator('.reviewstart').click();
    await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', undefined, {timeout: 60000});
    const game = await page.evaluate(() => ({complete: MTG.oracleCatalogComplete(), players: _game.players.length,
      cards: _game.players.map(player => player.library.length + player.hand.length + player.command.length),
      unknown: _game.players.flatMap(player => [...player.library, ...player.hand, ...player.command]).filter(card => !card.def || !card.def.name).length}));
    assert.deepEqual(game, {complete: false, players: 4, cards: [100, 100, 100, 100], unknown: 0}, `${label}: ${JSON.stringify(game)}`);
    assert.equal(batches(), 0, `${label}: a game with built-in decks needs no Oracle batch`);
    console.log(`PASS ${label} a four-player game with built-in decks starts without the rest of the collection`);

    // My Library: the collection completes while the list is pasted, and a
    // list with a card outside the startup subset passes the check.
    await page.evaluate(() => MTG.exitToMainMenu());
    await page.locator('[data-menu-action="import"]:visible').first().click();
    await page.locator('.mainmenu-deckimport-text').waitFor();
    await page.waitForFunction(() => MTG.oracleCatalogComplete(), undefined, {timeout: 180000});
    assert.ok(batches() > 200, `${label}: opening My Library loads the complete collection (${batches()} batches)`);
    const list = await page.evaluate(known => {
      const loaded = new Set(known), deck = MTG.DECKS['Quick Draw'];
      const inDeck = new Set(deck.cards.map(row => row.name));
      const identity = new Set(MTG.cardColorIdentity(MTG.DEFS[deck.commander]));
      // A card no built-in deck uses, legal in this deck's colors.
      const outside = Object.values(MTG.CARD_CATALOG).find(card => !loaded.has(card.name) && !inDeck.has(card.name) &&
        card.deckImportEligible && card.commanderLegality === 'legal' && !/Land|Basic/.test(card.typeLine) &&
        !card.name.includes('//') && card.colorIdentity.length > 0 && card.colorIdentity.every(color => identity.has(color)));
      const swapped = deck.cards.find(row => row.name !== deck.commander && !MTG.DEFS[row.name].types.includes('Land') && row.n === 1);
      const lines = ['Commander', `1 ${deck.commander} *CMDR*`, '', 'Deck'];
      for (const row of deck.cards) {
        if (row.name === deck.commander) continue;
        lines.push(`${row.n} ${row === swapped ? outside.name : row.name}`);
      }
      return {text: lines.join('\n'), outside: outside.name, swapped: swapped.name, definitions: Object.keys(MTG.DEFS).length};
    }, startupNames);
    assert.ok(!startupNames.includes(list.outside), `${label}: ${list.outside} was not loaded at startup`);
    assert.ok(list.definitions > 30000, `${label}: ${list.definitions} definitions after completion`);
    await page.locator('.mainmenu-deckimport-text').fill(list.text);
    await page.locator('.mainmenu-deckimport-check').click();
    await page.waitForFunction(() => ['ready', 'error'].includes(document.querySelector('.mainmenu-deckimport')?.dataset.importState), undefined, {timeout: 60000});
    const result = await page.evaluate(() => ({state: document.querySelector('.mainmenu-deckimport').dataset.importState,
      text: document.querySelector('.mainmenu-deckimport-result').textContent.slice(0, 300)}));
    assert.equal(result.state, 'ready', `${label}: the list with ${list.outside} passes: ${result.text}`);
    console.log(`PASS ${label} My Library completes the collection; a list with ${list.outside} is ready to play`);
    await page.close();
  }

  // Asked for the complete collection before the table opens: as before.
  {
    const {page, batches} = await open({viewport: {width: 1440, height: 900}}, 'full');
    await page.locator('[data-menu-action="solo"]').first().click();
    await page.locator('.deckentry').first().waitFor({timeout: 180000});
    const table = await page.evaluate(() => ({complete: MTG.oracleCatalogComplete(), definitions: Object.keys(MTG.DEFS).length}));
    assert.equal(table.complete, true);
    assert.ok(table.definitions > 30000 && batches() > 200, JSON.stringify(table));
    console.log(`PASS ?catalog=full opens the table with all ${table.definitions} definitions`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) server.close();
}
