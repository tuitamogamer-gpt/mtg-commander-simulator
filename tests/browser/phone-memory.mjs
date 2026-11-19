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
// A staged wipe as the engine announces it (engine.js stageBoardWipe): the
// build-up, then the impact. The cards stay on the battlefield meanwhile.
const stageWipe = page => page.evaluate(() => {
  _game.speedFactor = 1.5625;
  const cards = _game.bf().filter(card => card.is('Creature')), timing = MTG.boardWipeTiming(cards.length, _game.speedFactor);
  _ui.showGameEffect({kind: 'boardWipe', mode: 'destroy', cards, count: cards.length, source: null, timing});
  _ui.showGameEffect({kind: 'boardWipeImpact', mode: 'destroy', count: cards.length, timing});
  const fx = document.querySelector('.wipefx');
  const heavy = node => { const style = getComputedStyle(node); return /blur/.test(style.filter) || style.backdropFilter !== 'none' || style.mixBlendMode !== 'normal'; };
  return {
    staged: !!fx, flash: !!fx?.querySelector('.wipefx-flash'), marks: fx?.querySelectorAll('.wipefx-mark').length,
    rings: fx?.querySelectorAll('.wipefx-shock i').length, sparks: fx?.querySelectorAll('.wipefx-spark').length,
    // No copy of a card is drawn: the real cards are marked where they stand.
    clones: document.querySelectorAll('.gamefx-wipecard, .gamefx-cardghost, .wipefx .mini').length,
    heavy: fx ? [fx, ...fx.querySelectorAll('*')].filter(heavy).length : -1,
    // Parts as large as the screen: each is a layer of about 12 MB on a phone at device pixel ratio 3.
    screens: fx ? [...fx.querySelectorAll('*')].filter(part => { const r = part.getBoundingClientRect(); return r.width >= innerWidth * .9 && r.height >= innerHeight * .9; }).length : -1,
    pulsing: fx ? [...fx.querySelectorAll('.wipefx-frame')].filter(frame => getComputedStyle(frame).animationIterationCount.includes('infinite')).length : -1,
    camera: getComputedStyle(document.querySelector('#game')).animationName,
    grain: getComputedStyle(document.body, '::after').content,
  };
});

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

    // A wipe keeps its plate, frames, flash and one shockwave. It draws no
    // copy of a card, nothing blurred or blended, no sparks, no camera shake
    // and no page grain.
    const wipe = await stageWipe(page);
    // Frames stand on the visible board (the phone's Mine view groups equal creatures).
    assert.ok(wipe.marks >= 1, JSON.stringify(wipe));
    assert.deepEqual({...wipe, marks: 1}, {staged: true, flash: true, marks: 1, rings: 1, sparks: 0, clones: 0, heavy: 0, screens: 0, pulsing: 0, camera: 'none', grain: 'none'}, JSON.stringify(wipe));
    console.log('PASS phone: a staged wipe draws no card copies, screen-sized layers, blur, blend, sparks, camera shake or grain');

    // Restoring a saved table: effects of the replayed actions are not drawn.
    await page.evaluate(() => _ui.showGameEffect({kind: 'boardWipeResolved', count: 0}));
    await page.waitForFunction(() => !document.querySelector('.wipefx') && !document.querySelector('.wipe-dead, .wipe-doomed'), undefined, {timeout: 6000});
    const restoring = await page.evaluate(event => {
      const before = document.querySelectorAll('.wipefx, .gamefx-impact, .effectnotice').length;
      _ui.accountReplay = {current: 0, total: 3};
      _game.note('gameEffect', {kind: 'boardWipe', mode: 'destroy', cards: _game.bf().filter(card => card.is('Creature')), source: null});
      _game.note('gameEffect', {kind: 'damage', target: _ui.me, targetPlayer: _ui.me, targetKind: 'player', amount: 5, source: null});
      _game.note('effectNotice', {text: 'Restored notice', kind: 'info'});
      const during = document.querySelectorAll('.wipefx, .gamefx-impact, .effectnotice').length - before;
      _ui.accountReplay = null;
      _game.note('gameEffect', {kind: 'boardWipe', mode: 'destroy', cards: _game.bf().filter(card => card.is('Creature')), source: null});
      const live = document.querySelectorAll('.wipefx').length;
      return {during, live};
    });
    assert.equal(restoring.during, 0, 'nothing is drawn while a saved table is restored');
    assert.equal(restoring.live, 1, 'the next live wipe is drawn again');
    console.log('PASS restoring a saved table draws no effects; live play draws them again');
    await context.close();
  }
  // Desktop keeps the full wipe: two shockwaves, sparks and the camera.
  {
    const {context, page} = await table(false);
    const wipe = await stageWipe(page);
    assert.equal(wipe.rings, 2);
    assert.ok(wipe.screens >= 2, 'the veil and the flash cover the table on a desktop');
    assert.ok(wipe.sparks >= 5, JSON.stringify(wipe));
    assert.equal(wipe.camera, 'dsWipeCamera');
    assert.equal(wipe.clones, 0);
    console.log('PASS desktop keeps the full wipe');
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) server.close();
}
