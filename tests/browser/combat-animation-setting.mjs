// Exercise the actual startup controls and a newly launched game. Presentation
// choices stay local to this browser; production verification never creates a room.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.COMBAT_SETTING_OUTPUT || `${root}output/web-game/combat-animation-setting`;
mkdirSync(output, {recursive: true});
const remote = process.env.GAME_URL || null;
const server = remote ? null : express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = remote || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const receipt = {checks: [], errors: []};
const check = message => {receipt.checks.push(message); console.log(`PASS ${message}`);};

async function setup(page) {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry:not([hidden]) .deckcard').first().waitFor({timeout: 120000});
  await page.waitForFunction(() => !document.querySelector('.mainmenu-loadveil'));
  await page.locator('#deck-search').fill('Quick Draw');
  await page.locator('.deckentry:visible .deckcard').click();
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('.podstage:visible').waitFor();
}

async function fits(page, control, label) {
  await control.scrollIntoViewIfNeeded();
  const geometry = await control.evaluate(node => {
    const rect = node.closest('.combatanimationsetup').getBoundingClientRect();
    return {left: rect.left, right: rect.right, width: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth};
  });
  assert.ok(geometry.left >= 0 && geometry.right <= geometry.width && !geometry.overflow,
    `${label}: ${JSON.stringify(geometry)}`);
}

async function run(width) {
  const context = await browser.newContext({viewport: {width, height: width > 600 ? 1000 : 844}, hasTouch: true, reducedMotion: 'reduce'});
  await context.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => receipt.errors.push(`${width}px: ${error.message}`));
  if (remote) await page.route('**/api/**', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())
    ? route.continue() : route.fulfill({status: 403, json: {error: 'Writes disabled in browser verification'}}));
  try {
    await setup(page);
    const podToggle = page.locator('.podstage:visible [data-combat-animation-toggle]');
    assert.equal(await podToggle.isChecked(), true, 'Fresh startup defaults to enabled');
    assert.equal(await podToggle.evaluate(node => !!node.closest('details:not([open])')), false,
      'The startup choice is available without opening advanced controls');
    receipt.url = page.url();
    receipt.build = await page.evaluate(() => MTG.BUILD_INFO || null);
    if (process.env.EXPECTED_BUILD_REVISION) {
      assert.equal(receipt.build?.revision, process.env.EXPECTED_BUILD_REVISION);
      assert.equal(receipt.build?.dirty, false);
    }
    await fits(page, podToggle, 'Pod combat animation option');
    await page.screenshot({path: `${output}/combat-setting-${width}-default-on.png`});
    await podToggle.uncheck();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mtgPlayerPreferences')).combatAnimationEnabled), false);
    await page.locator('.setupnext').click();
    const reviewToggle = page.locator('.reviewstage:visible [data-combat-animation-toggle]');
    assert.equal(await reviewToggle.isChecked(), false, 'Review retains the chosen off state');
    await fits(page, reviewToggle, 'Review combat animation option');
    await page.screenshot({path: `${output}/combat-setting-${width}-review-off.png`});
    await reviewToggle.check();
    await page.locator('.reviewback').click();
    assert.equal(await podToggle.isChecked(), true, 'Editing the choice on Review updates Pod');
    await podToggle.uncheck();
    await setup(page);
    assert.equal(await podToggle.isChecked(), false, 'A fresh setup restores the stored off preference');
    await page.locator('.matchtypebtn[data-mode="online"]').click();
    assert.equal(await podToggle.isChecked(), false, 'Live setup uses the local display preference');
    await page.locator('.setupnext').click();
    assert.equal(await reviewToggle.isChecked(), false);
    await page.locator('.reviewback').click();
    await page.locator('.matchtypebtn[data-mode="solo"]').click();
    await page.locator('.setupnext').click();
    await page.locator('.reviewstart').click();
    await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', undefined, {timeout: 120000});
    assert.equal(await page.evaluate(() => _ui.combatAnimationEnabled), false,
      'The real launched UI reads the startup preference before the first decision');
    assert.equal(await page.evaluate(() => Object.hasOwn(_game, 'combatAnimationEnabled')), false,
      'A local presentation setting does not enter authoritative game rules');
    check(`${width}px startup defaults on, both startup controls stay in sync, off survives reload/Live setup and reaches the actual Solo game`);
  } finally {await context.close();}
}

try {
  await run(390); await run(1440);
  assert.deepEqual(receipt.errors, []);
} finally {
  writeFileSync(`${output}/result.json`, JSON.stringify(receipt, null, 2));
  await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
}
