import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

async function painbringerFixture(donorCount=0){
 const f=nativeFixture(),{game:g,me,put,cast,activate}=f;
 const donors=Array.from({length:donorCount},()=>put('Grizzly Bears','graveyard'));
 const target=put('Shivan Dragon','battlefield',f.rival);
 const source=await cast('Painbringer',['Swamp','Swamp','Swamp','Swamp']);
 const greaves=await cast('Lightning Greaves',['Wastes','Wastes']);
 f.targets=q=>q.candidates.includes(source)?[source]:q.candidates.includes(target)?[target]:q.candidates.slice(0,q.min||0);
 await activate(greaves,[],e=>e.equip);
 assert.equal(greaves.attachedTo,source.iid);
 assert.equal(source.kw('haste'),true);
 f.cards=q=>q.aiHint?.activationPaymentV20?donors:q.from.slice(0,q.min||0);
 return {...f,source,target,donors};
}

test('Actual paid Painbringer with native equipped Greaves offers and pays its zero-card exile activation',async()=>{
 const f=await painbringerFixture(),{game:g,me,source,target}=f;
 assert.equal(me.graveyard.length,0);
 const entry=g.activatableList(me).find(e=>e.card===source&&!e.manaAbility);
 assert.ok(entry,'printed any-number exile cost permits zero without a Forage prerequisite');
 assert.equal(await g.activateAbility(me,entry),true);
 await f.settle();
 assert.equal(source.tapped,true);
 assert.equal(target.power,5);assert.equal(target.toughness,5);
 assert.equal(me.graveyard.length,0);
});

test('Actual paid Corpseweft offers and pays one creature-card exile with only one card in its graveyard',async()=>{
 const f=nativeFixture(),{game:g,me,put,cast}=f;
 const donor=put('Grizzly Bears','graveyard');
 const source=await cast('Corpseweft',['Swamp','Swamp','Swamp']);
 put('Swamp');put('Wastes');
 f.cards=q=>q.aiHint?.activationPaymentV20?[donor]:q.from.slice(0,q.min||0);
 assert.equal(me.graveyard.length,1);
 const entry=g.activatableList(me).find(e=>e.card===source&&!e.manaAbility);
 assert.ok(entry,'printed one-or-more exile cost permits one creature without three Forage cards');
 assert.equal(await g.activateAbility(me,entry),true);await f.settle();
 assert.equal(donor.zone,'exile');
 const token=g.bf().find(c=>c.isToken&&c.hasSub('Zombie')&&c.hasSub('Horror'));
 assert.ok(token);assert.equal(token.power,2);assert.equal(token.toughness,2);assert.equal(token.tapped,true);
 assert.equal(me.pool.B,0);assert.equal(me.pool.C,0);
});

test('Actual paid Corpseweft exiles only its chosen creature when two noncreature graveyard cards are also present',async()=>{
 const f=nativeFixture(),{game:g,me,put,cast}=f;
 const donor=put('Grizzly Bears','graveyard'),other=[put('Forest','graveyard'),put('Island','graveyard')];
 const source=await cast('Corpseweft',['Swamp','Swamp','Swamp']);
 put('Swamp');put('Wastes');f.cards=q=>q.aiHint?.activationPaymentV20?[donor]:q.from.slice(0,q.min||0);
 const entry=g.activatableList(me).find(e=>e.card===source&&!e.manaAbility);assert.ok(entry);
 assert.equal(await g.activateAbility(me,entry),true);await f.settle();
 assert.equal(donor.zone,'exile');assert.ok(other.every(c=>c.zone==='graveyard'));
 const token=g.bf().find(c=>c.isToken);assert.ok(token);assert.equal(token.power,2);
});

test('Actual paid Painbringer retains its native three-card cost and three-point effect',async()=>{
 const f=await painbringerFixture(3),{game:g,me,source,target,donors}=f;
 const entry=g.activatableList(me).find(e=>e.card===source&&!e.manaAbility);assert.ok(entry);
 assert.equal(await g.activateAbility(me,entry),true);await f.settle();
 assert.ok(donors.every(c=>c.zone==='exile'));assert.equal(source.tapped,true);
 assert.equal(target.power,2);assert.equal(target.toughness,2);
});

test('Actual paid Corpseweft retains its creature-only minimum and ordinary mana prerequisite',async()=>{
 const f=nativeFixture(),{game:g,me,put,cast}=f;
 put('Forest','graveyard');put('Island','graveyard');put('Swamp','graveyard');
 const source=await cast('Corpseweft',['Swamp','Swamp','Swamp']);
 put('Swamp');put('Wastes');
 assert.equal(g.activatableList(me).some(e=>e.card===source),false);
 put('Grizzly Bears','graveyard');
 assert.equal(g.activatableList(me).some(e=>e.card===source),true);
 for(const c of g.bf().filter(c=>c.ctrl===me&&c.is('Land')))g.tap(c);
 assert.equal(g.activatableList(me).some(e=>e.card===source),false);
});
