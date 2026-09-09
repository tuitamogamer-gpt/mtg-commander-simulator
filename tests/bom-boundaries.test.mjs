import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,event,settle,fuel,mana} from './helpers/bom-fixtures.mjs';
test('Conjurer Mantle takes a card sharing an actual creature type from the six looked-at cards',async()=>{
 const f=setup(),b=body(f),m=card(f,"Conjurer's Mantle"),hit=card(f,'Grizzly Bears','library');card(f,'Forest','library');await f.game.attach(m,b);await event(f,'attacks',{card:b,player:f.a,target:f.b});assert.equal(hit.zone,'hand');assert.equal(b.kw('vigilance'),true);assert.equal(b.power,3);
});
test('Wand of the Worldsoul enters tapped through real spell resolution',async()=>{const f=setup(),w=await play(f,'Wand of the Worldsoul');assert.equal(w.tapped,true);});
test('Culling Ritual adds one mana for each permanent actually destroyed',async()=>{
 const f=setup();body(f);body(f,f.b);card(f,'Sol Ring');card(f,'Forest');await play(f,'Culling Ritual');assert.equal(mana(f.a),179);assert.equal(f.game.bf().length,1);assert.equal(f.game.bf()[0].name,'Forest');
});
test('Kayla pending exile belongs to the old Music Box incarnation after blink',async()=>{
 const f=setup(),box=card(f,"Kayla's Music Box");fuel(f.a);const entry=f.game.activatableList(f.a).find(e=>e.card===box&&e.ability===box.def.abilities[0]);assert.ok(entry);assert.equal(await f.game.activateAbility(f.a,entry),true);await f.game.move(box,'hand');await f.game.putPermanentOntoBattlefield(box,f.a);await settle(f.game);assert.equal(f.a.exile.length,1);assert.equal(M.BOM.linkState(box,'bomKayla').length,0);
});
for(const mode of ['life','white','unaffordable'])test('Norns Annex attack declaration pays '+mode,async()=>{
 const f=setup(),b=body(f);card(f,"Norn's Annex",'battlefield',f.b);if(mode==='white')f.a.pool.W=1;if(mode==='unaffordable')f.a.life=1;
 const life=f.a.life,other=f.b.life;f.decide=(p,q)=>q.type==='attackers'?[{card:b,target:f.b}]:q.type==='blockers'?[]:undefined;
 await f.game.combatPhase(f.a);assert.equal(f.a.life,life-(mode==='life'?2:0));assert.equal(f.b.life,other-(mode==='unaffordable'?0:2));if(mode==='white')assert.equal(f.a.pool.W,0);if(mode==='unaffordable')assert.equal(b.tapped,false);
});

test('Kinnan mana bounds and payment include the bonus from Sol Ring',async()=>{
 const f=setup();card(f,'Kinnan, Bonder Prodigy');const ring=card(f,'Sol Ring');assert.equal(f.game.maxAffordableX(f.a,M.parseCost('{X}'),null),3);assert.ok(f.game.activatableList(f.a));assert.equal(await f.game.payMana(f.a,M.parseCost('{3}')),true);assert.equal(ring.tapped,true);
});
for(const blink of [false,true])test('Sigardas Aid attaches the entering Equipment with source lifetime '+blink,async()=>{
 const f=setup(),aid=card(f,"Sigarda's Aid"),b=body(f),e=card(f,'Bonesplitter','hand');f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?[b]:undefined;
 await f.game.putPermanentOntoBattlefield(e,f.a);await f.game.flushTriggers();await f.game.move(aid,'graveyard');if(blink){await f.game.move(e,'hand');await f.game.putPermanentOntoBattlefield(e,f.a);}await settle(f.game);assert.equal(e.attachedTo,blink?null:b.iid);assert.equal(aid.attachedTo,null);
});
