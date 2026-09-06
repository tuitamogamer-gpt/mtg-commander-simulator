import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M,covered,setup,card,body,play,activate,event,fuel,mana,settle} from './helpers/c21-fixtures.mjs';
import {buildC21Intake,c21SourceDir,c21Precons} from '../scripts/import-c21-precons.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const report=JSON.parse(fs.readFileSync(c21SourceDir+'/intake.json'));
const target=(f,c)=>{f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(c)?[c]:undefined;};
const die=async(f,c)=>{await f.game.destroy(c);await settle(f.game);};
test('five Moxfield exports match official 100-card C21 decks; only 80 of 357 unique names were added',()=>{
 const intake=buildC21Intake(M);assert.equal(report.baselineCards,19545);assert.equal(report.newCards,80);assert.equal(report.reusedCards,277);assert.equal(intake.newNames.length,0);assert.equal(intake.names.length,357);
 for(const d of intake.decks){assert.deepEqual(JSON.parse(JSON.stringify(M.DECKS[d.name].cards)),d.cards);assert.equal(d.cards.reduce((n,c)=>n+c.n,0),100);}
 for(const n of report.newNames){assert.ok(M.SCRIPTS[n],n);assert.ok(!M.DEFS[n].simplified&&!M.DEFS[n].autoScripted,n);}
});
for(const role of ['human','ai'])test(role+': Osgir pays exact artifact mana value, exiles as a cost and creates two real copies',async()=>{
 const f=setup(role),osgir=await play(f,'Osgir, the Reconstructor'),ring=card(f,'Sol Ring','graveyard');osgir.sick=false;fuel(f.a);
 const entry=f.game.activatableList(f.a).find(e=>e.card===osgir&&e.ability.c21Osgir);assert.ok(entry);const before=mana(f.a);assert.equal(await f.game.activateAbility(f.a,entry),true);assert.equal(before-mana(f.a),1);assert.equal(ring.zone,'exile');assert.ok(osgir.tapped);assert.ok(f.game.stack.length);await settle(f.game);
 assert.equal(f.game.bf().filter(c=>c.name==='Sol Ring'&&c.isToken).length,2);assertGameStateInvariants(f.game);
});
test('Osgir cannot activate while sick, at instant timing or without mana; his sacrifice boost pays its real cost',async()=>{
 const f=setup(),o=await play(f,'Osgir, the Reconstructor');card(f,'Sol Ring','graveyard');assert.ok(!f.game.activatableList(f.a).some(e=>e.ability?.c21Osgir));o.sick=false;f.game.phase='combat';assert.ok(!f.game.activatableList(f.a).some(e=>e.ability?.c21Osgir));f.game.phase='main1';const b=body(f),artifact=card(f,'Sol Ring');target(f,b);await activate(f,o,0);assert.equal(artifact.zone,'graveyard');assert.equal(b.power,4);
});
test('Daretti rummages, exchanges an artifact and creates a delayed-return emblem',async()=>{
 const f=setup(),pw=await play(f,'Daretti, Scrap Savant');card(f,'Island','hand');card(f,'Mountain','hand');await activate(f,pw,0);assert.equal(f.a.hand.length,2);assert.equal(pw.counters.loyalty,5);
 f.game.turnNo++;const ring=card(f,'Sol Ring','graveyard'),sac=card(f,'Thran Dynamo');target(f,ring);await activate(f,pw,1);assert.equal(ring.zone,'battlefield');assert.equal(sac.zone,'graveyard');
 f.game.turnNo++;pw.counters.loyalty=10;await activate(f,pw,2);await die(f,ring);assert.equal(ring.zone,'graveyard');await event(f,'endStep',{player:f.b});assert.equal(ring.zone,'battlefield');
});
test('Digsite constructs count artifacts and Reshapers reveal through the hit and take exact damage',async()=>{
 {const f=setup();await play(f,'Digsite Engineer');await play(f,'Sol Ring');const token=f.game.creatures(f.a).find(c=>c.isToken);assert.equal(token.power,2);}
 {const f=setup(),r=await play(f,'Audacious Reshapers'),sac=card(f,'Sol Ring');r.sick=false;card(f,'Thran Dynamo','library');card(f,'Forest','library');target(f,sac);await activate(f,r);assert.equal(sac.zone,'graveyard');assert.equal(f.a.life,38);assert.ok(f.game.bf().some(c=>c.name==='Thran Dynamo'));}
});
test('Laelia triggers once per exile batch and grants the attacked top card for this turn',async()=>{
 const f=setup(),l=await play(f,'Laelia, the Blade Reforged'),a=card(f,'Island','graveyard'),b=card(f,'Mountain','graveyard');await f.game.moveGraveyardBatch([a,b],'exile');await settle(f.game);assert.equal(l.counters['+1/+1'],1);
 const top=f.a.library.at(-1);await event(f,'attacks',{card:l});assert.equal(top.zone,'exile');assert.ok(f.game.playableLands(f.a).includes(top));assert.equal(l.counters['+1/+1'],2);
});
test('Ruin Grinder wheels every accepting player; Titan leaves three distinct Golems',async()=>{
 {const f=setup(),r=await play(f,'Ruin Grinder');card(f,'Island','hand');await die(f,r);assert.equal(f.a.hand.length,7);assert.equal(f.b.hand.length,7);}
 {const f=setup(),t=await play(f,'Triplicate Titan');await die(f,t);const golems=f.game.creatures(f.a);assert.equal(golems.length,3);assert.deepEqual(Array.from(golems,c=>[...c.cur.kw][0]).sort(),['flying','trample','vigilance']);}
});
test('Duplicant imprint follows the exact exiled object; Scrap Trawler uses the destroyed artifact’s mana value',async()=>{
 {const f=setup(),b=body(f,f.b);target(f,b);const d=await play(f,'Duplicant');assert.equal(b.zone,'exile');assert.equal(d.power,2);assert.ok(d.hasSub('Bear'));await f.game.move(b,'hand');f.game.recalc();assert.equal(d.toughness,4);}
 {const f=setup(),ring=card(f,'Sol Ring','graveyard'),trawler=await play(f,'Scrap Trawler'),dynamo=card(f,'Thran Dynamo');target(f,ring);await die(f,dynamo);assert.equal(ring.zone,'hand');await die(f,trawler);}
});
test('Excavation compensates the controller; Reconstruct returns one of each type and exiles itself',async()=>{
 {const f=setup(),b=body(f,f.b);target(f,b);await play(f,'Excavation Technique');assert.equal(b.zone,'graveyard');assert.equal(f.game.bf().filter(c=>c.ctrl===f.b&&c.hasSub('Treasure')).length,2);}
 {const f=setup();const names=['Sol Ring','Glorious Anthem','Opt','Divination','Daretti, Scrap Savant'],cards=names.map(n=>card(f,n,'graveyard'));const s=await play(f,'Reconstruct History');assert.ok(cards.every(c=>c.zone==='hand'));assert.equal(s.zone,'exile');}
});
test('Thousand-Year Elixir permits a sick creature’s tap ability but never a sick attack',async()=>{
 const f=setup(),elixir=await play(f,'Thousand-Year Elixir'),r=await play(f,'Audacious Reshapers');card(f,'Sol Ring');assert.ok(r.sick);assert.ok(f.game.activatableList(f.a).some(e=>e.card===r));r.tapped=true;target(f,r);await activate(f,elixir);assert.equal(r.tapped,false);
});
test('Zaffai, Charmbreaker, Cyclops and Summonings use the cast spell’s mana value',async()=>{
 const f=setup(),z=await play(f,'Zaffai, Thunder Conductor'),devil=await play(f,'Charmbreaker Devils'),cyclops=await play(f,'Erratic Cyclops');await play(f,'Metallurgic Summonings');await play(f,"Brass's Bounty");
 assert.equal(devil.power,8);assert.equal(cyclops.power,7);assert.ok(f.game.creatures().some(c=>c.isToken&&c.hasSub('Construct')&&c.power===7));assert.ok(f.game.creatures().some(c=>c.isToken&&c.hasSub('Elemental')));
 const spell=card(f,'Opt','graveyard');await event(f,'upkeep',{player:f.a});assert.ok(f.a.hand.some(c=>c.is('Instant')||c.is('Sorcery')));
 f.game.battlefield.filter(c=>c.isToken).forEach(c=>assertGameStateInvariants(f.game));
});
test('Jaya mana is restricted; her emblem grants paid graveyard casts with exile on resolution',async()=>{
 const f=setup(),j=await play(f,'Jaya Ballard');for(const c in f.a.pool)f.a.pool[c]=0;const entry=f.game.activatableList(f.a).find(e=>e.card===j&&e.ability===j.def.abilities[0]);await f.game.activateAbility(f.a,entry);await settle(f.game);assert.equal(f.a.pool.R,3);
 const creature=card(f,'Grizzly Bears','hand');assert.equal(f.game.canPayMana(f.a,M.parseCost('{2}'),{card:creature}),false);
 f.game.turnNo++;j.counters.loyalty=8;await activate(f,j,2);const opt=card(f,'Opt','graveyard');fuel(f.a);const offer=f.game.castableList(f.a).find(e=>e.card===opt&&e.alt?.starterPermission==='jaya');assert.ok(offer);await f.game.castSpell(f.a,opt,{from:offer.from,alt:offer.alt});await settle(f.game);assert.equal(opt.zone,'exile');
});
test('Sly Instigator goads and makes its target unblockable until its controller’s next turn',async()=>{
 const f=setup(),b=body(f,f.b),s=await play(f,'Sly Instigator');s.sick=false;target(f,b);await activate(f,s);assert.ok(b.cur.unblockable);assert.ok(b.cur.goadedBy?.includes(f.a)||f.game.untilEffects.some(e=>e.kind==='goadCard'));await f.game.move(b,'exile');await f.game.move(b,'battlefield',{ctrl:f.b});assert.equal(b.cur.unblockable,false);
});
test('Radiant Performer copies a single-target spell for each other legal permanent',async()=>{
 const f=setup(),a=body(f),b=body(f),enemy=body(f,f.b),bolt=card(f,'Giant Growth','hand');fuel(f.a);await f.game.castSpell(f.a,bolt,{from:'hand',quickTargets:[a]});const original=f.game.stack.at(-1);target(f,original);const r=await play(f,'Radiant Performer');assert.equal(a.power,5);assert.equal(b.power,5);assert.equal(enemy.power,5);assert.equal(r.power,5);
});
test('Living Lore links a paid instant or sorcery and casts it after sacrificing; Drake counts owned exile and graveyard',async()=>{
 {const f=setup(),spell=card(f,'Divination','graveyard'),l=await play(f,'Living Lore');assert.equal(l.power,3);assert.equal(spell.zone,'exile');await f.game.damageAny(l,f.b,3,{combat:true});await settle(f.game);assert.equal(l.zone,'graveyard');assert.equal(spell.zone,'graveyard');assert.equal(f.a.hand.length,2);}
 {const f=setup();card(f,'Opt','graveyard');card(f,'Divination','exile');const d=await play(f,'Crackling Drake');assert.equal(d.power,2);assert.equal(f.a.hand.length,1);}
});
test('Refrain suspends itself after drawing; Muse Vortex handles zero and filters spells by X',async()=>{
 {const f=setup(),r=await play(f,'Inspiring Refrain');assert.equal(r.zone,'exile');assert.equal(r.meta.suspended,3);assert.equal(f.a.hand.length,2);}
 {const f=setup(),n=f.a.library.length;await play(f,'Muse Vortex',{xVal:0});assert.equal(f.a.library.length,n);const opt=card(f,'Opt','library');await play(f,'Muse Vortex',{xVal:1});assert.equal(opt.zone,'graveyard');}
});
test('Fiery Encore uses discarded nonland mana value; Mind’s Desire permits free cards and lands',async()=>{
 {const f=setup(),enemy=body(f,f.b);card(f,'Divination','hand');target(f,enemy);await play(f,'Fiery Encore');assert.equal(enemy.zone,'graveyard');assert.equal(f.a.hand.length,1);}
 {const f=setup();await play(f,"Mind's Desire");const top=f.a.exile[0];assert.equal(top.zone,'exile');assert.ok(top.meta.freePlay);assert.ok(f.game.playableLands(f.a).includes(top));}
});
test('Apex forbids playing its exiled lands and only adds ten mana when cast from hand; Vision uses recurred value',async()=>{
 {const f=setup(),before=f.a.library.length;await play(f,'Apex of Power');assert.equal(f.a.exile.length,7);assert.ok(!f.game.playableLands(f.a).some(c=>c.zone==='exile'));assert.equal(f.a.library.length,before-7);assert.equal(mana(f.a),180);}
 {const f=setup(),enemy=body(f,f.b),spell=card(f,'Divination','graveyard');target(f,spell);const vision=await play(f,'Volcanic Vision');assert.equal(enemy.zone,'graveyard');assert.equal(spell.zone,'hand');assert.equal(vision.zone,'exile');}
});
test('Reinterpret counters a spell then casts a cheaper spell from hand',async()=>{
 const f=setup(),other=card(f,'Air Elemental','hand',f.b);fuel(f.b);f.game.turnPlayer=f.b;assert.equal(await f.game.castSpell(f.b,other,{from:'hand'}),true);f.game.turnPlayer=f.a;const original=f.game.stack.at(-1);card(f,'Divination','hand');target(f,original);await play(f,'Reinterpret');assert.equal(other.zone,'graveyard');assert.equal(f.a.hand.length,2);
});
test('Aetherspouts moves attackers to owner libraries; Brainstorm puts exactly two cards back',async()=>{
 {const f=setup(),enemy=body(f,f.b);enemy.attacking=f.a;await play(f,'Aetherspouts');assert.equal(enemy.zone,'library');assert.equal(f.b.library.at(-1),enemy);}
 {const f=setup(),before=f.a.library.length;await play(f,'Brainstorm');assert.equal(f.a.hand.length,1);assert.equal(f.a.library.length,before-1);}
});
test('Goggles copies a red instant using its mana; Summonings pays its six-artifact activation and returns spells',async()=>{
 {const f=setup(),g=await play(f,"Pyromancer's Goggles"),spell=card(f,'Shock','hand');for(const c in f.a.pool)f.a.pool[c]=0;target(f,f.b);const e=f.game.activatableList(f.a).find(e=>e.card===g&&e.manaAbility);assert.ok(e);await f.game.activateAbility(f.a,e);assert.equal(f.a.pool.R,1);await f.game.castSpell(f.a,spell,{from:'hand',quickTargets:[f.b]});await settle(f.game);assert.equal(f.b.life,36);}
 {const f=setup(),s=await play(f,'Metallurgic Summonings');for(let i=0;i<6;i++)card(f,'Sol Ring');const a=card(f,'Opt','graveyard'),b=card(f,'Divination','graveyard');await activate(f,s);assert.equal(s.zone,'exile');assert.equal(a.zone,'hand');assert.equal(b.zone,'hand');}
});
test('Ruxa recurs vanilla creatures and grants their boost and unblocked assignment choice',async()=>{
 const f=setup(),dead=card(f,'Grizzly Bears','graveyard'),b=body(f);target(f,dead);await play(f,'Ruxa, Patient Professor');assert.equal(dead.zone,'hand');assert.equal(b.power,3);assert.ok(b.cur.mayAssignUnblocked);
});
test('Cutpurse redirects token creation and doubled tokens use their new controller; Reef Worm death chain works',async()=>{
 {const f=setup();await play(f,'Crafty Cutpurse');const made=await f.game.makeTokens('treasure',f.b,{n:2});assert.equal(made.length,2);assert.ok(made.every(c=>c.ctrl===f.a));}
 {const f=setup(),worm=await play(f,'Reef Worm');await die(f,worm);const fish=f.game.creatures(f.a)[0];assert.equal(fish.power,3);await die(f,fish);const whale=f.game.creatures(f.a)[0];assert.equal(whale.power,6);await die(f,whale);assert.equal(f.game.creatures(f.a)[0].power,9);}
});
test('Incubation Druid sees tapped lands’ mana types and adapts to produce three of one type',async()=>{
 const f=setup(),d=await play(f,'Incubation Druid'),land=card(f,'Forest');land.tapped=true;d.sick=false;assert.equal(d.def.mana.produce(f.game,d,f.a)[0].G,1);await activate(f,d);assert.equal(d.counters['+1/+1'],3);assert.equal(d.def.mana.produce(f.game,d,f.a)[0].G,3);
});
test('Terastodon rewards only actual graveyard moves; Biomancer counters and Mutant type arrive before ETB',async()=>{
 {const f=setup(),land=card(f,'Forest','battlefield',f.b);target(f,land);await play(f,'Terastodon');assert.equal(land.zone,'graveyard');assert.equal(f.game.creatures(f.b)[0].power,3);}
 {const f=setup(),m=await play(f,'Master Biomancer'),b=await play(f,'Grizzly Bears');assert.equal(b.counters['+1/+1'],2);assert.ok(b.hasSub('Mutant'));assert.equal(m.counters['+1/+1']||0,0);await die(f,m);assert.ok(b.hasSub('Mutant'));}
});
test('Ezuri’s Predation fights simultaneously without targeting and doubled surplus Beasts do not fight',async()=>{
 const f=setup(),a=body(f,f.b),b=body(f,f.b);card(f,'Adrix and Nev, Twincasters');await play(f,"Ezuri's Predation");assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');const beasts=f.game.creatures().filter(c=>c.hasSub('Beast'));assert.equal(beasts.length,4);assert.equal(beasts.filter(c=>c.damage===2).length,2);assert.equal(beasts.filter(c=>c.damage===0).length,2);
});
test('Sequence Engine pays targeted mana value; Nexus removes all counters as a cost',async()=>{
 {const f=setup(),s=await play(f,'Sequence Engine'),b=card(f,'Air Elemental','graveyard',f.b);target(f,b);await activate(f,s);assert.equal(b.zone,'exile');assert.equal(f.game.creatures().find(c=>c.hasSub('Fractal')).power,5);}
 {const f=setup(),n=await play(f,'Geometric Nexus');await play(f,'Divination');assert.equal(n.counters.charge,3);await activate(f,n,e=>e.ability?.label.startsWith('Remove all'));assert.equal(n.counters.charge||0,0);assert.equal(f.game.creatures().find(c=>c.hasSub('Fractal')).power,3);}
});
test('Paradox Zone doubles before making its Fractal and Primal Empathy distinguishes power ties',async()=>{
 {const f=setup(),z=await play(f,'Paradox Zone');assert.equal(z.counters.growth,1);await event(f,'endStep',{player:f.a});assert.equal(z.counters.growth,2);assert.equal(f.game.creatures()[0].power,2);}
 {const f=setup(),b=body(f);body(f,f.b);await play(f,'Primal Empathy');await event(f,'upkeep',{player:f.a});assert.equal(f.a.hand.length,1);card(f,'Air Elemental','battlefield',f.b);await event(f,'upkeep',{player:f.a});assert.equal(b.counters['+1/+1'],1);assert.equal(f.a.hand.length,1);}
});
test('Gideon’s loyalty-based animation updates as loyalty changes and prevents damage',async()=>{
 const f=setup(),b=body(f,f.b),g=await play(f,'Gideon, Champion of Justice');target(f,f.b);await activate(f,g,0);assert.equal(g.counters.loyalty,6);f.game.turnNo++;await activate(f,g,1);assert.equal(g.power,6);assert.ok(g.is('Creature')&&g.is('Planeswalker')&&g.kw('indestructible'));f.game.addCounters(g,'loyalty',2);f.game.recalc();assert.equal(g.power,8);await f.game.damageAny(b,g,8);assert.equal(g.counters.loyalty,8);f.game.turnNo++;g.counters.loyalty=16;await activate(f,g,2);assert.equal(b.zone,'exile');assert.equal(g.zone,'battlefield');
});
test('Felisa counts every kind of counter on a dying nontoken creature; Calligrapher creates attacking Inklings',async()=>{
 {const f=setup(),felisa=await play(f,'Felisa, Fang of Silverquill'),b=body(f);f.game.addCounters(b,'+1/+1',2);f.game.addCounters(b,'charge',1);await die(f,b);const tokens=f.game.creatures().filter(c=>c.hasSub('Inkling'));assert.equal(tokens.length,3);assert.ok(tokens.every(c=>c.tapped));}
 {const f=setup(),cc=await play(f,'Combat Calligrapher'),b=body(f);b.attacking=f.b;f.game.combat={attackers:[b],hadAttackers:true};await event(f,'attackersDeclared',{player:f.a,attackers:[b]});const token=f.game.creatures().find(c=>c.hasSub('Inkling'));assert.equal(token.attacking,f.b);assert.ok(token.tapped);assert.equal(f.game.canAttackTarget(token,f.a),false);}
});
test('Guardian reveals its secret as the activation cost and protects both player and permanent',async()=>{
 const f=setup(),b=body(f),op=body(f,f.b),g=await play(f,'Guardian Archon');target(f,b);await activate(f,g);assert.ok(f.game.isProtectedFrom(f.a,op));assert.ok(f.game.isProtectedFrom(b,op));assert.equal(await f.game.damageAny(op,f.a,4),0);assert.ok(!f.game.legalTargets(M.T.player(),op,f.b).includes(f.a));assert.ok(!f.game.activatableList(f.a).some(e=>e.card===g));
});
test('Nils chooses one creature per player and charges all counters for attacks on players or planeswalkers',async()=>{
 const f=setup(),a=body(f),b=body(f,f.b),n=await play(f,'Nils, Discipline Enforcer');await event(f,'endStep',{player:f.a});assert.equal(a.counters['+1/+1'],1);assert.equal(b.counters['+1/+1'],1);assert.equal(f.game.c21AttackTax(b,f.a),1);const pw=card(f,'Gideon Jura');f.game.addCounters(b,'charge',2);assert.equal(f.game.c21AttackTax(b,pw),3);
});
test('Scholarship compares initial land counts, Author selects only actual exiled nonlands, Plagiarist copies opposing counters',async()=>{
 {const f=setup();card(f,'Forest','battlefield',f.b);card(f,'Island','battlefield',f.b);await play(f,'Scholarship Sponsor');assert.equal(f.game.lands(f.a).length,2);assert.ok(f.game.lands(f.a).every(c=>c.tapped));}
 {const f=setup(),b=card(f,'Air Elemental','graveyard',f.b);await play(f,'Author of Shadows');assert.equal(b.zone,'exile');assert.equal(b.meta.playableBy,f.a);assert.ok(b.meta.anyColor);}
 {const f=setup(),b=body(f,f.b),p=await play(f,'Bold Plagiarist');f.game.addCounters(b,'charge',2,false,f.b);await settle(f.game);assert.equal(p.counters.charge,2);}
});
test('Keen Duelist exchanges revealed mana values and Serenity links battlefield and graveyard creatures',async()=>{
 {const f=setup();card(f,'Air Elemental','library');card(f,'Grizzly Bears','library',f.b);await play(f,'Keen Duelist');await event(f,'upkeep',{player:f.a});assert.equal(f.a.life,38);assert.equal(f.b.life,35);assert.equal(f.a.hand.at(-1).name,'Air Elemental');}
 {const f=setup(),b=body(f,f.b),dead=card(f,'Air Elemental','graveyard'),angel=await play(f,'Angel of Serenity');assert.equal(b.zone,'exile');assert.equal(dead.zone,'exile');await die(f,angel);assert.equal(b.zone,'hand');assert.equal(dead.zone,'hand');}
});
test('Boreas leaves to fetch Plains; Oreskos searches one Plains per opponent with more lands',async()=>{
 {const f=setup();for(let i=0;i<3;i++){card(f,'Forest','battlefield',f.b);card(f,'Plains','library');}const b=await play(f,'Boreas Charger');await die(f,b);assert.equal(f.game.lands(f.a).length,1);assert.equal(f.a.hand.length,2);}
 {const f=setup();card(f,'Forest','battlefield',f.b);card(f,'Plains','library');await play(f,'Oreskos Explorer');assert.equal(f.a.hand[0].name,'Plains');}
});
test('Magister votes return everyone’s creatures, with condemnation winning a tie; Teysa prevents and retaliates',async()=>{
 {const f=setup(),b=card(f,'Grizzly Bears','graveyard',f.b);await play(f,'Magister of Worth');assert.equal(b.zone,'battlefield');}
 {const f=setup(),b=body(f,f.b),t=await play(f,'Teysa, Envoy of Ghosts');assert.ok(f.game.isProtectedFrom(t,b));await f.game.damageAny(b,f.a,2,{combat:true});await event(f,'combatDamageToPlayer',{card:b,player:f.a,n:2});assert.equal(b.zone,'graveyard');assert.equal(f.game.creatures().filter(c=>c.hasSub('Spirit')).length,1);}
});
test('Incarnation mills and reanimates; Infernal Offering sacrifices and draws before returning creatures',async()=>{
 {const f=setup(),b=card(f,'Grizzly Bears','library');await play(f,'Incarnation Technique');assert.equal(b.zone,'battlefield');assert.equal(f.a.graveyard.length,5);}
 {const f=setup(),a=body(f),b=body(f,f.b);await play(f,'Infernal Offering');assert.equal(a.zone,'battlefield');assert.equal(b.zone,'battlefield');assert.equal(f.a.hand.length,2);assert.equal(f.b.hand.length,2);}
});
test('Stinging Study uses an owned commander, Inkshield makes one token per prevented combat damage and Oblation draws for the owner',async()=>{
 {const f=setup(),commander=card(f,'Breena, the Demagogue','command');commander.commander=true;await play(f,'Stinging Study');assert.equal(f.a.hand.length,3);assert.equal(f.a.life,37);}
 {const f=setup(),b=body(f,f.b);await play(f,'Inkshield');assert.equal(await f.game.damageAny(b,f.a,5,{combat:true}),0);assert.equal(f.game.creatures(f.a).length,5);assert.equal(f.a.life,40);}
 {const f=setup(),b=body(f,f.b);target(f,b);await play(f,'Oblation');assert.equal(f.b.hand.length,2);assert.ok(['library','hand'].includes(b.zone));}
});
test('Contract counts accepting opponents; Pendant enters under the chosen opponent and benefits its owner',async()=>{
 {const f=setup();await play(f,'Tempting Contract');await event(f,'upkeep',{player:f.a});assert.equal(f.game.bf().filter(c=>c.ctrl===f.a&&c.hasSub('Treasure')).length,2);}
 {const f=setup(),p=await play(f,'Pendant of Prosperity');assert.equal(p.ctrl,f.b);await activate(f,p);assert.equal(f.game.lands(f.a).length,1);assert.equal(f.game.lands(f.b).length,1);}
});
test('Chimes and Searchlight donate real mana without using the Stack',async()=>{
 for(const [name,color] of [['Victory Chimes','C'],['Spectral Searchlight','G']]){const f=setup(),s=await play(f,name);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a player')?String(f.b.idx):q.type==='chooseOption'&&q.prompt.includes('mana color')?'G':undefined;
 const entry=f.game.activatableList(f.a).find(e=>e.card===s&&e.manaAbility);assert.ok(entry);await f.game.activateAbility(f.a,entry);assert.equal(f.b.pool[color],1);assert.equal(f.game.stack.length,0);assert.ok(s.tapped);}
});
test('Cunning Rhetoric grants the attacker’s card and Parasitic Impetus drains the enchanted attacker’s controller',async()=>{
 {const f=setup(),b=body(f,f.b);await play(f,'Cunning Rhetoric');b.attacking=f.a;const top=f.b.library.at(-1);await event(f,'attackersDeclared',{player:f.b,attackers:[b]});assert.equal(top.zone,'exile');assert.equal(top.meta.playableBy,f.a);assert.ok(top.meta.anyColor);}
 {const f=setup(),b=body(f,f.b);target(f,b);await play(f,'Parasitic Impetus');assert.equal(b.power,4);await event(f,'attacks',{card:b});assert.equal(f.b.life,38);assert.equal(f.a.life,42);}
});
for(const role of ['human','ai'])test(role+': Willowdusk uses the greater life total and Gyome counts nontoken entries including itself',async()=>{
 const f=setup(role),w=await play(f,'Willowdusk, Essence Seer'),b=body(f);w.sick=false;await f.game.gainLife(f.a,3);await f.game.loseLife(f.a,5);target(f,b);await activate(f,w);assert.equal(b.counters['+1/+1'],5);
 const g=await play(f,'Gyome, Master Chef');await event(f,'endStep',{player:f.a});assert.equal(f.game.bf().filter(c=>c.hasSub('Food')).length,2);await activate(f,g);assert.ok(b.tapped&&b.kw('indestructible'));
});
test('Tivash pays exact gained life for a Demon; Sproutback has a paid end-step graveyard cast',async()=>{
 {const f=setup();await play(f,'Tivash, Gloom Summoner');await f.game.gainLife(f.a,4);await event(f,'endStep',{player:f.a});assert.equal(f.a.life,40);assert.equal(f.game.creatures().find(c=>c.hasSub('Demon')).power,4);}
 {const f=setup(),s=card(f,'Sproutback Trudge','graveyard');await f.game.gainLife(f.a,7);fuel(f.a);const before=mana(f.a);await event(f,'endStep',{player:f.a});assert.equal(s.zone,'battlefield');assert.equal(before-mana(f.a),2);covered.add(s.name);}
});
test('Yedora returns a face-down Forest with only its intrinsic mana and restores the original after leaving',async()=>{
 const f=setup(),b=body(f);await play(f,'Yedora, Grave Gardener');await die(f,b);assert.equal(b.zone,'battlefield');assert.ok(b.faceDown&&b.is('Land')&&b.hasSub('Forest'));assert.ok(!b.is('Creature'));assert.equal(f.game.faceUpCosts(b).length,0);assert.ok(f.game.manaSources(f.a,null).some(s=>s.card===b&&s.produce.some(p=>p.G===1)));await f.game.move(b,'hand');assert.equal(b.name,'Grizzly Bears');assert.ok(!b.faceDown);
});
test('Verdant Sun gains entering toughness, Essence Pulse uses all life gained this turn, Healing returns and exiles',async()=>{
 {const f=setup();await play(f,"Verdant Sun's Avatar");assert.equal(f.a.life,45);await play(f,'Grizzly Bears');assert.equal(f.a.life,47);}
 {const f=setup(),b=body(f,f.b);await f.game.gainLife(f.a,2);await play(f,'Essence Pulse');assert.equal(b.zone,'graveyard');assert.equal(f.a.life,44);}
 {const f=setup(),b=card(f,'Air Elemental','graveyard');target(f,b);const s=await play(f,'Healing Technique');assert.equal(b.zone,'hand');assert.equal(f.a.life,45);assert.equal(s.zone,'exile');}
});
test('Revival selects distinct permanent types, pays life for returned cards and exiles itself',async()=>{
 const f=setup(),a=card(f,'Sol Ring','graveyard'),b=card(f,'Grizzly Bears','graveyard'),land=card(f,'Forest','graveyard');const s=await play(f,'Revival Experiment');assert.ok([a,b,land].every(c=>c.zone==='battlefield'));assert.equal(f.a.life,31);assert.equal(s.zone,'exile');
});
test('Suffer binds X graveyard targets to its player; Elixir shuffles itself and the graveyard; Plume gains for its chosen color',async()=>{
 {const f=setup(),a=card(f,'Island','graveyard',f.b),b=card(f,'Mountain','graveyard',f.b);f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(f.b)?[f.b]:undefined;await play(f,'Suffer the Past',{xVal:2});assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');assert.equal(f.b.life,38);assert.equal(f.a.life,42);}
 {const f=setup(),a=card(f,'Island','graveyard'),e=await play(f,'Elixir of Immortality');await activate(f,e);assert.equal(f.a.life,45);assert.equal(a.zone,'library');assert.equal(e.zone,'library');}
 {const f=setup();f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a color')?'G':undefined;const p=await play(f,'Paradise Plume');await play(f,'Grizzly Bears');assert.equal(f.a.life,41);assert.equal(p.def.mana.produce(f.game,p)[0].G,1);}
});
test('every one of the 80 new native cards has a paid cast or activation and an asserted rules outcome',()=>{assert.deepEqual(report.newNames.filter(n=>!covered.has(n)),[]);});
test('Osgir’s unavailable mana and stale cost selection fail atomically; copies retain exiled LKI',async()=>{
 {const f=setup(),o=await play(f,'Osgir, the Reconstructor'),d=card(f,'Thran Dynamo','graveyard');o.sick=false;fuel(f.a);const entry=f.game.activatableList(f.a).find(e=>e.ability?.c21Osgir);for(const color in f.a.pool)f.a.pool[color]=0;assert.equal(await f.game.activateAbility(f.a,entry),false);assert.equal(d.zone,'graveyard');assert.equal(o.tapped,false);fuel(f.a);const before=mana(f.a);f.decide=(p,q)=>{if(q.type==='chooseCards'&&q.from.includes(d)){d.zoneVersion++;return[d];}};assert.equal(await f.game.activateAbility(f.a,entry),false);assert.equal(mana(f.a),before);assert.equal(o.tapped,false);}
 {const f=setup(),o=await play(f,'Osgir, the Reconstructor'),d=card(f,'Sol Ring','graveyard');o.sick=false;const entry=f.game.activatableList(f.a).find(e=>e.ability?.c21Osgir);fuel(f.a);await f.game.activateAbility(f.a,entry);await f.game.move(d,'hand');await settle(f.game);assert.equal(f.game.bf().filter(c=>c.name==='Sol Ring'&&c.isToken).length,2);assert.equal(d.zone,'hand');}
});
test('Ruin Grinder mountaincycling is a paid activated ability, searches a Mountain and never draws',async()=>{
 const f=setup(),r=card(f,'Ruin Grinder','hand'),m=card(f,'Mountain','library');fuel(f.a);const entry=f.game.activatableList(f.a).find(e=>e.card===r&&e.cycling);assert.ok(entry);const before=mana(f.a);await f.game.activateAbility(f.a,entry);assert.equal(before-mana(f.a),2);assert.equal(r.zone,'graveyard');await settle(f.game);assert.equal(m.zone,'hand');assert.equal(f.a.hand.length,1);
});
test('Jaya’s restricted mana cannot pay an instant’s activated ability, and countered emblem casts are exiled',async()=>{
 const f=setup(),j=await play(f,'Jaya Ballard');for(const c in f.a.pool)f.a.pool[c]=0;const e=f.game.activatableList(f.a).find(e=>e.card===j&&e.ability===j.def.abilities[0]);await f.game.activateAbility(f.a,e);await settle(f.game);const opt=card(f,'Opt','hand');assert.equal(f.game.canPayMana(f.a,M.parseCost('{1}'),{card:opt,isAbility:true}),false);
 f.game.turnNo++;j.counters.loyalty=8;await activate(f,j,2);await f.game.move(opt,'graveyard');fuel(f.a);const offer=f.game.castableList(f.a).find(e=>e.card===opt&&e.alt?.starterPermission==='jaya');assert.equal(await f.game.castSpell(f.a,opt,{from:offer.from,alt:offer.alt}),true);await f.game.counterStackObject(f.game.stack.at(-1));assert.equal(opt.zone,'exile');
});
test('Goggles automatic payment creates one copy; floated mana remembers a departed source and respects colorless spells',async()=>{
 for(const departed of [false,true]){const f=setup(),g=await play(f,"Pyromancer's Goggles"),s=card(f,'Shock','hand');target(f,f.b);for(const c in f.a.pool)f.a.pool[c]=0;
 if(departed){await f.game.activateAbility(f.a,f.game.activatableList(f.a).find(e=>e.card===g&&e.manaAbility));await f.game.move(g,'exile');}
 assert.equal(await f.game.castSpell(f.a,s,{from:'hand',quickTargets:[f.b]}),true);await settle(f.game);assert.equal(f.b.life,36);assert.equal(mana(f.a),0);}
 const f=setup(),g=await play(f,"Pyromancer's Goggles"),s=card(f,'Shock','hand');s.def={...s.def,devoid:true,colorsOverride:[]};target(f,f.b);for(const c in f.a.pool)f.a.pool[c]=0;assert.equal(await f.game.castSpell(f.a,s,{from:'hand',quickTargets:[f.b]}),true);await settle(f.game);assert.equal(f.b.life,38);
});
test('Reconstruct copies never move the physical spell, and Muse returns expensive instants without casting them',async()=>{
 {const f=setup(),opt=card(f,'Opt','graveyard'),s=card(f,'Reconstruct History','hand');fuel(f.a);target(f,opt);assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),true);const original=f.game.stack.at(-1);await f.game.copySpell(original,f.a);await f.game.resolveTop();assert.equal(s.zone,'stack');assert.equal(opt.zone,'hand');await settle(f.game);assert.equal(s.zone,'graveyard');}
 {const f=setup(),vision=card(f,'Volcanic Vision','library');await play(f,'Muse Vortex',{xVal:1});assert.equal(vision.zone,'hand');}
});
test('Simultaneous Biomancer entry cannot modify co-entrants; existing Biomancer combines printed counters before replacement',async()=>{
 {const f=setup(),m=card(f,'Master Biomancer','hand'),b=card(f,'Grizzly Bears','hand');await f.game.withBattlefieldEntryBatch(async()=>{await f.game.move(m,'battlefield');await f.game.move(b,'battlefield');});assert.equal(b.counters['+1/+1']||0,0);assert.equal(b.hasSub('Mutant'),false);}
 {const f=setup();card(f,'Master Biomancer');card(f,'Hardened Scales');const h=card(f,'Hungering Hydra','hand');fuel(f.a);await f.game.castSpell(f.a,h,{from:'hand',xVal:3});await settle(f.game);assert.equal(h.counters['+1/+1'],6);}
});
test('Cutpurse gives the new controller’s doubler a chance to apply; Felisa’s mentor requires lower attack power',async()=>{
 {const f=setup();card(f,'Adrix and Nev, Twincasters');await play(f,'Crafty Cutpurse');const made=await f.game.makeTokens('treasure',f.b);assert.equal(made.length,2);assert.ok(made.every(c=>c.ctrl===f.a));}
 {const f=setup(),felisa=await play(f,'Felisa, Fang of Silverquill'),b=body(f);b.attacking=f.b;felisa.attacking=f.b;target(f,b);await event(f,'attacks',{card:felisa});assert.equal(b.counters['+1/+1'],1);}
});
test('Guardian protection survives AI simulation cloning and source departure',async()=>{
 const f=setup(),g=await play(f,'Guardian Archon'),b=body(f),enemy=body(f,f.b);target(f,b);await activate(f,g);const copy=M.cloneGameForAISimulation(f.game,9231),cb=copy.byIid(b.iid),ce=copy.byIid(enemy.iid);copy.recalc();assert.equal(copy.isProtectedFrom(cb,ce),true);assert.equal(copy.isProtectedFrom(copy.players[0],ce),true);await f.game.move(g,'exile');assert.equal(f.game.isProtectedFrom(b,enemy),true);
});
test('Inkshield never prevents noncombat damage, and Suffer rejects graveyard targets from another player',async()=>{
 {const f=setup(),b=body(f,f.b);await play(f,'Inkshield');assert.equal(await f.game.damageAny(b,f.a,3),3);assert.equal(f.a.life,37);assert.equal(f.game.creatures(f.a).length,0);}
 {const f=setup(),a=card(f,'Island','graveyard'),b=card(f,'Forest','graveyard',f.b),s=card(f,'Suffer the Past','hand');fuel(f.a);f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(f.a)?[f.a]:undefined;assert.equal(await f.game.castSpell(f.a,s,{from:'hand',xVal:1,quickTargets:[f.a,a]}),true);await settle(f.game);assert.equal(a.zone,'exile');assert.equal(b.zone,'graveyard');}
});
test('Sproutback cannot be cast from its graveyard without its triggered permission; Elixir respects a different owner',async()=>{
 {const f=setup(),s=card(f,'Sproutback Trudge','graveyard');fuel(f.a);assert.equal(await f.game.castSpell(f.a,s,{from:'graveyard'}),false);await event(f,'endStep',{player:f.a});assert.equal(s.zone,'graveyard');}
 {const f=setup(),e=await play(f,'Elixir of Immortality');M.OracleV8Control.gain(f.game,e,f.b);f.game.recalc();const dead=card(f,'Island','graveyard',f.b);await activate(f,e);assert.equal(e.zone,'library');assert.ok(f.a.library.includes(e));assert.ok(f.b.library.includes(dead));assert.equal(f.b.life,45);}
});
test('seven previously inactive catalog cards are reused and now pass active-deck rules checks',async()=>{
 {const f=setup(),g=card(f,'Boros Garrison','hand'),land=card(f,'Mountain');await f.game.move(g,'battlefield');await settle(f.game);assert.equal(g.tapped,true);assert.equal(land.zone,'hand');assert.deepEqual(JSON.parse(JSON.stringify(g.def.mana.produce)),[{R:1,W:1}]);}
 {const f=setup(),b=body(f,f.b),blade=await play(f,'Bloodthirsty Blade');target(f,b);await activate(f,blade);assert.equal(blade.attachedTo,b.iid);assert.equal(b.power,4);assert.ok(f.game.isGoaded(b));await f.game.move(blade,'graveyard');assert.equal(b.power,2);assert.equal(f.game.isGoaded(b),false);}
 {const f=setup(),b=body(f),a=body(f);target(f,b);const aura=await play(f,'Martial Impetus');assert.equal(aura.attachedTo,b.iid);assert.equal(b.power,3);b.attacking=f.b;a.attacking=f.b;f.game.combat={attackers:[b,a]};await event(f,'attacks',{card:b});assert.equal(a.power,3);assert.equal(b.power,3);}
 {const f=setup(),b=body(f,f.b),m=await play(f,'Windborn Muse'),pw=card(f,'Gideon Jura');assert.equal(f.game.c21AttackTax(b,f.a),2);assert.equal(f.game.c21AttackTax(b,pw),0);}
 {const f=setup(),b=body(f,f.b),s=await play(f,'Selfless Squire');assert.equal(await f.game.damageAny(b,f.a,4),0);await settle(f.game);assert.equal(s.counters['+1/+1'],4);}
});
test('Duelist’s Heritage announces its target on the Stack and a blink invalidates that target',async()=>{
 const f=setup(),b=body(f);await play(f,"Duelist's Heritage");b.attacking=f.b;target(f,b);await f.game.emit('attackersDeclared',{player:f.a,attackers:[b]});await f.game.flushTriggers();assert.ok(f.game.stack.some(s=>s.targets?.flat().includes(b)));
 await f.game.move(b,'exile');await f.game.move(b,'battlefield');await settle(f.game);assert.equal(b.kw('double strike'),false);
 b.attacking=f.b;await event(f,'attackersDeclared',{player:f.a,attackers:[b]});assert.equal(b.kw('double strike'),true);
});
test('Stalking Leonin reveals as a cost, targets legally, and is spent even when its activation is countered',async()=>{
 const f=setup(),l=await play(f,'Stalking Leonin'),b=body(f,f.b);b.attacking=f.a;target(f,b);fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===l);assert.ok(e);assert.equal(await f.game.activateAbility(f.a,e),true);assert.ok(f.game.stack.at(-1).targets.includes(b));assert.ok(Number.isInteger(f.game.stack.at(-1).ctx.c21Revealed));assert.equal(f.game.activatableList(f.a).some(e=>e.card===l),false);await f.game.counterStackObject(f.game.stack.at(-1));assert.equal(b.zone,'battlefield');assert.equal(f.game.activatableList(f.a).some(e=>e.card===l),false);
 await f.game.move(l,'exile');await f.game.move(l,'battlefield');await settle(f.game);await activate(f,l);assert.equal(b.zone,'exile');
});
test('Stalking Leonin cannot target a protected attacker and does not exile a differently controlled attacker',async()=>{
 const f=setup(),l=await play(f,'Stalking Leonin'),b=body(f,f.others[1]);b.attacking=f.a;target(f,b);await activate(f,l);assert.equal(b.zone,'battlefield');
 await f.game.move(l,'exile');await f.game.move(l,'battlefield');await settle(f.game);b.cur.hexproof=true;assert.equal(f.game.activatableList(f.a).some(e=>e.card===l),false);
});
test('Selfless Squire’s old prevention trigger cannot put counters on its blinked incarnation',async()=>{
 const f=setup(),s=await play(f,'Selfless Squire'),b=body(f,f.b);await f.game.damageAny(b,f.a,3);await f.game.flushTriggers();await f.game.move(s,'exile');await f.game.move(s,'battlefield');await settle(f.game);assert.equal(s.counters['+1/+1']||0,0);
});
test('all new evergreen keywords match the captured Oracle records, including Teysa’s vigilance',()=>{
 const evergreen=new Set(['flying','vigilance','trample','haste','lifelink','reach','deathtouch','double strike','first strike','menace','flash','defender','indestructible','hexproof','shroud']);
 const records=JSON.parse(fs.readFileSync(c21SourceDir+'/oracle.json')).cards;for(const name of report.newNames)for(const kw of records.find(c=>c.requestedName===name).keywords.map(k=>k.toLowerCase()).filter(k=>evergreen.has(k)))assert.ok(M.DEFS[name].kws.includes(kw),name+': '+kw);
});
test('Sly Instigator’s goad and evasion apply only to the targeted incarnation',async()=>{
 const f=setup(),s=await play(f,'Sly Instigator'),b=body(f,f.b);s.sick=false;target(f,b);await activate(f,s);assert.equal(f.game.isGoaded(b),true);await f.game.move(b,'exile');await f.game.move(b,'battlefield',{ctrl:f.b});assert.equal(f.game.isGoaded(b),false);assert.equal(f.game.isForcedToAttack(b),false);assert.equal(b.cur.unblockable,false);
});
test('a stolen Scrap Trawler uses its battlefield controller for its own death trigger',async()=>{
 const f=setup(),t=await play(f,'Scrap Trawler'),ring=card(f,'Sol Ring','graveyard',f.b);M.OracleV8Control.gain(f.game,t,f.b);f.game.recalc();target(f,ring);await die(f,t);assert.equal(t.owner,f.a);assert.equal(ring.zone,'hand');assert.ok(f.b.hand.includes(ring));
});
test('Pendant records its entry under the chosen opponent rather than its owner',async()=>{
 const f=setup(),p=await play(f,'Pendant of Prosperity');assert.equal(f.a.turnState.permanentEntries.some(e=>e.iid===p.iid),false);assert.equal(f.b.turnState.permanentEntries.some(e=>e.iid===p.iid),true);assert.equal(f.a.turnState.nonlandPermanentsEntered,0);assert.equal(f.b.turnState.nonlandPermanentsEntered,1);
});
