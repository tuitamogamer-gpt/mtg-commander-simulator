import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Illusion of Choice','Decorum Dissertation','Germination Practicum','Echocasting Symposium','Restoration Seminar','Improvisation Capstone','Hallowed Moonlight','Pale Moon','Peace Talks','Taunt','Suspend','Delay','Bitter Ordeal','Capital Punishment','Bite of the Black Rose','Split Decision','Expropriate','Wheel of Misfortune','Goblin Game','Cone of Cold',"Lae'zel's Acrobatics","Faith's Shield",'Psychic Rebuttal','Storyweave','The Great Aurora'];
export async function proveExtraV70(M,name,role,positive=true,h){
 let checks=0;const assert=Object.fromEntries(['equal','ok','deepEqual'].map(k=>[k,(...args)=>{checks++;strict[k](...args);} ]));
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;h?.assertControllerRole?.(M,f,name);
 for(const p of g.players){fund(p);while(p.library.length<40)put(M,p,'Forest');}g.spotlight=async()=>{};
 // Each controller keeps its native decision implementation. Narrow the offered
 // legal alternatives so human and real AI both exercise the same witness.
 let aims=[],cards=[],optionKey=null,yes=positive,mode=positive?0:1,secretA=positive?4:2,secretB=2;
 for(const p of [a,b]){if(p!==a&&p.controller===a.controller)p.controller={decide:p.controller.decide.bind(p.controller)};choose(p,q=>{
  if(q.type==='chooseTargets'&&aims.length&&p===a){const selected=[aims.shift()].flat();assert.ok(selected.every(c=>q.candidates.includes(c)),name+' offered legal targets');return {...q,candidates:selected,min:selected.length,max:selected.length};}
  if(q.type==='chooseX')return {...q,min:p===a?secretA:secretB,max:p===a?secretA:secretB};
  if(q.type==='chooseCards'&&p===a&&cards.length){const selected=cards[0];if(selected.every(c=>q.from.includes(c))){cards.shift();return {...q,from:selected,min:selected.length,max:selected.length};}}
  if(q.type==='chooseOption'&&q.aiHint?.kind==='mode')return {...q,options:q.options.filter(o=>o.key===String(mode))};
  if(q.type==='chooseOption'&&optionKey&&q.options.some(o=>o.key===optionKey))return {...q,options:q.options.filter(o=>o.key===optionKey)};
  if(q.type==='chooseOption'&&q.options.some(o=>o.key==='yes'))return {...q,options:q.options.filter(o=>o.key===(yes?'yes':'no'))};
  if(q.type==='chooseOption'&&/vote/i.test(q.aiHint?.kind||''))return {...q,options:[q.options[positive?0:q.options.length-1]]};
  return null;
 });}
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V70 spell witness',['Creature'],{power:'2',toughness:'8',...extra}));
 const cast=async(card=put(M,a,name,'hand'),resolve=true)=>{const mana=total(a);assert.equal(await g.castSpell(a,card,{from:card.zone}),true,name+' paid cast');assert.ok(total(a)<mana,'printed mana paid');if(resolve)await settle(g);return card;};
 let pendingTarget=a;choose(b,q=>q.type==='chooseTargets'?{...q,candidates:[pendingTarget],min:1,max:1}:null);
 const pending=async(target=a)=>{pendingTarget=target;const card=put(M,b,def('V70 enemy instant',['Instant'],{cost:'{U}',targets:[M.T.player()],resolve:async ctx=>ctx.g.loseLife(ctx.targets[0],1,'V70 pending spell')}),'hand');assert.equal(await g.castSpell(b,card,{from:'hand'}),true);return g.stack.find(so=>so.card===card);};
 if(['Decorum Dissertation','Germination Practicum','Echocasting Symposium','Restoration Seminar','Improvisation Capstone'].includes(name)){
  const own=donor(),enemy=donor(b),hand=b.hand.length,life=b.life;let grave,free=[];
  if(name==='Decorum Dissertation')aims=[b];
  if(name==='Echocasting Symposium')aims=[b,own];
  if(name==='Restoration Seminar'){grave=put(M,a,def('V70 restored artifact',['Artifact']),'graveyard');aims=[grave];}
  if(name==='Improvisation Capstone'){for(let i=0;i<2;i++)free.push(put(M,a,def('V70 free instant '+i,['Instant'],{cost:'{2}',resolve:async()=>{a.extraResolved=(a.extraResolved||0)+1;}})));cards=positive?free.slice().reverse().map(c=>[c]):[[]];}
  const source=await cast();assert.equal(source.zone,'exile');
  if(name==='Decorum Dissertation'){assert.equal(b.hand.length,hand+2);assert.equal(b.life,life-2);}
  if(name==='Germination Practicum'){assert.equal(own.counters['+1/+1'],2);assert.equal(enemy.counters['+1/+1']||0,0);}
  if(name==='Echocasting Symposium'){assert.equal(g.creatures(b).filter(c=>c.isToken).length,1);assert.equal(g.creatures(a).filter(c=>c.isToken).length,0);}
  if(name==='Restoration Seminar')assert.equal(grave.zone,'battlefield');
  if(name==='Improvisation Capstone'){assert.equal(a.extraResolved||0,positive?2:0);assert.equal(free.filter(c=>c.zone==='exile').length,positive?0:2);}
  const triggers=g.delayed.filter(t=>t.name.includes('paradigm')).length;assert.equal(triggers,1);
  await g.emit('precombatMain',{player:b});await settle(g);assert.equal(g.delayed.filter(t=>t.name.includes('paradigm')).length,1);
  if(name==='Restoration Seminar'){await g.move(grave,'graveyard');aims=[grave];}
  if(name==='Decorum Dissertation')aims=[b];if(name==='Echocasting Symposium')aims=[b,own];
  if(name==='Improvisation Capstone')for(let i=0;i<2;i++)put(M,a,def('V70 second lesson spell '+i,['Instant'],{cost:'{2}',resolve:async()=>{}}));
  const old=b.life;cards=name==='Improvisation Capstone'?[]:cards;if(positive)await g.move(source,'graveyard');
  // Allow the native cast-card-copy picker only in the positive recurrence.
  choose(a,q=>q.type==='chooseCards'&&/cast/i.test(q.prompt||'')&&q.from.some(c=>c.meta.bomCastCopy)?{...q,min:positive?1:0,max:positive?1:0}:null);
  await g.emit('precombatMain',{player:a});await settle(g);assert.equal(source.zone,positive?'graveyard':'exile','paradigm survives removal of the original card from exile');assert.equal(g.delayed.filter(t=>t.name.includes('paradigm')).length,1,'copies do not duplicate the paradigm permission');
  if(name==='Decorum Dissertation')assert.equal(b.life,old-(positive?2:0));
  if(name==='Germination Practicum')assert.equal(own.counters['+1/+1'],positive?4:2);
  if(name==='Restoration Seminar')assert.equal(grave.zone,positive?'battlefield':'graveyard');
 }else if(name==='Illusion of Choice'){
  const hand=a.hand.length;optionKey='one';choose(b,q=>q.type==='chooseOption'&&q.options.some(o=>o.key==='two')?{...q,options:q.options.filter(o=>o.key==='two')}:null);await cast();assert.equal(a.hand.length,hand+1);const votes=await M.VN.vote({g,src:put(M,a,name,'graveyard'),you:a},[{key:'one',label:'one'},{key:'two',label:'two'}]);assert.ok(votes.every(v=>v.key==='one'));if(!positive){g.untilEffects=g.untilEffects.filter(e=>e.kind!=='illusion-extra-v70');const next=await M.VN.vote({g,src:put(M,a,name,'graveyard'),you:a},[{key:'one',label:'one'},{key:'two',label:'two'}]);assert.equal(next.find(v=>v.player===b).key,'two');}
 }else if(name==='Hallowed Moonlight'){
  const hand=a.hand.length;await cast();assert.equal(a.hand.length,hand+1);const creature=put(M,b,def('V70 moonlight creature'),'hand');if(positive){await g.putPermanentOntoBattlefield(creature,b);assert.equal(creature.zone,'exile');}else{assert.equal(await g.castSpell(b,creature,{from:'hand',alt:{speed:'instant'}}),true);await settle(g);assert.equal(creature.zone,'battlefield');}const artifact=put(M,b,def('V70 uncast artifact',['Artifact']),'hand');await g.putPermanentOntoBattlefield(artifact,b);assert.equal(artifact.zone,'battlefield');
 }else if(name==='Pale Moon'){
  const land=permanent(M,g,a,def('V70 mana land',['Land'],{cost:null,super:positive?[]:['Basic'],mana:[{produce:[{G:2}],tap:true}]}));await cast();const source=g.manaSources(a).find(r=>r.card===land);assert.ok(source);const oldC=a.pool.C,oldG=a.pool.G;assert.equal(await g.activateManaSource(a,source,source.produce[0]),true);assert.equal(a.pool.C-oldC,positive?2:0);assert.equal(a.pool.G-oldG,positive?0:2);
 }else if(name==='Peace Talks'){
  const own=donor(),spell=put(M,a,def('V70 target spell',['Instant'],{targets:[M.T.creature()]}),'hand');await cast();const spec={...M.T.creature(),oracleTargetActionV20:'spell'};assert.equal(g.canAttackAtAll(own),false);assert.equal(g.legalTargets(spec,spell,a).includes(own),false);aims=[own];g.queueTrigger({src:own,ctrl:a,name:'V70 permitted triggered target',targets:[M.T.creature()],run:async ctx=>g.addCounters(ctx.targets[0],'+1/+1',1)});await settle(g);assert.equal(own.counters['+1/+1'],1,'triggered abilities can still target');const ability={label:'V70 blocked activated target',cost:{mana:'{1}'},targets:[M.T.creature()],run:async()=>{}};own.def.abilities=[ability];g.recalc();const mana=total(a);assert.equal(await g.activateAbility(a,{card:own,ability}),false);assert.equal(total(a),mana);g.turnNo+=positive?1:2;assert.equal(g.canAttackAtAll(own),!positive);assert.equal(g.legalTargets(spec,spell,a).includes(own),!positive);
 }else if(name==='Taunt'){
  const creature=donor(b);aims=[b];await cast();assert.equal(g.hasAttackRequirement(creature),false);b.turnsStarted++;g.turnPlayer=b;assert.equal(g.hasAttackRequirement(creature),true);assert.ok(g.legalDeclarationAttackTargets(creature).includes(a));if(!positive){b.turnsStarted++;assert.equal(g.hasAttackRequirement(creature),false);}
 }else if(name==='Suspend'){
  const creature=donor(b);aims=[creature];await cast();assert.equal(creature.zone,'exile');assert.equal(creature.counters.time,2);if(!positive){await g.move(creature,'hand');await g.move(creature,'exile');}else{g.removeCounters(creature,'time',2);await settle(g);}assert.equal(creature.zone,positive?'battlefield':'exile');if(positive)assert.equal(creature.kw('haste'),true);
 }else if(name==='Delay'){
  const so=await pending();if(!positive)so.card.def.uncounterable=true;aims=[so];const life=a.life;await cast();assert.equal(so.card.zone,positive?'exile':'graveyard');assert.equal(a.life,life-(positive?0:1));if(positive){assert.equal(so.card.counters.time,3);g.removeCounters(so.card,'time',3);await settle(g);assert.equal(so.card.zone,'graveyard');assert.equal(a.life,life-1);}
 }else if(name==='Bitter Ordeal'){
  if(positive){const creature=donor(b),artifact=permanent(M,g,b,def('V70 dead artifact',['Artifact']));await g.sacrifice(b,creature);await g.sacrifice(b,artifact);}aims=positive?[b,b,b]:[b];const before=b.exile.length;await cast();assert.equal(b.exile.length-before,positive?3:1);assert.equal(b.library.length,positive?37:39);
 }else if(name==='Capital Punishment'){
  const first=donor(b),second=donor(b);for(let i=0;i<3;i++)put(M,b,'Forest','hand');const old=b.hand.length;await cast();assert.equal([first,second].filter(c=>c.zone==='graveyard').length,positive?2:0);assert.equal(b.hand.length,old-(positive?0:2));
 }else if(name==='Bite of the Black Rose'){
  const own=donor(),enemy=donor(b);for(let i=0;i<3;i++)put(M,b,'Forest','hand');const old=b.hand.length;await cast();assert.equal(enemy.power,positive?0:2);assert.equal(own.power,2);assert.equal(b.hand.length,old-(positive?0:2));
 }else if(name==='Split Decision'){
  const so=await pending();aims=[so];const life=a.life;await cast();assert.equal(a.life,life-(positive?0:2));assert.equal(so.card.zone,'graveyard');
 }else if(name==='Expropriate'){
  const own=donor(),enemy=donor(b);cards=positive?[]:[[own],[enemy]];const source=await cast();assert.equal(source.zone,'exile');assert.equal(enemy.ctrl,positive?b:a);assert.equal(g.extraTurns?.length||0,positive?2:0);
 }else if(name==='Wheel of Misfortune'){
  put(M,a,'Forest','hand');put(M,b,'Forest','hand');const hand=b.hand.length,lifeA=a.life,lifeB=b.life;await cast();assert.equal(a.life,lifeA-(positive?4:2));assert.equal(b.life,lifeB-(positive?0:2));assert.equal(a.hand.length,positive?7:1);assert.equal(b.hand.length,hand);
 }else if(name==='Goblin Game'){
  const lifeA=a.life,lifeB=b.life;await cast();assert.equal(a.life,positive?lifeA-4:Math.floor((lifeA-2)/2));assert.equal(b.life,Math.floor((lifeB-2)/2));
 }else if(name==='Cone of Cold'){
  const own=donor(),enemy=donor(b);g.rnd=()=>positive?0.999:0.1;await cast();assert.equal(enemy.tapped,true);assert.equal(own.tapped,false);assert.equal(!!enemy.meta.noUntapOnce,positive);const late=put(M,b,def('V70 late creature'),'hand');await g.putPermanentOntoBattlefield(late,b);assert.equal(late.tapped,positive);
 }else if(name==="Lae'zel's Acrobatics"){
  const own=donor(),token=donor(),enemy=donor(b);token.isToken=true;let entries=0;own.def.triggers=[{on:'etb',filter:(game,c,d)=>d.card===c,run:async()=>{entries++;}}];g.rnd=()=>positive?0.7:0.1;await cast();assert.equal(own.zone,'exile');assert.equal(token.zone,'battlefield');assert.equal(enemy.zone,'battlefield');assert.equal(entries,positive?1:0);await g.emit('endStep',{player:a});await settle(g);assert.equal(own.zone,'battlefield');assert.equal(entries,positive?2:1);
 }else if(name==="Faith's Shield"){
  const own=donor(),other=donor(),enemy=donor(b),red=put(M,b,def('V70 red spell',['Instant'],{colorsOverride:['R']}),'hand');a.life=positive?5:6;aims=[own];optionKey='R';await cast();assert.equal(g.isProtectedFrom(own,red),true);assert.equal(g.isProtectedFrom(other,red),positive);assert.equal(g.isProtectedFrom(a,red),positive);assert.equal(g.isProtectedFrom(enemy,red),false);
 }else if(name==='Psychic Rebuttal'){
  for(let i=0;i<(positive?2:1);i++)put(M,a,def('V70 mastery '+i,['Instant']),'graveyard');const invalid=await pending(b),valid=await pending(a),card=put(M,a,name,'hand'),spec=g.spellTargetSpecs(card)[0];assert.equal(g.legalTargets(spec,card,a).includes(invalid),false);assert.equal(g.legalTargets(spec,card,a).includes(valid),true);aims=positive?[valid,a]:[valid];const life=a.life;await cast(card);assert.equal(a.life,life-(positive?1:0));assert.equal(valid.card.zone,'graveyard');
 }else if(name==='Storyweave'){
  const own=donor(),saga=permanent(M,g,a,def('V70 Saga',['Enchantment'],{subtypes:['Saga']}));aims=[positive?own:saga];await cast();assert.equal(own.counters['+1/+1']||0,positive?2:0);assert.equal(saga.counters.lore||0,positive?0:2);const first=put(M,a,def('V70 enchantment creature',['Enchantment','Creature']),'hand'),second=put(M,a,def('V70 second enchantment creature',['Enchantment','Creature']),'hand');await g.withBattlefieldEntryBatch(async()=>{await g.putPermanentOntoBattlefield(first,a);await g.putPermanentOntoBattlefield(second,a);});assert.equal(first.counters['+1/+1']||0,positive?0:2);assert.equal(second.counters['+1/+1']||0,positive?0:2);const later=put(M,a,def('V70 later enchantment creature',['Enchantment','Creature']),'hand');await g.putPermanentOntoBattlefield(later,a);assert.equal(later.counters['+1/+1']||0,0);
 }else if(name==='The Great Aurora'){
  const own=donor(),enemy=donor(b);put(M,a,'Forest','hand');put(M,b,'Forest','hand');choose(a,q=>q.type==='chooseCards'&&/any number of lands/.test(q.prompt)?{...q,min:positive?q.from.length:0,max:positive?q.from.length:0}:null);choose(b,q=>q.type==='chooseCards'&&/any number of lands/.test(q.prompt)?{...q,min:0,max:0}:null);const source=await cast();assert.equal(source.zone,'exile');assert.equal(own.zone==='battlefield',false);assert.equal(enemy.zone==='battlefield',false);assert.equal(b.hand.length,2);assert.equal(a.hand.length+g.bf().filter(c=>c.owner===a).length,2);
 }else throw Error('No v70 extra proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return checks;
}
