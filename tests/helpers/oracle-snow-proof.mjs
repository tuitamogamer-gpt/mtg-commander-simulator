import assert from 'node:assert/strict';
export async function fundSnow(M,game,player,entry){
  if(!JSON.stringify(entry).includes('{S}'))return;
  const source=new M.CardInst(M.DEFS['Snow-Covered Forest'],player);
  source.zone='battlefield';source.sick=false;game.battlefield.push(source);game.recalc();
  for(let n=0;n<12;n++){
    game.untap(source);const mana=game.manaSources(player).find(row=>row.card===source);
    assert.ok(mana);assert.equal(await game.activateManaSource(player,mana,{G:1}),true);
  }
  // Floating mana keeps its source properties after that source leaves.
  await game.move(source,'exile');
  assert.ok(player.poolMeta.some(row=>row.c13Snow&&row.source===source));
}
