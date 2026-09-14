import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const option = name => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const targetUrl = option('--url');
const output = option('--output') || `${root}output/web-game/gameplay-details-audit`;
mkdirSync(output, {recursive: true});
const server = targetUrl ? null : express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const browser = await chromium.launch({headless: true, ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 1024}, reducedMotion: 'reduce', hasTouch: true});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1');
});
try {
  await page.goto(targetUrl || `http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry');
  await page.evaluate(() => {
    const root = document.querySelector('#game'); root.replaceWith(root.cloneNode(false));
    document.querySelector('#setup').style.display = 'none'; document.body.classList.add('game-active');
    const game = new MTG.Game({seed: 914, paced: false}), quiet = {decide: async () => []};
    const you = game.addPlayer('You', {name: 'Food and Fellowship'}, quiet, false);
    const other = game.addPlayer('Opponent', {name: 'Elven Council'}, quiet, true);
    const ui = new MTG.UI(); ui.game = game; ui.me = you; ui.commandTableView = 'table';
    you.controller = ui.controllerFor(you);
    game.turnPlayer = you; game.turnNo = 6; game.phase = 'main1'; game.step = 'main';
    const put = (name, owner, zone = 'battlefield') => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner); card.zone = zone; card.sick = false;
      if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
      return card;
    };
    const bearer = put('Frodo, Adventurous Hobbit', you), body = put('Grizzly Bears', you);
    you.commanders = [bearer]; other.commanders = [put('Galadriel, Elven-Queen', other)];
    const first = put('Llanowar Elves', you, 'graveyard'), second = put('Grizzly Bears', you, 'graveyard');
    const otherDead = put('Grizzly Bears', other, 'graveyard');
    const spell = put('Waste Management', you, 'hand');
    const em = MTG.E7.ringEmblem(game, you); em.level = 2; you.ringLevel = 2; bearer.meta.ringBearer = true;
    window.__audit = {game, ui, bearer, body, first, second, otherDead, spell, em, answer: null};
    window.__ringChoice = () => {
      em.level = 2; __audit.answer = null;
      void MTG.E7.ringTempts(game, you).then(answer => {__audit.answer = answer.iid;});
    };
    window.__graveChoice = () => {
      __audit.answer = null;
      const ctx = {g: game, you, src: spell, cancelable: true};
      void game.pickTargets(ctx, game.spellTargetSpecs(spell, {}, you), spell, you)
        .then(ok => {__audit.answer = {ok, names: ctx.targets.flat().map(card => card.name)};});
    };
    game.recalc(); ui.render();
  });
  for (const [width, height] of [[1440, 1024], [390, 844], [320, 568]]) {
    await page.setViewportSize({width, height});
    await page.evaluate(() => __ringChoice());
    const guide = page.locator('.ringchoiceguide');
    await guide.waitFor();
    assert.match(await guide.innerText(), /Level 3\/4/);
    assert.ok((await guide.innerText()).includes(`Current bearer: ${width === 1440 ? 'Frodo, Adventurous Hobbit' : 'Grizzly Bears'}`));
    assert.equal(await guide.locator('li.active').count(), 3);
    assert.equal(await guide.locator('li.locked').count(), 1);
    assert.equal(await guide.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
    await page.screenshot({path: `${output}/ring-choice-${width}.png`});
    await page.locator('.modal .cardgrid .bigcard[data-card-name="Grizzly Bears"]').click();
    const confirm = page.getByRole('button', {name: 'Confirm ✓ (1)', exact: true});
    await confirm.scrollIntoViewIfNeeded();
    await confirm.click();
    await page.waitForFunction(() => __audit.answer === __audit.body.iid);

    await page.evaluate(() => __graveChoice());
    assert.match(await page.locator('.targetconstraint').innerText(), /one graveyard/);
    assert.equal(await page.locator('.targetzoneopen').count(), 2);
    await page.getByRole('button', {name: /Open your graveyard/}).click();
    await page.getByRole('button', {name: 'Choose Llanowar Elves from graveyard', exact: true}).click();
    assert.equal(await page.locator('.targetzoneopen').count(), 1);
    assert.equal(await page.getByRole('button', {name: /Open Opponent's graveyard/}).count(), 0);
    await page.screenshot({path: `${output}/same-graveyard-${width}.png`});
    await page.getByRole('button', {name: 'Clear', exact: true}).click();
    assert.equal(await page.locator('.targetzoneopen').count(), 2);
    await page.getByRole('button', {name: /Open Opponent's graveyard/}).click();
    await page.getByRole('button', {name: 'Choose Grizzly Bears from graveyard', exact: true}).click();
    await page.locator('.targetprompt .primary').click();
    await page.waitForFunction(() => __audit.answer?.ok === true);
    assert.deepEqual(await page.evaluate(() => __audit.answer.names), ['Grizzly Bears']);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: Ring abilities and bearer choices, same-graveyard selection, clearing and confirming at 1440, 390 and 320 px; no page errors.');
} catch (error) {
  await page.screenshot({path: `${output}/failure.png`});
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise(resolve => {server.close(resolve); server.closeAllConnections();});
}
