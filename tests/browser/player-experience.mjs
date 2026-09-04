// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser/player-experience.mjs
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = `${root}output/web-game/player-experience`;
mkdirSync(out, { recursive: true });
const server = express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null })).use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [], requests = [], checks = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) requests.push({ status: response.status(), url: response.url() }); });
const shot = name => page.screenshot({ path: `${out}/${name}.png` });
const state = () => page.evaluate(() => MTG.renderGameState());
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
async function noOverflow(label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, label);
}
async function openSetup() {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry');
}
try {
  await openSetup();
  assert.equal((await state()).deckView, 'gallery');
  assert.equal(await page.locator('.setupright').isVisible(), false);
  assert.equal(await page.locator('.deckcard').first().evaluate(node => getComputedStyle(node).display), 'flex');
  await page.waitForFunction(() => [...document.querySelectorAll('.deckart')].slice(0, 3).every(img => img.complete && img.naturalWidth > 0));
  await shot('desktop-gallery');
  await page.locator('[data-deck-view="compact"]').click();
  assert.equal((await state()).deckView, 'compact');
  await shot('desktop-compact');
  await page.locator('.decksearch input').fill('quick draw');
  assert.deepEqual((await state()).visibleDecks, ['Quick Draw']);
  await page.locator('.deckfavorite:visible').click();
  await page.locator('.filterchip').click();
  await page.locator('.favoritefilter').click();
  assert.deepEqual((await state()).visibleDecks, ['Quick Draw']);
  await page.locator('.favoritefilter').click();
  await page.locator('[data-playstyle="tokens"]').click();
  assert.ok((await state()).visibleDecks.length > 0);
  await page.locator('.filterchip').click();
  assert.equal(await page.locator('[data-playstyle][aria-pressed="true"]').count(), 0);
  await page.locator('.decksearch input').fill('no such commander abc');
  assert.equal(await page.locator('.deckempty').isVisible(), true);
  await page.locator('.deckemptyreset').click();
  await page.locator('.decksearch input').fill('Quick Draw');
  await page.locator('.surprisedeck').click();
  assert.equal((await state()).selectedDeck, 'Quick Draw');
  assert.equal(await page.locator('.manacurvebin').count(), 8);
  assert.match(await page.locator('.manacurvestats').innerText(), /lands/);
  await page.locator('.deckanalysis').scrollIntoViewIfNeeded();
  await shot('deck-analysis');
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('[data-pod-preset="challenge"]').click();
  await page.locator('.setupnext').click();
  assert.equal((await state()).stage, 'review');
  assert.match(await page.locator('.reviewrules').innerText(), /hard/i);
  assert.match(await page.locator('.reviewrules').innerText(), /Enabled after round 3/i);
  await page.locator('#pod-save-name').fill('Friday <table>');
  await page.locator('.savepodform button').click();
  assert.match(await page.locator('.savepodstatus').innerText(), /Saved on this device/);
  await page.locator('[data-step="deck"]').click();
  await page.locator('.savedpodopen').click();
  assert.equal((await state()).stage, 'review');
  assert.match(await page.locator('.reviewrules').innerText(), /hard/i);
  assert.equal(await page.evaluate(() => MTG.savedPods()[0].name), 'Friday <table>');
  check('deck layouts, filters, favorites, recommendations, analysis, presets and saved pod restore');
  await page.locator('[data-step="deck"]').click();
  await page.locator('.filterchip').click();
  await page.locator('[data-deck-view="gallery"]').click();
  for (const [width, height] of [[320, 740], [390, 844], [820, 1180], [1280, 720], [1900, 950]]) {
    await page.setViewportSize({ width, height });
    await noOverflow(`deck explorer ${width}`);
    const dock = await page.locator('.setupmobilebar').evaluate(bar => {
      const rect = bar.getBoundingClientRect(), art = bar.querySelector('img').getBoundingClientRect();
      return { height: rect.height, left: rect.left, right: rect.right, bottom: rect.bottom, imageHeight: art.height, zoom: Number(getComputedStyle(document.body).zoom) || 1 };
    });
    assert.ok(dock.height <= 100 * dock.zoom && dock.imageHeight <= 52 * dock.zoom, `selected deck stays a compact dock at ${width}: ${JSON.stringify(dock)}`);
    assert.ok(dock.left >= 0 && dock.right <= width + 1 && dock.bottom <= height + 1, `selected deck dock fits ${width}`);
    await shot(`setup-${width}`);
    await page.locator('.setupmobilebar button').click();
    await noOverflow(`pod ${width}`);
    await page.locator('.setupnext').scrollIntoViewIfNeeded();
    await page.locator('.setupnext').click();
    await noOverflow(`review ${width}`);
    if (width === 390) await shot('mobile-review');
    await page.locator('[data-step="deck"]').click();
  }
  check('320, 390, 820, 1280 and 1900px setup flows without horizontal overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-step="pod"]').click();
  await page.locator('[data-pod-preset="learn"]').click();
  await page.locator('.setupnext').click();
  await page.locator('.reviewstart').click();
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan');
  const openingName = await page.evaluate(() => _ui.me.hand[0].name);
  await page.keyboard.press('Control+k');
  await page.locator('.commandsearch').fill(openingName);
  await page.locator('.commandresult').first().click();
  assert.equal(await page.locator('.sheet').isVisible(), true);
  assert.equal(await page.evaluate(() => _ui.pending.q.type), 'mulligan');
  await page.keyboard.press('Escape');
  await page.locator('.modal .pbtn.primary').click();
  await page.evaluate(() => { _game.speedFactor = 0; });
  // Proceed through visible bot reviews until the first main phase.
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => _ui.pending?.q.type === 'main')) break;
    const proceed = page.locator('.actionstage .pbtn.primary:visible, .reveal .pbtn.primary:visible, .modal .pbtn.primary:visible');
    if (await proceed.count()) await proceed.first().click();
    else await page.waitForTimeout(100);
  }
  assert.equal(await page.evaluate(() => _ui.pending?.q.type), 'main');
  const before = await page.evaluate(() => _ui.me.hand.map(card => card.iid));
  await page.locator('.handsort').selectOption('mana');
  assert.deepEqual(await page.evaluate(() => _ui.me.hand.map(card => card.iid)), before);
  const visibleNames = await page.locator('.hand .hcard').evaluateAll(nodes => nodes.map(node => node.dataset.cname));
  assert.deepEqual(visibleNames, await page.evaluate(() => MTG.sortHandForDisplay(_ui.me.hand, 'mana').map(card => card.name)));
  await page.keyboard.press('Escape');
  await page.locator('.commandbutton').click();
  await page.locator('.commandsearch').fill('zzzzz');
  assert.equal(await page.locator('.commandempty').isVisible(), true);
  await page.locator('.commandsearch').fill('settings');
  const decisionCount = await page.evaluate(() => MTG.activeAccountMatch.decisions.length);
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.quickmenu').isVisible(), true);
  assert.equal(await page.evaluate(() => MTG.activeAccountMatch.decisions.length), decisionCount);
  for (const label of ['High contrast', 'Hand card size', 'AI turn speed']) {
    await page.locator('.quickmenuitem').filter({ has: page.locator('span', { hasText: label }) }).first().click();
  }
  assert.equal(await page.evaluate(() => document.body.classList.contains('high-contrast')), true);
  assert.equal(await page.evaluate(() => _ui.handSize), 'large');
  await shot('settings');
  await page.locator('.quickmenuclose').click();
  await page.waitForFunction(() => !document.querySelector('.toastmsg'));
  await page.waitForFunction(() => [...document.querySelectorAll('.hand .hcard img')].every(img => img.complete));
  for (const [width, height] of [[1440, 1000], [390, 844], [1280, 720], [1900, 950]]) {
    await page.setViewportSize({ width, height });
    await noOverflow(`arena ${width}`);
    const geometry = await page.locator('.hand .hcard').first().evaluate(card => ({ bottom: card.getBoundingClientRect().bottom, top: card.getBoundingClientRect().top, height: innerHeight }));
    assert.ok(geometry.bottom <= geometry.height + 2, `hand fits ${width}: ${JSON.stringify(geometry)}`);
    if ([390, 1440].includes(width)) await shot(`arena-${width}`);
  }
  check('search, card inspection, keyboard ownership, hand sorting and persistent display settings');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const landName = await page.evaluate(() => _ui.pending.q.lands[0]?.name);
  assert.ok(landName);
  await page.locator('.hand .hcard').filter({ has: page.locator('.mname', { hasText: landName }) }).first().click();
  await page.locator('.sheetacts button').filter({ hasText: 'Play land' }).click();
  await page.waitForFunction(name => _game.bf().some(card => card.ctrl === _ui.me && card.name === name), landName);
  await shot('land-played');
  check('land played through the card sheet after sorting and searching');
  await page.goto(base);
  assert.equal(await page.locator('.returningplayer').isVisible(), true);
  await page.locator('.returningplayer button').first().click();
  await page.waitForSelector('.deckspotlight');
  assert.equal((await state()).selectedDeck, 'Quick Draw');
  assert.equal(await page.evaluate(() => MTG.playerPreferences().handSort), 'mana');
  assert.equal(await page.evaluate(() => MTG.playerPreferences().handSize), 'large');
  check('recent deck landing shortcut and settings survive reload');
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${out}/result.json`, JSON.stringify({ checks, errors, requests }, null, 2));
  await browser.close();
  server.close();
}
