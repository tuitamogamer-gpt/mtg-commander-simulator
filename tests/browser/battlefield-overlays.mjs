// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package; GAME_URL may select an existing preview.
// Token stacks, counters and attachments must not cover a creature's P/T,
// and the commander tax badge must be readable beside the dock art.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/token-overlay-board.js', import.meta.url), 'utf8');
const output = process.env.BATTLEFIELD_OVERLAYS_OUTPUT || `${root}output/web-game/battlefield-overlays`;
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
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  for (const [width, height, strict] of [[1440, 900, true], [1920, 1080, true], [1280, 720, false], [390, 844, true]]) {
    await page.setViewportSize({width, height});
    await page.addScriptTag({content: fixture});
    const mine = page.locator('.mobileviewtab[data-view="mine"]:visible');
    if (await mine.count()) await mine.click();
    await page.mouse.move(2, height - 10);
    const board = await page.evaluate(() => {
      const box = element => element.getBoundingClientRect();
      const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return [...document.querySelectorAll('#game .myboard .mini')].filter(card => card.querySelector(':scope > .pt')).map(card => {
        card.scrollIntoView({behavior: 'instant', block: 'nearest', inline: 'nearest'});
        const pt = card.querySelector(':scope > .pt'), r = box(pt);
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const covering = [...card.querySelectorAll(':scope > :is(.toktag, .stackn, .att, .cnt, .m1counter)')]
          .filter(badge => getComputedStyle(badge).display !== 'none' && overlaps(box(badge), r)).map(badge => badge.className);
        const label = card.querySelector(':scope > .tokenface:not([hidden]) .tokenface-type');
        return {card: card.dataset.cname, readable: !!top && pt.contains(top), covering,
          fallbackLabel: label ? {text: label.textContent, clearOfStats: !overlaps(box(label), r),
            label: box(label).toJSON(), stats: r.toJSON()} : null};
      });
    });
    await page.locator('.myboard .mini[data-cname="Klingon Warrior Token"]').scrollIntoViewIfNeeded();
    await page.screenshot({path: `${output}/${width}.png`});
    assert.ok(board.some(row => row.card === 'Soldier Token'), 'the fixture places stacked tokens');
    assert.ok(board.every(row => row.readable), `${width}px: P/T is the topmost layer: ${JSON.stringify(board)}`);
    if (strict) assert.deepEqual(board.flatMap(row => row.covering), [], `${width}px: no badge overlaps P/T: ${JSON.stringify(board)}`);
    assert.ok(board.some(row => row.fallbackLabel?.text === 'Klingon Warrior'), 'the fixture includes an unprinted creature token');
    assert.ok(board.every(row => !row.fallbackLabel || row.fallbackLabel.clearOfStats), `${width}px: fallback token labels do not overlap P/T: ${JSON.stringify(board)}`);
    if (width >= 900) {
      const tax = await page.locator('.ct-commander-card .tax').evaluate(element => {
        const r = element.getBoundingClientRect(), dock = element.closest('.ct-commander-dock').getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {text: element.textContent, onTop: !!top && element.contains(top), inside: r.left >= dock.left && r.right <= dock.right};
      });
      assert.deepEqual(tax, {text: '(tax +4)', onTop: true, inside: true}, `${width}px commander tax badge`);
    }
    console.log(`PASS battlefield overlays ${width}x${height}`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) server.close();
}
