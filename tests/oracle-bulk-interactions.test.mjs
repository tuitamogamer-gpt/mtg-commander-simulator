import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';
import { stageCondition, stageCount, countValue, matches as v5Matches, characteristicProof, staticProof as v5StaticProof, mechanicKinds, mechanicProof as v5MechanicProof } from './helpers/oracle-v5-proof.mjs';

const v5Helpers=()=>({gameFor,decision,fund,fillLibrary,zoneCard,permanent,fixtureDefinition,resolveAll,stageGenericTarget,stageSpellV4Target,spellV4TargetVariants,semanticSubtypeFixture});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function genericBatches(MTG) {
  return MTG.ORACLE_BATCHES.filter(batch => batch.cards.some(entry => entry.semanticClass !== 'manual-deck-semantic'));
}

function genericEntries(MTG) {
  return genericBatches(MTG).flatMap(batch => batch.cards
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic')
    .map(entry => ({ batch, entry })));
}

function decision(overrides = {}) {
  return {
    decide: async (game, query) => {
      if (overrides[query.type]) return overrides[query.type](game, query);
      if (query.type === 'priority') return { kind: 'pass' };
      if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
      if (query.type === 'chooseOption') return query.options[0]?.key;
      if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
      if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
      if (query.type === 'chooseX') return query.min || 0;
      if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 0).map(option => option.key);
      if (query.type === 'orderTriggers') return query.triggers || query.items || [];
      if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
      return null;
    },
  };
}

function recordingDecision(trace, overrides = {}) {
  const fallback = decision(overrides);
  return {
    decide: async (game, query) => {
      const result = await fallback.decide(game, query);
      trace.push({ query, result });
      return result;
    },
  };
}

function gameFor(MTG, controllers = [decision(), decision()], options = {}) {
  const game = new MTG.Game({ seed: 1007, paced: false, maxTurns: 5 });
  const a = game.addPlayer('Oracle A', { name: 'Oracle A' }, controllers[0], options.ai === true);
  const b = game.addPlayer('Oracle B', { name: 'Oracle B' }, controllers[1], true);
  const aiTrace = [];
  const aiDecisions = [];
  if (options.ai) {
    a.controller = new MTG.AIController(a, { difficulty: 'hard', style: 'balanced' });
    const decideWithLocalAI = a.controller.decide.bind(a.controller);
    a.controller.decide = async (currentGame, query) => {
      aiTrace.push(query);
      const result = await decideWithLocalAI(currentGame, query);
      aiDecisions.push({ query, result });
      return result;
    };
  }
  game.turnPlayer = a;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.reviewCombatWithHuman = async () => {};
  game.revealToHuman = async () => {};
  game.reviewGlobalEffectWithHuman = async () => {};
  return { game, a, b, aiTrace, aiDecisions, role: options.ai ? 'ai' : 'human' };
}

function assertControllerRole(MTG, context, label) {
  if (context.role === 'ai') {
    assert.ok(context.a.controller instanceof MTG.AIController,
      `${label}: genuine deterministic local AIController`);
    assert.equal(context.a.isAI, true, `${label}: AI seat flag`);
  } else {
    assert.equal(context.a.isAI, false, `${label}: human seat flag`);
    assert.equal(context.a.controller instanceof MTG.AIController, false,
      `${label}: human decisions never use AIController`);
  }
}

function permanent(MTG, game, player, definition) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function zoneCard(MTG, player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'Oracle interaction stack did not settle');
}

function mechanic(keyword) {
  const value = String(keyword).toLowerCase();
  return value.startsWith('ward ') ? 'ward' : value;
}

function declaredKeywordOccurrences(MTG, entry) {
  const occurrences = [];
  for (const declared of entry.implementedKeywords || []) {
    const key = mechanic(declared);
    const count = key === 'prowess'
      ? Math.max(1, (MTG.DEFS[entry.raw.name].triggers || []).filter(trigger => trigger.desc === 'Prowess').length)
      : 1;
    for (let index = 0; index < count; index++) occurrences.push(declared);
  }
  return occurrences;
}

function fixtureDefinition(name, types = ['Creature'], extras = {}) {
  return Object.assign({
    name,
    cost: types.includes('Land') ? null : '{1}',
    super: [],
    types,
    subtypes: [],
    oracle: '',
    power: types.includes('Creature') ? '20000' : undefined,
    toughness: types.includes('Creature') ? '20000' : undefined,
  }, extras);
}

function fillLibrary(MTG, player, n) {
  for (let index = 0; index < n; index++) zoneCard(MTG, player, 'Forest', 'library');
}

function poolTotal(player) {
  return Object.values(player.pool).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function fund(player, amount = 30) {
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = amount;
  player.life = Math.max(player.life, 100);
}

function allGenericOperations(MTG) {
  return genericEntries(MTG).flatMap(({ entry }) => entry.implementation || []);
}

function effectAmount(value, fallback = 0) {
  return value === 'X' ? 3 : Number(value ?? fallback) || 0;
}

function makeCombinations(values, min, max) {
  const result = [];
  const visit = (start, chosen) => {
    if (chosen.length >= min && chosen.length <= max) result.push(chosen.slice());
    if (chosen.length === max) return;
    for (let index = start; index < values.length; index++) {
      chosen.push(values[index]);
      visit(index + 1, chosen);
      chosen.pop();
    }
  };
  visit(0, []);
  return result;
}

function cardState(card) {
  return {
    zone: card.zone,
    zoneVersion: card.zoneVersion,
    tapped: !!card.tapped,
    power: Number(card.power) || 0,
    toughness: Number(card.toughness) || 0,
    counters: Object.assign({}, card.counters),
    regenShield: card.regenShield||0,
  };
}

function playerState(player) {
  return {
    life: player.life,
    poison: player.poison || 0,
    hand: player.hand.length,
    library: player.library.length,
    graveyard: player.graveyard.length,
    handCards: player.hand.slice(),
    libraryCards: player.library.slice(),
    graveyardCards: player.graveyard.slice(),
  };
}

async function settleWithStackWitness(game, witness) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) {
      const object = game.stack.at(-1);
      if (witness) witness(object);
      await game.resolveTop();
    }
  }
  assert.ok(guard < 100, 'Oracle witnessed interaction stack did not settle');
}

function semanticStaticSubtypes(operation) {
  if (operation.subtypes?.length) return operation.subtypes.slice();
  const descriptor = String(operation.subtype || '').trim();
  if (!descriptor || /^non[- ]/i.test(descriptor)) return [];
  return descriptor === 'Time Lord' ? [descriptor] : descriptor.split(/\s+/);
}

function semanticSubtypeFixture(operation) {
  const subtypes = semanticStaticSubtypes(operation);
  if (subtypes.length > 1) {
    return fixtureDefinition(`Oracle Static ${subtypes.join(' ')}`, ['Creature'], {
      subtypes, colorsOverride: [],
    });
  }
  const subtype = String(operation.subtype || 'Test');
  const lower = subtype.toLowerCase();
  const extras = { subtypes: ['Test'], colorsOverride: [] };
  if (lower === 'artifact') return fixtureDefinition('Oracle Static Artifact', ['Artifact', 'Creature'], extras);
  if (lower === 'legendary') extras.super = ['Legendary'];
  else if (lower === 'multicolored') extras.colorsOverride = ['W', 'U'];
  else if (lower === 'colorless') extras.colorsOverride = [];
  else if (['white', 'blue', 'black', 'red', 'green'].includes(lower)) {
    extras.colorsOverride = [{ white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[lower]];
  } else if (!['attacking', 'tapped', 'untapped', 'enchanted'].includes(lower)) extras.subtypes = [subtype];
  return fixtureDefinition(`Oracle Static ${subtype}`, ['Creature'], extras);
}

function stageGenericTarget(MTG, context, target, index, effect = null) {
  const { game, a, b } = context;
  const beneficial=['regenerate','prevent-next','attach-source','unblockable-until-eot'].includes(effect?.action)||effect?.action==='counter'&&!['-1/-1','stun'].includes(effect.counter)||effect?.action==='pump'&&(effect.power||0)>=0&&(effect.toughness||0)>=0;
  const controller = target.controller === 'you' ? a : target.controller==='opponent'||target.controller==='defending-player'?b:beneficial?a:b;
  const what = String(target.what || 'creature').toLowerCase();
  if (what === 'player' || what === 'opponent' || what === 'any' || what === 'player or planeswalker') {
    return what === 'player' && target.controller === 'you' ? a : b;
  }
  let types = ['Creature'];
  if (what === 'artifact') types = ['Artifact'];
  else if (what === 'enchantment') types = ['Enchantment'];
  else if (what === 'land') types = ['Land'];
  else if (what === 'permanent' || what === 'nonland permanent') types = ['Enchantment'];
  else if (what === 'artifact or enchantment') types = ['Artifact'];
  else if (what === 'artifact or land' || what === 'artifact or creature') types = ['Artifact'];
  else if (what === 'instant or sorcery') types = ['Instant'];
  else if (what === 'card') types = ['Creature'];
  const definition = fixtureDefinition(`Oracle Generic Target ${index}`, types, {
    power: types.includes('Creature') ? '20000' : undefined,
    toughness: types.includes('Creature') ? '20000' : undefined,
  });
  if(target.withKeyword)definition.kws=[target.withKeyword];
  if(target.color)definition.colorsOverride=target.color==='colorless'?[]:target.color==='multicolored'?['G','W']:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[target.color]||'G'];
  if(target.stat==='mv')definition.cost='{'+target.threshold+'}';
  const zone = target.zone === 'graveyard' ? 'graveyard' : 'battlefield';
  const card = zone === 'battlefield'
    ? permanent(MTG, game, controller, definition)
    : (() => {
        const result = new MTG.CardInst(definition, controller);
        result.zone = zone;
        controller[zone].push(result);
        return result;
      })();
  if (target.tapped) card.tapped = true;
  if (target.attacking || target.attackingOrBlocking || target.controller === 'defending-player') card.attacking = a;
  if (target.blocking) card.blocking = 1;
  if (target.stat && target.stat!=='mv') {
    card.def[target.stat] = String(target.threshold);
    game.recalc();
  }
  return card;
}

function genericEffectTarget(effect, selectedTargets, source) {
  if (effect.target === 'self') return source;
  if (typeof effect.target === 'number') return selectedTargets[effect.target];
  return null;
}

function genericEffectPlayer(effect, selectedTargets, source, owner, damagedPlayer) {
  if (effect.who === 'you') return owner;
  if (typeof effect.who === 'number') return selectedTargets[effect.who];
  if (effect.action === 'discard-damaged-player') return damagedPlayer;
  return source && source.ctrl;
}

function genericProofSnapshot(context, trackedCards) {
  return {
    players: new Map(context.game.players.map(player => [player, playerState(player)])),
    cards: new Map(trackedCards.filter(Boolean).map(card => [card, cardState(card)])),
    battlefield: context.game.battlefield.slice(),
    tokenCount: context.game.battlefield.filter(card => card.isToken).length,
    monarch: context.game.monarch || null,
  };
}

async function assertGenericEffectEvidence(MTG, context, entry, effect, source, selectedTargets,
  damagedPlayer, before, trace, label) {
  const { game, a, b } = context;
  const subject = genericEffectTarget(effect, selectedTargets, source);
  const player = genericEffectPlayer(effect, selectedTargets, source, a, damagedPlayer);
  const n = effect.n?.kind==='event-card-stat'?Math.max(0,context.eventCardStats[effect.n.stat]):effect.n?.kind==='count'?countValue(context,source,effect.n,before)*(effect.n.multiply??1):effect.n?.kind==='source-stat'?Math.max(0,before.cards.get(source)?.[effect.n.stat]??Number(entry.raw[effect.n.stat])):effect.n?.kind==='event-amount'?2:effectAmount(effect.n, 1);
  const oldSubject = subject && before.cards.get(subject);
  const oldPlayer = player && before.players.get(player);
  const queryKinds = trace.map(item => item.query.type);
  const action = effect.action;
  if (typeof effect.target === 'number' && !subject) {
    const ownerOperation = (entry.implementation || []).find(candidate => (candidate.effects || []).includes(effect));
    const targetSpec = ownerOperation?.targets?.[effect.target];
    assert.equal(targetSpec?.min, 0, `${label}: only an optional target may be omitted`);
    const declined = trace.find(item => item.query.type === 'chooseTargets' && item.query.min === 0 &&
      item.query.candidates.length > 0 && Array.isArray(item.result) && item.result.length === 0);
    assert.ok(declined, `${label}: controller explicitly chooses the legal zero-target branch`);
    for (const candidate of declined.query.candidates) {
      const prior = before.cards.get(candidate);
      if (prior && prior.zone === 'battlefield') assert.equal(candidate.zone, prior.zone,
        `${label}: omitted optional effect leaves available permanent ${candidate.name} untouched`);
    }
    return;
  }

  if(action==='optional-payment') {
    const choice=trace.find(item=>item.query.type==='chooseOption'&&item.query.prompt==='Pay the optional cost?');
    assert.ok(choice,`${label}: payment reaches controller`);
    if(choice.result==='yes'){
      if(effect.payment.life)assert.ok(a.life<=before.players.get(a).life-effect.payment.life,`${label}: life paid`);
      if(effect.payment.sacSelf)assert.equal(source.zone,'graveyard',`${label}: sacrifice paid`);
      if(effect.payment.discard)assert.ok(a.graveyard.some(card=>before.players.get(a).handCards.includes(card)),`${label}: chosen hand card discarded`);
      for(const child of effect.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/paid-effect');
    }else assert.equal(choice.result,'no',`${label}: explicit decline`);
  }else if(action==='impulse'){
    const cards=before.players.get(a).libraryCards.slice(-n);
    assert.equal(cards.filter(card=>card.zone==='exile'&&card.meta.playableBy===a).length,n,`${label}: exile with controller permission`);
    for(const card of cards)assert.equal(card.meta.spellsOnly,!!effect.spellsOnly,`${label}: play/cast distinction`);
  }else if(action==='reanimate'){
    assert.equal(subject.zone,'battlefield',`${label}: reanimation enters battlefield`);
    assert.equal(subject.ctrl,effect.controller==='you'?a:subject.owner,`${label}: reanimation controller`);
    if(effect.tapped)assert.equal(subject.tapped,true,`${label}: enters tapped`);
  }else if(action==='blink'){
    if(effect.delayed){assert.equal(subject.zone,'exile',`${label}: delayed exile`);await game.emit('endStep',{player:a});await resolveAll(game);}
    assert.equal(subject.zone,'battlefield',`${label}: blink returns`);
    assert.ok(subject.zoneVersion>=oldSubject.zoneVersion+2,`${label}: blink is a new object`);
    assert.equal(subject.ctrl,effect.controller==='you'?a:subject.owner,`${label}: returned controller`);
  }else if(action==='search-library'||action==='put-from-hand'){
    const query=trace.find(item=>item.query.type==='chooseCards'&&(action==='search-library'?item.query.search:/from your hand/.test(item.query.prompt)));
    assert.ok(query,`${label}: legal selection reaches controller`);
    assert.ok(query.query.from.length,`${label}: positive branch has candidates`);
    const selected=Array.isArray(query.result)?query.result:[];
    for(const card of selected){assert.equal(v5Matches(card,effect.what),true,`${label}: selected type`);assert.equal(card.zone,effect.destination||'battlefield',`${label}: selected card destination`);}
    if(action==='search-library'&&effect.what==='card')assert.equal(selected.length,n,`${label}: unqualified search cannot fail to find`);
  }else if(action==='look-select'||action==='order-top'){
    const top=before.players.get(a).libraryCards.slice(-n);
    assert.ok(top.length,`${label}: nonempty library`);
    const queries=trace.filter(item=>item.query.type==='chooseCards');
    assert.ok(queries.length,`${label}: library decision`);
    if(action==='look-select'){
      const chosen=queries.find(item=>/top of your library/.test(item.query.prompt));assert.ok(chosen,`${label}: selection query`);
      const selected=Array.isArray(chosen.result)?chosen.result:[];
      for(const card of selected){assert.equal(v5Matches(card,effect.what),true);assert.equal(card.zone,'hand');}
      for(const card of top.filter(card=>!selected.includes(card)))assert.equal(card.zone,effect.rest==='graveyard'?'graveyard':'library');
    }else assert.deepEqual(new Set(a.library.slice(-n)),new Set(top),`${label}: order preserves top cohort`);
  }else if(action==='attach-source')assert.equal(source.attachedTo,subject.iid,`${label}: equipment attached`);
  else if(action==='regenerate')assert.ok((subject.regenShield||0)>(oldSubject.regenShield||0),`${label}: regeneration shield`);
  else if(action==='unblockable-until-eot')assert.equal(subject.cur.unblockable,true,`${label}: unblockable state`);
  else if(action==='prevent-next')assert.ok(game.untilEffects.some(row=>row.kind==='oraclePreventNextAmount'&&row.target===subject&&row.remaining===n),`${label}: exact prevention shield`);
  else if(action==='skip-next-untap')assert.equal(subject.meta.noUntapOnce,true,`${label}: next untap marker`);
  else if(action==='draw-next-upkeep'){
    const size=a.library.length;game.turnNo++;await game.emit('upkeep',{player:b});await resolveAll(game);assert.equal(a.library.length,size-n,`${label}: delayed draw through Stack`);
  }else if(action==='amass')assert.ok(game.creatures(a).some(card=>card.hasSub('Army')&&card.hasSub(effect.subtype)&&(card.counters['+1/+1']||0)>=n),`${label}: typed Army and counters`);
  else if(action==='ring-tempts')assert.ok(a.ringLevel>0||a.ringTemptations>0||a.ringTempts>0,`${label}: Ring progresses`);
  else if(action==='learn'){
    const query=trace.find(item=>item.query.type==='chooseOption'&&item.query.prompt.startsWith('Learn:'));assert.ok(query,`${label}: Commander rummage choice`);
    if(query.result==='yes')assert.ok(a.library.length<before.players.get(a).library&&a.graveyard.some(card=>before.players.get(a).handCards.includes(card)),`${label}: rummage discard and draw`);
  }else if(action==='reveal-hand-discard')assert.ok(subject.graveyard.some(card=>before.players.get(subject).handCards.includes(card)),`${label}: revealed hand card discarded`);
  else if (action === 'draw') {
    assert.ok(player.library.length <= oldPlayer.library - n, `${label}: draw mutates the chosen library`);
  } else if (action === 'gain-life') {
    assert.ok(player.life >= oldPlayer.life + n, `${label}: exact-or-greater life gain is visible`);
  } else if (action === 'lose-life') {
    if (effect.who === 'each-opponent') {
      assert.ok(a.opponents(game).every(opponent => opponent.life <= before.players.get(opponent).life - n),
        `${label}: every opponent loses life`);
    } else if (effect.who === 'each-player') {
      assert.ok(game.players.every(current => current.life <= before.players.get(current).life - n),
        `${label}: every player loses life`);
    } else assert.ok(player.life <= oldPlayer.life - n, `${label}: selected player loses life`);
  } else if (action === 'damage') {
    if (effect.target === 'each-opponent') {
      assert.ok(a.opponents(game).every(opponent => opponent.life <= before.players.get(opponent).life - n),
        `${label}: damage reaches every opponent`);
    } else if (subject instanceof MTG.Player && source.kw('infect')) {
      assert.equal(subject.life, before.players.get(subject).life, `${label}: infect damage preserves life`);
      assert.ok(subject.poison >= before.players.get(subject).poison + n, `${label}: infect damage gives poison`);
    } else if (subject instanceof MTG.Player) {
      assert.ok(subject.life <= before.players.get(subject).life - n, `${label}: player damage is visible`);
    } else if (subject && subject.zone === 'battlefield' && source.kw('infect')) {
      assert.ok((subject.counters['-1/-1'] || 0) >= (oldSubject.counters['-1/-1'] || 0) + n,
        `${label}: infect damage gives creature -1/-1 counters`);
    } else if (subject && subject.zone === 'battlefield') {
      assert.ok(subject.damage >= n || subject.counters.defense < (oldSubject.counters.defense || 0),
        `${label}: permanent damage is visible`);
    } else assert.ok(subject && ['graveyard', 'exile'].includes(subject.zone), `${label}: lethal damage changed zone`);
  } else if (action === 'pump') {
    assert.ok(subject, `${label}: pump has a selected subject`);
    const power = Number(effect.power || 0);
    const toughness = Number(effect.toughness || 0);
    if (power > 0) assert.ok(subject.power >= oldSubject.power + power, `${label}: power increases`);
    if (power < 0) assert.ok(subject.power <= oldSubject.power + power, `${label}: power decreases`);
    if (toughness > 0) assert.ok(subject.toughness >= oldSubject.toughness + toughness, `${label}: toughness increases`);
    if (toughness < 0 && subject.zone === 'battlefield') {
      assert.ok(subject.toughness <= oldSubject.toughness + toughness, `${label}: toughness decreases`);
    }
    for (const keyword of effect.keywords || []) assert.equal(subject.kw(keyword), true, `${label}: grants ${keyword}`);
  } else if (action === 'pump-group') {
    const candidates = game.battlefield.filter(card => card.is('Creature') && (['all-creatures','all-other-creatures'].includes(effect.who)||effect.who==='opponent-creatures'?effect.who!=='opponent-creatures'||card.ctrl!==a:card.ctrl===a) &&
      (effect.who !== 'all-other-creatures' || card!==source) &&
      (effect.who !== 'your-other-creatures' || card !== source) &&
      (effect.who !== 'your-attacking-creatures' || !!card.attacking));
    assert.ok(candidates.some(card => {
      const prior = before.cards.get(card);
      return prior && (card.power !== prior.power || card.toughness !== prior.toughness ||
        (effect.keywords || []).some(keyword => card.kw(keyword)));
    }), `${label}: group pump changes a legal creature`);
  } else if (action === 'counter') {
    if (effect.target === 'created-tokens') {
      const createdTokens = game.battlefield.filter(card => card.isToken && !before.battlefield.includes(card));
      assert.ok(createdTokens.length > 0, `${label}: newly created tokens survive the same resolving effect`);
      for (const token of createdTokens) {
        assert.equal(token.counters[effect.counter] || 0, n, `${label}: each created token gets the exact counter count`);
        assert.equal(token.zone, 'battlefield', `${label}: each created token remains on the battlefield`);
        if (token.is('Creature')) {
          assert.ok(token.toughness > 0, `${label}: counters keep the created creature alive through state-based actions`);
          if (effect.counter === '+1/+1') {
            assert.equal(token.power, (Number(token.def.power) || 0) + n, `${label}: created token power includes counters`);
            assert.equal(token.toughness, (Number(token.def.toughness) || 0) + n, `${label}: created token toughness includes counters`);
          }
        }
      }
      assert.equal(source.counters[effect.counter] || 0, before.cards.get(source)?.counters[effect.counter] || 0,
        `${label}: token-reference counter does not affect its source`);
    } else {
      assert.ok((subject.counters[effect.counter] || 0) >= (oldSubject.counters[effect.counter] || 0) + n,
        `${label}: exact counter family increases`);
    }
  } else if (action === 'counter-group') {
    const affected = game.creatures(a).filter(card => effect.who !== 'your-other-creatures' || card !== source);
    assert.ok(affected.length, `${label}: counter group has legal creatures`);
    assert.ok(affected.every(card => (card.counters[effect.counter] || 0) >=
      ((before.cards.get(card)?.counters[effect.counter]) || 0) + n), `${label}: counter group changes every creature`);
  } else if (action === 'destroy') {
    assert.equal(subject.zone, 'graveyard', `${label}: destroy changes the target zone`);
  } else if (action === 'exile') {
    assert.equal(subject.zone, 'exile', `${label}: exile changes the target zone`);
  } else if (action === 'bounce' || action === 'move-to-hand' || action === 'return-source-to-hand') {
    const moved = action === 'return-source-to-hand' ? source : subject;
    assert.equal(moved.zone, 'hand', `${label}: return-to-hand changes the card zone`);
  } else if (action === 'sacrifice-source') {
    assert.equal(source.zone, 'graveyard', `${label}: source sacrifice is paid`);
  } else if (action === 'tap' || action === 'untap') {
    assert.equal(subject.tapped, action === 'tap', `${label}: ${action} changes tapped state`);
  } else if (action === 'mill') {
    assert.ok(player.library.length <= oldPlayer.library - n, `${label}: mill removes cards from library`);
    assert.ok(player.graveyard.length >= oldPlayer.graveyard + n, `${label}: mill puts cards in graveyard`);
  } else if (action === 'scry' || action === 'surveil') {
    assert.ok(queryKinds.includes('scry'), `${label}: ${action} reaches the controller decision`);
    const query = trace.find(item => item.query.type === 'scry')?.query;
    assert.equal(!!query?.surveil, action === 'surveil', `${label}: scry/surveil decision mode`);
  } else if (action === 'investigate') {
    assert.ok(game.battlefield.filter(card => card.isToken && card.hasSub('Clue')).length >
      before.battlefield.filter(card => card.isToken && card.hasSub('Clue')).length,
    `${label}: investigate creates a Clue`);
  } else if (action === 'proliferate') {
    assert.ok(queryKinds.includes('chooseCards') || queryKinds.includes('chooseTargets') ||
      [...before.cards].some(([card, old]) => Object.entries(card.counters).some(([key, value]) => value > (old.counters[key] || 0))),
    `${label}: proliferate executes a selection or increases counters`);
  } else if (action === 'monarch') {
    assert.equal(game.monarch, a, `${label}: controller becomes monarch`);
  } else if (action === 'token-key' || action === 'token-inline') {
    assert.ok(game.battlefield.filter(card => card.isToken).length >= before.tokenCount + n,
      `${label}: exact-or-greater token count is created`);
  } else if (action === 'connive') {
    assert.ok(queryKinds.includes('chooseCards'), `${label}: connive asks the controller to discard`);
    assert.ok(a.library.length < before.players.get(a).library, `${label}: connive draws a card`);
  } else if (action === 'explore') {
    const explored = before.players.get(a).libraryCards.at(-1);
    assert.ok((explored && explored.zone === 'hand' && a.hand.includes(explored)) ||
      (source.counters['+1/+1'] || 0) > ((before.cards.get(source)?.counters['+1/+1']) || 0),
    `${label}: explore moves a land or adds a counter`);
  } else if (action === 'cant-block-until-eot') {
    assert.equal(subject.cur.cantBlock, true, `${label}: temporary restriction changes combat legality`);
  } else if (action === 'discard') {
    assert.ok(player.graveyard.length >= oldPlayer.graveyard + n, `${label}: discarded cards reach graveyard`);
    if (player === a) {
      const discardDecision = trace.find(item => item.query.type === 'chooseCards' &&
        String(item.query.prompt || '').startsWith('Discard ') &&
        Array.isArray(item.result) && item.result.length === n);
      assert.ok(discardDecision, `${label}: controller chooses the exact discard count`);
      assert.ok(discardDecision.result.every(card => card.zone === 'graveyard'),
        `${label}: the controller's chosen cards are the cards discarded`);
    }
  } else if (action === 'discard-damaged-player') {
    const old = before.players.get(damagedPlayer);
    assert.ok(damagedPlayer.hand.length <= old.hand - n, `${label}: damaged player discards`);
  } else if (action === 'discard-each-opponent') {
    assert.ok(a.opponents(game).every(opponent => opponent.hand.length <= before.players.get(opponent).hand - n),
      `${label}: each opponent discards`);
  } else assert.fail(`${entry.raw.name}: no nested generic-effect proof for ${action}`);
}

function baseContract(entry) {
  if (entry.raw.types.includes('Land')) return 'land-play';
  if (entry.raw.types.some(type => type === 'Instant' || type === 'Sorcery')) return 'spell-casting';
  if (entry.raw.types.includes('Creature')) return 'creature-casting';
  if (entry.raw.types.some(type => type === 'Artifact' || type === 'Enchantment')) return 'permanent-casting';
  return null;
}

async function enterPermanentProof(MTG, context, entry) {
  const { game, a } = context;
  for(const operation of entry.implementation||[])if(operation.kind==='characteristic-pt'&&operation.count.kind==='count')stageCount(MTG,context,operation.count,v5Helpers());
  const card = zoneCard(MTG, a, entry.raw.name, 'hand');
  if (entry.raw.types.includes('Land')) {
    assert.equal(await game.playLand(a, card), true, `${card.name}: real land-play path`);
    assert.equal(card.zone, 'battlefield', `${card.name}: land enters battlefield`);
  } else {
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) a.pool[color] = 30;
    assert.equal(await game.castSpell(a, card, { from: 'hand', xVal: 3 }), true, `${card.name}: paid cast enters the real stack`);
    assert.equal(card.zone, 'stack', `${card.name}: stack zone`);
    await resolveAll(game);
    const expectedZone = Number(entry.raw.toughness) <= 0 && !card.def.etbCounters ? 'graveyard' : 'battlefield';
    assert.equal(card.zone, expectedZone,
      `${card.name}: resolves and state-based actions are applied (library=${a.library.length}, lost=${a.lost}, log=${game.log.slice(-4).map(item => item.msg).join(' | ')})`);
  }
  await resolveAll(game);
  return card;
}

async function cardProof(MTG, entry, role = 'human') {
  const context = gameFor(MTG, [decision(), decision()], { ai: role === 'ai' });
  assertControllerRole(MTG, context, `${entry.raw.name}/${role}/card-contract`);
  if (entry.raw.types.includes('Land') || entry.raw.types.some(type =>
    type === 'Creature' || type === 'Artifact' || type === 'Enchantment')) {
    const card = await enterPermanentProof(MTG, context, entry);
    if (entry.semanticClass === 'vanilla' && card.zone === 'battlefield') {
      assert.equal(card.power, Number(entry.raw.power), `${card.name}: vanilla power`);
      assert.equal(card.toughness, Number(entry.raw.toughness), `${card.name}: vanilla toughness`);
    }
    return 1;
  }
  assert.fail(`${entry.raw.name}: spell-template card must be executed by its operation proof`);
}

async function genericStaticProof(MTG, entry, operation, role) {
  if(entry.implementation.filter(op=>op.kind==='generic-static').length>1||entry.implementation.some(op=>op.kind==='characteristic-pt'))return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.condition||operation.multiplier||operation.evasionMinBlockerPower!==undefined||operation.evasionLessThanOwnPower||operation.excludedBlockers||operation.blockedOnlyByFlyingOrReach||['all-creatures','opponent-creatures'].includes(operation.scope))return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  const context = gameFor(MTG, [decision(), decision()], { ai: role === 'ai' });
  const { game, a, b } = context;
  assertControllerRole(MTG, context, `${entry.raw.name}/${role}/generic-static`);
  game.turnPlayer = a;
  const source = permanent(MTG, game, a, entry.raw.name);

  if (operation.scope === 'self') {
    game.recalc();
    const printedPower = Number(entry.raw.power) || 0;
    const printedToughness = Number(entry.raw.toughness) || 0;
    assert.equal(source.power, printedPower + Number(operation.power || 0),
      `${entry.raw.name}/${role}: self static power`);
    assert.equal(source.toughness, printedToughness + Number(operation.toughness || 0),
      `${entry.raw.name}/${role}: self static toughness`);
    for (const keyword of operation.keywords || []) assert.equal(source.kw(keyword), true,
      `${entry.raw.name}/${role}: self static grants ${keyword}`);
    if (operation.evasionMaxBlockerPower !== undefined) {
      const weak = permanent(MTG, game, b, fixtureDefinition('Oracle Weak Blocker', ['Creature'], {
        power: String(operation.evasionMaxBlockerPower), toughness: '20',
      }));
      const strong = permanent(MTG, game, b, fixtureDefinition('Oracle Strong Blocker', ['Creature'], {
        power: String(operation.evasionMaxBlockerPower + 1), toughness: '20',
      }));
      game.recalc();
      assert.equal(game.canBlock(weak, source), false, `${entry.raw.name}/${role}: weak blocker excluded`);
      assert.equal(game.canBlock(strong, source), true, `${entry.raw.name}/${role}: stronger blocker remains legal`);
    }
    if (operation.blockedOnlyByFlying) {
      const ground = permanent(MTG, game, b, fixtureDefinition('Oracle Ground Blocker', ['Creature']));
      const flyer = permanent(MTG, game, b, fixtureDefinition('Oracle Flying Blocker', ['Creature'], { kws: ['flying'] }));
      game.recalc();
      assert.equal(game.canBlock(ground, source), false, `${entry.raw.name}/${role}: ground blocker excluded`);
      assert.equal(game.canBlock(flyer, source), true, `${entry.raw.name}/${role}: flying blocker remains legal`);
    }
    if (operation.yourTurnOnly) {
      game.turnPlayer = b;
      game.recalc();
      assert.equal(source.power, printedPower, `${entry.raw.name}/${role}: your-turn power expires`);
      assert.equal(source.toughness, printedToughness, `${entry.raw.name}/${role}: your-turn toughness expires`);
      for (const keyword of operation.keywords || []) assert.equal(source.kw(keyword), false,
        `${entry.raw.name}/${role}: your-turn ${keyword} expires`);
    }
    return 1;
  }

  const target = permanent(MTG, game, a, semanticSubtypeFixture(operation));
  const hostile = permanent(MTG, game, b, semanticSubtypeFixture(operation));
  const requiredSubtypes = semanticStaticSubtypes(operation);
  const partialSubtypeFixtures = (requiredSubtypes.length > 1 ? requiredSubtypes : []).map(subtype =>
    permanent(MTG, game, a, fixtureDefinition(`Oracle Partial Static ${subtype}`, ['Creature'], {
      subtypes: [subtype], colorsOverride: [],
    })));
  const lower = String(operation.subtype || '').toLowerCase();
  if (lower === 'attacking') target.attacking = b;
  if (lower === 'tapped') target.tapped = true;
  if (lower === 'untapped') target.tapped = false;
  if (lower === 'enchanted') {
    const aura = permanent(MTG, game, a, fixtureDefinition('Oracle Static Aura', ['Enchantment'], {
      subtypes: ['Aura'], enchant: 'creature',
    }));
    await game.attach(aura, target);
  }
  game.recalc();
  assert.equal(target.power, 20000 + Number(operation.power || 0),
    `${entry.raw.name}/${role}: semantic subtype/scope power`);
  assert.equal(target.toughness, 20000 + Number(operation.toughness || 0),
    `${entry.raw.name}/${role}: semantic subtype/scope toughness`);
  for (const keyword of operation.keywords || []) assert.equal(target.kw(keyword), true,
    `${entry.raw.name}/${role}: semantic subtype/scope grants ${keyword}`);
  assert.equal(hostile.power, 20000, `${entry.raw.name}/${role}: opponent is excluded by your-creatures scope`);
  assert.equal(hostile.toughness, 20000, `${entry.raw.name}/${role}: opponent toughness is excluded`);
  if (requiredSubtypes.length > 1) {
    for (const partial of partialSubtypeFixtures) {
      assert.equal(partial.power, 20000, `${entry.raw.name}/${role}: one matching subtype alone does not receive the power bonus`);
      assert.equal(partial.toughness, 20000, `${entry.raw.name}/${role}: one matching subtype alone does not receive the toughness bonus`);
      for (const keyword of operation.keywords || []) assert.equal(partial.kw(keyword), false,
        `${entry.raw.name}/${role}: one matching subtype alone does not receive ${keyword}`);
    }
  }
  if (operation.scope === 'your-other-creatures' && source.is('Creature')) {
    assert.equal(source.power, Number(entry.raw.power) || 0, `${entry.raw.name}/${role}: source excluded from other-creatures`);
  }
  return 1;
}

async function conditionalEntryProof(MTG, entry, operation, role) {
  const run = async branch => {
    const humanTrace = [];
    const controller = recordingDecision(humanTrace, {
      chooseOption: (game, query) => branch === 'untapped'
        ? (query.options.find(option => option.key === 'pay')?.key || query.options[0]?.key)
        : (query.options.find(option => option.key === 'tapped')?.key || query.options.at(-1)?.key),
    });
    const context = gameFor(MTG, [controller, decision()], { ai: role === 'ai' });
    const { game, a, b } = context;
    assertControllerRole(MTG, context, `${entry.raw.name}/${role}/conditional-entry/${branch}`);
    if (operation.condition === 'other-land-count') {
      const passCount = operation.comparison === 'more' ? operation.threshold : operation.threshold;
      const failCount = operation.comparison === 'more' ? Math.max(0, operation.threshold - 1) : operation.threshold + 1;
      const count = branch === 'untapped' ? passCount : failCount;
      for (let index = 0; index < count; index++) permanent(MTG, game, a, 'Forest');
    } else if (operation.condition === 'life-at-most') {
      if (branch === 'untapped') (operation.anyPlayer ? b : a).life = operation.threshold;
      else for (const player of game.players) player.life = operation.threshold + 10;
    } else if (operation.condition === 'opponents-at-least') {
      if (branch === 'untapped') {
        while (a.opponents(game).length < operation.threshold) game.addPlayer(`Oracle crowd ${game.players.length}`, {}, decision(), true);
      } else {
        assert.ok(a.opponents(game).length < operation.threshold || operation.threshold <= 1,
          `${entry.raw.name}/${role}: staged failing opponent threshold`);
      }
    } else if (operation.condition === 'pay-life') {
      if (role === 'ai') {
        zoneCard(MTG, a, 'Sol Ring', 'hand');
        a.life = branch === 'untapped' ? 40 : 8;
      }
    }
    const lifeBefore = a.life;
    const card = zoneCard(MTG, a, entry.raw.name, 'hand');
    assert.equal(await game.playLand(a, card), true, `${entry.raw.name}/${role}: real conditional land play`);
    assert.equal(card.tapped, branch === 'tapped', `${entry.raw.name}/${role}: ${branch} replacement branch`);
    if (operation.condition === 'pay-life') {
      const expectedLife = branch === 'untapped' ? lifeBefore - operation.life : lifeBefore;
      assert.equal(a.life, expectedLife, `${entry.raw.name}/${role}: pay-life branch accounting`);
      const trace = role === 'ai' ? context.aiTrace : humanTrace.map(item => item.query);
      assert.ok(trace.some(query => query.aiHint?.kind === 'payLifeForUntappedLand'),
        `${entry.raw.name}/${role}: replacement choice reaches the controller`);
    }
  };
  await run('untapped');
  await run('tapped');
  return 2;
}

async function fireGenericEvent(MTG,context,source,operation){
  const {game,a,b}=context,event=operation.event,filter=operation.eventFilter;
  if(['etb','dies'].includes(event)){
    if(['self','self-card',undefined].includes(filter)){
      if(event==='dies')await game.move(source,'graveyard');
      else await game.emit('etb',{card:source,player:a});
    }else{
      const visitor=new MTG.CardInst(fixtureDefinition('V5 event visitor',['Creature'],{power:'2',toughness:'20',subtypes:[filter?.subtype||'Bear']}),a);
      context.eventCardStats={power:visitor.power,toughness:visitor.toughness};
      visitor.zone='nowhere';await game.move(visitor,'battlefield',{ctrl:a});if(event==='dies')await game.move(visitor,'graveyard');
    }
  }else if(['cast','castIS','castNonCreature','castCreature'].includes(event)){
    const what=filter?.what||'';
    const type=event==='castCreature'?'Creature':['artifact','enchantment'].includes(what)?what[0].toUpperCase()+what.slice(1):'Instant';
    const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
    const def=fixtureDefinition('V5 cast event probe',[type],{cost:'{0}',subtypes:filter?.subtypes||[what],colorsOverride:colors[what]?[colors[what]]:what==='multicolored'?['G','W']:[],
      ...(filter==='your-spell-targets-self'?{targets:[{what:'creature',filter:(g,c)=>c===source}],resolve:async()=>{}}:{})});
    const spell=new MTG.CardInst(def,a);spell.zone='hand';a.hand.push(spell);
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true,'real cast event probe');
  }else if(event==='draw'){await game.draw(a,filter==='your-second-draw'?2:1,source);}
  else if(event==='discarded'){const card=zoneCard(MTG,a,'Forest','hand');await game.discard(a,[card]);}
  else if(event==='targeted')await game.emit('targeted',{card:source,source:null,player:a});
  else if(event==='dealtDamage')await game.emit(event,{src:source,target:permanent(MTG,game,b,fixtureDefinition('V5 damage recipient',['Creature'])),n:2});
  else if(event==='damageToPlayer')await game.emit(event,{src:source,player:b,n:2,combat:false});
  else if(event==='combatDamageToPlayer')await game.emit(event,{card:source,player:b,n:2,step:'normal'});
  else if(event==='landfall'){const card=new MTG.CardInst(MTG.DEFS.Forest,a);card.zone='nowhere';await game.move(card,'battlefield',{ctrl:a});}
  else if(event==='lifeGain')await game.gainLife(a,1,source);
  else if(['upkeep','endStep','beginCombat','drawStep'].includes(event))await game.emit(event,{player:a});
  else if(event==='attacks'){source.attacking=b;await game.emit(event,{card:source,player:a,defender:b});}
  else if(event==='turnedFaceUp')await game.emit(event,{card:source,player:a});
  else if(event==='becameTapped')game.tap(source);
  else if(event==='blocks'){const attacker=permanent(MTG,game,b,fixtureDefinition('V5 attacker',['Creature']));source.blocking=attacker.iid;await game.emit(event,{attacker,blocker:source});}
  else if(event==='becomesBlocked'){const blocker=permanent(MTG,game,b,fixtureDefinition('V5 blocker',['Creature']));source.attacking=b;await game.emit(event,{attacker:source,blockers:[blocker]});}
  else assert.fail('Missing V5 event driver '+event);
}

async function genericRuntimeOperationProof(MTG, entry, operation, role) {
  if(Array.isArray(operation.event)){
    let checks=0;for(const event of operation.event)checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,event,originalOperation:operation},role);return checks;
  }
  if(operation.v4Body)return spellV4RuntimeOperationProof(MTG,entry,operation.v4Body,role,operation);
  if (operation.kind === 'generic-static') return genericStaticProof(MTG, entry, operation, role);
  if (operation.kind === 'conditional-enters-tapped') return conditionalEntryProof(MTG, entry, operation, role);

  const humanTrace = [];
  let wantedTargets = [];
  let wantedCards = [];
  let targetQueryIndex=0;
  const controller = recordingDecision(humanTrace, {
    chooseTargets: (game, query) => {
      if (query.spec?.what === 'proliferate') return query.candidates.filter(target =>
        target instanceof MTG.CardInst && target.ctrl === game.players[0] &&
        Object.keys(target.counters).some(counter => !counter.startsWith('-')));
      const min = query.min || 0;
      const max = query.max ?? query.count ?? Math.max(1, min);
      const preferred=wantedTargets[targetQueryIndex++];
      const chosen = [preferred,...wantedTargets.filter(target=>target!==preferred)].filter(target => query.candidates.includes(target)).slice(0, max);
      for (const candidate of query.candidates) {
        if (chosen.length >= max) break;
        if (!chosen.includes(candidate)) chosen.push(candidate);
      }
      return chosen.length >= min ? chosen : [];
    },
    chooseCards: (game, query) => {
      const min = query.min || 0;
      const max = query.max ?? Math.max(1, min);
      const chosen = wantedCards.filter(card => query.from.includes(card)).slice(0, max);
      for (const card of query.from) {
        if (chosen.length >= max) break;
        if (!chosen.includes(card)) chosen.push(card);
      }
      return chosen.length >= min ? chosen : [];
    },
    chooseOption: (game, query) => query.options.find(option =>
      ['yes', 'pay', 'counter', 'top'].includes(option.key))?.key || query.options[0]?.key,
    chooseX: (game, query) => Math.min(3, query.max ?? 3),
    scry: (game, query) => ({ top: query.cards.slice(1), bottom: query.cards.slice(0, 1) }),
  });
  const context = gameFor(MTG, [controller, decision()], { ai: role === 'ai' });
  const { game, a, b } = context;
  assertControllerRole(MTG, context, `${entry.raw.name}/${role}/${operation.kind}`);
  fillLibrary(MTG, a, 60);
  fillLibrary(MTG, b, 60);
  for (let index = 0; index < 12; index++) {
    zoneCard(MTG, a, 'Forest', 'hand');
    zoneCard(MTG, b, 'Forest', 'hand');
  }
  fund(a, 100);
  fund(b, 100);
  for(const name of ['Grizzly Bears','Sol Ring','Doom Blade','Rancor'])zoneCard(MTG,b,name,'hand');

  if (operation.kind === 'enters-with-counters') {
    const source = zoneCard(MTG, a, entry.raw.name, 'hand');
    const xVal = operation.n === 'X' ? 3 : 0;
    assert.equal(await game.castSpell(a, source, operation.n === 'X'
      ? { from: 'hand', xVal } : { from: 'hand', alt: { free: true } }), true,
    `${entry.raw.name}/${role}: counter-bearing permanent uses real cast`);
    await resolveAll(game);
    assert.equal(source.zone, 'battlefield', `${entry.raw.name}/${role}: counter-bearing permanent resolves`);
    assert.equal(source.counters[operation.counter] || 0, effectAmount(operation.n),
      `${entry.raw.name}/${role}: exact entry counter count`);
    return 1;
  }

  assert.ok(['generic-trigger','generic-ability','spell-generic'].includes(operation.kind),
    `${entry.raw.name}: known generic runtime operation`);
  const stagedTargets = (operation.targets || []).map((target, index) => stageGenericTarget(MTG, context, target, index,
    (operation.effects || []).find(effect => effect.target === index)));
  wantedTargets = stagedTargets.slice();
  const stageEffect=effect=>{
    if(effect.n?.kind==='count')stageCount(MTG,context,effect.n,v5Helpers());
    if(['search-library','put-from-hand','look-select'].includes(effect.action)){
      const what=effect.what;
      const type=what==='basic land'?'Land':what.split(' or ')[0];
      const cardType=['creature','artifact','land','enchantment','instant','sorcery','permanent','card','nonland permanent'].includes(type.toLowerCase())?(type==='card'||type.includes('permanent')?'Creature':type[0].toUpperCase()+type.slice(1).toLowerCase()):'Creature';
      for(let i=0;i<Math.max(3,Number(effect.n)||1);i++){
        const card=new MTG.CardInst(fixtureDefinition('Oracle Searched '+i,[cardType],{cost:'{0}',power:'4',toughness:'20',super:what==='basic land'?['Basic']:[],subtypes:[type.replace(/ permanent$/,'')]}),a);
        card.zone=effect.action==='put-from-hand'?'hand':'library';a[card.zone].push(card);
      }
    }
    for(const child of effect.effects||[])stageEffect(child);
  };
  for(const effect of operation.effects||[])stageEffect(effect);
  const groupCreature = permanent(MTG, game, a, fixtureDefinition('Oracle Generic Group Creature', ['Creature'], {
    power: '20000', toughness: '20000',
  }));
  const hostileGroupCreature=permanent(MTG,game,b,fixtureDefinition('Oracle Hostile Group Creature',['Creature'],{power:'20000',toughness:'20000'}));
  groupCreature.attacking = b;
  const proliferateSubject = groupCreature;
  game.addCounters(proliferateSubject, '+1/+1', 1, false, a);
  const sacrificeFixtures = [];
  const cost = operation.cost || {};
  if (cost.sacCreature || cost.sacOther) {
    const fodder = permanent(MTG, game, a, fixtureDefinition('Oracle Sacrifice Creature', ['Creature'], {
      power: '0', toughness: '1',
    }));
    fodder.isToken = true;
    sacrificeFixtures.push(fodder);
  }
  if (cost.sacWhat) {
    const type = cost.sacWhat.charAt(0).toUpperCase() + cost.sacWhat.slice(1);
    sacrificeFixtures.push(permanent(MTG, game, a, fixtureDefinition(`Oracle Sacrifice ${type}`, [type])));
  }
  wantedCards = sacrificeFixtures.slice();
  if (cost.discard) {
    wantedCards.push(...a.hand.filter(card => card.name === 'Forest').slice(0, cost.discard));
  }
  const trackedCards = [...stagedTargets.filter(target => target instanceof MTG.CardInst), groupCreature,hostileGroupCreature,
    ...sacrificeFixtures];
  const trace = role === 'ai' ? context.aiDecisions : humanTrace;
  let source;
  let selectedTargets = stagedTargets.slice();
  let damagedPlayer = b;
  let before;
  let operationRun = null;
  const stackTargets = object => {
    const expectedKind = operation.kind === 'generic-ability' ? 'ability' : 'trigger';
    if (!operationRun && expectedKind === 'trigger' && source) {
      const genericOperations = (entry.implementation || []).filter(candidate => candidate.kind === 'generic-trigger');
      const descriptions = new Set(genericOperations.map(candidate => candidate.desc || 'Oracle effect'));
      const definitions = (source.def.triggers || []).filter(trigger => descriptions.has(trigger.desc));
      const ordinal=genericOperations.indexOf(operation.originalOperation||operation);
      const offset=genericOperations.slice(0,ordinal).reduce((sum,op)=>sum+(Array.isArray(op.event)?op.event.length:1),0);
      const eventOffset=operation.originalOperation?.event.indexOf(operation.event)||0;
      operationRun = definitions[offset+eventOffset]?.run || null;
    }
    if (object && object.kind === expectedKind && object.srcCard === source &&
        (!operationRun || object.run === operationRun) && Array.isArray(object.targets)) {
      selectedTargets = object.targets.slice();
    }
  };

  if(operation.kind==='spell-generic'){
    source=zoneCard(MTG,a,entry.raw.name,'hand');trackedCards.push(source);
    before=genericProofSnapshot(context,trackedCards);
    assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true,`${entry.raw.name}/${role}: paid generic spell cast`);
    before.players.set(a,playerState(a));
    const object=game.stack.find(row=>row.kind==='spell'&&row.card===source);assert.ok(object,`${entry.raw.name}/${role}: actual spell Stack`);
    selectedTargets=object.targets.slice();await settleWithStackWitness(game,()=>{});
  }else if (operation.kind === 'generic-ability') {
    const entryCounters = (entry.implementation || []).find(candidate => candidate.kind === 'enters-with-counters');
    if (entryCounters) {
      source = zoneCard(MTG, a, entry.raw.name, 'hand');
      assert.equal(await game.castSpell(a, source, entryCounters.n === 'X'
        ? { from: 'hand', xVal: 3 } : { from: 'hand', alt: { free: true } }), true,
      `${entry.raw.name}/${role}: counter-paying ability source enters through the real Stack`);
      await resolveAll(game);
      assert.equal(source.zone, 'battlefield', `${entry.raw.name}/${role}: ability source enters with its counters`);
    } else source = permanent(MTG, game, a, entry.raw.name);
    if(cost.rmCounter && (source.counters[cost.rmCounter.kind]||0)<cost.rmCounter.n)game.addCounters(source,cost.rmCounter.kind,cost.rmCounter.n,false,a);
    trackedCards.push(source);
    before = genericProofSnapshot(context, trackedCards);
    const ordinal = (entry.implementation || []).filter(candidate => candidate.kind === 'generic-ability')
      .indexOf(operation);
    const compiled = (source.def.abilities || []).filter(ability => ability.label === 'Oracle ability')[ordinal];
    assert.ok(compiled, `${entry.raw.name}/${role}: compiled generic ability ${ordinal + 1}`);
    operationRun = compiled.run;
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.ability === compiled);
    assert.ok(action, `${entry.raw.name}/${role}: generic ability is genuinely activatable`);
    const beforePayment = before;
    const manaBefore = poolTotal(a);
    const tappedCosts = [];
    const originalTap = game.tap;
    game.tap = function (card, ...args) {
      const result = originalTap.call(this, card, ...args);
      if (result && card.tapped) tappedCosts.push(card);
      return result;
    };
    try {
      assert.equal(await game.activateAbility(a, action), true, `${entry.raw.name}/${role}: real ability activation`);
    } finally {
      game.tap = originalTap;
    }
    if (cost.tap) assert.ok(tappedCosts.includes(source), `${entry.raw.name}/${role}: tap cost changes state before sacrifice can reset it`);
    if (cost.sacSelf) assert.equal(source.zone, 'graveyard', `${entry.raw.name}/${role}: source sacrifice is paid`);
    if (cost.life) assert.equal(a.life, beforePayment.players.get(a).life - cost.life,
      `${entry.raw.name}/${role}: exact life cost is paid before resolution`);
    if (cost.rmCounter) assert.equal(source.counters[cost.rmCounter.kind] || 0,
      (beforePayment.cards.get(source).counters[cost.rmCounter.kind] || 0) - cost.rmCounter.n,
    `${entry.raw.name}/${role}: exact counter cost is removed before resolution`);
    if (cost.sacCreature || cost.sacOther || cost.sacWhat) {
      assert.ok(beforePayment.battlefield.some(card => !game.battlefield.includes(card)),
        `${entry.raw.name}/${role}: sacrifice cost removes a chosen permanent before resolution`);
    }
    if (cost.discard) assert.ok(a.graveyard.filter(card => beforePayment.players.get(a).handCards.includes(card)).length >= cost.discard,
      `${entry.raw.name}/${role}: discard cost moves selected hand cards before resolution`);
    if (cost.mana && cost.mana !== '{0}') assert.ok(poolTotal(a) < manaBefore,
      `${entry.raw.name}/${role}: mana cost is spent before resolution`);
    const abilityObject = game.stack.find(object => object.kind === 'ability' &&
      object.srcCard === source && object.run === compiled.run);
    assert.ok(abilityObject, `${entry.raw.name}/${role}: activated ability uses Stack even when payment creates triggers`);
    stackTargets(abilityObject);
    before = genericProofSnapshot(context, trackedCards);
    await settleWithStackWitness(game, stackTargets);
  } else {
    const event = operation.event;
    if (event === 'etb' && ['self','self-card',undefined].includes(operation.eventFilter)) {
      before = genericProofSnapshot(context, trackedCards);
      source = zoneCard(MTG, a, entry.raw.name, 'hand');
      stageCondition(MTG,context,operation.condition,source,v5Helpers());
      trackedCards.push(source);
      if (entry.raw.types.includes('Land')) assert.equal(await game.playLand(a, source), true);
      else {
        assert.equal(await game.castSpell(a, source, { from: 'hand', alt: { free: true } }), true,
          `${entry.raw.name}/${role}: ETB source uses real Stack`);
        await game.resolveTop();
      }
    } else {
      source = permanent(MTG, game, a, entry.raw.name);
      stageCondition(MTG,context,operation.condition,source,v5Helpers());
      trackedCards.push(source);
      before = genericProofSnapshot(context, trackedCards);
      if (typeof operation.eventFilter==='object'||['any-creature','another-creature','your-creature','your-spell-targets-self','your-second-draw'].includes(operation.eventFilter)||['drawStep','targeted','discarded','dealtDamage','castCreature'].includes(event)) {
        await fireGenericEvent(MTG,context,source,operation);
      }else if (operation.eventFilter === 'another-your-creature') {
        const visitor = new MTG.CardInst(fixtureDefinition('Oracle Friendly Visitor', ['Creature']), a);
        context.eventCardStats={power:visitor.power,toughness:visitor.toughness};
        visitor.zone = 'nowhere';
        await game.move(visitor, 'battlefield', { ctrl: a });
        if (event === 'dies') await game.destroy(visitor);
      } else if (operation.eventFilter === 'another-your-artifact') {
        const visitor = new MTG.CardInst(fixtureDefinition('Oracle Artifact Visitor', ['Artifact']), a);
        visitor.zone = 'nowhere';
        await game.move(visitor, 'battlefield', { ctrl: a });
      } else if (event === 'dies') await game.sacrifice(a,source);
      else if (event === 'attacks') {
        source.attacking = b;
        await game.emit('attacks', { card: source, player: a, defender: b });
      } else if (event === 'blocks') {
        const attacker = permanent(MTG, game, b, fixtureDefinition('Oracle Generic Attacker', ['Creature']));
        source.blocking = attacker.iid;
        await game.emit('blocks', { attacker, blocker: source });
      } else if (event === 'becomesBlocked') {
        const blocker = permanent(MTG, game, b, fixtureDefinition('Oracle Generic Blocker', ['Creature']));
        source.attacking = b;
        source.blockedBy = [blocker.iid];
        await game.emit('becomesBlocked', { attacker: source, blockers: [blocker] });
      } else if (event === 'combatDamageToPlayer') {
        await game.emit(event, { card: source, player: damagedPlayer, n: 2, step: 'normal' });
      } else if (event === 'damageToPlayer') {
        await game.emit(event, { src: source, player: damagedPlayer, n: 2, combat: true });
      } else if (event === 'upkeep' || event === 'endStep' || event === 'beginCombat') {
        await game.emit(event, { player: a });
      } else if (event === 'lifeGain') {
        await game.gainLife(a, 1, source);
      } else if (event === 'landfall') {
        const land = new MTG.CardInst(MTG.DEFS.Forest, a);
        land.zone = 'nowhere';
        await game.move(land, 'battlefield', { ctrl: a });
      } else if (event === 'castIS' || event === 'castNonCreature' || event === 'cast') {
        const spell = new MTG.CardInst(fixtureDefinition('Oracle Generic Cast Probe', ['Instant'], { cost: '{0}' }), a);
        spell.zone = 'hand';
        a.hand.push(spell);
        assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
      } else if (event === 'draw') {
        await game.draw(a, 1, source);
      } else if (event === 'becameTapped') {
        game.tap(source);
      } else if (event === 'turnedFaceUp') {
        await game.emit(event, { card: source, player: a });
      } else if (!['another-your-creature', 'another-your-artifact'].includes(operation.eventFilter)) {
        assert.fail(`${entry.raw.name}: no trigger event driver for ${event}`);
      }
    }
    await settleWithStackWitness(game, stackTargets);
  }

  assert.ok(source, `${entry.raw.name}/${role}: source exists`);
  if (!before.cards.has(source)) before.cards.set(source, {
    zone: 'nowhere', tapped: false, power: Number(entry.raw.power) || 0,
    toughness: Number(entry.raw.toughness) || 0, counters: {},
  });
  for (const target of selectedTargets) {
    if (target instanceof MTG.CardInst && !before.cards.has(target)) before.cards.set(target, cardState(target));
  }
  for (let index = 0; index < (operation.effects || []).length; index++) {
    await assertGenericEffectEvidence(MTG, context, entry, operation.effects[index], source, selectedTargets,
      damagedPlayer, before, trace, `${entry.raw.name}/${role}/${operation.kind}/effect-${index + 1}`);
  }
  if (role === 'ai' && (operation.targets || []).length) {
    assert.ok(context.aiTrace.some(query => query.type === 'chooseTargets'),
      `${entry.raw.name}/${role}: genuine local AI receives the target decision`);
  }
  return Math.max(1, (operation.effects || []).length);
}

async function mechanicRuntimeOperationProof(MTG, entry, operation, role) {
  const humanTrace = [];
  let attackSource = null;
  let desiredEntryChoice = null;
  const controller = recordingDecision(humanTrace, {
    chooseOption: (game, query) => {
      if (desiredEntryChoice && ['riot', 'unleash'].includes(query.aiHint?.kind)) return desiredEntryChoice;
      return query.options.find(option => ['yes', 'counter', 'pay'].includes(option.key))?.key || query.options[0]?.key;
    },
    chooseCards: (game, query) => query.from.slice(0, query.max ?? query.min ?? 1),
    chooseTargets: (game, query) => query.candidates.slice(0, query.min || 1),
    attackers: (game) => attackSource ? [{ card: attackSource, target: game.players[1] }] : [],
  });
  const context = gameFor(MTG, [controller, decision()], { ai: role === 'ai' });
  const { game, a, b } = context;
  const kind = operation.kind;
  assertControllerRole(MTG, context, `${entry.raw.name}/${role}/${kind}`);
  fillLibrary(MTG, a, 30);
  fillLibrary(MTG, b, 30);
  fund(a, 100);

  const enterSource = async () => {
    const card = zoneCard(MTG, a, entry.raw.name, 'hand');
    assert.equal(await game.castSpell(a, card, { from: 'hand', alt: { free: true } }), true,
      `${entry.raw.name}/${role}: mechanic source casts`);
    await resolveAll(game);
    assert.equal(card.zone, 'battlefield', `${entry.raw.name}/${role}: mechanic source resolves`);
    return card;
  };

  if (kind === 'mechanic-infect') {
    const source = permanent(MTG, game, a, entry.raw.name);
    const victim = permanent(MTG, game, b, fixtureDefinition('Oracle Infect Victim', ['Creature'], {
      power: '20', toughness: '20',
    }));
    const life = b.life;
    await game.damagePlayer(source, b, 2, { combat: true });
    assert.equal(b.life, life, `${entry.raw.name}/${role}: infect replaces player life loss`);
    assert.equal(b.poison, 2, `${entry.raw.name}/${role}: infect gives poison`);
    await game.damageCreature(source, victim, 2);
    assert.equal(victim.damage, 0, `${entry.raw.name}/${role}: infect replaces marked creature damage`);
    assert.equal(victim.counters['-1/-1'], 2, `${entry.raw.name}/${role}: infect adds -1/-1 counters`);
    return 2;
  }

  if (kind === 'mechanic-myriad') {
    const third = game.addPlayer('Oracle C', { name: 'Oracle C' }, decision(), true);
    const source = permanent(MTG, game, a, entry.raw.name);
    game.addCounters(source, '+1/+1', 20, false, a);
    source.sick = false;
    attackSource = source;
    let copiesObserved = 0;
    game.priorityRound = async () => {
      copiesObserved = Math.max(copiesObserved, game.battlefield.filter(card =>
        card.isToken && card.name === source.name && card.attacking && card.attacking !== source.attacking).length);
    };
    await game.combatPhase(a);
    assert.ok(copiesObserved >= 1, `${entry.raw.name}/${role}: myriad creates an attacking copy for the other opponent`);
    assert.equal(game.battlefield.some(card => card.isToken && card.name === source.name), false,
      `${entry.raw.name}/${role}: myriad copies are exiled at end of combat`);
    if (role === 'ai') assert.ok(context.aiTrace.some(query => query.aiHint?.kind === 'myriadCopy'),
      `${entry.raw.name}/${role}: local AI receives myriad choice`);
    return 2;
  }

  if (kind === 'mechanic-exalted') {
    const support = permanent(MTG, game, a, entry.raw.name);
    const attacker = permanent(MTG, game, a, fixtureDefinition('Oracle Exalted Attacker', ['Creature'], {
      power: '20', toughness: '20',
    }));
    attacker.attacking = b;
    const before = attacker.power;
    await game.emit('attackersDeclared', { player: a, attackers: [attacker] });
    await resolveAll(game);
    assert.equal(attacker.power, before + 1, `${entry.raw.name}/${role}: exalted pumps the sole attacker`);
    assert.equal(support.zone, 'battlefield');
    return 1;
  }

  if (kind === 'mechanic-flanking') {
    const source = permanent(MTG, game, a, entry.raw.name);
    const blocker = permanent(MTG, game, b, fixtureDefinition('Oracle Flanking Blocker', ['Creature'], {
      power: '20', toughness: '20',
    }));
    await game.emit('blocks', { attacker: source, blocker });
    await resolveAll(game);
    assert.equal(blocker.power, 19, `${entry.raw.name}/${role}: flanking power penalty`);
    assert.equal(blocker.toughness, 19, `${entry.raw.name}/${role}: flanking toughness penalty`);
    return 1;
  }

  if (kind === 'mechanic-battle-cry') {
    const source = permanent(MTG, game, a, entry.raw.name);
    const ally = permanent(MTG, game, a, fixtureDefinition('Oracle Battle Cry Ally', ['Creature'], {
      power: '20', toughness: '20',
    }));
    source.attacking = b;
    ally.attacking = b;
    await game.emit('attacks', { card: source, player: a, defender: b });
    await resolveAll(game);
    assert.equal(ally.power, 21, `${entry.raw.name}/${role}: battle cry pumps another attacker`);
    return 1;
  }

  if (kind === 'mechanic-mentor') {
    const source = permanent(MTG, game, a, entry.raw.name);
    game.addCounters(source, '+1/+1', 20, false, a);
    const trainee = permanent(MTG, game, a, fixtureDefinition('Oracle Mentor Trainee', ['Creature'], {
      power: '1', toughness: '20',
    }));
    source.attacking = b;
    trainee.attacking = b;
    await game.emit('attacks', { card: source, player: a, defender: b });
    await resolveAll(game);
    assert.equal(trainee.counters['+1/+1'], 1, `${entry.raw.name}/${role}: mentor counter`);
    return 1;
  }

  if (kind === 'mechanic-training') {
    const source = permanent(MTG, game, a, entry.raw.name);
    const stronger = permanent(MTG, game, a, fixtureDefinition('Oracle Training Partner', ['Creature'], {
      power: String(Math.max(20, source.power + 5)), toughness: '20',
    }));
    source.attacking = b;
    stronger.attacking = b;
    await game.emit('attackersDeclared', { player: a, attackers: [source, stronger] });
    await resolveAll(game);
    assert.equal(source.counters['+1/+1'], 1, `${entry.raw.name}/${role}: training counter`);
    return 1;
  }

  if (kind === 'mechanic-riot' || kind === 'mechanic-unleash') {
    const hintKind = kind.slice('mechanic-'.length);
    const scenarios = role === 'human'
      ? ['counter', kind === 'mechanic-riot' ? 'haste' : 'none']
      : (kind === 'mechanic-riot' ? ['main1', 'main2'] : [null]);
    for (const scenario of scenarios) {
      desiredEntryChoice = role === 'human' ? scenario : null;
      game.phase = role === 'ai' && scenario === 'main2' ? 'main2' : 'main1';
      const decisions = role === 'ai' ? context.aiDecisions : humanTrace;
      const traceStart = decisions.length;
      const source = await enterSource();
      const choice = decisions.slice(traceStart).find(item => item.query.aiHint?.kind === hintKind);
      assert.ok(choice, `${entry.raw.name}/${role}: entry choice reaches controller`);
      if (role === 'human') assert.equal(choice.result, scenario,
        `${entry.raw.name}/${role}: exact requested entry branch`);
      if (kind === 'mechanic-riot') {
        assert.ok(['counter', 'haste'].includes(choice.result), `${entry.raw.name}/${role}: legal Riot choice`);
        assert.equal(source.meta.oracleRiotChoice, choice.result, `${entry.raw.name}/${role}: Riot choice persists`);
        const baseCounters=entry.implementation.filter(op=>op.kind==='mechanic-modular').reduce((sum,op)=>sum+op.n,0);
        assert.equal(source.counters['+1/+1'] || 0, baseCounters+(choice.result === 'counter' ? 1 : 0),
          `${entry.raw.name}/${role}: exact Riot counter branch`);
        if (choice.result === 'haste') assert.equal(source.kw('haste'), true,
          `${entry.raw.name}/${role}: haste Riot branch grants the keyword`);
      } else {
        assert.ok(['counter', 'none'].includes(choice.result), `${entry.raw.name}/${role}: legal Unleash choice`);
        assert.equal(source.counters['+1/+1'] || 0, choice.result === 'counter' ? 1 : 0,
          `${entry.raw.name}/${role}: exact Unleash counter branch`);
        assert.equal(!!source.cur.cantBlock, choice.result === 'counter',
          `${entry.raw.name}/${role}: Unleash branch changes blocking restriction`);
      }
    }
    return scenarios.length * 2;
  }

  if (kind === 'mechanic-evolve') {
    const source = permanent(MTG, game, a, entry.raw.name);
    const larger = new MTG.CardInst(fixtureDefinition('Oracle Evolve Visitor', ['Creature'], {
      power: String(Math.max(20, source.power + 5)), toughness: String(Math.max(20, source.toughness + 5)),
    }), a);
    larger.zone = 'nowhere';
    await game.move(larger, 'battlefield', { ctrl: a });
    await resolveAll(game);
    assert.equal(source.counters['+1/+1'], 1, `${entry.raw.name}/${role}: evolve counter`);
    return 1;
  }

  if (kind === 'mechanic-extort') {
    const source = permanent(MTG, game, a, entry.raw.name);
    a.pool.W = 1;
    const lifeA = a.life;
    const lifeB = b.life;
    const spell = new MTG.CardInst(fixtureDefinition('Oracle Extort Probe', ['Instant'], { cost: '{0}' }), a);
    spell.zone = 'hand';
    a.hand.push(spell);
    assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
    await resolveAll(game);
    assert.equal(b.life, lifeB - 1, `${entry.raw.name}/${role}: extort drains opponent`);
    assert.equal(a.life, lifeA + 1, `${entry.raw.name}/${role}: extort gains drained life`);
    assert.equal(source.zone, 'battlefield', `${entry.raw.name}/${role}: extort source remains on battlefield`);
    return 1;
  }

  if (kind === 'mechanic-afterlife') {
    const source = permanent(MTG, game, a, entry.raw.name);
    const before = game.battlefield.filter(card => card.isToken && card.hasSub('Spirit')).length;
    await game.destroy(source);
    await resolveAll(game);
    const made = game.battlefield.filter(card => card.isToken && card.hasSub('Spirit')).slice(before);
    assert.equal(made.length, operation.n, `${entry.raw.name}/${role}: exact Afterlife token count`);
    assert.ok(made.every(card => card.kw('flying') && card.colors.includes('W') && card.colors.includes('B')),
      `${entry.raw.name}/${role}: Afterlife token characteristics`);
    return 1;
  }

  if (kind === 'mechanic-bushido') {
    const source = permanent(MTG, game, a, entry.raw.name);
    const attacker = permanent(MTG, game, b, fixtureDefinition('Oracle Bushido Attacker', ['Creature']));
    source.blocking = attacker.iid;
    const beforePower = source.power;
    const beforeToughness = source.toughness;
    await game.emit('blocks', { attacker, blocker: source });
    await resolveAll(game);
    assert.equal(source.power, beforePower + operation.n, `${entry.raw.name}/${role}: Bushido power`);
    assert.equal(source.toughness, beforeToughness + operation.n, `${entry.raw.name}/${role}: Bushido toughness`);
    return 1;
  }

  if (kind === 'mechanic-renown' || kind === 'mechanic-toxic') {
    const source = permanent(MTG, game, a, entry.raw.name);
    const beforePoison = b.poison || 0;
    if (kind === 'mechanic-toxic') {
      await game.damagePlayer(source, b, 2, { combat: true });
      assert.equal(b.poison, beforePoison + operation.n,
        `${entry.raw.name}/${role}: Toxic gives poison immediately with combat damage`);
      assert.equal(game.pendingTriggers.some(trigger => /Toxic/.test(trigger.name || trigger.desc || '')), false,
        `${entry.raw.name}/${role}: Toxic does not create a pending triggered ability`);
      assert.equal(game.stack.some(object => object.kind === 'trigger' && /Toxic/.test(object.name)), false,
        `${entry.raw.name}/${role}: Toxic never uses the Stack`);
      return 1;
    }
    await game.emit('combatDamageToPlayer', { card: source, player: b, n: 2 });
    await resolveAll(game);
    assert.equal(source.counters['+1/+1'], operation.n, `${entry.raw.name}/${role}: Renown counters`);
    assert.equal(source.meta.renowned, true, `${entry.raw.name}/${role}: renowned marker`);
    return 1;
  }

  if (kind === 'mechanic-bloodthirst') {
    const damageSource = permanent(MTG, game, a, fixtureDefinition('Oracle Bloodthirst Damage', ['Creature']));
    await game.damagePlayer(damageSource, b, 1);
    const source = await enterSource();
    assert.equal(source.counters['+1/+1'], operation.n, `${entry.raw.name}/${role}: Bloodthirst counters`);
    return 1;
  }

  if (kind === 'mechanic-typecycling') {
    const source = zoneCard(MTG, a, entry.raw.name, 'hand');
    a.library.splice(0);
    const basic = /^basic land$/i.test(operation.subtype);
    const foundDef = basic
      ? fixtureDefinition('Oracle Basic Cycling Target', ['Land'], { super: ['Basic'], subtypes: ['Forest'] })
      : fixtureDefinition(`Oracle ${operation.subtype} Cycling Target`, ['Land'], { subtypes: [operation.subtype] });
    const found = new MTG.CardInst(foundDef, a);
    found.zone = 'library';
    a.library.push(found);
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.cycling);
    assert.ok(action, `${entry.raw.name}/${role}: typecycling action offered`);
    assert.equal(await game.activateAbility(a, action), true, `${entry.raw.name}/${role}: typecycling activates`);
    await resolveAll(game);
    assert.equal(found.zone, 'hand', `${entry.raw.name}/${role}: typecycling finds matching land`);
    assert.equal(source.zone, 'graveyard', `${entry.raw.name}/${role}: typecycling discards source`);
    return 1;
  }

  if (kind === 'mechanic-delve') {
    const source = zoneCard(MTG, a, entry.raw.name, 'hand');
    for (let index = 0; index < 12; index++) zoneCard(MTG, a, 'Forest', 'graveyard');
    const parsed = MTG.parseCost(entry.raw.cost);
    for (const color of Object.keys(a.pool)) a.pool[color] = 0;
    for (const pip of parsed.pips) {
      const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G', 'C'].includes(symbol)) || 'C';
      a.pool[color] = (a.pool[color] || 0) + 1;
    }
    const offer = game.castableList(a).find(candidate => candidate.card === source && candidate.alt?.delve);
    assert.ok(offer, `${entry.raw.name}/${role}: Delve alternative offered`);
    const graveyardBefore = a.graveyard.length;
    assert.equal(await game.castSpell(a, source, { from: offer.from, alt: offer.alt }), true,
      `${entry.raw.name}/${role}: real Delve cast`);
    const stackObject = game.stack.find(candidate => candidate.card === source);
    assert.ok(stackObject, `${entry.raw.name}/${role}: Delve reaches Stack`);
    assert.ok(a.exile.length >= Math.min(parsed.generic, graveyardBefore),
      `${entry.raw.name}/${role}: Delve exiles graveyard cards as payment`);
    await resolveAll(game);
    return 1;
  }

  if (kind === 'mechanic-improvise') {
    const source = zoneCard(MTG, a, entry.raw.name, 'hand');
    const parsed = MTG.parseCost(entry.raw.cost);
    const helpers = Array.from({ length: parsed.generic }, (_, index) => permanent(MTG, game, a,
      fixtureDefinition(`Oracle Improvise Artifact ${index}`, ['Artifact'])));
    for (const color of Object.keys(a.pool)) a.pool[color] = 0;
    for (const pip of parsed.pips) {
      const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G', 'C'].includes(symbol)) || 'C';
      a.pool[color] = (a.pool[color] || 0) + 1;
    }
    assert.equal(await game.castSpell(a, source, { from: 'hand' }), true, `${entry.raw.name}/${role}: real Improvise cast`);
    const stackObject = game.stack.find(candidate => candidate.card === source);
    assert.equal(stackObject.convokedCards.length, parsed.generic, `${entry.raw.name}/${role}: exact Improvise payments`);
    assert.ok(helpers.every(card => card.tapped), `${entry.raw.name}/${role}: Improvise taps artifacts`);
    await resolveAll(game);
    return 1;
  }

  if (kind === 'mechanic-affinity-artifacts') {
    const source = zoneCard(MTG, a, entry.raw.name, 'hand');
    const parsed = MTG.parseCost(entry.raw.cost);
    const reduction = parsed.generic;
    for (let index = 0; index < reduction; index++) permanent(MTG, game, a,
      fixtureDefinition(`Oracle Affinity Artifact ${index}`, ['Artifact']));
    for (const color of Object.keys(a.pool)) a.pool[color] = 0;
    for (const pip of parsed.pips) {
      const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G', 'C'].includes(symbol)) || 'C';
      a.pool[color] = (a.pool[color] || 0) + 1;
    }
    assert.equal(game.spellCost(a, source, {}).generic, 0, `${entry.raw.name}/${role}: Affinity reduces exact generic cost`);
    assert.equal(await game.castSpell(a, source, { from: 'hand' }), true, `${entry.raw.name}/${role}: reduced Affinity cast`);
    await resolveAll(game);
    return 1;
  }

  assert.fail(`${entry.raw.name}: no executable mechanic proof for ${kind}`);
}

function spellV4Amount(node) {
  if (!node) return 0;
  if (node.kind === 'number') return Number(node.value) || 0;
  if (node.kind === 'variable') return 3;
  if (node.kind === 'multiply') return node.operands.reduce((product, value) => product * spellV4Amount(value), 1);
  assert.fail(`unsupported v4 amount node ${JSON.stringify(node)}`);
}

function spellV4TargetVariants(target) {
  if (target.kind === 'damageable') return ['player', 'creature', 'planeswalker', 'battle'];
  if (target.kind === 'spell') {
    const types = target.spellTypes?.length ? target.spellTypes : ['Instant', 'Sorcery', 'Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'];
    return types.filter(type => !(target.filters?.noncreature && type === 'Creature'));
  }
  const types = target.spellTypes || target.types || target.cardTypes || [];
  if (types.length > 1) return types.slice();
  if (target.kind === 'player' && target.relation === 'any') return ['you', 'opponent'];
  return [types[0] || target.kind];
}

function spellV4Goal(effect) {
  if (!effect) return 'neutral';
  if (['destroy', 'exile', 'dealDamage', 'discard', 'mill', 'counterSpell', 'returnToHand', 'tap'].includes(effect.kind)) {
    if (effect.kind === 'modifyPowerToughness') return Number(effect.power || 0) >= 0 ? 'benefit' : 'harm';
    return 'harm';
  }
  if (effect.kind === 'putCounters') return String(effect.counterType).startsWith('-') ? 'harm' : 'benefit';
  if (effect.kind === 'modifyPowerToughness') {
    return Number(effect.power || 0) >= 0 && Number(effect.toughness || 0) >= 0 ? 'benefit' : 'harm';
  }
  return 'benefit';
}

async function stageSpellV4Target(MTG, context, source, target, effect, variant, index) {
  const { game, a, b } = context;
  const goal = spellV4Goal(effect);
  let owner = target.controller==='opponent'?b:target.owner === 'you' || target.controller === 'you' || goal === 'benefit' ? a : b;
  if (variant === 'you') return a;
  if (variant === 'opponent' || target.relation === 'opponent') return b;
  if (target.kind === 'player') return goal === 'benefit' ? a : b;
  if (target.kind === 'damageable' && variant === 'player') return b;
  const count = target.quantity.max ?? target.quantity.min;
  const makeOne = async itemIndex => {
    if (target.kind === 'spell') {
      const spellType = variant || target.spellTypes?.[0] || 'Instant';
      const definition = fixtureDefinition(`Oracle V4 Stack Target ${index}-${itemIndex}`, [spellType], {
        cost: '{7}', power: spellType === 'Creature' ? '20000' : undefined,
        toughness: spellType === 'Creature' ? '20000' : undefined,
      });
      const bait = new MTG.CardInst(definition, b);
      bait.zone = 'hand';
      b.hand.push(bait);
      game.turnPlayer = b;
      assert.equal(await game.castSpell(b, bait, { from: 'hand', alt: { free: true } }), true,
        `${source.name}: real ${spellType} Stack target`);
      game.turnPlayer = a;
      return game.stack.find(candidate => candidate.card === bait);
    }
    if (target.kind === 'damageable' && variant === 'player') return b;
    let types;
    if (target.kind === 'damageable') types = [variant.charAt(0).toUpperCase() + variant.slice(1)];
    else {
      const type = variant === 'Permanent' || variant === 'permanent' ? 'Artifact' : variant;
      types = type && !['card', 'permanent'].includes(type) ? [type] : ['Artifact'];
    }
    if (target.filters?.noncreature) types = ['Artifact'];
    if (target.filters?.nonland && types.includes('Land')) types = ['Artifact'];
    const extras = {
      power: types.includes('Creature') ? '20000' : undefined,
      toughness: types.includes('Creature') ? '20000' : undefined,
      subtypes: (target.subtypes || []).slice(),
      super: target.filters?.legendary ? ['Legendary'] : [],
      loyalty: types.includes('Planeswalker') ? '20000' : undefined,
      defense: types.includes('Battle') ? '20000' : undefined,
    };
    const definition = fixtureDefinition(`Oracle V4 Target ${index}-${itemIndex}-${variant}`, types, extras);
    const zone = target.zone || (target.kind === 'card' ? 'graveyard' : 'battlefield');
    const card = new MTG.CardInst(definition, owner);
    card.zone = zone;
    card.ctrl = owner;
    if (zone === 'battlefield') game.battlefield.push(card);
    else owner[zone].push(card);
    if (target.filters?.tapped !== undefined) card.tapped = target.filters.tapped;
    if (target.filters?.attacking) card.attacking = b;
    if (target.filters?.blocking) card.blocking = 1;
    if (types.includes('Planeswalker')) card.counters.loyalty = 20000;
    if (types.includes('Battle')) card.counters.defense = 20000;
    game.recalc();
    return card;
  };
  const made = [];
  for (let itemIndex = 0; itemIndex < count; itemIndex++) made.push(await makeOne(itemIndex));
  return made.length === 1 ? made[0] : made;
}

function flattenSpellV4Targets(targetIds, chosenById) {
  return targetIds.flatMap(id => {
    const value = chosenById.get(id);
    return (Array.isArray(value) ? value : [value]).filter(Boolean);
  });
}

function assertSpellV4EffectEvidence(MTG, context, entry, effect, chosenById, before, trace, label, priorZoneMoves) {
  const { game, a } = context;
  const originallyChosen = flattenSpellV4Targets(effect.targetIds || [], chosenById);
  const staleTargets = originallyChosen.filter(subject => priorZoneMoves.has(subject));
  for (const subject of staleTargets) {
    const previous = priorZoneMoves.get(subject);
    assert.equal(subject.zone, previous.destination,
      `${label}: ${subject.name} is a new object after the earlier zone change and cannot be moved again by a stale target`);
    assert.equal(subject.zoneVersion, previous.zoneVersion,
      `${label}: stale target causes no second zone change`);
  }
  const targets = originallyChosen.filter(subject => !priorZoneMoves.has(subject));
  if (originallyChosen.length && !targets.length) return;
  const target = targets[0];
  const player = effect.actor === 'you' || !(effect.targetIds || []).length
    ? a : (target instanceof MTG.Player ? target : a);
  const oldPlayer = before.players.get(player);
  const n = spellV4Amount(effect.amount);
  if (effect.kind === 'draw') {
    assert.ok(player.library.length <= oldPlayer.library - n, `${label}: draw executes`);
  } else if (effect.kind === 'discard') {
    const discardDecision = trace.find(item => item.query.type === 'chooseCards' &&
      item.query.aiHint?.kind === 'cleanupDiscard' &&
      Array.isArray(item.result) && item.result.length === n &&
      item.result.every(card => item.query.from.includes(card) && card.zone === 'graveyard'));
    assert.ok(discardDecision, `${label}: controller chooses and discards the exact count`);
  } else if (effect.kind === 'counterSpell') {
    assert.ok(targets.length > 0, `${label}: counter effect has selected Stack spells`);
    for (const spell of targets) {
      assert.ok(!game.stack.includes(spell), `${label}: selected Stack spell is countered`);
      assert.equal(spell.card.zone, 'graveyard', `${label}: countered card reaches graveyard`);
    }
  } else if (effect.kind === 'gainLife') {
    assert.ok(player.life >= oldPlayer.life + n, `${label}: life gain executes`);
  } else if (effect.kind === 'dealDamage') {
    for (const subject of targets) {
      if (subject instanceof MTG.Player) assert.ok(subject.life <= before.players.get(subject).life - n, `${label}: player damage`);
      else if (subject.zone === 'battlefield' && subject.is('Planeswalker')) {
        assert.ok(subject.counters.loyalty <= before.cards.get(subject).counters.loyalty - n, `${label}: planeswalker damage`);
      } else if (subject.zone === 'battlefield' && subject.is('Battle')) {
        assert.ok(subject.counters.defense <= before.cards.get(subject).counters.defense - n, `${label}: battle damage`);
      } else if (subject.zone === 'battlefield') assert.ok(subject.damage >= n, `${label}: creature damage`);
      else assert.ok(['graveyard', 'exile'].includes(subject.zone), `${label}: lethal damage changes zone`);
    }
  } else if (effect.kind === 'destroy') {
    assert.ok(targets.every(subject => subject.zone === 'graveyard'), `${label}: all selected permanents destroyed`);
  } else if (effect.kind === 'destroyAll') {
    const types=effect.scope?.types||effect.scope?.cardTypes||[];
    const relevant = before.battlefield.filter(card => (!types.length||types.some(type=>type==='Permanent'||card.is(type)))&&(!effect.scope?.filters?.nonland||!card.is('Land'))&&(effect.scope?.controller!=='you'||card.ctrl===a));
    assert.ok(relevant.length && relevant.every(card => card.zone === 'graveyard'), `${label}: wipe destroys every scoped nonland permanent`);
  } else if (effect.kind === 'exile') {
    assert.ok(targets.every(subject => subject.zone === 'exile'), `${label}: all selected cards exiled`);
  } else if (effect.kind === 'returnToHand') {
    assert.ok(targets.length && targets.every(subject => subject.kind === 'spell'
      ? !game.stack.includes(subject) && subject.card.zone === 'hand'
      : subject.zone === 'hand'), `${label}: all selected cards return to hand`);
  } else if (effect.kind === 'returnToBattlefield') {
    assert.ok(targets.length, `${label}: graveyard recursion has selected cards`);
    for (const subject of targets) {
      assert.equal(subject.zone, 'battlefield', `${label}: ${subject.name} remains on the battlefield after graveyard recursion ` +
        `(chosen=${[...chosenById].map(([id, value]) => `${id}:${(Array.isArray(value) ? value : [value])
          .filter(Boolean).map(card => `${card.name || card.card?.name}#${card.iid || card.card?.iid}`).join(',')}`).join(';')})`);
      assert.equal(subject.tapped, !!effect.tapped, `${label}: returned card has the exact tapped state`);
    }
  } else if (effect.kind === 'tap' || effect.kind === 'untap') {
    assert.ok(targets.every(subject => subject.tapped === (effect.kind === 'tap')), `${label}: tapped-state effect executes`);
  } else if(effect.kind==='tapOrUntap'){
    for(const subject of targets){const decision=trace.find(item=>item.query.type==='chooseOption'&&item.query.prompt?.endsWith(`tap or untap ${subject.name}?`));assert.ok(decision,`${label}: tap/untap choice`);assert.equal(subject.tapped,decision.result==='tap',`${label}: chosen tapped state`);}
  } else if(effect.kind==='exileGraveyard'){
    assert.ok(oldPlayer.graveyardCards.length,`${label}: nonempty graveyard proof`);assert.ok(oldPlayer.graveyardCards.every(card=>card.zone==='exile'),`${label}: entire target graveyard exiled`);
  } else if (effect.kind === 'createToken') {
    assert.ok(game.battlefield.filter(card => card.isToken).length >= before.tokenCount + n,
      `${label}: token effect creates exact-or-greater count`);
  } else if (effect.kind === 'investigate') {
    assert.ok(game.battlefield.filter(card => card.isToken && card.hasSub('Clue')).length >
      before.battlefield.filter(card => card.isToken && card.hasSub('Clue')).length, `${label}: investigate creates Clue`);
  } else if (effect.kind === 'proliferate') {
    assert.ok([...before.cards].some(([card, old]) => Object.entries(card.counters)
      .some(([key, value]) => value > (old.counters[key] || 0))) || trace.some(item => item.query.type === 'chooseCards'),
    `${label}: proliferate executes real counter selection`);
  } else if (effect.kind === 'becomeMonarch') {
    assert.equal(game.monarch, a, `${label}: monarch state changes`);
  } else if (effect.kind === 'modifyPowerToughness') {
    for (const subject of targets) {
      const old = before.cards.get(subject);
      if (Number(effect.power || 0) > 0) assert.ok(subject.power >= old.power + effect.power, `${label}: power buff`);
      if (Number(effect.power || 0) < 0) assert.ok(subject.power <= old.power + effect.power,
        `${label}: power debuff (old=${old?.power}, now=${subject.power}, target=${subject.name}, zone=${subject.zone}, ` +
        `until=${game.untilEffects.map(candidate => candidate.kind).join(',')}, changed=${[...before.cards]
          .filter(([card, prior]) => card.power !== prior.power)
          .map(([card, prior]) => `${card.name}:${prior.power}->${card.power}`).join('|')})`);
      if (Number(effect.toughness || 0) > 0) assert.ok(subject.toughness >= old.toughness + effect.toughness, `${label}: toughness buff`);
      if (Number(effect.toughness || 0) < 0 && subject.zone === 'battlefield') {
        assert.ok(subject.toughness <= old.toughness + effect.toughness, `${label}: toughness debuff`);
      }
      for (const keyword of effect.keywords || []) assert.equal(subject.kw(keyword), true, `${label}: grants ${keyword}`);
    }
  } else if (effect.kind === 'modifyPowerToughnessAll') {
    const candidates = before.battlefield.filter(card => card.is('Creature') &&
      (effect.scope?.controller !== 'you' || card.ctrl === a));
    assert.ok(candidates.length, `${label}: scoped pump has creatures`);
    assert.ok(candidates.every(card => card.zone !== 'battlefield' || card.power !== before.cards.get(card).power ||
      card.toughness !== before.cards.get(card).toughness), `${label}: scoped pump changes every matching creature`);
  } else if (effect.kind === 'putCounters') {
    assert.ok(targets.every(subject => (subject.counters[effect.counterType] || 0) >=
      ((before.cards.get(subject).counters[effect.counterType]) || 0) + n), `${label}: counters are added`);
  } else if (effect.kind === 'mill') {
    assert.ok(player.library.length <= oldPlayer.library - n, `${label}: mill removes library cards`);
    assert.ok(player.graveyard.length >= oldPlayer.graveyard + n, `${label}: mill fills graveyard`);
  } else if (effect.kind === 'scry' || effect.kind === 'surveil') {
    const query = trace.find(item => item.query.type === 'scry')?.query;
    assert.ok(query, `${label}: library selection reaches controller`);
    assert.equal(!!query.surveil, effect.kind === 'surveil', `${label}: exact selection mode`);
  } else assert.fail(`${entry.raw.name}: no nested spell-v4 effect proof for ${effect.kind}`);
}

async function spellV4RuntimeOperationProof(MTG, entry, operation, role, nested=null) {
  const targetMap = new Map(operation.targets.map(target => [target.id, target]));
  const effectMap = new Map(operation.effects.map(effect => [effect.id, effect]));
  const top = operation.operations[0];
  const modePlans = top.kind === 'sequence'
    ? [{ modes: null, effectIds: top.effectIds.slice(), targetIds: [...new Set(top.effectIds.flatMap(id => effectMap.get(id).targetIds))] }]
    : (() => {
        const indices = top.options.map((option, index) => index);
        const combinations = makeCombinations(indices, top.choose.min, top.choose.max);
        return combinations.map(modes => ({
          modes,
          effectIds: modes.flatMap(index => top.options[index].effectIds),
          targetIds: modes.flatMap(index => top.options[index].targetIds),
        }));
      })();
  const exhaustivePlans = role === 'human' ? modePlans : [modePlans.at(-1)];
  let executions = 0;

  for (const basePlan of exhaustivePlans) {
    const selectedTargets = basePlan.targetIds.map(id => targetMap.get(id));
    const costChoiceWidths = [];
    const collectCostWidths = cost => {
      if (cost.kind === 'choice') costChoiceWidths.push(cost.options.length);
      for (const child of cost.options || cost.costs || []) collectCostWidths(child);
    };
    for (const cost of operation.additionalCosts || []) collectCostWidths(cost);
    const variantCount = role === 'human'
      ? Math.max(1, ...selectedTargets.map(target => spellV4TargetVariants(target).length), ...costChoiceWidths) : 1;
    for (let variantIndex = 0; variantIndex < variantCount; variantIndex++) {
      const humanTrace = [];
      const opponentTrace = [];
      let wantedTargets = [];
      let wantedTargetGroups = [];
      let targetDecisionIndex = 0;
      let wantedCards = [];
      let desiredModes = basePlan.modes;
      let desiredCostOption = null;
      const controller = recordingDecision(humanTrace, {
        chooseOption: (game, query) => {
          if (query.prompt.startsWith(`${entry.raw.name}:`) && desiredModes) return String(desiredModes[0]);
          if (/choose an additional cost/i.test(query.prompt) && desiredCostOption !== null) return String(desiredCostOption);
          if (/save /.test(query.prompt)) return query.options.find(option => option.key === 'no')?.key;
          return query.options.find(option => ['yes', 'pay'].includes(option.key))?.key || query.options[0]?.key;
        },
        chooseMulti: (game, query) => desiredModes ? desiredModes.map(String) : query.options.slice(0, query.min).map(option => option.key),
        chooseTargets: (game, query) => {
          if (query.spec?.what === 'proliferate') return query.candidates.filter(target =>
            target instanceof MTG.CardInst && target.ctrl === game.players[0] &&
            Object.keys(target.counters).some(counter => !counter.startsWith('-')));
          const min = query.min || 0;
          const max = query.max ?? query.count ?? Math.max(1, min);
          const desired = wantedTargetGroups[targetDecisionIndex++] || wantedTargets;
          const picked = desired.filter(target => query.candidates.includes(target)).slice(0, max);
          for (const candidate of query.candidates) {
            if (picked.length >= max) break;
            if (!picked.includes(candidate)) picked.push(candidate);
          }
          return picked.length >= min ? picked : [];
        },
        chooseCards: (game, query) => {
          const max = query.max ?? query.min ?? 1;
          const picked = wantedCards.filter(card => query.from.includes(card)).slice(0, max);
          for (const card of query.from) {
            if (picked.length >= max) break;
            if (!picked.includes(card)) picked.push(card);
          }
          return picked;
        },
        chooseX: (game, query) => Math.min(3, query.max ?? 3),
        scry: (game, query) => ({ top: query.cards.slice(1), bottom: query.cards.slice(0, 1) }),
      });
      const context = gameFor(MTG, [controller, recordingDecision(opponentTrace)], { ai: role === 'ai' });
      const { game, a, b } = context;
      assertControllerRole(MTG, context, `${entry.raw.name}/${role}/spell-v4`);
      fillLibrary(MTG, a, 80);
      fillLibrary(MTG, b, 80);
      for(const effect of operation.effects)if(effect.kind==='exileGraveyard'){zoneCard(MTG,a,'Forest','graveyard');zoneCard(MTG,b,'Forest','graveyard');}
      for (let index = 0; index < 20; index++) {
        zoneCard(MTG, a, 'Forest', 'hand');
        zoneCard(MTG, b, 'Forest', 'hand');
      }
      fund(a, 100);
      for (const color of Object.keys(b.pool)) b.pool[color] = 0;
      const source = zoneCard(MTG, a, entry.raw.name, 'hand');
      const firstEffectForTarget = id => basePlan.effectIds.map(effectId => effectMap.get(effectId))
        .find(effect => effect.targetIds.includes(id));
      const stagedById = new Map();
      for (let index = 0; index < basePlan.targetIds.length; index++) {
        const id = basePlan.targetIds[index];
        if (stagedById.has(id)) continue;
        const target = targetMap.get(id);
        const variants = spellV4TargetVariants(target);
        const variant = variants[Math.min(variantIndex, variants.length - 1)];
        stagedById.set(id, await stageSpellV4Target(MTG, context, source, target,
          firstEffectForTarget(id), variant, index));
      }
      wantedTargets = basePlan.targetIds.flatMap(id => {
        const value = stagedById.get(id);
        return Array.isArray(value) ? value : [value];
      }).filter(Boolean);
      wantedTargetGroups = basePlan.targetIds.map(id => {
        const value = stagedById.get(id);
        return (Array.isArray(value) ? value : [value]).filter(Boolean);
      });
      targetDecisionIndex = 0;

      const additionalFixtures = [];
      const stageCost = cost => {
        if (cost.kind === 'sacrifice') {
          const type = cost.object.types[0] || 'Creature';
          const card = permanent(MTG, game, a, fixtureDefinition(`Oracle V4 Sacrifice ${type}`, [type]));
          additionalFixtures.push(card);
          wantedCards.push(card);
        } else if (cost.kind === 'discard') {
          const card = zoneCard(MTG, a, 'Forest', 'hand');
          additionalFixtures.push(card);
          wantedCards.push(card);
        } else if (cost.kind === 'choice') {
          desiredCostOption = variantIndex % cost.options.length;
          for (const option of cost.options) stageCost(option);
        } else if (cost.kind === 'sequence') for (const child of cost.costs) stageCost(child);
      };
      for (const cost of operation.additionalCosts || []) stageCost(cost);

      const ownBoard = permanent(MTG, game, a, fixtureDefinition('Oracle V4 Own Board', ['Creature'], {
        power: '20000', toughness: '20000',
      }));
      const hostileBoard = permanent(MTG, game, b, fixtureDefinition('Oracle V4 Hostile Board', ['Creature'], {
        power: '20000', toughness: '20000',
      }));
      game.addCounters(ownBoard, '+1/+1', 1, false, a);
      const trackedCards = [...game.battlefield, ...game.players.flatMap(player => player.graveyard),
        ...wantedTargets.filter(target => target instanceof MTG.CardInst).map(target => target.card || target)];
      for(const effect of operation.effects)if(effect.kind==='destroyAll')for(const type of effect.scope?.types||effect.scope?.cardTypes||['Artifact'])trackedCards.push(permanent(MTG,game,b,fixtureDefinition('V5 wipe '+type,[type==='Permanent'?'Artifact':type])));
      let before = genericProofSnapshot(context, [...new Set(trackedCards.filter(Boolean))]);
      const castOptions = /\{X\}/i.test(entry.raw.cost || '')
        ? { from: 'hand', xVal: 3 } : { from: 'hand', alt: { free: true } };
      const cast = await game.castSpell(a, source, nested?{from:'hand',xVal:3}:castOptions);
      assert.equal(cast, true,
        `${entry.raw.name}/${role}: spell-v4 plan ${JSON.stringify(basePlan.modes)} variant ${variantIndex} casts`);
      let stackObject = game.stack.find(candidate => candidate.card === source);
      assert.ok(stackObject, `${entry.raw.name}/${role}: spell-v4 source reaches Stack`);
      if(nested){
        if(nested.event==='etb'){
          stageCondition(MTG,context,nested.condition,source,v5Helpers());
          await game.resolveTop();await game.flushTriggers();
        }else{
          await resolveAll(game);
          assert.equal(source.zone,'battlefield',`${entry.raw.name}: nested source enters`);
          source.sick=false;source.tapped=false;targetDecisionIndex=0;
          for(const id of basePlan.targetIds){
            const target=targetMap.get(id);
            if(target.kind==='spell')stagedById.set(id,await stageSpellV4Target(MTG,context,source,target,firstEffectForTarget(id),spellV4TargetVariants(target)[0],0));
          }
          wantedTargetGroups=basePlan.targetIds.map(id=>[stagedById.get(id)].flat().filter(Boolean));wantedTargets=wantedTargetGroups.flat();
          if(nested.kind==='generic-ability'){
            const cost=nested.cost||{};
            if(cost.rmCounter)game.addCounters(source,cost.rmCounter.kind,cost.rmCounter.n,false,a);
            if(cost.sacWhat||cost.sacCreature||cost.sacOther){
              const type=cost.sacWhat?cost.sacWhat[0].toUpperCase()+cost.sacWhat.slice(1):'Creature';
              wantedCards.unshift(permanent(MTG,game,a,fixtureDefinition('V5 ability fodder',[type],{power:'0',toughness:'1'})));
            }
            before=genericProofSnapshot(context,[...game.battlefield,...trackedCards,source]);
            const ordinal=entry.implementation.filter(o=>o.kind==='generic-ability').indexOf(nested);
            const compiled=source.def.abilities.filter(o=>o.label==='Oracle ability')[ordinal];
            const action=game.activatableList(a).find(row=>row.card===source&&row.ability===compiled);assert.ok(action,`${entry.raw.name}: nested paid activation available`);
            assert.equal(await game.activateAbility(a,action),true,`${entry.raw.name}: nested activation succeeds`);
          }else{
            stageCondition(MTG,context,nested.condition,source,v5Helpers());
            before=genericProofSnapshot(context,[...game.battlefield,...trackedCards,source]);
            await fireGenericEvent(MTG,context,source,nested);await game.flushTriggers();
          }
        }
        const kind=nested.kind==='generic-ability'?'ability':'trigger';
        stackObject=game.stack.find(row=>row.kind===kind&&row.srcCard===source);
        assert.ok(stackObject,`${entry.raw.name}: nested body reaches ${kind} Stack`);
        if(top.kind!=='sequence')stackObject={...stackObject,mode:Array.isArray(stackObject.mode)?stackObject.mode:[stackObject.mode]};
      }
      if (desiredModes && role === 'human') assert.deepEqual(Array.from(stackObject.mode).sort(), desiredModes.slice().sort(),
        `${entry.raw.name}/${role}: exact modal selection`);
      if (desiredModes && role === 'ai') {
        assert.ok(stackObject.mode.length >= top.choose.min && stackObject.mode.length <= top.choose.max,
          `${entry.raw.name}/${role}: local AI chooses the required number of modes`);
        assert.equal(new Set(stackObject.mode).size, stackObject.mode.length,
          `${entry.raw.name}/${role}: local AI does not repeat modes`);
      }
      if (operation.additionalCosts.length) {
        assert.ok(stackObject.oracleV4AdditionalCost, `${entry.raw.name}/${role}: additional-cost record on Stack`);
        const record = stackObject.oracleV4AdditionalCost;
        assert.ok(record.sacrifices.length + record.discards.length + record.life + record.choices.length > 0,
          `${entry.raw.name}/${role}: real additional cost is committed before resolution`);
      }

      const chosenById = new Map();
      let targetOffset = 0;
      if (top.kind === 'sequence') {
        for (const id of basePlan.targetIds) chosenById.set(id, stackObject.targets[targetOffset++]);
      } else {
        for (const modeIndex of stackObject.mode.slice().sort((left, right) => left - right)) {
          for (const id of top.options[modeIndex].targetIds) chosenById.set(id, stackObject.targets[targetOffset++]);
        }
      }
      await resolveAll(game);
      if(!nested)assert.equal(source.zone, (entry.implementation || []).some(candidate => candidate.kind === 'mechanic-rebound')
        ? 'exile' : 'graveyard', `${entry.raw.name}/${role}: spell-v4 resolves to correct zone`);
      const executedIds = top.kind === 'sequence' ? top.effectIds
        : stackObject.mode.flatMap(index => top.options[index].effectIds);
      const trace = [...(role === 'ai' ? context.aiDecisions : humanTrace), ...opponentTrace];
      const priorZoneMoves = new Map();
      for (const effectId of executedIds) {
        const effect = effectMap.get(effectId);
        assertSpellV4EffectEvidence(MTG, context, entry, effect, chosenById, before, trace,
          `${entry.raw.name}/${role}/${effectId}/variant-${variantIndex}`, priorZoneMoves);
        const destination = {
          destroy: 'graveyard', exile: 'exile', returnToHand: 'hand', returnToBattlefield: 'battlefield',
        }[effect.kind];
        if (destination) {
          for (const subject of flattenSpellV4Targets(effect.targetIds || [], chosenById)) {
            if (!(subject instanceof MTG.CardInst) || priorZoneMoves.has(subject)) continue;
            const prior = before.cards.get(subject);
            assert.ok(prior, `${entry.raw.name}/${role}/${effectId}: zone-changing target has an identity snapshot`);
            priorZoneMoves.set(subject, {
              destination,
              zoneVersion: prior.zoneVersion + (prior.zone === destination ? 0 : 1),
            });
          }
        }
      }
      if (role === 'ai' && (stackObject.targets || []).length) {
        assert.ok(context.aiTrace.some(query => query.type === 'chooseTargets'),
          `${entry.raw.name}/${role}: genuine local AI receives spell-v4 target choice`);
      }
      executions += executedIds.length + (operation.additionalCosts.length ? 1 : 0);
    }
  }
  return executions;
}

function targetPermanent(MTG, game, player, what, extras = {}) {
  if (what === 'land') return permanent(MTG, game, player, 'Forest');
  if (what === 'artifact' || what === 'artifact or enchantment' || what === 'artifact or creature') {
    return permanent(MTG, game, player, fixtureDefinition('Oracle Artifact Target', ['Artifact'], extras));
  }
  if (what === 'enchantment') {
    return permanent(MTG, game, player, fixtureDefinition('Oracle Enchantment Target', ['Enchantment'], extras));
  }
  if (what === 'permanent' || what === 'nonland permanent') {
    return permanent(MTG, game, player, fixtureDefinition('Oracle Permanent Target', ['Artifact'], extras));
  }
  return permanent(MTG, game, player, fixtureDefinition('Oracle Creature Target', ['Creature'], extras));
}

async function operationProof(MTG, entry, operation, role = 'human') {
  if(mechanicKinds.has(operation.kind))return v5MechanicProof(MTG,entry,operation,role,v5Helpers());
  if(operation.kind==='characteristic-pt')return characteristicProof(MTG,entry,operation,role,v5Helpers());
  if (['generic-trigger', 'generic-ability', 'generic-static', 'spell-generic', 'enters-with-counters',
    'conditional-enters-tapped'].includes(operation.kind)) {
    return genericRuntimeOperationProof(MTG, entry, operation, role);
  }
  if (['mechanic-myriad', 'mechanic-infect', 'mechanic-exalted', 'mechanic-flanking',
    'mechanic-battle-cry', 'mechanic-mentor', 'mechanic-training', 'mechanic-riot',
    'mechanic-unleash', 'mechanic-evolve', 'mechanic-extort', 'mechanic-delve',
    'mechanic-improvise', 'mechanic-affinity-artifacts', 'mechanic-afterlife',
    'mechanic-bushido', 'mechanic-renown', 'mechanic-bloodthirst', 'mechanic-toxic',
    'mechanic-typecycling'].includes(operation.kind)) {
    return mechanicRuntimeOperationProof(MTG, entry, operation, role);
  }
  if (operation.kind === 'spell-v4') return spellV4RuntimeOperationProof(MTG, entry, operation, role);
  let wantedTargets = [];
  let wantedCards = [];
  let selectionQuery = null;
  let selectedLibraryCard = null;
  const chooser = decision({
    chooseTargets: (game, query) => {
      const max = query.max ?? query.count ?? 1;
      const chosen = wantedTargets.filter(target => query.candidates.includes(target)).slice(0, max);
      for (const candidate of query.candidates) {
        if (chosen.length >= (query.min || 0) || chosen.length >= max) break;
        if (!chosen.includes(candidate)) chosen.push(candidate);
      }
      return chosen;
    },
    chooseCards: (game, query) => {
      const max = query.max ?? query.min ?? 1;
      const chosen = wantedCards.filter(card => query.from.includes(card)).slice(0, max);
      for (const card of query.from) {
        if (chosen.length >= (query.min || 0) || chosen.length >= max) break;
        if (!chosen.includes(card)) chosen.push(card);
      }
      return chosen;
    },
    scry: (game, query) => {
      selectionQuery = query;
      selectedLibraryCard = query.cards[0] || null;
      return { top: query.cards.slice(1), bottom: selectedLibraryCard ? [selectedLibraryCard] : [] };
    },
  });
  const context = gameFor(MTG, [chooser, decision()], { ai: role === 'ai' });
  const { game, a, b } = context;
  assertControllerRole(MTG, context, `${entry.raw.name}/${role}/${operation.kind}`);
  const name = entry.raw.name;
  const operations = entry.implementation || [];

  const stageSpellTarget = async targetOperation => {
    let effectTarget = null;
    let counterTarget = null;
    const generic=operations.find(op=>op.kind==='spell-generic');
    if(!targetOperation&&generic){
      wantedTargets=generic.targets.map((target,index)=>stageGenericTarget(MTG,context,target,index,generic.effects.find(effect=>effect.target===index)));
      return {effectTarget:wantedTargets[0]||null,counterTarget};
    }
    if (!targetOperation) {
      const v4 = operations.find(candidate => candidate.kind === 'spell-v4');
      if (!v4) return { effectTarget, counterTarget };
      const targets = [];
      for (let index = 0; index < v4.targets.length; index++) {
        const target = v4.targets[index];
        const effect = v4.effects.find(candidate => candidate.targetIds.includes(target.id));
        const staged = await stageSpellV4Target(MTG, context, { name }, target, effect,
          spellV4TargetVariants(target)[0], index);
        targets.push(...(Array.isArray(staged) ? staged : [staged]).filter(Boolean));
      }
      wantedTargets = targets;
      const stageCost = cost => {
        if (cost.kind === 'discard') {
          for (let index = 0; index < (cost.quantity?.min || 1); index++) {
            wantedCards.push(zoneCard(MTG, a, 'Forest', 'hand'));
          }
        } else if (cost.kind === 'sacrifice') {
          const type = cost.object.types[0] || 'Creature';
          for (let index = 0; index < (cost.quantity?.min || 1); index++) {
            wantedCards.push(permanent(MTG, game, a, fixtureDefinition(`Oracle Modifier Sacrifice ${type}`, [type], {
              power: type === 'Creature' ? '0' : undefined,
              toughness: type === 'Creature' ? '1' : undefined,
            })));
          }
        }
        for (const child of cost.options || cost.costs || []) stageCost(child);
      };
      for (const cost of v4.additionalCosts || []) stageCost(cost);
      return { effectTarget: targets[0] || null,
        counterTarget: targets.find(target => target.kind === 'spell') || null };
    }
    if (targetOperation.kind === 'spell-counter') {
      const type = targetOperation.spellType === 'creature spell' ? 'Creature'
        : targetOperation.spellType === 'instant spell' ? 'Instant' : 'Sorcery';
      const baitDef = fixtureDefinition(`Oracle ${type} Counter Bait`, [type], {
        cost: '{1}', power: type === 'Creature' ? '2' : undefined,
        toughness: type === 'Creature' ? '2' : undefined,
      });
      const bait = new MTG.CardInst(baitDef, b);
      bait.zone = 'hand';
      b.hand.push(bait);
      game.turnPlayer = b;
      assert.equal(await game.castSpell(b, bait, { from: 'hand', alt: { free: true } }), true,
        `${name}: real ${targetOperation.spellType || 'spell'} on Stack`);
      counterTarget = game.stack.at(-1);
      wantedTargets = [counterTarget];
      game.turnPlayer = a;
      return { effectTarget, counterTarget };
    }
    if (targetOperation.kind === 'spell-pump') {
      const controller = targetOperation.controller === 'opponent' ? b : a;
      effectTarget = targetPermanent(MTG, game, controller, 'creature');
      if (targetOperation.attacking) effectTarget.attacking = controller === a ? b : a;
      game.recalc();
      wantedTargets = [effectTarget];
    } else if (targetOperation.kind === 'spell-discard') {
      wantedTargets = [b];
    } else if (targetOperation.kind === 'spell-mill') {
      wantedTargets = [b];
    } else if (['spell-destroy', 'spell-exile', 'spell-bounce'].includes(targetOperation.kind)) {
      const extras = {};
      if (targetOperation.stat) {
        extras[targetOperation.stat] = String(targetOperation.threshold);
        if (targetOperation.stat === 'power' && extras.toughness === undefined) extras.toughness = '20000';
        if (targetOperation.stat === 'toughness' && extras.power === undefined) extras.power = '20000';
      }
      effectTarget = targetPermanent(MTG, game, b, targetOperation.what, extras);
      if (targetOperation.tapped) effectTarget.tapped = true;
      if (targetOperation.attacking || targetOperation.attackingOrBlocking) effectTarget.attacking = a;
      if (targetOperation.blocking) effectTarget.blocking = true;
      if (targetOperation.kind === 'spell-destroy' && targetOperation.noRegen) effectTarget.regenShield = 1;
      game.recalc();
      wantedTargets = [effectTarget];
    } else if (targetOperation.kind === 'spell-damage' && targetOperation.what !== 'each opponent') {
      if (targetOperation.what === 'target creature' || targetOperation.what === 'target creature or planeswalker') {
        effectTarget = targetPermanent(MTG, game, b, 'creature');
        wantedTargets = [effectTarget];
      } else wantedTargets = [b];
    } else if (targetOperation.kind === 'spell-graveyard-return') {
      const types = targetOperation.what === 'instant or sorcery' ? ['Instant']
        : targetOperation.what === 'permanent' ? ['Artifact']
          : [targetOperation.what.charAt(0).toUpperCase() + targetOperation.what.slice(1)];
      const def = fixtureDefinition('Oracle Graveyard Return Target', types);
      effectTarget = new MTG.CardInst(def, a);
      effectTarget.zone = 'graveyard';
      a.graveyard.push(effectTarget);
      wantedTargets = [effectTarget];
    } else if (targetOperation.kind === 'spell-counter-on-creature') {
      const controller = targetOperation.controller === 'opponent' ? b : a;
      effectTarget = targetPermanent(MTG, game, controller, 'creature');
      wantedTargets = [effectTarget];
    } else if (targetOperation.kind === 'spell-tap' || targetOperation.kind === 'spell-untap') {
      const count = targetOperation.count || 1;
      const what = targetOperation.what.includes('land') ? 'land'
        : targetOperation.what.includes('permanent') ? 'permanent' : 'creature';
      const targets = Array.from({ length: count }, (_, index) => {
        const target = targetPermanent(MTG, game, b, what);
        target.tapped = targetOperation.kind === 'spell-untap';
        target.meta.oracleBulkIndex = index;
        return target;
      });
      game.recalc();
      effectTarget = targets[0];
      wantedTargets = targets;
    }
    return { effectTarget, counterTarget };
  };

  const targetOperation = operations.find(candidate => [
    'spell-counter', 'spell-pump', 'spell-discard', 'spell-mill', 'spell-destroy',
    'spell-exile', 'spell-bounce', 'spell-damage', 'spell-graveyard-return',
    'spell-counter-on-creature', 'spell-tap', 'spell-untap',
  ].includes(candidate.kind) && !(candidate.kind === 'spell-damage' && candidate.what === 'each opponent'));

  if (operation.kind === 'cycling') {
    fillLibrary(MTG, a, 8);
    const source = zoneCard(MTG, a, name, 'hand');
    fund(a);
    const beforeLibrary = a.library.length;
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.cycling);
    assert.ok(action, `${name}: compiled Cycling is offered from hand`);
    assert.equal(await game.activateAbility(a, action), true, `${name}: Cycling activates`);
    assert.equal(source.zone, 'graveyard', `${name}: Cycling discards the source`);
    assert.equal(a.library.length, beforeLibrary, `${name}: Cycling draw waits on the Stack`);
    assert.equal(game.stack.some(item => item.kind === 'ability' && item.srcCard === source), true,
      `${name}: Cycling creates a respondable activated ability`);
    await resolveAll(game);
    assert.equal(a.library.length, beforeLibrary - 1, `${name}: Cycling draws exactly one card`);
    return 1;
  }

  if (operation.kind === 'mechanic-flashback') {
    fillLibrary(MTG, a, 30);
    await stageSpellTarget(targetOperation);
    const source = zoneCard(MTG, a, name, 'graveyard');
    fund(a);
    const offer = game.castableList(a).find(candidate => candidate.card === source && candidate.alt?.flashback);
    assert.ok(offer, `${name}: Flashback is offered from the graveyard`);
    assert.equal(await game.castSpell(a, source, { from: offer.from, alt: offer.alt }), true, `${name}: Flashback casts`);
    assert.equal(source.zone, 'stack', `${name}: Flashback uses the Stack`);
    await resolveAll(game);
    assert.equal(source.zone, 'exile', `${name}: resolved Flashback spell is exiled`);
    return 1;
  }

  if (operation.kind === 'mechanic-morph' || operation.kind === 'mechanic-disguise') {
    const source = zoneCard(MTG, a, name, 'hand');
    fund(a);
    const offer = game.castableList(a).find(candidate => candidate.card === source && candidate.alt?.faceDownCast);
    assert.ok(offer, `${name}: face-down cast is offered`);
    assert.equal(await game.castSpell(a, source, { from: offer.from, alt: offer.alt }), true, `${name}: casts face down`);
    const stackObject = game.stack.find(candidate => candidate.card === source);
    assert.ok(stackObject, `${name}: face-down spell is on Stack`);
    assert.equal(source.name, 'Face-down creature', `${name}: hidden Stack identity`);
    assert.equal(source.mv, 0, `${name}: face-down Stack mana value`);
    await resolveAll(game);
    assert.equal(source.zone, 'battlefield');
    assert.equal(source.faceDown, true);
    assert.equal(source.power, 2);
    assert.equal(source.toughness, 2);
    assert.equal(source.cur.wardCost?.mana || null, operation.kind === 'mechanic-disguise' ? '{2}' : null);
    const turnUp = game.activatableList(a).find(candidate => candidate.card === source && candidate.turnFaceUp);
    assert.ok(turnUp, `${name}: turn-face-up special action is offered`);
    assert.equal(await game.activateAbility(a, turnUp), true, `${name}: turns face up`);
    assert.equal(source.faceDown, false);
    assert.equal(source.name, name);
    return 1;
  }

  if (operation.kind === 'mechanic-suspend') {
    const source = zoneCard(MTG, a, name, 'hand');
    fund(a);
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.suspend);
    assert.ok(action, `${name}: Suspend special action is offered`);
    assert.equal(await game.activateAbility(a, action), true, `${name}: Suspend activates`);
    assert.equal(source.zone, 'exile');
    assert.equal(source.meta.suspended, operation.n, `${name}: exact time-counter count`);
    assert.equal(game.stack.length, 0, `${name}: Suspend does not use the Stack`);
    return 1;
  }

  if (operation.kind === 'mechanic-convoke') {
    fillLibrary(MTG, a, 30);
    await stageSpellTarget(targetOperation);
    const helper = permanent(MTG, game, a, fixtureDefinition('Oracle Convoke Helper', ['Creature'], {
      colorsOverride: ['W', 'U', 'B', 'R', 'G'], power: '20', toughness: '20',
    }));
    wantedCards = [helper];
    for (const color of Object.keys(a.pool)) a.pool[color] = 0;
    const parsed = MTG.parseCost(entry.raw.cost || '');
    if (parsed.generic > 0) {
      a.pool.C = parsed.generic - 1;
      for (const pip of parsed.pips) {
        const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol)) || 'C';
        a.pool[color] = (a.pool[color] || 0) + 1;
      }
    } else {
      parsed.pips.slice(1).forEach(pip => {
        const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol)) || 'C';
        a.pool[color] = (a.pool[color] || 0) + 1;
      });
    }
    const source = zoneCard(MTG, a, name, 'hand');
    assert.equal(await game.castSpell(a, source, { from: 'hand', xVal: 0 }), true, `${name}: Convoke pays a real mana cost`);
    const stackObject = game.stack.find(candidate => candidate.card === source);
    assert.ok(stackObject?.convokedCards?.length, `${name}: cast records a real Convoke payment`);
    assert.ok(stackObject.convokedCards.every(card => card.tapped), `${name}: every Convoke payment creature is tapped`);
    await resolveAll(game);
    return 1;
  }

  if (operation.kind === 'mechanic-storm') {
    fillLibrary(MTG, a, 30);
    for (let index = 0; index < 2; index++) {
      const prior = new MTG.CardInst(fixtureDefinition(`Oracle Prior Spell ${index}`, ['Instant'], { cost: '{0}' }), a);
      prior.zone = 'hand';
      a.hand.push(prior);
      assert.equal(await game.castSpell(a, prior, { from: 'hand', alt: { free: true } }), true);
      await resolveAll(game);
    }
    await stageSpellTarget(targetOperation);
    const priorSpellCount = game.totalSpellsThisTurn();
    const priorStackSize = game.stack.length;
    const source = zoneCard(MTG, a, name, 'hand');
    assert.equal(await game.castSpell(a, source, { from: 'hand', alt: { free: true } }), true, `${name}: Storm spell casts`);
    assert.deepEqual(Array.from(game.stack.slice(priorStackSize), candidate => candidate.kind), ['spell', 'trigger'],
      `${name}: Storm is a separately respondable cast trigger`);
    await game.resolveTop();
    assert.equal(game.stack.filter(candidate => candidate.card === source).length, priorSpellCount + 1,
      `${name}: trigger resolution creates one copy per prior spell plus the original`);
    await resolveAll(game);
    return 1;
  }

  if (operation.kind === 'mechanic-cascade') {
    a.library.splice(0);
    fillLibrary(MTG, a, 4);
    const lifeBefore = a.life;
    const lowerDef = fixtureDefinition('Oracle Cascade Hit', ['Instant'], {
      cost: '{0}', resolve: async ctx => { await ctx.g.gainLife(ctx.you, 1, ctx.src); },
    });
    const lower = new MTG.CardInst(lowerDef, a);
    lower.zone = 'library';
    a.library.push(lower);
    await stageSpellTarget(targetOperation);
    const source = zoneCard(MTG, a, name, 'hand');
    assert.equal(await game.castSpell(a, source, { from: 'hand', alt: { free: true } }), true, `${name}: Cascade source casts`);
    await resolveAll(game);
    assert.equal(lower.zone, 'graveyard', `${name}: Cascade hit is cast and resolves`);
    assert.ok(a.life >= lifeBefore + 1, `${name}: cascaded spell executes its resolver`);
    assert.ok(a.turnState.spellsCastList.some(cast => cast.card === lower), `${name}: Cascade hit is recorded as a cast`);
    return 1;
  }

  if (operation.kind === 'mechanic-devoid' || operation.kind === 'mechanic-uncounterable' || operation.kind === 'mechanic-rebound') {
    fillLibrary(MTG, a, 30);
    await stageSpellTarget(targetOperation);
    const source = zoneCard(MTG, a, name, 'hand');
    if (operation.kind === 'mechanic-devoid') assert.deepEqual(Array.from(source.colors), [], `${name}: Devoid is colorless in hand`);
    if (operation.kind === 'mechanic-rebound') fund(a);
    const castOptions = operation.kind === 'mechanic-rebound'
      ? { from: 'hand' } : { from: 'hand', alt: { free: true } };
    assert.equal(await game.castSpell(a, source, castOptions), true, `${name}: modifier uses a real cast`);
    const stackObject = game.stack.find(candidate => candidate.card === source);
    assert.ok(stackObject, `${name}: modifier source reaches Stack`);
    if (operation.kind === 'mechanic-devoid') assert.deepEqual(Array.from(source.colors), [], `${name}: Devoid is colorless on Stack`);
    if (operation.kind === 'mechanic-uncounterable') {
      assert.equal(await game.counterStackObject(stackObject), false, `${name}: counter attempt is rejected`);
      assert.ok(game.stack.includes(stackObject), `${name}: uncounterable spell remains on Stack`);
    }
    await resolveAll(game);
    if (operation.kind === 'mechanic-rebound') {
      assert.equal(source.zone, 'exile', `${name}: hand-cast Rebound spell is exiled`);
      assert.ok(game.delayed.some(effect => /Rebound/.test(effect.name)), `${name}: Rebound schedules the next-upkeep cast`);
    }
    return 1;
  }

  if (!operation.kind.startsWith('spell-')) {
    fillLibrary(MTG, a, Math.max(12, (Number(operation.n) || 0) + 2));
    let attachmentHost = null;
    const auraOperation = operations.find(candidate => candidate.kind === 'aura-target');
    if (auraOperation) {
      attachmentHost = targetPermanent(MTG, game, a, auraOperation.what);
      wantedTargets = [attachmentHost];
    } else if (operations.some(candidate => candidate.kind === 'attachment-grant' || candidate.kind === 'equipment-equip')) {
      attachmentHost = targetPermanent(MTG, game, a, 'creature');
    }
    if (!auraOperation) {
      const entryTargets = operations.filter(candidate => candidate.kind === 'generic-trigger' && candidate.event === 'etb')
        .flatMap(candidate => (candidate.targets || []).map((target, index) => stageGenericTarget(MTG, context, target, index,
          (candidate.effects || []).find(effect => effect.target === index))));
      wantedTargets = [...entryTargets, ...wantedTargets];
    }
    if (attachmentHost) {
    }
    let lootFodder = null;
    if (operation.kind === 'etb-loot') {
      lootFodder = zoneCard(MTG, a, 'Forest', 'hand');
      wantedCards = [lootFodder];
      if (role === 'ai') {
        for (let index = 0; index < 3; index++) zoneCard(MTG, a, 'Forest', 'hand');
      }
    }
    if (operation.kind === 'etb-each-opponent-discard') {
      zoneCard(MTG, b, 'Forest', 'hand');
      zoneCard(MTG, b, 'Forest', 'hand');
    }
    const lifeBefore = a.life;
    const libraryBefore = a.library.length;
    const handBBefore = b.hand.length;
    const tokenBefore = game.battlefield.filter(card => card.isToken && card.ctrl === a).length;
    const source = await enterPermanentProof(MTG, context, entry);

    if (operation.kind === 'enters-tapped') {
      assert.equal(source.tapped, true, `${name}: enters-tapped replacement`);
      return 1;
    }
    if (operation.kind === 'etb-life-gain') {
      assert.equal(a.life, lifeBefore + operation.n, `${name}: exact ETB life gain`);
      return 1;
    }
    if (operation.kind === 'etb-draw') {
      assert.equal(a.library.length, libraryBefore - operation.n, `${name}: exact ETB draw`);
      return 1;
    }
    if (operation.kind === 'etb-scry' || operation.kind === 'etb-surveil') {
      const query = role === 'ai'
        ? context.aiTrace.find(candidate => candidate.type === 'scry') : selectionQuery;
      assert.ok(query, `${name}/${role}: library selection decision executed`);
      assert.equal(query.cards.length, operation.n, `${name}/${role}: exact ${operation.kind} count`);
      assert.equal(!!query.surveil, operation.kind === 'etb-surveil', `${name}/${role}: scry/surveil mode`);
      if (role === 'human') {
        if (operation.kind === 'etb-surveil') assert.equal(selectedLibraryCard.zone, 'graveyard', `${name}: surveil selection moves to graveyard`);
        else {
          assert.equal(selectedLibraryCard.zone, 'library', `${name}: scry selection remains in library`);
          assert.equal(a.library[0], selectedLibraryCard, `${name}: scry selection moves to bottom`);
        }
      } else {
        const result = context.aiDecisions.find(item => item.query === query)?.result || {};
        const moved = result.bottom || [];
        assert.ok(moved.every(card => card.zone === (operation.kind === 'etb-surveil' ? 'graveyard' : 'library')),
          `${name}/${role}: AI selection moves every chosen card to the correct zone`);
      }
      return 1;
    }
    if (operation.kind === 'etb-token') {
      const made = game.battlefield.filter(card => card.isToken && card.ctrl === a).slice(tokenBefore);
      assert.equal(made.length, operation.n, `${name}: exact token count`);
      for (const token of made) {
        assert.equal(token.name, operation.token.name, `${name}: token name`);
        assert.equal(token.power, Number(operation.token.power), `${name}: token power`);
        assert.equal(token.toughness, Number(operation.token.toughness), `${name}: token toughness`);
        for (const type of operation.token.types || ['Creature']) assert.equal(token.is(type), true, `${name}: token type ${type}`);
        for (const subtype of operation.token.subtypes || []) assert.equal(token.hasSub(subtype), true, `${name}: token subtype ${subtype}`);
        for (const keyword of operation.token.keywords || []) assert.equal(token.kw(keyword), true, `${name}: token keyword ${keyword}`);
      }
      return 1;
    }
    if (operation.kind === 'etb-loot') {
      assert.equal(a.library.length, libraryBefore - 1, `${name}: ETB loot draws exactly one`);
      if (role === 'human') assert.equal(lootFodder.zone, 'graveyard', `${name}: ETB loot executes the discard decision`);
      else assert.equal(a.graveyard.filter(card => card.name === 'Forest').length, 1,
        `${name}/${role}: local AI discards exactly one redundant land`);
      return 1;
    }
    if (operation.kind === 'etb-treasure') {
      const treasures = game.battlefield.filter(card => card.isToken && card.ctrl === a && card.name === 'Treasure');
      assert.equal(treasures.length, operation.n, `${name}: exact Treasure count`);
      assert.ok(treasures.every(card => card.is('Artifact')), `${name}: Treasure tokens are artifacts`);
      return 1;
    }
    if (operation.kind === 'etb-each-opponent-discard') {
      assert.equal(b.hand.length, handBBefore - operation.n, `${name}: opponent discards exact amount`);
      assert.equal(b.graveyard.length, operation.n, `${name}: discarded card reaches graveyard`);
      return 1;
    }
    if (operation.kind === 'dies-draw') {
      const beforeDeath = a.library.length;
      await game.destroy(source);
      await resolveAll(game);
      assert.equal(source.zone, 'graveyard', `${name}: dies event source`);
      assert.equal(a.library.length, beforeDeath - operation.n, `${name}: exact dies draw`);
      return 1;
    }
    if (operation.kind === 'dies-life-gain') {
      const beforeDeath = a.life;
      await game.destroy(source);
      await resolveAll(game);
      assert.equal(source.zone, 'graveyard', `${name}: dies source changes zone`);
      assert.equal(a.life, beforeDeath + operation.n, `${name}: exact dies life gain`);
      return 1;
    }
    if (operation.kind === 'noncreature-cast-counter-self') {
      const before = source.counters[operation.counter] || 0;
      const spell = new MTG.CardInst(fixtureDefinition('Oracle Noncreature Cast', ['Instant'], { cost: '{0}' }), a);
      spell.zone = 'hand';
      a.hand.push(spell);
      assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
      await resolveAll(game);
      assert.equal(source.counters[operation.counter], before + operation.n, `${name}: noncreature cast adds exact counter`);
      return 1;
    }
    if (operation.kind === 'attack-self-pump') {
      const powerBefore = source.power;
      const toughnessBefore = source.toughness;
      source.attacking = b;
      await game.emit('attacks', { card: source, player: a, defender: b });
      await resolveAll(game);
      assert.equal(source.power, powerBefore + operation.power, `${name}: attack trigger power`);
      assert.equal(source.toughness, toughnessBefore + operation.toughness, `${name}: attack trigger toughness`);
      return 1;
    }
    if (operation.kind === 'combat-damage-draw') {
      const before = a.library.length;
      await game.emit('combatDamageToPlayer', { card: source, player: b, n: 1, step: 'normal' });
      await resolveAll(game);
      assert.equal(a.library.length, before - operation.n, `${name}: combat-damage trigger draws exact amount`);
      return 1;
    }
    if (operation.kind === 'cant-block') {
      const attacker = permanent(MTG, game, b, 'Elite Vanguard');
      game.recalc();
      assert.equal(source.cur.cantBlock, true, `${name}: static cant-block marker`);
      assert.equal(game.canBlock(source, attacker), false, `${name}: blocker legality`);
      return 1;
    }
    if (operation.kind === 'must-attack') {
      source.sick = false;
      const before = b.life;
      await game.combatPhase(a);
      assert.ok(b.life < before, `${name}: omitted declaration is auto-forced into combat`);
      return 1;
    }
    if (operation.kind === 'mana-source') {
      source.tapped = false;
      source.sick = false;
      game.recalc();
      const sources = game.manaSources(a).filter(descriptor => descriptor.card === source);
      const wanted = JSON.stringify(operation.produce);
      const descriptor = sources.find(candidate => JSON.stringify(candidate.produce) === wanted);
      assert.ok(descriptor, `${name}: compiled mana source is discoverable`);
      const chosen = descriptor.produce[0];
      const expected = chosen.ANY ? Number(chosen.n || 1)
        : Object.entries(chosen).filter(([key]) => key !== 'n')
          .reduce((sum, [, value]) => sum + Number(value || 0), 0);
      if (operation.activationMana) {
        for (const color of Object.keys(a.pool)) a.pool[color] = 0;
        const activation = MTG.parseCost(operation.activationMana);
        a.pool.C = activation.generic;
        for (const pip of activation.pips) {
          const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G', 'C'].includes(symbol)) || 'C';
          a.pool[color] = (a.pool[color] || 0) + 1;
        }
        let paymentCost = '';
        if (chosen.ANY) paymentCost = '{W}'.repeat(Number(chosen.n || 1));
        else for (const [color, amount] of Object.entries(chosen)) {
          if (color === 'n') continue;
          paymentCost += color === 'C' ? `{${amount}}` : `{${color}}`.repeat(Number(amount || 0));
        }
        const paymentCard = new MTG.CardInst(fixtureDefinition('Oracle Mana Payment', ['Instant'], { cost: paymentCost }), a);
        assert.equal(await game.payMana(a, MTG.parseCost(paymentCost), { card: paymentCard }), true,
          `${name}: paid mana source finances a real cost`);
        assert.equal(source.tapped, true, `${name}: paid mana source taps`);
        assert.equal(poolTotal(a), 0, `${name}: activation input and produced mana are fully spent`);
        return 1;
      }
      const before = poolTotal(a);
      const oldLife=a.life;const tapEvents=[];const tap=game.tap;
      game.tap=function(card,...args){const result=tap.call(this,card,...args);if(result&&card.tapped)tapEvents.push(card);return result;};
      assert.equal(await game.activateManaSource(a, descriptor, chosen, null, []), true, `${name}: mana ability activates`);
      game.tap=tap;
      assert.equal(poolTotal(a), before + expected, `${name}: exact mana production`);
      assert.ok(source.tapped||tapEvents.includes(source), `${name}: tap cost paid before a sacrifice resets the card`);
      if(operation.activationCost?.sacSelf)assert.equal(source.zone,'graveyard',`${name}: mana sacrifice paid`);
      if(operation.activationCost?.life)assert.equal(a.life,oldLife-operation.activationCost.life,`${name}: mana life cost paid`);
      return 1;
    }
    if (operation.kind === 'attachment-grant') {
      assert.ok(attachmentHost, `${name}: attachment host staged`);
      if (source.attachedTo !== attachmentHost.iid) {
        assert.equal(await game.attach(source, attachmentHost), true, `${name}: attaches through Game.attach`);
      }
      game.recalc();
      const grantedPower = attachmentHost.power;
      const grantedToughness = attachmentHost.toughness;
      source.attachedTo = null;
      attachmentHost.attachments = attachmentHost.attachments.filter(iid => iid !== source.iid);
      game.recalc();
      assert.equal(grantedPower, attachmentHost.power + (operation.power || 0), `${name}: attached power grant`);
      assert.equal(grantedToughness, attachmentHost.toughness + (operation.toughness || 0), `${name}: attached toughness grant`);
      assert.equal(await game.attach(source, attachmentHost), true, `${name}: attachment grant restores through Game.attach`);
      game.recalc();
      for (const keyword of operation.keywords || []) assert.equal(attachmentHost.kw(keyword), true, `${name}: attached grant ${keyword}`);
      if (operation.cantAttack) assert.equal(attachmentHost.cur.cantAttack, true, `${name}: attached cant-attack restriction`);
      if (operation.cantBlock) assert.equal(attachmentHost.cur.cantBlock, true, `${name}: attached cant-block restriction`);
      if (operation.skipUntap) assert.equal(attachmentHost.cur.cantUntap, true, `${name}: attached skip-untap restriction`);
      return 1;
    }
    if (operation.kind === 'aura-target') {
      assert.equal(source.attachedTo, attachmentHost.iid, `${name}: Aura resolves attached to its chosen legal host`);
      assert.ok(attachmentHost.attachments.includes(source.iid), `${name}: host tracks Aura attachment`);
      return 1;
    }
    if (operation.kind === 'aura-etb-tap') {
      assert.equal(source.attachedTo, attachmentHost.iid, `${name}: Aura is attached before its ETB trigger resolves`);
      assert.equal(attachmentHost.tapped, true, `${name}: Aura ETB taps the enchanted permanent`);
      return 1;
    }
    if (operation.kind === 'equipment-equip') {
      fund(a);
      wantedTargets = [attachmentHost];
      const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.equip);
      assert.ok(action, `${name}: Equip action is offered`);
      assert.equal(await game.activateAbility(a, action), true, `${name}: Equip activates`);
      assert.equal(game.stack.at(-1)?.kind, 'ability', `${name}: Equip uses the Stack`);
      await resolveAll(game);
      const chosenHost=game.byIid(source.attachedTo);
      assert.ok(chosenHost?.is('Creature')&&chosenHost.ctrl===a,`${name}: Equip attaches to a controller-chosen legal creature`);
      if(role==='human')assert.equal(source.attachedTo, attachmentHost.iid, `${name}: Equip attaches to selected host`);
      return 1;
    }
    if (operation.kind === 'crew') {
      const helper = permanent(MTG, game, a, fixtureDefinition('Oracle Crew Helper', ['Creature'], {
        power: String(Math.max(1, operation.n)), toughness: '20',
      }));
      wantedCards = [helper];
      const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.crew);
      assert.ok(action, `${name}: Crew action is offered`);
      assert.equal(await game.activateAbility(a, action), true, `${name}: Crew activates`);
      assert.equal(game.stack.at(-1)?.kind, 'ability', `${name}: Crew uses the Stack`);
      await resolveAll(game);
      const crewCards = role === 'ai'
        ? context.aiDecisions.find(item => item.query.aiHint?.kind === 'crew' &&
          item.query.aiHint?.card === source)?.result
        : [helper];
      assert.ok(Array.isArray(crewCards) && crewCards.length > 0,
        `${name}/${role}: Crew controller selects one or more creatures`);
      assert.ok(crewCards.every(card => card.tapped), `${name}/${role}: Crew taps every selected creature`);
      assert.ok(crewCards.reduce((sum, card) => sum + Math.max(0, card.power), 0) >= operation.n,
        `${name}/${role}: selected creatures meet the Crew power threshold`);
      assert.equal(source.is('Creature'), true, `${name}: Crew turns Vehicle into a creature`);
      return 1;
    }
    if (operation.kind === 'self-pump-ability' || operation.kind === 'self-regenerate-ability' || operation.kind === 'self-keyword-ability') {
      fund(a);
      const ability = (source.def.abilities || []).find(candidate => {
        if (candidate.cost?.mana !== operation.cost) return false;
        if (operation.kind === 'self-regenerate-ability') return candidate.label === 'Regenerate';
        if (operation.kind === 'self-keyword-ability') return candidate.label === `Gain ${operation.keyword}`;
        return candidate.label === `${operation.power >= 0 ? '+' : ''}${operation.power}/${operation.toughness >= 0 ? '+' : ''}${operation.toughness}`;
      });
      const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.ability === ability);
      assert.ok(action, `${name}: matching activated ability is offered`);
      const powerBefore = source.power;
      const toughnessBefore = source.toughness;
      const shieldBefore = source.regenShield;
      assert.equal(await game.activateAbility(a, action), true, `${name}: activated ability uses the real activation path`);
      await resolveAll(game);
      if (operation.kind === 'self-pump-ability') {
        assert.equal(source.power, powerBefore + operation.power, `${name}: self-pump power`);
        assert.equal(source.toughness, toughnessBefore + operation.toughness, `${name}: self-pump toughness`);
      } else if (operation.kind === 'self-regenerate-ability') {
        assert.equal(source.regenShield, shieldBefore + 1, `${name}: regeneration shield created`);
      } else assert.equal(source.kw(operation.keyword), true, `${name}: gains ${operation.keyword}`);
      return 1;
    }
    if (operation.kind === 'controlled-creature-pump-static' || operation.kind === 'attacking-creature-pump-static') {
      const own = permanent(MTG, game, a, fixtureDefinition('Oracle Static Own', ['Creature'], { power: '20', toughness: '20' }));
      const hostile = permanent(MTG, game, b, fixtureDefinition('Oracle Static Hostile', ['Creature'], { power: '20', toughness: '20' }));
      if (operation.kind === 'attacking-creature-pump-static') {
        own.attacking = b;
        hostile.attacking = a;
      }
      game.recalc();
      assert.equal(own.power, 20 + operation.power, `${name}: own affected creature power`);
      assert.equal(own.toughness, 20 + operation.toughness, `${name}: own affected creature toughness`);
      assert.equal(hostile.power, 20, `${name}: opponent creature is excluded`);
      assert.equal(hostile.toughness, 20, `${name}: opponent creature toughness is excluded`);
      return 1;
    }
    if (operation.kind === 'global-creature-keyword-static') {
      const own = targetPermanent(MTG, game, a, 'creature');
      const hostile = targetPermanent(MTG, game, b, 'creature');
      game.recalc();
      assert.equal(own.kw(operation.keyword), true, `${name}: own creature gains ${operation.keyword}`);
      assert.equal(hostile.kw(operation.keyword), true, `${name}: opponent creature gains ${operation.keyword}`);
      return 1;
    }
    if (operation.kind === 'unblockable') {
      const blocker = targetPermanent(MTG, game, b, 'creature');
      assert.equal(game.canBlock(blocker, source), false, `${name}: unblockable changes combat legality`);
      return 1;
    }
    if (operation.kind === 'flying-blocker-only') {
      const ground = targetPermanent(MTG, game, b, 'creature');
      const flier = permanent(MTG, game, b, fixtureDefinition('Oracle Flying Attacker', ['Creature'], {
        kws: ['flying'], power: '2', toughness: '2',
      }));
      game.recalc();
      assert.equal(game.canBlock(source, ground), false, `${name}: cannot block a ground attacker`);
      assert.equal(game.canBlock(source, flier), true, `${name}: can block a flying attacker`);
      return 1;
    }
    if (operation.kind === 'protection-from') {
      const colors = { white: ['W'], blue: ['U'], black: ['B'], red: ['R'], green: ['G'] };
      const hostile = permanent(MTG, game, b, fixtureDefinition('Oracle Protected Source',
        operation.from === 'artifacts' ? ['Artifact', 'Creature'] : ['Creature'], {
          colorsOverride: colors[operation.from] || [], power: '3', toughness: '3',
        }));
      game.recalc();
      assert.equal(game.isProtectedFrom(source, hostile), true, `${name}: protection recognizes matching source quality`);
      const beforeDamage = source.damage;
      assert.equal(await game.damageCreature(hostile, source, 3), 0, `${name}: protection prevents damage`);
      assert.equal(source.damage, beforeDamage, `${name}: protected creature has no marked damage`);
      return 1;
    }
    if (operation.kind === 'mechanic-persist' || operation.kind === 'mechanic-undying') {
      await game.destroy(source);
      await resolveAll(game);
      assert.equal(source.zone, 'battlefield', `${name}: death mechanic returns the card`);
      const counter = operation.kind === 'mechanic-persist' ? '-1/-1' : '+1/+1';
      assert.equal(source.counters[counter], 1, `${name}: death mechanic adds ${counter}`);
      return 1;
    }
    if (operation.kind === 'mechanic-changeling') {
      assert.equal(source.hasSub('Elf'), true, `${name}: Changeling supplies Elf subtype`);
      assert.equal(source.hasSub('Goblin'), true, `${name}: Changeling supplies Goblin subtype`);
      assert.equal(source.hasSub('Equipment'), false, `${name}: Changeling excludes noncreature subtypes`);
      return 1;
    }
    assert.fail(`${name}: no executable operation proof for ${operation.kind}`);
  }

  fillLibrary(MTG, a, 30);
  fillLibrary(MTG, b, Math.max(30, (Number(operation.n) || 0) + 2));
  const staged = await stageSpellTarget(targetOperation);
  let { effectTarget, counterTarget } = staged;
  let secondaryTarget = null;
  let spellFodder = [];
  if (operation.kind === 'spell-team-pump') {
    effectTarget = targetPermanent(MTG, game, a, 'creature');
    secondaryTarget = targetPermanent(MTG, game, b, 'creature');
    if (operation.attackingOnly) {
      effectTarget.attacking = b;
      secondaryTarget.attacking = a;
      game.recalc();
    }
  } else if (operation.kind === 'spell-global-pump') {
    effectTarget = permanent(MTG, game, a, fixtureDefinition('Oracle Global Own', ['Creature'], { power: '20000', toughness: '20000' }));
    secondaryTarget = permanent(MTG, game, b, fixtureDefinition('Oracle Global Opponent', ['Creature'], { power: '20000', toughness: '20000' }));
  } else if (operation.kind === 'spell-discard') {
    for (let index = 0; index < operation.n + 2; index++) zoneCard(MTG, b, 'Forest', 'hand');
  } else if (operation.kind === 'spell-draw-discard') {
    spellFodder = Array.from({ length: operation.discard }, () => zoneCard(MTG, a, 'Forest', 'hand'));
    wantedCards = spellFodder;
  } else if (operation.kind === 'spell-token') {
    // Token baseline is captured below.
  } else if (operation.kind === 'spell-token-roll-threshold') {
    // Force a roll of 1 so the closed threshold branch is exercised too.
    game.rnd = () => 0;
  } else if (operation.kind === 'spell-counter-on-creature') {
    // Target was staged above.
  } else if (operation.kind === 'spell-destroy-all') {
    const singular = operation.what.slice(0, -1);
    const what = singular === 'creature' ? 'creature' : singular === 'artifact' ? 'artifact' : 'enchantment';
    effectTarget = targetPermanent(MTG, game, a, what);
    secondaryTarget = targetPermanent(MTG, game, b, what);
    if (operation.noRegen) {
      effectTarget.regenShield = 1;
      secondaryTarget.regenShield = 1;
    }
  }
  const lifeA = a.life;
  const lifeB = b.life;
  const libraryA = a.library.length;
  const libraryB = b.library.length;
  const graveyardA = a.graveyard.length;
  const handB = b.hand.length;
  const powerBefore = effectTarget && effectTarget.power;
  const toughnessBefore = effectTarget && effectTarget.toughness;
  const secondaryPowerBefore = secondaryTarget && secondaryTarget.power;
  const secondaryToughnessBefore = secondaryTarget && secondaryTarget.toughness;
  const tokenBefore = game.battlefield.filter(card => card.isToken && card.ctrl === a).length;
  const poolBefore = poolTotal(a);
  const spell = zoneCard(MTG, a, name, 'hand');
  const usesX = operation.n === 'X' || operation.power === 'X';
  const castOptions = usesX ? { from: 'hand', xVal: 3 } : { from: 'hand', alt: { free: true } };
  if (usesX) fund(a);
  assert.equal(await game.castSpell(a, spell, castOptions), true, `${name}: spell-template casts through real target/Stack path`);
  assert.equal(spell.zone, 'stack', `${name}: spell card is on Stack`);
  await resolveAll(game);
  const rebounds = operations.some(candidate => candidate.kind === 'mechanic-rebound');
  assert.equal(spell.zone, rebounds ? 'exile' : 'graveyard',
    `${name}: instant/sorcery reaches its rules-correct post-resolution zone`);
  if (rebounds) {
    assert.ok(game.delayed.some(effect => /Rebound/.test(effect.name)),
      `${name}: hand-cast Rebound spell schedules its next-upkeep cast`);
  }

  const totalSpellDraw = operations.reduce((sum, candidate) => sum +
    (candidate.kind === 'spell-draw' ? candidate.n : candidate.kind === 'spell-draw-discard' ? candidate.draw : 0), 0);
  const selectedSurveilCards = role === 'ai'
    ? context.aiDecisions.filter(item => item.query.type === 'scry' && item.query.surveil)
      .reduce((sum, item) => sum + (item.result?.bottom?.length || 0), 0)
    : operations.filter(candidate => candidate.kind === 'spell-surveil').length;
  if (operation.kind === 'spell-draw') {
    assert.equal(a.library.length, libraryA - totalSpellDraw - selectedSurveilCards, `${name}: exact composite spell draw`);
  }
  else if (operation.kind === 'spell-draw-discard') {
    assert.equal(a.library.length, libraryA - totalSpellDraw - selectedSurveilCards, `${name}: exact draw-discard draw count`);
    if (role === 'human') assert.ok(spellFodder.every(card => card.zone === 'graveyard'), `${name}: exact discard choices move to graveyard`);
    else assert.ok(a.graveyard.length >= graveyardA + operation.discard + 1,
      `${name}/${role}: AI discards the exact count and the resolving spell reaches graveyard`);
  }
  else if (operation.kind === 'spell-counter') assert.equal(counterTarget.card.zone, 'graveyard', `${name}: targeted spell is countered`);
  else if (operation.kind === 'spell-destroy') {
    assert.equal(effectTarget.zone, 'graveyard', operation.noRegen
      ? `${name}: target with a regeneration shield is still destroyed`
      : `${name}: target destroyed`);
  }
  else if (operation.kind === 'spell-exile') assert.equal(effectTarget.zone, 'exile', `${name}: target exiled`);
  else if (operation.kind === 'spell-bounce') assert.equal(effectTarget.zone, 'hand', `${name}: target returned to hand`);
  else if (operation.kind === 'spell-life-gain') assert.equal(a.life, lifeA + operation.n, `${name}: exact spell life gain`);
  else if (operation.kind === 'spell-discard') assert.equal(b.hand.length, handB - operation.n, `${name}: exact discard`);
  else if (operation.kind === 'spell-mill') assert.equal(b.library.length, libraryB - operation.n, `${name}: exact mill`);
  else if (operation.kind === 'spell-pump' || operation.kind === 'spell-team-pump') {
    const power = operation.power === 'X' ? 3 : operation.power;
    assert.equal(effectTarget.power, powerBefore + power, `${name}: exact power modifier`);
    assert.equal(effectTarget.toughness, toughnessBefore + operation.toughness, `${name}: exact toughness modifier`);
    for (const keyword of operation.keywords || []) assert.equal(effectTarget.kw(keyword), true, `${name}: grants ${keyword}`);
    if (operation.kind === 'spell-team-pump' && operation.attackingOnly && operation.controller === 'any') {
      assert.equal(secondaryTarget.power, secondaryPowerBefore + power, `${name}: affects an attacking opponent creature`);
      assert.equal(secondaryTarget.toughness, secondaryToughnessBefore + operation.toughness, `${name}: opponent toughness modifier`);
    }
  } else if (operation.kind === 'spell-damage') {
    const amount = operation.n === 'X' ? 3 : operation.n;
    if (operation.what === 'target creature' || operation.what === 'target creature or planeswalker') {
      assert.equal(effectTarget.damage, amount, `${name}: exact creature damage`);
    } else assert.equal(b.life, lifeB - amount, `${name}: exact player/opponent damage`);
  } else if (operation.kind === 'spell-global-pump') {
    assert.equal(effectTarget.power, powerBefore + operation.power, `${name}: global effect reaches own creature`);
    assert.equal(effectTarget.toughness, toughnessBefore + operation.toughness, `${name}: own toughness`);
    assert.equal(secondaryTarget.power, secondaryPowerBefore + operation.power, `${name}: global effect reaches opponent creature`);
    assert.equal(secondaryTarget.toughness, secondaryToughnessBefore + operation.toughness, `${name}: opponent toughness`);
  } else if (operation.kind === 'spell-graveyard-return') {
    assert.equal(effectTarget.zone, 'hand', `${name}: chosen graveyard card returns to hand`);
  } else if (operation.kind === 'spell-token') {
    const made = game.battlefield.filter(card => card.isToken && card.ctrl === a).slice(tokenBefore);
    assert.equal(made.length, operation.n, `${name}: exact spell token count`);
    if (operation.token) {
      assert.ok(made.every(card => card.name === operation.token.name), `${name}: exact spell token definition`);
      assert.ok(made.every(card => card.power === Number(operation.token.power) && card.toughness === Number(operation.token.toughness)),
        `${name}: exact spell token stats`);
    }
  } else if (operation.kind === 'spell-token-roll-threshold') {
    const made = game.battlefield.filter(card => card.isToken && card.ctrl === a).slice(tokenBefore);
    assert.equal(made.length, operation.n + operation.bonusN,
      `${name}: forced threshold success creates base and bonus tokens`);
    assert.ok(made.every(card => card.name === operation.token.name), `${name}: exact roll-threshold token definition`);
    assert.ok(made.every(card => card.hasSub(operation.compareSubtype)),
      `${name}: created tokens carry the counted threshold subtype`);
    assert.ok(made.every(card => card.power === Number(operation.token.power) && card.toughness === Number(operation.token.toughness)),
      `${name}: exact roll-threshold token stats`);
  } else if (operation.kind === 'spell-counter-on-creature') {
    assert.equal(effectTarget.counters[operation.counter], operation.n, `${name}: exact creature counter count`);
  } else if (operation.kind === 'spell-fog') {
    const attacker = targetPermanent(MTG, game, b, 'creature');
    const before = a.life;
    assert.equal(await game.damagePlayer(attacker, a, 3, { combat: true }), 0, `${name}: combat damage is prevented`);
    assert.equal(a.life, before, `${name}: prevented combat damage changes no life`);
    assert.equal(await game.damagePlayer(attacker, a, 2, { combat: false }), 2, `${name}: noncombat damage is not prevented`);
  } else if (operation.kind === 'spell-tap' || operation.kind === 'spell-untap') {
    for (const target of wantedTargets) {
      assert.equal(target.tapped, operation.kind === 'spell-tap', `${name}: ${operation.kind} changes selected target state`);
    }
    assert.equal(wantedTargets.length, operation.count, `${name}: exact target count was selected`);
  } else if (operation.kind === 'spell-scry' || operation.kind === 'spell-surveil') {
    const query = role === 'ai'
      ? context.aiTrace.find(candidate => candidate.type === 'scry') : selectionQuery;
    assert.ok(query, `${name}/${role}: spell library-selection decision executes`);
    assert.equal(query.cards.length, operation.n, `${name}/${role}: exact library-selection count`);
    assert.equal(!!query.surveil, operation.kind === 'spell-surveil', `${name}/${role}: exact scry/surveil mode`);
    if (role === 'human') {
      assert.equal(selectedLibraryCard.zone, operation.kind === 'spell-surveil' ? 'graveyard' : 'library', `${name}: selected card destination`);
    }
  } else if (operation.kind === 'spell-add-mana') {
    const expected = operation.produce.ANY ? Number(operation.produce.n || 1)
      : Object.values(operation.produce).reduce((sum, value) => sum + Number(value || 0), 0);
    assert.equal(poolTotal(a), poolBefore + expected, `${name}: exact mana added`);
  } else if (operation.kind === 'spell-destroy-all') {
    assert.equal(effectTarget.zone, 'graveyard', `${name}: board wipe reaches own matching permanent`);
    assert.equal(secondaryTarget.zone, 'graveyard', `${name}: board wipe reaches opposing matching permanent`);
  } else assert.fail(`${name}: no post-resolution proof for ${operation.kind}`);
  return 1;
}

async function keywordProof(MTG, entry, rawKeyword, role = 'human') {
  const keyword = mechanic(rawKeyword);
  let attacker;
  let blocker;
  const attackController = decision({
    attackers: (game) => [{ card: attacker, target: game.players[1] }],
  });
  const blockController = decision({
    blockers: () => blocker ? [{ blocker, attacker }] : [],
  });
  const context = gameFor(MTG, [attackController, blockController], { ai: role === 'ai' });
  const { game, a, b } = context;
  assertControllerRole(MTG, context, `${entry.raw.name}/${role}/${rawKeyword}`);
  const source = permanent(MTG, game, a, entry.raw.name);
  if (source.hasSub('Vehicle') && source.def.crew !== undefined && !source.is('Creature')) {
    permanent(MTG, game, a, fixtureDefinition('Oracle Keyword Crew Helper', ['Creature'], {
      power: String(Math.max(1, source.def.crew)), toughness: '20',
    }));
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.crew);
    assert.ok(action, `${source.name}: Vehicle keyword proof offers Crew`);
    assert.equal(await game.activateAbility(a, action), true, `${source.name}: Vehicle keyword proof crews source`);
    await resolveAll(game);
    assert.equal(source.is('Creature'), true, `${source.name}: Crew makes keyword-bearing Vehicle a creature`);
  }

  switch (keyword) {
    case 'flying': {
      const ground = permanent(MTG, game, b, 'Elite Vanguard');
      assert.equal(game.canBlock(ground, source), false, `${source.name}: flying evasion`);
      break;
    }
    case 'reach': {
      const flyer = permanent(MTG, game, b, 'A.I.M. Bot');
      assert.equal(game.canBlock(source, flyer), true, `${source.name}: reach blocks flying`);
      break;
    }
    case 'forestwalk':
    case 'plainswalk':
    case 'islandwalk':
    case 'swampwalk':
    case 'mountainwalk': {
      const land = keyword.replace('walk', '');
      const basic = land.charAt(0).toUpperCase() + land.slice(1);
      permanent(MTG, game, b, basic);
      const ground = permanent(MTG, game, b, 'Elite Vanguard');
      assert.equal(game.canBlock(ground, source), false, `${source.name}: ${keyword} evasion`);
      break;
    }
    case 'fear': {
      const ground = permanent(MTG, game, b, 'Elite Vanguard');
      const black = permanent(MTG, game, b, fixtureDefinition('Oracle Black Blocker', ['Creature'], { colorsOverride: ['B'], power: '2', toughness: '2' }));
      const artifact = permanent(MTG, game, b, fixtureDefinition('Oracle Artifact Creature', ['Artifact', 'Creature'], { power: '2', toughness: '2' }));
      assert.equal(game.canBlock(ground, source), false, `${source.name}: nonblack nonartifact cannot block fear`);
      assert.equal(game.canBlock(black, source), true, `${source.name}: black creature blocks fear`);
      assert.equal(game.canBlock(artifact, source), true, `${source.name}: artifact creature blocks fear`);
      break;
    }
    case 'intimidate': {
      const otherColor = ['W', 'U', 'B', 'R', 'G'].find(color => !source.colors.includes(color)) || 'W';
      const ground = permanent(MTG, game, b, fixtureDefinition('Oracle Nonshared Color Blocker', ['Creature'], {
        colorsOverride: [otherColor], power: '2', toughness: '2',
      }));
      const artifact = permanent(MTG, game, b, fixtureDefinition('Oracle Intimidate Artifact', ['Artifact', 'Creature'], { power: '2', toughness: '2' }));
      assert.equal(game.canBlock(ground, source), false, `${source.name}: nonartifact without shared color cannot block intimidate`);
      assert.equal(game.canBlock(artifact, source), true, `${source.name}: artifact creature blocks intimidate`);
      if (source.colors.length) {
        const shared = permanent(MTG, game, b, fixtureDefinition('Oracle Shared Color Blocker', ['Creature'], {
          colorsOverride: [source.colors[0]], power: '2', toughness: '2',
        }));
        assert.equal(game.canBlock(shared, source), true, `${source.name}: shared-color creature blocks intimidate`);
      }
      break;
    }
    case 'skulk': {
      const stronger = permanent(MTG, game, b, fixtureDefinition('Oracle Stronger Blocker', ['Creature'], {
        power: String(source.power + 1), toughness: '20',
      }));
      const equal = permanent(MTG, game, b, fixtureDefinition('Oracle Equal Blocker', ['Creature'], {
        power: String(source.power), toughness: '20',
      }));
      assert.equal(game.canBlock(stronger, source), false, `${source.name}: greater-power creature cannot block skulk`);
      assert.equal(game.canBlock(equal, source), true, `${source.name}: equal-power creature can block skulk`);
      break;
    }
    case 'shadow': {
      const normal = permanent(MTG, game, b, 'Elite Vanguard');
      const shadow = permanent(MTG, game, b, fixtureDefinition('Oracle Shadow Blocker', ['Creature'], {
        kws: ['shadow'], power: '2', toughness: '2',
      }));
      assert.equal(game.canBlock(normal, source), false, `${source.name}: non-shadow creature cannot block shadow`);
      assert.equal(game.canBlock(shadow, source), true, `${source.name}: shadow creature blocks shadow`);
      break;
    }
    case 'horsemanship': {
      const normal = permanent(MTG, game, b, 'Elite Vanguard');
      const mounted = permanent(MTG, game, b, fixtureDefinition('Oracle Horsemanship Blocker', ['Creature'], {
        kws: ['horsemanship'], power: '2', toughness: '2',
      }));
      assert.equal(game.canBlock(normal, source), false, `${source.name}: creature without horsemanship cannot block`);
      assert.equal(game.canBlock(mounted, source), true, `${source.name}: horsemanship creature can block`);
      break;
    }
    case 'menace': {
      attacker = source;
      blocker = permanent(MTG, game, b, 'Arachnoid');
      if (source.power < 1) game.addCounters(source, '+1/+1', 2, false, a);
      b.life = 1;
      const life = b.life;
      await game.combatPhase(a);
      assert.ok(b.life < life, `${source.name}: a single blocker is rejected by menace`);
      break;
    }
    case 'first strike': {
      if (source.power < 1) game.addCounters(source, '+1/+1', 1 - source.power, false, a);
      assert.ok(game.dmgAmount(source, 'first') > 0, `${source.name}: first-strike damage`);
      source.meta._dealtFirstStrike = true;
      if (!source.kw('double strike')) assert.equal(game.dmgAmount(source, 'normal'), 0, `${source.name}: no normal damage`);
      break;
    }
    case 'double strike': {
      if (source.power < 1) game.addCounters(source, '+1/+1', 1 - source.power, false, a);
      assert.ok(game.dmgAmount(source, 'first') > 0, `${source.name}: first damage step`);
      source.meta._dealtFirstStrike = true;
      assert.ok(game.dmgAmount(source, 'normal') > 0, `${source.name}: normal damage step`);
      break;
    }
    case 'deathtouch': {
      const victim = permanent(MTG, game, b, 'Aegis Turtle');
      await game.damageCreature(source, victim, 1);
      assert.equal(victim.zone, 'graveyard', `${source.name}: one damage is lethal`);
      break;
    }
    case 'lifelink': {
      const life = a.life;
      await game.damagePlayer(source, b, 1);
      assert.equal(a.life, life + 1, `${source.name}: controller gains dealt damage`);
      break;
    }
    case 'trample': {
      const victim = permanent(MTG, game, b, 'Elite Vanguard');
      game.addCounters(source, '+1/+1', 5, false, a);
      source.attacking = b;
      source.blockedBy = [victim];
      source.wasBlocked = true;
      victim.blocking = source.iid;
      game.combat = { attackers: [source], defenders: new Map() };
      const life = b.life;
      const poison=b.poison||0;
      await game.combatDamage(a, 'normal');
      assert.ok(source.kw('infect')?(b.poison||0)>poison:b.life < life, `${source.name}: excess combat damage tramples over`);
      break;
    }
    case 'wither': {
      const victim = permanent(MTG, game, b, 'Aegis Turtle');
      await game.damageCreature(source, victim, 1);
      assert.equal(victim.counters['-1/-1'], 1, `${source.name}: creature damage becomes -1/-1 counter`);
      break;
    }
    case 'haste': {
      source.sick = true;
      if (source.kw('defender')) {
        const tapAction = game.activatableList(a).find(candidate =>
          candidate.card === source && candidate.ability?.cost?.tap);
        assert.ok(tapAction, `${source.name}/${role}: haste exposes its tap ability through summoning sickness`);
        assert.equal(await game.activateAbility(a, tapAction), true,
          `${source.name}/${role}: haste activates its real tap ability immediately`);
        assert.equal(source.tapped, true, `${source.name}/${role}: haste ability pays the tap cost`);
        assert.equal(game.stack.at(-1)?.kind, 'ability', `${source.name}/${role}: haste ability reaches Stack`);
        break;
      }
      attacker = source;
      if (source.power < 2) game.addCounters(source, '+1/+1', 2 - source.power, false, a);
      b.life = 1;
      await game.combatPhase(a);
      assert.equal(a.turnState.attacked, true, `${source.name}/${role}: attacks through summoning sickness`);
      break;
    }
    case 'vigilance': {
      attacker = source;
      if (source.power < 2) game.addCounters(source, '+1/+1', 2 - source.power, false, a);
      b.life = 1;
      await game.combatPhase(a);
      assert.equal(source.tapped, false, `${source.name}: does not tap to attack`);
      break;
    }
    case 'defender':
      assert.equal(game.canAttackAtAll(source), false, `${source.name}: defender attack restriction`);
      break;
    case 'indestructible':
      await game.destroy(source);
      assert.equal(source.zone, 'battlefield', `${source.name}: survives destroy`);
      break;
    case 'hexproof': {
      const hostile = permanent(MTG, game, b, 'Elite Vanguard');
      assert.equal(game.legalTargets({ what: 'creature' }, hostile, b).includes(source), false, `${source.name}: opponent cannot target`);
      break;
    }
    case 'shroud':
      assert.equal(game.legalTargets({ what: 'creature' }, source, a).includes(source), false, `${source.name}: no player can target`);
      break;
    case 'ward': {
      const hostileCard = zoneCard(MTG, b, 'Murder', 'exile');
      const spell = { kind: 'spell', name: 'Murder', card: hostileCard, ctrl: b, targets: [source] };
      game.stack.push(spell);
      game.queueWardTriggers(spell, { wardTargets: [{ target: source, ward: source.cur.wardCost }] });
      const ward = game.pendingTriggers.find(trigger => trigger.src === source);
      assert.ok(ward, `${source.name}: targeting creates a Ward trigger`);
      await ward.run({ g: game, src: source, you: a, data: ward.data, targets: [] });
      assert.equal(spell.countered, true, `${source.name}: unpaid Ward counters the spell`);
      break;
    }
    case 'flash': {
      const card = new MTG.CardInst(source.def, a);
      card.zone = 'hand';
      a.hand.push(card);
      game.turnPlayer = b;
      game.phase = 'main1';
      assert.equal(game.canCastTiming(a, card), true, `${source.name}: casts outside sorcery timing`);
      break;
    }
    case 'prowess': {
      const before = source.power;
      const instances = (source.def.triggers || []).filter(trigger => trigger.desc === 'Prowess').length;
      assert.ok(instances > 0, `${source.name}: compiled prowess trigger instances`);
      const spell = zoneCard(MTG, a, 'Murder', 'exile');
      await game.emit('castNonCreature', { player: a, card: spell, mv: 3, so: { card: spell, ctrl: a } });
      await resolveAll(game);
      assert.equal(source.power, before + instances, `${source.name}: noncreature cast resolves every printed prowess instance`);
      break;
    }
    default:
      assert.fail(`${entry.raw.name}: no executable proof for declared keyword ${rawKeyword}`);
  }
  return 1;
}

test('svaki Oracle report je učitan u runtime i nightly minimum je eksplicitno podesiv', (t) => {
  const MTG = loadEngine();
  const reportNames = fs.readdirSync(path.join(root, 'reports', 'oracle-import'))
    .filter(name => /^batch-\d{4}\.json$/.test(name)).sort();
  const reports = reportNames.map(name => JSON.parse(fs.readFileSync(path.join(root, 'reports', 'oracle-import', name), 'utf8')));
  const runtime = new Map(genericBatches(MTG).map(batch => [batch.id, batch]));
  let reportCards = 0;
  for (const report of reports) {
    const batch = report.batch && Array.isArray(report.batch.cards) ? report.batch : report;
    reportCards += batch.cards.length;
    assert.ok(runtime.has(batch.id), `${batch.id}: report exists but runtime batch is not loaded`);
    assert.equal(runtime.get(batch.id).cards.length, batch.cards.length, `${batch.id}: report/runtime card count`);
    const modulePath = path.join(root, 'src', 'oracle-batches', `batch-${String(batch.sequence).padStart(4, '0')}.js`);
    assert.equal(fs.existsSync(modulePath), true, `${batch.id}: generated runtime module exists`);
  }
  const runtimeCards = [...runtime.values()].reduce((sum, batch) => sum + batch.cards.length, 0);
  const baselineCards = [...runtime.values()]
    .filter(batch => Number(batch.sequence) <= 3)
    .reduce((sum, batch) => sum + batch.cards.length, 0);
  const newCards = runtimeCards - baselineCards;
  assert.equal(runtimeCards, reportCards, 'every generic runtime card has exactly one report row');
  const nightlyMinimum = Number(process.env.ORACLE_MIN_CARDS || 0);
  const nightlyNewMinimum = Number(process.env.ORACLE_MIN_NEW_CARDS || 0);
  if (nightlyMinimum) assert.ok(runtimeCards >= nightlyMinimum, `nightly Oracle target ${nightlyMinimum}, found ${runtimeCards}`);
  if (nightlyNewMinimum) assert.ok(newCards >= nightlyNewMinimum, `nightly new-card target ${nightlyNewMinimum}, found ${newCards} above baseline ${baselineCards}`);
  t.diagnostic(`ORACLE_BATCH_COVERAGE batches=${runtime.size} cards=${runtimeCards} baseline=${baselineCards} new=${newCards} totalTarget=${nightlyMinimum || 'not-enforced'} newTarget=${nightlyNewMinimum || 'not-enforced'}`);
});

test('svaka generička Oracle karta i svaki deklarisani keyword imaju izvršni dokaz', async (t) => {
  const MTG = loadEngine();
  const proofFilter = String(process.env.ORACLE_PROOF_FILTER || '').trim().toLowerCase();
  const rows = genericEntries(MTG).filter(({ batch, entry }) =>
    (!process.env.ORACLE_PROOF_FIRST || batch.sequence>=Number(process.env.ORACLE_PROOF_FIRST)) &&
    (!process.env.ORACLE_PROOF_LAST || batch.sequence<=Number(process.env.ORACLE_PROOF_LAST)) &&
    (!proofFilter || entry.raw.name.toLowerCase().includes(proofFilter)));
  assert.ok(rows.length, `Oracle proof filter has fixtures: ${proofFilter || 'all'}`);
  let cardExecutions = 0;
  let keywordExecutions = 0;
  let operationExecutions = 0;
  let operationRouteExecutions = 0;
  const keywordCounts = {};
  const operationCounts = {};
  const templateCounts = {};
  const failures = [];

  for (const { batch, entry } of rows) {
    const audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: entry.raw.name }] }, MTG.DEFS);
    assert.equal(audit.ready, true, `${batch.id}/${entry.raw.name}: ${JSON.stringify(audit.unsupported)}`);
    const cardContract = baseContract(entry);
    assert.ok(cardContract, `${entry.raw.name}: known runtime card type`);
    assert.ok(audit.contracts.some(contract => contract.id === cardContract), `${entry.raw.name}: ${cardContract} contract`);
    const operations = entry.implementation || [];
    for (const role of ['human', 'ai']) {
      let cardPassed = true;
      if (operations.length) {
        for (const operation of operations) {
          try {
            operationExecutions += await operationProof(MTG, entry, operation, role);
            operationRouteExecutions += 1;
            operationCounts[`${role}:${operation.kind}`] = (operationCounts[`${role}:${operation.kind}`] || 0) + 1;
          } catch (error) {
            cardPassed = false;
            failures.push(`${batch.id}/${entry.raw.name}/${role}/${operation.kind}: ${process.env.ORACLE_PROOF_DEBUG?error.stack:error.message}`);
          }
        }
        if (cardPassed) cardExecutions += 1;
      } else {
        try {
          cardExecutions += await cardProof(MTG, entry, role);
        } catch (error) {
          cardPassed = false;
          failures.push(`${batch.id}/${entry.raw.name}/${role}/card: ${error.message}`);
        }
      }
      if (cardPassed) templateCounts[`${role}:${entry.semanticClass}`] = (templateCounts[`${role}:${entry.semanticClass}`] || 0) + 1;
      for (const declared of declaredKeywordOccurrences(MTG, entry)) {
        const key = mechanic(declared);
        const contract = MTG.ORACLE_KEYWORD_CONTRACTS[key];
        assert.ok(contract, `${entry.raw.name}: declared ${declared} has a contract`);
        assert.ok(audit.contracts.some(item => item.id === contract), `${entry.raw.name}: audit exposes ${contract}`);
        try {
          keywordExecutions += await keywordProof(MTG, entry, declared, role);
          keywordCounts[`${role}:${key}`] = (keywordCounts[`${role}:${key}`] || 0) + 1;
        } catch (error) {
          failures.push(`${batch.id}/${entry.raw.name}/${role}/keyword-${declared}: ${error.message}`);
        }
      }
    }
  }

  const declaredKeywordTotal = rows.reduce((sum, row) => sum + declaredKeywordOccurrences(MTG, row.entry).length, 0);
  const declaredOperationTotal = rows.reduce((sum, row) => sum + (row.entry.implementation || []).length, 0);
  assert.equal(failures.length, 0, `Oracle executable-proof failures (${failures.length}):\n${failures.join('\n')}`);
  assert.equal(cardExecutions, rows.length * 2, 'one real human and local-AI land-play/cast/resolution proof per Oracle card');
  assert.equal(keywordExecutions, declaredKeywordTotal * 2, 'one human and local-AI proof per declared keyword occurrence');
  assert.equal(operationRouteExecutions, declaredOperationTotal * 2,
    'one human and local-AI route per compiled operation occurrence');
  assert.ok(operationExecutions >= operationRouteExecutions,
    'nested effect/mode/cost proofs never undercount operation routes');
  t.diagnostic(`ORACLE_INTERACTION_COVERAGE cards=${cardExecutions}/${rows.length * 2} keywords=${keywordExecutions}/${declaredKeywordTotal * 2} operationRoutes=${operationRouteExecutions}/${declaredOperationTotal * 2} nestedProofs=${operationExecutions} pct=100 controllers=human+local-ai`);
  t.diagnostic(`ORACLE_TEMPLATE_COVERAGE ${JSON.stringify(Object.fromEntries(Object.entries(templateCounts).sort()))}`);
  t.diagnostic(`ORACLE_INTERACTION_MATRIX ${JSON.stringify(Object.fromEntries(Object.entries(keywordCounts).sort()))}`);
  t.diagnostic(`ORACLE_OPERATION_MATRIX ${JSON.stringify(Object.fromEntries(Object.entries(operationCounts).sort()))}`);
});

test('interaction gate odbija lažni marker, nepoznat keyword i nevažeće manual/template contracte', () => {
  const MTG = loadEngine();
  const generic = genericEntries(MTG)[0].entry.raw.name;
  const genericScript = MTG.SCRIPTS[generic];
  const genericCatalog = MTG.CARD_CATALOG[generic];
  const originalMarker = genericScript.oracleImplemented;
  const originalKeywords = genericCatalog.implementedKeywords;
  try {
    genericScript.oracleImplemented = false;
    let audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: generic }] }, MTG.DEFS);
    assert.equal(audit.ready, false);
    assert.ok(audit.unsupported.some(item => item.reason === 'missing-oracle-implementation-marker'));

    genericScript.oracleImplemented = true;
    genericCatalog.implementedKeywords = ['future-unsupported-keyword'];
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: generic }] }, MTG.DEFS);
    assert.equal(audit.ready, false);
    assert.ok(audit.unsupported.some(item => item.reason === 'no-interaction-contract:future-unsupported-keyword'));
  } finally {
    genericScript.oracleImplemented = originalMarker;
    genericCatalog.implementedKeywords = originalKeywords;
  }

  const manual = 'Sauron, the Dark Lord';
  const manualScript = MTG.SCRIPTS[manual];
  const originalContracts = manualScript.oracleContracts;
  try {
    manualScript.oracleContracts = [];
    let audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: manual }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'missing-manual-interaction-contracts'));
    manualScript.oracleContracts = ['not-a-real-contract'];
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: manual }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'unknown-manual-contract:not-a-real-contract'));
  } finally {
    manualScript.oracleContracts = originalContracts;
  }

  const template = genericEntries(MTG).find(row => (row.entry.implementation || []).length).entry.raw.name;
  const templateScript = MTG.SCRIPTS[template];
  const templateContracts = templateScript.oracleContracts;
  const templateImplementation = templateScript.oracleImplementation;
  try {
    templateScript.oracleContracts = [];
    let audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: template }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'missing-template-interaction-contracts'));

    templateScript.oracleContracts = templateContracts;
    templateScript.oracleImplementation = templateImplementation.slice(0, -1);
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: template }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'compiled-template-mismatch'));

    templateScript.oracleImplementation = templateImplementation;
    templateScript.oracleContracts = ['not-a-real-template-contract'];
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: template }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'unknown-template-contract:not-a-real-template-contract'));
  } finally {
    templateScript.oracleContracts = templateContracts;
    templateScript.oracleImplementation = templateImplementation;
  }
});

test('Tunnel Surveyor pravi 1/1 bijeli Enchantment Creature — Glimmer token', async () => {
  const MTG = loadEngine();
  const context = gameFor(MTG);
  fillLibrary(MTG, context.a, 5);
  await enterPermanentProof(MTG, context, genericEntries(MTG).find(row => row.entry.raw.name === 'Tunnel Surveyor').entry);
  const tokens = context.game.battlefield.filter(card => card.isToken && card.ctrl === context.a && card.hasSub('Glimmer'));
  assert.equal(tokens.length, 1);
  const token = tokens[0];
  assert.equal(token.is('Enchantment'), true);
  assert.equal(token.is('Creature'), true);
  assert.deepEqual(Array.from(token.def.subtypes), ['Glimmer']);
  assert.deepEqual(Array.from(token.colors), ['W']);
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
});

test('Thor Odinson ima dvije odvojene prowess instance i dobija +2/+2 po noncreature castu', async () => {
  const MTG = loadEngine();
  const { game, a } = gameFor(MTG);
  fillLibrary(MTG, a, 5);
  const thor = permanent(MTG, game, a, 'Thor Odinson');
  const prowess = thor.def.triggers.filter(trigger => trigger.desc === 'Prowess');
  assert.equal(prowess.length, 2, 'printed prowess, prowess creates two trigger instances');
  const beforePower = thor.power;
  const beforeToughness = thor.toughness;
  const spell = zoneCard(MTG, a, 'Brilliant Plan', 'hand');
  assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
  await resolveAll(game);
  assert.equal(thor.power, beforePower + 2);
  assert.equal(thor.toughness, beforeToughness + 2);
});

test('ukradeni Oracle dies-draw crta LKI kontroloru, a ne owneru', async () => {
  const MTG = loadEngine();
  const { game, a: owner, b: controller } = gameFor(MTG);
  fillLibrary(MTG, owner, 5);
  fillLibrary(MTG, controller, 5);
  const stolen = permanent(MTG, game, owner, 'Buzz Bots');
  stolen.ctrl = controller;
  game.recalc();
  const ownerLibrary = owner.library.length;
  const controllerLibrary = controller.library.length;
  await game.destroy(stolen);
  await resolveAll(game);
  assert.equal(stolen.owner, owner);
  assert.equal(stolen.zone, 'graveyard');
  assert.equal(owner.library.length, ownerLibrary, 'owner does not draw');
  assert.equal(controller.library.length, controllerLibrary - 1, 'last known controller draws');
});

test('two-brid plaćanje pokriva krajnje, miješane i normal-plus-two-brid kombinacije', async () => {
  const MTG = loadEngine();
  const printedCost = '{2/R}{2/R}{2/R}';
  assert.equal(MTG.mv(printedCost), 6);
  assert.equal(MTG.costStr(MTG.parseCost(printedCost)), printedCost, 'public mana-cost text never leaks the internal TWO marker');
  const definition = MTG.DEFS['Flame Javelin'];
  const probe = new MTG.CardInst(definition, null);
  assert.equal(probe.mv, 6);

  const castWith = async pool => {
    let target = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(target) ? [target] : query.candidates.slice(0, query.min || 0),
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    target = b;
    Object.assign(a.pool, pool);
    const before = b.life;
    const spell = zoneCard(MTG, a, 'Flame Javelin', 'hand');
    assert.equal(await game.castSpell(a, spell, { from: 'hand' }), true, `cast with ${JSON.stringify(pool)}`);
    assert.equal(spell.zone, 'stack');
    await resolveAll(game);
    assert.equal(spell.zone, 'graveyard');
    assert.equal(b.life, before - 4);
    assert.equal(poolTotal(a), 0, 'all supplied mana is paid');
  };

  await castWith({ R: 3 });
  await castWith({ R: 2, C: 2 });
  await castWith({ R: 1, C: 4 });
  await castWith({ C: 6 });

  const castMixedCost = async (pool, expected) => {
    const { game, a } = gameFor(MTG);
    Object.assign(a.pool, pool);
    const definition = fixtureDefinition('Oracle Normal Plus Two-Brid', ['Instant'], {
      cost: '{1}{U}{2/R}',
    });
    const spell = new MTG.CardInst(definition, a);
    spell.zone = 'hand';
    a.hand.push(spell);
    const beforePool = poolTotal(a);
    assert.equal(await game.castSpell(a, spell, { from: 'hand' }), expected,
      `normal plus two-brid with ${JSON.stringify(pool)}`);
    if (expected) {
      assert.equal(spell.zone, 'stack');
      await resolveAll(game);
      assert.equal(spell.zone, 'graveyard');
      assert.equal(poolTotal(a), 0);
    } else {
      assert.equal(spell.zone, 'hand');
      assert.equal(poolTotal(a), beforePool, 'rejected mixed payment spends no mana');
    }
  };

  await castMixedCost({ U: 1, R: 1, C: 1 }, true);
  await castMixedCost({ U: 1, C: 3 }, true);
  await castMixedCost({ U: 1, C: 2 }, false);
});

test('Oracle any-target burn vidi Battle, stvarni handleETB postavlja defense i damage ga skida', async () => {
  const MTG = loadEngine();

  const castAtBattle = async (name, amount, castOptions, pool = {}) => {
    let battle = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(battle) ? [battle] : query.candidates.slice(0, query.min || 0),
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    Object.assign(a.pool, pool);
    battle = new MTG.CardInst(fixtureDefinition('Oracle Battle Target', ['Battle'], { defense: '10' }), b);
    battle.zone = 'hand';
    b.hand.push(battle);
    await game.move(battle, 'battlefield');
    assert.equal(battle.counters.defense, 10, `${name}: handleETB initializes printed defense`);
    const spell = zoneCard(MTG, a, name, 'hand');
    const specs = game.spellTargetSpecs(spell, castOptions.alt || {}, a);
    assert.ok(specs && specs.length, `${name}: any-target spec`);
    assert.equal(game.legalTargets(specs[0], spell, a).includes(battle), true, `${name}: Battle is a legal any target`);
    assert.equal(await game.castSpell(a, spell, castOptions), true, `${name}: casts targeting Battle`);
    assert.equal(game.stack.at(-1).targets[0], battle, `${name}: Battle target is locked on Stack`);
    await resolveAll(game);
    assert.equal(battle.counters.defense, 10 - amount, `${name}: damage removes defense counters`);
    assert.equal(battle.damage, 0, `${name}: Battle does not receive creature marked damage`);
    assert.equal(battle.zone, 'battlefield');
  };

  await castAtBattle('Lightning Bolt', 3, { from: 'hand', alt: { free: true } });
  await castAtBattle('Blaze', 3, { from: 'hand', xVal: 3 }, { R: 1, C: 3 });
});

test('Oracle composite targeti izvršavaju svaku alternativu i permanent/nonland filtere', async () => {
  const MTG = loadEngine();
  const rows = genericEntries(MTG);
  const find = (kind, what) => {
    for (const { entry } of rows) {
      const operation = (entry.implementation || []).find(candidate =>
        candidate.kind === kind && candidate.what === what && candidate.n !== 'X');
      if (operation) return { entry, operation };
    }
    assert.fail(`missing Oracle fixture for ${kind}/${what}`);
  };

  const castAt = async ({ entry, operation }, buildTarget, verify, verifyCandidates) => {
    let target = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(target) ? [target] : [],
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    target = buildTarget(game, a, b);
    game.recalc();
    const spell = zoneCard(MTG, a, entry.raw.name, 'hand');
    const spec = MTG.SCRIPTS[entry.raw.name].targets[0];
    const candidates = game.legalTargets(spec, spell, a);
    assert.ok(candidates.includes(target), `${entry.raw.name}: alternate ${operation.what} target is legal`);
    if (verifyCandidates) verifyCandidates({ game, a, b, spell, candidates });
    const before = {
      loyalty: target.counters.loyalty || 0,
      life: target.life,
    };
    assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
    await resolveAll(game);
    await verify({ game, a, b, target, before, operation });
  };

  await castAt(find('spell-exile', 'artifact or enchantment'),
    (game, a, b) => permanent(MTG, game, b, fixtureDefinition('Oracle Enchantment Alternative', ['Enchantment'])),
    async ({ target }) => assert.equal(target.zone, 'exile'));

  await castAt(find('spell-destroy', 'creature or planeswalker'),
    (game, a, b) => {
      const target = permanent(MTG, game, b, fixtureDefinition('Oracle Planeswalker Alternative', ['Planeswalker'], { loyalty: '8' }));
      target.counters.loyalty = 8;
      return target;
    },
    async ({ target }) => assert.equal(target.zone, 'graveyard'));

  for (const what of ['target creature or planeswalker', 'target player or planeswalker']) {
    await castAt(find('spell-damage', what),
      (game, a, b) => {
        const target = permanent(MTG, game, b, fixtureDefinition(`Oracle ${what} Alternative`, ['Planeswalker'], { loyalty: '20' }));
        target.counters.loyalty = 20;
        return target;
      },
      async ({ target, before, operation }) => {
        assert.equal(target.counters.loyalty, before.loyalty - operation.n,
          `${operation.what}: Planeswalker loses loyalty`);
      });
  }

  let excludedLand = null;
  await castAt(find('spell-bounce', 'nonland permanent'),
    (game, a, b) => {
      excludedLand = permanent(MTG, game, b, 'Forest');
      return permanent(MTG, game, b, fixtureDefinition('Oracle Nonland Alternative', ['Enchantment']));
    },
    async ({ target }) => assert.equal(target.zone, 'hand'),
    ({ candidates }) => assert.equal(candidates.includes(excludedLand), false, 'nonland filter excludes a land'));

  await castAt(find('spell-destroy', 'permanent'),
    (game, a, b) => permanent(MTG, game, b, 'Forest'),
    async ({ target }) => assert.equal(target.zone, 'graveyard'));
});

test('Oracle spell resolver guardovi su sigurni za stale/uncounterable/empty target stanja', async () => {
  const MTG = loadEngine();
  const rows = genericEntries(MTG).map(row => row.entry);
  const scriptFor = kind => {
    const entry = rows.find(candidate => (candidate.implementation || []).some(operation => operation.kind === kind));
    assert.ok(entry, `fixture for ${kind}`);
    return MTG.SCRIPTS[entry.raw.name];
  };
  let chooseCardsCalled = false;
  const { game, a, b } = gameFor(MTG, [decision(), decision({
    chooseCards: () => {
      chooseCardsCalled = true;
      throw new Error('empty discard guard should not ask for cards');
    },
  })]);
  const source = zoneCard(MTG, a, 'Forest', 'exile');

  const counter = scriptFor('spell-counter');
  await counter.resolve({ g: game, src: source, you: a, targets: [] });
  const staleCard = zoneCard(MTG, b, 'Brilliant Plan', 'exile');
  const stale = { kind: 'spell', card: staleCard, ctrl: b, targets: [] };
  await counter.resolve({ g: game, src: source, you: a, targets: [stale] });
  assert.equal(staleCard.zone, 'exile', 'stale stack target is untouched');

  const uncounterableCard = new MTG.CardInst(fixtureDefinition('Oracle Uncounterable Guard', ['Instant'], {
    uncounterable: true,
  }), b);
  uncounterableCard.zone = 'stack';
  const uncounterable = { kind: 'spell', card: uncounterableCard, ctrl: b, targets: [] };
  game.stack.push(uncounterable);
  await counter.resolve({ g: game, src: source, you: a, targets: [uncounterable] });
  assert.ok(game.stack.includes(uncounterable), 'uncounterable target remains on Stack');

  for (const kind of ['spell-destroy', 'spell-exile', 'spell-damage', 'spell-bounce', 'spell-mill']) {
    await scriptFor(kind).resolve({ g: game, src: source, you: a, targets: [] });
  }
  await scriptFor('spell-discard').resolve({ g: game, src: source, you: a, targets: [] });
  await scriptFor('spell-discard').resolve({ g: game, src: source, you: a, targets: [b] });
  assert.equal(chooseCardsCalled, false, 'empty hand exits before discard choice');
});

test('svih deset Oracle Phyrexian-cost karata traži dva života po neplaćenom PHY pipu', async () => {
  const MTG = loadEngine();
  const entries = genericEntries(MTG).map(row => row.entry)
    .filter(entry => /\{[WUBRG]\/P\}/.test(entry.raw.cost || ''));
  assert.equal(entries.length, 10);

  const attempt = async (entry, { life, pool, expected, resolve = true }) => {
    let wantedTarget = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(wantedTarget)
        ? [wantedTarget] : query.candidates.slice(0, query.min || 0),
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    a.life = life;
    Object.assign(a.pool, pool);
    if (entry.raw.name === 'Dismember') wantedTarget = targetPermanent(MTG, game, b, 'creature');
    else if (entry.raw.name === 'Mutagenic Growth') wantedTarget = targetPermanent(MTG, game, a, 'creature');
    else if (entry.raw.name === 'Gut Shot') wantedTarget = b;
    const card = zoneCard(MTG, a, entry.raw.name, 'hand');
    const lifeBefore = a.life;
    const poolBefore = poolTotal(a);
    const cast = await game.castSpell(a, card, { from: 'hand' });
    assert.equal(cast, expected, `${entry.raw.name}: payment ${JSON.stringify({ life, pool })}`);
    if (!expected) {
      assert.equal(card.zone, 'hand', `${entry.raw.name}: rejected cast leaves card in hand`);
      assert.equal(a.life, lifeBefore, `${entry.raw.name}: rejected cast pays no life`);
      assert.equal(poolTotal(a), poolBefore, `${entry.raw.name}: rejected cast pays no mana`);
      return { game, a, card };
    }
    assert.equal(card.zone, 'stack', `${entry.raw.name}: accepted payment puts spell on Stack`);
    if (resolve) {
      await resolveAll(game);
      const destination = entry.raw.types.includes('Creature') ? 'battlefield' : 'graveyard';
      assert.equal(card.zone, destination, `${entry.raw.name}: resolves through its real card-type path`);
    }
    return { game, a, card };
  };

  for (const entry of entries) {
    const parsed = MTG.parseCost(entry.raw.cost);
    const phy = parsed.pips.filter(pip => pip.includes('PHY'));
    assert.ok(phy.length > 0, `${entry.raw.name}: parsed PHY pips`);
    const genericPool = parsed.generic ? { C: parsed.generic } : {};

    await attempt(entry, {
      life: phy.length * 2 - 1,
      pool: genericPool,
      expected: false,
    });

    const lifePayment = await attempt(entry, {
      life: phy.length * 2 + 5,
      pool: genericPool,
      expected: true,
    });
    assert.equal(lifePayment.a.life, 5, `${entry.raw.name}: exactly two life per PHY pip`);

    const manaPool = { C: parsed.generic };
    for (const pip of phy) {
      const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol));
      manaPool[color] = (manaPool[color] || 0) + 1;
    }
    const manaPayment = await attempt(entry, { life: 9, pool: manaPool, expected: true });
    assert.equal(manaPayment.a.life, 9, `${entry.raw.name}: colored mana pays PHY without life`);

    if (phy.length > 1) {
      const mixedPool = { C: parsed.generic };
      const color = phy[0].find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol));
      mixedPool[color] = 1;
      const mixed = await attempt(entry, { life: 7, pool: mixedPool, expected: true });
      assert.equal(mixed.a.life, 5, `${entry.raw.name}: mixed mana plus life payment`);
    }
  }

  const gutShot = entries.find(entry => entry.raw.name === 'Gut Shot');
  await attempt(gutShot, { life: 1, pool: {}, expected: false, resolve: false });
  const exactBoundary = await attempt(gutShot, { life: 2, pool: {}, expected: true, resolve: false });
  assert.equal(exactBoundary.a.life, 0, 'Gut Shot may pay exactly two life down to zero');
});

test('new v5 legendary creatures execute command-zone casting, return choice and commander tax for both controllers', async t => {
  const MTG=loadEngine();
  const rows=MTG.ORACLE_BATCHES.filter(batch=>batch.sequence>=47&&batch.sequence<=66).flatMap(batch=>batch.cards)
    .filter(entry=>entry.raw.super.includes('Legendary')&&entry.raw.types.includes('Creature'));
  assert.equal(rows.length,37);
  let casts=0;
  for(const entry of rows)for(const role of ['human','ai']) {
    const context=gameFor(MTG,[decision({chooseOption:(g,q)=>q.options.find(o=>o.key==='cz')?.key||q.options[0].key}),decision()],{ai:role==='ai'});
    const {game,a}=context;fund(a,50);fillLibrary(MTG,a,30);
    for(const operation of entry.implementation)if(operation.kind==='characteristic-pt'&&operation.count.kind==='count')stageCount(MTG,context,operation.count,v5Helpers());
    const card=zoneCard(MTG,a,entry.raw.name,'command');card.commander=true;card.cmdCasts=0;a.commanders.push(card);
    const base=game.spellCost(a,card,{});
    assert.equal(await game.castSpell(a,card,{from:'command'}),true,entry.raw.name+'/'+role+' first paid command cast');await resolveAll(game);
    assert.equal(card.zone,'battlefield',entry.raw.name);assert.equal(card.cmdCasts,1);assert.equal(card.castMeta.from,'command');
    await game.exileCard(card);await resolveAll(game);assert.equal(card.zone,'command',entry.raw.name+'/'+role+' command return');
    fund(a,50);const taxed=game.spellCost(a,card,{});assert.equal(taxed.generic,base.generic+2,entry.raw.name+' tax');
    assert.equal(await game.castSpell(a,card,{from:'command'}),true);await resolveAll(game);assert.equal(card.zone,'battlefield');assert.equal(card.cmdCasts,2);casts+=2;
  }
  t.diagnostic(`V5_COMMANDERS candidates=${rows.length} roles=2 paidCasts=${casts}`);
});
