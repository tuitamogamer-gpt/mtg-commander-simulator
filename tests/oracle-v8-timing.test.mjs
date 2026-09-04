import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';

const MTG=fixtureEngine([
  ['Flash Everything','You may cast spells as though they had flash.','Artifact','{4}'],
  ['Flash Creatures','You may cast green creature spells as though they had flash.'],
  ['Flash Slivers','Any player may cast Sliver spells as though they had flash.'],
  ['Flash Union','You may cast Dragon spells and artifact spells as though they had flash.'],
  ['Flash Historic','You may cast historic spells as though they had flash.'],
  ['Flash Green','You may cast green spells as though they had flash.'],
  ['Flash For Turn','You may cast creature spells this turn as though they had flash.','Instant','{U}'],
  ['Green Bear','','Creature — Bear','{G}'],
  ['Blue Bear','','Creature — Bear','{U}'],
  ['Green Sliver','','Creature — Sliver','{G}'],
  ['Green Dragon','','Creature — Dragon','{G}'],
  ['Simple Artifact','','Artifact','{1}'],
  ['Simple Sorcery','You gain 1 life.','Sorcery','{G}'],
]);

for(const role of ['human','ai']){
  test(`flash ${role}: real priority queries expose continuous and temporary permissions`,async()=>{
    for(const temporary of [false,true]){
      const {game,a,b,trace}=context(MTG,role);game.turnPlayer=b;game.phase='end';
      const green=put(MTG,game,a,'Green Bear','hand'),wrong=put(MTG,game,a,'Simple Sorcery','hand');
      a.pool={W:0,U:1,B:0,R:0,G:2,C:0};
      if(temporary){const grant=put(MTG,game,a,'Flash For Turn','hand');assert.equal(await game.castSpell(a,grant,{from:'hand'}),true);await settle(game);}
      else put(MTG,game,a,'Flash Creatures');
      trace.length=0;
      const action=await game.askPriorityAction(a),query=trace.find(row=>row.q.type==='priority')?.q;
      assert.ok(query,'the real priority path asks the controller instead of silently passing');
      assert.ok(query.casts.some(option=>option.card===green));
      assert.equal(query.casts.some(option=>option.card===wrong),false);
      assert.ok(['pass','cast','activate'].includes(action.kind));
      if(action.kind==='cast'){assert.equal(await game.performAction(a,action),true);await settle(game);}
      assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
      a.turnState.cantCastAdditional=true;trace.length=0;
      await game.askPriorityAction(a);
      assert.equal(trace.some(row=>row.q.type==='priority'&&row.q.casts.length),false,'cast prohibitions still remove every offered spell');
    }
  });
  test(`flash ${role}: printed filters, controller changes, suppression and source departure govern real paid casts`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    game.turnPlayer=b;game.phase='end';
    const green=put(MTG,game,a,'Green Bear','hand'),blue=put(MTG,game,a,'Blue Bear','hand'),sorcery=put(MTG,game,a,'Simple Sorcery','hand');
    a.pool={W:0,U:3,B:0,R:0,G:3,C:4};
    assert.equal(game.canCastTiming(a,green),false);
    const source=put(MTG,game,a,'Flash Creatures');
    assert.equal(game.canCastTiming(a,green),true);
    assert.equal(game.canCastTiming(a,blue),false);
    assert.equal(game.canCastTiming(a,sorcery),false);
    assert.ok(game.castableList(a).some(option=>option.card===green));
    assert.ok(!game.castableList(a).some(option=>option.card===blue));
    source.faceDown=true;game.recalc();assert.equal(game.canCastTiming(a,green),false,'face-down source has no printed flash permission');
    source.faceDown=false;game.recalc();
    game.untilEffects.push({expires:'eot',apply:()=>{source.cur.abilitiesDisabled=true;}});game.recalc();
    assert.equal(game.canCastTiming(a,green),false);
    game.untilEffects=[];source.ctrl=b;game.recalc();
    assert.equal(game.canCastTiming(a,green),false);
    source.ctrl=a;game.recalc();
    const choice=game.castableList(a).find(option=>option.card===green);
    assert.equal(await game.castSpell(a,green,{from:choice.from,alt:choice.alt}),true);
    assert.equal(a.pool.G,2);
    await settle(game);assert.equal(green.zone,'battlefield');
    const next=put(MTG,game,a,'Green Bear','hand');
    await game.move(source,'graveyard');assert.equal(game.canCastTiming(a,next),false);
  });
  test(`flash ${role}: all-player permission includes opponents and exact subtype unions`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;game.phase='combat';game.turnPlayer=a;
    const own=put(MTG,game,a,'Green Sliver','hand'),enemy=put(MTG,game,b,'Green Sliver','hand'),wrong=put(MTG,game,b,'Green Bear','hand');
    const source=put(MTG,game,a,'Flash Slivers');
    assert.equal(game.canCastTiming(a,own),true);assert.equal(game.canCastTiming(b,enemy),true);
    assert.equal(game.canCastTiming(b,wrong),false);
    await game.move(source,'graveyard');put(MTG,game,b,'Flash Union');
    assert.equal(game.canCastTiming(b,put(MTG,game,b,'Green Dragon','hand')),true);
    assert.equal(game.canCastTiming(b,put(MTG,game,b,'Simple Artifact','hand')),true);
    assert.equal(game.canCastTiming(b,wrong),false);
  });
  test(`flash ${role}: a temporary permission resolves on Stack, expires with the turn and respects cast prohibitions`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;game.turnPlayer=b;game.phase='end';
    const creature=put(MTG,game,a,'Green Bear','hand'),sorcery=put(MTG,game,a,'Simple Sorcery','hand'),grant=put(MTG,game,a,'Flash For Turn','hand');
    a.pool={W:0,U:1,B:0,R:0,G:2,C:0};
    assert.equal(await game.castSpell(a,grant,{from:'hand'}),true);
    assert.equal(game.canCastTiming(a,creature),false,'unresolved permission does not apply');
    await settle(game);assert.equal(game.canCastTiming(a,creature),true);
    assert.equal(game.canCastTiming(a,sorcery),false);
    a.turnState.cantCastAdditional=true;assert.equal(game.canCastTiming(a,creature),false);
    a.turnState.cantCastAdditional=false;
    const portable=JSON.parse(JSON.stringify(a.turnState.oracleFlashUntilTurn));a.turnState.oracleFlashUntilTurn=portable;
    assert.equal(game.canCastTiming(a,creature),true,'permission is plain serializable turn state');
    assert.equal(await game.castSpell(a,creature,{from:'hand'}),true);await settle(game);
    assert.equal(creature.zone,'battlefield');assert.equal(a.pool.G,1,'the temporary permission still pays mana');
    const next=put(MTG,game,a,'Green Bear','hand');
    game.turnNo++;assert.equal(game.canCastTiming(a,next),false);
  });
  test(`flash ${role}: preflight uses adventure color/type and rejects inherited face-down subtypes`,async()=>{
    const {game,a,b}=context(MTG,role);game.turnPlayer=b;game.phase='end';
    const card=put(MTG,game,a,'Green Sliver','hand');
    card.def={...card.def,adventure:{name:'Blue Adventure',cost:'{U}',types:'Sorcery',run:async()=>{}}};
    const alt={...card.def.adventure,adventure:true};
    const source=put(MTG,game,a,'Flash Green');
    card.castMeta={spellColors:['G']};
    assert.equal(game.canCastTiming(a,card,alt),false,'green main face and old metadata cannot color the blue adventure');
    await game.move(source,'exile');put(MTG,game,a,'Flash Everything');
    assert.equal(game.canCastTiming(a,card,alt),true,'a sorcery adventure receives general flash permission');
    for(const permanent of game.bf().slice())await game.move(permanent,'exile');
    put(MTG,game,a,'Flash Slivers');
    assert.equal(game.canCastTiming(a,card,{faceDownCast:true}),false,'a face-down spell has no Sliver subtype');
  });
}

test('flash permissions reject unsatisfied extra syntax instead of discarding costs or conditions',()=>{
  const card={name:'Flash Boundary',layout:'normal',type_line:'Artifact',mana_cost:'{1}'};
  for(const oracle_text of ['You may cast spells as though they had flash if you smile.',
    'You may cast spells as though they had flash without paying their mana costs.',
    'You may cast cards from exile as though they had flash.']){
    assert.equal(semanticClass({...card,oracle_text}).semanticClass,undefined);
  }
});
