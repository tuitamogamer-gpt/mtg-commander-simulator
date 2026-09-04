import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const rows=[
 ['Stack Adventure Copy','Whenever you cast an Adventure instant or sorcery spell, copy it. You may choose new targets for the copy.','Artifact','{1}'],
 ['Stack Self Copy','Whenever you cast an instant or sorcery spell that targets only this creature, copy that spell. You may choose new targets for the copy.','Creature','{G}'],
 ['Stack Attacking Copy','Whenever you cast a spell while Stack Attacking Copy is attacking, copy that spell. You may choose new targets for the copy.','Creature','{G}'],
 ['Stack Flash Donor','Flash','Creature','{G}'],

 ['Stack Grave Donor','{1}, Exile this card from your graveyard: You gain 2 life.','Creature','{G}'],
 ['Stack Crew Donor','Crew 1','Artifact — Vehicle','{1}'],
 ['Stack Ninja Donor','Ninjutsu {1}','Creature — Ninja','{G}'],
 ['Stack Cycle Donor','Cycling {1}','Creature','{G}'],
 ['Stack Activated Copy',"Whenever you activate an ability, if it isn't a mana ability, copy that ability. You may choose new targets for the copy.",'Enchantment','{U}'],
 ['Stack Activated Paid',"Whenever you activate an ability, if it isn't a mana ability, you may pay {2}. If you do, copy that ability. You may choose new targets for the copy.",'Enchantment','{U}'],
 ['Stack Attached Copy',"Whenever an ability of equipped creature is activated, if it isn't a mana ability, copy that ability. You may choose new targets for the copy.\nEquip {1}",'Artifact — Equipment','{1}'],
 ['Stack Sacrificed Copy',"Whenever you activate an ability of an artifact or creature that isn't a mana ability, if one or more permanents were sacrificed to activate it, you may copy that ability. You may choose new targets for the copy.",'Creature','{G}'],
 ['Stack Sacrificed Donor','{1}, Sacrifice this artifact: You gain 2 life.','Artifact','{1}'],
 ['Stack Loyalty Copy','Whenever you activate a loyalty ability of a Chandra planeswalker, copy that ability. You may choose new targets for the copy.','Artifact','{1}'],

 ['Stack Next Copy','When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.','Instant','{U}'],
 ['Stack Next Limited','When you next cast an instant or sorcery spell with mana value 4 or less this turn, copy that spell. You may choose new targets for the copy.','Instant','{U}'],
 ['Stack Next X','When you next cast an instant or sorcery spell this turn, copy that spell X times. You may choose new targets for the copies.','Instant','{X}{U}'],
 ['Stack Counter Ability','Counter target activated ability.','Instant','{U}'],
 ['Stack Counter Mixed','Counter target spell, activated ability, or triggered ability.','Instant','{U}'],
 ['Stack Copy Multicolor','Whenever you cast a multicolored instant or sorcery spell, copy that spell. You may choose new targets for the copy.','Enchantment','{1}{U}'],
 ['Stack Copy Sorcery','You gain 2 life.','Sorcery','{G}'],
 ['Stack Copy Spell','Copy target instant or sorcery spell. You may choose new targets for the copy.','Instant','{U}'],
 ['Stack Copy Own','Copy target instant or sorcery spell you control. You may choose new targets for the copy.','Instant','{U}'],
 ['Stack Copy Ability','{1}, {T}: Copy target activated or triggered ability you control. You may choose new targets for the copy.','Artifact','{1}'],
 ['Stack Copy Trigger','{1}, {T}: Copy target triggered ability you control. You may choose new targets for the copy.','Artifact','{1}'],
 ['Stack Copy Creature Source','{1}, {T}: Copy target activated or triggered ability you control from a creature source. You may choose new targets for the copy.','Artifact','{1}'],
 ['Stack Copy Colorless','{1}, {T}: Copy target activated or triggered ability you control from a colorless source. You may choose new targets for the copy.','Artifact','{1}'],
 ['Stack Copy Cast','Whenever you cast an instant or sorcery spell, you may copy that spell. You may choose new targets for the copy.','Enchantment','{1}{U}'],
 ['Stack Copy Damage','Stack Copy Damage deals 3 damage to target opponent.','Instant','{G}'],
 ['Stack Copy X','Stack Copy X deals X damage to target opponent.','Instant','{X}{G}'],
 ['Stack Copy Pump','Target creature gets +2/+2 until end of turn.','Instant','{G}'],
 ['Stack Copy Modal','Choose one —\n• You gain 3 life.\n• Draw two cards.','Instant','{G}'],
 ['Stack Copy Additional','As an additional cost to cast this spell, sacrifice a creature.\nStack Copy Additional deals damage equal to the sacrificed creature\'s power to target opponent.','Instant','{G}'],
 ['Stack Copy Donor','{1}, {T}: Stack Copy Donor deals 2 damage to target opponent.','Creature','{G}'],
 ['Stack Copy Untargeted','{1}, {T}: You gain 2 life.','Creature','{G}'],
 ['Stack Copy Entry','When this creature enters, you gain 2 life.','Creature','{G}'],
 ['Stack Copy Variable','{1}, {T}: Put a +1/+1 counter on each of up to two target creatures you control.','Creature','{G}'],
];
const MTG=fixtureEngine(rows);
const faceInput={name:'Stack Copy Adventurer // Stack Copy Adventure',layout:'adventure',type_line:'Creature — Human // Sorcery — Adventure',card_faces:[
 {name:'Stack Copy Adventurer',type_line:'Creature — Human',mana_cost:'{G}',power:'2',toughness:'2',oracle_text:''},
 {name:'Stack Copy Adventure',type_line:'Sorcery — Adventure',mana_cost:'{R}',oracle_text:'You gain 3 life.'}
]};
const faceSemantic=semanticClass(faceInput);assert.ok(faceSemantic.semanticClass);
MTG.registerOracleBatch({id:'oracle-v8-stack-copy-adventure',sequence:99995,cards:[{position:1,oracleId:faceInput.name,scryfallId:faceInput.name,...faceSemantic,
 raw:{name:faceInput.name,cost:'{G}',types:['Creature'],subtypes:['Human'],super:[],power:'2',toughness:'2',oracle:''},catalog:{typeLine:faceInput.type_line,commanderLegality:'legal'}}]});MTG.initData(MTG.RAW_DATA);
const loyaltyInput={name:'Stack Loyalty Donor',layout:'normal',type_line:'Planeswalker — Chandra',mana_cost:'{G}',loyalty:'4',oracle_text:'+1: You gain 2 life.'};
MTG.registerOracleBatch({id:'oracle-stack-copy-loyalty',sequence:99994,cards:[{position:1,oracleId:loyaltyInput.name,scryfallId:loyaltyInput.name,...semanticClass(loyaltyInput),raw:{name:loyaltyInput.name,cost:'{G}',types:['Planeswalker'],subtypes:['Chandra'],super:[],loyalty:'4',oracle:loyaltyInput.oracle_text},catalog:{typeLine:loyaltyInput.type_line,commanderLegality:'legal'}}]});MTG.initData(MTG.RAW_DATA);
function world(role){
 const ctx=context(MTG,role),events=[];ctx.events=events;
 const emit=ctx.game.emit;ctx.game.emit=async function(event,data,...rest){events.push({event,data});return emit.call(this,event,data,...rest);};
 return ctx;
}
async function cast(ctx,name,options={}){
 const card=put(MTG,ctx.game,ctx.a,name,'hand');ctx.a.pool={W:4,U:4,B:4,R:4,G:4,C:12};
 assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',...options}),true);
 return ctx.game.stack.find(object=>object.card===card&&!object.isCopy);
}
async function copySpell(ctx,original){const spell=await cast(ctx,'Stack Copy Spell');assert.equal(spell.targets.flat()[0],original);await ctx.game.resolveTop();const copy=ctx.game.stack.find(object=>object.isCopy&&object.copyOf===original);assert.ok(copy);return copy;}
async function activate(ctx,card){ctx.a.pool.C+=1;const entry=ctx.game.activatableList(ctx.a).find(row=>row.card===card&&!row.manaAbility);assert.ok(entry);assert.equal(await ctx.game.activateAbility(ctx.a,entry),true);return ctx.game.stack.at(-1);}
for(const role of ['human','ai']){
 test(`${role}: actual targeted copy is a new Stack object and is never cast`,async()=>{
  const ctx=world(role),before=ctx.b.life,original=await cast(ctx,'Stack Copy Damage'),copy=await copySpell(ctx,original);
  assert.notEqual(copy,original);assert.equal(copy.ctrl,ctx.a);assert.equal(copy.card,original.card);assert.equal(copy.targetSpecs,original.targetSpecs);
  assert.equal(ctx.events.filter(row=>row.event==='cast').length,2);assert.equal(ctx.events.filter(row=>row.event==='spellCopied').length,1);
  await settle(ctx.game);assert.equal(ctx.b.life,before-6);assert.equal(original.card.zone,'graveyard');
 });
 test(`${role}: a copied spell survives its original being countered`,async()=>{
  const ctx=world(role),before=ctx.b.life,original=await cast(ctx,'Stack Copy Damage');await copySpell(ctx,original);
  assert.equal(await ctx.game.counterStackObject(original),true);await settle(ctx.game);assert.equal(ctx.b.life,before-3);
 });
 test(`${role}: removing the original before the copy effect resolves makes its target illegal`,async()=>{
  const ctx=world(role),before=ctx.b.life,original=await cast(ctx,'Stack Copy Damage');await cast(ctx,'Stack Copy Spell');
  assert.equal(await ctx.game.counterStackObject(original),true);await settle(ctx.game);assert.equal(ctx.b.life,before);assert.equal(ctx.events.some(row=>row.event==='spellCopied'),false);
 });
 test(`${role}: X is inherited without repaying the original spell`,async()=>{
  const ctx=world(role),before=ctx.b.life,original=await cast(ctx,'Stack Copy X',{xVal:4}),copy=await copySpell(ctx,original);
  assert.equal(copy.x,4);const pool={...ctx.a.pool};await settle(ctx.game);assert.equal(ctx.b.life,before-8);assert.deepEqual({...ctx.a.pool},pool);
 });
 test(`${role}: the original mode is inherited and not chosen again`,async()=>{
  const ctx=world(role),before={life:ctx.a.life,hand:ctx.a.hand.length},original=await cast(ctx,'Stack Copy Modal'),copy=await copySpell(ctx,original);
  assert.deepEqual([...copy.mode],[...original.mode]);assert.equal(ctx.trace.filter(row=>row.q.type==='chooseMulti'||row.q.aiHint?.kind==='mode').length,1);
  await settle(ctx.game);assert.ok(ctx.a.life===before.life+6||ctx.a.hand.length===before.hand+4);
 });
 test(`${role}: additional sacrifice costs and their captured power are inherited once`,async()=>{
  const ctx=world(role),donor=put(MTG,ctx.game,ctx.a,'Stack Copy Donor');donor.def={...donor.def,power:'5'};ctx.game.recalc();
  const before=ctx.b.life,original=await cast(ctx,'Stack Copy Additional');assert.equal(donor.zone,'graveyard');await copySpell(ctx,original);await settle(ctx.game);
  assert.equal(ctx.b.life,before-10);assert.equal(ctx.events.filter(row=>row.event==='sacrificed'&&row.data.card===donor).length,1);
 });
 test(`${role}: a cast-trigger copies only its event spell and creates no cast loop`,async()=>{
  const ctx=world(role);put(MTG,ctx.game,ctx.a,'Stack Copy Cast');const before=ctx.b.life;
  const original=await cast(ctx,'Stack Copy Damage');await ctx.game.flushTriggers();assert.equal(ctx.game.stack.at(-1).kind,'trigger');await ctx.game.resolveTop();
  assert.ok(ctx.game.stack.some(object=>object.isCopy&&object.copyOf===original));await settle(ctx.game);
  assert.equal(ctx.b.life,before-6);assert.equal(ctx.events.filter(row=>row.event==='cast').length,1);
 });
 test(`${role}: activated ability copies resolve without another activation payment`,async()=>{
  const ctx=world(role),donor=put(MTG,ctx.game,ctx.a,'Stack Copy Donor'),copier=put(MTG,ctx.game,ctx.a,'Stack Copy Ability'),before=ctx.b.life;
  const original=await activate(ctx,donor);await activate(ctx,copier);await ctx.game.resolveTop();assert.equal(ctx.game.stack.length,2);
  assert.notEqual(ctx.game.stack.at(-1),original);assert.equal(ctx.game.stack.at(-1).run,original.run);assert.equal(ctx.events.filter(row=>row.event==='abilityActivated').length,2);
  await ctx.game.counterStackObject(original);await settle(ctx.game);assert.equal(ctx.b.life,before-2);assert.equal(donor.tapped,true);
 });
 test(`${role}: the triggered-only selector excludes activated abilities and retains copied ETB context`,async()=>{
  const ctx=world(role),donor=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted'),copier=put(MTG,ctx.game,ctx.a,'Stack Copy Trigger');
  await activate(ctx,donor);const source=put(MTG,ctx.game,ctx.a,'Stack Copy Entry');await ctx.game.handleETB(source,{});await ctx.game.flushTriggers();
  const original=ctx.game.stack.at(-1),before=ctx.a.life;await activate(ctx,copier);const query=ctx.trace.filter(row=>row.q.type==='chooseTargets').at(-1);
  assert.deepEqual([...query.q.candidates],[original]);await ctx.game.resolveTop();await ctx.game.counterStackObject(original);await settle(ctx.game);assert.equal(ctx.a.life,before+4);
 });
 test(`${role}: Adventure copies retain the spell face and never move the original card`,async()=>{
  const ctx=world(role),card=put(MTG,ctx.game,ctx.a,faceInput.name,'hand');ctx.a.pool.R=1;
  const alt=ctx.game.castableList(ctx.a).find(row=>row.card===card&&row.alt?.adventure)?.alt;assert.ok(alt);
  assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',alt}),true);const original=ctx.game.stack.at(-1),before=ctx.a.life,copy=await copySpell(ctx,original);
  assert.equal(copy.castOpts.adventure,true);await ctx.game.resolveTop();assert.equal(card.zone,'stack');assert.equal(ctx.a.life,before+3);
  await settle(ctx.game);assert.equal(ctx.a.life,before+6);assert.equal(card.zone,'exile');
 });
 test(`${role}: a copied spell can retarget after its original target leaves`,async()=>{
  const ctx=world(role),old=put(MTG,ctx.game,ctx.a,'Stack Copy Donor');
  const original=await cast(ctx,'Stack Copy Pump');assert.equal(original.targets.flat()[0],old);await ctx.game.move(old,'exile');
  const fresh=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted'),base=fresh.power,copy=await copySpell(ctx,original);
  assert.equal(copy.targets.flat()[0],fresh);await settle(ctx.game);assert.equal(fresh.power,base+2);
 });
 test(`${role}: an ability copy retaining a creature target emits its own targeted event once`,async()=>{
  const ctx=world(role),donor=put(MTG,ctx.game,ctx.a,'Stack Copy Variable'),copier=put(MTG,ctx.game,ctx.a,'Stack Copy Ability');
  if(role==='human'){
   const decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>{
    if(q.type==='chooseTargets'&&q.candidates.length===1&&q.candidates[0]===donor){const result=[donor];ctx.trace.push({q,result});return result;}
    return decide(g,q);
   };
  }
  const original=await activate(ctx,donor);await activate(ctx,copier);await ctx.game.resolveTop();
  const copy=ctx.game.stack.at(-1),events=ctx.events.filter(row=>row.event==='targeted'&&row.data.card===donor);
  assert.equal(events.length,2);assert.equal(events[1].data.so,copy);assert.equal(events[1].data.isActivatedAbility,true);
  assert.equal(events[1].data.isSpell,false);assert.notEqual(copy,original);await settle(ctx.game);assert.equal(donor.counters['+1/+1'],2);
 });
 test(`${role}: colorless source filtering uses the activated source incarnation after it leaves`,async()=>{
  const ctx=world(role),donor=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted'),colored=put(MTG,ctx.game,ctx.a,'Stack Copy Donor'),copier=put(MTG,ctx.game,ctx.a,'Stack Copy Colorless');
  donor.def={...donor.def,cost:'{1}',colorsOverride:[]};ctx.game.recalc();const original=await activate(ctx,donor);await activate(ctx,colored);
  await ctx.game.move(donor,'exile');donor.def={...donor.def,cost:'{U}',colorsOverride:['U']};
  await ctx.game.move(donor,'battlefield',{ctrl:ctx.a});assert.deepEqual([...donor.colors],['U']);
  const before=ctx.a.life;await activate(ctx,copier);const query=ctx.trace.filter(row=>row.q.type==='chooseTargets').at(-1);assert.deepEqual([...query.q.candidates],[original]);
  await ctx.game.resolveTop();await ctx.game.counterStackObject(original);await settle(ctx.game);assert.equal(ctx.a.life,before+2);
 });
 test(`${role}: creature source selector rejects abilities of noncreatures and other controllers`,async()=>{
  const ctx=world(role),donor=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted'),other=put(MTG,ctx.game,ctx.a,'Stack Copy Donor'),copier=put(MTG,ctx.game,ctx.a,'Stack Copy Creature Source');
  other.def={...other.def,types:['Artifact']};ctx.game.recalc();const original=await activate(ctx,donor);await activate(ctx,other);
  const before=ctx.a.life;await activate(ctx,copier);const query=ctx.trace.filter(row=>row.q.type==='chooseTargets').at(-1);assert.deepEqual([...query.q.candidates],[original]);
  await ctx.game.resolveTop();await ctx.game.counterStackObject(original);await settle(ctx.game);assert.equal(ctx.a.life,before+2);
 });
 test(`${role}: ability-only and mixed Stack counters remove an actual activated object`,async()=>{
  for(const name of ['Stack Counter Ability','Stack Counter Mixed']){
   const ctx=world(role),donor=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted'),before=ctx.a.life,original=await activate(ctx,donor);
   const counter=await cast(ctx,name);assert.equal(counter.targets.flat()[0],original);await settle(ctx.game);assert.equal(ctx.a.life,before);assert.equal(donor.zone,'battlefield');
  }
 });
 test(`${role}: multicolored instant-or-sorcery qualifier applies to both spell types`,async()=>{
  const ctx=world(role);put(MTG,ctx.game,ctx.a,'Stack Copy Multicolor');
  await cast(ctx,'Stack Copy Sorcery');await ctx.game.flushTriggers();assert.equal(ctx.game.stack.length,1);await settle(ctx.game);
  const card=put(MTG,ctx.game,ctx.a,'Stack Copy Sorcery','hand');card.def={...card.def,cost:'{G}{U}',colorsOverride:['G','U']};ctx.a.pool.G=1;ctx.a.pool.U=1;
  const before=ctx.a.life;assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);assert.equal(ctx.a.life,before+4);
 });
 test(`${role}: next-copy waits for the first matching own spell and triggers once`,async()=>{
  const ctx=world(role);await cast(ctx,'Stack Next Limited');await settle(ctx.game);assert.equal(ctx.game.delayed.length,1);
  await cast(ctx,'Stack Copy Entry');await settle(ctx.game);assert.equal(ctx.game.delayed.length,1);
  const large=await cast(ctx,'Stack Copy X',{xVal:5});await settle(ctx.game);assert.equal(ctx.game.delayed.length,1);assert.equal(large.x,5);
  const enemy=put(MTG,ctx.game,ctx.b,'Stack Copy Damage','hand');ctx.b.pool.G=1;assert.equal(await ctx.game.castSpell(ctx.b,enemy,{from:'hand'}),true);await settle(ctx.game);assert.equal(ctx.game.delayed.length,1);
  const before=ctx.b.life;await cast(ctx,'Stack Copy Damage');await settle(ctx.game);assert.equal(ctx.b.life,before-6);assert.equal(ctx.game.delayed.length,0);
  await cast(ctx,'Stack Copy Damage');await settle(ctx.game);assert.equal(ctx.b.life,before-9);
 });
 test(`${role}: delayed copies capture X at creation after their source leaves`,async()=>{
  const ctx=world(role),source=await cast(ctx,'Stack Next X',{xVal:3});await settle(ctx.game);assert.equal(source.card.zone,'graveyard');
  source.card.castMeta={x:9};await ctx.game.move(source.card,'exile');const before=ctx.b.life;
  await cast(ctx,'Stack Copy Damage');await settle(ctx.game);assert.equal(ctx.b.life,before-12);assert.equal(ctx.events.filter(row=>row.event==='spellCopied').length,3);
 });
 test(`${role}: countering the qualifying original consumes the delayed trigger without creating a copy`,async()=>{
  const ctx=world(role);await cast(ctx,'Stack Next Copy');await settle(ctx.game);const before=ctx.b.life,original=await cast(ctx,'Stack Copy Damage');
  await ctx.game.flushTriggers();assert.equal(ctx.game.delayed.length,0);await ctx.game.counterStackObject(original);await settle(ctx.game);assert.equal(ctx.b.life,before);
  assert.equal(ctx.events.some(row=>row.event==='spellCopied'),false);
 });
 test(`${role}: an unused next-copy permission expires during actual cleanup`,async()=>{
  const ctx=world(role);await cast(ctx,'Stack Next Copy');await settle(ctx.game);assert.equal(ctx.game.delayed.length,1);
  ctx.game.mainPhase=async()=>{};ctx.game.combatPhase=async()=>{};await ctx.game.runTurn();assert.equal(ctx.game.delayed.length,0);
  const before=ctx.b.life;await cast(ctx,'Stack Copy Damage');await settle(ctx.game);assert.equal(ctx.b.life,before-3);
 });
 test(`${role}: activation triggers copy the event ability once without new activations`,async()=>{
  for(const name of ['Stack Activated Copy','Stack Activated Paid']){
   const ctx=world(role);put(MTG,ctx.game,ctx.a,name);ctx.a.pool.C=10;const donor=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted'),before=ctx.a.life;
   await activate(ctx,donor);await settle(ctx.game);assert.equal(ctx.a.life,before+4);assert.equal(ctx.events.filter(row=>row.event==='abilityActivated').length,1);
   assert.equal(ctx.game.stack.length,0);
  }
 });
 test(`${role}: attached activation-copy follows the equipped source and ignores other creatures`,async()=>{
  const ctx=world(role),equipment=put(MTG,ctx.game,ctx.a,'Stack Attached Copy'),host=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted'),other=put(MTG,ctx.game,ctx.a,'Stack Copy Donor');
  assert.equal(await ctx.game.attach(equipment,host),true);const life=ctx.b.life;await activate(ctx,other);await settle(ctx.game);assert.equal(ctx.b.life,life-2);
  const before=ctx.a.life;await activate(ctx,host);await settle(ctx.game);assert.equal(ctx.a.life,before+4);
 });
 test(`${role}: sacrificed activation costs use source LKI and are not paid again for the copy`,async()=>{
  const ctx=world(role);put(MTG,ctx.game,ctx.a,'Stack Sacrificed Copy');const donor=put(MTG,ctx.game,ctx.a,'Stack Sacrificed Donor'),other=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted');
  const before=ctx.a.life;await activate(ctx,other);await settle(ctx.game);assert.equal(ctx.a.life,before+2);
  await activate(ctx,donor);assert.equal(donor.zone,'graveyard');await settle(ctx.game);assert.equal(ctx.a.life,before+6);
  assert.equal(ctx.events.filter(row=>row.event==='sacrificed'&&row.data.card===donor).length,1);
 });
 test(`${role}: loyalty copy retains the effect but does not change loyalty again`,async()=>{
  const ctx=world(role);put(MTG,ctx.game,ctx.a,'Stack Loyalty Copy');const donor=put(MTG,ctx.game,ctx.a,'Stack Loyalty Donor');donor.counters.loyalty=4;ctx.game.recalc();
  const before=ctx.a.life;await activate(ctx,donor);assert.equal(donor.counters.loyalty,5);await settle(ctx.game);assert.equal(ctx.a.life,before+4);assert.equal(donor.counters.loyalty,5);
 });
 test(`${role}: copy triggers include real graveyard, cycling, crew, and ninjutsu activations`,async()=>{
  for(const kind of ['graveyard','cycling','crew','ninjutsu']){
   const ctx=world(role);put(MTG,ctx.game,ctx.a,'Stack Activated Copy');const copies=[],copy=ctx.game.copyStackAbility;ctx.game.copyStackAbility=async function(...args){const result=await copy.apply(this,args);copies.push(result);return result;};
   let donor,originalAttacker;const before=ctx.a.life,hand=ctx.a.hand.length;ctx.a.pool.C=10;
   if(kind==='graveyard')donor=put(MTG,ctx.game,ctx.a,'Stack Grave Donor','graveyard');
   if(kind==='cycling')donor=put(MTG,ctx.game,ctx.a,'Stack Cycle Donor','hand');
   if(kind==='crew'){donor=put(MTG,ctx.game,ctx.a,'Stack Crew Donor');originalAttacker=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted');}
   if(kind==='ninjutsu'){
    donor=put(MTG,ctx.game,ctx.a,'Stack Ninja Donor','hand');originalAttacker=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted');
    originalAttacker.attacking=ctx.b;originalAttacker.wasBlocked=false;originalAttacker.blockedBy=[];ctx.game.combat={attackers:[originalAttacker],defenders:new Map()};ctx.game.phase='combat';ctx.game.step='blockers';
   }
   const action=ctx.game.activatableList(ctx.a).find(row=>row.card===donor&&(kind==='graveyard'?row.gyAbility:row[kind]));assert.ok(action,kind+' real action offered');assert.equal(await ctx.game.activateAbility(ctx.a,action),true);await settle(ctx.game);
   assert.equal(copies.length,1,kind+' activation produces exactly one copied Stack ability');assert.equal(ctx.events.filter(row=>row.event==='abilityActivated').length,1);
   if(kind==='graveyard'){assert.equal(ctx.a.life,before+4);assert.equal(donor.zone,'exile');}
   if(kind==='cycling'){assert.equal(ctx.a.hand.length,hand+2);assert.equal(donor.zone,'graveyard');}
   if(kind==='crew'){assert.equal(donor.is('Creature'),true);assert.equal(originalAttacker.tapped,true);}
   if(kind==='ninjutsu'){assert.equal(donor.zone,'battlefield');assert.equal(donor.attacking,ctx.b);assert.equal(originalAttacker.zone,'hand');}
  }
 });
 test(`${role}: Adventure-only cast copying distinguishes the face actually cast`,async()=>{
  const ctx=world(role);put(MTG,ctx.game,ctx.a,'Stack Adventure Copy');await cast(ctx,faceInput.name);await settle(ctx.game);
  assert.equal(ctx.events.some(row=>row.event==='spellCopied'),false);const before=ctx.a.life,card=put(MTG,ctx.game,ctx.a,faceInput.name,'hand');ctx.a.pool.R=1;
  const alt=ctx.game.castableList(ctx.a).find(row=>row.card===card&&row.alt?.adventure)?.alt;assert.ok(alt);assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',alt}),true);await settle(ctx.game);
  assert.equal(ctx.a.life,before+6);assert.equal(card.zone,'exile');
 });
 test(`${role}: only-self target trigger rejects unrelated targets and untargeted spells`,async()=>{
  const ctx=world(role),source=put(MTG,ctx.game,ctx.a,'Stack Self Copy'),base=source.power;
  await cast(ctx,'Stack Copy Sorcery');await settle(ctx.game);await cast(ctx,'Stack Copy Damage');await settle(ctx.game);assert.equal(ctx.events.some(row=>row.event==='spellCopied'),false);
  await cast(ctx,'Stack Copy Pump');await settle(ctx.game);assert.equal(source.power,base+4);
 });
 test(`${role}: while-attacking copy can copy a flashed permanent and keeps event-time qualification`,async()=>{
  const ctx=world(role),source=put(MTG,ctx.game,ctx.a,'Stack Attacking Copy');await cast(ctx,'Stack Copy Damage');await settle(ctx.game);assert.equal(ctx.events.some(row=>row.event==='spellCopied'),false);
  source.attacking=ctx.b;ctx.game.phase='combat';ctx.game.step='blockers';await cast(ctx,'Stack Flash Donor');source.attacking=null;await settle(ctx.game);
  const donors=ctx.game.bf().filter(card=>card.name==='Stack Flash Donor');assert.equal(donors.length,2);assert.equal(donors.filter(card=>card.isToken).length,1);
  assert.equal(ctx.events.filter(row=>row.event==='cast').length,2);
 });
 test(`${role}: retargeting an ability copy preserves the original number of targets`,async()=>{
  const ctx=world(role),donor=put(MTG,ctx.game,ctx.a,'Stack Copy Variable'),copier=put(MTG,ctx.game,ctx.a,'Stack Copy Ability');
  if(role==='human'){
   const decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>{
    if(q.type==='chooseTargets'&&q.candidates.length===1&&q.candidates[0]===donor){const result=[donor];ctx.trace.push({q,result});return result;}
    return decide(g,q);
   };
  }
  const original=await activate(ctx,donor);assert.equal(original.targets.flat().length,1);await ctx.game.move(donor,'exile');
  const first=put(MTG,ctx.game,ctx.a,'Stack Copy Entry'),second=put(MTG,ctx.game,ctx.a,'Stack Copy Untargeted');
  await activate(ctx,copier);await ctx.game.resolveTop();
  const copy=ctx.game.stack.at(-1);assert.equal(copy.targets.flat().length,1,'a copy can change target identities but not their count');
  const retarget=ctx.trace.filter(row=>row.q.type==='chooseTargets'&&row.q.candidates.includes(first)).at(-1);assert.ok(retarget);assert.equal(retarget.q.min,1);
  await settle(ctx.game);assert.equal((first.counters['+1/+1']||0)+(second.counters['+1/+1']||0),1);
 });
}
test('event Stack references cannot be admitted in spells, unrelated events, or granted unrelated bodies',()=>{
 for(const [type,text]of [['Instant','Copy that spell. You may choose new targets for the copy.'],['Creature','When this creature enters, copy that spell. You may choose new targets for the copy.'],['Enchantment — Aura','Enchant creature\nEnchanted creature has "When this creature dies, copy it. You may choose new targets for the copy."']]){
  const result=semanticClass({name:'Stack boundary',layout:'normal',type_line:type,mana_cost:'{G}',power:'2',toughness:'2',oracle_text:text});
  assert.equal(result.semanticClass,undefined);assert.equal(result.reason,'unbound-stack-copy-reference');
 }
});
