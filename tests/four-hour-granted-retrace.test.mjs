import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,card,settle} from './helpers/c21-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

async function historianTable(role) {
  const f=setup(role);
  for(let i=0;i<4;i++)card(f,'Forest');
  const historian=card(f,'Deeproot Historian','hand');
  assert.equal(await f.game.castSpell(f.a,historian,{from:'hand'}),true);
  await settle(f.game);assert.equal(historian.castMeta.manaSpent,4);
  const spell=card(f,'Llanowar Elves','graveyard'),land=card(f,'Forest','hand'),manaLand=card(f,'Forest');
  const route=f.game.castableList(f.a).find(row=>row.card===spell&&row.alt?.wlmKind==='retrace');
  assert.ok(route);
  return Object.assign(f,{historian,spell,land,manaLand,route});
}

for(const role of ['human','ai']) {
  test(`${role}: paid Deeproot Historian grants retrace with exact native mana and land payment`,async()=>{
    const f=await historianTable(role);let selections=0;
    f.decide=(_p,q)=>{if(q.type==='chooseCards'&&q.from.includes(f.land)){selections++;return [f.land];}};
    assert.equal(await f.game.castSpell(f.a,f.spell,{from:'graveyard',alt:f.route.alt}),true);
    await settle(f.game);
    assert.equal(selections,1);assert.equal(f.spell.castMeta.manaSpent,1);
    assert.equal(f.manaLand.tapped,true);assert.equal(f.land.zone,'graveyard');
    assert.equal(f.a.hand.length,0);assert.equal(f.spell.zone,'battlefield');
    assertGameStateInvariants(f.game);
  });

  test(`${role}: granted retrace rejects forged, stale and unpaid routes before consuming costs`,async()=>{
    for(const invalid of ['forged-source','source-gone','land-absent','source-leaves-during-payment']) {
      const f=await historianTable(role);let selections=0;
      const alt={...f.route.alt};
      if(invalid==='forged-source')alt.wlmSource=f.manaLand.iid;
      if(invalid==='source-gone')await f.game.move(f.historian,'graveyard');
      if(invalid==='land-absent')await f.game.move(f.land,'exile');
      f.decide=async(_p,q)=>{
        if(q.type==='chooseCards'&&q.from.includes(f.land)) {
          selections++;
          if(invalid==='source-leaves-during-payment')await f.game.move(f.historian,'graveyard');
          return [f.land];
        }
      };
      assert.equal(await f.game.castSpell(f.a,f.spell,{from:'graveyard',alt}),false,invalid);
      assert.equal(selections,invalid==='source-leaves-during-payment'?1:0,invalid);
      assert.equal(f.spell.zone,'graveyard',invalid);assert.equal(f.manaLand.tapped,false,invalid);
      assert.equal(f.land.zone,invalid==='land-absent'?'exile':'hand',invalid);
      assertGameStateInvariants(f.game);
    }
  });

  test(`${role}: printed retrace still pays mana and discards its land without a granting source`,async()=>{
    const f=setup(role),spell=card(f,'Flame Jab','graveyard'),land=card(f,'Forest','hand'),mountain=card(f,'Mountain');
    const route=f.game.castableList(f.a).find(row=>row.card===spell&&row.alt?.retrace);assert.ok(route);
    f.decide=(_p,q)=>q.type==='chooseCards'&&q.from.includes(land)?[land]:undefined;
    const life=f.b.life;
    assert.equal(await f.game.castSpell(f.a,spell,{from:'graveyard',alt:route.alt,quickTargets:[f.b]}),true);
    await settle(f.game);
    assert.equal(spell.castMeta.manaSpent,1);assert.equal(mountain.tapped,true);
    assert.equal(land.zone,'graveyard');assert.equal(spell.zone,'graveyard');assert.equal(f.b.life,life-1);
    assertGameStateInvariants(f.game);
  });
}
