((M)=>{
 function apply(script,operation){
  if(operation.kind!=='hand-size-v8')return false;
  if(!['you','opponents','all'].includes(operation.who)||operation.unlimited!==true&&!Number.isSafeInteger(operation.n))throw new Error('Unsupported hand-size rule');
  (script.oracleHandSizeRules||=[]).push(operation);return true;
 }
 function maximum(game,player){
  if(player.lost||player.noMaxHandForever)return Infinity;
  let n=7-(player.maximumHandSizeReductionV64||0);
  for(const source of game.bf()){
   if(source.cur?.abilitiesDisabled)continue;
   if(source.ctrl===player&&(typeof source.def.noMaxHand==='function'?source.def.noMaxHand(game,source):source.def.noMaxHand))return Infinity;
   for(const rule of source.def.oracleHandSizeRules||[]){
    if(rule.activeV20&&!rule.activeV20(game,source))continue;
    if(rule.who==='you'&&source.ctrl!==player||rule.who==='opponents'&&source.ctrl===player)continue;
    if(rule.unlimited)return Infinity;n+=rule.n;
   }
  }
  return Math.max(0,n);
 }
 M.OracleV8HandSize={apply,maximum};
 M.Game.prototype.maximumHandSize=function(player){return maximum(this,player);};
 M.Game.prototype.reduceMaximumHandSizeV64=function(player,n){if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid maximum hand size reduction');player.maximumHandSizeReductionV64=(player.maximumHandSizeReductionV64||0)+n;};
})(globalThis.MTG||={});
