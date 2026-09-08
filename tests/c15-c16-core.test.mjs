import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target,tokens} from './helpers/c15-c16-fixtures.mjs';

for(const role of ['human','ai'])test(role+': Daxos experience survives its source and determines Spirit size',async()=>{
 const f=setup(role),d=await play(f,'Daxos the Returned');await play(f,'Phyrexian Arena');assert.equal(f.a.counters.experience,1);await activate(f,d);const t=tokens(f)[0];assert.equal(t.power,1);assert.ok(t.is('Enchantment'));await f.game.move(d,'hand');f.a.experienceCounters=4;f.game.recalc();assert.equal(t.power,4);assert.equal(f.a.counters.experience,4);
});
test('Mizzix counts spell mana value including X and reduces only the generic cost',async()=>{
 const f=setup();await play(f,'Mizzix of the Izmagnus');target(f,f.a);await play(f,"Blue Sun's Zenith");assert.equal(f.a.counters.experience,1);assert.equal(f.a.hand.length,3);const c=card(f,'Ancient Excavation','hand');assert.equal(f.game.spellCost(f.a,c).generic,1);assert.equal(f.game.spellCost(f.a,c).pips.length,2);await play(f,c.name,{card:c});assert.equal(f.a.counters.experience,2);
});
test('Kalemne grows from a five-mana creature and Ezuri counts low-power entries before combat',async()=>{
 const f=setup(),k=await play(f,'Kalemne, Disciple of Iroas');await play(f,'Serra Angel');assert.equal(f.a.experienceCounters,1);assert.equal(k.power,4);const e=await play(f,'Ezuri, Claw of Progress');assert.equal(f.a.experienceCounters,1);const b=await play(f,'Grizzly Bears');assert.equal(f.a.experienceCounters,2);target(f,k);await event(f,'beginCombat',{player:f.a});assert.equal(k.counters['+1/+1'],2);assert.equal(e.power,3);assert.equal(b.power,2);
});
test('Kynaios draws for its controller, offers every player a land and rewards only declining opponents',async()=>{
 const f=setup('human',3);await play(f,'Kynaios and Tiro of Meletis');const land=card(f,'Island','hand',f.b);f.decide=(p,q)=>p===f.a&&q.type==='chooseCards'?[]:undefined;await event(f,'endStep',{player:f.a});assert.equal(f.a.hand.length,1);assert.equal(land.zone,'battlefield');assert.equal(f.b.hand.length,0);for(const p of f.others.slice(1))assert.equal(p.hand.length,1);
});
test('Saskia damage is dealt by the original creature, is not combat damage, and may hit the same player twice',async()=>{
 const f=setup(),b=body(f);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a player')?String(f.b.idx):undefined;await play(f,'Saskia the Unyielding');await f.game.damagePlayer(b,f.b,2,{combat:true});await settle(f.game);assert.equal(f.b.life,36);
});
test('Zedruu donates a permanent with paid targets then counts ownership for life and draw',async()=>{
 const f=setup(),z=await play(f,'Zedruu the Greathearted'),b=body(f);target(f,f.b,b);await activate(f,z);assert.equal(b.ctrl,f.b);assert.equal(b.owner,f.a);await event(f,'upkeep',{player:f.a});assert.equal(f.a.life,41);assert.equal(f.a.hand.length,1);
});
test('Arbiter changes life via life gain; Corpsejack doubles counters; Karlov spends exactly six',async()=>{
 const f=setup(),k=await play(f,'Karlov of the Ghost Council');await play(f,'Corpsejack Menace');f.a.life=20;await play(f,'Arbiter of Knollridge');assert.equal(f.a.life,40);assert.equal(k.counters['+1/+1'],4);await f.game.gainLife(f.a,1);await settle(f.game);assert.equal(k.counters['+1/+1'],8);const b=body(f,f.b);target(f,b);await activate(f,k);assert.equal(k.counters['+1/+1'],2);assert.equal(b.zone,'exile');
});
test('The two Explorer mana creatures use opposing land types and Homeward Path returns owned creatures',async()=>{
 const f=setup();card(f,'Forest','battlefield',f.b);for(const name of ['Quirion Explorer','Sylvok Explorer']){const c=await play(f,name);c.sick=false;const s=f.game.manaSources(f.a).find(s=>s.card===c);assert.deepEqual(Array.from(s.produce,o=>Object.keys(o)[0]),['G']);f.a.pool.G=0;await f.game.activateManaSource(f.a,s,s.produce[0]);assert.equal(f.a.pool.G,1);}
 const b=body(f);M.C14.control(f.game,b,f.b,false);const h=card(f,'Homeward Path');await activate(f,h);assert.equal(b.ctrl,f.a);
});
test('Ancient Amphitheater and Murmuring Bosk reveal the exact subtype, then Bosk damages for off-color mana',async()=>{
 for(const[name,typeCard,untapped]of [['Ancient Amphitheater','Thundercloud Shaman',true],['Murmuring Bosk','Grizzly Bears',false]]){const f=setup();card(f,typeCard,'hand');const land=card(f,name,'hand');await f.game.move(land,'battlefield');assert.equal(!land.tapped,untapped);if(name==='Murmuring Bosk'){land.tapped=false;const s=f.game.manaSources(f.a).find(s=>s.card===land&&s.produce.some(o=>o.W));await f.game.activateManaSource(f.a,s,s.produce.find(o=>o.W));assert.equal(f.a.life,39);}}
});
test('Sandstone Oracle and Corpse Augur draw the measured difference and graveyard creature count',async()=>{
 const f=setup();card(f,'Island','hand',f.b);card(f,'Forest','hand',f.b);await play(f,'Sandstone Oracle');assert.equal(f.a.hand.length,2);const b=card(f,'Grizzly Bears','graveyard',f.b),a=await play(f,'Corpse Augur');target(f,f.b);await f.game.destroy(a);await settle(f.game);assert.equal(f.a.hand.length,3);assert.equal(f.a.life,39);assert.equal(b.zone,'graveyard');
});
test('Akroan Horse changes controller and creates Soldiers for each of that controller’s opponents',async()=>{
 const f=setup('human',3),h=await play(f,'Akroan Horse');assert.equal(h.ctrl,f.b);await event(f,'upkeep',{player:f.b});assert.equal(tokens(f,f.b).length,0);for(const p of [f.a,...f.others.slice(1)])assert.equal(tokens(f,p).length,1);
});
test('Howling Mine stops while tapped and Ludevic offers the actual active player an optional card',async()=>{
 const f=setup(),m=await play(f,'Howling Mine');await event(f,'drawStep',{player:f.b});assert.equal(f.b.hand.length,1);m.tapped=true;await event(f,'drawStep',{player:f.b});assert.equal(f.b.hand.length,1);await play(f,'Ludevic, Necro-Alchemist');await f.game.loseLife(f.b,1);await event(f,'endStep',{player:f.b});assert.equal(f.b.hand.length,2);
});
test('Evolutionary Escalation, Hamletback and Thundercloud use independent targets and entry power',async()=>{
 const f=setup(),b=body(f,f.b),g=await play(f,'Hamletback Goliath');await play(f,'Evolutionary Escalation');target(f,b,g);await event(f,'upkeep',{player:f.a});assert.equal(g.counters['+1/+1'],3);assert.equal(b.counters['+1/+1'],3);await play(f,'Thundercloud Shaman');assert.equal(g.counters['+1/+1'],7);assert.equal(b.damage,2);
});
test('Eldrazi Monument grants protection and sacrifices itself without an available creature',async()=>{
 const f=setup(),b=body(f),e=await play(f,'Eldrazi Monument');assert.equal(b.power,3);assert.ok(b.kw('flying')&&b.kw('indestructible'));await event(f,'upkeep',{player:f.a});assert.equal(b.zone,'graveyard');await event(f,'upkeep',{player:f.a});assert.equal(e.zone,'graveyard');
});
test('Beacon of Unrest reanimates across owners and shuffles its physical card',async()=>{
 const f=setup(),b=card(f,'Grizzly Bears','graveyard',f.b);target(f,b);const c=await play(f,'Beacon of Unrest');assert.equal(b.zone,'battlefield');assert.equal(b.ctrl,f.a);assert.equal(c.zone,'library');
});
test('Artifact Mutation creates tokens even if indestructible prevents destruction; Gild makes functional Gold',async()=>{
 const f=setup(),a=card(f,'Darksteel Ingot','battlefield',f.b);target(f,a);await play(f,'Artifact Mutation');assert.equal(a.zone,'battlefield');assert.equal(tokens(f).length,3);const b=body(f,f.b);target(f,b);await play(f,'Gild');assert.equal(b.zone,'exile');const gold=f.game.bf().find(c=>c.hasSub('Gold'));f.a.pool.G=0;const s=f.game.manaSources(f.a).find(s=>s.card===gold);await f.game.activateManaSource(f.a,s,{G:1});assert.equal(f.a.pool.G,1);assert.notEqual(gold.zone,'battlefield');
});
test('Crackling Doom forces the greatest-power sacrifice and Dread Summons counts actually milled creatures',async()=>{
 const f=setup(),small=body(f,f.b),big=card(f,'Serra Angel','battlefield',f.b);await play(f,'Crackling Doom');assert.equal(f.b.life,38);assert.equal(big.zone,'graveyard');assert.equal(small.zone,'battlefield');card(f,'Grizzly Bears','library');card(f,'Serra Angel','library',f.b);await play(f,'Dread Summons');assert.equal(tokens(f).length,2);assert.ok(tokens(f).every(c=>c.tapped));
});
test('Undaunted reduces for living opponents and sweeps the printed permanent classes',async()=>{
 for(const[name,destination]of [['Coastal Breach','hand'],['Sublime Exhalation','graveyard'],["In Garruk's Wake",'graveyard']]){const f=setup('human',3),b=body(f,f.b),mine=body(f),land=card(f,'Forest','battlefield',f.b),c=card(f,name,'hand');if(name!=="In Garruk's Wake")assert.equal(f.game.spellCost(f.a,c).generic,3);await play(f,name,{card:c});assert.equal(b.zone,destination);assert.equal(land.zone,'battlefield');if(name==="In Garruk's Wake")assert.equal(mine.zone,'battlefield');}
});
test('Duneblast chooses without targeting and Grave Upheaval returns the opponent’s card with haste',async()=>{
 const f=setup(),a=body(f),b=body(f,f.b);f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('Duneblast')?[a]:undefined;await play(f,'Duneblast');assert.equal(a.zone,'battlefield');assert.equal(b.zone,'graveyard');target(f,b);await play(f,'Grave Upheaval');assert.equal(b.ctrl,f.a);assert.ok(b.kw('haste'));
});
test('Sleep taps one player’s board; Reins of Power exchanges controller until cleanup',async()=>{
 const f=setup(),a=body(f),b=body(f,f.b);target(f,f.b);await play(f,'Sleep');assert.ok(b.tapped&&b.meta.noUntapOnce);await play(f,'Reins of Power');assert.equal(a.ctrl,f.b);assert.equal(b.ctrl,f.a);assert.ok(!b.tapped&&b.kw('haste'));f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();assert.equal(a.ctrl,f.a);assert.equal(b.ctrl,f.b);
});
