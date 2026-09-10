import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,fuel} from './helpers/c21-fixtures.mjs';
const yes=f=>{f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;};
const reset=(f,c)=>{delete c.meta._loyUsed;delete c.meta.lcLoyaltyTurn;};
test('Summons of Saruman flashback pays five mana and exiles X cards before milling and casting',async()=>{
 const f=setup(),s=card(f,'Summons of Saruman','graveyard');for(let i=0;i<3;i++)card(f,'Forest','graveyard');const instant=card(f,'Reanimate','library'),b=card(f,'Grizzly Bears','graveyard');f.x=2;fuel(f.a);const before=Object.values(f.a.pool).reduce((a,b)=>a+b,0);const entry=f.game.castableList(f.a).find(e=>e.card===s);assert.ok(entry);assert.equal(await f.game.castSpell(f.a,s,{from:'graveyard',alt:entry.alt}),true);assert.equal(before-Object.values(f.a.pool).reduce((a,b)=>a+b,0),5);assert.equal(f.a.exile.length,2);assert.equal(f.game.stack.find(x=>x.card===s).x,2);await settle(f.game);assert.equal(s.zone,'exile');assert.ok(f.game.creatures(f.a).some(c=>c.hasSub('Orc')&&c.counters['+1/+1']===2));assert.equal(instant.zone,'graveyard');assert.equal(b.zone,'battlefield');
});
test('Summons of Saruman from hand pays two X and does not exile graveyard cards',async()=>{
 const f=setup(),b=card(f,'Grizzly Bears','graveyard');f.x=2;await play(f,'Summons of Saruman');assert.equal(b.zone,'graveyard');assert.equal(f.a.exile.length,0);assert.ok(f.game.creatures(f.a).some(c=>c.hasSub('Army')&&c.counters['+1/+1']===2));
});
test('Shelob links an opposing death, pays a linked exile as a cost, and returns exact-X creatures',async()=>{
 const f=setup(),s=card(f,'Shelob, Dread Weaver'),b=body(f,f.b);await f.game.destroy(b);await settle(f.game);assert.equal(b.zone,'exile');const h=f.a.hand.length;await activate(f,s,0);assert.equal(b.zone,'graveyard');assert.equal(s.counters['+1/+1'],2);assert.equal(f.a.hand.length,h+1);
 const b2=body(f,f.b);await f.game.destroy(b2);await settle(f.game);f.x=2;await activate(f,s,1);assert.equal(b2.zone,'battlefield');assert.equal(b2.ctrl.idx,f.a.idx);assert.equal(b2.tapped,true);
});
test('Lobelia exiles private linked cards and drains with an artifact paid before resolution',async()=>{
 const f=setup(),l=await play(f,'Lobelia, Defender of Bag End');assert.ok(f.b.exile.length);assert.equal(f.b.exile[0].faceDown,true);await f.game.makeTokens(M.TOKENS.food,f.a);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='1')?'1':undefined;l.sick=false;const life=f.a.life,enemy=f.b.life;await activate(f,l);assert.equal(f.a.life,life+2);assert.equal(f.b.life,enemy-2);assert.equal(f.game.bf().filter(c=>c.hasSub('Food')).length,0);
});
test('Gilraen returns the exiled object at end step with vigilance and lifelink counters',async()=>{
 const f=setup(),g=card(f,'Gilraen, Dúnedain Protector'),b=body(f);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='no')?'no':undefined;await activate(f,g);assert.equal(b.zone,'exile');await event(f,'endStep',{player:f.b});assert.equal(b.zone,'battlefield');assert.equal(b.counters.vigilance,1);assert.equal(b.counters.lifelink,1);
});
test('The Balrog exile is optional and its reflexive trigger targets one creature per opponent',async()=>{
 const f=setup('human',2),b=card(f,'The Balrog of Moria'),x=body(f,f.b),y=body(f,f.others[1]);yes(f);await f.game.destroy(b);await settle(f.game);assert.equal(b.zone,'exile');assert.equal(x.zone,'exile');assert.equal(y.zone,'exile');
});
test('Monstrosity pays its ETB option and Islandcycling searches instead of drawing',async()=>{
 const f=setup(),b=body(f,f.b);yes(f);await play(f,'Monstrosity of the Lake');assert.equal(b.tapped,true);assert.equal(b.counters.stun,1);const c=card(f,'Monstrosity of the Lake','hand'),island=card(f,'Island','library');fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.cycling);assert.ok(e);await f.game.activateAbility(f.a,e);await settle(f.game);assert.equal(island.zone,'hand');assert.equal(c.zone,'graveyard');
});
test('Moria Scavenger remembers the creature discarded as a paid cost',async()=>{
 const f=setup(),s=card(f,'Moria Scavenger');card(f,'Grizzly Bears','hand');await activate(f,s);assert.equal(f.a.hand.length,1);assert.ok(f.game.creatures(f.a).some(c=>c.hasSub('Orc')&&c.counters['+1/+1']===1));
});
test('Gollum remembers damaged opponents after leaving and returning',async()=>{
 const f=setup(),g=card(f,'Gollum, Obsessed Stalker');await f.game.damageAny(g,f.b,1,{combat:true});await f.game.move(g,'hand');await f.game.putPermanentOntoBattlefield(g,f.a);await f.game.gainLife(f.a,4,g);const life=f.b.life;await event(f,'endStep',{player:f.a});assert.equal(f.b.life,life-4);
});
test('Motivated Pony strengthens all attacking creatures and untaps after Food entered',async()=>{
 const f=setup(),p=card(f,'Motivated Pony'),b=body(f);await f.game.makeTokens(M.TOKENS.food,f.a);p.attacking=b.attacking=f.b;p.tapped=b.tapped=true;await event(f,'attacks',{card:p,player:f.a,target:f.b});assert.equal(b.power,5);assert.equal(b.tapped,false);
});
test('Crown scales with creatures and discounts equipping for the monarch; Frying Pan creates and equips',async()=>{
 const f=setup(),b=body(f),c=card(f,'Crown of Gondor');await f.game.becomeMonarch(f.a);fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.equip);assert.ok(e);assert.equal(f.game.abilityManaCost(f.a,c,'{4}',{ability:{equip:true},kind:'equip'}).generic,1);await f.game.activateAbility(f.a,e);await settle(f.game);assert.equal(b.power,3);const pan=await play(f,'Field-Tested Frying Pan');const host=f.game.byIid(pan.attachedTo);assert.ok(host?.hasSub('Halfling'));await f.game.gainLife(f.a,3,pan);await settle(f.game);assert.equal(host.power,4);
});
test('Assemble the Entmoot makes three tapped Treefolk sized from life gain with reach counters',async()=>{
 const f=setup(),a=card(f,'Assemble the Entmoot');await f.game.gainLife(f.a,5,a);await activate(f,a);const tokens=f.game.creatures(f.a).filter(c=>c.hasSub('Treefolk'));assert.equal(tokens.length,3);assert.ok(tokens.every(c=>c.power===5&&c.tapped&&c.counters.reach===1));
});
test('For the Ancestors takes the chosen type and Harsh Mercy preserves every chosen type',async()=>{
 const f=setup(),b=card(f,'Grizzly Bears','library');f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='Bear')?'Bear':undefined;await play(f,'For the Ancestors');assert.equal(b.zone,'hand');const keep=body(f),remove=card(f,'Farmer Cotton');await play(f,'Harsh Mercy');assert.equal(keep.zone,'battlefield');assert.equal(remove.zone,'graveyard');
});
test('Lost to Legend places the targeted historic card fourth from the top',async()=>{
 const f=setup(),s=card(f,'Sol Ring','battlefield',f.b);await play(f,'Lost to Legend');assert.equal(s.zone,'library');assert.equal(f.b.library.at(-4)?.iid,s.iid);
});
test('Subjugate the Hobbits control survives end of turn and excludes commanders',async()=>{
 const f=setup(),b=body(f,f.b),c=card(f,'Frodo, Adventurous Hobbit','battlefield',f.b);c.commander=true;await play(f,'Subjugate the Hobbits');assert.equal(b.ctrl.idx,f.a.idx);assert.equal(c.ctrl.idx,f.b.idx);f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();assert.equal(b.ctrl.idx,f.a.idx);
});
test('Rukarumel adds the chosen type in hand, stack, graveyard and to nontoken creatures only',async()=>{
 const f=setup();f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='Sliver')?'Sliver':undefined;const r=await play(f,'Rukarumel, Biologist'),hand=card(f,'Grizzly Bears','hand'),gy=card(f,'Grizzly Bears','graveyard');await f.game.makeTokens(M.TOKENS.wolfG,f.a);assert.equal(hand.hasSub('Sliver'),true);assert.equal(gy.hasSub('Sliver'),true);assert.ok(f.game.castDefinition(hand,{}).subtypes.includes('Sliver'));assert.equal(f.game.creatures(f.a).find(c=>c.isToken).hasSub('Sliver'),false);await f.game.move(r,'graveyard');assert.equal(hand.hasSub('Sliver'),false);
});
test('Hatchery grants paid replicate to a Sliver spell',async()=>{
 const f=setup();card(f,'Hatchery Sliver');f.x=1;const s=await play(f,'Predatory Sliver');assert.equal(f.game.creatures(f.a).filter(c=>c.name===s.name).length,2);assert.equal(f.a.turnState.spellsCast,1);
});
test('Jace Mirror Mage kicker copies one starting loyalty and its draw removes loyalty by mana value',async()=>{
 const f=setup();yes(f);const j=await play(f,'Jace, Mirror Mage');assert.equal(f.game.bf().filter(c=>c.name===j.name).length,2);assert.ok(f.game.bf().some(c=>c.name===j.name&&c.isToken&&c.counters.loyalty===1));card(f,'Sol Ring','library');await activate(f,j,1);assert.equal(j.counters.loyalty,3);
});
test('Repeated Reverberation makes two loyalty copies while consuming the loyalty cost once',async()=>{
 const f=setup(),j=await play(f,'Jace Beleren');await play(f,'Repeated Reverberation');const hand=f.a.hand.length;await activate(f,j,0);assert.equal(f.a.hand.length,hand+3);assert.equal(j.counters.loyalty,5);
});
test('Chandra Legacy counts planeswalkers for mana and end-step damage',async()=>{
 const f=setup(),c=await play(f,'Chandra, Legacy of Fire');const j=await play(f,'Jace Beleren');fuel(f.a);const before=f.a.pool.R;const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.ability===c.def.abilities[0]);await f.game.activateAbility(f.a,e);await settle(f.game);assert.equal(f.a.pool.R,before+2);const life=f.b.life;await event(f,'endStep',{player:f.a});assert.equal(f.b.life,life-2);assert.ok(j);
});
test('Sarkhan turns planeswalkers into flying Dragons while preserving their loyalty abilities',async()=>{
 const f=setup(),s=await play(f,'Sarkhan the Masterless'),j=await play(f,'Jace Beleren');await activate(f,s,0);assert.equal(j.is('Planeswalker'),false);assert.equal(j.hasSub('Dragon'),true);assert.equal(j.power,4);assert.equal(j.kw('flying'),true);await activate(f,j,0);
});
test('Vronos phases targets at end step and permanently animates its artifact target',async()=>{
 const f=setup(),v=await play(f,'Vronos, Masked Inquisitor'),j=await play(f,'Jace Beleren');await activate(f,v,0);assert.equal(j.phasedOut,false);await event(f,'endStep',{player:f.a});assert.equal(j.phasedOut,true);reset(f,v);v.counters.loyalty=10;const a=card(f,'Sol Ring');await activate(f,v,2);assert.equal(a.power,9);assert.equal(a.kw('indestructible'),true);assert.equal(a.kw('unblockable'),true);
});

test('Repeated Reverberation is consumed by the first spell before its copy trigger resolves',async()=>{
 const f=setup();await play(f,'Repeated Reverberation');const first=card(f,'Brainstorm','hand'),second=card(f,'Brainstorm','hand');fuel(f.a);
 assert.equal(await f.game.castSpell(f.a,first,{from:'hand'}),true);
 assert.equal(await f.game.castSpell(f.a,second,{from:'hand'}),true);
 assert.equal(f.game.stack.filter(s=>s.kind==='trigger'&&s.srcCard?.name==='Repeated Reverberation').length,1);
 await settle(f.game);
});
test('Lobelia allows one land or spell from the linked group and rejects the remaining cards',async()=>{
 const f=setup();card(f,'Brainstorm','library',f.others[1]);const l=await play(f,'Lobelia, Defender of Bag End');await f.game.makeTokens(M.TOKENS.food,f.a);l.sick=false;
 f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='0')?'0':undefined;await activate(f,l);
 const lands=f.game.playableLands(f.a).filter(c=>c.zone==='exile');assert.equal(lands.length,1);assert.ok(f.game.castableList(f.a).some(e=>e.card.name==='Brainstorm'));
 await f.game.playLand(f.a,lands[0]);assert.equal(lands[0].zone,'battlefield');f.a.landsPlayed=0;
 assert.equal(f.game.playableLands(f.a).filter(c=>c.zone==='exile').length,0);assert.equal(f.game.castableList(f.a).some(e=>e.card.name==='Brainstorm'),false);
});
test('War Mammoth cycling pays X and its targeted trigger resolves above the card draw',async()=>{
 const f=setup(),c=card(f,'Rampaging War Mammoth','hand'),a=card(f,'Sol Ring','battlefield',f.b),b=card(f,'Arcane Signet','battlefield',f.b);f.x=2;fuel(f.a);const mana=Object.values(f.a.pool).reduce((n,x)=>n+x,0),hand=f.a.hand.length;
 const e=f.game.activatableList(f.a).find(e=>e.card===c&&e.cycling);assert.ok(e);assert.equal(await f.game.activateAbility(f.a,e),true);
 assert.equal(mana-Object.values(f.a.pool).reduce((n,x)=>n+x,0),5);assert.equal(c.zone,'graveyard');assert.equal(f.game.stack.length,2);
 assert.equal(f.game.stack.at(-1).targetSpecs[0].count,2);await f.game.resolveTop();assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');assert.equal(f.a.hand.length,hand-1);await settle(f.game);assert.equal(f.a.hand.length,hand);
});
test('Hatchery exposes the full affordable replicate count above one hundred',async()=>{
 const f=setup();card(f,'Hatchery Sliver');const s=card(f,'Predatory Sliver','hand');for(const k in f.a.pool)f.a.pool[k]=0;f.a.pool.G=300;let offered;
 f.decide=(p,q)=>q.type==='chooseX'?(offered=q.max,0):undefined;const plans=await M.C1920.replicatePayments(f.game,f.a,s,{},M.parseCost('{1}{G}'),0);assert.ok(plans);assert.equal(offered,149);
});
test('Rukarumel types appear in battlefield snapshots and disappear when it leaves',async()=>{
 const f=setup();f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='Sliver')?'Sliver':undefined;const r=await play(f,'Rukarumel, Biologist'),b=body(f);assert.ok(b.cur.subtypes.includes('Sliver'));await f.game.move(r,'graveyard');assert.equal(b.cur.subtypes.includes('Sliver'),false);
});
test('AI evaluates Vronos dynamic target groups in a normal action window without fallback',async()=>{
 const f=setup('ai');const v=card(f,'Vronos, Masked Inquisitor');v.counters.loyalty=6;body(f,f.b);fuel(f.a);
 const q={type:'main',player:f.a,casts:[],acts:f.game.activatableList(f.a),lands:[],phase:'main1'};
 const d=await M.chooseBotAction({gameState:f.game,botPlayerId:f.a.idx,difficulty:'normal',actionWindow:q});assert.equal(d.log.fallback,false);assert.ok(d.action);
});

test('Gollum remembers all named-creature combat damage across controllers and a saved game',async()=>{
 const f=setup(),first=card(f,'Gollum, Obsessed Stalker');await f.game.damageAny(first,f.b,1,{combat:true});await f.game.move(first,'graveyard');
 const other=f.others[1],g=card(f,'Gollum, Obsessed Stalker','battlefield',other);await f.game.gainLife(other,3,g);const snap=M.captureGameState(f.game);assert.ok(snap);const fresh=setup();M.restoreGameState(fresh.game,JSON.parse(JSON.stringify(snap)));assert.equal(fresh.game.players[1].lcGollumDamaged,true);
 const life=f.b.life;await event(f,'endStep',{player:other});assert.equal(f.b.life,life-3);
});

test('Forth Eorlingas triggers once for simultaneous hits against multiple players and again in a later damage step',async()=>{
 const f=setup(),a=body(f),b=body(f);f.x=0;await play(f,'Forth Eorlingas!');
 await f.game.damageBatch([{src:a,target:f.b,n:2},{src:b,target:f.others[1],n:2}],{combat:true});assert.equal(f.game.pendingTriggers.filter(t=>t.src.name==='Forth Eorlingas!').length,1);await settle(f.game);assert.equal(f.game.monarch.idx,f.a.idx);
 await f.game.damageBatch([{src:a,target:f.b,n:2}],{combat:true});assert.equal(f.game.pendingTriggers.filter(t=>t.src.name==='Forth Eorlingas!').length,1);await settle(f.game);
});
