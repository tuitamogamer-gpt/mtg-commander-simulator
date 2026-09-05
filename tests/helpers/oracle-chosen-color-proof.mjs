import assert from 'node:assert/strict';
import {context, put, settle} from './oracle-v8-fixtures.mjs';

export async function chosenColorProof(MTG, entry, operation, role) {
  const ctx=context(MTG,role),{game,a}=ctx;
  const choiceRule=entry.implementation.find(row=>row.kind==='chosen-color-entry-v8');
  assert.ok(choiceRule,entry.raw.name+': chosen-color reference is bound');
  const source=put(MTG,game,a,entry.raw.name,'hand');
  for(const color of ['W','U','B','R','G','C'])a.pool[color]=20;
  const decide=a.controller.decide.bind(a.controller);
  a.controller.decide=async(g,q)=>{
    if(q.prompt===source.name+': choose a color'){
      assert.equal(g.bf().includes(source),false,'entry choice precedes battlefield existence');
      assert.equal(g.manaSources(a).some(row=>row.card===source),false,'incoming object cannot pay during entry');
    }
    return decide(g,q);
  };
  if(source.is('Land'))assert.equal(await game.playLand(a,source),true);
  else assert.equal(await game.castSpell(a,source,{from:'hand'}),true);
  await settle(game);
  const chosen=source.meta.oracleChosenColor;
  assert.ok(choiceRule.colors.includes(chosen),'actual controller selected an allowed color');
  if(choiceRule.tapped||entry.implementation.some(row=>row.kind==='enters-tapped'))assert.equal(source.tapped,true);
  for(const row of entry.implementation.filter(row=>row.kind==='chosen-color-mana-v8')){
    game.untap(source);source.sick=false;
    for(const color of Object.keys(a.pool))a.pool[color]=0;a.poolMeta=[];
    const descriptor=game.manaSources(a).find(d=>d.card===source&&!!d.m.restrictAbilities===!!row.landAbilities&&d.produce.some(p=>p[chosen]===row.n));
    assert.ok(descriptor,'printed chosen-color mana ability is available');
    const allocation=descriptor.produce.find(p=>p[chosen]===row.n);
    assert.equal(await game.activateManaSource(a,descriptor,allocation,null,[]),true);
    assert.equal(a.pool[chosen],row.n);assert.equal(source.tapped,true);assert.equal(game.stack.length,0);
    const payment=MTG.parseCost(('{'+chosen+'}').repeat(row.n));
    if(row.landAbilities){
      const bear=put(MTG,game,a,'Grizzly Bears');
      assert.equal(game.canPayMana(a,payment,{card:bear}),false);
      assert.equal(game.canPayMana(a,payment,{card:bear,isAbility:true}),false);
      assert.equal(await game.payMana(a,payment,{card:source,isAbility:true}),true);
    }else assert.equal(await game.payMana(a,payment),true);
    assert.equal(a.pool[chosen],0);
  }
  return 1;
}
