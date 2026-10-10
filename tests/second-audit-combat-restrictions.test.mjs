import test from 'node:test';
import assert from 'node:assert/strict';
import {table,paidCast,stable} from './helpers/second-audit-combat-fixtures.mjs';

async function nativeRaving(seed,blocked=false) {
  const f=table(seed),dead=f.put('Raving Dead','hand');
  const lands=f.lands(['Swamp',...Array(5).fill('Forest')]);
  const queue=[dead],chosen=[];
  if(blocked)for(const p of f.players.slice(1))f.put('Ornithopter','battlefield',p);
  f.main=(p,q)=>{
    if(p===f.a&&q.phase==='main1'&&dead.zone==='hand') {
      const row=q.casts.find(row=>row.card===dead);
      assert.ok(row);return {kind:'cast',card:dead,from:row.from,alt:row.alt};
    }
    return {kind:'done'};
  };
  f.attackers=(p,q)=>{
    if(p!==f.a)return [];
    assert.ok(q.eligible.includes(dead),'native next-turn readiness permits Raving Dead');
    const row=f.g.untilEffects.find(row=>row.kind==='mustAttackPlayerCard'&&row.iid===dead.iid);
    assert.ok(row,'normal beginning-combat trigger chose an opponent');
    assert.equal(f.g.canAttackTarget(dead,row.targetPlayer),true);
    assert.ok(q.forced.includes(dead));
    assert.deepEqual(Array.from(f.g.legalDeclarationAttackTargets(dead),p=>p.idx),[row.targetPlayer.idx]);
    chosen.push(row.targetPlayer);return [{card:dead,target:row.targetPlayer}];
  };
  if(blocked)f.blockers=(p,q)=>q.attackers.includes(dead)?[{blocker:q.potential[0],attacker:dead}]:[];
  await f.g.runTurn();
  assert.equal(chosen.length,0,'just-cast Raving Dead cannot attack this turn');
  for(let n=0;n<4;n++)await f.g.runTurn();
  assert.equal(chosen.length,1);
  assert.equal(f.casts.filter(d=>queue.includes(d.card)).length,1);
  assert.ok(lands.some(c=>c.tapped)===false,'native next untap refreshed printed mana sources');
  const target=chosen[0],damage=f.events.filter(r=>r.event==='combatDamageToPlayer'&&r.data.card===dead);
  assert.equal(target.life,blocked?40:19,'half-life loss follows actual unblocked damage only');
  assert.equal(damage.length,blocked?0:1);
  for(const other of f.players.slice(1).filter(p=>p!==target))assert.equal(other.life,40);
  stable(f,'Raving Dead actual turn combat');
  return target.idx;
}

test('second combat: paid Raving Dead native random opponent is deterministic and actual damage halves remaining life',async()=>{
  assert.equal(await nativeRaving(104812),await nativeRaving(104812));
});

test('second combat: blocked paid Raving Dead causes no half-life trigger',async()=>{
  await nativeRaving(104813,true);
});

for(const disabled of [false,true])test('second combat: paid Xantcha owner restriction and readiness'+(disabled?' after paid Lignify':''),async()=>{
  const f=table(),x=f.put('Xantcha, Sleeper Agent','hand'),walker=f.put('Saheeli, the Gifted','hand');
  const lignify=disabled?f.put('Lignify','hand'):null;
  f.lands([...Array(3).fill('Swamp'),...Array(3).fill('Mountain'),...Array(3).fill('Island'),...Array(8).fill('Forest')]);
  await paidCast(f,f.a,walker);
  f.option=(p,q)=>q.prompt?.includes('control Xantcha')?String(f.b.idx):undefined;
  f.targets=(p,q)=>lignify&&q.src===lignify&&q.candidates.includes(x)?[x]:undefined;
  let declared=false;
  f.main=(p,q)=>{
    if(p!==f.a||q.phase!=='main1')return {kind:'done'};
    const card=[x,lignify].filter(Boolean).find(c=>c.zone==='hand');
    if(!card)return {kind:'done'};
    const row=q.casts.find(row=>row.card===card);assert.ok(row);
    return {kind:'cast',card,from:row.from,alt:row.alt};
  };
  f.attackers=(p,q)=>{
    if(p!==f.b)return [];
    assert.ok(q.eligible.includes(x),'normal controller turn removes summoning sickness');
    assert.equal(x.ctrl.idx,f.b.idx);assert.equal(x.owner.idx,f.a.idx);
    assert.equal(f.g.canAttackTarget(x,f.a),disabled);
    assert.equal(f.g.canAttackTarget(x,walker),disabled);
    assert.equal(f.g.canAttackTarget(x,f.c),true);
    assert.equal(q.forced.includes(x),!disabled);
    declared=true;return [{card:x,target:disabled?f.a:f.c}];
  };
  await f.g.runTurn();
  assert.equal(x.sick,true);
  assert.equal(f.g.canAttackTarget(x,f.c),false,'fresh entry cannot attack before its controller turn');
  await f.g.runTurn();
  assert.equal(declared,true);
  const attack=f.events.find(r=>r.event==='attacks'&&r.data.card===x);
  assert.equal(attack.data.defender.idx,(disabled?f.a:f.c).idx);
  assert.equal(f.c.life,disabled?40:35);
  stable(f,'Xantcha paid next-turn declaration');
});

test('second combat: paid Xantcha may attack a Battle controlled by its owner and protected by another opponent',async()=>{
  const f=table(),x=f.put('Xantcha, Sleeper Agent','hand'),battle=f.put('Invasion of Dominaria // Serra Faithkeeper','hand');
  f.lands([...Array(3).fill('Swamp'),...Array(3).fill('Mountain'),...Array(3).fill('Plains'),...Array(8).fill('Forest')]);
  f.option=(p,q)=>q.prompt?.includes('control Xantcha')?String(f.b.idx):q.prompt?.includes('choose its protector')?String(f.c.idx):undefined;
  const queue=[battle,x];
  f.main=(p,q)=>{
    if(p!==f.a||q.phase!=='main1')return {kind:'done'};
    const card=queue.find(c=>c.zone==='hand');if(!card)return {kind:'done'};
    const row=q.casts.find(row=>row.card===card);assert.ok(row);
    return {kind:'cast',card,from:row.from,alt:row.alt};
  };
  let offered;
  f.attackers=(p,q)=>{
    if(p!==f.b)return [];
    assert.ok(q.eligible.includes(x));assert.equal(battle.ctrl.idx,f.a.idx);assert.equal(battle.protector.idx,f.c.idx);
    offered=f.g.legalDeclarationAttackTargets(x).includes(battle);
    return [{card:x,target:battle}];
  };
  await f.g.runTurn();await f.g.runTurn();
  assert.equal(offered,true,'printed Xantcha restriction does not prohibit attacking Battles');
  const attack=f.events.find(r=>r.event==='attacks'&&r.data.card===x);
  assert.equal(attack.data.defender.iid,battle.iid,'normal combat accepts the actual Battle destination');
  stable(f,'Xantcha actual Battle declaration');
});

test('second combat: Xantcha still cannot attack its owner planeswalker when paid enchantments also make it a creature',async()=>{
  const f=table(),x=f.put('Xantcha, Sleeper Agent','hand'),walker=f.put('Saheeli, the Gifted','hand');
  const evening=f.put('Enchanted Evening','hand'),opalescence=f.put('Opalescence','hand');
  f.lands([...Array(4).fill('Swamp'),...Array(4).fill('Mountain'),...Array(4).fill('Island'),...Array(5).fill('Plains'),...Array(8).fill('Forest')]);
  f.option=(p,q)=>q.prompt?.includes('control Xantcha')?String(f.b.idx):undefined;
  const queue=[walker,x,evening,opalescence];
  f.main=(p,q)=>{
    if(p!==f.a||q.phase!=='main1')return {kind:'done'};
    const card=queue.find(c=>c.zone==='hand');if(!card)return {kind:'done'};
    const row=q.casts.find(row=>row.card===card);assert.ok(row,'actual printed paid hybrid control: '+card.name);
    return {kind:'cast',card,from:row.from,alt:row.alt};
  };
  let declared=false;
  f.attackers=(p,q)=>{
    if(p!==f.b)return [];
    assert.ok(q.eligible.includes(x));
    assert.equal(walker.is('Planeswalker'),true);assert.equal(walker.is('Creature'),true);
    assert.equal(f.g.canAttackTarget(x,walker),false,'owner current planeswalker remains prohibited despite added creature type');
    assert.equal(f.g.canAttackTarget(x,f.a),false);
    assert.equal(f.g.canAttackTarget(x,f.c),true);
    declared=true;return [{card:x,target:f.c}];
  };
  await f.g.runTurn();await f.g.runTurn();
  assert.equal(declared,true);
  assert.equal(f.c.life,37,'Opalescence also sets enchanted Xantcha base power to its mana value of three');
  assert.equal(f.casts.filter(r=>queue.includes(r.card)).length,4);
  stable(f,'Xantcha owner animated planeswalker control');
});
