import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put} from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine();
const create=(f,name,extra={},zone='battlefield')=>{
  const c=new M.CardInst({name,cost:'{0}',super:[],types:['Artifact'],subtypes:[],oracle:'',kws:[],...extra},f.a);
  c.zone=zone;c.sick=false;if(zone==='battlefield')f.game.battlefield.push(c);else f.a[zone].push(c);f.game.recalc();return c;
};
const spell=(f,cost)=>create(f,'Snow payment witness',{cost,types:['Instant'],resolve:async()=>{}},'hand');
async function produce(f,c){const s=f.game.manaSources(f.a).find(s=>s.card===c);assert.ok(s);assert.equal(await f.game.activateManaSource(f.a,s,s.produce[0]),true);}
for(const role of ['human','ai']){
  test(role+': ordinary mana cannot pay snow, and snow can pay colored, generic and snow symbols',async()=>{
    const f=context(M,role),s=spell(f,'{S}{U}');f.a.pool.U=1;f.a.pool.G=1;
    assert.deepEqual(Array.from(M.parseCost('{S}').pips[0]),['S']);
    assert.equal(f.game.canPayMana(f.a,M.parseCost(s.def.cost),{card:s}),false);
    assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),false);
    const snow=put(M,f.game,f.a,'Snow-Covered Forest');await produce(f,snow);await f.game.move(snow,'exile');
    assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),true);assert.equal(f.a.pool.G,1);assert.equal(f.a.pool.U,0);
    assert.equal(f.a.poolMeta.length,0);assert.equal(f.game.stack.find(row=>row.card===s).snowSpent,1);
    const g=context(M,role),source=create(g,'Snow colorless source',{super:['Snow'],mana:{cost:{tap:true},produce:[{C:2}]}});
    await produce(g,source);assert.equal(await g.game.payMana(g.a,M.parseCost('{S}{1}'),{card:spell(g,'{S}{1}')},{isSpell:true}),true);assert.equal(g.a.pool.C,0);
  });
  test(role+': snow allocation backtracks across colors without spending on a failed payment',async()=>{
    const f=context(M,role);await produce(f,put(M,f.game,f.a,'Snow-Covered Island'));await produce(f,put(M,f.game,f.a,'Snow-Covered Forest'));
    const wrong=M.parseCost('{S}{S}{U}');assert.equal(f.game.deductPool(f.a,wrong,{card:spell(f,'{S}{S}{U}')}),false);
    assert.equal(f.a.pool.U,1);assert.equal(f.a.pool.G,1);
    assert.equal(f.game.deductPool(f.a,M.parseCost('{S}{U}'),{card:spell(f,'{S}{U}')}),true);assert.equal(f.a.pool.U,0);assert.equal(f.a.pool.G,0);
  });
  test(role+': snow restrictions apply, including when the mana pays an ability',async()=>{
    const f=context(M,role),source=create(f,'Restricted snow',{super:['Snow'],mana:{cost:{tap:true},produce:[{G:2}],restrict:(g,payment)=>payment.card?.is('Creature')}});
    await produce(f,source);const card=spell(f,'{S}');
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{S}'),{card}),false);card.def.types=['Creature'];card.def.power='2';card.def.toughness='2';f.game.recalc();
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{S}'),{card}),true);
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{S}'),{card,isAbility:true}),false);
  });
  test(role+': a converter pays its snow activation and its output depends on the converter source',async()=>{
    for(const snowy of [false,true]){
      const f=context(M,role);put(M,f.game,f.a,'Snow-Covered Forest');
      const converter=create(f,'Snow converter',{super:snowy?['Snow']:[],mana:{cost:{tap:true,mana:'{S}'},produce:[{U:2}]}});
      const s=spell(f,snowy?'{S}{U}':'{U}{U}');assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),true);assert.equal(converter.tapped,true);assert.equal(f.a.pool.U,0);
      assert.equal(f.game.stack.find(row=>row.card===s).snowSpent,snowy?2:0);
    }
    const f=context(M,role);const forest=put(M,f.game,f.a,'Snow-Covered Forest');await produce(f,forest);
    const converter=create(f,'Non-snow converter',{mana:{cost:{tap:true,mana:'{S}'},produce:[{U:2}]}});
    assert.equal(await f.game.payMana(f.a,M.parseCost('{U}'),{card:spell(f,'{U}')},{isSpell:true}),true);
    assert.equal(converter.tapped,true);assert.equal(f.a.pool.U,1);
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{S}'),{card:spell(f,'{S}')}),false);
  });
  test(role+': additional mana takes snow from the bonus source, separately from the land',async()=>{
    for(const snowLand of [false,true])for(const snowBonus of [false,true]){
      const f=context(M,role);put(M,f.game,f.a,snowLand?'Snow-Covered Forest':'Forest');
      create(f,'Bonus source',{types:['Enchantment'],super:snowBonus?['Snow']:[],c1719LandMana:{fixed:{U:1}}});
      const snowCount=Number(snowLand)+Number(snowBonus),s=spell(f,snowCount?'{S}'.repeat(snowCount)+(snowCount===1?'{1}':''):'{2}');
      assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),true);assert.equal(f.game.stack.find(row=>row.card===s).snowSpent,snowCount);
    }
  });
  test(role+': convoking with a snow creature does not produce snow mana',()=>{
    const f=context(M,role);create(f,'Snow convoker',{super:['Snow'],types:['Creature'],power:'2',toughness:'2',colorsOverride:['G']});
    const s=spell(f,'{S}');s.def.convoke=true;
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{S}'),{card:s}),false);
  });
}
