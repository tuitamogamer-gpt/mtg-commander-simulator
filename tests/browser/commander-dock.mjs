// Exercise the real commander controls, responsive layout and zone transitions.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/populated-resource-board.js', import.meta.url), 'utf8');
const output = process.env.COMMANDER_DOCK_OUTPUT || `${root}output/web-game/commander-dock`;
mkdirSync(output, {recursive: true});
const server = express().use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'no-preference'});
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function settle() {
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => document.getAnimations().every(animation =>
    animation.effect?.getTiming().iterations === Infinity || ['finished', 'idle'].includes(animation.playState)));
}
async function geometry(label) {
  await settle();
  const result = await page.evaluate(() => {
    const dock = document.querySelector('.ct-commander-dock').getBoundingClientRect();
    const hand = document.querySelector('.hand').getBoundingClientRect();
    const controls = [...document.querySelectorAll('.ct-commander-card, .handtools select, .handexpand')]
      .filter(el => el.getClientRects().length);
    return {dock: dock.toJSON(), hand: hand.toJSON(), pageFits: document.documentElement.scrollWidth <= innerWidth,
      controls: controls.map(el => {
        const r = el.getBoundingClientRect();
        return {name: el.className, reachable: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))};
      }), cards: [...document.querySelectorAll('.ct-commander-card .czinfo')].map(el => el.getBoundingClientRect().toJSON())};
  });
  const cardsFit = result.cards.every(r => r.bottom <= result.dock.bottom + 1 && r.left >= result.dock.left && r.right <= result.dock.right);
  assert.ok(result.dock.right < result.hand.left, `${label}: separate left commander and right hand ${JSON.stringify(result)}`);
  if (!cardsFit) await page.screenshot({path: `${output}/failure.png`});
  assert.ok(cardsFit && result.pageFits && result.controls.every(item => item.reachable), `${label}: ${JSON.stringify(result)}`);
}
async function closeSheet() { await page.evaluate(() => { _ui.sheet = null; _ui.render(); }); }

try {
  await page.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '0');
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 60000});
  const sizes = [[1440, 900], [1280, 720], [390, 844], [320, 568], [844, 390]];
  for (const [width, height] of sizes.filter(([width]) => !process.env.DOCK_WIDTH || width === Number(process.env.DOCK_WIDTH))) {
    await page.setViewportSize({width, height});
    await page.addScriptTag({content: fixture});
    await geometry(`${width}x${height}`);
    const commander = page.locator('.ct-commander-card').first();
    if (width > 900) {
      await commander.hover();
      const preview = await page.evaluate(() => {
        const element = document.getElementById('hoverprev');
        return {shown: element?.style.display === 'block', image: !!element?.querySelector('img')?.getAttribute('src')};
      });
      assert.deepEqual(preview, {shown: true, image: true}, 'hovering the commander shows its large card preview');
      await page.mouse.move(0, 0);
    }
    await commander.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => _ui.sheet?.card === _ui.me.commanders[0]), true, 'keyboard opens original commander actions');
    await closeSheet();
    const retained = await page.evaluate(async () => {
      const card = document.querySelector('.ct-commander-card');
      const image = card.querySelector('img');
      const animation = card.getAnimations({subtree: true}).find(a => a.animationName === 'ct-command-aura');
      card.focus();
      _game.lg('Another public game event.', 'ability'); _ui.render();
      await new Promise(resolve => requestAnimationFrame(resolve));
      return card.isConnected && image.isConnected && document.activeElement === card &&
        card === document.querySelector('.ct-commander-card') &&
        animation === card.getAnimations({subtree: true}).find(a => a.animationName === 'ct-command-aura');
    });
    assert.equal(retained, true, 'refresh retains the connected commander control, image, focus and aura');
    await page.evaluate(() => document.activeElement.blur());
    await settle();
    await page.screenshot({path: `${output}/${width}.png`});

    await page.evaluate(() => {
      const card = new MTG.CardInst(MTG.DEFS['Kraum, Ludevic\'s Opus'], _ui.me);
      card.zone = 'command'; card.commander = true;
      _ui.me.command.push(card); _ui.me.commanders.push(card);
      _ui.me.emblems.push({ring: true, level: 2});
      _ui.render();
    });
    assert.equal(await page.locator('.ct-commander-card').count(), 2);
    await geometry(`${width}x${height} partners and Ring`);
    await page.locator('.ct-commander-card').nth(1).click();
    assert.equal(await page.evaluate(() => _ui.sheet?.card === _ui.me.commanders[1]), true);
    await closeSheet();
    await page.locator('.ct-command-extras .ringcard').click();
    assert.match(await page.evaluate(() => _ui.sheet?.custom?.title), /Ring: level 2/);
    await closeSheet();
    await page.screenshot({path: `${output}/${width}-partners.png`});

    if (width <= 900) {
      await page.locator('.handexpand').click();
      await geometry(`${width}x${height} full hand`);
      const last = page.locator('.hand .hcard').last();
      await last.scrollIntoViewIfNeeded(); await last.click();
      assert.equal(await page.evaluate(() => _ui.sheet?.card === _ui.me.hand.at(-1)), true);
      await closeSheet();
      await page.locator('.handexpand').click();
    }
    await page.evaluate(() => {
      const card = new MTG.CardInst(MTG.DEFS['Counterspell'], _ui.me);
      card.zone = 'exile'; card.meta.foretold = true; _ui.me.exile.push(card);
      for (let i = 0; i < 14; i++) {
        const extra = new MTG.CardInst(MTG.DEFS['Island'], _ui.me);
        extra.zone = 'hand'; _ui.me.hand.push(extra);
      }
      _ui.render();
    });
    await geometry(`${width}x${height} long hand and exile`);
    await page.locator('.hand').evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.locator('.hand .hcard').last().click();
    assert.equal(await page.evaluate(() => _ui.sheet?.card === _ui.me.hand.at(-1)), true);
    await closeSheet();
    const beforeEmpty = await page.locator('.handwrap').boundingBox();
    await page.evaluate(() => { _ui.me.hand.length = 0; _ui.me.exile.length = 0; _ui.render(); });
    await geometry(`${width}x${height} empty hand`);
    const afterEmpty = await page.locator('.handwrap').boundingBox();
    assert.equal(afterEmpty.height, beforeEmpty.height, 'empty hand keeps the commander panel stable');
    await page.evaluate(() => { _ui.handSize = 'large'; _ui.render(); });
    await geometry(`${width}x${height} large-card preference`);
    console.log(`PASS commander dock, partners, Ring, empty/long hand and controls ${width}x${height}`);
  }

  await page.setViewportSize({width: 1440, height: 900});
  await page.addScriptTag({content: fixture});
  await page.evaluate(() => {
    // Isolate the cast from the crowded-board fixture's unrelated permanents.
    _game.battlefield.length = 0;
    _ui.me.hand.length = 0;
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) _ui.me.pool[color] = 0;
    Object.assign(_ui.me.pool, {W: 1, U: 1, B: 1, C: 2});
    _ui.me.commanders[0].commander = true;
    _game.recalc();
    // Pause at the Stack checkpoint; resolve it explicitly below.
    _game.priorityRound = async () => {};
    _ui.pendings = [];
    void _ui.me.controller.decide(_game, {type: 'main', player: _ui.me,
      casts: _game.castableList(_ui.me), acts: [], lands: []}).then(answer => { window.__dockAnswer = answer; });
    _ui.render();
  });
  await page.locator('.ct-commander-card').click();
  await page.locator('.sheet .pbtn').filter({hasText: /^Cast/}).first().click();
  await page.waitForFunction(() => window.__dockAnswer?.kind === 'cast');
  assert.equal(await page.evaluate(() => __dockAnswer.card === _ui.me.commanders[0] && __dockAnswer.from === 'command'), true);
  const beforeCast = await page.locator('.ct-commander-dock').boundingBox();
  await page.evaluate(() => {
    const answer = __dockAnswer;
    void _game.castSpell(_ui.me, answer.card, {from: answer.from}).then(result => {
      window.__dockCastResult = result; _ui.render();
    });
  });
  await page.waitForFunction(() => window.__dockCastResult !== undefined);
  assert.equal(await page.evaluate(() => __dockCastResult), true);
  assert.equal(await page.locator('.ct-commander-card').getAttribute('data-command-state'), 'away');
  assert.match(await page.locator('.ct-command-location').innerText(), /stack/);
  assert.equal(await page.locator('.ct-commander-card > img').evaluate(el => getComputedStyle(el).transform), 'none');
  assert.deepEqual(await page.locator('.ct-commander-dock').boundingBox(), beforeCast, 'casting does not move or resize the dock');
  await page.evaluate(() => { void _game.resolveTop().then(() => { window.__dockResolved = true; _ui.render(); }); });
  await page.waitForFunction(() => window.__dockResolved);
  assert.match(await page.locator('.ct-command-location').innerText(), /battlefield/);
  await page.evaluate(() => {
    const card = _ui.me.commanders[0];
    _game.battlefield.splice(_game.battlefield.indexOf(card), 1);
    card.zone = 'command'; _ui.me.command.push(card); _ui.render();
  });
  assert.equal(await page.locator('.ct-commander-card').getAttribute('data-command-state'), 'command');
  assert.match(await page.locator('.ct-commander-card .tax').innerText(), /tax \+2/);
  await settle();
  assert.notEqual(await page.locator('.ct-commander-card > img').evaluate(el => getComputedStyle(el).transform), 'none');
  await page.emulateMedia({reducedMotion: 'reduce'});
  assert.equal(await page.locator('.ct-commander-card > img').evaluate(el => getComputedStyle(el).transform), 'none');
  assert.equal(await page.locator('.ct-commander-card').evaluate(el => getComputedStyle(el, '::before').animationName), 'none');
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.evaluate(() => document.body.classList.add('reduced-motion'));
  assert.equal(await page.locator('.ct-commander-card > img').evaluate(el => getComputedStyle(el).transform), 'none');
  assert.equal(await page.locator('.ct-commander-card').evaluate(el => getComputedStyle(el, '::before').animationName), 'none');
  console.log('PASS real command-zone cast, Stack/battlefield states, return tax and both reduced-motion preferences');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(await page.evaluate(() => ({pending: _ui?.pending?.q?.type, text: document.querySelector('.promptbar')?.textContent,
    commander: _ui?.me?.commanders?.[0]?.zone})));
  throw error;
} finally {
  await browser.close(); server.close();
}
