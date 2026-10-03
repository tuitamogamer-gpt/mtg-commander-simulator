import strict from 'node:assert/strict';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
const fund=p=>{for(const color in p.pool)p.pool[color]=40;},sum=p=>Object.values(p.pool).reduce((a,b)=>a+b,0),decide=(p,fn)=>{const prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(g,q)??prior(g,q);};
function body(M,f,p,extra={}){const c=put(M,f.game,p,'Grizzly Bears',extra.zone||'battlefield');c.def={...c.def,cost:'{2}{G}',power:'4',toughness:'30',kws:[],...extra};f.game.recalc();return c;}
function make(M,role,h){if(!h)return context(M,role);const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.fillLibrary(M,f.a,30);h.fillLibrary(M,f.b,30);return f;}
export const wholeSourcesV30=new Set(['No Witnesses','Aggravate','When We Were Young','Epicenter','Come Back Wrong','Fraying Omnipotence','Dazzling Reflection','Malamet Battle Glyph','Volcanic Eruption','Omen of Fire','Spiteful Repossession','Brightflame',"Ent's Fury",'Stronghold Gambit','Rhystic Scrying',"Builder's Bane", "Kamahl's Summons",'Send to Sleep','Breaking Point','Sink into Takenuma','Ego Drain','Savage Swipe','Charge Across the Araba','Alpha Brawl','Friendly Fire','Throw from the Saddle','Urborg Justice','Barrel Down Sokenzan','Covetous Elegy','Plow Through Reito','Friendly Rivalry','Brood Birthing','Tandem Takedown','Essence Vortex','Underworld Fires','Pulse of the Forge','Icy Blast','Rhystic Lightning','Dose of Dawnglow','Dead Ringers']);
const sweeps={'Sink into Takenuma':'Swamp','Plow Through Reito':'Plains','Charge Across the Araba':'Plains','Barrel Down Sokenzan':'Mountain'},fights=new Set(["Ent's Fury",'Savage Swipe','Malamet Battle Glyph','Throw from the Saddle']);
export async function proveSpellV30(M,name,role,positive,h,assert=strict){
 const f=make(M,role,h),{game,a,b}=f;fund(a);fund(b);const source=put(M,game,a,name,'hand'),own=body(M,f,a),enemy=body(M,f,b),other=body(M,f,b,{power:'3'});let extra,grave,lands=[],targets=[enemy],slot=0;
 if(name==='Dead Ringers'){targets=[enemy,other];enemy.def={...enemy.def,colorsOverride:['W']};other.def={...other.def,colorsOverride:[positive?'W':'U']};enemy.regenShield=1;}
 if(name==='Dazzling Reflection'&&positive)enemy.def={...enemy.def,power:'6'};
 if(name==='Urborg Justice'){targets=[b];for(let i=0;i<2;i++){const c=body(M,f,a,{zone:positive?'battlefield':'graveyard'});if(positive)await game.move(c,'graveyard');}}
 if(name==='Aggravate'){targets=[b];if(positive)game.untilEffects.push({kind:'oraclePreventNextAmount',target:enemy,zoneVersion:enemy.zoneVersion,remaining:1,expires:'eot'});}
 if(name==='Essence Vortex')enemy.regenShield=1;
 if(sweeps[name]){for(let i=0;i<2;i++){const c=put(M,game,a,sweeps[name]);lands.push(c);}if(name==='Sink into Takenuma'){targets=[b];for(let i=0;i<3;i++)body(M,f,b,{zone:'hand'});}}
 if(name==='Breaking Point')enemy.regenShield=1;
 if(name==='Underworld Fires'){enemy.def={...enemy.def,toughness:'1'};if(!positive)game.untilEffects.push({kind:'oraclePreventNextAmount',target:enemy,zoneVersion:enemy.zoneVersion,remaining:1,expires:'eot'});}
 if(name==='Omen of Fire'){lands=[put(M,game,a,'Island'),put(M,game,b,'Island'),put(M,game,b,'Plains')];enemy.def={...enemy.def,colorsOverride:['W']};if(positive)other.def={...other.def,colorsOverride:['W']};}
 if(name==='Volcanic Eruption'){targets=[put(M,game,a,'Mountain'),put(M,game,b,'Mountain')];if(!positive)targets[1].def={...targets[1].def,kws:['indestructible']};}
 if(name==="Builder's Bane"){own.def={...own.def,types:['Artifact','Creature']};enemy.def={...enemy.def,types:['Artifact','Creature'],kws:positive?[]:['indestructible']};targets=[own,enemy];}
 if(name==='Brightflame'){enemy.def={...enemy.def,colorsOverride:['W']};other.def={...other.def,colorsOverride:[positive?'W':'U']};}
 if(name==='Covetous Elegy'){}
 if(name==='Friendly Rivalry'){extra=body(M,f,a,{power:'3',super:['Legendary']});}
 if(name==='Tandem Takedown')extra=body(M,f,a,{power:'3'});
 if(name==='When We Were Young'){extra=body(M,f,a,{types:positive?['Artifact','Enchantment']:['Artifact'],power:undefined,toughness:undefined});targets=[enemy,other];}
 if(name==='Ego Drain'){targets=[b];extra=body(M,f,b,{zone:'hand'});grave=body(M,f,a,{zone:'hand'});if(positive)own.def={...own.def,subtypes:['Faerie']};}
 if(name==='Dose of Dawnglow'){grave=body(M,f,a,{zone:'graveyard'});targets=[grave];if(positive)game.phase='combat';}
 if(name==='Fraying Omnipotence'){a.life=41;b.life=39;for(let i=0;i<3;i++){body(M,f,a,{zone:'hand'});body(M,f,b,{zone:'hand'});}if(positive)body(M,f,a);}
 if(name==="Kamahl's Summons"){for(let i=0;i<2;i++){body(M,f,a,{zone:'hand'});body(M,f,b,{zone:'hand'});}}
 if(name==='Epicenter'){targets=[b];lands=[put(M,game,a,'Forest'),put(M,game,a,'Forest'),put(M,game,b,'Forest'),put(M,game,b,'Forest')];if(positive)for(let i=0;i<7;i++)put(M,game,a,'Forest','graveyard');}
 if(name==='Friendly Fire'&&positive)extra=body(M,f,b,{zone:'hand',cost:'{4}'});
 if(name==='Brood Birthing'&&positive)await game.makeTokens('covenEldraziSpawn',a,{n:1});
 if(fights.has(name)){
  if(name==="Ent's Fury"&&!positive)own.def={...own.def,power:'3'};
  if(name==='Savage Swipe')own.def={...own.def,power:positive?'2':'3'};
  if(name==='Throw from the Saddle'&&positive)own.def={...own.def,subtypes:['Mount']};
  if(name==='Malamet Battle Glyph'&&positive){await game.move(own,'hand');await game.putPermanentOntoBattlefield(own,a);}
 }
 if(name==='Come Back Wrong'&&!positive)enemy.def={...enemy.def,kws:['indestructible']};
 if(name==='Rhystic Lightning')targets=[b];
 if(name==='Spiteful Repossession'){put(M,game,a,'Forest');for(let i=0;i<(positive?3:1);i++)put(M,game,b,'Forest');}
 if(name==='No Witnesses'&&positive){body(M,f,a);body(M,f,a);}
 if(name==='Alpha Brawl'&&positive)extra=body(M,f,b,{power:'2'});
 if(name==='Stronghold Gambit'){extra=body(M,f,a,{zone:'hand',cost:'{2}'});grave=positive?put(M,game,b,'Forest','hand'):body(M,f,b,{zone:'hand',cost:'{1}'});}
 if(name==='Pulse of the Forge'){targets=[b];if(positive)b.life=50;}
 if(['Icy Blast','Send to Sleep'].includes(name)){targets=[enemy,other];if(name==='Icy Blast'&&!positive)own.def={...own.def,power:'3'};if(name==='Send to Sleep'&&positive){put(M,game,a,'Shock','graveyard');put(M,game,a,'Shock','graveyard');}}
 game.recalc();const before={aLife:a.life,bLife:b.life,mana:sum(a),bMana:sum(b),hand:a.hand.length,bHand:b.hand.length,ownVersion:own.zoneVersion};
 decide(a,(g,q)=>{
  if(q.type==='chooseTargets'){if(fights.has(name))return slot++===0?[own]:[enemy];if(name==='Friendly Rivalry')return slot++===0?[own]:slot===2?(positive?[extra]:[]):[enemy];if(name==='Tandem Takedown')return slot++===0?(positive?[own,extra]:[]):[enemy];return targets;}
  if(q.type==='chooseX')return 2;
  if(q.type==='chooseOption')return 'no';
  if(q.type==='chooseCards'){
   if(sweeps[name])return positive?lands:[];
   if(name==='Covetous Elegy')return positive?q.from.slice(0,q.max):[];
   if(name==='Ego Drain')return q.from.includes(extra)?[extra]:q.from.includes(grave)?[grave]:undefined;
   if(name==="Kamahl's Summons")return positive?q.from:[];
   if(name==='Stronghold Gambit')return [extra];
   if(name==='Dose of Dawnglow')return [own];
   return q.from.slice(0,q.min||0);
  }
 });
 decide(b,(g,q)=>{
  if(q.type==='chooseOption'){if(['Breaking Point','Essence Vortex','Rhystic Lightning','Rhystic Scrying'].includes(name))return positive?'yes':'no';return 'no';}
  if(q.type==='chooseCards'){if(name==='Covetous Elegy')return positive?q.from.slice(0,q.max):[];if(name==="Kamahl's Summons")return positive?q.from:[];if(name==='Stronghold Gambit')return [grave];if(name==='Omen of Fire')return positive?[enemy,other]:[lands[2]];return q.from.slice(0,q.min||0);}
 });
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true,name+' paid cast');assert.ok(sum(a)<before.mana,name+' real mana consumed');const so=game.stack.find(s=>s.card===source);assert.ok(so);await settle(game);
 switch(name){
  case 'Dead Ringers':assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,positive?'graveyard':'battlefield');break;
  case 'Dazzling Reflection':assert.equal(a.life,before.aLife+(positive?6:4));await game.damageBatch([{src:enemy,target:own,n:3},{src:enemy,target:b,n:3}]);assert.equal(own.damage,0);assert.equal(b.life,before.bLife);await game.damageAny(enemy,own,2);assert.equal(own.damage,2);break;
  case 'Urborg Justice':assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,positive?'graveyard':'battlefield');break;
  case 'Aggravate':assert.equal(enemy.damage,positive?0:1);assert.equal(other.damage,1);assert.equal(enemy.cur.mustAttack,!positive);assert.equal(other.cur.mustAttack,true);break;
  case 'Essence Vortex':assert.equal(enemy.zone,positive?'battlefield':'graveyard');assert.equal(b.life,before.bLife-(positive?30:0));break;
  case 'Sink into Takenuma':assert.equal(b.hand.length,positive?1:3);assert.equal(a.hand.length,positive?2:0);break;
  case 'Plow Through Reito':assert.equal(enemy.power,positive?6:4);assert.equal(a.hand.length,positive?2:0);break;
  case 'Charge Across the Araba':assert.equal(own.power,positive?6:4);assert.equal(enemy.power,4);assert.equal(a.hand.length,positive?2:0);break;
  case 'Barrel Down Sokenzan':assert.equal(enemy.damage,positive?4:0);assert.equal(a.hand.length,positive?2:0);break;
  case 'Breaking Point':assert.equal(enemy.zone,positive?'battlefield':'graveyard');assert.equal(own.zone,positive?'battlefield':'graveyard');assert.equal(b.life,before.bLife-(positive?6:0));break;
  case 'Underworld Fires':assert.equal(enemy.zone,positive?'exile':'battlefield');assert.equal(other.damage,1);assert.equal(own.damage,1);break;
  case 'Omen of Fire':assert.equal(lands[0].zone,'hand');assert.equal(lands[1].zone,'hand');assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,positive?'graveyard':'battlefield');assert.equal(lands[2].zone,positive?'battlefield':'graveyard');break;
  case 'Volcanic Eruption':assert.equal(targets[0].zone,'graveyard');assert.equal(targets[1].zone,positive?'graveyard':'battlefield');assert.equal(enemy.damage,positive?2:1);assert.equal(a.life,before.aLife-(positive?2:1));assert.equal(b.life,before.bLife-(positive?2:1));assert.equal(so.x,2);break;
  case "Builder's Bane":assert.equal(own.zone,'graveyard');assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(a.life,before.aLife-1);assert.equal(b.life,before.bLife-(positive?1:0));assert.equal(so.x,2);break;
  case 'Brightflame':assert.equal(enemy.damage,2);assert.equal(other.damage,positive?2:0);assert.equal(own.damage,0);assert.equal(a.life,before.aLife+(positive?4:2));break;
  case 'Covetous Elegy':assert.equal(own.zone,positive?'battlefield':'graveyard');assert.equal(enemy.zone,positive?'battlefield':'graveyard');assert.equal(game.bf().filter(c=>c.ctrl===a&&c.hasSub('Treasure')).length,positive?2:0);assert.equal(game.bf().filter(c=>c.hasSub('Treasure')).every(c=>c.tapped),true);break;
  case 'Friendly Rivalry':assert.equal(enemy.damage,positive?7:4);assert.equal(own.damage,0);break;
  case 'Tandem Takedown':assert.equal(enemy.damage,positive?9:0);assert.equal(own.power,positive?5:4);assert.equal(extra.power,positive?4:3);break;
  case 'When We Were Young':assert.equal(enemy.power,6);assert.equal(other.power,5);assert.equal(enemy.kw('lifelink'),positive);break;
  case 'Ego Drain':assert.equal(extra.zone,'graveyard');assert.equal(grave.zone,positive?'hand':'exile');assert.equal(b.hand.length,0);break;
  case 'Dose of Dawnglow':assert.equal(grave.zone,'battlefield');assert.equal(own.counters['-1/-1']||0,positive?2:0);break;
  case 'Fraying Omnipotence':assert.equal(a.life,20);assert.equal(b.life,19);assert.equal(a.hand.length,1);assert.equal(b.hand.length,1);assert.equal(game.creatures(a).length,positive?1:0);assert.equal(game.creatures(b).length,1);break;
  case "Kamahl's Summons":assert.equal(a.hand.length,2);assert.equal(b.hand.length,2);assert.equal(game.bf().filter(c=>c.ctrl===a&&c.isToken).length,positive?2:0);assert.equal(game.bf().filter(c=>c.ctrl===b&&c.isToken).length,positive?2:0);break;
  case 'Epicenter':assert.equal(lands.filter(c=>c.zone==='graveyard').length,positive?4:1);break;
  case 'Friendly Fire':assert.equal(enemy.damage,positive?4:0);assert.equal(b.life,before.bLife-(positive?4:0));assert.equal(b.hand.length,positive?1:0);break;
  case 'Brood Birthing':assert.equal(game.bf().filter(c=>c.ctrl===a&&c.isToken&&c.hasSub('Spawn')).length,positive?4:1);break;
  case "Ent's Fury":assert.equal(own.power,positive?6:4);assert.equal(own.counters['+1/+1']||0,positive?1:0);assert.equal(enemy.damage,positive?6:4);assert.equal(own.damage,4);break;
  case 'Savage Swipe':assert.equal(own.power,positive?4:3);assert.equal(enemy.damage,positive?4:3);assert.equal(own.damage,4);break;
  case 'Malamet Battle Glyph':assert.equal(own.counters['+1/+1']||0,positive?1:0);assert.equal(enemy.damage,positive?5:4);assert.equal(own.damage,4);break;
  case 'Throw from the Saddle':assert.equal(own.counters['+1/+1']||0,positive?1:0);assert.equal(enemy.damage,5);assert.equal(own.damage,0);break;
  case 'Come Back Wrong':assert.equal(enemy.zone,'battlefield');assert.equal(enemy.ctrl,positive?a:b);assert.equal(game.delayed.length,positive?1:0);if(positive){await game.emit('endStep',{player:b});await settle(game);assert.equal(enemy.zone,'battlefield');await game.emit('endStep',{player:a});await settle(game);assert.equal(enemy.zone,'graveyard');assert.equal(enemy.owner,b);}break;
  case 'Rhystic Lightning':assert.equal(b.life,before.bLife-(positive?2:4));assert.equal(before.bMana-sum(b),positive?2:0);break;
  case 'Spiteful Repossession':assert.equal(b.life,before.bLife-(positive?2:0));assert.equal(game.bf().filter(c=>c.ctrl===a&&c.hasSub('Treasure')).length,positive?2:0);break;
  case 'No Witnesses':assert.equal(game.creatures(a).length,0);assert.equal(game.creatures(b).length,0);assert.equal(game.bf().filter(c=>c.ctrl===a&&c.hasSub('Clue')).length,positive?1:0);assert.equal(game.bf().filter(c=>c.ctrl===b&&c.hasSub('Clue')).length,positive?0:1);break;
  case 'Alpha Brawl':assert.equal(enemy.damage,positive?5:3);assert.equal(other.damage,4);assert.equal(own.damage,0);if(extra)assert.equal(extra.damage,4);break;
  case 'Stronghold Gambit':assert.equal(extra.zone,positive?'battlefield':'hand');assert.equal(grave.zone,positive?'hand':'battlefield');assert.equal(extra.ctrl,a);break;
  case 'Pulse of the Forge':assert.equal(b.life,before.bLife-4);assert.equal(source.zone,positive?'hand':'graveyard');break;
  case 'Rhystic Scrying':assert.equal(a.hand.length,positive?0:3);assert.equal(before.bMana-sum(b),positive?2:0);break;
  case 'Icy Blast':case 'Send to Sleep':assert.equal(enemy.tapped,true);assert.equal(other.tapped,true);assert.equal(!!enemy.meta.noUntapOnce,positive);break;
 }
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return f;
}
export const edgeCasesV30={
 'Dead Ringers':['colorless','partial-stale'],
 'Dazzling Reflection':['stale-source'],
 'Urborg Justice':['token-death'],
 'Plow Through Reito':['foreign-owner'],
 'Volcanic Eruption':['zero-x'],
 "Builder's Bane":['foreign-controller'],
 'Brightflame':['colorless','prevented-damage'],
 'No Witnesses':['empty-board'],
 'Stronghold Gambit':['tied-creatures'],
 'Come Back Wrong':['blinked-return','changed-controller'],
 'Rhystic Lightning':['insufficient-payment'],
 'Underworld Fires':['planeswalker-death','prevented-walker','turn-expiration'],
 'Pulse of the Forge':['copy-source'],
 'Brood Birthing':['spawn-mana'],
 'When We Were Young':['partial-stale'],
 'Tandem Takedown':['partial-source'],
 'Aggravate':['all-prevented']
};
export async function proveEdgeV30(M,name,scenario,role,h,assert=strict){
 const f=make(M,role,h),{game,a,b}=f;fund(a);fund(b);const source=put(M,game,a,name,'hand'),own=body(M,f,a),enemy=body(M,f,b),other=body(M,f,b,{power:'3'});let extra,grave,token,targets=[enemy],slot=0,x=2;
 if(name==='Dead Ringers'){targets=[enemy,other];enemy.def={...enemy.def,colorsOverride:scenario==='colorless'?[]:['W']};other.def={...other.def,colorsOverride:scenario==='colorless'?[]:['W']};}
 if(name==='Urborg Justice'){targets=[b];await game.makeTokens('covenEldraziSpawn',a,{n:1});token=game.creatures(a).find(c=>c.isToken);await game.sacrifice(a,token);extra=body(M,f,a);await game.move(extra,'exile');}
 if(name==='Plow Through Reito'){extra=put(M,game,b,'Plains','hand');await game.putPermanentOntoBattlefield(extra,a);}
 if(name==='Volcanic Eruption'){targets=[];x=0;}
 if(name==="Builder's Bane"){enemy.def={...enemy.def,types:['Artifact','Creature']};await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,a);x=1;}
 if(name==='Brightflame'){enemy.def={...enemy.def,colorsOverride:scenario==='colorless'?[]:['W']};other.def={...other.def,colorsOverride:['W']};if(scenario==='prevented-damage')game.untilEffects.push({kind:'oraclePreventNextAmount',target:enemy,zoneVersion:enemy.zoneVersion,remaining:2,expires:'eot'});}
 if(name==='No Witnesses'){for(const c of game.bf().slice())await game.move(c,'graveyard');}
 if(name==='Stronghold Gambit'){extra=body(M,f,a,{zone:'hand',cost:'{2}'});grave=body(M,f,b,{zone:'hand',cost:'{2}'});}
 if(name==='Rhystic Lightning'){targets=[b];for(const color in b.pool)b.pool[color]=0;}
 if(name==='Underworld Fires'){extra=body(M,f,b,{types:['Planeswalker'],power:undefined,toughness:undefined});extra.counters.loyalty=scenario==='turn-expiration'?3:1;if(scenario==='prevented-walker')game.untilEffects.push({kind:'oraclePreventNextAmount',target:extra,zoneVersion:extra.zoneVersion,remaining:1,expires:'eot'});}
 if(name==='Pulse of the Forge'){targets=[b];b.life=54;}
 if(name==='When We Were Young'){own.def={...own.def,types:['Artifact','Enchantment','Creature']};targets=[enemy,other];}
 if(name==='Tandem Takedown')extra=body(M,f,a,{power:'3'});
 if(name==='Aggravate'){targets=[b];for(const target of [enemy,other])game.untilEffects.push({kind:'oraclePreventNextAmount',target,zoneVersion:target.zoneVersion,remaining:1,expires:'eot'});}
 game.recalc();decide(a,(g,q)=>{if(q.type==='chooseTargets')return name==='Tandem Takedown'?slot++===0?[own,extra]:[enemy]:targets;if(q.type==='chooseX')return x;if(q.type==='chooseOption')return q.aiHint?.kind==='newTargets'?'yes':'no';if(q.type==='chooseCards'){if(name==='Plow Through Reito')return [extra];if(name==='Stronghold Gambit')return [extra];return q.from.slice(0,q.min||0);}});
 decide(b,(g,q)=>q.type==='chooseOption'&&name==='Rhystic Lightning'?'yes':q.type==='chooseCards'&&name==='Stronghold Gambit'?[grave]:q.type==='chooseCards'?q.from.slice(0,q.min||0):q.type==='chooseOption'?'no':undefined);
 const mana=sum(a),life=a.life,bLife=b.life,enemyVersion=enemy.zoneVersion;
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true,name+' paid edge');assert.ok(sum(a)<mana);const so=game.stack.find(s=>s.card===source);assert.ok(so);
 if(name==='Dead Ringers'&&scenario==='partial-stale'||name==='When We Were Young'){await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,b);}
 if(name==='Tandem Takedown'){await game.move(own,'hand');await game.putPermanentOntoBattlefield(own,a);}
 if(name==='Pulse of the Forge'){await game.copySpell(so,a,{mayNewTargets:false});await game.resolveTop();assert.equal(source.zone,'stack','copy does not return original physical spell');}
 await settle(game);
 switch(name){
  case 'Dead Ringers':assert.equal(enemy.zone,scenario==='colorless'?'graveyard':'battlefield');assert.equal(other.zone,scenario==='colorless'?'graveyard':'battlefield');break;
  case 'Dazzling Reflection':assert.equal(a.life,life+4);await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,b);await game.damageAny(enemy,own,3);assert.equal(own.damage,3);break;
  case 'Urborg Justice':assert.equal(enemy.zone,'graveyard');assert.equal(other.zone,'battlefield');assert.equal(a.graveyard.includes(token),false);assert.equal(extra.zone,'exile');break;
  case 'Plow Through Reito':assert.equal(extra.zone,'hand');assert.equal(extra.owner,b);assert.equal(a.hand.length,0);assert.equal(b.hand.includes(extra),true);assert.equal(enemy.power,5);break;
  case 'Volcanic Eruption':assert.equal(so.x,0);assert.equal(enemy.damage,0);assert.equal(a.life,life);assert.equal(b.life,bLife);break;
  case "Builder's Bane":assert.equal(enemy.zone,'graveyard');assert.equal(enemy.owner,b);assert.equal(a.life,life-1);assert.equal(b.life,bLife);break;
  case 'Brightflame':assert.equal(enemy.damage,scenario==='colorless'?2:0);assert.equal(other.damage,scenario==='colorless'?0:2);assert.equal(a.life,life+2,'actual damage determines life gain');break;
  case 'No Witnesses':assert.equal(game.bf().filter(c=>c.ctrl===a&&c.hasSub('Clue')).length,1);assert.equal(game.bf().filter(c=>c.ctrl===b&&c.hasSub('Clue')).length,1);break;
  case 'Stronghold Gambit':assert.equal(extra.zone,'battlefield');assert.equal(grave.zone,'battlefield');assert.equal(extra.ctrl,a);assert.equal(grave.ctrl,b);break;
  case 'Come Back Wrong':assert.equal(enemy.ctrl,a);assert.equal(enemy.zoneVersion,enemyVersion+2);if(scenario==='blinked-return'){await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,a);}else{M.OracleV8Control.gain(game,enemy,b);game.recalc();}await game.emit('endStep',{player:a});await settle(game);assert.equal(enemy.zone,'battlefield');assert.equal(enemy.ctrl,scenario==='blinked-return'?a:b);assert.equal(game.delayed.length,0);break;
  case 'Rhystic Lightning':assert.equal(b.life,bLife-4);assert.equal(sum(b),0);break;
  case 'Underworld Fires':assert.equal(enemy.damage,1);if(scenario==='planeswalker-death')assert.equal(extra.zone,'exile');else if(scenario==='prevented-walker'){assert.equal(extra.zone,'battlefield');assert.equal(extra.counters.loyalty,1);assert.equal(game.untilEffects.filter(e=>e.kind==='oracleDeathExile').some(e=>e.locked.some(r=>r.iid===extra.iid)),false);await game.destroy(extra);assert.equal(extra.zone,'graveyard');}else{assert.equal(extra.zone,'battlefield');assert.equal(extra.counters.loyalty,2);assert.equal(game.untilEffects.some(e=>e.kind==='oracleDeathExile'&&e.locked.some(r=>r.iid===extra.iid)),true);game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(game.untilEffects.some(e=>e.kind==='oracleDeathExile'),false);await game.destroy(extra);assert.equal(extra.zone,'graveyard');}break;
  case 'Pulse of the Forge':assert.equal(b.life,bLife-8);assert.equal(source.zone,'hand');assert.equal(a.hand.length,1);break;
  case 'Brood Birthing':{const spawn=game.creatures(a).find(c=>c.isToken&&c.hasSub('Spawn')),entry=game.activatableList(a).find(row=>row.card===spawn&&row.manaAbility);assert.ok(entry,'Spawn sacrifice mana ability offered');const c=a.pool.C;assert.equal(await game.activateAbility(a,entry),true);assert.equal(a.pool.C,c+1);assert.equal(game.bf().includes(spawn),false);break;}
  case 'When We Were Young':assert.equal(enemy.power,4);assert.equal(other.power,5);assert.equal(other.kw('lifelink'),true);break;
  case 'Tandem Takedown':assert.equal(own.power,4);assert.equal(extra.power,4);assert.equal(enemy.damage,4);break;
  case 'Aggravate':assert.equal(enemy.damage,0);assert.equal(other.damage,0);assert.equal(enemy.cur.mustAttack,false);assert.equal(other.cur.mustAttack,false);break;
 }
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return f;
}
export async function operationProofV30(M,entry,op,role,h){if(!wholeSourcesV30.has(entry.raw.name))return null;let checks=0;const assert={equal:(...a)=>{checks++;strict.equal(...a);},ok:(...a)=>{checks++;strict.ok(...a);}};for(const positive of [false,true])await proveSpellV30(M,entry.raw.name,role,positive,h,assert);for(const scenario of edgeCasesV30[entry.raw.name]||[])await proveEdgeV30(M,entry.raw.name,scenario,role,h,assert);return checks;}
