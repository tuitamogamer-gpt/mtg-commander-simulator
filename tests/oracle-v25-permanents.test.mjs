import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass,createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {operationProofV25,linkedProofToolsV25 as tools} from './helpers/oracle-v25-permanents-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v25-permanents.json',import.meta.url),'utf8')),M=loadEngine();
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},sequence:9958,limit:rows.length,compilerVersion:25});
assert.equal(plan.report.cards.length,rows.length);
const absent=plan.report.cards.filter(entry=>!M.DEFS[entry.raw.name]);
if(absent.length)M.registerOracleBatch({...plan.report,cards:absent});
M.initData(M.RAW_DATA);
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;};
const fixtureDefinition=(name,types,extra={})=>({name,types,subtypes:[],super:[],cost:'{2}',oracle:'',...extra});
const zoneCard=(M,p,definition,zone)=>{const card=new M.CardInst(typeof definition==='string'?M.DEFS[definition]:definition,p);card.zone=zone;p[zone].push(card);return card;};
const permanent=(M,g,p,definition)=>{const card=zoneCard(M,p,definition,'hand');p.hand.splice(p.hand.indexOf(card),1);card.zone='battlefield';card.ctrl=p;card.sick=false;g.battlefield.push(card);g.recalc();return card;};
const h={gameFor:(M,_controllers,{ai})=>({...context(M,ai?'ai':'human'),role:ai?'ai':'human'}),fund,fixtureDefinition,zoneCard,permanent,resolveAll:settle,assertControllerRole:(M,ctx)=>assert.equal(ctx.a.controller instanceof M.AIController,ctx.role==='ai')};
const entry=name=>plan.report.cards.find(card=>card.raw.name===name),total=p=>Object.values(p.pool).reduce((n,x)=>n+x,0);
test('27 linked cards preserve all rules and reject unknown riders and unbound consumers',()=>{
 assert.equal(rows.length,27);
 for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:25}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:25}).semanticClass,undefined,card.name);}
 assert.equal(semanticClass({name:'Unbound linked source',layout:'normal',type_line:'Artifact',mana_cost:'{2}',oracle_text:'{2}: Put a creature card exiled with this artifact onto the battlefield under your control.'},{compilerVersion:25}).semanticClass,undefined);
});
for(const role of ['human','ai'])for(const card of plan.report.cards)test(role+': '+card.raw.name+' complete paid rules',()=>operationProofV25(M,card,card.implementation[0],role,h));
for(const role of ['human','ai']){
 test(role+': Scepter may decline copying after paying activation',async()=>{
  const ctx=tools.setup(M,role,h),{game:g,a}=ctx,donor=zoneCard(M,a,fixtureDefinition('Declined copied instant',['Instant'],{cost:'{2}',resolve:async ctx=>{ctx.you.copyResolved=true;}}),'hand');tools.yes(a);tools.cards(a,[donor]);tools.castLinked(a);const c=await tools.source(M,entry('Isochron Scepter'),ctx,h);assert.equal(donor.zone,'exile');tools.no(a);const before=total(a);await tools.activate(ctx,c,h);assert.equal(total(a),before-2);assert.equal(a.copyResolved,undefined);assert.equal(donor.zone,'exile');assert.equal(a.exile.some(card=>card.isCopySpell),false);assertGameStateInvariants(g);
 });
 test(role+': Scepter imprint excludes sorceries and higher mana values',async()=>{
  const ctx=tools.setup(M,role,h),{game:g,a}=ctx,sorcery=zoneCard(M,a,fixtureDefinition('Wrong imprint type',['Sorcery'],{cost:'{2}'}),'hand'),large=zoneCard(M,a,fixtureDefinition('Wrong imprint value',['Instant'],{cost:'{3}'}),'hand');tools.yes(a);const c=await tools.source(M,entry('Isochron Scepter'),ctx,h);assert.equal(sorcery.zone,'hand');assert.equal(large.zone,'hand');assert.equal(M.OracleV25Permanents.linked(g,c,'permanent-linked-v25').length,0);assertGameStateInvariants(g);
 });
 test(role+': Arcanist activation uses linked mana value without choosing X',async()=>{
  const ctx=tools.setup(M,role,h),{game:g,a}=ctx,donor=zoneCard(M,a,fixtureDefinition('Value three copied instant',['Instant'],{cost:'{3}',resolve:async ctx=>{ctx.you.copyResolved=true;}}),'hand');tools.yes(a);tools.cards(a,[donor]);tools.castLinked(a);const c=await tools.source(M,entry('Elite Arcanist'),ctx,h);c.sick=false;let queriedX=false;const prior=a.controller.decide.bind(a.controller);a.controller.decide=(game,q)=>{if(q.type==='chooseX')queriedX=true;return prior(game,q);};const before=total(a);await tools.activate(ctx,c,h);assert.equal(total(a),before-3);assert.equal(queriedX,false);assert.equal(a.copyResolved,true);assert.equal(donor.zone,'exile');assertGameStateInvariants(g);
 });
 test(role+': Broker skips an exile card that changed incarnation during choice',async()=>{
  const ctx=tools.setup(M,role,h),{game:g,a}=ctx,c=await tools.source(M,entry('Bane Alley Broker'),ctx,h),donor=zoneCard(M,a,fixtureDefinition('Stale selected exile',['Creature'],{power:'2',toughness:'4'}),'library');c.sick=false;tools.cards(a,[donor]);await tools.activate(ctx,c,h);assert.equal(donor.zone,'exile');g.untap(c);const version=donor.zoneVersion,prior=a.controller.decide.bind(a.controller);a.controller.decide=async(game,q)=>{if(q.type==='chooseCards'&&q.from.includes(donor)){await game.move(donor,'hand');await game.move(donor,'exile');return [donor];}return prior(game,q);};await tools.activate(ctx,c,h,1);assert.equal(donor.zone,'exile');assert.ok(donor.zoneVersion>version);assert.equal(M.OracleV25Permanents.linked(g,c,'permanent-linked-v25').includes(donor),false);assertGameStateInvariants(g);
 });
 test(role+': Dino DNA new source incarnation cannot copy an old linked card',async()=>{
  const ctx=tools.setup(M,role,h),{game:g,a,b}=ctx,donor=zoneCard(M,b,fixtureDefinition('Old link donor',['Creature'],{power:'2',toughness:'4'}),'graveyard'),c=await tools.source(M,entry('Dino DNA'),ctx,h);tools.targets(a,[donor]);await tools.activate(ctx,c,h);assert.equal(donor.zone,'exile');await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);g.recalc();const ability=c.def.abilities[1],before=total(a);assert.equal(g.legalTargets(ability.targets[0],c,a).includes(donor),false);assert.equal(await g.activateAbility(a,{card:c,ability},[donor]),false);assert.equal(total(a),before);assert.equal(donor.zone,'exile');assertGameStateInvariants(g);
 });
 test(role+': Panoptic Mirror acquisition filters by the X actually paid',async()=>{
  const ctx=tools.setup(M,role,h),{game:g,a}=ctx,c=await tools.source(M,entry('Panoptic Mirror'),ctx,h),matching=zoneCard(M,a,fixtureDefinition('Matching paid X',['Sorcery'],{cost:'{2}'}),'hand'),wrong=zoneCard(M,a,fixtureDefinition('Different paid X',['Instant'],{cost:'{3}'}),'hand');tools.cards(a,[matching]);tools.choose(a,q=>q.type==='chooseX'?{...q,min:2,max:2}:null);const before=total(a);await tools.activate(ctx,c,h);assert.equal(total(a),before-2);assert.equal(matching.zone,'exile');assert.equal(wrong.zone,'hand');assertGameStateInvariants(g);
 });
}
