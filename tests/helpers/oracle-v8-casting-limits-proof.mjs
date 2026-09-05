import assert from'node:assert/strict';
export function stageCastingLimitCondition(M,{game,a,b},condition){
 if(condition?.kind==='casting-spell-history-v8'){a.turnState.spellsCastList.push({colors:[condition.color]});return true;}
 if(condition?.kind!=='casting-window-v8')return false;
 game.turnPlayer=condition.turn==='opponent'||condition.attacked?b:a;
 const state=game.turnPlayer.turnState;
 game.phase=condition.window==='turn'?'main1':'combat';
 game.step=condition.window==='before-damage'?'blockers':condition.window==='after-blockers'?'blockers':condition.window==='combat'?'begin':condition.window;
 state.combatPhaseCount=1;state.reachedCombatDamageDeadline=false;
 game.combat={attackers:[],declaredAttackTargets:condition.attacked?[a]:[],blockersDeclared:condition.window==='after-blockers',hadAttackers:true};
 return true;
}
export function stageFalseCastingLimitCondition(M,{game,a,b},condition){
 if(condition?.kind==='casting-spell-history-v8'){a.turnState.spellsCastList=[];return;}
 if(condition?.kind!=='casting-window-v8')return;
 game.phase='main2';game.step='';game.combat=null;
 game.turnPlayer=condition.turn==='you'?b:a;
}
export async function spellLimitProof(M,entry,op,role,h){
 const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
 h.fund(a,100);h.fund(b,100);h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);
 const source=h.zoneCard(M,a,entry.raw.name,'hand');
 assert.equal(await game.castSpell(a,source,{from:'hand'}),true,source.name+': printed source is paid and cast');await h.resolveAll(game);
 const own=h.zoneCard(M,a,'Lightning Bolt','hand');
 assert.equal(a.turnState.spellsCast,1);assert.equal(game.canCastTiming(a,own),false);
 const before=Object.values(a.pool).reduce((a,b)=>a+b,0);
 assert.equal(await game.castSpell(a,own,{from:'hand',free:true}),false);assert.equal(own.zone,'hand');assert.equal(Object.values(a.pool).reduce((a,b)=>a+b,0),before);
 const other=h.zoneCard(M,b,'Lightning Bolt','hand');
 assert.equal(await game.castSpell(b,other,{from:'hand',quickTargets:[a]}),true,source.name+': opponent first spell allowed');await h.resolveAll(game);
 const second=h.zoneCard(M,b,'Lightning Bolt','hand');assert.equal(game.canCastTiming(b,second),op.players==='you');
 await game.move(source,'graveyard');assert.equal(game.canCastTiming(a,own),true);
 assert.equal(await game.castSpell(a,own,{from:'hand',quickTargets:[b]}),true);await h.resolveAll(game);return 10;
}
