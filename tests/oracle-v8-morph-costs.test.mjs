import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Morph Discard','Morph—Discard a Zombie card.','Creature — Zombie','{G}'],
 ['Morph Return',"Morph—Return two Islands you control to their owner's hand.\nWhen this creature is turned face up, draw two cards.",'Creature — Illusion','{1}{U}'],
 ['Morph Life','Morph—Pay 5 life.','Creature — Zombie','{2}{B}'],
 ['Morph Reveal','Morph—Reveal a red card in your hand.\nWhen this creature is turned face up, you gain 2 life.','Creature — Human','{1}{R}'],
 ['Morph Land','{T}: Add {C}.\nMorph {2}','Land',''],
 ['Morph Enchantment','Creatures you control get +0/+1.\nMorph {1}{W}','Enchantment','{1}{W}'],
 ['Morph Artifact','{T}: Add {C}.\nMorph {3}','Artifact','{4}'],
 ['Disguise Artifact','{T}: Add {C}.\nDisguise {2}{R}','Artifact','{3}'],
 ['Morph Zombie','','Creature — Zombie','{B}'],['Morph Red','Draw a card.','Instant','{R}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
const offers=ctx=>ctx.game.activatableList(ctx.a).filter(option=>option.card===ctx.source&&option.turnFaceUp);
async function ready(role,name){const ctx=context(MTG,role);ctx.a.pool={W:0,U:0,B:0,R:0,G:0,C:3};ctx.source=own(ctx,name,'hand');const option=ctx.game.castableList(ctx.a).find(option=>option.card===ctx.source&&option.alt?.faceDownCast);assert.ok(option);assert.equal(await ctx.game.castSpell(ctx.a,ctx.source,{from:'hand',alt:option.alt}),true);assert.equal(ctx.game.stack.find(so=>so.card===ctx.source).manaSpent,3);await settle(ctx.game);return ctx;}
for(const role of ['human','ai']){
 test(`Morph ${role}: fixed typed discard and life payment happen before a stackless face-up action`,async()=>{
  const ctx=await ready(role,'Morph Discard');assert.equal(offers(ctx).length,0);own(ctx,'Grizzly Bears','hand');assert.equal(offers(ctx).length,0);const card=own(ctx,'Morph Zombie','hand');assert.equal(offers(ctx).length,1);const before=ctx.a.turnState.spellsCast;
  assert.equal(await ctx.game.activateAbility(ctx.a,offers(ctx)[0]),true);assert.equal(card.zone,'graveyard');assert.equal(ctx.source.faceDown,false);assert.equal(ctx.game.stack.length,0);assert.equal(ctx.a.turnState.spellsCast,before);assert.deepEqual([...ctx.source.meta.oracleFaceUpPayment.costs.discards],[card.iid]);
  const life=await ready(role,'Morph Life');life.a.life=4;assert.equal(offers(life).length,0);assert.equal(await life.game.turnFaceUp(life.a,life.source,'{0}','morph'),false);assert.equal(life.a.life,4);life.a.life=10;assert.equal(await life.game.activateAbility(life.a,offers(life)[0]),true);assert.equal(life.a.life,5);assert.equal(life.source.meta.oracleFaceUpPayment.costs.life,5);
 });
 test(`Morph ${role}: exactly two controlled Islands return and the face-up trigger reaches the Stack`,async()=>{
  const ctx=await ready(role,'Morph Return'),first=own(ctx,'Island');put(MTG,ctx.game,ctx.b,'Island');own(ctx,'Forest');assert.equal(offers(ctx).length,0);const second=own(ctx,'Island');assert.equal(await ctx.game.activateAbility(ctx.a,offers(ctx)[0]),true);assert.equal(first.zone,'hand');assert.equal(second.zone,'hand');assert.equal(ctx.source.meta.oracleFaceUpPayment.costs.returns.length,2);assert.equal(ctx.a.hand.length,2);await ctx.game.flushTriggers();assert.ok(ctx.game.stack.some(so=>so.kind==='trigger'&&so.srcCard===ctx.source));await settle(ctx.game);assert.equal(ctx.a.hand.length,4);
 });
 test(`Morph ${role}: the exact colored hand card is revealed and stays in hand`,async()=>{
  const ctx=await ready(role,'Morph Reveal');own(ctx,'Morph Zombie','hand');assert.equal(offers(ctx).length,0);const card=own(ctx,'Morph Red','hand'),events=[];ctx.game.revealToHuman=async event=>events.push(event);const life=ctx.a.life;
  assert.equal(await ctx.game.activateAbility(ctx.a,offers(ctx)[0]),true);assert.equal(card.zone,'hand');assert.equal(events.length,1);assert.equal(events[0].cards[0],card);assert.equal(events[0].ctrl,ctx.a);assert.equal(ctx.source.meta.oracleFaceUpPayment.reveal.iid,card.iid);await settle(ctx.game);assert.equal(ctx.a.life,life+2);
 });
 test(`Morph ${role}: Land, Enchantment, Artifact and Disguise restore their real noncreature types`,async()=>{
  for(const [name,type,cost]of [['Morph Land','Land',2],['Morph Enchantment','Enchantment',2],['Morph Artifact','Artifact',3],['Disguise Artifact','Artifact',3]]){
   const ctx=await ready(role,name);assert.equal(ctx.source.is('Creature'),true);ctx.a.pool={W:1,U:0,B:0,R:1,G:0,C:3};const before=Object.values(ctx.a.pool).reduce((a,b)=>a+b,0);assert.equal(await ctx.game.activateAbility(ctx.a,offers(ctx)[0]),true);assert.equal(ctx.source.faceDown,false);assert.equal(ctx.source.is('Creature'),false);assert.equal(ctx.source.is(type),true);assert.equal(Object.values(ctx.a.pool).reduce((a,b)=>a+b,0),before-cost);
  }
 });
}
test('Morph remains an intrinsic special action under split second; manifest creature mana and noncreature restrictions remain separate',async()=>{
 const ctx=await ready('human','Morph Life');ctx.source.cur.activationDisabled=true;const split=own(ctx,'Morph Red','hand');split.def={...split.def,splitSecond:true};ctx.a.pool.R=1;assert.equal(await ctx.game.castSpell(ctx.a,split,{from:'hand'}),true);ctx.source.cur.activationDisabled=true;assert.equal(ctx.game.hasSplitSecond(),true);assert.equal(await ctx.game.activateAbility(ctx.a,offers(ctx)[0]),true);assert.equal(ctx.source.faceDown,false);assert.equal(ctx.game.stack.length,1);
 const other=context(MTG,'human'),land=own(other,'Forest','hand');await other.game.manifestCard(other.a,land);assert.equal(other.game.faceUpCosts(land).length,0);
 const morph=own(other,'Morph Land','hand');await other.game.manifestCard(other.a,morph);assert.deepEqual([...other.game.faceUpCosts(morph)].map(cost=>cost.kind),['morph']);
 const creature=own(other,'Morph Life','hand');await other.game.manifestCard(other.a,creature);assert.ok(other.game.faceUpCosts(creature).some(cost=>cost.kind==='mana cost'));creature.cur.abilitiesDisabled=true;assert.deepEqual([...other.game.faceUpCosts(creature)].map(cost=>cost.kind),['mana cost']);
});
test('Morph rejects wrong kind, changed hand/source identity, invalid duplicate choices and no longer controlled costs',async()=>{
 const ctx=await ready('human','Morph Reveal'),card=own(ctx,'Morph Red','hand'),decide=ctx.a.controller.decide.bind(ctx.a.controller);assert.equal(await ctx.game.turnFaceUp(ctx.a,ctx.source,'{0}','mana cost'),false);
 ctx.a.controller.decide=async(g,q)=>{const answer=await decide(g,q);if(q.type==='chooseCards'){await g.move(card,'graveyard');await g.move(card,'hand');}return answer;};assert.equal(await ctx.game.turnFaceUp(ctx.a,ctx.source,'{0}','morph'),false);assert.equal(ctx.source.faceDown,true);
 const duplicate=await ready('human','Morph Return'),first=own(duplicate,'Island');own(duplicate,'Island');duplicate.a.controller.decide=async()=>[first,first];assert.equal(await duplicate.game.turnFaceUp(duplicate.a,duplicate.source,'{0}','morph'),false);assert.equal(first.zone,'battlefield');
 const control=await ready('human','Morph Return'),island=own(control,'Island'),other=own(control,'Island');control.a.controller.decide=async()=>{island.ctrl=control.b;return[island,other];};assert.equal(await control.game.turnFaceUp(control.a,control.source,'{0}','morph'),false);assert.equal(other.zone,'battlefield');
 const changed=await ready('human','Morph Discard'),zombie=own(changed,'Morph Zombie','hand');changed.a.controller.decide=async()=>{await changed.game.move(changed.source,'exile');await changed.game.putFaceDown(changed.a,changed.source,'morph');return[zombie];};assert.equal(await changed.game.turnFaceUp(changed.a,changed.source,'{0}','morph'),false);assert.equal(zombie.zone,'hand');assert.equal(changed.source.faceDown,true);
});
test('Morph return cost can consume its own current land object without turning the new hand object face up',async()=>{
 const ctx=await ready('human','Morph Return');own(ctx,'Island');ctx.game.addOracleAnimation(ctx.source,{types:['Land'],subtypes:['Island'],keywords:[],colors:null,retainTypes:false,retainAllSubtypes:false,temporary:false});assert.equal(ctx.source.is('Land'),true);let turned=0;const emit=ctx.game.emit;ctx.game.emit=async function(event,...args){if(event==='turnedFaceUp')turned++;return emit.call(this,event,...args);};assert.equal(offers(ctx).length,1);assert.equal(await ctx.game.activateAbility(ctx.a,offers(ctx)[0]),true);assert.equal(ctx.source.zone,'hand');assert.equal(turned,0);assert.equal(ctx.a.hand.length,2);
});
test('Morph normal casting does not pay the face-up cost and local AI selects its real face-up action',async()=>{
 const ctx=context(MTG,'human'),card=own(ctx,'Morph Life','hand');ctx.a.pool={W:0,U:0,B:1,R:0,G:0,C:2};const life=ctx.a.life;assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);await settle(ctx.game);assert.equal(ctx.a.life,life);assert.equal(card.faceDown,false);
 const ai=await ready('ai','Morph Return');own(ai,'Island');own(ai,'Island');const acts=offers(ai),action=await ai.a.controller.decide(ai.game,{type:'main',player:ai.a,phase:ai.game.phase,casts:[],acts,lands:[]});assert.equal(action.kind,'activate');await ai.game.performAction(ai.a,action);assert.equal(ai.source.faceDown,false);await settle(ai.game);
});
test('Morph grammar fails closed unknown colors, variable count and combined nonmana costs',()=>{
 for(const oracle of ['Morph—Reveal a purple card in your hand.','Morph—Return X Islands you control to their owner\'s hand.','Morph—Pay 3 life and discard a card.','Morph—Discard a card at random.'])assert.equal(!!semanticClass({name:'Unknown Morph',layout:'normal',type_line:'Creature — Bear',mana_cost:'{G}',oracle_text:oracle,power:'2',toughness:'3'}).semanticClass,false);
});
