import strict from 'node:assert/strict';
import {context,put,settle} from './oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';
const sum=p=>Object.values(p.pool).reduce((n,v)=>n+v,0),fund=p=>{for(const color in p.pool)p.pool[color]=30;};
function choose(p,fn){const prior=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>fn(g,q)??prior(g,q);}
function creature(M,f,p=f.a,{zone='battlefield',power='4',toughness='3',cost='{1}{G}',subtypes=['Bear'],types=['Creature'],kws=[]}={}){const c=put(M,f.game,p,'Grizzly Bears',zone);c.def={...c.def,cost,power,toughness,types,subtypes,kws};f.game.recalc();return c;}
const returned=new Set(['Recommission',"Sheoldred's Restoration",'Foul Renewal','Pyretic Rebirth','Ritual of the Returned']);
const excess=new Set(['Lacerate Flesh','Hell to Pay','Overwhelming Victory','Torch the Witness','Orbital Plunge','Razor Rings']);

export async function proveSpellV25(M,row,role,positive,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role);if(h){h.fillLibrary(M,f.a,30);h.fillLibrary(M,f.b,30);}const {game,a,b}=f,name=row.name,card=put(M,game,a,name,'hand');fund(a);fund(b);let enemy=creature(M,f,b),own=creature(M,f,a,{power:'1',toughness:'20'}),grave=creature(M,f,a,{zone:'graveyard'}),target=returned.has(name)?grave:enemy,spell;own.counters['+1/+1']=1;game.recalc();
 if(name==='Word of Blasting')enemy.def={...enemy.def,subtypes:['Wall']};
 if(name==="Shredder's Technique"&&positive)enemy.def={...enemy.def,types:['Enchantment'],subtypes:[]};
 if(name==='Smashing Success'){target=put(M,game,b,positive?'Sol Ring':'Forest');}
 if(name==='Break the Spell'){target=creature(M,f,positive?a:b,{types:['Enchantment'],subtypes:[]});}
 if(name==='Cinder Cloud')enemy.def={...enemy.def,cost:positive?'{1}{W}':'{1}{G}'};
 if(['Carnivorous Canopy','Serum Snare'].includes(name)){enemy.def={...enemy.def,cost:positive?'{1}{G}':'{3}{G}',kws:['flying']};}
 if(name==="Siren's Ruse"||name==='Splash Portal'){target=own;own.def={...own.def,subtypes:positive?['Pirate','Frog']:['Bear']};}
 if(name==='Hallowed Respite')target=positive?own:enemy;
 if(name==='Self-Inflicted Wound')enemy.def={...enemy.def,cost:positive?'{G}':'{U}'};
 if(name==='Cling to Dust'){target=grave;if(!positive)grave.def={...grave.def,types:['Artifact'],subtypes:[]};}
 if(name==='Razor Rings')enemy.attacking=a;
 if(name==='Orzhov Charm'&&!positive)grave.def={...grave.def,cost:'{G}'};
 if(name==='Recommission'&&!positive)grave.def={...grave.def,types:['Artifact'],subtypes:[]};
 if(name==="Kaervek's Purge"&&!positive)enemy.def={...enemy.def,kws:['indestructible']};
 if(excess.has(name)&&!positive)game.untilEffects.push({kind:'preventToCreature',expires:'eot',iid:enemy.iid,zoneVersion:enemy.zoneVersion});
 if(['Harnessed Lightning','Galvanic Discharge'].includes(name))enemy.def={...enemy.def,toughness:'10'};
 if(name==='Aether Spike'){spell=put(M,game,b,'Lightning Bolt','hand');choose(b,(g,q)=>q.type==='chooseTargets'?[a]:q.type==='chooseOption'&&q.prompt.startsWith('Pay {')?(positive?'no':'yes'):undefined);assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);target=game.stack.find(s=>s.card===spell);}
 const x=name==="Kaervek's Purge"?2:name==='Torch the Witness'?2:5,hand=a.hand.length,life=a.life,enemyLife=b.life,version=target.zoneVersion;
 choose(a,(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='kicker'?(positive?'yes':'no'):q.type==='chooseX'&&q.prompt.includes('energy will')?(positive?3:0):q.type==='chooseModes'?[positive?1:0]:q.type==='chooseTargets'?(q.spec?.what==='proliferate'?[own]:q.candidates.includes(grave)&&returned.has(name)?[grave]:q.candidates.includes(target)?[target]:q.candidates.includes(enemy)?[enemy]:q.candidates.includes(b)?[b]:q.candidates.includes(own)?[own]:undefined):undefined);
 choose(b,(g,q)=>q.type==='chooseCards'&&q.prompt.includes('choose a creature to sacrifice')?[enemy]:undefined);
 if(['Shifting Loyalties','Role Reversal','Modify Memory'].includes(name))choose(a,(g,q)=>q.type==='chooseTargets'?[enemy,own]:undefined);
 if(name==='Orzhov Charm')choose(a,(g,q)=>q.type==='chooseModes'?[positive?1:2]:q.type==='chooseOption'&&q.prompt.includes('izaberi mod')?String(positive?1:2):q.type==='chooseTargets'?(q.candidates.includes(grave)?[grave]:[enemy]):undefined);
 if(name==='What Must Be Done'){grave.def={...grave.def,types:['Artifact','Creature']};choose(a,(g,q)=>q.type==='chooseModes'?[positive?1:0]:q.type==='chooseOption'&&q.prompt.includes('izaberi mod')?String(positive?1:0):q.type==='chooseTargets'?[grave]:undefined);}
 a.counters.energy=2;game.recalc();const mana=sum(a),cast=await game.castSpell(a,card,{from:'hand',xVal:x});assert.equal(cast,true);assert.ok(sum(a)<mana);const stackObject=game.stack.find(so=>so.card===card);assert.ok(stackObject);const base=M.parseCost(card.def.cost),kick=positive&&['Agonizing Demise',"Sheoldred's Restoration"].includes(name)?M.parseCost(name==='Agonizing Demise'?'{1}{R}':'{2}{W}'):null;assert.equal(mana-sum(a),base.generic+base.pips.length+(base.x||0)*x+(kick?kick.generic+kick.pips.length:0));await settle(game);
 if(name==='Smashing Success'){assert.equal(target.zone,'graveyard');assert.equal(game.bf().filter(c=>c.hasSub('Treasure')).length,positive?1:0);}
 if(name==='Agonizing Demise'){assert.equal(enemy.zone,'graveyard');assert.equal(b.life,enemyLife-(positive?4:0));}
 if(name==="Kaervek's Purge"){assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(b.life,enemyLife-(positive?4:0));}
 if(name==='Cinder Cloud'){assert.equal(enemy.zone,'graveyard');assert.equal(b.life,enemyLife-(positive?4:0));}
 if(name==='Word of Blasting'){assert.equal(enemy.zone,'graveyard');assert.equal(b.life,enemyLife-2);}
 if(name==="Shredder's Technique"){assert.equal(enemy.zone,'graveyard');assert.equal(a.life,life-(positive?2:0));}
 if(name==='Recommission'){assert.equal(grave.zone,'battlefield');assert.equal(grave.counters['+1/+1']||0,positive?1:0);}
 if(name==="Sheoldred's Restoration"){assert.equal(grave.zone,'battlefield');assert.equal(a.life,life+(positive?2:-2));assert.equal(card.zone,'exile');}
 if(name==='Hallowed Respite'){assert.equal(target.zone,'battlefield');assert.equal(target.zoneVersion,version+2);assert.equal(target.tapped,!positive);assert.equal(target.counters['+1/+1']||0,positive?1:0);}
 if(name==="Siren's Ruse"||name==='Splash Portal'){assert.equal(target.zoneVersion,version+2);assert.equal(a.hand.length,hand-1+(positive?1:0));}
 if(name==='Self-Inflicted Wound'){assert.equal(enemy.zone,positive?'graveyard':'battlefield');assert.equal(b.life,enemyLife-(positive?2:0));}
 if(name==='Mercy Killing'){assert.equal(enemy.zone,'graveyard');const tokens=game.bf().filter(c=>c.isToken&&c.hasSub('Elf'));assert.equal(tokens.length,4);assert.ok(tokens.every(c=>c.ctrl===b&&c.power===1&&c.toughness===1));}
 if(['Shifting Loyalties','Role Reversal','Modify Memory'].includes(name)){assert.equal(enemy.ctrl,a);assert.equal(own.ctrl,b);assert.equal(a.hand.length,hand-1);}
 if(name==='Break the Spell'){assert.equal(target.zone,'graveyard');assert.equal(a.hand.length,hand-1+(positive?1:0));}
 if(name==='Carnivorous Canopy'||name==='Serum Snare'){assert.equal(target.zone,name==='Carnivorous Canopy'?'graveyard':'hand');assert.equal(own.counters['+1/+1'],positive?2:1);}
 if(name==='Cling to Dust'){assert.equal(target.zone,'exile');assert.equal(a.life,life+(positive?3:0));assert.equal(a.hand.length,hand-1+(positive?0:1));}
 if(name==='Ritual of the Returned'){assert.equal(grave.zone,'exile');const token=game.bf().find(c=>c.isToken&&c.hasSub('Zombie'));assert.ok(token);assert.equal(token.power,4);assert.equal(token.toughness,3);}
 if(name==='Pyretic Rebirth'){assert.equal(grave.zone,'hand');assert.equal(enemy.damage,2);}
 if(name==='Foul Renewal'){assert.equal(grave.zone,'hand');assert.equal(enemy.zone,'graveyard');}
 if(name==='Orzhov Charm'){if(positive){assert.equal(enemy.zone,'graveyard');assert.equal(a.life,life-3);}else assert.equal(grave.zone,'battlefield');}
 if(name==='What Must Be Done'){if(positive){assert.equal(grave.zone,'battlefield');assert.equal(grave.counters['+1/+1'],2);}else assert.equal(enemy.zone,'graveyard');}
 if(excess.has(name)){const n=name==='Torch the Witness'||name==='Lacerate Flesh'||name==='Razor Rings'?4:name==='Overwhelming Victory'||name==='Hell to Pay'?5:6,over=positive?n-3:0;if(['Lacerate Flesh','Hell to Pay'].includes(name)){const tokens=game.bf().filter(c=>c.hasSub(name==='Lacerate Flesh'?'Blood':'Treasure'));assert.equal(tokens.length,over);if(name==='Hell to Pay')assert.ok(tokens.every(c=>c.tapped));}if(name==='Orbital Plunge'||name==='Torch the Witness')assert.equal(game.bf().filter(c=>c.hasSub(name==='Orbital Plunge'?'Lander':'Clue')).length,positive?1:0);if(name==='Overwhelming Victory'){assert.equal(own.power,2+over);assert.equal(own.kw('trample'),true);}if(name==='Razor Rings')assert.equal(a.life,life+over);}
 if(['Harnessed Lightning','Galvanic Discharge','Aether Spike','Wrath of the Skies'].includes(name)){const gain=name==='Aether Spike'?2:name==='Wrath of the Skies'?5:3;assert.equal(a.counters.energy,2+gain-(positive?3:0));if(name==='Harnessed Lightning'||name==='Galvanic Discharge')assert.equal(enemy.damage,positive?3:0);if(name==='Wrath of the Skies')assert.equal(enemy.zone,positive?'graveyard':'battlefield');if(name==='Aether Spike')assert.equal(a.life,positive?life:life-3);}
 assertGameStateInvariants(game);

 if(h)h.assertControllerRole(M,f,name);return {f,card,target,enemy,own,grave};
}
const actions=new Set(['linked-removal-v25','choose-sacrifice-linked-v25','exchange-control-v25','bounce-with-auras-v25','damage-linked-v25','pay-energy-effect-v25']);
const hasAction=value=>!!value&&typeof value==='object'&&(actions.has(value.action)||Object.values(value).some(hasAction));
export async function operationProofV25(M,entry,op,role,h){
 if(!hasAction(entry.implementation))return null;
 if(!new Set(["Shredder's Technique",'Shifting Loyalties', 'Lacerate Flesh', 'Overwhelming Victory', 'Wrath of the Skies', 'Orzhov Charm', 'Self-Inflicted Wound', 'Splash Portal', 'Modify Memory', 'Hallowed Respite', 'Agonizing Demise', 'Mercy Killing', 'Orbital Plunge', 'Torch the Witness', "Siren's Ruse", 'Foul Renewal', 'Hell to Pay', 'Word of Blasting', 'Role Reversal', 'Cling to Dust', 'Pyretic Rebirth', 'Carnivorous Canopy', 'Break the Spell', 'What Must Be Done', 'Ritual of the Returned', 'Smashing Success', 'Harnessed Lightning', "Kaervek's Purge", "Sheoldred's Restoration", 'Recommission', 'Aether Spike', 'Razor Rings', 'Galvanic Discharge', 'Cinder Cloud', 'Serum Snare']).has(entry.raw.name))throw Error('Unproved v25 spell source '+entry.raw.name);
 let checks=0;const assert={equal:(...args)=>{checks++;strict.equal(...args);},ok:(...args)=>{checks++;strict.ok(...args);},deepEqual:(...args)=>{checks++;strict.deepEqual(...args);}};
 for(const positive of [false,true])await proveSpellV25(M,{name:entry.raw.name},role,positive,h,assert);
 for(const scenario of edgeCasesV25[entry.raw.name]||[])await proveSpellEdgeV25(M,entry.raw.name,role,scenario,h,assert);
 return checks;
}


export const edgeCasesV25={
 "Shredder's Technique":['indestructible','sneak-cast'],
 'Smashing Success':['indestructible'],"Kaervek's Purge":['death-exile'],
 'Agonizing Demise':['indestructible','copy-kicker'],'Cinder Cloud':['death-exile'],
 'Word of Blasting':['indestructible'],'Break the Spell':['indestructible'],
 'Pyretic Rebirth':['first-stale','second-stale'],'Foul Renewal':['first-stale'],
 'Ritual of the Returned':['first-stale'],"Siren's Ruse":['entry-type-change'],
 'Splash Portal':['entry-type-change'],'Cling to Dust':['escape-cast'],'Recommission':['entry-observer','entry-type-change'],
 'What Must Be Done':['entry-observer'],'Hallowed Respite':['control-change','flashback-cast'],
 'Modify Memory':['neither-owned','one-stale'],'Shifting Loyalties':['one-stale','type-change'],
 'Role Reversal':['type-change'],'Orzhov Charm':['bounce-auras'],
 'Hell to Pay':['partial-prevention','marked-damage'],
 'Harnessed Lightning':['copy-energy'],"Sheoldred's Restoration":['copy-kicker'],
 'Aether Spike':['opponent-pays']
};
export async function proveSpellEdgeV25(M,name,role,scenario,h,assert=strict){
 const f=h?h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}):context(M,role);
 if(h){h.fillLibrary(M,f.a,30);h.fillLibrary(M,f.b,30);}
 if(name==="Shredder's Technique")return proveShredderEdge(M,f,scenario,h,assert);
 const {game,a,b}=f;fund(a);fund(b);const source=put(M,game,a,name,'hand'),enemy=creature(M,f,b),own=creature(M,f,a,{power:'2',toughness:'20'}),grave=creature(M,f,a,{zone:'graveyard'});
 let target=returned.has(name)?grave:enemy,hand=a.hand.length,life=a.life,opponentLife=b.life,chosenMode=1,other,stackEnemy,entry;
 if(name==='Smashing Success')target=put(M,game,b,'Sol Ring');
 if(name==='Break the Spell')target=creature(M,f,a,{types:['Enchantment'],subtypes:[]});
 if(name==='Word of Blasting')enemy.def={...enemy.def,subtypes:['Wall']};
 if(name==='Cinder Cloud')enemy.def={...enemy.def,cost:'{W}'};
 if(scenario==='indestructible')target.def={...target.def,kws:['indestructible']};
 if(scenario==='death-exile')target.counters.finality=1;
 if(name==='Orzhov Charm'){target=own;chosenMode=0;}
 if(name==='What Must Be Done')grave.def={...grave.def,types:['Artifact','Creature']};
 if(name==='Hallowed Respite')target=own;
 if(scenario==='escape-cast')target=grave;
 if(name==='Harnessed Lightning')enemy.def={...enemy.def,toughness:'20'};
 if(name==='Hell to Pay'){if(scenario==='partial-prevention')game.untilEffects.push({kind:'oraclePreventNextAmount',target:enemy,zoneVersion:enemy.zoneVersion,remaining:3,direction:'to',expires:'eot'});else enemy.damage=2;}
 if(name==='Aether Spike'){a.counters.energy=1;stackEnemy=put(M,game,b,'Lightning Bolt','hand');choose(b,(g,q)=>q.type==='chooseTargets'?[a]:q.type==='chooseOption'&&q.prompt.startsWith('Pay {')?'yes':undefined);assert.equal(await game.castSpell(b,stackEnemy,{from:'hand'}),true);target=game.stack.find(so=>so.card===stackEnemy);}
 let bounced,opposingAuraDeparture;const aura=[];if(scenario==='bounce-auras')for(const p of [a,b]){const c=put(M,game,p,'Rancor');c.attachedTo=own.iid;aura.push(c);}
 if(scenario==='bounce-auras'){const bounce=game.bounceMany,leave=game.fireLeaveAndDie;game.bounceMany=async function(cards,...args){bounced=cards.slice();return bounce.call(this,cards,...args);};game.fireLeaveAndDie=function(card,snap,died,destination){if(card===aura[1])opposingAuraDeparture=destination||snap.departureDestinationV20||card.zone;return leave.call(this,card,snap,died,destination);};}
 if(scenario==='neither-owned'){const c=game.addPlayer('Third',{name:'Third'},{decide:(g,q)=>q.type==='priority'?{kind:'pass'}:null},false);other=creature(M,f,c);}
 const pair=other?[enemy,other]:[enemy,own];
 if(scenario==='entry-observer'){const emit=game.emitBattlefieldEntry;game.emitBattlefieldEntry=async function(event,data){if(event==='etb'&&data.card===grave)entry=grave.counters['+1/+1']||0;return emit.call(this,event,data);};}
 if(scenario==='entry-type-change'){const enter=game.putPermanentOntoBattlefield;game.putPermanentOntoBattlefield=async function(card,p,opts){if(card===target)card.def={...card.def,...(name==='Recommission'?{types:['Artifact'],subtypes:[]}:{subtypes:name==="Siren's Ruse"?['Bear']:['Frog']})};return enter.call(this,card,p,opts);};if(name==="Siren's Ruse")own.def={...own.def,subtypes:['Pirate']};target=name==='Recommission'?grave:own;}
 choose(a,(g,q)=>q.type==='chooseOption'&&q.aiHint?.kind==='kicker'?'yes':q.type==='chooseX'&&q.prompt.includes('energy will')?3:q.type==='chooseModes'?[chosenMode]:q.type==='chooseOption'&&q.prompt.includes('izaberi mod')?String(chosenMode):q.type==='chooseTargets'?(name==='Modify Memory'||name==='Shifting Loyalties'||name==='Role Reversal'?pair:q.candidates.includes(target)?[target]:q.candidates.includes(enemy)?[enemy]:q.candidates.includes(b)?[b]:undefined):undefined);
 let offer,escapeDonors=[];if(scenario==='flashback-cast'||scenario==='escape-cast'){await game.move(source,'graveyard');if(scenario==='escape-cast'){escapeDonors=Array.from({length:5},()=>put(M,game,a,'Forest','graveyard'));choose(a,(g,q)=>q.type==='chooseCards'&&q.from?.includes(escapeDonors[0])?escapeDonors:undefined);}offer=game.castableList(a).find(row=>row.card===source&&row.from==='graveyard'&&(scenario==='flashback-cast'?row.alt?.flashback:row.alt?.escape));assert.ok(offer);}
 game.recalc();const mana=sum(a),x=name==="Kaervek's Purge"?2:5;assert.equal(await game.castSpell(a,source,{from:offer?.from||'hand',alt:offer?.alt,xVal:x}),true);assert.ok(sum(a)<mana);const so=game.stack.find(so=>so.card===source);assert.ok(so);const afterCast=sum(a);
 if(scenario==='first-stale'){await game.move(target,'exile');await game.move(target,'graveyard');}
 if(scenario==='second-stale'){await game.move(enemy,'exile');await game.putPermanentOntoBattlefield(enemy,b);}
 if(scenario==='one-stale'){await game.move(enemy,'exile');await game.putPermanentOntoBattlefield(enemy,b);}
 if(scenario==='type-change'){own.def={...own.def,types:['Artifact'],subtypes:[]};game.recalc();}
 if(scenario==='control-change'){M.OracleV8Control.gain(game,own,b);game.recalc();}
 if(scenario==='copy-kicker'){
  const copyTarget=creature(M,f,name==='Agonizing Demise'?b:a,{zone:name==='Agonizing Demise'?'battlefield':'graveyard',power:'6',cost:'{4}{G}'});
  const copied=await game.copySpell(so,a,{mayNewTargets:false,forceTarget:copyTarget});assert.ok(copied);assert.equal(copied.kicked,true);assert.equal(sum(a),afterCast);source.castMeta={...source.castMeta,kicked:false};
 }
 if(scenario==='copy-energy'){const copied=await game.copySpell(so,a,{mayNewTargets:false});assert.ok(copied);assert.equal(sum(a),afterCast);}
 await settle(game);
 if(scenario==='indestructible'){assert.equal(target.zone,'battlefield');if(name==='Smashing Success')assert.equal(game.bf().filter(c=>c.hasSub('Treasure')).length,0);if(name==='Break the Spell')assert.equal(a.hand.length,hand-1);if(name==='Agonizing Demise')assert.equal(b.life,opponentLife-4);if(name==='Word of Blasting')assert.equal(b.life,opponentLife-2);}
 if(scenario==='death-exile'){assert.equal(enemy.zone,'exile');assert.equal(b.life,opponentLife);}
 if(scenario==='first-stale'){assert.equal(target.zone,'graveyard');assert.equal(enemy.damage,0);assert.equal(enemy.power,4);assert.equal(game.bf().filter(c=>c.isToken).length,0);}
 if(scenario==='second-stale'){assert.equal(grave.zone,'hand');assert.equal(enemy.damage,0);}
 if(scenario==='entry-type-change'){assert.equal(target.zone,'battlefield');if(name==='Recommission')assert.equal(target.counters['+1/+1']||0,0);else assert.equal(a.hand.length,hand);}
 if(scenario==='entry-observer'){assert.equal(entry,name==='Recommission'?1:2);assert.equal(grave.counters['+1/+1'],entry);}
 if(scenario==='control-change'){assert.equal(own.ctrl,a);assert.equal(own.counters['+1/+1'],1);assert.equal(own.tapped,false);}
 if(scenario==='neither-owned'){assert.equal(enemy.ctrl,other.owner);assert.equal(other.ctrl,b);assert.equal(a.hand.length,hand+2);}
 if(scenario==='one-stale'||scenario==='type-change'){assert.equal(enemy.ctrl,b);assert.equal(own.ctrl,a);assert.equal(a.hand.length,hand-1);}
 if(scenario==='bounce-auras'){assert.equal(own.zone,'hand');assert.equal(aura[0].zone,'hand');assert.equal(aura[1].zone,'hand');assert.deepEqual(Array.from(bounced),[own,aura[0]]);assert.equal(opposingAuraDeparture,'graveyard');}
 if(scenario==='partial-prevention'){assert.equal(enemy.damage,2);assert.equal(game.bf().filter(c=>c.hasSub('Treasure')).length,0);}
 if(scenario==='marked-damage'){assert.equal(enemy.zone,'graveyard');assert.equal(game.bf().filter(c=>c.hasSub('Treasure')).length,4);}
 if(scenario==='copy-kicker'){if(name==='Agonizing Demise')assert.equal(b.life,opponentLife-10);else assert.equal(a.life,life+7);assert.equal(sum(a),afterCast);}
 if(scenario==='copy-energy'){assert.equal(enemy.damage,6);assert.equal(a.counters.energy||0,0);}
 if(scenario==='opponent-pays'){assert.equal(a.life,life-3);assert.equal(a.counters.energy||0,0);}
 if(scenario==='flashback-cast'){assert.equal(source.zone,'exile');assert.equal(own.counters['+1/+1'],1);assert.equal(mana-afterCast,3);}
 if(scenario==='escape-cast'){assert.equal(target.zone,'exile');assert.equal(a.life,life+3);assert.equal(mana-afterCast,4);assert.ok(escapeDonors.every(c=>c.zone==='exile'));}
 assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,name+' '+scenario);
}

async function proveShredderEdge(M,f,scenario,h,assert){
 const {game,a,b}=f;fund(a);fund(b);const source=put(M,game,a,"Shredder's Technique",'hand'),target=creature(M,f,b,{types:['Enchantment'],subtypes:[]}),own=creature(M,f,a),life=a.life,mana=sum(a);let alt;
 choose(a,(g,q)=>q.type==='chooseTargets'?[target]:q.type==='chooseCards'&&q.from?.includes(own)?[own]:undefined);
 if(scenario==='sneak-cast'){own.attacking=b;own.blockedBy=[];own.wasBlocked=false;own.tapped=true;game.phase='combat';game.step='blockers';game.combat={attackers:[own],defenders:new Map()};alt=source.def.altCosts.find(row=>row.oracleSneakCost);assert.ok(alt);}
 if(scenario==='indestructible')target.def={...target.def,kws:['indestructible']};game.recalc();
 assert.equal(await game.castSpell(a,source,{from:'hand',...(alt?{alt}:{})}),true);assert.equal(mana-sum(a),alt?1:3);if(alt){assert.equal(own.zone,'hand');assert.equal(game.stack.find(so=>so.card===source).oracleV4AdditionalCost.returns.length,1);}await settle(game);assert.equal(target.zone,scenario==='indestructible'?'battlefield':'graveyard');assert.equal(a.life,life-(scenario==='indestructible'?0:2));assertGameStateInvariants(game);if(h)h.assertControllerRole(M,f,"Shredder's Technique");
}
