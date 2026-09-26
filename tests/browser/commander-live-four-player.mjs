// Four isolated human browsers, one real WebSocket room and the normal Arena.
// Fixtures are staged only on the host; decisions/payment/combat use visible controls.
// Run with PLAYWRIGHT_MODULE set, optionally --url https://... --output output/...
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createCommanderLiveServer, createMemoryRoomStore } from '../../api/ws.js';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const externalURL = arg('--url') || process.env.GAME_URL;
const out = arg('--output') || process.env.GAME_QA_OUTPUT || 'output/playwright/commander-live-four-player';
mkdirSync(out, { recursive: true });
const server = externalURL ? null : createCommanderLiveServer({ store: createMemoryRoomStore() });
if (server) {
  const app = server.listeners('request')[0];
  app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
  app.use(express.static(fileURLToPath(new URL('../../', import.meta.url))));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
}
const base = externalURL || `http://127.0.0.1:${server.address().port}`;
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browserName = process.env.BROWSER || 'chromium';
const browser = await pw[browserName].launch({ headless: true });
const pages = [], checks = [], errors = [], wireChecks = [0, 0, 0, 0];
const mark = label => { checks.push(label); console.log('PASS ' + label); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Credentials stay in browser storage. Never save frames or invitation URLs.
const redact = value => String(value).replace(/https?:\/\/[^\s"<>]+/g, '[URL]').replace(/(?:room|token|clientId|inviteSecret|credential)[=:][^\s,;]+/gi, '[credential]');
async function until(fn, label, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (errors.length) throw new Error(errors.join('\n'));
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error('Timed out: ' + label);
}
const question = page => page.evaluate(() => window._ui?.pending?.q.type || window._ui?.react?.q.type || null);
async function click(page, name, scope = '#game', protectedTypes = null) {
  // Cards themselves have role=button; a card named "Continue?" must never
  // be mistaken for the Continue decision button beneath an opening-hand modal.
  const button = page.locator(scope).getByRole('button', { name, disabled: false }).and(page.locator('button')).filter({ visible: true }).last();
  if (!await button.count()) return false;
  // Bind this decision's actual DOM control. A broad locator re-resolves to a
  // newly arriving main-phase Continue while a previous response is in flight.
  const handle = await button.elementHandle();
  if (!handle) return false;
  if (protectedTypes && !await handle.evaluate((node, types) => {
    const type = window._ui?.pending?.q.type || window._ui?.react?.q.type;
    return node.isConnected && !!type && !types.includes(type);
  }, protectedTypes)) return false;
  try { await handle.click({ timeout: 20000 }); return true; }
  catch (error) { if (/not attached|detached/i.test(error.message)) return false; throw error; }
}
async function advance(except, protectedTypes = ['main'], protectAll = false) {
  for (const page of pages) {
    const type = await question(page);
    const protectedPage = protectAll || page === except;
    if (protectedPage && protectedTypes.includes(type)) continue;
    if (type === 'chooseCards') {
      const missing = await page.evaluate(() => Math.max(0, (_ui.pending.q.min || 0) - _ui.pending.sel.length));
      for (let i = 0; i < missing; i++) await page.locator('.modal .cardgrid > :not(.selected)').first().click();
      await click(page, /^Confirm/);
    }
    // Recheck after another browser's action delivers a fresh decision.
    if (protectedPage && protectedTypes.includes(await question(page))) continue;
    await click(page, /^(Continue|End turn|Proceed|No attacks|No blocks|Keep ✓|Let it|Let resolve)/, '#game', protectedPage ? protectedTypes : null);
  }
}
async function main(page) {
  await until(async () => { if (await question(page) === 'main') return true; await advance(page); return false; }, 'seat main phase');
}
async function sameMain(page) {
  await until(() => question(page).then(type => type === 'main'), 'return to current main decision');
}
async function resolve(fn, label) {
  await until(async () => { if (await fn()) return true; await advance(null, ['main'], true); return false; }, label);
}
async function cast(page, iid) {
  await page.locator(`.hcard[data-iid="${iid}"]`).click();
  await page.locator('.sheetacts').getByRole('button', { name: /^Cast/ }).first().click();
}
async function pay(page, sourceName) {
  await until(() => page.locator('.manapickmodal').isVisible(), 'manual mana source selection');
  if (sourceName) {
    while (await page.locator('.manasourcerow.selected').count()) await page.locator('.manasourcerow.selected').first().click();
    await page.locator('.manasourcerow').filter({ hasText: sourceName }).first().click();
  }
  await until(() => page.getByRole('button', { name: /^Tap selected sources/ }).isEnabled(), 'validated mana preview');
  await page.getByRole('button', { name: /^Tap selected sources/ }).click();
}
async function pageFor(seat) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1'); localStorage.setItem('mtgStopProfile', 'auto');
  });
  const page = await context.newPage(); pages.push(page);
  page.on('pageerror', error => errors.push(`Seat ${seat + 1}: ${redact(error.message)}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`Seat ${seat + 1}: ${redact(message.text())}`); });
  page.on('websocket', ws => ws.on('framereceived', event => {
    let message; try { message = JSON.parse(String(event.payload)); } catch { return; }
    const view = message.view;
    if (!view?.gameView) return;
    try {
      if (seat > 0) assert.equal(view.settings.seed, null);
      assert.equal(view.you, seat);
      assert.ok(view.gameView.players.filter(p => p.seat !== seat).every(p => !p.hand));
      if (view.pendingDecision) assert.equal(view.pendingDecision.seat, seat);
      wireChecks[seat]++;
    } catch (error) { errors.push(`Seat ${seat + 1} private view: ${error.message}`); }
  }));
  await page.goto(base, { waitUntil: 'domcontentloaded' }); return page;
}

try {
  const host = await pageFor(0);
  await host.locator('[data-menu-action="live"]').first().click();
  await host.locator('.deckentry[data-deck="Abzan Armor"] .deckcard').click();
  await host.locator('.deckspotlightcontinue').click();
  await host.locator('[data-live-players="4"]').click();
  await host.locator('.setupnext:visible').click(); await host.locator('.reviewstart').click();
  const invite = await host.locator('.online-invite b').innerText();
  for (let seat = 1; seat < 4; seat++) {
    const page = await pageFor(seat);
    await page.goto(invite, { waitUntil: 'domcontentloaded' });
    await page.locator('.online-deck-select').selectOption(['', 'Elven Council', 'Doom Prevails', 'Turtle Power'][seat]);
  }
  await until(() => host.locator('.online-start').isEnabled(), 'four ready humans');
  await host.screenshot({ path: `${out}/01-four-human-lobby.png`, mask: [host.locator('.online-invite')] });
  await host.locator('.online-start').click();
  await main(host);
  assert.equal(await host.evaluate(() => _game.players.length === 4 && _game.players.every(p => !p.isAI)), true);
  mark('four isolated browsers join, ready, keep opening hands and start a human-only Live table');
  const ids = await host.evaluate(() => {
    const g = _game; g.speedFactor = 0;
    const put = (name, player, zone) => {
      const c = new MTG.CardInst(MTG.DEFS[name], player); c.zone = zone; c.sick = false;
      if (zone === 'battlefield') g.battlefield.push(c); else player[zone].push(c); return c.iid;
    };
    const rows = Array.from({ length: 4 }, (_, seat) => {
      const p = g.players.find(p => p.onlineSeat === seat);
      const row = { land: put('Forest', p, 'hand'), ring: put('Sol Ring', p, 'hand'), ponder: put('Ponder', p, 'hand'), swords: put('Swords to Plowshares', p, 'hand'),
        mana: put('Mind Stone', p, 'battlefield'), attack: put('Hill Giant', p, 'battlefield'), block: put('Wall of Omens', p, 'battlefield') };
      for (const name of ['Plains', 'Plains', 'Island', 'Island', 'Forest']) put(name, p, 'battlefield');
      return row;
    });
    g.recalc(); g.note('render', {}); return rows;
  });
  // The shuffled starting-player order is independent of lobby seat numbers.
  // Visit the next actual turn so no untested human's turn is skipped.
  const turnOrder = await host.evaluate(() => {
    const order = _game.players.map(p => p.onlineSeat), start = order.indexOf(0);
    return order.slice(start).concat(order.slice(0, start));
  });
  // The current main question predates the controlled fixtures. Let the normal
  // engine request its next main question before interacting with those cards.
  await until(() => click(host, /^Continue/), 'host leaves the staged first main');
  await until(async () => {
    if (await host.evaluate(() => _ui.pending?.q.type === 'main' && _ui.game.phase === 'main2')) return true;
    await advance(host); return false;
  }, 'host second main');

  async function combat(seat) {
    const attacker = pages[seat], defendingSeat = (seat + 1) % 4, defender = pages[defendingSeat];
    await until(async () => { if (await question(attacker) === 'attackers') return true; await advance(attacker, ['attackers']); return false; }, `seat ${seat + 1} attackers`);
    await attacker.setViewportSize({ width: 390, height: 844 });
    await attacker.locator(`.mini[data-iid="${ids[seat].attack}"]`).tap();
    const targetIdx = await attacker.evaluate(seat => _ui.game.players.find(p => p.onlineSeat === seat).idx, defendingSeat);
    await attacker.locator(`[data-combat-defender="player-${targetIdx}"]`).tap();
    assert.equal(await attacker.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await attacker.screenshot({ path: `${out}/seat-${seat + 1}-mobile-attack.png` });
    await attacker.locator('[data-testid="confirm-combat-battlefield"]').tap();
    await attacker.setViewportSize({ width: 1440, height: 1000 });
    await until(async () => { if (await question(defender) === 'blockers') return true; await advance(defender, ['blockers']); return false; }, `seat ${defendingSeat + 1} blockers`);
    await defender.locator(`.mini[data-iid="${ids[defendingSeat].block}"]`).click();
    await defender.locator(`[data-combat-attacker="${ids[seat].attack}"]`).click();
    await until(() => defender.locator('[data-testid="confirm-combat-battlefield"]').isEnabled(), 'validated block preview');
    if (defendingSeat > 0) {
      const decision = await defender.evaluate(() => _ui.pending.q.onlineDecision.id);
      await defender.reload();
      await until(async () => {
        await click(host, /^Resume live game$/, 'body');
        return defender.evaluate(id => window._ui?.pending?.q.onlineDecision.id === id && _ui.liveSession.room.phase === 'running', decision);
      }, `seat ${defendingSeat + 1} reconnect`);
      assert.equal(await defender.locator('.myboard .mini.ct-combat-selected').count(), 1);
      await until(() => defender.locator('[data-testid="confirm-combat-battlefield"]').isEnabled(), 'reconnected block preview');
      mark(`seat ${defendingSeat + 1} reconnect restores its private seat, pending decision and selected blocker`);
    }
    const priorLife = await host.evaluate(seat => _game.players.find(p => p.onlineSeat === seat).life, defendingSeat);
    await defender.locator('[data-testid="confirm-combat-battlefield"]').click();
    await until(async () => {
      if (await attacker.evaluate(() => _ui.pending?.q.type === 'main' && _ui.game.phase === 'main2')) return true;
      for (const page of pages) await click(page, /^(Proceed|Let it|Let resolve)/);
      return false;
    }, 'same-turn combat resolution');
    assert.deepEqual(await host.evaluate(({ id, seat }) => ({ damage: _game.byIid(id).damage, life: _game.players.find(p => p.onlineSeat === seat).life }), { id: ids[defendingSeat].block, seat: defendingSeat }), { damage: 3, life: priorLife });
    await until(() => defender.locator(`.mini[data-iid="${ids[defendingSeat].block}"] [data-damage="3"]`).count(), 'defender receives marked damage');
    mark(`seat ${seat + 1} attacks on a phone; seat ${defendingSeat + 1} blocks and receives authoritative combat damage`);
  }

  for (const seat of turnOrder) {
    const page = pages[seat], fixture = ids[seat];
    await main(page);
    for (const selector of ['.arenaheader', '.ct-decision-rail', '.manamode', '.menubutton']) assert.equal(await page.locator(selector).count(), 1, `seat ${seat + 1}: ${selector}`);
    assert.equal(await page.locator('.online-remote-game').count(), 0);
    assert.equal(await page.evaluate(seat => _ui.me.onlineSeat === seat && _ui.game.players.length === 4, seat), true);
    await page.locator('.menubutton').click();
    assert.equal(await page.getByRole('button', { name: /^Last Resort/ }).isEnabled(), true);
    await page.keyboard.press('Escape');
    await page.locator(`.hcard[data-iid="${fixture.land}"]`).click();
    await page.locator('.sheetacts').getByRole('button', { name: 'Play land', exact: true }).click();
    await until(() => host.evaluate(id => _game.byIid(id)?.zone === 'battlefield', fixture.land), 'land play');
    await sameMain(page);
    await page.locator('.manamode').click();
    await cast(page, fixture.ring); await pay(page, 'Plains');
    await until(() => host.evaluate(id => _game.stack.some(o => o.card?.iid === id), fixture.ring), 'paid spell reaches stack');
    for (const viewer of pages) await until(() => viewer.evaluate(id => _ui.game.stack.some(o => o.card?.iid === id), fixture.ring), 'each human sees the same stack');
    await resolve(() => host.evaluate(id => _game.byIid(id)?.zone === 'battlefield', fixture.ring), 'Sol Ring resolution');
    await main(page);
    const manaBefore = await host.evaluate(seat => _game.players.find(p => p.onlineSeat === seat).pool.C || 0, seat);
    await page.locator(`.mini[data-iid="${fixture.mana}"]`).click();
    await page.locator('.sheetacts').getByRole('button', { name: /Mana:/ }).click();
    await until(() => host.evaluate(({ id, seat, before }) => _game.byIid(id).tapped && _game.players.find(p => p.onlineSeat === seat).pool.C === before + 1, { id: fixture.mana, seat, before: manaBefore }), 'mana ability');
    await sameMain(page);
    const tappedBefore = await host.evaluate(seat => _game.battlefield.filter(c => c.ctrl.onlineSeat === seat && c.tapped).map(c => c.iid), seat);
    const poolBefore = await host.evaluate(seat => _game.players.find(p => p.onlineSeat === seat).pool, seat);
    const phaseBefore = await host.evaluate(() => ({ turn: _game.turnNo, phase: _game.phase }));
    await cast(page, fixture.swords);
    await until(() => question(page).then(type => type === 'chooseTargets'), 'target choices');
    await page.getByRole('button', { name: /^Abort cast/ }).click();
    await sameMain(page);
    assert.deepEqual(await host.evaluate(() => ({ turn: _game.turnNo, phase: _game.phase })), phaseBefore, 'aborting stays in the same turn and phase');
    assert.equal(await host.evaluate(id => _game.byIid(id).zone, fixture.swords), 'hand');
    assert.deepEqual(await host.evaluate(seat => _game.battlefield.filter(c => c.ctrl.onlineSeat === seat && c.tapped).map(c => c.iid), seat), tappedBefore);
    assert.deepEqual(await host.evaluate(seat => _game.players.find(p => p.onlineSeat === seat).pool, seat), poolBefore);
    mark(`seat ${seat + 1} has full Arena/card sheet, plays a land, manually pays a spell, sees shared Stack, activates mana and cancels targeting`);
    await cast(page, fixture.ponder); await pay(page);
    await until(async () => { if (await question(page) === 'chooseCards') return true; await advance(page, ['main', 'chooseCards', 'chooseOption']); return false; }, 'private Ponder choice');
    assert.equal(await page.evaluate(() => _ui.pending.q.from.every(c => c.name !== 'Hidden card')), true);
    const top = await page.evaluate(() => _ui.pending.q.from[0].iid);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    for (let i = 0; i < 3; i++) await page.locator('.modal .cardgrid > :not(.selected)').first().tap();
    await click(page, /^Confirm/);
    await until(() => question(page).then(type => type === 'chooseOption'), 'Ponder shuffle option');
    await page.getByRole('button', { name: 'Keep', exact: true }).click();
    await resolve(() => host.evaluate(id => _game.byIid(id)?.zone === 'hand', top), 'chosen top card drawn');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await main(page);
    mark(`seat ${seat + 1} privately selects library order on a phone and draws its chosen top card`);
    if (seat > 0) await combat(seat);
    await until(() => click(page, /^End turn/), 'end completed seat turn');
  }
  await main(host); await combat(0);
  assert.ok(wireChecks.every(n => n > 10));
  assert.deepEqual(errors, []);
  mark('every human attacks and blocks; all four views hide other hands and decisions; guests never receive the shuffle seed; zero browser errors');
  writeFileSync(`${out}/result.json`, JSON.stringify({ ok: true, browserName, target: new URL(base).origin, humans: 4, checks, wireChecks, errors }, null, 2));
} catch (error) {
  for (let seat = 0; seat < pages.length; seat++) {
    const page = pages[seat];
    await page.screenshot({ path: `${out}/failure-seat-${seat + 1}.png`, mask: [page.locator('.online-invite')] }).catch(() => {});
    const state = await page.evaluate(() => ({ text: document.querySelector('#game')?.innerText, question: _ui?.pending?.q.type, phase: _ui?.game?.phase })).catch(() => null);
    writeFileSync(`${out}/failure-seat-${seat + 1}.json`, redact(JSON.stringify(state, null, 2)));
  }
  writeFileSync(`${out}/result.json`, JSON.stringify({ ok: false, checks, wireChecks, errors, failure: redact(error.stack) }, null, 2));
  throw new Error(redact(error.stack));
} finally {
  await browser.close();
  if (server) { for (const client of server.commanderLive.clients) client.ws.terminate(); await new Promise(resolve => server.close(resolve)); }
}
