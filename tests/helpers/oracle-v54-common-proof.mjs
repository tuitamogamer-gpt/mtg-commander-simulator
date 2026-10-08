import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=["Academy Rector", "Auriok Survivors", "Tempting Wurm", "Argothian Wurm", "Shivan Wumpus", "Skullcage", "Triumph of Cruelty", "Wakandan Royal Guard", "Gallant Fowlknight", "Rakdos, the Showstopper", "Domestication", "Goblin Assassin", "Ogre Marauder", "Devouring Hellion", "Oriq Loremage", "Tobias, Doomed Conqueror", "Ugl\u00fak of the White Hand", "Balthor the Defiled", "Mad Dog", "Erg Raiders", "Antagonism", "Hammer of Bogardan", "Soul Scourge", "Laquatus's Champion", "Night Nurse, Healer of Heroes", "Salvager of Ruin", "Grim Return", "Cloudstone Curio", "Slab Hammer", "Pyroclastic Hellion", "Dutiful Replicator", "Anthropede", "Elektra, Femme Fatale", "Nimble Hobbit", "Basalt Ravager", "Ether Well", "Sirocco", "Destined Confrontation", "Stench of Evil", "Eternal Flame", "Song of Blood", "Invoke the Ancients", "Possessed Goat", "Counterlash", "Fold into Aether", "Mind Roots", "Abeyance", "Sylvan Awakening", "Chance for Glory", "Reckless Blaze", "Earthlore", "Withercrown", "Riverfall Mimic", "Valley Questcaller", "Reach of Branches", "Curse of Thirst", "Stonebinder's Familiar", "Canyon Vaulter", "Reckless Velocitaur", "Rumbling Aftershocks"];
export async function proveCommonV54(M,name,role,positive=true,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role),{game:g,a,b}=f;
 for(const p of g.players){fund(p);while(p.library.length<65)put(M,p,'Forest');}
 g.spotlight=async()=>{};g.reviewCombatWithHuman=async()=>{};
 let aims=[],picks=[],enemyAims=[],enemyPicks=[],yes=positive?'yes':'no',opponentYes=positive?'yes':'no',mode=positive?1:2;
 const constrain=(q,player)=>{const targetQueue=player===a?aims:enemyAims,cardQueue=player===a?picks:enemyPicks,key=player===a?yes:opponentYes;
  if(q.type==='chooseTargets'&&targetQueue.length){const picked=[targetQueue.shift()].flat();assert.ok(picked.every(c=>q.candidates.includes(c)),'legal targets '+q.prompt);return {...q,candidates:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseCards'&&cardQueue.length){const picked=cardQueue.shift();assert.ok(picked.every(c=>q.from.includes(c)),'legal cards '+q.prompt);return {...q,from:picked,min:picked.length,max:picked.length};}
  if(q.type==='chooseOption'&&q.options.some(o=>o.key==='heads'))return {...q,options:q.options.filter(o=>o.key===(positive?'heads':'tails'))};
  if(q.type==='chooseOption'&&q.options.some(o=>o.key===key))return {...q,options:q.options.filter(o=>o.key===key)};
  if(q.type==='chooseOption'&&name==="Patriarch's Bidding"&&q.options.some(o=>o.key==='Elf'))return {...q,options:q.options.filter(o=>o.key===(player===a?'Elf':'Zombie'))};
  if(q.type==='chooseOption'&&name==='Gnostro, Voice of the Crags'&&q.options.length===3)return {...q,options:[q.options[mode]]};
  return null;
 };choose(a,q=>constrain(q,a));choose(b,q=>constrain(q,b));
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V54 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const noop=(label='V54 instant',extra={})=>def(label,['Instant'],{cost:'{U}',resolve:async()=>{},...extra});
 const cast=async(n=name,{aim=[],resolve=true,opts={},card,player=a}={})=>{if(player===a)aims=aim.slice();else enemyAims=aim.slice();card ||=put(M,player,n,'hand');const before=total(player);if(card.is('Land')){assert.equal(await g.playLand(player,card),true);assert.equal(total(player),before);}else{assert.equal(await g.castSpell(player,card,{from:card.zone,...opts}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid cast');}if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,aim=[],resolve=true,predicate=r=>!r.manaAbility)=>{aims=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&predicate(r));assert.ok(row,'legal activation '+c.name);assert.equal(await g.activateAbility(a,row),true);if(resolve)await settle(g);return row;};
 const auraDef=def('V54 creature Aura',['Enchantment'],{subtypes:['Aura'],cost:'{U}',auraTarget:[M.T.creature()]});
 const attach=async(p,host)=>{const c=put(M,p,auraDef,'hand');await g.move(c,'battlefield',{ctrl:p,attachTo:host});await settle(g);assert.equal(c.attachedTo,host.iid);return c;};
 const attack=async(cards,player=a)=>{g.turnPlayer=player;g.phase='combat';g.step='attackers';const target=player===a?b:a;g.combat={attackers:cards,declaredAttackTargets:cards.map(()=>target)};for(const c of cards){c.attacking=target;c.blockedBy=[];c.wasBlocked=false;c.meta._attackedTurn=g.turnNo;g.recordCombatObjectEvent(c,'attacks');}g.recalc();await g.emit('attackersDeclared',{player,attackers:cards});for(const c of cards)await g.emit('attacks',{player,card:c,defender:target});await settle(g);};
 const endStep=async player=>{await g.emit('endStep',{player});await settle(g);};
 if(name==='Academy Rector'){
  const c=await cast(),card=put(M,a,def('V54 searched enchantment',['Enchantment']));picks=positive?[[card]]:[];await g.destroy(c);await settle(g);assert.equal(c.zone,positive?'exile':'graveyard');assert.equal(card.zone,positive?'battlefield':'library');
 }else if(name==='Auriok Survivors'){
  const equipment=put(M,a,M.DEFS['Bonesplitter']||def('V54 Equipment',['Artifact'],{subtypes:['Equipment']}),'graveyard'),c=await cast(name,{aim:[equipment]});assert.equal(equipment.zone,positive?'battlefield':'graveyard');if(positive)assert.equal(equipment.attachedTo,c.iid);
 }else if(name==='Tempting Wurm'){
  const creature=put(M,b,def('V54 hand creature'),'hand'),land=put(M,b,'Forest','hand'),spell=put(M,b,noop(),'hand');enemyPicks=[positive?[creature,land]:[]];await cast();assert.equal(creature.zone,positive?'battlefield':'hand');assert.equal(land.zone,positive?'battlefield':'hand');assert.equal(spell.zone,'hand');
 }else if(name==='Argothian Wurm'||name==='Shivan Wumpus'){
  const land=permanent(M,g,b,M.DEFS.Forest);enemyPicks=positive?[[land]]:[];const c=await cast();assert.equal(land.zone,positive?'graveyard':'battlefield');assert.equal(c.zone,positive?'library':'battlefield');if(positive)assert.equal(a.library.at(-1),c);
 }else if(name==='Skullcage'){
  const c=await cast();for(let i=0;i<(positive?3:1);i++)put(M,b,'Forest','hand');const life=b.life;await g.emit('upkeep',{player:b});await settle(g);assert.equal(b.life,life-(positive?0:2));assert.equal(c.zone,'battlefield');
 }else if(name==='Triumph of Cruelty'){
  const c=await cast(),mine=donor(a,{power:positive?'5':'1'}),other=donor(b,{power:'4'}),card=put(M,b,'Forest','hand');aims=[b];await g.emit('upkeep',{player:a});await settle(g);assert.equal(card.zone,positive?'graveyard':'hand');assert.equal(c.zone,'battlefield');assert.ok(mine&&other);
 }else if(name==='Wakandan Royal Guard'){
  const host=donor(a,{subtypes:[positive?'Hero':'Warrior']});await cast(name,{aim:[host]});assert.equal(host.counters['+1/+1'],positive?2:1);
 }else if(name==='Gallant Fowlknight'){
  const kin=donor(a,{subtypes:['Kithkin']}),other=donor(),enemy=donor(b);await cast();assert.equal(kin.power,4);assert.equal(other.power,4);assert.equal(kin.kw('first strike'),true);assert.equal(other.kw('first strike'),false);assert.equal(enemy.power,3);
 }else if(name==='Rakdos, the Showstopper'){
  const one=donor(),two=donor(b),demon=donor(b,{subtypes:['Demon']}),heads=[];const emit=g.emit;g.emit=async function(n,d,...args){if(n==='coinFlipped')heads.push(d.heads);return emit.call(this,n,d,...args);};await cast();assert.equal(heads.length,2);assert.equal(one.zone,heads[0]?'battlefield':'graveyard');assert.equal(two.zone,heads[1]?'battlefield':'graveyard');assert.equal(demon.zone,'battlefield');
 }else if(name==='Domestication'){
  const host=donor(b,{power:positive?'4':'3'}),c=await cast(name,{aim:[host]});assert.equal(host.ctrl,a);await endStep(a);assert.equal(c.zone,positive?'graveyard':'battlefield');assert.equal(host.ctrl,positive?b:a);
 }else if(name==='Goblin Assassin'){
  const mine=donor(),enemy=donor(b),heads=[];picks=[[mine]];enemyPicks=[[enemy]];const emit=g.emit;g.emit=async function(n,d,...args){if(n==='coinFlipped')heads.push({p:d.player,heads:d.heads});return emit.call(this,n,d,...args);};await cast();assert.equal(heads.length,2);assert.equal(mine.zone,heads.find(r=>r.p===a).heads?'battlefield':'graveyard');assert.equal(enemy.zone,heads.find(r=>r.p===b).heads?'battlefield':'graveyard');
 }else if(name==='Ogre Marauder'){
  const c=await cast(),enemy=donor(b);enemyPicks=positive?[[enemy]]:[];await attack([c]);assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(!!c.cur.unblockable,!positive);
 }else if(name==='Devouring Hellion'){
  const creature=donor(),walker=permanent(M,g,a,def('V54 sacrifice walker',['Planeswalker'],{loyalty:'4'}));walker.counters.loyalty=4;g.recalc();picks=[positive?[creature,walker]:[]];const c=await cast();assert.equal(c.counters['+1/+1']||0,positive?4:0);assert.equal(c.power,positive?6:2);assert.equal(creature.zone,positive?'graveyard':'battlefield');
 }else if(name==='Oriq Loremage'){
  const c=await cast(),card=put(M,a,positive?noop():def('V54 searched creature'));picks=[[card]];await activate(c);assert.equal(card.zone,'graveyard');assert.equal(c.counters['+1/+1']||0,positive?1:0);assert.equal(c.tapped,true);
 }else if(name==='Tobias, Doomed Conqueror'){
  const c=await cast(),mine=donor(),enemy=donor(b);if(positive)await g.destroy(mine);await g.destroy(enemy);const [token]=await g.makeTokens(def('Zombie',['Creature'],{cost:'',subtypes:['Zombie'],colorsOverride:['B'],power:'2',toughness:'2'}),a);await g.destroy(token);await g.destroy(c);await settle(g);assert.equal(g.bf().filter(x=>x.isToken&&x.hasSub('Zombie')).length,positive?2:1);
 }else if(name==='Uglúk of the White Hand'){
  const c=await cast(),dead=donor(a,{subtypes:[positive?'Goblin':'Elf']});await g.destroy(dead);await settle(g);assert.equal(c.counters['+1/+1'],positive?2:1);
 }else if(name==='Balthor the Defiled'){
  const c=await cast(),red=put(M,a,def('V54 red',['Creature'],{colorsOverride:['R']}),'graveyard'),black=put(M,b,def('V54 black',['Creature'],{colorsOverride:['B']}),'graveyard'),green=put(M,b,def('V54 green',['Creature'],{colorsOverride:['G']}),'graveyard'),minion=donor(a,{subtypes:['Minion']});assert.equal(minion.power,4);await activate(c);assert.equal(c.zone,'exile');assert.equal(red.zone,'battlefield');assert.equal(black.zone,'battlefield');assert.equal(black.ctrl,b);assert.equal(green.zone,'graveyard');assert.equal(minion.power,3);
 }else if(name==='Mad Dog'||name==='Erg Raiders'){
  const c=await cast(),life=a.life;await endStep(a);assert.equal(c.zone,'battlefield');assert.equal(a.life,life);g.turnNo++;if(positive)await attack([c]);await endStep(a);assert.equal(c.zone,name==='Mad Dog'&&!positive?'graveyard':'battlefield');assert.equal(a.life,life-(name==='Erg Raiders'&&!positive?2:0));
 }else if(name==='Antagonism'){
  const c=await cast();if(positive)await g.damageBatch([{src:c,target:a,n:1}],{deferSBA:true});const life=b.life;await endStep(b);assert.equal(b.life,life-(positive?0:2));
 }else if(name==='Hammer of Bogardan'){
  const c=await cast(name,{aim:[b]});assert.equal(c.zone,'graveyard');assert.equal(g.activatableList(a).some(r=>r.card===c),false);g.phase='upkeep';g.step='upkeep';const mana=total(a);await activate(c);assert.equal(c.zone,'hand');assert.equal(total(a),mana-5);
 }else if(name==='Soul Scourge'||name==="Laquatus's Champion"){
  const life=b.life,n=name==='Soul Scourge'?3:6,c=await cast(name,{aim:[b]});assert.equal(b.life,life-n);if(positive)await g.destroy(c);else await g.move(c,'exile');await settle(g);assert.equal(b.life,life);
 }else if(name==='Night Nurse, Healer of Heroes'||name==='Salvager of Ruin'||name==='Grim Return'){
  const dead=positive?donor():put(M,a,def('V54 old grave'),'graveyard');if(positive)await g.destroy(dead);if(name==='Salvager of Ruin'){const c=await cast();if(positive){await activate(c,[dead]);assert.equal(c.zone,'graveyard');}else assert.equal(g.activatableList(a).some(r=>r.card===c),false);}else if(positive)await cast(name,{aim:[dead]});else{const card=put(M,a,name,'hand'),mana=total(a);assert.equal(await g.castSpell(a,card,{from:'hand'}),name==='Night Nurse, Healer of Heroes');await settle(g);assert.equal(total(a),mana-(name==='Night Nurse, Healer of Heroes'?2:0));}assert.equal(dead.zone,positive?(name==='Grim Return'?'battlefield':'hand'):'graveyard');
 }else if(name==='Cloudstone Curio'){
  const c=await cast(),old=donor();picks=[positive?[old]:[]];await cast(def('V54 entering creature'));assert.equal(old.zone,positive?'hand':'battlefield');const host=donor();picks=[[host]];await cast(def('V54 entering artifact creature',['Artifact','Creature']));assert.equal(host.zone,'battlefield');assert.equal(c.zone,'battlefield');
 }else if(name==='Slab Hammer'){
  const host=donor(),land=permanent(M,g,a,M.DEFS.Forest),c=await cast();await activate(c,[host],true,r=>r.equip);picks=[positive?[land]:[]];await attack([host]);assert.equal(land.zone,positive?'hand':'battlefield');assert.equal(host.power,positive?5:3);
 }else if(['Pyroclastic Hellion','Dutiful Replicator','Anthropede','Elektra, Femme Fatale','Nimble Hobbit'].includes(name)){
  const target=donor(b),life=a.life,enemy=b.life;let card,land,food,room,token;
  if(name==='Pyroclastic Hellion'){land=permanent(M,g,a,M.DEFS.Forest);picks=[positive?[land]:[]];}
  if(name==='Dutiful Replicator'){[token]=await g.makeTokens(def('Zombie',['Creature'],{cost:'',subtypes:['Zombie'],colorsOverride:['B'],power:'2',toughness:'2'}),a);aims=positive?[token]:[];}
  if(name==='Anthropede'){room=permanent(M,g,b,def('V54 Room',['Enchantment'],{subtypes:['Room']}));card=put(M,a,'Forest','hand');yes=positive?'card':'no';picks=positive?[[card]]:[];aims=positive?[room]:[];}
  if(name==='Elektra, Femme Fatale')aims=positive?[target]:[];
  const preAim=aims.slice();const c=await cast(name,{aim:preAim});
  if(name==='Nimble Hobbit'){[food]=await g.makeTokens(M.TOKENS.food,a);yes=positive?'card':'no';picks=positive?[[food]]:[];aims=positive?[target]:[];await attack([c]);assert.equal(target.tapped,positive);}
  if(name==='Pyroclastic Hellion'){assert.equal(land.zone,positive?'hand':'battlefield');assert.equal(b.life,enemy-(positive?2:0));}
  if(name==='Dutiful Replicator')assert.equal(g.bf().filter(x=>x.isToken&&x.hasSub('Zombie')).length,positive?2:1);
  if(name==='Anthropede'){assert.equal(room.zone,positive?'graveyard':'battlefield');assert.equal(card.zone,positive?'graveyard':'hand');}
  if(name==='Elektra, Femme Fatale'){assert.equal(a.life,life-(positive?2:0));assert.equal(target.damage,positive?4:0);}
 }else if(name==='Basalt Ravager'){
  donor(a,{subtypes:['Elf']});donor(a,{subtypes:['Elf']});if(positive)donor(a,{subtypes:['Elf']});const life=b.life;await cast(name,{aim:[b]});assert.equal(b.life,life-(positive?3:2));
 }else if(name==='Ether Well'){
  const c=donor(b,{colorsOverride:positive?['R']:['G']});yes='yes';await cast(name,{aim:[c]});assert.equal(c.zone,'library');assert.equal(positive?b.library[0]:b.library.at(-1),c);
 }else if(name==='Sirocco'){
  const blue=put(M,b,noop('V54 blue instant'),'hand'),creature=put(M,b,def('V54 blue creature',['Creature'],{cost:'{U}'}),'hand'),life=b.life;await cast(name,{aim:[b]});assert.equal(blue.zone,positive?'hand':'graveyard');assert.equal(creature.zone,'hand');assert.equal(b.life,life-(positive?4:0));
 }else if(name==='Destined Confrontation'){
  const kept=donor(a,{power:'4'}),sac=donor(a,{power:'5'}),opp=donor(b,{power:'6'});picks=[positive?[kept]:[],[]];enemyPicks=[[]];await cast();assert.equal(kept.zone,positive?'battlefield':'graveyard');assert.equal(sac.zone,'graveyard');assert.equal(opp.zone,'graveyard');
 }else if(name==='Stench of Evil'){
  const land=permanent(M,g,b,M.DEFS.Plains),safe=permanent(M,g,b,M.DEFS.Forest),life=b.life,mana=total(b);await cast();assert.equal(land.zone,'graveyard');assert.equal(safe.zone,'battlefield');assert.equal(b.life,life-(positive?0:1));assert.equal(total(b),mana-(positive?2:0));
 }else if(name==='Eternal Flame'){
  for(let i=0;i<(positive?3:2);i++)permanent(M,g,a,M.DEFS.Mountain);const life=a.life,enemy=b.life;await cast(name,{aim:[b]});assert.equal(b.life,enemy-(positive?3:2));assert.equal(a.life,life-(positive?2:1));
 }else if(name==='Song of Blood'){
  for(let i=0;i<4;i++)put(M,a,i<(positive?2:1)?def('V54 milled creature'):M.DEFS.Forest);await cast();const attacker=donor(b);await attack([attacker],b);assert.equal(attacker.power,positive?5:4);const sameTurn=donor();await attack([sameTurn]);assert.equal(sameTurn.power,positive?5:4);const second=donor();g.turnNo++;await attack([second]);assert.equal(second.power,3);
 }else if(name==='Invoke the Ancients'){
  yes=positive?'reach':'trample';await cast();const tokens=g.bf().filter(c=>c.isToken&&c.hasSub('Spirit'));assert.equal(tokens.length,2);assert.equal(tokens.every(c=>c.power===4&&c.toughness===5&&c.counters[yes]===1),true);
 }else if(name==='Possessed Goat'){
  const c=await cast(),card=put(M,a,'Forest','hand');picks=[[card]];await activate(c);assert.equal(card.zone,'graveyard');assert.equal(c.counters['+1/+1'],3);assert.equal(c.hasSub('Demon'),true);assert.equal(c.colors.includes('B'),true);assert.equal(c.colors.includes('W'),true);assert.equal(g.activatableList(a).some(r=>r.card===c),false);
 }else if(name==='Counterlash'||name==='Fold into Aether'){
  const spell=put(M,b,noop('V54 countered',{cost:'{1}{U}',uncounterable:!positive}),'hand');await cast(spell.def,{card:spell,player:b,resolve:false});const so=g.stack.find(x=>x.card===spell),hand=put(M,name==='Counterlash'?a:b,name==='Counterlash'?noop('V54 free instant'):def('V54 free creature'),'hand');if(name==='Fold into Aether')enemyPicks=positive?[[hand]]:[];else{yes='yes';picks=[[hand]];}await cast(name,{aim:[so]});assert.equal(spell.zone,'graveyard');if(name==='Fold into Aether')assert.equal(hand.zone,positive?'battlefield':'hand');else assert.equal(hand.zone,'graveyard');
 }else if(name==='Mind Roots'){
  const land=put(M,b,'Forest','hand'),spell=put(M,b,noop(),'hand');enemyPicks=[[land,spell]];picks=[positive?[land]:[]];await cast(name,{aim:[b]});assert.equal(land.zone,positive?'battlefield':'graveyard');assert.equal(spell.zone,'graveyard');if(positive){assert.equal(land.ctrl,a);assert.equal(land.tapped,true);}
 }else if(name==='Abeyance'){
  const utility=donor(b,{abilities:[{cost:{mana:'{1}'},run:async()=>{}}]}),instant=put(M,b,noop(),'hand'),mana=total(b),hand=a.hand.length;assert.equal(g.activatableList(b).some(r=>r.card===utility),true);await cast(name,{aim:[b]});assert.equal(a.hand.length,hand+1);assert.equal(g.activatableList(b).some(r=>r.card===utility),false);assert.equal(await g.castSpell(b,instant,{from:'hand'}),false);assert.equal(total(b),mana);g.untilEffects=g.untilEffects.filter(e=>e.expires!=='eot');assert.equal(g.activatableList(b).some(r=>r.card===utility),true);
 }else if(name==='Sylvan Awakening'){
  const land=permanent(M,g,a,M.DEFS.Forest),other=permanent(M,g,b,M.DEFS.Forest);await cast();assert.equal(land.is('Creature'),true);assert.equal(land.power,2);assert.equal(land.kw('indestructible'),true);assert.equal(other.is('Creature'),false);g.untilEffects=g.untilEffects.filter(e=>e.expires!=='eot');g.recalc();assert.equal(land.is('Creature'),true);g.untilEffects=g.untilEffects.filter(e=>!(e.expires==='yourNext'&&e.ctrl===a));g.recalc();assert.equal(land.is('Creature'),false);
 }else if(name==='Chance for Glory'){
  const host=donor(),c=await cast();assert.equal(host.kw('indestructible'),true);assert.equal(g.extraTurns[0].player,a);assert.equal(g.extraTurns[0].options.lose,true);g.untilEffects=g.untilEffects.filter(e=>e.expires!=='eot');g.recalc();assert.equal(host.kw('indestructible'),true);await g.move(host,'exile');await g.putPermanentOntoBattlefield(host,a);assert.equal(host.kw('indestructible'),false);assert.equal(c.zone,'graveyard');
 }else if(name==='Reckless Blaze'){
  const lethal=donor(a,{toughness:'4'}),survivor=donor(a,{toughness:'20'}),enemy=donor(b,{toughness:'4'}),mana=a.pool.R;await cast();assert.equal(lethal.zone,'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(survivor.damage,5);const before=a.pool.R;if(positive)await g.destroy(survivor);else{await g.move(survivor,'exile');await g.putPermanentOntoBattlefield(survivor,a);await g.destroy(survivor);}await settle(g);assert.equal(a.pool.R,before+(positive?1:0));assert.ok(mana>0);
 }else if(name==='Earthlore'){
  const land=permanent(M,g,a,M.DEFS.Forest),blocker=donor(),c=await cast(name,{aim:[land]});blocker.blocking=donor(b).iid;await activate(c,[blocker]);assert.equal(land.tapped,true);assert.equal(blocker.power,4);assert.equal(blocker.toughness,22);assert.equal(g.activatableList(a).some(r=>r.card===c),false);
 }else if(name==='Withercrown'){
  const host=donor(b),c=await cast(name,{aim:[host]}),life=b.life;assert.equal(host.power,0);await g.emit('upkeep',{player:b});await settle(g);assert.equal(host.zone,positive?'graveyard':'battlefield');assert.equal(b.life,life-(positive?0:1));assert.equal(c.zone,positive?'graveyard':'battlefield');
 }else if(name==='Riverfall Mimic'){
  const c=await cast();await cast(noop('V54 color spell',{cost:positive?'{U}{R}':'{U}'}));assert.equal(c.power,positive?3:2);assert.equal(!!c.cur.unblockable,positive);
 }else if(name==='Valley Questcaller'){
  const c=await cast(),one=put(M,a,def('V54 Rabbit',['Creature'],{subtypes:['Rabbit']}),'hand'),two=put(M,a,def('V54 Mouse',['Creature'],{subtypes:['Mouse']}),'hand');let scries=0;choose(a,q=>{if(q.type==='scry')scries++;return null;});if(positive)await g.moveBattlefieldBatch([one,two]);else{await g.putPermanentOntoBattlefield(one,a);await settle(g);await g.putPermanentOntoBattlefield(two,a);}await settle(g);assert.equal(scries,positive?1:2);assert.equal(one.power,3);assert.equal(two.power,3);assert.equal(c.power,2);
 }else if(name==='Reach of Branches'){
  const c=await cast();assert.equal(g.bf().some(x=>x.isToken&&x.hasSub('Treefolk')&&x.toughness===5),true);const forest=put(M,a,'Forest','hand');await g.playLand(a,forest);await settle(g);assert.equal(c.zone,positive?'hand':'graveyard');
 }else if(name==='Curse of Thirst'){
  const c=await cast(name,{aim:[b]}),life=b.life;await g.emit('upkeep',{player:positive?b:a});await settle(g);assert.equal(b.life,life-(positive?1:0));assert.equal(c.meta.cursedPlayer,b);
 }else if(name==="Stonebinder's Familiar"){
  const c=await cast();if(!positive)g.turnPlayer=b;const cards=[put(M,b,'Forest','hand'),put(M,a,'Forest','hand')];for(const card of cards)await g.move(card,'exile');await settle(g);assert.equal(c.counters['+1/+1']||0,positive?1:0);g.turnPlayer=a;await g.move(cards[0],'hand');await g.move(cards[0],'exile');await settle(g);assert.equal(c.counters['+1/+1'],1);
 }else if(name==='Canyon Vaulter'||name==='Reckless Velocitaur'){
  const c=await cast(),vehicle=permanent(M,g,a,M.DEFS['Smuggler\'s Copter']),power=vehicle.power;g.phase=positive?'main1':'combat';picks=[[c]];await activate(vehicle,[],true,r=>r.crew);assert.equal(vehicle.is('Creature'),true);assert.equal(vehicle.power,power+(positive&&name==='Reckless Velocitaur'?2:0));if(name==='Reckless Velocitaur')assert.equal(vehicle.kw('trample'),positive);else assert.equal(vehicle.kw('flying'),true);
 }else if(name==='Rumbling Aftershocks'){
  const c=await cast(),life=b.life,spell=put(M,a,def('V54 kicker spell',['Creature'],{cost:'{1}{G}',kicker:'{1}'}),'hand');await cast(spell.def,{card:spell,aim:positive?[b]:[],opts:positive?{kicked:true}: {}});assert.equal(b.life,life-(positive?1:0));assert.equal(c.zone,'battlefield');
 }else throw Error('Missing v54 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV54(M,entry,op,role,h){if(!names.includes(entry.raw.name))return null;let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV54(M,entry.raw.name,role,positive,h,assert);return count;}
