((M)=>{
 const actions=new Set(['gain-energy-v8','pay-energy-v8']);
 const count=player=>Number(player.counters?.energy)||0;
 function validate(n){if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid energy amount');}
 async function gain(game,player,n,source){
  validate(n);if(!n||player.lost)return 0;
  const before=count(player);validate(before+n);player.counters||={};player.counters.energy=before+n;
  game.lg(player.name+' gets '+n+' energy.');game.note('gameEffect',{kind:'playerCounter',counterKind:'energy',player,amount:n});
  await game.emit('energyGained',{player,n,before,after:player.counters.energy,src:source});return n;
 }
 function spend(game,player,n,source){
  validate(n);const before=count(player);if(player.lost||before<n)return false;
  if(n){player.counters||={};player.counters.energy=before-n;player.turnState.energyPaid=(player.turnState.energyPaid||0)+n;player.turnState.energyLost=(player.turnState.energyLost||0)+n;
   game.lg(player.name+' pays '+n+' energy.');game.note('gameEffect',{kind:'playerCounter',counterKind:'energy',player,amount:-n});
   void game.emit('energySpent',{player,n,before,after:player.counters.energy,src:source});
  }return true;
 }
 async function run(ctx,effect,h){
  if(!actions.has(effect.action))throw new Error('Unsupported energy instruction');
  const n=h.amount(effect.n,ctx);validate(n);
  if(effect.action==='gain-energy-v8')return gain(ctx.g,ctx.you,n,ctx.src);
  let paid=false;
  if(count(ctx.you)>=n){
   let yes=!effect.optional;
   if(effect.optional){const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',player:ctx.you,prompt:'Pay '+n+' energy?',options:[{key:'yes',label:'Pay '+n+' energy'},{key:'no',label:'Decline'}],aiHint:{kind:'optTrigger',src:ctx.src}});if(!['yes','no'].includes(answer))throw new Error('Invalid energy payment choice');yes=answer==='yes';}
   if(yes)paid=spend(ctx.g,ctx.you,n,ctx.src);
  }
  await h.run(ctx,paid?effect.effects:effect.elseEffects||[]);return paid;
 }
 const triggerFilter=filter=>filter?.kind==='energy-gain-v8'?(game,source,data)=>data.player===source.ctrl&&(!filter.duringYourTurn||game.turnPlayer===data.player):null;
 M.OracleV8Energy={actions,count,gain,spend,run,triggerFilter};
})(globalThis.MTG||={});
