import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose,cards as chooseCards} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Belltower Sphinx','Bonds of Mortality','Chandra, Bold Pyromancer','Contempt','Curtain of Light','Dazzling Beauty','Dwarven Armorer','Ego Erasure','Fangorn, Tree Shepherd',"Fell Beast's Shriek",'Fog Patch','Gandalf, Wandering Wizard','Keldon Firebombers','Krang, Master Mind','Liliana Vess','Liliana, Waker of the Dead','Mathemagics','Minas Tirith','Mindslaver','Reaper of Sheoldred','Saprazzan Outrigger','Secret Tunnel','Sigurd, Jarl of Ravensthorpe','Sky Swallower','Sorin Markov','Spike Cannibal',"Teferi's Veil",'The Crowd Goes Wild','Valleymaker','Vulshok Battlemaster','Watchers of the Dead','Worst Fears','Zagras, Thief of Heartbeats'];
export async function proveCommonV38(M,name,role,h,assert=strict){
  const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  for(const p of g.players){fund(p);while(p.library.length<45)put(M,p,'Forest');}
  g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
  let picks=[],x=2,option=null;
  choose(a,q=>{
    if(q.type==='chooseTargets'&&picks.length){const requested=[picks.shift()].flat();assert.ok(requested.every(c=>q.candidates.includes(c)),'requested targets are legal');return {...q,candidates:requested,min:requested.length,max:requested.length};}
    if(q.type==='chooseX')return {...q,min:x,max:x};
    if(q.type==='chooseOption'&&option!==null&&q.options.some(o=>o.key===option))return {...q,options:q.options.filter(o=>o.key===option)};
    return null;
  });
  const donor=(p=a,extra={})=>permanent(M,g,p,def('V38 witness',['Creature'],{power:'3',toughness:'20',...extra}));
  const cast=async(targets=[],resolve=true)=>{
    picks=targets.slice();const c=put(M,a,name,'hand'),paid=total(a);assert.equal(await g.castSpell(a,c,{from:'hand'}),true,name);assert.ok(total(a)<paid,'paid the printed casting cost');const so=g.stack.find(row=>row.card===c);if(resolve)await settle(g);c.sick=false;return {c,so};
  };
  const activate=async(c,index=0,targets=[],resolve=true)=>{
    picks=targets.slice();const row=g.activatableList(a).find(r=>r.card===c&&r.ability===c.def.abilities[index]);assert.ok(row,'legal native activation');const paid=total(a);assert.equal(await g.activateAbility(a,row),true);if(resolve)await settle(g);if(row.ability.cost?.mana)assert.ok(total(a)<paid,'paid activation mana');
  };
  const attackers=async(cards,player=a,defender=b)=>{g.turnPlayer=player;g.phase='combat';g.step='attackers';cards.forEach(c=>{c.attacking=defender;c.blockedBy=[];c.wasBlocked=false;g.recordCombatObjectEvent(c,'attacks');});g.combat={attackers:cards,defenders:new Map(),declaredAttackTargets:cards.map(()=>defender)};g.recalc();await g.emit('attackersDeclared',{player,attackers:cards});await settle(g);};
  const equip=extra=>donor(a,{types:['Artifact'],subtypes:['Equipment'],...extra});
  if(['Worst Fears','Mindslaver','Sorin Markov'].includes(name)){
    const {c}=await cast(name==='Worst Fears'?[b]:[]);if(name==='Mindslaver')await activate(c,0,[b]);if(name==='Sorin Markov'){g.addCounters(c,'loyalty',10);await activate(c,2,[b]);}
    assert.equal(g.c1516TurnControls.length,1);assert.equal(g.c1516TurnControls[0].subject,b.idx);assert.equal(g.c1516TurnControls[0].controller,a.idx);
    if(name==='Worst Fears')assert.equal(c.zone,'exile');if(name==='Mindslaver')assert.equal(c.zone,'graveyard');
    let active=0,ordinary=0;g.mainPhase=async p=>{if(g.c1516ActiveControl?.subject===p.idx){active++;assert.equal(g.c1516ActiveControl.controller,a.idx);}else ordinary++;await p.controller.decide(g,{type:'chooseOption',options:[{key:'ok',label:'Continue'}]});};g.combatPhase=async()=>{};g.turnPlayer=b;await g.runTurn();assert.equal(active,2);assert.equal(g.c1516ActiveControl,null);g.turnPlayer=b;await g.runTurn();assert.equal(ordinary,2);assert.equal(g.c1516TurnControls.length,0);
  }else if(['Curtain of Light','Dazzling Beauty','Fog Patch'].includes(name)){
    const one=donor(b),two=donor(b);await attackers([one,two],b,a);g.step='blockers';g.combat.blockersDeclared=true;let triggers=0;const emit=g.emit.bind(g);g.emit=async(e,d,...rest)=>{if(e==='becomesBlocked')triggers++;return emit(e,d,...rest);};
    const before=a.library.length;await cast(name==='Fog Patch'?[]:[one]);assert.equal(one.wasBlocked,true);assert.equal(two.wasBlocked,name==='Fog Patch');assert.equal(triggers,name==='Fog Patch'?2:1);
    if(name!=='Dazzling Beauty')assert.equal(a.library.length,before-(name==='Curtain of Light'?1:0));
    const life=a.life;await g.combatDamage(b,'normal');await settle(g);assert.equal(a.life,life-(name==='Fog Patch'?0:3));if(name==='Dazzling Beauty'){g.turnNo++;await g.emit('upkeep',{player:b});await settle(g);assert.equal(a.library.length,before-1);}
  }else if(name==='Bonds of Mortality'){
    const own=donor(a,{kws:['hexproof','indestructible']}),enemy=donor(b,{kws:['hexproof','indestructible']});const {c}=await cast();await activate(c);assert.equal(enemy.kw('hexproof'),false);assert.equal(enemy.kw('indestructible'),false);assert.equal(own.kw('hexproof'),true);assert.equal(own.kw('indestructible'),true);
  }else if(name==='Chandra, Bold Pyromancer'){
    const own=donor(a),enemy=donor(b),walker=donor(b,{types:['Planeswalker'],loyalty:20}),artifact=donor(b,{types:['Artifact']});g.addCounters(walker,'loyalty',20);const life=b.life,{c}=await cast();g.addCounters(c,'loyalty',10);await activate(c,2,[b]);assert.equal(b.life,life-10);assert.equal(enemy.damage,10);assert.equal(walker.counters.loyalty,10);assert.equal(own.damage,0);assert.equal(artifact.zone,'battlefield');
  }else if(name==='Keldon Firebombers'){
    for(let i=0;i<5;i++)permanent(M,g,a,M.DEFS.Forest);for(let i=0;i<2;i++)permanent(M,g,b,M.DEFS.Island);const artifact=donor(b,{types:['Artifact']});await cast();assert.equal(g.lands(a).length,3);assert.equal(g.lands(b).length,2);assert.equal(a.graveyard.filter(c=>c.is('Land')).length,2);assert.equal(artifact.zone,'battlefield');
  }else if(name==='Liliana Vess'){
    const one=put(M,a,def('Own grave creature'),'graveyard'),two=put(M,b,def('Enemy grave creature'),'graveyard'),land=put(M,b,'Forest','graveyard'),{c}=await cast();g.addCounters(c,'loyalty',10);await activate(c,2);assert.equal(one.zone,'battlefield');assert.equal(two.zone,'battlefield');assert.equal(two.ctrl.idx,a.idx);assert.equal(land.zone,'graveyard');
  }else if(name==='Liliana, Waker of the Dead'){
    const {c}=await cast(),own=put(M,a,'Forest','hand'),life=b.life;await activate(c,0);assert.equal(own.zone,'graveyard');assert.equal(b.life,life-3);g.turnNo++;c.meta.loyaltyTurn=-1;const foreign=put(M,b,'Forest','hand');await activate(c,0);assert.equal(foreign.zone,'graveyard');assert.equal(b.life,life-3);
  }else if(name==='Watchers of the Dead'){
    const own=put(M,a,'Forest','graveyard');for(let i=0;i<5;i++)put(M,b,'Forest','graveyard');const {c}=await cast();await activate(c);assert.equal(c.zone,'exile');assert.equal(b.graveyard.length,2);assert.equal(b.exile.length,3);assert.equal(own.zone,'graveyard');
  }else if(name==='Spike Cannibal'){
    const one=donor(a),two=donor(b),artifact=donor(b,{types:['Artifact']});g.addCounters(one,'+1/+1',2);g.addCounters(two,'+1/+1',3);g.addCounters(artifact,'+1/+1',4);g.addCounters(one,'charge',1);const {c}=await cast();assert.equal(c.counters['+1/+1'],6);assert.equal(one.counters['+1/+1'],0);assert.equal(two.counters['+1/+1'],0);assert.equal(artifact.counters['+1/+1'],4);assert.equal(one.counters.charge,1);
  }else if(name==='Sky Swallower'){
    const own=donor(a),land=permanent(M,g,a,M.DEFS.Forest),enemy=donor(b),{c}=await cast([b]);assert.equal(own.ctrl.idx,b.idx);assert.equal(land.ctrl.idx,b.idx);assert.equal(enemy.ctrl.idx,b.idx);assert.equal(c.ctrl.idx,a.idx);
  }else if(name==='Vulshok Battlemaster'){
    const own=equip(),enemy=donor(b,{types:['Artifact'],subtypes:['Equipment']}),living=equip({types:['Artifact','Creature']}),{c}=await cast();assert.equal(own.attachedTo,c.iid);assert.equal(enemy.attachedTo,c.iid);assert.equal(enemy.ctrl.idx,b.idx);assert.equal(living.attachedTo,null);
  }else if(name==='Fell Beast\'s Shriek'){
    const own=donor(a),one=donor(b),two=donor(b);chooseCards(b,[two]);await cast();assert.equal(own.tapped,false);assert.equal(one.tapped,false);assert.equal(two.tapped,true);assert.ok(two.meta.goadedBy?.length||two.cur.goadedBy?.length||g.untilEffects.some(e=>e.kind==='goad'&&e.iid===two.iid));
  }else if(name==='Ego Erasure'){
    const own=donor(a,{subtypes:['Elf']}),one=donor(b,{subtypes:['Elf','Warrior']}),two=donor(b,{subtypes:['Elf'],kws:['changeling']}),{c}=await cast([b]);assert.equal(own.hasSub('Elf'),true);assert.equal(one.hasSub('Elf'),false);assert.equal(two.hasSub('Goblin'),false);assert.equal(one.power,1);assert.equal(own.power,3);assert.equal(c.zone,'graveyard');
  }else if(name==='Dwarven Armorer'){
    const target=donor(a),{c}=await cast();put(M,a,'Forest','hand');option='+0/+1';await activate(c,0,[target]);assert.equal(target.counters['+0/+1'],1);assert.equal(target.toughness,21);g.untap(c);put(M,a,'Forest','hand');option='+1/+0';await activate(c,0,[target]);assert.equal(target.counters['+1/+0'],1);assert.equal(target.power,4);assert.equal(a.graveyard.filter(c=>c.is('Land')).length,2);
  }else if(name==='Sigurd, Jarl of Ravensthorpe'){
    const saga=donor(a,{types:['Enchantment'],subtypes:['Saga']}),{c}=await cast();c.meta._attackedTurn=g.turnNo;option='add';await activate(c,0,[saga]);assert.equal(saga.counters.lore,1);g.turnNo++;c.meta._attackedTurn=g.turnNo;option='remove';await activate(c,0,[saga]);assert.equal(saga.counters.lore,0);
  }else if(name==='Gandalf, Wandering Wizard'){
    const {c}=await cast(),before=a.library.length,hand=a.hand.length;await activate(c);assert.equal(a.library.length,before-2);assert.equal(a.hand.length,hand+3);assert.ok(c.zone==='library'||c.zone==='hand');
  }else if(name==='Fangorn, Tree Shepherd'){
    const {c}=await cast(),one=donor(a,{subtypes:['Treefolk']}),two=donor(a),before=a.pool.G;await attackers([c,one,two]);assert.equal(a.pool.G,before+4);assert.equal(one.kw('vigilance'),true);assert.equal(two.kw('vigilance'),false);
  }else if(name==='Valleymaker'){
    const land=permanent(M,g,a,M.DEFS.Forest),{c}=await cast();chooseCards(a,[land]);option=String(b.idx);const mana=b.pool.G;await activate(c,1);assert.equal(land.zone,'graveyard');assert.equal(b.pool.G,mana+3);assert.equal(c.tapped,true);
  }else if(name==='Mathemagics'){
    const library=b.library.length;x=3;await cast([b]);assert.equal(b.library.length,library-8);
  }else if(name==='The Crowd Goes Wild'){
    const one=donor(a),two=donor(a),unselected=donor(a);x=3;await cast([[one,two]]);assert.equal(one.counters['+1/+1'],1);assert.equal(two.counters['+1/+1'],1);assert.equal(unselected.counters['+1/+1']||0,0);assert.equal(one.kw('trample'),true);assert.equal(unselected.kw('trample'),false);
  }else if(name==='Minas Tirith'){
    donor(a,{super:['Legendary']});const c=put(M,a,name,'hand');assert.equal(await g.playLand(a,c),true);assert.equal(c.tapped,false);assert.equal(g.activatableList(a).some(r=>r.card===c&&!r.manaAbility),false);const one=donor(a),two=donor(a);await attackers([one,two]);g.phase='main2';const before=a.hand.length;await activate(c);assert.equal(a.hand.length,before+1);g.turnNo++;a.turnState=a.freshTurnState();g.untap(c);assert.equal(g.activatableList(a).some(r=>r.card===c&&!r.manaAbility),false);
  }else if(name==='Secret Tunnel'){
    const c=put(M,a,name,'hand');assert.equal(await g.playLand(a,c),true);const one=donor(a,{subtypes:['Elf']}),two=donor(a,{subtypes:['Elf']}),other=donor(a,{subtypes:['Goblin']});await activate(c,0,[[one,two]]);assert.equal(one.cur.unblockable,true);assert.equal(two.cur.unblockable,true);assert.equal(other.cur.unblockable,false);
  }else if(name==='Krang, Master Mind'){
    const {c}=await cast();assert.equal(a.hand.length,4);await g.move(c,'hand');for(let i=0;i<4;i++)put(M,a,'Forest','hand');const library=a.library.length,paid=total(a);assert.equal(await g.castSpell(a,c,{from:'hand'}),true);assert.ok(total(a)<paid);await settle(g);assert.equal(a.library.length,library);
  }else if(name==='Belltower Sphinx'||name==='Reaper of Sheoldred'){
    const {c}=await cast(),enemy=donor(b),before=b.library.length,poison=b.poison||0;await g.damageBatch([{src:enemy,target:c,n:2}],{deferSBA:true});await settle(g);if(name==='Belltower Sphinx')assert.equal(b.library.length,before-2);else assert.equal(b.poison,poison+1);const other=donor(a);await g.damageBatch([{src:enemy,target:other,n:1}],{deferSBA:true});await settle(g);if(name==='Belltower Sphinx')assert.equal(b.library.length,before-2);else assert.equal(b.poison,poison+1);
  }else if(name==='Zagras, Thief of Heartbeats'){
    const {c}=await cast(),ally=donor(a),walker=donor(b,{types:['Planeswalker'],loyalty:20});g.addCounters(walker,'loyalty',20);await g.damageBatch([{src:ally,target:walker,n:1}],{combat:true,deferSBA:true});await settle(g);assert.equal(walker.zone,'graveyard');assert.equal(ally.kw('deathtouch'),true);const another=donor(b,{types:['Planeswalker'],loyalty:20});g.addCounters(another,'loyalty',20);await g.damageBatch([{src:c,target:another,n:1}],{deferSBA:true});await settle(g);assert.equal(another.zone,'battlefield');
  }else if(['Teferi\'s Veil','Saprazzan Outrigger','Contempt'].includes(name)){
    const host=donor(a),{c}=await cast(name==='Contempt'?[host]:[]),subject=name==='Saprazzan Outrigger'?c:host;await attackers([subject]);await g.emit('attacks',{card:subject,player:a,defender:b});await settle(g);assert.equal(subject.zone,'battlefield');assert.equal(subject.phasedOut,false);await g.emit('endCombat',{player:a});await settle(g);
    if(name==='Teferi\'s Veil')assert.equal(subject.phasedOut,true);else if(name==='Saprazzan Outrigger'){assert.equal(subject.zone,'library');assert.equal(a.library.at(-1)?.iid,subject.iid);}else{assert.equal(subject.zone,'hand');assert.equal(c.zone,'hand');}
  }else throw Error('Missing v38 proof '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV38(M,entry,op,role,h){
  if(!names.includes(entry.raw.name))return null;
  const encoded=JSON.stringify(op);
  if(!/-v38|upToXV38/.test(encoded)&&!['Curtain of Light','Dazzling Beauty','Belltower Sphinx','Reaper of Sheoldred','Minas Tirith','Zagras, Thief of Heartbeats','Sky Swallower','Dwarven Armorer','Sigurd, Jarl of Ravensthorpe','Secret Tunnel'].includes(entry.raw.name))return null;
  if(!['generic-trigger','generic-ability','spell-generic'].includes(op.kind))return null;
  let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));await proveCommonV38(M,entry.raw.name,role,h,assert);return count;
}
