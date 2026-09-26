// Real composer/response handlers with a deterministic public-board fixture.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.DIPLOMACY_QA_OUTPUT || `${root}output/web-game/diplomacy-options`;
mkdirSync(output, { recursive: true });
const server = process.env.GAME_URL ? null : express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [], checks = [];
const check = text => { checks.push(text); console.log(`PASS ${text}`); };
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('mtgOnboardingComplete', '1'));
    await page.goto(`${base}/?smokeDeck=Quick%20Draw&smokeScenario=diplomacy&botDiplomacy=human-compose&diplomacy=1`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="send-diplomacy-offer"]').waitFor({ timeout: 90000 });
    const recipientId = await page.evaluate(() => _ui.diplomacyComposer.toId);
    const allowance = await page.evaluate(() => _game.diplomacyView(_ui.me).offersRemaining);
    assert.equal(await page.locator('[data-testid="diplomacy-preset-let_resolve"]').count(), 0, 'No stack deal is invented on an empty stack');
    await page.locator('[data-testid="diplomacy-preset-protect_permanent"]').click();
    assert.match(await page.locator('.dipreview').innerText(), /harmful target/);
    await page.locator('[data-testid="diplomacy-preset-no_target_player"]').click();
    assert.match(await page.locator('.dipreview').innerText(), /harmful targets/);
    await page.locator('[data-testid="diplomacy-preset-no_attack"]').click();
    assert.match(await page.locator('.dipreview').innerText(), /will not voluntarily attack/);
    assert.equal(await page.evaluate(() => _game.diplomacyView(_ui.me).offersRemaining), allowance, 'Trying ideas does not spend a proposal');
    const fits = await page.locator('.diplomacymodal').evaluate(modal => {
      const bounds = modal.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, scroll: modal.scrollWidth, width: modal.clientWidth };
    });
    assert.ok(fits.left >= -1 && fits.right <= viewport.width + 1 && fits.scroll <= fits.width + 1, `Composer fits ${viewport.width}px: ${JSON.stringify(fits)}`);
    await page.screenshot({ path: `${output}/composer-${viewport.width}.png` });
    await page.locator('[data-testid="send-diplomacy-offer"]').click();
    await page.locator('[data-testid="diplomacy-hard-pause"]').waitFor();
    assert.match(await page.locator('.diplomacyreviewoutcome').innerText(), /Agreement accepted and active/);
    assert.equal(await page.evaluate(() => _game.diplomacyView(_ui.me).activeContracts.length), 1);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.dipaccordseal')).animationName.includes('dipSign'), null, { timeout: 5000 }).catch(async error => {
      console.log(await page.evaluate(() => ({ className: document.querySelector('.diplomacyreviewmodal').className, body: document.body.className, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, seen: [..._ui.diplomacyMotionSeen] })));
      throw error;
    });
    await page.screenshot({ path: `${output}/accepted-${viewport.width}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.dipaccordseal').evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.body.classList.add('reduced-motion'));
    assert.equal(await page.locator('.dipaccordseal').evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.evaluate(() => document.body.classList.remove('reduced-motion'));
    await page.locator('[data-testid="proceed-diplomacy-review"]').click();
    await page.waitForFunction(() => !_ui.pending || _ui.pending.q.type !== 'diplomacyReview');
    const reopened = await page.evaluate(recipientId => {
      _ui.beginDiplomacyOffer(_game, _game.players.find(player => player.idx === recipientId));
      return { composer: _ui.diplomacyComposer, status: _game.diplomacyStatus(), pending: _ui.pending?.q?.type };
    }, recipientId);
    assert.ok(reopened.composer, JSON.stringify(reopened));
    assert.equal(await page.locator('[data-testid="send-diplomacy-offer"]').isDisabled(), true);
    assert.match(await page.locator('.dipavailability.blocked').innerText(), /already have an active agreement/);
    check(`${viewport.width}px: legal starters, exact terms, no allowance spent on preview, accepted pact, unavailable reason, both reduced-motion modes`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
