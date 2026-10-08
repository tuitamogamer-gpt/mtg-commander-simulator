import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Abzan Beastmaster',"Amber Gristle O'Maul",'Crush of Tentacles','Distant Memories',"Faller's Faithful",'Fearless Swashbuckler','Garna, Bloodfist of Keld','Geralf, the Fleshwright','Graven Lore','Gravestorm','Horn of Plenty','Lumengrid Augur','Miles "Tails" Prower','Patient Rebuilding','Primitive Etchings','Razorkin Needlehead','Rowen','Shakedown Heavy','Skullknocker Ogre','Splinter, Aging Champion','Standstill','Step Between Worlds','Stiltzkin, Moogle Merchant','The Chief Warg','The Speed Demon','The Ten Rings','Uncover the Moon-Letters','Wicked Guardian'];
export async function proveCommonV49(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<65)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let aims=[],picks=[],yes='yes',opponentYes=positive?'yes':'no',scry=0;
 choose(a,q=>{
  if(q.type==='chooseTargets'&&aims.length){const picked=[aims.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets');return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&picks.length){const picked=picks.shift();assert.ok(picked.every(c=>q.from.includes(c)),'legal cards');return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===yes))return {...q,options:q.options.filter(o=>o.key===yes)};
  if(q.type==='scry')scry=q.cards.length;
  return null;
 });
 choose(b,q=>q.type==='chooseOption'&&q.options.some(o=>o.key===opponentYes)?{...q,options:q.options.filter(o=>o.key===opponentYes)}:null);
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V49 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const noop=(label='V49 instant',types=['Instant'],cost='{U}')=>def(label,types,{cost,resolve:types.includes('Instant')||types.includes('Sorcery')?async()=>{}:undefined});
 const cast=async(n=name,{aim=[],resolve=true,player=a,opts={},card}={})=>{if(player===a)aims=aim.slice();card ||=put(M,player,n,opts.from||'hand');const before=total(player);assert.equal(await g.castSpell(player,card,{from:card.zone,...opts}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid cast');if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,aim=[])=>{aims=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&!r.manaAbility);assert.ok(row,'legal native activation');const before=total(a);assert.equal(await g.activateAbility(a,row),true);assert.ok(total(a)<before,'paid activation');await settle(g);return row;};
 const attack=async(cards,defenders=cards.map(()=>b))=>{g.phase='combat';g.step='attackers';g.combat={attackers:cards,declaredAttackTargets:defenders};for(let i=0;i<cards.length;i++){const c=cards[i];c.attacking=defenders[i];c.blockedBy=[];c.wasBlocked=false;g.recordCombatObjectEvent(c,'attacks');}g.recalc();await g.emit('attackersDeclared',{player:a,attackers:cards});for(let i=0;i<cards.length;i++)await g.emit('attacks',{player:a,card:cards[i],defender:defenders[i]});await settle(g);};
 if(name==='Abzan Beastmaster'){
  const c=await cast(),own=donor(a,{toughness:'8'}),enemy=donor(b,{toughness:positive?'8':'9'}),hand=a.hand.length;await g.emit('upkeep',{player:a});await settle(g);assert.equal(a.hand.length,hand+(positive?1:0));await g.destroy(enemy);await g.emit('upkeep',{player:a});await settle(g);assert.equal(a.hand.length,hand+(positive?2:1));assert.equal(own.zone,'battlefield');
 }else if(name==="Amber Gristle O'Maul"){
  const c=await cast(),ally=donor(),walker=donor(b,{types:['Planeswalker'],loyalty:'9'});g.addCounters(walker,'loyalty',9);const old=put(M,a,'Sol Ring','hand');await attack([c,ally],positive?[b,b]:[walker,walker]);assert.equal(old.zone,'graveyard');assert.equal(a.hand.length,positive?1:0);
 }else if(name==='The Chief Warg'){
  const c=await cast(),ally=donor(a,{power:positive?'4':'3'}),hand=a.hand.length,life=a.life;await attack([ally]);assert.equal(a.hand.length,hand+(positive?1:0));assert.equal(a.life,life-(positive?1:0));assert.equal(c.kw('menace'),true);
 }else if(name==='The Speed Demon'){
  const c=await cast();assert.equal(a.counters.speed,1);if(positive){await g.loseLife(b,1);await settle(g);}const speed=a.counters.speed,hand=a.hand.length,life=a.life;await g.emit('endStep',{player:a});await settle(g);assert.equal(a.hand.length,hand+speed);assert.equal(a.life,life-speed);assert.equal(c.kw('flying'),true);assert.equal(c.kw('trample'),true);
 }else if(name==='The Ten Rings'){
  const c=await cast();while(a.hand.length<(positive?3:10))put(M,a,'Forest','hand');await g.emit('endStep',{player:a});await settle(g);assert.equal(a.hand.length,10);await g.emit('endStep',{player:b});await settle(g);assert.equal(a.hand.length,10);assert.equal(c.zone,'battlefield');
 }else if(name==='Uncover the Moon-Letters'){
  await cast();put(M,a,'Forest','hand');put(M,a,'Forest','hand');const hand=a.hand.length;await cast(noop('V49 mana value contrast',positive?['Artifact']:['Creature'],'{3}{U}'));assert.equal(a.hand.length,hand+(positive?2:0));if(positive)assert.equal(a.graveyard.length,2);
 }else if(name==='Miles "Tails" Prower'){
  await cast();const hand=a.hand.length,vehicle=put(M,a,def('V49 vehicle',['Artifact'],{subtypes:['Vehicle'],kws:positive?['flying']:[]}),'hand');await g.putPermanentOntoBattlefield(vehicle,a);await settle(g);assert.equal(a.hand.length,hand+(positive?1:0));assert.equal(vehicle.counters.flying||0,positive?0:1);assert.equal(vehicle.kw('flying'),true);const enemy=put(M,b,vehicle.def,'hand');await g.putPermanentOntoBattlefield(enemy,b);await settle(g);assert.equal(enemy.counters.flying||0,0);
 }else if(name==='Garna, Bloodfist of Keld'){
  const c=await cast(),ally=donor(),hand=a.hand.length,life=b.life;if(positive)ally.attacking=b;await g.destroy(ally);await settle(g);assert.equal(a.hand.length,hand+(positive?1:0));assert.equal(b.life,life-(positive?0:1));await g.destroy(c);await settle(g);assert.equal(b.life,life-(positive?0:1));
 }else if(name==="Faller's Faithful"){
  const enemy=donor(b);if(positive){await g.damageBatch([{src:donor(),target:enemy,n:1}],{deferSBA:true});enemy.damage=0;}const hand=b.hand.length;await cast(name,{aim:[enemy]});assert.equal(enemy.zone,'graveyard');assert.equal(b.hand.length,hand+(positive?0:2));
 }else if(name==='Standstill'){
  const c=await cast(),hand=a.hand.length,enemy=b.hand.length;await cast(noop(),{player:positive?b:a,resolve:false});if(!positive)await g.move(c,'exile');await settle(g);assert.equal(c.zone,positive?'graveyard':'exile');assert.equal(a.hand.length,hand+(positive?3:0));assert.equal(b.hand.length,enemy);
 }else if(name==='Horn of Plenty'){
  const c=await cast(),hand=b.hand.length,before=total(b);await cast(noop(),{player:b});assert.equal(total(b),before-1-(positive?1:0));assert.equal(b.hand.length,hand);await g.move(c,'exile');await g.emit('endStep',{player:a});await settle(g);assert.equal(b.hand.length,hand+(positive?1:0));await g.emit('endStep',{player:b});await settle(g);assert.equal(b.hand.length,hand+(positive?1:0));
 }else if(name==='Skullknocker Ogre'){
  const c=await cast(),card=positive?put(M,b,'Forest','hand'):null,before=b.library.length;await g.damageBatch([{src:c,target:b,n:1}],{combat:false,deferSBA:true});await settle(g);assert.equal(b.library.length,before-(positive?1:0));if(card)assert.equal(card.zone,'graveyard');
 }else if(name==='Wicked Guardian'){
  yes=positive?'yes':'no';const ally=donor(),hand=a.hand.length;await cast();assert.equal(ally.damage,positive?2:0);assert.equal(a.hand.length,hand+(positive?1:0));
 }else if(name==='Rowen'||name==='Primitive Etchings'){
  await cast();const top=put(M,a,name==='Rowen'?(positive?'Forest':'Sol Ring'):def('V49 revealed',positive?['Creature']:['Artifact']));let revealed=[];g.revealToHuman=async q=>{if(q.kind==='reveal')revealed.push(...q.cards);};const hand=a.hand.length;await g.draw(a,1);await settle(g);assert.equal(a.hand.length,hand+(positive?2:1));assert.ok(revealed.includes(top));await g.draw(a,1);await settle(g);assert.equal(a.hand.length,hand+(positive?3:2));assert.equal(revealed.length,1);
 }else if(name==='Razorkin Needlehead'){
  const c=await cast(),life=b.life,own=a.life;await g.draw(positive?b:a,2);await settle(g);assert.equal(b.life,life-(positive?2:0));assert.equal(a.life,own);assert.equal(c.kw('first strike'),true);g.turnPlayer=b;g.recalc();assert.equal(c.kw('first strike'),false);
 }else if(name==='Shakedown Heavy'){
  const c=await cast(),hand=a.hand.length;g.tap(c);await attack([c]);assert.equal(a.hand.length,hand+(positive?1:0));assert.equal(!!c.attacking,!positive);assert.equal(c.tapped,!positive);assert.equal(g.combat.attackers.includes(c),!positive);
 }else if(name==='Patient Rebuilding'){
  const c=await cast(),land1=put(M,b,'Forest'),land2=put(M,b,positive?'Forest':'Sol Ring'),other=put(M,b,'Sol Ring'),hand=a.hand.length;aims=[b];await g.emit('upkeep',{player:a});await settle(g);assert.equal(a.hand.length,hand+(positive?2:1));assert.equal(land1.zone,'graveyard');assert.equal(land2.zone,'graveyard');assert.equal(other.zone,'graveyard');assert.equal(c.zone,'battlefield');
 }else if(name==='Gravestorm'){
  await cast();const card=put(M,b,'Forest','graveyard'),hand=a.hand.length;aims=[b];await g.emit('upkeep',{player:a});await settle(g);assert.equal(card.zone,positive?'exile':'graveyard');assert.equal(a.hand.length,hand+(positive?0:1));
 }else if(name==='Lumengrid Augur'){
  const c=await cast(),card=put(M,a,positive?'Sol Ring':'Forest','hand');picks=[[card]];await activate(c,[a]);assert.equal(card.zone,'graveyard');assert.equal(c.tapped,!positive);
 }else if(name==='Stiltzkin, Moogle Merchant'){
  const c=await cast(),ally=donor(),hand=a.hand.length;await activate(c,[b,ally]);assert.equal(ally.ctrl,b);assert.equal(a.hand.length,hand+1);assert.equal(c.tapped,true);assert.equal(g.legalTargets(c.def.abilities[0].targets[1],c,a).includes(c),false);
 }else if(name==='Splinter, Aging Champion'){
  const enemy=donor(b);g.tap(enemy);const c=await cast(name,{aim:[enemy]});assert.equal(enemy.zone,'graveyard');const hand=a.hand.length,other=b.hand.length;aims=[b];await g.move(c,positive?'exile':'hand');await settle(g);assert.equal(a.hand.length,hand+1+(positive?0:1));assert.equal(b.hand.length,other+1);
 }else if(name==='Fearless Swashbuckler'){
  const c=await cast(),vehicle=donor(a,{types:['Artifact','Creature'],subtypes:['Vehicle']}),ally=donor(),hand=a.hand.length;put(M,a,'Forest','hand');put(M,a,'Forest','hand');assert.equal(vehicle.kw('haste'),true);await attack(positive?[c,vehicle]:[c,ally]);assert.equal(a.hand.length,hand+2+(positive?1:0));
 }else if(name==='Geralf, the Fleshwright'){
  const c=await cast(),one=put(M,a,def('V49 first Zombie',['Creature'],{subtypes:['Zombie']}),'hand');await g.putPermanentOntoBattlefield(one,a);await settle(g);assert.equal(one.counters['+1/+1']||0,0);if(!positive)await g.move(one,'exile');await cast(noop());const zombies=g.bf().filter(x=>x.isToken&&x.hasSub('Zombie'));assert.equal(zombies.length,1);assert.equal(zombies[0].counters['+1/+1'],1);g.turnNo++;a.turnState=a.freshTurnState();const next=put(M,a,one.def,'hand');await g.putPermanentOntoBattlefield(next,a);await settle(g);assert.equal(next.counters['+1/+1']||0,0);assert.equal(c.zone,'battlefield');
 }else if(name==='Graven Lore'){
  for(const k of Object.keys(a.pool))a.pool[k]=0;a.pool.C=positive?0:3;a.pool.U=2;if(positive){const land=permanent(M,g,a,M.DEFS['Snow-Covered Forest']);for(let i=0;i<3;i++){await g.untap(land);const mana=g.manaSources(a).find(x=>x.card===land);assert.equal(await g.activateManaSource(a,mana,{G:1}),true);}await g.move(land,'exile');}const hand=a.hand.length;await cast();assert.equal(scry,positive?3:0);assert.equal(a.hand.length,hand+3);
 }else if(name==='Crush of Tentacles'){
  const land=permanent(M,g,a,M.DEFS.Forest),own=donor(),enemy=donor(b);if(positive)await cast(noop());await cast(name,{opts:positive?{alt:{surge:true,altCostStr:'{3}{U}{U}'}}:{}});assert.equal(own.zone,'hand');assert.equal(enemy.zone,'hand');assert.equal(land.zone,'battlefield');const tokens=g.bf().filter(c=>c.isToken&&c.hasSub('Octopus'));assert.equal(tokens.length,positive?1:0);if(tokens.length)assert.equal(tokens[0].power,8);
 }else if(name==='Distant Memories'){
  const card=put(M,a,'Sol Ring'),hand=a.hand.length;picks=[[card]];await cast();assert.equal(card.zone,positive?'hand':'exile');assert.equal(a.hand.length,hand+(positive?1:3));
 }else if(name==='Step Between Worlds'){
  const own=put(M,a,'Sol Ring','graveyard'),enemy=put(M,b,'Sol Ring','graveyard'),hand=put(M,b,'Forest','hand'),c=await cast();assert.equal(c.zone,'exile');assert.equal(a.hand.length,7);assert.equal(a.graveyard.length,0);assert.equal(b.hand.length,positive?7:1);assert.equal(b.graveyard.length,positive?0:1);assert.ok(['library','hand'].includes(own.zone));assert.equal(enemy.zone==='graveyard',!positive);assert.equal(hand.zone==='hand'||hand.zone==='library',true);
 }else throw Error('Missing v49 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV49(M,entry,op,role,h){if(!names.includes(entry.raw.name))return null;let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV49(M,entry.raw.name,role,positive,h,assert);return count;}
