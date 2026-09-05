import test from 'node:test';import assert from 'node:assert/strict';import {loadEngine} from './helpers/load-engine.mjs';
const M=loadEngine();
function fixture(role){const g=new M.Game({seed:951121,paced:false}),a=g.addPlayer('Actor',{name:'Test'},null,role==='ai'),b=g.addPlayer('Opponent',{name:'Test'},null,false),trace=[];g.turnPlayer=a;g.turnNo=30;g.phase='main1';g.step='main';g.priorityRound=async()=>{};const answer=q=>q.type==='chooseCards'?q.from.slice(0,q.min||0):q.type==='chooseTargets'?q.candidates.slice(0,q.min||0):q.type==='chooseOption'?q.options[0]?.key:q.type==='chooseManaSources'?{cards:q.suggested}:q.type==='orderTriggers'?q.triggers:q.type==='priority'?{kind:'pass'}:null;const ai=new M.AIController(a,{difficulty:'easy',style:'opportunist'});a.controller={decide:async(s,q)=>{trace.push(q);return role==='ai'?ai.decide(s,q):answer(q)}};b.controller={decide:async(s,q)=>answer(q)};const put=(n,z='library',p=a)=>{const c=new M.CardInst(M.DEFS[n],p);c.zone=z;if(z==='battlefield')g.battlefield.push(c);else p[z].push(c);return c;};for(const p of[a,b])for(let i=0;i<10;i++)put('Forest','library',p);return{g,a,b,put,trace};}
async function settle(g){let n=0;while(g.pendingTriggers.length||g.stack.length){assert.ok(++n<60);await g.flushTriggers();if(g.stack.length)await g.resolveTop();}}
async function cast(f,name,target){const c=f.put(name,'hand');for(const k of Object.keys(f.a.pool))f.a.pool[k]=20;const decide=f.a.controller.decide;f.a.controller.decide=async(g,q)=>q.type==='chooseTargets'&&target&&q.candidates.includes(target)?[target]:decide(g,q);assert.equal(await f.g.castSpell(f.a,c),true);f.a.controller.decide=decide;await settle(f.g);return c;}
for(const role of['human','ai']){
 test(`${role}: paid reanimation clears Kotis grant before a later death`,async()=>{const f=fixture(role),{g,a,put}=f,kotis=await cast(f,'Kotis, Sibsig Champion'),w=put('Timeless Witness','graveyard');for(let i=0;i<4;i++)put('Forest','graveyard');g.recalc();assert.ok(w.def.flashback?.kotis);await cast(f,'Zombify',w);assert.equal(w.zone,'battlefield');assert.equal(w.def,M.DEFS['Timeless Witness'],'restore base definition on actual graveyard entry');await cast(f,'Murder',kotis);await cast(f,'Murder',w);assert.equal(w.zone,'graveyard');assert.equal(g.castableList(a).some(e=>e.card===w),false);});
 test(`${role}: graveyard to hand expires the zone grant and stale cast cannot bypass it`,async()=>{const f=fixture(role),{g,a,put}=f,kotis=await cast(f,'Kotis, Sibsig Champion'),w=put('Timeless Witness','graveyard');for(let i=0;i<4;i++)put('Forest','graveyard');g.recalc();const offered=g.castableList(a).find(e=>e.card===w);assert.ok(offered?.alt.kotis);await cast(f,'Regrowth',w);assert.equal(w.zone,'hand');assert.equal(w.def,M.DEFS['Timeless Witness']);await cast(f,'Murder',kotis);await g.move(w,'graveyard');g.recalc();const before={...a.pool};assert.equal(await g.castSpell(a,w,{from:'graveyard',alt:offered.alt}),false);assert.equal(w.zone,'graveyard');assert.deepEqual({...a.pool},before);assert.equal(g.castableList(a).some(e=>e.card===w),false);});
 test(`${role}: active Kotis permission still pays exactly three cards and mana`,async()=>{const f=fixture(role),{g,a,put}=f;await cast(f,'Kotis, Sibsig Champion');const w=put('Timeless Witness','graveyard'),food=Array.from({length:4},()=>put('Forest','graveyard'));g.recalc();const offered=g.castableList(a).find(e=>e.card===w);assert.ok(offered?.alt.kotis);for(const k of Object.keys(a.pool))a.pool[k]=0;a.pool.G=2;a.pool.C=2;assert.equal(await g.castSpell(a,w,{from:'graveyard',alt:offered.alt}),true);assert.equal(food.filter(c=>c.zone==='exile').length,3);assert.equal(g.stack.at(-1).manaSpent,4);await settle(g);assert.equal(w.zone,'battlefield');assert.equal(w.def,M.DEFS['Timeless Witness']);assert.ok(!g.aiDecisionLog?.some(e=>e.fallback));});
}

async function paymentFixture(role,name='Timeless Witness',count=3){const f=fixture(role);f.kotis=await cast(f,'Kotis, Sibsig Champion');f.card=f.put(name,'graveyard');f.fodder=Array.from({length:count},()=>f.put('Forest','graveyard'));f.g.recalc();f.alt={flashback:true,...f.card.def.flashback};for(const key of Object.keys(f.a.pool))f.a.pool[key]=0;return f;}
for(const role of ['human','ai']) {
  test(`${role}: an unpayable Kotis cast preserves all graveyard cards and its turn use`,async()=>{const f=await paymentFixture(role);assert.equal(await f.g.castSpell(f.a,f.card,{from:'graveyard',alt:f.alt}),false);assert.ok(f.fodder.every(c=>c.zone==='graveyard'));assert.notEqual(f.kotis.meta._kotisCastTurn,f.g.turnNo);assert.equal(f.card.zone,'graveyard');});
  test(`${role}: a stale mana state after choosing Kotis fodder consumes no cost`,async()=>{const f=await paymentFixture(role);f.a.pool.G=2;f.a.pool.C=2;const decide=f.a.controller.decide;f.a.controller.decide=async(g,q)=>{const answer=await decide(g,q);if(q.prompt?.startsWith('Kotis:'))for(const key of Object.keys(f.a.pool))f.a.pool[key]=0;return answer;};assert.equal(await f.g.castSpell(f.a,f.card,{from:'graveyard',alt:f.alt}),false);assert.ok(f.fodder.every(c=>c.zone==='graveyard'));assert.notEqual(f.kotis.meta._kotisCastTurn,f.g.turnNo);assert.equal(f.card.zone,'graveyard');});
  test(`${role}: a graveyard card that leaves and returns during Kotis selection is stale`,async()=>{const f=await paymentFixture(role);f.a.pool.G=2;f.a.pool.C=2;const decide=f.a.controller.decide;f.a.controller.decide=async(g,q)=>{const answer=await decide(g,q);if(q.prompt?.startsWith('Kotis:')){await g.move(f.fodder[0],'exile');await g.move(f.fodder[0],'graveyard');}return answer;};assert.equal(await f.g.castSpell(f.a,f.card,{from:'graveyard',alt:f.alt}),false);assert.ok(f.fodder.every(c=>c.zone==='graveyard'));assert.notEqual(f.kotis.meta._kotisCastTurn,f.g.turnNo);assert.equal(f.a.pool.G,2);assert.equal(f.a.pool.C,2);});
  test(`${role}: Kotis reserves three cards before intrinsic Delve affordability and payment`,async()=>{const f=await paymentFixture(role,'Gurmag Angler');f.a.pool.B=1;assert.equal(f.g.castableList(f.a).some(e=>e.card===f.card),false,'three cards cannot pay both Kotis and Delve');assert.equal(await f.g.castSpell(f.a,f.card,{from:'graveyard',alt:f.alt}),false);assert.ok(f.fodder.every(c=>c.zone==='graveyard'));assert.notEqual(f.kotis.meta._kotisCastTurn,f.g.turnNo);for(let i=0;i<6;i++)f.fodder.push(f.put('Forest','graveyard'));f.g.recalc();const offer=f.g.castableList(f.a).find(e=>e.card===f.card);assert.ok(offer?.alt.kotis);assert.equal(await f.g.castSpell(f.a,f.card,{from:'graveyard',alt:offer.alt}),true);assert.equal(f.fodder.filter(c=>c.zone==='exile').length,9);assert.equal(f.g.stack.at(-1).manaSpent,1);await settle(f.g);assert.equal(f.card.zone,'battlefield');assert.ok(!f.g.aiDecisionLog?.some(e=>e.fallback));});
}
test('canceling manual mana selection preserves Kotis fodder and the once-per-turn permission',async()=>{const f=await paymentFixture('human'),lands=Array.from({length:4},()=>f.put('Forest','battlefield'));f.a.manualMana=true;f.g.recalc();const decide=f.a.controller.decide;f.a.controller.decide=async(g,q)=>q.type==='chooseManaSources'?null:decide(g,q);assert.equal(await f.g.castSpell(f.a,f.card,{from:'graveyard',alt:f.alt}),false);assert.ok(f.fodder.every(c=>c.zone==='graveyard'));assert.ok(lands.every(c=>!c.tapped));assert.notEqual(f.kotis.meta._kotisCastTurn,f.g.turnNo);assert.equal(f.card.zone,'graveyard');});

async function paidStackResponse(f, name, target) {
  const response = f.put(name, 'hand', f.b);
  for (const key of Object.keys(f.b.pool)) f.b.pool[key] = 0;
  if (name === 'Counterspell') f.b.pool.U = 2;
  else { f.b.pool.W = 1; f.b.pool.C = 1; }
  assert.equal(await f.g.castSpell(f.b, response), true, `${name}: actual paid response`);
  const object = f.g.stack.at(-1);
  assert.equal(object.card, response);
  assert.equal(object.targets[0], target);
  assert.equal(object.manaSpent, 2);
  const beforeHand = f.b.hand.length;
  await f.g.resolveTop();
  assert.equal(response.zone, 'graveyard');
  assert.equal(f.b.hand.length - beforeHand, name === 'Reprieve' ? 1 : 0);
}

for (const role of ['human', 'ai']) {
  for (const response of ['Counterspell', 'Reprieve']) {
    test(`${role}: a paid Kotis creature ${response === 'Counterspell' ? 'returns to the graveyard when countered' : 'returns to hand when Reprieve resolves'}`, async () => {
      const f = await paymentFixture(role);
      f.a.pool.G = 2; f.a.pool.C = 2;
      const offer = f.g.castableList(f.a).find(entry => entry.card === f.card);
      assert.ok(offer?.alt.kotis && offer.alt.flashback, 'actual temporary graveyard permission');
      assert.equal(await f.g.castSpell(f.a, f.card, {from: offer.from, alt: offer.alt}), true);
      const object = f.g.stack.find(entry => entry.card === f.card);
      assert.equal(object.manaSpent, 4);
      assert.ok(f.fodder.every(card => card.zone === 'exile'), 'all three extra cards were paid');
      assert.equal(f.kotis.meta._kotisCastTurn, f.g.turnNo);
      await paidStackResponse(f, response, object);
      assert.equal(f.card.zone, response === 'Counterspell' ? 'graveyard' : 'hand');
      assert.equal(f.card.def, M.DEFS['Timeless Witness']);
      assert.equal(object.castOpts.kotis, true, 'retain the actual permission used');
      assert.equal(!!object.castOpts.flashback, false, 'Kotis does not grant Flashback');
      assert.equal(!!f.card.castMeta?.alt?.flashback, false);
      for (let i = 0; i < 3; i++) f.put('Forest', 'graveyard');
      f.a.pool.G = 2; f.a.pool.C = 2; f.g.recalc();
      assert.equal(f.g.castableList(f.a).some(entry => entry.card === f.card && entry.alt?.kotis), false,
        'a counter or bounce does not refund the once-per-turn use');
      assert.ok(f.trace.some(query => query.prompt?.startsWith('Kotis:')));
      assert.ok(!f.g.aiDecisionLog?.some(entry => entry.fallback));
    });
  }

  for (const response of ['Counterspell', 'Reprieve', null]) {
    test(`${role}: actual Think Twice Flashback still exiles on ${response || 'normal resolution'}`, async () => {
      const f = fixture(role), card = f.put('Think Twice', 'graveyard');
      f.a.pool.U = 1; f.a.pool.C = 2;
      const offer = f.g.castableList(f.a).find(entry => entry.card === card && entry.alt?.flashback);
      assert.ok(offer);
      assert.equal(await f.g.castSpell(f.a, card, {from: offer.from, alt: offer.alt}), true);
      const object = f.g.stack.find(entry => entry.card === card);
      assert.equal(object.manaSpent, 3);
      assert.equal(object.castOpts.flashback, true);
      const beforeHand = f.a.hand.length;
      if (response) await paidStackResponse(f, response, object);
      else await settle(f.g);
      assert.equal(card.zone, 'exile', 'real Flashback replaces every tested Stack exit');
      assert.equal(f.a.hand.length - beforeHand, response ? 0 : 1);
      assert.equal(f.a.graveyard.includes(card), false);
      assert.ok(!f.g.aiDecisionLog?.some(entry => entry.fallback));
    });
  }
}
