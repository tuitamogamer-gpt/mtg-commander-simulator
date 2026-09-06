// Controlled boards; paid casts, real priority/Stack, human clicks and local AI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { once } from 'node:events';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../../', import.meta.url).pathname;
const engine = process.env.BROWSER_ENGINE || 'chromium';
const out = process.env.ARENA_QA_OUTPUT || `${root}output/web-game/zurgo-graveyard-return/${engine}`;
fs.mkdirSync(out, { recursive: true });
const server = process.env.GAME_URL ? null : express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
if (server) await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
const page = await browser.newPage({ reducedMotion: 'reduce' });
const errors = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
});

async function state() {
  return page.evaluate(() => ({
    done: __zurgo.done, error: __zurgo.error, stage: __zurgo.stage,
    type: _ui.pending?.q.type, hint: _ui.pending?.q.aiHint?.kind,
    toZone: _ui.pending?.q.aiHint?.toZone, prompt: _ui.pending?.q.prompt,
    selected: _ui.pending?.sel?.length || 0,
    candidates: (_ui.pending?.q.candidates || []).map(c => ({ iid: c.iid, name: c.name, zone: c.zone })),
    zurgo: __zurgo.zurgo.zone, iid: __zurgo.zurgo.iid, version: __zurgo.zurgo.zoneVersion,
    cmdCasts: __zurgo.zurgo.cmdCasts, hit: __zurgo.zurgo.counters.hit || 0,
    ownerGY: __zurgo.owner.graveyard.map(c => c.name), ownerExile: __zurgo.owner.exile.map(c => c.name),
    stack: _game.stack.map(so => ({ name: so.name, kind: so.kind, targets: so.targets?.map(c => c?.name) })),
    choices: __zurgo.choices, casts: __zurgo.casts,
    fallback: (_game.aiDecisionLog || []).some(row => row.fallback) || !!_game._decisionFallbacks,
    text: JSON.parse(render_game_to_text()),
  }));
}

async function shot(label) {
  await page.screenshot({ path: `${out}/${label}.png`, animations: 'disabled' });
  fs.writeFileSync(`${out}/${label}.json`, JSON.stringify(await state(), null, 2));
}

async function stage(name, scenario) {
  await page.evaluate(name => { __zurgo.start(name); }, name);
  for (let n = 0; n < 160; n++) {
    const s = await state();
    assert.equal(s.error, null);
    if (s.done) return s;
    if (s.type === 'main') {
      if (name === 'commander') await page.getByRole('button', { name: 'Zurgo Stormrender. Open commander actions.', exact: true }).click();
      else await page.locator('.hand [data-cname="Sun Titan"]').first().click();
      await page.locator('.sheetacts button').filter({ hasText: /^Cast/ }).first().click();
    } else if (s.hint === 'commanderZone') {
      await shot(`${scenario.label}-${name}-${s.toZone}-choice`);
      const key = s.toZone === 'graveyard' ? 'stay' : scenario.exileChoice || 'cz';
      await page.locator(`[data-choice-key="${key}"]`).click();
    } else if (s.type === 'chooseTargets') {
      const candidate = s.candidates.find(c => c.iid === s.iid) || s.candidates[0];
      assert.ok(candidate, s.prompt);
      if (!s.selected) {
        if (candidate.zone === 'graveyard') {
          await page.getByRole('button', { name: /^Graveyard: \d+ cards$/ }).click();
          await shot(`${scenario.label}-titan-graveyard-target`);
          await page.locator('.sheet .bigcard').filter({ has: page.locator('img[alt="Zurgo Stormrender"]') }).click();
        } else await page.locator(`.mini[data-iid="${candidate.iid}"]`).filter({ visible: true }).first().click();
      }
      await page.getByRole('button', { name: /Lock.*1 target/ }).click();
    } else if (s.hint === 'sunTitanReturn') {
      await shot(`${scenario.label}-titan-return-choice`);
      await page.locator('[data-choice-key="yes"]').click();
    } else {
      const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/ }).filter({ visible: true });
      if (await proceed.count()) await proceed.last().click();
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`${scenario.label}/${name} stalled: ${JSON.stringify(await state())}`);
}

const scenarios = [
  { label: 'human-return-desktop', width: 1440 },
  { label: 'human-return-phone', width: 390 },
  { label: 'human-mari-command', width: 390, source: 'Mari, the Killing Quill' },
  { label: 'human-mari-exile', width: 1440, source: 'Mari, the Killing Quill', exileChoice: 'stay' },
  { label: 'human-lantern-command', width: 1440, source: 'Soul-Guide Lantern' },
  { label: 'ai-return', width: 1440, aiOwner: true },
  { label: 'ai-mari-command', width: 1440, aiOwner: true, source: 'Mari, the Killing Quill' },
];

try {
  for (const scenario of scenarios) {
    await page.setViewportSize({ width: scenario.width, height: scenario.width === 390 ? 844 : 1000 });
    await page.goto(base);
    await page.locator('[data-menu-action="solo"]').first().click();
    await page.waitForSelector('.deckentry');
    await page.evaluate(scenario => {
      const surface = document.querySelector('#game');
      surface.replaceWith(surface.cloneNode(false));
      document.body.classList.add('game-active');
      document.querySelector('#setup').style.display = 'none';
      document.querySelector('#game').style.display = 'flex';
      const ui = new MTG.UI();
      const game = new MTG.Game({ seed: 90609, paced: true, onEvent: () => ui.queueRender() });
      const human = game.addPlayer('You', { name: 'Mardu Surge' }, null, false);
      const bot = game.addPlayer('Local AI', { name: 'Most Wanted' }, null, true);
      human.controller = ui.controllerFor(human);
      bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
      ui.me = human; ui.game = game;
      const owner = scenario.aiOwner ? bot : human, enemy = scenario.aiOwner ? human : bot;
      const put = (name, player, zone = 'battlefield') => {
        const card = new MTG.CardInst(MTG.DEFS[name], player);
        card.zone = zone; card.ctrl = player; card.sick = false;
        if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
        return card;
      };
      for (const player of game.players) {
        for (let i = 0; i < 30; i++) put('Forest', player, 'library');
        for (const name of [...Array(10).fill('Plains'), ...Array(6).fill('Swamp'), ...Array(2).fill('Mountain')]) put(name, player);
      }
      const zurgo = put('Zurgo Stormrender', owner, 'command');
      zurgo.commander = true; zurgo.cmdCasts = 2; owner.commanders.push(zurgo);
      const titan = put('Sun Titan', owner, 'hand'), murder = put('Murder', enemy, 'hand');
      const source = scenario.source ? put(scenario.source, enemy, 'hand') : null;
      const qa = window.__zurgo = { zurgo, titan, source, owner, enemy, choices: [], casts: [], done: true, error: null };
      const decide = owner.controller.decide.bind(owner.controller);
      owner.controller.decide = async (g, q) => {
        if (q.aiHint?.kind === 'commanderZone') {
          qa.choices.push({ zone: q.aiHint.toZone, current: zurgo.zone, hit: zurgo.counters.hit || 0, depth: g._stackResolutionDepth || 0 });
          if (scenario.aiOwner && q.aiHint.toZone === 'graveyard') return 'stay';
        }
        return decide(g, q);
      };
      const castSpell = game.castSpell.bind(game);
      game.castSpell = async (player, card, opts) => {
        const ok = await castSpell(player, card, opts);
        if (ok) qa.casts.push({ name: card.name, spent: card.castMeta?.manaSpent, player: player.name });
        return ok;
      };
      game.turnPlayer = owner; game.turnNo = 12; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
      game.recalc(); window._game = game; window._ui = ui;
      qa.start = name => {
        qa.done = false; qa.error = null; qa.stage = name;
        void (async () => {
          let ok;
          if (name === 'commander' || name === 'titan') {
            game.turnPlayer = owner;
            const card = name === 'commander' ? zurgo : titan;
            if (scenario.aiOwner) ok = await game.castSpell(owner, card, { from: card.zone });
            else {
              const action = await owner.controller.decide(game, {
                type: 'main', player: owner, casts: game.castableList(owner), acts: game.activatableList(owner), lands: [], phase: game.phase,
              });
              ok = await game.performAction(owner, action);
            }
          } else if (name === 'source' || name === 'death') {
            game.turnPlayer = enemy;
            ok = await game.castSpell(enemy, name === 'source' ? source : murder, { from: 'hand', quickTargets: name === 'death' ? [zurgo] : [] });
          } else if (name === 'lantern') {
            const ability = game.activatableList(enemy).find(action => action.card === source && /exile opponents/.test(action.ability.label));
            ok = await game.activateAbility(enemy, ability);
          }
          if (!ok) throw new Error(`Action failed: ${name}`);
          await game.flushTriggers();
          await game.priorityRound(game.turnPlayer);
          qa.done = true; ui.render();
        })().catch(error => { qa.error = error.stack; });
      };
      ui.render();
    }, scenario);
    await stage('commander', scenario);
    if (scenario.source) await stage('source', scenario);
    const death = await stage('death', scenario);
    if (scenario.source !== 'Mari, the Killing Quill') {
      assert.equal(death.zurgo, 'graveyard');
      if (!scenario.aiOwner) {
        await page.getByRole('button', { name: /^Graveyard: \d+ cards$/ }).click();
        await shot(`${scenario.label}-graveyard`);
        await page.getByRole('button', { name: 'Close', exact: true }).click();
      }
    }
    if (scenario.source === 'Soul-Guide Lantern') await stage('lantern', scenario);
    const final = await stage('titan', scenario);
    const expected = !scenario.source ? 'battlefield' : scenario.exileChoice === 'stay' ? 'exile' : 'command';
    assert.equal(final.zurgo, expected);
    assert.equal(final.cmdCasts, 3);
    assert.equal(final.hit, expected === 'exile' ? 1 : 0);
    assert.deepEqual(final.choices.map(choice => choice.zone), scenario.source ? ['graveyard', 'exile'] : ['graveyard']);
    assert.ok(final.choices.every(choice => choice.zone === choice.current && choice.depth === 0));
    assert.equal(final.casts.find(cast => cast.name === 'Zurgo Stormrender').spent, 7);
    assert.equal(final.casts.find(cast => cast.name === 'Sun Titan').spent, 6);
    assert.equal(final.casts.find(cast => cast.name === 'Murder').spent, 3);
    assert.equal(final.fallback, false);
    assert.deepEqual(final.stack, []);
    await shot(`${scenario.label}-final`);
    results.push({ scenario, final });
    console.log('PASS', scenario.label);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/report.json`, JSON.stringify({ results, errors }, null, 2));
} catch (error) {
  await shot('failure');
  fs.writeFileSync(`${out}/failure-error.json`, JSON.stringify({ error: error.stack, errors }, null, 2));
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
