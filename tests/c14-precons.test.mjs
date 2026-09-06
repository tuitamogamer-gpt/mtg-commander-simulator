import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {M,covered,setup,card,body,play,activate,event,fuel,mana,settle} from './helpers/c21-fixtures.mjs';
import {buildC14Intake,c14SourceDir,c14Precons} from '../scripts/import-c14-precons.mjs';
const intake=JSON.parse(fs.readFileSync(c14SourceDir+'/intake.json'));
const targets=(f,...chosen)=>{f.decide=(p,q)=>q.type==='chooseTargets'?q.candidates.filter(c=>chosen.includes(c)).slice(0,q.max):undefined;};
const die=async(f,c)=>{await f.game.destroy(c);await settle(f.game);};
const tokens=(f,p=f.a,sub)=>f.game.creatures(p).filter(c=>c.isToken&&(!sub||c.hasSub(sub)));
const next=(f)=>{f.game.turnNo++;f.game.phase='main1';f.game.turnPlayer=f.a;};
const castOnly=async(f,n,p=f.a,opts={})=>{const c=card(f,n,'hand',p);fuel(p);assert.equal(await f.game.castSpell(p,c,{from:'hand',...opts}),true,n);covered.add(n);return c;};

test('C14 Moxfield sources exactly match independent lists and reuse all 257 existing definitions',()=>{
 const d=buildC14Intake(M);assert.equal(d.names.length,322);assert.equal(d.newNames.length,0);assert.equal(intake.newCards,65);assert.equal(intake.reusedCards,257);
 for(const row of c14Precons){const deck=M.DECKS[row.name];assert.ok(deck);assert.equal(deck.cards.reduce((n,c)=>n+c.n,0),100);assert.equal(deck.commander,row.commander);}
 for(const n of intake.newNames){assert.ok(M.DEFS[n]);assert.ok(M.SCRIPTS[n]);assert.ok(!M.DEFS[n].autoScripted&&!M.DEFS[n].simplified,n);}
});
for(const role of ['human','ai'])test(role+': Nahiri pays commander mana, uses all three loyalty paths, and makes functional Equipment',async()=>{
 const f=setup(role),pw=card(f,'Nahiri, the Lithomancer','command');pw.commander=true;f.a.commanders.push(pw);await play(f,pw.name,{card:pw});
 assert.equal(pw.counters.loyalty,3);const boots=card(f,'Swiftfoot Boots');await activate(f,pw,0);const kor=tokens(f)[0];assert.ok(kor.hasSub('Kor')&&kor.hasSub('Soldier'));assert.equal(boots.attachedTo,kor.iid);assert.ok(kor.kw('haste'));assert.equal(pw.counters.loyalty,5);
 next(f);const sword=card(f,'Strata Scythe','graveyard');await activate(f,pw,1);assert.equal(sword.zone,'battlefield');
 next(f);pw.counters.loyalty=10;await activate(f,pw,2);const blade=f.game.bf().find(c=>c.name==='Stoneforged Blade');assert.ok(blade.kw('indestructible'));targets(f,kor);
 const equip=f.game.activatableList(f.a).find(e=>e.card===blade&&e.equip);assert.ok(equip);assert.equal(await f.game.activateAbility(f.a,equip),true);await settle(f.game);assert.equal(kor.power,6);assert.ok(kor.kw('double strike'));await die(f,blade);assert.equal(blade.zone,'battlefield');
});
test('Adarkar Valkyrie returns the targeted dying object to its controller and ignores a later incarnation',async()=>{
 for(const blink of [false,true]){const f=setup(),v=await play(f,'Adarkar Valkyrie'),b=body(f,f.b);v.sick=false;targets(f,b);await activate(f,v);
 if(blink){await f.game.move(b,'hand');await f.game.move(b,'battlefield',{ctrl:f.b});}await die(f,b);assert.equal(b.zone,blink?'graveyard':'battlefield');if(!blink)assert.equal(b.ctrl,f.a);}
});
test('Arcane Lighthouse locks out hexproof/shroud through later grants, without affecting later entrants',async()=>{
 const f=setup(),l=card(f,'Arcane Lighthouse'),b=card(f,'Sphinx of Jwar Isle','battlefield',f.b);covered.add(l.name);assert.ok(b.kw('shroud'));await activate(f,l);assert.ok(!b.kw('shroud'));
 M.E.grantUntilEOT(f.game,b,['hexproof','shroud']);assert.ok(!b.kw('hexproof')&&!b.kw('shroud'));const later=card(f,'Sphinx of Jwar Isle','battlefield',f.b);assert.ok(later.kw('shroud'));
});
test('Assault Suit forbids sacrifice and attacks on the equipment controller, then returns control at cleanup',async()=>{
 const f=setup(),suit=await play(f,'Assault Suit'),b=body(f);await f.game.attach(suit,b);assert.equal(b.power,4);assert.ok(b.kw('haste'));assert.equal(f.game.canSacrifice(b),false);assert.equal(await f.game.sacrifice(f.a,b),false);
 await event(f,'upkeep',{player:f.b});assert.equal(b.ctrl,f.b);assert.equal(b.tapped,false);assert.equal(f.game.canAttackTarget(b,f.a),false);assert.equal(f.game.canAttackTarget(b,f.others[1]),true);
 f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();assert.equal(b.ctrl,f.a);await f.game.move(suit,'hand');assert.equal(f.game.canSacrifice(b),true);
});
test('Benevolent Offering makes three Spirits for each selected player, then counts life after tokens',async()=>{
 const f=setup();body(f);await play(f,'Benevolent Offering');assert.equal(tokens(f,f.a,'Spirit').length,3);assert.equal(tokens(f,f.b,'Spirit').length,3);assert.equal(f.a.life,48);assert.equal(f.b.life,46);
});
test('Celestial Crusader has flash, stops responses with split second and pumps all other white creatures',async()=>{
 const f=setup(),white=card(f,'Serra Angel','battlefield',f.b);f.game.phase='combat';const c=await castOnly(f,'Celestial Crusader');const spell=card(f,'Opt','hand',f.b);fuel(f.b);assert.equal(f.game.canCastTiming(f.b,spell),false);await settle(f.game);assert.equal(white.power,5);assert.equal(c.power,2);
});
test('Containment Priest exiles uncast creatures, permits casts/tokens, and ignores creatures entering in its own batch',async()=>{
 {const f=setup();await play(f,'Containment Priest');const b=card(f,'Grizzly Bears','graveyard');await f.game.move(b,'battlefield');assert.equal(b.zone,'exile');const cast=await play(f,'Grizzly Bears');assert.equal(cast.zone,'battlefield');await f.game.makeTokens(M.C14.token('Soldier',['Soldier'],1,1,['W']),f.a);assert.ok(tokens(f).length);}
 {const f=setup(),priest=card(f,'Containment Priest','graveyard'),b=card(f,'Grizzly Bears','graveyard');await f.game.withBattlefieldEntryBatch(async()=>{await f.game.move(priest,'battlefield');await f.game.move(b,'battlefield');});assert.equal(priest.zone,'battlefield');assert.equal(b.zone,'battlefield');}
});
test('Grand Abolisher blocks opposing spells and artifact/creature abilities including mana but permits land abilities',async()=>{
 const f=setup(),g=await play(f,'Grand Abolisher'),ring=card(f,'Sol Ring','battlefield',f.b),land=card(f,'Island','battlefield',f.b),pw=card(f,'Teferi, Temporal Archmage','battlefield',f.b);pw.counters.loyalty=5;f.b.emblems.push({name:'Teferi emblem',c14Teferi:true});fuel(f.b);
 assert.ok(!f.game.manaSources(f.b).some(s=>s.card===ring));assert.ok(f.game.manaSources(f.b).some(s=>s.card===land));assert.ok(f.game.activatableList(f.b).some(e=>e.card===pw));const opt=card(f,'Opt','hand',f.b);assert.equal(await f.game.castSpell(f.b,opt,{from:'hand'}),false);
 await f.game.move(g,'hand');assert.equal(await f.game.castSpell(f.b,opt,{from:'hand'}),true);await settle(f.game);
});
test('Decree of Justice pays double X for Angels and its cycling trigger separately pays X for Soldiers',async()=>{
 {const f=setup();f.x=2;await play(f,'Decree of Justice');assert.equal(tokens(f,f.a,'Angel').length,2);assert.equal(tokens(f)[0].power,4);}
 {const f=setup(),c=card(f,'Decree of Justice','hand');fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.cycling);assert.ok(e);await f.game.activateAbility(f.a,e);await settle(f.game);assert.equal(c.zone,'graveyard');assert.equal(tokens(f,f.a,'Soldier').length,3);assert.equal(f.a.hand.length,1);}
});
test('Fell the Mighty compares power at resolution; Kemba counts Equipment including its last battlefield information',async()=>{
 {const f=setup(),b=body(f),big=card(f,'Serra Angel','battlefield',f.b);targets(f,b);await play(f,'Fell the Mighty');assert.equal(b.zone,'battlefield');assert.equal(big.zone,'graveyard');}
 {const f=setup(),k=await play(f,'Kemba, Kha Regent'),boots=card(f,'Swiftfoot Boots');await f.game.attach(boots,k);await f.game.emit('upkeep',{player:f.a});await f.game.flushTriggers();await f.game.move(k,'graveyard');await settle(f.game);assert.equal(tokens(f,f.a,'Cat').length,1);}
});
test('Marshal’s Anthem pays multikicker and reanimates that many creatures under its anthem',async()=>{
 const f=setup(),a=card(f,'Grizzly Bears','graveyard'),b=card(f,'Serra Angel','graveyard');f.x=2;targets(f,a,b);const anthem=await play(f,"Marshal's Anthem");assert.equal(anthem.castMeta.paidTimes,2);assert.equal(a.zone,'battlefield');assert.equal(b.zone,'battlefield');assert.equal(a.power,3);
});
test('Serra Avatar uses its owner’s life in all zones and shuffles after a graveyard trigger',async()=>{
 const f=setup();f.a.life=17;const a=await play(f,'Serra Avatar');assert.equal(a.power,17);await f.game.move(a,'graveyard');assert.equal(a.zone,'graveyard');await settle(f.game);assert.equal(a.zone,'library');await f.game.move(a,'hand');await f.game.discard(f.a,[a]);await settle(f.game);assert.equal(a.zone,'library');assert.equal(a.power,17);
});
test('Strata Scythe counts matching lands on every battlefield and stops its bonus when the imprinted object leaves',async()=>{
 const f=setup(),b=body(f);card(f,'Forest');card(f,'Forest','battlefield',f.b);const s=await play(f,'Strata Scythe');await f.game.attach(s,b);assert.equal(b.power,4);const ex=s.meta.c14Scythe.card;await f.game.move(ex,'hand');f.game.recalc();assert.equal(b.power,2);
});
test('Twilight Shepherd returns exact current graveyard objects from the battlefield and persists with a counter',async()=>{
 const f=setup(),ring=card(f,'Sol Ring'),old=card(f,'Mind Stone','graveyard');await f.game.move(ring,'graveyard');const t=await play(f,'Twilight Shepherd');assert.equal(ring.zone,'hand');assert.equal(old.zone,'graveyard');await die(f,t);assert.equal(t.zone,'battlefield');assert.equal(t.counters['-1/-1'],1);
});
for(const role of ['human','ai'])test(role+': Teferi has three paid loyalty paths and its emblem permits one loyalty activation each turn',async()=>{
 const f=setup(role),pw=await play(f,'Teferi, Temporal Archmage');card(f,'Island','library');card(f,'Sol Ring','library');await activate(f,pw,0);assert.equal(f.a.hand.length,1);assert.equal(pw.counters.loyalty,6);
 next(f);const lands=Array.from({length:4},()=>card(f,'Island'));for(const l of lands)l.tapped=true;targets(f,...lands);await activate(f,pw,1);assert.ok(lands.every(c=>!c.tapped));
 next(f);pw.counters.loyalty=11;await activate(f,pw,2);assert.ok(f.a.emblems.some(e=>e.c14Teferi));assert.ok(!f.game.activatableList(f.a).some(e=>e.card===pw));
 next(f);f.game.turnPlayer=f.b;f.game.phase='combat';f.decide=null;await activate(f,pw,0);assert.equal(pw.counters.loyalty,2);assert.ok(!f.game.activatableList(f.a).some(e=>e.card===pw));
});
test('Brine Elemental morph is paid and consecutive triggers skip two separate untap steps',async()=>{
 const f=setup(),b=await play(f,'Brine Elemental',{alt:{faceDownCast:'morph'}});assert.ok(b.faceDown);fuel(f.a);assert.equal(await f.game.turnFaceUp(f.a,b,'{5}{U}{U}','morph'),true);await settle(f.game);assert.equal(f.b.c14SkipUntaps,1);
 await event(f,'turnedFaceUp',{card:b,player:f.a});assert.equal(f.b.c14SkipUntaps,2);assert.equal(b.power,5);
 const l=card(f,'Island','battlefield',f.b);l.tapped=true;f.game.turnPlayer=f.b;f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};f.game.priorityRound=async()=>{};await f.game.runTurn();assert.ok(l.tapped);assert.equal(f.b.c14SkipUntaps,1);
 f.game.turnPlayer=f.b;await f.game.runTurn();assert.ok(l.tapped);assert.equal(f.b.c14SkipUntaps,0);f.game.turnPlayer=f.b;await f.game.runTurn();assert.equal(l.tapped,false);
});
test('Deep-Sea Kraken suspends, removes counters on opposing spells and casts with haste through two Stack triggers',async()=>{
 const f=setup(),k=card(f,'Deep-Sea Kraken','hand');fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===k&&e.suspend);assert.ok(e);await f.game.activateAbility(f.a,e);assert.equal(k.zone,'exile');assert.equal(k.meta.suspended,9);covered.add(k.name);
 k.meta.suspended=1;f.game.turnPlayer=f.b;await castOnly(f,'Opt',f.b);assert.equal(k.meta.suspended,1);await settle(f.game);assert.equal(k.zone,'battlefield');assert.ok(k.kw('haste'));assert.equal(f.game.canBlock(body(f,f.b),k),false);
});
test('Dulcet Sirens chooses both targets and forces an otherwise legal attack; morph is a separate action',async()=>{
 const f=setup(),s=await play(f,'Dulcet Sirens'),b=body(f,f.b),p=f.others[1];s.sick=false;targets(f,b,p);await activate(f,s);assert.equal(f.game.canAttackTarget(b,f.a),false);assert.equal(f.game.canAttackTarget(b,p),true);assert.ok(f.game.isForcedToAttack(b));
});
test('Domineering Will controls up to three nonattacking creatures, untaps them and enforces blocking',async()=>{
 const f=setup(),a=body(f,f.b),b=body(f,f.b);a.tapped=true;b.tapped=true;targets(f,f.a,a,b);await play(f,'Domineering Will');assert.equal(a.ctrl,f.a);assert.equal(b.ctrl,f.a);assert.equal(a.tapped,false);assert.ok(a.cur.mustBlock&&b.cur.mustBlock);
});
test('Fool’s Demise reanimates the enchanted creature and returns the Aura independently',async()=>{
 const f=setup(),b=body(f,f.b);targets(f,b);const aura=await play(f,"Fool's Demise");await die(f,b);assert.equal(b.zone,'battlefield');assert.equal(b.ctrl,f.a);assert.equal(aura.zone,'hand');
});
test('Frost Titan taps on entry and attack and counters opposing spells and activated abilities unless paid',async()=>{
 {const f=setup(),land=card(f,'Island','battlefield',f.b);targets(f,land);const t=await play(f,'Frost Titan');assert.ok(land.tapped&&land.meta.noUntapOnce);land.tapped=false;await event(f,'attacks',{card:t});assert.ok(land.tapped);}
 for(const pay of [false,true]){const f=setup(),t=card(f,'Frost Titan'),spell=card(f,'Tragic Slip','hand',f.b);fuel(f.b);f.decide=(p,q)=>q.type==='chooseTargets'?[t]:q.type==='chooseOption'&&q.prompt.includes('pay {2}')?(pay?'yes':'no'):undefined;
 assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),true);await settle(f.game);assert.equal(t.power,pay?5:6);}
 {const f=setup(),t=card(f,'Frost Titan'),s=card(f,'Dulcet Sirens','battlefield',f.b);s.sick=false;fuel(f.b);f.decide=(p,q)=>q.type==='chooseTargets'?q.candidates.filter(c=>c===t||c===f.a):q.type==='chooseOption'&&q.prompt.includes('pay {2}')?'no':undefined;await activate(f,s);assert.ok(!f.game.untilEffects.some(e=>e.kind==='mustAttackPlayerCard'));}
});
test('Infinite Reflection changes existing and entering nontoken creatures, preserves tokens and ends only its entry replacement',async()=>{
 const f=setup(),model=card(f,'Grizzly Bears'),other=card(f,'Serra Angel');targets(f,model);const aura=await play(f,'Infinite Reflection');assert.equal(other.name,'Grizzly Bears');const entrant=await play(f,'Frost Titan');assert.equal(entrant.name,'Grizzly Bears');assert.equal(entrant.power,2);
 await f.game.makeTokens(M.C14.token('Wolf',['Wolf'],2,2,['G']),f.a);assert.ok(tokens(f,f.a,'Wolf').length);await f.game.move(aura,'hand');assert.equal(other.name,'Grizzly Bears');await f.game.move(other,'hand');assert.equal(other.name,'Serra Angel');
});
test('Intellectual Offering draws three for two players and independently untaps nonlands',async()=>{
 const f=setup(),ring=card(f,'Sol Ring'),land=card(f,'Forest'),other=card(f,'Sol Ring','battlefield',f.b);ring.tapped=true;land.tapped=true;other.tapped=true;await play(f,'Intellectual Offering');assert.equal(f.a.hand.length,3);assert.equal(f.b.hand.length,3);assert.ok(!ring.tapped&&!other.tapped&&land.tapped);
});
test('Ixidron turns other nontoken creatures face down without allowing printed-mana-cost flips',async()=>{
 const f=setup(),a=card(f,'Serra Angel'),b=card(f,'Brine Elemental','battlefield',f.b);await f.game.makeTokens(M.C14.token('Wolf',['Wolf'],2,2,['G']),f.a);const i=await play(f,'Ixidron');assert.ok(a.faceDown&&b.faceDown);assert.equal(i.power,2);assert.equal(a.power,2);assert.deepEqual(Array.from(f.game.faceUpCosts(a)),[]);assert.equal(f.game.faceUpCosts(b)[0].kind,'morph');assert.ok(!tokens(f)[0].faceDown);
});
test('Phyrexian Ingester adds the exiled card’s actual power/toughness, including a CDA, until it leaves exile',async()=>{
 const f=setup(),b=card(f,'Serra Avatar','battlefield',f.b);f.b.life=9;f.game.recalc();targets(f,b);const i=await play(f,'Phyrexian Ingester');assert.equal(i.power,12);assert.equal(i.toughness,12);await f.game.move(b,'hand');f.game.recalc();assert.equal(i.power,3);
});
test('Shaper Parasite resolves either pump mode after a paid morph turn-up',async()=>{
 const f=setup(),b=body(f);const c=await play(f,'Shaper Parasite',{alt:{faceDownCast:'morph'}});fuel(f.a);targets(f,b);assert.equal(await f.game.turnFaceUp(f.a,c,'{2}{U}','morph'),true);await settle(f.game);assert.equal(b.zone,'graveyard');
});
test('Sphinx of Jwar Isle exposes only its controller’s top card and cannot be targeted',async()=>{
 const f=setup(),c=await play(f,'Sphinx of Jwar Isle');assert.equal(c.def.revealOwnTop,true);assert.ok(!f.game.legalTargets(M.T.creature(),body(f,f.b),f.b).includes(c));
 const top=card(f,'Distorting Wake','library');
 assert.equal(M.createBotPlayerView(f.game,f.a.idx).players.find(p=>p.id===f.a.idx).visibleLibraryTop.name,top.name);
 assert.equal(M.createBotPlayerView(f.game,f.b.idx).players.find(p=>p.id===f.a.idx).visibleLibraryTop,undefined);
 await f.game.move(c,'hand');assert.equal(M.createBotPlayerView(f.game,f.a.idx).players.find(p=>p.id===f.a.idx).visibleLibraryTop,undefined);
});
test('Sphinx of Uthuun gives the opponent a real pile choice, then puts the other pile into the graveyard',async()=>{
 const f=setup();let opponentChoice=false;f.decide=(p,q)=>{if(q.type==='chooseCards'&&q.prompt.includes('first pile')){opponentChoice=p===f.b;return q.from.slice(0,2);}if(q.type==='chooseOption'&&q.prompt.includes('choose a pile'))return 'one';};await play(f,'Sphinx of Uthuun');assert.ok(opponentChoice);assert.equal(f.a.hand.length,2);assert.equal(f.a.graveyard.length,3);
});
test('Stitcher Geralf mills everyone, exiles only milled creatures and makes the exact combined-power Zombie',async()=>{
 const f=setup(),g=await play(f,'Stitcher Geralf');g.sick=false;card(f,'Grizzly Bears','library');card(f,'Serra Angel','library',f.b);await activate(f,g);const zombie=tokens(f,f.a,'Zombie')[0];assert.equal(zombie.power,6);assert.equal(f.a.exile.length+f.b.exile.length,2);
});
test('Well of Ideas draws on entry and creates distinct own/opponent draw-step triggers',async()=>{
 const f=setup();await play(f,'Well of Ideas');assert.equal(f.a.hand.length,2);await event(f,'drawStep',{player:f.a});assert.equal(f.a.hand.length,4);await event(f,'drawStep',{player:f.b});assert.equal(f.b.hand.length,1);
});
test('Willbender changes a spell’s one target with paid morph, preserving the spell’s original controller',async()=>{
 const f=setup(),a=body(f),b=body(f,f.b),w=await play(f,'Willbender',{alt:{faceDownCast:'morph'}});targets(f,a);await castOnly(f,'Tragic Slip',f.b);const so=f.game.stack.find(s=>s.kind==='spell');
 f.decide=(p,q)=>q.type==='chooseTargets'?q.candidates.includes(so)?[so]:q.candidates.includes(b)?[b]:undefined:undefined;fuel(f.a);assert.equal(await f.game.turnFaceUp(f.a,w,'{1}{U}','morph'),true);await settle(f.game);assert.equal(a.power,2);assert.equal(b.power,1);
});
for(const role of ['human','ai'])test(role+': Ob Nixilis drains, makes a Demon and creates a paid sacrifice/draw emblem',async()=>{
 const f=setup(role),pw=await play(f,'Ob Nixilis of the Black Oath');await activate(f,pw,0);assert.equal(f.a.life,42);assert.equal(f.b.life,39);
 next(f);await activate(f,pw,1);assert.equal(f.a.life,40);const demon=tokens(f,f.a,'Demon')[0];assert.equal(demon.power,5);assert.ok(demon.kw('flying'));
 next(f);pw.counters.loyalty=8;await activate(f,pw,2);const emblem=f.a.emblems.find(e=>e.c14Ob);assert.ok(emblem);fuel(f.a);f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('emblem')?[demon]:undefined;
 const e=f.game.activatableList(f.a).find(e=>e.c14Emblem===emblem);assert.ok(e);const before=mana(f.a);assert.equal(await f.game.activateAbility(f.a,e),true);assert.equal(before-mana(f.a),2);assert.ok(f.game.stack.some(s=>s.kind==='ability'));assert.equal(demon.zone,'ceased');await settle(f.game);assert.equal(f.a.life,45);assert.equal(f.a.hand.length,5);
});
test('Abyssal Persecutor protects opponents from every SBA loss until it leaves and prevents its own alternate win',async()=>{
 const f=setup(),p=await play(f,'Abyssal Persecutor');f.b.life=-3;f.b.poison=10;f.b.deckedOut=true;await f.game.checkSBA();assert.equal(f.b.lost,false);assert.equal(f.game.canWinGame(f.a),false);
 const tyrant=card(f,'Hellkite Tyrant');for(let i=0;i<20;i++)card(f,'Sol Ring');await event(f,'upkeep',{player:f.a});assert.equal(f.game.gameOver,false);
 await f.game.move(p,'graveyard');await f.game.checkSBA();assert.equal(f.b.lost,true);assert.equal(f.game.canWinGame(f.a),true);
});
test('Aether Snap removes every permanent counter and exiles tokens without creating death events for them',async()=>{
 const f=setup(),b=body(f),pw=card(f,'Nahiri, the Lithomancer');pw.counters.loyalty=3;b.counters['+1/+1']=4;b.counters.shield=2;await f.game.makeTokens(M.C14.token('Wolf',['Wolf'],2,2,['G']),f.a);const wolf=tokens(f)[0];await play(f,'Aether Snap');assert.equal(b.counters['+1/+1'],0);assert.equal(b.counters.shield,0);assert.equal(pw.zone,'graveyard');assert.equal(wolf.zone,'ceased');assert.ok(!f.game.diedThisTurn.some(s=>s.iid===wolf.iid));
});
test('Crypt Ghast doubles Swamp mana and extort drains each opponent for a separate hybrid payment',async()=>{
 const f=setup(),c=await play(f,'Crypt Ghast'),swamp=card(f,'Swamp');const source=f.game.manaSources(f.a).find(s=>s.card===swamp);for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;assert.equal(await f.game.activateManaSource(f.a,source,source.produce[0]),true);assert.equal(f.a.pool.B,2);
 await play(f,'Opt');assert.equal(f.b.life,39);assert.equal(f.others[1].life,39);assert.equal(f.a.life,42);
});
test('Demon of Wailing Agonies requires its controller’s commander for its bonus and sacrifice trigger',async()=>{
 const f=setup(),d=await play(f,'Demon of Wailing Agonies'),b=body(f,f.b);assert.equal(d.power,4);const commander=card(f,'Ob Nixilis of the Black Oath');commander.commander=true;commander.counters.loyalty=3;f.game.recalc();assert.equal(d.power,6);await event(f,'combatDamageToPlayer',{card:d,player:f.b,n:6});assert.equal(b.zone,'graveyard');await f.game.move(commander,'hand');assert.equal(d.power,4);
});
test('Nekrataal excludes artifacts/black creatures and destroys through regeneration',async()=>{
 const f=setup(),b=body(f,f.b),black=card(f,'Abyssal Persecutor','battlefield',f.b),artifact=card(f,'Myr Retriever','battlefield',f.b);b.regenShield=1;targets(f,b);await play(f,'Nekrataal');assert.equal(b.zone,'graveyard');assert.equal(black.zone,'battlefield');assert.equal(artifact.zone,'battlefield');
});
test('Pontiff of Blight grants a distinct extort instance to every other creature',async()=>{
 const f=setup(),b=body(f);await play(f,'Pontiff of Blight');await play(f,'Opt');assert.equal(f.b.life,38);assert.equal(f.a.life,44);assert.equal(b.cur.extraTriggers.filter(t=>t.desc==='Extort').length,1);
});
test('Raving Dead selects a deterministic random opponent and halves life after combat damage',async()=>{
 const f=setup(),d=await play(f,'Raving Dead');await event(f,'beginCombat',{player:f.a});const target=f.game.untilEffects.find(e=>e.kind==='mustAttackPlayerCard').targetPlayer;assert.ok(Counterpart(f).includes(target));assert.equal(f.game.canAttackTarget(d,target),true);await f.game.damagePlayer(d,f.b,2,{combat:true});await event(f,'combatDamageToPlayer',{card:d,player:f.b,n:2});assert.equal(f.b.life,19);
 function Counterpart(f){return f.a.opponents(f.game);}
});
test('Skeletal Scrying exiles exactly X cards as an additional cost before resolution and then draws/loses X',async()=>{
 const f=setup(),cards=['Island','Mountain','Forest'].map(n=>card(f,n,'graveyard'));f.x=9;const s=await castOnly(f,'Skeletal Scrying');assert.ok(cards.every(c=>c.zone==='exile'));assert.equal(f.game.stack.find(o=>o.card===s).x,3);assert.equal(f.a.hand.length,0);await settle(f.game);assert.equal(f.a.hand.length,3);assert.equal(f.a.life,37);
});
test('Tragic Slip checks morbid when it resolves, including deaths in response',async()=>{
 const f=setup(),b=card(f,'Serra Angel','battlefield',f.b),sac=body(f);targets(f,b);await castOnly(f,'Tragic Slip');await f.game.sacrifice(f.a,sac);await settle(f.game);assert.equal(b.zone,'graveyard');
});
test('Wake the Dead enforces opponent combat timing, exact X targets and sacrifices only the returned incarnation',async()=>{
 const f=setup(),a=card(f,'Grizzly Bears','graveyard'),b=card(f,'Serra Angel','graveyard'),spell=card(f,'Wake the Dead','hand');fuel(f.a);assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),false);assert.equal(spell.zone,'hand');
 f.game.turnPlayer=f.b;f.game.phase='combat';f.x=2;targets(f,a,b);await play(f,spell.name,{card:spell});await f.game.move(a,'hand');await f.game.move(a,'battlefield',{ctrl:f.a});await event(f,'endStep',{player:f.b});assert.equal(a.zone,'battlefield');assert.equal(b.zone,'graveyard');
});
test('Xathrid Demon sacrifices another creature using its LKI power or taps and loses seven',async()=>{
 {const f=setup(),d=await play(f,'Xathrid Demon'),b=body(f);M.E.pumpUntilEOT(f.game,b,3,0);await event(f,'upkeep',{player:f.a});assert.equal(b.zone,'graveyard');assert.equal(f.b.life,35);assert.equal(d.zone,'battlefield');}
 {const f=setup(),d=await play(f,'Xathrid Demon');await event(f,'upkeep',{player:f.a});assert.equal(f.a.life,33);assert.ok(d.tapped);}
});
test('Bitter Feud doubles only damage between the two chosen players and their permanents',async()=>{
 const f=setup();f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('player')?q.options.find(o=>o.player===f.a||o.player===f.b)?.key:undefined;const feud=await play(f,'Bitter Feud'),a=body(f),b=body(f,f.b);assert.deepEqual(Array.from(feud.meta.c14Feud),[f.a,f.b]);
 await f.game.damagePlayer(a,f.b,2);assert.equal(f.b.life,36);await f.game.damagePlayer(a,f.others[1],2);assert.equal(f.others[1].life,38);await f.game.damageCreature(a,b,1);assert.equal(b.zone,'graveyard');
});
test('Caged Sun adds one chosen-color mana per land activation and only buffs that color',async()=>{
 const f=setup();f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a color')?'G':undefined;const c=await play(f,'Caged Sun'),b=body(f),forest=card(f,'Forest');const source=f.game.manaSources(f.a).find(s=>s.card===forest);f.a.pool.G=0;await f.game.activateManaSource(f.a,source,source.produce[0]);assert.equal(f.a.pool.G,2);assert.equal(b.power,3);await f.game.move(c,'hand');assert.equal(b.power,2);
});
test('Crown of Doom cannot be given to its owner and pumps creatures attacking its controller or planeswalkers',async()=>{
 const f=setup(),c=await play(f,'Crown of Doom');targets(f,f.b);await activate(f,c);assert.equal(c.ctrl,f.b);fuel(f.b);f.game.turnPlayer=f.b;const e=f.game.activatableList(f.b).find(e=>e.card===c);assert.ok(e);assert.ok(!f.game.legalTargets(c.def.abilities[0].targets[0],c,f.b).includes(f.a));
 const b=body(f);b.attacking=f.b;await event(f,'attacks',{card:b,player:f.a});assert.equal(b.power,4);
});
test('Epochrasite enters as 1/1 when cast from hand and returns from suspend as a hasty 4/4',async()=>{
 const f=setup(),c=await play(f,'Epochrasite');assert.equal(c.power,1);await die(f,c);assert.equal(c.zone,'exile');assert.equal(c.meta.suspended,3);c.meta.suspended=1;await M.C14.removeSuspend({g:f.game,src:c,you:f.a},c);await settle(f.game);assert.equal(c.zone,'battlefield');assert.equal(c.power,4);assert.ok(c.kw('haste'));
});
test('Goblin Welder exchanges only two legal artifacts belonging to the same player and does not require sacrifice to succeed',async()=>{
 {const f=setup(),w=await play(f,'Goblin Welder'),a=card(f,'Sol Ring','battlefield',f.b),b=card(f,'Thran Dynamo','graveyard',f.b);w.sick=false;targets(f,a,b);await activate(f,w);assert.equal(a.zone,'graveyard');assert.equal(b.zone,'battlefield');assert.equal(b.ctrl,f.b);}
 {const f=setup(),w=await play(f,'Goblin Welder'),a=card(f,'Myr Retriever'),b=card(f,'Thran Dynamo','graveyard'),suit=card(f,'Assault Suit');await f.game.attach(suit,a);w.sick=false;targets(f,a,b);await activate(f,w);assert.equal(a.zone,'battlefield');assert.equal(b.zone,'battlefield');}
});
test('Impact Resonance locks the turn’s greatest actual damage and the announced division, respecting prevention',async()=>{
 const f=setup(),source=body(f),a=card(f,'Serra Angel','battlefield',f.b),b=card(f,'Frost Titan','battlefield',f.others[1]);await f.game.damagePlayer(source,f.b,5);targets(f,a,b);f.x=3;const spell=await castOnly(f,'Impact Resonance');const so=f.game.stack.find(s=>s.card===spell);assert.equal(so.damageDivision.reduce((n,r)=>n+r.n,0),5);await f.game.damagePlayer(source,f.b,8);await settle(f.game);assert.equal(a.damage,3);assert.equal(b.damage,2);
});
test('Incite Rebellion counts each player’s creatures before dealing its simultaneous damage',async()=>{
 const f=setup();body(f);body(f,f.b);body(f,f.b);await play(f,'Incite Rebellion');assert.equal(f.a.life,39);assert.equal(f.b.life,38);assert.equal(f.others[1].life,40);assert.equal(f.game.creatures(f.b).length,0);assert.equal(f.game.creatures(f.a)[0].damage,1);
});
test('Scrap Mastery swaps all graveyard artifacts with the battlefield without returning freshly sacrificed cards',async()=>{
 const f=setup(),a=card(f,'Sol Ring'),b=card(f,'Thran Dynamo','graveyard'),c=card(f,'Mind Stone','battlefield',f.b),d=card(f,'Worn Powerstone','graveyard',f.b);await play(f,'Scrap Mastery');assert.equal(a.zone,'graveyard');assert.equal(c.zone,'graveyard');assert.equal(b.zone,'battlefield');assert.equal(d.zone,'battlefield');assert.equal(d.ctrl,f.b);
});
test('Volcanic Offering gives opponents their target choices before the spell is on the Stack; same targets get both instructions',async()=>{
 const f=setup(),l=card(f,'Command Tower','battlefield',f.b),c=card(f,'Serra Avatar','battlefield',f.b);let opponentSelections=0;
 f.decide=(p,q)=>{if(q.type==='chooseTargets'){if(p===f.b)opponentSelections++;return q.candidates.includes(l)?[l]:q.candidates.includes(c)?[c]:undefined;}};
 const spell=await castOnly(f,'Volcanic Offering');assert.equal(opponentSelections,2);const so=f.game.stack.find(s=>s.card===spell);assert.equal(so.targets[0],so.targets[1]);assert.equal(so.targets[2],so.targets[3]);await settle(f.game);assert.equal(l.zone,'graveyard');assert.equal(c.damage,14);
});
test('Word of Seizing has split second, untaps and temporarily controls any permanent with haste',async()=>{
 const f=setup(),c=card(f,'Sol Ring','battlefield',f.b);c.tapped=true;targets(f,c);const spell=await castOnly(f,'Word of Seizing');assert.ok(f.game.hasSplitSecond());await settle(f.game);assert.equal(c.ctrl,f.a);assert.equal(c.tapped,false);assert.ok(c.kw('haste'));f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();assert.equal(c.ctrl,f.b);
});
for(const role of ['human','ai'])test(role+': Freyalise makes a functioning mana Elf, destroys an artifact and draws for green creatures',async()=>{
 const f=setup(role),pw=await play(f,"Freyalise, Llanowar's Fury");await activate(f,pw,0);const elf=tokens(f,f.a,'Elf')[0];assert.ok(elf.hasSub('Druid'));assert.ok(!f.game.manaSources(f.a).some(s=>s.card===elf));elf.sick=false;const source=f.game.manaSources(f.a).find(s=>s.card===elf);assert.ok(source);f.a.pool.G=0;await f.game.activateManaSource(f.a,source,source.produce[0]);assert.equal(f.a.pool.G,1);
 next(f);const ring=card(f,'Sol Ring','battlefield',f.b);targets(f,ring);await activate(f,pw,1);assert.equal(ring.zone,'graveyard');next(f);pw.counters.loyalty=6;body(f);f.decide=null;await activate(f,pw,2);assert.equal(f.a.hand.length,2);
});
test('Fresh Meat counts creature tokens and owned creatures that died under another player’s control',async()=>{
 const f=setup(),b=body(f),other=body(f,f.b);await f.game.makeTokens(M.C14.token('Elf',['Elf'],1,1,['G']),f.a);const elf=tokens(f)[0];M.C14.control(f.game,b,f.b);await f.game.destroyMany([b,other,elf]);await play(f,'Fresh Meat');assert.equal(tokens(f,f.a,'Beast').length,2);
});
test('Grave Sifter lets each player choose any creature type and return any number of matching cards',async()=>{
 const f=setup(),a=card(f,'Llanowar Elves','graveyard'),b=card(f,'Grizzly Bears','graveyard',f.b);await play(f,'Grave Sifter');assert.equal(a.zone,'hand');assert.equal(b.zone,'hand');
});
test('Haunted Fengraf pays mana and sacrifices itself before returning a seeded random creature',async()=>{
 const f=setup(),land=card(f,'Haunted Fengraf'),b=card(f,'Grizzly Bears','graveyard');covered.add(land.name);await activate(f,land);assert.equal(land.zone,'graveyard');assert.equal(b.zone,'hand');
});
test('Praetor’s Counsel returns the entire graveyard, exiles itself and permanently removes maximum hand size',async()=>{
 const f=setup(),a=card(f,'Sol Ring','graveyard'),b=card(f,'Island','graveyard'),s=await play(f,"Praetor's Counsel");assert.equal(a.zone,'hand');assert.equal(b.zone,'hand');assert.equal(s.zone,'exile');assert.equal(f.game.maximumHandSize(f.a),Infinity);
});
test('Siege Behemoth lets each attacker assign through blockers while blockers still deal their damage',async()=>{
 const f=setup(),behemoth=await play(f,'Siege Behemoth'),b=body(f),block=body(f,f.b);b.attacking=f.b;b.wasBlocked=true;b.blockedBy=[block];behemoth.attacking=f.b;f.game.combat={attackers:[b,behemoth]};f.game.recalc();assert.ok(b.cur.mayAssignUnblocked);await f.game.combatDamage(f.a,'normal');assert.equal(f.b.life,31);assert.equal(b.zone,'graveyard');assert.equal(block.zone,'battlefield');
});
test('Song of the Dryads removes all types, colors and abilities and grants only Forest mana, then restores them on departure',async()=>{
 const f=setup(),c=card(f,'Frost Titan','battlefield',f.b);targets(f,c);const song=await play(f,'Song of the Dryads');assert.ok(c.is('Land')&&!c.is('Creature'));assert.ok(c.hasSub('Forest'));assert.deepEqual(Array.from(c.colors),[]);assert.ok(c.cur.abilitiesDisabled);assert.ok(f.game.manaSources(f.b).some(s=>s.card===c&&s.produce.some(o=>o.G)));
 await f.game.move(song,'hand');assert.ok(c.is('Creature')&&!c.is('Land'));assert.equal(c.cur.abilitiesDisabled,false);
});
test('Wave of Vitriol sacrifices artifacts, enchantments and only nonbasic lands, replacing each sacrificed land with a tapped basic',async()=>{
 const f=setup(),basic=card(f,'Forest'),non=card(f,'Command Tower'),artifact=card(f,'Sol Ring'),oppLand=card(f,'Arcane Lighthouse','battlefield',f.b);await play(f,'Wave of Vitriol');assert.equal(basic.zone,'battlefield');assert.equal(non.zone,'graveyard');assert.equal(artifact.zone,'graveyard');assert.equal(oppLand.zone,'graveyard');assert.equal(f.game.lands(f.a).length,2);assert.ok(f.game.lands(f.a).some(c=>c!==basic&&c.tapped));assert.equal(f.game.lands(f.b).length,1);
});
test('Wolfbriar Elemental counts each paid multikicker and Wolfcaller’s Howl counts opponents with four cards',async()=>{
 const f=setup();f.x=2;await play(f,'Wolfbriar Elemental');assert.equal(tokens(f,f.a,'Wolf').length,2);const howl=await play(f,"Wolfcaller's Howl");for(let i=0;i<4;i++)card(f,'Island','hand',f.b);await event(f,'upkeep',{player:f.a});assert.equal(tokens(f,f.a,'Wolf').length,3);
});
test('Wren’s Run Packmaster champions and returns the exact Elf, creates Wolves and grants deathtouch',async()=>{
 const f=setup(),elf=card(f,'Llanowar Elves'),p=await play(f,"Wren's Run Packmaster");assert.equal(elf.zone,'exile');await activate(f,p);const wolf=tokens(f,f.a,'Wolf')[0];assert.ok(wolf.kw('deathtouch'));await die(f,p);assert.equal(elf.zone,'battlefield');assert.ok(!wolf.kw('deathtouch'));
});
test('every one of the 65 C14 additions is exercised by a rules scenario',()=>{assert.deepEqual(intake.newNames.filter(n=>!covered.has(n)),[]);});

for(const role of ['human','ai'])test(role+': automatic mana payment uses Crypt Ghast and Caged Sun without pre-tapping or duplicate bonuses',async()=>{
 for(const mode of ['ghast','sun','both']){
  const f=setup(role);if(mode!=='sun')card(f,'Crypt Ghast');if(mode!=='ghast'){const sun=card(f,'Caged Sun');sun.meta.c14Color=mode==='sun'?'G':'B';f.game.recalc();}
  const land=card(f,mode==='sun'?'Forest':'Swamp');for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;
  const target=body(f,f.b),spell=card(f,mode==='sun'?'Grizzly Bears':mode==='both'?'Murder':'Sign in Blood','hand');
  const to=mode==='both'?target:f.b;targets(f,to);
  assert.ok(f.game.castableList(f.a).some(e=>e.card===spell),'bonus mana makes the actual spell affordable');
  assert.equal(await f.game.castSpell(f.a,spell,{from:'hand',quickTargets:[to]}),true);assert.ok(land.tapped);assert.equal(mana(f.a),0,'base and bonus mana are spent exactly once');await settle(f.game);
  if(mode==='both')assert.equal(target.zone,'graveyard');if(mode==='sun')assert.equal(spell.zone,'battlefield');
 }
});
test('Willbender retargets an actual activated ability and binds its later death return to the new target',async()=>{
 const f=setup(),a=body(f),b=body(f,f.b),v=card(f,'Adarkar Valkyrie','battlefield',f.b),w=await play(f,'Willbender',{alt:{faceDownCast:'morph'}});v.sick=false;targets(f,a);
 const entry=f.game.activatableList(f.b).find(e=>e.card===v&&e.ability);assert.equal(await f.game.activateAbility(f.b,entry),true);const so=f.game.stack.find(s=>s.kind==='ability');assert.ok(so);
 f.decide=(p,q)=>q.type==='chooseTargets'?q.candidates.includes(so)?[so]:q.candidates.includes(b)?[b]:undefined:undefined;fuel(f.a);assert.equal(await f.game.turnFaceUp(f.a,w,'{1}{U}','morph'),true);await settle(f.game);
 await die(f,a);assert.equal(a.zone,'graveyard');await die(f,b);assert.equal(b.zone,'battlefield');assert.equal(b.ctrl,f.b);
});

test('Lieutenant ignores a stolen opposing commander and uses the current controller’s own commander',async()=>{
 const f=setup(),d=await play(f,'Demon of Wailing Agonies'),foreign=card(f,'Teferi, Temporal Archmage','battlefield',f.b);foreign.commander=true;foreign.counters.loyalty=5;M.C14.control(f.game,foreign,f.a);assert.equal(d.power,4);
 const own=card(f,'Ob Nixilis of the Black Oath');own.commander=true;own.counters.loyalty=3;f.game.recalc();assert.equal(d.power,6);M.C14.control(f.game,own,f.b);assert.equal(d.power,4);
});
test('Song of the Dryads removes printed abilities while retaining abilities granted by older and newer effects',async()=>{
 const f=setup(),c=card(f,'Frost Titan');M.E.grantUntilEOT(f.game,c,['vigilance']);targets(f,c);const aura=await play(f,'Song of the Dryads');assert.equal(c.is('Creature'),false);assert.equal(c.is('Land'),true);assert.equal(c.hasSub('Forest'),true);assert.equal(c.cur.abilitiesDisabled,true);assert.equal(c.kw('vigilance'),true);
 M.E.grantUntilEOT(f.game,c,['haste']);assert.equal(c.kw('haste'),true);const sources=f.game.manaSources(f.a).filter(e=>e.card===c);assert.equal(sources.length,1);assert.equal(sources[0].produce[0].G,1);
 await f.game.move(aura,'hand');assert.equal(c.is('Creature'),true);assert.equal(c.is('Land'),false);assert.equal(c.cur.abilitiesDisabled,false);
});

test('Local AI sacrifices its own Persecutor to Disciple of Bolas to release already-lost opponents',async()=>{
 const f=setup('ai'),persecutor=card(f,'Abyssal Persecutor');body(f);for(const p of f.others)p.life=-2;
 await play(f,'Disciple of Bolas');assert.equal(persecutor.zone,'graveyard');assert.equal(f.game.gameOver,true);assert.equal(f.game.winner,f.a);
});
test('Local AI casts removal on its own Persecutor when that action wins',async()=>{
 const f=setup('ai'),persecutor=card(f,'Abyssal Persecutor'),spell=card(f,'Go for the Throat','hand');for(const p of f.others)p.life=0;fuel(f.a);
 const action=await f.a.controller.decide(f.game,{type:'main',player:f.a,casts:f.game.castableList(f.a),acts:f.game.activatableList(f.a),lands:[],phase:f.game.phase});assert.equal(action.kind,'cast');assert.equal(action.card,spell);
 assert.equal(await f.game.performAction(f.a,action),true);await settle(f.game);assert.equal(persecutor.zone,'graveyard');assert.equal(f.game.winner,f.a);
});
test('Local AI preserves an opposing Persecutor that is keeping it alive',async()=>{
 const f=setup('ai'),persecutor=card(f,'Abyssal Persecutor','battlefield',f.b);f.a.life=-2;card(f,'Go for the Throat','hand');fuel(f.a);
 const action=await f.a.controller.decide(f.game,{type:'main',player:f.a,casts:f.game.castableList(f.a),acts:f.game.activatableList(f.a),lands:[],phase:f.game.phase});assert.equal(action.kind,'done');assert.equal(persecutor.zone,'battlefield');assert.equal(f.a.lost,false);
});
test('Local AI prioritizes Ob Nixilis’s emblem, then uses its real paid sacrifice action to win',async()=>{
 const f=setup('ai'),persecutor=card(f,'Abyssal Persecutor'),ob=card(f,'Ob Nixilis of the Black Oath');ob.counters.loyalty=8;for(const p of f.others)p.life=0;fuel(f.a);f.game.recalc();
 const query=()=>({type:'main',player:f.a,casts:f.game.castableList(f.a),acts:f.game.activatableList(f.a),lands:[],phase:f.game.phase});
 const ultimate=await f.a.controller.decide(f.game,query());assert.equal(ultimate.kind,'activate');assert.equal(ultimate.entry.ability.loyalty,-8);await f.game.performAction(f.a,ultimate);await settle(f.game);
 const sacrifice=await f.a.controller.decide(f.game,query());assert.equal(sacrifice.kind,'activate');assert.ok(sacrifice.entry.c14Emblem);await f.game.performAction(f.a,sacrifice);await settle(f.game);assert.equal(persecutor.zone,'graveyard');assert.equal(f.game.winner,f.a);
});
