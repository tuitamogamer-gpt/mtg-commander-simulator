import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {semanticClass,createImportPlan} from '../scripts/import-oracle-batch.mjs';
const M=loadEngine(),sources=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-named-count-source.json',import.meta.url)));
const ready=sources.filter(row=>semanticClass(row).semanticClass);
const {report}=createImportPlan({cards:ready,baseNames:new Set(),bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},limit:ready.length,sequence:9993,compilerVersion:8});
const missing=report.cards.filter(row=>!M.DEFS[row.raw.name]);if(missing.length){M.registerOracleBatch({...report,cards:missing});M.initData(M.RAW_DATA);}

import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';

const sum=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
async function cast(f,name,{player=f.a,resolve=true,targets,...opts}={}){
 const card=put(M,f.game,player,name,'hand');
 for(const color of ['W','U','B','R','G','C'])player.pool[color]=30;
 const previousTurn=f.game.turnPlayer;if(resolve)f.game.turnPlayer=player;
 const before=sum(player),decide=player.controller.decide.bind(player.controller);
 player.controller.decide=async(g,q)=>q.type==='chooseTargets'&&targets?targets.map(target=>q.candidates.find(row=>row===target||(row?.card||row?.so)===target)).filter(Boolean):decide(g,q);
 try{assert.equal(await f.game.castSpell(player,card,{from:'hand',...opts}),true,name+': paid cast');}
 finally{player.controller.decide=decide;}
 assert.ok(sum(player)<before,name+': mana spent');
 if(resolve){await settle(f.game);f.game.turnPlayer=previousTurn;}
 return card;
}
for(const role of ['human','ai']){
 test(`${role}: Guardian Project uses the departed copy's battlefield name`,async()=>{
  const f=context(M,role);await cast(f,'Guardian Project');const model=put(M,f.game,f.b,'Grizzly Bears');
  if(role==='human'){const choose=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.from.includes(model)?[model]:q.type==='chooseTargets'&&q.candidates.includes(model)?[model]:choose(g,q);}
  const clone=await cast(f,'Clone',{resolve:false});await f.game.resolveTop();await f.game.flushTriggers();
  assert.equal(clone.name,'Grizzly Bears');assert.ok(f.game.stack.some(s=>s.kind==='trigger'));
  const hand=f.a.hand.length;await cast(f,'Murder',{player:f.b,targets:[clone],resolve:false});await settle(f.game);
  assert.equal(clone.zone,'graveyard');assert.equal(clone.name,'Clone');assert.equal(f.a.hand.length,hand+1);
 });
 test(`${role}: a pending Shrine trigger survives destruction of its source`,async()=>{
  const f=context(M,role),shrine=await cast(f,'Dwarven Shrine');put(M,f.game,f.b,'Grizzly Bears','graveyard');
  const life=f.a.life;await cast(f,'Grizzly Bears',{resolve:false});await f.game.flushTriggers();
  await cast(f,'Disenchant',{player:f.b,targets:[shrine],resolve:false});await settle(f.game);
  assert.equal(shrine.zone,'graveyard');assert.equal(f.a.life,life-2);
 });
 test(`${role}: nameless Morph casts do not share the underlying card name with graveyard cards`,async()=>{
  const f=context(M,role);await cast(f,'Aven Shrine');put(M,f.game,f.a,'Abzan Guide','graveyard');
  const guide=put(M,f.game,f.a,'Abzan Guide','hand'),offer=f.game.castableList(f.a).find(row=>row.card===guide&&row.alt?.faceDownCast);
  assert.ok(offer);const life=f.a.life,before=sum(f.a);assert.equal(await f.game.castSpell(f.a,guide,{from:'hand',alt:offer.alt}),true);
  assert.ok(sum(f.a)<before);await settle(f.game);assert.equal(f.a.life,life);assert.equal(guide.faceDown,true);
 });
 test(`${role}: a cast split half matches either name of a graveyard split card`,async()=>{
  const f=context(M,role);await cast(f,'Aven Shrine');put(M,f.game,f.a,'Fire // Ice','graveyard');put(M,f.game,f.b,'Sol Ring');
  const card=put(M,f.game,f.a,'Fire // Ice','hand'),offer=f.game.castableList(f.a).find(row=>row.card===card&&row.alt?.name==='Ice');assert.ok(offer);
  const life=f.a.life,before=sum(f.a);assert.equal(await f.game.castSpell(f.a,card,{from:'hand',alt:offer.alt}),true);assert.ok(sum(f.a)<before);
  await settle(f.game);assert.equal(f.a.life,life+1);
 });
 test(`${role}: Guardian Project draws for separate nameless entrants despite matching displayed names`,async()=>{
  const f=context(M,role);await cast(f,'Guardian Project');
  for(let i=0;i<2;i++){
   const guide=put(M,f.game,f.a,'Abzan Guide','hand'),offer=f.game.castableList(f.a).find(row=>row.card===guide&&row.alt?.faceDownCast);assert.ok(offer);
   const before=f.a.hand.length;assert.equal(await f.game.castSpell(f.a,guide,{from:'hand',alt:offer.alt}),true);await settle(f.game);
   assert.equal(f.a.hand.length,before);assert.equal(guide.faceDown,true);
  }
 });
 test(`${role}: Winnow fizzles without drawing after its only target leaves`,async()=>{
  const f=context(M,role),target=put(M,f.game,f.b,'Grizzly Bears');put(M,f.game,f.a,'Grizzly Bears');
  const hand=f.a.hand.length;await cast(f,'Winnow',{targets:[target],resolve:false});
  await cast(f,'Unsummon',{player:f.b,targets:[target],resolve:false});await settle(f.game);
  assert.equal(target.zone,'hand');assert.equal(f.a.hand.length,hand);
 });
 for(const [name,mode] of [['Aven Shrine','gain'],['Cabal Shrine','discard'],['Dwarven Shrine','damage'],['Nantuko Shrine','squirrel']]){
  test(`${role}: ${name} uses all graveyards and the casting player`,async()=>{
   for(const foreign of [false,true]){
    const f=context(M,role);await cast(f,name,{player:foreign?f.b:f.a});
    put(M,f.game,f.a,'Grizzly Bears','graveyard');put(M,f.game,f.b,'Grizzly Bears','graveyard');
    for(let i=0;i<3;i++)put(M,f.game,f.a,'Forest','hand');
    const life=f.a.life,otherLife=f.b.life,hand=f.a.hand.length;
    await cast(f,'Grizzly Bears',{resolve:false});await f.game.flushTriggers();
    assert.ok(f.game.stack.some(s=>s.kind==='trigger'),'respondable Shrine trigger');
    await settle(f.game);
    assert.equal(f.a.life,life+(mode==='gain'?2:mode==='damage'?-4:0));
    assert.equal(f.b.life,otherLife,'Aura controller is not the recipient');
    assert.equal(f.a.hand.length,hand-(mode==='discard'?2:0));
    assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Squirrel')).length,mode==='squirrel'?2:0);
   }
  });
 }
 test(`${role}: Shrine remembers the cast name and counts at resolution after countering`,async()=>{
  const f=context(M,role);await cast(f,'Aven Shrine');
  put(M,f.game,f.a,'Grizzly Bears','graveyard');put(M,f.game,f.b,'Grizzly Bears','graveyard');
  const life=f.a.life,bear=await cast(f,'Grizzly Bears',{resolve:false});await f.game.flushTriggers();
  const spell=f.game.stack.find(s=>s.card===bear||s.srcCard===bear);
  assert.ok(spell);
  await cast(f,'Counterspell',{player:f.b,resolve:false,targets:[spell]});
  await settle(f.game);assert.equal(bear.zone,'graveyard');assert.equal(f.a.life,life+3);
 });
 test(`${role}: Guardian Project checks own creatures and graveyard and excludes tokens`,async()=>{
  for(const scenario of ['unique','own','enemy','graveyard','token']){
   const f=context(M,role);await cast(f,'Guardian Project');
   if(scenario==='own')put(M,f.game,f.a,'Grizzly Bears');
   if(scenario==='enemy')put(M,f.game,f.b,'Grizzly Bears');
   if(scenario==='graveyard')put(M,f.game,f.a,'Grizzly Bears','graveyard');
   const hand=f.a.hand.length;
   if(scenario==='token')await cast(f,'Raise the Alarm');else await cast(f,'Grizzly Bears');
   await settle(f.game);assert.equal(f.a.hand.length,hand+(['unique','enemy'].includes(scenario)?1:0),scenario);
  }
 });
 test(`${role}: Guardian Project rechecks when its entrant dies in response`,async()=>{
  const f=context(M,role);await cast(f,'Guardian Project');
  const bear=await cast(f,'Grizzly Bears',{resolve:false});await f.game.resolveTop();await f.game.flushTriggers();
  const hand=f.a.hand.length;assert.ok(f.game.stack.some(s=>s.kind==='trigger'));
  await cast(f,'Murder',{player:f.b,resolve:false,targets:[bear]});await settle(f.game);
  assert.equal(bear.zone,'graveyard');assert.equal(f.a.hand.length,hand,'self in graveyard now prevents draw');
 });
 test(`${role}: Chrome Replicator requires matching nontoken nonlands controlled by its controller`,async()=>{
  for(const scenario of ['match','lands','tokens','opponent']){
   const f=context(M,role);
   const first=put(M,f.game,f.a,scenario==='lands'?'Forest':'Grizzly Bears');
   const second=put(M,f.game,scenario==='opponent'?f.b:f.a,scenario==='lands'?'Forest':'Grizzly Bears');
   if(scenario==='tokens'){first.isToken=true;second.isToken=true;}
   await cast(f,'Chrome Replicator');
   const tokens=f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Construct'));
   assert.equal(tokens.length,scenario==='match'?1:0,scenario);
   if(tokens.length){assert.equal(tokens[0].power,4);assert.equal(tokens[0].toughness,4);assert.ok(tokens[0].is('Artifact'));}
  }
 });
 test(`${role}: Endless Atlas requires three actual matching land names`,async()=>{
  const f=context(M,role),source=await cast(f,'Endless Atlas');
  put(M,f.game,f.a,'Forest');put(M,f.game,f.a,'Forest');put(M,f.game,f.a,'Island');
  const offered=()=>f.game.activatableList(f.a).find(e=>e.card===source);
  assert.equal(offered(),undefined);const third=put(M,f.game,f.a,'Forest');assert.ok(offered());
  const stale=offered();third.ctrl=f.b;f.game.recalc();assert.equal(await f.game.activateAbility(f.a,stale),false);
  third.ctrl=f.a;f.game.recalc();const hand=f.a.hand.length,before=sum(f.a);
  assert.equal(await f.game.activateAbility(f.a,offered()),true);assert.equal(sum(f.a),before-2);
  await settle(f.game);assert.equal(f.a.hand.length,hand+1);assert.equal(source.tapped,true);
 });
 test(`${role}: Sceptre mana checks matching lands without using the Stack`,async()=>{
  const f=context(M,role),source=await cast(f,'Sceptre of Eternal Glory');
  for(const key of Object.keys(f.a.pool))f.a.pool[key]=0;
  for(const name of ['Forest','Forest','Island'])put(M,f.game,f.a,name).tapped=true;
  assert.equal(f.game.canPayMana(f.a,M.parseCost('{U}{U}{U}')),false);
  put(M,f.game,f.a,'Forest').tapped=true;
  assert.equal(await f.game.payMana(f.a,M.parseCost('{U}{U}{U}')),true);
  assert.equal(source.tapped,true);assert.equal(f.game.stack.length,0);
 });
 test(`${role}: Winnow checks another current permanent and still draws without a match`,async()=>{
  for(const scenario of ['match','none','phased']){
   const f=context(M,role),target=put(M,f.game,f.b,'Grizzly Bears');
   if(scenario!=='none'){const match=put(M,f.game,f.a,'Grizzly Bears');if(scenario==='phased')match.phasedOut=true;}
   const hand=f.a.hand.length;await cast(f,'Winnow',{targets:[target]});
   assert.equal(target.zone,scenario==='match'?'graveyard':'battlefield',scenario);assert.equal(f.a.hand.length,hand+1);
  }
 });
}

test('exact seven new source sources compile and five unresolved families stay closed',()=>{
 const expected=['Aven Shrine','Cabal Shrine','Dwarven Shrine','Nantuko Shrine','Guardian Project','Chrome Replicator','Winnow','Endless Atlas','Sceptre of Eternal Glory'];
 for(const row of sources)assert.equal(!!semanticClass(row).semanticClass,expected.includes(row.name),row.name);
});
test('existing Atlas and Sceptre semantics remain byte-equivalent',()=>{
 for(const name of ['Endless Atlas','Sceptre of Eternal Glory']){
  const row=sources.find(row=>row.name===name);const historical=M.ORACLE_BATCHES.flatMap(batch=>batch.cards).find(entry=>entry.raw.name===name);assert.ok(historical);assert.deepEqual(JSON.parse(JSON.stringify(semanticClass(row).implementation)),JSON.parse(JSON.stringify(historical.implementation)),name);
 }
});
test('name conditions reject unsupported zones, quantities and antecedents',()=>{
 const cases=[
  ['Aven Shrine',text=>text.replace('all graveyards','all libraries')],
  ['Aven Shrine',text=>text.replace('that spell','a permanent')],
  ['Winnow',text=>text.replace('on the battlefield','in a library')],
  ['Chrome Replicator',text=>text.replace('two or more','seven or more')],
  ['Guardian Project',text=>text.replace('your graveyard','your library')],
 ];
 for(const [name,change]of cases){const row=sources.find(row=>row.name===name);assert.equal(!!semanticClass({...row,oracle_text:change(row.oracle_text)}).semanticClass,false,name);}
});
