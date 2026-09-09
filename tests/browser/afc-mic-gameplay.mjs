// A complete human UI game: all answers are clicks or keyboard actions.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
app.use(express.static(fileURLToPath(new URL('../../', import.meta.url))));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = process.env.GAME_URL || `http://127.0.0.1:${server.address().port}`;
const out = process.env.PLAYER_GAMEPLAY_QA_OUTPUT || 'output/precon-afc-mic-2026-09-09/natural-game';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: {
  width: Number(process.env.ARENA_VIEWPORT_WIDTH || 1440),
  height: Number(process.env.ARENA_VIEWPORT_HEIGHT || 1000),
} });
page.setDefaultTimeout(8000);
const errors = [], requests = [], seen = new Set();
let iterations = 0, lands = 0, spells = 0, attacks = 0, stale = 0, previous = '';
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400) requests.push({ status: r.status(), url: r.url() }); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgPlayerPreferences', JSON.stringify({ speed: 'fast', handSort: 'type' }));
});
const firstVisible = selector => page.locator(selector).first();
async function clickIf(selector) {
  const item = firstVisible(selector);
  if (await item.count()) { await item.click(); return true; }
  return false;
}
try {
  await page.goto(base);
  await page.locator('[data-menu-action="solo"]').first().click();
  // The landing shell lazy-loads the complete local card catalog on first use.
  await page.waitForSelector('.deckentry', { timeout: 30000 });
  await page.evaluate(()=>{const record=MTG.recordSaveDecision;MTG.recordSaveDecision=function(q,p,result){try{return record(q,p,result);}catch(e){window.__recordError={type:q.type,prompt:q.prompt,resultType:typeof result,resultKeys:Object.keys(result||{}),stack:e.stack};throw e;}};});
  await page.locator('.decksearch input').fill(process.env.PLAYER_HUMAN_DECK || 'Undead Unleashed');
  await page.locator('.deckcard:visible').click();
  await page.locator('.deckspotlightcontinue').click();
  await page.locator('[data-pod-preset="learn"]').click();
  await page.locator('.botfields .deckselect').selectOption(process.env.PLAYER_AI_DECK || 'Aura of Courage');
  await page.locator('.setupnext').click();
  // Pin only seed generation. Every gameplay decision still uses the real UI.
  await page.evaluate(() => { window.__qaRandom = Math.random; Math.random = () => 11081 / 1e9; });
  await page.locator('.reviewstart').click();
  await page.waitForFunction(() => !!window._ui?.pending);
  assert.equal(await page.evaluate(() => MTG.activeAccountMatch.setup.seed), '11081');
  await page.evaluate(() => { Math.random = window.__qaRandom; delete window.__qaRandom; _game.speedFactor = 0; });
  for (; iterations < 1100; iterations++) {
    const s = await page.evaluate(() => {
      const q = _ui.pending?.q;
      return {
        over: _game.gameOver, turn: _game.turnNo, type: q?.type, hint: q?.aiHint?.kind,
        count: MTG.activeAccountMatch?.decisions.length || 0,
        land: q?.type === 'main' && q.lands?.length ? { id: q.lands[0].iid, name: q.lands[0].name } : null,
        cast: q?.type === 'main' && q.casts?.length ? (()=>{const entry=q.casts.find(e=>e.card.is('Creature'))||q.casts[0];return {id:entry.card.iid,name:entry.card.name};})() : null,
        selected: _ui.pending?.sel?.length || 0,
      };
    });
    const fatal=await page.evaluate(()=>_ui.fatalError?.stack);if(fatal)throw Error(fatal);
    if (s.over) break;
    if (s.type) seen.add(s.type);
    const fingerprint = `${s.turn}|${s.type}|${s.count}|${s.selected}`;
    stale = fingerprint === previous ? stale + 1 : 0; previous = fingerprint;
    if (stale > 150) throw new Error(`UI stopped progressing: ${fingerprint}`);
    if (!s.type) {
      if (await clickIf('.actionstage .pbtn.primary:visible')) continue;
      if (await clickIf('.reveal .pbtn.primary:visible')) continue;
      if (await clickIf('.promptbar .pbtn.primary:visible')) continue;
      await page.waitForTimeout(80); continue;
    }
    if (s.type === 'main' && (s.land || s.cast)) {
      const card = s.land || s.cast;
      await page.locator('.commandbutton').click();
      await page.locator('.commandsearch').fill(card.name);
      await page.locator(`.commandresult[data-card-id="${card.id}"]`).click();
      const action = page.locator('.sheetacts .pbtn.primary').first();
      assert.ok(await action.count(), `legal card action for ${card.name}`);
      await action.click();
      if (s.land) lands++; else spells++;
      continue;
    }
    // This human policy declines optional kicker and develops creatures first.
    // It never repeats a knowingly impossible additional-target announcement.
    if(s.type==='chooseOption'&&s.hint==='kicker'){await page.getByRole('button',{name:'No',exact:true}).filter({visible:true}).click();continue;}
    if (s.type === 'attackers') {
      // The interface requires an explicit defender before assigning a group.
      if (!await page.locator('.attackalloclane.focused').count()) {
        const players = page.locator('.attackalloclane.player');
        const defender = await players.count() ? players.first() : page.locator('.attackalloclane').first();
        if (await defender.count()) { await defender.click(); continue; }
      }
      const available = page.locator('.attackpoolcard:not(.assigned):not(.cantfocus)');
      if (await available.count()) { await available.first().click(); continue; }
      if (await clickIf('.attackallocmodal .pbtn.primary:not(:disabled):visible')) { attacks++; continue; }
      await page.getByRole('button', { name: /No attacks/ }).click();
      continue;
    }
    if (s.type === 'chooseTargets' || s.type === 'choosePlayer') {
      if (await clickIf('.promptbar .pbtn.primary:not(:disabled):visible')) continue;
      if (await clickIf('#game .targetable:not(.selected):visible')) continue;
      const hiddenTarget=await page.evaluate(()=>{const c=_ui.pending?.q.candidates?.find(c=>['graveyard','exile'].includes(c.zone));return c&&{zone:c.zone,own:c.owner===_ui.me,owner:MTG.uiText(c.owner.name)};});
      if(hiddenTarget){if(hiddenTarget.own)await page.locator(`.meinfo .zbtn[data-z="${hiddenTarget.zone}"]`).click();else{await page.getByRole('button',{name:`Open ${hiddenTarget.owner} player details`,exact:true}).click();await page.locator('.sheet .btnrow button').filter({hasText:hiddenTarget.zone==='graveyard'?'🪦':'🌀'}).first().click();}await page.locator('.sheet .targetable').first().click();continue;}

    }
    if (['chooseCards', 'bottomCards'].includes(s.type)) {
      if (await clickIf('.modal .pbtn.primary:not(:disabled):visible')) continue;
      if (await clickIf('.modal .bigcard:not(.selected):visible')) continue;
    }
    if (await clickIf('.actionstage .pbtn.primary:visible')) continue;
    if (await clickIf('.reveal .pbtn.primary:visible')) continue;
    if (await clickIf('.modal .pbtn.primary:not(:disabled):visible')) continue;
    if (await clickIf('.modal .pbtn:not(:disabled):visible')) continue;
    if (await clickIf('.promptbar .pbtn.primary:not(:disabled):visible')) continue;
    await page.locator('body').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('Space');
    await page.waitForTimeout(40);
    if (iterations % 80 === 0) console.log(JSON.stringify({ iterations, turn: s.turn, type: s.type, lands, spells, attacks }));
  }
  assert.equal(await page.evaluate(() => _game.gameOver), true, 'the full game finishes');
  assert.ok(lands >= 3 && spells >= 2 && attacks >= 1, 'real land, spell and combat input paths were exercised');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/complete.png` });
  writeFileSync(`${out}/complete-state.json`, await page.evaluate(() => render_game_to_text()));
  console.log(JSON.stringify({ iterations, lands, spells, attacks, decisions: [...seen], state: await page.evaluate(() => ({ turn: _game.turnNo, winner: _game.winner?.name })) }));
  const finishedPod = await page.evaluate(() => _game.players.map(player => player.deckName).sort());
  await page.getByRole('button', { name: /Rematch same pod/i }).click();
  await page.waitForFunction(() => _ui.pending?.q.type === 'mulligan');
  assert.deepEqual(await page.evaluate(() => _game.players.map(player => player.deckName).sort()), finishedPod);
  await page.keyboard.press('Control+k');
  assert.equal(await page.locator('.commandpalette').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => _ui.pending?.q.type), 'mulligan');
  assert.equal(await page.evaluate(() => _ui.handSort), 'type');
  await page.screenshot({ path: `${out}/rematch.png` });
  console.log('PASS rematch keeps the pod and preferences; one search dialog opens and Escape preserves mulligan.');
} finally {
  if (await page.evaluate(() => !!window._game)) {
    writeFileSync(`${out}/state.json`, await page.evaluate(() => render_game_to_text()));
    await page.screenshot({ path: `${out}/last-frame.png` });
  }
  writeFileSync(`${out}/result.json`, JSON.stringify({ iterations, lands, spells, attacks, decisions: [...seen], errors, requests, recordError:await page.evaluate(()=>window.__recordError) }, null, 2));
  await browser.close();
  server.close();
}
