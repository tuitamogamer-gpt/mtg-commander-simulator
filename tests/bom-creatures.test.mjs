import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,fuel} from './helpers/bom-fixtures.mjs';

test('Brimaz uses a paid spell cast and creates an Incubator with entry counters; transformation pays mana',async()=>{
 const f=setup();card(f,'Brimaz, Blight of Oreskos');await play(f,'Plague Myr');
 const egg=f.game.bf().find(c=>c.hasSub('Incubator'));assert.ok(egg);assert.equal(egg.counters['+1/+1'],2);assert.equal(egg.is('Creature'),false);
 await activate(f,egg);assert.equal(egg.hasSub('Phyrexian'),true);assert.equal(egg.is('Artifact'),true);assert.equal(egg.power,2);assert.equal(f.game.activatableList(f.a).some(e=>e.card===egg),false);
});
test('Gimbal counts distinct token names after the Gremlin enters and grants trample to artifacts only',async()=>{
 const f=setup();card(f,'Gimbal, Gremlin Prodigy');body(f);await f.game.makeTokens(M.TOKENS.treasure,f.a,{n:2});await event(f,'endStep',{player:f.a});
 const c=f.game.creatures(f.a).find(c=>c.isToken&&c.hasSub('Gremlin'));assert.ok(c);assert.equal(c.power,2);assert.equal(c.kw('trample'),true);assert.equal(f.game.creatures(f.a).find(c=>c.name==='Grizzly Bears').kw('trample'),false);
});
test('Urza affinity counts artifact creatures in hand and command; Constructs scale during recalculation',async()=>{
 const f=setup();card(f,'Plague Myr');card(f,'Sol Ring');const urza=card(f,'Urza, Chief Artificer','hand');assert.equal(f.game.spellCost(f.a,urza,{}).generic,2);
 await play(f,urza.name,{card:urza});await event(f,'endStep',{player:f.a});const c=f.game.creatures(f.a).find(c=>c.hasSub('Construct'));assert.equal(c.power,3);assert.equal(c.kw('menace'),true);await f.game.move(f.game.bf().find(c=>c.name==='Sol Ring'),'graveyard');f.game.recalc();assert.equal(c.power,2);
});
test('Conclave Mentor replaces counters once and gains life from last known power',async()=>{
 const f=setup(),mentor=card(f,'Conclave Mentor'),bear=body(f);f.game.addCounters(bear,'+1/+1',2,false,f.a);assert.equal(bear.counters['+1/+1'],3);const life=f.a.life;await f.game.destroy(mentor);await settle(f.game);assert.equal(f.a.life,life+2);
});
test('Blight Titan mills before calculating incubate and its entry is a Stack trigger',async()=>{
 const f=setup();card(f,'Grizzly Bears','library');card(f,'Plague Myr','library');await play(f,'Blight Titan');const egg=f.game.bf().find(c=>c.hasSub('Incubator'));assert.ok(egg);assert.equal(egg.counters['+1/+1'],2);
});
test('Conclave Sledge-Captain lends three separate damage triggers, after combat damage',async()=>{
 const f=setup(),bear=body(f);f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(bear)?[bear]:undefined;await play(f,'Conclave Sledge-Captain');assert.equal(bear.counters['+1/+1'],3);assert.equal(bear.kw('trample'),true);
 await event(f,'damageToPlayer',{src:bear,player:f.b,n:2,combat:true});assert.equal(bear.counters['+1/+1'],9);
});
test('Vishgraz creates three toxic artifact Mites and counts all opponents’ poison',async()=>{
 const f=setup();f.b.poison=3;const c=await play(f,'Vishgraz, the Doomhive');assert.equal(c.power,6);const mites=f.game.creatures(f.a).filter(c=>c.hasSub('Mite'));assert.equal(mites.length,3);assert.ok(mites.every(c=>c.is('Artifact')));await f.game.damagePlayer(mites[0],f.b,1,{combat:true});assert.equal(f.b.poison,4);
});
test('Sidar command-zone eminence draws then discards once for the whole Knight attack',async()=>{
 const f=setup(),sidar=card(f,'Sidar Jabari of Zhalfir','command');sidar.commander=true;const knight=card(f,'Syr Elenora, the Discerning');card(f,'Forest','library');await event(f,'attackersDeclared',{player:f.a,attackers:[{card:knight,target:f.b}]});assert.equal(f.a.hand.length,0);assert.equal(f.a.graveyard.length,1);
});
test('Kasla observes convoke on a paid spell even when no creatures are used to pay',async()=>{
 const f=setup();card(f,'Kasla, the Broken Halo');card(f,'Forest','library');card(f,'Forest','library');await play(f,'Wildfire Awakener');assert.ok(f.a.hand.length>=1);assert.equal(f.game.creatures(f.a).filter(c=>c.hasSub('Elemental')).length,3);
});
