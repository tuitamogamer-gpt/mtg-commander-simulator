'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.BOM,G=M.Game.prototype;
 const foods=(g,p)=>g.bf().filter(c=>c.ctrl===p&&c.hasSub('Food'));
 const walkers=(g,p)=>g.bf().filter(c=>c.ctrl===p&&c.is('Planeswalker'));
 const gained=p=>p.turnState.lifeGained||0;
 const monarch=ctx=>ctx.g.becomeMonarch(ctx.you);
 const halfling=C.registerToken('lcHalfling',C.token('Halfling',['Halfling'],1,1,['W'],[],{tokenImageName:'LTC Halfling'}));
 const sliver=C.registerToken('lcSliver',C.token('Sliver',['Sliver'],1,1,[],[],{tokenImageName:'CMM Sliver'}));
 const knight=C.registerToken('lcKnight',C.token('Human Knight',['Human','Knight'],2,2,['R'],['trample','haste'],{tokenImageName:'LTC Human Knight'}));
 const wraith=C.registerToken('lcWraith',C.token('Wraith',['Wraith'],3,3,['B'],['menace'],{tokenImageName:'LTC Wraith'}));
 const flyingAttack=C.attack('An attacking creature gains flying',ctx=>ctx.targets[0]&&M.E.grantUntilEOT(ctx.g,ctx.targets[0],['flying']),{targets:[M.T.creature({filter:(g,c)=>!!c.attacking})]});
 const bird=C.registerToken('lcBird',C.token('Bird',['Bird'],3,3,['W'],['flying'],{tokenImageName:'LTC Bird',triggers:[flyingAttack]}));
 const exileReturn=async(ctx,c,{immediate=false,counters={}}={})=>{
  const version=c.zoneVersion;await ctx.g.move(c,'exile');if(c.zone!=='exile'||c.zoneVersion===version)return;
  if(immediate&&await C.yes(ctx,'Return '+c.name+' now?'))return ctx.g.putPermanentOntoBattlefield(c,c.owner);
  const row=C.row(c);ctx.g.delayed.push({on:'endStep',once:true,src:ctx.src,ctrl:ctx.you,name:'Return '+c.name,run:next=>C.current(row)&&next.g.putPermanentOntoBattlefield(c,c.owner,{additionalCounters:counters,additionalCounterBy:ctx.you})});
 };
 const opponentTargets=(filter=()=>true)=>({what:'permanent',count:3,min:0,upTo:true,filter:(g,c,p)=>c.ctrl!==p&&filter(c),dependentFilter:(g,c,prior)=>!C.flat(prior).some(x=>x.ctrl===c.ctrl)});
 const emit=G.emit;G.emit=async function(name,data){
  if(name==='etb'&&data.card.hasSub('Food'))data.card.ctrl.turnState.lcFoodEntered=true;
  if(name==='damageToPlayer'&&data.combat&&data.src?.name==='Gollum, Obsessed Stalker'){
   data.player.lcGollumDamaged=true;
  }
  if(name==='abilityActivated'&&data.ability?.loyalty!==undefined)data.player.turnState.lcLoyaltyActivated=true;
  return emit.call(this,name,data);
 };
 const canSacrifice=G.canSacrifice;G.canSacrifice=function(c){if(c?.def.lcUnsacrificable&&C.live(c)||this.untilEffects.some(e=>e.kind==='lcNoSacrifice'&&e.iid===c?.iid&&e.version===c.zoneVersion))return false;return canSacrifice.call(this,c);};
 const canBlock=G.canBlock;G.canBlock=function(b,a){if(a.def.lcFeasting&&C.live(a)&&b.power<a.power)return false;return canBlock.call(this,b,a);};
 M.LC={...C,foods,walkers,gained,monarch,halfling,sliver,knight,wraith,bird,flyingAttack,exileReturn,opponentTargets};
})();
