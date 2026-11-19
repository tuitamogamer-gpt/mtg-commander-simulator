// Real composer/response handlers with a deterministic public-board fixture.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.DIPLOMACY_QA_OUTPUT || `${root}output/web-game/diplomacy-options`;
mkdirSync(output, { recursive: true });
const server = process.env.GAME_URL ? null : express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [], checks = [];
const check = text => { checks.push(text); console.log(`PASS ${text}`); };
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('mtgOnboardingComplete', '1'));
    await page.goto(`${base}/?smokeDeck=Quick%20Draw&smokeScenario=diplomacy&botDiplomacy=human-compose&diplomacy=1`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="send-diplomacy-offer"]').waitFor({ timeout: 90000 });
    const recipientId = await page.evaluate(() => _ui.diplomacyComposer.toId);
    const allowance = await page.evaluate(() => _game.diplomacyView(_ui.me).offersRemaining);
    assert.equal(await page.locator('[data-testid="diplomacy-preset-let_resolve"]').count(), 0, 'No stack deal is invented on an empty stack');
    // The composer: both faces and a title that names the player, starting
    // points as chips, two one-line fields, and the actions at the foot with
    // the main one last.
    const composer = await page.locator('.diplomacymodal').evaluate(modal => {
      const box = node => node.getBoundingClientRect();
      const actions = [...modal.querySelectorAll('.polactions > *')];
      return {
        politics: modal.classList.contains('politics'),
        faces: [...modal.querySelectorAll('.polhead .polface img')].map(image => image.complete && image.naturalWidth > 0 && /^https?:|^\.?\/?assets|^data:/.test(image.getAttribute('src'))),
        title: modal.querySelector('.polhead .mtitle').textContent.trim(), kicker: modal.querySelector('.polhead .combatkicker').textContent.trim(),
        chips: [...modal.querySelectorAll('.dipquickstart')].map(chip => ({pressed: chip.getAttribute('aria-pressed'), height: Math.round(box(chip).height), told: !!chip.title, row: Math.round(box(chip).top)})),
        hint: modal.querySelector('.polstarthint').textContent.trim(), chosen: modal.querySelector('.dipquickstart.selected')?.title || '',
        selects: [...modal.querySelectorAll('.dipfield select')].map(select => Math.round(box(select).height)),
        fields: [...modal.querySelectorAll('.dipfield > span')].map(label => label.firstChild.textContent.trim()),
        preamble: modal.querySelectorAll('.dippreamble, .dipwarning, .dipcustomhint').length,
        actions: actions.map(node => node.tagName === 'BUTTON' ? node.textContent.trim() : node.className),
        buttons: actions.filter(node => node.tagName === 'BUTTON').map(button => Math.round(box(button).height)),
        // Text that is shown (a chip's explanation is kept for readers and clipped).
        small: [...modal.querySelectorAll('p, small, select, .dipavailability, .polfootnote')].filter(node => node.offsetParent && box(node).width > 2 && parseFloat(getComputedStyle(node).fontSize) < 12).length,
      };
    });
    assert.equal(composer.politics, true);
    assert.equal(composer.faces.length, 2); assert.ok(composer.faces.every(Boolean), 'both players are shown by their commander art');
    assert.match(composer.title, /^Offer .+ a deal$/); assert.match(composer.kicker, /^New offer · \d left this round$/i);
    assert.ok(composer.chips.length >= 2 && composer.chips.filter(chip => chip.pressed === 'true').length === 1, JSON.stringify(composer.chips));
    assert.ok(composer.chips.every(chip => chip.told && chip.height >= 40 && chip.height <= 48), 'starting points are chips, each with its explanation');
    assert.equal(composer.hint, composer.chosen, 'the chosen starting point says what it does');
    assert.ok(composer.selects.length === 2 && composer.selects.every(height => height >= 44 && height <= 48), `one-line fields: ${composer.selects}`);
    assert.match(composer.fields[0], /^You ask .+ to$/); assert.equal(composer.fields[1], 'You promise');
    assert.equal(composer.preamble, 0, 'no paragraph explains the dialog; the foot says what sending means');
    assert.deepEqual(composer.actions, ['polfootnote', 'Cancel', 'Send offer']);
    assert.ok(composer.buttons.every(height => height >= 44));
    assert.equal(composer.small, 0, 'reading text is 12px or more');
    await page.locator('[data-testid="diplomacy-preset-protect_permanent"]').click();
    assert.match(await page.locator('.dipreview').innerText(), /harmful target/);
    await page.locator('[data-testid="diplomacy-preset-no_target_player"]').click();
    assert.match(await page.locator('.dipreview').innerText(), /harmful targets/);
    await page.locator('[data-testid="diplomacy-preset-no_attack"]').click();
    assert.match(await page.locator('.dipreview').innerText(), /will not voluntarily attack/);
    assert.equal(await page.evaluate(() => _game.diplomacyView(_ui.me).offersRemaining), allowance, 'Trying ideas does not spend a proposal');
    const fits = await page.locator('.diplomacymodal').evaluate(modal => {
      const bounds = modal.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, scroll: modal.scrollWidth, width: modal.clientWidth };
    });
    assert.ok(fits.left >= -1 && fits.right <= viewport.width + 1 && fits.scroll <= fits.width + 1, `Composer fits ${viewport.width}px: ${JSON.stringify(fits)}`);
    await page.screenshot({ path: `${output}/composer-${viewport.width}.png` });
    await page.locator('[data-testid="send-diplomacy-offer"]').click();
    await page.locator('[data-testid="diplomacy-hard-pause"]').waitFor();
    assert.match(await page.locator('.diplomacyreviewoutcome').innerText(), /Agreement accepted and active/);
    assert.equal(await page.evaluate(() => _game.diplomacyView(_ui.me).activeContracts.length), 1);
    // The review: its title says what happened, each term is headed by the
    // player who promises it, and Proceed is a button at the foot, not a bar.
    const review = await page.locator('.diplomacyreviewmodal').evaluate(modal => {
      const proceed = modal.querySelector('[data-testid="proceed-diplomacy-review"]');
      return {
        politics: modal.classList.contains('politics'), title: modal.querySelector('.mtitle').textContent.trim(),
        kicker: modal.querySelector('.combatkicker').textContent.trim(),
        route: [...modal.querySelectorAll('.diplomacyreviewroute > span')].map(chip => ({name: chip.querySelector('b').textContent.trim(),
          face: Math.round(chip.querySelector('.polface').getBoundingClientRect().width) === Math.round(chip.querySelector('.polface').getBoundingClientRect().height)})),
        terms: [...modal.querySelectorAll('.diplomacyreviewterms p > span')].map(head => head.textContent.trim()),
        footnote: modal.querySelector('.polactions .polfootnote')?.textContent.trim(), preamble: modal.querySelectorAll('.dippreamble').length,
        proceedShare: proceed.getBoundingClientRect().width / modal.getBoundingClientRect().width, last: modal.querySelector('.polactions').lastElementChild === proceed,
      };
    });
    const recipientName = await page.evaluate(id => _game.players.find(player => player.idx === id).name, recipientId);
    assert.equal(review.politics, true);
    assert.equal(review.title, `${recipientName} accepted your offer`);
    assert.match(review.kicker, /game paused/i);
    assert.deepEqual(review.route.map(chip => chip.name).sort(), ['You', recipientName].sort());
    assert.ok(review.route.every(chip => chip.face), 'faces are round, not stretched');
    assert.deepEqual(review.terms.sort(), ['You', recipientName].sort(), 'each term is headed by who promises it');
    assert.match(review.footnote, /waits until you press Proceed/); assert.equal(review.preamble, 0);
    assert.equal(review.last, true);
    if (viewport.width > 700) assert.ok(review.proceedShare < .5, `Proceed is a button, not a bar: ${Math.round(review.proceedShare * 100)}% of the dialog`);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.dipaccordseal')).animationName.includes('dipSign'), null, { timeout: 5000 }).catch(async error => {
      console.log(await page.evaluate(() => ({ className: document.querySelector('.diplomacyreviewmodal').className, body: document.body.className, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, seen: [..._ui.diplomacyMotionSeen] })));
      throw error;
    });
    await page.screenshot({ path: `${output}/accepted-${viewport.width}.png` });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.dipaccordseal').evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => document.body.classList.add('reduced-motion'));
    assert.equal(await page.locator('.dipaccordseal').evaluate(node => getComputedStyle(node).animationName), 'none');
    await page.evaluate(() => document.body.classList.remove('reduced-motion'));
    await page.locator('[data-testid="proceed-diplomacy-review"]').click();
    await page.waitForFunction(() => !_ui.pending || _ui.pending.q.type !== 'diplomacyReview');
    const reopened = await page.evaluate(recipientId => {
      _ui.beginDiplomacyOffer(_game, _game.players.find(player => player.idx === recipientId));
      return { composer: _ui.diplomacyComposer, status: _game.diplomacyStatus(), pending: _ui.pending?.q?.type };
    }, recipientId);
    assert.ok(reopened.composer, JSON.stringify(reopened));
    assert.equal(await page.locator('[data-testid="send-diplomacy-offer"]').isDisabled(), true);
    assert.match(await page.locator('.dipavailability.blocked').innerText(), /already have an active agreement/);
    // The drawer, ordered by need: whether deals are open, the players, what
    // is in force, then history and the rules. Its head carries the title.
    await page.evaluate(() => { _ui.diplomacyComposer = null; _ui.openUtility('diplomacy'); });
    const drawer = await page.locator('.diplomacypanel').evaluate((panel, phone) => {
      const box = node => node.getBoundingClientRect();
      const offers = [...panel.querySelectorAll('.polplayer .polofferbtn')];
      return {
        politics: panel.classList.contains('politics'), repeated: panel.querySelectorAll('.diplomacyhero').length,
        first: panel.firstElementChild.className, sections: [...panel.querySelectorAll('.dipsectiontitle > span')].map(title => title.textContent.trim()),
        last: panel.lastElementChild.className,
        players: [...panel.querySelectorAll('.polplayer')].map(row => ({face: !!row.querySelector('.polface img'), name: row.querySelector('b').textContent.trim(),
          standing: row.querySelector('small').textContent.trim(), label: row.querySelector('.polofferbtn').getAttribute('aria-label')})),
        offerHeights: offers.map(button => Math.round(box(button).height)), spaced: offers.map(button => getComputedStyle(button).letterSpacing),
        pact: [...panel.querySelectorAll('.polpact .polclauses li')].map(row => ({state: row.className, mark: row.querySelector('em').textContent.trim()})),
        boxes: [...panel.querySelectorAll('.polplayer, .polpact, .polempty, .polguide')].filter(node => parseFloat(getComputedStyle(node).borderLeftWidth) > 0).length,
        small: [...panel.querySelectorAll('p, small, dd, b, summary')].filter(node => node.offsetParent && parseFloat(getComputedStyle(node).fontSize) < 12).length,
        overflow: panel.scrollWidth > panel.clientWidth + 1,
      };
    }, viewport.width <= 900);
    assert.equal(drawer.politics, true); assert.equal(drawer.repeated, 0, 'the panel does not repeat the drawer title');
    assert.match(drawer.first, /polstatus/);
    assert.deepEqual(drawer.sections.slice(0, 2), ['Players', 'Agreements']);
    assert.match(drawer.last, /polguide/);
    assert.equal(drawer.players.length, 3);
    assert.ok(drawer.players.every(row => row.face && row.name && row.standing && row.label === `Offer ${row.name} a deal`), JSON.stringify(drawer.players));
    assert.ok(drawer.players.some(row => row.standing === 'Agreement active'));
    assert.ok(drawer.offerHeights.every(height => height >= (viewport.width <= 900 ? 44 : 36)), `Offer deal buttons: ${drawer.offerHeights}`);
    assert.ok(drawer.spaced.every(value => ['0px', 'normal'].includes(value)), 'the buttons are not letter-spaced');
    assert.ok(drawer.pact.length >= 2 && drawer.pact.every(row => /state-/.test(row.state) && row.mark), JSON.stringify(drawer.pact));
    assert.equal(drawer.boxes, 0, 'rows are divided by hairlines, not boxed');
    assert.equal(drawer.small, 0); assert.equal(drawer.overflow, false);
    await page.screenshot({ path: `${output}/drawer-${viewport.width}.png` });
    check(`${viewport.width}px: legal starters, exact terms, no allowance spent on preview, accepted pact, unavailable reason, both reduced-motion modes`);
    check(`${viewport.width}px: the composer, the review and the drawer in their new shape`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
