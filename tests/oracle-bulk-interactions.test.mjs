import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';
import {stageV8Effect,assertV8Effect,finishV8EffectProof} from './helpers/oracle-v8-effect-proof.mjs';
import { replacementProof, untapProof, commanderPairingProof, bestowProof } from './helpers/oracle-v8-permanent-proof.mjs';
import { auraControlProof } from './helpers/oracle-v8-control-proof.mjs';
import { fireV8Event } from './helpers/oracle-v8-event-proof.mjs';
import { faceProofEntry, withFaceProof, proofDefinition, installFaceProof, selectFixtureFace, assertFaceZoneCard } from './helpers/oracle-v8-face-proof.mjs';
import { installPaymentProof, stagePaymentEffect, preparePaymentSource, assertPaymentEffect } from './helpers/oracle-v8-payment-proof.mjs';
import { installCopyLinkedProof, stageCopyLinkedEffect, prepareCopyLinkedSource, assertCopyLinkedEffect, copyEntryProof, finishCopyLinkedProof } from './helpers/oracle-v8-copy-linked-proof.mjs';
import { stageActivatedCost, assertActivatedCost, assertActivatedManaCost } from './helpers/oracle-v8-activated-cost-proof.mjs';
import { mayhemProof } from './helpers/oracle-v8-mayhem-proof.mjs';
import { stageCondition, stageFalseCondition, stageCount, countValue, matches as v5Matches, matchesTarget, characteristicProof, combatRestrictionProof, staticProof as v5StaticProof, mechanicKinds, mechanicProof as v5MechanicProof } from './helpers/oracle-v5-proof.mjs';

const v5Helpers=()=>({gameFor,decision,fund,constrainSquadMana,fillLibrary,zoneCard,permanent,fixtureDefinition,resolveAll,stageGenericTarget,stageGenericStackTarget,stageSpellV4Target,spellV4TargetVariants,semanticSubtypeFixture});

const v8Helpers=()=>({...v5Helpers(),stageCardCosts,fireGenericEvent,assertControllerRole,cardState,genericProofSnapshot,installEffectEvidence,grantedEffectProof,grantedManaProof,assertGenericEffectEvidence});
const flattenProofEffects=effects=>(effects||[]).flatMap(effect=>[effect,...flattenProofEffects(effect.effects),...flattenProofEffects(effect.elseEffects)]);

function prepareGenericCountSource(context,operation,source){
  if(source.zone!=='battlefield')return;
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    if(node.kind==='source-counters'){
      const missing=Math.max(0,3-(source.counters[node.counter]||0));
      if(missing)context.game.addCounters(source,node.counter,missing,false,source.ctrl);
    }
    for(const [key,child]of Object.entries(node))if(!['condition','activationCondition'].includes(key)&&child&&typeof child==='object')Array.isArray(child)?child.forEach(visit):visit(child);
  };
  visit(operation.effects);
}

function installEffectEvidence(context){
  if(context.moveEvidence)return;
  const {game}=context;
  context.exploreEvidence=[];context.dredgeEvidence=[];const originalEmit=game.emit;game.emit=async function(name,data,...args){if(name==='explored')context.exploreEvidence.push({...data});if(name==='dredged')context.dredgeEvidence.push({...data});return originalEmit.call(this,name,data,...args);};
  context.counterChangeEvidence=[];context.usedCounterChanges=new Set();
  for(const [method,action]of [['addCounters','counter'],['removeCounters','remove-counter']]){
    const original=game[method];game[method]=function(card,kind,n,...args){
      const row={card,kind,n,action,zoneVersion:card.zoneVersion,before:card.counters[kind]||0,snapshot:genericProofSnapshot(context,[card])};
      const result=original.call(this,card,kind,n,...args);row.after=card.counters[kind]||0;
      context.counterChangeEvidence.push(row);return result;
    };
  }
  context.millEvidence=[];const originalMill=game.mill;game.mill=async function(player,n,...args){const top=player.library.slice(-n),result=await originalMill.call(this,player,n,...args);context.millEvidence.push({player,n,cards:top.filter(card=>card.zone==='graveyard')});return result;};
  context.damageEvidence=[];const originalDamage=game.damageAny;game.damageAny=async function(source,target,n,...args){const row={target,source,n,before:genericProofSnapshot(context,[])};context.damageEvidence.push(row);row.actual=await originalDamage.call(this,source,target,n,...args);row.after=genericProofSnapshot(context,[]);return row.actual;};
  context.batchEvidence=[];const originalBatch=game.damageBatch;game.damageBatch=async function(hits,...args){const row={hits:hits.slice(),before:genericProofSnapshot(context,[])};context.batchEvidence.push(row);row.actual=await originalBatch.call(this,hits,...args);row.after=genericProofSnapshot(context,[]);return row.actual;};
  context.moveEvidence=[];const originalMove=game.move;game.move=async function(card,to,...args){const row={card,from:card.zone,to,before:cardState(card)};const result=await originalMove.call(this,card,to,...args);row.after=cardState(card);row.top=card.owner.library.at(-1);row.bottom=card.owner.library[0];context.moveEvidence.push(row);return result;};
  context.sacrificeEvidence=[];const sacrificedStats=card=>({power:Number(card?.power)||0,toughness:Number(card?.toughness)||0,mv:Number(card?.mv)||0});
  const originalSacrifice=game.sacrifice;game.sacrifice=async function(player,card,...args){const row={player,card,from:card?.zone,...sacrificedStats(card)};const result=await originalSacrifice.call(this,player,card,...args);row.to=card?.zone;context.sacrificeEvidence.push(row);return result;};
  const originalSacrificeMany=game.sacrificeMany;game.sacrificeMany=async function(player,cards,...args){const rows=cards.map(card=>({player,card,from:card.zone,...sacrificedStats(card)})),result=await originalSacrificeMany.call(this,player,cards,...args);for(const row of rows){row.to=row.card.zone;context.sacrificeEvidence.push(row);}return result;};
  context.destroyEvidence=[];const originalDestroy=game.destroyMany;game.destroyMany=async function(cards,...args){const row={cards:cards.slice(),before:genericProofSnapshot(context,cards)};row.actual=await originalDestroy.call(this,cards,...args);context.destroyEvidence.push(row);return row.actual;};
  context.lifeEvidence=[];const originalLoseLife=game.loseLife;game.loseLife=async function(player,n,...args){const row={player,n,before:player.life};row.actual=await originalLoseLife.call(this,player,n,...args);row.after=player.life;context.lifeEvidence.push(row);return row.actual;};
  context.drawEvidence=[];const originalDraw=game.draw;game.draw=async function(player,n,source,...args){const row={player,n,source,library:player.library.length},beforeDraw=player.turnState.drewThisTurn||0;const result=await originalDraw.call(this,player,n,source,...args);row.drawn=(player.turnState.drewThisTurn||0)-beforeDraw;context.drawEvidence.push(row);return result;};
}

function stageCardCosts(MTG,ctx,entry){
  const stage=cost=>{
    if(cost.kind==='exileGraveyard')for(let i=0;i<cost.quantity.min;i++)zoneCard(MTG,ctx.a,fixtureDefinition('V7 required exile '+i,cost.object.types||['Creature'],{power:'2',toughness:'2'}),'graveyard');
    if(cost.kind==='sacrifice')permanent(MTG,ctx.game,ctx.a,fixtureDefinition('V6 required sacrifice',cost.object.types||['Creature'],{super:['Legendary'],power:'0',toughness:'20'}));
    if(cost.kind==='discard')for(let i=0;i<cost.quantity.min;i++)zoneCard(MTG,ctx.a,'Forest','hand');
    for(const child of cost.options||cost.costs||[])stage(child);
  };
  for(const op of entry.implementation||[])if(op.kind==='mechanic-additional-costs')for(const cost of op.costs)stage(cost);
  for(const op of entry.implementation||[])if(op.kind==='generic-trigger'&&op.event==='etb')for(const effect of op.effects||[])if(effect.action==='unless-cost'&&effect.who==='you'&&effect.payment.zone){
    const cost=effect.payment;
    for(let i=0;i<cost.n*3;i++){const card=stageGenericTarget(MTG,ctx,{...cost.filter,controller:'you',zone:cost.zone==='hand'?'graveyard':'battlefield'},'entry-payment-'+i);if(cost.zone==='hand'){card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone='hand';card.owner.hand.push(card);}}
  }
}

async function stageGenericStackTarget(MTG,ctx,target,index,from=target.castFrom||'hand'){
  if(target.threshold==='X')return stageGenericStackTarget(MTG,ctx,{...target,threshold:3},index,from);
  if(typeof target.threshold==='object'){
    stageCount(MTG,ctx,target.threshold,v5Helpers());
    return stageGenericStackTarget(MTG,ctx,{...target,threshold:Math.max(0,countValue(ctx,null,target.threshold))},index,from);
  }
  const {game,b}=ctx,q=target.spellQuality||'any',colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
  const f=target.spellFilter?.alternatives?.[0]||target.spellFilter;
  const rawType=f?.what?.split(' or ')[0]||q;
  const type=['creature','artifact','enchantment','instant','sorcery'].includes(rawType)?rawType[0].toUpperCase()+rawType.slice(1):'Instant';
  const card=new MTG.CardInst(fixtureDefinition('V6 stack target '+index,[type],{cost:target.stat==='mv'?'{'+target.threshold+'}':'{0}',subtypes:f?.subtype?[f.subtype]:[],super:target.legendary||f?.legendary?['Legendary']:[],kws:ctx.preserveCastTurn?['flash']:[],colorsOverride:(target.colorsAny||f?.colorsAny)?.slice(0,1)||(colors[f?.color||q]?[colors[f?.color||q]]:q==='multicolored'?['G','W']:[]),power:'2',toughness:'20'}),b);
  fund(b);
  card.zone=from;b[from].push(card);const phase=game.phase,active=game.turnPlayer;game.phase='main1';if(!ctx.preserveCastTurn)game.turnPlayer=b;
  if(from==='exile'){card.meta.playableBy=b;card.meta.playableUntil=game.turnNo;}
  if(from==='graveyard')card.meta.emryCastTurn=game.turnNo;
  try{const row=game.castableList(b).find(row=>row.card===card);assert.ok(row,'cast-quality probe has a real zone permission');assert.equal(await game.castSpell(b,card,{from,alt:row.alt}),true);}finally{game.phase=phase;game.turnPlayer=active;}
  return game.stack.find(object=>object.card===card);
}

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
  installFaceProof(MTG, game);
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
  const sacrificeEvidence=[],emit=game.emit;game.emit=async function(event,data){if(event==='sacrificed')sacrificeEvidence.push({...data.snap});return emit.call(this,event,data);};
  return { game, a, b, aiTrace, aiDecisions,sacrificeEvidence, role: options.ai ? 'ai' : 'human' };
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
  selectFixtureFace(MTG, game, card);
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function zoneCard(MTG, player, name, zone) {
  const card = new MTG.CardInst(typeof name==='string'?MTG.DEFS[name]:name, player);
  card.zone = zone;
  assertFaceZoneCard(player.game, card);
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
      ? Math.max(1, (proofDefinition(MTG, entry).triggers || []).filter(trigger => trigger.desc === 'Prowess').length)
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
function prepareConditionPayment(MTG,context,entry){
  const condition=context.paymentCondition;if(!condition)return null;
  if(condition.kind==='no-mana-spent')return {free:true};
  if(condition.kind!=='mana-spent')return null;
  const cost=MTG.parseCost(entry.raw.cost);for(const color of Object.keys(context.a.pool))context.a.pool[color]=0;
  for(const pip of cost.pips){const symbol=pip.find(c=>'WUBRGC'.includes(c));context.a.pool[symbol]=(context.a.pool[symbol]||0)+1;}
  let extra=0;const needed=Object.fromEntries(condition.colors.map(color=>[color,condition.min||condition.colors.filter(c=>c===color).length]));for(const [color,n]of Object.entries(needed)){extra+=Math.max(0,n-(context.a.pool[color]||0));context.a.pool[color]=Math.max(context.a.pool[color]||0,n);}
  context.a.pool.C=(context.a.pool.C||0)+Math.max(0,cost.generic-extra);return null;
}

function constrainSquadMana(MTG,player,entry){
  const squad=entry.implementation?.find(operation=>['mechanic-squad','mechanic-multikicker','mechanic-replicate'].includes(operation.kind));if(!squad)return;
  // Controlled per-card proofs fund three copies. Separate boundary tests
  // exercise larger legal payments; hundreds of fixtures need not deck out.
  const base=MTG.parseCost(entry.raw.cost),extra=MTG.parseCost(squad.cost);
  for(const color of ['W','U','B','R','G','C'])player.pool[color]=0;
  player.pool.C=base.generic+(base.x||0)*3+extra.generic*3;
  for(const pip of [...base.pips,...Array.from({length:3},()=>extra.pips).flat()]){
    const color=pip.find(value=>['W','U','B','R','G','C'].includes(value));
    assert.ok(color,'Squad proof pays a concrete mana symbol');player.pool[color]++;
  }
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
    ctrl: card.ctrl,
    attacking: card.attacking, blocking: card.blocking,
    types: (card.zone==='battlefield'?card.cur?.types||[]:card.def?.types||[]).slice(),
    subtypes: (card.zone==='battlefield'?card.cur?.subtypes||[]:card.def?.subtypes||[]).slice(),
    colors: (card.colors||[]).slice(),
    keywords: card.zone==='battlefield'?[...(card.cur?.kw||[])]:[...(card.def?.kws||[])],
    tapped: !!card.tapped,
    power: Number(card.power) || 0,
    toughness: Number(card.toughness) || 0,
    mv: Number(card.mv)||0,
    damage: Number(card.damage)||0,
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
    pool: {...player.pool},
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
  if(target.threshold==='X')return stageGenericTarget(MTG,context,{...target,threshold:3},index,effect);
  if(['source-stat','explicit-source-stat'].includes(target.threshold?.kind))return stageGenericTarget(MTG,context,{...target,threshold:0},index,effect);
  if(typeof target.threshold==='object'){
    stageCount(MTG,context,target.threshold,v5Helpers());
    const threshold=countValue(context,null,target.threshold);
    return stageGenericTarget(MTG,context,{...target,threshold:Math.max(0,threshold)},index,effect);
  }
  if(target.alternatives)return stageGenericTarget(MTG,context,{...target,...target.alternatives[0],alternatives:target.alternatives[0].alternatives,...(target.controller&&target.controller!=='any'?{controller:target.controller}:{}),zone:target.zone,min:target.min,max:target.max,excludeSelf:target.excludeSelf},index,effect);
  if(target.unbounded||Number(target.max)>1)return Array.from({length:target.unbounded?3:target.max},(_,n)=>stageGenericTarget(MTG,context,{...target,unbounded:false,max:1,min:1},index+'-'+n,effect));
  const { game, a, b } = context;
  const beneficial=['regenerate','prevent-next','attach-source','unblockable-until-eot','become-copy-v8'].includes(effect?.action)||effect?.action==='counter'&&!['-1/-1','stun'].includes(effect.counter)||effect?.action==='pump'&&(effect.power||0)>=0&&(effect.toughness||0)>=0;
  const controller = target.controller === 'you' ? a : target.controller==='opponent'||target.controller==='defending-player'?b:beneficial?a:b;
  const what = String(target.what || 'creature').toLowerCase();
  if (what === 'player' || what === 'opponent' || what === 'any' || what === 'player or planeswalker') {
    return what === 'player' && target.controller === 'you' ? a : b;
  }
  let types = ['Creature'];
  if (what === 'artifact') types = ['Artifact'];
  else if (what === 'enchantment') types = ['Enchantment'];
  else if (what === 'land') types = ['Land'];
  else if (what === 'planeswalker') types = ['Planeswalker'];
  else if (what === 'permanent' || what === 'nonland permanent') types = ['Enchantment'];
  else if (what === 'artifact or enchantment') types = ['Artifact'];
  else if (what === 'artifact or land' || what === 'artifact or creature') types = ['Artifact'];
  else if (what === 'enchantment or land') types = ['Enchantment'];
  else if (what === 'instant or sorcery' || what === 'instant') types = ['Instant'];
  else if (what === 'sorcery') types = ['Sorcery'];
  else if (what === 'card') types = ['Creature'];
  if(target.notType==='Creature'&&types.includes('Creature'))types=['Enchantment'];
  if(target.excludedTypes?.some(type=>types.includes(type)))types=[['Instant','Enchantment','Artifact','Creature','Land'].find(type=>!target.excludedTypes.includes(type))];
  const definition = fixtureDefinition(`Oracle Generic Target ${index}`, types, {
    power: types.includes('Creature') ? '20000' : undefined,
    toughness: types.includes('Creature') ? '20000' : undefined,
  });
  if(target.withKeyword)definition.kws=[target.withKeyword];
  if(target.alsoType&&!definition.types.includes(target.alsoType))definition.types.push(target.alsoType);
  if(target.colorsAny)definition.colorsOverride=[target.colorsAny[0]];
  if(target.subtype)definition.subtypes=[target.subtype];
  if(target.subtype==='Aura')definition.auraTarget=[{what:'creature',filter:(game,card)=>card.is?.('Creature')}];
  if(types.includes('Planeswalker'))definition.loyalty='20000';
  if(target.notSubtype)definition.subtypes=['Other'];
  if(target.snow)definition.super=['Snow'];
  if(target.basic)definition.super=[...(definition.super||[]),'Basic'];
  if(target.legendary)definition.super=[...(definition.super||[]),'Legendary'];
  if(target.color)definition.colorsOverride=target.color==='colorless'?[]:target.color==='multicolored'?['G','W']:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[target.color]||'G'];
  if(target.notColor==='colorless')definition.colorsOverride=['G'];
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
  if(target.owner==='you')card.owner=a;
  if(target.commander)card.commander=true;
  if(target.anyCounter)card.counters.charge=1;
  if(target.damagedThisTurn)card.meta._lastDamageVisual={turn:game.turnNo,sourceId:0};
  if(target.enteredThisTurn)card.meta._enteredTurn=game.turnNo;
  if(target.attackedThisTurn)card.meta._attackedTurn=game.turnNo;
  if (effect?.action==='untap')card.tapped=true;
  if (target.hasCounter)game.addCounters(card,target.hasCounter,1,false,controller);
  if(types.includes('Planeswalker')&&zone==='battlefield')card.counters.loyalty=20000;
  if (target.token) card.isToken = true;
  if (target.subtype === 'Aura' && zone === 'battlefield') {
    const host=permanent(MTG,game,controller,'Grizzly Bears');
    card.attachedTo=host.iid;host.attachments.push(card.iid);
  }
  if (target.enchanted || target.equipped) {
    const attachment=permanent(MTG,game,controller,fixtureDefinition('V6 target attachment',[target.enchanted?'Enchantment':'Artifact'],{subtypes:[target.enchanted?'Aura':'Equipment']}));
    attachment.attachedTo=card.iid;card.attachments.push(attachment.iid);
  }
  if (target.attacking || target.attackingOrBlocking || target.controller === 'defending-player') card.attacking = a;
  if (target.blocking) card.blocking = 1;
  if (target.stat && target.stat!=='mv') {
    card.def[target.stat] = String(target.threshold);
    game.recalc();
  }
  game.recalc();
  return card;
}

function genericEffectTarget(effect, selectedTargets, source, context = {}) {
  if(effect.target==='attached-host')return context.game.byIid(source.attachedTo);
  if(effect.target?.kind==='locked-player')return selectedTargets[effect.target.index];
  if(effect.target?.kind==='target-controller')return selectedTargets[effect.target.index]?.ctrl;
  if(effect.target?.kind==='target-owner'){const subject=selectedTargets[effect.target.index];return subject?.card?.owner||subject?.owner;}
  if(effect.target==='event-card')return context.eventCard;
  if(effect.target==='event-player')return context.eventPlayer;
  if(effect.target==='event-card-controller')return context.eventController;
  if (effect.target === 'you') return source.ctrl;
  if (effect.target === 'self') return source;
  if (typeof effect.target === 'number') {const selected=selectedTargets[effect.target];return Array.isArray(selected)&&!selected.length?undefined:selected;}
  return null;
}

function genericEffectPlayer(effect, selectedTargets, source, owner, damagedPlayer, context = {}) {
  if(effect.who?.kind==='locked-player')return selectedTargets[effect.who.index];
  if(effect.who?.kind==='target-controller')return selectedTargets[effect.who.index]?.ctrl;
  if(effect.who?.kind==='target-owner'){const subject=selectedTargets[effect.who.index];return subject?.card?.owner||subject?.owner;}
  if(effect.who==='event-player')return context.eventPlayer;
  if(effect.who==='event-card-controller')return context.eventController;
  if (effect.who === 'you') return owner;
  if (typeof effect.who === 'number') return selectedTargets[effect.who];
  if (effect.action === 'discard-damaged-player') return damagedPlayer;
  return source && source.ctrl;
}

// A printed "if X is N or more" branch is only reachable when the proof cast
// announces at least that X. Three stays the default for every other spell.
function proofXValue(operation){
  let value=3;
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    if(node.kind==='x-range'&&Number.isFinite(Number(node.min)))value=Math.max(value,Number(node.min));
    for(const child of Object.values(node))Array.isArray(child)?child.forEach(visit):visit(child);
  };
  visit(operation);
  return value;
}

function genericProofSnapshot(context, trackedCards) {
  return {
    players: new Map(context.game.players.map(player => [player, playerState(player)])),
    cards: new Map([...new Set([...trackedCards,...context.game.battlefield])].filter(Boolean).map(card => [card, cardState(card)])),
    battlefield: context.game.battlefield.slice(),
    tokenCount: context.game.battlefield.filter(card => card.isToken).length,
    monarch: context.game.monarch || null,
    millEvidenceIndex:context.millEvidence?.length||0,
    damageEvidenceIndex:context.damageEvidence?.length||0,
    batchEvidenceIndex:context.batchEvidence?.length||0,
    moveEvidenceIndex:context.moveEvidence?.length||0,
    lifeEvidenceIndex:context.lifeEvidence?.length||0,
    drawEvidenceIndex:context.drawEvidence?.length||0,
    exploreEvidenceIndex:context.exploreEvidence?.length||0,
    counterChangeEvidenceIndex:context.counterChangeEvidence?.length||0,
  };
}

async function assertGenericEffectEvidence(MTG, context, entry, effect, source, selectedTargets,
  damagedPlayer, before, trace, label) {
  const { game, a, b } = context;
  const runtimeEffect=context.proofRuntimeEffects?.get(effect)||effect;
  if(await assertPaymentEffect(MTG,context,entry,runtimeEffect,source,selectedTargets,damagedPlayer,before,trace,label,v8Helpers()))return;
  if(await assertCopyLinkedEffect(MTG,context,entry,runtimeEffect,label,v8Helpers()))return;
  if(await assertV8Effect(MTG,context,entry,runtimeEffect,source,selectedTargets,damagedPlayer,before,trace,label,v8Helpers()))return;
  const subject = genericEffectTarget(effect, selectedTargets, source, context);
  if(effect.action==='choose-keyword'){
    const choice=trace.find(row=>row.query.prompt==='Choose a keyword');assert.ok(choice,label+': keyword choice reaches actual controller');assert.ok(effect.choices.includes(choice.result));for(const card of [subject].flat()){assert.equal(card.kw(choice.result),true,label+': selected keyword granted');const old=before.cards.get(card);if(old){assert.equal(card.power,old.power+effect.power);assert.equal(card.toughness,old.toughness+effect.toughness);}}return;
  }
  if(effect.action==='backup'){
    const card=subject;assert.equal(card.counters['+1/+1'],(before.cards.get(card)?.counters['+1/+1']||0)+effect.n,label+': backup counter placed');
    for(const keyword of effect.keywords)assert.ok(card.kw(keyword),label+': printed below-backup keyword available');
    if(card!==source)for(const operation of effect.operations)await grantedEffectProof(MTG,context,entry,{target:effect.target,operation},source,selectedTargets,trace,label+'/backup');return;
  }
  if(effect.action==='exile-source'){assert.equal(source.zone,source.isToken?'ceased':'exile',label+': exact source exiled');if(source.isToken)assert.ok(context.moveEvidence.some(row=>row.card===source&&row.to==='exile'&&row.from==='battlefield'),label+': token actually entered exile before ceasing');return;}
  if(effect.action==='exile-resolving-spell'){assert.equal(source.zone,'exile',label+': resolving spell exiles itself');return;}
  if(effect.action==='return-grave-source'){assert.equal(source.zone,effect.destination,label+': exact graveyard source returns');if(effect.destination==='battlefield'){assert.equal(source.ctrl,a);if(effect.tapped)assert.equal(source.tapped,true);for(const [kind,n]of Object.entries(effect.additionalCounters||{}))assert.equal(source.counters[kind],n);}return;}
  const player = genericEffectPlayer(effect, selectedTargets, source, a, damagedPlayer, context);
  if(effect.action==='unless-cost'){
    if(['each-player','each-opponent'].includes(effect.who)){
      const bind=value=>Array.isArray(value)?value.map(bind):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['target','who'].includes(key)&&item===effect.who?0:bind(item)])):value;
      for(const payer of game.players.filter(p=>effect.who==='each-player'||p!==a))await assertGenericEffectEvidence(MTG,context,entry,{...effect,who:0,effects:effect.effects.map(bind)},source,[payer],damagedPlayer,before,trace.filter(row=>!row.query.player||row.query.player===payer),label+'/player-'+payer.idx);
      return;
    }
    const payment=trace.findLast(row=>row.query.type==='chooseOption'&&row.query.prompt==='Pay to avoid the Oracle effect?'&&(!row.query.player||row.query.player===player));
    if(payment&&(payment.result==='yes'||String(payment.result).startsWith('pay-'))){
      const cost=payment.query.options.find(option=>option.key===payment.result)?.payment||effect.payment,old=before.players.get(player);
      if(cost.kind==='mana')assert.ok(poolTotal(player)<Object.values(old.pool).reduce((sum,n)=>sum+n,0),label+': optional mana payment spent');
      else if(cost.kind==='life')assert.ok(player.life<=old.life-cost.n,label+': optional life payment spent');
      else {const choices=trace.filter(row=>row.query.type==='chooseCards'&&row.query.prompt==='Choose cards for Oracle payment'&&(!row.query.player||row.query.player===player));if(!cost.random){assert.ok(choices.length,label+': actual cost choice');const cards=choices.at(-1).result;assert.equal(cards.length,cost.n);for(const card of cards)assert.ok(cost.kind==='tap'?card.tapped:cost.kind==='return'?card.zone==='hand':['graveyard','ceased','exile'].includes(card.zone),label+': chosen cost paid');}else assert.ok(old.handCards.some(card=>card.zone!=='hand'),label+': random card discarded');}
    }else for(const child of effect.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/unpaid');
    return;
  }
  if(effect.action==='discard-hand-draw'){
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(p=>p!==a):[player];
    for(const p of players){const old=before.players.get(p),draw=effect.n==='discarded'?old.handCards.length:effect.n;assert.ok(old.handCards.every(card=>card.zone!=='hand'),label+': original hand discarded');assert.equal(p.library.length,old.library-Math.min(draw,old.library),label+': redraw uses this player\'s count');}return;
  }
  const amount=(value,snapshot=before)=>{
    if(value==null)return 0;
    if(typeof value==='number')return value;
    if(value==='X')return before.oracleX??1;
    if(typeof value!=='object')return effectAmount(value,1);
    if(value.kind==='payment-stat')return Math.max(0,Number(context.oraclePaymentCapture?.cards?.[0]?.before?.[value.stat])||0)*(value.multiply??1);
    if(value.kind==='payment-count')return Math.max(0,Number(context.oraclePaymentCapture?.count)||0)*(value.multiply??1);
    if(value.kind==='sacrificed-stat')return Math.max(0,context.sacrificeEvidence.at(-1)?.[value.stat]||0);
    if(value.kind==='grave-source-power')return Math.max(0,Number(entry.raw.power)||0);
    if(value.kind==='target-stat'){const target=[selectedTargets[value.target]].flat()[0];return Math.max(0,snapshot.cards.get(target)?.[value.stat]||0);}
    if(value.kind==='target-count'){const target=genericEffectTarget({target:value.target},selectedTargets,source,context);return countValue({...context,a:target},source,value.count,snapshot)*(value.multiply??1);}
    if(value.kind==='affected-player-count')return countValue({...context,a:player},source,value.count,snapshot)*(value.multiply??1);
    if(value.kind==='signed')return value.sign*amount(value.value,snapshot);
    if(value.kind==='paid-times')return source.castMeta?.paidTimes||0;
    if(value.kind==='sum')return value.values.reduce((sum,v)=>sum+amount(v,snapshot),0)*(value.multiply??1);
    if(value.kind==='event-card-counters')return (context.eventCardBefore?.counters?.[value.counter]||0)*(value.multiply??1);
    if(value.kind==='event-card-stat')return Math.max(0,context.eventCardStats?.[value.stat]??context.eventCardBefore?.[value.stat]??0);
    if(['count','max-stat','source-counters','died-count','devotion','party','turn-count','source-attachments','opponent-poison-total','opponent-count','creature-total-power'].includes(value.kind))return countValue(context,source,value,snapshot)*(value.multiply??1);
    if(['source-stat','explicit-source-stat'].includes(value.kind))return Math.max(0,snapshot.cards.get(source)?.[value.stat]??Number(entry.raw[value.stat]));
    if(value.kind==='event-amount')return context.eventAmount??2;
    if(value.kind==='life-total')return snapshot.players.get(a).life;
    if(value.kind==='damage-dealt')return (context.lastDamageProofTotal??context.batchEvidence?.at(-1)?.actual??0)*(value.multiply??1);
    if(value.kind==='life-lost')return context.lifeEvidence.slice(before.lifeEvidenceIndex).reduce((sum,row)=>sum+row.actual,0)*(value.multiply??1);
    if(value.kind==='destroyed-count')return (context.destroyEvidence?.at(-1)?.actual||0)*(value.multiply??1);
    assert.fail('Missing proof amount '+JSON.stringify(value));
  };
  const n = ['token-inline','token-key'].includes(effect.action)&&effect.n?.kind==='count'&&effect.n.zone==='battlefield'?countValue(context,source,effect.n,{...before,battlefield:game.bf().filter(card=>before.battlefield.includes(card))})*(effect.n.multiply??1):amount(effect.n);
  const oldSubject = subject && (before.cards.get(subject)||(subject===context.eventCard?context.eventCardBefore:null));
  const oldPlayer = player && before.players.get(player);
  const queryKinds = trace.map(item => item.query.type);
  const action = effect.action;
  if(action==='damage-batch'){
    const expectedFor=snapshot=>{
      const expected=[];
      for(const hit of effect.hits){
        const view=card=>{const saved=snapshot.cards.get(card);return saved?{...card,...saved,is:type=>saved.types.includes(type),hasSub:type=>saved.subtypes.includes(type),kw:keyword=>saved.keywords.includes(keyword)}:card;};
        const recipients=hit.filters?snapshot.battlefield.filter(card=>hit.filters.some(filter=>matchesTarget(view(card),filter,context,source))):hit.target==='each-player'?game.players.slice():hit.target==='each-opponent'?game.players.filter(player=>player!==a):[genericEffectTarget(hit,selectedTargets,source,context)].flat().filter(Boolean);
        if(hit.players)recipients.push(...game.players.filter(player=>hit.players==='each-player'||player!==a));
        const origin=hit.sourceTarget!==undefined?[selectedTargets[hit.sourceTarget]].flat()[0]:hit.source==='event-card'?context.eventCard:source;
        if(!origin)continue;
        for(const target of new Set(recipients))expected.push({source:hit.selfDamageStat?target:origin,target,n:hit.selfDamageStat?Math.max(0,snapshot.cards.get(target)?.[hit.selfDamageStat]||0):amount(hit.n,snapshot)});
      }
      return expected;
    };
    const same=(x,y)=>x===y||x?.iid!==undefined&&x.iid===y?.iid;
    const rows=context.batchEvidence.slice(before.batchEvidenceIndex||0);
    const witness=rows.find(row=>{const expected=expectedFor(row.before);return expected.length===row.hits.length&&expected.every((hit,index)=>same(hit.source,row.hits[index].src)&&hit.target===row.hits[index].target&&hit.n===row.hits[index].n);});
    assert.ok(witness,label+': complete simultaneous damage recipients, sources and amounts match');
    const actual=context.damageEvidence.filter(row=>witness.hits.some(hit=>same(hit.src,row.source)&&hit.target===row.target&&hit.n===row.n));
    for(const row of actual){
      assert.ok(Number.isFinite(row.actual)&&row.actual>=0,label+': damage pipeline reports an exact result');
      if(!row.actual)continue;
      if(row.target instanceof MTG.Player){const old=row.before.players.get(row.target),after=row.after.players.get(row.target);assert.ok(after.life<old.life||after.poison>old.poison||row.source.ctrl===row.target&&row.source.kw('lifelink'),label+': actual damage changes life or poison');}
      else {const old=row.before.cards.get(row.target),after=row.after.cards.get(row.target);assert.ok(after&&(after.damage>old.damage||(after.counters['-1/-1']||0)>(old.counters['-1/-1']||0)||(after.counters.loyalty||0)<(old.counters.loyalty||0)||(after.counters.defense||0)<(old.counters.defense||0)),label+': actual permanent damage changes tracked state');}
    }
    assert.ok(!witness.hits.some(hit=>hit.n>0)||actual.some(row=>row.actual>0)||witness.hits.every(hit=>hit.n<=0||hit.target.kw?.('protection')||hit.target.counters?.shield),label+': nonzero damage has a positive result');
    context.lastDamageProofTotal=witness.actual;return;
  }
  if(action==='counter-spells'){const objects=context.counterGroupFixtures.get(effect);assert.ok(objects?.length,label+': actual spell group staged');for(const object of objects){assert.ok(context.counterEvidence.some(row=>row.object===object&&row.result===true),label+': actual group spell was countered');assert.equal(game.stack.includes(object),false);}return;}
  if(action==='combat-mana'){assert.equal(a.pool.R,before.players.get(a).pool.R+n,label+': firebending adds exact red mana');assert.ok(a.poolMeta.some(row=>row.color==='R'&&row.persist==='combat'&&row.n===n),label+': mana retention is attached to the produced units');return;}
  if(action==='combat-restriction'){
    const cards=effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean);
    if(!cards.length&&typeof effect.target==='number'){
      // "Those creatures" follows an up-to-N group: an empty legal group
      // leaves nothing to restrict, so the printed rule is already satisfied.
      const owner=(entry.implementation||[]).find(candidate=>(candidate.effects||[]).includes(effect));
      if(owner?.targets?.[effect.target]?.min===0)return;
    }
    assert.ok(cards.length,label+': combat recipients exist');for(const card of cards)if(card.zone==='battlefield'){
      assert.ok(game.untilEffects.some(row=>row.kind==='oracleCombatRestriction'&&row.iid===card.iid&&row.zoneVersion===card.zoneVersion&&row.expires===effect.duration),label+': exact object and duration recorded');
      await combatRestrictionProof(MTG,context,card,effect.restriction,v5Helpers(),label);
    }return;
  }
  if(action==='exile-top'){
    const players=effect.who==='you'?[a]:effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(player=>player!==a):[effect.who==='event-player'?damagedPlayer:selectedTargets[effect.who]];
    for(const player of players){const cards=n>0?before.players.get(player).libraryCards.slice(-n):[];for(const card of cards){assert.equal(card.zone,'exile',label+': top card exiled');if(effect.permission){assert.equal(card.meta.playableBy,a);assert.equal(card.meta.spellsOnly,!!effect.permission.spellsOnly);assert.equal(card.meta.anyColor,!!effect.permission.anyColor);}else assert.equal(card.meta.playableBy,undefined);}}return;
  }
  if(action==='owner-library-choice'){
    const decision=trace.find(row=>row.query.aiHint?.kind==='oracleLibraryChoice');assert.ok(decision,label+': owner chooses placement');assert.equal(subject.zone,subject.isToken?'ceased':'library');if(!subject.isToken)assert.equal((decision.result==='bottom'?subject.owner.library[0]:subject.owner.library.at(-1)).iid,subject.iid);return;
  }
  if(action==='inspect-top'){
    const inspected=effect.who==='you'?a:selectedTargets[effect.who],card=before.players.get(inspected).libraryCards.at(-1);assert.ok(card,label+': top card exists');
    const moves=trace.filter(row=>row.query.type==='chooseOption'&&row.query.prompt.startsWith('Move the inspected card'));
    const matches=!effect.filter||matchesTarget(card,effect.filter,context,source),moved=effect.destination&&matches&&(!effect.optionalMove||moves[0]?.result==='yes');
    if(moved){assert.equal(card.zone,effect.destination,label+': inspected destination');if(effect.tapped)assert.equal(card.tapped,true);}
    else if(effect.otherwise&&moves.at(-1)?.result==='yes'){assert.equal(card.zone,effect.otherwise==='bottom'?'library':effect.otherwise);if(effect.otherwise==='bottom')assert.equal(inspected.library[0],card);}
    else assert.equal(card.zone,'library');
    if(effect.loseLife)assert.equal(a.life,before.players.get(a).life-card.mv);return;
  }
  if(action==='grant-protection'){
    const cards=effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean);
    assert.ok(cards.length,label+': protection recipient');for(const card of cards){const record=game.untilEffects.find(row=>row.kind==='oracleProtection'&&row.iid===card.iid);assert.ok(record,label+': protected object recorded');for(const quality of record.qualities){
      const origin=quality.kind==='filters'?stageGenericTarget(MTG,context,quality.filters[0],'protection-origin'):permanent(MTG,game,b,fixtureDefinition('Protection source',[quality.kind==='type'?quality.value:'Creature'],{power:'2',toughness:'20',colorsOverride:quality.kind==='color'?[quality.value]:quality.kind==='colored'||quality.kind==='monocolored'?['R']:quality.kind==='multicolored'?['R','G']:[],subtypes:quality.kind==='subtype'?[quality.value]:[]}));
      assert.equal(game.isProtectedFrom(card,origin),true,label+': source quality matches');if(card.is('Creature'))assert.equal(await game.damageCreature(origin,card,1),0,label+': protection prevents damage');
    }}return;
  }
  if(action==='death-exile'){
    const rule=game.untilEffects.find(record=>record.kind==='oracleDeathExile'&&(effect.scope?record.scope===effect.scope:record.locked?.some(row=>row.iid===subject.iid)));
    assert.ok(rule,label+': replacement installed');
    const card=effect.scope?permanent(MTG,game,effect.scope==='opponents'?b:a,'Grizzly Bears'):subject;
    if(card.zone==='battlefield')await game.move(card,'graveyard');
    assert.equal(card.zone,card.isToken?'ceased':'exile',label+': graveyard move is replaced by exile');return;
  }
  if(['scale-pt','switch-pt','double-counters'].includes(action)){
    const cards=effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean);
    assert.ok(cards.length,label+': affected permanent exists');
    for(const card of cards){const old=before.cards.get(card),after=card.zone==='battlefield'?card:card.battlefieldLKI?.get(old.zoneVersion);assert.ok(after,label+': characteristics available');
      if(action==='double-counters'){for(const [kind,n]of Object.entries(old.counters))if(effect.counter==='all'||effect.counter===kind)assert.ok((after.counters[kind]||0)>=2*n,label+': actual counters doubled');}
      else if(action==='switch-pt'){
        const composed=(context.proofEffects||[]).filter(candidate=>
          ['pump','switch-pt'].includes(candidate.action)&&
          genericEffectTarget(candidate,selectedTargets,source,context)===card);
        if(composed.length>1&&composed.some(candidate=>candidate.action==='pump')){
          let expectedPower=old.power,expectedToughness=old.toughness;
          for(const candidate of composed){
            if(candidate.action==='switch-pt')[expectedPower,expectedToughness]=[expectedToughness,expectedPower];
            else {const factor=candidate.multiplier?countValue(context,source,candidate.multiplier,before):1;expectedPower+=amount(candidate.power||0)*factor;expectedToughness+=amount(candidate.toughness||0)*factor;}
          }
          assert.equal(after.power,expectedPower,label+': printed stat effects preserve their order');
          assert.equal(after.toughness,expectedToughness,label+': printed stat effects preserve toughness order');
        }else {assert.equal(after.power,old.toughness,label+': toughness becomes power');assert.equal(after.toughness,old.power,label+': power becomes toughness');}
      }
      else {if(effect.power)assert.equal(after.power,old.power*effect.factor,label+': snapshotted power multiplied');if(effect.toughness)assert.equal(after.toughness,old.toughness*effect.factor,label+': snapshotted toughness multiplied');}
    }return;
  }
  if(action==='prevent-all'){
    let witness=subject;
    if(!witness&&effect.filters)witness=stageGenericTarget(MTG,context,effect.filters[0],'prevention');
    if(!witness&&effect.player)witness=a;
    if(!witness)witness=permanent(MTG,game,a,fixtureDefinition('Prevention target',['Creature'],{power:'5',toughness:'20'}));
    const enemy=permanent(MTG,game,b,fixtureDefinition('Prevention damage source',['Creature'],{power:'5',toughness:'20'}));
    const from=effect.direction==='by'?witness:enemy,to=effect.direction==='by'?b:witness;
    assert.equal(await game.damageAny(from,to,3,{combat:effect.combat==='combat'}),0,label+': actual matching damage prevented');
    if(effect.direction==='to and dealt by')assert.equal(await game.damageAny(witness,b,3,{combat:effect.combat==='combat'}),0,label+': damage from affected object prevented');
    return;
  }
  if(action==='grant-operation'){
    const hosts=effect.filters?game.bf().filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean);
    assert.ok(hosts.length,label+': at least one granted host');
    for(const host of hosts){assert.ok(host.cur[effect.operation.kind==='generic-trigger'?'extraTriggers':effect.operation.kind==='mana-source'?'extraMana':'extraAbilities'].length,label+': host has granted rule');for(const keyword of effect.keywords||[])assert.equal(host.kw(keyword),true);}
    return;
  }
  if (typeof effect.target === 'number' && !subject) {
    const ownerOperation = (entry.implementation || []).find(candidate => (candidate.effects || []).includes(effect));
    const targetSpec = ownerOperation?.targets?.[effect.target];
    assert.equal(targetSpec?.min, 0, `${label}: only an optional target may be omitted`);
    const declined = trace.find(item => item.query.type === 'chooseTargets' && item.query.min === 0 &&
      Array.isArray(item.result) && item.result.length === 0);
    assert.ok(declined, `${label}: controller explicitly chooses the legal zero-target branch`);
    for (const candidate of declined.query.candidates) {
      const prior = before.cards.get(candidate);
      if (prior && prior.zone === 'battlefield') assert.equal(candidate.zone, prior.zone,
        `${label}: omitted optional effect leaves available permanent ${candidate.name} untouched`);
    }
    return;
  }
  if(action==='zone-select'){
    const actors=effect.who==='each-player'?game.players:effect.who==='each-opponent'?[b]:effect.who==='you'?[a]:[selectedTargets[effect.who]];
    for(const actor of actors){
      const fixtures=(context.zoneFixtures.get(effect)||[]).filter(card=>card.owner===actor);
      assert.ok(fixtures.length,label+': positive zone candidates');
      const choices=trace.filter(row=>row.query.type==='chooseCards'&&row.query.prompt==='Choose cards from your '+effect.zone&&row.query.from.some(card=>card.owner===actor));
      const selected=effect.n==='all'?fixtures:choices.flatMap(row=>row.result);
      if(effect.n!=='all'){assert.ok(choices.length,label+': real controller zone selection');for(const row of choices)assert.ok(row.result.length>=row.query.min&&row.result.length<=row.query.max);}
      for(const card of selected){assert.equal(card.zone,effect.destination,label+': chosen destination');if(effect.destination==='battlefield'){assert.equal(card.ctrl,actor);if(effect.tapped)assert.equal(card.tapped,true);}}
    }
    return;
  }
  if(action==='tap-or-untap'){const choice=trace.findLast(row=>row.query.type==='chooseOption'&&row.query.prompt==='Tap or untap '+subject.name+'?')?.result;assert.ok(['tap','untap','none'].includes(choice));assert.equal(subject.tapped,choice==='tap'?true:choice==='untap'?false:oldSubject.tapped);return;}
  if(action==='choose-permanents'){
    const choices=trace.filter(item=>item.query.type==='chooseCards'&&item.query.prompt==='Choose permanents to '+effect.operation);
    assert.ok(choices.length,label+': real nontargeted choice');
    for(const choice of choices){assert.ok(choice.result.length>=choice.query.min&&choice.result.length<=choice.query.max);for(const card of choice.result){
      if(['tap','untap'].includes(effect.operation)){assert.equal(card.zone,'battlefield');assert.equal(card.tapped,effect.operation==='tap',label+': selected permanent changes tapped state');}
      else assert.ok([effect.operation==='sacrifice'?'graveyard':'hand','ceased'].includes(card.zone),label+': chosen permanent moved');
    }}
    return;
  }
  if(action==='gain-control'){assert.equal(subject.ctrl,a,label+': selected permanent changes controller');if(effect.temporary)assert.ok(game.untilEffects.some(row=>row.kind==='temporaryControl'&&row.iid===subject.iid));return;}
  if(action==='base-pt'||action==='animate'){
    const cards=effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean);assert.ok(cards.length,label+': base-stat subjects staged');
    for(const card of cards){const actual=card.zone==='battlefield'?card.cur:card.battlefieldLKI?.get(before.cards.get(card)?.zoneVersion);assert.ok(actual);assert.equal(actual.basePower??actual.power,amount(effect.power));assert.equal(actual.baseToughness??actual.toughness,amount(effect.toughness));for(const keyword of effect.keywords||[])assert.ok(card.kw(keyword));if(action==='animate')for(const type of effect.types)assert.ok(card.is(type));}return;
  }
  if(action==='exile-until-source-leaves'){assert.equal(subject.zone,'exile',label+': exiled while source remains');await game.move(source,'exile');assert.equal(subject.zone,'battlefield',label+': immediate return without a Stack object');return;}
  if(action==='sacrifice-unless-pay'){const payment=trace.find(row=>row.query.type==='chooseOption'&&row.query.prompt==='Pay '+effect.cost+'?');assert.ok(payment);assert.ok(source.zone==='graveyard'||payment.result==='yes');return;}
  if(action==='optional-sacrifice'){const choice=trace.find(row=>row.query.type==='chooseCards'&&row.query.prompt==='You may sacrifice a permanent');assert.ok(choice);if(choice.result.length){assert.ok(['graveyard','ceased'].includes(choice.result[0].zone));for(const child of effect.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/paid');}return;}
  if(action==='copy-token'){
    const made=game.bf().filter(card=>card.isToken&&card.isCopyOf&&!before.battlefield.includes(card));assert.ok(made.length>=n,label+': token copies created');
    for(const card of made){assert.equal(card.def.name,subject.def.name,label+': copied name');assert.equal(card.def.power,effect.modPT?String(effect.modPT[0]):subject.def.power,label+': copied printed power');for(const keyword of effect.copyKeywords||[])assert.ok(card.def.kws.includes(keyword),label+': copiable keyword exception');if(effect.haste)assert.equal(card.kw('haste'),true);}
    if(effect.delayed){await game.emit('endStep',{player:a});await resolveAll(game);for(const card of made)assert.ok(['graveyard','exile','ceased'].includes(card.zone),label+': delayed token departure');}
    return;
  }
  if(action==='goad'||action==='suspect'){
    const cards=effect.filters?game.bf().filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat();
    assert.ok(cards.length,label+': political effect has a subject');
    for(const card of cards){if(action==='goad'){assert.ok(game.goadersOf(card).includes(a),label+': actual goad controller');assert.equal(game.isForcedToAttack(card),true,label+': combat attack requirement');}else{assert.equal(card.meta.suspected,true);assert.equal(card.kw('menace'),true);assert.equal(card.cur.cantBlock,true);}}
    return;
  }
  if(action==='face-down'){
    const made=game.bf().filter(card=>card.faceDown&&!before.battlefield.includes(card));assert.equal(made.length,n,label+': exact face-down count');
    for(const card of made){assert.equal(card.power,2);assert.equal(card.toughness,2);assert.equal(card.mv,0);assert.equal(card.faceDown,true);assert.equal(card.meta.faceDownKind,effect.kind==='cloak'?'cloak':'manifest');assert.ok(card.meta.faceDownDef);}
    const top=before.players.get(a).libraryCards.slice(-(effect.kind==='manifest-dread'?2:n));
    if(effect.kind==='manifest-dread')assert.equal(top.filter(card=>card.zone==='graveyard').length,1,label+': unchosen dread card goes to graveyard');
    else assert.ok(top.every(card=>made.includes(card)),label+': actual top library cards manifested');return;
  }
  if(action==='bolster'){
    const choice=trace.findLast(row=>row.query.type==='chooseCards'&&row.query.prompt.startsWith('Bolster:'));assert.ok(choice,label+': mandatory nontargeted bolster choice');assert.equal(choice.result.length,1);
    const card=choice.result[0];assert.ok(choice.query.from.includes(card));assert.ok(card.plus1()>=(before.cards.get(card)?.counters['+1/+1']||0)+n,label+': bolster counters added');return;
  }
  if(action==='populate'){
    const choices=trace.filter(row=>row.query.type==='chooseCards'&&row.query.prompt.startsWith('Populate:'));assert.equal(choices.length,n,label+': each populate uses a fresh token choice');
    for(const {query,result}of choices){assert.equal(result.length,1);assert.ok(query.from.includes(result[0]));assert.ok(result[0].isToken&&result[0].is('Creature')&&result[0].ctrl===a);}
    const made=game.bf().filter(card=>card.isToken&&!before.battlefield.includes(card));assert.ok(made.length>=n,label+': populate creates copies');return;
  }
  if(action==='counter-spell'){
    assert.ok(subject&&subject.kind==='spell',label+': selected an actual spell object');
    assert.equal(subject.card.zone,effect.toZone||'graveyard',label+': countered spell moved to destination');
    assert.equal(game.stack.includes(subject),false,label+': countered spell left the Stack');return;
  }
  if(Array.isArray(subject)){
    if(action==='move-to-library'){
      for(const card of subject)assert.ok(context.moveEvidence.some(row=>row.card===card&&row.to==='library'&&row.after.zone==='library'),label+': each selected card enters its owner library');
      if(effect.ownerOrders)for(const owner of new Set(subject.map(card=>card.owner))){const cards=subject.filter(card=>card.owner===owner);if(cards.length>1){const choice=trace.find(row=>row.query.prompt?.startsWith('Order cards ')&&row.query.from.length===cards.length&&row.query.from.every(card=>cards.includes(card)));assert.ok(choice,label+': each owner orders the selected cards');assert.equal(new Set(choice.result).size,cards.length);}}
      return;
    }
    if(action==='blink'&&effect.delayed){for(const card of subject)assert.equal(card.zone,'exile',label+': every target waits in exile');await game.emit('endStep',{player:a});await resolveAll(game);effect={...effect,delayed:false};}
    for(const card of subject){const bound=selectedTargets.slice();bound[effect.target]=card;await assertGenericEffectEvidence(MTG,context,entry,effect,source,bound,damagedPlayer,before,trace,label+'/'+card.iid);}
    return;
  }
  if(action==='battlefield-group') {
    const affected=(context.groupFixtures.get(effect)||[]).filter(card=>{
      const saved=before.cards.get(card),view={...card,...saved,is:type=>saved.types.includes(type),hasSub:type=>saved.subtypes.includes(type),kw:keyword=>saved.keywords.includes(keyword)};
      return effect.filters.some(filter=>matchesTarget(view,filter,context,source));
    });
    assert.ok(affected.length||effect.players,`${label}: positive group branch was staged`);
    for(const card of affected){
      if(['pump','counter'].includes(effect.operation)&&card.zone!=='battlefield'){
        assert.ok(trace.some(item=>item.query.type==='chooseCards'&&[item.result].flat().includes(card)),label+': group subject used for a paid cost');continue;
      }
      if(effect.operation==='destroy')assert.equal(card.zone,card.isToken?'ceased':'graveyard',`${label}: matching permanent destroyed`);
      else if(effect.operation==='exile')assert.equal(card.zone,card.isToken?'ceased':'exile',`${label}: matching permanent exiled`);
      else if(effect.operation==='bounce')assert.equal(card.zone,card.isToken?'ceased':'hand',`${label}: matching permanent returned`);
      else if(effect.operation==='pump'){
        const power=amount(effect.power),toughness=amount(effect.toughness);
        if(power)assert.ok(power>0?card.power>=before.cards.get(card).power+power:card.power<=before.cards.get(card).power+power,`${label}: filtered power change`);
        if(toughness)assert.ok(toughness>0?card.toughness>=before.cards.get(card).toughness+toughness:card.toughness<=before.cards.get(card).toughness+toughness,`${label}: filtered toughness change`);
        for(const kw of effect.keywords)assert.equal(card.kw(kw),true,`${label}: filtered ${kw} grant`);
      }else if(effect.operation==='counter')assert.ok(card.counters[effect.counter]>=(before.cards.get(card).counters[effect.counter]||0)+n,label+': filtered counters');
      else if(effect.operation==='regenerate')assert.ok(card.regenShield>(before.cards.get(card).regenShield||0),label+': matching creature receives regeneration shield');
      else if(effect.operation==='tap'||effect.operation==='untap')assert.equal(card.tapped,effect.operation==='tap',`${label}: matching permanent tap state`);
      else if(effect.operation==='damage')assert.ok(card.damage>=n||card.zone==='graveyard'||(card.counters['-1/-1']||0)>=n||card.is('Planeswalker')&&card.counters.loyalty<=before.cards.get(card).counters.loyalty-n,`${label}: group damage reaches matching permanent`);
    }
    if(effect.players)for(const p of game.players)assert.ok(p.life<=before.players.get(p).life-n,`${label}: group damage reaches every player`);
    return;
  }
  if(action==='bite') {
    const recipient=selectedTargets[effect.otherTarget],proof=context.damageEvidence.find(row=>row.source===subject&&row.target===recipient);
    assert.ok(subject&&recipient&&proof,label+': selected creature deals the damage');
    const expected=Math.max(0,proof.before.cards.get(subject)[effect.stat])*(effect.multiplier||1);
    assert.equal(proof.n,expected,label+': current source statistic determines damage');
    if(recipient instanceof MTG.CardInst)assert.ok(recipient.zone==='graveyard'||recipient.damage>=expected||recipient.is('Planeswalker')&&recipient.counters.loyalty<=proof.before.cards.get(recipient).counters.loyalty-expected,label+': recipient takes damage');
    else assert.equal(recipient.life,proof.before.players.get(recipient).life-expected,label+': recipient loses life from damage');
    return;
  }
  if(action==='fight') {
    const other=selectedTargets[effect.otherTarget],oldOther=before.cards.get(other);
    assert.ok(subject&&other,`${label}: both fight targets selected`);
    assert.ok(['graveyard','exile','ceased'].includes(subject.zone)||subject.damage>=Math.max(0,oldOther.power),`${label}: first creature receives opposing power`);
    assert.ok(['graveyard','exile','ceased'].includes(other.zone)||other.damage>=Math.max(0,oldSubject.power),`${label}: second creature receives opposing power ${JSON.stringify({source:source.zone,target:other.name,zone:other.zone,damage:other.damage,power:oldSubject.power})}`);
    return;
  }
  if(action==='move-to-library' && subject) {
    const moved=context.moveEvidence?.findLast(row=>row.card===subject&&row.to==='library'&&row.after.zone==='library');
    assert.ok(moved||subject.zone==='library',`${label}: library destination`);
    assert.equal(moved?(effect.bottom?moved.bottom:moved.top):effect.bottom?subject.owner.library[0]:subject.owner.library.at(-1),subject,`${label}: exact library position at the instruction`);
    return;
  }
  if (['draw','gain-life','mill','discard','lose-life'].includes(action) && ['each-player','each-opponent'].includes(effect.who)) {
    for (const current of game.players.filter(p => effect.who === 'each-player' || p !== a)) {
      await assertGenericEffectEvidence(MTG,context,entry,{...effect,who:0},source,[current],damagedPlayer,before,trace,label+'/'+current.name);
    }
    return;
  }
  if (action === 'add-mana') {
    const multiple=effect.multiplier?countValue(context,source,effect.multiplier,before):1;
    if(effect.choices||effect.produce?.ANY){const produced=poolTotal(a)-Object.values(before.players.get(a).pool).reduce((n,v)=>n+v,0),option=effect.choices?.[0]||effect.produce,n=option.ANY?option.n:Object.values(option).reduce((n,v)=>n+v,0);assert.ok(produced>=n*multiple,label+': chosen mana quantity produced');return;}
    for (const [color,amount] of Object.entries(effect.produce)) assert.ok(a.pool[color]>=before.players.get(a).pool[color]+amount*multiple,`${label}: ${color} produced`);
    return;
  }
  if (action === 'discard-hand') {
    assert.ok(before.players.get(player).handCards.filter(card=>card!==source).every(card=>card.zone==='graveyard'),`${label}: every prior hand card other than the cast spell reached graveyard`);
    return;
  }
  if (action === 'shuffle-library') {
    assert.deepEqual(new Set(a.library),new Set(before.players.get(a).libraryCards),`${label}: shuffle preserves library membership`);
    return;
  }
  if (action === 'remove-counter') {
    const witness=context.counterChangeEvidence?.slice(before.counterChangeEvidenceIndex).find(row=>row.card===subject&&row.kind===effect.counter&&row.action===action&&row.n===n&&!context.usedCounterChanges.has(row));
    assert.ok(witness,`${label}: actual counter-removal operation executed`);
    assert.equal(witness.after,Math.max(0,witness.before-n),`${label}: exact counter removal before later instructions`);
    context.usedCounterChanges.add(witness);
    return;
  }


  if(action==='reflexive-cost'){
    const choice=trace.find(item=>item.query.type==='chooseOption'&&item.query.prompt==='Pay the reflexive ability cost?');assert.ok(choice,label+': reflexive cost reaches controller');
    if(choice.result==='yes'){
      const witness=context.reflexiveWitnesses?.find(item=>JSON.stringify(item.object.oracleReflexive)===JSON.stringify(effect));assert.ok(witness,label+': independent reflexive trigger reaches Stack');
      const selected=trace.find(item=>item.query.type==='chooseCards'&&item.query.prompt==='Choose cards for the reflexive ability cost');
      if(effect.cost.zone){assert.equal(selected?.result.length,effect.cost.n,label+': exact reflexive cost count');for(const card of selected.result)assert.ok(['graveyard','exile','ceased'].includes(card.zone),label+': chosen cost leaves its original zone');}
      for(const child of effect.reflexiveBody.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,witness.object.targets,damagedPlayer,witness.before,trace,label+'/reflexive');
    }else assert.equal(choice.result,'no');
  }else if(action==='conditional') {
    if(effect.condition.kind==='source-controlled'&&effect.conditionTarget!==undefined){
      const target=[selectedTargets[effect.conditionTarget]].flat()[0];
      if(!target||before.cards.get(target)?.ctrl!==a){
        for(const child of effect.effects)if(child.action==='draw')assert.equal(context.drawEvidence.slice(before.drawEvidenceIndex).some(row=>row.player===a&&row.source===source&&row.n===child.n),false,label+': noncontrolled target does not grant the conditional draw');
        return;
      }
    }
    for(const child of effect.elseEffects&&context.proofBranch===false?effect.elseEffects:effect.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/conditional');
  }else if(action==='optional-payment') {
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
    for(const card of selected){assert.equal(v5Matches(card,effect.what),true,`${label}: selected type`);assert.equal(card.zone,effect.destination==='library-top'?'library':effect.destination||'battlefield',`${label}: selected card destination`);}
    if(effect.destination==='library-top')for(const card of selected)assert.ok(a.library.slice(-selected.length).includes(card),label+': selected card is above shuffled cards');
    if(effect.name)for(const card of selected)assert.equal(card.name,effect.name,label+': exact named search');
    if(action==='search-library'&&effect.what==='card'&&!effect.name&&!effect.filter)assert.equal(selected.length,n,`${label}: unqualified search cannot fail to find`);
  }else if(action==='look-select'||action==='order-top'){
    const top=before.players.get(a).libraryCards.slice(-n);
    assert.ok(top.length,`${label}: nonempty library`);
    const queries=trace.filter(item=>item.query.type==='chooseCards');
    assert.ok(queries.length,`${label}: library decision`);
    if(action==='look-select'){
      const chosen=queries.find(item=>/top of your library/.test(item.query.prompt));assert.ok(chosen,`${label}: selection query`);
      const selected=Array.isArray(chosen.result)?chosen.result:[];
      for(const card of selected){assert.equal(v5Matches(card,effect.what),true);assert.equal(card.zone,effect.destination||'hand');if(effect.filter)assert.equal(matchesTarget(card,effect.filter,context,source),true);}
      for(const card of top.filter(card=>!selected.includes(card)))assert.equal(card.zone,['graveyard','hand'].includes(effect.rest)?effect.rest:'library');
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
  }else if(action==='reveal-hand-discard')assert.ok(subject[effect.destination||'graveyard'].some(card=>before.players.get(subject).handCards.includes(card)),`${label}: chosen revealed hand card moved`);
  else if (action === 'draw') {
    const draw=context.drawEvidence?.find(row=>row.player===player&&row.source===source&&row.n===n);
    if(draw){
      // Dredge legally replaces an individual draw, so the instruction is
      // proved by the milled cards and the returned card instead.
      const dredges=(context.dredgeEvidence||[]).filter(row=>row.player===player&&row.srcCard===source&&row.card?.zone==='hand');
      if(dredges.length)assert.ok(context.millEvidence.some(row=>row.player===player&&row.cards.length),`${label}: a replaced draw actually mills the dredged cards`);
      assert.ok(draw.drawn+dredges.length>=Math.min(n,draw.library),`${label}: the requested cards were actually drawn`);
    }
    else {const returnedToLibrary=selectedTargets.flat().filter(card=>card instanceof MTG.CardInst&&card.owner===player&&card.zone==='library'&&before.cards.get(card)?.zone!=='library').length;
      assert.ok(player.library.length <= oldPlayer.library + returnedToLibrary - n, `${label}: draw mutates the chosen library`);}
  } else if (action === 'gain-life') {
    const damage=(context.proofEffects||[]).filter(e=>e.action==='damage'&&genericEffectTarget(e,selectedTargets,source,context)===player).reduce((sum,e)=>sum+amount(e.n),0);
    assert.ok(player.life >= oldPlayer.life + n-damage, `${label}: life gain and other damage have the expected net change`);
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
      const gains=(context.proofEffects||[]).filter(e=>e.action==='gain-life'&&genericEffectPlayer(e,selectedTargets,source,a,damagedPlayer,context)===subject).reduce((sum,e)=>sum+amount(e.n),0);
      assert.ok(subject.life <= before.players.get(subject).life - n+gains, `${label}: player damage and subsequent gain have the expected net life change`);
    } else if (subject && subject.zone === 'battlefield' && source.kw('infect')) {
      assert.ok((subject.counters['-1/-1'] || 0) >= (oldSubject.counters['-1/-1'] || 0) + n,
        `${label}: infect damage gives creature -1/-1 counters`);
    } else if (subject && subject.zone === 'battlefield') {
      // A dynamic amount is measured as the damage instruction executes, which
      // an earlier effect in the same resolution can legally change.
      const hit=(context.damageEvidence||[]).find(row=>row.target===subject&&row.source===source&&row.before);
      const expected=subject.damage>=n||!hit?n:amount(effect.n,hit.before);
      assert.ok(subject.damage >= expected || subject.counters.defense < (oldSubject.counters.defense || 0) || subject.is('Planeswalker')&&subject.counters.loyalty<=oldSubject.counters.loyalty-expected,
        `${label}: permanent damage is visible (expected ${expected}, actual ${subject.damage}, power ${subject.power})`);
    } else assert.ok(subject && ['graveyard', 'exile'].includes(subject.zone), `${label}: lethal damage changed zone`);
  } else if (action === 'pump') {
    assert.ok(subject, `${label}: pump has a selected subject`);
    const pumped=subject.zone==='battlefield'?subject:(subject.battlefieldLKI?.get(oldSubject.zoneVersion)||subject);
    const multiple=effect.multiplier?countValue(context,source,effect.multiplier,before):1;
    const power = amount(effect.power||0)*multiple;
    const toughness = amount(effect.toughness||0)*multiple;
    const composedStats=(context.proofEffects||[]).filter(candidate=>
      ['pump','switch-pt'].includes(candidate.action)&&
      genericEffectTarget(candidate,selectedTargets,source,context)===subject);
    if(subject.zone==='battlefield'&&composedStats.length>1&&composedStats.some(candidate=>candidate.action==='switch-pt')){
      let expectedPower=oldSubject.power,expectedToughness=oldSubject.toughness;
      for(const candidate of composedStats){
        if(candidate.action==='switch-pt')[expectedPower,expectedToughness]=[expectedToughness,expectedPower];
        else {const factor=candidate.multiplier?countValue(context,source,candidate.multiplier,before):1;expectedPower+=amount(candidate.power||0)*factor;expectedToughness+=amount(candidate.toughness||0)*factor;}
      }
      assert.equal(pumped.power,expectedPower,`${label}: printed pump and switch effects compose in order`);
      assert.equal(pumped.toughness,expectedToughness,`${label}: printed pump and switch toughness composes in order`);
    }else{
      if (power > 0) assert.ok(pumped.power >= oldSubject.power + power, `${label}: power increases`);
      if (power < 0) assert.ok(pumped.power <= oldSubject.power + power, `${label}: power decreases`);
      if (toughness > 0) assert.ok(pumped.toughness >= oldSubject.toughness + toughness, `${label}: toughness increases`);
      if (toughness < 0 && subject.zone === 'battlefield') {
        assert.ok(subject.toughness <= oldSubject.toughness + toughness, `${label}: toughness decreases`);
      }
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
      const rows=(context.counterChangeEvidence||[]).slice(before.counterChangeEvidenceIndex)
        .filter(row=>row.card===subject&&row.kind===effect.counter&&row.action==='counter'&&!context.usedCounterChanges.has(row));
      const witness=rows.find(row=>row.n===n)||rows.find(row=>row.snapshot&&row.n===amount(effect.n,row.snapshot));
      assert.ok(witness,`${label}: actual counter placement executed`);
      const placed=witness.n===n?n:amount(effect.n,witness.snapshot);
      assert.equal(witness.n,placed,`${label}: printed counter amount matches the resolving board`);
      assert.ok(witness.after>=witness.before+placed,`${label}: exact counter family increases before later instructions`);
      context.usedCounterChanges.add(witness);
    }
  } else if (action === 'counter-group') {
    const affected = game.creatures(a).filter(card => effect.who !== 'your-other-creatures' || card !== source);
    assert.ok(affected.length, `${label}: counter group has legal creatures`);
    assert.ok(affected.every(card => (card.counters[effect.counter] || 0) >=
      ((before.cards.get(card)?.counters[effect.counter]) || 0) + n), `${label}: counter group changes every creature`);
  } else if (action === 'destroy') {
    assert.equal(subject.zone, subject.isToken ? 'ceased' : 'graveyard', `${label}: destroy changes the target zone`);
  } else if (action === 'exile') {
    assert.equal(subject.zone, 'exile', `${label}: exile changes the target zone`);
  } else if (action === 'bounce' || action === 'move-to-hand' || action === 'return-source-to-hand') {
    const moved = action === 'return-source-to-hand' ? source : subject;
    if(moved.kind==='spell'){assert.equal(game.stack.includes(moved),false,label+': spell leaves Stack without being countered');if(!moved.isCopy)assert.equal(moved.card.zone,'hand',label+': underlying spell card returns');}
    else assert.equal(moved.zone, 'hand', `${label}: return-to-hand changes the card zone`);
  } else if (action === 'sacrifice-source') {
    assert.equal(source.zone, source.isToken?'ceased':'graveyard', `${label}: source sacrifice is paid`);
    if(source.isToken)assert.ok(context.moveEvidence.some(row=>row.card===source&&row.to==='graveyard'&&row.from==='battlefield'),label+': sacrificed token actually entered the graveyard');
  } else if (action === 'tap' || action === 'untap') {
    assert.equal(subject.tapped, action === 'tap', `${label}: ${action} changes tapped state`);
  } else if (action === 'mill') {
    const milled=Math.min(n,oldPlayer.library);
    assert.ok(player.library.length <= oldPlayer.library - milled, `${label}: mill removes available cards from library`);
    const evidence=context.millEvidence?.slice(before.millEvidenceIndex).find(row=>row.player===player&&row.n===n);
    if(evidence)assert.equal(evidence.cards.length,milled,`${label}: exact mill cards reached graveyard before any later effect`);
    else assert.ok(player.graveyard.length >= oldPlayer.graveyard + milled, `${label}: mill puts cards in graveyard`);
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
    const sacrificed=[...trace.filter(row=>row.query.type==='chooseCards'&&/sacrifice/i.test(row.query.prompt||'')).flatMap(row=>row.result||[]),...(context.sacrificeEvidence||[]).filter(row=>row.from==='battlefield').map(row=>row.card)].filter(card=>card.isToken&&!before.battlefield.includes(card)&&card.zone==='ceased');
    assert.ok(game.battlefield.filter(card => card.isToken).length+new Set(sacrificed).size >= before.tokenCount + n - (source?.isToken&&before.battlefield.includes(source)&&source.zone!=='battlefield'?1:0),
      `${label}: created tokens remain or were chosen for the later sacrifice`);
  } else if (action === 'connive') {
    assert.ok(queryKinds.includes('chooseCards'), `${label}: connive asks the controller to discard`);
    assert.ok(a.library.length < before.players.get(a).library, `${label}: connive draws a card`);
  } else if (action === 'explore') {
    const witnesses=context.exploreEvidence.slice(before.exploreEvidenceIndex).filter(row=>row.card===(subject||source));
    assert.equal(witnesses.length,effect.n===undefined?1:n,label+': exact sequential explore count');
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
  if (entry.raw.types.some(type => type === 'Artifact' || type === 'Enchantment' || type === 'Planeswalker')) return 'permanent-casting';
  return null;
}

async function enterPermanentProof(MTG, context, entry, {holdLandTriggers=false}={}) {
  const { game, a } = context;
  stageCardCosts(MTG,context,entry);
  for(const op of entry.implementation||[])for(const effect of op.effects||[])if(effect.action==='choose-permanents'&&effect.who==='you')for(let i=0;i<(effect.n||1);i++){
    const fixture=stageGenericTarget(MTG,context,{...effect.filter,controller:'you'},'entry-cost-'+i);if(fixture.is('Creature')){fixture.def.power='0';fixture.def.toughness='1';}
  }
  for(const operation of entry.implementation||[])if(operation.kind==='characteristic-pt'&&operation.count.kind==='count')stageCount(MTG,context,operation.count,v5Helpers());
  const card = zoneCard(MTG, a, entry.raw.name, 'hand');
  if (entry.raw.types.includes('Land')) {
    assert.equal(await game.playLand(a, card), true, `${card.name}: real land-play path`);
    assert.equal(card.zone, 'battlefield', `${card.name}: land enters battlefield`);
  } else {
    for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) a.pool[color] = 30;
    constrainSquadMana(MTG,a,entry);
    assert.equal(await game.castSpell(a, card, { from: 'hand', xVal: 3 }), true, `${card.name}: paid cast enters the real stack`);
    assert.equal(card.zone, 'stack', `${card.name}: stack zone`);
    await resolveAll(game);
    const expectedZone = Number(entry.raw.toughness) <= 0 && !card.def.etbCounters ? 'graveyard' : 'battlefield';
    assert.equal(card.zone, expectedZone,
      `${card.name}: resolves and state-based actions are applied (library=${a.library.length}, lost=${a.lost}, log=${game.log.slice(-4).map(item => item.msg).join(' | ')})`);
  }
  if(!(holdLandTriggers&&entry.raw.types.includes('Land')))await resolveAll(game);
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
  if(['attackerFilters','relativeAttackerPower','defenderRule','blockOnlyFlying','cantAttack','cantBlock','unblockable','blockerFilters'].some(key=>operation[key]))return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.scope==='filtered-permanents')return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.protectionQualities)return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(entry.implementation.filter(op=>op.kind==='generic-static').length>1||entry.implementation.some(op=>op.kind==='characteristic-pt'))return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.condition||operation.multiplier||operation.evasionMinBlockerPower!==undefined||operation.evasionLessThanOwnPower||operation.excludedBlockers||operation.blockedOnlyByFlyingOrReach||['all-creatures','all-other-creatures','opponent-creatures'].includes(operation.scope))return v5StaticProof(MTG,entry,operation,role,v5Helpers());
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
    if(operation.condition==='generic'){
      const inverted=operation.untappedCondition.kind==='not',condition=inverted?operation.untappedCondition.condition:operation.untappedCondition;
      ((branch==='untapped')!==inverted?stageCondition:stageFalseCondition)(MTG,context,condition,card,v5Helpers());
    }
    if(entry.raw.types.includes('Land'))assert.equal(await game.playLand(a, card), true, `${entry.raw.name}/${role}: real conditional land play`);
    else {fund(a);assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await resolveAll(game);}
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

const effectNodes=effects=>(effects||[]).flatMap(effect=>[effect,...effectNodes(effect.effects),...effectNodes(effect.elseEffects)]);
function stageEventConditions(MTG,ctx,card,operation){
  for(const effect of effectNodes(operation.effects))if(effect.action==='conditional'&&effect.conditionTarget==='event-card'){
    (effect.elseEffects&&operation.proofBranch===false?stageFalseCondition:stageCondition)(MTG,ctx,effect.condition,card,v5Helpers());
  }
}
async function prepareSourceProgression(MTG,ctx,source,entry,operation){
  const wanted=effectNodes(operation.effects).filter(effect=>effect.action==='conditional'&&effect.condition.kind==='source-quality'&&effect.conditionTarget===undefined);
  if(!wanted.length||wanted.every(effect=>matchesTarget(source,effect.condition.filter,ctx,source)))return;
  const operations=entry.implementation.filter(row=>row.kind==='generic-ability'&&!row.from),index=operations.indexOf(operation.originalOperation||operation);
  const abilities=(source.def.abilities||[]).filter(row=>row.label==='Oracle ability');
  for(let i=0;i<index;i++)if(effectNodes(operations[i].effects).some(effect=>effect.action==='animate'&&effect.target==='self'&&effect.temporary===false)){
    const action=ctx.game.activatableList(ctx.a).find(row=>row.card===source&&row.ability===abilities[i]);
    if(action){assert.equal(await ctx.game.activateAbility(ctx.a,action),true,entry.raw.name+': paid earlier printed progression');await resolveAll(ctx.game);}
    if(wanted.every(effect=>matchesTarget(source,effect.condition.filter,ctx,source)))break;
  }
}

async function fireGenericEvent(MTG,context,source,operation){
  const {game,a,b}=context,event=operation.event,filter=operation.eventFilter;
  if(await fireV8Event(MTG,context,source,operation,{...v5Helpers(),cardState,stageEventConditions}))return;
  if(filter==='self-unblocked'){
    source.attacking=b;source.wasBlocked=false;source.blockedBy=[];game.combat={attackers:[source]};context.eventPlayer=b;
    await game.emit('blockersDeclared',{player:a,attackers:[source]});return;
  }
  if(filter?.kind==='self-creature-combat'){
    const other=stageGenericTarget(MTG,context,{...filter.otherFilter,controller:'opponent'},'combat-other');context.eventCard=other;context.eventCardBefore=cardState(other);context.eventController=b;
    const attacker=event==='blocks'?other:source,blocker=event==='blocks'?source:other;attacker.attacking=blocker.ctrl;attacker.blockedBy=[blocker];attacker.wasBlocked=true;blocker.blocking=attacker.iid;
    await game.emit(event,{attacker,blocker,blockers:[blocker]});return;
  }
  if(filter?.kind==='qualified-cast'){
    const so=await stageGenericStackTarget(MTG,{...context,b:a},filter.target,'qualified-event',filter.from==='not-hand'?'exile':filter.from||'hand');
    context.eventCard=so.card;context.eventController=a;context.eventCardBefore=cardState(so.card);return;
  }
  if(filter?.kind==='graveyard-batch'){
    const cards=Array.from({length:2},(_,index)=>stageGenericTarget(MTG,context,{...filter.target,controller:'you'},'grave-batch-'+index));
    if(event==='cardsLeftGraveyard')await game.moveGraveyardBatch(cards,'exile');
    else {
      for(const card of cards)await game.move(card,filter.from||'hand');
      await game.withGraveyardEntryBatch(async()=>{for(const card of cards)await game.move(card,'graveyard');});
    }
    return;
  }
  if(filter?.kind==='combat-damage-batch'){
    const attackers=Array.from({length:2},(_,index)=>stageGenericTarget(MTG,context,{...filter.filters[0],controller:'you'},'combat-batch-'+index));
    for(const card of attackers){card.attacking=b;card.blockedBy=[];card.wasBlocked=false;if(!card.power){card.def.power='2';game.recalc();}}
    game.combat={attackers};await game.combatDamage(a,'normal');return;
  }
  context.eventCard=source;context.eventController=source.ctrl;
  context.eventPlayer=filter?.controller==='opponent'||filter==='opponent-player'||['damageToPlayer','combatDamageToPlayer'].includes(event)?b:a;
  if(event==='attackersDeclared'){
    const quality=operation.effects?.find(effect=>effect.action==='conditional'&&effect.condition.kind==='source-quality');
    const attacker=(quality&&game.creatures(a).find(card=>matchesTarget(card,quality.condition.filter,context,source)))||stageGenericTarget(MTG,context,filter?.filters?.[0]||{what:'creature',controller:'you'},'attack-probe');attacker.attacking=b;
    await game.emit(event,{player:a,attackers:game.creatures(a).filter(card=>card.attacking)});return;
  }
  if(event==='cycled'){
    const card=filter==='self'?source:zoneCard(MTG,a,fixtureDefinition('V7 cycle probe',['Land'],{cycling:{cost:'{1}'}}),'hand');
    if(card.zone!=='hand')await game.move(card,'hand');
    const row=game.activatableList(a).find(row=>row.card===card&&row.cycling);assert.ok(row,source.name+': actual cycling action');
    assert.equal(await game.activateAbility(a,row),true);return;
  }
  if(filter?.kind==='targeted-object'&&!filter.self){const target=stageGenericTarget(MTG,context,{what:'creature',controller:'you'},'targeted-event');await game.emit('targeted',{card:target,byPlayer:b,src:null,isSpell:true});return;}
  if(filter?.kind==='filtered-sacrifice'){const card=stageGenericTarget(MTG,context,{...filter.target,controller:'you'},'sacrifice-event');await game.sacrifice(a,card);return;}
  if(filter?.kind==='attached-object'){
    const aura=source.def.oracleImplementation.find(row=>row.kind==='aura-target'),host=stageGenericTarget(MTG,context,{what:(aura?.what||'creature').replace(/ you control$/,''),controller:'you'},'attached');await game.attach(source,host);
    return fireGenericEvent(MTG,context,host,{...operation,eventFilter:'self'});
  }
  if(filter?.kind==='filtered-object'){
    const card=stageGenericTarget(MTG,context,filter.target,0);if(event==='combatDamageToPlayer'&&filter.target.stat!=='power'){card.def.power='2';game.recalc();}context.eventCardStats={power:card.power,toughness:card.toughness};
    for(const effect of effectNodes(operation.effects))if(effect.conditionTarget==='event-card'){
      const driver=effect.elseEffects&&operation.proofBranch===false?stageFalseCondition:stageCondition;driver(MTG,context,effect.condition,card,v5Helpers());
    }
    context.eventCard=card;context.eventController=card.ctrl;context.eventCardBefore=cardState(card);
    if(event==='etb'){game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='nowhere';await game.move(card,'battlefield',{ctrl:card.ctrl});}
    else if(event==='dies')await game.move(card,'graveyard');
    else if(event==='lto')await game.move(card,'exile');
    else if(event==='combatDamageToPlayer'){context.eventAmount=card.power;context.eventPlayer=b;card.attacking=b;game.combat={attackers:[card],defenders:new Map()};await game.combatDamage(a,'normal');}
    else if(event==='attacks'){card.attacking=card.ctrl===a?b:a;await game.emit(event,{card,player:card.ctrl,defender:card.attacking});}
    else if(event==='blocks'){card.blocking=source.iid;await game.emit(event,{blocker:card,attacker:source});}
    else if(event==='becameTapped'){card.tapped=false;game.tap(card);}
    else if(event==='becameUntapped'){card.tapped=true;game.untap(card);}
    else assert.fail('Unknown filtered event '+event);
    return;
  }
  if(event==='lto'){await game.move(source,'exile');return;}
  if(['etb','dies'].includes(event)){
    if(['self','self-card',undefined].includes(filter)){
      if(event==='dies')await game.move(source,'graveyard');
      else await game.emit('etb',{card:source,player:a});
    }else{
      const visitor=new MTG.CardInst(fixtureDefinition('V5 event visitor',['Creature'],{power:'2',toughness:'20',subtypes:[filter?.subtype||'Bear']}),a);
      context.eventCard=visitor;context.eventController=a;context.eventCardBefore=cardState(visitor);
      context.eventCardStats={power:visitor.power,toughness:visitor.toughness};
      visitor.zone='nowhere';await game.move(visitor,'battlefield',{ctrl:a});if(event==='dies')await game.move(visitor,'graveyard');
    }
  }else if(['cast','castIS','castNonCreature','castCreature'].includes(event)){
    const what=filter?.what||'';
    const caster=filter?.controller==='opponent'?b:a;
    const type=event==='castCreature'||what==='creature'?'Creature':what==='historic'?'Artifact':['artifact','enchantment'].includes(what)?what[0].toUpperCase()+what.slice(1):'Instant';
    const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
    const def=fixtureDefinition('V5 cast event probe',[type],{cost:'{0}',subtypes:filter?.subtypes||[what],colorsOverride:colors[what]?[colors[what]]:what==='multicolored'?['G','W']:[],
      ...(filter==='your-spell-targets-self'?{targets:[{what:'creature',filter:(g,c)=>c===source}],resolve:async()=>{}}:{})});
    if(filter?.opponentsTurn){game.turnPlayer=b;def.kws=['flash'];}
    for(let index=0;index<(filter?.kind==='your-numbered-cast'?filter.n:1);index++){
    const spell=new MTG.CardInst(def,caster);spell.zone='hand';caster.hand.push(spell);
    context.eventCard=spell;context.eventController=caster;context.eventCardBefore=cardState(spell);
    assert.equal(await game.castSpell(caster,spell,{from:'hand'}),true,'real cast event probe');
    }
  }else if(event==='spellCopied'){
    const spell=zoneCard(MTG,a,'Opt','hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await game.copySpell(game.stack.find(row=>row.card===spell),a,{mayNewTargets:true});
  }else if(event==='draw'){await game.draw(context.eventPlayer,filter==='your-second-draw'?2:1,source);}
  else if(event==='discarded'){const card=zoneCard(MTG,a,'Forest','hand');await game.discard(a,[card]);}
  else if(event==='targeted')await game.emit('targeted',{card:source,src:null,player:a,byPlayer:b,isSpell:true});
  else if(event==='dealtDamage'){
    const other=permanent(MTG,game,b,fixtureDefinition('V6 damage event creature',['Creature']));
    await game.emit(event,filter==='self-damaged'?{src:other,target:source,n:2}:{src:source,target:other,n:2});
  }
  else if(event==='countersPlaced')game.addCounters(source,filter.counter,2,false,a);
  else if(event==='damageToPlayer')await game.emit(event,{src:source,player:b,n:2,combat:false});
  else if(event==='combatDamageToPlayer')await game.emit(event,{card:source,player:b,n:2,step:'normal'});
  else if(event==='landfall'){const card=new MTG.CardInst(MTG.DEFS.Forest,a);card.zone='nowhere';await game.move(card,'battlefield',{ctrl:a});}
  else if(event==='lifeGain')await game.gainLife(a,1,source);
  else if(event==='scry')await MTG.E.scry(game,a,1);
  else if(['upkeep','endStep','beginCombat','drawStep','precombatMain'].includes(event))await game.emit(event,{player:context.eventPlayer});
  else if(event==='attacks'){source.attacking=b;game.combat={...(game.combat||{}),attackers:[...new Set([...(game.combat?.attackers||[]),source])],defenders:game.combat?.defenders||new Map()};await game.emit(event,{card:source,player:a,defender:b});}
  else if(event==='turnedFaceUp')await game.emit(event,{card:source,player:a,x:3});
  else if(event==='becameTapped')game.tap(source);
  else if(event==='becameUntapped'){source.tapped=true;game.untap(source);}
  else if(event==='blocks'){const attacker=permanent(MTG,game,b,fixtureDefinition('V5 attacker',['Creature']));attacker.attacking=a;attacker.blockedBy=[source];source.blocking=attacker.iid;game.combat={attackers:[attacker],defenders:new Map()};await game.emit(event,{attacker,blocker:source});}
  else if(event==='becomesBlocked'){const blocker=permanent(MTG,game,b,fixtureDefinition('V5 blocker',['Creature']));source.attacking=b;source.blockedBy=[blocker];blocker.blocking=source.iid;game.combat={attackers:[source],defenders:new Map()};await game.emit(event,{attacker:source,blockers:[blocker]});}
  else assert.fail('Missing V5 event driver '+event);
}

async function printedTokenProof(MTG,context,entry,effect,before,trace,label){
  const {game}=context;
  const matches=card=>card?.isToken&&!before.battlefield.includes(card)&&card.name===effect.token.name&&card.def.oracle===effect.token.oracle;
  let tokens=game.bf().filter(matches);
  if(!tokens.length){
    const consumed=context.sacrificeEvidence?.find(row=>row.from==='battlefield'&&matches(row.card)&&row.card.zone==='ceased');
    assert.ok(consumed,label+': the real created token was consumed by a later sacrifice');
    // That legal AI decision has already been proved. Exercise the consumed
    // token's observed printed definition in a separate ability probe; do not
    // alter its decision or pretend that the original token survived.
    tokens=await game.makeTokens(consumed.card.def,consumed.player,{n:1,noReplace:true});
  }
  assert.ok(tokens.length,label+': token with its printed rule exists');
  const a=tokens[0].ctrl,b=game.players.find(player=>player!==a);
  if(context.a.isAI&&a!==context.a){a.isAI=true;const controller=new MTG.AIController(a,{difficulty:'hard',style:'balanced'}),decide=controller.decide.bind(controller);a.controller=controller;controller.decide=async(g,query)=>{const result=await decide(g,query);context.aiDecisions.push({query,result});return result;};}
  context={...context,a,b};
  for(const operation of effect.token.operations){
    const token=tokens.find(card=>card.zone==='battlefield');assert.ok(token,label+': source token remains available');
    if(operation.kind==='mana-source'){
      const source=game.manaSources(a).find(row=>row.card===token);assert.ok(source,label+': token has actual mana source');
      const pool={...a.pool};assert.equal(await game.activateManaSource(a,source,source.produce[0],null,[]),true,label+': token mana activates');
      if(operation.activationCost?.sacSelf)assert.equal(token.zone,'ceased',label+': token sacrificed before production');
      for(const [color,n]of Object.entries(operation.produce[0]))assert.equal(a.pool[color],pool[color]+n,label+': exact token mana');
      await resolveAll(game);
    }else if(operation.kind==='generic-ability'){
      const targets=operation.targets.map((filter,index)=>stageGenericTarget(MTG,context,filter,'token-ability-'+index,operation.effects.find(effect=>effect.target===index)));
      if(operation.cost.tap&&token.sick&&token.is('Creature'))assert.equal(game.activatableList(a).some(row=>row.card===token),false,label+': new creature token cannot tap for a cost');
      token.sick=false;game.phase='main1';game.turnPlayer=a;fund(a,100);
      const action=game.activatableList(a).find(row=>row.card===token);assert.ok(action,label+': printed token activation offered');
      const snapshot=genericProofSnapshot(context,[token,...targets]),pool=poolTotal(a);
      let tapped=false;const tap=game.tap.bind(game);game.tap=card=>{const result=tap(card);if(card===token&&card.tapped)tapped=true;return result;};
      try{assert.equal(await game.activateAbility(a,action),true,label+': token ability uses actual activation');}finally{game.tap=tap;}
      if(operation.cost.tap)assert.equal(tapped,true,label+': token tap cost');
      if(operation.cost.sacSelf)assert.equal(token.zone,'ceased',label+': token sacrificed as a cost');
      if(operation.cost.mana)assert.ok(poolTotal(a)<pool,label+': token mana cost');
      const so=game.stack.find(row=>row.srcCard===token&&row.kind==='ability');assert.ok(so,label+': token ability is on Stack');
      await resolveAll(game);
      for(const effect of operation.effects)await assertGenericEffectEvidence(MTG,context,entry,effect,token,so.targets,b,snapshot,trace,label+'/token-activation');
    }else if(operation.kind==='generic-static'){
      await combatRestrictionProof(MTG,context,token,operation,v5Helpers(),label);
    }else if(operation.kind==='generic-trigger'){
      const snapshot=genericProofSnapshot(context,[token]);
      await fireGenericEvent(MTG,context,token,operation);await game.flushTriggers();
      assert.ok(game.stack.some(row=>row.srcCard===token&&row.kind==='trigger'),label+': printed token trigger reaches Stack');
      await resolveAll(game);
      for(const child of operation.effects)await assertGenericEffectEvidence(MTG,context,entry,child,token,[],b,snapshot,trace,label+'/token-rule');
    }else assert.fail(label+': missing printed-token rule proof '+operation.kind);
  }
}

async function grantedManaProof(MTG,ctx,entry,operation,host,label){
 const {game,a,b}=ctx;stageCondition(MTG,ctx,operation.condition,host,v5Helpers());if(operation.multiplier)stageCount(MTG,ctx,operation.multiplier,v5Helpers());game.recalc();
 const descriptor=game.manaSources(a).find(row=>row.card===host&&host.cur.extraMana.includes(row.m));assert.ok(descriptor,label+': actual granted mana source');
 const before=genericProofSnapshot(ctx,[host]),pool=poolTotal(a),choice=descriptor.produce[0],n=choice.ANY?choice.n:Object.values(choice).reduce((a,b)=>a+b,0);
 assert.equal(await game.activateManaSource(a,descriptor,choice,null,[]),true,label+': granted mana activates');assert.equal(poolTotal(a),pool+n,label+': exact mana');assert.equal(host.tapped,true);assert.equal(game.stack.some(row=>row.srcCard===host&&row.kind==='ability'),false,label+': mana ability does not use Stack');
 for(const effect of operation.afterEffects||[])await assertGenericEffectEvidence(MTG,ctx,entry,effect,host,[],b,before,[],label+'/mana-effect');
 if(operation.restriction){const forbidden={card:new MTG.CardInst(fixtureDefinition('Forbidden',['Land']),a)};assert.equal(descriptor.m.restrict(game,forbidden,host),false,label+': granted spending restriction');}
}

async function grantedEffectProof(MTG,context,entry,effect,source,targets,trace,label){
  const {game}=context,op=effect.operation;
  const hosts=effect.filters?game.bf().filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[genericEffectTarget(effect,targets,source,context)].flat().filter(Boolean);
  const host=hosts.find(card=>card.ctrl===context.a)||hosts[0];assert.ok(host,label+': actual granted host');
  const ctx={...context,a:host.ctrl,b:game.players.find(player=>player!==host.ctrl)};
  for(const child of flattenProofEffects(op.effects||[])){
    stageCopyLinkedEffect(MTG,ctx,child,v8Helpers());
    stageV8Effect(MTG,ctx,child,v8Helpers());
  }
  const staged=[];for(const [index,target]of(op.targets||[]).entries())staged.push(target.zone==='stack'?await stageGenericStackTarget(MTG,ctx,target,'granted-'+index):stageGenericTarget(MTG,ctx,target,'granted-'+index,op.effects.find(effect=>effect.target===index)));
  fund(ctx.a,100);host.sick=false;game.turnPlayer=ctx.a;game.phase='main1';
  if(op.kind==='mana-source'){
    await grantedManaProof(MTG,ctx,entry,op,host,label);
    await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:ctx.a});assert.equal(host.cur.extraMana.length,0,label+': temporary mana grant does not follow a new object');return;
  }
  let before=genericProofSnapshot(ctx,[host,...staged]),stackObject;
  if(op.kind==='generic-ability'){
    const action=game.activatableList(ctx.a).find(row=>row.card===host&&host.cur.extraAbilities.includes(row.ability));assert.ok(action,label+': granted ability offered');
    assert.equal(await game.activateAbility(ctx.a,action),true);stackObject=game.stack.find(row=>row.srcCard===host&&row.run===action.ability.run);
    if(op.cost.sacSelf)assert.equal(host.zone,host.isToken?'ceased':'graveyard',label+': granted sacrifice cost paid');
    before=genericProofSnapshot(ctx,[host,...staged]);
  }else{
    await fireGenericEvent(MTG,ctx,host,op);await game.flushTriggers();stackObject=game.stack.find(row=>row.srcCard===host&&row.kind==='trigger');
  }
  assert.ok(stackObject,label+': granted rule reaches real Stack');before.oracleX=stackObject.ctx?.x??0;ctx.eventAmount=stackObject.ctx?.data?.n;ctx.eventCard=stackObject.ctx?.data?.card;ctx.eventPlayer=stackObject.ctx?.data?.player;
  await resolveAll(game);
  for(const child of op.effects)await assertGenericEffectEvidence(MTG,ctx,entry,child,host,stackObject.targets,ctx.b,before,trace,label+'/granted-rule');
  await finishCopyLinkedProof(MTG,ctx,entry,v8Helpers());
  await finishV8EffectProof(MTG,ctx,entry,v8Helpers());
  if(host.zone==='battlefield'){await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:ctx.a});assert.equal(host.cur.extraAbilities.length,0);assert.equal(host.cur.extraTriggers.length,0);}
}

const hasConditionalBranches=effects=>(effects||[]).some(effect=>effect.action==='conditional'&&effect.elseEffects||hasConditionalBranches(effect.effects)||hasConditionalBranches(effect.elseEffects));

function offsetProofEffect(effect,offset){
  const result={...effect};for(const key of ['target','otherTarget','who','conditionTarget'])if(typeof result[key]==='number')result[key]+=offset;
  for(const key of ['effects','elseEffects'])if(result[key])result[key]=result[key].map(child=>offsetProofEffect(child,offset));return result;
}
async function genericRuntimeOperationProof(MTG, entry, operation, role) {
  if(operation.kind==='spell-modal-generic'&&operation.entwineProof){
    const targets=[],effects=[];let offset=0;
    for(const mode of operation.modes){for(const effect of mode.body.effects)effects.push(offsetProofEffect(effect,offset));targets.push(...mode.body.targets);offset=targets.length;}
    return genericRuntimeOperationProof(MTG,entry,{kind:'spell-generic',modal:operation,modePlan:operation.modes.map((unused,index)=>index),
      targets,effects,entwineProof:operation.entwineProof,originalOperation:operation},role);
  }
  if(operation.modalBody){
    const modes=operation.modalBody.modes;
    // The engine runs in its own vm realm, so a deep-strict comparison against
    // a test-realm literal would fail on the prototype instead of the value.
    assert.equal(operation.modalBody.choose?.min,1,entry.raw.name+': supported trigger mode choice');
    assert.equal(operation.modalBody.choose?.max,1,entry.raw.name+': supported trigger mode choice');
    let checks=0;
    for(const chosen of role==='human'?modes.map((_,index)=>index):[null]){
      const effects=[],targets=[],stagedModes=[];
      for(const [index,mode]of modes.entries()){
        if(chosen!==null&&chosen!==index){stagedModes.push([]);continue;}
        const staged=mode.body.effects.map(effect=>offsetProofEffect(effect,targets.length));
        effects.push(...staged);targets.push(...mode.body.targets);stagedModes.push(staged);
      }
      checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,modalBody:undefined,
        modalTrigger:operation,modalTriggerMode:chosen,modalTriggerStages:stagedModes,
        originalOperation:operation.originalOperation||operation,effects,targets},role);
    }
    return checks;
  }
  if(operation.overloadedBody&&!operation.overloadChecked){let checks=await genericRuntimeOperationProof(MTG,entry,{...operation,overloadChecked:true},role);checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,...operation.overloadedBody,overloadChecked:true,overloadVariant:true},role);return checks;}
  if(operation.proofBranch===undefined&&hasConditionalBranches(operation.effects)){
    let checks=0;for(const proofBranch of [true,false])checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,proofBranch,originalOperation:operation.originalOperation||operation},role);return checks;
  }
  if(operation.kind==='spell-modal-generic'){
    const plans=[];
    for(let mask=1;mask<(1<<operation.modes.length);mask++){
      const plan=Array.from(operation.modes,(_,i)=>i).filter(i=>mask&(1<<i));
      if(plan.length>=operation.choose.min&&plan.length<=operation.choose.max)plans.push(plan);
    }
    let checks=0;
    for(const plan of role==='human'?plans:[plans.at(-1)]){
      let offset=0;const effects=[],targets=[];
      for(const mode of operation.modes){
        for(const effect of mode.body.effects)effects.push(offsetProofEffect(effect,offset));
        targets.push(...mode.body.targets);offset=targets.length;
      }
      checks+=await genericRuntimeOperationProof(MTG,entry,{kind:'spell-generic',modal:operation,modePlan:plan,targets,effects},role);
    }return checks;
  }
  if(Array.isArray(operation.event)){
    let checks=0;for(const event of operation.event){
      const filters=operation.eventFilter?.kind==='either'?operation.eventFilter.clauses.filter(clause=>clause.event===event).map(clause=>clause.eventFilter):[operation.eventFilter];
      for(const eventFilter of filters)checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,event,eventFilter,originalOperation:operation.originalOperation||operation},role);
    }return checks;
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
    chooseMulti:(game,query)=>operation.modePlan&&query.prompt.startsWith(entry.raw.name+':')?operation.modePlan.map(String):query.options.slice(0,query.min||1).map(option=>option.key),
    chooseOption: (game, query) => {
      if(query.aiHint?.kind==='entwine')return operation.entwineProof?'yes':'no';
      if(operation.modalTrigger&&query.aiHint?.kind==='mode'&&query.aiHint.src?.name===entry.raw.name&&operation.modalTriggerMode!==null){
        const key=String(operation.modalTriggerMode);
        assert.ok(query.options.some(option=>option.key===key),entry.raw.name+': requested printed trigger mode is legal');
        return key;
      }
      return operation.modePlan&&query.prompt.startsWith(entry.raw.name+':')?String(operation.modePlan[0]):query.options.find(option =>
        ['yes', 'pay', 'counter', 'top'].includes(option.key))?.key || query.options[0]?.key;
    },
    chooseX: (game, query) => Math.min(3, query.max ?? 3),
    scry: (game, query) => ({ top: query.cards.slice(1), bottom: query.cards.slice(0, 1) }),
  });
  const context = gameFor(MTG, [controller, decision()], { ai: role === 'ai' });
  const { game, a, b } = context;
  context.proofBranch=operation.proofBranch;
  installPaymentProof(MTG,context,{...v8Helpers(),trace:role==='ai'?context.aiDecisions:humanTrace});
  installCopyLinkedProof(MTG,context);
  assertControllerRole(MTG, context, `${entry.raw.name}/${role}/${operation.kind}`);
  installEffectEvidence(context);
  context.counterGroupFixtures=new Map();context.counterEvidence=[];const originalCounter=game.counterStackObject;game.counterStackObject=async function(object,...args){const result=await originalCounter.call(this,object,...args);context.counterEvidence.push({object,result});return result;};
  b.controller=recordingDecision(role==='ai'?context.aiDecisions:humanTrace);
  fillLibrary(MTG, a, 60);
  fillLibrary(MTG, b, 60);
  for (let index = 0; index < 12; index++) {
    zoneCard(MTG, a, 'Forest', 'hand');
    zoneCard(MTG, b, 'Forest', 'hand');
  }
  fund(a, 100);
  fund(b, 100);
  if(operation.entwineProof?.cost?.kind==='sacrifice')for(let index=0;index<operation.entwineProof.cost.n+5;index++)permanent(MTG,game,a,'Forest');
  constrainSquadMana(MTG,a,entry);
  if(JSON.stringify(operation.effects||[]).includes('"kind":"not","condition":{"kind":"kicked"}')){
    const cost=MTG.parseCost(entry.raw.cost);for(const color of ['W','U','B','R','G','C'])a.pool[color]=0;
    a.pool.C=cost.generic+(cost.x||0)*3;for(const pip of cost.pips)a.pool[pip.find(symbol=>'WUBRGC'.includes(symbol))]++;
  }
  stageCardCosts(MTG,context,entry);
  for(const op of entry.implementation||[])if(op.kind==='characteristic-pt'&&op.count.kind==='count')stageCount(MTG,context,op.count,v5Helpers());
  for(const name of ['Grizzly Bears','Sol Ring','Doom Blade','Rancor'])zoneCard(MTG,b,name,'hand');

  if (operation.kind === 'enters-with-counters') {
    for(const op of entry.implementation)for(const [index,target]of(op.targets||[]).entries())if(target.zone!=='stack')wantedTargets.push(stageGenericTarget(MTG,context,target,index,op.effects?.find(effect=>effect.target===index)));
    const source = zoneCard(MTG, a, entry.raw.name, 'hand');
    stageCondition(MTG,context,operation.condition,source,v5Helpers());
    if(typeof operation.n==='object'&&!['paid-colors','paid-times'].includes(operation.n.kind))stageCount(MTG,context,operation.n,v5Helpers());
    const xVal = operation.n === 'X' ? 3 : 0;
    const conditionAlt=prepareConditionPayment(MTG,context,entry);
    if(operation.n?.kind==='paid-colors')a.pool.C=0;
    assert.equal(await game.castSpell(a, source, operation.n === 'X'
      ? { from: 'hand', xVal,...(conditionAlt?{alt:conditionAlt}:{}) } : operation.n?.kind==='paid-colors'||context.paymentCondition?.kind==='mana-spent'?{from:'hand'}:conditionAlt?{from:'hand',alt:conditionAlt}:{ from: 'hand', alt: { free: true } }), true,
    `${entry.raw.name}/${role}: counter-bearing permanent uses real cast`);
    const expected=operation.n?.kind==='paid-colors'?new Set((source.castMeta.paymentColors||[]).filter(c=>'WUBRG'.includes(c))).size*(operation.n.multiply??1):operation.n?.kind==='paid-times'?source.castMeta.paidTimes:operation.condition?.kind==='kicked'&&!source.castMeta.kicked?0:typeof operation.n==='object'?countValue(context,source,operation.n)*(operation.n.multiply??1):effectAmount(operation.n);
    while(source.zone==='stack')await game.resolveTop();
    assert.equal(source.zone, 'battlefield', `${entry.raw.name}/${role}: counter-bearing permanent resolves`);
    assert.equal(source.counters[operation.counter] || 0, expected,
      `${entry.raw.name}/${role}: exact entry counter count`);
    if(operation.tapped)assert.equal(source.tapped,true,entry.raw.name+': entry is tapped before any action');
    await resolveAll(game);
    return 1;
  }

  assert.ok(['generic-trigger','generic-ability','spell-generic'].includes(operation.kind),
    `${entry.raw.name}: known generic runtime operation`);
  const stagedTargets=[];
  for(const [index,target]of (operation.targets||[]).entries())stagedTargets.push(target.zone==='stack'?await stageGenericStackTarget(MTG,context,target,index):stageGenericTarget(MTG,context,target,index,(operation.effects||[]).find(effect=>effect.target===index)));
  wantedTargets = stagedTargets.flat();
  context.oracleProofTargets=stagedTargets;
  context.groupFixtures=new Map();
  context.zoneFixtures=new Map();
  const stageEffect=effect=>{
    stageV8Effect(MTG,context,effect,v8Helpers());
    stagePaymentEffect(MTG,context,effect,v8Helpers());
    stageCopyLinkedEffect(MTG,context,effect,v8Helpers());
    if(effect.action==='damage-batch')for(const hit of effect.hits)for(const filter of hit.filters||[])for(const controller of ['you','opponent'])stageGenericTarget(MTG,context,{...filter,controller:filter.controller==='any'?controller:filter.controller},'damage-batch-probe',{action:'damage',n:typeof hit.n==='number'?hit.n:1});
    if(effect.action==='unless-cost')for(const cost of effect.payment.choices||[effect.payment])if(cost.zone)for(const controller of ['you','opponent'])for(let i=0;i<cost.n;i++){
      const card=stageGenericTarget(MTG,context,{...cost.filter,controller,zone:cost.zone==='hand'?'graveyard':'battlefield'},'unless-payment-'+i);
      if(cost.zone==='hand'){card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone='hand';card.owner.hand.push(card);}
    }
    if(['scale-pt','switch-pt','double-counters'].includes(effect.action)&&effect.filters)for(const filter of effect.filters)stageGenericTarget(MTG,context,{...filter,controller:filter.controller==='any'?'you':filter.controller},'stat-effect');
    if(effect.action==='double-counters')for(const card of effect.filters?game.bf().filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,null))):[stagedTargets[effect.target]].flat().filter(Boolean)){card.counters[effect.counter==='all'?'+1/+1':effect.counter]=2;game.recalc();}
    if(['goad','suspect'].includes(effect.action)&&effect.filters)for(const filter of effect.filters)stageGenericTarget(MTG,context,{...filter,controller:filter.controller==='any'?'opponent':filter.controller},'political-effect');
    if(effect.action==='reflexive-cost'){
      if(effect.cost.zone)for(let i=0;i<effect.cost.n;i++){
        const zone=effect.cost.zone==='hand'?'graveyard':effect.cost.zone,card=stageGenericTarget(MTG,context,{...effect.cost.filter,zone,controller:'you'},'reflexive-cost-'+i);
        if(effect.cost.zone==='hand'){a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='hand';a.hand.push(card);}
      }
      for(const [index,filter]of effect.reflexiveBody.targets.entries())stageGenericTarget(MTG,context,filter,'reflexive-target-'+index,effect.reflexiveBody.effects.find(child=>child.target===index));
      for(const child of effect.reflexiveBody.effects)stageEffect(child);
    }
    if(effect.action==='bolster'&&!game.creatures(a).length)permanent(MTG,game,a,'Grizzly Bears');
    if(effect.action==='populate'){
      const token=permanent(MTG,game,a,fixtureDefinition('Populate witness',['Creature'],{power:'4',toughness:'4',subtypes:['Beast']}));token.isToken=true;
    }
    if(effect.action==='grant-operation'&&effect.filters)for(const filter of effect.filters)stageGenericTarget(MTG,context,{...filter,controller:filter.controller==='any'?'you':filter.controller},'grant-host');
    if(effect.action==='conditional'&&effect.condition.kind==='source-stat-comparison'&&effect.conditionTarget!==undefined){
      // "if that creature's power is N or less" reads the chosen target, so the
      // fixture is printed at a value that satisfies the printed comparison.
      const subject=[stagedTargets[effect.conditionTarget]].flat().filter(Boolean)[0];
      const condition=effect.condition;
      if(subject instanceof MTG.CardInst&&['power','toughness'].includes(condition.stat)&&typeof condition.threshold==='number'){
        const value=condition.comparison==='less'?Math.max(0,condition.threshold-1)
          :condition.comparison==='greater'?condition.threshold+1:condition.threshold;
        subject.def[condition.stat]=String(value);
        if(condition.stat==='power')subject.def.toughness=String(Math.max(Number(subject.def.toughness)||0,20));
        game.recalc();
      }
    }
    if(effect.action==='conditional'&&effect.condition.kind!=='source-stat-comparison'&&effect.condition.kind!=='kicked'&&!(effect.elseEffects&&operation.proofBranch===false))stageCondition(MTG,context,effect.condition,stagedTargets[effect.conditionTarget]||{castMeta:{}},v5Helpers());
    if(['count','sum','party','devotion','turn-count','source-attachments','opponent-poison-total','opponent-count'].includes(effect.n?.kind))stageCount(MTG,context,effect.n,v5Helpers());
    if(effect.n?.kind==='target-count'){
      const player=typeof effect.n.target==='number'?stagedTargets[effect.n.target]:b;
      if(player instanceof MTG.Player)stageCount(MTG,{...context,a:player,b:player===a?b:a},effect.n.count,v5Helpers());
    }
    if(typeof effect.unlessGeneric==='object')stageCount(MTG,context,effect.unlessGeneric,v5Helpers());
    if(effect.multiplier)stageCount(MTG,context,effect.multiplier,v5Helpers());
    if(effect.action==='token-inline')for(const stat of [effect.token.power,effect.token.toughness])if(typeof stat==='object')stageCount(MTG,context,stat,v5Helpers());
    if(['token-inline','token-key'].includes(effect.action)&&effect.n?.kind==='count'&&effect.n.zone==='battlefield'){const card=stageGenericTarget(MTG,context,effect.n.filters?.[0]||{what:effect.n.what,controller:'you'},'token-count');if(!effect.n.filters?.[0]?.stat){card.def.power='1';game.recalc();}}
    for(const stat of [effect.power,effect.toughness])if(stat?.kind==='signed'&&typeof stat.value==='object')stageCount(MTG,context,stat.value,v5Helpers());
    if(effect.action==='choose-permanents')for(const controller of ['you','opponent'])for(let i=0;i<Math.max(2,Number(effect.n)||3);i++){const card=stageGenericTarget(MTG,context,{...effect.filter,controller},i);if(effect.operation==='untap')card.tapped=true;}
    if(effect.action==='optional-sacrifice')stageGenericTarget(MTG,context,{...effect.filter,controller:'you'},'optional-cost');
    if(effect.action==='zone-select'){
      const cards=[];
      for(const controller of ['you','opponent'])for(let i=0;i<Math.max(2,Number(effect.n)||1);i++)cards.push(stageGenericTarget(MTG,context,{...effect.filter,zone:effect.zone,controller},i));
      context.zoneFixtures.set(effect,cards);
    }
    if(effect.action==='battlefield-group'){
      const cards=[];
      for(const target of effect.filters)for(const controller of ['you','opponent']){
        const card=stageGenericTarget(MTG,context,{...target,controller:target.controller==='any'?controller:target.controller},cards.length,{action:effect.operation});
        card.tapped=!!target.tapped||effect.operation==='untap';cards.push(card);
      }
      context.groupFixtures.set(effect,cards);
    }
    if(['base-pt','animate','grant-protection','combat-restriction'].includes(effect.action)&&effect.filters)for(const filter of effect.filters)stageGenericTarget(MTG,context,filter,'base-group');
    if(effect.action==='inspect-top'&&effect.filter){const card=stageGenericTarget(MTG,context,{...effect.filter,controller:'you',zone:'graveyard'},'inspect-top');a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='library';a.library.push(card);}
    if(effect.action==='base-pt')for(const value of [effect.power,effect.toughness])if(typeof value==='object')stageCount(MTG,context,value,v5Helpers());
    if(effect.action==='reveal-hand-discard'&&effect.filter){const card=stageGenericTarget(MTG,context,{...effect.filter,controller:'opponent',zone:'graveyard'},'revealed-hand');b.graveyard.splice(b.graveyard.indexOf(card),1);card.zone='hand';b.hand.push(card);}
    if(['search-library','put-from-hand','look-select'].includes(effect.action)){
      if(effect.filter){for(let i=0;i<Math.max(3,Number(effect.n)||1);i++){const card=stageGenericTarget(MTG,context,{...effect.filter,controller:'you',zone:'graveyard'},'filtered-search-'+i);a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='library';a.library.push(card);}}
      const what=effect.what;
      const type=what==='basic land'?'Land':what.split(' or ')[0];
      const cardType=['creature','artifact','land','enchantment','instant','sorcery','permanent','card','nonland permanent'].includes(type.toLowerCase())?(type==='card'||type.includes('permanent')?'Creature':type[0].toUpperCase()+type.slice(1).toLowerCase()):'Creature';
      if(!effect.filter)for(let i=0;i<Math.max(3,Number(effect.n)||1);i++){
        const card=new MTG.CardInst(fixtureDefinition(effect.name||'Oracle Searched '+i,[cardType],{cost:'{0}',power:'4',toughness:'20',super:what==='basic land'?['Basic']:[],subtypes:[type.replace(/ permanent$/,'')]}),a);
        card.zone=effect.action==='put-from-hand'?'hand':'library';a[card.zone].push(card);
      }
    }
    for(const child of effect.elseEffects&&operation.proofBranch===false?effect.elseEffects:effect.effects||[])stageEffect(child);
  };
  for(const effect of operation.effects||[])stageEffect(effect);
  for(const effect of operation.effects||[])if(effect.action==='counter-spells'){const objects=[];for(let i=0;i<2;i++)objects.push(await stageGenericStackTarget(MTG,context,effect.filter,'overload-'+i));context.counterGroupFixtures.set(effect,objects);}
  // Quality-conditioned target proofs need a useful qualifying target. Keep
  // the unrelated group-effect probes weaker, without replacing AI decisions.
  const groupPower=JSON.stringify(operation).includes('"kind":"source-quality"')?'100':'20000';
  const groupCreature = permanent(MTG, game, a, fixtureDefinition('Oracle Generic Group Creature', ['Creature'], {
    power: groupPower, toughness: '20000',
  }));
  const secondGroupCreature=operation.kind==='spell-generic'?permanent(MTG,game,a,fixtureDefinition('Oracle Second Group Creature',['Creature'],{power:groupPower,toughness:'20000'})):null;
  const hostileGroupCreature=permanent(MTG,game,b,fixtureDefinition('Oracle Hostile Group Creature',['Creature'],{power:groupPower,toughness:'20000'}));
  if(groupPower==='100'&&operation.targets?.length){for(const card of [groupCreature,secondGroupCreature,hostileGroupCreature].filter(Boolean))card.def.kws=['shroud'];game.recalc();}
  groupCreature.attacking = b;
  const proliferateSubject = groupCreature;
  game.addCounters(proliferateSubject, '+1/+1', 1, false, a);
  const sacrificeFixtures = [];
  const cost = operation.cost || {};
  const activatedCostStage = stageActivatedCost(MTG, context, cost, v5Helpers());
  if(operation.from==='graveyard'&&entry.implementation.some(op=>op.kind==='generic-static'&&op.toughness<0&&op.multiplier?.zone==='hand')){
    for(const card of a.hand.splice(cost.discard||0)){card.zone='library';a.library.push(card);}
  }
  if(cost.tapFilter)for(let i=0;i<cost.tapN;i++)stageGenericTarget(MTG,context,{...cost.tapFilter,controller:'you'},'tap-cost-'+i);
  if(cost.discardFilter)for(let i=0;i<cost.discard;i++){const card=stageGenericTarget(MTG,context,{...cost.discardFilter,controller:'you'},'discard-cost');a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='hand';a.hand.push(card);}
  if(cost.mana?.includes('{X}')){
    for(const color of ['W','U','B','R','G','C'])a.pool[color]=0;
    const mana=MTG.parseCost(cost.mana);a.pool.C=mana.generic+3*mana.x;
    for(const pip of mana.pips){const color=pip.find(symbol=>['W','U','B','R','G','C'].includes(symbol));a.pool[color]++;}
  }
  if(cost.sacFilter)for(let i=0;i<(cost.sacN||1);i++)sacrificeFixtures.push(stageGenericTarget(MTG,context,{...cost.sacFilter,controller:'you'},'cost-'+i));
  if(cost.exileFilter)for(let i=0;i<(cost.exileFromGY||1);i++)stageGenericTarget(MTG,context,{...cost.exileFilter,controller:'you',zone:'graveyard'},'exile-cost-'+i);
  if (cost.sacCreature || cost.sacOther) {
    const fodder = permanent(MTG, game, a, fixtureDefinition('Oracle Sacrifice Creature', ['Creature'], {
      power: '0', toughness: '1',
    }));
    fodder.isToken = true;
    sacrificeFixtures.push(fodder);
  }
  if (cost.sacWhat) {
    const type = cost.sacWhat.charAt(0).toUpperCase() + cost.sacWhat.slice(1);
    const fixture=permanent(MTG, game, a, fixtureDefinition(`Oracle Sacrifice ${type}`, [['Creature','Artifact','Enchantment','Land'].includes(type)?type:'Creature'].flat(),{subtypes:[cost.sacWhat],power:'0',toughness:'1'}));
    if(type==='Token')fixture.isToken=true;
    sacrificeFixtures.push(fixture);
  }
  wantedCards = [...sacrificeFixtures, ...activatedCostStage.wantedCards];
  if(JSON.stringify(operation).includes('"kind":"sacrificed-stat"')){for(const card of game.creatures(a))if(!card.def.oracleImplementation&&!cost.sacFilter?.stat){card.def.power='3';card.def.toughness='4';}game.recalc();}
  context.proofLockedTargets=stagedTargets.flat();
  const bestowOperation=(entry.implementation||[]).find(candidate=>candidate.kind==='mechanic-bestow');
  const proveBestowedSource=!!bestowOperation&&operation.proofBranch!==false&&(operation.effects||[]).some(effect=>
    effect.action==='conditional'&&effect.condition?.kind==='source-quality'&&effect.condition.filter?.subtype==='Aura');
  if(operation.proofBranch===false)for(const effect of operation.effects||[])if(effect.action==='conditional'&&effect.elseEffects&&effect.conditionTarget!=='event-card'){
    const ordinaryBestowSource=!!bestowOperation&&effect.conditionTarget===undefined&&effect.condition?.kind==='source-quality'&&effect.condition.filter?.subtype==='Aura';
    if(!ordinaryBestowSource)stageFalseCondition(MTG,context,effect.condition,stagedTargets[effect.conditionTarget]||null,v5Helpers());
  }
  if(JSON.stringify(operation).includes('"kind":"max-stat"')){
    for(const card of game.creatures())if(card.name.startsWith('Oracle '))card.def.power='3';
    game.recalc();
  }
  if (cost.discard) {
    wantedCards.push(...a.hand.filter(card => card.name === 'Forest').slice(0, cost.discard));
  }
  const trackedCards = [...stagedTargets.flat().filter(target => target instanceof MTG.CardInst), groupCreature,secondGroupCreature,hostileGroupCreature,
    ...sacrificeFixtures,...activatedCostStage.returnCards,...[...context.groupFixtures.values()].flat()];
  const trace = role === 'ai' ? context.aiDecisions : humanTrace;
  let source;
  let selectedTargets = stagedTargets.slice();
  let damagedPlayer = b;
  let before;
  let operationRun = null;
  let witnessedObject=null;
  const stackTargets = object => {
    if(object?.oracleReflexive&&object.srcCard===source){
      const witnesses=context.reflexiveWitnesses||(context.reflexiveWitnesses=[]);
      if(!witnesses.some(row=>row.object===object))witnesses.push({object,before:genericProofSnapshot(context,[source,...object.targets.flat().filter(card=>card instanceof MTG.CardInst)])});
    }
    const expectedKind = operation.kind === 'generic-ability' ? 'ability' : operation.kind === 'spell-generic' ? null : 'trigger';
    if(operation.chapterIndex!==undefined&&source)operationRun=source.def.saga[operation.chapterIndex].run;
    if (!operationRun && expectedKind === 'trigger' && source) {
      const genericOperations = (entry.implementation || []).filter(candidate => candidate.kind === 'generic-trigger');
      const descriptions = new Set(genericOperations.map(candidate => candidate.desc || 'Oracle effect'));
      const definitions = (source.def.triggers || []).filter(trigger => descriptions.has(trigger.desc));
      const ordinal=genericOperations.indexOf(operation.originalOperation||operation);
      const offset=genericOperations.slice(0,ordinal).reduce((sum,op)=>sum+(Array.isArray(op.event)?op.event.length:1),0);
      const eventOffset=Array.isArray(operation.originalOperation?.event)?operation.originalOperation.event.indexOf(operation.event):0;
      operationRun = definitions[offset+eventOffset]?.run || null;
    }
    if (expectedKind && !witnessedObject && object && object.kind === expectedKind && object.srcCard === source &&
        (!operationRun || object.run === operationRun) && Array.isArray(object.targets)) {
      witnessedObject=object;
      if(operation.modalTrigger){
        const mode=object.mode,body=operation.modalTrigger.modalBody.modes[mode]?.body;
        assert.ok(Number.isInteger(mode)&&body,entry.raw.name+': actual Stack contains one printed trigger mode');
        if(role==='human')assert.equal(mode,operation.modalTriggerMode,entry.raw.name+': each human mode is exercised');
        const choice=trace.findLast(row=>row.query.type==='chooseOption'&&row.query.aiHint?.kind==='mode'&&row.query.aiHint.src===source&&row.query.data===object.ctx.data);
        assert.ok(choice,entry.raw.name+': controller chooses trigger mode before Stack resolution');
        assert.equal(String(choice.result),String(mode),entry.raw.name+': Stack uses the controller choice');
        assert.ok(choice.query.options.some(option=>option.key===String(mode)),entry.raw.name+': actual controller selects an available mode');
        assert.equal(object.targets.length,body.targets.length,entry.raw.name+': only selected mode targets are announced');
        for(const [index,effect]of body.effects.entries()){
          const staged=operation.modalTriggerStages[mode][index];
          if(context.groupFixtures.has(staged))context.groupFixtures.set(effect,context.groupFixtures.get(staged));
          if(context.zoneFixtures.has(staged))context.zoneFixtures.set(effect,context.zoneFixtures.get(staged));
        }
        operation={...operation,targets:body.targets,effects:body.effects};
      }
      selectedTargets = object.targets.slice();
      for(const target of selectedTargets.flat())if(target instanceof MTG.CardInst&&!before.cards.has(target))before.cards.set(target,cardState(target));
      before.oracleX=object.ctx?.x??object.x??source.castMeta?.x??0;
      before.players.get(a).pool={...a.pool};
      context.eventPlayer=object.ctx?.oracleSourceCapture?.eventPlayer||object.ctx?.data?.player;context.eventAmount=object.ctx?.data?.n;
      context.eventCard=object.ctx?.oracleSourceCapture?.eventCard||(operation.event==='blocks'?object.ctx?.data?.blocker:object.ctx?.data?.card);
      context.eventController=object.ctx?.oracleSourceCapture?.eventController||object.ctx?.data?.snap?.ctrl||context.eventCard?.ctrl;
      if(context.eventCard&&!before.cards.has(context.eventCard))before.cards.set(context.eventCard,context.eventCardBefore||cardState(context.eventCard));
    }
  };

  if(operation.kind==='spell-generic'){
    // A printed "cast from anywhere other than your hand" branch is only
    // reachable through the card's own graveyard permission, so the proof
    // casts it that way instead of from hand.
    const castOrigin=(()=>{
      let found=null;
      const visit=node=>{if(!node||typeof node!=='object')return;
        if(node.action==='conditional'&&node.condition?.kind==='cast-origin')found=node.condition;
        for(const child of Object.values(node))Array.isArray(child)?child.forEach(visit):visit(child);};
      visit(operation);return found;})();
    const graveyardCast=castOrigin&&(entry.implementation||[]).find(candidate=>candidate.kind==='mechanic-flashback');
    const from=graveyardCast?'graveyard':operation.splitFace?.aftermath?'graveyard':'hand';
    source=zoneCard(MTG,a,entry.raw.name,from);trackedCards.push(source);
    preparePaymentSource(MTG,context,source);
    prepareGenericCountSource(context,operation,source);
    await prepareCopyLinkedSource(MTG,context,entry,operation,source,v8Helpers());
    before=genericProofSnapshot(context,trackedCards);
    const splitAlt=operation.overloadVariant?source.def.altCosts.find(option=>option.overloaded):operation.splitFace?{splitHalf:operation.splitFace.key}:operation.splitFuse?{splitFuse:'right'}:null;
    if(source.def.replicate){for(const color of Object.keys(a.pool))a.pool[color]=0;const cost=MTG.parseCost(entry.raw.cost);a.pool.C=cost.generic+(cost.x||0)*3;for(const pip of cost.pips)a.pool[pip.find(c=>'WUBRGC'.includes(c))]++;}
    const entwineMarker=(entry.implementation||[]).find(candidate=>candidate.kind==='mechanic-entwine');
    if(entwineMarker&&!operation.entwineProof&&entwineMarker.cost.kind==='mana'){
      for(const color of ['W','U','B','R','G','C'])a.pool[color]=0;
      const printed=MTG.parseCost(entry.raw.cost||'');a.pool.C=printed.generic+(printed.x||0)*proofXValue(operation);
      for(const pip of printed.pips){const color=pip.find(symbol=>'WUBRGC'.includes(symbol));a.pool[color]++;}
    }
    const conditionAlt=prepareConditionPayment(MTG,context,entry);
    const graveyardAlt=graveyardCast?game.castableList(a).find(row=>row.card===source&&row.alt?.flashback)?.alt:null;
    if(graveyardCast)assert.ok(graveyardAlt,entry.raw.name+': the printed graveyard permission is offered');
    assert.equal(await game.castSpell(a,source,{from,xVal:proofXValue(operation),...(graveyardAlt?{alt:graveyardAlt}:{}),...(operation.adventure?{alt:{...source.def.adventure,adventure:true}}:splitAlt?{alt:splitAlt}:conditionAlt?{alt:conditionAlt}:{})}),true,`${entry.raw.name}/${role}: paid generic spell cast`);
    before.players.set(a,playerState(a));
    const object=game.stack.find(row=>row.kind==='spell'&&row.card===source);assert.ok(object,`${entry.raw.name}/${role}: actual spell Stack`);
    if(operation.entwineProof){
      assert.equal(object.castOpts.entwined,true,entry.raw.name+': exact Entwine announcement');
      assert.deepEqual(Array.from(object.mode),Array.from(operation.modePlan),entry.raw.name+': every printed mode selected in order');
      if(operation.entwineProof.cost.kind==='mana'){
        const printed=MTG.parseCost(entry.raw.cost||''),extra=MTG.parseCost(operation.entwineProof.cost.mana);
        const expected=printed.generic+printed.pips.length+(printed.x||0)*3+extra.generic+extra.pips.length;
        assert.equal(object.manaSpent,expected,entry.raw.name+': base and Entwine mana are both paid');
      }else assert.equal(object.sacdN,operation.entwineProof.cost.n,entry.raw.name+': exact Entwine lands sacrificed');
    }
    if(operation.overloadVariant){assert.equal(object.targets.length,0,entry.raw.name+': paid overload has no targets');assert.equal(object.castOpts.overloaded,true);}
    if(splitAlt){const cost=operation.splitFace?.cost||entry.raw.cost;assert.equal(game.stackSpellManaValue(object),MTG.mv(cost,object.x),entry.raw.name+': printed spell mana value');assert.equal(source.mv,MTG.mv(cost,object.x));}
    selectedTargets=object.targets.slice();before.oracleX=object.x??0;await settleWithStackWitness(game,stackTargets);selectedTargets=object.targets.map((target,index)=>Array.isArray(selectedTargets[index])?target:selectedTargets[index]);
    if(operation.modal){
      const selected=Array.from(object.mode),plan=Array.from(operation.modePlan);if(role==='human')assert.deepEqual(selected,plan,entry.raw.name+': every requested mode combination');
      if(operation.entwineProof)assert.deepEqual(selected,plan,entry.raw.name+': Entwine keeps every printed mode for both controllers');
      const effects=[],targets=[];let offset=0,allOffset=0;
      for(const [modeIndex,mode]of operation.modal.modes.entries()){
        if(selected.includes(modeIndex)){
          for(const [index,effect]of mode.body.effects.entries()){
            const adjusted=offsetProofEffect(effect,offset);
            (context.proofRuntimeEffects ||= new Map()).set(adjusted,effect);
            const staged=operation.effects[allOffset+index];if(context.groupFixtures.has(staged))context.groupFixtures.set(adjusted,context.groupFixtures.get(staged));if(context.zoneFixtures.has(staged))context.zoneFixtures.set(adjusted,context.zoneFixtures.get(staged));effects.push(adjusted);
          }
          targets.push(...mode.body.targets);offset=targets.length;
        }allOffset+=mode.body.effects.length;
      }
      operation={...operation,effects,targets};
    }
  }else if (operation.kind === 'generic-ability') {
    const entryCounters = (entry.implementation || []).find(candidate => candidate.kind === 'enters-with-counters');
    if (entryCounters) {
      source = zoneCard(MTG, a, entry.raw.name, 'hand');
      stageCondition(MTG,context,entryCounters.condition,source,v5Helpers());
      if(typeof entryCounters.n==='object'&&!['paid-colors','paid-times'].includes(entryCounters.n.kind))stageCount(MTG,context,entryCounters.n,v5Helpers());
      if(entryCounters.n?.kind==='paid-colors')a.pool.C=0;
      assert.equal(await game.castSpell(a, source, entryCounters.n === 'X'
        ? { from: 'hand', xVal: 3 } : entryCounters.n?.kind==='paid-colors'?{from:'hand'}:{ from: 'hand', alt: { free: true } }), true,
      `${entry.raw.name}/${role}: counter-paying ability source enters through the real Stack`);
      await resolveAll(game);
      assert.equal(source.zone, 'battlefield', `${entry.raw.name}/${role}: ability source enters with its counters`);
    } else if(proveBestowedSource&&!operation.from){
      source=zoneCard(MTG,a,entry.raw.name,'hand');
      const action=game.castableList(a).find(candidate=>candidate.card===source&&candidate.alt?.bestow&&candidate.alt.altCostStr===bestowOperation.cost);
      assert.ok(action,entry.raw.name+'/'+role+': source-quality Aura branch offers its exact Bestow cast');
      assert.equal(await game.castSpell(a,source,{from:action.from,alt:action.alt,xVal:3}),true,entry.raw.name+'/'+role+': source-quality Aura branch uses paid Bestow');
      await resolveAll(game);
      assert.equal(source.zone,'battlefield');assert.equal(source.hasSub('Aura'),true);assert.equal(source.is('Creature'),false);
      const host=game.byIid(source.attachedTo);assert.ok(host&&host.zone==='battlefield'&&host.is('Creature'),entry.raw.name+': Bestow branch has a live enchanted creature');
      trackedCards.push(host);
      for(const effect of operation.effects||[])if(effect.action==='conditional'&&effect.condition?.kind==='source-quality')for(const child of effect.effects||[]){
        if(child.action==='battlefield-group'&&(child.filters||[]).some(filter=>filter.enchanted))context.groupFixtures.set(child,[host]);
      }
    } else source = operation.from?zoneCard(MTG,a,entry.raw.name,operation.from):permanent(MTG, game, a, entry.raw.name);
    preparePaymentSource(MTG,context,source);
    prepareGenericCountSource(context,operation,source);
    await prepareCopyLinkedSource(MTG,context,entry,operation,source,v8Helpers());
    await prepareSourceProgression(MTG,context,source,entry,operation);
    if(operation.loyalty!==undefined)source.counters.loyalty=Math.max(Number(entry.raw.loyalty),-operation.loyalty+1);
    stageCondition(MTG,context,operation.activationCondition,source,v5Helpers());
    source.sick=false;
    if(cost.rmCounter && (source.counters[cost.rmCounter.kind]||0)<cost.rmCounter.n)game.addCounters(source,cost.rmCounter.kind,cost.rmCounter.n,false,a);
    if(operation.effects?.some(effect=>effect.action==='double-counters'&&effect.target==='self')){source.counters['+1/+1']=2;game.recalc();}
    trackedCards.push(source);
    before = genericProofSnapshot(context, trackedCards);
    const ordinal = (entry.implementation || []).filter(candidate => candidate.kind === 'generic-ability'&&!candidate.from)
      .indexOf(operation.originalOperation||operation);
    const compiled = operation.from==='hand'?source.def.handAbility:operation.from==='graveyard'?source.def.gyAbility:(source.def.abilities || []).filter(ability => ability.label === 'Oracle ability')[ordinal];
    assert.ok(compiled, `${entry.raw.name}/${role}: compiled generic ability ${ordinal + 1}`);
    operationRun = compiled.run;
    const action = game.activatableList(a).find(candidate => candidate.card === source && (operation.from==='hand'?candidate.handAbility:operation.from==='graveyard'?candidate.gyAbility:candidate.ability === compiled));
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
    if(operation.loyalty!==undefined){assert.equal(source.counters.loyalty,beforePayment.cards.get(source).counters.loyalty+operation.loyalty,entry.raw.name+': exact loyalty cost paid');assert.equal(game.activatableList(a).some(candidate=>candidate.card===source&&candidate.ability.loyalty!==undefined),false,entry.raw.name+': loyalty shared once each turn');}
    if(operation.oncePerObject||operation.onceEachTurn)assert.equal(game.activatableList(a).some(candidate=>candidate.card===source&&candidate.ability===compiled),false,entry.raw.name+': limit enforced after payment');
    if (cost.tap) assert.ok(tappedCosts.includes(source), `${entry.raw.name}/${role}: tap cost changes state before sacrifice can reset it`);
    if(cost.tapFilter)assert.equal(tappedCosts.filter(card=>card!==source||!cost.tap).filter(card=>matchesTarget(card,cost.tapFilter,context,source)).length,cost.tapN,entry.raw.name+': exact filtered tap cost');
    if(cost.exileSelf)assert.equal(source.zone,'exile',entry.raw.name+': exile cost paid');
    if (cost.sacSelf) assert.equal(source.zone, 'graveyard', `${entry.raw.name}/${role}: source sacrifice is paid`);
    if (cost.life) assert.equal(a.life, beforePayment.players.get(a).life - cost.life,
      `${entry.raw.name}/${role}: exact life cost is paid before resolution`);
    if (cost.rmCounter) assert.equal(source.counters[cost.rmCounter.kind] || 0,
      (beforePayment.cards.get(source).counters[cost.rmCounter.kind] || 0) - cost.rmCounter.n,
    `${entry.raw.name}/${role}: exact counter cost is removed before resolution`);
    assertActivatedCost(context, cost, source, beforePayment, trace, `${entry.raw.name}/${role}`);
    if (cost.sacCreature || cost.sacOther || cost.sacWhat || cost.sacFilter) {
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
    before.oracleX=abilityObject.ctx?.x??abilityObject.x??0;
    await settleWithStackWitness(game, stackTargets);
  } else {
    const event = operation.event;
    if ((event === 'etb' && ['self','self-card',undefined].includes(operation.eventFilter)) || event==='cast'&&operation.zone==='stack') {
      before = genericProofSnapshot(context, trackedCards);
      source = zoneCard(MTG, a, entry.raw.name, 'hand');
      preparePaymentSource(MTG,context,source);
    prepareGenericCountSource(context,operation,source);
      await prepareCopyLinkedSource(MTG,context,entry,operation,source,v8Helpers());
      stageCondition(MTG,context,operation.condition,source,v5Helpers());
      for(const effect of operation.effects||[])if(effect.action==='conditional'&&effect.condition.kind==='source-stat-comparison'&&effect.conditionTarget===undefined)stageCondition(MTG,context,effect.condition,source,v5Helpers());
      const aura=entry.implementation.find(row=>row.kind==='aura-target');if(aura)wantedTargets.push(stageGenericTarget(MTG,context,{what:aura.what.replace(/ you control$/,''),controller:'you'},'aura-host'));
      trackedCards.push(source);
      before=genericProofSnapshot(context,[...trackedCards,...wantedTargets.flat()]);
      if (entry.raw.types.includes('Land')) assert.equal(await game.playLand(a, source), true);
      else {
        const conditionAlt=prepareConditionPayment(MTG,context,entry);
        assert.equal(await game.castSpell(a, source, { from: 'hand', xVal:3,...(conditionAlt?{alt:conditionAlt}:{}) }), true,
          `${entry.raw.name}/${role}: ETB source uses real Stack`);
        if(event==='etb')await game.resolveTop();
      }
    } else {
      source = ['graveyard','cycling-source'].includes(operation.zone)?zoneCard(MTG,a,entry.raw.name,operation.zone==='cycling-source'?'hand':'graveyard'):permanent(MTG, game, a, entry.raw.name);
      const aura=entry.implementation.find(row=>row.kind==='aura-target');
      if(aura&&source.zone==='battlefield'&&!source.attachedTo){const host=stageGenericTarget(MTG,context,{what:aura.what.replace(/ you control$/,''),controller:'you'},'trigger-aura-host');await game.attach(source,host);}
      preparePaymentSource(MTG,context,source);
    prepareGenericCountSource(context,operation,source);
      await prepareCopyLinkedSource(MTG,context,entry,operation,source,v8Helpers());
      stageCondition(MTG,context,operation.activationCondition,source,v5Helpers());
      stageCondition(MTG,context,operation.condition,source,v5Helpers());
      for(const effect of operation.effects||[])if(effect.action==='conditional'&&effect.condition.kind==='source-stat-comparison'&&effect.conditionTarget===undefined)stageCondition(MTG,context,effect.condition,source,v5Helpers());
      if(operation.effects?.some(effect=>effect.action==='double-counters'&&effect.target==='self')){source.counters['+1/+1']=2;game.recalc();}
      trackedCards.push(source);
      before = genericProofSnapshot(context, trackedCards);
      if(operation.chapterIndex!==undefined){source.counters.lore=operation.chapterIndex;game.addCounters(source,'lore',1,false,a);}
      else if (typeof operation.eventFilter==='object'||['any-creature','another-creature','your-creature','your-spell-targets-self','your-second-draw','self-combat','self-unblocked'].includes(operation.eventFilter)||['attackersDeclared','cycled','scry','drawStep','targeted','discarded','dealtDamage','castCreature','becameUntapped','becameTapped','lto','turnedFaceUp'].includes(event)) {
        await fireGenericEvent(MTG,context,source,operation);
      }else if (operation.eventFilter === 'another-your-creature') {
        const visitor = new MTG.CardInst(fixtureDefinition('Oracle Friendly Visitor', ['Creature']), a);
        stageEventConditions(MTG,context,visitor,operation);
        context.eventCardStats={power:visitor.power,toughness:visitor.toughness};
        visitor.zone = 'nowhere';
        await game.move(visitor, 'battlefield', { ctrl: a });
        context.eventCard=visitor;context.eventCardBefore=cardState(visitor);context.eventCardStats={power:visitor.power,toughness:visitor.toughness};
        if (event === 'dies') await game.destroy(visitor);
      } else if (operation.eventFilter === 'another-your-artifact') {
        const visitor = new MTG.CardInst(fixtureDefinition('Oracle Artifact Visitor', ['Artifact']), a);
        visitor.zone = 'nowhere';
        await game.move(visitor, 'battlefield', { ctrl: a });
      } else if (event === 'dies') await game.sacrifice(a,source);
      else if (event === 'attacks') {
        source.attacking = b;
        game.combat={...(game.combat||{}),attackers:[...new Set([...(game.combat?.attackers||[]),source])],defenders:game.combat?.defenders||new Map()};
        await game.emit('attacks', { card: source, player: a, defender: b });
      } else if (event === 'blocks') {
        const attacker = permanent(MTG, game, b, fixtureDefinition('Oracle Generic Attacker', ['Creature']));
        source.blocking = attacker.iid;
        attacker.attacking=a;attacker.blockedBy=[source];game.combat={attackers:[attacker],defenders:new Map()};
        await game.emit('blocks', { attacker, blocker: source });
      } else if (event === 'becomesBlocked') {
        const blocker = permanent(MTG, game, b, fixtureDefinition('Oracle Generic Blocker', ['Creature']));
        source.attacking = b;
        source.blockedBy = [blocker];
        blocker.blocking=source.iid;game.combat={attackers:[source],defenders:new Map()};
        await game.emit('becomesBlocked', { attacker: source, blockers: [blocker] });
      } else if (event === 'combatDamageToPlayer') {
        await game.emit(event, { card: source, player: damagedPlayer, n: 2, step: 'normal' });
      } else if (event === 'damageToPlayer') {
        await game.emit(event, { src: source, player: damagedPlayer, n: 2, combat: true });
      } else if (event === 'upkeep' || event === 'endStep' || event === 'beginCombat' || event === 'precombatMain') {
        await game.emit(event, { player: operation.eventFilter==='opponent-player'?b:a });
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
        await game.draw(operation.eventFilter==='opponent-player'?b:a, 1, source);
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
  if(operation.modalTrigger)assert.ok(witnessedObject,entry.raw.name+': modal trigger has an actual Stack witness');
  if (!before.cards.has(source)) before.cards.set(source, {
    zone: 'nowhere', tapped: false, power: Number(entry.raw.power) || 0,
    toughness: Number(entry.raw.toughness) || 0, counters: {},
  });
  for (const target of selectedTargets) {
    if (target instanceof MTG.CardInst && !before.cards.has(target)) before.cards.set(target, cardState(target));
  }
  context.proofEffects=operation.effects;
  const priorGenericMoves=new Map();
  for (let index = 0; index < (operation.effects || []).length; index++) {
    const effect=operation.effects[index],subject=genericEffectTarget(effect,selectedTargets,source,context);
    if((operation.modal||operation.splitFuse)&&subject instanceof MTG.CardInst&&priorGenericMoves.has(subject)){
      assert.equal(subject.zone,priorGenericMoves.get(subject),'later mode does not adopt a target with a new zone identity');continue;
    }
    await assertGenericEffectEvidence(MTG, context, entry, operation.effects[index], source, selectedTargets,
      damagedPlayer, before, trace, `${entry.raw.name}/${role}/${operation.kind}/effect-${index + 1}`);
    const destination={destroy:'graveyard',exile:'exile',bounce:'hand','move-to-hand':'hand','move-to-library':'library','owner-library-choice':'library',reanimate:'battlefield'}[effect.action];
    if(destination&&subject instanceof MTG.CardInst)priorGenericMoves.set(subject,destination);
  }
  const verifyTokens=async effects=>{for(const effect of effects||[]){if(effect.token?.operations)await printedTokenProof(MTG,context,entry,effect,before,trace,entry.raw.name+'/'+role);if(effect.action==='grant-operation')await grantedEffectProof(MTG,context,entry,effect,source,selectedTargets,trace,entry.raw.name+'/'+role);if(effect.effects)await verifyTokens(effect.effects);}};
  await verifyTokens(operation.effects);
  await finishCopyLinkedProof(MTG,context,entry,v8Helpers());
  await finishV8EffectProof(MTG,context,entry,v8Helpers());
  if(operation.adventure){assert.equal(source.zone,'exile',entry.raw.name+': Adventure exiles after resolution');game.turnPlayer=a;game.phase='main1';fund(a,100);assert.ok(game.castableList(a).some(row=>row.card===source&&row.from==='exile'&&!row.alt?.adventure),entry.raw.name+': normal half offered from exile');assert.equal(await game.castSpell(a,source,{from:'exile'}),true,entry.raw.name+': paid cast of normal half');await resolveAll(game);assert.equal(source.zone,'battlefield',entry.raw.name+': normal half enters battlefield');}
  if(operation.splitFace||operation.splitFuse)assert.equal(source.zone,operation.splitFace?.aftermath?'exile':'graveyard',entry.raw.name+': split destination');
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

  if(['mechanic-delve','mechanic-improvise','mechanic-affinity-artifacts'].includes(kind)) {
    for(const op of entry.implementation) {
      if(op.kind==='spell-v4')for(const [index,target] of op.targets.entries()) {
        await stageSpellV4Target(MTG,context,{name:entry.raw.name},target,op.effects.find(e=>e.targetIds.includes(target.id)),spellV4TargetVariants(target)[0],index);
      }
      else if(op.kind==='spell-generic')for(const [index,target] of op.targets.entries())target.zone==='stack'?await stageGenericStackTarget(MTG,context,target,index):stageGenericTarget(MTG,context,target,index,op.effects.find(e=>e.target===index));
      else if(op.kind==='spell-counter') {
        const dummy=new MTG.CardInst(fixtureDefinition('V6 counterable spell',['Instant'],{cost:'{0}'}),b);
        dummy.zone='hand';b.hand.push(dummy);assert.equal(await game.castSpell(b,dummy,{from:'hand'}),true);
      }
      else if(['spell-damage','spell-destroy','spell-exile','spell-bounce','spell-pump'].includes(op.kind)) {
        const raw=(op.what||'creature').replace(/^target /,'');
        stageGenericTarget(MTG,context,{what:raw.replace(/^attacking or blocking /,''),attackingOrBlocking:raw.includes('attacking or blocking'),controller:'opponent'},0,{action:op.kind.slice(6),n:op.n});
      }
    }
  }
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
      await game.move(source,'exile');
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

function spellV4Amount(node,x=3) {
  if (!node) return 0;
  if (node.kind === 'number') return Number(node.value) || 0;
  if (node.kind === 'variable') return x;
  if (node.kind === 'multiply') return node.operands.reduce((product, value) => product * spellV4Amount(value,x), 1);
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
  const n = spellV4Amount(effect.amount,before.oracleX??3);
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
    for(const subject of targets){const decision=trace.findLast(item=>item.query.type==='chooseOption'&&item.query.prompt?.endsWith(`tap or untap ${subject.name}?`));assert.ok(decision,`${label}: tap/untap choice`);assert.equal(subject.tapped,decision.result==='tap',`${label}: chosen tapped state`);}
  } else if(effect.kind==='exileGraveyard'){
    assert.ok(oldPlayer.graveyardCards.length,`${label}: nonempty graveyard proof`);assert.ok(oldPlayer.graveyardCards.every(card=>card.zone==='exile'),`${label}: entire target graveyard exiled`);
  } else if(effect.kind==='exileAllGraveyards'){
    for(const player of game.players)assert.ok(before.players.get(player).graveyardCards.every(card=>card.zone==='exile'),label+': all graveyards exiled');
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
      for(const effect of operation.effects)if(['exileGraveyard','exileAllGraveyards'].includes(effect.kind)){zoneCard(MTG,a,'Forest','graveyard');zoneCard(MTG,b,'Forest','graveyard');}
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
      const conditionAlt=prepareConditionPayment(MTG,context,entry);if(conditionAlt)castOptions.alt=conditionAlt;
      if(source.def.replicate&&!nested)for(const color of Object.keys(a.pool))a.pool[color]=0;
      const cast = await game.castSpell(a, source, nested?{from:'hand',xVal:3}:castOptions);
      assert.equal(cast, true,
        `${entry.raw.name}/${role}: spell-v4 plan ${JSON.stringify(basePlan.modes)} variant ${variantIndex} casts`);
      let stackObject = game.stack.find(candidate => candidate.card === source);
      assert.ok(stackObject, `${entry.raw.name}/${role}: spell-v4 source reaches Stack`);
      if(nested){
        if(nested.event==='etb'&&['self','self-card',undefined].includes(nested.eventFilter)){
          stageCondition(MTG,context,nested.condition,source,v5Helpers());
          await game.resolveTop();await game.flushTriggers();
        }else{
          await resolveAll(game);
          assert.equal(source.zone,'battlefield',`${entry.raw.name}: nested source enters`);
          source.sick=false;source.tapped=false;targetDecisionIndex=0;
          for(const effect of operation.effects)if(['exileGraveyard','exileAllGraveyards'].includes(effect.kind)){zoneCard(MTG,a,'Forest','graveyard');zoneCard(MTG,b,'Forest','graveyard');}
          for(const id of basePlan.targetIds){
            const target=targetMap.get(id);
            if(target.kind==='spell')stagedById.set(id,await stageSpellV4Target(MTG,context,source,target,firstEffectForTarget(id),spellV4TargetVariants(target)[0],0));
          }
          wantedTargetGroups=basePlan.targetIds.map(id=>[stagedById.get(id)].flat().filter(Boolean));wantedTargets=wantedTargetGroups.flat();
          if(nested.kind==='generic-ability'){
            stageCondition(MTG,context,nested.activationCondition,source,v5Helpers());
            const cost=nested.cost||{};
            if(cost.rmCounter)game.addCounters(source,cost.rmCounter.kind,cost.rmCounter.n,false,a);
            if(cost.sacWhat||cost.sacCreature||cost.sacOther){
              const type=cost.sacWhat?cost.sacWhat[0].toUpperCase()+cost.sacWhat.slice(1):'Creature';
              wantedCards.unshift(permanent(MTG,game,a,fixtureDefinition('V5 ability fodder',[type],{power:'0',toughness:'1'})));
            }
            before=genericProofSnapshot(context,[...game.battlefield,...trackedCards,source]);
            const ordinal=entry.implementation.filter(o=>o.kind==='generic-ability'&&!o.from).indexOf(nested);
            if(nested.from==='hand')await game.move(source,'hand');
            const compiled=nested.from==='hand'?source.def.handAbility:source.def.abilities.filter(o=>o.label==='Oracle ability')[ordinal];
            if(cost.mana?.includes('{X}')){
              const mana=MTG.parseCost(cost.mana);for(const color of Object.keys(a.pool))a.pool[color]=0;
              a.pool.C=mana.generic+3*mana.x;for(const pip of mana.pips)a.pool[pip[0]]++;
            }
            const action=game.activatableList(a).find(row=>row.card===source&&(nested.from==='hand'?row.handAbility:row.ability===compiled));assert.ok(action,`${entry.raw.name}: nested paid activation available`);
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
      if (desiredModes && role === 'human') assert.deepEqual(Array.from(stackObject.mode).sort(), Array.from(desiredModes).sort(),
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
      before.oracleX=stackObject.ctx?.x??stackObject.x??3;
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

async function costModifierProof(MTG,entry,op,role){
  const ctx=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a}=ctx;
  const source=op.self?zoneCard(MTG,a,entry.raw.name,'hand'):permanent(MTG,game,a,entry.raw.name);
  stageCondition(MTG,ctx,op.condition,source,v5Helpers());if(op.multiplier)stageCount(MTG,ctx,op.multiplier,v5Helpers());
  if(op.multiplier?.kind==='source-counters')source.counters[op.multiplier.counter]=3;
  if(op.targetCondition){
    const printedTarget=entry.implementation.flatMap(operation=>operation.targets||[]).find(target=>target.zone==='battlefield'&&!(op.targetCondition.controller==='opponent'&&target.controller==='you')&&!(op.targetCondition.controller==='you'&&target.controller==='opponent'));
    const base=printedTarget?.alternatives?.[0]||printedTarget||{};
    const filter={...base,...op.targetCondition,...(op.targetCondition.what==='permanent'&&base.what?{what:base.what}: {}),controller:base.controller&&base.controller!=='any'?base.controller:op.targetCondition.controller};
    if(op.targetCondition.zone==='stack')await stageGenericStackTarget(MTG,ctx,filter,'discount');else stageGenericTarget(MTG,ctx,filter,'discount');
  }
  let card=source,player=a;
  if(!op.self){card=stageGenericTarget(MTG,ctx,{...op.target,controller:op.controller==='opponents'?'opponent':'you'},0);player=card.ctrl;await game.move(card,'hand');card.def={...card.def,cost:'{20}{G}'};}
  const castOpts=op.from?{from:op.from==='not-hand'?'exile':op.from}:{};
  if(op.from)await game.move(card,castOpts.from);
  const modifierField=op.targetCondition?'selfTargetCostAdjust':'selfCostAdjust';
  const actual=game.spellCost(player,card,castOpts),descriptor=op.self?source.def[modifierField]:source.def.costMods,colors=source.def.selfColoredCostIncrease;
  const modifierIndex=entry.implementation.filter(row=>row.kind==='cost-modifier'&&!row.self).indexOf(op);
  let base;
  try{if(op.self){source.def[modifierField]=undefined;if(op.coloredIncrease)source.def.selfColoredCostIncrease=undefined;}else source.def.costMods=descriptor.filter((_,index)=>index!==modifierIndex);base=game.spellCost(player,card,castOpts);}
  finally{if(op.self){source.def[modifierField]=descriptor;source.def.selfColoredCostIncrease=colors;}else source.def.costMods=descriptor;}
  if(op.targetCondition)assert.equal(game.spellCost(player,card,{targets:[]}).generic,base.generic,entry.raw.name+': no target means no target discount');
  const expected=op.amount*(op.multiplier?countValue(ctx,source,op.multiplier):1);
  assert.equal(actual.generic,Math.max(0,base.generic+expected),entry.raw.name+': exact generic cost modifier');
  if(op.coloredIncrease)assert.deepEqual(Array.from(actual.pips.slice(base.pips.length),pip=>Array.from(pip)),Array.from({length:op.multiplier?countValue(ctx,source,op.multiplier):1},()=>op.coloredIncrease.map(color=>[color])).flat(),entry.raw.name+': exact additional colored mana');
  fund(player,100);const before=poolTotal(player);assert.equal(await game.payMana(player,actual,{card}),true);
  assert.equal(before-poolTotal(player),actual.generic+actual.pips.length,entry.raw.name+': discounted total actually paid');
  return 2;
}

async function attachmentOperationProof(MTG,entry,op,role){
  const child=op.operation||op.grantedOperation,global=!!op.grantedOperation;
  if(op.proofBranch===undefined&&hasConditionalBranches(child.effects)){let checks=0;for(const proofBranch of [true,false])checks+=await attachmentOperationProof(MTG,entry,{...op,proofBranch},role);return checks;}
  if(Array.isArray(child.event)){let checks=0;for(const event of child.event)checks+=await attachmentOperationProof(MTG,entry,{...op,operation:{...child,event}},role);return checks;}
  let costHost;
  const trace=[],controller=recordingDecision(trace,{chooseX:(g,q)=>Math.min(3,q.max??3),chooseCards:(g,q)=>q.from.slice().sort((a,b)=>Number(a===costHost)-Number(b===costHost)).slice(0,q.min||1)});
  const ctx=gameFor(MTG,[controller,decision()],{ai:role==='ai'}),{game,a}=ctx;
  installEffectEvidence(ctx);
  installCopyLinkedProof(MTG,ctx);
  installPaymentProof(MTG,ctx,{...v8Helpers(),trace:role==='ai'?ctx.aiDecisions:trace});
  ctx.proofEffects=child.effects;
  ctx.proofBranch=op.proofBranch;
  ctx.groupFixtures=new Map();
  fund(a,100);fillLibrary(MTG,a,40);fillLibrary(MTG,ctx.b,40);for(let i=0;i<10;i++){zoneCard(MTG,a,'Forest','hand');zoneCard(MTG,ctx.b,'Forest','hand');}
  ctx.b.controller=recordingDecision(role==='ai'?ctx.aiDecisions:trace);
  for(const effect of child.effects||[]){
    if(effect.action==='battlefield-group'){
      const cards=[];for(const filter of effect.filters)for(const controller of ['you','opponent'])cards.push(stageGenericTarget(MTG,ctx,{...filter,controller:filter.controller==='any'?controller:filter.controller},cards.length));
      ctx.groupFixtures.set(effect,cards);
    }
    if(effect.action==='put-from-hand'||effect.action==='search-library'){
      const card=stageGenericTarget(MTG,ctx,{what:effect.what,controller:'you',zone:'graveyard'},'granted-selection');
      a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone=effect.action==='put-from-hand'?'hand':'library';a[card.zone].push(card);
    }
  }
  const parent=permanent(MTG,game,a,entry.raw.name),auraTarget=entry.implementation.find(row=>row.kind==='aura-target');
  stageCondition(MTG,ctx,op.condition,parent,v5Helpers());
  const host=global&&op.scope==='self'?parent:stageGenericTarget(MTG,ctx,global?{...op.filters[0],controller:'you'}:{what:(auraTarget?.what||'creature').replace(/ you control$/,''),controller:'you'},0);
  // Use a small, independent host for power-based token production. Its
  // toughness remains large enough for unrelated nonlethal damage probes.
  if(host!==parent&&!host.def.oracleImplementation&&flattenProofEffects(child.effects).some(effect=>['token','token-inline','token-key'].includes(effect.action)&&['source-stat','explicit-source-stat'].includes(effect.n?.kind)&&effect.n.stat==='power')){
    host.def={...host.def,power:'3'};game.recalc();
  }
  costHost=host;
  if(!global)assert.equal(await game.attach(parent,host),true,entry.raw.name+': real attachment');host.sick=false;
  if(child.kind==='mana-source'){
    await grantedManaProof(MTG,ctx,entry,child,host,entry.raw.name+'/'+role);
    if(parent.zone==='battlefield')await game.move(parent,'exile');game.recalc();if(host.zone==='battlefield')assert.equal(host.cur.extraMana.length,0,entry.raw.name+': granted mana leaves with its source');else assert.equal(game.manaSources(a).some(row=>row.card===host),false,entry.raw.name+': an exiled source cannot activate its former grant');return 1;
  }
  const targets=[];
  if(child.v4Body)for(const [index,target]of child.v4Body.targets.entries())targets.push(await stageSpellV4Target(MTG,ctx,host,target,child.v4Body.effects.find(e=>e.targetIds.includes(target.id)),spellV4TargetVariants(target)[0],index));
  else for(const [index,target]of(child.targets||[]).entries())targets.push(stageGenericTarget(MTG,ctx,target,index,child.effects?.find(effect=>effect.target===index)));
  for(const effect of child.effects||[])if(effect.action==='conditional'&&effect.elseEffects)(op.proofBranch===false?stageFalseCondition:stageCondition)(MTG,ctx,effect.condition,targets[effect.conditionTarget]||host,v5Helpers());
  for(const effect of flattenProofEffects(child.effects||[])){
    stageCopyLinkedEffect(MTG,ctx,effect,v8Helpers());
    stageV8Effect(MTG,ctx,effect,v8Helpers());
    stagePaymentEffect(MTG,ctx,effect,v8Helpers());
  }
  await prepareCopyLinkedSource(MTG,ctx,entry,child,host,v8Helpers());
  preparePaymentSource(MTG,ctx,host);
  prepareGenericCountSource(ctx,child,host);
  if(child.cost?.rmCounter)game.addCounters(host,child.cost.rmCounter.kind,child.cost.rmCounter.n,false,a);
  if(child.cost?.sacWhat||child.cost?.sacCreature)for(let i=0;i<2;i++){const paid=stageGenericTarget(MTG,ctx,{what:child.cost.sacWhat||'creature',controller:'you'},i);if(paid.is('Creature')){paid.def.power='0';paid.def.toughness='1';game.recalc();}}
  if(child.cost?.sacFilter)for(let i=0;i<(child.cost.sacN||1);i++)stageGenericTarget(MTG,ctx,{...child.cost.sacFilter,controller:'you'},'cost-'+i);
  if(child.cost?.exileFilter)for(let i=0;i<child.cost.exileFromGY;i++)stageGenericTarget(MTG,ctx,{...child.cost.exileFilter,controller:'you',zone:'graveyard'},'cost-'+i);
  let before=genericProofSnapshot(ctx,[parent,host,...targets.flat()]);
  if(child.kind==='generic-ability'){
    const action=game.activatableList(a).find(row=>row.card===host&&host.cur.extraAbilities.includes(row.ability));
    assert.ok(action,entry.raw.name+': granted activation offered');assert.equal(await game.activateAbility(a,action),true);
    before=genericProofSnapshot(ctx,[parent,host,...targets.flat()]);
  }else{stageCondition(MTG,ctx,child.condition,host,v5Helpers());await fireGenericEvent(MTG,ctx,host,child);await game.flushTriggers();}
  const so=game.stack.find(row=>row.srcCard===host);assert.ok(so,entry.raw.name+': granted ability is on Stack');
  assert.equal(so.ctrl,a,entry.raw.name+': host controls granted ability');before.oracleX=so.ctx?.x??0;ctx.eventAmount=so.ctx?.data?.n;
  await resolveAll(game);const decisions=role==='ai'?ctx.aiDecisions:trace;
  if(child.v4Body){const chosen=new Map(child.v4Body.targets.map((target,index)=>[target.id,so.targets[index]]));for(const effect of child.v4Body.effects)assertSpellV4EffectEvidence(MTG,ctx,entry,effect,chosen,before,decisions,entry.raw.name+'/'+role,new Map());}
  else for(const effect of child.effects)await assertGenericEffectEvidence(MTG,ctx,{...entry,implementation:[child]},effect,host,so.targets,ctx.b,before,decisions,entry.raw.name+'/'+role);
  await finishCopyLinkedProof(MTG,ctx,entry,v8Helpers());
  await finishV8EffectProof(MTG,ctx,entry,v8Helpers());
  if(parent.zone==='battlefield')await game.move(parent,'exile');game.recalc();
  if(host.zone==='battlefield'){assert.equal(host.cur.extraAbilities.length,0);assert.equal(host.cur.extraTriggers.length,0);}
  return Math.max(1,child.effects?.length||child.v4Body?.effects.length||0);
}

async function operationProof(MTG, entry, operation, role = 'human') {
  if(operation.kind==='mechanic-mayhem-v8')return mayhemProof(MTG,entry,operation,role,v8Helpers());
  if (operation.kind === 'double-faced-v8') {
    assert.equal(operation.faces.length, 2, entry.raw.name + ': both complete printed faces');
    let checks = 0;
    for (const face of operation.faces) {
      const faceEntry = faceProofEntry(entry, face);
      checks += await withFaceProof(faceEntry, async () => {
        let faceChecks = 0;
        try {
          if (faceEntry.implementation.length) {
            for (const op of faceEntry.implementation) faceChecks += await operationProof(MTG, faceEntry, op, role);
          } else faceChecks += await cardProof(MTG, faceEntry, role);
          for (const keyword of declaredKeywordOccurrences(MTG, faceEntry)) faceChecks += await keywordProof(MTG, faceEntry, keyword, role);
        } catch (error) {error.message = face.key + ' (' + face.raw.name + '): ' + error.message; throw error;}
        assert.ok(faceChecks > 0, entry.raw.name + ': nonempty behavior proof for ' + face.key);
        return faceChecks;
      });
    }
    return checks;
  }
  if(operation.kind==='generic-static'&&(operation.cantUntap||operation.optionalUntap)||operation.kind==='attachment-grant'&&operation.skipUntap)return untapProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='commander-pairing')return commanderPairingProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='mechanic-bestow')return bestowProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='mechanic-entwine'){
    const modal=entry.implementation.find(candidate=>candidate.kind==='spell-modal-generic');
    assert.ok(modal&&modal.modes?.length===operation.modeCount,entry.raw.name+': Entwine proof has the exact modal body');
    return genericRuntimeOperationProof(MTG,entry,{...modal,entwineProof:operation},role);
  }
  if(operation.kind==='aura-control-v8')return auraControlProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='v8-replacement')return replacementProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='copy-as-enters-v8')return copyEntryProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='mechanic-ascend'){
    const ctx=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a,b}=ctx;
    assertControllerRole(MTG,ctx,entry.raw.name+'/'+role+'/ascend');
    fund(a,100);fillLibrary(MTG,a,60);fillLibrary(MTG,b,60);stageCardCosts(MTG,ctx,entry);
    for(const op of entry.implementation)for(const [index,target]of(op.targets||[]).entries())if(target.zone!=='stack')stageGenericTarget(MTG,ctx,target,'ascend-'+index);
    const permanentCard=!entry.raw.types.some(type=>['Instant','Sorcery'].includes(type));
    const required=permanentCard?8:10;
    assert.ok(game.bf().filter(card=>card.ctrl===a).length<=required,entry.raw.name+': controlled ascend threshold fixture');
    while(game.bf().filter(card=>card.ctrl===a).length<required)permanent(MTG,game,a,'Forest');
    assert.equal(a.cityBlessing,false,entry.raw.name+': no blessing without ascend');
    const source=zoneCard(MTG,a,entry.raw.name,'hand');
    if(entry.raw.types.includes('Land'))assert.equal(await game.playLand(a,source),true);
    else assert.equal(await game.castSpell(a,source,{from:'hand'}),true,entry.raw.name+': actual paid ascend cast');
    await resolveAll(game);
    if(permanentCard){
      assert.equal(source.zone,'battlefield');assert.equal(a.cityBlessing,false,entry.raw.name+': nine permanents do not qualify');
      const tenth=zoneCard(MTG,a,'Forest','hand');await game.move(tenth,'battlefield',{ctrl:a});
    }
    assert.equal(a.cityBlessing,true,entry.raw.name+': actual ascend grants at ten permanents');
    for(const card of game.bf().filter(card=>card.ctrl===a).slice(0,5))await game.move(card,'hand');
    assert.equal(a.cityBlessing,true,entry.raw.name+': blessing persists below ten and without the source');
    return 5;
  }
  if(operation.kind==='base-pt-static'||operation.kind==='protection-static'){
    const context=gameFor(MTG,[decision({chooseCards:(g,q)=>q.from.slice(0,q.max??1),chooseTargets:(g,q)=>q.candidates.slice(0,q.max??1)}),decision()],{ai:role==='ai'}),{game,a,b}=context;
    fund(a,100);fillLibrary(MTG,a,30);fillLibrary(MTG,b,30);stageCardCosts(MTG,context,entry);
    const probe=operation.own?null:stageGenericTarget(MTG,context,operation.attached?{what:'creature',controller:'you'}:operation.filters[0],'static-base');
    const source=zoneCard(MTG,a,entry.raw.name,'hand');
    if(operation.condition)stageCondition(MTG,context,operation.condition,source,v5Helpers());
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await resolveAll(game);
    if(operation.attached&&!source.attachedTo){const action=game.activatableList(a).find(row=>row.card===source&&row.equip);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await resolveAll(game);}
    const target=operation.own?source:operation.attached?game.byIid(source.attachedTo):probe;
    if(operation.kind==='protection-static'){
      for(const quality of operation.qualities){const origin=quality.kind==='filters'?stageGenericTarget(MTG,context,quality.filters[0],'protection-origin'):permanent(MTG,game,b,fixtureDefinition('Static protection source',[quality.kind==='type'?quality.value:'Creature'],{power:'2',toughness:'20',colorsOverride:quality.kind==='color'?[quality.value]:quality.kind==='colored'||quality.kind==='monocolored'?['R']:quality.kind==='multicolored'?['R','G']:[],subtypes:quality.kind==='subtype'?[quality.value]:[]}));assert.equal(game.isProtectedFrom(target,origin),true);if(target.is('Creature'))assert.equal(await game.damageCreature(origin,target,1),0);}
      return operation.qualities.length*2;
    }
    const value=n=>typeof n==='number'?n:n.kind==='life-total'?a.life:countValue(context,source,n,genericProofSnapshot(context,[source,target]));
    assert.equal(target.cur.basePower,value(operation.power));assert.equal(target.cur.baseToughness,value(operation.toughness));
    for(const keyword of operation.keywords)assert.ok(target.kw(keyword));for(const subtype of operation.subtypes)assert.ok(target.hasSub(subtype));
    const before=target.power;game.addCounters(target,'+1/+1',2);assert.equal(target.power,before+2);
    return 4;
  }
  if(operation.kind==='copy-as-enters'){
    const context=gameFor(MTG,[decision({chooseCards:(g,q)=>q.from.slice(0,1)}),decision()],{ai:role==='ai'}),{game,a,b}=context;
    const model=stageGenericTarget(MTG,context,operation.filter,'copy-entry');
    if(operation.condition)stageCondition(MTG,context,operation.condition,null,v5Helpers());
    fund(a,100);fillLibrary(MTG,a,30);fillLibrary(MTG,b,30);stageCardCosts(MTG,context,entry);
    const source=zoneCard(MTG,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await resolveAll(game);
    assert.equal(source.zone,'battlefield');assert.ok(source.isCopyOf,entry.raw.name+': copy chosen at entry');
    assert.equal(source.name,source.isCopyOf.name);
    const mod=operation.modifications;
    for(const type of mod.types||[])assert.ok(source.is(type));
    for(const subtype of mod.subtypes||[])assert.ok(source.hasSub(subtype));
    for(const keyword of mod.keywords||[])assert.ok(source.kw(keyword));
    if(mod.power!==undefined)assert.equal(Number(source.def.power),mod.power);
    if(mod.toughness!==undefined)assert.equal(Number(source.def.toughness),mod.toughness);
    assert.equal(model.zone,operation.filter.zone);
    await game.move(source,'hand');assert.equal(source.name,source.oracleFaces?.faces[0].def.name||entry.raw.name);assert.equal(source.isCopyOf,null);
    return 4;
  }
  if(operation.kind==='damage-prevention'){
    const context=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a,b}=context,source=zoneCard(MTG,a,entry.raw.name,'hand');
    fund(a,100);fillLibrary(MTG,a,30);fillLibrary(MTG,b,30);
    const aura=entry.implementation.find(op=>op.kind==='aura-target');if(aura)stageGenericTarget(MTG,context,{what:aura.what.replace(/ you control$/,''),controller:'you'},'prevention-aura-host');
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await resolveAll(game);
    assert.equal(source.zone,'battlefield');
    if(operation.target==='attached-host'&&!source.attachedTo){
      permanent(MTG,game,a,fixtureDefinition('Prevention equip host',['Creature'],{power:'4',toughness:'20'}));
      const equip=game.activatableList(a).find(row=>row.card===source&&row.equip);assert.ok(equip);
      assert.equal(await game.activateAbility(a,equip),true);await resolveAll(game);assert.ok(source.attachedTo);
    }
    await assertGenericEffectEvidence(MTG,context,entry,operation,source,[],context.b,genericProofSnapshot(context,[source]),[],entry.raw.name+'/'+role);
    return 3;
  }
  if(operation.kind==='split-faces'){
    let checks=0;
    for(const face of operation.faces)checks+=await genericRuntimeOperationProof(MTG,entry,{kind:'spell-generic',splitFace:face,targets:face.targets,effects:face.effects},role);
    if(operation.fuse){
      const [left,right]=operation.faces,offset=left.targets.length;
      const shifted=value=>Array.isArray(value)?value.map(shifted):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,['target','otherTarget','who','conditionTarget'].includes(key)&&typeof child==='number'?child+offset:shifted(child)])):value;
      checks+=await genericRuntimeOperationProof(MTG,entry,{kind:'spell-generic',splitFuse:true,targets:[...left.targets,...right.targets],effects:[...left.effects,...shifted(right.effects)]},role);
    }
    return checks;
  }
  if(operation.kind==='saga-chapters'){let checks=0;for(const [chapterIndex,chapter]of operation.chapters.entries())checks+=await genericRuntimeOperationProof(MTG,entry,{kind:'generic-trigger',event:'saga-chapter',eventFilter:'self',chapterIndex,...chapter},role);return checks;}
  if(operation.kind==='adventure-face')return genericRuntimeOperationProof(MTG,entry,{kind:'spell-generic',adventure:true,targets:operation.targets,effects:operation.effects},role);
  if(operation.kind==='cost-modifier')return costModifierProof(MTG,entry,operation,role);
  if(operation.kind==='attachment-operation'||operation.grantedOperation)return attachmentOperationProof(MTG,entry,operation,role);
  if(mechanicKinds.has(operation.kind))return v5MechanicProof(MTG,entry,operation,role,v5Helpers());
  if(operation.kind==='characteristic-pt')return characteristicProof(MTG,entry,operation,role,v5Helpers());
  if (['generic-trigger', 'generic-ability', 'generic-static', 'spell-generic', 'spell-modal-generic', 'enters-with-counters',
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
  installEffectEvidence(context);
  const name = entry.raw.name;
  const operations = entry.implementation || [];
  stageCardCosts(MTG,context,entry);

  const stageSpellTarget = async targetOperation => {
    let effectTarget = null;
    let counterTarget = null;
    const generic=operations.find(op=>op.kind==='spell-generic');
    if(!targetOperation&&generic){
      wantedTargets=[];for(const [index,target]of generic.targets.entries())wantedTargets.push(target.zone==='stack'?await stageGenericStackTarget(MTG,context,target,index):stageGenericTarget(MTG,context,target,index,generic.effects.find(effect=>effect.target===index)));
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
    assert.equal(source.zone, source.def.madness?'exile':'graveyard', `${name}: Cycling discards the source with its replacement`);
    assert.equal(a.library.length, beforeLibrary, `${name}: Cycling draw waits on the Stack`);
    assert.equal(game.stack.some(item => item.kind === 'ability' && item.srcCard === source), true,
      `${name}: Cycling creates a respondable activated ability`);
    const cyclingObject=game.stack.find(item=>item.kind==='ability'&&item.srcCard===source);
    while(game.stack.at(-1)!==cyclingObject){await game.flushTriggers();await game.resolveTop();}
    const beforeCyclingDraw=a.library.length;
    await game.resolveTop();
    assert.equal(a.library.length, beforeCyclingDraw - 1, `${name}: Cycling itself draws exactly one card after its independent triggers`);
    await resolveAll(game);
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

  if (['mechanic-morph','mechanic-disguise','mechanic-megamorph'].includes(operation.kind)) {
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
    assert.equal(source.name, source.oracleFaces?.faces[0].def.name || name);
    if(operation.kind==='mechanic-megamorph')assert.equal(source.counters['+1/+1'],1,`${name}: megamorph counter is part of turning face up`);
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
    let resolvedHit=false;
    const lowerDef = fixtureDefinition('Oracle Cascade Hit', ['Instant'], {
      cost: '{0}', resolve: async ctx => { const before=ctx.you.life;await ctx.g.gainLife(ctx.you, 1, ctx.src);assert.equal(ctx.you.life,before+1);resolvedHit=true; },
    });
    const lower = new MTG.CardInst(lowerDef, a);
    lower.zone = 'library';
    a.library.push(lower);
    await stageSpellTarget(targetOperation);
    const source = zoneCard(MTG, a, name, 'hand');
    assert.equal(await game.castSpell(a, source, { from: 'hand', alt: { free: true } }), true, `${name}: Cascade source casts`);
    await resolveAll(game);
    assert.equal(lower.zone, 'graveyard', `${name}: Cascade hit is cast and resolves`);
    assert.equal(resolvedHit,true, `${name}: cascaded spell executes its resolver before the source ETB`);
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
    const source = await enterPermanentProof(MTG, context, entry, {holdLandTriggers:['enters-tapped','mana-source'].includes(operation.kind)});

    if (operation.kind === 'enters-tapped') {
      assert.equal(source.tapped, true, `${name}: enters-tapped replacement`);
      return 1;
    }
    if (operation.kind === 'etb-life-gain') {
      assert.equal(a.life, lifeBefore + operation.n, `${name}: exact ETB life gain`);
      return 1;
    }
    if (operation.kind === 'etb-draw') {
      const copies=entry.implementation.some(row=>row.kind==='mechanic-squad')?(source.castMeta?.paidTimes||0):0;
      assert.equal(a.library.length, libraryBefore - operation.n*(1+copies), `${name}: exact ETB draw for the source and any paid Squad copies`);
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
        assert.equal(Number(token.def.power), Number(operation.token.power), `${name}: printed token power`);
        assert.equal(Number(token.def.toughness), Number(operation.token.toughness), `${name}: printed token toughness`);
        if (!operations.some(op => op.kind === 'generic-static')) {
          assert.equal(token.power, Number(operation.token.power), `${name}: token power`);
          assert.equal(token.toughness, Number(operation.token.toughness), `${name}: token toughness`);
        }
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
      stageCondition(MTG,context,operation.condition,source,v5Helpers());
      for(const effect of operation.effects||[])if(effect.action==='conditional'&&effect.condition.kind==='source-stat-comparison'&&effect.conditionTarget===undefined)stageCondition(MTG,context,effect.condition,source,v5Helpers());
      if(source.hasSub('Vehicle')&&JSON.stringify(operation.condition||{}).includes('"what":"creature"')){
        permanent(MTG,game,a,fixtureDefinition('Oracle mana crew',['Creature'],{power:'20',toughness:'20'}));
        const crew=game.activatableList(a).find(row=>row.card===source&&row.crew);assert.ok(crew);assert.equal(await game.activateAbility(a,crew),true);await resolveAll(game);assert.equal(source.is('Creature'),true);
      }
      if(operation.multiplier)stageCount(MTG,context,operation.multiplier,v5Helpers());
      const cost=operation.activationCost||{};
      if(cost.sacWhat)stageGenericTarget(MTG,context,{what:['creature','artifact','land','enchantment'].includes(cost.sacWhat)?cost.sacWhat:'creature',subtype:['creature','artifact','land','enchantment','token'].includes(cost.sacWhat)?undefined:cost.sacWhat,token:cost.sacWhat==='token',controller:'you'},'mana-sacrifice');
      if(cost.sacFilter)for(let i=0;i<(cost.sacN||1);i++)stageGenericTarget(MTG,context,{...cost.sacFilter,controller:'you'},'mana-sacrifice-'+i);
      if(cost.rmCounter)source.counters[cost.rmCounter.kind]=cost.rmCounter.n;
      if(operation.storageCounterMana)source.counters[operation.storageCounterMana.kind]=3;
      source.tapped = false;
      source.sick = false;
      game.recalc();
      const sources = game.manaSources(a).filter(descriptor => descriptor.card === source);
      const multiple=operation.multiplier?countValue(context,source,operation.multiplier):1;
      const wanted = JSON.stringify(operation.produce.map(option=>Object.fromEntries(Object.entries(option).map(([k,v])=>[k,k==='ANY'?v:v*multiple]))));
      if(MTG.oracleManaUsesStack(operation)){
        assert.equal(sources.length,0,name+': library movement disqualifies automatic mana activation');
        if(cost.mana)fund(a,10);
        const action=game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleManaUsesStack);
        assert.ok(action,name+': library mana uses an ordinary activated ability');
        const before=poolTotal(a),input=MTG.parseCost(cost.mana||'{0}'),inputTotal=input.generic+input.pips.length;
        const snapshot=genericProofSnapshot(context,[source]);
        assert.equal(await game.activateAbility(a,action),true,name+': activation pays its actual cost');
        assert.equal(poolTotal(a),before-inputTotal,name+': no output mana before stack resolution');
        assert.equal(game.stack.some(object=>object.srcCard===source&&object.kind==='ability'),true,name+': response window exists');
        await resolveAll(game);
        const chosen=operation.produce[0],expected=(chosen.ANY?(chosen.n||1):Object.values(chosen).reduce((sum,n)=>sum+n,0))*multiple;
        assert.equal(poolTotal(a),before-inputTotal+expected,name+': exact output mana on resolution');
        for(const effect of operation.afterEffects||[])await assertGenericEffectEvidence(MTG,context,entry,effect,source,[],b,snapshot,[],name+'/'+role+'/stack-mana-followup');
        return 1;
      }
      const descriptor = sources.find(candidate => (operation.storageCounterMana
        ? candidate.m.storageCounterMana?.kind===operation.storageCounterMana.kind&&candidate.m.storageCounterMana?.color===operation.storageCounterMana.color
        : JSON.stringify(candidate.produce) === wanted) && !!candidate.extraCost?.sacSelf===!!operation.activationCost?.sacSelf);
      assert.ok(descriptor, `${name}: compiled mana source is discoverable`);
      const chosen = operation.storageCounterMana ? descriptor.produce.find(option=>option[operation.storageCounterMana.color]===2) : descriptor.produce[0];
      assert.ok(chosen, `${name}: flexible mana exposes the staged counter amount`);
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
      if(cost.mana)fund(a,10);
      const before = poolTotal(a);
      if(cost.mana)assert.equal(await game.payMana(a,MTG.parseCost(cost.mana)),true,name+': mana conversion input paid');
      const input=cost.mana?MTG.parseCost(cost.mana):null;const inputTotal=input?input.generic+input.pips.length:0;
      const oldLife=a.life;const tailSnapshot=genericProofSnapshot(context,[source]);const tapEvents=[];const tap=game.tap;
      game.tap=function(card,...args){const result=tap.call(this,card,...args);if(result&&card.tapped)tapEvents.push(card);return result;};
      assert.equal(await game.activateManaSource(a, descriptor, chosen, null, []), true, `${name}: mana ability activates`);
      game.tap=tap;
      assertActivatedManaCost(operation, source, tailSnapshot, chosen, `${name}/${role}`);
      assert.equal(poolTotal(a), before + expected-inputTotal, `${name}: exact mana production`);
      if(!operation.activationCost||operation.activationCost.tap)assert.ok(source.tapped||tapEvents.includes(source), `${name}: tap cost paid before a sacrifice resets the card`);
      if(operation.activationCost?.sacSelf)assert.equal(source.zone,'graveyard',`${name}: mana sacrifice paid`);
      if(operation.activationCost?.life)assert.equal(a.life,oldLife-operation.activationCost.life,`${name}: mana life cost paid`);
      for(const effect of operation.afterEffects||[])await assertGenericEffectEvidence(MTG,context,entry,effect,source,[],b,tailSnapshot,[],name+'/'+role+'/mana-followup');
      if(operation.restriction){
        for(const color of Object.keys(a.pool))a.pool[color]=0;
        for(const entry of a.poolMeta||[])a.pool[entry.color]=(a.pool[entry.color]||0)+entry.n;
        const payment=MTG.parseCost('{1}'),bad={card:new MTG.CardInst(fixtureDefinition('Restricted mana forbidden',['Land']),a)};
        assert.equal(game.canPayMana(a,payment,bad),false,name+': produced mana keeps its spending restriction');
        let good;
        if(operation.restriction.spell)good=await stageGenericStackTarget(MTG,context,operation.restriction.spell,'mana-restriction');
        else good={card:source,isAbility:true};
        assert.equal(await game.payMana(a,payment,good),true,name+': restricted mana pays the permitted action');
      }
      return 1;
    }
    if (operation.kind === 'attachment-grant') {
      assert.ok(attachmentHost, `${name}: attachment host staged`);
      stageCondition(MTG,context,operation.condition,operation.conditionSubject==='affected'?attachmentHost:source,v5Helpers());
      if(operation.multiplier&&operation.multiplier.kind!=='host-colors')stageCount(MTG,context,operation.multiplier,v5Helpers());
      for(const kw of operation.removeKeywords||[])attachmentHost.def.kws=[...(attachmentHost.def.kws||[]),kw];
      if (source.attachedTo !== attachmentHost.iid) {
        assert.equal(await game.attach(source, attachmentHost), true, `${name}: attaches through Game.attach`);
      }
      game.recalc();
      const grantedPower = attachmentHost.power;
      const grantedToughness = attachmentHost.toughness;
      const multiplier=operation.multiplier?.kind==='host-colors'?attachmentHost.colors.length:operation.multiplier?countValue(context,source,operation.multiplier):1;
      for(const kw of operation.removeKeywords||[])assert.equal(attachmentHost.kw(kw),false,name+': removed keyword');
      const grants=source.def.oracleAttachmentGrants;
      assert.ok(grants.includes(operation),name+': exact compiled attachment layer exists');
      try{
        source.def.oracleAttachmentGrants=grants.filter(grant=>grant!==operation);game.recalc();
        assert.equal(grantedPower,attachmentHost.power+(operation.power||0)*multiplier,name+': exact active attachment power layer');
        assert.equal(grantedToughness,attachmentHost.toughness+(operation.toughness||0)*multiplier,name+': exact active attachment toughness layer');
      }finally{source.def.oracleAttachmentGrants=grants;}
      game.recalc();
      for (const keyword of operation.keywords || []) assert.equal(attachmentHost.kw(keyword), true, `${name}: attached grant ${keyword}`);
      if (operation.cantAttack) assert.equal(attachmentHost.cur.cantAttack, true, `${name}: attached cant-attack restriction`);
      if (operation.cantBlock) assert.equal(attachmentHost.cur.cantBlock, true, `${name}: attached cant-block restriction`);
      await combatRestrictionProof(MTG,context,attachmentHost,operation,v5Helpers(),name);
      if (operation.skipUntap) assert.equal(attachmentHost.cur.cantUntap, true, `${name}: attached skip-untap restriction`);
      return 1;
    }
    if (operation.kind === 'aura-target') {
      const actualHost=game.byIid(source.attachedTo);assert.ok(actualHost,`${name}: Aura resolves attached to its chosen legal host`);
      assert.ok(actualHost.attachments.includes(source.iid), `${name}: host tracks Aura attachment`);
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

  for(const op of entry.implementation||[])if(op.kind==='generic-static'&&op.defenderCanAttack&&op.condition)stageCondition(MTG,{game,a,b},op.condition,source,v5Helpers());
  if(source.cur.cantAttack||source.cur.cantBlock)for(const op of entry.implementation||[])if(op.kind==='generic-static'&&(op.cantAttack||op.cantBlock)&&op.condition?.kind==='not')stageCondition(MTG,{game,a,b},op.condition.condition,source,v5Helpers());
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
      const otherEvasion=source.kw('flying')?['flying']:[];
      const black = permanent(MTG, game, b, fixtureDefinition('Oracle Black Blocker', ['Creature'], { colorsOverride: ['B'], power: '2', toughness: '2', kws:otherEvasion }));
      const artifact = permanent(MTG, game, b, fixtureDefinition('Oracle Artifact Creature', ['Artifact', 'Creature'], { power: '2', toughness: '2', kws:otherEvasion }));
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
        kws: ['shadow',...(source.kw('flying')?['flying']:[])], power: '2', toughness: '2',
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
      const gain=game.gainLife,requests=[];game.gainLife=async function(player,n,origin,...args){const result=await gain.call(this,player,n,origin,...args);requests.push({player,n,origin,result});return result;};
      const dealt=await game.damagePlayer(source,b,1);
      assert.equal(requests.filter(row=>row.player===a&&row.origin===source&&row.n===dealt).length,1,source.name+': lifelink requests exactly the damage actually dealt');
      assert.equal(a.life,life+requests.reduce((sum,row)=>sum+(row.player===a?row.result:0),0),source.name+': replacement-adjusted life gain');
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
      assert.equal(game.canAttackAtAll(source), !!source.cur.defenderCanAttack, `${source.name}: defender and its explicit attack exception`);
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
  let candidates=genericEntries(MTG);
  // Draft reports use the identical executable proof before any production
  // batch/state is written. They never satisfy the report/runtime gate above.
  if(process.env.ORACLE_PROOF_DRAFT){
    const draft=JSON.parse(fs.readFileSync(process.env.ORACLE_PROOF_DRAFT,'utf8'));
    assert.equal(draft.status,'draft-not-imported');
    for(const batch of draft.batches){assert.ok(!MTG.ORACLE_BATCHES.some(old=>old.id===batch.id));MTG.registerOracleBatch(batch);}
    MTG.initData(MTG.RAW_DATA);
    candidates=draft.batches.flatMap(batch=>batch.cards.map(entry=>({batch,entry})));
    t.diagnostic('DRAFT_ONLY: candidate verification does not import cards or certify production coverage.');
  }
  const proofFilter = String(process.env.ORACLE_PROOF_FILTER || '').trim().toLowerCase();
  const rows = candidates.filter(({ batch, entry }) =>
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
    if(process.env.ORACLE_PROOF_PROGRESS)process.stderr.write(entry.raw.name+'\n');
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
            if(process.env.ORACLE_PROOF_PROGRESS)process.stderr.write('  '+role+'/'+operation.kind+'\n');
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

test('original ten Oracle Phyrexian-cost cards require two life per unpaid pip', async () => {
  const MTG = loadEngine();
  const entries = genericEntries(MTG).filter(row=>row.batch.sequence<=66).map(row => row.entry)
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

test('new v6 commanders pay for both command-zone casts and return with commander tax',async t=>{
  const MTG=loadEngine(),rows=MTG.ORACLE_BATCHES.filter(batch=>batch.sequence>=67&&batch.sequence<=96).flatMap(batch=>batch.cards).filter(entry=>entry.raw.super.includes('Legendary')&&entry.raw.types.includes('Creature'));
  assert.ok(rows.length>0);let casts=0;
  for(const entry of rows)for(const role of ['human','ai']){
    const context=gameFor(MTG,[decision({chooseOption:(g,q)=>q.options.find(o=>o.key==='cz')?.key||q.options[0].key}),decision()],{ai:role==='ai'}),{game,a,b}=context;
    fund(a,100);fillLibrary(MTG,a,100);fillLibrary(MTG,b,100);stageCardCosts(MTG,context,entry);
    for(const operation of entry.implementation){
      if(operation.kind==='characteristic-pt'&&operation.count.kind==='count')stageCount(MTG,context,operation.count,v5Helpers());
      for(const [i,target]of(operation.targets||[]).entries())stageGenericTarget(MTG,context,target,i,operation.effects?.find(effect=>effect.target===i));
    }
    const card=zoneCard(MTG,a,entry.raw.name,'command');card.commander=true;card.cmdCasts=0;a.commanders.push(card);
    const base=game.spellCost(a,card,{});
    for(let attempt=1;attempt<=2;attempt++){
      fund(a,100);assert.equal(game.spellCost(a,card,{}).generic,base.generic+(attempt-1)*2,entry.raw.name+': commander tax');
      if(base.x){for(const color of Object.keys(a.pool))a.pool[color]=0;a.pool.C=base.generic+(attempt-1)*2+3*base.x;for(const pip of base.pips)a.pool[pip.find(s=>['W','U','B','R','G','C'].includes(s))]++;}
      assert.equal(await game.castSpell(a,card,{from:'command'}),true,entry.raw.name+'/'+role+': paid command cast');assert.equal(card.cmdCasts,attempt);assert.equal(card.zone,'stack');await resolveAll(game);
      if(card.zone!=='command'){await game.exileCard(card);await resolveAll(game);}assert.equal(card.zone,'command',entry.raw.name+'/'+role+': command return');casts++;
    }
  }
  t.diagnostic(`V6_COMMANDERS candidates=${rows.length} roles=2 paidCasts=${casts}`);
});

test('new v6 Phyrexian spells enforce the life boundary and colored-mana alternative',async t=>{
  const MTG=loadEngine(),rows=MTG.ORACLE_BATCHES.filter(batch=>batch.sequence>=67&&batch.sequence<=96).flatMap(batch=>batch.cards).filter(entry=>/\{[WUBRG]\/P\}/.test(entry.raw.cost||''));
  let attempts=0;
  for(const entry of rows)for(const role of ['human','ai'])for(const mode of ['insufficient','life','mana']){
    const context=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a,b}=context;fillLibrary(MTG,a,30);fillLibrary(MTG,b,30);
    for(const op of entry.implementation){
      for(const [i,target]of(op.targets||[]).entries())await stageGenericTarget(MTG,context,target,i,op.effects?.find(effect=>effect.target===i));
      if(op.kind==='spell-damage'||op.kind==='spell-pump')stageGenericTarget(MTG,context,{what:(op.what||'creature').replace(/^target /,'')},0,{action:op.kind.slice(6)});
      if(op.kind==='spell-v4')for(const [i,target]of op.targets.entries())await stageSpellV4Target(MTG,context,{name:entry.raw.name},target,op.effects.find(effect=>effect.targetIds.includes(target.id)),spellV4TargetVariants(target)[0],i);
    }
    const card=zoneCard(MTG,a,entry.raw.name,'hand'),cost=MTG.parseCost(entry.raw.cost),phy=cost.pips.filter(pip=>pip.includes('PHY')).length;
    a.pool.C=cost.generic;for(const pip of cost.pips)if(mode==='mana'||!pip.includes('PHY'))a.pool[pip.find(symbol=>['W','U','B','R','G','C'].includes(symbol))]++;
    a.life=mode==='insufficient'?phy*2-1:phy*2+5;const life=a.life;
    assert.equal(await game.castSpell(a,card,{from:'hand',xVal:0}),mode!=='insufficient',entry.raw.name+'/'+role+'/'+mode);
    assert.equal(a.life,mode==='life'?5:life,entry.raw.name+': exact Phyrexian payment');
    if(mode==='insufficient')assert.equal(card.zone,'hand');else await resolveAll(game);attempts++;
  }
  t.diagnostic(`V6_PHYREXIAN cards=${rows.length} roles=2 paymentAttempts=${attempts}`);
});
