// Live combat on the table: a real damage step at Normal speed. Each attacker
// charges its blocker or the defending player and lands as the damage is
// dealt; nothing covers or locks the table, and no replay window opens.
// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package; GAME_URL may select an existing preview.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.LIVE_COMBAT_OUTPUT || `${root}output/web-game/live-combat`;
mkdirSync(output, {recursive: true});
const server = process.env.GAME_URL ? null : express().use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const errors = [];

async function open(width) {
  const phone = width <= 600;
  const page = await browser.newPage(phone ? {viewport: {width, height: 844}, hasTouch: true, isMobile: true} : {viewport: {width, height: 900}});
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
  await page.mouse.move(2, 2);
  return page;
}

// An opponent attacks: Shivan Dragon into a Serra Angel, Grizzly Bears unblocked.
// Samples every frame until well after the step. Returns timings and checks.
function fight(page) {
  return page.evaluate(async () => {
    const game = _game, ui = _ui, human = ui.me, enemy = game.players.find(player => player !== human);
    game.battlefield = game.battlefield.filter(card => card.is('Land')); game.stack = []; game.pendingTriggers = [];
    game.turnNo++; game.turnPlayer = enemy; game.phase = 'combat'; game.step = 'damage';
    for (const player of game.players) player.life = 40;
    const put = (name, owner) => { const card = new MTG.CardInst(MTG.DEFS[name], owner); card.zone = 'battlefield'; card.sick = false; game.battlefield.push(card); return card; };
    const guard = put('Serra Angel', human), dragon = put('Shivan Dragon', enemy), bears = put('Grizzly Bears', enemy);
    dragon.attacking = human; dragon.blockedBy = [guard]; dragon.wasBlocked = true; guard.blocking = dragon.iid;
    bears.attacking = human; bears.blockedBy = []; bears.wasBlocked = false;
    game.combat = {attackers: [dragon, bears]}; game.recalc();
    game.speedFactor = (MTG.SPEEDS.normal || [])[1] || 1.5625; game.paced = true;
    ui.pendings = []; ui.mobileView = 'mine'; ui.render();
    await new Promise(resolve => setTimeout(resolve, 300));
    const visible = selector => [...document.querySelectorAll(selector)].find(node => {
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !node.closest('[hidden], [inert]') && r.bottom > 0 && r.top < innerHeight;
    });
    const centre = node => { const r = node.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; };
    const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const t0 = performance.now(), marks = {}, near = {dragon: Infinity, bears: Infinity};
    let running = true, inert = false, replay = false;
    const tick = () => {
      const t = performance.now() - t0;
      const dragonCopy = document.querySelector(`.actionfx-charge[data-iid="${dragon.iid}"]`);
      const bearsCopy = document.querySelector(`.actionfx-charge[data-iid="${bears.iid}"]`);
      if (dragonCopy && bearsCopy && marks.charge == null) marks.charge = t;
      if (marks.charge != null && !dragonCopy && marks.chargeEnd == null) marks.chargeEnd = t;
      if (document.querySelector('#game .fx-charging')) marks.faded = t;
      const guardFace = visible(`.ct-mobile-combat-card[data-iid="${guard.iid}"] .ct-mobile-combat-art, .mini[data-iid="${guard.iid}"]`);
      const life = visible('.ct-mobile-combat-life') || visible('.ct-player-head .melife');
      if (dragonCopy && guardFace) {
        const d = gap(centre(dragonCopy), centre(guardFace));
        if (d < near.dragon) { near.dragon = d; marks.dragonContact = t; }
      }
      if (bearsCopy && life) {
        const d = gap(centre(bearsCopy), centre(life));
        if (d < near.bears) { near.bears = d; marks.bearsContact = t; }
      }
      if (marks.damage == null && human.life < 40) marks.damage = t;
      if (marks.died == null && guard.zone !== 'battlefield') marks.died = t;
      if (ui.mobileView === 'combat' && marks.combatView == null) marks.combatView = t;
      inert ||= !!document.querySelector('#game')?.inert;
      replay ||= !!document.querySelector('.combat-replay-overlay');
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await game.combatDamage(enemy, 'normal');
    marks.done = performance.now() - t0;
    // Combat ends; a phone goes back to the view it came from.
    game.phase = 'main2'; game.step = '';
    await new Promise(resolve => setTimeout(resolve, 2600));
    running = false;
    const round = value => Number.isFinite(value) ? Math.round(value) : value;
    return {marks: Object.fromEntries(Object.entries(marks).map(([key, value]) => [key, round(value)])),
      near: {dragon: round(near.dragon), bears: round(near.bears)}, inert, replay,
      life: human.life, guard: guard.zone, view: ui.mobileView,
      after: {copies: document.querySelectorAll('.actionfx-charge').length, faded: document.querySelectorAll('#game .fx-charging').length},
      replayAvailable: ui.hasCombatReplay()};
  });
}

// An opponent attacks another opponent: the charge and the damage number go to
// that player, whose seat a phone's Combat view stands in for with "→ name".
function sideFight(page) {
  return page.evaluate(async () => {
    const game = _game, ui = _ui, human = ui.me, enemy = game.players.find(player => player !== human);
    const other = game.players.find(player => player !== human && player !== enemy);
    game.battlefield = game.battlefield.filter(card => card.is('Land')); game.stack = []; game.pendingTriggers = [];
    game.turnNo++; game.turnPlayer = enemy; game.phase = 'combat'; game.step = 'damage';
    other.life = 40;
    const bears = new MTG.CardInst(MTG.DEFS['Grizzly Bears'], enemy); bears.zone = 'battlefield'; bears.sick = false; game.battlefield.push(bears);
    bears.attacking = other; bears.blockedBy = []; bears.wasBlocked = false;
    game.combat = {attackers: [bears]}; game.recalc();
    game.speedFactor = (MTG.SPEEDS.normal || [])[1] || 1.5625; game.paced = true;
    ui.pendings = []; ui.mobileView = 'mine'; ui.combatAnimationEnabled = true; ui.reducedMotion = false;
    document.body.classList.remove('reduced-motion'); ui.render();
    await new Promise(resolve => setTimeout(resolve, 300));
    let near = Infinity, impact = null, running = true;
    const centre = node => { const r = node.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; };
    const anchor = () => [...document.querySelectorAll(`.opprow[data-player-id="${other.idx}"] .opplife, .ct-mobile-combat-assignment[data-defender-player="${other.idx}"]`)]
      .find(node => node.getBoundingClientRect().width > 0);
    const tick = () => {
      const copy = document.querySelector(`.actionfx-charge[data-iid="${bears.iid}"]`), target = anchor();
      if (copy && target) { const a = centre(copy), b = centre(target); near = Math.min(near, Math.hypot(a.x - b.x, a.y - b.y)); }
      const hit = document.querySelector('.gamefx-impact.player');
      if (hit && !impact && target) { const a = centre(hit), b = centre(target); impact = Math.round(Math.hypot(a.x - b.x, a.y - b.y)); }
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await game.combatDamage(enemy, 'normal');
    await new Promise(resolve => setTimeout(resolve, 400));
    running = false;
    return {near: Math.round(near), impact, life: other.life, charge: MTG.lastCombatCharge};
  });
}

try {
  for (const width of [1440, 390]) {
    const page = await open(width);
    const result = await fight(page);
    const {marks, near} = result;
    const label = `${width}px`;
    assert.ok(marks.charge != null && marks.charge < marks.damage, `${label}: both attackers charge before the damage: ${JSON.stringify(result)}`);
    assert.ok(marks.faded != null, `${label}: the real attackers fade while their copies charge`);
    assert.ok(near.dragon < 70, `${label}: Shivan Dragon reaches its blocker: ${JSON.stringify(result)}`);
    assert.ok(near.bears < 90, `${label}: Grizzly Bears reach the defending player's life total: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(marks.dragonContact - marks.damage) < 450, `${label}: the hit lands with the damage: ${JSON.stringify(marks)}`);
    assert.ok(marks.chargeEnd != null && marks.chargeEnd <= marks.died, `${label}: the copies are home before the blocker dies: ${JSON.stringify(marks)}`);
    assert.equal(result.life, 38);
    assert.equal(result.guard, 'graveyard');
    assert.equal(result.replay, false, `${label}: no replay window opens`);
    assert.equal(result.inert, false, `${label}: the table is never locked`);
    assert.deepEqual(result.after, {copies: 0, faded: 0});
    assert.equal(result.replayAvailable, true, `${label}: Replay last combat stays available`);
    if (width <= 600) {
      assert.ok(marks.combatView != null && marks.combatView < marks.charge, `${label}: the phone shows the Combat view: ${JSON.stringify(marks)}`);
      assert.equal(result.view, 'mine', `${label}: the phone returns to the view it left`);
    }
    await page.screenshot({path: `${output}/${width}-after.png`});
    console.log(`PASS ${label} live combat: charge ${marks.charge}ms, contact ${marks.dragonContact}ms, damage ${marks.damage}ms`);

    const side = await sideFight(page);
    assert.equal(side.life, 38);
    assert.ok(side.near < 90, `${label}: an attack on another opponent charges that player: ${JSON.stringify(side)}`);
    assert.ok(side.impact != null && side.impact < 90, `${label}: the damage number appears at that player: ${JSON.stringify(side)}`);
    console.log(`PASS ${label} an opponent attacked by another opponent is charged and hit where they are shown`);

    // Combat animation off, then reduced motion: no charge, the same damage.
    for (const [name, setup] of [['animation off', () => { _ui.combatAnimationEnabled = false; }],
      ['reduced motion', () => { _ui.combatAnimationEnabled = true; _ui.reducedMotion = true; document.body.classList.add('reduced-motion'); }]]) {
      await page.evaluate(setup);
      const quiet = await fight(page);
      assert.equal(quiet.marks.charge, undefined, `${label} ${name}: nothing charges`);
      assert.equal(quiet.life, 38);
      assert.equal(quiet.replay, false);
      if (width <= 600) assert.equal(quiet.marks.combatView, undefined, `${label} ${name}: the phone keeps its view`);
      console.log(`PASS ${label} ${name}: damage without a charge`);
    }
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) server.close();
}
