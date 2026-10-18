// Native layout and keyboard regressions for decision and inspection surfaces.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node tests/browser/decision-experience.mjs
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.env.GAME_QA_OUTPUT || `${root}output/playwright/decision-experience`;
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
});
const page = await context.newPage(), checks = [], errors = [];
page.setDefaultTimeout(15000);
page.on('pageerror', error => errors.push(error.message));
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const shot = async name => page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' });

async function fixture() {
  await page.evaluate(() => {
    document.querySelector('#setup').style.display = 'none';
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#game').style.display = 'flex'; document.body.classList.add('game-active');
    const ui = window._ui = new MTG.UI(), g = window._game = new MTG.Game({ seed: 447, paced: false, onEvent: () => {} });
    const me = g.addPlayer('You', { name: 'Mardu Surge' }, null, false), rival = g.addPlayer('AI Raven', { name: 'Primal Power' }, null, true);
    ui.game = g; ui.me = me; me.controller = ui.controllerFor(me);
    g.turnPlayer = me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
    const put = (name, owner, zone) => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner); card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(card); return card;
    };
    for (const [player, name] of [[me, 'Zurgo Stormrender'], [rival, 'Etali, Primal Storm']]) {
      player.commander = put(name, player, 'command'); player.commander.commander = true;
      put('Plains', player, 'battlefield'); put('Sol Ring', player, 'battlefield');
    }
    ['Swords to Plowshares', 'Arcane Signet', 'Plains', 'Aetherize', 'Command Tower', 'Lightning Bolt', 'Sol Ring'].forEach(name => put(name, me, 'hand'));
    ['Sol Ring', 'Colossal Dreadmaw', 'Mountain', 'Aetherize', 'Command Tower'].forEach(name => put(name, me, 'graveyard'));
    window.question = q => {
      ui.clearInspectionViews(); ui.pendings = []; window.answers = 0; window.answer = undefined;
      me.controller.decide(g, { player: me, ...q }).then(value => { window.answers++; window.answer = value; });
      window.heldDecision = ui.pending;
    };
    g.recalc(); ui.render();
  });
}

async function expectPending(value) {
  assert.deepEqual(await page.evaluate(() => ({ same: _ui.pending === heldDecision, value: _ui.pending?.xVal, answers })),
    { same: true, value, answers: 0 });
}

async function expectOneModal() {
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    .filter(node => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]')).length), 1);
}

async function mergedInspection() {
  await page.evaluate(async () => {
    const ui = _ui, g = _game, me = ui.me, controller = me.controller;
    ui.clearInspectionViews(); ui.pendings = [];
    const host = new MTG.CardInst(MTG.DEFS['Grizzly Bears'], me), incoming = new MTG.CardInst(MTG.DEFS['Glowstone Recluse'], me);
    host.zone = 'battlefield'; host.sick = false; g.battlefield.push(host);
    incoming.zone = 'hand'; me.hand.push(incoming); me.pool.G = 4; me.pool.C = 10; g.recalc();
    me.controller = { decide: async (_game, q) => {
      if (q.type === 'chooseTargets') return [host];
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'mutateOrder') return 'over';
      if (q.type === 'orderTriggers') return q.triggers;
      if (q.type === 'chooseManaSources') return { cards: q.suggested };
      if (q.type === 'priority') return { kind: 'pass' };
      if (q.type === 'effectReview' || q.type === 'cardReveal') return null;
      throw Error(`Unexpected mutate fixture question: ${q.type}`);
    } };
    try {
      const cast = await g.castSpell(me, incoming, { alt: incoming.def.altCosts.find(option => option.mutate) });
      if (!cast) throw Error('Paid mutation failed');
      for (let n = 0; n < 20 && (g.stack.length || g.pendingTriggers.length); n++) {
        await g.flushTriggers(); if (g.stack.length) await g.resolveTop();
      }
      if (incoming.zone !== 'merged' || host.mutateState?.components.length !== 2 || !incoming.castMeta.manaSpent) throw Error('Real merged permanent was not created');
    } finally { me.controller = controller; }
    question({ type: 'chooseX', min: 0, max: 40, suggested: 3 });
    ui.sheet = { card: host }; ui.render();
  });
}

async function checkRows(selector, name, width) {
  await page.waitForSelector(`${selector} .bigcard`);
  await page.locator(`${selector} img`).evaluateAll(async nodes => {
    await Promise.race([Promise.all(nodes.map(image => image.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 2000))]);
  });
  const layout = await page.locator(selector).evaluate(grid => {
    const cards = [...grid.querySelectorAll('.bigcard')].map(node => {
      const rect = node.getBoundingClientRect(); return { name: node.dataset.cardName, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
    });
    const overlaps = [];
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j];
      if (Math.min(a.right, b.right) > Math.max(a.x, b.x) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y) + 1) overlaps.push([a.name, b.name]);
    }
    return { overlaps, count: cards.length, rows: new Set(cards.map(card => Math.round(card.y))).size, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.equal(layout.count, name === 'zone' ? 5 : 7);
  assert.deepEqual(layout.overlaps, [], `${width}px ${name} cards must not overlap`);
  assert.equal(layout.overflow, false);
  if (width >= 1024 && name === 'card-choice') assert.equal(layout.rows, 1, 'Seven desktop choices fit in one row');
  await shot(`${name}-${width}-top`);
  await page.locator(`${selector} .bigcard`).last().focus();
  assert.equal(await page.locator(selector).evaluate(grid => {
    grid.scrollTop = grid.scrollHeight;
    const card = grid.querySelector('.bigcard:last-child').getBoundingClientRect(), rect = grid.getBoundingClientRect();
    return card.bottom <= rect.bottom + 1 && card.bottom > rect.top;
  }), true, `${width}px ${name}: final card remains reachable by scrolling`);
  await shot(`${name}-${width}-bottom`);
  check(`${name}: all cards retain their height in a scrollable grid at ${width}px`);
}

try {
  await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:not([hidden])', { timeout: 60000 });
  for (const [width, height] of [[1440, 1000], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height }); await fixture();
    await page.evaluate(() => { _ui.zoneBrowse = { player: _ui.me, zone: 'graveyard' }; _ui.render(); });
    await checkRows('.zonebrowsergrid', 'zone', width);
    await page.evaluate(() => question({ type: 'chooseCards', min: 1, max: 2, from: _ui.me.hand, prompt: 'Choose up to two cards to discard' }));
    assert.equal(await page.locator('.selectionfooter .pbtn.primary').isDisabled(), true);
    await page.locator('.cardselectionmodal .bigcard').nth(1).focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('.selectionfooter .pbtn.primary').isDisabled(), false);
    assert.equal(await page.locator('.bigcard[aria-pressed="true"]').count(), 1);
    await checkRows('.cardselectionmodal .cardgrid', 'card-choice', width);
    await page.evaluate(() => question({ type: 'scry', cards: _ui.me.hand }));
    await checkRows('.scrydecision .cardgrid', 'scry', width);

    await page.evaluate(() => {
      question({ type: 'chooseX', min: 0, max: 40, suggested: 3 });
      _ui.sheet = { card: _game.players[1].commander }; _ui.render();
    });
    const inspection = await page.locator('.cardinspection').evaluate(panel => {
      const rect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, bottom: r.bottom }; };
      return { panel: rect(panel), identity: rect(panel.querySelector('.cardinspectionidentity')), art: rect(panel.querySelector('.sheetimg')), footer: rect(panel.querySelector('.cardinspectionactions')) };
    });
    if (width <= 620) {
      assert.ok(inspection.identity.width >= inspection.panel.width - 40, 'Mobile card heading uses the sheet width');
      assert.ok(inspection.identity.bottom <= inspection.art.y + 1, 'Mobile card identity precedes art and rules');
    }
    assert.ok(inspection.footer.bottom <= height + 1, 'Inspection actions remain visible');
    await shot(`inspection-${width}`);
    await page.locator('.cardinspectionzoom').click(); await expectPending(3); await shot(`inspection-expanded-${width}`);
    await page.locator('.cardinspectionzoom').click(); await expectPending(3);
    await page.locator('.cardinspectionclose').focus(); await page.keyboard.press('ArrowRight');
    await expectPending(3); await expectOneModal();
    await page.keyboard.press('?'); await page.locator('.helpguide').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.cardinspection').count(), 0);
    await expectPending(3); await expectOneModal();
    await page.getByRole('button', { name: 'Close help', exact: true }).focus();
    await page.keyboard.press('ArrowRight'); await expectPending(3);
    await page.keyboard.press('Escape'); await page.locator('.xinput').waitFor({ state: 'visible' });
    await expectPending(3); await expectOneModal();

    await page.evaluate(() => { _ui.quickMenuOpen = true; _ui.render(); });
    await page.locator('.settingsdone').focus(); await page.keyboard.press('ArrowLeft'); await expectPending(3);
    await page.keyboard.press('?'); await page.locator('.helpguide').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.experiencesettings').count(), 0);
    await expectPending(3); await expectOneModal(); await shot(`help-over-pending-x-${width}`);
    await page.keyboard.press('Escape'); await page.locator('[data-decision-type="chooseX"]').evaluate(node => node.focus());
    await page.keyboard.press('ArrowRight'); await expectPending(4);
    await page.locator('[data-decision-type="chooseX"] .pbtn.primary').click();
    await page.waitForFunction(() => window.answers === 1); assert.equal(await page.evaluate(() => window.answer), 4);
    check(`inspection/help/menu own keyboard input and preserve the exact X decision at ${width}px`);
    await page.evaluate(() => {
      _game.log = [
        { t: 7, msg: 'You play Command Tower.' }, { t: 7, msg: 'You cast Arcane Signet.' },
        { t: 7, msg: 'Arcane Signet resolves.' }, { t: 7, msg: 'AI Raven attacks you with Etali, Primal Storm.' },
        { t: 7, msg: 'Etali, Primal Storm triggers: exile the top card of each player’s library.' },
        { t: 8, msg: 'Your turn. Untap your permanents.' }, { t: 8, msg: 'You draw a card.' },
        { t: 8, msg: 'You cast Swords to Plowshares targeting Etali, Primal Storm.' },
        { t: 8, msg: 'Etali, Primal Storm is exiled. AI Raven gains 6 life.' },
      ];
      _ui.showLog = true; _ui.render();
    });
    const log = await page.locator('.activitylog').boundingBox();
    assert.ok(log.x >= 0 && log.y >= 0 && log.x + log.width <= width && log.y + log.height <= height);
    if (width >= 1024) assert.ok(log.height <= 760 && log.width <= 800, 'Desktop log has a restrained reading surface');
    await shot(`log-${width}`); await page.locator('.logsearch').fill('Etali');
    assert.equal(await page.locator('.activitylog .logline').count(), 4); await expectOneModal();
    check(`log stays readable, bounded, and searchable at ${width}px`);

    await mergedInspection();
    assert.equal(await page.locator('.cardinspectiondetails .mutate-components').count(), 1);
    const merged = await page.locator('.cardinspection').evaluate(panel => {
      const details = panel.querySelector('.cardinspectiondetails').getBoundingClientRect(), footer = panel.querySelector('.cardinspectionactions').getBoundingClientRect();
      return { detailsHeight: details.height, footerHeight: footer.height, footerBottom: footer.bottom, overflow: panel.scrollWidth > panel.clientWidth + 1 };
    });
    assert.ok(merged.detailsHeight >= 80 && merged.footerHeight >= 44 && merged.footerBottom <= height && !merged.overflow, 'Merged rules and actions remain usable');
    await page.locator('.mutate-component summary').first().click();
    await page.locator('.mutate-component summary').last().click();
    await page.waitForFunction(() => _ui.sheet.mutateExpanded?.length === 2);
    const scrollSelector = width <= 620 ? '.cardinspectiondetails' : '.cardinspection > .sheetinfo';
    const scrollTop = await page.locator(scrollSelector).evaluate(node => { node.scrollTop = 80; return node.scrollTop; });
    assert.ok(scrollTop > 0, 'Merged details have scrollable content');
    await page.evaluate(() => _ui.render());
    assert.equal(await page.locator(scrollSelector).evaluate(node => node.scrollTop), scrollTop, 'Reading position survives an incidental render');
    await expectPending(3); await expectOneModal(); await shot(`mutate-inspection-${width}`);
    await page.locator('.cardinspectionzoom').click(); await expectPending(3); await shot(`mutate-expanded-${width}`);
    const expandedFooter = await page.locator('.cardinspectionactions').boundingBox();
    assert.ok(expandedFooter.height >= 44 && expandedFooter.y + expandedFooter.height <= height + 1, 'Expanded merged card keeps its actions visible');
    const expandedHeader = await page.locator('.cardinspectionhead').boundingBox(), expandedArt = await page.locator('.mutate-sheet-visual').boundingBox();
    assert.ok(expandedHeader.y + expandedHeader.height <= expandedArt.y + 1, 'Expanded merged card keeps its toolbar above the artwork');
    check(`paid merged permanent keeps its details, reading position, actions, and pending choice at ${width}px`);
  }
  assert.deepEqual(errors, []);
} finally {
  writeFileSync(`${out}/report.json`, JSON.stringify({ base, checks, errors }, null, 2));
  await browser.close(); if (server) server.close();
}
