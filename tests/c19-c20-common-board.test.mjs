import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M,setup,card,body,settle,mana} from './helpers/c19-c20-fixtures.mjs';
const names=JSON.parse(fs.readFileSync(new URL('../reports/decks/precon-c19-c20-znc-2026-09-08/intake.json',import.meta.url))).newNames;
for(const role of ['human','ai'])for(const name of names)test(role+': common board paid casting and available activation — '+name,async()=>{
 const f=setup(role);f.decide=(p,q)=>{assert.notEqual(q.type,'manualResolve',name+' must resolve natively');};
 for(const p of f.game.players){
  for(const land of ['Forest','Island','Swamp','Mountain','Plains'])card(f,land,'battlefield',p);
  for(const n of ['Grizzly Bears','Solemn Simulacrum','Sol Ring','Propaganda'])card(f,n,'battlefield',p);
  const commander=card(f,'Kalamax, the Stormsire','battlefield',p);commander.commander=true;p.commanders=[commander];
  card(f,'Kadena, Slinking Sorcerer','command',p);
  for(const n of ['Grizzly Bears','Faithless Looting','Solemn Simulacrum','Forest'])card(f,n,'graveyard',p);
  card(f,'Faithless Looting','exile',p);
  for(const n of ['Grizzly Bears','Sol Ring','Forest','Lightning Bolt'])card(f,n,'hand',p);
  for(const n of ['Grizzly Bears','Sol Ring','Lightning Bolt'])card(f,n,'library',p);
  for(const key of Object.keys(p.pool))p.pool[key]=6;
 }
 if(['Deflecting Swat','Increasing Vengeance','Refuse // Cooperate','Sudden Substitution'].includes(name)){
  const bolt=card(f,'Lightning Bolt','hand',f.b);f.game.remove(bolt);bolt.zone='stack';const target=f.game.creatures(f.a)[0];
  f.game.stack.push({kind:'spell',card:bolt,name:bolt.name,ctrl:name==='Increasing Vengeance'?f.a:f.b,targets:[target],targetSpecs:[M.T.any()],targetIdentities:f.game.captureTargetIdentities([target]),castOpts:{},oracleDefinition:bolt.def,from:'hand',x:0});
 }
 if(['Mandate of Peace','Spinal Embrace'].includes(name)){f.game.phase='combat';f.game.step='attackers';f.game.combat={attackers:[],hadAttackers:false};}
 const source=card(f,name,'hand'),before=mana(f.a);assert.ok(M.SCRIPTS[name]&&!source.def.autoScripted&&!source.def.simplified);
 assert.equal(await f.game.castSpell(f.a,source),true,name+' casts on the common board');assert.ok(mana(f.a)<before,name+' paid mana');assert.ok(f.game.stack.some(s=>s.card===source),name+' used the Stack');
 await settle(f.game);assert.notEqual(source.zone,'stack');assert.equal(f.game.stack.length,0);
 if(source.zone==='battlefield'&&source.ctrl===f.a){
  source.tapped=false;for(const k of Object.keys(f.a.pool))f.a.pool[k]=6;f.game.phase='main1';f.game.step='main';f.game.recalc();
  const entry=f.game.activatableList(f.a).find(e=>e.card===source&&!e.manaAbility&&!e.equip&&(!e.ability?.cond||e.ability.cond(f.game,source,f.a)));
  if(entry){assert.equal(await f.game.activateAbility(f.a,entry),true,name+' available activation pays and stacks');await settle(f.game);}
 }
 assert.ok(!f.game.log.some(r=>/bez automatike|rješavaš ručno|could not make progress|Unknown|undefined/i.test(r.msg)),name+' has no fallback or stalled rule path');
});
