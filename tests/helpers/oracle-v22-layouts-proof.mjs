import assert from 'node:assert/strict';
import {stageCount} from './oracle-v5-proof.mjs';

const worlds=new WeakMap(),wrapped=new WeakSet(),flat=x=>[x].flat().filter(Boolean);
let activeBranch=null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const owned=e=>['reveal-until-v22','exile-permission-v22','exile-cast-batch-v22','exile-selected-permission-v22','inspect-exile-v22','next-cast-entry-counter-v22'].includes(e.action)||e.action==='install-trigger-v8'&&e.layoutsV22;
const state=c=>({zone:c.zone,version:c.zoneVersion,ctrl:c.ctrl,tapped:c.tapped,counters:{...c.counters},permission:c.meta.oracleExilePermissionV22});
export function installLayoutsProofV22(M,game){worlds.set(game,{branch:activeBranch,batchChoices:0,rows:[],decisions:[],controllers:new WeakSet()});}
function install(M,f,h){
 let world=worlds.get(f.game);if(!world){installLayoutsProofV22(M,f.game);world=worlds.get(f.game);}world.f=f;world.h=h;
 for(const p of f.game.players)if(!world.controllers.has(p.controller)){
  world.controllers.add(p.controller);const prior=p.controller.decide.bind(p.controller);
  p.controller.decide=async(g,q)=>{let result=await prior(g,q);if(q.prompt==='You may exile a card from these cards')result=world.branch?.inspect==='decline'?[]:q.from.slice(0,q.max);if(q.prompt==='Choose one exiled card you may play')result=q.from.slice(0,1);if(world.branch?.batch!==undefined&&q.prompt?.startsWith('You may cast one of these cards'))result=world.batchChoices++>=world.branch.batch?[]:q.from.slice(0,1);world.decisions.push({player:p,query:q,result});return result;};
 }
 for(const handler of M.OracleV20.handlers)if(handler.layoutsV22&&!wrapped.has(handler)){
  wrapped.add(handler);const prior=handler.effect;
  handler.effect=async function(ctx,e,...rest){const w=worlds.get(ctx.g);if(!w||!owned(e))return prior.call(this,ctx,e,...rest);
   const row={effect:e,ctx:{...ctx},executions:[],delayed:ctx.g.delayed.slice(),decisionStart:w.decisions.length};w.rows.push(row);
   if(['reveal-until-v22','inspect-exile-v22','exile-permission-v22','exile-cast-batch-v22','exile-selected-permission-v22'].includes(e.action)){
    row.owners=e.who==='each-player'?ctx.g.players:e.who==='each-opponent'?ctx.g.players.filter(p=>p!==ctx.you):e.action==='exile-permission-v22'?M.OracleV20.helpers.genericEffectSubjects(ctx,e.who):[ctx.you];row.owner=row.owners[0];
    row.library=row.owners.flatMap(p=>p.library.slice());const n=e.action==='reveal-until-v22'?row.library.length:M.OracleV20.helpers.genericAmount(e.n,ctx);
    row.cards=n>0?row.owners.flatMap(p=>p.library.slice(-n).reverse()):[];row.versions=new Map(row.cards.map(c=>[c,c.zoneVersion]));
    if(e.action==='reveal-until-v22'){const spec=M.OracleV20.helpers.genericTargetSpec({...e.filter,zone:'library',controller:'any'},[],0,ctx.data),index=row.cards.findIndex(c=>spec.filter(ctx.g,c,ctx.you,ctx.src));row.chosen=index<0?null:row.cards[index];if(index>=0)row.cards=row.cards.slice(0,index+1);}
   }
   row.casts=[];const emit=ctx.g.emit;if(e.action==='exile-cast-batch-v22')ctx.g.emit=async function(name,data,...args){if(name==='cast'&&row.cards.includes(data.card))row.casts.push(data.so);return emit.call(this,name,data,...args);};let result;try{result=await prior.call(this,ctx,e,...rest);}finally{if(e.action==='exile-cast-batch-v22')ctx.g.emit=emit;}
   row.decisions=w.decisions.slice(row.decisionStart);row.after=new Map((row.cards||[]).map(c=>[c,state(c)]));
   if(e.action==='install-trigger-v8'){
    row.added=ctx.g.delayed.filter(d=>!row.delayed.includes(d));for(const delayed of row.added){const run=delayed.run;delayed.run=async next=>{const cards=[next.src,...next.g.bf(),...next.g.players.flatMap(p=>['library','hand','graveyard','exile'].flatMap(z=>p[z]))],before=w.h.genericProofSnapshot(w.f,cards);before.oracleX=next.x||0;const execution={ctx:{...next},before};row.executions.push(execution);const answer=await run(next);execution.after=w.h.genericProofSnapshot(w.f,cards);return answer;};}
   }
   return result;
  };
 }
 return world;
}
function libraryCard(M,f,filter,label,h,owner=f.a){const qualified=filter.alternatives?.[0]||filter.spellFilter?.alternatives?.[0]||filter.spellFilter||filter,c=h.stageGenericTarget(M,f,{...filter,...qualified,what:qualified.what==='permanent'?'card':qualified.what||'card',zone:'graveyard',controller:'you'},label);c.owner[c.zone].splice(c.owner[c.zone].indexOf(c),1);c.owner=owner;c.ctrl=owner;c.zone='library';owner.library.push(c);return c;}
function nonmatch(M,f,filter,label,h,owner=f.a){const spec=M.OracleV20.helpers.genericTargetSpec({...filter,zone:'library',controller:'any'},[],0),types=['Land','Creature','Artifact','Enchantment','Instant','Sorcery'];for(const type of types){const def=h.fixtureDefinition(label,[type],{cost:'{0}',power:'1',toughness:'20'}),c=h.zoneCard(M,owner,def,'library');if(!spec.filter(f.game,c,f.a,f.source))return c;owner.library.pop();c.zone='graveyard';owner.graveyard.push(c);}assert.fail('No nonmatching library fixture for '+JSON.stringify(filter));}
export function stageLayoutsCardV22(M,f,entry,h){if((entry.implementation||[]).some(op=>op.afterEffects?.some(owned)))install(M,f,h);return [];}
export function stageLayoutsEffectV22(M,f,e,h){
 if(!owned(e))return false;const w=install(M,f,h);
 if(e.action==='next-cast-entry-counter-v22')return true;
 if(e.action==='install-trigger-v8'){
  for(const [i,t]of(e.trigger.targets||[]).entries())if(t.zone!=='stack')h.stageGenericTarget(M,f,t,'v22-delayed-'+i);
  for(const child of e.trigger.effects)h.stageEffect(child);return true;
 }
 if(typeof e.n==='object'&&!JSON.stringify(e.n).includes('event-'))stageCount(M,f,e.n,h);
 const owners=e.who==='each-player'?f.game.players:e.who==='each-opponent'?f.game.players.filter(p=>p!==f.a):[e.action==='exile-permission-v22'?e.who==='you'?f.a:typeof e.who==='number'?flat(h.stagedTargets[e.who])[0]:f.b:f.a],owner=owners[0];
 if(['exile-permission-v22','exile-selected-permission-v22','exile-cast-batch-v22'].includes(e.action)){
  for(const player of owners)for(let i=0;i<(e.action==='exile-cast-batch-v22'?Math.min(6,Number(e.n)||3):3);i++)if(e.filter){const card=libraryCard(M,f,e.filter,'V22 permission witness '+i,h,player);if(e.action==='exile-cast-batch-v22'&&i===5)card.def={...card.def,cost:'{9}'};}else h.zoneCard(M,player,i%2?'Forest':'Opt','library');return true;
 }
 if(e.action==='reveal-until-v22'&&w.branch?.reveal==='miss'){
  for(const c of owner.library.splice(0)){c.zone='graveyard';owner.graveyard.push(c);}for(let i=0;i<3;i++)nonmatch(M,f,e.filter,'V22 reveal miss '+i,h,owner);return true;
 }
 libraryCard(M,f,e.filter,'V22 selected library witness',h,owner);nonmatch(M,f,e.filter,'V22 rejected library witness',h,owner);return true;
}
async function future(M,f,entry,row,e,source,trace,label,h){
 const {game,a}=f;assert.equal(row.added.length,[].concat(e.trigger.event).length,label+': all printed temporary events installed');
 for(const delayed of row.added){assert.equal(delayed.ctrl,row.ctx.you);assert.equal(delayed.once,e.once);assert.equal(delayed.oracleTemporaryRecordV22.expires,e.duration==='eot'?'eot':'untilTurnOf');}
 h.fund(a,100);for(const delayed of row.added){await h.fireGenericEvent(M,f,source,{...e.trigger,event:delayed.on});await game.flushTriggers();assert.ok(game.stack.some(so=>so.kind==='trigger'&&so.run===delayed.run),label+': later actual event creates a Stack trigger');await h.resolveAll(game);}
 assert.ok(row.executions.length,label+': installed temporary rule actually resolves');
 for(const execution of row.executions){const ctx=execution.ctx,capture=ctx.oracleSourceCapture||{};f.eventCard=capture.eventCard||ctx.data.card;f.eventPlayer=capture.eventPlayer||ctx.data.player;f.eventController=capture.eventController||f.eventCard?.ctrl;f.eventAmount=capture.eventAmount??ctx.data.n;f.eventStackV10=capture.eventStackV10;for(const child of e.trigger.effects)await h.assertGenericEffectEvidence(M,f,entry,child,source,ctx.targets||[],f.eventPlayer,execution.before,trace,label+'/future');}
 for(const delayed of row.added)assert.equal(game.delayed.includes(delayed),!e.once,label+': printed once/repeat lifetime');
 if(e.duration==='next-turn'){const n=row.executions.length;await game.runBeginningPhase(row.ctx.you);await h.resolveAll(game);h.fund(a,100);await h.fireGenericEvent(M,f,source,e.trigger);await h.resolveAll(game);assert.equal(row.executions.length,n,label+': no event after next-turn expiry');}
}
export async function assertLayoutsEffectV22(M,f,entry,e,source,targets,damaged,before,trace,label,h){
 if(!owned(e))return false;install(M,f,h);const rows=worlds.get(f.game)?.rows.filter(r=>same(r.effect,e));assert.ok(rows?.length,label+': actual v22 instruction executed');
 for(const row of rows){
  if(e.action==='install-trigger-v8'){await future(M,f,entry,row,e,source,trace,label,h);continue;}
  if(e.action==='next-cast-entry-counter-v22'){const card=row.ctx.data.card;assert.ok(card,label+': actual cast object');assert.equal(card.zone,'battlefield');assert.ok((card.counters[e.counter]||0)>=e.n,label+': additional entry counter survives Stack resolution');continue;}
  if(e.action==='reveal-until-v22'){
   if(row.chosen){assert.equal(row.after.get(row.chosen).zone,e.destination);assert.equal(row.after.get(row.chosen).version,row.versions.get(row.chosen)+1);if(e.destination==='battlefield'){assert.equal(row.after.get(row.chosen).ctrl,row.ctx.you);assert.equal(row.after.get(row.chosen).tapped,e.tapped);}}
   const rest=row.cards.filter(c=>c!==row.chosen);for(const c of rest)assert.equal(row.after.get(c).zone,e.rest==='graveyard'?'graveyard':'library');if(e.rest.startsWith('bottom'))assert.ok(rest.every(c=>row.owner.library.slice(0,rest.length).includes(c)),label+': exact revealed remainder reaches the library bottom');if(!row.chosen)assert.equal(row.cards.length,row.library.length,label+': absent qualifying card processes the entire library');continue;
  }
  if(e.action==='exile-cast-batch-v22'){
   const cast=row.casts.map(so=>so.card),left=row.cards.filter(c=>!cast.includes(c)),offered=row.decisions.find(d=>d.query.prompt?.startsWith('You may cast one of these cards'))?.query.from||[];assert.ok(cast.length<=(e.max??row.cards.length));const stop=worlds.get(f.game).branch?.batch;if(stop===0)assert.equal(cast.length,0);else {assert.ok(offered.length,label+': staged qualifying spell is actually offered');assert.equal(cast.length,Math.min(stop??Infinity,e.max??row.cards.length,offered.length));}
   for(const so of row.casts){assert.equal(so.castOpts.free,true);assert.ok(M.OracleV20.helpers.genericTargetSpec(e.filter,[],0).filter(f.game,so,row.ctx.you,row.ctx.src),label+': every actual announced spell satisfies printed quality and mana value');assert.equal(so.castOpts.oracleImmediateCast>0,true);}
   for(const c of left){assert.equal(row.after.get(c).zone,'library');assert.equal(c.owner.library.slice(0,left.filter(x=>x.owner===c.owner).length).includes(c),true,label+': every uncast exiled card reaches bottom');}continue;
  }
  const selected=e.action==='inspect-exile-v22'?flat(row.decisions.find(d=>d.query.prompt==='You may exile a card from these cards')?.result):e.action==='exile-selected-permission-v22'?flat(row.decisions.find(d=>d.query.prompt==='Choose one exiled card you may play')?.result):row.cards;
  if(e.action==='inspect-exile-v22'){
   assert.equal(selected.length,worlds.get(f.game).branch?.inspect==='decline'?0:Math.min(e.max,row.cards.filter(c=>M.OracleV20.helpers.genericTargetSpec({...e.filter,zone:'library',controller:'any'},[],0).filter(f.game,Object.assign(Object.create(c),{zone:'library'}),row.ctx.you,row.ctx.src)).length));
   for(const c of row.cards.filter(c=>!selected.includes(c)))assert.equal(row.after.get(c).zone,e.rest==='hand'?'hand':'library',label+': unchosen inspected card follows printed fate');
  }
  for(const c of selected){const after=row.after.get(c);if(e.duration==='immediate'){assert.ok(['exile','stack','battlefield'].includes(after.zone));continue;}assert.equal(after.zone,'exile',label+': exact library object exiled');assert.equal(after.version,row.versions.get(c)+1);assert.equal(after.permission.record.player,row.ctx.you);assert.equal(after.permission.record.max,e.action==='exile-selected-permission-v22'?null:e.max??null);assert.equal(after.permission.record.free,!!e.free);assert.equal(f.game.hasExilePlayPermission(f.game.players.find(p=>p!==row.ctx.you),c),false);}
  if(e.action==='exile-selected-permission-v22')for(const c of row.cards.filter(c=>!selected.includes(c))){assert.equal(row.after.get(c).zone,'exile');assert.equal(row.after.get(c).permission,undefined);}
  if(e.duration==='only-next-turn'&&selected.length){for(const c of selected)assert.equal(f.game.hasExilePlayPermission(row.ctx.you,c),false);row.ctx.you.turnsStarted++;f.game.turnPlayer=row.ctx.you;for(const c of selected)assert.equal(f.game.hasExilePlayPermission(row.ctx.you,c),true);f.game.turnPlayer=f.game.players.find(p=>p!==row.ctx.you);for(const c of selected)assert.equal(f.game.hasExilePlayPermission(row.ctx.you,c),false);}
  if(e.duration==='next-end-step'&&selected.length){const wrong=f.game.players.find(p=>p!==row.ctx.you);await f.game.emit('endStep',{player:wrong});for(const c of selected)assert.equal(f.game.hasExilePlayPermission(row.ctx.you,c),true);await f.game.emit('endStep',{player:row.ctx.you});for(const c of selected)assert.equal(f.game.hasExilePlayPermission(row.ctx.you,c),false,label+': expiry precedes own end-step priority');}
 }
 return true;
}
async function within(branch,run){const previous=activeBranch;activeBranch={...previous,...branch};try{return await run();}finally{activeBranch=previous;}}
function nodes(node){return !node||typeof node!=='object'?[]:[node,...Object.values(node).flatMap(value=>Array.isArray(value)?value.flatMap(nodes):nodes(value))];}
export async function operationProofV22(M,entry,op,role,h){
 if(['converted-casting-v22','converted-physical-v22'].includes(op.kind)){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.assertControllerRole(M,f,entry.raw.name);h.fillLibrary(M,a,40);h.fillLibrary(M,b,40);h.fund(a,100);const c=h.zoneCard(M,a,entry.raw.name,'hand'),front=c.oracleFaces.faces[0].def,cost=front.oracleConvertedCastingV22,initial=Object.values(a.pool).reduce((n,x)=>n+x,0);
  assert.equal(await game.castSpell(a,c,{from:'hand',alt:{oracleFace:'back',oracleConvertedV22:true,altCostStr:cost}}),true);assert.equal(initial-Object.values(a.pool).reduce((n,x)=>n+x,0),M.mv(cost));assert.equal(c.oracleFace,'back');await h.resolveAll(game);assert.equal(c.zone,'battlefield');assert.equal(c.mv,M.mv(front.cost));await game.move(c,'hand');assert.equal(c.oracleFace,'front');assert.equal(await game.castSpell(a,c,{from:'hand',alt:{oracleFace:'back',oracleConvertedV22:true,altCostStr:'{0}'}}),false);return 7;
 }
 if(op.kind==='living-metal-v22'){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.assertControllerRole(M,f,entry.raw.name);const c=h.permanent(M,game,a,entry.raw.name);M.OracleV8Faces.setFace(c,'back');game.turnPlayer=a;game.recalc();assert.equal(c.is('Creature'),true);game.turnPlayer=b;game.recalc();assert.equal(c.is('Creature'),false);game.turnPlayer=a;game.recalc();assert.equal(c.is('Creature'),true);M.OracleV8AbilityLoss.add(game,[c],{});assert.equal(c.is('Creature'),false);return 4;
 }
 if(!['spell-generic','generic-ability','generic-trigger','spell-modal-generic'].includes(op.kind))return null;
 const effects=nodes(op);
 if(effects.some(e=>e.action==='exile-cast-batch-v22')&&activeBranch?.batch===undefined){let n=0;const limit=Math.max(...effects.filter(e=>e.action==='exile-cast-batch-v22').map(e=>Number(e.max??e.n)||3));for(let batch=0;batch<=limit;batch++)n+=await within({batch},()=>h.genericRuntimeOperationProof(M,entry,op,role));return n;}
 if(effects.some(e=>e.action==='inspect-exile-v22')&&!activeBranch?.inspect){let n=0;for(const inspect of ['accept','decline'])n+=await within({inspect},()=>h.genericRuntimeOperationProof(M,entry,op,role));return n;}
 if(effects.some(e=>e.action==='reveal-until-v22')&&!activeBranch?.reveal){let n=0;for(const reveal of ['hit','miss'])n+=await within({reveal},()=>h.genericRuntimeOperationProof(M,entry,op,role));return n;}
 return null;
}
