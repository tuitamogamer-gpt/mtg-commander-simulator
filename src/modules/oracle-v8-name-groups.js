((M)=>{
 function names(object){
  if(Array.isArray(object?.rulesNames))return object.rulesNames.slice();
  const spell=object?.kind==='spell'&&object.card,card=spell||object,def=spell?object.oracleDefinition||card.def:card?.def||card;
  if(card?.faceDown||def?.rulesNoName)return [];
  if(def?.oracleSplit&&(!spell||object.castOpts?.splitFuse))return def.oracleSplit.faces.map(face=>face.name);
  const name=object?.name;return name?[name]:[];
 }
 const matches=(first,second)=>first.some(name=>second.includes(name));
 function affected(game,you,effect,source,sourceNames=names(source),controller=source.ctrl){
  const pool=effect.zone==='graveyard'?you.graveyard:game.bf();
  const matching=pool.filter(card=>matches(sourceNames,names(card))&&(!effect.sameController||card.ctrl===controller)&&
   (effect.what==='token'?card.isToken:['card','permanent'].includes(effect.what)||card.is(effect.what[0].toUpperCase()+effect.what.slice(1))));
  return [...new Set([...(pool.includes(source)?[source]:[]),...matching])];
 }
 async function run(ctx,effect,h){
  const source=effect.target==='self'?ctx.src:h.subjects(ctx,effect.target)[0];if(!source)return;
  const past=effect.target==='self'&&source.zoneVersion!==ctx.sourceZoneVersion?source.battlefieldLKI?.get(ctx.sourceZoneVersion):null;
  const sourceNames=names(past||source),controller=past?.ctrl||source.ctrl;
  const cards=affected(ctx.g,ctx.you,effect,source,sourceNames,controller);
  if(effect.effect.action==='destroy')await ctx.g.destroyMany(cards,{source:ctx.src});
  else if(effect.effect.action==='exile')await ctx.g.exileMany(cards);
  else if(effect.effect.action==='bounce')await ctx.g.bounceMany(cards);
  else if(effect.effect.action==='reanimate')await ctx.g.withBattlefieldEntryBatch(async()=>{for(const card of cards)await ctx.g.putPermanentOntoBattlefield(card,card.owner,{tapped:!!effect.effect.tapped});});
  else await h.effect({...ctx,targets:[cards]},{...effect.effect,target:0});
 }
 function targetValue(game,you,target,query,score){return target instanceof M.CardInst?affected(game,you,query.aiHint.oracleNameGroup,target).reduce((total,card)=>total+score(card),0):-1000;}
 M.OracleV8NameGroups={run,affected,targetValue,names,matches};
})(globalThis.MTG||={});
