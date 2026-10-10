import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleEquipAbility, activatedOracleLines, activatedPaths, stickerActivationPaths,
  stackActivationPaths, hasDirectOracleManaActivation } from '../scripts/card-certification-rules.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

test('Equipment certification recognizes the explicit compiled Belt of Giant Strength Equip path', () => {
  const MTG=loadEngine(),definition=MTG.DEFS['Belt of Giant Strength'];
  assert.equal(definition.equip,undefined);
  assert.equal(oracleEquipAbility(definition),true);
  const ability=definition.abilities.find(row=>row.oracleEquip);
  assert.equal(ability.cost.oracleEquipPowerReduction,true);
});

test('Equipment certification does not accept an unrelated, unmarked or incomplete ability', () => {
  const valid={oracleCompiled:true,oracleEquip:true,equip:true,sorcery:true,cost:{mana:'{2}'},
    targets:[{what:'creature',zone:'battlefield',filter:()=>true}],run:async()=>{}};
  assert.equal(oracleEquipAbility({abilities:[valid]}),true);
  assert.equal(oracleEquipAbility({abilities:[{cost:{mana:'{1}'},run:async()=>{}}]}),false);
  for(const missing of ['oracleCompiled','oracleEquip','equip','sorcery','cost','run','targets']) {
    const incomplete={...valid};delete incomplete[missing];
    assert.equal(oracleEquipAbility({abilities:[incomplete]}),false,missing);
  }
  assert.equal(oracleEquipAbility({abilities:[{...valid,targets:[]}]}),false);
  assert.equal(oracleEquipAbility({abilities:[{...valid,targets:[{what:'player',zone:'player',filter:()=>true}]}]}),false);
  assert.equal(oracleEquipAbility({abilities:[{...valid,targets:[{what:'creature',zone:'battlefield'}]}]}),false);
});

test('Certification counts only executable registered sticker programs and their native consumers', () => {
  const MTG=loadEngine(),definition=MTG.DEFS['Carnival Elephant Meteor'];
  assert.equal(stickerActivationPaths(definition,MTG),1);
  for(const sheet of MTG.OracleV87.sheets.values()) {
    const def=MTG.DEFS[sheet.name];
    assert.ok(activatedPaths(def,MTG)>=activatedOracleLines(def.oracle).length,sheet.name);
  }
  assert.equal(stickerActivationPaths({...definition,stickerSheetV87:false},MTG),0);
  assert.equal(stickerActivationPaths({...definition,stickersV87:[]},MTG),0);
  for(const field of ['text','cost','sheet','index']) {
    const rows=definition.stickersV87.map(row=>row.kind==='ability'?{...row,[field]:field==='cost'||field==='index'?-1:'wrong'}:row);
    assert.equal(stickerActivationPaths({...definition,stickersV87:rows},MTG),0,field);
  }
  const registry={...MTG.OracleV87,programs:new Map()};
  assert.equal(stickerActivationPaths(definition,{...MTG,OracleV87:registry}),0);
  for(const field of ['applyStickerLayers','applyProgram'])
    assert.equal(stickerActivationPaths(definition,{...MTG,OracleV87:{...MTG.OracleV87,[field]:null}}),0,field);
  function MissingConsumer(){}
  assert.equal(stickerActivationPaths(definition,{...MTG,Game:MissingConsumer}),0);
  const key=definition.name+':6';
  for(const program of [{abilities:[{cost:{}}]}, {abilities:[{run:()=>{}}]}, {mana:[{cost:{}}]}, {mana:[{produce:['C']}]}]) {
    const programs=new Map(MTG.OracleV87.programs);programs.set(key,program);
    assert.equal(stickerActivationPaths(definition,{...MTG,OracleV87:{...MTG.OracleV87,programs}}),0);
  }
});

test('Certification recognizes the finite Lightning Storm stack interface without accepting incomplete markers', () => {
  const MTG=loadEngine(),definition=MTG.DEFS['Lightning Storm'];
  assert.equal(stackActivationPaths(definition,MTG),1);
  for(const field of ['name','oracleV88Name','lightningStormV88','resolve']) {
    const incomplete={...definition};delete incomplete[field];
    assert.equal(stackActivationPaths(incomplete,MTG),0,field);
  }
  assert.equal(stackActivationPaths({...definition,name:'Other spell'},MTG),0);
  assert.equal(stackActivationPaths(definition,{...MTG,OracleV88:{spellNames:new Set()}}),0);
  function MissingConsumer(){}
  assert.equal(stackActivationPaths(definition,{...MTG,Game:MissingConsumer}),0);
});

test('Certification distinguishes direct Land mana from quoted chapter grants and reminder text', () => {
  const MTG=loadEngine();
  assert.equal(hasDirectOracleManaActivation(MTG.DEFS["Urza's Saga"].oracle),false);
  assert.equal(hasDirectOracleManaActivation('{T}: Add {C}.'),true);
  assert.equal(hasDirectOracleManaActivation('{1}, {T}: Add {U}.'),true);
  assert.equal(hasDirectOracleManaActivation('Create a token with "{T}: Add {C}."'),false);
  assert.equal(hasDirectOracleManaActivation('(This land has {T}: Add {C}.)'),false);
  assert.equal(hasDirectOracleManaActivation('It gains {T}: Add {C}.'),false);
  assert.equal(activatedPaths({types:['Land'],oracle:'{T}: Add {C}.'},MTG),0);
});
