// Every deck at the table has its own sleeve: face-down cards, library reveals
// and the card back picker show the owner's deck, never the concealed card.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import express from 'express';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = readFileSync(new URL('./fixtures/populated-resource-board.js', import.meta.url), 'utf8');
const output = process.env.DECK_SLEEVES_OUTPUT || `${root}output/web-game/deck-sleeves`;
mkdirSync(output, {recursive: true});
const server = express().use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));

// The sleeve each rendered face-down permanent shows, by owner.
const faceDownBacks = () => page.evaluate(() => [...document.querySelectorAll('#game .mini.facedown img.cardback-art')].map(image => ({
  owner: image.dataset.sleeveOwner, src: image.getAttribute('src'), alt: image.alt, width: image.naturalWidth,
  iid: image.closest('.mini').dataset.iid})));
const composed = () => page.waitForFunction(() => {
  const images = [...document.querySelectorAll('#game .mini.facedown img.cardback-art')];
  return images.length === 4 && images.every(image => image.src.startsWith('blob:') && image.complete && image.naturalWidth === 600);
});
// Average color of the medallion, to tell the drawn sleeves apart.
const medallions = urls => page.evaluate(async urls => Promise.all(urls.map(async url => {
  const image = new Image(); image.src = url; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 840;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(240, 345, 120, 120).data, sum = [0, 0, 0];
  for (let i = 0; i < data.length; i += 4) { sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2]; }
  return sum.map(total => Math.round(total / (data.length / 4)));
})), urls);

try {
  await page.addInitScript(() => { localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1'); });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-menu-action="solo"]').first().click();
  await page.locator('.deckentry').first().waitFor({timeout: 120000});
  await page.addScriptTag({content: fixture});
  await page.evaluate(() => {
    for (const player of _game.players) _game.creatures(player)[0].faceDown = true;
    _ui.render();
  });
  await composed();
  let backs = await faceDownBacks();
  assert.deepEqual(backs.map(back => back.owner).sort(), ['0', '1', '2', '3']);
  assert.equal(new Set(backs.map(back => back.src)).size, 4, 'four decks, four sleeves');
  assert.ok(backs.every(back => back.alt === 'Face-down card'));
  const colors = await medallions(backs.map(back => back.src));
  for (let a = 0; a < colors.length; a++) for (let b = a + 1; b < colors.length; b++)
    assert.ok(colors[a].some((value, channel) => Math.abs(value - colors[b][channel]) > 6), `medallions differ: ${JSON.stringify(colors)}`);
  await page.screenshot({path: `${output}/table.png`});
  console.log('PASS every deck at the table shows its own drawn sleeve on face-down cards');

  // The owner chooses the sleeve: a stolen face-down card keeps it, and the
  // markup carries nothing about the concealed card.
  const control = await page.evaluate(() => {
    const card = _game.creatures(_game.players[2]).find(candidate => candidate.faceDown);
    card.ctrl = _game.players[1]; _game.recalc(); _ui.render();
    const image = document.querySelector(`#game .mini[data-iid="${card.iid}"] img.cardback-art`);
    const html = MTG.cardArtHTML({name: 'PRIVATE SENTINEL', faceDown: true, owner: _game.players[2], def: {name: 'PRIVATE SENTINEL'}});
    return {owner: image.dataset.sleeveOwner, src: image.getAttribute('src'), html, expected: MTG.deckBackURL(_game.players[2])};
  });
  assert.equal(control.owner, '2');
  assert.equal(control.src, control.expected);
  assert.equal(backs.find(back => back.owner === '2').src, control.expected);
  assert.doesNotMatch(control.html, /PRIVATE SENTINEL/);
  assert.match(control.html, /alt="Face-down card"/);
  assert.match(control.html, /data-sleeve-owner="2"/);
  console.log('PASS a face-down card keeps its owner\'s sleeve under another controller; concealed names stay out');

  await page.evaluate(() => {
    const owner = _game.players[3];
    window.__answers = [];
    _ui.me.controller.decide(_game, {type: 'cardReveal', kind: 'reveal', libraryReveal: true, revealStage: 'start', cards: [],
      ctrl: owner, title: 'Cascade', libraryOwner: owner, revealAction: 'reveal', player: _ui.me,
      prompt: `${owner.name}: reveal cards from the library one at a time.`}).then(answer => __answers.push(answer));
  });
  await page.locator('.libraryrevealback').waitFor();
  const reveal = await page.evaluate(() => ({owner: document.querySelector('.libraryrevealback').dataset.sleeveOwner,
    background: getComputedStyle(document.querySelector('.libraryrevealback')).backgroundImage, sleeve: MTG.deckBackURL(_game.players[3])}));
  assert.equal(reveal.owner, '3');
  assert.ok(reveal.background.includes(reveal.sleeve), JSON.stringify(reveal));
  await page.screenshot({path: `${output}/library-reveal.png`});
  await page.locator('.libraryrevealwrap .pbtn.primary').click();
  await page.waitForFunction(() => __answers.length === 1);
  console.log('PASS a library reveal shows the library owner\'s sleeve');

  await page.evaluate(() => { _ui.quickMenuOpen = 'cardbacks'; _ui.render(); });
  await page.locator('.cardbackpicker').waitFor();
  const picker = () => page.evaluate(() => ({
    hero: document.querySelector('.cardbackheroimage').getAttribute('src'), frame: document.querySelector('.cardbackheroimage').dataset.frame,
    seats: [...document.querySelectorAll('.cardbacktablesleeve')].map(image => image.getAttribute('src')),
    names: [...document.querySelectorAll('.cardbacktablename b')].map(name => name.textContent), mine: MTG.deckBackURL(_ui.me)}));
  let view = await picker();
  assert.equal(view.frame, 'obsidian');
  assert.equal(view.hero, view.mine, 'the large preview is your deck sleeve');
  assert.deepEqual(view.names, ['You', 'AI Dragon', 'AI Wolf', 'AI Raven']);
  assert.equal(new Set(view.seats).size, 4);
  await page.screenshot({path: `${output}/picker.png`});
  await page.locator('[data-card-back="astral"]').click();
  assert.equal(await page.evaluate(() => document.activeElement.dataset.cardBack), 'astral');
  await page.waitForFunction(previous => {
    const hero = document.querySelector('.cardbackheroimage');
    return hero.dataset.frame === 'astral' && hero.src.startsWith('blob:') && !previous.includes(hero.getAttribute('src')) &&
      hero.complete && hero.naturalWidth === 600;
  }, view.seats);
  view = await picker();
  assert.equal(view.hero, view.mine);
  assert.equal(new Set(view.seats).size, 4);
  await page.waitForFunction(seats => [...document.querySelectorAll('#game .mini.facedown img.cardback-art')]
    .every(image => seats.includes(image.getAttribute('src'))), view.seats);
  assert.equal(await page.evaluate(() => MTG.cardBackURL()), './assets/cardbacks/astral.webp', 'unknown decks keep the plain design');
  await page.screenshot({path: `${output}/picker-astral.png`});
  console.log('PASS the picker shows your sleeve and the table\'s; a new design redraws every sleeve in place');

  const fixed = await page.evaluate(() => {
    const [first, second] = _game.players, before = MTG.deckSleeveSpec(second).key;
    second.commanders = first.commanders.slice();
    return before === MTG.deckSleeveSpec(second).key;
  });
  assert.equal(fixed, true);
  console.log('PASS a sleeve stays fixed for the game once its deck is known');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  server.close();
}
