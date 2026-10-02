import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass,createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {operationProofV23} from './helpers/oracle-v23-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v23-permanents.json',import.meta.url),'utf8'));
const M=loadEngine(),plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},sequence:9930,limit:rows.length,compilerVersion:23});
assert.equal(plan.report.cards.length,rows.length);const absent=plan.report.cards.filter(entry=>!M.DEFS[entry.raw.name]);if(absent.length){M.registerOracleBatch({...plan.report,cards:absent});M.initData(M.RAW_DATA);}
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=100;};
const cardDef=(name,types=['Creature'],extra={})=>({name,types,subtypes:[],super:[],cost:'{2}',oracle:'',...extra});
const zoneCard=(M,p,definition,zone)=>{const c=new M.CardInst(typeof definition==='string'?M.DEFS[definition]:definition,p);c.zone=zone;p[zone].push(c);return c;};
const permanent=(M,g,p,definition)=>{const c=zoneCard(M,p,definition,'hand');p.hand.splice(p.hand.indexOf(c),1);c.zone='battlefield';c.ctrl=p;c.sick=false;g.battlefield.push(c);g.recalc();return c;};
const h={gameFor:(M,_controllers,{ai})=>({...context(M,ai?'ai':'human'),role:ai?'ai':'human'}),fund,fixtureDefinition:cardDef,zoneCard,permanent,resolveAll:settle,assertControllerRole:(M,ctx)=>assert.equal(ctx.a.controller instanceof M.AIController,ctx.role==='ai')};
test('v23 permanent fixtures retain every whole-card rule and reject unknown riders',()=>{for(const card of rows){assert.ok(semanticClass(card,{compilerVersion:23}).semanticClass,card.name);assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:23}).semanticClass,undefined);}});
for(const role of ['human','ai'])for(const entry of plan.report.cards)for(const top of entry.implementation)for(const op of top.kind==='operation-bundle'?top.operations:[top])if(op.kind==='permanent-zone-keyword-v23'||op.permanentAttachedPhaseV23||op.permanentAuraEtbV23||op.kind.startsWith('permanent-attached-')||op.kind==='attachment-operation'&&['Sugar Coat',"Nature's Embrace"].includes(entry.raw.name)||op.kind==='v8-type-static'&&['Aerial Modification','Siege Modification'].includes(entry.raw.name)||op.kind==='base-pt-static'&&entry.raw.name==='Awakened Awareness'||op.kind==='generic-trigger'&&['Parasitic Implant','Gremlin Infestation','Reality Acid'].includes(entry.raw.name))test(role+': '+entry.raw.name+' performs paid grant or bound phase effects',async()=>{assert.ok(await operationProofV23(M,entry,op,role,h));});

const curseInput={...rows.find(card=>card.name==='Curse Artifact'),name:'V23 cursed player identity fixture',oracle_id:'v23-cursed-player-identity',id:'v23-cursed-player-identity',type_line:'Enchantment — Aura Curse',oracle_text:'Enchant player\nAt the beginning of enchanted player\'s upkeep, this Aura deals 2 damage to enchanted player.'};
const cursePlan=createImportPlan({cards:[curseInput],bulk:{type:'oracle_cards'},sequence:9931,limit:1,compilerVersion:23});M.registerOracleBatch(cursePlan.report);M.initData(M.RAW_DATA);
for(const role of ['human','ai'])test(role+': captured cursed player survives departure and reentry',async()=>{
 const {game:g,a,b}=context(M,role);fund(a);const source=zoneCard(M,a,curseInput.name,'hand'),prior=a.controller.decide.bind(a.controller);a.controller.decide=(game,q)=>prior(game,q.type==='chooseTargets'&&q.candidates.includes(b)?{...q,candidates:[b]}:q);
 const before=Object.values(a.pool).reduce((sum,n)=>sum+n,0);assert.equal(await g.castSpell(a,source,{from:'hand'}),true);assert.ok(Object.values(a.pool).reduce((sum,n)=>sum+n,0)<before);await settle(g);assert.equal(source.meta.cursedPlayer,b);
 const aLife=a.life,bLife=b.life;await g.emit('upkeep',{player:b});await g.flushTriggers();assert.ok(g.stack.length);await g.move(source,'exile');await g.move(source,'battlefield',{ctrl:a,cursedPlayer:a});await settle(g);assert.equal(b.life,bLife-2);assert.equal(a.life,aLife,'old trigger keeps its original enchanted player');
 await g.emit('upkeep',{player:a});await settle(g);assert.equal(a.life,aLife-2,'new incarnation enchants its new player');assertGameStateInvariants(g);
});
