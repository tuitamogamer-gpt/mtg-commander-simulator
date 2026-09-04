import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {extensionEffect} from '../scripts/oracle-v8-play-permissions.mjs';
import {extensionTarget} from '../scripts/oracle-extensions-v8.mjs';
const rows=[
 ['Permission Hand','You may cast a spell with mana value 3 or less from your hand without paying its mana cost.','Sorcery','{G}'],
 ['Permission Adept','{1}, {T}: You may cast an instant or sorcery spell from your hand without paying its mana cost.','Creature','{G}'],
 ['Permission Plunder',"You may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost.",'Instant','{G}'],
 ['Permission OwnPlunder','You may cast target instant or sorcery card from your graveyard without paying its mana cost.','Instant','{G}'],
 ['Permission NotHand','Whenever you cast a spell from anywhere other than your hand, you gain 1 life.','Creature','{G}'],
 ['Permission YourGraveyard','Whenever you cast an instant or sorcery spell from your graveyard, you gain 1 life.','Creature','{G}'],
 ['Permission Exile',"You may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.",'Instant','{G}'],
 ['Permission Draw','Draw two cards.','Sorcery','{3}'],
 ['Permission Expensive','Draw two cards.','Sorcery','{5}'],
 ['Permission X','Target player draws X cards.','Sorcery','{X}{G}'],
 ['Permission Buyback','Buyback {1}\nDraw a card.','Sorcery','{3}'],
 ['Permission Cost','As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards.','Sorcery','{1}{G}'],
 ['Permission Target','Destroy target creature.','Sorcery','{1}{G}'],
 ['Permission Look','Look at the top three cards of your library. You may cast a spell from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.','Sorcery','{G}'],
 ['Permission Reveal','Reveal the top three cards of your library. You may cast a spell with mana value 3 or less from among them without paying its mana cost. Put the rest on the bottom of your library in a random order.','Sorcery','{G}'],
 ['Permission ExileTop','Exile the top three cards of your library. You may cast an instant or sorcery spell from among them without paying its mana cost. Then put the rest on the bottom of your library in a random order.','Sorcery','{G}'],
 ['Permission Mindclaw',"When this creature enters, target opponent reveals their hand. You may cast an instant or sorcery spell from among those cards without paying its mana cost.",'Creature','{G}'],
 ['Permission Oni',"Whenever this creature deals combat damage to a player, look at that player's hand. You may cast a spell from among those cards without paying its mana cost.",'Creature','{G}'],
 ['Permission Wand',"{1}, {T}: Target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of that library in a random order.",'Artifact','{G}'],
 ['Permission Sphinx',"Whenever this creature deals combat damage to a player, that player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled cards that weren't cast this way on the bottom of their library in a random order.",'Creature','{G}'],
];
const MTG=fixtureEngine(rows);
function world(role){
 const ctx=context(MTG,role);if(role==='human'){
  const decide=ctx.a.controller.decide;ctx.a.controller.decide=async(g,q)=>{
   if(q.type==='chooseCards'&&q.prompt?.startsWith('You may cast one')){const result=q.from.slice(0,1);ctx.trace.push({q,result});return result;}
   return decide(g,q);
  };
 }
 return ctx;
}
async function start(ctx,name){const card=put(MTG,ctx.game,ctx.a,name,'hand');ctx.a.pool.G=1;assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);return card;}
function fixtureCard(ctx,owner,zone,def){const card=new MTG.CardInst(def,owner);card.zone=zone;owner[zone].push(card);return card;}
function modalDefinition(frontTypes,backTypes){
 const faces={layout:'modal_dfc',canonicalName:'Permission modal witness',faces:[
  {key:'front',def:{name:'Permission expensive front',types:frontTypes,subtypes:[],super:[],cost:'{8}',power:'2',toughness:'3',resolve:async c=>c.g.gainLife(c.you,2,c.src)}},
  {key:'back',def:{name:'Permission affordable back',types:backTypes,subtypes:[],super:[],cost:'{1}',power:'2',toughness:'3',resolve:async c=>c.g.gainLife(c.you,4,c.src)}}]};
 return MTG.OracleV8Faces.faceDefinition(faces,'front');
}
for(const role of ['human','ai']){
 for(const [permission,zone,mine,gain]of [['Plunder','graveyard',false,1],['OwnPlunder','graveyard',true,2],['Mindclaw','hand',false,1]])test(`${role}: cast-zone predicates distinguish the owner of the ${mine?'own':'opponent'} ${zone}`,async()=>{
  const ctx=world(role);put(MTG,ctx.game,ctx.a,'Permission NotHand');put(MTG,ctx.game,ctx.a,'Permission YourGraveyard');
  put(MTG,ctx.game,mine?ctx.a:ctx.b,'Permission Draw',zone);const life=ctx.a.life;await start(ctx,'Permission '+permission);await settle(ctx.game);assert.equal(ctx.a.life,life+gain);
 });
 for(const mode of ['Mindclaw','Oni'])test(`${role}: ${mode} grants only the revealed or privately inspected opponent-hand cohort`,async()=>{
  const ctx=world(role),spell=put(MTG,ctx.game,ctx.b,'Permission Draw','hand'),land=put(MTG,ctx.game,ctx.b,'Forest','hand'),reveals=[];
  ctx.game.revealToHuman=async q=>reveals.push(q);const source=await start(ctx,'Permission '+mode);await ctx.game.resolveTop();
  if(mode==='Oni'){source.attacking=ctx.b;source.blockedBy=[];ctx.game.combat={attackers:[source],player:ctx.a};await ctx.game.combatDamage(ctx.a,'normal');}
  await ctx.game.flushTriggers();await ctx.game.resolveTop();assert.equal(spell.zone,'stack');assert.equal(ctx.game.stack.at(-1).ctrl,ctx.a);assert.equal(land.zone,'hand');
  if(mode==='Mindclaw')assert.ok(reveals.some(q=>q.kind==='reveal'&&q.cards.includes(spell)&&q.cards.includes(land)));
  else if(role==='human')assert.ok(ctx.trace.some(row=>row.q.type==='cardReveal'&&row.q.private&&row.q.player===ctx.a&&row.q.cards.includes(spell)));
  await settle(ctx.game);assert.equal(spell.zone,'graveyard');assert.ok(ctx.b.graveyard.includes(spell));assert.equal(ctx.a.hand.length,2);
 });
 for(const mode of ['Wand','Sphinx'])test(`${role}: ${mode} casts the exact until-hit card and returns every earlier nonhit to its owner's library`,async()=>{
  const ctx=world(role),spell=put(MTG,ctx.game,ctx.b,'Permission Draw','library'),a=put(MTG,ctx.game,ctx.b,'Grizzly Bears','library'),b=put(MTG,ctx.game,ctx.b,'Forest','library'),source=put(MTG,ctx.game,ctx.a,'Permission '+mode);
  if(mode==='Wand'){ctx.a.pool.C=1;const action=ctx.game.activatableList(ctx.a).find(entry=>entry.card===source);assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);}
  else{source.attacking=ctx.b;source.blockedBy=[];ctx.game.combat={attackers:[source],player:ctx.a};await ctx.game.combatDamage(ctx.a,'normal');await ctx.game.flushTriggers();}
  await ctx.game.resolveTop();assert.equal(spell.zone,'stack');assert.equal(ctx.game.stack.at(-1).from,'exile');assert.equal(ctx.game.stack.at(-1).ctrl,ctx.a);assert.equal(ctx.b.exile.length,0);
  assert.ok(ctx.b.library.slice(0,2).includes(a)&&ctx.b.library.slice(0,2).includes(b));
  const query=ctx.trace.find(row=>row.q.prompt?.startsWith('You may cast one'));assert.deepEqual([...query.q.from],[spell]);await settle(ctx.game);assert.equal(spell.zone,'graveyard');
 });
 test(`${role}: only the permitted Adventure face is cast and its spell returns to exile`,async()=>{
  const ctx=world(role),card=fixtureCard(ctx,ctx.a,'hand',{name:'Permission Adventure witness',types:['Creature'],subtypes:[],super:[],cost:'{8}',power:'2',toughness:'3',adventure:{name:'Permission cheap Adventure',types:'Sorcery',cost:'{1}',resolve:async c=>c.g.gainLife(c.you,4,c.src)}});
  await start(ctx,'Permission Hand');await ctx.game.resolveTop();const so=ctx.game.stack.at(-1);assert.equal(so.card,card);assert.equal(so.castOpts.adventure,true);assert.equal(ctx.game.stackSpellManaValue(so),1);assert.equal(so.manaSpent,0);
  const before=ctx.a.life;await settle(ctx.game);assert.equal(ctx.a.life,before+4);assert.equal(card.zone,'exile');
 });
 test(`${role}: prospective modal back-face qualities permit a cheap spell without mutating the hidden front first`,async()=>{
  const ctx=world(role),card=fixtureCard(ctx,ctx.a,'hand',modalDefinition(['Creature'],['Sorcery']));assert.equal(card.oracleFace,'front');
  await start(ctx,'Permission Hand');await ctx.game.resolveTop();const so=ctx.game.stack.at(-1);assert.equal(so.card,card);assert.equal(so.castOpts.oracleFace,'back');assert.equal(ctx.game.stackSpellManaValue(so),1);
  const before=ctx.a.life;await settle(ctx.game);assert.equal(ctx.a.life,before+4);assert.equal(card.zone,'graveyard');assert.equal(card.oracleFace,'front');assert.equal(card.is('Creature'),true);
 });
 test(`${role}: a cast permission never permits playing a modal land face`,async()=>{
  const ctx=world(role),card=fixtureCard(ctx,ctx.a,'hand',modalDefinition(['Sorcery'],['Land']));await start(ctx,'Permission Hand');await settle(ctx.game);assert.equal(card.zone,'hand');assert.equal(ctx.a.turnState.landsPlayed||0,0);
 });
 test(`${role}: permission for a specific targeted modal card can cast its creature back face`,async()=>{
  const ctx=world(role),def=modalDefinition(['Sorcery'],['Creature']);def.castCond=()=>false;
  const card=fixtureCard(ctx,ctx.b,'graveyard',def);await start(ctx,'Permission Plunder');await ctx.game.resolveTop();const so=ctx.game.stack.at(-1);
  assert.equal(so.card,card);assert.equal(so.castOpts.oracleFace,'back');await settle(ctx.game);assert.equal(card.zone,'battlefield');assert.equal(card.owner,ctx.b);assert.equal(card.ctrl,ctx.a);assert.equal(card.is('Creature'),true);
 });
 test(`${role}: free casting pays mandatory cost increases through the normal mana path`,async()=>{
  const ctx=world(role),card=put(MTG,ctx.game,ctx.a,'Permission Draw','hand');await start(ctx,'Permission Hand');
  const tax=new MTG.CardInst({name:'Permission tax witness',types:['Artifact'],subtypes:[],super:[],cost:'{2}',costMods:[(g,s,cast)=>cast.card===card?2:0]},ctx.b);tax.zone='battlefield';ctx.game.battlefield.push(tax);ctx.game.recalc();ctx.a.pool.C=2;
  await ctx.game.resolveTop();assert.equal(card.zone,'stack');assert.equal(ctx.game.stack.at(-1).manaSpent,2);assert.equal(ctx.a.pool.C,0);await settle(ctx.game);
 });
 for(const mode of ['Look','Reveal','ExileTop'])test(`${role}: inspected ${mode} casts only the locked top cohort and randomizes the remainder on the bottom`,async()=>{
  const ctx=world(role),hidden=put(MTG,ctx.game,ctx.a,'Permission Expensive','library'),land=put(MTG,ctx.game,ctx.a,'Forest','library'),spell=put(MTG,ctx.game,ctx.a,'Permission Draw','library'),other=put(MTG,ctx.game,ctx.a,'Forest','library');
  const revealed=[];ctx.game.revealToHuman=async q=>revealed.push(q);await start(ctx,'Permission '+mode);await ctx.game.resolveTop();
  assert.equal(spell.zone,'stack');assert.equal(hidden.zone,'library');assert.equal(ctx.a.library.at(-1),hidden);assert.ok(ctx.a.library.slice(0,2).includes(land)&&ctx.a.library.slice(0,2).includes(other));
  const castQuery=ctx.trace.find(row=>row.q.prompt?.startsWith('You may cast one'));assert.deepEqual([...castQuery.q.from],[spell]);
  if(mode==='Look'){assert.equal(revealed.some(q=>q.kind==='reveal'),false);if(role==='human')assert.ok(ctx.trace.some(row=>row.q.type==='cardReveal'&&row.q.private));}
  if(mode==='Reveal')assert.ok(revealed.some(q=>q.kind==='reveal'&&q.cards.length===3&&q.cards.includes(spell)));
  assert.equal(ctx.game.stack.at(-1).from,mode==='ExileTop'?'exile':'library');await settle(ctx.game);
 });
 test(`${role}: hand permission casts a sorcery during resolution with real cast triggers and one free base cost`,async()=>{
  const ctx=world(role),card=put(MTG,ctx.game,ctx.a,'Permission Draw','hand'),costly=put(MTG,ctx.game,ctx.a,'Permission Expensive','hand'),events=[];
  const emit=ctx.game.emit;ctx.game.emit=async function(event,data,...args){if(event==='cast')events.push(data);return emit.call(this,event,data,...args);};
  await start(ctx,'Permission Hand');ctx.game.turnPlayer=ctx.b;ctx.game.phase='combat';ctx.game.step='blockers';
  await ctx.game.resolveTop();assert.equal(card.zone,'stack');assert.equal(costly.zone,'hand');assert.equal(ctx.a.pool.G,0);
  const so=ctx.game.stack.at(-1);assert.equal(so.ctrl,ctx.a);assert.equal(so.from,'hand');assert.equal(so.manaSpent,0);assert.equal(events.filter(e=>e.card===card).length,1);
  assert.equal(MTG.OracleV8PlayPermissions.offers(ctx.game,ctx.a).length,0);
  const before=ctx.a.hand.length;await settle(ctx.game);assert.equal(ctx.a.hand.length,before+2);assert.equal(card.zone,'graveyard');
 });
 test(`${role}: targeted enemy graveyard spell is cast by the controller and returns to its owner's graveyard`,async()=>{
  const ctx=world(role),card=put(MTG,ctx.game,ctx.b,'Permission Draw','graveyard'),own=put(MTG,ctx.game,ctx.a,'Permission Draw','graveyard');
  await start(ctx,'Permission Plunder');await ctx.game.resolveTop();assert.equal(card.zone,'stack');assert.equal(own.zone,'graveyard');assert.equal(ctx.game.stack.at(-1).ctrl,ctx.a);
  const hand=ctx.a.hand.length;await settle(ctx.game);assert.equal(ctx.a.hand.length,hand+2);assert.equal(card.zone,'graveyard');assert.ok(ctx.b.graveyard.includes(card));
 });
 test(`${role}: a paid tap ability uses immediate permission and keeps additional sacrifice cost`,async()=>{
  const ctx=world(role),source=put(MTG,ctx.game,ctx.a,'Permission Adept'),body=put(MTG,ctx.game,ctx.a,'Grizzly Bears'),card=put(MTG,ctx.game,ctx.a,'Permission Cost','hand');
  ctx.a.pool.C=1;const action=ctx.game.activatableList(ctx.a).find(entry=>entry.card===source);assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);assert.equal(ctx.a.pool.C,0);assert.equal(source.tapped,true);
  await ctx.game.resolveTop();assert.equal(card.zone,'stack');assert.equal([body,source].filter(c=>c.zone==='graveyard').length,1);assert.equal(ctx.game.stack.at(-1).manaSpent,0);await settle(ctx.game);
 });
 test(`${role}: an exile replacement applies if the granted spell is countered`,async()=>{
  const ctx=world(role),card=put(MTG,ctx.game,ctx.b,'Permission Draw','graveyard');await start(ctx,'Permission Exile');await ctx.game.resolveTop();
  const so=ctx.game.stack.at(-1);assert.equal(so.card,card);await ctx.game.counterStackObject(so);assert.equal(card.zone,'exile');assert.ok(ctx.b.exile.includes(card));
 });
 test(`${role}: impossible mandatory targets leave the eligible graveyard card uncast`,async()=>{
  const ctx=world(role),card=put(MTG,ctx.game,ctx.b,'Permission Target','graveyard');await start(ctx,'Permission Plunder');await settle(ctx.game);assert.equal(card.zone,'graveyard');assert.equal(ctx.trace.some(row=>row.q.prompt?.startsWith('You may cast one')),false);
 });
}
test('declining a permission leaves no persistent free cast or timing grant',async()=>{
 const ctx=world('human'),card=put(MTG,ctx.game,ctx.a,'Permission Draw','hand'),decide=ctx.a.controller.decide;
 ctx.a.controller.decide=async(g,q)=>q.prompt?.startsWith('You may cast one')?[]:decide(g,q);
 await start(ctx,'Permission Hand');await settle(ctx.game);assert.equal(card.zone,'hand');assert.equal(MTG.OracleV8PlayPermissions.offers(ctx.game,ctx.a).length,0);assert.equal(ctx.game.castableList(ctx.a).some(entry=>entry.card===card),false);
});
test('stale permission cannot cast a replacement incarnation or spend its additional costs',async()=>{
 const ctx=world('human'),card=put(MTG,ctx.game,ctx.a,'Permission Cost','hand'),body=put(MTG,ctx.game,ctx.a,'Grizzly Bears'),decide=ctx.a.controller.decide;
 ctx.a.controller.decide=async(g,q)=>{if(q.prompt?.startsWith('You may cast one')){await g.move(card,'exile');await g.move(card,'hand');return [card];}return decide(g,q);};
 await start(ctx,'Permission Hand');await settle(ctx.game);assert.equal(card.zone,'hand');assert.equal(body.zone,'battlefield');
 assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand',alt:{oracleImmediateCast:1,free:true,speed:'instant'}}),false);
});
test('free base mana cost forces X to zero without spending the printed cost',async()=>{
 const ctx=world('human'),card=put(MTG,ctx.game,ctx.a,'Permission X','hand');await start(ctx,'Permission Hand');await ctx.game.resolveTop();const so=ctx.game.stack.at(-1);assert.equal(so.card,card);assert.equal(so.x,0);assert.equal(so.manaSpent,0);await settle(ctx.game);
});
test('casting prohibitions still apply during the immediate permission',async()=>{
 const ctx=world('human'),card=put(MTG,ctx.game,ctx.a,'Permission Draw','hand');await start(ctx,'Permission Hand');ctx.a.turnState.cantCastAdditional=true;await settle(ctx.game);assert.equal(card.zone,'hand');
});
test('a graveyard-only exile replacement does not replace the paid buyback destination',async()=>{
 const ctx=world('human'),card=put(MTG,ctx.game,ctx.b,'Permission Buyback','graveyard'),decide=ctx.a.controller.decide;
 ctx.a.controller.decide=async(g,q)=>q.aiHint?.kind==='buyback'?'yes':decide(g,q);ctx.a.pool.C=1;
 await start(ctx,'Permission Exile');await ctx.game.resolveTop();assert.equal(ctx.game.stack.at(-1).castOpts.buybackPaid,true);assert.equal(ctx.a.pool.C,0);
 await settle(ctx.game);assert.equal(card.zone,'hand');assert.ok(ctx.b.hand.includes(card));assert.equal(card.meta.exileIfStackLeaves,undefined);
});
test('an until search with no qualifying card returns the entire inspected library without casting',async()=>{
 const ctx=world('human'),source=put(MTG,ctx.game,ctx.a,'Permission Wand'),before=ctx.b.library.slice();ctx.a.pool.C=1;
 assert.equal(await ctx.game.activateAbility(ctx.a,ctx.game.activatableList(ctx.a).find(entry=>entry.card===source)),true);await settle(ctx.game);
 assert.equal(ctx.b.library.length,before.length);assert.ok(before.every(card=>ctx.b.library.includes(card)));assert.equal(ctx.b.exile.length,0);assert.equal(ctx.trace.some(row=>row.q.prompt?.startsWith('You may cast one')),false);
});
test('moving the authorized spell during target choice invalidates casting before any payment',async()=>{
 const ctx=world('human'),card=put(MTG,ctx.game,ctx.a,'Permission Target','hand'),body=put(MTG,ctx.game,ctx.b,'Grizzly Bears'),decide=ctx.a.controller.decide;
 ctx.a.controller.decide=async(g,q)=>{if(q.type==='chooseTargets'&&q.src===card){await g.move(card,'exile');await g.move(card,'hand');return [body];}return decide(g,q);};
 await start(ctx,'Permission Hand');await settle(ctx.game);assert.equal(card.zone,'hand');assert.equal(body.zone,'battlefield');assert.equal(ctx.game.stack.length,0);
});
test('unimplemented duration, alternate payments and extra sentences remain deferred',()=>{
 for(const text of ['You may cast a spell from your hand this turn without paying its mana cost.','You may cast a spell from your hand without paying its mana cost. Draw seven cards, then explore twice.','You may cast a spell from your hand by paying life equal to its mana value.'])assert.equal(extensionEffect({},text,{target:extensionTarget}),null,text);
});
