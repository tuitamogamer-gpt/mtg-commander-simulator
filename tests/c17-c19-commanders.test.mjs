import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target,tokens} from './helpers/c17-c19-fixtures.mjs';

for(const role of ['human','ai']){
 test(role+': Edgar creates a Vampire from command, does not trigger for himself, and counters attacking Vampires',async()=>{
  const f=setup(role),e=card(f,'Edgar Markov','command');e.commander=true;
  await play(f,'Vampire Nighthawk');assert.equal(tokens(f).length,1);assert.equal(tokens(f)[0].power,1);assert.deepEqual(Array.from(tokens(f)[0].colors),['B']);
  await play(f,e.name,{card:e});assert.equal(tokens(f).length,1);await event(f,'attacks',{card:e,player:f.a});assert.equal(e.counters['+1/+1'],1);assert.equal(tokens(f)[0].power,2);
 });
 test(role+': Arahbo buffs another Cat from command and pays to double its current power with trample',async()=>{
  const f=setup(role),a=card(f,'Arahbo, Roar of the World','command');a.commander=true;const c=card(f,'Leonin Relic-Warder');
  await event(f,'beginCombat',{player:f.a});assert.equal(c.power,5);assert.equal(a.power,5);
  await play(f,a.name,{card:a});fuel(f.a);const before=mana(f.a);await event(f,'attacks',{card:c,player:f.a});assert.equal(c.power,10);assert.ok(c.kw('trample'));assert.equal(before-mana(f.a),3);
 });
 test(role+': Ur-Dragon reduces other Dragons from command and battlefield, draws for each attacker, and puts a permanent in play',async()=>{
  const f=setup(role),u=card(f,'The Ur-Dragon','command'),d=card(f,'Thundermaw Hellkite','hand');u.commander=true;
  assert.equal(f.game.spellCost(f.a,d).generic,2);assert.equal(f.game.spellCost(f.a,u,{from:'command'}).generic,4);
  await play(f,u.name,{card:u});assert.equal(f.game.spellCost(f.a,d).generic,2);await play(f,d.name,{card:d});
  const before=f.a.library.length;await event(f,'attackersDeclared',{player:f.a,attackers:[u,d]});assert.equal(f.a.library.length,before-2);assert.equal(f.a.hand.length,1);assert.equal(f.game.lands(f.a).length,1);
 });
 test(role+': Inalla pays one mana for a hasty copy from command and exiles the copy at the next end step',async()=>{
  const f=setup(role),i=card(f,'Inalla, Archmage Ritualist','command');i.commander=true;fuel(f.a);const w=await play(f,'Dualcaster Mage');
  const copies=tokens(f);assert.equal(copies.length,1);assert.equal(copies[0].name,w.name);assert.ok(copies[0].kw('haste'));assert.equal(f.game.pendingTriggers.length,0);
  await event(f,'endStep',{player:f.b});assert.notEqual(copies[0].zone,'battlefield');assert.equal(w.zone,'battlefield');
 });
 test(role+': Inalla taps exactly five Wizards, including summoning-sick Wizards, as an upfront cost',async()=>{
  const f=setup(role),i=card(f,'Inalla, Archmage Ritualist');const ws=Array.from({length:4},()=>card(f,'Dualcaster Mage'));for(const w of [i,...ws])w.sick=true;target(f,f.b);
  await activate(f,i);assert.equal(f.b.life,33);assert.ok([i,...ws].every(w=>w.tapped));assert.ok(!f.game.activatableList(f.a).some(e=>e.card===i));
 });
 test(role+': Anje discards for a paid tap activation, madness triggers untap separately on the Stack',async()=>{
  const f=setup(role),a=await play(f,'Anje Falkenrath');card(f,'Fiery Temper','hand');f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Cast Fiery Temper')?'no':undefined;
  await activate(f,a);assert.equal(a.tapped,false);assert.equal(f.a.hand.length,1);assert.equal(f.a.graveyard[0].name,'Fiery Temper');
 });
 test(role+': Ghired creates a Rhino and populates another one tapped and attacking',async()=>{
  const f=setup(role),g=await play(f,'Ghired, Conclave Exile');const first=tokens(f)[0];assert.equal(first.power,4);assert.ok(first.kw('trample'));g.attacking=f.b;f.game.phase='combat';f.game.combat={attackers:[g],blockers:[]};
  await event(f,'attacks',{player:f.a,card:g});assert.equal(tokens(f).length,2);assert.ok(tokens(f)[1].tapped);assert.ok(tokens(f)[1].attacking);assert.equal(first.tapped,false);
 });
 test(role+': Saheeli loyalty creates an artifact and consumes next-spell affinity once',async()=>{
  const f=setup(role),s=await play(f,'Saheeli, the Gifted');await activate(f,s,0);assert.ok(tokens(f)[0].is('Artifact'));assert.equal(s.counters.loyalty,5);
  s.meta.loyaltyUsedTurn=-1;f.game.turnNo++;await activate(f,s,1);const c=card(f,'Grizzly Bears','hand');assert.equal(f.game.spellCost(f.a,c).generic,0);await play(f,c.name,{card:c});assert.equal(f.game.spellCost(f.a,card(f,'Grizzly Bears','hand')).generic,1);
 });
 test(role+': Windgrace discards a land for two cards then reanimates two lands with loyalty payment',async()=>{
  const f=setup(role),w=await play(f,'Lord Windgrace'),l=card(f,'Forest','hand');await activate(f,w,0);assert.equal(l.zone,'graveyard');assert.equal(f.a.hand.length,2);
  const l2=card(f,'Island','graveyard');w.meta.loyaltyUsedTurn=-1;f.game.turnNo++;target(f,l,l2);await activate(f,w,1);assert.equal(l.zone,'battlefield');assert.equal(l2.zone,'battlefield');assert.equal(w.counters.loyalty,4);
 });
 test(role+': Aminatou puts a card on top then blinks a permanent owned by her controller',async()=>{
  const f=setup(role),a=await play(f,'Aminatou, the Fateshifter');await activate(f,a,0);assert.equal(f.a.hand.length,0);assert.equal(f.a.library.length,30);
  const b=body(f),version=b.zoneVersion;M.C14.control(f.game,b,f.b,false);f.game.turnNo++;target(f,b);await activate(f,a,1);assert.equal(b.ctrl,f.a);assert.ok(b.zoneVersion>version);assert.equal(b.zone,'battlefield');
 });
}
test('Eminence stops when its source changes zones, even if it reaches another permitted zone',async()=>{
 const f=setup(),e=card(f,'Edgar Markov'),v=card(f,'Vampire Nighthawk','hand');await f.game.emit('cast',{player:f.a,card:v});assert.equal(f.game.pendingTriggers.length,1);await f.game.move(e,'command');await settle(f.game);assert.equal(tokens(f).length,0);
 await f.game.emit('cast',{player:f.a,card:v});await settle(f.game);assert.equal(tokens(f).length,1);
});
test('Arahbo has no eminence from the graveyard and never targets itself',async()=>{
 const f=setup(),a=card(f,'Arahbo, Roar of the World','graveyard'),c=card(f,'Leonin Relic-Warder');await event(f,'beginCombat',{player:f.a});assert.equal(c.power,2);await f.game.move(a,'battlefield');await f.game.move(c,'graveyard');await event(f,'beginCombat',{player:f.a});assert.equal(a.power,5);
});
test('Windgrace draws even with an empty hand, and Saheeli copies expire without the planeswalker',async()=>{
 const f=setup(),w=card(f,'Lord Windgrace');await activate(f,w,0);assert.equal(f.a.hand.length,1);const s=card(f,'Saheeli, the Gifted'),r=card(f,'Solemn Simulacrum');s.counters.loyalty=7;
 await activate(f,s,2);assert.equal(s.zone,'graveyard');const cp=tokens(f).find(c=>c.name===r.name);assert.ok(cp&&cp.kw('haste'));await event(f,'endStep',{player:f.b});assert.notEqual(cp.zone,'battlefield');
});
