import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Mabel, Bitter Recluse','Compel Brutality','Prophesied End','Danitha, Spear of Agony','Stinging Vitriol','Dark Matter Manipulator','Sphinx of False Conclusions','Samut, Tyrant of Naktamun','Karn, Argent Defender','Master of Barbs','Danitha, Sword of Hope','Yuriko, Blade of the Mighty'];
export async function proveCommonV47(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<55)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let aims=[],picks=[],mode=positive?0:1;
 choose(a,q=>{
  if(q.type==='chooseTargets'&&aims.length){const picked=[aims.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets');return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&picks.length){const picked=picks.shift();assert.ok(picked.every(c=>q.from.includes(c)));return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseX'&&name==='Mabel, Bitter Recluse')return {...q,min:positive?3:0,max:positive?3:0};
  if(q.type==='chooseOption'&&name==='Compel Brutality'&&q.aiHint?.kind==='mode')return {...q,options:q.options.filter(o=>o.key===String(mode))};
  return null;
 });
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V47 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const cast=async(n=name,{aim=[],resolve=true,player=a}={})=>{if(player===a)aims=aim.slice();const card=put(M,player,n,'hand'),before=total(player);assert.equal(await g.castSpell(player,card,{from:'hand'}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid cast');if(resolve)await settle(g);card.sick=false;return card;};
 const noop=(name='V47 instant',targets=[])=>def(name,['Instant'],{cost:'{U}',targets,resolve:async()=>{}});
 const attack=async(c,defender=b)=>{g.phase='combat';g.step='attackers';c.attacking=defender;c.blockedBy=[];c.wasBlocked=false;g.combat={attackers:[c],declaredAttackTargets:[defender]};g.recordCombatObjectEvent(c,'attacks');await g.emit('attackersDeclared',{player:a,attackers:[c]});await g.emit('attacks',{player:a,card:c,defender});await settle(g);};
 if(name==='Mabel, Bitter Recluse'){
  const victim=donor(b,{types:positive?['Planeswalker']:['Creature'],loyalty:'8'});g.addCounters(victim,positive?'loyalty':'+1/+1',positive?8:5);const c=await cast(name,{aim:[victim]});assert.equal(victim.counters[positive?'loyalty':'+1/+1'],positive?5:5);assert.equal(c.kw('deathtouch'),true);assert.equal(g.legalTargets(c.def.triggers[0].targets[0],c,a).includes(c),false);
 }else if(name==='Compel Brutality'){
  const src=donor(a,{types:positive?['Creature']:['Planeswalker'],loyalty:'5'}),victim=donor(b);if(!positive)g.addCounters(src,'loyalty',5);await cast(name,{aim:[src,victim]});assert.equal(victim.damage,positive?3:5);assert.equal(src.counters.loyalty||0,positive?0:5);assert.equal(src.tapped,false);
 }else if(name==='Prophesied End'){
  const victim=donor(b,{kws:positive?[]:['indestructible']});if(positive)victim.attacking=a;const hand=b.hand.length;await cast(name,{aim:[victim]});assert.equal(victim.zone,positive?'graveyard':'battlefield');assert.equal(b.hand.length,hand+(positive?0:1));
 }else if(name==='Stinging Vitriol'){
  const chosen=put(M,b,'Sol Ring','hand'),land=put(M,b,'Forest','hand'),life=b.life;picks=[[chosen]];await cast(name,{aim:[b]});assert.equal(b.life,life-2);assert.equal(chosen.zone,'graveyard');assert.equal(land.zone,'hand');
 }else if(name==='Dark Matter Manipulator'){
  for(let i=0;i<(positive?4:3);i++)put(M,a,'Forest','graveyard');const size=a.library.length,c=await cast();assert.equal(a.library.length,size-3);assert.equal(a.graveyard.length,positive?7:6);assert.equal(c.power,Number(c.def.power)+(positive?2:0));await g.move(a.graveyard[0],'exile');assert.equal(c.power,Number(c.def.power));
 }else if(name==='Sphinx of False Conclusions'){
  const c=await cast(),hand=a.hand.length,library=a.library.length;await attack(c);assert.equal(a.hand.length,hand);assert.equal(a.library.length,library-1);assert.equal(a.graveyard.length,1);g.addCounters(c,'+1/+1',3);await g.destroy(c);await settle(g);const copy=g.bf().find(x=>x.isToken&&x.name===name);assert.ok(copy);assert.equal(copy.power,Number(c.def.power));assert.equal(copy.kw('flash'),true);assert.equal(copy.kw('flying'),true);await g.destroy(copy);g.checkSBA();await settle(g);assert.equal(g.bf().filter(x=>x.name===name).length,0);
 }else if(name==='Samut, Tyrant of Naktamun'){
  const c=await cast(),utility=donor(b,{abilities:[{cost:'{1}',label:'V47 utility',effect:async()=>{}}]}),land=permanent(M,g,b,M.DEFS.Forest);const so=await cast(noop(),{resolve:false,player:positive?a:b});assert.equal(g.hasSplitSecond(),positive);const answer=put(M,b,noop('V47 response'),'hand');assert.equal(g.canCastTiming(b,answer),!positive);assert.equal(g.activatableList(b).some(x=>x.card===utility),!positive);const mana=g.manaSources(b).find(x=>x.card===land),before=b.pool.G;assert.ok(mana);assert.equal(await g.activateManaSource(b,mana,{G:1}),true);assert.equal(b.pool.G,before+1);if(positive){assert.equal(await g.castSpell(b,answer,{from:'hand'}),false);await g.move(c,'exile');assert.equal(g.hasSplitSecond(),false);assert.equal(g.canCastTiming(b,answer),true);}await settle(g);assert.equal(so.zone,'graveyard');
 }else if(name==='Karn, Argent Defender'){
  const c=await cast();let entered=0;const watcher=donor(a,{triggers:[{on:'etb',filter:()=>true,run:async()=>{entered++;}}]});for(const p of[a,b])for(const types of[['Creature'],['Artifact']]){await g.putPermanentOntoBattlefield(put(M,p,def('V47 suppressed',types),'hand'),p);await settle(g);}assert.equal(entered,0);await g.putPermanentOntoBattlefield(put(M,a,def('V47 enchantment',['Enchantment']),'hand'),a);await settle(g);assert.equal(entered,1);await g.move(c,'exile');await g.putPermanentOntoBattlefield(put(M,b,def('V47 restored',['Creature']),'hand'),b);await settle(g);assert.equal(entered,2);assert.equal(watcher.zone,'battlefield');
 }else if(name==='Master of Barbs'){
  const third=g.addPlayer('Third',{name:'Third'},b.controller,false),ally=donor(),c=await cast(),power=c.power;await g.damageBatch([{src:ally,target:b,n:2},{src:ally,target:third,n:1}],{combat:!positive,deferSBA:true});await settle(g);assert.equal(c.power,power+(positive?1:0));assert.equal(ally.power,3+(positive?1:0));await g.damageBatch([{src:ally,target:a,n:1}],{deferSBA:true});await settle(g);assert.equal(c.power,power+(positive?1:0));
 }else if(name==='Danitha, Spear of Agony'){
  const c=await cast(),own=donor(),enemy=donor(b);await cast(noop('V47 targeting',[M.T.any()]),{aim:[positive?b:own]});assert.equal(c.counters['+1/+1']||0,positive?1:0);await cast(noop('V47 two targets',[M.T.any(),M.T.any()]),{aim:[b,enemy]});assert.equal(c.counters['+1/+1'],positive?2:1);const utility=donor(a,{abilities:[{cost:'{1}',targets:[M.T.creature()],label:'V47 targeted ability',effect:async()=>{}}]});aims=[enemy];const row=g.activatableList(a).find(x=>x.card===utility);assert.ok(row);assert.equal(await g.activateAbility(a,row),true);await settle(g);assert.equal(c.counters['+1/+1'],positive?2:1);
 }else if(name==='Danitha, Sword of Hope'){
  const c=await cast(),own=donor(),enemy=donor(b),hand=a.hand.length;await cast(noop('V47 targeting',[M.T.creature()]),{aim:[positive?own:enemy]});assert.equal(a.hand.length,hand+(positive?1:0));await cast(def('V47 Equipment',['Artifact'],{subtypes:['Equipment']}));assert.equal(a.hand.length,hand+1);g.turnNo++;await cast(noop('V47 next turn',[M.T.creature()]),{aim:[own]});assert.equal(a.hand.length,hand+2);
 }else if(name==='Yuriko, Blade of the Mighty'){
  const c=await cast(),ally=donor(),walker=donor(b,{types:['Planeswalker'],loyalty:'8'});g.addCounters(walker,'loyalty',8);const utility=donor(a,{abilities:[{cost:'{1}',label:'V47 utility',effect:async()=>{}}]}),entry=g.activatableList(a).find(x=>x.card===utility);assert.ok(entry);await attack(ally,positive?b:walker);assert.equal(ally.kw('double strike'),positive);for(const p of[a,b]){const spell=put(M,p,noop(),'hand');assert.equal(g.canCastTiming(p,spell),false);assert.equal(await g.castSpell(p,spell,{from:'hand'}),false);}assert.equal(g.activatableList(a).some(x=>x.card===utility),false);assert.equal(await g.activateAbility(a,entry),false);const land=permanent(M,g,a,M.DEFS.Forest),mana=g.manaSources(a).find(x=>x.card===land);assert.ok(mana);assert.equal(await g.activateManaSource(a,mana,{G:1}),true);g.phase='main2';assert.equal(g.canCastTiming(a,a.hand[0]),true);assert.equal(await g.activateAbility(a,entry),true);await settle(g);assert.equal(c.zone,'battlefield');
 }else throw Error('Missing v47 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV47(M,entry,op,role,h){
 if(!names.includes(entry.raw.name))return null;
 let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV47(M,entry.raw.name,role,positive,h,assert);return count;
}
