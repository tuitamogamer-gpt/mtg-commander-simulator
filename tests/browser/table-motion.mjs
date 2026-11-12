// Table continuity (src/modules/motion.js): cards travel between renders, the
// table's numbers stay true while they change, and nothing moves when motion
// is off. Presentation only: the pending decision and the rules state are the
// same before and after.
// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package; GAME_URL may select an existing preview.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/populated-resource-board.js', import.meta.url), 'utf8');
const output = process.env.TABLE_MOTION_OUTPUT || `${root}output/web-game/table-motion`;
mkdirSync(output, {recursive: true});
const server = process.env.GAME_URL ? null : express().use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const receipt = {checks: [], errors: []};
const check = name => { receipt.checks.push(name); console.log(`PASS ${name}`); };

async function table(width, height, {reduced = false} = {}) {
  const phone = width < 700;
  const context = await browser.newContext({viewport: {width, height}, reducedMotion: reduced ? 'reduce' : 'no-preference',
    isMobile: phone, hasTouch: phone});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => receipt.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '0');
  });
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  await page.addScriptTag({content: fixture});
  // Engine events reach the table as in a Solo game (main.js onEvent).
  await page.evaluate(() => {
    _game.onEvent = event => { if (event.type === 'gameEffect') _ui.showGameEffect(event); _ui.queueRender(); };
    window.__rules = () => JSON.stringify({phase: _game.phase, life: _game.players.map(p => p.life),
      hand: _ui.me.hand.map(c => c.iid), battlefield: _game.battlefield.map(c => c.iid).sort(), stack: _game.stack.length});
  });
  await page.mouse.move(1, 1);
  await settle(page);
  return {context, page};
}
// Every animation of the table has finished and the layer is gone.
async function settle(page) {
  await page.waitForFunction(() => !document.querySelector('#game > .motionlayer') &&
    document.getAnimations().every(animation => animation.effect?.getTiming().iterations === Infinity ||
      ['finished', 'idle'].includes(animation.playState)), undefined, {timeout: 6000});
}
// Runs a change, renders, and reports what the motion layer did with it.
const change = (page, action, argument) => page.evaluate(async ({source, argument}) => {
  const before = MTG.motionLog.length, pending = _ui.pending;
  const result = await new Function('argument', `return (${source})(argument)`)(argument);
  _ui.render();
  const layer = document.querySelector('#game > .motionlayer');
  return {
    result,
    log: MTG.motionLog.slice(before),
    samePending: _ui.pending === pending,
    layer: layer && {
      hidden: layer.getAttribute('aria-hidden') === 'true',
      clickThrough: [layer, ...layer.querySelectorAll('*')].every(node => getComputedStyle(node).pointerEvents === 'none'),
      // A flying copy is a picture: no card identity, focus stop or control.
      plain: !layer.querySelector('[data-iid], [data-stack-iid], [data-cname], [id], [tabindex], [role], button, a[href], input, select'),
      flights: layer.querySelectorAll('.motion-flight').length,
      numbers: [...layer.querySelectorAll('.motion-number')].map(node => node.textContent),
      plates: layer.querySelectorAll('.motion-plate').length,
      veils: layer.querySelectorAll('.motion-veil').length,
      text: layer.textContent.trim(),
    },
  };
}, {source: action.toString(), argument});
const kinds = report => report.log.map(entry => `${entry.kind}:${entry.key[0]}${entry.from ? `<${entry.from}` : ''}`);

try {
  // ---------- Desktop ----------
  {
    const {context, page} = await table(1440, 900);
    const rules = await page.evaluate(() => __rules());

    // A tapped creature turns from the pose it had; it does not jump to the new one.
    let report = await change(page, () => {
      const card = _game.creatures(_ui.me)[0];
      window.__tapped = card.iid;
      card.tapped = true;
      return card.iid;
    });
    assert.deepEqual(kinds(report), ['turn:b'], JSON.stringify(report.log));
    const turning = await page.evaluate(() => {
      const node = document.querySelector(`.myboard .mini[data-iid="${__tapped}"]`);
      const animation = node.getAnimations().find(item => !item.animationName);
      const frames = animation.effect.getKeyframes();
      return {from: frames[0].transform, ends: frames.length, running: animation.playState};
    });
    assert.equal(turning.running, 'running');
    assert.doesNotMatch(turning.from, /matrix|rotate/, 'the turn starts from the untapped pose');
    // The end keyframe is left out: the card ends in whatever pose the stylesheet gives it.
    assert.equal(turning.ends, 1);
    await settle(page);
    const resting = await page.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(`.myboard .mini[data-iid="${__tapped}"]`)).transform));
    assert.ok(Math.abs(Math.atan2(resting.b, resting.a)) > .05, 'and rests turned');
    check('1440px a tap turns the card from its last pose');

    // Your land flies from your hand to its place; its copy is a plain picture
    // and the real card appears under it as it lands.
    report = await change(page, () => {
      const me = _ui.me, land = me.hand.find(card => card.is('Land'));
      me.hand.splice(me.hand.indexOf(land), 1);
      land.zone = 'battlefield'; land.ctrl = me; _game.battlefield.push(land); _game.recalc();
      window.__land = land.iid;
      return land.name;
    });
    assert.ok(kinds(report).includes('fly:b<h'), JSON.stringify(report.log));
    assert.ok(await page.evaluate(() => document.querySelector('.hand .hcard').getAnimations().some(item => !item.animationName && item.playState === 'running')),
      'the hand closes the gap by moving its cards');
    assert.deepEqual({hidden: report.layer.hidden, clickThrough: report.layer.clickThrough, plain: report.layer.plain, flights: report.layer.flights},
      {hidden: true, clickThrough: true, plain: true, flights: 1}, JSON.stringify(report.layer));
    assert.equal(report.layer.text, report.result, 'the copy shows the card it copies and nothing else');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(`.mini[data-iid="${__land}"]`)).opacity), '0',
      'the real card waits for the copy to land');
    await settle(page);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(`.mini[data-iid="${__land}"]`)).opacity), '1');
    assert.deepEqual(await page.evaluate(() => MTG.motionState()), {flights: 0, remembered: 0, layer: false});
    check('1440px a land flies from the hand to its place; the layer is click-through, plain and removed afterwards');

    // A drawn card comes from your library counter; an opponent's land from their hand counter.
    report = await change(page, () => { const card = _ui.me.library.pop(); card.zone = 'hand'; _ui.me.hand.push(card); });
    assert.ok(kinds(report).includes('fly:h<library'), JSON.stringify(report.log));
    await settle(page);
    report = await change(page, () => {
      const player = _game.players[1], land = player.hand.find(card => card.is('Land'));
      player.hand.splice(player.hand.indexOf(land), 1);
      land.zone = 'battlefield'; land.ctrl = player; land.tapped = true; _game.battlefield.push(land); _game.recalc();
    });
    assert.ok(kinds(report).includes('fly:b<hand'), JSON.stringify(report.log));
    await settle(page);
    check('1440px a drawn card and an opponent\'s land come from the zone counters');

    // Your spell goes to where the Stack shows it, then to your graveyard counter.
    report = await change(page, () => {
      const me = _ui.me, spell = me.hand.find(card => card.name === 'Counterspell');
      me.hand.splice(me.hand.indexOf(spell), 1);
      spell.zone = 'stack'; _game.stack.push({kind: 'spell', card: spell, ctrl: me, targets: []});
      window.__spell = spell;
    });
    assert.ok(kinds(report).includes('fly:s<h'), JSON.stringify(report.log));
    await settle(page);
    report = await change(page, () => { _game.stack.length = 0; __spell.zone = 'graveyard'; _ui.me.graveyard.push(__spell); });
    assert.ok(kinds(report).includes('away:s<graveyard'), JSON.stringify(report.log));
    await settle(page);
    check('1440px a spell flies to the Stack and from there to its owner\'s graveyard');

    // A card under the pointer is lifted by the stylesheet. When the table is
    // redrawn with a new decision its node is replaced: that is no change of
    // the table, and motion leaves the card to the stylesheet.
    await page.locator('.hand .hcard').nth(1).hover();
    await page.waitForTimeout(350);
    report = await change(page, () => {
      _ui.pendings = [];
      void _ui.me.controller.decide(_game, {type: 'main', player: _ui.me, phase: _game.phase, casts: [], acts: [], lands: []});
    });
    assert.deepEqual(report.log, [], JSON.stringify(report.log));
    await page.mouse.move(1, 1);
    await settle(page);
    check('1440px a redrawn card under the pointer is not treated as moved');

    // A permanent that leaves play is carried by the engine's own effect: no second copy.
    report = await change(page, async () => { await _game.move(_game.creatures(_ui.me)[1], 'graveyard'); });
    assert.equal(report.log.filter(entry => entry.kind === 'fly').length, 0, JSON.stringify(report.log));
    assert.ok(report.log.some(entry => entry.kind === 'move'), 'the lane closes the gap by moving its cards');
    assert.equal(await page.locator('.gamefxlayer .gamefx-cardghost').count(), 1, 'the zone-move effect carries the card');
    await page.waitForFunction(() => !document.querySelector('.gamefx-cardghost'));
    await settle(page);
    check('1440px a card that leaves play is carried once, and its lane closes the gap');

    // A life total is true the moment the table is drawn; the old number leaves as a copy.
    report = await change(page, () => {
      _game.players[1].life -= 9; _ui.me.life += 4;
      return [_game.players[1].life, _ui.me.life];
    });
    const shown = await page.evaluate(() => [document.querySelector('.opprow[data-player-id="1"] .opplife b').textContent,
      document.querySelector('.myboard .melife').firstChild.nodeValue]);
    assert.deepEqual(shown.map(Number), report.result, 'the table shows the new totals at once');
    assert.deepEqual(report.layer.numbers.map(Number).sort((a, b) => a - b), [report.result[1] - 4, report.result[0] + 9].sort((a, b) => a - b),
      'the old totals leave as copies');
    await settle(page);
    check('1440px a life total rolls over without ever showing a wrong number');

    // A dialog that closes leaves an empty plate and its dim, nothing of its content.
    await page.evaluate(() => { _ui.quickMenuOpen = true; _ui.render(); });
    await page.locator('#game .quickmenu').waitFor();
    await settle(page);
    report = await change(page, () => { _ui.quickMenuOpen = false; });
    assert.deepEqual({plates: report.layer.plates, veils: report.layer.veils, text: report.layer.text, plain: report.layer.plain},
      {plates: 1, veils: 1, text: '', plain: true}, JSON.stringify(report.layer));
    assert.equal(await page.locator('#game .quickmenu').count(), 0, 'the dialog itself is gone at once');
    await settle(page);
    check('1440px a closed dialog fades as an empty plate and dim');

    // A failure inside motion never reaches the render, whose own failure is
    // a recovery dialog over the table: that render keeps still, the next moves.
    const survived = await page.evaluate(() => {
      const animate = Element.prototype.animate, error = console.error;
      let reported = 0;
      Element.prototype.animate = () => { throw new Error('animation refused'); };
      console.error = () => { reported++; };
      try {
        const card = _game.creatures(_ui.me)[2];
        card.tapped = true;
        _ui.render();
        return {recovery: !!document.querySelector('[data-testid="view-recovery"]'), reported,
          drawnTapped: document.querySelector(`.myboard .mini[data-iid="${card.iid}"]`).classList.contains('tapped'),
          layer: !!document.querySelector('#game > .motionlayer')};
      } finally { Element.prototype.animate = animate; console.error = error; }
    });
    assert.deepEqual(survived, {recovery: false, reported: 1, drawnTapped: true, layer: false}, JSON.stringify(survived));
    report = await change(page, () => { _game.creatures(_ui.me)[3].tapped = true; });
    assert.deepEqual(kinds(report), ['turn:b'], 'the next render moves again');
    await settle(page);
    check('1440px a failure inside motion leaves the render whole and the table still for that render');

    assert.equal(report.samePending, true);
    // The changes above were made by this test; motion itself changed nothing.
    const state = await page.evaluate(() => ({pending: _ui.pending?.q.type, phase: _game.phase}));
    assert.deepEqual(state, {pending: 'main', phase: JSON.parse(rules).phase});
    check('1440px the pending decision is the same object throughout');

    // The turn announcement: words, no emoji; an opponent's is said on their lane.
    const banners = await page.evaluate(() => {
      const read = () => { const node = document.querySelector('.turnbanner'); const r = node.getBoundingClientRect();
        return {cls: node.className, text: node.textContent.replace(/\s+/g, ' ').trim(), x: r.left + r.width / 2, y: r.top + r.height / 2}; };
      _ui.showBanner('YOUR TURN', true, {player: _ui.me, turn: 13});
      const mine = read();
      _ui.showBanner('Turn 13: AI Wolf', false, {player: _game.players[2], turn: 13});
      const seat = read(), lane = document.querySelector('.opprow[data-player-id="2"]').getBoundingClientRect();
      const count = document.querySelectorAll('.turnbanner').length;
      document.querySelectorAll('.turnbanner').forEach(node => node.remove());
      return {mine, seat, count, inLane: seat.x > lane.left && seat.x < lane.right && seat.y > lane.top && seat.y < lane.bottom};
    });
    assert.match(banners.mine.cls, /\bmine\b/); assert.match(banners.mine.text, /^Turn 13 Your turn$/);
    assert.match(banners.seat.cls, /\bseat\b/); assert.match(banners.seat.text, /^Turn 13 AI Wolf$/);
    assert.equal(banners.count, 1, 'one announcement at a time');
    assert.equal(banners.inLane, true, "an opponent's turn is announced on their own lane");
    check('1440px turn announcements: words only, one at a time, an opponent\'s on their lane');

    // Prompts lead with the table's icon, not a platform emoji.
    const prompt = await page.evaluate(() => {
      const text = document.querySelector('.promptbar .ptext');
      return {icon: !!text.querySelector('svg.leadicon'), text: text.textContent.trim()};
    });
    assert.equal(prompt.icon, true);
    assert.match(prompt.text, /^Main phase 1/);
    check('1440px the prompt leads with an icon of the table\'s set');

    await page.screenshot({path: `${output}/desktop.png`});
    await context.close();
  }

  // ---------- Motion off ----------
  for (const [label, setup] of [
    ['the in-app Reduced motion setting', page => page.evaluate(() => { _ui.reducedMotion = true; document.body.classList.add('reduced-motion'); })],
    ['an instant game', page => page.evaluate(() => { _game.speedFactor = 0; })],
  ]) {
    const {context, page} = await table(1440, 900);
    await setup(page);
    await page.evaluate(() => _ui.render());
    const report = await change(page, () => {
      const me = _ui.me, land = me.hand.find(card => card.is('Land'));
      me.hand.splice(me.hand.indexOf(land), 1);
      land.zone = 'battlefield'; land.ctrl = me; _game.battlefield.push(land);
      _game.creatures(me)[0].tapped = true; me.life -= 5; _game.recalc();
      window.__land = land.iid;
    });
    assert.deepEqual(report.log, [], label);
    assert.equal(report.layer, null, label);
    assert.equal(await page.evaluate(() => document.querySelector(`.mini[data-iid="${__land}"]`).getAnimations().length), 0, label);
    await context.close();
    check(`1440px ${label} keeps the table still`);
  }
  {
    const {context, page} = await table(1440, 900, {reduced: true});
    const report = await change(page, () => { _game.creatures(_ui.me)[0].tapped = true; _ui.me.life -= 5; });
    assert.deepEqual(report.log, []); assert.equal(report.layer, null);
    await context.close();
    check('1440px the system reduced-motion preference keeps the table still');
  }

  // ---------- Phone ----------
  {
    const {context, page} = await table(390, 844);

    // Lands are counts per name: the played land flies into its count, which stays in place.
    let report = await change(page, () => {
      const me = _ui.me, land = me.hand.find(card => card.is('Land'));
      me.hand.splice(me.hand.indexOf(land), 1);
      land.zone = 'battlefield'; land.ctrl = me; _game.battlefield.push(land); _game.recalc();
      window.__land = land;
      return land.name;
    });
    assert.ok(kinds(report).includes('fly:b<h'), JSON.stringify(report.log));
    const chip = await page.evaluate(() => {
      const node = [...document.querySelectorAll('.myboard .landstack')].find(item => item.dataset.landIids.split(' ').includes(String(__land.iid)));
      return {name: node.querySelector('.lname').textContent, opacity: getComputedStyle(node).opacity};
    });
    assert.deepEqual(chip, {name: report.result, opacity: '1'}, 'the count is never hidden for the flight');
    await settle(page);
    check('390px a land flies from the hand into its count');

    // The Stack is a tab: your spell flies into it.
    report = await change(page, () => {
      const me = _ui.me, spell = me.hand.find(card => card.name === 'Counterspell');
      me.hand.splice(me.hand.indexOf(spell), 1);
      spell.zone = 'stack'; _game.stack.push({kind: 'spell', card: spell, ctrl: me, targets: []});
    });
    assert.ok(kinds(report).includes('away:h<stack'), JSON.stringify(report.log));
    assert.equal(report.layer.flights, 1);
    await settle(page);
    check('390px a cast card flies into the Stack tab');

    // Seats show the true total at once as well.
    report = await change(page, () => { _game.stack.length = 0; _game.players[1].life -= 7; return _game.players[1].life; });
    assert.equal(await page.evaluate(() => parseInt(document.querySelector('.ct-seat[data-focus-player="1"] .ct-seat-life').textContent, 10)), report.result);
    assert.ok(report.layer.numbers.some(text => parseInt(text, 10) === report.result + 7), JSON.stringify(report.layer.numbers));
    await settle(page);
    check('390px a seat\'s life total rolls over and is true at once');

    // Another view is another layout: nothing travels across it.
    report = await change(page, () => { _ui.mobileView = 'table'; });
    assert.equal(report.log.length, 0, JSON.stringify(report.log));
    assert.equal(report.layer, null);
    await page.evaluate(() => { _ui.mobileView = 'mine'; _ui.render(); });
    await settle(page);
    // A phone follows the active player to their board on a new turn. Their
    // cards were already on the table: none of them "arrives".
    report = await change(page, () => { _game.turnPlayer = _game.players[2]; _game.turnNo += 1; });
    assert.equal(await page.evaluate(() => document.querySelector('#game').dataset.mobileBoard), 'opponent');
    assert.equal(await page.locator('.opprow.ct-focused[data-player-id="2"] .mini').first().isVisible(), true, "the active player's board is shown");
    assert.equal(report.log.length, 0, JSON.stringify(report.log));
    assert.equal(report.layer, null);
    report = await change(page, () => { _game.turnPlayer = _game.players[3]; _game.turnNo += 1; });
    assert.equal(report.log.length, 0, JSON.stringify(report.log));
    // On that board, the opponent's land flies from their hand counter into their land count.
    report = await change(page, () => {
      const player = _game.players[3], land = player.hand.find(card => card.is('Land'));
      player.hand.splice(player.hand.indexOf(land), 1);
      land.zone = 'battlefield'; land.ctrl = player; _game.battlefield.push(land); _game.recalc();
    });
    assert.ok(kinds(report).includes('fly:b<hand'), JSON.stringify(report.log));
    await settle(page);
    check('390px switching the view or following the turn to another board moves nothing; a card played there still flies');

    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow');
    await page.screenshot({path: `${output}/phone.png`});
    await context.close();
  }

  // ---------- The match's last screen ----------
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    const {context, page} = await table(width, height);
    const screen = await page.evaluate(() => {
      const g = _game;
      g.turnNo = 17; g.gameOver = true; g.winner = g.players[2];
      g.players.forEach(player => { player.lost = player !== g.winner; });
      g.lg('AI Dragon loses (life reached 0).', 'lose'); g.lg('AI Wolf WINS!', 'win');
      _ui.pendings = []; _ui.render();
      const panel = document.querySelector('.matchrecap'), size = selector => parseFloat(getComputedStyle(panel.querySelector(selector)).fontSize);
      const r = panel.getBoundingClientRect();
      return {
        cls: panel.className, title: panel.querySelector('.gameover').textContent, kicker: panel.querySelector('.recaptitle > span').textContent,
        art: panel.querySelector('.recapart img')?.getAttribute('src') || '', rows: panel.querySelectorAll('.recapstandings > div').length,
        winnerFirst: panel.querySelector('.recapstandings > div').classList.contains('winner'),
        sizes: [size('.recapstandings span b'), size('.recapstandings span small'), size('.recaphighlights li'), size('.recaptitle p')],
        inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      };
    });
    assert.match(screen.cls, /\blost\b/); assert.equal(screen.kicker, 'DEFEAT'); assert.equal(screen.title, 'AI Wolf wins.');
    assert.match(screen.art, /galadriel/i, 'the winner\'s commander art heads the screen');
    assert.equal(screen.rows, 4); assert.equal(screen.winnerFirst, true);
    assert.ok(screen.sizes.every(px => px >= 12), `body text is at least 12px: ${screen.sizes}`);
    assert.equal(screen.inside, true, 'the panel fits the screen');
    await page.screenshot({path: `${output}/match-end-${width}.png`});
    await context.close();
    check(`${width}px the match ends under the winner's commander, at body size`);
  }

  assert.deepEqual(receipt.errors, []);
  writeFileSync(`${output}/result.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({checks: receipt.checks.length, errors: receipt.errors}));
} catch (error) {
  writeFileSync(`${output}/failure.json`, JSON.stringify({...receipt, message: error.message}, null, 2));
  throw error;
} finally {
  await browser.close();
  server?.close();
}
