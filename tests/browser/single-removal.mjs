// A spell or ability that removes one card marks it on the table and is a
// table highlight afterwards, whoever cast it and whoever owned the card:
// a beam from the one who did it, a frame and the hit on the card, a plate
// with the verb, the card and the source, then the card leaves and the
// highlight follows. A cost, a spent Treasure and a token's death stay quiet.
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
const output = process.env.SINGLE_REMOVAL_OUTPUT || `${root}output/web-game/single-removal`;
mkdirSync(output, {recursive: true});
const server = express().use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const errors = [];
const check = name => console.log(`PASS ${name}`);

async function open(width, height, phone = false) {
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: 'no-preference',
    ...(phone ? {hasTouch: true, isMobile: true} : {})});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '0'); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  return {context, page};
}
// A fresh populated table whose events reach the interface as in a game.
async function table(page, speed = .05) {
  await page.addScriptTag({content: fixture});
  await page.mouse.move(2, 2);
  await page.evaluate(speed => {
    document.querySelectorAll('.gamefxlayer').forEach(node => node.remove());
    const g = _game;
    g.paced = true; g.speedFactor = speed;
    g.onEvent = event => { if (event.type === 'gameEffect') _ui.showGameEffect(event); _ui.queueRender(); };
    _ui.pendings = []; _ui.render();
    // One resolving spell or ability of `actor` that does `run` to `card`.
    window.__resolve = (actor, name, run) => {
      const source = new MTG.CardInst(MTG.DEFS[name] || MTG.DEFS.Murder, actor);
      source.zone = 'graveyard'; actor.graveyard.push(source);
      g.stack.push({kind: 'ability', name, ctrl: actor, srcCard: source, targets: [], ctx: {g, you: actor, src: source}, run});
      window.__resolved = false; window.__struckAt = window.__recapAt = null;
      clearInterval(window.__watch);
      window.__watch = setInterval(() => {
        if (!window.__recapAt && (_ui.pendings || []).some(pd => pd.q.effectKind === 'resolutionRecap')) window.__recapAt = performance.now();
      }, 10);
      void g.resolveTop().then(() => { window.__resolved = true; });
    };
    // What the table shows at the moment the plate appears, read in one task:
    // the parts live for less than a second.
    window.__strike = async card => {
      const node = document.querySelector(`.mini[data-iid="${card.iid}"]`);
      const shown = node && node.getBoundingClientRect().width > 0 && !node.closest('[hidden], [inert], [aria-hidden="true"]');
      const before = shown ? node.getBoundingClientRect().toJSON() : null;
      const started = performance.now();
      while (!document.querySelector('.removalfx-plate') && performance.now() - started < 4000) await new Promise(next => requestAnimationFrame(next));
      window.__struckAt = performance.now();
      const layer = document.querySelector('.gamefxlayer');
      const box = selector => layer?.querySelector(selector)?.getBoundingClientRect().toJSON() || null;
      const plate = layer?.querySelector('.removalfx-plate');
      return {
        before, strike: box('.removalfx'), mode: layer?.querySelector('.removalfx')?.className || null,
        beam: !!layer?.querySelector('.removalfx-beam'), ghost: layer?.querySelector('.gamefx-cardghost')?.className || null,
        badge: !!layer?.querySelector('.gamefx-zonebadge'),
        plate: plate && {box: plate.getBoundingClientRect().toJSON(), cls: plate.className,
          text: [...plate.querySelectorAll('small, b, em')].map(part => part.textContent),
          picture: !!plate.querySelector('.removalfx-art img, .removalfx-art .tokenface')},
        clickThrough: !!layer && [...layer.querySelectorAll('*')].every(part => getComputedStyle(part).pointerEvents === 'none') &&
          getComputedStyle(layer).pointerEvents === 'none',
        recapAtStrike: (_ui.pendings || []).some(pd => pd.q.effectKind === 'resolutionRecap'),
        hold: Math.round((_ui.removalHoldUntil || 0) - performance.now()),
        viewport: {width: innerWidth, height: innerHeight},
      };
    };
  }, speed);
}
const recap = page => page.evaluate(async () => {
  const started = performance.now();
  const find = () => (_ui.pendings || []).find(pd => pd.q.effectKind === 'resolutionRecap');
  while (!find() && performance.now() - started < 8000) await new Promise(next => setTimeout(next, 30));
  const q = find()?.q;
  return q ? {afterStrike: Math.round((window.__recapAt || performance.now()) - window.__struckAt), headline: q.recap.impact.headline, level: q.recap.impact.level,
    summary: q.recap.summary, rows: q.recap.highlights.map(row => row.text)} : null;
});
const inside = (box, viewport) => box.left >= 0 && box.top >= 0 && box.right <= viewport.width + 1 && box.bottom <= viewport.height + 1;

let failure = null;
try {
  {
    const {context, page} = await open(1440, 900);

    // One opponent destroys another opponent's creature, at the game's normal pace.
    await table(page, 1);
    let seen = await page.evaluate(async () => {
      const actor = _game.players[1], victim = _game.creatures(_game.players[2])[0];
      window.__victim = victim.name;
      __resolve(actor, 'Murder', () => _game.destroy(victim));
      return {name: victim.name, ...(await __strike(victim))};
    });
    assert.ok(seen.plate, `a removal shows its plate: ${JSON.stringify(seen)}`);
    assert.deepEqual(seen.plate.text, ['DESTROYED', seen.name, 'Murder · AI Dragon']);
    assert.match(seen.mode, /mode-cut/);
    assert.ok(seen.strike && Math.abs(seen.strike.left - seen.before.left) <= 2 && Math.abs(seen.strike.top - seen.before.top) <= 2 &&
      Math.abs(seen.strike.width - seen.before.width) <= 2, `the frame is on the card: ${JSON.stringify(seen)}`);
    assert.equal(seen.beam, true, 'a beam comes from the one who did it');
    assert.match(seen.ghost, /struck/, 'the card takes the hit before it flies');
    assert.equal(seen.badge, false, 'the plate names the verb; no second label');
    assert.ok(seen.hold > 200 && seen.hold <= 440, `the lane waits for the hit: ${seen.hold}`);
    assert.equal(seen.clickThrough, true, 'the effect never takes a click');
    assert.ok(inside(seen.plate.box, seen.viewport), `the plate is on screen: ${JSON.stringify(seen.plate.box)}`);
    assert.equal(seen.recapAtStrike, false, 'the highlight waits for the hit');
    await page.screenshot({path: `${output}/destroy-1440.png`});
    let result = await recap(page);
    assert.ok(result, 'the removal is a table highlight');
    assert.ok(result.afterStrike >= 700, `the highlight follows the hit: ${result.afterStrike} ms after it`);
    assert.deepEqual([result.level, result.headline], ['major', 'Destroyed']);
    assert.equal(result.summary, `${seen.name} was destroyed.`);
    assert.deepEqual(result.rows, [`${seen.name} · AI Wolf: destroyed, battlefield → graveyard.`]);
    const dialog = page.locator('[data-testid="resolution-recap"]');
    await dialog.waitFor();
    assert.equal(await dialog.getAttribute('data-impact'), 'major');
    assert.match(await dialog.innerText(), /Destroyed[\s\S]*Murder[\s\S]*AI Dragon/i);
    await page.screenshot({path: `${output}/destroy-highlight-1440.png`});
    await dialog.locator('.resolutionrecapproceed').click();
    await page.waitForFunction(() => window.__resolved === true);
    check('an opponent\'s destroy on another opponent: beam, frame, hit, plate, then the highlight');

    // My exile of an opposing creature.
    await table(page);
    seen = await page.evaluate(async () => {
      const victim = _game.creatures(_game.players[1])[1];
      __resolve(_ui.me, 'Swords to Plowshares', () => _game.exileCard(victim));
      return {name: victim.name, ...(await __strike(victim))};
    });
    assert.deepEqual(seen.plate.text, ['EXILED', seen.name, 'Swords to Plowshares · You']);
    assert.match(seen.mode, /mode-void/);
    assert.equal(seen.beam, true);
    result = await recap(page);
    assert.deepEqual([result.level, result.headline], ['major', 'Into exile']);
    await page.locator('[data-testid="resolution-recap"] .resolutionrecapproceed').click();
    check('my own exile of an opposing creature is marked and highlighted too');

    // An opponent returns my permanent to my hand.
    await table(page);
    seen = await page.evaluate(async () => {
      const victim = _game.creatures(_ui.me)[3];
      __resolve(_game.players[2], 'Unsummon', () => _game.move(victim, 'hand'));
      return {name: victim.name, ...(await __strike(victim))};
    });
    assert.deepEqual(seen.plate.text, ['RETURNED TO HAND', seen.name, 'Unsummon · AI Wolf']);
    assert.match(seen.mode, /mode-lift/);
    result = await recap(page);
    assert.deepEqual([result.level, result.headline, result.rows[0]], ['major', 'Returned to hand', `${seen.name} · You: returned to hand, battlefield → hand.`]);
    await page.locator('[data-testid="resolution-recap"] .resolutionrecapproceed').click();
    check('a bounce of my permanent says so, in its own colour');

    // What is not a removal leaves as it always did.
    await table(page);
    const quiet = await page.evaluate(async () => {
      const frames = () => new Promise(next => requestAnimationFrame(() => requestAnimationFrame(next)));
      const layer = () => document.querySelector('.gamefxlayer');
      const state = () => ({strike: !!layer()?.querySelector('.removalfx, .removalfx-plate'), ghost: !!layer()?.querySelector('.gamefx-cardghost'),
        badge: layer()?.querySelector('.gamefx-zonebadge')?.textContent || null});
      // A cost: sacrificed with nothing resolving.
      const owner = _game.players[1];
      await _game.sacrifice(owner, _game.creatures(owner)[0]); await frames();
      const cost = state();
      document.querySelectorAll('.gamefxlayer').forEach(node => node.remove());
      // A player's own effect on their own card (a bounce land's return).
      const land = _game.battlefield.find(card => card.ctrl === owner && card.is('Creature'));
      __resolve(owner, 'Gruul Turf', () => _game.move(land, 'hand'));
      const moved = performance.now();
      while (land.zone === 'battlefield' && performance.now() - moved < 3000) await frames();
      await frames();
      const own = state();
      while (!window.__resolved && performance.now() - moved < 6000) await frames();
      document.querySelectorAll('.gamefxlayer').forEach(node => node.remove());
      // A Treasure spent while another player's effect resolves.
      const token = new MTG.CardInst(MTG.DEFS['Sol Ring'], _ui.me);
      token.ctrl = _ui.me; token.zone = 'battlefield'; token.isToken = true; _game.battlefield.push(token); _game.recalc(); _ui.render(); await frames();
      __resolve(owner, 'Rhystic Study', () => _game.sacrifice(_ui.me, token));
      const started = performance.now();
      while (token.zone === 'battlefield' && performance.now() - started < 3000) await frames();
      await frames();
      const paid = state();
      await new Promise(next => setTimeout(next, 400));
      return {cost, own, paid, recap: (_ui.pendings || []).some(pd => pd.q.effectKind === 'resolutionRecap'), resolved: window.__resolved};
    });
    assert.deepEqual(quiet.cost, {strike: false, ghost: true, badge: 'GRAVEYARD'}, 'a cost is a plain flight with its zone label');
    assert.deepEqual(quiet.own, {strike: false, ghost: true, badge: 'RETURN TO HAND'}, 'a player\'s own card leaves as before');
    assert.equal(quiet.paid.strike, false, 'a spent token is not struck');
    assert.equal(quiet.recap, false, 'and is no highlight');
    assert.equal(quiet.resolved, true);
    check('a cost, a player\'s own card and a spent Treasure leave as before, with no highlight');
    await context.close();
  }
  {
    const {context, page} = await open(390, 844, true);

    // A card that is not on this view: the plate carries its picture.
    await table(page);
    assert.equal(await page.evaluate(() => _ui.mobileView), 'mine');
    let seen = await page.evaluate(async () => {
      const victim = _game.creatures(_game.players[1])[1];
      __resolve(_ui.me, 'Swords to Plowshares', () => _game.exileCard(victim));
      return {name: victim.name, ...(await __strike(victim))};
    });
    assert.equal(seen.before, null, 'the opposing card is not on the phone\'s Mine view');
    assert.equal(seen.strike, null);
    assert.match(seen.plate.cls, /withcard/);
    assert.equal(seen.plate.picture, true, 'the plate shows the card');
    assert.deepEqual(seen.plate.text, ['EXILED', seen.name, 'Swords to Plowshares · You']);
    assert.ok(inside(seen.plate.box, seen.viewport), `the plate fits the phone: ${JSON.stringify(seen.plate.box)}`);
    await page.screenshot({path: `${output}/exile-off-view-390.png`});
    let result = await recap(page);
    assert.equal(result.headline, 'Into exile');
    await page.locator('[data-testid="resolution-recap"] .resolutionrecapproceed').click();
    check('a phone shows a removal of a card that is on another view');

    // My own permanent, on screen.
    await table(page);
    seen = await page.evaluate(async () => {
      const victim = _game.creatures(_ui.me)[1];
      __resolve(_game.players[1], 'Murder', () => _game.destroy(victim));
      return {name: victim.name, ...(await __strike(victim))};
    });
    assert.ok(seen.before && seen.strike, `the hit is on my card: ${JSON.stringify(seen)}`);
    assert.ok(Math.abs(seen.strike.left - seen.before.left) <= 2 && Math.abs(seen.strike.top - seen.before.top) <= 2);
    assert.deepEqual(seen.plate.text, ['DESTROYED', seen.name, 'Murder · AI Dragon']);
    assert.ok(inside(seen.plate.box, seen.viewport), `the plate fits the phone: ${JSON.stringify(seen.plate.box)}`);
    assert.equal(seen.clickThrough, true);
    await page.screenshot({path: `${output}/destroy-390.png`});
    check('a phone marks my destroyed card where it stands');

    // Reduced motion: the words, without the hit.
    await table(page);
    const calm = await page.evaluate(async () => {
      document.body.classList.add('reduced-motion');
      const victim = _game.creatures(_ui.me)[2];
      __resolve(_game.players[1], 'Murder', () => _game.destroy(victim));
      const seen = await __strike(victim);
      const layer = document.querySelector('.gamefxlayer');
      const hidden = [...layer.querySelectorAll('.removalfx, .removalfx-beam')].every(part => getComputedStyle(part).display === 'none');
      const animation = getComputedStyle(layer.querySelector('.removalfx-plate')).animationName;
      document.body.classList.remove('reduced-motion');
      return {text: seen.plate.text, hidden, animation};
    });
    assert.equal(calm.text[0], 'DESTROYED');
    assert.equal(calm.hidden, true, 'reduced motion shows no beam and no hit');
    assert.equal(calm.animation, 'removalPlateCalm');
    check('reduced motion keeps the plate and drops the hit');
    await context.close();
  }
  assert.deepEqual(errors, []);
  check('no browser page errors');
} catch (error) {
  failure = error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
if (failure) throw failure;
