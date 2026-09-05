import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionCondition,extensionTarget} from '../scripts/oracle-extensions-v8.mjs';

test('new token targeting preserves the complete historical Seasoned Warrenguard descriptor',()=>{
  const row=JSON.parse(readFileSync(new URL('../reports/oracle-import/batch-0159.json',import.meta.url)))
    .cards.find(row=>row.raw.name==='Seasoned Warrenguard');
  const source={name:row.raw.name,mana_cost:row.raw.cost,oracle_text:row.raw.oracle,
    type_line:row.catalog.typeLine,layout:row.raw._layout,power:row.raw.power,toughness:row.raw.toughness};
  const result=semanticClass(source,{compilerVersion:8});
  assert.equal(result.semanticClass,row.semanticClass,result.reason);
  assert.deepEqual(result.implementation,row.implementation);
});

test('simple token presence and token targets retain their distinct established contracts',()=>{
  for(const verb of ['have','control'])for(const article of ['a','another']){
    assert.deepEqual(extensionCondition(`you ${verb} ${article} token`),
      {kind:'has-permanent',what:'token',other:article==='another'});
  }
  assert.deepEqual(extensionTarget('target token'),
    {what:'permanent',zone:'battlefield',controller:'any',min:1,token:true});
  assert.equal(extensionCondition('you control an artifact').kind,'count-comparison',
    'earlier target-capable nouns keep their own historical condition grammar');
  assert.equal(extensionCondition('you control two or more tokens').kind,'count-comparison');
  assert.equal(extensionCondition('you control a token and an unsupported clause'),null);
});
