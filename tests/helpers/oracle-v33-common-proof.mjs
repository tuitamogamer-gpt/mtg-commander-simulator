import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose,cards,targets,source} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';

const names=new Set(['Guardian of the Gateless','Herald of Anafenza','Gastal Thrillroller',"Nature's Will",'Evidence Examiner','Surveillance Monitor','Loki Laufeyson','Mu Yanling, Wind Rider','Skycoach Waypoint']);
export async function proveCommonV33(M,name,role,h,assert=strict){
  const f=h?h.gameFor(M,undefined,{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  fund(a);fund(b);g.reviewCombatWithHuman=async()=>{};g.spotlight=async()=>{};
  for(const player of g.players)while(player.library.length<30)put(M,player,'Forest');
  if(name==='Evidence Examiner'||name==='Surveillance Monitor'){
    const evidence=[put(M,a,def('Evidence three',['Creature'],{cost:'{3}'}),'graveyard'),put(M,a,def('Evidence one',['Artifact'],{cost:'{1}'}),'graveyard')];
    cards(a,evidence);choose(a,q=>q.type==='chooseOption'&&q.prompt.endsWith(': collect evidence?')?{...q,options:q.options.filter(o=>o.key==='yes')}:null);
    await source(M,f,name,settle);
    if(name==='Evidence Examiner'){g.priorityRound=async()=>settle(g);await g.combatPhase(a);await settle(g);}
    assert.ok(evidence.every(c=>c.zone==='exile'));
    assert.equal(g.bf().filter(c=>c.isToken&&c.hasSub(name==='Evidence Examiner'?'Clue':'Thopter')).length,1);
    if(name==='Evidence Examiner'){
      const clue=g.bf().find(c=>c.isToken&&c.hasSub('Clue')),before=total(a),hand=a.hand.length;
      g.phase='main1';assert.equal(await g.activateAbility(a,g.activatableList(a).find(x=>x.card===clue)),true);await settle(g);
      assert.equal(total(a),before-2);assert.equal(a.hand.length,hand+1);assert.equal(clue.zone,'ceased');
    }
  }else if(name==='Herald of Anafenza'){
    const c=await source(M,f,name,settle);c.sick=false;
    const ability=g.activatableList(a).find(row=>row.card===c&&row.ability?.outlast);assert.ok(ability);
    const before=total(a);assert.equal(await g.activateAbility(a,ability),true);await settle(g);
    assert.equal(c.tapped,true);assert.equal(c.counters['+1/+1'],1);assert.equal(total(a),before-3);
    assert.equal(g.bf().filter(c=>c.isToken&&c.hasSub('Warrior')).length,1);
    const other=permanent(M,g,a,def('Other outlast creature',['Creature'],{abilities:[{outlast:true,cost:{mana:'{1}'},run:async()=>{}}]}));
    assert.equal(await g.activateAbility(a,g.activatableList(a).find(row=>row.card===other)),true);await settle(g);
    assert.equal(g.bf().filter(c=>c.isToken&&c.hasSub('Warrior')).length,1);
  }else if(name==='Guardian of the Gateless'){
    const c=await source(M,f,name,settle);c.sick=false;
    const attackers=[0,1].map(i=>permanent(M,g,b,def('Required attacker '+i,['Creature'],{power:'1',toughness:'9',lure:true})));
    const prior=b.controller.decide.bind(b.controller);b.controller.decide=(game,q)=>q.type==='attackers'?attackers.map(card=>({card,target:a})):prior(game,q);
    if(role==='human'){const priorA=a.controller.decide.bind(a.controller);a.controller.decide=(game,q)=>q.type==='blockers'?attackers.map(attacker=>({blocker:c,attacker})):priorA(game,q);}
    let checked=false,queued=0;const queue=g.queueTrigger.bind(g);g.queueTrigger=t=>{if(t.src===c)queued++;return queue(t);};
    g.turnPlayer=b;g.priorityRound=async()=>{await settle(g);if(g.step==='blockers'){
      assert.ok(attackers.every(card=>card.blockedBy.includes(c)));assert.equal(c.power,5);assert.equal(c.toughness,5);checked=true;
    }};
    await g.combatPhase(b);await settle(g);assert.equal(checked,true);assert.equal(queued,1);assert.equal(c.zone,'battlefield');
  }else if(name==="Nature's Will"){
    const c=await source(M,f,name,settle),own=permanent(M,g,a,M.DEFS.Forest),enemy=permanent(M,g,b,M.DEFS.Island);
    const attackers=[0,1].map(i=>permanent(M,g,a,def('Unblocked attacker '+i)));
    g.tap(own);const enemyLife=b.life;
    g.turnPlayer=a;g.phase='combat';g.step='damage';g.combat={attackers,defenders:new Map(),declaredAttackTargets:[b],blockersDeclared:true,hadAttackers:true};
    for(const card of attackers){card.attacking=b;card.blockedBy=[];card.wasBlocked=false;}
    let queued=0;const queue=g.queueTrigger.bind(g);g.queueTrigger=t=>{if(t.src===c)queued++;return queue(t);};
    await g.combatDamage(a,'normal');await settle(g);
    assert.equal(b.life,enemyLife-4);assert.equal(queued,1);assert.equal(own.tapped,false);assert.equal(enemy.tapped,true);
    g.untap(enemy);g.tap(own);await g.damageAny(attackers[0],b,1);await settle(g);
    assert.equal(own.tapped,true);assert.equal(enemy.tapped,false);assert.equal(queued,1);
  }else if(name==='Gastal Thrillroller'){
    const c=await source(M,f,name,settle);assert.equal(c.is('Creature'),true);assert.equal(c.kw('haste'),true);assert.equal(c.kw('trample'),true);
    g.mainPhase=async()=>{};g.combatPhase=async()=>{};await g.runTurn();await settle(g);
    assert.equal(c.is('Creature'),false);g.turnPlayer=a;g.phase='main1';c.sick=false;fund(a);
    const crew=permanent(M,g,a,def('Crew witness',['Creature'],{power:'2'}));cards(a,[crew]);
    assert.equal(await g.activateAbility(a,g.activatableList(a).find(x=>x.card===c&&x.crew)),true);await settle(g);
    assert.equal(c.is('Creature'),true);assert.equal(crew.tapped,true);
    await g.destroy(c);await settle(g);assert.equal(c.zone,'graveyard');
    const discard=put(M,a,'Forest','hand');cards(a,[discard]);
    const before=total(a),action=g.activatableList(a).find(x=>x.card===c&&x.gyAbility);assert.ok(action);
    assert.equal(await g.activateAbility(a,action),true);await settle(g);
    assert.equal(total(a),before-3);assert.equal(discard.zone,'graveyard');assert.equal(c.zone,'battlefield');assert.equal(c.is('Creature'),true);assert.equal(c.counters.finality,1);
    await g.destroy(c);await settle(g);assert.equal(c.zone,'exile');
  }else if(name==='Loki Laufeyson'){
    const c=await source(M,f,name,settle);c.sick=false;
    let resolutions=0;
    const castWitness=async n=>{const spell=put(M,a,def('Loki instant '+n,['Instant'],{cost:'{'+n+'}',resolve:async()=>{resolutions++;}}),'hand');assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);await settle(g);};
    const before=total(a);assert.equal(await g.activateAbility(a,g.activatableList(a).find(x=>x.card===c&&x.ability.cost.tap)),true);await settle(g);
    assert.equal(total(a),before-1);assert.equal(c.tapped,true);
    await castWitness(3);assert.equal(resolutions,1);
    await castWitness(2);assert.equal(resolutions,3);
    await castWitness(1);assert.equal(resolutions,4);
    const powerup=g.activatableList(a).find(x=>x.card===c&&x.ability.powerUpV20);assert.ok(powerup);
    const paid=total(a);assert.equal(await g.activateAbility(a,powerup),true);await settle(g);
    assert.equal(total(a),paid-3);assert.equal(c.counters['+1/+1'],2);assert.equal(c.power,4);
    assert.equal(g.activatableList(a).some(x=>x.card===c&&x.ability.powerUpV20),false);
  }else if(name==='Skycoach Waypoint'){
    const land=put(M,a,name,'hand');assert.equal(await g.playLand(a,land),true);await settle(g);
    const recipient=await source(M,f,'Bloodline Recollector // Ancestral Craving',settle);assert.equal(!!recipient.meta.prepared,false);
    targets(a,[recipient]);const ability=g.activatableList(a).find(x=>x.card===land&&!x.manaAbility);assert.ok(ability);
    const before=total(a);assert.equal(await g.activateAbility(a,ability),true);await settle(g);
    assert.equal(total(a),before-3);assert.equal(land.tapped,true);assert.equal(recipient.meta.prepared,true);assert.equal(!!land.meta.prepared,false);
    const copy=g.byIid(recipient.meta.preparedCopy);assert.ok(copy);assert.equal(copy.zone,'exile');assert.equal(copy.meta.preparedBy,recipient.iid);
    targets(a,[a]);const hand=a.hand.length,life=a.life;assert.equal(await g.castSpell(a,copy,{from:'exile'}),true);await settle(g);
    assert.equal(a.hand.length,hand+3);assert.equal(a.life,life-3);assert.equal(recipient.meta.prepared,false);
  }else if(name==='Mu Yanling, Wind Rider'){
    const c=await source(M,f,name,settle),vehicle=g.bf().find(c=>c.isToken&&c.hasSub('Vehicle'));assert.ok(vehicle);
    assert.equal(vehicle.is('Creature'),false);assert.equal(vehicle.kw('flying'),true);
    const pilot=permanent(M,g,a,def('Vehicle pilot',['Creature'],{power:'1'}));cards(a,[pilot]);
    assert.equal(await g.activateAbility(a,g.activatableList(a).find(x=>x.card===vehicle&&x.crew)),true);await settle(g);
    assert.equal(pilot.tapped,true);assert.equal(vehicle.is('Creature'),true);assert.equal(vehicle.power,3);assert.equal(vehicle.toughness,2);
    const hand=a.hand.length;vehicle.attacking=b;vehicle.blockedBy=[];vehicle.wasBlocked=false;vehicle.sick=false;
    g.phase='combat';g.step='damage';g.combat={attackers:[vehicle],defenders:new Map(),declaredAttackTargets:[b],blockersDeclared:true,hadAttackers:true};
    await g.combatDamage(a,'normal');await settle(g);assert.equal(a.hand.length,hand+1);
    await g.move(c,'exile');await settle(g);assert.equal(vehicle.kw('flying'),false);
  }else throw Error('Missing v33 proof: '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');
  return f;
}
export async function operationProofV33(M,entry,op,role,h){
  if(!names.has(entry.raw.name))return null;
  let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));
  await proveCommonV33(M,entry.raw.name,role,h,assert);return count;
}
