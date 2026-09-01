import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,paidCast,settle} from './helpers/oracle-v8-fixtures.mjs';

const MTG=fixtureEngine([
  ['V8 Color Return',"Return target red, white, or black creature card from your graveyard to your hand.",'Instant'],
  ['V8 Damaged Only','Destroy target creature that was dealt damage this turn.','Instant'],
  ['V8 Grave Spell','Counter target spell cast from a graveyard.','Instant'],
  ['V8 Event Owner',"Whenever this creature deals combat damage to a player, return target creature that player controls to its owner's hand."],
  ['V8 Red Creature','','Creature — Bear','{R}'],
  ['V8 White Creature','','Creature — Bear','{W}'],
  ['V8 Black Creature','','Creature — Bear','{B}'],
  ['V8 Blue Creature','','Creature — Bear','{U}'],
  ['V8 Red Artifact','','Artifact','{R}'],
  ['V8 Grave Draw','Draw a card.\nFlashback {1}{G}','Instant'],
  ['V8 Exact X Counter','Counter target spell with mana value X.','Instant','{X}{G}'],
  ['V8 Bounded X Counter','Counter target spell with mana value X or less.','Instant','{X}{G}'],
  ['V8 Single Opponent Count','If an opponent controls two or more creatures, draw a card.','Instant','{G}'],
  ['V8 Exact X Counter Ability','{X}, {T}: Put a +1/+1 counter on target creature with power X.','Artifact','{2}'],
  ['V8 Faerie Counter','Flash\nWhen this creature enters, counter target spell with mana value X or less, where X is the number of Faeries you control.','Creature — Faerie','{G}'],
  ['V8 Quiet Faerie','','Creature — Faerie','{G}'],
  ['V8 Two Spell','Draw a card.','Instant','{2}'],
  ['V8 Three Spell','Draw a card.','Instant','{3}'],
  ['V8 Group Event Owner','Whenever this creature deals combat damage to a player, it deals 1 damage to each creature that player controls.'],
  ['V8 Reflexive Event Owner','Whenever this creature deals combat damage to a player, you may discard a creature card. When you do, destroy target creature that player controls.'],
]);

for(const role of ['human','ai']){
  test(`v8 ${role}: X is announced before a spell target and binds only that Stack object`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    for(const name of ['V8 Two Spell','V8 Three Spell']){const card=put(MTG,game,b,name,'hand');b.pool.C=10;assert.equal(await game.castSpell(b,card,{from:'hand'}),true);}
    const counter=put(MTG,game,a,'V8 Exact X Counter','hand');a.pool.G=1;a.pool.C=20;
    if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseX'?3:decide(g,q);}
    assert.equal(await game.castSpell(a,counter,{from:'hand'}),true);
    const so=game.stack.at(-1);assert.equal(so.x,3);assert.equal(so.targets[0].card.name,'V8 Three Spell');
    assert.equal(a.pool.C,17,'extra affordable mana does not make the bot choose an impossible exact-X target');
    assert.equal(so.targetSpecs[0].filter(game,game.stack[0],a,counter),false);
    const before=b.library.length;await settle(game);assert.equal(b.library.length,before-1,'only the two-mana spell resolves');
  });
  test(`v8 ${role}: an opponent count means one opponent, not their combined battlefield`,async()=>{
    const ctx=context(MTG,role,2),{game,a,b,others}=ctx,c=others[1];
    put(MTG,game,b,'V8 Red Creature');put(MTG,game,c,'V8 White Creature');
    let before=a.library.length;await paidCast(MTG,ctx,'V8 Single Opponent Count');assert.equal(a.library.length,before);
    const second=put(MTG,game,c,'V8 Blue Creature');
    before=a.library.length;await paidCast(MTG,ctx,'V8 Single Opponent Count');assert.equal(a.library.length,before-1);
    const spell=put(MTG,game,a,'V8 Single Opponent Count','hand');a.pool.G=1;
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await game.move(second,'hand');
    before=a.library.length;await settle(game);assert.equal(a.library.length,before,'resolution uses the current count for each opponent');
  });
  test(`v8 ${role}: repeated X activations keep independent thresholds and pay the announced mana`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx,source=put(MTG,game,a,'V8 Exact X Counter Ability');
    const three=put(MTG,game,a,'V8 Red Creature'),one=put(MTG,game,a,'V8 White Creature');
    three.def={...three.def,power:'3'};one.def={...one.def,power:'1'};game.recalc();
    let chosen=3;
    if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseX'?chosen:decide(g,q);}
    a.pool.C=3;let action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);
    const first=game.stack.at(-1);assert.equal(first.ctx.x,3);assert.equal(first.targets[0],three);assert.equal(a.pool.C,0);
    game.untap(source);chosen=1;a.pool.C=1;action=game.activatableList(a).find(row=>row.card===source);assert.equal(await game.activateAbility(a,action),true);
    const second=game.stack.at(-1);assert.equal(second.ctx.x,1);assert.equal(second.targets[0],one);assert.equal(a.pool.C,0);
    assert.equal(first.targetSpecs[0].filter(game,three,a,source),true);assert.equal(first.targetSpecs[0].filter(game,one,a,source),false);
    await settle(game);assert.equal(one.counters['+1/+1'],1);assert.equal(three.counters['+1/+1'],1);
  });
  test(`v8 ${role}: a defined target threshold rechecks its live permanent count`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,faerie=put(MTG,game,a,'V8 Quiet Faerie');
    const victim=put(MTG,game,b,'V8 Two Spell','hand');b.pool.C=2;assert.equal(await game.castSpell(b,victim,{from:'hand'}),true);
    const source=put(MTG,game,a,'V8 Faerie Counter','hand');a.pool.G=1;assert.equal(await game.castSpell(a,source,{from:'hand'}),true);
    await game.resolveTop();await game.flushTriggers();const trigger=game.stack.at(-1);assert.equal(trigger.kind,'trigger');assert.equal(trigger.targets[0].card,victim);
    await game.move(faerie,'hand');const before=b.library.length;await settle(game);assert.equal(b.library.length,before-1,'target is no longer within the live Faerie count');
  });
  test(`v8 ${role}: group effects and reflexive targets retain the damaged player in a three-player game`,async()=>{
    for(const name of ['V8 Group Event Owner','V8 Reflexive Event Owner']){
      const ctx=context(MTG,role,2),{game,a,b,others}=ctx,c=others[1];
      const own=put(MTG,game,a,'V8 White Creature'),victim=put(MTG,game,b,'V8 Red Creature'),other=put(MTG,game,c,'V8 Blue Creature');
      const cost=put(MTG,game,a,'V8 Black Creature','hand'),source=await paidCast(MTG,ctx,name);
      source.attacking=b;source.blockedBy=[];source.wasBlocked=false;game.combat={attackers:[source],defenders:new Map()};
      await game.combatDamage(a,'normal');await game.flushTriggers();
      if(name==='V8 Reflexive Event Owner'){
        await game.resolveTop();await game.flushTriggers();const reflexive=game.stack.at(-1);
        assert.ok(reflexive.oracleReflexive);assert.equal(reflexive.targets[0],victim);assert.equal(cost.zone,'graveyard');
      }
      await settle(game);
      if(name==='V8 Group Event Owner'){assert.equal(victim.damage,1);assert.equal(own.damage,0);assert.equal(other.damage,0);}
      else{assert.equal(victim.zone,'graveyard');assert.equal(own.zone,'battlefield');assert.equal(other.zone,'battlefield');}
    }
  });
  test(`v8 ${role}: color alternatives retain the shared creature and graveyard restrictions`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;
    const allowed=['V8 Red Creature','V8 White Creature','V8 Black Creature'].map(name=>put(MTG,game,a,name,'graveyard'));
    const blue=put(MTG,game,a,'V8 Blue Creature','graveyard'),artifact=put(MTG,game,a,'V8 Red Artifact','graveyard');
    await paidCast(MTG,ctx,'V8 Color Return');
    const choice=ctx.trace.find(row=>row.q.type==='chooseTargets');assert.ok(choice);
    assert.deepEqual(new Set(choice.q.candidates),new Set(allowed));
    const chosen=[choice.result].flat();assert.equal(chosen.length,1);assert.equal(chosen[0].zone,'hand');
    assert.equal(blue.zone,'graveyard');assert.equal(artifact.zone,'graveyard');
  });
  test(`v8 ${role}: damage qualification survives regeneration but not a zone change`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    const victim=put(MTG,game,b,'V8 Red Creature'),unhurt=put(MTG,game,b,'V8 White Creature');
    assert.equal(await game.damageAny(unhurt,victim,1),1);
    victim.regenShield=1;await game.destroy(victim);assert.equal(victim.zone,'battlefield');assert.equal(victim.damage,0);
    const source=put(MTG,game,a,'V8 Damaged Only','hand');a.pool.G=2;
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);
    const choice=ctx.trace.find(row=>row.q.type==='chooseTargets');assert.deepEqual(Array.from(choice.q.candidates),[victim]);
    await game.move(victim,'exile');await game.move(victim,'battlefield',{ctrl:b});
    await settle(game);assert.equal(victim.zone,'battlefield');assert.equal(unhurt.zone,'battlefield');
    assert.equal(source.def.targets[0].filter(game,victim,a,source),false,'a returned object has no earlier damage history');
  });
  test(`v8 ${role}: a graveyard-only counter uses the spell's actual casting zone`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;game.turnPlayer=b;b.pool.G=3;b.pool.C=3;
    const grave=put(MTG,game,b,'V8 Grave Draw','graveyard');
    const cast=game.castableList(b).find(row=>row.card===grave&&row.from==='graveyard');assert.ok(cast);
    assert.equal(await game.castSpell(b,grave,{from:cast.from,alt:cast.alt}),true);
    const ordinary=put(MTG,game,b,'V8 Grave Draw','hand');assert.equal(await game.castSpell(b,ordinary,{from:'hand'}),true);
    const counter=put(MTG,game,a,'V8 Grave Spell','hand');a.pool.G=1;
    assert.equal(await game.castSpell(a,counter,{from:'hand'}),true);
    const choice=ctx.trace.find(row=>row.q.type==='chooseTargets');assert.equal(choice.q.candidates.length,1);assert.equal(choice.q.candidates[0].card,grave);
    await game.resolveTop();assert.equal(grave.zone,'exile');assert.ok(game.stack.some(row=>row.card===ordinary));
    await settle(game);assert.equal(ordinary.zone,'graveyard');
  });
  test(`v8 ${role}: that-player targets bind to the damaged opponent and recheck control`,async()=>{
    const ctx=context(MTG,role,2),{game,a,b,others}=ctx,c=others[1];
    const own=put(MTG,game,a,'V8 White Creature'),victim=put(MTG,game,b,'V8 Red Creature'),other=put(MTG,game,c,'V8 Blue Creature');
    const source=await paidCast(MTG,ctx,'V8 Event Owner');source.attacking=b;source.blockedBy=[];source.wasBlocked=false;game.combat={attackers:[source],defenders:new Map()};
    await game.combatDamage(a,'normal');await game.flushTriggers();
    const trigger=game.stack.find(row=>row.srcCard===source);assert.ok(trigger);assert.equal(trigger.ctrl,a);assert.equal(trigger.targets[0],victim);
    MTG.OracleV8Control.gain(game,victim,c);game.recalc();await settle(game);
    assert.equal(victim.zone,'battlefield');assert.equal(victim.ctrl,c);assert.equal(own.zone,'battlefield');assert.equal(other.zone,'battlefield');
    const next=put(MTG,game,b,'V8 Black Creature');source.attacking=b;game.combat={attackers:[source],defenders:new Map()};
    await game.combatDamage(a,'normal');await settle(game);assert.equal(next.zone,'hand');
  });
}
test('v8 target grammar rejects unbound event owners and unknown temporal restrictions',()=>{
  for(const oracle_text of ["Return target creature that player controls to its owner's hand.",'Destroy target creature that might be dealt damage next turn.']){
    assert.equal(semanticClass({name:'V8 Unbound Target',type_line:'Instant',layout:'normal',mana_cost:'{G}',oracle_text}).semanticClass,undefined);
  }
});

test('v8 preferred X choices do not restrict a human from legally overpaying X',async()=>{
  const ctx=context(MTG,'human'),{game,a,b}=ctx;
  const target=put(MTG,game,b,'V8 Two Spell','hand');b.pool.C=2;
  assert.equal(await game.castSpell(b,target,{from:'hand'}),true);
  const counter=put(MTG,game,a,'V8 Bounded X Counter','hand');a.pool.G=1;a.pool.C=19;
  const decide=a.controller.decide.bind(a.controller);
  a.controller.decide=(g,q)=>q.type==='chooseX'?17:decide(g,q);
  assert.equal(await game.castSpell(a,counter,{from:'hand'}),true);
  assert.equal(game.stack.at(-1).x,17);assert.equal(a.pool.C,2);
  await settle(game);assert.equal(target.zone,'graveyard');
});
