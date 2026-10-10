import test from 'node:test';
import assert from 'node:assert/strict';
import {table,paidCast,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const mode of ['player','source exiled in response','planeswalker stolen in response'])test('second combat: native paid Marvo attack '+mode,async()=>{
  const f=table(),marvo=f.put('Marvo, Deep Operative','hand');
  f.lands([...Array(3).fill('Swamp'),...Array(3).fill('Island'),...Array(8).fill('Forest')]);
  for(let n=0;n<5;n++)f.put('Colossal Dreadmaw','library');
  const swords=mode.includes('exiled')?f.put('Swords to Plowshares','hand',f.b):null;
  const walker=mode.includes('planeswalker')?f.put('Jace Beleren','hand',f.b):null;
  const memnarch=walker?f.put('Memnarch','hand',f.c):null;
  if(swords)f.lands(['Plains'],f.b);
  if(walker){
    f.lands([...Array(3).fill('Island')],f.b);
    f.g.turnPlayer=f.b;await paidCast(f,f.b,walker);f.g.turnPlayer=f.a;
    f.lands([...Array(18).fill('Island'),...Array(12).fill('Forest')],f.c);
  }
  f.targets=(p,q)=>q.src===swords&&q.candidates.includes(marvo)?[marvo]:q.src===memnarch&&q.candidates.includes(walker)?[walker]:undefined;
  f.cards=(p,q)=>q.prompt?.startsWith('You may cast one')?q.from.filter(c=>c.name==='Colossal Dreadmaw').slice(0,1):undefined;
  let madeArtifact=false,responded=false;
  f.main=(p,q)=>{
    if(p===f.a&&q.phase==='main1'&&marvo.zone==='hand'){
      const row=q.casts.find(row=>row.card===marvo);assert.ok(row);
      return {kind:'cast',card:marvo,from:row.from,alt:row.alt};
    }
    if(memnarch&&p===f.c&&q.phase==='main1'){
      if(memnarch.zone==='hand'){
        const row=q.casts.find(row=>row.card===memnarch);assert.ok(row);
        return {kind:'cast',card:memnarch,from:row.from,alt:row.alt};
      }
      if(!madeArtifact){
        const entry=q.acts.find(row=>row.card===memnarch&&row.ability.cost?.mana==='{1}{U}{U}');
        assert.ok(entry,'actual Memnarch artifact-making ability');madeArtifact=true;
        return {kind:'activate',entry};
      }
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&q.eligible.includes(marvo)?[{card:marvo,target:walker||f.b}]:[];
  f.priority=(p,q)=>{
    if(responded||f.g.phase!=='combat'||f.g.step!=='attackers'||!f.g.stack.length||!f.events.some(r=>r.event==='attacks'&&r.data.card===marvo))return {kind:'pass'};
    if(swords&&p===f.b){
      const row=q.casts.find(row=>row.card===swords);assert.ok(row,'real paid removal response');responded=true;
      return {kind:'cast',card:swords,from:row.from,alt:row.alt};
    }
    if(memnarch&&p===f.c){
      assert.equal(walker.is('Artifact'),true);
      const entry=q.acts.find(row=>row.card===memnarch&&row.ability.cost?.mana==='{3}{U}');
      assert.ok(entry,'real paid Memnarch control response');responded=true;
      return {kind:'activate',entry};
    }
    return {kind:'pass'};
  };
  await f.g.runTurn();
  assert.equal(f.events.some(r=>r.event==='attacks'&&r.data.card===marvo),false,'just-cast Marvo has no native attack');
  for(let n=0;n<4;n++)await f.g.runTurn();
  const attacks=f.events.filter(r=>r.event==='attacks'&&r.data.card===marvo);
  assert.equal(attacks.length,1);
  assert.equal(attacks[0].data.player.idx,f.a.idx,'actual engine attack event supplies its controller');
  assert.equal(f.a.rogueAttackTurnV82,f.g.turnNo,'native Rogue attack history is acquired without partial synthetic events');
  const clash=f.events.find(r=>r.event==='clashed'&&r.data.player===f.a&&r.data.source===marvo);
  assert.ok(clash);assert.equal(clash.data.opponent.idx,f.b.idx,'trigger retains original defending player');
  assert.equal(clash.data.won,true);
  const free=f.casts.filter(r=>r.card.name==='Colossal Dreadmaw');
  if(swords){
    assert.equal(responded,true);assert.equal(marvo.zone,'exile');assert.equal(free.length,0,'departed Marvo does not trigger its separate clash-winning ability');
    assert.equal(f.a.life,41,'actual Swords response grants the exiled Marvo controller one life');
    assert.equal(f.b.life,40);
  }else{
    assert.equal(free.length,1);assert.ok(f.g.creatures(f.a).some(c=>c.name==='Colossal Dreadmaw'));
    if(walker){
      assert.equal(responded,true);assert.equal(madeArtifact,true);assert.equal(walker.ctrl.idx,f.c.idx);
      assert.equal(walker.counters.loyalty,3,'control change removes the attacked planeswalker from combat under CR 506.4');
    }else assert.equal(f.b.life,39);
  }
  stable(f,'native paid Marvo '+mode);
});
