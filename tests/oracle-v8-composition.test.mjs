import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,paidCast,settle} from './helpers/oracle-v8-fixtures.mjs';

const MTG=fixtureEngine([
  ['V8 Twice Explorer','When this creature enters, it explores, then it explores again.'],
  ['V8 X Explorer','When this creature enters, it explores X times.','Creature — Merfolk','{X}{G}'],
  ['V8 Quiet Creature','','Creature — Bear','{G}'],
  ['V8 Choice Untap','Untap up to three lands.','Instant'],
  ['V8 Choice Tap','Tap up to two creatures.','Instant'],
  ['V8 Choice Bounce',"Return up to two lands you control to their owner's hand.",'Instant'],
  ['V8 Exact Twin Pump','Two target creatures you control each get +1/+1 until end of turn.','Instant'],
  ['V8 Range Disable',"Up to three target creatures can't block this turn.",'Instant'],
  ['V8 Offset Group Stun','Target player draws two cards. Tap two target creatures. Put a stun counter on each of them.','Sorcery'],
  ['V8 Union Group Stun','Tap up to two target artifacts and/or creatures. Put two stun counters on each of them.','Sorcery'],
  ['V8 Group Goad',"Up to three target creatures can't block this turn. Goad them.",'Sorcery'],
  ['V8 Rat Out',"Up to one target creature gets -1/-1 until end of turn. You create a 1/1 black Rat creature token with \"This token can't block.\"",'Instant'],
  ['V8 Transmute Spell','Counter target instant or sorcery spell.\nTransmute {1}{U}{U}','Instant','{U}{U}'],
  ['V8 Incubate','Incubate 4.','Sorcery'],
  ['V8 Life Ward','Ward—Pay 3 life.','Creature — Bear','{G}'],
  ['V8 Discard Ward','Ward—Discard a card.','Creature — Bear','{G}'],
  ['V8 Ward Removal','Destroy target creature.','Instant','{B}'],
  ['V8 Named Ember','{T}: V8 Named Ember deals 2 damage to any target.','Creature — Wizard','{1}{G}'],
  ['V8 Nonbasic Land','{T}: Add {G}.','Land',''],
  ['V8 Food Count','Create a number of Food tokens equal to the number of opponents you have.','Sorcery'],
  ['V8 Flying Count','Create a number of 1/1 green Bird creature tokens with flying equal to your devotion to green.','Sorcery'],
  ['V8 Victim Count','V8 Victim Count deals damage to target opponent equal to the number of nonbasic lands that player controls.','Instant'],
  ['V8 Event Count','Whenever this creature deals combat damage to a player, draw cards equal to the number of creatures that player controls.'],
  ['V8 Opponent Walker','V8 Opponent Walker deals 1 damage to target opponent or planeswalker.','Instant'],
  ['V8 Named Tally','{T}: Draw cards equal to the number of charge counters on V8 Named Tally.','Artifact'],
  ['V8 X Gate','When this creature enters, if X is 3 or more, draw a card.','Creature — Bear','{X}{G}'],
  ['V8 Origin Gate','Flashback {1}{U}\nIf this spell was cast from your graveyard, draw two cards.','Sorcery','{1}{U}'],
  ['V8 Mana Gate','When this creature enters, if 5 or more mana was spent to cast this spell, draw a card.','Creature — Bear','{4}{G}'],
  ['V8 Nonland Gate','When this creature enters, if two or more nonland permanents entered the battlefield under your control this turn, draw a card.'],
  ['V8 Another Gate','When this creature enters, if another creature entered the battlefield under your control this turn, draw a card.'],
  ['V8 Descend Gate','At the beginning of your end step, if you descended this turn, draw a card.'],
  ['V8 Quality Cast Gate','At the beginning of your end step, if you have cast an instant or sorcery spell this turn, draw a card.'],
  ['V8 Lesson Gate',"When this creature enters, if there's a Lesson card in your graveyard, draw a card."],
  ['V8 Lesson Card','Draw a card.','Sorcery — Lesson','{1}'],
]);

for(const role of ['human','ai']){
  test(`v8 ${role}: repeated explore reveals and moves two real lands in order`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx,original=a.library.slice(-2),hand=a.hand.length;
    const events=[],emit=game.emit;game.emit=async function(name,data){if(name==='explored')events.push(data);return emit.call(this,name,data);};
    const source=await paidCast(MTG,ctx,'V8 Twice Explorer');
    assert.equal(a.hand.length,hand+2);assert.ok(original.every(card=>card.zone==='hand'));
    assert.equal(source.counters['+1/+1']||0,0);assert.equal(events.length,2);
    assert.ok(events.every(event=>event.card===source&&event.player===a));
  });
  test(`v8 ${role}: X explore still adds counters with an empty library`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;
    for(const card of a.library.splice(0)){card.zone='graveyard';a.graveyard.push(card);}
    const source=put(MTG,game,a,'V8 X Explorer','hand');a.pool.G=1;a.pool.C=3;
    if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseX'?3:decide(g,q);}
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.equal(game.stack.at(-1).x,3);
    await settle(game);assert.equal(source.counters['+1/+1'],3);assert.equal(a.library.length,0);assert.equal(a.lost,false);
  });
  test(`v8 ${role}: an old explore trigger uses its departed object's controller and cannot counter its new incarnation`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,source=put(MTG,game,a,'V8 Twice Explorer','hand');a.pool.G=1;
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await game.resolveTop();await game.flushTriggers();
    const original=game.stack.at(-1),oldVersion=source.zoneVersion;
    await game.move(source,'hand');await game.move(source,'battlefield',{ctrl:b});await game.flushTriggers();
    const returned=game.stack.at(-1);assert.notEqual(returned,original);
    await game.counterStackObject(returned,{ignoreUncounterable:true});
    game.addCounters(source,'+1/+1',7,false,b);
    const handA=a.hand.length,handB=b.hand.length;await settle(game);
    assert.notEqual(source.zoneVersion,oldVersion);assert.equal(source.ctrl,b);assert.equal(source.counters['+1/+1'],7);
    assert.equal(a.hand.length,handA+2);assert.equal(b.hand.length,handB);
  });
  test(`v8 ${role}: nontargeted untap includes shroud, consumes one stun, and observes simultaneous results`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    const own=[0,1,2].map(()=>put(MTG,game,a,'Forest')),other=put(MTG,game,b,'Forest');
    own[0].def={...own[0].def,kws:['shroud']};for(const card of [...own,other])card.tapped=true;
    game.addCounters(own[2],'stun',2,false,a);
    if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.type==='chooseCards'&&q.prompt==='Choose permanents to untap'){ctx.trace.push({q,result:own});return own;}return decide(g,q);};}
    const observations=[],emit=game.emit;game.emit=async function(name,data){if(name==='becameUntapped')observations.push(own.map(card=>card.tapped));return emit.call(this,name,data);};
    await paidCast(MTG,ctx,'V8 Choice Untap');
    assert.equal(own[0].kw('shroud'),true);assert.deepEqual(own.map(card=>card.tapped),[false,false,true]);
    assert.equal(own[2].counters.stun,1);assert.equal(other.tapped,true);
    assert.ok(observations.every(states=>states[0]===false&&states[1]===false&&states[2]===true));
    const choice=ctx.trace.find(row=>row.q.prompt==='Choose permanents to untap');assert.ok(choice);assert.equal(choice.q.type,'chooseCards');
    assert.ok(!ctx.trace.some(row=>row.q.type==='chooseTargets'));
  });
  test(`v8 ${role}: permanent choices respect controller restrictions and may select fewer than the maximum`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    const own=[put(MTG,game,a,'Forest'),put(MTG,game,a,'Forest')],other=put(MTG,game,b,'Forest');
    if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>{if(q.type==='chooseCards'&&q.prompt==='Choose permanents to bounce'){const result=[own[0]];ctx.trace.push({q,result});return result;}return decide(g,q);};}
    await paidCast(MTG,ctx,'V8 Choice Bounce');
    const choice=ctx.trace.find(row=>row.q.prompt==='Choose permanents to bounce');assert.ok(choice);
    assert.ok(!choice.q.from.includes(other));assert.ok(choice.result.length<=2);
    for(const card of choice.result)assert.equal(card.zone,'hand');assert.equal(other.zone,'battlefield');
    if(role==='human'){assert.equal(own[0].zone,'hand');assert.equal(own[1].zone,'battlefield');}
  });
  test(`v8 ${role}: bounded target ranges lock the exact announced set and apply the effect to every target`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    const own=[put(MTG,game,a,'V8 Quiet Creature'),put(MTG,game,a,'V8 Quiet Creature')];
    const foreign=put(MTG,game,b,'V8 Quiet Creature');
    const spell=put(MTG,game,a,'V8 Exact Twin Pump','hand');a.pool.G=1;
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);
    const stackObject=game.stack.at(-1),locked=stackObject.targets[0];assert.equal(locked.length,2);
    assert.ok(locked.every(card=>own.includes(card)));assert.ok(!locked.includes(foreign));
    await settle(game);assert.deepEqual(own.map(card=>[card.power,card.toughness]),[[3,4],[3,4]]);
    assert.deepEqual([foreign.power,foreign.toughness],[2,3]);
  });
  test(`v8 ${role}: a printed source name can deal damage to a real any-target choice`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,source=await paidCast(MTG,ctx,'V8 Named Ember');source.sick=false;
    if(role==='human'){
      const decide=a.controller.decide.bind(a.controller);
      a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:decide(g,q);
    }
    const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);
    const before=b.life;assert.equal(await game.activateAbility(a,action),true);await settle(game);
    assert.equal(source.tapped,true);assert.equal(b.life,before-2);
  });
  test(`v8 ${role}: a plural continuation retains its bounded target group after an earlier target`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    const creatures=[put(MTG,game,a,'V8 Quiet Creature'),put(MTG,game,b,'V8 Quiet Creature'),put(MTG,game,b,'V8 Quiet Creature')];
    const spell=put(MTG,game,a,'V8 Offset Group Stun','hand');a.pool.G=1;
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);
    const object=game.stack.at(-1),locked=object.targets[1];assert.equal(locked.length,2);
    assert.ok(locked.every(card=>creatures.includes(card)));
    await settle(game);
    assert.ok(locked.every(card=>card.tapped&&card.counters.stun===1));
    assert.ok(creatures.filter(card=>!locked.includes(card)).every(card=>!card.tapped&&!card.counters.stun));
  });
  test(`v8 ${role}: plural union targets retain both permanent types and every locked continuation`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    const candidates=[put(MTG,game,b,'V8 Quiet Creature'),put(MTG,game,b,'Sol Ring')];
    if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?q.candidates.filter(card=>candidates.includes(card)).slice(0,2):decide(g,q);}
    const spell=put(MTG,game,a,'V8 Union Group Stun','hand');a.pool.G=1;
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);
    const locked=game.stack.at(-1).targets[0];assert.ok(locked.length>0&&locked.length<=2);
    assert.ok(locked.every(card=>candidates.includes(card)));
    await settle(game);assert.ok(locked.every(card=>card.tapped&&card.counters.stun===2));
  });
  test(`v8 ${role}: a plural goad continuation applies to the same announced set`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    const candidates=[0,1,2].map(()=>put(MTG,game,b,'V8 Quiet Creature'));
    if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'?q.candidates.filter(card=>candidates.includes(card)).slice(0,3):decide(g,q);}
    const spell=put(MTG,game,a,'V8 Group Goad','hand');a.pool.G=1;
    assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);
    const locked=game.stack.at(-1).targets[0];assert.ok(locked.length>0&&locked.length<=3);
    assert.ok(locked.every(card=>candidates.includes(card)));
    await settle(game);
    assert.ok(locked.every(card=>card.cur.cantBlock&&game.goadersOf(card).includes(a)));
  });
  test(`v8 ${role}: an explicit-you token keeps its quoted static restriction`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,attacker=put(MTG,game,b,'V8 Quiet Creature');
    await paidCast(MTG,ctx,'V8 Rat Out');
    const rat=game.creatures(a).find(card=>card.hasSub('Rat'));assert.ok(rat);
    assert.equal(game.canBlock(rat,attacker),false);
  });
  test(`v8 ${role}: a spell card exposes transmute from hand with its printed mana value`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;
    const source=put(MTG,game,a,'V8 Transmute Spell','hand'),match=put(MTG,game,a,'Grizzly Bears','library');
    put(MTG,game,a,'V8 Quiet Creature','library');a.pool.C=1;a.pool.U=2;
    if(role==='human'){
      const decide=a.controller.decide.bind(a.controller);
      a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.from?.includes(match)?[match]:decide(g,q);
    }
    const action=game.activatableList(a).find(row=>row.card===source&&row.handAbility);assert.ok(action);
    assert.equal(await game.activateAbility(a,action),true);assert.equal(source.zone,'graveyard');
    await settle(game);assert.equal(match.zone,'hand');assert.equal(a.pool.C,0);assert.equal(a.pool.U,0);
  });
  test(`v8 ${role}: incubate creates the real transformable token with exact counters`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx;await paidCast(MTG,ctx,'V8 Incubate');
    const token=game.bf().find(card=>card.ctrl===a&&card.hasSub('Incubator'));assert.ok(token);
    assert.equal(token.counters['+1/+1'],4);assert.equal(token.is('Creature'),false);
    a.pool.C=2;const action=game.activatableList(a).find(row=>row.card===token);assert.ok(action);
    assert.equal(await game.activateAbility(a,action),true);await settle(game);
    assert.equal(token.is('Creature'),true);assert.equal(token.hasSub('Phyrexian'),true);
    assert.equal(token.power,4);assert.equal(token.toughness,4);
  });
  for(const [wardName,payment] of [['V8 Life Ward','life'],['V8 Discard Ward','discard']])test(`v8 ${role}: ${payment} Ward is a real optional Stack payment`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,ward=put(MTG,game,b,wardName),spell=put(MTG,game,a,'V8 Ward Removal','hand');
    const discard=put(MTG,game,a,'Forest','hand'),decide=a.controller.decide.bind(a.controller);
    if(role==='human')a.controller.decide=(g,q)=>q.type==='chooseTargets'?[ward]:q.type==='chooseOption'&&q.aiHint?.kind==='ward'?'yes':q.type==='chooseCards'&&q.aiHint?.kind==='ward'?[discard]:decide(g,q);
    const life=a.life;a.pool.B=1;assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);await settle(game);
    assert.equal(ward.zone,'graveyard');assert.equal(payment==='life'?a.life:life,payment==='life'?life-3:life);
    assert.equal(discard.zone,payment==='discard'?'graveyard':'hand');
  });
  test(`v8 ${role}: Ward life cannot be paid without the printed amount`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx,ward=put(MTG,game,b,'V8 Life Ward');a.life=2;
    assert.equal(await game.payWard(a,ward,ward.cur.wardCost),false);assert.equal(a.life,2);
  });
  test(`v8 ${role}: variable predefined and flying tokens retain exact count and printed abilities`,async()=>{
    const ctx=context(MTG,role,2),{game,a,others}=ctx;others[1].lost=true;
    await paidCast(MTG,ctx,'V8 Food Count');assert.equal(game.bf().filter(card=>card.hasSub('Food')).length,1);
    put(MTG,game,a,'V8 Quiet Creature');
    await paidCast(MTG,ctx,'V8 Flying Count');const birds=game.creatures(a).filter(card=>card.hasSub('Bird'));
    assert.equal(birds.length,1);assert.ok(birds.every(card=>card.kw('flying')&&card.power===1&&card.toughness===1));
  });
  test(`v8 ${role}: an amount bound to the targeted opponent rechecks that opponent's current board`,async()=>{
    const ctx=context(MTG,role,2),{game,a,b,others}=ctx,c=others[1];
    for(let n=0;n<4;n++)put(MTG,game,a,'V8 Nonbasic Land');
    put(MTG,game,b,'V8 Nonbasic Land');put(MTG,game,c,'V8 Nonbasic Land');put(MTG,game,c,'V8 Nonbasic Land');
    const source=put(MTG,game,a,'V8 Victim Count','hand');a.pool.G=1;
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);const victim=game.stack.at(-1).targets[0];
    put(MTG,game,victim,'V8 Nonbasic Land');const expected=game.lands(victim).filter(card=>!card.def.super.includes('Basic')).length;
    const before=victim.life;await settle(game);assert.equal(victim.life,before-expected);assert.equal(a.life,40);
    assert.equal((victim===b?c:b).life,40);
  });
  test(`v8 ${role}: a combat-event amount retains the damaged player through Stack resolution`,async()=>{
    const ctx=context(MTG,role,2),{game,a,b,others}=ctx;
    put(MTG,game,b,'V8 Quiet Creature');put(MTG,game,b,'V8 Quiet Creature');put(MTG,game,others[1],'V8 Quiet Creature');
    const source=await paidCast(MTG,ctx,'V8 Event Count');source.attacking=b;source.blockedBy=[];source.wasBlocked=false;game.combat={attackers:[source],defenders:new Map()};
    const before=a.library.length;await game.combatDamage(a,'normal');await settle(game);assert.equal(a.library.length,before-2);
  });
  test(`v8 ${role}: named-source counter amounts use the source's actual counters`,async()=>{
    const ctx=context(MTG,role),{game,a}=ctx,source=await paidCast(MTG,ctx,'V8 Named Tally');
    game.addCounters(source,'charge',3,false,a);const before=a.library.length;
    const action=game.activatableList(a).find(row=>row.card===source);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);
    await settle(game);assert.equal(a.library.length,before-3);assert.equal(source.tapped,true);
  });
  test(`v8 ${role}: X, cast-origin, and total-mana conditions use the real announced spell`,async()=>{
    {
      const ctx=context(MTG,role),{game,a}=ctx,low=put(MTG,game,a,'V8 X Gate','hand');a.pool.G=1;a.pool.C=2;
      const before=a.library.length;assert.equal(await game.castSpell(a,low,{from:'hand',xVal:2}),true);await settle(game);
      assert.equal(a.library.length,before,'X=2 does not satisfy the X>=3 trigger');
      const high=put(MTG,game,a,'V8 X Gate','hand');a.pool.G=1;a.pool.C=3;
      assert.equal(await game.castSpell(a,high,{from:'hand',xVal:3}),true);await settle(game);assert.equal(a.library.length,before-1);
    }
    {
      const ctx=context(MTG,role),{game,a}=ctx,fromHand=put(MTG,game,a,'V8 Origin Gate','hand');a.pool.U=1;a.pool.C=1;
      const before=a.library.length;assert.equal(await game.castSpell(a,fromHand,{from:'hand'}),true);await settle(game);assert.equal(a.library.length,before);
      const fromGrave=put(MTG,game,a,'V8 Origin Gate','graveyard');a.pool.U=1;a.pool.C=1;
      assert.equal(await game.castSpell(a,fromGrave,{from:'graveyard',alt:{flashback:true,...fromGrave.def.flashback}}),true);await settle(game);
      assert.equal(a.library.length,before-2);assert.equal(fromGrave.zone,'exile');
    }
    {
      const ctx=context(MTG,role),{game,a}=ctx,paid=put(MTG,game,a,'V8 Mana Gate','hand');a.pool.G=1;a.pool.C=4;
      const before=a.library.length;assert.equal(await game.castSpell(a,paid,{from:'hand'}),true);await settle(game);assert.equal(a.library.length,before-1);
      const free=put(MTG,game,a,'V8 Mana Gate','hand');assert.equal(await game.castSpell(a,free,{from:'hand',alt:{free:true}}),true);await settle(game);
      assert.equal(a.library.length,before-1,'a free cast records zero mana spent');
    }
  });
  test(`v8 ${role}: turn-history conditions distinguish the source from earlier entries and real card movement`,async()=>{
    {
      const ctx=context(MTG,role),{game,a}=ctx,alone=put(MTG,game,a,'V8 Another Gate','hand');a.pool.G=1;
      let before=a.library.length;assert.equal(await game.castSpell(a,alone,{from:'hand'}),true);await settle(game);assert.equal(a.library.length,before,'the entering source is not another creature');
      const prior=put(MTG,game,a,'V8 Quiet Creature','hand'),gate=put(MTG,game,a,'V8 Another Gate','hand');await game.move(prior,'battlefield',{ctrl:a});a.pool.G=1;before=a.library.length;
      assert.ok(a.turnState.permanentEntries.some(row=>row.iid===prior.iid));assert.equal(await game.castSpell(a,gate,{from:'hand'}),true);await settle(game);assert.equal(a.library.length,before-1);
    }
    {
      const ctx=context(MTG,role),{game,a}=ctx,first=put(MTG,game,a,'Sol Ring','hand'),gate=put(MTG,game,a,'V8 Nonland Gate','hand');await game.move(first,'battlefield',{ctrl:a});a.pool.G=1;
      const before=a.library.length;assert.ok(a.turnState.nonlandPermanentsEntered>=1);assert.equal(await game.castSpell(a,gate,{from:'hand'}),true);await settle(game);
      assert.equal(a.library.length,before-1);assert.ok(a.turnState.nonlandPermanentsEntered>=2);assert.equal(first.zone,'battlefield');
    }
    {
      const ctx=context(MTG,role),{game,a}=ctx,watcher=await paidCast(MTG,ctx,'V8 Descend Gate'),fallen=put(MTG,game,a,'V8 Quiet Creature','battlefield');
      const before=a.library.length;await game.move(fallen,'graveyard');assert.equal(a.turnState.descended,1);await game.emit('endStep',{player:a});await settle(game);
      assert.equal(a.library.length,before-1);assert.equal(watcher.zone,'battlefield');
    }
  });
  test(`v8 ${role}: spell-quality and graveyard-type conditions inspect concrete turn and zone records`,async()=>{
    {
      const ctx=context(MTG,role),{game,a}=ctx;await paidCast(MTG,ctx,'V8 Quality Cast Gate');const before=a.library.length;
      await game.emit('endStep',{player:a});await settle(game);assert.equal(a.library.length,before,'a creature spell is not an instant or sorcery');
      await paidCast(MTG,ctx,'V8 Choice Tap');await game.emit('endStep',{player:a});await settle(game);assert.equal(a.library.length,before-1);
    }
    {
      const ctx=context(MTG,role),{game,a}=ctx,first=put(MTG,game,a,'V8 Lesson Gate','hand');a.pool.G=1;
      let before=a.library.length;assert.equal(await game.castSpell(a,first,{from:'hand'}),true);await settle(game);assert.equal(a.library.length,before);
      put(MTG,game,a,'V8 Lesson Card','graveyard');const second=put(MTG,game,a,'V8 Lesson Gate','hand');a.pool.G=1;before=a.library.length;
      assert.equal(await game.castSpell(a,second,{from:'hand'}),true);await settle(game);assert.equal(a.library.length,before-1);
    }
  });
}

test('v8 counter memoization preserves target offsets and does not share mutable descriptors',()=>{
  const card={name:'Memoized composition',layout:'normal',type_line:'Instant',mana_cost:'{G}',oracle_text:'Untap up to two lands. Destroy target artifact. Untap up to two lands. Return target creature to its owner\'s hand.'};
  const plain=semanticClass(card,{memoize:false}),first=semanticClass(card);
  assert.ok(first.semanticClass);assert.deepEqual(first,plain);
  const body=first.implementation.find(row=>row.kind==='spell-generic');assert.ok(body);body.effects[0].target=999;
  assert.deepEqual(semanticClass(card),plain);
});

test('v8 relative counts cannot invent a player reference outside a bound target or event',()=>{
  const card={name:'Unbound count',layout:'normal',type_line:'Instant',mana_cost:'{G}',oracle_text:'Draw cards equal to the number of creatures that player controls.'};
  assert.equal(semanticClass(card).semanticClass,undefined);
  for(const oracle_text of ['Untap up to three lands unless you guessed correctly.','Create a number of Food tokens equal to the number of opponents you have who will attack next turn.'])assert.equal(semanticClass({...card,oracle_text}).semanticClass,undefined);
});
