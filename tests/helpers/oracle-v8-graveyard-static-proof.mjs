import assert from 'node:assert/strict';
import {stageCondition} from './oracle-v5-proof.mjs';

export async function graveyardStaticProof(MTG,entry,operation,role,h){
  const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx,label=entry.raw.name+'/'+role;
  h.assertControllerRole(MTG,ctx,label);
  const source=h.permanent(MTG,game,a,entry.raw.name),child=operation.operation;
  const filter=child.filters?.[0]||{what:'creature',zone:'battlefield',controller:'you',min:1};
  const own=h.stageGenericTarget(MTG,ctx,{...filter,controller:'you'},'graveyard-grant-own');
  const foreign=h.stageGenericTarget(MTG,ctx,{...filter,controller:'opponent'},'graveyard-grant-opponent');
  stageCondition(MTG,ctx,operation.condition,source,h);game.recalc();
  for(const keyword of child.keywords||[])assert.equal(own.kw(keyword),false,label+': source on battlefield does not grant the graveyard ability');
  await game.move(source,'graveyard');
  for(const keyword of child.keywords||[]){assert.equal(own.kw(keyword),true,label+': owner recipient gains the graveyard keyword');assert.equal(foreign.kw(keyword),false,label+': opponent does not receive the graveyard grant');}
  if(child.grantedOperation){
    assert.equal(child.grantedOperation.kind,'mana-source');assert.ok(own.cur.extraMana.length,label+': land has the printed additional mana ability');
    assert.equal(await game.payMana(a,MTG.parseCost('{G}'),{isAbility:true}),true,label+': actual mana payment uses the graveyard-granted option');assert.equal(own.tapped,true);
  }
  await game.move(source,'exile');
  for(const keyword of child.keywords||[])assert.equal(own.kw(keyword),false,label+': exile ends the grant');
  if(child.grantedOperation)assert.equal(own.cur.extraMana.length,0,label+': exile removes granted mana ability');
  await game.move(source,'graveyard');
  for(const keyword of child.keywords||[])assert.equal(own.kw(keyword),true,label+': returning to graveyard restores grant');
  return 8;
}
