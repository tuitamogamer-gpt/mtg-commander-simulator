import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const names=['Reenact the Crime','Become Anonymous','False Dawn'];
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v70-common.json',import.meta.url))).filter(r=>names.includes(r.name));
const plan=createFixturePlan(rows,70,9972),M=loadEngine();registerCanonicalFixturePlan(M,plan);
for(const role of ['human','ai']){
 test(`${role}: Reenact casts a real card copy and its permanent resolves as a token`,async()=>{
  const f=context(M,role),{game:g,a,b}=f;fund(a);fund(b);
  const original=put(M,b,def('Reenact copied creature',['Creature'],{cost:'{3}{G}',power:'5',toughness:'5'}),'hand');await g.move(original,'graveyard');
  choose(a,q=>q.type==='chooseTargets'?{...q,candidates:q.candidates.filter(c=>c===original),min:1,max:1}:q.type==='chooseCards'&&q.from.some(c=>c.meta.bomCastCopy)?{...q,from:q.from.filter(c=>c.meta.bomCastCopy),min:1,max:1}:null);
  const source=put(M,a,'Reenact the Crime','hand'),mana=total(a);assert.equal(await g.castSpell(a,source,{from:'hand'}),true);assert.ok(total(a)<mana);await settle(g);
  const token=g.creatures(a).find(c=>c.name===original.name);assert.ok(token);assert.equal(token.isToken,true);assert.equal(token.power,5);assert.equal(original.zone,'exile');assert.equal(a.exile.length,0,'temporary cast-card copy was cleaned up');await g.destroy(token);await settle(g);assert.equal(a.graveyard.some(c=>c.name===original.name),false);assertGameStateInvariants(g);
 });
 test(`${role}: Become Anonymous hides all three cards and each enters tapped before ETB`,async()=>{
  const {game:g,a,b}=context(M,role);fund(a);const creature=permanent(M,g,a,def('Anonymous selected creature')),top1=put(M,a,def('Anonymous first top card',['Instant'])),top2=put(M,a,def('Anonymous second top card',['Sorcery']));
  const watched=[creature,top1,top2],seen=[];const emit=g.emit.bind(g);g.emit=async function(event,data){if(event==='etb'&&watched.includes(data.card))seen.push({card:data.card,tapped:data.card.tapped,faceDown:data.card.faceDown});return emit(event,data);};
  const moves=[];const move=g.move.bind(g);g.move=async function(c,to,opts){if(watched.includes(c)&&to==='exile')moves.push({...opts});return move(c,to,opts);};
  choose(a,q=>q.type==='chooseTargets'?{...q,candidates:[creature],min:1,max:1}:null);
  const source=put(M,a,'Become Anonymous','hand'),mana=total(a);assert.equal(await g.castSpell(a,source,{from:'hand'}),true);assert.ok(total(a)<mana);await settle(g);
  assert.equal(moves.length,3);assert.ok(moves.every(opts=>opts.exileFaceDown===true&&opts.exileLookers.length===0));assert.equal(seen.length,3);assert.ok(seen.every(row=>row.tapped&&row.faceDown));for(const c of watched){assert.equal(c.zone,'battlefield');assert.equal(c.power,2);assert.equal(c.toughness,2);}assertGameStateInvariants(g);
 });
 test(`${role}: False Dawn replaces spell and triggered mana, preserves existing mana and colorless mana`,async()=>{
  const {game:g,a,b}=context(M,role);fund(a);fund(b);const source=put(M,a,'False Dawn','hand'),mana=total(a);assert.equal(await g.castSpell(a,source,{from:'hand'}),true);assert.ok(total(a)<mana);await settle(g);
  const ritual=put(M,a,def('False Dawn actual ritual',['Instant'],{cost:'{1}',resolve:async ctx=>M.OracleV20.helpers.runGenericEffect(ctx,{action:'add-mana',produce:{R:3,C:2},restriction:{spell:{what:'spell',zone:'stack',spellQuality:'creature'},abilities:false}})}),'hand');
  const before={...a.pool};assert.equal(await g.castSpell(a,ritual,{from:'hand'}),true);const paid={...a.pool};await settle(g);assert.equal(a.pool.R,paid.R);assert.equal(a.pool.C,paid.C+2);assert.equal(a.pool.W,paid.W+3);assert.ok(a.poolMeta.some(r=>r.color==='W'&&r.n===3&&r.restrict));
  const own=permanent(M,g,a,def('False Dawn mana trigger')),foreign=permanent(M,g,b,def('Foreign mana trigger'));const initial={...a.pool};g.queueTrigger({src:own,ctrl:a,name:'White replacement trigger',run:async()=>{a.pool.B+=2;g.note('mana',{p:a});}});await settle(g);assert.equal(a.pool.W,initial.W+2);assert.equal(a.pool.B,initial.B);
  let paidInside;g.queueTrigger({src:own,ctrl:a,name:'Spend then add mana',run:async()=>{assert.equal(await g.payMana(a,M.parseCost('{R}'),{card:own,isAbility:true}),true);paidInside={...a.pool};a.pool.R+=3;}});await settle(g);assert.equal(a.pool.R,paidInside.R);assert.equal(a.pool.W,paidInside.W+3);
  const opponentBefore={...a.pool};g.queueTrigger({src:foreign,ctrl:b,name:'Opponent gives colored mana',run:async()=>{a.pool.G+=1;g.note('mana',{p:a});}});await settle(g);assert.equal(a.pool.G,opponentBefore.G+1,'opponent controlled mana instruction retains color');assertGameStateInvariants(g);
 });
}
