// A bounded mobile audit of native engine questions, real clicks, paid costs
// and resolution. The fixtures set starting positions; no rules or decisions
// are replaced with scripted answers.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/extended-engine-audit-2026-10-10/browser`;
mkdirSync(output, { recursive: true });
const runId = `${Date.now()}-${(process.env.AUDIT_FLOW || process.env.AUDIT_SCENARIO || 'complete').replace(/[^a-z0-9_-]+/gi,'_')}`;
function writeReport() {
  const report=JSON.stringify({viewport:{width:390,height:844},results,browserErrors:errors,fullMatches:0},null,2)+'\n';
  writeFileSync(`${output}/result.json`,report);writeFileSync(`${output}/run-${runId}.json`,report);
}
const server = express().use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }))
  .use(express.static(root)).listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [], results = [], accountRequests = [];
page.on('request', request => {
  if (!request.url().includes('/api/account')) return;
  const body = request.postDataJSON();
  accountRequests.push({event:'request',action:body?.action || new URL(request.url()).searchParams.get('action'),at:Date.now()});
});
page.on('response', response => {
  if (!response.url().includes('/api/account')) return;
  const body=response.request().postDataJSON();
  accountRequests.push({event:'response',action:body?.action || new URL(response.url()).searchParams.get('action'),status:response.status(),at:Date.now()});
});
page.on('requestfailed', request => {if(request.url().includes('/api/account'))accountRequests.push({event:'failed',error:request.failure(),at:Date.now()});});
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.addInitScript(() => {
  localStorage.setItem('mtgOnboardingComplete', '1');
  localStorage.setItem('mtgReducedMotion', '1');
  localStorage.setItem('mtgManaMode', 'auto');
  localStorage.setItem('mtgStopProfile', 'end');
});

const scenarios = [
  { label: 'hold-own-spell-respond-off-mobile', source:'Think Twice',zone:'hand',route:'main',humanSeat:2,targetSeat:0,lands:['Island','Island','Island'],action:/^Cast/,hold:true,response:'Reach Through Mists' },
  { label: 'own-paid-disguise-stack-targetflow-mobile', source: 'Swords to Plowshares', zone: 'hand', route: 'faceDownTarget', humanSeat: 1, targetSeat: 3, targetName:'Boltbender', targetZone:'hand', targetOwned:true, lands:['Plains'], action:/^Cast/ },
  { label: 'enemy-paid-disguise-hidden-stack-targetflow-mobile', source: 'Swords to Plowshares', zone: 'hand', route: 'faceDownTarget', humanSeat: 3, targetSeat: 1, targetName:'Boltbender', targetZone:'hand', lands:['Plains','Forest','Forest'], action:/^Cast/,ward:'yes' },
  { label: 'territory-floating-elf-rejects-morph-mobile', source: 'Birchlore Rangers', zone: 'hand', route: 'tribalMana', humanSeat: 3, targetSeat: 1, lands: ['Wastes','Wastes'], action: /^Cast(?!.*face.down)/i },
  { label: 'territory-nexus-floating-elf-funds-morph-mobile', source: 'Birchlore Rangers', zone: 'hand', route: 'tribalManaNexus', humanSeat: 1, targetSeat: 3, lands: ['Wastes','Wastes'], action: /face.down|Morph/i },
  { label: 'boltbender-one-retarget-mobile', source: 'Boltbender', zone: 'hand', route: 'boltbenderCount', humanSeat: 2, targetSeat: 0, lands: ['Forest'], action: /Turn face up/ },
  { label: 'boltbender-retain-ward-mobile', source: 'Boltbender', zone: 'hand', route: 'boltbenderWard', humanSeat: 1, targetSeat: 3, lands: ['Forest','Forest','Forest'], action: /Turn face up/ },

  { label: 'monarch-end-step-stifle-mobile', source: 'Stifle', zone: 'hand', route: 'monarchEnd', humanSeat: 2, targetSeat: 0, lands: ['Island'], action: /^Cast/ },
  { label: 'monarch-combat-crown-stifle-mobile', source: 'Stifle', zone: 'hand', route: 'monarchCombat', humanSeat: 1, targetSeat: 3, lands: ['Island'], action: /^Cast/,crownHold:true },
  { label: 'initiative-two-damagers-one-stifle-mobile', source:'Stifle',zone:'hand',route:'initiativeCombat',humanSeat:1,targetSeat:3,lands:['Island'],action:/^Cast/,noBlocks:true,crownHold:true },
  { label: 'masako-tapped-bears-block-mobile', source: 'Grizzly Bears', zone: 'battlefield', route: 'botCombat', humanSeat: 1, targetSeat: 3, lands: [], botAttacker: 'Colossal Dreadmaw', masako: true },
  { label: 'kaalia-native-angel-enters-same-combat-mobile', source:'Kaalia of the Vast',zone:'battlefield',route:'combat',humanSeat:2,targetSeat:0,lands:[],attackCheat:'Serra Angel' },

  { label: 'ward-discard-paid-seat-1', source: 'Swords to Plowshares', zone: 'hand', route: 'priority', humanSeat: 1, targetSeat: 3, lands: ['Plains'], action: /^Cast/, targetName: 'Graveyard Trespasser // Graveyard Glutton', ward: 'yes', discard: 'Forest' },
  { label: 'ward-discard-declined-seat-3', source: 'Swords to Plowshares', zone: 'hand', route: 'priority', humanSeat: 3, targetSeat: 0, lands: ['Plains'], action: /^Cast/, targetName: 'Graveyard Trespasser // Graveyard Glutton', ward: 'no', discard: 'Forest' },
  { label: 'ward-life-paid-seat-2', source: 'Swords to Plowshares', zone: 'hand', route: 'priority', humanSeat: 2, targetSeat: 0, lands: ['Plains'], action: /^Cast/, targetName: 'Sedgemoor Witch', ward: 'yes' },
  { label: 'ward-sacrifice-legendary', source: 'Swords to Plowshares', zone: 'hand', route: 'priority', humanSeat: 3, targetSeat: 1, lands: ['Plains'], action: /^Cast/, targetName: 'Sauron, the Dark Lord', ward: 'yes', sacrificeName: 'Isamaru, Hound of Konda' },
  { label: 'human-seat-1-attack-native-bot-block', source: 'Serra Angel', zone: 'battlefield', route: 'combat', humanSeat: 1, targetSeat: 3, lands: [], targetName: 'Wind Drake', targetLife:4 },
  { label: 'human-seat-3-split-attack', source: 'Grizzly Bears', zone: 'battlefield', route: 'combat', humanSeat: 3, targetSeat: 0, lands: [], splitAttack: 'Wind Drake' },
  { label: 'bot-seat-3-attack-human-seat-1-after-elimination', source: 'Wind Drake', zone: 'battlefield', route: 'botCombat', humanSeat: 1, targetSeat: 3, lands: [], botAttacker: 'Serra Angel' },

  { label: 'ward-mana-paid-seat-2', source: 'Swords to Plowshares', zone: 'hand', route: 'priority', humanSeat: 2, targetSeat: 0, lands: ['Plains','Forest','Forest'], action: /^Cast/, targetName: 'Tolarian Terror', ward: 'yes' },
  { label: 'ward-mana-declined-seat-3', source: 'Swords to Plowshares', zone: 'hand', route: 'priority', humanSeat: 3, targetSeat: 1, lands: ['Plains','Forest','Forest'], action: /^Cast/, targetName: 'Tolarian Terror', ward: 'no' },
  { label: 'channel-otawara-seat-1', source: 'Otawara, Soaring City', zone: 'hand', route: 'priority', humanSeat: 1, targetSeat: 3, lands: ['Island','Forest','Forest','Forest'], action: /Channel/, targetName: 'Grizzly Bears' },
  { label: 'graveyard-skeleton-main', source: 'Reassembling Skeleton', zone: 'graveyard', route: 'main', lands: ['Swamp','Forest'], action: /Return tapped/ },
  { label: 'command-zone-derevi-seat-2', source: 'Derevi, Empyrial Tactician', zone: 'command', route: 'priority', humanSeat: 2, lands: ['Island','Plains','Forest','Forest'], action: /Put Derevi/ },
  { label: 'opponent-exile-seat-3', source: 'Pull from Eternity', zone: 'hand', route: 'priority', humanSeat: 3, targetSeat: 1, targetName: 'Grizzly Bears', targetZone: 'exile', lands: ['Plains'], action: /^Cast/ },
  { label: 'flashback-fifth-graveyard', source: 'Think Twice', zone: 'graveyard', route: 'main', lands: ['Island','Forest','Forest'], action: /Alternative cost/ },
  { label: 'abort-cast-no-payment', source: 'Swords to Plowshares', zone: 'hand', route: 'priority', targetName: 'Grizzly Bears', lands: ['Plains'], action: /^Cast/, abort: true },
  { label: 'modal-discard-cost', source: 'Lightning Axe', zone: 'hand', route: 'priority', targetName: 'Grizzly Bears', lands: ['Mountain'], action: /^Cast/, discard: 'Forest' },
  { label: 'split-aftermath-graveyard', source: 'Consign // Oblivion', zone: 'graveyard', route: 'main', humanSeat: 1, targetSeat: 3, lands: ['Swamp','Swamp','Forest','Forest','Forest'], action: /Aftermath|Oblivion|Alternative cost/ },
];

async function state() {
  return page.evaluate(() => {
    const a = __gap, ui = _ui, g = _game, q = ui.pending?.q || ui.react?.q;
    const card = c => c && ({ iid: c.iid, name: c.name, zone: c.zone, tapped: c.tapped, faceDown: c.faceDown,
      power: c.power, toughness: c.toughness, counters: { ...c.counters }, meta: { monstrous: c.meta.monstrous, adventureExiled: c.meta.adventureExiled },
      colors: [...c.colors], subtypes: [...(c.cur?.subtypes || c.def.subtypes || [])], manaValue: c.mv,
      land: c.is('Land'), creature: c.is('Creature'), elf: c.hasSub('Elf'), manaSpent: c.castMeta?.manaSpent, adventureCast: c.castMeta?.alt?.adventure });
    return { done: a.done, error: a.error, source: card(a.source), target: card(a.target), sacrifice: card(a.sacrifice), opponentSpell: card(a.opponentSpell), attackCheat:card(a.attackCheat),
      hit: card(a.hit), control: card(a.control), response:card(a.response),holdNext:ui.holdNext,priorityMode:ui.prioMode, attackers: a.attackers?.map(card), botAnswers: a.botAnswers, attacker: card(a.attacker), initiative:g.initiative?.idx,damagers:a.damagers?.map(card), monarch: g.monarch?.idx, maker: card(a.maker), libraryCounts:g.players.map(p=>p.library.length), alliance:card(a.alliance), originalTarget:card(a.originalTarget), newTarget:card(a.newTarget), paymentLands:a.paymentLands?.map(card), targets:g.stack.map(so=>({name:so.name,kind:so.kind,targets:(so.targets||[]).flat().map(x=>({iid:x?.iid,name:x?.name}))})), question: q?.type, pending: ui.pending?.q.type, reaction: !!ui.react, prompt: q?.prompt, hint: q?.aiHint?.kind,
      min: q?.min, max: q?.max, targetStep: q?.targetStep, selected: ui.pending?.sel.length || 0,
      choices: q?.from?.map(card), options: q?.options?.map(o => ({ key: o.key, label: o.label })),
      candidates: q?.candidates?.map(c => ({ iid: c.iid, name: c.name, kind: c.kind, zone: c.zone, idx: c.idx, player: c instanceof MTG.Player, mine: c === a.human || c.ctrl === a.human })),
      activations: a.activations, casts: a.casts, questions: a.questions, lands: a.lands.map(card), territory:card(a.territory), support:card(a.support), pool:{...a.human.pool},
      hand: a.human.hand.map(c => c.name), graveyard: a.human.graveyard.map(c => c.name), libraryCount: a.human.library.length, life: g.players.map(p => p.life), stack: g.stack.map(s => s.name),
      fallback: !!g._decisionFallbacks || (g.aiDecisionLog || []).some(row => row.fallback),
      phase: g.phase, step: g.step, ownTurn: g.turnPlayer === a.human, botSeat: a.bot.idx, humanSeat: a.human.idx, enemyHand: a.bot.hand.map(card),
    };
  });
}

async function fixture(scenario) {
  await page.evaluate(scenario => {
    const old = document.querySelector('#game'); old.replaceWith(old.cloneNode(false));
    document.querySelector('#setup').style.display = 'none'; document.querySelector('#game').style.display = 'flex';
    document.body.classList.add('game-active');
    const ui = new MTG.UI(), g = new MTG.Game({ seed: 102709, paced: true, onEvent: () => ui.queueRender() });
    const players = Array.from({length: 4}, (_, idx) => g.addPlayer(idx === (scenario.humanSeat || 0) ? 'You' : `Native AI ${idx}`, { name: 'Quick Draw' }, null, idx !== (scenario.humanSeat || 0)));
    const human = players[scenario.humanSeat || 0], bot = players[scenario.targetSeat ?? ((human.idx + 1) % 4)];
    ui.game = g; ui.me = human; ui.prioMode = 'end'; human.controller = ui.controllerFor(human);
    for (const player of players.filter(p => p !== human)) player.controller = new MTG.AIController(player, { difficulty: 'normal', style: 'aggressive' });
    g.turnPlayer = human; g.turnNo = 9; g.phase = scenario.route === 'main' ? 'main1' : 'combat';
    g.step = scenario.route === 'main' ? 'main' : 'blockers'; g.speedFactor = 0;
    g.combat = { attackers: [], defenders: new Map(), blockersDeclared: true, hadAttackers: false };
    window._game = g; window._ui = ui;
    const put = (name, owner = human, zone = 'battlefield') => {
      if (!MTG.DEFS[name]) throw new Error(`Missing native definition: ${name}`);
      const c = new MTG.CardInst(MTG.DEFS[name], owner); c.zone = zone; c.ctrl = owner; c.sick = false;
      (zone === 'battlefield' ? g.battlefield : owner[zone]).push(c); return c;
    };
    for (const player of players) for (let n = 0; n < 20; n++) put('Forest', player, 'library');
    if (scenario.label === 'flashback-fifth-graveyard') for (const name of ['Deep Analysis','Think Twice','Deep Analysis','Think Twice']) put(name, human, 'graveyard');
    const source = put(scenario.source, human, scenario.zone), lands = (['monarchCombat','initiativeCombat','tribalManaNexus','faceDownTarget'].includes(scenario.route)?[]:scenario.lands).map(name => put(name));
    const a = window.__gap = { human, bot, source, lands, target: null, sacrifice: null, opponentSpell: null,
      done: false, error: null, activations: [], casts: [], questions: [], botAnswers: [] };
    if (scenario.targetLife) bot.life = scenario.targetLife;
    if (scenario.targetName) a.target = put(scenario.targetName, scenario.targetOwned?human:bot, scenario.targetZone || 'battlefield');
    if(scenario.route==='faceDownTarget')for(let n=0;n<3;n++)put('Wastes',a.target.owner);
    if (scenario.discard) a.sacrifice = put(scenario.discard, human, 'hand');
    if (scenario.sacrificeName) a.sacrifice = put(scenario.sacrificeName);
    if(scenario.response){a.response=put(scenario.response,human,'hand');if(scenario.hold)ui.prioMode='off';}
    a.attackers = [source];
    if (scenario.splitAttack) { a.attackers.push(put(scenario.splitAttack)); a.splitDefender = players[2]; }
    if (scenario.masako) { source.tapped=true; a.support=put('Masako the Humorless'); }
    if(scenario.attackCheat)a.attackCheat=put(scenario.attackCheat,human,'hand');
    if (scenario.route.startsWith('tribalMana')) {
      a.territory=put('Unclaimed Territory',human,'hand');
      if(scenario.route==='tribalManaNexus') {a.support=put('Maskwood Nexus',human,'hand');a.nexusPayment=Array.from({length:4},()=>put('Wastes'));}
    }
    if (scenario.route.startsWith('boltbender')) {
      if(scenario.route==='boltbenderCount') {a.originalTarget=put('Llanowar Elves');a.newTarget=put('Elvish Mystic');}
      else {a.support=put('Bronze Guardian',bot);a.originalTarget=put('Spellskite',bot);a.originalTarget.tapped=true;}
    }
    if (scenario.route.startsWith('monarch')) {
      const owner = scenario.route==='monarchEnd' ? bot : human; a.maker=put('Thorn of the Black Rose',owner,'hand'); for(let n=0;n<4;n++)put('Swamp',owner);
      if(scenario.route==='monarchCombat') {a.attacker=put('Changeling Outcast',bot);for(const p of players.filter(p=>p!==human&&p!==bot))p.lost=true;}
    }
    if(scenario.route==='initiativeCombat') {a.maker=put("Sarevok's Tome",human,'hand');for(let n=0;n<4;n++)put('Swamp');a.damagers=[put('Grizzly Bears',bot),put('Grizzly Bears',bot)];for(const p of players.filter(p=>p!==human&&p!==bot))p.lost=true;}
    if (scenario.botAttacker) { a.attacker = put(scenario.botAttacker, bot); g.turnPlayer = bot; for (const player of players.filter(p => p !== human && p !== bot)) player.lost = true; }
    for (const player of players.filter(p => p !== human)) {
      const nativeDecide = player.controller.decide.bind(player.controller);
      player.controller.decide = async (game,q) => { const answer = await nativeDecide(game,q); if (['attackers','blockers'].includes(q.type)) a.botAnswers.push({ type:q.type, player: player.idx, eligible:q.eligible?.map(c=>c.name), incoming:q.attackers?.map(c=>({name:c.name,defender:c.attacking?.idx})), assignments: Array.isArray(answer)?answer.map(row=>({card:row.card?.name, defender:row.target?.idx, blocker:row.blocker?.name, attacker:row.attacker?.name})):answer }); return answer; };
    }
    if (scenario.label === 'split-aftermath-graveyard') for (const name of ['Forest','Forest','Forest']) put(name, bot, 'hand');
    if (scenario.zone === 'command') { human.commanders = [source]; source.isCommander = true; }
    if (scenario.label === 'fifth-activation') a.target = put('Grizzly Bears');
    if (scenario.label === 'opponent-graveyard') a.target = put('Grizzly Bears', bot, 'graveyard');
    if (scenario.label === 'sacrifice-target-cost') { a.sacrifice = put('Ornithopter'); a.target = put('Llanowar Elves', bot); }
    if (['explosion-two-targets', 'adventure-exile', 'monstrosity-x'].includes(scenario.label)) a.target = put('Grizzly Bears', bot);
    if (scenario.label === 'counter-stack-target') { a.opponentSpell = put('Lightning Bolt', bot, 'hand'); put('Mountain', bot); g.turnPlayer = bot; }
    if (scenario.label === 'teferi-opponent-loyalty') { source.counters.loyalty = 3; g.turnPlayer = bot; }
    if (scenario.label === 'native-megamorph') a.target = put('Ponder', human, 'graveyard');
    if (scenario.label === 'etali-free-adventure-choice') { a.hit = put('Bonecrusher Giant', human, 'library'); a.control = put('Grizzly Bears', bot, 'library'); }
    g.recalc();
    const decide = human.controller.decide.bind(human.controller);
    human.controller.decide = async (game, q) => {
      a.questions.push({ type: q.type, phase: game.phase, step: game.step, prompt: q.prompt, hint: q.aiHint?.kind,
        stack:game.stack.map(so=>so.name),
        enteredCombat:a.attackCheat&&a.attackCheat.zone==='battlefield'?{iid:a.attackCheat.iid,tapped:a.attackCheat.tapped,attacking:a.attackCheat.attacking?.idx}:null,
        offeredActs: (q.acts || []).filter(e => e.card === source).map(e => ui.activationLabel(e)),
        options: q.options?.map(o => ({ key: o.key, label: o.label })), potential:q.potential?.map(c=>({iid:c.iid,name:c.name,tapped:c.tapped})),
        offeredCasts: (q.casts || []).filter(e => e.card === source).map(e => ({ name: e.alt?.name, label: e.alt?.label, from: e.from })) });
      return decide(game, q);
    };
    const activate = g.activateAbility;
    g.activateAbility = async function (p, entry) {
      const label = ui.activationLabel(entry), ok = await activate.call(this, p, entry);
      if (this === g && entry.card === source) a.activations.push({ label, ok });
      return ok;
    };
    const cast = g.castSpell;
    g.castSpell = async function (p, card, opts) {
      const from = card.zone, name = opts?.name, ok = await cast.call(this, p, card, opts);
      if (this === g && (card === source || card === a.hit || card === a.control)) a.casts.push({ from, name, ok, card: card.name });
      return ok;
    };
    const run = scenario.route==='faceDownTarget' ? (async()=>{
      const owner=a.target.owner;g.turnPlayer=owner;g.phase='main1';g.step='main';
      const row=g.castableList(owner).find(e=>e.card===a.target&&e.alt?.faceDownCast==='disguise');if(!row)throw Error('Native target Disguise offer missing');
      await g.castSpell(owner,a.target,{from:row.from,alt:row.alt});a.lands.push(...scenario.lands.map(n=>put(n)));g.recalc();g.turnPlayer=human;ui.prioMode='full';await g.priorityRound(human);
    })() : scenario.route==='initiativeCombat' ? (async()=>{
      g.turnPlayer=human;g.phase='main2';g.step='main';await g.castSpell(human,a.maker,{});a.lands.push(put('Island'));g.recalc();g.turnPlayer=bot;await g.combatPhase(bot);
    })() : scenario.route.startsWith('tribalMana') ? (async()=>{
      g.phase='main1';g.step='main';
      if(a.support) await g.castSpell(human,a.support,{});
      if(scenario.route==='tribalManaNexus')a.lands.push(...scenario.lands.map(n=>put(n)));
      g.recalc();
      await g.playLand(human,a.territory);await g.mainPhase(human);
    })() : scenario.route.startsWith('boltbender') ? (async()=>{
      g.phase='main1';g.step='main'; const row=g.castableList(human).find(e=>e.card===source&&e.alt?.faceDownCast==='disguise'); if(!row)throw Error('Native Disguise offer missing');
      await g.castSpell(human,source,{from:row.from,alt:row.alt});
      a.paymentLands=(scenario.route==='boltbenderCount'?['Forest','Mountain','Plains','Plains']:['Plains','Plains','Plains','Plains','Plains','Plains','Forest','Mountain']).map(n=>put(n));
      a.alliance=put('Blessed Alliance',human,'hand'); ui.prioMode='full'; g.recalc(); await g.castSpell(human,a.alliance,{});
    })() : scenario.route.startsWith('monarch') ? (async()=>{
      const owner=scenario.route==='monarchEnd'?bot:human;g.turnPlayer=owner;g.phase='main2';g.step='main';await g.castSpell(owner,a.maker,{});
      if (scenario.route==='monarchEnd') await g.runEndStepV90(bot);else {a.lands.push(put('Island'));g.recalc();g.turnPlayer=bot; await g.combatPhase(bot);}
    })() : scenario.route === 'botCombat' ? g.combatPhase(bot) : scenario.route === 'combat' ? g.combatPhase(human) : scenario.route === 'main' ? g.mainPhase(human) : scenario.route === 'opponentCast'
      ? g.castSpell(bot, a.opponentSpell, {}) : g.priorityRound(human);
    void run.then(() => { a.done = true; ui.render(); }).catch(error => { a.error = error.stack; });
    ui.render();
  }, { ...scenario, action: undefined });
}

async function progress(scenario) {
  const s = await state(); assert.equal(s.error, null);
  if (s.pending === 'chooseX') {
    const desired = scenario.x ?? s.min;
    for (let n = 0; n < 15; n++) {
      const current = Number(await page.locator('.modal .xval').innerText());
      if (current === desired) break;
      await page.locator('.modal .xrow button').nth(current < desired ? 1 : 0).click();
    }
    await page.getByRole('button', { name: /^Confirm X=/ }).click();
  } else if (s.pending === 'chooseOption') {
    if (scenario.label === 'etali-free-adventure-choice' && s.hint === 'oracleSpellFace') {
      assert.ok(s.options.some(o => /Stomp/.test(o.label)), 'the native free-cast face choice includes the Adventure');
      await shot(`${scenario.label}-face-choice`);
    }
    const option = scenario.route.startsWith('tribalMana') ? s.options.find(o=>o.key==='Elf'||o.key==='G')||s.options[0] : scenario.route.startsWith('boltbender') && s.hint==='mode' ? s.options.find(o=>/Untap/.test(o.label))||s.options.find(o=>o.key==='yes') : scenario.route.startsWith('boltbender') && s.hint==='newTargets' ? s.options.find(o=>o.key===(scenario.route==='boltbenderWard'?'no':'yes')) : scenario.route.startsWith('boltbender') ? s.options.find(o=>o.key==='yes')||s.options[0] : s.hint === 'ward' ? s.options.find(o => o.key === scenario.ward) : scenario.label === 'etali-free-adventure-choice'
      ? s.options.find(o => /Stomp/.test(o.label)) || s.options.find(o => o.key === 'yes') || s.options[0]
      : s.options.find(o => /Valakut Stoneforge/.test(o.label)) || s.options.find(o => /Decline|No\b/.test(o.label)) || s.options[0];
    assert.ok(option, `${scenario.label}: native option selection for ${s.hint} (${JSON.stringify(s.options)})`);
    await page.locator(`.modal [data-choice-key="${option.key}"]`).click();
  } else if (s.pending === 'chooseMulti') {
    if(scenario.route.startsWith('boltbender')) await page.locator('.modal .pbtn.wide:not(.primary)').filter({hasText:/Untap/}).click(); else await page.locator('.modal .pbtn.wide:not(.primary)').first().click();
    await page.getByRole('button', { name: /^Confirm \(/ }).last().click();
  } else if (s.pending === 'chooseCards') {
    const wanted = scenario.attackCheat&&s.choices.some(c=>c.iid===s.attackCheat.iid)?s.attackCheat.iid:s.hint === 'sacCreature' || /sacrific|discard/i.test(s.prompt || '') ? s.sacrifice?.iid : null;
    if(scenario.attackCheat){assert.equal(s.min,0);assert.equal(s.max,1);assert.ok(wanted,'native Kaalia trigger offers the printed Angel');await shot(`${scenario.label}-native-angel-choice`);}
    const choices = s.hint === 'ward' && scenario.ward === 'no' ? [] : wanted ? s.choices.filter(c => c.iid === wanted) : s.choices.slice(0, s.min);
    for (const c of choices.slice(s.selected)) await page.locator(`.modal .bigcard[data-card-name="${c.name}"]`).first().click();
    const confirm = page.getByRole('button', { name: /^Confirm.*\(/ }).filter({ visible: true }).last();
    if (await confirm.count()) await confirm.click();
    else await page.getByRole('button', { name: /^None$/ }).click();
  } else if (s.pending === 'chooseTargets') {
    assert.equal(await page.evaluate(() => _ui.actionQuestion()), null);
    if (scenario.abort && s.pending === 'chooseTargets') { await page.getByRole('button', {name: /Abort cast/}).click(); await page.waitForTimeout(25); return; }
    if (!s.selected && !(s.min === 0 && !s.candidates.length)) {
      const wanted = scenario.route.startsWith('boltbender') && s.candidates.some(c=>c.iid===s.originalTarget?.iid) && s.max===2 ? s.candidates.find(c=>c.iid===s.originalTarget.iid) : scenario.route==='boltbenderCount' && s.candidates.some(c=>c.iid===s.newTarget?.iid) ? (()=>{assert.equal(s.min,1);assert.equal(s.max,1);return s.candidates.find(c=>c.iid===s.newTarget.iid);})() : scenario.label === 'etali-free-adventure-choice' ? s.candidates.find(c => c.player && !c.mine)
        : (s.target ? s.candidates.find(c => c.iid === s.target.iid) : null) || s.candidates.find(c => c.kind === 'spell') || s.candidates.find(c => c.player && c.name === `Native AI ${s.botSeat}`) || s.candidates.find(c => c.player && c.mine) || s.candidates[0];
      assert.ok(wanted, 'printed target has a native candidate');
      if (['graveyard','exile','command'].includes(wanted.zone)) {
        await page.locator(`.targetzoneopen[data-target-zone="${wanted.zone}"][data-target-player="${s.botSeat}"]`).filter({ visible: true }).first().click();
        await page.locator(`.sheet .bigcard[data-card-name="${wanted.name}"].targetable`).click();
      } else if (wanted.kind) {
        await page.locator('.mobileviewtab[data-view="stack"]').click();
        await page.locator('.sidebar .stackitem.targetable').filter({ visible: true }).first().click();
      }
      else if (wanted.player) {
        const target = page.locator(wanted.mine ? '.melife.targetable' : `.opprow[data-player-id="${wanted.idx}"] .opphead.targetable`).filter({ visible: true }).first();
        if (!(await target.count())) await page.locator(`.mobileviewtab[data-view="${wanted.mine ? 'mine' : 'table'}"]`).click();
        await target.click();
      } else {
        const target = page.locator(`.targetable[data-iid="${wanted.iid}"]`).filter({ visible: true }).first();
        if (!(await target.count())) await page.locator(`.mobileviewtab[data-view="${wanted.mine ? 'mine' : 'table'}"]`).click();
        await target.click();
      }
    }
    if (await page.evaluate(() => _ui.pending?.q.type === 'chooseTargets')) await page.locator('.targetpromptactions .primary:not(:disabled)').click();
  } else if (s.pending === 'attackers') {
    const assigned = await page.evaluate(() => _ui.pending.sel.length);
    for (const [index, c] of (s.attackers || [s.source]).entries()) {
      if (index < assigned) continue;
      await page.locator(`.ct-mobile-combat-card[data-iid="${c.iid}"]:visible, .mini.ct-combat-pick[data-iid="${c.iid}"]:visible`).first().click();
      const defender = index ? 2 : s.botSeat;
      await page.locator(`[data-combat-defender="player-${defender}"]`).filter({visible:true}).click();
    }
    await page.locator('[data-testid="confirm-combat-battlefield"]').click();
  } else if (s.pending === 'blockers') {
    const assigned = await page.evaluate(() => _ui.pending.sel.length);
    if (!assigned && scenario.route !== 'monarchCombat' && !scenario.noBlocks) {
      if(scenario.masako) assert.ok(s.questions.at(-1)?.potential?.some(c=>c.iid===s.source.iid && c.tapped),'native blocker question includes the printed legal tapped Bear');
      await page.locator(`.ct-mobile-combat-card[data-iid="${s.source.iid}"]:visible, .mini.ct-combat-pick[data-iid="${s.source.iid}"]:visible`).first().click();
      await page.locator(`[data-combat-attacker="${s.attacker.iid}"]`).filter({visible:true}).first().click();
    }
    if(scenario.crownHold&&!s.holdNext){await page.locator('.tbtn.hudaction').filter({hasText:'HOLD'}).click();assert.equal((await state()).holdNext,true);}
    await page.locator('[data-testid="confirm-combat-battlefield"]').click();
  } else if (s.pending === 'combatReview') {
    if(scenario.route==='initiativeCombat'&&scenario.crownHold&&!s.holdNext){await page.locator('.tbtn.hudaction').filter({hasText:'HOLD'}).click();assert.equal((await state()).holdNext,true);}
    await page.locator('[data-testid="confirm-combat-battlefield"]').click();
  } else {
    if(scenario.crownHold&&s.pending==='priority'&&['attackers','blockers'].includes(s.step)&&!s.stack.length&&!s.holdNext){await page.locator('.tbtn.hudaction').filter({hasText:'HOLD'}).click();assert.equal((await state()).holdNext,true);}
    const proceed = page.getByRole('button', { name: /^(Proceed|Pass|Resolve|Continue|End turn|Got it|Confirm order|No attacks)/ }).filter({ visible: true });
    if (await proceed.count()) await proceed.last().click();
  }
  await page.waitForTimeout(25);
}

async function shot(label) {
  await page.screenshot({ path: `${output}/${label}.png`, animations: 'disabled' });
  writeFileSync(`${output}/${label}.json`, JSON.stringify(await state(), null, 2) + '\n');
}

async function importAndContinue() {
  const base = `http://127.0.0.1:${server.address().port}`;
  const registered = await page.request.post(`${base}/api/account`, {data:{action:'register',displayName:'Mobile audit',email:'mobile-audit@example.test',password:'Local-only-mobile-audit-59342!'}});
  assert.equal((await registered.json()).ok,true);
  await page.goto(base);
  const raw = readFileSync(`${root}tests/fixtures/yuriko-custom-deck.txt`,'utf8').trimEnd();
  const deckText = raw.replaceAll("'",'’').replace(/1 Yuriko, the Tiger’s Shadow$/, '1 Yuriko, the Tiger’s Shadow *CMDR*').replace('Consign // Oblivion','Consign/Oblivion');
  const importDeck = async expected => {
    if (await page.locator('.setuphome').count()) await page.locator('.setuphome').click();
    await page.locator('[data-menu-action="import"]').first().click();
    await page.waitForFunction(()=> !MTGAccount.loading && document.querySelector('.mainmenu-deckimport')?.dataset.librarySource!=='loading',null,{timeout:60000});
    await page.locator('.mainmenu-deckimport-name').fill('Mobile Yuriko audit');
    await page.locator('.mainmenu-deckimport-text').fill(deckText);
    await page.locator('.mainmenu-deckimport-check').click();
    await page.waitForFunction(()=>JSON.parse(render_game_to_text()).deckImport.state==='ready',null,{timeout:60000});
    assert.equal(await page.locator('.mainmenu-deckimport-result b').innerText(),expected);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await page.locator('.mainmenu-deckimport-start').click(); await page.locator('.deckspotlight').waitFor();
    assert.equal(await page.locator('.deckspotlight h2').innerText(),expected); assert.equal(await page.evaluate(()=>!!window._game),false);
    await page.locator('.deckspotlightclose').click();
  };
  await importDeck('Mobile Yuriko audit'); await importDeck('Mobile Yuriko audit (2)');
  await page.reload(); await page.locator('[data-menu-action="import"]').first().click();
  await page.waitForFunction(()=> !MTGAccount.loading && MTG.getImportedDeckLibrary?.()?.entries.length===2,null,{timeout:60000});
  const records = await page.evaluate(()=>MTG.getImportedDeckLibrary().entries.map(e=>({id:e.record.id,name:e.name,ready:e.ready,commanders:e.record.commanders,count:e.record.cards.reduce((n,row)=>n+row.n,0),cards:e.record.cards.map(r=>r.name)})));
  assert.equal(new Set(records.map(r=>r.id)).size,2); assert.ok(records.every(r=>r.ready && r.count===100));
  assert.ok(records.every(r=>r.commanders[0]==="Yuriko, the Tiger's Shadow"));
  await page.screenshot({path:`${output}/account-import-collision-reload.png`,animations:'disabled'});
  results.push({label:'account-import-collision-reload',input:'exact Yuriko list with curly apostrophes, compact split name and commander marker',records});
  console.log('PASS account-import-collision-reload: actual API save, unique suffix, canonical names and ready library after reload');
  await page.locator('.mainmenu-decklibrary-card').filter({hasText:'Mobile Yuriko audit (2)'}).locator('.mainmenu-decklibrary-play').click();
  await page.locator('.deckspotlightcontinue').click(); await page.locator('[data-ai-count="3"]').click();
  const decks = ['Quick Draw','Elven Council','Doom Prevails'];
  const advanceAccount = async () => {
    const q=await page.evaluate(()=>{const q=_ui.pending?.q||_ui.react?.q;return {type:q?.type,min:q?.min,options:q?.options?.map(o=>({key:o.key,label:o.label})),cards:q?.from?.map(c=>({name:c.name,basic:c.def.super?.includes('Basic')})),hint:q?.aiHint?.kind};});
    if(q.type==='chooseOption'){const option=q.options.find(o=>o.key==='U')||q.options.find(o=>o.key==='B')||q.options.find(o=>o.key==='yes')||q.options[0];await page.locator(`.modal [data-choice-key="${option.key}"]`).click();}
    else if(q.type==='chooseCards'){const selected=q.hint==='searchLand'?[q.cards.find(c=>c.basic)||q.cards[0]].filter(Boolean):q.cards.slice(0,q.min||0);for(const c of selected)await page.locator(`.modal .bigcard[data-card-name="${c.name}"]`).first().click();await page.getByRole('button',{name:/^Confirm.*\(/}).filter({visible:true}).last().click();}
    else {const button=page.getByRole('button',{name:/^(Proceed|Pass|Continue|Got it|No attacks|No blocks|End turn)/}).filter({visible:true});if(await button.count())await button.last().click();}
    await page.waitForTimeout(50);
  };
  const reachAccountMain = async () => {for(let n=0;n<1000;n++){if(await page.evaluate(()=>_ui.pending?.q.type==='main'))return;await advanceAccount();}assert.fail('the native account table reaches the human main action question');};
  for (const [idx,name] of decks.entries()) { await page.locator('.botfields .deckselect').nth(idx).selectOption(name); await page.locator('.botfields .styleselect:not(.deckselect)').nth(idx).selectOption('aggressive'); }
  await page.locator('.podstage .pbtn.start:visible, .podstage .setupnext:visible').click(); console.log('INFO imported pod review reached'); await page.locator('.reviewstart').click(); console.log('INFO imported pod started');
  await page.waitForFunction(()=>window._ui?.pending?.q.type==='mulligan',null,{timeout:60000});
  console.log('INFO native mulligan reached');
  for(let n=0;n<3&&!(await page.evaluate(()=>_ui.me.hand.some(c=>c.is('Land'))));n++) {
    const previous=await page.evaluate(()=>({mulls:_ui.pending.q.mulls,free:_ui.pending.q.free}));await page.getByRole('button',{name:/^Mulligan/}).click();
    await page.waitForFunction(previous=>_ui.pending?.q.type==='mulligan'&&(_ui.pending.q.mulls>previous.mulls||_ui.pending.q.free!==previous.free),previous,{timeout:30000});
  }
  assert.equal(await page.evaluate(()=>_ui.me.hand.some(c=>c.is('Land'))),true,'a native kept hand contains a playable land');
  await page.getByRole('button',{name:/^Keep/}).click();
  for (let n=0;n<1000;n++) {
    const kind=await page.evaluate(()=>_ui.pending?.q.type||_ui.react?.q.type);
    if(kind==='main') break;
    if(kind==='bottomCards') {
      const names=await page.evaluate(()=>_ui.me.hand.filter(c=>!c.is('Land')).slice(0,_ui.pending.q.n).map(c=>c.name));
      for(const name of names)await page.locator(`.modal .bigcard[data-card-name="${name}"]`).click();
      await page.getByRole('button',{name:/^Confirm bottom cards/}).click();continue;
    }
    await advanceAccount();
  }
  console.log('INFO native first main reached'); assert.equal(await page.evaluate(()=>_ui.pending?.q.type),'main');
  const land=await page.evaluate(()=>{const lands=_ui.me.hand.filter(c=>c.is('Land'));return (lands.find(c=>['Island','Swamp','Snow-Covered Island','Snow-Covered Swamp','Command Tower','Underground River','Otawara, Soaring City','Morphic Pool','Sunken Ruins','City of Brass','Mana Confluence'].includes(c.name))||lands[0])?.iid;}); assert.ok(land);
  await page.locator(`.hcard[data-iid="${land}"]`).click(); await page.getByRole('button',{name:'Play land',exact:true}).click();
  await reachAccountMain();assert.equal(await page.evaluate(iid=>_game.byIid(iid)?.zone==='battlefield',land),true);
  const savedView = () => page.evaluate(()=>({turnNo:_game.turnNo,phase:_game.phase,step:_game.step,turnPlayer:_game.turnPlayer.idx,human:_ui.me.idx,players:_game.players.map(p=>({idx:p.idx,deck:p.deckName,isAI:p.isAI,style:p.aiStyle,life:p.life,library:p.library.length,libraryOrder:p.library.map(c=>({iid:c.iid,name:c.name})),graveyard:p.graveyard.map(c=>({iid:c.iid,name:c.name})),exile:p.exile.map(c=>({iid:c.iid,name:c.name})),hand:p.hand.map(c=>({iid:c.iid,name:c.name})),command:p.command.map(c=>({iid:c.iid,name:c.name,zone:c.zone})),landsPlayed:p.landsPlayed,pool:{...p.pool},poolMeta:(p.poolMeta||[]).map(r=>({color:r.color,n:r.n,source:r.source?.iid,restricted:!!r.restrict}))})),battlefield:_game.bf().map(c=>({iid:c.iid,name:c.name,ctrl:c.ctrl.idx,tapped:c.tapped,sick:c.sick,counters:{...c.counters}}))}));
  console.log('INFO native land action completed'); const before=await savedView(); assert.equal(before.players.length,4); assert.deepEqual(before.players.filter(p=>p.isAI).map(p=>p.deck).sort(),decks.slice().sort());
  await page.waitForTimeout(1000);
  console.log('INFO native autosave settled before exit');
  await page.locator('.menubutton').click(); page.once('dialog',d=>d.accept());
  await page.locator('.quickmenuitem').filter({hasText:/^Main menu/}).click(); await page.locator('.mainmenu-account-return').waitFor({timeout:30000}); console.log('INFO saved return to menu');
  await page.reload(); await page.locator('.mainmenu-account-return').waitFor({timeout:60000}); await page.locator('.mainmenu-account-return').click();
  await page.locator('.account-continue').click(); await page.waitForFunction(()=>window._ui?.pending?.q.type==='main',null,{timeout:60000});
  console.log('INFO native checkpoint continued'); const after=await savedView(); assert.deepEqual(after,before);
  const checkpoint = await page.evaluate(()=>({index:MTGAccount.save.checkpointTimelineIndex,total:MTGAccount.save.decisions.length,randomState:MTGAccount.save.state.randomState}));
  assert.ok(Number.isInteger(checkpoint.randomState));assert.ok(checkpoint.index<checkpoint.total,'the latest land action was replayed from the checkpoint tail');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  await page.screenshot({path:`${output}/account-custom-pod-save-continue.png`,animations:'disabled'});
  results.push({label:'account-custom-pod-save-continue-exact',before,after,checkpoint,fullMatches:0});
  console.log('PASS account-custom-pod-save-continue-exact: actual four-seat game, paid land action and identical native checkpoint after reload/continue');
  console.log('INFO continued account binding',JSON.stringify(await page.evaluate(()=>({loading:MTGAccount.loading,owner:MTGAccount.user?.id,active:MTG.activeAccountMatch?.setup.deck,library:MTG.getImportedDeckLibrary?.().entries.map(e=>({name:e.name,ready:e.ready})),record:!!MTG.importedDeckRecordFor?.(MTG.activeAccountMatch?.setup.deck),custom:MTG.DECKS[MTG.activeAccountMatch?.setup.deck]?.custom,status:_ui.accountSaveStatus,over:_game.gameOver}))));
  await page.locator('.menubutton').click();await page.locator('.quickmenuitem').filter({hasText:/^Save & exit/}).click();
  await page.locator('.mainmenu-account-return').waitFor({timeout:30000});await page.reload();
  await page.locator('.mainmenu-account-return').waitFor({timeout:60000});await page.locator('.mainmenu-account-return').click();
  await page.locator('.account-continue').click();await page.waitForFunction(()=>window._ui?.pending?.q.type==='main',null,{timeout:60000});
  const repeated=await savedView();assert.deepEqual(repeated,before);
  await page.screenshot({path:`${output}/account-repeat-save-exit-continue.png`,animations:'disabled'});
  results.push({label:'account-repeat-save-exit-continue-no-duplicate-actions',before,repeated,fullMatches:0});
  console.log('PASS account-repeat-save-exit-continue-no-duplicate-actions: immediate Save & exit and second native tail replay preserve the single land action');
  // A separate deterministic initial position, using only the physical cards
  // from these four real decks. The next actions still use native UI questions.
  const controlSave=await page.evaluate(async()=>{
    const setup={...MTG.activeAccountMatch.setup,seed:'330957',manaMode:'manual'};
    const ui=new MTG.UI(),g=MTG.newGame({humanDeck:setup.deck,humanCommanders:setup.commanders,aiDecks:setup.aiDecks,aiStyles:setup.aiStyles,
      humanController:p=>ui.controllerFor(p),seed:330957,paced:true,maxTurns:200});
    const human=g.players.find(p=>!p.isAI);ui.game=g;ui.me=human;
    for(const p of g.players)MTG.shuffle(p.library,g.rnd);
    const position=(name,zone)=>{const c=human.library.find(c=>c.name===name);if(!c)throw Error(`Native initial position missing ${name}`);g.remove(c);c.zone=zone;c.ctrl=human;c.sick=false;c.tapped=false;(zone==='battlefield'?g.battlefield:human[zone]).push(c);return c;};
    position('Island','battlefield');position('Sol Ring','battlefield');position('Moon-Circuit Hacker','hand');
    g.recalc();
    for(const p of g.players)while(p.hand.length<7)await g.draw(p,1);
    for(const p of g.players){p.turnsStarted=2+(p.idx<human.idx?1:0);p.landsPlayed=0;}
    g.turnPlayer=human;g.turnNo=8+human.idx;g.phase='start';g.step='before';g.recalc();
    const state=MTG.captureGameState(g);if(!state||state.cards.length!==400||new Set(state.cards.map(c=>c.iid)).size!==400)throw Error('Initial checkpoint must carry 400 unique physical cards');
    return MTG.buildAccountSave(g,setup,[],'match-mobile-native-floating-mana',state,0);
  });
  const controlResponse=await page.request.post(`${base}/api/account`,{data:{action:'save',save:controlSave,expectedOwnerId:await page.evaluate(()=>MTGAccount.user.id)}});
  assert.equal((await controlResponse.json()).ok,true);await page.reload();await page.locator('.mainmenu-account-return').waitFor({timeout:60000});
  await page.locator('.mainmenu-account-return').click();await page.locator('.account-continue').click();await page.waitForFunction(()=>window._ui?.pending?.q.type==='main',null,{timeout:60000});
  assert.equal(await page.evaluate(()=>_ui.manaMode),'manual');await page.waitForTimeout(1000);
  const portable=await page.evaluate(()=>({state:MTGAccount.save.state,index:MTGAccount.save.checkpointTimelineIndex,total:MTGAccount.save.decisions.length}));
  const hacker=await page.evaluate(()=>_ui.me.hand.find(c=>c.name==='Moon-Circuit Hacker').iid);
  await page.locator(`.hcard[data-iid="${hacker}"]`).click();await page.locator('.sheetacts button:not(:disabled)').filter({hasText:/^Cast/}).click();
  await page.waitForFunction(()=>_ui.pending?.q.type==='chooseManaSources');
  const selected=await page.evaluate(()=>_ui.pending.sel.map(c=>c.name).sort());assert.deepEqual(selected,['Island','Sol Ring']);
  await page.getByRole('button',{name:'Tap selected sources ✓',exact:true}).click();await reachAccountMain();
  const floating=await savedView();assert.equal(floating.players[floating.human].pool.C,1);assert.ok(floating.players[floating.human].poolMeta.some(r=>r.n>0));
  assert.equal(await page.evaluate(()=>_game.bf().find(c=>c.ctrl===_ui.me&&c.name==='Moon-Circuit Hacker').castMeta.manaSpent),2);
  assert.equal(await page.evaluate(()=>MTG.captureGameState(_game)),null,'floating source-dependent mana retains the previous portable checkpoint');
  await page.waitForTimeout(1000);const fallback=await page.evaluate(()=>({state:MTGAccount.save.state,index:MTGAccount.save.checkpointTimelineIndex,total:MTGAccount.save.decisions.length}));
  assert.deepEqual(fallback.state,portable.state);assert.equal(fallback.index,portable.index);assert.ok(fallback.total>portable.total);
  await page.locator('.menubutton').click();await page.locator('.quickmenuitem').filter({hasText:/^Save & exit/}).click();await page.locator('.mainmenu-account-return').waitFor({timeout:30000});await page.reload();
  await page.locator('.mainmenu-account-return').waitFor({timeout:60000});await page.locator('.mainmenu-account-return').click();await page.locator('.account-continue').click();await page.waitForFunction(()=>window._ui?.pending?.q.type==='main',null,{timeout:60000});
  const floatedAgain=await savedView();assert.deepEqual(floatedAgain,floating);
  await page.screenshot({path:`${output}/account-nonportable-mana-checkpoint-tail.png`,animations:'disabled'});
  results.push({label:'account-nonportable-mana-keeps-checkpoint-replays-tail',initialPosition:'400 native cards from exact four decks; Island and Sol Ring on BF, Moon-Circuit Hacker in hand',floating,floatedAgain,offset:portable.index,priorDecisions:portable.total,latestDecisions:fallback.total,fullMatches:0});
  console.log('PASS account-nonportable-mana-keeps-checkpoint-replays-tail: native mana receipt blocks board capture, prior checkpoint remains, latest paid action is restored exactly');
}

try {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  if (process.env.AUDIT_FLOW !== 'import') { await page.locator('[data-menu-action="solo"]').first().click(); await page.waitForSelector('.deckentry:visible', {timeout:60000}); }
  for (const scenario of scenarios.filter(s => process.env.AUDIT_FLOW !== 'import' && (!process.env.AUDIT_SCENARIO || new RegExp(process.env.AUDIT_SCENARIO).test(s.label)))) {
    await fixture(scenario);
    if (['combat','botCombat'].includes(scenario.route)) {
      const before = await state();
      for (let n=0;n<180 && !(await state()).done;n++) await progress(scenario);
      const result = await state(); assert.equal(result.error,null); assert.equal(result.done,true); assert.deepEqual(result.stack,[]); assert.equal(result.fallback,false);
      if (scenario.label.includes('native-bot-block')) { assert.equal(result.source.zone,'battlefield'); assert.equal(result.target.zone,'graveyard'); assert.deepEqual(result.life,before.life); assert.ok(result.botAnswers.some(a=>a.type==='blockers' && a.player===3 && a.assignments.some(b=>b.blocker==='Wind Drake' && b.attacker==='Serra Angel'))); }
      if (scenario.splitAttack) { assert.deepEqual(result.life,[38,40,38,40]); assert.ok(result.attackers.every(c=>c.tapped)); assert.equal(result.questions.find(q=>q.type==='attackers').phase,'combat'); }
      if(scenario.attackCheat){assert.equal(result.attackCheat.zone,'battlefield');assert.equal(result.attackCheat.tapped,true);assert.deepEqual(result.life,[34,40,40,40]);assert.ok(result.questions.some(q=>q.enteredCombat?.attacking===0&&q.enteredCombat.tapped));assert.equal(result.hand.includes('Serra Angel'),false);}
    if (scenario.botAttacker) { assert.equal(result.source.zone,'graveyard'); assert.equal(result.attacker.zone,'battlefield'); assert.equal(result.life[1],scenario.masako?36:40); assert.ok(result.botAnswers.some(a=>a.type==='attackers' && a.player===3 && a.assignments.some(b=>b.defender===1))); assert.ok(result.questions.some(q=>q.type==='blockers')); }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true); await shot(`${scenario.label}-resolved`); results.push({label:scenario.label,before,result}); console.log(`PASS ${scenario.label}: native four-seat combat and real human declarations`); continue;
    }
    for (let n = 0; n < 150 && !(await page.evaluate(label => !!_ui.actionQuestion() && (!label.startsWith('initiative') || /initiative after combat/i.test(_game.stack.at(-1)?.name||'')) && (!label.includes('paid-disguise') || __gap.target.zone==='battlefield') && (!label.startsWith('monarch') || /Monarch/i.test(_game.stack.at(-1)?.name||'')) && (!label.startsWith('boltbender') || (__gap.source.faceDown && _game.stack.at(-1)?.card===__gap.alliance && (!label.includes('ward') || __gap.questions.some(q=>q.hint==='ward')))),scenario.label)); n++) await progress(scenario);
    assert.equal(await page.evaluate(label => !!_ui.actionQuestion() && (!label.startsWith('initiative') || /initiative after combat/i.test(_game.stack.at(-1)?.name||'')) && (!label.includes('paid-disguise') || __gap.target.zone==='battlefield') && (!label.startsWith('monarch') || /Monarch/i.test(_game.stack.at(-1)?.name||'')) && (!label.startsWith('boltbender') || (__gap.source.faceDown && _game.stack.at(-1)?.card===__gap.alliance && (!label.includes('ward') || __gap.questions.some(q=>q.hint==='ward')))),scenario.label), true, `${scenario.label}: native action window is reached`);
    if(scenario.route.startsWith('tribalMana')) {
      await page.locator('.mobileviewtab[data-view="mine"]').click();
      const territory=(await state()).territory;
      await page.locator(`[data-iid="${territory.iid}"]`).filter({visible:true}).first().click();
      await page.locator('.sheetacts .abilitybtn:not(:disabled)').filter({hasText:/mana of any color/i}).click();
      for(let n=0;n<50 && !(await page.evaluate(()=>__gap.human.pool.G===1&&__gap.territory.tapped&&_ui.pending?.q.type==='main'));n++)await progress(scenario);
      assert.equal(await page.evaluate(()=>__gap.human.pool.G===1&&__gap.territory.tapped&&__gap.territory.meta.chosenType==='Elf'),true);
    }
    const before = await state(); assert.equal(before.error, null);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const openResponses = page.locator('.actionrespond').filter({ visible: true });
    if (await openResponses.count()) await openResponses.click();
    if(scenario.hold){await page.locator('.tbtn.hudaction').filter({hasText:'HOLD'}).click();assert.equal((await state()).holdNext,true);}
    await page.locator('.mobileviewtab[data-view="mine"]').click();
    if (before.source.zone === 'hand') await page.locator(`.hand .hcard[data-iid="${before.source.iid}"]`).click();
    else if (before.source.zone === 'command') await page.locator('.czcard').filter({visible:true}).first().click();
    else if (['graveyard','exile'].includes(before.source.zone)) {
      await page.locator(`.meinfo .zone-${before.source.zone}`).filter({visible:true}).first().click();
      await page.locator(`.sheet .bigcard[data-card-name="${before.source.name}"]`).last().click();
    } else await page.locator(`.mini[data-iid="${before.source.iid}"]`).filter({ visible: true }).first().click();
    await page.locator('.sheet').waitFor();
    const action = page.locator('.sheetacts button:not(:disabled)').filter({ hasText: scenario.action }).first();
    assert.equal(await action.count(), 1, `${scenario.label}: the legal native action is visible`);
    if(scenario.route==='tribalMana')assert.equal(await page.locator('.sheetacts button:not(:disabled)').filter({hasText:/face.down|Morph/i}).count(),0,'floating Elf-restricted mana cannot pay a typeless Morph spell');
    if (scenario.label === 'fifth-activation') assert.equal(await page.locator('.sheetacts .abilitybtn:not(:disabled)').count(), 5);
    await shot(`${scenario.label}-available`);
    await action.click();
    let intermediate;
    if(scenario.hold){
      for(let n=0;n<100&&!(await page.evaluate(()=>_ui.pending?.q.type==='priority'&&__gap.source.zone==='stack'));n++)await progress(scenario);
      const held=await state();assert.equal(held.pending,'priority');assert.equal(held.holdNext,false);assert.equal(held.priorityMode,'off');assert.deepEqual(held.stack,['Think Twice']);
      await shot(`${scenario.label}-held-priority`);
      await page.locator(`.hcard[data-iid="${held.response.iid}"]`).click();await page.locator('.sheetacts button:not(:disabled)').filter({hasText:/^Cast/}).click();
      for(let n=0;n<100&&(await state()).response.zone!=='graveyard';n++)await progress(scenario);
      assert.equal((await state()).response.zone,'graveyard');
      intermediate={held};
    }
    if(scenario.route==='faceDownTarget') {
      for(let n=0;n<100&&!(await page.evaluate(()=>!!_ui.actionQuestion()&&__gap.source.zone==='stack'));n++)await progress(scenario);
      assert.equal(await page.evaluate(()=>!!_ui.actionQuestion()&&__gap.source.zone==='stack'),true);
      await page.locator('.mobileviewtab[data-view="stack"]').click();
      const visibility=await page.evaluate(()=>{const so=_game.stack.find(s=>s.card===__gap.source),flow=_ui.renderStackTargetFlow(so),target=flow.querySelector('.stackflowtarget');return {allowed:_ui.canLookFaceDown(__gap.target),hidden:target.classList.contains('hidden'),name:target.dataset.targetName,summary:_ui.stackTargetSummary(so),targetFaceDown:__gap.target.faceDown};});
      assert.equal(visibility.allowed,!!scenario.targetOwned);assert.equal(visibility.hidden,!scenario.targetOwned);assert.equal(visibility.targetFaceDown,true);
      if(!scenario.targetOwned){assert.equal(visibility.name,'Face-down permanent');assert.equal(visibility.summary,'Face-down permanent');assert.equal(await page.locator('.sidebar').innerText().then(t=>t.includes('Boltbender')),false);}
      intermediate={visibility};await shot(`${scenario.label}-targetflow`);
    }
    for (let n = 0; n < 150 && !(await state()).done; n++) await progress(scenario);
    let result = await state(); assert.equal(result.error, null); assert.equal(result.done, true, `${scenario.label}: native action completes`);
    assert.equal(result.fallback, false); assert.deepEqual(result.stack, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    if(scenario.route.startsWith('boltbender')) { assert.equal(result.source.faceDown,false); assert.equal(result.source.manaSpent,3); assert.equal(result.alliance.zone,'graveyard'); assert.equal(result.alliance.manaSpent,2); assert.equal(result.activations.length,1); assert.equal(result.activations[0].ok,true); if(scenario.route==='boltbenderCount') {assert.equal(result.originalTarget.tapped,true);assert.equal(result.newTarget.tapped,false);assert.ok(result.paymentLands.every(c=>c.tapped));}else {assert.equal(result.originalTarget.tapped,false);assert.equal(result.questions.filter(q=>q.hint==='ward').length,1);assert.equal(result.paymentLands.filter(c=>c.tapped).length,6);} }
    if(scenario.route.startsWith('tribalMana')) {assert.equal(result.source.zone,'battlefield');assert.equal(result.pool.G,0);assert.equal(result.territory.tapped,true);if(scenario.route==='tribalManaNexus'){assert.equal(result.source.faceDown,true);assert.equal(result.source.elf,true);assert.equal(result.source.manaSpent,3);assert.equal(result.support.zone,'battlefield');assert.equal(result.support.manaSpent,4);assert.ok(result.lands.every(c=>c.tapped));}else {assert.equal(result.source.faceDown,false);assert.equal(result.source.manaSpent,1);assert.ok(result.lands.every(c=>!c.tapped));}}
    if(scenario.route==='faceDownTarget'){assert.equal(result.source.zone,'graveyard');assert.equal(result.target.zone,'exile');assert.equal(result.target.manaSpent,3);assert.equal(result.target.faceDown,false);assert.equal(result.life[scenario.targetOwned?result.humanSeat:result.botSeat],42);}
    if(scenario.hold){assert.equal(result.source.zone,'graveyard');assert.equal(result.source.manaSpent,2);assert.equal(result.response.zone,'graveyard');assert.equal(result.response.manaSpent,1);assert.ok(result.lands.every(c=>c.tapped));assert.deepEqual(result.hand,['Forest','Forest']);assert.equal(result.libraryCount,18);assert.equal(result.questions.filter(q=>q.type==='priority').length>=1,true);}
    if (scenario.route.startsWith('monarch')) { assert.equal(result.source.zone,'graveyard'); assert.equal(result.lands[0].tapped,true); assert.equal(result.maker.zone,'battlefield'); assert.equal(result.maker.manaSpent,4); assert.equal(result.monarch,scenario.route==='monarchEnd'?result.botSeat:result.humanSeat); if(scenario.route==='monarchEnd') { assert.equal(result.enemyHand.length,0); assert.equal(result.libraryCounts[result.botSeat],20); } else {assert.equal(result.life[result.humanSeat],39);} }
    if(scenario.route==='initiativeCombat'){assert.equal(result.source.zone,'graveyard');assert.equal(result.lands[0].tapped,true);assert.equal(result.maker.zone,'battlefield');assert.equal(result.maker.manaSpent,4);assert.equal(result.initiative,result.humanSeat);assert.equal(result.life[result.humanSeat],36);assert.ok(result.damagers.every(c=>c.tapped));assert.ok(result.botAnswers.some(a=>a.type==='attackers'&&a.player===3&&a.assignments.filter(b=>b.defender===1).length===2));assert.equal(before.stack.filter(n=>/initiative after combat/i.test(n)).length,1);}
    if (scenario.label.startsWith('ward-discard-paid')) { assert.equal(result.target.zone,'exile'); assert.equal(result.sacrifice.zone,'graveyard'); assert.equal(result.life[result.botSeat],43); }
    if (scenario.label.startsWith('ward-discard-declined')) { assert.equal(result.target.zone,'battlefield'); assert.equal(result.sacrifice.zone,'hand'); assert.equal(result.life[result.botSeat],40); }
    if (scenario.label.startsWith('ward-life-paid')) { assert.equal(result.target.zone,'exile'); assert.equal(result.life[result.humanSeat],37); assert.equal(result.life[result.botSeat],43); }
    if (scenario.label === 'ward-sacrifice-legendary') { assert.equal(result.target.zone,'exile'); assert.equal(result.sacrifice.zone,'graveyard'); assert.equal(result.life[result.botSeat],47); }
    if (scenario.label.startsWith('ward-mana-paid')) { assert.equal(result.target.zone, 'exile'); assert.equal(result.life[result.botSeat], 45); assert.ok(result.lands.every(c => c.tapped)); }
    if (scenario.label.startsWith('ward-mana-declined')) { assert.equal(result.target.zone, 'battlefield'); assert.equal(result.life[result.botSeat], 40); assert.equal(result.lands.filter(c => c.tapped).length, 1); }
    if (scenario.label.startsWith('channel-otawara')) { assert.equal(result.source.zone, 'graveyard'); assert.equal(result.target.zone, 'hand'); assert.ok(result.lands.every(c => c.tapped)); assert.equal(result.activations.length, 1); }
    if (scenario.label === 'graveyard-skeleton-main') { assert.equal(result.source.zone, 'battlefield'); assert.equal(result.source.tapped, true); assert.ok(result.lands.every(c => c.tapped)); }
    if (scenario.label.startsWith('command-zone-derevi')) { assert.equal(result.source.zone, 'battlefield'); assert.ok(result.lands.every(c => c.tapped)); assert.equal(result.source.manaSpent, undefined); }
    if (scenario.label.startsWith('opponent-exile')) { assert.equal(result.target.zone, 'graveyard'); assert.equal(result.source.zone, 'graveyard'); assert.ok(result.lands.every(c => c.tapped)); }
    if (scenario.label === 'flashback-fifth-graveyard') { assert.equal(result.source.zone, 'exile'); assert.deepEqual(result.hand, ['Forest']); assert.ok(result.lands.every(c => c.tapped)); assert.equal(result.casts[0].from, 'graveyard'); }
    if (scenario.abort) { assert.equal(result.source.zone, 'hand'); assert.equal(result.target.zone, 'battlefield'); assert.ok(result.lands.every(c => !c.tapped)); assert.deepEqual(result.casts.map(row => row.ok), [false]); }
    if (scenario.label === 'modal-discard-cost') { assert.equal(result.source.zone, 'graveyard'); assert.equal(result.target.zone, 'graveyard'); assert.equal(result.sacrifice.zone, 'graveyard'); assert.ok(result.lands.every(c => c.tapped)); }
    if (scenario.label === 'split-aftermath-graveyard') { assert.equal(result.source.zone, 'exile'); assert.equal(result.enemyHand.length, 1); assert.ok(result.lands.every(c => c.tapped)); assert.equal(result.casts[0].from, 'graveyard'); }
    await shot(`${scenario.label}-resolved`); results.push({ label: scenario.label, before, intermediate, result });
    writeReport();
    console.log(`PASS ${scenario.label}: mobile native action, payment and resolution`);
  }
  if (!process.env.AUDIT_SCENARIO || process.env.AUDIT_FLOW === 'import') await importAndContinue();
  assert.deepEqual(errors, []);
  writeReport();
 } catch (error) {
  writeFileSync(`${output}/failure.json`, JSON.stringify({error:error.stack,results,browserErrors:errors},null,2)+'\n');
  const details = {error:error.stack,results,state:await state().catch(()=>null),nativeState:await page.evaluate(()=>window.render_game_to_text?.()).catch(()=>null),accountBinding:await page.evaluate(()=>({loading:MTGAccount.loading,owner:MTGAccount.user?.id,active:MTG.activeAccountMatch?.setup.deck,library:MTG.getImportedDeckLibrary?.().entries.map(e=>({name:e.name,ready:e.ready})),record:!!MTG.importedDeckRecordFor?.(MTG.activeAccountMatch?.setup.deck),status:_ui?.accountSaveStatus,over:_game?.gameOver})).catch(()=>null),accountRequests,browserErrors:errors};
  writeFileSync(`${output}/failure.json`,JSON.stringify(details,null,2)+'\n');
  writeFileSync(`${output}/failure-${runId}.json`,JSON.stringify(details,null,2)+'\n');
  await page.screenshot({path:`${output}/failure.png`,timeout:20000}).catch(()=>null);
  throw error;
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
