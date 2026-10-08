import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixtureCompiler} from './helpers/oracle-fixture-plan.mjs';

test('all v70 operation and exported contract IDs are registered for deck import',()=>{
 const source=fs.readFileSync(new URL('../src/modules/deck-import.js',import.meta.url),'utf8');
 const match=/MTG\.ORACLE_INTERACTION_CONTRACTS = Object\.freeze\((\{[\s\S]*?\n  \})\);/.exec(source);
 assert.ok(match,'the native interaction contract registry is present');
 const registry=vm.runInNewContext('('+match[1]+')',Object.create(null),{timeout:1000});
 const classify=fixtureCompiler(70),rows=['common','extra','more'].flatMap(family=>JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v70-'+family+'.json',import.meta.url))));
 assert.equal(rows.length,73);
 for(const row of rows){
  const result=classify(row);assert.ok(result.semanticClass,row.name);
  const visit=node=>{
   if(!node||typeof node!=='object')return;
   if(node.contract)assert.ok(registry[node.contract],row.name+': '+node.contract);
   for(const id of node.oracleContracts||[])assert.ok(registry[id],row.name+': '+id);
   for(const value of Object.values(node))if(value&&typeof value==='object')for(const child of Array.isArray(value)?value:[value])visit(child);
  };
  visit(result);
 }
});
