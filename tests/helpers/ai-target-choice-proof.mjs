import assert from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {put,permanent,choose,total} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';

export async function proveAITargetChoice(M,name,role,alternate){
  const {game:g,a,b}=context(M,role),spell=put(M,a,name,'hand');
  if(name==='Explosive Getaway'){
    const lands=['Plains','Mountain','Forest','Forest','Forest'].map(name=>permanent(M,g,a,M.DEFS[name]));
    const saved=permanent(M,g,a,M.DEFS['Grizzly Bears']),collateral=permanent(M,g,a,M.DEFS['Grizzly Bears']),survivor=permanent(M,g,b,M.DEFS['Colossal Dreadmaw']),artifact=permanent(M,g,b,M.DEFS['Lightning Greaves']);
    choose(a,q=>q.type==='chooseTargets'?{...q,candidates:alternate?[saved]:[],min:alternate?1:0,max:alternate?1:0}:null);
    assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);await settle(g);
    assert.equal(total(a),0);assert.equal(lands.every(card=>card.tapped),true,'five real lands pay the printed cost');
    assert.equal(saved.zone,alternate?'exile':'graveyard');assert.equal(collateral.zone,'graveyard');assert.equal(survivor.damage,4);assert.equal(survivor.zone,'battlefield');assert.equal(artifact.zone,'battlefield');
    assert.equal(spell.zone,'graveyard');await g.emit('endStep',{player:a});await settle(g);
    assert.equal(saved.zone,alternate?'battlefield':'graveyard');assert.equal(saved.damage,0);assert.equal(survivor.damage,4);
  }else if(name==='Floodbringer'){
    const lands=Array.from({length:4},()=>permanent(M,g,a,M.DEFS.Island)),returned=permanent(M,g,a,M.DEFS.Forest),opponent=permanent(M,g,b,M.DEFS.Forest),target=alternate?returned:opponent;
    choose(a,q=>{
      if(q.type==='chooseTargets')return {...q,candidates:q.candidates.filter(card=>card===target),min:1,max:1};
      if(q.type==='chooseCards'&&q.prompt===name+': return 1 permanent to hand')return {...q,from:[returned],min:1,max:1};
      return null;
    });
    assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);await settle(g);
    assert.equal(spell.zone,'battlefield');assert.equal(total(a),0);assert.equal(lands.filter(card=>card.tapped).length,2);
    const action=g.activatableList(a).find(row=>row.card===spell&&!row.manaAbility);assert.ok(action);
    assert.equal(await g.activateAbility(a,action),true);
    assert.equal(returned.zone,'hand','native return-land cost is paid before resolution');assert.equal(total(a),0);assert.equal(lands.every(card=>card.tapped),true,'two additional Islands pay the activation');
    const object=g.stack.find(row=>row.srcCard===spell);assert.ok(object);assert.equal(object.targets[0]===target,true);
    await settle(g);assert.equal(returned.tapped,false);assert.equal(opponent.zone,'battlefield');assert.equal(opponent.tapped,!alternate,'returning the sole targeted land makes the ability fail to resolve');
  }else throw Error('Unexpected target-choice card '+name);
  assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
  return {name,role,alternate,pass:true};
}
