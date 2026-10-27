// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package; GAME_URL may select an existing preview.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/populated-resource-board.js', import.meta.url), 'utf8');
const output = process.env.RESOURCE_DOCK_OUTPUT || `${root}output/web-game/resource-dock`;
mkdirSync(output, {recursive: true});
const server = process.env.GAME_URL ? null : express().use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.addInitScript(() => localStorage.setItem('mtgOnboardingComplete', '1'));
  await page.goto(process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor();
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844]]) {
    await page.setViewportSize({width, height});
    await page.addScriptTag({content: fixture});
    if (width > 900) {
      const board = await page.locator('.mybattlefieldmain').evaluate(element => {
        const field = element.getBoundingClientRect();
        const dock = document.querySelector('.myboard .landrow').getBoundingClientRect();
        return {field: field.toJSON(), dock: dock.toJSON(), cards: [...element.querySelectorAll('.mini')].map(card => {
          const r = card.getBoundingClientRect();
          return {visible: r.top >= field.top && r.bottom <= field.bottom && r.left >= field.left && r.right <= field.right,
            reachable: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.mini') === card};
        })};
      });
      assert.ok(board.dock.width <= 130 && board.dock.x >= board.field.right - 1);
      assert.ok(Math.abs(board.dock.y - board.field.y) < 1, 'resources share the field row');
      assert.equal(board.cards.length, 12, 'eight creatures and four support cards');
      assert.ok(board.cards.every(card => card.visible && card.reachable), JSON.stringify(board));
      const lands = page.locator('.myboard .landstrip .ct-land-card');
      assert.equal(await lands.count(), 17, 'identical lands remain separate controls');
      await page.locator('.myboard .landstrip').evaluate(element => { element.scrollTop = element.scrollHeight; });
      assert.equal(await page.locator('.myboard .landstrip .mini').last().evaluate(element => {
        const r = element.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.mini') === element;
      }), true, 'the last resource is reachable after scrolling');
    } else {
      assert.equal(await page.locator('#game').evaluate(element => element.classList.contains('ct-desktop-lands')), false);
      const horizontal = await page.locator('.mybattlefieldmain').evaluate(element => {
        element.scrollLeft = element.scrollWidth;
        return element.scrollWidth > element.clientWidth && element.scrollLeft > 0;
      });
      assert.equal(horizontal, true, 'phone battlefield retains horizontal scrolling');
      assert.ok(await page.locator('.myboard .landstack').count() > 0, 'phone retains compact land groups');
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: `${output}/${width}.png`});
    console.log(`PASS populated battlefield ${width}x${height}`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) server.close();
}
