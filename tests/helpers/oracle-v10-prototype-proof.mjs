import assert from 'node:assert/strict';

export async function prototypeProofV10(M,entry,operation,role,h){
  let checks=0;
  for(const prototyped of [false,true]){
    const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
    h.fund(a,100);h.fillLibrary(M,a,40);h.fillLibrary(M,b,40);
    const source=h.zoneCard(M,a,entry.raw.name,'hand'),printed=source.def;
    const option=prototyped?game.castableList(a).find(row=>row.card===source&&row.alt?.oraclePrototypeV10)?.alt:null;
    if(prototyped)assert.ok(option,entry.raw.name+': prototype is offered');
    const cost=game.spellCost(a,source,option||{}),expected=cost.generic+cost.pips.length;
    assert.equal(await game.castSpell(a,source,{from:'hand',...(option?{alt:option}:{})}),true);
    const object=game.stack.find(row=>row.card===source);assert.ok(object);
    assert.equal(object.manaSpent,expected,entry.raw.name+': selected characteristics determine actual mana payment');
    const characteristics=prototyped?operation:printed;
    assert.equal(source.def.cost,characteristics.cost);assert.equal(game.stackSpellManaValue(object),M.mv(characteristics.cost));
    assert.equal(source.def.power,characteristics.power);assert.equal(source.def.toughness,characteristics.toughness);
    assert.deepEqual(Array.from(source.colors),prototyped?['W','U','B','R','G'].filter(color=>operation.cost.includes('{'+color+'}')):[]);
    await h.resolveAll(game);assert.equal(source.zone,'battlefield');assert.equal(source.def.cost,characteristics.cost);
    assert.equal(source.power,Number(characteristics.power));assert.equal(source.toughness,Number(characteristics.toughness));
    await game.move(source,'exile');assert.equal(source.def.cost,printed.cost);assert.equal(source.mv,M.mv(printed.cost));assert.equal(source.colors.length,0);
    await game.putPermanentOntoBattlefield(source,a);await h.resolveAll(game);assert.equal(source.def.cost,printed.cost);assert.equal(source.power,Number(printed.power));
    checks+=10;
  }
  return checks;
}
