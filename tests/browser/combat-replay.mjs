// Real engine damage through the ordinary Solo event dispatcher, including the
// phone Combat tab after damage has finished. Combat itself is animated on the
// table; the replay window opens only from Replay last combat and must never
// answer a choice.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.COMBAT_REPLAY_OUTPUT || `${root}output/web-game/combat-replay`;
mkdirSync(output, {recursive: true});
const remote = process.env.GAME_URL || null;
const server = remote ? null : express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = remote || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, reducedMotion: 'reduce'});
page.setDefaultTimeout(20000);
const receipt = {checks: [], errors: [], layouts: []};
const computedOnly = process.env.COMBAT_REPLAY_COMPUTED_ONLY === '1';
page.on('pageerror', error => receipt.errors.push(error.message));
const check = name => { receipt.checks.push(name); console.log(`PASS ${name}`); };
const dialog = page.getByRole('dialog', {name: 'Combat replay', exact: true});

async function start() {
  await page.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  // Production verification still uses a fresh, unsigned-in Solo browser.
  // Never send account, room, telemetry or save writes to the hosted service.
  if (remote) await page.route('**/api/**', route => ['GET','HEAD','OPTIONS'].includes(route.request().method())
    ? route.continue() : route.fulfill({status: 403, json: {error:'Writes disabled in browser verification'}}));
  // Optional read-only artwork fallback for sparse checkouts. All gameplay and
  // account requests remain on the local test server.
  if (process.env.COMBAT_REPLAY_ASSET_ORIGIN) await page.route('**/assets/cards/**', async route => {
    const url = new URL(route.request().url());
    if (existsSync(`${root}${decodeURIComponent(url.pathname).slice(1)}`)) return route.continue();
    const response = await route.fetch({url: `${process.env.COMBAT_REPLAY_ASSET_ORIGIN}${url.pathname}`, timeout: 15000});
    await route.fulfill({response});
  });
  const url = new URL(base);
  url.searchParams.set('smokeDeck','Quick Draw'); url.searchParams.set('seed','11081');
  await page.goto(url.href);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', undefined, {timeout: 120000});
  await page.locator('.modal .pbtn.primary').click();
  await page.evaluate(() => { _game.speedFactor = 0; });
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate(() => _ui.pending?.q.type === 'main')) break;
    const proceed = page.locator('button.pbtn:visible').filter({hasText: /^(Proceed|Continue to my turn)(?:\s|$)/});
    if (await proceed.count()) await proceed.first().click();
    else await page.waitForTimeout(100);
  }
  assert.equal(await page.evaluate(() => _ui.pending?.q.type), 'main', 'The actual Solo game reaches a human decision');
  assert.equal(await page.evaluate(() => typeof _ui.showCombatReplay), 'function', 'Replay module is loaded by the production entry');
  assert.equal(await page.evaluate(() => _ui.combatAnimationEnabled), true, 'Combat animation is enabled by default in a fresh browser');
  receipt.url = page.url();
  receipt.build = await page.evaluate(() => MTG.BUILD_INFO || null);
  if (process.env.EXPECTED_BUILD_REVISION) {
    assert.equal(receipt.build?.revision, process.env.EXPECTED_BUILD_REVISION, 'Browser loaded the requested shipped commit');
    assert.equal(receipt.build?.dirty, false, 'Shipped build identity is clean');
  }
  await page.evaluate(() => {
    window.__combatOriginalEvent = _game.onEvent;
    window.__combatReplayEvents = [];
    _game.onEvent = event => {
      if (event.type === 'combatReplay') __combatReplayEvents.push(event.replay);
      __combatOriginalEvent(event);
    };
  });
}

async function install(scenario, width) {
  if (await dialog.count()) await dialog.getByRole('button', {name: 'Skip', exact: true}).click();
  await page.setViewportSize({width, height: width >= 2000 ? 1440 : width > 600 ? 1000 : 844});
  await page.evaluate(({scenario, width}) => {
    const game = _game, ui = _ui, human = ui.me, enemy = game.players.find(player => player !== human);
    game.paced = false; game.pace = async () => {}; game.gameOver = false;
    game.battlefield = []; game.stack = []; game.pendingTriggers = []; game.untilEffects = [];
    game.turnNo++; game.turnPlayer = enemy; game.phase = 'combat'; game.step = 'blockers';
    for (const player of game.players) { player.life = 40; player.poison = 0; player.lost = false; }
    const put = (name, owner) => {
      if (!MTG.DEFS[name]) throw new Error(`Missing fixture card: ${name}`);
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.zone = 'battlefield'; card.sick = false; game.battlefield.push(card); return card;
    };
    const attack = (card, blockers = []) => {
      card.attacking = human; card.blockedBy = blockers; card.wasBlocked = blockers.length > 0;
      blockers.forEach(blocker => { blocker.blocking = card.iid; });
      return card;
    };
    let attackers;
    if (scenario === 'dense') {
      const dragon = put('Dragon Tyrant', enemy);
      // A granted pump/keyword effect uses the engine's normal continuous layer.
      game.untilEffects.push({kind: 'oracleSourcePump', iid: dragon.iid, zoneVersion: dragon.zoneVersion,
        power: 10, toughness: 14, keywords: ['lifelink', 'indestructible']});
      attackers = [attack(dragon, Array.from({length: 6}, () => put('Serra Angel', human))),
        attack(put('Shivan Dragon', enemy)), attack(put('Serra Angel', enemy))];
    } else if (scenario === 'prevented') {
      attackers = [attack(put('Shivan Dragon', enemy), [put('Fog Bank', human)])];
    } else if (scenario === 'direct') {
      attackers = [attack(put('Shivan Dragon', enemy))];
    } else if (scenario === 'infect') {
      const attacker = put('Blightsteel Colossus', enemy);
      // Keep this demonstration below the poison loss threshold.
      game.untilEffects.push({kind: 'oracleSourcePump', iid: attacker.iid, zoneVersion: attacker.zoneVersion,
        power: -7, toughness: 0, keywords: []});
      attackers = [attack(attacker)];
    } else {
      const dragon = put('Dragon Tyrant', enemy);
      game.untilEffects.push({kind: 'oracleSourcePump', iid: dragon.iid, zoneVersion: dragon.zoneVersion,
        power: 0, toughness: 0, keywords: ['lifelink']});
      attackers = [attack(dragon, [put('Darksteel Myr', human)])];
    }
    game.combat = {attackers}; game.recalc();
    window.__combatSubject = {scenario, enemy, human, attackers};
    window.__combatPending = ui.pending;
    window.__combatRules = () => JSON.stringify({life: game.players.map(p => p.life), poison: game.players.map(p => p.poison),
      commander: game.players.map(p => p.commanderDamage), battlefield: game.battlefield.map(c => ({id: c.iid, damage: c.damage,
        counters: c.counters, zone: c.zone})), graves: game.players.map(p => p.graveyard.map(c => c.iid))});
    if (width <= 600) ui.showMobileView('combat');
    else ui.commandTableView = 'table';
    ui.render();
  }, {scenario, width});
}

async function damage(step = 'normal', open = true) {
  const before = await dialog.count();
  await page.evaluate(async step => {
    await _game.combatDamage(__combatSubject.enemy, step);
    window.__combatAfter = __combatRules();
  }, step);
  assert.equal(await dialog.count(), before, 'Recorded combat never opens the window by itself');
  if (open) { await page.evaluate(() => _ui.replayLastCombat()); await dialog.waitFor(); }
}

async function combatPreference(enabled) {
  await page.getByTitle('Game controls and display settings', {exact: true}).click();
  await page.getByRole('tab', {name:'Appearance', exact:true}).click();
  const toggle = page.getByTestId('combat-animation-toggle');
  try { await toggle.waitFor(); }
  catch (error) {
    await page.screenshot({path: `${output}/menu-failure.png`});
    receipt.menuFailure = await page.evaluate(() => ({open: _ui.quickMenuOpen,
      inert: document.getElementById('game').inert, menu: document.querySelector('.quickmenu')?.outerHTML,
      toggles: [...document.querySelectorAll('[data-testid="combat-animation-toggle"]')].map(node => ({html:node.outerHTML, rect:node.getBoundingClientRect().toJSON()}))}));
    throw error;
  }
  assert.equal(await toggle.getAttribute('role'), 'switch');
  if ((await toggle.getAttribute('aria-checked') === 'true') !== enabled) await toggle.click();
  assert.equal(await toggle.getAttribute('aria-checked'), String(enabled));
  await page.getByRole('button', {name:'Close game menu', exact:true}).click();
  assert.equal(await page.evaluate(() => _ui.combatAnimationEnabled), enabled);
}

async function layout(width) {
  const info = await dialog.evaluate(element => {
    const rect = node => { const r = node.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom}; };
    return {width: innerWidth, height: innerHeight, dialog: rect(element), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      blockers: [...element.querySelectorAll('[data-testid="combat-replay-blocker"]')].map(rect),
      buttons: [...element.querySelectorAll('button')].filter(node => /^(Skip|Pause|Resume|Next strike|Finish)$/.test(node.textContent.trim())).map(rect)};
  });
  receipt.layouts.push(info);
  assert.ok(info.dialog.left >= -1 && info.dialog.right <= width + 1, JSON.stringify(info));
  assert.ok(Math.abs((info.dialog.left + info.dialog.right) / 2 - width / 2) <= 2,
    'Replay stays centered when desktop UI zoom changes');
  assert.ok(info.scrollWidth <= info.clientWidth + 1, 'No horizontal replay overflow');
  for (let i = 0; i < info.blockers.length; i++) {
    const a = info.blockers[i];
    assert.ok(a.left >= -1 && a.right <= width + 1, 'Blockers fit viewport width');
    for (let j = i + 1; j < info.blockers.length; j++) {
      const b = info.blockers[j];
      assert.ok(Math.min(a.right,b.right) - Math.max(a.left,b.left) <= 1 || Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top) <= 1,
        `Blockers ${i + 1} and ${j + 1} do not overlap`);
    }
  }
  for (const r of info.buttons) assert.ok(r.left >= -1 && r.right <= width + 1 && r.top >= -1 && r.bottom <= info.height + 1,
    `Playback controls remain visible: ${JSON.stringify(r)}`);
}

async function unchanged() {
  assert.equal(await page.evaluate(() => __combatRules() === __combatAfter), true, 'Playback cannot apply damage twice');
  assert.equal(await page.evaluate(() => _ui.pending === __combatPending), true, 'Playback cannot answer or replace the waiting decision');
}

try {
  await start();
  for (const width of computedOnly ? [] : [320,390,1440,2560]) {
    await install('dense', width);
    await damage('first');
    await dialog.getByRole('button', {name: 'Pause', exact: true}).click();
    assert.match(await dialog.textContent(), /First.strike/i);
    assert.equal(await dialog.getByTestId('combat-replay-blocker').count(), 6);
    await layout(width);
    await page.screenshot({path: `${output}/mtgpod-combat-${width >= 2000 ? `desktop-${width}` : width > 600 ? 'desktop' : `phone-${width}`}.png`});
    if (width <= 600) {
      await dialog.getByTestId('combat-replay-blocker').last().scrollIntoViewIfNeeded();
      await page.screenshot({path: `${output}/mtgpod-combat-phone-${width}-blockers.png`});
    }
    await unchanged();
    await dialog.getByRole('button', {name:'Skip', exact:true}).click();
    await damage('normal');
    await dialog.getByRole('button', {name: 'Pause', exact: true}).click();
    const recorded = await page.evaluate(() => {
      const events = __combatReplayEvents.slice(-2);
      return {steps: events.map(r => r.step), combatIds: events.map(r => r.combatId),
        damage: events.at(-1).damage.reduce((sum, hit) => sum + (hit.amount || 0), 0),
        life: __combatSubject.human.life, enemyLife: __combatSubject.enemy.life};
    });
    assert.deepEqual(recorded.steps, ['first','normal']);
    assert.equal(recorded.combatIds[0], recorded.combatIds[1]);
    assert.ok(recorded.life < 40 && recorded.enemyLife > 40, JSON.stringify(recorded));
    await unchanged();
    await dialog.getByRole('button', {name:'Skip', exact:true}).click();
    await page.evaluate(() => { _game.phase = 'main1'; _game.step = 'main'; _ui.render(); });
    if (width <= 600) {
      const replay = page.getByRole('button', {name: 'Replay last combat', exact: true});
      await replay.waitFor(); await replay.click(); await dialog.waitFor();
      await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
      await unchanged();
      check(`${width}px real mobile combat is recorded, six blockers fit in Replay, and Replay remains available in Main 1`);
    } else check(`${width}px desktop real combat shows multiple attackers, double-strike steps, trample and lifelink`);
  }

  await install('computed',390);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(() => { _ui.reducedMotion = false; document.body.classList.remove('reduced-motion'); });
  await damage('first');
  await page.waitForFunction(() => document.querySelector('[data-testid="combat-replay-clash"]')?.dataset.impact === 'true');
  await page.waitForTimeout(1600);
  await dialog.getByRole('button', {name:'Pause',exact:true}).click();
  const first = await page.evaluate(() => ({life: __combatSubject.human.life, gained: __combatSubject.enemy.life,
    guarded: __combatSubject.attackers[0].blockedBy[0].zone, replay: __combatReplayEvents.at(-1)}));
  assert.deepEqual([first.life,first.gained,first.guarded],[35,46,'battlefield']);
  assert.ok(await dialog.locator('.combat-replay-badge').count() >= 4);
  assert.ok(await dialog.locator('.combat-replay-hit').first().evaluate(node => Number(getComputedStyle(node).opacity)) > .9,
    'Creature damage remains readable after the impact animation ends');
  await unchanged();
  await damage('normal');
  // The indestructible 0/1 already has lethal damage marked, so all six
  // points trample over in the normal step (five in the first step).
  assert.deepEqual(await page.evaluate(() => [__combatSubject.human.life,__combatSubject.enemy.life]),[29,52]);
  await dialog.getByRole('button', {name:'Pause',exact:true}).click();
  await dialog.getByRole('button', {name:'Next strike',exact:true}).click();
  assert.equal(await dialog.getByRole('button', {name:'Resume',exact:true}).isVisible(), true, 'Stepping preserves Pause');
  assert.equal(await dialog.getByTestId('combat-replay-clash').getAttribute('data-impact'), 'true',
    'Paused Next strike reveals the completed impact without waiting for a timer');
  for (const card of await dialog.locator('.combat-replay-card').all()) {
    assert.ok(await card.evaluate(node => Number(getComputedStyle(node).opacity)) > .9, 'Paused stepping keeps every card visible');
  }
  assert.match(await dialog.locator('.combat-replay-face-hit').textContent(), /6/);
  assert.ok(await dialog.locator('.combat-replay-face-hit').evaluate(node => Number(getComputedStyle(node).opacity)) > .9,
    'Paused stepping keeps actual face damage visible');
  await unchanged();
  await dialog.getByRole('button',{name:'Skip',exact:true}).click();
  await unchanged();
  check('Animated double strike resolves twice; paused Next reveals cards and damage, indestructible survives, and trample/lifelink match actual outcomes');

  if (!computedOnly) {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(() => { _ui.reducedMotion = true; document.body.classList.add('reduced-motion'); });
  await install('prevented',390); await damage();
  await dialog.getByRole('button',{name:'Pause',exact:true}).click();
  const prevented = await page.evaluate(() => ({life:__combatSubject.human.life,guard:__combatSubject.attackers[0].blockedBy[0].zone,
    replay:__combatReplayEvents.at(-1)}));
  assert.equal(prevented.life,40); assert.equal(prevented.guard,'battlefield');
  assert.match(await dialog.textContent(), /prevent/i);
  await unchanged();
  await dialog.getByRole('button',{name:'Skip',exact:true}).click();
  check('Fog Bank prevention is shown without fabricated face damage or death');

  await install('infect',390); await damage();
  await dialog.getByRole('button',{name:'Pause',exact:true}).click();
  assert.deepEqual(await page.evaluate(() => [__combatSubject.human.life,__combatSubject.human.poison]),[40,4]);
  assert.match(await dialog.textContent(), /poison/i);
  await layout(390);
  await page.screenshot({path:`${output}/mtgpod-combat-phone-infect.png`});
  const animated = await dialog.evaluate(node => node.getAnimations({subtree:true}).filter(animation => animation.playState === 'running').length);
  assert.equal(animated,0,'Reduced motion keeps the replay visible with no running decorative animation');
  await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
  await unchanged();
  check('Reduced-motion infect replay remains visible, shows actual poison and preserves life totals');

  await combatPreference(false);
  await install('computed', 390);
  await damage('first', false);
  assert.equal(await dialog.count(), 0, 'Disabled animation never covers the waiting decision');
  assert.equal(await page.evaluate(() => _ui.hasCombatReplay()), true, 'Disabling autoplay retains recorded combat');
  assert.deepEqual(await page.evaluate(() => [__combatSubject.human.life,__combatSubject.enemy.life]),[35,46]);
  await unchanged();
  await page.getByRole('button', {name:'Replay last combat', exact:true}).click();
  await dialog.waitFor();
  await dialog.getByRole('button', {name:'Pause',exact:true}).click();
  await unchanged();
  await dialog.getByRole('button', {name:'Skip',exact:true}).click();
  assert.equal(await page.evaluate(() => _ui.combatAnimationEnabled), false, 'Manual Replay does not turn autoplay back on');
  await page.getByTitle('Game controls and display settings', {exact:true}).click();
  await page.getByRole('tab', {name:'Table', exact:true}).click();
  await page.locator('.quickmenu').getByRole('button', {name:/Replay last combat/}).click();
  await dialog.waitFor(); await unchanged();
  await dialog.getByRole('button', {name:'Skip',exact:true}).click();
  check('The actual menu disables automatic combat, while damage and manual Replay still work');

  await combatPreference(true);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(() => { _ui.reducedMotion = false; document.body.classList.remove('reduced-motion'); });
  await install('direct',390); await damage();
  await page.waitForFunction(() => document.querySelector('[data-testid="combat-replay-clash"]')?.dataset.impact === 'true');
  await page.waitForTimeout(1600);
  await dialog.getByRole('button', {name:'Pause',exact:true}).click();
  const hit = dialog.locator('.combat-replay-face-hit');
  await hit.waitFor();
  assert.match(await hit.textContent(), /5/);
  assert.equal(await page.evaluate(() => __combatSubject.human.life), 35);
  assert.ok(await hit.evaluate(node => Number(getComputedStyle(node).opacity)) > .9, 'The actual face-damage number remains legible after impact');
  await layout(390); await unchanged();
  await page.screenshot({path:`${output}/mtgpod-combat-phone-face-damage.png`});
  await dialog.getByRole('button', {name:'Skip',exact:true}).click();
  check('Re-enabling combat keeps Replay with a readable actual face-damage impact');
  }
  assert.deepEqual(receipt.errors,[]);
} finally {
  writeFileSync(`${output}/result.json`,JSON.stringify(receipt,null,2));
  await browser.close(); if (server) await new Promise(resolve => server.close(resolve));
}
