import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';

const MTG=fixtureEngine([
  ['V8 Black Tax','Black spells you cast cost {B} more to cast.'],
  ['V8 Opponent Tax','Spells your opponents cast cost {2} more to cast.','Artifact'],
  ['V8 Everyone Discount','Spells cost {1} less to cast.','Artifact'],
  ['V8 Union Banner','Elf spells and Wizard spells you cast cost {1} less to cast.'],
  ['V8 Night Discount','During turns other than yours, spells you cast cost {1} less to cast.'],
  ['V8 Grave Discount','Spells you cast from your graveyard cost {1} less to cast.'],
  ['V8 Large Discount','Instant and sorcery spells you cast with mana value 5 or greater cost {1} less to cast.'],
  ['V8 Historic Discount','Historic spells you cast cost {1} less to cast.'],
  ['V8 Counter Discount','Creature spells you cast cost {1} less to cast for each +1/+1 counter on V8 Counter Discount.'],
  ['V8 Nonartifact Tax','Nonartifact spells cost {1} more to cast.'],
  ['V8 Black Spell','Draw a card.','Instant','{1}{B}'],
  ['V8 Green Spell','Draw a card.','Instant','{1}{G}'],
  ['V8 Large Spell','Draw a card.','Instant','{4}{U}'],
  ['V8 Grave Spell','Draw a card.\nFlashback {3}{U}','Instant','{2}{U}'],
  ['V8 Elf Spell','Draw a card.','Kindred Instant — Elf','{1}{G}'],
  ['V8 Wizard Elf','','Creature — Elf Wizard','{3}{G}'],
  ['V8 Blank Artifact','','Artifact','{3}'],
]);

async function cast(ctx,card,pool,opts={}){
  const p=card.owner;p.pool={W:0,U:0,B:0,R:0,G:0,C:0,...pool};
  assert.equal(await ctx.game.castSpell(p,card,{from:card.zone,alt:opts}),true);
  const so=ctx.game.stack.at(-1);assert.equal(so.card,card);await settle(ctx.game);return so;
}

for(const role of ['human','ai']){
  test(`v8 ${role}: colored increases require the exact extra color and do not tax another player`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;put(MTG,game,a,'V8 Black Tax');
    const own=put(MTG,game,a,'V8 Black Spell','hand'),enemy=put(MTG,game,b,'V8 Black Spell','hand');
    assert.deepEqual(Array.from(game.spellCost(a,own).pips,pip=>Array.from(pip)),[['B'],['B']]);assert.deepEqual(Array.from(game.spellCost(b,enemy).pips,pip=>Array.from(pip)),[['B']]);
    a.pool={C:2,B:1};assert.equal(game.canPayMana(a,game.spellCost(a,own),{card:own}),false);
    const before=a.hand.length;await cast(ctx,own,{C:1,B:2});assert.equal(a.pool.B,0);assert.equal(a.pool.C,0);assert.equal(a.hand.length,before);
  });
  test(`v8 ${role}: universal increases and reductions combine, and suppressed or departed sources stop applying`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,tax=put(MTG,game,b,'V8 Opponent Tax');put(MTG,game,a,'V8 Everyone Discount');
    const card=put(MTG,game,a,'V8 Black Spell','hand');assert.equal(game.spellCost(a,card).generic,2);
    game.untilEffects.push({expires:'eot',apply:()=>{tax.cur.abilitiesDisabled=true;}});game.recalc();assert.equal(game.spellCost(a,card).generic,0);
    game.untilEffects=[];game.recalc();assert.equal(game.spellCost(a,card).generic,2);
    await game.move(tax,'graveyard');assert.equal(game.spellCost(a,card).generic,0);
    await cast(ctx,card,{B:1});assert.equal(a.pool.B,0);
  });
  test(`v8 ${role}: a subtype union applies once and includes noncreature Kindred spells`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;put(MTG,game,a,'V8 Union Banner');
    const elf=put(MTG,game,a,'V8 Elf Spell','hand'),both=put(MTG,game,a,'V8 Wizard Elf','hand'),ordinary=put(MTG,game,a,'V8 Green Spell','hand');
    assert.equal(game.spellCost(a,elf).generic,0);assert.equal(game.spellCost(a,both).generic,2);assert.equal(game.spellCost(a,ordinary).generic,1);
    await cast(ctx,elf,{G:1});assert.equal(a.pool.G,0);
    await cast(ctx,both,{C:2,G:1});assert.equal(both.zone,'battlefield');assert.equal(a.pool.C,0);
  });
  test(`v8 ${role}: turn restrictions follow the source controller, including a control change`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,discount=put(MTG,game,a,'V8 Night Discount'),card=put(MTG,game,a,'V8 Green Spell','hand');
    assert.equal(game.spellCost(a,card).generic,1);game.turnPlayer=b;assert.equal(game.spellCost(a,card).generic,0);
    await cast(ctx,card,{G:1});assert.equal(a.pool.G,0);
    discount.ctrl=b;game.recalc();const next=put(MTG,game,b,'V8 Green Spell','hand');assert.equal(game.spellCost(b,next).generic,1);
    game.turnPlayer=a;assert.equal(game.spellCost(b,next).generic,0);
  });
  test(`v8 ${role}: a graveyard discount applies to actual flashback payment and preserves exile on resolution`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;put(MTG,game,a,'V8 Grave Discount');
    const card=put(MTG,game,a,'V8 Grave Spell','hand');assert.equal(game.spellCost(a,card).generic,2);
    await game.move(card,'graveyard');const opts={flashback:true,altCostStr:'{3}{U}'};assert.equal(game.spellCost(a,card,opts).generic,2);
    await cast(ctx,card,{C:2,U:1},opts);assert.equal(card.zone,'exile');assert.equal(a.pool.C,0);
  });
  test(`v8 ${role}: mana-value thresholds inspect spell characteristics and preserve the colored pip`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;put(MTG,game,a,'V8 Large Discount');
    const large=put(MTG,game,a,'V8 Large Spell','hand'),small=put(MTG,game,a,'V8 Green Spell','hand');
    assert.equal(game.spellCost(a,large).generic,3);assert.equal(game.spellCost(a,small).generic,1);
    await cast(ctx,large,{C:3,U:1});assert.equal(a.pool.C,0);assert.equal(a.pool.U,0);
  });
  test(`v8 ${role}: live source counters reduce only matching creature costs and never remove a colored requirement`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx,source=put(MTG,game,a,'V8 Counter Discount');
    game.addCounters(source,'+1/+1',2,false,a);const creature=put(MTG,game,a,'V8 Wizard Elf','hand'),spell=put(MTG,game,a,'V8 Green Spell','hand');
    assert.equal(game.spellCost(a,creature).generic,1);assert.equal(game.spellCost(a,spell).generic,1);
    game.addCounters(source,'+1/+1',3,false,a);assert.equal(game.spellCost(a,creature).generic,0);assert.deepEqual(Array.from(game.spellCost(a,creature).pips,pip=>Array.from(pip)),[['G']]);
    await cast(ctx,creature,{G:1});assert.equal(creature.zone,'battlefield');assert.equal(a.pool.G,0);
  });
  test(`v8 ${role}: historic and nonartifact predicates include exactly their printed spell sets`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;put(MTG,game,a,'V8 Historic Discount');put(MTG,game,a,'V8 Nonartifact Tax');
    const artifact=put(MTG,game,a,'V8 Blank Artifact','hand'),ordinary=put(MTG,game,a,'V8 Green Spell','hand');
    assert.equal(game.spellCost(a,artifact).generic,2);assert.equal(game.spellCost(a,ordinary).generic,2);
    await cast(ctx,artifact,{C:2});assert.equal(artifact.zone,'battlefield');assert.equal(a.pool.C,0);
  });
}

test('v8 costs reject unknown conditions, target relationships and partial colored-reduction models',()=>{
  const card={name:'Unknown Tax',layout:'normal',type_line:'Creature',power:'1',toughness:'1',mana_cost:'{G}'};
  for(const oracle_text of ['Spells you cast cost {1} less to cast if you can see tomorrow.','Spells you cast cost {B} less to cast.','Creature spells you cast cost {X} less to cast, where X is the power of the sacrificed creature.','Elf spells and Wizard spells you cast cost {1} less to cast except on Tuesdays.'])assert.equal(semanticClass({...card,oracle_text}).semanticClass,undefined,oracle_text);
});
