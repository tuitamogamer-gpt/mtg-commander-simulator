import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=["Iridescent Drake", "Essence Reliquary", "Getaway Car", "Loki, God of Mischief", "Retromancer", "Lava Runner", "Bellowing Fiend", "Carrion Locust", "Norika Yamazaki, the Poet", "Roving Keep", "Furnace Punisher", "Hobble", "Serpent of Yawning Depths", "Illusory Gains", "Instill Furor", "Mind Maggots", "Rot Farm Skeleton", "Sequestered Stash", "Nivix, Aerie of the Firemind", "Arena Rector", "Cyclone Summoner", "Phantom Carriage", "Urborg Stalker", "Boing!", "Knight of Wundagore", "Patriarch's Bidding", "Pulsemage Advocate", "Umbilicus", "Acrobatic Cheerleader", "Goblin Bangchuckers", "Goblin Traprunner", "Fickle Efreet", "Velukan Dragon", "Dramatist's Puppet", "Quarry Hauler", "Ambitious Dragonborn", "Asmira, Holy Avenger", "Bloodbond March", "Lozhan, Dragons' Legacy", "Sonic Shrieker", "Stampede Surfer", "No Rest for the Wicked", "Armored Kincaller", "Infernal Kirin", "Skyfire Kirin", "Crown of Empires", "Emberwilde Djinn", "Cloudspire Skycycle", "Turtle Tracks", "Dauntless Bodyguard", "Cultist of the Absolute", "Carrionette", "Owen Grady, Raptor Trainer", "Face of Divinity", "Skulking Killer", "Nullmage Advocate"];
export async function proveCommonV53(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<65)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let aims=[],picks=[],enemyAims=[],enemyPicks=[],yes='yes',opponentYes=positive?'yes':'no',mode=positive?1:2;
 const constrain=(q,player)=>{const targetQueue=player===a?aims:enemyAims,cardQueue=player===a?picks:enemyPicks,key=player===a?yes:opponentYes;
  if(q.type==='chooseTargets'&&targetQueue.length){const picked=[targetQueue.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets '+q.prompt);return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&cardQueue.length){const picked=cardQueue.shift();assert.ok(picked.every(c=>q.from.includes(c)),'legal cards '+q.prompt);return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseOption'&&q.options.some(o=>o.key==='heads'))return {...q,options:q.options.filter(o=>o.key===(positive?'heads':'tails'))};
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===key))return {...q,options:q.options.filter(o=>o.key===key)};
  if(q.type==='chooseOption'&&name==="Patriarch's Bidding"&&q.options.some(o=>o.key==='Elf'))return {...q,options:q.options.filter(o=>o.key===(player===a?'Elf':'Zombie'))};
  if(q.type==='chooseOption'&&name==='Gnostro, Voice of the Crags'&&q.options.length===3)return {...q,options:[q.options[mode]]};
  return null;
 };choose(a,q=>constrain(q,a));choose(b,q=>constrain(q,b));
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V53 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const noop=(label='V53 instant',extra={})=>def(label,['Instant'],{cost:'{U}',resolve:async()=>{},...extra});
 const cast=async(n=name,{aim=[],resolve=true,opts={},card,player=a}={})=>{if(player===a)aims=aim.slice();else enemyAims=aim.slice();card ||=put(M,player,n,'hand');const before=total(player);if(card.is('Land')){assert.equal(await g.playLand(player,card),true);assert.equal(total(player),before);}else{assert.equal(await g.castSpell(player,card,{from:card.zone,...opts}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid cast');}if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,aim=[],resolve=true,predicate=r=>!r.manaAbility)=>{aims=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&predicate(r));assert.ok(row,'legal activation '+c.name);assert.equal(await g.activateAbility(a,row),true);if(resolve)await settle(g);return row;};
 const auraDef=def('V53 creature Aura',['Enchantment'],{subtypes:['Aura'],cost:'{U}',auraTarget:[M.T.creature()]});
 const attach=async(p,host)=>{const c=put(M,p,auraDef,'hand');await g.move(c,'battlefield',{ctrl:p,attachTo:host});await settle(g);assert.equal(c.attachedTo,host.iid);return c;};
 const attack=async(cards,player=a)=>{g.turnPlayer=player;g.phase='combat';g.step='attackers';const target=player===a?b:a;g.combat={attackers:cards,declaredAttackTargets:cards.map(()=>target)};for(const c of cards){c.attacking=target;c.blockedBy=[];c.wasBlocked=false;c.meta._attackedTurn=g.turnNo;g.recordCombatObjectEvent(c,'attacks');}g.recalc();await g.emit('attackersDeclared',{player,attackers:cards});for(const c of cards)await g.emit('attacks',{player,card:c,defender:target});await settle(g);};
 const endStep=async player=>{await g.emit('endStep',{player});await settle(g);};
 if(name==='Iridescent Drake'){
  const aura=put(M,b,auraDef,'graveyard'),c=await cast(name,{aim:[aura],resolve:positive});if(!positive){await g.resolveTop();await g.move(c,'exile');await settle(g);}assert.equal(aura.zone,positive?'battlefield':'graveyard');if(positive){assert.equal(aura.ctrl,a);assert.equal(aura.attachedTo,c.iid);}
 }else if(name==='Essence Reliquary'){
  const c=await cast(),host=donor(),own=await attach(a,host),foreign=await attach(b,host);g.turnPlayer=b;assert.equal(g.activatableList(a).some(r=>r.card===c),false);g.turnPlayer=a;await activate(c,[host]);assert.equal(host.zone,'hand');assert.equal(own.zone,'hand');assert.equal(foreign.zone,'graveyard');assert.equal(c.tapped,true);
 }else if(name==='Getaway Car'){
  const pilot=donor(),other=donor(),c=await cast();picks=[[pilot]];await activate(c,[],true,r=>r.crew);assert.equal(c.is('Creature'),true);aims=[pilot];if(positive)await attack([c]);else{other.attacking=a;c.blocking=other.iid;await g.emit('blocks',{attacker:other,blocker:c});await settle(g);}assert.equal(pilot.zone,'hand');assert.equal(other.zone,'battlefield');
 }else if(name==='Loki, God of Mischief'){
  const c=await cast(),target=donor(b),utility=donor(a,{abilities:[{cost:{mana:'{1}'},targets:[M.T.creature()],run:async()=>{}}]}),hand=a.hand.length;await activate(utility,[target]);assert.equal(a.hand.length,hand+1);await activate(utility,[target]);assert.equal(a.hand.length,hand+1);await cast(noop('V53 targeting spell',{targets:[M.T.creature()]}),{aim:[target]});assert.equal(a.hand.length,hand+1);assert.equal(c.zone,'battlefield');
 }else if(name==='Retromancer'||name==='Lava Runner'){
  const c=await cast(),land=permanent(M,g,b,M.DEFS.Forest),life=b.life;await cast(noop('V53 targeting opponent spell',{targets:[M.T.creature()]}),{player:b,aim:[c]});if(name==='Retromancer')assert.equal(b.life,life-3);else assert.equal(land.zone,'graveyard');assert.equal(c.zone,'battlefield');
 }else if(name==='Bellowing Fiend'){
  const c=await cast(),target=donor(positive?b:a),own=a.life,enemy=b.life;await g.damageBatch([{src:c,target,n:1}],{deferSBA:true});await settle(g);assert.equal(a.life,own-(positive?3:6));assert.equal(b.life,enemy-(positive?3:0));
 }else if(name==='Carrion Locust'){
  const dead=put(M,b,positive?def('V53 dead creature'):M.DEFS.Forest,'graveyard'),life=b.life;await cast(name,{aim:[dead]});assert.equal(dead.zone,'exile');assert.equal(b.life,life-(positive?1:0));
 }else if(name==='Norika Yamazaki, the Poet'){
  const c=await cast(),enchantment=put(M,a,def('V53 grave enchantment',['Enchantment'],{cost:'{W}'}),'graveyard'),samurai=donor(a,{subtypes:['Samurai']}),ally=donor();aims=[enchantment];await attack(positive?[samurai]:[samurai,ally]);g.phase='main2';g.step='main';assert.equal(g.castableList(a).some(r=>r.card===enchantment),positive);if(positive)await cast(enchantment.def,{card:enchantment});assert.equal(c.kw('vigilance'),true);
 }else if(name==='Roving Keep'){
  const c=await cast();assert.equal(g.canAttackAtAll(c),false);await activate(c);assert.equal(c.power,7);assert.equal(c.kw('trample'),true);assert.equal(g.canAttackAtAll(c),true);
 }else if(name==='Furnace Punisher'){
  const c=await cast();for(let i=0;i<(positive?2:1);i++)permanent(M,g,b,M.DEFS.Forest);const life=b.life;await g.emit('upkeep',{player:b});await settle(g);assert.equal(b.life,life-(positive?0:2));assert.equal(c.kw('menace'),true);
 }else if(name==='Hobble'){
  const target=donor(b,{colorsOverride:positive?['B']:['R']}),hand=a.hand.length;await cast(name,{aim:[target]});assert.equal(a.hand.length,hand+1);assert.equal(target.cur.cantAttack,true);assert.equal(target.cur.cantBlock,positive);
 }else if(name==='Serpent of Yawning Depths'){
  const c=await cast(),ally=donor(a,{subtypes:['Kraken']}),plain=donor(b),sea=donor(b,{subtypes:['Octopus']});ally.attacking=b;g.recalc();assert.equal(g.canBlock(plain,ally),false);assert.equal(g.canBlock(sea,ally),true);await g.move(c,'exile');assert.equal(g.canBlock(plain,ally),true);
 }else if(name==='Illusory Gains'){
  const original=donor(b),c=await cast(name,{aim:[original]}),entered=put(M,positive?b:a,def('V53 newcomer'),'hand');await g.putPermanentOntoBattlefield(entered,positive?b:a);await settle(g);assert.equal(c.attachedTo,positive?entered.iid:original.iid);assert.equal(original.ctrl,positive?b:a);if(positive)assert.equal(entered.ctrl,a);
 }else if(name==='Instill Furor'){
  const host=donor(),c=await cast(name,{aim:[host]});if(positive)await attack([host]);await endStep(a);assert.equal(host.zone,positive?'battlefield':'graveyard');assert.equal(c.zone,positive?'battlefield':'graveyard');
 }else if(name==='Mind Maggots'){
  const one=put(M,a,def('V53 discarded one'),'hand'),two=put(M,a,def('V53 discarded two'),'hand');picks=[positive?[one,two]:[]];const c=await cast();assert.equal(c.counters['+1/+1']||0,positive?4:0);assert.equal(one.zone,positive?'graveyard':'hand');
 }else if(name==='Rot Farm Skeleton'){
  const c=put(M,a,name,'graveyard'),size=a.library.length,mana=total(a);if(!positive){g.turnPlayer=b;assert.equal(g.activatableList(a).some(r=>r.card===c),false);g.turnPlayer=a;const library=a.library.slice();a.library.splice(3);assert.equal(g.activatableList(a).some(r=>r.card===c),false);assert.equal(await g.activateAbility(a,{card:c,gyAbility:true}),false);assert.equal(total(a),mana);a.library.splice(0,a.library.length,...library);}await activate(c);assert.equal(c.zone,'battlefield');assert.equal(a.library.length,size-4);assert.equal(total(a),mana-4);assert.equal(c.cur.cantBlock,true);
 }else if(name==='Sequestered Stash'){
  const c=await cast(),artifact=put(M,a,'Sol Ring'),size=a.library.length;picks=[positive?[artifact]:[]];await activate(c);assert.equal(c.zone,'graveyard');assert.equal(artifact.zone,positive?'library':'graveyard');if(positive)assert.equal(a.library.at(-1),artifact);assert.equal(a.library.length,size-(positive?4:5));
 }else if(name==='Nivix, Aerie of the Firemind'){
  const c=await cast(),card=put(M,a,positive?noop('V53 exiled instant'):def('V53 exiled creature'));await activate(c);assert.equal(card.zone,'exile');assert.equal(g.castableList(a).some(r=>r.card===card),positive);g.turnPlayer=a;g.mainPhase=async()=>{assert.equal(g.castableList(a).some(r=>r.card===card),false);};g.combatPhase=async()=>{};await g.runTurn();
 }else if(name==='Arena Rector'){
  const c=await cast(),walker=put(M,a,def('V53 library walker',['Planeswalker'],{loyalty:'4'}));picks=positive?[[walker]]:[];yes=positive?'yes':'no';await g.destroy(c);await settle(g);assert.equal(c.zone,positive?'exile':'graveyard');assert.equal(walker.zone,positive?'battlefield':'library');
 }else if(name==='Cyclone Summoner'){
  const plain=donor(b),giant=donor(b,{subtypes:['Giant']}),wizard=donor(b,{subtypes:['Wizard']}),land=permanent(M,g,b,M.DEFS.Forest);let c;if(positive)c=await cast();else{c=put(M,a,name,'hand');await g.putPermanentOntoBattlefield(c,a);await settle(g);}assert.equal(plain.zone,positive?'hand':'battlefield');for(const x of[giant,wizard,land,c])assert.equal(x.zone,'battlefield');
 }else if(name==='Phantom Carriage'){
  const card=put(M,a,positive?M.DEFS.ThinkTwice||M.DEFS['Think Twice']:def('V53 disturb',['Creature'],{bomDisturb:'{2}{U}'}));picks=[[card]];await cast();assert.equal(card.zone,'graveyard');
 }else if(name==='Urborg Stalker'){
  const c=await cast();donor(b,{colorsOverride:positive?['R']:['B']});const life=b.life;await g.emit('upkeep',{player:b});await settle(g);assert.equal(b.life,life-(positive?1:0));assert.equal(c.zone,'battlefield');
 }else if(name==='Boing!'){
  const target=donor(b),rolls=[];let scry=0;const emit=g.emit;g.emit=async function(event,d,...args){if(event==='dieRolledV46')rolls.push(d.value);return emit.call(this,event,d,...args);};choose(a,q=>{if(q.type==='scry')scry=q.cards.length;return null;});await cast(name,{aim:[target]});assert.equal(target.zone,'hand');assert.equal(rolls.length,1);assert.equal(scry,rolls[0]<=3?rolls[0]:0);
 }else if(name==='Knight of Wundagore'){
  const c=await cast(),other=donor(b);g.addCounters(other,'+1/+1',2,false,positive?a:b);await settle(g);assert.equal(c.counters['+1/+1']||0,positive?1:0);g.addCounters(other,'+1/+1',1,false,a);await settle(g);assert.equal(c.counters['+1/+1'],1);g.addCounters(other,'+1/+1',1,false,a);await settle(g);assert.equal(c.counters['+1/+1'],1);
 }else if(name==="Patriarch's Bidding"){
  const elf=put(M,a,def('V53 dead Elf',['Creature'],{subtypes:['Elf']}),'graveyard'),zombie=put(M,a,def('V53 dead Zombie',['Creature'],{subtypes:['Zombie']}),'graveyard'),other=put(M,b,def('V53 opposing Elf',['Creature'],{subtypes:['Elf']}),'graveyard'),bear=put(M,b,def('V53 dead Bear',['Creature'],{subtypes:['Bear']}),'graveyard');await cast();for(const c of[elf,zombie,other])assert.equal(c.zone,'battlefield');assert.equal(bear.zone,'graveyard');
 }else if(name==='Pulsemage Advocate'||name==='Nullmage Advocate'){
  const c=await cast(),dead=Array.from({length:name==='Pulsemage Advocate'?3:2},()=>put(M,b,'Forest','graveyard')),target=name==='Pulsemage Advocate'?put(M,a,def('V53 reanimation'),'graveyard'):permanent(M,g,b,M.DEFS['Sol Ring']);await activate(c,[dead,target],positive);if(!positive){await g.move(dead[0],'exile');await settle(g);}assert.equal(target.zone,name==='Pulsemage Advocate'?'battlefield':'graveyard');assert.equal(dead.filter(c=>c.zone==='hand').length,dead.length-(positive?0:1));
 }else if(name==='Umbilicus'){
  const c=await cast(),card=donor(b),life=b.life;enemyPicks=positive?[]:[[card]];await g.emit('upkeep',{player:b});await settle(g);assert.equal(b.life,life-(positive?2:0));assert.equal(card.zone,positive?'battlefield':'hand');assert.equal(c.zone,'battlefield');
 }else if(name==='Acrobatic Cheerleader'){
  const c=await cast();if(positive)g.tap(c);await g.emit('postcombatMain',{player:a});await settle(g);assert.equal(c.counters.flying||0,positive?1:0);g.tap(c);await g.emit('postcombatMain',{player:a});await settle(g);assert.equal(c.counters.flying,1);g.removeCounters(c,'flying',1);g.turnNo++;await g.emit('postcombatMain',{player:a});await settle(g);assert.equal(c.counters.flying,0);await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);g.tap(c);await g.emit('postcombatMain',{player:a});await settle(g);assert.equal(c.counters.flying,1);
 }else if(['Goblin Bangchuckers','Goblin Traprunner','Fickle Efreet','Velukan Dragon'].includes(name)){
  const c=await cast(),enemy=donor(b),coins=[],rolls=[];const emit=g.emit;g.emit=async function(event,d,...args){if(event==='coinFlipped')coins.push(d.won);if(event==='dieRolledV46')rolls.push(d.value);return emit.call(this,event,d,...args);};if(name==='Goblin Bangchuckers'){await activate(c,[enemy]);assert.equal(coins.length,1);assert.equal(enemy.damage,coins[0]?2:0);assert.equal(c.zone,coins[0]?'battlefield':'graveyard');}
  else{const power=c.power;await attack([c]);if(name==='Goblin Traprunner'){assert.equal(coins.length,3);const tokens=g.bf().filter(x=>x.isToken&&x.hasSub('Goblin'));assert.equal(tokens.length,coins.filter(Boolean).length);assert.equal(tokens.every(x=>x.tapped&&x.attacking===b),true);}if(name==='Velukan Dragon'){assert.equal(rolls.length,1);assert.equal(c.power,power+rolls[0]-1);}if(name==='Fickle Efreet'){if(!positive){await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,a);}await g.emit('endCombat',{player:a});await settle(g);assert.equal(coins.length,1);assert.equal(c.ctrl,positive&&!coins[0]?b:a);}}
 }else if(name==="Dramatist's Puppet"||name==='Quarry Hauler'){
  const target=donor();g.addCounters(target,'+1/+1',2);g.addCounters(target,'charge',3);yes=positive?'add':'remove';await cast(name,{aim:[target]});assert.equal(target.counters['+1/+1'],positive?3:1);assert.equal(target.counters.charge,positive?4:2);
 }else if(name==='Ambitious Dragonborn'){
  donor(a,{power:'3'});put(M,a,def('V53 greatest grave',['Creature'],{power:positive?'7':'2'}),'graveyard');const c=await cast();assert.equal(c.counters['+1/+1'],positive?7:3);assert.equal(c.power,positive?7:3);
 }else if(name==='Asmira, Holy Avenger'){
  const c=await cast(),one=donor(),two=donor(b);await g.destroy(one);await g.destroy(two);await settle(g);await endStep(b);assert.equal(c.counters['+1/+1'],1);await g.move(one,'exile');await endStep(a);assert.equal(c.counters['+1/+1'],2);
 }else if(name==='Bloodbond March'){
  const c=await cast(),d=def('V53 shared name',['Creature'],{cost:'{G}'}),own=put(M,a,d,'graveyard'),foreign=put(M,b,d,'graveyard'),different=put(M,b,def('V53 wrong name'),'graveyard');await cast(d);assert.equal(own.zone,'battlefield');assert.equal(foreign.zone,'battlefield');assert.equal(different.zone,'graveyard');assert.equal(c.zone,'battlefield');
 }else if(name==="Lozhan, Dragons' Legacy"){
  const c=await cast(),target=donor(b),commander=donor(b);commander.commander=true;b.commanders.push(commander);assert.equal(g.legalTargets(c.def.triggers[0].targets[0],c,a).includes(commander),false);await cast(def('V53 Dragon spell',['Creature'],{cost:'{3}{R}',subtypes:[positive?'Dragon':'Goblin']}),{aim:positive?[target]:[],resolve:false});aims=positive?[target]:[];await settle(g);assert.equal(target.damage,positive?4:0);
 }else if(name==='Sonic Shrieker'){
  const creature=donor(b),discard=put(M,b,'Forest','hand'),life=a.life,enemy=b.life;await cast(name,{aim:[positive?b:creature]});assert.equal(a.life,life+2);assert.equal(b.life,enemy-(positive?2:0));assert.equal(discard.zone,positive?'graveyard':'hand');assert.equal(creature.damage,positive?0:2);
 }else if(name==='Stampede Surfer'){
  const third=g.addPlayer('Third',{name:'Third'},b.controller,false);while(third.library.length<30)put(M,third,'Forest');const c=await cast();await attack([c]);const tokens=g.bf().filter(x=>x.isToken&&x.hasSub('Boar'));assert.equal(tokens.length,2);assert.equal(tokens.some(t=>t.attacking===b),true);assert.equal(tokens.some(t=>t.attacking===third),true);assert.equal(tokens.every(t=>t.tapped&&t.power===2),true);
 }else if(name==='No Rest for the Wicked'){
  const c=await cast(),creature=donor(),discarded=put(M,a,def('V53 old grave'),'graveyard');await g.destroy(creature);await settle(g);if(!positive){await g.move(creature,'exile');await g.move(creature,'graveyard');}await activate(c);assert.equal(c.zone,'graveyard');assert.equal(creature.zone,positive?'hand':'graveyard');assert.equal(discarded.zone,'graveyard');
 }else if(name==='Armored Kincaller'){
  const dinosaur=put(M,a,def('V53 Dinosaur',['Creature'],{subtypes:['Dinosaur']}),'hand'),life=a.life;picks=[positive?[dinosaur]:[]];await cast();assert.equal(a.life,life+(positive?3:0));assert.equal(dinosaur.zone,'hand');
 }else if(name==='Infernal Kirin'||name==='Skyfire Kirin'){
  const c=await cast(),matching=put(M,b,noop('V53 matching hand',{cost:'{1}{U}'}),'hand'),wrong=put(M,b,'Forest','hand'),enemy=donor(b,{cost:'{1}{U}'});const spell=put(M,a,noop('V53 Arcane',{cost:'{1}{U}',subtypes:[positive?'Arcane':'Lesson']}),'hand');await cast(spell.def,{card:spell,resolve:false,aim:positive?[name==='Infernal Kirin'?b:enemy]:[]});await settle(g);if(name==='Infernal Kirin'){assert.equal(matching.zone,positive?'graveyard':'hand');assert.equal(wrong.zone,'hand');}else assert.equal(enemy.ctrl,positive?a:b);assert.equal(c.kw('flying'),true);
 }else if(name==='Crown of Empires'){
  const c=await cast(),enemy=donor(b);permanent(M,g,a,def('Scepter of Empires',['Artifact']));if(positive)permanent(M,g,a,def('Throne of Empires',['Artifact']));await activate(c,[enemy]);assert.equal(enemy.ctrl,positive?a:b);assert.equal(enemy.tapped,!positive);
 }else if(name==='Emberwilde Djinn'){
  const c=await cast(),life=b.life,mana=total(b);opponentYes=positive?'mana':'life';await g.emit('upkeep',{player:b});await settle(g);assert.equal(c.ctrl,b);assert.equal(b.life,life-(positive?0:2));assert.equal(total(b),mana-(positive?2:0));
 }else if(name==='Cloudspire Skycycle'){
  const target=donor(),c=await cast(name,{aim:[[target]]});assert.equal(target.counters['+1/+1'],2);assert.equal(c.is('Creature'),false);picks=[[target]];await activate(c,[],true,r=>r.crew);assert.equal(c.is('Creature'),true);assert.equal(c.kw('flying'),true);
 }else if(name==='Turtle Tracks'){
  const land=put(M,b,'Island');enemyPicks=positive?[[land]]:[];await cast(name,{aim:[[b]]});assert.equal(land.zone,positive?'battlefield':'library');if(positive)assert.equal(land.ctrl,b);
 }else if(name==='Dauntless Bodyguard'){
  const host=donor();picks=[[host]];const c=await cast();if(!positive){await g.move(host,'exile');await g.putPermanentOntoBattlefield(host,a);}await activate(c);assert.equal(c.zone,'graveyard');assert.equal(host.kw('indestructible'),positive);
 }else if(name==='Cultist of the Absolute'){
  const cmd=donor(a,{power:'2',toughness:'4'});cmd.commander=true;a.commanders.push(cmd);const fodder=donor(),c=await cast();assert.equal(cmd.power,5);assert.equal(cmd.toughness,7);assert.equal(cmd.kw('flying'),true);assert.equal(cmd.kw('deathtouch'),true);assert.equal(cmd.cur.wardCost.life,3);picks=[[fodder]];await g.emit('upkeep',{player:a});await settle(g);assert.equal(fodder.zone,'graveyard');await g.move(c,'exile');assert.equal(cmd.power,2);assert.equal(cmd.kw('flying'),false);
 }else if(name==='Gnostro, Voice of the Crags'){
  const c=await cast();await cast(noop());const target=donor(b),n=a.turnState.spellsCast,life=a.life;await activate(c,positive?[target]:[]);assert.equal(target.damage,positive?n:0);assert.equal(a.life,life+(positive?0:n));g.untap(c);mode=0;let scry=0;choose(a,q=>{if(q.type==='scry')scry=q.cards.length;return null;});await activate(c);assert.equal(scry,n);
 }else if(name==='Carrionette'){
  const c=put(M,a,name,'graveyard'),enemy=donor(b),mana=total(b);await activate(c,[enemy]);assert.equal(c.zone,positive?'graveyard':'exile');assert.equal(enemy.zone,positive?'battlefield':'exile');assert.equal(total(b),mana-(positive?2:0));
 }else if(name==='Owen Grady, Raptor Trainer'){
  const c=await cast(),dino=donor(a,{subtypes:['Dinosaur']});yes=positive?'reach':'haste';await activate(c,[dino]);assert.equal(dino.counters[yes],1);g.untap(c);g.turnPlayer=b;assert.equal(g.activatableList(a).some(r=>r.card===c),false);
 }else if(name==='Face of Divinity'){
  const host=donor(),c=await cast(name,{aim:[host]});assert.equal(host.power,5);assert.equal(host.kw('first strike'),false);const other=await attach(b,host);assert.equal(host.kw('first strike'),true);assert.equal(host.kw('lifelink'),true);await g.move(other,'exile');assert.equal(host.kw('first strike'),false);assert.equal(c.zone,'battlefield');
 }else if(name==='Skulking Killer'){
  const target=donor(b);if(!positive)donor(b);const power=target.power;await cast(name,{aim:[target]});assert.equal(target.power,power-(positive?2:0));
 }else throw Error('Missing v53 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV53(M,entry,op,role,h){if(!names.includes(entry.raw.name)||entry.raw.name==='Owen Grady, Raptor Trainer'&&op.kind.includes('partner'))return null;let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV53(M,entry.raw.name,role,positive,h,assert);return count;}
