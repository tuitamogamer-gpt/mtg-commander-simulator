import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan, runtimeBatch, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {proveSpellV32} from './helpers/oracle-v32-spells-proof.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,def,put,permanent} from './helpers/oracle-v30-permanents-proof.mjs';

const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v32-spells.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9979,compilerVersion:32});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});
M.initData(M.RAW_DATA);

test('v32 consumes whole printed spells and rejects unsupported continuations',()=>{
  for(const row of rows){
    assert.ok(semanticClass(row,{compilerVersion:32}).semanticClass,row.name);
    assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:32}).semanticClass,undefined,row.name);
  }
});
test('v32 keeps previously compiled v31 source descriptors unchanged',()=>{
  const common=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v31-common.json',import.meta.url)));
  for(const row of common)assert.deepEqual(semanticClass(row,{compilerVersion:32}),semanticClass(row,{compilerVersion:31}),row.name);
});
for(const row of rows)for(const role of ['human','ai'])for(const positive of [false,true])
  test(`${row.name}/${role}/${positive}`,()=>proveSpellV32(M,row.name,role,positive));

for(const name of ['Consign to Dream','Sweep Away','Light of Judgment','Split the Party','Blightning','Book Burning'])
  test(`AI selects an opposing subject for ${name} without restricting candidates`,async()=>{
    const f=context(M,'ai'),{game:g,a,b}=f;fund(a);
    permanent(M,g,a,def('Friendly large creature',['Creature'],{power:'12',toughness:'12'}));
    const enemy=permanent(M,g,b,def('Opposing creature'));
    const spell=put(M,a,name,'hand');
    assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);
    const chosen=g.stack.find(row=>row.card===spell).targets.flat();
    assert.ok(chosen.length&&chosen.every(card=>card===b||card===enemy));
    await settle(g);
  });

for(const role of ['human','ai']){
  test(`${role}: artifact control expires and a returned Vehicle animation persists`,async()=>{
    for(const name of ['Broadcast Takeover','Tune Up']){
      const f=await proveSpellV32(M,name,role,true),{game:g,a,b}=f;
      const affected=g.bf().filter(card=>name==='Broadcast Takeover'?card.owner===b&&card.is('Artifact'):card.hasSub('Vehicle'));
      assert.ok(affected.length);
      g.mainPhase=async()=>{};g.combatPhase=async()=>{};await g.runTurn();await settle(g);
      for(const card of affected)if(name==='Broadcast Takeover'){assert.equal(card.ctrl,b);assert.equal(card.kw('haste'),false);}else{assert.equal(card.ctrl,a);assert.equal(card.is('Creature'),true);}
    }
  });
}
