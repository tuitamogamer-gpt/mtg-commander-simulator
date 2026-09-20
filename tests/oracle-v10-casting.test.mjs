import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine(),sources=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v10-expanded.json',import.meta.url),'utf8'));
const absent=sources.filter(card=>!M.DEFS[card.name]);
if(absent.length)M.registerOracleBatch(createImportPlan({cards:absent,bulk:{type:'oracle_cards',updated_at:'2026-08-30T09:01:56.964+00:00'},sequence:9912,limit:absent.length,compilerVersion:10}).report);
M.initData(M.RAW_DATA);
const fund=(p,amount=30)=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=amount;};
const select=(p,fn)=>{const previous=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(q)??previous(g,q);};
const target=(p,card)=>select(p,q=>q.type==='chooseTargets'?[card]:undefined);
const amount=p=>Object.values(p.pool).reduce((sum,n)=>sum+n,0);
async function cast(f,name,alt={}){fund(f.a);const card=put(M,f.game,f.a,name,'hand');assert.equal(await f.game.castSpell(f.a,card,{from:'hand',alt}),true);await settle(f.game);return card;}

for(const role of ['human','ai']){
  test(role+': Waterbend can tap a creature whose activated abilities are disabled',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'North Pole Patrol'),victim=put(M,f.game,f.b,'Grizzly Bears'),donors=['Ornithopter','Ornithopter','Ornithopter'].map(name=>put(M,f.game,f.a,name)),arrest=put(M,f.game,f.b,'Arrest');fund(f.a,0);target(f.a,victim);
    await f.game.attach(arrest,donors[0]);assert.equal(donors[0].cur.activationDisabled,true);
    const ability=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability.cost?.waterbendV10===3);assert.ok(ability);assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);
    assert.ok(donors.every(card=>card.tapped));assert.equal(victim.tapped,true);assert.equal(amount(f.a),0);assertGameStateInvariants(f.game);
  });
  test(role+': Waterbend accepts summoning-sick creatures and artifacts but reserves the tap-symbol source',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'North Pole Patrol'),victim=put(M,f.game,f.b,'Grizzly Bears');fund(f.a,0);target(f.a,victim);
    const donors=['Ornithopter','Grizzly Bears','Ornithopter'].map(name=>put(M,f.game,f.a,name));for(const donor of donors)donor.sick=true;
    const ability=f.game.activatableList(f.a).find(row=>row.card===source&&row.ability?.cost?.waterbendV10===3);assert.ok(ability);
    assert.equal(await f.game.activateAbility(f.a,ability),true);assert.equal(source.tapped,true);assert.ok(donors.every(card=>card.tapped));assert.equal(victim.tapped,false);await settle(f.game);assert.equal(victim.tapped,true);assert.equal(amount(f.a),0);assertGameStateInvariants(f.game);
  });
  test(role+': an insufficient Waterbend payment leaves every permanent untapped',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'North Pole Patrol'),victim=put(M,f.game,f.b,'Grizzly Bears'),donors=[put(M,f.game,f.a,'Ornithopter'),put(M,f.game,f.a,'Ornithopter')];fund(f.a,0);target(f.a,victim);
    assert.equal(f.game.activatableList(f.a).some(row=>row.card===source&&row.ability?.cost?.waterbendV10===3),false);
    const ability=source.def.abilities.find(row=>row.cost?.waterbendV10===3);assert.equal(await f.game.activateAbility(f.a,{card:source,ability,idx:source.def.abilities.indexOf(ability)}),false);
    assert.ok([source,...donors,victim].every(card=>!card.tapped));assert.equal(f.game.stack.length,0);assertGameStateInvariants(f.game);
  });
  test(role+': Waterbend cannot pay a colored or colorless symbol, exceed its limit, or create spare mana',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Geyser Leaper');fund(f.a,0);for(let n=0;n<4;n++)put(M,f.game,f.a,'Ornithopter');const payment={card:source,isAbility:true,waterbendV10:3};
    assert.equal(f.game.canPayMana(f.a,M.parseCost('{3}'),payment),true);
    for(const cost of ['{4}','{2}{U}','{2}{C}','{2}{S}'])assert.equal(f.game.canPayMana(f.a,M.parseCost(cost),payment),false,cost);
    assert.equal(await f.game.payMana(f.a,M.parseCost('{2}'),payment),true);assert.equal(amount(f.a),0);assert.equal(f.game.bf().filter(card=>card.ctrl===f.a&&card.tapped).length,2);assert.equal(payment.manaSpent,0);assertGameStateInvariants(f.game);
  });
  test(role+': Waterbender Ascension puts its quest counter on the enchantment and draws at four',async()=>{
    const f=context(M,role),source=put(M,f.game,f.a,'Waterbender Ascension'),attacker=put(M,f.game,f.a,'Grizzly Bears');source.counters.quest=2;const hand=f.a.hand.length;
    for(let n=3;n<=4;n++){attacker.attacking=f.b;f.game.combat={attackers:[attacker],defenders:new Map()};await f.game.combatDamage(f.a,'normal');await settle(f.game);assert.equal(source.counters.quest,n);assert.equal(attacker.counters.quest||0,0);assert.equal(f.a.hand.length,hand+(n===4?1:0));}
    assertGameStateInvariants(f.game);
  });
  test(role+': Cleave broadens the legal target and charges the full chosen cost',async()=>{
    for(const cleave of [false,true]){
      const f=context(M,role),victim=put(M,f.game,f.b,'Grizzly Bears'),spell=put(M,f.game,f.a,'Fierce Retribution','hand');fund(f.a);target(f.a,victim);
      const alt=cleave?spell.def.altCosts.find(option=>option.oracleCleaveV10):{},before=amount(f.a);
      assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt}),cleave);
      if(cleave){const so=f.game.stack.find(row=>row.card===spell);assert.equal(so.manaSpent,6);assert.equal(f.game.stackSpellManaValue(so),2);await settle(f.game);assert.equal(victim.zone,'graveyard');}
      else{assert.equal(spell.zone,'hand');assert.equal(amount(f.a),before);assert.equal(victim.zone,'battlefield');}
      assertGameStateInvariants(f.game);
    }
  });
  test(role+': Cleave rejects invented costs and incompatible alternatives before spending anything',async()=>{
    for(const invalid of [{oracleCleaveV10:true,altCostStr:'{0}'},{oracleCleaveV10:true,altCostStr:'{5}{W}',free:true},{oracleCleaveV10:true,altCostStr:'{5}{W}',flashback:true}]){
      const f=context(M,role),spell=put(M,f.game,f.a,'Fierce Retribution','hand');fund(f.a);const before=amount(f.a);
      assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt:invalid}),false);assert.equal(spell.zone,'hand');assert.equal(amount(f.a),before);assert.equal(f.game.stack.length,0);
    }
  });
  test(role+': a copied Cleave spell retains the changed text after its original is countered',async()=>{
    const f=context(M,role),victim=put(M,f.game,f.b,'Grizzly Bears'),spell=put(M,f.game,f.a,'Fierce Retribution','hand');fund(f.a);target(f.a,victim);
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt:spell.def.altCosts.find(option=>option.oracleCleaveV10)}),true);
    const original=f.game.stack.find(row=>row.card===spell);await f.game.copySpell(original,f.a,{mayNewTargets:false});await f.game.counterStackObject(original);await settle(f.game);
    assert.equal(victim.zone,'graveyard');assertGameStateInvariants(f.game);
  });
  test(role+': Prototype changes an ETB power calculation and resets on a blink',async()=>{
    const f=context(M,role),life=f.a.life,card=await cast(f,'Boulderbranch Golem',{oraclePrototypeV10:true});
    assert.equal(f.a.life,life+3);assert.equal(card.power,3);assert.equal(card.mv,4);assert.deepEqual(Array.from(card.colors),['G']);
    await f.game.move(card,'exile');assert.equal(card.mv,7);assert.equal(card.def.power,'6');
    await f.game.putPermanentOntoBattlefield(card,f.a);await settle(f.game);assert.equal(f.a.life,life+9);assert.equal(card.power,6);assertGameStateInvariants(f.game);
  });
  test(role+': Prototype token copies inherit size, color and mana cost without becoming physical prototype cards',async()=>{
    const f=context(M,role),source=await cast(f,'Skitterbeam Battalion',{oraclePrototypeV10:true}),copies=f.game.bf().filter(card=>card!==source&&card.name===source.name);
    assert.equal(copies.length,2);for(const copy of copies){assert.equal(copy.isToken,true);assert.equal(copy.power,2);assert.equal(copy.toughness,2);assert.equal(copy.mv,5);assert.deepEqual(Array.from(copy.colors),['R']);assert.equal(!!copy.oraclePrototypeV10,false);}
    assertGameStateInvariants(f.game);
  });
  test(role+': failed Prototype payment preserves the printed card and free casting can still select Prototype',async()=>{
    const f=context(M,role),card=put(M,f.game,f.a,'Blitz Automaton','hand'),printed=card.def;fund(f.a,0);
    assert.equal(await f.game.castSpell(f.a,card,{from:'hand',alt:{oraclePrototypeV10:true}}),false);assert.equal(card.zone,'hand');assert.equal(card.def,printed);assert.equal(!!card.oraclePrototypeV10,false);
    assert.equal(await f.game.castSpell(f.a,card,{from:'hand',alt:{oraclePrototypeV10:true,free:true}}),true);const so=f.game.stack.find(row=>row.card===card);assert.equal(so.manaSpent,0);await settle(f.game);assert.equal(card.power,3);assert.equal(card.mv,3);assertGameStateInvariants(f.game);
  });
  test(role+': Prototype survives a JSON save and resets after leaving the restored battlefield',async()=>{
    const f=context(M,role),source=await cast(f,'Blitz Automaton',{oraclePrototypeV10:true}),state=M.captureGameState(f.game);
    const resumed=context(M,role);M.restoreGameState(resumed.game,JSON.parse(JSON.stringify(state)));const card=resumed.game.byIid(source.iid);
    assert.equal(card.power,3);assert.equal(card.mv,3);assert.deepEqual(Array.from(card.colors),['R']);
    await resumed.game.move(card,'hand');assert.equal(card.def.power,'6');assert.equal(card.mv,7);assert.equal(card.colors.length,0);assertGameStateInvariants(resumed.game);
  });
  test(role+': Bargain rejects an invalid or declined sacrifice and leaves mana untouched',async()=>{
    for(const answer of ['creature','opponent','none']){
      const f=context(M,role),valid=put(M,f.game,f.a,'Ornithopter'),invalid=put(M,f.game,answer==='opponent'?f.b:f.a,answer==='opponent'?'Ornithopter':'Grizzly Bears'),spell=put(M,f.game,f.a,'Hamlet Glutton','hand');fund(f.a);
      select(f.a,q=>q.type==='chooseCards'?answer==='none'?[]:[invalid]:undefined);const before=amount(f.a);
      assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt:{oracleBargainV10:true}}),false);assert.equal(amount(f.a),before);assert.equal(spell.zone,'hand');assert.equal(valid.zone,'battlefield');assert.equal(invalid.zone,'battlefield');assertGameStateInvariants(f.game);
    }
  });
  test(role+': Bargain reduces the mana cost before payment and cannot sacrifice when mana payment fails',async()=>{
    for(const enough of [false,true]){
      const f=context(M,role),donor=put(M,f.game,f.a,'Ornithopter'),spell=put(M,f.game,f.a,'Hamlet Glutton','hand');fund(f.a,0);f.a.pool.G=2;f.a.pool.C=enough?3:2;
      assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt:{oracleBargainV10:true}}),enough);assert.equal(donor.zone,enough?'graveyard':'battlefield');
      if(enough){assert.equal(f.game.stack.find(row=>row.card===spell).manaSpent,5);await settle(f.game);assert.equal(spell.zone,'battlefield');}
      else{assert.equal(spell.zone,'hand');assert.equal(amount(f.a),4);}
      assertGameStateInvariants(f.game);
    }
  });
  test(role+': Bargain status is retained by a spell copy and its ETB but is independent of kicker',async()=>{
    const f=context(M,role),donor=put(M,f.game,f.a,'Ornithopter'),spell=put(M,f.game,f.a,'High Fae Negotiator','hand');fund(f.a);const life=f.a.life,other=f.b.life;
    assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt:{oracleBargainV10:true}}),true);const original=f.game.stack.find(row=>row.card===spell);assert.equal(original.kicked,false);assert.equal(donor.zone,'graveyard');
    await f.game.copySpell(original,f.a,{mayNewTargets:false});await f.game.counterStackObject(original);await settle(f.game);assert.equal(f.a.life,life+3);assert.equal(f.b.life,other-3);assertGameStateInvariants(f.game);
  });
  test(role+': Ratchet Bomb uses its departed charge counters, including zero',async()=>{
    for(const n of [0,2]){
      const f=context(M,role),bomb=put(M,f.game,f.a,'Ratchet Bomb'),zero=put(M,f.game,f.b,'Ornithopter'),two=put(M,f.game,f.b,'Grizzly Bears');bomb.counters.charge=n;f.game.recalc();
      const ability=f.game.activatableList(f.a).find(row=>row.card===bomb&&row.ability?.cost?.sacSelf);assert.ok(ability);assert.equal(await f.game.activateAbility(f.a,ability),true);await settle(f.game);
      assert.equal(bomb.zone,'graveyard');assert.equal(zero.zone,n===0?'graveyard':'battlefield');assert.equal(two.zone,n===2?'graveyard':'battlefield');assertGameStateInvariants(f.game);
    }
  });
}
