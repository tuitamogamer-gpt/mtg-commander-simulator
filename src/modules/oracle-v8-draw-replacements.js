((M)=>{
 const staticShapes={multiply:['n','exceptFirst'],redirect:['opponents','exceptFirst'],skip:['optional'],'win-empty':[],'empty-hand':['n','loseLife'],'look-three':['rest'],'reveal-creatures':[],impulse:['n'],study:['optional'],abundance:['optional']};
 function compile(operation){
  const allowed=Object.hasOwn(staticShapes,operation.mode)?staticShapes[operation.mode]:null;
  if(operation.kind!=='draw-replacement-v8'||operation.contract!=='ordered-draw-replacement'||!allowed||Object.keys(operation).some(key=>!['kind','mode','contract',...allowed].includes(key)))throw new Error('Invalid draw replacement descriptor');
  if(operation.mode==='multiply'&&(operation.n!==2||operation.exceptFirst!==undefined&&operation.exceptFirst!==true)||operation.mode==='redirect'&&(operation.opponents!==true||operation.exceptFirst!==true)||['skip','study'].includes(operation.mode)&&operation.optional!==true||operation.mode==='empty-hand'&&(operation.n!==2||operation.loseLife!==1)||operation.mode==='look-three'&&!['bottom','graveyard'].includes(operation.rest)||operation.mode==='impulse'&&operation.n!==2)throw new Error('Invalid draw replacement outcome');
  return operation;
 }
 const firstDraw=(game,p)=>game.phase==='draw'&&game.turnPlayer===p&&!p.turnState._firstDrawDone;
 function candidates(game,p,used){
  const rows=[];const add=(key,source,operation,extra={})=>{if(!used.has(key))rows.push({key,src:source,label:source?.name||'Draw replacement',operation,...extra});};
  for(const card of game.bf()){
   if(card.cur?.abilitiesDisabled)continue;
   if(card.ctrl===p&&card.def.cdkTombs&&!p.library.length)add('tombs:'+card.iid+':'+card.zoneVersion,card,{mode:'cdk-tombs'});
   if(card.ctrl===p&&card.def.drawDouble&&!firstDraw(game,p))add('double:'+card.iid+':'+card.zoneVersion,card,{mode:'multiply',n:2});
   if(card.ctrl===p&&card.def.drawWhileEmptyExtra&&!p.hand.length)add('empty:'+card.iid+':'+card.zoneVersion,card,{mode:'empty-hand',n:2});
   for(const [index,operation]of(card.def.oracleDrawReplacements||[]).entries()){
    if(operation.opponents?card.ctrl===p:card.ctrl!==p)continue;
    if(operation.exceptFirst&&firstDraw(game,p)||operation.mode==='empty-hand'&&p.hand.length||operation.mode==='win-empty'&&p.library.length)continue;
    add('source:'+card.iid+':'+card.zoneVersion+':'+index,card,operation,{controller:card.ctrl});
   }
  }
  for(const effect of game.untilEffects)if(effect.kind==='oracleDrawReplacement'&&effect.playerSeat===p.idx&&!effect.consumed)add(effect,effect.sourceCard,effect,{controller:game.players[effect.controllerSeat],temporary:effect});
  for(const card of p.graveyard){const n=Number(card.def.dredge?.n??card.def.dredge);if(n>0&&p.library.length>=n)add('dredge:'+card.iid+':'+card.zoneVersion,card,{mode:'dredge',n,optional:true});}
  return rows;
 }
 async function optional(game,p,row){
  if(row.operation.mode==='dredge'){
   const answer=await p.controller.decide(game,{type:'chooseOption',prompt:'Replace this draw with dredge?',options:[{key:'draw',label:'Draw a card'},{key:'dredge:'+row.src.iid,label:'Dredge '+row.operation.n+' — '+row.src.name,card:row.src}],aiHint:{kind:'dredge',player:p,cards:[row.src]}});
   if(!['draw','dredge:'+row.src.iid].includes(answer))throw new Error('Invalid dredge choice');return answer!=='draw';
  }
  const answer=await p.controller.decide(game,{type:'chooseOption',prompt:row.src.name+': replace this draw?',options:[{key:'yes',label:row.operation.mode==='abundance'?'Choose land or nonland':row.operation.mode==='study'?'Add a study counter':'Skip this draw'},{key:'no',label:'Draw a card'}],aiHint:{kind:'drawReplacementOptional',mode:row.operation.mode,source:row.src}});
  if(!['yes','no'].includes(answer))throw new Error('Invalid optional draw replacement choice');return answer==='yes';
 }
 async function selectedCards(game,p,from,prompt){
  if(!from.length)return [];
  const chosen=await p.controller.decide(game,{type:'chooseCards',from,min:1,max:1,prompt,aiHint:{kind:'bestCard'}});
  if(!Array.isArray(chosen)||chosen.length!==1||!from.includes(chosen[0]))throw new Error('Invalid draw replacement card choice');return chosen;
 }
 async function bottom(game,p,cards){
  if(!cards.length)return;
  const answer=cards.length>1?await p.controller.decide(game,{type:'scry',cards,player:p,prompt:'Order these cards on the bottom of your library'}):{top:cards,bottom:[]};
  const ordered=[...(answer?.top||[]),...(answer?.bottom||[])];if(ordered.length!==cards.length||new Set(ordered).size!==cards.length||ordered.some(card=>!cards.includes(card)))throw new Error('Invalid draw replacement bottom order');
  for(const card of ordered)await game.move(card,'library',{toBottom:true});
 }
 async function unit(game,p,srcCard,opts,used,physicalDraw,root){
  if(p.lost||game.gameOver)return 0;
  const choices=candidates(game,p,used);if(!choices.length)return await physicalDraw(p,srcCard,opts)?Number(p===root):0;
  const row=await game.chooseReplacement(p,choices,'draw',1),nextUsed=new Set(used);nextUsed.add(row.key);
  if(row.operation.optional&&!await optional(game,p,row))return unit(game,p,srcCard,opts,nextUsed,physicalDraw,root);
  const {operation:op,src,controller}=row;if(row.temporary&&!op.allTurn)row.temporary.consumed=true;
  if(op.mode==='multiply'||op.mode==='empty-hand'){
   const n=await group(game,p,op.n,srcCard,opts,nextUsed,physicalDraw,root);
   if(op.loseLife&&!p.lost)await game.loseLife(p,op.loseLife,src);return n;
  }
  if(op.mode==='redirect')return controller&&!controller.lost?unit(game,controller,srcCard,opts,nextUsed,physicalDraw,root):0;
  if(op.mode==='cdk-tombs'){const pool=p.graveyard.filter(c=>c.is('Creature'));if(pool.length){const[c]=await selectedCards(game,p,pool,'Out of the Tombs: return a creature');await game.putPermanentOntoBattlefield(c,p);}else await game.playerLoses(p,'Out of the Tombs');return 0;}
  if(op.mode==='skip')return 0;
  if(op.mode==='study'){if(src.zone==='battlefield'&&!src.phasedOut)game.addCounters(src,'study',1);return 0;}
  if(op.mode==='win-empty'){for(const opponent of game.players)if(opponent!==p&&!opponent.lost)await game.playerLoses(opponent,src.name);return 0;}
  if(op.mode==='dredge'){
   await game.mill(p,op.n);if(src.zone==='graveyard')await game.move(src,'hand');await game.emit('dredged',{player:p,card:src,amount:op.n,srcCard});return 0;
  }
  if(op.mode==='abundance'){
   const answer=await p.controller.decide(game,{type:'chooseOption',player:p,prompt:src.name+': choose land or nonland',options:[{key:'land',label:'Land'},{key:'nonland',label:'Nonland'}],aiHint:{kind:'abundance',player:p}});
   if(!['land','nonland'].includes(answer))throw Error('Invalid Abundance choice');
   const revealed=[];let found=null;for(const card of p.library.slice().reverse()){revealed.push(card);if(card.is('Land')===(answer==='land')){found=card;break;}}
   if(revealed.length)await game.revealToHuman({cards:revealed,ctrl:p,kind:'reveal'});
   if(found)await game.move(found,'hand');await bottom(game,p,revealed.filter(c=>c!==found));return 0;
  }
  if(op.mode==='look-three'||op.mode==='reveal-creatures'){
   const top=p.library.slice(-3).reverse();
   if(op.mode==='reveal-creatures'&&top.length)await game.revealToHuman({cards:top,ctrl:p,kind:'reveal'});
   const chosen=op.mode==='reveal-creatures'?top.filter(card=>card.is('Creature')):await selectedCards(game,p,top,'Put one of these cards into your hand');
   for(const card of chosen)await game.move(card,'hand');
   const rest=top.filter(card=>!chosen.includes(card));if(op.rest==='graveyard')await game.withGraveyardEntryBatch(async()=>{for(const card of rest)await game.move(card,'graveyard');});else await bottom(game,p,rest);return 0;
  }
  if(op.mode==='impulse'){
   for(const card of p.library.slice(-op.n).reverse()){await game.move(card,'exile');if(card.zone==='exile'){card.meta.playableBy=p;card.meta.playableUntil=game.turnNo;}}
   return 0;
  }
  if(op.mode==='gain-life'){await game.gainLife(p,5,src);return 0;}
  if(op.mode==='bear'){await game.makeTokens({name:'Bear',types:['Creature'],subtypes:['Bear'],power:2,toughness:2,colors:['G']},p,{n:1});return 0;}
  if(op.mode==='discard-opponents'){
   for(const player of game.apnapFrom(game.turnPlayer).filter(player=>player!==p&&!player.lost)){
    if(!player.hand.length)continue;const picked=await player.controller.decide(game,{type:'chooseCards',from:player.hand.slice(),min:1,max:1,prompt:'Discard a card',aiHint:{kind:'cleanupDiscard'}});if(!Array.isArray(picked)||picked.length!==1||!player.hand.includes(picked[0]))throw new Error('Invalid replacement discard');await game.discard(player,picked);
   }return 0;
  }
  if(op.mode==='bounce-each'){
   const selected=[];for(const player of game.apnapFrom(game.turnPlayer).filter(player=>!player.lost)){const from=game.bf().filter(card=>card.ctrl===player);if(!from.length)continue;const chosen=await selectedCards(game,player,from,"Choose a permanent to return to its owner's hand");selected.push({card:chosen[0],version:chosen[0].zoneVersion});}
   for(const {card,version}of selected)if(card.zone==='battlefield'&&!card.phasedOut&&card.zoneVersion===version)await game.move(card,'hand');return 0;
  }
  throw new Error('Unsupported draw replacement mode');
 }
 async function group(game,p,n,source,opts,used,physicalDraw,root){
  // CR 121.2a: replace a multi-card instruction before choosing any
  // single-card draw replacement. Carry used effects into every descendant.
  if(n>1){const choices=game.bf().filter(c=>c.ctrl!==p&&!c.cur.abilitiesDisabled&&c.def.c1719Alms).map(src=>({src,key:'alms:'+src.iid+':'+src.zoneVersion,label:src.name,operation:{mode:'alms'}})).filter(r=>!used.has(r.key));
   if(choices.length){const row=await game.chooseReplacement(p,choices,'draw',n),next=new Set([...used,row.key]);let drawn=0;for(const who of game.apnapFrom(game.turnPlayer||p).filter(w=>w===p||w===row.src.ctrl))drawn+=await unit(game,who,source,opts,new Set(next),physicalDraw,root);return drawn;}
  }
  let drawn=0;for(let i=0;i<n&&!p.lost&&!game.gameOver;i++)drawn+=await unit(game,p,source,opts,new Set(used),physicalDraw,root);return drawn;
 }
 async function draw(game,p,n,source,opts,physicalDraw){
  return group(game,p,n,source,opts,new Set(),physicalDraw,p);
 }
 function run(ctx,effect,h){
  if(effect.action!=='next-draw-replacement-v8'||Object.keys(effect).some(key=>!['action','mode','who','allTurn'].includes(key))||!['redirect','gain-life','discard-opponents','bounce-each','bear'].includes(effect.mode)||(effect.mode==='redirect'?effect.who!==0||effect.allTurn!==true:effect.who!=='you'||effect.allTurn!==undefined))throw new Error('Invalid temporary draw replacement');
  const players=effect.who==='you'?[ctx.you]:h.subjects(ctx,effect.who);
  for(const p of players)ctx.g.untilEffects.push({kind:'oracleDrawReplacement',expires:'eot',mode:effect.mode,allTurn:!!effect.allTurn,playerSeat:p.idx,controllerSeat:ctx.you.idx,sourceCard:ctx.src,sourceVersion:ctx.sourceZoneVersion,consumed:false});
 }
 M.OracleV8DrawReplacements={compile,draw,run};
})(globalThis.MTG||={});
