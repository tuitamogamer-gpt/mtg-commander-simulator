import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M,setup,card,body,play,activate,event,settle,fuel} from './helpers/c21-fixtures.mjs';
import {buildIntake,sourceDir} from '../scripts/import-ltc-cmm-precons.mjs';
const library=(f,p=f.a,n=40)=>{for(let i=0;i<n;i++)card(f,'Forest','library',p);};
const allLibraries=f=>f.game.players.forEach(p=>library(f,p));
const yes=(f)=>{f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;};
const resetLoyalty=(f,c)=>{delete c.meta._loyUsed;delete c.meta.lcLoyaltyTurn;};
test('five exact original lists preserve 500 cards and both Food and Fellowship commanders',()=>{
 const i=buildIntake(M);assert.equal(i.decks.length,5);assert.equal(i.names.length,369);assert.equal(i.newNames.length,0);
 for(const d of i.decks){assert.deepEqual(JSON.parse(JSON.stringify(M.DECKS[d.name].cards)),d.cards);assert.equal(d.cards.reduce((n,c)=>n+c.n,0),100);assert.ok(M.DECK_META[d.name]);assert.ok(M.DECK_GUIDE_ROUTES[M.DECK_GUIDES[d.name].route],d.name);}
 assert.deepEqual(Array.from(M.defaultCommanders(M.DECKS['Food and Fellowship'])),['Frodo, Adventurous Hobbit','Sam, Loyal Attendant']);
 const intake=JSON.parse(fs.readFileSync(sourceDir+'/intake.json'));assert.equal(intake.newCards,76);assert.equal(intake.reusedCards,293);
 for(const n of intake.newNames){assert.ok(M.SCRIPTS[n],n);assert.equal(!!M.DEFS[n].autoScripted,false,n);assert.equal(!!M.DEFS[n].simplified,false,n);}
 assert.equal(Object.keys(M.DECKS).length,120);assert.equal(M.CATALOG_SUMMARY.decks,120);
});
test('Sam produces Food at combat and lowers its activation cost; Frodo uses life gain and Ring',async()=>{
 const f=setup();library(f);const sam=card(f,'Sam, Loyal Attendant'),frodo=card(f,'Frodo, Adventurous Hobbit');
 await event(f,'beginCombat',{player:f.a});const food=f.game.bf().find(c=>c.hasSub('Food'));assert.ok(food);
 assert.equal(f.game.abilityManaCost(f.a,food,'{2}',{ability:food.def.abilities[0]}).generic,1);
 await activate(f,food);assert.equal(f.a.turnState.lifeGained,3);f.a.ringLevel=1;M.E7.ringEmblem(f.game,f.a).level=1;
 f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt?.includes('Ring-bearer')?[frodo]:undefined;
 const hand=f.a.hand.length;await event(f,'attacks',{card:frodo,player:f.a,target:f.b});assert.equal(f.a.ringLevel,2);assert.equal(f.a.hand.length,hand+1);assert.ok(sam.zone==='battlefield');
});
test('Farmer Cotton makes X of each token, and Rosie triggers separately for each created token',async()=>{
 const f=setup(),b=body(f),r=card(f,'Rosie Cotton of South Lane');f.x=2;await play(f,'Farmer Cotton');assert.equal(f.game.bf().filter(c=>c.hasSub('Food')).length,2);assert.equal(f.game.creatures(f.a).filter(c=>c.hasSub('Halfling')&&c.isToken).length,2);assert.equal(b.counters['+1/+1'],4);assert.equal(r.counters['+1/+1']||0,0);
});
test('Banquet Guests has affinity and twice X counters; Food devour is an entry payment',async()=>{
 const f=setup();await f.game.makeTokens(M.TOKENS.food,f.a,{n:2});const b=card(f,'Banquet Guests','hand');assert.equal(f.game.spellCost(f.a,b).generic,0);f.x=3;await play(f,b.name,{card:b});assert.equal(b.counters['+1/+1'],6);await activate(f,b);assert.equal(b.kw('indestructible'),true);assert.equal(f.game.bf().filter(c=>c.hasSub('Food')).length,1);
 const h=await play(f,'Feasting Hobbit');assert.equal(h.counters['+1/+1'],3);const small=body(f,f.b);assert.equal(f.game.canBlock(small,h),false);
});
test('Prize Pig counts life gain, removes ribbon counters and untaps; Gwaihir creates its Bird',async()=>{
 const f=setup(),p=card(f,'Prize Pig'),e=card(f,'Gwaihir, Greatest of the Eagles');p.tapped=true;await f.game.gainLife(f.a,4,e);await settle(f.game);assert.equal(p.tapped,false);assert.equal(p.counters.ribbon||0,0);await event(f,'endStep',{player:f.b});assert.ok(f.game.creatures(f.a).some(c=>c.isToken&&c.hasSub('Bird')&&c.power===3));
});
test('Commodore Guff creates restricted mana Wizards and draws/deals for planeswalkers',async()=>{
 const f=setup();allLibraries(f);const g=await play(f,'Commodore Guff');await activate(f,g,0);const w=f.game.creatures(f.a).find(c=>c.hasSub('Wizard')&&c.isToken);assert.ok(w);w.sick=false;
 const walker=card(f,'Jace Beleren','hand'),bear=card(f,'Grizzly Bears','hand');for(const k in f.a.pool)f.a.pool[k]=0;
 assert.equal(f.game.manaSources(f.a,{card:walker}).some(s=>s.card===w),true);assert.equal(f.game.canPayMana(f.a,M.parseCost('{R}'),{card:bear}),false);
 resetLoyalty(f,g);const life=f.b.life,hand=f.a.hand.length;await activate(f,g,1);assert.equal(f.b.life,life-1);assert.equal(f.a.hand.length,hand+1);
});
test('Oath of Teferi permits two activations and Chain Veil adds one for existing planeswalkers',async()=>{
 const f=setup();allLibraries(f);card(f,'Oath of Teferi');const j=await play(f,'Jace Beleren');await activate(f,j,0);await activate(f,j,0);assert.equal(f.game.activatableList(f.a).some(e=>e.card===j&&e.ability?.loyalty!==undefined),false);
 const v=card(f,'The Chain Veil');await activate(f,v);assert.equal(f.game.canActivateLoyalty(j),true);await activate(f,j,0);assert.equal(f.game.canActivateLoyalty(j),false);
 await f.game.move(f.game.bf().find(c=>c.name==='Oath of Teferi'),'graveyard');assert.equal(f.game.canActivateLoyalty(j),false);
});
test('Oath of Gideon adds starting loyalty and Gatewatch Beacon moves an existing counter',async()=>{
 const f=setup();allLibraries(f);card(f,'Oath of Gideon');const b=await play(f,'Gatewatch Beacon');yes(f);const j=await play(f,'Jace Beleren');assert.equal(j.counters.loyalty,5);assert.equal(b.counters.loyalty,2);
});
test('Narset prevents additional opponent draws including repeated calls, while her controller can draw',async()=>{
 const f=setup();allLibraries(f);card(f,'Narset, Parter of Veils');await f.game.draw(f.b,3);assert.equal(f.b.hand.length,1);await f.game.draw(f.b,1);assert.equal(f.b.hand.length,1);await f.game.draw(f.a,3);assert.equal(f.a.hand.length,3);
});
test('Gravemother grants paid encore, and losing the source invalidates a stale grant',async()=>{
 const f=setup('human',2),s=card(f,'Sliver Gravemother'),b=card(f,'Brood Sliver','graveyard');fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===b&&e.gyAbility);assert.ok(e);assert.equal(e.gyAbilityOverride.cost,'{5}');await f.game.move(s,'graveyard');assert.equal(await f.game.activateAbility(f.a,e),false);assert.equal(b.zone,'graveyard');await f.game.putPermanentOntoBattlefield(s,f.a);await settle(f.game);fuel(f.a);const e2=f.game.activatableList(f.a).find(e=>e.card===b&&e.gyAbility);assert.equal(await f.game.activateAbility(f.a,e2),true);await settle(f.game);assert.equal(b.zone,'exile');assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.name===b.name).length,2);await event(f,'endStep',{player:f.a});assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.name===b.name).length,0);
});
test('Gravemother exempts legendary Slivers, and its departure restores the legend rule',async()=>{
 const f=setup(),s=card(f,'Sliver Gravemother');await f.game.makeTokens(s.def,f.a,{copyOf:s.def});await f.game.checkSBA();assert.equal(f.game.creatures(f.a).filter(c=>c.name===s.name).length,2);const all=f.game.creatures(f.a).filter(c=>c.name===s.name);for(const c of all)c.def={...c.def,lcGravemother:false};f.game.recalc();await f.game.checkSBA();assert.equal(f.game.creatures(f.a).filter(c=>c.name===s.name).length,1);
});
test('Sliver damage rewards its controller; Lazotep afflict and death amass are separate',async()=>{
 const f=setup();allLibraries(f);yes(f);card(f,'Brood Sliver');card(f,'Synapse Sliver');const l=card(f,'Lazotep Sliver');const enemy=card(f,'Predatory Sliver','battlefield',f.b);await f.game.damageAny(enemy,f.a,2,{combat:true});await settle(f.game);assert.equal(f.b.hand.length,1);assert.equal(f.game.creatures(f.b).filter(c=>c.isToken&&c.hasSub('Sliver')).length,1);l.attacking=f.b;const life=f.b.life;await event(f,'becomesBlocked',{attacker:l,blockers:[]});assert.equal(f.b.life,life-2);await f.game.destroy(l);await settle(f.game);assert.ok(f.game.creatures(f.a).some(c=>c.hasSub('Army')&&c.hasSub('Sliver')&&c.counters['+1/+1']===2));
});
test('Reanimate charges life for the original mana value and Too Greedily uses reanimated power',async()=>{
 const f=setup(),b=card(f,'Grizzly Bears','graveyard',f.b);const life=f.a.life;await play(f,'Reanimate');assert.equal(b.ctrl.idx,(f.a).idx);assert.equal(f.a.life,life-2);const big=card(f,'Sun Titan','graveyard',f.b),other=body(f,f.b);await play(f,'Too Greedily, Too Deep');assert.equal(big.ctrl.idx,(f.a).idx);assert.equal(other.zone,'graveyard');
});
test('Call for Aid steals only for this turn and disallows sacrificing or attacking the donor',async()=>{
 const f=setup(),b=body(f,f.b);await play(f,'Call for Aid');assert.equal(b.ctrl.idx,(f.a).idx);assert.equal(b.kw('haste'),true);assert.equal(f.game.canSacrifice(b),false);assert.equal(f.game.canAttackTarget(b,f.b),false);f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();assert.equal(b.ctrl.idx,(f.b).idx);assert.equal(f.game.canSacrifice(b),true);
});
test('Hithlain Rope cannot be sacrificed and passes to the right after drawing',async()=>{
 const f=setup('human',2);allLibraries(f);const r=card(f,'Hithlain Rope');assert.equal(f.game.canSacrifice(r),false);await activate(f,r,1);assert.equal(f.a.hand.length,1);assert.equal(r.ctrl.idx,(f.game.players[2]).idx);
});
test('Fealty follows the monarch and restores original control when the Aura leaves',async()=>{
 const f=setup(),b=body(f,f.b);const a=await play(f,'Fealty to the Realm');assert.equal(b.ctrl.idx,(f.a).idx);await f.game.becomeMonarch(f.b);assert.equal(b.ctrl.idx,(f.b).idx);await f.game.becomeMonarch(f.a);await f.game.move(a,'graveyard');f.game.recalc();assert.equal(b.ctrl.idx,(f.b).idx);
});
test('Teyo restricts attacking direction, and Onakke taxes attacks on planeswalkers',async()=>{
 const f=setup('human',3),b=body(f),t=await play(f,'Teyo, Geometric Tactician');f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='right')?'right':undefined;await activate(f,t,1);b.sick=false;assert.equal(f.game.canAttackTarget(b,f.b),false);assert.equal(f.game.canAttackTarget(b,f.game.players[3]),true);const o=card(f,'Onakke Oathkeeper','battlefield',f.b),j=card(f,'Jace Beleren','battlefield',f.b);assert.equal(f.game.c21AttackTax(b,j),1);assert.ok(o);
});
test('Ajani emblem prevents damage down to one; Chandra can exile a dying damaged creature',async()=>{
 const f=setup(),a=card(f,'Ajani Steadfast');a.counters.loyalty=9;await activate(f,a,2);const b=body(f,f.b),life=f.a.life;await f.game.damageAny(b,f.a,6);assert.equal(f.a.life,life-1);const c=card(f,'Chandra, Awakened Inferno');c.counters.loyalty=9;f.x=2;f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:undefined;await activate(f,c,2);assert.equal(b.zone,'exile');
});
