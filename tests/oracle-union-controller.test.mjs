import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadEngine}from './helpers/load-engine.mjs';import{context,put,settle}from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine();
const names=["Animist's Might",'Bite Down',"Domri's Ambush",'Hard-Hitting Question','Horrific Assault',"Hunter's Mark","Master's Rebuke",'Thrash // Threat','Stump Stomp // Burnwillow Clearing'];
for(const role of ['human','ai'])for(const name of names)test(`${role}: ${name} restricts both alternatives to opponents`,async()=>{
 const ctx=context(M,role),{game,a,b}=ctx;
 const own=put(M,game,a,'Grizzly Bears'),other=put(M,game,a,'Colossal Dreadmaw'),enemy=put(M,game,b,'Colossal Dreadmaw');
 const pwDef={name:'Controller Predicate Planeswalker',types:['Planeswalker'],subtypes:['Test'],super:[],cost:'{3}{U}',loyalty:4};
 const friendlyPW=new M.CardInst(pwDef,a),enemyPW=new M.CardInst(pwDef,b);
 for(const [card,player]of [[friendlyPW,a],[enemyPW,b]]){card.zone='battlefield';card.ctrl=player;card.counters.loyalty=4;game.battlefield.push(card);}game.recalc();
 const source=put(M,game,a,name,'hand');for(const color of Object.keys(a.pool))a.pool[color]=20;
 const original=a.controller.decide.bind(a.controller);let announcements=0;
 a.controller.decide=async(g,q)=>{
  if(q.type==='chooseTargets'){
   announcements++;
   if(announcements===2){
    for(const friendly of [own,other,friendlyPW])assert.equal(q.candidates.includes(friendly),false,friendly.name+' is controlled by caster');
    assert.equal(q.candidates.includes(enemy),true);assert.equal(q.candidates.includes(enemyPW),true);
   }
   if(role==='human')return [announcements===1?own:enemy];
  }
  return original(g,q);
 };
 const beforePool=Object.values(a.pool).reduce((n,x)=>n+x,0);
 assert.equal(await game.castSpell(a,source,{from:'hand',...(name==='Thrash // Threat'?{alt:{splitHalf:'left'}}:{})}),true);
 assert.equal(announcements,2);assert.ok(Object.values(a.pool).reduce((n,x)=>n+x,0)<beforePool);
 const object=game.stack.find(o=>o.card===source);assert.ok(object);const recipient=object.targets[1];assert.equal(recipient.ctrl,b);
 const friendlyLife=other.toughness;await settle(game);assert.equal(other.damage,0);assert.equal(other.toughness,friendlyLife+(["Domri's Ambush","Hunter's Mark"].includes(name)&&object.targets[0]===other?1:0));
});
test('shared scope handling keeps all nine historical registration descriptors byte-for-byte intact',()=>{
 const entries=M.ORACLE_BATCHES.flatMap(b=>b.cards).filter(r=>names.includes(r.raw.name));assert.equal(entries.length,9);
 for(const entry of entries){const batch=M.ORACLE_BATCHES.find(b=>b.cards.includes(entry));const frozen=JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/batch-'+String(batch.sequence).padStart(4,'0')+'.json',import.meta.url))).cards.find(r=>r.raw.name===entry.raw.name);assert.deepEqual(JSON.parse(JSON.stringify(entry)),frozen);}
});
