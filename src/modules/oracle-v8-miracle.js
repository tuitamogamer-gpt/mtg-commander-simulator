(function(){
 'use strict';const M=globalThis.MTG,frames=new WeakMap();
 function install(script,operation){
  if(operation.kind!=='mechanic-miracle-v8'||operation.contract!=='mechanic-miracle-v8'||!/^(?:\{(?:[0-9]+|[WUBRGCX])\})+$/.test(operation.cost)||Object.keys(operation).some(key=>!['kind','contract','cost'].includes(key)))throw Error('Invalid Miracle');
  script.miracle=operation.cost;script.oracleMiracle=true;
 }
 function cardFor(game,record){const card=game.byIid(record.iid);return card&&card.zone==='hand'&&card.zoneVersion===record.version&&card.owner.idx===record.owner&&card.owner.hand.includes(card)?card:null;}
 function allowed(game,player,card,options){
  const frame=frames.get(game);return !!frame&&frame.player===player&&cardFor(game,frame.record)===card&&
   options.miracle===true&&options.altCostStr===frame.record.cost&&options.speed==='instant'&&(options.from||card.zone)==='hand'&&
   Object.keys(options).every(key=>['miracle','altCostStr','speed','from','xVal'].includes(key));
 }
 function canPay(game,player,card,cost){
  const alt={altCostStr:cost,speed:'instant',miracle:true};
  return game.canCastTiming(player,card,alt)&&(!card.def.castCond||card.def.castCond(game,player,card))&&
   game.canPayMana(player,game.spellCost(player,card,alt),{card,castOpts:alt,xVal:0})&&
   (game.spellTargetSpecs(card,alt,player)||[]).every(spec=>spec.upTo||game.legalTargets(spec,card,player).length>=(spec.min??spec.count??1));
 }
 async function onDraw(game,player,card){
  if(game.turnNo<=0||player.turnState.drewThisTurn!==1||!card.def.oracleMiracle)return;
  const record={iid:card.iid,version:card.zoneVersion,owner:player.idx,cost:card.def.miracle};
  const choice=await player.controller.decide(game,{type:'chooseOption',prompt:`Reveal ${card.name} for Miracle ${record.cost}?`,
   options:[{key:'yes',label:`Reveal ${card.name}`},{key:'no',label:'Keep private'}],aiHint:{kind:'oracleMiracleReveal',card,cost:record.cost,affordable:canPay(game,player,card,record.cost)}});
  if(choice!=='yes'||cardFor(game,record)!==card)return;
  await game.revealToHuman({cards:[card],ctrl:player,kind:'reveal'});
  game.queueTrigger({src:card,ctrl:player,name:`Miracle ${record.cost}`,data:{oracleMiracle:record},run:async ctx=>{
   const record=ctx.data.oracleMiracle,source=cardFor(ctx.g,record);if(!source)return;
   const previous=frames.get(ctx.g);frames.set(ctx.g,{player:ctx.you,record});
   try{
    const decision=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:`Cast ${source.name} for Miracle ${record.cost}?`,
     options:[{key:'yes',label:`Cast for ${record.cost}`},{key:'no',label:'Keep in hand'}],aiHint:{kind:'oracleMiracleCast',card:source,cost:record.cost,affordable:canPay(ctx.g,ctx.you,source,record.cost)}});
    if(decision==='yes')ctx.oracleMiracleCast=await ctx.g.castSpell(ctx.you,source,{from:'hand',alt:{miracle:true,altCostStr:record.cost,speed:'instant'}});
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
