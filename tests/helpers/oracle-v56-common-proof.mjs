import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=["Mammoth Harness", "Gnawing Crescendo", "Tangled Colony", "Akroan Conscriptor", "Gaea's Balance", "Meticulous Excavation", "Ouphe Vandals", "Web of Inertia", "Wumpus Aberration", "Fertilid's Favor", "Kukemssa Pirates", "Worldpurge", "Dust of Moments", "Repulsive Mutation", "Arc Spitter", "Frodo, Determined Hero", "The Notary Hobbits", "Skeletonize", "Cyclone Sire", "Circle of Affliction", "Binding Negotiation", "Rally the Ancestors", "Jackdaw Savior", "Kediss, Emberclaw Familiar", "Grizzled Wolverine", "Weapons Manufacturing", "Soul of Emancipation", "Life Matrix", "Strider, Ranger of the North", "Aether Rift", "Garnet, Princess of Alexandria", "Spawnbroker", "Catacomb Dragon", "Smile at Death", "Puca's Mischief", "Restorative Technique", "Tidal Terror", "Thought-Stalker Warlock", "Dawn of a New Age", "Sensei Golden-Tail", "Sin Prodder", "Pemmin's Aura", "Animation Module", "Kozilek's Unsealing", "Ellyn Harbreeze, Busybody", "Spider-Man, Miles Morales", "Bortuk Bonerattle", "Guild Summit", "Sarpadian Empires, Vol. VII", "Grifter's Blade", "Neurok Transmuter", "Sporogenic Infection", "Agadeem Occultist", "Galloping Lizrog", "Phantasmagorian", "Dream Coat", "Soul Sculptor", "Kitsune Palliator", "Well-Laid Plans", "Samite Censer-Bearer", "Murderous Betrayal", "Alluring Siren", "Leashling", "Matopi Golem", "Debt of Loyalty", "Soldevi Sentry", "Skeleton Scavengers", "Gnostro, Voice of the Crags", "Another Round", "D\u00e1in Ironfoot", "Quest for the Holy Relic", "Warden of the First Tree", "Powerful Broker"];
export async function proveCommonV56(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,Array.from({length:name==='Kediss, Emberclaw Familiar'?4:2},()=>h.decision()),{ai:role==='ai'}):context(M,role,name==='Kediss, Emberclaw Familiar'?3:1),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<65)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let scrySeen=0,aims=[],picks=[],enemyAims=[],enemyPicks=[],yes=positive?'yes':'no',opponentYes=positive?'yes':'no',mode=positive?1:2;
 const constrain=(q,player)=>{const targetQueue=player===a?aims:enemyAims,cardQueue=player===a?picks:enemyPicks,key=player===a?yes:opponentYes;
  if(q.type==='chooseTargets'&&targetQueue.length){const picked=[targetQueue.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets '+q.prompt);return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&cardQueue.length){const picked=cardQueue.shift();assert.ok(picked.every(c=>q.from.includes(c)),'legal cards '+q.prompt);return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='scry')scrySeen+=q.cards.length;
  if(q.type==='chooseX')return {...q,min:2,max:2};
  if(q.type==='chooseOption'&&name==='Dust of Moments')return {...q,options:[q.options[positive?0:1]]};
  if(q.type==='chooseOption'&&q.options.some(o=>o.key==='heads'))return {...q,options:q.options.filter(o=>o.key===(positive?'heads':'tails'))};
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===key))return {...q,options:q.options.filter(o=>o.key===key)};
  if(q.type==='chooseOption'&&name==="Patriarch's Bidding"&&q.options.some(o=>o.key==='Elf'))return {...q,options:q.options.filter(o=>o.key===(player===a?'Elf':'Zombie'))};
  if(q.type==='chooseOption'&&name==='Gnostro, Voice of the Crags'&&q.options.length===3)return {...q,options:[q.options[mode]]};
  return null;
 };choose(a,q=>constrain(q,a));choose(b,q=>constrain(q,b));
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V56 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const noop=(label='V56 instant',extra={})=>def(label,['Instant'],{cost:'{U}',resolve:async()=>{},...extra});
 const cast=async(n=name,{aim=[],resolve=true,opts={},card,player=a}={})=>{if(player===a)aims=aim.slice();else enemyAims=aim.slice();card ||=put(M,player,n,'hand');const before=total(player);if(card.is('Land')){assert.equal(await g.playLand(player,card),true);assert.equal(total(player),before);}else{assert.equal(await g.castSpell(player,card,{from:card.zone,...opts}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid cast');}if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,aim=[],resolve=true,predicate=r=>!r.manaAbility)=>{aims=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&predicate(r));assert.ok(row,'legal activation '+c.name);assert.equal(await g.activateAbility(a,row),true);if(resolve)await settle(g);return row;};
 const auraDef=def('V56 creature Aura',['Enchantment'],{subtypes:['Aura'],cost:'{U}',auraTarget:[M.T.creature()]});
 const attach=async(p,host)=>{const c=put(M,p,auraDef,'hand');await g.move(c,'battlefield',{ctrl:p,attachTo:host});await settle(g);assert.equal(c.attachedTo,host.iid);return c;};
 const attack=async(cards,player=a)=>{g.turnPlayer=player;player.turnState.attacked=true;g.phase='combat';g.step='attackers';const target=player===a?b:a;g.combat={attackers:cards,declaredAttackTargets:cards.map(()=>target)};for(const c of cards){c.attacking=target;c.blockedBy=[];c.wasBlocked=false;c.meta._attackedTurn=g.turnNo;g.recordCombatObjectEvent(c,'attacks');}g.recalc();await g.emit('attackersDeclared',{player,attackers:cards});for(const c of cards)await g.emit('attacks',{player,card:c,defender:target});await settle(g);};
 const endStep=async player=>{await g.emit('endStep',{player});await settle(g);};
 if(name==='Mammoth Harness'){
  const host=donor(a,{kws:['flying']}),other=donor(b);await cast(name,{aim:[host]});assert.equal(host.kw('flying'),false);if(!positive)M.OracleV8AbilityLoss.add(g,[host],{temporary:true});if(positive)await g.emit('becomesBlockedByCreature',{attacker:host,blocker:other,blockers:[other]});else await g.emit('blocks',{attacker:other,blocker:host});await settle(g);assert.equal(other.kw('first strike'),true);
 }else if(name==='Gnawing Crescendo'){
  const host=donor();await cast();assert.equal(host.power,5);await g.destroy(host);await settle(g);const rats=g.creatures(a).filter(c=>c.isToken&&c.hasSub('Rat'));assert.equal(rats.length,1);assert.equal(rats[0].cur.cantBlock,true);if(positive)await g.destroy(rats[0]);else await g.destroy(donor());await settle(g);assert.equal(g.creatures(a).filter(c=>c.isToken&&c.hasSub('Rat')).length,positive?0:2);
 }else if(name==='Tangled Colony'){
  const c=await cast(),source=donor(b);assert.equal(c.cur.cantBlock,true);if(positive)await g.damageBatch([{src:source,target:c,n:1}],{deferSBA:true});await g.destroy(c);await settle(g);const rats=g.creatures(a).filter(c=>c.isToken&&c.hasSub('Rat'));assert.equal(rats.length,positive?1:0);if(rats.length)assert.equal(rats[0].cur.cantBlock,true);
 }else if(name==='Akroan Conscriptor'){
  const c=await cast(),enemy=donor(b);g.tap(enemy);aims=[enemy];const spell=put(M,positive?a:b,def('V56 targeted instant',['Instant'],{cost:'{U}',targets:[M.T.creature()],resolve:async()=>{}}),'hand');if(positive){aims=[c,enemy];}else enemyAims=[c];assert.equal(await g.castSpell(positive?a:b,spell),true);await settle(g);assert.equal(enemy.ctrl,positive?a:b);assert.equal(enemy.kw('haste'),positive);assert.equal(enemy.tapped,!positive);
 }else if(name==="Gaea's Balance"){
  const lands=Array.from({length:5},()=>permanent(M,g,a,M.DEFS.Forest)),types=['Plains','Island','Swamp','Mountain','Forest'],cards=types.map(t=>put(M,a,t));picks=[lands,...cards.map(c=>positive?[c]:[])];await cast();assert.equal(lands.every(c=>c.zone==='graveyard'),true);assert.equal(cards.every(c=>c.zone===(positive?'battlefield':'library')),true);
 }else if(name==='Meticulous Excavation'){
  const c=await cast(),host=donor(a,positive?{unearth:'{1}{B}'}:{});await activate(c,[host]);assert.equal(host.zone,'hand');g.turnPlayer=b;assert.equal(g.activatableList(a).some(r=>r.card===c),false);
 }else if(name==='Ouphe Vandals'){
  const c=await cast(),artifact=permanent(M,g,b,def('V56 artifact ability',['Artifact'],{abilities:[{cost:{mana:'{1}'},run:async()=>{b.v56Resolved=true;}}]}));const r=g.activatableList(b).find(r=>r.card===artifact);assert.ok(r);assert.equal(await g.activateAbility(b,r),true);const so=g.stack.at(-1);if(!positive)await g.move(artifact,'hand');await activate(c,[so]);assert.equal(c.zone,'graveyard');assert.equal(artifact.zone,positive?'graveyard':'hand');assert.equal(b.v56Resolved,undefined);
 }else if(name==='Web of Inertia'){
  await cast();const card=put(M,b,'Forest','graveyard'),enemy=donor(b);enemyPicks=[positive?[card]:[]];g.turnPlayer=b;await g.emit('beginCombat',{player:b});await settle(g);assert.equal(card.zone,positive?'exile':'graveyard');assert.equal(g.canAttackTarget(enemy,a),positive);const later=donor(b);assert.equal(g.canAttackTarget(later,a),positive);
 }else if(name==='Wumpus Aberration'){
  const card=put(M,b,def('V56 Wumpus gift'),'hand');enemyPicks=[[card]];if(positive)a.pool.C=0;else for(const k of ['W','U','B','R'])a.pool[k]=0;const c=await cast(name,{aim:positive?[b]:[]});assert.equal(card.zone,positive?'battlefield':'hand');assert.equal(c.colors.length,0);assert.equal(c.kw('trample'),true);
 }else if(name==="Fertilid's Favor"||name==='Restorative Technique'){
  const land=put(M,b,'Island'),host=donor(),life=b.life;enemyPicks=[positive?[land]:[]];await cast(name,{aim:[b,host]});assert.equal(land.zone,positive?'battlefield':'library');if(positive)assert.equal(land.tapped,true);assert.equal(host.counters['+1/+1'],name==="Fertilid's Favor"?2:1);assert.equal(b.life,life+(name==='Restorative Technique'?2:0));
 }else if(name==='Kukemssa Pirates'){
  const c=await cast(),artifact=permanent(M,g,b,def('V56 stolen artifact',['Artifact']));c.attacking=b;aims=[artifact];await g.emit('unblockedAttackers',{player:a,attackers:[c]});await settle(g);assert.equal(artifact.ctrl,positive?a:b);assert.equal(g.dmgAmount(c,'normal'),positive?0:2);
 }else if(name==='Worldpurge'){
  const one=donor(),two=donor(b);for(let i=0;i<9;i++)put(M,a,'Forest','hand');picks=[positive?[one]:[]];enemyPicks=[[two]];await cast();assert.equal(g.bf().length,0);assert.equal(one.zone,positive?'hand':'library');assert.equal(a.hand.length,positive?1:0);assert.equal(two.zone,'hand');assert.equal(total(a)+total(b),0);
 }else if(name==='Dust of Moments'){
  const host=donor(),none=donor();g.addCounters(host,'time',3);const suspended=put(M,a,def('V56 suspended',['Creature'],{suspend:{cost:'{1}',n:4}}),'exile');suspended.counters.time=4;await cast();assert.equal(host.counters.time,positive?1:5);assert.equal(suspended.counters.time,positive?2:6);assert.equal(none.counters.time||0,0);
 }else if(name==='Repulsive Mutation'){
  const host=donor(),card=await cast(noop('V56 mutation target',{resolve:async()=>{b.repulsiveResolved=true;}}),{player:b,resolve:false}),so=g.stack.find(r=>r.card===card),before=total(b);await cast(name,{aim:[host,so]});assert.equal(host.counters['+1/+1'],2);assert.equal(total(b),before-(positive?5:0));assert.equal(card.zone,'graveyard');assert.equal(g.stack.length,0);assert.equal(!!b.repulsiveResolved,positive);
 }else if(name==='Arc Spitter'){
  const host=donor(),blocker=donor(b),c=await cast();await activate(c,[host],true,r=>r.equip);host.attacking=b;blocker.blocking=host.iid;host.blockedBy=[blocker];await activate(host,[blocker]);assert.equal(blocker.damage,1);if(!positive){host.blockedBy=[];blocker.blocking=null;assert.equal(g.activatableList(a).some(r=>r.card===host),false);}
 }else if(name==='Frodo, Determined Hero'){
  const equip=permanent(M,g,a,def('V56 small Equipment',['Artifact'],{cost:'{2}',subtypes:['Equipment'],equip:'{1}'})),c=await cast(name,{aim:[equip]});assert.equal(equip.attachedTo,positive?c.iid:null);const source=donor(b);await g.damageBatch([{src:source,target:c,n:1}],{deferSBA:true});assert.equal(c.damage,0);g.turnPlayer=b;await g.damageBatch([{src:source,target:c,n:1}],{deferSBA:true});assert.equal(c.damage,1);
 }else if(name==='The Notary Hobbits'){
  const c=await cast(),copies=g.creatures(a).filter(x=>x!==c&&x.name===name);assert.equal(copies.length,2);assert.equal(copies.every(c=>c.isToken&&!c.def.super.includes('Legendary')),true);const before=a.pool.C;await activate(c,[],true,r=>r.manaAbility);assert.equal(a.pool.C,before+3);if(!positive){const token=copies[0];await g.move(token,'exile');await settle(g);assert.equal(g.creatures(a).length,2);}
 }else if(name==='Skeletonize'){
  const host=donor(b,{toughness:positive?'3':'10'});await cast(name,{aim:[host]});if(!positive)await g.move(host,'exile');await settle(g);const skeletons=g.creatures(a).filter(c=>c.hasSub('Skeleton')&&c.isToken);assert.equal(skeletons.length,positive?1:0);if(positive){await activate(skeletons[0]);await g.destroy(skeletons[0]);assert.equal(skeletons[0].zone,'battlefield');}
 }else if(name==='Cyclone Sire'){
  const land=permanent(M,g,a,M.DEFS.Forest),c=await cast();aims=[land];await g.destroy(c);await settle(g);assert.equal(land.is('Creature'),positive);if(positive){assert.equal(land.power,3);assert.equal(land.kw('haste'),true);assert.equal(land.hasSub('Elemental'),true);}
 }else if(name==='Circle of Affliction'){
  yes='R';const c=await cast();yes=positive?'yes':'no';const source=donor(b,{colorsOverride:['R']}),life=a.life,other=b.life,mana=total(a);aims=[b];await g.damageBatch([{src:source,target:a,n:2}],{deferSBA:true});await settle(g);assert.equal(a.life,life-2+(positive?1:0));assert.equal(b.life,other-(positive?1:0));assert.equal(total(a),mana-(positive?1:0));assert.equal(c.meta.oracleChosenColor,'R');
 }else if(name==='Binding Negotiation'){
  const hand=put(M,b,noop(),'hand'),exile=put(M,b,'Forest','exile');picks=positive?[[hand]]:[[],[exile]];await cast(name,{aim:[b]});assert.equal(hand.zone,positive?'graveyard':'hand');assert.equal(exile.zone,positive?'exile':'graveyard');
 }else if(name==='Rally the Ancestors'){
  const one=put(M,a,def('V56 Rally small',['Creature'],{cost:'{2}'}),'graveyard'),big=put(M,a,def('V56 Rally big',['Creature'],{cost:'{3}'}),'graveyard'),c=await cast();assert.equal(c.zone,'exile');assert.equal(one.zone,'battlefield');assert.equal(big.zone,'graveyard');if(!positive){await g.move(one,'exile');await g.putPermanentOntoBattlefield(one,a);}await g.emit('upkeep',{player:b});await settle(g);assert.equal(one.zone,'battlefield');await g.emit('upkeep',{player:a});await settle(g);assert.equal(one.zone,positive?'exile':'battlefield');
 }else if(name==='Jackdaw Savior'){
  const c=await cast(),card=put(M,a,def('V56 Jackdaw recur',['Creature'],{cost:positive?'{1}':'{3}'}),'graveyard'),dead=donor(a,{cost:'{2}',kws:['flying']});if(positive)aims=[card];await g.destroy(dead);await settle(g);assert.equal(card.zone,positive?'battlefield':'graveyard');assert.equal(c.zone,'battlefield');
 }else if(name==='Kediss, Emberclaw Familiar'){
  await cast();const commander=donor();commander.commander=true;const others=g.players.filter(p=>p!==a&&p!==b),before=others.map(p=>p.life);await g.damageBatch([{src:commander,target:b,n:2}],{combat:positive,deferSBA:true});await settle(g);for(let i=0;i<others.length;i++)assert.equal(others[i].life,before[i]-(positive?2:0));assert.equal(b.life,38);
 }else if(name==='Grizzled Wolverine'){
  const c=await cast(),blocker=donor(b);g.phase='combat';g.step='blockers';c.attacking=b;c.blockedBy=positive?[blocker]:[];assert.equal(g.activatableList(a).some(r=>r.card===c),positive);if(positive){await activate(c);assert.equal(c.power,4);assert.equal(g.activatableList(a).some(r=>r.card===c),false);}
 }else if(name==='Weapons Manufacturing'){
  await cast();if(positive)await cast(def('V56 entering artifact',['Artifact']));else await g.makeTokens({name:'V56 artifact token',types:['Artifact'],cost:'',subtypes:[],super:[]},a);await settle(g);const munition=g.bf().find(c=>c.name==='Munitions');assert.equal(!!munition,positive);if(positive){aims=[b];const life=b.life;await g.move(munition,'exile');await settle(g);assert.equal(b.life,life-2);}
 }else if(name==='Soul of Emancipation'){
  const first=donor(b,positive?{}:{kws:['indestructible']}),second=donor();await cast(name,{aim:[[first,second]]});assert.equal(first.zone,positive?'graveyard':'battlefield');assert.equal(second.zone,'graveyard');assert.equal(g.creatures(a).filter(c=>c.isToken&&c.hasSub('Angel')).length,1);assert.equal(g.creatures(b).filter(c=>c.isToken&&c.hasSub('Angel')).length,1);
 }else if(name==='Life Matrix'){
  const c=await cast(),host=donor();g.phase='upkeep';g.step='upkeep';await activate(c,[host]);assert.equal(host.counters.matrix,1);await activate(host);assert.equal(host.counters.matrix||0,0);if(positive)await g.destroy(host);assert.equal(host.zone,'battlefield');assert.equal(host.regenShield,positive?0:1);g.untap(c);g.phase='draw';g.step='draw';assert.equal(g.activatableList(a).some(r=>r.card===c),false);
 }else if(name==='Strider, Ranger of the North'){
  await cast();const host=donor(a,{power:positive?'3':'2'});aims=[host];await g.putPermanentOntoBattlefield(put(M,a,'Forest','hand'),a);await settle(g);assert.equal(host.power,positive?4:3);assert.equal(host.kw('first strike'),positive);
 }else if(name==='Aether Rift'){
  await cast();const card=put(M,a,def('V56 random creature'),'hand'),life=a.life;await g.emit('upkeep',{player:a});await settle(g);assert.equal(card.zone,positive?'graveyard':'battlefield');assert.equal(a.life,life-(positive?5:0));
 }else if(name==='Garnet, Princess of Alexandria'){
  const saga=permanent(M,g,a,def('V56 saga',['Enchantment'],{subtypes:['Saga']}));g.addCounters(saga,'lore',2);const c=await cast();picks=[positive?[saga]:[]];await attack([c]);assert.equal(saga.counters.lore,positive?1:2);assert.equal(c.counters['+1/+1']||0,positive?1:0);
 }else if(name==='Spawnbroker'||name==="Puca's Mischief"){
  const mine=donor(a,{cost:'{4}',power:'4'}),other=donor(b,{cost:'{3}',power:'3'});const c=await cast(name,{aim:name==='Spawnbroker'?[mine,other]:[]});if(name!== 'Spawnbroker'){aims=[mine,other];await g.emit('upkeep',{player:a});await settle(g);}assert.equal(mine.ctrl,positive?b:a);assert.equal(other.ctrl,positive?a:b);assert.equal(c.zone,'battlefield');
 }else if(name==='Catacomb Dragon'){
  const c=await cast(),blocker=donor(b,{power:'5',subtypes:positive?[]:['Dragon']});c.attacking=b;await g.emit('becomesBlockedByCreature',{attacker:c,blocker,blockers:[blocker]});await settle(g);assert.equal(blocker.power,positive?3:5);
 }else if(name==='Smile at Death'){
  await cast();const one=put(M,a,def('V56 Smile small',['Creature'],{power:'2'}),'graveyard'),two=put(M,a,def('V56 Smile too big',['Creature'],{power:'3'}),'graveyard');aims=[positive?[one]:[]];await g.emit('upkeep',{player:a});await settle(g);assert.equal(one.zone,positive?'battlefield':'graveyard');assert.equal(one.counters['+1/+1']||0,positive?1:0);assert.equal(two.zone,'graveyard');
 }else if(name==='Tidal Terror'){
  const c=await cast(),one=donor(),two=donor();picks=positive?[[one,two]]:[];await attack([c]);assert.equal(!!c.cur.unblockable,positive);assert.equal(one.tapped,positive);assert.equal(two.tapped,positive);
 }else if(name==='Thought-Stalker Warlock'){
  const card=put(M,b,noop(),'hand'),land=put(M,b,'Forest','hand');if(positive){await g.loseLife(b,1);picks=[[card]];}else enemyPicks=[[land]];await cast(name,{aim:[b]});assert.equal(card.zone,positive?'graveyard':'hand');assert.equal(land.zone,positive?'hand':'graveyard');
 }else if(name==='Dawn of a New Age'){
  if(positive)donor();const c=await cast(),life=a.life,hand=a.hand.length;assert.equal(c.counters.hope||0,positive?1:0);await endStep(a);assert.equal(c.zone,'graveyard');assert.equal(a.life,life+4);assert.equal(a.hand.length,hand+(positive?1:0));
 }else if(name==='Sensei Golden-Tail'){
  const c=await cast(),host=donor(a,{subtypes:['Elf']}),enemy=donor(b);await activate(c,[host]);assert.equal(host.counters.training,1);assert.equal(host.hasSub('Elf')&&host.hasSub('Samurai'),true);if(!positive){g.untap(c);await activate(c,[host]);}host.blocking=enemy.iid;await g.emit('blocks',{attacker:enemy,blocker:host});await settle(g);assert.equal(host.power,positive?4:5);
 }else if(name==='Sin Prodder'){
  await cast();const card=put(M,a,def('V56 Prodder top',['Creature'],{cost:'{4}'})),life=b.life;await g.emit('upkeep',{player:a});await settle(g);assert.equal(card.zone,positive?'graveyard':'hand');assert.equal(b.life,life-(positive?4:0));
 }else if(name==="Pemmin's Aura"){
  const host=donor(),c=await cast(name,{aim:[host]});g.tap(host);await activate(c,[],true,r=>r.ability===c.def.abilities[0]);assert.equal(host.tapped,false);await activate(c,[],true,r=>r.ability===c.def.abilities[1]);assert.equal(host.kw('flying'),true);await activate(c,[],true,r=>r.ability===c.def.abilities[2]);assert.equal(host.kw('shroud'),true);yes=positive?'power':'toughness';await activate(c,[],true,r=>r.ability===c.def.abilities[3]);assert.equal(host.power,positive?4:2);assert.equal(host.toughness,positive?19:21);
 }else if(name==='Animation Module'||name==='Powerful Broker'){
  const c=await cast(),host=donor();if(positive)g.addCounters(host,'+1/+1',1);else b.poison=1;await settle(g);await activate(c,[positive?host:b]);assert.equal(positive?host.counters['+1/+1']:b.poison,2);if(name==='Animation Module')assert.equal(g.creatures(a).filter(c=>c.hasSub('Servo')).length,positive?2:0);
 }else if(name==="Kozilek's Unsealing"){
  await cast();const hand=a.hand.length;await cast(def('V56 Unsealing creature',['Creature'],{cost:positive?'{5}':'{7}'}));assert.equal(g.creatures(a).filter(c=>c.hasSub('Spawn')).length,positive?2:0);assert.equal(a.hand.length,hand+(positive?0:3));if(positive){const spawn=g.creatures(a).find(c=>c.hasSub('Spawn')),mana=a.pool.C;await activate(spawn,[],true,r=>r.manaAbility);assert.equal(a.pool.C,mana+1);assert.equal(spawn.zone,'ceased');}
 }else if(name==='Ellyn Harbreeze, Busybody'){
  const c=await cast();if(positive)await g.makeTokens(M.TOKENS.treasure,a,{n:2});const card=put(M,a,'Island'),n=a.hand.length;picks=positive?[[card]]:[];await activate(c);assert.equal(card.zone,positive?'hand':'library');assert.equal(a.hand.length,n+(positive?1:0));
 }else if(name==='Spider-Man, Miles Morales'){
  const host=donor(),c=await cast();assert.equal(host.counters['+1/+1'],1);assert.equal(host.kw('trample'),true);assert.equal(c.counters['+1/+1']||0,0);if(positive){await attack([c]);assert.equal(host.counters['+1/+1'],2);}
 }else if(name==='Bortuk Bonerattle'){
  permanent(M,g,a,M.DEFS.Forest);const card=put(M,a,def('V56 domain return',['Creature'],{cost:positive?'{1}':'{2}'}),'graveyard');await cast(name,{aim:[card]});assert.equal(card.zone,positive?'battlefield':'hand');const other=put(M,a,def('V56 uncast return'),'graveyard');await g.putPermanentOntoBattlefield(put(M,a,name,'hand'),a);await settle(g);assert.equal(other.zone,'graveyard');
 }else if(name==='Guild Summit'){
  const gate=permanent(M,g,a,def('V56 Gate',['Land'],{subtypes:['Gate']}));picks=[positive?[gate]:[]];const n=a.hand.length;await cast();assert.equal(a.hand.length,n+(positive?1:0));assert.equal(gate.tapped,positive);await g.putPermanentOntoBattlefield(put(M,a,def('V56 second Gate',['Land'],{subtypes:['Gate']}),'hand'),a);await settle(g);assert.equal(a.hand.length,n+(positive?2:1));
 }else if(name==='Sarpadian Empires, Vol. VII'){
  yes=positive?'R':'G';const c=await cast();await activate(c);const tokens=g.creatures(a).filter(c=>c.isToken);assert.equal(tokens.length,1);assert.equal(tokens[0].hasSub(positive?'Goblin':'Saproling'),true);assert.equal(tokens[0].colors.join(''),yes);
 }else if(name==="Grifter's Blade"){
  const host=positive?donor():null;picks=positive?[[host]]:[];const c=await cast();assert.equal(c.attachedTo,host?.iid??null);if(positive){assert.equal(host.power,4);assert.equal(host.toughness,21);}else{const next=donor();await activate(c,[next],true,r=>r.equip);assert.equal(next.power,4);}
 }else if(name==='Neurok Transmuter'){
  const c=await cast(),host=donor(a,{colorsOverride:['G'],...(positive?{types:['Artifact','Creature'],subtypes:['Vehicle']}:{subtypes:['Human']})});await activate(c,[host],true,r=>r.ability===c.def.abilities[0]);assert.equal(host.is('Artifact'),true);if(positive)await activate(c,[host],true,r=>r.ability===c.def.abilities[1]);assert.equal(host.is('Artifact'),!positive);if(positive){assert.equal(host.colors.join(''),'U');assert.equal(host.hasSub('Vehicle'),false);}g.untilEffects=g.untilEffects.filter(e=>e.expires!=='eot');g.recalc();assert.equal(host.is('Artifact'),positive);assert.equal(host.colors.join(''),'G');
 }else if(name==='Sporogenic Infection'){
  const host=donor(b),other=positive?donor(b):null;enemyPicks=positive?[[other]]:[];await cast(name,{aim:[host,b]});assert.equal(host.zone,'battlefield');if(other)assert.equal(other.zone,'graveyard');await g.damageBatch([{src:donor(),target:host,n:1}]);await settle(g);assert.equal(host.zone,'graveyard');
 }else if(name==='Agadeem Occultist'){
  const c=await cast(),card=put(M,b,def('V56 opponent grave',['Creature'],{cost:positive?'{1}':'{2}'}),'graveyard');await activate(c,[card]);assert.equal(card.zone,positive?'battlefield':'graveyard');if(positive)assert.equal(card.ctrl,a);
 }else if(name==='Galloping Lizrog'){
  const host=donor();g.addCounters(host,'+1/+1',2);picks=[positive?[host]:[]];yes='2';const c=await cast();assert.equal(host.counters['+1/+1']||0,positive?0:2);assert.equal(c.counters['+1/+1']||0,positive?4:0);
 }else if(name==='Phantasmagorian'){
  const cards=Array.from({length:3},()=>put(M,b,'Forest','hand'));enemyPicks=[cards];const c=await cast();assert.equal(c.zone,positive?'graveyard':'battlefield');if(positive){const own=Array.from({length:3},()=>put(M,a,'Forest','hand'));picks=[own];await activate(c);assert.equal(c.zone,'hand');assert.equal(own.every(c=>c.zone==='graveyard'),true);}
 }else if(name==='Dream Coat'){
  const host=donor(),c=await cast(name,{aim:[host]});yes=positive?'UR':'G';await activate(c);assert.equal(host.colors.join(''),yes);assert.equal(g.activatableList(a).some(r=>r.card===c),false);await g.move(c,'graveyard');await settle(g);assert.equal(host.colors.join(''),yes);
 }else if(name==='Soul Sculptor'){
  const c=await cast(),host=donor(a,{kws:['flying']});await activate(c,[host]);assert.equal(host.is('Creature'),false);assert.equal(host.is('Enchantment'),true);assert.equal(host.kw('flying'),false);await cast(positive?def('V56 release creature'):noop());assert.equal(host.is('Creature'),positive);assert.equal(host.kw('flying'),positive);
 }else if(name==='Kitsune Palliator'||name==='Samite Censer-Bearer'){
  const c=await cast(),host=donor(),enemy=donor(b),life=a.life;await activate(c);await g.damageBatch([{src:enemy,target:host,n:2},{src:enemy,target:a,n:2},{src:host,target:enemy,n:2}],{deferSBA:true});assert.equal(host.damage,1);assert.equal(a.life,life-(name==='Kitsune Palliator'?1:2));assert.equal(enemy.damage,name==='Kitsune Palliator'?1:2);if(!positive){await g.damageBatch([{src:enemy,target:host,n:1}],{deferSBA:true});assert.equal(host.damage,2);}
 }else if(name==='Well-Laid Plans'){
  await cast();const host=donor(a,{colorsOverride:['G']}),enemy=donor(b,{colorsOverride:positive?['G']:['R']});await g.damageBatch([{src:enemy,target:host,n:2}],{deferSBA:true});assert.equal(host.damage,positive?0:2);await g.damageBatch([{src:host,target:host,n:1}],{deferSBA:true});assert.equal(host.damage,positive?1:3);
 }else if(name==='Murderous Betrayal'){
  const c=await cast(),host=donor(b);a.life=positive?9:8;host.regenShield=1;const life=a.life,mana=total(a);await activate(c,[host]);assert.equal(a.life,Math.floor(life/2));assert.equal(host.zone,'graveyard');assert.equal(total(a),mana-2);
 }else if(name==='Alluring Siren'){
  const c=await cast(),host=donor(b);await activate(c,[host]);g.turnPlayer=b;assert.equal(g.canAttackTarget(host,a),true);if(!positive){await g.move(host,'exile');await g.putPermanentOntoBattlefield(host,b);host.sick=false;}const rule=g.untilEffects.find(e=>e.kind==='mustAttackPlayerCard');assert.ok(rule);assert.equal(rule.zoneVersion===host.zoneVersion,positive);
 }else if(name==='Leashling'){
  const c=await cast();assert.equal(g.activatableList(a).some(r=>r.card===c),false);const card=put(M,a,'Forest','hand');picks=[[card]];await activate(c,[],false);assert.equal(card.zone,'library');assert.equal(a.library.at(-1),card);if(!positive)await g.counterStackObject(g.stack.at(-1));await settle(g);assert.equal(c.zone,positive?'hand':'battlefield');
 }else if(['Matopi Golem','Soldevi Sentry','Skeleton Scavengers'].includes(name)){
  const c=await cast(),n=c.counters['+1/+1']||0,hand=b.hand.length,mana=total(a);await activate(c,name==='Soldevi Sentry'?[b]:[]);assert.equal(total(a),mana-(name==='Skeleton Scavengers'?n:1));assert.equal(c.regenShield,1);if(positive)await g.destroy(c);else await g.move(c,'hand');await settle(g);assert.equal(c.zone,positive?'battlefield':'hand');if(name==='Matopi Golem')assert.equal(c.counters['-1/-1']||0,positive?1:0);else if(name==='Skeleton Scavengers')assert.equal(c.counters['+1/+1']||0,positive?n+1:0);else assert.equal(b.hand.length,hand+(positive?1:0));
 }else if(name==='Debt of Loyalty'){
  const host=donor(b);await cast(name,{aim:[host]});assert.equal(host.ctrl,b);if(positive)await g.destroy(host);else{await g.move(host,'exile');await g.putPermanentOntoBattlefield(host,b);}await settle(g);assert.equal(host.ctrl,positive?a:b);
 }else if(name==='Gnostro, Voice of the Crags'){
  const c=await cast(),host=donor(b),life=a.life;await activate(c,positive?[host]:[]);if(positive)assert.equal(host.damage,1);else assert.equal(a.life,life+1);g.untap(c);mode=0;await activate(c);assert.equal(scrySeen,1);
 }else if(name==='Another Round'){
  const host=donor(),version=host.zoneVersion;picks=positive?[[host],[host],[host]]:[[],[],[]];await cast();assert.equal(host.zone,'battlefield');assert.equal(host.zoneVersion,version+(positive?6:0));
 }else if(name==='Dáin Ironfoot'){
  const host=donor(),c=await cast(name,{aim:[host]}),axe=g.bf().find(c=>c.name==='Axe');assert.ok(axe);assert.equal(axe.attachedTo,host.iid);assert.equal(host.power,4);await attack(positive?[c,host]:[c]);assert.equal(host.kw('double strike'),positive);
 }else if(name==='Quest for the Holy Relic'){
  const c=await cast();yes='yes';for(let i=0;i<5;i++)await cast(def('V56 quest creature '+i));assert.equal(c.counters.quest,5);const equipment=put(M,a,M.DEFS.Bonesplitter),host=donor();picks=positive?[[equipment],[host]]:[[]];await activate(c);assert.equal(c.zone,'graveyard');assert.equal(equipment.zone,positive?'battlefield':'library');if(positive)assert.equal(equipment.attachedTo,host.iid);
 }else if(name==='Warden of the First Tree'){
  const c=await cast();await activate(c,[],true,r=>r.ability===c.def.abilities[positive?0:2]);assert.equal(c.power,positive?3:1);await activate(c,[],true,r=>r.ability===c.def.abilities[1]);assert.equal(c.hasSub('Spirit'),positive);if(positive){await activate(c,[],true,r=>r.ability===c.def.abilities[2]);assert.equal(c.power,8);assert.equal(c.kw('lifelink')&&c.kw('trample'),true);}
 }else throw Error('Missing v56 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV56(M,entry,op,role,h){if(!names.includes(entry.raw.name))return null;let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV56(M,entry.raw.name,role,positive,h,assert);return count;}
