import test from 'node:test';import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
const M=loadEngine();
import {context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants}from'./helpers/game-state-invariants.mjs';
const colors=['W','U','B','R','G','C'],total=p=>colors.reduce((n,c)=>n+(p.pool[c]||0),0);
async function paidPermanent(f,name){for(const c of colors)f.a.pool[c]=10;const card=put(M,f.game,f.a,name,'hand'),before=total(f.a);assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),true,name+' paid setup');assert.ok(total(f.a)<before);await settle(f.game);assert.equal(card.zone,'battlefield');return card;}
async function setup(role){const f=context(M,role);f.jegantha=await paidPermanent(f,'Jegantha, the Wellspring');f.braider=await paidPermanent(f,'Flamebraider');f.ring=await paidPermanent(f,'Sol Ring');f.game.emptyPool();for(const card of [f.jegantha,f.braider,f.ring])card.sick=false;f.game.turnNo++;return f;}
async function mana(f,card,colors){const source=f.game.manaSources(f.a,null).find(row=>row.card===card);assert.ok(source);assert.equal(await f.game.activateManaSource(f.a,source,source.produce[0],null,colors),true);assert.equal(card.tapped,true);}
const snapshot=f=>JSON.stringify({pool:f.a.pool,colored:f.a.coloredOnlyPool,meta:(f.a.poolMeta||[]).map(row=>({source:row.source.iid,n:row.n,color:row.color,coloredOnly:row.coloredOnly,restrictAbilities:row.restrictAbilities})),tapped:[f.jegantha,f.braider,f.ring].map(card=>card.tapped)});
for(const role of ['human','ai'])for(const floating of [false,true])test(role+': Jegantha and Flamebraider '+(floating?'floating':'automatic')+' mana pay Vernal Sovereign once',async()=>{
 const f=await setup(role),{game,a}=f;await mana(f,f.jegantha,[]);
 if(floating){await mana(f,f.ring,[]);await mana(f,f.braider,['W','W']);assert.equal(a.poolMeta.length,1);assert.equal(a.poolMeta[0].source,f.braider);assert.equal(a.poolMeta[0].n,2);assert.equal(a.poolMeta[0].coloredOnly,false);}
 const card=put(M,game,a,'Vernal Sovereign','hand'),cost=game.spellCost(a,card),before=snapshot(f),manaBefore=a.turnState.manaSpentOnSpells;
 assert.equal(game.canPayMana(a,cost,{card}),true);assert.equal(snapshot(f),before,'affordability is read only');
 assert.ok(game.castableList(a).some(entry=>entry.card===card&&!entry.alt),'printed normal cast is offered');
 assert.equal(await game.castSpell(a,card,{from:'hand'}),true,'offered real paid cast succeeds without a partial-payment rejection');
 assert.ok(game.stack.some(row=>row.card===card&&!row.isCopy));assert.equal(a.turnState.manaSpentOnSpells-manaBefore,6);
 assert.deepEqual(colors.map(c=>a.pool[c]),[0,1,1,1,0,0]);assert.deepEqual(colors.map(c=>a.coloredOnlyPool[c]),[0,1,1,1,0,0]);
 assert.equal(a.poolMeta.length,0,'both restricted Flamebraider units were spent legally, with no stale provenance');
 assert.deepEqual(JSON.parse(JSON.stringify(card.meta._payColors)).sort(),['G','W']);
 await settle(game);assert.equal(card.zone,'battlefield');assert.ok(game.bf().some(token=>token.isToken&&token.ctrl===a&&token.hasSub('Elemental')));
 assertGameStateInvariants(game,'paid Vernal '+role+'/'+floating);assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
});
for(const role of ['human','ai'])test(role+': mixed floating mana preserves restricted provenance and forbids generic-only use',async()=>{
 const f=await setup(role),{game,a}=f;await mana(f,f.jegantha,[]);await mana(f,f.braider,['W','W']);f.ring.tapped=true;
 const element=put(M,game,a,'Vernal Sovereign','hand');
 assert.equal(await game.payMana(a,M.parseCost('{W}'),{card:element}),true);
 assert.equal(a.coloredOnlyPool.W,0,'colored pip consumed Jegantha W');assert.equal(a.pool.W,2);
 assert.equal(a.poolMeta.length,1);assert.equal(a.poolMeta[0].source,f.braider);assert.equal(a.poolMeta[0].n,2,'Elemental-restricted generic-capable W remains restricted');
 const draw=put(M,game,a,'Divination','hand'),before=snapshot(f);
 assert.equal(game.canPayMana(a,game.spellCost(a,draw),{card:draw}),false,'remaining Jegantha colors cannot pay generic and restricted W cannot pay a Sorcery');
 assert.equal(await game.castSpell(a,draw,{from:'hand'}),false);assert.equal(snapshot(f),before,'illegal unrelated cast changes no pool or source');
 assert.equal(game.canPayMana(a,M.parseCost('{3}'),{card:element}),false,'two restricted W do not make remaining colored-only mana generic');
 assert.equal(await game.payMana(a,M.parseCost('{2}'),{card:element}),true);assert.equal(a.poolMeta.length,0);assert.equal(a.pool.W,0);
 assert.equal(game.canPayMana(a,M.parseCost('{1}'),{card:element}),false,'Jegantha-only leftovers remain unable to pay generic');
 assertGameStateInvariants(game,'restricted provenance '+role);
});
