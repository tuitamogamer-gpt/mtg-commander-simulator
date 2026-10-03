'use strict';
((M)=>{
 const chosen=source=>source.meta.oracleEntryNumberV27?.version===source.zoneVersion?source.meta.oracleEntryNumberV27.n:null;
 M.OracleV20.handlers.push({commonV27:true,compile(op,script,entry,h){
  if(op.kind==='entry-number-v27'){
   const prior=script.asEnters;script.asEnters=async(game,source)=>{
    if(prior)await prior(game,source);
    const result=await source.ctrl.controller.decide(game,{type:'chooseX',min:op.min,max:op.max,preferredXValues:[1,2,3,4,5,6,7,8,9,10],prompt:source.name+': choose a number',aiHint:{kind:'entryNumber',source,min:op.min,max:op.max}}),n=Number(result);
    if(!Number.isSafeInteger(n)||n<op.min||n>op.max)throw Error('Invalid chosen entry number');
    source.meta.oracleEntryNumberV27={version:source.zoneVersion,n};
   };return true;
  }
  if(op.kind==='chosen-number-casting-ban-v27'){
   (script.oracleCastingProhibitionsV9 ||= []).push({players:'all',quality:'all',matchesV12:(game,source,player,card,opts)=>{
    const n=chosen(source);return n!==null&&!game.castHasType(card,opts,'Creature')&&game.stackSpellManaValue({card,castOpts:opts,x:opts.xVal||0})===n;
   }});return true;
  }
  if(op.kind==='number-cast-trigger-v27'){
   h.triggers.push({on:'cast',filter:(game,source,data)=>{
    const n=chosen(source);return n!==null&&data.player!==source.ctrl&&(data.mv===n||data.isCreature&&(data.card.power===n||data.card.toughness===n));
   },run:async ctx=>{await ctx.g.loseLife(ctx.data.player,2,ctx.src.name);await ctx.g.draw(ctx.you,1);}});return true;
  }
  if(op.kind==='number-attack-trigger-v27'){
   const captures=new WeakMap(),matches=row=>row.attackers.some(({card,version})=>{
    const value=card.zone==='battlefield'&&card.zoneVersion===version?card:card.battlefieldLKI?.get(version);
    return value&&(value.power===row.n||value.toughness===row.n);
   });
   const trigger=h.compileGenericTrigger({kind:'generic-trigger',event:'attackedPlayer',effects:[{action:'damage',n:{kind:'source-stat',stat:'power'},target:'combat-defender-v9'}]}),filter=trigger.filter,run=trigger.run;
   trigger.filter=(game,source,data)=>{
    const n=chosen(source);if(n===null||!(data.defender instanceof M.Player)||data.defender===source.ctrl||data.defender.lost)return false;
    const row={n,attackers:(data.attackers||[]).map(card=>({card,version:card.zoneVersion}))};
    if(!matches(row)||!filter(game,source,data))return false;
    if(!captures.has(data))captures.set(data,new Map());captures.get(data).set(source.iid,row);return true;
   };
   trigger.run=async ctx=>{const row=captures.get(ctx.data)?.get(ctx.src.iid);if(row&&matches(row))await run(ctx);};
   h.triggers.push(trigger);return true;
  }
  return false;
 }});
})(MTG);
