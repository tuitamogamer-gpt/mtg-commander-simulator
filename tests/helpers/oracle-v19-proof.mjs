import assert from 'node:assert/strict';
export async function blockingRuleProofV19(M,entry,op,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;
 h.assertControllerRole(M,f,entry.raw.name+'/'+role);const source=h.permanent(M,game,a,entry.raw.name);
 if(op.kind==='filtered-lure-v19'){
  const blocker=h.stageGenericTarget(M,f,{...op.filter,controller:'opponent'},'required-blocker'),plain=h.permanent(M,game,b,'Grizzly Bears');source.attacking=b;game.recalc();
  assert.equal(M.OracleV8CombatRestrictions.requirements(blocker,source),1);assert.equal(M.OracleV8CombatRestrictions.requirements(plain,source),0);
  const competitor=h.permanent(M,game,a,'Grizzly Bears');competitor.attacking=b;assert.equal(M.OracleV8CombatRestrictions.requirements(blocker,competitor),0);
  game.completeRequiredBlocks([source,competitor],[blocker,plain]);assert.ok(source.blockedBy.includes(blocker));
  await game.move(source,'exile');assert.equal(M.OracleV8CombatRestrictions.requirements(blocker,source),0);return 5;
 }
 const attacker=h.permanent(M,game,b,h.fixtureDefinition('Blocking permission attacker',['Creature'],{power:'2',toughness:'20',kws:[op.mode==='shadow'?'shadow':'flying'],subtypes:[op.mode==='dragon-reach'?'Dragon':'Bear']}));attacker.attacking=a;
 assert.equal(game.canBlock(source,attacker),true);attacker.def={...attacker.def,kws:['flying'],subtypes:['Bird']};game.recalc();assert.equal(game.canBlock(source,attacker),false);
 attacker.def={...attacker.def,kws:[],subtypes:['Bear']};game.recalc();assert.equal(game.canBlock(source,attacker),true);return 3;
}
export async function entrySuppressionProofV19(M,entry,op,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;
 h.assertControllerRole(M,f,entry.raw.name+'/'+role);const source=h.permanent(M,game,a,entry.raw.name);let fired=0,expected=0;
 h.permanent(M,game,b,h.fixtureDefinition('Entry watcher',['Enchantment'],{triggers:[{on:'etb',run:async()=>{fired++;}}]}));
 for(const types of [['Creature'],['Artifact'],['Land','Creature'],['Enchantment']]){
  const c=h.zoneCard(M,b,h.fixtureDefinition('Entry subject '+expected,types,{power:'2',toughness:'3',triggers:[{on:'etb',filter:(g,s,d)=>s===d.card,run:async()=>{fired++;}}]}),'hand');
  await game.putPermanentOntoBattlefield(c,b);await h.resolveAll(game);if(!types.some(type=>op.types.includes(type)))expected+=2;assert.equal(fired,expected);
 }
 await game.move(source,'exile');const c=h.zoneCard(M,b,'Grizzly Bears','hand');await game.putPermanentOntoBattlefield(c,b);await h.resolveAll(game);assert.equal(fired,expected+1);return 5;
}
export async function spellKeywordProofV19(M,entry,op,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=f;
 h.assertControllerRole(M,f,entry.raw.name+'/'+role);const source=h.permanent(M,game,a,entry.raw.name);
 if(op.keyword==='improvise'){
  for(const key of Object.keys(a.pool))a.pool[key]=0;
  const artifact=h.permanent(M,game,a,h.fixtureDefinition('Improvise material',['Artifact']));
  const spell=h.zoneCard(M,a,h.fixtureDefinition('Improvise spell',['Instant'],{cost:'{1}',resolve:async()=>{}}),'hand');
  assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(artifact.tapped,true);await h.resolveAll(game);
  await game.move(source,'exile');artifact.tapped=false;const next=h.zoneCard(M,a,spell.def,'hand');assert.equal(await game.castSpell(a,next,{from:'hand'}),false);assert.equal(artifact.tapped,false);return 4;
 }
 h.fund(a,100);a.library.splice(0);h.fillLibrary(M,a,3);let resolved=0;
 const hit=h.zoneCard(M,a,h.fixtureDefinition('Cascade hit',['Instant'],{cost:'{0}',resolve:async()=>{resolved++;}}),'library');
 const spell=h.zoneCard(M,a,h.fixtureDefinition('Granted cascade spell',['Creature'],{cost:op.filter.threshold?'{6}':'{2}',subtypes:op.filter.subtype?[op.filter.subtype]:['Bear'],power:'2',toughness:'3'}),'hand');
 assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.ok(game.stack.some(row=>row.name?.endsWith(': Cascade')));await h.resolveAll(game);assert.equal(hit.zone,'graveyard');assert.equal(resolved,1);
 await game.move(source,'exile');const next=h.zoneCard(M,a,spell.def,'hand');assert.equal(await game.castSpell(a,next,{from:'hand'}),true);assert.equal(game.stack.some(row=>row.name?.endsWith(': Cascade')),false);return 6;
}
export async function damageRedirectionProofV19(M,entry,op,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;
 h.assertControllerRole(M,f,entry.raw.name+'/'+role);const source=h.permanent(M,game,a,entry.raw.name),host=h.permanent(M,game,b,h.fixtureDefinition('Redirection host',['Creature'],{power:'1',toughness:'20'})),attacker=h.permanent(M,game,b,'Grizzly Bears');
 if(op.from==='host'||op.to==='host')assert.equal(await game.attach(source,host),true);
 const from=op.from==='controller'?a:host,to=op.to==='self'?source:op.to==='host'?host:host.ctrl,life=to.life,damage=to.damage,origin=from.life??from.damage;
 await game.damageAny(attacker,from,3,{deferSBA:true});
 assert.equal(from.life??from.damage,origin);assert.equal(to instanceof M.Player?to.life:to.damage,to instanceof M.Player?life-3:damage+3);
 await game.move(source,'exile');await game.damageAny(attacker,from,2,{deferSBA:true});assert.equal(from instanceof M.Player?from.life:from.damage,from instanceof M.Player?origin-2:origin+2);return 5;
}
export async function entryProhibitionProofV19(M,entry,op,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;
 h.assertControllerRole(M,f,entry.raw.name+'/'+role);const source=h.permanent(M,game,a,entry.raw.name);let checks=0;
 for(const p of [a,b])for(const zone of ['graveyard','library','hand','exile'])for(const type of ['Creature','Artifact','Land']){
  const c=h.zoneCard(M,p,h.fixtureDefinition('Entry prohibition witness '+checks,[type],{power:'2',toughness:'3'}),zone),version=c.zoneVersion;
  const blocked=op.zones.includes(zone)&&(op.quality==='creature'?type==='Creature':op.quality==='permanent'||type!=='Land');
  assert.equal(await game.putPermanentOntoBattlefield(c,p),!blocked);assert.equal(c.zone,blocked?zone:'battlefield');
  if(blocked)assert.equal(c.zoneVersion,version);checks+=3;
 }
 await game.move(source,'exile');const c=h.zoneCard(M,b,'Grizzly Bears','graveyard');assert.equal(await game.putPermanentOntoBattlefield(c,b),true);return checks+1;
}
export async function keywordCostProofV19(M,entry,op,role,h){
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;
 h.assertControllerRole(M,f,entry.raw.name+'/'+role);
 const source=h.permanent(M,game,a,entry.raw.name);
 for(const player of [a,b,a]){
  if(player===a&&a.turnState.spellsCast>0)await game.move(source,'exile');
  game.turnPlayer=player;game.phase='main1';h.fund(player,50);
  const prior=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Buyback ')?'yes':prior(g,q);
  const spell=h.zoneCard(M,player,h.fixtureDefinition('V19 buyback witness',['Instant'],{cost:'{1}{U}',buyback:'{3}',resolve:async()=>{}}),'hand');
  const pool=Object.values(player.pool).reduce((n,x)=>n+x,0),active=source.zone==='battlefield';
  assert.equal(await game.castSpell(player,spell,{from:'hand'}),true);
  assert.equal(pool-Object.values(player.pool).reduce((n,x)=>n+x,0),active?3:5,'actual additional cost discount for either player');
  assert.equal(game.stack.at(-1).castOpts.buybackPaid,true);await h.resolveAll(game);assert.equal(spell.zone,'hand');
 }
 return 9;
}
