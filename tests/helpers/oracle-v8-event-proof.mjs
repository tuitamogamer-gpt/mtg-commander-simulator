import assert from 'node:assert/strict';

// Events are exercised through the same engine operations used by gameplay.
// Synthetic objects provide qualifying public characteristics; the imported
// card's implementation is never changed to make its predicate pass.
export async function fireV8Event(MTG,ctx,source,operation,h){
  const {game,a,b}=ctx,f=operation.eventFilter,event=operation.event;
  if(f?.kind!=='v8-event')return false;
  const player=f.player==='opponent'||['damageToPlayer','combatDamageToPlayer'].includes(event)&&f.player!=='you'?b:a;
  let card;
  if(f.attachedSource&&!source.attachedTo){const host=h.stageGenericTarget(MTG,ctx,{what:'creature',controller:'you'},'v8-damage-host');host.def.power='2';game.recalc();await game.attach(source,host);}
  if(f.sourceSubject==='attached'&&!source.attachedTo){const host=h.stageGenericTarget(MTG,ctx,{what:'creature',controller:'you'},'v8-combat-host');await game.attach(source,host);}
  if(f.sourceField){
    const participant=f.sourceSubject==='attached'?game.byIid(source.attachedTo):source;
    card=h.stageGenericTarget(MTG,ctx,{what:'creature',...f.target,controller:participant.ctrl===a?'opponent':'you'},'v8-combat-other');
  }else if(f.subject==='self')card=source;
  else if(f.subject==='attached'){
    card=game.byIid(source.attachedTo)||h.stageGenericTarget(MTG,ctx,f.target||{what:'creature',controller:'you'},'v8-attached');
    if(!source.attachedTo)await game.attach(source,card);
  }else if(f.field!=='so'&&event!=='cast'&&!['lifeGain','lifeLost','crime','scry'].includes(event)){
    const nestedController=f.target?.alternatives?.find(filter=>filter.controller&&filter.controller!=='any')?.controller;
    const controller=f.target?.controller&&f.target.controller!=='any'?f.target.controller:nestedController||(['targeted','damageToPlayer','combatDamageToPlayer'].includes(event)?'you':player===a?'you':'opponent');
    card=h.stageGenericTarget(MTG,ctx,{what:event==='landPlayed'?'land':'creature',...f.target,controller},'v8-event');
  }
  if(card){
    h.stageEventConditions?.(MTG,ctx,card,operation);
    ctx.eventCard=card;ctx.eventController=card.ctrl;ctx.eventCardBefore=h.cardState(card);
    ctx.eventCardStats={power:card.power,toughness:card.toughness,mv:card.mv};
  }
  ctx.eventPlayer=player;ctx.eventAmount=f.minAmount||Math.min(2,f.maxAmount??2);
  const n=ctx.eventAmount;
  if(event==='cardToGraveyard'){
    if(card.zone!==(f.from||'library'))await game.move(card,f.from||'library');
    await game.move(card,'graveyard');
  }else if(event==='cardLeftGraveyard'){
    if(card.zone!=='graveyard')await game.move(card,'graveyard');
    await game.move(card,f.to||'exile');
  }else if(event==='etb'){
    if(card.zone==='battlefield')await game.move(card,'hand');
    await game.move(card,'battlefield',{ctrl:card.ctrl});
  }else if(event==='dies')await game.move(card,'graveyard');
  else if(event==='lto')await game.move(card,'exile');
  else if(event==='sacrificed')await game.sacrifice(card.ctrl,card);
  else if(event==='discarded'){
    if(card.zone!=='hand')await game.move(card,'hand');await game.discard(card.owner,[card]);
  }else if(event==='landPlayed'){
    if(card.zone!=='hand')await game.move(card,'hand');game.turnPlayer=card.owner;game.phase='main1';card.owner.landsPlayed=0;
    assert.equal(await game.playLand(card.owner,card),true);
  }else if(event==='cycled'){
    if(card!==source)card.def={...card.def,cycling:{cost:'{1}'}};
    if(card.zone!=='hand')await game.move(card,'hand');
    const action=game.activatableList(card.owner).find(row=>row.card===card&&row.cycling);assert.ok(action,'v8 paid cycling action');
    assert.equal(await game.activateAbility(card.owner,action),true);
  }else if(event==='cast'){
    const so=await h.stageGenericStackTarget(MTG,{...ctx,b:player,preserveCastTurn:operation.condition?.kind==='your-turn'},f.target||{what:'spell',zone:'stack'},'v8-cast');
    ctx.eventCard=so.card;ctx.eventCardBefore=h.cardState(so.card);ctx.eventCardStats={power:so.card.power,toughness:so.card.toughness,mv:so.card.mv};ctx.eventController=player;
  }else if(event==='countersPlaced')game.addCounters(card,f.counter||'charge',n,false,player);
  else if(event==='countersRemoved'){
    card.counters[f.counter||'charge']=f.zeroRemaining?n:n+1;game.recalc();game.removeCounters(card,f.counter||'charge',n);
  }else if(event==='becameTapped'){
    card.tapped=false;delete card.meta._tappedTurn;game.tap(card);
  }else if(event==='becameUntapped'){card.tapped=true;game.untap(card);}
  else if(event==='targeted'){
    h.fund(player,100);
    const spell=h.zoneCard(MTG,player,h.fixtureDefinition('V8 targeting event',['Instant'],{cost:'{1}',kws:['flash'],targets:[{what:'permanent',filter:(g,c)=>c===card}],resolve:async()=>{}}),'hand');
    assert.equal(await game.castSpell(player,spell,{from:'hand'}),true);
  }else if(['dealtDamage','damageToPlayer','combatDamageToPlayer'].includes(event)){
    const origin=f.sourceSelf?source:f.attachedSource?game.byIid(source.attachedTo):f.field==='target'?h.permanent(MTG,game,b,h.fixtureDefinition('V8 damage origin',['Creature'],{power:String(n),toughness:'20'})):card;
    const recipient=event==='dealtDamage'&&f.field!=='src'?card:player;
    assert.ok(origin&&recipient,'v8 damage event has both objects');
    if(event==='combatDamageToPlayer'){
      origin.attacking=recipient;origin.sick=false;origin.blockedBy=[];origin.wasBlocked=false;
      if(!(origin.power>0)&&origin!==source){origin.def.power=String(n);game.recalc();}
      ctx.eventAmount=origin.power;game.combat={attackers:[origin],defenders:new Map()};await game.combatDamage(origin.ctrl,'normal');
    }else await game.damageAny(origin,recipient,n,{combat:!!f.combat,deferSBA:true});
  }else if(event==='attacks'){
    card.attacking=card.ctrl===a?b:a;await game.emit('attacks',{card,player:card.ctrl,defender:card.attacking});
  }else if(['blocks','becomesBlocked','becomesBlockedByCreature'].includes(event)){
    // These are the exact object bindings emitted after a legal declaration.
    // The combat-rule matrix separately exercises full blocker selection.
    const objects={[f.field||'card']:card};
    if(f.sourceField)objects[f.sourceField]=f.sourceSubject==='attached'?game.byIid(source.attachedTo):source;
    let attacker=objects.attacker,blocker=objects.blocker;
    if(!attacker)attacker=h.stageGenericTarget(MTG,ctx,{what:'creature',controller:blocker?.ctrl===a?'opponent':'you'},'v8-attacker');
    if(!blocker)blocker=h.stageGenericTarget(MTG,ctx,{what:'creature',...f.blockerTarget,controller:attacker.ctrl===a?'opponent':'you'},'v8-blocker');
    attacker.attacking=blocker.ctrl;attacker.blockedBy=[blocker];attacker.wasBlocked=true;blocker.blocking=attacker.iid;
    ctx.eventDefender=blocker.ctrl;
    game.combat={attackers:[attacker],defenders:new Map([[blocker.ctrl,[attacker]]])};
    if(f.playerField==='defender')ctx.eventPlayer=blocker.ctrl;
    await game.emit(event,{attacker,blocker,blockers:attacker.blockedBy});
  }else if(event==='attackersDeclared'){
    const count=f.totalMax===1?1:Math.max(f.totalMin||1,f.minMatching||1),attackers=[];
    if(f.selfAttacking||f.subject==='self')attackers.push(source);
    while(attackers.length<count)attackers.push(h.stageGenericTarget(MTG,ctx,{what:'creature',controller:player===a?'you':'opponent',...f.target},'v8-attack-'+attackers.length));
    for(const attacker of attackers)attacker.attacking=f.defendingYou?a:player===a?b:a;
    if(attackers.length===1){ctx.eventCard=attackers[0];ctx.eventCardBefore=h.cardState(attackers[0]);ctx.eventCardStats={power:attackers[0].power,toughness:attackers[0].toughness};}
    await game.emit('attackersDeclared',{player,attackers});
  }else if(event==='lifeGain')await game.gainLife(player,n,source);
  else if(event==='lifeLost')await game.loseLife(player,n,'V8 event proof');
  else if(event==='draw')await game.draw(player,1,source);
  else if(event==='scry')await MTG.E.scry(game,player,1);
  else if(event==='turnedFaceUp')await game.emit('turnedFaceUp',{card,player:card.ctrl,x:3});
  else if(event==='crime')await game.emit('crime',{player});
  else if(event==='abilityActivated'){
    const ability={label:'V8 event fixture ability',cost:{mana:'{1}'},run:async()=>{}};
    game.untilEffects.push({apply:(g,bf)=>{if(bf.includes(card))card.cur.extraAbilities.push(ability);}});game.recalc();
    const action=game.activatableList(card.ctrl).find(row=>row.card===card&&row.ability===ability);assert.ok(action);
    assert.equal(await game.activateAbility(card.ctrl,action),true);
  }else assert.fail('Missing v8 event action '+event);
  return true;
}
