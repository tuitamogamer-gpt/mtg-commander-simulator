import assert from 'node:assert/strict';
import {context,settle} from './oracle-v8-fixtures.mjs';
import {put,permanent,total} from './oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';

export async function proveAttackingTokenStatic(M,name,role){
  const {game:g,a,b}=context(M,role),keyword=name==='Bone-Cairn Butcher'?'deathtouch':'flying';
  const lands=Array(8).fill('Mana Confluence').map(card=>permanent(M,g,a,M.DEFS[card]));
  const cast=async name=>{const card=put(M,a,name,'hand');assert.equal(await g.castSpell(a,card,{from:'hand'}),true,'native paid '+name);await settle(g);return card;};
  await cast('Raise the Alarm');const tokens=g.creatures(a).filter(card=>card.isToken);assert.equal(tokens.length,2);
  const [attacker,idle]=tokens,ordinary=await cast('Grizzly Bears'),source=await cast(name);
  permanent(M,g,b,M.DEFS.Plains);permanent(M,g,b,M.DEFS.Plains);const foreignSpell=put(M,b,'Raise the Alarm','hand');assert.equal(await g.castSpell(b,foreignSpell,{from:'hand'}),true);await settle(g);const foreign=g.creatures(b).find(card=>card.isToken);assert.ok(foreign);
  assert.equal(total(a),0);assert.equal(lands.filter(card=>card.tapped).length,name==='Bone-Cairn Butcher'?8:7,'actual printed spell payments');
  for(const card of [attacker,idle,ordinary,foreign])assert.equal(card.kw(keyword),false,'idle creatures receive no attacking-token bonus');
  g.turnNo++;await g.runBeginningPhase(a);await settle(g);
  const prior=a.controller.decide.bind(a.controller);a.controller.decide=(game,q)=>{
    if(q.type!=='attackers')return prior(game,q);
    assert.ok(q.eligible.includes(attacker)&&q.eligible.includes(ordinary));
    const eligible=[attacker,ordinary];
    return role==='human'?eligible.map(card=>({card,target:b})):prior(game,{...q,eligible,forced:eligible,opponents:[b],attackTargets:[b]});
  };
  let observed=false;const emit=g.emit.bind(g);g.emit=async(event,data,...args)=>{
    const result=await emit(event,data,...args);
    if(event==='attackersDeclared'&&data.player===a){
      observed=true;assert.equal(attacker.attacking===b,true);assert.equal(ordinary.attacking===b,true);g.recalc();
      assert.equal(attacker.kw(keyword),true,'native attacking token receives the static ability');
      assert.equal(idle.kw(keyword),false,'nonattacking token excluded');assert.equal(ordinary.kw(keyword),false,'attacking nontoken excluded');assert.equal(foreign.kw(keyword),false,'other controller token excluded');
      const removal=put(M,b,'Into the Roil','hand');permanent(M,g,b,M.DEFS.Island);permanent(M,g,b,M.DEFS.Island);
      const decide=b.controller.decide.bind(b.controller);b.controller.decide=(game,q)=>q.type==='chooseTargets'?Promise.resolve([source]):decide(game,q);
      assert.equal(await g.castSpell(b,removal,{from:'hand'}),true);await settle(g);
      assert.equal(source.zone,'hand');assert.equal(total(b),0);assert.equal(attacker.kw(keyword),false,'actual paid source removal ends the bonus during combat');
    }
    return result;
  };
  await g.combatPhase(a);await settle(g);assert.equal(observed,true);assert.equal(attacker.kw(keyword),false);
  assert.equal(a.controller instanceof M.AIController,role==='ai');assertGameStateInvariants(g);
  return {name,role,keyword,pass:true};
}
