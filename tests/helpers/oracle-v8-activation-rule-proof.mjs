import assert from 'node:assert/strict';
import {stageCondition,stageCount,countValue} from './oracle-v5-proof.mjs';

export function stageActivationRuleCost(MTG,ctx,cost,source,h) {
  const adjustment=cost?.manaAdjustment;if(!adjustment)return;
  if(adjustment.condition)stageCondition(MTG,ctx,adjustment.condition,source,h);
  if(adjustment.count?.kind==='source-counters') {
    source.counters[adjustment.count.counter]=Math.max(2,source.counters[adjustment.count.counter]||0);ctx.game.recalc();
  } else if(adjustment.count)stageCount(MTG,ctx,adjustment.count,h);
}

// Capture immediately before activation, while a sacrificed source and every
// counted object still have their original characteristics and zone.
export function captureActivationRuleCost(MTG,ctx,cost,source,compiled) {
  if(cost?.oracleEquipPowerReduction){
    const byTarget=new Map(),printed=MTG.parseCost(cost.mana);
    for(const target of ctx.game.legalTargets(compiled.targets[0],source,ctx.a)){
      const payable=ctx.game.abilityManaCost(ctx.a,source,cost.mana,{ability:compiled,targets:[target]});
      assert.equal(payable.generic,Math.max(0,printed.generic-Math.max(0,target.power)),source.name+': actual target power determines Equip discount');
      byTarget.set(target,payable.generic+payable.pips.length);
    }
    return {pool:Object.values(ctx.a.pool).reduce((sum,n)=>sum+n,0),byTarget,source};
  }
  const adjustment=cost?.manaAdjustment;if(!adjustment)return null;
  const printed=MTG.parseCost(cost.mana),units=adjustment.count?countValue(ctx,source,adjustment.count):1;
  const raw=compiled.cost.mana(ctx.game,source);
  assert.equal(raw.generic,Math.max(0,printed.generic+adjustment.amount*units),source.name+': printed adjustment uses the actual count or satisfied condition');
  assert.deepEqual(raw.pips,printed.pips,source.name+': generic adjustment preserves printed colored symbols');
  const payable=ctx.game.abilityManaCost(ctx.a,source,raw,{ability:compiled});
  return {pool:Object.values(ctx.a.pool).reduce((sum,n)=>sum+n,0),payable:payable.generic+payable.pips.length};
}

export function assertActivationRuleCost(ctx,witness,label) {
  if(!witness)return;
  const spent=witness.pool-Object.values(ctx.a.pool).reduce((sum,n)=>sum+n,0);
  const payable=witness.byTarget?witness.byTarget.get(ctx.game.stack.find(so=>so.srcCard===witness.source&&so.kind==='ability')?.targets[0]):witness.payable;
  assert.notEqual(payable,undefined,label+': announced target has a measured payment');
  assert.equal(spent,payable,label+': actual floating mana payment matches adjusted ability cost');
}
