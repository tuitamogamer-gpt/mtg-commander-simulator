import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,paidCast} from './helpers/oracle-v8-fixtures.mjs';
// The six source records and their pinned archive provenance travel with a
// clean clone; this suite must not depend on the ignored import workspace.
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-selected-hand-source.json',import.meta.url))).cards;
const names=['Contagious Vorrac','Blossom Prancer','Pulsar Squadron Ace','Rosecot Knight','Chrome Courier','Town Greeter'];
assert.deepEqual(source.map(card=>card.name).sort(),names.toSorted(),'source fixture must contain each of the six exact names once');
const fixtureName=name=>'Selected-Hand Fixture '+name;
const M=fixtureEngine([...source.filter(c=>names.includes(c.name)).map(c=>[fixtureName(c.name),c.oracle_text.replaceAll(c.name,fixtureName(c.name)),c.type_line,'{G}']),['Result Spacecraft','','Artifact — Spacecraft'],['Result Town','','Land — Town'],['Result Artifact','','Artifact']]);
for(const role of ['human','ai']){
 for(const name of names)for(const selected of [false,true])test(`${role}: ${name} binds its tail to ${selected?'the actual qualifying hand placement':'the absence of a qualifying hand placement'}`,async()=>{
  const ctx=context(M,role),{game,a}=ctx,life=a.life;
  // Keep the entire inspected cohort homogeneous so the local AI makes its own
  // choice while both the positive and negative branches are deterministic.
  const match=name==='Contagious Vorrac'?'Forest':name==='Blossom Prancer'?'Grizzly Bears':name==='Pulsar Squadron Ace'?'Result Spacecraft':name==='Town Greeter'?'Result Town':'Result Artifact';
  const miss=name==='Contagious Vorrac'?'Lightning Bolt':name==='Town Greeter'?'Forest':name==='Chrome Courier'?'Grizzly Bears':'Forest';
  const cohort=Array.from({length:6},()=>put(M,game,a,selected?match:miss,'library'));
  const old=put(M,game,a,match,'hand');
  const proliferated=put(M,game,a,'Grizzly Bears');proliferated.counters['+1/+1']=1;game.recalc();
  if(role==='human'){
   const decide=a.controller.decide.bind(a.controller);
   a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.from.some(c=>cohort.includes(c))?Promise.resolve(q.from.slice(0,q.max)):q.type==='chooseTargets'&&q.spec?.what==='proliferate'?Promise.resolve([proliferated]):decide(g,q);
  }
  const card=await paidCast(M,ctx,fixtureName(name));
  assert.equal(old.zone,'hand');
  const moved=cohort.filter(c=>c.zone==='hand');
  assert.equal(moved.length,selected||['Chrome Courier','Town Greeter'].includes(name)?1:0);
  assert.equal(a.life,life+(name==='Blossom Prancer'&&!selected?4:name==='Chrome Courier'&&selected?3:name==='Town Greeter'&&selected?2:0));
  assert.equal(card.counters['+1/+1']||0,['Pulsar Squadron Ace','Rosecot Knight'].includes(name)&&!selected?1:0);
  assert.equal(proliferated.counters['+1/+1'],name==='Contagious Vorrac'&&!selected?2:1);
 });
}
test('declining a legal library choice takes the printed no-card branch',async()=>{
 const ctx=context(M),{game,a}=ctx,life=a.life;const eligible=Array.from({length:5},()=>put(M,game,a,'Grizzly Bears','library'));
 await paidCast(M,ctx,fixtureName('Blossom Prancer'));assert.equal(a.life,life+4);assert.ok(eligible.every(c=>c.zone==='library'));
});
test('selected-hand references reject unrelated instructions, opponent libraries, and second result sentences',()=>{
 for(const oracle_text of [
  'Draw a card. If you put an artifact card into your hand this way, you gain 3 life.',
  'Look at the top two cards of target opponent\'s library. Put one into your hand and the rest into your graveyard. If you didn\'t put a card into your hand this way, you gain 3 life.',
  'Look at the top two cards of your library. Put one into your graveyard and the rest into your hand. If you put an artifact card into your hand this way, you gain 3 life.',
  'Look at the top two cards of your library. Put one into your hand and the rest into your graveyard. If you put an artifact card into your hand this way, you gain 3 life. Repeat this process.',
 ])assert.equal(semanticClass({name:'Unbound hand result',oracle_text,type_line:'Sorcery',mana_cost:'{G}',layout:'normal'}).semanticClass,undefined);
});
