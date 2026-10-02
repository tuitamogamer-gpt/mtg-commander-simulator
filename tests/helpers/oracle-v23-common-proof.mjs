import assert from 'node:assert/strict';
export async function operationProofV23(M,entry,operation,role,h){
 if(operation.kind==='generic-trigger'&&operation.event==='etb'&&operation.condition?.kind==='cast-origin-v23'&&operation.condition.from==='graveyard'&&operation.effects?.length===1&&operation.effects[0].action==='attach-source'){
  let checks=0;for(const from of ['hand','graveyard'])for(const copied of [false,true]){
   const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=f;h.fund(a,100);
   const host=h.stageGenericTarget(M,f,operation.targets[0],0),source=h.zoneCard(M,a,entry.raw.name,'hand'),prior=a.controller.decide.bind(a.controller);
   a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(host)?[host]:prior(g,q);
   let alt;if(from==='graveyard'){await game.discard(a,[source]);alt=game.castableList(a).find(row=>row.card===source&&row.from==='graveyard'&&row.alt?.mayhem)?.alt;assert.ok(alt,'actual discarded-card permission is offered');}
   const mana=Object.values(a.pool).reduce((sum,n)=>sum+n,0);assert.equal(await game.castSpell(a,source,{from,...(alt?{alt}:{})}),true);assert.ok(Object.values(a.pool).reduce((sum,n)=>sum+n,0)<mana);
   const original=game.stack.find(so=>so.card===source);
   if(copied){assert.ok(await game.copySpell(original,a,{mayNewTargets:false}));await game.resolveTop();await game.flushTriggers();assert.equal(game.stack.filter(so=>so.kind==='trigger').length,0,'a permanent spell copy was not cast');const token=game.bf().find(c=>c.isToken&&c.name===source.name);assert.ok(token);assert.equal(token.attachedTo,null);}
   await game.resolveTop();await game.flushTriggers();assert.equal(game.stack.filter(so=>so.kind==='trigger'&&so.srcCard===source).length,from==='graveyard'?1:0);await h.resolveAll(game);
   assert.equal(source.attachedTo,from==='graveyard'?host.iid:null);assert.equal(host.kw('flying'),from==='graveyard');assert.equal(host.kw('haste'),from==='graveyard');h.assertControllerRole(M,f,entry.raw.name);checks+=10;
  }return checks;
 }
 if(operation.kind==='generic-trigger'&&operation.event==='etb'&&operation.condition?.kind==='not'&&operation.condition.condition?.kind==='cast-by-controller-v23'&&operation.effects.length===1&&operation.effects[0].action==='lose-game-v10'){
  for(const mode of ['hand','uncast','graveyard','stolen']){
   const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fund(a,100);h.fund(b,100);const source=h.zoneCard(M,a,entry.raw.name,mode==='graveyard'?'graveyard':'hand');
   if(mode==='uncast')await game.putPermanentOntoBattlefield(source,a);
   else if(mode==='graveyard'){h.permanent(M,game,a,'Muldrotha, the Gravetide');const action=game.castableList(a).find(row=>row.card===source&&row.from==='graveyard');assert.ok(action);assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:action.alt}),true);}
   else assert.equal(await game.castSpell(a,source,{from:'hand'}),true);
   if(mode==='stolen'){const steal=h.zoneCard(M,b,'Aethersnatch','hand');assert.equal(await game.castSpell(b,steal,{from:'hand',quickTargets:[game.stack.find(so=>so.card===source)]}),true);}
   await h.resolveAll(game);assert.equal(a.lost,mode==='uncast'||mode==='graveyard');assert.equal(b.lost,mode==='stolen');h.assertControllerRole(M,f,entry.raw.name);
  }
  return 12;
 }
 if(operation.kind==='spell-origin-branches-v23')return originProofV23(M,entry,role,h);
 if(operation.kind!=='opening-reveal-v23'&&!operation.openingRevealV23)return null;
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;
 h.fund(a,100);h.fund(b,100);h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);
 const source=h.zoneCard(M,a,entry.raw.name,'hand'),requests=[],prior=a.controller.decide.bind(a.controller);
 a.controller.decide=(g,q)=>{requests.push(q);if(q.type==='chooseOption'&&q.prompt?.startsWith('Reveal '))return 'yes';if(q.type==='chooseCards'&&q.prompt?.startsWith('Keep up to one'))return q.from.slice(0,1);return prior(g,q);};
 await M.CDK.openingPermanents(game);assert.equal(source.zone,'hand');assert.equal(game.delayed.length,1);assert.equal(game.stack.length,0);
 const initial={life:a.life,opponentLife:b.life,green:a.pool.G,library:a.library.length,opponentGrave:b.graveyard.length};
 if(operation.timing==='opponents-first-cast'){
  game.turnPlayer=b;game.phase='main1';const decide=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='no')?'no':decide(g,q);
  const first=h.zoneCard(M,b,'Grizzly Bears','hand');assert.equal(await game.castSpell(b,first,{from:'hand'}),true);await h.resolveAll(game);assert.equal(first.zone,'graveyard');
  const second=h.zoneCard(M,b,'Grizzly Bears','hand');assert.equal(await game.castSpell(b,second,{from:'hand'}),true);await h.resolveAll(game);assert.equal(second.zone,'battlefield');
 }else{
  const own=operation.timing.startsWith('own-'),main=operation.timing==='own-first-main';
  if(own){if(main)await game.emitMainPhase(b,{precombat:true});else await game.emit('upkeep',{player:b});await h.resolveAll(game);assert.equal(game.delayed.length,1);}
  await game.move(source,'graveyard');
  if(main)await game.emitMainPhase(a,{precombat:true});else await game.emit('upkeep',{player:own?a:b});
  assert.equal(game.pendingTriggers.length,1);assert.equal(game.delayed.length,0);await h.resolveAll(game);
  let lost=0;
  for(const effect of operation.effects){
   if(effect.action==='add-mana')assert.equal(a.pool.G,initial.green+effect.produce.G);
   else if(effect.action==='set-life-v9')assert.equal(a.life,effect.n);
   else if(effect.action==='lose-life'){assert.equal(b.life,initial.opponentLife-effect.n);lost=effect.n;}
   else if(effect.action==='gain-life')assert.equal(a.life,initial.life+(effect.n?.kind==='life-lost'?lost:effect.n));
   else if(effect.action==='mill')assert.equal(b.graveyard.length,initial.opponentGrave+effect.n);
   else if(effect.action==='scry')assert.equal(requests.find(q=>q.type==='scry')?.cards.length,effect.n);
   else if(effect.action==='opening-look-v23'){assert.equal(a.library.length,initial.library-effect.n+1);assert.equal(a.exile.length,effect.n-1);}
   else if(effect.action==='token-inline'){const tokens=game.bf().filter(c=>c.isToken);assert.equal(tokens.length,effect.n);assert.equal(tokens[0].ctrl,a);assert.equal(tokens[0].power,Number(effect.token.power));assert.equal(tokens[0].toughness,Number(effect.token.toughness));for(const keyword of effect.token.keywords)assert.equal(tokens[0].kw(keyword),true);}
   else throw Error('Missing opening effect proof: '+effect.action);
  }
  const after={life:a.life,opponent:b.life,green:a.pool.G,library:a.library.length,tokens:game.bf().length};
  if(main)await game.emitMainPhase(a,{precombat:true});else await game.emit('upkeep',{player:own?a:b});await h.resolveAll(game);
  assert.deepEqual({life:a.life,opponent:b.life,green:a.pool.G,library:a.library.length,tokens:game.bf().length},after);
 }
 h.assertControllerRole(M,f,entry.raw.name);return 12+operation.effects.length;
}
export async function originProofV23(M,entry,role,h){
 let checks=0;
 for(const from of ['hand','graveyard'])for(const copied of [false,true]){
  const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fund(a,100);h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);
  if(entry.raw.name==='From Father to Son')h.zoneCard(M,a,h.fixtureDefinition('V23 searched Vehicle',['Artifact'],{subtypes:['Vehicle'],cost:'{2}'}),'library');
  if(entry.raw.name==='The Final Days')for(let i=0;i<3;i++)h.zoneCard(M,a,'Grizzly Bears','graveyard');
  const source=h.zoneCard(M,a,entry.raw.name,from),prior=a.controller.decide.bind(a.controller);
  a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.search?q.from.slice(0,q.max):q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:prior(g,q);
  const alt=from==='graveyard'?game.castableList(a).find(row=>row.card===source&&row.alt?.flashback)?.alt:undefined;if(from==='graveyard')assert.ok(alt);
  const mana=Object.values(a.pool).reduce((sum,n)=>sum+n,0),opponentGrave=b.graveyard.length;
  assert.equal(await game.castSpell(a,source,{from,...(alt?{alt}:{}),...(entry.raw.cost.includes('{X}')?{xVal:2}:{})}),true);
  const so=game.stack.find(row=>row.card===source);assert.ok(so);assert.ok(Object.values(a.pool).reduce((sum,n)=>sum+n,0)<mana);
  const hand=a.hand.length,battlefield=game.bf().length;
  if(copied){const copy=await game.copySpell(so,a,{mayNewTargets:false});assert.ok(copy);await game.resolveTop();
   if(entry.raw.name==='Increasing Confusion')assert.equal(b.graveyard.length,opponentGrave+2,'a Stack copy was not cast from the graveyard');
   if(entry.raw.name==='Increasing Ambition')assert.equal(a.hand.length,hand+1,'a Stack copy searches once');
   if(entry.raw.name==='From Father to Son'){assert.equal(a.hand.length,hand+1,'a Stack copy puts its searched card into hand');h.zoneCard(M,a,h.fixtureDefinition('V23 second searched Vehicle',['Artifact'],{subtypes:['Vehicle'],cost:'{2}'}),'library');}
   if(entry.raw.name==='The Final Days')assert.equal(game.bf().length,battlefield+2,'a Stack copy makes two tokens');
  }
  await h.resolveAll(game);
  const bonus=from==='graveyard';
  if(entry.raw.name==='Increasing Confusion')assert.equal(b.graveyard.length,opponentGrave+(copied?2:0)+(bonus?4:2));
  else if(entry.raw.name==='Increasing Ambition')assert.equal(a.hand.length,hand+(copied?1:0)+(bonus?2:1));
  else if(entry.raw.name==='From Father to Son'){assert.equal(a.hand.length,hand+(copied?1:0)+(bonus?0:1));assert.equal(game.bf().filter(c=>c.hasSub('Vehicle')).length,bonus?1:0);}
  else if(entry.raw.name==='The Final Days'){const tokens=game.bf().filter(c=>c.isToken);assert.equal(tokens.length,(copied?2:0)+(bonus?3:2));for(const token of tokens){assert.equal(token.tapped,true);assert.equal(token.power,2);assert.equal(token.toughness,2);}}
  else throw Error('Missing casting-origin witness: '+entry.raw.name);
  assert.equal(source.zone,bonus?'exile':'graveyard');h.assertControllerRole(M,f,entry.raw.name);checks+=12;
 }
 return checks;
}
