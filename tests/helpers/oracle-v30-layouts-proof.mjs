import strict from 'node:assert/strict';
import {context as fixtureContext,put,settle}from'./oracle-v8-fixtures.mjs';
import{assertGameStateInvariants}from'./game-state-invariants.mjs';
let M,proofHelpers,checks=0;const context=(...args)=>{const f=fixtureContext(...args);proofHelpers.trackProofGame?.(f.game);return f;};const assert=Object.fromEntries(['equal','deepEqual','ok'].map(k=>[k,(...args)=>{checks++;return strict[k](...args);} ]));
const scenarios=[];
const fund=p=>{for(const k of ['W','U','B','R','G','C'])p.pool[k]=50;},total=p=>Object.values(p.pool).reduce((s,n)=>s+n,0),ids=cards=>Array.from(cards,c=>c.iid);
const choose=(p,predicate,value)=>{const old=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>{const answer=await(predicate(q)?value(q,g):old(g,q));if(['chooseCards','chooseOption'].includes(q.type)){const saved=M.recordSaveDecision(q,p,answer),restored=M.restoreSaveDecision(q,p,JSON.parse(JSON.stringify(saved)));if(Array.isArray(answer))assert.deepEqual(Array.from(restored,c=>c.iid),Array.from(answer,c=>c.iid));else assert.equal(restored,answer);}return answer;};};
const card=(f,name,types=['Creature'],cost='{2}',subtypes=[],owner=f.a,zone='library',power=3)=>{const c=put(M,f.game,owner,'Grizzly Bears',zone);c.def={...c.def,name,types,cost,subtypes,super:[],kws:[],power:String(power),toughness:'20',colorsOverride:['U']};f.game.recalc();return c;};
const cast=async(f,name,opts={})=>{fund(f.a);if(opts.x!==undefined)choose(f.a,q=>q.type==='chooseX',()=>opts.x);const c=put(M,f.game,f.a,name,opts.from||'hand'),mana=total(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:opts.from||'hand',...opts}),true,name);await settle(f.game);assert.ok(total(f.a)<mana,name+': printed cost paid');return c;};
const activation=async(f,c)=>{fund(f.a);c.sick=false;const row=f.game.activatableList(f.a).find(r=>r.card===c&&r.ability?.oracleOperation?.effects?.some(e=>JSON.stringify(e).includes('-v30')));assert.ok(row);assert.equal(await f.game.activateAbility(f.a,row),true);await settle(f.game);return row;};
scenarios.push({names:["Aether Gust", "Sudden Setback"],run:async(entry,role)=>{
  for(const name of ['Aether Gust','Sudden Setback'].filter(n=>n===entry.raw.name)){const f=context(M,role);fund(f.b);f.game.turnPlayer=f.b;const c=put(M,f.game,f.b,'Grizzly Bears','hand');c.def={...c.def,colorsOverride:['R'],uncounterable:true};assert.equal(await f.game.castSpell(f.b,c,{from:'hand'}),true);const original=f.game.stack.find(s=>s.card===c),copy=await f.game.copySpell(original,f.a,{mayNewTargets:false});assert.ok(copy);f.game.turnPlayer=f.a;choose(f.a,q=>q.type==='chooseTargets',q=>q.candidates.includes(copy)?[copy]:q.candidates.slice(0,q.min));choose(f.a,q=>q.prompt==='Choose a library position',()=> 'bottom');await cast(f,name);assert.equal(c.zone,'battlefield');assert.ok(c.owner===f.b&&c.ctrl===f.b);assert.ok(!f.a.library.includes(c)&&!f.b.library.includes(c));assertGameStateInvariants(f.game);}
  for(const name of ['Happy Hogan, Bodyguard','Deem Inferior','Lost Days']){const f=context(M,role),c=put(M,f.game,f.b,'Grizzly Bears'),v=c.zoneVersion;choose(f.a,q=>q.type==='chooseTargets',q=>q.candidates.includes(c)?[c]:q.candidates.slice(0,q.min));choose(f.b,q=>q.prompt==='Choose a library position',async()=>{await f.game.move(c,'hand');await f.game.putPermanentOntoBattlefield(c,f.b);return 'bottom';});await cast(f,name);assert.equal(c.zone,'battlefield');assert.equal(c.zoneVersion,v+2);assertGameStateInvariants(f.game);}
}});
scenarios.push({names:["Wand of Denial", "Gate to the Aether", "Goblin Guide", "Bamboozle"],run:async(entry,role)=>{
  for(const name of ['Wand of Denial','Gate to the Aether','Goblin Guide','Bamboozle'].filter(n=>n===entry.raw.name)){const f=context(M,role);f.b.library.length=0;const c=card(f,'Short original',name==='Goblin Guide'?['Creature']:name==='Wand of Denial'?['Land']:['Instant'],'{1}',[],f.b),life=f.a.life;choose(f.a,q=>q.type==='chooseTargets',q=>q.candidates.includes(f.b)?[f.b]:q.candidates.slice(0,q.min));let source;if(name==='Bamboozle'){choose(f.a,q=>q.prompt?.startsWith('Choose the v27 captured'),q=>q.from.slice(0,q.max));source=await cast(f,name);assert.equal(c.zone,'graveyard');}else{source=await cast(f,name);if(name==='Wand of Denial'){await activation(f,source);assert.equal(f.a.life,life);}else if(name==='Gate to the Aether'){await f.game.emit('upkeep',{player:f.b});await settle(f.game);}else{source.sick=false;choose(f.a,q=>q.type==='attackers',()=>[{card:source,target:f.b}]);f.game.priorityRound=async()=>settle(f.game);await f.game.combatPhase(f.a);await settle(f.game);}assert.equal(c.zone,'library');}assertGameStateInvariants(f.game);}
}});
scenarios.push({names:["Grenzo, Dungeon Warden"],run:async(entry,role)=>{
  const f=context(M,role),source=await cast(f,'Grenzo, Dungeon Warden',{x:0}),c=put(M,f.game,f.a,'Tarmogoyf','library');f.a.library.splice(f.a.library.indexOf(c),1);f.a.library.unshift(c);M.E.pumpUntilEOT(f.game,source,-2,0);assert.equal(source.power,0);assert.equal(c.power,0);await activation(f,source);assert.equal(c.zone,'graveyard');assert.equal(c.power,1);assertGameStateInvariants(f.game);
}});
scenarios.push({names:["Conflux", "Shard Convergence", "Lotuslight Dancers"],run:async(entry,role)=>{
  for(const name of ['Conflux','Shard Convergence','Lotuslight Dancers'].filter(n=>n===entry.raw.name)){const f=context(M,role),c=card(f,'Five colors',['Creature']);c.def={...c.def,colorsOverride:['W','U','B','R','G']};f.game.recalc();choose(f.a,q=>q.prompt==='Choose a searched card of the required quality',q=>q.from.includes(c)?[c]:[]);await cast(f,name);assert.equal(c.zone,name==='Shard Convergence'?'library':name==='Lotuslight Dancers'?'graveyard':'hand');const selections=f.trace.filter(r=>r.q.prompt==='Choose a searched card of the required quality');assert.ok(selections.filter(r=>r.result?.includes(c)).length<=1);assertGameStateInvariants(f.game);}
}});
scenarios.push({names:["Paroxysm", "Prophecy"],run:async(entry,role)=>{
  for(const name of ['Paroxysm','Prophecy'].filter(n=>n===entry.raw.name))for(const land of [false,true]){const f=context(M,role),host=put(M,f.game,f.b,'Grizzly Bears'),top=card(f,'Known top',land?['Land']:['Creature'],'{2}',[],f.b);choose(f.a,q=>q.type==='chooseTargets',q=>q.candidates.includes(host)?[host]:q.candidates.includes(f.b)?[f.b]:q.candidates.slice(0,q.min));const life=f.a.life,hand=f.a.hand.length,source=await cast(f,name);if(name==='Paroxysm'){assert.equal(source.attachedTo,host.iid);await f.game.emit('upkeep',{player:f.b});await settle(f.game);assert.equal(host.zone,land?'graveyard':'battlefield');if(!land)assert.equal(host.power,5);assert.equal(top.zone,'library');}else{assert.equal(f.a.life,life+(land?1:0));assert.equal(f.a.hand.length,hand);f.game.turnNo++;await f.game.emit('upkeep',{player:f.b});await settle(f.game);assert.equal(f.a.hand.length,hand+1);await f.game.emit('upkeep',{player:f.a});await settle(f.game);assert.equal(f.a.hand.length,hand+1);}assertGameStateInvariants(f.game);}
}});
scenarios.push({names:["Aether Gust", "Sudden Setback", "Subtlety", "Happy Hogan, Bodyguard", "Deem Inferior", "Lost Days"],run:async(entry,role)=>{
  for(const name of ['Aether Gust','Sudden Setback','Subtlety','Happy Hogan, Bodyguard','Deem Inferior','Lost Days'].filter(n=>n===entry.raw.name))for(const bottom of [false,true]){
   const f=context(M,role),target=put(M,f.game,f.b,'Grizzly Bears'),top=f.b.library.at(-1);target.def={...target.def,colorsOverride:['R']};f.game.recalc();
   choose(f.a,q=>q.type==='chooseTargets',q=>q.candidates.includes(target)?[target]:q.candidates.slice(0,q.min));
   choose(f.b,q=>q.prompt==='Choose a library position',q=>q.options.find(o=>o.key===(bottom?'bottom':name==='Happy Hogan, Bodyguard'||name==='Deem Inferior'||name==='Lost Days'?'second':'top')).key);
   if(name==='Subtlety'){fund(f.b);f.game.turnPlayer=f.b;const spell=put(M,f.game,f.b,'Grizzly Bears','hand');assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),true);const so=f.game.stack.find(s=>s.card===spell);f.game.turnPlayer=f.a;choose(f.a,q=>q.type==='chooseTargets',q=>q.candidates.includes(so)?[so]:[]);await cast(f,name);assert.equal(spell.zone,'library');assert.ok(!f.game.stack.includes(so));}
   else await cast(f,name);
   if(name!=='Subtlety'){assert.equal(target.zone,'library');assert.ok(target.owner===f.b);assert.ok(f.b.library[bottom?0:name==='Happy Hogan, Bodyguard'||name==='Deem Inferior'||name==='Lost Days'?f.b.library.length-2:f.b.library.length-1]===target);if(!bottom&&['Happy Hogan, Bodyguard','Deem Inferior','Lost Days'].includes(name))assert.ok(f.b.library.at(-1)===top);}
   assertGameStateInvariants(f.game);
  }
}});
scenarios.push({names:["Conflux", "Shard Convergence", "Gem of Becoming", "Lotuslight Dancers", "Corpse Harvester"],run:async(entry,role)=>{
  for(const name of ['Conflux','Shard Convergence','Gem of Becoming','Lotuslight Dancers','Corpse Harvester'].filter(n=>n===entry.raw.name)){
   const f=context(M,role),filters=name==='Conflux'?['W','U','B','R','G']:name==='Lotuslight Dancers'?['B','G','U']:name==='Shard Convergence'?['Plains','Island','Swamp','Mountain']:name==='Gem of Becoming'?['Island','Swamp','Mountain']:['Zombie','Swamp'],rows=filters.map((quality,i)=>{const r=card(f,'Search '+i,quality.length===1?['Creature']:quality==='Zombie'?['Creature']:['Land'],quality.length===1?'{2}':'',[quality.length===1?'Bear':quality]);if(quality.length===1)r.def={...r.def,colorsOverride:[quality]};return r;});f.game.recalc();
   choose(f.a,q=>q.prompt==='Choose a searched card of the required quality',q=>q.from.filter(c=>rows.includes(c)).slice(0,1));
   const sacrifice=put(M,f.game,f.a,'Grizzly Bears');choose(f.a,q=>q.type==='chooseCards'&&q.from?.includes(sacrifice)&&q.min>0,()=>[sacrifice]);
   if(['Gem of Becoming','Corpse Harvester'].includes(name)){const source=await cast(f,name);await activation(f,source);if(name==='Gem of Becoming')assert.equal(source.zone,'graveyard');else assert.equal(sacrifice.zone,'graveyard');}else await cast(f,name);
   assert.ok(rows.every(c=>c.zone===(name==='Lotuslight Dancers'?'graveyard':'hand')));assert.equal(new Set(rows).size,filters.length);assertGameStateInvariants(f.game);
  }
}});
scenarios.push({names:["Goblin Guide", "Gate to the Aether", "Balshan Beguiler", "Bamboozle", "Wand of Denial"],run:async(entry,role)=>{
  for(const name of ['Goblin Guide','Gate to the Aether','Balshan Beguiler','Bamboozle','Wand of Denial'].filter(n=>n===entry.raw.name)){
   const f=context(M,role),rows=Array.from({length:name==='Balshan Beguiler'?2:name==='Bamboozle'?4:1},(_,i)=>card(f,'Inspected '+i,name==='Goblin Guide'?['Land']:['Creature'],'{2}',[],f.b)),sourceName=name;choose(f.a,q=>q.type==='chooseTargets',q=>q.candidates.includes(f.b)?[f.b]:q.candidates.slice(0,q.min));choose(f.a,q=>q.type==='chooseCards'&&q.from?.some(c=>rows.includes(c)),q=>q.from.slice(0,q.max));
   let source;
   if(name==='Bamboozle'){source=await cast(f,name);assert.equal(rows.filter(c=>c.zone==='graveyard').length,2);assert.equal(rows.filter(c=>c.zone==='library').length,2);}
   else{source=await cast(f,name);if(name==='Gate to the Aether'){await f.game.emit('upkeep',{player:f.b});await settle(f.game);assert.equal(rows[0].zone,'battlefield');assert.ok(rows[0].ctrl===f.b);}
   else if(name==='Wand of Denial'){const life=f.a.life;await activation(f,source);assert.equal(rows[0].zone,'graveyard');assert.equal(f.a.life,life-2);}
   else{source.sick=false;choose(f.a,q=>q.type==='attackers',()=>[{card:source,target:f.b}]);f.game.priorityRound=async()=>settle(f.game);await f.game.combatPhase(f.a);await settle(f.game);assert.equal(rows.filter(c=>c.zone===(name==='Goblin Guide'?'hand':'graveyard')).length,1);}}
   assertGameStateInvariants(f.game);
  }
}});
scenarios.push({names:["Cellar Door", "Grenzo, Dungeon Warden"],run:async(entry,role)=>{
  for(const name of ['Cellar Door','Grenzo, Dungeon Warden'].filter(n=>n===entry.raw.name))for(const replacement of [false,true]){
   const f=context(M,role),c=card(f,'Bottom creature',['Creature'],'{2}',[],f.a,'library',2);f.a.library.splice(f.a.library.indexOf(c),1);f.a.library.unshift(c);const source=await cast(f,name,{x:3});if(replacement)await cast(f,'Rest in Peace');choose(f.a,q=>q.type==='chooseTargets',q=>q.candidates.includes(f.a)?[f.a]:q.candidates.slice(0,q.min));await activation(f,source);if(name==='Grenzo, Dungeon Warden')assert.equal(c.zone,'battlefield');else{assert.equal(c.zone,replacement?'exile':'graveyard');assert.equal(f.game.creatures(f.a).filter(c=>c.hasSub('Zombie')&&c.isToken).length,1);}assertGameStateInvariants(f.game);
  }
}});
scenarios.push({names:["Selvala's Charge", "Selvala's Enforcer", "Rousing of Souls", "Woodvine Elemental", "Dakra Mystic"],run:async(entry,role)=>{
  for(const name of ["Selvala's Charge","Selvala's Enforcer",'Rousing of Souls','Woodvine Elemental','Dakra Mystic'].filter(n=>n===entry.raw.name))for(const decline of [false,true]){
   const f=context(M,role,2),tops=[card(f,'Parley A',['Creature']),card(f,'Parley B',['Creature'],'{2}',[],f.b),card(f,'Parley C',['Land'],'',[],f.others[1])],before=f.game.players.map(p=>p.hand.length);choose(f.a,q=>q.prompt==='Put all revealed cards into their graveyards?',()=>decline?'no':'yes');let source;
   if(name=== 'Woodvine Elemental'){source=await cast(f,name);source.sick=false;choose(f.a,q=>q.type==='attackers',()=>[{card:source,target:f.b}]);f.game.priorityRound=async()=>settle(f.game);await f.game.combatPhase(f.a);await settle(f.game);assert.equal(source.power,6);}
   else if(name==='Dakra Mystic'){source=await cast(f,name);await activation(f,source);}
   else source=await cast(f,name);
   if(name==='Dakra Mystic'&&!decline){assert.ok(tops.every(c=>c.zone==='graveyard'));assert.deepEqual(f.game.players.map(p=>p.hand.length),before);}else{assert.ok(tops.every(c=>c.zone==='hand'));assert.deepEqual(f.game.players.map(p=>p.hand.length),before.map(n=>n+1));}
   if(name==="Selvala's Enforcer")assert.equal(source.counters['+1/+1'],2);if(name==="Selvala's Charge"||name==='Rousing of Souls')assert.equal(f.game.creatures(f.a).filter(c=>c.isToken).length,2);assertGameStateInvariants(f.game);
  }
}});
scenarios.push({names:["Tainted Pact"],run:async(entry,role)=>{
  for(const accept of [false,true]){const f=context(M,role),stop=card(f,'Same'),middle=card(f,'Different'),first=card(f,'Same');choose(f.a,q=>q.prompt==='Put the exiled card into your hand?',()=>accept?'yes':'no');await cast(f,'Tainted Pact');assert.equal(first.zone,accept?'hand':'exile');assert.equal(middle.zone,accept?'library':'exile');assert.equal(stop.zone,accept?'library':'exile');assertGameStateInvariants(f.game);}
}});
scenarios.push({names:["Sword-Point Diplomacy"],run:async(entry,role)=>{
  for(const decline of [false,true]){const f=context(M,role,2),rows=Array.from({length:3},(_,i)=>card(f,'Diplomacy '+i)),life=f.b.life;choose(f.b,q=>q.prompt==='Pay life to exile the revealed card?',()=>decline?'no':'yes');choose(f.others[1],q=>q.prompt==='Pay life to exile the revealed card?',()=> 'no');await cast(f,'Sword-Point Diplomacy');assert.ok(rows.every(c=>c.zone===(decline?'hand':'exile')));assert.equal(f.b.life,life-(decline?0:9));assertGameStateInvariants(f.game);}
}});
scenarios.push({names:["Stomping Slabs"],run:async(entry,role)=>{
  for(const found of [false,true]){const f=context(M,role),rows=Array.from({length:7},(_,i)=>card(f,found&&i===0?'Stomping Slabs':'Name '+i)),life=f.b.life;choose(f.a,q=>q.type==='chooseTargets',q=>q.candidates.includes(f.b)?[f.b]:q.candidates.slice(0,q.min));await cast(f,'Stomping Slabs');assert.equal(f.b.life,life-(found?7:0));assert.ok(rows.every(c=>c.zone==='library'));assert.ok(rows.every(c=>f.a.library.slice(0,7).includes(c)));assertGameStateInvariants(f.game);}
}});
scenarios.push({names:["Unexpected Results"],run:async(entry,role)=>{
  for(const land of [false,true]){const f=context(M,role);f.a.library.length=0;const c=put(M,f.game,f.a,land?'Forest':'Grizzly Bears','library');choose(f.a,q=>q.type==='chooseCards'&&q.from?.includes(c),()=>[c]);const source=await cast(f,'Unexpected Results');assert.equal(c.zone,'battlefield');assert.equal(source.zone,land?'hand':'graveyard');assertGameStateInvariants(f.game);}
}});
scenarios.push({names:["Brilliant Ultimatum"],run:async(entry,role)=>{
  const f=context(M,role);f.a.library.length=0;const rows=[put(M,f.game,f.a,'Grizzly Bears','library'),put(M,f.game,f.a,'Forest','library'),...Array.from({length:3},(_,i)=>card(f,'Ultimatum '+i,['Land'],''))];choose(f.b,q=>q.prompt==='Separate the exiled cards into two piles',q=>q.from.slice());choose(f.a,q=>q.prompt==='Choose an exiled pile',()=> 'one');choose(f.a,q=>q.prompt?.startsWith('You may cast one')&&q.from?.some(c=>rows.includes(c)),q=>q.from.filter(c=>c.name==='Grizzly Bears').slice(0,1).concat(q.from.filter(c=>c.name==='Forest').slice(0,1)).slice(0,1));await cast(f,'Brilliant Ultimatum');assert.equal(rows[0].zone,'battlefield');assert.equal(rows[1].zone,'battlefield');assert.ok(rows.slice(2).every(c=>c.zone==='exile'&&!f.game.hasExilePlayPermission(f.a,c)));assertGameStateInvariants(f.game);
}});
export const installLayoutsProofV30=()=>{},stageLayoutsCardV30=()=>[],stageLayoutsEffectV30=()=>false,assertLayoutsEffectV30=()=>false;
const nodes=v=>v&&typeof v==='object'?[v,...Object.values(v).flatMap(x=>Array.isArray(x)?x.flatMap(nodes):nodes(x))]:[];
export async function operationProofV30(MTG,entry,op,role,h){if(!nodes(op).some(n=>typeof n.action==='string'&&n.action.endsWith('-v30'))&&!(entry.raw.name==='Prophecy'&&op.kind==='spell-generic'))return null;M=MTG;proofHelpers=h;const matched=scenarios.filter(s=>s.names.includes(entry.raw.name));assert.ok(matched.length,entry.raw.name+': native whole-source scenario exists');const start=checks;for(const scenario of matched)await scenario.run(entry,role);assert.ok(checks>start,entry.raw.name+': actual tracked positive checks');return checks-start;}
