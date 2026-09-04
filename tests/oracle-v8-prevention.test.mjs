import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const MTG=fixtureEngine([
 ['Player Shield','Prevent the next 2 damage that would be dealt to you this turn.','Instant','{W}'],
 ['Combat Shield','Prevent the next 2 combat damage that would be dealt to you this turn.','Instant','{W}'],
 ['Self Shield','{W}: Prevent the next 2 damage that would be dealt to this creature this turn.'],
 ['Outgoing Shield','{W}: Prevent the next 2 damage that would be dealt by this creature this turn.'],
 ['Departing Shield','{W}: Prevent the next 2 damage that would be dealt by this creature this turn.\n{R}, Sacrifice this creature: This creature deals 3 damage to target opponent.'],
 ['Artifact Shield','Prevent the next 2 damage that would be dealt this turn to target artifact creature.','Instant','{W}'],
 ['Shield Body','','Artifact Creature — Golem'],
]);
for(const role of ['human','ai']){
 for(const combat of [false,true])test(`${role}: finite player ${combat?'combat ':''}shield is paid, consumed exactly and does not prevent the wrong damage kind`,async()=>{
  const {game,a,b}=context(MTG,role),source=put(MTG,game,a,combat?'Combat Shield':'Player Shield','hand'),attacker=put(MTG,game,b,'Grizzly Bears');
  a.pool.W=1;assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(a.pool.W,0);await settle(game);
  const start=a.life,shield=game.untilEffects.find(e=>e.kind==='oraclePreventNextAmount');assert.ok(shield);assert.equal(shield.remaining,2);
  if(combat){await game.damagePlayer(attacker,a,2);assert.equal(a.life,start-2);assert.equal(shield.remaining,2);}
  const before=a.life;await game.damagePlayer(attacker,a,1,{combat});assert.equal(a.life,before);assert.equal(shield.remaining,1);
  await game.damagePlayer(attacker,a,3,{combat});assert.equal(a.life,before-2);assert.equal(shield.remaining,0);
  await game.damagePlayer(attacker,a,1,{combat});assert.equal(a.life,before-3);
 });
 test(`${role}: targeted qualifier and self shields affect exact battlefield incarnations`,async()=>{
  const {game,a,b}=context(MTG,role),body=put(MTG,game,a,'Shield Body'),other=put(MTG,game,a,'Grizzly Bears'),attacker=put(MTG,game,b,'Grizzly Bears');
  const spell=put(MTG,game,a,'Artifact Shield','hand');a.pool.W=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);
  assert.equal(await game.damageCreature(attacker,body,2),0);assert.equal(await game.damageCreature(attacker,other,1),1);
  const source=put(MTG,game,a,'Self Shield');a.pool.W=1;const ability=game.activatableList(a).find(row=>row.card===source);assert.ok(ability);assert.equal(await game.activateAbility(a,ability),true);await settle(game);
  const version=source.zoneVersion;await game.move(source,'exile');await game.move(source,'battlefield',{ctrl:a});assert.notEqual(source.zoneVersion,version);
  assert.equal(await game.damageCreature(attacker,source,2),2,'shield does not follow a blink');
 });
 test(`${role}: outgoing finite shield follows only its captured damage source`,async()=>{
  const {game,a,b}=context(MTG,role),source=put(MTG,game,a,'Outgoing Shield'),other=put(MTG,game,a,'Grizzly Bears');a.pool.W=1;
  assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source)),true);await settle(game);
  const before=b.life;await game.damagePlayer(other,b,1);assert.equal(b.life,before-1);await game.damagePlayer(source,b,3);assert.equal(b.life,before-2);
 });
 test(`${role}: outgoing shield recognizes the old source when a paid sacrifice ability resolves`,async()=>{
  const {game,a,b}=context(MTG,role),source=put(MTG,game,a,'Departing Shield');a.pool.W=1;a.pool.R=1;
  assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source&&!row.ability.cost.sacSelf)),true);await settle(game);
  const before=b.life;assert.equal(await game.activateAbility(a,game.activatableList(a).find(row=>row.card===source&&row.ability.cost.sacSelf)),true);
  assert.equal(source.zone,'graveyard');await settle(game);assert.equal(b.life,before-1,'two of three damage from the exact old incarnation is prevented');
 });
}
test('finite prevention supports exact quantities and rejects unimplemented modifiers',()=>{
 const card={name:'Prevention Probe',type_line:'Instant',layout:'normal',mana_cost:'{X}{W}'};
 const parsed=semanticClass({...card,oracle_text:'Prevent the next X damage that would be dealt to you this turn.'});
 assert.equal(parsed.implementation[0].effects[0].n,'X');
 const counted=semanticClass({...card,oracle_text:'Prevent the next X damage that would be dealt to target creature this turn, where X is the number of Clerics on the battlefield.'});
 assert.ok(counted.semanticClass);
 for(const oracle_text of ['Prevent the next 2 damage that would be dealt to you this turn unless an opponent pays {1}.','Prevent the next 2 damage that would be dealt to you this turn by red sources.'])assert.equal(semanticClass({...card,oracle_text}).semanticClass,undefined);
});
