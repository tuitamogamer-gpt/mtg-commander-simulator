import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,fuel,mana,settle,target,tokens} from './helpers/c17-c19-fixtures.mjs';
const expire=f=>{f.game.untilEffects=f.game.untilEffects.filter(e=>e.expires!=='eot');f.game.recalc();};
const combat=f=>{f.game.phase='combat';f.game.combat={attackers:[],blockers:[]};};
for(const role of ['human','ai']){
 test(role+': Estrid Invocation enters as an enchantment copy, blinks, and can choose a different copy',async()=>{
  const f=setup(role),o=card(f,'Dictate of Kruphix'),ground=card(f,'Ground Seal');let model=o;f.decide=(p,q)=>q.type==='chooseCards'&&q.prompt.includes('copy an enchantment')?[model]:undefined;const c=await play(f,"Estrid's Invocation");assert.equal(c.name,'Dictate of Kruphix');const v=c.zoneVersion;model=ground;await event(f,'upkeep',{player:f.a});assert.ok(c.zoneVersion>v);assert.equal(c.name,'Ground Seal');assert.equal(f.a.hand.length,1);
 });
 test(role+': Estrid Invocation can copy an Aura and chooses a legal nontargeted host before entering',async()=>{
  const f=setup(role),b=body(f),a=card(f,'Snake Umbra');await f.game.attach(a,b);const c=await play(f,"Estrid's Invocation");assert.equal(c.name,'Snake Umbra');assert.equal(c.attachedTo,b.iid);assert.equal(b.power,4);
 });
 test(role+': Enigma Sphinx cascades from a real cast and its death places it third from the top',async()=>{
  const f=setup(role);const s=card(f,'Sol Ring','library');const e=await play(f,'Enigma Sphinx');assert.equal(s.zone,'battlefield');await f.game.destroy(e);await settle(f.game);assert.equal(f.a.library.at(-3),e);
 });
 test(role+': Flamerush Rider dash pays its alternative and copies another attacker only until end of combat',async()=>{
  const f=setup(role),b=body(f),r=await play(f,'Flamerush Rider',{alt:{altCostStr:'{2}{R}{R}',dash:true}});assert.ok(r.kw('haste'));combat(f);b.attacking=f.b;target(f,b);await event(f,'attacks',{card:r,player:f.a,defender:f.b});assert.equal(tokens(f).length,1);assert.ok(tokens(f)[0].tapped&&tokens(f)[0].attacking);await event(f,'endCombat',{player:f.a});assert.equal(tokens(f).length,0);await event(f,'endStep',{player:f.a});assert.equal(r.zone,'hand');
 });
 test(role+': Gyrus enters with total mana spent, exiles a lower-power card, and makes an attacking copy',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseX'?2:undefined;const g=await play(f,'Gyrus, Waker of Corpses');assert.equal(g.plus1(),5);const b=card(f,'Grizzly Bears','graveyard');combat(f);target(f,b);await event(f,'attacks',{card:g,player:f.a,defender:f.b});assert.equal(b.zone,'exile');assert.equal(tokens(f).length,1);assert.ok(tokens(f)[0].attacking);await event(f,'endCombat',{player:f.a});assert.equal(tokens(f).length,0);
 });
 test(role+': Mimic Vat replaces its imprint, creates a hasty copy and ends only that token at the next end step',async()=>{
  const f=setup(role),v=await play(f,'Mimic Vat'),a=body(f,f.b);await f.game.destroy(a);await settle(f.game);assert.equal(a.zone,'exile');const b=card(f,'Serra Angel','battlefield',f.b);await f.game.destroy(b);await settle(f.game);assert.equal(a.zone,'graveyard');assert.equal(b.zone,'exile');await activate(f,v);assert.equal(tokens(f).length,1);assert.equal(tokens(f)[0].name,'Serra Angel');assert.ok(tokens(f)[0].kw('haste'));await event(f,'endStep',{player:f.b});assert.equal(tokens(f).length,0);
 });
 for(const [name,model,cost]of [['Prototype Portal','Sol Ring',1],['Soul Foundry','Grizzly Bears',2]])test(role+': '+name+' pays the imprinted mana value and keeps the link after its source leaves',async()=>{
  const f=setup(role),m=card(f,model,'hand'),s=await play(f,name);assert.equal(m.zone,'exile');fuel(f.a);const entry=f.game.activatableList(f.a).find(e=>e.card===s&&e.ability),before=mana(f.a);assert.equal(await f.game.activateAbility(f.a,entry),true);assert.equal(before-mana(f.a),cost);await f.game.move(s,'graveyard');await settle(f.game);const made=f.game.bf().filter(c=>c.isToken);assert.equal(made.length,1);assert.equal(made[0].name,model);
 });
 test(role+': Izzet Chemister sacrifices itself to cast multiple linked cards using normal spell resolution',async()=>{
  const f=setup(role),c=await play(f,'Izzet Chemister'),a=card(f,'Cultivate','graveyard'),b=card(f,'Sign in Blood','graveyard');target(f,a);await activate(f,c);f.game.untap(c);target(f,b);await activate(f,c);assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');f.game.untap(c);target(f,f.b);await activate(f,c,1);assert.equal(c.zone,'graveyard');assert.equal(a.zone,'graveyard');assert.equal(b.zone,'graveyard');assert.equal(f.b.life,38);assert.equal(f.b.hand.length,2);assert.equal(f.game.lands(f.a).length,1);
 });
 test(role+': Scion searches and copies a Dragon, then returns to its original characteristics',async()=>{
  const f=setup(role),s=await play(f,'Scion of the Ur-Dragon'),d=card(f,'Thundermaw Hellkite','library');f.decide=(p,q)=>q.type==='chooseCards'&&q.search?[d]:undefined;await activate(f,s);assert.equal(d.zone,'graveyard');assert.equal(s.name,'Thundermaw Hellkite');assert.equal(s.power,5);expire(f);assert.equal(s.name,'Scion of the Ur-Dragon');
 });
 test(role+': Ramos gains counters per distinct spell color and pays five counters for a once-per-turn mana ability',async()=>{
  const f=setup(role),r=await play(f,'Ramos, Dragon Engine');await play(f,'Ghired, Conclave Exile');assert.equal(r.plus1(),3);f.game.addCounters(r,'+1/+1',2);for(const k of Object.keys(f.a.pool))f.a.pool[k]=0;const entry=f.game.activatableList(f.a).find(e=>e.card===r&&e.manaAbility);assert.ok(entry);assert.equal(await f.game.activateAbility(f.a,entry),true);assert.equal(r.plus1(),0);assert.equal(mana(f.a),10);assert.equal(f.game.stack.length,0);f.game.addCounters(r,'+1/+1',5);assert.equal(f.game.activatableList(f.a).some(e=>e.card===r&&e.manaAbility),false);
 });
 test(role+': Treasure Nabber sees actual artifact mana taps and keeps control through its controller next turn',async()=>{
  const f=setup(role),n=await play(f,'Treasure Nabber'),r=card(f,'Sol Ring','battlefield',f.b);f.game.turnPlayer=f.b;const spell=card(f,'Mind Stone','hand',f.b);assert.equal(await f.game.castSpell(f.b,spell,{from:'hand'}),true);assert.ok(r.tapped);await settle(f.game);assert.equal(r.ctrl,f.a);const effect=f.game.untilEffects.find(e=>e.layeredControl&&e.iid===r.iid);assert.equal(effect.expires,'throughTurnOf');assert.equal(effect.afterTurnsStarted,(f.a.turnsStarted||0)+1);await f.game.move(n,'graveyard');assert.equal(r.ctrl,f.a);f.game.mainPhase=async()=>{};f.game.combatPhase=async()=>{};f.game.turnPlayer=f.a;await f.game.runTurn();assert.equal(r.ctrl,f.b);
 });
 test(role+': Magus of the Abyss makes the active player choose a legal target and prohibits regeneration',async()=>{
  const f=setup(role);await play(f,'Magus of the Abyss');const b=body(f,f.b),a=card(f,'Solemn Simulacrum','battlefield',f.b);b.regenShield=1;let chooser;f.decide=(p,q)=>q.type==='chooseTargets'?(chooser=p,[b]):undefined;await event(f,'upkeep',{player:f.b});assert.equal(chooser,f.b);assert.equal(b.zone,'graveyard');assert.equal(a.zone,'battlefield');
 });
 test(role+': Magus of the Balance equalizes each category separately after sacrificing itself as cost',async()=>{
  const f=setup(role),m=await play(f,'Magus of the Balance');m.sick=false;for(const [i,p]of f.game.players.entries())for(let n=0;n<i+1;n++){card(f,'Forest','battlefield',p);body(f,p);card(f,'Island','hand',p);}await activate(f,m);for(const p of f.game.players){assert.equal(f.game.lands(p).length,1);assert.equal(f.game.creatures(p).length,1);assert.equal(p.hand.length,1);}assert.equal(m.zone,'graveyard');
 });
 test(role+': Marchesa grants dethrone and returns dead creatures with counters even after she leaves',async()=>{
  const f=setup(role),m=await play(f,'Marchesa, the Black Rose'),b=body(f);b.attacking=f.b;await event(f,'attacks',{card:b,player:f.a,defender:f.b});assert.equal(b.plus1(),1);await f.game.destroyMany([m,b]);await settle(f.game);assert.equal(b.zone,'graveyard');await event(f,'endStep',{player:f.b});assert.equal(b.zone,'battlefield');assert.equal(b.plus1(),0);assert.equal(m.zone,'graveyard');
 });
 test(role+': Tawnos copies an artifact activated ability on the Stack with new targets',async()=>{
  const f=setup(role),t=await play(f,"Tawnos, Urza's Apprentice"),c=card(f,'Scrabbling Claws'),a=card(f,'Grizzly Bears','graveyard',f.b),b=card(f,'Island','graveyard',f.others[1]);fuel(f.a);target(f,f.b);const entry=f.game.activatableList(f.a).find(e=>e.card===c&&e.ability===c.def.abilities[0]);assert.equal(await f.game.activateAbility(f.a,entry),true);const original=f.game.stack.at(-1);f.decide=(p,q)=>q.type==='chooseTargets'?q.candidates.includes(original)?[original]:q.candidates.includes(f.others[1])?[f.others[1]]:undefined:q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;await activate(f,t);assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');
 });
}
test('Prototype Portal with copied imprint triggers sums mana values and creates each linked card once',async()=>{
 const f=setup(),a=card(f,'Sol Ring','hand'),b=card(f,'Scrabbling Claws','hand');const s=card(f,'Prototype Portal','hand');fuel(f.a);assert.equal(await f.game.castSpell(f.a,s,{from:'hand'}),true);await f.game.resolveTop();await f.game.flushTriggers();const trigger=f.game.stack.at(-1);await f.game.copyStackAbility(trigger,f.a);await settle(f.game);assert.equal(a.zone,'exile');assert.equal(b.zone,'exile');fuel(f.a);const before=mana(f.a),entry=f.game.activatableList(f.a).find(e=>e.card===s&&e.ability);assert.equal(await f.game.activateAbility(f.a,entry),true);assert.equal(before-mana(f.a),2);await settle(f.game);assert.equal(f.game.bf().filter(c=>c.isToken).length,2);
});
test('An imprinted card that leaves exile and later returns is no longer linked',async()=>{
 const f=setup(),b=card(f,'Grizzly Bears','hand'),s=await play(f,'Soul Foundry');await f.game.move(b,'hand');await f.game.move(b,'exile');await activate(f,s);assert.equal(tokens(f).length,0);
});
