import test from 'node:test';
import assert from 'node:assert/strict';
import {table,paidCast,paidAbility,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const becomesBattle of [true,false])test('second combat: paid Mirrorweave changes an attacker into '+(becomesBattle?'a live Battle creature':'an ordinary animated artifact'),async()=>{
  const f=table(),attacker=f.put('Colossal Dreadmaw','hand');
  const donor=f.put('Invasion of Dominaria // Serra Faithkeeper','hand');
  const model=becomesBattle?donor:f.put('Sol Ring','hand');
  const memnarch=f.put('Memnarch','hand'),grounds=f.put('Nesting Grounds','hand');
  const attackerAura=f.put('Ensoul Artifact','hand'),modelAura=f.put('Ensoul Artifact','hand');
  const response=f.put('Mirrorweave','hand',f.b);
  f.lands([...Array(24).fill('Island'),...Array(8).fill('Plains'),...Array(24).fill('Forest')]);
  f.lands([...Array(8).fill('Island'),...Array(8).fill('Plains')],f.b);
  let artifactTarget=attacker;
  f.targets=(p,q)=>{
    if(q.src===memnarch&&q.candidates.includes(artifactTarget))return [artifactTarget];
    if(q.src===attackerAura&&q.candidates.includes(attacker))return [attacker];
    if(q.src===modelAura&&q.candidates.includes(model))return [model];
    if(q.src===grounds)return [q.prompt.startsWith('From')?donor:attacker];
    if(q.src===response&&q.candidates.includes(model))return [model];
    return undefined;
  };
  await paidCast(f,f.a,attacker);await paidCast(f,f.a,donor);if(model!==donor)await paidCast(f,f.a,model);
  await paidCast(f,f.a,memnarch);
  await paidAbility(f,f.a,memnarch,a=>a.cost?.mana==='{1}{U}{U}');artifactTarget=model;
  await paidAbility(f,f.a,memnarch,a=>a.cost?.mana==='{1}{U}{U}');
  await paidCast(f,f.a,attackerAura);await paidCast(f,f.a,modelAura);
  assert.equal(await f.g.playLand(f.a,grounds),true,'play the real counter-transfer land after mana payments so its tap cost remains available');
  await paidAbility(f,f.a,grounds,a=>a.label==='Move a counter');
  assert.equal(attacker.counters.defense,1,'real Nesting Grounds moved a printed defense counter onto the future copy');
  assert.equal(donor.counters.defense,4);assert.equal(model.is('Creature'),true);
  let responded=false,afterResponse;
  f.attackers=(p,q)=>p===f.a&&q.eligible.includes(attacker)?[{card:attacker,target:f.b}]:[];
  f.priority=(p,q)=>{
    if(!responded&&p===f.b&&f.g.step==='attackers'&&f.g.combat?.attackers.includes(attacker)){
      const row=q.casts.find(row=>row.card===response);assert.ok(row);responded=true;
      return {kind:'cast',card:response,from:row.from,alt:row.alt};
    }
    if(responded&&p===f.a&&f.g.step==='attackers'&&!f.g.stack.length){
      afterResponse={battle:attacker.is('Battle'),creature:attacker.is('Creature'),zone:attacker.zone,
        attacking:!!attacker.attacking,inCombat:f.g.combat.attackers.includes(attacker),defense:attacker.counters.defense};
    }
    return {kind:'pass'};
  };
  await f.g.runTurn();assert.equal(responded,true);assert.ok(afterResponse);
  assert.equal(afterResponse.battle,becomesBattle);assert.equal(afterResponse.creature,true);
  assert.equal(afterResponse.zone,'battlefield');assert.equal(afterResponse.defense,1);
  assert.equal(afterResponse.attacking,!becomesBattle,'CR506.4 removes a creature from combat when it becomes a Battle');
  assert.equal(afterResponse.inCombat,!becomesBattle);
  assert.equal(f.b.life,becomesBattle?40:35,'a removed Battle creature deals no combat damage; ordinary animated copy still attacks');
  stable(f,'actual paid Mirrorweave intrinsic Battle combat removal');
});
