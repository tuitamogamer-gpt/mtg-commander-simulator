import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { extensionCost, extensionTarget } from '../scripts/oracle-extensions-v8.mjs';
import { fixtureEngine,context,put,paidCast,settle } from './helpers/oracle-v8-fixtures.mjs';

const MTG=fixtureEngine([
  ['V8 Keep Watch','Draw a card for each attacking creature.','Instant'],
  ['V8 Equipment Count','This creature gets +2/+0 for each Equipment attached to it.'],
  ['V8 Opponent Island','This creature gets +1/+1 as long as an opponent controls an Island.'],
  ['V8 Poison Count','This creature gets +1/+1 for each poison counter your opponents have.'],
  ['V8 Distinct Power','Draw a card for each different power among creatures you control.','Sorcery'],
  ['V8 Idle Bonus',"This creature gets +2/+0 as long as it isn't attacking or blocking."],
  ['V8 Counter Filter','Destroy target creature with no +1/+1 counters on it.','Instant'],
  ['V8 Relative Life','This creature gets +1/+1 as long as you have at least 5 life more than your starting life total.'],
  ['V8 Higher Life','This creature has flying as long as your life total is greater than your starting life total.'],
  ['V8 All Opponents','This creature gets +1/+1 as long as you control more creatures than each opponent.'],
  ['V8 Any Opponent','This creature gets +1/+1 as long as an opponent controls more creatures than you.'],
  ['V8 Ascend Permanent',"Ascend\nThis creature gets +1/+1 as long as you have the city's blessing."],
  ['V8 Ascend Spell',"Ascend\nIf you have the city's blessing, draw two cards.",'Sorcery'],
  ['V8 Revenant',"When this creature dies, put it on top of its owner's library."],
]);

for(const role of ['human','ai']){
  test(`v8 ${role}: a death return moves its graveyard object to its owner's library and rejects a new incarnation`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,source=await paidCast(MTG,ctx,'V8 Revenant');
    source.ctrl=b;game.recalc();await game.move(source,'graveyard');await settle(game);
    assert.equal(source.zone,'library');assert.equal(a.library.at(-1),source);assert.ok(!b.library.includes(source));
    await game.move(source,'battlefield',{ctrl:a});await game.move(source,'graveyard');await game.flushTriggers();
    await game.move(source,'exile');await game.move(source,'graveyard');await settle(game);assert.equal(source.zone,'graveyard');
  });
  test(`v8 ${role}: life thresholds use the configured starting life and update during resolution`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;a.startingLife=20;a.life=20;
    const source=await paidCast(MTG,ctx,'V8 Relative Life'),flying=await paidCast(MTG,ctx,'V8 Higher Life');
    assert.equal(source.power,2);assert.equal(flying.kw('flying'),false);
    await game.gainLife(a,4);assert.equal(source.power,2);assert.equal(flying.kw('flying'),true);
    await game.gainLife(a,1);assert.equal(source.power,3);
    await game.loseLife(a,1);assert.equal(source.power,2);
  });
  test(`v8 ${role}: each-opponent and any-opponent comparisons use different multiplayer quantifiers`,async()=>{
    const ctx=context(MTG,role,2),{game,a,b,others}=ctx;
    const all=await paidCast(MTG,ctx,'V8 All Opponents'),any=await paidCast(MTG,ctx,'V8 Any Opponent');
    assert.equal(all.power,3);assert.equal(any.power,2);
    for(let n=0;n<3;n++)put(MTG,game,others[1],'Grizzly Bears');
    assert.equal(all.power,2);assert.equal(any.power,3);
    for(const card of game.creatures(others[1]))card.ctrl=b;game.recalc();
    assert.equal(all.power,2);assert.equal(any.power,3);
    for(let n=0;n<2;n++)put(MTG,game,a,'Grizzly Bears');
    assert.equal(all.power,3);assert.equal(any.power,2);
  });
  test(`v8 ${role}: permanent ascend grants at ten, affects its own static ability immediately, and persists`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;
    const source=await paidCast(MTG,ctx,'V8 Ascend Permanent');
    for(let n=0;n<8;n++)put(MTG,game,a,'Forest');
    assert.equal(a.cityBlessing,false);assert.equal(source.power,2);
    put(MTG,game,a,'Forest');assert.equal(a.cityBlessing,true);assert.equal(source.power,3);
    await game.move(source,'exile');for(const card of game.bf().slice())await game.move(card,'hand');
    assert.equal(a.cityBlessing,true);await game.move(source,'battlefield',{ctrl:a});assert.equal(source.power,3);
  });
  test(`v8 ${role}: spell ascend checks ten at resolution and does not count the spell on the stack`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;
    for(let n=0;n<9;n++)put(MTG,game,a,'Forest');
    const before=a.library.length;await paidCast(MTG,ctx,'V8 Ascend Spell');assert.equal(a.cityBlessing,false);assert.equal(a.library.length,before);
    const spell=put(MTG,game,a,'V8 Ascend Spell','hand');a.pool.G++;
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);put(MTG,game,a,'Forest');assert.equal(a.cityBlessing,false);
    await settle(game);assert.equal(a.cityBlessing,true);assert.equal(a.library.length,before-2);
  });
  test(`v8 ${role}: a suppressed ascend ability does not grant the blessing`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx,source=await paidCast(MTG,ctx,'V8 Ascend Permanent');
    const suppression={apply:(g,bf)=>{if(bf.includes(source))source.cur.abilitiesDisabled=true;}};game.untilEffects.push(suppression);
    for(let n=0;n<9;n++)put(MTG,game,a,'Forest');assert.equal(source.cur.abilitiesDisabled,true);assert.equal(a.cityBlessing,false);
    game.untilEffects.splice(game.untilEffects.indexOf(suppression),1);game.recalc();assert.equal(a.cityBlessing,true);
  });
  test(`v8 ${role}: singular attacking count includes both controllers and excludes nonattackers`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    const first=put(MTG,game,a,'Grizzly Bears'),second=put(MTG,game,b,'Grizzly Bears');
    first.attacking=b;second.attacking=a;put(MTG,game,a,'Grizzly Bears');
    const before=a.library.length;await paidCast(MTG,ctx,'V8 Keep Watch');assert.equal(a.library.length,before-2);
  });
  test(`v8 ${role}: attachment count tracks exact host and actual attachment removal`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx,source=await paidCast(MTG,ctx,'V8 Equipment Count');
    const other=put(MTG,game,a,'Grizzly Bears'),first=put(MTG,game,a,'Lightning Greaves'),second=put(MTG,game,a,'Swiftfoot Boots');
    game.attach(first,source);game.attach(second,other);game.recalc();assert.equal(source.power,4);
    game.attach(second,source);game.recalc();assert.equal(source.power,6);
    await game.move(first,'graveyard');game.recalc();assert.equal(source.power,4);
  });
  test(`v8 ${role}: opponent condition ignores own Island and updates on control change`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,source=await paidCast(MTG,ctx,'V8 Opponent Island');
    const island=put(MTG,game,a,'Island');assert.equal(source.power,2);
    island.ctrl=b;game.recalc();assert.equal(source.power,3);
    await game.move(island,'hand');game.recalc();assert.equal(source.power,2);
  });
  test(`v8 ${role}: poison multiplier sums current opponents and excludes eliminated players`,async()=>{
    const ctx=context(MTG,role,2),{game,a,b,others}=ctx;
    a.poison=7;b.poison=2;others[1].poison=3;
    const source=await paidCast(MTG,ctx,'V8 Poison Count');assert.equal(source.power,7);
    others[1].lost=true;game.recalc();assert.equal(source.power,4);
  });
  test(`v8 ${role}: distinct power counts equal values once and reads changed values`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    put(MTG,game,a,'Grizzly Bears');const changed=put(MTG,game,a,'Grizzly Bears');put(MTG,game,b,'Grizzly Bears');
    game.addCounters(changed,'+1/+1',1);const before=a.library.length;
    await paidCast(MTG,ctx,'V8 Distinct Power');assert.equal(a.library.length,before-2);
  });
  test(`v8 ${role}: source status distinguishes idle, attacker and blocker`,async()=>{
    const ctx=context(MTG,role),{game,b}=ctx,source=await paidCast(MTG,ctx,'V8 Idle Bonus');
    assert.equal(source.power,4);source.attacking=b;game.recalc();assert.equal(source.power,2);
    source.attacking=null;source.blocking='an-attacker';game.recalc();assert.equal(source.power,2);
    source.blocking=null;game.recalc();assert.equal(source.power,4);
  });
  test(`v8 ${role}: a no-counter target rechecks before resolution`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,bear=put(MTG,game,b,'Grizzly Bears');
    const spell=put(MTG,game,a,'V8 Counter Filter','hand');a.pool.G=1;
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);assert.equal(game.stack.at(-1).targets[0],bear);
    game.addCounters(bear,'+1/+1',1);await game.resolveTop();assert.equal(bear.zone,'battlefield');
  });
}

test('v8 exact cost/target leaves reject unknown suffixes and duplicate components',()=>{
  assert.deepEqual(extensionCost('{1}{G}, {T}, Pay 2 life'),{mana:'{1}{G}',tap:true,life:2});
  assert.equal(extensionCost('{T}, {T}'),null);
  assert.equal(extensionCost('{G}, Ignore restrictions'),null);
  assert.equal(extensionTarget('target creature with no +1/+1 counters and do anything else'),null);
  const card={name:'V8 Unknown',layout:'normal',mana_cost:'{G}',type_line:'Creature',power:'2',toughness:'3',oracle_text:'This creature gets +2/+0 for each invented undefined thing.'};
  assert.equal(semanticClass(card).semanticClass,undefined);
});
