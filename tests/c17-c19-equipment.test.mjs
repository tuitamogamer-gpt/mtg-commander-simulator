import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target,tokens} from './helpers/c17-c19-fixtures.mjs';
const expire=f=>{f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();};
for(const role of ['human','ai']){
 test(role+': Blade of the Bloodchief puts one counter on a creature and two on a Vampire',async()=>{
  const f=setup(role),e=await play(f,'Blade of the Bloodchief'),b=body(f),v=card(f,'Vampire Nighthawk');await f.game.attach(e,b);await f.game.destroy(body(f,f.b));await settle(f.game);assert.equal(b.plus1(),1);await f.game.attach(e,v);await f.game.destroy(body(f,f.b));await settle(f.game);assert.equal(v.plus1(),2);
 });
 test(role+': Grappling Hook requires blocking its exact equipped attacker, and grants double strike',async()=>{
  const f=setup(role),e=await play(f,'Grappling Hook'),a=body(f),b=body(f,f.b);await f.game.attach(e,a);target(f,b);await event(f,'attacks',{card:a,player:f.a});assert.ok(a.kw('double strike'));assert.equal(M.OracleV8CombatRestrictions.requirements(b,a),1);await f.game.move(a,'exile');await f.game.move(a,'battlefield',{ctrl:f.a});assert.equal(M.OracleV8CombatRestrictions.requirements(b,a),0);
 });
 test(role+': Hammer attaches itself and later Equipment using real targeted triggers',async()=>{
  const f=setup(role),b=body(f);target(f,b);const h=await play(f,'Hammer of Nazahn');assert.equal(h.attachedTo,b.iid);assert.equal(b.power,4);assert.ok(b.kw('indestructible'));const e=await play(f,'Bonesplitter');assert.equal(e.attachedTo,b.iid);assert.equal(b.power,6);await f.game.destroy(b);assert.equal(b.zone,'battlefield');
 });
 test(role+': Heirloom Blade uses the dying creature types and puts the first match in hand',async()=>{
  const f=setup(role),e=await play(f,'Heirloom Blade'),b=body(f),match=card(f,'Grizzly Bears','library'),miss=card(f,'Island','library');await f.game.attach(e,b);assert.equal(b.power,5);await f.game.destroy(b);await settle(f.game);assert.equal(match.zone,'hand');assert.equal(f.a.library[0],miss);assert.equal(e.attachedTo,null);
 });
 test(role+': Heavenly Blademaster moves legal attachments and buffs each other creature by the attachment count',async()=>{
  const f=setup(role),b=body(f),e=card(f,'Bonesplitter'),a=card(f,'Snake Umbra','hand');target(f,b);await play(f,a.name,{card:a});const h=await play(f,'Heavenly Blademaster');assert.equal(e.attachedTo,h.iid);assert.equal(a.attachedTo,h.iid);assert.equal(b.power,4);assert.equal(h.power,6);await f.game.move(a,'graveyard');assert.equal(b.power,3);
 });
 test(role+': Bruna attaches an opponent Aura and enters your hand and graveyard Auras already attached',async()=>{
  const f=setup(role),b=await play(f,'Bruna, Light of Alabaster'),h=card(f,'Snake Umbra','hand'),d=card(f,'Eel Umbra','graveyard'),o=card(f,'Vow of Wildness','battlefield',f.b);await f.game.attach(o,body(f,f.b));await event(f,'attacks',{card:b,player:f.a});for(const a of [h,d,o])assert.equal(a.attachedTo,b.iid);assert.equal(o.ctrl,f.b);assert.ok(b.kw('trample'));assert.equal(b.power,10);
 });
 test(role+': Kindred Boon targets its chosen type but protects any of your creatures with divinity',async()=>{
  const f=setup(role),b=body(f),v=card(f,'Vampire Nighthawk');f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a creature type')?'Bear':q.type==='chooseTargets'?[b]:undefined;const k=await play(f,'Kindred Boon');await activate(f,k);assert.equal(b.counters.divinity,1);assert.ok(b.kw('indestructible'));f.game.addCounters(v,'divinity',1);assert.ok(v.kw('indestructible'));await f.game.move(k,'graveyard');assert.equal(b.kw('indestructible'),false);
 });
 test(role+': Kindred Charge makes hasty object copies and exiles them at the next end step',async()=>{
  const f=setup(role);body(f);body(f);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a creature type')?'Bear':undefined;await play(f,'Kindred Charge');assert.equal(tokens(f).length,2);assert.ok(tokens(f).every(c=>c.kw('haste')&&c.power===2));await event(f,'endStep',{player:f.b});assert.equal(tokens(f).length,0);
 });
 test(role+': Mirror copies its selected creature as an artifact and restores its own definition at end of turn',async()=>{
  const f=setup(role),b=body(f);f.decide=(p,q)=>q.type==='chooseOption'&&q.prompt.includes('choose a creature type')?'Bear':q.type==='chooseTargets'?[b]:undefined;const m=await play(f,'Mirror of the Forebears');await activate(f,m);assert.ok(m.is('Artifact')&&m.is('Creature'));assert.equal(m.power,2);assert.equal(m.name,'Grizzly Bears');expire(f);assert.equal(m.name,'Mirror of the Forebears');assert.equal(m.is('Creature'),false);
 });
 test(role+': Serendib sets base 0/2 while preserving counters and restores printed statistics',async()=>{
  const f=setup(role),s=await play(f,'Serendib Sorcerer'),b=body(f,f.b);f.game.addCounters(b,'+1/+1',2);s.sick=false;target(f,b);await activate(f,s);assert.equal(b.power,2);assert.equal(b.toughness,4);expire(f);assert.equal(b.power,4);assert.equal(b.toughness,4);
 });
 test(role+': Cliffside sacrifices up front and grants protection against all opponents including damage and targeting',async()=>{
  const f=setup(role),c=await play(f,'Cliffside Rescuer'),b=body(f),o=body(f,f.b);c.sick=false;target(f,b);await activate(f,c);assert.equal(c.zone,'graveyard');assert.ok(f.game.isProtectedFrom(b,o));assert.equal(f.game.isProtectedFrom(b,body(f)),false);await f.game.damageCreature(o,b,5);assert.equal(b.zone,'battlefield');assert.equal(b.damage,0);assert.equal(f.game.legalTargets(M.T.creature(),o,f.b).includes(b),false);expire(f);assert.equal(f.game.isProtectedFrom(b,o),false);
 });
 for(const name of ['Curse of Verbosity','Curse of Vitality'])test(role+': '+name+' benefits you once and a different attacking player once',async()=>{
  const f=setup(role),victim=f.others[1];target(f,victim);await play(f,name);const a=body(f,f.b);a.attacking=victim;await event(f,'attackersDeclared',{player:f.b,attackers:[a]});const stat=p=>name==='Curse of Verbosity'?p.hand.length:p.life-40;assert.equal(stat(f.a),name==='Curse of Verbosity'?1:2);assert.equal(stat(f.b),name==='Curse of Verbosity'?1:2);assert.equal(stat(victim),0);const own=body(f);own.attacking=victim;await event(f,'attackersDeclared',{player:f.a,attackers:[own]});assert.equal(stat(f.a),name==='Curse of Verbosity'?2:4);
 });
 test(role+': Curse of Fools Wisdom triggers for each actual card drawn and has a real madness alternative',async()=>{
  const f=setup(role);target(f,f.b);const c=card(f,"Curse of Fool's Wisdom",'hand');fuel(f.a);await f.game.discard(f.a,[c]);await settle(f.game);assert.equal(c.zone,'battlefield');assert.ok(c.castMeta.alt.madness);await f.game.draw(f.b,2);await settle(f.game);assert.equal(f.b.life,36);assert.equal(f.a.life,44);
 });
 test(role+': Nazahn searches Hammer onto the battlefield and limits attack trigger targets to the defender',async()=>{
  const f=setup(role),h=card(f,'Hammer of Nazahn','library');f.decide=(p,q)=>q.type==='chooseCards'&&q.search?[h]:undefined;const n=await play(f,'Nazahn, Revered Bladesmith');assert.equal(h.zone,'battlefield');assert.equal(h.attachedTo,n.iid);const b=body(f,f.b),c=body(f,f.others[1]);n.attacking=f.b;f.decide=(p,q)=>q.type==='chooseTargets'?q.candidates.filter(x=>x===b):undefined;await event(f,'attacks',{card:n,player:f.a});assert.ok(b.tapped);assert.equal(c.tapped,false);
 });
 test(role+': Myth Unbound reduces each commander separately and draws on actual command-zone entry',async()=>{
  const f=setup(role);await play(f,'Myth Unbound');const c=card(f,'Ghired, Conclave Exile','command');c.commander=true;c.cmdCasts=2;f.a.commanders=[c];assert.equal(f.game.spellCost(f.a,c).generic,4);await play(f,c.name,{card:c});await f.game.move(c,'command');await settle(f.game);assert.equal(f.a.hand.length,1);assert.equal(c.cmdCasts,3);
 });
 test(role+': Leonin Shikari offers and resolves paid equip during another player turn and rejects a stale offer after it leaves',async()=>{
  const f=setup(role),s=await play(f,'Leonin Shikari'),b=body(f),e=card(f,'Bonesplitter');fuel(f.a);f.game.turnPlayer=f.b;f.game.phase='combat';target(f,b);const action=f.game.activatableList(f.a).find(a=>a.card===e&&a.equip);assert.ok(action);const before=mana(f.a);assert.equal(await f.game.activateAbility(f.a,action),true);assert.ok(mana(f.a)<before);assert.ok(f.game.stack.length);await settle(f.game);assert.equal(e.attachedTo,b.iid);await f.game.move(s,'graveyard');assert.equal(f.game.activatableList(f.a).some(a=>a.card===e&&a.equip),false);const unchanged=mana(f.a);assert.equal(await f.game.activateAbility(f.a,action),false);assert.equal(mana(f.a),unchanged);
 });
 test(role+': Unwinding Clock untaps artifacts simultaneously during another untap step and removes a stun only once',async()=>{
  const f=setup(role),clock=await play(f,'Unwinding Clock'),a=card(f,'Sol Ring'),b=body(f),l=card(f,'Island'),other=card(f,'Sol Ring','battlefield',f.others[1]);for(const c of [clock,a,b,l,other])f.game.tap(c);f.game.addCounters(a,'stun',1);f.game.turnPlayer=f.b;f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};await f.game.runTurn();assert.equal(clock.tapped,false);assert.ok(a.tapped);assert.equal(a.counters.stun||0,0);assert.ok(b.tapped&&l.tapped&&other.tapped);
 });
 test(role+': Flayer triggers on a graveyard entry, including its own undying, and uses the entering creature as damage source',async()=>{
  const f=setup(role);target(f,f.b);const c=await play(f,'Flayer of the Hatebound');assert.equal(f.b.life,40);await f.game.destroy(c);await settle(f.game);assert.equal(c.zone,'battlefield');assert.equal(c.plus1(),1);assert.equal(f.b.life,35);const a=card(f,'Vampire Nighthawk','graveyard');await f.game.putPermanentOntoBattlefield(a,f.a);await settle(f.game);assert.equal(f.b.life,33);assert.equal(f.a.life,42);
 });
}
