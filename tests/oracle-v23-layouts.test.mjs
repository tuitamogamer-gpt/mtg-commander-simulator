import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {fundSnow} from './helpers/oracle-snow-proof.mjs';

const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v23-layouts.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9965,limit:absent.length,compilerVersion:23});assert.equal(plan.report.cards.length,absent.length,JSON.stringify(plan.report.rejected));M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=40;};
const mana=p=>Object.values(p.pool).reduce((n,x)=>n+x,0);
const choose=(p,test,value)=>{const prior=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>{const result=await prior(g,q);return test(q)?value(q,g):result;};};
const color=(game,card,colors)=>{card.def={...card.def,colorsOverride:colors};game.recalc();return card;};
const custom=(game,p,name,cost,zone='library')=>{const c=put(M,game,p,'Grizzly Bears',zone);c.def={...c.def,name,cost};game.recalc();return c;};
const run=(f,source,e,extra={})=>M.OracleV20.helpers.runGenericEffect({g:f.game,you:f.a,src:source,sourceZoneVersion:source.zoneVersion,targets:[],...extra},e);
const clearLibrary=f=>{for(const c of f.a.library.splice(0)){c.zone='graveyard';f.a.graveyard.push(c);}};
const heraldAction=(game,a,source)=>game.activatableList(a).find(row=>row.card===source&&row.ability?.oracleSacrificeGroupsV23);
const angelSetup=role=>{const f=context(M,role);fund(f.a);f.source=put(M,f.game,f.a,"Angel's Herald");f.green=color(f.game,put(M,f.game,f.a,'Grizzly Bears'),['G']);f.blue=color(f.game,put(M,f.game,f.a,'Grizzly Bears'),['U']);return f;};

test('v23 layouts consume every printed rule and reject an unknown additional paragraph',()=>{
 for(const row of rows){assert.ok(semanticClass(row,{compilerVersion:23}).semanticClass,row.name);assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:23}).semanticClass,undefined,row.name);}
});
for(const role of ['human','ai']){
 test(role+': Herald taps and sacrifices itself as one of three distinct colored objects, then finds its actual named card',async()=>{
  const f=angelSetup(role),{game,a,source,green,blue}=f,named=custom(game,a,'Empyrial Archangel','{4}{G}{W}{W}{U}'),events=[],emit=game.emit;
  game.emit=function(name,data){if(name==='becameTapped'&&data.card===source)events.push({version:source.zoneVersion,zone:source.zone});return emit.call(this,name,data);};
  choose(a,q=>q.prompt?.startsWith(source.name+': choose sacrifice'),q=>[q.prompt.includes('1 of')?green:q.prompt.includes('2 of')?source:blue]);
  choose(a,q=>q.search&&q.from.includes(named),()=>[named]);
  const before=mana(a),version=source.zoneVersion,namedVersion=named.zoneVersion;
  assert.equal(await game.activateAbility(a,heraldAction(game,a,source)),true);assert.equal(before-mana(a),3);assert.deepEqual(events,[{version,zone:'battlefield'}]);assert.ok([source,green,blue].every(c=>c.zone==='graveyard'));
  await settle(game);assert.equal(named.zone,'battlefield');assert.equal(named.zoneVersion,namedVersion+1);assert.equal(named.ctrl,a);assert.equal(named.tapped,false);assertGameStateInvariants(game);
 });
 test(role+': a multicolored creature cannot pay more than one Herald sacrifice requirement',async()=>{
  const f=context(M,role);fund(f.a);const source=put(M,f.game,f.a,"Angel's Herald"),multi=color(f.game,put(M,f.game,f.a,'Grizzly Bears'),['W','U','G']);
  assert.equal(heraldAction(f.game,f.a,source),undefined);const second=color(f.game,put(M,f.game,f.a,'Grizzly Bears'),['W','U','G']);assert.ok(heraldAction(f.game,f.a,source));
  choose(f.a,q=>q.prompt?.startsWith(source.name+': choose sacrifice'),q=>q.from.includes(multi)?[multi]:q.from.includes(source)?[source]:[second]);
  const before=mana(f.a);assert.equal(await f.game.activateAbility(f.a,heraldAction(f.game,f.a,source)),true);assert.equal(before-mana(f.a),3);assert.ok([source,multi,second].every(c=>c.zone==='graveyard'));await settle(f.game);assertGameStateInvariants(f.game);
 });
 test(role+': cancelling any Herald choice consumes no mana, tap, or sacrifice',async()=>{
  for(const cancel of [1,2,3]){const f=angelSetup(role),{game,a,source,green,blue}=f;choose(a,q=>q.prompt?.startsWith(source.name+': choose sacrifice'),q=>q.prompt.includes(cancel+' of')?[]:[q.from[0]]);const before=mana(a),version=source.zoneVersion;assert.equal(await game.activateAbility(a,heraldAction(game,a,source)),false);assert.equal(mana(a),before);assert.equal(source.tapped,false);assert.equal(source.zoneVersion,version);assert.ok([source,green,blue].every(c=>c.zone==='battlefield'));assert.equal(game.stack.length,0);assertGameStateInvariants(game);}
 });
 test(role+': a changed Herald source or previously chosen sacrifice invalidates the unpaid plan',async()=>{
  for(const reason of ['source','chosen']){const f=angelSetup(role),{game,a,source,green,blue}=f;choose(a,q=>q.prompt?.startsWith(source.name+': choose sacrifice'),async q=>{if(q.prompt.includes('3 of')){const card=reason==='source'?source:green;await game.move(card,'hand');await game.move(card,'battlefield',{ctrl:a});card.sick=false;}return [q.prompt.includes('1 of')?green:q.prompt.includes('2 of')?source:blue];});const before=mana(a);assert.equal(await game.activateAbility(a,heraldAction(game,a,source)),false);assert.equal(mana(a),before);assert.equal(source.tapped,false);assert.ok([source,green,blue].every(c=>c.zone==='battlefield'));assert.equal(game.stack.length,0);assertGameStateInvariants(game);}
 });
 test(role+': Green Sun Twilight pays X and places both selected cards into one shared destination',async()=>{
  for(const destination of ['hand','battlefield']){const f=context(M,role),{game,a}=f;fund(a);const creature=put(M,game,a,'Grizzly Bears','library'),land=put(M,game,a,'Forest','library'),rest=Array.from({length:4},()=>put(M,game,a,'Opt','library'));
   choose(a,q=>q.prompt==='Choose inspected creature card',()=>[creature]);choose(a,q=>q.prompt==='Choose inspected land card',()=>[land]);choose(a,q=>q.prompt==='Choose the destination of all chosen cards',()=>destination);
   const spell=put(M,game,a,"Green Sun's Twilight",'hand'),before=mana(a);assert.equal(await game.castSpell(a,spell,{from:'hand',xVal:5}),true);assert.equal(before-mana(a),6);await settle(game);assert.equal(creature.zone,destination);assert.equal(land.zone,destination);assert.ok(rest.every(c=>c.zone==='library'&&a.library.slice(0,4).includes(c)));assertGameStateInvariants(game);
  }
 });
 test(role+': dual inspected choices reject a wrong card and keep a later library incarnation out of the bottom cohort',async()=>{
  const effect={action:'library-dual-select-v23',n:3,visibility:'look',filters:[{what:'creature',zone:'graveyard',controller:'you'},{what:'land',zone:'graveyard',controller:'you'}],required:false,rest:'bottom'};
  {const f=context(M,role),source=put(M,f.game,f.a,'Grizzly Bears'),good=put(M,f.game,f.a,'Grizzly Bears','library'),bad=put(M,f.game,f.a,'Opt','library');put(M,f.game,f.a,'Forest','library');choose(f.a,q=>q.prompt==='Choose inspected creature card',()=>[bad]);await assert.rejects(run(f,source,effect),/Invalid dual library selection/);assert.equal(good.zone,'library');assert.equal(bad.zone,'library');assertGameStateInvariants(f.game);}
  {const f=context(M,role),source=put(M,f.game,f.a,'Grizzly Bears'),cohort=Array.from({length:3},()=>put(M,f.game,f.a,'Opt','library')),later=cohort[1],version=later.zoneVersion;choose(f.a,q=>q.prompt==='Order inspected cards for the bottom',async q=>{await f.game.move(later,'hand');await f.game.move(later,'library');return q.from;});await run(f,source,effect);assert.equal(later.zoneVersion,version+2);assert.equal(f.a.library.at(-1),later);assert.ok([cohort[0],cohort[2]].every(c=>f.a.library.slice(0,2).includes(c)));assertGameStateInvariants(f.game);}
 });
 test(role+': inspected mana value is captured before its chosen card moves, and the unselected cohort goes to the graveyard',async()=>{
  const f=context(M,role),{game,a}=f;fund(a);const cohort=Array.from({length:3},(_,i)=>custom(game,a,'Vapors witness '+i,'{'+(i+2)+'}')),selected=cohort[1],mv=selected.mv,move=game.move;
  choose(a,q=>q.prompt==='Choose inspected card for its follow-up',()=>[selected]);game.move=async function(card,zone,...args){const answer=await move.call(this,card,zone,...args);if(card===selected&&zone==='hand')card.def={...card.def,cost:'{0}'};return answer;};const life=a.life,spell=put(M,game,a,'Reviving Vapors','hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);assert.equal(a.life,life+mv);assert.equal(selected.zone,'hand');assert.ok(cohort.filter(c=>c!==selected).every(c=>c.zone==='graveyard'));assertGameStateInvariants(game);
 });
 test(role+': reveal-until preserves complete no-match and empty-library fates',async()=>{
  for(const empty of [false,true]){const f=context(M,role),{game,a}=f;fund(a);clearLibrary(f);if(!empty)for(let i=0;i<3;i++)put(M,game,a,'Forest','library');const cohort=a.library.slice(),hand=a.hand.length,life=f.b.life,spell=put(M,game,a,'Explosive Revelation','hand');assert.equal(await game.castSpell(a,spell,{from:'hand',quickTargets:[f.b]}),true);await settle(game);assert.equal(f.b.life,life);assert.equal(a.hand.length,hand);assert.equal(a.library.length,cohort.length);assert.ok(cohort.every(c=>a.library.includes(c)));assert.equal(a.lost,false);assertGameStateInvariants(game);}
 });
 test(role+': Explosive Revelation uses the revealed value, moves its nonland card to hand, and bottoms only the preceding lands',async()=>{
  const f=context(M,role),{game,a,b}=f;fund(a);choose(a,q=>q.type==='chooseTargets'&&q.candidates.includes(b),()=>[b]);const hit=custom(game,a,'Explosive inspected witness','{5}'),preceding=put(M,game,a,'Forest','library'),untouched=a.library[a.library.length-3],version=hit.zoneVersion,life=b.life,spell=put(M,game,a,'Explosive Revelation','hand');
  assert.equal(await game.castSpell(a,spell,{from:'hand',quickTargets:[b]}),true);await settle(game);assert.equal(b.life,life-5);assert.equal(hit.zone,'hand');assert.equal(hit.zoneVersion,version+1);assert.equal(a.library[0],preceding);assert.equal(a.library.at(-1),untouched);assertGameStateInvariants(game);
 });
 test(role+': a changed inspected selection cannot move its later incarnation or apply its mana-value follow-up',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Grizzly Bears'),selected=custom(game,a,'Changed inspected witness','{5}'),life=a.life,version=selected.zoneVersion;
  choose(a,q=>q.prompt==='Choose inspected card for its follow-up',async()=>{await game.move(selected,'hand');await game.move(selected,'library');return [selected];});
  await assert.rejects(run(f,source,{action:'library-followup-v23',n:1,visibility:'look',selectedDestination:'hand',rest:'stay',followup:[{action:'lose-life',who:'you',n:{kind:'inspected-stat-v23',stat:'mv'}}]}),/Invalid inspected follow-up selection/);
  assert.equal(a.life,life);assert.equal(selected.zone,'library');assert.equal(selected.zoneVersion,version+2);assertGameStateInvariants(game);
 });
 test(role+': Ad Nauseam repeats exactly the chosen number and stops safely at an empty library',async()=>{
  for(const repeats of [1,2,3]){const f=context(M,role),{game,a}=f;fund(a);clearLibrary(f);const cohort=Array.from({length:3},(_,i)=>custom(game,a,'Ad Nauseam witness '+i,'{'+(i+2)+'}'));let seen=0;choose(a,q=>q.prompt==='Repeat the inspected card process?',()=>++seen<repeats?'yes':'no');const life=a.life,spell=put(M,game,a,'Ad Nauseam','hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);assert.equal(a.life,life-cohort.slice(-repeats).reduce((n,c)=>n+c.mv,0));assert.equal(a.hand.length,repeats);assert.equal(a.library.length,3-repeats);assert.equal(a.lost,false);assertGameStateInvariants(game);}
 });
 test(role+': Sorin can decline revealing the inspected card while still paying the loyalty cost',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Sorin the Mirthless');source.counters.loyalty=4;game.recalc();const top=custom(game,a,'Sorin inspected witness','{5}'),life=a.life;choose(a,q=>q.prompt==='Choose inspected card for its follow-up',()=>[]);const action=game.activatableList(a).find(row=>row.card===source&&row.ability.loyalty===1);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(source.counters.loyalty,5);assert.equal(top.zone,'library');assert.equal(a.life,life);assertGameStateInvariants(game);
 });
 test(role+': snow cumulative upkeep places age before payment and ordinary mana cannot satisfy it',async()=>{
  for(const snow of [true,false]){const f=context(M,role),{game,a}=f;fund(a);const host=put(M,game,a,'Grizzly Bears'),source=put(M,game,a,'Glacial Plating');game.attach(source,host);if(snow)await fundSnow(M,game,a,{cost:'{S}'});const events=[],emit=game.emit;game.emit=function(name,data){if(name==='countersPlaced'&&data.card===source&&data.kind==='age')events.push(data.after);return emit.call(this,name,data);};const before=mana(a);await game.emit('upkeep',{player:a});await settle(game);assert.deepEqual(events,[1]);assert.equal(source.zone,snow?'battlefield':'graveyard');assert.equal(before-mana(a),snow?1:0);if(snow){assert.equal(host.power,5);await game.emit('upkeep',{player:a});await settle(game);assert.equal(source.counters.age,2);assert.equal(host.power,8);assert.equal(before-mana(a),3);}assertGameStateInvariants(game);}
 });
 test(role+': a Chronomantic copy cannot exile its original physical spell and the protection expires on the next turn',async()=>{
  const f=context(M,role),{game,a,b}=f;fund(a);const attacker=put(M,game,b,'Grizzly Bears'),source=put(M,game,a,'Chronomantic Escape','hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);const so=game.stack.find(so=>so.card===source);await game.copySpell(so,a,{mayNewTargets:false});await game.resolveTop();assert.equal(source.zone,'stack');assert.equal(source.counters.time||0,0);assert.equal(game.canAttackTarget(attacker,a),false);await settle(game);assert.equal(source.zone,'exile');assert.equal(source.counters.time,3);assert.equal(source.meta.suspended,3);await game.runBeginningPhase(a);await settle(game);assert.equal(source.counters.time,2);assert.equal(game.canAttackTarget(attacker,a),true);assertGameStateInvariants(game);
 });
 test(role+': time effects synchronize suspended counters and ignore a phased permanent',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,'Grizzly Bears'),suspended=put(M,game,a,'Arc Blade','exile'),permanent=put(M,game,a,'Grizzly Bears');suspended.counters.time=3;suspended.meta.suspended=3;permanent.counters.time=1;
  await run(f,source,{action:'time-counter-v23',target:0,n:2,remove:false},{targets:[suspended]});assert.equal(suspended.counters.time,5);assert.equal(suspended.meta.suspended,5);await run(f,source,{action:'time-counter-v23',target:0,n:2,remove:true},{targets:[suspended]});assert.equal(suspended.counters.time,3);assert.equal(suspended.meta.suspended,3);
  permanent.phasedOut=true;await run(f,source,{action:'time-counter-v23',target:0,n:2,remove:false},{targets:[permanent]});assert.equal(permanent.counters.time,1);permanent.phasedOut=false;assertGameStateInvariants(game);
 });
 test(role+': Fury Charm actually targets the captured suspended card and a later exile incarnation is an illegal target',async()=>{
  for(const changed of [false,true]){const f=context(M,role),{game,a}=f;fund(a);const suspended=put(M,game,a,'Arc Blade','exile');suspended.counters.time=3;suspended.meta.suspended=3;choose(a,q=>q.prompt?.startsWith('Fury Charm:')&&q.options?.some(o=>String(o.key)==='2'),q=>q.type==='chooseMulti'?['2']:'2');choose(a,q=>q.type==='chooseTargets'&&q.candidates.includes(suspended),()=>[suspended]);const spell=put(M,game,a,'Fury Charm','hand'),before=mana(a);assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(before-mana(a),2);if(changed){await game.move(suspended,'hand');await game.move(suspended,'exile');suspended.counters.time=3;suspended.meta.suspended=3;}await settle(game);assert.equal(suspended.counters.time,changed?3:1);assert.equal(suspended.meta.suspended,changed?3:1);assertGameStateInvariants(game);}
 });
 test(role+': Timebender pays its actual morph cost then executes each printed mode on a suspended card',async()=>{
  for(const mode of [0,1]){const f=context(M,role),{game,a}=f;fund(a);const source=put(M,game,a,'Timebender','hand');const before=mana(a),cast=game.castableList(a).find(row=>row.card===source&&row.alt?.faceDownCast==='morph');assert.ok(cast);assert.equal(await game.castSpell(a,source,{from:cast.from,alt:cast.alt}),true);await settle(game);assert.equal(source.faceDown,true);assert.equal(before-mana(a),3);const suspended=put(M,game,a,'Arc Blade','exile');suspended.counters.time=3;suspended.meta.suspended=3;choose(a,q=>q.aiHint?.kind==='mode'&&q.aiHint.src===source,()=>String(mode));choose(a,q=>q.type==='chooseTargets'&&q.candidates.includes(suspended),()=>[suspended]);const faceMana=mana(a);assert.equal(await game.turnFaceUp(a,source,'{U}','morph'),true);assert.equal(faceMana-mana(a),1);assert.equal(source.faceDown,false);await settle(game);assert.equal(suspended.counters.time,mode?5:1);assert.equal(suspended.meta.suspended,mode?5:1);assertGameStateInvariants(game);}
 });
 test(role+': Sorin Grim Nemesis uses the inspected value for each opponent without charging its controller',async()=>{
  const f=context(M,role,2),{game,a,others}=f,source=put(M,game,a,'Sorin, Grim Nemesis');source.counters.loyalty=6;game.recalc();const inspected=custom(game,a,'Grim inspected witness','{5}'),life=a.life;const action=game.activatableList(a).find(row=>row.card===source&&row.ability.loyalty===1);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(source.counters.loyalty,7);assert.equal(inspected.zone,'hand');assert.equal(a.life,life);assert.ok(others.every(p=>p.life===35));assertGameStateInvariants(game);
 });
}
