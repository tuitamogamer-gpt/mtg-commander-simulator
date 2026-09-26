// Rendering fixtures exercise the actual UI decision promises; the separate
// player-gameplay suite covers a complete game without fixture answers.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.BATTLEFIELD_COMBAT_QA_OUTPUT || `${root}output/web-game/battlefield-combat`;
mkdirSync(output, { recursive: true });
const server = process.env.GAME_URL ? null : express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 }, reducedMotion: 'reduce', hasTouch: true });
const errors = [], failedRequests = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) failedRequests.push({ status: response.status(), url: response.url() }); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});
const check = message => { checks.push(message); console.log(`PASS ${message}`); };
const shot = async name => {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => [...document.querySelectorAll('.ct-portrait, .ct-review-art[src]')]
    .filter(image => { const r = image.getBoundingClientRect(); return r.width && r.height; })
    .every(image => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: `${output}/${name}.png` });
};
async function openSetup() {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible');
}
async function fixture() {
  if (!await page.evaluate(() => !!window.MTG?.UI)) await openSetup();
  await page.evaluate(() => {
    const oldRoot = document.querySelector('#game');
    oldRoot.replaceWith(oldRoot.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.body.classList.add('game-active');
    const game = new MTG.Game({ seed: 90526, paced: false });
    const quiet = { decide: async () => [] };
    const deckNames = ['Quick Draw', 'Elven Council', 'Squirreled Away', 'Temur Roar'];
    const players = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'].map((name, index) => game.addPlayer(name, { name: deckNames[index] }, quiet, index > 0));
    const you = players[0], ui = new MTG.UI();
    ui.game = game; ui.me = you; ui.commandTableView = 'table';
    you.controller = ui.controllerFor(you);
    game.turnPlayer = you; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
    window._game = game; window._ui = ui;
    const put = (name, owner, zone = 'battlefield') => {
      assertDefinition(name);
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.ctrl = owner; card.zone = zone; card.sick = false;
      if (zone === 'battlefield') game.battlefield.push(card);
      else if (owner[zone]) owner[zone].push(card);
      return card;
    };
    function assertDefinition(name) { if (!MTG.DEFS[name]) throw new Error(`Missing fixture card: ${name}`); }
    for (const [index, player] of players.entries()) {
      const commander = put(MTG.DECKS[deckNames[index]].commander, player, 'command');
      player.commanders = [commander]; player.life = [32, 36, 28, 24][index];
      const creature = put('Riders of Gavony', player);
      creature.counters['+1/+1'] = index + 1;
      put('Humble Defector', player).tapped = index === 2;
      put('Stormcatch Mentor', player);
      put('Sol Ring', player);
      for (const name of ['Forest', 'Island', 'Mountain', 'Island', 'Forest', 'Mountain']) put(name, player);
      for (let count = 0; count < index + 2; count++) put('Forest', player, 'graveyard');
    }
    for (const name of ['Counterspell', 'Beast Within', 'Swords to Plowshares', 'Sol Ring', 'Forest', 'Island', 'Mountain']) put(name, you, 'hand');
    you.pool.U = you.pool.G = you.pool.W = 3; you.pool.C = 6;
    game.recalc();
    window.__ctPut = put;
    window.__ctAnswered = null;
    void you.controller.decide(game, { type: 'main', player: you, phase: game.phase, casts: game.castableList(you), acts: [], lands: you.hand.filter(card => card.is('Land')) })
      .then(answer => { window.__ctAnswered = answer; });
    window.__ctMain = ui.pending;
    ui.render();
  });
}
const card = iid => page.locator(`.mini[data-iid="${iid}"]`).first();
const confirm = () => page.locator('[data-testid="confirm-combat-battlefield"]');
async function drag(source, target) {
  const a = await source.boundingBox(), b = await target.boundingBox();
  assert.ok(a && b, 'Both drag endpoints are visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 16, a.y + a.height / 2 - 12, {steps: 3});
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps: 12});
  await page.mouse.up();
}
async function combat(kind) {
  return page.evaluate(kind => {
    const g = _game, ui = _ui, you = ui.me, opponent = g.players[1];
    ui.pendings = []; ui.react = null;
    g.phase = 'combat'; g.step = kind === 'attackers' ? 'attackers' : 'blockers';
    g.combat = { attackers: [], defenders: new Map() };
    window.__combatAnswer = null;
    let q, ids;
    if (kind === 'attackers') {
      const walker = __ctPut("Vraska, Betrayal's Sting", opponent); walker.counters.loyalty = 6;
      const creatures = g.creatures(you); g.recalc();
      q = { type: kind, eligible: creatures, opponents: g.players.slice(1), attackTargets: [...g.players.slice(1), walker], forced: [] };
      ids = { creatures: creatures.map(c => c.iid), walker: walker.iid, opponent: opponent.idx };
    } else {
      const a = __ctPut('Boggart Brute', opponent), b = __ctPut('Serra Angel', opponent);
      a.attacking = b.attacking = you; a.tapped = b.tapped = true;
      g.turnPlayer = opponent; g.combat.attackers = [a, b]; g.recalc();
      q = { type: kind, attackers: [a, b], potential: g.creatures(you), attackingPlayer: opponent };
      ids = { attackers: [a.iid, b.iid], creatures: q.potential.map(c => c.iid) };
    }
    void you.controller.decide(g, q).then(answer => {
      window.__combatAnswer = answer == null ? 'continue' : answer.map(entry => ({ card: entry.card?.iid, target: entry.target?.iid ?? entry.target?.idx, blocker: entry.blocker?.iid, attacker: entry.attacker?.iid }));
    });
    ui.render(); return ids;
  }, kind);
}
async function visibleAction() {
  const box = await confirm().boundingBox();
  assert.ok(box && box.width <= 185 && box.height <= 48, `Compact action: ${JSON.stringify(box)}`);
  assert.ok(await confirm().evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return (hit === el || el.contains(hit)) && r.bottom <= innerHeight; }), 'Action remains reachable');
  assert.equal(await page.locator('.attackallocmodal, .blockmodal, .combatreviewmodal').count(), 0);
  const creature = page.locator('.myboard .mini.ct-combat-pick').first();
  if (await creature.count()) {
    assert.ok(await creature.evaluate(el => {
      const r = el.getBoundingClientRect(), board = el.closest('.mybattlefieldmain').getBoundingClientRect();
      return Math.min(r.bottom, board.bottom) - Math.max(r.top, board.top) >= r.height * .8;
    }), 'At least 80% of the selectable creature stays in view');
  }
}
try {
  await fixture();
  await shot('desktop-main');
  const main = await page.locator('.promptbar .pbtn.primary').boundingBox();
  assert.ok(main.width <= 185 && main.height <= 44, 'Main action is compact');
  check('Full-width battlefield and compact primary action');
  const targetId = await page.evaluate(() => {
    _ui.pendings = [];
    const candidates = _game.creatures(_game.players[3]);
    window.__targetAnswer = null;
    void _ui.me.controller.decide(_game, {type: 'chooseTargets', candidates, min: 1, max: 1, message: 'Choose a creature'})
      .then(answer => { window.__targetAnswer = answer.map(card => card.iid); });
    return candidates[0].iid;
  });
  await card(targetId).click();
  if (await page.evaluate(() => __targetAnswer === null)) await page.locator('.targetprompt .pbtn.primary').click();
  await page.waitForFunction(() => __targetAnswer !== null);
  assert.deepEqual(await page.evaluate(() => __targetAnswer), [targetId]);
  await fixture();
  await page.evaluate(() => {
    _ui.pendings = []; _ui.prioMode = 'full';
    const spell = __ctPut('Swords to Plowshares', _game.players[1], 'stack');
    _game.stack.push({kind:'spell',name:spell.name,card:spell,ctrl:spell.ctrl,targets:[[_game.creatures(_ui.me)[0]]],castOpts:{}});
    window.__priorityAnswer = null;
    void _ui.me.controller.decide(_game,{type:'priority',player:_ui.me,casts:[],acts:[]})
      .then(answer => { window.__priorityAnswer = answer.kind; });
    _ui.render();
  });
  await page.locator('.actionstage .pbtn.primary').click();
  await page.waitForFunction(() => __priorityAnswer === 'pass');
  check('Target drawer leaves all players reachable; stack review preserves explicit Proceed');
  await fixture();
  let ids = await combat('attackers');
  await visibleAction();
  await card(ids.creatures[0]).focus(); await page.keyboard.press('Enter');
  assert.equal(await confirm().isDisabled(), true, 'Unassigned selected creature cannot be submitted');
  assert.equal(await page.evaluate(() => __combatAnswer), null, 'Keyboard selection never confirms');
  assert.match(await card(ids.creatures[0]).getAttribute('aria-label'), /Selected, choose a defender/, 'Pending and assigned attacks have distinct accessible states');
  assert.equal(await card(ids.creatures[0]).evaluate(node => node.classList.contains('ct-attack-pending')), true);
  assert.match(await page.locator(`[data-combat-defender="player-${ids.opponent}"]`).textContent(), /36 life/, 'Defender choice includes current life');
  assert.match(await page.locator(`[data-combat-defender="card-${ids.walker}"]`).getAttribute('aria-label'), /planeswalker, 6 loyalty/, 'Planeswalker is distinguished from its controller');
  await page.locator(`[data-combat-defender="player-${ids.opponent}"]`).click();
  await card(ids.creatures[1]).click();
  await page.locator(`[data-combat-defender="card-${ids.walker}"]`).click();
  assert.deepEqual(await page.evaluate(() => _ui.pending.sel.map(e => e.target.iid ?? e.target.idx)), [ids.opponent, ids.walker]);
  assert.match(await card(ids.creatures[0]).getAttribute('aria-label'), /Attacking AI Dragon/, 'Assigned attacker announces its defender');
  const assignedPower = await page.evaluate(() => _ui.pending.sel.reduce((sum, entry) => sum + Math.max(0, entry.card.power), 0));
  assert.equal(await page.locator('.ct-combat-copy b').textContent(), `2 attackers · ${assignedPower} power`, 'Attack summary updates after split assignment');
  assert.match(await page.locator(`[data-combat-defender="card-${ids.walker}"] .ct-defender-allocation`).textContent(), /1 ⚔ · 2 power/, 'Each defender shows its assigned attackers and power');
  await page.waitForFunction(() => document.querySelectorAll('.ct-combat-lines path').length === 2, null, {timeout: 5000});
  await shot('desktop-attack');
  await page.getByRole('button', {name:'Details', exact:true}).click();
  await page.locator('[data-testid="show-combat-battlefield"]').click();
  assert.equal(await page.evaluate(() => _ui.pending.sel.length), 2, 'Details retains assignments');
  await confirm().click();
  await page.waitForFunction(() => __combatAnswer !== null);
  assert.equal((await page.evaluate(() => __combatAnswer)).length, 2);
  check('Keyboard and click attacks split between a player and planeswalker; details and confirmation retain both');
  await fixture(); ids = await combat('attackers');
  await page.locator('[data-testid="combat-all-attack"]').click();
  assert.equal(await confirm().isDisabled(), true);
  await page.locator(`[data-combat-defender="player-${ids.opponent}"]`).click();
  assert.equal(await page.evaluate(() => _ui.pending.sel.length), 3);
  await page.locator('[data-testid="combat-clear"]').click();
  assert.equal(await confirm().textContent(), 'No attacks');
  assert.equal(await page.evaluate(() => _ui.arenaDragEnabled), false);
  await drag(card(ids.creatures[0]), card(ids.walker));
  assert.equal(await page.evaluate(() => _ui.pending.sel[0]?.target.iid), ids.walker, 'Combat drag works with ordinary spell dragging off');
  await page.locator('[data-testid="combat-clear"]').click();
  await page.evaluate(() => { _ui.pending.q.forced = [_ui.pending.q.eligible[0]]; _ui.render(); });
  assert.equal(await confirm().isDisabled(), true, 'Forced attacker cannot be skipped');
  check('All attack, clear, and forced-attack confirmation');
  await fixture(); ids = await combat('attackers');
  await page.evaluate(iid => {
    _game.creatures(_ui.me).find(card => card.iid === iid).meta.goadedBy = [_game.players[1]];
    _game.recalc(); _ui.render();
  }, ids.creatures[0]);
  await card(ids.creatures[0]).click();
  assert.equal(await page.locator(`[data-combat-defender="player-${ids.opponent}"]`).isDisabled(), true, 'Goading player cannot receive the selected goaded creature');
  assert.equal(await page.locator(`[data-combat-defender="card-${ids.walker}"]`).isDisabled(), true, 'Planeswalker cannot bypass the goad requirement');
  await page.locator('[data-combat-defender="player-2"]').click();
  assert.equal(await page.evaluate(() => _ui.pending.sel[0].target.idx), 2);
  assert.equal(await page.locator(`[data-combat-defender="player-${ids.opponent}"]`).isDisabled(), false, 'Defender becomes available for other eligible creatures after assignment');
  check('Defender choices explain and respect selected creatures’ attack restrictions');
  await fixture(); ids = await combat('blockers');
  await visibleAction();
  await card(ids.creatures[0]).click();
  await page.locator(`[data-combat-attacker="${ids.attackers[0]}"]`).click();
  assert.equal(await confirm().isDisabled(), true, 'Menace requires two blockers');
  await card(ids.creatures[1]).click();
  await page.locator(`[data-combat-attacker="${ids.attackers[0]}"]`).click();
  assert.equal(await confirm().isDisabled(), false);
  assert.equal(await page.evaluate(() => _ui.blockAssignments().length), 2);
  await card(ids.creatures[2]).click();
  await page.locator(`[data-combat-attacker="${ids.attackers[1]}"]`).click();
  assert.equal(await page.evaluate(() => _ui.blockAssignments().length), 2, 'Ground creature cannot block flying');
  await shot('desktop-block');
  await page.getByRole('button', {name:'Details', exact:true}).click();
  await page.locator('[data-testid="show-combat-battlefield"]').click();
  assert.equal(await page.evaluate(() => _ui.blockAssignments().length), 2);
  await confirm().click();
  await page.waitForFunction(() => Array.isArray(__combatAnswer));
  assert.equal((await page.evaluate(() => __combatAnswer)).length, 2);
  check('Blocker-first selection, menace, flying, retained blocks and exact submitted assignments');
  await fixture(); ids = await combat('blockers');
  const otherAttacker = await page.evaluate(() => {
    const card = __ctPut('Humble Defector', _game.players[1]); card.attacking = _ui.me;
    _ui.pending.q.attackers.push(card); _game.combat.attackers = _ui.pending.q.attackers; _game.recalc(); _ui.render(); return card.iid;
  });
  await drag(card(ids.creatures[0]), page.locator(`[data-combat-attacker="${ids.attackers[0]}"]`));
  await drag(card(ids.creatures[0]), page.locator(`[data-combat-attacker="${otherAttacker}"]`));
  assert.deepEqual(await page.evaluate(() => _ui.blockAssignments().map(pair => pair.attacker.iid)), [otherAttacker]);
  assert.equal(await confirm().isDisabled(), false);
  await confirm().click();
  check('Dragging an assigned blocker moves it to the new legal attacker in one gesture');
  for (const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1280,height:720}]) {
    await page.setViewportSize(viewport); await fixture(); ids = await combat('attackers');
    await visibleAction();
    await card(ids.creatures[0]).tap();
    await page.locator(`[data-combat-defender="player-${ids.opponent}"]`).tap();
    assert.equal(await page.evaluate(() => _ui.pending.sel.length), 1);
    if (viewport.width <= 390) {
      for (const box of await page.locator('.ct-defender-choice').evaluateAll(nodes => nodes.map(node => {
        const r = node.getBoundingClientRect(); return {width: r.width, height: r.height};
      }))) assert.ok(box.width >= 44 && box.height >= 44, 'Every defender has a full touch target');
      await card(ids.creatures[1]).tap();
      const walker = page.locator(`[data-combat-defender="card-${ids.walker}"]`);
      await walker.scrollIntoViewIfNeeded(); await walker.tap();
      assert.deepEqual(await page.evaluate(() => _ui.pending.sel.map(entry => entry.target.iid ?? entry.target.idx)), [ids.opponent, ids.walker], 'A phone can split attacks with the scrolled planeswalker choice');
      assert.equal(await confirm().isDisabled(), false);
      await page.locator(`[data-combat-defender="player-${ids.opponent}"]`).scrollIntoViewIfNeeded();
    }
    await shot(`${viewport.width}-attack`);
    await fixture(); ids = await combat('blockers');
    await visibleAction();
    await card(ids.creatures[0]).tap();
    await page.locator(`[data-combat-attacker="${ids.attackers[0]}"]`).tap();
    await card(ids.creatures[1]).tap();
    await page.locator(`[data-combat-attacker="${ids.attackers[0]}"]`).tap();
    assert.equal(await page.evaluate(() => _ui.blockAssignments().length), 2);
    await shot(`${viewport.width}-block`);
    if (viewport.width === 390) {
      const nav = page.getByRole('navigation', {name: 'Arena view'});
      await nav.getByRole('button', {name: /^Table/i}).tap();
      assert.ok(await page.locator('.opprow:visible').count(), 'Table still opens opponents during combat');
      await nav.getByRole('button', {name: /^Mine/i}).tap();
      assert.equal(await page.evaluate(() => _ui.blockAssignments().length), 2, 'Navigation retains the combat draft');
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No page overflow');
    check(`${viewport.width}×${viewport.height}: touch attack and block controls remain reachable`);
  }
  assert.deepEqual(errors, [], 'No browser errors');
  writeFileSync(`${output}/results.json`, JSON.stringify({ base, checks, errors, failedRequests }, null, 2));
} catch (error) {
  await page.screenshot({path: `${output}/failure.png`});
  writeFileSync(`${output}/failure.json`, JSON.stringify({message: error.message, errors, failedRequests}, null, 2));
  throw error;
} finally { await browser.close(); if(server) server.close(); }
