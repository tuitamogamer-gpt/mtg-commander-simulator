import test from 'node:test';
import assert from 'node:assert/strict';
import {modifierOperation} from '../scripts/oracle-v8-alternative-costs.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';

const alternative=(name,cost,condition='')=>[name,`${condition?`If ${condition}, you`:'You'} may ${cost} rather than pay this spell's mana cost.\nDraw two cards.`,'Instant','{4}{U}'];
const MTG=fixtureEngine([
  alternative('Alternative Sacrifice','sacrifice two Mountains'),
  alternative('Alternative Return','pay {1} and return a basic land you control to its owner\'s hand'),
  alternative('Alternative Islands','return two Islands you control to their owner\'s hand'),
  alternative('Alternative Life Sacrifice','pay 6 life and sacrifice three black creatures'),
  alternative('Alternative Discard','discard a Plains card'),
  alternative('Alternative Grave Exile','pay {1}{W} and exile a creature card from your graveyard'),
  alternative('Alternative Pitch','exile two blue cards from your hand'),
  alternative('Alternative Life Pitch','pay 1 life and exile a blue card from your hand'),
  alternative('Alternative Turn','exile a blue card from your hand',"it's not your turn"),
  alternative('Alternative Swamp','pay 2 life','you control a Swamp'),
  alternative('Alternative Nontoken','sacrifice a nontoken green creature'),
  alternative('Alternative Mana','pay {W}{U}{B}{R}{G}'),
  ['Alternative Shared Hand',"As an additional cost to cast this spell, discard a blue card.\nYou may exile a blue card from your hand rather than pay this spell's mana cost.\nDraw two cards.",'Instant','{4}{U}'],
  ['Alternative Blue Fodder','','Creature — Bear','{U}'],
  ['Alternative Black Fodder','','Creature — Bear','{B}'],
  ['Alternative Green Fodder','','Creature — Bear','{G}'],
  ['Alternative Red Fodder','','Creature — Bear','{R}'],
  ['Alternative Artifact Fodder','','Artifact','{0}'],
]);

function own(ctx,name,zone='battlefield'){return put(MTG,ctx.game,ctx.a,name,zone);}
function source(ctx,name,zone='hand'){ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:0};return own(ctx,name,zone);}
function option(card){return card.def.altCosts.find(alt=>alt.oracleAlternativeCost);}
async function cast(ctx,card,alt=option(card)){return ctx.game.castSpell(ctx.a,card,{from:card.zone,alt});}
function paid(ctx,card){assert.equal(card.zone,'stack');const so=ctx.game.stack.find(so=>so.card===card);assert.ok(so.oracleV4AdditionalCost);return so;}
function totalMana(ctx){return Object.values(ctx.a.pool).reduce((sum,n)=>sum+n,0);}

for(const role of ['human','ai']) {
  test(`alternative ${role}: exact Mountain sacrifices pay before the spell and survive countering`,async()=>{
    const ctx=context(MTG,role),card=source(ctx,'Alternative Sacrifice'),first=own(ctx,'Mountain');
    own(ctx,'Forest');put(MTG,ctx.game,ctx.b,'Mountain');
    assert.equal(ctx.game.castableList(ctx.a).some(row=>row.card===card),false);
    assert.equal(await cast(ctx,card),false);assert.equal(first.zone,'battlefield');
    const second=own(ctx,'Mountain'),entry=ctx.game.castableList(ctx.a).find(row=>row.card===card&&row.alt?.oracleAlternativeCost);
    assert.ok(entry);assert.equal(await cast(ctx,card,entry.alt),true);
    const so=paid(ctx,card);assert.equal(so.oracleV4AdditionalCost.sacrifices.length,2);
    assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');
    assert.equal(totalMana(ctx),0);await ctx.game.counterStackObject(so);
    assert.equal(first.zone,'graveyard');assert.equal(ctx.a.hand.length,0);
  });

  test(`alternative ${role}: a basic land can fund mana before returning to its owner`,async()=>{
    const ctx=context(MTG,role),card=source(ctx,'Alternative Return');
    const land=put(MTG,ctx.game,ctx.b,'Forest');land.ctrl=ctx.a;ctx.game.recalc();
    assert.equal(await cast(ctx,card),true);const so=paid(ctx,card);
    assert.equal(so.manaSpent,1);assert.equal(land.zone,'hand');assert.ok(ctx.b.hand.includes(land));
    assert.equal(so.oracleV4AdditionalCost.returns.length,1);await settle(ctx.game);assert.equal(ctx.a.hand.length,2);
  });

  test(`alternative ${role}: combined life and three black creatures are paid exactly`,async()=>{
    const ctx=context(MTG,role),card=source(ctx,'Alternative Life Sacrifice');ctx.a.life=5;
    const black=Array.from({length:3},()=>own(ctx,'Alternative Black Fodder'));
    const red=own(ctx,'Alternative Red Fodder');
    assert.equal(await cast(ctx,card),false);assert.ok(black.every(card=>card.zone==='battlefield'));
    ctx.a.life=16;assert.equal(await cast(ctx,card),true);const so=paid(ctx,card);
    assert.equal(ctx.a.life,10);assert.equal(so.oracleV4AdditionalCost.life,6);
    assert.equal(so.oracleV4AdditionalCost.sacrifices.length,3);assert.equal(red.zone,'battlefield');await settle(ctx.game);
  });

  test(`alternative ${role}: subtype discard and typed graveyard exile use the correct owned zone`,async()=>{
    const ctx=context(MTG,role),discard=source(ctx,'Alternative Discard');own(ctx,'Forest','hand');
    put(MTG,ctx.game,ctx.b,'Plains','hand');assert.equal(await cast(ctx,discard),false);
    const plains=own(ctx,'Plains','hand');assert.equal(await cast(ctx,discard),true);assert.equal(plains.zone,'graveyard');
    assert.equal(paid(ctx,discard).oracleV4AdditionalCost.discards[0],plains.iid);await settle(ctx.game);
    const exile=source(ctx,'Alternative Grave Exile'),creature=own(ctx,'Alternative Black Fodder','graveyard');
    own(ctx,'Alternative Artifact Fodder','graveyard');
    assert.equal(await cast(ctx,exile),false);assert.equal(creature.zone,'graveyard');
    ctx.a.pool.W=1;ctx.a.pool.C=1;assert.equal(await cast(ctx,exile),true);
    assert.equal(paid(ctx,exile).oracleV4AdditionalCost.exiles[0],creature.iid);assert.equal(creature.zone,'exile');assert.equal(plains.zone,'graveyard');
    await settle(ctx.game);
  });

  test(`alternative ${role}: two colored hand cards exclude the spell, wrong colors and the opponent's hand`,async()=>{
    const ctx=context(MTG,role),card=source(ctx,'Alternative Pitch');
    const first=own(ctx,'Alternative Blue Fodder','hand'),wrong=own(ctx,'Alternative Red Fodder','hand');
    const opponent=put(MTG,ctx.game,ctx.b,'Alternative Blue Fodder','hand');
    assert.equal(await cast(ctx,card),false,'source is blue but cannot exile itself to pay');
    const second=own(ctx,'Alternative Blue Fodder','hand');assert.equal(await cast(ctx,card),true);
    const so=paid(ctx,card);assert.equal(so.oracleV4AdditionalCost.handExiles.length,2);assert.equal(so.oracleV4AdditionalCost.exiles.length,0);
    assert.equal(first.zone,'exile');assert.equal(second.zone,'exile');assert.equal(wrong.zone,'hand');assert.equal(opponent.zone,'hand');
    assert.ok(ctx.trace.some(({q})=>q.type==='chooseCards'&&q.aiHint?.kind==='delve'&&q.min===2&&q.max===2));
    await settle(ctx.game);
  });

  test(`alternative ${role}: life plus colored hand exile shares the validated plan`,async()=>{
    const ctx=context(MTG,role),card=source(ctx,'Alternative Life Pitch'),blue=own(ctx,'Alternative Blue Fodder','hand');
    ctx.a.life=10;assert.equal(await cast(ctx,card),true);const so=paid(ctx,card);
    assert.equal(ctx.a.life,9);assert.equal(blue.zone,'exile');assert.equal(so.oracleV4AdditionalCost.life,1);
    assert.equal(so.oracleV4AdditionalCost.handExiles[0],blue.iid);await settle(ctx.game);
  });

  test(`alternative ${role}: normal mana casting and a separate free-cast permission pay no optional alternative`,async()=>{
    const ctx=context(MTG,role),card=source(ctx,'Alternative Life Sacrifice');ctx.a.pool.C=4;ctx.a.pool.U=1;
    assert.equal(await cast(ctx,card,null),true);assert.equal(totalMana(ctx),0);assert.equal(ctx.a.life,40);
    assert.equal(ctx.game.stack.find(so=>so.card===card).oracleV4AdditionalCost,undefined);await settle(ctx.game);
    const free=source(ctx,'Alternative Pitch');assert.equal(await ctx.game.castSpell(ctx.a,free,{from:'hand',free:true}),true);
    assert.equal(ctx.game.stack.find(so=>so.card===free).oracleV4AdditionalCost,undefined);await settle(ctx.game);
  });
}

test('alternative local AI chooses the legal cast entry and executes its actual payment',async()=>{
  const ctx=context(MTG,'ai'),card=source(ctx,'Alternative Life Pitch'),blue=own(ctx,'Alternative Blue Fodder','hand');
  const casts=ctx.game.castableList(ctx.a).filter(row=>row.card===card);assert.equal(casts.length,1);
  const action=await ctx.a.controller.decide(ctx.game,{type:'main',player:ctx.a,phase:ctx.game.phase,casts,acts:[],lands:[]});
  assert.equal(action.kind,'cast');assert.equal(action.alt.oracleAlternativeId,option(card).oracleAlternativeId);
  await ctx.game.performAction(ctx.a,action);assert.equal(blue.zone,'exile');assert.equal(ctx.a.life,39);paid(ctx,card);await settle(ctx.game);
});

test('alternative cannot be forged, stripped to its mana cost, mixed with free casting or made faster',async()=>{
  const forgeries=[alt=>({...alt,oracleAlternativeId:'missing'}),alt=>({...alt,altCostStr:'{1}'}),alt=>({...alt,free:true}),
    alt=>({...alt,flashback:true}),alt=>({...alt,speed:'instant'}),alt=>({altCostStr:alt.altCostStr}),
    alt=>({...alt,oracleAlternativeCost:false}),()=>({oracleAdditionalCosts:[],altCostStr:'{0}'}),
    ()=>({altCostStr:'{0}',flashback:true}),()=>({altCostStr:'{0}',escape:true})];
  for(const forge of forgeries){
    const ctx=context(MTG),card=source(ctx,'Alternative Life Pitch'),blue=own(ctx,'Alternative Blue Fodder','hand');
    assert.equal(await cast(ctx,card,forge(option(card))),false);assert.equal(card.zone,'hand');assert.equal(blue.zone,'hand');assert.equal(ctx.a.life,40);
  }
  const ctx=context(MTG),card=source(ctx,'Alternative Life Pitch'),blue=own(ctx,'Alternative Blue Fodder','hand');
  assert.equal(await cast(ctx,card,{...option(card),oracleAdditionalCosts:[],oraclePrepareCosts:async()=>true,cond:()=>true}),true);
  assert.equal(blue.zone,'exile');assert.equal(ctx.a.life,39,'canonical registered costs replace supplied callbacks');
});

test('alternative turn/control conditions and nontoken qualifier are enforced and rechecked before payment',async()=>{
  const ctx=context(MTG),card=source(ctx,'Alternative Turn'),blue=own(ctx,'Alternative Blue Fodder','hand');
  assert.equal(await cast(ctx,card),false);ctx.game.turnPlayer=ctx.b;
  assert.equal(await cast(ctx,card),true);assert.equal(blue.zone,'exile');await settle(ctx.game);
  ctx.game.turnPlayer=ctx.a;const swampCard=source(ctx,'Alternative Swamp');
  put(MTG,ctx.game,ctx.b,'Swamp');assert.equal(await cast(ctx,swampCard),false);
  own(ctx,'Swamp');assert.equal(await cast(ctx,swampCard),true);assert.equal(ctx.a.life,38);await settle(ctx.game);
  const nontoken=source(ctx,'Alternative Nontoken'),token=own(ctx,'Alternative Green Fodder');token.isToken=true;
  assert.equal(await cast(ctx,nontoken),false);token.isToken=false;assert.equal(await cast(ctx,nontoken),true);assert.equal(token.zone,'graveyard');
  const stale=context(MTG),spell=source(stale,'Alternative Turn'),fodder=own(stale,'Alternative Blue Fodder','hand');stale.game.turnPlayer=stale.b;
  stale.a.controller.decide=async(g,q)=>{if(q.type==='chooseCards'){g.turnPlayer=stale.a;return [fodder];}return null;};
  assert.equal(await cast(stale,spell),false);assert.equal(fodder.zone,'hand');assert.equal(stale.a.life,40);
});

test('alternative payment rejects short, duplicate, wrong-color and stale identities without consuming payment',async()=>{
  for(const failure of ['short','duplicate','wrong','stale','source-stale']){
    const ctx=context(MTG),card=source(ctx,'Alternative Pitch'),first=own(ctx,'Alternative Blue Fodder','hand'),second=own(ctx,'Alternative Blue Fodder','hand');
    const red=own(ctx,'Alternative Red Fodder','hand');
    ctx.a.controller.decide=async(g,q)=>{if(q.type==='chooseCards'){
      if(failure==='short')return [first];if(failure==='duplicate')return [first,first];if(failure==='wrong')return [first,red];
      if(failure==='stale')first.zoneVersion+=1;if(failure==='source-stale')card.zoneVersion+=1;return [first,second];
    }return null;};
    assert.equal(await cast(ctx,card),false,failure);assert.equal(first.zone,'hand');assert.equal(second.zone,'hand');assert.equal(card.zone,'hand');assert.equal(ctx.a.life,40);
  }
});

test('alternative and mandatory costs cannot use the same hand card',async()=>{
  const ctx=context(MTG),card=source(ctx,'Alternative Shared Hand'),first=own(ctx,'Alternative Blue Fodder','hand');
  assert.equal(await cast(ctx,card),false);assert.equal(first.zone,'hand');assert.equal(card.zone,'hand');
  const second=own(ctx,'Alternative Blue Fodder','hand');assert.equal(await cast(ctx,card),true);const record=paid(ctx,card).oracleV4AdditionalCost;
  assert.equal(record.discards.length,1);assert.equal(record.handExiles.length,1);assert.notEqual(record.discards[0],record.handExiles[0]);
  assert.deepEqual(new Set([first.zone,second.zone]),new Set(['graveyard','exile']));
});

test('alternative commander casting retains tax and does not pay other costs when mana is short',async()=>{
  const ctx=context(MTG),card=source(ctx,'Alternative Life Pitch','command');card.commander=true;card.cmdCasts=2;
  const blue=own(ctx,'Alternative Blue Fodder','hand');ctx.a.pool.C=3;
  assert.equal(ctx.game.spellCost(ctx.a,card,{...option(card),from:'command'}).generic,4);
  assert.equal(await cast(ctx,card),false);assert.equal(totalMana(ctx),3);assert.equal(ctx.a.life,40);assert.equal(blue.zone,'hand');
  ctx.a.pool.C=4;assert.equal(await cast(ctx,card),true);assert.equal(totalMana(ctx),0);assert.equal(card.cmdCasts,3);assert.equal(blue.zone,'exile');
});

test('alternative pure mana pays all five colors and retains the printed casting choice',async()=>{
  const ctx=context(MTG),card=source(ctx,'Alternative Mana');ctx.a.pool={W:1,U:1,B:1,R:1,G:1,C:0};
  assert.equal(await cast(ctx,card),true);assert.equal(totalMana(ctx),0);assert.equal(paid(ctx,card).manaSpent,5);
});

test('alternative uses live exile and library permissions without granting a zone permission',async()=>{
  const ctx=context(MTG),card=source(ctx,'Alternative Life Pitch','exile'),blue=own(ctx,'Alternative Blue Fodder','hand');
  assert.equal(await cast(ctx,card),false);assert.equal(blue.zone,'hand');
  card.meta.playableBy=ctx.a;card.meta.playableUntil=ctx.game.turnNo;
  const entry=ctx.game.castableList(ctx.a).find(row=>row.card===card&&row.alt?.oracleAlternativeCost);assert.ok(entry);
  assert.equal(await cast(ctx,card,entry.alt),true);assert.equal(blue.zone,'exile');assert.equal(card.meta.playableBy,undefined);await settle(ctx.game);
  const top=source(ctx,'Alternative Life Pitch','library'),pitch=own(ctx,'Alternative Blue Fodder','hand');
  assert.equal(await cast(ctx,top),false);const grant=own(ctx,'Alternative Artifact Fodder');grant.def={...grant.def,playTop:()=>true};ctx.game.recalc();
  assert.ok(ctx.game.castableList(ctx.a).some(row=>row.card===top&&row.alt?.oracleAlternativeCost));
  assert.equal(await cast(ctx,top),true);assert.equal(pitch.zone,'exile');
});

test('alternative graveyard casts require a current permission and cannot combine flashback',async()=>{
  const ctx=context(MTG),card=source(ctx,'Alternative Life Pitch','graveyard'),blue=own(ctx,'Alternative Blue Fodder','hand');
  assert.equal(await cast(ctx,card),false);card.meta.emryCastTurn=ctx.game.turnNo;
  assert.ok(ctx.game.castableList(ctx.a).some(row=>row.card===card&&row.alt?.oracleAlternativeCost));
  assert.equal(await cast(ctx,card,{...option(card),flashback:true}),false);assert.equal(blue.zone,'hand');
  assert.equal(await cast(ctx,card),true);assert.equal(blue.zone,'exile');
});

test('alternative parser fails closed on unknown conditions, variable payments, mixed same-zone payments and trailing clauses',()=>{
  for(const line of [
    "You may exile a blue card with mana value X from your hand rather than pay this spell's mana cost.",
    "You may discard an Island card and another card rather than pay this spell's mana cost.",
    "You may exile the top three black cards of your graveyard rather than pay this spell's mana cost.",
    "You may pay {X} rather than pay this spell's mana cost.",
    "You may pay {R}{G} rather than pay this spell's mana cost. Spend only mana produced by Treasures to cast it this way.",
    "If an opponent blinked this turn, you may pay {0} rather than pay this spell's mana cost.",
    "You may discard a card and exile a blue card from your hand rather than pay this spell's mana cost.",
    "You may sacrifice a creature and return a land you control to its owner's hand rather than pay this spell's mana cost.",
  ])assert.equal(modifierOperation({layout:'normal'},line,{condition:()=>null}),null,line);
});
