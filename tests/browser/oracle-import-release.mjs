// Natural guest import and gameplay gate. No account, game-state fixture, or remote writes.
// PLAYWRIGHT_MODULE may point to an installed Playwright index.mjs.
// Examples:
//   node tests/browser/oracle-import-release.mjs --min-batch 127
//   node tests/browser/oracle-import-release.mjs --url https://example.com --min-batch 127 --output output/oracle-production
//   node tests/browser/oracle-import-release.mjs --deck tests/fixtures/oracle-v6-dwynen-deck.txt --min-batch 67
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';
import { loadEngine } from '../helpers/load-engine.mjs';

const { values: args } = parseArgs({ options: {
  url: { type: 'string' }, output: { type: 'string' }, deck: { type: 'string' },
  'min-batch': { type: 'string' }, 'required-card': { type: 'string' },
  timeout: { type: 'string', default: '300000' }, headed: { type: 'boolean', default: false },
} });
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.resolve(args.output || 'output/web-game/oracle-import-release');
mkdirSync(output, { recursive: true });
const M = loadEngine();
const batchNumber = card => Number(/^oracle-(\d+)$/.exec(card?.engineBatch || '')?.[1] || 0);
const batches = Array.from(M.ORACLE_BATCHES).filter(batch => /^oracle-\d+$/.test(batch.id))
  .map(batch => ({ id: batch.id, count: batch.cards.length })).sort((a, b) => a.id.localeCompare(b.id));
const lastBatch = Math.max(...batches.map(batch => Number(batch.id.slice(7))));
const minBatch = Number(args['min-batch'] || Math.max(1, lastBatch - 29));
const timeout = Number(args.timeout);
assert.ok(Number.isSafeInteger(minBatch) && minBatch > 0 && minBatch <= lastBatch, 'min-batch must name an imported generic batch');
assert.ok(Number.isFinite(timeout) && timeout > 0, 'timeout must be positive milliseconds');
const catalogNames = Object.keys(M.CARD_CATALOG).sort();
const manaValue = def => [...(def.cost || '').matchAll(/\{([^}]+)\}/g)]
  .reduce((total, [, symbol]) => total + (/^\d+$/.test(symbol) ? Number(symbol) : symbol === 'X' ? 0 : 1), 0);

function generatedDeck() {
  // Prefer new inexpensive permanents, so an ordinary shuffled hand can reach
  // a real paid cast without granting mana/cards or altering the library.
  const eligible = Object.values(M.CARD_CATALOG).filter(card => {
    const def = M.DEFS[card.name];
    return card.deckImportEligible && card.commanderLegality === 'legal' && def &&
      def.types?.some(type => ['Creature', 'Artifact', 'Enchantment'].includes(type)) &&
      !def.subtypes?.includes('Aura') && !/\{X\}/.test(def.cost || '') && manaValue(def) > 0;
  });
  const choices = Object.entries({ G: 'Forest', W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain' }).map(([color, land]) => {
    const fits = card => card.colorIdentity.every(item => item === color);
    const cards = eligible.filter(fits).sort((a, b) =>
      Number(batchNumber(b) >= minBatch) - Number(batchNumber(a) >= minBatch) ||
      manaValue(M.DEFS[a.name]) - manaValue(M.DEFS[b.name]) || a.name.localeCompare(b.name));
    const commanders = eligible.filter(card => fits(card) && card.colorIdentity.includes(color) &&
      M.DEFS[card.name].types.includes('Creature') && M.DEFS[card.name].super?.includes('Legendary'));
    commanders.sort((a, b) => manaValue(M.DEFS[a.name]) - manaValue(M.DEFS[b.name]) || a.name.localeCompare(b.name));
    return { color, land, cards, commander: commanders[0],
      score: cards.filter(card => batchNumber(card) >= minBatch && manaValue(M.DEFS[card.name]) <= 3).length };
  }).filter(choice => choice.commander && choice.cards.length >= 60);
  choices.sort((a, b) => b.score - a.score);
  const choice = choices[0];
  assert.ok(choice?.score, 'The new cohort needs a cheap supported permanent or an explicit --deck fixture');
  const cards = choice.cards.filter(card => card.name !== choice.commander.name).slice(0, 59);
  if (args['required-card'] && !cards.some(card => card.name === args['required-card'])) {
    const required = choice.cards.find(card => card.name === args['required-card']);
    assert.ok(required, '--required-card must fit the generated deck; supply --deck for another color');
    cards[cards.length - 1] = required;
  }
  return ['Commander', `1 ${choice.commander.name} *CMDR*`, '', 'Deck',
    ...cards.map(card => `1 ${card.name}`), `40 ${choice.land}`, ''].join('\n');
}

const deckText = args.deck ? readFileSync(path.resolve(args.deck), 'utf8') : generatedDeck();
const deckName = `Oracle ${minBatch}-${lastBatch} browser QA`;
const imported = M.importCommanderDeck(deckText, { name: deckName });
assert.equal(imported.ok, true, JSON.stringify(imported.errors));
assert.equal(imported.summary.inputCards, 100);
const cohortNames = imported.deck.cards.map(card => card.name).filter(name => batchNumber(M.CARD_CATALOG[name]) >= minBatch);
assert.ok(cohortNames.some(name => !M.DEFS[name].types.includes('Land')), 'The fixture must contain a new-cohort spell');
if (args['required-card']) assert.ok(cohortNames.includes(args['required-card']), 'The required card must be a new-cohort deck card');
writeFileSync(path.join(output, 'deck.txt'), deckText);

let server;
let base = args.url || process.env.BASE_URL;
if (!base) {
  const app = express();
  app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
  app.use(express.static(root));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: !args.headed,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [], writes = [], checks = [], actions = [];
const screenshots = new Set();
page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
page.on('console', message => {
  if (message.type() === 'error') errors.push({ type: 'console', message: message.text(), location: message.location() });
});
await context.route('**/*', route => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) return route.continue();
  writes.push({ method: route.request().method(), url: route.request().url() });
  return route.abort('blockedbyclient');
});
await context.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgStopProfile', 'full');
  localStorage.setItem('mtgManaMode', 'auto');
});
const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const saveJSON = (name, value) => writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
function check(condition, message) {
  assert.ok(condition, message);
  checks.push(message);
  console.log(`PASS ${message}`);
}
async function snapshot(name) {
  if (screenshots.has(name)) return;
  await page.waitForFunction(() => [...document.querySelectorAll('.deckspotlight img, .actionstageart img, .hand img, .modal .cardgrid img')]
    .filter(img => { const bounds = img.getBoundingClientRect(); return bounds.width && bounds.height && bounds.top < innerHeight && bounds.bottom > 0; })
    .every(img => img.complete && img.naturalWidth > 1), null, { timeout: 15000 });
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  saveJSON(`${name}.json`, await state());
  screenshots.add(name);
}
async function openImporter() {
  await page.locator('[data-menu-action="import"]').first().click();
  await page.waitForSelector('.mainmenu-deckimport-panel');
  await page.waitForFunction(() => !window.MTGAccount?.loading &&
    document.querySelector('.mainmenu-deckimport')?.dataset.librarySource === 'guest');
  assert.equal(await page.evaluate(() => !!window.MTGAccount?.user), false, 'QA uses a fresh signed-out guest context');
}
async function clickButton(pattern, scope = page.locator('#game')) {
  const button = scope.getByRole('button', { name: pattern, disabled: false }).filter({ visible: true }).last();
  if (!await button.count()) return false;
  await button.click({ timeout: 5000 });
  return true;
}
async function observation() {
  return page.evaluate(({ minBatch, required }) => {
    const game = window._game, ui = window._ui, pending = ui.pending, q = pending?.q || ui.react?.q;
    const number = name => Number(/^oracle-(\d+)$/.exec(MTG.CARD_CATALOG[name]?.engineBatch || '')?.[1] || 0);
    const casts = (q?.casts || []).filter(row => row.from === 'hand' && !row.alt)
      .map(row => ({ name: row.card.name, iid: row.card.iid,
        cohort: number(row.card.name) >= minBatch, permanent: !row.card.is('Instant') && !row.card.is('Sorcery') }));
    casts.sort((a, b) => Number(b.name === required) - Number(a.name === required) ||
      Number(b.cohort) - Number(a.cohort) || Number(b.permanent) - Number(a.permanent));
    const successes = window.__oracleBrowser.resolved.filter(row => row.human && row.batch >= minBatch &&
      !row.countered && !row.fizzled && row.zone === 'battlefield' && (!required || row.name === required));
    return {
      pending: q?.type, min: q?.n ?? q?.min ?? 0, selected: pending?.sel?.length || 0,
      selectedIds: (pending?.sel || []).map(card => card.iid),
      options: (q?.options || []).map(option => ({ key: option.key, label: MTG.uiText(option.label) })),
      forcedAttackers: (q?.forced || []).filter(card => !(pending?.sel || []).some(entry => entry.card === card))
        .map(card => {
          const targets = game.legalDeclarationAttackTargets(card);
          return { iid: card.iid, targets: targets.map(target => target instanceof MTG.Player ? `player-${target.idx}` : `planeswalker-${target.iid}`) };
        }),
      candidates: (q?.from || q?.candidates || q?.player?.hand || []).map(card => ({ name: card.name, iid: card.iid })),
      lands: (q?.lands || []).map(card => ({ name: card.name, iid: card.iid })), casts,
      humanLands: game.lands(ui.me).length, successful: successes,
      aiResolved: window.__oracleBrowser.resolved.some(row => !row.human && !row.countered && !row.fizzled),
      stack: game.stack.map(item => ({ name: item.name, human: item.ctrl === ui.me, kind: item.kind, batch: number(item.card?.name) })),
      turn: game.turnNo, settled: q?.type === 'main' && !game.stack.length && !game.pendingTriggers.length,
      fatal: ui.fatalError || ui.syncError, gameOver: game.gameOver,
    };
  }, { minBatch, required: args['required-card'] || null });
}

try {
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  check(response?.status() === 200, 'Root returns HTTP 200');
  await openImporter();
  const loaded = await page.evaluate(() => ({
    names: Object.keys(MTG.CARD_CATALOG).sort(),
    batches: MTG.ORACLE_BATCHES.filter(batch => /^oracle-\d+$/.test(batch.id))
      .map(batch => ({ id: batch.id, count: batch.cards.length })).sort((a, b) => a.id.localeCompare(b.id)),
  }));
  assert.deepEqual(loaded.names, catalogNames, 'Browser catalog exactly matches current checkout');
  assert.deepEqual(loaded.batches, batches, 'Browser batches exactly match current checkout');
  check(loaded.batches.every(batch => batch.count === 100), `${catalogNames.length} catalog cards and ${batches.length} complete generic batches load`);
  await page.locator('.mainmenu-deckimport-name').fill(deckName);
  await page.locator('.mainmenu-deckimport-text').fill(deckText);
  await page.locator('.mainmenu-deckimport-check').click();
  check((await state()).deckImport.state === 'ready', 'The 100-card cohort deck passes the real paste/check UI');
  await page.locator('.mainmenu-deckimport-start').click();
  await page.waitForSelector('.deckspotlight');
  assert.match(await page.locator('.deckspotlight').innerText(), /Saved in this browser/);
  check(!await page.evaluate(() => !!window._game), 'Save to My Library opens spotlight without starting a game');
  await snapshot('01-saved-spotlight');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openImporter();
  check(await page.locator('.mainmenu-decklibrary-card[data-ready="true"]').count() === 1, 'Guest deck survives reload and revalidation');
  await snapshot('02-reloaded-library');
  await page.locator('.mainmenu-decklibrary-play').click();
  await page.waitForSelector('.deckspotlight');
  check(!await page.evaluate(() => !!window._game), 'My Library selection opens Deck spotlight without auto-start');
  await page.locator('.deckspotlightcontinue').click();
  assert.equal((await state()).stage, 'pod');
  // Imported lists now also support Live players. This gate exercises the
  // selected Solo table, whose reviewed seats must remain actual local AI.
  assert.equal(await page.locator('[data-mode="solo"]').evaluate(element=>element.classList.contains('selected')), true);
  await page.locator('[data-ai-count="2"]').click();
  const decks = page.locator('.botfields .deckselect');
  await decks.nth(0).selectOption('Quick Draw');
  await decks.nth(1).selectOption('Elven Council');
  const styles = page.locator('.botfields .styleselect:not(.deckselect)');
  await styles.nth(0).selectOption('balanced');
  await styles.nth(1).selectOption('balanced');
  await page.locator('.advancedrules summary').click();
  await page.locator('[data-difficulty="hard"]').click();
  await snapshot('03-pod');
  await page.locator('.podstage .pbtn.start:visible, .podstage .setupnext:visible').click();
  assert.equal((await state()).stage, 'review');
  const reviewText = await page.locator('.reviewstage').innerText();
  check(/Quick Draw/.test(reviewText) && /Elven Council/.test(reviewText) && /hard/i.test(reviewText), 'Review preserves the selected opponents and hard difficulty');
  assert.equal(await page.evaluate(() => !!window._game), false);
  await snapshot('04-review');
  await page.locator('.reviewstart').click();
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan');
  check((await state()).players.length === 3, 'Reviewed guest pod reaches the real opening-hand mulligan');
  await snapshot('05-mulligan');
  await page.evaluate(() => {
    // Observe calls without replacing controllers, changing hands/mana, or
    // bypassing the real Stack, costs, priority, or card implementation.
    const game = window._game;
    const record = window.__oracleBrowser = { casts: [], resolved: [] };
    const describe = (card, player) => ({ name: card.name, iid: card.iid, human: !player.isAI,
      batch: Number(/^oracle-(\d+)$/.exec(MTG.CARD_CATALOG[card.name]?.engineBatch || '')?.[1] || 0),
      turn: game.turnNo, manaSpent: card.castMeta?.manaSpent ?? null });
    const emit = game.emit;
    game.emit = async function (event, data) {
      if (this===game&&!this._simulation&&event === 'cast' && data.card) record.casts.push(describe(data.card, data.player));
      return emit.call(this, event, data);
    };
    const resolveTop = game.resolveTop;
    game.resolveTop = async function (...values) {
      const top = this.stack.at(-1), logStart = this.log.length;
      const result = await resolveTop.apply(this, values);
      if (this===game&&!this._simulation&&top?.kind === 'spell') record.resolved.push({ ...describe(top.card, top.ctrl),
        zone: top.card.zone, countered: !!top.countered,
        fizzled: this.log.slice(logStart).some(row => row.msg.includes(`${top.card.name}: all targets are illegal`)) });
      return result;
    };
  });
  await page.getByRole('button', { name: /^Keep/ }).click();
  const deadline = Date.now() + timeout;
  let completed = false;
  for (let step = 0; step < 1800 && Date.now() < deadline; step++) {
    await page.evaluate(() => window.advanceTime(250));
    const observed = await observation();
    assert.ok(!observed.fatal, `Game error: ${JSON.stringify(observed.fatal)}`);
    assert.ok(!observed.gameOver, 'The game must reach the cohort cast before ending');
    if (observed.humanLands) await snapshot('06-human-land');
    if (observed.stack.some(item => item.human && item.kind === 'spell' && item.batch >= minBatch)) await snapshot('07-human-cohort-stack');
    if (observed.stack.some(item => !item.human && item.kind === 'spell')) await snapshot('08-ai-stack');
    if (observed.successful.length && observed.aiResolved && observed.humanLands && observed.settled &&
      screenshots.has('07-human-cohort-stack') && screenshots.has('08-ai-stack')) { completed = true; break; }
    actions.push({ step, turn: observed.turn, pending: observed.pending, stack: observed.stack.map(item => item.name) });
    let clicked = false;
    if (observed.pending === 'main') {
      const action = observed.lands[0] || observed.casts[0];
      if (action) {
        const card = page.getByRole('button', { name: `${action.name}. Playable now. Open card actions.`, exact: true }).first();
        await card.click({ timeout: 5000 });
        clicked = await clickButton(observed.lands.length ? /^Play land$/ : /^Cast(?: |$)/);
        assert.ok(clicked, `Visible card actions must expose ${observed.lands.length ? 'Play land' : 'Cast'} for ${action.name}`);
      }
    } else if (observed.pending === 'chooseOption') {
      // Choices come from the human's offered UI options, never AI hidden cards.
      const option = observed.options.find(item => /decline|skip|cancel|stay/.test(String(item.key))) || observed.options[0];
      assert.ok(option, 'chooseOption exposes a legal choice');
      const selector = `[data-choice-key=${JSON.stringify(String(option.key))}]`;
      await page.locator(selector).click(); clicked = true;
    } else if (['bottomCards', 'chooseCards'].includes(observed.pending) && observed.selected < observed.min) {
      const candidate = observed.candidates.find(card => !observed.selectedIds.includes(card.iid));
      assert.ok(candidate, 'Card selection must expose enough candidates');
      await page.locator(`.modal .cardgrid [data-card-name=${JSON.stringify(candidate.name)}]:not(.selected)`).first().click();
      clicked = true;
    } else if (observed.pending === 'chooseTargets' && observed.selected < observed.min) {
      await page.locator('#game .targetable').filter({ visible: true }).first().click(); clicked = true;
    } else if (observed.pending === 'attackers' && observed.forcedAttackers.some(card => card.targets.length)) {
      const attacker = observed.forcedAttackers.find(card => card.targets.length);
      await page.locator(`.attackalloclane[data-target=${JSON.stringify(attacker.targets[0])}]`).click();
      await page.locator(`.attackpoolcard[data-attacker=${JSON.stringify(String(attacker.iid))}]`).click(); clicked = true;
    } else if (observed.pending === 'chooseMulti' && observed.selected < Math.max(1, observed.min)) {
      await page.locator('.modal .pbtn.wide:not(.selected)').filter({ visible: true }).first().click(); clicked = true;
    }
    if (!clicked) clicked = await clickButton(/^(?:Proceed|Pass|Continue|End turn|No attacks|No blocks|Got it|Confirm|Lock|Choose no targets|Cast with no targets|Keep|Use automatic mana)/);
    if (observed.pending === 'manualResolve') throw new Error('Certified imported card unexpectedly requested manual resolution');
    await page.waitForTimeout(clicked ? 35 : 80);
  }
  check(completed, 'Human cohort spell and AI spell resolve through real costs, choices and Stack into a stable main phase');
  const final = await observation();
  check(final.successful.some(card => Number(card.manaSpent) > 0), 'At least one new-cohort human permanent resolves after paying mana');
  check(screenshots.has('07-human-cohort-stack') && screenshots.has('08-ai-stack'), 'Human cohort and AI spells were observed on the Stack');
  const runtime = await page.evaluate(() => ({ ...window.__oracleBrowser,
    decisions: window._game.aiDecisionLog, stack: window._game.stack.length,
    pendingTriggers: window._game.pendingTriggers.length, seed: window._game.opts.seed }));
  check(!runtime.decisions.some(row => row.fallback), 'Local hard AI makes real decisions without fallback');
  check(!runtime.stack && !runtime.pendingTriggers, 'No unresolved Stack objects or entry triggers remain');
  await page.locator('.battlefieldarrival').waitFor({ state: 'detached', timeout: 10000 });
  await page.waitForFunction(() => !window._ui?.activePersonaReaction && !window._ui?.personaReactionQueue?.length &&
    !window._ui?.personaReactionDelayTimer && !document.querySelector('.personareaction'), null, { timeout: 30000 });
  await page.waitForTimeout(450);
  await snapshot('09-settled-gameplay');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Gameplay has no horizontal overflow');
  check(!writes.length, 'Guest QA makes no remote mutations');
  check(!errors.length, `No browser console or page errors${errors.length ? `: ${JSON.stringify(errors)}` : ''}`);
  saveJSON('game-state.json', { ...runtime, state: await state(), actions });
  saveJSON('report.json', { passed: true, url: base, minBatch, lastBatch, deck: deckName,
    cohortCardsInDeck: cohortNames, catalogCount: catalogNames.length, batches, checks, errors, writes,
    screenshots: [...screenshots], humanCohortResolved: final.successful, seed: runtime.seed });
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png'), animations: 'disabled' }).catch(() => {});
  saveJSON('failure.json', { passed: false, url: base, minBatch, lastBatch, error: error.stack, checks, errors, writes, actions,
    state: await state().catch(() => null), runtime: await page.evaluate(() => window.__oracleBrowser).catch(() => null),
    body: await page.locator('body').innerText().catch(() => '') });
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
