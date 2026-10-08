import strict from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {fund,total,def,put,permanent,choose} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
export const names=["Arcbond", "Search for Survivors", "Phyrexian Grimoire", "Incite Hysteria", "Steamcore Scholar", "Throne of Empires", "Second Sunrise", "Carrion Rats", "Feint", "Tallowisp", "Ripples of Undeath", "Enter the Infinite", "Scepter of Empires", "Exuberant Wolfbear", "Conjured Currency", "Danitha, Benalia's Hope", "Guard Dogs", "Release to the Wind", "Grievous Wound", "Barbarian Bully", "Victor Mancha, Runaway", "Bitterheart Witch", "Uncle's Musings", "Bogardan Phoenix", "Suicidal Charge", "Bond of Passion", "Saffi Eriksdotter", "Fae Offering", "Twinning Glass", "Captain America, Wings of Freedom", "Trade Route Envoy", "Ignorant Bliss", "Iron Hills Blacksmith", "Repeating Barrage", "Entrails Feaster", "Quarry Colossus", "Noetic Scales", "Stonehewer Giant", "Myr Servitor", "Glamer Spinners", "Brood Keeper", "Ashnod's Intervention", "Sentinel", "Infernal Genesis", "Ballroom Brawlers", "Essence Leak", "Soulgorger Orgg", "Beckoning Will-o'-Wisp", "Rescuer Sphinx", "Sokenzan Smelter", "Goblin Festival", "Rampaging Geoderm", "Captain Vargus Wrath", "Elvish Healer", "Duskmantle Guildmage", "Carrion Wurm", "Belbe, Corrupted Observer", "Barreling Attack", "Heroic Defiance", "Greener Pastures", "Orah, Skyclave Hierophant", "Fighting Chance"];
export async function proveCommonV55(M,name,role,positive=true,h,assert=strict){
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
 const donor=(p=a,extra={})=>permanent(M,g,p,def('V55 witness',['Creature'],{power:'3',toughness:'20',...extra}));
 const noop=(label='V55 instant',extra={})=>def(label,['Instant'],{cost:'{U}',resolve:async()=>{},...extra});
 const cast=async(n=name,{aim=[],resolve=true,opts={},card,player=a}={})=>{if(player===a)aims=aim.slice();else enemyAims=aim.slice();card ||=put(M,player,n,'hand');const before=total(player);if(card.is('Land')){assert.equal(await g.playLand(player,card),true);assert.equal(total(player),before);}else{assert.equal(await g.castSpell(player,card,{from:card.zone,...opts}),true,typeof n==='string'?n:n.name);assert.ok(total(player)<before,'paid cast');}if(resolve)await settle(g);card.sick=false;return card;};
 const activate=async(c,aim=[],resolve=true,predicate=r=>!r.manaAbility)=>{aims=aim.slice();const row=g.activatableList(a).find(r=>r.card===c&&predicate(r));assert.ok(row,'legal activation '+c.name);assert.equal(await g.activateAbility(a,row),true);if(resolve)await settle(g);return row;};
 const auraDef=def('V55 creature Aura',['Enchantment'],{subtypes:['Aura'],cost:'{U}',auraTarget:[M.T.creature()]});
 const attach=async(p,host)=>{const c=put(M,p,auraDef,'hand');await g.move(c,'battlefield',{ctrl:p,attachTo:host});await settle(g);assert.equal(c.attachedTo,host.iid);return c;};
 const attack=async(cards,player=a)=>{g.turnPlayer=player;player.turnState.attacked=true;g.phase='combat';g.step='attackers';const target=player===a?b:a;g.combat={attackers:cards,declaredAttackTargets:cards.map(()=>target)};for(const c of cards){c.attacking=target;c.blockedBy=[];c.wasBlocked=false;c.meta._attackedTurn=g.turnNo;g.recordCombatObjectEvent(c,'attacks');}g.recalc();await g.emit('attackersDeclared',{player,attackers:cards});for(const c of cards)await g.emit('attacks',{player,card:c,defender:target});await settle(g);};
 const endStep=async player=>{await g.emit('endStep',{player});await settle(g);};
 if(name==='Captain Vargus Wrath'){
  const c=await cast(),pirate=donor(a,{subtypes:['Pirate']}),other=donor(),command=put(M,a,def('V55 commander'),'command');command.commander=true;command.cmdCasts=positive?2:0;a.commanders.push(command);await attack([c]);assert.equal(pirate.power,positive?5:3);assert.equal(other.power,3);assert.equal(c.power,positive?3:1);
 }else if(name==='Greener Pastures'){
  await cast();permanent(M,g,b,M.DEFS.Forest);if(!positive)permanent(M,g,a,M.DEFS.Forest);await g.emit('upkeep',{player:b});await settle(g);assert.equal(g.creatures(b).filter(c=>c.isToken&&c.hasSub('Saproling')).length,positive?1:0);
 }else if(name==='Throne of Empires'||name==='Scepter of Empires'){
  const c=await cast();if(positive)for(const n of ['Crown of Empires',name==='Throne of Empires'?'Scepter of Empires':'Throne of Empires'])permanent(M,g,a,def(n,['Artifact']));const life=b.life;await activate(c,name==='Scepter of Empires'?[b]:[]);if(name==='Throne of Empires')assert.equal(g.creatures(a).filter(x=>x.isToken&&x.hasSub('Soldier')).length,positive?5:1);else assert.equal(b.life,life-(positive?3:1));assert.equal(c.tapped,true);
 }else if(name==='Infernal Genesis'){
  await cast();const card=put(M,b,positive?def('V55 mill creature',['Creature'],{cost:'{3}'}):M.DEFS.Forest);await g.emit('upkeep',{player:b});await settle(g);assert.equal(card.zone,'graveyard');assert.equal(g.creatures(b).filter(c=>c.hasSub('Minion')).length,positive?3:0);
 }else if(name==='Myr Servitor'){
  const c=await cast(),one=put(M,a,name,'graveyard'),two=put(M,b,name,'graveyard');await g.emit('upkeep',{player:a});if(!positive)await g.move(c,'exile');await settle(g);assert.equal(one.zone,positive?'battlefield':'graveyard');assert.equal(two.zone,positive?'battlefield':'graveyard');assert.equal(two.owner,b);
 }else if(name==='Noetic Scales'){
  await cast();const one=donor(b,{power:'3'}),two=donor(b,{power:'2'});for(let i=0;i<(positive?2:3);i++)put(M,b,'Forest','hand');await g.emit('upkeep',{player:b});await settle(g);assert.equal(one.zone,positive?'hand':'battlefield');assert.equal(two.zone,'battlefield');
 }else if(name==='Quarry Colossus'){
  const target=donor(b);for(let i=0;i<(positive?2:0);i++)permanent(M,g,a,M.DEFS.Plains);await cast(name,{aim:[target]});assert.equal(target.zone,'library');assert.equal(b.library.at(positive?-3:-1),target);
 }else if(name==='Bogardan Phoenix'){
  const c=await cast();await g.destroy(c);await settle(g);assert.equal(c.zone,'battlefield');assert.equal(c.counters.death,1);if(positive)await g.destroy(c);else await g.move(c,'hand');await settle(g);assert.equal(c.zone,positive?'exile':'hand');
 }else if(name==='Fae Offering'){
  await cast();if(positive)await cast(def('V55 creature spell'));await g.emit('endStep',{player:b});await settle(g);for(const type of ['Clue','Food','Treasure'])assert.equal(g.bf().filter(c=>c.isToken&&c.hasSub(type)).length,positive?1:0);
 }else if(name==='Goblin Festival'){
  const c=await cast(),life=b.life;let result;const emit=g.emit;g.emit=async function(n,d,...args){if(n==='coinFlipped')result=d;return emit.call(this,n,d,...args);};await activate(c,[b]);assert.equal(b.life,life-1);assert.equal(c.ctrl,result.won?a:b);
 }else if(name==='Tallowisp'){
  const c=await cast(),card=put(M,a,'Holy Strength'),other=put(M,a,'Abundant Growth');picks=positive?[[card]]:[];await cast(def('V55 Spirit',['Creature'],{subtypes:['Spirit']}));assert.equal(card.zone,positive?'hand':'library');assert.equal(other.zone,'library');assert.equal(c.zone,'battlefield');
 }else if(name==='Trade Route Envoy'){
  const host=donor();if(positive)g.addCounters(host,'+1/+1',1);const hand=a.hand.length,c=await cast();assert.equal(a.hand.length,hand+(positive?1:0));assert.equal(c.counters['+1/+1']||0,positive?0:1);
 }else if(name==='Soulgorger Orgg'){
  const before=a.life,c=await cast();assert.equal(a.life,1);if(positive)await g.destroy(c);else await g.move(c,'exile');await settle(g);assert.equal(a.life,before);
 }else if(name==='Entrails Feaster'){
  const c=await cast(),grave=put(M,b,def('V55 grave creature'),'graveyard');picks=[positive?[grave]:[]];await g.emit('upkeep',{player:a});await settle(g);assert.equal(grave.zone,positive?'exile':'graveyard');assert.equal(c.counters['+1/+1']||0,positive?1:0);assert.equal(c.tapped,!positive);
 }else if(name==='Essence Leak'){
  const host=donor(b,{colorsOverride:['G'],cost:'{2}{G}'});await cast(name,{aim:[host]});const mana=total(b);await g.emit('upkeep',{player:b});await settle(g);assert.equal(host.zone,positive?'battlefield':'graveyard');assert.equal(total(b),mana-(positive?3:0));
 }else if(name==="Danitha, Benalia's Hope"){
  const equipment=put(M,a,M.DEFS.Bonesplitter,'graveyard');picks=[positive?[equipment]:[]];const c=await cast();assert.equal(equipment.zone,positive?'battlefield':'graveyard');if(positive){assert.equal(equipment.attachedTo,c.iid);assert.equal(c.power,6);}
 }else if(name==='Brood Keeper'){
  const c=await cast(),host=positive?c:donor();await attach(a,host);const dragons=g.creatures(a).filter(c=>c.isToken&&c.hasSub('Dragon'));assert.equal(dragons.length,positive?1:0);if(positive){const dragon=dragons[0];assert.equal(dragon.kw('flying'),true);dragon.sick=false;await activate(dragon);assert.equal(dragon.power,3);}
 }else if(name==='Sokenzan Smelter'){
  const c=await cast(),artifact=permanent(M,g,a,def('V55 artifact',['Artifact']));picks=positive?[[artifact]]:[];const mana=total(a);await g.emit('beginCombat',{player:a});await settle(g);assert.equal(artifact.zone,positive?'graveyard':'battlefield');assert.equal(total(a),mana-(positive?1:0));const tokens=g.creatures(a).filter(c=>c.isToken&&c.hasSub('Construct'));assert.equal(tokens.length,positive?1:0);if(positive){assert.equal(tokens[0].is('Artifact'),true);assert.equal(tokens[0].kw('haste'),true);}assert.equal(c.zone,'battlefield');
 }else if(name==='Carrion Rats'||name==='Carrion Wurm'){
  const c=await cast(),cards=Array.from({length:name==='Carrion Rats'?1:3},()=>put(M,a,'Forest','graveyard'));picks=positive?[cards]:[];await attack([c]);assert.equal(g.dmgAmount(c,'normal'),positive?0:Number(c.def.power));assert.equal(cards.every(c=>c.zone==='exile'),positive);
 }else if(name==='Rescuer Sphinx'){
  const host=donor();picks=[positive?[host]:[]];const c=await cast();assert.equal(host.zone,positive?'hand':'battlefield');assert.equal(c.counters['+1/+1']||0,positive?1:0);
 }else if(name==='Captain America, Wings of Freedom'){
  const c=await cast(),hero=donor(a,{subtypes:[positive?'Hero':'Warrior']}),n=c.toughness;await attack([c]);assert.equal(hero.power,3+(positive?n:0));assert.equal(c.power,3);
 }else if(name==='Exuberant Wolfbear'){
  const human=donor(a,{subtypes:['Human'],power:'1',toughness:'2'}),c=await cast();aims=[human];await attack([c]);assert.equal(human.power,positive?4:1);assert.equal(human.toughness,positive?4:2);
 }else if(name==='Ballroom Brawlers'){
  const host=donor(),c=await cast();aims=[positive?host:[]];yes=positive?'first strike':'lifelink';await attack([c]);assert.equal(c.kw(yes),true);assert.equal(host.kw(yes),positive);
 }else if(name==='Belbe, Corrupted Observer'){
  await cast();if(positive)await g.loseLife(b,1);const mine=a.pool.C,other=b.pool.C;await g.emit('postcombatMain',{player:b});await settle(g);assert.equal(b.pool.C,other+(positive?2:0));assert.equal(a.pool.C,mine);
 }else if(name==='Repeating Barrage'){
  const c=await cast(name,{aim:[b]});if(positive)await attack([donor()]);assert.equal(g.activatableList(a).some(r=>r.card===c),positive);if(positive){const mana=total(a);await activate(c);assert.equal(c.zone,'hand');assert.equal(total(a),mana-5);}
 }else if(name==='Steamcore Scholar'){
  const spell=put(M,a,noop(),'hand'),land=put(M,a,'Forest','hand');picks=[positive?[spell]:[spell,land]];await cast();assert.equal(spell.zone,'graveyard');assert.equal(land.zone,positive?'hand':'graveyard');assert.equal(a.hand.length,positive?3:2);
 }else if(name==='Saffi Eriksdotter'){
  const host=donor(),c=await cast();await activate(c,[host]);assert.equal(c.zone,'graveyard');if(!positive){await g.move(host,'exile');await g.putPermanentOntoBattlefield(host,a);}await g.destroy(host);await settle(g);assert.equal(host.zone,positive?'battlefield':'graveyard');
 }else if(name==='Victor Mancha, Runaway'){
  const card=put(M,a,'Forest','graveyard'),c=await cast(name,{aim:[card]});assert.equal(card.zone,'exile');assert.equal(g.hasExilePlayPermission(a,card),true);if(!positive)await g.move(c,'hand');assert.equal(g.hasExilePlayPermission(a,card),positive);if(positive){assert.equal(await g.playLand(a,card,{from:'exile'}),true);assert.equal(card.zone,'battlefield');}
 }else if(name==='Glamer Spinners'){
  const first=donor(b),next=donor(b),aura=await attach(a,first);picks=[[next]];await cast(name,{aim:[first]});assert.equal(aura.attachedTo,next.iid);assert.equal(aura.ctrl,a);assert.equal(first.attachments.includes(aura.iid),false);
 }else if(name==='Phyrexian Grimoire'){
  const c=await cast(),one=put(M,a,'Forest','graveyard'),two=put(M,a,noop(),'graveyard');enemyPicks=[[positive?one:two]];await activate(c,[b]);assert.equal(one.zone,positive?'exile':'hand');assert.equal(two.zone,positive?'hand':'exile');
 }else if(name==='Elvish Healer'){
  const target=donor(a,{colorsOverride:positive?['G']:['B']}),c=await cast(),enemy=donor(b);await activate(c,[target]);await g.damageBatch([{src:enemy,target,n:3}],{deferSBA:true});assert.equal(target.damage,positive?1:2);
 }else if(name==='Twinning Glass'){
  const c=await cast(),d=noop('V55 repeated spell');await cast(d);const card=put(M,a,positive?d:noop('V55 different spell'),'hand');yes='yes';picks=positive?[[card]]:[];const mana=total(a);await activate(c);assert.equal(card.zone,positive?'graveyard':'hand');assert.equal(total(a),mana-1);if(positive){g.untap(c);const adventure=put(M,a,def('V55 adventure body',['Creature'],{cost:'{4}{U}',adventure:{name:d.name,cost:'{U}',types:'Instant',resolve:async()=>{}}}),'hand');picks=[[adventure]];await activate(c);assert.equal(adventure.zone,'exile');}
 }else if(name==='Ripples of Undeath'){
  const c=await cast(),top=put(M,a,def('V55 mill choice')),life=a.life,mana=total(a);picks=positive?[[top]]:[];await g.emit('precombatMain',{player:a});await settle(g);assert.equal(top.zone,positive?'hand':'graveyard');assert.equal(a.life,life-(positive?3:0));assert.equal(total(a),mana-(positive?1:0));assert.equal(c.zone,'battlefield');
 }else if(name==='Barbarian Bully'){
  const c=await cast(),card=put(M,a,'Forest','hand'),life=a.life;await activate(c);assert.equal(card.zone,'graveyard');assert.equal(c.power,positive?2:4);assert.equal(a.life,life-(positive?4:0));assert.equal(g.activatableList(a).some(r=>r.card===c),false);
 }else if(name==='Duskmantle Guildmage'){
  const c=await cast();await activate(c);const life=b.life;await g.mill(positive?b:a,2);await settle(g);assert.equal(b.life,life-(positive?2:0));await g.mill(b,1);await settle(g);assert.equal(b.life,life-(positive?3:1));const n=b.library.length;await activate(c,[b],true,r=>r.ability===c.def.abilities[1]);assert.equal(b.library.length,n-2);assert.equal(b.life,life-(positive?5:3));
 }else if(name==='Conjured Currency'){
  const enemy=donor(b),c=await cast();aims=[enemy];await g.emit('upkeep',{player:a});await settle(g);assert.equal(c.ctrl,positive?b:a);assert.equal(enemy.ctrl,positive?a:b);
 }else if(name==='Bitterheart Witch'){
  const c=await cast(),curse=put(M,a,Object.values(M.DEFS).find(d=>d.name==='Curse of Opulence'));aims=[b];picks=positive?[[curse]]:[];await g.destroy(c);await settle(g);assert.equal(curse.zone,positive?'battlefield':'library');if(positive)assert.equal(curse.meta.cursedPlayer,b);
 }else if(name==='Heroic Defiance'){
  const host=donor(a,{colorsOverride:['G']});if(positive)for(let i=0;i<3;i++)donor(b,{colorsOverride:['R']});await cast(name,{aim:[host]});assert.equal(host.power,positive?6:3);
 }else if(name==='Sentinel'){
  const c=await cast(),enemy=donor(b,{power:positive?'5':'2'});c.blocking=enemy.iid;enemy.blockedBy=[c];await activate(c,[enemy]);assert.equal(c.toughness,positive?6:3);assert.equal(c.power,1);
 }else if(name==="Beckoning Will-o'-Wisp"){
  const c=await cast(),host=donor();await g.emit('beginCombat',{player:a});await settle(g);await attack([host]);assert.equal(host.power,4);if(!positive){await g.move(c,'hand');g.recalc();assert.equal(host.power,3);}
 }else if(name==='Rampaging Geoderm'){
  const c=await cast(),host=donor();aims=[host];if(positive){const battle=permanent(M,g,b,def('V55 Battle',['Battle']));battle.counters.defense=5;g.recalc();g.combat={attackers:[host],declaredAttackTargets:[battle]};host.attacking=battle;await g.emit('attackersDeclared',{player:a,attackers:[host]});await settle(g);}else await attack([host]);assert.equal(host.power,4);assert.equal(host.counters['+1/+1']||0,positive?1:0);assert.equal(c.kw('haste'),true);
 }else if(name==='Grievous Wound'){
  const c=await cast(name,{aim:[b]}),life=b.life;assert.equal(await g.gainLife(b,3,c),0);await g.damageBatch([{src:c,target:positive?b:a,n:2}],{deferSBA:true});await settle(g);assert.equal(b.life,positive?Math.floor((life-2)/2):life);
 }else if(name==='Iron Hills Blacksmith'){
  await cast();const axe=g.bf().find(c=>c.isToken&&c.name==='Axe'),host=donor();assert.ok(axe);await activate(axe,[host],true,r=>r.equip);assert.equal(host.power,4);assert.equal(axe.attachedTo,host.iid);
 }else if(name==='Stonehewer Giant'){
  const c=await cast(),equipment=put(M,a,M.DEFS.Bonesplitter),host=donor();picks=positive?[[equipment],[host]]:[[]];await activate(c);assert.equal(equipment.zone,positive?'battlefield':'library');if(positive){assert.equal(equipment.attachedTo,host.iid);assert.equal(host.power,5);}
 }else if(name==='Guard Dogs'){
  const c=await cast(),host=donor(a,{colorsOverride:positive?['R']:['U']}),enemy=donor(b,{colorsOverride:['R']});picks=[[host]];await activate(c,[enemy]);const life=a.life;await g.damageBatch([{src:enemy,target:a,n:3}],{combat:true,deferSBA:true});assert.equal(a.life,life-(positive?0:3));
 }else if(name==='Suicidal Charge'){
  const c=await cast(),enemy=donor(b),mine=donor();await activate(c);assert.equal(c.zone,'graveyard');assert.equal(enemy.power,2);assert.equal(enemy.meta.mustAttackTurn,g.turnNo);assert.equal(mine.power,3);
 }else if(name==='Search for Survivors'){
  const card=put(M,a,positive?def('V55 grave creature'):M.DEFS.Forest,'graveyard');await cast();assert.equal(card.zone,positive?'battlefield':'exile');
 }else if(name==='Enter the Infinite'){
  const n=a.library.length;await cast();assert.equal(a.library.length,1);assert.equal(a.hand.length,n-1);assert.equal(g.maximumHandSize(a),Infinity);g.untilEffects=g.untilEffects.filter(e=>e.kind!=='no-max-hand-v55');assert.equal(g.maximumHandSize(a),7);
 }else if(name==="Uncle's Musings"){
  const card=put(M,a,'Forest','graveyard'),instant=put(M,a,noop(),'graveyard');picks=[positive?[card]:[]];const c=await cast();assert.equal(c.zone,'exile');assert.equal(card.zone,positive?'hand':'graveyard');assert.equal(instant.zone,'graveyard');
 }else if(name==='Second Sunrise'){
  const one=donor(),two=donor(b),old=put(M,a,def('V55 old dead'),'graveyard');await g.destroy(one);await g.destroy(two);if(!positive)g.turnNo++;await cast();assert.equal(one.zone,positive?'battlefield':'graveyard');assert.equal(two.zone,positive?'battlefield':'graveyard');assert.equal(old.zone,'graveyard');assert.equal(two.owner,b);
 }else if(name==='Release to the Wind'){
  const host=donor(b),mana=total(b);await cast(name,{aim:[host]});assert.equal(host.zone,'exile');assert.equal(g.hasExilePlayPermission(b,host),true);g.turnPlayer=b;g.phase='main1';g.step='main';const row=g.castableList(b).find(r=>r.card===host);assert.ok(row);assert.equal(row.alt?.free,true);assert.equal(await g.castSpell(b,host,{from:row.from,...row.alt}),true);await settle(g);assert.equal(host.zone,'battlefield');assert.equal(total(b),mana);
 }else if(name==='Ignorant Bliss'){
  const card=put(M,a,'Forest','hand'),n=a.hand.length;await cast();assert.equal(a.hand.length,0);assert.equal(card.zone,'exile');assert.equal(card.faceDown,true);if(!positive)await g.move(card,'graveyard');await g.emit('endStep',{player:b});await settle(g);assert.equal(a.hand.length,positive?n+1:n);assert.equal(card.zone,positive?'hand':'graveyard');
 }else if(name==='Fighting Chance'){
  const enemy=donor(b),blocker=donor();blocker.blocking=enemy.iid;let won;const emit=g.emit;g.emit=async function(n,d,...args){if(n==='coinFlipped')won=d.won;return emit.call(this,n,d,...args);};await cast();const life=b.life;await g.damageBatch([{src:blocker,target:b,n:3}],{combat:true,deferSBA:true});assert.equal(b.life,life-(won?0:3));
 }else if(name==='Arcbond'){
  const host=donor(a,{toughness:positive?'1':'20'}),enemy=donor(b),life=a.life,other=b.life;await cast(name,{aim:[host]});await g.damageBatch([{src:enemy,target:host,n:2}]);await settle(g);assert.equal(a.life,life-2);assert.equal(b.life,other-2);assert.equal(enemy.damage,2);assert.equal(host.zone,positive?'graveyard':'battlefield');
 }else if(name==="Ashnod's Intervention"){
  const host=donor();await cast(name,{aim:[host]});assert.equal(host.power,5);if(positive)await g.destroy(host);else await g.move(host,'exile');await settle(g);assert.equal(host.zone,'hand');
 }else if(name==='Barreling Attack'){
  const host=donor(),enemy=donor(b);await cast(name,{aim:[host]});assert.equal(host.kw('trample'),true);host.blockedBy=positive?[enemy]:[];if(positive){await g.emit('becomesBlocked',{attacker:host,blockers:[enemy]});await settle(g);}assert.equal(host.power,positive?4:3);
 }else if(name==='Bond of Passion'){
  const host=donor(b),life=b.life;await cast(name,{aim:[host,b]});assert.equal(host.ctrl,a);assert.equal(host.kw('haste'),true);assert.equal(b.life,life-2);g.untilEffects=g.untilEffects.filter(e=>e.expires!=='eot');g.recalc();assert.equal(host.ctrl,b);
 }else if(name==='Feint'){
  const host=donor(),blocker=donor(b);host.attacking=b;host.blockedBy=[blocker];blocker.blocking=host.iid;await cast(name,{aim:[host]});assert.equal(blocker.tapped,true);const life=a.life,other=b.life;await g.damageBatch([{src:host,target:b,n:3},{src:blocker,target:a,n:3}],{combat:positive,deferSBA:true});assert.equal(a.life,life-(positive?0:3));assert.equal(b.life,other-(positive?0:3));
 }else if(name==='Incite Hysteria'){
  const host=donor(a,{colorsOverride:['R']}),other=donor(b,{colorsOverride:positive?['R']:['G']});await cast(name,{aim:[host]});assert.equal(host.cur.cantBlock,true);assert.equal(!!other.cur.cantBlock,positive);
 }else if(name==='Orah, Skyclave Hierophant'){
  const c=await cast(),small=put(M,a,def('V55 small Cleric',['Creature'],{cost:positive?'{1}':'{2}',subtypes:['Cleric']}),'graveyard'),dead=donor(a,{cost:'{2}',subtypes:['Cleric']});if(positive)aims=[small];await g.destroy(dead);await settle(g);assert.equal(small.zone,positive?'battlefield':'graveyard');assert.equal(c.zone,'battlefield');
 }else throw Error('Missing v55 proof '+name);
 assertGameStateInvariants(g);assert.equal(a.controller instanceof M.AIController,role==='ai');return f;
}
export async function operationProofV55(M,entry,op,role,h){if(!names.includes(entry.raw.name))return null;let count=0;const assert=Object.fromEntries(['ok','equal'].map(k=>[k,(...args)=>{count++;strict[k](...args);} ]));for(const positive of[true,false])await proveCommonV55(M,entry.raw.name,role,positive,h,assert);return count;}
