import assert from 'node:assert/strict';

function candidates(MTG,ctx,filter,h) {
  return (filter.alternatives||[filter]).map((branch,index)=>{
    const spec={...branch,what:branch.what==='card'?'creature':branch.what,controller:'you',zone:'graveyard'};
    const card=h.stageGenericTarget(MTG,ctx,spec,'flash-'+index);
    card.def.cost='{10}';
    if(card.hasSub('Aura'))h.permanent(MTG,ctx.game,ctx.a,'Grizzly Bears');
    card.owner.graveyard.splice(card.owner.graveyard.indexOf(card),1);
    card.zone='hand';card.owner.hand.push(card);return card;
  });
}

export async function flashPermissionProof(MTG,entry,operation,role,h) {
  const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
  h.fund(a,100);h.fund(b,100);h.fillLibrary(MTG,a,30);h.fillLibrary(MTG,b,30);
  const own=candidates(MTG,ctx,operation.filter,h);
  const others=candidates(MTG,{...ctx,a:b,b:a},operation.filter,h);
  game.turnPlayer=b;game.phase='end';
  const base=new Map([...own,...others].map(card=>[card,game.canCastTiming(card.owner,card)]));
  const source=h.permanent(MTG,game,a,entry.raw.name);
  for(const card of own)assert.equal(game.canCastTiming(a,card),true,entry.raw.name+': matching own spell receives timing permission');
  for(const card of others)assert.equal(game.canCastTiming(b,card),operation.scope==='all'||base.get(card),entry.raw.name+': exact controller scope');
  const candidate=own[0],before=Object.values(a.pool).reduce((n,v)=>n+v,0);
  assert.ok(game.castableList(a).some(option=>option.card===candidate),entry.raw.name+': paid option is exposed to local AI and human');
  assert.equal(await game.castSpell(a,candidate,{from:'hand'}),true,entry.raw.name+': matching spell actually casts out of turn');
  assert.ok(Object.values(a.pool).reduce((n,v)=>n+v,0)<before,entry.raw.name+': timing permission keeps the mana cost');
  await h.resolveAll(game);
  const replacement=candidates(MTG,ctx,operation.filter,h)[0];
  await game.move(source,'exile');
  assert.equal(game.canCastTiming(a,replacement),base.get(candidate),entry.raw.name+': departure removes permission');
  return 5+own.length+others.length;
}

export function assertTemporaryFlash(MTG,ctx,effect,h,label) {
  const {game,a}=ctx;
  assert.ok((a.turnState.oracleFlashUntilTurn||[]).some(permission=>permission.turn===game.turnNo&&JSON.stringify(permission.filter)===JSON.stringify(effect.filter)),label+': resolved permission preserves its exact filter and turn');
  const phase=game.phase,active=game.turnPlayer;
  const cards=candidates(MTG,ctx,effect.filter,h);
  try {
    game.phase='end';game.turnPlayer=ctx.b;
    for(const card of cards)assert.equal(game.canCastTiming(a,card),true,label+': matching spell can be cast outside sorcery timing');
  } finally {
    game.phase=phase;game.turnPlayer=active;
    for(const card of cards)card.owner.hand.splice(card.owner.hand.indexOf(card),1);
  }
}
