import assert from 'node:assert/strict';
import {stageCondition,stageFalseCondition,countValue} from './oracle-v5-proof.mjs';
let forcedKeyword=null;
const outcome=ctx=>JSON.stringify({players:ctx.game.players.map(player=>({life:player.life,hand:player.hand.map(card=>card.iid),library:player.library.map(card=>card.iid),graveyard:player.graveyard.map(card=>card.iid),exile:player.exile.map(card=>card.iid)})),battlefield:ctx.game.bf().map(card=>({iid:card.iid,zone:card.zone,tapped:card.tapped,power:card.power,toughness:card.toughness,counters:card.counters}))});
const scene=(M,entry,role,h)=>{const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.assertControllerRole(M,ctx,entry.raw.name);h.fillLibrary(M,ctx.a,40);h.fillLibrary(M,ctx.b,40);h.fund(ctx.a,100);return ctx;};

export function stagePermanentEffectV21(M,ctx,effect,h){
 if(effect.action!=='permanent-keyword-choice-v21')return false;
 for(const program of effect.programs)for(const child of program.effects)h.stageEffect(child);
 const prior=ctx.a.controller.decide.bind(ctx.a.controller);
 ctx.a.controller.decide=async(game,query)=>{
  if(query.type!=='chooseOption'||query.aiHint?.kind!=='oracleKeyword')return prior(game,query);
  const options=forcedKeyword?query.options.filter(row=>row.key===forcedKeyword):query.options;
  assert.ok(options.length,'the forced printed keyword is offered');
  const answer=await prior(game,{...query,options});ctx.permanentKeywordChoiceV21=answer;return answer;
 };
 return true;
}
export async function assertPermanentEffectV21(M,ctx,entry,effect,source,targets,damaged,before,trace,label,h){
 if(effect.action!=='permanent-keyword-choice-v21')return false;
 const index=effect.choices.indexOf(ctx.permanentKeywordChoiceV21);assert.ok(index>=0,label+': controller chose a printed keyword at resolution');
 for(const child of effect.programs[index].effects)await h.assertGenericEffectEvidence(M,ctx,entry,child,source,targets,damaged,before,trace,label+'/keyword-'+effect.choices[index]);
 return true;
}

export async function operationProofV21(M,entry,op,role,h){
 const auraBite=entry.implementation.find(row=>row.permanentAuraEtbV21&&row.effects?.some(effect=>effect.action==='bite'));
 if(op.kind==='aura-target'&&auraBite)return operationProofV21(M,entry,auraBite,role,h);
 if(op.kind==='attachment-grant'&&op.skipUntap&&auraBite){
  const ctx=scene(M,entry,role,h),{game,a,b}=ctx,host=h.permanent(M,game,b,h.fixtureDefinition('V21 untap host',['Creature'],{power:'3',toughness:'20'})),source=h.zoneCard(M,a,entry.raw.name,'hand'),prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?prior(g,{...q,candidates:[host]}):prior(g,q);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.attachedTo,host.iid);assert.equal(host.tapped,true);
  game.turnPlayer=b;await game.runBeginningPhase(b);assert.equal(host.tapped,true,'actual untap step keeps the enchanted creature tapped');assert.equal(game.untap(host),true,'an untap effect outside the step remains legal');game.tap(host);await game.move(source,'exile');await game.runBeginningPhase(b);assert.equal(host.tapped,false,'source departure restores the real untap action');return 6;
 }
 if(op.kind==='v8-ability-loss-static'&&op.permanentAttachedLossV21){
  const ctx=scene(M,entry,role,h),{game,a,b}=ctx,source=h.permanent(M,game,a,entry.raw.name),host=h.permanent(M,game,b,h.fixtureDefinition('V21 conditional loss host',['Creature'],{power:'3',toughness:'20',colorsOverride:['R'],kws:['flying'],abilities:[{label:'Printed host ability',cost:{mana:'{1}'},run:async c=>c.g.gainLife(c.you,1,c.src)}]}));h.fund(b,100);assert.equal(await game.attach(source,host),true);
  stageCondition(M,{...ctx,a:b,b:a},op.condition,host,h.v8Helpers());game.recalc();assert.equal(host.kw('flying'),false);assert.equal(host.cur.abilitiesDisabled,true);assert.equal(game.activatableList(b).some(row=>row.card===host),false);
  stageFalseCondition(M,{...ctx,a:b,b:a},op.condition,host,h.v8Helpers());game.recalc();assert.equal(host.kw('flying'),true);assert.equal(host.cur.abilitiesDisabled,false);assert.ok(game.activatableList(b).some(row=>row.card===host));return 6;
 }
 if(op.kind==='generic-trigger'&&op.permanentAuraEtbV21){
  let checks=0;
  for(const branch of op.condition?['false','true','intervening']:['true']){
   const ctx=scene(M,entry,role,h),{game,a,b}=ctx,host=h.permanent(M,game,b,h.fixtureDefinition('V21 Aura event host',['Creature'],{power:'3',toughness:'20',colorsOverride:['R']})),source=h.zoneCard(M,a,entry.raw.name,'hand');game.addCounters(host,'+1/+1',2);
   if(op.condition)(branch==='false'?stageFalseCondition:stageCondition)(M,{...ctx,a:b,b:a},op.condition.condition,host,h.v8Helpers());game.recalc();
   const prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?prior(g,{...q,candidates:[host]}):prior(g,q);
   const fire=async()=>{h.fund(a,100);const life=a.life,power=host.power;assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(host.tapped,op.effects.some(effect=>effect.action==='remove-from-combat'));await game.resolveTop();assert.equal(source.attachedTo,host.iid,'paid Aura resolves attached to its announced host');await game.flushTriggers();const object=game.stack.find(row=>row.srcCard===source&&row.kind==='trigger');assert.equal(!!object,branch!=='false','intervening Aura condition checked before the trigger enters Stack');if(branch==='intervening'){stageFalseCondition(M,{...ctx,a:b,b:a},op.condition.condition,host,h.v8Helpers());game.recalc();}await h.resolveAll(game);assert.equal(host.tapped,branch==='true','Aura effect tap follows the complete condition');if(op.effects.some(effect=>effect.action==='remove-counters-v8'))assert.ok(Object.values(host.counters).every(n=>n===0),'all counter kinds removed');if(op.effects.some(effect=>effect.action==='bite'))assert.equal(a.life,life-power,'the enchanted creature deals damage equal to its current power');if(op.effects.some(effect=>effect.action==='remove-from-combat')){assert.equal(host.attacking,null);assert.equal(game.combat.attackers.includes(host),false);}checks+=6;};
   if(op.effects.some(effect=>effect.action==='remove-from-combat')){
    game.turnPlayer=b;const before=a.life,choose=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.type==='attackers'?[{card:host,target:a}]:choose(g,q);let fired=false;game.priorityRound=async()=>{if(!fired&&game.step==='attackers'&&host.attacking===a){fired=true;await fire();}};await game.combatPhase(b);assert.ok(fired,'flash Aura cast after actual attacker declaration');assert.equal(a.life,before,'removed attacker deals no combat damage');
   }else await fire();
  }
  return checks;
 }
 if(op.kind==='attachment-grant'&&(op.cantAttackSourceController||op.attackerFilters?.length)&&entry.implementation.some(row=>row.cantAttackSourceController)){
  const ctx=scene(M,entry,role,h),{game,a,b}=ctx,c=game.addPlayer('V21 third defender',{name:'V21 third defender'},h.decision(),false),source=h.permanent(M,game,a,entry.raw.name),host=h.permanent(M,game,b,'Grizzly Bears');assert.equal(await game.attach(source,host),true);
  const yours=h.permanent(M,game,a,'Grizzly Bears'),theirs=h.permanent(M,game,c,'Grizzly Bears');
  if(op.attackerFilters){assert.deepEqual(Array.from(op.attackerFilters,filter=>filter.controller),['you']);assert.equal(game.canBlock(host,yours),false,'the enchanted host cannot block creatures controlled by the Aura controller');assert.equal(game.canBlock(host,theirs),true,'another controller creature remains blockable');}
  if(op.cantAttackSourceController){assert.equal(game.canAttackTarget(host,a),false);assert.equal(game.canAttackTarget(host,c),true);if(op.includePlaneswalkers){const walker=h.permanent(M,game,a,'Jace Beleren');assert.equal(game.canAttackTarget(host,walker),false);}}
  M.OracleV8Control.gain(game,source,c,{});game.recalc();
  if(op.attackerFilters){assert.equal(game.canBlock(host,yours),true);assert.equal(game.canBlock(host,theirs),false,'the block restriction follows the live Aura controller');}
  if(op.cantAttackSourceController){assert.equal(game.canAttackTarget(host,a),true);assert.equal(game.canAttackTarget(host,c),false);}
  await game.move(source,'exile');if(op.attackerFilters)assert.equal(game.canBlock(host,theirs),true);if(op.cantAttackSourceController)assert.equal(game.canAttackTarget(host,c),true);return 8;
 }
 const comparison=op.condition?.kind==='permanent-event-condition-v21'?op.condition:op.effects?.find(effect=>effect.action==='conditional'&&effect.condition.kind==='permanent-event-condition-v21')?.condition;
 if(op.kind==='generic-trigger'&&comparison){
  const ctx=scene(M,entry,role,h),{game,a}=ctx,source=h.zoneCard(M,a,entry.raw.name,'hand'),label=entry.raw.name+'/'+role;
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.zone,'battlefield');
  const counters=()=>source.counters['+1/+1']||0;
  if(comparison.test==='spell-mana-range'){
   assert.ok(op.effects.some(effect=>effect.action==='combat-restriction'&&effect.restriction.unblockable),'mana-range witness also covers its unconditional restriction');
   assert.deepEqual([].concat(op.event),['cast','spellCopied']);
   const initial=counters();
   for(const n of [comparison.threshold-1,comparison.threshold]){
    const donor=h.zoneCard(M,a,h.fixtureDefinition('V21 spell-mana event',['Instant'],{cost:'{'+n+'}',resolve:async()=>{}}),'hand');h.fund(a,100);
    assert.equal(await game.castSpell(a,donor,{from:'hand'}),true);await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source&&row.kind==='trigger'),label+': unconditional magecraft trigger');
    if(n===comparison.threshold){const original=game.stack.find(row=>row.card===donor&&row.kind==='spell'),copies=await game.copySpellBatch(original,a,[{}]);assert.equal(copies.length,1);assert.equal(copies[0].isCopy,true);}
    await h.resolveAll(game);assert.equal(source.cur.unblockable,true);assert.equal(counters(),initial+(n===comparison.threshold?2:0),label+': printed inclusive mana threshold for cast and copy');
   }
   return 10;
  }
  assert.equal(comparison.test,'stat-vs-source');assert.equal(comparison.stat,'power');assert.equal(comparison.sourceStat,'power');assert.equal(comparison.comparison,'greater');
  const donor=power=>h.permanent(M,game,a,h.fixtureDefinition('V21 power event',['Creature'],{cost:'{G}',colorsOverride:['G'],power:String(power),toughness:'20'}));
  const fire=async card=>{if(op.event==='dies')await game.destroy(card);else{assert.equal(op.event,'etb');await game.handleETB(card,{});}await game.flushTriggers();};
  if(op.condition){
   const initial=counters(),equal=donor(source.power);await fire(equal);assert.equal(game.stack.some(row=>row.srcCard===source),false,label+': equal event power is not greater');assert.equal(counters(),initial);
   const bigger=donor(source.power+1);await fire(bigger);assert.ok(game.stack.some(row=>row.srcCard===source),label+': greater power triggers');game.addCounters(source,'+1/+1',1);await h.resolveAll(game);assert.equal(counters(),initial+1,label+': intervening comparison is checked again');
   const departed=donor(source.power+2);await fire(departed);assert.ok(game.stack.some(row=>row.srcCard===source));
   if(op.event==='dies'){await game.putPermanentOntoBattlefield(departed,a);game.addCounters(departed,'-1/-1',3);}else{await game.move(departed,'exile');}
   await h.resolveAll(game);assert.equal(counters(),initial+2,label+': departed event retains its old incarnation power');return 9;
  }
  const first=op.effects[0],conditional=op.effects.find(effect=>effect.condition===comparison);
  assert.equal(first.action,'counter');assert.equal(first.target,'self');assert.equal(first.n,1);assert.equal(conditional.effects.length,1);assert.equal(conditional.effects[0].action,'counter');assert.equal(conditional.effects[0].n,1);
  const initial=counters(),equalAfterFirst=donor(source.power+1);await fire(equalAfterFirst);await h.resolveAll(game);assert.equal(counters(),initial+1,label+': comparison follows the preceding counter instruction');
  const greaterAfterFirst=donor(source.power+2);await fire(greaterAfterFirst);await h.resolveAll(game);assert.equal(counters(),initial+3,label+': greater event power receives the additional counter');return 7;
 }
 if(op.kind==='v8-layered-static'&&op.permanentQuotedGrantV21){
  const {permanentQuotedGrantV21,...base}=op;
  const {grantedOperation,...modifiers}=base.operation;
  let checks=await h.operationProof(M,entry,{...base,operation:modifiers},role);
  checks+=await h.operationProof(M,entry,{kind:'attachment-operation',operation:op.operation.grantedOperation},role);
  return checks;
 }
 if(op.kind==='permanent-hand-size-set-v21'){
  const ctx=scene(M,entry,role,h),{game,a,b}=ctx,source=h.zoneCard(M,a,entry.raw.name,'hand'),label=entry.raw.name+'/'+role;
  let expected,prepared=false,cleanup=false;
  game.mainPhase=async()=>{
   if(prepared)return;prepared=true;h.fund(a,100);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.zone,'battlefield');
   if(op.count?.kind==='source-counters'){source.counters[op.count.counter]=4;game.recalc();}
   expected=op.count?countValue(ctx,source,op.count):op.n;
   assert.equal(game.maximumHandSize(a),expected,label+': exact live setter');assert.equal(game.maximumHandSize(b),7,label+': opponent unaffected');
   while(a.hand.length<18)h.zoneCard(M,a,'Forest','hand');
  };
  const maximum=game.maximumHandSize;game.maximumHandSize=function(player){const value=maximum.call(this,player);if(this.phase==='cleanup'&&player===a){cleanup=true;assert.equal(value,expected);}return value;};
  game.combatPhase=async()=>{};game.priorityRound=async()=>h.resolveAll(game);await game.runTurn();game.maximumHandSize=maximum;
  assert.ok(cleanup,label+': real cleanup executed');assert.equal(a.hand.length,Math.min(18,expected),label+': cleanup obeyed fixed hand size');
  if(op.count?.kind==='source-counters'){game.addCounters(source,op.count.counter,2);assert.equal(game.maximumHandSize(a),expected+2,label+': existing source follows counter changes');}
  const tower=h.permanent(M,game,a,'Reliquary Tower');assert.equal(game.maximumHandSize(a),Infinity,label+': no maximum supersedes a setter');await game.move(tower,'exile');
  await game.move(source,'exile');assert.equal(game.maximumHandSize(a),7,label+': source departure restores seven');assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);return 8;
 }
 if(op.kind==='mechanic-additional-land'&&op.permanentLandConditionV21){
  const ctx=scene(M,entry,role,h),{game,a}=ctx,source=h.permanent(M,game,a,entry.raw.name);
  stageFalseCondition(M,ctx,op.condition,source,h.v8Helpers());game.recalc();assert.equal(game.landPlayLimit(a),1,'false condition gives no extra land');
  stageCondition(M,ctx,op.condition,source,h.v8Helpers());game.recalc();assert.equal(game.landPlayLimit(a),1+op.n,'true condition grants exact land allowance');
  const lands=Array.from({length:op.n+2},()=>h.zoneCard(M,a,'Forest','hand'));
  for(const land of lands.slice(0,op.n+1)){assert.equal(await game.playLand(a,land),true);await h.resolveAll(game);}assert.equal(await game.playLand(a,lands.at(-1)),false,'actual land allowance exhausted');
  stageFalseCondition(M,ctx,op.condition,source,h.v8Helpers());game.recalc();assert.equal(game.landPlayLimit(a),1,'allowance tracks live condition');await game.move(source,'exile');assert.equal(game.landPlayLimit(a),1);return op.n+6;
 }
 if(op.kind==='v8-layered-static'&&op.permanentFormV21){
  const ctx=scene(M,entry,role,h),{game,a}=ctx,source=h.permanent(M,game,a,entry.raw.name),forms=entry.implementation.filter(row=>row.permanentFormV21),base=forms.find(row=>row.operation.kind==='base-pt-static').operation;
  if(op.condition.kind==='not'&&op.condition.condition.kind==='your-turn')game.turnPlayer=ctx.b;else stageCondition(M,ctx,op.condition,source,h.v8Helpers());game.recalc();assert.equal(source.cur.basePower,base.power);assert.equal(source.cur.baseToughness,base.toughness);for(const subtype of op.change.replaceCreatureTypesV10)assert.equal(source.hasSub(subtype),true);for(const keyword of base.keywords)assert.equal(source.kw(keyword),true);if(forms.some(row=>row.operation.unblockable))assert.equal(source.cur.unblockable,true);
  game.addCounters(source,'+1/+1',2);assert.equal(source.power,base.power+2,'counters apply after the form base setter');
  if(op.condition.kind==='not'&&op.condition.condition.kind==='your-turn')game.turnPlayer=ctx.a;else stageFalseCondition(M,ctx,op.condition,source,h.v8Helpers());game.recalc();assert.equal(source.is('Creature'),source.def.types.includes('Creature'));for(const subtype of source.def.subtypes)assert.equal(source.hasSub(subtype),true,'false form restores printed subtype');if(forms.some(row=>row.operation.unblockable))assert.equal(source.cur.unblockable,false);return 7;
 }
 if(op.kind==='generic-trigger'&&op.permanentOptionalModalV21){
  const normal=await h.genericRuntimeOperationProof(M,entry,op,role),ctx=scene(M,entry,role,h),{game,a}=ctx,source=h.permanent(M,game,a,entry.raw.name),none=op.modalBody.modes.length;
  const prior=a.controller.decide.bind(a.controller);let chosen=false;
  a.controller.decide=async(g,q)=>{if(q.type==='chooseOption'&&q.aiHint?.kind==='mode'){const option=q.options.find(row=>row.key===String(none));assert.ok(option,'choose-no-mode is an available announcement');chosen=true;return prior(g,{...q,options:[option]});}return prior(g,q);};
  await h.v8Helpers().fireGenericEvent(M,ctx,source,op);const before=outcome(ctx);await game.flushTriggers();const trigger=game.stack.find(row=>row.srcCard===source&&row.kind==='trigger');assert.ok(trigger,'printed optional-modal event uses the stack');assert.equal(trigger.mode,none);assert.equal(trigger.targets.length,0);await h.resolveAll(game);assert.ok(chosen);assert.equal(outcome(ctx),before,'choosing no mode changes no cards or life at resolution');return normal+5;
 }
 const choices=op.effects?.filter(effect=>effect.action==='permanent-keyword-choice-v21');
 if(choices?.length){
  assert.equal(choices.length,1,'closed keyword choice proof supports one instruction');let checks=0;const previous=forcedKeyword;
  try{for(const keyword of choices[0].choices){forcedKeyword=keyword;checks+=await h.genericRuntimeOperationProof(M,entry,op,role);}}finally{forcedKeyword=previous;}
  return checks;
 }
 return null;
}
