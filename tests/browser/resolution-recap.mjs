// Actual casts, local AI choices, resolution checkpoints and responsive UI.
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const args = process.argv.slice(2);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = value('--output', `${root}output/resolution-recap/browser`);
const scenarios = value('--scenarios', 'chaos-land,chaos-creature,chaos-miss,fetch,fetch-land,private-tutor,wipe,army,combat,lethal').split(',');
mkdirSync(out, {recursive: true});
const server = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = value('--url', `http://127.0.0.1:${server.address().port}`);
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
});
const check = message => {checks.push(message); console.log(`PASS ${message}`);};
async function install(scenario) {
  await page.evaluate(scenario => {
    document.querySelectorAll('.toastmsg,.battlefieldarrival,.turnbanner,.gamefxlayer').forEach(node => node.remove());
    const root = document.querySelector('#game'); root.replaceWith(root.cloneNode(false));
    const ui = new MTG.UI();
    const g = new MTG.Game({seed: 14, paced: true, onEvent: () => ui.queueRender()});
    const human = g.addPlayer('You', {name: 'Human'}, null, false);
    const enemy = g.addPlayer('AI Opponent', {name: 'Opponent'}, null, true);
    ui.me = human; ui.game = g; human.controller = ui.controllerFor(human);
    enemy.controller = new MTG.AIController(enemy, {difficulty: 'normal'});
    g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
    ui.prioMode = 'off'; ui.acceptAllReveals = g.turnNo;
    window._ui = ui; window._game = g;
    const put = (name, owner, zone = 'battlefield') => {
      if (!MTG.DEFS[name]) throw Error('Missing card: ' + name);
      const card = new MTG.CardInst(MTG.DEFS[name], owner);
      card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(card);
      return card;
    };
    const audit = window.__recapAudit = {scenario, done: false, error: null};
    let actor = enemy, spell, ability;
    if (scenario.startsWith('chaos')) {
      actor = enemy;
      const owner = actor === human ? enemy : human;
      audit.target = put('Sol Ring', owner);
      audit.revealed = put(scenario === 'chaos-land' ? 'Island' : scenario === 'chaos-creature' ? 'Llanowar Elves' : 'Arcane Denial', owner, 'library');
      spell = put('Chaos Warp', actor, 'hand'); actor.pool.R = 3;
      g.rnd = () => 0;
    } else if (scenario === 'fetch') {
      put('Forest', enemy, 'library'); put('Island', enemy, 'library');
      spell = put('Cultivate', enemy, 'hand'); enemy.pool.G = 3;
    } else if (scenario === 'fetch-land') {
      const fetch = put('Evolving Wilds', enemy);
      put('Forest', enemy, 'library');
      g.recalc();
      ability = g.activatableList(enemy).find(entry => entry.card === fetch && !entry.manaAbility);
    } else if (scenario === 'private-tutor') {
      put('Sol Ring', enemy, 'library');
      spell = put('Demonic Tutor', enemy, 'hand'); enemy.pool.B = 2;
    } else if (scenario === 'wipe') {
      put('Llanowar Elves', human); put('Solemn Simulacrum', human); put('Birds of Paradise', enemy);
      put('Darksteel Myr', enemy); put('Island', human, 'library');
      spell = put('Blasphemous Act', enemy, 'hand'); enemy.pool.R = 9;
    } else if (scenario === 'routine') {
      spell = put('Grizzly Bears', enemy, 'hand'); enemy.pool.G = 2;
    } else if (scenario === 'army' || scenario === 'small-tokens' || scenario === 'small-drain') {
      const source = put('Sol Ring', enemy);
      g.stack.push({kind: 'ability', name: 'Test effect', ctrl: enemy, srcCard: source, targets: [],
        ctx: {g, you: enemy, src: source}, run: () => scenario === 'small-drain' ? g.loseLifeOpponents(source, enemy, 2) :
          g.makeTokens({name: 'Soldier', types: ['Creature'], super: [], subtypes: ['Soldier'],
            power: 1, toughness: 1, cost: '', oracle: ''}, enemy, {n: scenario === 'army' ? 12 : 2})});
    } else {
      const attacker = put('Colossal Dreadmaw', enemy); attacker.counters['+1/+1'] = 4;
      attacker.attacking = human; attacker.blockedBy = []; attacker.wasBlocked = false;
      g.combat = {attackers: [attacker]};
      if (scenario === 'lethal') human.life = 10;
    }
    g.turnPlayer = actor; g.recalc(); ui.render();
    audit.spell = spell;
    const work = ability ? g.activateAbility(actor, ability) : spell ? g.castSpell(actor, spell, {from: 'hand'}) :
      g.stack.length ? g.resolveTop() : g.combatDamage(actor, 'normal');
    void work.then(result => {audit.result = result; audit.done = true; ui.render();}).catch(error => {audit.error = error.stack; ui.render();});
  }, scenario);
}
async function toRecap() {
  for (let i = 0; i < 65; i++) {
    const status = await page.evaluate(() => ({type: _ui.pending?.q.type, recap: !!_ui.pending?.q.recap, error: __recapAudit.error, done: __recapAudit.done}));
    assert.equal(status.error, null);
    if (status.recap) return;
    assert.equal(status.done, false, 'the action must pause for a recap');
    if (status.type === 'chooseTargets') {
      const target = await page.evaluate(() => _ui.pending.q.candidates[0].iid);
      await page.locator(`.mini[data-iid="${target}"]`).first().click();
      const confirm = page.locator('.promptbar .pbtn.primary:visible:not(:disabled)');
      if (await confirm.count()) await confirm.last().click();
    } else {
      const proceed = page.getByRole('button', {name: /^(Proceed|Pass|Continue|Let it|Let resolve|Got it)/}).filter({visible: true});
      if (await proceed.count()) await proceed.last().click();
    }
    await page.waitForTimeout(80);
  }
  throw Error('No recap appeared: ' + JSON.stringify(await page.evaluate(() => ({pending: _ui.pending?.q.type, error: __recapAudit.error}))));
}
async function responsive(label) {
  for (const [width, height] of [[1440, 900], [1280, 620], [390, 844], [320, 568], [844, 390]]) {
    await page.setViewportSize({width, height});
    const modal = page.locator('[data-testid="resolution-recap"]');
    await modal.waitFor();
    // Resizing rebuilds the Arena; wait for its current footer, rather than
    // measuring a node in the middle of that responsive replacement.
    await page.waitForFunction(() => {
      const button = document.querySelector('.resolutionrecapproceed');
      const box = button?.getBoundingClientRect();
      return box && box.height > 0 && box.y >= 0 && box.bottom <= innerHeight + 1 && box.x >= 0 && box.right <= innerWidth + 1;
    }, null, {timeout: 5000}).catch(async error => {
      await page.screenshot({path: `${out}/${label}-${width}x${height}-failed.png`});
      throw error;
    });
    const button = modal.locator('.resolutionrecapproceed');
    const box = await button.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= height + 1 && box.x >= 0 && box.x + box.width <= width + 1, `reachable Proceed ${label} ${width}x${height}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(await page.evaluate(() => __recapAudit.done), false);
    await page.screenshot({path: `${out}/${label}-${width}x${height}.png`});
  }
  await page.setViewportSize({width: 1440, height: 900});
}
try {
  await page.goto(`${base}/?smokeDeck=Quick%20Draw&seed=14`);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', null, {timeout: 120000});
  for (const scenario of scenarios) {
    await install(scenario); await toRecap();
    const recap = page.locator('[data-testid="resolution-recap"]');
    const text = await recap.innerText();
    const major = ['wipe', 'army', 'combat', 'lethal'].includes(scenario);
    assert.equal(await recap.getAttribute('data-impact'), major ? 'major' : 'minor');
    if (major) {
      assert.match(text, /TABLE HIGHLIGHT.*RESOLVED/s);
      assert.equal(await recap.locator('.resolutionrecapstats').isVisible(), true);
    } else {
      assert.match(text, /Caught up\? Keep playing/);
      assert.equal(await recap.locator('.resolutionrecapdetails').getAttribute('open'), null);
      const appearance = await recap.evaluate(node => ({width: node.getBoundingClientRect().width,
        backdrop: getComputedStyle(node.parentElement).backdropFilter,
        background: getComputedStyle(node.parentElement).backgroundColor}));
      assert.ok(appearance.width <= 420, 'minor event takes only a corner of the desktop table');
      assert.equal(appearance.backdrop, 'none');
      assert.equal(appearance.background, 'rgba(0, 0, 0, 0)');
    }
    if (scenario.startsWith('chaos')) {
      const state = await page.evaluate(() => ({zone: __recapAudit.revealed.zone, exile: _game.players.reduce((n, p) => n + p.exile.length, 0), spell: __recapAudit.spell.zone}));
      assert.equal(state.zone, scenario === 'chaos-miss' ? 'library' : 'battlefield');
      assert.equal(state.exile, 0); assert.equal(state.spell, 'graveyard');
      assert.match(text, /revealed (Island|Llanowar Elves|Arcane Denial)/);
      if (scenario === 'chaos-miss') assert.match(text, /stays on top.*not exiled/);
    }
    if (scenario === 'fetch') {assert.match(text, /Forest|Island/); assert.match(text, /→ hand/); assert.match(text, /→ battlefield, tapped/);}
    if (scenario === 'fetch-land') {assert.match(text, /Evolving Wilds/); assert.match(text, /Forest → battlefield, tapped/);}
    if (scenario === 'private-tutor') {assert.match(text, /not revealed.*→ hand/); assert.doesNotMatch(text, /Sol Ring/);}
    if (scenario === 'wipe') {
      assert.match(text, /BOARD WIPE|Board wipe/);
      assert.match(await recap.locator('.resolutionrecapstats').innerText(), /3\s*permanents removed/i);
      assert.match(text, /2 permanents → graveyard/); assert.match(text, /Darksteel Myr/); assert.match(text, /still on the way/);
      assert.ok(await page.evaluate(() => _game.stack.length > 0));
    }
    assert.equal(await recap.locator('.resolutionrecapdetails').getAttribute('open'), null, 'all breakdowns start folded');
    assert.ok(await recap.locator('.resolutionrecapbody > .resolutionrecapsection .resolutionrecaprow').count() <= 3);
    if (scenario === 'army') assert.match(text, /Army assembled[\s\S]*12 permanents entered/i);
    if (scenario === 'combat') assert.match(text, /40 → 30 life/);
    if (scenario === 'lethal') {assert.match(text, /eliminated/); assert.match(text, /match has ended/); assert.equal(await page.locator('.matchrecap').count(), 0);}
    if (['chaos-land', 'fetch', 'fetch-land', 'wipe', 'army'].includes(scenario)) await responsive(scenario);
    if (scenario === 'fetch') {
      await recap.locator('summary').click();
      await page.waitForFunction(() => _ui.pending.recapDetailsOpen === true);
      await page.evaluate(() => _ui.render());
      assert.equal(await recap.locator('.resolutionrecapdetails').getAttribute('open'), '', 'details stay expanded across game renders');
      assert.match(await recap.innerText(), /The stack is empty/);
      await page.setViewportSize({width: 320, height: 568});
      const footer = await recap.locator('.resolutionrecapproceed').boundingBox();
      assert.ok(footer && footer.y + footer.height <= 568, 'expanded details keep Proceed reachable on a small phone');
      await page.screenshot({path: `${out}/fetch-details-320x568.png`});
      await page.setViewportSize({width: 1440, height: 900});
    }
    const before = await page.evaluate(() => ({turn: _game.turnNo, life: _game.players.map(p => p.life), stack: _game.stack.length}));
    await page.waitForTimeout(700);
    assert.deepEqual(await page.evaluate(() => ({turn: _game.turnNo, life: _game.players.map(p => p.life), stack: _game.stack.length})), before);
    await page.keyboard.press('Escape');
    assert.equal(await recap.isVisible(), true, 'Escape must not acknowledge a recap');
    await recap.locator('.resolutionrecapproceed').click();
    await recap.waitFor({state: 'detached'});
    if (scenario === 'lethal') await page.locator('.matchrecap').waitFor();
    check(`${scenario}: paid/actual effect, accurate outcome and explicit Proceed checkpoint`);
  }
  for (const scenario of ['routine', 'small-tokens', 'small-drain']) {
    await install(scenario);
    for (let attempt = 0; attempt < 65; attempt++) {
      const status = await page.evaluate(() => ({done: __recapAudit.done, error: __recapAudit.error, type: _ui.pending?.q.type}));
      assert.equal(status.error, null);
      assert.notEqual(status.type, 'effectReview', 'routine effects never ask for an extra acknowledgment');
      if (status.done) break;
      const proceed = page.getByRole('button', {name: /^(Proceed|Pass|Continue|Let it|Let resolve|Got it)/}).filter({visible: true});
      if (await proceed.count()) await proceed.last().click();
      await page.waitForTimeout(80);
    }
    assert.equal(await page.evaluate(() => __recapAudit.done), true);
    assert.equal(await page.locator('[data-testid="resolution-recap"]').count(), 0);
    check(`${scenario}: no extra result interruption`);
  }
  // Reduced-motion preference must suppress the major entrance. Normal motion
  // has a short spotlight, with no delay on the review's controls.
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.evaluate(() => localStorage.setItem('mtgReducedMotion', '0'));
  await install('wipe'); await toRecap();
  const animated = page.locator('[data-testid="resolution-recap"]');
  assert.equal(await animated.evaluate(node => getComputedStyle(node).animationName), 'recapSpotlight');
  await page.evaluate(() => document.body.classList.add('reduced-motion'));
  assert.equal(await animated.evaluate(node => getComputedStyle(node).animationName), 'none');
  await page.evaluate(() => document.body.classList.remove('reduced-motion'));
  await page.emulateMedia({reducedMotion: 'reduce'});
  assert.equal(await animated.evaluate(node => getComputedStyle(node).animationName), 'none');
  await animated.locator('.resolutionrecapproceed').click();
  check('major entrance respects both app and system reduced-motion preferences');
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/results.json`, JSON.stringify({url: base, checks, errors}, null, 2));
} finally {
  await browser.close(); server.close();
}
