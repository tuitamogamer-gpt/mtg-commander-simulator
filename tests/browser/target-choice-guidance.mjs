import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const playwright = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browserEngine = process.env.BROWSER_ENGINE || 'chromium';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.TARGET_GUIDANCE_OUTPUT || `${root}output/web-game/target-choice-guidance`;
mkdirSync(output, { recursive: true });
const server = process.env.GAME_URL ? null : express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await playwright[browserEngine].launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, reducedMotion: 'reduce', hasTouch: true });
const errors = [], layouts = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1');
});
async function reachable(selector) {
  const metrics = await page.locator(selector).evaluate(element => {
    const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { visible: r.width > 0 && r.height >= (innerWidth <= 900 ? 40 : 32) && r.x >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight,
      clickable: hit === element || element.contains(hit) };
  });
  assert.deepEqual(metrics, { visible: true, clickable: true }, selector);
}
try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible');
  await page.evaluate(() => {
    const root = document.querySelector('#game'); root.replaceWith(root.cloneNode(false));
    document.querySelector('#setup').style.display = 'none'; document.body.classList.add('game-active');
    const game = new MTG.Game({ seed: 91327, paced: false });
    const quiet = { decide: async () => [] };
    const you = game.addPlayer('You', { name: 'Call for Backup' }, quiet, false);
    const other = game.addPlayer('Opponent', { name: 'Elven Council' }, quiet, true);
    game.addPlayer('AI Wolf', { name: 'Quick Draw' }, quiet, true);
    game.addPlayer('AI Dragon', { name: 'Draconic Destruction' }, quiet, true);
    const ui = new MTG.UI(); ui.game = game; ui.me = you; ui.commandTableView = 'table';
    you.controller = ui.controllerFor(you);
    game.turnPlayer = you; game.turnNo = 6; game.phase = 'main1'; game.step = 'main';
    const put = (name, player, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], player);
      card.ctrl = player; card.zone = zone; card.sick = false;
      if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
      return card;
    };
    const source = put('Bright-Palm, Soul Awakener', you);
    you.commanders = [source]; other.commanders = [put('Galadriel, Elven-Queen', other)];
    const body = put('Grizzly Bears', you), dead = put('Llanowar Elves', you, 'graveyard');
    put('Forest', you, 'graveyard'); put('Forest', you); put('Sol Ring', you);
    const opposingBody = put('Grizzly Bears', other); put('Mountain', other);
    const shortSource = put('Jace, Multiverse Architect', you, 'command');
    for (const name of ['Plan for All Outcomes', 'Niv-Mizzet, Ghost Counsel', "Serra's Emissary", 'The Ur-Sphinx', 'Archfiend of Despair', 'Island']) put(name, you, 'hand');
    const opposingDead = put('Grizzly Bears', other, 'graveyard');
    const exiled = put('Llanowar Elves', you, 'exile');
    const prompt = 'Choose a creature you control to receive the counters and the granted ability. When that creature attacks this turn, double the number of +1/+1 counters on target creature. This first selection determines which creature receives the ability.';
    const specs = [
      { zone: 'battlefield', what: 'creature', count: 1, filter: (g, card) => card === body, prompt },
      { zone: 'graveyard', what: 'card', count: 1, filter: (g, card) => card === dead,
        prompt: 'Choose a creature card from your graveyard to return to your hand.' },
    ];
    window._game = game; window._ui = ui;
    window.__guidance = { body, dead, opposingBody, opposingDead, exiled, source, prompt, specs, ctx: null, answer: null };
    window.__beginShortGuidance = () => {
      __guidance.answer = null;
      void you.controller.decide(game, { type: 'chooseTargets', player: you, src: shortSource,
        candidates: [body, opposingBody], min: 1, max: 1, prompt: 'Choose target' })
        .then(answer => { __guidance.answer = answer; });
    };
    window.__beginGuidance = () => {
      __guidance.ctx = { g: game, you, src: source, cancelable: true };
      __guidance.answer = null;
      void game.pickTargets(__guidance.ctx, specs, source, you).then(answer => { __guidance.answer = answer; });
    };
    game.recalc(); __beginShortGuidance(); ui.render();
  });
  for (const [width, height] of [[390, 720], [320, 568], [430, 932], [820, 1180], [667, 375], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => Math.abs(document.querySelector('#game').getBoundingClientRect().height - innerHeight) < 2);
    const target = page.locator(`.myboard .mini[data-iid="${await page.evaluate(() => __guidance.body.iid)}"]`);
    await reachable(`.myboard .mini[data-iid="${await page.evaluate(() => __guidance.body.iid)}"]`);
    const layout = await target.evaluate(card => {
      const board = card.closest('.myboard').getBoundingClientRect(), r = card.getBoundingClientRect();
      const rail = document.querySelector('.ct-decision-rail').getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, boardHeight: board.height, promptHeight: rail.height,
        cardFits: r.top >= board.top && r.bottom <= board.bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
        tabsFit: document.querySelector('.mobileviewtabs').getBoundingClientRect().bottom <= innerHeight + 1,
        gridRows: getComputedStyle(document.querySelector('#game')).gridTemplateRows };
    });
    layouts.push(layout);
    assert.equal(layout.cardFits, true, `A complete legal target is visible: ${JSON.stringify(layout)}`);
    assert.equal(layout.overflow, false);
    assert.equal(layout.tabsFit, true, JSON.stringify(layout));
    if (height > 500) assert.ok(layout.promptHeight < 200, 'A short target choice does not fill the screen');
    await target.click();
    assert.equal(await target.evaluate(card => {
      const board = card.closest('.myboard').getBoundingClientRect(), r = card.getBoundingClientRect();
      return r.top >= board.top && r.bottom <= board.bottom;
    }), true, 'The selected target remains fully visible when its selection chip appears');
    await reachable('.targetprompt .primary');
    await page.screenshot({ path: `${output}/short-target-${width}x${height}.png` });
    await page.evaluate(() => { window.__targetPending = _ui.pending; });
    await page.getByRole('navigation', { name: 'Arena view' }).getByRole('button', { name: /^Hand/i }).click();
    assert.equal(await page.locator('.hand .hcard:visible').count(), 6);
    assert.equal(await page.evaluate(() => _ui.pending === __targetPending && _ui.pending.sel[0] === __guidance.body), true);
    await page.getByRole('navigation', { name: 'Arena view' }).getByRole('button', { name: /^Mine/i }).click();
    await page.locator('.targetpickchip').click();
    await page.locator('.ct-seat').first().click();
    const opponentSelector = `.opprow.ct-focused .mini[data-iid="${await page.evaluate(() => __guidance.opposingBody.iid)}"]`;
    await reachable(opponentSelector);
    await page.locator(opponentSelector).click();
    assert.equal(await page.evaluate(() => __guidance.answer), null, 'Selecting or navigating never confirms the decision');
    await page.locator('.targetprompt .primary').click();
    await page.waitForFunction(() => __guidance.answer?.[0] === __guidance.opposingBody);
    await page.getByRole('navigation', { name: 'Arena view' }).getByRole('button', { name: /^Mine/i }).click();
    assert.equal(await page.locator('.handwrap').isVisible(), true, 'The hand returns when targeting ends');
    await page.evaluate(() => __beginShortGuidance());
  }
  await page.evaluate(() => { _ui.resolvePending([]); __beginGuidance(); });
  for (const [width, height] of [[1440, 1024], [1280, 720], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => Math.abs(document.querySelector('#game').getBoundingClientRect().height - innerHeight) < 2);
    assert.equal(await page.locator('.targetinstructiontext').innerText(), await page.evaluate(() => __guidance.prompt));
    assert.equal(await page.locator('.targetstep').innerText(), 'TARGET 1 OF 2');
    assert.ok(await page.locator('.targetpromptbody').evaluate(element => element.clientHeight >= 64), 'The instruction has readable space above the fixed actions');
    assert.equal(await page.locator('.targetinstructiontext').evaluate(element => {
      const style = getComputedStyle(element);
      return style.whiteSpace !== 'nowrap' && element.scrollWidth <= element.clientWidth + 1;
    }), true);
    assert.equal(await page.locator('.targetprompt .primary').isDisabled(), true);
    const id = await page.evaluate(() => __guidance.body.iid);
    await page.locator(`.mini[data-iid="${id}"]`).click();
    await reachable('.targetprompt .primary');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `${output}/long-instruction-${width}.png` });
    await page.getByRole('button', { name: 'Confirm & next →', exact: true }).click();
    await page.waitForFunction(() => _ui.pending?.q.targetStep === 2);
    assert.ok(await page.locator('.targetpromptbody').evaluate(element => element.clientHeight >= 64), 'Zone shortcuts leave the current instruction visible');
    assert.match(await page.locator('.targetprevious').innerText(), /Target 1: Grizzly Bears/);
    assert.equal(await page.locator('.meinfo [data-z="graveyard"].targetzone').count(), 1);
    assert.equal(await page.locator('.ct-player-zones .targetzone').count(), 0, 'Unrelated graveyards are not highlighted');
    await reachable('.targetzoneopen');
    await page.screenshot({ path: `${output}/graveyard-step-${width}.png` });
    await page.getByRole('button', { name: /Open your graveyard/ }).click();
    assert.equal(await page.locator('.zonetargetpicker .targetzonepick').count(), 1);
    assert.equal(await page.locator('.zonetargetpicker .targetineligible').count(), 1);
    await page.getByRole('button', { name: 'Choose Llanowar Elves from graveyard', exact: true }).click();
    assert.match(await page.locator('.targetpickchips').innerText(), /Llanowar Elves/);
    assert.equal(await page.evaluate(() => __guidance.dead.zone), 'graveyard', 'Selection waits for explicit confirmation');
    await reachable('.targetprompt .primary');
    await page.locator('.targetprompt .primary').click();
    await page.waitForFunction(() => __guidance.answer === true);
    assert.deepEqual(await page.evaluate(() => __guidance.ctx.targets.map(card => card.name)), ['Grizzly Bears', 'Llanowar Elves']);
    assert.equal(await page.locator('.targetzone').count(), 0, 'Indicators clear when the decision ends');
    await page.evaluate(() => __beginGuidance());
  }
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.getByRole('button', { name: 'Abort cast ↩', exact: true }).click();
  await page.evaluate(() => {
    void _ui.me.controller.decide(_game, { type: 'chooseTargets', player: _ui.me, src: __guidance.source,
      candidates: [__guidance.opposingDead, __guidance.exiled], min: 0, max: 2,
      prompt: 'Choose up to two cards from the highlighted graveyard and exile.' });
  });
  assert.equal(await page.locator('.ct-player-zones .targetzone').count(), 1);
  assert.equal(await page.locator('.meinfo [data-z="exile"].targetzone').count(), 1);
  assert.equal(await page.locator('.meinfo [data-z="graveyard"].targetzone').count(), 0);
  await page.getByRole('button', { name: /Open your exile/ }).click();
  await page.getByRole('button', { name: 'Choose Llanowar Elves from exile', exact: true }).click();
  await page.getByRole('button', { name: /Open Opponent's graveyard/ }).click();
  await page.getByRole('button', { name: 'Choose Grizzly Bears from graveyard', exact: true }).click();
  assert.match(await page.locator('.targetprompthead').innerText(), /2 \/ 2 selected/);
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/result.json`, JSON.stringify({ browserEngine, base, layouts, errors }, null, 2));
  console.log('PASS: visible own/opponent targets with a six-card hand at six mobile sizes, Hand navigation, long instructions, sequential target decisions, graveyards, exile and explicit confirmation');
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
}
