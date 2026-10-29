// Native Scute landfall through real four-player priority and the human UI.
// Empty-window runs isolate CPU; legal-response runs retain normal pacing.
// Token limits stay unchanged in both cases.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.SCUTE_BROWSER_OUTPUT || `${root}output/scute-swarm-browser`;
const allScenarios = [[1440, 900], [390, 844]].flatMap(([width, height]) => [false, true].map(withResponse =>
  ({width, height, withResponse, label: `${width}-${withResponse ? 'legal-response' : 'automatic'}`})));
const selected = process.env.SCUTE_BROWSER_SCENARIOS === undefined ? null
  : new Set(process.env.SCUTE_BROWSER_SCENARIOS.split(',').map(label => label.trim()).filter(Boolean));
if (selected) {
  assert.ok(selected.size > 0, 'SCUTE_BROWSER_SCENARIOS must contain at least one scenario label');
  for (const label of selected) assert.ok(allScenarios.some(scenario => scenario.label === label), `Unknown SCUTE_BROWSER_SCENARIOS label: ${label}`);
}
const scenarios = allScenarios.filter(scenario => !selected || selected.has(scenario.label));
mkdirSync(output, {recursive: true});
const server = process.env.GAME_URL ? null : express()
  .use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
page.setDefaultTimeout(30000);
const receipt = {target: base, loadNote: process.env.SCUTE_BROWSER_LOAD_NOTE || 'Load conditions not specified',
  selectedScenarios: scenarios.map(scenario => scenario.label), scenarios: [], errors: [], sources: []};
const sourcePaths = ['src/modules/engine.js', 'src/modules/engine2.js', 'src/modules/ai.js', 'src/modules/ai-v2.js',
  'src/modules/ui.js', 'src/modules/oracle-v8-land-types.js', 'src/modules/oracle-v28-common.js',
  'src/modules/oracle-v83-common.js', 'src/modules/oracle-v88-common.js', 'src/modules/pip-otc-m3c-rules.js',
  'src/modules/who-lcc-mkc-integration.js', 'src/modules/who-lcc-mkc-rules.js',
  'src/modules/oracle-v20-costs.js', 'src/modules/oracle-v66-common.js', 'src/modules/cmm-woc-who-integration.js'];
const sourceReads = [];
page.on('pageerror', error => receipt.errors.push(error.message));
page.on('response', response => {
  const path = new URL(response.url()).pathname.slice(1);
  if (sourcePaths.includes(path)) sourceReads.push(response.body().then(body => ({path,
    status: response.status(), sha256: createHash('sha256').update(body).digest('hex')})));
});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
});

async function fixture(withResponse) {
  await page.evaluate(withResponse => {
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.querySelector('#game').style.display = 'flex'; document.body.classList.add('game-active');
    const ui = new MTG.UI();
    const game = new MTG.Game({seed: 2910250, paced: withResponse, onEvent: () => ui.queueRender()});
    const you = game.addPlayer('You', {name: 'Quick Draw'}, null, false);
    const bots = ['Swarm AI', 'AI Wolf', 'AI Raven'].map(name => game.addPlayer(name, {name: 'Elven Empire'}, null, true));
    for (const bot of bots) bot.controller = new MTG.AIController(bot, {difficulty: 'hard', style: 'balanced'});
    const owner = bots[0]; ui.game = game; ui.me = you; ui.applySpeed();
    you.controller = ui.controllerFor(you);
    game.turnPlayer = owner; game.turnNo = 12; game.phase = 'main1'; game.step = 'main';
    const put = (name, player, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone; card.ctrl = player; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : player[zone]).push(card); return card;
    };
    for (const player of game.players) for (let n = 0; n < 20; n++) put('Forest', player, 'library');
    for (let n = 0; n < 6; n++) put(withResponse && n === 0 ? 'Island' : 'Forest', owner);
    for (let n = 0; n < 125; n++) put('Scute Swarm', owner).isToken = n > 0;
    const land = put('Forest', owner, 'hand');
    const opt = withResponse ? put('Opt', you, 'hand') : null;
    const opponentOpt = withResponse ? put('Opt', owner, 'hand') : null;
    const island = withResponse ? put('Island', you) : null;
    game.recalc(); window._game = game; window._ui = ui;
    const state = window.__swarm = {done: false, error: null, withResponse, owner, you, land, opt, opponentOpt, island,
      initialScutes: game.creatures(owner).filter(card => card.name === 'Scute Swarm').length,
      triggerCount: null, totalMs: null, configuredDelayMs: 0,
      maxHeartbeatGapMs: 0, heartbeatTicks: 0, animationFrames: 0, longTasks: []};
    const nativePace = game.pace;
    game.pace = async function (ms) {
      if (this.paced && !this.gameOver && ms && this.speedFactor > 0) state.configuredDelayMs += Math.round(ms * this.speedFactor);
      return nativePace.call(this, ms);
    };
    let lastBeat, interval, raf, observer;
    const frame = () => {state.animationFrames++; raf = requestAnimationFrame(frame);};
    state.begin = async () => {
      const started = performance.now(); lastBeat = started;
      interval = setInterval(() => {const now = performance.now(); state.maxHeartbeatGapMs = Math.max(state.maxHeartbeatGapMs, now - lastBeat); lastBeat = now; state.heartbeatTicks++;}, 16);
      raf = requestAnimationFrame(frame);
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        observer = new PerformanceObserver(entries => state.longTasks.push(...entries.getEntries().map(entry => entry.duration)));
        observer.observe({type: 'longtask'});
      }
      try {
        if (!await game.playLand(owner, land)) throw Error('The seventh land was not legal');
        state.triggerCount = game.stack.filter(item => item.kind === 'trigger').length;
        // The default profile deliberately auto-passes harmless triggers.
        // An opposing spell provides a real supported response window while
        // all 125 landfall triggers are still waiting underneath it.
        if (opponentOpt && !await game.castSpell(owner, opponentOpt, {from: 'hand'})) throw Error('The opposing Opt was not legal');
        await game.priorityRound(owner);
        state.done = true;
      } catch (error) {state.error = error.stack;}
      finally {
        ui.render();
        state.totalMs = performance.now() - started;
        state.maxHeartbeatGapMs = Math.max(state.maxHeartbeatGapMs, performance.now() - lastBeat);
        clearInterval(interval); cancelAnimationFrame(raf);
        // Let PerformanceObserver deliver the task that just completed.
        setTimeout(() => {observer?.disconnect(); state.metricsReady = true;}, 50);
      }
    };
    ui.render();
  }, withResponse);
}

const state = () => page.evaluate(() => ({done: __swarm.done, error: __swarm.error,
  initialScutes: __swarm.initialScutes, triggerCount: __swarm.triggerCount,
  scutes: _game.creatures(__swarm.owner).filter(card => card.name === 'Scute Swarm').length,
  tokens: _game.creatures(__swarm.owner).filter(card => card.isToken).length,
  tokenLimit: MTG.TOKEN_LIMIT_PER_PLAYER,
  stack: _game.stack.length, triggers: _game.pendingTriggers.length,
  profile: _ui.prioMode, reaction: !!_ui.react, pending: _ui.pending?.q.type || null,
  acceptedTokenReveals: _ui.acceptAllReveals === _game.turnNo,
  casts: (_ui.react?.q.casts || _ui.pending?.q.casts || []).map(entry => entry.card.name),
  optZone: __swarm.opt?.zone || null, optManaSpent: __swarm.opt?.castMeta?.manaSpent || 0,
  opponentOptZone: __swarm.opponentOpt?.zone || null, opponentOptManaSpent: __swarm.opponentOpt?.castMeta?.manaSpent || 0,
  islandTapped: __swarm.island?.tapped || false, hand: __swarm.you.hand.map(card => card.name),
  fallback: !!_game._decisionFallbacks || (_game.aiDecisionLog || []).some(row => row.fallback),
  overflow: document.documentElement.scrollWidth > innerWidth,
  totalMs: __swarm.totalMs, configuredDelayMs: __swarm.configuredDelayMs,
  paced: _game.paced, speedFactor: _game.speedFactor, maxHeartbeatGapMs: __swarm.maxHeartbeatGapMs,
  heartbeatTicks: __swarm.heartbeatTicks, animationFrames: __swarm.animationFrames,
  longTasks: __swarm.longTasks, renderError: _ui.renderError?.message || null}));

try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  for (const {width, height, withResponse, label} of scenarios) {
    await page.setViewportSize({width, height}); await fixture(withResponse);
    await page.evaluate(() => {setTimeout(() => {void __swarm.begin();}, 0);});
    if (withResponse) {
      await page.waitForFunction(() => !!_ui.react || !!__swarm.error, null, {timeout: 120000});
      const before = await state(); assert.equal(before.error, null); assert.equal(before.done, false);
      assert.equal(before.profile, 'end'); assert.deepEqual(before.casts, ['Opt']);
      assert.equal(before.triggerCount, 125); assert.equal(before.stack, 126);
      await page.evaluate(() => {__swarm.retainedReaction = _ui.react; _ui.queueRender();});
      await page.waitForTimeout(350);
      assert.equal(await page.evaluate(() => _ui.react === __swarm.retainedReaction && !__swarm.done), true,
        'the legal response waits for a deliberate user action');
      await page.screenshot({path: `${output}/${label}-waiting.png`});
      await page.getByRole('button', {name: /RESPOND|Open responses/i}).filter({visible: true}).first().click();
      const closePreview = page.locator('.stackpopx:visible');
      if (await closePreview.count()) await closePreview.click();
      await page.locator('.hand [data-cname="Opt"]').click();
      await page.locator('.sheetacts .pbtn').filter({hasText: /^Cast/}).first().click();
      await page.waitForFunction(() => _ui.pending?.q.type === 'scry' || !!__swarm.error, null, {timeout: 120000});
      assert.equal((await state()).error, null);
      await page.locator('.scrydecision .pbtn.primary').click();
      // The opposing Opt still receives its normal review after ours resolves.
      // Ordinary token creation can also request a reveal; native copied
      // Scutes may finish without one. Do not invent a missing decision.
      for (let n = 0; n < 6; n++) {
        await page.waitForFunction(() => !!_ui.pending || !!_ui.react || __swarm.done || !!__swarm.error, null, {timeout: 180000});
        const current = await state(); assert.equal(current.error, null);
        if (current.done) break;
        if (current.pending === 'cardReveal') {
          await page.locator('.revealacceptall:visible').click();
        } else {
          assert.equal(await page.evaluate(() => (_ui.pending?.q || _ui.react?.q)?.type), 'priority');
          await page.getByRole('button', {name: /^Proceed/}).filter({visible: true}).last().click();
        }
      }
    }
    await page.waitForFunction(() => __swarm.metricsReady, null, {timeout: 180000});
    const result = await state();
    assert.equal(result.error, null); assert.equal(result.done, true); assert.equal(result.initialScutes, 125);
    assert.equal(result.triggerCount, 125); assert.equal(result.scutes, 250); assert.equal(result.tokens, 249);
    assert.equal(result.tokenLimit, 250, 'the existing token limit is unchanged');
    assert.equal(result.stack, 0); assert.equal(result.triggers, 0); assert.equal(result.pending, null);
    assert.equal(result.reaction, false); assert.equal(result.fallback, false); assert.equal(result.overflow, false);
    assert.equal(result.renderError, null);
    if (withResponse) {
      assert.equal(result.optZone, 'graveyard'); assert.equal(result.optManaSpent, 1);
      assert.equal(result.opponentOptZone, 'graveyard'); assert.equal(result.opponentOptManaSpent, 1);
      assert.equal(result.islandTapped, true); assert.deepEqual(result.hand, ['Forest']);
      assert.equal(result.paced, true); assert.equal(result.speedFactor, 1.25);
      assert.ok(result.animationFrames > 0, 'the normally paced stack continues painting');
    }
    await page.screenshot({path: `${output}/${label}-resolved.png`});
    receipt.scenarios.push({label, width, withResponse, ...result});
    console.log(JSON.stringify({label, scutes: result.scutes, totalMs: Math.round(result.totalMs),
      configuredDelayMs: result.configuredDelayMs, maxHeartbeatGapMs: Math.round(result.maxHeartbeatGapMs),
      heartbeatTicks: result.heartbeatTicks, animationFrames: result.animationFrames}));
  }
  receipt.sources = await Promise.all(sourceReads);
  for (const path of sourcePaths) assert.ok(receipt.sources.some(source => source.path === path && source.status === 200), `${path} was served successfully`);
  if (!process.env.GAME_URL) for (const source of receipt.sources) assert.equal(source.sha256,
    createHash('sha256').update(readFileSync(root + source.path)).digest('hex'), `${source.path} stayed unchanged during the run`);
  assert.deepEqual(receipt.errors, []);
} catch (error) {
  receipt.failure = error.stack; receipt.lastState = await state().catch(() => null);
  await page.screenshot({path: `${output}/failure.png`}).catch(() => {}); throw error;
} finally {
  writeFileSync(`${output}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
  await browser.close(); server?.close();
}
