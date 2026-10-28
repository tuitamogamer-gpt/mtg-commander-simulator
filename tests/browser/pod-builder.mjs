// Exercise the public Deck → Pod → Review flow without starting a match.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.POD_QA_OUTPUT || `${root}output/web-game/pod-builder`;
await mkdir(output, {recursive: true});
const server = process.env.GAME_URL ? null : express().use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const receipt = {target: base, checks: [], errors: []};
let page;
const check = name => {receipt.checks.push(name); console.log(`PASS ${name}`);};
const capture = name => page.screenshot({path: `${output}/${name}.png`,
  fullPage: page.viewportSize().width < 2000, animations: 'disabled', timeout: 60000});

async function fits(name) {
  const sizes = await page.evaluate(() => {
    const visible = selector => [...document.querySelectorAll(selector)].filter(node => node.getClientRects().length);
    return {width: innerWidth, scroll: document.documentElement.scrollWidth,
      controls: visible('.podstage select, .podstage .opponentcount button, .podstage .difficultyrow button').map(node => {
        const rect = node.getBoundingClientRect();
        return {label: node.getAttribute('aria-label') || node.textContent, left: rect.left, right: rect.right,
          height: rect.height, parentWidth: node.parentElement.getBoundingClientRect().width, width: rect.width};
      })};
  });
  assert.ok(sizes.scroll <= sizes.width, `${name}: page overflow ${JSON.stringify(sizes)}`);
  for (const control of sizes.controls) {
    assert.ok(control.left >= -1 && control.right <= sizes.width + 1 && control.width <= control.parentWidth + 1,
      `${name}: clipped control ${JSON.stringify(control)}`);
    assert.ok(control.height >= 43, `${name}: small touch target ${JSON.stringify(control)}`);
  }
}

async function run(label, viewport) {
  const context = await browser.newContext({viewport, reducedMotion: 'reduce', hasTouch: viewport.width < 700});
  await context.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  // This suite never reads or modifies an account or a real game.
  await context.route('**/api/account**', route => route.fulfill({json: {ok: true, user: null, profile: null, save: null}}));
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => receipt.errors.push(`${label}: ${error.message}`));
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry .deckcard').first().waitFor({timeout: 120000});
  await page.locator('#deck-search').fill('Quick Draw');
  await page.locator('.deckentry:visible .deckcard').click();
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('.podconfiguration').waitFor();
  assert.equal(await page.locator('.botconfig').count(), 3);
  assert.equal(await page.locator('.podtableoptions .difficultyrow').isVisible(), true);
  assert.equal(await page.locator('.advancedrules').evaluate(node => node.open), false);
  const initialImages = await page.locator('.botdeckpreview img').evaluateAll(nodes => nodes.map(img => img.getAttribute('src')));
  assert.equal(initialImages.length, 3);
  assert.ok(initialImages.every(src => src.includes('/cardbacks/')));
  assert.deepEqual(await page.locator('.botseatnumber').allTextContents(), ['02', '03', '04']);
  await fits(label); await capture(`${label}-initial`);
  check(`${label}: distinct seat previews, visible difficulty and collapsed advanced rules fit the viewport`);

  await page.locator('[data-ai-count="2"]').click();
  await page.getByRole('combobox', {name: 'AI Dragon deck', exact: true}).selectOption('Elven Council');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'AI Dragon deck');
  const preview = page.locator('.botconfig').first().locator('.botdeckpreview');
  const commander = await page.evaluate(() => MTG.defaultCommanders(MTG.DECKS['Elven Council'], MTG.DEFS)[0]);
  assert.equal(await preview.locator('img').getAttribute('alt'), commander);
  await preview.locator('img').evaluate(img => img.decode());
  assert.ok(await preview.locator('img').evaluate(img => img.naturalWidth > 1));
  assert.equal(await page.getByRole('combobox', {name: 'AI Dragon deck', exact: true}).locator('option[value="Quick Draw"]').evaluate(option => option.disabled), true);
  assert.equal(await page.getByRole('combobox', {name: 'AI Wolf deck', exact: true}).locator('option[value="Elven Council"]').evaluate(option => option.disabled), true);
  await page.getByRole('combobox', {name: 'AI Dragon play style', exact: true}).selectOption('aggressive');
  await page.locator('.botconfig').first().locator('.botstyleinfo summary').click();
  assert.match(await page.locator('.botconfig').first().locator('.styledesc').innerText(), /attack|pressure/i);
  await page.locator('[data-difficulty="hard"]').click();
  assert.match(await page.locator('.podsummary').innerText(), /3/);
  assert.match(await page.locator('.podsummary').innerText(), /hard/i);
  await fits(label); await capture(`${label}-configured`);
  check(`${label}: real deck art, duplicate guards, play style and difficulty update through native controls`);

  await page.locator('.setupnext').click();
  const review = page.locator('.reviewstage'); await review.waitFor({state: 'visible'});
  assert.equal(await review.locator('.ct-review-seat').count(), 3);
  assert.match(await review.locator('.ct-review-seat').nth(1).innerText(), /Elven Council/);
  assert.match(await review.locator('.ct-review-seat').nth(1).innerText(), /Aggressive/);
  assert.match(await review.locator('.reviewrules').innerText(), /hard/i);
  await capture(`${label}-review`);
  await page.locator('.reviewback').click();
  assert.equal(await page.getByRole('combobox', {name: 'AI Dragon deck', exact: true}).inputValue(), 'Elven Council');
  assert.equal(await page.getByRole('combobox', {name: 'AI Dragon play style', exact: true}).inputValue(), 'aggressive');
  assert.equal(await page.locator('[data-difficulty="hard"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-ai-count="3"]').click();
  await page.getByRole('combobox', {name: 'AI Raven deck', exact: true}).selectOption('Doom Prevails');
  await page.locator('[data-ai-count="1"]').click();
  await page.locator('[data-ai-count="3"]').click();
  assert.equal(await page.getByRole('combobox', {name: 'AI Raven deck', exact: true}).inputValue(), 'Doom Prevails');
  check(`${label}: review and seat-count roundtrips preserve every chosen deck, style and difficulty`);

  await page.locator('.advancedrules > summary').click();
  const randomCommanders = page.getByRole('checkbox', {name: /AI bots choose random commanders/});
  await randomCommanders.check();
  assert.equal(await page.getByRole('combobox', {name: 'AI Dragon deck', exact: true}).inputValue(), 'Elven Council');
  assert.ok((await page.locator('.botconfig').first().locator('.botdeckpreview img').getAttribute('src')).includes('/cardbacks/'));
  assert.match(await page.locator('.botconfig').first().locator('.botdeckpreview').innerText(), /commander.*(start|random)|random.*commander/i);
  await randomCommanders.uncheck();
  assert.equal(await page.locator('.botconfig').first().locator('.botdeckpreview img').getAttribute('alt'), commander);
  await page.locator('.advancedrules > summary').click();
  check(`${label}: random-commander mode shows a concealed preview without discarding the selected deck`);

  await page.locator('.matchtypebtn[data-mode="online"]').click();
  assert.equal(await page.locator('.botstyles').isVisible(), false);
  assert.equal(await page.locator('.difficultyrow').isVisible(), false);
  assert.equal(await page.locator('.liveplayercount').isVisible(), true);
  assert.match(await page.locator('.podconfiguration').innerText(), /lobby/i);
  await page.locator('[data-live-players="3"]').click();
  await fits(`${label} live`); await capture(`${label}-live`);
  await page.locator('.matchtypebtn[data-mode="solo"]').click();
  assert.equal(await page.locator('.botconfig').count(), 3);
  assert.equal(await page.getByRole('combobox', {name: 'AI Dragon deck', exact: true}).inputValue(), 'Elven Council');
  assert.equal(await page.getByRole('combobox', {name: 'AI Raven deck', exact: true}).inputValue(), 'Doom Prevails');
  assert.equal(await page.locator('[data-difficulty="hard"]').getAttribute('aria-pressed'), 'true');
  check(`${label}: Live explains lobby configuration; returning to Solo restores the pod`);

  const alternate = label === 'desktop' ? {width: 2560, height: 1440} : {width: 360, height: 780};
  await page.setViewportSize(alternate);
  await fits(`${label} resized ${alternate.width}`);
  await capture(`${label}-${alternate.width}`);
  check(`${label}: configured controls also fit ${alternate.width}px ${label === 'desktop' ? 'with UI zoom' : 'narrow phone'}`);
  await context.close();
}

try {
  await run('desktop', {width: 1440, height: 1000});
  await run('mobile', {width: 390, height: 844});
  assert.deepEqual(receipt.errors, []);
} catch (error) {
  receipt.failure = error.stack;
  if (page && !page.isClosed()) await capture('failure').catch(() => {});
  throw error;
} finally {
  await writeFile(`${output}/receipt.json`, JSON.stringify(receipt, null, 2));
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
