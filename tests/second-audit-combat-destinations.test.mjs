import test from 'node:test';
import assert from 'node:assert/strict';
import {M,table,paidCast,stable} from './helpers/second-audit-combat-fixtures.mjs';

const cases=[
  {name:'ordinary planeswalker remains attacked',change:'none'},
  {name:'stolen planeswalker leaves an unblocked attacker attacking nothing',change:'control'},
  {name:'stolen planeswalker leaves the original defender able to block',change:'control',blocked:true},
  {name:'bounced planeswalker leaves a blockable attacker',change:'bounce',blocked:true},
  {name:'flickered planeswalker is a new object and takes no damage',change:'flicker'},
  {name:'flickered planeswalker leaves the original defender able to block',change:'flicker',blocked:true},
  {name:'destinationless unblocked attacker can pay printed hand ninjutsu',change:'control',ninjutsu:true},
  {name:'Thrasta tramples over a removed planeswalker to its former defender',change:'control',thrasta:true},
  {name:'blocked Thrasta tramples over a removed planeswalker after lethal blocker damage',change:'control',thrasta:true,blocked:true},
  {name:'ordinary Battle remains attacked',battle:true,change:'none'},
  {name:'stolen Battle changes controller and protector and takes no damage',battle:true,change:'control'},
  {name:'Battle protector loss removes the Battle from combat',battle:true,change:'protector loss'},
];

for(const scenario of cases)test('second combat: native paid '+scenario.name,async()=>{
  const f=table(),attacker=f.put(scenario.thrasta?"Thrasta, Tempest's Roar":'Colossal Dreadmaw','hand');
  const target=f.put(scenario.battle?'Invasion of Dominaria // Serra Faithkeeper':'Jace Beleren','hand',f.b);
  const blocker=scenario.blocked?f.put('Ornithopter','hand',f.b):null;
  const ninja=scenario.ninjutsu?f.put('Ninja of the Deep Hours','hand'):null;
  const artifactNeeded=['control','flicker'].includes(scenario.change);
  const memnarch=artifactNeeded?f.put('Memnarch','hand',f.c):null;
  const response=scenario.change==='bounce'?f.put('Into the Roil','hand',f.b):
    scenario.change==='flicker'?f.put('Ghostly Flicker','hand',f.b):
    scenario.change==='protector loss'?f.put('Ad Nauseam','hand',f.c):null;
  f.lands([...Array(5).fill('Island'),...Array(20).fill('Forest')]);
  const bLands=f.lands([...Array(5).fill('Island'),...Array(3).fill('Plains'),...Array(8).fill('Forest')],f.b);
  f.lands([...Array(18).fill('Island'),...Array(3).fill('Swamp'),...Array(12).fill('Forest')],f.c);
  if(scenario.change==='protector loss')for(let n=0;n<8;n++)f.put('Colossal Dreadmaw','library',f.c);
  f.option=(p,q)=>q.prompt?.includes('choose its protector')?
    String(q.options.some(row=>row.key===String(f.c.idx))&&!f.c.lost?f.c.idx:f.d.idx):undefined;
  f.targets=(p,q)=>{
    if(q.src===memnarch&&q.candidates.includes(target))return [target];
    if(q.src===response&&q.candidates.includes(target))return scenario.change==='flicker'?
      [target,bLands.find(c=>q.candidates.includes(c))].filter(Boolean).slice(0,q.max):[target];
    return undefined;
  };
  f.g.turnPlayer=f.b;await paidCast(f,f.b,target);if(blocker)await paidCast(f,f.b,blocker);f.g.turnPlayer=f.a;
  const targetVersion=target.zoneVersion,initialDefense=target.counters.defense||target.counters.loyalty;
  assert.equal(initialDefense,scenario.battle?5:3);
  if(scenario.battle)assert.equal(target.protector.idx,f.c.idx);
  let madeArtifact=false,responded=false,ninjutsuPaid=false,blockedByOriginal=false,combatStatus;
  f.main=(p,q)=>{
    if(p===f.a&&q.phase==='main1'&&attacker.zone==='hand'&&f.a.turnsStarted===1){
      const row=q.casts.find(row=>row.card===attacker);assert.ok(row);
      return {kind:'cast',card:attacker,from:row.from,alt:row.alt};
    }
    if(memnarch&&p===f.c&&q.phase==='main1'){
      if(memnarch.zone==='hand'){
        const row=q.casts.find(row=>row.card===memnarch);assert.ok(row);
        return {kind:'cast',card:memnarch,from:row.from,alt:row.alt};
      }
      if(!madeArtifact){
        const entry=q.acts.find(row=>row.card===memnarch&&row.ability.cost?.mana==='{1}{U}{U}');
        assert.ok(entry);madeArtifact=true;return {kind:'activate',entry};
      }
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>p===f.a&&f.a.turnsStarted===2&&q.eligible.includes(attacker)?[{card:attacker,target}]:[];
  f.blockers=(p,q)=>{
    if(blocker&&p===f.b&&q.attackers.includes(attacker)&&q.potential.includes(blocker)){
      blockedByOriginal=true;return [{blocker,attacker}];
    }
    return [];
  };
  f.cards=(p,q)=>ninja&&q.prompt?.includes('Ninjutsu: return')&&q.from.includes(attacker)?[attacker]:undefined;
  f.priority=(p,q)=>{
    if(!f.g.combat?.attackers.includes(attacker))return {kind:'pass'};
    if(!responded&&f.g.step==='attackers'&&scenario.change!=='none'){
      if(memnarch&&scenario.change==='control'&&p===f.c){
        const entry=q.acts.find(row=>row.card===memnarch&&row.ability.cost?.mana==='{3}{U}');
        assert.ok(entry,'actual paid artifact control response');responded=true;return {kind:'activate',entry};
      }
      if(response&&p===(scenario.change==='protector loss'?f.c:f.b)){
        const row=q.casts.find(row=>row.card===response);assert.ok(row,'actual paid destination removal response');
        responded=true;return {kind:'cast',card:response,from:row.from,alt:row.alt};
      }
    }
    if(f.g.step==='blockers'&&p===f.a){
      combatStatus={attacking:!!attacker.attacking,retained:f.g.combat.attackers.includes(attacker),defender:M.defendingPlayerV92(attacker.attacking)?.idx};
      if(ninja&&!ninjutsuPaid){
        const entry=q.acts.find(row=>row.card===ninja&&row.ninjutsu);
        assert.ok(entry,'actual hand ninjutsu remains offered for an unblocked destinationless attacker');
        ninjutsuPaid=true;return {kind:'activate',entry};
      }
    }
    return {kind:'pass'};
  };
  await f.g.runTurn();for(let n=0;n<4;n++)await f.g.runTurn();
  assert.ok(combatStatus,'native post-blockers priority ran');
  assert.equal(combatStatus.attacking,true);assert.equal(combatStatus.retained,true,'removing an attacked permanent keeps its attacker in combat');
  assert.equal(combatStatus.defender,(scenario.battle?f.c:f.b).idx,'the original defending seat owns the blocking declaration');
  if(scenario.change!=='none')assert.equal(responded,true);
  if(blocker){assert.equal(blockedByOriginal,true,'original defender can actually declare a blocker');assert.equal(blocker.zone,'graveyard','simultaneous native damage still kills the blocking creature');}
  if(scenario.change==='none'){
    if(scenario.battle){
      assert.equal(target.counters.defense||0,0,'ordinary Battle combat damage removes its defense counters');
      assert.ok(f.events.some(r=>r.event==='dealtDamage'&&r.data.combat&&r.data.src===attacker&&r.data.target===target));
      assert.equal(target.zone,'exile','the native controller declines the optional back-face cast after its real defeat trigger');
    }else assert.equal(target.zone,'graveyard','ordinary damage still reaches its actual destination');
  }
  else if(scenario.change==='bounce')assert.equal(target.zone,'hand');
  else{
    assert.equal(target.zone,'battlefield');
    assert.equal(target.counters[scenario.battle?'defense':'loyalty'],initialDefense,'removed destination receives no damage, including a returned new incarnation');
    if(scenario.change==='flicker')assert.equal(target.zoneVersion,targetVersion+2);
  }
  if(ninja){assert.equal(ninjutsuPaid,true);assert.equal(attacker.zone,'hand');assert.equal(ninja.zone,'battlefield');}
  if(scenario.change==='protector loss'){
    assert.equal(f.c.lost,true,'real paid Ad Nauseam eliminates the original protector');assert.equal(target.protector.idx,f.d.idx);
  }
  if(scenario.thrasta){
    assert.equal(f.b.life,40-(scenario.blocked?5:7),'CR702.19e allows Thrasta overflow to the original defending player');
    assert.equal(f.c.life,40,'control response does not redirect overflow to the new controller');
  }else if(!scenario.battle){assert.equal(f.b.life,40);assert.equal(f.c.life,40);}
  stable(f,'native destination '+scenario.name);
});
