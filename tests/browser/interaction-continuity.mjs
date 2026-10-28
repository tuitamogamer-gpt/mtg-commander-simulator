// Keep real pointer gestures and form input intact across incidental renders.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.CONTINUITY_OUTPUT || `${root}output/interaction-continuity`;
mkdirSync(output, {recursive: true});
const server = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'no-preference', hasTouch: true});
page.setDefaultTimeout(15000);
const receipt = {errors: [], checks: []};
page.on('pageerror', error => receipt.errors.push(error.message));
const check = (name, pass, detail) => {receipt.checks.push({name, pass, detail}); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);};
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '0');
});

async function fixture(type) {
  await page.evaluate(type => {
    document.querySelector('#game').replaceWith(document.querySelector('#game').cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.body.classList.add('game-active');
    const g = new MTG.Game({seed: 281026, paced: false}), ui = new MTG.UI();
    const me = g.addPlayer('You', {name: 'Quick Draw'}, null, false);
    const rival = g.addPlayer('AI Raven', {name: 'Elven Council'}, {decide: async () => ({kind: 'pass'})}, true);
    ui.game = g; ui.me = me; ui.prioMode = 'full'; ui.commandTableView = 'table';
    me.controller = ui.controllerFor(me);
    g.turnPlayer = me; g.turnNo = 5; g.phase = 'main1'; g.step = 'main';
    window._game = g; window._ui = ui; window.__answers = [];
    const put = (name, owner = me, zone = 'battlefield') => {
      const c = new MTG.CardInst(MTG.DEFS[name], owner); c.zone = zone; c.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone] || []).push(c); return c;
    };
    me.commanders = [put('Stella Lee, Wild Card', me, 'command')];
    rival.commanders = [put('Galadriel, Elven-Queen', rival, 'command')];
    for (const p of [me, rival]) {
      put('Humble Defector', p);
      for (const land of ['Island', 'Forest', 'Mountain']) put(land, p);
    }
    put('Counterspell', me, 'hand');
    g.recalc();
    let q = {type: 'main', player: me, casts: [], acts: [], lands: []};
    if (type === 'choice') q = {type: 'chooseOption', prompt: 'Choose a creature type', options: [
      {key: 'elf', label: 'Elf'}, {key: 'wizard', label: 'Wizard'}]};
    if (type === 'number') q = {type: 'chooseX', prompt: 'Choose X', min: 0, max: 12};
    if (type === 'review') {
      const c = put('Beast Within', rival, 'stack');
      g.stack.push({kind: 'spell', name: c.name, card: c, ctrl: rival, targets: [[g.creatures(me)[0]]]});
      q = {type: 'priority', player: me, casts: [], acts: []};
    }
    if (type === 'reveal') q = {type: 'cardReveal', kind: 'reveal', ctrl: rival,
      cards: [put('Forest', rival, 'library')]};
    window.__question = q;
    void me.controller.decide(g, q).then(answer => window.__answers.push(answer));
    ui.render();
  }, type);
  await page.waitForFunction(() => document.getAnimations().every(animation =>
    animation.effect?.getTiming().iterations === Infinity || ['finished', 'idle'].includes(animation.playState)));
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
    for (const [type, selector] of [
      ['main', '.promptbar .pbtn.primary'], ['choice', '[data-choice-key="elf"]'],
      ['review', '.actionstagebuttons .pbtn.primary'], ['reveal', '.reveal .pbtn.primary'],
    ]) {
      await fixture(type);
      const control = page.locator(selector).filter({visible: true}).first();
      await control.focus();
      await control.evaluate(node => {window.__heldControl = node;});
      const rect = await control.boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      const stable = await page.evaluate(async () => {
        _game.lg('The table status was refreshed.', 'effect');
        _ui.queueRender();
        await new Promise(resolve => requestAnimationFrame(resolve));
        return {connected: __heldControl.isConnected, focused: document.activeElement === __heldControl};
      });
      await page.mouse.up();
      const answers = await page.evaluate(() => __answers.length);
      check(`${width}px ${type}: pointer-down survives a queued render and answers once`,
        stable.connected && stable.focused && answers === 1, {...stable, answers});
      if (width === 390) {
        await fixture(type);
        const touchControl = page.locator(selector).filter({visible: true}).first();
        await touchControl.evaluate(node => node.addEventListener('pointerdown', () => _ui.render(), {once: true}));
        await touchControl.tap();
        check(`${width}px ${type}: touch gesture survives an immediate render`,
          await page.evaluate(() => __answers.length === 1));
      }
    }

    await fixture('number');
    const input = page.locator('.xinput');
    await input.fill('7');
    await input.evaluate(node => {window.__numberInput = node;});
    const number = await page.evaluate(() => {
      _ui.render(); _ui.render();
      return {connected: __numberInput.isConnected, focused: document.activeElement === __numberInput,
        value: document.querySelector('.xinput').value};
    });
    await page.locator('.modal .pbtn.primary').click();
    check(`${width}px number input keeps focus, draft and confirmation`, number.connected && number.focused &&
      number.value === '7' && await page.evaluate(() => __answers[0] === 7), number);

    await fixture('choice');
    const stale = await page.evaluate(() => {
      window.__oldChoice = document.querySelector('[data-choice-key="elf"]');
      const old = _ui.pending;
      _ui.pendings = [];
      void _ui.me.controller.decide(_game, {...__question}).then(answer => __answers.push(answer));
      __oldChoice.click();
      return {replaced: !__oldChoice.isConnected, pending: _ui.pending !== old};
    });
    check(`${width}px identical next question replaces old callbacks`, stale.replaced && stale.pending &&
      await page.evaluate(() => __answers.length === 0), stale);
    await page.locator('[data-choice-key="wizard"]').click();
    check(`${width}px new question still answers normally`, await page.evaluate(() => __answers[0] === 'wizard'));

    await fixture('main');
    const count = await page.evaluate(async () => {
      const original = _ui.renderArena;
      let calls = 0;
      _ui.renderArena = function () {calls++; return original.call(this);};
      _ui.queueRender(); _ui.queueRender(); _ui.render();
      await new Promise(resolve => requestAnimationFrame(resolve));
      _ui.renderArena = original;
      return calls;
    });
    check(`${width}px immediate feedback consumes the already queued render`, count === 1, {renders: count});
    await page.screenshot({path: `${output}/table-${width}.png`});
  }
  assert.deepEqual(receipt.errors, []);
  if (!process.env.CONTINUITY_BASELINE) assert.deepEqual(receipt.checks.filter(item => !item.pass), []);
} finally {
  writeFileSync(`${output}/results.json`, JSON.stringify(receipt, null, 2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
