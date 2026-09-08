import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,event,fuel,settle,target,tokens} from './helpers/c17-c19-fixtures.mjs';
for(const role of ['human','ai']){
 test(role+': Aethermage Touch puts a creature into play, bottoms the rest and grants a recurring end-step return',async()=>{
  const f=setup(role),b=card(f,'Grizzly Bears','library');await play(f,"Aethermage's Touch");assert.equal(b.zone,'battlefield');assert.equal(f.a.library.length,30);await event(f,'endStep',{player:f.b});assert.equal(b.zone,'battlefield');await event(f,'endStep',{player:f.a});assert.equal(b.zone,'hand');
 });
 test(role+': Clone Legion copies all targeted creatures simultaneously, and Fractured Identity gives copies to every other player',async()=>{
  const f=setup(role,3),b=body(f,f.b),s=card(f,'Serra Angel','battlefield',f.b);target(f,f.b);await play(f,'Clone Legion');assert.equal(tokens(f).length,2);assert.deepEqual(Array.from(tokens(f),c=>c.power).sort(),[2,4]);target(f,s);await play(f,'Fractured Identity');assert.equal(s.zone,'exile');assert.equal(tokens(f).length,3);assert.equal(tokens(f,f.b).length,0);assert.ok(f.others.slice(1).every(p=>tokens(f,p).length===1));assert.equal(b.zone,'battlefield');
 });
 test(role+': Creeping Renaissance returns exactly the chosen type and its flashback exiles the spell',async()=>{
  const f=setup(role),c=card(f,'Grizzly Bears','graveyard'),l=card(f,'Forest','graveyard');f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a permanent type')?'Creature':undefined;const spell=await play(f,'Creeping Renaissance');assert.equal(c.zone,'hand');assert.equal(l.zone,'graveyard');await f.game.move(c,'graveyard');await play(f,spell.name,{card:spell,alt:{flashback:true,altCostStr:'{5}{G}{G}'}});assert.equal(c.zone,'hand');assert.equal(spell.zone,'exile');
 });
 test(role+': Divine Reckoning keeps each chosen creature and Fortunate Few keeps distinct choices belonging to other players',async()=>{
  const f=setup(role,3);for(const p of f.game.players){body(f,p);card(f,'Serra Angel','battlefield',p);card(f,'Forest','battlefield',p);}await play(f,'Divine Reckoning');assert.equal(f.game.creatures().length,4);for(const p of f.game.players)card(f,'Sol Ring','battlefield',p);await play(f,'Fortunate Few');assert.equal(f.game.bf().filter(c=>!c.is('Land')).length,4);assert.equal(f.game.lands().length,4);
 });
 test(role+': Dream Cache draws three and places both selected cards on the chosen end of the library',async()=>{
  const f=setup(role),c=card(f,'Grizzly Bears','hand'),l=card(f,'Island','hand');f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.startsWith('Dream Cache: choose')?[c,l]:q.type==='chooseOption'&&q.prompt.startsWith('Dream Cache:')?'bottom':undefined;await play(f,'Dream Cache');assert.equal(f.a.hand.length,3);assert.equal(f.a.library[0],l);assert.equal(f.a.library[1],c);
 });
 test(role+': Moonlight Bargain pays life for individual revealed-to-controller choices and moves unchosen cards to graveyard',async()=>{
  const f=setup(role);let i=0;f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.startsWith('Moonlight Bargain:')?(i++<2?'yes':'no'):undefined;await play(f,'Moonlight Bargain');assert.equal(f.a.life,36);assert.equal(f.a.hand.length,2);assert.equal(f.a.graveyard.filter(c=>c.name==='Forest').length,3);assert.equal(f.a.library.length,25);
 });
 test(role+': Nightmare Unmaking uses resolving hand size and Saheeli Directive checks the revealed artifacts against paid X',async()=>{
  const f=setup(role),b=body(f,f.b),a=card(f,'Sol Ring');f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='0')?'0':undefined;await play(f,'Nightmare Unmaking');assert.equal(b.zone,'exile');assert.equal(a.zone,'battlefield');const rock=card(f,'Sol Ring','library'),big=card(f,'Steel Hellkite','library'),bear=card(f,'Grizzly Bears','library');f.decide=(p,q)=>q.type==='chooseX'?3:undefined;await play(f,"Saheeli's Directive");assert.equal(rock.zone,'battlefield');assert.equal(big.zone,'graveyard');assert.equal(bear.zone,'graveyard');
 });
 test(role+': Stitch Together checks threshold at resolution; ordinary Floorboards creates three tapped Zombies and gains three life',async()=>{
  const f=setup(role),b=card(f,'Grizzly Bears','graveyard');target(f,b);await play(f,'Stitch Together');assert.equal(b.zone,'hand');await f.game.move(b,'graveyard');for(let n=0;n<5;n++)card(f,'Forest','graveyard');await play(f,'Stitch Together');assert.equal(b.zone,'battlefield');await play(f,'From Under the Floorboards');assert.equal(tokens(f).length,3);assert.ok(tokens(f).every(c=>c.tapped));assert.equal(f.a.life,43);
 });
 test(role+': Avacyn Judgment locks the chosen damage split before resolving and madness uses paid X',async()=>{
  const f=setup(role,3);target(f,f.b,f.others[1]);await play(f,"Avacyn's Judgment");assert.equal(f.b.life,39);assert.equal(f.others[1].life,39);const s=card(f,"Avacyn's Judgment",'hand');fuel(f.a);f.decide=(p,q)=>q.type==='chooseX'?3:q.type==='chooseTargets'?q.candidates.filter(c=>c===f.b):undefined;await f.game.discard(f.a,[s]);await settle(f.game);assert.equal(f.b.life,36);assert.equal(s.zone,'graveyard');
 });
 test(role+': Floorboards madness creates exactly X tapped Zombies and Terminus bottoms creatures while leaving lands',async()=>{
  const f=setup(role),s=card(f,'From Under the Floorboards','hand');fuel(f.a);f.decide=(p,q)=>q.type==='chooseX'?2:undefined;await f.game.discard(f.a,[s]);await settle(f.game);assert.equal(tokens(f).length,2);assert.equal(f.a.life,42);const b=body(f),l=card(f,'Forest');await play(f,'Terminus');assert.equal(b.zone,'library');assert.equal(f.a.library[0],b);assert.equal(l.zone,'battlefield');assert.equal(tokens(f).length,0);
 });
}
test('Terminus can be cast through its real miracle draw trigger for one white mana',async()=>{
 const f=setup(),b=body(f),s=card(f,'Terminus','library');f.a.pool.W=1;await f.game.draw(f.a,1);await settle(f.game);assert.equal(s.zone,'graveyard');assert.equal(b.zone,'library');assert.equal(f.a.pool.W,0);
});
test('An invalidated damage target keeps the originally assigned damage on surviving targets',async()=>{
 const f=setup(),a=body(f),b=body(f,f.b),s=card(f,"Avacyn's Judgment",'hand');target(f,a,b);fuel(f.a);await f.game.castSpell(f.a,s,{from:'hand'});await f.game.move(a,'hand');await settle(f.game);assert.equal(b.damage,1);
});
