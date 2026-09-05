import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass}from'../scripts/import-oracle-batch.mjs';
import {extensionCondition,unsupportedPresence}from'../scripts/oracle-extensions-v8.mjs';
const base={name:'Presence grammar boundary',layout:'normal',type_line:'Instant',mana_cost:'{G}',keywords:[]};
test('v8 rejects unknown presence nouns even when the legacy compiler returned a complete frozen shape',()=>{
 for(const noun of ['dream','unknownthing','anotherworld']){
  const card={...base,oracle_text:`Draw a card. If you control a ${noun}, draw two cards instead.`};
  assert.equal(semanticClass(card,{compilerVersion:7}).semanticClass,'spell-template');
  assert.equal(semanticClass(card,{compilerVersion:8}).semanticClass,undefined);
  assert.equal(extensionCondition('you control a '+noun),null);
 }
});
test('known printed card types, canonical subtypes and preserved historical creature qualities remain valid conditions',()=>{
 for(const what of ['creature','artifact','Battle','Dragon','Elf','Time Lord','token','white','blue','black','red','green','colorless','tapped','modified','outlaw'])
  assert.equal(unsupportedPresence({implementation:[{condition:{kind:'has-permanent',what}}]}),false,what);
 const samples=[['0047','Ashenmoor Cohort'],['0057','Mine Raider'],['0063','Supply Caravan'],['0067','Ambitious Assault'],['0138',"Outlaws' Fury"]];
 for(const [id,name]of samples){
  const row=JSON.parse(fs.readFileSync(`reports/oracle-import/batch-${id}.json`)).cards.find(row=>row.raw.name===name);assert.ok(row);
  assert.equal(unsupportedPresence(row),false,name+': exact historical descriptor remains valid');
 }
});
