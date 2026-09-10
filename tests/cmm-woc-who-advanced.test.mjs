import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,fuel,mana} from './helpers/c21-fixtures.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from './helpers/game-state-invariants.mjs';
const context=(f,src)=>({g:f.game,you:f.a,src});
const target=(f,c)=>{f.decide=(_,q)=>q.type==='chooseTargets'&&q.candidates.includes(c)?[c]:undefined;};
test('Alela creates one Faerie for the first spell on each opposing turn',async()=>{
 const f=setup(),a=card(f,'Alela, Cunning Conqueror');f.game.turnPlayer=f.b;await play(f,'Brainstorm');await play(f,'Brainstorm');assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Faerie')).length,1);f.a.turnState.spellsCast=0;f.game.turnNo++;await play(f,'Brainstorm');assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Faerie')).length,2);assert.ok(a.kw('flying'));
});
test('simultaneous Faerie combat damage produces one Pirate and one goad per damaged player',async()=>{
 const f=setup();card(f,'Alela, Cunning Conqueror');card(f,'Nettling Nuisance');const enemy=body(f,f.b),faeries=await f.game.makeTokens(M.CWW.faerie,f.a,{n:2});await f.game.damageBatch(faeries.map(src=>({src,target:f.b,n:1,opts:{combat:true}})));await settle(f.game);const pirates=f.game.creatures(f.b).filter(c=>c.hasSub('Pirate'));assert.equal(pirates.length,1);assert.equal(f.game.isGoaded(enemy),true);assert.ok(pirates[0].cur.goadedBy.includes(f.a));assert.equal(pirates[0].cur.cantBlock,true);
});
test('Ondu makes one copy each turn without recursing into its own token',async()=>{
 const f=setup();card(f,'Ondu Spiritdancer');await play(f,'Glorious Anthem');await play(f,'As Foretold');assert.equal(f.game.bf().filter(c=>c.isToken&&c.is('Enchantment')).length,1);f.game.turnNo++;await play(f,'Glorious Anthem');assert.equal(f.game.bf().filter(c=>c.isToken&&c.is('Enchantment')).length,2);
});
test('Starfield animates other non-Aura enchantments at five and preserves additive bonuses',()=>{
 const f=setup(),s=card(f,'Starfield of Nyx'),a=card(f,'As Foretold');card(f,'Glorious Anthem');card(f,'Courser of Kruphix');const aura=card(f,'Pacifism');assert.equal(a.is('Creature'),true);assert.equal(a.power,4);assert.equal(s.is('Creature'),false);assert.equal(aura.is('Creature'),false);assertRecalculationStable(f.game);
});
test('Calix exile is linked to the chosen enchantment and ends when it leaves',async()=>{
 const f=setup(),c=await play(f,"Calix, Destiny's Hand"),a=card(f,'Glorious Anthem'),enemy=body(f,f.b);await activate(f,c,1);assert.equal(enemy.zone,'exile');await f.game.move(c,'graveyard');assert.equal(enemy.zone,'exile');await f.game.move(a,'hand');assert.equal(enemy.zone,'battlefield');assert.equal(enemy.ctrl.idx,f.b.idx);
});
test('Cacophony destroys nonenchantment creatures when cast and becomes a temporary legendary God',async()=>{
 const f=setup(),enemy=body(f,f.b),keep=card(f,'Courser of Kruphix');const c=await play(f,'Cacophony Unleashed');assert.equal(enemy.zone,'graveyard');assert.equal(keep.zone,'battlefield');assert.equal(c.power,6);assert.ok(c.is('Creature')&&c.is('Enchantment')&&c.hasSub('God')&&c.cur.super.includes('Legendary'));f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();assert.equal(c.is('Creature'),false);
});
test('Flesh Duplicate copies a creature and enters with exactly three vanishing counters',async()=>{
 const f=setup(),b=body(f);const copy=await play(f,'Flesh Duplicate');assert.equal(copy.name,b.name);assert.equal(copy.counters.time,3);assert.equal(copy.power,2);await event(f,'upkeep',{player:f.a});assert.equal(copy.counters.time,2);assertRecalculationStable(f.game);
});
test('Idris receives the imprinted artifact abilities and returns it when Idris leaves',async()=>{
 const f=setup(),ring=card(f,'Sol Ring'),idris=await play(f,'Idris, Soul of the TARDIS');assert.equal(ring.zone,'exile');assert.equal(idris.power,4);assert.equal(idris.counters.time,3);idris.sick=false;const s=f.game.manaSources(f.a).find(s=>s.card===idris);assert.ok(s);assert.equal(await f.game.activateManaSource(f.a,s,s.produce[0]),true);await f.game.move(idris,'graveyard');assert.equal(ring.zone,'battlefield');assertGameStateInvariants(f.game);
});
test('emerge pays the reduced alternative mana cost, sacrifices its selected creature and uses toughness',async()=>{
 const f=setup(),victim=card(f,'Star Whale'),c=card(f,'Adipose Offspring','hand');fuel(f.a);const e=f.game.castableList(f.a).find(e=>e.card===c&&e.alt?.cwwKind==='emerge');assert.ok(e);assert.equal(await f.game.castSpell(f.a,c,{from:'hand',alt:e.alt}),true);assert.equal(victim.zone,'graveyard');await settle(f.game);assert.equal(c.castMeta.manaSpent,1);assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Alien')).length,8);
});
test('Tegwyll Scouring uses the extra three-flyer tap cost to cast on an opposing turn',async()=>{
 const f=setup(),flyers=await f.game.makeTokens(M.CWW.faerie,f.a,{n:3}),c=card(f,"Tegwyll's Scouring",'hand');f.game.turnPlayer=f.b;fuel(f.a);const e=f.game.castableList(f.a).find(e=>e.card===c&&e.alt?.cwwKind==='flashFliers');assert.ok(e);assert.equal(await f.game.castSpell(f.a,c,{from:'hand',alt:e.alt}),true);assert.ok(flyers.every(c=>c.tapped));await settle(f.game);assert.equal(c.castMeta.manaSpent,6);assert.equal(f.game.creatures(f.a).length,3);assert.ok(flyers.every(c=>c.zone!=='battlefield'));
});
test('It That Betrays returns the actual nontoken permanent sacrificed by an opponent',async()=>{
 const f=setup();card(f,'It That Betrays');const b=body(f,f.b);await f.game.sacrifice(f.b,b);await settle(f.game);assert.equal(b.zone,'battlefield');assert.equal(b.ctrl.idx,f.a.idx);
});
test('Kozilek draws to seven on cast and counters through an actual matching discard cost',async()=>{
 const f=setup(),k=await play(f,'Kozilek, the Great Distortion');assert.equal(f.a.hand.length,7);const discard=card(f,'Sol Ring','hand'),spell=card(f,'Brainstorm','hand',f.b);fuel(f.b);assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),true);f.game.recalc();const e=f.game.activatableList(f.a).find(e=>e.card===k&&e.ability?.label?.startsWith('Discard mana value 1:'));assert.ok(e);assert.equal(await f.game.activateAbility(f.a,e),true);assert.equal(discard.zone,'graveyard');await settle(f.game);assert.equal(spell.zone,'graveyard');assert.equal(f.b.hand.length,0);
});
test('Forsaken Monument adds colorless mana to a tap for mana and never to convoke',async()=>{
 const f=setup();card(f,'Forsaken Monument');const w=card(f,'Wastes'),s=f.game.manaSources(f.a).find(s=>s.card===w);assert.equal(s.produce[0].C,2);assert.equal(await f.game.activateManaSource(f.a,s,s.produce[0]),true);assert.equal(f.a.pool.C,2);const b=body(f),spell=card(f,'Everything Comes to Dust','hand');const convoke=f.game.manaSources(f.a,{card:spell,castOpts:{}}).filter(s=>s.m.viaConvoke);assert.ok(convoke.some(s=>s.card===b));assert.ok(convoke.every(s=>s.produce.every(o=>(o.C||0)<=1)));
});
test('Tithe Taker taxes an otherwise zero-mana activated ability but not mana abilities',async()=>{
 const f=setup();card(f,'Tithe Taker');const e=card(f,'Endbringer','battlefield',f.b);assert.equal(f.game.activatableList(f.b).some(a=>a.card===e&&a.ability===e.def.abilities[0]),false);f.b.pool.C=1;const entry=f.game.activatableList(f.b).find(a=>a.card===e&&a.ability===e.def.abilities[0]);assert.ok(entry);assert.equal(await f.game.activateAbility(f.b,entry),true);assert.equal(f.b.pool.C,0);await settle(f.game);const ring=card(f,'Sol Ring','battlefield',f.b),s=f.game.manaSources(f.b).find(s=>s.card===ring);assert.equal(await f.game.activateManaSource(f.b,s,s.produce[0]),true);assert.equal(f.b.pool.C,2);
});
test('The Ninth Doctor adds a complete upkeep, including As Foretold and suspend triggers',async()=>{
 const f=setup(),d=card(f,'The Ninth Doctor'),a=card(f,'As Foretold'),future=card(f,'Star Whale','hand');d.tapped=true;await M.CWW.suspend(context(f,d),future,6);f.game.priorityRound=async()=>settle(f.game);await f.game.runBeginningPhase(f.a);assert.equal(a.counters.time,2);assert.equal(future.counters.time,4);assert.equal(future.meta.suspended,4);assert.equal(d.tapped,false);
});
test('Clockspinning targets a suspended card in exile and triggers casting at the last counter',async()=>{
 const f=setup(),future=card(f,'Sol Ring','hand');await M.CWW.suspend(context(f,future),future,1);target(f,future);await play(f,'Clockspinning');assert.equal(future.zone,'battlefield');assert.equal(future.castMeta.manaSpent,0);
});
test('Judoon limits attacks at its controller, while allowing attacks at different opponents',()=>{
 const f=setup();card(f,'Judoon Enforcers');const a=body(f,f.b),b=body(f,f.b);a.attacking=b.attacking=f.a;assert.equal(f.game.attackGroupLegal([a,b]),false);b.attacking=f.others[1];assert.equal(f.game.attackGroupLegal([a,b]),true);
});
test('Psychic Paper changes the equipped name and creature subtype and removes them on detach',async()=>{
 const f=setup(),b=body(f),paper=card(f,'Psychic Paper');f.decide=(_,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='Doctor')?'Doctor':q.type==='chooseOption'&&q.options.some(o=>o.key==='The Tenth Doctor')?'The Tenth Doctor':undefined;await f.game.attach(paper,b);assert.equal(b.name,'The Tenth Doctor');assert.deepEqual(Array.from(b.cur.subtypes),['Doctor']);assert.equal(b.cur.unblockable,true);assert.equal(b.cur.wardCost.mana,'{1}');await f.game.move(paper,'graveyard');assert.equal(b.name,'Grizzly Bears');assert.deepEqual(Array.from(b.cur.subtypes),['Bear']);
});
test('Ghoulish Impetus returns only at end step after the enchanted creature dies',async()=>{
 const f=setup(),b=body(f),other=body(f,f.b),a=card(f,'Ghoulish Impetus');await f.game.attach(a,b);await f.game.destroy(b);await settle(f.game);assert.equal(a.zone,'graveyard');await event(f,'endStep',{player:f.a});assert.equal(a.zone,'battlefield');assert.equal(a.attachedTo,other.iid);
});
test('Angelic Destiny returns to its owner’s hand after the enchanted creature dies',async()=>{
 const f=setup(),b=body(f),a=card(f,'Angelic Destiny');await f.game.attach(a,b);await f.game.destroy(b);await settle(f.game);assert.equal(a.zone,'hand');
});
test('The War Doctor counts a batch exile once and separate exile events separately',async()=>{
 const f=setup(),d=card(f,'The War Doctor'),a=body(f),b=body(f,f.b);await f.game.exileMany([a,b]);await settle(f.game);assert.equal(d.counters.time,1);await f.game.move(f.a.library.at(-1),'exile');await f.game.move(f.a.library.at(-1),'exile');await settle(f.game);assert.equal(d.counters.time,3);
});
test('Not of This World prices the chosen target, not another spell on the stack',async()=>{
 const f=setup(),big=card(f,'It That Betrays'),small=body(f),s1=card(f,'Giant Growth','hand',f.b),s2=card(f,'Giant Growth','hand',f.b);fuel(f.b);target(f,big);assert.equal(await f.game.castSpell(f.b,s1,{from:'hand'}),true);target(f,small);assert.equal(await f.game.castSpell(f.b,s2,{from:'hand'}),true);const counter=card(f,'Not of This World','hand');target(f,f.game.stack.find(s=>s.card===s2));fuel(f.a);const before=mana(f.a);assert.equal(await f.game.castSpell(f.a,counter,{from:'hand'}),true);assert.equal(before-mana(f.a),7);await settle(f.game);
});
test('The Pandorica cannot target itself and The Eleventh Doctor may exile a land',async()=>{
 const f=setup(),p=card(f,'The Pandorica');assert.equal(f.game.legalTargets(p.def.abilities[0].targets[0],p,f.a).includes(p),false);const d=card(f,'The Eleventh Doctor'),land=card(f,'Forest','hand');await f.game.damageAny(d,f.b,1,{combat:true});await settle(f.game);assert.equal(land.zone,'exile');assert.equal(land.counters.time||0,0);
});
test('saved suspended cards and linked phasing restore and continue with real object identities',async()=>{
 const f=setup(),b=body(f),p=card(f,'The Pandorica'),future=card(f,'Star Whale','hand');target(f,b);await activate(f,p);await M.CWW.suspend(context(f,p),future,2);const snapshot=M.captureGameState(f.game);assert.ok(snapshot,JSON.stringify(M.gameStateSnapshotBlockers(f.game)));const fresh=setup();M.restoreGameState(fresh.game,JSON.parse(JSON.stringify(snapshot)));const restored=fresh.game.byIid(b.iid),lock=fresh.game.byIid(p.iid),suspended=fresh.game.byIid(future.iid);assert.equal(restored.phasedOut,true);fresh.game.phaseInFor(fresh.a);assert.equal(restored.phasedOut,true);fresh.game.untap(lock);assert.equal(restored.phasedOut,false);M.CWW.removeTime(context(fresh,lock),suspended,2);await settle(fresh.game);assert.equal(suspended.zone,'battlefield');assertGameStateInvariants(fresh.game);
});
test('Misleading Signpost can redirect an opposing attacker to its caster during declare attackers',async()=>{
 const f=setup(),b=body(f,f.b);b.attacking=f.a;f.game.turnPlayer=f.b;f.game.phase='combat';f.game.step='attackers';target(f,b);await play(f,'Misleading Signpost');assert.equal(b.attacking.idx,f.a.idx);assert.ok(f.game.log.some(r=>r.msg.includes('Reselect')));
});
test('Regenerations Restored permits its benefit trigger before vanishing and schedules the extra turn',async()=>{
 const f=setup(),r=await play(f,'Regenerations Restored');f.decide=(_,q)=>q.type==='orderTriggers'?q.triggers.slice().sort((a,b)=>Number(/Scry/.test(a.name))-Number(/Scry/.test(b.name))):undefined;M.CWW.removeTime(context(f,r),r,12);await f.game.flushTriggers();const benefit=f.game.stack.find(s=>s.name.includes('Scry'));assert.ok(benefit);assert.equal(f.game.stack.at(-1),benefit);await settle(f.game);assert.equal(r.zone,'exile');assert.ok(f.game.extraTurns.includes(f.a));
});
test('Mazemind Tome exiles on its fourth paid page counter and gains life',async()=>{
 const f=setup(),t=card(f,'Mazemind Tome'),life=f.a.life;for(let i=0;i<4;i++){f.game.untap(t);await activate(f,t,0);}assert.equal(t.zone,'exile');assert.equal(f.a.life,life+4);
});
test('Mazemind Tome rearms after its state trigger is countered and does not recheck counters at resolution',async()=>{
 const f=setup(),t=card(f,'Mazemind Tome');f.game.addCounters(t,'page',4);await f.game.flushTriggers();const first=f.game.stack.find(s=>s.srcCard===t);assert.ok(first);await f.game.counterStackObject(first);await f.game.flushTriggers();assert.ok(f.game.stack.some(s=>s.srcCard===t));f.game.removeCounters(t,'page',4);await settle(f.game);assert.equal(t.zone,'exile');
});
test('Umbra Mystic does not let an attached Equipment replace destruction',async()=>{
 const f=setup();card(f,'Umbra Mystic');const b=body(f),equipment=card(f,'Swiftfoot Boots');await f.game.attach(equipment,b);await f.game.destroy(b);await settle(f.game);assert.equal(b.zone,'graveyard');assert.equal(equipment.zone,'battlefield');
});
