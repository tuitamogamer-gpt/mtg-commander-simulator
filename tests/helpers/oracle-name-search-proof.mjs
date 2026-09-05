import assert from 'node:assert/strict';
const installed=new WeakSet(),worlds=new WeakMap();
const names=card=>card?.rulesNames||((card?.faceDown||card?.def?.rulesNoName)?[]:card?.def?.oracleSplit?card.def.oracleSplit.faces.map(face=>face.name):card?.name?[card.name]:[]);
const state=card=>({card,zone:card.zone,version:card.zoneVersion,names:names(card),owner:card.owner});
export function installNameSearchProof(M,context){
 worlds.set(context.game,context);if(installed.has(M))return;installed.add(M);const original=M.OracleV8NameSearch.run;
 M.OracleV8NameSearch.run=async(ctx,effect,h)=>{
  const world=worlds.get(ctx.g);if(!world)return original(ctx,effect,h);
  const primary=effect.models||effect.namesFrom==='own-hand'?ctx.src:effect.eventName?ctx.oracleSourceCapture?.eventCard||ctx.data?.card:h.subjects(ctx,effect.target)[0];assert.ok(primary,'name search has its printed antecedent');
  const eventSnap=effect.eventName&&(ctx.oracleSourceCapture?.eventSnap||ctx.data?.snap),owner=effect.owner==='you'?ctx.you:effect.owner==='target-player'?primary:effect.owner==='event-controller'?ctx.oracleSourceCapture?.eventController||eventSnap?.ctrl:effect.owner==='owner'?(primary.card||primary).owner:primary.ctrl;
  const put=(definition,zone,player=owner)=>{const card=new M.CardInst(definition,player);card.zone=zone;card.sick=false;if(zone==='battlefield')ctx.g.battlefield.push(card);else player[zone].unshift(card);return card;};
  let models=[primary];
  if(effect.namesFrom){const model=put(M.DEFS['Colossal Dreadmaw'],effect.namesFrom==='graveyard'?'graveyard':'hand');models=[model];if(effect.prior==='retrace')put(model.def,'battlefield');}
  else if(effect.models){models=ctx.g.bf().filter(card=>card.ctrl===ctx.you&&(effect.models==='choose-five-permanents'||card.is('Creature'))&&(effect.models!=='friendly-other-creatures'||card!==ctx.src));if(!models.length)models=[put(M.DEFS['Colossal Dreadmaw'],'battlefield',ctx.you)];}
  for(const model of models){const definition=eventSnap?.def||model.card?.def||model.def;for(const zone of effect.zones)put(definition,zone);}
  ctx.g.recalc();
  const before=ctx.g.players.flatMap(player=>['library','hand','graveyard','exile','command'].flatMap(zone=>player[zone].map(state))).concat(ctx.g.battlefield.map(state),ctx.g.stack.filter(so=>so.card).map(so=>state(so.card)));
  const savedOwnerController=owner.controller;
  if(effect.owner==='event-controller'&&owner!==ctx.you&&world.role==='ai')owner.controller=new M.AIController(owner,{difficulty:'hard',style:'balanced'});
  const choices=[],saved=ctx.g.players.map(player=>({player,decide:player.controller.decide}));
  for(const {player,decide} of saved)player.controller.decide=async function(game,q){
   let answer;const candidates=q.from?.map(state);
   if((player===ctx.you?!player.isAI:world.role==='human')&&q.type==='chooseCards'&&(q.search||q.prompt?.startsWith('Choose revealed card'))){answer=[];for(const card of q.from)if(answer.length<q.max&&(!q.aiHint?.canPayRemaining||q.aiHint.canPayRemaining([...answer,card])))answer.push(card);}
   else answer=await decide.call(this,game,q);
   choices.push({q,answer:Array.isArray(answer)?answer.slice():answer,player,candidates});return answer;
  };
  try{await original(ctx,effect,h);}finally{for(const {player,decide} of saved)player.controller.decide=decide;owner.controller=savedOwnerController;}
  (world.nameSearchProof||=[]).push({source:ctx.src,effect,primary,owner,eventSnap,before,after:before.map(row=>state(row.card)),choices,models});
 };
}
export function assertNameSearch(context,effect,source,label){
 if(effect.action!=='same-name-search-v8')return false;
 const row=context.nameSearchProof?.findLast(row=>row.source===source&&JSON.stringify(row.effect)===JSON.stringify(effect));assert.ok(row,label+': actual bound-name search resolves');
 const search=row.choices.find(choice=>choice.q.search);
 const modelChoice=row.choices.find(choice=>choice.q.prompt?.startsWith('Choose revealed card')||choice.q.prompt==='Choose five permanents');
 const models=modelChoice?.answer||row.models,modelNames=models.flatMap(model=>names(row.eventSnap||model));
 if(effect.prior==='retrace'){
  assert.ok(modelChoice?.answer.length,label+': actual revealed hand choice');assert.ok(modelChoice.answer.every(card=>card.zone==='battlefield'));return true;
 }
 assert.ok(search,label+': positive real searched-card choice');assert.ok(search.answer.length,label+': printed search has executable positive outcome');
 for(const card of search.answer){const before=search.candidates.find(before=>before.card===card),after=row.after.find(after=>after.card===card);assert.ok(before,label+': locked candidate');assert.equal(before.owner,row.owner);assert.ok(effect.zones.includes(before.zone));assert.ok(before.names.some(name=>modelNames.includes(name)),label+': selected card matches independently captured name');assert.equal(after.zone,effect.destination);assert.ok(after.version>before.version);if(effect.tapped)assert.equal(card.tapped,true);}
 if(effect.quantity==='all')for(const before of row.before.filter(before=>before.owner===row.owner&&before.zone==='graveyard'&&before.names.some(name=>modelNames.includes(name))))assert.equal(before.card.zone,'exile',label+': every public graveyard match is mandatory');
 for(const before of row.before.filter(before=>before.owner!==row.owner&&before.card!==row.primary&&['library','hand','graveyard'].includes(before.zone)))assert.equal(before.card.zone,before.zone,label+': another player zone stays unchanged');
 return true;
}
