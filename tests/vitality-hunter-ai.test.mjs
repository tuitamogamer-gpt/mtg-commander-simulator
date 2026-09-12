import test from 'node:test';
import assert from 'node:assert/strict';
import {M,setup,card,body,fuel,settle} from './helpers/c19-c20-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

for(const difficulty of ['normal','hard']) {
  test(`${difficulty}: both AI scorers handle Vitality Hunter and activate monstrosity once`,async()=>{
    const f=setup('ai'),hunter=card(f,'Vitality Hunter'),target=body(f);
    fuel(f.a);
    f.decide=(_player,q)=>q.type==='chooseX'?2:q.type==='chooseTargets'?[target]:undefined;
    const entry=f.game.activatableList(f.a).find(e=>e.card===hunter);
    assert.ok(entry);
    const legacy=new M.AIController(f.a,{difficulty,style:'balanced'});
    assert.equal(legacy.activationScore(f.game,entry),5);
    const decision=await M.chooseBotAction({
      gameState:f.game,botPlayerId:f.a.idx,difficulty,seed:11148,forceSearch:false,
      actionWindow:{type:'main',player:f.a,casts:[],acts:[entry],lands:[],phase:f.game.phase},
    });
    assert.equal(decision.log.fallback,false);
    const action=M.unwrapBotDecisionAction(decision.action);
    assert.equal(action.kind,'activate');
    assert.equal(await f.game.performAction(f.a,action),true);
    await settle(f.game);
    assert.equal(hunter.meta.oracleMonstrous,true);
    assert.equal(hunter.counters['+1/+1'],2);
    assert.equal(target.counters.lifelink,1);
    assert.equal(legacy.activationScore(f.game,entry),0);
    assertGameStateInvariants(f.game);
  });
}
