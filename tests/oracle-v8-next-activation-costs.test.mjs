import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionCost} from '../scripts/oracle-v8-costs.mjs';
import {baseCost} from '../scripts/oracle-v8-core.mjs';

const MTG=fixtureEngine([
  ['Next Activation Exiler','{B}, {T}, Exile two cards from your graveyard: Draw two cards.','Artifact','{0}'],
  ['Next Activation Captain, Bold','{1}, Sacrifice Next Activation Captain: Draw two cards.','Artifact','{0}'],
  ['Next Activation Twins','{1}, Sacrifice two other creatures: Draw two cards.','Creature — Rogue','{0}'],
  ['Next Activation Rogue','{1}, Tap another untapped Rogue you control: Draw two cards.','Creature — Rogue','{0}'],
  ['Next Activation Tapped Rogue','{1}, {T}, Tap another untapped Rogue you control: Draw two cards.','Creature — Rogue','{0}'],
  ['Next Activation Mixed','{1}, Sacrifice Next Activation Mixed, Discard two cards: Draw two cards.','Artifact','{0}'],
  ['Next Activation Grave Mix','{1}, Discard a card, Exile two cards from your graveyard: Draw two cards.','Artifact','{0}'],
  ['Next Activation Valuable Return','Flying','Creature — Dragon','{5}{R}'],
  ['Next Activation Fodder','','Creature — Rogue','{0}'],
  ['Next Activation Artifact','','Artifact','{0}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
const ready=(role,name)=>{const ctx=context(MTG,role);ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:1};return {...ctx,source:own(ctx,name)};};
const entry=ctx=>ctx.game.activatableList(ctx.a).find(row=>row.card===ctx.source&&row.ability);
const rawEntry=ctx=>({card:ctx.source,ability:ctx.source.def.abilities[0],idx:0});
async function activate(ctx,{pilot=false}={}){
  const action=entry(ctx);assert.ok(action,'normal engine offers a fully payable activation');
  if(pilot){
    const chosen=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,phase:ctx.game.phase,casts:[],acts:[action],lands:[]});
    assert.equal(chosen.kind,'activate','real local AI chooses the beneficial printed ability');
    assert.equal(chosen.entry.card,ctx.source);assert.equal(await ctx.game.performAction(ctx.a,chosen),true);
  }else assert.equal(await ctx.game.activateAbility(ctx.a,action),true);
  assert.equal(ctx.a.pool.C+ctx.a.pool.B,0,'all printed mana was paid');
  assert.equal(ctx.game.stack.length,1,'the ability reaches the Stack after its complete payment');
  return ctx.game.stack[0];
}

for(const role of ['human','ai']){
  test(`next activation ${role}: fixed graveyard exile requires two distinct own cards before the ability resolves`,async()=>{
    const ctx=ready(role,'Next Activation Exiler');ctx.a.pool.C=0;ctx.a.pool.B=1;
    const first=own(ctx,'Forest','graveyard'),enemy=put(MTG,ctx.game,ctx.b,'Forest','graveyard');
    assert.equal(!!entry(ctx),false);assert.equal(await ctx.game.activateAbility(ctx.a,rawEntry(ctx)),false);
    assert.equal(ctx.source.tapped,false);assert.equal(ctx.a.pool.B,1);assert.equal(first.zone,'graveyard');
    const second=own(ctx,'Forest','graveyard');await activate(ctx,{pilot:role==='ai'});
    assert.equal(ctx.source.tapped,true);assert.equal(first.zone,'exile');assert.equal(second.zone,'exile');assert.equal(enemy.zone,'graveyard');
    assert.equal(ctx.a.hand.length,0);await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
  });
  test(`next activation ${role}: the exact printed source alias is sacrificed and remains paid if countered`,async()=>{
    const ctx=ready(role,'Next Activation Captain, Bold'),other=own(ctx,'Next Activation Artifact');
    const so=await activate(ctx,{pilot:role==='ai'});assert.equal(ctx.source.zone,'graveyard');assert.equal(other.zone,'battlefield');
    assert.equal(so.ctx.sacdSelf.name,ctx.source.name);assert.equal(await ctx.game.counterStackObject(so),true);await settle(ctx.game);
    assert.equal(ctx.a.hand.length,0);assert.equal(ctx.source.zone,'graveyard');
  });
  test(`next activation ${role}: other sacrifice counts exclude the source and consume both selected creatures`,async()=>{
    const ctx=ready(role,'Next Activation Twins'),first=own(ctx,'Next Activation Fodder');
    assert.equal(!!entry(ctx),false);assert.equal(await ctx.game.activateAbility(ctx.a,rawEntry(ctx)),false);assert.equal(ctx.a.pool.C,1);
    const second=own(ctx,'Next Activation Fodder');await activate(ctx);
    assert.equal(ctx.source.zone,'battlefield');assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');
    await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
  });
  test(`next activation ${role}: another untapped subtype excludes the source but permits a summoning-sick helper`,async()=>{
    const ctx=ready(role,'Next Activation Rogue');ctx.source.sick=true;
    const enemy=put(MTG,ctx.game,ctx.b,'Next Activation Fodder');assert.equal(!!entry(ctx),false);
    const helper=own(ctx,'Next Activation Fodder');helper.sick=true;
    await activate(ctx,{pilot:role==='ai'});assert.equal(helper.tapped,true);assert.equal(ctx.source.tapped,false);assert.equal(enemy.tapped,false);
    await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
  });
  test(`next activation ${role}: a tap symbol and another-creature tap reserve two different objects`,async()=>{
    const ctx=ready(role,'Next Activation Tapped Rogue'),helper=own(ctx,'Next Activation Fodder');
    await activate(ctx);assert.equal(ctx.source.tapped,true);assert.equal(helper.tapped,true);await settle(ctx.game);
  });
  test(`next activation ${role}: combined hand and graveyard payment is paid before drawing`,async()=>{
    const ctx=ready(role,'Next Activation Grave Mix');const hand=own(ctx,'Forest','hand'),gy=[own(ctx,'Forest','graveyard'),own(ctx,'Forest','graveyard')];
    await activate(ctx);assert.equal(hand.zone,'graveyard');assert.ok(gy.every(card=>card.zone==='exile'));assert.equal(ctx.a.hand.length,0);
    await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
  });
}

test('next activation duplicate, short and stale exile choices leave mana and tap costs unpaid',async()=>{
  for(const mode of ['duplicate','short','stale']){
    const ctx=ready('human','Next Activation Exiler');ctx.a.pool.B=1;ctx.a.pool.C=0;
    const first=own(ctx,'Forest','graveyard'),second=own(ctx,'Forest','graveyard');
    const decision=ctx.a.controller.decide.bind(ctx.a.controller);
    ctx.a.controller.decide=async(g,q)=>{
      if(q.type!=='chooseCards'||q.aiHint?.kind!=='delve')return decision(g,q);
      if(mode==='stale'){await g.move(first,'hand');await g.move(first,'graveyard');return [first,second];}
      return mode==='duplicate'?[first,first]:[first];
    };
    assert.equal(await ctx.game.activateAbility(ctx.a,rawEntry(ctx)),false);assert.equal(ctx.a.pool.B,1);assert.equal(ctx.source.tapped,false);
    assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');assert.equal(ctx.game.stack.length,0);
  }
});
test('Cabal Surgeon local AI spends two low-value cards and preserves its selected graveyard return target',async()=>{
  const ctx=ready('ai','Cabal Surgeon');ctx.a.pool={W:0,U:0,B:2,R:0,G:0,C:2};
  const wanted=own(ctx,'Next Activation Valuable Return','graveyard');
  const fodder=[own(ctx,'Next Activation Artifact','graveyard'),own(ctx,'Next Activation Artifact','graveyard')];
  const ability=entry(ctx);assert.ok(ability);assert.equal(await ctx.game.activateAbility(ctx.a,ability),true);
  const choice=ctx.trace.find(({q})=>q.type==='chooseCards'&&q.aiHint?.kind==='delve');
  assert.ok(choice);assert.ok(choice.q.from.includes(wanted),'the selected target remains a legal cost');
  assert.ok(choice.q.aiHint.keepTargets.includes(wanted));assert.ok(fodder.every(card=>card.zone==='exile'));
  assert.equal(wanted.zone,'graveyard');assert.equal(ctx.source.tapped,true);assert.equal(ctx.a.pool.B+ctx.a.pool.C,0);
  await settle(ctx.game);assert.equal(wanted.zone,'hand');assert.ok(ctx.a.hand.includes(wanted));
});
test('next activation invalid discard cannot spend mana or sacrifice its named source',async()=>{
  const ctx=ready('human','Next Activation Mixed'),first=own(ctx,'Forest','hand');own(ctx,'Forest','hand');
  const decision=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>q.type==='chooseCards'&&q.aiHint?.kind==='addlDiscard'?[first,first]:decision(g,q);
  assert.equal(await ctx.game.activateAbility(ctx.a,rawEntry(ctx)),false);assert.equal(ctx.source.zone,'battlefield');assert.equal(ctx.a.pool.C,1);assert.equal(first.zone,'hand');
});
test('next activation rejects stale control and duplicate sacrifice selections before spending mana',async()=>{
  for(const mode of ['control','duplicate']){
    const ctx=ready('human','Next Activation Twins'),first=own(ctx,'Next Activation Fodder'),second=own(ctx,'Next Activation Fodder');
    const decision=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=async(g,q)=>{
      if(q.type!=='chooseCards'||q.aiHint?.kind!=='sacCost')return decision(g,q);
      if(mode==='control'){first.ctrl=ctx.b;g.recalc();return [first,second];}return [first,first];
    };
    assert.equal(await ctx.game.activateAbility(ctx.a,rawEntry(ctx)),false);assert.equal(ctx.a.pool.C,1);assert.equal(ctx.source.zone,'battlefield');
    assert.equal(first.zone,'battlefield');assert.equal(second.zone,'battlefield');
  }
});
test('next activation a stale affordable action cannot tap or exile cards after its mana disappears',async()=>{
  const ctx=ready('human','Next Activation Exiler');ctx.a.pool.C=0;ctx.a.pool.B=1;
  const cards=[own(ctx,'Forest','graveyard'),own(ctx,'Forest','graveyard')],action=entry(ctx);assert.ok(action);ctx.a.pool.B=0;
  assert.equal(await ctx.game.activateAbility(ctx.a,action),false);assert.equal(ctx.source.tapped,false);assert.ok(cards.every(card=>card.zone==='graveyard'));
});
test('next activation a sacrifice payment may tap for mana but cannot also be sacrificed for mana',async()=>{
  for(const manaKind of ['tap','sacSelf']){
    const ctx=ready('human','Next Activation Captain, Bold');ctx.a.pool.C=0;
    ctx.source.def={...ctx.source.def,mana:[{cost:{[manaKind]:true},produce:[{C:1}]}]};ctx.game.recalc();
    const action=entry(ctx);assert.equal(!!action,manaKind==='tap','only jointly payable mana and sacrifice costs are offered');
    assert.equal(await ctx.game.activateAbility(ctx.a,action||rawEntry(ctx)),manaKind==='tap');
    if(manaKind==='tap'){assert.equal(ctx.source.zone,'graveyard');assert.equal(ctx.game.stack.length,1);await settle(ctx.game);assert.equal(ctx.a.hand.length,2);}
    else {assert.equal(ctx.source.zone,'battlefield');assert.equal(ctx.source.tapped,false);assert.equal(ctx.game.stack.length,0);}
  }
});
test('next activation one source cannot satisfy both a source sacrifice and a separate creature sacrifice',async()=>{
  const ctx=ready('human','Next Activation Twins');
  const ability={...ctx.source.def.abilities[0],cost:{mana:'{1}',sacSelf:true,sacCreature:true,sacN:1}};
  ctx.source.def={...ctx.source.def,abilities:[ability]};ctx.game.recalc();
  assert.equal(!!entry(ctx),false);assert.equal(await ctx.game.activateAbility(ctx.a,rawEntry(ctx)),false);assert.equal(ctx.a.pool.C,1);
  const other=own(ctx,'Next Activation Fodder');await activate(ctx);assert.equal(ctx.source.zone,'graveyard');assert.equal(other.zone,'graveyard');await settle(ctx.game);
});
test('next activation grammar rejects unknown names, quantities, repeated atoms and vague cost filters',()=>{
  const card={name:'Known Cost Source',layout:'normal',type_line:'Artifact',mana_cost:'{0}'};
  for(const text of ['Exile 0 cards from your graveyard','Exile X cards from your graveyard','Tap another tapped Rogue you control','Tap another untapped Wobblebeast you control','Sacrifice two other Wobblebeasts','Sacrifice Unknown Source','{1}, {2}, Sacrifice Known Cost Source','{T}, {T}, Exile two cards from your graveyard','Sacrifice Known Cost Source, Sacrifice Known Cost Source'])
    assert.equal(extensionCost(text,{priorCost:baseCost},card),null,text);
  for(const text of ['Sacrifice Unknown Source','Tap another untapped Wobblebeast you control','Exile zero cards from your graveyard'])
    assert.equal(semanticClass({...card,oracle_text:text+': Draw two cards.'}).semanticClass,undefined,text);
});
