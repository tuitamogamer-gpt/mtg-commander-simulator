import assert from 'node:assert/strict';
import {stageCount,countValue,matchesTarget} from './oracle-v5-proof.mjs';
const states=new WeakMap(),installed=new WeakSet();
const actions=new Set(['cast-card-v8','cast-from-hand-v8','cast-from-graveyard-v8','cast-inspected-v8']);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const pool=p=>Object.values(p.pool).reduce((sum,n)=>sum+Number(n||0),0);
const gain=async ctx=>ctx.g.gainLife(ctx.you,3,ctx.src);
function stagePermissionCount(MTG,context,node,h){
 if(node?.kind==='signed')return;
 if(node?.kind==='sum'){for(const child of node.values)stagePermissionCount(MTG,context,child,h);return;}
 stageCount(MTG,context,node,h);
}
function install(MTG,context,h){
 let state=states.get(context.game);if(state)return state;
 state={context,h,rows:[],active:null,spells:new Map(),events:[]};states.set(context.game,state);
 const game=context.game,emit=game.emit;game.emit=async function(event,data,...args){state.events.push({event,data});return emit.call(this,event,data,...args);};
 const resolve=game.resolveTop;game.resolveTop=async function(...args){
  const object=this.stack.at(-1),row=state.spells.get(object);if(row)row.resolution={before:row.player.life};
  const result=await resolve.apply(this,args);if(row){row.resolution.after=row.player.life;row.resolution.removed=!this.stack.includes(object);}return result;
 };
 if(!installed.has(MTG.OracleV8PlayPermissions)){
  installed.add(MTG.OracleV8PlayPermissions);const run=MTG.OracleV8PlayPermissions.run;
  MTG.OracleV8PlayPermissions.run=async function(ctx,effect,helpers){
   const state=states.get(ctx.g);if(!state)return run.call(this,ctx,effect,helpers);
   const n=typeof effect.n==='object'?countValue(state.context,ctx.src,effect.n):effect.n==='X'?ctx.x??ctx.so?.x:effect.n;
   const owner=helpers.subjects(ctx,effect.who??'you')[0];let cards;
   if(effect.action==='cast-card-v8')cards=helpers.subjects(ctx,effect.target);
   else if(effect.action==='cast-from-graveyard-v8')cards=(effect.who==='each-player'?ctx.g.alivePlayers():helpers.subjects(ctx,effect.who??'you')).flatMap(player=>player.graveyard);
   else if(effect.action==='cast-from-hand-v8')cards=owner.hand.slice();
   else if(effect.until){cards=[];for(const card of owner.library.slice().reverse()){cards.push(card);if(matchesTarget(card,{...effect.until,controller:'any'},state.context,ctx.src))break;}}
   else cards=n?owner.library.slice(-n).reverse():[];
   const row={effect,source:ctx.src,player:ctx.you,cards:cards.map(card=>({card,zone:card.zone,version:card.zoneVersion})),pool:pool(ctx.you),events:state.events.length,choices:[]};state.rows.push(row);
   const controller=ctx.you.controller,decide=controller.decide;controller.decide=async function(g,q){
    const donor=!ctx.you.isAI&&q.type==='chooseCards'&&q.prompt?.startsWith('You may cast one')&&q.from.find(card=>card.def._immediateCastProof);
    const result=donor?[donor]:await decide.call(this,g,q);row.choices.push({q,result});return result;
   };
   try{
    row.cast=await run.call(this,ctx,effect,helpers);row.object=ctx.g.stack.find(so=>so.card===row.cast&&so.kind==='spell');
    row.remaining=row.cards.filter(entry=>entry.card!==row.cast).map(entry=>({card:entry.card,zone:entry.card.zone,version:entry.card.zoneVersion,bottom:entry.card.owner.library.indexOf(entry.card)}));
    row.afterPool=pool(ctx.you);row.castEvents=state.events.slice(row.events).filter(entry=>entry.event==='cast');
    if(row.object)state.spells.set(row.object,row);return row.cast;
   }finally{controller.decide=decide;}
  };
 }
 return state;
}
export function stagePlayPermission(MTG,context,effect,h){
 if(!actions.has(effect.action))return false;
 install(MTG,context,h);
 if(typeof effect.n==='object')stageCount(MTG,context,effect.n,h);
 if(typeof effect.filter?.threshold==='object')stagePermissionCount(MTG,context,effect.filter.threshold,h);
 if(effect.action==='cast-card-v8'){
  for(const card of [context.oracleProofTargets?.[effect.target]].flat().filter(Boolean)){
   assert.ok(!card.def.oracleImplementation&&card.name.startsWith('Oracle Generic Target '),'targeted cast proof decorates only its synthetic donor');
   const powerBound=card.oracleProofSourceStatTarget;
   card.def={...card.def,oracle:'You gain 3 life.',...(powerBound&&card.mv===0?{cost:'{1}'}:{}),resolve:gain,_immediateCastProof:true};
  }
  return true;
 }
 const owner=effect.who===undefined||effect.who==='you'?context.a:typeof effect.who==='number'?context.oracleProofTargets[effect.who]:context.b;
 const filter=effect.until||effect.filter?.spellFilter||{what:'instant',zone:'graveyard',controller:'you'};
 const card=h.stageGenericTarget(MTG,context,{...filter,controller:owner===context.a?'you':'opponent',zone:'graveyard'},'immediate-cast-donor');
 const cost=effect.cardManaParity?3:typeof effect.until?.threshold==='number'?effect.until.threshold:typeof effect.filter?.threshold==='number'?effect.filter.threshold:effect.filter?.threshold?1:9;
 card.def={...card.def,cost:'{'+cost+'}',oracle:'You gain 3 life.',resolve:gain,_immediateCastProof:true};
 if(card.def.subtypes.includes('Aura'))card.def={...card.def,types:['Enchantment'],oracle:'Enchant creature',power:undefined,toughness:undefined};
 const zone=effect.action==='cast-from-graveyard-v8'?'graveyard':effect.action==='cast-inspected-v8'?'library':'hand';
 if(zone!=='graveyard'){card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone=zone;card.owner[zone].push(card);}
 if(effect.until)for(let i=0;i<2;i++)h.zoneCard(MTG,owner,'Forest','library');
 return true;
}
export function assertPlayPermission(MTG,context,effect,source,label){
 if(!actions.has(effect.action))return false;
 const row=states.get(context.game)?.rows.find(row=>!row.verified&&row.source===source&&same(row.effect,effect));assert.ok(row,label+': actual immediate cast instruction executes');row.verified=true;
 assert.ok(row.cast&&row.object,label+': optional success branch casts an actual spell');
 assert.ok(row.cards.some(entry=>entry.card===row.cast),label+': cast card belongs to the exact authorized cohort');
 assert.equal(row.object.ctrl,row.player);assert.equal(row.object.isCopy||false,false);assert.equal(row.object.castOpts.free,effect.free);
 if(effect.free){assert.equal(row.object.manaSpent,0);assert.equal(row.afterPool,row.pool);}
 else{assert.ok(row.object.manaSpent>=0);assert.equal(row.pool-row.afterPool,row.object.manaSpent,label+': paid permission uses the actual normal mana payment');}
 assert.equal(row.castEvents.filter(entry=>entry.data.card===row.cast&&entry.data.player===row.player).length,1,label+': the spell is cast exactly once');
 if(effect.until){
  assert.equal(row.cards.at(-1)?.card,row.cast,label+': an until permission authorizes only its matching stop card');
  for(const entry of row.remaining){
   if(effect.rest==='bottom-random'){assert.equal(entry.zone,'library');assert.ok(entry.bottom>=0&&entry.bottom<row.remaining.length,label+': every inspected nonhit is returned to the library bottom');}
   else{assert.equal(entry.zone,effect.visibility==='exile'?'exile':'library',label+': every inspected nonhit stays in its specified zone');}
  }
 }
 const query=row.choices.find(entry=>entry.q.type==='chooseCards'&&entry.q.prompt?.startsWith('You may cast one'));
 assert.ok(query);assert.equal(query.q.min,0);assert.equal(query.q.max,1);
 for(const card of query.q.from){
  assert.ok(row.cards.some(entry=>entry.card===card),label+': no card outside the revealed/known cohort is offered');
  assert.equal(card.def.types.includes('Land'),false);
  if(effect.filter?.spellFilter)assert.ok(matchesTarget(card,{...effect.filter.spellFilter,controller:'any'},context,source),label+': offered spell obeys printed type filter');
 }
 assert.equal(MTG.OracleV8PlayPermissions.offers(context.game,row.player).length,0,label+': immediate permission ends with its instruction');
 assert.equal(row.cast.def._immediateCastProof,true,label+': known donor effect is exercised');assert.ok(row.resolution?.removed,label+': cast spell resolves through Stack');
 if(row.cast.def.types.some(type=>['Instant','Sorcery'].includes(type)))assert.equal(row.resolution.after,row.resolution.before+3,label+': actual granted spell gains its printed three life');
 else{
  assert.equal(row.cast.zone,'battlefield',label+': granted permanent spell resolves onto the battlefield');assert.equal(row.cast.ctrl,row.player);
  if(row.cast.def.subtypes.includes('Aura'))assert.ok(row.cast.attachedTo&&context.game.byIid(row.cast.attachedTo)?.zone==='battlefield',label+': Aura resolves attached to its legal target');
 }
 return true;
}
