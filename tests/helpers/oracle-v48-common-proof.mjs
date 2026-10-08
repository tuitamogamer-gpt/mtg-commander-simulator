import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Ashes of the Abhorrent','Brand of Ill Omen','Bruvac the Grandiloquent','City of Solitude','Clockwork Servant','Corporeal Projection','Criminal Past','Duke Ulder Ravengard','Elturel Survivors','Final Fortune','Font of Magic','Gate Smasher','Gaze of the Gorgon','Giant Beaver','Glyph of Doom','Hand to Hand','Hired Hexblade',"Infiltrator's Magemark",'Inquisitive Glimmer','Inspiring Leader','Jaded Sell-Sword','Keeper of Tresserhorn','Last Chance','O-Naginata','Ophidian','Phyrexian Obliterator','Price of Betrayal','Savor the Moment','Shadow of Mortality','Spatial Binding',"Sphinx's Decree",'Subterranean Schooner','Takeno, Samurai General','Venomous Breath',"Warrior's Oath",'Yore-Tiller Nephilim'];
export async function proveCommonV48(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<60)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let aims=[],picks=[],yes=positive?'yes':'no';
 choose(a,q=>{
  if(q.type==='chooseTargets'&&aims.length){const picked=[aims.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets');return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&picks.length){const picked=picks.shift();assert.ok(picked.every(c=>q.from.includes(c)));return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseX'&&name==='Price of Betrayal')return {...q,min:positive?5:0,max:positive?5:0};
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===yes))return {...q,options:q.options.filter(o=>o.key===yes)};
  return null;
 });
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V48 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const cast=async(n=name,{aim=[],resolve=true,player=a,opts={},card}={})=>{if(player===a)aims=aim.slice();card ||=put(M,player,n,opts.from||'hand');const before=total(player);assert.equal(await g.castSpell(player,card,{from:card.zone,...opts}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid cast');if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,predicate,aim=[])=>{aims=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&predicate(r));assert.ok(row,'legal native activation');assert.equal(await g.activateAbility(a,row),true);await settle(g);return row;};
 const noop=(label='V48 instant',types=['Instant'],cost='{U}')=>def(label,types,{cost,resolve:types.includes('Instant')||types.includes('Sorcery')?async()=>{}:undefined});
 const attack=async(c,defender=b)=>{g.phase='combat';g.step='attackers';c.attacking=defender;c.blockedBy=[];c.wasBlocked=false;g.combat={attackers:[c],declaredAttackTargets:[defender]};g.recordCombatObjectEvent(c,'attacks');g.recalc();await g.emit('attacks',{player:a,card:c,defender});await g.emit('attackersDeclared',{player:a,attackers:[c]});await settle(g);};
 const blankTurn=async()=>{g.mainPhase=async()=>{};g.combatPhase=async()=>{};await g.runTurn();await settle(g);fund(a);fund(b);};
 if(name==='Bruvac the Grandiloquent'){
  const c=await cast(),before=b.library.length,own=a.library.length;await g.mill(b,3);await g.mill(a,3);assert.equal(b.library.length,before-6);assert.equal(a.library.length,own-3);await g.move(c,'exile');await g.mill(b,3);assert.equal(b.library.length,before-9);
 }else if(['City of Solitude','Hand to Hand','Ashes of the Abhorrent','Brand of Ill Omen'].includes(name)){
  const host=donor(b),c=await cast(name,{aim:name==='Brand of Ill Omen'?[host]:[]}),utility=donor(b,{abilities:[{cost:{mana:'{1}'},run:async()=>{b.activatedV48=true;}}]}),entry=g.activatableList(b).find(r=>r.card===utility);
  const instant=put(M,b,noop(),'hand'),creature=put(M,b,noop('V48 creature',['Creature']),name==='Ashes of the Abhorrent'?'graveyard':'hand');g.turnPlayer=positive?a:b;g.phase=name==='Hand to Hand'&&positive?'combat':'main1';
  if(name==='Brand of Ill Omen'){g.turnPlayer=b;assert.equal(g.canCastTiming(b,creature),false);assert.equal(g.canCastTiming(b,instant),true);await g.move(c,'exile');assert.equal(g.canCastTiming(b,creature),true);}
  else if(name==='Ashes of the Abhorrent'){creature.def={...creature.def,gyAbility:{cost:'{1}',exileSelf:false,run:async()=>{}}};g.recalc();assert.equal(g.canCastTiming(b,creature,{from:'graveyard'}),false);assert.equal(g.activatableList(b).some(r=>r.card===creature),false);const life=a.life;await g.destroy(host);await settle(g);assert.equal(a.life,life+1);await g.move(c,'exile');assert.equal(g.activatableList(b).some(r=>r.card===creature),true);}
  else{assert.equal(g.canCastTiming(b,instant),!positive);assert.equal(g.activatableList(b).some(r=>r.card===utility),!positive);if(positive){assert.equal(await g.castSpell(b,instant,{from:'hand'}),false);const land=permanent(M,g,b,M.DEFS.Forest),mana=g.manaSources(b).find(r=>r.card===land);if(name==='City of Solitude')assert.equal(mana,undefined);else{assert.ok(mana);assert.equal(await g.activateManaSource(b,mana,{G:1}),true);}await g.move(c,'exile');assert.equal(g.canCastTiming(b,instant),true);}assert.equal(await g.activateAbility(b,g.activatableList(b).find(r=>r.card===utility)),true);await settle(g);assert.equal(b.activatedV48,true);}
 }else if(name==='Clockwork Servant'||name==='Hired Hexblade'||name==='Jaded Sell-Sword'){
  for(const col of Object.keys(a.pool))a.pool[col]=0;
  if(name==='Clockwork Servant'){a.pool.C=positive?0:3;a.pool.G=positive?3:0;}
  else{a.pool.B=name==='Hired Hexblade'?1:0;a.pool.R=name==='Jaded Sell-Sword'?1:0;a.pool.C=name==='Hired Hexblade'?1:3;if(positive){if(name==='Hired Hexblade')a.pool.B--;else a.pool.C--;const tokens=await g.makeTokens(M.TOKENS.treasure,a,{n:1});const source=g.manaSources(a).find(r=>r.card===tokens[0]);assert.ok(source);assert.equal(await g.activateManaSource(a,source,{B:1}),true);}}
  const hand=a.hand.length,life=a.life,c=await cast();assert.equal(c.castMeta.treasureManaV48||0,positive&&name!=='Clockwork Servant'?1:0);
  if(name==='Jaded Sell-Sword'){assert.equal(c.kw('first strike'),positive);assert.equal(c.kw('haste'),positive);}else{assert.equal(a.hand.length,hand+(positive?1:0));assert.equal(a.life,life-(positive&&name==='Hired Hexblade'?1:0));}
 }else if(name==='Spatial Binding'){
  const target=donor(),c=await cast(),life=a.life;await activate(c,r=>r.ability===c.def.abilities[0],[target]);assert.equal(a.life,life-1);assert.equal(g.phaseOutMany([target]).length,0);await g.emit('upkeep',{player:b});assert.equal(g.phaseOutMany([target]).length,0);await g.emit('upkeep',{player:a});assert.equal(g.phaseOutMany([target]).length,1);
 }else if(name==='Price of Betrayal'){
  const target=positive?b:donor(b);if(target===b)b.poison=7;else g.addCounters(target,'+1/+1',7);await cast(name,{aim:[target]});assert.equal(positive?target.poison:target.counters['+1/+1'],positive?2:7);
 }else if(name==='Font of Magic'){
  const cmd=put(M,a,noop('V48 commander',['Creature'],'{G}'),'command');cmd.commander=true;a.commanders.push(cmd);await cast(cmd.def,{card:cmd});await g.move(cmd,'command');await cast(cmd.def,{card:cmd});assert.equal(cmd.cmdCasts,2);const c=await cast();const spell=put(M,a,noop('V48 expensive',['Instant'],'{3}{U}'),'hand'),enemy=put(M,b,spell.def,'hand'),creature=put(M,a,noop('V48 body',['Creature'],'{3}{U}'),'hand');assert.equal(g.spellCost(a,spell,{from:'hand'}).generic,1);assert.equal(g.spellCost(b,enemy,{from:'hand'}).generic,3);assert.equal(g.spellCost(a,creature,{from:'hand'}).generic,3);const before=total(a);await cast(spell.def,{card:spell});assert.equal(total(a),before-2);await g.move(c,'exile');assert.equal(g.spellCost(a,put(M,a,spell.def,'hand'),{from:'hand'}).generic,3);
 }else if(name==='Shadow of Mortality'){
  a.life=positive?20:45;const card=put(M,a,name,'hand'),before=total(a);await cast(name,{card});assert.equal(total(a),before-(positive?2:15));assert.equal(card.power,7);
 }else if(name==='Gate Smasher'||name==='O-Naginata'){
  const c=await cast(),weak=donor(a,{power:'1',toughness:'1'}),host=donor(a,{power:'4',toughness:'5'});assert.equal(g.legalEntryAttachment(c,weak,a),false);assert.equal(await g.attach(c,weak),false);const before=total(a);await activate(c,r=>r.equip,[host]);assert.equal(total(a),before-(name==='Gate Smasher'?3:2));assert.equal(c.attachedTo,host.iid);assert.equal(host.kw('trample'),true);M.E.pumpUntilEOT(g,host,-20,-20,[]);await g.checkSBA();assert.equal(c.attachedTo,null);
 }else if(name==='Inquisitive Glimmer'){
  const c=await cast(),room=permanent(M,g,a,M.DEFS['Bottomless Pool // Locker Room']||M.DEFS['Bottomless Pool']);assert.ok(room.def.bdfRoom);room.meta.bdfUnlocked=[room.def.bdfRoom[0].key];g.recalc();const door=room.def.bdfRoom[1],printed=M.parseCost(door.cost),expected=Math.max(0,printed.generic-1)+printed.pips.length,before=total(a);await activate(room,r=>r.oracleUnlockRoomV20===door.key);assert.equal(total(a),before-expected);assert.ok(room.meta.bdfUnlocked.includes(door.key));assert.equal(c.zone,'battlefield');
 }else if(name==='Inspiring Leader'||name==='Criminal Past'){
  const cmd=donor(a,{power:'2',toughness:'4'});cmd.commander=true;a.commanders.push(cmd);const token=(await g.makeTokens({name:'V48 Bear',types:['Creature'],subtypes:['Bear'],power:'2',toughness:'2',cost:'',super:[]},positive?a:b,{n:1}))[0];for(let i=0;i<3;i++)put(M,a,'Grizzly Bears','graveyard');const c=await cast();if(name==='Inspiring Leader'){assert.equal(token.power,positive?4:2);assert.equal(cmd.power,2);}else{assert.equal(cmd.power,5);assert.equal(cmd.kw('menace'),true);}M.OracleV8Control.gain(g,cmd,b);g.recalc();if(name==='Inspiring Leader')assert.equal(token.power,positive?2:4);else{assert.equal(cmd.power,2);assert.equal(cmd.kw('menace'),true);}await g.move(c,'exile');assert.equal(token.power,2);assert.equal(cmd.kw('menace'),false);
 }else if(name==='Takeno, Samurai General'){
  const d=def('V48 Samurai',['Creature'],{subtypes:['Samurai'],power:'2',toughness:'5'});M.applyOracleMechanic(d,{kind:'mechanic-bushido',n:2});const samurai=donor(a,d),other=donor(b,d),c=await cast();assert.equal(samurai.power,4);assert.equal(other.power,2);assert.equal(c.power,3);await g.move(c,'exile');assert.equal(samurai.power,2);
 }else if(name==='Elturel Survivors'){
  for(let i=0;i<3;i++)permanent(M,g,b,M.DEFS.Forest);const c=await cast();assert.equal(c.power,0);await attack(c);assert.equal(c.power,3);await g.move(g.lands(b)[0],'hand');assert.equal(c.power,2);c.attacking=null;g.recalc();assert.equal(c.power,0);
 }else if(name==="Infiltrator's Magemark"){
  const own=donor(),plain=donor(),enemy=donor(b),wall=donor(b,{kws:['defender']}),c=await cast(name,{aim:[own]});assert.equal(own.power,4);assert.equal(plain.power,3);assert.equal(g.canBlock(enemy,own),false);assert.equal(g.canBlock(wall,own),true);await g.move(c,'exile');assert.equal(own.power,3);assert.equal(g.canBlock(enemy,own),true);
 }else if(name==='Phyrexian Obliterator'){
  const source=donor(b),second=donor(b),third=donor(b),c=await cast();await g.damageBatch([{src:source,target:c,n:positive?2:1}],{deferSBA:true});await settle(g);assert.equal([source,second,third].filter(c=>c.zone==='graveyard').length,positive?2:1);assert.equal(c.zone,'battlefield');
 }else if(name==='Keeper of Tresserhorn'||name==='Ophidian'){
  const c=await cast(),hand=a.hand.length,life=b.life;await attack(c);await g.emit('blockersDeclared',{player:a,attackers:[c]});await settle(g);await g.combatDamage(a,'normal');await settle(g);assert.equal(a.hand.length,hand+(name==='Ophidian'&&positive?1:0));assert.equal(b.life,life-(name==='Keeper of Tresserhorn'?2:positive?0:c.power));
 }else if(name==='Yore-Tiller Nephilim'){
  const dead=put(M,a,'Grizzly Bears','graveyard'),c=await cast();aims=[dead];await attack(c);assert.equal(dead.zone,'battlefield');assert.equal(dead.tapped,true);assert.equal(dead.attacking,b);assert.ok(g.combat.attackers.includes(dead));
 }else if(name==='Giant Beaver'||name==='Subterranean Schooner'){
  const pilot=donor(),outsider=donor(),c=await cast();picks=[[pilot]];await activate(c,r=>name==='Giant Beaver'?r.ability?.oracleSaddleV10:r.crew);assert.equal(pilot.tapped,true);assert.equal(g.legalTargets(c.def.triggers[0].targets[0],c,a).includes(outsider),false);aims=[pilot];const hand=a.hand.length;await attack(c);if(name==='Giant Beaver')assert.equal(pilot.counters['+1/+1'],1);else assert.equal(a.hand.length,hand+1);
 }else if(['Gaze of the Gorgon','Venomous Breath','Glyph of Doom'].includes(name)){
  const source=donor(a,{subtypes:['Wall']}),victim=donor(b),other=donor(b);g.phase='combat';g.step='blockers';source.blocking=victim.iid;victim.attacking=a;victim.blockedBy=[source];g.combat={attackers:[victim]};await g.emit('blocks',{blocker:source,attacker:victim});await settle(g);await cast(name,{aim:[source]});if(!positive){await g.move(victim,'exile');await g.putPermanentOntoBattlefield(victim,b);}await g.emit('endCombat',{player:b});await settle(g);assert.equal(victim.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,'battlefield');
 }else if(name==="Sphinx's Decree"){
  await cast();const instant=put(M,b,noop(),'hand');assert.equal(g.canCastTiming(b,instant),true);g.turnPlayer=b;let checked=false;g.mainPhase=async()=>{checked=true;fund(b);assert.equal(g.canCastTiming(b,instant),false);assert.equal(await g.castSpell(b,instant,{from:'hand'}),false);const creature=put(M,b,noop('V48 allowed',['Creature']), 'hand');assert.equal(g.canCastTiming(b,creature),true);};g.combatPhase=async()=>{};await g.runTurn();assert.equal(checked,true);assert.equal(g.canCastTiming(b,instant),true);
 }else if(['Savor the Moment','Final Fortune','Last Chance',"Warrior's Oath"].includes(name)){
  const land=permanent(M,g,a,M.DEFS.Forest);g.tap(land);await cast();g.scheduleExtraTurn(b);g.advanceTurnPlayer(a);assert.equal(g.turnPlayer,b);await blankTurn();assert.equal(g.turnPlayer,a);assert.equal(a.lost,false);let observed=false;g.mainPhase=async()=>{observed=true;assert.equal(land.tapped,name==='Savor the Moment');};g.combatPhase=async()=>{};await g.runTurn();await settle(g);assert.equal(observed,true);assert.equal(a.lost,name!=='Savor the Moment');
 }else if(name==='Corporeal Projection'||name==='Duke Ulder Ravengard'){
  const third=g.addPlayer('Third',{name:'Third'},b.controller,false);while(third.library.length<30)put(M,third,'Forest');const ally=donor(a,{mustAttack:true}),other=donor();let c;if(name==='Corporeal Projection'){c=await cast(name,{aim:positive?[ally]:[],opts:positive?{}:{alt:{overloaded:true,altCostStr:'{3}{U}{U}{R}{R}'}}});assert.equal(other.kw('myriad'),!positive);}else{c=await cast();aims=[ally];await g.emit('beginCombat',{player:a});await settle(g);assert.equal(ally.kw('haste'),true);}
  assert.equal(ally.kw('myriad'),true);yes='yes';let copies=0;const make=g.copyPermanentToken.bind(g);g.copyPermanentToken=async(card,...args)=>{const result=await make(card,...args);if(card===ally)copies+=result.length;return result;};await g.combatPhase(a);await settle(g);assert.equal(copies,1);assert.equal(g.bf().some(c=>c.isToken&&c.meta.exileEndCombat),false);
 }else throw Error('Missing v48 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV48(M,entry,op,role,h){
 if(!names.includes(entry.raw.name)||!['common-rule-v48','generic-ability','generic-trigger','cost-modifier','spell-generic','spell-modal-generic','mechanic-overload'].includes(op.kind))return null;
 let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV48(M,entry.raw.name,role,positive,h,assert);return count;
}
