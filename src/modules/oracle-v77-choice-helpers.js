'use strict';
((M)=>{
 const H=M.OracleV20.helpers;
 const current=(card,version,zone='battlefield')=>card?.zone===zone&&card.zoneVersion===version&&(zone!=='battlefield'||!card.phasedOut);
 const subjects=(ctx,e)=>H.genericEffectSubjects(ctx,e.target??0);
 const option=async(ctx,player,options,prompt)=>{
  const key=await player.controller.decide(ctx.g,{type:'chooseOption',options,prompt,aiHint:{kind:'optTrigger',src:ctx.src}});
  if(!options.some(row=>row.key===key))throw Error('Invalid v77 choice');
  return key;
 };
 const pick=async(ctx,player,from,min,max,prompt)=>{
  if(!from.length)return [];
  const versions=new Map(from.map(card=>[card,card.zoneVersion]));
  const cards=await player.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt,aiHint:{kind:'bestCard',src:ctx.src}});
  if(!Array.isArray(cards)||cards.length<min||cards.length>max||new Set(cards).size!==cards.length||cards.some(card=>!versions.has(card)||card.zoneVersion!==versions.get(card)))throw Error('Invalid v77 card choice');
  return cards;
 };
 const graveTypes=player=>new Set(player.graveyard.flatMap(card=>card.def.types||[]).map(type=>type==='Tribal'?'Kindred':type)).size;

 async function predicament(ctx){
  const player=ctx.data?.player;
  if(!(player instanceof M.Player)||player.lost||!ctx.you.hand.length)return;
  const [card]=await pick(ctx,ctx.you,ctx.you.hand.slice(),1,1,'Choose a card in your hand');
  if(!card)return;
  const version=card.zoneVersion,greater=card.mv>4;
  // The opponent receives the question, never the hidden chosen card.
  const guess=await option(ctx,player,[{key:'greater',label:'Mana value greater than 4'},{key:'lower',label:'Mana value 4 or less'}],ctx.src.name+': guess the chosen card’s mana value');
  if((guess==='greater')===greater||!current(card,version,'hand')||card.owner!==ctx.you)return;
  await M.OracleV8PlayPermissions.castOne(ctx,[card],{free:true},{target:H.genericTargetSpec});
 }

 async function meddler(ctx,e){
  const g=ctx.g,object=subjects(ctx,e)[0],meddler=ctx.src;
  if(!object||!g.stack.includes(object)||!H.sameBattlefieldSource(ctx))return;
  const source=object.card||object.srcCard,previous=object.targets||object.ctx?.targets||[];
  const specs=object.targetSpecs||object.ctx?.boundTargetSpecs||(object.kind==='spell'?g.spellTargetSpecs(source,object.castOpts,object.ctrl):[]);
  if(!source||!specs.length||specs.length!==previous.length)return;
  const identities=g.cloneTargetIdentities(object.targetIdentities||object.ctx?.targetIdentities||g.captureTargetIdentities(previous));
  const choices=[];let ordinal=0;
  for(const [index,raw] of specs.entries()){
   const group=[previous[index]].flat().filter(Boolean),prefix=previous.slice(0,index);
   const oldIds=Array.isArray(identities[index])?identities[index]:[identities[index]];
   const bound={...(object.ctx||{}),g,src:source,you:object.ctrl,so:object,x:object.x??object.ctx?.x,targets:prefix};
   const spec=raw.bindOracleContext?raw.bindOracleContext(bound):raw;
   for(const [within,old] of group.entries()){
    const key=String(ordinal++);
    if(old?.iid===meddler.iid&&oldIds[within]?.zoneVersion===meddler.zoneVersion||!g.legalTargets(spec,source,object.ctrl).includes(meddler))continue;
    if(spec.dependentFilter&&!spec.dependentFilter(g,meddler,prefix,object.ctrl,source))continue;
    if(spec.differentFromPrevious&&[prefix.at(-1)].flat().includes(meddler)||spec.differentFromAllPrevious&&prefix.flat(Infinity).includes(meddler))continue;
    const proposed=group.map((card,i)=>i===within?meddler:card);
    if(proposed.some((card,i)=>i!==within&&card===meddler)||spec.distinctCtrl&&proposed.some((card,i)=>i!==within&&card.ctrl===meddler.ctrl)||spec.sameGraveyard&&proposed.some(card=>card.owner!==meddler.owner))continue;
    const ids=(Array.isArray(identities[index])?identities[index]:[identities[index]]).slice();ids[within]=g.captureTargetIdentity(meddler);
    if(spec.oracleGroupRetargetV22&&!spec.oracleGroupRetargetV22(g,proposed,ids,group.map((_,i)=>i===within),object.ctrl,source))continue;
    choices.push({key,label:'Change target '+(index+1)+'.'+(within+1)+' ('+(old.name||'target')+')'});
   }
  }
  if(!choices.length)return;
  const key=await option(ctx,ctx.you,[...choices,{key:'no',label:'Keep the targets'}],meddler.name+': change one target to this creature?');
  if(key==='no'||!H.sameBattlefieldSource(ctx)||!g.stack.includes(object))return;
  let cursor=0;
  // Retarget owns the entire target transaction, including retained illegal
  // targets, target identities, divided amounts, target events, and ward.
  const chooser={controller:{decide:async(game,query)=>query.type==='chooseOption'?(String(cursor++)===key?'yes':'no'):ctx.you.controller.decide(game,query)}};
  await M.OracleV20Spells.retarget({...ctx,you:chooser,oracleRetargetV20:{optional:true,force:meddler}},object);
 }

 async function sticktwister(ctx){
  const g=ctx.g,rows=[];
  for(const player of g.apnapFrom(g.turnPlayer||ctx.you).filter(player=>player!==ctx.you)){
   const permanents=g.bf().filter(card=>card.ctrl===player&&!card.is('Land')&&g.canSacrifice(card));
   const options=[{key:'no',label:'Take damage'}];
   if(permanents.length)options.unshift({key:'sacrifice',label:'Sacrifice a nonland permanent'});
   if(player.hand.length)options.unshift({key:'discard',label:'Discard a card'});
   const mode=await option(ctx,player,options,ctx.src.name+': sacrifice, discard, or take damage');
   if(mode==='no'){rows.push({player,mode});continue;}
   const [card]=await pick(ctx,player,mode==='discard'?player.hand.slice():permanents,1,1,mode==='discard'?'Choose a card to discard':'Choose a nonland permanent to sacrifice');
   rows.push({player,mode,card,version:card?.zoneVersion});
  }
  const paid=new Set(),sacrifices=rows.filter(row=>row.mode==='sacrifice'&&current(row.card,row.version)&&row.card.ctrl===row.player&&!row.card.is('Land')&&g.canSacrifice(row.card));
  await g.withGraveyardEntryBatch(async()=>{
   if(sacrifices.length){await g.sacrificeMany(null,sacrifices.map(row=>row.card));for(const row of sacrifices)paid.add(row.player);}
   for(const row of rows)if(row.mode==='discard'&&current(row.card,row.version,'hand')&&row.card.owner===row.player){await g.discard(row.player,[row.card]);paid.add(row.player);}
  });
  const source=H.oracleDamageSource(ctx),n=H.genericAmount({kind:'source-stat',stat:'power'},ctx);
  await g.damageBatch(rows.filter(row=>!paid.has(row.player)&&!row.player.lost).map(row=>({src:source,target:row.player,n})),{deferSBA:true});
 }

 async function wolf(ctx,e){
  const g=ctx.g,p=ctx.you,target=subjects(ctx,e)[0],mana=M.parseCost('{1}{R}');
  if(!target)return;
  const targetVersion=target.zoneVersion;
  const from=p.hand.filter(card=>g.canPayMana(p,mana,null,{protectedSacrifices:[card]}));
  if(!from.length)return;
  const [card]=await pick(ctx,p,from,0,1,'You may pay {1}{R} and discard a card');
  if(!card)return;
  const version=card.zoneVersion,n=card.mv,valid=()=>current(card,version,'hand')&&card.owner===p&&p.hand.includes(card);
  const payment=await g.payMana(p,mana,null,{protectedSacrifices:[card],prepareOnlyV20:true,validateExtraV20:valid});
  if(!payment||!payment.valid()||!valid()||!await payment.commit())return;
  await g.discard(p,[card]);
  if(!current(target,targetVersion))return;
  await H.runGenericEffect(ctx,{action:'damage',target:e.target??0,n});
 }

 function compile(op,script){
  if(op.kind!=='despoiler-entry-v77')return false;
  const previous=script.asEnters,old=script.etbCounters;
  if(old&&old.kind!=='+1/+1')throw Error('Unsupported Despoiler entry counter composition');
  script.asEnters=async(g,card)=>{
   await previous?.(g,card);
   card.meta.despoilerPaymentV77=null;
   if(M.OracleV8AbilityLoss.entryCharacteristics(g,card).abilityLossTimestamp>-Infinity)return;
   const ctx={g,src:card,you:card.ctrl,sourceZoneVersion:card.zoneVersion};
   await M.OracleV8Effects.run(ctx,{action:'resolution-cost',optional:true,payment:{kind:'process-exile',zone:'exile',owner:'opponent',n:2},effects:[]},{sameSource:H.sameBattlefieldSource,subjects:H.genericEffectSubjects,amount:H.genericAmount,target:H.genericTargetSpec,effects:async paid=>{if(paid.oraclePaymentCapture)card.meta.despoilerPaymentV77={version:card.zoneVersion};}});
  };
  script.etbCounters={kind:'+1/+1',n:(g,card)=>(old?(typeof old.n==='function'?old.n(g,card):old.n):0)+(card.meta.despoilerPaymentV77?.version===card.zoneVersion?4:0)};
  return true;
 }

 async function effect(ctx,e){
  switch(e.mode){
   case 'predicament':await predicament(ctx);break;
   case 'meddler':await meddler(ctx,e);break;
   case 'flytrap-double':if(graveTypes(ctx.you)>=6){const cards=subjects(ctx,e).filter(card=>card?.zone==='battlefield'&&!card.phasedOut),amounts=cards.map(card=>card.counters['+1/+1']||0);for(const [i,card] of cards.entries())ctx.g.addCounters(card,'+1/+1',amounts[i],false,ctx.you);}break;
   case 'sticktwister':await sticktwister(ctx);break;
   case 'wolf':await wolf(ctx,e);break;
   case 'archon-prevent':{
    const target=subjects(ctx,e)[0];if(!target)break;
    const destination=target instanceof M.Player?{player:target.idx}:{iid:target.iid,version:target.zoneVersion};
    await H.runGenericEffect(ctx,{action:'damage-rule-v20',mode:'prevent',source:{all:true},recipient:{player:'you'},n:ctx.x||0,rider:{kind:'archon-rider-v77',sourceVersion:ctx.sourceZoneVersion??ctx.src.zoneVersion,destination}});
    break;
   }
   default:return false;
  }
  return true;
 }
 M.OracleV20.handlers.push({async damagePreventionRider(g,source,player,rule,data,attempted,prevented){
  if(rule.kind!=='archon-rider-v77')return false;
  const row=rule.destination,target=row.player!==undefined?g.players[row.player]:g.byIid(row.iid);
  if(target instanceof M.Player?target.lost:!current(target,row.version))return true;
  const src=H.oracleDamageSource({g,src:source,you:player,sourceZoneVersion:rule.sourceVersion});
  await g.damageBatch([{src,target,n:prevented}],{deferSBA:true});return true;
 }});
 M.OracleV77Choices={compile,effect};
})(globalThis.MTG||={});
