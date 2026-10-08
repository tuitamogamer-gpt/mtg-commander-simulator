import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,total,put,def,choose} from './helpers/oracle-v30-permanents-proof.mjs';
import {createFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {runtimeBatch} from '../scripts/import-oracle-batch.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine(),glorfindel='Glorfindel, Dauntless Rescuer',phantasm='Surveillance Phantasm';
const rows=[58,61].flatMap(version=>JSON.parse(fs.readFileSync(new URL(`./fixtures/oracle-v${version}-common.json`,import.meta.url))))
 .filter(row=>[glorfindel,phantasm].includes(row.name)&&!M.DEFS[row.name]);
if(rows.length)M.registerOracleBatch(runtimeBatch(createFixturePlan(rows,61,9977).report));
M.initData(M.RAW_DATA);

async function paid(g,p,name){
 const card=put(M,p,name,'hand'),before=total(p);
 assert.equal(await g.castSpell(p,card,{from:'hand'}),true,name+' is cast through the native paid path');
 assert.ok(total(p)<before,'the spell spends mana');
 await settle(g);return card;
}

for(const role of ['human','ai'])for(const mode of [0,1])test(`${role}: empty-library scry triggers Glorfindel mode ${mode} and enables Surveillance Phantasm`,async()=>{
 const {game:g,a,b,trace}=context(M,role);fund(a);fund(b);
 choose(a,q=>q.type==='chooseOption'&&q.aiHint?.kind==='mode'&&q.aiHint.src?.name===glorfindel
  ?{...q,options:q.options.filter(option=>option.key===String(mode))}:null);
 const glor=await paid(g,a,glorfindel),wall=await paid(g,a,phantasm);
 for(const p of [a,b])for(const card of [...p.library])await g.move(card,'graveyard');
 const dead=put(M,a,def('Empty-library Fated Return witness'),'graveyard');
 choose(a,q=>q.type==='chooseTargets'&&q.candidates.includes(dead)?{...q,candidates:[dead],min:1,max:1}:null);
 const power=glor.power,toughness=glor.toughness,events=[],emit=g.emit.bind(g);
 g.emit=async(event,data)=>{if(event==='scry')events.push({player:data.player,n:data.n,cards:data.cards.length});return emit(event,data);};
 assert.equal(!!wall.cur.defenderCanAttack,false);

 await M.E.scry(g,a,0);await settle(g);
 assert.equal(events.length,0);assert.equal(a.turnState.scryEvents||0,0);
 assert.equal(glor.power,power);assert.equal(!!wall.cur.defenderCanAttack,false);
 await M.E.scry(g,b,1);await settle(g);g.recalc();
 assert.equal(events.length,1);assert.equal(events[0].player,b);assert.equal(events[0].n,0);
 assert.equal(a.turnState.scryEvents||0,0);assert.equal(b.turnState.scryEvents,1);
 assert.equal(glor.power,power);assert.equal(!!wall.cur.defenderCanAttack,false);

 const returned=await paid(g,a,'Fated Return');
 assert.equal(returned.zone,'graveyard');assert.equal(dead.zone,'battlefield');assert.equal(dead.kw('indestructible'),true);
 assert.equal(a.library.length,0);assert.equal(events.length,2);assert.equal(events[1].player,a);
 assert.equal(events[1].n,0);assert.equal(events[1].cards,0);assert.equal(a.turnState.scryEvents,1);
 assert.equal(glor.power,power+1);assert.equal(glor.toughness,toughness+1);
 assert.equal(glor.cur.mustBeBlocked,mode===0);
 if(mode===1)assert.equal(g.blockerBounds(glor).max,1);
 assert.equal(wall.cur.defenderCanAttack,true);assert.equal(wall.kw('defender'),true);
 assert.equal(trace.filter(row=>row.q.type==='scry').length,0,'empty-library scry requires no impossible card-order choice');
 assert.equal(trace.filter(row=>row.q.aiHint?.kind==='mode'&&row.q.aiHint.src?.name===glorfindel).length,1);
 await M.E.scry(g,a,0);await settle(g);
 assert.equal(events.length,2);assert.equal(a.turnState.scryEvents,1);assert.equal(glor.power,power+1);
 assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
});
