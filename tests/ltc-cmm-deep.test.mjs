import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,play,activate,event,settle,fuel} from './helpers/c21-fixtures.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const target=(f,c)=>{f.decide=(p,q)=>q.type==='chooseTargets'&&q.candidates.includes(c)?[c]:undefined;};
const entry=(f,c,index=0)=>f.game.activatableList(c.ctrl).find(e=>e.card===c&&e.ability===c.def.abilities[index]);
const castPending=async(f,name)=>{const c=card(f,name,'hand');fuel(f.a);assert.equal(await f.game.castSpell(f.a,c,{from:'hand'}),true);return c;};
const restore=f=>{const snapshot=M.captureGameState(f.game);assert.ok(snapshot,JSON.stringify(M.gameStateSnapshotBlockers(f.game)));const fresh=setup();M.restoreGameState(fresh.game,JSON.parse(JSON.stringify(snapshot)));return fresh;};

for(const role of ['human','ai']){
 test(role+': Chandra -X exiles a planeswalker reduced to zero loyalty',async()=>{
  const f=setup(role),c=card(f,'Chandra, Awakened Inferno'),j=card(f,'Jace Beleren','battlefield',f.b);c.counters.loyalty=6;j.counters.loyalty=2;f.x=2;target(f,j);f.decide=(p,q)=>q.type==='chooseX'?2:q.type==='chooseTargets'?[j]:undefined;
  await activate(f,c,2);assert.equal(c.counters.loyalty,4);assert.equal(j.zone,'exile');assertGameStateInvariants(f.game);
 });
 test(role+': Chandra damage marks a surviving planeswalker for later destruction',async()=>{
  const f=setup(role),c=card(f,'Chandra, Awakened Inferno'),j=card(f,'Jace Beleren','battlefield',f.b);c.counters.loyalty=6;j.counters.loyalty=5;
  f.decide=(p,q)=>q.type==='chooseX'?1:q.type==='chooseTargets'?[j]:undefined;await activate(f,c,2);assert.equal(j.zone,'battlefield');await f.game.destroy(j);assert.equal(j.zone,'exile');
 });
 test(role+': Chandra with X zero creates no death replacement',async()=>{
  const f=setup(role),c=card(f,'Chandra, Awakened Inferno'),b=body(f,f.b);c.counters.loyalty=6;
  f.decide=(p,q)=>q.type==='chooseX'?0:q.type==='chooseTargets'?[b]:undefined;await activate(f,c,2);await f.game.destroy(b);assert.equal(b.zone,'graveyard');
 });
 test(role+': Chandra death replacement does not follow a blinked creature',async()=>{
  const f=setup(role),c=card(f,'Chandra, Awakened Inferno'),b=body(f,f.b);c.counters.loyalty=6;
  f.decide=(p,q)=>q.type==='chooseX'?1:q.type==='chooseTargets'?[b]:undefined;await activate(f,c,2);await f.game.move(b,'exile');await f.game.putPermanentOntoBattlefield(b,f.b);await f.game.destroy(b);assert.equal(b.zone,'graveyard');
 });
 test(role+': Chain Veil applies to planeswalkers entering later and persists without the artifact',async()=>{
  const f=setup(role),v=card(f,'The Chain Veil');await activate(f,v);await f.game.move(v,'graveyard');const j=await play(f,'Jace Beleren');
  await activate(f,j,0);assert.equal(f.game.canActivateLoyalty(j),true);await activate(f,j,0);assert.equal(f.game.canActivateLoyalty(j),false);
 });
 test(role+': Chain Veil stacks, applies after a blink, and expires on a later turn',async()=>{
  const f=setup(role),v=card(f,'The Chain Veil'),j=await play(f,'Jace Beleren');await activate(f,v);f.game.untap(v);await activate(f,v);
  await f.game.move(j,'exile');await f.game.putPermanentOntoBattlefield(j,f.a);await settle(f.game);
  for(let i=0;i<3;i++)await activate(f,j,0);assert.equal(f.game.canActivateLoyalty(j),false);
  f.game.turnNo++;f.a.turnState=f.a.freshTurnState();await activate(f,j,0);assert.equal(f.game.canActivateLoyalty(j),false);
 });
 test(role+': Oath of Teferi does not grant extra activations to Sparkshaper Bird creatures',async()=>{
  const f=setup(role);card(f,'Oath of Teferi');card(f,'Sparkshaper Visionary');const j=await play(f,'Jace Beleren');target(f,j);await event(f,'beginCombat',{player:f.a});assert.equal(j.is('Planeswalker'),false);f.game.phase='main2';await activate(f,j,0);assert.equal(f.game.canActivateLoyalty(j),false);
 });
 test(role+': Chain Veil still loses life when only a non-planeswalker loyalty ability was activated',async()=>{
  const f=setup(role);card(f,'The Chain Veil');card(f,'Sparkshaper Visionary');const j=await play(f,'Jace Beleren');target(f,j);await event(f,'beginCombat',{player:f.a});assert.equal(j.is('Planeswalker'),false);f.game.phase='main2';await activate(f,j,0);const life=f.a.life;await event(f,'endStep',{player:f.a});assert.equal(f.a.life,life-2);
 });
 test(role+': Chain Veil does not penalize a planeswalker activation after its source leaves',async()=>{
  const f=setup(role);card(f,'The Chain Veil');const j=await play(f,'Jace Beleren');await activate(f,j,0);await f.game.move(j,'graveyard');const life=f.a.life;await event(f,'endStep',{player:f.a});assert.equal(f.a.life,life);
 });
 test(role+': Hatchery replicate survives removal of its source after casting',async()=>{
  const f=setup(role),h=card(f,'Hatchery Sliver');f.decide=(p,q)=>q.type==='chooseX'?2:undefined;const s=await castPending(f,'Predatory Sliver');await f.game.move(h,'graveyard');await settle(f.game);
  assert.equal(f.game.creatures(f.a).filter(c=>c.name===s.name).length,3);assert.equal(f.a.turnState.spellsCast,1);assertGameStateInvariants(f.game);
 });
 test(role+': Gravemother encore resolves after the grantor leaves and gives each opponent one token',async()=>{
  const f=setup(role,3),g=card(f,'Sliver Gravemother'),s=card(f,'Predatory Sliver','graveyard');fuel(f.a);const e=f.game.activatableList(f.a).find(e=>e.card===s&&e.gyAbility);assert.ok(e);assert.equal(await f.game.activateAbility(f.a,e),true);assert.equal(s.zone,'exile');await f.game.move(g,'graveyard');await settle(f.game);
  const copies=f.game.creatures(f.a).filter(c=>c.name===s.name);assert.equal(copies.length,3);assert.ok(copies.every(c=>c.isToken&&c.kw('haste')));await event(f,'endStep',{player:f.a});assert.ok(copies.every(c=>c.zone!=='battlefield'));
 });
 test(role+': Sliver combat rewards use its current controller when it remains on the battlefield',async()=>{
  const f=setup(role);card(f,'Synapse Sliver');card(f,'Brood Sliver');const s=card(f,'Predatory Sliver');
  f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;await f.game.damageAny(s,f.b,1,{combat:true});M.LC.control(f.game,s,f.b,false);f.game.recalc();const hand=f.a.hand.length,enemyHand=f.b.hand.length;await settle(f.game);
  assert.equal(f.a.hand.length,hand);assert.equal(f.b.hand.length,enemyHand+1);assert.equal(f.game.creatures(f.b).filter(c=>c.isToken&&c.hasSub('Sliver')).length,1);
 });
 test(role+': Sliver combat rewards use last known control after a stolen Sliver leaves',async()=>{
  const f=setup(role);card(f,'Synapse Sliver');card(f,'Brood Sliver');const s=card(f,'Predatory Sliver','battlefield',f.b);M.LC.control(f.game,s,f.a,false);f.game.recalc();
  f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;await f.game.damageAny(s,f.b,1,{combat:true});await f.game.move(s,'hand');const hand=f.a.hand.length;await settle(f.game);assert.equal(f.a.hand.length,hand+1);assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Sliver')).length,1);
 });
 test(role+': Farmer Cotton uses the cast X even if it leaves before the ETB trigger resolves',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseX'?2:undefined;const c=await castPending(f,'Farmer Cotton');await f.game.resolveTop();assert.equal(c.zone,'battlefield');await f.game.move(c,'exile');await f.game.putPermanentOntoBattlefield(c,f.a);await settle(f.game);
  assert.equal(f.game.bf().filter(c=>c.hasSub('Food')).length,2);assert.equal(f.game.creatures(f.a).filter(c=>c.isToken&&c.hasSub('Halfling')).length,2);
 });
 test(role+': Frodo cannot draw for a new incarnation but the already triggered Ring temptation resolves',async()=>{
  const f=setup(role),frodo=card(f,'Frodo, Adventurous Hobbit');await f.game.gainLife(f.a,3,frodo);await f.game.emit('attacks',{card:frodo,player:f.a,target:f.b});await f.game.move(frodo,'exile');await f.game.putPermanentOntoBattlefield(frodo,f.a);const hand=f.a.hand.length;await settle(f.game);assert.equal(f.a.ringLevel,1);assert.equal(f.a.hand.length,hand);
 });
 test(role+': Jace Mirror Mage remembers paid kicker after blinking before its entry trigger resolves',async()=>{
  const f=setup(role);f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='yes')?'yes':undefined;const j=await castPending(f,'Jace, Mirror Mage');await f.game.resolveTop();await f.game.move(j,'exile');await f.game.putPermanentOntoBattlefield(j,f.a);await settle(f.game);const copies=f.game.bf().filter(c=>c.name===j.name&&c.isToken);assert.equal(copies.length,1);assert.equal(copies[0].counters.loyalty,1);
 });
 test(role+': Shelob cannot reuse linked creatures after blinking',async()=>{
  const f=setup(role),s=card(f,'Shelob, Dread Weaver'),b=body(f,f.b);await f.game.destroy(b);await settle(f.game);assert.equal(b.zone,'exile');await f.game.move(s,'exile');await f.game.putPermanentOntoBattlefield(s,f.a);await settle(f.game);fuel(f.a);assert.equal(!!entry(f,s,0),false);assert.equal(!!entry(f,s,1),false);
 });
 test(role+': Repeated Reverberation still copies the spell if the original is countered first',async()=>{
  const f=setup(role);await play(f,'Repeated Reverberation');target(f,f.b);const bolt=await castPending(f,'Lightning Bolt'),so=f.game.stack.find(s=>s.card===bolt);await f.game.counterStackObject(so);const life=f.b.life;await settle(f.game);assert.equal(f.b.life,life-6);
 });
 test(role+': Repeated Reverberation still copies a countered loyalty ability without paying again',async()=>{
  const f=setup(role);await play(f,'Repeated Reverberation');const j=await play(f,'Jace Beleren');fuel(f.a);assert.equal(await f.game.activateAbility(f.a,entry(f,j)),true);const so=f.game.stack.find(s=>s.kind==='ability'&&s.srcCard===j);await f.game.counterStackObject(so);const hand=f.a.hand.length;await settle(f.game);assert.equal(f.a.hand.length,hand+2);assert.equal(j.counters.loyalty,5);
 });
}

test('Chain Veil permissions and consumed loyalty activations survive JSON save/restore',async()=>{
 const f=setup(),v=card(f,'The Chain Veil');await activate(f,v);const j=await play(f,'Jace Beleren');await activate(f,j,0);const fresh=restore(f),copy=fresh.game.byIid(j.iid);assert.equal(fresh.game.canActivateLoyalty(copy),true);await activate(fresh,copy,0);assert.equal(fresh.game.canActivateLoyalty(copy),false);assert.equal(f.game.canActivateLoyalty(j),true);assertRecalculationStable(fresh.game);
});
test('Rukarumel, Food tokens and Gollum history survive a checkpoint and independent AI clone',async()=>{
 const f=setup();f.decide=(p,q)=>q.type==='chooseOption'&&q.options.some(o=>o.key==='Sliver')?'Sliver':undefined;const r=await play(f,'Rukarumel, Biologist'),b=body(f),g=card(f,'Gollum, Obsessed Stalker');await f.game.damageAny(g,f.b,1,{combat:true});await f.game.makeTokens(M.TOKENS.food,f.a);await settle(f.game);const fresh=restore(f);assert.equal(fresh.game.byIid(b.iid).hasSub('Sliver'),true);assert.equal(fresh.b.lcGollumDamaged,true);assert.ok(fresh.game.bf().some(c=>c.hasSub('Food')));
 const clone=M.cloneGameForAISimulation(f.game,913);await clone.move(clone.byIid(r.iid),'graveyard');assert.equal(clone.byIid(b.iid).hasSub('Sliver'),false);assert.equal(b.hasSub('Sliver'),true);assertGameStateInvariants(clone);assertRecalculationStable(clone);
});
test('Repeated Reverberation triggers independently inside an AI simulation and in the real game',async()=>{
 const f=setup();await play(f,'Repeated Reverberation');const j=await play(f,'Jace Beleren');const clone=M.cloneGameForAISimulation(f.game,913),actor=clone.players[0],copy=clone.byIid(j.iid);clone.priorityRound=async()=>{};const e=clone.activatableList(actor).find(e=>e.card===copy&&e.ability===copy.def.abilities[0]);const hand=actor.hand.length;assert.equal(await clone.activateAbility(actor,e),true);await settle(clone);assert.equal(actor.hand.length,hand+3);const realHand=f.a.hand.length;await activate(f,j,0);assert.equal(f.a.hand.length,realHand+3);
});

const botScenarios=[
 {deck:'Riders of Rohan',spell:'Fealty to the Realm',board:f=>{body(f,f.b);}},
 {deck:'The Hosts of Mordor',spell:'Reanimate',board:f=>{card(f,'Sun Titan','graveyard',f.b);}},
 {deck:'Food and Fellowship',spell:'Farmer Cotton',board:f=>{card(f,'Rosie Cotton of South Lane');body(f);}},
 {deck:'Sliver Swarm',spell:'Predatory Sliver',board:f=>{card(f,'Hatchery Sliver');}},
 {deck:'Planeswalker Party',spell:'Commodore Guff',board:f=>{const j=card(f,'Jace Beleren');j.counters.loyalty=3;}},
];
for(const difficulty of ['normal','hard'])for(const scenario of botScenarios)test(difficulty+' autonomous bot: '+scenario.deck+' chooses and executes its actual card with no scripted answers',async()=>{
 const f=setup('ai');f.a.deck=M.DECKS[scenario.deck];f.a.deckName=scenario.deck;f.a.controller=new M.AIController(f.a,{difficulty,style:'balanced'});scenario.board(f);const c=card(f,scenario.spell,'hand');for(const color of ['W','U','B','R','G','C'])f.a.pool[color]=2;
 const queries=[],decide=f.a.controller.decide.bind(f.a.controller);f.a.controller.decide=async(g,q)=>{queries.push(q.type);return decide(g,q);};const beforeMana=Object.values(f.a.pool).reduce((n,v)=>n+v,0);
 const q={type:'main',player:f.a,casts:f.game.castableList(f.a),acts:f.game.activatableList(f.a),lands:[],phase:'main1'};
 const action=await f.a.controller.decide(f.game,q);assert.equal(action.kind,'cast');assert.equal(action.card.iid,c.iid);assert.equal(await f.game.performAction(f.a,action),true);await settle(f.game);
 assert.ok(Object.values(f.a.pool).reduce((n,v)=>n+v,0)<beforeMana);assert.ok(f.game.aiDecisionLog.length>0);assert.equal(f.game.aiDecisionLog.some(r=>r.fallback),false);assert.equal(f.game._decisionFallbacks||0,0);assertGameStateInvariants(f.game);assertRecalculationStable(f.game);
 if(scenario.spell==='Reanimate'){assert.equal(f.game.creatures(f.a).some(x=>x.name==='Sun Titan'),true);assert.equal(f.a.life,34);assert.ok(queries.includes('chooseTargets'));}
 if(scenario.spell==='Fealty to the Realm'){assert.equal(f.game.monarch.idx,f.a.idx);assert.equal(f.game.creatures(f.a).length,1);assert.ok(queries.includes('chooseTargets'));}
 if(scenario.spell==='Farmer Cotton'){assert.ok(c.castMeta.x>0);assert.equal(f.game.bf().filter(x=>x.hasSub('Food')).length,c.castMeta.x);assert.ok(queries.includes('chooseX'));}
 if(scenario.spell==='Predatory Sliver'){assert.ok(f.game.creatures(f.a).filter(x=>x.name===c.name).length>1);assert.ok(queries.includes('chooseX'));}
 if(scenario.spell==='Commodore Guff')assert.equal(c.zone,'battlefield');
});
