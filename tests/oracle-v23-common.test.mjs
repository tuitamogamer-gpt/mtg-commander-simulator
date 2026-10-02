import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {originProofV23} from './helpers/oracle-v23-common-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v23-common.json',import.meta.url),'utf8')),M=loadEngine();
const absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},limit:absent.length,sequence:9954,compilerVersion:23});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;};
for(const role of ['human','ai'])for(const row of rows.filter(c=>/opening hand/.test(c.oracle_text))){
 test(role+': '+row.name+' optional opening disclosure creates one correctly timed Stack effect',async()=>{
  const f=context(M,role),{game,a,b}=f,source=put(M,game,a,row.name,'hand'),requests=[];
  const prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{requests.push(q);if(q.type==='chooseOption'&&q.prompt?.startsWith('Reveal '))return 'yes';if(q.type==='chooseCards'&&q.prompt?.startsWith('Keep up to one'))return q.from.slice(0,1);return prior(g,q);};
  const initial={life:a.life,opp:b.life,library:a.library.length};fund(a);fund(b);
  await M.CDK.openingPermanents(game);assert.equal(source.zone,'hand');assert.equal(game.stack.length,0);assert.equal(game.delayed.length,1);
  if(row.name==='Chancellor of the Tangle'){await game.emitMainPhase(b,{precombat:true});await settle(game);assert.equal(game.delayed.length,1);const green=a.pool.G;await game.emitMainPhase(a,{precombat:true});assert.equal(game.pendingTriggers.length,1);await settle(game);assert.equal(a.pool.G,green+1);await game.emitMainPhase(a,{precombat:true});await settle(game);assert.equal(a.pool.G,green+1);}
  else if(row.name==='Chancellor of the Annex'){
   game.turnPlayer=b;game.phase='main1';
   const decide=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='no')?'no':decide(g,q);
   const first=put(M,game,b,'Grizzly Bears','hand');assert.equal(await game.castSpell(b,first,{from:'hand'}),true);await settle(game);assert.equal(first.zone,'graveyard');
   const second=put(M,game,b,'Grizzly Bears','hand');assert.equal(await game.castSpell(b,second,{from:'hand'}),true);await settle(game);assert.equal(second.zone,'battlefield');
  }else{
   const own=['Sphinx of Foresight','Devourer of Destiny'].includes(row.name);
   if(own){await game.emit('upkeep',{player:b});await settle(game);assert.equal(game.delayed.length,1);}
   await game.move(source,'graveyard');await game.emit('upkeep',{player:own?a:b});assert.equal(game.pendingTriggers.length,1);assert.equal(game.delayed.length,0);await settle(game);
   if(row.name==='Chancellor of the Forge'){const tokens=game.bf().filter(c=>c.isToken);assert.equal(tokens.length,1);assert.equal(tokens[0].ctrl,a);assert.equal(tokens[0].kw('haste'),true);}
   if(row.name==='Chancellor of the Dross'){assert.equal(b.life,initial.opp-3);assert.equal(a.life,initial.life+3);}
   if(row.name==='Providence')assert.equal(a.life,26);
   if(row.name==='Chancellor of the Spires')assert.equal(b.graveyard.length,7);
   if(row.name==='Sphinx of Foresight')assert.equal(requests.find(q=>q.type==='scry')?.cards.length,3);
   if(row.name==='Devourer of Destiny'){assert.equal(a.library.length,initial.library-3);assert.equal(a.exile.length,3);}
   const state={life:a.life,opp:b.life,library:a.library.length,tokens:game.bf().length};await game.emit('upkeep',{player:own?a:b});await settle(game);assert.deepEqual({life:a.life,opp:b.life,library:a.library.length,tokens:game.bf().length},state);
  }
  assertGameStateInvariants(game);
 });
 test(role+': '+row.name+' may stay hidden and cannot reveal a non-opening-zone card',async()=>{
  const f=context(M,role),{game,a}=f,source=put(M,game,a,row.name,'hand'),prior=a.controller.decide.bind(a.controller);
  a.controller.decide=(g,q)=>q.type==='chooseOption'&&q.prompt?.startsWith('Reveal ')?'no':prior(g,q);
  await M.CDK.openingPermanents(game);assert.equal(game.delayed.length,0);await game.move(source,'graveyard');a.controller.decide=prior;await M.OracleV23Common.openingReveals(game);assert.equal(game.delayed.length,0);assertGameStateInvariants(game);
 });
}

for(const role of ['human','ai'])for(const row of rows.filter(c=>/If this spell was cast from a graveyard,/.test(c.oracle_text)))test(role+': '+row.name+' uses actual casting origin and ordinary resolution for a Stack copy',async()=>{
 const zoneCard=(M,p,name,zone)=>{if(typeof name==='string')return put(M,p.game,p,name,zone);const c=new M.CardInst(name,p);c.zone=zone;p[zone].push(c);return c;};
 const h={gameFor:(M,_controllers,options)=>context(M,options.ai?'ai':'human'),decision:()=>null,fund,fillLibrary:(M,p,n)=>{for(let i=0;i<n;i++)put(M,p.game,p,'Forest','library');},zoneCard,fixtureDefinition:(name,types,extra)=>({name,types,super:[],subtypes:[],kws:[],cost:'{0}',...extra}),resolveAll:settle,assertControllerRole:(M,f)=>assert.equal(f.a.isAI,role==='ai')};
 await originProofV23(M,{raw:{name:row.name,cost:row.mana_cost}},role,h);
});
for(const role of ['human','ai'])for(const mode of ['hand','uncast','graveyard','stolen'])test(role+': Phage avoids its entry loss only for its controller\'s hand cast ('+mode+')',async()=>{
 const f=context(M,role),{game,a,b}=f,source=put(M,game,a,'Phage the Untouchable',mode==='graveyard'?'graveyard':'hand');fund(a);fund(b);
 if(mode==='uncast')await game.putPermanentOntoBattlefield(source,a);
 else if(mode==='graveyard'){put(M,game,a,'Muldrotha, the Gravetide');const action=game.castableList(a).find(row=>row.card===source&&row.from==='graveyard');assert.ok(action);assert.equal(await game.castSpell(a,source,{from:'graveyard',alt:action.alt}),true);}
 else assert.equal(await game.castSpell(a,source,{from:'hand'}),true);
 if(mode==='stolen'){const spell=put(M,game,b,'Aethersnatch','hand');assert.equal(await game.castSpell(b,spell,{from:'hand',quickTargets:[game.stack.find(so=>so.card===source)]}),true);}
 await settle(game);assert.equal(a.lost,mode==='uncast'||mode==='graveyard');assert.equal(b.lost,mode==='stolen');assertGameStateInvariants(game);
});
