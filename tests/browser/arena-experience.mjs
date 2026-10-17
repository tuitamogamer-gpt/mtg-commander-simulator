// Native browser acceptance for presentation settings and concealed-card art.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node tests/browser/arena-experience.mjs
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.env.GAME_QA_OUTPUT || `${root}output/playwright/arena-experience`;
mkdirSync(out, { recursive: true });
const app = express();
app.get('/api/account', (_req, res) => res.json({ user: null, profile: null, save: null }));
app.use(express.static(root));
const server = process.env.GAME_URL ? null : app.listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
await context.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1');
  if (!localStorage.getItem('mtgOppS')) localStorage.setItem('mtgOppS', '1.1');
  if (!localStorage.getItem('mtgOppH')) localStorage.setItem('mtgOppH', '45');
});
const page = await context.newPage(), errors = [], checks = [];
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const shot = async name => { await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' }); };
async function fixture() {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:not([hidden])', { timeout: 60000 });
  await page.evaluate(() => {
    document.querySelector('#setup').style.display = 'none'; document.querySelector('#game').style.display = 'flex'; document.body.classList.add('game-active');
    const ui = window._ui = new MTG.UI(), g = window._game = new MTG.Game({ seed: 427, paced: false, onEvent: () => {} });
    const me = g.addPlayer('You', { name: 'Mardu Surge' }, null, false), opponent = g.addPlayer('AI Raven', { name: 'Primal Power' }, null, true);
    ui.game = g; ui.me = me; g.turnPlayer = me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
    const put = (name, player, zone) => { const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone; card.sick = false; (zone === 'battlefield' ? g.battlefield : player[zone]).push(card); return card; };
    for (const [player, name] of [[me, 'Zurgo Stormrender'], [opponent, 'Etali, Primal Storm']]) {
      player.commander = put(name, player, 'command'); player.commander.commander = true;
      for (let i = 0; i < 6; i++) put('Plains', player, 'library');
      put('Sol Ring', player, 'battlefield'); put('Grizzly Bears', player, 'battlefield'); put('Plains', player, 'battlefield');
    }
    ['Swords to Plowshares', 'Aetherize', 'Skullclamp'].forEach(name => put(name, me, 'hand'));
    g.recalc(); g.lg('Your turn. Draw a card.');
    window.answers = 0;
    window.heldDecision = { q: { type: 'chooseOption', player: me, prompt: 'Keep this decision pending while adjusting your table.', options: [{ key: 'yes', label: 'Continue' }, { key: 'no', label: 'Decline' }] }, resolve: () => { window.answers++; }, sel: [], assigns: new Map(), mode: null };
    ui.pendings = [window.heldDecision]; ui.quickMenuOpen = true; ui.render();
    window.originalHand = me.hand.map(card => card.iid);
    window.originalLibrary = me.library.map(card => card.iid);
  });
}
async function tab(name) { await page.locator(`[data-settings-tab="${name}"]`).click(); }
async function expectPending() {
  assert.deepEqual(await page.evaluate(() => ({ same: _ui.pending === heldDecision, answers, hand: _ui.me.hand.map(card => card.iid), originalHand, library: _ui.me.library.map(card => card.iid), originalLibrary })),
    await page.evaluate(() => ({ same: true, answers: 0, hand: originalHand, originalHand, library: originalLibrary, originalLibrary })));
}
try {
  await fixture();
  assert.equal(await page.locator('.experiencesettings').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('.experiencesettings').getAttribute('aria-modal'), 'true');
  await tab('appearance');
  await page.locator('[data-setting="hand-size"]').selectOption('large');
  await page.locator('[data-setting="contrast"]').click();
  assert.equal(await page.evaluate(() => _ui.handSize), 'large');
  assert.equal(await page.evaluate(() => MTG.playerPreferences().contrast), true);
  assert.equal(await page.locator('[data-setting="contrast"]').getAttribute('aria-checked'), 'true');
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.setting), 'contrast');
  await page.locator('[data-setting="contrast"]').click();
  await tab('controls');
  await page.locator('[data-setting="speed"]').selectOption('slow');
  await page.locator('[data-setting="drag"]').click();
  assert.equal(await page.evaluate(() => _ui.speed), 'slow');
  assert.equal(await page.evaluate(() => MTG.playerPreferences().speed), 'slow');
  assert.equal(await page.locator('[data-setting="drag"]').getAttribute('aria-checked'), 'true');
  await page.locator('.settingsadvanced summary').click();
  assert.equal(await page.locator('[data-setting="opponent-size"]').inputValue(), '1.1');
  assert.match(await page.locator('[data-setting="opponent-size"] option:checked').innerText(), /110%/);
  assert.equal(await page.locator('[data-setting="opponent-height"]').inputValue(), '45');
  assert.match(await page.locator('[data-setting="opponent-height"] option:checked').innerText(), /45%/);
  await page.locator('[data-setting="opponent-height"]').selectOption('42');
  await page.locator('[data-setting="opponent-size"]').selectOption('1.2');
  assert.equal(await page.locator('.settingsadvanced').evaluate(node => node.open), true);
  await page.locator('[data-setting="opponent-size"]').selectOption('1');
  await page.locator('.settingstab[aria-selected="true"]').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.settingstab[aria-selected="true"]').getAttribute('data-settings-tab'), 'help');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.settingsTab), 'help');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('.settingstab[aria-selected="true"]').getAttribute('data-settings-tab'), 'table');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.settingsTab), 'table');
  await expectPending();
  check('direct settings persist, preserve pending decision and card order, and keep keyboard focus');

  await tab('appearance'); await page.locator('.cardbacksopen').click();
  assert.equal(await page.locator('.cardbackchoice').count(), 3);
  await page.waitForFunction(() => [...document.querySelectorAll('.cardbackpreview')].every(image => image.complete && image.naturalWidth === 600));
  for (const id of ['astral', 'ember', 'obsidian']) {
    await page.locator(`[data-card-back="${id}"]`).click();
    assert.equal(await page.locator('.cardbackchoice[aria-pressed="true"]').count(), 1);
    assert.equal(await page.evaluate(() => MTG.playerPreferences().cardBack), id);
    const hidden = await page.evaluate(() => MTG.cardArtHTML({ name: 'PRIVATE SENTINEL', faceDown: true, def: { name: 'PRIVATE SENTINEL' } }));
    assert.match(hidden, new RegExp(`assets/cardbacks/${id}\\.webp`));
    assert.doesNotMatch(hidden, /PRIVATE SENTINEL/);
    assert.match(hidden, /alt="Face-down card"/);
  }
  await page.locator('.cardbackdone').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close card backs');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('cardbackdone')), true);
  await expectPending();
  check('all generated backs load, selected art is private-safe, and picker contains keyboard focus');

  for (const [width, height] of [[1440, 1000], [390, 844], [360, 800], [320, 740], [820, 1180], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { _ui.quickMenuOpen = 'cardbacks'; _ui.render(); });
    await page.locator('.cardbackpicker').waitFor({ state: 'visible' });
    const box = await page.locator('.cardbackpicker').boundingBox(), done = await page.locator('.cardbackdone').boundingBox();
    assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `Card backs fit ${width}: ${JSON.stringify(box)}`);
    await shot(`cardbacks-${width}`);
    assert.ok(done.height >= 44 && done.y + done.height <= height + 1, `Cardback action fits ${width}: ${JSON.stringify(done)}`);
    await page.locator('.cardbackback').click();
    for (const name of ['appearance', 'controls', 'help', 'table']) {
      await tab(name);
      const rect = await page.locator('.experiencesettings').boundingBox();
      assert.ok(rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, `${name} menu fits ${width}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.equal(await page.locator('.settingstab .gameicon').first().evaluate(node => node.getBoundingClientRect().height <= 30 * (Number(getComputedStyle(document.body).zoom) || 1)), true, 'Settings icons stay inside their controls');
      if ([1440, 390, 360].includes(width)) await shot(`settings-${name}-${width}`);
    }
    await page.locator('.settingsdone').click();
    assert.equal(await page.evaluate(() => _ui.pending === heldDecision && answers === 0), true);
    assert.equal(await page.locator('.modal').getAttribute('role'), 'dialog');
    if (width === 390) await shot('decision-after-settings-390');
    await page.evaluate(() => { _ui.quickMenuOpen = true; _ui.render(); });
  }
  check('all settings sections and sticky actions fit 320–1920px without horizontal overflow');
  await tab('appearance'); await page.locator('.cardbacksopen').click(); await page.locator('[data-card-back="astral"]').click();
  await page.keyboard.press('Escape');
  await expectPending();
  await fixture();
  assert.equal(await page.evaluate(() => MTG.cardBackURL()), './assets/cardbacks/astral.webp');
  assert.equal(await page.evaluate(() => _ui.handSize), 'large');
  assert.equal(await page.evaluate(() => _ui.speed), 'slow');
  check('card back and control preferences survive a full reload');
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ base, checks, errors }, null, 2));
  await browser.close(); if (server) server.close();
}
