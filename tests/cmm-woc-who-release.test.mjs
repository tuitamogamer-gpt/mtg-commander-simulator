import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,settle} from './helpers/c21-fixtures.mjs';

for (const role of ['human','ai']) for (const [name,total] of [['Jace, Mirror Mage',5],['Myriad Construct',7]]) {
  test(`${role}: ${name} pays its printed kicker and shows its cost`,async()=>{
    const f=setup(role),prompts=[];
    f.decide=(_,q)=>{if(q.type==='chooseOption'&&q.aiHint?.kind==='kicker'){prompts.push(q.prompt);return 'yes';}};
    card(f,'Command Tower','battlefield',f.b);
    const c=await play(f,name);
    assert.equal(c.castMeta.kicked,true);
    assert.equal(c.castMeta.manaSpent,total);
    assert.equal(prompts.length,1);
    assert.match(prompts[0],name.startsWith('Jace')?/Kicker \{2\}/:/Kicker \{3\}/);
    assert.doesNotMatch(prompts[0],/undefined|NaN/);
    if(name==='Myriad Construct')assert.equal(c.counters['+1/+1'],1);
    else {const copy=f.game.bf().find(x=>x!==c&&x.isToken&&x.name===name);assert.ok(copy);assert.equal(copy.counters.loyalty,1);assert.ok(!copy.cur.super.includes('Legendary'));}
  });
}

test('Myriad Construct does not offer an unaffordable kicker',async()=>{
  const f=setup(),c=card(f,'Myriad Construct','hand'),prompts=[];
  for(const color of Object.keys(f.a.pool))f.a.pool[color]=0;f.a.pool.C=4;
  f.decide=(_,q)=>{if(q.type==='chooseOption'&&q.aiHint?.kind==='kicker'){prompts.push(q.prompt);return 'yes';}};
  assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),true);await settle(f.game);
  assert.deepEqual(prompts,[]);assert.equal(c.castMeta.kicked,false);assert.equal(c.castMeta.manaSpent,4);
});

test('Rooftop Storm examines an ordinary front face without requesting a missing face view',()=>{
  const f=setup();
  const entries=M.DECKS['From Cute to Brute'].cards.map(entry=>card(f,entry.name,'hand')).filter(c=>c.oracleFaces&&c.is('Creature'));
  assert.ok(entries.length>0);
  assert.doesNotThrow(()=>f.game.castableList(f.a));
  card(f,'Rooftop Storm');
  for(const c of entries)assert.doesNotThrow(()=>M.AFC.rooftopLive(f.game,f.a,c,{}));
  const zombieDef=Object.values(M.DEFS).find(def=>def.types.includes('Creature')&&def.subtypes.includes('Zombie')&&!def.oracleFaces);
  assert.ok(zombieDef);const zombie=card(f,zombieDef.name,'hand');assert.equal(M.AFC.rooftopLive(f.game,f.a,zombie,{}),true);
});

test('The Black Gate explains its choice of a player with the most life',async()=>{
  const f=setup(),gate=card(f,'The Black Gate'),prompts=[];body(f);
  f.decide=(_,q)=>{if(q.type==='chooseOption'){prompts.push(q.prompt);return q.options[0]?.key;}};
  await activate(f,gate);
  assert.ok(prompts.some(prompt=>/Choose a player with the most life/.test(prompt)));
  assert.ok(prompts.every(prompt=>!(/undefined|NaN/.test(prompt))));
});
