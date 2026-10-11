import assert from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {put,permanent,choose,total} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';

export async function proveLearnChoice(M,role,key){
  const {game:g,a,b,trace}=context(M,role),spell=put(M,a,'Cram Session','hand'),discard=put(M,a,'Forest','hand');
  const lands=['Forest','Swamp'].map(name=>permanent(M,g,a,M.DEFS[name])),top=a.library.at(-1),size=a.library.length,life=a.life,otherLife=b.life;
  let offered;
  choose(a,q=>{
    if(q.type==='chooseOption'&&q.aiHint?.src===spell&&q.options.some(row=>row.key==='discard')){
      offered=q.options.map(row=>row.key);return {...q,options:q.options.filter(row=>row.key===key)};
    }
    if(q.type==='chooseCards'&&q.aiHint?.src===spell&&q.from.includes(discard))return {...q,from:[discard],min:1,max:1};
    return null;
  });
  assert.equal(total(a),0);
  assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);
  await settle(g);
  assert.ok(offered?.includes('none')&&offered.includes('discard'),'native Learn offers both decline and rummage');
  assert.equal(a.life,life+4);assert.equal(b.life,otherLife);
  assert.equal(spell.zone,'graveyard');assert.equal(total(a),0);assert.equal(lands.every(card=>card.tapped),true,'actual two-land payment');
  assert.equal(discard.zone,key==='discard'?'graveyard':'hand');
  assert.equal(top.zone,key==='discard'?'hand':'library');
  assert.equal(a.library.length,size-(key==='discard'?1:0));assert.equal(a.hand.length,1);
  const choices=trace.filter(row=>row.q.type==='chooseCards'&&row.q.aiHint?.src===spell);
  assert.equal(choices.length,key==='discard'?1:0);
  if(key==='discard')assert.equal(choices[0].result[0]===discard,true);
  assert.equal(a.controller instanceof M.AIController,role==='ai');
  assertGameStateInvariants(g);
  return {role,key,offered,discardZone:discard.zone,drawnZone:top.zone,libraryChange:size-a.library.length};
}
