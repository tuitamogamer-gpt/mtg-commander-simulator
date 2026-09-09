import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,fuel,mana} from './helpers/voc-ncc-fixtures.mjs';

for(const role of ['human','ai']){
 test(role+': paid Anhelo casualty copies only the first instant or sorcery of each turn',async()=>{
  const f=setup(role),a=await play(f,'Anhelo, the Painter'),victim=body(f);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('Casualty')?'yes':q.type==='chooseCards'&&q.prompt.includes('Casualty')?[victim]:undefined;
  const h=f.a.hand.length;await play(f,'Opt');assert.equal(victim.zone,'graveyard');assert.equal(f.a.hand.length,h+2);
  const second=body(f);await play(f,'Opt');assert.equal(second.zone,'battlefield');
 });
 test(role+': Henzie grants a paid blitz offer, haste, death draw and end-step sacrifice',async()=>{
  const f=setup(role),h=await play(f,'Henzie "Toolbox" Torre'),c=card(f,'Colossal Dreadmaw','hand');fuel(f.a);const offer=f.game.castableList(f.a).find(r=>r.card===c&&r.alt?.vnBlitz);assert.ok(offer);const before=mana(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:'hand',alt:offer.alt}),true);await settle(f.game);assert.equal(before-mana(f.a),6);assert.ok(c.kw('haste'));const n=f.a.hand.length;await event(f,'endStep',{player:f.a});assert.equal(c.zone,'graveyard');assert.equal(f.a.hand.length,n+1);
 });
 test(role+': Henzie can blitz a creature from a permitted exile zone and rejects expired permissions',async()=>{
  const f=setup(role);await play(f,'Henzie "Toolbox" Torre');const c=card(f,'Colossal Dreadmaw','exile');fuel(f.a);c.meta.playableBy=f.a;c.meta.playableUntil=f.game.turnNo;let offer=f.game.castableList(f.a).find(r=>r.card===c&&r.alt?.vnBlitz);assert.ok(offer);c.meta.playableUntil=f.game.turnNo-1;assert.equal(await f.game.castSpell(f.a,c,{from:'exile',alt:offer.alt}),false);c.meta.playableUntil=f.game.turnNo;offer=f.game.castableList(f.a).find(r=>r.card===c&&r.alt?.vnBlitz);const before=mana(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:'exile',alt:offer.alt}),true);await settle(f.game);assert.equal(before-mana(f.a),6);assert.ok(c.kw('haste'));await event(f,'endStep',{player:f.a});assert.equal(c.zone,'graveyard');
 });
 test(role+': Strefan counts players, sacrifices two Blood and puts a Vampire into combat',async()=>{
  const f=setup(role),s=await play(f,'Strefan, Maurer Progenitor');await f.game.loseLife(f.a,1);await f.game.loseLife(f.b,3);await event(f,'endStep',{player:f.a});assert.equal(f.game.bf().filter(c=>c.hasSub('Blood')).length,2);const v=card(f,'Vampire Nighthawk','hand');f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':q.type==='chooseCards'&&q.prompt.includes('Strefan: put')?[v]:undefined;s.attacking=f.b;f.game.phase='combat';f.game.combat={attackers:[s],blockers:[]};await event(f,'attacks',{card:s,player:f.a});assert.equal(v.zone,'battlefield');assert.ok(v.tapped&&v.attacking&&v.kw('indestructible'));assert.equal(f.game.bf().filter(c=>c.hasSub('Blood')).length,0);
 });
 test(role+': Kamiz connives before comparing power for double strike',async()=>{
  const f=setup(role),k=await play(f,'Kamiz, Obscura Oculus'),a=body(f),b=body(f),discard=card(f,'Opt','hand');a.attacking=f.b;b.attacking=f.b;f.decide=(p,q)=>q.type==='chooseTargets'?[a]:q.type==='chooseCards'&&q.prompt.startsWith('Connive')?[discard]:q.type==='chooseCards'&&q.prompt.startsWith('Kamiz')?[b]:undefined;await event(f,'attackersDeclared',{player:f.a,attackers:[a,b]});assert.equal(a.power,3);assert.ok(a.cur.unblockable);assert.ok(b.kw('double strike'));
 });
 test(role+': Kitt Kanto creates a reflexive target after the two creatures are tapped',async()=>{
  const f=setup(role),k=await play(f,'Kitt Kanto, Mayhem Diva'),victim=body(f,f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':q.type==='chooseTargets'?[victim]:undefined;await event(f,'beginCombat',{player:f.b});assert.ok(k.tapped);assert.equal(victim.power,4);assert.ok(victim.kw('trample'));assert.ok(f.game.untilEffects.some(e=>e.kind==='goadCard'&&e.iid===victim.iid&&e.notPlayer===f.a));
 });
 test(role+': copied Spark Double keeps extra entry counters and removes legendary',async()=>{
  const f=setup(role),model=await play(f,'Dovin, Grand Arbiter');f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('copy model')?[model]:undefined;const c=await play(f,'Spark Double');assert.equal(c.counters.loyalty,4);assert.equal(c.def.super.includes('Legendary'),false);
 });
 test(role+': Imposter Mech copies abilities while remaining a noncreature Vehicle',async()=>{
  const f=setup(role),model=card(f,'Colossal Dreadmaw','battlefield',f.b);f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('copy model')?[model]:undefined;const c=await play(f,'Imposter Mech');assert.deepEqual(Array.from(c.cur.types),['Artifact']);assert.ok(c.hasSub('Vehicle'));assert.equal(f.game.vehicleCrewCost(c),3);assert.ok(c.kw('trample'));
 });
 test(role+': Haunting Imitation creates a flying 1/1 Spirit copy and returns with no creature reveal',async()=>{
  const f=setup(role);for(const p of f.game.players)card(f,'Forest','library',p);card(f,'Grizzly Bears','library');await play(f,'Haunting Imitation');const c=f.game.creatures(f.a).find(c=>c.isToken);assert.equal(c.power,1);assert.equal(c.toughness,1);assert.ok(c.hasSub('Spirit')&&c.kw('flying'));card(f,'Forest','library');const spell=await play(f,'Haunting Imitation');assert.equal(spell.zone,'hand');
 });
 test(role+': X-target spells select the announced number and Smoke tokens attach on entry',async()=>{
  const f=setup(role),a=body(f),b=body(f);f.decide=(p,q)=>q.type==='chooseTargets'?[a,b]:undefined;await play(f,"Smoke Spirits' Aid",{xVal:2});const tokens=f.game.bf().filter(c=>c.name==='Smoke Blessing');assert.equal(tokens.length,2);assert.equal(new Set(tokens.map(c=>c.attachedTo)).size,2);const life=f.a.life;await f.game.destroy(a);await settle(f.game);assert.equal(f.a.life,life-1);assert.equal(f.game.bf().filter(c=>c.hasSub('Treasure')).length,1);
 });
 test(role+': Waste Management pays kicker and exiles the chosen entire graveyard',async()=>{
  const f=setup(role);const a=card(f,'Grizzly Bears','graveyard',f.b),b=card(f,'Forest','graveyard',f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Kicker')?'yes':q.type==='chooseTargets'?[f.b]:undefined;const spell=await play(f,'Waste Management');assert.ok(spell.castMeta.kicked);assert.equal(spell.castMeta.manaSpent,7);assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');assert.equal(f.game.creatures(f.a).filter(c=>c.hasSub('Rogue')).length,1);
 });
 test(role+': Sinister Waltz chooses three targets, returns two and puts the third on the bottom',async()=>{
  const f=setup(role),cards=['Grizzly Bears','Colossal Dreadmaw','Vampire Nighthawk'].map(n=>card(f,n,'graveyard'));f.decide=(p,q)=>q.type==='chooseTargets'?cards:undefined;await play(f,'Sinister Waltz');assert.equal(cards.filter(c=>c.zone==='battlefield').length,2);assert.ok(cards.includes(f.a.library[0]));
 });
 test(role+': Brokers Confluence resolves three repeated proliferate modes',async()=>{
  const f=setup(role),c=body(f);f.game.addCounters(c,'+1/+1',1);f.decide=(p,q)=>q.type==='chooseMulti'?['0','0','0']:q.type==='chooseCards'&&q.from.includes(c)?[c]:undefined;await play(f,'Brokers Confluence');assert.equal(c.counters['+1/+1'],4);
 });
 test(role+': Oskar immediately casts a discarded nonland card with its mana paid',async()=>{
  const f=setup(role),o=await play(f,'Oskar, Rubbish Reclaimer'),c=card(f,'Opt','hand');fuel(f.a);const before=mana(f.a);f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(c)?[c]:undefined;await f.game.discard(f.a,[c]);await settle(f.game);assert.equal(c.zone,'graveyard');assert.equal(before-mana(f.a),1);assert.ok(f.a.turnState.spellsCastList.some(r=>r.card===c&&r.so.from==='graveyard'));
 });
 test(role+': Squee and Yusri expose checked casting permissions that expire correctly',async()=>{
  const f=setup(role),c=card(f,'Squee, the Immortal','exile');fuel(f.a);const offer=f.game.castableList(f.a).find(r=>r.card===c);assert.ok(offer);assert.equal(await f.game.castSpell(f.a,c,{from:'exile',alt:offer.alt}),true);await settle(f.game);const spell=card(f,'Opt','hand');f.a.turnState.vnYusri=true;const free=f.game.castableList(f.a).find(r=>r.card===spell&&r.alt?.vnPermission==='yusri');assert.ok(free);delete f.a.turnState.vnYusri;assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',alt:free.alt}),false);assert.equal(spell.zone,'hand');
 });
 test(role+': Xander’s Pact offers only its life-paid route and debits life on casting',async()=>{
  const f=setup(role);const c=card(f,'Grizzly Bears','library',f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('Casualty')?'no':undefined;await play(f,"Xander's Pact");assert.equal(c.zone,'exile');const offers=f.game.castableList(f.a).filter(r=>r.card===c);assert.ok(offers.length);assert.ok(offers.every(r=>r.alt.vnPact));const life=f.a.life,before=mana(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:'exile',alt:offers[0].alt}),true);await settle(f.game);assert.equal(f.a.life,life-2);assert.equal(mana(f.a),before);assert.equal(c.ctrl,f.a);
 });
 test(role+': Rhythm gives actual entry choices and protects creature spells from counters',async()=>{
  const f=setup(role);await play(f,'Rhythm of the Wild');f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('riot')?'counter':undefined;const c=await play(f,'Grizzly Bears');assert.equal(c.counters['+1/+1'],1);const other=card(f,'Colossal Dreadmaw','hand');fuel(f.a);await f.game.castSpell(f.a,other,{from:'hand'});assert.equal(await f.game.counterStackObject(f.game.stack.at(-1)),false);await settle(f.game);assert.equal(other.zone,'battlefield');
 });
 test(role+': Archon prevents life loss but preserves combat damage, lifelink and monarchy change',async()=>{
  const f=setup(role);await play(f,'Archon of Coronation');const c=card(f,'Vampire Nighthawk','battlefield',f.b),life=f.a.life,enemy=f.b.life;await f.game.damagePlayer(c,f.a,2,{combat:true});assert.equal(f.a.life,life);assert.equal(f.b.life,enemy+2);assert.equal(f.game.monarch,f.b);
 });
 test(role+': Turfs targets each player’s land and transfers the defender’s contested land',async()=>{
  const f=setup(role),a=card(f,'Forest'),b=card(f,'Island','battlefield',f.b),h=body(f);await play(f,'Turf War');assert.equal(a.counters.contested,1);assert.equal(b.counters.contested,1);f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.startsWith('Turf War')?[b]:undefined;await event(f,'damageToPlayer',{src:h,player:f.b,n:2,combat:true});assert.equal(b.ctrl,f.a);assert.equal(b.tapped,false);
 });
}
