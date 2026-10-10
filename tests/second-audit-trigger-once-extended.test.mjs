import test from 'node:test';
import assert from 'node:assert/strict';
import {M,nativeFixture} from './helpers/second-trigger-fixtures.mjs';

const ownedChoices=(f,source)=>f.questions.filter(q=>q.type==='chooseOption'&&
 (q.aiHint?.src===source||q.aiHint?.card===source||q.prompt?.includes(source.name))&&
 q.options.some(o=>o.key==='yes')&&q.options.some(o=>o.key==='no'));
function choices(f,source){
 let decline=true;
 f.option=q=>{
  if((q.aiHint?.src===source||q.aiHint?.card===source||q.prompt?.includes(source.name))&&
   q.options.some(o=>o.key==='yes')&&q.options.some(o=>o.key==='no'))return decline?'no':'yes';
  return q.options.some(o=>o.key==='tap')?'tap':undefined;
 };
 return value=>{decline=value;};
}
async function onceSequence(f,source,fire,result){
 const decline=choices(f,source),before=result();
 await fire();await f.settle();assert.equal(ownedChoices(f,source).length,1,'the real first event offers the optional action');
 assert.equal(result(),before,'declining does not take the printed action');
 decline(false);await fire();await f.settle();
 assert.equal(ownedChoices(f,source).length,2,'declining leaves a later native event usable this turn');
 assert.equal(result(),before+1,'the accepted native action occurs once');
 await fire();await f.game.flushTriggers();
 while(f.game.stack.length&&!f.game.stack.some(so=>so.kind==='trigger'&&so.srcCard===source))await f.game.resolveTop();
 assert.equal(f.game.stack.filter(so=>so.kind==='trigger'&&so.srcCard===source).length,0,'CR 603.2h stops later triggers once the action was taken');
 await f.settle();assert.equal(result(),before+1);assert.equal(ownedChoices(f,source).length,2);
}

for(const role of ['human','ai']){
 test(`${role}: paid Iron Man can decline, copy a later artifact, and stop after use`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Iron Man, Bleeding Edge',['Island','Island','Wastes','Wastes','Wastes']);
  await onceSequence(f,source,()=>f.cast('Ornithopter',[],{settle:false}),
   ()=>f.game.creatures(f.me).filter(c=>c.isToken&&c.name==='Ornithopter').length);
 });
 test(`${role}: a paid Whispering Wizard's explicit trigger limit stops after its first spell`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Whispering Wizard',['Island','Wastes','Wastes','Wastes']);
  await f.cast('Opt',['Island']);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,1);
  await f.cast('Opt',['Island']);
  assert.equal(f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Spirit')).length,1,'a trigger limit differs from a printed action limit');
 });
 test(`${role}: paid Irreverent Gremlin can decline and loot only once from actual creature casts`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Irreverent Gremlin',['Mountain','Wastes']);
  f.put('Island','hand');f.put('Island','hand');
  await onceSequence(f,source,()=>f.cast('Grizzly Bears',['Forest','Wastes'],{settle:false}),
   ()=>f.me.turnState.discardedN||0);
 });
 test(`${role}: paid Academy Wall's optional trigger limit is consumed even when drawing is declined`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Academy Wall',['Island','Wastes','Wastes']);
  choices(f,source);const before=f.me.hand.length;
  await f.cast('Opt',['Island']);assert.equal(ownedChoices(f,source).length,1);
  assert.equal(f.me.hand.length,before+1,'only Opt draws when the Wall is declined');
  await f.cast('Opt',['Island']);assert.equal(ownedChoices(f,source).length,1);
  assert.equal(f.me.hand.length,before+2,'its second spell cannot use the explicit trigger limit');
 });
 test(`${role}: paid Amzu can decline, use a later actual Raise Dead, and stop after use`,async()=>{
  const f=nativeFixture(role),source=await f.cast("Amzu, Swarm's Hunger",['Swamp','Forest','Wastes','Wastes','Wastes']);
  const worms=Array.from({length:3},()=>f.put('Rootbreaker Wurm','graveyard'));
  f.targets=q=>{const c=worms.find(c=>q.candidates.includes(c));return c?[c]:undefined;};
  await onceSequence(f,source,()=>f.cast('Raise Dead',['Swamp'],{settle:false}),
   ()=>f.game.creatures(f.me).filter(c=>c.isToken&&c.hasSub('Insect')).length);
  assert.equal(f.game.creatures(f.me).find(c=>c.isToken&&c.hasSub('Insect')).counters['+1/+1'],7);
 });
 test(`${role}: paid Spider-Verse can decline and copy only one real Flashback spell`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Spider-Verse',['Mountain','Mountain','Wastes','Wastes','Wastes']);
  const spells=Array.from({length:3},()=>f.put('Think Twice','graveyard'));let index=0;
  const fire=async()=>{
   const card=spells[index++];for(const name of ['Island','Wastes','Wastes'])f.put(name);
   const offer=f.game.castableList(f.me).find(e=>e.card===card&&e.from==='graveyard'&&e.alt?.flashback);
   assert.ok(offer,'the printed Flashback cast is actually offered');
   assert.equal(await f.game.castSpell(f.me,card,{from:offer.from,alt:offer.alt}),true);
   assert.equal(card.castMeta.manaSpent,3);
  };
  const decline=choices(f,source),before=f.me.hand.length;
  await fire();await f.settle();assert.equal(ownedChoices(f,source).length,1);assert.equal(f.me.hand.length,before+1);
  decline(false);await fire();await f.settle();assert.equal(ownedChoices(f,source).length,2);assert.equal(f.me.hand.length,before+3);
  await fire();await f.game.flushTriggers();
  assert.equal(f.game.stack.filter(so=>so.kind==='trigger'&&so.srcCard===source).length,0);
  await f.settle();assert.equal(f.me.hand.length,before+4);assert.equal(ownedChoices(f,source).length,2);
 });
 test(`${role}: paid Legolas declines the first native scry and untaps only once`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Legolas, Counter of Kills',['Forest','Island','Wastes','Wastes']);
  f.targets=q=>q.candidates.includes(source)?[source]:undefined;const decline=choices(f,source);
  const fire=async()=>{await f.cast('Twiddle',['Island']);assert.equal(source.tapped,true);await f.cast('Opt',['Island'],{settle:false});};
  await fire();await f.settle();assert.equal(source.tapped,true);assert.equal(ownedChoices(f,source).length,1);
  decline(false);await fire();await f.settle();assert.equal(source.tapped,false);assert.equal(ownedChoices(f,source).length,2);
  await fire();await f.settle();assert.equal(source.tapped,true);assert.equal(ownedChoices(f,source).length,2);
 });
 test(`${role}: paid Corruption of Towashi shares one use between real Incubator transformations`,async()=>{
  const f=nativeFixture(role),source=await f.cast('Corruption of Towashi',['Island','Wastes','Wastes','Wastes','Wastes']);
  await f.cast('Glistening Dawn',['Forest','Forest','Wastes','Wastes']);
  const tokens=f.game.bf().filter(c=>c.ctrl===f.me&&c.hasSub('Incubator'));assert.equal(tokens.length,3);let index=0;
  const fire=()=>f.activate(tokens[index++],['Wastes','Wastes'],()=>true,false);
  const before=f.me.hand.length;
  await onceSequence(f,source,fire,()=>f.me.hand.length-before);
  assert.equal(tokens.every(c=>c.is('Creature')&&c.oracleFace==='back'),true);
 });
}
