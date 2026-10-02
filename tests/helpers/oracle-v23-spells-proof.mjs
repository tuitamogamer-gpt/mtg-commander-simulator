import assert from 'node:assert/strict';
const kinds=new Set(['mechanic-splice-payment-v23','mechanic-flashback-payment-v23','mechanic-buyback-payment-v23','mechanic-escalate-payment-v23','mechanic-replicate-payment-v23','mechanic-alternative-payment-v23','mechanic-dragon-reveal-v23','mechanic-dragon-uncounterable-v23']);
const flat=value=>[value].flat(Infinity).filter(Boolean),total=player=>Object.values(player.pool).reduce((sum,n)=>sum+n,0);
export function installSpellProofV23(){}
export function stageSpellsEffectV23(){return false;}
export async function assertSpellsEffectV23(){return false;}
export function stageCostsCardV23(M,f,entry,h){
 const donors=[];
 for(const operation of entry.implementation||[])if(kinds.has(operation.kind)){
  const payment=operation.payment;
  if(payment?.kind==='additional')for(const cost of payment.costs){if(cost.kind==='payLife')continue;const n=cost.quantity?.xV19?3:cost.quantity.min;
   for(let i=0;i<n+1;i++){const permanent=['sacrifice','returnPermanent'].includes(cost.kind),subtype=cost.object.qualifier?.subtypes?.find(type=>['Mountain','Swamp','Island'].includes(type)),card=permanent?h.permanent(M,f.game,f.a,subtype||'Grizzly Bears'):h.zoneCard(M,f.a,subtype||'Grizzly Bears',cost.kind==='discard'||cost.kind==='exileHand'?'hand':'graveyard');card.def={...card.def,...(cost.object.qualifier?.colors?{cost:cost.object.qualifier.colors.map(color=>'{'+color+'}').join('')}:{})};donors.push(card);}
  }
  if(payment?.kind==='tap'||payment?.kind==='behold')for(let i=0;i<payment.n;i++)for(const card of flat(h.stageGenericTarget(M,f,{...payment.filter,controller:'you',zone:payment.kind==='tap'?'battlefield':'graveyard'},'v23-payment-'+i))){if(payment.kind==='behold'){card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);card.zone=i?'hand':'battlefield';if(i)card.owner.hand.push(card);else f.game.battlefield.push(card);}card.tapped=false;donors.push(card);}
  if(payment?.kind==='hand-exile-mv'){const card=h.zoneCard(M,f.a,'Grizzly Bears','hand');card.def={...card.def,cost:'{1}{'+payment.color+'}'};donors.push(card);}
 }
 f.game.recalc();return donors;
}
export async function operationProofV23(M,entry,operation,role,h){
 if(['mechanic-dragon-reveal-v23','mechanic-dragon-uncounterable-v23'].includes(operation.kind)||operation.kind==='spell-generic'&&/"action":"dragon-/.test(JSON.stringify(operation)))return dragonProof(M,entry,role,h);
 if(operation.kind==='spell-generic'&&operation.effects.some(effect=>effect.action==='counter-x-payment-v23')){
  for(const x of [1,2]){const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fund(a,20);h.fund(b,20);a.life=b.life=40;const bolt=h.zoneCard(M,b,'Lightning Bolt','hand');bolt.def={...bolt.def,cost:'{1}{R}'};const decideB=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.type==='chooseTargets'?[a]:decideB(g,q);assert.equal(await game.castSpell(b,bolt,{from:'hand'}),true);const target=game.stack.find(so=>so.card===bolt),card=h.zoneCard(M,a,entry.raw.name,'hand'),decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?[target]:decide(g,q);assert.equal(await game.castSpell(a,card,{from:'hand',xVal:x}),true);await game.resolveTop();assert.equal(game.stack.includes(target),x!==2);await h.resolveAll(game);assert.equal(a.life,x===2?40:37);h.assertControllerRole(M,f,entry.raw.name);}return 12;
 }
 if(!kinds.has(operation.kind))return null;
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fund(a,100);h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);
 const donors=stageCostsCardV23(M,f,entry,h),body=entry.implementation.filter(op=>['spell-generic','spell-modal-generic'].includes(op.kind)),source=h.zoneCard(M,a,entry.raw.name,operation.kind==='mechanic-flashback-payment-v23'?'graveyard':'hand');
 for(const op of body.flatMap(op=>op.modes?op.modes.map(mode=>mode.body):[op]))for(const [i,target]of(op.targets||[]).entries())if(target.zone!=='stack')h.stageGenericTarget(M,f,target,'v23-cast-target-'+i,op.effects?.find(effect=>effect.target===i));
 const spare=h.permanent(M,game,b,'Grizzly Bears');spare.def={...spare.def,toughness:'30'};game.recalc();
 if(operation.kind==='mechanic-replicate-payment-v23')a.counters.energy=operation.energy*2;
 h.zoneCard(M,b,'Doom Blade','hand');h.zoneCard(M,b,'Forest','hand');h.permanent(M,game,a,'Swamp');h.permanent(M,game,a,'Forest');
 let carrier,baseRuns=0,bodyRuns=0;const original=source.def.resolve,choose=a.controller.decide.bind(a.controller);
 let enemy;if(entry.implementation.some(op=>op.kind==='spell-counter'||op.targets?.some(target=>target.zone==='stack'))){const bolt=h.zoneCard(M,b,'Lightning Bolt','hand');h.fund(b,10);const prior=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.type==='chooseTargets'?[a]:prior(g,q);assert.equal(await game.castSpell(b,bolt,{from:'hand'}),true);enemy=game.stack.find(so=>so.card===bolt);}
 if(operation.kind==='mechanic-splice-payment-v23'){
  carrier=new M.CardInst({name:'V23 actual Arcane carrier',cost:'{1}',types:['Instant'],subtypes:['Arcane'],super:[],kws:[],resolve:async()=>{baseRuns++;}},a);carrier.zone='hand';a.hand.push(carrier);
  source.def.resolve=async ctx=>{bodyRuns++;assert.notEqual(ctx.src,source);return original(ctx);};
 }
 a.controller.decide=(g,q)=>q.aiHint?.kind==='splice-v11'?q.options.find(row=>row.card===source)?.key||'done':q.type==='chooseTargets'&&enemy?[enemy]:q.type==='chooseTargets'&&(carrier||operation.payment?.kind==='hand-exile-mv')&&q.candidates.includes(spare)?[spare]:q.aiHint?.kind==='kicker'?'yes':q.type==='chooseMulti'&&q.aiHint?.kind==='modes'?q.options.map(option=>option.key):q.type==='chooseX'?Math.min(2,q.max??2):choose(g,q);
 let copies=0;const emit=game.emit.bind(game);game.emit=async(event,data)=>{if(event==='spellCopied'&&data.so.card===card)copies++;return emit(event,data);};
 const card=carrier||source,alt=operation.kind==='mechanic-flashback-payment-v23'?game.castableList(a).find(row=>row.card===source&&row.alt?.oracleKeywordPayment==='flashback')?.alt:operation.kind==='mechanic-alternative-payment-v23'?game.castableList(a).find(row=>row.card===source&&row.alt?.oracleAlternativeCost&&!row.alt.flashback)?.alt:undefined;
 if(operation.kind==='mechanic-flashback-payment-v23')assert.ok(alt,entry.raw.name+': real graveyard casting permission');
 const mana=total(a),life=a.life,energy=a.counters.energy||0,versions=new Map(donors.map(card=>[card,card.zoneVersion]));
 try{
  assert.equal(await game.castSpell(a,card,{from:card.zone,...(alt?{alt}:{}),...(operation.payment?.x?{xVal:2}:{})}),true,entry.raw.name+': real paid cost announcement');
  const so=game.stack.find(row=>row.card===card);assert.ok(so);assert.ok(mana>total(a)||operation.mana==='{0}',entry.raw.name+': mana is physically paid');
  if(operation.payment?.x)assert.equal(so.x,2);
  if(operation.payment?.kind==='additional')for(const cost of operation.payment.costs){const record=so.oracleV4AdditionalCost;assert.ok(record);if(cost.kind==='payLife')assert.equal(a.life,life-cost.amount.value);else {const key={discard:'discards',sacrifice:'sacrifices',exileGraveyard:'exiles',returnPermanent:'returns',exileHand:'handExiles'}[cost.kind],items=record[key]||[],n=operation.kind==='mechanic-escalate-payment-v23'?so.mode.length-1:operation.payment.costs.filter(other=>other.kind===cost.kind).reduce((sum,other)=>sum+(other.quantity.xV19?2:other.quantity.min),0);assert.equal(items.length,n);for(const item of items){const donor=donors.find(card=>card.iid===(item.iid||item));assert.ok(donor);assert.equal(donor.zoneVersion,versions.get(donor)+1);}}}
  if(operation.payment?.kind==='tap'||operation.payment?.kind==='behold'||operation.payment?.kind==='opponent-life'){const record=so.oraclePaidSpecialV23?.find(row=>row.kind===operation.payment.kind);assert.ok(record);assert.equal(record.n,operation.payment.n);if(record.kind==='tap')assert.ok(donors.every(card=>card.tapped));}
  if(operation.payment?.kind==='hand-exile-mv'){assert.equal(so.oracleV4AdditionalCost.handExiles.length,1);assert.equal(donors[0].zone,'exile');assert.equal(donors[0].zoneVersion,versions.get(donors[0])+1);}
  if(carrier){assert.equal(source.zone,'hand');assert.equal(so.oracleSpliceV11.parts[0].name,entry.raw.name);const copy=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(JSON.stringify(copy.oracleSpliceV11),JSON.stringify(so.oracleSpliceV11));await game.counterStackObject(copy);}
  if(operation.kind==='mechanic-replicate-payment-v23')assert.equal(a.counters.energy,energy-operation.energy*2);
  if(operation.kind==='mechanic-escalate-payment-v23'){assert.equal(so.mode.length,3);assert.equal(so.oracleV4AdditionalCost.discards.length,2);}
  await h.resolveAll(game);if(operation.kind==='mechanic-replicate-payment-v23')assert.equal(copies,2);if(carrier){assert.equal(baseRuns,1);assert.equal(bodyRuns,1);assert.equal(source.zone,'hand');}else if(operation.kind==='mechanic-flashback-payment-v23')assert.equal(source.zone,'exile');else if(operation.kind==='mechanic-buyback-payment-v23')assert.equal(source.zone,'hand');
  h.assertControllerRole(M,f,entry.raw.name);return 15;
 }finally{if(carrier)source.def.resolve=original;}
}
async function dragonProof(M,entry,role,h){
 for(const mode of ['none','reveal','controlled']){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fund(a,100);h.fund(b,100);a.life=b.life=40;h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);
  const name=entry.raw.name,card=h.zoneCard(M,a,name,'hand'),target=h.permanent(M,game,b,'Grizzly Bears');target.def={...target.def,toughness:'30'};const dragon=mode==='none'?null:mode==='reveal'?h.zoneCard(M,a,'Grizzly Bears','hand'):h.permanent(M,game,a,'Grizzly Bears');if(dragon)dragon.def={...dragon.def,subtypes:['Dragon'],power:'5'};game.recalc();
  let enemy;if(name==="Silumgar's Scorn"){const bolt=h.zoneCard(M,b,'Lightning Bolt','hand'),prior=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.type==='chooseTargets'?[a]:q.type==='chooseOption'&&q.options.some(row=>row.key==='yes')?'yes':prior(g,q);assert.equal(await game.castSpell(b,bolt,{from:'hand'}),true);enemy=game.stack.find(so=>so.card===bolt);}
  const prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.prompt.includes('optionally reveal')?(mode==='reveal'||name==="Dragon's Fire"&&mode==='controlled'?[dragon]:[]):q.type==='chooseTargets'?[enemy|| (name==='Foul-Tongue Invocation'?b:target)]:prior(g,q);
  const mana=total(a),hand=a.hand.length;assert.equal(await game.castSpell(a,card,{from:'hand'}),true);assert.ok(total(a)<mana);const so=game.stack.find(so=>so.card===card);assert.equal(!!so.castOpts.oracleDragonChoiceV23,mode==='reveal'||name==="Dragon's Fire"&&mode==='controlled');if(mode==='controlled')await game.move(dragon,'graveyard');
  if(name==="Dragonlord's Prerogative"&&mode!=='none'){const copy=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(await game.counterStackObject(copy),false);assert.equal(await game.counterStackObject(so),false);}
  await h.resolveAll(game);
  if(name==='Draconic Roar'){assert.equal(target.damage,3);assert.equal(b.life,mode==='none'?40:37);}if(name==='Foul-Tongue Invocation'){assert.equal(target.zone,'graveyard');assert.equal(a.life,mode==='none'?40:44);}if(name==="Dragon's Fire")assert.equal(target.damage,mode==='none'?3:5);if(name==="Silumgar's Scorn")assert.equal(a.life,mode==='none'?37:40);if(name==="Dragonlord's Prerogative")assert.equal(a.hand.length,hand-1+(mode==='none'?4:8));h.assertControllerRole(M,f,name);
 }
 return 24;
}
