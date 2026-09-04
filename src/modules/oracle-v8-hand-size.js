((M)=>{
 function apply(script,operation){
  if(operation.kind!=='hand-size-v8')return false;
  if(!['you','opponents','all'].includes(operation.who)||operation.unlimited!==true&&!Number.isSafeInteger(operation.n))throw new Error('Unsupported hand-size rule');
  (script.oracleHandSizeRules||=[]).push(operation);return true;
 }
 function maximum(game,player){
  if(player.lost||player.noMaxHandForever)return Infinity;
  let n=7;
  for(const source of game.bf()){
   if(source.cur?.abilitiesDisabled)continue;
   if(source.ctrl===player&&source.def.noMaxHand)return Infinity;
   for(const rule of source.def.oracleHandSizeRules||[]){
    if(rule.who==='you'&&source.ctrl!==player||rule.who==='opponents'&&source.ctrl===player)continue;
    if(rule.unlimited)return Infinity;n+=rule.n;
   }
  }
  return Math.max(0,n);
 }
 M.OracleV8HandSize={apply,maximum};
 M.Game.prototype.maximumHandSize=function(player){return maximum(this,player);};
})(globalThis.MTG||={});
