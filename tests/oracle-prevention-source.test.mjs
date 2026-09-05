import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';
import { context, put, settle } from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),source=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-prevention-source.json',import.meta.url)));
const entries=source.map((card,i)=>{const semantic=semanticClass(card),words=card.type_line.split(' — ')[0].split(' ');assert.ok(semantic.semanticClass,card.name+': '+semantic.reason);return {position:i+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:card.oracle_text,types:words.filter(word=>!['Legendary','Basic','Snow','World'].includes(word)),super:words.filter(word=>['Legendary','Basic','Snow','World'].includes(word)),subtypes:card.type_line.split(' — ')[1]?.split(' ')||[],power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};});
M.registerOracleBatch({id:'oracle-prevention-source-proof',sequence:9992,cards:entries.filter(entry=>!M.DEFS[entry.raw.name])});M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=20;};
function setup(role,opponents=1){const ctx=context(M,role,opponents);assert.equal(ctx.a.controller instanceof M.AIController,role==='ai');if(role==='human'){const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>{if(q.type==='chooseX'||q.type==='chooseTargets'&&ctx.targets){const result=q.type==='chooseX'?Math.min(2,q.max??2):ctx.targets.filter(c=>q.candidates.includes(c)).slice(0,q.count??q.max??2);ctx.trace.push({q,result});return result;}return decide(g,q);};}return ctx;}
function witness(ctx,p=ctx.b,extra={}){const card=new M.CardInst({name:'Damage witness',cost:'{R}',types:['Creature'],subtypes:['Giant'],power:'8',toughness:'40',colorsOverride:['R'],...extra},p);card.zone='battlefield';card.sick=false;ctx.game.battlefield.push(card);ctx.game.recalc();return card;}
async function cast(ctx,name){fund(ctx.a);const card=put(M,ctx.game,ctx.a,name,'hand');if(card.is('Land'))assert.equal(await ctx.game.playLand(ctx.a,card),true);else{assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true,name+': real paid cast');assert.ok(Object.values(ctx.a.pool).reduce((a,b)=>a+b,0)<120);await settle(ctx.game);}return card;}
async function activate(ctx,card){fund(ctx.a);card.sick=false;const action=ctx.game.activatableList(ctx.a).find(row=>row.card===card&&!row.mana);assert.ok(action,card.name+': legal printed ability');assert.equal(await ctx.game.activateAbility(ctx.a,action),true);await settle(ctx.game);}
async function cleanup(ctx){ctx.game.mainPhase=async()=>{};ctx.game.combatPhase=async()=>{};await ctx.game.runTurn();}
for(const role of ['human','ai']){
 for(const name of ['Consulate Surveillance','Prahv, Spires of Order','Burrenton Forge-Tender','Pay No Heed','Auriok Replica',"Ajani's Aid"]){
  test(`${role}: ${name} chooses a real source and prevents repeated matching damage throughout this turn only`,async()=>{
   const ctx=setup(role),{game,a,b}=ctx,enemy=witness(ctx),friendly=witness(ctx,a,{colorsOverride:['G']});
   const card=await cast(ctx,name);if(name!=='Pay No Heed')await activate(ctx,card);
   const shield=game.untilEffects.find(e=>e.kind==='oracleChosenSourcePrevention'&&e.sourceCard===card);assert.ok(shield);assert.equal(shield.sourceRecord.card,enemy);assert.equal(shield.effect.allTurn,true);
   assert.ok(ctx.trace.some(row=>row.q.aiHint?.kind==='damagePreventionSource'));
   const combat=!!shield.effect.combat;
   if(combat)assert.equal(await game.damagePlayer(enemy,a,2),2,'combat-only shield excludes noncombat');
   assert.equal(await game.damagePlayer(enemy,a,3,{combat}),0);assert.equal(await game.damagePlayer(enemy,a,2,{combat}),0);assert.equal(shield.consumed,false);
   assert.equal(await game.damagePlayer(friendly,a,1,{combat}),1,'other source excluded');
   assert.equal(await game.damageCreature(enemy,friendly,2,{combat}),shield.target?2:0,'recipient scope preserved');
   await cleanup(ctx);assert.equal(await game.damagePlayer(enemy,a,1,{combat}),1,'shield expires at actual cleanup');
   if(name==='Consulate Surveillance')assert.equal(M.OracleV8Energy.count(a),2,'printed energy cost paid');
   if(['Burrenton Forge-Tender','Auriok Replica',"Ajani's Aid"].includes(name))assert.equal(card.zone,'graveyard','printed sacrifice paid');
  });
 }
 test(`${role}: a paid all-turn shield preserves exact identity across simulation, control changes and prevented-damage locks`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,enemy=witness(ctx),card=await cast(ctx,'Pay No Heed'),clone=M.cloneGameForAISimulation(game,6159),clonedEnemy=clone.byIid(enemy.iid),clonedA=clone.players[a.idx];
  assert.equal(await clone.damagePlayer(clonedEnemy,clonedA,3),0);assert.equal(a.life,40);assert.notEqual(clone.untilEffects.find(e=>e.sourceCard?.iid===card.iid),game.untilEffects.find(e=>e.sourceCard===card));
  M.OracleV8Control.gain(game,enemy,a);game.recalc();assert.equal(await game.damagePlayer(enemy,a,2),0,'chosen identity survives control changes');
  const lock=await cast(ctx,'Everlasting Torment');assert.equal(await game.damagePlayer(enemy,a,2),2,'cannot-prevent overrides the shield');await game.move(lock,'graveyard');assert.equal(await game.damagePlayer(enemy,a,2),0,'unpreventable damage does not consume or delete the shield');
  await game.move(enemy,'exile');await game.putPermanentOntoBattlefield(enemy,b);assert.equal(await game.damagePlayer(enemy,a,1),1,'new battlefield incarnation is a different source');
 });
 test(`${role}: already resolved global prevention survives its caster leaving a multiplayer game`,async()=>{
  const ctx=setup(role,2),{game,a,b}=ctx,c=ctx.others[1],enemy=witness(ctx),card=await cast(ctx,'Pay No Heed');await game.playerLoses(a,'source-caster departure proof');assert.equal(game.gameOver,false);assert.equal(card.zone,'ceased');
  assert.equal(await game.damagePlayer(enemy,c,3),0,'CR800.4a does not end a resolved global prevention effect');assert.equal(await game.damagePlayer(enemy,c,2),0);game.turnPlayer=b;await cleanup(ctx);assert.equal(await game.damagePlayer(enemy,c,1),1,'printed duration still ends at cleanup');
 });
 test(`${role}: an actual Sparkmage ability pays its tap cost and is prevented without a damage event`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,spark=put(M,game,b,'Cunning Sparkmage');await cast(ctx,'Pay No Heed');
  let hits=0;const emit=game.emit.bind(game);game.emit=async(event,data)=>{if(event==='dealtDamage'&&data.src?.iid===spark.iid)hits++;return emit(event,data);};
  for(let i=0;i<2;i++){game.untap(spark);const action=game.activatableList(b).find(row=>row.card===spark);assert.ok(action);assert.equal(await game.activateAbility(b,action),true);assert.equal(spark.tapped,true);await settle(game);}
  assert.equal(a.life,40);assert.equal(hits,0);
 });
 for(const name of ['Soul Parry','Resistance Fighter','Azorius Ploy','Serene Sunset'])test(`${role}: ${name} locks actual selected sources and respects damage kind, blink and cleanup`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,enemy=witness(ctx),other=witness(ctx,b,{name:'Other enemy'}),own=witness(ctx,a,{colorsOverride:['G']});ctx.targets=[enemy,other];
  const card=await cast(ctx,name);if(name==='Resistance Fighter')await activate(ctx,card);
  const targetRows=ctx.trace.filter(row=>row.q.type==='chooseTargets');assert.ok(targetRows.length);const chosen=targetRows.flatMap(row=>row.result).filter(c=>c instanceof M.CardInst);assert.ok(chosen.length);assert.ok(chosen.every(c=>c.ctrl===b||name==='Azorius Ploy'));
  const selected=chosen[0],combat=name!=='Soul Parry';
  assert.equal(await game.damagePlayer(selected,a,2,{combat}),0);assert.equal(await game.damagePlayer(selected,a,2,{combat}),0);
  if(combat)assert.equal(await game.damagePlayer(selected,a,1),1);
  const old=selected.zoneVersion;await game.move(selected,'exile');await game.putPermanentOntoBattlefield(selected,b);assert.equal(selected.zoneVersion,old+2);assert.equal(await game.damagePlayer(selected,a,1,{combat}),1,'old object restriction cannot follow blink');
  await cleanup(ctx);assert.equal(await game.damagePlayer(other,a,1,{combat}),1);
 });
 test(`${role}: Radiant Kavu, Luminesce and Repel use live source colors/types, later entrants and the entire turn`,async()=>{
  for(const name of ['Radiant Kavu','Luminesce','Repel the Abominable']){
   const ctx=setup(role),{game,a,b}=ctx,red=witness(ctx),blue=witness(ctx,b,{colorsOverride:['U']}),black=witness(ctx,b,{colorsOverride:['B']}),human=witness(ctx,b,{colorsOverride:['G'],subtypes:['Human']});
   const card=await cast(ctx,name);if(name==='Radiant Kavu')await activate(ctx,card);const combat=name==='Radiant Kavu';
   const cases=name==='Radiant Kavu'?[[red,1],[blue,0],[black,0],[human,1]]:name==='Luminesce'?[[red,0],[blue,1],[black,0],[human,1]]:[[red,0],[blue,0],[black,0],[human,1]];
   for(const [from,expected] of cases)assert.equal(await game.damagePlayer(from,a,1,{combat}),expected);
   const late=witness(ctx,b,{colorsOverride:['B']});assert.equal(await game.damagePlayer(late,a,1,{combat}),0,'damage replacement sees later sources');
   late.def={...late.def,colorsOverride:['G'],subtypes:['Human']};game.recalc();assert.equal(await game.damagePlayer(late,a,1,{combat}),1,'live qualities are rechecked');
   if(combat)assert.equal(await game.damagePlayer(black,a,1),1);
   await cleanup(ctx);assert.equal(await game.damagePlayer(black,a,1,{combat}),1);
  }
 });
 test(`${role}: Eerie Interference protects exactly the caster and their creatures from creature sources`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,enemy=witness(ctx),own=witness(ctx,a),ring=put(M,game,a,'Garruk, Primal Hunter'),spell=put(M,game,b,'Lightning Bolt','hand');game.addCounters(ring,'loyalty',3);await cast(ctx,'Eerie Interference');
  assert.equal(await game.damagePlayer(enemy,a,2),0);assert.equal(await game.damageCreature(enemy,own,2),0);assert.equal(await game.damagePlayer(enemy,b,2),2);assert.equal(await game.damageAny(enemy,ring,1,{deferSBA:true}),1);assert.equal(await game.damagePlayer(spell,a,2),2);
  M.OracleV8Control.gain(game,own,b);game.recalc();assert.equal(await game.damageCreature(enemy,own,1),1,'current controller determines recipient group');
 });
 test(`${role}: Chameleon Blur prevents creature damage to every player but leaves permanent and spell damage intact`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,enemy=witness(ctx),own=witness(ctx,a),spell=put(M,game,b,'Lightning Bolt','hand');await cast(ctx,'Chameleon Blur');
  assert.equal(await game.damagePlayer(enemy,a,2),0);assert.equal(await game.damagePlayer(own,b,2),0);assert.equal(await game.damageCreature(enemy,own,2),2);assert.equal(await game.damagePlayer(spell,a,2),2);
 });
 test(`${role}: Hindervines dynamically respects counters while Snag excludes blocked attackers`,async()=>{
  for(const name of ['Hindervines','Snag']){const ctx=setup(role),{game,a}=ctx,enemy=witness(ctx),other=witness(ctx);enemy.attacking=other.attacking=a;other.wasBlocked=true;other.blockedBy=[];if(name==='Hindervines')game.addCounters(other,'+1/+1',1);await cast(ctx,name);
   assert.equal(await game.damagePlayer(enemy,a,2,{combat:true}),0);assert.equal(await game.damagePlayer(other,a,2,{combat:true}),2);assert.equal(await game.damagePlayer(enemy,a,2),2);
   if(name==='Hindervines'){game.addCounters(enemy,'+1/+1',1);assert.equal(await game.damagePlayer(enemy,a,1,{combat:true}),1);game.removeCounters(other,'+1/+1',1);assert.equal(await game.damagePlayer(other,a,1,{combat:true}),0);}
   else {enemy.wasBlocked=true;assert.equal(await game.damagePlayer(enemy,a,1,{combat:true}),1,'a departed blocker does not make its attacker unblocked');}
  }
 });
 test(`${role}: Snag prevents normal combat and a later extra combat after real attack declarations`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,enemy=witness(ctx);game.turnPlayer=b;const decide=b.controller.decide.bind(b.controller);b.controller.decide=async(g,q)=>q.type==='attackers'?[{card:enemy,target:a}]:decide(g,q);game.reviewCombatWithHuman=async()=>{};await cast(ctx,'Snag');
  const events=[];const emit=game.emit.bind(game);game.emit=async(name,data)=>{if(name==='attacks'||name==='damagePrevented')events.push({name,data});return emit(name,data);};
  for(let i=0;i<2;i++){game.untap(enemy);await game.combatPhase(b);assert.equal(a.life,40);}
  assert.equal(events.filter(e=>e.name==='attacks'&&e.data.card===enemy).length,2);assert.equal(events.filter(e=>e.name==='damagePrevented').reduce((n,e)=>n+e.data.n,0),16);assert.equal(game.combat,null);
 });
 test(`${role}: Personal Sanctuary follows whose turn it is and stops with the static source`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,enemy=witness(ctx),card=await cast(ctx,'Personal Sanctuary');assert.equal(await game.damagePlayer(enemy,a,2),0);assert.equal(await game.damagePlayer(enemy,b,2),2);game.turnPlayer=b;assert.equal(await game.damagePlayer(enemy,a,2),2);game.turnPlayer=a;await game.move(card,'graveyard');assert.equal(await game.damagePlayer(enemy,a,2),2);
 });
 test(`${role}: Energy Field distinguishes source control and sacrifices on a real card entering its controller's graveyard`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,enemy=witness(ctx),own=witness(ctx,a),card=await cast(ctx,'Energy Field');
  assert.equal(await game.damagePlayer(enemy,a,2),0);assert.equal(await game.damagePlayer(own,a,2),2);assert.equal(await game.damagePlayer(enemy,b,2),2);
  const discarded=put(M,game,a,'Forest','hand');await game.discard(a,[discarded]);assert.equal(card.zone,'battlefield');assert.ok(game.pendingTriggers.length);await settle(game);assert.equal(card.zone,'graveyard');assert.equal(await game.damagePlayer(enemy,a,2),2);
 });
 for(const name of ['Goblin Furrier','Indentured Oaf'])test(`${role}: ${name} only prevents its own damage to the printed creature quality`,async()=>{
  const ctx=setup(role),{game,a,b}=ctx,matching=witness(ctx,b,name==='Goblin Furrier'?{super:['Snow']}:{colorsOverride:['R']}),other=witness(ctx,b,{colorsOverride:['G']}),card=await cast(ctx,name);assert.equal(await game.damageCreature(card,matching,2),0);assert.equal(await game.damageCreature(card,other,2),2);assert.equal(await game.damagePlayer(card,b,2),2);assert.equal(await game.damageCreature(other,matching,1),1);await game.phaseOut(card);assert.equal(await game.damageCreature(card,matching,1),1,'phased source contributes no static prevention');
 });
}
test('prevention grammar rejects duration, source and recipient riders outside the closed semantics',()=>{
 for(const oracle_text of ['Prevent all damage a source of your choice would deal until your next turn.','Prevent all damage a source of your choice would deal this turn. You draw that many cards.','Prevent all damage that creatures would deal to players this turn unless an opponent pays {1}.','Prevent all damage target creature would deal this turn if you gained life.'])assert.equal(semanticClass({name:'Unclosed prevention',layout:'normal',type_line:'Instant',mana_cost:'{W}',oracle_text}).semanticClass,undefined,oracle_text);
});
