import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass}from'../scripts/import-oracle-batch.mjs';
import {fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const MTG=fixtureEngine([
 ['Milled Brood','Mill two cards. For each creature card milled this way, create a 1/1 green Saproling creature token.','Sorcery','{G}'],
 ['Discarded Brood','Discard two cards, then draw two cards. For each nonland card discarded this way, create a 1/1 red Elemental creature token.','Sorcery','{G}'],
 ['Land Result','Mill a card. If a land card was milled this way, you gain 2 life. Otherwise, Land Result deals 3 damage to each opponent.','Sorcery','{G}'],
 ['Exile Result','Exile target card from a graveyard. If a creature card was exiled this way, you gain 2 life.','Instant','{G}'],
 ['Sacrifice Result','Target player sacrifices a creature of their choice. If a Saproling is sacrificed this way, you gain 2 life.','Instant','{G}'],
 ['Colored Results','Exile the top two cards of your library. For each blue card exiled this way, draw a card. For each red card exiled this way, Colored Results deals 1 damage to each opponent.','Sorcery','{G}'],
 ['Saproling Result Body','','Creature — Saproling'],
 ['Shared Results','Mill two cards. If two nonland cards that share a color were milled this way, you gain 2 life. Otherwise, you gain 1 life.','Sorcery','{G}'],
 ['Exiled Token Results','Exile all creatures. For each creature exiled this way, create a 1/1 green Saproling creature token.','Sorcery','{G}'],
 ['Exiled Card Results','Exile all creatures. For each creature card exiled this way, create a 1/1 green Saproling creature token.','Sorcery','{G}'],
 ['Selected Them','Mill two cards. You may put a creature card from among them into your hand. If you don\'t, you gain 2 life.','Sorcery','{G}'],
 ['Selected Milled','Mill two cards. You may put a creature card from among the milled cards into your hand. If you don\'t, you gain 2 life.','Sorcery','{G}'],
 ['Selected Mill','Mill two cards. You may put a creature card from among the cards milled this way into your hand. If you don\'t, you gain 2 life.','Sorcery','{G}'],
]);
async function cast(ctx,name){const card=put(MTG,ctx.game,ctx.a,name,'hand');ctx.a.pool.G++;assert.equal(await ctx.game.castSpell(ctx.a,card,{from:'hand'}),true);assert.equal(ctx.a.pool.G,0);return card;}
for(const role of ['human','ai']){
 for(const selectedName of ['Selected Mill','Selected Them','Selected Milled'])for(const replacement of [false,true])test(`${role}: ${selectedName} follows newly milled cards through ${replacement?'exile replacement':'graveyard'}`,async()=>{
  const ctx=context(MTG,role),{game,a,b}=ctx;const old=put(MTG,game,a,'Grizzly Bears','graveyard'),selected=put(MTG,game,a,'Grizzly Bears','library');put(MTG,game,a,'Lightning Bolt','library');
  if(replacement)put(MTG,game,b,'Dauthi Voidwalker');
  if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.prompt==='Choose a milled card for your hand'?Promise.resolve([selected]):decide(g,q);}
  const life=a.life;await cast(ctx,selectedName);await settle(game);assert.equal(selected.zone,'hand');assert.equal(old.zone,'graveyard');assert.equal(a.life,life);
 });
 test(`${role}: no matching result takes the printed fallback`,async()=>{
  const ctx=context(MTG,role),life=ctx.a.life;await cast(ctx,'Selected Mill');await settle(ctx.game);assert.equal(ctx.a.life,life+2);
 });
 test(`${role}: only actually milled creatures create tokens, including graveyard replacement`,async()=>{
  const ctx=context(MTG,role),{game,a,b}=ctx;
  put(MTG,game,b,'Dauthi Voidwalker');
  const first=put(MTG,game,a,'Grizzly Bears','library'),second=put(MTG,game,a,'Grizzly Bears','library');
  const before=game.bf().filter(card=>card.isToken).length;
  await cast(ctx,'Milled Brood');await settle(game);
  assert.equal(first.zone,'exile');assert.equal(second.zone,'exile');assert.equal(game.bf().filter(card=>card.isToken).length-before,2);
 });
 test(`${role}: discard results survive following draw and count neither new nor unrelated cards`,async()=>{
  const ctx=context(MTG,role),{game,a}=ctx;
  put(MTG,game,a,'Lightning Bolt','hand');put(MTG,game,a,'Grizzly Bears','hand');
  put(MTG,game,a,'Grizzly Bears','library');put(MTG,game,a,'Grizzly Bears','library');
  put(MTG,game,a,'Grizzly Bears','graveyard');
  await cast(ctx,'Discarded Brood');await settle(game);
  assert.equal(a.hand.length,2);assert.equal(game.bf().filter(card=>card.isToken&&card.hasSub('Elemental')).length,2);
 });
 for(const land of [true,false])test(`${role}: result condition takes the ${land?'matching':'otherwise'} branch`,async()=>{
  const ctx=context(MTG,role),{game,a,b}=ctx;put(MTG,game,a,land?'Forest':'Grizzly Bears','library');
  const before=[a.life,b.life];await cast(ctx,'Land Result');await settle(game);
  assert.equal(a.life,before[0]+(land?2:0));assert.equal(b.life,before[1]-(land?0:3));
 });
 test(`${role}: exiled-card result cannot observe a departed target or an older exile`,async()=>{
  const ctx=context(MTG,role),{game,a}=ctx;
  const target=put(MTG,game,a,'Grizzly Bears','graveyard');put(MTG,game,a,'Grizzly Bears','exile');
  const life=a.life,first=await cast(ctx,'Exile Result');await game.move(target,'hand');await settle(game);assert.equal(a.life,life);await game.move(first,'exile');
  await game.move(target,'graveyard');await cast(ctx,'Exile Result');await settle(game);assert.equal(a.life,life+2);
 });
 test(`${role}: each result filter uses its own exact exiled cohort`,async()=>{
  const ctx=context(MTG,role),{game,a,b}=ctx;
  const one=put(MTG,game,a,'Grizzly Bears','library');one.def={...one.def,colorsOverride:['U','R']};
  const two=put(MTG,game,a,'Grizzly Bears','library');two.def={...two.def,colorsOverride:['U']};
  const life=b.life;await cast(ctx,'Colored Results');await settle(game);
  assert.equal(a.hand.length,2);assert.equal(b.life,life-1);assert.equal(one.zone,'exile');assert.equal(two.zone,'exile');
 });
 for(const shared of [true,false])test(`${role}: shared-color condition uses both milled cards`,async()=>{
  const ctx=context(MTG,role),{game,a}=ctx;const first=put(MTG,game,a,'Grizzly Bears','library'),second=put(MTG,game,a,'Grizzly Bears','library');
  first.def={...first.def,colorsOverride:['U']};second.def={...second.def,colorsOverride:shared?['U','R']:['G']};const life=a.life;
  await cast(ctx,'Shared Results');await settle(game);assert.equal(a.life,life+(shared?2:1));
 });
 for(const cardsOnly of [true,false])test(`${role}: exiled tokens count only when the result says creatures`,async()=>{
  const ctx=context(MTG,role),{game,a}=ctx;put(MTG,game,a,'Grizzly Bears');await game.makeTokens('saproling',a,{n:2});
  await cast(ctx,cardsOnly?'Exiled Card Results':'Exiled Token Results');await settle(game);assert.equal(game.bf().filter(card=>card.isToken).length,cardsOnly?1:3);
 });
 test(`${role}: sacrificed creature uses its previous subtype`,async()=>{
  const ctx=context(MTG,role),{game,a,b}=ctx;
  // Give both possible target players one cheap qualifying creature so the
  // local AI keeps its own target/choice logic.
  for(const player of [a,b])put(MTG,game,player,'Saproling Result Body');
  const life=a.life;await cast(ctx,'Sacrifice Result');await settle(game);assert.equal(a.life,life+2);
 });
}
test('unbound and mixed result scopes remain deferred',()=>{
 for(const oracle_text of ['If a creature card was milled this way, draw a card.','Mill a card. If a land card was discarded this way, draw a card.','Mill a card, then discard a card. If a land card was milled this way, draw a card.','Mill a card. If a land card was milled this way, repeat this process.'])assert.equal(semanticClass({name:'Scope Probe',type_line:'Sorcery',mana_cost:'{G}',oracle_text,layout:'normal'}).semanticClass,undefined);
});

test('milled selection aliases do not bind to other operations or collapse two independent card choices',()=>{
 for(const oracle_text of ['Draw two cards. You may put a creature card from among them into your hand.','Mill three cards. You may put a creature card and/or a land card from among them into your hand.'])assert.equal(semanticClass({name:'Unbound result',oracle_text,type_line:'Sorcery',mana_cost:'{G}',layout:'normal'}).semanticClass,undefined);
});
