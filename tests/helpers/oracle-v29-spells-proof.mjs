import strict from 'node:assert/strict';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
const fund=p=>{for(const color in p.pool)p.pool[color]=30;},sum=p=>Object.values(p.pool).reduce((a,b)=>a+b,0),choose=(p,fn)=>{const prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(g,q)??prior(g,q);};
const counters=new Set(['Jaded Response','Unified Will','Dispersal Shield','Unravel',"Bane's Contingency",'Bring the Ending']);
const equipment=new Set(['Resolute Strike','Vow to Erebor','Battlefield Improvisation']);
function body(M,f,p,extra={}){const c=put(M,f.game,p,'Grizzly Bears',extra.zone||'battlefield');c.def={...c.def,cost:'{2}{G}',power:'4',toughness:'30',kws:[],...extra};f.game.recalc();return c;}
function make(M,role,h){if(!h)return context(M,role);const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'});h.fillLibrary(M,f.a,30);h.fillLibrary(M,f.b,30);return f;}
export const wholeSourcesV29=new Set(['Jaded Response','Unified Will','Dispersal Shield','Unravel',"Bane's Contingency",'Bring the Ending','Dismantle','Hour of Glory','Spoils of Evil','Disorder','Reward the Faithful','Match the Odds','Resolute Strike','Vow to Erebor','Battlefield Improvisation','Unforge','Engulf the Shore','Temporary Truce','Truce','Rupture',"Inquisitor's Snare",'Audience with Trostani','Seeds of Innocence','Lightning Dart','Twinstrike','Reign of Terror','Thoughtweft Charge','Insatiable Appetite',"Pippin's Bravery",'Coordinated Clobbering','Roiling Terrain','Ill-Gotten Gains','Necrotic Fumes','Browbeat',"Lich-Knights' Conquest",'Fade from History','Teachings of the Archaics','Simulacrum','Anoint with Affliction',"Crater's Claws"]);
export async function proveSpellV29(M,name,role,positive,h,assert=strict){
 const f=make(M,role,h),{game,a,b}=f;fund(a);fund(b);const source=put(M,game,a,name,'hand'),own=body(M,f,a),enemy=body(M,f,b),other=body(M,f,b);let extra,grave,target=enemy,targets,shock,shadow,scried=0;
 if(counters.has(name)){
  if(name==='Jaded Response'&&positive)own.def={...own.def,colorsOverride:['R']};
  if(name==='Unified Will'&&positive){body(M,f,a);body(M,f,a);}
  if(name==='Dispersal Shield'&&!positive)own.def={...own.def,cost:'{0}'};
  if(name==="Bane's Contingency")own.commander=positive;
  if(name==='Bring the Ending')b.poison=positive?3:0;
  game.recalc();shock=put(M,game,b,'Shock','hand');choose(b,(g,q)=>q.type==='chooseTargets'?[own]:q.type==='chooseOption'&&q.aiHint?.kind==='pay'?'yes':undefined);game.turnPlayer=b;
  assert.equal(await game.castSpell(b,shock,{from:'hand',...(name==='Unravel'&&positive?{free:true}:{})}),true);shadow=game.stack.find(s=>s.card===shock);assert.ok(shadow);game.turnPlayer=a;target=shadow;
 }
 if(name==='Dismantle'){own.def={...own.def,types:['Artifact','Creature'],subtypes:[]};enemy.def={...enemy.def,types:['Artifact','Creature'],subtypes:[]};if(positive)Object.assign(enemy.counters,{charge:2,loyalty:1});}
 if(name==='Hour of Glory'){enemy.def={...enemy.def,subtypes:positive?['God']:['Bear']};extra=body(M,f,b,{zone:'hand'});body(M,f,b,{zone:'hand'});put(M,game,b,'Forest','hand');}
 if(name==='Spoils of Evil'){target=b;if(positive){body(M,f,b,{zone:'graveyard',types:['Artifact','Creature']});body(M,f,b,{zone:'graveyard',types:['Artifact'],power:undefined,toughness:undefined});}}
 if(name==='Disorder'){if(positive)own.def={...own.def,colorsOverride:['W']};enemy.def={...enemy.def,colorsOverride:['W']};}
 if(name==='Reward the Faithful')targets=positive?[a,b]:[];
 if(name==='Match the Odds'&&!positive){await game.move(enemy,'graveyard');await game.move(other,'graveyard');}
 if(equipment.has(name)){extra=body(M,f,a,{types:['Artifact'],subtypes:['Equipment'],power:undefined,toughness:undefined});if(name==='Vow to Erebor')target=own;target.def={...target.def,subtypes:positive?[name==='Vow to Erebor'?'Dwarf':'Warrior']:['Bear']};if(name==='Battlefield Improvisation')target.attacking=positive?a:null;target.tapped=name==='Vow to Erebor';}
 if(name==='Unforge'){enemy.def={...enemy.def,types:['Artifact'],subtypes:['Equipment'],power:undefined,toughness:undefined};if(positive)await game.attach(enemy,other);}
 if(name==='Engulf the Shore'){enemy.def={...enemy.def,toughness:'2'};for(let i=0;i<(positive?2:1);i++)put(M,game,a,'Island');}
 if(name==='Rupture'&&!positive)await game.move(own,'graveyard');
 if(name==="Inquisitor's Snare"){enemy.attacking=a;enemy.def={...enemy.def,colorsOverride:[positive?'B':'G']};}
 if(name==='Audience with Trostani'&&positive){await game.makeTokens({name:'Wolf',cost:null,super:[],types:['Creature'],subtypes:['Wolf'],power:'2',toughness:'2',colorsOverride:['G'],kws:[],oracle:'',isTokenDef:true},a,{n:2});}
 if(name==='Seeds of Innocence'){own.def={...own.def,types:['Artifact'],subtypes:[],power:undefined,toughness:undefined,kws:positive?[]:['indestructible']};enemy.def={...enemy.def,types:['Artifact'],subtypes:[],cost:'{2}',power:undefined,toughness:undefined};enemy.regenShield=1;}
 if(name==='Lightning Dart')enemy.def={...enemy.def,colorsOverride:[positive?'U':'G']};
 if(name==='Twinstrike'){targets=[enemy,other];if(!positive)body(M,f,a,{zone:'hand'});}
 if(name==='Reign of Terror'){enemy.def={...enemy.def,colorsOverride:['W']};other.def={...other.def,colorsOverride:['W']};enemy.regenShield=1;}
 if(name==='Thoughtweft Charge'&&positive){extra=body(M,f,a,{zone:'hand'});await game.putPermanentOntoBattlefield(extra,a);}
 if(['Insatiable Appetite',"Pippin's Bravery"].includes(name))extra=body(M,f,a,{types:['Artifact'],subtypes:['Food'],power:undefined,toughness:undefined});
 if(name==='Coordinated Clobbering'){extra=body(M,f,a,{power:'3'});targets=positive?[own,extra]:[own];}
 if(name==='Roiling Terrain'){enemy.def={...enemy.def,types:['Land'],subtypes:['Swamp'],power:undefined,toughness:undefined};if(positive)for(let i=0;i<3;i++)put(M,game,b,'Forest','graveyard');}
 if(name==='Ill-Gotten Gains'){grave=body(M,f,a,{zone:'graveyard'});extra=body(M,f,a,{zone:'hand'});body(M,f,b,{zone:'graveyard'});body(M,f,b,{zone:'hand'});}
 if(name==='Necrotic Fumes'&&!positive)await game.move(own,'graveyard');
 if(name==='Browbeat')target=b;
 if(name==="Lich-Knights' Conquest"){own.def={...own.def,types:['Artifact','Creature']};grave=body(M,f,a,{zone:'graveyard'});}
 if(name==='Fade from History'){enemy.def={...enemy.def,types:['Enchantment'],power:undefined,toughness:undefined};if(positive)own.def={...own.def,types:['Artifact'],power:undefined,toughness:undefined};}
 if(name==='Teachings of the Archaics'){for(let i=0;i<(positive?5:2);i++)body(M,f,b,{zone:'hand'});if(!positive)for(let i=0;i<3;i++)body(M,f,a,{zone:'hand'});}
 if(name==='Simulacrum'){target=own;if(positive)await game.damageAny(enemy,a,5);else await game.loseLife(a,5,'fixture');await settle(game);}
 if(name==='Anoint with Affliction'){enemy.def={...enemy.def,cost:'{4}{G}'};b.poison=positive?3:0;}
 if(name==="Crater's Claws"&&!positive)own.def={...own.def,power:'3'};
 game.recalc();const before={aLife:a.life,bLife:b.life,mana:sum(a),bMana:sum(b),hand:a.hand.length,bHand:b.hand.length,library:a.library.length,bLibrary:b.library.length,enemyDamage:enemy.damage};let targetSlot=0;
 choose(a,(g,q)=>{
  if(q.type==='chooseTargets'){if(name==='Coordinated Clobbering')return targetSlot++===0?targets:[enemy];return targets||[target];}
  if(q.type==='chooseX'){if(['Truce','Temporary Truce'].includes(name))return positive?2:0;return 2;}
  if(q.type==='scry'){scried+=q.cards.length;return {top:q.cards,bottom:[]};}
  if(q.type==='chooseOption'){if(name==='Reign of Terror')return positive?'W':'G';if(name==='Dismantle'&&q.options.some(o=>o.key==='+1/+1'))return '+1/+1';if(name==='Browbeat')return 'no';}
  if(q.type==='chooseCards'){if(equipment.has(name))return q.from.includes(extra)&&positive?[extra]:[];if(name==='Dismantle')return [own];if(name==='Rupture'||name==='Necrotic Fumes')return [own];if(['Insatiable Appetite',"Pippin's Bravery"].includes(name))return positive?[extra]:[];if(name==='Ill-Gotten Gains')return positive?q.from.slice(0,q.max):[];if(name==="Lich-Knights' Conquest")return positive?(q.from.includes(own)&&own.zone==='battlefield'?[own]:q.from.includes(grave)?[grave]:[]):[];}
 });
 choose(b,(g,q)=>q.type==='chooseX'&&['Truce','Temporary Truce'].includes(name)?(positive?1:0):q.type==='chooseCards'&&name==='Ill-Gotten Gains'?(positive?q.from.slice(0,q.max):[]):q.type==='chooseOption'&&name==='Browbeat'?(positive?'yes':'no'):q.type==='chooseOption'&&name==='Bring the Ending'?'yes':undefined);
 const expectedCast=name!=='Necrotic Fumes'||positive;assert.equal(await game.castSpell(a,source,{from:'hand'}),expectedCast,name+' paid cast');
 if(!expectedCast){assert.equal(source.zone,'hand');assert.equal(sum(a),before.mana);assert.equal(enemy.zone,'battlefield');assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return f;}
 assert.ok(sum(a)<before.mana,name+' mana consumed');const paidC=a.pool.C,so=game.stack.find(s=>s.card===source);assert.ok(so);await settle(game);
 switch(name){
  case 'Jaded Response':case 'Unified Will':case 'Dispersal Shield':case 'Bring the Ending':assert.equal(shock.zone,'graveyard');assert.equal(own.damage,positive?0:2);if(name==='Bring the Ending')assert.equal(before.bMana-sum(b),positive?0:2);break;
  case 'Unravel':assert.equal(shock.zone,'graveyard');assert.equal(own.damage,0);assert.equal(a.hand.length,before.hand-1+(positive?1:0));break;
  case "Bane's Contingency":assert.equal(shock.zone,'graveyard');assert.equal(own.damage,0);assert.equal(scried,positive?2:0);assert.equal(a.hand.length,before.hand-1+(positive?1:0));break;
  case 'Dismantle':assert.equal(enemy.zone,'graveyard');assert.equal(own.counters['+1/+1']||0,positive?3:0);break;
  case 'Hour of Glory':assert.equal(enemy.zone,'exile');assert.equal(extra.zone,positive?'exile':'hand');assert.equal(b.hand.length,positive?1:3);break;
  case 'Spoils of Evil':assert.equal(a.life,before.aLife+(positive?2:0));assert.equal(a.pool.C,paidC+(positive?2:0));break;
  case 'Disorder':assert.equal(own.damage,positive?2:0);assert.equal(enemy.damage,2);assert.equal(other.damage,0);assert.equal(a.life,before.aLife-(positive?2:0));assert.equal(b.life,before.bLife-2);break;
  case 'Reward the Faithful':assert.equal(a.life,before.aLife+(positive?3:0));assert.equal(b.life,before.bLife+(positive?3:0));break;
  case 'Match the Odds':{const token=game.bf().find(c=>c.isToken&&c.hasSub('Ally'));assert.ok(token);assert.equal(token.power,positive?3:1);assert.equal(token.counters['+1/+1']||0,positive?2:0);break;}
  case 'Resolute Strike':case 'Vow to Erebor':case 'Battlefield Improvisation':assert.equal(target.power,6);assert.equal(extra.attachedTo,positive?target.iid:null);if(name==='Vow to Erebor')assert.equal(target.tapped,false);break;
  case 'Unforge':assert.equal(enemy.zone,'graveyard');assert.equal(other.damage,positive?2:0);break;
  case 'Engulf the Shore':assert.equal(enemy.zone,positive?'hand':'battlefield');assert.equal(other.zone,'battlefield');assert.equal(own.zone,'battlefield');break;
  case 'Temporary Truce':case 'Truce':assert.equal(a.hand.length,before.hand-1+(positive?2:0));assert.equal(b.hand.length,positive?1:0);assert.equal(a.life,before.aLife+(positive?0:4));assert.equal(b.life,before.bLife+(positive?2:4));break;
  case 'Rupture':assert.equal(own.zone,'graveyard');assert.equal(enemy.damage,positive?4:0);assert.equal(other.damage,positive?4:0);assert.equal(a.life,before.aLife-(positive?4:0));assert.equal(b.life,before.bLife-(positive?4:0));break;
  case "Inquisitor's Snare":assert.equal(enemy.zone,positive?'graveyard':'battlefield');if(!positive){await game.damageAny(enemy,own,3);assert.equal(own.damage,0);}break;
  case 'Audience with Trostani':assert.equal(a.hand.length,before.hand-1+(positive?2:1));assert.equal(game.bf().filter(c=>c.ctrl===a&&c.isToken&&c.hasSub('Plant')).length,1);break;
  case 'Seeds of Innocence':assert.equal(own.zone,positive?'graveyard':'battlefield');assert.equal(enemy.zone,'graveyard');assert.equal(a.life,before.aLife+3);assert.equal(b.life,before.bLife+2);break;
  case 'Lightning Dart':assert.equal(enemy.damage,positive?4:1);break;
  case 'Twinstrike':assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,positive?'graveyard':'battlefield');if(!positive){assert.equal(enemy.damage,2);assert.equal(other.damage,2);}break;
  case 'Reign of Terror':assert.equal(own.zone,positive?'battlefield':'graveyard');assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(other.zone,positive?'graveyard':'battlefield');assert.equal(a.life,before.aLife-(positive?4:2));break;
  case 'Thoughtweft Charge':assert.equal(enemy.power,7);assert.equal(a.hand.length,before.hand-1+(positive?1:0));break;
  case 'Insatiable Appetite':case "Pippin's Bravery":assert.equal(extra.zone,positive?'graveyard':'battlefield');assert.equal(enemy.power,4+(name==='Insatiable Appetite'?(positive?5:3):(positive?4:2)));break;
  case 'Coordinated Clobbering':assert.equal(own.tapped,true);assert.equal(extra.tapped,positive);assert.equal(enemy.damage,positive?7:4);break;
  case 'Roiling Terrain':assert.equal(enemy.zone,'graveyard');assert.equal(b.life,before.bLife-(positive?4:1));break;
  case 'Ill-Gotten Gains':assert.equal(source.zone,'exile');assert.equal(a.hand.length,positive?2:0);assert.equal(b.hand.length,positive?2:0);assert.equal(grave.zone,positive?'hand':'graveyard');break;
  case 'Necrotic Fumes':assert.equal(own.zone,'exile');assert.equal(enemy.zone,'exile');break;
  case 'Browbeat':assert.equal(b.life,before.bLife-(positive?5:0));assert.equal(b.hand.length,positive?0:3);break;
  case "Lich-Knights' Conquest":assert.equal(own.zone,positive?'graveyard':'battlefield');assert.equal(grave.zone,positive?'battlefield':'graveyard');break;
  case 'Fade from History':assert.equal(own.zone,positive?'graveyard':'battlefield');assert.equal(enemy.zone,'graveyard');assert.equal(game.bf().filter(c=>c.ctrl===a&&c.isToken&&c.hasSub('Bear')).length,positive?1:0);assert.equal(game.bf().filter(c=>c.ctrl===b&&c.isToken&&c.hasSub('Bear')).length,1);break;
  case 'Teachings of the Archaics':assert.equal(a.hand.length,before.hand-1+(positive?3:0));break;
  case 'Simulacrum':assert.equal(a.life,before.aLife+(positive?5:0));assert.equal(own.damage,positive?5:0);break;
  case 'Anoint with Affliction':assert.equal(enemy.zone,positive?'exile':'battlefield');break;
  case "Crater's Claws":assert.equal(enemy.damage,positive?4:2);assert.equal(so.x,2);break;
 }
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return f;
}
export const edgeCasesV29={
 'Necrotic Fumes':['paid-copy','insufficient-mana','stale-target'],
 'Reign of Terror':['independent-copy-choice','token-death','indestructible'],
 "Lich-Knights' Conquest":['union-cohort'],
 'Coordinated Clobbering':['partial-stale','live-power'],
 'Roiling Terrain':['foreign-owner'],
 'Hour of Glory':['stale-god'],
 'Unforge':['indestructible-equipment'],
 'Seeds of Innocence':['foreign-controller'],
 'Teachings of the Archaics':['middle-gap'],
 'Anoint with Affliction':['small-unpoisoned'],
 'Rupture':['flying-excluded'],
 'Ill-Gotten Gains':['copy-source'],
 'Reward the Faithful':['live-maximum'],
 'Thoughtweft Charge':['departed-entry'],
 "Inquisitor's Snare":['stale-prevention'],
 'Browbeat':['prevented-acceptance'],
 'Audience with Trostani':['same-token-name']
};
export async function proveEdgeV29(M,name,scenario,role,h,assert=strict){
 const f=make(M,role,h),{game,a,b}=f;fund(a);fund(b);const source=put(M,game,a,name,'hand'),own=body(M,f,a),enemy=body(M,f,b),other=body(M,f,b);let extra,grave,targets=[enemy],slot=0,colorChoices=0;const reveals=[];game.revealToHuman=async q=>reveals.push(q.cards.slice());
 if(name==='Necrotic Fumes'&&scenario==='insufficient-mana')for(const color in a.pool)a.pool[color]=0;
 if(name==='Reign of Terror'){enemy.def={...enemy.def,colorsOverride:['W']};other.def={...other.def,colorsOverride:['W']};if(scenario==='indestructible')enemy.def={...enemy.def,kws:['indestructible']};if(scenario==='token-death'){await game.move(enemy,'graveyard');await game.move(other,'graveyard');await game.makeTokens({name:'Soldier',cost:null,super:[],types:['Creature'],subtypes:['Soldier'],power:'1',toughness:'1',colorsOverride:['W'],kws:[],oracle:'',isTokenDef:true},b,{n:2});}}
 if(name==="Lich-Knights' Conquest"){own.def={...own.def,types:['Artifact','Enchantment','Creature']};await game.makeTokens({name:'Rock',cost:null,super:[],types:['Artifact','Enchantment'],subtypes:[],colorsOverride:[],kws:[],oracle:'',isTokenDef:true},a,{n:1});extra=game.bf().find(c=>c.ctrl===a&&c.isToken);grave=body(M,f,a,{zone:'graveyard'});body(M,f,a,{zone:'graveyard'});}
 if(name==='Coordinated Clobbering'){extra=body(M,f,a,{power:'3'});targets=[own,extra];}
 if(name==='Roiling Terrain'){enemy.def={...enemy.def,types:['Land'],subtypes:[],power:undefined,toughness:undefined};await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,a);put(M,game,a,'Forest','graveyard');}
 if(name==='Hour of Glory'){enemy.def={...enemy.def,subtypes:['God']};extra=body(M,f,b,{zone:'hand'});}
 if(name==='Unforge'){enemy.def={...enemy.def,types:['Artifact'],subtypes:['Equipment'],power:undefined,toughness:undefined,kws:['indestructible']};await game.attach(enemy,other);}
 if(name==='Seeds of Innocence'){enemy.def={...enemy.def,types:['Artifact'],subtypes:[],power:undefined,toughness:undefined};await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,a);}
 if(name==='Teachings of the Archaics')for(let i=0;i<3;i++)body(M,f,b,{zone:'hand'});
 if(name==='Anoint with Affliction')enemy.def={...enemy.def,cost:'{2}{G}'};
 if(name==='Rupture')other.def={...other.def,kws:['flying']};
 if(name==='Ill-Gotten Gains'){grave=body(M,f,a,{zone:'graveyard'});extra=body(M,f,a,{zone:'hand'});body(M,f,b,{zone:'graveyard'});body(M,f,b,{zone:'hand'});}
 if(name==='Reward the Faithful')targets=[a,b];
 if(name==='Thoughtweft Charge'){extra=body(M,f,a,{zone:'hand'});await game.putPermanentOntoBattlefield(extra,a);await game.move(extra,'graveyard');}
 if(name==="Inquisitor's Snare")enemy.attacking=a;
 if(name==='Browbeat'){targets=[b];game.untilEffects.push({kind:'oraclePreventNextAmount',target:b,remaining:5,expires:'eot'});}
 if(name==='Audience with Trostani')await game.makeTokens({name:'Plant',cost:null,super:[],types:['Creature'],subtypes:['Plant'],power:'0',toughness:'1',colorsOverride:['G'],kws:[],oracle:'',isTokenDef:true},a,{n:2});
 game.recalc();choose(a,(g,q)=>{
  if(q.type==='chooseTargets')return name==='Coordinated Clobbering'?slot++===0?targets:[enemy]:targets;
  if(q.type==='chooseCards'){if(name==='Necrotic Fumes'||name==='Rupture')return [own];if(name==="Lich-Knights' Conquest")return q.from.includes(extra)?[own,extra]:q.from.filter(c=>c!==own).slice(0,2);if(name==='Ill-Gotten Gains')return q.from.slice(0,q.max);}
  if(q.type==='chooseOption'){if(name==='Reign of Terror')return colorChoices++===1&&scenario==='independent-copy-choice'?'G':'W';if(name==='Browbeat')return 'no';if(q.aiHint?.kind==='newTargets')return 'yes';}
 });
 choose(b,(g,q)=>q.type==='chooseCards'&&name==='Ill-Gotten Gains'?q.from.slice(0,q.max):q.type==='chooseOption'&&name==='Browbeat'?'yes':undefined);
 const mana=sum(a),life=a.life,bLife=b.life,hand=a.hand.length,bHand=b.hand.length,version=own.zoneVersion;
 const cast=await game.castSpell(a,source,{from:'hand'});if(scenario==='insufficient-mana'){assert.equal(cast,false);assert.equal(source.zone,'hand');assert.equal(sum(a),mana);assert.equal(own.zone,'battlefield');assert.equal(own.zoneVersion,version);assert.equal(enemy.zone,'battlefield');}
 else{
  assert.equal(cast,true,name+': paid edge cast');assert.ok(sum(a)<mana);const so=game.stack.find(s=>s.card===source);assert.ok(so);let copy;
  if(scenario==='paid-copy'){assert.equal(own.zone,'exile');targets=[other];copy=await game.copySpell(so,a,{mayNewTargets:true});assert.equal(copy.oracleExileCostV29.iid,own.iid);assert.equal(copy.targets[0],other);assert.equal(own.zoneVersion,version+1);}
  if(scenario==='independent-copy-choice'){assert.equal(colorChoices,0,'choice is made while resolving');copy=await game.copySpell(so,a,{mayNewTargets:false});assert.equal(colorChoices,0,'copy creates no premature choice');}
  if(scenario==='stale-target'||scenario==='stale-god'){await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,enemy.ctrl);}
  if(scenario==='partial-stale'){await game.move(own,'hand');await game.putPermanentOntoBattlefield(own,a);}
  if(scenario==='live-power')own.def={...own.def,power:'7'};
  if(scenario==='live-maximum')own.def={...own.def,cost:'{8}'};
  if(scenario==='copy-source'){copy=await game.copySpell(so,a,{mayNewTargets:false});await game.resolveTop();assert.equal(source.zone,'stack','spell copy does not exile the physical original');assert.equal(a.hand.length,2);}
  game.recalc();await settle(game);
  switch(scenario){
   case 'paid-copy':assert.equal(enemy.zone,'exile');assert.equal(other.zone,'exile');assert.equal(own.zoneVersion,version+1,'copy pays no extra cost');break;
   case 'stale-target':assert.equal(own.zone,'exile');assert.equal(enemy.zone,'battlefield');break;
   case 'independent-copy-choice':assert.equal(colorChoices,2);assert.equal(own.zone,'graveyard');assert.equal(enemy.zone,'graveyard');assert.equal(other.zone,'graveyard');assert.equal(a.life,life-6);break;
   case 'token-death':assert.equal(game.bf().filter(c=>c.ctrl===b&&c.isToken).length,0);assert.equal(a.life,life-4);break;
   case 'indestructible':assert.equal(enemy.zone,'battlefield');assert.equal(other.zone,'graveyard');assert.equal(a.life,life-2);break;
   case 'union-cohort':assert.equal(own.zone,'graveyard');assert.equal(game.bf().includes(extra),false);assert.equal(grave.zone,'battlefield');assert.equal(game.creatures(a).length,2,'intersection cards counted once');break;
   case 'partial-stale':assert.equal(own.tapped,false);assert.equal(extra.tapped,true);assert.equal(enemy.damage,3);break;
   case 'live-power':assert.equal(enemy.damage,10);break;
   case 'foreign-owner':assert.equal(enemy.zone,'graveyard');assert.equal(enemy.owner,b);assert.equal(a.life,life-1);assert.equal(b.life,bLife);break;
   case 'stale-god':assert.equal(enemy.zone,'battlefield');assert.equal(extra.zone,'hand');assert.equal(reveals.filter(cards=>cards.includes(extra)).length,0);break;
   case 'indestructible-equipment':assert.equal(enemy.zone,'battlefield');assert.equal(other.damage,2);break;
   case 'foreign-controller':assert.equal(enemy.zone,'graveyard');assert.equal(a.life,life+3);assert.equal(b.life,bLife);break;
   case 'middle-gap':assert.equal(a.hand.length,hand-1+2);break;
   case 'small-unpoisoned':assert.equal(b.poison,0);assert.equal(enemy.zone,'exile');break;
   case 'flying-excluded':assert.equal(own.zone,'graveyard');assert.equal(enemy.damage,4);assert.equal(other.damage,0);assert.equal(a.life,life-4);assert.equal(b.life,bLife-4);break;
   case 'copy-source':assert.equal(source.zone,'exile');assert.equal(a.hand.length,2);assert.equal(b.hand.length,2);assert.equal(grave.zone,'hand');break;
   case 'live-maximum':assert.equal(a.life,life+8);assert.equal(b.life,bLife+8);break;
   case 'departed-entry':assert.equal(extra.zone,'graveyard');assert.equal(a.hand.length,hand);assert.equal(enemy.power,7);break;
   case 'stale-prevention':await game.move(enemy,'hand');await game.putPermanentOntoBattlefield(enemy,b);await game.damageAny(enemy,own,3);assert.equal(own.damage,3);break;
   case 'prevented-acceptance':assert.equal(b.life,bLife);assert.equal(b.hand.length,bHand);break;
   case 'same-token-name':assert.equal(a.hand.length,hand);assert.equal(game.creatures(a).filter(c=>c.isToken).length,3);break;
  }
 }
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name);return f;
}
export async function operationProofV29(M,entry,op,role,h){if(!wholeSourcesV29.has(entry.raw.name))return null;let checks=0;const assert={equal:(...a)=>{checks++;strict.equal(...a);},ok:(...a)=>{checks++;strict.ok(...a);}};for(const positive of [false,true])await proveSpellV29(M,entry.raw.name,role,positive,h,assert);for(const scenario of edgeCasesV29[entry.raw.name]||[])await proveEdgeV29(M,entry.raw.name,scenario,role,h,assert);return checks;}
