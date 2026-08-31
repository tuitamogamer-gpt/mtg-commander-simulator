// PLAYWRIGHT_MODULE may point to an installed Playwright index.mjs.
// Private local browser: real deck import, battlefield-entry events and media playback.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/commander-import-visuals`;
mkdirSync(output, { recursive: true });
const manifest = JSON.parse(readFileSync(new URL('../../reports/oracle-import/sauron-dark-lord-moxfield.json', import.meta.url), 'utf8'));
const sauronText = Object.entries(manifest.sections).flatMap(([section, rows]) => [
  section === 'Commander' ? 'Commander' : 'Deck',
  ...rows.map(row => `${row.quantity} ${row.name}${section === 'Commander' ? ' *CMDR*' : ''}`), '',
]).join('\n');
const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
const errors = [], results = [], mediaRequests = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (request.url().includes('/commander-intros/')) mediaRequests.push(request.url()); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '0');
});

try {
  await page.goto(base);
  await page.locator('[data-menu-action="import"]').first().click();
  await page.waitForFunction(() => !window.MTGAccount.loading && document.querySelector('.mainmenu-deckimport')?.dataset.librarySource === 'guest');
  await page.waitForFunction(() => !!window.MTG?.DECKS?.['Prismari Artistry']);
  const roothaText = await page.evaluate(() => {
    const deck = MTG.DECKS['Prismari Artistry'];
    return ['Commander', `1 ${deck.commander} *CMDR*`, '', 'Deck',
      ...deck.cards.filter(row => row.name !== deck.commander).map(row => `${row.n} ${row.name}`)].join('\n');
  });
  await page.locator('.mainmenu-deckimport-name').fill('Imported Rootha visual check');
  await page.locator('.mainmenu-deckimport-text').fill(roothaText);
  await page.locator('.mainmenu-deckimport-check').click();
  await page.locator('.mainmenu-deckimport-start').click();
  await page.locator('.deckspotlight').waitFor();
  assert.equal(await page.locator('.deckspotlight video').count(), 0);
  assert.equal(mediaRequests.length, 0, 'imported spotlight must not fetch a video');
  await page.waitForFunction(() => {
    const image = document.querySelector('.deckspotlightcard');
    return image?.complete && image.naturalWidth > 100;
  });
  await page.screenshot({ path: `${output}/imported-spotlight.png` });
  await page.goto(base);
  await page.locator('[data-menu-action="import"]').first().click();
  await page.locator('.mainmenu-decklibrary-play').click();
  await page.locator('.deckspotlight').waitFor();
  assert.equal(await page.locator('.deckspotlight video').count(), 0, 'saved import still uses only card art');
  assert.equal(mediaRequests.length, 0);
  results.push({ scenario: 'imported-and-saved-spotlight', video: false });

  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry[data-deck="Prismari Artistry"] .deckcard').click();
  await page.waitForFunction(() => document.querySelector('.deckspotlightvideo')?.currentTime > 0);
  results.push({ scenario: 'predefined-spotlight', video: true });

  for (const scenario of [
    { name: 'imported-rootha', imported: true },
    { name: 'imported-sauron', imported: true, sauron: true },
    { name: 'predefined-rootha' },
    { name: 'imported-under-predefined-control', imported: true, changedControl: true },
    { name: 'predefined-under-imported-control', changedControl: true },
    { name: 'predefined-reduced-motion', reducedMotion: true },
  ]) {
    await page.goto(`${base}/?smokeDeck=Quick%20Draw&seed=31831&smokeScenario=importVisualFixture`);
    await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan');
    const requestCount = mediaRequests.length;
    const cardId = await page.evaluate(async ({ scenario, roothaText, sauronText }) => {
      const imported = MTG.importCommanderDeck(scenario.sauron ? sauronText : roothaText, { name: 'Entry import check', register: true });
      if (!imported.ok) throw new Error(JSON.stringify(imported.errors));
      const ui = new MTG.UI();
      ui.reducedMotion = !!scenario.reducedMotion;
      const game = MTG.newGame({
        seed: 31831, humanDeck: scenario.imported ? imported.deck.name : 'Prismari Artistry',
        aiDecks: [scenario.imported ? 'Prismari Artistry' : imported.deck.name], aiStyles: ['balanced'], paced: false,
        humanController: player => { ui.me = player; return ui.controllerFor(player); },
        onEvent: event => {
          if (event.type === 'battlefieldArrival') ui.showBattlefieldArrival(event);
          ui.queueRender();
        },
      });
      game.turnPlayer = ui.me; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
      ui.game = game; window._game = game; window._ui = ui;
      ui.render();
      const card = ui.me.commanders[0];
      const controller = scenario.changedControl ? game.players.find(player => player !== ui.me) : ui.me;
      await game.move(card, 'battlefield', { ctrl: controller });
      ui.render();
      return card.iid;
    }, { scenario, roothaText, sauronText });
    const shouldVideo = !scenario.imported && !scenario.reducedMotion;
    await page.locator(`.mini[data-iid="${cardId}"].arrival-highlight`).waitFor();
    const arrival = page.locator(`.battlefieldarrival[data-iid="${cardId}"]`);
    assert.equal(await arrival.locator('video').count(), shouldVideo ? 1 : 0, scenario.name);
    if (scenario.imported) {
      assert.equal(await page.locator('.battlefieldarrival').count(), 0, 'imported commander has no cinematic frame');
      await page.waitForFunction(iid => {
        const image = document.querySelector(`.mini[data-iid="${iid}"] img`);
        return image?.complete && image.naturalWidth > 100;
      }, cardId);
      assert.equal(mediaRequests.length, requestCount, `${scenario.name}: no video request`);
    } else if (shouldVideo) {
      await page.waitForFunction(() => {
        const video = document.querySelector('.arrivalvideo');
        return video && !video.hidden && !video.paused && video.currentTime > 0;
      });
      assert.match(await arrival.locator('source').getAttribute('src'), /commander-intros\/rootha-mastering-the-moment\.mp4$/);
    } else {
      await page.waitForFunction(() => {
        const image = document.querySelector('.battlefieldarrival > img');
        return image?.complete && image.naturalWidth > 100;
      });
      assert.equal(mediaRequests.length, requestCount, `${scenario.name}: no video request`);
    }
    await page.waitForTimeout(600); // Inspect the settled entrance animation, not its transparent first frame.
    await page.screenshot({ path: `${output}/${scenario.name}.png` });
    results.push({ scenario: scenario.name, video: shouldVideo, highlighted: true, state: await page.evaluate(() => JSON.parse(render_game_to_text())) });
    if (!scenario.imported) await arrival.waitFor({ state: 'detached', timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector('.arrival-highlight'));
    assert.equal(await page.locator('.arrival-highlight').count(), 0, 'highlight clears when the arrival ends');
  }
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify({ scenarios: results.length, errors }));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
