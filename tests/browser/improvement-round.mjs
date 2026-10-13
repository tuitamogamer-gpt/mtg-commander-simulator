// Native paid choices and presentation recovery, using the real browser UI.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.ROUND_OUTPUT || `${root}output/improvement-round`;
const baseline = process.env.ROUND_BASELINE_UI;
const target = process.env.GAME_URL;
assert.ok(!target || !baseline, 'Production must load actual deployed source');
mkdirSync(output, {recursive: true});
let server, base = target;
if (!base) {
  const app = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}));
  if (baseline) app.get('/src/modules/ui.js', (_req, res) => res.sendFile(baseline));
  app.use(express.static(root));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {}),
});
const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, reducedMotion: 'reduce'});
const errors = [], checks = [], sources = [];
const entrySources = new Set(['frontend-overhaul.css', 'account.js', 'public-entry.js', 'app.js']);
const sourceNames = ['ui.js', 'engine.js', 'engine2.js', 'oracle-mechanics.js', 'main.js', 'clb-40k-integration.js',
  'save-state.js', 'problem-report.js', 'c15-c16-precon-rules.js', ...entrySources];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => {
  const name = new URL(response.url()).pathname.split('/').at(-1);
  if (sourceNames.includes(name)) sources.push(response.body().then(body => ({name, url: response.url(), status: response.status(), bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex')})));
});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
});
const screenshot = name => page.screenshot({path: `${output}/${name}.png`, animations: 'disabled'});
async function fixture(brokenView = false) {
  await page.evaluate(brokenView => {
    const old = document.querySelector('#game');
    old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI();
    const game = new MTG.Game({seed: 10132026, paced: false, onEvent: () => ui.queueRender()});
    const pass = {decide: async () => ({kind: 'pass'})};
    const players = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'].map((name, index) => game.addPlayer(name, {name: 'Native choice QA'}, pass, index !== 0));
    const you = players[0];
    ui.game = game; ui.me = you; ui.prioMode = 'off';
    you.controller = ui.controllerFor(you);
    game.turnPlayer = you; game.turnNo = 6; game.phase = 'main1'; game.step = 'main';
    window._game = game; window._ui = ui;
    const put = (name, zone) => {
      const card = new MTG.CardInst(MTG.DEFS[name], you);
      card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : you[zone]).push(card);
      return card;
    };
    const lands = Array.from({length: 4}, () => put('Forest', 'battlefield'));
    const throne = put('Roaming Throne', 'hand');
    game.recalc();
    const receipt = window.__round = {done: false, error: null, blocked: brokenView, throne, lands, durations: []};
    const commandTable = ui.renderCommandTable;
    ui.renderCommandTable = function (...args) {
      if (receipt.blocked && this.pending?.q.aiHint?.kind === 'chooseType') throw new Error('Injected presentation failure');
      return commandTable.apply(this, args);
    };
    const render = ui.render;
    ui.render = function (...args) {
      const start = performance.now();
      try { return render.apply(this, args); }
      finally { receipt.durations.push(performance.now() - start); }
    };
    ui.render();
    void game.castSpell(you, throne, {from: 'hand'}).then(result => {receipt.done = result;}, error => {receipt.error = error.message;});
  }, brokenView);
  await page.waitForFunction(() => _ui.pending?.q.aiHint?.kind === 'chooseType');
}
async function chooseNinja() {
  const search = page.getByRole('searchbox', {name: 'Creature type'});
  if (!baseline) {
    await search.fill('  nInJa  ');
    await page.waitForFunction(() => document.querySelectorAll('.searchchoices button').length === 1);
    await screenshot(`03-ninja-filtered-${page.viewportSize().width}`);
    await search.press('Enter');
  } else await page.locator('.modal button[data-choice-key="Ninja"]').click();
  await page.waitForFunction(() => window.__round.done || window.__round.error);
  const state = await page.evaluate(() => ({done: __round.done, error: __round.error, zone: __round.throne.zone,
    type: __round.throne.meta.cslType, tappedLands: __round.lands.filter(card => card.tapped).length,
    stack: _game.stack.length, pending: _ui.pendings.length}));
  assert.deepEqual(state, {done: true, error: null, zone: 'battlefield', type: 'Ninja', tappedLands: 4, stack: 0, pending: 0});
  return state;
}
try {
  await page.goto(base);
  await screenshot('01-landing');
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  await screenshot('02-solo-decks');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  checks.push('Mobile landing and Solo deck selection remain usable without overflow');
  await fixture();
  await screenshot('03-creature-type-choice');
  const measurement = await page.evaluate(() => ({options: _ui.pending.q.options.length,
    renderedButtons: document.querySelectorAll('.modal button[data-choice-key]').length,
    durations: __round.durations, search: !!document.querySelector('input[aria-label="Creature type"]')}));
  const paidChoice = await chooseNinja();
  checks.push('Actual paid Roaming Throne enters as Ninja and pays exactly four mana');
  if (!baseline) {
    assert.equal(measurement.search, true);
    assert.ok(measurement.renderedButtons <= 50);
    await fixture(true);
    await page.waitForSelector('[data-testid="view-recovery"]');
    await screenshot('04-retry-view');
    assert.deepEqual(await page.evaluate(() => ({done: __round.done, error: __round.error,
      choice: _ui.pending.q.aiHint.kind, tappedLands: __round.lands.filter(card => card.tapped).length})),
    {done: false, error: null, choice: 'chooseType', tappedLands: 4});
    await page.evaluate(() => {__round.blocked = false;});
    await page.locator('[data-testid="retry-view"]').click();
    await page.waitForSelector('input[aria-label="Creature type"]');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Creature type',
      'Retry restores keyboard focus to the still waiting choice');
    await chooseNinja();
    assert.equal(await page.locator('[data-testid="view-recovery"]').count(), 0);
    checks.push('Retry redraws the same waiting choice and completes one paid cast');
    for (const viewport of [{width: 320, height: 740}, {width: 1440, height: 1000}]) {
      await page.setViewportSize(viewport);
      await fixture();
      await chooseNinja();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    }
    checks.push('Choice and keyboard submission work at 320px and desktop widths');
  }
  await screenshot('05-completed-choice');
  assert.deepEqual(errors, []);
  const loaded = await Promise.all(sources);
  if (target) for (const name of sourceNames) {
    const path = entrySources.has(name) ? 'src/' + name : 'src/modules/' + name;
    const expected = createHash('sha256').update(readFileSync(root + path)).digest('hex');
    assert.ok(loaded.some(row => row.name === name && row.status === 200 && row.sha256 === expected), `Shipped ${name} matches local source`);
  }
  writeFileSync(`${output}/result.json`, JSON.stringify({target: base, baseline: !!baseline, checks, measurement, paidChoice, errors, loaded}, null, 2) + '\n');
  console.log(JSON.stringify({checks, measurement, errors}));
} catch (error) {
  await screenshot('failure');
  writeFileSync(`${output}/failure.json`, JSON.stringify({message: error.message, errors}, null, 2));
  throw error;
} finally {
  await browser.close();
  if (server) server.close();
}
