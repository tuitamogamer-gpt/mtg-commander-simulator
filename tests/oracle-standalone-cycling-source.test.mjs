import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const inputs=JSON.parse(readFileSync(new URL('./fixtures/oracle-standalone-cycling-source.json',import.meta.url)));
const cards=inputs.map((c,i)=>{const result=semanticClass(c,{compilerVersion:8});assert.ok(result.semanticClass,c.name+': '+result.reason);return{position:i+1,oracleId:c.oracle_id,scryfallId:c.id,...result,raw:{name:c.name,cost:c.mana_cost,oracle:c.oracle_text,types:c.type_line.split(' — ')[0].split(' '),super:[],subtypes:[],_ci:c.color_identity},catalog:{typeLine:c.type_line,commanderLegality:'legal'}};});
const M=loadEngine(),missing=cards.filter(c=>!M.DEFS[c.raw.name]);if(missing.length){M.registerOracleBatch({id:'oracle-standalone-cycling-source',sequence:9996,cards:missing});M.initData(M.RAW_DATA);}
const pool=p=>Object.values(p.pool).reduce((a,b)=>a+b,0),fund=p=>{for(const color of['W','U','B','R','G','C'])p.pool[color]=30;};
const optionalQueries=f=>f.trace.filter(r=>r.q.type==='chooseOption'&&r.q.aiHint?.kind==='optTrigger');
async function cycle(f,name){const source=put(M,f.game,f.a,name,'hand');fund(f.a);const entry=f.game.activatableList(f.a).find(row=>row.card===source&&row.cycling);assert.ok(entry,name+': actual hand activation available');const before=pool(f.a);assert.equal(await f.game.activateAbility(f.a,entry),true);const match=/Cycling ((?:\{[^}]+\})+)/.exec(source.def.oracle),expected=[...match[1].matchAll(/\{([^}]+)\}/g)].reduce((sum,m)=>sum+(/^\d+$/.test(m[1])?Number(m[1]):1),0);assert.equal(before-pool(f.a),expected,name+': exact cycling payment');assert.equal(source.zone,'graveyard',name+': card discarded as cost');return source;}
function setup(role){const f=context(M,role);for(const owner of[f.a,f.b]){for(let n=0;n<3;n++){const c=put(M,f.game,owner,'Shivan Dragon');c.attacking=owner===f.b?f.a:null;}for(let n=0;n<4;n++)put(M,f.game,owner,'Forest','hand');}return f;}
test('all16 complete literal cycling sources compile; unsupported cycling-local X and source return remain closed',()=>{
 assert.equal(cards.length,16);const seed=inputs[0];for(const text of[
  'Cycling {X}{R}\nWhen you cycle this card, it deals X damage to any target.',
  'Cycling {R}\nWhen you cycle this card, return it from your graveyard to the battlefield.',
  'Cycling {R}\nWhen you cycle this card, have it become a monarch twice.',
 ])assert.equal(semanticClass({...seed,oracle_text:'Deem Worthy deals 7 damage to target creature.\n'+text},{compilerVersion:8}).semanticClass,undefined,text);
});
for(const role of['human','ai']){
 for(const input of inputs)test(`${role}: ${input.name} pays and discards, then independently resolves its trigger above the cycling draw`,async()=>{
  const f=setup(role);if(input.name==='Complicate'){const spell=put(M,f.game,f.b,'Lightning Bolt','hand');fund(f.b);assert.equal(await f.game.castSpell(f.b,spell,{from:'hand',quickTargets:[f.a]}),true);for(const color of Object.keys(f.b.pool))f.b.pool[color]=0;}
  const source=await cycle(f,input.name),top=f.game.stack.at(-1),base=f.game.stack.at(-2);assert.equal(top.kind,'trigger');assert.equal(top.srcCard,source);assert.equal(base.kind,'ability');assert.match(base.name,/Cycling$/);assert.equal(optionalQueries(f).length,0,'may is decided only on resolution, after responses');
  await f.game.resolveTop();assert.equal(f.game.stack.at(-1),base,'trigger is independent of the cycling ability');const hand=f.a.hand.length;await f.game.resolveTop();assert.equal(f.a.hand.length,hand+1,'the cycling draw resolves separately');await settle(f.game);
 });
 test(`${role}: countering Renewed Faith's triggered ability preserves the cycling draw and never asks whether to gain life`,async()=>{
  const f=context(M,role),life=f.a.life;await cycle(f,'Renewed Faith');const trigger=f.game.stack.at(-1);assert.equal(optionalQueries(f).length,0);await f.game.counterStackObject(trigger);await settle(f.game);assert.equal(f.a.life,life);assert.equal(f.a.hand.length,1);assert.equal(optionalQueries(f).length,0);
 });
 test(`${role}: countering the cycling draw leaves Renewed Faith's life trigger on the Stack`,async()=>{
  const f=context(M,role),life=f.a.life;await cycle(f,'Renewed Faith');const draw=f.game.stack.at(-2);await f.game.counterStackObject(draw);await settle(f.game);assert.equal(f.a.hand.length,0);assert.equal(f.a.life,life+2);assert.equal(optionalQueries(f).length,1);
 });
 test(`${role}: exiling the discarded source does not prevent the pending cycling trigger from resolving`,async()=>{
  const f=context(M,role),life=f.a.life,source=await cycle(f,'Renewed Faith');await f.game.move(source,'exile');await settle(f.game);assert.equal(f.a.life,life+2);assert.equal(source.zone,'exile');assert.equal(f.a.hand.length,1);
 });
 test(`${role}: a cycling target that leaves and returns is a new object; the trigger fizzles while its draw still resolves`,async()=>{
  const f=context(M,role),target=put(M,f.game,f.b,'Shivan Dragon');await cycle(f,'Deem Worthy');const trigger=f.game.stack.at(-1);assert.equal(trigger.targets[0],target);await f.game.move(target,'exile');await f.game.move(target,'battlefield');await settle(f.game);assert.equal(target.damage,0);assert.equal(f.a.hand.length,1);assert.equal(optionalQueries(f).length,0,'an illegal target prevents even the optional resolution choice');
 });
}
