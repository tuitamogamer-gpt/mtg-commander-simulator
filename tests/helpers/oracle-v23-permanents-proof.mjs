import assert from 'node:assert/strict';
import {assertGameStateInvariants} from './game-state-invariants.mjs';

const total=p=>Object.values(p.pool).reduce((sum,n)=>sum+n,0);
const fixture=(h,name,types=['Creature'],extra={})=>h.fixtureDefinition(name,types,{cost:'{2}',power:'3',toughness:'8',subtypes:['Sliver'],...extra});
function chooser(ctx,select){const p=ctx.a,prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>prior(g,select(q)||q);}
async function castSource(M,entry,ctx,h,host){
 h.fund(ctx.a);const source=h.zoneCard(M,ctx.a,entry.raw.name,'hand');
 chooser(ctx,q=>q.type==='chooseTargets'&&host&&q.candidates.includes(host)?{...q,candidates:[host]}:q.type==='chooseX'&&entry.raw.cost?.includes('{X}')?{...q,min:2,max:2}:null);
 const before=total(ctx.a);assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand',...(entry.raw.cost?.includes('{X}')?{alt:{xVal:2}}:{})}),true,entry.raw.name+' paid cast');
 assert.ok(total(ctx.a)<before,entry.raw.name+' spent mana');await h.resolveAll(ctx.game);return source;
}
function setup(M,role,h){const ctx=h.gameFor(M,undefined,{ai:role==='ai'});h.fund(ctx.a);h.fund(ctx.b);h.assertControllerRole?.(M,ctx);return ctx;}

export async function operationProofV23(M,entry,op,role,h){
 if(op.kind==='generic-trigger'&&entry.raw.name==='Aggression'){
  let checks=0;for(const attacked of [false,true]){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx,host=h.permanent(M,g,a,fixture(h,'V23 Aggression host'));
   const source=await castSource(M,entry,ctx,h,host);assert.equal(host.kw('first strike'),true);assert.equal(host.kw('trample'),true);
   if(attacked){const prior=a.controller.decide.bind(a.controller);a.controller.decide=(game,q)=>q.type==='attackers'?(role==='ai'?prior(game,{...q,eligible:q.eligible.filter(card=>card===host)}):[{card:host,target:b}]):prior(game,q);await g.combatPhase(a);await h.resolveAll(g);assert.equal(host.meta._attackedTurn,g.turnNo,'actual combat records the enchanted host attacking');assert.notEqual(source.meta._attackedTurn,g.turnNo);}
   await g.emit('endStep',{player:b});await h.resolveAll(g);assert.equal(host.zone,'battlefield');await g.emit('endStep',{player:a});await h.resolveAll(g);assert.equal(host.zone,attacked?'battlefield':'graveyard','the destruction condition belongs to the enchanted creature');assertGameStateInvariants(g);checks+=8;
  }return checks;
 }
 if(op.kind==='generic-trigger'&&entry.raw.name==="Historian's Wisdom"){
  let checks=0;for(const branch of ['false','true','intervening']){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx;for(let n=0;n<4;n++)h.zoneCard(M,a,'Forest','library');
   const host=h.permanent(M,g,a,fixture(h,'V23 historian host'));if(branch==='false')h.permanent(M,g,b,fixture(h,'V23 larger competitor',['Creature'],{power:'9',toughness:'10'}));
   const source=h.zoneCard(M,a,entry.raw.name,'hand');chooser(ctx,q=>q.type==='chooseTargets'&&q.candidates.includes(host)?{...q,candidates:[host]}:null);const before=total(a);assert.equal(await g.castSpell(a,source,{from:'hand'}),true);assert.ok(total(a)<before);const hand=a.hand.length;
   await g.resolveTop();await g.flushTriggers();assert.equal(g.stack.some(row=>row.srcCard===source&&row.kind==='trigger'),branch!=='false','the attached creature must have greatest power when the trigger is created');if(branch==='intervening')h.permanent(M,g,b,fixture(h,'V23 later greater competitor',['Creature'],{power:'9',toughness:'10'}));await h.resolveAll(g);assert.equal(a.hand.length,hand+(branch==='true'?1:0));assert.equal(host.power,5);assert.equal(host.toughness,9);assertGameStateInvariants(g);checks+=7;
  }return checks;
 }
 if(op.kind==='generic-trigger'&&entry.raw.name==='Reality Acid'){
  let checks=0;for(const mode of ['departure','vanishing','new-host']){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx,host=h.permanent(M,g,b,fixture(h,'V23 Reality Acid host'));
   const source=await castSource(M,entry,ctx,h,host);assert.equal(source.counters.time,3);
   if(mode==='vanishing'){for(let n=0;n<3;n++){await g.emit('upkeep',{player:a});await h.resolveAll(g);}assert.equal(source.zone,'graveyard');assert.equal(host.zone,'graveyard');}
   else if(mode==='new-host'){await g.move(host,'exile');await g.putPermanentOntoBattlefield(host,b);await h.resolveAll(g);assert.equal(host.zone,'battlefield','the old attached host incarnation cannot sacrifice its returned replacement');assert.equal(source.zone,'graveyard');}
   else{await g.move(source,'exile');await h.resolveAll(g);assert.equal(source.zone,'exile');assert.equal(host.zone,'graveyard','the current controller sacrifices the last attached host after Aura departure');}
   assertGameStateInvariants(g);checks+=7;
  }return checks;
 }
 if(op.kind==='v8-type-static'&&['Aerial Modification','Siege Modification'].includes(entry.raw.name)){
  let checks=0;for(const vehicle of [false,true]){
   const ctx=setup(M,role,h),{game:g,a}=ctx,host=h.permanent(M,g,a,fixture(h,'V23 animation host',vehicle?['Artifact']:['Creature'],{subtypes:vehicle?['Vehicle']:['Bear'],power:'3',toughness:'8'}));
   const source=await castSource(M,entry,ctx,h,host);assert.equal(host.is('Creature'),true);assert.equal(host.is('Artifact'),vehicle);assert.equal(host.kw(entry.raw.name==='Siege Modification'?'first strike':'flying'),true);assert.equal(host.power,entry.raw.name==='Siege Modification'?6:5);
   g.addCounters(host,'+1/+1',2);await g.move(source,'exile');assert.equal(host.is('Creature'),!vehicle);assert.equal(host.is('Artifact'),vehicle);assert.equal(host.counters['+1/+1'],2);assert.equal(host.kw('flying'),false);assert.equal(host.kw('first strike'),false);assertGameStateInvariants(g);checks+=10;
  }return checks;
 }
 if(op.kind==='base-pt-static'&&entry.raw.name==='Awakened Awareness'){
  let checks=0;for(const creature of [false,true]){
   const ctx=setup(M,role,h),{game:g,a}=ctx,host=h.permanent(M,g,a,fixture(h,'V23 base PT host',creature?['Creature']:['Artifact']));
   const source=await castSource(M,entry,ctx,h,host);assert.equal(host.counters['+1/+1'],2,'X is chosen and paid on the actual Aura cast');if(creature){assert.equal(host.cur.basePower,1);assert.equal(host.cur.baseToughness,1);assert.equal(host.power,3);assert.equal(host.toughness,3);}else{assert.equal(host.is('Creature'),false);assert.equal(host.cur.basePower,3);assert.equal(host.cur.baseToughness,8);}
   await g.move(source,'exile');assert.equal(host.counters['+1/+1'],2);if(creature){assert.equal(host.power,5);assert.equal(host.toughness,10);}assertGameStateInvariants(g);checks+=8;
  }return checks;
 }
 if(op.kind==='generic-trigger'&&entry.raw.name==='Parasitic Implant'){
  const ctx=setup(M,role,h),{game:g,a,b}=ctx,host=h.permanent(M,g,b,fixture(h,'V23 sacrifice opponent host'));
  const source=await castSource(M,entry,ctx,h,host);await g.emit('upkeep',{player:b});await h.resolveAll(g);assert.equal(host.zone,'battlefield');
  const before=g.bf().length;await g.emit('upkeep',{player:a});await h.resolveAll(g);assert.equal(host.zone,'graveyard');assert.equal(source.zone,'graveyard');const token=g.bf().find(card=>card.isToken&&card.ctrl===a&&card.hasSub('Phyrexian')&&card.hasSub('Myr'));assert.ok(token);assert.equal(token.is('Artifact'),true);assert.equal(token.power,1);assert.equal(token.toughness,1);assert.deepEqual(Array.from(token.colors),[]);assert.equal(g.bf().length,before-1);assertGameStateInvariants(g);return 12;
 }
 if(op.kind==='generic-trigger'&&entry.raw.name==='Gremlin Infestation'){
  const ctx=setup(M,role,h),{game:g,a,b}=ctx,host=h.permanent(M,g,b,fixture(h,'V23 Gremlin artifact host',['Artifact']));
  const source=await castSource(M,entry,ctx,h,host);const life=b.life;await g.emit('endStep',{player:b});await h.resolveAll(g);assert.equal(b.life,life);await g.emit('endStep',{player:a});await h.resolveAll(g);assert.equal(b.life,life-2);assert.equal(host.zone,'battlefield');
  await g.move(host,'graveyard');await h.resolveAll(g);assert.equal(source.zone,'graveyard');const token=g.bf().find(card=>card.isToken&&card.ctrl===a&&card.hasSub('Gremlin'));assert.ok(token);assert.equal(token.power,2);assert.equal(token.toughness,2);assert.deepEqual(Array.from(token.colors),['R']);assertGameStateInvariants(g);return 11;
 }
 if(op.kind==='generic-trigger'&&op.permanentAuraEtbV23){
  let checks=0;for(const branch of ['false','true','intervening']){
   const ctx=setup(M,role,h),{game:g,a}=ctx,howl=entry.raw.name==='Howl of the Hunt';
   const host=h.permanent(M,g,a,fixture(h,'V23 conditional ETB host',['Creature'],{subtypes:howl&&branch!=='false'?['Wolf']:['Bear']}));host.tapped=howl||branch!=='false';g.recalc();
   const source=h.zoneCard(M,a,entry.raw.name,'hand');chooser(ctx,q=>q.type==='chooseTargets'&&q.candidates.includes(host)?{...q,candidates:[host]}:null);
   const before=total(a);assert.equal(await g.castSpell(a,source,{from:'hand'}),true);assert.ok(total(a)<before);await g.resolveTop();assert.equal(source.attachedTo,host.iid);await g.flushTriggers();assert.equal(g.stack.some(row=>row.srcCard===source&&row.kind==='trigger'),branch!=='false','condition is checked before the ETB trigger is stacked');
   if(branch==='intervening'){if(howl)host.def={...host.def,subtypes:['Bear']};else host.tapped=false;g.recalc();}
   await h.resolveAll(g);assert.equal(host.tapped,howl?branch!=='true':false,'untap effect follows both intervening condition checks');assertGameStateInvariants(g);checks+=6;
  }return checks;
 }
 if(op.kind==='permanent-attached-name-v23'||op.kind==='permanent-attached-type-set-v23'){
  const ctx=setup(M,role,h),{game:g,a}=ctx;
  const printed={label:'V23 retained activation',cost:{mana:'{1}'},run:async ctx=>{ctx.you.life++;}};
  const host=h.permanent(M,g,a,fixture(h,'V23 original name',['Artifact','Creature','Enchantment'],{subtypes:['Vehicle','Sliver','Shrine'],super:['Legendary'],kws:['flying'],abilities:[printed]}));
  const source=await castSource(M,entry,ctx,h,host);assert.equal(source.attachedTo,host.iid);
  if(op.kind==='permanent-attached-name-v23'){
   assert.equal(host.name,op.name);assert.equal(host.power,1);assert.equal(host.toughness,1);assert.equal(host.kw('flying'),false);assert.equal(g.activatableList(a).some(row=>row.card===host),false);
   g.addCounters(host,'+1/+1',2);assert.equal(host.power,3,'counters apply after the set base');
  }else{
   assert.deepEqual(Array.from(host.cur.types),['Enchantment']);assert.equal(host.hasSub('Vehicle'),false);assert.equal(host.hasSub('Sliver'),false);assert.equal(host.hasSub('Shrine'),true);assert.ok(host.cur.super.includes('Legendary'));assert.equal(host.kw('flying'),true);
   const option=g.activatableList(a).find(row=>row.card===host);assert.ok(option);const before=total(a),life=a.life;assert.equal(await g.activateAbility(a,option),true);await h.resolveAll(g);assert.equal(total(a),before-1);assert.equal(a.life,life+1,'types change retains printed abilities');
  }
  await g.move(source,'exile');assert.equal(host.name,'V23 original name');assert.deepEqual(Array.from(host.cur.types),['Artifact','Creature','Enchantment']);assert.equal(host.hasSub('Sliver'),true);assert.equal(host.kw('flying'),true);assertGameStateInvariants(g);return 17;
 }
 if(op.kind==='permanent-attached-mechanic-v23'){
  let checks=0;for(const pay of [false,true]){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx,host=h.permanent(M,g,a,fixture(h,'V23 cumulative host'));
   const source=await castSource(M,entry,ctx,h,host),prior=a.controller.decide.bind(a.controller);
   a.controller.decide=(game,q)=>q.type==='chooseOption'&&q.prompt?.startsWith('Pay cumulative upkeep')?prior(game,{...q,options:q.options.filter(option=>option.key===(pay?'yes':'no'))}):prior(game,q);
   await g.emit('upkeep',{player:b});await h.resolveAll(g);assert.equal(host.counters.age||0,0);
   let before=total(a);await g.emit('upkeep',{player:a});await h.resolveAll(g);
   if(!pay){assert.equal(host.zone,'graveyard');assert.equal(total(a),before);}else{
    assert.equal(host.counters.age,1);assert.equal(total(a),before-1);before=total(a);await g.emit('upkeep',{player:a});await h.resolveAll(g);assert.equal(host.counters.age,2);assert.equal(total(a),before-2,'the second upkeep pays once per age counter');
    await g.move(source,'exile');await g.emit('upkeep',{player:a});await h.resolveAll(g);assert.equal(host.counters.age,2);assert.equal(host.zone,'battlefield');
   }assertGameStateInvariants(g);checks+=9;
  }return checks;
 }
 if(op.kind==='attachment-operation'&&entry.raw.name==='Sugar Coat'){
  const ctx=setup(M,role,h),{game:g,a}=ctx,host=h.permanent(M,g,a,fixture(h,'V23 Sugar host',['Artifact','Creature'],{subtypes:['Vehicle','Sliver'],kws:['flying']}));
  const source=await castSource(M,entry,ctx,h,host);assert.equal(source.attachedTo,host.iid);assert.deepEqual(Array.from(host.cur.types),['Artifact']);assert.deepEqual(Array.from(host.colors),[]);assert.equal(host.hasSub('Food'),true);assert.equal(host.hasSub('Sliver'),false);assert.equal(host.kw('flying'),false);
  const option=g.activatableList(a).find(row=>row.card===host&&row.ability?.cost?.tap&&row.ability.cost.sacSelf&&row.ability.cost.mana==='{2}');assert.ok(option,'the Food ability survives the ability loss layer');
  const before=total(a),life=a.life;assert.equal(await g.activateAbility(a,option),true);assert.equal(total(a),before-2);assert.equal(host.zone,'graveyard');await h.resolveAll(g);assert.equal(a.life,life+3);assert.equal(source.zone,'graveyard','Aura is put into the graveyard after its host is sacrificed');assertGameStateInvariants(g);return 13;
 }
 if(op.kind==='attachment-operation'&&entry.raw.name==="Nature's Embrace"){
  let checks=0;for(const land of [false,true]){
   const ctx=setup(M,role,h),{game:g,a}=ctx,host=h.permanent(M,g,a,fixture(h,'V23 conditional mana host',land?['Creature','Land']:['Creature']));
   const source=await castSource(M,entry,ctx,h,host);assert.equal(host.power,5);assert.equal(host.toughness,10);
   const mana=g.manaSources(a).find(row=>row.card===host);if(!land)assert.equal(mana,undefined);else{
    assert.ok(mana);for(const color of ['W','U','B','R','G']){host.tapped=false;const before=a.pool[color];assert.equal(await g.activateManaSource(a,mana,{[color]:2}),true);assert.equal(a.pool[color],before+2);assert.equal(host.tapped,true);}
   }
   await g.move(source,'exile');assert.equal(g.manaSources(a).some(row=>row.card===host),false);assert.equal(host.power,3);assertGameStateInvariants(g);checks+=18;
  }return checks;
 }
 if(op.kind==='permanent-zone-keyword-v23'){
  const ctx=setup(M,role,h),{game:g,a,b}=ctx,source=await castSource(M,entry,ctx,h);
  const child=h.zoneCard(M,a,fixture(h,'V23 granted '+op.keyword),'hand');
  const wrong=h.zoneCard(M,a,fixture(h,'V23 wrong type',['Artifact'],{subtypes:[]}),op.zone);
  if(op.keyword==='typecycling'){
   const wanted=h.zoneCard(M,a,fixture(h,'V23 searched Sliver'),'library');
   const denied=h.zoneCard(M,a,fixture(h,'V23 nongranted cycling',['Creature'],{subtypes:['Bear']}),'hand');
   assert.equal(g.cyclingOptions(a,denied).some(row=>row.cyclingId.startsWith('zone-grant-v23:')),false);
   const quality=M.OracleV20.helpers.genericTargetSpec({what:'card',zone:'hand',controller:'you',cyclingV16:true});assert.equal(quality.filter(g,child,a,source),true,'a granted cycling ability is visible to card quality filters');assert.equal(quality.filter(g,denied,a,source),false);
   const other=h.zoneCard(M,b,fixture(h,'V23 opponent Sliver'),'hand');assert.equal(g.cyclingOptions(b,other).some(row=>row.cyclingId.startsWith('zone-grant-v23:')),true,'each player receives the grant');
   const option=g.activatableList(a).find(row=>row.card===child&&row.cyclingId?.startsWith('zone-grant-v23:'));assert.ok(option);
   chooser(ctx,q=>q.type==='chooseCards'&&q.search&&q.from.includes(wanted)?{...q,from:[wanted],min:1,max:1}:null);
   const before=total(a);assert.equal(await g.activateAbility(a,option),true);assert.equal(total(a),before-3);await h.resolveAll(g);assert.equal(child.zone,'graveyard');assert.equal(wanted.zone,'hand');
   const stale=g.activatableList(b).find(row=>row.card===other&&row.cyclingId?.startsWith('zone-grant-v23:'));assert.ok(stale);await g.move(source,'exile');assert.equal(g.cyclingOptions(b,other).some(row=>row.cyclingId.startsWith('zone-grant-v23:')),false);const prior=total(b);assert.equal(await g.activateAbility(b,stale),false);assert.equal(total(b),prior);
  }else{
   await g.move(child,'graveyard');assert.equal(g.activatableList(a).some(row=>row.card===wrong&&row.oracleZoneKeywordV23),false);
   const opponent=h.zoneCard(M,b,fixture(h,'V23 opponent graveyard card'),'graveyard');g.turnPlayer=b;assert.equal(g.activatableList(b).some(row=>row.card===opponent&&row.oracleZoneKeywordV23),false);g.turnPlayer=a;
   const option=g.activatableList(a).find(row=>row.card===child&&row.oracleZoneKeywordV23);assert.ok(option);g.phase='combat';const prior=total(a);assert.equal(await g.activateAbility(a,option),false);assert.equal(total(a),prior);g.phase='main1';
   const cost=M.parseCost(op.cost),before=total(a);assert.equal(await g.activateAbility(a,option),true);assert.equal(total(a),before-cost.generic-cost.pips.length);await g.move(source,'exile');await h.resolveAll(g);assert.equal(child.zone,'battlefield');assert.equal(child.kw('haste'),true,'granted ability remains on the stack after grant source leaves');
   await g.emit('endStep',{player:a});await h.resolveAll(g);assert.equal(child.zone,'exile','native unearth delayed exile');
   await g.putPermanentOntoBattlefield(source,a);await h.resolveAll(g);const second=h.zoneCard(M,a,fixture(h,'V23 stale graveyard card'),'graveyard'),stale=g.activatableList(a).find(row=>row.card===second&&row.oracleZoneKeywordV23);assert.ok(stale);await g.move(source,'exile');await g.putPermanentOntoBattlefield(source,a);await h.resolveAll(g);const beforeStale=total(a);assert.equal(await g.activateAbility(a,stale),false);assert.equal(total(a),beforeStale,'reentered source cannot validate a stale grant');
  }
  assertGameStateInvariants(g);return 15;
 }
 if(op.kind==='generic-trigger'&&op.permanentAttachedPhaseV23){
  let checks=0;for(const pay of [false,true]){
   const ctx=setup(M,role,h),{game:g,a,b}=ctx;
   const aura=entry.implementation.find(row=>row.kind==='aura-target'),types=aura?.what==='land'?['Land']:aura?.what==='artifact'?['Artifact']:['Creature'];
   const host=h.permanent(M,g,a,fixture(h,'V23 phase host',types));
   const source=await castSource(M,entry,ctx,h,host);if(entry.raw.name==='Venarian Gold'){assert.equal(host.counters.sleep,2,'paid X cast creates exactly X sleep counters');assert.equal(host.tapped,true,'the actual ETB effect taps the enchanted creature');}host.counters.sleep=2;g.recalc();
   const prior=a.controller.decide.bind(a.controller);a.controller.decide=(game,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='oracleUnlessPayment'?prior(game,{...q,options:q.options.filter(option=>pay?option.key!=='no':option.key==='no')}):prior(game,q);
   const oldCounter=host.counters['-1/-1']||0,oldLife=a.life;
   await g.emit(op.event,{player:b});assert.equal(g.pendingTriggers.length,0,'other player phase does not trigger');
   const before=total(a);await g.emit(op.event,{player:a});assert.ok(g.pendingTriggers.length);await h.resolveAll(g);
   if(entry.raw.name==='Unstable Mutation')assert.equal(host.counters['-1/-1'],oldCounter+1);
   else if(entry.raw.name==='Venarian Gold')assert.equal(host.counters.sleep,1);
   else if(entry.raw.name==='Lingering Death')assert.equal(host.zone,'graveyard');
   else if(entry.raw.name==='Curse Artifact'){assert.equal(host.zone,pay?'graveyard':'battlefield');assert.equal(a.life,pay?oldLife:oldLife-2);}
   else {assert.equal(host.zone,pay?'battlefield':'graveyard');if(pay)assert.ok(total(a)<before||a.life<oldLife,'host controller actually pays');}
   if(host.zone==='battlefield'){
    await g.move(source,'exile');await g.emit(op.event,{player:a});await h.resolveAll(g);assert.equal(g.pendingTriggers.length,0,'source departure removes the static trigger');
   }
   assertGameStateInvariants(g);checks+=8;
  }return checks;
 }
 return null;
}
