// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs BROWSER_ENGINE=webkit node tests/browser/arena-refresh.mjs
// Motion intentionally stays enabled: disabling animations hides refresh regressions.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE || 'chromium';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.ARENA_REFRESH_QA_OUTPUT || `${root}output/web-game/arena-refresh-${engine}`;
mkdirSync(output, { recursive: true });
const server = express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await playwright[engine].launch({ headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, reducedMotion: 'no-preference', hasTouch: true });
const errors = [], failedRequests = [], checks = [], scrollChecks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) failedRequests.push({ status: response.status(), url: response.url() }); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '0');
});
const check = message => { checks.push(message); console.log(`PASS ${message}`); };

async function fixture() {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry');
  await page.evaluate(() => {
    const oldRoot = document.querySelector('#game');
    oldRoot.replaceWith(oldRoot.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.body.classList.add('game-active');
    const game = new MTG.Game({ seed: 90526, paced: false });
    const quiet = { decide: async () => [] };
    const decks = ['Quick Draw', 'Elven Council', 'Squirreled Away', 'Temur Roar'];
    const players = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'].map((name, i) => game.addPlayer(name, { name: decks[i] }, quiet, i > 0));
    const you = players[0], ui = new MTG.UI();
    ui.game = game; ui.me = you; ui.commandTableView = 'table'; ui.handSort = 'draw';
    you.controller = ui.controllerFor(you);
    game.turnPlayer = you; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
    window._game = game; window._ui = ui;
    window.__refreshPut = (name, owner, zone = 'battlefield') => {
      if (!MTG.DEFS[name]) throw new Error(`Missing fixture definition: ${name}`);
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.ctrl = owner; card.zone = zone; card.sick = false;
      if (zone === 'battlefield') game.battlefield.push(card);
      else if (owner[zone]) owner[zone].push(card);
      return card;
    };
    for (const [i, player] of players.entries()) {
      player.commanders = [__refreshPut(MTG.DECKS[decks[i]].commander, player, 'command')];
      player.life = [32, 36, 28, 24][i];
      for (let n = 0; n < 12; n++) {
        const card = __refreshPut(['Riders of Gavony', 'Humble Defector', 'Stormcatch Mentor'][n % 3], player);
        card.counters['+1/+1'] = n;
      }
      __refreshPut('Sol Ring', player);
      for (const name of ['Forest', 'Island', 'Mountain', 'Island', 'Forest', 'Mountain']) __refreshPut(name, player);
    }
    for (const name of ['Forest', 'Counterspell', 'Beast Within', 'Swords to Plowshares', 'Sol Ring', 'Island', 'Mountain']) __refreshPut(name, you, 'hand');
    for (let n = 0; n < 11; n++) __refreshPut('Island', you, 'hand');
    you.pool.U = you.pool.G = you.pool.W = 3; you.pool.C = 6;
    game.recalc(); game.lg('AI Dragon finishes resolving an ability.', 'ability');
    window.__refreshQuestion = () => ({ type: 'main', player: you, phase: game.phase,
      casts: game.castableList(you), acts: [], lands: game.playableLands(you) });
    window.__refreshAnswered = null;
    void you.controller.decide(game, __refreshQuestion()).then(answer => { window.__refreshAnswered = answer; });
    ui.render();
  });
}

async function stableRender(label, { botLog = false } = {}) {
  // Initial entrance transforms temporarily contribute to scrollHeight. Let
  // those finish before measuring; normal repeating card motion stays active.
  await page.waitForFunction(() => document.getAnimations().every(animation =>
    animation.effect?.getTiming().iterations === Infinity || ['finished', 'idle'].includes(animation.playState)));
  const result = await page.evaluate(async ({ botLog }) => {
    const selectors = ['.handwrap', '.hand', '.hand .hcard', '.hand .hcard img',
      '.myboard', '.myboard .mini', '.myboard .mini img', '.myboard .ct-portrait',
      '.oppsouter', '.opprow .ct-portrait', '.ct-seat-ribbon .ct-portrait'];
    const tracked = selectors.map(selector => ({ selector, node: document.querySelector(selector) }));
    const focused = document.querySelector('.hand .hcard');
    focused.focus({ preventScroll: true });
    const removed = [];
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.removedNodes) {
        for (const item of tracked) if (node === item.node || node.contains(item.node)) removed.push(item.selector);
      }
    });
    observer.observe(document.querySelector('#game'), { childList: true, subtree: true });
    const scroll = [...document.querySelectorAll('.hand, .myboard, .oppsouter, .ct-decision-content, .oppstrip')]
      .map((node, index) => {
        node.scrollLeft = Math.min(187, Math.max(0, node.scrollWidth - node.clientWidth));
        node.scrollTop = Math.min(113, Math.max(0, node.scrollHeight - node.clientHeight));
        return { index, className: node.className, x: node.scrollLeft, y: node.scrollTop,
          height: node.clientHeight, contentHeight: node.scrollHeight,
          overflowX: node.scrollWidth > node.clientWidth && node.clientWidth > 0,
          overflowY: node.scrollHeight > node.clientHeight && node.clientHeight > 0 };
      });
    for (let i = 0; i < 4; i++) {
      if (botLog) _game.lg(`AI Dragon resolved ability ${i + 1}.`, 'ability');
      _ui.render();
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    await Promise.resolve(); observer.disconnect();
    const afterScroll = [...document.querySelectorAll('.hand, .myboard, .oppsouter, .ct-decision-content, .oppstrip')];
    return {
      nodes: tracked.map(({ selector, node }) => ({ selector, exists: !!node, connected: !!node?.isConnected,
        same: node === document.querySelector(selector) })),
      removed: [...new Set(removed)], focused: document.activeElement === focused,
      scroll: scroll.map(before => ({ ...before, afterX: afterScroll[before.index]?.scrollLeft, afterY: afterScroll[before.index]?.scrollTop,
        afterHeight: afterScroll[before.index]?.clientHeight, afterContentHeight: afterScroll[before.index]?.scrollHeight })),
      log: document.querySelector('.ticker')?.textContent,
      motion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  }, { botLog });
  assert.equal(result.motion, false, 'System reduced motion must not mask rerender animation');
  assert.ok(result.nodes.every(node => node.exists && node.connected && node.same), `${label}: stable DOM nodes ${JSON.stringify(result.nodes)}`);
  assert.deepEqual(result.removed, [], `${label}: unchanged regions must never be removed from the live DOM`);
  assert.equal(result.focused, true, `${label}: focus remains on the same hand control`);
  for (const position of result.scroll) {
    assert.equal(position.afterX, position.x, `${label}: ${position.className} horizontal scroll`);
    assert.equal(position.afterY, position.y, `${label}: vertical scroll ${JSON.stringify(position)}`);
  }
  if (botLog) assert.match(result.log, /resolved ability 4/, 'Latest bot activity must still update');
  scrollChecks.push({ label, positions: result.scroll });
  check(`${label}: live card/image/portrait nodes, keyboard focus and scroll positions survive repeated renders`);
}

async function shot(name) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('.hand, .myboard, .oppsouter, .oppstrip, .ct-decision-content')) { node.scrollTop = 0; node.scrollLeft = 0; }
    document.activeElement?.blur();
  });
  await page.waitForFunction(() => [...document.querySelectorAll('#game img[src]')]
    .filter(image => { const r = image.getBoundingClientRect(); return r.width && r.height && r.bottom > 0 && r.right > 0 && r.x < innerWidth && r.y < innerHeight; })
    .every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: `${output}/${name}.png` });
}

try {
  await fixture();
  for (const [width, height] of [[1440, 1024], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await stableRender(`${width}x${height} no-op`);
    await stableRender(`${width}x${height} bot activity`, { botLog: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `No page overflow at ${width}`);
    await shot(`arena-${width}x${height}`);
  }
  assert.ok(scrollChecks.some(item => item.positions.some(position => position.className === 'hand' && position.x > 0)), 'Fixture must exercise an actually scrolled hand');
  assert.ok(scrollChecks.some(item => item.positions.some(position => position.className.includes('myboard') && position.y > 0)), 'Fixture must exercise an actually scrolled battlefield');

  await page.setViewportSize({ width: 390, height: 844 });
  const targetId = await page.evaluate(() => {
    const candidates = _game.bf().filter(card => card.ctrl !== _ui.me && card.is('Creature'));
    window.__refreshTargetAnswer = null;
    void _ui.me.controller.decide(_game, { type: 'chooseTargets', player: _ui.me, candidates,
      min: 1, max: 1, message: 'Choose a creature' }).then(answer => { window.__refreshTargetAnswer = answer.map(card => card.iid); });
    return candidates[0].iid;
  });
  await stableRender('390x844 expanded opponent targeting', { botLog: true });
  await page.locator(`.oppsouter .mini[data-iid="${targetId}"]`).click();
  const confirmTargets = page.locator('.promptbar .pbtn.primary:visible:not(:disabled)');
  if (await confirmTargets.count() && !await page.evaluate(() => window.__refreshTargetAnswer)) await confirmTargets.click();
  await page.waitForFunction(() => !!window.__refreshTargetAnswer);
  assert.deepEqual(await page.evaluate(() => window.__refreshTargetAnswer), [targetId]);
  check('An expanded opponent table preserves its scroll and still accepts a real target choice');

  await page.evaluate(() => {
    const spell = __refreshPut('Beast Within', _game.players[1], 'stack');
    const target = _game.bf().find(card => card.ctrl === _ui.me && card.name === 'Sol Ring');
    _game.stack.push({ kind: 'spell', name: spell.name, ctrl: _game.players[1], card: spell, targets: [[target]], castOpts: {} });
    _ui.holdNext = true;
    window.__refreshPriorityAnswer = null;
    void _ui.me.controller.decide(_game, { type: 'priority', player: _ui.me, casts: _game.castableList(_ui.me), acts: [] })
      .then(answer => { window.__refreshPriorityAnswer = answer; });
  });
  for (const [width, height] of [[1440, 620], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await stableRender(`${width}x${height} Stack review`, { botLog: true });
    await shot(`stack-review-${width}x${height}`);
  }
  await page.locator('.actionstage .pbtn.primary').click();
  await page.waitForFunction(() => !!window.__refreshPriorityAnswer);
  assert.equal(await page.evaluate(() => window.__refreshPriorityAnswer.kind), 'pass');
  await page.evaluate(() => { _game.stack.length = 0; _ui.render(); });
  check('The Stack review keeps its scroll and its current Proceed callback');

  await page.setViewportSize({ width: 1440, height: 620 });
  await page.evaluate(() => {
    window.__refreshSavedPendings = _ui.pendings;
    _ui.pendings = [];
    for (let i = 0; i < 3; i++) _game.lg(`AI Dragon ability ${i + 1}: ${'A public battlefield ability finishes resolving and the table receives priority. '.repeat(20)}`, 'ability');
    _ui.render();
  });
  await stableRender('1440x620 overflowing activity rail');
  assert.ok(scrollChecks.at(-1).positions.some(position => position.className === 'ct-decision-content' && position.y > 0),
    'Long activity text must exercise the decision rail with actual overflow');
  await page.evaluate(() => { _ui.pendings = window.__refreshSavedPendings; _ui.render(); });

  await page.setViewportSize({ width: 390, height: 844 });
  const changed = await page.evaluate(() => {
    const hand = document.querySelector('.hand');
    _ui.me.life = 19;
    _game.players[1].life = 23;
    const creature = __refreshPut('Talrand, Sky Summoner', _ui.me);
    _game.recalc(); _ui.render();
    return { iid: creature.iid, handRetained: hand === document.querySelector('.hand'),
      life: document.querySelector('.myboard .melife')?.textContent || document.querySelector('.myboard .meinfo')?.textContent,
      opponentLife: document.querySelector('.opprow[data-player-id="1"] .opplife')?.textContent };
  });
  assert.match(changed.life, /19/);
  assert.match(changed.opponentLife, /23/);
  assert.equal(await page.locator(`.myboard .mini[data-iid="${changed.iid}"]`).count(), 1);
  assert.equal(changed.handRetained, true, 'A battlefield update must preserve the unchanged hand');
  check('Life and new permanents update while the unchanged hand stays in place');

  // The replacement has identical name/art/visible rules. Its callback must
  // nevertheless refer to the newly drawn CardInst, never the old hand card.
  const replacement = await page.evaluate(() => {
    const old = _ui.me.hand.find(card => card.name === 'Forest');
    _ui.me.hand.splice(_ui.me.hand.indexOf(old), 1); old.zone = 'graveyard'; _ui.me.graveyard.push(old);
    const fresh = __refreshPut('Forest', _ui.me, 'hand');
    _ui.pending.q.lands = _game.playableLands(_ui.me);
    _ui.render();
    window.__refreshFreshLand = fresh;
    return { old: old.iid, fresh: fresh.iid };
  });
  await page.locator('.hand .hcard[data-cname="Forest"]').click();
  assert.equal(await page.evaluate(() => _ui.sheet.card.iid), replacement.fresh);
  assert.notEqual(replacement.old, replacement.fresh);
  await page.locator('.sheet').getByRole('button', { name: 'Close', exact: true }).click();
  check('A newly drawn card with identical name/art opens its own card instance');

  await page.locator('.hand .hcard[data-cname="Forest"]').focus();
  await page.evaluate(() => { window.__refreshDialogReturn = document.activeElement; });
  await page.keyboard.press('Enter');
  await page.locator('.sheet').getByRole('button', { name: 'Close', exact: true }).focus();
  const dialogFocus = await page.evaluate(async () => {
    _ui.render();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { inside: !!document.activeElement.closest('.sheet'), text: document.activeElement.textContent.trim() };
  });
  assert.equal(dialogFocus.inside, true, 'Rerendering a card sheet must keep keyboard focus inside the dialog');
  assert.match(dialogFocus.text, /^Close$/);
  await page.locator('.sheet').getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(() => document.activeElement === window.__refreshDialogReturn), true,
    'Closing a rerendered sheet must restore focus to the hand control that opened it');
  check('Card sheet refresh preserves the focused Close control and restores hand focus when closed');

  // Push a real new decision with identical visible options. Resolving its
  // ordinary land action must settle the new promise and reach the engine.
  await page.evaluate(() => {
    window.__refreshPreviousPending = _ui.pending;
    window.__refreshLandAnswer = null; window.__refreshLandPlayed = null;
    void _ui.me.controller.decide(_game, __refreshQuestion()).then(async answer => {
      window.__refreshLandAnswer = { kind: answer.kind, iid: answer.card?.iid };
      if (answer.kind === 'land') {
        window.__refreshLandPlayed = await _game.playLand(_ui.me, answer.card);
        _ui.render();
      }
    });
    _ui.render();
  });
  await page.locator('.hand .hcard[data-cname="Forest"]').click();
  await page.locator('.sheetacts').getByRole('button', { name: 'Play land', exact: true }).click();
  await page.waitForFunction(() => window.__refreshLandPlayed !== null);
  assert.deepEqual(await page.evaluate(() => window.__refreshLandAnswer), { kind: 'land', iid: replacement.fresh });
  assert.equal(await page.evaluate(() => window.__refreshLandPlayed), true);
  assert.equal(await page.evaluate(() => _ui.pending === window.__refreshPreviousPending && window.__refreshAnswered === null), true);
  assert.equal(await page.evaluate(() => __refreshFreshLand.zone), 'battlefield');
  check('Identical-looking replacement decision resolves its own promise and plays the correct land through the engine');

  const attachment = await page.evaluate(() => {
    const host = _game.bf().find(card => card.ctrl === _ui.me && card.name === 'Talrand, Sky Summoner');
    const old = __refreshPut('Swiftfoot Boots', _ui.me);
    old.attachedTo = host.iid; host.attachments = [old.iid];
    _game.recalc(); _ui.render();
    const fresh = __refreshPut('Swiftfoot Boots', _ui.me);
    _game.battlefield.splice(_game.battlefield.indexOf(old), 1);
    old.zone = 'graveyard'; old.attachedTo = null; _ui.me.graveyard.push(old);
    fresh.attachedTo = host.iid; host.attachments = [fresh.iid];
    _game.recalc(); _ui.render();
    return { old: old.iid, fresh: fresh.iid };
  });
  await page.locator(`.attachedcard[data-iid="${attachment.fresh}"]`).click();
  assert.equal(await page.evaluate(() => _ui.sheet.card.iid), attachment.fresh);
  assert.notEqual(attachment.old, attachment.fresh);
  await page.locator('.sheet').getByRole('button', { name: 'Close', exact: true }).click();
  check('Replacing same-name attached Equipment opens the new attachment instance');

  const fallback = await page.evaluate(() => {
    // Force a changed region, so decoded portraits can be reused independently
    // of their newly constructed parent and its event-handler closures.
    _ui.me.life--; _ui.render();
    const target = document.querySelector('.myboard .ct-portrait');
    const original = MTG.imgFail, calls = [], before = target.getAttribute('src');
    MTG.imgFail = image => { calls.push({ same: image === target, connected: image.isConnected }); original(image); };
    try { target.dispatchEvent(new Event('error')); } finally { MTG.imgFail = original; }
    return { calls, connected: target.isConnected, changedSource: target.getAttribute('src') !== before };
  });
  assert.deepEqual(fallback.calls, [{ same: true, connected: true }], 'Reused image fallback must operate on the attached image');
  assert.equal(fallback.connected, true);
  assert.equal(fallback.changedSource, true);
  check('Retained portrait image fallback updates the attached image');
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  writeFileSync(`${output}/report.json`, JSON.stringify({ engine, checks, scrollChecks, errors, failedRequests }, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
