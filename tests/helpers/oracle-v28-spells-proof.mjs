import strict from 'node:assert/strict';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
const fund=p=>{for(const c in p.pool)p.pool[c]=30;},sum=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
const choose=(p,fn)=>{const prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(g,q)??prior(g,q);};
function body(M,f,p,extra={}){const c=put(M,f.game,p,'Grizzly Bears',extra.zone||'battlefield');c.def={...c.def,cost:'{2}{G}',power:'4',toughness:'30',kws:[],...extra};f.game.recalc();return c;}
function makeContext(M,role,h){if(!h)return context(M,role);const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.fillLibrary(M,f.a,30);h.fillLibrary(M,f.b,30);return f;}
export const wholeSourcesV28=new Set(['Voltage Surge','Swallow Whole','Lethal Throwdown','Treacherous Greed',"Kaervek's Spite",'Surge of Strength','Monstrous Emergence','Close Encounter','Paradoxical Outcome','Command the Dreadhorde','Cleansing Meditation','Warren Weirding','Rise of the Witch-king','Skull Raid','Mind Bomb','The Elderspell','Searing Blaze','Concussive Bolt',"Sandman's Quicksand",'Pollen Remedy','Remedy','Embolden','Meteor Swarm','Mythos of Vadrok',"Aurelia's Fury",'Phyrexian Purge','Officious Interrogation','Cerebral Vortex','Wing Storm','Balance of Power','Superior Numbers','Triumphant Chomp','Cut Propulsion','Frantic Firebolt','Serpentine Curve','Candlekeep Inspiration','Aether Burst']);
export async function proveSpellV28(M,name,role,positive,h,assert=strict){
 const f=makeContext(M,role,h),{game,a,b}=f;fund(a);fund(b);
 const gravecast=positive&&['Embolden',"Sandman's Quicksand"].includes(name),source=put(M,game,a,name,gravecast?'graveyard':'hand'),own=body(M,f,a),ally=body(M,f,a),enemy=body(M,f,b),other=body(M,f,b),grave=body(M,f,a,{zone:'graveyard'}),opGrave=body(M,f,b,{zone:'graveyard'});
 let target=enemy,targets,extra,extra2,slot=0,quota,opts={from:gravecast?'graveyard':'hand'};
 if(name==='Voltage Surge'){own.def={...own.def,types:['Artifact'],subtypes:[]};}
 if(name==='Lethal Throwdown')own.counters['+1/+1']=1;
 if(name==='Swallow Whole')enemy.tapped=true;
 if(name==='Surge of Strength')extra=body(M,f,a,{zone:'hand',colorsOverride:[positive?'R':'U']});
 if(name==='Treacherous Greed'&&positive){await game.damageAny(own,enemy,2);await settle(game);}
 if(name==='Monstrous Emergence')extra=body(M,f,a,{zone:'hand',power:'6'});
 if(name==='Close Encounter'){extra=body(M,f,a,{zone:'exile',power:'6'});extra.meta={warped:true,warpedVersion:extra.zoneVersion,warpedTurn:game.turnNo};}
 if(name==='Paradoxical Outcome'){targets=[own,ally];if(!positive){await game.move(ally,'graveyard');targets=[own];}}
 if(name==='Command the Dreadhorde')targets=positive?[grave,opGrave]:[];
 if(name==='Cleansing Meditation'){own.def={...own.def,types:['Enchantment'],subtypes:[]};enemy.def={...enemy.def,types:['Enchantment'],subtypes:[]};if(positive)for(let i=game.players[0].graveyard.length;i<7;i++)body(M,f,a,{zone:'graveyard'});}
 if(name==='Warren Weirding'){enemy.def={...enemy.def,subtypes:positive?['Goblin']:['Bear']};target=b;}
 if(name==='Rise of the Witch-king'&&!positive){await game.move(own,'graveyard');await game.move(ally,'graveyard');}
 if(name==='Skull Raid'){target=b;body(M,f,b,{zone:'hand'});if(!positive)body(M,f,b,{zone:'hand'});}
 if(name==='Mind Bomb'){body(M,f,a,{zone:'hand'});body(M,f,b,{zone:'hand'});body(M,f,b,{zone:'hand'});}
 if(name==='The Elderspell'){enemy.def={...enemy.def,types:['Planeswalker'],subtypes:[],power:undefined,toughness:undefined};enemy.counters.loyalty=4;own.def={...own.def,types:['Planeswalker'],subtypes:[],power:undefined,toughness:undefined};own.counters.loyalty=5;if(!positive)enemy.def.kws=['indestructible'];targets=[enemy];}
 if(name==='Searing Blaze'){if(positive)await game.putPermanentOntoBattlefield(put(M,game,a,'Forest','hand'),a);}
 if(name==='Concussive Bolt'){target=b;for(let i=0;i<(positive?3:2);i++)body(M,f,a,{types:['Artifact'],subtypes:[],power:undefined,toughness:undefined});}
 if(name==="Sandman's Quicksand"&&positive){await game.move(source,'hand');await game.discard(a,[source]);}
 if(name==="Kaervek's Spite"){target=b;if(positive){body(M,f,a,{zone:'hand'});body(M,f,a,{zone:'hand'});}else{await game.move(own,'graveyard');await game.move(ally,'graveyard');}}
 if(['Pollen Remedy','Remedy','Embolden'].includes(name)){targets=[own,enemy];if(name==='Pollen Remedy')extra=put(M,game,a,'Forest');}
 if(name==='Meteor Swarm')targets=positive?[enemy,other]:[enemy];
 if(name==='Mythos of Vadrok'){targets=[enemy,other];for(const color in a.pool)a.pool[color]=0;a.pool.R=positive?2:4;a.pool.W=positive?1:0;a.pool.U=positive?1:0;}
 if(name==="Aurelia's Fury"){targets=[enemy,b];if(!positive){game.untilEffects.push({kind:'oraclePreventNextAmount',target:enemy,zoneVersion:enemy.zoneVersion,remaining:1,expires:'eot'},{kind:'oraclePreventNextAmount',target:b,remaining:3,expires:'eot'});}}
 if(name==='Phyrexian Purge')targets=positive?[enemy,other]:[];
 if(name==='Officious Interrogation'){targets=[a,b];if(!positive){await game.move(enemy,'graveyard');await game.move(other,'graveyard');}}
 if(name==='Cerebral Vortex'){target=b;b.turnState.drewThisTurn=positive?3:0;}
 if(name==='Wing Storm'){own.def.kws=['flying'];enemy.def.kws=['flying'];if(positive)other.def.kws=['flying'];}
 if(name==='Balance of Power'){target=b;if(positive)for(let i=0;i<4;i++)body(M,f,b,{zone:'hand'});}
 if(name==='Superior Numbers'&&positive){body(M,f,a);body(M,f,a);}
 if(name==='Triumphant Chomp'&&positive)own.def={...own.def,subtypes:['Dinosaur'],power:'6'};
 if(name==='Cut Propulsion'&&positive)enemy.def.kws=['flying','lifelink'];
 if(['Frantic Firebolt','Serpentine Curve','Candlekeep Inspiration'].includes(name)&&positive){body(M,f,a,{zone:'graveyard',types:['Instant'],power:undefined,toughness:undefined});body(M,f,a,{zone:name==='Frantic Firebolt'?'graveyard':'exile',types:['Sorcery'],power:undefined,toughness:undefined});if(name!=='Serpentine Curve')body(M,f,a,{zone:'graveyard',adventure:{cost:'{1}'}});}
 if(name==='Aether Burst'){if(positive){put(M,game,a,name,'graveyard');put(M,game,b,name,'graveyard');targets=[own,enemy,other];}else targets=[enemy];}
 game.recalc();const before={aLife:a.life,bLife:b.life,hand:a.hand.length,bHand:b.hand.length,mana:sum(a),enemyDamage:enemy.damage,ownPower:own.power,library:a.library.length};
 choose(a,(g,q)=>{
  if(q.type==='chooseOption'){if(q.options.some(o=>o.key==='modified'))return positive?'modified':'normal';if(q.aiHint?.kind==='kicker')return positive?'yes':'no';}
  if(q.type==='chooseTargets'){if(name==='Aether Burst')quota=q.max;if(targets)return targets;if(name==='Searing Blaze'||name==='Superior Numbers')return [slot++===0?(name==='Searing Blaze'?b:enemy):(name==='Searing Blaze'?enemy:b)];return q.candidates.includes(target)?[target]:undefined;}
  if(q.type==='chooseX')return q.allocation?q.min:name==='Meteor Swarm'?(positive?2:1):name==="Aurelia's Fury"?4:undefined;
  if(q.type==='chooseCards'){if(['Close Encounter','Monstrous Emergence'].includes(name))return [positive?extra:own];if(name==='Surge of Strength')return [extra];if(name==='Pollen Remedy'&&q.from.includes(extra))return [extra];if(name==='Rise of the Witch-king')return q.from.includes(own)?[own]:q.from.includes(grave)?[grave]:[];if(name==='The Elderspell')return [own];if(name==='Mind Bomb')return positive?q.from.slice(0,q.max):[];if(q.from.includes(own)&&['Voltage Surge','Swallow Whole','Lethal Throwdown','Treacherous Greed'].includes(name))return [own];}
 });
 choose(b,(g,q)=>q.type==='chooseCards'?(name==='Mind Bomb'?(positive?q.from.slice(0,q.max):[]):q.from.includes(enemy)&&['Warren Weirding','Rise of the Witch-king'].includes(name)?[enemy]:undefined):undefined);
 if(gravecast){const offer=game.castableList(a).find(row=>row.card===source&&(name==='Embolden'?row.alt?.flashback:row.alt?.mayhem||row.mayhem));assert.ok(offer,name+' alternate cast');opts={...opts,...offer,from:'graveyard',alt:offer.alt||{mayhem:true,altCostStr:'{3}{B}',speed:'sorcery'}};}
 const shouldCast=!(name==='Surge of Strength'&&!positive||name==='Treacherous Greed'&&!positive);
 assert.equal(await game.castSpell(a,source,opts),shouldCast,name+' paid cast');
 if(!shouldCast){assert.equal(source.zone,'hand');assert.equal(sum(a),before.mana);assert.equal(own.zone,'battlefield');assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return f;}
 assert.ok(sum(a)<before.mana,name+' mana consumed');const so=game.stack.find(s=>s.card===source);assert.ok(so);await settle(game);
 switch(name){
  case 'Close Encounter':case 'Monstrous Emergence':assert.equal(enemy.damage,positive?6:4);assert.equal((positive?extra:own).zone,positive?(name==='Close Encounter'?'exile':'hand'):'battlefield');break;
  case 'Voltage Surge':assert.equal(own.zone,positive?'graveyard':'battlefield');assert.equal(enemy.damage,positive?4:2);break;
  case 'Lethal Throwdown':assert.equal(own.zone,'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(a.hand.length,before.hand-1+(positive?1:0));break;
  case 'Treacherous Greed':assert.equal(own.zone,'graveyard');assert.equal(a.hand.length,before.hand+2);assert.equal(a.life,before.aLife+3);assert.equal(b.life,before.bLife-3);break;
  case 'Surge of Strength':assert.equal(extra.zone,'graveyard');assert.equal(enemy.power,7);assert.equal(enemy.kw('trample'),true);break;
  case 'Swallow Whole':assert.equal(enemy.zone,'exile');assert.equal(own.tapped,true);assert.equal(own.counters['+1/+1'],1);break;
  case "Kaervek's Spite":assert.equal(game.bf().filter(c=>c.ctrl===a).length,0);assert.equal(a.hand.length,0);assert.equal(b.life,before.bLife-5);assert.equal(source.zone,'graveyard');break;
  case 'Paradoxical Outcome':assert.equal(own.zone,'hand');assert.equal(ally.zone,positive?'hand':'graveyard');assert.equal(a.library.length,before.library-(positive?2:1));break;
  case 'Command the Dreadhorde':assert.equal(a.life,before.aLife-(positive?6:0));assert.equal(grave.zone,positive?'battlefield':'graveyard');assert.equal(opGrave.zone,positive?'battlefield':'graveyard');if(positive)assert.equal(opGrave.ctrl,a);break;
  case 'Cleansing Meditation':assert.equal(own.zone,positive?'battlefield':'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(other.zone,'battlefield');break;
  case 'Warren Weirding':{assert.equal(enemy.zone,'graveyard');const tokens=game.bf().filter(c=>c.isToken&&c.hasSub('Goblin'));assert.equal(tokens.length,positive?2:0);for(const token of tokens){assert.equal(token.ctrl,b);assert.equal(token.kw('haste'),true);}break;}
  case 'Rise of the Witch-king':assert.equal(enemy.zone,'graveyard');assert.equal(grave.zone,positive?'battlefield':'graveyard');if(positive)assert.equal(own.zone,'graveyard');break;
  case 'Skull Raid':assert.equal(b.hand.length,0);assert.equal(a.hand.length,before.hand-1+(positive?1:0));break;
  case 'Mind Bomb':assert.equal(a.life,before.aLife-(positive?2:3));assert.equal(b.life,before.bLife-(positive?1:3));break;
  case 'The Elderspell':assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(own.counters.loyalty,positive?7:5);break;
  case 'Searing Blaze':assert.equal(enemy.damage,positive?3:1);assert.equal(b.life,before.bLife-(positive?3:1));break;
  case 'Concussive Bolt':assert.equal(b.life,before.bLife-4);assert.equal(enemy.cur.cantBlock,positive);assert.equal(other.cur.cantBlock,positive);break;
  case "Sandman's Quicksand":assert.equal(own.power,before.ownPower-(positive?0:2));assert.equal(enemy.power,2);assert.equal(source.zone,'graveyard');break;
  case 'Pollen Remedy':case 'Remedy':case 'Embolden':{const total=name==='Pollen Remedy'?(positive?6:3):name==='Remedy'?5:4;assert.equal(so.damageDivision.reduce((n,r)=>n+r.n,0),total);await game.damageBatch([{src:other,target:own,n:3},{src:other,target:enemy,n:7}],{deferSBA:true});await settle(game);assert.equal(own.damage,2);assert.equal(enemy.damage,8-total);if(name==='Pollen Remedy')assert.equal(extra.zone,positive?'graveyard':'battlefield');if(name==='Embolden')assert.equal(source.zone,positive?'exile':'graveyard');break;}
  case 'Meteor Swarm':assert.equal(so.x,positive?2:1);assert.equal(enemy.damage,positive?1:8);assert.equal(other.damage,positive?7:0);break;
  case 'Mythos of Vadrok':assert.equal(enemy.damage,1);assert.equal(other.damage,4);assert.equal(enemy.cur.cantAttack,positive);assert.equal(enemy.cur.activationDisabled,positive);break;
  case "Aurelia's Fury":assert.equal(enemy.damage,positive?1:0);assert.equal(enemy.tapped,positive);assert.equal(b.life,before.bLife-(positive?3:0));assert.equal(game.untilEffects.some(e=>e.kind==='oracleNoCastV9'&&e.players.includes(b)),positive);break;
  case 'Phyrexian Purge':assert.equal(a.life,before.aLife-(positive?6:0));assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,positive?'graveyard':'battlefield');break;
  case 'Officious Interrogation':assert.equal(game.bf().filter(c=>c.ctrl===a&&c.hasSub('Clue')).length,positive?4:2);assert.equal(before.mana-sum(a),4);break;
  case 'Cerebral Vortex':assert.equal(b.hand.length,2);assert.equal(b.life,before.bLife-(positive?5:2));break;
  case 'Wing Storm':assert.equal(a.life,before.aLife-2);assert.equal(b.life,before.bLife-(positive?4:2));break;
  case 'Balance of Power':assert.equal(a.hand.length,positive?4:0);break;
  case 'Superior Numbers':assert.equal(enemy.damage,positive?2:0);break;
  case 'Triumphant Chomp':assert.equal(enemy.damage,positive?6:2);break;
  case 'Cut Propulsion':assert.equal(enemy.damage,positive?8:4);assert.equal(b.life,before.bLife+(positive?8:0));break;
  case 'Frantic Firebolt':assert.equal(enemy.damage,positive?5:2);break;
  case 'Serpentine Curve':{const token=game.bf().find(c=>c.isToken&&c.hasSub('Fractal'));assert.ok(token);assert.equal(token.power,positive?3:1);break;}
  case 'Candlekeep Inspiration':assert.equal(own.zone,positive?'battlefield':'graveyard');assert.equal(ally.zone,positive?'battlefield':'graveyard');if(positive){assert.equal(own.power,3);assert.equal(ally.toughness,3);}break;
  case 'Aether Burst':assert.equal(quota,positive?3:1);assert.equal(enemy.zone,'hand');assert.equal(other.zone,positive?'hand':'battlefield');assert.equal(own.zone,positive?'hand':'battlefield');break;
 }
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return f;
}
export const edgeCasesV28={
 'Monstrous Emergence':['live-power','last-known-power','chosen-copy','failed-reveal','paid-reveal'],
 'Close Encounter':['exiled-card-left'],
 'Swallow Whole':['paid-copy','paid-creature-blink'],
 'Aether Burst':['quota-copy'],
 'Mythos of Vadrok':['spent-mana-copy'],
 'Meteor Swarm':['zero-x','stale-division'],
 'Pollen Remedy':['kicker-copy'],
 'Remedy':['shield-stale','division-copy'],
 'Skull Raid':['foretell'],
 'Command the Dreadhorde':['stale-target'],
 'Paradoxical Outcome':['foreign-owner'],
 'Cleansing Meditation':['indestructible-owned'],
 'Phyrexian Purge':['insufficient-life'],
 "Kaervek's Spite":['insufficient-mana','mana-sacrifice'],
 'Surge of Strength':['green-discard'],
 'Voltage Surge':['paid-copy'],
 'Searing Blaze':['planeswalker-controller','relation-invalid'],
 'Concussive Bolt':['planeswalker-lki']
};
export async function proveEdgeV28(M,name,scenario,role,h,assert=strict){
 const f=makeContext(M,role,h),{game,a,b}=f;fund(a);fund(b);
 const source=put(M,game,a,name,'hand'),own=body(M,f,a),enemy=body(M,f,b),other=body(M,f,b);let targets=[enemy],extra,x=2;
 const reveals=[];game.revealToHuman=async event=>reveals.push({cards:event.cards.slice(),mana:sum(a)});
 if(name==='Monstrous Emergence'&&['failed-reveal','paid-reveal'].includes(scenario)){extra=body(M,f,a,{zone:'hand',power:'6'});if(scenario==='failed-reveal')for(const color in a.pool)a.pool[color]=0;}
 if(name==='Close Encounter'){extra=body(M,f,a,{zone:'exile',power:'6'});extra.meta={warped:true,warpedVersion:extra.zoneVersion};}
 if(name==='Swallow Whole')enemy.tapped=true;
 if(name==='Aether Burst'){put(M,game,a,name,'graveyard');put(M,game,b,name,'graveyard');targets=[own,enemy,other];}
 if(name==='Mythos of Vadrok'){targets=[enemy,other];for(const color in a.pool)a.pool[color]=0;Object.assign(a.pool,{R:2,W:1,U:1});}
 if(name==='Meteor Swarm'){targets=scenario==='zero-x'?[]:[enemy,other];x=scenario==='zero-x'?0:2;}
 if(name==='Pollen Remedy'){extra=put(M,game,a,'Forest');targets=[enemy];}
 if(name==='Remedy')targets=scenario==='division-copy'?[enemy,other]:[enemy];
 if(name==='Skull Raid')targets=[b];
 if(name==='Command the Dreadhorde'){extra=body(M,f,a,{zone:'graveyard'});const second=body(M,f,b,{zone:'graveyard'});targets=[extra,second];}
 if(name==='Paradoxical Outcome'){await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,a);targets=[own,enemy];}
 if(name==='Cleansing Meditation'){own.def={...own.def,types:['Enchantment'],kws:['indestructible']};enemy.def={...enemy.def,types:['Enchantment'],kws:[]};while(a.graveyard.length<7)body(M,f,a,{zone:'graveyard'});}
 if(name==='Phyrexian Purge'){targets=[enemy,other];a.life=5;}
 if(name==="Kaervek's Spite"){targets=[b];extra=body(M,f,a,{zone:'hand'});for(const color in a.pool)a.pool[color]=0;if(scenario==='mana-sacrifice')await game.makeTokens('treasure',a,{n:3});}
 if(name==='Surge of Strength')extra=body(M,f,a,{zone:'hand',colorsOverride:['G']});
 if(name==='Voltage Surge')own.def={...own.def,types:['Artifact'],subtypes:[]};
 if(['Searing Blaze','Concussive Bolt'].includes(name)){extra=body(M,f,b,{types:['Planeswalker'],power:undefined,toughness:undefined});extra.counters.loyalty=scenario==='planeswalker-lki'?1:8;targets=name==='Searing Blaze'?[extra,scenario==='relation-invalid'?own:enemy]:[extra];}
 if(name==='Concussive Bolt')for(let i=0;i<3;i++)body(M,f,a,{types:['Artifact'],power:undefined,toughness:undefined});
 game.recalc();let targetSlot=0;
 choose(a,(g,q)=>{
  if(q.type==='chooseTargets')return name==='Searing Blaze'?[targets[targetSlot++]]:targets;
  if(q.type==='chooseCards'){if(name==='Close Encounter'||name==='Surge of Strength')return [extra];if(name==='Monstrous Emergence')return [extra||own];if(name==='Swallow Whole'||name==='Voltage Surge')return [own];if(name==='Pollen Remedy'&&q.from.includes(extra))return [extra];}
  if(q.type==='chooseOption'&&['kicker','newTargets'].includes(q.aiHint?.kind))return 'yes';
  if(q.type==='chooseX')return q.allocation?q.min:x;
 });
 let opts={from:'hand'};
 if(name==='Skull Raid'){
  const action=game.activatableList(a).find(row=>row.card===source&&row.foretell);assert.ok(action,'foretell special action offered');const mana=sum(a);
  assert.equal(await game.activateAbility(a,action),true);assert.equal(mana-sum(a),2);assert.equal(source.zone,'exile');
  assert.equal(game.castableList(a).some(row=>row.card===source&&row.alt?.foretell),false,'cannot cast foretold card this turn');game.turnNo++;
  const offer=game.castableList(a).find(row=>row.card===source&&row.alt?.foretell);assert.ok(offer,'later foretell permission');opts={...offer,from:'exile',alt:offer.alt};
 }
 const life=a.life,mana=sum(a),hand=a.hand.length,library=a.library.length,ownVersion=own.zoneVersion;
 const cast=await game.castSpell(a,source,opts);
 if(['insufficient-life','insufficient-mana','relation-invalid','failed-reveal'].includes(scenario)){assert.equal(cast,false);assert.equal(source.zone,'hand');assert.equal(a.life,life);assert.equal(sum(a),mana);assert.equal(a.hand.length,hand);assert.equal(own.zoneVersion,ownVersion);assert.equal(enemy.zone,'battlefield');if(scenario==='failed-reveal'){assert.equal(reveals.length,0);assert.equal(extra.zone,'hand');}}
 else {
  assert.equal(cast,true,name+': edge paid cast');const so=game.stack.find(row=>row.card===source);assert.ok(so);let copy;
  if(scenario==='live-power')own.def={...own.def,power:'7'};
  if(scenario==='last-known-power'){own.def={...own.def,power:'7'};game.recalc();await game.move(own,'graveyard');own.def={...own.def,power:'1'};}
  if(scenario==='chosen-copy'){copy=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(copy.oracleChosenPowerV28.iid,own.iid);own.def={...own.def,power:'7'};}
  if(scenario==='paid-reveal'){assert.equal(reveals.length,1);assert.equal(reveals[0].cards[0],extra);assert.ok(reveals[0].mana<mana,'reveal is paid after mana succeeds');copy=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(reveals.length,1);}
  if(scenario==='exiled-card-left'){await game.move(extra,'graveyard');extra.def={...extra.def,power:'1'};}
  if(scenario==='paid-copy'){if(name==='Swallow Whole'){other.tapped=true;targets=[other];}copy=await game.copySpell(so,a,{mayNewTargets:name==='Swallow Whole'});if(name==='Swallow Whole'){assert.equal(copy.oracleTappedRowsV28.length,1);assert.equal(copy.oracleTappedRowsV28[0].iid,own.iid);assert.equal(copy.targets[0],other);}else assert.equal(copy.castOpts.oracleCostV28Optional,true);}
  if(scenario==='paid-creature-blink'){await game.move(own,'hand');await game.putPermanentOntoBattlefield(own,a);}
  if(scenario==='quota-copy'){for(const c of [...a.graveyard,...b.graveyard].filter(c=>c.name===name))await game.move(c,'exile');copy=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(copy.oracleTargetQuotaV28,3);assert.equal(copy.targets[0].length,3);}
  if(scenario==='spent-mana-copy'){copy=await game.copySpell(so,a,{mayNewTargets:false});await game.resolveTop();assert.equal(enemy.cur.cantAttack,false,'copy did not spend WU');assert.equal(other.cur.activationDisabled,false);assert.equal(enemy.damage,1);assert.equal(other.damage,4);}
  if(scenario==='stale-division'||scenario==='shield-stale'){await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,b);}
  if(scenario==='kicker-copy'){copy=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(copy.kicked,true);assert.equal(extra.zone,'graveyard');}
  if(scenario==='division-copy'){copy=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(copy.damageDivision.reduce((n,r)=>n+r.n,0),5);}
  if(name==='Command the Dreadhorde'){await game.move(extra,'exile');}
  game.recalc();await settle(game);
  switch(scenario){
   case 'live-power':case 'last-known-power':assert.equal(enemy.damage,7);break;
   case 'chosen-copy':assert.equal(enemy.damage,14);break;
   case 'paid-reveal':assert.equal(enemy.damage,12);assert.equal(extra.zone,'hand');assert.equal(reveals.length,1);break;
   case 'exiled-card-left':assert.equal(enemy.damage,6);break;
   case 'paid-copy':if(name==='Voltage Surge'){assert.equal(own.zone,'graveyard');assert.equal(enemy.damage,8);}else{assert.equal(enemy.zone,'exile');assert.equal(other.zone,'exile');assert.equal(own.counters['+1/+1'],2);}break;
   case 'paid-creature-blink':assert.equal(enemy.zone,'exile');assert.equal(own.counters['+1/+1']||0,0);break;
   case 'quota-copy':assert.equal(own.zone,'hand');assert.equal(enemy.zone,'hand');assert.equal(other.zone,'hand');break;
   case 'spent-mana-copy':assert.equal(enemy.damage,2);assert.equal(other.damage,8);assert.equal(enemy.cur.cantAttack,true);break;
   case 'zero-x':assert.equal(so.x,0);assert.equal(so.damageDivision.length,0);assert.equal(enemy.damage,0);break;
   case 'stale-division':assert.equal(enemy.damage,0);assert.equal(other.damage,7);break;
   case 'kicker-copy':await game.damageAny(other,enemy,13);assert.equal(enemy.damage,1);assert.equal(extra.zone,'graveyard');break;
   case 'shield-stale':await game.damageAny(other,enemy,7);assert.equal(enemy.damage,7);break;
   case 'division-copy':await game.damageBatch([{src:own,target:enemy,n:3},{src:own,target:other,n:10}]);assert.equal(enemy.damage,1);assert.equal(other.damage,2);break;
   case 'foretell':assert.equal(mana-sum(a),2);assert.equal(a.hand.length,hand+2);assert.equal(source.zone,'graveyard');break;
   case 'stale-target':assert.equal(a.life,life-3);assert.equal(extra.zone,'exile');assert.equal(targets[1].zone,'battlefield');break;
   case 'foreign-owner':assert.equal(a.library.length,library-1);assert.equal(own.zone,'hand');assert.equal(enemy.zone,'hand');assert.equal(enemy.owner,b);break;
   case 'indestructible-owned':assert.equal(own.zone,'battlefield');assert.equal(own.zoneVersion,ownVersion);assert.equal(enemy.zone,'graveyard');break;
   case 'green-discard':assert.equal(extra.zone,'graveyard');assert.equal(enemy.power,7);assert.equal(enemy.kw('trample'),true);break;
   case 'mana-sacrifice':assert.equal(game.bf().filter(c=>c.ctrl===a).length,0);assert.equal(own.zone,'graveyard');assert.equal(extra.zone,'graveyard');assert.equal(a.hand.length,0);assert.equal(b.life,35);break;
   case 'planeswalker-controller':assert.equal(extra.counters.loyalty,7);assert.equal(enemy.damage,1);break;
   case 'planeswalker-lki':assert.equal(extra.zone,'graveyard');assert.equal(enemy.cur.cantBlock,true);assert.equal(other.cur.cantBlock,true);break;
  }
 }
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return f;
}
export async function operationProofV28(M,entry,op,role,h){if(!wholeSourcesV28.has(entry.raw.name))return null;let checks=0;const assert={equal:(...a)=>{checks++;strict.equal(...a);},ok:(...a)=>{checks++;strict.ok(...a);}};for(const positive of [false,true])await proveSpellV28(M,entry.raw.name,role,positive,h,assert);for(const scenario of edgeCasesV28[entry.raw.name]||[])await proveEdgeV28(M,entry.raw.name,scenario,role,h,assert);return checks;}
