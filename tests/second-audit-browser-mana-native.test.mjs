import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const sourceRoot=resolve(process.env.AUDIT_SOURCE_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const {loadEngine}=await import(pathToFileURL(join(sourceRoot,'tests/helpers/load-engine.mjs')).href);
const M=loadEngine();
function table(){
  const g=new M.Game({seed:778213,paced:false,maxTurns:30}),players=['Human','Opponent','Third','Fourth'].map(name=>g.addPlayer(name,{name:'Printed manual payment'},null,false));
  const [a,b,c,d]=players,f={g,a,b,c,d,players,questions:[],payments:[]};
  for(const p of players)p.controller={decide:async(game,q)=>{
    f.questions.push({player:p.idx,type:q.type,prompt:q.prompt});
    if(q.type==='chooseManaSources'){f.payments.push(q);return {cards:await f.select?.(q)||q.suggested};}
    if(q.type==='priority')return f.priority?.(p,q)||{kind:'pass'};
    if(q.type==='attackers')return f.attackers?.(p,q)||[];
    if(q.type==='blockers')return [];
    if(q.type==='chooseCards')return q.from.slice(0,q.min||0);
    if(q.type==='chooseTargets')return q.candidates.slice(0,q.min||0);
    if(q.type==='chooseOption')return q.options.find(o=>o.key==='yes')?.key||q.options[0]?.key;
    if(q.type==='chooseMulti')return q.options.slice(0,q.min||0).map(o=>o.key);
    if(q.type==='chooseX')return q.min||0;
    if(q.type==='orderTriggers')return q.triggers;
    if(q.type==='scry')return {top:q.cards,bottom:[]};
    if(q.type==='main')return {kind:'done'};
    if(['combatReview','cardReveal','effectReview','threatAlert'].includes(q.type))return null;
    throw Error('Unhandled native printed-payment question '+q.type);
  }};
  g.turnPlayer=a;g.turnNo=6;g.phase='main1';g.step='main';a.manualMana=true;
  f.put=(name,zone='battlefield',owner=a)=>{assert.ok(M.DEFS[name],`printed ${name}`);const card=new M.CardInst(M.DEFS[name],owner);card.zone=zone;card.ctrl=owner;card.sick=false;(zone==='battlefield'?g.battlefield:owner[zone]).push(card);return card;};
  for(const p of players)for(let n=0;n<24;n++)f.put('Forest','library',p);
  f.ready=()=>g.recalc();f.stable=()=>assertGameStateInvariants(g,'printed manual payment');
  f.entry=(card,p=a)=>{const row=g.activatableList(p).find(e=>e.card===card);assert.ok(row,`native ability offer ${card.name}`);return row;};
  f.mana=(card,p=a)=>{const row=g.activatableList(p).find(e=>e.card===card&&e.manaAbility);assert.ok(row,`native mana offer ${card.name}`);return row;};
  return f;
}
async function nativeNinjutsu(name,zone){
  const f=table(),{g,a,b}=f,bear=f.put('Grizzly Bears'),first=f.put('Island'),second=f.put('Island'),swamp=name.startsWith('Yuriko')?f.put('Swamp'):null,ninja=f.put(name,zone);
  if(zone==='command'){ninja.isCommander=true;a.commanders=[ninja];}
  f.select=()=>swamp?[second,swamp]:[second];let used=false;
  f.attackers=(p,q)=>p===a?[{card:q.eligible.find(c=>c===bear),target:b}]:[];
  f.priority=(p,q)=>{const entry=q.acts.find(e=>e.card===ninja&&e.ninjutsu);if(p===a&&g.step==='blockers'&&entry&&!used){used=true;return {kind:'activate',entry};}};
  f.ready();await g.combatPhase(a);
  assert.equal(ninja.zone,'battlefield');assert.equal(bear.zone,'hand');assert.equal(b.life,name.startsWith('Yuriko')?39:38);
  assert.equal(f.payments.length,1,'manual Ninjutsu asks for its actual printed mana cost');assert.equal(first.tapped,false);assert.equal(second.tapped,true);if(swamp)assert.equal(swamp.tapped,true);f.stable();
}
test('manual command Ninjutsu preserves the unchosen Island after real native combat',()=>nativeNinjutsu("Yuriko, the Tiger's Shadow",'command'));
test('manual hand Ninjutsu preserves the unchosen Island after real native combat',()=>nativeNinjutsu('Moon-Circuit Hacker','hand'));

test('manual Cycling chooses the exact Island and resolves its actual draw',async()=>{
  const f=table(),first=f.put('Island'),second=f.put('Island'),sandbar=f.put('Lonely Sandbar','hand');f.select=()=>[second];f.ready();
  assert.equal(await f.g.activateAbility(f.a,f.entry(sandbar)),true);assert.equal(sandbar.zone,'graveyard');assert.equal(f.a.library.length,23);
  assert.equal(f.payments.length,1);assert.equal(first.tapped,false);assert.equal(second.tapped,true);f.stable();
});
test('manual graveyard ability pays printed 1B from exact sources',async()=>{
  const f=table(),unused=f.put('Forest'),forest=f.put('Forest'),swamp=f.put('Swamp'),skeleton=f.put('Reassembling Skeleton','graveyard');f.select=()=>[forest,swamp];f.ready();
  assert.equal(await f.g.activateAbility(f.a,f.entry(skeleton)),true);assert.equal(skeleton.zone,'battlefield');assert.equal(skeleton.tapped,true);
  assert.equal(f.payments.length,1);assert.equal(unused.tapped,false);assert.equal(forest.tapped,true);assert.equal(swamp.tapped,true);f.stable();
});
test('manual Signet activation pays its nested mana fee exactly once',async()=>{
  const f=table(),unused=f.put('Wastes'),chosen=f.put('Wastes'),signet=f.put('Izzet Signet');f.select=q=>{assert.ok(!q.candidates.includes(signet),'the tapping producer is excluded from its own nested fee');return [chosen];};f.ready();
  assert.equal(await f.g.activateAbility(f.a,f.mana(signet)),true);
  assert.equal(f.payments.length,1,'one chooser pays the Signet fee');assert.equal(unused.tapped,false);assert.equal(chosen.tapped,true);assert.equal(signet.tapped,true);
  assert.equal(f.a.pool.U,1);assert.equal(f.a.pool.R,1);assert.equal(f.a.pool.C,0);f.stable();
});
test('a manually selected Signet funds a spell without recursive choosers or double fees',async()=>{
  const f=table(),unused=f.put('Wastes'),chosen=f.put('Wastes'),signet=f.put('Izzet Signet'),draw=f.put('Think Twice','hand');f.select=()=>[chosen,signet];f.ready();
  assert.equal(await f.g.castSpell(f.a,draw,{from:'hand'}),true);assert.equal(draw.zone,'graveyard');assert.equal(f.a.library.length,23);
  assert.equal(f.payments.length,1);assert.equal(unused.tapped,false);assert.equal(chosen.tapped,true);assert.equal(signet.tapped,true);assert.ok(Object.values(f.a.pool).every(n=>n===0));f.stable();
});
test('an ability fully funded by actual floated mana opens no source chooser',async()=>{
  const f=table(),green=f.put('Llanowar Elves'),black=f.put('Elves of Deep Shadow'),skeleton=f.put('Reassembling Skeleton','graveyard');f.ready();
  assert.equal(await f.g.activateAbility(f.a,f.mana(green)),true);assert.equal(await f.g.activateAbility(f.a,f.mana(black)),true);assert.equal(f.a.pool.G,1);assert.equal(f.a.pool.B,1);assert.equal(f.a.life,39);
  assert.equal(await f.g.activateAbility(f.a,f.entry(skeleton)),true);assert.equal(f.payments.length,0);assert.equal(skeleton.zone,'battlefield');assert.ok(Object.values(f.a.pool).every(n=>n===0));f.stable();
});
test('a zero-mana sacrifice ability opens no source chooser',async()=>{
  const f=table(),bear=f.put('Grizzly Bears'),husk=f.put('Nantuko Husk');f.ready();
  assert.equal(await f.g.activateAbility(f.a,f.entry(husk)),true);assert.equal(bear.zone,'graveyard');assert.equal(husk.power,4);assert.equal(f.payments.length,0);f.stable();
});
test('native AI pays automatically even if a manual flag is present',async()=>{
  const f=table(),{g,b}=f;f.put('Forest','battlefield',b);f.put('Swamp','battlefield',b);const skeleton=f.put('Reassembling Skeleton','graveyard',b);b.isAI=true;b.manualMana=true;
  const ai=new M.AIController(b,{difficulty:'normal',style:'aggressive'}),decide=ai.decide.bind(ai);ai.decide=(game,q)=>{f.questions.push({player:b.idx,type:q.type,prompt:q.prompt});return decide(game,q);};b.controller=ai;f.ready();
  assert.equal(await g.activateAbility(b,f.entry(skeleton,b)),true);assert.equal(skeleton.zone,'battlefield');assert.ok(!f.questions.some(q=>q.type==='chooseManaSources'));f.stable();
});
test('invalid foreign selected sources reject an ability without paying or moving it',async()=>{
  const f=table(),forest=f.put('Forest'),swamp=f.put('Swamp'),foreign=f.put('Forest','battlefield',f.b),skeleton=f.put('Reassembling Skeleton','graveyard');f.select=()=>[swamp,foreign];f.ready();
  assert.equal(await f.g.activateAbility(f.a,f.entry(skeleton)),false);assert.equal(f.payments.length,1);assert.equal(skeleton.zone,'graveyard');assert.equal(forest.tapped,false);assert.equal(swamp.tapped,false);assert.equal(foreign.tapped,false);assert.ok(Object.values(f.a.pool).every(n=>n===0));f.stable();
});
test('a source tapped by an actual mana activation after the question is rejected as stale',async()=>{
  const f=table(),elves=f.put('Llanowar Elves'),swamp=f.put('Swamp'),skeleton=f.put('Reassembling Skeleton','graveyard');let activated=false;
  f.select=async()=>{assert.equal(activated,false,'the independent zero-cost mana ability does not recurse into source selection');activated=true;assert.equal(await f.g.activateAbility(f.a,f.mana(elves)),true);return [elves,swamp];};f.ready();
  assert.equal(await f.g.activateAbility(f.a,f.entry(skeleton)),false);assert.equal(f.payments.length,1);assert.equal(skeleton.zone,'graveyard');assert.equal(elves.tapped,true);assert.equal(swamp.tapped,false);assert.equal(f.a.pool.G,1,'the independently floated mana remains; the rejected ability pays nothing');assert.equal(f.a.pool.B,0);f.stable();
});
