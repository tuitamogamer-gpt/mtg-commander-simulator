import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M,setup,card,body,play,activate,event,settle,fuel} from './helpers/c21-fixtures.mjs';
import {buildIntake,sourceDir} from '../scripts/import-cmm-woc-who-precons.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from './helpers/game-state-invariants.mjs';
const choose=(f,fn)=>{f.decide=fn;};
const ctx=f=>({g:f.game,you:f.a,src:f.game.bf()[0]||card(f,'Sol Ring')});
const castOffer=async(f,c,kind)=>{fuel(f.a);const e=f.game.castableList(f.a).find(e=>e.card===c&&e.alt?.cwwKind===kind);assert.ok(e,c.name+' offers '+kind);assert.equal(await f.game.castSpell(f.a,c,{from:c.zone,alt:e.alt}),true);await settle(f.game);return e;};
test('five exact original precons, native definitions, artwork, guides and commander pairs',()=>{
 const i=buildIntake(M),intake=JSON.parse(fs.readFileSync(sourceDir+'/intake.json'));
 assert.equal(i.decks.length,5);assert.equal(i.names.length,372);assert.equal(i.newNames.length,0);assert.equal(intake.newCards,109);assert.equal(intake.reusedCards,263);
 for(const d of i.decks){assert.deepEqual(JSON.parse(JSON.stringify(M.DECKS[d.name].cards)),d.cards);assert.equal(d.cards.reduce((n,c)=>n+c.n,0),100);assert.ok(M.DECK_META[d.name]);assert.ok(M.DECK_GUIDE_ROUTES[M.DECK_GUIDES[d.name].route]);assert.ok(fs.existsSync(M.CARD_ART_PATHS[d.commander]));}
 for(const n of intake.newNames){assert.ok(M.SCRIPTS[n],n);assert.ok(!M.DEFS[n].autoScripted&&!M.DEFS[n].simplified,n);assert.ok(M.CARD_CATALOG[n].deckImportEligible,n);}
 assert.deepEqual(Array.from(M.defaultCommanders(M.DECKS['Timey-Wimey'])),['The Tenth Doctor','Rose Tyler']);
 assert.deepEqual(Array.from(M.DEFS['The Tenth Doctor'].subtypes),['Time Lord','Doctor']);
 assert.equal(Object.keys(M.DECKS).length,140);assert.equal(M.CATALOG_SUMMARY.importableCards,21385);
});
test('Anikthea exiles a real graveyard enchantment and creates a black Zombie copy retaining its ability',async()=>{
 const f=setup(),a=card(f,'Glorious Anthem','graveyard');await play(f,'Anikthea, Hand of Erebos');const copy=f.game.bf().find(c=>c.isToken&&c.name===a.name);assert.equal(a.zone,'exile');assert.ok(copy.is('Enchantment')&&copy.is('Creature')&&copy.hasSub('Zombie'));assert.equal(copy.power,4);assert.equal(copy.toughness,4);assert.ok(copy.kw('menace'));assert.deepEqual(Array.from(copy.colors),['B']);assertRecalculationStable(f.game);
});
test('Narci triggers for a resolved final Saga chapter and its later sacrifice',async()=>{
 const f=setup();card(f,'Narci, Fable Singer');const s=await play(f,'Battle for Bretagard'),life=f.b.life,hand=f.a.hand.length;f.game.addCounters(s,'lore',2,false,f.a);await settle(f.game);assert.equal(s.zone,'graveyard');assert.equal(f.b.life,life-3);assert.equal(f.a.hand.length,hand+1);
});
test('Zhulodok grants exactly two separate cascades to a qualifying paid hand spell',async()=>{
 const f=setup();card(f,'Zhulodok, Void Gorger');const c=card(f,'Bane of Bala Ged','hand');fuel(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),true);assert.equal(f.game.stack.filter(s=>/: Cascade/.test(s.name)).length,2);await settle(f.game);assert.equal(c.zone,'battlefield');
 const small=card(f,'Sol Ring','hand');assert.equal(await f.game.castSpell(f.a,small,{from:'hand'}),true);assert.equal(f.game.stack.filter(s=>/: Cascade/.test(s.name)).length,0);await settle(f.game);
});
test('Darksteel Monolith uses its free permission once per turn and rejects stale source offers',async()=>{
 const f=setup(),m=card(f,'Darksteel Monolith'),c=card(f,'Bane of Bala Ged','hand');const e=await castOffer(f,c,'monolith');assert.equal(c.castMeta.manaSpent,0);assert.ok(!f.game.castableList(f.a).some(e=>e.alt?.cwwKind==='monolith'));f.game.turnNo++;const next=card(f,'Sol Ring','hand'),offer=f.game.castableList(f.a).find(e=>e.card===next&&e.alt?.cwwKind==='monolith');await f.game.move(m,'graveyard');assert.equal(await f.game.castSpell(f.a,next,{from:'hand',alt:offer.alt}),false);assert.ok(e);
});
test('As Foretold casts a spell with no mana cost without inventing a normal cast route',async()=>{
 const f=setup(),a=card(f,'As Foretold'),c=card(f,'Ancestral Vision','hand');f.game.addCounters(a,'time',2);const hand=f.a.hand.length;await castOffer(f,c,'asForetold');assert.equal(c.zone,'graveyard');assert.equal(f.a.hand.length,hand+2);assert.equal(a.meta.cwwFreeTurn,f.game.turnNo);
});
test('Demon of Fate’s Design pays life for an enchantment and sacrifices the selected enchantment as a cost',async()=>{
 const f=setup(),d=card(f,"Demon of Fate's Design"),c=card(f,'Glorious Anthem','hand'),life=f.a.life;await castOffer(f,c,'demon');assert.equal(f.a.life,life-3);const power=d.power;await activate(f,d);assert.equal(c.zone,'graveyard');assert.equal(d.power,power-1+3);
});
test('Calamity cannot be cast without its reveal cost; actual revealed mana value controls exile',async()=>{
 const f=setup(),spell=card(f,'Calamity of the Titans','hand');fuel(f.a);assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),false);const revealed=card(f,'Bane of Bala Ged','hand'),small=body(f,f.b),big=card(f,'It That Betrays','battlefield',f.b);await play(f,spell.name,{card:spell});assert.equal(revealed.zone,'hand');assert.equal(small.zone,'exile');assert.equal(big.zone,'battlefield');
});
test('Flayer’s cast trigger steals a creature and grants real 10/10, haste, trample and annihilator',async()=>{
 const f=setup(),b=body(f,f.b);await play(f,'Flayer of Loyalties');assert.equal(b.ctrl.idx,f.a.idx);assert.equal(b.power,10);assert.equal(b.toughness,10);assert.ok(b.kw('haste')&&b.kw('trample'));assert.ok(b.cur.extraTriggers.some(t=>/Annihilator 2/.test(t.desc)));f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();assert.equal(b.ctrl.idx,f.b.idx);assert.equal(b.power,2);
});
test('Urza lands produce their printed colorless amounts only with the full three-land set',()=>{
 const f=setup(),mine=card(f,"Urza's Mine");assert.equal(mine.def.mana.produce(f.game,mine,f.a)[0].C,1);card(f,"Urza's Power Plant");const tower=card(f,"Urza's Tower");assert.equal(mine.def.mana.produce(f.game,mine,f.a)[0].C,2);assert.equal(tower.def.mana.produce(f.game,tower,f.a)[0].C,3);
});
test('Ominous Cemetery pays mana and exiles itself before shuffling the creature',async()=>{
 const f=setup(),land=card(f,'Ominous Cemetery'),b=body(f,f.b);await activate(f,land);assert.equal(land.zone,'exile');assert.equal(b.zone,'library');assert.ok(f.b.library.includes(b));
});
test('suspend is a paid special action; time travel removes actual counters and queues the free cast',async()=>{
 const f=setup(),c=card(f,'Dinosaurs on a Spaceship','hand');fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.suspend);assert.ok(e);assert.equal(await f.game.activateAbility(f.a,e),true);assert.equal(c.zone,'exile');assert.equal(c.counters.time,4);assert.equal(c.meta.suspended,4);await M.CWW.timeTravel({...ctx(f),src:c},4);assert.ok(f.game.pendingTriggers.length);await settle(f.game);assert.equal(c.zone,'battlefield');assert.ok(c.kw('haste'));assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Dinosaur')).length,4);
});
test('The Tenth Doctor triggers when another creature attacks; Rose counts suspended cards and permanents',async()=>{
 const f=setup(),d=card(f,'The Tenth Doctor'),rose=card(f,'Rose Tyler'),fire=await play(f,'Rotating Fireplace'),future=card(f,'Sol Ring','library'),b=body(f);await event(f,'attackersDeclared',{player:f.a,attackers:[b]});assert.equal(future.zone,'exile');assert.equal(future.counters.time,3);await event(f,'attacks',{player:f.a,card:rose,target:f.b});assert.equal(rose.counters.time,2);assert.equal(rose.power,4);await M.CWW.timeTravel({g:f.game,you:f.a,src:d});assert.equal(future.counters.time,2);assert.equal(fire.counters.time,2);assert.equal(rose.counters.time,3);
});
test('Rory is exiled from its own cast trigger, then returns through suspend and investigates',async()=>{
 const f=setup(),r=await play(f,'Rory Williams');assert.equal(r.zone,'exile');assert.equal(r.counters.time,3);assert.equal(f.game.bf().filter(c=>c.hasSub('Clue')).length,1);M.CWW.removeTime({g:f.game,you:f.a,src:r},r,3);await settle(f.game);assert.equal(r.zone,'battlefield');assert.ok(r.kw('haste'));
});
test('The Face of Boe pays the printed suspend cost and directly casts the card from hand',async()=>{
 const f=setup(),boe=card(f,'The Face of Boe'),d=card(f,'Star Whale','hand');await activate(f,boe);assert.equal(d.zone,'battlefield');assert.equal(d.castMeta.manaSpent,2);assert.equal(d.kw('haste'),false);
});
test('Out of Time holds phased creatures across untap steps and returns them when it leaves',async()=>{
 const f=setup(),b=body(f),enemy=body(f,f.b),out=await play(f,'Out of Time');assert.equal(out.counters.time,2);assert.equal(b.phasedOut,true);assert.equal(enemy.phasedOut,true);f.game.phaseInFor(f.a);assert.equal(b.phasedOut,true);await f.game.move(out,'graveyard');assert.equal(b.phasedOut,false);assert.equal(enemy.phasedOut,false);assertGameStateInvariants(f.game);
});
test('The Pandorica returns its phased target when it untaps, even without leaving',async()=>{
 const f=setup(),p=card(f,'The Pandorica'),b=body(f,f.b);choose(f,(_,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:undefined);await activate(f,p);assert.equal(b.phasedOut,true);assert.equal(p.tapped,true);f.game.untap(p);assert.equal(b.phasedOut,false);
});
test('Everybody Lives prevents life payments, life loss, losses and opposing player targeting for the turn',async()=>{
 const f=setup(),b=body(f);await play(f,'Everybody Lives!');assert.ok(b.kw('hexproof')&&b.kw('indestructible'));const life=f.a.life;await f.game.loseLife(f.a,8);assert.equal(f.a.life,life);assert.equal(f.game.canPayLife(f.a,1),false);assert.equal(f.game.canLoseGame(f.a),false);assert.equal(f.game.canWinGame(f.a),false);assert.equal(f.game.legalTargets(M.T.player(),b,f.a).includes(f.b),false);f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');assert.equal(f.game.canLoseGame(f.a),true);
});
test('Clockspinning can add or remove a chosen counter and buyback returns it to hand',async()=>{
 const f=setup(),b=body(f);f.game.addCounters(b,'+1/+1',2);const c=card(f,'Clockspinning','hand');choose(f,(_,q)=>q.type==='chooseTargets'?[b]:q.type==='chooseOption'&&q.options.some(o=>o.key==='add')?'add':undefined);fuel(f.a);const e=f.game.castableList(f.a).find(e=>e.card===c);assert.ok(e);assert.equal(await f.game.castSpell(f.a,c,{from:'hand',alt:e.alt}),true);await settle(f.game);assert.equal(b.counters['+1/+1'],3);assert.equal(c.zone,'hand');
});
test('Daybreak Coronet requires another Aura and is removed if that Aura leaves',async()=>{
 const f=setup(),b=body(f),a=card(f,'Rancor');await f.game.attach(a,b);const d=await play(f,'Daybreak Coronet');assert.equal(d.attachedTo,b.iid);assert.ok(b.kw('lifelink'));await f.game.move(a,'hand');await f.game.checkSBA();assert.equal(d.zone,'graveyard');
});
test('Umbra Mystic grants armor to attached Auras and preserves a creature from destruction',async()=>{
 const f=setup(),b=body(f),a=card(f,'Pacifism');await f.game.attach(a,b);card(f,'Umbra Mystic');await f.game.destroy(b);await settle(f.game);assert.equal(b.zone,'battlefield');assert.equal(a.zone,'graveyard');
});
test('Siona creates a token when your Aura becomes attached to your creature',async()=>{
 const f=setup();card(f,'Siona, Captain of the Pyleas');const b=body(f),a=card(f,'Rancor');await f.game.attach(a,b);await settle(f.game);assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Human')&&c.hasSub('Soldier')).length,1);
});
test('Read ahead starts Love Song at chapter three without the skipped draws or Bird',async()=>{
 const f=setup(),b=body(f),hand=f.a.hand.length;choose(f,(_,q)=>q.type==='chooseOption'&&q.prompt?.includes('Read ahead')?'3':undefined);const s=await play(f,'Love Song of Night and Day');assert.equal(s.zone,'graveyard');assert.equal(b.counters['+1/+1'],1);assert.equal(f.a.hand.length,hand);assert.equal(f.game.creatures().filter(c=>c.hasSub('Bird')).length,0);
});
test('Picklock Prankster has flying/vigilance and its Adventure takes a card actually milled',async()=>{
 const f=setup(),spell=card(f,'Picklock Prankster','hand'),take=card(f,'Divination','library');fuel(f.a);const e=f.game.castableList(f.a).find(e=>e.card===spell&&e.alt?.adventure);assert.ok(e);assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt:e.alt}),true);await settle(f.game);assert.equal(take.zone,'hand');assert.equal(spell.zone,'exile');await play(f,spell.name,{card:spell,from:'exile'});assert.ok(spell.kw('flying')&&spell.kw('vigilance'));
});
