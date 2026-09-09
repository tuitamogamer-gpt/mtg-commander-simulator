import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,fuel} from './helpers/bom-fixtures.mjs';
const ctx=(f,c)=>({g:f.game,src:c,you:c.ctrl,sourceZoneVersion:c.zoneVersion});
const mana=p=>Object.values(p.pool).reduce((n,x)=>n+x,0);
const library=(f,p=f.a)=>{for(let i=0;i<20;i++)card(f,'Forest','library',p);};

test('Battle Screech flashback taps three white creatures and exiles; stale zero-cost proposals fail',async()=>{
 const f=setup(),c=card(f,'Battle Screech','graveyard');assert.equal(f.game.castableList(f.a).some(r=>r.card===c),false);
 const cs=Array.from({length:3},()=>card(f,'Suture Priest'));fuel(f.a);const offer=f.game.castableList(f.a).find(r=>r.card===c);assert.ok(offer);assert.equal(await f.game.castSpell(f.a,c,{from:'graveyard',alt:{flashback:true,altCostStr:'{0}'}}),false);
 assert.equal(await f.game.castSpell(f.a,c,{from:'graveyard',alt:offer.alt}),true);assert.ok(cs.every(c=>c.tapped));await settle(f.game);assert.equal(c.zone,'exile');assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Bird')).length,2);
});
test('Haakon cannot be cast from hand and permits real Knight casts from graveyard only while present',async()=>{
 const f=setup(),h=card(f,'Haakon, Stromgald Scourge','hand');fuel(f.a);assert.equal(await f.game.castSpell(f.a,h,{from:'hand'}),false);await f.game.move(h,'graveyard');await play(f,h.name,{card:h});const k=card(f,'Syr Elenora, the Discerning','graveyard');assert.ok(f.game.castableList(f.a).some(r=>r.card===k));const life=f.a.life;await f.game.destroy(h);await settle(f.game);assert.equal(f.a.life,life-2);assert.equal(f.game.castableList(f.a).some(r=>r.card===k),false);
});
test('Artifact offering reduces matching red pips and sacrifices the selected artifact during casting',async()=>{
 const f=setup(),a=card(f,'Breya, Etherium Shaper'),h=card(f,'Blast-Furnace Hellkite','hand');fuel(f.a);f.game.phase='upkeep';const row=f.game.castableList(f.a).find(r=>r.card===h&&r.alt?.bomOffering===a.iid);assert.ok(row);const cost=f.game.spellCost(f.a,h,row.alt);assert.equal(cost.generic,4);assert.equal(JSON.stringify(cost.pips),'[["R"]]');assert.equal(await f.game.castSpell(f.a,h,{from:'hand',alt:row.alt}),true);assert.equal(a.zone,'graveyard');assert.ok(f.game.stack.some(s=>s.card===h));await settle(f.game);assert.equal(h.zone,'battlefield');
});
test('Contaminant Grafter proliferates once for simultaneous combat damage and separately for another batch',async()=>{
 const f=setup(),grafter=card(f,'Contaminant Grafter'),a=body(f),b=body(f);f.b.poison=1;f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(f.b)?[f.b]:undefined;
 await f.game.damageBatch([{src:a,target:f.b,n:1},{src:b,target:f.b,n:1}],{combat:true});await settle(f.game);assert.equal(f.b.poison,2);await f.game.damageBatch([{src:grafter,target:f.b,n:1}],{combat:true});await settle(f.game);assert.equal(f.b.poison,4);
});
test('Chant prevents creature damage and gains only the damage actually prevented',async()=>{
 const f=setup(),bear=body(f,f.b);await play(f,'Chant of Vitu-Ghazi');const life=f.a.life;await f.game.damageAny(bear,f.a,4);assert.equal(f.a.life,life+4);await f.game.damageAny(bear,f.a,2,{cantBePrevented:true});assert.equal(f.a.life,life+2);
});
test('Dromoka’s Command selects two different modes and resolves each with its own targets',async()=>{
 const f=setup(),bear=body(f);card(f,'Glorious Anthem','battlefield',f.b);f.decide=(p,q)=>q.type==='chooseMulti'?[1,2]:q.type==='chooseTargets'&&q.candidates.includes(f.b)?[f.b]:q.type==='chooseTargets'&&q.candidates.includes(bear)?[bear]:undefined;await play(f,"Dromoka's Command");assert.equal(bear.counters['+1/+1'],1);assert.ok(f.b.graveyard.some(c=>c.name==='Glorious Anthem'));
});
test('Tawnos pays two artifact tokens and exiles a card as costs before creating its artifact copy',async()=>{
 const f=setup(),t=card(f,'Tawnos, Solemn Survivor'),b=card(f,'Grizzly Bears','graveyard');await f.game.makeTokens(M.TOKENS.treasure,f.a,{n:2});await activate(f,t,1);assert.equal(b.zone,'exile');const copy=f.game.creatures(f.a).find(c=>c.isToken&&c.name.includes('Grizzly'));assert.ok(copy);assert.equal(copy.is('Artifact'),true);assert.equal(f.game.bf().filter(c=>c.hasSub('Treasure')).length,0);
});
test('Wondrous Crucible casts a copy with its own Stack object and leaves the original in exile',async()=>{
 const f=setup(),w=card(f,'Wondrous Crucible'),b=card(f,'Grizzly Bears','graveyard');await event(f,'endStep',{player:f.a});assert.equal(b.zone,'exile');const made=f.game.creatures(f.a).find(c=>c.isToken&&c.name.includes('Grizzly'));assert.ok(made);assert.equal(made.castMeta.wasCast,true);assert.equal(f.a.turnState.spellsCast,1);assert.equal(f.game.bomCardCopies.length,0);assert.equal(made.cur.extraWards.length,1);
});
test('Day/night checks only the preceding active player and entering Huntmaster uses the night face',async()=>{
 const f=setup();await play(f,"Tovolar's Huntmaster");assert.equal(f.game.bomDayNight,'day');f.game.bomPreviousActive=f.b.idx;f.b.lastTurnSpellsCast=0;f.a.lastTurnSpellsCast=3;await f.game.bomUpdateDayNight();assert.equal(f.game.bomDayNight,'night');const c=f.game.creatures(f.a).find(c=>c.name==="Tovolar's Packleader");assert.ok(c);assert.equal(await M.BOM.transform(ctx(f,c)),false);const c2=card(f,"Tovolar's Huntmaster",'hand');await f.game.putPermanentOntoBattlefield(c2,f.a);assert.equal(c2.oracleFace,'back');f.b.lastTurnSpellsCast=2;await f.game.bomUpdateDayNight();assert.equal(c.oracleFace,'front');assert.equal(c2.oracleFace,'front');
});
test('Sphinx adds untap, upkeep, and draw without a new turn or reset land allowance',async()=>{
 const f=setup();library(f);card(f,'Sphinx of the Second Sun');const land=card(f,'Forest');land.tapped=true;f.a.landsPlayed=1;f.a.turnState.spellsCast=2;const before=f.game.turnNo,turns=f.a.turnsStarted,events=[];f.game.priorityRound=async()=>{await settle(f.game);};const emit=f.game.emit;f.game.emit=async function(n,d){events.push(n);return emit.call(this,n,d);};await event(f,'postcombatMain',{player:f.a});assert.equal(f.game._additionalPhases[0].kind,'beginning');await f.game.runAdditionalPhases(f.a);assert.equal(land.tapped,false);assert.equal(f.a.hand.length,1);assert.equal(f.game.turnNo,before);assert.equal(f.a.turnsStarted,turns);assert.equal(f.a.landsPlayed,1);assert.equal(f.a.turnState.spellsCast,2);assert.ok(events.includes('upkeep')&&events.includes('drawStep'));
});
test('Dennick forbids graveyard targeting, casts transformed via disturb, and exiles instead of dying',async()=>{
 const f=setup(),d=card(f,'Dennick, Pious Apprentice'),b=card(f,'Grizzly Bears','graveyard');assert.equal(f.game.legalTargets(M.BOM.ownGrave(c=>c.is('Creature')),d,f.a).includes(b),false);await f.game.move(d,'graveyard');const offer=M.StarterCasting.offers(f.game,f.a).find(r=>r.card===d&&r.alt.bomKind==='disturb');await play(f,d.name,{card:d,alt:offer.alt});assert.equal(d.name,'Dennick, Pious Apparition');await f.game.mill(f.a,1);await f.game.move(b,'hand');await f.game.move(b,'graveyard');await settle(f.game);assert.equal(f.game.bf().filter(c=>c.hasSub('Clue')).length,1);await f.game.destroy(d);await settle(f.game);assert.equal(d.zone,'exile');
});
test('Cosima voyage counters return as entry counters and draw; Omenkeel grants only lands',async()=>{
 const f=setup(),c=card(f,'Cosima, God of the Voyage');library(f);await event(f,'upkeep',{player:f.a});assert.equal(c.zone,'exile');await f.game.putPermanentOntoBattlefield(card(f,'Forest','hand'),f.a);await settle(f.game);assert.equal(c.counters.voyage,1);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('voyage counter')?'no':undefined;await f.game.putPermanentOntoBattlefield(card(f,'Forest','hand'),f.a);await settle(f.game);assert.equal(c.zone,'battlefield');assert.equal(c.counters['+1/+1'],1);assert.equal(f.a.hand.length,1);
 const o=card(f,'Cosima, God of the Voyage','hand');await f.game.putPermanentOntoBattlefield(o,f.a,{oracleFace:'back'});const land=card(f,'Forest','library',f.b),spell=card(f,'Grizzly Bears','library',f.b);await event(f,'damageToPlayer',{src:o,player:f.b,n:2,combat:true});assert.ok(f.game.playableLands(f.a).includes(land));assert.equal(f.game.castableList(f.a).some(r=>r.card===spell),false);
});
test('Valentin replaces opposing nontoken deaths and the reflexive trigger pays for a Pest',async()=>{
 const f=setup(),v=card(f,'Valentin, Dean of the Vein'),b=body(f,f.b);fuel(f.a);await f.game.destroy(b);assert.equal(b.zone,'exile');assert.ok(f.game.pendingTriggers.length);await settle(f.game);assert.equal(f.game.creatures(f.a).filter(c=>c.hasSub('Pest')).length,1);assert.equal(f.b.graveyard.length,0);
});
test('Valki’s temporary exile returns to hand after Valki leaves, including after becoming a copy',async()=>{
 const f=setup(),b=card(f,'Grizzly Bears','hand',f.b);const v=await play(f,'Valki, God of Lies');assert.equal(b.zone,'exile');f.x=2;await activate(f,v);assert.equal(v.name,'Grizzly Bears');await f.game.move(v,'graveyard');assert.equal(b.zone,'hand');assert.equal(v.name,'Valki, God of Lies');
});
test('Ludevic pays X exile costs, transforms, copies the chosen creature, and retains its physical faces',async()=>{
 const f=setup(),l=card(f,'Ludevic, Necrogenius');card(f,'Grizzly Bears','graveyard');card(f,'Wind Drake','graveyard');f.x=2;await activate(f,l);assert.equal(l.name,"Olag, Ludevic's Hubris");assert.equal(l.power,6);assert.equal(l.is('Creature'),true);assert.equal(l.hasSub('Zombie'),true);assert.equal(l.oracleFace,'back');assert.ok(l.colors.includes('U')&&l.colors.includes('B'));await f.game.move(l,'hand');assert.equal(l.name,'Ludevic, Necrogenius');
});
test('Grafted Exoskeleton detaching is a Stack trigger that sacrifices only the same former host',async()=>{
 const f=setup(),e=card(f,'Grafted Exoskeleton'),a=body(f),b=body(f);await f.game.attach(e,a);await f.game.attach(e,b);assert.equal(a.zone,'battlefield');assert.ok(f.game.pendingTriggers.length);await settle(f.game);assert.equal(a.zone,'graveyard');await f.game.move(e,'graveyard');await settle(f.game);assert.equal(b.zone,'graveyard');
});
test('Kinnan adds actual mana from nonland sources and Powerstones pay abilities or artifact spells only',async()=>{
 const f=setup();card(f,'Kinnan, Bonder Prodigy');const ring=card(f,'Sol Ring');for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;const source=f.game.manaSources(f.a).find(s=>s.card===ring);assert.equal(await f.game.activateManaSource(f.a,source,{C:2}),true);assert.equal(f.a.pool.C,3);const [stone]=await f.game.makeTokens(M.BOM.powerstone,f.a);const bear=card(f,'Grizzly Bears','hand'),artifact=card(f,'Relic of Progenitus','hand');assert.equal(f.game.manaSources(f.a,{card:bear}).some(s=>s.card===stone),false);assert.equal(f.game.manaSources(f.a,{card:artifact}).some(s=>s.card===stone),true);assert.equal(f.game.manaSources(f.a,{card:bear,isAbility:true}).some(s=>s.card===stone),true);
});
