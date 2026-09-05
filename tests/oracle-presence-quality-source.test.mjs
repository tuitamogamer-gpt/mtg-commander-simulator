import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const M=loadEngine(),rows=JSON.parse(readFileSync(new URL('./fixtures/oracle-presence-quality-source.json',import.meta.url)));
const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
function fixture(role){const f=context(M,role);for(const p of f.game.players)if(!p.isAI){const decide=p.controller.decide.bind(p.controller);p.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.quickTarget?[q.quickTarget]:decide(g,q);}return f;}
function witness(f,what,{player=f.a,creature=true,active=true}={}){
 const card=new M.CardInst({name:'Independent presence witness',types:[creature?'Creature':'Artifact'],subtypes:what==='outlaw'&&active?['Rogue']:['Bear'],cost:'',super:[],power:'2',toughness:'20',colorsOverride:colors[what]&&active?[colors[what]]:what==='colorless'&&active?[]:['G']},player);
 card.zone='battlefield';card.sick=false;if(what==='tapped')card.tapped=active;if(what==='modified'&&active)card.counters['+1/+1']=1;f.game.battlefield.push(card);f.game.recalc();return card;
}
async function cast(f,name,player=f.a,targets=[]){const source=put(M,f.game,player,name,'hand');for(const color of ['W','U','B','R','G','C'])player.pool[color]=30;const total=()=>Object.values(player.pool).reduce((a,b)=>a+b,0),before=total();assert.equal(await f.game.castSpell(player,source,{from:'hand',quickTargets:targets}),true);assert.ok(total()<before);return source;}
for(const role of ['human','ai'])for(const row of rows)for(const operation of row.implementation.filter(op=>op.kind==='generic-static'))test(`${role}: ${row.raw.name} checks a real ${operation.condition.what} creature and stops after it leaves`,async()=>{
 const f=fixture(role),source=await cast(f,row.raw.name);await settle(f.game);const before=[source.power,source.toughness];for(const kw of operation.keywords||[])assert.equal(source.kw(kw),false);
 const artifact=witness(f,operation.condition.what,{creature:false}),enemy=witness(f,operation.condition.what,{player:f.b});assert.deepEqual([source.power,source.toughness],before);for(const kw of operation.keywords||[])assert.equal(source.kw(kw),false);
 const friend=witness(f,operation.condition.what);assert.equal(source.power-before[0],operation.power||0);assert.equal(source.toughness-before[1],operation.toughness||0);for(const kw of operation.keywords||[])assert.equal(source.kw(kw),true);
 await cast(f,'Wipe Away',f.b,[friend]);await settle(f.game);assert.equal(friend.zone,'hand');assert.deepEqual([source.power,source.toughness],before);for(const kw of operation.keywords||[])assert.equal(source.kw(kw),false);assert.equal(artifact.zone,'battlefield');assert.equal(enemy.zone,'battlefield');
});
for(const role of ['human','ai'])for(const [name,what,kind] of [['Dominator Drone','colorless','life'],['Mine Raider','outlaw','treasure'],['Supply Caravan','tapped','warrior']])for(const present of [false,true])test(`${role}: ${name} ${present?'does':'does not'} trigger for its printed intervening condition`,async()=>{
 const f=fixture(role);if(present)witness(f,what);else{witness(f,what,{player:f.b});if(what!=='outlaw')witness(f,what,{creature:false});}
 const before=f.b.life,source=await cast(f,name);await settle(f.game);assert.equal(source.zone,'battlefield');if(kind==='life')assert.equal(before-f.b.life,present?2:0);else assert.equal(f.game.bf().filter(c=>c.isToken&&c.ctrl===f.a&&c.hasSub(kind==='treasure'?'Treasure':'Warrior')).length,present?1:0);
});
for(const role of ['human','ai'])for(const name of ['Ambitious Assault','Heir of the Ancient Fang'])for(const active of [false,true])test(`${role}: ${name} requires a modified creature rather than a modified artifact`,async()=>{
 const f=fixture(role);witness(f,'modified',{creature:false});witness(f,'modified',{active});const source=await cast(f,name),hand=f.a.hand.length;await settle(f.game);if(name==='Ambitious Assault')assert.equal(f.a.hand.length-hand,active?1:0);else assert.equal(source.counters['+1/+1']||0,active?1:0);
});
for(const role of ['human','ai'])for(const active of [false,true])test(`${role}: Outlaws' Fury exposes a playable card only with an actual outlaw type`,async()=>{
 const f=fixture(role);witness(f,'outlaw',{active});const top=f.a.library.at(-1);await cast(f,"Outlaws' Fury");await settle(f.game);assert.equal(top.zone,active?'exile':'library');if(active)assert.ok(f.game.playableLands(f.a).includes(top));
});
for(const role of ['human','ai'])test(`${role}: a noncreature Kindred Rogue is an outlaw for Mine Raider and Outlaws' Fury`,async()=>{
 const f=fixture(role),kindred=witness(f,'outlaw',{creature:false});kindred.def={...kindred.def,types:['Kindred','Artifact']};f.game.recalc();assert.equal(kindred.is('Creature'),false);await cast(f,'Mine Raider');await settle(f.game);assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Treasure')).length,1);const top=f.a.library.at(-1);await cast(f,"Outlaws' Fury");await settle(f.game);assert.equal(top.zone,'exile');
});
for(const role of ['human','ai'])test(`${role}: removing the tapped creature in response makes Supply Caravan's trigger do nothing`,async()=>{
 const f=fixture(role),target=witness(f,'tapped');await cast(f,'Supply Caravan');await f.game.resolveTop();await f.game.flushTriggers();assert.equal(f.game.stack.length,1);await cast(f,'Wipe Away',f.b,[target]);await f.game.resolveTop();await settle(f.game);assert.equal(f.game.bf().filter(c=>c.isToken&&c.hasSub('Warrior')).length,0);
});
for(const role of ['human','ai'])for(const ownAura of [false,true])test(`${role}: Ambitious Assault distinguishes a ${ownAura?'friendly':'hostile'} Aura from an actual modification`,async()=>{
 const f=fixture(role),creature=witness(f,'modified',{active:false});f.game.turnPlayer=ownAura?f.a:f.b;await cast(f,'Rancor',ownAura?f.a:f.b,[creature]);await settle(f.game);assert.equal(f.game.isModifiedCreature(creature),ownAura);f.game.turnPlayer=f.a;f.game.turnNo++;await cast(f,'Ambitious Assault');const hand=f.a.hand.length;await settle(f.game);assert.equal(f.a.hand.length-hand,ownAura?1:0);
});
for(const role of ['human','ai'])for(const name of ['Skyward Spider','Obstinate Gargoyle','Orochi Merge-Keeper'])for(const ownAura of [false,true])test(`${role}: ${name}'s own modified ability rejects hostile Auras while keeping frozen provenance`,async()=>{
 const f=fixture(role),source=await cast(f,name);await settle(f.game);const before=JSON.stringify(source.def.oracleImplementation),frozen=M.ORACLE_BATCHES.flatMap(batch=>batch.cards).find(row=>row.raw.name===name);assert.equal(before,JSON.stringify(frozen.implementation));f.game.turnPlayer=ownAura?f.a:f.b;
 await cast(f,'Rancor',ownAura?f.a:f.b,[source]);await settle(f.game);assert.equal(f.game.isModifiedCreature(source),ownAura);assert.equal(JSON.stringify(source.def.oracleImplementation),before);
 if(name!=='Orochi Merge-Keeper')assert.equal(source.kw('flying'),ownAura);
 else{source.sick=false;f.a.pool.G=0;const options=f.game.manaSources(f.a).filter(row=>row.card===source),amount=ownAura?2:1;assert.equal(options.some(row=>row.produce.some(option=>option.G===2)),ownAura);const mana=options.find(row=>row.produce.some(option=>option.G===amount));assert.equal(await f.game.activateManaSource(f.a,mana,mana.produce.find(option=>option.G===amount)),true);assert.equal(f.a.pool.G,amount);assert.equal(source.tapped,true);assert.equal(f.game.stack.length,0);}
});
for(const role of ['human','ai'])for(const name of ['Skyward Spider','Obstinate Gargoyle','Orochi Merge-Keeper'])for(const modification of ['counter','equipment'])test(`${role}: ${name} enables its printed ability after paid ${modification}`,async()=>{
 const f=fixture(role),source=await cast(f,name);await settle(f.game);
 if(modification==='counter'){await cast(f,'Hunger of the Howlpack',f.a,[source]);await settle(f.game);assert.equal(source.counters['+1/+1'],1);}
 else{const equipment=await cast(f,'Bonesplitter');await settle(f.game);const entry=f.game.activatableList(f.a).find(row=>row.card===equipment&&row.equip),before=Object.values(f.a.pool).reduce((a,b)=>a+b,0);assert.ok(entry);assert.equal(await f.game.activateAbility(f.a,entry,[source]),true);assert.equal(f.game.stack.at(-1).kind,'ability');await settle(f.game);assert.equal(equipment.attachedTo,source.iid);assert.equal(Object.values(f.a.pool).reduce((a,b)=>a+b,0),before-1);equipment.ctrl=f.b;f.game.recalc();}
 assert.equal(f.game.isModifiedCreature(source),true);if(name!=='Orochi Merge-Keeper')assert.equal(source.kw('flying'),true);else{source.sick=false;f.a.pool.G=0;const mana=f.game.manaSources(f.a).find(row=>row.card===source&&row.produce.some(option=>option.G===2));assert.ok(mana);assert.equal(await f.game.activateManaSource(f.a,mana,{G:2}),true);assert.equal(f.a.pool.G,2);assert.equal(source.tapped,true);}
});
for(const role of ['human','ai'])test(`${role}: directly phased Equipment no longer modifies an unphased Obstinate Gargoyle`,async()=>{
 const f=fixture(role),source=await cast(f,'Obstinate Gargoyle');await settle(f.game);const equipment=await cast(f,'Bonesplitter');await settle(f.game);const action=f.game.activatableList(f.a).find(row=>row.card===equipment&&row.equip);assert.ok(action);assert.equal(await f.game.activateAbility(f.a,action,[source]),true);await settle(f.game);assert.equal(source.kw('flying'),true);
 await cast(f,'Reality Ripple',f.b,[equipment]);await settle(f.game);assert.equal(equipment.phasedOut,true);assert.equal(!!source.phasedOut,false);assert.equal(f.game.isModifiedCreature(source),false);assert.equal(source.kw('flying'),false);
});
for(const role of ['human','ai'])test(`${role}: phasing a paid friendly Aura out and in toggles the unphased host's modified ability`,async()=>{
 const f=fixture(role),source=await cast(f,'Obstinate Gargoyle');await settle(f.game);const aura=await cast(f,'Rancor',f.a,[source]);await settle(f.game);assert.equal(source.kw('flying'),true);assert.equal(aura.attachedTo,source.iid);
 f.game.phaseOut(aura,f.a);f.game.recalc();assert.equal(aura.phasedOut,true);assert.equal(!!source.phasedOut,false);assert.equal(f.game.isModifiedCreature(source),false);assert.equal(source.kw('flying'),false);
 f.game.phaseInFor(f.a);f.game.recalc();assert.equal(!!aura.phasedOut,false);assert.equal(aura.attachedTo,source.iid);assert.equal(f.game.isModifiedCreature(source),true);assert.equal(source.kw('flying'),true);
});
