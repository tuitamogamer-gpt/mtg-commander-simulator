// A board wipe is staged on the table (src/modules/board-wipe.js): the plate
// and a frame on every doomed card, the impact, then the cards go one after
// another, board by board, while the engine waits. The cards leave the
// battlefield when it is over, and the next decision comes after that.
// Decoration only: nothing takes a click and the rules reach the same state.
// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/populated-resource-board.js', import.meta.url), 'utf8');
const output = process.env.BOARD_WIPE_OUTPUT || `${root}output/web-game/board-wipe`;
mkdirSync(output, {recursive: true});
const server = express().use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const errors = [];
const check = name => console.log(`PASS ${name}`);
const NORMAL = 1.5625;

async function open(width, height, {phone = false, reduced = false} = {}) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: reduced ? 'reduce' : 'no-preference',
    ...(phone ? {hasTouch: true, isMobile: true} : {})});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '0'); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  return {context, page};
}
// A fresh populated table (20 creatures: 8 of yours, 4 of each opponent)
// whose events reach the interface as in a Solo game.
async function table(page, speed = NORMAL) {
  await page.addScriptTag({content: fixture});
  await page.mouse.move(2, 2);
  await page.evaluate(speed => {
    document.querySelectorAll('.gamefxlayer').forEach(node => node.remove());
    const g = _game;
    g.paced = true; g.speedFactor = speed;
    window.__events = [];
    g.onEvent = event => {
      if (event.type === 'gameEffect') { window.__events.push({kind: event.kind, at: performance.now()}); _ui.showGameEffect(event); }
      _ui.queueRender();
    };
    _ui.pendings = []; _ui.render();
    // One resolving spell of `actor` that runs `mode` on every creature.
    window.__wipe = (mode, name, actorIndex = 1) => {
      const actor = g.players[actorIndex];
      const source = new MTG.CardInst(MTG.DEFS[name] || MTG.DEFS.Murder, actor);
      source.zone = 'graveyard'; actor.graveyard.push(source);
      const creatures = () => g.bf().filter(card => card.is('Creature'));
      const run = async () => {
        if (mode === 'exile') await g.exileMany(creatures());
        else if (mode === 'bounce') await g.bounceMany(creatures());
        else if (mode === 'wither') {
          g.untilEffects.push({expires: 'eot', apply: () => { for (const card of creatures()) card.cur.toughness -= 13; }});
          g.recalc(); await g.checkSBA();
        } else await g.destroyMany(creatures(), {source: null});
      };
      g.stack.push({kind: 'ability', name, ctrl: actor, srcCard: source, targets: [], ctx: {g, you: actor, src: source}, run});
      window.__started = performance.now(); window.__done = false;
      window.__error = null;
      void g.resolveTop().then(() => { window.__done = true; }, error => { window.__error = String(error?.stack || error); });
    };
    // Samples what the table shows every frame until the effect has left.
    window.__watch = async () => {
      const rows = [], minis = () => [...document.querySelectorAll('#game .boardlanecards .mini[data-iid]')];
      const creatureIds = new Set(g.bf().filter(card => card.is('Creature')).map(card => String(card.iid)));
      let seen = false;
      while (performance.now() - window.__started < 12000) {
        const state = MTG.boardWipeState();
        if (state) seen = true;
        if (seen && !state) break;
        const cards = minis().filter(node => creatureIds.has(node.dataset.iid));
        // `planned` is how many cards have had their turn by this frame's clock,
        // the clock the animations run on (a busy page reaches a frame late).
        const since = state?.cascading ? document.timeline.currentTime - state.cascadeAt : -1;
        rows.push({at: Math.round(performance.now() - window.__started), gone: state?.gone ?? null,
          planned: state?.cascading ? state.units.filter(unit => unit.wait <= since).reduce((n, unit) => n + unit.cards, 0) : null, cascading: !!state?.cascading, settled: !!state?.settled,
          onBattlefield: g.bf().filter(card => card.is('Creature')).length, drawn: cards.length,
          faded: cards.filter(node => Number(getComputedStyle(node).opacity) < .5 || getComputedStyle(node).visibility === 'hidden').length,
          marks: document.querySelectorAll('.wipefx-mark').length, chips: document.querySelectorAll('.wipefx-loss').length,
          decision: (_ui.pendings || []).map(pd => pd.q.type).join(',')});
        await new Promise(next => requestAnimationFrame(next));
      }
      return rows;
    };
    window.__layer = () => {
      const layer = document.querySelector('.gamefxlayer'), fx = layer?.querySelector('.wipefx'), plate = fx?.querySelector('.wipefx-plate');
      return fx && {
        cls: fx.className, hidden: layer.getAttribute('aria-hidden'),
        clickThrough: getComputedStyle(layer).pointerEvents === 'none' && [...fx.querySelectorAll('*')].every(part => getComputedStyle(part).pointerEvents === 'none'),
        plain: !fx.querySelector('[data-iid], [id], [tabindex], [role], button, a[href], input, select'),
        plate: plate && {box: plate.getBoundingClientRect().toJSON(), cls: plate.className,
          kicker: plate.querySelector('.wipefx-kicker').textContent, name: plate.querySelector('.wipefx-name').textContent,
          line: plate.querySelector('.wipefx-line').textContent, pips: plate.querySelectorAll('.wipefx-pips > i').length,
          art: !!plate.querySelector('.wipefx-art img, .wipefx-art .tokenface'),
          losses: [...plate.querySelectorAll('.wipefx-losses > span')].map(row => row.textContent)},
        veil: !!fx.querySelector('.wipefx-veil'), marks: fx.querySelectorAll('.wipefx-mark').length,
        frames: [...fx.querySelectorAll('.wipefx-mark')].slice(0, 3).map(mark => mark.getBoundingClientRect().toJSON()),
        flash: !!fx.querySelector('.wipefx-flash'), rings: fx.querySelectorAll('.wipefx-shock i').length, sparks: fx.querySelectorAll('.wipefx-spark').length,
        strikes: fx.querySelectorAll('.wipefx-strike').length, chips: [...fx.querySelectorAll('.wipefx-loss')].map(chip => chip.textContent),
        clones: document.querySelectorAll('.gamefx-cardghost, .gamefx-wipecard, .gamefx-zonebadge, .removalfx-plate').length,
        camera: getComputedStyle(document.querySelector('#game')).animationName,
        viewport: {width: innerWidth, height: innerHeight},
      };
    };
  }, speed);
}
const until = (page, predicate, timeout = 8000) => page.waitForFunction(predicate, undefined, {timeout});
const inside = (box, viewport) => box.left >= -1 && box.top >= -1 && box.right <= viewport.width + 1 && box.bottom <= viewport.height + 1;

try {
  // ---------- Desktop, the game's normal pace ----------
  {
    const {context, page} = await open(1440, 900);
    await table(page);
    const timing = await page.evaluate(speed => MTG.boardWipeTiming(20, speed), NORMAL);
    const before = await page.evaluate(() => ({creatures: _game.bf().filter(card => card.is('Creature')).length,
      graveyards: _game.players.map(player => player.graveyard.length),
      cards: [...document.querySelectorAll('#game .boardlanecards .mini[data-iid]')].length}));
    assert.equal(before.creatures, 20);
    await page.evaluate(() => { window.__wipe('destroy', 'Wrath of God'); window.__rows = window.__watch(); });
    await until(page, () => document.querySelectorAll('.wipefx-mark').length >= 20);
    const build = await page.evaluate(() => ({layer: window.__layer(), creatures: _game.bf().filter(card => card.is('Creature')).length,
      doomed: document.querySelectorAll('#game .wipe-doomed').length, state: MTG.boardWipeState(),
      first: document.querySelector('#game .wipe-doomed')?.getBoundingClientRect().toJSON()}));
    assert.equal(build.creatures, 20, 'the cards are on the battlefield while the wipe is announced');
    assert.match(build.layer.cls, /mode-destroy/); assert.match(build.layer.cls, /hit-cut/);
    assert.equal(build.layer.hidden, 'true');
    assert.ok(build.layer.clickThrough, 'nothing of the effect takes a click');
    assert.ok(build.layer.plain, 'the effect carries no card identity, focus stop or control');
    assert.equal(build.layer.clones, 0, 'the real cards are marked: no copy of a card is drawn');
    assert.ok(build.layer.veil);
    assert.equal(build.layer.marks, 20, 'a frame on every doomed card');
    assert.equal(build.doomed, 20);
    assert.match(build.layer.plate.cls, /stage/, 'said in the middle of the table during the build-up');
    assert.match(build.layer.plate.kicker, /board wipe · AI Dragon/i);
    assert.equal(build.layer.plate.name, 'Wrath of God');
    assert.match(build.layer.plate.line, /^20 creatures$/);
    assert.equal(build.layer.plate.pips, 20);
    assert.ok(inside(build.layer.plate.box, build.layer.viewport));
    // A frame stands on its card.
    const frame = build.layer.frames[0];
    assert.ok(Math.abs(frame.left - build.first.left) < 3 && Math.abs(frame.top - build.first.top) < 3 && Math.abs(frame.width - build.first.width) < 3, JSON.stringify({frame, card: build.first}));
    // Board by board: no player's cards are split by another player's.
    const order = build.state.units.map(unit => unit.player);
    assert.equal(order.length, 20);
    assert.equal(order.filter((player, index) => index && player !== order[index - 1]).length, 3, `four boards, one after another: ${order.join('')}`);
    await page.screenshot({path: `${output}/desktop-build.png`});

    // The impact, read in the frame it lands.
    const impactLayer = await page.evaluate(async () => {
      while (!MTG.boardWipeState()?.cascading) await new Promise(next => requestAnimationFrame(next));
      return window.__layer();
    });
    assert.ok(impactLayer.flash && impactLayer.rings === 2, 'the impact');
    assert.equal(impactLayer.camera, 'dsWipeCamera', 'a desktop shakes with the impact');
    assert.equal(impactLayer.strikes, 20); assert.equal(impactLayer.sparks, 100, 'five sparks per blade on a desktop');
    await until(page, () => MTG.boardWipeState()?.cascading && MTG.boardWipeState().gone >= 6);
    const mid = await page.evaluate(() => {
      window.__waits = MTG.boardWipeState().units.map(unit => unit.wait);
      return {layer: window.__layer(), creatures: _game.bf().filter(card => card.is('Creature')).length};
    });
    assert.equal(mid.creatures, 20, 'the engine has not moved a card yet');
    assert.doesNotMatch(mid.layer.plate.cls, /stage/, 'the plate has stepped under the header');
    assert.match(mid.layer.plate.line, /^\d+ of 20 creatures destroyed$/);
    await page.screenshot({path: `${output}/desktop-cascade.png`});

    const rows = await page.evaluate(() => window.__rows);
    await page.screenshot({path: `${output}/desktop-after.png`});
    // The cards go one after another, not together.
    const cascade = rows.filter(row => row.cascading && !row.settled && row.onBattlefield === 20);
    const counts = [...new Set(cascade.map(row => row.gone))];
    // (How many steps are seen depends on how many frames the machine draws.)
    assert.ok(counts.length >= 3 && counts.some(count => count > 0 && count < 20), `the count rose step by step: ${counts.join(',')}`);
    // Each card has its own turn, a fixed step after the one before, and no
    // card is counted before its turn has come.
    const waits = (await page.evaluate(() => window.__waits)).filter(wait => wait != null);
    assert.equal(waits.length, 20);
    assert.ok(waits.every((wait, index) => !index || Math.abs(wait - waits[index - 1] - timing.stagger) <= 1.5), `one step apart: ${waits.join(',')}`);
    assert.ok(Math.abs(waits[0] - timing.lead) <= 1, 'the first card goes after the impact has landed');
    if (process.env.BOARD_WIPE_DEBUG) console.log(cascade.map(row => `${row.at}:${row.gone}/${row.planned}/${row.faded}`).join(' '));
    assert.ok(cascade.every(row => row.gone <= row.planned), 'the count never runs ahead of the cards');
    // What is counted is what the table shows: with half of them counted, the
    // first cards have faded and the last boards stand untouched.
    const halfway = cascade.find(row => row.gone >= 10);
    assert.ok(halfway.faded >= 2 && halfway.faded <= 11 && halfway.drawn - halfway.faded >= 8, `half of the table still stands when half is counted: ${JSON.stringify(halfway)}`);
    // The engine waited for it.
    const left = rows.find(row => row.onBattlefield < 20);
    assert.ok(left.at >= timing.build + timing.cascade - 250, `the cards left after the cascade: ${left.at} ms, ${timing.build + timing.cascade} planned`);
    assert.ok(rows.filter(row => row.at < left.at).every(row => !row.decision), 'no decision opens over the wipe');
    const events = await page.evaluate(() => window.__events.map(event => ({kind: event.kind, at: Math.round(event.at - window.__started)})));
    const impact = events.find(event => event.kind === 'boardWipeImpact'), wipe = events.find(event => event.kind === 'boardWipe');
    assert.ok(impact.at - wipe.at >= timing.build - 60 && impact.at - wipe.at <= timing.build + 500, JSON.stringify(events));
    assert.equal(events.filter(event => event.kind === 'zoneMove').length, 0, 'no card of the wipe is announced again');
    // Each board showed its loss, and the plate said whose cards went.
    assert.equal(Math.max(...rows.map(row => row.chips)), 4);
    const end = await page.evaluate(() => ({creatures: _game.bf().filter(card => card.is('Creature')).length,
      graveyards: _game.players.map(player => player.graveyard.length), left: document.querySelectorAll('.wipefx, .wipe-dead, .wipe-doomed').length,
      camera: document.querySelector('#game').classList.contains('fx-boardwipe-camera'), error: window.__error}));
    assert.equal(end.error, null);
    assert.equal(end.creatures, 0);
    assert.deepEqual(end.graveyards.map((n, index) => n - before.graveyards[index]), [8, 5, 4, 4], 'every creature is in its owner’s graveyard (and the spell in its caster’s)');
    assert.equal(end.left, 0, 'nothing of the effect stays on the table');
    assert.equal(end.camera, false);
    check('desktop: announced on the cards, played board by board while the engine waits, then the cards leave together');
    await context.close();
  }

  // ---------- The result, and the other kinds ----------
  {
    const {context, page} = await open(1440, 900);
    for (const [mode, name, cls, kicker, done] of [['exile', 'Merciless Eviction', /mode-exile.*hit-void/, /void sweep/i, /20 creatures exiled/],
      ['bounce', 'Evacuation', /mode-bounce.*hit-lift/, /mass return/i, /20 creatures returned to hand/],
      ['wither', 'Toxic Deluge', /mode-wither.*hit-cut/, /board wipe/i, /20 creatures died/]]) {
      // A faster game: the same beats, shorter.
      await table(page, .9375);
      await page.evaluate(([mode, name]) => window.__wipe(mode, name), [mode, name]);
      await until(page, () => MTG.boardWipeState()?.settled && document.querySelector('.wipefx-losses:not([hidden])'));
      const result = await page.evaluate(() => ({layer: window.__layer(), creatures: _game.bf().filter(card => card.is('Creature')).length}));
      assert.match(result.layer.cls, cls, mode);
      assert.match(result.layer.plate.kicker, kicker); assert.equal(result.layer.plate.name, name);
      assert.match(result.layer.plate.line, done);
      assert.deepEqual(result.layer.plate.losses.map(text => text.replace(/\s+/g, ' ').trim()).sort(), ['AI Dragon 4', 'AI Raven 4', 'AI Wolf 4', 'You 8'], mode);
      assert.deepEqual(result.layer.chips.sort(), ['−4', '−4', '−4', '−8']);
      await until(page, () => !MTG.boardWipeState() && !document.querySelector('.wipefx'));
      assert.equal(await page.evaluate(() => _game.bf().filter(card => card.is('Creature')).length), 0, mode);
    }
    check('exile, a mass return and a toughness wipe: their own colour, hit and words, and each board’s loss');

    // An instant game has already moved the cards: one plate, nothing else.
    await table(page, 0);
    await page.evaluate(() => window.__wipe('destroy', 'Wrath of God'));
    await until(page, () => document.querySelector('.wipefx'));
    const instant = await page.evaluate(() => ({layer: window.__layer(), creatures: _game.bf().filter(card => card.is('Creature')).length}));
    assert.match(instant.layer.cls, /unstaged/);
    assert.equal(instant.layer.veil, false); assert.equal(instant.layer.marks, 0); assert.equal(instant.layer.flash, false);
    assert.match(instant.layer.plate.line, /20 creatures destroyed/);
    assert.equal(instant.creatures, 0);
    check('an instant game: the plate says what happened and the table stays still');
    await context.close();
  }

  // ---------- Reduced motion ----------
  {
    const {context, page} = await open(1440, 900, {reduced: true});
    await table(page);
    await page.evaluate(() => { window.__wipe('destroy', 'Wrath of God'); window.__rows = window.__watch(); });
    await until(page, () => document.querySelector('.wipefx'));
    const calm = await page.evaluate(() => ({layer: window.__layer(),
      outline: getComputedStyle(document.querySelector('#game .wipe-doomed')).outlineStyle}));
    assert.match(calm.layer.cls, /calm/);
    assert.equal(calm.layer.veil, false); assert.equal(calm.layer.marks, 0);
    assert.equal(calm.outline, 'solid', 'a still outline marks what is leaving');
    assert.doesNotMatch(calm.layer.plate.cls, /stage/, 'the plate does not travel');
    const calmImpact = await page.evaluate(async () => {
      while (!MTG.boardWipeState()?.cascading) await new Promise(next => requestAnimationFrame(next));
      return {layer: window.__layer(), camera: getComputedStyle(document.querySelector('#game')).animationName};
    });
    assert.equal(calmImpact.layer.flash, false); assert.equal(calmImpact.layer.rings, 0); assert.equal(calmImpact.camera, 'none');
    await until(page, () => MTG.boardWipeState()?.gone >= 8);
    const during = await page.evaluate(() => ({layer: window.__layer(), camera: getComputedStyle(document.querySelector('#game')).animationName,
      hidden: [...document.querySelectorAll('#game .wipe-dead')].filter(node => getComputedStyle(node).visibility === 'hidden').length,
      animated: [...document.querySelectorAll('#game .wipe-dead')].filter(node => getComputedStyle(node).animationName !== 'none').length,
      standing: document.querySelectorAll('#game .wipe-doomed').length, gone: MTG.boardWipeState().gone}));
    assert.equal(during.layer.flash, false); assert.equal(during.layer.rings, 0); assert.equal(during.camera, 'none');
    assert.ok(during.hidden >= 8 && during.standing >= 4, `cards go in the same order, without moving: ${JSON.stringify(during)}`);
    assert.equal(during.animated, 0);
    const rows = await page.evaluate(() => window.__rows);
    assert.ok(new Set(rows.filter(row => row.cascading).map(row => row.gone)).size >= 3);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.wipefx, .wipe-dead, .wipe-doomed').length), 0);
    check('reduced motion: the plate, a still outline, and the cards gone one after another with nothing that moves');
    await context.close();
  }

  // ---------- A phone ----------
  {
    const {context, page} = await open(390, 844, {phone: true});
    await table(page);
    await page.evaluate(() => { window.__wipe('destroy', 'Wrath of God'); window.__rows = window.__watch(); });
    const phone = await page.evaluate(async () => {
      while (!MTG.boardWipeState()?.cascading) await new Promise(next => requestAnimationFrame(next));
      return {layer: window.__layer(), state: MTG.boardWipeState(), creatures: _game.bf().filter(card => card.is('Creature')).length};
    });
    assert.equal(phone.creatures, 20);
    assert.ok(inside(phone.layer.plate.box, phone.layer.viewport), JSON.stringify(phone.layer.plate.box));
    assert.ok(phone.layer.plate.box.top >= 90, 'the plate stands under the header and the seats');
    assert.equal(phone.layer.rings, 1, 'one shockwave'); assert.equal(phone.layer.sparks, 0); assert.equal(phone.layer.camera, 'none');
    assert.equal(phone.layer.clones, 0);
    // The phone shows one board: the other players' cards are counted without a picture.
    const shown = phone.state.units.filter(unit => unit.shown), unseen = phone.state.units.filter(unit => !unit.shown);
    assert.ok(shown.length >= 1 && unseen.length >= 1, JSON.stringify(phone.state.units));
    assert.equal(phone.state.units.reduce((n, unit) => n + unit.cards, 0), 20, 'every card is counted once');
    assert.equal(phone.layer.marks, shown.length);
    await page.screenshot({path: `${output}/phone-cascade.png`});
    const rows = await page.evaluate(() => window.__rows);
    assert.equal(Math.max(...rows.map(row => row.gone ?? 0)), 20);
    assert.equal(await page.evaluate(() => _game.bf().filter(card => card.is('Creature')).length), 0);
    assert.equal(await page.evaluate(() => document.querySelectorAll('.wipefx, .wipe-dead, .wipe-doomed').length), 0);
    check('phone: the same beats inside the screen, without sparks, a second shockwave or the camera');
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
