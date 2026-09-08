import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,target} from './helpers/c17-c19-fixtures.mjs';
const aura=async(f,name,c,p=f.a)=>{const a=card(f,name,'hand',p);await f.game.move(a,'battlefield',{ctrl:p,attachTo:c});return a;};
for(const role of ['human','ai']){
 test(role+': Estrid pays loyalty for a white Mask and untaps enchanted permanents',async()=>{
  const f=setup(role),e=await play(f,'Estrid, the Masked'),b=body(f),l=card(f,'Forest');target(f,b);await activate(f,e,1);const mask=f.game.bf().find(c=>c.name==='Mask');assert.ok(mask.isToken);assert.equal(mask.attachedTo,b.iid);assert.deepEqual(Array.from(mask.colors),['W']);
  b.tapped=true;l.tapped=true;f.game.turnNo++;await activate(f,e,0);assert.equal(b.tapped,false);assert.equal(l.tapped,true);
  b.damage=1;assert.equal(await f.game.destroy(b),false);assert.equal(b.zone,'battlefield');assert.equal(b.damage,0);assert.notEqual(mask.zone,'battlefield');assert.equal(b.tapped,false);
 });
 test(role+': Estrid returns non-Auras before attaching the returned Auras',async()=>{
  const f=setup(role),e=card(f,'Estrid, the Masked');e.counters.loyalty=7;const c=card(f,'Archetype of Imagination','graveyard'),u=card(f,'Bear Umbra','graveyard');
  await activate(f,e,2);assert.equal(c.zone,'battlefield');assert.equal(u.zone,'battlefield');assert.equal(u.attachedTo,c.iid);assert.equal(c.power,5);assert.equal(f.a.graveyard.filter(c=>c.name==='Forest').length,7);
 });
 test(role+': Bear Umbra grants the attack trigger to the creature controller',async()=>{
  const f=setup(role),b=body(f,f.b),mine=card(f,'Forest'),theirs=card(f,'Forest','battlefield',f.b);await aura(f,'Bear Umbra',b);mine.tapped=true;theirs.tapped=true;await event(f,'attacks',{card:b,player:f.b});assert.equal(theirs.tapped,false);assert.equal(mine.tapped,true);
 });
 test(role+': Snake Umbra draws for noncombat damage too; Octopus uses base power before counters',async()=>{
  const f=setup(role),b=body(f);await aura(f,'Snake Umbra',b);await f.game.damagePlayer(b,f.b,1);await settle(f.game);assert.equal(f.a.hand.length,1);
  const o=await aura(f,'Octopus Umbra',b);f.game.addCounters(b,'+1/+1',2);assert.equal(b.power,11);const opp=body(f,f.b);target(f,opp);await event(f,'attacks',{card:b,player:f.a});assert.equal(opp.tapped,true);assert.equal(o.zone,'battlefield');
 });
}
test('Umbra armor protects from simultaneous destruction of host and Aura',async()=>{
 const f=setup(),b=body(f),a=await aura(f,'Eel Umbra',b),other=body(f,f.b);await f.game.destroyMany([b,a,other]);assert.equal(b.zone,'battlefield');assert.equal(a.zone,'graveyard');assert.equal(other.zone,'graveyard');
});
test('Umbra armor handles lethal damage and deathtouch, but does not replace sacrifice or zero toughness',async()=>{
 for(const mode of ['damage','deathtouch','sacrifice','zero']){const f=setup(),b=body(f),a=await aura(f,'Eel Umbra',b);if(mode==='damage')b.damage=3;else if(mode==='deathtouch'){b.damage=1;b.deathtouched=true;}else if(mode==='zero')M.E.pumpUntilEOT(f.game,b,0,-3);else await f.game.sacrifice(f.a,b);await f.game.checkSBA();assert.equal(b.zone,['damage','deathtouch'].includes(mode)?'battlefield':'graveyard');assert.equal(a.zone,'graveyard');if(b.zone==='battlefield')assert.equal(b.damage,0);}
});
test('Multiple Umbras offer one choice; indestructible prevents replacement and regeneration is optional ordering',async()=>{
 const f=setup(),b=body(f),a=await aura(f,'Eel Umbra',b),a2=await aura(f,'Bear Umbra',b);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('destruction replacement')?'armor:'+a2.iid:undefined;
 await f.game.destroy(b);assert.equal(a.zone,'battlefield');assert.equal(a2.zone,'graveyard');assert.equal(b.zone,'battlefield');
 M.E.grantUntilEOT(f.game,b,['indestructible']);await f.game.destroy(b);assert.equal(a.zone,'battlefield');f.game.untilEffects=[];f.game.recalc();b.regenShield=1;
 f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('destruction replacement')?'regen':undefined;await f.game.destroy(b);assert.equal(a.zone,'battlefield');assert.equal(b.tapped,true);assert.equal(b.regenShield,0);
});
test('An indestructible Umbra survives while still removing damage and protecting the host',async()=>{
 const f=setup(),b=body(f),a=await aura(f,'Eel Umbra',b);M.E.grantUntilEOT(f.game,a,['indestructible']);b.damage=2;await f.game.destroy(b);assert.equal(b.zone,'battlefield');assert.equal(a.zone,'battlefield');assert.equal(b.damage,0);
});
test('Armor and shield ordering is chosen by the affected controller and lethal SBA does not spend shield counters',async()=>{
 const f=setup(),b=body(f),a=await aura(f,'Eel Umbra',b);f.game.addCounters(b,'shield',1);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('destruction replacement')?'shield':undefined;await f.game.destroy(b);assert.equal(a.zone,'battlefield');assert.equal(b.counters.shield,0);
 f.game.addCounters(b,'shield',1);b.damage=3;await f.game.checkSBA();assert.equal(a.zone,'graveyard');assert.equal(b.zone,'battlefield');assert.equal(b.counters.shield,1);
});
