import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target,tokens} from './helpers/c17-c19-fixtures.mjs';
for(const role of ['human','ai']){
 test(role+': Trostani gains entering toughness and populates through a paid tap ability',async()=>{
  const f=setup(role),t=await play(f,"Trostani, Selesnya's Voice");await play(f,'Ghired, Conclave Exile');assert.equal(f.a.life,49);t.sick=false;await activate(f,t);assert.equal(tokens(f).length,2);assert.equal(f.a.life,53);
 });
 test(role+': Apprentice sacrifices itself up front and the hasty reanimated creature at the next end step',async()=>{
  const f=setup(role),a=await play(f,'Apprentice Necromancer'),b=card(f,'Grizzly Bears','graveyard');a.sick=false;target(f,b);await activate(f,a);assert.equal(a.zone,'graveyard');assert.equal(b.zone,'battlefield');assert.ok(b.kw('haste'));await event(f,'endStep',{player:f.b});assert.equal(b.zone,'graveyard');
 });
 test(role+': Bladewing returns a Dragon and pumps Dragons belonging to every player',async()=>{
  const f=setup(role),d=card(f,'Thundermaw Hellkite','graveyard'),opp=card(f,'Thundermaw Hellkite','battlefield',f.b);target(f,d);const b=await play(f,'Bladewing the Risen');assert.equal(d.zone,'battlefield');await activate(f,b);assert.equal(d.power,6);assert.equal(opp.power,6);
 });
 test(role+': Asylum Visitor checks empty hand at trigger resolution and Boneyard Scourge returns after a Dragon dies',async()=>{
  const f=setup(role);await play(f,'Asylum Visitor');await event(f,'upkeep',{player:f.b});assert.equal(f.a.hand.length,1);assert.equal(f.a.life,39);const s=card(f,'Boneyard Scourge','graveyard'),d=card(f,'Thundermaw Hellkite');fuel(f.a);await f.game.destroy(d);await settle(f.game);assert.equal(s.zone,'battlefield');
 });
 test(role+': Bloodhusk multikicker discards the paid number; Crimson Honor Guard recognizes any controlled commander',async()=>{
  const f=setup(role);for(let n=0;n<4;n++)card(f,'Island','hand',f.b);const r=await play(f,'Bloodhusk Ritualist');assert.ok(r.castMeta.paidTimes>0);assert.equal(f.b.hand.length,Math.max(0,4-r.castMeta.paidTimes));await play(f,'Crimson Honor Guard');await event(f,'endStep',{player:f.b});assert.equal(f.b.life,36);const b=body(f,f.b);b.commander=true;await event(f,'endStep',{player:f.b});assert.equal(f.b.life,36);
 });
 test(role+': Hydra Omnivore damages the other opponents once, without retriggering',async()=>{
  const f=setup(role,3),h=await play(f,'Hydra Omnivore');await f.game.damagePlayer(h,f.b,8,{combat:true});await settle(f.game);assert.ok(f.others.every(p=>p.life===32));assert.equal(f.a.life,40);
 });
 test(role+': Spellbound Dragon pumps from the actual discard; Greven counts life lost and sacrifice statistics',async()=>{
  const f=setup(role),s=await play(f,'Spellbound Dragon');card(f,'Serra Angel','hand');f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('Spellbound Dragon: discard')?[q.from.find(c=>c.name==='Serra Angel')]:undefined;
  await event(f,'attacks',{card:s,player:f.a});assert.equal(s.power,8);const g=await play(f,'Greven, Predator Captain'),b=body(f);f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('Greven: sacrifice')?[b]:undefined;const before=f.a.hand.length;await event(f,'attacks',{card:g,player:f.a});assert.equal(b.zone,'graveyard');assert.equal(f.a.hand.length,before+2);assert.equal(f.a.life,38);assert.equal(g.power,7);
 });
 test(role+': Duskmantle Seer takes revealed cards without drawing and Nin draws for the damaged creature controller',async()=>{
  const f=setup(role);await play(f,'Duskmantle Seer');card(f,'Serra Angel','library',f.b);await event(f,'upkeep',{player:f.a});assert.equal(f.b.life,35);assert.equal(f.b.hand[0].name,'Serra Angel');assert.equal(f.b.turnState.drawn||0,0);const n=await play(f,'Nin, the Pain Artist'),b=body(f,f.b);n.sick=false;f.decide=(p,q)=>q.type==='chooseX'?3:q.type==='chooseTargets'?[b]:undefined;await activate(f,n);assert.equal(b.zone,'graveyard');assert.equal(f.b.hand.length,4);
 });
 test(role+': Phyrexian Delver pays life for reanimation and Grave Scrabbler requires its madness cost',async()=>{
  const f=setup(role),b=card(f,'Serra Angel','graveyard');target(f,b);await play(f,'Phyrexian Delver');assert.equal(b.zone,'battlefield');assert.equal(f.a.life,35);const dead=card(f,'Grizzly Bears','graveyard',f.b);target(f,dead);await play(f,'Grave Scrabbler');assert.equal(dead.zone,'graveyard');const s=card(f,'Grave Scrabbler','hand');fuel(f.a);await f.game.discard(f.a,[s]);await settle(f.game);assert.equal(s.zone,'battlefield');assert.equal(dead.zone,'hand');
 });
 test(role+': Nightshade Assassin uses revealed black cards and Chemister uses the paid discard mana value',async()=>{
  const f=setup(role),b=body(f,f.b);card(f,'Doom Blade','hand');card(f,'Vampire Nighthawk','hand');target(f,b);await play(f,'Nightshade Assassin');assert.equal(b.zone,'graveyard');
  const c=await play(f,'Mercurial Chemister');c.sick=false;await activate(f,c);assert.equal(f.a.hand.length,4);c.tapped=false;const big=card(f,'Serra Angel','battlefield',f.b),d=card(f,'Hydra Omnivore','hand');f.decide=(p,q)=>q.type==='chooseCards'&&q.from.includes(d)?[d]:q.type==='chooseTargets'?[big]:undefined;await activate(f,c,1);assert.equal(big.zone,'graveyard');assert.equal(d.zone,'graveyard');
 });
 test(role+': Captivating Vampire pays five taps and grants a permanent Vampire type with control',async()=>{
  const f=setup(role),c=await play(f,'Captivating Vampire');for(let n=0;n<4;n++)card(f,'Vampire Nighthawk');const b=body(f,f.b);target(f,b);await activate(f,c);assert.equal(b.ctrl,f.a);assert.ok(b.hasSub('Vampire')&&b.hasSub('Bear'));assert.equal(b.power,3);assert.equal(f.game.creatures(f.a).filter(c=>c.tapped).length,5);f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();assert.equal(b.ctrl,f.a);assert.ok(b.hasSub('Vampire'));
 });
 test(role+': Balan equips the whole board and gains double strike only while two Equipment remain attached',async()=>{
  const f=setup(role),b=await play(f,'Balan, Wandering Knight'),a=card(f,'Sol Ring'),e=card(f,'Bonesplitter'),e2=card(f,'Lightning Greaves');await activate(f,b);assert.equal(e.attachedTo,b.iid);assert.equal(e2.attachedTo,b.iid);assert.equal(a.attachedTo,null);assert.ok(b.kw('double strike'));await f.game.move(e2,'graveyard');assert.equal(b.kw('double strike'),false);
 });
 test(role+': Doomed Artisan grows Sculptures and its departure removes attack and block restrictions',async()=>{
  const f=setup(role),a=await play(f,'Doomed Artisan');await event(f,'endStep',{player:f.a});await event(f,'endStep',{player:f.a});assert.equal(tokens(f).length,2);assert.ok(tokens(f).every(c=>c.power===2&&c.cur.cantAttack&&c.cur.cantBlock));await f.game.move(a,'graveyard');assert.ok(tokens(f).every(c=>c.power===2&&!c.cur.cantAttack&&!c.cur.cantBlock));
 });
 test(role+': Tectonic Hellion resolves all tied leaders from one land count; Wasitora creates a token only if sacrifice fails',async()=>{
  const f=setup(role,3);for(const p of [f.a,f.b])for(let n=0;n<3;n++)card(f,'Forest','battlefield',p);const h=await play(f,'Tectonic Hellion');await event(f,'attacks',{card:h,player:f.a});assert.equal(f.game.lands(f.a).length,1);assert.equal(f.game.lands(f.b).length,1);const w=await play(f,'Wasitora, Nekoru Queen'),b=body(f,f.b);await f.game.damagePlayer(w,f.b,5,{combat:true});await settle(f.game);assert.equal(b.zone,'graveyard');assert.equal(tokens(f).length,0);await f.game.damagePlayer(w,f.b,5,{combat:true});await settle(f.game);assert.equal(tokens(f)[0].name,'Cat Dragon Token');assert.deepEqual(Array.from(tokens(f)[0].colors),['B','R','G']);
 });
 test(role+': Varina draws and discards for attacking Zombies and pays two exiles for a tapped Zombie',async()=>{
  const f=setup(role),v=await play(f,'Varina, Lich Queen'),z=card(f,'Grave Scrabbler');await event(f,'attackersDeclared',{player:f.a,attackers:[v,z]});assert.equal(f.a.life,42);assert.equal(f.a.hand.length,0);assert.equal(f.a.graveyard.length,2);await activate(f,v);assert.equal(f.a.graveyard.length,0);assert.equal(f.a.exile.length,2);assert.equal(tokens(f)[0].name,'Zombie Token');assert.ok(tokens(f)[0].tapped);
 });
}
test('Ground Seal blocks graveyard targeting both at announcement and resolution, but permits untargeted reanimation',async()=>{
 const f=setup(),b=card(f,'Grizzly Bears','graveyard'),s=card(f,'Beacon of Unrest','hand');target(f,b);fuel(f.a);assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),true);card(f,'Ground Seal');await settle(f.game);assert.equal(b.zone,'graveyard');assert.equal(f.game.legalTargets(M.C1719.grave(),s,f.a).length,0);await M.C1719.enterMany({g:f.game,you:f.a,src:s},[b]);assert.equal(b.zone,'battlefield');
});
test('Archetype prevents flying gained later, and losing the source restores other flying grants',async()=>{
 const f=setup(),a=card(f,'Archetype of Imagination'),b=body(f,f.b);M.E.grantUntilEOT(f.game,b,['flying']);assert.equal(b.kw('flying'),false);assert.ok(a.kw('flying'));await f.game.move(a,'graveyard');assert.ok(b.kw('flying'));
});
test('Monastery Siege tax applies once per spell and Elderwood reduction applies only to its controller',async()=>{
 const f=setup(),s=card(f,'Monastery Siege'),e=card(f,'Elderwood Scion');s.meta.c1719Siege='dragons';const c=card(f,'Comet Storm','hand',f.b);assert.equal(f.game.starterTargetTax(f.b,c,{targets:[[f.a,e]]}),4);assert.equal(f.game.starterTargetTax(f.a,c,{targets:[e]}),-2);assert.equal(f.game.starterTargetTax(f.b,c,{targets:[f.a]}),2);
});
