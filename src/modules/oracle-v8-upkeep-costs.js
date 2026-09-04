(function(){
 'use strict';const MTG=globalThis.MTG,events=Symbol('oracleUpkeepCostCaptures');let serial=0;
 const identity=card=>({iid:card.iid,version:card.zoneVersion,timestamp:card.timestamp});
 const same=(g,card,id)=>card.iid===id.iid&&card.zoneVersion===id.version&&card.timestamp===id.timestamp&&card.zone==='battlefield'&&g.bf().includes(card);
 const opponents=ctx=>ctx.g.players.filter(player=>player!==ctx.you&&!player.lost);
 const creatures=ctx=>ctx.g.bf().filter(card=>card.ctrl!==ctx.you&&!card.ctrl.lost&&card.is('Creature'));
 const frame=ctx=>({...ctx,so:{x:0},allowSourceSacrifice:true,strictCostChoices:true});
 function scaled(payment,n){
  const cost=payment.cost;
  return {...cost,...(cost.quantity?{quantity:{min:cost.quantity.min*n,max:cost.quantity.max*n}}:{amount:{kind:'number',value:cost.amount.value*n}})};
 }
 function validate(operation){
  if(operation.kind!=='mechanic-upkeep-cost-v8'||operation.contract!=='mechanic-upkeep-cost-v8'||typeof operation.echo!=='boolean'||typeof operation.label!=='string'||!operation.label||Object.keys(operation).some(key=>!['kind','contract','echo','label','payment'].includes(key)))throw new Error('Invalid upkeep payment');
  const p=operation.payment,keys={additional:['kind','cost'],mana:['kind','mana'],'self-counter':['kind','counter'],'opponent-counter':['kind','counter'],'opponent-life':['kind'],'add-mana':['kind','color'],draw:['kind'],'graveyard-bottom':['kind']}[p?.kind];
  if(!keys||Object.keys(p).some(key=>!keys.includes(key))||operation.echo&&p.kind!=='additional')throw new Error('Unsupported upkeep payment');
  if(p.kind==='additional'){
   const c=p.cost;if(!['sacrifice','discard','payLife'].includes(c?.kind)||c.quantity&&(!Number.isSafeInteger(c.quantity.min)||c.quantity.min<1||c.quantity.min!==c.quantity.max)||c.kind==='payLife'&&(c.amount?.kind!=='number'||!Number.isSafeInteger(c.amount.value)||c.amount.value<1))throw new Error('Invalid upkeep additional cost');
   MTG.compileOracleAdditionalCosts([c]);
  }
  if(p.kind==='mana'&&!/^\{[WUBRG]\/[WUBRG]\}$/.test(p.mana)||p.kind==='self-counter'&&p.counter!=='-1/-1'||p.kind==='opponent-counter'&&p.counter!=='+1/+1'||p.kind==='add-mana'&&p.color!=='R')throw new Error('Invalid upkeep primitive');
 }
 function canPay(ctx,payment,n,capture){
  if(n===0)return true;
  if(payment.kind==='additional')return MTG.compileOracleAdditionalCosts([scaled(payment,n)]).canPayContext(frame(ctx));
  if(payment.kind==='mana')return ctx.g.canPayMana(ctx.you,MTG.parseCost(payment.mana.repeat(n)));
  if(payment.kind==='self-counter')return same(ctx.g,ctx.src,capture);
  if(payment.kind==='opponent-counter')return creatures(ctx).length>0;
  if(payment.kind==='opponent-life')return opponents(ctx).some(player=>ctx.g.canGainLife(player));
  if(payment.kind==='graveyard-bottom')return ctx.g.players.filter(player=>!player.lost).reduce((sum,player)=>sum+Math.floor(player.graveyard.length/2),0)>=n;
  return true;
 }
 async function chooseCards(ctx,from,n,prompt,hint){
  const versions=new Map(from.map(card=>[card,card.zoneVersion]));
  const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:n,max:n,prompt,aiHint:{kind:hint}});
  return Array.isArray(picked)&&picked.length===n&&new Set(picked).size===n&&picked.every(card=>from.includes(card)&&card.zoneVersion===versions.get(card))?picked:null;
 }
 async function pay(ctx,p,n,capture){
  if(n===0)return{kind:p.kind,n};
  if(!canPay(ctx,p,n,capture))return false;
  if(p.kind==='additional'){
   const transaction=frame(ctx),compiled=MTG.compileOracleAdditionalCosts([scaled(p,n)]);
   if(await compiled.prepareTargets(transaction)===false||!MTG.validateOracleAdditionalCostPlans(transaction))return false;
   await MTG.commitOracleAdditionalCosts(transaction);return{kind:p.kind,n,costs:transaction.so.oracleV4AdditionalCost};
  }
  if(p.kind==='mana'){
   const cost=MTG.parseCost(p.mana.repeat(n)),options={hybridChoices:[]};
   for(let i=0;i<n;i++){
    const legal=cost.pips[i].filter(color=>ctx.g.canPayMana(ctx.you,cost,null,{hybridChoices:options.hybridChoices.concat(color)}));
    if(!legal.length)return false;
    const answer=legal.length===1?legal[0]:await ctx.you.controller.decide(ctx.g,{type:'chooseOption',options:legal.map(key=>({key,label:'Pay {'+key+'}'})),prompt:'Choose upkeep mana '+(i+1)+' of '+n,aiHint:{kind:'alternativeManaPayment'}});
    if(!legal.includes(answer))return false;options.hybridChoices.push(answer);
   }
   return await ctx.g.payMana(ctx.you,cost,null,options)?{kind:p.kind,n,colors:options.hybridChoices}:false;
  }
  if(p.kind==='opponent-counter'||p.kind==='opponent-life'){
   const selections=[];
   for(let i=0;i<n;i++){
    if(p.kind==='opponent-counter'){
     const cards=await chooseCards(ctx,creatures(ctx),1,'Choose a creature to receive the upkeep counter '+(i+1),'upkeepCounterCost');if(!cards)return false;
     selections.push({card:cards[0],identity:identity(cards[0])});
    }else{
     const players=opponents(ctx).filter(player=>ctx.g.canGainLife(player));
     const key=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose an opponent to gain 1 life',options:players.map(player=>({key:String(player.idx),label:player.name})),aiHint:{kind:'oracleUpkeepLifeRecipient'}});
     const player=players.find(player=>String(player.idx)===key);if(!player)return false;selections.push({player});
    }
   }
   if(selections.some(row=>row.card?!same(ctx.g,row.card,row.identity)||!creatures(ctx).includes(row.card):!opponents(ctx).includes(row.player)||!ctx.g.canGainLife(row.player)))return false;
   const groups=new Map();for(const row of selections){const selected=row.card||row.player;groups.set(selected,(groups.get(selected)||0)+1);}
   for(const [selected,count]of groups)if(p.kind==='opponent-counter')ctx.g.addCounters(selected,p.counter,count,false,ctx.you);else await ctx.g.gainLife(selected,count,ctx.src);
   return{kind:p.kind,n,selections:selections.map(row=>row.card?{iid:row.card.iid}:{player:row.player.idx})};
  }
  if(p.kind==='graveyard-bottom'){
   const selected=[],locks=[];
   for(let i=0;i<n;i++){
    const groups=ctx.g.players.filter(player=>!player.lost).map(player=>({player,cards:player.graveyard.filter(card=>!selected.includes(card))})).filter(group=>group.cards.length>=2);
    if(!groups.length)return false;
    const key=groups.length===1?String(groups[0].player.idx):await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose one graveyard for this pair of upkeep cards',options:groups.map(group=>({key:String(group.player.idx),label:group.player.name+"'s graveyard"})),aiHint:{kind:'oracleUpkeepGraveyard'}});
    const group=groups.find(group=>String(group.player.idx)===key);if(!group)return false;
    const cards=await chooseCards(ctx,group.cards,2,'Choose two cards from this graveyard for upkeep','bottomOrder');if(!cards)return false;
    for(const card of cards){selected.push(card);locks.push({card,version:card.zoneVersion,owner:group.player});}
   }
   const ordered=[];
   for(const player of ctx.g.players){const from=selected.filter(card=>card.owner===player);if(!from.length)continue;
    const cards=from.length===1?from:await chooseCards({...ctx,you:player},from,from.length,'Order upkeep cards from the top of this group to the bottom','bottomOrder');if(!cards)return false;ordered.push(...cards);
   }
   if(locks.some(row=>row.card.zone!=='graveyard'||row.card.zoneVersion!==row.version||row.owner.lost||!row.owner.graveyard.includes(row.card)))return false;
   for(const card of ordered)await ctx.g.move(card,'library',{toBottom:true});
   return{kind:p.kind,n,cards:selected.map(card=>card.iid)};
  }
  if(p.kind==='self-counter')ctx.g.addCounters(ctx.src,p.counter,n,false,ctx.you);
  if(p.kind==='add-mana'){ctx.you.pool[p.color]+=n;ctx.g.note('mana',{p:ctx.you});}
  if(p.kind==='draw')await ctx.g.draw(ctx.you,n,ctx.src,{deferSBA:true});
  return{kind:p.kind,n};
 }
 function install(script,operation){
  validate(operation);const id=++serial;
  if(operation.echo){if(script.oracleEchoCost)throw new Error('Multiple Echo costs need explicit composition');script.oracleEchoCost=operation.label;}
  const get=(source,data)=>data?.[events]?.get(id+':'+source.iid);
  const trigger={on:'upkeep',desc:(operation.echo?'Echo — ':'Cumulative upkeep — ')+operation.label,
   filter:(g,source,data)=>{
    if(data.player!==source.ctrl||operation.echo&&!source.meta.oracleEchoPending)return false;
    if(!data[events])Object.defineProperty(data,events,{value:new Map()});data[events].set(id+':'+source.iid,{source:identity(source),controller:source.ctrl});return true;
   },controller:(g,source,data)=>get(source,data)?.controller||source.ctrl,
   run:async ctx=>{
    const capture=get(ctx.src,ctx.data);if(!capture)throw new Error('Lost upkeep source identity');
    if(!operation.echo&&!same(ctx.g,ctx.src,capture.source))return;
    if(!operation.echo)ctx.g.addCounters(ctx.src,'age',1,false,ctx.you);
    const n=operation.echo?1:ctx.src.counters.age||0;
    if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid upkeep age count');
    const available=canPay(ctx,operation.payment,n,capture.source);
    const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Pay '+operation.label+(operation.echo?'':' × '+n)+'?',options:[...(available?[{key:'yes',label:'Pay '+operation.label+(operation.echo?'':' × '+n)}]:[]),{key:'no',label:'Do not pay'}],aiHint:{kind:'oracleUpkeepCost',payment:operation.payment,n,src:ctx.src,sourceLive:same(ctx.g,ctx.src,capture.source)}});
    const receipt=available&&answer==='yes'&&await pay(ctx,operation.payment,n,capture.source);
    ctx.oracleUpkeepPayment={paid:!!receipt,n,...(receipt||{})};
    if(!receipt&&same(ctx.g,ctx.src,capture.source)&&ctx.src.ctrl===ctx.you)await ctx.g.sacrifice(ctx.you,ctx.src);
   }};
  (script.triggers||=[]).push(trigger);
 }
 MTG.OracleV8UpkeepCosts={install};
})();
