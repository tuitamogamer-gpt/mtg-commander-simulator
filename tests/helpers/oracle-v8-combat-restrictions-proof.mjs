import assert from 'node:assert/strict';

export async function combatExtraProof(M,ctx,card,rule,h,label) {
  if (!['required-block','source-block','defender-permission','assign-unblocked','assign-toughness'].includes(rule?.kind)) return null;
  const {game,a,b}=ctx, opponent=card.ctrl===a?b:a;
  const make=(name,player=opponent,fields={})=>h.permanent(M,game,player,h.fixtureDefinition(name,['Creature'],{power:'1',toughness:'30',kws:card.kw('shadow')?['shadow']:[],...fields}));
  card.tapped=false;card.sick=false;
  if(rule.kind==='assign-toughness'){
    assert.ok(card.cur.toughnessAssignmentRules?.some(row=>JSON.stringify(row)===JSON.stringify(rule)),label+': live toughness assignment rule');
    const active=!rule.requires||(rule.requires==='toughness-greater'?card.toughness>card.power:card.kw(rule.requires));
    if(active&&!card.kw('first strike')&&!card.meta._dealtFirstStrike)assert.equal(game.dmgAmount(card,'normal'),Math.max(0,card.toughness),label+': actual combat damage uses toughness');
    if(rule.defenderPermission&&card.kw('defender')&&!card.cur.cantAttack)assert.equal(game.canAttackAtAll(card),true,label+': defender can attack');
    return 2;
  }
  if(rule.kind==='defender-permission'){
    assert.equal(card.cur.defenderCanAttack,true,label+': live defender permission');
    if(!card.cur.cantAttack)assert.equal(game.canAttackAtAll(card),true,label+': declaration allows defender');
    return 2;
  }
  if(rule.kind==='source-block'){
    const record=game.untilEffects.find(row=>row.kind==='oracleCombatRestriction'&&row.iid===card.iid&&row.zoneVersion===card.zoneVersion&&row.restriction.combatRule?.kind==='source-block');
    assert.ok(record,label+': resolved restriction is bound to its source');
    const lock=record.restriction.combatRule.source,source=lock&&game.byIid(lock.iid);
    if(!lock){assert.equal(source,null);return 1;}
    assert.equal(source.zoneVersion,lock.version);
    const other=make('Unrelated attacking creature');
    if(rule.mode==='forbid'){
      assert.equal(game.canBlock(card,source),false,label+': related attacker cannot be blocked');
      assert.equal(!!card.cur.cantBlockCreature(game,other),false,label+': restriction does not refer to an unrelated attacker');
    }else{
      assert.ok(card.cur.requiredBlockSources.some(row=>row.iid===source.iid&&row.version===source.zoneVersion));
      assert.ok(M.OracleV8CombatRestrictions.score([card],[{blocker:card,attacker:source}])>=1,label+': real source block fulfils requirement');
      assert.equal(M.OracleV8CombatRestrictions.score([card],[{blocker:card,attacker:other}]),card.cur.mustBlock?1:0,label+': unrelated block does not fulfil source requirement');
    }
    return 3;
  }
  const attacker=make('Required combat attacker');
  if(rule.kind==='required-block'){
    card.attacking=null;attacker.attacking=card.ctrl;attacker.blockedBy=[];
    assert.equal(card.cur.mustBlock,true,label+': live block requirement');
    const canBlock=game.canBlock(card,attacker);
    const proposal=await card.ctrl.controller.decide(game,{type:'blockers',attackers:[attacker],potential:[card],player:card.ctrl});
    for(const pair of Array.isArray(proposal)?proposal:[])if(pair.blocker===card&&pair.attacker===attacker&&canBlock)attacker.blockedBy.push(card);
    game.completeRequiredBlocks([attacker],[card]);
    assert.equal(attacker.blockedBy.includes(card),canBlock,label+': actual controller declaration maximizes legal requirements');
    return 3;
  }
  assert.equal(card.cur.mayAssignUnblocked,true,label+': printed damage choice exists');
  card.attacking=opponent;card.blockedBy=[attacker];card.wasBlocked=true;
  const amount=Math.max(1,game.dmgAmount(card,'normal'));
  const original=opponent.life;opponent.life=1;
  const picked=await M.OracleV8CombatRestrictions.assignUnblocked(game,card,[attacker],amount);
  if(card.ctrl.isAI)assert.equal(picked,true,label+': actual local bot chooses lethal damage through blocker');
  else assert.equal(typeof picked,'boolean',label+': human receives an optional choice');
  opponent.life=original;return 2;
}
