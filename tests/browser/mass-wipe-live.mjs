// Paid wipes cross the real Live decision serializer, room validation,
// remote Arena UI and response hydrator before native death triggers resolve.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';
import * as roomServer from '../../logic.js';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.MASS_WIPE_OUTPUT || `${root}output/mass-wipe-live`;
const baseline = process.env.MASS_WIPE_BASELINE;
mkdirSync(output, {recursive: true});
const app = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}));
if (baseline) app.get('/src/modules/multiplayer-presentation.js', (_req, res) => res.sendFile(baseline));
const server = app.use(express.static(root)).listen(0, '127.0.0.1'); await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
assert.ok(!process.env.GAME_URL || !baseline, 'Deployed verification cannot override its code');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
page.setDefaultTimeout(15000);
const receipt = {base, baseline: !!baseline, errors: [], checks: []};
page.on('pageerror', error => receipt.errors.push(error.message));
page.on('crash', () => receipt.errors.push('Browser page crashed'));
await page.exposeFunction('__validateLiveAction', (state, actor, action) => roomServer.validateAction(state, actor, action));
await page.addInitScript(() => {localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1');});
async function install(spec) {
  await page.evaluate(async ({spell: spellName, source, count}) => {
    const M = MTG, wire = value => JSON.parse(JSON.stringify(value)), L = M.onlineGameLogic;
    document.querySelector('#game').replaceWith(document.querySelector('#game').cloneNode(false));
    document.querySelectorAll('.gamefxlayer,.effectnoticestack,.toastmsg').forEach(node => node.remove());
    const ui = new M.UI(), g = new M.Game({seed: 77, paced: true}); g.pace = async () => {};
    const host = g.addPlayer('Host', {name: 'Wipe host'}, null, false);
    const guest = g.addPlayer('Guest', {name: 'Wipe guest'}, null, false);
    host.onlineSeat = 0; guest.onlineSeat = 1;
    host.controller = {decide: async (_g, q) => q.type === 'priority' ? {kind: 'pass'} : null};
    g.turnPlayer = host; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
    const put = (name, owner, zone = 'battlefield') => {
      const c = new M.CardInst(M.DEFS[name], owner); c.zone = zone; c.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(c); return c;
    };
    const artist = put(source, guest);
    const creatures = [artist];
    for (let i = 0; i < count; i++) creatures.push(put('Grizzly Bears', i % 2 ? guest : host));
    for (let i = 0; i < 9; i++) put(spellName === 'Wrath of God' ? 'Plains' : 'Mountain', host);
    for (const p of [host, guest]) for (let i = 0; i < 20; i++) put('Island', p, 'library');
    const spell = put(spellName, host, 'hand'); g.recalc();
    const audit = window.__wipeLive = {done: false, error: null, requests: [], responses: [], order: null, g, creatures, spell, host, guest};
    let state = L.setup(['host', 'guest'], {playerCount: 2});
    for (const [id, deckId] of [['host', 'Abzan Armor'], ['guest', 'Elven Council']]) state = L.applyAction(state, {type: 'configure', deckId}, id);
    state = L.applyAction(state, {type: 'start', seed: 77}, 'host');
    const views = () => Object.fromEntries([host, guest].map(p => [p.onlineSeat, wire(M.onlineGameViewFor(g, p))]));
    state = L.applyAction(state, {type: 'sync', views: views()}, 'host');
    const listeners = new Set(); let pendingResponse;
    const notify = () => {const view = wire(L.viewFor(state, 'guest')); for (const fn of listeners) fn(view); return view;};
    const checked = async (actor, action) => {
      const portable = wire(action), verdict = await window.__validateLiveAction(wire(state), actor, portable);
      if (!verdict.ok) throw Error(verdict.error);
      state = L.applyAction(state, portable, actor);
    };
    const client = {
      current: () => wire(L.viewFor(state, 'guest')),
      shareUrl: `local-live-wipe:${spellName}`,
      subscribe: fn => {listeners.add(fn); return () => listeners.delete(fn);},
      dispatch: async action => {
        const old = state.pendingDecision;
        await checked('guest', action);
        audit.responses.push({type: old?.type, response: wire(action.response)});
        const response = state.lastDecision?.response;
        await checked('host', {type: 'decisionAck', decisionId: action.decisionId});
        const view = notify(), resume = pendingResponse; pendingResponse = null;
        if (resume) queueMicrotask(() => resume(response));
        return view;
      },
    };
    const arena = M.createOnlineArena({client, ui}); audit.arena = arena;
    ui.prioMode = 'off'; ui.manaMode = 'auto'; ui.acceptAllReveals = g.turnNo; arena.update(client.current());
    const remote = M.remoteControllerFor(guest, {requestDecision: async payload => {
      const descriptor = wire(payload.descriptor), text = JSON.stringify(descriptor);
      audit.requests.push({type: payload.question.type, bytes: new TextEncoder().encode(text).length,
        triggers: payload.question.triggers?.length || 0});
      if (payload.question.type === 'orderTriggers') audit.order = {original: payload.question.triggers.slice(), question: payload.question};
      await checked('host', {type: 'sync', views: views()});
      await checked('host', {type: 'decisionRequest', decision: descriptor});
      return new Promise(resolve => {pendingResponse = resolve; notify();});
    }});
    guest.controller = {decide: async (game, q) => {
      if (q.type === 'priority') return {kind: 'pass'};
      const result = await remote.decide(game, q);
      if (q.type === 'orderTriggers') {
        audit.order.actualIndexes = result.map(tr => audit.order.original.indexOf(tr));
        audit.order.originalUnchanged = q.triggers.every((tr, i) => tr === audit.order.original[i]);
      }
      return result;
    }};
    window._authority = g;
    void g.castSpell(host, spell, {from: 'hand'}).then(async result => {
      await checked('host', {type: 'sync', views: views()}); notify();
      audit.result = result; audit.done = true;
    }).catch(error => {audit.error = error.message; ui.handleFatal(error);});
  }, spec);
}
const state = () => page.evaluate(() => ({done: __wipeLive.done, error: __wipeLive.error,
  pending: _ui.pending?.q.type, recovery: !!document.querySelector('[data-testid="view-recovery"]'),
  requests: __wipeLive.requests, responses: __wipeLive.responses,
  order: __wipeLive.order && {indexes: __wipeLive.order.actualIndexes, originalUnchanged: __wipeLive.order.originalUnchanged},
  stack: __wipeLive.g.stack.length, triggers: __wipeLive.g.pendingTriggers.length,
  life: [__wipeLive.host.life, __wipeLive.guest.life], remaining: __wipeLive.creatures.filter(c => c.zone === 'battlefield').length,
  paid: __wipeLive.spell.castMeta?.manaSpent, spellZone: __wipeLive.spell.zone, hand: __wipeLive.guest.hand.map(c => c.name)}));
try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  for (const width of [1440, 390]) for (const spec of [
    {spell: 'Blasphemous Act', source: 'Blood Artist', count: 16},
    {spell: 'Wrath of God', source: 'Blood Artist', count: 16},
    {spell: 'Blasphemous Act', source: 'Solemn Simulacrum', count: 64},
  ].filter(spec => !process.env.MASS_WIPE_CASES || (process.env.MASS_WIPE_CASES === 'optional') === (spec.source === 'Solemn Simulacrum'))) {
    const {spell, source} = spec, optional = source === 'Solemn Simulacrum';
    await page.setViewportSize({width, height: width === 390 ? 844 : 900}); await install(spec);
    const label = `${width}-${spell.replaceAll(' ', '-')}-${optional ? 'optional' : 'order'}`;
    if (optional) {
      await page.waitForFunction(() => __wipeLive.error || _ui.pending?.q.type === 'effectReview');
      if (!(await state()).error) await page.locator('.resolutionrecapproceed').click();
    }
    await page.waitForFunction(optional => __wipeLive.error || _ui.pending?.q.type === (optional ? 'chooseOption' : 'orderTriggers'), optional);
    const before = await state(); receipt.checks.push({width, spell, source, before});
    await page.screenshot({path: `${output}/${label}-${baseline ? 'rejected' : 'ordering'}.png`});
    if (baseline) {
      assert.equal(before.error, 'Decision payload is too large.');
      assert.ok(before.requests.find(q => q.type === (optional ? 'chooseOption' : 'orderTriggers')).bytes > 500000);
      continue;
    }
    assert.equal(before.error, null); assert.equal(before.recovery, false);
    if (optional) {
      assert.ok(before.requests.find(q => q.type === 'chooseOption').bytes < 100000);
      assert.equal(await page.evaluate(() => _ui.pending.q.data.card.name), 'Solemn Simulacrum');
      assert.match(await page.locator('.modal').innerText(), /Solemn Simulacrum/);
      await page.locator('[data-choice-key="yes"]').click();
    } else {
      assert.equal(await page.locator('.triggerorderrow').count(), 17);
      assert.match(await page.locator('.triggerordermodal').innerText(), /Blood Artist/);
      assert.ok(before.requests.find(q => q.type === 'orderTriggers').bytes < 100000);
      await page.locator('.triggerorderrow').first().getByRole('button', {name: /toward the top; resolves earlier$/}).click();
      const confirm = page.getByRole('button', {name: 'Confirm order', exact: true});
      const bounds = await confirm.boundingBox(); assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= (width === 390 ? 844 : 900));
      await confirm.click();
    }
    for (let step = 0; step < 100; step++) {
      const s = await state(); assert.equal(s.error, null); assert.equal(s.recovery, false);
      if (s.done) break;
      if (s.pending === 'chooseTargets') {
        await page.locator('.targetplayerpick[data-target-player="0"]').click();
        await page.getByRole('button', {name: /^Lock 1 target/}).click();
      } else if (s.pending === 'effectReview') {
        await page.screenshot({path: `${output}/${label}-recap.png`});
        await page.locator('.resolutionrecapproceed').click();
      }
      await page.waitForTimeout(70);
    }
    const after = await state(); receipt.checks.at(-1).after = after;
    assert.equal(after.done, true); assert.equal(after.error, null); assert.equal(after.remaining, 0);
    assert.equal(after.stack, 0); assert.equal(after.triggers, 0); assert.deepEqual(after.life, optional ? [40, 40] : [23, 57]);
    assert.equal(after.paid, spell === 'Blasphemous Act' ? 1 : 4); assert.equal(after.spellZone, 'graveyard');
    if (optional) {
      assert.deepEqual(after.hand, ['Island'], 'the confirmed optional death trigger actually draws');
      assert.equal(after.responses.find(q => q.type === 'chooseOption').response, 'yes');
    } else {
      assert.deepEqual(after.order.indexes, [1, 0, ...Array.from({length: 15}, (_, i) => i + 2)]);
      assert.equal(after.order.originalUnchanged, true);
      assert.deepEqual(after.responses.find(q => q.type === 'orderTriggers').response,
        ['t:1', 't:0', ...Array.from({length: 15}, (_, i) => `t:${i + 2}`)]);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({path: `${output}/${label}-continued.png`});
    console.log(`PASS ${width}px ${spell}: ${optional ? "65 deaths, remote optional draw" : "paid wipe, remote order, 17 death triggers"} and continuation`);
  }
  assert.deepEqual(receipt.errors, []); receipt.passed = true;
} catch (error) {
  receipt.failure = error.stack; await page.screenshot({path: `${output}/failure.png`}); throw error;
} finally {
  writeFileSync(`${output}/receipt.json`, JSON.stringify(receipt, null, 2));
  await browser.close(); server.close();
}
