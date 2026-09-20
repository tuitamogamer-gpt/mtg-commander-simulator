import assert from 'node:assert/strict';
import {stageCondition} from './oracle-v5-proof.mjs';
import {enterChosenColorSource} from './oracle-chosen-color-proof.mjs';
import {bindChosenType} from './oracle-v16-proof.mjs';

export async function layeredStaticProof(MTG,entry,operation,role,h){
  const ctx=h.gameFor(MTG,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a}=ctx,label=entry.raw.name+'/'+role;
  h.assertControllerRole(MTG,ctx,label);
  let source=h.permanent(MTG,game,a,entry.raw.name);const child=operation.operation;
  if(operation.own&&operation.condition?.kind==='source-quality'&&operation.condition.filter.token)source=(await game.copyPermanentToken(source,a,{n:1}))[0];
  await enterChosenColorSource(MTG,ctx,entry,source,h);
  operation=bindChosenType(operation,source.meta.oracleChosenSubtypeV16);
  const aura=entry.implementation.find(op=>op.kind==='aura-target');
  const target=operation.own?source:h.stageGenericTarget(MTG,ctx,operation.attached&&operation.change.creatureV9?h.auraProofTarget(aura):operation.attached?{what:'creature',zone:'battlefield',controller:'you',min:1}:operation.filters[0],'layered-recipient');
  if(operation.attached)assert.equal(await game.attach(source,target),true,label+': actual attachment');
  stageCondition(MTG,ctx,operation.condition,operation.conditionSubject==='affected'?target:source,h);game.recalc();
  if(operation.change.creatureV9){assert.equal(target.is('Creature'),true,label+': host becomes a creature');for(const type of target.def.types)assert.equal(target.is(type),true,label+': original card type survives animation');}
  for(const type of operation.change.addTypesV10||[])assert.equal(target.is(type),true,label+': added card type '+type);
  for(const type of operation.change.addSuperV10||[])assert.equal(target.cur.super.includes(type),true,label+': added supertype '+type);
  for(const type of operation.change.removeSuperV10||[])assert.equal(target.cur.super.includes(type),false,label+': removed supertype '+type);
  for(const subtype of operation.change.addCreatureTypes||[])assert.equal(target.hasSub(subtype),true,label+': added creature type '+subtype);
  for(const subtype of operation.change.replaceCreatureTypesV10||[])assert.equal(target.hasSub(subtype),true,label+': replacement creature subtype');
  for(const subtype of target.def.subtypes||[])assert.equal(target.hasSub(subtype),!operation.change.replaceCreatureTypesV10||!MTG.CREATURE_SUBTYPES.has(subtype)||operation.change.replaceCreatureTypesV10.includes(subtype),label+': existing subtype is retained or replaced according to its type');
  for(const color of operation.change.addColorsV10||[])assert.equal(target.colors.includes(color),true,label+': additional color');
  if(operation.change.allCreatureTypes){assert.equal(target.hasSub('Brushwagg'),true,label+': all creature types includes an unrelated type');assert.equal(target.hasSub('Equipment'),target.def.subtypes?.includes('Equipment')||false,label+': all creature types does not add artifact subtypes');}
  if(operation.change.colors)assert.deepEqual(Array.from(target.colors),Array.from(operation.change.colors),label+': exact replacement colors');
  if(operation.change.chosenColorV10)assert.deepEqual(Array.from(target.colors),[source.meta.oracleChosenColor],label+': actual entry choice determines replacement colors');
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
    for(const type of operation.change.addTypesV10||[])assert.equal(target.is(type),target.def.types.includes(type),label+': removing source ends the added card type');
    for(const type of [...(operation.change.addSuperV10||[]),...(operation.change.removeSuperV10||[])])assert.equal(target.cur.super.includes(type),target.def.super.includes(type),label+': removing source restores the printed supertype');
    if(operation.change.creatureV9)assert.equal(target.is('Creature'),target.def.types.includes('Creature'),label+': removing Aura ends creature animation');
    for(const subtype of operation.change.addCreatureTypes||[])if(!target.def.subtypes.includes(subtype))assert.equal(target.hasSub(subtype),false,label+': source removal ends added type');
    if(operation.change.allCreatureTypes)assert.equal(target.hasSub('Brushwagg'),false,label+': source removal ends all-types grant');
    const counters=(target.counters['+1/+1']||0)-(target.counters['-1/-1']||0);
    assert.equal(target.power,(Number(target.def.power)||0)+(target.is('Creature')?counters:0),label+': source removal restores printed P/T including noncreature zero');
    if(operation.change.creatureV9)assert.equal(target.counters['+1/+1'],2,label+': animation ending preserves counters on the noncreature');
  }
  return 8;
}
