import assert from 'node:assert/strict';
import {stageCondition,stageFalseCondition} from './oracle-v5-proof.mjs';
const worlds=new WeakMap(),installed=new WeakSet(),actions=new Set(['grave-return-counters-v21','player-or-controller-v21','damage-controller-batch-v21']);
const flat=x=>[x].flat(Infinity).filter(Boolean),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const map=(x,fn)=>Array.isArray(x)?x.map(v=>map(v,fn)):x&&typeof x==='object'?fn(Object.fromEntries(Object.entries(x).map(([k,v])=>[k,map(v,fn)]))):x;
function offset(effects,n){return map(effects,node=>Object.fromEntries(Object.entries(node).map(([k,v])=>[k,['target','who','otherTarget','sourceTarget','conditionTarget'].includes(k)&&typeof v==='number'?v+n:k==='index'&&['target-controller','target-owner','locked-player'].includes(node.kind)&&typeof v==='number'?v+n:v])));}
function install(M,context,h){
 let state=worlds.get(context.game);if(!state){state={context,h,rows:[],casts:[]};worlds.set(context.game,state);}state.h=h;
 if(!state.castInstalled){state.castInstalled=true;const cast=context.game.castSpell;context.game.castSpell=async function(player,card,opts){if(state.leastPowerPositive){for(const c of this.bf().filter(c=>c.is('Creature')&&!c.def.oracleImplementation)){c.def={...c.def,power:'0',toughness:'20'};delete c.counters['+1/+1'];delete c.counters['-1/-1'];}this.recalc();}const before=Object.values(player.pool).reduce((a,b)=>a+b,0),result=await cast.call(this,player,card,opts);if(result)state.casts.push({card,object:this.stack.find(o=>o.kind==='spell'&&o.card===card),paid:before-Object.values(player.pool).reduce((a,b)=>a+b,0)});return result;};}
 for(const handler of M.OracleV20.handlers)if(handler.spellsV21&&!installed.has(handler)){installed.add(handler);const effect=handler.effect;handler.effect=async function(ctx,node,helpers){const state=worlds.get(ctx.g);if(!state||!actions.has(node.action))return effect.call(this,ctx,node,helpers);const snap=()=>state.h.genericProofSnapshot(state.context,[ctx.src,...ctx.g.bf(),...ctx.g.players.flatMap(p=>['hand','library','graveyard','exile'].flatMap(z=>p[z]))]);const row={effect:node,ctx:{...ctx},before:snap(),children:[],subjects:helpers.genericEffectSubjects(ctx,node.target),n:helpers.genericAmount(node.n,ctx),groupN:node.groupN===undefined?undefined:helpers.genericAmount(node.groupN,ctx)};state.rows.push(row);
  if(node.action==='damage-controller-batch-v21'){const spec=helpers.genericTargetSpec(node.filter,[],0);row.hits=row.subjects.flatMap(subject=>{const player=subject instanceof M.Player?subject:ctx._oracleTargetControllers?.[node.target]?.find(r=>r.subject===subject)?.controller||subject.ctrl;return [{card:subject,n:row.n},...ctx.g.bf().filter(c=>c.ctrl===player&&spec.filter(ctx.g,c,player,ctx.src)).map(card=>({card,n:row.groupN}))];});}
  if(node.action==='grave-return-counters-v21'){const spec=helpers.genericTargetSpec(node.filter,[],0);row.cards=ctx.g.players.flatMap(p=>p.graveyard.filter(c=>spec.filter(ctx.g,c,p,ctx.src)));}
  try{return await effect.call(this,ctx,node,{...helpers,runGenericEffects:async(child,effects)=>{const item={ctx:{...child},effects,before:snap()};row.children.push(item);return helpers.runGenericEffects(child,effects);}});}finally{row.after=snap();}
 };}
 return state;
}
export function installSpellProofV21(M,context,h){return install(M,context,h);}
export function stageSpellsCountV21(M,context,node,h){if(node?.kind!=='spell-count-v21')return false;assert.equal(node.test,'nontoken-died');context.game.diedThisTurn.push({types:['Creature'],isToken:false},{types:['Creature'],isToken:false},{types:['Creature'],isToken:true},{types:['Artifact'],isToken:false});return true;}
export function spellCountValueV21(context,source,node){if(node?.kind==='spell-count-v21'&&node.test==='nontoken-died')return context.game.diedThisTurn.filter(row=>row.types.includes('Creature')&&!row.isToken).length;}
export function stageSpellsConditionV21(M,context,node,source,h,positive=true){
 if(node?.kind==='spell-mode-condition-v21'){assert.equal(node.test,'opponent-graveyard');for(const p of context.game.players.filter(p=>p!==context.a)){while(p.graveyard.length>0){const c=p.graveyard.pop();c.zone='library';p.library.push(c);}for(let i=0;i<(positive?node.min:node.min-1);i++)h.zoneCard(M,p,'Forest','graveyard');}return true;}
 if(node?.kind!=='spell-target-condition-v21')return false;
 if(node.test==='stat'){const n=positive?node.threshold:node.comparison==='less'?node.threshold+1:node.threshold-1;source.def={...source.def,[node.stat==='mv'?'cost':node.stat]:node.stat==='mv'?'{'+n+'}':String(n)};context.game.recalc();return true;}
 assert.equal(node.test,'least-power');source.def={...source.def,power:positive?'0':'5',toughness:'20'};h.permanent(M,context.game,context.a,h.fixtureDefinition('Least power witness',['Creature'],{power:'0',toughness:'20'}));if(positive)install(M,context,h).leastPowerPositive=true;context.game.recalc();return true;
}
export function stageSpellsEffectV21(M,context,effect,h){
 if(effect.action==='spell-cast-fixture-v21'){
  const state=install(M,context,h);state.fixture=effect;
  if(effect.kicked!==undefined)context.kickerProof=effect.kicked;
  if(effect.kicked===true){const payment=h.entry?.implementation.find(op=>op.kind==='mechanic-keyword-payment-v8'&&op.keyword==='kicker');for(const cost of payment?.costs||[])if(cost.kind==='sacrifice')for(let i=0;i<cost.quantity.min;i++)h.permanent(M,context.game,context.a,h.fixtureDefinition('Kicker sacrifice '+i,cost.object.types,{power:'2',toughness:'20'}));}
  if(effect.condition){const source={castMeta:{},meta:{}};if(effect.condition.kind==='kicked')context.kickerProof=effect.positive;else (effect.positive?stageCondition:stageFalseCondition)(M,context,effect.condition,source,h);}
  return true;
 }
 if(!actions.has(effect.action))return false;install(M,context,h);
 if(effect.action==='grave-return-counters-v21')for(const player of context.game.players)for(let i=0;i<2;i++)h.stageGenericTarget(M,{...context,a:player,b:context.game.players.find(p=>p!==player)},{...effect.filter,controller:'you'},'counter-return-'+i);
 if(effect.action==='damage-controller-batch-v21'){const target=flat(h.stagedTargets[effect.target])[0],player=target instanceof M.Player?target:target.ctrl;for(let i=0;i<2;i++)h.stageGenericTarget(M,{...context,a:player,b:context.game.players.find(p=>p!==player)},{...effect.filter,controller:'you'},'controller-burn-'+i);}
 if(effect.action==='player-or-controller-v21'){const target=flat(h.stagedTargets[effect.target])[0],player=target instanceof M.Player?target:target.ctrl;for(let i=0;i<6;i++)h.zoneCard(M,player,'Forest','hand');}
 return true;
}
export async function assertSpellsEffectV21(M,context,entry,effect,source,selectedTargets,damagedPlayer,before,trace,label,h){
 if(effect.action==='spell-cast-fixture-v21'){
  const state=worlds.get(context.game),row=state?.casts.find(c=>c.card===source);assert.ok(row?.object,label+': actual spell announcement captured');if(effect.kicked!==undefined)assert.equal(row.object.kicked,effect.kicked,label+': actual paid kicker branch');assert.equal(row.object.targetSpecs?.length||0,effect.targetCount,label+': branch announces only its own target groups');assert.ok(row.paid>0,label+': real mana was paid');return true;
 }
 if(!actions.has(effect.action))return false;const rows=worlds.get(context.game)?.rows.filter(row=>same(row.effect,effect));assert.ok(rows?.length,label+': actual instruction executed');
 for(const row of rows){
  if(effect.action==='grave-return-counters-v21'){assert.ok(row.cards.length);for(const card of row.cards){assert.equal(card.zone,'battlefield',label+': graveyard creature enters');for(const [counter,n]of Object.entries(effect.additionalCounters))assert.equal(card.counters[counter],n,label+': counters enter with creature');assert.equal(card.ctrl,card.owner,label+': returns under owner control');}}
  if(effect.action==='damage-controller-batch-v21')for(const hit of row.hits){const snapshot=hit.card instanceof M.Player?row.before.players.get(hit.card):row.before.cards.get(hit.card);assert.ok(snapshot);if(hit.card instanceof M.Player)assert.equal(hit.card.life,snapshot.life-hit.n,label+': exact player burn');else if(hit.card.is('Planeswalker'))assert.equal(hit.card.counters.loyalty,snapshot.counters.loyalty-hit.n,label+': exact loyalty burn');else assert.equal(hit.card.damage,snapshot.damage+hit.n,label+': exact controller creature burn');}
  if(effect.action==='player-or-controller-v21'){assert.ok(row.children.length);for(const child of row.children)for(const node of child.effects)await h.assertGenericEffectEvidence(M,effect.asActor?{...context,a:child.ctx.you,b:context.game.players.find(p=>p!==child.ctx.you)}:context,entry,node,source,child.ctx.targets,child.ctx.targets[0],child.before,trace,label+'/controller');}
 }
 return true;
}
function genericOperation(operation){
 if(operation.kind==='spell-generic')return operation;
 const target=what=>({what:what==='any target'?'any':what.replace(/^target /,''),zone:'battlefield',controller:'any',min:1});
 if(operation.kind==='spell-damage')return {targets:[target(operation.what)],effects:[{action:'damage',target:0,n:operation.n}]};
 if(operation.kind==='spell-bounce')return {targets:[target(operation.what)],effects:[{action:'bounce',target:0}]};
 if(operation.kind==='spell-destroy'||operation.kind==='spell-exile')return {targets:[target(operation.what)],effects:[{action:operation.kind==='spell-destroy'?'destroy':'exile',target:0,...(operation.noRegen?{noRegen:true}:{})}]};
 if(operation.kind==='spell-pump')return {targets:[{...target('creature'),controller:operation.controller||'any'}],effects:[{action:'pump',target:0,power:operation.power,toughness:operation.toughness,keywords:operation.keywords}]};
 if(operation.kind==='spell-graveyard-return')return {targets:[{what:operation.what,zone:'graveyard',controller:'you',min:1}],effects:[{action:'bounce',target:0}]};
 if(operation.kind==='spell-v4'&&operation.targets?.length===1&&operation.effects.every(e=>e.kind==='returnToHand')){const t=operation.targets[0];return {targets:[{what:(t.cardTypes[0]||'Card').toLowerCase(),zone:t.zone,controller:t.owner==='you'?'you':'any',min:t.quantity.min,max:t.quantity.max}],effects:operation.effects.map(()=>({action:'bounce',target:0}))};}
 return null;
}
export async function operationProofV21(M,entry,operation,role,h){
 if(['mechanic-kicker','mechanic-keyword-payment-v8'].includes(operation.kind)){const branch=entry.implementation.find(op=>op.kind==='spell-kicker-branches-v21');if(branch)return operationProofV21(M,entry,branch,role,h);}
 if(operation.kind==='spell-kicker-branches-v21'){
  let checks=0;for(const [key,kicked]of [['ordinary',false],['kicked',true]]){const targets=[],effects=[];for(const op of operation[key].implementation){const body=genericOperation(op);assert.ok(body,entry.raw.name+': kicker body proof '+op.kind);effects.push(...offset(body.effects,targets.length));targets.push(...body.targets);}
   effects.push({action:'spell-cast-fixture-v21',kicked,targetCount:targets.length});checks+=await h.genericRuntimeOperationProof(M,entry,{kind:'spell-generic',targets,effects,originalOperation:operation,paragraphProof:true},role);
  }return checks;
 }
 if(operation.kind==='spell-modal-generic'&&operation.modes.some(mode=>mode.castConditionV21)){
  let checks=0;const condition=operation.modes.find(mode=>mode.castConditionV21).castConditionV21;
  for(const [index,mode]of operation.modes.entries()){const targets=[],effects=[];for(const item of operation.modes){effects.push(...offset(item.body.effects,targets.length));targets.push(...item.body.targets);}effects.push({action:'spell-cast-fixture-v21',condition,positive:!!mode.castConditionV21,targetCount:mode.body.targets.length});checks+=await h.genericRuntimeOperationProof(M,entry,{kind:'spell-generic',modal:operation,modePlan:[index],targets,effects,originalOperation:operation,paragraphProof:true},role);}return checks;
 }
 return null;
}
