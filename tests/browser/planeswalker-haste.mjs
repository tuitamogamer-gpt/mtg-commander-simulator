// Real local UI decisions, paid casts/equip, loyalty Stack and combat damage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {once} from 'node:events';
import express from 'express';
import {createAccountHandler, MemoryAccountStore} from '../../api/account.js';

const {chromium, webkit} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE || 'chromium';
const root = new URL('../../', import.meta.url).pathname;
const out = process.env.PW_QA_OUTPUT || `${root}output/planeswalker-2026-09-06/browser/${engine}`;
fs.mkdirSync(out, {recursive: true});
const server = express().use('/api/account', createAccountHandler({store: new MemoryAccountStore(), limiter: null}))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await ({chromium, webkit})[engine].launch({headless: true});
let page;
const errors = [], results = [];
async function viewport(width) {
  if (page) await page.close();
  page = await browser.newPage({reducedMotion: 'reduce', hasTouch: width === 390,
    isMobile: width === 390, viewport: {width, height: width === 390 ? 844 : 1000}});
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('response', r => {if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
    localStorage.setItem('mtgManaMode', 'auto');
  });
}
const click = locator => page.viewportSize().width === 390 ? locator.tap() : locator.click();

async function state() {
  return page.evaluate(() => window.__pw ? ({done: __pw.done, error: __pw.error, stage: __pw.stage,
    type: _ui.pending?.q.type, selected: _ui.pending?.sel?.length || 0,
    ids: __pw.ids, assignments: (_ui.pending?.q.type === 'attackers' ? _ui.pending.sel : [])
      ?.map(e => ({card: e.card.iid, target: e.target.name})),
    candidates: (_ui.pending?.q.candidates || []).map(c => ({iid: c.iid, name: c.name})),
    stack: _game.stack.map(so => ({name: so.name, targets: (so.targets || []).flat().filter(Boolean).map(c => c.name)})),
    humanLife: __pw.me.life, enemyLife: __pw.enemy.life,
    walker: __pw.walker && {zone: __pw.walker.zone, loyalty: __pw.walker.counters.loyalty},
    atarka: __pw.atarka && {zone: __pw.atarka.zone, sick: __pw.atarka.sick, haste: __pw.atarka.kw('haste'),
      spent: __pw.atarka.castMeta?.manaSpent, attached: __pw.boots.attachedTo},
    log: _game.log.slice(-14).map(r => r.msg), text: JSON.parse(render_game_to_text()),
  }) : ({stage: 'bootstrap', type: window._ui?.pending?.q.type, url: location.href}));
}
async function shot(name) {
  await page.screenshot({path: `${out}/${name}.png`});
  fs.writeFileSync(`${out}/${name}.json`, JSON.stringify(await state(), null, 2));
}
async function install(mode, difficulty = 'hard') {
  await page.goto(`${base}/?smokeDeck=Draconic%20Destruction&seed=73`);
  await page.waitForFunction(() => window._ui?.pending?.q.type === 'mulligan', null, {timeout: 60000});
  await page.evaluate(({mode, difficulty}) => {
    document.querySelectorAll('.toastmsg, .battlefieldarrival').forEach(node => node.remove());
    const hover = document.getElementById('hoverprev'); if (hover) hover.style.display = 'none';
    const oldRoot = document.querySelector('#game');
    oldRoot.replaceWith(oldRoot.cloneNode(false));
    const ui = new MTG.UI();
    const g = new MTG.Game({seed: 73, paced: true, onEvent: () => ui.queueRender()});
    const quiet = {async decide(game, q) {
      if (q.type === 'priority') return {kind: 'pass'};
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
      return [];
    }};
    const me = g.addPlayer('You', MTG.DECKS['Draconic Destruction'], null, false);
    const enemy = g.addPlayer('AI Ajani', MTG.DECKS['Token Triumph'], quiet, true);
    ui.me = me; ui.game = g; me.controller = ui.controllerFor(me);
    g.turnPlayer = me; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
    window._ui = ui; window._game = g;
    const put = (name, owner, zone = 'battlefield') => {
      const c = new MTG.CardInst(MTG.DEFS[name], owner); c.zone = zone; c.ctrl = owner; c.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(c);
      if (c.def.loyalty) c.counters.loyalty = Number(c.def.loyalty);
      return c;
    };
    const qa = window.__pw = {done: false, error: null, stage: mode, me, enemy, ids: {}};
    if (mode === 'haste') {
      qa.atarka = put('Atarka, World Render', me, 'hand');
      qa.boots = put('Swiftfoot Boots', me);
      for (let n = 0; n < 8; n++) put(n === 0 ? 'Mountain' : 'Forest', me);
      qa.ids.atarka = qa.atarka.iid; qa.ids.boots = qa.boots.iid;
    } else {
      qa.walker = put('Ajani, Caller of the Pride', enemy); qa.ids.walker = qa.walker.iid;
      if (mode === 'ai') {
        enemy.controller = new MTG.AIController(enemy, {difficulty});
        g.turnPlayer = enemy;
        qa.own = put('Soul Warden', enemy); qa.foe = put('Serra Angel', me);
      } else if (mode === 'damage') {
        qa.walker.counters.loyalty = 1;
        qa.damageSpell = put('Lava Dart', me, 'hand'); put('Mountain', me);
      } else {
        qa.walker.counters.loyalty = 1;
        qa.attacker = put('Soul Warden', me); qa.ids.attacker = qa.attacker.iid;
        if (mode.includes('split')) {qa.second = put('Llanowar Elves', me); qa.ids.second = qa.second.iid;}
      }
    }
    g.recalc(); ui.render();
    void (async () => {
      if (mode === 'ai') {
        const entry = g.activatableList(enemy).find(e => e.card === qa.walker && e.ability.loyalty === -3);
        qa.ok = await g.activateAbility(enemy, entry);
        if (!qa.own.kw('flying') || !qa.own.kw('double strike') || qa.foe.kw('double strike')) throw new Error('Ajani buffed the wrong creature');
      } else if (mode === 'damage') {
        qa.stage = 'damage';
        const answer = await me.controller.decide(g, {type: 'main', player: me, phase: g.phase,
          casts: g.castableList(me), acts: [], lands: []});
        if (!await g.performAction(me, answer)) throw new Error('Lava Dart failed');
        if (qa.damageSpell.castMeta?.manaSpent !== 1) throw new Error('Lava Dart was not paid for');
      } else {
        if (mode === 'haste') {
          for (const stage of ['cast', 'equip']) {
            qa.stage = stage;
            const answer = await me.controller.decide(g, {type: 'main', player: me, phase: g.phase,
              casts: stage === 'cast' ? g.castableList(me) : [],
              acts: stage === 'equip' ? g.activatableList(me).filter(e => e.equip && e.card === qa.boots) : [], lands: []});
            if (!await g.performAction(me, answer)) throw new Error(`${stage} failed`);
          }
          if (!qa.atarka.sick || !qa.atarka.kw('haste') || qa.boots.attachedTo !== qa.atarka.iid) throw new Error('Equip did not grant haste');
        }
        qa.stage = 'attack'; await g.combatPhase(me);
      }
      ui.render(); qa.done = true;
    })().catch(e => {qa.error = e.stack;});
  }, {mode, difficulty});
}

async function drive(mode, label) {
  let assigned = false, review = false;
  for (let n = 0; n < 150; n++) {
    const s = await state(); assert.equal(s.error, null);
    if (s.done) return s;
    if (s.type === 'main') {
      if (s.stage === 'cast' || s.stage === 'damage') {
        await click(page.locator(`.hand [data-cname="${s.stage === 'damage' ? 'Lava Dart' : 'Atarka, World Render'}"]`).first());
        await click(page.locator('.sheetacts button').filter({hasText: /^Cast/}).first());
      } else {
        await click(page.locator(`.mini[data-iid="${s.ids.boots}"]`).filter({visible: true}).first());
        await click(page.locator('.sheetacts button').filter({hasText: /Equip/}).first());
      }
    } else if (s.type === 'chooseTargets') {
      if (!s.selected) await click(page.locator(`.mini[data-iid="${mode === 'damage' ? s.ids.walker : s.ids.atarka}"]`).filter({visible: true}).first());
      if (mode === 'damage') await shot(`${label}-targeted`);
      await click(page.getByRole('button', {name: /Lock.*1 target/}));
    } else if (s.type === 'attackers') {
      assert.equal(assigned, false, 'attack confirmation did not settle');
      if (mode === 'haste') {
        assert.equal(s.atarka.spent, 7); assert.equal(s.atarka.haste, true);
        assert.match(await page.locator(`[data-attacker="${s.ids.atarka}"]`).innerText(), /haste/i);
        await shot(`${label}-equipped-ready`);
        await click(page.locator('.attackalloclane.player'));
        await click(page.locator(`[data-attacker="${s.ids.atarka}"]`));
      } else if (mode === 'defender-first' || mode === 'split') {
        await click(page.locator(`[data-target="planeswalker-${s.ids.walker}"]`));
        await click(page.locator(`[data-attacker="${s.ids.attacker}"]`));
        if (mode === 'split') {
          await click(page.locator('.attackalloclane.player'));
          await click(page.locator(`[data-attacker="${s.ids.second}"]`));
        }
      } else {
        if (mode === 'board-first') {
          await click(page.locator('[data-testid="show-combat-battlefield"]'));
          const card = page.locator(`.mini[data-iid="${s.ids.attacker}"]`).filter({visible: true}).first();
          await click(card);
          assert.match(await card.innerText(), /Choose defender/);
          assert.equal(await page.locator('[data-testid="confirm-combat-battlefield"]').isDisabled(), true);
          await click(page.locator('[data-testid="back-to-combat-overlay"]'));
        } else await click(page.locator(`[data-attacker="${s.ids.attacker}"]`));
        assert.equal(await page.getByRole('button', {name: /^Confirm attack/}).isDisabled(), true);
        await click(page.locator(`[data-target="planeswalker-${s.ids.walker}"]`));
        if (mode === 'attacker-split') {
          await click(page.locator(`[data-attacker="${s.ids.second}"]`));
          assert.equal(await page.getByRole('button', {name: /^Confirm attack/}).isDisabled(), true);
          await click(page.locator('.attackalloclane.player'));
        }
      }
      const ready = await state();
      if (mode !== 'haste') assert.equal(ready.assignments.find(e => e.card === s.ids.attacker)?.target,
        'Ajani, Caller of the Pride', 'clicking the walker must actually assign the selected attacker');
      await shot(`${label}-assigned`);
      await click(page.getByRole('button', {name: /^Confirm attack/})); assigned = true;
    } else {
      if (s.type === 'combatReview' && !review) {
        assert.match(await page.locator('.combatreviewhead').innerText(), /You attack with/);
        assert.match(await page.locator('.combatreviewhead').innerText(), /YOU ARE ATTACKING/);
        if (mode !== 'haste') assert.ok(await page.locator('.combatreviewtarget').filter({hasText: 'Ajani, Caller of the Pride'}).count());
        await shot(`${label}-review`); review = true;
      }
      const proceed = page.getByRole('button', {name: /^(Proceed|Pass|Resolve|Continue|Got it|Confirm order)/}).filter({visible: true});
      if (await proceed.count()) await click(proceed.last());
    }
    await page.waitForTimeout(25);
  }
  throw new Error(`${label} stalled: ${JSON.stringify(await state())}`);
}

try {
  for (const width of [1440, 390]) {
    await viewport(width);
    for (const mode of (process.env.PW_QA_MODES || 'attacker-first,defender-first,split,attacker-split,board-first,haste,ai,damage').split(',')) {
      const difficulties = mode === 'ai' ? ['easy', 'normal', 'hard'] : ['hard'];
      for (const difficulty of difficulties) {
        const label = `${width}-${mode}-${difficulty}`;
        await install(mode, difficulty);
        const final = await drive(mode, label);
        if (mode === 'haste') assert.equal(final.enemyLife, 28, 'new Atarka attacks with haste and deals both strike steps');
        else if (mode !== 'ai') {assert.equal(final.walker.zone, 'graveyard'); assert.equal(final.enemyLife, mode.includes('split') ? 39 : 40);}
        assert.equal(final.humanLife, 40);
        await shot(`${label}-resolved`);
        results.push({label, ...final}); console.log(`PASS ${label}`);
      }
    }
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error);
  try {await shot('failure');} catch (captureError) {console.error('Failure capture:', captureError);}
  throw error;
} finally {
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({results, errors}, null, 2));
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
