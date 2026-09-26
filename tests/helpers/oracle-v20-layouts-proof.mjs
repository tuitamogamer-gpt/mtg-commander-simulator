import assert from 'node:assert/strict';
let activeStage=null;
export function installStageProofV20(MTG,game){
 if(!activeStage)return;
 const scope={...activeStage},recalc=game.recalc;
 game.recalc=function(...args){
  for(const card of this.bf())if((card.def.c1719Unflipped||card.def).name===scope.name){
   if(scope.level)card.meta.oracleClassLevelV20={version:card.zoneVersion,value:scope.level};
   if(scope.solved)card.meta.oracleCaseSolvedV20={version:card.zoneVersion,value:true};
   if(scope.charge)card.counters.charge=Math.max(card.counters.charge||0,scope.charge);
   if(scope.doors)card.meta.bdfUnlocked=scope.doors.slice();
   if(scope.flip)card.meta.c1719Flipped=true;
  }
  return recalc.apply(this,args);
 };
}
async function within(scope,run){const previous=activeStage;activeStage=scope;try{return await run();}finally{activeStage=previous;}}
export async function operationProofV20(MTG,entry,operation,role,h){
 if(operation.kind==='mechanic-no-max-hand'&&entry.oracleStagedPartV20==='room'){
  const f=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.assertControllerRole(MTG,f,entry.raw.name);h.fillLibrary(MTG,a,40);h.fillLibrary(MTG,b,40);
  const source=h.permanent(MTG,game,a,entry.raw.name);assert.equal(game.maximumHandSize(a),Infinity);assert.equal(game.maximumHandSize(b),7);while(a.hand.length<12)h.zoneCard(MTG,a,'Forest','hand');game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.ok(a.hand.length>7);await game.move(source,'exile');assert.equal(game.maximumHandSize(a),7);return 4;
 }
 if(operation.kind==='state-trigger-v8'&&operation.trigger.effects?.some(e=>e.action==='flip-permanent-v20')){
  const context=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=context;h.assertControllerRole(MTG,context,entry.raw.name);h.fund(a,100);h.fillLibrary(MTG,a,40);
  if(operation.state.kind==='life')a.life=operation.state.threshold-1;
  const source=h.zoneCard(MTG,a,entry.raw.name,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.def.c1719Unflipped,undefined);
  if(operation.state.kind==='life')await game.gainLife(a,1,source);
  else if(operation.state.kind==='source-quality'){
   const jump=h.zoneCard(MTG,a,'Jump','hand');assert.ok(jump);assert.equal(await game.castSpell(a,jump,{from:'hand',quickTargets:[source]}),true);await game.resolveTop();
  }else assert.fail('Missing flip state driver '+JSON.stringify(operation.state));
  await game.checkSBA();await game.flushTriggers();assert.ok(game.stack.some(row=>row.oracleStateTrigger&&row.srcCard===source));await h.resolveAll(game);assert.ok(source.def.c1719Unflipped);return 6;
 }
 if(operation.kind==='flip-faces-v20'){
  let checks=0;
  const context=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=context;h.assertControllerRole(MTG,context,entry.raw.name);h.fund(a,100);h.fillLibrary(MTG,a,40);
  const source=h.permanent(MTG,game,a,entry.raw.name),mv=source.mv,colors=Array.from(source.colors);source.meta.c1719Flipped=true;game.recalc();assert.equal(source.name,operation.faces[1].raw.name);assert.equal(source.mv,mv);assert.deepEqual(Array.from(source.colors),colors);const count=source.zoneVersion;
  source.meta.c1719Flipped=true;game.recalc();assert.equal(source.name,operation.faces[1].raw.name);assert.equal(source.zoneVersion,count);await game.move(source,'hand');assert.equal(source.name,entry.raw.name);assert.equal(source.def.c1719Unflipped,undefined);checks+=6;
  for(const face of operation.faces){const nested={...entry,...face,raw:{...face.raw,name:entry.raw.name},oracleFlipSideV20:face.key};checks+=await within({name:entry.raw.name,flip:face.key==='back'},async()=>{let n=0;for(const op of face.implementation)n+=await h.operationProof(MTG,nested,op,role);return n;});}
  return checks;
 }
 if(operation.kind==='room-doors-v20'){
  let checks=0;
  for(const door of operation.doors){
   const context=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=context;
   h.assertControllerRole(MTG,context,entry.raw.name);h.fund(a,100);h.fillLibrary(MTG,a,40);
   for(const part of operation.doors)for(const op of part.implementation)for(const [index,target]of(op.targets||[]).entries())h.stageGenericTarget(MTG,context,target,index,op.effects?.find(e=>e.target===index));
   const source=h.zoneCard(MTG,a,entry.raw.name,'hand'),alt=source.def.altCosts.find(row=>row.bdfDoor===door.key);
   const before=Object.values(a.pool).reduce((n,value)=>n+value,0);
   assert.equal(await game.castSpell(a,source,{from:'hand',alt}),true);assert.equal(before-Object.values(a.pool).reduce((n,value)=>n+value,0),MTG.mv(door.cost));await h.resolveAll(game);
   assert.deepEqual(Array.from(source.meta.bdfUnlocked),[door.key]);assert.equal(source.mv,MTG.mv(door.cost));
   const other=operation.doors.find(row=>row!==door),action=game.activatableList(a).find(row=>row.card===source&&row.oracleUnlockRoomV20===other.key);assert.ok(action);
   assert.equal(await game.activateAbility(a,action),true);assert.equal(source.meta.bdfUnlocked.length,2,'unlock takes effect without resolving an activated ability');assert.equal(game.stack.some(row=>row.kind==='ability'&&row.src===source),false);
   await h.resolveAll(game);await game.move(source,'hand');await game.move(source,'battlefield',{ctrl:a});await h.resolveAll(game);assert.deepEqual(Array.from(source.meta.bdfUnlocked),[]);checks+=8;
  }
  const nested={...entry,oracleStagedPartV20:'room',implementation:operation.doors.flatMap(door=>door.implementation.map(op=>op.kind==='generic-trigger'&&op.event==='unlockDoor'?{...op,oracleRoomDoorV20:door.key}:op))};
  checks+=await within({name:entry.raw.name,doors:operation.doors.map(d=>d.key)},async()=>{let n=0;for(const op of nested.implementation)n+=await h.operationProof(MTG,nested,op,role);return n;});return checks;
 }
 if(operation.kind==='station-tiers-v20'){
  const context=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=context;
  h.assertControllerRole(MTG,context,entry.raw.name);h.fund(a,100);h.fillLibrary(MTG,a,40);
  const source=h.permanent(MTG,game,a,entry.raw.name),threshold=operation.tiers.at(-1).min;
  const crew=h.permanent(MTG,game,a,h.fixtureDefinition('Station donor',['Creature'],{power:String(threshold),toughness:'30'}));
  const action=game.activatableList(a).find(row=>row.card===source&&row.ability?.label==='Station');assert.ok(action);assert.equal(action.ability.sorcery,true);assert.equal(source.is('Creature'),false);assert.equal(await game.activateAbility(a,action),true);assert.equal(crew.tapped,true);assert.equal(source.counters.charge||0,0);await h.resolveAll(game);assert.equal(source.counters.charge,threshold);assert.equal(source.is('Creature'),operation.creature);
  for(const kw of operation.tiers.flatMap(tier=>tier.implementedKeywords))assert.equal(source.kw(kw),true);
  game.removeCounters(source,'charge',threshold);assert.equal(source.is('Creature'),false);for(const kw of operation.tiers.flatMap(tier=>tier.implementedKeywords))assert.equal(source.kw(kw),false);
  let checks=10;const nested={...entry,implementation:[...entry.implementation.filter(op=>op!==operation),...operation.tiers.flatMap(tier=>tier.implementation)]};
  for(const tier of operation.tiers)checks+=await within({name:entry.raw.name,charge:tier.min},async()=>{let n=0;for(const op of tier.implementation)n+=await h.operationProof(MTG,nested,op,role);return n;});return checks;
 }
 if(operation.kind==='cast-disturb-v20'){
  const context=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;
  h.assertControllerRole(MTG,context,entry.raw.name);h.fund(a,100);h.fillLibrary(MTG,a,40);h.fillLibrary(MTG,b,40);
  const faces=MTG.DEFS[entry.raw.name].oracleFaces,back=faces.faces[1].def;
  for(const op of back.oracleImplementation)for(const [index,target]of(op.targets||[]).entries())h.stageGenericTarget(MTG,context,target,index,op.effects?.find(e=>e.target===index));
  for(const op of back.oracleImplementation)if(op.kind==='aura-target')h.stageGenericTarget(MTG,context,op.targetV9||{what:op.what,zone:'battlefield',controller:'you',min:1},'disturb-aura');
  const source=h.zoneCard(MTG,a,entry.raw.name,'graveyard'),row=game.castableList(a).find(row=>row.card===source&&row.alt?.bomKind==='disturb');
  assert.ok(row,entry.raw.name+': printed Disturb offered from graveyard');assert.equal(row.alt.altCostStr,operation.cost);
  const before=Object.values(a.pool).reduce((n,value)=>n+value,0);
  assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:row.alt}),true);assert.equal(source.oracleFace,'back');assert.equal(source.zone,'stack');
  const so=game.stack.find(o=>o.card===source);assert.equal(so.oracleDefinition.name,back.name);assert.equal(before-Object.values(a.pool).reduce((n,value)=>n+value,0),MTG.mv(operation.cost));
  await h.resolveAll(game);assert.equal(source.zone,'battlefield');assert.equal(source.oracleFace,'back');
  await game.move(source,'graveyard');await h.resolveAll(game);assert.equal(source.zone,'exile');assert.equal(source.oracleFace,'front');
  assert.equal(game.castableList(a).some(row=>row.card===source&&row.alt?.bomKind==='disturb'),false);return 11;
 }
 if(!['class-levels-v20','case-solved-v20'].includes(operation.kind))return null;
 const context=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=context;
 h.assertControllerRole(MTG,context,entry.raw.name);h.fund(a,100);h.fillLibrary(MTG,a,40);
 const source=h.permanent(MTG,game,a,entry.raw.name);let checks=0;
 if(operation.kind==='class-levels-v20'){
  assert.equal(MTG.OracleV20.classLevel(source),1);checks++;
  for(const stage of operation.levels){
   for(const op of stage.levelTriggers)for(const [i,target]of(op.targets||[]).entries())h.stageGenericTarget(MTG,context,target,i,op.effects?.find(e=>e.target===i));
   h.fund(a,100);const action=game.activatableList(a).find(row=>row.card===source&&row.ability?.label?.startsWith('Level '+stage.level+' '));assert.ok(action,entry.raw.name+': next printed level is offered');
   assert.equal(action.ability.sorcery,true);assert.equal(await game.activateAbility(a,action),true);assert.equal(MTG.OracleV20.classLevel(source),stage.level-1);await h.resolveAll(game);assert.equal(MTG.OracleV20.classLevel(source),stage.level);checks+=5;
  }
  await game.move(source,'hand');await game.move(source,'battlefield',{ctrl:a});await h.resolveAll(game);assert.equal(MTG.OracleV20.classLevel(source),1);checks++;
  const base=entry.implementation.filter(op=>op!==operation),flat=[...base];
  for(const stage of operation.levels)flat.push(...stage.implementation,...stage.levelTriggers.map(op=>({...op,event:'oracleClassLevelV20',classLevelV20:stage.level})));
  const nested={...entry,implementation:flat};
  let cursor=base.length;
  for(const stage of operation.levels){
   const ops=flat.slice(cursor,cursor+stage.implementation.length+stage.levelTriggers.length);cursor+=ops.length;
   checks+=await within({name:entry.raw.name,level:stage.level},async()=>{let n=0;for(const op of ops)n+=await h.operationProof(MTG,nested,op,role);return n;});
  }
 }else{
  h.stageCondition(MTG,context,operation.condition,source);game.recalc();
  if(operation.condition.count?.unique==='colors')for(const color of ['W','U','B','R','G'])h.permanent(MTG,game,a,h.fixtureDefinition('Case color '+color,['Artifact'],{cost:'{'+color+'}'}));
  assert.equal(MTG.OracleV20.caseSolved(source),false);await game.emit('endStep',{player:a});await h.resolveAll(game);assert.equal(MTG.OracleV20.caseSolved(source),true,entry.raw.name+': printed solve condition actually solves');checks+=2;
  await game.move(source,'hand');assert.equal(MTG.OracleV20.caseSolved(source),false);checks++;
  const nested={...entry,implementation:[...entry.implementation.filter(op=>op!==operation),...operation.implementation]};
  checks+=await within({name:entry.raw.name,solved:true},async()=>{let n=0;for(const op of operation.implementation)n+=await h.operationProof(MTG,nested,op,role);return n;});
 }
 return checks;
}

export function assertLayoutEffectV20(MTG,context,entry,effect,source){
 if(effect.action==='return-transformed-v20'){assert.equal(source.zone,'battlefield');assert.equal(source.oracleFace,'back');assert.equal(source.ctrl,effect.controller==='you'?context.a:source.owner);assert.equal(source.counters.lore||0,source.hasSub('Saga')?1:0);return true;}
 if(effect.action!=='flip-permanent-v20')return false;
 assert.equal(source.meta.c1719Flipped,true);assert.equal(source.zone,'battlefield');assert.ok(source.def.c1719Unflipped);return true;
}
