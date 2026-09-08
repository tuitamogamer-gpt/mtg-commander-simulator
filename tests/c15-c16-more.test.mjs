import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target,tokens} from './helpers/c15-c16-fixtures.mjs';
const die=async(f,c)=>{await f.game.destroy(c);await settle(f.game);};
const pick=(f,{targets=[],mode,modes,extra}={})=>{f.decide=(p,q)=>{const result=extra?.(p,q);if(result!==undefined)return result;if(q.type==='chooseTargets'&&targets.length)return q.candidates.filter(c=>targets.includes(c)).slice(0,q.max);if(q.type==='chooseMulti'&&modes)return modes.map(String);if(q.type==='chooseOption'&&q.aiHint?.kind==='mode'&&mode!==undefined)return String(mode);};};
const castOnly=async(f,n,opts={})=>{const c=opts.card||card(f,n,opts.from||'hand',opts.player||f.a),p=opts.player||f.a;fuel(p);assert.equal(await f.game.castSpell(p,c,{from:c.zone,...opts}),true,n);return c;};
const clean=f=>{f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();};

test('Chief Engineer convokes artifacts with sick creatures and never grants creature mana for other spells',async()=>{
 const f=setup(),c=await play(f,'Chief Engineer'),b=body(f),a=card(f,'Sol Ring','hand');for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;assert.ok(f.game.castableList(f.a).some(e=>e.card===a));assert.equal(await f.game.castSpell(f.a,a,{from:'hand'}),true);await settle(f.game);assert.ok(c.tapped||b.tapped);assert.ok(!f.game.manaSources(f.a,{card:card(f,'Opt','hand')}).some(s=>s.m.viaConvoke));
});
test('Sphere taxes attacks on both its player and planeswalker by enchantment count',async()=>{
 const f=setup(),s=await play(f,'Sphere of Safety'),a=body(f,f.b),pw=card(f,'Teferi, Temporal Archmage');await play(f,'Phyrexian Arena');assert.equal(f.game.c21AttackTax(a,f.a),2);assert.equal(f.game.c21AttackTax(a,pw),2);await f.game.move(s,'hand');assert.equal(f.game.c21AttackTax(a,f.a),0);
});
test('Fetters locks paid nonmana abilities while mana remains available; Vow prevents attacking its controller',async()=>{
 const f=setup(),a=card(f,'Mind Stone','battlefield',f.b);target(f,a);const fetters=await play(f,"Faith's Fetters");assert.equal(f.a.life,44);assert.ok(f.game.manaSources(f.b).some(s=>s.card===a));assert.ok(!f.game.activatableList(f.b).some(e=>e.card===a));const b=body(f,f.b);target(f,b);await play(f,'Vow of Malice');assert.equal(b.power,4);assert.ok(b.kw('intimidate'));assert.equal(f.game.canAttackTarget(b,f.a),false);assert.equal(f.game.canAttackTarget(b,f.others[1]),true);await f.game.move(fetters,'hand');fuel(f.b);assert.ok(f.game.activatableList(f.b).some(e=>e.card===a));
});
test('Bestow Nighthowler counts all graveyards and Noble Quarry applies lure to the host then to itself',async()=>{
 for(const name of ['Nighthowler','Noble Quarry']){const f=setup(),b=body(f);card(f,'Grizzly Bears','graveyard');card(f,'Serra Angel','graveyard',f.b);target(f,b);const c=await play(f,name,{alt:{bestow:true,altCostStr:M.DEFS[name].bestowCost}});assert.ok(c.hasSub('Aura')&&!c.is('Creature'));assert.equal(b.power,name==='Nighthowler'?4:3);if(name==='Noble Quarry')assert.ok(b.cur.lure);await f.game.move(b,'hand');await settle(f.game);assert.ok(c.is('Creature'));assert.equal(c.power,name==='Nighthowler'?2:1);if(name==='Noble Quarry')assert.ok(c.cur.lure);}
});
test('Ajani creates and attaches its Cat; Shielded by Faith follows later creatures without targeting',async()=>{
 const f=setup();await play(f,"Ajani's Chosen");const b=body(f);target(f,b);const s=await play(f,'Shielded by Faith');assert.equal(tokens(f).length,1);assert.equal(s.attachedTo,tokens(f)[0].iid);const next=await play(f,'Grizzly Bears');assert.equal(s.attachedTo,next.iid);assert.ok(next.kw('indestructible'));assert.ok(!b.kw('indestructible'));
});
test('Frenzied Fugue repeats its timed control and untap every controller upkeep',async()=>{
 const f=setup(),b=body(f,f.b);b.tapped=true;target(f,b);await play(f,'Frenzied Fugue');assert.equal(b.ctrl,f.a);assert.ok(!b.tapped&&b.kw('haste'));clean(f);assert.equal(b.ctrl,f.b);await event(f,'upkeep',{player:f.a});assert.equal(b.ctrl,f.a);
});
test('Cauldron grants actual persist; Caller counts owned nontoken deaths, including stolen creatures',async()=>{
 const f=setup(),b=body(f),c=await play(f,'Cauldron of Souls');target(f,b);await activate(f,c);await die(f,b);assert.equal(b.zone,'battlefield');assert.equal(b.counters['-1/-1'],1);await die(f,b);assert.equal(b.zone,'graveyard');const other=body(f);M.C14.control(f.game,other,f.b);await die(f,other);await play(f,'Caller of the Claw');assert.equal(tokens(f).length,3);
});
test('Fathom Mage checks evolve again at resolution and draws once per added counter',async()=>{
 const f=setup(),m=await play(f,'Fathom Mage');await play(f,'Grizzly Bears');assert.equal(m.counters['+1/+1'],1);assert.equal(f.a.hand.length,1);f.game.addCounters(m,'+1/+1',3,false,f.a);await settle(f.game);assert.equal(f.a.hand.length,4);const b=await castOnly(f,'Serra Angel');await f.game.resolveTop();f.game.addCounters(m,'+1/+1',3,false,f.a);await settle(f.game);assert.equal(m.counters['+1/+1'],7);assert.equal(b.zone,'battlefield');
});
test('Nath random discard makes a Warrior; Goblin Spymaster and its curse force attacks on the right player',async()=>{
 const f=setup(),n=await play(f,'Nath of the Gilt-Leaf'),c=card(f,'Island','hand',f.b);target(f,f.b);await event(f,'upkeep',{player:f.a});assert.equal(c.zone,'graveyard');assert.equal(tokens(f).length,1);await play(f,'Goblin Spymaster');const b=body(f,f.b);await event(f,'endStep',{player:f.b});assert.ok(b.cur.mustAttack);const d=body(f,f.others[1]);target(f,f.others[1]);await play(f,'Curse of the Nightly Hunt');assert.ok(d.cur.mustAttack);assert.ok(!n.cur.mustAttack);
});
test('Fumiko bushido counts all attackers; Godo searches Equipment and adds combat only on its first attack',async()=>{
 const f=setup(),e=card(f,'Sunforger','library'),g=await play(f,'Godo, Bandit Warlord'),fu=await play(f,'Fumiko the Lowblood'),b=body(f,f.b);assert.equal(e.zone,'battlefield');assert.ok(b.cur.mustAttack);g.attacking=f.b;fu.attacking=f.b;g.tapped=true;await event(f,'attacks',{card:g,player:f.a,defender:f.b});assert.ok(!g.tapped);assert.equal(f.game._additionalPhases.length,1);await event(f,'attacks',{card:g,player:f.a,defender:f.b});assert.equal(f.game._additionalPhases.length,1);await event(f,'becomesBlocked',{attacker:fu,blockers:[b]});assert.equal(fu.power,5);
});
test('Breath of Fury sacrifices the damaging object, reattaches then untaps and adds combat',async()=>{
 const f=setup(),a=body(f),b=body(f);b.tapped=true;target(f,a);const aura=await play(f,'Breath of Fury');await event(f,'damageToPlayer',{src:a,player:f.b,n:2,combat:true});assert.equal(a.zone,'graveyard');assert.equal(aura.zone,'battlefield');assert.equal(aura.attachedTo,b.iid);assert.ok(!b.tapped);assert.equal(f.game._additionalPhases.length,1);
});
test('Tymna counts opponents hit by anyone and pays only that count; Edric rewards the actual damaging controller',async()=>{
 const f=setup(),b=body(f,f.b);await play(f,'Tymna the Weaver');await play(f,'Edric, Spymaster of Trest');await f.game.damagePlayer(b,f.others[1],2,{combat:true});await settle(f.game);assert.equal(f.b.hand.length,1);await event(f,'postcombatMain',{player:f.a,ordinal:2});assert.equal(f.a.life,39);assert.equal(f.a.hand.length,1);
});
test('Urza’s Incubator reduces every chosen creature type; Seal picks two distinct colors and reduces generic mana only',async()=>{
 const f=setup();f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='Bear')?'Bear':undefined;await play(f,"Urza's Incubator");const b=card(f,'Grizzly Bears','hand',f.b);assert.equal(f.game.spellCost(f.b,b).generic,0);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose color')?(q.options.some(o=>o.key==='G')?'G':'U'):undefined;await play(f,'Seal of the Guildpact');const e=card(f,'Ezuri, Claw of Progress','hand');assert.equal(f.game.spellCost(f.a,e).generic,0);assert.equal(f.game.spellCost(f.a,e).pips.length,2);
});
test('Prismatic Geoscope counts basic land types; Orchard and Zhur-Taa use real tapped-for-mana triggers',async()=>{
 const f=setup(),p=await play(f,'Prismatic Geoscope');card(f,'Forest');card(f,'Island');p.tapped=false;const s=f.game.manaSources(f.a).find(s=>s.card===p);assert.equal(s.produce[0].n,2);for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;await f.game.activateManaSource(f.a,s,s.produce[0]);assert.equal(mana(f.a),2);
 const orchard=card(f,'Forbidden Orchard');target(f,f.b);const os=f.game.manaSources(f.a).find(s=>s.card===orchard);await f.game.activateManaSource(f.a,os,os.produce[0]);await settle(f.game);assert.equal(tokens(f,f.b).length,1);assert.equal(tokens(f,f.b)[0].colors.length,0);
 const d=await play(f,'Zhur-Taa Druid');d.sick=false;const ds=f.game.manaSources(f.a).find(s=>s.card===d);await f.game.activateManaSource(f.a,ds,ds.produce[0]);await settle(f.game);assert.equal(f.b.life,39);assert.equal(f.others[1].life,39);
});
test('Charging Cinderhorn accumulates only on turns without declared attacks; Guiltfeeder triggers after no blocks',async()=>{
 const f=setup(),c=await play(f,'Charging Cinderhorn');await event(f,'endStep',{player:f.b});assert.equal(c.counters.fury,1);assert.equal(f.b.life,39);await event(f,'attacks',{card:c,player:f.a,defender:f.b});await event(f,'endStep',{player:f.a});assert.equal(c.counters.fury,1);const g=await play(f,'Guiltfeeder');card(f,'Island','graveyard',f.b);g.attacking=f.b;f.game.combat={attackers:[g]};await event(f,'blockersDeclared',{player:f.a,attackers:[g]});assert.equal(f.b.life,38);
});
test('Grave Peril does not destroy black creatures and sacrifices itself for the next nonblack one',async()=>{
 const f=setup(),g=await play(f,'Grave Peril');await play(f,'Karlov of the Ghost Council');assert.equal(g.zone,'battlefield');const b=await play(f,'Grizzly Bears');assert.equal(g.zone,'graveyard');assert.equal(b.zone,'graveyard');
});
test('Alesha pays the hybrid cost and reanimates a small creature tapped and attacking',async()=>{
 const f=setup(),a=await play(f,'Alesha, Who Smiles at Death'),b=card(f,'Grizzly Bears','graveyard');a.attacking=f.b;f.game.combat={attackers:[a],hadAttackers:true,defenders:new Map()};fuel(f.a);const n=mana(f.a);target(f,b);await event(f,'attacks',{card:a,player:f.a,defender:f.b});assert.equal(n-mana(f.a),2);assert.equal(b.zone,'battlefield');assert.ok(b.tapped&&b.attacking);assert.ok(f.game.combat.attackers.includes(b));
});
test('Melek casts and copies off the top; Yidris grants cascade only to hand casts after combat damage',async()=>{
 const f=setup(),m=await play(f,'Melek, Izzet Paragon'),b=card(f,'Lightning Bolt','library');target(f,f.b);fuel(f.a);const e=f.game.castableList(f.a).find(e=>e.card===b);assert.ok(e);await f.game.castSpell(f.a,b,{from:e.from,alt:e.alt});await settle(f.game);assert.equal(f.b.life,34);await f.game.move(m,'hand');const y=await play(f,'Yidris, Maelstrom Wielder');await event(f,'damageToPlayer',{src:y,player:f.b,n:1,combat:true});const hit=card(f,'Sol Ring','library');await play(f,'Grizzly Bears');assert.equal(hit.zone,'battlefield');assert.equal(f.a.turnState.c1516Cascades,1);
});
test('Bloodspore devours before entry and adds counters to later creatures; Blood Tyrant counts life actually lost',async()=>{
 const f=setup(),a=body(f),b=body(f),t=await play(f,'Bloodspore Thrinax');assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');assert.equal(t.counters['+1/+1'],2);const c=await play(f,'Grizzly Bears');assert.equal(c.counters['+1/+1'],2);const bt=await play(f,'Blood Tyrant');await event(f,'upkeep',{player:f.a});assert.equal(bt.counters['+1/+1'],5);assert.equal(f.a.life,39);
});
test('Curse of Vengeance tracks casts and pays its spite when enchanted opponent leaves the game',async()=>{
 const f=setup();target(f,f.b);const c=await play(f,'Curse of Vengeance');f.decide=null;f.game.turnPlayer=f.b;await play(f,'Grizzly Bears',{player:f.b});assert.equal(c.counters.spite,1);await f.game.playerLoses(f.b,'conceded');await settle(f.game);assert.equal(f.a.life,41);assert.equal(f.a.hand.length,1);
});
test('Day of Dragons and Diabolic Servitude link exact exiled/reanimated objects across leave triggers',async()=>{
 {const f=setup(),b=body(f),d=await play(f,'Day of the Dragons');assert.equal(b.zone,'exile');assert.equal(tokens(f)[0].power,5);await f.game.move(d,'hand');await settle(f.game);assert.equal(b.zone,'battlefield');assert.equal(tokens(f).length,0);}
 {const f=setup(),b=card(f,'Grizzly Bears','graveyard');target(f,b);const d=await play(f,'Diabolic Servitude');assert.equal(b.zone,'battlefield');await die(f,b);assert.equal(b.zone,'exile');assert.equal(d.zone,'hand');}
});
test('Faerie Artisans replaces prior copies; Progenitor Mimic copies ETB and creates no recursive token triggers',async()=>{
 const f=setup();await play(f,'Faerie Artisans');f.game.turnPlayer=f.b;await play(f,'Grizzly Bears',{player:f.b});const old=tokens(f)[0];assert.ok(old.is('Artifact'));await play(f,'Serra Angel',{player:f.b});assert.notEqual(old.zone,'battlefield');assert.equal(tokens(f).length,1);assert.equal(tokens(f)[0].name,'Serra Angel');
 f.game.turnPlayer=f.a;f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('Progenitor')?[f.game.creatures(f.b).find(c=>c.name==='Grizzly Bears')]:undefined;const m=await play(f,'Progenitor Mimic');assert.equal(m.name,'Grizzly Bears');assert.equal(m.power,2);await event(f,'upkeep',{player:f.a});const n=tokens(f).length;await event(f,'upkeep',{player:f.a});assert.equal(tokens(f).length,n+1);
});
test('Grip of Phyresis takes an Equipment and attaches it before state-based actions; Hostility prevents spell damage',async()=>{
 const f=setup(),s=card(f,'Behemoth Sledge','battlefield',f.b);target(f,s);await play(f,'Grip of Phyresis');assert.equal(s.ctrl,f.a);const germ=tokens(f)[0];assert.equal(s.attachedTo,germ.iid);assert.equal(germ.power,2);assert.equal(germ.toughness,2);await settle(f.game);
});
test('Hostility creates hasty Shamans for prevented damage and shuffles after entering the graveyard from hand',async()=>{
 const f=setup(),h=await play(f,'Hostility');target(f,f.b);await play(f,'Lightning Bolt');assert.equal(f.b.life,40);assert.equal(tokens(f).length,3);assert.ok(tokens(f).every(c=>c.kw('haste')));await f.game.move(h,'hand');await f.game.discard(f.a,[h]);await settle(f.game);assert.equal(h.zone,'library');
});
test('Aethersnatch changes the resolving spell controller and Chain of Vapor grants a real copy to its former controller',async()=>{
 {const f=setup();f.game.turnPlayer=f.b;const b=await castOnly(f,'Grizzly Bears',{player:f.b});target(f,f.game.stack.at(-1));await play(f,'Aethersnatch');assert.equal(b.ctrl,f.a);assert.equal(b.zone,'battlefield');}
 {const f=setup(),a=body(f),b=body(f,f.b),l=card(f,'Island','battlefield',f.b);pick(f,{extra:(p,q)=>q.type==='chooseTargets'?[q.candidates.includes(b)?b:a]:undefined});await play(f,'Chain of Vapor');assert.equal(b.zone,'hand');assert.equal(l.zone,'graveyard');assert.equal(a.zone,'hand');}
});
test('Spelltwine exiles two independent graveyard spells and casts both copies; cipher copies only after encoded combat damage',async()=>{
 {const f=setup(),a=card(f,'Lightning Bolt','graveyard'),b=card(f,'Opt','graveyard',f.b);pick(f,{targets:[a,b,f.b]});const s=await play(f,'Spelltwine');assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');assert.equal(s.zone,'exile');assert.equal(f.b.life,37);assert.equal(f.a.hand.length,1);}
 {const f=setup(),b=body(f);card(f,'Island','hand');const s=await play(f,'Whispering Madness');assert.equal(s.zone,'exile');assert.equal(f.a.hand.length,1);const before=f.a.library.length;await event(f,'damageToPlayer',{src:b,player:f.b,n:2,combat:true});assert.ok(f.a.library.length<before);assert.equal(s.zone,'exile');}
});
test('Fact or Fiction and Steam Augury assign the split and choice to different players',async()=>{
 for(const name of ['Fact or Fiction','Steam Augury']){const f=setup(),top=[card(f,'Opt','library'),card(f,'Sol Ring','library')];let splitter,chooser;pick(f,{extra:(p,q)=>{if(q.type==='chooseCards'&&q.prompt.includes('first pile')){splitter=p;return top;}if(q.type==='chooseOption'&&q.prompt.includes('choose a pile')){chooser=p;return 'one';}}});await play(f,name);assert.equal(splitter,name==='Fact or Fiction'?f.b:f.a);assert.equal(chooser,name==='Fact or Fiction'?f.a:f.b);assert.equal(f.a.hand.length,2);assert.equal(f.a.graveyard.length,4);}
});
test('Join forces aggregates separate paid contributions for draw and tapped basic lands',async()=>{
 for(const name of ['Minds Aglow','Collective Voyage']){const f=setup();for(const p of f.game.players)fuel(p);pick(f,{extra:(p,q)=>q.type==='chooseX'?1:undefined});await play(f,name);for(const p of f.game.players){if(name==='Minds Aglow')assert.equal(p.hand.length,3);else{assert.equal(f.game.lands(p).length,3);assert.ok(f.game.lands(p).every(c=>c.tapped));}}}
});
test('Manifold Insights lets each opponent pick a different nonland and Arjun cycles the remaining hand',async()=>{
 const f=setup();const a=card(f,'Opt','library'),b=card(f,'Sol Ring','library'),c=card(f,'Serra Angel','library');await play(f,'Manifold Insights');assert.equal(f.a.hand.length,2);assert.ok([a,b,c].filter(c=>c.zone==='hand').length===2);const ar=await play(f,'Arjun, the Shifting Flame');const old=f.a.hand.slice();await play(f,'Grizzly Bears');assert.equal(f.a.hand.length,2);assert.ok(old.every(c=>c.zone==='library'));assert.equal(ar.zone,'battlefield');
});
test('Divergent Transformations replaces each legal target; Synthetic Destiny delays replacements until end step',async()=>{
 {const f=setup(),a=body(f),b=body(f,f.b),x=card(f,'Serra Angel','library'),y=card(f,'Sandstone Oracle','library',f.b);target(f,a,b);await play(f,'Divergent Transformations');assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');assert.equal(x.zone,'battlefield');assert.equal(y.zone,'battlefield');}
 {const f=setup(),a=body(f),x=card(f,'Serra Angel','library');await play(f,'Synthetic Destiny');assert.equal(a.zone,'exile');assert.equal(x.zone,'library');await event(f,'endStep',{player:f.b});assert.equal(x.zone,'battlefield');}
});
test('Gamekeeper exiles itself then mills the revealed noncreatures; Conscription manifests and pays actual creature cost',async()=>{
 {const f=setup(),g=await play(f,'Gamekeeper'),b=card(f,'Grizzly Bears','library'),l=card(f,'Island','library');await die(f,g);assert.equal(g.zone,'exile');assert.equal(b.zone,'battlefield');assert.equal(l.zone,'graveyard');}
 {const f=setup(),b=card(f,'Serra Angel','graveyard',f.b);target(f,f.b);await play(f,'Ghastly Conscription');assert.ok(b.faceDown);assert.equal(b.ctrl,f.a);assert.equal(b.power,2);fuel(f.a);const n=mana(f.a);assert.equal(await f.game.turnFaceUp(f.a,b,'{3}{W}{W}','mana cost'),true);assert.equal(n-mana(f.a),5);assert.equal(b.name,'Serra Angel');assert.ok(b.kw('flying'));}
});
test('Stolen Goods grants a free cast from exile only this turn; Tempt and Firemind preserve search choices',async()=>{
 {const f=setup(),b=card(f,'Serra Angel','library',f.b);card(f,'Island','library',f.b);target(f,f.b);await play(f,'Stolen Goods');assert.equal(b.zone,'exile');fuel(f.a);const e=f.game.castableList(f.a).find(e=>e.card===b);assert.ok(e&&e.alt.free);await f.game.castSpell(f.a,b,{from:e.from,alt:e.alt});await settle(f.game);assert.equal(b.ctrl,f.a);}
 {const f=setup();await play(f,'Tempt with Discovery');assert.equal(f.game.lands(f.a).length,3);assert.equal(f.game.lands(f.b).length,1);assert.equal(f.game.lands(f.others[1]).length,1);const wanted=[card(f,'Counterspell','library'),card(f,'Opt','library'),card(f,'Beast Within','library')];await play(f,"Firemind's Foresight");assert.ok(wanted.every(c=>c.zone==='hand'));}
});
test('Dawnbreak returns each chosen creature under its owner; Open the Vaults returns both players’ artifact and enchantment cards',async()=>{
 const f=setup(),d=await play(f,'Dawnbreak Reclaimer'),a=card(f,'Grizzly Bears','graveyard'),b=card(f,'Serra Angel','graveyard',f.b);await event(f,'endStep',{player:f.a});assert.equal(a.zone,'battlefield');assert.equal(b.zone,'battlefield');assert.equal(b.ctrl,f.b);const ring=card(f,'Sol Ring','graveyard'),e=card(f,'Phyrexian Arena','graveyard',f.b);await play(f,'Open the Vaults');assert.equal(ring.zone,'battlefield');assert.equal(e.zone,'battlefield');assert.equal(e.ctrl,f.b);assert.equal(d.zone,'battlefield');
});
test('Blustersquall overload taps all opposing creatures and Arachnogenesis prevents only non-Spider combat damage',async()=>{
 const f=setup(),a=body(f,f.b),b=body(f,f.others[1]),mine=body(f);await play(f,'Blustersquall',{alt:{overloaded:true,altCostStr:'{3}{U}'}});assert.ok(a.tapped&&b.tapped&&!mine.tapped);a.attacking=f.a;await play(f,'Arachnogenesis');assert.equal(tokens(f).length,1);assert.ok(tokens(f)[0].kw('reach'));await f.game.damagePlayer(a,f.a,2,{combat:true});assert.equal(f.a.life,40);await f.game.damagePlayer(tokens(f)[0],f.b,1,{combat:true});assert.equal(f.b.life,39);
});
test('Lavalanche damages the chosen player and its creatures; Meteor and Comet pay X and distinct target counts',async()=>{
 {const f=setup(),b=body(f,f.b);target(f,f.b);await play(f,'Lavalanche');assert.equal(b.zone,'graveyard');assert.equal(f.b.life,37);}
 {const f=setup();f.x=2;target(f,f.b,f.others[1]);await play(f,'Meteor Blast');assert.equal(f.b.life,36);assert.equal(f.others[1].life,36);}
 {const f=setup();f.x=1;target(f,f.b,f.others[1]);const c=await play(f,'Comet Storm');assert.equal(c.castMeta.paidTimes,1);assert.equal(f.b.life,39);assert.equal(f.others[1].life,39);}
});
test('Orim’s Thunder pays the kicker and uses destroyed permanent mana value; kicked Urza’s Rage ignores prevention',async()=>{
 const f=setup(),a=card(f,'Sunforger','battlefield',f.b),b=card(f,'Serra Angel','battlefield',f.b);target(f,a,b);const thunder=await play(f,"Orim's Thunder");assert.equal(thunder.castMeta.manaSpent,4);assert.equal(a.zone,'graveyard');assert.equal(b.damage,3);f.game.untilEffects.push({kind:'preventToPlayer',who:f.b,expires:'eot'});target(f,f.b);const c=await castOnly(f,"Urza's Rage");assert.equal(c.castMeta.manaSpent,12);assert.equal(await f.game.counterStackObject(f.game.stack.at(-1),{}),false);await settle(f.game);assert.equal(f.b.life,30);assert.equal(c.zone,'graveyard');
});
test('Solidarity strive doubles both targets and Abzan copies retarget their assigned counters',async()=>{
 const f=setup(),a=body(f),b=body(f);f.game.addCounters(a,'+1/+1',2);f.game.addCounters(b,'+1/+1',1);target(f,a,b);await play(f,'Solidarity of Heroes');assert.equal(a.counters['+1/+1'],4);assert.equal(b.counters['+1/+1'],2);pick(f,{targets:[a],mode:2});await castOnly(f,'Abzan Charm');target(f,b);await f.game.copySpell(f.game.stack.at(-1),f.a,{mayNewTargets:true});await settle(f.game);assert.equal(a.counters['+1/+1'],6);assert.equal(b.counters['+1/+1'],4);
});
test('Grab the Reins entwines in printed order; Past in Flames grants existing graveyard spells a paid flashback',async()=>{
 {const f=setup(),b=body(f,f.b);target(f,b,f.b);await play(f,'Grab the Reins');assert.equal(b.zone,'graveyard');assert.equal(f.b.life,38);}
 {const f=setup(),o=card(f,'Opt','graveyard'),p=await play(f,'Past in Flames');fuel(f.a);const e=f.game.castableList(f.a).find(e=>e.card===o);assert.ok(e&&e.alt.flashback);await f.game.castSpell(f.a,o,{from:e.from,alt:e.alt});await settle(f.game);assert.equal(o.zone,'exile');assert.equal(p.zone,'graveyard');}
});
test('Reverse the Sands redistributes exact totals; Whims permits empty piles with a seeded random sacrifice',async()=>{
 const f=setup();f.a.life=20;f.b.life=30;f.others[1].life=40;pick(f,{extra:(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose the life total')?q.options.at(-1).key:undefined});await play(f,'Reverse the Sands');assert.deepEqual(Array.from(f.game.players,p=>p.life),[40,30,20]);const a=body(f),b=body(f,f.b);f.game.rnd=()=>0;f.decide=null;await play(f,'Whims of the Fates');assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');
});
test('The three confluences repeat modes with ordered, independent targets',async()=>{
 {const f=setup();pick(f,{modes:[0,0,0]});await play(f,'Righteous Confluence');assert.equal(tokens(f).length,3);assert.ok(tokens(f).every(c=>c.kw('vigilance')));}
 {const f=setup(),b=body(f),g=card(f,'Serra Angel','graveyard');pick(f,{modes:[2,1,0],targets:[b,g]});await play(f,'Verdant Confluence');assert.equal(b.counters['+1/+1'],2);assert.equal(g.zone,'hand');assert.equal(f.game.lands(f.a).length,1);}
 {const f=setup(),b=body(f,f.b),g=card(f,'Serra Angel','graveyard');pick(f,{modes:[2,1,0],targets:[f.a,b,g]});await play(f,'Wretched Confluence');assert.equal(f.a.hand.length,2);assert.equal(f.a.life,39);assert.equal(b.zone,'graveyard');assert.equal(g.zone,'hand');}
});
test('Biomantic Mastery counts two different players and Blatant Thievery independently targets every opponent',async()=>{
 const f=setup(),a=body(f),b=body(f,f.b),c=body(f,f.others[1]);target(f,f.a,f.b);await play(f,'Biomantic Mastery');assert.equal(f.a.hand.length,2);target(f,b,c);await play(f,'Blatant Thievery');assert.equal(b.ctrl,f.a);assert.equal(c.ctrl,f.a);assert.equal(a.ctrl,f.a);
});
test('Blinkmoth and Howling Mine recheck untapped at resolution; Rites grants draw and an additional land',async()=>{
 const f=setup(),b=await play(f,'Blinkmoth Urn');await f.game.emit('precombatMain',{player:f.a,ordinal:1});await f.game.flushTriggers();b.tapped=true;const n=f.a.pool.C;await settle(f.game);assert.equal(f.a.pool.C,n);const h=await play(f,'Howling Mine');await f.game.emit('drawStep',{player:f.a});await f.game.flushTriggers();h.tapped=true;await settle(f.game);assert.equal(f.a.hand.length,0);await play(f,'Rites of Flourishing');assert.equal(f.game.landPlayLimit(f.b),2);await event(f,'drawStep',{player:f.b});assert.equal(f.b.hand.length,1);
});
test('Jace’s Archivist uses greatest actual discard count; Read the Runes pays each draw; Necroplasm destroys its measured mana value',async()=>{
 const f=setup(),j=await play(f,"Jace's Archivist");j.sick=false;card(f,'Island','hand',f.b);card(f,'Island','hand',f.b);await activate(f,j);assert.equal(f.a.hand.length,2);assert.equal(f.b.hand.length,2);await play(f,'Read the Runes');assert.equal(j.zone,'graveyard');assert.equal(f.a.hand.length,3);const n=await play(f,'Necroplasm'),one=card(f,'Llanowar Elves');await event(f,'upkeep',{player:f.a});assert.equal(n.counters['+1/+1'],1);await event(f,'endStep',{player:f.a});assert.equal(one.zone,'graveyard');assert.equal(n.zone,'battlefield');
});
test('Skullwinder reuses both graveyards; Reveillark returns two low-power bodies and Terrain counts lands',async()=>{
 const f=setup(),a=card(f,'Opt','graveyard'),b=card(f,'Island','graveyard',f.b);target(f,a);await play(f,'Skullwinder');assert.equal(a.zone,'hand');assert.equal(b.zone,'hand');const x=card(f,'Grizzly Bears','graveyard'),y=card(f,'Llanowar Elves','graveyard');target(f,x,y);const r=await play(f,'Reveillark');await die(f,r);assert.equal(x.zone,'battlefield');assert.equal(y.zone,'battlefield');card(f,'Forest','battlefield',f.b);card(f,'Island','battlefield',f.b);await play(f,'Treacherous Terrain');assert.equal(f.b.life,38);
});
