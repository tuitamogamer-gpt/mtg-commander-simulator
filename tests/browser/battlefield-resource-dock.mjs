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
      const tapState = await page.locator('.myboard .landstrip').evaluate(strip => {
        const cards = [...strip.querySelectorAll('.mini')];
        const angle = card => {
          const transform = getComputedStyle(card).transform;
          if (transform === 'none') return 0;
          const [a, b] = transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
          return Math.round(Math.atan2(b, a) * 180 / Math.PI);
        };
        // Copies inside one tapped-land pile overlap by design; nothing else may.
        const boxes = cards.map(card => ({r: card.getBoundingClientRect(), pile: card.closest('.ct-land-stack')}));
        const overlaps = boxes.some(({r, pile}, i) => boxes.some((other, j) => j > i && !(pile && pile === other.pile) &&
          r.left < other.r.right && other.r.left < r.right && r.top < other.r.bottom && other.r.top < r.bottom));
        const piles = [...strip.querySelectorAll('.ct-land-stack')].map(pile => {
          pile.scrollIntoView({block: 'nearest'});
          const minis = [...pile.querySelectorAll('.mini')], top = minis.at(-1), r = top.getBoundingClientRect();
          return {badge: pile.querySelector('.ct-land-stack-count')?.textContent, size: minis.length,
            allTapped: minis.every(card => card.classList.contains('tapped')),
            names: new Set(minis.map(card => card.dataset.cname)).size,
            topReachable: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.mini') === top};
        });
        strip.scrollTop = 0;
        return {tapped: cards.filter(card => card.classList.contains('tapped')).map(angle),
          untapped: cards.filter(card => !card.classList.contains('tapped')).map(angle), overlaps, piles};
      });
      assert.ok(tapState.tapped.length >= 4, 'the fixture taps several resources');
      assert.ok(tapState.tapped.every(angle => angle === 60), `tapped resources turn 60deg: ${tapState.tapped}`);
      assert.ok(tapState.untapped.every(angle => angle === 0), `untapped resources stay upright: ${tapState.untapped}`);
      assert.equal(tapState.overlaps, false, 'turned resources stay inside their own cells');
      // The fixture taps two Swamps and two Plains: each pair shares one pile.
      assert.equal(tapState.piles.length, 2, JSON.stringify(tapState.piles));
      assert.ok(tapState.piles.every(pile => pile.size === 2 && pile.badge === '×2' && pile.allTapped &&
        pile.names === 1 && pile.topReachable), `tapped copies of one land share a pile: ${JSON.stringify(tapState.piles)}`);
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
