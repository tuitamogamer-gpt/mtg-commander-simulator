import assert from 'node:assert/strict';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
export const bindChosenType=(node,choice)=>node?.kind==='chosen-subtype-v16'?choice:Array.isArray(node)?node.map(child=>bindChosenType(child,choice)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bindChosenType(value,choice)])):node;
export async function enterChosenTypeSource(M,ctx,entry,source,h){
  if(!entry.implementation.some(row=>row.kind==='chosen-subtype-entry-v16'))return false;
  if(source.zone==='battlefield')await ctx.game.move(source,'hand');
  const prior=ctx.a.controller.decide.bind(ctx.a.controller);
  ctx.a.controller.decide=(g,q)=>q.prompt===source.name+': choose a creature type'?'Elf':prior(g,q);
  h.fund(ctx.a,100);
  assert.equal(await ctx.game.castSpell(ctx.a,source,{from:'hand'}),true);
  await h.resolveAll(ctx.game);
  assert.equal(source.meta.oracleChosenSubtypeV16,'Elf');ctx.chosenSubtypeV16='Elf';return true;
}
export async function chosenTypeEntryProof(M,entry,role){
  const f=context(M,role),{game,a}=f,source=put(M,game,a,entry.raw.name,'hand');
  const prior=a.controller.decide.bind(a.controller);let choice='Elf',choices=0;
  a.controller.decide=(g,q)=>{if(q.prompt===source.name+': choose a creature type'){assert.equal(g.bf().includes(source),false);assert.ok(q.options.some(row=>row.key===choice));choices++;return choice;}return prior(g,q);};
  for(const color of ['W','U','B','R','G','C'])a.pool[color]=30;
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(source.meta.oracleChosenSubtypeV16,'Elf');
  await game.move(source,'exile');choice='Goblin';await game.move(source,'battlefield');await settle(game);assert.equal(source.meta.oracleChosenSubtypeV16,'Goblin');assert.equal(choices,2);
  return 4;
}
export async function wardPaymentProofV16(M,entry,operation,role){
  const payment=operation.payment.cost,choices=payment.kind==='alternatives'?payment.choices:[payment];let checks=0;
  for(const branch of [-1,...choices.map((_,i)=>i)]){
    const {game,a,b}=context(M,role),source=put(M,game,b,entry.raw.name),victim=put(M,game,a,'Grizzly Bears');
    for(let i=0;i<3;i++)put(M,game,a,'Forest','hand');for(const color of ['W','U','B','R','G','C'])a.pool[color]=30;
    const trace=[],prior=a.controller.decide.bind(a.controller);
    a.controller.decide=(g,q)=>{trace.push(q);if(q.type==='chooseTargets'&&q.candidates.includes(source))return [source];if(q.aiHint?.kind==='oracleUnlessPayment')return branch<0?'no':choices.length>1?'pay-'+branch:'yes';if(q.type==='chooseCards'&&q.from.includes(victim)&&q.aiHint?.kind==='sacCost')return [victim];return prior(g,q);};
    const removal=put(M,game,a,'Beast Within','hand');assert.equal(await game.castSpell(a,removal,{from:'hand'}),true);
    const spell=game.stack.find(row=>row.card===removal);assert.ok(spell&&[spell.targets].flat(2).includes(source));assert.equal(game.stack.at(-1).kind,'trigger');assert.equal(game.stack.at(-1).srcCard,source);
    const before={life:a.life,hand:a.hand.length,pool:Object.values(a.pool).reduce((x,y)=>x+y,0),trace:trace.length};await game.resolveTop();
    if(branch<0){assert.equal(game.stack.includes(spell),false);assert.equal(source.zone,'battlefield');assert.equal(a.life,before.life);assert.equal(a.hand.length,before.hand);assert.equal(victim.zone,'battlefield');}
    else{
      const cost=choices[branch];assert.equal(game.stack.includes(spell),true,entry.raw.name+': paid ward preserves the targeted spell');
      if(cost.kind==='sacrifice')assert.equal(victim.zone,'graveyard');
      if(cost.kind==='discard'){assert.equal(a.hand.length,before.hand-1);if(cost.randomV16)assert.equal(trace.slice(before.trace).some(q=>q.type==='chooseCards'),false,entry.raw.name+': random discard has no chosen card');}
      if(cost.kind==='mana'){const mana=M.parseCost(cost.mana);assert.equal(before.pool-Object.values(a.pool).reduce((x,y)=>x+y,0),mana.generic+mana.pips.length);assert.equal(before.life-a.life,cost.lifeV14||0);}
      await settle(game);assert.notEqual(source.zone,'battlefield');
    }checks+=8;
  }return checks;
}
