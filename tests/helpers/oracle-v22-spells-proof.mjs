import assert from 'node:assert/strict';
const worlds=new WeakMap(),installed=new WeakSet(),actions=new Set(['grave-choice-v22','grave-mana-trio-v22','grave-return-choice-counters-v22','partition-search-v22','grave-all-return-v22','grave-group-return-v22']);
const flat=value=>[value].flat(Infinity).filter(Boolean),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function install(M,context,h){
 let state=worlds.get(context.game);if(!state){state={context,h,rows:[],casts:[],controllers:new WeakSet()};worlds.set(context.game,state);}state.h=h;
 if(!state.installed){state.installed=true;state.life=[];const life=context.game.loseLife;context.game.loseLife=async function(player,n,...args){state.life.push({player,n,count:context.a.graveyard.filter(card=>card.is('Creature')).length});return life.call(this,player,n,...args);};const cast=context.game.castSpell;context.game.castSpell=async function(player,card,opts){const before=Object.values(player.pool).reduce((a,b)=>a+b,0),result=await cast.call(this,player,card,opts);if(result)state.casts.push({card,object:this.stack.find(o=>o.kind==='spell'&&o.card===card),paid:before-Object.values(player.pool).reduce((a,b)=>a+b,0)});return result;};
  const decide=context.a.controller.decide.bind(context.a.controller);context.a.controller.decide=async(g,q)=>{
   let result;if(q.aiHint?.kind==='mode'&&state.fixture?.mode!==undefined&&(q.src||q.aiHint.src||q.aiHint.card)?.name===state.fixture.name)result=String(state.fixture.mode);else result=await decide(g,q);
   if(q.type==='chooseCards'&&q.aiHint?.kind==='oracleNameSearch'&&q.aiHint.canPayRemaining){const legal=[];for(const card of Array.isArray(result)?result:[])if(q.aiHint.canPayRemaining([...legal,card]))legal.push(card);result=legal;}
   if(state.active&&q.type==='chooseCards')state.active.choices.push({query:q,result:[...(result||[])],player:context.a});return result;
  };
 }
 // Bulk fixtures replace the opponent controller after constructing the game.
 // Instrument its current instance during staging, before the real resolution.
 for(const player of context.game.players.filter(player=>player!==context.a))if(!state.controllers.has(player.controller)){state.controllers.add(player.controller);const decide=player.controller.decide.bind(player.controller);player.controller.decide=async(g,q)=>{const result=await decide(g,q);if(state.active&&q.type==='chooseCards')state.active.choices.push({query:q,result:[...(result||[])],player});return result;};}
 for(const handler of M.OracleV20.handlers)if(handler.spellsV22&&!installed.has(handler)){installed.add(handler);const effect=handler.effect;handler.effect=async function(ctx,node,helpers){const state=worlds.get(ctx.g);if(!state||!actions.has(node.action))return effect.call(this,ctx,node,helpers);const filter=node.filter?helpers.genericTargetSpec(node.filter,[],0):null,row={effect:node,source:ctx.src,subjects:flat(helpers.genericEffectSubjects(ctx,node.target)),allGrave:filter?ctx.you.graveyard.filter(card=>filter.filter(ctx.g,card,ctx.you,ctx.src)):[],choices:[],before:new Map(['library','graveyard'].flatMap(zone=>ctx.you[zone]).map(c=>[c,{zone:c.zone,version:c.zoneVersion,mv:c.mv,counters:{...c.counters}}]))};state.rows.push(row);state.active=row;try{return await effect.call(this,ctx,node,helpers);}finally{state.active=null;row.after=new Map([...row.before.keys()].map(c=>[c,{zone:c.zone,version:c.zoneVersion,counters:{...c.counters}}]));}};}
 return state;
}
export function installSpellProofV22(M,context,h){return install(M,context,h);}
function prepareGroups(M,context,h){for(const [index,target]of(h.operation?.targets||[]).entries())if(target.groupV22){const cards=flat(h.stagedTargets[index]);for(const [ordinal,card]of cards.entries()){card.def={...card.def,cost:'{'+(target.groupV22.test==='different-mana-values'?ordinal:1)+'}',name:'V22 group '+index+' '+ordinal,subtypes:[...(card.def.subtypes||[]),'Bear']};}assert.ok(M.OracleV22Spells.groupFilter(target.groupV22,context.game,cards));}context.game.recalc();}
export function stageSpellsEffectV22(M,context,effect,h){
 const state=install(M,context,h);prepareGroups(M,context,h);
 if(effect.action==='spell-fixture-v22'){state.fixture=effect;return true;}
 if(effect.action==='grave-choice-v22'){for(const mv of [0,1,2,2,3]){const c=h.stageGenericTarget(M,context,{...effect.filter,min:1,max:1},'v22-choice-'+state.rows.length+'-'+mv);for(const card of flat(c))card.def={...card.def,cost:'{'+mv+'}',name:'V22 return '+mv+' '+card.iid};}context.game.recalc();return true;}
 if(effect.action==='grave-mana-trio-v22'){for(const mv of [1,2,3]){const card=h.zoneCard(M,context.a,'Grizzly Bears','graveyard');card.def={...card.def,cost:'{'+mv+'}'};}return true;}
 if(effect.action==='partition-search-v22'){for(let i=0;i<4;i++){const card=h.zoneCard(M,context.a,effect.filter.what==='land'?'Forest':'Grizzly Bears',effect.graveyard&&i>1?'graveyard':'library');card.def={...card.def,name:'V22 search '+i,cost:'{'+(i%3)+'}'};}return true;}
 if(effect.action==='grave-all-return-v22'){for(let i=0;i<3;i++)h.stageGenericTarget(M,context,effect.filter,'v22-current-grave-'+i);return true;}
 if(effect.action==='grave-group-return-v22')return true;
 if(effect.action==='grave-return-choice-counters-v22')return true;
 return false;
}
export async function assertSpellsEffectV22(M,context,entry,effect,source,selectedTargets,damagedPlayer,before,trace,label,h){
 const state=worlds.get(context.game);
 if(effect.action==='with-x-v10'&&state?.fixture?.repeat&&effect.value?.kind==='count'&&effect.value.zone==='graveyard'&&effect.value.what==='creature'&&effect.effects.length===1&&effect.effects[0].action==='lose-life'){assert.ok(state.life.length);for(const row of state.life.filter(row=>row.player!==context.a))assert.equal(row.n,row.count,label+': graveyard size sampled when life-loss instruction executes');return true;}
 if(effect.action==='spell-fixture-v22'){const row=state?.casts.find(row=>row.card===source);assert.ok(row?.object,label+': real spell was announced');assert.ok(row.paid>0,label+': actual mana paid');if(effect.mode!==undefined)assert.deepEqual(Array.from(row.object.mode),[effect.mode],label+': exact expanded printed mode plan');for(const [index,spec]of(row.object.targetSpecs||[]).entries())if(spec.oracleGroupFilterV22)assert.ok(spec.oracleGroupFilterV22(context.game,flat(row.object.targets[index])),label+': actual announced target group satisfies its relation');return true;}
 if(!actions.has(effect.action))return false;
 const rows=state?.rows.filter(row=>same(row.effect,effect));assert.ok(rows?.length,label+': v22 complete instruction executed');
 for(const row of rows){
  if(effect.action==='grave-choice-v22'||effect.action==='grave-mana-trio-v22'){const selected=row.choices.filter(choice=>choice.query.aiHint?.kind==='oracleNameSearch').flatMap(choice=>choice.result);assert.ok(selected.length,label+': actual graveyard cards were selected');if(effect.action==='grave-mana-trio-v22')assert.deepEqual(selected.map(card=>row.before.get(card).mv),[1,2,3]);if(effect.group)assert.ok(M.OracleV22Spells.groupFilter(effect.group,context.game,selected));for(const card of selected){const old=row.before.get(card);assert.ok(old);assert.equal(row.after.get(card).zone,effect.destination||'battlefield');assert.equal(row.after.get(card).version,old.version+1,label+': exact selected incarnation moved');}if(effect.bottomSource){assert.equal(source.zone,'library');assert.equal(source.owner.library[0],source);}}
  if(effect.action==='grave-return-choice-counters-v22'){assert.ok(row.subjects.length);const choices=row.choices.filter(choice=>/counter on a returned creature/.test(choice.query.prompt));assert.equal(choices.length,2);for(const [i,choice]of choices.entries()){assert.equal(choice.result.length,1);assert.equal(choice.result[0].zone,'battlefield');assert.equal(choice.result[0].counters[effect.counters[i]],1);}}
  if(effect.action==='grave-all-return-v22'||effect.action==='grave-group-return-v22'){const cards=effect.action==='grave-all-return-v22'?row.allGrave:row.subjects;assert.ok(cards.length);for(const card of cards){assert.equal(card.zone,effect.destination);assert.equal(card.zoneVersion,row.before.get(card).version+1);if(effect.tapped)assert.equal(card.tapped,true);}}
  if(effect.action==='partition-search-v22'){const search=row.choices.find(choice=>choice.query.aiHint?.kind==='oracleNameSearch'),partition=row.choices.find(choice=>choice.query.aiHint?.kind==='oraclePartitionV22');assert.ok(search?.result.length);assert.ok(partition,JSON.stringify(row.choices.map(choice=>({kind:choice.query.aiHint?.kind,player:choice.player.name,prompt:choice.query.prompt}))));assert.equal(new Set(search.result.map(card=>card.name)).size,search.result.length);assert.equal(partition.result.length,Math.min(2,search.result.length));for(const card of search.result){const chosen=partition.result.includes(card),destination=chosen?effect.chosen:effect.rest;assert.equal(card.zone,destination);if(destination==='battlefield'&&effect.tapped)assert.equal(card.tapped,true);}if(effect.exileSource)assert.equal(source.zone,'exile');}
 }
 return true;
}
export async function operationProofV22(M,entry,operation,role,h){
 if(operation.kind==='spell-modal-generic'&&(operation.contract==='spell-repeat-modes-v22'||operation.modes.some(mode=>mode.body.targets.some(target=>target.groupV22)))){
  let checks=0;for(const [mode,chosen]of operation.modes.entries()){
   // Repeated v20 effects already assert every trace row with their exact
   // descriptor. Route that assertion once so evidence is not consumed twice.
   const seen=new Set(),effects=chosen.body.effects.filter(effect=>{if(!/-v20$/.test(effect.action))return true;const key=JSON.stringify(effect);if(seen.has(key))return false;seen.add(key);return true;}),fixture={action:'spell-fixture-v22',name:entry.raw.name,mode,repeat:operation.contract==='spell-repeat-modes-v22'},body={...chosen.body,effects:[...effects,fixture]},modal={...operation,modes:operation.modes.map((item,index)=>index===mode?{...item,body}:{...item,body:{effects:[],targets:[],optional:false}})},table=effects.find(effect=>effect.action==='choice-table-v20');
   for(const proofDecisionV20 of table?table.options.map(option=>option.key):[undefined])checks+=await h.genericRuntimeOperationProof(M,entry,{kind:'spell-generic',modal,modePlan:[mode],targets:body.targets,effects:body.effects,originalOperation:operation,paragraphProof:true,...(proofDecisionV20?{proofDecisionV20}:{})},role);
  }return checks;
 }
 if(operation.kind==='spell-generic'&&operation.targets.some(target=>target.groupV22))return h.genericRuntimeOperationProof(M,entry,{...operation,effects:[...operation.effects,{action:'spell-fixture-v22',name:entry.raw.name}],originalOperation:operation,paragraphProof:true},role);
 return null;
}
