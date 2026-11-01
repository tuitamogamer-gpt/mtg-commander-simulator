// On desktop the expanded decision panel floats over the right edge of the
// table. While you choose targets the table makes room for it, so no legal
// target sits underneath: before, the land column of every battlefield in the
// right half of the table was covered and could not be clicked.
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
const output = process.env.TARGET_ROOM_OUTPUT || `${root}output/web-game/desktop-target-room`;
mkdirSync(output, {recursive: true});
const server = process.env.GAME_URL ? null : express().use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
const errors = [];
page.on('pageerror', error => errors.push(error.message));

// Board, hand and header boxes, and whether each legal target is reachable
// by the pointer once scrolled into its own battlefield's view.
const layout = () => page.evaluate(() => {
  const box = element => { const r = element.getBoundingClientRect(); return {left: r.left, right: r.right, width: r.width}; };
  const rail = document.querySelector('#game .ct-decision-rail').getBoundingClientRect();
  const targets = [...document.querySelectorAll('#game .targetable[data-iid]')].map(element => {
    element.scrollIntoView({block: 'nearest', inline: 'nearest'});
    const r = element.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {iid: element.dataset.iid, owner: element.closest('.opprow')?.dataset.playerId ?? 'you',
      reachable: !!hit && (element.contains(hit) || hit.contains(element)), underPanel: !!hit?.closest('.ct-decision-rail')};
  });
  return {room: document.querySelector('#game').classList.contains('ct-target-room'),
    rail: {left: rail.left, right: rail.right, width: rail.width}, viewport: innerWidth,
    header: box(document.querySelector('#game > .topbar')), hand: box(document.querySelector('#game > .handwrap')),
    boards: [...document.querySelectorAll('#game .opprow, #game .myboard')].map(element =>
      ({owner: element.closest('.opprow')?.dataset.playerId ?? 'you', ...box(element)})), targets};
});

try {
  await page.addInitScript(() => localStorage.setItem('mtgOnboardingComplete', '1'));
  await page.goto(process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor();
  for (const [width, height] of [[1440, 900], [1024, 768], [1920, 1080]]) {
    await page.setViewportSize({width, height});
    await page.addScriptTag({content: fixture});
    await page.mouse.move(2, height - 2);
    // A full hand must not slide under the panel either.
    await page.evaluate(() => {
      for (let i = 0; i < 8; i++) {
        const card = new MTG.CardInst(MTG.DEFS.Island, _ui.me);
        card.zone = 'hand'; _ui.me.hand.push(card);
      }
      _ui.render();
    });
    const before = await layout();
    assert.equal(before.room, false, 'no room is made outside target choice');

    // "Destroy target land" with every land on the table as a candidate.
    await page.evaluate(() => {
      window.__targetAnswer = undefined;
      const candidates = _game.battlefield.filter(card => card.is('Land'));
      _ui.me.controller.decide(_game, {type: 'chooseTargets', player: _ui.me, prompt: 'Destroy target land', spec: {what: 'land'},
        candidates, min: 1, max: 1, src: _ui.me.hand[0], cancelable: true}).then(answer => { window.__targetAnswer = answer; });
    });
    await page.locator('#game .ct-decision-rail.has-targets').waitFor();
    const during = await layout();
    const lands = await page.evaluate(() => _game.battlefield.filter(card => card.is('Land')).length);
    assert.equal(during.targets.length, lands, 'every land is a highlighted target');
    assert.deepEqual(during.targets.filter(target => !target.reachable), [], `${width}px: every legal target is reachable`);
    assert.equal(during.targets.filter(target => target.underPanel).length, 0);
    for (const board of during.boards) assert.ok(board.right <= during.rail.left, `${width}px: seat ${board.owner} ends left of the panel`);
    assert.ok(during.hand.right <= during.rail.left, `${width}px: the hand ends left of the panel`);
    assert.ok(Math.abs(during.header.width - during.viewport) < 1, `${width}px: the header keeps its full width`);
    assert.equal(during.room, true);
    await page.screenshot({path: `${output}/${width}x${height}-targets.png`});

    // Pick a land of the opponent in the lower right, the seat whose land
    // column used to lie entirely under the panel.
    const right = during.boards.filter(board => board.owner !== 'you').sort((a, b) => b.right - a.right)[0].owner;
    const land = during.targets.find(target => target.owner === right);
    await page.locator(`#game .opprow[data-player-id="${right}"] .targetable[data-iid="${land.iid}"]`).click();
    await page.locator('.targetpromptactions .primary:not(:disabled)').click();
    await page.waitForFunction(() => window.__targetAnswer !== undefined);
    assert.deepEqual(await page.evaluate(() => Array.from(window.__targetAnswer || [], card => String(card.iid))), [land.iid]);

    // Leaving target choice gives the table its width back.
    await page.waitForFunction(() => !document.querySelector('#game').classList.contains('ct-target-room'));
    const after = await layout();
    assert.equal(after.room, false);
    for (const board of before.boards) {
      const now = after.boards.find(other => other.owner === board.owner);
      assert.ok(Math.abs(now.width - board.width) < 1, `${width}px: seat ${board.owner} returns to its width`);
    }
    console.log(`PASS desktop target room ${width}x${height}: ${during.targets.length} targets reachable`);
  }

  // Aborting a cast also gives the room back.
  await page.setViewportSize({width: 1440, height: 900});
  await page.addScriptTag({content: fixture});
  await page.evaluate(() => {
    _ui.me.controller.decide(_game, {type: 'chooseTargets', player: _ui.me, prompt: 'Destroy target land', spec: {what: 'land'},
      candidates: _game.battlefield.filter(card => card.is('Land')), min: 1, max: 1, src: _ui.me.hand[0], cancelable: true});
  });
  await page.locator('#game .ct-decision-rail.has-targets').waitFor();
  assert.equal(await page.evaluate(() => document.querySelector('#game').classList.contains('ct-target-room')), true);
  await page.getByRole('button', {name: /Abort cast/}).click();
  await page.waitForFunction(() => !document.querySelector('#game').classList.contains('ct-target-room') &&
    getComputedStyle(document.querySelector('#game')).paddingRight === '0px');
  console.log('PASS desktop target room: aborting the cast restores the table');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) server.close();
}
