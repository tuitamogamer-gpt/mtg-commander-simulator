import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
const MTG=fixtureEngine([
  ['Hand Exile','Target opponent reveals their hand. You choose a nonland card from it. Exile that card.','Sorcery','{B}'],
  ['Hand Small','Target player reveals their hand. You choose a nonland card from it with mana value 3 or less. That player discards that card.','Sorcery','{B}'],
  ['Hand Large','Target opponent reveals their hand. You choose a card from it with mana value 4 or greater and exile that card.','Sorcery','{B}'],
  ['Small Body','','Creature','{2}'],['Large Body','','Creature','{5}'],
]);
for(const role of ['human','ai'])for(const [name,selection,destination] of [['Hand Exile','Small Body','exile'],['Hand Small','Small Body','graveyard'],['Hand Large','Large Body','exile']]){
  test(`${role}: ${name} reveals the real hand and applies the exact printed selection`,async()=>{
    const ctx=context(MTG,role),{game,a,b}=ctx;
    if(role==='human'){const decide=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(b)?Promise.resolve([b]):decide(g,q);}
    const wanted=put(MTG,game,b,selection,'hand'),land=put(MTG,game,b,'Forest','hand');
    const wrong=name==='Hand Exile'?null:put(MTG,game,b,selection==='Small Body'?'Large Body':'Small Body','hand');
    const source=put(MTG,game,a,name,'hand');a.pool.B=1;
    const revealed=[];game.revealToHuman=async payload=>revealed.push(...payload.cards);
    assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);
    assert.equal(wanted.zone,destination);assert.equal(land.zone,'hand');if(wrong)assert.equal(wrong.zone,'hand');
    assert.ok(revealed.includes(wanted)&&revealed.includes(land));
    assert.ok(ctx.trace.some(row=>row.q.type==='chooseCards'&&row.result.includes(wanted)));
  });
}
