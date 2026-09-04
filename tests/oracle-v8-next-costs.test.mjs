import test from 'node:test';
import assert from 'node:assert/strict';
import {modifierOperation} from '../scripts/oracle-v8-additional-costs.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';

const prefix='As an additional cost to cast this spell, ';
const spell=(name,cost)=>[name,prefix+cost+'.\nDraw two cards.','Sorcery','{1}{B}'];
const MTG=fixtureEngine([
  spell('Next Costs Two Creatures','sacrifice two creatures'),
  spell('Next Costs Union','sacrifice a creature or enchantment'),
  spell('Next Costs Intersection','sacrifice an artifact creature'),
  spell('Next Costs Permanent','sacrifice two permanents'),
  spell('Next Costs Exile','exile two artifact or enchantment cards from your graveyard'),
  spell('Next Costs Combined','sacrifice two creatures and discard two cards'),
  spell('Next Costs Life Choice','sacrifice two creatures or pay 4 life'),
  spell('Next Costs Goblin','sacrifice a Goblin'),
  spell('Next Costs Blue Discard','discard a blue card'),
  spell('Next Costs Red Goblin','sacrifice a red Goblin'),
  spell('Next Costs Nonland','sacrifice a nonland permanent'),
  spell('Next Costs Return','return a permanent you control to its owner\'s hand'),
  spell('Next Costs Return Land','return a basic land you control to its owner\'s hand'),
  spell('Next Costs Color Exile','exile two blue cards from your graveyard'),
  ['Next Costs Creature','','Creature — Bear','{1}'],
  ['Next Costs Artifact','','Artifact','{1}'],
  ['Next Costs Enchantment','','Enchantment','{1}'],
  ['Next Costs Artifact Creature','','Artifact Creature — Construct','{1}'],
  ['Next Costs Goblin Fodder','','Creature — Goblin','{R}'],
  ['Next Costs Blue Goblin','','Creature — Goblin','{U}'],
  ['Next Costs Blue Fodder','','Creature — Bear','{U}'],
]);

function ready(ctx,name) {
  ctx.a.pool={W:0,U:0,B:1,R:0,G:0,C:1};
  return put(MTG,ctx.game,ctx.a,name,'hand');
}
function own(ctx,name,zone='battlefield') {return put(MTG,ctx.game,ctx.a,name,zone);}
async function cast(ctx,source) {return ctx.game.castSpell(ctx.a,source,{from:'hand'});}
function mana(ctx) {return Object.values(ctx.a.pool).reduce((a,b)=>a+b,0);}
function assertPaid(ctx,source) {
  assert.equal(source.zone,'stack');
  assert.equal(mana(ctx),0,'printed mana is paid before the spell reaches the Stack');
  const so=ctx.game.stack.find(so=>so.card===source);
  assert.ok(so?.oracleV4AdditionalCost,'casting records actual additional payment');
  return so;
}

for(const role of ['human','ai']) {
  test(`next costs ${role}: exactly two owned creatures are sacrificed before resolution and remain paid when countered`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Two Creatures');
    const first=own(ctx,'Next Costs Creature'),second=own(ctx,'Next Costs Creature');
    const enemy=put(MTG,ctx.game,ctx.b,'Next Costs Creature');
    assert.equal(await cast(ctx,source),true);
    const so=assertPaid(ctx,source);
    assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');assert.equal(enemy.zone,'battlefield');
    assert.deepEqual(new Set(Array.from(so.oracleV4AdditionalCost.sacrifices,entry=>entry.iid)),new Set([first.iid,second.iid]));
    assert.ok(ctx.trace.some(({q})=>q.type==='chooseCards'&&q.aiHint?.kind==='addlSac'&&q.min===2&&q.max===2));
    const hand=ctx.a.hand.length;so.countered=true;await settle(ctx.game);
    assert.equal(ctx.a.hand.length,hand);assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');
  });

  test(`next costs ${role}: a type union accepts an enchantment and excludes an unrelated artifact`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Union');
    const artifact=own(ctx,'Next Costs Artifact'),enchantment=own(ctx,'Next Costs Enchantment');
    assert.equal(await cast(ctx,source),true);assertPaid(ctx,source);
    assert.equal(enchantment.zone,'graveyard');assert.equal(artifact.zone,'battlefield');
    await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
  });

  test(`next costs ${role}: an artifact creature requires one object with both types`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Intersection');
    const artifact=own(ctx,'Next Costs Artifact'),creature=own(ctx,'Next Costs Creature');
    assert.equal(await cast(ctx,source),false,'separate objects do not satisfy an intersection');
    assert.equal(mana(ctx),2);assert.equal(source.zone,'hand');assert.equal(artifact.zone,'battlefield');assert.equal(creature.zone,'battlefield');
    const both=own(ctx,'Next Costs Artifact Creature');
    assert.equal(await cast(ctx,source),true);assertPaid(ctx,source);assert.equal(both.zone,'graveyard');
    assert.equal(artifact.zone,'battlefield');assert.equal(creature.zone,'battlefield');await settle(ctx.game);
  });

  test(`next costs ${role}: permanent costs include lands and require two distinct objects`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Permanent'),artifact=own(ctx,'Next Costs Artifact');
    assert.equal(await cast(ctx,source),false);assert.equal(mana(ctx),2);assert.equal(artifact.zone,'battlefield');
    const land=own(ctx,'Forest');assert.equal(await cast(ctx,source),true);assertPaid(ctx,source);
    assert.equal(artifact.zone,'graveyard');assert.equal(land.zone,'graveyard');await settle(ctx.game);
  });

  test(`next costs ${role}: typed graveyard exile excludes wrong types and commits both selected cards`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Exile');
    const creature=own(ctx,'Next Costs Creature','graveyard'),artifact=own(ctx,'Next Costs Artifact','graveyard');
    assert.equal(await cast(ctx,source),false);assert.equal(mana(ctx),2);assert.equal(artifact.zone,'graveyard');
    const enchantment=own(ctx,'Next Costs Enchantment','graveyard');
    assert.equal(await cast(ctx,source),true);const so=assertPaid(ctx,source);
    assert.equal(artifact.zone,'exile');assert.equal(enchantment.zone,'exile');assert.equal(creature.zone,'graveyard');
    assert.deepEqual(new Set(Array.from(so.oracleV4AdditionalCost.exiles)),new Set([artifact.iid,enchantment.iid]));
    await settle(ctx.game);
  });

  test(`next costs ${role}: combined costs reserve the complete sacrifice and discard payment`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Combined');
    const creatures=[own(ctx,'Next Costs Creature'),own(ctx,'Next Costs Creature')];
    const first=own(ctx,'Forest','hand');
    assert.equal(await cast(ctx,source),false,'the spell itself cannot be the second discarded card');
    assert.equal(mana(ctx),2);assert.equal(first.zone,'hand');assert.ok(creatures.every(card=>card.zone==='battlefield'));
    const second=own(ctx,'Forest','hand');
    assert.equal(await cast(ctx,source),true);const so=assertPaid(ctx,source);
    assert.equal(so.oracleV4AdditionalCost.sacrifices.length,2);assert.equal(so.oracleV4AdditionalCost.discards.length,2);
    assert.ok(creatures.every(card=>card.zone==='graveyard'));assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');
    await settle(ctx.game);
  });

  test(`next costs ${role}: life alternative is paid only when affordable and does not silently skip a cost`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Life Choice');ctx.a.life=3;
    assert.equal(await cast(ctx,source),false);assert.equal(ctx.a.life,3);assert.equal(mana(ctx),2);
    ctx.a.life=12;assert.equal(await cast(ctx,source),true);const so=assertPaid(ctx,source);
    assert.equal(ctx.a.life,8);assert.equal(so.oracleV4AdditionalCost.life,4);assert.equal(so.oracleV4AdditionalCost.sacrifices.length,0);
    await settle(ctx.game);
  });

  test(`next costs ${role}: a subtype cost checks Goblin rather than accepting an arbitrary creature`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Goblin'),bear=own(ctx,'Next Costs Creature');
    assert.equal(await cast(ctx,source),false);assert.equal(mana(ctx),2);assert.equal(bear.zone,'battlefield');
    const goblin=own(ctx,'Next Costs Goblin Fodder');assert.equal(await cast(ctx,source),true);assertPaid(ctx,source);
    assert.equal(goblin.zone,'graveyard');assert.equal(bear.zone,'battlefield');await settle(ctx.game);
  });

  test(`next costs ${role}: the same sacrifice must satisfy both printed color and subtype`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Red Goblin'),blue=own(ctx,'Next Costs Blue Goblin');
    assert.equal(await cast(ctx,source),false);assert.equal(mana(ctx),2);
    const red=own(ctx,'Next Costs Goblin Fodder');assert.equal(await cast(ctx,source),true);assertPaid(ctx,source);
    assert.equal(red.zone,'graveyard');assert.equal(blue.zone,'battlefield');await settle(ctx.game);
  });

  test(`next costs ${role}: filtered discard and exile use actual card colors in their zones`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Blue Discard'),red=own(ctx,'Next Costs Goblin Fodder','hand');
    assert.equal(await cast(ctx,source),false);assert.equal(red.zone,'hand');assert.equal(mana(ctx),2);
    const blue=own(ctx,'Next Costs Blue Fodder','hand');assert.equal(await cast(ctx,source),true);assertPaid(ctx,source);
    assert.equal(blue.zone,'graveyard');assert.equal(red.zone,'hand');await settle(ctx.game);
    const exile=ready(ctx,'Next Costs Color Exile');assert.equal(await cast(ctx,exile),false);
    const other=own(ctx,'Next Costs Blue Goblin','graveyard');assert.equal(await cast(ctx,exile),true);assertPaid(ctx,exile);
    assert.equal(blue.zone,'exile');assert.equal(other.zone,'exile');await settle(ctx.game);
  });

  test(`next costs ${role}: nonland excludes an artifact land even though it is an artifact`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Nonland'),land=own(ctx,'Forest');
    const prior=land.def;land.def={...prior,types:['Artifact','Land']};ctx.game.recalc();
    assert.equal(await cast(ctx,source),false);assert.equal(mana(ctx),2);
    const artifact=own(ctx,'Next Costs Artifact');assert.equal(await cast(ctx,source),true);assertPaid(ctx,source);
    assert.equal(artifact.zone,'graveyard');assert.equal(land.zone,'battlefield');await settle(ctx.game);
  });

  test(`next costs ${role}: return costs send a controlled permanent to its owner's hand before resolution`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Return');
    const borrowed=put(MTG,ctx.game,ctx.b,'Next Costs Artifact');borrowed.ctrl=ctx.a;ctx.game.recalc();
    assert.equal(await cast(ctx,source),true);const so=assertPaid(ctx,source);
    assert.equal(borrowed.zone,'hand');assert.ok(ctx.b.hand.includes(borrowed));assert.equal(ctx.a.hand.includes(borrowed),false);
    assert.deepEqual(Array.from(so.oracleV4AdditionalCost.returns),[borrowed.iid]);
    so.countered=true;await settle(ctx.game);assert.equal(borrowed.zone,'hand');
  });

  test(`next costs ${role}: a returned land may provide mana but cannot be sacrificed to provide that mana`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Return Land'),land=own(ctx,'Swamp');
    ctx.a.pool.B=0;assert.equal(await cast(ctx,source),true);assertPaid(ctx,source);assert.equal(land.zone,'hand');await settle(ctx.game);
    const next=ready(ctx,'Next Costs Return'),treasure=own(ctx,'Next Costs Artifact');
    treasure.def={...treasure.def,mana:[{cost:{sacSelf:true},produce:[{B:1}]}]};ctx.game.recalc();ctx.a.pool.B=0;
    assert.equal(ctx.game.canPayMana(ctx.a,ctx.game.spellCost(ctx.a,next),{card:next}),true,'the artifact really can fund the mana cost before it is reserved for return');
    assert.equal(await cast(ctx,next),false,'a returned mana artifact cannot also be sacrificed to fund the same spell');
    assert.equal(treasure.zone,'battlefield');assert.equal(next.zone,'hand');assert.equal(ctx.a.pool.C,1);
  });

  test(`next costs ${role}: separate additional-cost plans cannot reuse a returned object for sacrifice`,async()=>{
    const ctx=context(MTG,role),source=ready(ctx,'Next Costs Return'),first=own(ctx,'Next Costs Artifact');
    const extra=MTG.compileOracleAdditionalCosts(modifierOperation({layout:'normal'},prefix+'sacrifice an artifact.').costs);
    const prepare=source.def.prepareTargets;
    source.def={...source.def,prepareTargets:async ctx=>await prepare(ctx)&&await extra.prepareTargets(ctx)};
    assert.equal(await cast(ctx,source),false);assert.equal(mana(ctx),2);assert.equal(first.zone,'battlefield');
    const second=own(ctx,'Next Costs Artifact');
    assert.equal(await cast(ctx,source),true);const so=assertPaid(ctx,source);
    assert.equal(so.oracleV4AdditionalCost.sacrifices.length,1);assert.equal(so.oracleV4AdditionalCost.returns.length,1);
    const paid=[so.oracleV4AdditionalCost.sacrifices[0].iid,so.oracleV4AdditionalCost.returns[0]];
    assert.deepEqual(new Set(paid),new Set([first.iid,second.iid]));
    assert.deepEqual(new Set([first.zone,second.zone]),new Set(['hand','graveyard']));await settle(ctx.game);
  });
}

test('next costs reject stale battlefield identity or control returned by a controller before spending mana',async()=>{
  for(const change of ['zone-version','control']) {
    const ctx=context(MTG),source=ready(ctx,'Next Costs Return'),permanent=own(ctx,'Next Costs Artifact');
    const decide=ctx.a.controller.decide.bind(ctx.a.controller);
    ctx.a.controller.decide=async(g,q)=>{
      if(q.type!=='chooseCards'||q.aiHint?.kind!=='bounceCost')return decide(g,q);
      if(change==='control'){permanent.ctrl=ctx.b;g.recalc();}
      else {await g.move(permanent,'hand');await g.move(permanent,'battlefield',{ctrl:ctx.a});}
      return [permanent];
    };
    assert.equal(await cast(ctx,source),false);assert.equal(mana(ctx),2);assert.equal(source.zone,'hand');
    assert.equal(permanent.zone,'battlefield');assert.equal(ctx.game.stack.length,0);
  }
});

test('next costs validator rejects cross-mechanic reservations, duplicate plans and stale objects',async()=>{
  const ctx=context(MTG),source=ready(ctx,'Next Costs Return'),permanent=own(ctx,'Next Costs Artifact');
  const so={},costCtx={g:ctx.game,you:ctx.a,src:source,so};
  assert.equal(await source.def.prepareTargets(costCtx),true);
  assert.equal(MTG.validateOracleAdditionalCostPlans(costCtx),true);
  assert.equal(MTG.validateOracleAdditionalCostPlans({...costCtx,reservedCards:[permanent]}),false);
  const other=own(ctx,'Forest');
  assert.equal(MTG.validateOracleAdditionalCostPlans({...costCtx,reservedCards:[other]}),true);
  assert.equal(MTG.validateOracleAdditionalCostPlans({...costCtx,so:{oracleCostPlans:[...so.oracleCostPlans,...so.oracleCostPlans]}}),false);
  await ctx.game.move(permanent,'hand');await ctx.game.move(permanent,'battlefield',{ctrl:ctx.a});
  assert.equal(MTG.validateOracleAdditionalCostPlans(costCtx),false);
  assert.equal(mana(ctx),2);assert.equal(source.zone,'hand');assert.equal(permanent.zone,'battlefield');
  assert.equal(MTG.validateOracleAdditionalCostPlans({so:{}}),true,'casts with no Oracle plans preserve their existing behavior');
});

test('next costs cancel before mana or objects are spent if a controller returns duplicate or insufficient cards',async()=>{
  for(const selection of ['duplicate','short']) {
    const ctx=context(MTG),source=ready(ctx,'Next Costs Two Creatures'),first=own(ctx,'Next Costs Creature'),second=own(ctx,'Next Costs Creature');
    const decide=ctx.a.controller.decide.bind(ctx.a.controller);
    ctx.a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.aiHint?.kind==='addlSac'?(selection==='duplicate'?[first,first]:[first]):decide(g,q);
    assert.equal(await cast(ctx,source),false);assert.equal(mana(ctx),2);assert.equal(source.zone,'hand');
    assert.equal(first.zone,'battlefield');assert.equal(second.zone,'battlefield');assert.equal(ctx.game.stack.length,0);
  }
});

test('next costs fail closed on unsupported quantities, predicates, payment kinds and extra clauses',()=>{
  const card={name:'Next Costs Invalid',layout:'normal',type_line:'Sorcery',mana_cost:'{B}'};
  for(const text of [
    'sacrifice zero creatures','sacrifice 0 creatures','sacrifice -1 creatures','sacrifice 1.5 creatures','sacrifice X creatures',
    'sacrifice a Wobblebeast','sacrifice an ultramarine creature','sacrifice a creature or a player',
    'discard a card at random','exile X cards from your graveyard','exile two blue blue cards from your graveyard',
    'return an untapped permanent you control to its owner\'s hand','tap two untapped creatures you control','reveal a Dinosaur card from your hand or pay {1}',
    'sacrifice a creature and sacrifice an artifact','sacrifice two creatures. Then draw a card',
  ])assert.equal(modifierOperation(card,prefix+text+'.'),null,text);
  for(const text of ['sacrifice 0 creatures','sacrifice X creatures','sacrifice a creature except on Tuesdays'])
    assert.equal(semanticClass({...card,oracle_text:prefix+text+'.\nDraw a card.'}).semanticClass,undefined,text);
});
