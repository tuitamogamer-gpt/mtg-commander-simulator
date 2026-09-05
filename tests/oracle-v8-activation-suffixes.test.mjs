import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionLine} from '../scripts/oracle-v8-activation-suffixes.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),inputs=JSON.parse(readFileSync(new URL('./fixtures/oracle-activation-suffixes.json',import.meta.url)));
const compiled=inputs.map((card,index)=>{
 const semantic=semanticClass(card,{compilerVersion:8});assert.ok(semantic.semanticClass,card.name+': '+semantic.reason);
 const [type,subtypes='']=card.type_line.split(' — '),words=type.split(' ');
 return{position:index+1,oracleId:card.oracle_id,scryfallId:card.id,...semantic,raw:{name:card.name,cost:card.mana_cost,oracle:card.oracle_text,types:words.filter(word=>word!=='Legendary'),super:words.includes('Legendary')?['Legendary']:[],subtypes:subtypes.split(' ').filter(Boolean),power:card.power,toughness:card.toughness,_ci:card.color_identity},catalog:{typeLine:card.type_line,commanderLegality:'legal'}};
});
const missing=compiled.filter(card=>!M.DEFS[card.raw.name]);
if(missing.length){M.registerOracleBatch({id:'oracle-activation-suffixes-test',sequence:9996,cards:missing});M.initData(M.RAW_DATA);}
function mana(a){for(const color of ['W','U','B','R','G','C'])a.pool[color]=20;}
async function setup(role,name){
 const f=context(M,role),{game,a}=f,source=put(M,game,a,name,'hand');mana(a);
 if(source.is('Land'))await game.playLand(a,source);else assert.equal(await game.castSpell(a,source,{from:'hand'}),true,name+': paid actual source cast');
 await settle(game);assert.equal(source.zone,'battlefield');
 // Begin a real next turn: clears past-turn prerequisites and summoning sickness.
 const original=game.emit,stop=new Error('Reached next upkeep');
 game.emit=async function(event,data){if(event==='upkeep'&&data.player===a)throw stop;return original.call(this,event,data);};
 try{await assert.rejects(game.runTurn(),error=>error===stop);}finally{game.emit=original;}
 game.phase='main1';game.step='';mana(a);f.source=source;return f;
}
function raw(f){const {source}=f;if(source.zone==='graveyard')return {card:source,gyAbility:true};const idx=source.def.abilities.findIndex(ability=>ability.cond);assert.ok(idx>=0,source.name+': conditional ability');return {card:source,ability:source.def.abilities[idx],idx};}
function offered(f){const descriptor=raw(f);return f.game.activatableList(f.a).find(row=>row.card===f.source&&(descriptor.gyAbility?row.gyAbility:row.ability===descriptor.ability));}
async function reject(f,descriptor=raw(f)){
 const pool={...f.a.pool},life=f.a.life,tapped=f.source.tapped;
 assert.equal(offered(f),undefined,f.source.name+': unmet prerequisite hides activation');assert.equal(await f.game.activateAbility(f.a,descriptor),false,f.source.name+': stale descriptor also rejected');
 assert.deepEqual({...f.a.pool},pool);assert.equal(f.a.life,life);assert.equal(f.source.tapped,tapped);
}
async function activate(f){const entry=offered(f);assert.ok(entry,f.source.name+': prerequisite enables activation');assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);}
async function castOther(f,name){const source=put(M,f.game,f.a,name,'hand');assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);return source;}
function chooseTarget(f,target){if(f.a.isAI)return;const prior=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=async(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:prior(g,q);}

test('activation suffixes compile nineteen complete pinned source cards and leave unknown suffixes closed',()=>{
 assert.equal(compiled.length,19);
 const card={name:'Boundary',type_line:'Artifact'},h={condition:()=>null,line:()=>{throw new Error('unrecognized restriction reached base parsing');}};
 for(const line of ['{1}: Draw a card. Activate only during combat damage.','{1}: Draw a card. Activate only if this creature was blocked this turn.','{1}: Draw a card. Activate only if you attacked with two or more creatures this turn.','{1}: Draw a card. Activate only if an opponent was dealt combat damage by a legendary creature this turn.','{1}: Draw a card. Activate no more than twice each turn.','{1}: Draw a card. Activate only if this card is in your graveyard and only during an unknown phase.'])assert.equal(extensionLine(card,line,h),null,line);
 const f=context(M,'human'),source=put(M,f.game,f.a,'Grizzly Bears');
 for(const rule of [{kind:'activation-state-v8',test:'same-name-lands',min:0},{kind:'activation-state-v8',test:'source-blocked',unknown:true},{kind:'activation-state-v8',test:'unknown'}])assert.throws(()=>M.OracleV8ActivationSuffixes.condition(f.game,source,rule,f.a));
});
for(const role of ['human','ai']){
 test(`${role}: Lagomos counts actual deaths up to the printed five-creature boundary`,async()=>{
  const f=await setup(role,'Lagomos, Hand of Hatred');await reject(f);
  for(let i=0;i<4;i++)await f.game.destroy(put(M,f.game,f.b,'Grizzly Bears'));
  await reject(f);await f.game.destroy(put(M,f.game,f.a,'Grizzly Bears'));
  const hand=f.a.hand.length;await activate(f);assert.equal(f.a.hand.length,hand+1);assert.equal(f.source.tapped,true);
 });
 test(`${role}: Desert uses the end-of-combat window and preserves attacking status after blockers leave`,async()=>{
  const f=await setup(role,'Desert'),target=put(M,f.game,f.b,'Shivan Dragon');target.attacking=f.a;chooseTarget(f,target);
  f.game.phase='combat';f.game.step='damage';await reject(f);f.game.step='endCombat';const stale=offered(f);assert.ok(stale);
  f.game.step='';f.game.phase='main2';await reject(f,stale);f.game.phase='combat';f.game.step='endCombat';await activate(f);assert.equal(target.damage,1);
 });
 test(`${role}: Cinder Crawler remains blocked after its last blocker leaves, until it leaves combat`,async()=>{
  const f=await setup(role,'Cinder Crawler');f.source.attacking=f.b;await reject(f);f.source.wasBlocked=true;f.source.blockedBy=[];
  const power=f.source.power;await activate(f);assert.equal(f.source.power,power+1);
  f.source.attacking=null;await reject(f);
 });
 test(`${role}: Glory activates only in its owner's graveyard and stays there after payment`,async()=>{
  const f=await setup(role,'Glory'),ally=put(M,f.game,f.a,'Grizzly Bears');
  assert.equal(f.game.activatableList(f.a).some(row=>row.card===f.source&&row.gyAbility),false);
  await f.game.move(f.source,'graveyard');const ability=f.game.activatableList(f.a).find(row=>row.card===f.source&&row.gyAbility);assert.ok(ability);
  assert.equal(await f.game.activateAbility(f.a,ability),true);assert.equal(f.source.zone,'graveyard');await settle(f.game);
  assert.equal(f.source.zone,'graveyard');assert.ok(ally.cur.protectionFrom.length);const quality=f.game.untilEffects.find(effect=>effect.kind==='oracleProtection'&&effect.iid===ally.iid).qualities[0];assert.equal(quality.kind,'color');const threat=put(M,f.game,f.b,{W:'Savannah Lions',U:'Merfolk Looter',B:'Phyrexian Arena',R:'Shivan Dragon',G:'Grizzly Bears'}[quality.value]);assert.equal(f.game.isProtectedFrom(ally,threat),true);
 });
 test(`${role}: graveyard return distinguishes damage from loss of life and enforces the owner's turn`,async()=>{
  const f=await setup(role,'Skarrgan Firebird');await f.game.move(f.source,'graveyard');await reject(f);
  await f.game.loseLife(f.b,1);await reject(f);await f.game.damagePlayer(null,f.b,1);await activate(f);assert.equal(f.source.zone,'hand');
  const g=await setup(role,'Gutterbones');await g.game.move(g.source,'graveyard');await reject(g);await g.game.loseLife(g.b,1);
  const stale=offered(g);assert.ok(stale);g.game.turnPlayer=g.b;await reject(g,stale);g.game.turnPlayer=g.a;await activate(g);assert.equal(g.source.zone,'hand');
 });
 test(`${role}: discard and noncreature-cast prerequisites use real events from this turn`,async()=>{
  const f=await setup(role,'Gilt-Blade Prowler');await reject(f);put(M,f.game,f.a,'Forest','hand');await f.game.discard(f.a,[f.a.hand[0]]);const hand=f.a.hand.length,life=f.a.life;
  await activate(f);assert.equal(f.a.hand.length,hand+1);assert.equal(f.a.life,life-1);
  for(const name of ['Tapestry of the Ages','Seeker of Insight']){const g=await setup(role,name);await reject(g);await castOther(g,'Grizzly Bears');await reject(g);await castOther(g,'Sol Ring');const before=g.a.library.length;await activate(g);assert.equal(g.a.library.length,before-1);}
 });
 test(`${role}: Magus and Biblioplex count the current hand at activation and do not recheck on resolution`,async()=>{
  const f=await setup(role,'Magus of the Library');for(let i=0;i<6;i++)put(M,f.game,f.a,'Forest','hand');await reject(f);
  put(M,f.game,f.a,'Forest','hand');const entry=offered(f);assert.ok(entry);assert.equal(await f.game.activateAbility(f.a,entry),true);
  put(M,f.game,f.a,'Forest','hand');await settle(f.game);assert.equal(f.a.hand.length,9);
  for(const count of [0,1,6,7,8]){const g=await setup(role,'The Biblioplex');for(let i=0;i<count;i++)put(M,g.game,g.a,'Forest','hand');if(count===0||count===7){const prior=g.a.library.length;await activate(g);assert.ok(g.a.library.length<=prior);}else await reject(g);}
 });
 test(`${role}: upkeep restrictions distinguish any upkeep from an opponent's upkeep`,async()=>{
  const f=await setup(role,'Trade Caravan'),land=put(M,f.game,f.a,'Forest');land.tapped=true;f.source.counters.currency=2;chooseTarget(f,land);await reject(f);
  f.game.phase='upkeep';await reject(f);f.game.turnPlayer=f.b;await activate(f);assert.equal(f.source.counters.currency||0,0);assert.equal(land.tapped,false);
  const g=await setup(role,'Dwarven Armory'),target=put(M,g.game,g.a,'Shivan Dragon');put(M,g.game,g.a,'Forest');chooseTarget(g,target);await reject(g);
  g.game.phase='upkeep';g.game.turnPlayer=g.b;await activate(g);assert.equal(target.counters['+2/+2'],1);
 });
 test(`${role}: Sawback Manticore requires active combat participation and counts a paid activation immediately`,async()=>{
  const f=await setup(role,'Sawback Manticore'),target=put(M,f.game,f.b,'Shivan Dragon');target.attacking=f.a;chooseTarget(f,target);await reject(f);
  f.source.blocking=target.iid;const entry=offered(f);assert.ok(entry);assert.equal(await f.game.activateAbility(f.a,entry),true);assert.equal(await f.game.activateAbility(f.a,entry),false);
  f.source.blocking=null;await settle(f.game);assert.equal(target.damage,2,'leaving combat does not counter an announced activation');
 });
 test(`${role}: Decoy and Lilypad observe creature entry history across departure and reject other entrants`,async()=>{
  const f=await setup(role,'Zhalfirin Decoy'),target=put(M,f.game,f.b,'Shivan Dragon');chooseTarget(f,target);await reject(f);
  const entrant=await castOther(f,'Grizzly Bears');await f.game.move(entrant,'exile');await activate(f);assert.equal(target.tapped,true);
  const g=await setup(role,'Lilypad Village');await reject(g);await castOther(g,'Grizzly Bears');await reject(g);const bird=await castOther(g,'Birds of Paradise');await g.game.move(bird,'exile');const prior=g.a.library.length;
  await activate(g);assert.ok(g.a.library.length<=prior);assert.equal(g.source.tapped,true);
 });
 test(`${role}: attacking modification checks current counters and separates opposing Auras from Equipment`,async()=>{
  const f=await setup(role,'Goro-Goro, Disciple of Ryusei'),attacker=put(M,f.game,f.a,'Grizzly Bears');await reject(f);attacker.attacking=f.b;await reject(f);
  const aura=put(M,f.game,f.b,'Rancor');await f.game.attach(aura,attacker);await reject(f);const equipment=put(M,f.game,f.b,'Bonesplitter');await f.game.attach(equipment,attacker);
  await activate(f);assert.ok(f.game.creatures(f.a).some(card=>card.isToken&&card.hasSub('Dragon')&&card.hasSub('Spirit')&&card.kw('flying')));
 });
 test(`${role}: same-name land threshold applies to both activated draw and stack-free mana planning`,async()=>{
  const f=await setup(role,'Endless Atlas');put(M,f.game,f.a,'Forest');put(M,f.game,f.a,'Forest');put(M,f.game,f.a,'Island');await reject(f);
  const third=put(M,f.game,f.a,'Forest'),stale=offered(f);assert.ok(stale);third.ctrl=f.b;f.game.recalc();await reject(f,stale);third.ctrl=f.a;f.game.recalc();const hand=f.a.hand.length;await activate(f);assert.equal(f.a.hand.length,hand+1);
  const g=await setup(role,'Sceptre of Eternal Glory');for(const c of ['W','U','B','R','G','C'])g.a.pool[c]=0;
  const lands=[put(M,g.game,g.a,'Forest'),put(M,g.game,g.a,'Forest'),put(M,g.game,g.a,'Island')];for(const land of lands)land.tapped=true;
  assert.equal(g.game.canPayMana(g.a,M.parseCost('{U}{U}{U}')),false);const last=put(M,g.game,g.a,'Forest');last.tapped=true;
  assert.equal(await g.game.payMana(g.a,M.parseCost('{U}{U}{U}')),true);assert.equal(g.source.tapped,true);assert.equal(g.game.stack.length,0);
 });
}
