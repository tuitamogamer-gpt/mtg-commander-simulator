// Execute with PLAYWRIGHT_MODULE, CHROMIUM_EXECUTABLE and REDIS_SERVER_BINARY
// pointing to local executables. Redis uses a private socket and temporary data.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, UpstashAccountStore } from '../../api/account.js';
import { loadEngine } from '../helpers/load-engine.mjs';
import { startLocalAccountRedis } from '../helpers/local-account-redis.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/redis-deck-recovery-2026-10-09`;
mkdirSync(output, { recursive: true });
const commander = "Yuriko, the Tiger's Shadow";
const rawText = readFileSync(new URL('../fixtures/yuriko-custom-deck.txt', import.meta.url), 'utf8');
const deckText = rawText.trimEnd().replace(/1 Yuriko, the Tiger's Shadow$/, `1 ${commander} *CMDR*`);
const clone = value => JSON.parse(JSON.stringify(value));
const M = loadEngine();
const validation = M.importCommanderDeck(deckText, { name: 'Yuriko' });
assert.equal(validation.ok, true, validation.errors.map(error => error.message).join('\n'));
assert.equal(validation.summary.resolvedCards, 100);
const validRecord = clone(M.createImportedDeckRecord(validation, { id: 'deck-yuriko-redis-recovery-legacy' }));
const legacy = {
  ...validRecord,
  revision: 7,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-10-09T12:00:00.000Z',
  _libraryNameKey: 'yuriko',
  auxiliaryV87: { ...validRecord.auxiliaryV87, colors: [], draft: [] },
};
const invalid = M.validateImportedDeckRecord(legacy);
assert.equal(invalid.ok, false, 'the fixture reproduces the historical broken account deck');
assert.ok(invalid.errors.some(error => error.code === 'chosen-colors'));
const expectedRecovered = clone(legacy);
delete expectedRecovered._libraryNameKey;
expectedRecovered.auxiliaryV87.colors = {};
expectedRecovered.auxiliaryV87.draft = {};

const redis = await startLocalAccountRedis();
const store = new UpstashAccountStore(redis.adapter);
const app = express();
app.use('/api/account', createAccountHandler({ store, limiter: null }));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const errors = [];
let currentPage;
const proof = { store: store.kind, realRedisLua: true, viewport: { width: 390, height: 844 }, inputCards: 100, commander };

async function importer(page) {
  if (await page.locator('.deckspotlightclose').count()) await page.locator('.deckspotlightclose').click();
  if (await page.locator('.setuphome').count()) await page.locator('.setuphome').click();
  await page.locator('[data-menu-action="import"]').first().click();
  await page.waitForSelector('.mainmenu-deckimport-panel');
  await page.waitForFunction(() => !MTGAccount.loading && document.querySelector('.mainmenu-deckimport')?.dataset.librarySource !== 'loading');
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile page has no horizontal overflow');
  assert.equal(await page.evaluate(() => {
    const panel = document.querySelector('.mainmenu-deckimport-panel, .deckspotlight');
    return !panel || panel.scrollWidth <= panel.clientWidth;
  }), true, 'mobile dialog has no horizontal overflow');
}

async function readyRecord(page, record) {
  const entry = await page.evaluate(id => MTG.getImportedDeckLibrary().entries.find(row => row.id === id), record.id);
  assert.ok(entry);
  assert.equal(entry.ready, true, JSON.stringify(entry.issues));
  assert.deepEqual(entry.record, record, 'record identity, cards and metadata survive response recovery/reload');
  const card = page.locator(`.mainmenu-decklibrary-card[data-deck-id="${record.id}"]`);
  assert.equal(await card.getAttribute('data-ready'), 'true');
  assert.match(await card.innerText(), /READY TO PLAY/);
  assert.equal(await card.locator('.mainmenu-decklibrary-play').isDisabled(), false);
  assert.equal(await page.getByText('Chosen colors must be recorded by card name.', { exact: true }).count(), 0);
  await noOverflow(page);
  return card;
}

async function chooseRecord(page, record) {
  const card = await readyRecord(page, record);
  await card.locator('.mainmenu-decklibrary-play').click();
  await page.waitForSelector('.deckspotlight');
  assert.equal(await page.locator('.deckspotlight h2').innerText(), record.name);
  assert.equal(await page.evaluate(() => !!window._game), false, 'Choose deck opens its spotlight without starting a game');
  await noOverflow(page);
}

try {
  const context = await browser.newContext();
  const registration = await context.request.post(`${base}/api/account`, {
    data: { action: 'register', displayName: 'Redis Yuriko QA', email: `${redis.ownerPrefix}@example.test`, password: 'Local-only-Redis-Yuriko-384199!' },
  });
  const registered = await registration.json();
  assert.equal(registered.ok, true, registered.error);
  const owner = registered.user.id;
  const libraryKey = `commander-account:v1:decks:${owner}`;
  const namesKey = `commander-account:v1:deck-names:${owner}`;
  const brokenRaw = JSON.stringify(legacy);
  await redis.rawRedis.hset(libraryKey, legacy.id, brokenRaw);
  await redis.rawRedis.hset(namesKey, 'yuriko', legacy.id);
  const response = await context.request.get(`${base}/api/account?action=decks&expectedOwnerId=${owner}`);
  assert.equal(response.status(), 200);
  const fetched = await response.json();
  assert.equal(fetched.ok, true, fetched.error);
  assert.deepEqual(fetched.decks, [expectedRecovered]);
  assert.equal(await redis.rawRedis.hget(libraryKey, legacy.id), brokenRaw, 'GET repairs the response without rewriting historical storage');
  assert.equal(M.validateImportedDeckRecord(fetched.decks[0]).ok, true);

  const page = await context.newPage();
  currentPage = page;
  await page.setViewportSize(proof.viewport);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  await page.goto(base);
  await importer(page);
  await readyRecord(page, expectedRecovered);
  await page.screenshot({ path: `${output}/01-recovered-yuriko-ready.png` });
  await page.reload();
  await importer(page);
  await chooseRecord(page, expectedRecovered);
  await page.screenshot({ path: `${output}/02-recovered-yuriko-spotlight.png` });
  assert.equal(await redis.rawRedis.hget(libraryKey, legacy.id), brokenRaw);
  proof.legacy = { id: legacy.id, name: legacy.name, readyAfterGetAndReload: true, metadataUnchanged: true, cardsUnchanged: true, rawStorageUnchanged: true, spotlightSelectable: true };
  console.log('PASS real Redis account GET + mobile reload recover the existing Yuriko record unchanged; Choose deck opens spotlight');

  await importer(page);
  await page.locator('.mainmenu-deckimport-name').fill('Yuriko');
  await page.locator('.mainmenu-deckimport-text').fill(deckText);
  await page.locator('.mainmenu-deckimport-check').click();
  assert.equal(await page.evaluate(() => JSON.parse(render_game_to_text()).deckImport.state), 'ready');
  const status = page.locator('.mainmenu-deckimport-result');
  assert.equal(await status.locator('b').innerText(), 'Yuriko (2)');
  assert.match(await status.innerText(), /100 engine-certified/);
  await status.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await page.screenshot({ path: `${output}/03-fresh-yuriko-duplicate-ready.png` });
  await page.locator('.mainmenu-deckimport-start').click();
  await page.waitForSelector('.deckspotlight');
  assert.equal(await page.locator('.deckspotlight h2').innerText(), 'Yuriko (2)');
  const fresh = await page.evaluate(() => MTG.getImportedDeckLibrary().entries.find(row => row.name === 'Yuriko (2)').record);
  assert.notEqual(fresh.id, legacy.id);
  assert.deepEqual(fresh.cards, expectedRecovered.cards);
  assert.deepEqual(fresh.auxiliaryV87, validRecord.auxiliaryV87);
  const storedFresh = JSON.parse(await redis.rawRedis.hget(libraryKey, fresh.id));
  assert.deepEqual(storedFresh.auxiliaryV87.colors, {});
  assert.deepEqual(storedFresh.auxiliaryV87.draft, {});
  for (const field of ['attractions', 'stickers', 'outsideGame']) {
    assert.ok(Array.isArray(storedFresh.auxiliaryV87[field]), `${field} remains an array after the production Lua save`);
    assert.deepEqual(storedFresh.auxiliaryV87[field], []);
  }
  await page.reload();
  await importer(page);
  await readyRecord(page, expectedRecovered);
  await readyRecord(page, fresh);
  assert.equal(await page.locator('.mainmenu-decklibrary-card').count(), 2);
  await page.screenshot({ path: `${output}/04-fresh-and-existing-yuriko-reloaded.png` });
  assert.equal(await redis.rawRedis.hget(libraryKey, legacy.id), brokenRaw);
  proof.fresh = { name: fresh.name, freshId: true, persistedAfterReload: true, objectMapsPreserved: true, trueArraysPreserved: true, originalUnchanged: true };
  console.log('PASS fresh browser save/reload uses actual production Redis Lua; object maps and true arrays survive, both decks are ready');

  page.once('dialog', dialog => dialog.accept());
  await page.locator(`.mainmenu-decklibrary-card[data-deck-id="${fresh.id}"] .mainmenu-decklibrary-remove`).click();
  await page.waitForFunction(() => document.querySelectorAll('.mainmenu-decklibrary-card').length === 1);
  assert.equal(await redis.rawRedis.hexists(libraryKey, fresh.id), 0);
  assert.equal(await redis.rawRedis.hget(namesKey, 'yuriko (2)'), null);
  assert.equal(await redis.rawRedis.hget(libraryKey, legacy.id), brokenRaw);
  await readyRecord(page, expectedRecovered);
  proof.fresh.removedThroughRealRedisLua = true;
  assert.equal(await page.evaluate(() => !!window._game), false);
  assert.deepEqual(errors, [], 'browser emits no console or page errors');
  proof.browserErrors = errors;
  proof.gameStarted = false;
  writeFileSync(`${output}/result.json`, JSON.stringify(proof, null, 2) + '\n');
  console.log('PASS real Redis deletion preserves the original; no browser errors, no mobile overflow, no game starts');
} catch (error) {
  if (currentPage) {
    await currentPage.screenshot({ path: `${output}/failure.png` });
    console.error((await currentPage.locator('body').innerText()).slice(-5000));
  }
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  await redis.close();
}
