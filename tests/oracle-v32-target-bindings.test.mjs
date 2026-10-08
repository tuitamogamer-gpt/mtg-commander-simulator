import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan, runtimeBatch, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund, def, permanent, targets, source} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v32-target-bindings.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9978,compilerVersion:32});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});
M.initData(M.RAW_DATA);

test('v32 repairs only the complete new Teyo programs, preserving v31 replay',()=>{
  for(const row of rows){
    const prior=semanticClass(row,{compilerVersion:31});
    assert.equal(prior.implementation[0].effects[1].conditionTarget,undefined);
    const fixed=semanticClass(row,{compilerVersion:32});
    assert.equal(fixed.implementation[0].effects[1].conditionTarget,0);
    assert.equal(fixed.implementation[0].effects[2].conditionTarget,0);
    for(const effect of fixed.implementation[0].effects)delete effect.conditionTarget;
    assert.deepEqual(fixed,prior);
    assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:32}).semanticClass,undefined);
  }
});

for(const row of rows)for(const role of ['human','ai'])for(const types of [['Creature'],['Planeswalker'],['Creature','Planeswalker'],['Artifact']])
  test(`${row.name}/${role}: counters follow target types ${types.join('/')}`,async()=>{
    const f=context(M,role),{game:g,a,b}=f;fund(a);
    const victim=permanent(M,g,a,def('Teyo target',types,{loyalty:4}));
    if(types.includes('Planeswalker'))victim.counters.loyalty=4;
    const foreign=permanent(M,g,b,def('Foreign target'));
    const previousLoyalty=victim.counters.loyalty||0;
    targets(a,[victim]);
    const teyo=await source(M,f,row.name,settle);
    assert.equal(victim.counters['+1/+1']||0,types.includes('Creature')?1:0);
    assert.equal(victim.counters.loyalty||0,previousLoyalty+(types.includes('Planeswalker')?1:0));
    assert.equal(victim.kw(row.name.includes('Diamondblade')?'deathtouch':'hexproof'),true);
    assert.equal(teyo.counters['+1/+1']||0,0);
    const spec=teyo.def.triggers.find(t=>t.targets?.length).targets[0];
    assert.equal(g.legalTargets(spec,teyo,a).includes(foreign),false);
    assert.equal(g.legalTargets(spec,teyo,a).includes(teyo),true);
    assertGameStateInvariants(g);
  });
