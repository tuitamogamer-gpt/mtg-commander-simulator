import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,fuel,mana} from './helpers/c21-fixtures.mjs';

for(const role of ['human','ai']){
 test(role+': radiation mills its current counters and removes only nonlands',async()=>{
  const f=setup(role);card(f,'Grizzly Bears','library');card(f,'Sol Ring','library');f.a.counters.rad=3;
  await event(f,'precombatMain',{player:f.a});
  assert.equal(f.a.graveyard.length,3);assert.equal(f.a.life,38);assert.equal(f.a.counters.rad,1);
 });
 test(role+': Strong replaces radiation life loss with gain',async()=>{
  const f=setup(role);card(f,'Strong, the Brutish Thespian');card(f,'Grizzly Bears','library');f.a.counters.rad=1;
  await event(f,'precombatMain',{player:f.a});assert.equal(f.a.life,41);assert.equal(f.a.counters.rad,0);
 });
 test(role+': Dogmeat recovers equipment and creates Junk for equipped attackers',async()=>{
  const f=setup(role);const e=card(f,'Sol Ring','library');const gear=card(f,'Strength Bobblehead','graveyard');
  const sword=card(f,'Swiftfoot Boots','graveyard');f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(sword)?[sword]:undefined;
  const dog=await play(f,'Dogmeat, Ever Loyal');assert.equal(sword.zone,'hand');assert.equal(e.zone,'graveyard');assert.equal(gear.zone,'graveyard');
  await f.game.putPermanentOntoBattlefield(sword,f.a);await f.game.attach(sword,dog);await event(f,'attacks',{card:dog,player:f.a,target:f.b});
  assert.equal(f.game.bf().filter(c=>c.hasSub('Junk')).length,1);
 });
 test(role+': Mothman grants radiation on entry and grows distinct creatures after milling',async()=>{
  const f=setup(role);const a=body(f),b=body(f);f.decide=(p,q)=>q.type==='chooseTargets'?[a,b].filter(c=>q.candidates.includes(c)).slice(0,q.max):undefined;
  const moth=await play(f,'The Wise Mothman');assert.equal(f.a.counters.rad,1);assert.equal(f.b.counters.rad,1);
  card(f,'Sol Ring','library',f.b);card(f,'Grizzly Bears','library',f.b);await f.game.mill(f.b,2);await settle(f.game);
  assert.equal(a.counters['+1/+1'],1);assert.equal(b.counters['+1/+1'],1);assert.equal(moth.counters['+1/+1']||0,0);
 });
 test(role+': Disa returns a milled Lhurgoyf but not one that dies',async()=>{
  const f=setup(role);card(f,'Disa the Restless');const goyf=card(f,'Barrowgoyf','library');card(f,'Sol Ring','graveyard');
  await f.game.mill(f.a,1);await settle(f.game);assert.equal(goyf.zone,'battlefield');
  await f.game.sacrifice(f.a,goyf);await settle(f.game);assert.equal(goyf.zone,'graveyard');assert.equal(goyf.power,2);
 });
 test(role+': Omo gives every land type only while its ability remains',async()=>{
  const f=setup(role);const land=card(f,'Forest'),bear=body(f);f.decide=(p,q)=>q.type==='chooseTargets'?[q.candidates.includes(land)?land:bear]:undefined;
  const omo=await play(f,'Omo, Queen of Vesuva');assert.equal(land.counters.everything,1);assert.ok(land.hasSub('Locus'));assert.ok(bear.hasSub('Eldrazi'));
  await f.game.move(omo,'exile');f.game.recalc();assert.equal(land.hasSub('Locus'),false);assert.equal(bear.hasSub('Eldrazi'),false);assert.equal(land.counters.everything,1);
 });
 test(role+': energy replacements stack and activated costs spend energy',async()=>{
  const f=setup(role);card(f,'Winding Constrictor');card(f,'Izzet Generatorium');card(f,'Aether Refinery');
  f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('replacement')?q.options.at(-1).key:undefined;
  await M.OracleV8Energy.gain(f.game,f.a,2);assert.ok([6,7,8].includes(f.a.counters.energy));
  const rod=card(f,'Whirler Virtuoso'),old=f.a.counters.energy;await activate(f,rod);assert.equal(f.a.counters.energy,old-3);assert.equal(f.game.bf().filter(c=>c.hasSub('Thopter')).length,1);
 });
 test(role+': Amped Raptor pays energy equal to the cast spell mana value',async()=>{
  const f=setup(role);const hit=card(f,'Sol Ring','library');f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(hit)?[hit]:undefined;
  await play(f,'Amped Raptor');assert.equal(hit.zone,'battlefield');assert.equal(f.a.counters.energy,1);
 });
 test(role+': Amped Raptor leaves unaffordable cards exiled',async()=>{
  const f=setup(role);const hit=card(f,'Archon of Cruelty','library');await play(f,'Amped Raptor');assert.equal(hit.zone,'exile');assert.equal(f.a.counters.energy,2);
 });
 test(role+': Nashi charges life and consumes the shared one-card permission',async()=>{
  const f=setup(role);const nashi=card(f,"Nashi, Moon Sage's Scion"),hit=card(f,'Sol Ring','library');
  await event(f,'damageToPlayer',{player:f.b,src:nashi,n:2,combat:true});
  const offer=f.game.castableList(f.a).find(e=>e.card===hit);assert.ok(offer);assert.equal(offer.alt.lifeCost,1);
  const life=f.a.life;assert.equal(await f.game.castSpell(f.a,hit,{from:hit.zone,alt:offer.alt}),true);await settle(f.game);assert.equal(f.a.life,life-1);
  assert.equal(f.game.playableLands(f.a).some(c=>c.zone==='exile'),false);
 });
 test(role+': squad exiles four graveyard cards for each Radrat copy',async()=>{
  const f=setup(role);for(let i=0;i<8;i++)card(f,'Forest','graveyard');f.decide=(p,q)=>q.type==='chooseX'&&q.prompt.includes('squad')?2:undefined;
  await play(f,'Ruthless Radrat');assert.equal(f.a.exile.length,8);assert.equal(f.game.bf().filter(c=>c.name==='Ruthless Radrat').length,3);
 });
 test(role+': Salvation unearth is unavailable at seven energy and pays eight',async()=>{
  const f=setup(role);const c=card(f,'Salvation Colossus','graveyard');f.a.counters.energy=7;
  assert.equal(f.game.activatableList(f.a).some(e=>e.card===c),false);f.a.counters.energy=8;
  await activate(f,c,e=>e.gyAbility);assert.equal(f.a.counters.energy,0);assert.equal(c.zone,'battlefield');assert.ok(c.kw('haste'));
  await event(f,'endStep',{player:f.a});assert.equal(c.zone,'exile');
 });
 test(role+': Young Deathclaws grants scavenge with printed mana and graveyard power',async()=>{
  const f=setup(role);card(f,'Young Deathclaws');const corpse=card(f,'Grizzly Bears','graveyard'),target=body(f);
  f.decide=(p,q)=>q.type==='chooseTargets'?[target]:undefined;await activate(f,corpse,e=>e.gyAbility);assert.equal(corpse.zone,'exile');assert.equal(target.counters['+1/+1'],2);
 });
 test(role+': Harold returns as an Aura, grants three mana and radiation, then resets',async()=>{
  const f=setup(role);const forest=card(f,'Forest'),harold=card(f,'Harold and Bob, First Numens');
  await f.game.sacrifice(f.a,harold);await settle(f.game);assert.equal(harold.zone,'battlefield');assert.ok(harold.hasSub('Aura'));assert.equal(harold.is('Creature'),false);assert.equal(harold.attachedTo,forest.iid);
  const s=f.game.manaSources(f.a).find(s=>s.card===forest&&s.produce.some(o=>o.G===3));assert.ok(s);assert.equal(await f.game.activateManaSource(f.a,s,{G:3}),true);assert.equal(f.a.counters.rad,2);
  await f.game.move(harold,'hand');assert.ok(harold.is('Creature'));assert.equal(harold.hasSub('Aura'),false);
 });
 test(role+': Med Kit modes cannot be chosen twice',async()=>{
  const f=setup(role);const kit=card(f,"Survivor's Med Kit");const hand=f.a.hand.length;
  f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('mod')?q.options[0].key:undefined;
  await activate(f,kit);assert.equal(f.a.hand.length,hand+1);f.game.untap(kit);await activate(f,kit);assert.equal(f.game.bf().filter(c=>c.hasSub('Food')).length,1);assert.deepEqual([...kit.meta.pomModes],[0,1]);
 });
 test(role+': Coram only plays cards milled this turn, once per card category',async()=>{
  const f=setup(role);card(f,'Coram, the Undertaker');const old=card(f,'Sol Ring','graveyard'),hit=card(f,'Sol Ring','library',f.b),land=card(f,'Forest','library',f.b);
  await f.game.mill(f.b,2);fuel(f.a);const offer=f.game.castableList(f.a).find(e=>e.card===hit);assert.ok(offer);assert.equal(f.game.castableList(f.a).some(e=>e.card===old),false);
  fuel(f.a);assert.equal(await f.game.castSpell(f.a,hit,{from:hit.zone,alt:offer.alt}),true);await settle(f.game);assert.equal(await f.game.playLand(f.a,land),true);
  const second=card(f,'Sol Ring','library',f.b);await f.game.mill(f.b,1);assert.equal(f.game.castableList(f.a).some(e=>e.card===second),false);
 });
 test(role+': entry counters are increased by Winding Constrictor',async()=>{
  const f=setup(role);card(f,'Winding Constrictor');const c=await play(f,'Bloatfly Swarm');assert.equal(c.counters['+1/+1'],6);
 });
 test(role+': Sunken Palace requires seven cards and copies the mana-funded spell',async()=>{
  const f=setup(role);const palace=card(f,'Sunken Palace');for(let i=0;i<7;i++)card(f,'Forest','graveyard');fuel(f.a);
  const s=f.game.manaSources(f.a).find(s=>s.card===palace&&s.m.pomCopyMana);assert.ok(s);
  assert.equal(await f.game.activateManaSource(f.a,s,{U:1}),true);assert.equal(f.a.exile.length,7);
  const spell=card(f,'Ponder','hand');const before=f.a.hand.length;assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),true);await settle(f.game);assert.equal(f.a.hand.length,before+1);
 });
}

test('forged energy payment permission cannot cast a card or consume resources',async()=>{
 const f=setup();const c=card(f,'Sol Ring','exile');fuel(f.a);f.a.counters.energy=20;const before=mana(f.a);
 assert.equal(await f.game.castSpell(f.a,c,{from:'exile',alt:{free:true,pomEnergyCost:0,oracleImmediateCast:998,speed:'instant'}}),false);
 assert.equal(c.zone,'exile');assert.equal(mana(f.a),before);assert.equal(f.a.counters.energy,20);
});
