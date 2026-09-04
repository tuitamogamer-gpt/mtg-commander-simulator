import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {extensionEffect} from '../scripts/oracle-v8-play-permissions.mjs';
import {extensionTarget} from '../scripts/oracle-extensions-v8.mjs';
const until='Exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost';
const rows=[
 ['Inspected Stay',until+'.','Sorcery','{G}'],
 ['Inspected Hand',until+" if the spell's mana value is less than the number of Mountains you control. If you don't cast that card this way, put it into your hand.",'Sorcery','{G}'],
 ['Inspected Life',until+" if the spell's mana value is less than or equal to the amount of life you gained this turn. Otherwise, put it into your hand.",'Sorcery','{G}'],
 ['Inspected Fixed',until+" if that spell's mana value is 8 or less. If you don't, put that card into your hand.",'Sorcery','{G}'],
 ['Inspected Reveal','Reveal cards from the top of your library until you reveal a nonland card with mana value 3 or less. You may cast that card without paying its mana cost. Put all revealed cards not cast this way on the bottom of your library in a random order.','Sorcery','{G}'],
 ['Inspected Odd',"Reveal the top card of your library. You may cast it without paying its mana cost if its mana value is odd. If you don't cast it, draw a card.",'Sorcery','{G}'],
 ['Inspected Power',"{T}: "+until+" if it's a spell with mana value less than or equal to this creature's power. Put the exiled cards not cast this way on the bottom of your library in a random order.",'Creature','{G}'],
 ['Inspected Donor','You gain 3 life.','Sorcery','{2}'],
 ['Inspected OddDonor','You gain 3 life.','Sorcery','{3}'],
 ['Inspected ZeroDonor','You gain 3 life.','Sorcery','{0}'],
 ['Inspected XDonor','You gain X life.','Sorcery','{X}'],
 ['Inspected BigDonor','You gain 3 life.','Sorcery','{9}'],
];
const M=fixtureEngine(rows);
function world(role){const ctx=context(M,role);if(role==='human'){const decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>{if(q.prompt?.startsWith('You may cast one')){const result=q.from.slice(0,1);ctx.trace.push({q,result});return result;}return decide(g,q);};}return ctx;}
async function begin(ctx,name){const c=put(M,ctx.game,ctx.a,name,'hand');ctx.a.pool.G=1;assert.equal(await ctx.game.castSpell(ctx.a,c,{from:'hand'}),true);await ctx.game.resolveTop();return c;}
function custom(ctx,def){const c=new M.CardInst(def,ctx.a);c.zone='library';ctx.a.library.push(c);return c;}
for(const role of ['human','ai']){
 test(`${role}: exile until stops at one nonland, casts once and leaves every earlier land exiled`,async()=>{
  const ctx=world(role),hidden=put(M,ctx.game,ctx.a,'Inspected BigDonor','library'),donor=put(M,ctx.game,ctx.a,'Inspected Donor','library'),lands=[put(M,ctx.game,ctx.a,'Forest','library'),put(M,ctx.game,ctx.a,'Mountain','library')];
  await begin(ctx,'Inspected Stay');assert.equal(ctx.game.stack.length,1);const so=ctx.game.stack.at(-1);assert.equal(so.card,donor);assert.equal(so.from,'exile');assert.equal(so.manaSpent,0);assert.equal(hidden.zone,'library');assert.equal(ctx.a.library.at(-1),hidden);assert.ok(lands.every(c=>c.zone==='exile'));assert.deepEqual([...ctx.trace.find(r=>r.q.prompt?.startsWith('You may cast one')).q.from],[donor]);
  await settle(ctx.game);assert.equal(ctx.a.life,43);assert.equal(donor.zone,'graveyard');assert.equal(M.OracleV8PlayPermissions.offers(ctx.game,ctx.a).length,0);
 });
 for(const mountainCount of [0,2,3])test(`${role}: strict Mountain bound ${mountainCount} checks the prospective spell and keeps nonhits exiled`,async()=>{
  const ctx=world(role);for(let i=0;i<mountainCount;i++)put(M,ctx.game,ctx.a,'Mountain');const donor=put(M,ctx.game,ctx.a,'Inspected Donor','library'),land=put(M,ctx.game,ctx.a,'Forest','library');
  await begin(ctx,'Inspected Hand');assert.equal(donor.zone,mountainCount===3?'stack':'hand');assert.equal(land.zone,'exile');await settle(ctx.game);assert.equal(ctx.a.life,mountainCount===3?43:40);
 });
 test(`${role}: zero Mountains rejects a zero-cost spell under a strict-less bound`,async()=>{
  const ctx=world(role),donor=put(M,ctx.game,ctx.a,'Inspected ZeroDonor','library');await begin(ctx,'Inspected Hand');assert.equal(donor.zone,'hand');assert.equal(ctx.game.stack.length,0);
 });
 test(`${role}: life gained is read at resolution and comparison includes equality`,async()=>{
  const ctx=world(role),donor=put(M,ctx.game,ctx.a,'Inspected Donor','library');await ctx.game.gainLife(ctx.a,2);await begin(ctx,'Inspected Life');assert.equal(donor.zone,'stack');await settle(ctx.game);assert.equal(ctx.a.life,45);
 });
 test(`${role}: reveal-until tests the card before casting, skips expensive nonlands and returns them to bottom`,async()=>{
  const ctx=world(role),donor=put(M,ctx.game,ctx.a,'Inspected Donor','library'),big=put(M,ctx.game,ctx.a,'Inspected BigDonor','library'),land=put(M,ctx.game,ctx.a,'Forest','library'),reveals=[];ctx.game.revealToHuman=async q=>reveals.push(q);
  await begin(ctx,'Inspected Reveal');assert.equal(donor.zone,'stack');assert.equal(ctx.game.stack.at(-1).from,'library');assert.ok(ctx.a.library.slice(0,2).includes(big)&&ctx.a.library.slice(0,2).includes(land));assert.ok(reveals.some(q=>q.cards.length===3&&q.cards.includes(donor)));await settle(ctx.game);
 });
 for(const odd of [true,false])test(`${role}: odd-card permission ${odd?'casts':'draws the even card'} through its actual branch`,async()=>{
  const ctx=world(role),donor=put(M,ctx.game,ctx.a,odd?'Inspected OddDonor':'Inspected Donor','library');await begin(ctx,'Inspected Odd');assert.equal(donor.zone,odd?'stack':'hand');await settle(ctx.game);assert.equal(ctx.a.life,odd?43:40);
 });
 test(`${role}: prospective Adventure mana value permits the cheap spell on an expensive revealed card`,async()=>{
  const ctx=world(role);for(let i=0;i<2;i++)put(M,ctx.game,ctx.a,'Mountain');const card=custom(ctx,{name:'Inspected Adventure',cost:'{9}',types:['Creature'],subtypes:[],super:[],power:'2',toughness:'3',adventure:{name:'Inspected Trip',cost:'{1}',types:'Sorcery',resolve:async c=>c.g.gainLife(c.you,4,c.src)}});
  await begin(ctx,'Inspected Hand');assert.equal(card.zone,'stack');assert.equal(ctx.game.stack.at(-1).castOpts.adventure,true);assert.equal(ctx.game.stackSpellManaValue(ctx.game.stack.at(-1)),1);await settle(ctx.game);assert.equal(ctx.a.life,44);assert.equal(card.zone,'exile');
 });
 test(`${role}: source power uses the old activation incarnation when its source leaves and returns`,async()=>{
  const ctx=world(role),source=put(M,ctx.game,ctx.a,'Inspected Power'),donor=put(M,ctx.game,ctx.a,'Inspected Donor','library');assert.equal(source.power,2);const action=ctx.game.activatableList(ctx.a).find(a=>a.card===source);assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);await ctx.game.move(source,'hand');await ctx.game.move(source,'battlefield');source.counters['-1/-1']=1;ctx.game.recalc();assert.equal(source.power,1);await ctx.game.resolveTop();assert.equal(donor.zone,'stack');await settle(ctx.game);
 });
}
for(const [permission,expected] of [['Inspected Stay','exile'],['Inspected Hand','hand'],['Inspected Reveal','library'],['Inspected Odd','hand']])test(`declined ${permission} retains its exact printed destination`,async()=>{
 const ctx=world('human');for(let i=0;i<4;i++)put(M,ctx.game,ctx.a,'Mountain');const donor=put(M,ctx.game,ctx.a,'Inspected OddDonor','library'),decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>q.prompt?.startsWith('You may cast one')?[]:decide(g,q);await begin(ctx,permission);assert.equal(donor.zone,expected);if(expected==='library')assert.equal(ctx.a.library[0],donor);assert.equal(ctx.game.stack.length,0);
});
test('a stale inspected stop card does not move a new incarnation into hand',async()=>{
 const ctx=world('human');for(let i=0;i<4;i++)put(M,ctx.game,ctx.a,'Mountain');const donor=put(M,ctx.game,ctx.a,'Inspected Donor','library'),decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>{if(q.prompt?.startsWith('You may cast one')){await g.move(donor,'graveyard');await g.move(donor,'exile');return [donor];}return decide(g,q);};await begin(ctx,'Inspected Hand');assert.equal(donor.zone,'exile');assert.equal(ctx.game.stack.length,0);
});
test('an all-land until cohort exiles the whole library but moves no stop card to hand',async()=>{
 const ctx=world('human'),before=ctx.a.library.slice();await begin(ctx,'Inspected Hand');assert.equal(ctx.a.library.length,0);assert.ok(before.every(c=>c.zone==='exile'));assert.equal(ctx.a.hand.length,0);assert.equal(ctx.a.life,40);
});
test('future casting, repeat instructions and unimplemented hidden optional inspections fail closed',()=>{
 for(const line of [until+' this turn.',until+'. Then repeat this process.',"You may look at the top card of your library. You may cast it without paying its mana cost if it's an instant or sorcery spell.",until+" if that card's mana value equals another card's mana value."])assert.equal(extensionEffect({},line,{target:extensionTarget}),null,line);
});
