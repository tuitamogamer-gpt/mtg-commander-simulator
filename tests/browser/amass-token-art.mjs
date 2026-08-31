// PLAYWRIGHT_MODULE may point to an installed Playwright index.mjs.
// Actual Amass tokens in an imported Sauron game, using the normal UI renderers.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/amass-token-art/browser`;
mkdirSync(output, { recursive: true });
const manifest = JSON.parse(readFileSync(new URL('../../reports/oracle-import/sauron-dark-lord-moxfield.json', import.meta.url), 'utf8'));
const deckText = Object.entries(manifest.sections).flatMap(([section, rows]) => [
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
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});

try {
  await page.goto(`${base}/?smokeDeck=Quick%20Draw&seed=31831&smokeScenario=amassArtFixture`);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan');
  const tokens = await page.evaluate(async text => {
    const imported = MTG.importCommanderDeck(text, { name: 'Sauron Army image check', register: true });
    if (!imported.ok) throw new Error(JSON.stringify(imported.errors));
    const ui = new MTG.UI();
    const game = MTG.newGame({
      seed: 31831, humanDeck: imported.deck.name, aiDecks: ['Prismari Artistry'], paced: false,
      humanController: player => { ui.me = player; return ui.controllerFor(player); },
      onEvent: () => ui.queueRender(),
    });
    game.turnPlayer = ui.me; game.turnNo = 7; game.phase = 'main1'; game.step = 'main';
    ui.game = game; window._game = game; window._ui = ui;
    const made = [];
    for (const [index, kind] of ['Orc', 'Zombie'].entries()) {
      const player = game.players[index];
      const army = await MTG.E.amass(game, player, 3, kind);
      const same = await MTG.E.amass(game, player, 1, kind === 'Orc' ? 'Zombie' : 'Orc');
      if (same !== army || game.creatures(player).length !== 1) throw new Error('Amass created an extra Army');
      made.push({ iid: army.iid, name: army.name, power: army.power, toughness: army.toughness,
        counters: army.counters['+1/+1'], orc: army.hasSub('Orc'), zombie: army.hasSub('Zombie'), url: MTG.cardImageURL(army.name) });
    }
    ui.render();
    return made;
  }, deckText);
  for (const token of tokens) {
    assert.match(token.url, /^\.\/assets\/cards\/(orc|zombie)-army-.+\.webp$/);
    assert.equal(token.power, 4); assert.equal(token.toughness, 4); assert.equal(token.counters, 4);
    assert.equal(token.orc, true); assert.equal(token.zombie, true);
    const card = page.locator(`.mini[data-iid="${token.iid}"]`);
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(iid => {
      const image = document.querySelector(`.mini[data-iid="${iid}"] img`);
      return image?.complete && image.naturalWidth > 100;
    }, token.iid);
    const battlefieldURL = await card.locator('img').getAttribute('src');
    assert.equal(battlefieldURL, token.url);
    await card.click();
    const image = page.locator('.sheet > img');
    await image.waitFor();
    await page.waitForFunction(() => {
      const image = document.querySelector('.sheet > img');
      return image?.complete && image.naturalWidth > 100;
    });
    assert.equal(await image.getAttribute('src'), token.url);
    await page.screenshot({ path: `${output}/${token.name.toLowerCase().replaceAll(' ', '-')}.png` });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    results.push({ ...token, battlefieldURL, previewLoaded: true });
  }
  await page.screenshot({ path: `${output}/battlefield.png` });
  const state = await page.evaluate(() => JSON.parse(render_game_to_text()));
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors, state }, null, 2));
  console.log(JSON.stringify({ tokenTypes: results.length, battlefieldAndPreview: 'PASS', errors }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
