// Phone table polish: short notices clear the board and hand headings, a
// routine recap is a full-width bottom sheet with a padded status strip, the
// full hand uses the width in portrait, and touch prompts say "tap".
// Run like the other browser suites: PLAYWRIGHT_MODULE may point to an
// installed Playwright package; GAME_URL may select an existing preview.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/populated-resource-board.js', import.meta.url), 'utf8');
const output = process.env.PHONE_POLISH_OUTPUT || `${root}output/web-game/phone-table-polish`;
mkdirSync(output, {recursive: true});
const server = process.env.GAME_URL ? null : express().use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const errors = [];
const overlaps = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

async function openTable(options) {
  const context = await browser.newContext({reducedMotion: 'reduce', ...options});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor();
  await page.addScriptTag({content: fixture});
  await page.locator('#game .promptbar .ptext').first().waitFor();
  return {context, page};
}
// An opponent's public creature gets a counter; a target hint follows.
const announce = page => page.evaluate(() => {
  const card = _game.creatures(_game.players[1])[0];
  _ui.showEffectNotice(`◆ ${card.name}: +1 +1/+1 counter.`, 'counter', {card});
  _ui.toast('🎯 Swords to Plowshares: click a target');
});
// Three exile permissions: an impulse draw castable now, a foretold card that
// is not, and an opponent's card castable now.
const offerExile = page => page.evaluate(() => {
  const g = _game, me = _ui.me, opponent = g.players[1];
  const exile = (name, owner, meta) => {
    const card = new MTG.CardInst(MTG.DEFS[name], owner);
    card.zone = 'exile'; owner.exile.push(card); Object.assign(card.meta, meta);
    return card;
  };
  const impulse = exile('Llanowar Elves', me, {playableBy: me, playableUntil: g.turnNo});
  exile('Swords to Plowshares', me, {foretold: true});
  const stolen = exile('Counterspell', opponent, {playableBy: me, playableUntil: g.turnNo + 2});
  if (_ui.pending) _ui.resolvePendingEntry(_ui.pending, {kind: 'done'});
  const casts = g.castableList(me).filter(entry => entry.card.zone === 'hand')
    .concat([{card: impulse, from: 'exile'}, {card: stolen, from: 'exile'}]);
  void me.controller.decide(g, {type: 'main', player: me, phase: g.phase, casts, acts: [], lands: []});
  _ui.render();
});
const floaters = (page, heading) => page.evaluate(selector => {
  const box = query => document.querySelector(query)?.getBoundingClientRect().toJSON() || null;
  return {notice: box('body > .effectnoticestack'), toast: box('body > .toastmsg'), prompt: box('#game .promptbar'),
    heading: box(selector), toastText: document.querySelector('body > .toastmsg')?.textContent || ''};
}, heading);

try {
  {
    const {context, page} = await openTable({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    assert.equal(await page.evaluate(() => document.querySelector('#game').dataset.mobileView), 'mine');
    const prompt = await page.locator('#game .promptbar .ptext').first().textContent();
    assert.match(prompt, /tap a card for actions/, prompt);
    assert.doesNotMatch(prompt, /click/i, 'touch prompts never ask for a click');
    console.log('PASS touch prompts say tap');

    await announce(page);
    let geo = await floaters(page, '#game .myboard .ct-player-head');
    assert.ok(geo.notice && geo.toast && geo.heading, JSON.stringify(geo));
    assert.equal(overlaps(geo.notice, geo.heading), false, `the activity line leaves your name and life visible: ${JSON.stringify(geo)}`);
    assert.equal(overlaps(geo.toast, geo.heading), false, 'the toast leaves the board heading visible');
    assert.ok(geo.notice.bottom <= geo.prompt.top + 1 && geo.prompt.top - geo.notice.bottom <= 16, `the activity line sits just above the prompt: ${JSON.stringify(geo)}`);
    assert.ok(geo.toast.bottom <= geo.notice.top + 1, 'the toast stacks above the activity line');
    assert.match(geo.toastText, /tap a target/);
    await page.screenshot({path: `${output}/notices-mine.png`});
    console.log('PASS notices float above the prompt, clear of the board heading');

    // The full hand: the heading stays clear, and the commander is a compact row
    // above a hand grid of at least two columns.
    await page.getByRole('navigation', {name: 'Arena view'}).getByRole('button', {name: /^Combat/i}).click();
    await page.getByRole('button', {name: 'View hand', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('#game').dataset.mobileView === 'hand');
    await announce(page);
    geo = await floaters(page, '#game .handwrap .handtools');
    assert.equal(overlaps(geo.notice, geo.heading), false, `the activity line leaves the hand heading visible: ${JSON.stringify(geo)}`);
    assert.ok(geo.notice.bottom <= geo.prompt.top + 1, 'the activity line sits above the prompt in the hand view');
    const hand = await page.evaluate(() => {
      const box = node => node.getBoundingClientRect().toJSON();
      const dock = document.querySelector('#game .ct-commander-dock'), cards = [...document.querySelectorAll('#game .hand .hcard')].map(box);
      return {dock: box(dock), cards, columns: new Set(cards.map(card => Math.round(card.left))).size, width: innerWidth};
    });
    assert.ok(hand.columns >= 2, `the full hand shows at least two cards per row: ${JSON.stringify(hand)}`);
    assert.ok(hand.dock.width >= hand.width - 60 && hand.dock.height <= 110, `the commander is a compact full-width row: ${JSON.stringify(hand.dock)}`);
    assert.ok(hand.cards.every(card => card.top >= hand.dock.bottom - 1), 'hand cards start below the commander row');
    await page.screenshot({path: `${output}/hand-portrait.png`});
    console.log('PASS the portrait full hand uses the width');

    // A routine recap is a full-width bottom sheet whose status strip is padded.
    await page.getByRole('navigation', {name: 'Arena view'}).getByRole('button', {name: /^Mine/i}).click();
    await page.evaluate(() => {
      const owner = _game.players[1], land = _game.lands(owner).find(card => card.name === 'Island');
      const view = card => ({name: card.name, faceDown: false, types: card.def.types.slice()});
      const row = {card: view(land), text: `${owner.name}: Island → battlefield, tapped.`};
      const recap = {name: 'Evolving Wilds', source: {name: 'Evolving Wilds', faceDown: false, types: ['Land']}, controllerName: owner.name,
        combat: false, details: [], changes: [], players: [], damage: [], prevented: [], totalDamage: 0, stack: [], queued: [], gameOver: false,
        impact: {level: 'minor', headline: 'Land found', stats: []}, summary: 'Here is what the search found.', searches: [row], highlights: [row],
        anchor: {playerIdx: owner.idx, iids: [land.iid]}};
      window.__recapAnswered = false;
      _ui.me.controller.decide(_game, {type: 'effectReview', effectKind: 'resolutionRecap', player: _ui.me, source: recap.source, prompt: recap.name, recap})
        .then(() => { window.__recapAnswered = true; });
    });
    await page.locator('.resolutionrecapoverlay.recapminor .modal.resolutionrecap').waitFor();
    const sheet = await page.evaluate(() => {
      const modal = document.querySelector('.recapminor .modal.resolutionrecap'), strip = modal.querySelector(':scope > .waitownership');
      const r = modal.getBoundingClientRect(), s = strip.getBoundingClientRect(), label = strip.querySelector('strong').getBoundingClientRect();
      return {left: r.left, right: r.right, bottom: r.bottom, top: r.top, width: innerWidth, height: innerHeight,
        stripTop: s.top, labelInset: label.left - r.left, board: document.querySelector('#game .myboard .ct-player-head').getBoundingClientRect().toJSON()};
    });
    assert.ok(sheet.left <= 0.5 && sheet.right >= sheet.width - 0.5 && sheet.bottom >= sheet.height - 0.5, `full-width bottom sheet: ${JSON.stringify(sheet)}`);
    assert.ok(sheet.labelInset >= 12, `the status strip has inner padding: ${JSON.stringify(sheet)}`);
    assert.ok(Math.abs(sheet.stripTop - sheet.top) <= 2, 'the status strip is the top edge of the sheet');
    assert.ok(sheet.top >= sheet.board.bottom, 'your board heading stays visible above the sheet');
    await page.screenshot({path: `${output}/recap-sheet.png`});
    await page.locator('.resolutionrecapproceed').click();
    await page.waitForFunction(() => window.__recapAnswered === true);
    console.log('PASS a routine recap is a full-width bottom sheet');

    // Choosing a target while casting: the tray shows the whole two-line hint
    // and its removal tip speaks to a finger.
    await page.evaluate(() => {
      const candidates = _game.battlefield.filter(card => card.ctrl !== _ui.me);
      const src = _ui.me.hand.find(card => card.name === 'Swords to Plowshares');
      window.__targetAnswer = undefined;
      _ui.me.controller.decide(_game, {type: 'chooseTargets', player: _ui.me, prompt: 'Target permanent', spec: {what: 'permanent'},
        candidates, min: 1, max: 1, src, cancelable: true}).then(answer => { window.__targetAnswer = answer; });
    });
    await page.locator('.targetprompt .targetprompthint').waitFor();
    const tray = await page.locator('.targetpromptbody').evaluate(body => ({clipped: body.scrollHeight > body.clientHeight + 1,
      hint: body.querySelector('.targetprompthint').textContent}));
    assert.equal(tray.clipped, false, `the target hint is not cut off: ${JSON.stringify(tray)}`);
    assert.match(tray.hint, /No mana or other cost has been paid yet/);
    const choice = await page.evaluate(() => _game.battlefield.find(card => card.ctrl !== _ui.me && card.is('Creature')).iid);
    await page.evaluate(iid => _ui.pickCandidate(_game.battlefield.find(card => card.iid === iid)), choice);
    assert.match(await page.locator('.targetprompthint').textContent(), /Tap a selected target or × to remove it/);
    await page.screenshot({path: `${output}/target-tray.png`});
    await page.locator('.targetprompt .primary').click();
    await page.waitForFunction(() => Array.isArray(window.__targetAnswer) || window.__targetAnswer?.length === 1);
    console.log('PASS the target tray shows its whole hint and says tap');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal page overflow');
    await context.close();
  }
  {
    // Cards you may play from exile are full cards at the front of the phone
    // hand row instead of names; the prompt does not repeat them while the
    // hand shows, and Table view keeps one line of shortcuts.
    const {context, page} = await openTable({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    await offerExile(page);
    await page.locator('.hand .offzonecard').first().waitFor();
    const row = await page.evaluate(() => {
      const box = node => node.getBoundingClientRect().toJSON();
      const cards = [...document.querySelectorAll('#game .hand .hcard')];
      const regular = cards.find(node => !node.classList.contains('offzonecard'));
      return {cards: cards.filter(node => node.classList.contains('offzonecard')).map(node => ({name: node.dataset.cname, zone: node.dataset.zone,
        castable: node.classList.contains('castable'), ribbon: node.querySelector('.offzoneribbon')?.textContent.trim(),
        note: node.querySelector('.offzonenote')?.textContent.trim(), image: !!node.querySelector('img'), box: box(node)})),
        regular: box(regular), firstHand: cards.indexOf(regular),
        tray: document.querySelectorAll('.exiletraycard').length, shortcuts: document.querySelectorAll('.promptbar .offzone button').length};
    });
    assert.deepEqual(row.cards.map(card => card.name), ['Llanowar Elves', 'Swords to Plowshares', 'Counterspell']);
    assert.equal(row.firstHand, 3, 'exile cards lead the hand row');
    assert.ok(row.cards.every(card => card.zone === 'exile' && card.ribbon === 'EXILE' && card.image), JSON.stringify(row.cards));
    assert.ok(row.cards.every(card => Math.abs(card.box.width - row.regular.width) < 1 && Math.abs(card.box.height - row.regular.height) < 1),
      `exile cards are hand-card sized: ${JSON.stringify(row)}`);
    assert.deepEqual(row.cards.map(card => card.castable), [true, false, true], 'the green frame marks the cards playable now');
    assert.deepEqual(row.cards.map(card => card.note), ['This turn only', 'Foretold', "AI Dragon's · Limited time"]);
    assert.equal(row.tray, 0, 'no thumbnail tray on a phone');
    assert.equal(row.shortcuts, 0, 'the prompt does not repeat cards shown in the hand row');
    await page.screenshot({path: `${output}/exile-hand-row.png`});
    await page.locator('.hand .offzonecard[data-cname="Counterspell"]').click();
    assert.deepEqual(await page.locator('.sheetacts button').allInnerTexts(), ['Play from exile', 'Close']);
    await page.locator('.sheet').getByRole('button', {name: 'Close', exact: true}).click();
    await page.getByRole('navigation', {name: 'Arena view'}).getByRole('button', {name: /^Table/i}).click();
    const table = await page.evaluate(() => {
      const prompt = document.querySelector('#game .promptbar'), shortcuts = [...prompt.querySelectorAll('.offzone button')];
      return {shortcuts: shortcuts.length, lines: new Set(shortcuts.map(node => Math.round(node.getBoundingClientRect().top))).size,
        clipped: prompt.scrollHeight > prompt.clientHeight + 1,
        primary: [...prompt.querySelectorAll('.pbtn.primary')].at(-1).getBoundingClientRect().bottom, bottom: prompt.getBoundingClientRect().bottom};
    });
    assert.equal(table.shortcuts, 2, 'Table view keeps shortcuts for the cards playable now');
    assert.equal(table.lines, 1, 'the shortcuts share one line');
    assert.ok(!table.clipped && table.primary <= table.bottom + 1, `Continue stays visible: ${JSON.stringify(table)}`);
    await page.screenshot({path: `${output}/exile-table-view.png`});
    console.log('PASS cards playable from exile are full cards in the phone hand row');

    // A triggered ability's target tray says what the choice does, and inside
    // the end step warns that "the next end step" is the next turn's.
    await page.evaluate(() => {
      if (_ui.pending) _ui.resolvePendingEntry(_ui.pending, {kind: 'done'});
      const kyle = new MTG.CardInst(MTG.DEFS['Chief Kyle, Transporter Tech'], _ui.me);
      kyle.zone = 'battlefield'; kyle.ctrl = _ui.me; _game.battlefield.push(kyle); _game.recalc();
      _game.phase = 'end'; _game.step = 'end';
      window.__blinkAnswer = undefined;
      void _ui.me.controller.decide(_game, {type: 'chooseTargets', player: _ui.me, prompt: 'Izaberi metu', spec: {what: 'creature'},
        candidates: _game.creatures(_ui.me).filter(card => card !== kyle), min: 0, max: 1, src: kyle,
        effectText: 'Exile up to one other creature you control; it returns at the beginning of the next end step'})
        .then(answer => { window.__blinkAnswer = answer; });
      _ui.render();
    });
    await page.locator('.targetprompt .targettiming').waitFor();
    assert.equal(await page.locator('.targetinstructiontext').textContent(), 'Exile up to one other creature you control; it returns at the beginning of the next end step');
    assert.match(await page.locator('.targettiming').textContent(), /already the end step.*next turn's end step/);
    await page.screenshot({path: `${output}/end-step-blink.png`});
    await page.locator('.targetprompt .primary').click();
    await page.waitForFunction(() => Array.isArray(window.__blinkAnswer) && window.__blinkAnswer.length === 0);
    await page.evaluate(() => { _game.phase = 'main1'; _game.step = 'main'; });
    console.log('PASS a trigger target says what it does and warns about the end step');

    // "Counter target spell": the phone opens the Stack view, where the spell glows.
    await page.getByRole('navigation', {name: 'Arena view'}).getByRole('button', {name: /^Mine/i}).click();
    await page.evaluate(() => {
      const owner = _game.players[1], spell = new MTG.CardInst(MTG.DEFS['Lightning Bolt'], owner);
      spell.zone = 'stack';
      const object = {kind: 'spell', name: spell.name, card: spell, ctrl: owner, targets: []};
      _game.stack.push(object);
      if (_ui.pending) _ui.resolvePendingEntry(_ui.pending, {kind: 'done'});
      window.__stackAnswer = undefined;
      void _ui.me.controller.decide(_game, {type: 'chooseTargets', player: _ui.me, prompt: 'Counter target spell', spec: {what: 'spell'},
        candidates: [object], min: 1, max: 1, src: _ui.me.hand.find(card => card.name === 'Counterspell'), cancelable: true})
        .then(answer => { window.__stackAnswer = answer; });
    });
    await page.waitForFunction(() => document.querySelector('#game').dataset.mobileView === 'stack');
    await page.getByRole('button', {name: 'Lightning Bolt. Select this spell as a target.', exact: true}).filter({visible: true}).first().click();
    await page.screenshot({path: `${output}/stack-target.png`});
    await page.locator('.targetprompt .primary').click();
    await page.waitForFunction(() => Array.isArray(window.__stackAnswer) && window.__stackAnswer[0]?.name === 'Lightning Bolt');
    console.log('PASS a spell target on the Stack opens the Stack view');
    await context.close();
  }
  {
    // Landscape keeps the commander column: height is the scarce side.
    const {context, page} = await openTable({viewport: {width: 844, height: 390}, isMobile: true, hasTouch: true});
    await page.getByRole('navigation', {name: 'Arena view'}).getByRole('button', {name: /^Combat/i}).click();
    await page.getByRole('button', {name: 'View hand', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('#game').dataset.mobileView === 'hand');
    const hand = await page.evaluate(() => {
      const dock = document.querySelector('#game .ct-commander-dock').getBoundingClientRect();
      const card = document.querySelector('#game .hand .hcard').getBoundingClientRect();
      return {dockRight: dock.right, cardLeft: card.left, cardHeight: card.height};
    });
    assert.ok(hand.cardLeft >= hand.dockRight - 1, `cards sit beside the commander column: ${JSON.stringify(hand)}`);
    assert.ok(hand.cardHeight >= 120, `landscape hand cards stay readable: ${JSON.stringify(hand)}`);
    await page.screenshot({path: `${output}/hand-landscape.png`});
    console.log('PASS landscape full hand keeps the commander column');
    await context.close();
  }
  {
    // A mouse keeps the original wording, and the desktop keeps the exile tray
    // beside the hand with its prompt shortcuts.
    const {context, page} = await openTable({viewport: {width: 1440, height: 900}});
    assert.match(await page.locator('#game .promptbar .ptext').first().textContent(), /click/);
    console.log('PASS mouse prompts keep click');
    await offerExile(page);
    await page.locator('.exiletraycard').first().waitFor();
    assert.equal(await page.locator('.exiletraycard').count(), 3);
    assert.equal(await page.locator('.hand .offzonecard').count(), 0);
    assert.equal(await page.locator('.promptbar .offzone button').count(), 2);
    console.log('PASS the desktop keeps its exile tray');
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  if (server) server.close();
}
