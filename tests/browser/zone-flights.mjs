// Card flights between zones (discard, mill, exile, return to hand) are drawn
// from two renders of the table. They name only what happened: a spell that
// resolved is not "milled", a land played and sacrificed is not "discarded".
// On a phone a hidden seat's flight starts at that player's seat chip, with
// its name badge inside the screen, never in the corner.
// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package; GAME_URL may select an existing preview.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const server = process.env.GAME_URL ? null : express().use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const errors = [];

async function open(width) {
  const phone = width <= 600;
  const page = await browser.newPage(phone ? {viewport: {width, height: 844}, hasTouch: true, isMobile: true} : {viewport: {width, height: 900}});
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('mtgOnboardingComplete', '1'));
  const url = new URL(process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`);
  url.searchParams.set('smokeDeck', 'Quick Draw'); url.searchParams.set('seed', '11081');
  await page.goto(url.href);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', undefined, {timeout: 120000});
  await page.locator('.modal .pbtn.primary').click();
  await page.evaluate(() => { _game.speedFactor = 0; });
  for (let i = 0; i < 200; i++) {
    if (await page.evaluate(() => _ui.pending?.q.type === 'main')) break;
    const proceed = page.locator('button.pbtn:visible').filter({hasText: /^(Proceed|Continue to my turn)(?:\s|$)/});
    if (await proceed.count()) await proceed.first().click(); else await page.waitForTimeout(100);
  }
  await page.mouse.move(2, 2);
  // Record every flight as it is added: its label, cards and badge box.
  await page.evaluate(() => {
    window.__flights = [];
    new MutationObserver(records => { for (const record of records) for (const added of record.addedNodes) {
      if (!added.classList?.contains('gamefx-flight')) continue;
      const badge = added.querySelector('.gamefx-flightbadge'), box = badge.getBoundingClientRect();
      window.__flights.push({label: badge.querySelector('small').textContent, cards: badge.querySelector('b').textContent,
        left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top), bottom: Math.round(box.bottom)});
    } }).observe(document.body, {childList: true, subtree: true});
  });
  return page;
}

// Runs one change between two renders and returns the flights it drew.
const flightsOf = (page, change) => page.evaluate(async source => {
  const game = _game, ui = _ui, me = ui.me, enemy = game.players.find(player => player !== me);
  const make = (name, owner, zone) => {
    const card = new MTG.CardInst(MTG.DEFS[name], owner); card.zone = zone; owner[zone].push(card); return card;
  };
  const leave = card => { const list = card.owner[card.zone]; list.splice(list.indexOf(card), 1); };
  const arrive = (card, zone) => { card.zone = zone; card.zoneVersion = (card.zoneVersion || 0) + 1; card.owner[zone].push(card); };
  const settle = () => new Promise(resolve => setTimeout(resolve, 120));
  ui.render(); await settle();
  window.__flights.length = 0;
  await new Function('game', 'ui', 'me', 'enemy', 'make', 'leave', 'arrive', 'settle', `return (${source})()`)(game, ui, me, enemy, make, leave, arrive, settle);
  ui.render(); await settle();
  return window.__flights.slice();
}, change.toString());

try {
  for (const width of [1440, 390]) {
    const page = await open(width), label = `${width}px`;

    // An opponent's instant: it leaves the hand, the table is drawn while it
    // resolves (the card is in no zone then), and it reaches the graveyard.
    let flights = await flightsOf(page, async () => {
      const spell = make('Swords to Plowshares', enemy, 'hand');
      ui.render(); await settle();
      leave(spell); spell.zone = 'stack';
      ui.render(); await settle();
      arrive(spell, 'graveyard');
    });
    assert.deepEqual(flights, [], `${label}: a resolved spell is not "milled": ${JSON.stringify(flights)}`);
    console.log(`PASS ${label} a spell that resolved draws no flight`);

    // A land played and sacrificed between two renders: hand to graveyard, but
    // never discarded.
    flights = await flightsOf(page, async () => {
      const land = make('Terramorphic Expanse', enemy, 'hand');
      ui.render(); await settle();
      leave(land); arrive(land, 'graveyard');
    });
    assert.deepEqual(flights, [], `${label}: a sacrificed land is not "discarded": ${JSON.stringify(flights)}`);
    console.log(`PASS ${label} a land played and sacrificed draws no flight`);

    // The engine's own discard and mill are still shown, for you and for an opponent.
    for (const who of ['me', 'enemy']) {
      flights = await flightsOf(page, new Function(`return async () => {
        const player = ${who}, card = make('Grizzly Bears', player, 'hand');
        ui.render(); await settle();
        await game.discard(player, [card]);
      }`)());
      assert.equal(flights.length, 1, `${label} ${who}: one flight for a discard: ${JSON.stringify(flights)}`);
      assert.match(flights[0].label, / · DISCARDED$/);
      assert.equal(flights[0].cards, 'Grizzly Bears');
      const box = flights[0], viewport = page.viewportSize();
      assert.ok(box.left >= 0 && box.right <= viewport.width && box.top > 0 && box.bottom <= viewport.height,
        `${label} ${who}: the name badge is inside the screen: ${JSON.stringify(box)}`);

      flights = await flightsOf(page, new Function(`return async () => {
        const player = ${who};
        if (!player.library.length) make('Grizzly Bears', player, 'library');
        ui.render(); await settle();
        await game.mill(player, 1);
      }`)());
      assert.equal(flights.length, 1, `${label} ${who}: one flight for a mill: ${JSON.stringify(flights)}`);
      assert.match(flights[0].label, / · MILLED$/);
      assert.ok(flights[0].left >= 0 && flights[0].right <= viewport.width && flights[0].top > 0,
        `${label} ${who}: the name badge is inside the screen: ${JSON.stringify(flights[0])}`);
    }
    console.log(`PASS ${label} a discard and a mill are shown, with the badge inside the screen`);

    // A card drawn and discarded between two renders left the hand: it is a
    // discard, not a mill.
    flights = await flightsOf(page, async () => {
      const card = make('Grizzly Bears', enemy, 'library');
      ui.render(); await settle();
      leave(card); card.zone = 'hand'; card.zoneVersion++; enemy.hand.push(card);
      await game.discard(enemy, [card]);
    });
    assert.equal(flights.length, 1, JSON.stringify(flights));
    assert.match(flights[0].label, / · DISCARDED$/, `${label}: drawn and discarded reads as a discard`);
    console.log(`PASS ${label} a card drawn and discarded is a discard`);

    // A Live guest cannot see hands or libraries: a card arrives in a graveyard
    // from no zone the table knew. The engine's marks alone name the flight.
    for (const [mark, expected] of [['_milledZoneVersion', 'MILLED'], ['_discardedZoneVersion', 'DISCARDED'], [null, null]]) {
      flights = await flightsOf(page, new Function(`return async () => {
        const card = new MTG.CardInst(MTG.DEFS['Grizzly Bears'], enemy);
        card.zone = 'graveyard'; card.zoneVersion = 1; enemy.graveyard.push(card);
        if (${JSON.stringify(mark)}) card.meta[${JSON.stringify(mark)}] = 1;
        if (${JSON.stringify(mark)} === '_discardedZoneVersion') card.meta._discardedTurn = game.turnNo;
      }`)());
      if (expected) assert.match(flights[0]?.label || '', new RegExp(` · ${expected}$`), `${label}: a hidden card with the ${expected} mark: ${JSON.stringify(flights)}`);
      else assert.deepEqual(flights, [], `${label}: a hidden card without a mark is not announced: ${JSON.stringify(flights)}`);
    }
    console.log(`PASS ${label} a hidden card is named by the engine's mark alone`);
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) server.close();
}
