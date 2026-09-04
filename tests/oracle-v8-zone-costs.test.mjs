import test from'node:test';
import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
import{semanticClass}from'../scripts/import-oracle-batch.mjs';
const MTG=fixtureEngine([
 ['Zone Geistblast','Zone Geistblast deals 2 damage to any target.\n{2}{U}, Exile this card from your graveyard: Copy target instant or sorcery spell you control. You may choose new targets for the copy.','Instant','{2}{R}'],
 ['Zone Wither and Bloom','Target creature gets -3/-3 until end of turn.\n{1}{B}, Exile this card from your graveyard: Put a +1/+1 counter on target creature you control. Activate only as a sorcery.','Instant','{1}{B}'],
 ['Zone Rootha, Mercurial Artist',"{2}, Return Zone Rootha to its owner's hand: Copy target instant or sorcery spell you control. You may choose new targets for the copy.",'Creature — Orc Shaman','{1}{U}{R}'],
 ['Zone Bilbo, Birthday Celebrant','{2}{W}{B}{G}, {T}, Exile Zone Bilbo: Search your library for any number of creature cards, put them onto the battlefield, then shuffle. Activate only if you have 111 or more life.','Creature — Halfling Rogue','{W}'],
 ['Grave Copy Draw','Draw a card.','Instant','{U}'],
]);
const own=(ctx,name,zone='battlefield')=>put(MTG,ctx.game,ctx.a,name,zone);
for(const role of['human','ai']){
 test(`Zone costs ${role}: an Instant resolves normally, then its actual graveyard ability pays and copies another spell`,async()=>{
  const ctx=context(MTG,role),blast=own(ctx,'Zone Geistblast','hand');ctx.a.pool.C=2;ctx.a.pool.R=1;
  assert.equal(ctx.game.activatableList(ctx.a).some(row=>row.card===blast&&row.gyAbility),false);
  assert.equal(await ctx.game.castSpell(ctx.a,blast,{from:'hand'}),true);const normal=ctx.game.stack.at(-1),victim=normal.targets.flat()[0],life=victim.life;await settle(ctx.game);assert.equal(victim.life,life-2);assert.equal(blast.zone,'graveyard');
  const draw=own(ctx,'Grave Copy Draw','hand');ctx.a.pool.U=1;assert.equal(await ctx.game.castSpell(ctx.a,draw,{from:'hand'}),true);const original=ctx.game.stack.at(-1);ctx.a.pool.U=1;ctx.a.pool.C=1;assert.equal(ctx.game.activatableList(ctx.a).some(row=>row.card===blast&&row.gyAbility),false);
  ctx.a.pool.C=2;const action=ctx.game.activatableList(ctx.a).find(row=>row.card===blast&&row.gyAbility);assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);assert.equal(blast.zone,'exile');assert.equal(ctx.a.pool.C+ctx.a.pool.U,0);assert.equal(ctx.game.stack.at(-1).kind,'ability');await ctx.game.resolveTop();assert.ok(ctx.game.stack.some(row=>row.isCopy&&row.copyOf===original));const hand=ctx.a.hand.length;await settle(ctx.game);assert.equal(ctx.a.hand.length,hand+2);assert.equal(ctx.game.activatableList(ctx.a).some(row=>row.card===blast&&row.gyAbility),false);
 });
 test(`Zone costs ${role}: sorcery graveyard timing and a mandatory own-creature target are rechecked`,async()=>{
  const ctx=context(MTG,role),source=own(ctx,'Zone Wither and Bloom','graveyard');ctx.a.pool.B=1;ctx.a.pool.C=1;assert.equal(ctx.game.activatableList(ctx.a).some(row=>row.card===source&&row.gyAbility),false);const target=own(ctx,'Grizzly Bears');ctx.game.phase='combat';assert.equal(ctx.game.activatableList(ctx.a).some(row=>row.card===source&&row.gyAbility),false);ctx.game.phase='main1';const action=ctx.game.activatableList(ctx.a).find(row=>row.card===source&&row.gyAbility);assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);assert.equal(source.zone,'exile');assert.equal(target.counters['+1/+1']||0,0);await settle(ctx.game);assert.equal(target.counters['+1/+1'],1);
 });
 test(`Zone costs ${role}: printed shortened source names pay Return and Exile costs before resolving the ability`,async()=>{
  const ctx=context(MTG,role),source=own(ctx,'Zone Rootha, Mercurial Artist'),draw=own(ctx,'Grave Copy Draw','hand');ctx.a.pool.U=1;assert.equal(await ctx.game.castSpell(ctx.a,draw,{from:'hand'}),true);const original=ctx.game.stack.at(-1);ctx.a.pool.C=2;const action=ctx.game.activatableList(ctx.a).find(row=>row.card===source);assert.ok(action);assert.equal(await ctx.game.activateAbility(ctx.a,action),true);assert.equal(source.zone,'hand');assert.equal(ctx.a.pool.C,0);await ctx.game.resolveTop();assert.ok(ctx.game.stack.some(row=>row.isCopy&&row.copyOf===original));await settle(ctx.game);
  const bilbo=own(ctx,'Zone Bilbo, Birthday Celebrant');Object.assign(ctx.a.pool,{W:1,B:1,G:1,C:2});assert.equal(ctx.game.activatableList(ctx.a).some(row=>row.card===bilbo),false);ctx.a.life=111;const creature=own(ctx,'Grizzly Bears','library');if(role==='human'){const decide=ctx.a.controller.decide.bind(ctx.a.controller);ctx.a.controller.decide=(g,q)=>q.type==='chooseCards'&&q.from.includes(creature)?[creature]:decide(g,q);}const exile=ctx.game.activatableList(ctx.a).find(row=>row.card===bilbo);assert.ok(exile);assert.equal(await ctx.game.activateAbility(ctx.a,exile),true);assert.equal(bilbo.zone,'exile');await settle(ctx.game);assert.equal(creature.zone,'battlefield');
 });
}
test('Zone cost fallbacks do not permit unknown source aliases, variable mana, free graveyard actions or battlefield-only actions on spells',()=>{
 for(const text of['Draw a card.\n{X}{U}, Exile this card from your graveyard: Draw a card.','Draw a card.\n{1}: Draw a card.','Draw a card.\nExile this card from your graveyard: Draw a card.'])assert.equal(!!semanticClass({name:'Unknown grave action',type_line:'Instant',mana_cost:'{U}',oracle_text:text,layout:'normal'}).semanticClass,false);
 assert.equal(!!semanticClass({name:'Zone Rootha, Mercurial Artist',type_line:'Creature — Orc Shaman',power:'1',toughness:'4',mana_cost:'{1}{U}{R}',oracle_text:"{2}, Return Other Rootha to its owner's hand: Draw a card.",layout:'normal'}).semanticClass,false);
});
