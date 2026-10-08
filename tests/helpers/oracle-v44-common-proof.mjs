import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Artifact Possession','Desert Were-Worm','Haunting Wind',"Hibernation's End",'Hidden Herd','Hidden Predators','Mistbind Clique','Powerleech','Renegade Krasis','Shah of Naar Isle',"Teferi's Imp",'Tolarian Entrancer','Trophy Hunter','Veiled Crocodile'];
export async function proveCommonV44(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<45)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let targets=[],cards=[],choice=positive?'yes':'no';
 choose(a,q=>{
  if(q.type==='chooseTargets'&&targets.length){const picked=[targets.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets');return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&cards.length){const picked=cards.shift();assert.ok(picked.every(c=>q.from.includes(c)),'legal selected cards');return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===choice))return {...q,options:q.options.filter(o=>o.key===choice)};return null;
 });
 choose(b,q=>q.type==='chooseOption'&&q.prompt.includes('draw up to three')?{...q,options:q.options.filter(o=>o.key===(positive?'3':'0'))}:null);
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V44 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const cast=async(n=name,{aim=[],resolve=true,card}={})=>{targets=aim.slice();card ||=put(M,a,n,'hand');const before=total(a);assert.equal(await g.castSpell(a,card,{from:'hand'}),true,typeof n==='string'?n:n.name);assert.ok(total(a)<before,'paid spell');if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,index=0,aim=[],player=a)=>{if(player===a)targets=aim.slice();const ability=c.def.abilities[index],row=g.activatableList(player).find(r=>r.card===c&&r.ability===ability);assert.ok(row,'native legal activation');const before=total(player);assert.equal(await g.activateAbility(player,row),true);await settle(g);if(ability.cost?.mana)assert.ok(total(player)<before,'paid ability');};
 const attack=async(list)=>{g.phase='combat';g.step='attackers';g.combat={attackers:list,declaredAttackTargets:list.map(()=>b)};for(const c of list){c.attacking=b;c.blockedBy=[];c.wasBlocked=false;c.meta._attackedTurn=g.turnNo;g.tap(c,{attackerDeclaration:true});g.recordCombatObjectEvent(c,'attacks');}await g.emit('attackersDeclared',{player:a,attackers:list});for(const c of list)await g.emit('attacks',{player:a,card:c,defender:b});await settle(g);};
 if(['Artifact Possession','Haunting Wind','Powerleech'].includes(name)){
  const artifact=donor(b,{types:['Artifact'],abilities:[{cost:{mana:'{1}'},run:async()=>{}},{cost:{mana:'{1}',tap:true},run:async()=>{}}],mana:[{cost:{tap:true},produce:()=>[{C:1}]}]}),c=await cast(name,{aim:name==='Artifact Possession'?[artifact]:[]}),subject=name==='Powerleech'?a:b,delta=name==='Powerleech'?1:name==='Artifact Possession'?-2:-1;
  let before=subject.life;await activate(artifact,0,[],b);assert.equal(subject.life,before+delta,'a non-tap activation triggers once');
  before=subject.life;await activate(artifact,1,[],b);assert.equal(subject.life,before+delta,'tap cost triggers the tap clause, not the activation clause');
  g.untap(artifact);before=subject.life;const row=g.activatableList(b).find(r=>r.card===artifact&&r.manaAbility);assert.ok(row);assert.equal(await g.activateAbility(b,row),true);await settle(g);assert.equal(subject.life,before+delta,'a mana ability with a tap cost is counted once');
  g.untap(artifact);for(const color of Object.keys(b.pool))b.pool[color]=0;before=subject.life;const spell=put(M,b,def('V44 automatic payment',['Instant'],{cost:'{1}',resolve:async()=>{}}),'hand');assert.equal(await g.castSpell(b,spell,{from:'hand'}),true);await settle(g);assert.equal(subject.life,before+delta,'automatic mana payment emits one real activation and one tap');
  fund(b);await g.move(c,'exile');before=subject.life;await activate(artifact,0,[],b);assert.equal(subject.life,before,'leaving removes the trigger');
 }else if(name==='Shah of Naar Isle'){
  const c=await cast(),before=b.hand.length;await g.emit('upkeep',{player:a});await settle(g);assert.equal(c.zone,positive?'battlefield':'graveyard');assert.equal(b.hand.length,before+(positive?3:0));
 }else if(name==="Hibernation's End"){
  const target=put(M,a,def('V44 one-mana library creature',['Creature'],{cost:'{G}',power:'1',toughness:'2'})),wrong=put(M,a,def('V44 two-mana library creature',['Creature'],{cost:'{1}{G}'})),c=await cast();cards=[[target]];await g.emit('upkeep',{player:a});await g.flushTriggers();await g.resolveTop();assert.equal(c.counters.age||0,positive?1:0);if(positive)await g.destroy(c);await settle(g);assert.equal(target.zone,positive?'battlefield':'library');assert.equal(wrong.zone,'library');
 }else if(name==='Renegade Krasis'){
  const first=donor(a,{power:'1',toughness:'1'}),second=donor(a,{power:'1',toughness:'1'}),foreign=donor(b,{power:'1',toughness:'1'});g.addCounters(first,'+1/+1',1);g.addCounters(foreign,'+1/+1',1);const c=await cast(),initial=c.counters['+1/+1']||0;await cast(def('V44 evolve entrant',['Creature'],{cost:'{G}',power:positive?'8':'1',toughness:positive?'8':'1'}));assert.equal(c.counters['+1/+1']||0,initial+(positive?1:0));assert.equal(first.counters['+1/+1'],positive?2:1);assert.equal(second.counters['+1/+1']||0,0);assert.equal(foreign.counters['+1/+1'],1);
 }else if(name==='Mistbind Clique'){
  const faerie=donor(a,{subtypes:['Faerie']}),land=permanent(M,g,b,M.DEFS.Forest),own=permanent(M,g,a,M.DEFS.Forest);cards=[positive?[faerie]:[]];const c=await cast(name,{aim:[b]});assert.equal(land.tapped,positive);assert.equal(own.tapped,false);assert.equal(c.zone,positive?'battlefield':'graveyard');assert.equal(faerie.zone,positive?'exile':'battlefield');if(positive){await g.destroy(c);await settle(g);assert.equal(faerie.zone,'battlefield');}
 }else if(name==='Hidden Predators'){
  const enemy=donor(b,{power:positive?'4':'3'}),c=await cast();assert.equal(c.is('Creature'),positive);if(!positive){g.addCounters(enemy,'+1/+1',1);await settle(g);}assert.equal(c.is('Creature'),true);assert.equal(c.is('Enchantment'),false);assert.equal(c.power,4);assert.equal(c.hasSub('Beast'),true);await g.destroy(enemy);await settle(g);assert.equal(c.is('Creature'),true);
 }else if(name==='Veiled Crocodile'){
  const own=put(M,a,'Forest','hand'),enemy=put(M,b,'Forest','hand'),c=await cast();assert.equal(c.is('Creature'),false);await g.discard(positive?b:a,[positive?enemy:own]);await settle(g);assert.equal(c.is('Creature'),true);assert.equal(c.is('Enchantment'),false);assert.equal(c.power,4);assert.equal(c.hasSub('Crocodile'),true);
 }else if(name==='Hidden Herd'){
  const c=await cast(),entered=put(M,b,'Command Tower','hand');await g.putPermanentOntoBattlefield(entered,b);await settle(g);assert.equal(c.is('Creature'),false);g.turnPlayer=b;g.phase='main1';const land=put(M,b,positive?'Command Tower':'Forest','hand');assert.equal(await g.playLand(b,land),true);await settle(g);assert.equal(c.is('Creature'),positive);assert.equal(c.hasSub('Beast'),positive);if(positive)assert.equal(c.power,3);
 }else if(name==='Trophy Hunter'){
  const c=await cast(),enemy=donor(b,{kws:['flying']}),other=donor(b,{kws:['flying']});await activate(c,0,[enemy]);assert.equal(enemy.damage,1);if(!positive)g.addOracleAnimation(enemy,{types:[],subtypes:[],keywords:[],removeKeywords:['flying'],retainTypes:true,retainAllSubtypes:true,temporary:true});await g.destroy(enemy);await settle(g);assert.equal(c.counters['+1/+1']||0,positive?1:0);await g.destroy(other);await settle(g);assert.equal(c.counters['+1/+1']||0,positive?1:0);
 }else if(name==='Tolarian Entrancer'){
  const c=await cast(),first=donor(b),second=donor(b);await attack([c]);c.wasBlocked=true;c.blockedBy=[first,second];first.blocking=c.iid;second.blocking=c.iid;for(const blocker of[first,second])await g.emit('becomesBlockedByCreature',{attacker:c,blocker,player:a});await settle(g);assert.equal(first.ctrl.idx,b.idx);if(!positive){await g.move(second,'exile');await g.putPermanentOntoBattlefield(second,b);}await g.destroy(c);await g.emit('endCombat',{player:a});await settle(g);assert.equal(first.ctrl.idx,a.idx);assert.equal(second.ctrl.idx,positive?a.idx:b.idx);
 }else if(name==="Teferi's Imp"){
  const discard=put(M,a,'Forest','hand'),c=await cast(),version=c.zoneVersion;cards=[[discard]];g.phaseOutMany([c]);await settle(g);assert.equal(c.phasedOut,true);assert.equal(discard.zone,'graveyard');assert.equal(a.hand.length,0);g.phaseOutMany([c]);await settle(g);assert.equal(a.hand.length,0);g.phaseInFor(a);await settle(g);assert.equal(c.phasedOut,false);assert.equal(c.zoneVersion,version);assert.equal(a.hand.length,1);
 }else if(name==='Desert Were-Worm'){
  const c=await cast(),first=donor(a,{power:'6'}),second=donor(a,{power:'6'});await attack([c]);assert.equal((g._additionalPhases||[]).length,0);await attack([c,first,second]);assert.equal((g._additionalPhases||[]).length,1);assert.equal(c.tapped,false);assert.equal(first.tapped,false);assert.equal(second.tapped,false);await attack([c,first,second]);assert.equal((g._additionalPhases||[]).length,1,'only the first qualifying attack adds combat');assert.equal(first.tapped,true);
 }else throw Error('Missing v44 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV44(M,entry,op,role,h){
 if(!names.includes(entry.raw.name)||!['generic-trigger','state-trigger-v8'].includes(op.kind))return null;
 let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV44(M,entry.raw.name,role,positive,h,assert);return count;
}
