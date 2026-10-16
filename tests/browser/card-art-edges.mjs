// Full card art fits its frame while compact public controls leave the board visible.
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
const output = process.env.CARD_ART_OUTPUT || join(tmpdir(), 'mtg-card-art-edges');
const baseline = process.env.CARD_ART_BASELINE;
let server, base = process.env.GAME_URL;
assert.ok(!base || !baseline, 'Public checks must use deployed code');
mkdirSync(output, {recursive: true});
if (!base) {
  const app = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}));
  if (baseline) for (const [url, file] of [['/src/command-table.css', 'baseline-command-table.css'], ['/src/modules/command-table.js', 'baseline-command-table.js']]) app.get(url, (_request, response) => response.sendFile(join(baseline, file)));
  server = app.use(express.static(root)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'});
page.setDefaultTimeout(15000);
const receipt = {target: base, baseline: !!baseline, errors: [], checks: [], geometry: [], sources: [], failures: [], art: [], headers: []};
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
      const damaged = __stablePut('Riders of Gavony', player); damaged.counters['+1/+1'] = 1; damaged.damage = 1;
      __stablePut('Humble Defector', player).tapped = true;
      for (const name of ['Sol Ring', 'Plains', 'Island', 'Mountain']) __stablePut(name, player).tapped = name !== 'Sol Ring';
    }
    for (const definition of [MTG.TOKENS.clue, MTG.TOKENS.food]) {
      const token = new MTG.CardInst(definition, ui.me); token.zone = 'battlefield'; token.isToken = true;
      game.battlefield.push(token);
    }
    for (const name of ['Counterspell', 'Beast Within', 'Swords to Plowshares', 'Forest']) __stablePut(name, ui.me, 'hand');
    players[1].afcCompletedDungeons = 1;
    __stablePut("Herald's Horn", players[1]).meta.chosenType = 'Human';
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


const check = (condition, label) => { if (!condition) receipt.failures.push(label); };
const artMetrics = () => page.locator('.mini > img, .hcard > img').evaluateAll(images => images
  .filter(img => img.getBoundingClientRect().width && img.complete && img.naturalWidth > 100 && !img.classList.contains('imgfail'))
  .map(img => {
    const card = img.parentElement, css = getComputedStyle(img), cc = getComputedStyle(card);
    const iw = parseFloat(css.width), ih = parseFloat(css.height);
    const renderedHeight = css.objectFit === 'contain' ? Math.min(ih, iw * img.naturalHeight / img.naturalWidth) : ih;
    const renderedWidth = css.objectFit === 'contain' ? Math.min(iw, ih * img.naturalWidth / img.naturalHeight) : iw;
    const contentHeight = card.clientHeight - parseFloat(cc.paddingTop) - parseFloat(cc.paddingBottom);
    const contentWidth = card.clientWidth - parseFloat(cc.paddingLeft) - parseFloat(cc.paddingRight);
    return {name: img.alt, hand: card.classList.contains('hcard'), land: card.classList.contains('ct-land-card'),
      width: contentWidth, height: contentHeight, renderedWidth, renderedHeight,
      gapY: contentHeight - renderedHeight, gapX: contentWidth - renderedWidth,
      fit: css.objectFit, ratio: img.naturalWidth / img.naturalHeight,
      frame: getComputedStyle(card, '::before').display};
  }));
const assertArt = async width => {
  const rows = await artMetrics(); receipt.art.push({width, cards: rows});
  check(rows.some(row => row.hand), `${width}: loaded hand art`);
  if (width !== '390 full hand') check(rows.some(row => !row.hand && !row.land), `${width}: loaded battlefield art`);
  if (width > 900) check(rows.some(row => row.land), `${width}: loaded land art`);
  for (const row of rows) {
    check(Math.abs(row.gapY) <= 1 && Math.abs(row.gapX) <= 1, `${width}: ${row.name} leaves ${row.gapY.toFixed(2)}px / ${row.gapX.toFixed(2)}px of bare frame`);
    check(Math.abs(row.renderedWidth / row.renderedHeight - row.ratio) < .005, `${width}: ${row.name} artwork is not cropped or stretched`);
  }
};
try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  for (const width of [2048, 1366, 390]) {
    await page.setViewportSize({width, height: width === 390 ? 844 : width === 1366 ? 768 : 1181});
    await fixture();
    await page.waitForFunction(() => [...document.querySelectorAll('.myboard .mini > img, .hcard > img')]
      .filter(img => img.getBoundingClientRect().width).every(img => img.complete && img.naturalWidth > 100));
    await page.mouse.move(0, 0);
    await screenshot(`table-${width}`);
    await assertArt(width);
    const damaged = await page.locator('.myboard .mini.has-marked-damage').first().boundingBox();
    check(damaged.width < 200, `${width}: damage does not expand to intrinsic image width`);
    check(await page.locator('.myboard .markeddamage').first().isVisible(), `${width}: marked damage remains readable`);
    if (width > 900) {
      const tapped = page.locator('.opprow[data-player-id="1"] .ct-land-card.tapped').first();
      check(await tapped.count() === 1, `${width}: tapped land rendered`);
      check(/Tapped/.test(await tapped.getAttribute('aria-label')), `${width}: tapped state remains accessible`);
      check(await tapped.evaluate(node => getComputedStyle(node).transform !== 'none'), `${width}: tapped card remains rotated`);
      check(await tapped.locator('.ct-land-state').isVisible() === false, `${width}: no printed Tapped land label`);
      const header = await page.locator('.opprow[data-player-id="1"]').evaluate(row => {
        const rect = node => {const r = node.getBoundingClientRect(); return {top:r.top, bottom:r.bottom, height:r.height, width:r.width};};
        return {head:rect(row.querySelector('.opphead')), dock:rect(row.querySelector('.ct-resource-dock')),
          cards:[...row.querySelectorAll('.oppboardmain .mini')].map(node => ({name:node.dataset.cname, ...rect(node)})),
          dungeon:rect(row.querySelector('.dungeonbadge')), effects:rect(row.querySelector('.playereffectsbadge'))};
      });
      receipt.headers.push({width, ...header});
      check(header.dungeon.height >= 24, `${width}: dungeon remains a visible usable button`);
      for (const card of header.cards) check(card.top >= header.head.bottom && card.bottom <= header.dock.top + 1,
        `${width}: ${card.name} is fully visible between header and land dock`);
      const before = await geometry();
      await page.getByRole('button', {name: "Open AI Raven's dungeon map", exact:true}).click();
      await page.locator('.dungeonmodal:visible').waitFor();
      assert.match(await page.locator('.dungeonmodal').innerText(), /AI Raven's dungeons/);
      await screenshot(`dungeon-${width}`);
      await page.keyboard.press('Escape');
      await page.locator('.dungeonoverlay').waitFor({state:'detached'});
      assertGeometry(before, await geometry(), `${width}: closing Dungeon`);
      check(await page.evaluate(() => _ui.pending?.q.type === 'main'), `${width}: dungeon preserves pending decision`);
      const boardCard = page.locator('.myboard .mini[data-cname="Riders of Gavony"]');
      await boardCard.hover(); await page.locator('#hoverprev:visible img').waitFor();
      await page.mouse.move(0, 0);
      await boardCard.click(); await page.locator('.sheet').waitFor();
      assert.match(await page.locator('.sheet').innerText(), /Riders of Gavony/);
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        _ui.pendings = [];
        const spell = __stablePut('Swords to Plowshares', _game.players[1], 'stack');
        _game.stack.push({kind:'spell', name:spell.name, card:spell, ctrl:spell.ctrl, targets:[], castOpts:{}});
        void _ui.me.controller.decide(_game, {type:'priority', player:_ui.me, casts:[], acts:[]}).then(answer => {__stableAnswer = answer;});
        _ui.render();
      });
      await page.locator('.actionstage .pbtn.primary').waitFor();
      assertGeometry(before, await geometry(), `${width}: Proceed review`);
      await page.locator('.actionstage .pbtn.primary').click();
      await page.waitForFunction(() => __stableAnswer?.kind === 'pass');
      receipt.checks.push(`${width}: full art, tapped identity/rotation, Dungeon open/close, hover/click, stable Proceed`);
    } else {
      const handCard = page.locator('.hand .hcard[data-cname="Counterspell"]');
      await handCard.focus(); await page.keyboard.press('Enter'); await page.locator('.sheet').waitFor();
      assert.match(await page.locator('.sheet').innerText(), /Counterspell/); await page.keyboard.press('Escape');
      await page.locator('.handexpand').click();
      await page.locator('#game[data-mobile-view="hand"]').waitFor();
      await assertArt('390 full hand');
      await page.locator('.mobileviewtab[data-view="mine"]').click();
      receipt.checks.push('390: full art and expanded hand, keyboard inspection, no viewport overflow');
    }
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: no viewport overflow`);
    await page.evaluate(() => {
      const card = document.querySelector('.myboard .mini[data-cname="Riders of Gavony"] > img');
      MTG.imgFail(card); MTG.imgFail(card);
      MTG.imgFail(document.querySelector('.hcard[data-cname="Counterspell"] > img'));
    });
    check(await page.locator('.myboard .mini[data-cname="Riders of Gavony"] .mname').isVisible(), `${width}: failed battlefield art retains name`);
    check(await page.locator('.hcard[data-cname="Counterspell"] .mname').isVisible(), `${width}: placeholder retains hand name`);
    check(await page.locator('.myboard .mini[data-cname="Riders of Gavony"] .pt').isVisible(), `${width}: P/T remains visible`);
    check(await page.locator('.myboard .mini[data-cname="Riders of Gavony"] .cnt').isVisible(), `${width}: counters remain visible`);
  }
  await page.setViewportSize({width:1366, height:768}); await fixture();
  await page.evaluate(() => {
    const card = __stablePut('Willbender', _game.players[1]); card.faceDown = true;
    _game.recalc(); _ui.render();
    const token = document.querySelector('.myboard .mini > img[data-token-art]');
    if (token) MTG.tokenArtFailed(token);
  });
  const concealed = page.locator('.opprow .mini.facedown').first();
  const hidden = await concealed.boundingBox();
  check(hidden.height > hidden.width * 1.3, 'Face-down cards keep their full card frame');
  check(!(await concealed.getAttribute('aria-label')).includes('Willbender'), 'Face-down identity stays private');
  const token = page.locator('.myboard .mini').filter({has:page.locator('.tokenface:not([hidden])')}).first();
  check(await token.count() === 1, 'Failed token art has its characteristics fallback');
  if (await token.count()) {const bounds=await token.boundingBox(); check(bounds.height > bounds.width * 1.3, 'Token fallback keeps full card height');}
  receipt.checks.push('Face-down privacy and failed token fallback keep their card dimensions');
  await fixture();
  const targetCard = page.locator('.myboard .mini[data-cname="Riders of Gavony"]');
  await page.evaluate(() => {
    _ui.pendings = []; window.__artTargetAnswer = null;
    void _ui.me.controller.decide(_game, {type:'chooseTargets', player:_ui.me,
      candidates:_game.creatures(_ui.me), min:1, max:2, message:'Choose up to two creatures'})
      .then(answer => {__artTargetAnswer = answer.map(card => card.iid);});
    _ui.render();
  });
  const unselected = await targetCard.evaluate(node => ({width:node.offsetWidth, height:node.offsetHeight}));
  await targetCard.click(); await page.locator('.myboard .mini.target-selected').waitFor();
  const selected = await targetCard.evaluate(node => ({width:node.offsetWidth, height:node.offsetHeight}));
  receipt.geometry.push({selection:{unselected,selected}});
  check(Math.abs(selected.width - unselected.width) <= 1, 'Selecting a damaged creature preserves card width');
  check(await targetCard.locator('.targetorderbadge').isVisible(), 'Selected target retains its visible order badge');
  await page.locator('.promptbar .pbtn.primary:visible:not(:disabled)').click();
  await page.waitForFunction(() => __artTargetAnswer?.length === 1);
  receipt.checks.push('Native target selection preserves damaged card size, order badge and confirmation');

  receipt.sources = await Promise.all(hashes);
  if (!baseline) for (const path of paths) assert.ok(receipt.sources.some(source => source.path === path && source.status === 200 &&
    source.sha256 === createHash('sha256').update(readFileSync(join(root, path))).digest('hex')), `${path} matches tested source`);
  assert.deepEqual(receipt.errors, []);
  writeFileSync(join(output, 'result.json'), JSON.stringify(receipt, null, 2) + '\n');
  assert.deepEqual(receipt.failures, []);
  console.log(JSON.stringify({checks:receipt.checks, cards:receipt.art.map(row => [row.width,row.cards.length]), errors:receipt.errors}));
} catch (error) {
  await screenshot('failure');
  writeFileSync(join(output, 'failure.json'), JSON.stringify({...receipt, message:error.message}, null, 2) + '\n');
  throw error;
} finally {
  await browser.close(); if (server) server.close();
}
