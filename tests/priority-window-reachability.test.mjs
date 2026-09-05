import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// A legal play that the interface never opens a window for does not exist for
// the player. Stella Lee's copy ability was the first case found by hand; these
// sweeps prove the whole catalog instead of one card at a time.

const MTG = loadEngine();
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
const asArray = value => (Array.isArray(value) ? value : []);
const isStackSpec = spec => !!spec && (spec.zone === 'stack' || spec.what === 'spell' || spec.what === 'ability');
const COUNTER_GOALS = new Set(['counter', 'counterspell']);

function stackSpecSources(def) {
  const out = [];
  const push = (list, from) => { for (const spec of asArray(list)) if (isStackSpec(spec)) out.push({ spec, from }); };
  push(def.targets, 'spell');
  for (const ability of asArray(def.abilities)) push(ability.targets, 'ability');
  for (const key of ['handAbility', 'gyAbility']) if (def[key]) push(def[key].targets, key);
  for (const mode of asArray(def.modes && def.modes.list)) push(mode.targets, 'mode');
  for (const key of ['adventure', 'plotFace', 'backFace']) if (def[key]) push(def[key].targets, key);
  for (const face of asArray(def.faces)) push(face.targets, 'face');
  return out;
}

function table({ phase = 'main1', step = 'main', myTurn = false } = {}) {
  const game = new MTG.Game({ seed: 4, paced: true, maxTurns: 100 });
  game.speedFactor = 0;
  const controllers = [0, 1].map(() => ({ decide: async () => ({ kind: 'pass' }) }));
  const players = [0, 1].map(index => game.addPlayer(index ? 'Rival' : 'You',
    { name: index ? 'Rival' : 'You' }, controllers[index], index > 0));
  players[0].isAI = false;
  const [me, rival] = players;
  game.turnPlayer = myTurn ? me : rival;
  game.turnNo = 12;
  game.phase = phase;
  game.step = step;
  const permanent = (player, name) => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.ctrl = player;
    card.zone = 'battlefield';
    card.sick = false;
    game.battlefield.push(card);
    return card;
  };
  const zoneCard = (player, name, zone) => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.zone = zone;
    player[zone].push(card);
    return card;
  };
  for (let index = 0; index < 40; index++) {
    zoneCard(me, 'Island', 'library');
    zoneCard(rival, 'Island', 'library');
  }
  for (let index = 0; index < 10; index++) permanent(me, 'Island');
  for (const color of COLORS) me.pool[color] = 20;
  return { game, me, rival, permanent, zoneCard, controllers };
}

async function priorityWindow(game, me, controllers) {
  let captured = null;
  controllers[0].decide = async (currentGame, question) => { captured = question; return { kind: 'pass' }; };
  await game.askPriorityAction(me);
  if (!captured) return null;
  return { question: captured, stops: !MTG.autoPassPolicy('end', game, captured, me) };
}

function pushStackObject(game, controller, kind, cardName, targets = []) {
  const card = new MTG.CardInst(MTG.DEFS[cardName], controller);
  if (kind === 'spell') card.zone = 'stack';
  else { card.ctrl = controller; card.zone = 'battlefield'; game.battlefield.push(card); }
  const object = kind === 'spell'
    ? { kind: 'spell', name: card.name, card, srcCard: card, ctrl: controller, targets, castOpts: {}, from: 'hand', x: 0 }
    : { kind, name: `${card.name} ability`, card, srcCard: card, src: card, ctrl: controller, targets, ability: { label: 'probe' } };
  game.stack.push(object);
  return object;
}

test('svaka karta koja cilja stack ima prozor u kojem se stvarno može odigrati', { timeout: 120_000 }, async () => {
  const cohort = Object.entries(MTG.DEFS).filter(([, def]) => stackSpecSources(def).length);
  assert.ok(cohort.length > 150, `kohorta je sumnjivo mala: ${cohort.length}`);
  const unreachable = [];
  let tested = 0;

  for (const [name, def] of cohort) {
    const sources = stackSpecSources(def).map(entry => entry.from);
    const zone = sources.includes('ability') ? 'battlefield'
      : sources.includes('gyAbility') ? 'graveyard' : 'hand';
    for (const stackIsMine of [false, true]) {
      for (const [kind, stackCardName] of [['spell', 'Lightning Bolt'], ['spell', 'Grizzly Bears'],
        ['spell', 'Sol Ring'], ['trigger', 'Sol Ring'], ['ability', 'Sol Ring']]) {
        const { game, me, rival, permanent, zoneCard, controllers } = table();
        // costs the catalog actually asks for: bodies, artifacts, cards in hand
        for (let index = 0; index < 3; index++) permanent(me, 'Sol Ring');
        for (let index = 0; index < 3; index++) permanent(me, 'Grizzly Bears');
        // A typed sacrifice such as Abjure needs a blue permanent; an Island
        // produces blue mana but remains colorless.
        permanent(me, 'Merfolk Looter');
        for (let index = 0; index < 4; index++) zoneCard(me, 'Lightning Bolt', 'hand');
        me.turnState.spellsCast = 5;
        const card = zone === 'battlefield' ? permanent(me, name) : zoneCard(me, name, zone);
        // These Stack abilities have printed prerequisites beyond mana and
        // their target. Stage those prerequisites before testing the window.
        if (name === 'Echo Mage') card.counters.level = 2;
        if (name === 'Kitsa, Otterball Elite') card.counters['+1/+1'] = 2;
        if (name === 'Sigil Tracer') permanent(me, 'Sigil Tracer');
        // Direct battlefield fixtures skip entry replacement effects. Preserve
        // the printed counter that a real arrival supplies for payment (for
        // example Glen Elendra Guardian's initial -1/-1 counter).
        for(const operation of def.oracleImplementation||[])if(operation.kind==='enters-with-counters'&&Number.isSafeInteger(operation.n)&&operation.n>0)
          card.counters[operation.counter]=operation.n;
        game.recalc();
        const object = pushStackObject(game, stackIsMine ? me : rival, kind, stackCardName);
        game.recalc();

        let accepts = false;
        let counterOnly = true;
        for (const { spec } of stackSpecSources(def)) {
          let ok = true;
          try { ok = typeof spec.filter !== 'function' || !!spec.filter(game, object, me, card); }
          catch (error) { ok = false; }
          if (!ok) continue;
          accepts = true;
          if (!COUNTER_GOALS.has(spec.aiHint && spec.aiHint.goal)) counterOnly = false;
        }
        // no legal target, or countering our own spell: nothing to prove
        if (!accepts || (stackIsMine && counterOnly)) continue;
        tested++;

        const window = await priorityWindow(game, me, controllers);
        const label = `${name} (${zone}) vs ${stackIsMine ? 'own' : 'rival'} ${kind}`;
        if (!window) { unreachable.push(`${label}: nema priority prozora`); continue; }
        const offered = (window.question.casts || []).some(entry => entry.card === card) ||
          (window.question.acts || []).some(entry => entry.card === card);
        if (!offered) { unreachable.push(`${label}: potez nije u legalnoj listi`); continue; }
        if (!window.stops) unreachable.push(`${label}: interfejs automatski propušta prozor`);
      }
    }
  }
  assert.ok(tested > 300, `premalo provjerenih scenarija: ${tested}`);
  assert.deepEqual(unreachable, [], `nedostupni potezi:\n${unreachable.slice(0, 25).join('\n')}`);
});

test('sposobnost vezana za jedan prozor (upkeep, groblje, ruka) nije nedostupna', { timeout: 180_000 }, async () => {
  const WINDOWS = [
    { phase: 'upkeep', step: '' }, { phase: 'draw', step: '' },
    { phase: 'combat', step: 'begin' }, { phase: 'combat', step: 'attackers' },
    { phase: 'combat', step: 'blockers' }, { phase: 'combat', step: 'endCombat' },
    { phase: 'end', step: '' },
  ];
  const cohort = [];
  for (const [name, def] of Object.entries(MTG.DEFS)) {
    if (def.ninjutsu) { cohort.push({ name, zone: 'hand' }); continue; }
    if (def.gyAbility) { cohort.push({ name, zone: 'graveyard' }); continue; }
    if (def.handAbility) { cohort.push({ name, zone: 'hand' }); continue; }
    if (/activate only|only during/i.test(def.oracle || '') && asArray(def.abilities).length) {
      cohort.push({ name, zone: 'battlefield' });
    }
  }
  assert.ok(cohort.length > 500, `kohorta je sumnjivo mala: ${cohort.length}`);

  const unreachable = [];
  for (const row of cohort) {
    let offeredSomewhere = false;
    let reachable = false;
    for (const myTurn of [true, false]) {
      // a main phase always prompts the human, so an ability offered there is reachable
      const main = table({ phase: 'main1', step: '', myTurn });
      const mainCard = row.zone === 'battlefield'
        ? main.permanent(main.me, row.name) : main.zoneCard(main.me, row.name, row.zone);
      main.me.turnState.spellsCast = 5;
      main.game.recalc();
      const inMain = main.game.activatableList(main.me).some(entry => entry.card === mainCard) ||
        main.game.castableList(main.me).some(entry => entry.card === mainCard);
      if (inMain) { offeredSomewhere = true; reachable = true; break; }

      for (const win of WINDOWS) {
        const { game, me, rival, permanent, zoneCard, controllers } = table({ phase: win.phase, step: win.step, myTurn });
        for (let index = 0; index < 3; index++) permanent(me, 'Sol Ring');
        for (let index = 0; index < 3; index++) permanent(me, 'Grizzly Bears');
        for (let index = 0; index < 4; index++) zoneCard(me, 'Lightning Bolt', 'hand');
        for (let index = 0; index < 4; index++) zoneCard(me, 'Lightning Bolt', 'graveyard');
        me.turnState.spellsCast = 5;
        const card = row.zone === 'battlefield' ? permanent(me, row.name) : zoneCard(me, row.name, row.zone);
        game.recalc();
        if (win.phase === 'combat' && win.step === 'blockers' && myTurn) {
          const attacker = game.creatures(me).find(candidate => candidate !== card);
          if (attacker) { attacker.attacking = rival; game.combat = { attackers: [attacker] }; }
        }
        const window = await priorityWindow(game, me, controllers);
        if (!window) continue;
        const offered = (window.question.acts || []).some(entry => entry.card === card) ||
          (window.question.casts || []).some(entry => entry.card === card);
        if (!offered) continue;
        offeredSomewhere = true;
        if (window.stops) { reachable = true; break; }
      }
      if (reachable) break;
    }
    if (offeredSomewhere && !reachable) unreachable.push(row.name);
  }
  assert.deepEqual(unreachable, [], `sposobnosti bez ijednog upotrebljivog prozora:\n${unreachable.slice(0, 25).join(', ')}`);
});

test('ninjutsu je dostupan u koraku blokiranja', { timeout: 60_000 }, async () => {
  const ninjas = Object.entries(MTG.DEFS).filter(([, def]) => def.ninjutsu).map(([name]) => name);
  assert.ok(ninjas.length >= 20, `premalo ninjutsu karata: ${ninjas.length}`);
  const failures = [];
  for (const name of ninjas) {
    const { game, me, rival, permanent, zoneCard, controllers } = table({ phase: 'combat', step: 'blockers', myTurn: true });
    const attacker = permanent(me, 'Grizzly Bears');
    attacker.attacking = rival;
    game.combat = { attackers: [attacker] };
    const ninja = zoneCard(me, name, 'hand');
    game.recalc();
    const window = await priorityWindow(game, me, controllers);
    const offered = window && (window.question.acts || []).some(entry => entry.card === ninja && entry.ninjutsu);
    if (!offered || !window.stops) failures.push(name);
  }
  assert.deepEqual(failures, []);
});

test('protivnikova sposobnost uperena u mene otvara prozor, ostale ne prave buku', async () => {
  const scenario = async ({ kind, targetsMe, answerInHand }) => {
    const { game, me, rival, permanent, zoneCard, controllers } = table();
    const bear = permanent(me, 'Grizzly Bears');
    if (answerInHand) zoneCard(me, 'Lightning Bolt', 'hand');
    game.recalc();
    pushStackObject(game, rival, kind, 'Sol Ring', targetsMe ? [bear] : []);
    game.recalc();
    return priorityWindow(game, me, controllers);
  };
  const aimed = await scenario({ kind: 'ability', targetsMe: true, answerInHand: true });
  assert.ok(aimed && aimed.stops, 'na protivnikovu sposobnost uperenu u mene mora se moći odgovoriti');
  const aimedTrigger = await scenario({ kind: 'trigger', targetsMe: true, answerInHand: true });
  assert.ok(aimedTrigger && aimedTrigger.stops, 'isto vrijedi za okinutu sposobnost');
  const nothingToDo = await scenario({ kind: 'ability', targetsMe: true, answerInHand: false });
  assert.equal(nothingToDo?.stops ?? false, false, 'bez ijednog odgovora nema razloga za zaustavljanje');
  const elsewhere = await scenario({ kind: 'ability', targetsMe: false, answerInHand: true });
  assert.ok(elsewhere && !elsewhere.stops, 'sposobnost koja me ne dira ne smije prekidati igru');
});

test('counterspell u ruci ne prekida svaki moj cast, a copy efekat prekida', async () => {
  const { game, me, permanent, zoneCard, controllers } = table({ myTurn: true });
  const counter = zoneCard(me, 'Counterspell', 'hand');
  assert.ok(counter, 'Counterspell mora postojati u katalogu');
  const bolt = new MTG.CardInst(MTG.DEFS['Lightning Bolt'], me);
  bolt.zone = 'stack';
  game.stack.push({ kind: 'spell', name: bolt.name, card: bolt, srcCard: bolt, ctrl: me, targets: [], castOpts: {}, from: 'hand' });
  game.recalc();
  const quiet = await priorityWindow(game, me, controllers);
  assert.ok(quiet, 'prozor postoji jer counterspell jeste legalan');
  assert.equal(quiet.stops, false, 'vlastiti spell ne smije biti prekinut zbog counterspella u ruci');

  const stella = permanent(me, 'Stella Lee, Wild Card');
  stella.commander = true;
  me.turnState.spellsCast = 3;
  game.recalc();
  const responsive = await priorityWindow(game, me, controllers);
  assert.ok(responsive && responsive.stops, 'kopiranje vlastitog spella mora dobiti prozor');
  assert.ok((responsive.question.acts || []).some(entry => entry.card === stella));
});

test('lice-nadolje stvorenje se može okrenuti licem gore u stvarnom prozoru', { timeout: 120_000 }, async () => {
  const morphs = Object.entries(MTG.DEFS)
    .filter(([, def]) => def.morph || def.megamorph || def.disguise).map(([name]) => name);
  assert.ok(morphs.length > 100, `premalo morph karata: ${morphs.length}`);
  const windows = [
    { phase: 'combat', step: 'blockers', myTurn: false },
    { phase: 'combat', step: 'attackers', myTurn: false },
    { phase: 'end', step: '', myTurn: false },
    { phase: 'main1', step: '', myTurn: true },
  ];
  const failures = [];
  for (const name of morphs) {
    let reachable = false;
    for (const win of windows) {
      const { game, me, permanent, controllers } = table(win);
      for (let index = 0; index < 12; index++) permanent(me, 'Island');
      const card = new MTG.CardInst(MTG.DEFS[name], me);
      card.ctrl = me;
      card.zone = 'battlefield';
      card.sick = false;
      card.faceDown = true;
      card.meta.faceDownDef = MTG.DEFS[name];
      game.battlefield.push(card);
      game.recalc();
      if (win.phase === 'main1') {
        // the main prompt always reaches the player
        if (game.activatableList(me).some(entry => entry.card === card && entry.turnFaceUp)) { reachable = true; break; }
        continue;
      }
      const window = await priorityWindow(game, me, controllers);
      if (!window) continue;
      const offered = (window.question.acts || []).some(entry => entry.card === card && entry.turnFaceUp);
      if (offered && window.stops) { reachable = true; break; }
    }
    if (!reachable) failures.push(name);
  }
  assert.deepEqual(failures, [], `morph karte bez upotrebljivog prozora: ${failures.slice(0, 20).join(', ')}`);
});
