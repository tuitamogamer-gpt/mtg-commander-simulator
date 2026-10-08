import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=['Bob, Reluctant HYDRA Agent','Boom Box','Braids, Cabal Minion','Bushy Bodyguard','Circuits Act','Corpseberry Cultivator','Corrosive Ooze','Crimson Hellkite','Curious Forager',"Dina's Guidance",'Fendeep Summoner','Goatnapper','Groffskithur','Gruul Ragebeast','Guiding Spirit','Hatchet Bully','Heightened Awareness','Hellrider','Irreverent Gremlin','Longhorn Firebeast','Mageta the Lion','Mine Worker','Non-Human Cannonball','Overlaid Terrain','Reverse Polarity','Ride Down','Sawtooth Ogre','Scourglass','Slavering Nulls','Soul Charmer','Spreading Plague','Steadfast Armasaur','Treetop Sentries','Venom','Vexing Devil','Wall of Dust','Warchanter Skald'];
export async function proveCommonV50(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<65)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let aims=[],picks=[],yes='yes',opponentYes=positive?'yes':'no',x=positive?3:0;
 choose(a,q=>{
  if(q.type==='chooseTargets'&&aims.length){const picked=[aims.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets');return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&picks.length){const picked=picks.shift();assert.ok(picked.every(c=>q.from.includes(c)),'legal cards');return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseOption'&&name==="Dina's Guidance"&&q.options.some(o=>o.key==='graveyard'))return {...q,options:q.options.filter(o=>o.key===(positive?'hand':'graveyard'))};
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===yes))return {...q,options:q.options.filter(o=>o.key===yes)};
  if(q.type==='chooseX'&&name==='Crimson Hellkite'){assert.ok(q.max>=x);return {...q,min:x,max:x};}
  return null;
 });
 choose(b,q=>q.type==='chooseOption'&&q.options.some(o=>o.key===opponentYes)?{...q,options:q.options.filter(o=>o.key===opponentYes)}:null);
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V50 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const cast=async(n=name,{aim=[],resolve=true,opts={},card}={})=>{aims=aim.slice();card ||=put(M,a,n,'hand');const before=total(a);assert.equal(await g.castSpell(a,card,{from:card.zone,...opts}),true,typeof n==='string'?n:n.name);assert.ok(total(a)<before,'paid cast');if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,aim=[])=>{aims=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&!r.manaAbility);assert.ok(row,'legal activation');assert.equal(await g.activateAbility(a,row),true);await settle(g);return row;};
 const attack=async(cards,targets=cards.map(()=>b))=>{g.phase='combat';g.step='attackers';g.combat={attackers:cards,declaredAttackTargets:targets};for(let i=0;i<cards.length;i++){const c=cards[i];c.attacking=targets[i];c.blockedBy=[];c.wasBlocked=false;g.recordCombatObjectEvent(c,'attacks');}g.recalc();await g.emit('attackersDeclared',{player:a,attackers:cards});for(let i=0;i<cards.length;i++)await g.emit('attacks',{player:a,card:cards[i],defender:targets[i]});await settle(g);};
 const pair=async(attacker,blocker)=>{attacker.attacking=blocker.ctrl;attacker.blockedBy ||= [];attacker.blockedBy.push(blocker);attacker.wasBlocked=true;blocker.blocking=attacker.iid;g.combat ||= {attackers:[attacker],declaredAttackTargets:[blocker.ctrl]};await g.emit('blocks',{attacker,blocker});await g.emit('becomesBlockedByCreature',{attacker,blocker,blockers:attacker.blockedBy});};
 if(['Bushy Bodyguard','Curious Forager','Treetop Sentries','Corpseberry Cultivator'].includes(name)){
  const reward=put(M,a,'Sol Ring','graveyard'),payments=positive?Array.from({length:name==='Bushy Bodyguard'?6:3},()=>put(M,a,'Forest','graveyard')):await g.makeTokens(M.TOKENS.food,a,{n:name==='Bushy Bodyguard'?2:1});picks=name==='Bushy Bodyguard'?[payments.slice(0,positive?3:1),payments.slice(positive?3:1)]:[payments];const hand=a.hand.length,c=await cast(name,{aim:name==='Curious Forager'?[reward]:[]});
  if(name==='Corpseberry Cultivator'){picks=[payments];await g.emit('beginCombat',{player:a});await settle(g);assert.equal(c.counters['+1/+1'],1);const costFood=await g.makeTokens(M.TOKENS.food,a),utility=donor(a,{abilities:[{cost:{mana:'{1}',additionalCostV20:{kind:'forage',n:3}},run:async()=>{}}]});picks=[costFood];await activate(utility);assert.equal(c.counters['+1/+1'],2);}
  if(name==='Bushy Bodyguard'){assert.equal(c.counters['+1/+1'],2);const copy=g.bf().find(x=>x.isToken&&x.name===name);assert.ok(copy);assert.equal(copy.counters['+1/+1'],2);assert.equal(copy.power,3);}
  if(name==='Curious Forager')assert.equal(reward.zone,'hand');
  if(name==='Treetop Sentries')assert.equal(a.hand.length,hand+1);
  assert.equal(payments.every(c=>positive?c.zone==='exile':['graveyard','ceased'].includes(c.zone)),true);
  const noFood=g.bf().filter(c=>c.hasSub('Food'));for(const c of noFood)await g.move(c,'exile');yes='no';if(name==='Corpseberry Cultivator'){await g.emit('beginCombat',{player:a});await settle(g);assert.equal(c.counters['+1/+1'],2);}
 }else if(['Sawtooth Ogre','Corrosive Ooze','Venom'].includes(name)){
  const host=name==='Venom'?donor():null,c=await cast(name,{aim:host?[host]:[]}),self=host||c,other=donor(b,{subtypes:name==='Venom'&&!positive?['Wall']:[]}),equipment=permanent(M,g,b,def('V50 Equipment',['Artifact'],{subtypes:['Equipment']}));if(name==='Corrosive Ooze')await g.attach(equipment,other);
  await pair(positive?other:self,positive?self:other);await settle(g);assert.equal(other.damage,0);if(!positive&&name!=='Venom'){await g.move(other,'exile');await g.putPermanentOntoBattlefield(other,b);await settle(g);}await g.emit('endCombat',{player:g.turnPlayer});await settle(g);
  if(name==='Sawtooth Ogre')assert.equal(other.damage,positive?1:0);
  if(name==='Venom')assert.equal(other.zone,positive?'graveyard':'battlefield');
  if(name==='Corrosive Ooze')assert.equal(equipment.zone,positive?'graveyard':'battlefield');
 }else if(name==='Wall of Dust'){
  const c=await cast(),enemy=donor(b);g.turnPlayer=b;await pair(enemy,c);await settle(g);assert.equal(g.canAttackAtAll(enemy),true);if(!positive){await g.move(enemy,'exile');await g.putPermanentOntoBattlefield(enemy,b);enemy.sick=false;}
  g.mainPhase=async()=>{};let seen=[];g.combatPhase=async()=>{seen.push(g.canAttackAtAll(enemy));};await g.runTurn();await settle(g);assert.equal(seen[0],!positive);g.turnPlayer=b;await g.runTurn();await settle(g);assert.equal(seen[1],true);
 }else if(name==='Irreverent Gremlin'){
  const c=await cast(),discard=put(M,a,'Sol Ring','hand'),second=put(M,a,'Forest','hand');picks=[[discard]];const entrant=put(M,a,def('V50 low power',['Creature'],{power:positive?'2':'3'}),'hand'),size=a.library.length;await g.putPermanentOntoBattlefield(entrant,a);await settle(g);assert.equal(discard.zone,positive?'graveyard':'hand');assert.equal(a.library.length,size-(positive?1:0));const next=put(M,a,def('V50 second low power',['Creature'],{power:'2'}),'hand');if(positive)picks=[[second]];await g.putPermanentOntoBattlefield(next,a);await settle(g);assert.equal(a.library.length,size-1);assert.equal(c.kw('menace'),true);
 }else if(name==='Hellrider'){
  const c=await cast(),ally=donor(),walker=donor(b,{types:['Planeswalker'],loyalty:'10'});g.addCounters(walker,'loyalty',10);const life=b.life;await attack([c,ally],positive?[b,b]:[walker,b]);assert.equal(b.life,life-(positive?2:1));assert.equal(walker.counters.loyalty,positive?10:9);
 }else if(name==='Gruul Ragebeast'){
  const victim=donor(b,{power:'1'}),c=await cast(name,{aim:[victim]});assert.equal(victim.damage,c.power);assert.equal(c.damage,1);const entrant=put(M,a,def('V50 fight entrant',['Creature'],{power:'4',toughness:'10'}),'hand');aims=[victim];await g.putPermanentOntoBattlefield(entrant,a);if(!positive)await g.move(entrant,'exile');await settle(g);assert.equal(victim.damage,c.power+(positive?4:0));
 }else if(name==='Warchanter Skald'){
  const c=await cast(),eq=permanent(M,g,a,def('V50 Equipment',['Artifact'],{subtypes:['Equipment']}));if(positive)await g.attach(eq,c);await g.tap(c);await settle(g);assert.equal(g.bf().filter(c=>c.isToken&&c.hasSub('Dwarf')&&c.hasSub('Berserker')).length,positive?1:0);
 }else if(name==='Slavering Nulls'){
  const c=await cast(),card=put(M,b,'Forest','hand');if(positive)permanent(M,g,a,M.DEFS.Swamp);await g.damageBatch([{src:c,target:b,n:1}],{combat:true,deferSBA:true});await settle(g);assert.equal(card.zone,positive?'graveyard':'hand');
 }else if(name==='Groffskithur'){
  const c=await cast(),copy=put(M,a,name,'graveyard'),wrong=put(M,a,'Forest','graveyard'),enemy=donor(b);assert.equal(g.legalTargets(c.def.triggers[0].targets[0],c,a).includes(wrong),false);aims=[copy];c.attacking=b;await pair(c,enemy);await g.emit('becomesBlocked',{attacker:c,blockers:[enemy]});await settle(g);assert.equal(copy.zone,'hand');
 }else if(name==='Braids, Cabal Minion'){
  await cast();const land=permanent(M,g,b,M.DEFS.Forest),other=permanent(M,g,b,def('V50 enchantment',['Enchantment']));await g.emit('upkeep',{player:b});await settle(g);assert.equal(land.zone,'graveyard');assert.equal(other.zone,'battlefield');
 }else if(['Vexing Devil','Longhorn Firebeast'].includes(name)){
  const life=b.life,c=await cast();assert.equal(c.zone,positive?'graveyard':'battlefield');assert.equal(b.life,life-(positive?(name==='Vexing Devil'?4:5):0));
 }else if(name==='Spreading Plague'){
  await cast();const own=donor(a,{colorsOverride:['R']}),enemy=donor(b,{colorsOverride:['R']}),safe=donor(b,{colorsOverride:['U']}),entrant=put(M,a,def('V50 red entrant',['Creature'],{colorsOverride:['R']}),'hand');await g.putPermanentOntoBattlefield(entrant,a);if(!positive)await g.move(entrant,'exile');await settle(g);assert.equal(own.zone,'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(safe.zone,'battlefield');assert.equal(entrant.zone,positive?'battlefield':'exile');
 }else if(name==='Bob, Reluctant HYDRA Agent'){
  const c=await cast(),other=donor(),own=a.life,enemy=b.life;await attack(positive?[c]:[c,other]);assert.equal(c.zone,positive?'hand':'battlefield');assert.equal(a.life,own+(positive?2:0));assert.equal(b.life,enemy-(positive?2:0));
 }else if(name==='Crimson Hellkite'){
  const c=await cast(),enemy=donor(b);for(const k of Object.keys(a.pool))a.pool[k]=0;a.pool.R=positive?3:0;a.pool.U=10;await activate(c,[enemy]);assert.equal(enemy.damage,x);assert.equal(a.pool.R,0);assert.equal(a.pool.U,10);assert.equal(c.tapped,true);
 }else if(name==='Hatchet Bully'){
  const c=await cast(),ally=donor(),enemy=donor(b),before=total(a);picks=[[ally]];await activate(c,[enemy]);assert.equal(total(a),before-3);assert.equal(ally.counters['-1/-1'],1);assert.equal(enemy.damage,2);assert.equal(c.tapped,true);
 }else if(name==='Mageta the Lion'){
  const c=await cast(),enemy=donor(b),safe=donor(b,{kws:['indestructible']}),first=put(M,a,'Forest','hand'),second=put(M,a,'Forest','hand');picks=[[first,second]];await activate(c);assert.equal(first.zone,'graveyard');assert.equal(second.zone,'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(c.zone,'battlefield');assert.equal(safe.zone,'battlefield');assert.equal(c.tapped,true);
 }else if(name==='Scourglass'){
  const c=await cast(),creature=donor(b),artifact=permanent(M,g,b,M.DEFS['Sol Ring']),land=permanent(M,g,a,M.DEFS.Forest);assert.equal(g.activatableList(a).some(r=>r.card===c),false);g.phase='upkeep';g.step='upkeep';await activate(c);assert.equal(c.zone,'graveyard');assert.equal(creature.zone,'graveyard');assert.equal(artifact.zone,'battlefield');assert.equal(land.zone,'battlefield');
 }else if(name==='Fendeep Summoner'){
  const c=await cast(),one=permanent(M,g,a,M.DEFS.Swamp),two=permanent(M,g,b,M.DEFS.Swamp);await activate(c,[positive?[one,two]:[one]]);assert.equal(one.power,3);assert.equal(one.toughness,5);assert.equal(one.hasSub('Treefolk'),true);assert.equal(one.hasSub('Warrior'),true);assert.equal(one.is('Land'),true);assert.equal(two.is('Creature'),positive);
 }else if(name==='Steadfast Armasaur'){
  const c=await cast(),enemy=donor(b),wrong=donor(b);await pair(positive?enemy:c,positive?c:enemy);await settle(g);const spec=c.def.abilities[0].targets[0];assert.equal(g.legalTargets(spec,c,a).includes(wrong),false);await activate(c,[enemy]);assert.equal(enemy.damage,c.toughness);
 }else if(name==='Guiding Spirit'){
  const c=await cast(),top=put(M,b,positive?def('V50 grave creature'):M.DEFS.Forest,'graveyard');await activate(c,[b]);assert.equal(top.zone,positive?'library':'graveyard');if(positive)assert.equal(b.library.at(-1),top);
 }else if(name==='Boom Box'){
  const c=await cast(),artifact=permanent(M,g,b,M.DEFS['Sol Ring']),enemy=donor(b),land=permanent(M,g,b,M.DEFS.Forest);await activate(c,positive?[artifact,enemy,land]:[[],[],[]]);assert.equal(c.zone,'graveyard');for(const x of[artifact,enemy,land])assert.equal(x.zone,positive?'graveyard':'battlefield');
 }else if(name==='Goatnapper'){
  const goat=donor(b,{subtypes:['Goat']});g.tap(goat);const c=await cast(name,{aim:[goat]});assert.equal(goat.ctrl,a);assert.equal(goat.tapped,false);assert.equal(goat.kw('haste'),true);assert.equal(c.zone,'battlefield');
 }else if(name==='Mine Worker'){
  const c=await cast();donor(a,{name:'Power Plant Worker'});if(positive)donor(a,{name:'Tower Worker'});const life=a.life;await activate(c);assert.equal(a.life,life+(positive?3:1));
 }else if(name==='Non-Human Cannonball'||name==='Circuits Act'){
  const rolls=[],emit=g.emit;g.emit=async function(event,d,...args){if(event==='dieRolledV46')rolls.push(d.value);return emit.call(this,event,d,...args);};const life=a.life,c=await cast();if(name==='Non-Human Cannonball'){await g.destroy(c);await settle(g);assert.equal(rolls.length,1);assert.equal(a.life,life-(rolls[0]<=4?rolls[0]:0));}else{assert.equal(rolls.length,3);const tokens=g.bf().filter(c=>c.isToken&&c.hasSub('Clown'));assert.equal(tokens.length,new Set(rolls).size);assert.equal(tokens.every(c=>c.hasSub('Robot')&&c.is('Artifact')&&c.power===1),true);}
 }else if(name==='Heightened Awareness'){
  const card=put(M,a,'Sol Ring','hand'),c=await cast();assert.equal(card.zone,'graveyard');assert.equal(a.hand.length,0);await g.emit('drawStep',{player:a});await settle(g);assert.equal(a.hand.length,1);assert.equal(c.zone,'battlefield');
 }else if(name==='Overlaid Terrain'){
  const land=permanent(M,g,a,M.DEFS.Forest),foreign=permanent(M,g,b,M.DEFS.Forest),c=await cast();assert.equal(land.zone,'graveyard');assert.equal(foreign.zone,'battlefield');const fresh=permanent(M,g,a,M.DEFS.Forest),row=g.manaSources(a).find(r=>r.card===fresh&&r.m.produce?.some?.(x=>Object.values(x).reduce((n,v)=>n+v,0)===2));assert.ok(row);const before=a.pool.R;assert.equal(await g.activateManaSource(a,row,{R:2}),true);assert.equal(a.pool.R,before+2);assert.equal(c.zone,'battlefield');
 }else if(name==='Reverse Polarity'){
  const src=donor(b,{types:positive?['Artifact','Creature']:['Creature']}),other=donor(b);await g.damageBatch([{src,target:a,n:3},{src:other,target:a,n:2}],{deferSBA:true});await settle(g);const life=a.life;await cast();assert.equal(a.life,life+(positive?6:0));
 }else if(name==='Ride Down'){
  const attacker=donor(),blocker=donor(b);await pair(attacker,blocker);await settle(g);if(!positive){await g.move(attacker,'exile');await g.putPermanentOntoBattlefield(attacker,a);}await cast(name,{aim:[blocker]});assert.equal(blocker.zone,'graveyard');assert.equal(attacker.kw('trample'),positive);
 }else if(name==='Soul Charmer'){
  const c=await cast(),enemy=donor(b),life=a.life,before=total(b);await g.damageBatch([{src:c,target:enemy,n:1}],{combat:true,deferSBA:true});await settle(g);assert.equal(a.life,life+(positive?0:2));assert.equal(total(b),before-(positive?2:0));
 }else if(name==="Dina's Guidance"){
  const card=put(M,a,def('V50 creature to find'));picks=[[card]];await cast();assert.equal(card.zone,positive?'hand':'graveyard');
 }else throw Error('Missing v50 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV50(M,entry,op,role,h){if(!names.includes(entry.raw.name))return null;let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV50(M,entry.raw.name,role,positive,h,assert);return count;}
