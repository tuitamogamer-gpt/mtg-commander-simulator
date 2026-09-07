// Real Chromium/WebKit audio decoding plus paid UI/Stack/local-AI combat paths.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = `${root}output/game-audio/${process.env.BROWSER || 'chromium'}`; mkdirSync(out, { recursive: true });
const browser = await pw[process.env.BROWSER || 'chromium'].launch({ headless: true });
const checks = [], errors = [];
const base = process.env.GAME_URL || 'http://127.0.0.1:65441';
const manifest = JSON.parse(readFileSync(`${root}assets/audio/manifest.json`));
const check = label => { checks.push(label); console.log('PASS ' + label); };
let activePage;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 },
      isMobile: width === 390, hasTouch: width === 390 });
    await context.addInitScript(() => {
      localStorage.setItem('mtgOnboardingComplete', '1'); localStorage.setItem('mtgReducedMotion', '1');
    });
    const page = await context.newPage();
    activePage = page;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400 && response.url().includes('/assets/audio/')) errors.push(response.url()); });
    const click = async locator => width === 390 ? locator.tap() : locator.click();
    await page.goto(base + '/?smokeDeck=Quick%20Draw&seed=9077&smokeScenario=audioFixture');
    await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', null, { timeout: 45000 });
    await click(page.locator('.modal .pbtn.primary'));
    await page.evaluate(() => { _game.speedFactor = 0; });
    for (let n = 0; n < 100; n++) {
      if (await page.evaluate(() => _ui.pending?.q.type === 'main')) break;
      const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|Got it)/ }).filter({ visible: true });
      if (await proceed.count()) await click(proceed.last()); else await page.waitForTimeout(80);
    }
    assert.equal(await page.evaluate(() => _ui.pending?.q.type), 'main');
    await page.waitForFunction(() => MTG.audio.status().state === 'playing');
    await page.evaluate(() => { window.__audioPending = _ui.pending; window.__audioDecisionCount = MTG.activeAccountMatch.decisions.length; });
    await click(page.locator('.menubutton')); await click(page.locator('.audiosettingsopen'));
    const panel = page.locator('.audiopanel');
    assert.equal(await panel.getAttribute('role'), 'dialog');
    assert.equal(await panel.getAttribute('aria-modal'), 'true');
    for (const id of ['astral-library', 'ember-sanctum', 'moonlit-grove']) {
      await click(page.locator(`[data-track="${id}"]`));
      await page.waitForFunction(id => MTG.audio.musicId === id && MTG.audio.state === 'playing', id);
    }
    await page.locator('#audio-music').fill('16'); await page.locator('#audio-effects').fill('35');
    await click(page.locator('.audiopreview')); await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => MTG.audio.history.at(-1)?.id), 'summon');
    await click(page.locator('.audiomute'));
    await page.waitForFunction(() => MTG.audio.preferences.muted, null, { timeout: 5000 });
    assert.equal(await page.locator('.audiopreview').isDisabled(), true);
    await page.waitForTimeout(650);
    assert.equal(await page.evaluate(() => MTG.audio.voices.size), 0);
    await click(page.locator('.audiomute')); await page.waitForTimeout(1600);
    assert.equal(await page.evaluate(() => MTG.audio.musicVoices.size), 1);
    await page.locator('#audio-effects').focus();
    await page.keyboard.press('Home'); assert.equal(await page.evaluate(() => MTG.audio.preferences.effects), 0);
    await page.keyboard.press('ArrowRight'); assert.equal(await page.evaluate(() => MTG.audio.preferences.effects), 1);
    await page.locator('#audio-effects').fill('35');
    assert.equal(await page.evaluate(() => _ui.pending === __audioPending && MTG.activeAccountMatch.decisions.length === __audioDecisionCount), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `${out}/${width}-audio-menu.png` });
    check(`${width}: track switching, independent levels, mute, touch/keyboard and pending decision preservation`);
    if (width === 390) {
      await page.setViewportSize({ width: 320, height: 568 });
      const fit = await page.locator('.audiofooter').boundingBox(); assert.ok(fit.y >= 0 && fit.y + fit.height <= 568);
      await page.screenshot({ path: `${out}/320-audio-menu.png` });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await page.keyboard.press('Escape'); assert.equal(await panel.count(), 0);
    const media = await page.evaluate(async tracks => {
      const result = [];
      for (const track of tracks) {
        const buffer = await MTG.audio.load(track.kind + '/' + track.id), data = buffer.getChannelData(0);
        let peak = 0, energy = 0;
        for (const n of data) { peak = Math.max(peak, Math.abs(n)); energy += n*n; }
        result.push({ id: track.id, duration: buffer.duration, peak, rms: Math.sqrt(energy/data.length),
          seam: Math.abs(data[0] - data[data.length - 1]) });
      }
      // Inspect the real output graph while its source is running.
      const analyser = MTG.audio.context.createAnalyser(); analyser.fftSize = 1024;
      MTG.audio.musicBus.connect(analyser);
      await new Promise(resolve => setTimeout(resolve, 150));
      const wave = new Float32Array(1024); analyser.getFloatTimeDomainData(wave);
      const outputRms = Math.sqrt(wave.reduce((sum, n) => sum+n*n, 0)/wave.length);
      MTG.audio.musicBus.disconnect(analyser);
      return { result, outputRms };
    }, manifest.tracks);
    assert.equal(media.result.length, 7);
    for (const item of media.result) { assert.ok(item.duration > .1 && item.peak > .015 && item.peak < .99, JSON.stringify(item)); }
    assert.ok(media.outputRms > .0001, 'The browser audio graph produces sound');
    writeFileSync(`${out}/${width}-media.json`, JSON.stringify(media, null, 2));
    check(`${width}: all 7 MP3s decode, non-silent output, conservative peaks`);
    // Exercise the production onEvent callback through a normal human land play.
    const land = await page.evaluate(() => _ui.pending.q.lands[0].iid);
    const beforeLand = await page.evaluate(() => MTG.audio.history.length);
    await click(page.locator(`.hand [data-iid="${land}"]`).first());
    await click(page.locator('.sheetacts button').filter({ hasText: /^Play/ }).first());
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(id => _game.byIid(id).zone, land), 'battlefield');
    assert.equal(await page.evaluate(() => MTG.audio.history.length), beforeLand);
    check(`${width}: normal human land action stays silent through the production callback`);

    await page.evaluate(() => {
      const ui = new MTG.UI();
      let game;
      game = MTG.newGame({ seed: 90771, humanDeck: 'Quick Draw', aiDecks: ['Draconic Destruction'],
        difficulty: 'hard', aiStyles: ['balanced'], paced: true,
        humanController: player => { ui.me = player; return ui.controllerFor(player); },
        onEvent: event => {
          MTG.audio.handle(event, game);
          if (event.type === 'gameEffect') ui.showGameEffect(event);
          if (event.type === 'battlefieldArrival') ui.showBattlefieldArrival(event);
          if (event.type === 'effectNotice') ui.showEffectNotice(event.text, event.kind, event);
          ui.queueRender();
        },
      });
      for (const player of game.players) { player.hand.length = 0; player.command.length = 0; }
      const me = ui.me, enemy = game.players[1]; game.battlefield.length = 0;
      const put = (name, player, zone) => {
        const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone; card.sick = zone !== 'battlefield';
        (zone === 'battlefield' ? game.battlefield : player[zone]).push(card); return card;
      };
      const cast = put('Colossal Dreadmaw', me, 'hand');
      const attacker = put('Colossal Dreadmaw', me, 'battlefield');
      const aiCast = put('Colossal Dreadmaw', enemy, 'hand');
      me.pool.G = 6; game.turnPlayer = me; game.turnNo = 7; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
      game.recalc(); ui.game = game; ui.prioMode = 'full'; window._game = game; window._ui = ui;
      MTG.audio.attach(game); MTG.audio.history.length = 0; ui.render();
      const qa = window.__audioGame = { stage: 'cast', done: false, error: null, attacker: attacker.iid, cast: cast.iid, aiCast: aiCast.iid };
      void (async () => {
        const action = await me.controller.decide(game, { type: 'main', player: me, phase: game.phase,
          casts: game.castableList(me), acts: [], lands: [] });
        if (!await game.performAction(me, action)) throw new Error('Paid cast failed');
        qa.paid = cast.castMeta.manaSpent;
        qa.stage = 'combat'; await game.combatPhase(me); qa.combatLife = enemy.life;
        qa.stage = 'ai'; game.turnPlayer = enemy; game.phase = 'main2'; enemy.pool.G = 6;
        await game.mainPhase(enemy);
        qa.aiPaid = aiCast.castMeta?.manaSpent; qa.aiZone = aiCast.zone;
        qa.stage = 'effects'; game.untilEffects.push({ kind: 'preventAllCombat' });
        await game.damageAny(attacker, enemy, 6, { combat: true });
        qa.preventedLife = enemy.life;
        await new Promise(resolve => setTimeout(resolve, 260));
        game.untilEffects = game.untilEffects.filter(effect => effect.kind !== 'preventAllCombat'); await game.damageAny(attacker, enemy, 12);
        await new Promise(resolve => setTimeout(resolve, 260));
        await game.move(aiCast, 'exile');
        await new Promise(resolve => setTimeout(resolve, 260));
        qa.done = true; ui.render();
      })().catch(error => { qa.error = error.stack; });
    });
    let stackSeen = false, reviewSeen = false;
    for (let n = 0; n < 180; n++) {
      const state = await page.evaluate(() => ({ ...__audioGame, pending: _ui.pending?.q.type, stack: _game.stack.length }));
      assert.equal(state.error, null);
      if (state.done) break;
      if (state.stack) stackSeen = true;
      if (state.pending === 'main' && state.stage === 'cast') {
        await click(page.locator(`.hand [data-iid="${state.cast}"]`).first());
        await click(page.locator('.sheetacts button').filter({ hasText: /^Cast/ }).first());
      } else if (state.pending === 'attackers') {
        await click(page.locator('.attackalloclane.player'));
        await click(page.locator(`[data-attacker="${state.attacker}"]`));
        await click(page.getByRole('button', { name: /^Confirm attack/ }));
      } else {
        if (state.pending === 'combatReview') { reviewSeen = true; await page.screenshot({ path: `${out}/${width}-combat-review.png` }); }
        const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/ }).filter({ visible: true });
        if (await proceed.count()) await click(proceed.last());
      }
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(400);
    const final = await page.evaluate(() => ({ ...__audioGame, cues: MTG.audio.history,
      fallback: _game.log.some(row => /AI V2 fallback/.test(row.msg)), audio: MTG.audio.status() }));
    assert.equal(final.done, true); assert.equal(final.paid, 6); assert.equal(final.aiPaid, 6); assert.equal(final.aiZone, 'battlefield');
    assert.equal(final.combatLife, 34); assert.equal(final.preventedLife, 34);
    assert.equal(stackSeen, true); assert.equal(reviewSeen, true); assert.equal(final.fallback, false);
    for (const id of ['summon', 'explosion']) assert.ok(final.cues.some(cue => cue.id === id), id);
    assert.ok(final.cues.every(cue => ['summon', 'explosion'].includes(cue.id)), 'Routine combat, prevention and exile stay silent');
    await page.screenshot({ path: `${out}/${width}-gameplay.png` });
    writeFileSync(`${out}/${width}-gameplay.json`, JSON.stringify(final, null, 2));
    writeFileSync(`${out}/${width}-state.json`, await page.evaluate(() => render_game_to_text()));
    check(`${width}: paid human/local AI, Stack, attack review, actual 6 damage, prevention, explosion and exile`);
    await context.close();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    writeFileSync(`${out}/failure.json`, JSON.stringify(await activePage.evaluate(() => ({ audio: MTG.audio?.status(), preferences: MTG.audio?.preferences, game: window.__audioGame, pending: _ui?.pending?.q.type })), null, 2));
  }
  throw error;
} finally {
  writeFileSync(`${out}/results.json`, JSON.stringify({ checks, errors }, null, 2));
  await browser.close();
}
