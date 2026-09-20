import assert from 'node:assert/strict';

export async function bargainProofV10(M,entry,role,h){
  let checks=0;
  for(const bargain of [false,true]){
    const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
    h.fund(a,100);h.fillLibrary(M,a,40);h.fillLibrary(M,b,40);
    const donor=h.permanent(M,game,a,'Ornithopter'),source=h.zoneCard(M,a,entry.raw.name,'hand');
    for(const op of entry.implementation){
      if(op.kind==='spell-v4')for(const [i,target]of op.targets.entries())await h.stageSpellV4Target(M,ctx,source,target,op.effects.find(effect=>effect.targetIds.includes(target.id)),h.spellV4TargetVariants(target)[0],i);
      else for(const [i,target]of (op.targets||[]).entries())target.zone==='stack'?await h.stageGenericStackTarget(M,ctx,target,i):h.stageGenericTarget(M,ctx,target,i,op.effects?.find(effect=>effect.target===i));
      if(op.kind==='spell-counter')await h.stageGenericStackTarget(M,ctx,{what:'spell',zone:'stack'},'bargain-counter');
    }
    const alt=bargain?{oracleBargainV10:true}:{};
    const expected=game.spellCost(a,source,alt),before=game.bf().slice();
    assert.equal(await game.castSpell(a,source,{from:'hand',alt}),true,entry.raw.name+': actual '+(bargain?'bargained':'ordinary')+' cast');
    const object=game.stack.find(row=>row.card===source);assert.ok(object);
    assert.equal(object.manaSpent,expected.generic+expected.pips.length,entry.raw.name+': chosen total mana cost paid');
    assert.equal(!!object.castOpts.oracleBargainV10,bargain);
    assert.equal(object.kicked,false,entry.raw.name+': bargain does not count as kicker');
    const paid=object.oracleV4AdditionalCost?.sacrifices||[];assert.equal(paid.length,bargain?1:0);
    for(const row of paid){assert.ok(before.some(card=>card.iid===row.iid));assert.ok(row.snapshot.isToken||row.snapshot.types.includes('Artifact')||row.snapshot.types.includes('Enchantment'));assert.equal(game.bf().some(card=>card.iid===row.iid),false);}
    if(!bargain)assert.equal(donor.zone,'battlefield');
    await h.resolveAll(game);checks+=6;
  }
  return checks;
}
