// The phone table (src/phone-experience.css, src/modules/phone-table.js): the
// board is the screen. Your portrait, life and piles are one bar beside the
// hand; the hand is a fan whose cards keep their middle in view; a prompt
// with one action is one line; a tall phone shows the two front lines; in
// Combat your creatures are cards. Presentation only: the pending decision
// is the same before and after, and the table at rest stays within the
// phone's graphics memory.
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
const output = process.env.PHONE_TABLE_OUTPUT || `${root}output/web-game/phone-table`;
mkdirSync(output, {recursive: true});
const server = express().use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const errors = [];
const check = name => console.log(`PASS ${name}`);

async function table(width, height, {scale = 2, motion = false} = {}) {
  const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: scale, isMobile: true, hasTouch: true, reducedMotion: motion ? 'no-preference' : 'reduce'});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(still => { localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', still); }, motion ? '0' : '1');
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  await page.addScriptTag({content: fixture});
  await page.locator('#game .promptbar .ptext').first().waitFor();
  await page.evaluate(() => {
    window.__pending = _ui.pending;
    window.__box = selector => { const node = typeof selector === 'string' ? document.querySelector(selector) : selector; return node && node.getClientRects().length ? node.getBoundingClientRect().toJSON() : null; };
  });
  return {context, page};
}
const samePending = page => page.evaluate(() => _ui.pending === window.__pending);

try {
  // ── A tall phone: the whole table. ──
  {
    const {context, page} = await table(390, 844);
    const layout = await page.evaluate(() => {
      const game = document.querySelector('#game'), box = window.__box;
      return {
        phone: game.classList.contains('ct-phone'), width: innerWidth, scroll: document.documentElement.scrollWidth,
        hero: box('.myboard > .ct-player-head'), portrait: box('.ct-hero .ct-portrait'), life: box('.ct-hero .melife'), lifeSize: parseFloat(getComputedStyle(document.querySelector('.ct-hero .melife')).fontSize),
        piles: [...document.querySelectorAll('.ct-hero .zbtns > *')].map(pile => ({...box(pile), cls: pile.className})),
        lanes: box('.myboard > .mybattlefieldmain'), lands: box('.myboard > .landrow'), prompt: box('.promptbar'), hand: box('.handwrap'), tabs: box('.mobileviewtabs'),
        heading: box('.handtools .handtoolstitle'), sort: box('.handtools .handsort'), frame: getComputedStyle(document.querySelector('.myboard')).borderTopWidth,
        seats: [...document.querySelectorAll('.ct-seat')].map(seat => ({...box(seat), across: seat.classList.contains('across'), pressed: seat.getAttribute('aria-pressed')})),
        order: [...game.children].map(child => child.classList[0]).slice(0, 3),
      };
    });
    assert.equal(layout.phone, true);
    assert.ok(layout.scroll <= layout.width, 'the page does not scroll sideways');
    // You: one bar under the board and above the prompt, the life in large figures.
    assert.ok(layout.hero && layout.hero.width >= layout.width - 2, JSON.stringify(layout.hero));
    assert.ok(layout.hero.top >= layout.lands.bottom - 1 && layout.hero.bottom <= layout.prompt.top + 1, `your bar sits between the board and the prompt: ${JSON.stringify(layout)}`);
    assert.ok(layout.prompt.bottom <= layout.hand.top + 1 && layout.hand.bottom <= layout.tabs.top + 1, 'then the prompt, the hand and the tabs');
    assert.ok(layout.lifeSize >= 24, `the life total is large: ${layout.lifeSize}px`);
    assert.ok(layout.portrait.width >= 44 && layout.life.left >= layout.portrait.right - 1);
    assert.equal(layout.piles.length, 4, 'Hand, Library, Graveyard, Exile');
    for (const pile of layout.piles) assert.ok(pile.width >= 44 && pile.height >= 44, `a pile is a finger wide: ${JSON.stringify(pile)}`);
    assert.match(layout.piles[0].cls, /handexpand/, 'the Hand pile is the way to the whole hand');
    // The board has no frame, and the hand row no heading.
    assert.equal(layout.frame, '0px');
    assert.equal(layout.heading, null); assert.equal(layout.sort, null);
    // The seats come right after the header in the document: drawn before the boards (graphics memory).
    assert.deepEqual(layout.order.slice(0, 2), ['topbar', 'ct-seat-ribbon']);
    for (const seat of layout.seats) assert.ok(seat.height >= 44, 'a seat is a touch target');
    await page.screenshot({path: `${output}/mine-390.png`});
    check('390×844: your portrait, life and piles are one bar between the board and the prompt; no frame, no hand heading');

    // The fan.
    const fan = await page.evaluate(() => {
      const hand = document.querySelector('.hand'), cards = [...hand.querySelectorAll(':scope > .hcard')], row = hand.getBoundingClientRect();
      return {count: cards.length, row: row.toJSON(), cards: cards.map(card => {
        const r = card.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const inRow = x >= row.left && x <= row.right;
        return {left: r.left, right: r.right, top: r.top, width: r.width, height: r.height, playable: card.classList.contains('castable'), inRow,
          hit: inRow ? document.elementFromPoint(x, y)?.closest('.hcard') === card : null};
      })};
    });
    assert.ok(fan.count >= 6, `a hand of ${fan.count}`);
    assert.ok(fan.cards[0].width >= 84 && fan.cards[0].height >= 118, `hand cards are large: ${JSON.stringify(fan.cards[0])}`);
    const steps = fan.cards.slice(1).map((card, index) => card.left - fan.cards[index].left);
    assert.ok(steps.every(step => step < fan.cards[0].width), 'the cards overlap');
    assert.ok(steps.every(step => step >= 44 && step > fan.cards[0].width / 2), `each card keeps its middle and a finger's width in view: ${steps}`);
    assert.ok(fan.cards.filter(card => card.inRow).every(card => card.hit === true), 'a touch on the middle of a card is that card');
    const shown = fan.cards.filter(card => card.right <= fan.row.right + 1).length;
    assert.ok(shown >= 5, `at least five cards of the hand are whole in view: ${shown}`);
    const playable = fan.cards.filter(card => card.playable), plain = fan.cards.filter(card => !card.playable);
    assert.ok(playable.length && plain.length && Math.max(...playable.map(card => card.top)) < Math.min(...plain.map(card => card.top)), 'what you can play stands up');
    // A card in the middle of the fan opens its sheet, as before.
    const middle = page.locator('.hand > .hcard').nth(2), name = await middle.getAttribute('data-cname');
    await middle.tap();
    assert.equal(await page.evaluate(() => _ui.sheet?.card?.name), name);
    await page.evaluate(() => { _ui.sheet = null; _ui.render(); });
    // The Hand pile opens the whole hand, where the heading and sorting are.
    await page.locator('.ct-hero .handexpand').tap();
    assert.equal(await page.evaluate(() => document.querySelector('#game').dataset.mobileView), 'hand');
    assert.equal(await page.locator('.handtools .handsort:visible').count(), 1);
    await page.locator('.handtools .handexpand').tap();
    assert.equal(await page.evaluate(() => document.querySelector('#game').dataset.mobileView), 'mine');
    assert.equal(await samePending(page), true);
    check('390×844: the hand is a fan whose cards keep their middle in view; the Hand pile opens the whole hand');

    // One action: the instruction and its button share a line.
    const prompt = await page.evaluate(() => {
      const bar = document.querySelector('.promptbar'), text = window.__box(bar.querySelector('.ptext')), button = window.__box(bar.querySelector('.btnrow .pbtn'));
      return {one: bar.classList.contains('ct-one-action'), buttons: bar.querySelectorAll('.pbtn').length, text, button, bar: window.__box(bar)};
    });
    assert.equal(prompt.buttons, 1); assert.equal(prompt.one, true);
    assert.ok(prompt.button.left >= prompt.text.right - 1 && prompt.button.top < prompt.text.bottom && prompt.button.bottom > prompt.text.top, `one line: ${JSON.stringify(prompt)}`);
    assert.ok(prompt.button.height >= 48 && prompt.button.width >= 112 && prompt.button.right <= prompt.bar.right + 1, 'the action is a thumb-sized button at the right');
    check('390×844: a prompt with one action is one line with the button at the thumb');

    // Two sides: the front line across the table, then an opponent's board with yours under it.
    const sides = await page.evaluate(() => {
      const box = window.__box, row = document.querySelector('.opprow.ct-focused'), strip = row.querySelector('.oppstrip');
      const seat = document.querySelector('.ct-seat.across');
      return {across: document.querySelector('#game').classList.contains('ct-across'), row: box(row), strip: box(strip), name: strip.dataset.acrossName,
        label: getComputedStyle(strip, '::before').content, player: _game.players.find(p => String(p.idx) === row.dataset.playerId).name,
        seat: seat?.dataset.focusPlayer, focused: row.dataset.playerId, pressed: document.querySelectorAll('.ct-seat[aria-pressed="true"]').length,
        cards: [...row.querySelectorAll('.mini')].map(card => box(card)).filter(Boolean), head: box(row.querySelector('.opphead')), lands: box(row.querySelector('.oppresourcelane')),
        mine: box('.myboard .creaturelane .mini'), creatures: _game.creatures(_game.players.find(p => String(p.idx) === row.dataset.playerId)).length};
    });
    assert.equal(sides.across, true);
    assert.equal(sides.name, sides.player); assert.ok(sides.label.includes(sides.player), `the strip is headed by its player: ${sides.label}`);
    assert.equal(sides.seat, sides.focused, 'the seat across is marked'); assert.equal(sides.pressed, 0, 'and not selected: your board is the open one');
    assert.equal(sides.head, null); assert.equal(sides.lands, null);
    assert.equal(sides.cards.length, sides.creatures, 'its creatures stand across the table');
    assert.ok(sides.cards.every(card => card.width >= 44 && card.bottom <= sides.mine.top), `small cards above your own: ${JSON.stringify(sides.cards[0])}`);
    assert.ok(sides.row.height <= 130, `a strip, not a board: ${sides.row.height}px`);
    // A card across the table opens its sheet.
    await page.locator('.opprow.ct-focused .mini').first().tap();
    assert.equal(await page.evaluate(() => !!_ui.sheet?.card && _ui.sheet.card.ctrl !== _ui.me), true);
    await page.evaluate(() => { _ui.sheet = null; _ui.render(); });
    // The seat opens that opponent's board; yours is the strip now, your bar stays.
    await page.locator(`.ct-seat[data-focus-player="${sides.focused}"]`).tap();
    const open = await page.evaluate(() => {
      const box = window.__box, row = document.querySelector('.opprow.ct-focused'), lanes = document.querySelector('.myboard > .mybattlefieldmain');
      return {board: document.querySelector('#game').dataset.mobileBoard, head: box(row.querySelector('.opphead')), zones: box(row.querySelector('.ct-player-zones')), lands: box(row.querySelector('.oppresourcelane')),
        row: box(row), mine: box(lanes), label: getComputedStyle(lanes, '::before').content, support: box('.myboard .supportlane'), myLands: box('.myboard > .landrow'),
        hero: box('.myboard > .ct-player-head'), prompt: box('.promptbar'), life: document.querySelector('.ct-hero .melife').textContent.trim(),
        zoneSizes: [...row.querySelectorAll('.ct-player-zones > .zonecounter')].map(zone => box(zone))};
    });
    assert.equal(open.board, 'opponent');
    assert.ok(open.head && open.zones && Math.abs(open.head.top - open.zones.top) < 12 && open.zones.left >= open.head.left, `its name and piles share a line: ${JSON.stringify(open)}`);
    assert.ok(open.zoneSizes.length === 4 && open.zoneSizes.every(zone => zone.width >= 44 && zone.height >= 44));
    assert.ok(open.lands, 'its lands are on its board');
    assert.ok(open.mine && open.mine.top >= open.row.bottom - 1 && open.mine.height <= 130 && /You/.test(open.label), `your front line stands below it: ${JSON.stringify(open.mine)} ${open.label}`);
    assert.equal(open.support, null); assert.equal(open.myLands, null);
    assert.ok(open.hero && open.hero.bottom <= open.prompt.top + 1 && /^\d+/.test(open.life), 'your life stays in view');
    await page.screenshot({path: `${output}/opponent-390.png`});
    await page.getByRole('navigation', {name: 'Arena view'}).getByRole('button', {name: /^Mine/i}).tap();
    assert.equal(await page.evaluate(() => document.querySelector('#game').dataset.mobileBoard), 'mine');
    // Nothing across: one line says so.
    const empty = await page.evaluate(() => {
      const id = Number(document.querySelector('.opprow.ct-focused').dataset.playerId), player = _game.players[id];
      window.__removed = _game.battlefield.filter(card => card.ctrl === player && !card.is('Land'));
      for (const card of window.__removed) _game.battlefield.splice(_game.battlefield.indexOf(card), 1);
      _game.recalc(); _ui.render();
      const strip = document.querySelector('.opprow.ct-focused .oppstrip');
      const result = {note: strip.dataset.acrossNote, after: getComputedStyle(strip, '::after').content, height: strip.getBoundingClientRect().height};
      _game.battlefield.push(...window.__removed); _game.recalc(); _ui.render();
      return result;
    });
    assert.equal(empty.note, 'No creatures'); assert.ok(empty.after.includes('No creatures')); assert.ok(empty.height <= 32, `one line: ${empty.height}px`);
    assert.equal(await samePending(page), true);
    check('390×844: the front line across the table stands above your board; an open opponent\'s board keeps yours and your life under it');

    // Combat: your creatures are cards.
    await page.evaluate(() => {
      const g = _game, ui = _ui, you = ui.me;
      ui.pendings = []; ui.react = null; ui.pending = null;
      g.phase = 'combat'; g.step = 'attackers'; g.turnPlayer = you; g.combat = {attackers: [], defenders: new Map()};
      const creatures = g.creatures(you); g.recalc();
      window.__attack = null;
      void you.controller.decide(g, {type: 'attackers', eligible: creatures, opponents: g.players.slice(1), attackTargets: [...g.players.slice(1)], forced: []}).then(answer => { window.__attack = answer; });
      ui.render();
    });
    await page.waitForFunction(() => document.querySelector('#game').dataset.mobileView === 'combat');
    const combat = await page.evaluate(() => {
      const box = window.__box, units = [...document.querySelectorAll('.ct-mobile-combat-roster > .ct-mobile-combat-unit')];
      return {units: units.map(unit => ({card: box(unit), art: box(unit.querySelector('.ct-mobile-combat-art img')), inspect: box(unit.querySelector('.ct-mobile-combat-inspect')),
        stats: unit.querySelector('.ct-mobile-combat-unit-copy strong')?.textContent, state: unit.querySelector('.ct-mobile-combat-assignment')?.textContent})),
        roster: box('.ct-mobile-combat-roster'), actions: box('.ct-combat-actions, .promptbar'), eligible: _ui.pending.q.eligible.length};
    });
    assert.equal(combat.units.length, combat.eligible);
    const firstRow = combat.units.filter(unit => Math.abs(unit.card.top - combat.units[0].card.top) < 2);
    assert.equal(firstRow.length, 3, 'three cards to a row');
    assert.ok(firstRow.every(unit => unit.art.width >= 96 && unit.art.height >= unit.art.width * 1.3), `a creature is its picture: ${JSON.stringify(firstRow[0].art)}`);
    assert.ok(combat.units.every(unit => /^\d+\/\d+$/.test(unit.stats) && unit.state), 'with its strength and what it is doing');
    assert.ok(combat.units.every(unit => unit.inspect.width >= 44 && unit.inspect.height >= 44), 'Inspect has a finger\'s room');
    // Inspect looks; a touch on the card chooses it.
    await page.locator('.ct-mobile-combat-roster .ct-mobile-combat-inspect').first().tap();
    assert.equal(await page.evaluate(() => !!_ui.sheet?.card), true);
    await page.evaluate(() => { _ui.sheet = null; _ui.render(); });
    await page.locator('.ct-mobile-combat-roster .ct-mobile-combat-card').nth(1).tap();
    const chosen = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.ct-mobile-combat-roster .ct-mobile-combat-card')];
      return {waiting: _ui.pending.attackPending?.length || 0, marked: cards.filter(card => card.matches('.ct-attack-pending, .ct-combat-selected')).length,
        lifted: cards[1].getBoundingClientRect().top < cards[0].getBoundingClientRect().top};
    });
    assert.ok(chosen.waiting === 1 && chosen.marked === 1, JSON.stringify(chosen));
    await page.screenshot({path: `${output}/combat-390.png`});
    check('390×844: in Combat your creatures are cards, three to a row, with Inspect in a corner');
    await context.close();
  }

  // ── Shorter phones show one board at a time; your bar stays. ──
  for (const [width, height] of [[390, 660], [320, 568]]) {
    const {context, page} = await table(width, height);
    const mine = await page.evaluate(() => {
      const box = window.__box;
      return {phone: document.querySelector('#game').classList.contains('ct-phone'), across: box('.oppsouter'), hero: box('.myboard > .ct-player-head'), prompt: box('.promptbar'),
        hand: box('.handwrap'), tabs: box('.mobileviewtabs'), card: box('.myboard .creaturelane .mini'), lands: box('.myboard > .landrow'), lanes: box('.myboard > .mybattlefieldmain'),
        piles: [...document.querySelectorAll('.ct-hero .zbtns > *')].map(pile => box(pile)), scroll: document.documentElement.scrollWidth, width: innerWidth,
        handCards: [...document.querySelectorAll('.hand > .hcard')].slice(0, 3).map(card => { const r = card.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.hcard') === card; })};
    });
    assert.equal(mine.phone, true); assert.equal(mine.across, null, 'a short phone keeps the room for your board');
    assert.ok(mine.scroll <= mine.width);
    assert.ok(mine.card.bottom <= mine.lands.top + 1 && mine.card.top >= mine.lanes.top - 1, `a whole creature is in view above the lands: ${JSON.stringify(mine)}`);
    assert.ok(mine.hero.bottom <= mine.prompt.top + 1 && mine.hand.bottom <= mine.tabs.top + 1 && mine.tabs.bottom <= height + 1);
    assert.ok(mine.piles.length === 4 && mine.piles.every(pile => pile.width >= 44 && pile.height >= 44));
    assert.ok(mine.handCards.every(Boolean));
    await page.locator('.ct-seat').nth(1).tap();
    const open = await page.evaluate(() => ({lanes: window.__box('.myboard > .mybattlefieldmain'), hero: window.__box('.myboard > .ct-player-head'), row: window.__box('.opprow.ct-focused'),
      card: window.__box('.opprow.ct-focused .mini')}));
    assert.equal(open.lanes, null, 'one board at a time');
    assert.ok(open.hero && open.row.bottom <= open.hero.top + 1 && open.card, 'your portrait and life stay under an open board');
    assert.equal(await samePending(page), true);
    await page.screenshot({path: `${output}/opponent-${width}.png`});
    check(`${width}×${height}: one board at a time, with your portrait, life and piles always in view`);
    await context.close();
  }

  // ── A short landscape screen keeps its side-by-side layout. ──
  {
    const {context, page} = await table(844, 390);
    const landscape = await page.evaluate(() => ({phone: document.querySelector('#game').classList.contains('ct-phone'), heading: window.__box('.handtools .handtoolstitle'),
      first: [...document.querySelector('#game').children].map(child => child.classList[0]).indexOf('ct-seat-ribbon')}));
    assert.equal(landscape.phone, false);
    assert.ok(landscape.heading, 'the hand keeps its heading there');
    check('844×390: a short landscape screen is not the phone table');
    await context.close();
  }

  // ── Graphics memory at device pixel ratio 3 (DESIGN.md, phones). ──
  {
    // With motion, as a game is played: the idle animations are part of the count.
    const {context, page} = await table(390, 844, {scale: 3, motion: true});
    await page.waitForTimeout(2500);
    const cdp = await context.newCDPSession(page);
    let layers = [];
    cdp.on('LayerTree.layerTreeDidChange', event => { if (event.layers) layers = event.layers; });
    await cdp.send('LayerTree.enable');
    for (let i = 0; i < 20 && !layers.length; i++) await page.waitForTimeout(150);
    const drawn = layers.filter(layer => layer.drawsContent);
    const megabytes = drawn.reduce((sum, layer) => sum + layer.width * layer.height * 9 * 4, 0) / 1048576;
    // The document itself is one screen. No other layer may come near it: the
    // table before held two of them at rest (44 MB); this one measures 26 MB.
    const screens = drawn.filter(layer => layer.width * layer.height >= 390 * 844 * .6).length;
    assert.ok(drawn.length > 0, 'the layer tree was read');
    assert.equal(screens, 1, `only the document is as large as the screen: ${drawn.map(layer => `${layer.width}x${layer.height}`).join(' ')}`);
    assert.ok(megabytes <= 38, `at rest the table holds ${megabytes.toFixed(1)} MB of layers`);
    const filtered = await page.evaluate(() => [...document.querySelectorAll('#game .topbar, #game .keywordbadge')].filter(node => getComputedStyle(node).backdropFilter !== 'none').length);
    assert.equal(filtered, 0, 'nothing on the table at rest has a backdrop filter');
    check(`390×844 at pixel ratio 3: ${megabytes.toFixed(1)} MB of graphics layers at rest in ${layers.length} layers, one of them a screen`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
