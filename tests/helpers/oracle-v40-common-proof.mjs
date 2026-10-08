import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose,cards as chooseCards} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Anje, Maid of Dishonor',"Artificer's Hex",'Ashling, the Extinguisher','Barishi','Contested Game Ball','Doctor Octopus, Master Planner',"Drizzt Do'Urden",'Fblthp, the Lost','Gornog, the Red Reaper','Gruul Spellbreaker','Heiko Yamazaki, the General','Henge Walker','Kitesail Skirmisher','Kraken of the Straits','Legolas, Counter of Kills','Lo and Li, Royal Advisors','Magnetic Snuffler','Mana Echoes','Measure of Wickedness','Mortuary','Norin, Swift Survivalist','Ragost, Deft Gastronaut','Rakdos Roustabout','Scorch Spitter','Svella, Ice Shaper','Teysa, Opulent Oligarch','Tribute to the World Tree','Visions of Phyrexia','Voracious Brood','Wrathful Red Dragon','Yuna, Hope of Spira'];
export async function proveCommonV40(M,name,role,h,assert=strict){
  const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  for(const p of g.players){fund(p);while(p.library.length<45)put(M,p,'Forest');}
  g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
  let picks=[],option='yes';
  choose(a,q=>{
    if(q.type==='chooseTargets'&&picks.length){const requested=[picks.shift()].flat();assert.ok(requested.every(c=>q.candidates.includes(c)),'requested targets are legal');return {...q,candidates:requested,min:requested.length,max:requested.length};}
    if(q.type==='chooseOption'&&q.options.some(o=>o.key===option))return {...q,options:q.options.filter(o=>o.key===option)};
    return null;
  });
  const donor=(p=a,extra={})=>permanent(M,g,p,def('V40 witness',['Creature'],{power:'3',toughness:'20',...extra}));
  const cast=async(targets=[])=>{picks=targets.slice();const c=put(M,a,name,'hand'),paid=total(a);assert.equal(await g.castSpell(a,c,{from:'hand'}),true,name);assert.ok(total(a)<paid,'paid printed casting cost');await settle(g);c.sick=false;return c;};
  const activate=async(c,index=0,targets=[])=>{picks=targets.slice();const row=g.activatableList(a).find(r=>r.card===c&&r.ability===c.def.abilities[index]);assert.ok(row,'legal native activation');const paid=total(a);assert.equal(await g.activateAbility(a,row),true);await settle(g);if(row.ability.cost?.mana)assert.ok(total(a)<paid,'paid activation mana');};
  const enter=async(p=a,extra={})=>{const c=put(M,p,def('V40 entrant',['Creature'],{power:'3',toughness:'20',...extra}),'hand');await g.putPermanentOntoBattlefield(c,p);await settle(g);return c;};
  const attack=async(cards,defender=b)=>{g.turnPlayer=a;g.phase='combat';g.step='attackers';for(const c of cards){c.attacking=defender;c.blockedBy=[];c.wasBlocked=false;g.recordCombatObjectEvent(c,'attacks');}g.combat={attackers:cards,defenders:new Map(),declaredAttackTargets:cards.map(()=>defender)};g.recalc();await g.emit('attackersDeclared',{player:a,attackers:cards});for(const c of cards)await g.emit('attacks',{player:a,card:c,defender});await settle(g);};
  if(name==='Anje, Maid of Dishonor'){
    const c=await cast(),blood=()=>g.bf().filter(x=>x.hasSub('Blood')&&x.ctrl===a).length;assert.equal(blood(),1);await enter(a,{subtypes:['Vampire']});assert.equal(blood(),1);g.turnNo++;await enter(b,{subtypes:['Vampire']});assert.equal(blood(),1);await enter(a,{subtypes:['Human']});assert.equal(blood(),1);await enter(a,{subtypes:['Vampire']});assert.equal(blood(),2);assert.equal(c.zone,'battlefield');
  }else if(name==="Artificer's Hex"){
    const equipment=donor(b,{types:['Artifact'],subtypes:['Equipment']}),host=donor(b),c=await cast([equipment]);await g.emit('upkeep',{player:a});assert.equal(g.pendingTriggers.length,0);equipment.attachedTo=host.iid;host.attachments.push(equipment.iid);g.recalc();await g.emit('upkeep',{player:b});assert.equal(g.pendingTriggers.length,0);await g.emit('upkeep',{player:a});await settle(g);assert.equal(host.zone,'graveyard');assert.equal(equipment.zone,'battlefield');assert.equal(c.zone,'battlefield');
  }else if(name==='Ashling, the Extinguisher'){
    const c=await cast(),victim=donor(b);picks=[victim];await attack([c]);await g.combatDamage(a,'normal');await settle(g);assert.equal(victim.zone,'graveyard');
  }else if(name==='Barishi'){
    const own=put(M,a,def('Grave creature'),'graveyard'),land=put(M,a,'Forest','graveyard'),enemy=put(M,b,def('Enemy grave creature'),'graveyard'),c=await cast();await g.destroy(c);await settle(g);assert.equal(c.zone,'exile');assert.equal(own.zone,'library');assert.equal(land.zone,'graveyard');assert.equal(enemy.zone,'graveyard');
  }else if(name==='Contested Game Ball'){
    const c=await cast(),enemy=donor(b);g.tap(c);await g.damageBatch([{src:enemy,target:a,n:1}],{combat:true,deferSBA:true});await settle(g);assert.equal(c.ctrl.idx,b.idx);assert.equal(c.tapped,false);
  }else if(name==='Doctor Octopus, Master Planner'){
    await cast();const before=a.library.length;await g.emit('endStep',{player:b});await settle(g);assert.equal(a.hand.length,0);await g.emit('endStep',{player:a});await settle(g);assert.equal(a.hand.length,8);assert.equal(a.library.length,before-8);await g.emit('endStep',{player:a});await settle(g);assert.equal(a.hand.length,8);
  }else if(name==="Drizzt Do'Urden"){
    const c=await cast(),large=donor(b,{power:'8'}),small=donor(b,{power:'1'}),before=c.power;await g.destroy(small);await settle(g);assert.equal(c.counters['+1/+1']||0,0);await g.destroy(large);await settle(g);assert.equal(c.counters['+1/+1'],8-before);assert.equal(c.power,8);assert.ok(g.bf().some(x=>x.isToken&&x.name==='Guenhwyvar'&&x.kw('trample')));
  }else if(name==='Fblthp, the Lost'){
    const before=a.hand.length,c=await cast();assert.equal(a.hand.length,before+1);await g.move(c,'library');const hand=a.hand.length;await g.putPermanentOntoBattlefield(c,a);await settle(g);assert.equal(a.hand.length,hand+2);await g.move(c,'library');const locked=a.hand.length;await g.putPermanentOntoBattlefield(c,a);await g.move(c,'hand');await settle(g);assert.equal(a.hand.length,locked+3);
  }else if(name==='Gornog, the Red Reaper'){
    const c=await cast(),other=donor(a,{subtypes:['Warrior']}),victim=donor(b,{subtypes:['Elf']}),unaffected=donor(b,{subtypes:['Elf']}),power=other.power;picks=[victim];await attack([c,other]);assert.equal(victim.hasSub('Coward'),true);assert.equal(victim.hasSub('Elf'),false);assert.equal(other.power,power+1);assert.equal(g.canBlock(victim,other),false);assert.equal(unaffected.hasSub('Elf'),true);
  }else if(name==='Gruul Spellbreaker'){
    const c=await cast(),probe=donor(b);assert.equal(c.kw('hexproof'),true);assert.equal(g.legalTargets(M.T.player(),probe,b).some(p=>p===a),false);g.turnPlayer=b;g.recalc();assert.equal(c.kw('hexproof'),false);assert.equal(g.legalTargets(M.T.player(),probe,b).some(p=>p===a),true);
  }else if(name==='Heiko Yamazaki, the General'){
    const c=await cast(),artifact=put(M,a,def('Heiko artifact',['Artifact']),'graveyard');picks=[artifact];await attack([c]);g.phase='main2';g.step='main';assert.ok(g.castableList(a).some(row=>row.card===artifact));const mana=total(a);assert.equal(await g.castSpell(a,artifact,{from:'graveyard',alt:{emry:true}}),true);assert.ok(total(a)<mana);await settle(g);assert.equal(artifact.zone,'battlefield');await g.move(artifact,'graveyard');assert.equal(g.castableList(a).some(row=>row.card===artifact),false);
  }else if(name==='Henge Walker'){
    for(const color of Object.keys(a.pool))a.pool[color]=0;a.pool.G=3;const c=await cast();assert.equal(c.counters['+1/+1'],1);for(const color of Object.keys(a.pool))a.pool[color]=0;a.pool.C=3;const other=await cast();assert.equal(other.counters['+1/+1']||0,0);
  }else if(name==='Kitesail Skirmisher'){
    const c=await cast(),ally=donor(a),other=donor(a);other.attacking=a;picks=[ally];await attack([c,ally]);assert.equal(ally.kw('flying'),true);assert.equal(other.kw('flying'),false);
  }else if(name==='Kraken of the Straits'){
    const c=await cast(),weak=donor(b,{power:'2'}),equal=donor(b,{power:'3'});for(let i=0;i<3;i++)permanent(M,g,a,M.DEFS.Island);await attack([c]);assert.equal(g.canBlock(weak,c),false);assert.equal(g.canBlock(equal,c),true);await g.destroy(g.lands(a)[0]);assert.equal(g.canBlock(weak,c),true);
  }else if(name==='Legolas, Counter of Kills'){
    const c=await cast();g.tap(c);await M.E.scry(g,a,1);await settle(g);assert.equal(c.tapped,false);g.tap(c);await M.E.scry(g,a,1);await settle(g);assert.equal(c.tapped,true);g.turnNo++;await M.E.scry(g,a,1);await settle(g);assert.equal(c.tapped,false);
  }else if(name==='Lo and Li, Royal Advisors'){
    const c=await cast(),ally=donor(a,{subtypes:['Advisor']}),other=donor(a);await g.mill(b,3);await settle(g);assert.equal(ally.counters['+1/+1'],1);await g.mill(a,3);await settle(g);assert.equal(ally.counters['+1/+1'],1);put(M,b,'Forest','hand');put(M,b,'Forest','hand');await g.discard(b,b.hand.slice());await settle(g);assert.equal(ally.counters['+1/+1'],3);assert.equal(other.counters['+1/+1']||0,0);assert.equal(c.counters['+1/+1'],3);
  }else if(name==='Magnetic Snuffler'){
    const equipment=put(M,a,def('Snuffler equipment',['Artifact'],{subtypes:['Equipment']}),'graveyard'),c=await cast([equipment]);assert.equal(equipment.zone,'battlefield');assert.equal(equipment.attachedTo,c.iid);assert.equal(equipment.ctrl.idx,a.idx);
  }else if(name==='Mana Echoes'){
    await cast();donor(a,{subtypes:['Elf']});donor(a,{subtypes:['Human']});donor(a,{subtypes:['Elf','Warrior']});const before=a.pool.C;await enter(b,{subtypes:['Elf']});assert.equal(a.pool.C,before+2);await enter(b,{subtypes:['Goblin']});assert.equal(a.pool.C,before+2);
  }else if(name==='Measure of Wickedness'){
    const c=await cast(),hand=put(M,a,'Forest','hand');picks=[b];await g.discard(a,[hand]);await settle(g);assert.equal(hand.zone,'graveyard');assert.equal(c.ctrl.idx,b.idx);const life=b.life;await g.emit('endStep',{player:b});await settle(g);assert.equal(c.zone,'graveyard');assert.equal(b.life,life-8);
  }else if(name==='Mortuary'){
    await cast();const own=donor(a),enemy=donor(b);await g.destroy(enemy);await settle(g);assert.equal(enemy.zone,'graveyard');await g.destroy(own);await settle(g);assert.equal(own.zone,'library');assert.equal(a.library.at(-1).iid,own.iid);
  }else if(name==='Norin, Swift Survivalist'){
    await cast();const ally=donor(a),blocker=donor(b);await attack([ally]);ally.wasBlocked=true;ally.blockedBy=[blocker];blocker.blocking=ally.iid;await g.emit('becomesBlocked',{attacker:ally,blockers:[blocker]});await settle(g);assert.equal(ally.zone,'exile');g.phase='main2';g.step='main';const row=g.castableList(a).find(row=>row.card===ally);assert.ok(row);const before=total(a);assert.equal(await g.castSpell(a,ally,{from:'exile',alt:row.alt}),true);assert.ok(total(a)<before);await settle(g);assert.equal(ally.zone,'battlefield');
  }else if(name==='Ragost, Deft Gastronaut'){
    const artifact=donor(a,{types:['Artifact'],subtypes:['Equipment']}),foreign=donor(b,{types:['Artifact']}),c=await cast();assert.equal(artifact.hasSub('Food'),true);assert.equal(artifact.hasSub('Equipment'),true);assert.equal(foreign.hasSub('Food'),false);const row=g.activatableList(a).find(r=>r.card===artifact&&!r.manaAbility);assert.ok(row);const life=a.life,mana=total(a);assert.equal(await g.activateAbility(a,row),true);await settle(g);assert.equal(artifact.zone,'graveyard');assert.equal(a.life,life+3);assert.equal(total(a),mana-2);g.tap(c);await g.emit('endStep',{player:b});await settle(g);assert.equal(c.tapped,false);
  }else if(name==='Rakdos Roustabout'||name==='Scorch Spitter'){
    const c=await cast(),walker=donor(b,{types:['Planeswalker']});g.addCounters(walker,'loyalty',10);await attack([c],walker);if(name==='Rakdos Roustabout'){const blocker=donor(b);c.wasBlocked=true;c.blockedBy=[blocker];await g.emit('becomesBlocked',{attacker:c,blockers:[blocker]});await settle(g);}assert.equal(walker.counters.loyalty,9);
  }else if(name==='Svella, Ice Shaper'){
    const c=await cast();await activate(c);const token=g.bf().find(x=>x.isToken&&x.name==='Icy Manalith');assert.ok(token);assert.equal(token.is('Artifact'),true);assert.equal(token.cur.super.includes('Snow'),true);const row=g.manaSources(a).find(r=>r.card===token);assert.ok(row);const before=total(a);assert.equal(await g.activateManaSource(a,row,{U:1}),true);assert.equal(total(a),before+1);assert.equal(token.tapped,true);
  }else if(name==='Teysa, Opulent Oligarch'){
    await cast();await g.loseLife(b,1);await g.emit('endStep',{player:a});await settle(g);const clues=g.bf().filter(c=>c.hasSub('Clue'));assert.equal(clues.length,1);await g.sacrifice(a,clues[0]);await settle(g);const tokens=g.bf().filter(c=>c.isToken&&c.hasSub('Spirit'));assert.equal(tokens.length,1);assert.equal(tokens[0].kw('flying'),true);assert.equal(tokens[0].colors.includes('B')&&tokens[0].colors.includes('W'),true);
  }else if(name==='Tribute to the World Tree'){
    await cast();const before=a.hand.length;const small=await enter(a,{power:'2'});assert.equal(small.counters['+1/+1'],2);assert.equal(a.hand.length,before);await enter(a,{power:'3'});assert.equal(a.hand.length,before+1);await enter(b,{power:'4'});assert.equal(a.hand.length,before+1);
  }else if(name==='Visions of Phyrexia'){
    const c=await cast();await g.emit('endStep',{player:a});await settle(g);assert.equal(g.bf().filter(x=>x.hasSub('Powerstone')).length,1);await g.emit('upkeep',{player:a});await settle(g);const exiled=a.exile.at(-1);assert.ok(exiled);assert.equal(await g.playLand(a,exiled),true);await g.emit('endStep',{player:a});await settle(g);assert.equal(g.bf().filter(x=>x.hasSub('Powerstone')).length,1);assert.equal(c.zone,'battlefield');
  }else if(name==='Voracious Brood'){
    const c=await cast(),creatures=[donor(a),donor(a)],enemy=donor(b);await g.sacrificeMany(a,creatures);await settle(g);assert.equal(c.counters['+1/+1'],2);await g.destroy(enemy);await settle(g);assert.equal(c.counters['+1/+1'],2);const first=put(M,a,def('Brood mill creature'));put(M,a,'Forest');await g.mill(a,2);await settle(g);assert.equal(first.zone,'graveyard');assert.equal(c.counters['+1/+1'],3);
  }else if(name==='Wrathful Red Dragon'){
    const c=await cast(),ally=donor(a,{subtypes:['Dragon']}),enemy=donor(b),life=b.life;picks=[b];let sourceId=null;const damage=g.damageBatch.bind(g);g.damageBatch=async(rows,...args)=>{if(rows.some(row=>row.target===b))sourceId=rows.find(row=>row.target===b).src.iid;return damage(rows,...args);};await g.damageBatch([{src:enemy,target:ally,n:2}],{deferSBA:true});await settle(g);assert.equal(b.life,life-2);assert.equal(sourceId,ally.iid);assert.equal(c.zone,'battlefield');
  }else if(name==='Yuna, Hope of Spira'){
    const ally=donor(a,{types:['Creature','Enchantment']}),other=donor(a),enemy=donor(b,{types:['Creature','Enchantment']}),c=await cast();assert.equal(c.kw('trample'),true);assert.equal(ally.kw('lifelink'),true);assert.equal(other.kw('lifelink'),false);assert.equal(enemy.kw('lifelink'),false);g.turnPlayer=b;g.recalc();assert.equal(ally.kw('lifelink'),false);assert.equal(c.kw('trample'),false);
  }else throw Error('Missing v40 proof '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV40(M,entry,op,role,h){
  if(!names.includes(entry.raw.name))return null;
  if(!['generic-trigger','generic-ability','generic-static','artifact-food-types-v40','player-hexproof-v40','enters-with-counters'].includes(op.kind))return null;
  if(!/-v40|V40/.test(JSON.stringify(op))&&!['Doctor Octopus, Master Planner','Ashling, the Extinguisher','Gornog, the Red Reaper','Legolas, Counter of Kills','Mortuary','Rakdos Roustabout','Scorch Spitter','Svella, Ice Shaper'].includes(entry.raw.name))return null;
  let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));await proveCommonV40(M,entry.raw.name,role,h,assert);return count;
}
