import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target,tokens} from './helpers/c17-c19-fixtures.mjs';
for(const role of ['human','ai']){
 test(role+': Archfiend uses actual damage and offers the damaging controller the sacrifice',async()=>{
  const f=setup(role),a=await play(f,'Archfiend of Spite'),b=body(f,f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('sacrifice or lose life')?'life':undefined;
  await f.game.damageCreature(b,a,2);await settle(f.game);assert.equal(f.b.life,38);assert.equal(b.zone,'battlefield');
  f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('sacrifice or lose life')?'sacrifice':undefined;await f.game.damageCreature(b,a,1);await settle(f.game);assert.equal(b.zone,'graveyard');assert.equal(f.b.life,38);
 });
 test(role+': Boneyard Parley has an opponent divide all graveyards and reanimates only the chosen pile',async()=>{
  const f=setup(role),a=card(f,'Grizzly Bears','graveyard'),b=card(f,'Serra Angel','graveyard',f.b),c=card(f,'Thundermaw Hellkite','graveyard',f.others[1]);let splitter;
  f.decide=(p,q)=>q.type==='chooseTargets'?[a,b,c]:q.type==='chooseCards'&&q.prompt.includes('first pile')?(splitter=p,[b]):q.type==='chooseOption'&&q.prompt.includes('choose a pile')?'one':undefined;
  await play(f,'Boneyard Parley');assert.notEqual(splitter,f.a);assert.equal(b.zone,'battlefield');assert.equal(b.ctrl,f.a);assert.equal(a.zone,'graveyard');assert.equal(c.zone,'graveyard');
 });
 test(role+': Borderland Explorer searches for each player who actually discards',async()=>{
  const f=setup(role);for(const p of f.game.players)card(f,'Island','hand',p);const hand=f.game.players.map(p=>p.hand[0]);f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('discard for a basic land')?p===f.b?[]:[hand[p.idx]]:undefined;
  await play(f,'Borderland Explorer');assert.equal(hand[0].zone,'graveyard');assert.equal(hand[1].zone,'hand');assert.equal(hand[2].zone,'graveyard');assert.equal(f.a.hand.length,1);assert.ok(f.a.hand[0].is('Land'));
 });
 test(role+': Cauldron Dance requires combat and tracks separate return and sacrifice delays',async()=>{
  const f=setup(role),s=card(f,'Cauldron Dance','hand'),b=card(f,'Grizzly Bears','graveyard'),h=card(f,'Serra Angel','hand');fuel(f.a);target(f,b);const before=mana(f.a);assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),false);assert.equal(mana(f.a),before);
  f.game.phase='combat';await play(f,s.name,{card:s});assert.ok(b.kw('haste')&&h.kw('haste'));assert.equal(h.zone,'battlefield');await event(f,'endStep',{player:f.b});assert.equal(b.zone,'hand');assert.equal(h.zone,'graveyard');
 });
 test(role+': Crosis pays after combat damage and discards every card of the chosen color',async()=>{
  const f=setup(role),c=await play(f,'Crosis, the Purger'),a=card(f,'Doom Blade','hand',f.b),b=card(f,'Grizzly Bears','hand',f.b);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a color')?'B':undefined;fuel(f.a);await f.game.damagePlayer(c,f.b,6,{combat:true});await settle(f.game);assert.equal(a.zone,'graveyard');assert.equal(b.zone,'hand');assert.equal(f.b.life,34);
 });
 test(role+': Geth binds graveyard target mana value to paid X and mills its owner',async()=>{
  const f=setup(role),g=await play(f,'Geth, Lord of the Vault'),b=card(f,'Grizzly Bears','graveyard',f.b),own=card(f,'Sol Ring','graveyard');f.decide=(p,q)=>q.type==='chooseX'?2:q.type==='chooseTargets'?[b]:undefined;await activate(f,g);assert.equal(b.zone,'battlefield');assert.equal(b.ctrl,f.a);assert.ok(b.tapped);assert.equal(f.b.graveyard.length,2);assert.equal(own.zone,'graveyard');
 });
 test(role+': Ghired Belligerence populates once per damaged creature that dies, but never after blinking',async()=>{
  const f=setup(role);await play(f,'Ghired, Conclave Exile');const b=body(f,f.b),c=card(f,'Serra Angel','battlefield',f.b);f.decide=(p,q)=>q.type==='chooseX'?2:q.type==='chooseTargets'?[b]:undefined;await play(f,"Ghired's Belligerence");assert.equal(b.zone,'graveyard');assert.equal(tokens(f).length,2);
  f.decide=(p,q)=>q.type==='chooseX'?1:q.type==='chooseTargets'?[c]:undefined;await play(f,"Ghired's Belligerence");await f.game.move(c,'exile');await f.game.move(c,'battlefield',{ctrl:f.b});await f.game.destroy(c);await settle(f.game);assert.equal(tokens(f).length,2);
 });
 test(role+': Hunting Wilds kicked Forests stay green 3/3 creatures with haste beyond end of turn',async()=>{
  const f=setup(role);await play(f,'Hunting Wilds');const lands=f.game.lands(f.a);assert.equal(lands.length,2);assert.ok(lands.every(c=>c.is('Creature')&&c.power===3&&!c.tapped&&c.kw('haste')));f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();assert.ok(lands.every(c=>c.is('Creature')&&c.power===3));
 });
 test(role+': Moldgraf exiles the dead object and reanimates two distinct random creatures',async()=>{
  const f=setup(role),m=await play(f,'Moldgraf Monstrosity');for(const n of ['Grizzly Bears','Serra Angel','Thundermaw Hellkite'])card(f,n,'graveyard');await f.game.destroy(m);await settle(f.game);assert.equal(m.zone,'exile');assert.equal(f.game.creatures(f.a).length,2);assert.equal(f.a.graveyard.length,1);
 });
 test(role+': Nissa Pilgrimage spell mastery finds three basic Forests and puts exactly one onto the battlefield',async()=>{
  const f=setup(role);card(f,'Doom Blade','graveyard');card(f,'Cultivate','graveyard');await play(f,"Nissa's Pilgrimage");assert.equal(f.a.hand.length,2);assert.equal(f.game.lands(f.a).length,1);assert.ok(f.game.lands(f.a)[0].tapped);
 });
 test(role+': Ojutai triggers for another attacking Dragon and taps a nonland opponent permanent',async()=>{
  const f=setup(role);await play(f,'Ojutai, Soul of Winter');const d=card(f,'Thundermaw Hellkite'),b=body(f,f.b);target(f,b);await event(f,'attacks',{card:d,player:f.a});assert.ok(b.tapped&&b.meta.noUntapOnce);
 });
 test(role+': Scaretiller pays no land play and can select either hand or graveyard mode',async()=>{
  const f=setup(role),s=await play(f,'Scaretiller'),l=card(f,'Forest','hand'),g=card(f,'Island','graveyard');f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('Scaretiller')?'0':undefined;f.game.tap(s);await settle(f.game);assert.equal(l.zone,'battlefield');assert.ok(l.tapped);assert.equal(f.a.landsPlayed,0);f.game.untap(s);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('Scaretiller')?'1':q.type==='chooseTargets'?[g]:undefined;f.game.tap(s);await settle(f.game);assert.equal(g.zone,'battlefield');assert.ok(g.tapped);
 });
 test(role+': Scrabbling Claws lets the targeted player choose and sacrifices as a cost for its second ability',async()=>{
  const f=setup(role),c=await play(f,'Scrabbling Claws'),a=card(f,'Grizzly Bears','graveyard',f.b),b=card(f,'Serra Angel','graveyard',f.b);let chooser;f.decide=(p,q)=>q.type==='chooseTargets'?[f.b]:q.type==='chooseCards'&&q.prompt.includes('exile a card')?(chooser=p,[b]):undefined;await activate(f,c);assert.equal(chooser,f.b);assert.equal(b.zone,'exile');target(f,a);await activate(f,c,1);assert.equal(a.zone,'exile');assert.equal(c.zone,'graveyard');assert.equal(f.a.hand.length,1);
 });
 test(role+': Skyfire Phoenix returns from the graveyard when a commander is actually cast',async()=>{
  const f=setup(role),p=card(f,'Skyfire Phoenix','graveyard'),c=card(f,'Ghired, Conclave Exile','command');c.commander=true;f.a.commanders=[c];await play(f,c.name,{card:c});assert.equal(p.zone,'battlefield');assert.ok(p.kw('haste'));
 });
 test(role+': Sower chooses two different players and mirrors damage as life loss without recursion',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose the first player')?String(f.b.idx):q.type==='chooseOption'&&q.prompt.includes('choose the second player')?String(f.others[1].idx):undefined;await play(f,'Sower of Discord');await f.game.damagePlayer(body(f),f.b,3);await settle(f.game);assert.equal(f.b.life,37);assert.equal(f.others[1].life,37);await f.game.loseLife(f.b,2);await settle(f.game);assert.equal(f.others[1].life,37);
 });
 test(role+': Heart Piercer has a separate reflexive damage trigger and embalm creates a white Zombie copy',async()=>{
  const f=setup(role),b=body(f);f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('sacrifice another creature')?[b]:q.type==='chooseTargets'?[f.b]:undefined;const m=await play(f,'Heart-Piercer Manticore');assert.equal(b.zone,'graveyard');assert.equal(f.b.life,38);await f.game.destroy(m);await settle(f.game);f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('sacrifice another creature')?[]:undefined;fuel(f.a);const entry=f.game.activatableList(f.a).find(e=>e.card===m&&e.gyAbility);assert.ok(entry);assert.equal(await f.game.activateAbility(f.a,entry),true);await settle(f.game);assert.equal(m.zone,'exile');assert.equal(tokens(f).length,1);assert.ok(tokens(f)[0].hasSub('Zombie')&&tokens(f)[0].hasSub('Manticore'));assert.deepEqual(Array.from(tokens(f)[0].colors),['W']);assert.equal(tokens(f)[0].mv,0);
 });
 test(role+': Vein Drinker gains a counter for a killed creature and preserves its original source identity',async()=>{
  const f=setup(role),v=await play(f,'Vein Drinker'),b=body(f,f.b);v.sick=false;target(f,b);await activate(f,v);assert.equal(b.zone,'graveyard');assert.equal(v.counters['+1/+1'],1);assert.equal(v.damage,2);
 });
 test(role+': Skull Storm copies for actual command-zone casts, and each copy resolves its own sacrifice choice',async()=>{
  const f=setup(role),c=card(f,'Ghired, Conclave Exile','command');c.commander=true;f.a.commanders=[c];await play(f,c.name,{card:c});const b=body(f,f.b);await play(f,'Skull Storm');assert.equal(c.cmdCasts,1);assert.equal(b.zone,'graveyard');assert.equal(f.b.life,20);assert.equal(f.others[1].life,10);
 });
 test(role+': Taj Nar pays X during its ETB trigger and searches Equipment within that mana value',async()=>{
  const f=setup(role),e=card(f,'Bonesplitter','library');f.decide=(p,q)=>q.type==='chooseX'?1:q.type==='chooseOption'&&q.prompt.includes('pay to search')?'yes':q.type==='chooseCards'&&q.search?[e]:undefined;await play(f,'Taj-Nar Swordsmith');assert.equal(e.zone,'battlefield');
 });
}
