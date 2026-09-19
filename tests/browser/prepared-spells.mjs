// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser/prepared-spells.mjs
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.PREPARED_QA_OUTPUT || `${root}output/web-game/prepared-spells`;
mkdirSync(output, { recursive: true });
const server = express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 720 }, hasTouch: true, reducedMotion: 'reduce' });
const errors = [], layouts = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
});

async function fixture({ ordinaryExile = false, emptyHand = false, phase = 'main1' } = {}) {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible');
  return page.evaluate(({ ordinaryExile, emptyHand, phase }) => {
    document.body.classList.add('game-active');
    document.querySelector('#setup').style.display = 'none';
    const surface = document.querySelector('#game');
    surface.replaceWith(surface.cloneNode(false));
    document.querySelector('#game').style.display = 'flex';
    const ui = new MTG.UI();
    const g = new MTG.Game({ seed: 190926, paced: false, onEvent: () => ui.queueRender() });
    const you = g.addPlayer('You', { name: 'Prismari Artistry' }, null, false);
    const bot = g.addPlayer('Rival', { name: 'Test' }, { decide: async () => ({ kind: 'pass' }) }, true);
    you.controller = ui.controllerFor(you);
    ui.game = g; ui.me = you; ui.prioMode = 'full'; ui.mobileView = 'mine';
    g.turnPlayer = you; g.turnNo = 20; g.phase = phase; g.step = phase === 'combat' ? 'blockers' : 'main'; g.speedFactor = 0;
    window._game = g; window._ui = ui;
    const put = (name, zone = 'battlefield', owner = you) => {
      const c = new MTG.CardInst(MTG.DEFS[name], owner); c.zone = zone; c.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(c);
      return c;
    };
    const sources = Array.from({ length: 3 }, () => {
      const c = put('Inspired Skypainter'); c.isToken = true;
      MTG.E.prepareSpell(g, c, MTG.E.preparedSpellDefinitions["Maestro's Gift"]);
      return c;
    });
    const target = put('Grizzly Bears');
    put('Elvish Mystic', 'battlefield', bot);
    for (const name of ['Island', 'Island', 'Mountain', 'Mountain', 'Mountain', 'Mountain']) put(name);
    if (!emptyHand) for (const name of ['Chain Reaction', 'Volcanic Salvo', 'Island']) put(name, 'hand');
    if (ordinaryExile) for (let n = 0; n < 5; n++) {
      const c = put('Lightning Bolt', 'exile');
      c.meta = { playableBy: you, playableUntil: g.turnNo };
    }
    g.recalc();
    window.__preparedSources = sources;
    window.__preparedResult = null;
    const q = { type: phase === 'combat' ? 'priority' : 'main', player: you, phase, casts: g.castableList(you), acts: g.activatableList(you), lands: [] };
    void you.controller.decide(g, q).then(async action => {
      const cast = await g.performAction(you, action);
      // Real target selection and payment happen in performAction. Resolve the
      // resulting spell without starting unrelated turns in this focused fixture.
      while (g.stack.length || g.pendingTriggers.length) {
        await g.flushTriggers();
        if (g.stack.length) await g.resolveTop();
      }
      __preparedResult = { cast, card: action.card?.iid, prepared: sources.map(c => c.meta.prepared),
        sourceZones: sources.map(c => c.zone), copyZone: action.card?.zone,
        bears: g.bf().filter(c => c.name === 'Grizzly Bears').length,
        tappedLands: g.bf().filter(c => c.is('Land') && c.tapped).length };
      ui.render();
    }).catch(error => { __preparedResult = { error: error.stack }; });
    ui.render();
    return { sources: sources.map(c => c.iid), spells: sources.map(c => c.meta.preparedCopy), target: target.iid };
  }, { ordinaryExile, emptyHand, phase });
}

async function layout(label) {
  const result = await page.evaluate(() => {
    const rect = selector => {
      const node = document.querySelector(selector), r = node?.getBoundingClientRect();
      return r && { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      hand: rect('.hand'), dock: rect('.handwrap'), tabs: rect('.mobileviewtabs'), zones: rect('.handzones') };
  });
  layouts.push({ label, ...result });
  assert.ok(result.scrollWidth <= result.width + 1, label + ': no page overflow');
  assert.ok(result.hand.width >= 105, label + ': hand has room for a whole card');
  assert.ok(result.hand.x >= 0 && result.hand.x + result.hand.width <= result.width + 1, label + ': hand fits');
  assert.ok(result.dock.y + result.dock.height <= result.height + 1, label + ': dock fits');
  if (result.tabs.height) assert.ok(result.dock.y + result.dock.height <= result.tabs.y + 1, label + ': dock does not cover navigation');
}

try {
  let ids = await fixture();
  assert.equal(await page.locator('.handzones').count(), 0, 'Prepared spells never create an exile dock');
  assert.equal(await page.locator('.mini.prepared').count(), 3, 'Identical prepared tokens stay individually selectable');
  assert.equal(await page.locator('.offzone').count(), 0, 'Prepared casts do not duplicate exile shortcuts');
  for (const [width, height] of [[320, 568], [390, 660], [390, 844], [430, 932], [667, 375], [820, 1180], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    await layout(`prepared-${width}x${height}`);
    await page.screenshot({ path: `${output}/prepared-${width}x${height}.png` });
  }
  check('Three prepared creatures remain separate and leave the hand clear at seven viewport sizes');

  await page.setViewportSize({ width: 390, height: 720 });
  await page.locator(`.mini[data-iid="${ids.sources[1]}"]`).click();
  assert.equal(await page.locator('.preparedspell').count(), 1);
  assert.match(await page.locator('.preparedspell').innerText(), /Maestro's Gift/);
  assert.equal(await page.locator('.preparedcast:not(:disabled)').count(), 1);
  for (const [width, height] of [[320, 568], [667, 375], [390, 720]]) {
    await page.setViewportSize({ width, height });
    const controls = await page.locator('.preparedcast').evaluate(button => {
      const r = button.getBoundingClientRect();
      return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, height: r.height, width: innerWidth, screenHeight: innerHeight };
    });
    assert.ok(controls.x >= 0 && controls.right <= controls.width && controls.height >= 44, 'Prepared cast is a full touch target');
    assert.ok(controls.y >= 0 && controls.bottom <= controls.screenHeight, 'Prepared cast remains on screen');
  }
  await page.screenshot({ path: `${output}/prepared-creature-actions.png` });
  await page.locator('.preparedcast').click();
  for (let n = 0; n < 100; n++) {
    if (await page.evaluate(() => !!__preparedResult)) break;
    const type = await page.evaluate(() => _ui.pending?.q.type);
    if (type === 'chooseTargets') {
      const chosen = await page.evaluate(() => _ui.pending.sel.length);
      if (!chosen) await page.locator(`.mini.targetable[data-iid="${ids.target}"]`).click();
      await page.locator('.promptbar .pbtn.primary:not(:disabled)').click();
    } else {
      const proceed = page.locator('.actionstage .pbtn.primary:visible, .modal .pbtn.primary:visible, .reveal .pbtn.primary:visible');
      if (await proceed.count()) await proceed.first().click();
      else {
        const pass = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue)/ }).filter({ visible: true });
        if (await pass.count()) await pass.last().click();
      }
    }
    await page.waitForTimeout(50);
  }
  const cast = await page.evaluate(() => __preparedResult);
  assert.ok(cast, 'Cast completed');
  assert.equal(cast.error, undefined);
  assert.equal(cast.cast, true);
  assert.equal(cast.card, ids.spells[1], 'The selected creature supplies the spell');
  assert.deepEqual(cast.prepared, [true, false, true]);
  assert.deepEqual(cast.sourceZones, ['battlefield', 'battlefield', 'battlefield']);
  assert.equal(cast.copyZone, 'ceased');
  assert.equal(cast.bears, 2);
  assert.equal(cast.tappedLands, 5, 'Normal mana payment is retained');
  assert.equal(await page.locator('.mini.prepared').count(), 2);
  check('Creature action casts the correct copy, selects its target, pays five mana and consumes only that preparation');

  ids = await fixture({ phase: 'combat' });
  await page.locator(`.mini[data-iid="${ids.sources[0]}"]`).click();
  assert.equal(await page.locator('.preparedcast:disabled').count(), 1);
  assert.match(await page.locator('.preparedspell').innerText(), /main phase and an empty Stack/);
  assert.equal(await page.evaluate(() => __preparedSources[0].meta.prepared), true);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  check('Prepared sorcery remains visible but unavailable during combat');

  for (const emptyHand of [false, true]) {
    await fixture({ ordinaryExile: true, emptyHand });
    assert.equal(await page.locator('.exiletraycard').count(), 5, 'Ordinary exile permissions stay visible');
    assert.equal(await page.locator('.exiletraycard').filter({ hasText: "Maestro's Gift" }).count(), 0);
    for (const [width, height] of [[320, 568], [390, 660], [430, 932], [667, 375]]) {
      await page.setViewportSize({ width, height });
      await layout(`exile-${emptyHand ? 'empty' : 'normal'}-${width}x${height}`);
      await page.screenshot({ path: `${output}/exile-${emptyHand ? 'empty' : 'normal'}-${width}x${height}.png` });
    }
  }
  check('Real exile cards remain scrollable beside normal and empty hands on narrow and landscape phones');
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  writeFileSync(`${output}/report.json`, JSON.stringify({ checks, layouts, errors }, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
