import assert from 'node:assert/strict';
const states=new WeakMap(),installed=new WeakSet();
const contains=node=>!!node&&typeof node==='object'&&(['copy-stack-v8','delay-stack-copy-v8'].includes(node.action)||Object.values(node).some(value=>Array.isArray(value)?value.some(contains):contains(value)));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const gain=async ctx=>ctx.g.gainLife(ctx.you,3,ctx.src);
const pool=player=>Object.values(player.pool).reduce((sum,n)=>sum+Number(n||0),0);
const world=game=>JSON.stringify({players:game.players.map(p=>[p.life,p.library.map(c=>c.iid),p.hand.length,p.graveyard.length,p.exile.length]),cards:game.bf().map(c=>[c.iid,c.damage,c.counters])});
export function installStackCopyProof(MTG,context,operation,h){
 if(!contains(operation))return false;
 let state=states.get(context.game);if(state){state.operation=operation;return true;}
 const game=context.game;state={context,operation,h,rows:[],active:null,copies:new Map(),events:[]};states.set(game,state);
 const emit=game.emit;game.emit=async function(name,data,...args){state.events.push({name,data});return emit.call(this,name,data,...args);};
 // Generic event drivers provide public legal qualities. Give their probe a
 // small visible effect so the copied object's resolution is independently
 // observable. Never replace an imported card's definition or implementation.
 const cast=game.castSpell;game.castSpell=async function(player,card,opts={}){
  if(!card.def.oracleImplementation&&/^V\d (?:stack target |cast event probe$|qualified cast$)/.test(card.name)){
   card.def={...card.def,resolve:gain,_stackCopyProofGain:true};
   if(card.def.adventure)card.def.adventure={...card.def.adventure,resolve:gain};
   if(state.operation.eventFilter?.what==='Adventure'){
    card.def={...card.def,types:['Creature'],subtypes:['Human'],power:'2',toughness:'20',adventure:{adventure:true,name:'Stack proof Adventure',cost:'{0}',altCostStr:'{0}',types:'Sorcery',resolve:gain}};
    opts={...opts,alt:{...card.def.adventure,adventure:true}};
   }
  }
  return cast.call(this,player,card,opts);
 };
 for(const method of ['copySpell','copyStackAbility']){
  const copy=game[method];game[method]=async function(original,controller,opts){
   const active=state.active,before={x:original.x,mode:original.mode?Array.from(original.mode):null,pool:pool(controller),castEvents:state.events.filter(row=>row.name==='cast').length,sourceZone:original.card?.zone,targets:(original.targets||original.ctx?.targets||[]).map(target=>Array.isArray(target)?target.length:target?1:0)};
   const result=await copy.call(this,original,controller,opts);
   if(active&&result){const row={original,copy:result,controller,before,targetCounts:(result.targets||result.ctx?.targets||[]).map(target=>Array.isArray(target)?target.length:target?1:0),afterPool:pool(controller),castEvents:state.events.filter(row=>row.name==='cast').length};active.copies.push(row);state.copies.set(result,row);}
   return result;
  };
 }
 const resolve=game.resolveTop;game.resolveTop=async function(...args){
  const object=this.stack.at(-1),row=state.copies.get(object);
  if(row)row.resolution={before:row.controller.life,originalZone:row.original.card?.zone,world:world(game),events:state.events.length};
  const result=await resolve.apply(this,args);
  if(row){row.resolution.after=row.controller.life;row.resolution.originalAfter=row.original.card?.zone;row.resolution.removed=!this.stack.includes(object);row.resolution.worldChanged=row.resolution.world!==world(game);row.resolution.events=state.events.slice(row.resolution.events);}
  return result;
 };
 if(!installed.has(MTG.OracleV8StackCopy)){
  installed.add(MTG.OracleV8StackCopy);const run=MTG.OracleV8StackCopy.run;
  MTG.OracleV8StackCopy.run=async function(ctx,effect,helpers){
   const state=states.get(ctx.g);if(!state)return run.call(this,ctx,effect,helpers);
   const beforeDelayed=new Set(ctx.g.delayed);
   const row={effect,source:ctx.src,parent:state.registration,copies:[],n:helpers.amount(effect.n,ctx),objects:effect.action==='delay-stack-copy-v8'?[]:effect.target==='event-stack-object-v8'?[ctx.data?.so||ctx.data?.stackObject]:helpers.subjects(ctx,effect.target)};
   state.rows.push(row);const previous=state.active;state.active=row;
   try{return await run.call(this,ctx,effect,helpers);}finally{
    if(effect.action==='delay-stack-copy-v8'){
     row.delayed=ctx.g.delayed.filter(item=>!beforeDelayed.has(item));
     for(const item of row.delayed){const next=item.run;item.run=async function(nextCtx){const previous=state.registration;state.registration=row;row.triggered=true;try{return await next.call(this,nextCtx);}finally{state.registration=previous;}};}
    }
    state.active=previous;
   }
  };
 }
 return true;
}
export async function stageStackCopyTarget(MTG,context,target,index,h){
 const state=states.get(context.game);if(target.zone!=='stack')return null;
 if(target.what==='permanent'&&target.alternatives?.every(child=>child.zone==='stack'))return stageStackCopyTarget(MTG,context,{...target.alternatives.find(child=>child.what==='stack-ability'),controller:target.controller},index,h);
 const {game,a,b}=context,player=target.controller==='opponent'||!state&&target.controller!=='you'?b:a;
 if(target.what==='spell'){
  if(!state)return null;
  // Reuse the ordinary legal-quality and actual casting driver. Temporarily
  // disable only this helper's recursion, while preserving its cast witness.
  states.delete(game);
  try{return await h.stageGenericStackTarget(MTG,{...context,b:player},target,index);}finally{states.set(game,state);}
 }
 if(target.what!=='stack-ability')return null;
 const types=[target.sourceQuality==='Enchantment'?'Enchantment':target.sourceQuality==='Creature'?'Creature':'Artifact'];
 const trigger=!target.abilityKinds.includes('ability');
 const definition=h.fixtureDefinition('Stack copy donor '+index,types,{cost:'{0}',colorsOverride:target.sourceQuality==='colorless'?[]:['G'],power:'2',toughness:'20',_stackCopyProofGain:true,
  ...(trigger?{triggers:[{on:'etb',filter:(g,s,d)=>d.card===s,run:gain}]}:{abilities:[{cost:{mana:'{1}',tap:true},desc:'Gain 3 life',run:gain}]})});
 const card=h.permanent(MTG,game,player,definition);h.fund(player);
 if(trigger){await game.handleETB(card,{});await game.flushTriggers();}
 else{const action=game.activatableList(player).find(row=>row.card===card&&!row.manaAbility);assert.ok(action,'copy probe has a legal real activated ability');assert.equal(await game.activateAbility(player,action),true);}
 const object=game.stack.find(row=>row.srcCard===card);assert.ok(object,'copy donor actually reaches Stack');(context.stackAbilityFixtures||=new Map()).set(object,{card,zone:card.zone,version:card.zoneVersion});return object;
}
export function assertStackCopyEffect(MTG,context,effect,source,label){
 if(!['copy-stack-v8','delay-stack-copy-v8'].includes(effect.action))return false;
 const state=states.get(context.game),row=state?.rows.find(row=>!row.verified&&row.source===source&&same(row.effect,effect));
 assert.ok(row,label+': real Stack-copy effect executes');row.verified=true;
 if(effect.action==='delay-stack-copy-v8'){assert.equal(row.delayed.length,1);assert.equal(row.delayed[0].on,'cast');assert.equal(row.delayed[0].once,true);assert.equal(row.delayed[0].expires,'eot');return true;}
 assert.ok(row.objects.length>0&&row.objects.every(Boolean),label+': copy has a bound original Stack object');
 assert.equal(row.copies.length,row.n*row.objects.length,label+': exact number of copies');assert.ok(row.copies.length>0,label+': positive copy witness');
 for(const copy of row.copies){
  assert.ok(row.objects.includes(copy.original));assert.notEqual(copy.copy,copy.original);assert.equal(copy.copy.ctrl,copy.controller);
  assert.equal(copy.afterPool,copy.before.pool,label+': copying does not repay mana');assert.equal(copy.castEvents,copy.before.castEvents,label+': copy is not cast');
  assert.deepEqual(copy.targetCounts,copy.before.targets,label+': target counts are inherited when the copy is made');
  if(copy.original.kind==='spell'){assert.equal(copy.copy.x,copy.before.x);assert.deepEqual(copy.copy.mode?Array.from(copy.copy.mode):null,copy.before.mode);assert.equal(copy.copy.card,copy.original.card);assert.equal(copy.copy.isCopy,true);}
  else assert.equal(copy.copy.run,copy.original.run,label+': ability effect and modes are inherited');
  assert.ok(copy.resolution?.removed,label+': copy separately resolves and leaves Stack');
  const def=copy.copy.oracleDefinition||copy.original.card?.def;
  const permanentCopy=copy.original.kind==='spell'&&['Artifact','Creature','Enchantment','Planeswalker','Battle'].some(type=>copy.copy.oracleDefinition?def.types.includes(type):context.game.castHasType(copy.copy.card,copy.copy.castOpts||{},type));
  if(permanentCopy){
   const token=copy.resolution.events.find(row=>row.name==='etb'&&row.data.card?.isToken&&row.data.card.name===def.name)?.data.card;
   assert.ok(token,label+': permanent spell copy actually enters as a token');
   for(const field of ['power','toughness'])if(def[field]!==undefined)assert.equal(token.def[field],def[field],label+': copied '+field);
   for(const type of def.types)assert.ok(token.def.types.includes(type),label+': copied card types');
   for(const keyword of def.kws||[])assert.ok(token.def.kws.includes(keyword),label+': copied keyword');
  }else if(copy.original.card?.def._stackCopyProofGain||copy.original.srcCard?.def._stackCopyProofGain){
   assert.equal(copy.resolution.after-copy.resolution.before,3,label+': copied donor gains exactly three life');
  }else{
   assert.ok(copy.original.card?.def.oracleImplementation,label+': original has independently covered complete Oracle operations');
   const targets=copy.copy.targets||[];
   assert.ok(copy.resolution.worldChanged||copy.resolution.events.some(row=>['scry','surveil','cardToGraveyard','cardLeftGraveyard','spellCopied'].includes(row.name))||targets.length&&targets.flat().every(target=>!target),label+': copied original produces an observable result or correctly fizzles');
  }
  if(copy.original.card)assert.equal(copy.resolution.originalAfter,copy.resolution.originalZone,label+': copy never moves its original card');
 }
 return true;
}
export async function prepareStackCopySource(MTG,context,operation,h){
 if(!states.has(context.game))return;
 for(const [index,target]of(operation.targets||[]).entries()){
  if(target.zone!=='stack')continue;
  const old=context.oracleProofTargets?.[index];
  if(old&&context.game.stack.includes(old))continue;
  const staged=await stageStackCopyTarget(MTG,context,target,'restaged-'+index,h);
  if(staged&&context.oracleProofTargets)context.oracleProofTargets[index]=staged;
 }
}

export async function finishStackCopyProof(MTG,context,h){
 const state=states.get(context.game);if(!state)return;
 for(const row of state.rows.filter(row=>row.effect.action==='delay-stack-copy-v8')){
  if(!row.triggered){
   const player=row.delayed[0].ctrl,saved={phase:context.game.phase,turnPlayer:context.game.turnPlayer};h.fund(player,100);context.game.phase='main1';context.game.turnPlayer=player;
   try{await stageStackCopyTarget(MTG,{...context,a:player},row.effect.filter,'delayed-next',h);await h.resolveAll(context.game);}finally{context.game.phase=saved.phase;context.game.turnPlayer=saved.turnPlayer;}
  }
  const children=state.rows.filter(child=>child.parent===row);assert.equal(children.length,1,'next-spell registration triggers exactly once');
  const child=children[0];assert.equal(child.n,row.n,'delayed copies retain the number captured at registration');
  assertStackCopyEffect(MTG,context,child.effect,row.source,row.source.name+'/delayed-copy');
  assert.ok(!context.game.delayed.includes(row.delayed[0]),'the one-shot delayed ability is consumed');
 }
}

export async function fireStackCopyEvent(MTG,context,source,operation,h){
 const rule=operation.eventFilter;
 if(operation.event==='cast'&&rule?.kind==='stack-copy-cast-v8'){
  const {game,a,b}=context;if(rule.sourceAttacking)source.attacking=b;
  const card=h.zoneCard(MTG,a,h.fixtureDefinition('V8 qualified cast',rule.adventure?['Creature']:['Instant'],{cost:'{0}',power:'2',toughness:'20',_stackCopyProofGain:true,resolve:gain,
   ...(rule.selfTargetOnly?{targets:[{what:'creature',filter:(g,c)=>c===source}]}:{}),
   ...(rule.adventure?{adventure:{adventure:true,name:'Stack proof Adventure',cost:'{0}',altCostStr:'{0}',types:'Sorcery',resolve:gain}}:{})}),'hand');
  h.fund(a,100);context.eventCard=card;context.eventController=a;context.eventCardBefore=h.cardState(card);
  assert.equal(await game.castSpell(a,card,{from:'hand',...(rule.adventure?{alt:{...card.def.adventure,adventure:true}}:{})}),true,'exact copy event uses the announced face and targets');return true;
 }
 if(operation.event!=='abilityActivated'||rule?.kind!=='stack-copy-activation-v8')return false;
 const {game,a}=context,type=rule.attached?'Creature':rule.sourceTypes?.[0]||'Artifact';
 const definition=h.fixtureDefinition('Stack copy activated event donor',[type],{cost:'{0}',subtypes:rule.sourceSubtype?[rule.sourceSubtype]:[],loyalty:rule.loyalty?'4':undefined,power:'2',toughness:'20',_stackCopyProofGain:true,
  abilities:[{cost:{mana:'{1}',...(rule.sacrificed?{sacSelf:true}:rule.loyalty?{}:{tap:true})},...(rule.loyalty?{loyalty:1}:{}),desc:'Gain 3 life',run:gain}]});
 const card=h.permanent(MTG,game,a,definition);if(rule.loyalty)card.counters.loyalty=4;
 if(rule.attached)assert.equal(await game.attach(source,card),true,'activated event fixture is actually equipped');
 h.fund(a,100);const action=game.activatableList(a).find(row=>row.card===card&&!row.manaAbility);assert.ok(action,'copy event donor is a real legal activation');
 context.eventCard=card;context.eventController=a;context.eventCardBefore=h.cardState(card);
 assert.equal(await game.activateAbility(a,action),true,'copy event starts with actual cost payment and activation');
 return true;
}
