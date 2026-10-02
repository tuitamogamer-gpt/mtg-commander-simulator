import assert from 'node:assert/strict';
import {stageCount,countValue,stageCondition} from './oracle-v5-proof.mjs';
let giftScope=null;
const permissionWorlds=new WeakMap(),permissionWrapped=new WeakSet();
export function installLayoutsProofV21(M,game){
 if(!giftScope)return;const scope=giftScope,cast=game.castSpell,emit=game.emit;
 scope.games.push(game);
 game.castSpell=function(player,card,options={}){if(card.def.bdfGift&&card.name===scope.name)options={...options,alt:{...(options.alt||{}),...(scope.promised?{bdfGift:true}:{})}};return cast.call(this,player,card,options);};
 game.emit=async function(name,data,...rest){if(name==='bdfGift')scope.gifts.push({game,data,hand:data.recipient.hand.length,tokens:this.bf().filter(c=>c.ctrl===data.recipient&&c.isToken).map(c=>({card:c,tapped:c.tapped,definition:c.def}))});return emit.call(this,name,data,...rest);};
}
const make=(M,entry,role,h)=>{const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.assertControllerRole(M,f,entry.raw.name+'/'+role);for(const p of f.game.players)h.fillLibrary(M,p,40);return f;};
function stageTargets(M,f,operations,h){for(const op of operations)for(const [i,target]of(op.targets||[]).entries())h.stageGenericTarget(M,f,target,i,op.effects?.find(e=>e.target===i));}
export function stageLayoutsCardV21(M,f,entry,h){
 const rows=[];for(const op of entry.implementation||[])if(op.kind==='casting-waterbend-v21')for(let i=0;i<op.n;i++)rows.push(h.permanent(M,f.game,f.a,h.fixtureDefinition('V21 waterbend payment '+i,['Artifact'],{mana:undefined,abilities:[],triggers:[],statics:[]})));
 return rows;
}
export function stageLayoutsEffectV21(M,f,effect,h){
 if(effect.action==='return-faced-source-v21')return true;
 if(effect.action!=='exile-play-v21')return false;
 if(effect.condition)stageCondition(M,f,effect.condition,f.source,h);
 if(!permissionWorlds.has(f.game))permissionWorlds.set(f.game,[]);
 for(const handler of M.OracleV20.handlers)if(handler.layoutsV21&&!permissionWrapped.has(handler)){permissionWrapped.add(handler);const previous=handler.effect;handler.effect=async function(ctx,e,...rest){const evidence=permissionWorlds.get(ctx.g);if(e.action!=='exile-play-v21'||!evidence)return previous.call(this,ctx,e,...rest);const owner=M.OracleV20.helpers.genericEffectSubjects(ctx,e.who)[0],n=M.OracleV20.helpers.genericAmount(e.n,ctx),cards=n>0?owner.library.slice(-n).reverse():[],row={effect:e,cards,owner,player:ctx.you,versions:new Map(cards.map(c=>[c,c.zoneVersion]))};evidence.push(row);return previous.call(this,ctx,e,...rest);};}
 return true;
}
export async function assertLayoutsEffectV21(M,f,entry,effect,source,targets,damaged,before,trace,label,h){
 if(effect.action==='exile-play-v21'){
  const rows=permissionWorlds.get(f.game)?.filter(row=>JSON.stringify(row.effect)===JSON.stringify(effect));assert.ok(rows?.length,label+': actual exile permission instruction ran');
  for(const row of rows)for(const card of row.cards){assert.equal(card.zone,'exile',label+': printed top-library object exiled');assert.ok(card.zoneVersion>row.versions.get(card));assert.equal(card.faceDown,!!effect.faceDown);if(effect.faceDown)assert.ok(card.meta.revealedTo.includes(row.player.idx),label+': only authorized player may look');assert.equal(card.meta.playableBy,row.player);assert.equal(card.meta.spellsOnly,effect.spellsOnly);assert.equal(f.game.hasExilePlayPermission(row.player,card),true);const wrong=f.game.players.find(p=>p!==row.player);assert.equal(f.game.hasExilePlayPermission(wrong,card),false);}
  if(effect.duration==='next-end-step')for(const row of rows){const wrong=f.game.players.find(p=>p!==row.player);await f.game.emit('endStep',{player:wrong});for(const card of row.cards)assert.equal(f.game.hasExilePlayPermission(row.player,card),true);await f.game.emit('endStep',{player:row.player});for(const card of row.cards)assert.equal(f.game.hasExilePlayPermission(row.player,card),false,label+': permission expires before end-step priority');}
  return true;
 }
 if(effect.action!=='return-faced-source-v21')return false;
 assert.equal(source.zone,'battlefield',label+': physical source returned from its first graveyard object');
 assert.equal(source.ctrl,effect.controller==='you'?f.a:source.owner,label+': printed returned controller');
 assert.equal(source.tapped,!!effect.tapped,label+': printed entry tapped state');
 if(effect.face==='back')assert.equal(source.oracleFace,'back',label+': transformed physical back');else assert.ok(source.def.c1719Unflipped,label+': flipped physical back');
 if(effect.counter)assert.ok((source.counters[effect.counter]||0)>=effect.n,label+': printed entry counters');
 if(effect.attachTarget!==undefined){const host=[targets[effect.attachTarget]].flat().filter(Boolean)[0];assert.equal(host instanceof M.Player?source.cursedPlayer:source.attachedTo,host instanceof M.Player?host.idx:host.iid,label+': returned attachment host');}
 return true;
}
export async function operationProofV21(M,entry,op,role,h){
 if(op.kind==='saga-chapters'&&op.chapters.length===3){
  const final=op.chapters[2],grant=final.effects?.[0],fight=final.effects?.[1];
  if(final.effects?.length===2&&grant.action==='grant-operation'&&grant.target===0&&grant.operation.kind==='generic-trigger'&&grant.operation.event==='dies'&&grant.operation.eventFilter==='self'&&grant.operation.effects?.length===1&&grant.operation.effects[0].action==='draw'&&grant.operation.effects[0].who==='you'&&grant.operation.effects[0].n===2&&fight.action==='fight'&&fight.target===0&&fight.otherTarget===1){
   let checks=0;for(const [chapterIndex,chapter]of op.chapters.slice(0,2).entries())checks+=await h.genericRuntimeOperationProof(M,entry,{kind:'generic-trigger',event:'saga-chapter',eventFilter:'self',chapterIndex,...chapter},role);
   for(const branch of ['none','survive','die']){
    const f=make(M,entry,role,h),{game,a,b}=f;h.fund(a,100);
    const host=h.permanent(M,game,a,h.fixtureDefinition('V21 saga granted host',['Creature'],{power:'2',toughness:'2'})),enemy=h.permanent(M,game,b,h.fixtureDefinition('V21 saga fight foe',['Creature'],{power:branch==='die'?'10':'1',toughness:'30'}));
    const source=h.zoneCard(M,a,entry.raw.name,'hand'),decide=a.controller.decide.bind(a.controller),observed=[],queue=game.queueTrigger;
    a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(enemy)?branch==='none'?[]:[enemy]:q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:decide(g,q);
    game.queueTrigger=function(row){if(row.src===host&&row.data?.card===host&&row.data?.snap)observed.push(row);return queue.call(this,row);};
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await h.resolveAll(game);assert.equal(source.counters.lore,1);await game.advanceSagas(a);await h.resolveAll(game);assert.equal(host.counters['+1/+1'],2);
    const hand=a.hand.length;await game.advanceSagas(a);await h.resolveAll(game);assert.equal(source.zone,'graveyard');
    assert.equal(enemy.damage,branch==='none'?0:4,entry.raw.name+': chosen opponent receives exact fight damage');
    if(branch==='die'){assert.equal(host.zone,'graveyard');assert.equal(a.hand.length-hand,2);assert.equal(observed.length,1,entry.raw.name+': lethal fight queues the granted death rule');}
    else {assert.equal(host.zone,'battlefield');assert.equal(host.damage,branch==='none'?0:1);assert.equal(a.hand.length,hand);assert.ok(host.cur.extraTriggers.length);await game.sacrifice(a,host);await h.resolveAll(game);assert.equal(a.hand.length-hand,2);assert.equal(observed.length,1);}
    await game.move(host,'battlefield',{ctrl:a});const freshHand=a.hand.length;await game.sacrifice(a,host);await h.resolveAll(game);assert.equal(a.hand.length,freshHand,entry.raw.name+': a new battlefield incarnation does not inherit the grant');checks+=10;
   }return checks;
  }
 }
 if(op.kind==='gift-spell-v21'){
  let checks=0;
  for(const promised of [false,true]){
   const scope={name:entry.raw.name,promised,gifts:[],games:[]},prior=giftScope;giftScope=scope;
   try{const nested={...entry,...(promised?op.promised:op.ordinary)};for(const child of nested.implementation)checks+=await h.operationProof(M,nested,child,role);}
   finally{giftScope=prior;}
   if(promised){assert.ok(scope.gifts.length,entry.raw.name+': promised gift actually resolves');for(const row of scope.gifts){assert.notEqual(row.data.player,row.data.recipient);if(op.gift==='tapped Fish')assert.ok(row.tokens.some(c=>c.definition.types.includes('Creature')&&c.definition.subtypes.includes('Fish')&&c.tapped&&Number(c.definition.power)===1&&Number(c.definition.toughness)===1&&c.definition.colorsOverride.includes('U')));else if(op.gift==='Food'||op.gift==='Treasure')assert.ok(row.tokens.some(c=>c.card.hasSub(op.gift)));else assert.ok(row.hand>0);}}
   else assert.equal(scope.gifts.length,0,entry.raw.name+': ordinary cast gives no gift');checks+=2;
  }
  return checks;
 }
 if(op.kind==='mechanic-read-ahead-v21'){
  let checks=0;const chapters=entry.implementation.find(row=>row.kind==='saga-chapters').chapters;
  for(let n=1;n<=op.chapters;n++){
   const f=make(M,entry,role,h),{game,a}=f;h.fund(a,100);stageTargets(M,f,chapters,h);
   const source=h.zoneCard(M,a,entry.raw.name,'hand'),decide=a.controller.decide.bind(a.controller),queued=[],queue=game.queueTrigger;
   a.controller.decide=(g,q)=>q.aiHint?.kind==='readAhead'?String(n):decide(g,q);
   game.queueTrigger=function(row){if(row.sagaChapter?.iid===source.iid)queued.push(row.data.chapter);return queue.call(this,row);};
   assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await game.resolveTop();assert.equal(source.counters.lore,n);assert.deepEqual(queued,[n],entry.raw.name+': only chosen chapter triggers when entering');await h.resolveAll(game);
   if(n<op.chapters&&source.zone==='battlefield'){queued.length=0;await game.advanceSagas(a);assert.deepEqual(queued,[n+1]);await h.resolveAll(game);}
   checks+=4;
  }return checks;
 }
 if(op.kind==='casting-waterbend-v21'){
  const f=make(M,entry,role,h),{game,a}=f,source=h.zoneCard(M,a,entry.raw.name,'hand'),printed=M.parseCost(source.def.cost);
  a.pool.C=printed.generic;for(const pip of printed.pips)a.pool[pip.find(c=>'WUBRGC'.includes(c))]++;
  const donors=stageLayoutsCardV21(M,f,{implementation:[op]},h),events=[],emit=game.emit;game.emit=async function(name,data,...rest){if(name==='waterbend')events.push(data);return emit.call(this,name,data,...rest);};stageTargets(M,f,entry.implementation,h);
  const full=game.spellCost(a,source,{from:'hand'});assert.equal(full.generic,printed.generic+op.n);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(donors.filter(c=>c.tapped).length,op.n);assert.equal(events.length,1);assert.equal(events[0].n,op.n);assert.equal(Object.values(a.pool).reduce((n,x)=>n+x,0),0);await h.resolveAll(game);return 6;
 }
 if(op.kind==='mechanic-compleated-v21'){
  let checks=0;const pips=M.parseCost(M.DEFS[entry.raw.name].cost).pips.filter(p=>p.includes('PHY')).length;
  for(let life=0;life<=pips;life++){
   const f=make(M,entry,role,h),{game,a}=f;h.fund(a,40);const source=h.zoneCard(M,a,entry.raw.name,'hand'),start=a.life;
   const phy=M.parseCost(source.def.cost).pips.filter(p=>p.includes('PHY'));
   assert.equal(await game.castSpell(a,source,{from:'hand',alt:{phyrexianChoices:phy.map((pip,i)=>i<life?'life':pip.find(c=>'WUBRG'.includes(c)))}}),true);await h.resolveAll(game);assert.equal(start-a.life,life*2);assert.equal(source.counters.loyalty,Number(source.def.loyalty)-2*(op.perPip?life:life>0?1:0));checks+=3;
  }return checks;
 }
 if(op.kind==='self-cost-v21'){
  const f=make(M,entry,role,h),{game,a}=f,source=h.zoneCard(M,a,entry.raw.name,'hand');stageCount(M,f,op.count,h.v8Helpers());game.recalc();const n=Math.max(0,Math.floor(countValue(f,source,op.count))),printed=M.parseCost(source.def.cost),cost=game.spellCost(a,source,{from:'hand'}),expected=printed.pips.map(p=>p.slice());
  if(op.colors)for(let i=0;i<n;i++)for(const color of op.colors){const j=expected.findIndex(p=>p.length===1&&p[0]===color);if(j>=0)expected.splice(j,1);}
  assert.equal(cost.generic,Math.max(0,printed.generic-op.n*n));assert.deepEqual(cost.pips,expected);h.fund(a,100);const start=Object.values(a.pool).reduce((n,x)=>n+x,0);assert.equal(await game.payMana(a,cost,{card:source,castOpts:{from:'hand'}},{isSpell:true}),true);assert.equal(start-Object.values(a.pool).reduce((n,x)=>n+x,0),cost.generic+cost.pips.length);return 4;
 }
 if(op.kind==='spell-cost-sequence-v21'){
  const f=make(M,entry,role,h),{game,a,b}=f,source=h.permanent(M,game,a,entry.raw.name),definition=h.fixtureDefinition('V21 numbered spell',['Creature'],{cost:'{9}',power:'2',toughness:'8',subtypes:op.quality==='Dragon'?['Dragon']:[]}),spell=h.zoneCard(M,a,definition,'hand');
  const prior={isCreature:true,subtypes:definition.subtypes,types:definition.types,changeling:false,so:{kicked:op.quality==='kicked'}};
  const option=op.quality==='kicked'?{kicked:true}:{};
  for(let n=0;n<=op.nth;n++){a.turnState.spellsCastList=Array.from({length:n},()=>({...prior}));assert.equal(game.spellCost(a,spell,option).generic,9-(n===op.nth-1?op.n:0));}
  assert.equal(game.spellCost(b,spell,option).generic,9);M.OracleV8AbilityLoss.add(game,[source],{});assert.equal(game.spellCost(a,spell,option).generic,9);return op.nth+3;
 }
 return null;
}
