// A board wipe crashed iPhone Safari ("A problem repeatedly occurred"). On a
// phone the table now keeps fewer, smaller layers, and restoring a saved table
// no longer starts every effect since the checkpoint at once.
// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package; GAME_URL may select an existing preview.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = process.env.GAME_URL ? null : express().use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const errors = [];

async function table(phone) {
  const context = await browser.newContext(phone ? {viewport: {width: 390, height: 844}, deviceScaleFactor: 3, isMobile: true, hasTouch: true}
    : {viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('mtgOnboardingComplete', '1'));
  const url = new URL(process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`);
  url.searchParams.set('smokeDeck', 'Quick Draw'); url.searchParams.set('seed', '11081');
  await page.goto(url.href);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', undefined, {timeout: 120000});
  await page.locator('.modal .pbtn.primary').click();
  await page.evaluate(() => { _game.speedFactor = 0; });
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate(() => _ui.pending?.q.type === 'main')) break;
    const proceed = page.locator('button.pbtn:visible').filter({hasText: /^(Proceed|Continue to my turn)(?:\s|$)/});
    if (await proceed.count()) await proceed.first().click(); else await page.waitForTimeout(100);
  }
  // Six creatures per player, for a wipe of 24.
  await page.evaluate(() => {
    for (const player of _game.players) for (let i = 0; i < 6; i++) {
      const card = new MTG.CardInst(MTG.DEFS['Grizzly Bears'], player); card.zone = 'battlefield'; card.sick = false; _game.battlefield.push(card);
    }
    _game.recalc(); _ui.render();
  });
  return {context, page};
}
const wipeEvent = () => ({kind: 'boardWipe', mode: 'destroy', cards: _game.bf().filter(card => card.is('Creature')), source: null});

try {
  // Phone: the closed drawer is hidden, not just slid away with its blur.
  {
    const {context, page} = await table(true);
    const drawer = () => page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('#game .sidebar'));
      return {visibility: style.visibility, backdrop: style.backdropFilter || style.webkitBackdropFilter || 'none'};
    });
    assert.deepEqual(await drawer(), {visibility: 'hidden', backdrop: 'none'}, 'a closed drawer neither paints nor keeps its blur');
    await page.evaluate(() => _ui.showMobileView('stack'));
    await page.waitForTimeout(300);
    assert.equal((await drawer()).visibility, 'visible', 'the Stack view shows the drawer');
    await page.evaluate(() => _ui.showMobileView('mine'));
    await page.waitForTimeout(400);
    assert.equal((await drawer()).visibility, 'hidden', 'closing it hides it again after the slide');
    console.log('PASS phone: the closed drawer is hidden and has no backdrop blur');

    // A wipe keeps its flash, shockwaves, title and falling cards, but not the
    // blurred cloud, the camera shake or the page grain.
    await page.evaluate(() => { _game.speedFactor = 1.5625; _ui.showGameEffect({...(() => ({kind: 'boardWipe', mode: 'destroy', cards: _game.bf().filter(card => card.is('Creature')), source: null}))()}); });
    const wipe = await page.evaluate(() => ({
      storm: !!document.querySelector('.gamefx-wipe'), flash: !!document.querySelector('.gamefx-flash'),
      cards: document.querySelectorAll('.gamefx-wipecard').length,
      cloud: getComputedStyle(document.querySelector('.gamefx-wipecloud')).display,
      camera: getComputedStyle(document.querySelector('#game')).animationName,
      grain: getComputedStyle(document.body, '::after').content,
    }));
    // Cards fall from the visible board (the phone's Mine view groups equal creatures).
    assert.ok(wipe.cards >= 1, JSON.stringify(wipe));
    assert.deepEqual({...wipe, cards: 1}, {storm: true, flash: true, cards: 1, cloud: 'none', camera: 'none', grain: 'none'}, JSON.stringify(wipe));
    console.log('PASS phone: a wipe plays without the blurred cloud, camera shake or grain');

    // Restoring a saved table: effects of the replayed actions are not drawn.
    await page.waitForTimeout(1600);
    const restoring = await page.evaluate(event => {
      const before = document.querySelectorAll('.gamefx-wipe, .gamefx-impact, .effectnotice').length;
      _ui.accountReplay = {current: 0, total: 3};
      _game.note('gameEffect', {kind: 'boardWipe', mode: 'destroy', cards: _game.bf().filter(card => card.is('Creature')), source: null});
      _game.note('gameEffect', {kind: 'damage', target: _ui.me, targetPlayer: _ui.me, targetKind: 'player', amount: 5, source: null});
      _game.note('effectNotice', {text: 'Restored notice', kind: 'info'});
      const during = document.querySelectorAll('.gamefx-wipe, .gamefx-impact, .effectnotice').length - before;
      _ui.accountReplay = null;
      _game.note('gameEffect', {kind: 'boardWipe', mode: 'destroy', cards: _game.bf().filter(card => card.is('Creature')), source: null});
      const live = document.querySelectorAll('.gamefx-wipe').length;
      return {during, live};
    });
    assert.equal(restoring.during, 0, 'nothing is drawn while a saved table is restored');
    assert.equal(restoring.live, 1, 'the next live wipe is drawn again');
    console.log('PASS restoring a saved table draws no effects; live play draws them again');
    await context.close();
  }
  // Desktop keeps the full wipe.
  {
    const {context, page} = await table(false);
    await page.evaluate(() => { _game.speedFactor = 1.5625; _ui.showGameEffect({kind: 'boardWipe', mode: 'destroy', cards: _game.bf().filter(card => card.is('Creature')), source: null}); });
    const wipe = await page.evaluate(() => ({cloud: getComputedStyle(document.querySelector('.gamefx-wipecloud')).display,
      camera: getComputedStyle(document.querySelector('#game')).animationName}));
    assert.notEqual(wipe.cloud, 'none');
    assert.equal(wipe.camera, 'dsWipeCamera');
    console.log('PASS desktop keeps the full wipe');
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) server.close();
}
