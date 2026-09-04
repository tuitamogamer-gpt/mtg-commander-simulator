((M)=>{
 M.Game.prototype.flipCoin=async function(player,{source=null,headsOnly=false}={}){
  if(!this.players.includes(player)||player.lost)throw new Error('Invalid coin-flip player');
  const call=headsOnly?null:await player.controller.decide(this,{type:'chooseOption',prompt:'Call the coin flip',options:[{key:'heads',label:'Heads'},{key:'tails',label:'Tails'}],aiHint:{kind:'coinCall'}});
  if(!headsOnly&&!['heads','tails'].includes(call))throw new Error('Invalid coin-flip call');
  const heads=this.rnd()<0.5,won=headsOnly?null:(heads?'heads':'tails')===call;
  const result={player,source,heads,call,won};
  this.lg(player.name+' flips '+(heads?'heads':'tails')+(won===null?'':won?' and wins.':' and loses.'),'info');
  this.note('coinFlip',result);await this.emit('coinFlipped',result);return result;
 };
 M.OracleV8Coins={async run(ctx,effect,h){
  const player=h.subjects(ctx,effect.who)[0];if(!(player instanceof M.Player)||player.lost)return;
  let wins=0,result;
  do{result=await ctx.g.flipCoin(player,{source:ctx.src});if(result.won)wins++;await h.run(ctx,result.won?effect.effects:effect.elseEffects);}while(effect.repeat&&result.won);
  await h.run({...ctx,oracleCoinWins:wins},effect.afterEffects||[]);
 }};
})(globalThis.MTG||={});
