import test from 'node:test';
import assert from 'node:assert/strict';
import {table,paidCast,paidAbility,stable} from './helpers/second-audit-combat-fixtures.mjs';

for(const role of ['attack','block'])for(const battleBody of [true,false])test('second combat: paid animation '+(battleBody?'Battle':'Sol Ring')+' '+role+' declaration',async()=>{
  const f=table(),body=f.put(battleBody?'Invasion of Dominaria // Serra Faithkeeper':'Sol Ring','hand');
  const memnarch=f.put('Memnarch','hand'),march=f.put('March of the Machines','hand');
  const enemy=role==='block'?f.put('Grizzly Bears','hand',f.b):null;
  f.lands([...Array(8).fill('Plains'),...Array(8).fill('Island'),...Array(12).fill('Forest')]);
  f.lands(Array(8).fill('Forest'),f.b);
  if(enemy){f.g.turnPlayer=f.b;await paidCast(f,f.b,enemy);f.g.turnPlayer=f.a;}
  f.targets=(p,q)=>q.src===memnarch&&q.candidates.includes(body)?[body]:undefined;
  await paidCast(f,f.a,body);await paidCast(f,f.a,memnarch);
  await paidAbility(f,f.a,memnarch,ability=>ability.cost?.mana==='{1}{U}{U}');
  assert.equal(body.is('Artifact'),true,'real printed artifact-conversion ability resolved');
  await paidCast(f,f.a,march);assert.equal(body.is('Creature'),true,'printed permanent really became a creature before declaration');
  let declarationObserved=false;
  f.attackers=(p,q)=>{
    if(role==='block')return p===f.b&&q.eligible.includes(enemy)?[{card:enemy,target:f.a}]:[];
    if(p===f.a){
      declarationObserved=true;assert.equal(body.is('Creature'),true);
      assert.equal(body.is('Battle'),battleBody);
      assert.equal(q.eligible.includes(body),!battleBody,'CR506.3f-g excludes an actual Battle creature from the native attack offer');
      return battleBody?[]:[{card:body,target:f.b}];
    }
    return [];
  };
  f.blockers=(p,q)=>{
    if(role==='block'&&p===f.a&&q.attackers.includes(enemy)){
      declarationObserved=true;assert.equal(body.is('Creature'),true);
      assert.equal(body.is('Battle'),battleBody);
      assert.equal(q.potential.includes(body),!battleBody,'CR509.1a excludes an actual Battle creature from the native blocker offer');
      return battleBody?[]:[{blocker:body,attacker:enemy}];
    }
    return [];
  };
  await f.g.runTurn();if(role==='block')await f.g.runTurn();
  assert.equal(declarationObserved,true);
  if(role==='attack')assert.equal(f.b.life,battleBody?40:39,'ordinary animated artifact deals native combat damage');
  else{
    assert.equal(f.a.life,battleBody?42:40,'illegal Battle block cannot prevent the real attack');
    assert.equal(body.zone,battleBody?'battlefield':'graveyard');
  }
  stable(f,'native animated permanent '+role);
});
