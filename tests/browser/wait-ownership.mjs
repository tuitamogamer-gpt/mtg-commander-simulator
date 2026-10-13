// Honest decision ownership through native paid human and AI choices.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.WAIT_OUTPUT || join(tmpdir(), 'mtg-wait-ownership');
let server, base = process.env.GAME_URL;
mkdirSync(output, {recursive: true});
if (!base) {
  server = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
    .use(express.static(root)).listen(0, '127.0.0.1');
  await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
}
const browser = await chromium.launch({headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {}),
});
const page = await browser.newPage({viewport: {width: 390, height: 844}, hasTouch: true, reducedMotion: 'reduce'});
page.setDefaultTimeout(20000);
const errors = [], receipt = {target: base};
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
});
const wait = callback => page.waitForFunction(callback, null, {timeout: 20000});

async function fixture(spellName) {
  await page.evaluate(spellName => {
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none'; document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI(), game = new MTG.Game({seed: 131039, paced: false, onEvent: () => ui.queueRender()});
    const pass = {decide: async (_game, q) => {
      if (q.type === 'priority') return {kind: 'pass'};
      throw new Error(`Unexpected AI decision: ${q.type}`);
    }};
    const you = game.addPlayer('You', {name: 'Quick Draw'}, null, false);
    const dragon = game.addPlayer('AI Dragon', {name: 'Quick Draw'}, {decide: async (_game, q) => {
      if (q.type === 'priority') return {kind: 'pass'};
      if (q.type === 'chooseCards' && spellName === 'Fact or Fiction') return new Promise(resolve => {__wait.aiChoice = {q, resolve};});
      throw new Error(`Unexpected Dragon decision: ${q.type}`);
    }}, true);
    game.addPlayer('AI Wolf', {name: 'Quick Draw'}, pass, true);
    ui.game = game; ui.me = you; ui.prioMode = 'off'; you.controller = ui.controllerFor(you);
    game.turnPlayer = you; game.turnNo = 7; game.phase = 'main1'; game.step = 'main';
    window._game = game; window._ui = ui;
    const put = (name, zone = 'battlefield', owner = you) => {
      const card = new MTG.CardInst(MTG.DEFS[name], owner); card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card); return card;
    };
    for (const player of game.players) {
      const commander = put(MTG.DECKS['Quick Draw'].commander, 'command', player);
      commander.commander = true; player.commanders = [commander];
    }
    const lands = Array.from({length: 4}, () => put(spellName === 'Fact or Fiction' ? 'Island' : 'Forest'));
    if (spellName === 'Fact or Fiction') for (const name of ['Forest', 'Opt', 'Island', 'Grizzly Bears', 'Mountain']) put(name, 'library');
    const spell = put(spellName, 'hand'); game.recalc();
    window.__wait = {game, ui, you, dragon, lands, spell, status: 'pending', error: null};
    ui.render();
    void game.castSpell(you, spell, {from: 'hand'}).then(value => {__wait.status = 'resolved'; __wait.value = value;},
      error => {__wait.status = 'rejected'; __wait.error = error.message;});
  }, spellName);
}

try {
  await page.goto(base); await page.locator('[data-menu-action="solo"]').first().click();
  await page.waitForSelector('.deckentry:visible', {timeout: 120000});
  await wait(() => !!MTG.DEFS?.['Fact or Fiction']);
  await fixture('Fact or Fiction');
  await wait(() => _ui.pending?.q.prompt === 'Fact or Fiction: choose an opponent');
  await page.locator('[data-choice-key="1"]').click();
  await wait(() => !!__wait.aiChoice);
  await page.getByRole('status').filter({hasText: 'Waiting for AI Dragon'}).waitFor({state: 'visible'});
  receipt.aiChoice = await page.evaluate(() => ({status: _ui.waitStatus(), holder: _game.priorityState.holder.name,
    depth: _game._stackResolutionDepth, stack: _game.stack.length, zone: __wait.spell.zone,
    manaSpent: __wait.spell.castMeta.manaSpent, tapped: __wait.lands.filter(card => card.tapped).length,
    text: document.querySelector('.promptbar').textContent}));
  assert.equal(receipt.aiChoice.status.playerName, 'AI Dragon');
  assert.equal(receipt.aiChoice.status.questionType, 'chooseCards');
  assert.equal(receipt.aiChoice.holder, 'AI Wolf'); assert.equal(receipt.aiChoice.stack, 0);
  assert.equal(receipt.aiChoice.depth, 1); assert.equal(receipt.aiChoice.manaSpent, 4); assert.equal(receipt.aiChoice.tapped, 4);
  assert.match(receipt.aiChoice.text, /Resolving Fact or Fiction/);
  assert.doesNotMatch(receipt.aiChoice.text, /Opponents are playing|Waiting for AI Wolf/);
  await page.screenshot({path: `${output}/01-ai-pile-choice.png`, animations: 'disabled'});
  await page.evaluate(() => {__wait.aiChoice.resolve(__wait.aiChoice.q.from.slice(0, 2));});
  await wait(() => _ui.pending?.q.type === 'chooseOption');
  assert.equal(await page.evaluate(() => _ui.waitStatus().kind), 'human');
  const key = await page.evaluate(() => _ui.pending.q.options[0].key);
  await page.locator(`[data-choice-key="${key}"]`).click();
  await wait(() => __wait.status !== 'pending');
  assert.deepEqual(await page.evaluate(() => ({value: __wait.value, error: __wait.error, zone: __wait.spell.zone,
    pending: _ui.pendings.length, kind: _ui.waitStatus().kind})),
  {value: true, error: null, zone: 'graveyard', pending: 0, kind: 'between'});

  await fixture('Roaming Throne');
  await wait(() => _ui.pending?.q.aiHint?.kind === 'chooseType');
  receipt.humanChoice = await page.evaluate(() => ({status: _ui.waitStatus(), zone: __wait.spell.zone,
    manaSpent: __wait.spell.castMeta.manaSpent, tapped: __wait.lands.filter(card => card.tapped).length}));
  assert.equal(receipt.humanChoice.status.kind, 'human');
  assert.equal(receipt.humanChoice.status.detail, 'Choose a creature type.');
  assert.equal(await page.locator('.modal [data-testid="wait-status"]').textContent(), 'Waiting for you');
  await page.screenshot({path: `${output}/02-human-creature-type.png`, animations: 'disabled'});
  const search = page.getByRole('searchbox', {name: 'Creature type'});
  await search.fill('Ninja'); await search.press('Enter');
  await wait(() => __wait.status !== 'pending');
  receipt.final = await page.evaluate(() => ({value: __wait.value, error: __wait.error, zone: __wait.spell.zone,
    type: __wait.spell.meta.cslType, manaSpent: __wait.spell.castMeta.manaSpent,
    tapped: __wait.lands.filter(card => card.tapped).length, pending: _ui.pendings.length,
    status: _ui.waitStatus(), renderError: _ui.renderError?.message ?? null}));
  assert.equal(receipt.final.value, true); assert.equal(receipt.final.type, 'Ninja');
  assert.equal(receipt.final.manaSpent, 4); assert.equal(receipt.final.tapped, 4);
  assert.equal(receipt.final.pending, 0); assert.equal(receipt.final.status.kind, 'between');
  assert.equal(receipt.final.renderError, null); assert.deepEqual(errors, []);
  await page.screenshot({path: `${output}/03-complete.png`, animations: 'disabled'});
  console.log(JSON.stringify({ok: true, aiChoice: receipt.aiChoice.status, humanChoice: receipt.humanChoice.status, final: receipt.final}));
} catch (error) {
  receipt.failure = error.message; process.exitCode = 1; console.error(error.message);
} finally {
  receipt.errors = errors; writeFileSync(`${output}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
  await browser.close(); if (server) server.close();
}
