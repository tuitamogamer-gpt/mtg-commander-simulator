// Card effects appear beside their cards: a routine resolution recap next to
// the permanent (or board) it changed, activity notices as card callouts.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/populated-resource-board.js', import.meta.url), 'utf8');
const output = process.env.EFFECT_ANCHORS_OUTPUT || `${root}output/web-game/effect-anchors`;
mkdirSync(output, {recursive: true});
const server = express().use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'no-preference'});
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));

// A minor recap as resolution-recap.js sends it, anchored to an opponent's land.
const openRecap = ({anchored = true, player = 1, major = false} = {}) => page.evaluate(({anchored, player, major}) => {
  const owner = _game.players[player], land = _game.lands(owner).find(card => card.name === 'Island');
  const view = card => ({name: card.name, faceDown: false, types: card.def.types.slice()});
  const row = {card: view(land), text: `${owner.name}: Island → battlefield, tapped.`};
  const recap = {name: 'Evolving Wilds', source: {name: 'Evolving Wilds', faceDown: false, types: ['Land']}, controllerName: owner.name,
    combat: false, details: [], changes: [], players: [], damage: [], prevented: [], totalDamage: 0, stack: [], queued: [], gameOver: false,
    impact: {level: major ? 'major' : 'minor', headline: 'Land found', stats: []}, summary: 'Here is what the search found.',
    searches: [row], highlights: [row], anchor: {playerIdx: owner.idx, iids: anchored ? [land.iid] : []}};
  window.__answers = [];
  _ui.me.controller.decide(_game, {type: 'effectReview', effectKind: 'resolutionRecap', player: _ui.me, source: recap.source, prompt: recap.name, recap})
    .then(answer => __answers.push(answer ?? null));
  return land.iid;
}, {anchored, player, major});
const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const geometry = iid => page.evaluate(iid => {
  const modal = document.querySelector('.resolutionrecapoverlay .modal').getBoundingClientRect();
  const card = iid == null ? null : document.querySelector(`#game .mini[data-iid="${iid}"]`).getBoundingClientRect();
  const ring = document.querySelector('.effectanchorring')?.getBoundingClientRect();
  return {anchored: !!document.querySelector('.resolutionrecapoverlay.effectanchored'), modal: modal.toJSON(), card: card?.toJSON(),
    ring: ring?.toJSON() || null, fits: modal.left >= 0 && modal.top >= 0 && modal.right <= innerWidth && modal.bottom <= innerHeight,
    header: document.querySelector('#game .arenaheader')?.getBoundingClientRect().bottom || 0};
}, iid);

try {
  await page.addInitScript(() => { localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '0'); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});

  await page.addScriptTag({content: fixture});
  await page.mouse.move(0, 0);
  let iid = await openRecap();
  await frames();
  let g = await geometry(iid);
  assert.ok(g.anchored && g.fits, JSON.stringify(g));
  assert.ok(g.modal.left >= g.card.right - 1 || g.modal.right <= g.card.left + 1, `the panel sits beside the card: ${JSON.stringify(g)}`);
  assert.ok(g.modal.top >= g.header - 1, 'the turn tracker stays visible');
  assert.ok(g.ring && g.ring.left <= g.card.left && g.ring.right >= g.card.right && g.ring.top <= g.card.top && g.ring.bottom >= g.card.bottom, 'the card is outlined');
  await page.evaluate(() => { _game.lg('An incidental event.', 'ability'); _ui.render(); });
  await frames();
  assert.deepEqual(await geometry(iid), g, 'renders keep the panel in place');
  await page.screenshot({path: `${output}/recap-beside-card.png`});
  await page.locator('.resolutionrecapproceed').click();
  await page.waitForFunction(() => __answers.length === 1);
  assert.equal(await page.locator('.resolutionrecapoverlay, .effectanchorring').count(), 0);
  console.log('PASS a routine recap opens beside the permanent it changed and Proceed answers once');

  await openRecap({anchored: false, player: 3});
  await frames();
  g = await geometry(null);
  const board = await page.locator('#game .opprow[data-player-id="3"]').boundingBox();
  assert.ok(g.anchored && g.ring === null, JSON.stringify(g));
  assert.ok(g.modal.left >= board.x - 1 && g.modal.right <= board.x + board.width + 1 && g.modal.top >= board.y - 1, `inside the player's board: ${JSON.stringify({g, board})}`);
  await page.locator('.resolutionrecapproceed').click();
  await page.waitForFunction(() => __answers.length === 1);
  console.log('PASS without a visible card the recap sits on its controller\'s board');

  await openRecap({major: true});
  await frames();
  assert.equal(await page.locator('.resolutionrecapoverlay.recapmajor').count(), 1);
  assert.equal(await page.locator('.resolutionrecapoverlay.effectanchored').count(), 0, 'a table highlight keeps its central spotlight');
  await page.locator('.resolutionrecapproceed').click();
  await page.waitForFunction(() => __answers.length === 1);
  console.log('PASS a major result keeps the central spotlight');

  await page.evaluate(() => {
    window.__noticeCard = _game.creatures(_game.players[1])[0];
    _ui.showEffectNotice(`◆ ${__noticeCard.name} enters with 2 +1/+1 counters.`, 'counter', {card: __noticeCard});
    _ui.showEffectNotice('A notice without a card.', 'effect', {});
  });
  await page.waitForTimeout(300); // measure after the short entry animation
  const callout = await page.evaluate(() => {
    const card = __noticeCard;
    // Layout box, not the transformed entry animation (1440px runs unzoomed).
    const element = document.querySelector(`.effectcallout[data-iid="${card.iid}"]`);
    const bubble = element && {left: element.offsetLeft, top: element.offsetTop,
      right: element.offsetLeft + element.offsetWidth, bottom: element.offsetTop + element.offsetHeight};
    const r = document.querySelector(`#game .mini[data-iid="${card.iid}"]`).getBoundingClientRect();
    return {bubble, card: r.toJSON(), corner: !!document.querySelector('.effectnoticestack .effectnotice'),
      text: document.querySelector('.effectcallout span')?.textContent, hidden: document.querySelector('.effectcalloutlayer')?.getAttribute('aria-hidden')};
  });
  assert.ok(callout.bubble && callout.corner && callout.hidden === 'true', JSON.stringify(callout));
  const near = Math.min(Math.abs(callout.bubble.left - callout.card.right), Math.abs(callout.card.left - callout.bubble.right),
    Math.abs(callout.bubble.top - callout.card.bottom), Math.abs(callout.card.top - callout.bubble.bottom));
  assert.ok(near <= 20, `the callout sits beside its card: ${JSON.stringify(callout)}`);
  await page.screenshot({path: `${output}/callout.png`});
  console.log('PASS activity notices with a card become callouts beside it; others keep the corner');

  const stack = await page.evaluate(async () => {
    const owner = _game.players[1], source = _game.creatures(owner)[0];
    _game.stack.push({kind: 'trigger', name: `${source.name} — draw a card`, srcCard: source, card: source, ctrl: owner, targets: []});
    _ui.render();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rail = document.querySelector('.ct-decision-rail').getBoundingClientRect();
    const ring = document.querySelector('.effectanchorring.stackanchor')?.getBoundingClientRect();
    const card = document.querySelector(`#game .mini[data-iid="${source.iid}"]`).getBoundingClientRect();
    const trigger = {ring: !!ring && ring.left <= card.left && ring.right >= card.right && ring.top <= card.top && ring.bottom >= card.bottom,
      railRight: rail.right > innerWidth - 40};
    _game.stack.pop();
    const spell = new MTG.CardInst(MTG.DEFS.Counterspell, owner); spell.zone = 'stack';
    _game.stack.push({kind: 'spell', name: 'Counterspell', card: spell, ctrl: owner, targets: []});
    _ui.render();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const headRect = document.querySelector(`#game .opprow[data-player-id="${owner.idx}"] .opphead`).getBoundingClientRect();
    const spellRing = document.querySelector('.effectanchorring.stackanchor')?.getBoundingClientRect();
    const caster = !!spellRing && spellRing.left <= headRect.left && spellRing.right >= headRect.right;
    _game.stack.pop();
    const mine = new MTG.CardInst(MTG.DEFS.Counterspell, _ui.me); mine.zone = 'stack';
    _game.stack.push({kind: 'spell', name: 'Counterspell', card: mine, ctrl: _ui.me, targets: []});
    _ui.render();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const own = document.querySelectorAll('.stackanchor').length;
    _game.stack.pop(); _ui.render();
    return {...trigger, caster, own};
  });
  assert.deepEqual(stack, {ring: true, railRight: true, caster: true, own: 0}, JSON.stringify(stack));
  console.log('PASS the stable Stack rail points at an opponent\'s source card or caster, not at your own objects');

  await page.setViewportSize({width: 390, height: 844});
  await page.addScriptTag({content: fixture});
  await openRecap();
  await frames();
  assert.equal(await page.locator('.resolutionrecapoverlay.effectanchored').count(), 0, 'phones keep their sheet');
  await page.locator('.resolutionrecapproceed').click();
  await page.waitForFunction(() => __answers.length === 1);
  console.log('PASS phones keep the original recap sheet');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
