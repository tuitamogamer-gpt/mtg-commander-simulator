// A desktop board draws its cards as large as its room allows
// (src/modules/command-table.js, fitBoardCards): a board with a few cards no
// longer leaves most of its lane empty, a crowded board is drawn as the
// stylesheet gives it, and no lane changes its size. An empty board says so
// in the middle of its lane. Presentation only: the pending decision and the
// rules state are the same before and after.
// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/populated-resource-board.js', import.meta.url), 'utf8');
const output = process.env.BOARD_FIT_OUTPUT || `${root}output/web-game/desktop-board-fit`;
mkdirSync(output, {recursive: true});
const server = express().use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const errors = [];
const check = name => console.log(`PASS ${name}`);

async function table(width, height, phone = false) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce',
    ...(phone ? {hasTouch: true, isMobile: true} : {})});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1'); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  await page.addScriptTag({content: fixture});
  await page.mouse.move(2, 2);
  await page.evaluate(() => {
    window.__put = (name, player) => {
      const card = new MTG.CardInst(MTG.DEFS[name], player);
      card.ctrl = player; card.zone = 'battlefield'; card.sick = false; _game.battlefield.push(card); return card;
    };
    // Different creatures: equal permanents are drawn as one pile.
    window.__creatures = count => Object.values(MTG.DEFS).filter(def => def.types?.includes('Creature') && !def.super?.includes('Legendary') &&
      def.name && !def.name.includes('//') && !_game.battlefield.some(card => card.name === def.name)).slice(0, count).map(def => def.name);
    // Every board as the table draws it: the room, the card size in use, the
    // size the stylesheet alone gives, and whether anything has to scroll.
    window.__boards = () => {
      const z = _ui.viewportZoom(document.querySelector('#game'));
      return [...document.querySelectorAll('#game .mybattlefieldmain, #game .oppstrip.battlefieldstrip')].map(board => {
        const lane = board.closest('.opprow, .myboard'), first = board.querySelector('.boardlanecards .mini');
        const set = board.style.getPropertyValue('--ct-card');
        const width = first ? first.offsetWidth : 0;
        const saved = [board.style.getPropertyValue('--ct-card'), board.style.getPropertyValue('--ct-opponent-card')];
        board.style.removeProperty('--ct-card'); board.style.removeProperty('--ct-opponent-card');
        const given = first ? first.offsetWidth : 0;
        const laneBare = lane.getBoundingClientRect().toJSON();
        if (saved[0]) board.style.setProperty('--ct-card', saved[0]);
        if (saved[1]) board.style.setProperty('--ct-opponent-card', saved[1]);
        const boxes = [board, ...board.querySelectorAll('.oppboardmain, .boardlane, .boardlanecards')];
        return {
          owner: board.closest('.opprow')?.dataset.playerId ?? 'me', set, width, given,
          cards: board.querySelectorAll('.boardlanecards .mini').length,
          scrolls: boxes.some(box => box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1),
          room: {width: board.clientWidth, height: board.clientHeight},
          filled: first ? Math.round(100 * (first.offsetHeight + 16) / board.clientHeight) : 0,
          lane: lane.getBoundingClientRect().toJSON(), laneBare,
          land: lane.querySelector('.ct-resource-dock .mini')?.offsetWidth ?? null, zoom: z,
        };
      });
    };
    window.__rules = () => JSON.stringify({phase: _game.phase, life: _game.players.map(p => p.life),
      hand: _ui.me.hand.map(c => c.iid), battlefield: _game.battlefield.map(c => c.iid).sort(), stack: _game.stack.length});
  });
  return {context, page};
}
const same = (a, b) => ['left', 'top', 'width', 'height'].every(key => Math.abs(a[key] - b[key]) < .6);

try {
  for (const [width, height] of [[1440, 900], [1920, 1080]]) {
    const {context, page} = await table(width, height);
    const rules = await page.evaluate(() => window.__rules());
    const pending = await page.evaluate(() => { window.__pending = _ui.pending; return _ui.pending?.q.type; });
    const boards = await page.evaluate(() => window.__boards());
    assert.equal(boards.length, 4);
    const mine = boards.find(board => board.owner === 'me'), others = boards.filter(board => board.owner !== 'me');
    // Four creatures each: the cards fill the lane's height instead of a corner of it.
    for (const board of others) {
      assert.equal(board.cards, 4);
      assert.ok(board.width >= board.given * 1.5, `${width}px: an opponent's four creatures grew from ${board.given}px to ${board.width}px`);
      assert.ok(board.width <= 124 * 1.21, `no wider than the limit: ${board.width}px`);
      assert.ok(board.filled >= 70, `the cards take ${board.filled}% of the lane's height`);
      assert.equal(board.scrolls, false, 'nothing of the board has to scroll');
    }
    // Twelve permanents: not smaller than the stylesheet's size, and still nothing scrolls.
    assert.equal(mine.cards, 12);
    assert.ok(mine.width >= mine.given, `${width}px: your crowded board is not drawn smaller (${mine.given}px → ${mine.width}px)`);
    assert.equal(mine.scrolls, false);
    // No lane moved or changed its size, and the land column is as it was.
    for (const board of boards) {
      assert.ok(same(board.lane, board.laneBare), `${width}px: the lane of ${board.owner} keeps its box`);
      assert.equal(board.land, boards[0].land, 'lands keep their size');
    }
    await page.screenshot({path: `${output}/fitted-${width}.png`});
    check(`${width}px: boards with a few cards fill their lanes; a crowded board and every lane's box are as before`);

    // More cards on a board: its cards step down a size and still fit; back to four, back to large.
    const grown = await page.evaluate(() => {
      const player = _game.players[1], added = [];
      for (const name of window.__creatures(6)) added.push(window.__put(name, player));
      _game.recalc(); _ui.render();
      const ten = window.__boards().find(board => board.owner === '1');
      for (const card of added) _game.battlefield.splice(_game.battlefield.indexOf(card), 1);
      _game.recalc(); _ui.render();
      return {ten, four: window.__boards().find(board => board.owner === '1')};
    });
    const before = others.find(board => board.owner === '1');
    assert.equal(grown.ten.cards, 10);
    assert.ok(grown.ten.width < before.width && grown.ten.width >= grown.ten.given, `ten creatures: ${grown.ten.width}px, between ${grown.ten.given}px and ${before.width}px`);
    assert.equal(grown.ten.scrolls, false);
    assert.equal(grown.four.width, before.width, 'four again: the same size as before');
    check(`${width}px: a board's cards follow what stands on it and always fit`);

    // A board with more than its lane holds keeps the stylesheet's size and scrolls, as before.
    const crowded = await page.evaluate(() => {
      const player = _game.players[2];
      for (const name of window.__creatures(60)) window.__put(name, player);
      _game.recalc(); _ui.render();
      return window.__boards().find(board => board.owner === '2');
    });
    assert.equal(crowded.set, '', 'a board that has to scroll is not fitted');
    assert.equal(crowded.width, crowded.given);
    assert.equal(crowded.scrolls, true);
    check(`${width}px: a crowded board scrolls at the stylesheet's readable size`);

    // An empty board says so in the middle of its lane, under the outline of a card.
    const empty = await page.evaluate(() => {
      const player = _game.players[3];
      for (const card of _game.battlefield.filter(card => card.ctrl === player)) _game.battlefield.splice(_game.battlefield.indexOf(card), 1);
      const landsOnly = _game.players[1];
      for (const card of _game.battlefield.filter(card => card.ctrl === landsOnly && !card.is('Land'))) _game.battlefield.splice(_game.battlefield.indexOf(card), 1);
      _game.recalc(); _ui.render();
      const strip = document.querySelector('.opprow[data-player-id="3"] .oppstrip'), label = strip.querySelector('.emptystrip');
      const s = strip.getBoundingClientRect(), l = label.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(label);
      const words = range.getBoundingClientRect();
      const bare = document.querySelector('.opprow[data-player-id="1"] .oppstrip');
      return {text: label.textContent.trim(), outline: getComputedStyle(label, '::before').borderTopStyle,
        offCentre: {x: Math.abs(words.left + words.width / 2 - (s.left + s.width / 2)), y: Math.abs(l.top + l.height / 2 - (s.top + s.height / 2))},
        landsOnly: {label: !!bare.querySelector('.emptystrip'), outline: getComputedStyle(bare, '::after').borderTopStyle,
          lands: document.querySelectorAll('.opprow[data-player-id="1"] .ct-resource-dock .mini').length}};
    });
    assert.match(empty.text, /empty battlefield/i);
    assert.equal(empty.outline, 'dashed');
    assert.ok(empty.offCentre.x < 24 && empty.offCentre.y < 24, `in the middle of its lane: ${JSON.stringify(empty.offCentre)}`);
    assert.equal(empty.landsOnly.label, false); assert.equal(empty.landsOnly.outline, 'dashed', 'lands and nothing else: the outline alone');
    assert.ok(empty.landsOnly.lands > 0);
    await page.screenshot({path: `${output}/empty-${width}.png`});
    check(`${width}px: an empty board says so in the middle of its lane`);

    // The cards placed and removed above were this test's own; fitting changed nothing else.
    assert.equal(await page.evaluate(() => _ui.pending === window.__pending), true);
    assert.equal(await page.evaluate(() => _ui.pending?.q.type), pending);
    assert.deepEqual(JSON.parse(await page.evaluate(() => window.__rules())).hand, JSON.parse(rules).hand);
    await context.close();
  }

  // A phone is not fitted: its boards keep the stylesheet's sizes.
  {
    const {context, page} = await table(390, 844, true);
    const fitted = await page.evaluate(() => [...document.querySelectorAll('#game .mybattlefieldmain, #game .oppstrip.battlefieldstrip')]
      .filter(board => board.style.getPropertyValue('--ct-card') || board.style.getPropertyValue('--ct-opponent-card')).length);
    assert.equal(fitted, 0);
    check('390px: a phone keeps its own card sizes');
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
