import test from'node:test';import assert from'node:assert/strict';import{loadEngine}from'./helpers/load-engine.mjs';const M=loadEngine();import{context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';import{assertGameStateInvariants}from'./helpers/game-state-invariants.mjs';
const fund=p=>{for(const color of Object.keys(p.pool))p.pool[color]=20;},sum=p=>Object.values(p.pool).reduce((n,v)=>n+v,0);
async function source(f,name,commander=false){const card=put(M,f.game,f.a,name,'hand');card.commander=commander;fund(f.a);assert.equal(await f.game.castSpell(f.a,card,{from:'hand'}),true);await settle(f.game);assert.equal(card.zone,'battlefield');return card;}
async function fixture(role,{commander=true,second=false}={}){const f=context(M,role);if(role==='human'){const decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=async(g,q)=>q.type==='chooseMulti'&&q.prompt?.startsWith('Nexus Mentality:')?q.options.map(row=>row.key):decide(g,q);}f.zimone=await source(f,'Zimone, Infinite Analyst',commander);if(second)f.other=await source(f,'Sol Ring');f.game.addCounters(f.zimone,'+1/+1',3,true,f.a);f.game.recalc();f.nexus=put(M,f.game,f.a,'Nexus Mentality','hand');f.game.emptyPool();f.a.pool.U=1;f.a.pool.C=3;return f;}
for(const role of['human','ai'])for(const commander of[false,true])test(role+': lone '+(commander?'commander':'permanent')+' offers only Nexus draw mode and pays once',async()=>{
 const f=await fixture(role,{commander}),{game,a,nexus,zimone}=f,trace=[];const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>{const answer=await decide(g,q);trace.push({q,answer});return answer;};
 assert.ok(game.castableList(a).some(row=>row.card===nexus));const hand=a.hand.length,spent=a.turnState.manaSpentOnSpells;
 assert.equal(await game.castSpell(a,nexus,{from:'hand'}),true,'legal draw mode is cast without a rejected transfer attempt');
 const mode=trace.find(row=>['chooseOption','chooseMulti'].includes(row.q.type)&&row.q.prompt?.startsWith('Nexus Mentality:'));assert.ok(mode);assert.deepEqual(Array.from(mode.q.options,row=>row.key),['1']);
 assert.equal(trace.some(row=>row.q.prompt==='From which permanent?'),false);assert.equal(trace.some(row=>row.q.prompt==='To which permanent?'),false);
 const so=game.stack.find(row=>row.card===nexus);assert.deepEqual(Array.from(so.mode),[1]);assert.equal(sum(a),0);assert.equal(a.turnState.manaSpentOnSpells-spent,4);
 await settle(game);assert.equal(a.hand.length,hand-1+3);assert.equal(zimone.counters['+1/+1']||0,0);assert.equal(nexus.zone,'graveyard');assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);assertGameStateInvariants(game,'Nexus lone target '+role);
});
for(const role of['human','ai'])test(role+': two permanents preserve Nexus transfer and draw options',async()=>{
 const f=await fixture(role,{second:true}),{game,a,nexus,zimone,other}=f,trace=[];const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>{
  let result;if(!a.isAI&&q.type==='chooseMulti'&&q.prompt?.startsWith('Nexus Mentality:'))result=['0','1'];
  else if(!a.isAI&&q.type==='chooseTargets')result=[q.prompt==='From which permanent?'?zimone:other];else result=await decide(g,q);
  trace.push({q,result});return result;};
 const total=game.bf().reduce((n,c)=>n+Object.values(c.counters).reduce((v,x)=>v+x,0),0),hand=a.hand.length;
 assert.equal(await game.castSpell(a,nexus,{from:'hand'}),true);const mode=trace.find(row=>row.q.type==='chooseMulti');assert.deepEqual(Array.from(mode.q.options,row=>row.key),['0','1']);
 const so=game.stack.find(row=>row.card===nexus);assert.deepEqual(Array.from(so.mode),[0,1]);assert.notEqual(so.targets[0],so.targets[1]);assert.equal(sum(a),0);
 await settle(game);const remaining=game.bf().reduce((n,c)=>n+Object.values(c.counters).reduce((v,x)=>v+x,0),0);assert.equal(a.hand.length-(hand-1),total-remaining,'draw equals counters actually removed after transfer');assert.equal(nexus.zone,'graveyard');assertGameStateInvariants(game,'Nexus two targets '+role);
});
for(const role of['human','ai'])test(role+': no nonland target hides Nexus and a stale illegal mode selection pays nothing',async()=>{
 const empty=context(M,role);fund(empty.a);const absent=put(M,empty.game,empty.a,'Nexus Mentality','hand');assert.equal(empty.game.castableList(empty.a).some(row=>row.card===absent),false);const initial=sum(empty.a);assert.equal(await empty.game.castSpell(empty.a,absent,{from:'hand'}),false);assert.equal(sum(empty.a),initial);
 const f=await fixture(role),before=sum(f.a),counts=JSON.stringify(f.zimone.counters);let targetQueries=0;const decide=f.a.controller.decide.bind(f.a.controller);
 f.a.controller.decide=async(g,q)=>{if(q.type==='chooseMulti'&&q.prompt?.startsWith('Nexus Mentality:'))return ['0','1'];if(q.type==='chooseTargets')targetQueries++;return decide(g,q);};
 assert.equal(await f.game.castSpell(f.a,f.nexus,{from:'hand'}),false);assert.equal(targetQueries,0,'nonoffered transfer is rejected before any target choice');assert.equal(sum(f.a),before);assert.equal(JSON.stringify(f.zimone.counters),counts);assert.equal(f.nexus.zone,'hand');assert.equal(f.game.stack.length,0);
});
