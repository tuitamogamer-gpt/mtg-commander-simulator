import assert from 'node:assert/strict';
import {stageCondition} from './oracle-v5-proof.mjs';

export async function layeredStaticProof(MTG,entry,operation,role,h){
  const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx,label=entry.raw.name+'/'+role;
  h.assertControllerRole(MTG,ctx,label);
  const source=h.permanent(MTG,game,a,entry.raw.name),child=operation.operation;
  const target=operation.own?source:h.stageGenericTarget(MTG,ctx,operation.attached?{what:'creature',zone:'battlefield',controller:'you',min:1}:operation.filters[0],'layered-recipient');
  if(operation.attached)assert.equal(await game.attach(source,target),true,label+': actual attachment');
  stageCondition(MTG,ctx,operation.condition,operation.conditionSubject==='affected'?target:source,h);game.recalc();
  for(const subtype of operation.change.addCreatureTypes||[])assert.equal(target.hasSub(subtype),true,label+': added creature type '+subtype);
  for(const subtype of target.def.subtypes||[])assert.equal(target.hasSub(subtype),true,label+': existing subtype is retained');
  if(operation.change.allCreatureTypes){assert.equal(target.hasSub('Brushwagg'),true,label+': all creature types includes an unrelated type');assert.equal(target.hasSub('Equipment'),target.def.subtypes?.includes('Equipment')||false,label+': all creature types does not add artifact subtypes');}
  if(operation.change.colors)assert.deepEqual(Array.from(target.colors),Array.from(operation.change.colors),label+': exact replacement colors');
  if(child){
    const counters=(target.counters['+1/+1']||0)-(target.counters['-1/-1']||0);
    if(child.kind==='base-pt-static'){
      if(child.power!==undefined)assert.equal(target.cur.basePower,child.power,label+': exact set base power');
      if(child.toughness!==undefined)assert.equal(target.cur.baseToughness,child.toughness,label+': exact set base toughness');
    }else{
      assert.equal(target.power,Number(target.def.power)+(child.power||0)+counters,label+': exact continuous power modifier');
      assert.equal(target.toughness,Number(target.def.toughness)+(child.toughness||0)+counters,label+': exact continuous toughness modifier');
    }
    for(const keyword of child.keywords||[])assert.equal(target.kw(keyword),true,label+': keyword '+keyword);
    const before=target.power;game.addCounters(target,'+1/+1',2);assert.equal(target.power,before+2,label+': counters apply after the base and modifier layers');
  }
  if(!operation.own){
    await game.move(source,'exile');
    for(const subtype of operation.change.addCreatureTypes||[])if(!target.def.subtypes.includes(subtype))assert.equal(target.hasSub(subtype),false,label+': source removal ends added type');
    if(operation.change.allCreatureTypes)assert.equal(target.hasSub('Brushwagg'),false,label+': source removal ends all-types grant');
    const counters=(target.counters['+1/+1']||0)-(target.counters['-1/-1']||0);
    assert.equal(target.power,(Number(target.def.power)||0)+counters,label+': source removal restores printed P/T including noncreature zero');
  }
  return 8;
}
