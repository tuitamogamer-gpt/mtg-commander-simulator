import {rippleProof}from'./helpers/oracle-ripple-proof.mjs';
import {spliceProofV11} from './helpers/oracle-v11-splice-proof.mjs';
import {cipherProofV13} from './helpers/oracle-v13-cipher-proof.mjs';
import {fundSnow} from './helpers/oracle-snow-proof.mjs';
import {isNamedCountOperation,namedCountProof} from './helpers/oracle-named-count-proof.mjs';
import {soulbondProof}from'./helpers/oracle-soulbond-proof.mjs';
import {installNameSearchProof,assertNameSearch} from './helpers/oracle-name-search-proof.mjs';
import {creatureUpgradeProof,activateUpgrade}from'./helpers/oracle-creature-upgrade-proof.mjs';
import {skipEffectProofV10,phaseEntryV10} from './helpers/oracle-v10-turn-proof.mjs';
import {prototypeProofV10} from './helpers/oracle-v10-prototype-proof.mjs';
import {bargainProofV10} from './helpers/oracle-v10-bargain-proof.mjs';
import {recordSourceDuration,finishSourceDurations} from './helpers/oracle-source-duration-proof.mjs';
import {declareExertProof}from'./helpers/oracle-exert-proof.mjs';
import {assertRoleToken}from'./helpers/oracle-v8-predefined-token-proof.mjs';
import {drawReplacementProof}from'./helpers/oracle-draw-replacement-proof.mjs';
import {entryCounterProof}from'./helpers/oracle-v8-entry-counter-proof.mjs';
import {installNameGroupsProof,assertNameGroup} from './helpers/oracle-name-groups-proof.mjs';
import {printedTokenName} from './helpers/oracle-token-name.mjs';
import {installTokenFormsProof,assertTemptingOffer} from './helpers/oracle-token-forms-proof.mjs';
import test from 'node:test';
import {untapLimitProofV17,playerAuraProofV17,visibilityProofV17,handVisibilityProofV17,exileCastProofV17} from './helpers/oracle-v17-proof.mjs';
import {ruleProofV18,abilityCostProofV18} from './helpers/oracle-v18-proof.mjs';
import {keywordCostProofV19,entryProhibitionProofV19,damageRedirectionProofV19,entrySuppressionProofV19,spellKeywordProofV19,blockingRuleProofV19} from './helpers/oracle-v19-proof.mjs';
import assert from 'node:assert/strict';
import {manaBonusProofV10,damagePreventionRuleProofV10} from './helpers/oracle-v10-mana-proof.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';
import { castThroughSuspend } from './helpers/oracle-suspend-cast-proof.mjs';
import { assertGameStateInvariants, assertRecalculationStable } from './helpers/game-state-invariants.mjs';
import {stageV8Effect,assertV8Effect,finishV8EffectProof} from './helpers/oracle-v8-effect-proof.mjs';
import { replacementProof, untapProof, commanderPairingProof, bestowProof, typeStaticProof } from './helpers/oracle-v8-permanent-proof.mjs';
import {combatStaticProof}from'./helpers/oracle-v8-combat-proof.mjs';
import {graveyardStaticProof}from'./helpers/oracle-v8-graveyard-static-proof.mjs';
import {layeredStaticProof}from'./helpers/oracle-v8-layered-static-proof.mjs';
import {landTypesProof,attackKeywordsProof}from'./helpers/oracle-land-types-proof.mjs';
import {stateTriggerProof}from'./helpers/oracle-state-trigger-proof.mjs';
import {zoneReplacementProof}from'./helpers/oracle-v8-zone-replacement-proof.mjs';
import {phasingKeywordProof}from'./helpers/oracle-phasing-proof.mjs';
import {abilityLossStaticProof}from'./helpers/oracle-v8-ability-loss-proof.mjs';
import { auraControlProof } from './helpers/oracle-v8-control-proof.mjs';
import { fireV8Event } from './helpers/oracle-v8-event-proof.mjs';
import {fireDamageEvent} from './helpers/oracle-v8-damage-event-proof.mjs';
import { faceProofEntry, withFaceProof, proofDefinition, installFaceProof, selectFixtureFace, assertFaceZoneCard } from './helpers/oracle-v8-face-proof.mjs';
import { installPaymentProof, stagePaymentEffect, preparePaymentSource, assertPaymentEffect } from './helpers/oracle-v8-payment-proof.mjs';
import { installCopyLinkedProof, stageCopyLinkedEffect, prepareCopyLinkedSource, assertCopyLinkedEffect, copyEntryProof, finishCopyLinkedProof } from './helpers/oracle-v8-copy-linked-proof.mjs';
import { stageActivatedCost, assertActivatedCost, assertActivatedManaCost } from './helpers/oracle-v8-activated-cost-proof.mjs';
import { mayhemProof } from './helpers/oracle-v8-mayhem-proof.mjs';
import { stageOracleCastingCosts, assertOracleCastingCostRecord } from './helpers/oracle-v8-casting-cost-proof.mjs';
import { flashPermissionProof, assertTemporaryFlash } from './helpers/oracle-v8-timing-proof.mjs';
import { stageActivationRuleCost, captureActivationRuleCost, assertActivationRuleCost } from './helpers/oracle-v8-activation-rule-proof.mjs';
import { stageOracleCounterCost, assertOracleCounterCost } from './helpers/oracle-v8-counter-cost-proof.mjs';
import { stageMultizoneSearch, assertMultizoneSearch } from './helpers/oracle-v8-multizone-proof.mjs';
import { stagePlayPermission, assertPlayPermission } from './helpers/oracle-v8-play-permission-proof.mjs';
import {stageEnergy,assertEnergy,stageEnergyCosts,assertEnergyCost} from './helpers/oracle-v8-energy-proof.mjs';
import {landwalkOverrideProof} from './helpers/oracle-v15-landwalk-proof.mjs';
import {handSizeProof} from './helpers/oracle-v8-hand-size-proof.mjs';
import { fireCastEvent } from './helpers/oracle-v8-cast-event-proof.mjs';
import { stageCardResults, assertCardResults } from './helpers/oracle-v8-result-proof.mjs';
import {bindChosenType,chosenTypeEntryProof} from './helpers/oracle-v16-proof.mjs';
import { stageRevealed, assertRevealed } from './helpers/oracle-v8-revealed-proof.mjs';
import { installStackCopyProof, stageStackCopyTarget, assertStackCopyEffect, prepareStackCopySource, finishStackCopyProof, fireStackCopyEvent } from './helpers/oracle-v8-stack-copy-proof.mjs';
import { castingRulesProof, stageEntryCastingRules } from './helpers/oracle-v8-casting-rule-proof.mjs';
import { spellLimitProof } from './helpers/oracle-v8-casting-limits-proof.mjs';
import { chosenColorProof, enterChosenColorSource } from './helpers/oracle-chosen-color-proof.mjs';
import { assertDelayedObjects } from './helpers/oracle-delayed-objects-proof.mjs';
import { stageCondition, stageFalseCondition, stageCount, countValue, matches as v5Matches, matchesTarget, characteristicProof, combatRestrictionProof, grantedMechanicProof, staticProof as v5StaticProof, mechanicKinds, mechanicProof as v5MechanicProof, proveSaddleCrewPowerV10 } from './helpers/oracle-v5-proof.mjs';

const v5Helpers=()=>({gameFor,decision,fund,constrainSquadMana,fillLibrary,zoneCard,permanent,fixtureDefinition,resolveAll,stageGenericTarget,auraProofTarget,stageGenericStackTarget,stageSpellV4Target,spellV4TargetVariants,semanticSubtypeFixture});

const v8Helpers=()=>({...v5Helpers(),stageCardCosts,fireGenericEvent,assertControllerRole,cardState,genericProofSnapshot,installEffectEvidence,grantedEffectProof,grantedManaProof,assertGenericEffectEvidence});
const flattenProofEffects=effects=>(effects||[]).flatMap(effect=>[effect,...flattenProofEffects(effect.effects),...flattenProofEffects(effect.elseEffects)]);

function prepareGenericCountSource(context,operation,source){
  if(operation.cost?.untapSelf&&source.zone==='battlefield')source.tapped=true;
  if(context.conditionalSourceTapped!==undefined)source.tapped=context.conditionalSourceTapped;
  for(const prepare of context.prepareSourceConditions||[])prepare(source);
  if(flattenProofEffects(operation.effects).some(effect=>effect.action==='draw'&&JSON.stringify(effect.n).includes('max-stat'))){
    for(const card of context.game.bf())if(!card.def.oracleImplementation){for(const stat of ['power','toughness'])if(Number(card.def[stat])>10)card.def[stat]='10';}
    context.game.recalc();
  }
  if(source.zone!=='battlefield')return;
  for(const target of context.blockingSourceTargetsV9||[]){target.blocking=source.iid;source.attacking=target.ctrl;source.wasBlocked=true;source.blockedBy=[target];}
  for(const target of context.blockedBySourceTargetsV19||[]){source.blocking=target.iid;target.attacking=source.ctrl;target.wasBlocked=true;target.blockedBy=[source];}
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    if(node.action==='remove-counters-v8'&&node.target==='self')stageCounterEffectCard(context,source,node);
    if(node.action==='copy-counters-v8'||node.action==='move-counters-v8'&&node.sourceTarget==='self')stageCounterTransferCard(context,source,node);
    if(node.kind==='source-counters'){
      const missing=Math.max(0,3-(source.counters[node.counter]||0));
      if(missing)context.game.addCounters(source,node.counter,missing,false,source.ctrl);
    }
    if(node.kind==='v8-permanent-count'&&node.test==='source-counter-total'){
      const missing=Math.max(0,3-Object.values(source.counters).reduce((sum,n)=>sum+n,0));
      if(missing)context.game.addCounters(source,'charge',missing,false,source.ctrl);
    }
    for(const [key,child]of Object.entries(node))if(!['condition','activationCondition'].includes(key)&&child&&typeof child==='object')Array.isArray(child)?child.forEach(visit):visit(child);
  };
  visit(operation.effects);
  visit(operation.targets);
  for(const prepare of context.prepareThresholdV10||[])prepare(source);
}

function stageCounterThreshold(context,operation,source){
  if(source.zone!=='battlefield')return;
  for(const [index,effect] of (operation.effects||[]).entries()){
    const condition=effect.action==='conditional'&&effect.conditionTarget===undefined&&effect.condition;
    if(condition?.kind!=='count-comparison'||condition.count.kind!=='source-counters'||effect.elseEffects)continue;
    const counter=condition.count.counter,prior=operation.effects.slice(0,index).filter(row=>row.action==='counter'&&row.target==='self'&&row.counter===counter&&typeof row.n==='number').reduce((sum,row)=>sum+row.n,0);
    if(!prior)continue;
    const n=Math.max(0,(condition.min??condition.max)-prior);
    if(operation.condition?.kind==='count-comparison'&&operation.condition.count.kind==='source-counters'&&operation.condition.count.counter===counter){assert.ok((operation.condition.min===undefined||n>=operation.condition.min)&&(operation.condition.max===undefined||n<=operation.condition.max),'the starting counter count satisfies the intervening condition');}
    source.counters[counter]=n;context.game.recalc();
  }
}

function stageCounterTransferCard(context,card,effect){
  if(!card||card.zone!=='battlefield')return;
  const kind=effect.counter||'charge';card.counters[kind]=Math.max(card.counters[kind]||0,3);
  if(!effect.counter)card.counters.stun=2;
  context.game.recalc();
}

function stageCounterEffectCard(context,card,effect){
  if(!card||card.zone!=='battlefield')return;
  const counter=effect.counter||'charge',n=effect.n==='all'?3:effect.n+1;
  if(card.name.startsWith('Oracle ')&&counter==='-1/-1')card.def.toughness='20';
  card.counters[counter]=Math.max(card.counters[counter]||0,n);
  if(effect.n==='all'&&!effect.counter)card.counters.stun=2;
  context.game.recalc();
}

function installEffectEvidence(context){
  if(context.moveEvidence)return;
  const {game}=context;
  context.tokenCreationEvidence=[];const originalMakeTokens=game.makeTokens;
  game.makeTokens=async function(spec,player,options,...args){
    const row={spec,player,options};context.tokenCreationEvidence.push(row);
    const result=await originalMakeTokens.call(this,spec,player,options,...args);
    row.cards=Array.from(result);return result;
  };
  context.untapEvidence=[];const originalUntap=game.untap;
  game.untap=function(card,...args){context.untapEvidence.push(card);return originalUntap.call(this,card,...args);};
  context.discoverEvidence=[];const originalDiscover=game.oracleDiscoverV9;
  game.oracleDiscoverV9=async function(ctx,n){
    const row={source:ctx.src,player:ctx.you,n,library:ctx.you.library.slice(),moveIndex:context.moveEvidence.length};
    context.discoverEvidence.push(row);
    return originalDiscover.call(this,ctx,n);
  };
  context.ventureEvidence=[];const originalVenture=game.venture;
  game.venture=async function(player,source,undercity=false){
    const row={player,source,undercity,before:player.afcDungeon?{...player.afcDungeon}:null};
    context.ventureEvidence.push(row);
    const result=await originalVenture.call(this,player,source,undercity);
    row.after=player.afcDungeon?{...player.afcDungeon}:null;
    row.rooms=this.pendingTriggers.filter(trigger=>trigger.data?.afcDungeonPlayer===player.idx).length;
    return result;
  };
  context.clashEvidence=[];const originalClash=game.clash;
  if(originalClash)game.clash=async function(player,...args){const row={player,before:genericProofSnapshot(context,[])};context.clashEvidence.push(row);row.result=await originalClash.call(this,player,...args);return row.result;};
  context.coinEvidence=[];const originalCoin=game.flipCoin;
  if(originalCoin)game.flipCoin=async function(player,...args){const row={player,before:genericProofSnapshot(context,[])};context.coinEvidence.push(row);row.result=await originalCoin.call(this,player,...args);return row.result;};
  context.exploreEvidence=[];context.dredgeEvidence=[];context.exploitEvidence=[];const originalEmit=game.emit;game.emit=async function(name,data,...args){if(name==='explored')context.exploreEvidence.push({...data});if(name==='dredged')context.dredgeEvidence.push({...data});if(name==='exploited')context.exploitEvidence.push({...data});return originalEmit.call(this,name,data,...args);};
  context.counterChangeEvidence=[];context.usedCounterChanges=new Set();
  context.animationEvidence=[];context.usedAnimationEvidence=new Set();const addAnimation=game.addOracleAnimation;
  game.addOracleAnimation=function(card,effect){context.animationEvidence.push({card,effect,before:genericProofSnapshot(context,[card])});return addAnimation.call(this,card,effect);};
  for(const [method,action]of [['addCounters','counter'],['removeCounters','remove-counter']]){
    const original=game[method];game[method]=function(card,kind,n,...args){
      const row={card,kind,n,action,zoneVersion:card.zoneVersion,before:card.counters[kind]||0,snapshot:genericProofSnapshot(context,[card])};
      const result=original.call(this,card,kind,n,...args);row.after=card.counters[kind]||0;
      context.counterChangeEvidence.push(row);return result;
    };
  }
  context.revealEvidence=[];const originalReveal=game.revealToHuman;
  game.revealToHuman=async function(payload,...args){context.revealEvidence.push({cards:(payload?.cards||[]).slice(),zones:(payload?.cards||[]).map(card=>card.zone),ctrl:payload?.ctrl,kind:payload?.kind});return originalReveal.call(this,payload,...args);};
  context.millEvidence=[];const originalMill=game.mill;game.mill=async function(player,n,...args){const top=player.library.slice(-n),result=await originalMill.call(this,player,n,...args);context.millEvidence.push({player,n,cards:top.filter(card=>card.zone==='graveyard')});return result;};
  context.damageEvidence=[];const originalDamage=game.damageAny;game.damageAny=async function(source,target,n,...args){const row={target,source,n,before:genericProofSnapshot(context,[])};context.damageEvidence.push(row);row.actual=await originalDamage.call(this,source,target,n,...args);row.after=genericProofSnapshot(context,[]);return row.actual;};
  context.batchEvidence=[];const originalBatch=game.damageBatch;game.damageBatch=async function(hits,...args){const row={hits:hits.slice(),before:genericProofSnapshot(context,[])};context.batchEvidence.push(row);row.actual=await originalBatch.call(this,hits,...args);row.after=genericProofSnapshot(context,[]);return row.actual;};
  context.moveEvidence=[];const originalMove=game.move;game.move=async function(card,to,...args){const row={card,from:card.zone,to,before:cardState(card),priorLibraryTop:card.owner.library.at(-1),priorLibrarySize:card.owner.library.length};const result=await originalMove.call(this,card,to,...args);row.after=cardState(card);row.top=card.owner.library.at(-1);row.bottom=card.owner.library[0];context.moveEvidence.push(row);return result;};
  context.sacrificeEvidence=[];const sacrificedStats=card=>({power:Number(card?.power)||0,toughness:Number(card?.toughness)||0,mv:Number(card?.mv)||0});
  const originalSacrifice=game.sacrifice;game.sacrifice=async function(player,card,...args){const row={player,card,from:card?.zone,...sacrificedStats(card)};const result=await originalSacrifice.call(this,player,card,...args);row.to=card?.zone;context.sacrificeEvidence.push(row);return result;};
  const originalSacrificeMany=game.sacrificeMany;game.sacrificeMany=async function(player,cards,...args){const rows=cards.map(card=>({player,card,from:card.zone,...sacrificedStats(card)})),result=await originalSacrificeMany.call(this,player,cards,...args);for(const row of rows){row.to=row.card.zone;context.sacrificeEvidence.push(row);}return result;};
  context.destroyEvidence=[];const originalDestroy=game.destroyMany;game.destroyMany=async function(cards,...args){const row={cards:cards.slice(),before:genericProofSnapshot(context,cards)};row.actual=await originalDestroy.call(this,cards,...args);context.destroyEvidence.push(row);return row.actual;};
  context.lifeEvidence=[];const originalLoseLife=game.loseLife;game.loseLife=async function(player,n,...args){const row={player,n,before:player.life,stateBefore:genericProofSnapshot(context,[])};row.actual=await originalLoseLife.call(this,player,n,...args);row.after=player.life;context.lifeEvidence.push(row);return row.actual;};
  context.gainLifeEvidence=[];const originalGainLife=game.gainLife;game.gainLife=async function(player,n,source,...args){const row={player,n,source,before:player.life};const result=await originalGainLife.call(this,player,n,source,...args);row.after=player.life;context.gainLifeEvidence.push(row);return result;};
  context.drawEvidence=[];const originalDraw=game.draw;game.draw=async function(player,n,source,...args){const row={player,n,source,library:player.library.length},beforeDraw=player.turnState.drewThisTurn||0;const result=await originalDraw.call(this,player,n,source,...args);row.drawn=(player.turnState.drewThisTurn||0)-beforeDraw;context.drawEvidence.push(row);return result;};
}

function stageCardCosts(MTG,ctx,entry){
  stageEnergyCosts(MTG,ctx,entry,v8Helpers());
  stageEntryCastingRules(MTG,ctx,entry,v5Helpers());
  // A printed "unless <mana> was spent to cast it" clause kills the permanent
  // in every other proof unless that mana is actually paid, so the cast is
  // funded for it up front. Staging the clause itself overrides this again.
  if(!ctx.paymentCondition){
    const find=node=>{
      if(!node||typeof node!=='object')return null;
      if(node.kind==='mana-spent'&&Array.isArray(node.colors))return node;
      for(const value of Object.values(node)){
        const found=Array.isArray(value)?value.reduce((hit,item)=>hit||find(item),null):find(value);
        if(found)return found;
      }
      return null;
    };
    const spent=find(entry.implementation||[]);
    if(spent)ctx.paymentCondition=spent;
  }
  stageOracleCastingCosts(MTG,ctx,entry,{fixtureDefinition,permanent,zoneCard});
  for(const op of entry.implementation||[])if(['mechanic-devour','mechanic-devour-v9'].includes(op.kind)){
    const type=(op.what||'creature').replace(/^./,c=>c.toUpperCase());
    for(let i=0;i<2;i++)permanent(MTG,ctx.game,ctx.a,fixtureDefinition('Oracle Devour Fodder '+i,[type],{power:'0',toughness:'1',cost:'{0}'}));
  }
  for(const op of entry.implementation||[])if(op.kind==='generic-trigger'&&op.event==='etb')for(const effect of op.effects||[])if(effect.action==='unless-cost'&&effect.who==='you'&&effect.payment.zone){
    const cost=effect.payment;
    for(let i=0;i<cost.n*3;i++){const card=stageGenericTarget(MTG,ctx,{...cost.filter,controller:'you',zone:cost.zone==='hand'?'graveyard':'battlefield'},'entry-payment-'+i);if(cost.zone==='hand'){card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone='hand';card.owner.hand.push(card);}}
  }
}

async function stageGenericStackTarget(MTG,ctx,target,index,from=target.castFrom||'hand'){
  if(target.alternatives?.every(part=>part.zone==='stack'))return stageGenericStackTarget(MTG,ctx,{...target,...target.alternatives[0],alternatives:undefined},index,from);
  if(target.singleTargetV10){
    const {game,a,b}=ctx,player=target.controller==='you'?a:b;
    const original=permanent(MTG,game,a,fixtureDefinition('Original redirect target',['Creature'],{power:'2',toughness:'20'}));
    const replacement=permanent(MTG,game,a,fixtureDefinition('New redirect target',['Creature'],{power:'2',toughness:'20'}));
    const ability=target.what==='stack-ability';
    const spell=ability?permanent(MTG,game,player,fixtureDefinition('Single target ability witness',['Artifact'],{abilities:[{label:'Redirect witness',cost:{mana:'{0}'},targets:[MTG.T.creature()],run:async c=>c.g.damageAny(c.src,c.targets[0],1)}]})):new MTG.CardInst(fixtureDefinition('Single target spell witness',['Instant'],{cost:'{0}',targets:[MTG.T.creature()],resolve:async c=>c.g.damageAny(c.src,c.targets[0],1)}),player);
    if(!ability){spell.zone='hand';player.hand.push(spell);}fund(player,100);
    const decide=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(original)?[original]:decide(g,q);
    try{assert.equal(ability?await game.activateAbility(player,game.activatableList(player).find(row=>row.card===spell)):await game.castSpell(player,spell,{from:'hand'}),true);}finally{player.controller.decide=decide;}
    const object=game.stack.find(row=>(row.card||row.srcCard)===spell);(ctx.retargetFixturesV10||=new Map()).set(object,{original,replacement,damage:original.damage});return object;
  }
  const copyTarget=await stageStackCopyTarget(MTG,ctx,target,index,v8Helpers());if(copyTarget)return copyTarget;
  if(target.threshold==='X')return stageGenericStackTarget(MTG,ctx,{...target,threshold:3},index,from);
  if(typeof target.threshold==='object'){
    stageCount(MTG,ctx,target.threshold,v5Helpers());
    return stageGenericStackTarget(MTG,ctx,{...target,threshold:Math.max(0,countValue(ctx,null,target.threshold))},index,from);
  }
  const {game,b}=ctx,q=target.spellQuality||'any',colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
  if(target.controllerConditionV10)stageCondition(MTG,{...ctx,a:b},target.controllerConditionV10,null,v5Helpers());
  const f=target.spellFilter?.alternatives?.[0]||target.spellFilter;
  const rawType=f?.what==='permanent'?'creature':f?.what?.split(' or ')[0]||q;
  const type=['creature','artifact','enchantment','planeswalker','battle','instant','sorcery'].includes(rawType)?rawType[0].toUpperCase()+rawType.slice(1):'Instant';
  const card=new MTG.CardInst(fixtureDefinition('V6 stack target '+index,[type],{cost:target.stat==='mv'?'{'+target.threshold+'}':ctx.needsStackManaValue?'{3}':'{0}',subtypes:(f?.subtype||target.subtype)?[f?.subtype||target.subtype]:[],super:target.legendary||f?.legendary?['Legendary']:[],kws:ctx.preserveCastTurn?['flash']:[],colorsOverride:(target.colorsAny||f?.colorsAny)?.slice(0,1)||(colors[f?.color||q]?[colors[f?.color||q]]:q==='multicolored'||f?.color==='multicolored'?['G','W']:[]),power:'2',toughness:'20'}),b);
  if(target.targetsObject){
    const ref=target.targetsObject,subject=ref.what==='player'||ref.what==='any'?ctx.a:stageGenericTarget(MTG,ctx,ref,'spell-subject-'+index);
    card.def.targets=[{what:subject instanceof MTG.Player?'player':'permanent',zone:subject instanceof MTG.Player?'player':'battlefield',min:1,count:1,filter:(_g,candidate)=>candidate===subject}];
  }
  if(f?.withKeyword)card.def.kws=[f.withKeyword];
  if(target.targetsSourceV10){assert.ok(ctx.earlyOracleSourceV10);card.def.targets=[{what:'creature',min:1,count:1,filter:(g,c)=>c===ctx.earlyOracleSourceV10}];}
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
    .map(entry => ({ batch, entry: MTG.normalizeOracleTimeLordEntry(entry) })));
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
      trace.push({ query, result, keywordBefore:query.aiHint?.kind==='oracleKeyword'?new Map(query.aiHint.cards.map(card=>[card,cardState(card)])):undefined });
      return result;
    },
  };
}

let activeProofGames = null;

async function checkedProof(run, label, evidence) {
  activeProofGames = [];
  try {
    const result = await run();
    for (const game of activeProofGames) {
      assertGameStateInvariants(game, label);
      assertRecalculationStable(game, label);
      evidence.checkedGames += 1;
    }
    return result;
  } finally {
    activeProofGames = null;
  }
}

function gameFor(MTG, controllers = [decision(), decision()], options = {}) {
  const game = new MTG.Game({ seed: 1007, paced: false, maxTurns: 5 });
  activeProofGames?.push(game);
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
      aiDecisions.push({ query, result, keywordBefore:query.aiHint?.kind==='oracleKeyword'?new Map(query.aiHint.cards.map(card=>[card,cardState(card)])):undefined });
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
function fundPaidColorEntry(MTG,player,entry,x=3){
  const cost=MTG.parseCost(entry.raw.cost);for(const color of Object.keys(player.pool))player.pool[color]=0;
  for(const pip of cost.pips)player.pool[pip.find(color=>'WUBRGC'.includes(color))]++;
  for(let n=0;n<cost.generic+(cost.x||0)*x;n++){
    const color=['W','U','B','R','G'].sort((a,b)=>player.pool[a]-player.pool[b])[0];player.pool[color]++;
  }
}
function prepareConditionPayment(MTG,context,entry){
  if(context.optionalCostProofV14){
    const marker=entry.implementation.find(operation=>operation.kind==='mechanic-optional-cost-v14');assert.ok(marker,entry.raw.name+': printed additional cost binds the condition');
    const def=fixtureDefinition('Oracle Optional Cost Donor',['Creature'],{cost:'{'+(marker.payment.n||2)+'}',power:marker.payment.n||2,toughness:10,subtypes:marker.payment.object?.qualifier?.subtypes||[]});
    if(marker.payment.kind==='evidence')zoneCard(MTG,context.a,def,'graveyard');else permanent(MTG,context.game,context.a,def);
    return {oracleOptionalCostV14:true};
  }
  if(context.bargainProofV10)return {oracleBargainV10:true};
  if(context.kickerProof===false){
    // Make the unpaid branch a legal real choice for both controllers. Exact
    // printed mana and tapped mana sources cannot also pay a positive kicker.
    const cost=MTG.parseCost(entry.raw.cost);for(const color of Object.keys(context.a.pool))context.a.pool[color]=0;
    context.a.pool.C=cost.generic+(cost.x||0)*3;
    for(const pip of cost.pips)context.a.pool[pip.find(c=>'WUBRGC'.includes(c))]++;
    for(const card of context.game.bf())if(card.ctrl===context.a&&card.is('Land'))card.tapped=true;
    const payment=(entry.implementation||[]).find(op=>op.kind==='mechanic-keyword-payment-v8'&&op.keyword==='kicker');
    if(payment){
      assert.equal(payment.costs.length,1);const clause=payment.costs[0];
      assert.equal(clause.kind,'sacrifice','unsupported unpaid kicker fixture');
      for(const card of context.game.bf().slice())if(card.ctrl===context.a&&clause.object.types.some(type=>card.is(type))){
        context.game.battlefield.splice(context.game.battlefield.indexOf(card),1);card.zone='hand';card.owner.hand.push(card);
      }
    }
  }
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
    attachedTo: card.attachedTo,
    zoneVersion: card.zoneVersion,
    oracleFace: card.oracleFace || null,
    oracleTransformCount: card.oracleTransformCount || 0,
    ctrl: card.ctrl,
    attacking: card.attacking, blocking: card.blocking,
    types: (card.zone==='battlefield'?card.cur?.types||[]:card.def?.types||[]).slice(),
    subtypes: (card.zone==='battlefield'?card.cur?.subtypes||[]:card.def?.subtypes||[]).slice(),
    colors: (card.colors||[]).slice(),
    keywords: card.zone==='battlefield'?[...(card.cur?.kw||[])]:[...(card.def?.kws||[])],
    tapped: !!card.tapped,
    power: Number(card.power) || 0,
    toughness: Number(card.toughness) || 0,
    basePower: card.cur?.basePower ?? Number(card.power) ?? 0,
    baseToughness: card.cur?.baseToughness ?? Number(card.toughness) ?? 0,
    mv: Number(card.mv)||0,
    damage: Number(card.damage)||0,
    devouredV9: card.meta?.oracleDevoured||0,
    sourceTurnsV9:{_lastDamageVisual:card.meta?._lastDamageVisual?.turn,_attackedTurn:card.meta?._attackedTurn,_enteredTurn:card.meta?._enteredTurn},
    counters: Object.assign({}, card.counters),
    toxic: Number(card.toxic??((card.cur?.abilitiesDisabled?0:card.def?.toxic||0)+(card.cur?.oracleNumericKeywordsV10||[]).filter(row=>row.kind==='toxic').reduce((sum,row)=>sum+row.n,0))),
    regenShield: card.regenShield||0,
  };
}

function playerState(player) {
  return {
    emblems:player.emblems.slice(),
    noMaxHandForever:!!player.noMaxHandForever,
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
  } else if (!['attacking', 'tapped', 'untapped', 'enchanted', 'equipped'].includes(lower)) extras.subtypes = [subtype];
  return fixtureDefinition(`Oracle Static ${subtype}`, ['Creature'], extras);
}

function auraProofTarget(operation,controller='you'){
  return operation?.targetV9?{...operation.targetV9,controller:operation.targetV9.controller==='any'?controller:operation.targetV9.controller}:{what:(operation?.what||'creature').replace(/ you control$/,''),zone:'battlefield',controller};
}
function stageGenericTarget(MTG, context, target, index, effect = null) {
  if(target.sourceDamagedPlayerV18){(context.prepareThresholdV10||=[]).push(source=>source.meta.dealtDamageV9={turn:context.game.turnNo,players:[context.b.idx]});return context.b;}
  if(JSON.stringify(target).includes('"kind":"chosen-subtype-v16"'))return stageGenericTarget(MTG,context,bindChosenType(target,context.chosenSubtypeV16||'Elf'),index,effect);
  if(target.threshold?.kind==='paid-colors')return stageGenericTarget(MTG,context,{...target,threshold:0},index,effect);
  if(typeof target.threshold==='object'&&/"(?:explicit-source-stat|source-stat|source-counters|sacrificed-stat)"/.test(JSON.stringify(target.threshold))){
    const result=stageGenericTarget(MTG,context,{...target,threshold:2},index,effect);
    const sacrificial=JSON.stringify(target.threshold).includes('sacrificed-stat');
    if(!sacrificial)(context.prepareThresholdV10||=[]).push(source=>{
      if(/"(?:explicit-source-stat|source-stat)"/.test(JSON.stringify(target.threshold))&&source.power<=1)context.game.addCounters(source,'+1/+1',3);
      const threshold=countValue(context,source,target.threshold);
      for(const card of [result].flat())if(target.stat==='mv')card.def.cost='{'+Math.max(0,threshold)+'}';else card.def[target.stat]=String(threshold);
      context.game.recalc();
    });
    return result;
  }
  if(target.chosenColorV10&&context.chosenColorV10)return stageGenericTarget(MTG,context,{...target,chosenColorV10:false,colorsAny:[context.chosenColorV10]},index,effect);
  if(target.chosenGroupV9)return stageGenericTarget(MTG,context,{...target,chosenGroupV9:false,...(target.chosenGroupV9==='color'?{color:'white'}:{subtype:[...MTG.CREATURE_SUBTYPES].sort()[0]})},index,effect);
  if(target.targetCountX){
    const base={...target,targetCountX:false,min:1,max:1};
    if(target.what==='any')return [context.b,...Array.from({length:2},(_,n)=>stageGenericTarget(MTG,context,{...base,what:'creature'},index+'-'+n,effect))];
    return stageGenericTarget(MTG,context,{...base,min:3,max:3},index,effect);
  }
  if(target.threshold==='X')return stageGenericTarget(MTG,context,{...target,threshold:3},index,effect);
  if(['source-stat','explicit-source-stat'].includes(target.threshold?.kind)){
    const result=stageGenericTarget(MTG,context,{...target,threshold:0},index,effect);
    for(const card of [result].flat())card.oracleProofSourceStatTarget=true;
    return result;
  }
  if(context.exploitDonor&&JSON.stringify(target.threshold||{}).includes('event-card-stat')){
    assert.deepEqual(JSON.parse(JSON.stringify(target.threshold)),{kind:'sum',values:[{kind:'event-card-stat',stat:'toughness'},-1]});
    return stageGenericTarget(MTG,context,{...target,threshold:context.exploitDonor.toughness-1},index,effect);
  }
  if(typeof target.threshold==='object'){
    stageCount(MTG,context,target.threshold,v5Helpers());
    const threshold=countValue(context,null,target.threshold);
    return stageGenericTarget(MTG,context,{...target,threshold:Math.max(0,threshold)},index,effect);
  }
  if(target.alternatives)return stageGenericTarget(MTG,context,{...target,...target.alternatives[0],...(target.alternatives[0].what==='permanent'&&target.what!=='permanent'?{what:target.what}:{}),alternatives:target.alternatives[0].alternatives,...(target.controller&&target.controller!=='any'?{controller:target.controller}:{}),zone:target.zone,min:target.min,max:target.max,excludeSelf:target.excludeSelf},index,effect);
  if((target.unbounded||Number(target.max)>1)&&['player','opponent'].includes(target.what))return context.game.players.filter(p=>target.what!=='opponent'||p!==context.a).slice(0,target.max||Infinity);
  if(target.unbounded||Number(target.max)>1)return Array.from({length:target.unbounded?3:target.max},(_,n)=>stageGenericTarget(MTG,context,{...target,unbounded:false,max:1,min:1},index+'-'+n,effect));
  const { game, a, b } = context;
  const beneficial=['regenerate','prevent-next','attach-source','unblockable-until-eot','become-copy-v8'].includes(effect?.action)||effect?.action==='counter'&&!['-1/-1','stun'].includes(effect.counter)||effect?.action==='pump'&&(effect.power||0)>=0&&(effect.toughness||0)>=0;
  const controller = target.controller === 'you' ? a : target.controller==='opponent'||target.controller==='defending-player'?b:beneficial?a:b;
  if(target.name&&MTG.DEFS[target.name])return ['graveyard','hand','library','exile'].includes(target.zone)?zoneCard(MTG,controller,target.name,target.zone):permanent(MTG,game,controller,target.name);
  const what = String(target.what || 'creature').toLowerCase();
  if (what === 'player' || what === 'opponent' || what === 'any' || what === 'player or planeswalker') {
    const player=what === 'player' && target.controller === 'you' ? a : b;
    if(target.lostLifeThisTurnV10)player.turnState.lifeLost=1;
    if(target.damagedThisTurn)player.turnState.damageTaken=1;
    return player;
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
  if(what==='permanent'&&MTG.CREATURE_SUBTYPES.has(target.subtype))types=['Creature'];
  if(target.notType==='Creature'&&types.includes('Creature'))types=['Enchantment'];
  if(target.excludedTypes?.some(type=>types.includes(type)))types=[['Instant','Enchantment','Artifact','Creature','Land'].find(type=>!target.excludedTypes.includes(type))];
  const definition = fixtureDefinition(target.name||`Oracle Generic Target ${index}`, types, {
    power: types.includes('Creature') ? (target.dividedAmount !== undefined ? '2' : '20000') : undefined,
    toughness: types.includes('Creature') ? (target.dividedAmount !== undefined ? '1' : '20000') : undefined,
  });
  if(target.withKeyword)definition.kws=[target.withKeyword];
  if(target.cyclingV16)definition.cycling={cost:'{2}'};
  if(target.hasMechanicV17)definition[target.hasMechanicV17]='{1}';
  if(target.alsoType&&!definition.types.includes(target.alsoType))definition.types.push(target.alsoType);
  if(target.colorsAny)definition.colorsOverride=[target.colorsAny[0]];
  if(target.chosenColorV10)definition.colorsOverride=['W','U','B','R','G'];
  if(target.subtype)definition.subtypes=[target.subtype];
  if(target.subtype==='Aura')definition.auraTarget=[{what:'creature',filter:(game,card)=>card.is?.('Creature')}];
  if(types.includes('Planeswalker'))definition.loyalty='20000';
  if(target.notSubtype)definition.subtypes=['Other'];
  if(target.attachedHost&&target.what==='permanent'&&!target.subtype){definition.types=['Artifact'];definition.subtypes=['Equipment'];}
  if(effect?.attachmentHostV14&&!definition.subtypes?.some(type=>['Aura','Equipment'].includes(type))){
    if(types.includes('Artifact'))definition.subtypes=[...(definition.subtypes||[]),'Equipment'];
    else if(types.includes('Enchantment')){definition.subtypes=[...(definition.subtypes||[]),'Aura'];definition.auraTarget=[{what:'creature',filter:(g,card)=>card===effect.attachmentHostV14}];}
  }
  if(target.snow)definition.super=['Snow'];
  if(target.basic)definition.super=[...(definition.super||[]),'Basic'];
  if(target.legendary)definition.super=[...(definition.super||[]),'Legendary'];
  if(target.color)definition.colorsOverride=target.color==='colorless'?[]:target.color==='multicolored'?['G','W']:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[target.color]||'G'];
  if(target.notColor==='colorless')definition.colorsOverride=['G'];
  if(target.stat==='mv')definition.cost='{'+target.threshold+'}';
  const zone = ['graveyard','exile','hand','library'].includes(target.zone) ? target.zone : 'battlefield';
  const card = zone === 'battlefield'
    ? permanent(MTG, game, controller, definition)
    : (() => {
        const owner = target.owner === 'you' ? a : controller;
        const result = new MTG.CardInst(definition, owner);
        result.zone = zone;
        owner[zone].push(result);
        return result;
      })();
  if (target.tapped) card.tapped = true;
  if(target.owner==='you')card.owner=a;
  if(target.commander)card.commander=true;
  if(target.anyCounter)card.counters.charge=1;
  if(target.damagedThisTurn)card.meta._lastDamageVisual={turn:game.turnNo,sourceId:0};
  if(target.hasToxicV10!==undefined){card.def={...card.def,toxic:target.hasToxicV10?1:0};game.recalc();}
  if(target.dealtDamageV9)card.meta.dealtDamageV9={turn:game.turnNo,players:target.dealtDamageV9==='you'?[context.a.idx]:[]};
  if(target.faceDownV9)MTG.C14.faceDown(game,card);
  if(target.faceUpV9)card.faceDown=false;
  if(target.modifiedV9)card.counters['+1/+1']=1;
  if(target.blockingSourceV9||target.combatPartnerV12)(context.blockingSourceTargetsV9||=[]).push(card);
  if(target.blockedBySourceV19)(context.blockedBySourceTargetsV19||=[]).push(card);
  if(target.blockHistoryV19)card.meta.oracleBlockHistoryV19={turn:game.turnNo,blocks:[{iid:-1,version:0,subtypes:target.blockPartnerV19==='Zombie'?['Zombie']:[],super:target.blockPartnerV19==='legendary creature'?['Legendary']:[]}],blockedBy:[]};
  if(target.equalStatsV9){card.def.power='2';card.def.toughness='2';game.recalc();}
  if(target.excludedFiltersV10?.some(filter=>filter.equalStatsV9)){card.def.power='2';card.def.toughness='3';game.recalc();}
  if(target.enteredThisTurn)card.meta._enteredTurn=game.turnNo;
  if(target.attackedThisTurn)card.meta._attackedTurn=game.turnNo;
  if (effect?.action==='untap')card.tapped=true;
  if (target.hasCounter)game.addCounters(card,target.hasCounter,1,false,controller);
  if(types.includes('Planeswalker')&&zone==='battlefield')card.counters.loyalty=20000;
  if (target.token) card.isToken = true;
  if ((target.subtype === 'Aura'||target.attachedHost) && zone === 'battlefield') {
    const host=effect?.attachmentHostV14||(target.attachedHost?stageGenericTarget(MTG,context,target.attachedHost,'attachment-host-'+index):permanent(MTG,game,controller,'Grizzly Bears'));
    if(target.attachedHost)card.def.auraTarget=[{what:target.attachedHost.what,filter:(g,candidate)=>candidate===host}];
    card.attachedTo=host.iid;host.attachments.push(card.iid);
  }
  if (target.enchanted || target.equipped) {
    const attachment=permanent(MTG,game,controller,fixtureDefinition('V6 target attachment',[target.enchanted?'Enchantment':'Artifact'],{subtypes:[target.enchanted?'Aura':'Equipment']}));
    attachment.attachedTo=card.iid;card.attachments.push(attachment.iid);
  }
  if (target.attacking || target.attackingOrBlocking || target.controller === 'defending-player') card.attacking = a;
  if(target.attackingYouV9)card.attacking=a;
  if(target.unblockedV10){card.attacking=card.ctrl===a?b:a;card.wasBlocked=false;game.combat={...(game.combat||{}),blockersDeclared:true};}
  if(target.blockedV12){card.attacking=card.ctrl===a?b:a;card.wasBlocked=true;}
  if(target.exactStatsV9){card.def.power=String(target.exactStatsV9.power);card.def.toughness=String(target.exactStatsV9.toughness);}
  if(target.totalStatsV9){card.def.power=String(Math.max(0,target.totalStatsV9.n-1));card.def.toughness='1';}
  if(target.commanderV9)card.commander=true;
  if(target.ownerV9)card.owner=target.ownerV9==='you'?a:b;
  if (target.blocking) card.blocking = 1;
  // Prove haste on a newly arrived creature that can benefit from it. A ready
  // witness made the AI proof depend on arbitrary choices between useless buffs.
  if (effect?.action === 'pump' && effect.keywords?.includes('haste') && zone === 'battlefield' &&
      types.includes('Creature') && !card.attacking && !card.blocking) card.sick = true;
  if (target.stat && target.stat!=='mv') {
    card.def[target.stat] = String(target.threshold);
    game.recalc();
  }
  game.recalc();
  return card;
}

function genericEffectTarget(effect, selectedTargets, source, context = {}) {
  if(effect.target?.kind==='selected-union-v15')return [...new Set(effect.target.indices.flatMap(index=>[genericEffectTarget({target:index},selectedTargets,source,context)].flat().filter(Boolean)))];
  if(effect.target==='manifested-v15')return context.manifestedProofV15?.[0];
  if(effect.target==='event-stack-v10')return context.eventStackV10;
  if(effect.target==='combat-defender-v9')return context.defendingPlayer;
  if(effect.target==='event-defender-v18')return context.eventDefenderV18||context.defendingPlayer||context.b;
  if(effect.target==='attached-host')return context.game.byIid(source.attachedTo)||context.attachmentHosts?.get(source);
  if(effect.target?.kind==='locked-player')return selectedTargets[effect.target.index];
  if(effect.target?.kind==='target-controller')return selectedTargets[effect.target.index]?.ctrl;
  if(effect.target?.kind==='target-owner'){const subject=selectedTargets[effect.target.index];return subject?.card?.owner||subject?.owner;}
  if(effect.target==='event-card'||effect.target==='attachment-event-host-v17')return context.eventCard;
  if(effect.target==='event-player')return context.eventPlayer;
  if(effect.target==='event-card-controller')return context.eventController;
  if (effect.target === 'you') return source.ctrl;
  if (effect.target === 'self') return source;
  if (typeof effect.target === 'number') {const selected=selectedTargets[effect.target];return Array.isArray(selected)&&!selected.length?undefined:selected;}
  return null;
}

function genericEffectPlayer(effect, selectedTargets, source, owner, damagedPlayer, context = {}) {
  if(effect.who==='result-controller-v16')return context.oracleResultControllerV16;
  if(effect.who==='sequence-player-v15')return context.oracleSequencePlayerV15;
  if(effect.who==='combat-defender-v9')return context.defendingPlayer;
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
  context.attachmentHosts||=new Map();for(const card of context.game.battlefield)if(card.attachedTo)context.attachmentHosts.set(card,context.game.byIid(card.attachedTo));
  return {
    stackManaValues:new Map(context.game.stack.filter(object=>object.kind==='spell').map(object=>[object,context.game.stackSpellManaValue(object)])),
    players: new Map(context.game.players.map(player => [player, playerState(player)])),
    cards: new Map([...new Set([...trackedCards,...context.game.battlefield,...context.game.stack.filter(row=>row.kind==='spell').map(row=>row.card)])].filter(Boolean).map(card => [card, cardState(card)])),
    battlefield: context.game.battlefield.slice(),
    tokenCount: context.game.battlefield.filter(card => card.isToken).length,
    tokenCreationEvidenceIndex:context.tokenCreationEvidence?.length||0,
    monarch: context.game.monarch || null,
    ventureEvidenceIndex:context.ventureEvidence?.length||0,
    discoverEvidenceIndex:context.discoverEvidence?.length||0,
    coinEvidenceIndex:context.coinEvidence?.length||0,
    clashEvidenceIndex:context.clashEvidence?.length||0,
    extraTurns:[...(context.game.extraTurns||[])],
    additionalPhases:(context.game._additionalPhases||[]).map(row=>row.kind),
    phase:context.game.phase,
    millEvidenceIndex:context.millEvidence?.length||0,
    damageEvidenceIndex:context.damageEvidence?.length||0,
    batchEvidenceIndex:context.batchEvidence?.length||0,
    moveEvidenceIndex:context.moveEvidence?.length||0,
    lifeEvidenceIndex:context.lifeEvidence?.length||0,
    gainLifeEvidenceIndex:context.gainLifeEvidence?.length||0,
    drawEvidenceIndex:context.drawEvidence?.length||0,
    exploreEvidenceIndex:context.exploreEvidence?.length||0,
    counterChangeEvidenceIndex:context.counterChangeEvidence?.length||0,
    revealEvidenceIndex:context.revealEvidence?.length||0,
    sacrificeEvidenceIndex:context.sacrificeEvidence?.length||0,
  };
}

async function assertGenericEffectEvidence(MTG, context, entry, effect, source, selectedTargets,
  damagedPlayer, before, trace, label) {
  const { game, a, b } = context;
  if(effect.action==='unsuspect-v19'){assert.ok(context.suspectedFixturesV19.length);for(const card of context.suspectedFixturesV19)assert.equal(card.meta.suspected,false);return;}
  if(effect.action==='counter'&&effect.n==='X'&&before.oracleX===0&&context.proofOperation?.cost?.sacN==='X'){assert.equal(source.counters[effect.counter]||0,before.cards.get(source).counters[effect.counter]||0,label+': zero sacrificed cards add zero counters');return;}
  if(effect.action==='zone-exchange-v19'){
    const [first,second]=effect.zones,old=before.players.get(a);
    for(const card of old[first+'Cards'].filter(card=>card!==source))assert.equal(card.zone,second,label+': entire first zone changes destination');
    for(const card of old[second+'Cards'].filter(card=>card!==source))assert.equal(card.zone,first,label+': entire second zone changes destination');return;
  }
  if(effect.action==='graveyard-edge-v19'){const player=selectedTargets[effect.target],cards=before.players.get(player).graveyardCards;assert.ok(cards.length>1);assert.equal(cards[0].zone,'exile');for(const card of cards.slice(1))assert.equal(card.zone,'graveyard');return;}
  if(effect.action==='random-destroy-v19'){const pool=effect.allExceptOne?before.battlefield.filter(c=>before.cards.get(c).types.includes('Creature')):[selectedTargets[effect.target]].flat();assert.ok(pool.length>=3);assert.equal(pool.filter(c=>c.zone==='graveyard').length,effect.allExceptOne?pool.length-1:1);return;}
  if(effect.action==='sacrifice-except-v19'){for(const player of game.players){const pool=before.battlefield.filter(card=>before.cards.get(card).ctrl===player);assert.ok(pool.length>effect.keep);assert.equal(pool.filter(card=>card.zone==='battlefield').length,effect.keep);assert.equal(pool.filter(card=>card.zone==='graveyard').length,pool.length-effect.keep);}return;}
  if(effect.action==='color-v18'){
    const subject=selectedTargets[effect.target],card=subject.kind==='spell'?subject.card:subject;let expected=effect.colors;
    if(typeof expected==='string'){const row=trace.findLast(r=>r.query.prompt===('Choose '+(expected==='choose'?'a color':'one or more colors')));assert.ok(row,label+': real color choice');const index=Number(row.result),colors=['W','U','B','R','G'];expected=expected==='choose'?[colors[index]]:colors.filter((_c,j)=>((index+1)&(1<<j))!==0);}
    if(subject.kind==='spell'){const row=context.colorStackEvidenceV18.find(r=>r.object===subject);assert.ok(row,label+': color observed on actual spell before resolution');assert.deepEqual(row.colors,Array.from(expected));if(card.zone==='battlefield')assert.deepEqual(Array.from(card.colors),Array.from(expected));}
    else assert.deepEqual(Array.from(card.colors),Array.from(expected));return;
  }
  if(effect.action==='exchange-life-v18'){
    const players=[...(effect.withYou?[a]:[]),...[selectedTargets[effect.target]].flat()].filter(Boolean);assert.equal(new Set(players).size,2,label+': two distinct life totals '+JSON.stringify(trace.filter(r=>r.query.type==='chooseTargets').map(r=>({hint:r.query.aiHint,result:r.result.map(p=>p.name)}))));
    const values=players.map(p=>before.players.get(p).life);assert.notEqual(values[0],values[1],label+': unequal totals witness');assert.equal(players[0].life,values[1]);assert.equal(players[1].life,values[0]);
    if(effect.drawLost)assert.equal(context.drawEvidence.slice(before.drawEvidenceIndex).filter(r=>r.player===a).reduce((s,r)=>s+r.drawn,0),Math.max(0,before.players.get(a).life-a.life));
    if(effect.tokenDifference){const token=game.bf().find(c=>c.isToken&&!before.battlefield.includes(c)&&c.hasSub('Horror'));assert.ok(token);assert.equal(token.power,Math.abs(values[0]-values[1]));assert.equal(token.toughness,token.power);assert.equal(token.is('Artifact'),true);}return;
  }
  if(effect.action==='reverse-tap-v18'){const cards=before.battlefield.filter(c=>before.cards.get(c).types.includes('Creature'));assert.ok(cards.some(c=>before.cards.get(c).tapped));assert.ok(cards.some(c=>!before.cards.get(c).tapped));for(const c of cards)assert.equal(c.tapped,!before.cards.get(c).tapped);return;}
  if(effect.action==='empty-mana-v18'){const p=selectedTargets[effect.target];assert.equal(Object.values(p.pool).reduce((n,x)=>n+x,0),0);assert.equal(p.poolMeta.length,0);return;}
  if(effect.action==='player-hexproof-v18'){assert.equal(game.legalTargets(MTG.T.player(),source,b).includes(a),false);assert.equal(game.legalTargets(MTG.T.player(),source,a).includes(a),true);return;}
  if(effect.action==='entry-tapped-v18'){const card=zoneCard(MTG,b,'Grizzly Bears','hand');await game.move(card,'battlefield',{ctrl:b});assert.equal(card.tapped,true);return;}
  if(effect.action==='reveal-top-v16'){
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(p=>p!==a):[genericEffectPlayer(effect,selectedTargets,source,a,damagedPlayer,context)];
    for(const player of players){const cards=before.players.get(player).libraryCards.slice(-1);assert.ok(cards.length,label+': nonempty library witness');assert.ok(context.revealEvidence.slice(before.revealEvidenceIndex).some(row=>row.ctrl===player&&row.kind==='reveal'&&row.cards.length===1&&row.cards[0]===cards[0]),label+': exact top card publicly revealed');assert.deepEqual(player.library,before.players.get(player).libraryCards,label+': reveal preserves library order');}return;
  }
  if(effect.action==='create-emblem-v11'){
    const created=a.emblems.filter(emblem=>!before.players.get(a).emblems.includes(emblem)&&JSON.stringify(emblem.oracleEmblemV11)===JSON.stringify(effect.operations));
    assert.equal(created.length,1,label+': the actual activation creates exactly one matching emblem');
    const emblem=created[0];assert.equal(emblem.ctrl,a);assert.equal(emblem.zone,'command');assert.equal(game.bf().includes(emblem),false);
    assert.equal(game.legalTargets(MTG.T.permanent(),source,b).includes(emblem),false,label+': an emblem is not a permanent');
    for(const operation of effect.operations){
      if(operation.kind==='generic-static'){
        for(const filter of operation.filters||[{what:'creature',zone:'battlefield',controller:operation.scope.startsWith('all-')?'any':'you'}])for(const controller of ['you','opponent']){
          const card=stageGenericTarget(MTG,context,{...filter,controller},'emblem-static-'+controller);game.recalc();
          const applies=(operation.filters||[filter]).some(target=>matchesTarget(card,target,context,emblem));
          for(const keyword of operation.keywords||[])assert.equal(card.kw(keyword),applies,label+': emblem keyword obeys recipient filters');
          if(operation.power)assert.equal(card.power,Number(card.def.power)+(applies?operation.power:0));
          if(operation.toughness)assert.equal(card.toughness,Number(card.def.toughness)+(applies?operation.toughness:0));
        }
        continue;
      }
      assert.equal(operation.kind,'generic-trigger');
      const start=trace.length;
      for(const [index,target]of(operation.targets||[]).entries())if(target.zone==='stack')await stageGenericStackTarget(MTG,context,target,index);else stageGenericTarget(MTG,context,target,'emblem-target-'+index,operation.effects.find(effect=>effect.target===index));
      stageCondition(MTG,context,operation.condition,emblem,v5Helpers());
      for(const child of flattenProofEffects(operation.effects)){
        for(const key of ['n','multiplier','power','toughness'])if(child[key]&&typeof child[key]==='object')stageCount(MTG,context,child[key],v5Helpers());
        stageEnergy(MTG,context,child,v8Helpers());stageRevealed(MTG,context,child,v8Helpers());stageV8Effect(MTG,context,child,v8Helpers());stageCopyLinkedEffect(MTG,context,child,v8Helpers());stagePlayPermission(MTG,context,child,v8Helpers());stageMultizoneSearch(MTG,context,child,v8Helpers());stagePaymentEffect(MTG,context,child,v8Helpers());
        if(child.action==='search-library'){
          const target=stageGenericTarget(MTG,context,{...(child.filter||{what:child.what}),zone:'graveyard',controller:'you'},'emblem-search');
          a.graveyard.splice(a.graveyard.indexOf(target),1);target.zone='library';a.library.push(target);
        }
      }
      fund(a);await fireGenericEvent(MTG,context,emblem,operation);await game.flushTriggers();
      const object=game.stack.find(row=>row.kind==='trigger'&&row.srcCard===emblem&&emblem.triggers.some(trigger=>row.run===trigger.run));
      assert.ok(object,label+': a subsequent game event puts the emblem ability on the stack');assert.equal(object.ctrl,a);
      context.eventCard=object.ctx?.oracleSourceCapture?.eventCard||object.ctx?.data?.card;context.eventPlayer=object.ctx?.oracleSourceCapture?.eventPlayer||object.ctx?.data?.player;context.eventAmount=object.ctx?.oracleSourceCapture?.eventAmount??object.ctx?.data?.n;context.eventController=object.ctx?.oracleSourceCapture?.eventController;
      context.eventStackV10=object.ctx?.oracleSourceCapture?.eventStackV10;context.defendingPlayer=object.ctx?.oracleSourceCapture?.defendingPlayer;
      const snapshot=genericProofSnapshot(context,[emblem,context.eventCard,...(object.targets||[]).flat().filter(target=>target instanceof MTG.CardInst)]);snapshot.oracleX=object.ctx?.x||0;
      await resolveAll(game);
      for(const child of operation.effects)await assertGenericEffectEvidence(MTG,context,entry,child,emblem,object.targets||[],context.eventPlayer,snapshot,trace.slice(start),label+'/emblem');
      assert.equal(a.emblems.includes(emblem),true,label+': resolving the trigger leaves the emblem in the command zone');
    }
    return;
  }
  if(effect.action==='skip-v10')return skipEffectProofV10(game,genericEffectPlayer(effect,selectedTargets,source,a,damagedPlayer,context),effect,label);
  if(effect.action==='day-night-v12'){
    assert.equal(game.bomDayNight,effect.state,label+': printed instruction changes the shared day/night state');
    for(const card of game.bf())if(card.oracleFaces&&card.oracleFaces.faces[0].def.bomDaybound)
      assert.equal(card.oracleFace,effect.state==='night'?'back':'front',label+': daybound permanents follow the shared state');
    return 1;
  }
  if(effect.action==='skip-untap-group-v12'){
    const player=genericEffectPlayer(effect,selectedTargets,source,a,damagedPlayer,context);
    assert.ok(game.untilEffects.some(row=>row.kind==='oracleNextUntapV12'&&row.player===player),label+': restriction is scheduled for the selected player');
    const relative={...context,a:player,b:game.players.find(p=>p!==player)},filter=effect.filters[0];
    const late=stageGenericTarget(MTG,relative,{...filter,controller:'you'},'next-untap-late');late.tapped=true;
    const untouched=permanent(MTG,game,player,fixtureDefinition('Unaffected next untap witness',['Enchantment']));untouched.tapped=true;
    await phaseEntryV10(game,player,'untap');assert.equal(late.tapped,true,label+': a permanent added after resolution is also affected');assert.equal(untouched.tapped,false,label+': unrelated permanent untaps');
    assert.equal(game.untilEffects.some(row=>row.kind==='oracleNextUntapV12'&&row.player===player),false,label+': restriction expires after the next actual step');
    await phaseEntryV10(game,player,'untap');assert.equal(late.tapped,false,label+': following untap step works normally');return 3;
  }
  if(effect.action==='prepare-v10'){
    assert.equal(source.meta.prepared,true,label+': actual effect prepares its source');
    const copy=game.byIid(source.meta.preparedCopy);assert.ok(copy);assert.equal(copy.zone,'exile');assert.equal(copy.isCopySpell,true);assert.equal(copy.meta.preparedBy,source.iid);return 5;
  }
  if(effect.toxicV10){
    const subjects=effect.filters?(context.groupFixtures.get(effect)||[]):[genericEffectTarget(effect,selectedTargets,source,context)].flat().filter(Boolean);
    assert.ok(subjects.length,label+': numeric keyword recipients');
    for(const card of subjects)if(card.zone==='battlefield')await combatRestrictionProof(MTG,context,card,effect,v5Helpers(),label+'/toxic');
  }
  if(effect.action==='retarget-single-v10'){
    const object=selectedTargets[effect.target],fixture=context.retargetFixturesV10.get(object),next=object.targets.flat().find(Boolean);
    assert.notEqual(next,fixture.original,label+': target actually changed');assert.equal(object.targets.flat().filter(Boolean).length,1);
    assert.equal(object.targetIdentities.flat()[0].zoneVersion,next.zoneVersion,label+': new target identity captured');
    assert.equal(fixture.original.damage,fixture.damage,label+': original recipient is unaffected');
    assert.ok(context.damageEvidence.some(row=>row.source===(object.card||object.srcCard)&&row.target===next&&row.actual===1),label+': the redirected object resolves on its new target');return 5;
  }
  if(effect.action==='no-combat-assignment-v19'){assert.equal(game.dmgAmount(source,'normal'),0,label+': source assigns no combat damage');assert.equal(game.dmgAmount(source,'first'),0);return 2;}
  if(effect.action==='return-dead-source-v10'){assert.equal(source.zone,effect.destination,label+': the actual dying card returns');return 1;}
  if(effect.action==='additional-land-v10'){
    const base=a.maxLands,old=a.landsPlayed;game.turnPlayer=a;game.phase='main1';
    const n=game.landPlayLimit(a);assert.ok(n>=base+effect.n,label+': additional land allowance');
    a.landsPlayed=n-effect.n;
    for(let i=0;i<effect.n;i++){const land=zoneCard(MTG,a,'Forest','hand');assert.equal(await game.playLand(a,land),true);}
    const excess=zoneCard(MTG,a,'Forest','hand');assert.equal(await game.playLand(a,excess),false,label+': printed allowance is finite');a.landsPlayed=old;return effect.n+2;
  }
  if(effect.action==='player-rule-v10'){
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?a.opponents(game):[genericEffectPlayer(effect,selectedTargets,source,a,damagedPlayer,context)];
    for(const player of players){
      if(effect.rule==='no-search')assert.equal(game.canSearchLibrary(player),false,label+': actual search prohibited');
      else {const land=zoneCard(MTG,player,'Forest','hand');game.turnPlayer=player;game.phase='main1';assert.equal(game.playableLands(player).includes(land),false);assert.equal(await game.playLand(player,land),false,label+': direct land play prohibited');}
    }return players.length*2;
  }
  if(effect.action==='no-life-gain-v9'){
    const old=[a.life,b.life];await game.gainLife(a,3,source);await game.gainLife(b,3,source);
    assert.deepEqual([a.life,b.life],[old[0]+(effect.who==='opponents'?3:0),old[1]],label+': actual life gain obeys prohibition');return 2;
  }
  if(effect.action==='hand-library-v10'){
    const choice=trace.findLast(row=>row.query.prompt==='Choose cards from your hand for your library');assert.ok(choice,label+': actual hand selection');
    const cards=choice.result;assert.equal(cards.length,Math.min(effect.n,choice.query.from.length),label+': printed quantity');
    assert.equal(new Set(cards).size,cards.length);for(const card of cards){assert.equal(card.zone,'library');assert.ok(a.library.includes(card));assert.equal(a.hand.includes(card),false);}
    if(effect.placement!=='shuffle')assert.ok(cards.every(card=>(effect.placement==='top'?a.library.slice(-cards.length):a.library.slice(0,cards.length)).includes(card)),label+': cards occupy the specified library end');
    return cards.length+2;
  }
  if(effect.action==='no-damage-prevention-v9'){
    const old=b.life;game.untilEffects.push({kind:'oraclePreventNextAmount',target:b,remaining:3,direction:'to',expires:'eot'});
    await game.damageAny(source,b,2);assert.equal(b.life,old-2,label+': actual damage ignores prevention');return 1;
  }
  if(effect.action==='endure-v9'){
    const choice=trace.findLast(row=>row.query.aiHint?.kind==='oracleEndure');assert.ok(choice,label+': resolution choice reached the controller');
    if(choice.result==='counters')assert.ok((source.counters['+1/+1']||0)>=(before.cards.get(source)?.counters?.['+1/+1']||0)+effect.n,label+': Endure counters are on the actual source');
    else {const token=game.creatures(a).find(card=>card.isToken&&card.hasSub('Spirit')&&!before.battlefield.includes(card));assert.ok(token,label+': Endure created the Spirit');assert.equal(token.power,effect.n);assert.equal(token.toughness,effect.n);assert.deepEqual(Array.from(token.colors),['W']);}
    return 4;
  }
  if(effect.action==='attach-source'&&effect.chooseOneV9){const host=game.byIid(source.attachedTo);assert.ok(host&&!before.battlefield.includes(host)&&host.isToken,label+': equipment attached to an actual newly created token');if(JSON.stringify(entry.implementation).includes('"tokenKey":"hero11"'))assert.equal(host.hasSub('Hero'),true,label+': Job select created a Hero');return 1;}
  if(typeof effect.who==='number'&&Array.isArray(selectedTargets[effect.who])&&['gain-life','lose-life','draw','mill','discard'].includes(effect.action)){
    for(const player of selectedTargets[effect.who]){const targets=selectedTargets.slice();targets[effect.who]=player;await assertGenericEffectEvidence(MTG,context,entry,effect,source,targets,damagedPlayer,before,trace,label+'/player');}return selectedTargets[effect.who].length;
  }
  if(effect.action==='win-game-v9'){assert.equal(a.lost,false,label+': controller remains in game');assert.ok(game.players.filter(p=>p!==a).every(p=>p.lost),label+': all opponents lost to the actual win effect');return 2;}

  if(effect.action==='attach-v9'){
    const attachment=effect.attachment==='self'?source:selectedTargets[effect.attachment],host=selectedTargets[effect.target];
    assert.equal(attachment.attachedTo,host.iid,label+': attachment has selected host');
    assert.ok(host.attachments.includes(attachment.iid),label+': host records attachment');return 2;
  }
  if(effect.action==='discover-v9'){
    const row=context.discoverEvidence.slice(before.discoverEvidenceIndex).find(row=>row.source===source&&row.player===a);
    assert.ok(row,label+': real discover route');assert.equal(row.n,effect.n);
    const examined=row.library.slice().reverse(),index=examined.findIndex(card=>!card.is('Land')&&card.mv<=effect.n);
    assert.ok(index>=1,label+': discover passes over lands to a qualifying nonland');
    const hit=examined[index],prefix=examined.slice(0,index+1);
    const exiled=context.moveEvidence.slice(row.moveIndex).filter(move=>move.from==='library'&&move.to==='exile').map(move=>move.card);
    assert.deepEqual(Array.from(exiled.slice(0,prefix.length)),Array.from(prefix),label+': exact cards exiled from the top in order');
    assert.ok(['battlefield','hand','graveyard'].includes(hit.zone),label+': discovered card is cast or put in hand');
    assert.ok(prefix.slice(0,-1).every(card=>card.zone==='library'&&a.library.slice(0,index).includes(card)),label+': unused revealed lands return to bottom');
    assert.ok(trace.some(row=>row.query.type==='chooseCards'&&row.query.from?.includes(hit)),label+': controller makes the real discover choice');
    return 6;
  }
  if(effect.action==='shuffle-library-v9'){
    const player=selectedTargets[effect.who],old=before.players.get(player).libraryCards;
    assert.deepEqual(Array.from(player.library,card=>card.iid).sort((a,b)=>a-b),Array.from(old,card=>card.iid).sort((a,b)=>a-b),label+': shuffle preserves exactly the selected library');
    assert.notDeepEqual(Array.from(player.library),Array.from(old),label+': actual shuffled order changes');
    return 2;
  }
  if(effect.action==='target-declaration-v9'){
    assert.ok(selectedTargets.length>effect.target,label+': explicit target group announced');
    return 1;
  }
  if(effect.action==='shuffle-source-v9'){
    assert.equal(source.zone,'library',label+': resolving spell returned to its own library');
    assert.ok(source.owner.library.includes(source),label+': real source object is in owner library');
    assert.ok(context.moveEvidence.slice(before.moveEvidenceIndex).some(row=>row.card===source&&row.from==='stack'&&row.to==='library'),label+': real Stack-to-library move');
    return 3;
  }
  if(effect.action==='remove-keywords-v9'){
    const subjects=effect.filters?context.groupFixtures.get(effect)||[]:effect.target==='self'?[source]:[selectedTargets[effect.target]].flat().filter(Boolean);
    for(const subject of subjects)if(subject.zone==='battlefield')for(const keyword of effect.keywords)assert.equal(subject.kw(keyword),false,label+': printed keyword removed');
    return Math.max(1,subjects.length*effect.keywords.length);
  }
  if(effect.action==='player-choice-v9'){
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(p=>p!==a):effect.who==='event-player'?[context.eventPlayer||damagedPlayer]:[genericEffectTarget({target:effect.who},selectedTargets,source,context)];
    for(const player of players)for(const child of effect.effects){
      await assertGenericEffectEvidence(MTG,{...context,a:player,b:game.players.find(p=>p!==player)},entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/optional-player');
    }return players.length;
  }
  if(effect.action==='blight-v9'){
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(p=>p!==a):effect.who==='you'?[a]:[selectedTargets[effect.who]];
    for(const player of players){
      const choice=trace.findLast(row=>row.query.type==='chooseCards'&&row.query.aiHint?.kind==='blight'&&row.result[0]?.owner===player);
      assert.ok(choice,label+': affected player chooses their blight creature');
      const card=choice.result[0];
      const placement=context.counterChangeEvidence.slice(before.counterChangeEvidenceIndex).find(row=>
        row.card===card&&row.kind==='-1/-1'&&row.action==='counter'&&row.n===effect.n&&row.after-row.before>=effect.n&&!context.usedCounterChanges.has(row));
      assert.ok(placement,label+': actual blight counters were placed before counter cancellation or lethal state checks');
      context.usedCounterChanges.add(placement);
    }
    for(const child of effect.effects||[])await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/paid-blight');
    return players.length;
  }
  if(effect.action==='no-cast-v9'){
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(p=>p!==a):[genericEffectTarget({target:effect.who},selectedTargets,source,context)];
    const record=game.untilEffects.find(e=>e.kind==='oracleNoCastV9'&&e.quality===effect.quality&&players.every(p=>e.players.includes(p)));assert.ok(record,label+': actual player restriction installed');
    for(const player of players){fund(player,30);const probe=zoneCard(MTG,player,effect.quality==='creature'?'Grizzly Bears':'Lightning Bolt','hand'),mana=Object.values(player.pool).reduce((s,n)=>s+n,0);assert.equal(await game.castSpell(player,probe,{from:'hand'}),false,label+': prohibited spell cannot be announced');assert.equal(probe.zone,'hand');assert.equal(Object.values(player.pool).reduce((s,n)=>s+n,0),mana);}
    return players.length*3;
  }
  if(effect.action==='graveyard-v9'){for(const card of [selectedTargets[effect.target]].flat()){assert.equal(card.zone,'graveyard');assert.ok(card.owner.graveyard.includes(card));}return 2;}
  if(effect.action==='set-life-v9'){
    if(effect.who==='each-player'){for(const player of game.players)await assertGenericEffectEvidence(MTG,context,entry,{...effect,who:0},source,[player],damagedPlayer,before,trace,label+'/'+player.name);return game.players.length;}
    const player=genericEffectTarget({target:effect.who},selectedTargets,source,context);
    assert.ok(player instanceof MTG.Player,label+': correct life-total recipient');
    const snapshot=effect.n?.kind==='count'&&effect.n.zone==='battlefield'&&source.zone==='battlefield'&&!before.battlefield.includes(source)?{...before,battlefield:[...before.battlefield,source],cards:new Map([...before.cards,[source,cardState(source)]])}:before;
    const value=effect.double?before.players.get(player).life*2:countValue({...context,oracleProofTargets:selectedTargets},source,effect.n,snapshot);
    assert.equal(player.life,value,label+': exact resulting life total');return 1;
  }
  if(effect.action==='choose-group-v9'){
    const choice=trace.findLast(row=>row.query.type==='chooseOption'&&row.query.prompt===source.name+': choose '+(effect.choice==='creature-type'?'a creature type':'a color'));
    assert.ok(choice,label+': group choice is made during resolution');
    for(const child of effect.effects){
      const adjusted={...child,filters:child.filters.map(({chosenGroupV9,...f})=>chosenGroupV9?{...f,...(effect.choice==='creature-type'?{subtype:choice.result}:{color:{W:'white',U:'blue',B:'black',R:'red',G:'green'}[choice.result]})}:f)};
      context.groupFixtures.set(adjusted,context.groupFixtures.get(child)||[]);
      await assertGenericEffectEvidence(MTG,context,entry,adjusted,source,selectedTargets,damagedPlayer,before,trace,label+'/chosen-group');
    }return 1;
  }
  if(effect.action==='choose-subtype-v10'){
    const choice=trace.findLast(row=>row.query.type==='chooseOption'&&row.query.prompt===source.name+': choose a creature type');
    assert.ok(choice,label+': actual creature type decision');assert.ok(MTG.CREATURE_SUBTYPES.has(choice.result));assert.equal(effect.exclude.includes(choice.result),false);
    const bind=value=>value?.kind==='chosen-subtype-v10'?choice.result:Array.isArray(value)?value.map(bind):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,bind(child)])):value;
    const adjusted=bind(effect.effects),staged=context.chosenSubtypeProof.get(effect);
    const copyMaps=(old,next)=>{for(const value of Object.values(context))if(value instanceof Map&&value.has(old))value.set(next,value.get(old));for(const key of ['effects','elseEffects'])for(let i=0;i<(old[key]||[]).length;i++)copyMaps(old[key][i],next[key][i]);};
    for(let i=0;i<adjusted.length;i++){copyMaps(staged[i],adjusted[i]);await assertGenericEffectEvidence(MTG,context,entry,adjusted[i],source,selectedTargets,damagedPlayer,before,trace,label+'/chosen-type');}
    return 3;
  }
  if(effect.action==='player-sequence-v9'){
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(player=>player!==a):typeof effect.who==='number'?[selectedTargets[effect.who]].flat().filter(Boolean):[effect.who==='you'?a:context.eventPlayer||damagedPlayer];
    for(const player of players)for(const child of effect.effects)await assertGenericEffectEvidence(MTG,{...context,oracleSequencePlayerV15:player},entry,child,source,[player],damagedPlayer,before,trace,label+'/player-sequence');
    return players.length*effect.effects.length;
  }
  if(effect.action==='conditional'&&effect.condition?.kind==='player-condition-v15'){
    const p=genericEffectPlayer({who:effect.condition.who},selectedTargets,source,a,damagedPlayer,context),scoped={...context,a:p};
    const holds=condition=>condition.kind==='not'?!holds(condition.condition):condition.kind==='count-comparison'&&(()=>{const n=countValue(scoped,source,condition.count,before);return (condition.min===undefined||n>=condition.min)&&(condition.max===undefined||n<=condition.max);})();
    assert.ok(holds(effect.condition.condition),label+': matching player condition was staged');
    for(const child of effect.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/matching-player');return;
  }
  if(effect.action==='move-to-library'&&effect.filters){
    const view=card=>{const state=before.cards.get(card);return {...card,...state,zone:'battlefield',is:type=>state.types.includes(type),hasSub:type=>state.subtypes.includes(type),kw:keyword=>state.keywords.includes(keyword)};};
    const expected=before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(view(card),filter,context,source)));
    assert.ok(expected.length,label+': group contains affected objects');
    for(const card of expected)assert.ok(context.moveEvidence.slice(before.moveEvidenceIndex).some(row=>row.card===card&&row.to==='library'),label+': selected group moved to library');
    return expected.length;
  }
  if(effect.action==='initiative-v9'||effect.action==='venture-v9'){
    const row=context.ventureEvidence.slice(before.ventureEvidenceIndex).find(row=>row.player===a&&row.source===source);
    assert.ok(row,label+': actual venture route');
    assert.ok(row.after&&MTG.AFC.dungeons[row.after.key]?.rooms[row.after.room],label+': legal dungeon room');
    assert.ok(row.rooms>0,label+': room ability uses the Stack');
    if(effect.action==='initiative-v9'){
      assert.equal(game.initiative,a,label+': controller took initiative');
      assert.equal(row.undercity,true,label+': initiative-specific venture');
      if(!row.before)assert.equal(row.after.key,'undercity');
    }else if(!row.before)assert.notEqual(row.after.key,'undercity',label+': ordinary venture cannot start Undercity');
    return 5;
  }
  if(effect.action==='exploit-v8'){
    const event=context.exploitEvidence.find(row=>row.exploiter===source);assert.ok(event,label+': real exploit event');
    assert.ok(event.card instanceof MTG.CardInst,label+': actual controller chose one physical sacrifice');
    const choice=trace.find(row=>row.query.aiHint?.exploitSource===source&&row.query.type==='chooseCards');
    assert.ok(choice&&choice.result?.length===1&&choice.result[0]===event.card,label+': event matches the actual chosen creature');
    assert.equal(event.player,a);assert.ok(event.snap.types.includes('Creature'));assert.notEqual(event.card.zone,'battlefield');
    assert.ok(context.sacrificeEvidence.some(row=>row.card===event.card&&row.player===a&&row.from==='battlefield'),label+': legal sacrifice went through engine');return 5;
  }
  if(effect.action==='monstrosity-v8'){
    const n=effect.n==='X'?before.oracleX:effect.n;assert.equal(source.meta.oracleMonstrous,true,label+': source actually becomes monstrous');assert.equal(source.meta.oracleMonstrosityX,n,label+': exact remembered X');assert.equal(source.counters['+1/+1']||0,(before.cards.get(source).counters['+1/+1']||0)+n,label+': exact Monstrosity counters');return 3;
  }
  if(effect.action==='no-hand-limit-v8'){
    assert.equal(before.players.get(a).noMaxHandForever,false,label+': permission not previously active');
    assert.equal(a.noMaxHandForever,true,label+': resolving effect grants permanent permission');
    assert.equal(game.maximumHandSize(a),Infinity,label+': live cleanup limit');return 3;
  }
  if(effect.action==='choose-damage-source-v8'){
    const shield=game.untilEffects.find(row=>row.kind==='oracleChosenSourcePrevention'&&row.sourceCard===source&&!row.consumed);
    assert.ok(shield,label+': source choice creates a finite shield');
    const selected=shield.sourceRecord.card,target=shield.target||a;
    const choice=trace.find(row=>row.query.aiHint?.kind==='damagePreventionSource');assert.ok(choice,label+': controller chooses the damage source');
    const beforeLife=a.life,beforeExile=a.exile.length,expected=effect.half?3:0;
    assert.equal(await game.damageAny(selected,target,5,{deferSBA:true,combat:!!effect.combat}),expected,label+': exact amount prevented');
    assert.equal(shield.consumed,!effect.allTurn,label+': printed next-event or whole-turn duration');
    if(effect.after==='gain-life')assert.equal(a.life-beforeLife,5-expected-(target===a?expected:0),label+': life from actual prevention');
    if(effect.after==='exile-library')assert.equal(a.exile.length-beforeExile,5-expected,label+': cards from actual prevention');
    assert.equal(await game.damageAny(selected,target,1,{deferSBA:true,combat:!!effect.combat}),effect.allTurn?0:1,label+': later damage respects printed duration');
    return 4;
  }
  if(effect.action==='clash-v8'){
    const rows=context.clashEvidence.slice(before.clashEvidenceIndex||0).filter(row=>row.result?.source===source);
    const row=rows[0];assert.ok(row,label+': actual clash resolves');
    const result=row.result;assert.ok(result.opponent&&result.revealed.length,label+': actual opponent and simultaneous reveal');
    assert.equal(result.won,context.proofBranch!==false,label+': staged public card values exercise the declared branch');
    const placement=trace.filter(row=>row.query.aiHint?.kind==='clashPlace');assert.ok(placement.length,label+': real controller placement decision');
    const snapshot={...row.before,oracleX:before.oracleX};
    for(const [card,state]of before.cards)if(!snapshot.cards.has(card))snapshot.cards.set(card,state);
    for(const child of result.won?effect.effects:effect.elseEffects)await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,snapshot,trace,label+'/clash-branch');
    return 3;
  }
  if(effect.action==='coin-flip-v8'){
    const allRows=context.coinEvidence.slice(before.coinEvidenceIndex||0).filter(row=>row.result?.source===source);
    // A losing flip can sacrifice its source and put a separate death-trigger
    // flip on the Stack. Bind this instruction to its own first result cohort.
    const rows=allRows.slice(0,effect.repeat?allRows.findIndex(row=>row.result.won===false)+1:1);
    assert.ok(rows.length,label+': actual random flip');
    for(const row of rows){assert.ok(['heads','tails'].includes(row.result.call));assert.equal(row.result.won,row.result.heads===(row.result.call==='heads'));}
    if(effect.repeat){assert.equal(rows.at(-1).result.won,false);assert.ok(rows.slice(0,-1).every(row=>row.result.won));}
    else assert.equal(rows.length,1);
    for(const child of(rows.at(-1).result.won?effect.effects:effect.elseEffects))await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/coin-branch');
    for(const child of effect.afterEffects||[]){const actual=child.n?.kind==='coin-wins-v8'?{...child,n:rows.filter(row=>row.result.won).length*(child.n.multiply??1)}:child;await assertGenericEffectEvidence(MTG,context,entry,actual,source,selectedTargets,damagedPlayer,before,trace,label+'/coin-total');}
    return 1;
  }
  const runtimeEffect=context.proofRuntimeEffects?.get(effect)||effect;
  if(effect.action==='repeat-v14'){
    const n=effect.n==='X'?before.oracleX:effect.n,expected=new Map(game.players.map(player=>[player,before.players.get(player).life]));
    for(const child of effect.effects){const group=['each-player','each-opponent'].includes(child.who),players=group?game.players.filter(player=>child.who==='each-player'||player!==a):[genericEffectPlayer(child,selectedTargets,source,a,damagedPlayer,context)];
      const records=(context.paymentWitnesses||[]).filter(row=>!row.verified&&row.source===source&&row.effect.unlessV14&&JSON.stringify(row.effect.payment)===JSON.stringify(child.payment)).slice(0,n*players.length);assert.equal(records.length,n*players.length,label+': every repetition asks every affected player');
      for(const row of records){assert.ok(players.includes(row.player));await assertPaymentEffect(MTG,context,entry,row.effect,source,selectedTargets,damagedPlayer,before,trace,label+'/repeated-payment',v8Helpers());if(!row.branches[0]?.paid)expected.set(row.player,expected.get(row.player)-child.effects[0].n);}
    }
    for(const [player,life]of expected)assert.equal(player.life,life,label+': all declined repetitions lose exactly the printed life');return;
  }
  if(effect.action==='unless-cost-v14'){
    const candidates=(context.paymentWitnesses||[]).filter(row=>!row.verified&&row.source===source&&row.effect.unlessV14&&JSON.stringify(row.effect.payment)===JSON.stringify(effect.payment));
    const grouped=['each-player','each-opponent'].includes(effect.who),any=effect.who==='any-player-v14';
    const needed=grouped?game.players.filter(p=>effect.who==='each-player'||p!==a).length:any?candidates.findIndex(row=>row.branches[0]?.paid)+1||candidates.length:1;
    const rows=candidates.slice(0,needed);assert.equal(rows.length,needed,label+': every payer has real resolution evidence');assert.ok(rows.length,label+': payment decision is reached');
    for(const row of rows)await assertPaymentEffect(MTG,context,entry,row.effect,source,selectedTargets,damagedPlayer,before,trace,label+'/payment-'+row.player.idx,v8Helpers());
    const unpaid=any?(rows.some(row=>row.branches[0]?.paid)?[]:[rows.at(-1)]):rows.filter(row=>!row.branches[0]?.paid);
    for(const row of unpaid){const index=selectedTargets.length,bind=value=>Array.isArray(value)?value.map(bind):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['target','who'].includes(key)&&item===effect.who&&grouped?index:key==='operation'?item:bind(item)])):value;
      const snapshot=row.after;
      for(const child of grouped?bind(effect.effects):effect.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,grouped?[...selectedTargets,row.player]:selectedTargets,damagedPlayer,snapshot,trace,label+'/unpaid-'+row.player.idx);
    }
    for(const row of rows.filter(row=>row.branches[0]?.paid))for(const child of effect.paidEffectsV14||[])await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,row.after,trace,label+'/paid-effect');
    return;
  }
  if(effect.action==='zone-random-v14'){
    const player=genericEffectPlayer(effect,selectedTargets,source,a,damagedPlayer,context),cards=before.players.get(player)[effect.zone+'Cards'].filter(card=>!effect.filterV15||matchesTarget(card,{...effect.filterV15,zone:card.zone},context,source));
    assert.ok(cards.length,label+': random selection has graveyard witnesses');const moved=context.moveEvidence.slice(before.moveEvidenceIndex).filter(row=>cards.includes(row.card)&&row.from===effect.zone&&row.to===effect.destination);
    assert.equal(moved.length,Math.min(effect.n==='X'?before.oracleX:effect.n,cards.length),label+': exact random return quantity');assert.equal(new Set(moved.map(row=>row.card)).size,moved.length);return;
  }
  if(assertRevealed(MTG,context,runtimeEffect,source,label))return;
  if(assertCardResults(MTG,context,runtimeEffect,source,label))return;
  if(assertStackCopyEffect(MTG,context,runtimeEffect,source,label))return;
  if(await assertPaymentEffect(MTG,context,entry,runtimeEffect,source,selectedTargets,damagedPlayer,before,trace,label,v8Helpers()))return;
  if(await assertCopyLinkedEffect(MTG,context,entry,runtimeEffect,label,v8Helpers())){
    if(runtimeEffect.action==='copy-token-v8'){
      const proof=context.copyLinkedProof.pending.findLast(row=>row.effect===runtimeEffect||JSON.stringify(row.effect)===JSON.stringify(runtimeEffect));
      assert.ok(proof,label+': copy proof recorded its exact created batch');
      const cards=proof.made.map(row=>row.card);before.createdTokenBatch={cards};
      const index=context.tokenCreationEvidence.findLastIndex(row=>row.cards?.some(card=>cards.includes(card)));
      if(index>=0)before.tokenProofCursor=index+1;
    }
    return;
  }
  if(await assertMultizoneSearch(MTG,context,runtimeEffect,source,label))return;
  if(await assertPlayPermission(MTG,context,runtimeEffect,source,label))return;
  if(await assertEnergy(MTG,context,runtimeEffect,source,label))return;
  if(await assertV8Effect(MTG,context,entry,runtimeEffect,source,selectedTargets,damagedPlayer,before,trace,label,v8Helpers()))return;
  if(assertTemptingOffer(context,effect,source,label))return;
  if(assertNameSearch(context,effect,source,label))return;
  if(assertNameGroup(context,effect,source,label))return;
  if(effect.action==='create-token-group-v8'){
    const cards=[];
    for(const [index,child]of effect.effects.entries()){
      await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/token-'+index);
      cards.push(...before.createdTokenBatch?.cards||[]);
    }
    before.createdTokenBatch={cards};
    return;
  }
  if(effect.action==='recruit-v9'){
    const choice=trace.findLast(row=>row.query.type==='chooseCards'&&row.query.prompt==='Recruit: discard a card');assert.ok(choice,label+': real Recruit discard choice');assert.equal(choice.result.length,1);assert.notEqual(choice.result[0].zone,'hand');
    assert.ok(context.drawEvidence.some(row=>row.player===a&&row.n===1&&row.drawn===1),label+': real Recruit draw');
    const made=game.bf().filter(c=>!before.battlefield.includes(c)&&c.isToken&&c.hasSub('Human')&&c.hasSub('Soldier'));
    assert.equal(made.length,choice.result[0].is('Land')?0:1,label+': nonland discard creates a Human Soldier');return;
  }
  if(effect.action==='player-shroud-v9'){
    for(const player of [a,b])assert.equal(game.legalTargets({what:'player'},source,player).includes(a),false,label+': every player is prevented from targeting the protected player');return;
  }
  if(effect.action==='give-control-v9'){
    const player=genericEffectPlayer(effect,selectedTargets,source,a,damagedPlayer,context);
    for(const card of [genericEffectTarget(effect,selectedTargets,source,context)].flat()){assert.notEqual(before.cards.get(card).ctrl,player,label+': a transfer was staged');assert.equal(card.ctrl,player,label+': announced player gains control');}return;
  }
  if(effect.action==='exchange-control-v9'){
    const resolve=ref=>ref==='self'?source:selectedTargets[ref],cards=effect.group?[resolve(effect.target)].flat():[resolve(effect.target),resolve(effect.otherTarget)];
    assert.equal(cards.length,2);assert.notEqual(before.cards.get(cards[0]).ctrl,before.cards.get(cards[1]).ctrl,label+': two different controllers were staged');
    assert.equal(cards[0].ctrl,before.cards.get(cards[1]).ctrl);assert.equal(cards[1].ctrl,before.cards.get(cards[0]).ctrl);return;
  }
  const subject = genericEffectTarget(effect, selectedTargets, source, context);
  if(assertRoleToken(context,effect,source,subject,before,label))return;
  recordSourceDuration(context,effect,source,subject,label);
  if(await assertDelayedObjects(MTG,context,entry,effect,source,selectedTargets,damagedPlayer,before,trace,label,{...v8Helpers(),subject:reference=>genericEffectTarget({target:reference},selectedTargets,source,context)}))return;
  if(effect.action==='install-trigger-v8'){
    const installed=game.delayed.find(row=>row.src===source&&JSON.stringify(row.oracleOperation)===JSON.stringify(effect));
    assert.ok(installed,label+': actual delayed trigger installed');assert.equal(installed.ctrl,a);assert.equal(installed.expires,'eot');
    const trigger=effect.trigger;
    for(const [index,target]of(trigger.targets||[]).entries())if(target.zone==='stack')await stageGenericStackTarget(MTG,context,target,index);else stageGenericTarget(MTG,context,target,'delayed-'+index);
    stageCondition(MTG,context,trigger.condition,source,v5Helpers());
    for(const child of flattenProofEffects(trigger.effects)){
      for(const key of ['n','multiplier','power','toughness'])if(child[key]&&typeof child[key]==='object'&&!JSON.stringify(child[key]).includes('event-'))stageCount(MTG,context,child[key],v5Helpers());
      stageEnergy(MTG,context,child,v8Helpers());stageRevealed(MTG,context,child,v8Helpers());stageV8Effect(MTG,context,child,v8Helpers());stageCopyLinkedEffect(MTG,context,child,v8Helpers());stagePlayPermission(MTG,context,child,v8Helpers());stageMultizoneSearch(MTG,context,child,v8Helpers());stagePaymentEffect(MTG,context,child,v8Helpers());
    }
    fund(a);await fireGenericEvent(MTG,context,source,trigger);await game.flushTriggers();
    const object=game.stack.find(row=>row.kind==='trigger'&&row.run===installed.run);
    assert.ok(object,label+': a later actual event creates the delayed Stack ability');assert.equal(object.ctrl,a);
    context.eventCard=object.ctx?.oracleSourceCapture?.eventCard||object.ctx?.data?.card;context.eventPlayer=object.ctx?.oracleSourceCapture?.eventPlayer||object.ctx?.data?.player;context.eventAmount=object.ctx?.oracleSourceCapture?.eventAmount??object.ctx?.data?.n;context.eventController=object.ctx?.oracleSourceCapture?.eventController;
    const snapshot=genericProofSnapshot(context,[source,context.eventCard,...(object.targets||[]).flat().filter(target=>target instanceof MTG.CardInst)]);
    snapshot.oracleX=object.ctx?.x||0;
    await resolveAll(game);
    for(const child of trigger.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,object.targets||[],context.eventPlayer,snapshot,trace,label+'/future');
    assert.equal(game.delayed.includes(installed),!effect.once,label+': once or repeatable lifetime respected');return;
  }
  if(effect.action==='linked-untap-v8'){const cards=[subject].flat().filter(Boolean);assert.ok(cards.length,label+': real locked object');for(const card of cards){assert.equal(card.cur.cantUntap,true,label+': untap-step restriction applies');assert.ok(game.untilEffects.some(row=>row.kind==='oracleUntapLock'&&row.iid===card.iid&&row.zoneVersion===card.zoneVersion&&row.sourceIid===source.iid&&row.sourceVersion===source.zoneVersion&&row.mode===effect.mode),label+': restriction uses exact source and target incarnations');}return;}
  if(effect.action==='extra-turn-v8'){assert.deepEqual(Array.from(game.extraTurns||[],p=>p.idx),[...Array(effect.n??1).fill(subject.idx),...before.extraTurns.map(p=>p.idx)],label+': exact extra turn beneficiary and newest-first order');return;}
  if(effect.action==='extra-phase-v8'){const applies=effect.after==='any'||effect.after==='main'&&['main1','main2'].includes(before.phase)||effect.after==='combat'&&before.phase==='combat';assert.deepEqual(Array.from(game._additionalPhases||[],row=>row.kind),[...(applies?effect.phases:[]),...before.additionalPhases],label+': inserted ordered phase sequence');return;}
  if(effect.action==='choose-keyword'){
    const choice=trace.find(row=>row.query.prompt==='Choose a keyword');assert.ok(choice,label+': keyword choice reaches actual controller');assert.ok(effect.choices.includes(choice.result));for(const card of [subject].flat()){assert.equal(card.kw(choice.result),true,label+': selected keyword granted');const old=choice.keywordBefore?.get(card);assert.ok(old,label+': characteristics recorded at the actual keyword choice');assert.equal(card.power,old.power+effect.power);assert.equal(card.toughness,old.toughness+effect.toughness);}return;
  }
  if(effect.action==='backup'){
    const card=subject;assert.equal(card.counters['+1/+1'],(before.cards.get(card)?.counters['+1/+1']||0)+effect.n,label+': backup counter placed');
    for(const keyword of effect.keywords)assert.ok(card.kw(keyword),label+': printed below-backup keyword available');
    if(card!==source)for(const operation of effect.operations)await grantedEffectProof(MTG,context,entry,{target:effect.target,operation},source,selectedTargets,trace,label+'/backup');return;
  }
  if(effect.action==='exile-source'){assert.equal(source.zone,source.isToken?'ceased':'exile',label+': exact source exiled');if(source.isToken)assert.ok(context.moveEvidence.some(row=>row.card===source&&row.to==='exile'&&row.from==='battlefield'),label+': token actually entered exile before ceasing');return;}
  if(effect.action==='exile-resolving-spell'){assert.equal(source.zone,'exile',label+': resolving spell exiles itself');return;}
  if(effect.action==='library-resolving-spell-v15'){assert.equal(source.zone,'library');assert.equal(source.owner.library[0],source,label+': resolving original spell goes to the bottom');return;}
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
  if(effect.action==='discard-redraw-v12'){
    if(effect.simultaneousV15){
      for(const p of game.apnapFrom(game.turnPlayer||a).filter(p=>effect.who==='each-player'||p!==a)){
        const choice=trace.find(row=>row.query.type==='chooseCards'&&row.query.player===p&&row.query.prompt==='Discard cards, then draw that many');
        if(!before.players.get(p).handCards.length)continue;
        assert.ok(choice,label+': every player chooses their own cards');assert.equal(new Set(choice.result).size,choice.result.length);
        const discarded=context.moveEvidence.slice(before.moveEvidenceIndex).filter(row=>choice.result.includes(row.card)&&row.from==='hand');assert.equal(discarded.length,choice.result.length);
        assert.ok(!choice.result.length||context.drawEvidence.some(row=>row.player===p&&row.n===choice.result.length),label+': redraw follows that player’s discard count');
      }return;
    }
    const choice=trace.findLast(row=>row.query.type==='chooseCards'&&row.query.prompt==='Discard cards, then draw that many');
    assert.ok(choice,label+': resolution chooses the discard count');assert.equal(new Set(choice.result).size,choice.result.length);
    assert.ok(choice.result.length<=Math.min(choice.query.from.length,effect.max==='all'?choice.query.from.length:effect.max));
    for(const card of choice.result)assert.ok(context.moveEvidence.some(row=>row.card===card&&row.from==='hand'),label+': chosen card was discarded');
    const drawn=choice.result.length+effect.bonus;
    assert.ok(context.drawEvidence.some(row=>row.player===player&&row.n===drawn&&row.drawn===Math.min(drawn,before.players.get(player).library))||drawn===0,label+': exact redraw amount');return;
  }
  if(effect.action==='discard-hand-draw'){
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(p=>p!==a):[player];
    for(const p of players){const old=before.players.get(p),draw=Math.max(0,(effect.n==='discarded'?old.handCards.length:effect.n)+(effect.adjustV15||0));assert.ok(old.handCards.every(card=>card.zone!=='hand'),label+': original hand discarded');assert.equal(p.library.length,old.library-Math.min(draw,old.library),label+': redraw uses this player\'s count');}return;
  }
  const amount=(value,snapshot=before)=>{
    if(value?.kind==='product-v16')return amount(value.left,snapshot)*amount(value.right,snapshot);
    if(value?.kind==='result-count-v16')return context.oracleResultCountV16||0;
    if(value==null)return 0;
    if(typeof value==='number')return value;
    if(value==='X')return before.oracleX??1;
    if(typeof value!=='object')return effectAmount(value,1);
    if(value.kind==='combat-attacked-opponents-v8')return new Set((game.combat?.declaredAttackTargets||[]).filter(player=>player instanceof MTG.Player&&player!==a)).size;
    if(value.kind==='combat-blocker-count-v8'){
      const attacker=value.subject==='event-card'?context.eventCard:source;
      return attacker?.attacking?game.bf().filter(card=>card.blocking===attacker.iid&&card.is('Creature')).length*value.multiply:0;
    }
    if(value.kind==='counter-payment-v8'){assert.ok(Number.isSafeInteger(context.oracleCounterPaidAmount),label+': exact prior paid counter record');return context.oracleCounterPaidAmount*value.multiply;}
    if(value.kind==='payment-stat')return Math.max(0,Number(context.oraclePaymentCapture?.cards?.[0]?.before?.[value.stat])||0)*(value.multiply??1);
    if(value.kind==='payment-count')return Math.max(0,Number(context.oraclePaymentCapture?.count)||0)*(value.multiply??1);
    if(value.kind==='sacrificed-stat')return Math.max(0,context.sacrificeEvidence.at(-1)?.[value.stat]||0);
    if(value.kind==='grave-source-power')return Math.max(0,(snapshot.cards.get(source)?.power??Number(entry.raw.power))||0);
    if(value.kind==='v8-target-permanent-count'){const target=genericEffectTarget({target:value.target},selectedTargets,source,context);return countValue(context,target,value.count,snapshot)*(value.multiply??1);}
    if(value.kind==='target-stat'){
      const target=[selectedTargets[value.target]].flat()[0];
      if(target?.kind==='spell'&&value.stat==='mv'){const values=snapshot.stackManaValues.has(target)?snapshot.stackManaValues:before.stackManaValues;assert.ok(values.has(target),label+': prior spell mana value captured');return values.get(target);}
      const initial=before.cards.get(target),current=snapshot.cards.get(target);
      const departed=context.moveEvidence.findLast(row=>row.card===target&&row.before.zoneVersion===initial?.zoneVersion);
      const captured=current&&(!initial||current.zoneVersion===initial.zoneVersion)?current:departed?.before||initial;
      return Math.max(0,captured?.[value.stat]||0);
    }
    if(value.kind==='target-count'){const target=genericEffectTarget({target:value.target},selectedTargets,source,context);return countValue({...context,a:target},source,value.count,snapshot)*(value.multiply??1);}
    if(value.kind==='affected-player-count'){
      const n=countValue({...context,a:player},source,value.count,snapshot)*(value.multiply??1);
      return value.divide?Math[value.round==='up'?'ceil':'floor'](Math.max(0,n)/value.divide):n;
    }
    if(value.kind==='signed')return value.sign*amount(value.value,snapshot);
    if(value.kind==='source-devoured-v9')return source.meta.oracleDevoured??context.moveEvidence.findLast(row=>row.card===source&&row.from==='battlefield')?.before.devouredV9??0;
    if(value.kind==='paid-times')return source.castMeta?.paidTimes||0;
    if(value.kind==='paid-colors')return new Set((source.castMeta?.paymentColors||[]).filter(color=>'WUBRG'.includes(color))).size*(value.multiply??1);
    if(value.kind==='sum')return value.values.reduce((sum,v)=>sum+amount(v,snapshot),0)*(value.multiply??1);
    if(value.kind==='event-card-counters')return (context.eventCardBefore?.counters?.[value.counter]||0)*(value.multiply??1);
    if(value.kind==='event-card-stat')return Math.max(0,context.eventCardStats?.[value.stat]??context.eventCardBefore?.[value.stat]??0);
    if(value.kind==='event-spell-mv-v10')return context.eventSpellMvV10??context.eventCardBefore?.mv??0;
    if(value.kind==='result-stat-v18')return context.oracleResultRowV16?.view[value.stat]||0;
    if(value.kind==='event-mana-spent-v10')return context.eventManaSpentV10??0;
    if(value.kind==='cast-mana-spent-v10')return source.castMeta?.manaSpent||0;
    if(value.kind==='difference-v10')return Math.max(0,amount(value.left,snapshot)-amount(value.right,snapshot));
    if(value.kind==='source-counters'){
      const recorded=snapshot.cards.get(source),left=recorded?.zone!=='battlefield'&&context.moveEvidence.findLast(row=>row.card===source&&row.from==='battlefield');
      return ((left?left.before:recorded)?.counters?.[value.counter]||0)*(value.multiply??1);
    }
    if(['v8-permanent-count','count','max-stat','source-counters','died-count','devotion','party','turn-count','attacked-creature-count-v10','source-attachments','opponent-poison-total','opponent-count','creature-total-power','casting-live-count-v8','casting-turn-count-v8'].includes(value.kind))return countValue(context,source,value,snapshot)*(value.multiply??1);
    if(['source-stat','explicit-source-stat'].includes(value.kind))return Math.max(0,snapshot.cards.get(source)?.[value.stat]??Number(entry.raw[value.stat]));
    if(value.kind==='event-amount')return context.eventAmount??2;
    if(value.kind==='fraction-v9')return (value.round==='up'?Math.ceil:Math.floor)(amount(value.value)/value.denominator);
    if(value.kind==='batch-amount-v9'){assert.ok(context.batchAmountV9>0,label+': actual matching event cohort was staged');return context.batchAmountV9;}
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
  if(action==='lose-game-v10'){assert.equal(a.lost,true,label+': affected player loses through the rules engine');return;}
  if(action==='delay-v10'){
    const delayed=game.delayed.find(row=>row.src===source&&JSON.stringify(row.oracleDelayV10)===JSON.stringify(effect));assert.ok(delayed,label+': future instruction is installed');
    const eventPlayer=effect.your?a:b;
    if(effect.your){await game.emit(effect.on,{player:b});await resolveAll(game);assert.ok(game.delayed.includes(delayed),label+': opponents event does not consume your next step');}
    const snapshot=genericProofSnapshot(context,[source]);
    await game.emit(effect.on,{player:eventPlayer});await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source),label+': delayed instruction uses the Stack');
    await resolveAll(game);assert.equal(game.delayed.includes(delayed),false,label+': delayed instruction fires once');
    for(const child of effect.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,[],b,snapshot,trace,label+'/delayed');return;
  }
  if(action==='uncounterable-spell-v10'){const object=selectedTargets[effect.target];assert.equal(object.oracleCantCounterV10,true,label+': the chosen spell gains the prohibition');assert.equal(MTG.isUncounterable(game,object),true);return;}
  if(action==='next-uncounterable-v10'){
    assert.ok(game.untilEffects.some(row=>row.kind==='nextUncounterableV10'&&row.who===a&&row.quality===effect.quality),label+': pending cast permission');
    fund(a,100);const spell=zoneCard(MTG,a,effect.quality==='instant-sorcery'?'Dark Ritual':'Grizzly Bears','hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);
    const object=game.stack.find(row=>row.card===spell);assert.equal(await game.counterStackObject(object),false,label+': the next matching spell cannot be countered');assert.equal(game.untilEffects.some(row=>row.kind==='nextUncounterableV10'&&row.who===a&&row.quality===effect.quality),false);await resolveAll(game);return;
  }
  if(action==='no-prevention-v10'){assert.ok(game.untilEffects.some(row=>row.kind==='noDamagePrevention'&&row.expires==='eot'),label+': prevention prohibition lasts this turn');return;}
  if(action==='with-x-v10'){
    const value=amount(effect.value),bind=node=>{if(node?.kind==='bound-x-v10')return value;if(Array.isArray(node))return node.map(bind);if(!node||typeof node!=='object')return node;const copy=Object.fromEntries(Object.entries(node).map(([key,child])=>[key,bind(child)]));for(const fixtures of [context.groupFixtures,context.zoneFixtures])if(fixtures?.has(node))fixtures.set(copy,fixtures.get(node));return copy;};
    for(const child of bind(effect.effects))await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/bound-X');
    return;
  }
  if(action==='kinship-v10'){
    const top=context.kinshipTopV10;assert.ok(top,label+': matching top card was staged');
    assert.ok(context.revealEvidence.some(row=>row.kind==='look'&&row.ctrl===a&&row.cards.includes(top)),label+': private look');
    assert.ok(context.revealEvidence.some(row=>row.kind==='reveal'&&row.cards.includes(top)),label+': matching card is actually revealed');
    for(const child of effect.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/kinship');return;
  }
  if(action==='radiance-v10'){
    const target=selectedTargets[effect.target],colors=before.cards.get(target).colors,matching=before.battlefield.filter(card=>card===target||before.cards.get(card).types.includes(effect.what[0].toUpperCase()+effect.what.slice(1))&&before.cards.get(card).colors.some(color=>colors.includes(color)));
    if(colors.length)assert.ok(matching.length>=2,label+': primary and nontargeted secondary share a color');else assert.equal(matching.length,1,label+': a colorless primary affects only itself');
    for(const card of matching)for(const child of effect.effects)await assertGenericEffectEvidence(MTG,{...context,proofEffects:effect.effects},entry,child,source,[card],damagedPlayer,before,trace,label+'/radiance');return;
  }
  if(action==='airbend-v10'){
    for(const card of [subject].flat().filter(Boolean)){
      assert.equal(card.zone,card.isToken?'ceased':'exile',label+': airbend exiles the selected permanent');
      if(!card.isToken){assert.equal(game.oracleAirbendAvailable(card.owner,card),true);for(const other of game.players.filter(player=>player!==card.owner))assert.equal(game.oracleAirbendAvailable(other,card),false);}
    }return;
  }
  if(action==='earthbend-v10'){
    const animation=context.animationEvidence.find(row=>row.card===subject&&row.effect.power===0&&row.effect.toughness===0&&row.effect.keywords?.includes('haste')&&!context.usedAnimationEvidence.has(row));
    assert.ok(animation,label+': earthbend animates the actual chosen land');context.usedAnimationEvidence.add(animation);
    const snap=animation.before,views=new Map(snap.battlefield.map(card=>{const old=snap.cards.get(card);return [card,{...card,...old,is:type=>old.types.includes(type),hasSub:type=>old.subtypes.includes(type),kw:keyword=>old.keywords.includes(keyword)}];}));
    const stable={...snap,battlefield:snap.battlefield.map(card=>views.get(card)),cards:new Map([...snap.cards].map(([card,state])=>[views.get(card)||card,state]))};
    const expected=typeof effect.n==='object'&&['count','sum','max-stat','creature-total-power'].includes(effect.n.kind)?countValue(context,views.get(source)||source,effect.n,stable):amount(effect.n,snap);
    const row=context.counterChangeEvidence.slice(before.counterChangeEvidenceIndex).find(row=>row.card===subject&&row.action==='counter'&&row.kind==='+1/+1'&&row.n===expected&&!context.usedCounterChanges.has(row));
    assert.ok(row,label+': earthbend puts exactly the computed number of counters on its land');context.usedCounterChanges.add(row);
    assert.equal(row.after-row.before,expected,label+': earthbend counter increase');
    if(subject.zone==='battlefield'&&subject.zoneVersion===row.zoneVersion){assert.equal(subject.is('Land'),true);assert.equal(subject.is('Creature'),true);assert.equal(subject.kw('haste'),true);assert.ok(subject.cur.extraTriggers.length,label+': lasting return ability granted');}
    else assert.ok(context.moveEvidence.some(move=>move.card===subject&&move.from==='battlefield'),label+': zero-toughness earthbent land used state-based actions');
    return;
  }
  if(action==='pump-group'&&effect.filters){
    for(const [card,old]of before.cards)if(old.zone==='battlefield'&&card.is('Creature')){
      const view={...card,...old,is:t=>old.types.includes(t),hasSub:t=>old.subtypes.includes(t),kw:k=>old.keywords.includes(k)};
      const affected=effect.filters.some(f=>matchesTarget(view,f,context,source));
      assert.equal(card.power,old.power+(affected?amount(effect.power):0),label+': chosen group power');
      assert.equal(card.toughness,old.toughness+(affected?amount(effect.toughness):0),label+': chosen group toughness');
    }return;
  }
  if (action === 'divided-damage-v8'||action==='divided-counters-v16') {
    const targets = [selectedTargets[effect.target]].flat().filter(Boolean);
    const allocations = (context.oracleAnnouncementTrace || trace).filter(row => row.query.type === 'chooseX' && row.query.allocation?.kind === 'damage' &&
      row.query.allocation.source === source && row.query.allocation.targets.length === targets.length &&
      row.query.allocation.targets.every(target => targets.includes(target)));
    if (!targets.length) {assert.equal(n,0,label+': nonzero divided damage proof must exercise an actual target');return;}
    assert.equal(allocations.length,targets.length,label+': every selected target receives an announcement allocation');
    assert.ok(allocations.every(row=>row.query.allocation.total===n),label+': complete source amount is fixed while announcing');
    const expected = allocations.map(row=>({target:row.query.allocation.targets[row.query.allocation.index],
      n:Math.max(row.query.min,Math.min(Number(row.result)||row.query.min,row.query.max))}));
    assert.equal(expected.reduce((sum,row)=>sum+row.n,0),n,label+': announced positive allocations consume the exact total');
    assert.ok(expected.every(row=>row.n>=1),label+': no zero-damage targets');
    if(action==='divided-counters-v16'){
      for(const hit of expected){const witness=context.counterChangeEvidence.slice(before.counterChangeEvidenceIndex).find(row=>row.card===hit.target&&row.action==='counter'&&row.kind===effect.counter&&row.n===hit.n&&!context.usedCounterChanges.has(row));assert.ok(witness,label+': exact announced counter allocation');context.usedCounterChanges.add(witness);}return;
    }
    const witness = context.batchEvidence.slice(before.batchEvidenceIndex||0).find(row=>row.hits.length===expected.length &&
      expected.every(hit=>row.hits.some(actual=>actual.target===hit.target&&actual.n===hit.n&&actual.src.iid===source.iid)));
    assert.ok(witness,label+': one simultaneous damage batch uses the exact announced target allocations');
    assert.ok(witness.actual>0,label+': allocation produces actual damage');
    context.lastDamageProofTotal=witness.actual;
    return;
  }
  if(action==='grant-flash-turn-v8'){assertTemporaryFlash(MTG,context,effect,v5Helpers(),label);return;}
  if(action==='return-died-source-v8'){
    const death=context.moveEvidence.find(row=>row.card===source&&row.from==='battlefield'&&row.to==='graveyard'&&row.before.zoneVersion===before.cards.get(source)?.zoneVersion);
    assert.ok(death,label+': granted trigger follows the actual death');
    if(source.isToken){assert.equal(source.zone,'ceased',label+': token cannot return');return;}
    const returned=context.moveEvidence.find(row=>row.card===source&&row.from==='graveyard'&&row.to==='battlefield'&&row.before.zoneVersion===death.after.zoneVersion);
    assert.ok(returned,label+': exactly the graveyard incarnation returns');
    assert.equal(source.zone,'battlefield');assert.equal(source.ctrl===source.owner,true,label+': returned under owner control');
    if(effect.tapped)assert.equal(source.tapped,true,label+': returned tapped');
    if(effect.counter)assert.equal(source.counters[effect.counter],1,label+': printed additional entry counter');
    return;
  }
  if(action==='damage-batch'){
    const expectedFor=snapshot=>{
      const expected=[];
      for(const hit of effect.hits){
        const view=card=>{const saved=snapshot.cards.get(card);return saved?{...card,...saved,is:type=>saved.types.includes(type),hasSub:type=>saved.subtypes.includes(type),kw:keyword=>saved.keywords.includes(keyword)}:card;};
        const recipients=hit.filters?snapshot.battlefield.filter(card=>(!hit.controllerPlayerV17||[selectedTargets[hit.controllerPlayerV17.target]].flat().includes(card.ctrl))&&hit.filters.some(filter=>matchesTarget(view(card),filter,context,source))):hit.target==='each-player'?game.players.slice():hit.target==='each-opponent'?game.players.filter(player=>player!==a):[genericEffectTarget(hit,selectedTargets,source,context)].flat().filter(Boolean);
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
  if(action==='counter-spells'){const objects=context.counterGroupFixtures.get(effect);assert.ok(objects?.length,label+': actual spell group staged');for(const object of objects){assert.ok(context.counterEvidence.some(row=>row.object===object&&row.result===true),label+': actual group spell was countered');assert.equal(game.stack.includes(object),false);}if(effect.drawCounteredV18)assert.equal(context.drawEvidence.slice(before.drawEvidenceIndex).filter(row=>row.player===a).reduce((sum,row)=>sum+row.drawn,0),objects.length,label+': one real draw per countered spell');return;}
  if(action==='combat-mana'){assert.equal(a.pool.R,before.players.get(a).pool.R+n,label+': firebending adds exact red mana');assert.ok(a.poolMeta.some(row=>row.color==='R'&&row.persist==='combat'&&row.n===n),label+': mana retention is attached to the produced units');return;}
  if(action==='combat-restriction'){
    const bindX=filter=>({...filter,...(filter.threshold==='X'?{threshold:before.oracleX}:{}),...(filter.alternatives?{alternatives:filter.alternatives.map(bindX)}:{})});
    const cards=effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(card,bindX(filter),context,source))):[subject].flat().filter(Boolean);
    if(!cards.length&&typeof effect.target==='number'){
      // "Those creatures" follows an up-to-N group: an empty legal group
      // leaves nothing to restrict, so the printed rule is already satisfied.
      const owner=(entry.implementation||[]).find(candidate=>(candidate.effects||[]).includes(effect));
      if(owner?.targets?.[effect.target]?.min===0)return;
    }
    assert.ok(cards.length,label+': combat recipients exist');for(const card of cards)if(card.zone==='battlefield'){
      assert.ok(game.untilEffects.some(row=>row.kind==='oracleCombatRestriction'&&row.iid===card.iid&&row.zoneVersion===card.zoneVersion&&row.expires===(effect.duration?.startsWith('source-controlled')?'sourceDuration':effect.duration==='next-turn'?'untilTurnOf':effect.duration)&&(effect.duration!=='next-turn'||row.whoTurn===a)),label+': exact object and duration recorded');
      await combatRestrictionProof(MTG,context,card,effect.restriction,v5Helpers(),label);
    }return;
  }
  if(action==='exile-top'){
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(player=>player!==a):[genericEffectPlayer(effect,selectedTargets,source,a,damagedPlayer,context)];
    for(const player of players){const moves=context.moveEvidence.slice(before.moveEvidenceIndex).filter(row=>row.card.owner===player&&row.from==='library'&&row.to==='exile');const cards=moves.map(row=>row.card);assert.equal(moves.length,Math.min(n,moves[0]?.priorLibrarySize??before.players.get(player).libraryCards.length),label+': exact top exile count');for(const row of moves)assert.equal(row.card===row.priorLibraryTop,true,label+': top card at the time of exile');for(const card of cards){assert.equal(card.zone,'exile',label+': top card exiled');if(effect.permission){assert.equal(card.meta.playableBy,a);assert.equal(card.meta.spellsOnly,!!effect.permission.spellsOnly);assert.equal(card.meta.anyColor,!!effect.permission.anyColor);}else assert.equal(card.meta.playableBy,undefined);}}return;
  }
  if(action==='owner-library-choice'){
    const decision=trace.find(row=>row.query.aiHint?.kind==='oracleLibraryChoice');assert.ok(decision,label+': owner chooses placement');assert.equal(subject.zone,subject.isToken?'ceased':'library');if(!subject.isToken)assert.equal((decision.result==='bottom'?subject.owner.library[0]:subject.owner.library.at(-1)).iid,subject.iid);return;
  }
  if(action==='inspect-top'){
    const inspected=effect.who==='you'?a:selectedTargets[effect.who];
    const drawnFirst=!effect.destination&&!effect.otherwise?context.drawEvidence.filter(row=>row.player===inspected&&row.source===source).reduce((sum,row)=>sum+row.drawn,0):0;
    const card=before.players.get(inspected).libraryCards.at(-1-drawnFirst);assert.ok(card,label+': top card exists');
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
      else {const factor=effect.exponentV14===undefined?effect.factor:2**amount(effect.exponentV14);if(effect.power)assert.equal(after.power,old.power*factor,label+': snapshotted power multiplied');if(effect.toughness)assert.equal(after.toughness,old.toughness*factor,label+': snapshotted toughness multiplied');}
    }return;
  }
  if(action==='prevent-all'){
    let witness=Array.isArray(subject)?subject[0]:subject;
    if(!witness&&effect.filters)witness=stageGenericTarget(MTG,context,effect.filters[0],'prevention');
    if(!witness&&effect.player)witness=a;
    if(!witness)witness=permanent(MTG,game,a,fixtureDefinition('Prevention target',['Creature'],{power:'5',toughness:'20'}));
    const enemy=permanent(MTG,game,b,fixtureDefinition('Prevention damage source',['Creature'],{power:'5',toughness:'20'}));
    const from=effect.sourceFilters?stageGenericTarget(MTG,context,effect.sourceFilters[0],'prevention-source'):effect.direction==='by'?witness:enemy;
    const to=effect.recipientFilters?stageGenericTarget(MTG,context,effect.recipientFilters[0],'prevention-recipient'):effect.recipientPlayers?b:effect.direction==='by'?b:witness;
    if(effect.sourceUnblocked){from.attacking=to;from.wasBlocked=false;from.blockedBy=[];}
    if(effect.yourTurnOnly)game.turnPlayer=a;
    assert.equal(await game.damageAny(from,to,3,{combat:effect.combat==='combat'}),0,label+': actual matching damage prevented');
    if(effect.direction==='to and dealt by')assert.equal(await game.damageAny(witness,b,3,{combat:effect.combat==='combat'}),0,label+': damage from affected object prevented');
    if(Array.isArray(subject))for(const card of subject.slice(1))assert.equal(await game.damageAny(effect.direction==='by'?card:enemy,effect.direction==='by'?b:card,1,{combat:effect.combat==='combat'}),0,label+': each selected object has its own restriction');
    return;
  }
  if(action==='grant-operation'){
    const hosts=effect.filters?game.bf().filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean);
    assert.ok(hosts.length,label+': at least one granted host');
    for(const host of hosts){assert.ok(host.cur[effect.operation.kind==='generic-trigger'||effect.operation.kind.startsWith('mechanic-')?'extraTriggers':effect.operation.kind==='mana-source'?'extraMana':'extraAbilities'].length,label+': host has granted rule');for(const keyword of effect.keywords||[])assert.equal(host.kw(keyword),true);}
    return;
  }
  if (typeof effect.target === 'number' && !subject) {
    const ownerOperation = (context.proofOperation?.effects?.includes(effect)?context.proofOperation:null) || (entry.implementation || []).find(candidate => (candidate.effects || []).includes(effect));
    const targetSpec = ownerOperation?.targets?.[effect.target];
    assert.equal(targetSpec?.min, 0, `${label}: only an optional target may be omitted`);
    const declined = trace.find(item => item.query.type === 'chooseTargets' && item.query.min === 0 &&
      Array.isArray(item.result) && item.result.length === 0);
    assert.ok(declined, `${label}: controller explicitly chooses the legal zero-target branch`);
    if(action==='untap'&&(ownerOperation.effects||[]).filter(item=>item.action==='untap').length===1)assert.equal(context.untapEvidence.length,0,label+': the omitted untap instruction untaps no object');
    for (const candidate of ownerOperation.modal?[]:declined.query.candidates) {
      const prior = before.cards.get(candidate);
      if (prior && prior.zone === 'battlefield') assert.equal(candidate.zone, prior.zone,
        `${label}: omitted optional effect leaves available permanent ${candidate.name} untouched`);
    }
    return;
  }
  if(action==='zone-select'){
    const actors=effect.who==='each-player'?game.players:effect.who==='each-opponent'?[b]:effect.who==='you'?[a]:[selectedTargets[effect.who]].flat().filter(Boolean);
    for(const actor of actors){
      const fixtures=(context.zoneFixtures.get(effect)||[]).filter(card=>card.owner===actor);
      assert.ok(fixtures.length,label+': positive zone candidates');
      const choices=trace.filter(row=>row.query.type==='chooseCards'&&row.query.prompt==='Choose cards from your '+effect.zone&&row.query.from.some(card=>card.owner===actor));
      const selected=effect.n==='all'&&!effect.upTo?fixtures:choices.flatMap(row=>row.result);
      if(effect.n!=='all'||effect.upTo){assert.ok(choices.length,label+': real controller zone selection');for(const row of choices)assert.ok(row.result.length>=row.query.min&&row.result.length<=row.query.max);}
      for(const card of selected){assert.equal(card.zone,effect.destination,label+': chosen destination');if(effect.destination==='battlefield'){assert.equal(card.ctrl,actor);if(effect.tapped)assert.equal(card.tapped,true);}}
    }
    return;
  }
  if(action==='tap-or-untap'){const choice=trace.findLast(row=>row.query.type==='chooseOption'&&row.query.prompt==='Tap or untap '+subject.name+'?')?.result;assert.ok(['tap','untap','none'].includes(choice));assert.equal(subject.tapped,choice==='tap'?true:choice==='untap'?false:oldSubject.tapped);return;}
  if(action==='draw-followup-v15'){
    const drawn=before.players.get(a).libraryCards.slice(-n);
    assert.equal(a.library.length,before.players.get(a).library-n,label+': actual draws occur before their follow-up');
    if(effect.discardNonland){for(const card of drawn)assert.equal(card.zone,card.is('Land')?'hand':'graveyard',label+': only the drawn nonland is discarded');}
    else{const choice=trace.findLast(row=>row.query.prompt==='Discard from the cards just drawn');assert.ok(choice,label+': drawn-card choice occurs');assert.deepEqual(new Set(choice.query.from),new Set(drawn));assert.equal(choice.result.length,Math.min(effect.discardN,drawn.length));for(const card of drawn)assert.equal(card.zone,choice.result.includes(card)?'graveyard':'hand');}
    return;
  }
  if(action==='choose-permanents'){
    const choices=trace.filter(item=>item.query.type==='chooseCards'&&item.query.prompt==='Choose permanents to '+effect.operation);
    assert.ok(choices.length,label+': real nontargeted choice');
    for(const choice of choices){assert.ok(choice.result.length>=choice.query.min&&choice.result.length<=choice.query.max);for(const card of choice.result){
      if(effect.operation==='counter-v10'){
        const placement=context.counterChangeEvidence.slice(before.counterChangeEvidenceIndex).find(row=>row.card===card&&row.kind===effect.counter&&row.action==='counter'&&row.n===amount(effect.counterN)&&row.after-row.before===amount(effect.counterN)&&!context.usedCounterChanges.has(row));
        assert.ok(placement,label+': chosen permanent receives the exact counter quantity before later effects');context.usedCounterChanges.add(placement);
      }
      else if(['tap','untap'].includes(effect.operation)){assert.equal(card.zone,'battlefield');assert.equal(card.tapped,effect.operation==='tap',label+': selected permanent changes tapped state');}
      else if(['library-top-v15','library-bottom-v15'].includes(effect.operation)){const row=context.moveEvidence.findLast(row=>row.card===card&&row.from==='battlefield'&&row.to==='library');assert.ok(row,label+': chosen permanent returned to library');assert.equal(effect.operation==='library-top-v15'?row.top:row.bottom,card,label+': exact library position');}
      else assert.ok(context.moveEvidence.some(row=>row.card===card&&row.from==='battlefield'&&row.to===(['sacrifice','destroy'].includes(effect.operation)?'graveyard':effect.operation==='exile'?'exile':'hand')),label+': chosen permanent moved through the instructed zone');
    }}
    return;
  }
  if(action==='gain-control'){
    // A printed control effect may name a whole target group. Comparing the
    // controller as a boolean keeps a failure message from serialising the
    // entire player object graph.
    const controlled=effect.filters?context.groupFixtures.get(effect).filter(card=>!effect.controllerPlayerV17||before.cards.get(card).ctrl===selectedTargets[effect.controllerPlayerV17.target]):[subject].flat().filter(Boolean);
    assert.ok(controlled.length,label+': control effect has a selected subject');
    for(const card of controlled){
      assert.equal(card.ctrl===a,true,label+': selected permanent changes controller');
      if(effect.temporary)assert.ok(game.untilEffects.some(row=>row.kind==='temporaryControl'&&row.iid===card.iid),
        label+': temporary control is recorded for each permanent');
    }
    return;
  }
  if(action==='unattach-equipment-v9'){
    assert.ok(context.unattachEquipment?.length,label+': an attached Equipment was staged');
    for(const equipment of context.unattachEquipment){assert.equal(equipment.attachedTo,null);assert.equal([subject].flat().some(host=>host.attachments.includes(equipment.iid)),false);}
    return;
  }
  if(action==='phase-out-v8'){
    const cards=effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean);assert.ok(cards.length,label+': actual phase-out subjects');
    for(const card of cards){
      const old=before.cards.get(card);assert.ok(old,label+': pre-event identity');
      assert.equal(card.zone,'battlefield');assert.equal(card.zoneVersion,old.zoneVersion);assert.equal(card.phasedOut,true);
      assert.equal(game.bf().includes(card),false,label+': phased object is absent from gameplay');
      const root=card.meta.phaseIndirect?game.byIid(card.meta.phaseIndirect.iid):card;
      assert.equal(card.meta.phaseInPlayer,root===card?old.ctrl.idx:root.meta.phaseInPlayer,label+': controller at phase-out determines return, with indirect host precedence');
      assert.equal(game.manaSources(card.ctrl).some(row=>row.card===card),false,label+': cannot pay while phased');
    }
    return;
  }
  if(action==='set-basic-land-types-v8'){
    const cards=[subject].flat().filter(Boolean);assert.ok(cards.length,label+': actual land targets');
    for(const card of cards){const old=before.cards.get(card),record=game.untilEffects.find(row=>row.kind==='oracleLandTypes'&&row.iid===card.iid&&row.zoneVersion===old.zoneVersion);assert.ok(record,label+': same incarnation type setting');assert.equal(record.expires,effect.duration);assert.equal(record.retain,effect.retain);if(effect.choose){assert.equal(record.types.length,1);assert.ok(effect.types.includes(record.types[0]));}else assert.deepEqual(Array.from(record.types),Array.from(effect.types));for(const type of record.types)assert.equal(card.hasSub(type),true);for(const type of old.types)assert.equal(card.is(type),true);assert.equal(card.cur.abilitiesDisabled,!effect.retain);const production=game.manaSources(card.ctrl).filter(row=>row.card===card);if(!card.tapped)for(const type of record.types)assert.ok(production.some(row=>row.produce.some(output=>output[{Plains:'W',Island:'U',Swamp:'B',Mountain:'R',Forest:'G'}[type]]===1)),label+': exact intrinsic mana');}
    return;
  }
  if(action==='characteristics-v8'||action==='change-characteristics-v8'){
    const cards=[subject].flat().filter(Boolean);
    assert.ok(cards.length,label+': characteristic-change subjects staged');
    for(const card of cards){
      const animation=action==='characteristics-v8'&&context.animationEvidence.find(row=>row.card===card&&!context.usedAnimationEvidence.has(row)&&JSON.stringify(row.effect.types)===JSON.stringify(effect.change.addTypes||[])&&JSON.stringify(row.effect.subtypes)===JSON.stringify(effect.change.creatureTypes||[])&&JSON.stringify(row.effect.colors)===JSON.stringify(effect.change.colors||null));
      if(action==='characteristics-v8'){assert.ok(animation,label+': exact characteristic instruction executed');context.usedAnimationEvidence.add(animation);}
      const old=(animation?.before||before).cards.get(card);assert.ok(old,label+': subject snapshot immediately before this instruction');
      assert.equal(card.zone,'battlefield');assert.equal(card.zoneVersion,old.zoneVersion,label+': same incarnation');
      assert.equal(card.cur.basePower,old.basePower,label+': color/type change never sets power');
      assert.equal(card.cur.baseToughness,old.baseToughness,label+': color/type change never sets toughness');
      for(const [counter,n] of Object.entries(old.counters))assert.ok((card.counters[counter]||0)>=n,label+': existing counters preserved alongside separately proved counter additions');
      if(action==='characteristics-v8'){
        for(const type of effect.change.addTypes||[])assert.ok(card.is(type),label+': actual added card type');
        for(const type of old.types)assert.ok(card.is(type),label+': earlier card types retained');
        if(effect.change.creatureTypes){
          for(const type of effect.change.creatureTypes)assert.ok(card.hasSub(type),label+': exact requested creature subtype');
          for(const type of old.subtypes||[]){
            if(!MTG.CREATURE_SUBTYPES.has(type)||effect.change.retainCreatureTypes)assert.ok(card.hasSub(type),label+': retained earlier subtype');
            else if(!effect.change.creatureTypes.includes(type))assert.equal(card.hasSub(type),false,label+': replaced earlier creature subtype');
          }
        }
        for(const keyword of effect.removeKeywords||[])assert.equal(card.kw(keyword),false,label+': printed keyword removed');
        if(effect.change.colors)assert.deepEqual(Array.from(card.colors).sort(),Array.from(effect.change.colors).sort(),label+': exact colors');
      }else if(!effect.choose&&effect.colors)assert.deepEqual(Array.from(card.colors).sort(),Array.from(effect.retain?new Set([...old.colors,...effect.colors]):effect.colors).sort(),label+': exact color replacement');
      else throw new Error(label+': characteristic choice needs dedicated execution evidence');
      assert.ok(game.untilEffects.some(row=>row.kind===(action==='characteristics-v8'?'oracleAnimation':'oracleCharacteristics')&&row.iid===card.iid&&row.zoneVersion===old.zoneVersion&&row.expires===(effect.temporary===false?'object':'eot')),label+': exact incarnation and printed duration');
    }
    return;
  }
  if(action==='base-pt'||action==='animate'){
    // A permanent sacrificed to pay for this very ability left the battlefield
    // before the continuous effect applied, so it is not one of its subjects.
    const paidWith=new Set((context.sacrificeEvidence||[]).slice(before.sacrificeEvidenceIndex||0).map(row=>row.card));
    const cards=(effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean))
      .filter(card=>!paidWith.has(card));
    assert.ok(cards.length,label+': base-stat subjects staged');
    for(const card of cards){
      const animation=action==='animate'&&context.animationEvidence.find(row=>row.card===card&&row.effect.action==='animate'&&!context.usedAnimationEvidence.has(row)&&JSON.stringify(row.effect.types)===JSON.stringify(effect.types)&&row.effect.allCreatureTypes===effect.allCreatureTypes&&row.effect.power===(effect.power===undefined?undefined:amount(effect.power))&&row.effect.toughness===(effect.toughness===undefined?undefined:amount(effect.toughness)));
      if(action==='animate'){assert.ok(animation,label+': exact animation instruction executed');context.usedAnimationEvidence.add(animation);}
      const old=(animation?.before||before).cards.get(card),actual=card.zone==='battlefield'?card.cur:card.battlefieldLKI?.get(old?.zoneVersion);assert.ok(actual);
      assert.equal(actual.basePower??actual.power,effect.power===undefined?old.basePower:amount(effect.power));assert.equal(actual.baseToughness??actual.toughness,effect.toughness===undefined?old.baseToughness:amount(effect.toughness));
      for(const keyword of effect.keywords||[])assert.ok(card.kw(keyword));if(action==='animate')for(const type of effect.types)assert.ok(card.is(type));
      if(effect.allCreatureTypes){assert.equal(card.hasSub('Elf'),true);assert.equal(card.hasSub('Goblin'),true);assert.equal(card.hasSub('Equipment'),old.subtypes.includes('Equipment'));}
    }return;
  }
  if(action==='ability-loss-v8'){
    const cards=effect.controlledCreatures?before.battlefield.filter(card=>[subject].flat().includes(before.cards.get(card)?.ctrl)&&before.cards.get(card)?.types.includes('Creature')):effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean);
    assert.ok(cards.length,label+': ability-loss subjects staged');
    for(const card of cards){const actual=card.zone==='battlefield'?card.cur:card.battlefieldLKI?.get(before.cards.get(card)?.zoneVersion);assert.ok(actual,label+': exact current object or LKI');assert.equal(actual.abilitiesDisabled,true,label+': actual printed ability removal');if(effect.power!==undefined)assert.equal(actual.basePower??actual.power,effect.power,label+': set power');if(effect.toughness!==undefined)assert.equal(actual.baseToughness??actual.toughness,effect.toughness,label+': set toughness');if(card.zone==='battlefield'){for(const keyword of effect.keywords||[])assert.ok(card.kw(keyword),label+': retained keyword');for(const subtype of effect.subtypes||[])assert.ok(card.hasSub(subtype),label+': transformed subtype');}assert.ok(game.untilEffects.some(row=>row.kind==='oracleAbilityLoss'&&row.iid===card.iid&&row.zoneVersion===before.cards.get(card)?.zoneVersion&&row.expires===(effect.temporary?'eot':'object')),label+': exact incarnation and duration record');}
    return;
  }
  if(action==='exile-until-source-leaves'){assert.equal(subject.zone,'exile',label+': exiled while source remains');await game.move(source,'exile');assert.equal(subject.zone,'battlefield',label+': immediate return without a Stack object');return;}
  if(action==='sacrifice-unless-pay'){const payment=trace.find(row=>row.query.type==='chooseOption'&&row.query.prompt==='Pay '+effect.cost+'?');assert.ok(payment);assert.ok(source.zone==='graveyard'||payment.result==='yes');return;}
  if(action==='optional-sacrifice'){const choice=trace.find(row=>row.query.type==='chooseCards'&&row.query.prompt==='You may sacrifice a permanent');assert.ok(choice);if(choice.result.length){assert.ok(['graveyard','ceased'].includes(choice.result[0].zone));for(const child of effect.effects)await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/paid');}return;}
  if(action==='copy-token'){
    if(Array.isArray(subject)){for(const card of subject)await assertGenericEffectEvidence(MTG,{...context,copyProofSourceV15:card},entry,{...effect,target:0},source,[card],damagedPlayer,before,trace,label+'/'+card.iid);return;}
    const made=game.bf().filter(card=>card.isToken&&card.isCopyOf&&!before.battlefield.includes(card)&&(!context.copyProofSourceV15||card.def.name===context.copyProofSourceV15.def.name));assert.ok(made.length>=n,label+': token copies created');
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
    if(effect.captureMadeV15)context.manifestedProofV15=made;
    for(const card of made){assert.equal(card.cur.basePower,2);assert.equal(card.cur.baseToughness,2);assert.equal(card.mv,0);assert.equal(card.faceDown,true);assert.equal(card.meta.faceDownKind,effect.kind==='cloak'?'cloak':'manifest');assert.ok(card.meta.faceDownDef);if(effect.attachSourceV10)assert.equal(source.attachedTo,card.iid,label+': equipment attaches to the newly manifested card');}
    const player=effect.who?genericEffectPlayer(effect,selectedTargets,source,a,damagedPlayer,context):a;
    assert.ok(made.every(card=>card.ctrl===player),label+': specified player controls the manifested card');
    const top=before.players.get(player).libraryCards.slice(-(effect.kind==='manifest-dread'?2:n));
    if(effect.kind==='manifest-dread'){
      const choices=trace.filter(row=>row.query.aiHint?.kind==='manifestDread');assert.equal(choices.length,n,label+': actual private dread choices');
      for(const choice of choices){const picked=choice.result[0];assert.ok(made.includes(picked),label+': chosen card is manifested');for(const card of choice.query.from)if(card!==picked)assert.ok(context.moveEvidence.slice(before.moveEvidenceIndex).some(row=>row.card===card&&row.from==='library'&&row.to==='graveyard'),label+': actual unchosen card moves from library to graveyard');}
    }
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
    if(Array.isArray(subject)){for(const object of subject){const bound=selectedTargets.slice();bound[effect.target]=object;await assertGenericEffectEvidence(MTG,context,entry,effect,source,bound,damagedPlayer,before,trace,label+'/'+object.id);}return;}
    assert.ok(subject&&['spell','ability','trigger'].includes(subject.kind),label+': selected an actual Stack object');
    if(subject.kind==='spell')assert.equal(subject.card.zone,effect.toZone||'graveyard',label+': countered spell moved to destination');
    else {const donor=context.stackAbilityFixtures?.get(subject);assert.ok(donor,label+': real activated or triggered donor fixture');assert.ok(context.counterEvidence.some(row=>row.object===subject&&row.result),label+': actual ability counter operation succeeded');assert.equal(donor.card.zone,donor.zone,label+': countering an ability does not move its source');assert.equal(donor.card.zoneVersion,donor.version);}
    assert.equal(game.stack.includes(subject),false,label+': countered spell left the Stack');return;
  }
  if(Array.isArray(subject)){
    if(effect.target?.kind==='selected-union-v15'){for(const card of subject)await assertGenericEffectEvidence(MTG,context,entry,{...effect,target:0},source,[card],damagedPlayer,before,trace,label+'/'+card.iid);return;}
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
      if(effect.ownerPlayerV18&&card.owner!==selectedTargets[effect.ownerPlayerV18.target])return false;
      if(effect.attachedToV12){if(![genericEffectTarget(effect,selectedTargets,source,context)].flat().some(host=>host?.iid===before.cards.get(card)?.attachedTo))return false;}
      else if(effect.target!==undefined&&genericEffectPlayer({who:effect.target},selectedTargets,source,a,damagedPlayer,context)!==card.ctrl)return false;
      const saved=before.cards.get(card),view={...card,...saved,is:type=>saved.types.includes(type),hasSub:type=>saved.subtypes.includes(type),kw:keyword=>saved.keywords.includes(keyword)};
      const bindX=filter=>({...filter,...(filter.threshold==='X'?{threshold:before.oracleX}:context.exploitEvidence?.length&&JSON.stringify(filter.threshold||{}).includes('event-card-stat')?{threshold:amount(filter.threshold,before)}:{}),
        ...(filter.alternatives?{alternatives:filter.alternatives.map(bindX)}:{})});
      return effect.filters.some(filter=>matchesTarget(view,bindX(filter),context,source));
    });
    if(effect.includeHostV14)for(const host of [genericEffectTarget(effect,selectedTargets,source,context)].flat())if(host&&!affected.includes(host))affected.push(host);
    assert.ok(affected.length||effect.players,`${label}: positive group branch was staged${process.env.ORACLE_PROOF_DEBUG?' '+JSON.stringify({selected:selectedTargets.map(c=>[c].flat().map(c=>({iid:c?.iid,name:c?.name}))),fixtures:(context.groupFixtures.get(effect)||[]).map(c=>({iid:c.iid,name:c.name,attachedTo:before.cards.get(c)?.attachedTo,zone:before.cards.get(c)?.zone})),battlefield:before.battlefield.map(c=>({iid:c.iid,name:c.name}))}):''}`);
    for(const card of affected){
      if(['pump','counter'].includes(effect.operation)&&card.zone!=='battlefield'){
        const paid=context.sacrificeEvidence.some(row=>row.card===card)||trace.some(item=>item.query.type==='chooseCards'&&[item.result].flat().includes(card));
        const lethal=effect.operation==='pump'&&context.moveEvidence.some(row=>row.card===card&&row.from==='battlefield'&&row.to==='graveyard'&&row.before.toughness<=0)&&before.cards.get(card).toughness+amount(effect.toughness)*(effect.multiplier?amount(effect.multiplier):1)<=0;
        assert.ok(paid||lethal,label+': departed group subject has a payment or lethal toughness witness');continue;
      }
      if(effect.operation==='destroy')assert.equal(card.zone,card.isToken?'ceased':'graveyard',`${label}: matching permanent destroyed`);
      else if(effect.operation==='land-types-v15'){
        const selected=effect.choose?trace.findLast(row=>row.query.prompt==='Choose a basic land type')?.result:null;
        if(effect.choose)assert.ok(effect.types.includes(selected),label+': chooses one basic land type for the group');
        for(const type of effect.choose?[selected]:effect.types)assert.equal(card.hasSub(type),true,label+': matching land gains '+type);
        assert.equal(!!card.cur.oracleLandTypeAbilitiesRemoved,!effect.retain,label+': basic type setting removes printed abilities only when replacing land types');
      }
      else if(effect.operation==='exile')assert.equal(card.zone,card.isToken?'ceased':'exile',`${label}: matching permanent exiled`);
      else if(effect.operation==='bounce')assert.equal(card.zone,card.isToken?'ceased':'hand',`${label}: matching permanent returned`);
      else if(effect.operation==='pump'){
        const multiplier=effect.multiplier?amount(effect.multiplier):1,power=amount(effect.power)*multiplier,toughness=amount(effect.toughness)*multiplier;
        const counterDelta=index=>[...new Set([...Object.keys(card.counters),...Object.keys(before.cards.get(card).counters)])].reduce((sum,kind)=>{const stats=/^([+-]\d+)\/([+-]\d+)$/.exec(kind);return sum+(stats?Number(stats[index])*((card.counters[kind]||0)-(before.cards.get(card).counters[kind]||0)):0);},0);
        if(power)assert.ok(power>0?card.power>=before.cards.get(card).power+power+counterDelta(1):card.power<=before.cards.get(card).power+power+counterDelta(1),`${label}: filtered power change`);
        if(toughness)assert.ok(toughness>0?card.toughness>=before.cards.get(card).toughness+toughness+counterDelta(2):card.toughness<=before.cards.get(card).toughness+toughness+counterDelta(2),`${label}: filtered toughness change`);
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
    const recipient=typeof effect.otherTarget==='object'?genericEffectTarget({...effect,target:effect.otherTarget},selectedTargets,source,context):selectedTargets[effect.otherTarget],proof=context.damageEvidence.find(row=>row.source===subject&&row.target===recipient);
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
  if(action==='turn-face-v17'){
    assert.ok(subject&&subject.zone==='battlefield',label+': actual permanent remains in play');assert.equal(subject.faceDown,effect.face==='down',label+': printed face transition');
    if(effect.face==='down'){assert.equal(subject.name,'Face-down creature');assert.equal(subject.power,2);assert.equal(subject.toughness,2);assert.ok(subject.meta.faceDownDef);}
    else {assert.equal(subject.meta.faceDownDef,undefined);assert.notEqual(subject.name,'Face-down creature');}
    return;
  }
  if(action==='discard-filtered-v17'){
    const owner=selectedTargets[effect.who],cards=before.players.get(owner).handCards.filter(card=>matchesTarget(card,effect.filter,{...context,a:owner},source));
    assert.ok(cards.length,label+': matching hand cards staged');for(const card of cards)assert.ok(context.moveEvidence.some(row=>row.card===card&&row.to==='graveyard'),label+': every matching card discarded');return;
  }
  if(action==='shuffle-targets-v17'){
    const owner=selectedTargets[effect.who];assert.ok(owner instanceof MTG.Player,label+': actual chosen library owner');
    const selected=[selectedTargets[effect.target]].flat().filter(Boolean);
    for(const card of selected)assert.ok(card.owner===owner&&context.moveEvidence.some(row=>row.card===card&&row.to==='library'&&row.after.zone==='library'),label+': selected graveyard card reaches its own library');
    return;
  }
  if(action==='move-to-library' && subject) {
    const moved=context.moveEvidence?.findLast(row=>row.card===subject&&row.to==='library'&&row.after.zone==='library');
    assert.ok(moved||subject.zone==='library',`${label}: library destination`);
    if(effect.depthV9!==undefined)assert.equal(subject.owner.library.at(-effect.depthV9-1),subject,`${label}: exact printed depth`);
    else assert.equal(moved?(effect.bottom?moved.bottom:moved.top):effect.bottom?subject.owner.library[0]:subject.owner.library.at(-1),subject,`${label}: exact library position at the instruction`);
    return;
  }
  if (['draw','gain-life','mill','discard','lose-life'].includes(action) && ['each-player','each-opponent'].includes(effect.who)) {
    for (const current of game.players.filter(p => effect.who === 'each-player' || p !== a)) {
      await assertGenericEffectEvidence(MTG,context,entry,{...effect,who:0},source,[current],damagedPlayer,before,trace,label+'/'+current.name);
    }
    return;
  }
  if (action === 'add-mana') {
    const multiple=effect.multiplier?amount(effect.multiplier):1;
    const recipient=effect.who?player:a;assert.ok(recipient instanceof MTG.Player,label+': actual mana recipient');
    if(effect.choices||effect.produce?.ANY){const produced=poolTotal(recipient)-Object.values(before.players.get(recipient).pool).reduce((n,v)=>n+v,0),option=effect.choices?.[0]||effect.produce,n=option.ANY?option.n:Object.values(option).reduce((n,v)=>n+v,0);assert.ok(produced>=n*multiple,label+': chosen mana quantity produced');return;}
    for (const [color,amount] of Object.entries(effect.produce)) assert.ok(recipient.pool[color]>=before.players.get(recipient).pool[color]+amount*multiple,`${label}: ${color} produced`);
    return;
  }
  if (action === 'discard-hand') {
    const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(p=>p!==a):[player];
    for(const subject of players)assert.ok(before.players.get(subject).handCards.filter(card=>card!==source).every(card=>card.zone==='graveyard'),`${label}: every prior hand card other than the cast spell reached graveyard`);
    return;
  }
  if(action==='discard-except-v14'){
    const choice=trace.findLast(row=>row.query.prompt==='Choose cards to keep in hand'),cards=choice?.query.from||before.players.get(player).handCards.filter(card=>card!==source),keep=choice?[choice.result].flat():[];
    assert.equal(keep.length,Math.min(cards.length,n),label+': exact number kept');
    for(const card of cards)assert.equal(card.zone,keep.includes(card)?'hand':'graveyard',label+': chosen card kept or discarded');return;
  }
  if (action === 'shuffle-library') {
    const exchange=context.proofEffects?.slice(0,context.proofEffects.indexOf(effect)).findLast(row=>row.action==='zone-exchange-v19'&&row.zones.includes('library'));
    const expected=before.players.get(a)[(exchange?exchange.zones.find(zone=>zone!=='library'):'library')+'Cards'];
    assert.deepEqual(Array.from(a.library,card=>card.iid).sort((x,y)=>x-y),Array.from(expected,card=>card.iid).sort((x,y)=>x-y),`${label}: shuffle preserves the membership after earlier instructions`);
    return;
  }
  if (action === 'remove-counter') {
    const witness=context.counterChangeEvidence?.slice(before.counterChangeEvidenceIndex).find(row=>row.card===subject&&row.kind===effect.counter&&row.action===action&&row.n===n&&!context.usedCounterChanges.has(row));
    assert.ok(witness,`${label}: actual counter-removal operation executed`);
    assert.equal(witness.after,Math.max(0,witness.before-n),`${label}: exact counter removal before later instructions`);
    context.usedCounterChanges.add(witness);
    return;
  }
  if(action==='copy-counters-v8'||action==='move-counters-v8'){
    const donor=action==='copy-counters-v8'?source:genericEffectTarget({target:effect.sourceTarget},selectedTargets,source,context);
    const old=before.cards.get(donor);assert.ok(old,label+': donor snapshot');
    const kinds=effect.counter?[effect.counter]:Object.keys(old.counters).filter(kind=>old.counters[kind]>0);
    const rows=context.counterChangeEvidence.slice(before.counterChangeEvidenceIndex).filter(row=>!context.usedCounterChanges.has(row));
    let moved=0;
    for(const kind of kinds){
      const removal=rows.find(row=>row.card===donor&&row.action==='remove-counter'&&row.kind===kind);
      const put=rows.find(row=>row.card===subject&&row.action==='counter'&&row.kind===kind);
      if(action==='move-counters-v8'&&effect.n===1&&!effect.counter&&!put)continue;
      let expected=action==='copy-counters-v8'||effect.n==='all'?old.counters[kind]||0:effect.n==='chosen'?Number(trace.find(row=>row.query.type==='chooseX'&&row.query.aiHint?.kind==='counterMove')?.result):1;
      if(expected===0)continue;
      assert.ok(put,label+': actual counter placement');assert.equal(put.n,expected,label+': exact copied or moved quantity');assert.equal(put.after-put.before,expected,label+': donor counters arrive');context.usedCounterChanges.add(put);
      if(action==='move-counters-v8'){assert.ok(removal,label+': actual donor removal');assert.equal(removal.before-removal.after,expected,label+': counters leave donor');context.usedCounterChanges.add(removal);}
      moved+=expected;
    }
    assert.ok(moved>0,label+': positive counter transfer witnessed');return;
  }

  if(action==='look-face-v17'){
    const rows=context.revealEvidence.slice(before.revealEvidenceIndex);assert.equal(rows.length,1,label+': one private look');assert.equal(rows[0].ctrl===a,true);assert.equal(rows[0].kind,'look');assert.equal(rows[0].cards.length,1);assert.equal(rows[0].cards[0].name,subject.meta.faceDownDef.name);assert.equal(subject.faceDown,true);assert.equal(subject.zone,'battlefield');return;
  }
  if(action==='destroy-player-auras-v17'){
    const cards=context.curseFixturesV17;assert.equal(cards[0].zone,'graveyard',label+': Curse attached to caster is destroyed');assert.equal(cards[1].zone,'battlefield',label+': another player Curse is unaffected');return;
  }
  if(action==='remove-counters-v8'){
    const cards=effect.filters?before.battlefield.filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,source))):[subject].flat().filter(Boolean);
    for(const card of cards){
      const prior=before.cards.get(card);assert.ok(prior,label+': removal subject snapshot');
      const kinds=effect.counter?[effect.counter]:Object.keys(prior.counters).filter(kind=>prior.counters[kind]>0);
      const rows=context.counterChangeEvidence.slice(before.counterChangeEvidenceIndex).filter(row=>row.card===card&&row.action==='remove-counter'&&!context.usedCounterChanges.has(row));
      if(effect.upToV17){
        const choice=trace.findLast(row=>row.query.type==='chooseX'&&row.query.prompt==='How many counters to remove from '+card.name+'?');assert.ok(choice);const total=rows.reduce((n,row)=>n+row.before-row.after,0);assert.equal(total,choice.result,label+': exact chosen total removed');assert.ok(total>=0&&total<=effect.n);for(const row of rows)context.usedCounterChanges.add(row);
      }else if(effect.n==='all'){
        for(const kind of kinds)if(prior.counters[kind]>0){const row=rows.find(row=>row.kind===kind&&row.before>0);assert.ok(row,label+': every printed counter kind removed');assert.equal(row.after,0,label+': all counters of selected kind removed');context.usedCounterChanges.add(row);}
      }else if(kinds.length){
        const row=rows.find(row=>kinds.includes(row.kind));assert.ok(row,label+': actual fixed counter removal');assert.equal(row.after,Math.max(0,row.before-effect.n));context.usedCounterChanges.add(row);
        if(!effect.counter)assert.equal(rows.length,1,label+': exactly one chosen counter kind');
      }
    }
    return;
  }


  if(action==='reflexive-cost'){
    const choice=trace.find(item=>item.query.type==='chooseOption'&&item.query.prompt==='Pay the reflexive ability cost?');assert.ok(choice,label+': reflexive cost reaches controller');
    if(choice.result==='yes'){
      assertEnergyCost(MTG,context,effect.cost,source,label+'/reflexive-energy');
      const witness=context.reflexiveWitnesses?.find(item=>JSON.stringify(item.object.oracleReflexive)===JSON.stringify(effect));assert.ok(witness,label+': independent reflexive trigger reaches Stack');
      const selected=trace.find(item=>item.query.type==='chooseCards'&&item.query.prompt==='Choose cards for the reflexive ability cost');
      if(effect.cost.zone){assert.equal(selected?.result.length,effect.cost.n,label+': exact reflexive cost count');for(const card of selected.result){if(effect.cost.action==='blight-v14')assert.equal(witness.before.cards.get(card)?.counters['-1/-1']||0,(before.cards.get(card)?.counters['-1/-1']||0)+effect.cost.countersV14);else assert.ok(['graveyard','exile','ceased'].includes(card.zone),label+': chosen cost leaves its original zone');}}
      for(const child of effect.reflexiveBody.effects)await assertGenericEffectEvidence(MTG,{...context,proofEffects:effect.reflexiveBody.effects},entry,child,source,witness.object.targets,damagedPlayer,witness.before,trace,label+'/reflexive');
    }else assert.equal(choice.result,'no');
  }else if(action==='conditional') {
    if(!effect.elseEffects&&effect.condition.kind==='count-comparison'&&effect.condition.count.zone==='battlefield'&&effect.effects.every(child=>child.action==='draw'&&child.who==='you')){
      const value=countValue(context,source,effect.condition.count,before),holds=(effect.condition.min===undefined||value>=effect.condition.min)&&(effect.condition.max===undefined||value<=effect.condition.max);
      if(!holds){for(const child of effect.effects)assert.equal(context.drawEvidence.slice(before.drawEvidenceIndex).some(row=>row.player===a&&row.source===source),false,label+': an unmet permanent-count condition grants no draw');return;}
    }

    if(effect.condition.kind==='not'&&effect.condition.condition?.kind==='count-comparison'&&effect.condition.condition.count?.zone==='battlefield'&&effect.effects.every(child=>child.action==='token-inline')){
      const positive=effect.condition.condition,value=countValue(context,source,positive.count,before);
      const holds=(positive.min===undefined||value>=positive.min)&&(positive.max===undefined||value<=positive.max);
      if(holds){for(const child of effect.effects){const created=game.bf().filter(card=>card.isToken&&!before.battlefield.includes(card)&&(child.token.subtypes||[]).every(type=>card.hasSub(type)));assert.equal(created.length,0,label+': an unmet negative condition creates no matching tokens');}
        for(const child of effect.elseEffects||[])await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/otherwise');return;}
    }
    // A condition bound to a chosen target only holds for some choices. When
    // the controller picked a target it does not hold for, the printed branch
    // is proved absent instead of being asserted as if it had run.
    if(effect.conditionTarget!==undefined&&(['source-controlled','source-controller-v10','source-stat-comparison','source-quality','source-turn-v9','source-status'].includes(effect.condition.kind)||effect.condition.kind==='count-comparison'&&effect.condition.count.kind==='source-counters')){
      const target=[genericEffectTarget({target:effect.conditionTarget},selectedTargets,source,context)].flat()[0];
      const state=target instanceof MTG.CardInst?before.cards.get(target):effect.targetSnapshotV10&&target?.kind==='spell'?{...before.cards.get(target.card),mv:game.stackSpellManaValue(target),ctrl:target.ctrl}:null;
      const holds=(()=>{
        if(!(target instanceof MTG.CardInst)&&!(effect.targetSnapshotV10&&target?.kind==='spell'))return false;
        if(effect.condition.kind==='source-turn-v9')return (state?.sourceTurnsV9?.[effect.condition.field]===game.turnNo)===effect.condition.present;
        if(['source-controlled','source-controller-v10'].includes(effect.condition.kind))return (state?state.ctrl:target.ctrl)===a;
        if(effect.condition.kind==='count-comparison'){
          const count=state?.counters[effect.condition.count.counter]||0;
          return (effect.condition.min===undefined||count>=effect.condition.min)&&(effect.condition.max===undefined||count<=effect.condition.max);
        }
        if(effect.condition.kind==='source-status'){
          const status=effect.condition.status;
          if(status==='untapped')return !state.tapped;
          if(['tapped','attacking','blocking'].includes(status))return !!state[status];
          assert.ok(['enchanted','equipped'].includes(status),label+': known target status');
          return before.battlefield.some(card=>{const attachment=before.cards.get(card);return attachment?.attachedTo===target.iid&&attachment.subtypes.includes(status==='equipped'?'Equipment':'Aura');});
        }
        if(effect.condition.kind==='source-stat-comparison'){
          const value=Number(state?.[effect.condition.stat]??target[effect.condition.stat])||0;
          return effect.condition.comparison==='greater'?value>=effect.condition.threshold:value<=effect.condition.threshold;
        }
        const view=effect.targetSnapshotV10&&state?{...(target.card||target),...state,zone:'battlefield',cur:{super:state.super||target.card?.def.super||target.def?.super||[]},is:type=>state.types.includes(type),hasSub:type=>state.subtypes.includes(type),kw:keyword=>state.keywords.includes(keyword)}:target;
        return matchesTarget(view,effect.condition.filter,context,target);
      })();
      if(!holds){
        if(effect.elseEffects){
          for(const child of effect.elseEffects)await assertGenericEffectEvidence(MTG,context,entry,child,source,selectedTargets,damagedPlayer,before,trace,label+'/otherwise');
          return;
        }
        // Only the draw is provably absent: another effect in the same
        // resolution may legitimately place counters of the same kind.
        for(const child of effect.effects){
          if(child.action==='draw')assert.equal(context.drawEvidence.slice(before.drawEvidenceIndex).some(row=>row.player===a&&row.source===source),false,label+': an unmet condition grants no draw');
          if(child.action==='token-key')assert.equal(game.bf().some(card=>card.isToken&&!before.battlefield.includes(card)&&card.hasSub(child.tokenKey[0].toUpperCase()+child.tokenKey.slice(1))),false,label+': an unmet condition creates no token');
        }
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
    for(const card of selected){
      assert.equal(v5Matches(card,effect.what),true,`${label}: selected type`);
      if(effect.destination==='library-top')assert.equal(card.zone,'library',`${label}: reordering a searched card retains its library zone`);
      else {const destination=effect.destination||'battlefield';assert.ok(context.moveEvidence.some(row=>row.card===card&&row.from===(action==='search-library'?'library':'hand')&&row.to===destination),`${label}: selected card ${card.name} moves to ${destination}`);}
    }
    if(effect.destination==='library-top')for(const card of selected)assert.ok(a.library.slice(-selected.length).includes(card),label+': selected card is above shuffled cards');
    if(effect.name)for(const card of selected)assert.equal(card.name,effect.name,label+': exact named search');
    if(effect.attachSourceV10)for(const card of selected)assert.equal(source.attachedTo,card.iid,label+': attaches to the card actually put from hand');
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
  }else if(action==='attach-source'){const attachment=!source.hasSub('Equipment')&&!source.hasSub('Aura')&&context.eventCard?.hasSub('Equipment')?context.eventCard:source;assert.equal(attachment.attachedTo,subject.iid,`${label}: equipment attached`);}
  else if(action==='regenerate')assert.ok((subject.regenShield||0)>(oldSubject.regenShield||0),`${label}: regeneration shield`);
  else if(action==='forbid-regeneration-v15')assert.equal(MTG.oracleCantRegenerateV15(game,subject),true,label+': creature cannot regenerate this turn');
  else if(action==='unblockable-until-eot')assert.equal(subject.cur.unblockable,true,`${label}: unblockable state`);
  else if(action==='prevent-next')assert.ok(game.untilEffects.some(row=>row.kind==='oraclePreventNextAmount'&&row.target===subject&&row.remaining===n&&!!row.combat===!!effect.combat&&(row.direction||'to')===(effect.direction||'to')),`${label}: exact prevention shield`);
  else if(action==='skip-next-untap')assert.equal(subject.meta.noUntapOnce,true,`${label}: next untap marker`);
  else if(action==='draw-next-upkeep'){
    const size=a.library.length;game.turnNo++;await game.emit('upkeep',{player:b});await resolveAll(game);assert.equal(a.library.length,size-n,`${label}: delayed draw through Stack`);
  }else if(action==='amass')assert.ok(game.creatures(a).some(card=>card.hasSub('Army')&&card.hasSub(effect.subtype)&&(card.counters['+1/+1']||0)>=n),`${label}: typed Army and counters`);
  else if(action==='ring-tempts')assert.ok(a.ringLevel>0||a.ringTemptations>0||a.ringTempts>0,`${label}: Ring progresses`);
  else if(action==='learn'){
    const query=trace.find(item=>item.query.type==='chooseOption'&&item.query.prompt.startsWith('Learn:'));assert.ok(query,`${label}: Commander rummage choice`);
    if(query.result==='yes')assert.ok(a.library.length<before.players.get(a).library&&a.graveyard.some(card=>before.players.get(a).handCards.includes(card)),`${label}: rummage discard and draw`);
  }else if(action==='reveal-hand'||action==='reveal-random-card'){
    const owner=genericEffectPlayer(effect,selectedTargets,source,a,damagedPlayer,context);
    assert.ok(owner instanceof MTG.Player,label+': the reveal names a player');
    const hand=before.players.get(owner).handCards;
    assert.ok(hand.length,label+': the revealed hand has cards');
    const rows=(context.revealEvidence||[]).slice(before.revealEvidenceIndex||0).filter(row=>row.ctrl===(effect.look?a:owner));
    assert.ok(rows.length,label+': the printed reveal reaches the controller');
    const shown=rows.at(-1).cards;
    if(action==='reveal-random-card'){
      assert.equal(shown.length,1,label+': exactly one card is revealed at random');
      assert.ok(hand.includes(shown[0]),label+': the random card comes from that hand');
    }else{
      assert.equal(shown.length,hand.length,label+': the whole hand is revealed');
      assert.ok(shown.every(card=>hand.includes(card)),label+': every revealed card is from that hand');
    }
    assert.ok(rows.at(-1).zones.every(zone=>zone==='hand'),label+': cards are in hand when revealed');
    return;
  }else if(action==='reveal-hand-discard'){
    if(effect.lookV17){const choice=trace.findLast(row=>row.query.type==='chooseCards'&&row.query.prompt==='Choose cards to discard'&&row.query.from.some(card=>before.players.get(subject).handCards.includes(card)));assert.ok(choice,label+': actual hand selection');if(effect.upToV17)assert.ok(choice.result.length<=n);else assert.equal(choice.result.length,Math.min(n,before.players.get(subject).handCards.length),label+': exact printed discard count');assert.ok(choice.result.every(card=>subject.graveyard.includes(card)),label+': each selected card was discarded');}
    else assert.ok(subject[effect.destination||'graveyard'].some(card=>before.players.get(subject).handCards.includes(card)),`${label}: chosen revealed hand card moved`);
  }
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
    const gain=(context.gainLifeEvidence||[]).slice(before.gainLifeEvidenceIndex||0).find(row=>row.player===player&&row.source===source&&row.n===n);
    if(gain)assert.ok(gain.after>=gain.before+n,`${label}: the printed life gain changes life when it resolves`);
    else {
      const damage=(context.proofEffects||[]).filter(e=>e.action==='damage'&&genericEffectTarget(e,selectedTargets,source,context)===player).reduce((sum,e)=>sum+amount(e.n),0);
      assert.ok(player.life >= oldPlayer.life + n-damage, `${label}: life gain and other damage have the expected net change`);
    }
  } else if (action === 'lose-life') {
    if (effect.who === 'each-opponent') {
      assert.ok(a.opponents(game).every(opponent => opponent.life <= before.players.get(opponent).life - n),
        `${label}: every opponent loses life`);
    } else if (effect.who === 'each-player') {
      assert.ok(game.players.every(current => current.life <= before.players.get(current).life - n),
        `${label}: every player loses life`);
    } else {
      const loss=context.lifeEvidence.slice(before.lifeEvidenceIndex).find(row=>row.player===player&&row.n===amount(effect.n,row.stateBefore)&&row.after===row.before-row.n);
      assert.ok(n===0||loss, `${label}: selected player loses the printed amount before later life changes`);
    }
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
    } else if (subject && subject.zone === 'battlefield' && subject.is('Creature') && (source.kw('infect')||source.kw('wither'))) {
      assert.ok((subject.counters['-1/-1'] || 0) >= (oldSubject.counters['-1/-1'] || 0) + n,
        `${label}: infect/wither damage gives creature -1/-1 counters`);
    } else if (subject && subject.zone === 'battlefield') {
      // A dynamic amount is measured as the damage instruction executes, which
      // an earlier effect in the same resolution can legally change.
      const hit=(context.damageEvidence||[]).find(row=>row.target===subject&&row.source===source&&row.before);
      const expected=subject.damage>=n||!hit?n:amount(effect.n,hit.before);
      assert.ok(subject.damage >= expected || subject.counters.defense < (oldSubject.counters.defense || 0) || subject.is('Planeswalker')&&subject.counters.loyalty<=oldSubject.counters.loyalty-expected,
        `${label}: permanent damage is visible (expected ${expected}, actual ${subject.damage}, power ${subject.power})`);
    } else assert.ok(subject && ['graveyard', 'exile'].includes(subject.zone), `${label}: lethal damage changed zone`);
  } else if (action === 'pump') {
    if(effect.target==='created-tokens'){
      const position=context.proofEffects.indexOf(effect),prior=context.proofEffects.slice(0,position).findLast(row=>['token-inline','token-key'].includes(row.action));
      const recipients=prior?.who==='each-opponent'?game.players.filter(player=>player!==a):prior?.who==='each-player'?game.players:[a];
      const created=game.bf().filter(card=>card.isToken&&!before.battlefield.includes(card)&&recipients.includes(card.ctrl));assert.ok(created.length,label+': created token pump has recipients');
      for(const card of created){for(const keyword of effect.keywords||[])assert.equal(card.kw(keyword),true,label+': created token receives '+keyword);assert.ok(card.power>=Number(card.def.power)+amount(effect.power||0));assert.ok(card.toughness>=Number(card.def.toughness)+amount(effect.toughness||0));}
      assert.ok(game.untilEffects.some(row=>row.kind==='pump'&&row.expires==='eot'),label+': created token grant expires this turn');return;
    }
    assert.ok(subject, `${label}: pump has a selected subject`);
    const pumped=subject.zone==='battlefield'?subject:(subject.battlefieldLKI?.get(oldSubject.zoneVersion)||subject);
    const multiple=effect.multiplier?effect.multiplier.kind==='v8-target-permanent-count'?amount(effect.multiplier):countValue(context,source,effect.multiplier,before):1;
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
      const createdTokens = before.createdTokenBatch?.cards||[];
      assert.ok(createdTokens.length > 0, `${label}: newly created tokens survive the same resolving effect`);
      for (const token of createdTokens) {
        const witness=context.counterChangeEvidence.slice(before.counterChangeEvidenceIndex).find(row=>row.card===token&&row.kind===effect.counter&&row.action==='counter'&&!context.usedCounterChanges.has(row));
        assert.ok(witness,`${label}: created token has a real counter-placement witness`);
        const placed=amount(effect.n,witness.snapshot);
        assert.equal(witness.n,placed,`${label}: printed amount uses the board when the counter instruction resolves`);
        assert.equal(witness.after-witness.before,placed,`${label}: created token receives the exact counter increment`);
        assert.equal(token.counters[effect.counter] || 0, placed, `${label}: each created token gets the exact counter count`);
        context.usedCounterChanges.add(witness);
        assert.equal(token.zone, 'battlefield', `${label}: each created token remains on the battlefield`);
        if (token.is('Creature')) {
          assert.ok(token.toughness > 0, `${label}: counters keep the created creature alive through state-based actions`);
          if (effect.counter === '+1/+1') {
            assert.equal(token.power, (Number(token.def.power) || 0) + placed, `${label}: created token power includes counters`);
            assert.equal(token.toughness, (Number(token.def.toughness) || 0) + placed, `${label}: created token toughness includes counters`);
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
    else assert.ok(moved.zone==='hand'||context.moveEvidence.slice(before.moveEvidenceIndex).some(row=>row.card===moved&&row.to==='hand'&&(row.after.zone==='hand'||row.card.isToken&&row.after.zone==='ceased')), `${label}: return-to-hand changes the card zone`);
  } else if (action === 'sacrifice-source') {
    assert.equal(source.zone, source.isToken?'ceased':'graveyard', `${label}: source sacrifice is paid`);
    if(source.isToken)assert.ok(context.moveEvidence.some(row=>row.card===source&&row.to==='graveyard'&&row.from==='battlefield'),label+': sacrificed token actually entered the graveyard');
  } else if (action === 'tap' || action === 'untap') {
    const departed=context.moveEvidence.slice(before.moveEvidenceIndex).find(row=>row.card===subject&&row.from==='battlefield');
    if(action==='untap'&&oldSubject.tapped&&oldSubject.counters.stun>0){
      assert.equal(subject.tapped,true,label+': stun replaces the untap');
      assert.equal(subject.counters.stun||0,oldSubject.counters.stun-1,label+': untap removes one stun counter');
    }else assert.equal(departed?departed.before.tapped:subject.tapped, action === 'tap', `${label}: ${action} changes tapped state before any later zone change`);
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
    // A following "those tokens" instruction refers to this creation, not
    // every token made earlier or later in the same resolution (incubate twice).
    const start=before.tokenProofCursor??before.tokenCreationEvidenceIndex;
    const tokenName=effect.token?.subtypes?.some(type=>['artifact','enchantment'].includes(type))?effect.token.name.replace(/ (?:artifact|enchantment)(?= |$)/g,''):effect.token?.name;
    const index=context.tokenCreationEvidence.findIndex((row,index)=>index>=start&&row.player===player&&
      (action==='token-key'?row.spec===effect.tokenKey:typeof row.spec==='object'&&row.spec.name===tokenName));
    if(index>=0){before.createdTokenBatch=context.tokenCreationEvidence[index];before.tokenProofCursor=index+1;}
    else before.createdTokenBatch=null;
    const sacrificed=[...trace.filter(row=>row.query.type==='chooseCards'&&/sacrifice/i.test(row.query.prompt||'')).flatMap(row=>row.result||[]),...(context.sacrificeEvidence||[]).filter(row=>row.from==='battlefield').map(row=>row.card)].filter(card=>card.isToken&&!before.battlefield.includes(card)&&card.zone==='ceased');
    assert.ok(game.battlefield.filter(card => card.isToken).length+new Set(sacrificed).size >= before.tokenCount + n - (source?.isToken&&before.battlefield.includes(source)&&source.zone!=='battlefield'?1:0),
      `${label}: created tokens remain or were chosen for the later sacrifice`);
  } else if (action === 'connive') {
    const controller=(Array.isArray(subject)?subject[0]:subject)?.ctrl||a;
    if(effect.n!==undefined&&n===0){assert.equal(controller.library.length,before.players.get(controller).library,label+': connive zero draws no cards');return;}
    assert.ok(queryKinds.includes('chooseCards'), `${label}: connive asks the controller to discard`);
    assert.ok(controller.library.length < before.players.get(controller).library, `${label}: the conniving creature's controller draws`);
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
    assert.ok(context.moveEvidence.slice(before.moveEvidenceIndex).filter(row=>row.card.owner===player&&row.from==='hand'&&row.to==='graveyard'&&row.after.zone==='graveyard').length>=n, `${label}: discarded cards reach graveyard`);
    if (player === a && !effect.random) {
      const discardDecision = trace.find(item => item.query.type === 'chooseCards' &&
        String(item.query.prompt || '').startsWith('Discard ') &&
        Array.isArray(item.result) && item.result.length === n);
      assert.ok(discardDecision, `${label}: controller chooses the exact discard count ${JSON.stringify({expected:n,choices:trace.filter(row=>row.query.type==='chooseCards').map(row=>({prompt:row.query.prompt,min:row.query.min,max:row.query.max,selected:row.result?.length})),oldHand:oldPlayer.handCards.length,currentHand:player.hand.length})}`);
      assert.ok(discardDecision.result.every(card => card.zone === 'graveyard'),
        `${label}: the controller's chosen cards are the cards discarded`);
    }
  } else if (action === 'discard-damaged-player') {
    const old = before.players.get(damagedPlayer);
    assert.ok(damagedPlayer.hand.length <= old.hand - n, `${label}: damaged player discards`);
  } else if (action === 'discard-each-opponent') {
    assert.ok(a.opponents(game).every(opponent => opponent.hand.length <= before.players.get(opponent).hand - n),
      `${label}: each opponent discards`);
  } else if(action==='transform-self'){
    const faces=MTG.OracleV8Faces?.physical(source);
    assert.ok(faces&&faces.faces.length===2,label+': the source is a printed double-faced card');
    const started=before.cards.get(source);
    if(source.zone!=='battlefield'){
      // A permanent that already left the battlefield turns back to its front
      // face and never carries the other one into another zone.
      assert.equal(source.oracleFace,'front',label+': a card outside the battlefield shows its front face');
      return;
    }
    assert.ok((source.oracleTransformCount||0)>(started?.oracleTransformCount||0),label+': the permanent actually transforms');
    assert.notEqual(source.oracleFace,started?.oracleFace??'front',label+': it turns to its other printed face');
    assert.equal(source.def,MTG.OracleV8Faces.faceDefinition(faces,source.oracleFace),label+': the active definition is that printed face');
    assert.equal(source.name,source.def.name,label+': the permanent takes that face\'s printed name');
    return;
  } else assert.fail(`${entry.raw.name}: no nested generic-effect proof for ${action}`);
}

function baseContract(entry) {
  if (entry.raw.types.includes('Land')) return 'land-play';
  if (entry.raw.types.some(type => type === 'Instant' || type === 'Sorcery')) return 'spell-casting';
  if (entry.raw.types.includes('Creature')) return 'creature-casting';
  if (entry.raw.types.some(type => type === 'Artifact' || type === 'Enchantment' || type === 'Planeswalker')) return 'permanent-casting';
  return null;
}

async function enterPermanentProof(MTG, context, entry, {holdLandTriggers=false,bestow=false}={}) {
  const { game, a } = context;
  stageCardCosts(MTG,context,entry);
  for(const op of entry.implementation||[])if(op.kind==='mechanic-champion-v9')stageGenericTarget(MTG,context,op.filters[0],'champion-entry');
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
    await fundSnow(MTG,game,a,entry);
    constrainSquadMana(MTG,a,entry);
    if(!card.def.cost&&card.def.suspend)await castThroughSuspend(MTG,game,a,card);
    else assert.equal(await game.castSpell(a, card, { from: 'hand', xVal: 3,...(bestow?{alt:{bestow:true,altCostStr:card.def.bestowCost}}:{}) }), true, `${card.name}: paid cast enters the real stack`);
    assert.equal(card.zone, 'stack', `${card.name}: stack zone`);
    await resolveAll(game);
    const expectedZone = Number(entry.raw.toughness) <= 0 && !card.def.etbCounters ? 'graveyard' : 'battlefield';
    // A permanent whose printed entry sacrifices it legitimately ends in the
    // graveyard instead of staying on the battlefield.
    const selfSacrifice = JSON.stringify(entry.implementation || []).includes('"sacrifice-source"') || (entry.implementation || []).some(op=>op.kind==='mechanic-champion-v9');
    assert.ok(card.zone === expectedZone || (selfSacrifice && card.zone === 'graveyard'),
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
  if(operation.protectionColorsV19)return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.keywordBanV18)return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.counterBanV18)return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.targetRestrictionV18)return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.condition?.kind==='creature-upgrade-state-v8')return creatureUpgradeProof(MTG,entry,operation,role,v8Helpers());
  if(operation.scope==='self'&&operation.keywords?.includes('phasing'))return phasingKeywordProof(MTG,entry,role,v8Helpers());
  if(operation.attackRequiresKeywords)return attackKeywordsProof(MTG,entry,operation,role,v8Helpers());
  if(['attackerFilters','relativeAttackerPower','defenderRule','blockOnlyFlying','cantAttack','cantBlock','unblockable','blockerFilters'].some(key=>operation[key]))return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.scope==='filtered-permanents')return v5StaticProof(MTG,entry,operation,role,v5Helpers());
  if(operation.grantedMechanicV9||operation.hexproofFiltersV10||operation.otherUntapV10)return v5StaticProof(MTG,entry,operation,role,v5Helpers());
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
  if (lower === 'enchanted' || lower === 'equipped') {
    const aura = permanent(MTG, game, a, fixtureDefinition('Oracle Static Attachment', [lower === 'enchanted' ? 'Enchantment' : 'Artifact'], {
      subtypes: [lower === 'enchanted' ? 'Aura' : 'Equipment'], ...(lower === 'enchanted' ? {enchant: 'creature'} : {}),
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
  const abilities=(source.def.abilities||[]).filter(row=>row.oracleCompiled);
  for(let i=0;i<index;i++)if(effectNodes(operations[i].effects).some(effect=>effect.action==='animate'&&effect.target==='self'&&effect.temporary===false)){
    const action=ctx.game.activatableList(ctx.a).find(row=>row.card===source&&row.ability===abilities[i]);
    if(action){assert.equal(await ctx.game.activateAbility(ctx.a,action),true,entry.raw.name+': paid earlier printed progression');await resolveAll(ctx.game);}
    if(wanted.every(effect=>matchesTarget(source,effect.condition.filter,ctx,source)))break;
  }
}

function stageClashLibraries(MTG,context,win){
  if(context.clashLibrariesStaged)return;context.clashLibrariesStaged=true;
  const add=(player,name,cost,types=['Instant'])=>{const card=new MTG.CardInst(fixtureDefinition(name,types,{cost,...(types.includes('Instant')?{oracle:'You gain 3 life.',resolve:async ctx=>ctx.g.gainLife(ctx.you,3,ctx.src),_immediateCastProof:true}:{})}),player);card.zone='library';player.library.push(card);};
  // Both a prefix draw and a reveal-until-land instruction leave a high card
  // for the subsequent real clash. No hidden draw or outcome is overridden.
  add(context.a,'Oracle Clash Lower Witness','{8}');
  add(context.a,'Oracle Clash Land Witness','', ['Land']);
  add(context.a,'Oracle Clash Upper Witness','{8}');
  add(context.a,'Oracle Clash Top Witness','{8}');
  add(context.b,'Oracle Clash Opponent Witness',win?'{0}':'{12}');
}

async function fireGenericEvent(MTG,context,source,operation){
  if(JSON.stringify(operation.eventFilter)?.includes('"kind":"chosen-subtype-v16"'))operation={...operation,eventFilter:bindChosenType(operation.eventFilter,source.meta.oracleChosenSubtypeV16)};
  if(operation.event==='teamworkPaidV14'){
    const {game,a}=context,spell=zoneCard(MTG,a,'Team Tactics','hand');fund(a,100);game.untap(source);
    const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.aiHint?.teamworkV14?[source]:decide(g,q);
    try{assert.equal(await game.castSpell(a,spell,{from:'hand',alt:{oracleOptionalCostV14:true}}),true);assert.equal(source.tapped,true);}finally{a.controller.decide=decide;}return;
  }
  if(operation.eventFilter?.kind==='either')return fireGenericEvent(MTG,context,source,{...operation,...operation.eventFilter.clauses.find(clause=>clause.event===operation.event)});
  if(operation.eventFilter?.kind==='grave-exit-v12'){
    const {game}=context,filter=operation.eventFilter;
    const card=stageGenericTarget(MTG,context,{...filter.target,controller:filter.owner==='opponent'?'opponent':'you'},'grave-exit');
    await game.move(card,'exile');return;
  }
  if(operation.eventFilter?.kind==='attack-player-v12')return fireGenericEvent(MTG,context,source,{...operation,eventFilter:operation.eventFilter.base});
  if(operation.eventFilter?.kind==='not-died-v12')return fireGenericEvent(MTG,context,source,{...operation,eventFilter:operation.eventFilter.base});
  if(operation.eventFilter?.kind==='during-combat-v12'){context.game.phase='combat';return fireGenericEvent(MTG,context,source,{...operation,eventFilter:operation.eventFilter.base});}
  if(operation.eventFilter?.kind==='attack-battle-v12'){
    const {game,a,b}=context,battle=permanent(MTG,game,b,fixtureDefinition('Attacked battle witness',['Battle'],{defense:'12'}));source.attacking=battle;game.combat={attackers:[source],defenders:new Map([[source.iid,battle]])};
    context.defendingPlayer=b;await game.emit('attacks',{card:source,player:a,defender:battle});return;
  }
  if(operation.eventFilter?.kind==='damage-minimum-v12'){
    const {game,b}=context,n=operation.eventFilter.n,received=operation.eventFilter.base==='self-damaged';
    const enemy=permanent(MTG,game,b,fixtureDefinition('Damage event witness',['Creature'],{power:'8',toughness:'20'}));
    context.eventAmount=n;context.eventPlayer=b;
    await game.damageBatch([{src:received?enemy:source,target:received?source:b,n,opts:{combat:operation.event==='combatDamageToPlayer'}}]);return;
  }
  if(operation.eventFilter?.kind==='draw-ordinal-v12'){
    const {game,a}=context;game.turnPlayer=a;await game.draw(a,operation.eventFilter.ordinals[0],source);return;
  }
  if(operation.event==='ringTempted'){await MTG.E7.ringTempts(context.game,context.a);return;}
  if(operation.eventFilter?.kind==='transformed-quality-v12'){
    const {game,a}=context;
    const [card]=await MTG.BOM.incubate({g:game,you:a,src:source,sourceZoneVersion:source.zoneVersion},2);
    context.eventCard=card;context.eventPlayer=a;context.eventController=a;context.eventCardBefore=cardState(card);
    fund(a,100);const action=game.activatableList(a).find(row=>row.card===card);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await game.resolveTop();
    assert.equal(card.oracleFace,'back','transformation trigger observes an actual paid transformation');return;
  }
  if(Array.isArray(operation.event)&&operation.event.includes('damageToPlayer')&&operation.event.includes('dealtDamage')&&operation.eventFilter==='self-source'){
    await context.game.damageBatch([{src:source,target:context.b,n:2}]);return;
  }
  if(operation.eventFilter?.kind==='saddled-v10'){
    const {game,a}=context;await resolveAll(game);game.turnPlayer=a;game.phase='main1';
    const n=source.def.oracleImplementation.find(op=>op.kind==='mechanic-saddle-v10')?.n;assert.ok(Number.isInteger(n));
    permanent(MTG,game,a,fixtureDefinition('Saddle trigger payment witness',['Creature'],{power:String(Math.max(1,n)),toughness:'20'}));
    const row=game.activatableList(a).find(row=>row.card===source&&row.ability.oracleSaddleV10);assert.ok(row);
    assert.equal(await game.activateAbility(a,row),true);await resolveAll(game);assert.equal(MTG.oracleIsSaddledV10(game,source),true);
    return fireGenericEvent(MTG,context,source,{...operation,eventFilter:operation.eventFilter.base});
  }
  if(operation.eventFilter?.chosenColorV10){
    const {game,a,b}=context,player=operation.eventFilter.controller==='opponent'?b:a;
    const card=zoneCard(MTG,player,fixtureDefinition('Chosen color paid event witness',['Instant'],{cost:'{'+source.meta.oracleChosenColor+'}',resolve:async()=>{}}),'hand');fund(player,100);
    context.eventCard=card;context.eventPlayer=player;context.eventController=player;context.eventCardBefore=cardState(card);
    assert.equal(await game.castSpell(player,card,{from:'hand'}),true,'chosen-color trigger observes an actual spell cast');return;
  }
  if(operation.event==='mutated'){
    const {game,a}=context,incoming=zoneCard(MTG,a,'Sea-Dasher Octopus','hand');fund(a,100);
    const prior=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.type==='chooseTargets'&&q.so?.castOpts?.mutate?[source]:q.type==='chooseOption'&&q.aiHint?.kind==='mutateOrder'?'under':prior(g,q);
    try{assert.equal(await game.castSpell(a,incoming,{from:'hand',alt:incoming.def.altCosts.find(cost=>cost.mutate)}),true);await game.resolveTop();assert.equal(incoming.zone,'merged');assert.equal(source.meta.c1920Mutations,1);}finally{a.controller.decide=prior;}
    return;
  }
  if(operation.condition?.kind==='event-cast-v10'){
    const {game,a}=context;
    const card=stageGenericTarget(MTG,context,{...operation.eventFilter.target,controller:'you'},'paid-entry-v10');
    await game.move(card,'hand');fund(a,100);
    assert.equal(await game.castSpell(a,card,{from:'hand'}),true,'event condition: an entering permanent was actually cast');
    context.eventCard=card;context.eventPlayer=a;context.eventController=a;context.eventCardBefore=cardState(card);
    await game.resolveTop();return;
  }
  if(JSON.stringify(operation.effects||[]).includes('\"action\":\"linked-untap-v8\",\"mode\":\"tapped\"'))context.game.tap(source);
  if(await fireStackCopyEvent(MTG,context,source,operation,v8Helpers()))return;
  if(await fireCastEvent(MTG,context,source,operation,v8Helpers()))return;
  if(await fireDamageEvent(MTG,context,source,operation,v8Helpers()))return;
  const {game,a,b}=context,event=operation.event,filter=operation.eventFilter;
  if(filter?.kind==='observation-v9'){
    const player=filter.controller==='opponent'?b:a;context.eventPlayer=player;

    if(event==='unlockDoor'){
      await resolveAll(game);fund(a,100);game.turnPlayer=a;game.phase='main1';
      const room=zoneCard(MTG,a,'Bottomless Pool // Locker Room','hand');
      const alt=room.def.altCosts.find(row=>row.bdfDoor==='left');assert.ok(alt);
      assert.equal(await game.castSpell(a,room,{from:'hand',alt}),true);await resolveAll(game);
      context.unlockDrawBaselineV10=a.hand.length;
      const action=game.activatableList(a).find(row=>row.card===room&&row.ability.label==='Unlock Locker Room');assert.ok(action);
      assert.equal(await game.activateAbility(a,action),true);await game.resolveTop();assert.equal(room.meta.bdfUnlocked.length,2);return;
    }

    if(event==='landPlayed'){const land=zoneCard(MTG,player,'Forest','hand');assert.equal(await game.playLand(player,land),true);return;}
    if(event==='attached'){const aura=permanent(MTG,game,player,fixtureDefinition('Oracle Observed Aura',['Enchantment'],{subtypes:['Aura'],enchant:'creature'}));assert.equal(await game.attach(aura,source),true);return;}
    if(event==='abilityActivated'){
      const permanent=stageGenericTarget(MTG,context,{...(filter.target||{what:'creature',zone:'battlefield'}),controller:player===a?'you':'opponent'},'observed-activation');
      permanent.def={...permanent.def,abilities:[{label:'Oracle paid observation witness',...(filter.abilityKeywordV18?{[filter.abilityKeywordV18==='exhaust'?'exhaustV18':filter.abilityKeywordV18]:true}:{}),cost:{mana:'{1}',tap:true},run:async()=>{}}]};permanent.sick=false;game.recalc();
      fund(player,100);assert.equal(await game.activateAbility(player,game.activatableList(player).find(row=>row.card===permanent)),true);return;
    }
    if(event==='proliferatedV9'){await MTG.E.proliferate(game,player);return;}
    if(event==='dungeonCompleted'){await game.venture(player,source);await game.completeAFCDungeon(player);return;}
    if(event==='diceRolled'){await game.rollDice(player,6,2,{source});return;}
    if(event==='searchedLibrary'){await MTG.E.searchBasic(game,player,{n:1});return;}
    if(event==='upkeep'){
      const aura=source.def.oracleImplementation.find(row=>row.kind==='aura-target');
      const host=stageGenericTarget(MTG,context,auraProofTarget(aura,'opponent'),'upkeep-host');await game.attach(source,host);
      context.eventPlayer=host.ctrl;await game.emit('upkeep',{player:host.ctrl});return;
    }
    if(event==='tappedForMana'){
      const target={...filter.target,controller:player===a?'you':'opponent'};
      if(['Plains','Island','Swamp','Mountain','Forest'].includes(target.subtype))target.what='land';
      const land=stageGenericTarget(MTG,context,target,'tapped-for-mana');
      if(!land.def.mana)land.def.mana={produce:[{G:1}]};game.recalc();
      const action=game.manaSources(player).find(row=>row.card===land);assert.ok(action,'real mana activation is available');
      assert.equal(await game.activateManaSource(player,action,action.produce[0],null,[]),true);return;
    }
    if(event==='lto'){
      const object=filter.self?source:stageGenericTarget(MTG,context,{...filter.target,controller:filter.graveOwner==='opponent'?'opponent':'you'},'grave-owner');
      context.eventCard=object;context.eventCardBefore=cardState(object);context.eventPlayer=object.owner;context.eventController=object.ctrl;
      await game.move(object,filter.destination||'graveyard');return;
    }
    if(event==='mutated'){
      const host=filter.self?source:stageGenericTarget(MTG,context,{...filter.target,controller:'you'},'mutation-host');
      const incoming=zoneCard(MTG,a,'Dreamtail Heron','hand'),original=a.controller.decide;
      a.controller.decide=async function(g,q){if(q.type==='chooseTargets'&&q.candidates.includes(host))return [host];if(q.aiHint?.kind==='mutateOrder')return 'under';return original.call(this,g,q);};
      try{assert.equal(await game.castSpell(a,incoming,{alt:incoming.def.altCosts.find(alt=>alt.mutate)}),true);await game.resolveTop();}finally{a.controller.decide=original;}
      context.eventCard=host;context.eventCardBefore=cardState(host);context.eventController=a;assert.ok(host.mutateState,'actual paid mutation merged the cards');return;
    }
    if(event==='renowned'){
      const creature=permanent(MTG,game,a,MTG.DEFS['Topan Freeblade']);creature.attacking=b;game.combat={attackers:[creature]};await game.combatDamage(a,'normal');
      await game.flushTriggers();await game.resolveTop();assert.equal(creature.meta.renowned,true);context.eventCard=creature;context.eventCardBefore=cardState(creature);context.eventController=a;return;
    }
    assert.fail('Missing observation driver '+event);
  }
  if(/^expend[468]$/.test(event)){
    a.turnState.manaSpentOnSpells=0;a.turnState.expendFired={};
    const cost=Number(event.slice(6)),spell=zoneCard(MTG,a,fixtureDefinition('Expend paid witness',['Sorcery'],{cost:'{'+cost+'}',resolve:async()=>{}}),'hand');
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true,'expend: actual mana paid for spell');
    assert.equal(a.turnState.manaSpentOnSpells,cost);return;
  }
  if(event==='exerted'){await declareExertProof(MTG,context,source);return;}
  if(event==='exploited'){
    const trigger=game.stack.at(-1);assert.ok(trigger?.kind==='trigger'&&trigger.srcCard===source,source.name+': printed Exploit ETB waits on Stack');
    await game.resolveTop();const exploited=context.exploitEvidence.findLast(row=>row.exploiter===source);assert.ok(exploited,source.name+': actual exploit sacrifice paid');
    context.eventCard=exploited.card;context.eventCardBefore=exploited.snap;context.eventCardStats={power:exploited.snap.power,toughness:exploited.snap.toughness};
    assert.ok(game.stack.some(row=>row.kind==='trigger'&&row.srcCard===source),source.name+': exploit benefit waits for responses');return;
  }
  if(event==='energyGained'){await MTG.OracleV8Energy.gain(game,a,3,source);return;}
  if(filter?.kind==='clash-v8'){stageClashLibraries(MTG,context,true);await game.clash(a,{opponent:b});return;}
  if(filter?.kind==='coin-flip-v8'){
    const player=filter.who==='opponent'?b:a,original=player.controller.decide,rnd=game.rnd;context.eventPlayer=player;
    player.controller.decide=async function(g,q){const result=await original.call(this,g,q);if(q.aiHint?.kind==='coinCall')game.rnd=()=>((result==='heads')===filter.won)?0:0.9;return result;};
    try{await game.flipCoin(player);}finally{game.rnd=rnd;player.controller.decide=original;}return;
  }
  if(filter?.kind==='observed-player-v8'){
    if(event==='surveil'){if(filter.first)a.turnState.surveilEvents=0;await MTG.E.surveil(game,a,1);}
    else if(event==='scry')await MTG.E.scry(game,a,1);
    else if(event==='lifeGain'){if(filter.first)a.turnState.gainedLifeFirst=false;await game.gainLife(a,1,null);}
    else if(event==='lifeLost'){if(filter.first)a.turnState.lifeLossEvents=0;await game.loseLife(a,1,'proof');}
    else if(event==='monarchChanged'){game.monarch=null;await game.becomeMonarch(a);}
    else if(event==='postcombatMain'){a.turnState.mainPhaseCount=1;game.phase='main2';await game.emitMainPhase(a);}
    else assert.fail('Unknown observed player event '+event);
    return;
  }
  if(filter?.kind==='observed-explore-v8'){
    if(filter.land!==undefined)zoneCard(MTG,a,MTG.DEFS[filter.land?'Forest':'Lightning Bolt'],'library');
    const explorer=zoneCard(MTG,a,MTG.DEFS['Merfolk Branchwalker'],'hand');
    assert.equal(await game.castSpell(a,explorer,{from:'hand'}),true);await game.resolveTop();await game.flushTriggers();
    assert.equal(game.stack.at(-1)?.srcCard,explorer);await game.resolveTop();return;
  }
  if(filter?.kind==='created-batch-v8'){context.batchAmountV9=2;await game.makeTokens('saproling',a,{n:2});return;}
  if(filter?.kind==='batch-discard-v8'){
    const player=filter.controller==='opponent'?b:a;
    const cards=Array.from({length:2},(_,i)=>stageGenericTarget(MTG,context,{...filter.target,controller:player===a?'you':'opponent'},'discard-batch-'+i));
    for(const card of cards)await game.move(card,'hand');context.batchAmountV9=cards.length;await game.discard(player,cards);return;
  }
  if(event==='oraclePhasedInV17'){
    context.eventCard=source;context.eventCardBefore=cardState(source);game.phaseOut(source);game.phaseInFor(source.ctrl);return;
  }
  if(filter?.kind==='attached-source-v17'){
    const host=stageGenericTarget(MTG,context,{what:'creature',controller:'you'},'attach-event');context.eventCard=host;context.eventCardBefore=cardState(host);context.eventController=a;await game.attach(source,host);return;
  }
  if(await fireV8Event(MTG,context,source,operation,{...v5Helpers(),cardState,stageEventConditions}))return;
  if(filter==='self-unblocked'){
    source.attacking=b;source.wasBlocked=false;source.blockedBy=[];game.combat={attackers:[source]};context.eventPlayer=b;
    await game.emit('blockersDeclared',{player:a,attackers:[source]});return;
  }
  if(filter?.kind==='self-creature-combat'){
    const other=context.eventCombatOtherV13||stageGenericTarget(MTG,context,{...filter.otherFilter,controller:'opponent'},'combat-other');context.eventCard=other;context.eventCardBefore=cardState(other);context.eventController=b;
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
    for(const card of attackers){card.attacking=b;card.blockedBy=[];card.wasBlocked=false;if(filter.filters[0].stat!=='power'){card.def.power='2';game.recalc();}}
    game.combat={attackers};await game.combatDamage(a,'normal');return;
  }
  context.eventCard=source;context.eventController=source.ctrl;
  context.eventPlayer=filter?.controller==='opponent'||filter==='opponent-player'||['damageToPlayer','combatDamageToPlayer'].includes(event)?b:a;
  if(event==='attackersDeclared'){
    const quality=operation.effects?.find(effect=>effect.action==='conditional'&&effect.condition.kind==='source-quality');
    const target={...(filter?.filters?.[0]||{controller:'you'}),what:'creature'};
    const attacker=(quality&&game.creatures(a).find(card=>matchesTarget(card,quality.condition.filter,context,source)))||stageGenericTarget(MTG,context,target,'attack-probe');attacker.attacking=b;
    game.combat={...(game.combat||{}),attackers:[...new Set([...(game.combat?.attackers||[]),attacker])],defenders:game.combat?.defenders||new Map(),declaredAttackTargets:[b]};
    await game.emit(event,{player:a,attackers:game.creatures(a).filter(card=>card.attacking)});return;
  }
  if(event==='cycled'){
    const card=filter==='self'?source:zoneCard(MTG,a,fixtureDefinition('V7 cycle probe',['Land'],{cycling:{cost:'{1}'}}),'hand');
    if(card.zone!=='hand')await game.move(card,'hand');
    const row=game.activatableList(a).find(row=>row.card===card&&row.cycling);assert.ok(row,source.name+': actual cycling action');
    assert.equal(await game.activateAbility(a,row),true);return;
  }
  if(event==='targeted'&&JSON.stringify(operation.effects).includes('event-stack-v10')){
    const target=filter?.self?source:stageGenericTarget(MTG,context,{what:'creature',controller:'you'},'targeted-event');
    const witness=zoneCard(MTG,b,fixtureDefinition('Targeting spell witness',['Instant'],{cost:'{1}',targets:[{what:'creature',min:1,filter:(g,c)=>c===target}],resolve:async()=>{}}),'hand');
    fund(b,10);assert.equal(await game.castSpell(b,witness,{from:'hand'}),true);
    context.eventStackV10=game.stack.find(object=>object.card===witness);assert.ok(context.eventStackV10);return;
  }
  if(event==='c14EnteredGraveyard'){
    await game.move(source,'hand');context.eventCard=source;context.eventCardBefore=cardState(source);await game.move(source,'graveyard');return;
  }
  if(event==='oraclePlottedV13'){
    if(source.zone!=='hand')await game.move(source,'hand');fund(a,50);
    const action=game.activatableList(a).find(row=>row.card===source&&row.plot);assert.ok(action,source.name+': printed plot action');
    context.eventCard=source;assert.equal(await game.activateAbility(a,action),true);return;
  }
  if(event==='oracleSpellCounteredV13'){
    const caster=filter.byYou?b:a,counterer=filter.byYou?a:b;fund(caster,20);fund(counterer,20);
    const spell=zoneCard(MTG,caster,fixtureDefinition('Counter event witness',['Instant'],{cost:'{1}',resolve:async()=>{}}),'hand');
    assert.equal(await game.castSpell(caster,spell,{from:'hand'}),true);
    const original=game.stack.find(row=>row.card===spell),counter=zoneCard(MTG,counterer,'Counterspell','hand');
    const choose=counterer.controller.decide.bind(counterer.controller);counterer.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(original)?[original]:choose(g,q);
    try{assert.equal(await game.castSpell(counterer,counter,{from:'hand'}),true);await game.resolveTop();}finally{counterer.controller.decide=choose;}
    assert.equal(spell.zone,'graveyard');return;
  }
  if(filter?.kind==='targeted-object'&&!filter.self){const target=stageGenericTarget(MTG,context,{what:'creature',controller:'you'},'targeted-event');await game.emit('targeted',{card:target,byPlayer:b,src:null,isSpell:true});return;}
  if(filter?.kind==='filtered-sacrifice'){const cards=Array.from({length:operation.oncePerBatch?2:1},(_,i)=>stageGenericTarget(MTG,context,{...filter.target,controller:'you'},'sacrifice-event-'+i));context.batchAmountV9=cards.length;await game.sacrificeMany(a,cards);return;}
  if(filter?.kind==='attached-object'){
    const aura=source.def.oracleImplementation.find(row=>row.kind==='aura-target'),host=stageGenericTarget(MTG,context,auraProofTarget(aura),'attached');await game.attach(source,host);
    return fireGenericEvent(MTG,context,host,{...operation,eventFilter:'self'});
  }
  if(filter?.kind==='filtered-object'){
    context.batchAmountV9=1;
    const card=stageGenericTarget(MTG,context,event==='turnedFaceUp'&&filter.target.what==='permanent'?{...filter.target,what:'creature'}:filter.target,0);if(event==='combatDamageToPlayer'&&filter.target.stat!=='power'){card.def.power='2';game.recalc();}context.eventCardStats={power:card.power,toughness:card.toughness};
    for(const effect of effectNodes(operation.effects))if(effect.conditionTarget==='event-card'){
      const driver=effect.elseEffects&&operation.proofBranch===false?stageFalseCondition:stageCondition;driver(MTG,context,effect.condition,card,v5Helpers());
    }
    if(filter.target?.blockingSourceV9){card.blocking=source.iid;source.attacking=card.ctrl;source.blockedBy=[card];}
    context.eventCard=card;context.eventController=card.ctrl;context.eventCardBefore=cardState(card);
    if(event==='etb'){game.battlefield.splice(game.battlefield.indexOf(card),1);card.zone='nowhere';if(filter.target.faceDownV9)await game.putFaceDown(card.ctrl,card);else await game.move(card,'battlefield',{ctrl:card.ctrl});}
    else if(event==='dies')await game.move(card,'graveyard');
    else if(event==='lto')await game.move(card,'exile');
    else if(event==='combatDamageToPlayer'){context.eventAmount=card.power;context.eventPlayer=b;card.attacking=b;game.combat={attackers:[card],defenders:new Map()};await game.combatDamage(a,'normal');}
    else if(event==='attacks'){card.attacking=card.ctrl===a?b:a;await game.emit(event,{card,player:card.ctrl,defender:card.attacking});}
    else if(event==='blocks'){card.blocking=source.iid;await game.emit(event,{blocker:card,attacker:source});}
    else if(event==='becameTapped'){card.tapped=false;game.tap(card);}
    else if(event==='becameUntapped'){card.tapped=true;game.untap(card);}
    else if(event==='turnedFaceUp'){
      await game.move(card,'hand');await game.putFaceDown(card.ctrl,card);fund(card.ctrl,100);
      assert.equal(await game.turnFaceUp(card.ctrl,card),true,'actual paid turn-face-up action');context.eventCardBefore=cardState(card);
    }
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
    const gift=operation.effects?.some(effect=>effect.action==='give-control-v9'&&effect.target==='self'&&effect.who==='event-player');
    const caster=filter?.controller==='opponent'||gift&&filter?.controller!=='you'?b:a;
    const type=event==='castCreature'||what==='creature'?'Creature':what==='historic'?'Artifact':['artifact','enchantment'].includes(what)?what[0].toUpperCase()+what.slice(1):'Instant';
    const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
    const def=fixtureDefinition('V5 cast event probe',[type],{cost:/event-(?:mana-spent|spell-mv)-v10/.test(JSON.stringify(operation))?'{'+(context.eventManaProofV10??5)+'}':'{0}',subtypes:filter?.subtypes||[what],colorsOverride:colors[what]?[colors[what]]:what==='multicolored'?['G','W']:[],
      ...(filter==='your-spell-targets-self'?{targets:[{what:'creature',filter:(g,c)=>c===source}],resolve:async()=>{}}:{})});
    const requiredTurn=operation.condition?.kind==='event-player-condition-v9'?game.turnPlayer:operation.condition?.kind==='your-turn'?a:
      filter?.opponentsTurn||operation.condition?.kind==='not-your-turn'?b:null;
    // The trigger's turn restriction concerns its controller, independently
    // of who casts the witness (Eyes of the Wisent / Breath of the Sleepless).
    if(requiredTurn){game.turnPlayer=requiredTurn;if(caster!==requiredTurn&&type!=='Instant')def.kws=['flash'];}
    for(let index=0;index<(filter?.kind==='your-numbered-cast'?filter.n:1);index++){
    const spell=new MTG.CardInst(def,caster);spell.zone='hand';caster.hand.push(spell);
    context.eventCard=spell;context.eventController=caster;context.eventCardBefore=cardState(spell);
    const previousPlayer=game.turnPlayer,previousPhase=game.phase;
    if(!requiredTurn){game.turnPlayer=caster;game.phase='main1';}
    try{assert.equal(await game.castSpell(caster,spell,{from:'hand'}),true,'real cast event probe');}
    finally{game.turnPlayer=previousPlayer;game.phase=previousPhase;}
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
  else if(event==='attacks'){source.attacking=b;game.combat={...(game.combat||{}),attackers:[...new Set([...(game.combat?.attackers||[]),source])],defenders:game.combat?.defenders||new Map(),declaredAttackTargets:[b]};await game.emit(event,{card:source,player:a,defender:b});}
  else if(event==='turnedFaceUp')await game.emit(event,{card:source,player:a,x:3});
  else if(event==='becameTapped')game.tap(source);
  else if(event==='becameUntapped'){source.tapped=true;game.untap(source);}
  else if(event==='blocks'){const attacker=permanent(MTG,game,b,fixtureDefinition('V5 attacker',['Creature']));attacker.attacking=a;attacker.blockedBy=[source];source.blocking=attacker.iid;game.combat={attackers:[attacker],defenders:new Map()};await game.emit(event,{attacker,blocker:source});}
  else if(event==='becomesBlocked'){const blocker=permanent(MTG,game,b,fixtureDefinition('V5 blocker',['Creature']));source.attacking=b;source.blockedBy=[blocker];blocker.blocking=source.iid;game.combat={attackers:[source],defenders:new Map()};await game.emit(event,{attacker:source,blockers:[blocker]});}
  else assert.fail('Missing V5 event driver '+event);
}

async function printedTokenProof(MTG,context,entry,effect,before,trace,label){
  const {game}=context;
  const matches=card=>card?.isToken&&!before.battlefield.includes(card)&&card.name===printedTokenName(effect.token)&&card.def.oracle===effect.token.oracle;
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
    if(operation.kind==='mechanic-changeling'){
      assert.equal(token.hasSub('Elf'),true);assert.equal(token.hasSub('Goblin'),true);assert.equal(token.hasSub('Equipment'),false);
      assert.equal(token.def.changeling,true,label+': Changeling is a copiable token characteristic');
    }else if(operation.kind==='mechanic-toxic'){
      const poison=b.poison||0,life=b.life;
      assert.equal(await game.damagePlayer(token,b,1,{combat:true}),1,label+': toxic token deals actual combat damage');
      assert.equal(b.poison,poison+operation.n,label+': exact printed toxic value');assert.equal(b.life,life-1,label+': toxic keeps combat life loss');
    }else if(operation.kind==='mechanic-saddle-crew-power-v10'){
      await proveSaddleCrewPowerV10(MTG,context,token,operation,v5Helpers());
    }else if(operation.kind==='mechanic-prowess-v10'){
      await grantedMechanicProof(MTG,context,token,operation,v5Helpers());
    }else if(operation.kind==='mana-source'){
      if(token.tapped){
        assert.equal(game.manaSources(a).some(row=>row.card===token),false,label+': a tapped token cannot pay its tap cost');
        game.untap(token);
      }
      if(operation.activationCost?.tap&&token.sick&&token.is('Creature')&&!token.kw('haste')){
        assert.equal(game.manaSources(a).some(row=>row.card===token&&row.extraCost?.tap),false,label+': new creature token cannot tap for mana without haste');
        token.sick=false;
      }
      const source=game.manaSources(a).find(row=>row.card===token);assert.ok(source,label+': token has actual mana source');
      const pool={...a.pool};assert.equal(await game.activateManaSource(a,source,source.produce[0],null,[]),true,label+': token mana activates');
      if(operation.activationCost?.sacSelf)assert.equal(token.zone,'ceased',label+': token sacrificed before production');
      for(const [color,n]of Object.entries(operation.produce[0]))assert.equal(a.pool[color],pool[color]+n,label+': exact token mana');
      await resolveAll(game);
    }else if(operation.kind==='generic-ability'){
      const targets=operation.targets.map((filter,index)=>stageGenericTarget(MTG,context,filter,'token-ability-'+index,operation.effects.find(effect=>effect.target===index)));
      if(operation.cost.tap&&token.sick&&token.is('Creature')&&!token.kw('haste'))assert.equal(game.activatableList(a).some(row=>row.card===token),false,label+': new creature token cannot tap for a cost');
      token.sick=false;game.phase='main1';game.turnPlayer=a;fund(a,100);
      const action=game.activatableList(a).find(row=>row.card===token);assert.ok(action,label+': printed token activation offered');
      const snapshot=genericProofSnapshot(context,[token,...targets]),pool=poolTotal(a);
      const manaCost=game.abilityManaCost(a,token,operation.cost.mana||'{0}',{ability:action.ability});
      let tapped=false;const tap=game.tap.bind(game);game.tap=card=>{const result=tap(card);if(card===token&&card.tapped)tapped=true;return result;};
      try{assert.equal(await game.activateAbility(a,action),true,label+': token ability uses actual activation');}finally{game.tap=tap;}
      if(operation.cost.tap)assert.equal(tapped,true,label+': token tap cost');
      if(operation.cost.sacSelf)assert.equal(token.zone,'ceased',label+': token sacrificed as a cost');
      if(operation.cost.mana)assert.equal(pool-poolTotal(a),manaCost.generic+manaCost.pips.length,label+': actual token mana cost including reductions');
      const so=game.stack.find(row=>row.srcCard===token&&row.kind==='ability');assert.ok(so,label+': token ability is on Stack');
      await resolveAll(game);
      for(const effect of operation.effects)await assertGenericEffectEvidence(MTG,context,entry,effect,token,so.targets,b,snapshot,trace,label+'/token-activation');
    }else if(operation.kind==='generic-static'){
      await combatRestrictionProof(MTG,context,token,operation,v5Helpers(),label);
    }else if(operation.kind==='generic-trigger'){
      const targets=[];for(const [index,filter]of(operation.targets||[]).entries())targets.push(filter.zone==='stack'?await stageGenericStackTarget(MTG,context,filter,'token-trigger-'+index):stageGenericTarget(MTG,context,filter,'token-trigger-'+index,operation.effects.find(effect=>effect.target===index)));
      const snapshot=genericProofSnapshot(context,[token,...targets]);
      await fireGenericEvent(MTG,context,token,operation);await game.flushTriggers();
      const trigger=game.stack.find(row=>row.srcCard===token&&row.kind==='trigger');assert.ok(trigger,label+': printed token trigger reaches Stack');
      await resolveAll(game);
      for(const child of operation.effects)await assertGenericEffectEvidence(MTG,context,entry,child,token,trigger.targets||[],b,snapshot,trace,label+'/token-rule');
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
  if(op.kind.startsWith('mechanic-'))return grantedMechanicProof(MTG,ctx,host,op,v5Helpers());
  installStackCopyProof(MTG,ctx,op,v8Helpers());
  for(const child of flattenProofEffects(op.effects||[])){
    stageCopyLinkedEffect(MTG,ctx,child,v8Helpers());
    stageV8Effect(MTG,ctx,child,v8Helpers());
    stageMultizoneSearch(MTG,ctx,child,v8Helpers());
    stagePlayPermission(MTG,ctx,child,v8Helpers());
    stageCardResults(MTG,ctx,child,v8Helpers());
    stageEnergy(MTG,ctx,child,v8Helpers());stageRevealed(MTG,ctx,child,v8Helpers());
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
  ctx.defendingPlayer=stackObject.ctx?.oracleSourceCapture?.defendingPlayer;
  await resolveAll(game);
  for(const child of op.effects)await assertGenericEffectEvidence(MTG,{...ctx,proofOperation:op},entry,child,host,stackObject.targets,ctx.b,before,trace,label+'/granted-rule');
  await finishCopyLinkedProof(MTG,ctx,entry,v8Helpers());
  await finishV8EffectProof(MTG,ctx,entry,v8Helpers());
  await finishStackCopyProof(MTG,ctx,v8Helpers());
  if(host.zone==='battlefield'){await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:ctx.a});assert.equal(host.cur.extraAbilities.length,0);assert.equal(host.cur.extraTriggers.length,0);}
}

// A draw condition followed by its exact negative token condition needs two
// separate board fixtures. Staging both simultaneously erases the draw witness.
const drawOrTokenBranches=effects=>effects?.length===2&&effects.every(effect=>effect.action==='conditional'&&!effect.elseEffects)&&
  effects[0].condition.kind==='count-comparison'&&effects[0].condition.count.zone==='battlefield'&&effects[0].effects.every(effect=>effect.action==='draw'&&effect.who==='you')&&
  effects[1].condition.kind==='not'&&effects[1].effects.every(effect=>effect.action==='token-inline')&&
  JSON.stringify(effects[0].condition)===JSON.stringify(effects[1].condition.condition)?effects:null;
const hasConditionalBranches=effects=>(effects||[]).some(effect=>effect.action==='conditional'&&effect.elseEffects||effect.action==='clash-v8'&&(effect.effects?.length||effect.elseEffects?.length)||hasConditionalBranches(effect.effects)||hasConditionalBranches(effect.elseEffects));

function offsetProofEffect(effect,offset){
  const result={...effect};for(const key of ['target','otherTarget','who','conditionTarget'])if(typeof result[key]==='number')result[key]+=offset;
  for(const key of ['effects','elseEffects'])if(result[key])result[key]=result[key].map(child=>offsetProofEffect(child,offset));return result;
}
async function prepareAttachedEffectSource(MTG,context,source,operation){
  if(!JSON.stringify(operation).includes('attached-host')||source.zone!=='battlefield')return;
  let host=context.game.byIid(source.attachedTo);
  if(!host&&source.hasSub('Equipment')){host=stageGenericTarget(MTG,context,{what:'creature',controller:'you'},'equipped-host');assert.equal(await context.game.attach(source,host),true);}
  if(!host)return;
  (context.attachmentHosts||=new Map()).set(source,host);
  for(const effect of flattenProofEffects(operation.effects||[])){
    if(effect.action==='battlefield-group'&&effect.attachedToV12&&effect.target==='attached-host'){
      const cards=[];for(const filter of effect.filters){const card=stageGenericTarget(MTG,context,filter,'source-host-attachment',{attachmentHostV14:host});card.attachedTo=host.iid;if(!host.attachments.includes(card.iid))host.attachments.push(card.iid);cards.push(card);}context.groupFixtures.set(effect,cards);
    }
    if(effect.conditionTarget==='attached-host')stageCondition(MTG,context,effect.condition,host,v5Helpers());
    if(effect.target==='attached-host'&&effect.action==='untap')host.tapped=true;
  }
}

async function genericRuntimeOperationProof(MTG, entry, operation, role) {
  if(operation.proofMixedV18===undefined&&operation.targets?.some(target=>target.zone==='mixed-v18')){
    let checks=0;for(const proofMixedV18 of [0,1])checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,proofMixedV18,originalOperation:operation.originalOperation||operation},role);return checks;
  }
  if(operation.kind==='spell-generic'&&!operation.paragraphProof){
    const paragraphs=entry.implementation.filter(row=>row.kind==='spell-generic');
    if(paragraphs.length>1){const targets=[],effects=[];for(const paragraph of paragraphs){effects.push(...paragraph.effects.map(effect=>offsetProofEffect(effect,targets.length)));targets.push(...paragraph.targets);}
      return genericRuntimeOperationProof(MTG,entry,{...operation,targets,effects,paragraphProof:true},role);
    }
  }
  if(operation.condition?.kind==='creature-upgrade-state-v8'&&operation.condition.state==='tribute-unpaid')return creatureUpgradeProof(MTG,entry,operation,role,v8Helpers());
  if(operation.anyPlayer&&!operation.publicActivatorProof){
    let checks=0;
    for(const publicActivatorProof of ['controller','opponent'])checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,publicActivatorProof,originalOperation:operation},role);
    return checks;
  }
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
  if(operation.cleaveBodyV10&&!operation.cleaveCheckedV10){let checks=await genericRuntimeOperationProof(MTG,entry,{...operation,cleaveCheckedV10:true},role);checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,...operation.cleaveBodyV10,cleaveCheckedV10:true,cleaveVariantV10:true},role);return checks;}
  if(operation.optionalBodyV14&&!operation.optionalCheckedV14){let checks=await genericRuntimeOperationProof(MTG,entry,{...operation,optionalCheckedV14:true},role);checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,...operation.optionalBodyV14,optionalCheckedV14:true,optionalVariantV14:true},role);return checks;}
  if(operation.proofBranch===undefined&&(hasConditionalBranches(operation.effects)||drawOrTokenBranches(operation.effects))){
    let checks=0;for(const proofBranch of [true,false])checks+=await genericRuntimeOperationProof(MTG,entry,{...operation,proofBranch,originalOperation:operation.originalOperation||operation},role);return checks;
  }
  if(operation.kind==='spell-modal-generic'){
    const plans=[];
    for(let mask=1;mask<(1<<operation.modes.length);mask++){
      const plan=Array.from(operation.modes,(_,i)=>i).filter(i=>mask&(1<<i));
      if(plan.length>=operation.choose.min&&plan.length<=(operation.optionalCostModesV14?2:operation.choose.max))plans.push(plan);
    }
    let checks=0;
    for(const plan of role==='human'?plans:[plans.at(-1)]){
      let offset=0;const effects=[],targets=[];
      for(const mode of operation.modes){
        for(const effect of mode.body.effects)effects.push(offsetProofEffect(effect,offset));
        targets.push(...mode.body.targets);offset=targets.length;
      }
      checks+=await genericRuntimeOperationProof(MTG,entry,{kind:'spell-generic',modal:operation,modePlan:plan,targets,effects,optionalCostModeProofV14:!!operation.optionalCostModesV14&&plan.length===2},role);
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
      if(query.aiHint?.kind==='sacX')return query.from.filter(card=>card!==query.aiHint.src).slice(0,Math.min(3,max));
      // This fixture proves the resolving effect. Preserve its staged
      // graveyard witnesses when optional Delve is offered during the cast;
      // the separate mechanic-delve proof exercises graveyard payment.
      if (query.aiHint?.kind === 'delve' && query.prompt?.startsWith('Delve:')) return query.from.slice()
        .sort((a, b) => Number(wantedCards.includes(a)) - Number(wantedCards.includes(b))).slice(0, min);
      if(query.aiHint?.exploitSource&&query.from.includes(context.exploitDonor))return [context.exploitDonor];
      const chosen = wantedCards.filter(card => query.from.includes(card)).slice(0, max);
      for (const card of query.from) {
        if (chosen.length >= max) break;
        if (!chosen.includes(card)) chosen.push(card);
      }
      return chosen.length >= min ? chosen : [];
    },
    chooseMulti:(game,query)=>operation.modePlan&&query.prompt.startsWith(entry.raw.name+':')?operation.modePlan.map(String):query.options.slice(0,query.min||1).map(option=>option.key),
    chooseOption: (game, query) => {
      if(query.aiHint?.kind==='chooseType'&&JSON.stringify(operation.effects||[]).includes('choose-subtype-v10'))return 'Elf';
      if(query.aiHint?.kind==='entwine')return operation.entwineProof?'yes':'no';
      if(operation.modalTrigger&&query.aiHint?.kind==='mode'&&query.aiHint.src?.name===entry.raw.name&&operation.modalTriggerMode!==null){
        const key=String(operation.modalTriggerMode);
        assert.ok(query.options.some(option=>option.key===key),entry.raw.name+': requested printed trigger mode is legal');
        return key;
      }
      return operation.modePlan&&query.prompt.startsWith(entry.raw.name+':')&&query.options.every(option=>/^\d+$/.test(String(option.key)))?String(operation.modePlan[0]):query.options.find(option =>
        ['yes', 'pay', 'counter', 'top'].includes(option.key))?.key || query.options[0]?.key;
    },
    chooseX: (game, query) => Math.min(3, query.max ?? 3),
    scry: (game, query) => ({ top: query.cards.slice(1), bottom: query.cards.slice(0, 1) }),
  });
  const context = gameFor(MTG, [controller, decision()], { ai: role === 'ai' });
  const { game, a, b } = context;
  installStackCopyProof(MTG,context,operation,v8Helpers());
  if(operation.targets?.some(target=>target.targetsSourceV10))context.earlyOracleSourceV10=permanent(MTG,game,a,entry.raw.name);
  context.conditionPlayerV9=operation.eventFilter==='opponent-player'||['combatDamageToPlayer','damageToPlayer'].includes(operation.event)?b:a;
  context.proofBranch=operation.proofBranch;
  if(entry.implementation.some(row=>row.kind==='chosen-subtype-entry-v16')){
    const prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.prompt===entry.raw.name+': choose a creature type'?'Elf':prior(g,q);context.chosenSubtypeV16='Elf';
  }
  installPaymentProof(MTG,context,{...v8Helpers(),trace:role==='ai'?context.aiDecisions:humanTrace});
  installCopyLinkedProof(MTG,context);installTokenFormsProof(MTG,context);installNameGroupsProof(MTG,context);installNameSearchProof(MTG,context);
  assertControllerRole(MTG, context, `${entry.raw.name}/${role}/${operation.kind}`);
  installEffectEvidence(context);
  if(flattenProofEffects(operation.effects).some(e=>['zone-exchange-v19','graveyard-edge-v19'].includes(e.action)))for(const player of game.players)for(const name of ['Mountain','Grizzly Bears','Island'])zoneCard(MTG,player,name,'graveyard');
  if(flattenProofEffects(operation.effects).some(e=>e.action==='sacrifice-except-v19'))for(const player of game.players)for(let i=0;i<5;i++)permanent(MTG,game,player,'Forest');
  context.colorStackEvidenceV18=[];const resolveColorV18=game.resolveTop;game.resolveTop=async function(...args){const object=this.stack.at(-1);if(object?.kind==='spell')context.colorStackEvidenceV18.push({object,colors:Array.from(object.card.colors)});return resolveColorV18.apply(this,args);};
  context.counterGroupFixtures=new Map();context.counterEvidence=[];const originalCounter=game.counterStackObject;game.counterStackObject=async function(object,...args){const result=await originalCounter.call(this,object,...args);context.counterEvidence.push({object,result});return result;};
  b.controller=recordingDecision(role==='ai'?context.aiDecisions:humanTrace);
  if(flattenProofEffects(operation.effects).some(effect=>effect.upToV17&&effect.action==='draw'))for(const player of game.players){const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>q.prompt==='Choose how many cards to draw'?q.max:prior(g,q);}
  if(flattenProofEffects(operation.effects).some(e=>e.action==='unsuspect-v19')){context.suspectedFixturesV19=[permanent(MTG,game,a,'Grizzly Bears'),permanent(MTG,game,b,'Grizzly Bears')];for(const c of context.suspectedFixturesV19)c.meta.suspected=true;game.recalc();}
  if(flattenProofEffects(operation.effects).some(e=>e.action==='exchange-life-v18')){a.life=210;b.life=205;if(flattenProofEffects(operation.effects).some(e=>e.maximumDifference!==undefined)){a.life=205;b.life=210;}}
  if(flattenProofEffects(operation.effects).some(e=>e.action==='reverse-tap-v18')){permanent(MTG,game,a,'Grizzly Bears').tapped=true;permanent(MTG,game,b,'Grizzly Bears');}
  fillLibrary(MTG, a, 60);
  fillLibrary(MTG, b, 60);
  for (let index = 0; index < 12; index++) {
    zoneCard(MTG, a, 'Forest', 'hand');
    zoneCard(MTG, b, 'Forest', 'hand');
  }
  fund(a, 100);
  fund(b, 100);
  await fundSnow(MTG,game,a,entry);
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
    const aura=entry.implementation.find(op=>op.kind==='aura-target');
    if(aura)wantedTargets.push(stageGenericTarget(MTG,context,auraProofTarget(aura,'you'),'counter-aura-host'));
    for(const op of entry.implementation)for(const [index,target]of(op.targets||[]).entries())if(target.zone!=='stack')wantedTargets.push(stageGenericTarget(MTG,context,target,index,op.effects?.find(effect=>effect.target===index)));
    const source = zoneCard(MTG, a, entry.raw.name, 'hand');
    stageCondition(MTG,context,operation.condition,source,v5Helpers());
    if(typeof operation.n==='object'&&!['paid-colors','paid-times'].includes(operation.n.kind))stageCount(MTG,context,operation.n,v5Helpers());
    const xVal = operation.n === 'X' ? 3 : 0;
    if(operation.optionalCostModeProofV14||operation.optionalVariantV14)context.optionalCostProofV14=true;
    const conditionAlt=prepareConditionPayment(MTG,context,entry);
    if(operation.n?.kind==='paid-colors')fundPaidColorEntry(MTG,a,entry);
    assert.equal(await game.castSpell(a, source, operation.n === 'X'
      ? { from: 'hand', xVal,...(conditionAlt?{alt:conditionAlt}:{}) } : operation.n?.kind==='paid-colors'||context.paymentCondition?.kind==='mana-spent'?{from:'hand'}:conditionAlt?{from:'hand',alt:conditionAlt}:{ from: 'hand', alt: { free: true } }), true,
    `${entry.raw.name}/${role}: counter-bearing permanent uses real cast`);
    const expected=operation.n?.kind==='paid-colors'?new Set((source.castMeta.paymentColors||[]).filter(c=>'WUBRG'.includes(c))).size*(operation.n.multiply??1):operation.n?.kind==='paid-times'?source.castMeta.paidTimes:operation.condition?.kind==='kicked'&&!source.castMeta.kicked?0:typeof operation.n==='object'?countValue(context,source,operation.n)*(operation.n.multiply??1):effectAmount(operation.n);
    while(source.zone==='stack')await game.resolveTop();
    assert.equal(source.zone, 'battlefield', `${entry.raw.name}/${role}: counter-bearing permanent resolves`);
    assert.equal(source.counters[operation.counter] || 0, expected,
      `${entry.raw.name}/${role}: exact entry counter count`);
    if(operation.tapped)assert.equal(source.tapped,true,entry.raw.name+': entry is tapped before any action');
    for(const keyword of operation.entryKeywordsV19||[])assert.equal(source.kw(keyword),!!source.castMeta.kicked,entry.raw.name+': keyword granted by entry');
    await resolveAll(game);
    return 1;
  }

  assert.ok(['generic-trigger','generic-ability','spell-generic'].includes(operation.kind),
    `${entry.raw.name}: known generic runtime operation`);
  const stagedTargets=[];
  if(operation.event==='exploited'||operation.effects?.some(effect=>effect.action==='exploit-v8')){
    const needsVictimStat=JSON.stringify(entry.implementation).includes('event-card-stat');
    context.exploitDonor=permanent(MTG,game,a,needsVictimStat?'Centaur Courser':'Suntail Hawk');
    if(needsVictimStat)permanent(MTG,game,b,'Grizzly Bears');
    if(operation.effects?.some(effect=>effect.action==='exploit-v8'))for(const trigger of entry.implementation.filter(row=>row.event==='exploited'))
      for(const [index,target]of(trigger.targets||[]).entries())target.zone==='stack'?await stageGenericStackTarget(MTG,context,target,'exploit-benefit-'+index):stageGenericTarget(MTG,context,target,'exploit-benefit-'+index,trigger.effects?.find(effect=>effect.target===index));
  }
  context.needsStackManaValue=JSON.stringify(operation.effects||[]).includes('"kind":"target-stat"')&&JSON.stringify(operation.effects||[]).includes('"stat":"mv"');
  for(const [index,printedTarget]of (operation.targets||[]).entries()){
    const target=printedTarget.zone==='mixed-v18'?printedTarget.alternatives[operation.proofMixedV18||0]:printedTarget;
    stagedTargets.push(target.zone==='stack'?await stageGenericStackTarget(MTG,context,target,index):stageGenericTarget(MTG,context,target,index,(operation.effects||[]).find(effect=>effect.target===index)));
  }
  wantedTargets = stagedTargets.flat();
  for(const effect of operation.effects||[]){
    if(effect.action==='exchange-control-v9'&&effect.group){const pair=[stagedTargets[effect.target]].flat();pair[0].ctrl=a;pair[1].ctrl=b;game.recalc();}
    if(effect.action==='give-control-v9'&&typeof effect.who==='number'&&typeof effect.target==='number'){
      const player=stagedTargets[effect.who],target=stagedTargets[effect.target];if(operation.targets[effect.target].controller==='any'){target.ctrl=player===a?b:a;game.recalc();}
    }
  }
  context.oracleProofTargets=stagedTargets;
  context.groupFixtures=new Map();
  context.zoneFixtures=new Map();
  const complementary=drawOrTokenBranches(operation.effects);
  const stageEffect=effect=>{
    if(effect.action==='kinship-v10'){
      const subtype=entry.raw.subtypes.find(type=>MTG.CREATURE_SUBTYPES.has(type));assert.ok(subtype,entry.raw.name+': printed creature type');
      context.kinshipTopV10=zoneCard(MTG,a,fixtureDefinition('Kinship top',['Creature'],{subtypes:[subtype],power:'2',toughness:'2'}),'library');
      for(const child of effect.effects)stageEffect(child);return;
    }
    if(effect.action==='radiance-v10'){
      const target=stagedTargets[effect.target];target.def={...target.def,colorsOverride:['R']};
      const secondary=stageGenericTarget(MTG,context,{what:effect.what,zone:'battlefield',controller:'opponent',color:'red'},'radiance-secondary',effect.effects[0]);secondary.def.colorsOverride=['W','U','B','R','G'];secondary.def.kws=[...(secondary.def.kws||[]),'shroud'];game.recalc();context.groupFixtures.set(effect,[secondary]);
      for(const child of effect.effects)stageEffect(child);return;
    }
    if(effect.action==='with-x-v10'){stageCount(MTG,context,effect.value,v5Helpers());for(const child of effect.effects)stageEffect(child);return;}
    if(effect.action==='choose-subtype-v10'){
      const bind=value=>value?.kind==='chosen-subtype-v10'?'Elf':Array.isArray(value)?value.map(bind):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,bind(child)])):value;
      const adjusted=bind(effect.effects);(context.chosenSubtypeProof||=new Map()).set(effect,adjusted);
      for(const child of adjusted)stageEffect(child);
      const harmful=adjusted.some(child=>child.action==='battlefield-group'&&(['destroy','exile','bounce','tap'].includes(child.operation)||child.power<0||child.toughness<0));
      const grave=adjusted.some(child=>child.action==='zone-select'&&child.zone==='graveyard');
      for(let i=0;i<6;i++)stageGenericTarget(MTG,context,{what:'creature',zone:grave?'graveyard':'battlefield',controller:harmful?'opponent':'you',subtype:'Elf'},'chosen-subtype-'+i);
      return;
    }
    if(effect.action==='set-life-v9'){for(const player of game.players)player.life=13+(effect.n?.kind==='lowest-life-v14'?player.idx*7:0);stageCount(MTG,context,effect.n,v5Helpers());}
    if(effect.action==='blight-v9'){
      const players=effect.who==='each-player'?game.players:effect.who==='each-opponent'?game.players.filter(p=>p!==a):effect.who==='you'?[a]:[stagedTargets[effect.who]];
      for(const player of players)permanent(MTG,game,player,fixtureDefinition('Blight recipient',['Creature'],{power:'1',toughness:'20000'}));
      for(const child of effect.effects||[])stageEffect(child);return;
    }
    if(effect.action==='choose-group-v9'){
      const harmful=effect.effects.some(e=>['destroy','exile','bounce','tap'].includes(e.operation)||e.power<0||e.toughness<0);
      for(const child of effect.effects){
        stageEffect(child);
        for(let i=0;i<5;i++){
          const card=stageGenericTarget(MTG,context,{...child.filters[0],controller:harmful?'opponent':'you'},'chosen-group-'+i,{action:child.operation});
          if(child.operation==='untap')card.tapped=true;
          (context.groupFixtures.get(child)||[]).push(card);
        }
      }return;
    }
    if(effect.action==='player-sequence-v9'&&['each-player','each-opponent'].includes(effect.who)){
      const old=context.oracleProofTargets;
      for(const player of effect.who==='each-player'?game.players:game.players.filter(p=>p!==a)){context.oracleProofTargets=[player];for(const child of effect.effects)stageEffect(child);}
      context.oracleProofTargets=old;return;
    }
    if(effect.action==='discover-v9'){
      zoneCard(MTG,a,effect.n===0?'Ornithopter':'Llanowar Elves','library');
      for(let i=0;i<2;i++)zoneCard(MTG,a,'Forest','library');
    }
    if(effect.action==='role-token-v8'&&effect.filters)for(const filter of effect.filters)stageGenericTarget(MTG,context,filter,'role-host');
    if(effect.action==='move-to-library'&&effect.filters)for(const filter of effect.filters)for(const controller of ['you','opponent'])stageGenericTarget(MTG,context,{...filter,controller},'library-group');
    if(complementary&&effect===complementary[operation.proofBranch===false?0:1])return;
    if(effect.action==='conditional'&&effect.condition.kind==='not'&&effect.condition.condition?.kind==='count-comparison'&&effect.condition.condition.count.zone==='battlefield')
      (context.prepareSourceConditions||=[]).push(source=>(effect.elseEffects&&operation.proofBranch===false?stageCondition:stageFalseCondition)(MTG,context,effect.condition.condition,source,v5Helpers()));
    if(effect.action==='clash-v8')stageClashLibraries(MTG,context,operation.proofBranch!==false);
    if(effect.action==='move-counters-v8'&&typeof effect.sourceTarget==='number')for(const card of [stagedTargets[effect.sourceTarget]].flat().filter(Boolean))stageCounterTransferCard(context,card,effect);
    if(effect.action==='destroy-player-auras-v17'){
      context.curseFixturesV17=[a,b].map(player=>{const card=permanent(MTG,game,b,fixtureDefinition('Player Curse witness',['Enchantment'],{subtypes:['Aura','Curse']}));card.meta.cursedPlayer=player;return card;});
    }
    if(effect.action==='remove-counters-v8'){
      if(effect.filters)for(const filter of effect.filters)for(const controller of filter.controller==='any'?['you','opponent']:[filter.controller])stageCounterEffectCard(context,stageGenericTarget(MTG,context,{...filter,controller},'counter-removal-group'),effect);
      else for(const card of [stagedTargets[effect.target]].flat().filter(Boolean))stageCounterEffectCard(context,card,effect);
    }
    if(effect.action==='copy-stack-v8'&&typeof effect.n==='object')stageCount(MTG,context,effect.n,v8Helpers());
    if(effect.action==='choose-damage-source-v8')permanent(MTG,game,b,fixtureDefinition('Chosen source witness',['Creature',...(effect.quality.type?[effect.quality.type]:[])],{power:'8',toughness:'40',colorsOverride:effect.quality.colors||['R']}));
    stageV8Effect(MTG,context,effect,v8Helpers());
    stageMultizoneSearch(MTG,context,effect,v8Helpers());
    stagePlayPermission(MTG,context,effect,v8Helpers());
    stageCardResults(MTG,context,effect,v8Helpers());
    stageEnergy(MTG,context,effect,v8Helpers());stageRevealed(MTG,context,effect,v8Helpers());
    stagePaymentEffect(MTG,context,effect,v8Helpers());
    stageCopyLinkedEffect(MTG,context,effect,v8Helpers());
    if(effect.action==='zone-random-v14')for(let i=0;i<(effect.n==='X'?3:effect.n)+1;i++)effect.filterV15?stageGenericTarget(MTG,context,{...effect.filterV15,controller:'you'},'random-grave-'+i):zoneCard(MTG,a,'Forest','graveyard');
    if(effect.action==='unless-cost-v14'){
      for(const cost of effect.payment.choices||[effect.payment]){
        if(cost.xValue&&cost.xValue.kind!=='cast-x-v14')stageCount(MTG,context,cost.xValue,v5Helpers());
        if(cost.target==='self')stagePaymentEffect(MTG,context,{action:'resolution-cost',payment:cost},v8Helpers());
        if(cost.zone&&cost.target===undefined&&cost.n!=='all')for(const controller of ['you','opponent'])for(let i=0;i<cost.n;i++){
          const card=stageGenericTarget(MTG,context,{what:'card',...cost.filter,controller,zone:cost.zone==='hand'?'graveyard':cost.zone},'unless-v14-payment-'+i);
          if(cost.zone==='hand'){card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone='hand';card.owner.hand.push(card);}
        }
      }
    }
    if(effect.action==='damage-batch')for(const hit of effect.hits)for(const filter of hit.filters||[])for(const controller of ['you','opponent'])stageGenericTarget(MTG,context,{...filter,controller:filter.controller==='any'?controller:filter.controller},'damage-batch-probe',{action:'damage',n:typeof hit.n==='number'?hit.n:1});
    if(effect.action==='unless-cost')for(const cost of effect.payment.choices||[effect.payment])if(cost.zone)for(const controller of ['you','opponent'])for(let i=0;i<cost.n;i++){
      const card=stageGenericTarget(MTG,context,{...cost.filter,controller,zone:cost.zone==='hand'?'graveyard':'battlefield'},'unless-payment-'+i);
      if(cost.zone==='hand'){card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone='hand';card.owner.hand.push(card);}
    }
    if(['scale-pt','switch-pt','double-counters'].includes(effect.action)&&effect.filters)for(const filter of effect.filters)stageGenericTarget(MTG,context,{...filter,controller:filter.controller==='any'?'you':filter.controller},'stat-effect');
    if(effect.action==='double-counters')for(const card of effect.filters?game.bf().filter(card=>effect.filters.some(filter=>matchesTarget(card,filter,context,null))):[stagedTargets[effect.target]].flat().filter(Boolean)){card.counters[effect.counter==='all'?'+1/+1':effect.counter]=2;game.recalc();}
    if(['goad','suspect'].includes(effect.action)&&effect.filters)for(const filter of effect.filters)stageGenericTarget(MTG,context,{...filter,controller:filter.controller==='any'?'opponent':filter.controller},'political-effect');
    if(effect.action==='phase-out-v8'&&effect.filters)for(const filter of effect.filters)stageGenericTarget(MTG,context,filter,'phase-out-group');
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
      if(subject instanceof MTG.CardInst&&condition.stat==='mv'){subject.def.cost='{'+condition.threshold+'}';game.recalc();}
      if(subject instanceof MTG.CardInst&&['power','toughness'].includes(condition.stat)&&typeof condition.threshold==='number'){
        const value=condition.comparison==='less'?Math.max(0,condition.threshold-1)
          :condition.comparison==='greater'?condition.threshold+1:condition.threshold;
        subject.def[condition.stat]=String(value);
        if(condition.stat==='power')subject.def.toughness=String(Math.max(Number(subject.def.toughness)||0,20));
        game.recalc();
      }
    }
    if(effect.action==='conditional'&&effect.condition.kind==='player-condition-v15'){
      const player=effect.condition.who==='sequence-player-v15'?context.oracleProofTargets?.[0]:[stagedTargets[effect.condition.who]].flat()[0];
      assert.ok(player instanceof MTG.Player);stageCondition(MTG,{...context,a:player},effect.condition.condition,{castMeta:{}},v5Helpers());
    }else if(effect.action==='conditional'&&effect.condition.kind!=='source-stat-comparison'&&effect.condition.kind!=='kicked'&&!(effect.elseEffects&&operation.proofBranch===false))stageCondition(MTG,context,effect.condition,stagedTargets[effect.conditionTarget]||{castMeta:{}},v5Helpers());
    if(['count','sum','party','devotion','turn-count','attacked-creature-count-v10','source-attachments','opponent-poison-total','opponent-count','casting-live-count-v8','casting-turn-count-v8'].includes(effect.n?.kind))stageCount(MTG,context,effect.n,v5Helpers());
    if(effect.n?.kind==='target-count'){
      const player=effect.n.target?.kind==='target-controller'?[stagedTargets[effect.n.target.index]].flat()[0]?.ctrl:typeof effect.n.target==='number'?stagedTargets[effect.n.target]:b;
      if(player instanceof MTG.Player)stageCount(MTG,{...context,a:player,b:player===a?b:a},effect.n.count,v5Helpers());
    }
    if(typeof effect.unlessGeneric==='object')stageCount(MTG,context,effect.unlessGeneric,v5Helpers());
    if(effect.multiplier)effect.multiplier.kind==='v8-target-permanent-count'?stageCount(MTG,{...context,countSource:stagedTargets[effect.multiplier.target]},effect.multiplier.count,v5Helpers()):stageCount(MTG,context,effect.multiplier,v5Helpers());
    if(effect.action==='token-inline')for(const stat of [effect.token.power,effect.token.toughness])if(typeof stat==='object')stageCount(MTG,context,stat,v5Helpers());
    if(['token-inline','token-key'].includes(effect.action)&&effect.n?.kind==='count'&&effect.n.zone==='battlefield'){const card=stageGenericTarget(MTG,context,effect.n.filters?.[0]||{what:effect.n.what,controller:'you'},'token-count');if(!effect.n.filters?.[0]?.stat){card.def.power='1';game.recalc();}}
    for(const stat of [effect.power,effect.toughness])if(stat?.kind==='signed'&&typeof stat.value==='object')stageCount(MTG,context,stat.value,v5Helpers());
    if(effect.action==='choose-permanents')for(const controller of ['you','opponent'])for(let i=0;i<Math.max(2,Number(effect.n)||3);i++){const card=stageGenericTarget(MTG,context,{...effect.filter,controller},i);if(effect.operation==='untap')card.tapped=true;}
    if(effect.action==='optional-sacrifice')stageGenericTarget(MTG,context,{...effect.filter,controller:'you'},'optional-cost');
    if(effect.action==='zone-select'){
      const cards=[];
      for(const controller of ['you','opponent'])for(let i=0;i<Math.max(2,Number(effect.n)||1);i++){
        const card=stageGenericTarget(MTG,context,{...effect.filter,zone:'graveyard',controller},i);
        if(effect.zone!=='graveyard'){
          card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);
          card.zone=effect.zone;card.owner[effect.zone].push(card);
        }
        cards.push(card);
      }
      context.zoneFixtures.set(effect,cards);
    }
    if(effect.action==='battlefield-group'||['gain-control','pump-group','remove-keywords-v9'].includes(effect.action)&&effect.filters){
      if(effect.attachedToV12&&effect.target==='attached-host')return;
      const cards=[];
      for(const target of effect.filters)for(const controller of ['you','opponent']){
        const holder=effect.attachedToV12?(effect.target==='event-card'&&operation.eventFilter?.kind==='self-creature-combat'?(context.eventCombatOtherV13||=stageGenericTarget(MTG,context,{...operation.eventFilter.otherFilter,controller:'opponent'},'combat-other')):[stagedTargets[effect.target]].flat()[cards.length%[stagedTargets[effect.target]].flat().length]):null;
        const card=stageGenericTarget(MTG,context,{...target,controller:target.controller==='any'?controller:target.controller},cards.length,{action:effect.operation,attachmentHostV14:holder});
        if(effect.attachedToV12){const host=holder;assert.ok(host);const prior=game.byIid(card.attachedTo);if(prior)prior.attachments=prior.attachments.filter(iid=>iid!==card.iid);card.attachedTo=host.iid;host.attachments.push(card.iid);
          const burn=operation.effects.find(other=>other.action==='damage'&&other.target===effect.target&&typeof other.n==='number');
          if(burn&&host.is('Creature')&&!host.def.oracleImplementation){host.def={...host.def,power:String(burn.n),toughness:String(burn.n),cost:'{8}'};game.recalc();}
        }
        card.tapped=!!target.tapped||effect.operation==='untap';cards.push(card);
      }
      context.groupFixtures.set(effect,cards);
    }
    if(effect.action==='unattach-equipment-v9'){
      const host=[stagedTargets[effect.target]].flat()[0];
      if(host){const equipment=zoneCard(MTG,a,'Bonesplitter','hand');a.hand.splice(a.hand.indexOf(equipment),1);equipment.zone='battlefield';game.battlefield.push(equipment);equipment.attachedTo=host.iid;host.attachments.push(equipment.iid);(context.unattachEquipment||=[]).push(equipment);}
    }
    if(['base-pt','animate','grant-protection','combat-restriction'].includes(effect.action)&&effect.filters)for(const filter of effect.filters)stageGenericTarget(MTG,context,filter,'base-group');
    if(effect.action==='animate'&&effect.power===undefined&&effect.toughness===undefined){for(const card of game.bf())if(card.hasSub('Vehicle')&&!card.def.oracleImplementation){card.def={...card.def,power:'4',toughness:'4'};}game.recalc();}
    if(effect.action==='draw-followup-v15'&&effect.discardNonland)zoneCard(MTG,a,fixtureDefinition('Oracle Drawn Nonland',['Artifact']), 'library');
    if(effect.action==='inspect-top'&&effect.filter){const card=stageGenericTarget(MTG,context,{...effect.filter,controller:'you',zone:'graveyard'},'inspect-top');a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='library';a.library.push(card);}
    if(['base-pt','animate'].includes(effect.action))for(const value of [effect.power,effect.toughness])if(typeof value==='object')stageCount(MTG,context,value,v5Helpers());
    if(['reveal-hand-discard','discard-filtered-v17'].includes(effect.action)&&effect.filter){const card=stageGenericTarget(MTG,context,{...effect.filter,controller:'opponent',zone:'graveyard'},'revealed-hand');b.graveyard.splice(b.graveyard.indexOf(card),1);card.zone='hand';b.hand.push(card);}
    if(['search-library','put-from-hand','look-select'].includes(effect.action)){
      if(effect.filter){for(let i=0;i<Math.max(3,Number(effect.n)||1);i++){const card=stageGenericTarget(MTG,context,{...effect.filter,controller:'you',zone:'graveyard'},'filtered-search-'+i);if(effect.filter.stat==='mv'&&JSON.stringify(effect.filter.threshold).includes('sacrificed-stat'))card.def.cost='{'+i+'}';a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='library';a.library.push(card);}}
      const what=effect.what;
      const type=what==='basic land'?'Land':what.split(' or ')[0];
      const cardType=['creature','artifact','land','enchantment','planeswalker','instant','sorcery','permanent','card','nonland permanent'].includes(type.toLowerCase())?(type==='card'||type.includes('permanent')?'Creature':type[0].toUpperCase()+type.slice(1).toLowerCase()):'Creature';
      if(!effect.filter)for(let i=0;i<Math.max(3,Number(effect.n)||1);i++){
        const card=new MTG.CardInst(fixtureDefinition(effect.name||'Oracle Searched '+i,[cardType],{cost:'{0}',power:'4',toughness:'20',...(cardType==='Planeswalker'?{loyalty:'4'}:{}),super:what==='basic land'?['Basic']:[],subtypes:[type.replace(/ permanent$/,'')]}),a);
        card.zone=effect.action==='put-from-hand'?'hand':'library';a[card.zone].push(card);
      }
    }
    for(const child of effect.action==='coin-flip-v8'?[...effect.effects,...effect.elseEffects,...(effect.afterEffects||[])]:effect.elseEffects&&operation.proofBranch===false?effect.elseEffects:effect.effects||[])stageEffect(child);
  };
  for(const effect of operation.effects||[])stageEffect(effect);
  if(operation.effects?.some(effect=>effect.action==='conditional'&&effect.condition?.kind==='count-comparison'&&effect.condition.count.zone==='library'&&effect.condition.max===0&&effect.effects.some(child=>child.action==='win-game-v9'))){
    const draws=operation.effects.filter(effect=>effect.action==='draw'&&effect.who==='you').reduce((n,effect)=>n+Number(effect.n),0);
    while(a.library.length>draws){const card=a.library.shift();card.zone='exile';a.exile.push(card);}
  }
  for(const target of stagedTargets.flat())if(target?.is?.('Planeswalker')&&!target.def.oracleImplementation)target.counters.loyalty=Math.max(20000,target.counters.loyalty||0);
  game.recalc();
  for(const effect of operation.effects||[])if(effect.action==='counter-spells'){const objects=[];for(let i=0;i<2;i++)objects.push(await stageGenericStackTarget(MTG,context,effect.filter,'overload-'+i));context.counterGroupFixtures.set(effect,objects);}
  // Quality-conditioned target proofs need a useful qualifying target. Keep
  // the unrelated group-effect probes weaker, without replacing AI decisions.
  const groupPower=JSON.stringify(operation).includes('"kind":"source-quality"')?'100':'20000';
  const groupCreature = permanent(MTG, game, a, fixtureDefinition('Oracle Generic Group Creature', ['Creature'], {
    power: groupPower, toughness: '20000',
  }));
  const secondGroupCreature=operation.kind==='spell-generic'?permanent(MTG,game,a,fixtureDefinition('Oracle Second Group Creature',['Creature'],{power:groupPower,toughness:'20000'})):null;
  const hostileGroupCreature=permanent(MTG,game,b,fixtureDefinition('Oracle Hostile Group Creature',['Creature'],{power:groupPower,toughness:'20000'}));
  if((groupPower==='100'||operation.effects?.some(effect=>effect.attachedToV12&&typeof effect.target==='number'))&&operation.targets?.length){for(const card of [groupCreature,secondGroupCreature,hostileGroupCreature].filter(Boolean))card.def.kws=['shroud'];game.recalc();}
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
  if(cost.sacFilter)for(let i=0;i<(cost.sacN==='X'?3:cost.sacN||1);i++)sacrificeFixtures.push(stageGenericTarget(MTG,context,{...cost.sacFilter,controller:'you'},'cost-'+i));
  if(cost.sacN==='X'&&cost.sacWhat)for(let i=0;i<3;i++)sacrificeFixtures.push(permanent(MTG,game,a,fixtureDefinition('V19 variable sacrifice '+i,[cost.sacWhat[0].toUpperCase()+cost.sacWhat.slice(1)],{power:'0',toughness:'1'})));
  const exileCostFixtures=[];
  if(cost.exileFilter)for(let i=0;i<(cost.exileFromGY||1);i++){
    const card=stageGenericTarget(MTG,context,{...cost.exileFilter,controller:'you',zone:'graveyard'},'exile-cost-'+i);
    if(!cost.exileFilter.stat)card.def={...card.def,cost:'{0}',power:'0',toughness:'1',...(cost.exileFilter.what==='card'&&Object.keys(cost.exileFilter).every(key=>['what','zone','controller','min','count'].includes(key))?{types:['Artifact']}:{} )};
    exileCostFixtures.push(card);
  }
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
  wantedCards = [...sacrificeFixtures, ...activatedCostStage.wantedCards,...exileCostFixtures];
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
  // Control-transfer proofs need an actual transfer, with no irrelevant
  // same-controller alternatives introduced by generic count fixtures.
  if(operation.kind==='spell-generic'&&operation.effects?.length&&operation.effects.every(effect=>['give-control-v9','exchange-control-v9'].includes(effect.action))){
    for(const fixture of [groupCreature,secondGroupCreature,hostileGroupCreature].filter(Boolean))await game.move(fixture,'exile');
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
      const definitions = (source.def.triggers || []).filter(trigger => !trigger.stateTest&&trigger.oracleExertAttackIndex===undefined&&descriptions.has(trigger.desc));
      const ordinal=genericOperations.indexOf(operation.originalOperation||operation);
      const offset=genericOperations.slice(0,ordinal).reduce((sum,op)=>sum+(Array.isArray(op.event)?op.event.length:1),0);
      const eventOffset=Array.isArray(operation.originalOperation?.event)?operation.originalOperation.event.indexOf(operation.event):0;
      operationRun = operation.exertAttackIndex!==undefined?source.def.triggers.find(trigger=>trigger.oracleExertAttackIndex===operation.exertAttackIndex)?.run||null:definitions[offset+eventOffset]?.run || null;
    }
    if (expectedKind && !witnessedObject && object && object.kind === expectedKind && object.srcCard === source &&
        (!operationRun || object.run === operationRun) && Array.isArray(object.targets)) {
      witnessedObject=object;
      const sourceVersion=object.ctx?.sourceZoneVersion;
      if(sourceVersion!==undefined&&sourceVersion!==source.zoneVersion){
        const snapshot=source.battlefieldLKI?.get(sourceVersion);
        if(snapshot)context.sourceLkiEvidenceV10={source,snapshot};
      }
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
      context.eventPlayer=object.ctx?.oracleSourceCapture?.eventPlayer||object.ctx?.data?.player;context.eventAmount=object.ctx?.oracleSourceCapture?.eventAmount??object.ctx?.data?.n;
      context.defendingPlayer=object.ctx?.oracleSourceCapture?.defendingPlayer;
      context.eventCard=object.ctx?.oracleSourceCapture?.eventCard||(operation.event==='blocks'?object.ctx?.data?.blocker:object.ctx?.data?.card);
      context.eventStackV10=object.ctx?.oracleSourceCapture?.eventStackV10;
      context.eventManaSpentV10=object.ctx?.oracleSourceCapture?.eventManaSpentV10;
      context.eventSpellMvV10=object.ctx?.oracleSourceCapture?.eventSpellMvV10;
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
    const graveyardCast=operation.proofBranch!==false&&castOrigin&&(entry.implementation||[]).find(candidate=>candidate.kind==='mechanic-flashback');
    const from=operation.preparedSpellV10?'exile':graveyardCast?'graveyard':operation.splitFace?.aftermath?'graveyard':'hand';
    let preparer;
    if(operation.preparedSpellV10){
      preparer=permanent(MTG,game,a,operation.preparedSpellV10);source=MTG.oraclePrepareV10(game,preparer);
      assert.ok(source,entry.raw.name+': prepared face creates its own spell copy in exile');
      assert.equal(source.def.cost,entry.raw.cost);assert.equal(source.is('Creature'),false);
    }else source=zoneCard(MTG,a,entry.raw.name,from);
    trackedCards.push(source);
    await prepareAttachedEffectSource(MTG,context,source,operation);
    preparePaymentSource(MTG,context,source);
    prepareGenericCountSource(context,operation,source);
    await prepareCopyLinkedSource(MTG,context,entry,operation,source,v8Helpers());
    before=genericProofSnapshot(context,trackedCards);
    const splitAlt=operation.cleaveVariantV10?source.def.altCosts.find(option=>option.oracleCleaveV10):operation.overloadVariant?source.def.altCosts.find(option=>option.overloaded):operation.splitFace?{splitHalf:operation.splitFace.key}:operation.splitFuse?{splitFuse:'right'}:null;
    if(source.def.replicate){for(const color of Object.keys(a.pool))a.pool[color]=0;const cost=MTG.parseCost(entry.raw.cost);a.pool.C=cost.generic+(cost.x||0)*3;for(const pip of cost.pips)a.pool[pip.find(c=>'WUBRGC'.includes(c))]++;}
    const entwineMarker=(entry.implementation||[]).find(candidate=>candidate.kind==='mechanic-entwine');
    if(entwineMarker&&!operation.entwineProof&&entwineMarker.cost.kind==='mana'){
      for(const color of ['W','U','B','R','G','C'])a.pool[color]=0;
      const printed=MTG.parseCost(entry.raw.cost||'');a.pool.C=printed.generic+(printed.x||0)*proofXValue(operation);
      for(const pip of printed.pips){const color=pip.find(symbol=>'WUBRGC'.includes(symbol));a.pool[color]++;}
    }
    if(operation.optionalCostModeProofV14||operation.optionalVariantV14)context.optionalCostProofV14=true;
    const conditionAlt=prepareConditionPayment(MTG,context,entry);
    const graveyardAlt=graveyardCast?game.castableList(a).find(row=>row.card===source&&row.alt?.flashback)?.alt:null;
    if(graveyardCast)assert.ok(graveyardAlt,entry.raw.name+': the printed graveyard permission is offered');
    if(!source.def.cost&&source.def.suspend)await castThroughSuspend(MTG,game,a,source);
    else assert.equal(await game.castSpell(a,source,{from,xVal:proofXValue(operation),...(graveyardAlt?{alt:graveyardAlt}:{}),...(operation.adventure?{alt:{...source.def.adventure,adventure:true}}:splitAlt?{alt:splitAlt}:conditionAlt?{alt:conditionAlt}:{})}),true,`${entry.raw.name}/${role}: paid generic spell cast`);
    before.players.set(a,playerState(a));
    const object=game.stack.find(row=>row.kind==='spell'&&row.card===source);assert.ok(object,`${entry.raw.name}/${role}: actual spell Stack`);
    if(preparer){assert.equal(preparer.meta.prepared,false);assert.equal(preparer.zone,'battlefield');assert.equal(object.from,'exile');assert.equal(object.card.isCopySpell,true);assert.equal(object.manaSpent,MTG.mv(entry.raw.cost,object.x));}
    if(operation.modal&&(operation.modal.escalateCostV10||operation.modal.modes.some(mode=>mode.tierCostV10))){
      const tiers=Array.from(object.mode).reduce((sum,index)=>sum+MTG.mv(operation.modal.modes[index].tierCostV10||'{0}'),0);
      const escalate=(object.mode.length-1)*MTG.mv(operation.modal.escalateCostV10||'{0}');
      assert.equal(object.manaSpent,MTG.mv(entry.raw.cost,object.x)+tiers+escalate,entry.raw.name+': each selected additional modal cost is paid');
    }
    if(entry.implementation.some(operation=>operation.kind==='mechanic-additional-costs'))assertOracleCastingCostRecord(source,object,entry);
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
    if(operation.cleaveCostV10){assert.equal(!!object.castOpts.oracleCleaveV10,!!operation.cleaveVariantV10);assert.equal(object.manaSpent,MTG.mv(operation.cleaveVariantV10?operation.cleaveCostV10:entry.raw.cost,object.x),entry.raw.name+': exact chosen Cleave or ordinary cost paid');}
    if(splitAlt){const cost=operation.splitFace?.cost||entry.raw.cost;assert.equal(game.stackSpellManaValue(object),MTG.mv(cost,object.x),entry.raw.name+': printed spell mana value');assert.equal(source.mv,MTG.mv(cost,object.x));}
    selectedTargets=object.targets.slice();before.oracleX=object.x??0;await settleWithStackWitness(game,stackTargets);selectedTargets=object.targets.map((target,index)=>Array.isArray(selectedTargets[index])?target:selectedTargets[index]);
    if(preparer)assert.equal(source.zone,'ceased',entry.raw.name+': resolved prepare copy ceases to exist');
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
    const counterKeyword = (entry.implementation || []).some(candidate => ['mechanic-modular','mechanic-graft'].includes(candidate.kind));
    if (counterKeyword && !operation.from) {
      source=zoneCard(MTG,a,entry.raw.name,'hand');const paid=poolTotal(a);
      assert.equal(await game.castSpell(a,source,{from:'hand'}),true,entry.raw.name+': counter-keyword source uses a paid cast');
      assert.ok(poolTotal(a)<paid);await resolveAll(game);
      assert.equal(source.zone,'battlefield',entry.raw.name+': printed entry counters keep its source alive');
    } else if (entryCounters && !operation.from) {
      source = zoneCard(MTG, a, entry.raw.name, 'hand');
      stageCondition(MTG,context,entryCounters.condition,source,v5Helpers());
      if(typeof entryCounters.n==='object'&&!['paid-colors','paid-times'].includes(entryCounters.n.kind))stageCount(MTG,context,entryCounters.n,v5Helpers());
      if(entryCounters.n?.kind==='paid-colors')fundPaidColorEntry(MTG,a,entry);
      assert.equal(await game.castSpell(a, source, entryCounters.n === 'X'
        ? { from: 'hand', xVal: 3 } : entryCounters.n?.kind==='paid-colors'?{from:'hand'}:{ from: 'hand', alt: { free: true } }), true,
      `${entry.raw.name}/${role}: counter-paying ability source enters through the real Stack`);
      await resolveAll(game);
      assert.equal(source.zone, 'battlefield', `${entry.raw.name}/${role}: ability source enters with its counters`);
      if(entryCounters.n?.kind==='paid-colors'){
        const colors=new Set((source.castMeta.paymentColors||[]).filter(color=>'WUBRG'.includes(color))).size;
        assert.equal(source.counters[entryCounters.counter]||0,colors*(entryCounters.n.multiply??1),entry.raw.name+': paid entry produces the printed Sunburst counters');
        // Entry funding deliberately spends every supplied pip. The later
        // activation has its own independently paid mana cost (Heliophial,
        // Suncrusher); restore the normal ability fixture's mana only now.
        for(const color of ['W','U','B','R','G','C'])a.pool[color]=100;
      }
      // Resolving the source and its entry triggers also settles an earlier
      // Stack fixture. Announce a fresh real spell for a counter ability.
      for(const [index,target]of(operation.targets||[]).entries())if(target.zone==='stack'&&!game.stack.includes(stagedTargets[index])){
        stagedTargets[index]=await stageGenericStackTarget(MTG,context,target,index);
        if(stagedTargets[index]?.card)trackedCards.push(stagedTargets[index].card);
      }
      wantedTargets=stagedTargets.flat();
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
    } else source = context.earlyOracleSourceV10||(operation.from?zoneCard(MTG,a,entry.raw.name,operation.from):permanent(MTG, game, a, entry.raw.name));
    if(!source.meta.oracleChosenColor)await enterChosenColorSource(MTG,context,entry,source,v5Helpers());
    const aura=(entry.implementation||[]).find(candidate=>candidate.kind==='aura-target');
    if(aura&&source.zone==='battlefield'&&!source.attachedTo){
      const host=stageGenericTarget(MTG,context,auraProofTarget(aura,'you'),'ability-aura-host');
      await game.attach(source,host);trackedCards.push(host);
    }
    await prepareAttachedEffectSource(MTG,context,source,operation);
    preparePaymentSource(MTG,context,source);
    prepareGenericCountSource(context,operation,source);
    await prepareCopyLinkedSource(MTG,context,entry,operation,source,v8Helpers());
    await prepareSourceProgression(MTG,context,source,entry,operation);
    await prepareStackCopySource(MTG,context,operation,v8Helpers());
    if(operation.loyalty!==undefined)source.counters.loyalty=Math.max(Number(entry.raw.loyalty),operation.loyalty==='-X'?4:-operation.loyalty+1);
    if(operation.activationCondition?.kind==='source-quality'&&operation.activationCondition.filter.what==='creature'&&!source.is('Creature')){
      const animation=game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleOperation?.effects?.some(effect=>effect.action==='animate'&&effect.target==='self'));
      assert.ok(animation,entry.raw.name+': printed animation satisfies the activation condition');fund(a,100);assert.equal(await game.activateAbility(a,animation),true);await resolveAll(game);assert.equal(source.is('Creature'),true);
    }
    stageCondition(MTG,context,operation.activationCondition,source,v5Helpers());
    stageActivationRuleCost(MTG,context,cost,source,v5Helpers());
    trackedCards.push(...stageOracleCounterCost(MTG,context,cost,source,v5Helpers()));
    if(operation.publicActivatorProof==='opponent'){source.ctrl=b;game.recalc();}
    source.sick=false;
    if(cost.tap)game.untap(source);
    if(operation.forecast){game.turnPlayer=a;game.phase='upkeep';}
    if(cost.rmCounter && (source.counters[cost.rmCounter.kind]||0)<cost.rmCounter.n)game.addCounters(source,cost.rmCounter.kind,cost.rmCounter.n,false,a);
    if(operation.effects?.some(effect=>effect.action==='double-counters'&&effect.target==='self')){source.counters['+1/+1']=2;game.recalc();}
    trackedCards.push(source);
    before = genericProofSnapshot(context, trackedCards);
    const ordinal = (entry.implementation || []).filter(candidate => candidate.kind === 'generic-ability'&&!candidate.from)
      .indexOf(operation.originalOperation||operation);
    const compiled = operation.from==='hand'?source.def.handAbility:operation.from==='graveyard'?source.def.gyAbility:(source.def.abilities || []).filter(ability => ability.oracleCompiled)[ordinal];
    assert.ok(compiled, `${entry.raw.name}/${role}: compiled generic ability ${ordinal + 1}`);
    operationRun = compiled.run;
    const action = game.activatableList(a).find(candidate => candidate.card === source && (operation.from==='hand'?candidate.handAbility:operation.from==='graveyard'?candidate.gyAbility:candidate.ability === compiled));
    assert.ok(action, `${entry.raw.name}/${role}: generic ability is genuinely activatable`);
    if(operation.publicActivatorProof){
      assert.equal(compiled.oracleAnyPlayer,true,entry.raw.name+': printed permission is compiled');
      assert.equal(!!action.anyPlayerAbility,operation.publicActivatorProof==='opponent',entry.raw.name+': public ability is offered to the correct activator');
    }
    const beforePayment = before;
    const manaBefore = poolTotal(a);
    const adjustedCostWitness = captureActivationRuleCost(MTG,context,cost,source,compiled);
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
    assertActivationRuleCost(context,adjustedCostWitness,`${entry.raw.name}/${role}`);
    if(operation.forecast){
      assert.equal(source.zone,'hand',entry.raw.name+': Forecast retains its revealed source');
      assert.ok(game.forecastRevealedCards().includes(source),entry.raw.name+': Forecast stays publicly revealed during this upkeep');
      assert.equal(game.activatableList(a).some(candidate=>candidate.card===source&&candidate.handAbility),false,entry.raw.name+': Forecast cannot be activated twice this turn');
    }
    if(operation.loyalty!==undefined){assert.equal(source.counters.loyalty??source.battlefieldLKI?.get(beforePayment.cards.get(source).zoneVersion)?.counters?.loyalty??0,beforePayment.cards.get(source).counters.loyalty+(operation.loyalty==='-X'?-Number(trace.findLast(row=>row.query.type==='chooseX')?.result):operation.loyalty),entry.raw.name+': exact loyalty cost paid');assert.equal(game.activatableList(a).some(candidate=>candidate.card===source&&candidate.ability.loyalty!==undefined),false,entry.raw.name+': loyalty shared once each turn');}
    if(operation.oncePerObject||operation.onceEachTurn)assert.equal(game.activatableList(a).some(candidate=>candidate.card===source&&candidate.ability===compiled),false,entry.raw.name+': limit enforced after payment');
    if (cost.tap) assert.ok(tappedCosts.includes(source), `${entry.raw.name}/${role}: tap cost changes state before sacrifice can reset it`);
    if(cost.untapSelf){assert.equal(beforePayment.cards.get(source).tapped,true,entry.raw.name+': untap cost started tapped');assert.equal(source.tapped,false,entry.raw.name+': untap cost paid before resolution');}
    if(cost.tapFilter)assert.equal(tappedCosts.filter(card=>card!==source||!cost.tap).filter(card=>matchesTarget(card,cost.tapFilter,context,source)).length,cost.tapN,entry.raw.name+': exact filtered tap cost');
    if(cost.exileSelf)assert.equal(source.zone,'exile',entry.raw.name+': exile cost paid');
    if (cost.sacSelf) assert.equal(source.zone, 'graveyard', `${entry.raw.name}/${role}: source sacrifice is paid`);
    if (cost.life) assert.equal(a.life, beforePayment.players.get(a).life - cost.life,
      `${entry.raw.name}/${role}: exact life cost is paid before resolution`);
    if (cost.rmCounter) assert.equal(source.counters[cost.rmCounter.kind] || 0,
      (beforePayment.cards.get(source).counters[cost.rmCounter.kind] || 0) - cost.rmCounter.n,
    `${entry.raw.name}/${role}: exact counter cost is removed before resolution`);
    assertActivatedCost(context, cost, source, beforePayment, trace, `${entry.raw.name}/${role}`);
    assertEnergyCost(MTG,context,cost,source,`${entry.raw.name}/${role}`);
    assertOracleCounterCost(context,cost,source,beforePayment,`${entry.raw.name}/${role}`,trace);
    if (cost.sacCreature || cost.sacOther || cost.sacWhat || cost.sacFilter) {
      if(cost.sacN==='X'){const choice=trace.findLast(row=>row.query.aiHint?.kind==='sacX');assert.ok(choice);for(const card of choice.result)assert.equal(game.battlefield.includes(card),false,`${entry.raw.name}/${role}: every chosen sacrifice leaves before resolution`);}
      else assert.ok(beforePayment.battlefield.some(card => !game.battlefield.includes(card)),`${entry.raw.name}/${role}: sacrifice cost removes a chosen permanent before resolution`);
    }
    if (cost.discard) assert.ok(a.graveyard.filter(card => beforePayment.players.get(a).handCards.includes(card)).length >= (cost.discard==='all'?beforePayment.players.get(a).handCards.length:cost.discard),
      `${entry.raw.name}/${role}: discard cost moves selected hand cards before resolution`);
    if (cost.mana && cost.mana !== '{0}' && !cost.manaAdjustment && !cost.oracleEquipPowerReduction) assert.ok(poolTotal(a) < manaBefore,
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
      await prepareAttachedEffectSource(MTG,context,source,operation);
    preparePaymentSource(MTG,context,source);
    prepareGenericCountSource(context,operation,source);
      await prepareCopyLinkedSource(MTG,context,entry,operation,source,v8Helpers());
      if(operation.condition?.kind==='creature-upgrade-state-v8'&&operation.condition.state==='monstrous')await activateUpgrade(MTG,context,source);
      else stageCondition(MTG,context,operation.condition,source,v5Helpers());
      for(const effect of operation.effects||[])if(effect.action==='conditional'&&effect.condition.kind==='source-stat-comparison'&&effect.conditionTarget===undefined)stageCondition(MTG,context,effect.condition,source,v5Helpers());
      const aura=entry.implementation.find(row=>row.kind==='aura-target');if(aura)wantedTargets.push(stageGenericTarget(MTG,context,auraProofTarget(aura,'you'),'aura-host'));
      if(event==='cast'&&operation.zone==='stack')for(const body of entry.implementation.filter(row=>row.kind==='spell-generic')){
        for(const [index,target]of(body.targets||[]).entries())wantedTargets.push(target.zone==='stack'?await stageGenericStackTarget(MTG,context,target,'cast-body-'+index):stageGenericTarget(MTG,context,target,'cast-body-'+index,body.effects?.find(effect=>effect.target===index)));
      }
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
      if(event==='exploited'){
        source=zoneCard(MTG,a,entry.raw.name,'hand');const paid=poolTotal(a);
        assert.equal(await game.castSpell(a,source,{from:'hand'}),true,entry.raw.name+': exploit source uses a paid cast');
        assert.ok(poolTotal(a)<paid);await game.resolveTop();assert.equal(source.zone,'battlefield');
      }else if(event==='exerted'||entry.raw.types.includes('Planeswalker')||(entry.implementation||[]).some(candidate=>['mechanic-modular','mechanic-graft','enters-with-counters'].includes(candidate.kind))){
        source=zoneCard(MTG,a,entry.raw.name,'hand');const paid=poolTotal(a);
        const auraEntry=entry.implementation.find(row=>row.kind==='aura-target');if(auraEntry)stageGenericTarget(MTG,context,auraProofTarget(auraEntry,'you'),'paid-aura-host');
        assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true,entry.raw.name+': keyword source uses a paid cast');
        assert.ok(poolTotal(a)<paid,entry.raw.name+': printed mana cost is paid');await resolveAll(game);
        assert.equal(source.zone,'battlefield');source.sick=false;
      }else source = ['graveyard','exile','cycling-source'].includes(operation.zone)?zoneCard(MTG,a,entry.raw.name,operation.zone==='cycling-source'||event==='oraclePlottedV13'?'hand':operation.zone):permanent(MTG, game, a, entry.raw.name);
      if(!source.meta.oracleChosenColor)await enterChosenColorSource(MTG,context,entry,source,v5Helpers());
      const aura=entry.implementation.find(row=>row.kind==='aura-target');
      if(aura&&source.zone==='battlefield'&&!source.attachedTo){const host=stageGenericTarget(MTG,context,auraProofTarget(aura,'you'),'trigger-aura-host');await game.attach(source,host);}
      await prepareAttachedEffectSource(MTG,context,source,operation);
    preparePaymentSource(MTG,context,source);
    prepareGenericCountSource(context,operation,source);
      await prepareCopyLinkedSource(MTG,context,entry,operation,source,v8Helpers());
      stageCondition(MTG,context,operation.activationCondition,source,v5Helpers());
      if(operation.condition?.kind==='source-quality'&&operation.condition.filter.what==='creature'&&!source.is('Creature')){
        const animation=game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleOperation?.effects?.some(effect=>effect.action==='animate'&&effect.target==='self'));
        assert.ok(animation,entry.raw.name+': real animation can satisfy its creature condition');
        fund(a,100);assert.equal(await game.activateAbility(a,animation),true);await resolveAll(game);assert.equal(source.is('Creature'),true);
      }
      if(operation.condition?.kind==='creature-upgrade-state-v8'&&operation.condition.state==='monstrous')await activateUpgrade(MTG,context,source);
      else stageCondition(MTG,context,operation.condition,source,v5Helpers());
      for(const effect of operation.effects||[])if(effect.action==='conditional'&&effect.condition.kind==='source-stat-comparison'&&effect.conditionTarget===undefined)stageCondition(MTG,context,effect.condition,source,v5Helpers());
      for(const [index,effect]of (operation.effects||[]).entries()){
        const negative=effect.action==='conditional'&&effect.condition?.kind==='not'&&effect.condition.condition;
        if(negative?.kind==='source-quality'&&negative.filter?.hasCounter&&effect.conditionTarget===undefined){
          const kind=negative.filter.hasCounter,removed=operation.effects.slice(0,index).filter(prior=>prior.action==='remove-counter'&&prior.target==='self'&&prior.counter===kind).reduce((sum,prior)=>sum+(Number(prior.n)||0),0);
          game.removeCounters(source,kind,Math.max(0,(source.counters[kind]||0)-removed));
        }
      }
      if(operation.effects?.some(effect=>effect.action==='double-counters'&&effect.target==='self')){source.counters['+1/+1']=2;game.recalc();}
      trackedCards.push(source);
      stageCounterThreshold(context,operation,source);
      before = genericProofSnapshot(context, trackedCards);
      if(operation.chapterIndex!==undefined){source.counters.lore=operation.chapterIndex;game.addCounters(source,'lore',1,false,a);}
      else if (JSON.stringify(operation.effects||[]).includes('copy-stack-v8')&&['cast','castIS','castNonCreature'].includes(event)||typeof operation.eventFilter==='object'||['any-creature','another-creature','your-creature','your-spell-targets-self','your-second-draw','self-combat','self-unblocked'].includes(operation.eventFilter)||['oraclePhasedInV17','teamworkPaidV14','expend4','expend8','exerted','attackersDeclared','cycled','scry','drawStep','targeted','discarded','dealtDamage','castCreature','becameUntapped','becameTapped','lto','turnedFaceUp','energyGained','mutated'].includes(event)) {
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
      } else if (event === 'monstrous') {
        await activateUpgrade(MTG,context,source);
        before=genericProofSnapshot(context,trackedCards);before.oracleX=source.meta.oracleMonstrosityX;
      } else if (event === 'combatDamageToPlayer') {
        await game.emit(event, { card: source, player: damagedPlayer, n: 2, step: 'normal' });
      } else if (event === 'damageToPlayer') {
        await game.emit(event, { src: source, player: damagedPlayer, n: 2, combat: true });
      } else if (event === 'upkeep' || event === 'endStep' || event === 'beginCombat' || event === 'endCombat' || event === 'precombatMain') {
        await game.emit(event, { player: operation.eventFilter==='opponent-player'?b:a });
      } else if (event === 'lifeGain') {
        await game.gainLife(a, 1, source);
      } else if (event === 'landfall') {
        const land = new MTG.CardInst(MTG.DEFS.Forest, a);
        land.zone = 'nowhere';
        await game.move(land, 'battlefield', { ctrl: a });
      } else if (event === 'castIS' || event === 'castNonCreature' || event === 'cast') {
        await fireGenericEvent(MTG,context,source,operation);
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
  context.proofEffects=operation.effects;context.proofOperation=operation;
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
  await finishStackCopyProof(MTG,context,v8Helpers());
  finishSourceDurations(context);
  if(operation.adventure){
    if(source.def.adventure.omen){assert.equal(source.zone,'library',entry.raw.name+': Omen shuffles the actual card into its owner library');assert.equal(source.owner.library.includes(source),true);assert.equal(source.meta.adventureExiled,undefined);}
    else {assert.equal(source.zone,'exile',entry.raw.name+': Adventure exiles after resolution');game.turnPlayer=a;game.phase='main1';fund(a,100);
      if(source.is('Land')){assert.ok(game.playableLands(a).includes(source),entry.raw.name+': land half offered from exile');assert.equal(await game.playLand(a,source),true);}
      else {assert.ok(game.castableList(a).some(row=>row.card===source&&row.from==='exile'&&!row.alt?.adventure),entry.raw.name+': normal half offered from exile');assert.equal(await game.castSpell(a,source,{from:'exile'}),true,entry.raw.name+': paid cast of normal half');}
      await resolveAll(game);assert.equal(source.zone,'battlefield',entry.raw.name+': normal half enters battlefield');
    }
  }
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
    assert.equal(attacker.power, before + 1 + attacker.cur.extraTriggers.filter(t=>t.desc==='Exalted').length, `${entry.raw.name}/${role}: every exalted instance pumps the sole attacker`);
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
      : fixtureDefinition(`Oracle ${operation.subtype} Cycling Target`, operation.subtype==='artifact land'?['Artifact','Land']:['Land'], { subtypes: operation.subtype==='artifact land'?[]:[operation.subtype] });
    const found = new MTG.CardInst(foundDef, a);
    found.zone = 'library';
    a.library.push(found);
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.cycling&&game.cyclingDefinition(a,source,candidate)?.oracleTypecyclingV10===operation.subtype);
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
  // "Any number of target ..." is a legal empty announcement: with nothing
  // chosen the printed effect has no subjects and does nothing.
  const body=(entry.implementation||[]).map(op=>op.kind==='spell-v4'?op:op.v4Body).find(Boolean);
  const specs=(body?.targets||[]).filter(spec=>(effect.targetIds||[]).includes(spec.id));
  if(!originallyChosen.length&&specs.length&&specs.every(spec=>(spec.quantity?.min??1)===0))return;
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
    assert.ok(targets.every(subject => subject.kind==='spell'?!game.stack.includes(subject)&&(subject.isCopy||subject.card.zone==='exile'):subject.zone==='exile'), `${label}: all selected cards exiled`);
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
    const moved = new Set(context.moveEvidence.slice(before.moveEvidenceIndex)
      .filter(row => row.card.owner === player && row.from === 'library' &&
        row.to === 'graveyard' && row.after.zone === 'graveyard').map(row => row.card));
    // Earlier effects in the same spell can draw cards first. Use the top
    // cards captured when mill actually began, not the pre-spell library.
    const witness = context.millEvidence.slice(before.millEvidenceIndex)
      .find(row => row.player === player && row.n === n);
    assert.ok(witness, `${label}: the real mill operation was executed`);
    assert.equal(witness.cards.length, n, `${label}: exactly the requested top cards were milled`);
    for (const card of witness.cards) {
      assert.ok(moved.has(card), `${label}: each milled top card reaches the graveyard`);
    }
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
      if (operation.effects.some(effect => effect.kind === 'mill')) installEffectEvidence(context);
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
      stageEntryCastingRules(MTG,context,entry,v5Helpers());
      const firstEffectForTarget = id => basePlan.effectIds.map(effectId => effectMap.get(effectId))
        .find(effect => effect.targetIds.includes(id));
      const stagedById = new Map();
      for (let index = 0; index < basePlan.targetIds.length; index++) {
        const id = basePlan.targetIds[index];
        if (stagedById.has(id)) continue;
        const target = targetMap.get(id);
        // A permanent with a counter activation must enter before the hostile
        // spell is cast. The same target is staged below after entry; putting
        // it on the Stack now would make the permanent's ordinary cast illegal.
        if(nested&&!(nested.event==='etb'&&['self','self-card',undefined].includes(nested.eventFilter))&&target.kind==='spell')continue;
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
      const isLandSource=!!nested&&entry.raw.types.includes('Land');
      const cast = isLandSource?await game.playLand(a,source):await game.castSpell(a, source, nested?{from:'hand',xVal:3}:castOptions);
      assert.equal(cast, true,
        `${entry.raw.name}/${role}: spell-v4 plan ${JSON.stringify(basePlan.modes)} variant ${variantIndex} casts`);
      let stackObject = game.stack.find(candidate => candidate.card === source);
      if(!isLandSource)assert.ok(stackObject, `${entry.raw.name}/${role}: spell-v4 source reaches Stack`);
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
            if(cost.tapFilter)for(let i=0;i<cost.tapN;i++)wantedCards.unshift(stageGenericTarget(MTG,context,{...cost.tapFilter,controller:'you'},'nested-tap-'+i));
            if(cost.rmCounter)game.addCounters(source,cost.rmCounter.kind,cost.rmCounter.n,false,a);
            if(cost.sacWhat||cost.sacCreature||cost.sacOther){
              const type=cost.sacWhat?cost.sacWhat[0].toUpperCase()+cost.sacWhat.slice(1):'Creature';
              wantedCards.unshift(permanent(MTG,game,a,fixtureDefinition('V5 ability fodder',[type],{power:'0',toughness:'1'})));
            }
            before=genericProofSnapshot(context,[...game.battlefield,...trackedCards,source]);
            const ordinal=entry.implementation.filter(o=>o.kind==='generic-ability'&&!o.from).indexOf(nested);
            if(nested.from==='hand')await game.move(source,'hand');
            const compiled=nested.from==='hand'?source.def.handAbility:source.def.abilities.filter(o=>o.oracleCompiled)[ordinal];
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
      // A legal empty announcement means the local AI declined an optional
      // group; the choice is only proved when it actually named a target.
      if (role === 'ai' && (stackObject.targets || []).flat().filter(Boolean).length) {
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
    const printedTarget=entry.implementation.flatMap(operation=>operation.targets||[]).find(target=>target.zone===op.targetCondition.zone&&!(op.targetCondition.controller==='opponent'&&(target.controller==='you'||target.owner==='you'))&&!(op.targetCondition.controller==='you'&&target.controller==='opponent'));
    const base=printedTarget?.alternatives?.[0]||printedTarget||{};
    const filter={...base,...op.targetCondition,...(op.targetCondition.what==='permanent'&&base.what?{what:base.what}: {}),controller:base.owner==='you'?'you':base.controller&&base.controller!=='any'?base.controller:op.targetCondition.controller};
    if(op.targetCondition.zone==='stack')await stageGenericStackTarget(MTG,ctx,filter,'discount');else stageGenericTarget(MTG,ctx,filter,'discount');
  }
  let card=source,player=a;
  if(!op.self){card=stageGenericTarget(MTG,ctx,{...op.target,controller:op.controller==='opponents'?'opponent':'you'},0);player=card.ctrl;await game.move(card,'hand');card.def={...card.def,cost:'{20}{G}'};}
  if(op.castTurnV16==='other')game.turnPlayer=ctx.b;
  const castOpts=op.from?{from:op.from==='not-hand'?'exile':op.from}:{};
  if(op.castFlagV19)castOpts[op.castFlagV19]=true;
  if(op.condition?.flag==='oracleBargainV10')castOpts.oracleBargainV10=true;
  if(op.target?.faceDownV9)Object.assign(castOpts,{faceDownCast:'morph',altCostStr:'{3}'});
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
  installCopyLinkedProof(MTG,ctx);installTokenFormsProof(MTG,ctx);installNameGroupsProof(MTG,ctx);installNameSearchProof(MTG,ctx);
  installPaymentProof(MTG,ctx,{...v8Helpers(),trace:role==='ai'?ctx.aiDecisions:trace});
  installStackCopyProof(MTG,ctx,child,v8Helpers());
  ctx.proofEffects=child.effects;
  ctx.proofBranch=op.proofBranch;
  ctx.groupFixtures=new Map();
  ctx.zoneFixtures=new Map();
  fund(a,100);fillLibrary(MTG,a,40);fillLibrary(MTG,ctx.b,40);for(let i=0;i<10;i++){zoneCard(MTG,a,'Forest','hand');zoneCard(MTG,ctx.b,'Forest','hand');}
  await fundSnow(MTG,game,a,entry);
  ctx.b.controller=recordingDecision(role==='ai'?ctx.aiDecisions:trace);
  for(const effect of flattenProofEffects(child.effects||[])){
    if(effect.action==='zone-select'){
      const cards=[];
      for(const controller of ['you','opponent'])for(let i=0;i<Math.max(2,Number(effect.n)||1);i++){
        const card=stageGenericTarget(MTG,ctx,{...effect.filter,zone:'graveyard',controller},'granted-zone-'+i);
        if(effect.zone!=='graveyard'){card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone=effect.zone;card.owner[effect.zone].push(card);}
        cards.push(card);
      }
      ctx.zoneFixtures.set(effect,cards);
    }
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
  if(op.conditionSubject!=='affected')stageCondition(MTG,ctx,op.condition,parent,v5Helpers());
  const host=global&&op.scope==='self'?parent:stageGenericTarget(MTG,ctx,global?{...op.filters[0],controller:'you'}:auraProofTarget(auraTarget),0);
  // Use a small, independent host for power-based token production. Its
  // toughness remains large enough for unrelated nonlethal damage probes.
  if(host!==parent&&!host.def.oracleImplementation&&flattenProofEffects(child.effects).some(effect=>['token','token-inline','token-key'].includes(effect.action)&&['source-stat','explicit-source-stat'].includes(effect.n?.kind)&&effect.n.stat==='power')){
    host.def={...host.def,power:'3'};game.recalc();
  }
  if(op.conditionSubject==='affected')stageCondition(MTG,ctx,op.condition,host,v5Helpers());
  costHost=host;
  if(!global){
    if(parent.def.bestowCost){
      await game.move(parent,'hand');const decide=a.controller.decide.bind(a.controller);
      a.controller.decide=async(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:decide(g,q);
      assert.equal(await game.castSpell(a,parent,{from:'hand',alt:{bestow:true,altCostStr:parent.def.bestowCost}}),true,entry.raw.name+': paid bestow cast');
      await resolveAll(game);a.controller.decide=decide;assert.equal(parent.attachedTo,host.iid);
    }else assert.equal(await game.attach(parent,host),true,entry.raw.name+': real attachment');
  }host.sick=false;
  if(child.kind==='mana-source'){
    await grantedManaProof(MTG,ctx,entry,child,host,entry.raw.name+'/'+role);
    if(parent.zone==='battlefield')await game.move(parent,'exile');game.recalc();if(host.zone==='battlefield')assert.equal(host.cur.extraMana.length,0,entry.raw.name+': granted mana leaves with its source');else assert.equal(game.manaSources(a).some(row=>row.card===host),false,entry.raw.name+': an exiled source cannot activate its former grant');return 1;
  }
  const targets=[];
  if(child.v4Body)for(const [index,target]of child.v4Body.targets.entries())targets.push(await stageSpellV4Target(MTG,ctx,host,target,child.v4Body.effects.find(e=>e.targetIds.includes(target.id)),spellV4TargetVariants(target)[0],index));
  else for(const [index,target]of(child.targets||[]).entries())targets.push(target.zone==='stack'?await stageGenericStackTarget(MTG,ctx,target,index):stageGenericTarget(MTG,ctx,target,index,child.effects?.find(effect=>effect.target===index)));
  ctx.oracleProofTargets=targets;
  for(const effect of child.effects||[])if(effect.action==='conditional'&&effect.elseEffects)(op.proofBranch===false?stageFalseCondition:stageCondition)(MTG,ctx,effect.condition,targets[effect.conditionTarget]||host,v5Helpers());
  for(const effect of flattenProofEffects(child.effects||[])){
    if(['casting-live-count-v8','casting-turn-count-v8'].includes(effect.n?.kind))stageCount(MTG,ctx,effect.n,v5Helpers());
    stageCopyLinkedEffect(MTG,ctx,effect,v8Helpers());
    stageV8Effect(MTG,ctx,effect,v8Helpers());
    stageMultizoneSearch(MTG,ctx,effect,v8Helpers());
    stagePlayPermission(MTG,ctx,effect,v8Helpers());
    stageCardResults(MTG,ctx,effect,v8Helpers());
    stageEnergy(MTG,ctx,effect,v8Helpers());stageRevealed(MTG,ctx,effect,v8Helpers());
    stagePaymentEffect(MTG,ctx,effect,v8Helpers());
  }
  await prepareCopyLinkedSource(MTG,ctx,entry,child,host,v8Helpers());
  preparePaymentSource(MTG,ctx,host);
  prepareGenericCountSource(ctx,child,host);
  if(child.cost?.rmCounter)game.addCounters(host,child.cost.rmCounter.kind,child.cost.rmCounter.n,false,a);
  if(child.cost?.sacWhat||child.cost?.sacCreature)for(let i=0;i<2;i++){const paid=stageGenericTarget(MTG,ctx,{what:child.cost.sacWhat||'creature',controller:'you'},i);if(paid.is('Creature')){paid.def.power='0';paid.def.toughness='1';game.recalc();}}
  if(child.cost?.sacFilter)for(let i=0;i<(child.cost.sacN||1);i++)stageGenericTarget(MTG,ctx,{...child.cost.sacFilter,controller:'you'},'cost-'+i);
  if(child.cost?.exileFilter)for(let i=0;i<child.cost.exileFromGY;i++)stageGenericTarget(MTG,ctx,{...child.cost.exileFilter,controller:'you',zone:'graveyard'},'cost-'+i);
  if(child.cost?.discardFilter)for(let i=0;i<child.cost.discard;i++){const card=stageGenericTarget(MTG,ctx,{...child.cost.discardFilter,controller:'you',zone:'graveyard'},'discard-'+i);await game.move(card,'hand');}
  let before=genericProofSnapshot(ctx,[parent,host,...targets.flat()]);
  if(child.kind==='generic-ability'){
    const action=game.activatableList(a).find(row=>row.card===host&&host.cur.extraAbilities.includes(row.ability)&&JSON.stringify(row.ability.oracleOperation)===JSON.stringify(child));
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
  await finishStackCopyProof(MTG,ctx,v8Helpers());
  if(parent.zone==='battlefield')await game.move(parent,'exile');game.recalc();
  if(host.zone==='battlefield'){assert.equal(host.cur.extraAbilities.length,0);assert.equal(host.cur.extraTriggers.length,0);}
  return Math.max(1,child.effects?.length||child.v4Body?.effects.length||0);
}

async function operationProof(MTG, entry, operation, role = 'human') {
  if(operation.kind==='hand-visibility-v17')return handVisibilityProofV17(MTG,entry,operation,role);
  if(operation.kind==='untap-limit-v17')return untapLimitProofV17(MTG,entry,operation,role);
  if(operation.kind==='library-visibility-v17')return visibilityProofV17(MTG,entry,operation,role);
  if(operation.kind==='cast-self-exile-v17')return exileCastProofV17(MTG,entry,operation,role);
  if(entry.implementation.some(op=>op.kind==='aura-target'&&op.targetV9?.zone==='player'))return playerAuraProofV17(MTG,entry,operation,role);
  if(['mechanic-optional-cost-v14','optional-cost-flash-v14'].includes(operation.kind)){
    const flash=operation.kind==='optional-cost-flash-v14';if(flash)operation=entry.implementation.find(row=>row.kind==='mechanic-optional-cost-v14');
    let checks=0;
    for(const paid of [false,true]){
      const ctx=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a}=ctx;fund(a,100);for(const player of game.players)fillLibrary(MTG,player,40);
      const source=zoneCard(MTG,a,entry.raw.name,'hand'),def=fixtureDefinition('Oracle Optional Cost',['Creature'],{cost:'{'+(operation.payment.n||2)+'}',power:operation.payment.n||2,toughness:20,subtypes:operation.payment.object?.qualifier?.subtypes||[]}),donor=operation.payment.kind==='evidence'?zoneCard(MTG,a,def,'graveyard'):permanent(MTG,game,a,def);
      const bodies=entry.implementation.flatMap(op=>op.kind==='spell-modal-generic'?op.modes.map(mode=>mode.body):[op]);
      for(const aura of bodies.filter(op=>op.kind==='aura-target'))stageGenericTarget(MTG,ctx,auraProofTarget(aura,'you'),'teamwork-aura');
      for(const body of bodies)for(const [i,target]of (body.targets||[]).entries())target.zone==='stack'?await stageGenericStackTarget(MTG,ctx,target,i):stageGenericTarget(MTG,ctx,target,i,body.effects?.find(effect=>effect.target===i));
      const before=game.bf().concat(a.graveyard).map(card=>({card,tapped:card.tapped,power:card.power,mv:card.mv,zone:card.zone,counters:{...card.counters},version:card.zoneVersion})),blighted=[],emit=game.emit;game.emit=async function(event,data,...rest){if(event==='m1Added')blighted.push(data);return emit.call(this,event,data,...rest);};
      if(flash){game.turnPlayer=ctx.b;game.phase='combat';if(!paid){assert.equal(await game.castSpell(a,source,{from:'hand'}),false);checks++;continue;}}
      assert.equal(await game.castSpell(a,source,{from:'hand',alt:paid?{oracleOptionalCostV14:true}:{}}),true,entry.raw.name+': actual Teamwork announcement');
      const so=game.stack.find(row=>row.card===source);assert.ok(so);assert.equal(!!so.castOpts.oracleOptionalCostV14,paid);assert.equal(so.kicked,false);assert.equal(!!so.castOpts.oracleBargainV10,false);
      const tapped=before.filter(row=>!row.tapped&&row.card.tapped);if(paid){if(operation.payment.kind==='teamwork'){assert.ok(tapped.reduce((n,row)=>n+row.power,0)>=operation.payment.n);assert.equal(so.oracleOptionalCostPaidV14.length,tapped.length);}else if(operation.payment.kind==='evidence'){const paidRows=so.oracleOptionalCostPaidV14.map(record=>before.find(row=>row.card.iid===record.iid));assert.ok(paidRows.every(row=>row?.zone==='graveyard'&&row.card.zone==='exile'));assert.ok(paidRows.reduce((n,row)=>n+row.mv,0)>=operation.payment.n);}else{assert.equal(so.oracleOptionalCostPaidV14.length,1);const record=so.oracleOptionalCostPaidV14[0],row=before.find(row=>row.card.iid===record.iid);assert.ok(row);if(operation.payment.kind==='blight'){assert.ok(blighted.some(event=>event.card===row.card&&event.n===operation.payment.n&&event.by===a));}else{assert.equal(row.card.zone,'battlefield');assert.equal(row.card.zoneVersion,row.version);assert.ok(operation.payment.object.qualifier.subtypes.every(type=>row.card.hasSub(type)));}}}else assert.equal(donor.tapped,false);
      await resolveAll(game);assertGameStateInvariants(game);checks+=5;
    }return checks;
  }
  if(operation.kind==='characteristic-color-v14'){
    const ctx=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a}=ctx;assertControllerRole(MTG,ctx,entry.raw.name);fund(a,100);fillLibrary(MTG,a,30);
    const source=zoneCard(MTG,a,entry.raw.name,'hand'),check=()=>assert.deepEqual(Array.from(source.colors).sort(),['B','G','R','U','W']);check();assert.equal(await game.castSpell(a,source,{from:'hand'}),true);check();await resolveAll(game);check();await game.move(source,'graveyard');check();return 4;
  }
  if(operation.kind==='mechanic-cipher-v13')return cipherProofV13(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='mechanic-splice-v11')return spliceProofV11(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='mechanic-changeling'&&entry.raw.types.some(type=>['Instant','Sorcery'].includes(type))){
    const context=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a,b}=context;
    fund(a,100);fillLibrary(MTG,a,30);fillLibrary(MTG,b,30);
    for(const op of entry.implementation)for(const [index,target] of (op.targets||[]).entries())stageGenericTarget(MTG,context,target,'changeling-'+index);
    const source=zoneCard(MTG,a,entry.raw.name,'hand');
    const check=()=>{assert.equal(source.hasSub('Elf'),true);assert.equal(source.hasSub('Goblin'),true);assert.equal(source.hasSub('Equipment'),false);};
    check();assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(source.zone,'stack');check();await resolveAll(game);assert.equal(source.zone,'graveyard');check();
    assertControllerRole(MTG,context,entry.raw.name+'/'+role);return 3;
  }
  if(operation.kind==='damage-prevention-prohibition-v9'){
    const context=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a,b}=context;
    fund(a,100);fillLibrary(MTG,a,30);fillLibrary(MTG,b,30);
    const source=zoneCard(MTG,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await resolveAll(game);
    const old=b.life;game.untilEffects.push({kind:'oraclePreventNextAmount',target:b,remaining:10,direction:'to',expires:'eot'});
    await game.damageAny(source,b,2);assert.equal(b.life,old-2);
    await game.move(source,'exile');await game.damageAny(source,b,2);assert.equal(b.life,old-2);return 3;
  }
  if(operation.kind==='life-gain-prohibition-v9'){
    const context=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a,b}=context;
    fund(a,100);fillLibrary(MTG,a,30);fillLibrary(MTG,b,30);
    const source=zoneCard(MTG,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await resolveAll(game);
    const before=[a.life,b.life];await game.gainLife(a,3,source);await game.gainLife(b,3,source);
    assert.equal(a.life,before[0]+(operation.who==='opponents'?3:0));assert.equal(b.life,before[1]);
    await game.move(source,'exile');const after=[a.life,b.life];await game.gainLife(a,3,source);await game.gainLife(b,3,source);
    assert.deepEqual([a.life,b.life],[after[0]+3,after[1]+3]);return 5;
  }
  if(operation.kind==='day-night-v9'){
    const def=proofDefinition(MTG,entry);
    assert.equal(def[operation.face==='daybound'?'bomDaybound':'bomNightbound'],true,entry.raw.name+': the printed face has its day/night rule');return 1;
  }
  if(operation.kind==='ripple-v8')return rippleProof(MTG,entry,operation,role,v8Helpers());
  if(isNamedCountOperation(operation))return namedCountProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='exert-attack-v8'){
    const body=operation.body||{targets:[],effects:[],optional:false};
    const exertAttackIndex=entry.implementation.filter(row=>row.kind==='exert-attack-v8').indexOf(operation);
    return genericRuntimeOperationProof(MTG,entry,{kind:'generic-trigger',event:'exerted',eventFilter:'self',...body,exertAttackIndex},role);
  }
  if(operation.kind==='state-trigger-v8')return stateTriggerProof(MTG,entry,operation,role,v8Helpers());
  if(['soulbond-v8','soulbond-grant-v8'].includes(operation.kind))return soulbondProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='creature-upgrade-entry-v8')return creatureUpgradeProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='draw-replacement-v8'||operation.effects?.length===1&&operation.effects[0].action==='next-draw-replacement-v8')return drawReplacementProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='zone-replacement-v8')return zoneReplacementProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='entry-counters-v8'||operation.kind==='entry-counter-bonus-v8')return entryCounterProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='chosen-subtype-entry-v16')return chosenTypeEntryProof(MTG,entry,role);
  if(['chosen-color-entry-v8','chosen-color-mana-v8'].includes(operation.kind))return chosenColorProof(MTG,entry,operation,role);
  if(operation.kind==='hand-size-v8')return handSizeProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='v8-ability-loss-static')return abilityLossStaticProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='flash-permission-v8')return flashPermissionProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='mechanic-mayhem-v8')return mayhemProof(MTG,entry,operation,role,v8Helpers());
  if (operation.kind === 'double-faced-v8') {
    assert.equal(operation.faces.length, 2, entry.raw.name + ': both complete printed faces');
    let checks = 0;
    if(operation.faces[0].implementation.some(op=>op.kind==='day-night-v9')){
      const context=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a,b}=context;
      fund(a,100);fillLibrary(MTG,a,30);fillLibrary(MTG,b,30);
      const source=zoneCard(MTG,a,entry.raw.name,'hand');
      assert.equal(await game.castSpell(a,source,{from:'hand'}),true,entry.raw.name+': daybound card paid cast');await resolveAll(game);
      assert.equal(source.oracleFace,'front');assert.equal(game.bomDayNight,'day');
      const version=source.zoneVersion;game.bomPreviousActive=a.idx;a.lastTurnSpellsCast=0;
      await game.bomUpdateDayNight();assert.equal(source.oracleFace,'back');assert.equal(game.bomDayNight,'night');assert.equal(source.zoneVersion,version);
      assert.equal(await MTG.BOM.transform({g:game,src:source,you:a,sourceZoneVersion:version}),false,'ordinary transform cannot turn a day/night face');
      a.lastTurnSpellsCast=1;await game.bomUpdateDayNight();assert.equal(source.oracleFace,'back');
      a.lastTurnSpellsCast=2;await game.bomUpdateDayNight();assert.equal(source.oracleFace,'front');assert.equal(source.zoneVersion,version);
      await game.move(source,'exile');assert.equal(source.oracleFace,'front');a.lastTurnSpellsCast=0;await game.bomUpdateDayNight();
      await game.move(source,'battlefield',{ctrl:a});assert.equal(source.oracleFace,'back','a daybound card enters transformed at night');
      checks+=11;
    }
    for (const face of operation.faces) {
      const faceEntry = faceProofEntry(entry, face, operation.layout);
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
  if(operation.kind==='landwalk-override-v15')return landwalkOverrideProof(MTG,entry,operation,role);
  if(operation.kind==='rule-static-v18')return ruleProofV18(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='ability-cost-v18')return abilityCostProofV18(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='keyword-cost-v19')return keywordCostProofV19(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='entry-prohibition-v19')return entryProhibitionProofV19(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='damage-redirection-v19')return damageRedirectionProofV19(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='entry-trigger-suppression-v19')return entrySuppressionProofV19(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='spell-keyword-grant-v19')return spellKeywordProofV19(MTG,entry,operation,role,v8Helpers());
  if(['filtered-lure-v19','blocking-permission-v19'].includes(operation.kind))return blockingRuleProofV19(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='generic-static'&&(operation.cantUntap||operation.optionalUntap)||operation.kind==='attachment-grant'&&operation.skipUntap)return untapProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='commander-pairing')return commanderPairingProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='mechanic-bestow')return bestowProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='mechanic-entwine'){
    const modal=entry.implementation.find(candidate=>candidate.kind==='spell-modal-generic');
    assert.ok(modal&&modal.modes?.length===operation.modeCount,entry.raw.name+': Entwine proof has the exact modal body');
    return genericRuntimeOperationProof(MTG,entry,{...modal,entwineProof:operation},role);
  }
  if(operation.kind==='aura-control-v8')return auraControlProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='casting-prohibition-v9'){
    const context=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a,b}=context;assertControllerRole(MTG,context,entry.raw.name);
    for(const player of game.players){fund(player,100);fillLibrary(MTG,player,30);}
    stageCardCosts(MTG,context,entry);const source=zoneCard(MTG,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await resolveAll(game);
    const victim=operation.players==='you'||operation.quality==='creature'||operation.window==='combat'?a:b;
    let probe;
    if(operation.filterV12){
      probe=stageGenericTarget(MTG,{...context,a:victim,b:game.players.find(p=>p!==victim)},{...operation.filterV12.spellFilter,what:operation.filterV12.spellFilter?.what||'card',zone:'graveyard',controller:'you'},'prohibited-spell');
      if(probe.is('Land')){probe.def={...probe.def,types:['Sorcery'],cost:'{1}'};}
      await game.move(probe,'hand');
    }else probe=zoneCard(MTG,victim,operation.quality==='creature'?'Grizzly Bears':'Lightning Bolt','hand');
    if(operation.fromV12){
      const from=operation.fromV12[0]==='not-hand'?'exile':operation.fromV12[0];
      await game.move(probe,from);assert.equal(MTG.OracleV8CastingLimits.allowed(game,victim,probe,{from}),false,entry.raw.name+': printed origin is prohibited');
      await game.move(probe,'hand');assert.equal(MTG.OracleV8CastingLimits.allowed(game,victim,probe,{from:'hand'}),true,entry.raw.name+': hand casting remains allowed');
      await game.move(source,'exile');await game.move(probe,from);assert.equal(MTG.OracleV8CastingLimits.allowed(game,victim,probe,{from}),true,entry.raw.name+': source departure removes the prohibition');return 3;
    }
    if(operation.window==='combat')game.phase='combat';
    const mana=Object.values(victim.pool).reduce((s,n)=>s+n,0);assert.equal(await game.castSpell(victim,probe,{from:'hand'}),false);assert.equal(probe.zone,'hand');assert.equal(Object.values(victim.pool).reduce((s,n)=>s+n,0),mana);
    await game.move(source,'exile');game.turnPlayer=victim;game.phase='main1';assert.equal(await game.castSpell(victim,probe,{from:'hand'}),true);await resolveAll(game);
    return 6;
  }
  if(operation.kind==='mechanic-umbra-armor-v9'){
    const ctx=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a}=ctx;
    assertControllerRole(MTG,ctx,entry.raw.name);
    const target=entry.implementation.find(op=>op.kind==='aura-target');assert.ok(target);
    const host=stageGenericTarget(MTG,ctx,auraProofTarget(target),'umbra-host');
    fund(a,100);fillLibrary(MTG,a,30);stageCardCosts(MTG,ctx,entry);
    const source=zoneCard(MTG,a,entry.raw.name,'hand');
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await resolveAll(game);
    assert.equal(source.attachedTo,host.iid);host.damage=1;
    await game.destroy(host,{noRegen:true});await resolveAll(game);
    assert.equal(host.zone,'battlefield');assert.equal(host.damage,0);assert.equal(source.zone,'graveyard');
    await game.destroy(host);await resolveAll(game);assert.equal(host.zone,'graveyard');
    return 7;
  }
  if(operation.kind==='v8-land-types')return landTypesProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='characteristic-subtypes-v10'){
    const ctx=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a}=ctx,card=zoneCard(MTG,a,entry.raw.name,'hand');fund(a);fillLibrary(MTG,a,30);
    for(const type of operation.types)assert.equal(card.hasSub(type),true,'characteristic subtype in hand');
    assert.equal(await game.castSpell(a,card,{from:'hand'}),true);for(const type of operation.types)assert.equal(card.hasSub(type),true,'characteristic subtype on Stack');await resolveAll(game);
    for(const type of operation.types)assert.equal(card.hasSub(type),true,'characteristic subtype on battlefield');await game.move(card,'graveyard');
    for(const type of operation.types)assert.equal(card.hasSub(type),true,'characteristic subtype in graveyard');return operation.types.length*4;
  }
  if(operation.kind==='v8-layered-static'||operation.kind==='v8-type-static'){
    let checks=await layeredStaticProof(MTG,entry,operation,role,v8Helpers());
    if(operation.operation?.grantedOperation)checks+=await attachmentOperationProof(MTG,entry,{...operation.operation,condition:operation.condition},role);
    return checks;
  }
  if(operation.kind==='v8-graveyard-static')return graveyardStaticProof(MTG,entry,operation,role,v8Helpers());
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
    const attachedCondition=operation.condition?.kind==='count-comparison'&&operation.condition.count.kind==='source-attachments';
    if(operation.condition&&!attachedCondition)stageCondition(MTG,context,operation.condition,source,v5Helpers());
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await resolveAll(game);
    if(attachedCondition)stageCondition(MTG,context,operation.condition,source,v5Helpers());
    if(operation.attached&&!source.attachedTo){const action=game.activatableList(a).find(row=>row.card===source&&(row.equip||row.ability?.oracleEquip));assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await resolveAll(game);}
    const target=operation.own?source:operation.attached?game.byIid(source.attachedTo):probe;
    if(operation.kind==='protection-static'){
      for(const quality of operation.qualities){const origin=quality.kind==='filters'?stageGenericTarget(MTG,context,quality.filters[0],'protection-origin'):permanent(MTG,game,b,fixtureDefinition('Static protection source',[quality.kind==='type'?quality.value:'Creature'],{power:'2',toughness:'20',colorsOverride:quality.kind==='chosen-color-v10'?[source.meta.oracleChosenColor]:quality.kind==='color'?[quality.value]:quality.kind==='colored'||quality.kind==='monocolored'?['R']:quality.kind==='multicolored'?['R','G']:[],subtypes:quality.kind==='subtype'?[quality.value]:[]}));assert.equal(game.isProtectedFrom(target,origin),true);if(target.is('Creature'))assert.equal(await game.damageCreature(origin,target,1),0);}
      return operation.qualities.length*2;
    }
    const value=n=>typeof n==='number'?n:n.kind==='life-total'?a.life:countValue(context,source,n,genericProofSnapshot(context,[source,target]));
    if(operation.power!==undefined)assert.equal(target.cur.basePower,value(operation.power));if(operation.toughness!==undefined)assert.equal(target.cur.baseToughness,value(operation.toughness));
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
    const aura=entry.implementation.find(op=>op.kind==='aura-target');if(aura)stageGenericTarget(MTG,context,auraProofTarget(aura,'you'),'prevention-aura-host');
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
  if(operation.kind==='prepare-face-v10')return genericRuntimeOperationProof(MTG,{...entry,raw:operation.raw,implementation:[]},{kind:'spell-generic',preparedSpellV10:entry.raw.name,targets:operation.targets,effects:operation.effects},role);
  if(operation.kind==='damage-prevention-rule-v10')return damagePreventionRuleProofV10(MTG,entry,operation,role);
  if(operation.kind==='mana-bonus-v10')return manaBonusProofV10(MTG,entry,operation,role);
  if(operation.kind==='mechanic-prototype-v10')return prototypeProofV10(MTG,entry,operation,role,v5Helpers());
  if(operation.kind==='mechanic-bargain-v10')return bargainProofV10(MTG,entry,role,v5Helpers());
  if(operation.kind==='adventure-face')return genericRuntimeOperationProof(MTG,entry,{kind:'spell-generic',adventure:true,targets:operation.targets,effects:operation.effects},role);
  if(operation.kind==='spell-target-tax-v16'){
    const ctx=gameFor(MTG,[decision(),decision()],{ai:role==='ai'}),{game,a,b}=ctx,source=permanent(MTG,game,a,entry.raw.name),target=operation.own?source:stageGenericTarget(MTG,ctx,{...operation.filter,what:operation.filter.what==='permanent'?'creature':operation.filter.what},'surcharge');
    fund(b,100);const spell=zoneCard(MTG,b,'Lightning Bolt','hand');game.turnPlayer=b;
    const prior=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:prior(g,q);
    const taxed=game.spellCost(b,spell,{targets:[target]}),untaxed=game.spellCost(b,spell,{targets:[a]});assert.equal(taxed.generic-untaxed.generic,operation.n,entry.raw.name+': exact targeting surcharge');
    const before=poolTotal(b);assert.equal(await game.castSpell(b,spell,{from:'hand',quickTargets:[target]}),true);assert.equal(before-poolTotal(b),1+operation.n,entry.raw.name+': surcharge actually paid');await resolveAll(game);
    const next=zoneCard(MTG,b,'Lightning Bolt','hand');if(source.zone==='battlefield')await game.move(source,'exile');assert.equal(game.spellCost(b,next,{targets:[target]}).generic,0,entry.raw.name+': source departure removes tax');return 5;
  }
  if(operation.kind==='spell-limit-v8')return spellLimitProof(MTG,entry,operation,role,v8Helpers());
  if(['casting-restriction-v8','casting-cost-modifiers-v8'].includes(operation.kind)||operation.kind==='cost-modifier'&&(operation.coloredReduction||operation.reductionCap!==undefined))return castingRulesProof(MTG,entry,operation,role,v8Helpers());
  if(operation.kind==='generic-static'&&operation.typeChange)return typeStaticProof(MTG,entry,operation,role,v8Helpers());
  if(['generic-static','attachment-grant'].includes(operation.kind)&&operation.combatRule)return combatStaticProof(MTG,entry,operation,role,v8Helpers());
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
    const modal=operations.find(op=>op.kind==='spell-modal-generic');
    const generic=operations.find(op=>op.kind==='spell-generic')||modal?.modes[0]?.body;
    if(!targetOperation&&generic){
      wantedTargets=[];for(const [index,originalTarget]of generic.targets.entries()){
        const target=originalTarget.zone==='mixed-v18'?originalTarget.alternatives[0]:originalTarget;
        wantedTargets.push(target.zone==='stack'?await stageGenericStackTarget(MTG,context,target,index):stageGenericTarget(MTG,context,target,index,generic.effects.find(effect=>effect.target===index)));
      }
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
      const harmful=Number(targetOperation.power)<0||Number(targetOperation.toughness)<0;
      const controller = targetOperation.controller === 'opponent'||harmful&&(!targetOperation.controller||targetOperation.controller==='any') ? b : a;
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
    const auraTarget=entry.implementation.find(operation=>operation.kind==='aura-target');
    if(auraTarget)stageGenericTarget(MTG,context,auraProofTarget(auraTarget),'storm-aura');
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
    const aura=entry.implementation.find(row=>row.kind==='aura-target');
    if(aura)stageGenericTarget(MTG,context,auraProofTarget(aura,'you'),'modifier-aura-host');
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
      attachmentHost = auraOperation.targetV9?stageGenericTarget(MTG,context,auraProofTarget(auraOperation),'typed-aura-host'):targetPermanent(MTG, game, a, auraOperation.what);
      wantedTargets = [attachmentHost];
    } else if (operations.some(candidate => candidate.kind === 'attachment-grant' || candidate.kind === 'equipment-equip')) {
      attachmentHost = targetPermanent(MTG, game, a, 'creature');
      if(operations.some(candidate=>candidate.kind==='mechanic-bestow'))wantedTargets=[attachmentHost];
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
    const source = await enterPermanentProof(MTG, context, entry, {holdLandTriggers:['enters-tapped','mana-source'].includes(operation.kind),bestow:operation.kind==='attachment-grant'&&operations.some(candidate=>candidate.kind==='mechanic-bestow')});

    if (operation.kind === 'enters-tapped') {
      const entryMove=context.moveEvidence.findLast(row=>row.card===source&&row.to==='battlefield'&&row.after.zone==='battlefield');
      assert.ok(entryMove,`${name}: actual battlefield entry observed before subsequent triggers`);
      assert.equal(entryMove.after.tapped, true, `${name}: enters-tapped replacement`);
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
        assert.equal(token.name, printedTokenName(operation.token), `${name}: token name`);
        assert.equal(Number(token.def.power), Number(operation.token.power), `${name}: printed token power`);
        assert.equal(Number(token.def.toughness), Number(operation.token.toughness), `${name}: printed token toughness`);
        const base=operations.find(op=>op.kind==='base-pt-static'&&!op.own&&!op.attached&&!op.condition&&op.filters?.some(filter=>matchesTarget(token,filter,context,source)));
        if(base){
          assert.equal(token.cur.basePower,base.power??Number(operation.token.power),`${name}: token receives exact continuous base power`);
          assert.equal(token.cur.baseToughness,base.toughness??Number(operation.token.toughness),`${name}: token receives exact continuous base toughness`);
        }else if (!operations.some(op => op.kind === 'generic-static'||op.kind==='v8-layered-static')) {
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
      const treasures = game.battlefield.filter(card => card.isToken && card.ctrl === a && card.name === 'Treasure Token');
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
      if(operation.produceFromCardsV18){const witness=stageGenericTarget(MTG,context,operation.produceFromCardsV18,'mana-colors');witness.def={...witness.def,colorsOverride:['W','U','B','R','G']};game.recalc();}
      if(operation.conditionalProduceV14)stageCondition(MTG,context,operation.conditionalProduceV14.condition,source,v5Helpers());
      if(operation.produceFromLandsV10)for(const name of ['Plains','Island','Swamp','Mountain','Forest','Wastes'])permanent(MTG,game,a,name);
      stageCondition(MTG,context,operation.condition,source,v5Helpers());
      for(const effect of operation.afterEffects||[])if(effect.action==='conditional'&&effect.effects.every(child=>['gain-life','lose-life'].includes(child.action)))stageCondition(MTG,context,effect.condition,source,v5Helpers());
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
      // Tapping other permanents is an additional cost, so the printed pool of
      // taps has to exist before the source can be offered at all.
      if(cost.tapFilter)for(let i=0;i<(cost.tapN||1);i++)stageGenericTarget(MTG,context,{...cost.tapFilter,controller:'you'},'mana-tap-'+i);
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
        ? candidate.m.storageCounterMana?.kind===operation.storageCounterMana.kind&&
          String(candidate.m.storageCounterMana?.color)===String(operation.storageCounterMana.color)&&
          String(candidate.m.storageCounterMana?.colors)===String(operation.storageCounterMana.colors)
        : JSON.stringify(candidate.produce) === wanted) && !!candidate.extraCost?.sacSelf===!!operation.activationCost?.sacSelf);
      assert.ok(descriptor, `${name}: compiled mana source is discoverable`);
      // A split storage land divides the removed counters between two printed
      // colors, so the staged amount is the option's total rather than a
      // single color's amount.
      const optionTotal=option=>Object.entries(option).filter(([key])=>key!=='n')
        .reduce((sum,[,value])=>sum+Number(value||0),0);
      const chosen = operation.storageCounterMana
        ? descriptor.produce.find(option=>operation.storageCounterMana.colors
          ? optionTotal(option)===2
          : option[operation.storageCounterMana.color]===2)
        : descriptor.produce[0];
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
      assertEnergyCost(MTG,context,cost,source,`${name}/${role}/mana-source`);
      assert.equal(poolTotal(a), before + expected-inputTotal, `${name}: exact mana production`);
      if(!operation.activationCost||operation.activationCost.tap)assert.ok(source.tapped||tapEvents.includes(source), `${name}: tap cost paid before a sacrifice resets the card`);
      if(operation.activationCost?.sacSelf)assert.equal(source.zone,'graveyard',`${name}: mana sacrifice paid`);
      if(operation.activationCost?.life)assert.equal(a.life,oldLife-operation.activationCost.life,`${name}: mana life cost paid`);
      for(const effect of operation.afterEffects||[])await assertGenericEffectEvidence(MTG,context,entry,effect,source,[],b,tailSnapshot,[],name+'/'+role+'/mana-followup');
      if(operation.restriction){
        for(const color of Object.keys(a.pool))a.pool[color]=0;
        for(const entry of a.poolMeta||[])a.pool[entry.color]=(a.pool[entry.color]||0)+entry.n;
        const restrictionFilter=operation.restriction.spell?.spellFilter;
        const forbidsCreatures=operation.restriction.spell?.notType==='Creature'||restrictionFilter?.notType==='Creature'||/instant|sorcery/.test(operation.restriction.spell?.spellQuality||restrictionFilter?.what||'')||restrictionFilter?.alternatives?.every(filter=>['instant','sorcery'].includes(filter.what));
        const payment=MTG.parseCost('{1}'),bad={card:new MTG.CardInst(fixtureDefinition('Restricted mana forbidden',[forbidsCreatures?'Creature':'Instant'],{colorsOverride:['U']}),a),from:'hand'};
        assert.equal(game.canPayMana(a,payment,bad),false,name+': produced mana keeps its spending restriction');
        let good;
        if(operation.restriction.spell)good=await stageGenericStackTarget(MTG,{...context,b:operation.restriction.ownGraveyard?a:b},operation.restriction.spell,'mana-restriction',operation.restriction.from||'hand');
        else good={card:operation.restriction.abilitySource?stageGenericTarget(MTG,context,{...operation.restriction.abilitySource,controller:'you'},'restricted-ability'):source,isAbility:true,...(operation.restriction.abilityKeywordV19?{ability:{[operation.restriction.abilityKeywordV19]:true}}:{})};
        assert.equal(await game.payMana(a,payment,good),true,name+': restricted mana pays the permitted action');
      }
      return 1;
    }
    if (operation.kind === 'attachment-grant') {
      assert.ok(attachmentHost, `${name}: attachment host staged`);
      stageCondition(MTG,context,operation.condition,operation.conditionSubject==='affected'?attachmentHost:source,v5Helpers());
      if(operation.multiplier&&operation.multiplier.kind!=='host-colors')stageCount(MTG,{...context,countSource:operation.multiplierSubject==='affected'?attachmentHost:source},operation.multiplier,v5Helpers());
      for(const kw of operation.removeKeywords||[])attachmentHost.def.kws=[...(attachmentHost.def.kws||[]),kw];
      if (source.attachedTo !== attachmentHost.iid) {
        assert.equal(await game.attach(source, attachmentHost), true, `${name}: attaches through Game.attach`);
      }
      game.recalc();
      const grantedPower = attachmentHost.power;
      const grantedToughness = attachmentHost.toughness;
      const multiplier=operation.multiplier?.kind==='host-colors'?attachmentHost.colors.length:operation.multiplier?countValue(context,operation.multiplierSubject==='affected'?attachmentHost:source,operation.multiplier):1;
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
      if(operation.grantedMechanicV9)await grantedMechanicProof(MTG,context,attachmentHost,operation.grantedMechanicV9,v5Helpers());
      return 1+(operation.keywords?.includes('phasing')?await phasingKeywordProof(MTG,entry,role,v8Helpers()):0);
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
      // Life-total penalties apply as soon as the Vehicle becomes a creature.
      // Set a survivable life total for this positive crew route; zero/negative
      // toughness and the resulting SBA are covered by the variable-stat test.
      const lifePenalty=entry.implementation.find(row=>row.kind==='generic-static'&&row.scope==='self'&&row.multiplier?.kind==='life-total'&&row.toughness<0);
      if(lifePenalty)a.life=Math.min(a.life,Math.max(1,Math.floor((Number(entry.raw.toughness)-1)/-lifePenalty.toughness)));
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
    if (operation.kind === 'must-be-blocked' || operation.kind === 'lure') {
      // The defending controller declares no blocks at all; the printed
      // requirement has to put the blockers there by itself.
      source.sick = false;
      const idle = [0, 1].map(index => permanent(MTG, game, b, fixtureDefinition('Oracle Idle Blocker ' + index,
        ['Creature'], { power: '1', toughness: '20', kws: ['first strike'] })));
      for (const creature of idle) creature.sick = false;
      // Block assignments are cleared when combat ends, so the count is read
      // from the damage each forced blocker deals. The attacker is kept alive
      // for the whole combat so that damage survives to be counted.
      MTG.E.pumpUntilEOT(game, source, 0, 40);
      game.recalc();
      const decide = a.controller.decide.bind(a.controller);
      a.controller.decide = async (currentGame, query) => query.type === 'attackers'
        ? [{ card: source, target: b }] : decide(currentGame, query);
      const before = b.life;
      await game.combatPhase(a);
      a.controller.decide = decide;
      assert.equal(b.life, before, `${name}: the printed blocking requirement is enforced`);
      assert.equal(source.damage, operation.kind === 'lure' ? 2 : 1,
        `${name}: exactly the required number of blockers is forced in`);
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
  const castObject=game.stack.find(row=>row.card===spell);
  const boughtBack=!!castObject?.castOpts.buybackPaid;
  const nonmanaBuyback=operations.find(candidate=>candidate.kind==='mechanic-keyword-payment-v8'&&candidate.keyword==='buyback');
  if(boughtBack&&nonmanaBuyback)assertOracleCastingCostRecord(spell,castObject,{implementation:[{kind:'mechanic-additional-costs',costs:nonmanaBuyback.costs}]});
  await resolveAll(game);
  const rebounds = !boughtBack&&operations.some(candidate => candidate.kind === 'mechanic-rebound');
  const encoded=operations.some(candidate=>candidate.kind==='mechanic-cipher-v13')&&spell.meta.oracleCipherV13;
  assert.equal(spell.zone, encoded?'exile':boughtBack?'hand':rebounds ? 'exile' : 'graveyard',
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
      assert.ok(made.every(card => card.name === printedTokenName(operation.token)), `${name}: exact spell token definition`);
      assert.ok(made.every(card => card.power === Number(operation.token.power) && card.toughness === Number(operation.token.toughness)),
        `${name}: exact spell token stats`);
    }
  } else if (operation.kind === 'spell-token-roll-threshold') {
    const made = game.battlefield.filter(card => card.isToken && card.ctrl === a).slice(tokenBefore);
    assert.equal(made.length, operation.n + operation.bonusN,
      `${name}: forced threshold success creates base and bonus tokens`);
    assert.ok(made.every(card => card.name === printedTokenName(operation.token)), `${name}: exact roll-threshold token definition`);
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
  if(keyword==='phasing'){await phasingKeywordProof(MTG,entry,role,v8Helpers());return 1;}
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

  for(const op of entry.implementation||[])if(op.kind==='generic-static'&&op.defenderCanAttack&&op.condition){
    if(op.condition.kind==='creature-upgrade-state-v8'){fund(a,100);await activateUpgrade(MTG,context,source);await resolveAll(game);}
    else stageCondition(MTG,{game,a,b},op.condition,source,v5Helpers());
  }
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
    case 'infect':
    case 'wither': {
      const victim = permanent(MTG, game, b, 'Aegis Turtle');
      await game.damageCreature(source, victim, 1);
      assert.equal(victim.counters['-1/-1'], 1, `${source.name}: creature damage becomes -1/-1 counter`);
      if(keyword==='infect'){const life=b.life,poison=b.poison;await game.damagePlayer(source,b,1);assert.equal(b.life,life);assert.equal(b.poison,poison+1);}
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
      stageEntryCastingRules(MTG,context,entry,v5Helpers());
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
  const proofNames=process.env.ORACLE_PROOF_NAMES_FILE?new Set(JSON.parse(fs.readFileSync(process.env.ORACLE_PROOF_NAMES_FILE,'utf8'))):null;
  const rows = candidates.filter(({ batch, entry }) =>
    (!process.env.ORACLE_PROOF_FIRST || batch.sequence>=Number(process.env.ORACLE_PROOF_FIRST)) &&
    (!process.env.ORACLE_PROOF_LAST || batch.sequence<=Number(process.env.ORACLE_PROOF_LAST)) &&
    (!proofFilter || entry.raw.name.toLowerCase().includes(proofFilter))&&(!proofNames||proofNames.has(entry.raw.name)));
  assert.ok(rows.length, `Oracle proof filter has fixtures: ${proofFilter || 'all'}`);
  let cardExecutions = 0;
  let keywordExecutions = 0;
  let operationExecutions = 0;
  let operationRouteExecutions = 0;
  const keywordCounts = {};
  const operationCounts = {};
  const templateCounts = {};
  const failures = [];
  const stateEvidence = { checkedGames: 0 };
  const cardEvidence = [];

  for (const { batch, entry } of rows) {
    const beforeFailures = failures.length;
    const beforeGames = stateEvidence.checkedGames;
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
            operationExecutions += await checkedProof(() => operationProof(MTG, entry, operation, role), `${entry.raw.name}/${role}/${operation.kind}`, stateEvidence);
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
          cardExecutions += await checkedProof(() => cardProof(MTG, entry, role), `${entry.raw.name}/${role}/card`, stateEvidence);
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
          keywordExecutions += await checkedProof(() => keywordProof(MTG, entry, declared, role), `${entry.raw.name}/${role}/keyword-${declared}`, stateEvidence);
          keywordCounts[`${role}:${key}`] = (keywordCounts[`${role}:${key}`] || 0) + 1;
        } catch (error) {
          failures.push(`${batch.id}/${entry.raw.name}/${role}/keyword-${declared}: ${error.message}`);
        }
      }
    }
    cardEvidence.push({ name: entry.raw.name, oracleId: entry.oracleId, batch: batch.id, passed: failures.length === beforeFailures, operationKinds: operations.map(operation => operation.kind), keywords: entry.implementedKeywords || [], roles: ['human', 'ai'], checkedGames: stateEvidence.checkedGames - beforeGames, failures: failures.slice(beforeFailures) });
  }

  const declaredKeywordTotal = rows.reduce((sum, row) => sum + declaredKeywordOccurrences(MTG, row.entry).length, 0);
  const declaredOperationTotal = rows.reduce((sum, row) => sum + (row.entry.implementation || []).length, 0);
  if (process.env.ORACLE_PROOF_REPORT) fs.writeFileSync(process.env.ORACLE_PROOF_REPORT, JSON.stringify({ schema: 'oracle-execution-evidence/v1', cards: cardEvidence, stateInvariantGames: stateEvidence.checkedGames, failures, limitation: 'Controlled scenarios and state invariants; not exhaustive Oracle interpretation or all card combinations.' }, null, 2) + '\n');
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs

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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
  MTG.TOKEN_LIMIT_PER_PLAYER = Infinity;  // proofs validate printed mechanics; the table token valve is covered by table-limits-and-prompts.test.mjs
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
    if(a.life===0){
      assert.equal(a.lost,true,`${entry.raw.name}: paying exactly the remaining life is legal, then lethal SBA applies`);
      assert.equal(card.zone,'ceased',`${entry.raw.name}: the eliminated owner's spell leaves the game before priority`);
      assert.equal(game.stack.some(object=>object.card===card),false);
      return {game,a,card};
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
    await game.exileCard(card);assert.equal(card.zone,'exile');await game.checkSBA();await resolveAll(game);assert.equal(card.zone,'command',entry.raw.name+'/'+role+' command return');
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
      if(card.zone!=='command'){await game.exileCard(card);await game.checkSBA();await resolveAll(game);}assert.equal(card.zone,'command',entry.raw.name+'/'+role+': command return');casts++;
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
