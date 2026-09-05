import assert from 'node:assert/strict';
export async function entryCounterProof(M,entry,operation,role,h){
 const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx,label=entry.raw.name+'/'+role;
 h.assertControllerRole(M,ctx,label);for(const p of game.players){h.fund(p,100);h.fillLibrary(M,p,25);}h.stageCardCosts(M,ctx,entry);
 if(operation.kind==='entry-counter-bonus-v8'){
  const source=h.zoneCard(M,a,entry.raw.name,'hand'),before=Object.values(a.pool).reduce((x,y)=>x+y,0);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<before);assert.equal(source.counters['+1/+1']||0,0);
  if(operation.amount==='lands-entered'){const land=h.zoneCard(M,a,'Forest','hand');await game.move(land,'battlefield');}
  for(const [name,wanted]of operation.amount==='angels-controlled'?[['Grizzly Bears',0],['Serra Angel',1],['Serra Angel',2]]:operation.amount==='lands-entered'?[['Grizzly Bears',1],['Sol Ring',0]]:[['Grizzly Bears',1],['Serra Angel',3],["Cultivator's Caravan",1],['Sol Ring',0]]){
   const card=h.zoneCard(M,a,name,'hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await h.resolveAll(game);assert.equal(card.counters['+1/+1']||0,wanted,label+': '+name+' entry amount');
  }
  return 7;
 }
 const bear=h.permanent(M,game,a,'Grizzly Bears');game.addCounters(bear,'+1/+1',3);
 for(let i=0;i<5;i++)h.permanent(M,game,a,'Forest');
 for(const name of ['Lightning Bolt','Grizzly Bears'])h.zoneCard(M,a,name,'graveyard');await game.loseLife(b,4,'entry fixture');
 const prior=h.zoneCard(M,a,'Lightning Bolt','hand');assert.equal(await game.castSpell(a,prior,{from:'hand'}),true);await h.resolveAll(game);
 const source=h.zoneCard(M,a,entry.raw.name,'hand'),mana=Object.values(a.pool).reduce((x,y)=>x+y,0),observed=[];
 const emit=game.emit.bind(game);game.emit=async(name,data)=>{if(name==='etb'&&data.card===source)observed.push({...source.counters});return emit(name,data);};
 assert.equal(await game.castSpell(a,source,{from:'hand',xVal:3}),true);await h.resolveAll(game);assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<mana);assert.equal(source.zone,'battlefield');assert.equal(observed.length,1);
 if(operation.choice){assert.equal(Object.keys(observed[0]).length,operation.choice.count);for(const [kind,n]of Object.entries(observed[0])){assert.equal(n,1);assert.ok(operation.choice.kinds.includes(kind));assert.equal(source.kw(kind),true);}}
 else if(operation.prepare){assert.equal(observed[0][operation.counters[0].kind]||0,operation.prepare==='remove-all-counters'?3:0);if(operation.prepare==='remove-all-counters')assert.equal(bear.counters['+1/+1'],0);}
 else for(const counter of operation.counters){
  let expected=counter.n;
  if(typeof expected==='object'){
   const n={convoked:0,'mana-colors':new Set(source.castMeta.paymentColors.filter(c=>'WUBRG'.includes(c))).size,'mana-spent':source.castMeta.manaSpent,'other-spells':1,'opponent-life-lost':b.turnState.lifeLost,'other-creature-plus-counters':3,'other-creatures':1,'graveyard-mana-costs':2}[expected.value];assert.notEqual(n,undefined);expected=n*(expected.multiply??1)+(expected.add??0);
  }
  if(operation.condition==='no-other-red-spell')expected=0;
  if(operation.condition==='at-most-one-mana-color'&&new Set(source.castMeta.paymentColors.filter(c=>'WUBRG'.includes(c))).size>1)expected=0;
  assert.equal(observed[0][counter.kind]||0,expected,label+': independently staged entry amount');assert.equal(source.counters[counter.kind]||0,expected);
 }
 return 6;
}
