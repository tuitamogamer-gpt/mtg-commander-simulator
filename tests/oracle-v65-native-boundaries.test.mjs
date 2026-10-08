import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';

import {context,settle,put} from './helpers/oracle-v8-fixtures.mjs';
import {choose,fund,total} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
// Register the exact canonical Karlov source, so a legacy manual script cannot
// satisfy the ban checks instead of the newly compiled descriptor.
const M=loadEngine(),rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v65-common.json',import.meta.url))).filter(row=>row.name==='Karlov Watchdog');
assert.equal(rows.length,1);registerCanonicalFixturePlan(M,createFixturePlan(rows,69,19865));
const down=async(f,name,p=f.b,kind='manifest')=>{const card=put(M,f.game,p,name,'hand');await f.game.putFaceDown(p,card,kind);return card;};
for(const role of ['human','ai']){
 test(`${role}: effect flips an opponent megamorph without cost/counter and keeps actual event actor`,async()=>{
  const f=context(M,role),c=await down(f,'Deathmist Raptor'),events=[],emit=f.game.emit;
  f.game.emit=async function(n,d){if(n==='turnedFaceUp')events.push(d);return emit.call(this,n,d);};
  const before=total(f.a),v=c.zoneVersion;assert.equal(await f.game.turnFaceUpFromEffectV65(f.a,c,v),true);
  assert.equal(c.faceDown,false);assert.equal(c.ctrl,f.b);assert.equal(c.zoneVersion,v);assert.equal(c.counters['+1/+1']||0,0);assert.equal(total(f.a),before);
  assert.equal(events.length,1);assert.equal(events[0].player,f.a);assert.equal(events[0].x,0);await settle(f.game);assertGameStateInvariants(f.game);
 });
 test(`${role}: generic effect permits Artifact but rejects Instant with private face intact`,async()=>{
  const f=context(M,role),artifact=await down(f,'Sol Ring'),instant=await down(f,'Lightning Bolt');
  assert.equal(await f.game.turnFaceUpFromEffectV65(f.a,artifact,artifact.zoneVersion),true);assert.equal(artifact.is('Artifact'),true);
  const original=instant.meta.faceDownDef,def=instant.def,events=f.game.log.length;
  assert.equal(await f.game.turnFaceUpFromEffectV65(f.a,instant,instant.zoneVersion),false);
  assert.equal(instant.faceDown,true);assert.equal(instant.def,def);assert.equal(instant.meta.faceDownDef,original);assert.equal(f.game.log.length,events);assertGameStateInvariants(f.game);
 });
 test(`${role}: phased and stale targets reject before restoring private name/definition`,async()=>{
  const f=context(M,role),c=await down(f,'Grizzly Bears'),v=c.zoneVersion,def=c.def,original=c.meta.faceDownDef;
  c.phasedOut=true;f.game.recalc();assert.equal(await f.game.turnFaceUpFromEffectV65(f.a,c,v),false);assert.equal(c.def,def);assert.equal(c.meta.faceDownDef,original);c.phasedOut=false;
  await f.game.move(c,'hand');await f.game.putFaceDown(f.b,c);const newDef=c.def;
  assert.equal(await f.game.turnFaceUpFromEffectV65(f.a,c,v),false);assert.equal(c.def,newDef);assert.equal(c.faceDown,true);
  assert.equal(await f.game.turnFaceUpFromEffectV65({},c,c.zoneVersion),false);
  assert.equal(await f.game.turnFaceUpFromEffectV65(f.a,c,c.zoneVersion),true);assertGameStateInvariants(f.game);
 });
 test(`${role}: actual Karlov permission gates direct effect, CWW and Mask and ends with ability loss`,async()=>{
  const f=context(M,role),watch=put(M,f.game,f.a,'Karlov Watchdog'),cards=[await down(f,'Grizzly Bears'),await down(f,'Deathmist Raptor'),await down(f,'Rootbreaker Wurm',f.b,'c13Mask')];
  for(const c of cards){const original=c.meta.faceDownDef,def=c.def;assert.equal(f.game.canTurnFaceUpFromEffectV65(f.a,c,c.zoneVersion),false);assert.equal(await f.game.turnFaceUpFromEffectV65(f.a,c,c.zoneVersion),false);assert.equal(c.def,def);assert.equal(c.meta.faceDownDef,original);assert.equal(c.faceDown,true);}
  assert.equal(await M.CWW.forceFaceUp({g:f.game,you:f.a},cards[1]),false);assert.equal(M.C13.maskReveal(f.game,cards[2]),false);assert.equal(cards[2].name,'Face-down creature');
  M.OracleV8AbilityLoss.add(f.game,[watch],{temporary:false});f.game.recalc();assert.equal(await f.game.turnFaceUpFromEffectV65(f.a,cards[0],cards[0].zoneVersion),true);assert.equal(await M.CWW.forceFaceUp({g:f.game,you:f.a},cards[1]),true);assert.equal(M.C13.maskReveal(f.game,cards[2]),true);await settle(f.game);assert.equal(cards[2].faceDown,false);assertGameStateInvariants(f.game);
 });
 test(`${role}: effect restores all paid merged creature abilities and rejects an Instant component`,async()=>{
  const f=context(M,role),host=await down(f,'Grizzly Bears',f.a),instant=await down(f,'Lightning Bolt',f.a);
  for(const target of [host,instant]){
   const spell=put(M,f.game,f.a,'Dreamtail Heron','hand');fund(f.a);choose(f.a,q=>q.type==='chooseTargets'&&q.candidates.includes(target)?{...q,candidates:[target],min:1,max:1}:q.type==='chooseOption'&&q.aiHint?.kind==='mutateOrder'?{...q,options:q.options.filter(row=>row.key==='under')}:null);
   const before=total(f.a);assert.equal(await f.game.castSpell(f.a,spell,{alt:spell.def.altCosts.find(alt=>alt.mutate)}),true);assert.ok(total(f.a)<before);await settle(f.game);assert.equal(target.faceDown,true);assert.equal(target.mutateState.components.length,2);
  }
  assert.equal(await f.game.turnFaceUpFromEffectV65(f.b,host,host.zoneVersion),true);assert.equal(host.name,'Grizzly Bears');assert.equal(host.kw('flying'),true);assert.ok(host.mutateState.components.every(row=>!row.faceDown));
  const def=instant.def;assert.equal(await f.game.turnFaceUpFromEffectV65(f.b,instant,instant.zoneVersion),false);assert.equal(instant.def,def);assert.ok(instant.mutateState.components.some(row=>row.faceDown));assertGameStateInvariants(f.game);
 });
 test(`${role}: real turned-face-up event and SBA happen for a zero-toughness original`,async()=>{
  const f=context(M,role),card=await down(f,'Hangarback Walker'),order=[],emit=f.game.emit;
  f.game.emit=async function(n,d){if(d.card===card&&['turnedFaceUp','dies'].includes(n))order.push(n);return emit.call(this,n,d);};
  assert.equal(await f.game.turnFaceUpFromEffectV65(f.a,card,card.zoneVersion),true);assert.equal(card.zone,'graveyard');assert.deepEqual(order,['turnedFaceUp','dies']);await settle(f.game);assertGameStateInvariants(f.game);
 });
}
function observePublicReveal(f){
 const seen=[];f.game.paced=true;f.game.pace=async()=>{};f.game.revealToHuman=M.Game.prototype.revealToHuman.bind(f.game);
 for(const p of f.game.players){if(p.isAI)continue;const prior=p.controller.decide.bind(p.controller);p.controller.decide=async(g,q)=>{if(q.type==='cardReveal')seen.push({player:p,cards:q.cards});return prior(g,q);};}
 return seen;
}
for(const role of ['human','ai']){
 test(`${role}: unturnable Instant is publicly revealed but legal ban/phasing/stale rejects remain private`,async()=>{
  const f=context(M,role,2),card=await down(f,'Lightning Bolt'),watch=put(M,f.game,f.a,'Karlov Watchdog'),seen=observePublicReveal(f),ctx={g:f.game,you:f.a},version=card.zoneVersion,original=card.meta.faceDownDef,def=card.def;
  assert.equal(await M.CWW.forceFaceUp(ctx,card,version),false);assert.equal(seen.length,0);assert.equal(card.def,def);
  M.OracleV8AbilityLoss.add(f.game,[watch],{temporary:false});card.phasedOut=true;f.game.recalc();assert.equal(await M.CWW.forceFaceUp(ctx,card,version),false);assert.equal(seen.length,0);card.phasedOut=false;
  assert.equal(await M.CWW.forceFaceUp(ctx,card,version),false);assert.ok(seen.length>0);assert.ok(seen.every(row=>row.player!==f.b&&row.cards.length===1&&row.cards[0].name==='Lightning Bolt'&&row.cards[0].is('Instant')));assert.ok(seen.some(row=>row.player===f.others[1]));
  assert.equal(card.faceDown,true);assert.equal(card.def,def);assert.equal(card.meta.faceDownDef,original);assert.equal(card.zone,'battlefield');assert.equal(card.zoneVersion,version);assert.equal(card.name,'Face-down creature');
  await f.game.move(card,'hand');await f.game.putFaceDown(f.b,card);const n=seen.length;assert.equal(await M.CWW.forceFaceUp(ctx,card,version),false);assert.equal(seen.length,n);assert.equal(card.faceDown,true);assertGameStateInvariants(f.game);
 });
 test(`${role}: effect exposes every actual paid merged physical card while forbidden Instant remains face down`,async()=>{
  const f=context(M,role,2),host=await down(f,'Lightning Bolt',f.a),incoming=put(M,f.game,f.a,'Dreamtail Heron','hand');fund(f.a);
  choose(f.a,q=>q.type==='chooseTargets'&&q.candidates.includes(host)?{...q,candidates:[host],min:1,max:1}:q.type==='chooseOption'&&q.aiHint?.kind==='mutateOrder'?{...q,options:q.options.filter(row=>row.key==='under')}:null);
  const before=total(f.a);assert.equal(await f.game.castSpell(f.a,incoming,{alt:incoming.def.altCosts.find(alt=>alt.mutate)}),true);assert.ok(total(f.a)<before);await settle(f.game);
  const seen=observePublicReveal(f),def=host.def,original=host.meta.faceDownDef,version=host.zoneVersion,records=host.mutateState.components.map(row=>({row,faceDown:row.faceDown,def:row.def}));
  assert.equal(await M.CWW.forceFaceUp({g:f.game,you:f.b},host,version),false);assert.ok(seen.length>0);assert.ok(seen.every(row=>row.cards.length===2&&row.cards.some(c=>c.name==='Lightning Bolt'&&c.is('Instant'))&&row.cards.some(c=>c.name==='Dreamtail Heron'&&c.is('Creature'))));
  assert.equal(host.faceDown,true);assert.equal(host.def,def);assert.equal(host.meta.faceDownDef,original);assert.equal(host.zoneVersion,version);assert.equal(host.zone,'battlefield');assert.equal(incoming.zone,'merged');for(const record of records){assert.equal(record.row.faceDown,record.faceDown);assert.equal(record.row.def,record.def);}assertGameStateInvariants(f.game);
 });
}
for(const role of ['human','ai'])test(`${role}: actual generic face-up effect uses guarded public reveal and original target incarnation`,async()=>{
 const f=context(M,role,2),card=await down(f,'Lightning Bolt'),watch=put(M,f.game,f.a,'Karlov Watchdog'),src=put(M,f.game,f.a,'Prodigal Pyromancer'),seen=observePublicReveal(f),ctx={g:f.game,you:f.a,src,sourceZoneVersion:src.zoneVersion,targets:[card],targetIdentities:f.game.captureTargetIdentities([card])},effect={action:'turn-face-v17',target:0,face:'up'};
 await M.OracleV20.helpers.runGenericEffect(ctx,effect);assert.equal(seen.length,0);assert.equal(card.faceDown,true);
 M.OracleV8AbilityLoss.add(f.game,[watch],{temporary:false});f.game.recalc();await M.OracleV20.helpers.runGenericEffect(ctx,effect);assert.ok(seen.length>0);assert.ok(seen.every(row=>row.cards.length===1&&row.cards[0].name==='Lightning Bolt'));assert.equal(card.faceDown,true);
 await f.game.move(card,'hand');await f.game.putFaceDown(f.b,card);const n=seen.length;await M.OracleV20.helpers.runGenericEffect(ctx,effect);assert.equal(seen.length,n);assert.equal(card.faceDown,true);assertGameStateInvariants(f.game);
});

for(const role of ['human','ai']){
 test(`${role}: real spell rejects a target blinked during its actual choice without spending mana`,async()=>{
  const f=context(M,role),target=put(M,f.game,f.b,'Grizzly Bears'),spell=put(M,f.game,f.a,'Lightning Bolt','hand'),prior=f.a.controller.decide.bind(f.a.controller),originalVersion=target.zoneVersion;
  fund(f.a);let prompted=0;
  f.a.controller.decide=async(g,q)=>{
   if(q.type==='chooseTargets'&&q.candidates.includes(target)){prompted++;await g.move(target,'hand');await g.putPermanentOntoBattlefield(target,f.b);return prior(g,{...q,candidates:[target],min:1,max:1});}
   return prior(g,q);
  };
  const before=total(f.a);assert.equal(await f.game.castSpell(f.a,spell,{from:'hand'}),false);assert.equal(prompted,1);assert.ok(target.zoneVersion>originalVersion);assert.equal(spell.zone,'hand');assert.equal(total(f.a),before);assert.equal(f.game.stack.length,0);assertGameStateInvariants(f.game);
 });
 test(`${role}: actual target event retains original per-slot identity when the target blinks`,async()=>{
  const f=context(M,role),target=put(M,f.game,f.b,'Grizzly Bears'),src=put(M,f.game,f.a,'Prodigal Pyromancer'),version=target.zoneVersion,emit=f.game.emit;
  choose(f.a,q=>q.type==='chooseTargets'?{...q,candidates:[target],min:1,max:1}:null);
  f.game.emit=async function(n,d){if(n==='targeted'&&d.card===target){await this.move(target,'hand');await this.putPermanentOntoBattlefield(target,f.b);}return emit.call(this,n,d);};
  const ctx={g:f.game,src,you:f.a,isActivatedAbility:true},spec={what:'creature'};
  assert.equal(await f.game.pickTargets(ctx,[spec],src,f.a),true);assert.equal(ctx.targetIdentities[0].zoneVersion,version);assert.ok(target.zoneVersion>version);assert.equal(f.game.targetStillOk(target,ctx.boundTargetSpecs[0],src,f.a,[],ctx.targetIdentities[0]),false);assertGameStateInvariants(f.game);
 });
 test(`${role}: dependent native target choices receive original prior identities and preserve array/empty slots`,async()=>{
  const f=context(M,role),first=put(M,f.game,f.a,'Grizzly Bears'),second=put(M,f.game,f.a,'Llanowar Elves'),src=put(M,f.game,f.a,'Prodigal Pyromancer');let step=0,observed=false;
  choose(f.a,q=>{if(q.type!=='chooseTargets')return null;return {...q,candidates:[step++===0?first:second],min:1,max:1};});
  const specs=[{what:'creature',count:1},{what:'creature',count:2,min:1,dependentFilter:(g,c,previous,p,s,identities)=>{if(previous[0]===first&&identities[0]?.zoneVersion===first.zoneVersion)observed=true;return c!==first;}},{what:'creature',count:0,min:0}];
  const ctx={g:f.game,src,you:f.a,isActivatedAbility:true};assert.equal(await f.game.pickTargets(ctx,specs,src,f.a),true);assert.equal(observed,true);assert.equal(ctx.targetIdentities[0].iid,first.iid);assert.equal(ctx.targetIdentities[1][0].iid,second.iid);assert.equal(ctx.targetIdentities[2].length,0);assertGameStateInvariants(f.game);
 });
}
