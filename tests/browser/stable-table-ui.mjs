// Card identity remains accessible while decision drawers preserve the table.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.STABLE_TABLE_OUTPUT || join(tmpdir(), 'mtg-stable-table-ui');
const baseline = process.env.STABLE_TABLE_BASELINE;
let server, base = process.env.GAME_URL;
assert.ok(!base || !baseline, 'Public checks must use deployed code');
mkdirSync(output, {recursive: true});
if (!base) {
  const app = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}));
  if (baseline) app.get('/src/command-table.css', (_request, response) => response.sendFile(baseline));
  server = app.use(express.static(root)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
page.setDefaultTimeout(15000);
const receipt = {target: base, baseline: !!baseline, errors: [], checks: [], geometry: [], sources: []};
const hashes = [], paths = ['src/command-table.css', 'src/modules/command-table.js', 'src/modules/ui.js'];
page.on('pageerror', error => receipt.errors.push(error.message));
page.on('response', response => {
  const path = new URL(response.url()).pathname.slice(1);
  if (paths.includes(path)) hashes.push(response.body().then(body => ({path, status: response.status(),
    sha256: createHash('sha256').update(body).digest('hex')})));
});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

async function fixture() {
  await page.evaluate(() => {
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none';
    document.body.classList.add('game-active');
    const game = new MTG.Game({seed: 10162026, paced: false});
    const ui = new MTG.UI();
    const deckNames = ['Quick Draw', 'Elven Council', 'Squirreled Away', 'Temur Roar'];
    const players = ['You', 'AI Raven', 'AI Wolf', 'AI Dragon'].map((name, index) =>
      game.addPlayer(name, {name: deckNames[index]}, {decide: async () => ({kind: 'pass'})}, index > 0));
    ui.game = game; ui.me = players[0]; ui.commandTableView = 'table'; ui.prioMode = 'full';
    ui.me.controller = ui.controllerFor(ui.me);
    game.turnPlayer = ui.me; game.turnNo = 13; game.phase = 'main1'; game.step = 'main';
    window._game = game; window._ui = ui;
    window.__stablePut = (name, owner, zone = 'battlefield') => {
      if (!MTG.DEFS[name]) throw Error('Missing fixture card: ' + name);
      const card = new MTG.CardInst(MTG.DEFS[name], owner); card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : owner[zone] || []).push(card); return card;
    };
    for (const [index, player] of players.entries()) {
      player.commanders = [__stablePut(MTG.DECKS[deckNames[index]].commander, player, 'command')];
      __stablePut('Riders of Gavony', player).counters['+1/+1'] = 1;
      __stablePut('Humble Defector', player).tapped = true;
      for (const name of ['Sol Ring', 'Plains', 'Island', 'Mountain']) __stablePut(name, player);
    }
    for (const definition of [MTG.TOKENS.clue, MTG.TOKENS.food]) {
      const token = new MTG.CardInst(definition, ui.me); token.zone = 'battlefield'; token.isToken = true;
      game.battlefield.push(token);
    }
    for (const name of ['Counterspell', 'Beast Within', 'Swords to Plowshares', 'Forest']) __stablePut(name, ui.me, 'hand');
    game.recalc();
    window.__stableAnswer = null;
    void ui.me.controller.decide(game, {type: 'main', player: ui.me, phase: game.phase, casts: [], acts: [], lands: []})
      .then(answer => {window.__stableAnswer = answer;});
    ui.render();
  });
  await page.waitForFunction(() => _ui.pending?.q.type === 'main');
}
const geometry = () => page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('#game .opprow, #game .myboard, #game .handwrap')].map((node, index) => {
    const r = node.getBoundingClientRect();
    return [index + ':' + node.classList[0], {x: r.x, y: r.y, width: r.width, height: r.height}];
  })));
const assertGeometry = (before, after, label) => {
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const key of Object.keys(before)) for (const coordinate of ['x', 'y', 'width', 'height'])
    assert.ok(Math.abs(before[key][coordinate] - after[key][coordinate]) <= 1,
      `${label}: ${key} ${coordinate} moved from ${before[key][coordinate]} to ${after[key][coordinate]}`);
};
const screenshot = name => page.screenshot({path: join(output, `${name}.png`)});

try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  for (const width of [1366, 1440, 2048, 390]) {
    await page.setViewportSize({width, height: width === 390 ? 844 : width === 1366 ? 768 : 1000});
    await fixture();
    const before = await geometry();
    const boardCard = page.locator('.myboard .mini').filter({has: page.locator('img[alt="Riders of Gavony"]')}).first();
    const handCard = page.locator('.hand .hcard[data-cname="Counterspell"]');
    const names = await page.locator('.mini > .mname, .hcard > .mname').evaluateAll(nodes => nodes
      .filter(node => getComputedStyle(node).display !== 'none').map(node => node.textContent));
    await page.evaluate(() => {
      _ui.pendings = [];
      const spell = __stablePut('Swords to Plowshares', _game.players[1], 'stack');
      _game.stack.push({kind: 'spell', name: spell.name, card: spell, ctrl: spell.ctrl,
        targets: [[_game.creatures(_ui.me)[0]]], castOpts: {}});
      window.__stableAnswer = null;
      void _ui.me.controller.decide(_game, {type: 'priority', player: _ui.me, casts: [], acts: []})
        .then(answer => {window.__stableAnswer = answer;});
      _ui.render();
    });
    await page.locator('.actionstage .pbtn.primary').waitFor();
    const expanded = await geometry();
    receipt.geometry.push({width, before, expanded, visibleNames: names});
    await screenshot(`review-${width}`);
    if (width > 900) assertGeometry(before, expanded, `${width}px Proceed review`);
    assert.deepEqual(names, [], 'Loaded battlefield and hand art have no repeated name overlays');
    await page.locator('.actionstage .pbtn.primary').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => __stableAnswer?.kind === 'pass');
    await page.evaluate(() => {_game.stack.length = 0; _ui.render();});
    if (width > 900) assertGeometry(before, await geometry(), `${width}px review closed`);
    receipt.checks.push(`${width}px: keyboard Proceed answers the native priority${width > 900 ? '; table geometry stays fixed' : ''}`);

    await fixture();
    if (width > 900) {
      await boardCard.hover();
      await page.locator('#hoverprev:visible img').waitFor();
      assert.equal(await boardCard.getAttribute('aria-label'), 'Riders of Gavony. Open card details.');
      await handCard.hover();
      await page.waitForFunction(() => document.querySelector('#hoverprev img')?.getAttribute('src') === MTG.cardImageURL('Counterspell'));
      await page.mouse.move(0, 0);
    }
    await handCard.focus(); await page.keyboard.press('Enter');
    await page.locator('.sheet').waitFor();
    assert.match(await page.locator('.sheet').innerText(), /Counterspell/);
    await page.keyboard.press('Escape');
    await page.locator('.sheet').waitFor({state: 'detached'});
    await boardCard.click(); await page.locator('.sheet').waitFor();
    assert.match(await page.locator('.sheet').innerText(), /Riders of Gavony/);
    await page.keyboard.press('Escape');
    const utilityBefore = await geometry();
    if (width > 900) await page.getByRole('button', {name: 'Open the stack and table information'}).click();
    else await page.evaluate(() => _ui.openUtility('stack'));
    await page.getByRole('button', {name: 'Close table details'}).waitFor();
    if (width > 900) assertGeometry(utilityBefore, await geometry(), `${width}px table details`);
    await page.getByRole('button', {name: 'Close table details'}).click();
    await page.evaluate(() => {
      const hand = document.querySelector('.hcard[data-cname="Counterspell"] > img');
      MTG.imgFail(hand);
      const permanent = document.querySelector('.myboard .mini[data-cname="Riders of Gavony"] > img');
      MTG.imgFail(permanent); MTG.imgFail(permanent);
    });
    assert.equal(await handCard.locator('.mname').isVisible(), true, 'Placeholder keeps readable hand identity');
    assert.equal(await boardCard.locator('.mname').isVisible(), true, 'Failed art keeps readable battlefield identity');
    assert.equal(await boardCard.locator('.pt').isVisible(), true);
    assert.equal(await boardCard.locator('.cnt').isVisible(), true);
    assert.equal(await page.locator('.myboard .toktag').first().isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    receipt.checks.push(`${width}px: card hover/keyboard/click inspection, table details, art failure names, P/T, counters and token badges`);
    await screenshot(`fallback-${width}`);
  }
  for (const width of [1366, 1440, 2048]) {
    await page.setViewportSize({width, height: width === 1366 ? 768 : 1000});
    await fixture();
    await page.getByRole('button', {name: 'Focus', exact: true}).click();
    const before = await geometry();
    await page.evaluate(() => {
      _ui.pendings = [];
      const spell = __stablePut('Swords to Plowshares', _game.players[1], 'stack');
      _game.stack.push({kind: 'spell', name: spell.name, card: spell, ctrl: spell.ctrl, targets: [], castOpts: {}});
      window.__stableAnswer = null;
      void _ui.me.controller.decide(_game, {type: 'priority', player: _ui.me, casts: [], acts: []})
        .then(answer => {window.__stableAnswer = answer;});
      _ui.render();
    });
    await page.locator('.actionstage .pbtn.primary').waitFor();
    const expanded = await geometry();
    receipt.geometry.push({width, view: 'focus', before, expanded});
    assertGeometry(before, expanded, `${width}px Focus Proceed review`);
    await page.locator('.actionstage .pbtn.primary').click();
    await page.waitForFunction(() => __stableAnswer?.kind === 'pass');
    await page.evaluate(() => {_game.stack.length = 0; _ui.render();});
    assertGeometry(before, await geometry(), `${width}px Focus review closed`);
    receipt.checks.push(`${width}px: Focus layout also stays fixed while opening and closing Proceed`);
  }
  await page.setViewportSize({width: 1366, height: 768});
  await fixture();
  await page.evaluate(() => {
    _ui.pendings = []; _game.phase = 'combat'; _game.step = 'attackers';
    _game.combat = {attackers: [], defenders: new Map()};
    window.__stableAnswer = null;
    void _ui.me.controller.decide(_game, {type: 'attackers', eligible: _game.creatures(_ui.me),
      opponents: _game.players.slice(1), attackTargets: _game.players.slice(1), forced: []})
      .then(answer => {window.__stableAnswer = answer;});
    _ui.render();
  });
  await page.locator('#game.ct-battlefield-combat').waitFor();
  const combatBefore = await geometry();
  await page.getByRole('button', {name: 'Open the stack and table information'}).click();
  assertGeometry(combatBefore, await geometry(), '1366×768 combat table details');
  await page.getByRole('button', {name: 'Close table details'}).click();
  assertGeometry(combatBefore, await geometry(), '1366×768 combat table details closed');
  await page.getByRole('button', {name: /^No attacks/}).click();
  await page.waitForFunction(() => Array.isArray(__stableAnswer));
  assert.deepEqual(await page.evaluate(() => __stableAnswer), []);
  receipt.checks.push('1366×768: combat table details preserves geometry and the native No attacks action');
  receipt.sources = await Promise.all(hashes);
  if (!baseline) for (const path of paths) assert.ok(receipt.sources.some(source => source.path === path && source.status === 200 &&
    source.sha256 === createHash('sha256').update(readFileSync(join(root, path))).digest('hex')), `${path} matches tested source`);
  assert.deepEqual(receipt.errors, []);
  writeFileSync(join(output, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({checks: receipt.checks, errors: receipt.errors}));
} catch (error) {
  await screenshot('failure');
  writeFileSync(join(output, 'failure.json'), JSON.stringify({...receipt, message: error.message}, null, 2) + '\n');
  throw error;
} finally {
  await browser.close(); if (server) server.close();
}
