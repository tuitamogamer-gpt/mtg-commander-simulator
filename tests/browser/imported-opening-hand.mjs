// PLAYWRIGHT_MODULE may point to an installed Playwright index.mjs.
// Uses a private browser context and a local in-memory account server only.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/imported-opening-hand`;
mkdirSync(output, { recursive: true });
const manifest = JSON.parse(readFileSync(new URL('../../reports/oracle-import/sauron-dark-lord-moxfield.json', import.meta.url), 'utf8'));
const deckText = Object.entries(manifest.sections).flatMap(([section, rows]) => [
  section === 'Commander' ? 'Commander' : 'Deck',
  ...rows.map(row => `${row.quantity} ${row.name}${section === 'Commander' ? ' *CMDR*' : ''}`),
  '',
]).join('\n');
const name = 'Sauron opening-hand regression';
const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
const snapshots = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

async function openLibrary() {
  await page.goto(base);
  await page.locator('[data-menu-action="import"]').first().click();
  await page.waitForFunction(() => !window.MTGAccount.loading && document.querySelector('.mainmenu-deckimport')?.dataset.librarySource === 'guest');
}

async function opening(label) {
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan');
  const snapshot = await page.evaluate(() => {
    const game = window._game;
    const player = game.players.find(player => !player.isAI);
    const visible = JSON.parse(render_game_to_text()).players.find(player => !player.isAI);
    return {
      seed: game.opts.seed,
      hand: player.hand.map(card => card.name),
      visibleHand: visible.hand.map(card => card.name),
      library: player.library.map(card => card.name),
      commanders: player.command.map(card => card.name),
      pod: game.players.filter(player => player.isAI).map(player => ({ deck: player.deckName, style: player.aiStyle })).sort((a, b) => a.deck.localeCompare(b.deck)),
    };
  });
  assert.equal(snapshot.hand.length, 7, label);
  assert.equal(snapshot.library.length, 92, label);
  assert.deepEqual(snapshot.visibleHand, snapshot.hand, 'visible hand matches engine');
  assert.deepEqual(snapshot.commanders, ['Sauron, the Dark Lord']);
  const expected = Object.entries(manifest.sections).filter(([section]) => section !== 'Commander')
    .flatMap(([, rows]) => rows.flatMap(row => Array(row.quantity).fill(row.name))).sort();
  assert.deepEqual([...snapshot.hand, ...snapshot.library].sort(), expected, 'shuffle preserves all 99 library cards');
  snapshots.push({ label, ...snapshot });
  return snapshot;
}

function different(first, second, label) {
  assert.notEqual(first.seed, second.seed, `${label}: fresh seed`);
  assert.notDeepEqual(first.library, second.library, `${label}: fresh library order`);
  assert.notDeepEqual([...first.hand].sort(), [...second.hand].sort(), `${label}: different opening cards`);
}

async function direct(kind, entropy, seed) {
  await openLibrary();
  await page.locator('.mainmenu-deckimport-close').click();
  await page.evaluate(({ kind, entropy, seed, deckText, name }) => {
    const random = Math.random;
    // Control only fresh-game entropy; the real seeded RNG/shuffle/engine run normally.
    Math.random = () => entropy;
    try {
      const options = { name, aiDecks: ['Quick Draw', 'Elven Council', 'Abzan Armor'] };
      if (seed !== undefined) options.seed = seed;
      const result = kind === 'paste'
        ? MTG.startImportedCommanderDeck(deckText, options)
        : MTG.startSavedImportedCommanderDeck(MTG.getImportedDeckLibrary().entries[0].id, options);
      if (!result.game) throw new Error('Imported game did not start');
    } finally { Math.random = random; }
  }, { kind, entropy, seed, deckText, name });
  const result = await opening(`${kind}-${seed ?? entropy}`);
  assert.equal(result.seed, seed === undefined ? Math.floor(entropy * 1e9) : seed, `${kind}: default uses fresh entropy; explicit seed is preserved`);
  return result;
}

async function fromLibrary() {
  await openLibrary();
  await page.locator('.mainmenu-decklibrary-play').click();
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('[data-ai-count="1"]').click();
  await page.locator('.botfields .deckselect').first().selectOption('Quick Draw');
  await page.locator('.podstage .pbtn.start:visible').click();
  await page.locator('.reviewstart').click();
  return opening('library-ui');
}

async function screenshot(filename) {
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.modal .bigcard img')];
    return images.length === 7 && images.every(img => img.complete && img.naturalWidth > 1);
  });
  await page.screenshot({ path: `${output}/${filename}.png`, animations: 'disabled' });
}

try {
  await openLibrary();
  await page.locator('.mainmenu-deckimport-name').fill(name);
  await page.locator('.mainmenu-deckimport-text').fill(deckText);
  await page.locator('.mainmenu-deckimport-check').click();
  await page.locator('.mainmenu-deckimport-start').click();
  await page.waitForSelector('.deckspotlight');
  const savedList = await page.evaluate(() => localStorage.getItem(MTG.IMPORTED_LIBRARY_KEY));

  for (const kind of ['paste', 'saved']) {
    different(await direct(kind, 0.123456789), await direct(kind, 0.987654321), kind);
    console.log(`PASS ${kind}: fresh shuffle before the opening hand`);
    const zero = await direct(kind, 0.111111111, 0);
    assert.deepEqual(await direct(kind, 0.999999999, 0), zero, `${kind}: explicit seed 0 reproduces the hand and library`);
    console.log(`PASS ${kind}: explicit seed 0 remains reproducible`);
  }

  const first = await fromLibrary();
  await screenshot('01-opening');
  const second = await fromLibrary();
  different(first, second, 'My Library after reload');
  await screenshot('02-new-game-opening');
  console.log('PASS real My Library → Pod → Review → Start twice: fresh opening hands');

  await page.getByRole('button', { name: /Mulligan/ }).click();
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan' && !window._ui.pending.q.free);
  const mulligan = await opening('free-mulligan');
  assert.equal(mulligan.seed, second.seed, 'mulligan continues the current RNG');
  assert.notDeepEqual(mulligan.library, second.library, 'mulligan shuffles the returned hand into the library');
  assert.notDeepEqual([...mulligan.hand].sort(), [...second.hand].sort());
  await screenshot('03-mulligan');

  await page.evaluate(() => { MTG.rematchLastGame(); });
  const rematch = await opening('rematch');
  different(second, rematch, 'rematch');
  assert.deepEqual(rematch.pod, second.pod, 'rematch preserves opponent decks and styles');
  assert.equal(await page.evaluate(() => localStorage.getItem(MTG.IMPORTED_LIBRARY_KEY)), savedList, 'new games never rewrite the saved deck');
  console.log('PASS free mulligan and rematch shuffle; saved list and chosen pod are preserved');
  await page.getByRole('button', { name: /Keep/ }).click();
  await page.waitForFunction(() => window._game.turnNo > 0 && window._ui?.pending?.q.type !== 'mulligan');
  await page.screenshot({ path: `${output}/04-kept-hand-gameplay.png`, animations: 'disabled' });
  console.log('PASS Keep accepts the shuffled hand and advances into gameplay');
  assert.deepEqual(errors, [], 'no browser console/page errors');
  writeFileSync(`${output}/results.json`, JSON.stringify({ snapshots, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
