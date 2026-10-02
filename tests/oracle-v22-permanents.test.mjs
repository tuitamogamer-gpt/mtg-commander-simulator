import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass,createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {operationProofV22} from './helpers/oracle-v22-permanents-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v22-permanents.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
const plan=absent.length?createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9950,limit:absent.length,compilerVersion:22}):{report:{cards:[]}};
assert.equal(plan.report.cards.length,absent.length,'every pinned fixture is a complete card');
if(absent.length){M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const entries=rows.map(card=>plan.report.cards.find(entry=>entry.raw.name===card.name)||{raw:{name:card.name,types:card.type_line.split(' — ')[0].split(' ')},implementation:semanticClass(card,{compilerVersion:22}).implementation});
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;};
const zoneCard=(M,p,definition,zone)=>{const c=new M.CardInst(typeof definition==='string'?M.DEFS[definition]:definition,p);c.zone=zone;p[zone].push(c);return c;};
const permanent=(M,g,p,definition)=>{const c=new M.CardInst(typeof definition==='string'?M.DEFS[definition]:definition,p);c.zone='battlefield';c.ctrl=p;c.sick=false;g.battlefield.push(c);g.recalc();return c;};
const fixtureDefinition=(name,types=['Creature'],extras={})=>({name,cost:types.includes('Land')?null:'{1}',super:[],types,subtypes:[],oracle:'',...extras});
const h={gameFor:(M,controllers,{ai})=>({...context(M,ai?'ai':'human'),role:ai?'ai':'human'}),decision:()=>null,fund,fillLibrary:()=>{},zoneCard,permanent,fixtureDefinition,resolveAll:settle,assertControllerRole:(M,ctx)=>assert.equal(ctx.a.controller instanceof M.AIController,ctx.role==='ai'),genericRuntimeOperationProof:async(M,entry,op,role)=>{
 const {game,a,b}=context(M,role);fund(a);const chosen=op.effects[0].quality==='land'?'Bojuka Bog':'Grizzly Bears',source=put(M,game,a,entry.raw.name),prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.searchableChoices?prior(g,{...q,options:q.options.filter(row=>row.key===chosen)}):prior(g,q);
 if(op.event==='attacks')await game.emit('attacks',{player:a,card:source,target:b});else await game.handleETB(source,{});await settle(game);
 if(op.effects[0].temporarySpellTax!==undefined){const card=zoneCard(M,a,fixtureDefinition('Grizzly Bears',['Creature'],{cost:'{2}{G}',power:'2',toughness:'3'}),'hand');assert.equal(game.spellCost(a,card,{from:'hand'}).generic,1);const before=a.pool.C;assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);assert.equal(a.pool.C,before-1);await game.move(source,'exile');assert.equal(game.spellCost(a,zoneCard(M,a,fixtureDefinition('Grizzly Bears',['Creature'],{cost:'{2}{G}'}),'hand'),{from:'hand'}).generic,1,'resolved temporary reduction survives source departure');game.untilEffects=[];assert.equal(game.spellCost(a,card,{from:'hand'}).generic,2);}
 else assert.ok(M.OracleV22Permanents.selected(source).includes(chosen));
 return 4;
}};
test('v22 chosen-name whole cards reject unknown clauses and unbound name references',()=>{
 assert.equal(entries.filter(entry=>entry.implementation.some(op=>op.kind==='permanent-name-entry-v22'||op.effects?.some(effect=>effect.action==='permanent-choose-name-v22'))).length,18);
 for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:22}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:22}).semanticClass,undefined,card.name);}
 const needle=rows.find(card=>card.name==='Pithing Needle');assert.equal(semanticClass({...needle,oracle_text:"Activated abilities of sources with the chosen name can't be activated."},{compilerVersion:22}).semanticClass,undefined);
 const arbiter=rows.find(card=>card.name==='Alhammarret, High Arbiter');assert.equal(semanticClass({...arbiter,oracle_text:arbiter.oracle_text.replace('As Alhammarret enters','As Serra Angel enters')},{compilerVersion:22}).semanticClass,undefined,'entry replacement must refer to its actual source');
});
test('v22 selectable names use pinned Oracle face characteristics without format legality restrictions',()=>{
 const P=M.OracleV22Permanents,index=M.OracleV22CardNames;assert.equal(index.metadata.sourceSha256,'a85e1309439fcaca2639b5eaf0cd2f71a0f4de8bd3926617fae3eded1dda5528');assert.ok(index.entries.length>35000);
 for(const name of ['Black Lotus','Fire','Ice','Petty Theft','Bala Ged Sanctuary'])assert.ok(P.choices('any').includes(name),name);
 assert.equal(P.choices('any').includes('Fire // Ice'),false);assert.equal(P.choices('land').includes('Bala Ged Sanctuary'),true);assert.equal(P.choices('nonland').includes('Bala Ged Recovery'),true);assert.equal(P.choices('nonland').includes('Bala Ged Sanctuary'),false);assert.equal(P.choices('not-basic-land').includes('Forest'),false);
 assert.equal(index.metadata.interchangeableGroups,30);for(const name of ['Eleven, the Mage','E. Honda, Sumo Champion','Doric, Owlbear Avenger','Chief Jim Hopper'])assert.ok(P.choices('any').includes(name),name);
 assert.ok(P.choices('land').includes('Hawkins National Laboratory'));assert.equal(P.choices('nonland').includes('Hawkins National Laboratory'),false);
 assert.deepEqual(Array.from(P.names({def:{name:'Cecily, Haunted Mage'},name:'Cecily, Haunted Mage'})).sort(),['Cecily, Haunted Mage','Eleven, the Mage'].sort());
});
for(const role of ['human','ai'])for(const entry of entries){
 test(role+': '+entry.raw.name+' pays, chooses and applies each named rule with negative branches',async()=>{
  let checks=0;for(const op of entry.implementation){const n=await operationProofV22(M,entry,op,role,h);if(n!==null)checks+=n;}
  assert.ok(checks>0,'named rules have an executable witness');
 });
}
for(const role of ['human','ai'])test(role+': chosen names respect source reincarnation, split halves, Adventure names and control transfer',async()=>{
 const {game,a,b}=context(M,role);fund(a);const prior=a.controller.decide.bind(a.controller);let name='Fire';a.controller.decide=(g,q)=>q.searchableChoices?prior(g,{...q,options:q.options.filter(row=>row.key===name)}):prior(g,q);
 const source=put(M,game,a,"Gideon's Intervention",'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
 const split=zoneCard(M,b,fixtureDefinition('Fire // Ice',['Instant'],{cost:'{1}{R}',oracleSplit:{faces:[{key:'left',name:'Fire',types:['Instant'],cost:'{1}{R}'},{key:'right',name:'Ice',types:['Instant'],cost:'{1}{U}'}]}}),'hand');
 assert.equal(game.canCastTiming(b,split,{splitHalf:'left'}),false);assert.equal(game.canCastTiming(b,split,{splitHalf:'right'}),true);assert.equal(game.canCastTiming(b,split,{splitFuse:true}),false);assert.deepEqual(Array.from(M.OracleV22Permanents.spellNames(game,split,{faceDownCast:true})),[]);
 M.OracleV8Control.gain(game,source,b,{});game.recalc();assert.equal(game.canCastTiming(b,split,{splitHalf:'left'}),true);game.turnPlayer=a;assert.equal(game.canCastTiming(a,split,{splitHalf:'left'}),false);
 await game.move(source,'exile');name='Petty Theft';await game.putPermanentOntoBattlefield(source,a);await settle(game);assert.deepEqual(Array.from(M.OracleV22Permanents.selected(source)),['Petty Theft']);
 const adventure=zoneCard(M,b,fixtureDefinition('Brazen Borrower',['Creature'],{cost:'{1}{U}{U}',adventure:{name:'Petty Theft',cost:'{1}{U}',types:'Instant'}}),'hand');game.turnPlayer=b;assert.equal(game.canCastTiming(b,adventure,{adventure:true}),false);assert.equal(game.canCastTiming(b,adventure,{}),true);assertGameStateInvariants(game);
});
for(const role of ['human','ai'])test(role+': propagated Equipment static grants use Rune timestamps, layer-six loss and current attachment',async()=>{
 const {game,a,b}=context(M,role);fund(a);const host=put(M,game,b,'Grizzly Bears'),equipment=permanent(M,game,b,fixtureDefinition('V22 layered Equipment',['Artifact'],{subtypes:['Equipment']}));assert.equal(await game.attach(equipment,host),true);
 M.OracleV8AbilityLoss.add(game,[equipment],{});const source=put(M,game,a,'Rune of Flight','hand'),prior=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(equipment)?prior(g,{...q,candidates:[equipment]}):prior(g,q);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(host.kw('flying'),true,'a newer granted static ability survives older Equipment ability loss');
 M.OracleV8AbilityLoss.add(game,[host],{});assert.equal(host.kw('flying'),false,'a newer host ability loss removes the propagated keyword');game.untilEffects=game.untilEffects.filter(row=>row.iid!==host.iid);game.recalc();assert.equal(host.kw('flying'),true);
 M.OracleV8AbilityLoss.add(game,[equipment],{});assert.equal(host.kw('flying'),false,'newer Equipment loss removes its Rune-granted ability');game.untilEffects=game.untilEffects.filter(row=>row.iid!==equipment.iid);game.recalc();assert.equal(host.kw('flying'),true);
 const second=put(M,game,b,'Grizzly Bears');assert.equal(await game.attach(equipment,second),true);assert.equal(host.kw('flying'),false);assert.equal(second.kw('flying'),true);await game.move(source,'exile');assert.equal(second.kw('flying'),false);assertGameStateInvariants(game);
});
