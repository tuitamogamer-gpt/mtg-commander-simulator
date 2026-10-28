// Presentation-only attack/instant effects must never interrupt a decision.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/populated-resource-board.js', import.meta.url), 'utf8');
const output = process.env.ACTION_EFFECTS_OUTPUT || `${root}output/web-game/action-effects`;
mkdirSync(output, {recursive: true});
const server = express().use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'no-preference'});
page.setDefaultTimeout(15000);
const receipt = {checks: [], errors: []};
page.on('pageerror', error => receipt.errors.push(error.message));
const check = name => { receipt.checks.push(name); console.log(`PASS ${name}`); };

async function frames() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
}
async function clean() {
  await page.waitForFunction(() => !document.querySelector('.actionfx-attack, .actionfx-instant'), undefined, {timeout: 2000});
}
async function prepare(width, height) {
  await clean();
  await page.setViewportSize({width, height});
  await page.mouse.move(0, 0);
  await page.addScriptTag({content: fixture});
  await page.evaluate(() => {
    window.__attack = () => ({type: 'combat', kind: 'attackersDeclared', count: 3, player: _ui.me,
      attacks: _game.creatures(_ui.me).slice(0, 3).map((card, index) => ({card, target: _game.players[index % 2 + 1]}))});
    window.__spell = new MTG.CardInst(MTG.DEFS.Counterspell, _ui.me);
    __spell.zone = 'stack';
    window.__instant = () => ({type: 'cardPlayed', kind: 'spell', spellTypes: ['Instant'], card: __spell, player: _ui.me});
    window.__answers = [];
    _ui.pendings = [];
    void _ui.me.controller.decide(_game, {type: 'main', player: _ui.me, casts: [], acts: [], lands: []})
      .then(answer => window.__answers.push(answer));
    _ui.render();
  });
  await page.waitForFunction(() => document.getAnimations().every(animation =>
    animation.effect?.getTiming().iterations === Infinity || ['finished', 'idle'].includes(animation.playState)));
  await frames(); // Viewport/lane scroll notifications belong to fixture setup.
}
async function harmlessLayer() {
  const result = await page.locator('.actionfx-layer').evaluate(layer => ({
    hidden: layer.getAttribute('aria-hidden') === 'true',
    clickThrough: [layer, ...layer.querySelectorAll('*')].every(node => getComputedStyle(node).pointerEvents === 'none'),
    noControls: !layer.querySelector('button, input, select, a[href], [tabindex="0"]'),
    pageFits: document.documentElement.scrollWidth <= innerWidth,
    labelsFit: [...layer.querySelectorAll('.actionfx-label')].every(label => {
      const rect = label.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    }),
  }));
  assert.ok(Object.values(result).every(Boolean), JSON.stringify(result));
}
async function shot(name) {
  // Freeze only the decorative overlay at its visible mid-flight frame.
  // This makes evidence deterministic without masking application motion.
  await page.evaluate(() => document.querySelector('.actionfx-layer')?.getAnimations({subtree: true}).forEach(animation => {
    animation.pause(); animation.currentTime = Math.min(240, animation.effect.getTiming().duration / 2);
  }));
  await page.screenshot({path: `${output}/${name}.png`});
  await page.evaluate(() => document.querySelector('.actionfx-layer')?.getAnimations({subtree: true}).forEach(animation => animation.play()));
}

try {
  await page.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '0');
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  assert.equal(await page.evaluate(() => typeof MTG.UI.prototype.showActionEffect), 'function');

  for (const [width, height] of [[1440, 900], [390, 844], [2560, 1440]]) {
    await prepare(width, height);
    await page.evaluate(() => {
      window.__heldHand = document.querySelector('.hand .hcard');
      window.__pendingBefore = _ui.pending;
      window.__rulesBefore = JSON.stringify({phase: _game.phase, hand: _ui.me.hand.map(c => c.iid), life: _game.players.map(p => p.life)});
      __heldHand.focus();
      _ui.showActionEffect(__attack());
    });
    await frames();
    assert.equal(await page.locator('.actionfx-attack').count(), 1);
    assert.ok(await page.locator('.actionfx-attack .actionfx-route').count() > 0);
    await harmlessLayer();
    const geometry = await page.evaluate(() => {
      const route = document.querySelector('.actionfx-attack .actionfx-route');
      const layer = route.closest('.actionfx-layer'), layerRect = layer.getBoundingClientRect();
      // Read actual rendered scale rather than reusing the implementation's
      // viewportZoom helper; a missing zoom correction must fail this check.
      const zoom = layerRect.width / layer.clientWidth;
      const style = getComputedStyle(route);
      const transformed = {x: layerRect.left + parseFloat(style.left) * zoom,
        y: layerRect.top + (parseFloat(style.top) + parseFloat(style.height) / 2) * zoom};
      const card = document.querySelector(`.mini[data-iid="${__attack().attacks[0].card.iid}"]`);
      const r = card.getBoundingClientRect();
      return {x: transformed.x, y: transformed.y, rect: r.toJSON(),
        startsOnCard: transformed.x >= r.left - 2 && transformed.x <= r.right + 2 && transformed.y >= r.top - 2 && transformed.y <= r.bottom + 2};
    });
    assert.ok(geometry.startsOnCard, `${width}px attack route starts at visible source: ${JSON.stringify(geometry)}`);
    assert.equal(await page.evaluate(() => __heldHand.isConnected && document.activeElement === __heldHand && _ui.pending === __pendingBefore), true);
    await shot(`attack-${width}`);
    await clean();
    assert.equal(await page.evaluate(() => JSON.stringify({phase: _game.phase, hand: _ui.me.hand.map(c => c.iid), life: _game.players.map(p => p.life)}) === __rulesBefore), true);
    await page.evaluate(() => _ui.render()); await frames();
    assert.equal(await page.locator('.actionfx-attack, .actionfx-instant').count(), 0, 'incidental renders cannot replay effects');
    check(`${width}px attack route, zoom alignment, accessibility, focus, cleanup and unchanged rules`);

    await page.evaluate(() => _ui.showActionEffect(__instant())); await frames();
    assert.equal(await page.locator('.actionfx-instant').count(), 1);
    await harmlessLayer(); await shot(`instant-${width}`);
    await clean();
    const button = page.locator('.promptbar .pbtn.primary').first();
    await button.focus();
    const rect = await button.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.evaluate(() => { _ui.showActionEffect(__instant()); _ui.queueRender(); });
    await frames();
    assert.equal(await page.evaluate(() => __heldHand.isConnected), true);
    await page.mouse.up();
    await page.waitForFunction(() => __answers.length === 1);
    assert.equal(await page.evaluate(() => __answers.length), 1);
    await clean();
    check(`${width}px instant effect leaves the held Continue gesture intact and answers once`);
  }

  await prepare(1440, 900);
  await page.evaluate(() => {
    const event = window.__repeatedEvent = __instant();
    for (let i = 0; i < 12; i++) _ui.showActionEffect(event);
  });
  await frames();
  assert.equal(await page.locator('.actionfx-instant').count(), 1, 'same event object is never replayed');
  await clean();
  await page.evaluate(() => _ui.showActionEffect(__repeatedEvent)); await frames();
  assert.equal(await page.locator('.actionfx-instant').count(), 0, 'an expired event is not replayed');
  await page.evaluate(() => {
    const cards = _game.creatures(_ui.me);
    for (let i = 0; i < 20; i++) _ui.showActionEffect({type: 'combat', kind: 'attackersDeclared', player: _ui.me, count: 80,
      attacks: Array.from({length: 80}, (_, j) => ({card: cards[j % cards.length], target: _game.players[1]}))});
  });
  await frames();
  const counts = await page.locator('.actionfx-attack').evaluateAll(nodes => nodes.map(node => node.querySelectorAll('.actionfx-route').length));
  assert.ok(counts.length > 0 && counts.length <= 6 && counts.every(count => count > 0 && count <= 8), JSON.stringify(counts));
  await clean();
  check('Duplicate events are ignored and mass attacks stay within the effect/path budget');

  await page.evaluate(() => {
    _ui.showActionEffect({...__instant(), kind: 'land'});
    _ui.showActionEffect({...__instant(), spellTypes: ['Sorcery']});
    _ui.showActionEffect({...__attack(), count: 0, attacks: []});
    const facedown = Object.assign(Object.create(__spell), {faceDown: true});
    const hidden = Object.assign(Object.create(__spell), {hidden: true});
    _ui.showActionEffect({...__instant(), card: facedown});
    _ui.showActionEffect({...__instant(), card: hidden});
    _ui.showActionEffect(__instant(), {replay: true});
  });
  await frames();
  assert.equal(await page.locator('.actionfx-attack, .actionfx-instant').count(), 0);
  for (const guard of ['simulation', 'gameover', 'accountReplay', 'hidden', 'inApp']) {
    await page.evaluate(guard => {
      if (guard === 'simulation') _game._simulation = true;
      if (guard === 'gameover') _game.gameOver = true;
      if (guard === 'accountReplay') _ui.accountReplay = {current: 1, total: 3};
      if (guard === 'hidden') Object.defineProperty(document, 'hidden', {configurable: true, value: true});
      if (guard === 'inApp') { _ui.reducedMotion = true; document.body.classList.add('reduced-motion'); }
      _ui.showActionEffect(__instant()); _ui.showActionEffect(__attack());
    }, guard);
    await frames();
    assert.equal(await page.locator('.actionfx-attack, .actionfx-instant').count(), 0, guard);
    await page.evaluate(() => {
      _game._simulation = false; _game.gameOver = false; _ui.accountReplay = null; _ui.reducedMotion = false;
      delete document.hidden; document.body.classList.remove('reduced-motion');
    });
  }
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.evaluate(() => { _ui.showActionEffect(__instant()); _ui.showActionEffect(__attack()); });
  await frames();
  assert.equal(await page.locator('.actionfx-attack, .actionfx-instant').count(), 0);
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await frames(); // Allow the media-query change cleanup to settle before a new event.
  check('Non-instants, hidden identities, replay, simulation, game over, hidden tabs and both motion preferences stay quiet');

  // Classification must use the chosen public spell face, not printed type.
  await page.evaluate(() => {
    const card = new MTG.CardInst(MTG.DEFS.Island, _ui.me); card.zone = 'stack';
    _ui.showActionEffect({...__instant(), card, name: 'Chosen spell face', spellTypes: ['Instant']});
  });
  await frames(); assert.equal(await page.locator('.actionfx-instant').count(), 1);
  assert.match(await page.locator('.actionfx-instant').innerText(), /Chosen spell face/); await clean();
  check('Chosen public spell type and name control instant presentation');

  await page.evaluate(() => _ui.showActionEffect(__instant())); await frames();
  assert.equal(await page.locator('.actionfx-instant').count(), 1);
  await page.evaluate(() => document.body.classList.add('reduced-motion')); await frames();
  assert.equal(await page.locator('.actionfx-layer').count(), 0);
  await page.evaluate(() => document.body.classList.remove('reduced-motion'));
  await page.evaluate(() => _ui.showActionEffect(__instant())); await frames();
  assert.equal(await page.locator('.actionfx-instant').count(), 1);
  await page.evaluate(() => document.body.classList.remove('game-active')); await frames();
  assert.equal(await page.locator('.actionfx-layer').count(), 0);
  await page.evaluate(() => document.body.classList.add('game-active'));
  check('Mid-flight preference and setup changes remove the complete overlay without errors');

  await page.evaluate(() => {
    window.__retiredUI = _ui;
    window._ui = new MTG.UI(); _ui.game = _game; _ui.me = _game.players[0]; _ui.render();
    __retiredUI.showActionEffect(__instant());
  });
  await frames(); assert.equal(await page.locator('.actionfx-layer').count(), 0);
  await page.evaluate(() => _ui.showActionEffect(__instant())); await frames();
  assert.equal(await page.locator('.actionfx-instant').count(), 1); await clean();
  check('A retired UI cannot paint over its replacement, which still accepts new effects');

  await page.evaluate(() => { _ui.showActionEffect(__instant()); document.body.classList.remove('game-active'); });
  await frames(); assert.equal(await page.locator('.actionfx-attack, .actionfx-instant').count(), 0);
  assert.deepEqual(receipt.errors, []);
  check('Returning to setup cancels queued decoration');
} catch (error) {
  await page.screenshot({path: `${output}/failure.png`});
  throw error;
} finally {
  writeFileSync(`${output}/receipt.json`, JSON.stringify(receipt, null, 2));
  await browser.close(); server.close();
}
