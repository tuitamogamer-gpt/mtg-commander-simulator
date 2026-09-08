import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target,tokens} from './helpers/c17-c19-fixtures.mjs';
for(const role of ['human','ai']){
 test(role+': Shifting Shadow preserves its Aura through resolving destruction and attaches it to the revealed creature',async()=>{
  const f=setup(role),b=body(f);target(f,b);const a=await play(f,'Shifting Shadow'),next=card(f,'Serra Angel','library'),land=card(f,'Island','library');assert.ok(b.kw('haste'));await event(f,'upkeep',{player:f.a});assert.equal(b.zone,'graveyard');assert.equal(a.zone,'battlefield');assert.equal(next.zone,'battlefield');assert.equal(a.attachedTo,next.iid);assert.ok(next.kw('haste'));assert.equal(f.a.library[0],land);
 });
 test(role+': Shifting Shadow still reveals if destruction is prevented and its granted trigger belongs to the enchanted controller',async()=>{
  const f=setup(role),b=body(f,f.b);M.E.grantUntilEOT(f.game,b,['indestructible']);target(f,b);const a=await play(f,'Shifting Shadow'),next=card(f,'Serra Angel','library',f.b);await event(f,'upkeep',{player:f.a});assert.equal(next.zone,'library');await event(f,'upkeep',{player:f.b});assert.equal(b.zone,'battlefield');assert.equal(next.zone,'battlefield');assert.equal(next.ctrl,f.b);assert.equal(a.attachedTo,next.iid);assert.equal(a.ctrl,f.a);
 });
 test(role+': Xantcha enters under the chosen opponent before ETB triggers and cannot attack its owner or that owner planeswalker',async()=>{
  const f=setup(role);card(f,"Trostani, Selesnya's Voice",'battlefield',f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('control Xantcha')?String(f.b.idx):undefined;const x=await play(f,'Xantcha, Sleeper Agent'),pw=card(f,'Saheeli, the Gifted');assert.equal(x.ctrl,f.b);assert.equal(x.owner,f.a);assert.equal(f.b.life,45);assert.equal(f.game.canAttackTarget(x,f.a),false);assert.equal(f.game.canAttackTarget(x,pw),false);assert.equal(f.game.canAttackTarget(x,f.others[1]),true);assert.ok(f.game.isForcedToAttack(x));
 });
 test(role+': any player can pay for Xantcha; its present controller loses life and the activating player draws',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('control Xantcha')?String(f.b.idx):undefined;const x=await play(f,'Xantcha, Sleeper Agent');for(const p of f.game.players){fuel(p);const entry=f.game.activatableList(p).find(e=>e.card===x&&e.ability===x.def.abilities[0]);assert.ok(entry);const before=mana(p);assert.equal(await f.game.activateAbility(p,entry),true);assert.equal(before-mana(p),3);await settle(f.game);assert.equal(p.hand.length,1);}assert.equal(f.b.life,34);
 });
}
test('Flayer uses the old graveyard entrant power and lifelink after that creature leaves before its trigger resolves',async()=>{
 const f=setup();target(f,f.b);await play(f,'Flayer of the Hatebound');const c=card(f,'Vampire Nighthawk','graveyard');await f.game.putPermanentOntoBattlefield(c,f.a);await f.game.flushTriggers();await f.game.move(c,'hand');await settle(f.game);assert.equal(f.b.life,38);assert.equal(f.a.life,42);
});
test('Xantcha has no attack restriction or must-attack requirement after losing all abilities',async()=>{
 const f=setup();const x=await play(f,'Xantcha, Sleeper Agent');target(f,x);await play(f,'Lignify');assert.equal(f.game.isForcedToAttack(x),false);assert.equal(f.game.canAttackTarget(x,f.a),true);
});
