// Real isolated Live clients. Controlled cards are staged only on the authority;
// all player choices, costs, priority and resolution use actual Arena controls.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browserName = process.env.BROWSER || 'chromium';
const base = process.env.GAME_URL || 'http://127.0.0.1:65460';
const out = process.env.GAME_QA_OUTPUT || `output/multiplayer-parity/${browserName}-gameplay`;
mkdirSync(out, { recursive: true });
const browser = await pw[browserName].launch({ headless: true });
const pages = [], errors = [], checks = [];
const frames = new Map();
const mark = name => { checks.push(name); console.log('PASS ' + name); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (errors.length) throw new Error(errors.join('\n')); if (await fn()) return; await sleep(100); }
  throw new Error('Timed out: ' + label);
}
async function pageFor(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', hasTouch: true });
  await context.addInitScript(() => { localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1'); localStorage.setItem('mtgStopProfile', 'auto'); });
  const page = await context.newPage(); pages.push([name, page]); frames.set(name, []);
  page.on('pageerror', error => errors.push(`${name}: ${error.stack || error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
  page.on('websocket', ws => ws.on('framereceived', message => { try { frames.get(name).push(JSON.parse(String(message.payload))); } catch {} }));
  await page.goto(base); return page;
}
const question = page => page.evaluate(() => window._ui?.pending?.q.type || window._ui?.react?.q.type || null);
async function click(page, pattern, scope = '#game') {
  const button = page.locator(scope).getByRole('button', { name: pattern, disabled: false }).filter({ visible: true }).last();
  if (!await button.count()) return false;
  await button.click({ timeout: 4000 }); return true;
}
async function advance(except, stopTypes = ['main']) {
  for (const [name, page] of pages) {
    if (page === except && stopTypes.includes(await question(page))) continue;
    if (await question(page) === 'chooseCards') {
      const count = await page.evaluate(() => Math.max(0, (_ui.pending.q.min || 0) - _ui.pending.sel.length));
      for (let i = 0; i < count; i++) await page.locator('.modal .cardgrid > :not(.selected)').first().click();
      await click(page, /^Confirm/);
    }
    await click(page, /^(Continue|End turn|Proceed|No attacks|No blocks|Keep ✓|Let it|Let resolve)/);
  }
}
async function cast(page, iid) {
  await page.locator(`.hcard[data-iid="${iid}"]`).click();
  await page.locator('.sheetacts').getByRole('button', { name: /^Cast/ }).first().click();
}
async function resolveUntil(fn, label) { await until(async () => { if (await fn()) return true; await advance(); return false; }, label); }
try {
  const host = await pageFor('host'), guest = await pageFor('guest');
  await host.locator('[data-menu-action="live"]').first().click();
  await host.locator('.deckentry[data-deck="Abzan Armor"] .deckcard').click();
  await host.locator('.deckspotlightcontinue').click();
  await host.locator('[data-live-players="2"]').click();
  await host.locator('.setupnext:visible').click(); await host.locator('.reviewstart').click();
  const invite = await host.locator('.online-invite b').innerText();
  await guest.goto(invite); await guest.locator('.online-deck-select').selectOption('Elven Council');
  await until(() => host.locator('.online-start').isEnabled(), 'both ready'); await host.locator('.online-start').click();
  await until(async () => { await advance(); return await host.evaluate(() => !!window._game?.turnPlayer); }, 'opening hands');
  await host.evaluate(() => { _game.speedFactor = 0; });
  await until(async () => { if (await host.evaluate(() => _ui.pending?.q.type === 'main' && _ui.game.phase === 'main1')) return true; await advance(); return false; }, 'host first main');
  const ids = await host.evaluate(() => {
    const g = _game, me = g.players.find(p => p.onlineSeat === 0), guest = g.players.find(p => p.onlineSeat === 1);
    const put = (name, owner, zone) => {
      const c = new MTG.CardInst(MTG.DEFS[name], owner); c.zone = zone; c.sick = false;
      if (zone === 'battlefield') g.battlefield.push(c); else owner[zone].push(c); return c.iid;
    };
    const hostRing = put('Sol Ring', me, 'hand'); put('Plains', me, 'battlefield');
    const ring = put('Sol Ring', guest, 'hand'), swords = put('Swords to Plowshares', guest, 'hand'), ponder = put('Ponder', guest, 'hand');
    const target = put('Llanowar Elves', me, 'battlefield');
    for (const name of ['Plains', 'Plains', 'Island', 'Island', 'Island', 'Forest']) put(name, guest, 'battlefield');
    g.recalc(); g.note('render', {});
    return { hostRing, ring, swords, ponder, target };
  });
  await click(host, /^Continue/);
  await until(async () => { if (await host.evaluate(() => _ui.pending?.q.type === 'main' && _ui.game.phase === 'main2')) return true; await advance(); return false; }, 'host second main');
  await host.locator('.manamode').click();
  await cast(host, ids.hostRing);
  await until(() => host.locator('.manapickmodal').isVisible(), 'host manual mana');
  assert.match(await host.locator('.manapickcost').innerText(), /Cost/);
  await host.getByRole('button', { name: /^Tap selected sources/ }).click();
  await resolveUntil(() => host.evaluate(id => _game.byIid(id)?.zone === 'battlefield', ids.hostRing), 'host Ring resolution');
  mark('host uses the shared card sheet and manual mana; paid Sol Ring resolves');
  await until(async () => { if (await question(guest) === 'main') return true; await advance(guest); return false; }, 'guest main');
  for (const page of [host, guest]) {
    assert.equal(await page.locator('.ct-decision-rail').count(), 1);
    assert.equal(await page.locator('.manamode').count(), 1);
    assert.equal(await page.locator('.online-remote-game').count(), 0);
  }
  await guest.locator('.manamode').click();
  await cast(guest, ids.ring);
  await until(() => guest.locator('.manapickmodal').isVisible(), 'guest manual mana');
  // Rapid edits must settle on the latest selection, including returning to
  // a previously requested source set before its preview arrived.
  await guest.evaluate(() => {
    const index = _ui.pending.q.candidates.indexOf(_ui.pending.sel[0]);
    for (let n = 0; n < 4; n++) document.querySelectorAll('.manasourcerow')[index].click();
  });
  const selected = await guest.locator('.manasourcerow.selected').count(); assert.ok(selected > 0);
  await until(() => guest.getByRole('button', { name: /^Tap selected sources/ }).isEnabled(), 'authoritative source preview');
  const pd = await guest.evaluate(() => _ui.pending.q.onlineDecision.id);
  const source = guest.locator('.manasourcerow.selected').first();
  await source.focus(); const sourceHandle = await source.elementHandle();
  await host.evaluate(() => _game.note('render', {})); await sleep(450);
  assert.equal(await sourceHandle.evaluate(node => node.isConnected && document.activeElement === node), true);
  assert.equal(await guest.evaluate(() => _ui.pending.q.onlineDecision.id), pd);
  await guest.getByRole('button', { name: /^Tap selected sources/ }).click();
  await until(() => host.evaluate(id => _game.stack.some(object => object.card?.iid === id), ids.ring), 'guest Ring on Stack');
  await host.screenshot({ path: `${out}/01-host-review-guest-ring.png` });
  await resolveUntil(() => host.evaluate(id => _game.byIid(id)?.zone === 'battlefield', ids.ring), 'guest Ring resolution');
  await until(() => guest.locator(`.mini[data-iid="${ids.ring}"]`).count(), 'guest Ring displayed');
  assert.equal(await guest.locator(`.mini[data-iid="${ids.ring}"] .pt`).count(), 0);
  await guest.screenshot({ path: `${out}/02-guest-ring.png` });
  mark('guest has the same manual mana, retained source focus, shared Stack review and no artifact P/T');
  await until(() => question(guest).then(type => type === 'main'), 'guest main after Ring');
  const before = await host.evaluate(() => { const p = _game.players.find(p => p.onlineSeat === 1); return { mana: p.pool, tapped: _game.battlefield.filter(c => c.ctrl === p && c.tapped).map(c => c.iid) }; });
  await cast(guest, ids.swords);
  await until(() => question(guest).then(type => type === 'chooseTargets'), 'guest targets');
  await guest.getByRole('button', { name: /^Abort cast/ }).click();
  await until(() => question(guest).then(type => type === 'main'), 'guest abort returns to main');
  const after = await host.evaluate(id => { const p = _game.players.find(p => p.onlineSeat === 1); return { mana: p.pool, tapped: _game.battlefield.filter(c => c.ctrl === p && c.tapped).map(c => c.iid), zone: _game.byIid(id).zone }; }, ids.swords);
  assert.deepEqual(after.mana, before.mana); assert.deepEqual(after.tapped, before.tapped); assert.equal(after.zone, 'hand');
  mark('guest Abort cast returns the card without tapping or spending mana');
  await cast(guest, ids.swords);
  await until(() => question(guest).then(type => type === 'chooseTargets'), 'second target choice');
  await guest.locator(`.mini[data-iid="${ids.target}"]`).click();
  await click(guest, /^Lock.*cast/);
  await until(() => guest.locator('.manapickmodal').isVisible(), 'white payment');
  await guest.getByRole('button', { name: /^Tap selected sources/ }).click();
  await resolveUntil(() => host.evaluate(id => _game.byIid(id).zone === 'exile', ids.target), 'Swords resolves');
  mark('guest selects a creature on the shared battlefield, pays W, and Swords exiles it');
  await until(() => question(guest).then(type => type === 'main'), 'main for Ponder');
  await cast(guest, ids.ponder);
  await until(() => guest.locator('.manapickmodal').isVisible(), 'blue payment');
  await guest.getByRole('button', { name: /^Tap selected sources/ }).click();
  await until(async () => { if (await question(guest) === 'chooseCards') return true; await advance(guest, ['scry', 'chooseCards', 'chooseOption']); return false; }, 'Ponder library decision');
  const libraryDecision = await guest.evaluate(() => ({ type: _ui.pending.q.type, text: document.querySelector('.modal')?.innerText, cards: (_ui.pending.q.cards || _ui.pending.q.from || []).map(c => c.name) }));
  assert.equal(libraryDecision.cards.includes('Hidden card'), false);
  assert.ok(libraryDecision.cards.length > 0 || libraryDecision.text.length > 0);
  await guest.screenshot({ path: `${out}/03-private-library-choice.png` });
  mark('private library choices render real cards for their choosing guest');
  // Inspect responsive controls during a blocking decision without answering it.
  const beforeResize = await guest.evaluate(() => _ui.pending.q.onlineDecision.id);
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.screenshot({ path: `${out}/04-mobile-decision.png` });
  assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await guest.evaluate(() => _ui.pending.q.onlineDecision.id), beforeResize);
  const topCard = await guest.evaluate(() => _ui.pending.q.from[0].iid);
  await guest.locator('.modal .cardgrid > :not(.selected)').first().tap();
  await guest.setViewportSize({ width: 1440, height: 1000 });
  mark('mobile shares the same decision and has no horizontal page overflow');
  for (let i = 0; i < 2; i++) await guest.locator('.modal .cardgrid > :not(.selected)').first().click();
  await click(guest, /^Confirm/);
  await until(() => question(guest).then(type => type === 'chooseOption'), 'Ponder shuffle choice');
  assert.equal(await guest.locator('.decisioncards').innerText().then(text => text.includes('Hidden card')), false);
  await guest.getByRole('button', { name: 'Keep', exact: true }).click();
  await resolveUntil(() => host.evaluate(id => _game.byIid(id)?.zone === 'hand', topCard), 'chosen Ponder top is drawn');
  await until(() => question(guest).then(type => type === 'main'), 'main after completed Ponder');
  mark('mobile card selection completes Ponder in the chosen order and draws the selected top card');

  const combat = await host.evaluate(() => {
    const g = _game, host = g.players.find(p => p.onlineSeat === 0), guest = g.players.find(p => p.onlineSeat === 1);
    const put = (name, owner, zone) => {
      const c = new MTG.CardInst(MTG.DEFS[name], owner); c.zone = zone; c.sick = false;
      if (zone === 'battlefield') g.battlefield.push(c); else owner[zone].push(c); return c.iid;
    };
    const attack = put('Hill Giant', host, 'battlefield'), block = put('Wall of Omens', guest, 'battlefield');
    const spell = put('Arcane Signet', host, 'hand'), counter = put('Counterspell', guest, 'hand');
    g.recalc(); g.note('render', {}); return { attack, block, spell, counter, guestLife: guest.life };
  });
  await until(async () => { if (await question(host) === 'main') return true; await advance(host); return false; }, 'host next main');
  await cast(host, combat.spell);
  await until(() => host.locator('.manapickmodal').isVisible(), 'host Signet payment');
  await host.getByRole('button', { name: /^Tap selected sources/ }).click();
  await until(async () => {
    if (await guest.evaluate(id => (_ui.pending?.q.type === 'priority' || _ui.react?.q.type === 'priority') && _ui.game.stack.some(o => o.card?.iid === id), combat.spell)) return true;
    await click(host, /^(Continue|Proceed)/); return false;
  }, 'guest counter window');
  if (await guest.locator('.actionrespond:visible').count()) await guest.locator('.actionrespond:visible').click();
  await cast(guest, combat.counter);
  await until(() => question(guest).then(type => type === 'chooseTargets'), 'counter target selection');
  await guest.locator('.stackpopitem.targetable').first().click();
  await click(guest, /^Lock.*cast/);
  await until(() => guest.locator('.manapickmodal').isVisible(), 'counter UU payment');
  await guest.getByRole('button', { name: /^Tap selected sources/ }).click();
  await guest.screenshot({ path: `${out}/05-counterspell.png` });
  await resolveUntil(() => host.evaluate(id => _game.byIid(id)?.zone === 'graveyard', combat.spell), 'guest counters host spell');
  mark('guest responds to the host on Stack, chooses the exact spell, pays UU and counters it');

  await until(async () => { if (await question(host) === 'attackers') return true; await advance(); return false; }, 'host attack controls');
  await host.locator(`.attackpoolcard[data-attacker="${combat.attack}"]`).click();
  await host.locator('.attackalloclane.player').click();
  await click(host, /^Confirm attack/);
  await until(async () => { if (await question(guest) === 'blockers') return true; await advance(); return false; }, 'guest block controls');
  await guest.locator('.blockcand').filter({ hasText: 'Wall of Omens' }).click();
  await until(() => guest.locator('.blockmodal').getByRole('button', { name: /^Confirm blocks/ }).isEnabled(), 'authoritative block preview');
  const blockDecision = await guest.evaluate(() => _ui.pending.q.onlineDecision.id);
  await guest.reload();
  await until(async () => {
    await click(host, /^Resume live game$/, 'body');
    return await guest.evaluate(id => window._ui?.pending?.q.onlineDecision.id === id && _ui.liveSession.room.phase === 'running', blockDecision);
  }, 'reload preserves the pending blocker decision');
  assert.equal(await guest.locator('.blockcand.assigned').count(), 1);
  mark('guest reload restores the same decision and selected blocker, then host resumes');
  await until(() => guest.locator('.blockmodal').getByRole('button', { name: /^Confirm blocks/ }).isEnabled(), 'restored block preview');
  await guest.screenshot({ path: `${out}/06-guest-blocking.png` });
  const combatTurn = await host.evaluate(() => _game.turnNo);
  await guest.locator('.blockmodal').getByRole('button', { name: /^Confirm blocks/ }).click();
  await until(async () => {
    if (await host.evaluate(turn => _game.turnNo === turn && _game.phase === 'main2' && _ui.pending?.q.type === 'main', combatTurn)) return true;
    // Review only: a broad advance can click a newly rendered End turn
    // before the next sample, clear damage in cleanup and inspect a later turn.
    for (const [, page] of pages) await click(page, /^(Proceed|Let it|Let resolve)/);
    return false;
  }, 'combat damage completes in the same turn');
  const damage = await host.evaluate(id => ({ damage: _game.byIid(id).damage, life: _game.players.find(p => p.onlineSeat === 1).life }), combat.block);
  assert.equal(damage.damage, 3); assert.equal(damage.life, combat.guestLife);
  await until(() => guest.locator(`.mini[data-iid="${combat.block}"] [data-damage="3"]`).count(), 'guest sees actual marked damage');
  mark('host assigns attackers, guest assigns blockers, both review combat and see the correct marked damage');

  const hostPending = await host.evaluate(() => _ui.pending.q.onlineDecision.id);
  await guest.locator('.menubutton').click();
  await guest.getByRole('button', { name: /^Last Resort/ }).click();
  await guest.locator('[data-testid="enable-last-resort"]').click();
  await until(() => guest.locator('.lastresortsheet').isVisible(), 'guest recovery panel');
  await guest.locator('.lastresortplayer select').selectOption('1');
  guest.once('dialog', dialog => dialog.accept('37'));
  await guest.locator('.lastresortgrid').getByRole('button', { name: /Set life/ }).click();
  await until(() => host.evaluate(() => _game.players.find(p => p.onlineSeat === 1).life === 37), 'guest life correction is authoritative');
  const manaPrompts = ['W', '1'];
  const answerMana = dialog => dialog.accept(manaPrompts.shift()); guest.on('dialog', answerMana);
  await guest.getByRole('button', { name: /Set mana pool/ }).click();
  await until(() => host.evaluate(() => _game.players.find(p => p.onlineSeat === 1).pool.W === 1), 'guest mana correction');
  guest.off('dialog', answerMana);
  await guest.getByRole('button', { name: /Tap \/ untap/ }).click();
  await guest.locator(`.mini[data-iid="${ids.ring}"]`).click();
  await until(() => host.evaluate(id => _game.byIid(id).tapped, ids.ring), 'guest tap correction');
  await guest.locator('.menubutton').click();
  await guest.getByRole('button', { name: /^Last Resort/ }).click();
  await guest.locator('[data-testid="finish-last-resort"]').click();
  await until(() => host.evaluate(() => !_game.lastResortPaused), 'recovery finishes');
  assert.equal(await host.evaluate(() => _ui.pending.q.onlineDecision.id), hostPending);
  mark('guest uses shared Last Resort for life, mana and tap; host receives changes and keeps its pending decision');

  const dragFixture = await host.evaluate(() => {
    const p = _game.players.find(p => p.onlineSeat === 1), c = new MTG.CardInst(MTG.DEFS['Swords to Plowshares'], p);
    const mana = new MTG.CardInst(MTG.DEFS['Mind Stone'], p); mana.zone = 'battlefield'; _game.battlefield.push(mana);
    _game.battlefield.find(c => c.ctrl === p && c.name === 'Plains').tapped = false;
    c.zone = 'hand'; p.hand.push(c); _game.recalc(); _game.note('render', {}); return { spell: c.iid, mana: mana.iid };
  });
  const dragSpell = dragFixture.spell;
  await guest.locator('.menubutton').click();
  await guest.getByRole('button', { name: /^Arena drag controls/ }).click();
  await guest.keyboard.press('Escape');
  await guest.getByRole('button', { name: 'HOLD', exact: true }).click();
  await click(host, /^End turn/);
  await until(async () => { if (await question(guest) === 'priority') return true; await advance(guest, ['main', 'priority']); return false; }, 'guest HOLD priority');
  if (await guest.locator('.actionrespond:visible').count()) await guest.locator('.actionrespond:visible').click();
  assert.equal(await guest.evaluate(id => _ui.pending.q.casts.some(c => c.card.iid === id), dragSpell), true, 'HOLD exposes a legal Swords response');
  const dragSource = guest.locator(`.hcard[data-iid="${dragSpell}"]`);
  await dragSource.scrollIntoViewIfNeeded();
  const from = await dragSource.boundingBox(), to = await guest.locator(`.mini[data-iid="${combat.attack}"]`).boundingBox();
  assert.ok(from && to);
  const x = from.x + from.width / 2, y = from.y + from.height / 2;
  await guest.mouse.move(x, y); await guest.mouse.down();
  await guest.mouse.move(x + 12, y - 10, { steps: 3 }); await sleep(80);
  await guest.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 }); await sleep(80);
  await guest.mouse.up();
  await until(() => guest.locator('.manapickmodal').isVisible(), 'drag preserves target and proceeds directly to mana');
  await until(() => guest.getByRole('button', { name: /^Tap selected sources/ }).isEnabled(), 'drag payment preview');
  await guest.getByRole('button', { name: /^Tap selected sources/ }).click();
  await resolveUntil(() => host.evaluate(id => _game.byIid(id).zone === 'exile', combat.attack), 'direct guest drag cast resolves on selected target');
  mark('guest HOLD and direct card dragging preserve the selected target through the authoritative cast');
  await until(async () => { if (await question(guest) === 'main') return true; await advance(guest); return false; }, 'guest main for a mana ability');
  const colorless = await host.evaluate(() => _game.players.find(p => p.onlineSeat === 1).pool.C || 0);
  await guest.locator(`.mini[data-iid="${dragFixture.mana}"]`).click();
  await guest.locator('.sheetacts').getByRole('button', { name: /Mana:/ }).click();
  await until(() => host.evaluate(({ id, colorless }) => _game.byIid(id).tapped && _game.players.find(p => p.onlineSeat === 1).pool.C === colorless + 1, { id: dragFixture.mana, colorless }), 'guest activates a mana ability');
  await until(() => guest.evaluate(n => _ui.me.pool.C === n, colorless + 1), 'guest mana display matches the authority');
  mark('guest chooses Mind Stone mana from its card sheet and both players see the correct colorless mana');
  // Network views never carry another human hand or the deterministic shuffle seed.
  for (const message of frames.get('guest')) if (message.view?.gameView) {
    assert.equal(message.view.settings.seed, null);
    assert.ok(message.view.gameView.players.filter(p => p.seat !== message.view.you).every(p => !p.hand));
  }
  assert.deepEqual(errors, []); mark('private views and zero captured browser errors');
  writeFileSync(`${out}/result.json`, JSON.stringify({ ok: true, browserName, checks, errors }, null, 2));
} catch (error) {
  for (const [name, page] of pages) {
    await page.screenshot({ path: `${out}/failure-${name}.png` }).catch(() => {});
    writeFileSync(`${out}/failure-${name}.json`, JSON.stringify(await page.evaluate(() => ({ text: document.querySelector('#game')?.innerText, state: window.render_game_to_text?.() })).catch(() => null), null, 2));
  }
  writeFileSync(`${out}/result.json`, JSON.stringify({ ok: false, checks, errors, failure: error.stack }, null, 2));
  throw error;
} finally { await browser.close(); }
