import assert from 'node:assert/strict';
import {stageCount} from './oracle-v5-proof.mjs';
import {stagePaymentEffect} from './oracle-v8-payment-proof.mjs';

const actions=new Set(['self-reflexive-v20','roll-table-v20','roll-value-v20','target-dies-v20','death-return-v20','delay-subject-v20','selected-group-damage-v20','multiple-bite-v20','choose-source-v20','reveal-discard-v20','sacrifice-categories-v20','choose-number-v20','each-unless-v20','any-pay-v20','snapshot-amount-v20','player-group-v20','sacrifice-stat-v20','order-graveyard-v20']);
actions.add('controller-group-v20');
actions.add('exile-choice-v20');actions.add('delay-effect-v20');
actions.add('optional-effect-v20');
actions.add('hand-redraw-v20');
actions.add('hand-limit-emblem-v20');
actions.add('zone-choice-v20');
actions.add('exchange-shuffle-v20');
actions.add('choice-table-v20');
actions.add('per-player-targets-v20');
actions.add('retarget-stack-v20');actions.add('control-stack-v20');
actions.add('hand-count-v20');
actions.add('exile-reflexive-v20');
actions.add('bound-reveal-v20');
actions.add('inspect-top-v20');
actions.add('hand-subset-v20');
actions.add('named-card-v20');
actions.add('player-consequence-v20');
actions.add('parity-sweep-v20');
actions.add('creature-no-regeneration-sweep-v20');
const worlds=new WeakMap(),installed=new WeakSet(),flat=x=>[x].flat().filter(Boolean);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function installSpellProofV20(M,context,h){return install(M,context,h);}
function install(M,context,h){
 let state=worlds.get(context.game);
 if(!state){state={context,h,rows:[],decisions:[],controllers:new WeakSet()};worlds.set(context.game,state);}
 for(const player of context.game.players)if(!state.controllers.has(player.controller)){state.controllers.add(player.controller);const prior=player.controller.decide.bind(player.controller);player.controller.decide=async(g,q)=>{const result=await prior(g,q);state.decisions.push({player,query:q,result});return result;};}
 state.h=h;
 for(const handler of M.OracleV20.handlers){if(installed.has(handler)||!handler.spellsV20)continue;installed.add(handler);const original=handler.effect;
  handler.effect=async function(ctx,effect,helpers){
   const state=worlds.get(ctx.g);if(!state||!actions.has(effect.action))return original.call(this,ctx,effect,helpers);
   const snapshot=()=>{const cards=[ctx.src,...ctx.g.bf(),...ctx.g.players.flatMap(p=>['hand','library','graveyard','exile'].flatMap(z=>p[z]))];const snap=state.h.genericProofSnapshot(state.context,cards);snap.oracleX=ctx.x||0;snap.delayed=ctx.g.delayed.slice();return snap;};
   const row={effect,ctx:{...ctx},before:snapshot(),targets:(ctx.targets||[]).slice(),children:[],decisionsStart:state.decisions.length,helpers};
   row.subjects=helpers.genericEffectSubjects(ctx,effect.target);
   const stackState=()=>row.subjects.filter(c=>c.kind==='spell').map(object=>({object,ctrl:object.ctrl,owner:object.card.owner,targets:(object.targets||[]).flat(Infinity).filter(Boolean).map(c=>c.iid||'p'+c.idx),amounts:(object.damageDivision||[]).map(r=>r.n)}));
   if(['retarget-stack-v20','control-stack-v20'].includes(effect.action))row.stackBefore=stackState();
   row.who=effect.who==='each-player'?ctx.g.players:effect.who==='each-opponent'?ctx.g.players.filter(p=>p!==ctx.you):helpers.genericEffectSubjects(ctx,effect.who);
   row.amount=effect.value?helpers.genericAmount(effect.value,ctx):null;
   const matching=f=>ctx.g.bf().filter(c=>helpers.genericTargetSpec(f,[],0).filter(ctx.g,c,ctx.you,ctx.src));
   if(effect.filter)row.matching=matching(effect.filter);
   if(effect.sources)row.sources=matching(effect.sources).filter(c=>c.is('Creature'));
   if(effect.action==='multiple-bite-v20')row.recipients=helpers.genericEffectSubjects(ctx,effect.otherTarget);
   if(effect.action==='player-consequence-v20')row.resultPlayers=(effect.who==='you'?[ctx.you]:row.who).map(player=>({player,candidates:(effect.first==='discard'?player.hand:ctx.g.bf().filter(card=>card.ctrl===player&&ctx.g.canSacrifice(card)&&!(effect.excludeSource&&card===ctx.src&&helpers.sameBattlefieldSource(ctx))&&helpers.genericTargetSpec(effect.filter,[],0).filter(ctx.g,card,player,ctx.src))).map(card=>({card,version:card.zoneVersion,qualifies:!effect.successFilter||helpers.genericTargetSpec({...effect.successFilter,zone:card.zone,controller:'any'},[],0).filter(ctx.g,card,player,ctx.src)}))}));
   if(effect.action==='each-unless-v20')row.payment=effect.payment.life!==undefined?{life:helpers.genericAmount(effect.payment.life,ctx)}:effect.payment;
   state.rows.push(row);
   const record=async(childCtx,effects,single,inheritCreated)=>{const child={ctx:{...childCtx},effects,targets:(childCtx.targets||[]).slice(),before:snapshot()};row.children.push(child);try{return await (single?helpers.runGenericEffect(childCtx,effects[0]):helpers.runGenericEffects(childCtx,effects,inheritCreated));}finally{child.after=snapshot();}};
   try{return await original.call(this,ctx,effect,{...helpers,runGenericEffect:(c,e)=>record(c,[e],true),runGenericEffects:(c,e,inheritCreated)=>record(c,e,false,inheritCreated)});}finally{row.after=snapshot();if(row.stackBefore)row.stackAfter=stackState();row.decisions=state.decisions.slice(row.decisionsStart);row.addedDelayed=row.after.delayed.filter(d=>!row.before.delayed.includes(d));}
  };
 }
 return state;
}
function decision(player,fn){const old=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{const result=fn(g,q);if(result===undefined)return old(g,q);worlds.get(g)?.decisions.push({player,query:q,result});return result;};}
function relevantPlayers(context,effect,targets){return effect.who==='each-player'?context.game.players:effect.who==='each-opponent'?context.game.players.filter(p=>p!==context.a):effect.who==='you'?[context.a]:typeof effect.who==='number'?flat(targets[effect.who]):[context.b];}

export function stageSpellsEffect(M,context,effect,h){
 if(effect.action==='resolution-cost'&&effect.effects.some(child=>child.action==='with-x-v10'&&child.value?.kind==='payment-stat')){
  const prior=new Set(context.game.bf());stagePaymentEffect(M,context,effect,h);
  for(const card of context.game.bf())if(!prior.has(card))for(const child of effect.effects)if(child.action==='with-x-v10'&&child.value?.kind==='payment-stat'){card.def={...card.def,...(child.value.stat==='mv'?{cost:'{3}'}:{[child.value.stat]:'3'})};}
  context.game.recalc();for(const child of effect.effects)h.stageEffect(child);return true;
 }
 if(effect.action==='with-x-v10'&&effect.value?.kind==='payment-stat'){for(const child of effect.effects)h.stageEffect(child);return true;}
 if(effect.action==='with-x-v10'&&effect.value?.kind==='fraction-v9'){stageCount(M,context,effect.value.value,h);for(const child of effect.effects)h.stageEffect(child);return true;}
 if(effect.action==='search-library'&&effect.filter?.stat==='mv'&&effect.filter.threshold?.kind==='source-counters'&&h.operation.cost?.counter===effect.filter.threshold.counter){
  const {game,a}=context,counter=effect.filter.threshold.counter,cards=[];for(let i=0;i<3;i++){const card=h.stageGenericTarget(M,context,{...effect.filter,controller:'you',zone:'graveyard',threshold:3},'v20-post-payment-search-'+i);a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='library';a.library.push(card);cards.push(card);}
  (context.prepareThresholdV10||=[]).push(source=>{const afterPayment=(source.counters[counter]||0)+1;for(const card of cards)card.def={...card.def,cost:'{'+afterPayment+'}'};game.recalc();});return true;
 }
 if(['token-inline','token-key'].includes(effect.action)&&effect.n?.kind==='target-stat'){
  for(const card of flat(h.stagedTargets?.[effect.n.target]))if(card instanceof M.CardInst){card.def={...card.def,[effect.n.stat]:'3'};context.game.recalc();}
 }
 if(!actions.has(effect.action))return false;
 install(M,context,h);
 const {game,a,b}=context,targets=h.stagedTargets||context.oracleProofTargets||[],stage=(f,label)=>h.stageGenericTarget(M,context,f,label);
 if(effect.action==='parity-sweep-v20')for(let mv=0;mv<4;mv++)h.permanent(M,game,mv%2?a:b,h.fixtureDefinition('Parity witness '+mv,['Creature'],{cost:'{'+mv+'}',power:'1',toughness:'20'}));
 if(effect.action==='creature-no-regeneration-sweep-v20')h.stageEffect({action:'battlefield-group',operation:'destroy',filters:[effect.filter]});
 if(effect.action==='player-consequence-v20'){
  const positive=h.operation.proofConsequenceV20!==false;
  for(const player of game.players){let witness;
   if(effect.first==='discard'&&(positive||effect.successFilter)){witness=h.zoneCard(M,player,positive?'Grizzly Bears':'Forest','hand');if(positive&&effect.successFilter){const filter=effect.successFilter;witness.def={...witness.def,cost:filter.stat==='mv'?'{'+Math.max(2,Number(filter.threshold)||0)+'}':witness.def.cost};}if(effect.n==='all')h.zoneCard(M,player,'Forest','hand');}
   else if(effect.first==='sacrifice'&&positive){witness=stage({...effect.filter,controller:player===a?'you':'opponent'},'conditional-sacrifice');}
   if(witness)decision(player,(g,q)=>['Discard for a conditional result','Sacrifice for a conditional result'].includes(q.prompt)&&q.from.includes(witness)?[witness]:undefined);
  }
  for(const child of effect.effects)if(!JSON.stringify(child).includes('snapshot-amount-v20'))h.stageEffect(child);
 }
 if(effect.action==='named-card-v20'){
  const name=effect.quality==='artifact'?'Sol Ring':'Grizzly Bears';decision(a,(g,q)=>q.prompt?.endsWith(': choose a card name')?name:q.prompt==='Choose matching cards to exile'?q.from.slice(0,q.max):undefined);
  for(const player of game.players){
   if(effect.mode==='search'||effect.mode==='discard'){for(const zone of effect.mode==='search'?['hand','graveyard','library']:['hand']){h.zoneCard(M,player,name,zone);h.zoneCard(M,player,'Forest',zone);}}
   else if(effect.mode==='mill')h.zoneCard(M,player,name,'library');
   else if(effect.mode==='check'){const card=h.zoneCard(M,player,name,effect.zone);if(effect.random){player.hand.splice(player.hand.indexOf(card),1);player.hand.unshift(card);game.rnd=()=>0;}}
   else{h.zoneCard(M,player,name,'library');for(let i=0;i<2+(effect.prefixExile||0);i++)h.zoneCard(M,player,'Forest','library');}
  }
  if(effect.mode==='check')for(const child of effect.effects)if(child.action!=='named-discard-v20')h.stageEffect(child);
 }
 if(effect.action==='hand-subset-v20'){
  if(typeof effect.revealN==='object')stageCount(M,context,effect.revealN,h);
  for(const player of game.players)for(const selection of effect.selections)for(let i=0;i<5;i++){const card=stage({...selection.filter,controller:player===a?'you':'opponent',zone:'graveyard'},'v20-partial-hand-'+i);card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.owner=player;card.ctrl=player;card.zone='hand';player.hand.push(card);}
 }
 if(effect.action==='inspect-top-v20'){
  const card=stage({...effect.filter,controller:'you',zone:'graveyard'},'v20-inspected');a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='library';a.library.push(card);decision(a,(g,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Move the inspected card')?'yes':undefined);
 }
 if(effect.action==='bound-reveal-v20'){
  for(const player of game.players){for(let i=0;i<2;i++)h.zoneCard(M,player,h.fixtureDefinition('Randomly revealed witness '+i,['Creature'],{cost:'{3}',power:'2',toughness:'4'}),'hand');}
  const bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?node.kind==='revealed-card-stat-v8'?3:Object.fromEntries(Object.entries(node).map(([k,v])=>[k,bind(v)])):node;
  for(const clause of effect.clauses)for(const child of [...clause.effects,...(clause.elseEffects||[])])h.stageEffect(bind(child));
 }
 if(effect.action==='hand-count-v20'){
  for(let i=0;i<2;i++){const card=stage({...effect.filter,controller:'you',zone:'graveyard'},'v20-revealed-'+i);a.graveyard.splice(a.graveyard.indexOf(card),1);card.zone='hand';a.hand.push(card);}
  decision(a,(g,q)=>q.type==='chooseCards'&&/^Choose any number of cards to (?:reveal|discard)$/.test(q.prompt)?q.from.slice(0,h.operation.proofRevealCountV20??2):undefined);
  const bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?node.kind==='snapshot-amount-v20'?(h.operation.proofRevealCountV20??2)*(node.multiply??1):Object.fromEntries(Object.entries(node).map(([k,v])=>[k,bind(v)])):node;
  for(const child of effect.effects)h.stageEffect(bind(child));
 }
 if(['retarget-stack-v20','control-stack-v20'].includes(effect.action)){
  for(const fixture of context.retargetFixturesV10?.values()||[]){fixture.original.def={...fixture.original.def,kws:[...(fixture.original.def.kws||[]),'shroud']};game.recalc();}
  decision(a,(g,q)=>q.type==='chooseOption'&&q.prompt.includes(': keep or change target ')?'yes':undefined);
 }
 if(effect.action==='per-player-targets-v20'){
  if(!(a.controller instanceof M.AIController))decision(a,(g,q)=>{if(q.type!=='chooseTargets'||!q.spec?.distinctCtrl)return undefined;const seen=new Set();return q.candidates.filter(card=>{if(seen.has(card.ctrl))return false;seen.add(card.ctrl);return true;}).slice(0,q.max??q.count??1);});
  const replace=node=>Array.isArray(node)?node.map(replace):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,value==='per-player-subject-v20'?0:value==='per-player-player-v20'?1:replace(value)])):node;for(const child of effect.effects)h.stageEffect(replace(child));
 }
 if(effect.action==='choice-table-v20'){const key=h.operation.proofDecisionV20||effect.options[0].key;decision(a,(g,q)=>q.prompt==='Choose a '+effect.kind?key:undefined);for(const child of effect.options.find(o=>o.key===key)?.effects||[])h.stageEffect(child);}
 if(effect.action==='exchange-shuffle-v20')for(let i=0;i<6;i++)h.zoneCard(M,a,'Forest','hand');
 if(effect.action==='zone-choice-v20'){
  for(const p of game.players)for(const {zone,filter}of effect.selections){const card=stage({...filter,...(filter.threshold==='X'?{threshold:3}:{}),zone:'graveyard',controller:p===a?'you':'opponent'},'v20-zone-choice');if(effect.afterChoice)card.def={...card.def,cost:h.operation.proofChoiceV20===false?'{8}':'{0}',types:effect.afterChoice.instantOrFlash&&h.operation.proofChoiceV20!==false?['Instant']:['Creature'],kws:[]};if(zone!=='graveyard'){card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone=zone;p[zone].push(card);}}
  if(effect.optional)decision(a,(g,q)=>q.prompt==='Choose a card from the indicated zones'?(h.operation.proofChoiceV20===false?[]:q.from.slice(0,1)):undefined);
  for(const child of [...(effect.effects||[]),...(effect.elseEffects||[]),...(effect.beforeEffects||[]),...(effect.afterChoice?.effects||[]),...(effect.afterChoice?.elseEffects||[])])h.stageEffect(child);
 }
 if(effect.action==='hand-redraw-v20')for(const p of game.players){for(let i=0;i<3;i++)h.zoneCard(M,p,h.fixtureDefinition('Hand redraw witness '+i,['Sorcery']),'hand');if(effect.selection==='any')decision(p,(g,q)=>q.type==='chooseCards'&&q.prompt.startsWith('Choose hand cards')?q.from.slice(0,2):undefined);}
 if(effect.action==='self-reflexive-v20'){for(const [i,target]of effect.body.targets.entries())stage(target,'v20-reflexive-'+i);for(const child of effect.body.effects)h.stageEffect(child);}
 if(effect.action==='exile-reflexive-v20'){for(const card of flat(targets[effect.target]))card.def={...card.def,types:['Creature'],power:'2',toughness:'3'};for(const [i,target]of effect.body.targets.entries())stage(target,'v20-exile-reflexive-'+i);for(const child of effect.body.effects)h.stageEffect(child);}
 if(effect.action==='optional-effect-v20'){for(const child of effect.effects)h.stageEffect(child);decision(a,(g,q)=>q.prompt==='Use this optional effect?'?'yes':undefined);}
 if(effect.action==='delay-effect-v20'){for(const [i,target]of effect.body.targets.entries())stage(target,'v20-delayed-'+i);for(const child of effect.body.effects)h.stageEffect(child);}
 if(effect.action==='controller-group-v20')for(const p of game.players)for(let i=0;i<2;i++){const card=stage({...effect.filter,controller:p===a?'you':'opponent'},'v20-player-group-'+i);card.tapped=effect.effects.some(e=>e.action==='untap');}
 if(effect.action==='roll-table-v20'||effect.action==='roll-value-v20'){
  const value=h.operation.proofDiceV20??(effect.action==='roll-table-v20'?effect.branches[0].min:4);game.rnd=()=>((value-.5)/effect.sides);
  const effects=effect.action==='roll-table-v20'?effect.branches.find(b=>value>=b.min&&value<=b.max).effects:effect.effects;for(const child of effects)h.stageEffect(child);
 }
 if(['selected-group-damage-v20','multiple-bite-v20'].includes(effect.action))for(const target of targets.flat().filter(c=>c instanceof M.CardInst&&c.zone==='battlefield')){target.def={...target.def,power:'4',toughness:'30'};}
 if(effect.action==='selected-group-damage-v20'){
  for(let i=0;i<2;i++){const c=stage(effect.sources?{...effect.sources,what:'creature'}:effect.filter,'v20-group-'+i);c.def={...c.def,power:String(3+i),toughness:'30'};}
 }
 if(effect.action==='choose-source-v20'){const c=stage(effect.filter,'v20-chosen-source');if(c.is('Creature'))c.def={...c.def,power:'5',toughness:'30'};}
 if(effect.action==='sacrifice-categories-v20')for(const p of game.players)for(const [i,filter]of effect.filters.entries())stage({...filter,controller:p===a?'you':'opponent'},'v20-sacrifice-category-'+i);
 if(effect.action==='target-dies-v20'){
  if(effect.underYou)for(const card of flat(targets[effect.target])){M.OracleV8Control.gain(game,card,a);game.recalc();}
  for(const child of effect.effects)h.stageEffect(child);
 }
 if(effect.action==='sacrifice-stat-v20')for(const p of relevantPlayers(context,effect,targets)){const c=stage({...effect.filter,controller:p===a?'you':'opponent'},'v20-sacrifice-stat');c.def={...c.def,toughness:'6'};}
 if(effect.action==='each-unless-v20'){
  for(const p of game.players)for(let i=0;i<2;i++)stage({...effect.filter,controller:p===a?'you':'opponent'},'v20-pay-each-'+p.idx+'-'+i);
  decision(a,(g,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Pay ')?'yes':undefined);decision(b,(g,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Pay ')?'no':undefined);
 }
 if(effect.action==='any-pay-v20')for(const p of game.players)decision(p,(g,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Pay ')?'no':undefined);
 if(effect.action==='choose-number-v20'){
  for(const p of game.players)for(let i=0;i<2;i++)h.permanent(M,game,p,h.fixtureDefinition('Chosen number witness '+i,['Creature'],{power:'2',toughness:'3'}));
  decision(a,(g,q)=>q.type==='chooseOption'&&q.prompt==='Choose a number'?'1':undefined);
 }
 if(effect.action==='player-group-v20')for(const p of game.players)for(const filter of effect.effect.filters)stage({...filter,controller:p===a?'you':'opponent'},'v20-controller-group');
 if(effect.action==='reveal-discard-v20')for(const p of relevantPlayers(context,effect,targets)){
  const card=stage({...effect.filter,zone:'graveyard',controller:p===a?'you':'opponent'},'v20-revealed');p.graveyard.splice(p.graveyard.indexOf(card),1);card.zone='hand';p.hand.push(card);
 }
 game.recalc();return true;
}

async function childrenProof(M,state,row,entry,damagedPlayer,trace,label,h){
 for(const child of row.children){
  const bind=value=>Array.isArray(value)?value.map(bind):value&&typeof value==='object'?value.kind==='snapshot-amount-v20'?child.ctx.oracleAmountV20*(value.multiply??1):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,bind(v)])):value;
  for(const effect of child.effects){const adjusted=bind(effect);for(const key of ['groupFixtures','zoneFixtures']){const map=state.context[key];if(map)for(const [original,value]of map)if(same(original,effect)||same(original,adjusted)){map.set(adjusted,value);break;}}
   const prior=state.context.oracleAnnouncementTrace;
   try{state.context.oracleAnnouncementTrace=state.decisions;await h.assertGenericEffectEvidence(M,state.context,entry,adjusted,child.ctx.src,child.targets,damagedPlayer,child.before,trace,label+'/bound-child');}
   finally{state.context.oracleAnnouncementTrace=prior;}}
 }
}

export async function assertSpellsEffect(M,context,entry,effect,source,selectedTargets,damagedPlayer,before,trace,label,h){
 if(effect.action==='discover-v9'&&effect.n?.kind==='target-stat'&&effect.n.stat==='mv'){const object=selectedTargets[effect.n.target];assert.equal(object.kind,'spell');await h.assertGenericEffectEvidence(M,context,entry,{...effect,n:context.game.stackSpellManaValue(object)},source,selectedTargets,damagedPlayer,before,trace,label+'/bound-mana-value');return true;}
 if(effect.action==='base-pt'&&effect.target==='created-tokens'&&effect.power===undefined&&effect.toughness===undefined){
  const created=context.tokenCreationEvidence.slice(before.tokenCreationEvidenceIndex).flatMap(row=>Array.from(row.cards||[]));assert.ok(created.length,label+': created token keyword recipients exist');for(const card of created)for(const keyword of effect.keywords)assert.ok(card.kw(keyword),label+': created token receives its lasting keyword');return true;
 }
 if(!actions.has(effect.action))return false;
 const state=worlds.get(context.game),equivalent=row=>{
  if(same(row.effect,effect))return true;
  const mapped=index=>{const local=flat(row.targets[index]);const found=selectedTargets.findIndex(value=>{const global=flat(value);return local.length===global.length&&local.every((card,i)=>card===global[i]);});return found<0?index:found;};
  const adjusted=node=>Array.isArray(node)?node.map(adjusted):node&&typeof node==='object'?node.kind==='snapshot-amount-v20'?row.ctx.oracleAmountV20*(node.multiply??1):Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','otherTarget','who','conditionTarget'].includes(key)&&typeof value==='number'?mapped(value):adjusted(value)])):node;
  return same(adjusted(row.effect),effect);
 },rows=state?.rows.filter(row=>row.ctx.src===source&&equivalent(row))||[];
 assert.ok(rows.length,label+': printed v20 effect executed');
 for(const row of rows){
  const {game}=context,effect=row.effect,action=effect.action;
  if(action==='creature-no-regeneration-sweep-v20'){
   assert.equal(row.children.length,1);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='parity-sweep-v20'){
   const expected=row.before.battlefield.filter(card=>row.before.cards.get(card).types.includes('Creature')&&row.before.cards.get(card).mv%2===(effect.parity==='odd'?1:0)&&!(effect.excludeSource&&card===row.ctx.src));assert.ok(expected.length);assert.equal(row.children.length,1);assert.deepEqual(Array.from(flat(row.children[0].targets[0]),card=>card.iid),Array.from(expected,card=>card.iid));await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='player-consequence-v20'){
   let expected=0;for(const result of row.resultPlayers){const changed=result.candidates.filter(old=>row.after.cards.get(old.card)?.zoneVersion!==old.version&&old.card.zoneVersion!==old.version),required=effect.n==='all'?result.candidates.length:effect.n,success=changed.filter(old=>old.qualifies).length>=required;assert.equal(changed.length,Math.min(result.candidates.length,required),'conditional result consumes the required available cards');if((effect.always||!success)&&(!effect.opponentsOnly||result.player!==row.ctx.you))expected++;}assert.equal(row.children.length,expected,'only players with the printed result receive the consequence');
   for(const child of row.children){const player=child.targets.at(-1),result=row.resultPlayers.find(result=>result.player===player),changed=result.candidates.filter(old=>old.card.zoneVersion!==old.version);assert.equal(child.ctx.oracleAmountV20,changed.length);}
   if(row.children.every(child=>child.ctx.oracleAmountV20>0)||!effect.always)await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);else{assert.equal(effect.effects[0].action.startsWith('token-'),true);assert.equal(row.after.battlefield.filter(card=>card.isToken).length,row.before.battlefield.filter(card=>card.isToken).length);}
  }else if(action==='named-card-v20'){
   const choice=row.decisions.find(d=>d.query.prompt?.endsWith(': choose a card name'));assert.ok(choice);assert.ok(choice.query.options.some(option=>option.key===choice.result));const matches=card=>M.OracleV8NameGroups.names(card).includes(choice.result),players=effect.who===undefined?[row.ctx.you]:row.who;
   for(const player of players){const past=row.before.players.get(player),after=row.after.players.get(player);
    if(effect.mode==='search'){const picks=row.decisions.filter(d=>d.query.prompt==='Choose matching cards to exile').flatMap(d=>d.result),forced=effect.quantity==='all'?past.graveyardCards.filter(matches):[],selected=[...forced,...picks];assert.ok(selected.length);assert.equal(new Set(selected).size,selected.length);for(const card of selected){assert.ok(matches(card));assert.equal(row.after.cards.get(card).zone,'exile');}for(const zone of ['handCards','graveyardCards'])for(const card of past[zone].filter(card=>!matches(card)))assert.equal(row.after.cards.get(card).zone,zone==='handCards'?'hand':'graveyard');if(effect.max!==undefined)assert.ok(selected.length<=effect.max);if(effect.handReward){assert.equal(row.children[0].ctx.oracleAmountV20,selected.filter(card=>past.handCards.includes(card)).length);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);}}
    else if(effect.mode==='check'){const revealed=context.revealEvidence.slice(row.before.revealEvidenceIndex,row.after.revealEvidenceIndex).find(reveal=>reveal.ctrl===player&&reveal.kind==='reveal');assert.ok(revealed);assert.ok(revealed.cards.every(card=>(effect.zone==='library'?past.libraryCards:past.handCards).includes(card)));if(!effect.all)assert.equal(revealed.cards.length,1);assert.ok(revealed.cards.some(matches));if(effect.effects[0]?.action==='named-discard-v20'){assert.equal(revealed.cards[0].zone,'graveyard');assert.equal(row.children.length,0);}else{assert.equal(row.children.length,1);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);}}
    else if(effect.mode==='discard'){const cards=past.handCards.filter(matches);assert.ok(cards.length);assert.equal(cards.filter(card=>row.after.cards.get(card).zone==='graveyard').length,effect.all?cards.length:1);for(const card of past.handCards.filter(card=>!matches(card)))assert.equal(row.after.cards.get(card).zone,'hand');}
    else if(effect.mode==='mill'){const card=past.libraryCards.at(-1);assert.ok(matches(card));assert.equal(row.after.cards.get(card).zone,'graveyard');if(effect.reward==='draw')assert.equal(row.after.players.get(row.ctx.you).hand,row.before.players.get(row.ctx.you).hand+1);else assert.equal(row.after.players.get(row.ctx.you).life,row.before.players.get(row.ctx.you).life+card.mv);}
    else{const top=past.libraryCards.slice().reverse(),prefix=top.splice(0,effect.prefixExile||0);let cards=effect.mode==='top'?top.slice(0,effect.n):top.slice(0,top.findIndex(matches)+1);assert.ok(cards.some(matches));for(const card of prefix)assert.equal(row.after.cards.get(card).zone,'exile');for(const card of cards)assert.equal(row.after.cards.get(card).zone,matches(card)?effect.mode==='tunnel'?'library':'hand':effect.mode==='tunnel'?'graveyard':effect.mode==='top'?effect.rest:'exile');if(effect.losePerExiled)assert.equal(after.life,past.life-cards.filter(card=>!matches(card)).length);assert.ok(context.revealEvidence.slice(row.before.revealEvidenceIndex,row.after.revealEvidenceIndex).some(reveal=>same(Array.from(reveal.cards,card=>card.iid),cards.map(card=>card.iid))));}
   }
   if(effect.beforeHandDamage){assert.equal(row.children.length,1);const player=players[0],n=row.before.players.get(player).handCards.filter(matches).length*effect.beforeHandDamage;assert.equal(row.children[0].effects[0].n,n);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);}
  }else if(action==='hand-subset-v20'){
   const selected=row.decisions.filter(d=>d.query.prompt==='Choose revealed hand cards');assert.ok(selected.length);for(const choice of selected){assert.equal(choice.result.length,choice.query.min);assert.equal(new Set(choice.result).size,choice.result.length);assert.ok(choice.result.every(card=>choice.query.from.includes(card)));for(const card of choice.result)assert.equal(row.after.cards.get(card).zone,effect.destination==='discard'?'graveyard':'library');}
   for(const reveal of row.decisions.filter(d=>d.query.prompt==='Choose hand cards to reveal')){assert.equal(reveal.result.length,reveal.query.min);assert.equal(reveal.result.length<=row.before.players.get(reveal.player).handCards.length,true);for(const choice of selected)assert.ok(choice.result.every(card=>reveal.result.includes(card)));}
   for(const order of row.decisions.filter(d=>d.query.prompt==='Order chosen hand cards, top first'))assert.deepEqual(Array.from(row.after.players.get(order.result[0].owner).libraryCards.slice(-order.result.length).reverse(),card=>card.iid),Array.from(order.result,card=>card.iid));
  }else if(action==='inspect-top-v20'){
   const card=row.before.players.get(row.ctx.you).libraryCards.at(-1);assert.ok(card);assert.equal(row.after.cards.get(card).zone,effect.destination);if(effect.destination==='battlefield')assert.equal(card.tapped,!!effect.tapped);assert.ok(context.revealEvidence.slice(row.before.revealEvidenceIndex,row.after.revealEvidenceIndex).some(r=>r.cards.length===1&&r.cards[0]===card&&r.kind===(effect.reveal?'reveal':'look')));if(effect.revealSelected)assert.ok(context.revealEvidence.slice(row.before.revealEvidenceIndex,row.after.revealEvidenceIndex).some(r=>r.kind==='reveal'&&r.cards[0]===card));
  }else if(action==='bound-reveal-v20'){
   for(const player of row.who){const reveal=context.revealEvidence.slice(row.before.revealEvidenceIndex,row.after.revealEvidenceIndex).find(r=>r.ctrl===player&&r.kind==='reveal');assert.ok(reveal,label+': actual public hand reveal');assert.equal(reveal.cards.length,1);assert.ok(row.before.players.get(player).handCards.includes(reveal.cards[0]));assert.equal(reveal.cards[0].zone,'hand');}await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='hand-count-v20'){
   const choice=row.decisions.find(d=>d.query.type==='chooseCards'&&/^Choose any number of cards to (?:reveal|discard)$/.test(d.query.prompt));assert.ok(choice);assert.equal(row.children.length,1);assert.equal(row.children[0].ctx.oracleAmountV20,choice.result.length);for(const card of choice.result)assert.equal(row.children[0].before.cards.get(card).zone,effect.discard?'graveyard':'hand');await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='retarget-stack-v20'||action==='control-stack-v20'){
   assert.ok(row.stackBefore.length,label+': actual pending spell is affected');for(const old of row.stackBefore){const next=row.stackAfter.find(r=>r.object===old.object);assert.equal(next.targets.length,old.targets.length,label+': original target count preserved');assert.equal(same(next.amounts,old.amounts),true,label+': original damage allocation preserved');assert.equal(same(next.targets,old.targets),false,label+': a legal new target is selected');assert.equal(next.owner.idx,old.owner.idx,label+': spell owner unchanged');if(action==='control-stack-v20'){assert.equal(next.ctrl.idx,row.ctx.you.idx);assert.notEqual(old.ctrl.idx,next.ctrl.idx);}}
  }else if(action==='per-player-targets-v20'){
   assert.ok(row.subjects.length,label+': at least one legal player target is exercised');assert.equal(new Set(row.subjects.map(c=>row.before.cards.get(c).ctrl)).size,row.subjects.length,label+': never two targets controlled by the same player');assert.ok(row.children.length);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='choice-table-v20'){
   const decision=row.decisions.find(d=>d.query.prompt==='Choose a '+effect.kind);assert.ok(decision);if(decision.result==='none'){assert.equal(effect.optional,true);assert.equal(row.children.length,0);}else{assert.equal(row.children.length,1);assert.equal(same(row.children[0].effects,effect.options.find(o=>o.key===decision.result).effects),true);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);}
  }else if(action==='exchange-shuffle-v20'){
   assert.equal(row.children.length,2);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='zone-choice-v20'){
   for(const player of row.who){const choices=row.decisions.filter(d=>d.query.prompt==='Choose a card from the indicated zones');assert.ok(choices.length,label+': actual zone choice');for(const choice of choices){assert.ok(choice.result.length<=1);if(!effect.optional)assert.equal(choice.result.length,1);for(const card of choice.result){assert.ok(choice.query.from.includes(card));assert.equal(row.after.cards.get(card).zone,effect.destination==='discard'?'graveyard':effect.destination);if(effect.play){assert.equal(card.meta.playableBy,row.ctx.you);assert.equal(card.meta.spellsOnly,true);assert.equal(card.meta.anyColor,!!effect.play.anyColor);assert.equal(game.hasExilePlayPermission(row.ctx.you,card),true);}}}
   }await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='hand-limit-emblem-v20'){
   const created=row.ctx.you.emblems.filter(e=>!row.before.players.get(row.ctx.you).emblems.includes(e));assert.equal(created.length,1);assert.equal(created[0].zone,'command');assert.equal(created[0].ctrl,row.ctx.you);assert.equal(game.bf().includes(created[0]),false);assert.equal(game.maximumHandSize(row.ctx.you),Infinity);assert.equal(game.maximumHandSize(context.b),7);
  }else if(action==='hand-redraw-v20'){
   assert.equal(row.children.length,row.who.length,label+': each affected player draws after moving the chosen hand cards');
   for(const player of row.who){const old=row.before.players.get(player),choice=row.decisions.find(d=>d.player===player&&d.query.prompt.startsWith('Choose hand cards')),chosen=choice?Array.from(choice.result):Array.from(old.handCards),child=row.children.find(c=>c.targets[0]===player);assert.ok(child);assert.equal(child.effects[0].n,chosen.length+(effect.bonus||0));
    const moved=child.before.players.get(player);for(const card of chosen)assert.equal(child.before.cards.get(card).zone,effect.destination==='exile'?'exile':'library',label+': selected hand card moves before drawing');
    if(effect.destination==='bottom')assert.deepEqual(Array.from(moved.libraryCards.slice(0,chosen.length)),chosen,label+': chosen bottom order is preserved');
    if(effect.playNextTurn)for(const card of chosen){assert.equal(card.meta.playableBy,player);assert.equal(card.meta.playableUntilOwnTurn,player.turnsStarted+1);}
   }await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='optional-effect-v20'){
   assert.ok(row.decisions.some(d=>d.query.prompt==='Use this optional effect?'&&d.result==='yes'));assert.equal(row.children.length,1);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='exile-choice-v20'){
   const chosen=row.decisions.find(d=>d.query.prompt==='Choose an exiled card you may play');assert.ok(chosen);assert.equal(chosen.result.length,1);assert.equal(chosen.query.from.length,Math.min(effect.n,row.before.players.get(row.ctx.you).libraryCards.length));
   for(const card of chosen.query.from){assert.equal(card.zone,'exile');assert.equal(card.meta.playableBy===row.ctx.you,card===chosen.result[0]);}
  }else if(action==='delay-effect-v20'){
   assert.equal(row.addedDelayed.length,1);await game.emit(effect.event,{player:row.ctx.you});await h.resolveAll(game);assert.ok(row.addedDelayed.every(d=>!game.delayed.includes(d)));assert.equal(row.children.length,1);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='controller-group-v20'){
   const expected=row.before.battlefield.filter(c=>row.who.includes(row.before.cards.get(c).ctrl)&&row.matching.includes(c));assert.equal(row.children.length,1);assert.deepEqual(Array.from(flat(row.children[0].targets[0]),c=>c.iid),Array.from(expected,c=>c.iid));await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='roll-table-v20'||action==='roll-value-v20'){
   assert.equal(row.children.length,1);const n=row.children[0].ctx.oracleAmountV20;assert.ok(Number.isInteger(n)&&n>=1&&n<=effect.sides);if(action==='roll-table-v20')assert.ok(same(row.children[0].effects,effect.branches.find(b=>n>=b.min&&n<=b.max).effects));await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='exile-reflexive-v20'){
   assert.equal(row.subjects.length,1);assert.equal(row.subjects[0].zone,'exile');assert.equal(row.children.length,2,label+': successful creature exile resolves a separate reflexive trigger');await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='self-reflexive-v20'){
   assert.equal(row.ctx.src.zone,'graveyard');assert.equal(row.children.length,1,label+': actual sacrifice queues and resolves the reflexive trigger');await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='multiple-bite-v20'||action==='selected-group-damage-v20'){
   const sources=action==='multiple-bite-v20'?row.subjects:effect.sources?row.sources:row.subjects;
   const recipients=action==='multiple-bite-v20'?row.recipients:effect.sources?row.subjects:row.matching.filter(c=>!effect.excludeSource||!row.subjects.includes(c));
   const hits=context.damageEvidence.slice(row.before.damageEvidenceIndex,row.after.damageEvidenceIndex);
   for(const src of sources)for(const target of recipients){const power=effect.n??Math.max(0,row.before.cards.get(src).power);assert.ok(hits.some(hit=>hit.source===src&&hit.target===target&&hit.n===power),label+': each source deals its printed amount to each intended recipient');}
   assert.equal(hits.length,sources.length*recipients.length,label+': no extra damage recipient');
  }else if(action==='snapshot-amount-v20'){
   assert.equal(row.children.length,1);assert.equal(row.children[0].ctx.oracleAmountV20,row.amount,label+': snapshot binds the pre-effect amount');await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='choose-source-v20'){
   const chosen=row.decisions.find(d=>d.query.type==='chooseCards'&&d.query.prompt==='Choose a permanent');assert.ok(chosen);assert.equal(chosen.result.length,1);assert.ok(row.matching.includes(chosen.result[0]));assert.equal(row.children[0].targets[0],chosen.result[0]);await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='player-group-v20'){
   const excluded=effect.excludeTarget===undefined?[]:flat(row.targets[effect.excludeTarget]),players=effect.who?.kind==='target-controller'?flat(row.targets[effect.who.index]).map(c=>row.before.cards.get(c)?.ctrl):row.who;
   const expected=row.before.battlefield.filter(c=>players.includes(row.before.cards.get(c).ctrl)&&!excluded.includes(c)&&c.is('Creature'));
   assert.equal(row.children.length,expected.length,label+': only that player\'s eligible other creatures affected');for(const c of expected)assert.ok(row.children.some(child=>child.targets[0]===c));await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='sacrifice-stat-v20'){
   const choice=row.decisions.find(d=>d.query.type==='chooseCards'&&d.query.prompt==='Choose a creature to sacrifice');assert.ok(choice);const card=choice.result[0];assert.equal(card.zone,'graveyard');assert.equal(row.children[0].ctx.oracleAmountV20,Math.max(0,row.before.cards.get(card)[effect.stat]));await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='sacrifice-categories-v20'){
   const chosen=row.decisions.filter(d=>d.query.type==='chooseCards').flatMap(d=>d.result);assert.equal(new Set(chosen).size,chosen.length);assert.equal(chosen.length,row.who.length*effect.filters.length,label+': every available category is sacrificed');for(const card of chosen)assert.equal(row.after.cards.get(card).zone,'graveyard');
  }else if(action==='choose-number-v20'){
   const choice=row.decisions.find(d=>d.query.prompt==='Choose a number');assert.ok(choice);const n=Number(choice.result);assert.equal(n,1);for(const p of game.players){const creatures=row.before.battlefield.filter(c=>row.before.cards.get(c).ctrl===p&&row.before.cards.get(c).types.includes('Creature'));assert.equal(creatures.filter(c=>row.after.cards.get(c).zone==='graveyard').length,Math.min(n,creatures.length));}
  }else if(action==='each-unless-v20'){
   assert.ok(row.matching.length>=2);for(const card of row.matching){const old=row.before.cards.get(card),paid=old.ctrl===context.a;assert.equal(row.after.cards.get(card).zone,paid?'battlefield':effect.operation==='sacrifice'?'graveyard':'hand');}if(row.payment.life!==undefined){for(const p of game.players){const n=row.matching.filter(c=>row.before.cards.get(c).ctrl===p).length;assert.equal(row.after.players.get(p).life,row.before.players.get(p).life-(p===context.a?row.payment.life*n:0));}}
  }else if(action==='any-pay-v20'){
   assert.ok(row.decisions.filter(d=>d.query.prompt?.startsWith('Pay ')).every(d=>d.result==='no'));assert.equal(row.children.length,1,label+': declining all payments executes the printed effect');await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='order-graveyard-v20'){
   const old=row.before.players.get(row.ctx.you).graveyardCards,now=row.after.players.get(row.ctx.you).graveyardCards;assert.equal(now.length,old.length);assert.ok(old.every(c=>now.includes(c)));if(old.length>1){const choice=row.decisions.find(d=>d.query.prompt==='Order your graveyard from bottom to top');assert.ok(choice);assert.deepEqual(Array.from(now),Array.from(choice.result));}
  }else if(action==='reveal-discard-v20'){
   for(const p of row.who){const expected=row.before.players.get(p).handCards.filter(c=>row.helpers.genericTargetSpec({...effect.filter,zone:'hand',controller:'any'},[],0).filter(game,c,p,row.ctx.src));for(const card of expected)assert.equal(row.after.cards.get(card).zone,'graveyard');}
  }else if(action==='delay-subject-v20'||action==='target-dies-v20'){
   assert.ok(row.addedDelayed.length,label+': exact delayed trigger installed');
   if(action==='target-dies-v20')for(const card of row.subjects.filter(c=>c.zone==='battlefield'))await game.destroy(card);else await game.emit(effect.event,{player:row.ctx.you});
   await h.resolveAll(game);
   assert.ok(row.addedDelayed.every(d=>!game.delayed.includes(d)),label+': delayed trigger fires once');
   if(action==='delay-subject-v20')for(const card of row.subjects){const old=row.before.cards.get(card),controller=old.ctrl;assert.equal(card.zone,effect.operation==='sacrifice'&&controller!==row.ctx.you?'battlefield':card.isToken?'ceased':['sacrifice','destroy'].includes(effect.operation)?'graveyard':effect.operation==='exile'?'exile':'hand');}
   await childrenProof(M,state,row,entry,damagedPlayer,trace,label,h);
  }else if(action==='death-return-v20'){
   const saved=row.ctx.oracleDeadV20,card=game.byIid(saved.iid);assert.equal(card.zone,'battlefield');assert.equal(card.ctrl,game.players[saved.owner]);assert.equal(card.zoneVersion,saved.version+1);
  }
 }
 return true;
}

export async function operationProofV20(M,entry,operation,role,h){
 if(entry.raw.name==='Dementia Sliver'&&operation.kind==='generic-static'){
  const child=operation.grantedOperation;assert.equal(child?.effects?.[0]?.action,'named-card-v20');let checks=0;
  for(const matching of [false,true]){
   const context=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;h.assertControllerRole(M,context,entry.raw.name);
   const source=h.permanent(M,game,a,entry.raw.name),host=h.permanent(M,game,a,h.fixtureDefinition('Independent Sliver host',['Creature'],{power:'2',toughness:'3',subtypes:['Sliver']})),card=h.zoneCard(M,b,matching?'Grizzly Bears':'Forest','hand');host.sick=false;
   decision(a,(g,q)=>q.prompt?.endsWith(': choose a card name')?'Grizzly Bears':q.type==='chooseTargets'?[b]:undefined);
   game.turnPlayer=b;assert.equal(game.activatableList(a).some(row=>row.card===host&&same(row.ability?.oracleOperation,child)),false,'granted activation respects its controller turn restriction');game.turnPlayer=a;
   const activation=game.activatableList(a).find(row=>row.card===host&&same(row.ability?.oracleOperation,child));assert.ok(activation,'independent Sliver receives the printed activation');assert.equal(await game.activateAbility(a,activation),true);await h.resolveAll(game);
   assert.equal(host.tapped,true);assert.equal(card.zone,matching?'graveyard':'hand','only the correctly named random card is discarded');await game.move(source,'exile');game.recalc();assert.equal(host.cur.extraAbilities.length,0,'the grant ends when Dementia Sliver leaves');checks+=6;
  }return checks;
 }
 // Layouts and granted abilities have their own drivers, which recurse into
 // these operations. Do not replace the outer driver with a generic cast.
 if(!['generic-trigger','generic-ability','spell-generic','spell-modal-generic'].includes(operation.kind))return null;
 if(operation.kind==='generic-trigger'&&operation.enchantedPlayerV17&&operation.effects?.length===1&&operation.effects[0].action==='player-consequence-v20'){
  const effect=operation.effects[0];let checks=0;for(const available of [false,true]){const context=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;h.assertControllerRole(M,context,entry.raw.name);h.fillLibrary(M,a,10);h.fillLibrary(M,b,10);h.fund(a);const source=h.zoneCard(M,a,entry.raw.name,'hand'),victim=available?h.permanent(M,game,b,'Grizzly Bears'):null;decision(a,(g,q)=>q.type==='chooseTargets'?[b]:undefined);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);const life=b.life;await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(b.life,life,'another player upkeep does not trigger enchanted-player consequence');await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(b.life,life-(available?0:effect.effects[0].n));if(victim)assert.equal(victim.zone,'graveyard');assert.equal(source.zone,'battlefield');checks+=5;}return checks;
 }
 if(JSON.stringify(operation).includes('player-consequence-v20')&&operation.proofConsequenceV20===undefined){let checks=0;for(const proofConsequenceV20 of [true,false])checks+=await h.genericRuntimeOperationProof(M,entry,{...operation,proofConsequenceV20,originalOperation:operation},role);return checks;}
 const inspected=operation.effects?.length===1&&operation.effects[0];
 if(operation.kind==='generic-trigger'&&['etb','upkeep'].includes(operation.event)&&inspected?.action==='inspect-top-v20'&&inspected.filter.subtype?.kind==='chosen-subtype-v16'){
  let checks=0;for(const matching of [false,true]){
   const context=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;h.assertControllerRole(M,context,entry.raw.name);h.fillLibrary(M,a,10);h.fillLibrary(M,b,10);h.fund(a);
   decision(a,(g,q)=>q.prompt===entry.raw.name+': choose a creature type'?'Elf':q.prompt?.startsWith('Move the inspected card')?'yes':undefined);
   const source=h.zoneCard(M,a,entry.raw.name,'hand'),stage=()=>h.zoneCard(M,a,h.fixtureDefinition('Chosen type library witness',['Creature'],{cost:'{2}',power:'2',toughness:'3',subtypes:[matching?'Elf':'Goblin']}),'library');let witness;
   if(operation.event==='etb')witness=stage();assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.meta.oracleChosenSubtypeV16,'Elf');
   if(operation.event==='upkeep'){witness=stage();await game.emit('upkeep',{player:a});await h.resolveAll(game);}
   assert.equal(witness.zone,matching?'hand':inspected.otherwise,'chosen creature type controls the actual inspected-card branch');assert.equal(source.zone,'battlefield');checks+=4;
  }return checks;
 }
 if(entry.raw.name==='Insidious Will'&&operation.kind==='spell-modal-generic'){
  let checks=0;for(const mode of [0,1,2]){const context=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;h.assertControllerRole(M,context,entry.raw.name);const original=h.permanent(M,game,a,h.fixtureDefinition('Original modal target',['Creature'],{power:'2',toughness:'20'})),replacement=h.permanent(M,game,b,h.fixtureDefinition('Replacement modal target',['Creature'],{power:'8',toughness:'20'})),donor=h.zoneCard(M,b,'Shock','hand');h.fund(a);h.fund(b);decision(b,(g,q)=>q.type==='chooseTargets'?[original]:undefined);assert.equal(await game.castSpell(b,donor,{from:'hand'}),true);const object=game.stack.find(s=>s.card===donor),source=h.zoneCard(M,a,entry.raw.name,'hand');let copies=0;const copy=game.copySpellBatch;game.copySpellBatch=async function(...args){const result=await copy.apply(this,args);copies+=result.length;return result;};decision(a,(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='mode'?String(mode):q.type==='chooseOption'&&q.prompt.includes(': keep or change target ')?'yes':q.type==='chooseTargets'?q.candidates.includes(object)?[object]:[replacement]:q.type==='chooseOption'&&q.aiHint?.kind==='newTargets'?'yes':undefined);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(donor.zone,'graveyard');assert.equal(source.zone,'graveyard');assert.equal(copies,mode===2?1:0);assert.equal(original.damage,mode===2?2:0);assert.equal(replacement.damage,mode===0?0:2);checks+=6;}return checks;
 }
 if(entry.raw.name==='Speedball, New Warrior'&&operation.kind==='generic-trigger'){
  const context=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;h.assertControllerRole(M,context,entry.raw.name);const source=h.permanent(M,game,a,entry.raw.name),replacement=h.permanent(M,game,b,h.fixtureDefinition('Redirect destination',['Creature'],{power:'8',toughness:'20'})),power=source.power;
  const spell=h.zoneCard(M,b,h.fixtureDefinition('Speedball targeted spell',['Instant'],{cost:'{0}',targets:[M.T.creature({aiHint:{goal:'damage'}})],resolve:async c=>c.g.damageAny(c.src,c.targets[0],1)}),'hand');h.fund(b);decision(b,(g,q)=>q.type==='chooseTargets'?[source]:undefined);decision(a,(g,q)=>q.type==='chooseOption'&&q.prompt.includes(': keep or change target ')?'yes':role==='human'&&q.type==='chooseTargets'&&q.prompt.endsWith(': choose a new target')?[replacement]:undefined);assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);const object=game.stack.find(s=>s.card===spell);await h.resolveAll(game);assert.equal(source.power,power+2);assert.equal(object.targets[0].iid,replacement.iid);assert.equal(source.damage,0);assert.equal(replacement.damage,1);return 5;
 }
 if(!operation.proofRetargetV20&&JSON.stringify(operation).match(/"(?:retarget-stack-v20|control-stack-v20)"/)){
  const stage=node=>Array.isArray(node)?node.map(stage):node&&typeof node==='object'?{...Object.fromEntries(Object.entries(node).map(([k,v])=>[k,stage(v)])),...(node.zone==='stack'?{singleTargetV10:true}:{})}:node;
  return h.genericRuntimeOperationProof(M,entry,{...stage(operation),proofRetargetV20:true,originalOperation:operation},role);
 }
 if(entry.raw.name==='Searing Rays'&&operation.kind==='spell-generic'){
  let checks=0;for(const [color,symbol]of Object.entries({white:'W',blue:'U',black:'B',red:'R',green:'G'})){
   const context=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;h.assertControllerRole(M,context,entry.raw.name);for(const p of [a,b])h.fillLibrary(M,p,10);h.fund(a);decision(a,(g,q)=>q.prompt==='Choose a color'?color:undefined);
   for(const [p,n]of [[a,2],[b,3]]){for(let i=0;i<n;i++)h.permanent(M,game,p,h.fixtureDefinition('Counted '+i,['Creature'],{power:'1',toughness:'4',colorsOverride:[symbol]}));h.permanent(M,game,p,h.fixtureDefinition('Unrelated color',['Creature'],{power:'1',toughness:'4',colorsOverride:[symbol==='G'?'U':'G']}));}
   const before=[a.life,b.life],source=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(a.life,before[0]-2);assert.equal(b.life,before[1]-3);checks+=3;
  }return checks;
 }
 if(entry.raw.name==="Puca's Eye"&&operation.kind==='generic-ability'){
  const context=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;h.assertControllerRole(M,context,entry.raw.name);h.fillLibrary(M,a,20);h.fillLibrary(M,b,20);h.fund(a);const source=h.permanent(M,game,a,entry.raw.name);
  for(const color of ['W','U','B','R'])h.permanent(M,game,a,h.fixtureDefinition('Color '+color,['Creature'],{cost:'{'+color+'}',colors:[color]}));assert.equal(game.activatableList(a).some(e=>e.card===source&&e.ability),false,'four colors cannot activate the printed ability');h.permanent(M,game,a,h.fixtureDefinition('Color G',['Creature'],{cost:'{G}',colors:['G']}));const action=game.activatableList(a).find(e=>e.card===source&&e.ability);assert.ok(action,'all five colors permit the ability');assert.equal(await game.activateAbility(a,action),true);await h.resolveAll(game);assert.equal(source.tapped,true);assert.equal(a.hand.length,1);assert.equal(a.library.length,19);return 5;
 }
 const findTable=node=>!node||typeof node!=='object'?null:node.action==='choice-table-v20'?node:Array.isArray(node)?node.map(findTable).find(Boolean):Object.values(node).map(findTable).find(Boolean);
 const table=findTable(operation);if(table&&operation.proofDecisionV20===undefined){let checks=0;for(const proofDecisionV20 of [...table.options.map(o=>o.key),...(table.optional?['none']:[])])checks+=await h.genericRuntimeOperationProof(M,entry,{...operation,proofDecisionV20,originalOperation:operation},role);return checks;}
 const findChoice=node=>!node||typeof node!=='object'?null:node.action==='zone-choice-v20'&&(node.optional&&node.elseEffects||node.afterChoice)?node:Array.isArray(node)?node.map(findChoice).find(Boolean):Object.values(node).map(findChoice).find(Boolean);
 if(findChoice(operation)&&operation.proofChoiceV20===undefined){let checks=0;for(const proofChoiceV20 of [true,false])checks+=await h.genericRuntimeOperationProof(M,entry,{...operation,proofChoiceV20,originalOperation:operation},role);return checks;}
 if(JSON.stringify(operation).includes('any-grave-size-v20')){
  let checks=0;
  for(const graveSize of [19,20]){
   const context=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;h.assertControllerRole(M,context,entry.raw.name);h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);h.fund(a);
   for(let i=0;i<graveSize;i++)h.zoneCard(M,b,'Forest','graveyard');const src=h.zoneCard(M,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,src,{from:'hand'}),true);await h.resolveAll(game);const expected=graveSize===20?3:1;assert.equal(a.hand.length,expected);assert.equal(a.library.length,30-expected);checks+=3;
  }return checks;
 }
 const find=node=>!node||typeof node!=='object'?null:node.action==='roll-table-v20'?node:Array.isArray(node)?node.map(find).find(Boolean):Object.values(node).map(find).find(Boolean);
 const dice=find(operation);if(dice&&operation.proofDiceV20===undefined){let checks=0;for(const branch of dice.branches)checks+=await h.genericRuntimeOperationProof(M,entry,{...operation,proofDiceV20:branch.min,originalOperation:operation},role);return checks;}
 return null;
}
