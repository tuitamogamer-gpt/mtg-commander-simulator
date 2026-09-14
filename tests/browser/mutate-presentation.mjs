// Real paid Mutate choices, physical card order, and responsive merged-card details.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/mutate-presentation`;
mkdirSync(output, {recursive: true});
const server = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
page.setDefaultTimeout(12000);
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

async function install() {
  return page.evaluate(() => {
    document.querySelectorAll('.toastmsg,.battlefieldarrival,.turnbanner,.gamefxlayer').forEach(node => node.remove());
    const root = document.querySelector('#game');
    root.replaceWith(root.cloneNode(false));
    const ui = new MTG.UI();
    const g = new MTG.Game({seed: 14, paced: true, onEvent: () => ui.queueRender()});
    const a = g.addPlayer('You', {name: 'Enhanced Evolution'}, null, false);
    const b = g.addPlayer('Local AI', {name: 'Opponent'}, null, true);
    ui.me = a; ui.game = g; ui.prioMode = 'off';
    a.controller = ui.controllerFor(a);
    b.controller = new MTG.AIController(b, {difficulty: 'normal'});
    g.turnPlayer = a; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
    g.priorityRound = async () => {};
    window._ui = ui; window._game = g;
    const put = (name, owner = a, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(card);
      return card;
    };
    for (const owner of [a, b]) for (let n = 0; n < 15; n++) put('Forest', owner, 'library');
    const host = put('Solemn Simulacrum');
    const artifact = put('Sol Ring');
    put('Sol Ring', b);
    const source = put('Pouncing Shoreshark', a, 'hand');
    a.pool.U = 4; a.pool.C = 10;
    g.recalc();
    const audit = window.__mutateAudit = {host, source, artifact, done: false, error: null};
    audit.cast = async spell => {
      audit.done = false;
      const result = await g.castSpell(a, spell, {alt: spell.def.altCosts.find(option => option.mutate)});
      if (!result) throw Error('Mutate casting failed');
      while (g.stack.length || g.pendingTriggers.length) {
        await g.flushTriggers();
        if (g.stack.length) await g.resolveTop();
      }
      audit.done = true; ui.render();
    };
    ui.render();
    void audit.cast(source).catch(error => {audit.error = error.stack;});
    return {host: host.iid, source: source.iid, artifact: artifact.iid};
  });
}

async function chooseHost(id) {
  await page.locator(`.mini.targetable[data-iid="${id}"]`).first().click();
  if (await page.evaluate(() => _ui.pending?.q.type === 'chooseTargets')) {
    await page.locator('.promptbar .pbtn.primary:not(:disabled)').first().click();
  }
  await page.locator('.mutate-order-choice').first().waitFor();
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/?smokeDeck=Enhanced%20Evolution&seed=14`);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', null, {timeout: 120000});
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({width, height});
    for (const order of ['over', 'under']) {
      const ids = await install();
      assert.equal(await page.locator(`.mini.targetable[data-iid="${ids.artifact}"]`).count(), 0);
      await chooseHost(ids.host);
      const choices = page.locator('.mutate-order-choice');
      assert.equal(await choices.count(), 2);
      assert.match(await choices.nth(0).innerText(), /Top:.*Pouncing Shoreshark/s);
      assert.match(await choices.nth(1).innerText(), /Top:.*Solemn Simulacrum/s);
      for (const choice of await choices.all()) {
        const box = await choice.boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, 'choice stays inside viewport');
        assert.equal(await choice.locator('.mutate-layer.incoming').count(), 1);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await page.screenshot({path: `${output}/${width}-${order}-choice.png`});
      await page.locator(`.mutate-order-choice[data-choice-key="${order}"]`).click();
      await page.waitForFunction(() => __mutateAudit.done || __mutateAudit.error);
      assert.equal(await page.evaluate(() => __mutateAudit.error), null);
      const expected = order === 'over' ? ['Pouncing Shoreshark', 'Solemn Simulacrum'] : ['Solemn Simulacrum', 'Pouncing Shoreshark'];
      const state = await page.evaluate(() => ({
        names: MTG.Mutate.present(__mutateAudit.host, _ui.me).map(row => row.name),
        sourceZone: __mutateAudit.source.zone,
        manaSpent: __mutateAudit.source.castMeta.manaSpent,
        artifacts: _game.bf().filter(card => card.name === 'Sol Ring').length,
      }));
      assert.deepEqual(state.names, expected);
      assert.equal(state.sourceZone, 'merged');
      assert.equal(state.manaSpent, 4);
      assert.equal(state.artifacts, 2);
      const mini = page.locator(`.mini.mutated[data-iid="${ids.host}"]`).first();
      assert.equal(await mini.locator('.mutate-underlay').count(), 1);
      assert.match(await mini.getAttribute('aria-label'), /Merged permanent, 2 cards/);
      const peek = await mini.locator('.mutate-underlay').boundingBox();
      const front = await mini.boundingBox();
      assert.ok(peek.y + peek.height > front.y + front.height + 10, 'underlying physical card protrudes below the top card');
      await page.screenshot({path: `${output}/${width}-${order}-battlefield.png`});
      await page.mouse.click(peek.x + peek.width / 2, peek.y + peek.height - 5);
      const sheet = page.locator('.mutate-sheet');
      await sheet.waitFor();
      assert.equal(await sheet.locator('.mutate-layer').count(), 2);
      const sheetNames = await sheet.locator('.mutate-component summary strong').allTextContents();
      assert.deepEqual(sheetNames, expected);
      await sheet.locator('.mutate-component summary').last().click();
      assert.equal(await sheet.locator('.mutate-component[open] .mutate-component-body').isVisible(), true);
      await page.waitForFunction(() => _ui.sheet?.mutateExpanded?.length === 1);
      await page.evaluate(() => _ui.render());
      assert.equal(await sheet.locator('.mutate-component[open]').count(), 1, 'reading a component survives a board refresh');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await sheet.evaluate(node => {node.scrollTop = 0;});
      await page.screenshot({path: `${output}/${width}-${order}-details.png`});
      await sheet.getByRole('button', {name: 'Close', exact: true}).click();
      results.push({width, height, order, ...state});
      console.log(`PASS ${width}×${height}: ${order}, legal target, paid cast, visual pile and card details`);
    }
  }
  await page.setViewportSize({width: 390, height: 844});
  const ids = await install();
  await chooseHost(ids.host);
  await page.locator('.mutate-order-choice[data-choice-key="under"]').click();
  await page.waitForFunction(() => __mutateAudit.done || __mutateAudit.error);
  assert.equal(await page.evaluate(() => __mutateAudit.error), null);
  await page.evaluate(() => {
    const source = new MTG.CardInst(MTG.DEFS['Glowstone Recluse'], _ui.me);
    source.zone = 'hand'; _ui.me.hand.push(source); _ui.me.pool.G = 10;
    void __mutateAudit.cast(source).catch(error => {__mutateAudit.error = error.stack;});
  });
  await chooseHost(ids.host);
  assert.equal(await page.locator('.mutate-order-choice[data-choice-key="over"] .mutate-layer').count(), 3);
  await page.screenshot({path: `${output}/390-three-cards-choice.png`});
  await page.locator('.mutate-order-choice[data-choice-key="over"]').click();
  await page.waitForFunction(() => __mutateAudit.done || __mutateAudit.error || _ui.pending?.q.type === 'orderTriggers');
  if (await page.evaluate(() => _ui.pending?.q.type === 'orderTriggers')) {
    await page.getByRole('button', {name: 'Confirm order', exact: true}).click();
  }
  await page.waitForFunction(() => __mutateAudit.done || __mutateAudit.error);
  assert.equal(await page.evaluate(() => __mutateAudit.error), null);
  assert.deepEqual(await page.evaluate(() => MTG.Mutate.present(__mutateAudit.host, _ui.me).map(row => row.name)),
    ['Glowstone Recluse', 'Solemn Simulacrum', 'Pouncing Shoreshark']);
  const pile = page.locator(`.mini.mutated[data-iid="${ids.host}"]`).first();
  assert.equal(await pile.locator('.mutate-underlay').count(), 2);
  await pile.click();
  assert.equal(await page.locator('.mutate-sheet .mutate-layer').count(), 3);
  await page.screenshot({path: `${output}/390-three-cards-details.png`});
  results.push({width: 390, cards: 3, order: 'under, then over'});
  console.log('PASS three physical cards retain order through repeated mutation');
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({path: `${output}/failure.png`}).catch(() => {});
  console.error(await page.evaluate(() => ({pending: _ui?.pending?.q.type, prompt: _ui?.pending?.q.prompt, error: window.__mutateAudit?.error})).catch(() => null));
  throw error;
} finally {
  writeFileSync(`${output}/results.json`, JSON.stringify({results, errors}, null, 2));
  await browser.close(); server.close();
}
