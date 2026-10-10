// Battle protection, combat destinations and the Siege defeat trigger.
(function(M){
 'use strict';
 const G=M.Game.prototype;
 const battle=c=>c instanceof M.CardInst&&c.is('Battle');
 M.defendingPlayerV92=t=>t?.combatDestinationRemoved?t.defendingPlayer:t instanceof M.Player?t:battle(t)?t.protector:t?.ctrl;
 const live=c=>c?.zone==='battlefield'&&!c.phasedOut;
 async function protector(g,c){
  const choices=g.alivePlayers().filter(p=>p!==c.ctrl);
  if(!choices.length){c.protector=null;return;}
  const key=choices.length===1?String(choices[0].idx):await c.ctrl.controller.decide(g,{type:'chooseOption',options:choices.map(p=>({key:String(p.idx),label:p.name})),prompt:c.name+': choose its protector',aiHint:{kind:'opponent'}});
  const chosen=choices.find(p=>String(p.idx)===String(key));
  if(!chosen)throw Error('Invalid Siege protector');
  c.protector=chosen;
 }
 const pending=(g,c)=>[...g.pendingTriggers,...(g._placingTriggers||[]),...g.stack,...(g.v92SiegeResolving||[])].some(o=>o.siegeDefeatV92?.iid===c.iid&&o.siegeDefeatV92.version===c.zoneVersion);
 M.OracleV92Battles={protector,pending};
 M.OracleV20.handlers.unshift({compile(op,script,entry){
  if(op.kind!=='siege-rules-v92')return false;
  script.siegeV92=true;
  const old=script.asEnters;script.asEnters=async(g,c)=>{if(old)await old(g,c);await protector(g,c);};
  return true;
 }});
 const emit=G.emit;G.emit=async function(event,d,...args){
  const c=d.card;
  if(event==='countersRemoved'&&d.kind==='defense'&&d.before>0&&d.after===0&&live(c)&&c.def.siegeV92&&!c.cur?.abilitiesDisabled){
   const version=c.zoneVersion,ctrl=c.ctrl;
   this.queueTrigger({src:c,ctrl,name:c.name+' — defeated',siegeDefeatV92:{iid:c.iid,version},sourceZoneVersion:version,run:async ctx=>{
    if(!live(c)||c.zoneVersion!==version)return;
    (ctx.g.v92SiegeResolving||=[]).push(ctx.so||{siegeDefeatV92:{iid:c.iid,version}});
    try{
     await ctx.g.move(c,'exile');
     if(c.isToken||c.zone!=='exile'||c.zoneVersion!==version+1||!c.oracleFaces)return;
     await M.OracleV8PlayPermissions.castOne({...ctx,you:ctrl},[c],{free:true,oracleFace:'back'},M.OracleV20.helpers);
    }finally{ctx.g.v92SiegeResolving.pop();}
   }});
  }
  return emit.call(this,event,d,...args);
 };
 const sba=G.performPermanentStateBasedActions;G.performPermanentStateBasedActions=async function(...args){
  for(const c of this.bf().filter(battle))if(!c.protector||c.protector.lost||c.protector===c.ctrl)await protector(this,c);
  return sba.apply(this,args);
 };
})(globalThis.MTG||={});
