((M)=>{
 function compile(operation){
  if(operation.kind!=='creature-upgrade-entry-v8'||operation.mode!=='tribute'||operation.contract!=='creature-upgrade-status'||!Number.isSafeInteger(operation.n)||operation.n<1||Object.keys(operation).some(key=>!['kind','mode','n','contract'].includes(key)))throw new Error('Invalid creature entry upgrade descriptor');return operation;
 }
 async function entry(game,card){
  const operation=card.def.oracleCreatureEntryUpgrade;if(!operation)return 0;
  const opponents=game.players.filter(player=>player!==card.ctrl&&!player.lost);card.meta.oracleTributePaid=false;if(!opponents.length)return 0;
  const selected=await card.ctrl.controller.decide(game,{type:'chooseOption',prompt:'Choose an opponent for tribute',options:opponents.map(player=>({key:String(player.idx),label:player.name})),aiHint:{kind:'tributeOpponent',source:card,n:operation.n}});
  const opponent=opponents.find(player=>String(player.idx)===String(selected));if(!opponent)throw new Error('Invalid tribute opponent');
  const choice=await opponent.controller.decide(game,{type:'chooseOption',prompt:card.name+': pay tribute?',options:[{key:'yes',label:'Put '+operation.n+' +1/+1 counters on it'},{key:'no',label:'Do not pay tribute'}],aiHint:{kind:'tribute',source:card,n:operation.n}});
  if(!['yes','no'].includes(choice))throw new Error('Invalid tribute choice');card.meta.oracleTributePaid=choice==='yes';return card.meta.oracleTributePaid?operation.n:0;
 }
 function capture(source){return {monstrous:!!source.meta.oracleMonstrous,tributePaid:source.meta.oracleTributePaid};}
 function condition(game,source,condition,player,evidence){
  if(condition.kind!=='creature-upgrade-state-v8'||!['monstrous','tribute-unpaid'].includes(condition.state)||Object.keys(condition).some(key=>!['kind','state'].includes(key)))throw new Error('Invalid creature upgrade condition');
  const status=evidence?.upgradeStatus||capture(source);return condition.state==='monstrous'?status.monstrous:status.tributePaid===false;
 }
 async function run(ctx,effect,h){
  if(effect.action!=='monstrosity-v8'||Object.keys(effect).some(key=>!['action','n'].includes(key))||!(effect.n==='X'||Number.isSafeInteger(effect.n)&&effect.n>=0||effect.n?.kind==='creature-counter-total-v8'&&Object.keys(effect.n).length===1))throw new Error('Invalid monstrosity descriptor');
  const card=ctx.src;if(card.zone!=='battlefield'||card.phasedOut||card.zoneVersion!==ctx.sourceZoneVersion||card.meta.oracleMonstrous)return;
  const n=effect.n?.kind==='creature-counter-total-v8'?ctx.g.bf().filter(card=>card.ctrl===ctx.you&&card.is('Creature')).reduce((sum,card)=>sum+Object.values(card.counters).reduce((n,value)=>n+Math.max(0,Number(value)||0),0),0):h.amount(effect.n,ctx);
  if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid monstrosity amount');
  ctx.g.addCounters(card,'+1/+1',n,false,ctx.you);card.meta.oracleMonstrous=true;card.meta.oracleMonstrosityX=n;ctx.g.recalc();await ctx.g.emit('monstrous',{card,player:ctx.you,n,x:n});
 }
 M.OracleV8CreatureUpgrades={compile,entry,capture,condition,run};
})(globalThis.MTG||={});
