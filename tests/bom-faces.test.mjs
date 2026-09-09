import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,fuel} from './helpers/bom-fixtures.mjs';
const ctx=(f,c)=>({g:f.game,src:c,you:c.ctrl,sourceZoneVersion:c.zoneVersion});
const lands=(f,n=8)=>Array.from({length:n},()=>card(f,'Forest'));
const library=(f,n=20)=>{for(let i=0;i<n;i++)card(f,'Forest','library');};
const enterBack=async(f,name)=>{const c=card(f,name,'hand');await f.game.putPermanentOntoBattlefield(c,f.a,{oracleFace:'back'});await settle(f.game);return c;};

test('Arlinn Kord transforms through both loyalty abilities and retains the once-per-turn limit',async()=>{
 const f=setup();const a=await play(f,'Arlinn Kord');await activate(f,a,1);assert.equal(a.name,'Arlinn, Embraced by the Moon');assert.equal(f.game.activatableList(f.a).some(e=>e.card===a),false);f.game.turnNo++;f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(f.b)?[f.b]:undefined;await activate(f,a,1);assert.equal(a.name,'Arlinn Kord');assert.equal(a.counters.loyalty,2);
});
test('Garruk’s fight transforms him at two loyalty and the black Wolf has deathtouch',async()=>{
 const f=setup(),b=body(f,f.b);f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:undefined;const g=await play(f,'Garruk Relentless');await activate(f,g,0);assert.equal(g.name,'Garruk, the Veil-Cursed');assert.equal(g.counters.loyalty,1);f.game.turnNo++;await activate(f,g,0);assert.ok(f.game.creatures(f.a).some(c=>c.isToken&&c.power===1&&c.kw('deathtouch')));
});
test('Nicol Bolas discards, exiles and reenters as a planeswalker that draws two',async()=>{
 const f=setup();card(f,'Forest','hand',f.b);library(f);const n=await play(f,'Nicol Bolas, the Ravager');assert.equal(f.b.hand.length,0);const v=n.zoneVersion;await activate(f,n,0);assert.equal(n.name,'Nicol Bolas, the Arisen');assert.equal(n.zoneVersion,v+2);await activate(f,n,0);assert.equal(f.a.hand.length,2);assert.equal(n.counters.loyalty,9);
});
test('Nissa searches a basic Forest and transforms after a seventh land enters',async()=>{
 const f=setup();lands(f,6);card(f,'Forest','library');const n=await play(f,'Nissa, Vastwood Seer');assert.equal(f.a.hand.length,1);await f.game.playLand(f.a,f.a.hand[0]);await settle(f.game);assert.equal(n.name,'Nissa, Sage Animist');await activate(f,n,1);const ash=f.game.creatures(f.a).find(c=>c.name==='Ashaya, the Awoken World');assert.ok(ash&&ash.power===4&&ash.isToken);
});
test('Jace transforms after the loot reaches five graveyard cards and his spell permission exiles on resolution',async()=>{
 const f=setup();for(let i=0;i<4;i++)card(f,'Forest','graveyard');card(f,'Divination','library');const j=card(f,"Jace, Vryn's Prodigy");await activate(f,j);assert.equal(j.name,'Jace, Telepath Unbound');const d=f.a.graveyard.find(c=>c.name==='Divination');await activate(f,j,1);fuel(f.a);const offer=f.game.castableList(f.a).find(r=>r.card===d);assert.ok(offer);library(f);assert.equal(await f.game.castSpell(f.a,d,{from:'graveyard',alt:offer.alt}),true);await settle(f.game);assert.equal(d.zone,'exile');
});
test('Liliana transforms on another nontoken death and pays an exact negative loyalty cost for reanimation',async()=>{
 const f=setup(),l=card(f,'Liliana, Heretical Healer'),b=body(f);await f.game.destroy(b);await settle(f.game);assert.equal(l.name,'Liliana, Defiant Necromancer');assert.equal(l.counters.loyalty,3);await activate(f,l,e=>e.ability?.loyalty===-2);assert.equal(b.zone,'battlefield');assert.equal(l.counters.loyalty,1);
});
test('Chandra counts actual damage across activations and transforms only after her own ability resolves',async()=>{
 const f=setup(),c=card(f,'Chandra, Fire of Kaladesh');f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(f.b)?[f.b]:undefined;await f.game.damageAny(c,f.b,2);await activate(f,c);assert.equal(c.name,'Chandra, Roaring Flame');assert.equal(c.counters.loyalty,4);await activate(f,c,0);assert.equal(f.b.life,35);
});
test('Kytheon tracks the combat in which three creatures attacked and returns as Gideon',async()=>{
 const f=setup(),k=card(f,'Kytheon, Hero of Akros'),a=body(f),b=body(f);await event(f,'beginCombat',{player:f.a});await event(f,'attackersDeclared',{player:f.a,attackers:[k,a,b].map(card=>({card,target:f.b}))});await event(f,'endCombat',{player:f.a});assert.equal(k.name,'Gideon, Battle-Forged');assert.equal(k.counters.loyalty,3);await activate(f,k,2);assert.equal(k.power,4);assert.equal(k.is('Planeswalker'),true);assert.equal(k.kw('indestructible'),true);
});
test('Mila rewards targeting, and Lukka returns a creature with haste until the next own upkeep',async()=>{
 const f=setup();library(f);const m=card(f,'Mila, Crafty Companion');await event(f,'targeted',{card:m,so:{ctrl:f.b}});assert.equal(f.a.hand.length,1);const l=await enterBack(f,'Mila, Crafty Companion'),b=card(f,'Grizzly Bears','graveyard');await activate(f,l,1);assert.equal(b.zone,'battlefield');assert.equal(b.kw('haste'),true);await event(f,'upkeep',{player:f.b});assert.equal(b.zone,'battlefield');await event(f,'upkeep',{player:f.a});assert.equal(b.zone,'exile');
});
test('Hadana’s Climb transforms at three counters; its land ability doubles power',async()=>{
 const f=setup(),h=card(f,"Hadana's Climb"),b=body(f);f.game.addCounters(b,'+1/+1',2,false,f.a);f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:undefined;await event(f,'beginCombat',{player:f.a});assert.equal(h.name,'Winged Temple of Orazca');await activate(f,h);assert.equal(b.power,10);assert.equal(b.kw('flying'),true);
});
test('Dowsing Dagger gives the opponent Plants, then becomes Lost Vale after equipped combat damage',async()=>{
 const f=setup(),b=body(f);const d=await play(f,'Dowsing Dagger');assert.equal(f.game.creatures(f.b).filter(c=>c.hasSub('Plant')).length,2);await f.game.attach(d,b);await event(f,'damageToPlayer',{src:b,player:f.b,n:1,combat:true});assert.equal(d.name,'Lost Vale');assert.equal(d.attachedTo,null);assert.equal(f.game.manaSources(f.a).find(s=>s.card===d).produce[0].W,3);
});
test('Legion’s Landing transforms after a three-creature attack and Adanto makes a lifelink Vampire',async()=>{
 const f=setup();const l=await play(f,"Legion's Landing"),a=body(f),b=body(f);const token=f.game.creatures(f.a).find(c=>c.isToken);await event(f,'attackersDeclared',{player:f.a,attackers:[a,b,token].map(card=>({card,target:f.b}))});assert.equal(l.name,'Adanto, the First Fort');await activate(f,l);assert.equal(f.game.creatures(f.a).filter(c=>c.hasSub('Vampire')&&c.isToken&&c.kw('lifelink')).length,2);
});
test('Treasure Map transforms on the third landmark and Treasure Cove pays a Treasure sacrifice',async()=>{
 const f=setup(),m=card(f,'Treasure Map');library(f);for(let i=0;i<3;i++){f.game.untap(m);await activate(f,m);}assert.equal(m.name,'Treasure Cove');assert.equal(m.counters.landmark||0,0);assert.equal(f.game.bf().filter(c=>c.hasSub('Treasure')).length,3);f.game.untap(m);await activate(f,m);assert.equal(f.a.hand.length,1);assert.equal(f.game.bf().filter(c=>c.hasSub('Treasure')).length,2);
});
test('Search for Azcanta transforms with seven graveyard cards and selects a noncreature nonland card',async()=>{
 const f=setup(),a=card(f,'Search for Azcanta');for(let i=0;i<7;i++)card(f,'Forest','graveyard');await event(f,'upkeep',{player:f.a});assert.equal(a.name,'Azcanta, the Sunken Ruin');card(f,'Forest','library');const d=card(f,'Divination','library');await activate(f,a);assert.equal(d.zone,'hand');
});
test('Thaumatic Compass transforms with seven lands and Spires removes the selected attacker',async()=>{
 const f=setup(),c=card(f,'Thaumatic Compass'),b=body(f,f.b);lands(f,7);await event(f,'endStep',{player:f.a});assert.equal(c.name,'Spires of Orazca');b.attacking=f.a;b.tapped=true;f.game.combat={attackers:[b]};f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:undefined;await activate(f,c);assert.equal(b.attacking,null);assert.equal(b.tapped,false);
});
test('Westvale Abbey sacrifices five creatures, transforms and untaps as Ormendahl',async()=>{
 const f=setup(),w=card(f,'Westvale Abbey');for(let i=0;i<5;i++)body(f);await activate(f,w,1);assert.equal(w.name,'Ormendahl, Profane Prince');assert.equal(w.tapped,false);assert.equal(w.power,9);assert.equal(w.kw('indestructible'),true);assert.equal(f.a.graveyard.length,5);
});
test('Elbrus becomes Withengar, then a player loss adds thirteen counters',async()=>{
 const f=setup('human',3),e=card(f,'Elbrus, the Binding Blade'),b=body(f);await f.game.attach(e,b);await event(f,'damageToPlayer',{src:b,player:f.b,n:1,combat:true});assert.equal(e.name,'Withengar Unbound');await f.game.playerLoses(f.b,'face test');await settle(f.game);assert.equal(e.counters['+1/+1'],13);
});
test('Journey to Eternity returns the enchanted creature and itself transformed after death',async()=>{
 const f=setup(),b=body(f);f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:undefined;const j=await play(f,'Journey to Eternity');assert.equal(j.attachedTo,b.iid);await f.game.destroy(b);await settle(f.game);assert.equal(b.zone,'battlefield');assert.equal(j.name,'Atzal, Cave of Eternity');assert.equal(j.zone,'battlefield');
});
test('Kolvori’s Crest produces restricted mana for its chosen creature type or a legendary creature',async()=>{
 const f=setup();f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(x=>x.key==='Elf')?'Elf':undefined;const c=await enterBack(f,'Kolvori, God of Kinship');const elf=card(f,'Llanowar Elves','hand'),bear=card(f,'Grizzly Bears','hand'),legend=card(f,'Kinnan, Bonder Prodigy','hand');assert.equal(f.game.manaSources(f.a,{card:elf}).some(s=>s.card===c),true);assert.equal(f.game.manaSources(f.a,{card:bear}).some(s=>s.card===c),false);assert.equal(f.game.manaSources(f.a,{card:legend}).some(s=>s.card===c),true);
});
test('Saved Incubator and Construct keep their native abilities and day/night state',async()=>{
 const f=setup();const src=card(f,'Brimaz, Blight of Oreskos');await M.BOM.incubate(ctx(f,src),3);card(f,'Urza, Chief Artificer');await event(f,'endStep',{player:f.a});f.game.bomDayNight='night';f.game.bomPreviousActive=f.b.idx;const save=M.captureGameState(f.game);assert.ok(save);const g=setup().game;M.restoreGameState(g,JSON.parse(JSON.stringify(save)));assert.equal(g.bomDayNight,'night');const egg=g.bf().find(c=>c.hasSub('Incubator')),construct=g.bf().find(c=>c.hasSub('Construct'));assert.ok(egg.def.abilities.length);assert.equal(construct.power,g.bf().filter(c=>c.ctrl===construct.ctrl&&c.is('Artifact')).length);assert.equal(egg.counters['+1/+1'],3);
});
test('Azor’s Gateway transforms only after five distinct exiled mana values and Sanctum produces life-sized mana',async()=>{
 const f=setup(),a=card(f,"Azor's Gateway");const names=['Forest','Sol Ring','Grizzly Bears','Divination','Conclave Sledge-Captain'];for(const name of names){card(f,name,'library');f.game.untap(a);await activate(f,a);}assert.equal(a.name,'Sanctum of the Sun');assert.equal(f.a.life,45);assert.equal(f.game.manaSources(f.a).find(s=>s.card===a).produce[0].W,45);
});
test('Shaile grows creatures that actually entered this turn and Embrose draws for their counters on death',async()=>{
 const f=setup(),s=card(f,'Shaile, Dean of Radiance'),old=body(f);const fresh=card(f,'Grizzly Bears','hand');await f.game.putPermanentOntoBattlefield(fresh,f.a);await activate(f,s);assert.equal(fresh.counters['+1/+1'],1);assert.equal(old.counters['+1/+1']||0,0);await enterBack(f,'Shaile, Dean of Radiance');library(f);await f.game.destroy(fresh);await settle(f.game);assert.equal(f.a.hand.length,1);
});
test('Plargg casts a revealed nonlegendary spell and Augusta untaps then retaps selected creatures',async()=>{
 const f=setup(),p=card(f,'Plargg, Dean of Chaos'),b=card(f,'Grizzly Bears','library');card(f,'Forest','library');await activate(f,p,1);assert.equal(b.zone,'battlefield');assert.equal(f.a.library.length,31);const a=await enterBack(f,'Plargg, Dean of Chaos');b.tapped=true;f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt?.includes('Augusta')?[b]:undefined;await event(f,'attackersDeclared',{player:f.a,attackers:[{card:b,target:f.b}]});assert.equal(b.tapped,true);assert.equal(b.power,3);assert.equal(a.tapped,false);
});
test('Avacyn’s non-Angel death schedules the next upkeep transform and its damage hits other creatures',async()=>{
 const f=setup(),a=card(f,'Archangel Avacyn'),b=body(f),o=body(f,f.b);await f.game.destroy(b);await settle(f.game);assert.equal(a.oracleFace,'front');await event(f,'upkeep',{player:f.b});assert.equal(a.name,'Avacyn, the Purifier');assert.equal(f.b.life,37);assert.equal(o.zone,'graveyard');
});
test('Voldaren Pariah sacrifices three others, transforms, then an opponent sacrifices three',async()=>{
 const f=setup(),v=card(f,'Voldaren Pariah');for(let i=0;i<3;i++){body(f);body(f,f.b);}await activate(f,v);assert.equal(v.name,'Abolisher of Bloodlines');assert.equal(f.game.creatures(f.a).length,1);assert.equal(f.game.creatures(f.b).length,0);
});
test('Valakut Awakening replaces chosen hand cards, and Hagra Broodpit can be played as a tapped land',async()=>{
 const f=setup();library(f);card(f,'Grizzly Bears','hand');await play(f,'Valakut Awakening');assert.equal(f.a.hand.length,2);const h=card(f,'Hagra Mauling','hand');assert.equal(await f.game.playLand(f.a,h),true);assert.equal(h.name,'Hagra Broodpit');assert.equal(h.tapped,true);
});
