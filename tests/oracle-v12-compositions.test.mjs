import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {phaseEntryV10} from './helpers/oracle-v10-turn-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v12-compositions.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const {report}=createImportPlan({cards:absent,bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},sequence:9914,limit:absent.length,compilerVersion:12});assert.equal(report.cards.length,absent.length);M.registerOracleBatch(report);}
M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=30;};
async function cast(f,name,targets=[],expectedCost){
 const {game,a}=f,source=put(M,game,a,name,'hand'),decide=a.controller.decide.bind(a.controller);fund(a);
 a.controller.decide=(g,q)=>q.type==='chooseTargets'&&targets.some(card=>q.candidates.includes(card))?targets.filter(card=>q.candidates.includes(card)):decide(g,q);
 try{const before=Object.values(a.pool).reduce((n,m)=>n+m,0);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);const paid=before-Object.values(a.pool).reduce((n,m)=>n+m,0);assert.ok(paid>0);if(expectedCost!==undefined)assert.equal(paid,expectedCost);await settle(game);}finally{a.controller.decide=decide;}
 assertGameStateInvariants(game);return source;
}
async function cleanup(game){const saved={runBeginningPhase:game.runBeginningPhase,mainPhase:game.mainPhase,combatPhase:game.combatPhase};game.runBeginningPhase=game.mainPhase=game.combatPhase=async()=>{};try{await game.runTurn();}finally{Object.assign(game,saved);}}
test('v12 closes complete printed clauses and preserves v11 compilation',()=>{
 for(const card of rows){
  const prior=semanticClass(card,{compilerVersion:11});assert.ok(semanticClass(card,{compilerVersion:12}).semanticClass,card.name);
  assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:12}).semanticClass,undefined);
  assert.deepEqual(semanticClass(card,{compilerVersion:11}),prior);
 }
});
test('looking at another hand shows every card only to the instructed viewer',async()=>{
 const f=context(M,'human'),{game,a,b}=f,watcher=await cast(f,'Walker of Secret Ways'),land=put(M,game,b,'Forest','hand'),spell=put(M,game,b,'Opt','hand'),seen=[];
 for(const player of [a,b]){const decide=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>{if(q.type==='cardReveal'){seen.push({player,cards:q.cards.slice()});return null;}return decide(g,q);};}
 game.paced=true;game.reviewHumans=()=>[a,b];game.revealToHuman=M.Game.prototype.revealToHuman;game.pace=async()=>{};
 watcher.attacking=b;watcher.sick=false;game.phase='combat';game.combat={attackers:[watcher],defenders:new Map(),blockersDeclared:true};await game.combatDamage(a,'normal');await settle(game);
 assert.equal(seen.length,1);assert.equal(seen[0].player,a);assert.deepEqual(Array.from(seen[0].cards,card=>card.iid).sort((x,y)=>x-y),[land.iid,spell.iid].sort((x,y)=>x-y));assertGameStateInvariants(game);
});
for(const role of ['human','ai']){
 test(role+': relative land counts follow the event player and are checked again on resolution',async()=>{
  const f=context(M,role),{game,a,b}=f,mask=await cast(f,'Mask of Intolerance');
  for(const name of ['Plains','Island','Swamp','Mountain'])put(M,game,b,name);
  const aLife=a.life,bLife=b.life;
  await game.emit('upkeep',{player:a});await settle(game);assert.equal(a.life,aLife);assert.equal(b.life,bLife);
  await game.emit('upkeep',{player:b});await settle(game);assert.equal(a.life,aLife);assert.equal(b.life,bLife-3);
  await game.emit('upkeep',{player:b});await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===mask));
  await game.move(game.bf().find(card=>card.ctrl===b&&card.name==='Plains'),'graveyard');await settle(game);assert.equal(b.life,bLife-3);
  await game.move(mask,'exile');
  const marauder=await cast(f,'Coastline Marauders'),base=marauder.power;put(M,game,a,'Forest');
  marauder.attacking=b;await game.emit('attacks',{card:marauder,player:a,defender:b});await settle(game);
  assert.equal(marauder.power,base+3);assertGameStateInvariants(game);
 });
 test(role+': graveyard departure observes a creature spell before its stack face changes',async()=>{
  const f=context(M,role),{game,a}=f;await cast(f,'Along the Crooked Way');
  const creature=put(M,game,a,'Grizzly Bears','graveyard');creature.meta.emryCastTurn=game.turnNo;fund(a);
  assert.equal(await game.castSpell(a,creature,{from:'graveyard'}),true);await settle(game);
  const army=game.bf().find(card=>card.ctrl===a&&card.hasSub('Army'));assert.ok(army);assert.equal(army.counters['+1/+1'],1);assertGameStateInvariants(game);
 });
 test(role+': cast prohibitions check the affected player, card quality and actual origin',async()=>{
  for(const [name,forbidden,allowed]of [['Nikya of the Old Ways','Opt','Runeclaw Bear'],['Llawan, Cephalid Empress','Merfolk Looter','Runeclaw Bear']]){
   const f=context(M,role),{game,a,b}=f,source=await cast(f,name),player=name.startsWith('Nikya')?a:b;
   game.turnPlayer=player;game.phase='main1';fund(player);
   const card=put(M,game,player,forbidden,'hand'),other=put(M,game,player,allowed,'hand'),pool=Object.values(player.pool).reduce((n,v)=>n+v,0);
   assert.equal(game.castableList(player).some(row=>row.card===card),false);assert.equal(await game.castSpell(player,card,{from:'hand'}),false);
   assert.equal(Object.values(player.pool).reduce((n,v)=>n+v,0),pool);assert.equal(card.zone,'hand');
   assert.equal(await game.castSpell(player,other,{from:'hand'}),true);await settle(game);
   await game.move(source,'exile');assert.equal(await game.castSpell(player,card,{from:'hand'}),true);await settle(game);assertGameStateInvariants(game);
  }
  const f=context(M,role),{game,a,b}=f,source=await cast(f,'Drannith Magistrate'),opponent=put(M,game,b,'Think Twice','graveyard'),own=put(M,game,a,'Think Twice','graveyard');
  fund(a);fund(b);assert.equal(await game.castSpell(a,own,{from:'graveyard',alt:{flashback:true,...own.def.flashback}}),true);await settle(game);assert.equal(own.zone,'exile');
  game.turnPlayer=b;game.phase='main1';const options={from:'graveyard',alt:{flashback:true,...opponent.def.flashback}};
  assert.equal(await game.castSpell(b,opponent,options),false);assert.equal(opponent.zone,'graveyard');
  const hand=put(M,game,b,'Opt','hand');assert.equal(await game.castSpell(b,hand,{from:'hand'}),true);await settle(game);
  await game.move(source,'exile');assert.equal(await game.castSpell(b,opponent,options),true);await settle(game);assert.equal(opponent.zone,'exile');assertGameStateInvariants(game);
 });
 test(role+': blocked groups and commander exceptions select only the printed permanents',async()=>{
  const f=context(M,role),{game,a,b}=f,blocked=put(M,game,a,'Runeclaw Bear'),unblocked=put(M,game,a,'Runeclaw Bear'),blocker=put(M,game,b,'Runeclaw Bear'),idle=put(M,game,b,'Runeclaw Bear');
  blocked.attacking=b;blocked.wasBlocked=true;blocked.blockedBy=[blocker];blocker.blocking=blocked.iid;unblocked.attacking=b;
  await cast(f,'Fight to the Death');for(const card of [blocked,blocker])assert.equal(card.zone,'graveyard');for(const card of [unblocked,idle])assert.equal(card.zone,'battlefield');
  const commander=put(M,game,a,'Isamaru, Hound of Konda');commander.commander=true;
  await cast(f,'Slash the Ranks');assert.equal(commander.zone,'battlefield');for(const card of [unblocked,idle])assert.equal(card.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': attachment removal follows the chosen host regardless of attachment control',async()=>{
  const f=context(M,role),{game,a,b}=f,host=put(M,game,b,'Runeclaw Bear'),other=put(M,game,b,'Runeclaw Bear'),sword=put(M,game,a,'Bonesplitter'),aura=put(M,game,b,'Holy Strength'),untouched=put(M,game,a,'Bonesplitter');
  for(const [attachment,target]of [[sword,host],[aura,host],[untouched,other]])assert.equal(await game.attach(attachment,target),true);
  await cast(f,'Strip Bare',[host]);assert.equal(sword.zone,'graveyard');assert.equal(aura.zone,'graveyard');assert.equal(host.zone,'battlefield');assert.equal(untouched.attachedTo,other.iid);assert.equal(untouched.zone,'battlefield');assertGameStateInvariants(game);
 });
 test(role+': Alms Beast grants lifelink to combat partners and removes it outside that pairing',async()=>{
  const f=context(M,role),{game,a,b}=f,beast=await cast(f,'Alms Beast'),blocker=put(M,game,b,'Runeclaw Bear'),other=put(M,game,b,'Runeclaw Bear');
  beast.attacking=b;beast.blockedBy=[blocker];beast.wasBlocked=true;blocker.blocking=beast.iid;game.recalc();
  assert.equal(blocker.kw('lifelink'),true);assert.equal(other.kw('lifelink'),false);const life=b.life;
  await game.damageAny(blocker,beast,2,{combat:true});assert.equal(b.life,life+2);
  blocker.blocking=null;beast.blockedBy=[];game.recalc();assert.equal(blocker.kw('lifelink'),false);
  beast.attacking=null;beast.blocking=other.iid;other.attacking=a;game.recalc();assert.equal(other.kw('lifelink'),true);assertGameStateInvariants(game);
 });
 test(role+': graveyard departure triggers once for each qualifying card in a batch',async()=>{
  const f=context(M,role),{game,a,b}=f;await cast(f,'Along the Crooked Way');
  const creatures=[put(M,game,a,'Runeclaw Bear','graveyard'),put(M,game,a,'Runeclaw Bear','graveyard')],land=put(M,game,a,'Forest','graveyard'),enemy=put(M,game,b,'Runeclaw Bear','graveyard');
  await game.moveGraveyardBatch([...creatures,land,enemy],'exile');await settle(game);
  const armies=game.bf().filter(card=>card.hasSub('Army')&&card.ctrl===a);assert.equal(armies.length,1);assert.equal(armies[0].counters['+1/+1'],2);assertGameStateInvariants(game);
 });
 test(role+': a land entry taps only lands of its current controller',async()=>{
  const f=context(M,role),{game,a,b}=f;await cast(f,'Tectonic Instability');const own=put(M,game,a,'Forest'),enemy=put(M,game,b,'Forest'),entering=put(M,game,b,'Forest','hand');
  await game.move(entering,'battlefield',{ctrl:b});await settle(game);assert.equal(own.tapped,false);assert.equal(enemy.tapped,true);assert.equal(entering.tapped,true);assertGameStateInvariants(game);
 });
 test(role+': group counters include shrouded creatures and preserve controller and type filters',async()=>{
  const f=context(M,role),{game,a,b}=f,bear=put(M,game,a,'Runeclaw Bear'),enemy=put(M,game,b,'Runeclaw Bear');
  bear.def={...bear.def,kws:[...(bear.def.kws||[]),'shroud']};game.recalc();await cast(f,'Vraska Joins Up');
  assert.equal(bear.counters.deathtouch,1);assert.equal(bear.kw('deathtouch'),true);assert.equal(enemy.counters.deathtouch,undefined);
  const bumi=await cast(f,'Bumi, Eclectic Earthbender'),land=put(M,game,a,'Forest'),animated=put(M,game,a,'Dryad Arbor');
  bumi.attacking=b;await game.emit('attacks',{card:bumi,player:a,defender:b});await settle(game);
  assert.equal(animated.counters['+1/+1'],2);for(const card of [land,bear,enemy,bumi])assert.equal(card.counters['+1/+1'],undefined);assertGameStateInvariants(game);
 });
 test(role+': group damage reaches both card types once in the same batch',async()=>{
  const f=context(M,role),{game,a,b}=f,bear=put(M,game,a,'Runeclaw Bear'),enemy=put(M,game,b,'Runeclaw Bear'),walker=put(M,game,b,'Jace, Cunning Castaway'),land=put(M,game,b,'Forest');
  game.addCounters(walker,'loyalty',8);const loyalty=walker.counters.loyalty,life=b.life;
  await cast(f,'Dragonback Assault');assert.equal(bear.zone,'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(walker.counters.loyalty,loyalty-3);assert.equal(land.zone,'battlefield');assert.equal(b.life,life);assertGameStateInvariants(game);
 });
 test(role+': Ulamog exiles twenty cards from the attacked player and keeps the caster library',async()=>{
  const f=context(M,role),{game,a,b}=f,one=put(M,game,b,'Forest'),two=put(M,game,b,'Forest');
  const ulamog=await cast(f,'Ulamog, the Ceaseless Hunger',[one,two]),own=a.library.length,top=b.library.slice(-20).map(card=>card.iid);
  ulamog.attacking=b;await game.emit('attacks',{card:ulamog,player:a,defender:b});await settle(game);
  assert.equal(a.library.length,own);assert.equal(b.library.length,10);assert.deepEqual(b.exile.filter(card=>top.includes(card.iid)).map(card=>card.iid).sort((x,y)=>x-y),top.sort((x,y)=>x-y));assertGameStateInvariants(game);
 });
 test(role+': redraw accepts zero or several cards and adds the printed bonus',async()=>{
  for(const count of [0,2]){
   const f=context(M,role),{game,a}=f,cards=[put(M,game,a,'Forest','hand'),put(M,game,a,'Opt','hand')],decide=a.controller.decide.bind(a.controller);
   a.controller.decide=(g,q)=>q.prompt==='Discard cards, then draw that many'?cards.slice(0,count):decide(g,q);
   const library=a.library.length;await cast(f,'Into the Night');assert.equal(a.library.length,library-count-1);assert.equal(game.bomDayNight,'night');
   for(const [i,card]of cards.entries())assert.equal(card.zone,i<count?'graveyard':'hand');assertGameStateInvariants(game);
  }
 });
 test(role+': restricted Turbine mana pays an activated ability and cannot cast a spell',async()=>{
  const f=context(M,role),{game,a,b}=f;await cast(f,"Jester's Cap");await cast(f,'Thran Turbine');for(const color of Object.keys(a.pool))a.pool[color]=0;a.poolMeta=[];
  await game.emit('upkeep',{player:a});await settle(game);assert.equal(a.pool.C,2);
  const ring=put(M,game,a,'Sol Ring','hand');assert.equal(await game.castSpell(a,ring,{from:'hand'}),false);assert.equal(a.pool.C,2);
  const cap=game.bf().find(card=>card.name==="Jester's Cap"),decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:decide(g,q);
  assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===cap)),true);await settle(game);assert.equal(a.pool.C,0);assert.equal(cap.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': hostile library search preserves ownership and uses the searching player for choices',async()=>{
  const f=context(M,role),{game,a,b}=f,card=put(M,game,b,'Runeclaw Bear','library'),decide=a.controller.decide.bind(a.controller);let searches=0;
  a.controller.decide=(g,q)=>{if(q.type==='chooseCards'&&q.search){searches++;assert.ok(q.from.includes(card));return [card];}return decide(g,q);};
  await cast(f,'Bribery',[b]);assert.equal(searches,1);assert.equal(card.zone,'battlefield');assert.equal(card.ctrl,a);assert.equal(card.owner,b);assert.equal(b.library.includes(card),false);assertGameStateInvariants(game);
 });
 test(role+': snow and Desert landwalk require a matching land controlled by the defending player',async()=>{
  for(const [name,ordinary,matching] of [['Rime Dryad','Forest','Snow-Covered Forest'],['Legions of Lim-Dûl','Swamp','Snow-Covered Swamp'],['Zombie Musher','Island','Snow-Covered Island'],['Desert Nomads','Forest','Desert']]){
   const {game,a,b}=context(M,role),attacker=put(M,game,a,name),blocker=put(M,game,b,'Runeclaw Bear');attacker.attacking=b;
   put(M,game,b,ordinary);put(M,game,a,matching);assert.equal(game.canBlock(blocker,attacker),true,name+': attacker-owned qualifying land does not grant evasion');
   const land=put(M,game,b,matching);assert.equal(game.canBlock(blocker,attacker),false,name+': correct defending land grants evasion');
   await game.move(land,'graveyard');assert.equal(game.canBlock(blocker,attacker),true,name+': removing that land restores blocking');assertGameStateInvariants(game);
  }
 });
 test(role+': the Incubator created by Norn transforms into a Phyrexian and triggers both observers',async()=>{
  const f=context(M,role),{game,a}=f;await cast(f,'Cult of the Waxing Moon');await cast(f,"Norn's Inquisitor");
  const token=game.bf().find(card=>card.hasSub('Incubator'));assert.ok(token);assert.equal(token.counters['+1/+1'],2);
  fund(a);const ability=game.activatableList(a).find(row=>row.card===token);assert.ok(ability);assert.equal(await game.activateAbility(a,ability),true);await settle(game);
  assert.equal(token.oracleFace,'back');assert.equal(token.hasSub('Phyrexian'),true);assert.equal(token.counters['+1/+1'],3);assert.equal(game.bf().filter(card=>card.isToken&&card.hasSub('Wolf')).length,1);assertGameStateInvariants(game);
 });
 test(role+': Raffine connives X once, discards X together and counts only nonlands',async()=>{
  const f=context(M,role),{game,a,b}=f,raffine=await cast(f,'Raffine, Scheming Seer'),bear=put(M,game,a,'Runeclaw Bear'),one=put(M,game,a,'Opt','hand'),two=put(M,game,a,'Shock','hand');
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(bear)?[bear]:q.type==='chooseCards'&&/^Connive/.test(q.prompt)?[one,two]:decide(g,q);
  raffine.attacking=b;bear.attacking=b;game.combat={attackers:[raffine,bear],defenders:new Map()};const cards=a.hand.length,library=a.library.length;
  await game.emit('attackersDeclared',{player:a,attackers:[raffine,bear]});await settle(game);
  assert.equal(a.library.length,library-2);assert.equal(a.hand.length,cards);assert.equal(one.zone,'graveyard');assert.equal(two.zone,'graveyard');assert.equal(bear.counters['+1/+1'],2);
  await game.connive(bear,0);assert.equal(a.library.length,library-2);assert.equal(bear.counters['+1/+1'],2);assertGameStateInvariants(game);
 });
 test(role+': temporary afterlife stacks independently and follows only the original recipient',async()=>{
  const f=context(M,role),{game,a}=f,bear=put(M,game,a,'Runeclaw Bear');
  await cast(f,'Afterlife Insurance');await cast(f,'Afterlife Insurance');
  await game.move(bear,'graveyard');await settle(game);
  assert.equal(game.bf().filter(card=>card.ctrl===a&&card.isToken&&card.hasSub('Spirit')).length,2);
  await game.move(bear,'battlefield',{ctrl:a});assert.equal(bear.cur.extraTriggers.length,0);assertGameStateInvariants(game);
 });
 test(role+': last-turn life records come from the actual turn boundary and expire the following turn',async()=>{
  const f=context(M,role),{game,a}=f;await cast(f,'First Response');await game.loseLife(a,2,'history witness');
  await cleanup(game);assert.equal(a.oracleLastTurnV12.lifeLost,2);await game.emit('upkeep',{player:a});await settle(game);
  const soldiers=()=>game.bf().filter(card=>card.ctrl===a&&card.isToken&&card.hasSub('Soldier')).length;assert.equal(soldiers(),1);
  await cleanup(game);assert.equal(a.oracleLastTurnV12.lifeLost,0);await game.emit('upkeep',{player:a});await settle(game);assert.equal(soldiers(),1);assertGameStateInvariants(game);
 });
 test(role+': next-untap restriction includes later permanents and survives a skipped untap',async()=>{
  const f=context(M,role),{game,a,b}=f,land=put(M,game,b,'Forest');land.tapped=true;
  await cast(f,'Exhaustion',[b]);const late=put(M,game,b,'Runeclaw Bear');late.tapped=true;const unaffected=put(M,game,a,'Forest');unaffected.tapped=true;
  game.untilEffects.push({kind:'oracleSkipV10',player:b,phase:'untap',n:1,expires:'never'});
  await phaseEntryV10(game,b,'untap');assert.ok(game.untilEffects.some(effect=>effect.kind==='oracleNextUntapV12'));
  await phaseEntryV10(game,b,'untap');assert.equal(land.tapped,true);assert.equal(late.tapped,true);assert.equal(unaffected.tapped,true);
  await phaseEntryV10(game,b,'untap');assert.equal(land.tapped,false);assert.equal(late.tapped,false);assertGameStateInvariants(game);
 });
 test(role+': damage threshold counts a single event and does not sum earlier damage',async()=>{
  const f=context(M,role),{game,a,b}=f,watcher=await cast(f,'Innocent Bystander'),enemy=put(M,game,b,'Runeclaw Bear');
  game.addCounters(watcher,'+1/+1',10);await game.damageBatch([{src:enemy,target:watcher,n:2}]);await settle(game);
  const clues=()=>game.bf().filter(card=>card.hasSub('Clue')).length;assert.equal(clues(),0);
  await game.damageBatch([{src:enemy,target:watcher,n:1}]);await settle(game);assert.equal(clues(),0);
  await game.damageBatch([{src:enemy,target:watcher,n:3}]);await settle(game);assert.equal(clues(),1);assertGameStateInvariants(game);
 });
 test(role+': an explicit night instruction transforms existing daybound objects once',async()=>{
  const f=context(M,role),{game,a}=f,werewolf=await cast(f,'Tavern Ruffian // Tavern Smasher');
  assert.equal(game.bomDayNight,'day');const version=werewolf.zoneVersion;await cast(f,'Unnatural Moonrise',[werewolf]);
  assert.equal(game.bomDayNight,'night');assert.equal(werewolf.oracleFace,'back');assert.equal(werewolf.zoneVersion,version);
  await cast(f,'Unnatural Moonrise',[werewolf]);assert.equal(werewolf.oracleFace,'back');assert.equal(werewolf.zoneVersion,version);assertGameStateInvariants(game);
 });
 test(role+': a paid grant binds its recipient and expires at cleanup after the granter leaves',async()=>{
  const f=context(M,role),{game,a}=f,granter=await cast(f,'Greater Stone Spirit'),bear=put(M,game,a,'Runeclaw Bear'),decide=a.controller.decide.bind(a.controller);fund(a);
  a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(bear)?[bear]:decide(g,q);
  const ability=game.activatableList(a).find(row=>row.card===granter);assert.ok(ability);assert.equal(await game.activateAbility(a,ability),true);await settle(game);
  assert.equal(bear.toughness,4);await game.move(granter,'graveyard');
  const granted=game.activatableList(a).find(row=>row.card===bear);assert.ok(granted);assert.equal(await game.activateAbility(a,granted),true);await settle(game);
  assert.equal(bear.power,3);assert.equal(bear.toughness,4);await cleanup(game);
  assert.equal(bear.power,2);assert.equal(bear.toughness,2);assert.equal(game.activatableList(a).some(row=>row.card===bear),false);assertGameStateInvariants(game);
 });
 test(role+': simultaneous targets receive independent fight abilities and paid Strive costs',async()=>{
  const f=context(M,role),{game,a,b}=f,first=put(M,game,a,'Runeclaw Bear'),second=put(M,game,a,'Runeclaw Bear'),enemy=put(M,game,b,'Runeclaw Bear');
  await cast(f,'Setessan Tactics',[first,second],3);for(const card of [first,second]){assert.equal(card.power,3);assert.equal(card.toughness,3);assert.ok(game.activatableList(a).some(row=>row.card===card));}
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(enemy)?[enemy]:decide(g,q);
  const ability=game.activatableList(a).find(row=>row.card===first);assert.equal(await game.activateAbility(a,ability),true);assert.equal(first.tapped,true);assert.equal(second.tapped,false);await settle(game);
  assert.equal(enemy.zone,'graveyard');assert.equal(first.damage,2);assert.equal(second.damage,0);assertGameStateInvariants(game);
 });
 test(role+': grant continuation has one original target and chooses its triggered target later',async()=>{
  const f=context(M,role),{game,a,b}=f,bear=put(M,game,a,'Runeclaw Bear'),enemy=put(M,game,b,'Runeclaw Bear');bear.tapped=true;
  await cast(f,"Legolas's Quick Reflexes",[bear]);assert.equal(bear.tapped,false);assert.equal(bear.kw('hexproof'),true);assert.equal(bear.kw('reach'),true);
  const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(enemy)?[enemy]:decide(g,q);
  game.tap(bear);await settle(game);assert.equal(enemy.zone,'graveyard');assert.equal(bear.damage,0);await cleanup(game);assert.equal(bear.kw('hexproof'),false);assertGameStateInvariants(game);
 });
 test(role+': additive colors/types and base statistics preserve counters and expire',async()=>{
  const f=context(M,role),{game,a}=f,bear=put(M,game,a,'Runeclaw Bear');game.addCounters(bear,'+1/+1',1);
  await cast(f,'Phantasmal Form',[bear]);assert.equal(bear.power,4);assert.equal(bear.toughness,4);assert.equal(bear.kw('flying'),true);assert.equal(bear.hasSub('Bear'),true);assert.equal(bear.hasSub('Illusion'),true);assert.ok(bear.colors.includes('G')&&bear.colors.includes('U'));
  await cleanup(game);assert.equal(bear.power,3);assert.equal(bear.hasSub('Illusion'),false);assert.equal(bear.kw('flying'),false);assert.deepEqual([...bear.colors],['G']);assertGameStateInvariants(game);
 });
 test(role+': Background follows owned commanders and checks defending player life again on resolution',async()=>{
  const f=context(M,role,2),{game,a,b,others}=f;await cast(f,'Guild Artisan');const commander=put(M,game,a,'Runeclaw Bear');commander.commander=true;game.recalc();
  const attack=async target=>{commander.attacking=target;await game.emit('attacks',{card:commander,player:a,defender:target});await game.flushTriggers();};
  b.life=41;others[1].life=42;await attack(b);assert.equal(game.stack.length,0);
  b.life=42;await attack(b);assert.equal(game.stack.length,1);others[1].life=43;await settle(game);assert.equal(game.bf().filter(card=>card.hasSub('Treasure')).length,0);
  b.life=43;await attack(b);await settle(game);assert.equal(game.bf().filter(card=>card.hasSub('Treasure')).length,2);
  const walker=put(M,game,b,'Jace, Cunning Castaway');await attack(walker);assert.equal(game.stack.length,0);
  commander.attacking=null;assertGameStateInvariants(game);
 });
}
