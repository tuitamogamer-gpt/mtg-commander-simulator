import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose,cards as chooseCards} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Avalanche Tusker','Bull Elephant','Dragon Broodmother','Drake Familiar','Goblin Tinkerer','Graveyard Shovel','Heartless Hidetsugu','Monstrous Vortex','Rowan, Fearless Sparkmage',"Sarkhan's Unsealing",'Stadium Vendors','Stigma Lasher','Stream of Thought',"Swashbuckler's Whip",'Torens, Fist of the Angels'];
export async function proveCommonV39(M,name,role,h,assert=strict){
  const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
  for(const p of g.players){fund(p);while(p.library.length<45)put(M,p,'Forest');}
  g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
  let picks=[],option=null;
  choose(a,q=>{
    if(name==='Stream of Thought'&&q.type==='chooseX'&&/Replicate/.test(q.prompt||''))return {...q,min:0,max:0};
    if(q.type==='chooseTargets'&&picks.length){const requested=[picks.shift()].flat();assert.ok(requested.every(c=>q.candidates.includes(c)),'requested targets are legal');return {...q,candidates:requested,min:requested.length,max:requested.length};}
    if(q.type==='chooseOption'&&option!==null&&q.options.some(o=>o.key===option))return {...q,options:q.options.filter(o=>o.key===option)};
    return null;
  });
  const donor=(p=a,extra={})=>permanent(M,g,p,def('V39 witness',['Creature'],{power:'3',toughness:'20',...extra}));
  const cast=async(targets=[])=>{
    picks=targets.slice();const c=put(M,a,name,'hand'),paid=total(a);assert.equal(await g.castSpell(a,c,{from:'hand'}),true,name);assert.ok(total(a)<paid,'paid printed casting cost');await settle(g);c.sick=false;return c;
  };
  const activate=async(c,index=0,targets=[])=>{
    picks=targets.slice();const row=g.activatableList(a).find(r=>r.card===c&&r.ability===c.def.abilities[index]);assert.ok(row,'legal native activation');const paid=total(a);assert.equal(await g.activateAbility(a,row),true);await settle(g);if(row.ability.cost?.mana)assert.ok(total(a)<paid,'paid activation mana');
  };
  const creatureSpell=async(power,player=a)=>{
    const c=put(M,player,def('V39 cast witness',['Creature'],{cost:'{3}',power:String(power),toughness:'20'}),'hand'),paid=total(player);g.phase='main1';g.step='main';g.turnPlayer=player;assert.equal(await g.castSpell(player,c,{from:'hand'}),true);assert.ok(total(player)<paid);await settle(g);return c;
  };
  const attack=async(cards)=>{g.turnPlayer=a;g.phase='combat';g.step='attackers';cards.forEach(c=>{c.attacking=b;c.blockedBy=[];c.wasBlocked=false;g.recordCombatObjectEvent(c,'attacks');});g.combat={attackers:cards,defenders:new Map(),declaredAttackTargets:cards.map(()=>b)};g.recalc();await g.emit('attackersDeclared',{player:a,attackers:cards});for(const c of cards)await g.emit('attacks',{player:a,card:c,defender:b});await settle(g);};
  if(name==='Sokka, Swordmaster'){
    const equipment=donor(a,{types:['Artifact'],subtypes:['Equipment']}),c=await cast();picks=[equipment];await g.emit('beginCombat',{player:a});await settle(g);assert.equal(equipment.attachedTo,c.iid);assert.ok(c.attachments.includes(equipment.iid));
  }else if(name==='Mutinous Massacre'){
    const dead=donor(b,{cost:'{3}'}),enemy=donor(b,{cost:'{4}'}),own=donor(a,{cost:'{2}'});g.tap(enemy);option='odd';await cast();assert.equal(dead.zone,'graveyard');assert.equal(enemy.ctrl.idx,a.idx);assert.equal(enemy.tapped,false);assert.equal(enemy.kw('haste'),true);assert.equal(own.ctrl.idx,a.idx);
  }else if(name==='Avalanche Tusker'){
    const c=await cast(),blocker=donor(b),other=donor(b);picks=[blocker];await attack([c]);g.completeRequiredBlocks([c],[blocker,other]);assert.ok(c.blockedBy.includes(blocker));assert.equal(other.cur.requiredBlockSources?.length||0,0);await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);c.sick=false;c.attacking=b;c.blockedBy=[];c.wasBlocked=false;g.completeRequiredBlocks([c],[blocker]);assert.equal(c.blockedBy.length,0);
  }else if(name==='Bull Elephant'||name==='Drake Familiar'){
    const first=name==='Bull Elephant'?permanent(M,g,a,M.DEFS.Forest):donor(b,{types:['Enchantment']}),second=name==='Bull Elephant'?permanent(M,g,a,M.DEFS.Forest):donor(a,{types:['Enchantment']});option='yes';chooseCards(a,name==='Bull Elephant'?[first,second]:[first]);const c=await cast();assert.equal(first.zone,'hand');assert.equal(second.zone,name==='Bull Elephant'?'hand':'battlefield');assert.equal(c.zone,'battlefield');option='no';const declined=await cast();assert.equal(declined.zone,'graveyard');
  }else if(name==='Dragon Broodmother'){
    const c=await cast(),first=donor(a),second=donor(a);chooseCards(a,[first,second]);await g.emit('upkeep',{player:b});await settle(g);const token=g.bf().find(x=>x.isToken&&x.hasSub('Dragon'));assert.ok(token);assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');assert.equal(c.zone,'battlefield');assert.equal(token.meta.oracleDevoured,2);assert.equal(token.counters['+1/+1'],4);assert.equal(token.power,5);assert.equal(token.toughness,5);assert.equal(token.kw('flying'),true);assert.equal(token.colors.includes('R')&&token.colors.includes('G'),true);
  }else if(name==='Torens, Fist of the Angels'){
    const c=await cast();assert.equal(g.bf().filter(x=>x.isToken).length,0);await creatureSpell(5,b);assert.equal(g.bf().filter(x=>x.isToken).length,0);const ally=await creatureSpell(5),token=g.bf().find(x=>x.isToken&&x.hasSub('Soldier'));assert.ok(token);assert.equal(token.power,1);assert.equal(token.toughness,1);assert.equal(token.hasSub('Human'),true);assert.equal(token.colors.includes('G')&&token.colors.includes('W'),true);await attack([token,c,ally]);assert.equal(token.counters['+1/+1'],1);assert.equal(c.counters['+1/+1'],1);await g.endCombatStep(a);g.turnNo++;await attack([token]);assert.equal(token.counters['+1/+1'],1);
  }else if(name==='Goblin Tinkerer'){
    const artifact=donor(b,{types:['Artifact'],cost:'{3}'}),c=await cast();let observed=null;const damage=g.damageBatch.bind(g);g.damageBatch=async(rows,...args)=>{observed=rows.find(row=>row.target===c)||observed;return damage(rows,...args);};await activate(c,0,[artifact]);assert.equal(artifact.zone,'graveyard');assert.equal(c.zone,'graveyard');assert.equal(observed.n,3);assert.equal(observed.src.iid,artifact.iid);
  }else if(name==='Graveyard Shovel'){
    const creature=put(M,b,def('Shovel creature'),'graveyard'),land=put(M,b,'Forest','graveyard'),c=await cast(),life=a.life;chooseCards(b,[creature]);await activate(c,0,[b]);assert.equal(creature.zone,'exile');assert.equal(a.life,life+2);assert.equal(land.zone,'graveyard');g.untap(c);await activate(c,0,[b]);assert.equal(land.zone,'exile');assert.equal(a.life,life+2);
  }else if(name==='Heartless Hidetsugu'){
    a.life=39;b.life=40;const c=await cast();await activate(c);assert.equal(a.life,20);assert.equal(b.life,20);assert.equal(c.tapped,true);
  }else if(name==='Monstrous Vortex'){
    await cast();const discovered=put(M,a,def('Discover witness',['Instant'],{cost:'{2}',resolve:async()=>{a.v39Discovered=true;}}));put(M,a,'Forest');let calls=[];const native=g.oracleDiscoverV9.bind(g);g.oracleDiscoverV9=async(ctx,n)=>{calls.push(n);return native(ctx,n);};await creatureSpell(4);assert.equal(calls.length,0);await creatureSpell(5,b);assert.equal(calls.length,0);await creatureSpell(5);assert.equal(calls.length,1);assert.equal(calls[0],3);assert.ok(discovered.zone==='hand'||discovered.zone==='graveyard');
  }else if(name==='Rowan, Fearless Sparkmage'){
    const own=donor(a),enemy=donor(b),artifact=donor(b,{types:['Artifact']});g.tap(own);g.tap(enemy);const c=await cast();g.addCounters(c,'loyalty',10);await activate(c,2);assert.equal(enemy.ctrl.idx,a.idx);assert.equal(own.ctrl.idx,a.idx);assert.equal(artifact.ctrl.idx,b.idx);assert.equal(enemy.tapped,false);assert.equal(own.tapped,false);assert.equal(enemy.kw('haste'),true);g.turnNo++;g.untilEffects=g.untilEffects.filter(e=>e.expires!=='eot');g.recalc();assert.equal(enemy.ctrl.idx,b.idx);assert.equal(enemy.kw('haste'),false);
  }else if(name==="Sarkhan's Unsealing"){
    const own=donor(a),enemy=donor(b);await cast();const life=b.life;await creatureSpell(3);assert.equal(b.life,life);picks=[b];await creatureSpell(4);assert.equal(b.life,life-4);assert.equal(enemy.damage,0);picks=[b];await creatureSpell(6);assert.equal(b.life,life-8);assert.equal(enemy.damage,0);await creatureSpell(7);assert.equal(b.life,life-12);assert.equal(enemy.damage,4);assert.equal(own.damage,0);await creatureSpell(7,b);assert.equal(b.life,life-12);
  }else if(name==='Stadium Vendors'){
    option=String(b.idx);choose(b,q=>q.type==='chooseOption'&&q.options.some(o=>o.key==='U')?{...q,options:q.options.filter(o=>o.key==='U')}:null);const mana=b.pool.U;await cast();assert.equal(b.pool.U,mana+2);
  }else if(name==='Stigma Lasher'){
    const c=await cast(),life=b.life;await g.damageBatch([{src:c,target:b,n:1}],{deferSBA:true});await settle(g);assert.equal(b.life,life-1);await g.gainLife(b,5,c);assert.equal(b.life,life-1);await g.move(c,'exile');g.turnNo++;await g.gainLife(b,5,c);assert.equal(b.life,life-1);const own=a.life;await g.gainLife(a,3,c);assert.equal(a.life,own+3);
  }else if(name==='Stream of Thought'){
    const returned=[put(M,a,'Forest','graveyard'),put(M,a,def('Thought witness'),'graveyard')],left=put(M,a,'Island','graveyard'),before=b.library.length;chooseCards(a,returned);await cast([b]);assert.equal(b.library.length,before-4);assert.equal(b.graveyard.length,4);assert.ok(returned.every(c=>c.zone==='library'));assert.equal(left.zone,'graveyard');
  }else if(name==="Swashbuckler's Whip"){
    const host=donor(a),enemy=donor(b),c=await cast();picks=[host];const row=g.activatableList(a).find(r=>r.card===c&&r.equip);assert.ok(row);const mana=total(a);assert.equal(await g.activateAbility(a,row),true);await settle(g);assert.equal(total(a),mana-1);assert.equal(c.attachedTo,host.iid);assert.equal(host.kw('reach'),true);picks=[enemy];let ability=g.activatableList(a).find(r=>r.card===host&&!r.manaAbility);assert.ok(ability);const paid=total(a);assert.equal(await g.activateAbility(a,ability),true);await settle(g);assert.equal(total(a),paid-2);assert.equal(enemy.tapped,true);assert.equal(host.tapped,true);g.untap(host);const found=put(M,a,def('Whip discover witness',['Instant'],{cost:'{9}',resolve:async()=>{a.v39WhipFound=true;}}));put(M,a,'Forest');const abilities=g.activatableList(a).filter(r=>r.card===host&&!r.manaAbility);assert.equal(abilities.length,2);ability=abilities[1];const before=total(a);assert.equal(await g.activateAbility(a,ability),true);await settle(g);assert.equal(total(a),before-8);assert.ok(found.zone==='hand'||found.zone==='graveyard');assert.equal(host.tapped,true);
  }else throw Error('Missing v39 proof '+name);
  assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV39(M,entry,op,role,h){
  if(!names.includes(entry.raw.name)&&!['Mutinous Massacre','Sokka, Swordmaster'].includes(entry.raw.name))return null;
  if(!['generic-trigger','generic-ability','spell-generic','attachment-operation'].includes(op.kind))return null;
  if(!/-v39|V39/.test(JSON.stringify(op))&&!['Sokka, Swordmaster','Avalanche Tusker','Dragon Broodmother','Monstrous Vortex',"Swashbuckler's Whip",'Torens, Fist of the Angels',"Sarkhan's Unsealing"].includes(entry.raw.name))return null;
  let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));await proveCommonV39(M,entry.raw.name,role,h,assert);return count;
}
