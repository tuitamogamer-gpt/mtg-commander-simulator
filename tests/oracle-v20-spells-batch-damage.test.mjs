import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-spells-damage.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){const {report}=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9938,limit:absent.length,compilerVersion:20});assert.equal(report.cards.length,absent.length);M.registerOracleBatch(report);}
M.initData(M.RAW_DATA);

for(const role of ['human','ai'])for(const [name,damage,maximum]of [['Unleash Shell',5,2],['Judgment Bolt',5,3],['Synchronized Spellcraft',4,4]])test(role+': '+name+' commits creature and controller damage before resolution ends',async()=>{
 for(const n of name==='Unleash Shell'?[2]:[0,maximum]){
  const f=context(M,role),victim=put(M,f.game,f.b,'Grizzly Bears');victim.def={...victim.def,toughness:'20'};
  for(let i=0;i<n;i++)if(name==='Judgment Bolt'){const equipment=put(M,f.game,f.a,'Bonesplitter');assert.ok(equipment.hasSub('Equipment'));}else if(name==='Synchronized Spellcraft'){const member=put(M,f.game,f.a,'Grizzly Bears');member.def={...member.def,subtypes:[['Cleric','Rogue','Warrior','Wizard'][i]]};}
  f.game.recalc();const source=put(M,f.game,f.a,name,'hand');for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=20;
  const decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=(game,q)=>q.type==='chooseTargets'?[victim]:decide(game,q);
  assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);
  assert.equal(victim.zone,'battlefield');assert.equal(victim.damage,damage);assert.equal(f.b.life,40-n);assert.equal(f.b.poison,0);assert.equal(f.a.life,40);assertGameStateInvariants(f.game);
 }
});
