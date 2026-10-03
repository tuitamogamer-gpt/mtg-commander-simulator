import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
const M=loadEngine(),rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v27-common.json',import.meta.url),'utf8'));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9958,compilerVersion:27}),batch=runtimeBatch(plan.report),absent=batch.cards.filter(entry=>!M.DEFS[entry.raw.name]);if(absent.length)M.registerOracleBatch({...batch,cards:absent});M.initData(M.RAW_DATA);
for(const row of rows)test(row.name+': complete source rejects unsupported appended text',()=>{
 assert.ok(semanticClass(row,{compilerVersion:27}).semanticClass);
 assert.ok(!semanticClass({...row,oracle_text:row.oracle_text+'\nWhenever an opponent sings, restart the game.'},{compilerVersion:27}).semanticClass);
});
const total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0),fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;};
async function paid(f,name,n){fund(f.a);const old=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(g,q)=>q.aiHint?.kind==='entryNumber'?n:old(g,q);const source=put(M,f.game,f.a,name,'hand'),before=total(f.a);assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);assert.ok(total(f.a)<before);await settle(f.game);return source;}
for(const name of ['Sanctum Prelate','Talion, the Kindly Lord','Squall, Gunblade Duelist'])test('natural local AI chooses a legal small entry number for '+name,async()=>{
 const f=context(M,'ai');fund(f.a);const source=put(M,f.game,f.a,name,'hand');assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);assert.equal(source.meta.oracleEntryNumberV27.n,2);assertGameStateInvariants(f.game);
});
for(const role of ['human','ai']){
 test(role+': Sanctum Prelate blocks matching noncreature spells for every player and releases the prohibition when it leaves',async()=>{
  const f=context(M,role),{game,a,b}=f;await paid(f,'Sanctum Prelate',2);fund(b);
  const creature=put(M,game,a,'Grizzly Bears','hand');assert.equal(await game.castSpell(a,creature,{from:'hand'}),true);const target=game.stack.at(-1),counter=put(M,game,b,'Counterspell','hand'),before=total(b);
  assert.equal(await game.castSpell(b,counter,{from:'hand',quickTargets:[target]}),false);assert.equal(total(b),before);assert.equal(counter.zone,'hand');
  await game.move(game.bf().find(c=>c.name==='Sanctum Prelate'),'exile');assert.equal(await game.castSpell(b,counter,{from:'hand',quickTargets:[target]}),true);assert.equal(total(b),before-2);await settle(game);assert.equal(creature.zone,'graveyard');assertGameStateInvariants(game);
 });
 test(role+': Sanctum Prelate uses announced X in a noncreature spell mana value',async()=>{
  const f=context(M,role),{game,a}=f;await paid(f,'Sanctum Prelate',3);
  const source=new M.CardInst({name:'Announced X spell proof',cost:'{X}{R}',types:['Instant'],subtypes:[],super:[],kws:[],resolve:async ctx=>ctx.g.draw(ctx.you,1)},a);source.zone='hand';a.hand.push(source);const before=total(a);
  assert.equal(await game.castSpell(a,source,{from:'hand',xVal:2}),false);assert.equal(source.zone,'hand');assert.equal(total(a),before);
  assert.equal(await game.castSpell(a,source,{from:'hand',xVal:1}),true);assert.equal(total(a),before-2);await settle(game);assertGameStateInvariants(game);
 });
 for(const match of ['mv','power','toughness'])test(role+': Talion observes matching '+match+' when an opponent casts and triggers only once',async()=>{
  const f=context(M,role),{game,a,b}=f,number=match==='mv'?2:3;const source=await paid(f,'Talion, the Kindly Lord',number);fund(b);
  const card=match==='mv'?put(M,game,b,'Grizzly Bears','hand'):new M.CardInst({...M.DEFS['Grizzly Bears'],name:'Talion '+match+' witness',cost:'{G}',power:match==='power'?'3':'2',toughness:match==='toughness'?'3':'2'},b);
  if(card.zone!=='hand'){card.zone='hand';b.hand.push(card);}const hand=a.hand.length,life=b.life;
  game.turnPlayer=b;assert.equal(await game.castSpell(b,card,{from:'hand'}),true);await game.flushTriggers();assert.equal(game.stack.filter(row=>row.srcCard===source).length,1);
  await game.move(source,'exile');await settle(game);assert.equal(b.life,life-2);assert.equal(a.hand.length,hand+1);assertGameStateInvariants(game);
 });
 test(role+': Talion ignores its controller and nonmatching opponent spells',async()=>{
  const f=context(M,role),{game,a,b}=f;await paid(f,'Talion, the Kindly Lord',2);fund(b);const hand=a.hand.length,life=b.life;
  assert.equal(await game.castSpell(a,put(M,game,a,'Grizzly Bears','hand'),{from:'hand'}),true);await settle(game);
  game.turnPlayer=b;assert.equal(await game.castSpell(b,put(M,game,b,'Llanowar Elves','hand'),{from:'hand'}),true);await settle(game);assert.equal(a.hand.length,hand);assert.equal(b.life,life);assertGameStateInvariants(game);
 });
}
for(const role of ['human','ai']){
 for(const variant of ['own attack','third-party attack','two defenders','no match','condition changes','source leaves','attacker leaves','two Squalls'])test(role+': Squall native combat '+variant,async()=>{
  const f=context(M,role,2),{game,a,b}=f,c=f.others[1],source=await paid(f,'Squall, Gunblade Duelist',2),sources=[source];
  if(variant==='two Squalls'){put(M,game,a,'Mirror Gallery');sources.push(await paid(f,'Squall, Gunblade Duelist',3));}
  const attackingPlayer=variant==='third-party attack'?c:a;
  const first=put(M,game,attackingPlayer,'Grizzly Bears'),second=put(M,game,attackingPlayer,'Grizzly Bears');
  if(variant==='no match'){first.def={...first.def,power:'4',toughness:'4'};second.def={...second.def,power:'4',toughness:'4'};}
  if(variant==='two Squalls')second.def={...second.def,power:'3',toughness:'3'};
  game.recalc();const old=attackingPlayer.controller.decide.bind(attackingPlayer.controller);
  attackingPlayer.controller.decide=(g,q)=>q.type==='attackers'?[{card:first,target:b},{card:second,target:variant==='two defenders'?c:b}]:old(g,q);
  const hits=[],damage=game.damagePlayer;game.damagePlayer=async function(src,p,n,opts={}){if(sources.some(s=>s.iid===src?.iid)&&!opts.combat)hits.push({src,p,n});return damage.call(this,src,p,n,opts);};
  let changed=false;game.priorityRound=async()=>{
   if(!changed&&game.stack.some(row=>sources.includes(row.srcCard))){changed=true;
    if(variant==='condition changes'){first.def={...first.def,power:'4',toughness:'4'};second.def={...second.def,power:'4',toughness:'4'};game.recalc();}
    if(variant==='source leaves'){source.def={...source.def,power:'6'};game.recalc();await game.move(source,'exile');}
    if(variant==='attacker leaves'){await game.move(first,'exile');await game.move(second,'exile');}
   }await settle(game);
  };
  game.turnPlayer=attackingPlayer;await game.combatPhase(attackingPlayer);await settle(game);
  const expected=['no match','condition changes'].includes(variant)?0:['two defenders','two Squalls'].includes(variant)?2:1;
  assert.equal(hits.length,expected);for(const hit of hits){assert.equal(hit.n,variant==='source leaves'?6:3);assert.ok(hit.p===b||variant==='two defenders'&&hit.p===c);}
  if(variant==='two defenders')assert.equal(new Set(hits.map(row=>row.p)).size,2);
  if(variant==='two Squalls')assert.equal(new Set(hits.map(row=>row.src.iid)).size,2);
  assertGameStateInvariants(game);
 });
 test(role+': Squall ignores attacks against its controller and against a planeswalker',async()=>{
  for(const planeswalker of [false,true]){const f=context(M,role,2),{game,a,b}=f,c=f.others[1];await paid(f,'Squall, Gunblade Duelist',2);
   const creature=put(M,game,c,'Grizzly Bears'),target=planeswalker?put(M,game,b,Object.values(M.DEFS).find(def=>def.types?.includes('Planeswalker')&&Number(def.loyalty)>4).name):a;
   const old=c.controller.decide.bind(c.controller);c.controller.decide=(g,q)=>q.type==='attackers'?[{card:creature,target}]:old(g,q);
   let triggers=0;game.priorityRound=async()=>{triggers+=game.stack.filter(row=>row.srcCard?.name==='Squall, Gunblade Duelist').length;await settle(game);};game.turnPlayer=c;await game.combatPhase(c);await settle(game);assert.equal(triggers,0);assertGameStateInvariants(game);
  }
 });
}
