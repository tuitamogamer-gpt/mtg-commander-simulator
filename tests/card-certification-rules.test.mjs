import test from 'node:test';
import assert from 'node:assert/strict';
import { oracleEquipAbility } from '../scripts/card-certification-rules.mjs';
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
