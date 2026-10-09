'use strict';
((M)=>{
 const G=M.Game.prototype;
 const pending=g=>g._oracleTurnEndedV80?.turn===g.turnNo;
 M.OracleTurnEndV80={pending};

 // The resolving object has already been popped from stack. Include it
 // explicitly, and do not counter any of the exiled spells or abilities.
 G.endTurnV80=async function({source=null,player=null}={}){
  this._oracleTurnEndedV80={turn:this.turnNo,source,player};
  this._oracleEndedTurnNumberV80=this.turnNo;
  // Abilities waiting before the end-turn process cease to exist. Abilities
  // triggered by the process itself will wait for the cleanup priority window.
  this.pendingTriggers.length=0;
  const objects=[...this.stack,this.c1516Resolving].filter(Boolean);
  this.stack.length=0;
  const cards=new Set(objects.filter(o=>o.kind==='spell'&&!o.isCopy&&o.card?.zone==='stack').map(o=>o.card));
  for(const object of objects)object.exiledByTurnEndV80=true;
  for(const card of cards)if(card.zone==='stack')await this.move(card,'exile');
  for(const card of this.battlefield){
   this.removeFromCombat(card);
   card.attacking=null;card.blocking=null;card.blockedBy=[];card.wasBlocked=false;
   delete card.meta._dealtFirstStrike;
  }
  this.combat=null;
  this._additionalPhases=[];this._extraCombats=0;this.wlmNextCombat=null;
  this.delayed=this.delayed.filter(e=>e.expires!=='combat');
  this.untilEffects=this.untilEffects.filter(e=>e.expires!=='combat');
  this.recalc();
  this.emptyPool();
  this.note('stack',{});
  this.lg('The turn ends. Proceed directly to cleanup.','turn');
 };

 // Triggers created during the process wait for cleanup. The ordinary
 // resolving-depth guard continues to protect the rest of a spell.
 const flush=G.flushTriggers;
 G.flushTriggers=function(...args){return pending(this)?Promise.resolve(0):flush.apply(this,args);};
 const priority=G.priorityRound;
 G.priorityRound=async function(...args){
  const result=await priority.apply(this,args);
  if(pending(this)&&this._oracleTurnFrameV80&&!this._stackResolutionDepth)throw this._oracleTurnFrameV80;
  return result;
 };
 const additional=G.runAdditionalPhases;
 G.runAdditionalPhases=function(...args){
  return this._oracleEndedTurnNumberV80===this.turnNo?Promise.resolve():additional.apply(this,args);
 };

 const cleanup=G.runCleanupPhaseV80;
 G.runCleanupPhaseV80=async function(player){
  // Ending a turn in a cleanup priority window starts another cleanup step.
  for(;;){
   const forced=pending(this);
   delete this._oracleTurnEndedV80;
   this.step='';
   try{return await cleanup.call(this,player,{forced});}
   catch(error){if(!this._oracleTurnFrameV80||error!==this._oracleTurnFrameV80)throw error;}
   if(this.gameOver)return;
  }
 };
 const turn=G.runTurn;
 G.runTurn=async function(...args){
  const frame={player:this.turnPlayer},previous=this._oracleTurnFrameV80;
  this._oracleTurnFrameV80=frame;
  delete this._oracleTurnEndedV80;delete this._oracleEndedTurnNumberV80;
  try{return await turn.apply(this,args);}
  finally{
   this._oracleTurnFrameV80=previous;
   delete this._oracleTurnEndedV80;delete this._oracleEndedTurnNumberV80;
  }
 };
})(globalThis.MTG);
