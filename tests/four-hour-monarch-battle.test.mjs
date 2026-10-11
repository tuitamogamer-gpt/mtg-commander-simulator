import test from 'node:test';
import assert from 'node:assert/strict';
import {table, paidCast, stable} from './helpers/second-audit-combat-fixtures.mjs';

test('paid simultaneous lethal damage clears the monarch when every player leaves',async()=>{
  const f=table();f.lands(['Plains','Plains','Plains','Plains']);
  await paidCast(f,f.a,f.put('Palace Sentinels','hand'));
  assert.equal(f.g.monarch===f.a,true);
  for(const p of f.players)p.life=4;
  f.lands(['Mountain','Mountain']);
  await paidCast(f,f.a,f.put('Flame Rift','hand'));
  assert.equal(f.players.every(p=>p.lost),true);assert.equal(f.g.gameOver,true);
  assert.equal(f.g.monarch,null);assert.equal(f.g.monarchSince,null);
  stable(f,'simultaneous loss clears the crown');
});

test('Jared Carthalion still prevents its controller from taking the crown that turn',async()=>{
  const f=table();f.lands(['Forest','Mountain','Plains']);
  f.targets=(_p,q)=>q.candidates.includes(f.b)?[f.b]:undefined;
  await paidCast(f,f.a,f.put('Jared Carthalion, True Heir','hand'));
  assert.equal(f.g.monarch===f.b,true);assert.equal(f.a.turnState.v90CantBecomeMonarch,true);
  f.lands(['Plains','Plains','Plains','Plains']);
  await paidCast(f,f.a,f.put('Palace Sentinels','hand'));
  assert.equal(f.g.monarch===f.b,true,'a real monarchy trigger respects the prohibition');
  stable(f,'non-null monarch prohibition');
});

for(const protecting of [false,true])test(`paid Etched Host ${protecting?'adds':'removes'} defense on a real Siege ${protecting?'you protect':'an opponent protects'}`,async()=>{
  const f=table(),controller=protecting?f.b:f.a;
  f.g.turnPlayer=controller;f.lands(['Plains','Plains','Plains'],controller);
  const battle=await paidCast(f,controller,f.put('Invasion of Belenon // Belenon War Anthem','hand',controller));
  assert.equal(battle.protector=== (protecting?f.a:f.b),true);
  assert.equal(battle.counters.defense,5);
  f.g.turnPlayer=f.a;f.lands(['Swamp','Swamp','Swamp','Swamp','Swamp']);
  f.option=(_p,q)=>q.aiHint?.kind==='mode'?'1':q.options[0]?.key;
  f.targets=(_p,q)=>q.candidates.includes(battle)?[battle]:undefined;
  await paidCast(f,f.a,f.put('Etched Host Doombringer','hand'));
  assert.equal(battle.counters.defense,protecting?8:2);
  assert.equal(battle.zone,'battlefield');stable(f,'native Siege defense choice');
});
