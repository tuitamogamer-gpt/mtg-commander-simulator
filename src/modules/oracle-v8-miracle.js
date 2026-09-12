(function(){
 'use strict';const M=globalThis.MTG,frames=new WeakMap();
 function install(script,operation){
  if(operation.kind!=='mechanic-miracle-v8'||operation.contract!=='mechanic-miracle-v8'||!/^(?:\{(?:[0-9]+|[WUBRGCX])\})+$/.test(operation.cost)||Object.keys(operation).some(key=>!['kind','contract','cost'].includes(key)))throw Error('Invalid Miracle');
  script.miracle=operation.cost;script.oracleMiracle=true;
 }
 function cardFor(game,record){const card=game.byIid(record.iid);return card&&card.zone==='hand'&&card.zoneVersion===record.version&&card.owner.idx===record.owner&&card.owner.hand.includes(card)?card:null;}
 function allowed(game,player,card,options){
  const frame=frames.get(game);return !!frame&&frame.player===player&&cardFor(game,frame.record)===card&&
   options.miracle===true&&options.altCostStr===frame.option.cost&&options.speed==='instant'&&(options.from||card.zone)==='hand'&&
   options.bdfMiracleXReduction===frame.option.xReduction&&options.bdfDoor===frame.option.bdfDoor&&options.bdfGift===frame.option.bdfGift&&
   Object.keys(options).every(key=>['miracle','altCostStr','speed','from','xVal',...(frame.option.xReduction!==undefined?['bdfMiracleXReduction']:[]),...(frame.option.bdfDoor?['bdfDoor']:[]),...(frame.option.bdfGift?['bdfGift']:[])].includes(key));
 }
 function castAlt(option){return {altCostStr:option.cost,speed:'instant',miracle:true,...(option.xReduction!==undefined?{bdfMiracleXReduction:option.xReduction}:{}),...(option.bdfDoor?{bdfDoor:option.bdfDoor}:{}),...(option.bdfGift?{bdfGift:true}:{})};}
 function canPay(game,player,card,option){
  const alt=castAlt(option);
  return game.canCastTiming(player,card,alt)&&(!card.def.castCond||card.def.castCond(game,player,card))&&
   game.canPayMana(player,game.spellCost(player,card,alt),{card,castOpts:alt,xVal:0})&&
   (game.spellTargetSpecs(card,alt,player)||[]).every(spec=>spec.upTo||game.legalTargets(spec,card,player).length>=(spec.min??spec.count??1));
 }
 async function onDraw(game,player,card){
  if(game.turnNo<=0||player.turnState.drewThisTurn!==1)return;
  const options=[...(card.def.oracleMiracle?[{cost:card.def.miracle}]:[]),...(M.BDF?.miracleOptions?.(game,player,card)||[])];
  if(!options.length)return;
  const record={iid:card.iid,version:card.zoneVersion,owner:player.idx,cost:options.map(o=>o.cost).join(' / '),options};
  const choice=await player.controller.decide(game,{type:'chooseOption',prompt:`Reveal ${card.name} for Miracle ${record.cost}?`,
   options:[{key:'yes',label:`Reveal ${card.name}`},{key:'no',label:'Keep private'}],aiHint:{kind:'oracleMiracleReveal',card,cost:record.cost,affordable:options.some(o=>canPay(game,player,card,o))}});
  if(choice!=='yes'||cardFor(game,record)!==card)return;
  await game.revealToHuman({cards:[card],ctrl:player,kind:'reveal'});
  game.queueTrigger({src:card,ctrl:player,name:`Miracle ${record.cost}`,data:{oracleMiracle:record},run:async ctx=>{
   const record=ctx.data.oracleMiracle,source=cardFor(ctx.g,record);if(!source)return;
   let option=record.options[0];
   if(record.options.length>1){const key=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a Miracle cost',options:record.options.map((o,i)=>({key:String(i),label:(source.def.bdfRoom?.find(h=>h.key===o.bdfDoor)?.name||source.name)+' '+o.cost+(o.bdfGift?' with a gift':'')}))});option=record.options[Number(key)];if(!option)return;}
   const previous=frames.get(ctx.g);frames.set(ctx.g,{player:ctx.you,record,option});
   try{
    const decision=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:`Cast ${source.name} for Miracle ${option.cost}?`,
     options:[{key:'yes',label:`Cast for ${option.cost}`},{key:'no',label:'Keep in hand'}],aiHint:{kind:'oracleMiracleCast',card:source,cost:option.cost,affordable:canPay(ctx.g,ctx.you,source,option)}});
    if(decision==='yes')ctx.oracleMiracleCast=await ctx.g.castSpell(ctx.you,source,{from:'hand',alt:castAlt(option)});
   }finally{if(previous)frames.set(ctx.g,previous);else frames.delete(ctx.g);}
  }});
 }
 M.Game.prototype.miracleRevealedCards=function(player=null){
  const records=[...this.pendingTriggers,...(this._placingTriggers||[]),...this.stack].map(row=>row.data?.oracleMiracle||row.ctx?.data?.oracleMiracle).filter(Boolean),active=frames.get(this);
  if(active)records.push(active.record);
  return [...new Set(records.map(record=>cardFor(this,record)).filter(card=>card&&(!player||card.owner===player)))];
 };
 M.OracleV8Miracle={install,onDraw,allowed};
})();
