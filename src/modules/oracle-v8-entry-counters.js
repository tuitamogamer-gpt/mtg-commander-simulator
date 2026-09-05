((M)=>{
 const kinds=new Set(['+1/+1','-1/-1','divinity','indestructible','lifelink','deathtouch','menace','crystal','charge']);
 const cast=card=>card.castMeta?.wasCast?card.castMeta:null;
 function manaColors(card){return new Set((cast(card)?.paymentColors||[]).filter(color=>'WUBRG'.includes(color))).size;}
 function value(game,card,node){
  if(Number.isSafeInteger(node)&&node>=0)return node;
  const player=card.ctrl,history=cast(card),bf=game.bf(),others=bf.filter(c=>c!==card&&c.ctrl===player&&c.is('Creature'));let n;
  switch(node.value){
   case'mana-colors':n=manaColors(card);break;
   case'mana-spent':n=history?.manaSpent||0;break;
   case'convoked':n=history?.convokedCount||0;break;
   case'other-spells':n=game.players.reduce((sum,p)=>sum+p.turnState.spellsCast,0)-(history?1:0);break;
   case'opponent-life-lost':n=game.players.filter(p=>p!==player&&!p.lost).reduce((sum,p)=>sum+p.turnState.lifeLost,0);break;
   case'other-creature-plus-counters':n=others.reduce((sum,c)=>sum+(c.counters['+1/+1']||0),0);break;
   case'other-creatures':n=others.length;break;
   case'graveyard-mana-costs':n=new Set(player.graveyard.filter(c=>!c.is('Land')&&c.def.cost).map(c=>(c.def.cost.match(/\{[^}]+\}/g)||[]).sort().join(''))).size;break;
   default:throw new Error('Unknown entry counter value');
  }
  return Math.max(0,n*(node.multiply??1)+(node.add??0));
 }
 function condition(game,card,kind){
  const history=cast(card),player=card.ctrl;
  if(!kind)return true;
  if(kind==='cast-from-your-hand')return history?.from==='hand'&&history.castBy===player.idx;
  if(kind==='at-most-one-mana-color')return manaColors(card)<=1;
  if(kind==='no-other-red-spell')return player.turnState.spellsCastList.filter(row=>row.colors.includes('R')).length-(history?.castBy===player.idx&&history.spellColors.includes('R')?1:0)<=0;
  if(kind==='five-untapped-lands')return game.bf().filter(c=>c!==card&&c.ctrl===player&&c.is('Land')&&!c.tapped).length>=5;
  throw new Error('Unknown entry counter condition');
 }
 async function prepare(game,card,kind){
  if(kind==='choose-opponent'){
   const choices=game.players.filter(p=>p!==card.ctrl&&!p.lost).map(player=>({player,n:game.bf().filter(c=>c.ctrl===player&&c.is('Creature')).length})).sort((a,b)=>a.n-b.n||a.player.idx-b.player.idx);
   if(!choices.length)return 0;
   const answer=await card.ctrl.controller.decide(game,{type:'chooseOption',prompt:'Choose an opponent for '+card.name,options:choices.map(row=>({key:String(row.player.idx),label:row.player.name+' ('+row.n+' creatures)'})),aiHint:{kind:'entryCounterOpponent',source:card}});
   const choice=choices.find(row=>String(row.player.idx)===String(answer));if(!choice)throw new Error('Invalid entry opponent choice');return choice.n;
  }
  if(kind==='reveal-artifacts'){
   const from=card.ctrl.hand.filter(c=>c!==card&&c.is('Artifact'));if(!from.length)return 0;
   const chosen=await card.ctrl.controller.decide(game,{type:'chooseCards',from,min:0,max:from.length,prompt:'Reveal any number of artifact cards for '+card.name,aiHint:{kind:'bestCard',source:card}});
   if(!Array.isArray(chosen)||new Set(chosen).size!==chosen.length||chosen.some(c=>!from.includes(c)))throw new Error('Invalid entry reveal choice');
   if(chosen.length)await game.revealToHuman({cards:chosen,ctrl:card.ctrl,kind:'reveal'});return chosen.length;
  }
  if(kind==='remove-all-counters'){
   let n=0;for(const target of game.bf())for(const [kind,amount]of Object.entries(target.counters)){if(amount<=0)continue;game.removeCounters(target,kind,amount);n+=amount-(target.counters[kind]||0);}return n;
  }
  if(kind)throw new Error('Unsupported entry preparation');return 0;
 }
 async function counters(game,card,operations){
  const result={};
  for(const operation of operations){
   if(!condition(game,card,operation.condition))continue;
   const prepared=await prepare(game,card,operation.prepare);
   if(operation.choice){
    const available=operation.choice.kinds.slice();
    for(let i=0;i<operation.choice.count;i++){
     const choice=await card.ctrl.controller.decide(game,{type:'chooseOption',prompt:'Choose a counter for '+card.name,options:available.map(kind=>({key:kind,label:kind[0].toUpperCase()+kind.slice(1)})),aiHint:{kind:'keywordCounter',source:card}});
     if(!available.includes(choice))throw new Error('Invalid entry keyword counter choice');
     result[choice]=(result[choice]||0)+1;available.splice(available.indexOf(choice),1);
    }
   }else for(const counter of operation.counters){if(!kinds.has(counter.kind))throw new Error('Unsupported entry counter kind');const n=counter.n?.value==='prepared-count'?prepared:value(game,card,counter.n);if(n>0)result[counter.kind]=(result[counter.kind]||0)+n;}
  }
  return result;
 }
 function compile(operation){
  if(operation.kind==='entry-counter-bonus-v8'){
   const pair={'angel':'angels-controlled','creature':'lands-entered','vehicle-or-creature':'mana-value-four'};
   if(operation.contract!=='entry-counter-replacement'||Object.keys(operation).some(key=>!['kind','filter','amount','other','contract'].includes(key))||!Object.hasOwn(pair,operation.filter)||pair[operation.filter]!==operation.amount||operation.other!==(operation.filter!=='creature'))throw new Error('Invalid entry counter bonus descriptor');
   return operation;
  }
  const fields=['kind','condition','counters','choice','prepare','contract'];
  const conditions=['cast-from-your-hand','at-most-one-mana-color','no-other-red-spell','five-untapped-lands'];
  const values=['prepared-count','mana-colors','mana-spent','convoked','other-spells','opponent-life-lost','other-creature-plus-counters','other-creatures','graveyard-mana-costs'];
  if(operation.kind!=='entry-counters-v8'||operation.contract!=='entry-counter-replacement'||Object.keys(operation).some(key=>!fields.includes(key))||operation.condition&&!conditions.includes(operation.condition)||!!operation.counters===!!operation.choice)throw new Error('Unknown entry counter descriptor');
  if(operation.prepare&&!['choose-opponent','reveal-artifacts','remove-all-counters'].includes(operation.prepare))throw new Error('Unsupported entry preparation');
  if(operation.counters&&(!Array.isArray(operation.counters)||!operation.counters.length||operation.counters.some(counter=>Object.keys(counter).some(key=>!['kind','n'].includes(key))||!kinds.has(counter.kind)||!(Number.isSafeInteger(counter.n)&&counter.n>=0||counter.n&&values.includes(counter.n.value)&&Object.keys(counter.n).every(key=>['value','add','multiply'].includes(key))&&['add','multiply'].every(key=>counter.n[key]===undefined||Number.isSafeInteger(counter.n[key])&&counter.n[key]>=0)))))throw new Error('Invalid entry counter amount');
  const prepared=operation.counters?.filter(counter=>counter.n?.value==='prepared-count')||[];
  if (operation.prepare ? operation.condition||operation.choice||operation.counters.length!==1||prepared.length!==1||Object.keys(prepared[0].n).length!==1||prepared[0].kind!==(operation.prepare==='choose-opponent'?'-1/-1':'+1/+1') : prepared.length) throw new Error('Invalid prepared entry counter descriptor');
  const choice=operation.choice;if(choice&&(Object.keys(choice).some(key=>!['count','kinds'].includes(key))||!Number.isSafeInteger(choice.count)||choice.count<1||!Array.isArray(choice.kinds)||choice.count>choice.kinds.length||new Set(choice.kinds).size!==choice.kinds.length||choice.kinds.some(kind=>!['menace','deathtouch','lifelink'].includes(kind))))throw new Error('Invalid entry counter choice');
  return operation;
 }
 function bonuses(game,card){
  const battlefield=game.bf();let total=0;
  for(const source of battlefield){
   if(source.ctrl!==card.ctrl||source.cur?.abilitiesDisabled)continue;
   for(const operation of source.def.oracleEntryBonuses||[]){
    if(operation.other&&source===card)continue;
    if(!(operation.filter==='angel'?card.hasSub('Angel'):operation.filter==='creature'?card.is('Creature'):card.is('Creature')||card.hasSub('Vehicle')))continue;
    total+=operation.amount==='angels-controlled'?battlefield.filter(other=>other.ctrl===card.ctrl&&other.hasSub('Angel')).length:operation.amount==='lands-entered'?(game._entryLandsEnteredSnapshot?.[card.ctrl.idx]??card.ctrl.turnState.landsEntered):card.mv<=4?1:3;
   }
  }
  return total;
 }
 M.OracleV8EntryCounters={counters,value,condition,compile,bonuses};
})(globalThis.MTG||={});
