import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine();

for(const role of ['human','ai'])test(`${role}: printed unqualified searches require finding a card when one is present`,async()=>{
 for(const name of ['Illicit Shipment','Coveted Prize','Demonic Tutor']){
  const {game,a,trace}=context(M,role),source=put(M,game,a,name,'hand');Object.assign(a.pool,{C:10,B:5});
  const hand=a.hand.length,library=a.library.length;
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
  const queries=trace.filter(row=>row.q.type==='chooseCards'&&row.q.search);assert.equal(queries.length,1,name+': one actual search');
  assert.equal(queries[0].q.min,1,name+': no stated quality allows no fail-to-find choice');
  assert.equal(a.hand.length,hand);assert.equal(a.library.length,library-1);assert.equal(source.zone,'graveyard');
 }
});
for(const role of ['human','ai'])test(`${role}: qualified search may fail to find and an empty unqualified search requires zero cards`,async()=>{
 const f=context(M,role),source=put(M,f.game,f.a,'Idyllic Tutor','hand'),match=put(M,f.game,f.a,'Rhystic Study','library');Object.assign(f.a.pool,{C:2,W:1});
 assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);
 const search=f.trace.find(row=>row.q.type==='chooseCards'&&row.q.search);assert.ok(search);assert.equal(search.q.min,0,'enchantment is a stated quality even with a match present');
 if(role==='human')assert.equal(match.zone,'library','the human may legally choose no match');
 const g=context(M,role),emptySource=put(M,g.game,g.a,'Illicit Shipment','hand');g.a.library=[];Object.assign(g.a.pool,{C:3,B:2});
 assert.equal(await g.game.castSpell(g.a,emptySource,{from:'hand'}),true);await settle(g.game);
 const empty=g.trace.find(row=>row.q.type==='chooseCards'&&row.q.search);assert.ok(empty);assert.equal(empty.q.min,0);assert.equal(g.a.hand.length,0);
});
