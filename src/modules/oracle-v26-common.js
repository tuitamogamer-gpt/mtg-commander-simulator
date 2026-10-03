'use strict';
((M)=>{
 // CR 707.2: the form chosen as an object enters or turns face up is
 // copiable. Keep it in layer 1 definitions, including an active copy layer.
 const applyForm=(game,source,row)=>{
  const base=source.def,state=source.meta.oracleCopyState;
  const original=source.meta.characteristicOriginalDef||base;
  source.meta.oracleEntryFormV26 ||= {version:source.zoneVersion,original};
  source.meta.characteristicOriginalDef ||= original;
  const changed={...base,power:String(row.power),toughness:String(row.toughness),
   kws:[...new Set([...(base.kws||[]),...row.keywords])],
   subtypes:[...new Set([...(base.subtypes||[]),...(row.addSubtypes||[])])]};
  delete changed.cdaPower;delete changed.cdaToughness;delete changed.oracleCharacteristicPT;
  if(state?.zoneVersion===source.zoneVersion){
   const layers=game.untilEffects.filter(effect=>effect.oracleCopyLayer&&effect.iid===source.iid&&effect.zoneVersion===source.zoneVersion);
   const latest=layers.sort((a,b)=>b.timestamp-a.timestamp)[0];
   if(latest)latest.definition=changed;else state.base=changed;
  }else if(source.isCopyOf)source.isCopyOf=changed;
  source.def=changed;
 };
 M.OracleV26Common={
  captureForm(source){
   const record=source.meta.oracleEntryFormV26;
   if(source.zone!=='battlefield'||record?.version!==source.zoneVersion)return null;
   const def=source.faceDown?source.meta.faceDownDef:source.def;
   const form=def.oracleImplementation?.find(op=>op.kind==='entry-form-v26');
   if(!form?.options.some(option=>option.power===Number(def.power)&&option.toughness===Number(def.toughness)))return null;
   return {power:Number(def.power),toughness:Number(def.toughness),keywords:(def.kws||[]).slice(),addSubtypes:(def.subtypes||[]).slice()};
  },
  restoreForm(game,source,row){
   const base=source.faceDown?source.meta.faceDownDef:source.def;
   const form=base.oracleImplementation?.find(op=>op.kind==='entry-form-v26');
   const allowedKeywords=new Set([...(base.kws||[]),...(form?.options||[]).flatMap(option=>option.keywords)]);
   const allowedSubtypes=new Set([...(base.subtypes||[]),...(form?.options||[]).flatMap(option=>option.addSubtypes||[])]);
   if(source.zone!=='battlefield'||!form||!form.options.some(option=>option.power===row.power&&option.toughness===row.toughness)||
    !Array.isArray(row.keywords)||row.keywords.length>32||row.keywords.some(word=>!allowedKeywords.has(word))||
    !Array.isArray(row.addSubtypes)||row.addSubtypes.length>64||row.addSubtypes.some(word=>!allowedSubtypes.has(word)))throw Error('Invalid saved entry form');
   delete source.meta.characteristicOriginalDef;delete source.meta.oracleEntryFormV26;
   const faceDown=source.def;source.def=base;applyForm(game,source,row);
   if(source.faceDown){source.meta.faceDownDef=source.def;source.def=faceDown;}
  },
 };
 const recalculate=M.OracleV8Copies.recalculate;
 M.OracleV8Copies.recalculate=game=>{
  recalculate(game);
  for(const source of game.battlefield){const form=source.meta.oracleEntryFormV26;
   if(source.zone==='battlefield'&&form?.version===source.zoneVersion)source.meta.characteristicOriginalDef ||= form.original;
  }
 };
 const count=(game,source,player,node)=>{
  if(node.kind!=='common-count-v26')return undefined;
  if(node.test==='entry-life'){const row=source.meta.oracleEntryLifeV26;return row?.version===source.zoneVersion?row.n:0;}
  if(node.test==='twenty-minus-highest-life')return 20-Math.max(...game.alivePlayers().map(p=>p.life));
  if(node.test==='half-opponent-life')return Math.ceil(Math.max(0,...game.alivePlayers().filter(p=>p!==player).map(p=>p.life))/2);
  throw Error('Unknown v26 common count');
 };
 M.OracleV20.handlers.push({commonV26:true,count,compile(op,script,entry,h){
  if(op.kind==='characteristic-pt'&&op.count?.kind==='common-count-v26'){
   script.oracleCharacteristicPT=true;const value=(game,card)=>count(game,card,card.zone==='battlefield'?card.ctrl:card.owner,op.count);
   if(op.power)script.cdaPower=value;if(op.toughness)script.cdaToughness=value;return true;
  }
  if(op.kind==='entry-life-v26'){
   const prior=script.asEnters;script.asEnters=async(game,source)=>{
    if(prior)await prior(game,source);const player=source.ctrl;
    const cap=op.whiteCap?game.bf().filter(card=>card.ctrl!==player&&!card.ctrl.lost&&!card.isToken&&card.colors.includes('W')).length+game.alivePlayers().filter(p=>p!==player).flatMap(p=>p.graveyard).filter(card=>card.colors.includes('W')).length:player.life;
    const capValue=Math.max(0,Math.min(player.life,cap)),max=game.canPayLife(player,capValue)?capValue:0;
    const answer=await player.controller.decide(game,{type:'chooseX',min:0,max,preferredXValues:[0,1,3,5,8,10,max],prompt:source.name+': pay any amount of life',aiHint:{kind:'entryLifePT',source,max}}),n=Number(answer);
    if(!Number.isSafeInteger(n)||n<0||n>max||!game.canPayLife(player,n))throw Error('Invalid entry-life payment');
    if(n)await game.loseLife(player,n,source.name+' entry cost');source.meta.oracleEntryLifeV26={version:source.zoneVersion,n};
   };return true;
  }
  if(op.kind==='entry-form-v26'){
   const chooseForm=async(game,source)=>{
    let index;
    if(op.coin)index=(await game.flipCoin(source.ctrl,{source,headsOnly:true})).heads?0:1;
    else{const answer=await source.ctrl.controller.decide(game,{type:'chooseOption',prompt:source.name+': choose its form',options:op.options.map((row,i)=>({key:String(i),label:row.power+'/'+row.toughness+(row.keywords.length?' '+row.keywords.join(', '):'')})),aiHint:{kind:'entryForm',source,forms:op.options}});index=Number(answer);if(!Number.isSafeInteger(index)||String(index)!==String(answer)||!op.options[index])throw Error('Invalid entry form');}
    applyForm(game,source,op.options[index]);
   };const prior=script.asEnters;script.asEnters=async(game,source)=>{if(prior)await prior(game,source);await chooseForm(game,source);};
   if(op.faceUp){const before=script.asTurnFaceUp;script.asTurnFaceUp=async(game,source)=>{if(before)await before(game,source);await chooseForm(game,source);};}return true;
  }
  return false;
 }});
})(MTG);
