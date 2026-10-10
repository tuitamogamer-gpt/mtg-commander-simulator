// Real guest import and mobile opening hand. Remote artwork is fetched from
// Scryfall; no image requests, deck cards, or game decisions are stubbed.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = process.env.CARD_IMAGE_BASELINE_FILE;
const output = `${root}output/web-game/imported-card-images/${baseline ? 'baseline' : 'fixed'}`;
mkdirSync(output, { recursive: true });
const deckText = readFileSync(new URL('../fixtures/yuriko-custom-deck.txt', import.meta.url), 'utf8')
  .trimEnd().replace(/1 Yuriko, the Tiger's Shadow$/, "1 Yuriko, the Tiger's Shadow *CMDR*");
const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
if (baseline) app.get('/src/card-images.js', (_request, response) => response.sendFile(baseline));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
const errors = [], failedRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

try {
  await page.goto(base);
  await page.locator('[data-menu-action="import"]').first().click();
  await page.waitForFunction(() => !window.MTGAccount.loading && document.querySelector('.mainmenu-deckimport')?.dataset.librarySource === 'guest');
  await page.locator('.mainmenu-deckimport-name').fill('Yuriko artwork regression');
  await page.locator('.mainmenu-deckimport-text').fill(deckText);
  await page.locator('.mainmenu-deckimport-check').click();
  await page.locator('.mainmenu-deckimport-start').click();
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('[data-ai-count="3"]').click();
  for (const [index, name] of ['Quick Draw', 'Elven Council', 'Abzan Armor'].entries()) {
    await page.locator('.botfields .deckselect').nth(index).selectOption(name);
    await page.locator('.botfields .styleselect:not(.deckselect)').nth(index).selectOption('balanced');
  }
  await page.locator('.podstage .pbtn.start:visible, .podstage .setupnext:visible').click();
  await page.locator('.reviewstart').waitFor({ state: 'visible' });
  await page.evaluate(() => {
    // Seed 717 naturally draws both reported cards from the unmodified list.
    // Control only new-game entropy while the real review/start action runs.
    const random = Math.random;
    Math.random = () => 717 / 1e9;
    try { document.querySelector('.reviewstart').click(); }
    finally { Math.random = random; }
  });
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan');
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll('.modal .bigcard img')];
    return images.length === 7 && images.every(image => image.complete && image.naturalWidth > 1);
  }, null, { timeout: 60000 });
  const opening = await page.evaluate(() => ({
    seed: _game.opts.seed,
    hand: _game.players.find(player => !player.isAI).hand.map(card => card.name),
    images: [...document.querySelectorAll('.modal .bigcard')].map(card => {
      const image = card.querySelector('img');
      return { name: card.dataset.cardName, src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight };
    }),
    placeholder: MTG.CARD_IMAGE_PLACEHOLDER,
  }));
  assert.equal(opening.seed, 717);
  assert.equal(opening.hand.length, 7);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'mobile layout fits viewport');
  for (const name of ['Fell the Profane', 'Consign // Oblivion']) {
    const image = opening.images.find(image => image.name === name);
    assert.ok(image, `${name} is present in the natural opening hand`);
    if (baseline) assert.equal(image.src, opening.placeholder, `${name} reproduces the missing-artwork placeholder`);
    else assert.notEqual(image.src, opening.placeholder, `${name} displays card artwork`);
  }
  if (!baseline) for (const image of opening.images) {
    assert.notEqual(image.src, opening.placeholder, `${image.name} displays artwork`);
    assert.ok(image.width > 1, `${image.name} image decoded successfully`);
  }
  await page.screenshot({ path: `${output}/01-opening-hand.png`, animations: 'disabled' });

  let back = null;
  if (!baseline) {
    back = await page.evaluate(async () => {
      const src = MTG.cardImageURL('Fell Mire');
      const image = new Image();
      image.src = src;
      await image.decode();
      return { src, width: image.naturalWidth, height: image.naturalHeight };
    });
    assert.equal(new URL(back.src).searchParams.get('face'), 'back', 'Fell Mire requests its physical back face');
    assert.ok(back.width > 1, 'Fell Mire artwork decodes successfully');
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  assert.deepEqual(failedRequests, [], 'all browser requests complete');
  writeFileSync(`${output}/results.json`, JSON.stringify({ opening, back, errors, failedRequests }, null, 2) + '\n');
  console.log(`PASS ${baseline ? 'baseline reproduces' : 'fixed mobile import displays'} Fell the Profane and Consign // Oblivion${baseline ? '' : '; Fell Mire back-face artwork loads'}`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, animations: 'disabled' });
  writeFileSync(`${output}/failure.json`, JSON.stringify({ error: error.stack, errors, failedRequests }, null, 2) + '\n');
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
