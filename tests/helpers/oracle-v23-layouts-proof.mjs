import assert from 'node:assert/strict';
import {fundSnow} from './oracle-snow-proof.mjs';
const worlds=new WeakMap(),wrapped=new WeakSet();
const owned=e=>['self-resuspend-v23','time-counter-v23','prevent-attack-player-v23','library-dual-select-v23','library-followup-v23'].includes(e.action);
let branch=null;
export function installLayoutsProofV23(M,game){worlds.set(game,{rows:[],branch,controllers:new WeakSet()});}
function instrument(M,f,h){
 let world=worlds.get(f.game);if(!world){installLayoutsProofV23(M,f.game);world=worlds.get(f.game);}world.h=h;world.f=f;
 for(const p of f.game.players)if(!world.controllers.has(p.controller)){world.controllers.add(p.controller);const prior=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>{const answer=await prior(g,q);if(q.prompt==='Choose inspected creature card')return world.branch?.dual==='land'||world.branch?.dual==='none'?[]:q.from.slice(0,1);if(q.prompt==='Choose inspected land card')return world.branch?.dual==='creature'||world.branch?.dual==='none'&&!q.min?[]:q.from.slice(0,1);if(q.prompt==='Choose inspected card for its follow-up')return world.branch?.library==='decline'?[]:q.from.slice(0,1);if(q.prompt==='Repeat the inspected card process?')return (world.repeats=(world.repeats||0)+1)<(world.branch?.repeat||1)?'yes':'no';return answer;};}
 for(const handler of M.OracleV20.handlers)if(handler.layoutsV23&&!wrapped.has(handler)){wrapped.add(handler);const prior=handler.effect;handler.effect=async function(ctx,e,...rest){const w=worlds.get(ctx.g);if(!w||!owned(e))return prior.call(this,ctx,e,...rest);const row={effect:e,ctx:{...ctx},sourceVersion:ctx.src.zoneVersion,sourceZone:ctx.src.zone,library:ctx.you.library.slice(),states:new Map(ctx.g.bf().concat(...ctx.g.players.flatMap(p=>p.exile)).map(card=>[card,{zone:card.zone,version:card.zoneVersion,time:card.counters.time||0}])),choices:[],moves:[],nested:[]};w.rows.push(row);const move=ctx.g.move,decide=ctx.you.controller.decide.bind(ctx.you.controller),run=M.OracleV20.helpers.runGenericEffects;ctx.g.move=async function(card,dest,...args){const version=card.zoneVersion;const result=await move.call(this,card,dest,...args);row.moves.push({card,destination:dest,version,after:card.zoneVersion,zone:card.zone});return result;};ctx.you.controller.decide=async(g,q)=>{const result=await decide(g,q);row.choices.push({query:q,result});return result;};if(e.action==='library-followup-v23')M.OracleV20.helpers.runGenericEffects=async function(next,effects,...args){if(next.inspectedStatsV23){const before=w.h.genericProofSnapshot(w.f,[next.src,...next.g.bf(),...next.g.players.flatMap(p=>['library','hand','graveyard','exile'].flatMap(z=>p[z]))]);before.oracleX=next.x||0;row.nested.push({ctx:next,effects,before});}return run.call(this,next,effects,...args);};try{const result=await prior.call(this,ctx,e,...rest);row.afterSource={zone:ctx.src.zone,version:ctx.src.zoneVersion,time:ctx.src.counters.time||0,suspended:ctx.src.meta.suspended,inExile:ctx.src.owner.exile.includes(ctx.src)};return result;}finally{ctx.g.move=move;ctx.you.controller.decide=decide;M.OracleV20.helpers.runGenericEffects=run;}};}
 return world;
}
export function stageLayoutsCardV23(){return [];}
export function stageLayoutsEffectV23(M,f,e,h){
 if(!owned(e))return false;instrument(M,f,h);
 if(e.action==='time-counter-v23')for(const card of [h.stagedTargets?.[e.target]].flat().filter(Boolean)){card.counters.time=3;if(card.zone==='exile'){card.meta.suspended=3;card.def={...card.def,suspend:card.def.suspend||{cost:'{U}',n:3}};}}
 if(e.action==='prevent-attack-player-v23')f.layoutsV23Attacker=h.permanent(M,f.game,f.b,'Grizzly Bears');
 if(e.action==='library-dual-select-v23')for(const [index,filter]of e.filters.entries()){const card=h.stageGenericTarget(M,f,{...filter,zone:'graveyard',controller:'you'},'V23 inspected witness '+index);card.owner[card.zone].splice(card.owner[card.zone].indexOf(card),1);card.zone='library';f.a.library.push(card);}
 if(e.action==='library-followup-v23'){
  const world=worlds.get(f.game);if(['miss','empty'].includes(world.branch?.library)){for(const c of f.a.library.splice(0)){c.zone='graveyard';f.a.graveyard.push(c);}if(world.branch.library==='miss')for(let i=0;i<3;i++)h.zoneCard(M,f.a,'Forest','library');}
  else for(let i=0;i<(e.repeat?3:1);i++)h.zoneCard(M,f.a,h.fixtureDefinition('V23 inspected cost '+i,['Creature'],{cost:'{'+(i+2)+'}',power:'2',toughness:'30'}),'library');return true;
 }return true;
}
export async function assertLayoutsEffectV23(M,f,entry,e,source,targets,damaged,before,trace,label,h){
 if(!owned(e))return false;const rows=worlds.get(f.game)?.rows.filter(row=>JSON.stringify(row.effect)===JSON.stringify(e));assert.ok(rows?.length,label+': actual instruction executed');
 for(const row of rows){
  if(e.action==='self-resuspend-v23'){assert.equal(row.afterSource.zone,'exile',label+': actual physical spell exiled on resolution');assert.equal(row.afterSource.version,row.sourceVersion+1);assert.equal(row.afterSource.time,e.n);assert.equal(row.afterSource.suspended,e.n);assert.equal(row.afterSource.inExile,true);}
  if(e.action==='time-counter-v23')for(const card of [targets[e.target]].flat().filter(Boolean)){const old=row.states.get(card);assert.ok(old);assert.equal(card.counters.time||0,e.remove?Math.max(0,old.time-e.n):old.time+e.n);}
  if(e.action==='prevent-attack-player-v23'){assert.equal(f.game.canAttackTarget(f.layoutsV23Attacker,f.a),false);await f.game.runBeginningPhase(f.a);await h.resolveAll(f.game);assert.equal(f.game.canAttackTarget(f.layoutsV23Attacker,f.a),true);}
  if(e.action==='library-dual-select-v23'){
   const n=M.OracleV20.helpers.genericAmount(e.n,row.ctx),cohort=n?row.library.slice(-n).reverse():[],selected=row.choices.filter(d=>/^Choose inspected (creature|land) card$/.test(d.query.prompt||'')).flatMap(d=>d.result),choice=row.choices.find(d=>d.query.prompt==='Choose the destination of all chosen cards')?.result||'hand';assert.equal(new Set(selected).size,selected.length);assert.ok(selected.every(c=>cohort.includes(c)));
   for(const c of selected){assert.equal(c.zone,choice);assert.ok(row.moves.some(m=>m.card===c&&m.destination===choice&&m.after===m.version+1));}
   const remaining=cohort.filter(c=>!selected.includes(c));if(e.rest==='graveyard')assert.ok(remaining.every(c=>c.zone==='graveyard'));else{assert.ok(remaining.every(c=>c.zone==='library'));assert.ok(remaining.every(c=>f.a.library.slice(0,remaining.length).includes(c)));}assert.equal(f.a.library.length,row.library.length-(e.rest==='graveyard'?cohort.length:selected.length));
  }
  if(e.action==='library-followup-v23'){
   const replacements=(node,stats)=>node?.kind==='inspected-stat-v23'?Math.max(0,Number(stats[node.stat])||0):node?.kind==='signed'?node.sign*replacements(node.value,stats):Array.isArray(node)?node.map(child=>replacements(child,stats)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,replacements(value,stats)])):node;
   for(const nested of row.nested)for(const child of nested.effects)await h.assertGenericEffectEvidence(M,f,entry,replacements(child,nested.ctx.inspectedStatsV23),source,nested.ctx.targets||targets,damaged,nested.before,trace,label+'/inspected-followup');
   if(worlds.get(f.game).branch?.library==='miss'||worlds.get(f.game).branch?.library==='empty'||worlds.get(f.game).branch?.library==='decline')assert.equal(row.nested.length,0);else assert.ok(row.nested.length,label+': inspected card value actually used');
   if(e.repeat)assert.equal(row.nested.length,worlds.get(f.game).branch?.repeat||1,label+': actual repeat branches');
   const selected=row.choices.filter(choice=>choice.query.prompt==='Choose inspected card for its follow-up').flatMap(choice=>choice.result);
   if(!e.until)for(const card of selected)assert.ok(row.moves.some(move=>move.card===card&&move.destination===e.selectedDestination&&move.after===move.version+1),label+': chosen physical card moved to exact destination');
   if(e.rest==='graveyard')assert.ok(row.library.slice(-Math.min(row.library.length,Number(e.n)||1)).every(card=>card.zone==='hand'||card.zone==='graveyard'));
  }
 }return true;
}
function nodes(value){if(!value||typeof value!=='object')return [];return [value,...Object.values(value).flatMap(child=>Array.isArray(child)?child.flatMap(nodes):nodes(child))];}
async function within(value,run){const old=branch;branch=value;try{return await run();}finally{branch=old;}}
export async function operationProofV23(M,entry,op,role,h){
 if(op.kind==='mechanic-suspend'&&op.optionalV23){let checks=0;for(const cast of [true,false]){const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.assertControllerRole(M,f,entry.raw.name);h.fillLibrary(M,a,40);h.fillLibrary(M,b,40);h.fund(a,100);game.priorityRound=async()=>{};
   for(const body of nodes(entry.implementation).filter(node=>node.targets))for(const [index,target]of body.targets.entries())if(target.zone!=='stack')h.stageGenericTarget(M,f,target,index,body.effects?.find(e=>e.target===index));
   const card=h.zoneCard(M,a,entry.raw.name,'hand'),prior=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>{const answer=await prior(g,q);return q.prompt?.startsWith('Suspend: cast ')?cast?'yes':'no':answer;};const mana=Object.values(a.pool).reduce((n,x)=>n+x,0),action=game.activatableList(a).find(row=>row.card===card&&row.suspend);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(mana-Object.values(a.pool).reduce((n,x)=>n+x,0),M.mv(op.cost));assert.equal(card.zone,'exile');assert.equal(card.counters.time,op.n);assert.equal(game.stack.length,0);const version=card.zoneVersion;
   for(let remaining=op.n;remaining>0;remaining--){await game.runBeginningPhase(a);assert.ok(game.stack.some(so=>so.name?.includes('remove a time counter')||so.desc?.includes('remove a time counter')),entry.raw.name+': separately respondable upkeep trigger');await h.resolveAll(game);if(remaining>1){assert.equal(card.zone,'exile');assert.equal(card.zoneVersion,version);assert.equal(card.counters.time,remaining-1);}}
   if(cast){assert.ok(a.turnState.spellsCastList.some(row=>row.card===card),entry.raw.name+': actual free suspend cast');assert.equal(card.zone,card.is('Instant')||card.is('Sorcery')?nodes(entry.implementation).some(e=>e.action==='self-resuspend-v23')?'exile':'graveyard':'battlefield');}else{assert.equal(card.zone,'exile');assert.equal(card.zoneVersion,version);assert.equal(card.counters.time||0,0);assert.equal(a.turnState.spellsCastList.some(row=>row.card===card),false);}checks+=7;
  }return checks;}
 if(op.kind==='mechanic-cumulative-upkeep'&&op.cost==='{S}'){
  let checks=0;
  for(const snow of [true,false]){
   const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;
   h.assertControllerRole(M,f,entry.raw.name);
   const host=h.permanent(M,game,a,'Grizzly Bears'),source=h.permanent(M,game,a,entry.raw.name);
   game.attach(source,host);h.fillLibrary(M,a,40);h.fillLibrary(M,b,40);h.fund(a,100);
   if(snow)await fundSnow(M,game,a,entry);
   const events=[],emit=game.emit;
   game.emit=function(name,data){if(name==='countersPlaced'&&data.card===source&&data.kind==='age')events.push({before:data.before,after:data.after,n:data.n});return emit.call(this,name,data);};
   const before=Object.values(a.pool).reduce((n,x)=>n+x,0);
   await game.emit('upkeep',{player:a});await h.resolveAll(game);
   assert.deepEqual(events,[{before:0,after:1,n:1}],entry.raw.name+': age counter added before pay or sacrifice');
   assert.equal(source.zone,snow?'battlefield':'graveyard');
   if(snow){assert.equal(source.counters.age,1);assert.equal(before-Object.values(a.pool).reduce((n,x)=>n+x,0),1);await game.emit('upkeep',{player:a});await h.resolveAll(game);assert.equal(source.counters.age,2);assert.equal(before-Object.values(a.pool).reduce((n,x)=>n+x,0),3);assert.deepEqual(events.at(-1),{before:1,after:2,n:1});}
   else assert.equal(before-Object.values(a.pool).reduce((n,x)=>n+x,0),0,entry.raw.name+': ordinary floating mana cannot pay a snow cost');
   checks+=5;
  }
  return checks;
 }
 if(op.kind==='generic-ability'&&op.cost?.oracleSacrificeGroupsV23){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=f;
  h.assertControllerRole(M,f,entry.raw.name);h.fund(a,100);h.fillLibrary(M,a,30);
  const source=h.permanent(M,game,a,entry.raw.name),cards=op.cost.oracleSacrificeGroupsV23.map((filter,index)=>h.stageGenericTarget(M,f,filter,'v23-color-donor-'+index)),missing=cards.pop();
  await game.move(missing,'exile');assert.equal(game.activatableList(a).some(row=>row.card===source&&row.ability?.oracleSacrificeGroupsV23),false,entry.raw.name+': incomplete qualified cost is not offered');
  await game.move(missing,'battlefield',{ctrl:a});cards.push(missing);
  const search=op.effects.find(effect=>effect.action==='search-library'),named=h.zoneCard(M,a,h.fixtureDefinition(search.name,['Creature'],{cost:'{8}',power:'8',toughness:'8'}),'library');
  const prior=a.controller.decide.bind(a.controller),queries=[];
  a.controller.decide=async(g,q)=>{const answer=await prior(g,q);queries.push(q);return q.search&&q.from.includes(named)?[named]:answer;};
  const events=[],emit=game.emit;
  game.emit=function(name,data){if(name==='becameTapped'&&data.card===source)events.push({version:source.zoneVersion,zone:source.zone});return emit.call(this,name,data);};
  const action=game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleSacrificeGroupsV23);assert.ok(action);
  const before=game.bf().slice(),version=source.zoneVersion,mana=Object.values(a.pool).reduce((n,x)=>n+x,0);
  assert.equal(await game.activateAbility(a,action),true);assert.equal(mana-Object.values(a.pool).reduce((n,x)=>n+x,0),M.mv(op.cost.mana));
  assert.deepEqual(events,[{version,zone:'battlefield'}],entry.raw.name+': source tapped before any sacrifice zone change');
  const sacrificed=before.filter(card=>card.zone==='graveyard');assert.equal(sacrificed.length,3);assert.equal(new Set(sacrificed).size,3);
  const matching=filters=>{const visit=(index,picked)=>index===filters.length?true:sacrificed.some(card=>!picked.includes(card)&&M.OracleV20.helpers.genericTargetSpec(filters[index],[],0).filter(game,card,a,source)&&visit(index+1,picked.concat(card)));return visit(0,[]);};assert.ok(matching(op.cost.oracleSacrificeGroupsV23));
  const namedVersion=named.zoneVersion;await h.resolveAll(game);
  assert.equal(named.zone,'battlefield');assert.equal(named.zoneVersion,namedVersion+1);assert.equal(named.ctrl,a);assert.equal(named.tapped,false);assert.ok(queries.some(q=>q.search&&q.from.includes(named)));assert.equal(a.library.includes(named),false);
  return 12;
 }
 if(['spell-generic','generic-trigger','generic-ability'].includes(op.kind)&&nodes(op).some(e=>e.action==='library-dual-select-v23')&&!branch?.dual){let checks=0;for(const dual of ['none','creature','land','both'])checks+=await within({dual},()=>h.genericRuntimeOperationProof(M,entry,op,role));return checks;}
 if(['spell-generic','generic-trigger','generic-ability'].includes(op.kind)&&nodes(op).some(e=>e.action==='library-followup-v23')&&!branch?.library){let checks=0;const e=nodes(op).find(e=>e.action==='library-followup-v23');for(const library of ['hit',...(e.optionalSelection?['decline']:[]),...(e.until?['miss','empty']:[])])for(const repeat of e.repeat?[1,2,3]:[1])checks+=await within({library,repeat},()=>h.genericRuntimeOperationProof(M,entry,op,role));return checks;}
 return null;
}
