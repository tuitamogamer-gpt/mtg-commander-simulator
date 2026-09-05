import assert from 'node:assert/strict';
import { stageCondition } from './oracle-v5-proof.mjs';

function stageBoundEventCondition(MTG,ctx,source,card,condition,h){
  if(condition?.kind!=='v8-event-condition'||!card)return;
  const {game,a}=ctx,predicate=condition.predicate;
  if(predicate==='past-counters'){
    if(condition.counter)card.counters[condition.counter]=condition.min??0;
    else if(condition.max===0)card.counters={};
    else card.counters.charge=Math.max(1,condition.min||1);
  }else if(predicate==='past-blocking')card.blocking=condition.negate?null:source.iid;
  else if(['past-quality','live-quality','past-historic'].includes(predicate)&&!card.def.oracleImplementation){
    const filter=predicate==='past-historic'?{what:'artifact',zone:'battlefield',controller:'you'}:condition.filter;
    const sample=h.stageGenericTarget(MTG,ctx,filter,'v8-bound-quality');
    card.def={...sample.def,name:card.def.name};card.isToken=sample.isToken;
    game.battlefield.splice(game.battlefield.indexOf(sample),1);
  }else if(predicate==='past-owned-aura'){
    const aura=h.permanent(MTG,game,a,h.fixtureDefinition('V8 bound Aura',['Enchantment'],{subtypes:['Aura']}));
    aura.attachedTo=card.iid;card.attachments.push(aura.iid);
  }else if(predicate==='live-stats'&&!card.def.oracleImplementation)card.def={...card.def,power:String(condition.power),toughness:String(condition.toughness)};
  else if(predicate==='greater-than-source'&&!card.def.oracleImplementation)card.def={...card.def,power:String(source.power+1),toughness:'20'};
  else if(predicate==='entered-turn')card.meta._enteredTurn=game.turnNo;
  else if(predicate==='live-keyword'){
    if(condition.negate)delete card.counters[condition.keyword];else card.counters[condition.keyword]=1;
  }
  game.recalc();
}

// Events are exercised through the same engine operations used by gameplay.
// Synthetic objects provide qualifying public characteristics; the imported
// card's implementation is never changed to make its predicate pass.
export async function fireV8Event(MTG,ctx,source,operation,h){
  const {game,a,b}=ctx,f=operation.eventFilter,event=operation.event,bound=operation.condition?.kind==='v8-event-condition'?operation.condition:null;
  if(f?.kind!=='v8-event')return false;
  if(f.headerCondition)stageCondition(MTG,ctx,f.headerCondition,source,h);
  const player=f.declaredDefender==='you'||f.player==='opponent'||['damageToPlayer','combatDamageToPlayer'].includes(event)&&f.player!=='you'?b:a;
  let card;
  if(f.attachedSource&&!source.attachedTo){const host=h.stageGenericTarget(MTG,ctx,{what:'creature',controller:'you'},'v8-damage-host');host.def.power='2';game.recalc();await game.attach(source,host);}
  if(f.attachedAttacking&&!source.attachedTo){const host=h.stageGenericTarget(MTG,ctx,{what:'creature',controller:'you'},'v8-battalion-host');await game.attach(source,host);}
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
    const controller=f.damageSourceController&&f.damageSourceController!=='any'?f.damageSourceController:
      f.target?.controller&&f.target.controller!=='any'?f.target.controller:nestedController||
      (event==='attacks'&&['you','you-or-your-planeswalker'].includes(f.defender)?'opponent':
        ['targeted','damageToPlayer','combatDamageToPlayer'].includes(event)?'you':player===a?'you':'opponent');
    // A source-quality descriptor uses the graveyard card grammar so that an
    // instant, artifact, or creature is all expressible. Its damage event still
    // originates from the source's actual battlefield/Stack incarnation.
    card=h.stageGenericTarget(MTG,ctx,{what:event==='landPlayed'?'land':'creature',...f.target,
      ...(f.damageSourceController?{zone:'battlefield'}:{}),controller},'v8-event');
  }
  if(card){
    if(f.subject==='attached'&&!card.def.oracleImplementation&&/"kind":"event-card-stat"/.test(JSON.stringify(operation.effects||[]))){
      // Generic defensive fixtures have enormous power/toughness so ordinary
      // removal probes survive. A host-stat token/library ability must instead
      // exercise a small real cohort, rather than create twenty thousand tokens.
      card.def={...card.def,power:'3',toughness:'5'};game.recalc();
    }
    h.stageEventConditions?.(MTG,ctx,card,operation);
    stageBoundEventCondition(MTG,ctx,source,card,bound,h);
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
    if(f.enteredTapped===false){
      const entryRule=card.def.oracleImplementation?.find(operation=>operation.kind==='conditional-enters-tapped'&&operation.condition==='generic');
      if(entryRule)stageCondition(MTG,ctx,entryRule.untappedCondition,card,h);
    }
    await game.move(card,'battlefield',{ctrl:card.ctrl});
  }else if(event==='dies'){
    if(f.damageByThisTurn){
      const damagingSource=f.damageByThisTurn==='attached'?game.byIid(source.attachedTo):source;
      assert.ok(damagingSource,'historical-damage trigger has its actual source');
      assert.equal(await game.damageCreature(damagingSource,card,1,{deferSBA:true}),1,'positive actual damage establishes the prerequisite');
    }
    await game.move(card,'graveyard');
  }
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
    let so;
    if(f.castTarget||f.castTargetsSelf||f.castOrdinal||f.castMinimumOrdinal||f.castKicked||f.castAdventure||bound){
      const ordinal=f.castOrdinal||f.castMinimumOrdinal;
      if(ordinal&&player.turnState.spellsCast>=ordinal){game.turnNo++;for(const participant of game.players)participant.turnState=participant.freshTurnState();}
      const savedTurn=game.turnPlayer,savedPhase=game.phase;
      game.turnPlayer=bound?.predicate==='caster-not-turn'?(player===a?b:a):player;game.phase='main1';h.fund(player,100);
      try{
        while(ordinal&&player.turnState.spellsCast<ordinal-1){
          const primer=h.zoneCard(MTG,player,h.fixtureDefinition('Cast ordinal primer',['Instant'],{cost:'{0}',resolve:async()=>{}}),'hand');
          assert.equal(await game.castSpell(player,primer,{from:'hand'}),true,'ordinal priming uses an actual cast');
        }
        const filter=f.target?.spellFilter?.alternatives?.[0]||f.target?.spellFilter;
        const type=f.castAdventure?'Creature':filter?.what==='enchantment'?'Enchantment':'Instant';
        const target=f.castTargetsSelf?source:f.castTarget?h.stageGenericTarget(MTG,ctx,f.castTarget,'v8-cast-target'):null;
        const subtypes=filter?.subtype?[filter.subtype]:[];
        const candidate=h.zoneCard(MTG,player,h.fixtureDefinition('V8 qualified cast',[type],{
          cost:'{'+(bound?.predicate==='cast-mana'?bound.min:bound?.predicate==='cast-mana-vs-source-power'?Math.max(1,source.power+1):0)+'}',subtypes,power:'2',toughness:'20',
          ...(subtypes.includes('Aura')?{aura:true}:{}),
          ...(target?{targets:[{what:'permanent',filter:(g,c)=>c===target}]}:{}),
          ...(f.castKicked||bound?.predicate==='cast-kicked'?{kicker:{cost:'{0}'}}:{}),
          ...(f.castAdventure?{adventure:{adventure:true,name:'V8 adventure',cost:'{0}',altCostStr:'{0}',types:'Sorcery',resolve:async()=>{}}}:{}),
          resolve:async()=>{},
        }),'hand');
        const emit=game.emit.bind(game);
        game.emit=async(name,data)=>{if(name==='cast'&&data.so?.card===candidate)so=data.so;return emit(name,data);};
        try{assert.equal(await game.castSpell(player,candidate,{from:'hand'}),true,'qualified event uses the real paid cast');}finally{game.emit=emit;}
        assert.ok(so,'qualified cast was emitted');
        if(f.castKicked||bound?.predicate==='cast-kicked')assert.equal(so.kicked,true,'the controller chose the actual kicker payment');
      }finally{game.turnPlayer=bound?.predicate==='caster-not-turn'?(player===a?b:a):savedTurn;game.phase=savedPhase;}
    }else so=await h.stageGenericStackTarget(MTG,{...ctx,b:player,preserveCastTurn:operation.condition?.kind==='your-turn'},f.target||{what:'spell',zone:'stack'},'v8-cast');
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
      if(origin!==source&&!origin.def.oracleImplementation&&f.target?.stat!=='power'){origin.def.power=String(n);game.recalc();}
      ctx.eventAmount=origin.power;game.combat={attackers:[origin],defenders:new Map()};await game.combatDamage(origin.ctrl,'normal');
    }else await game.damageAny(origin,recipient,n,{combat:!!f.combat,deferSBA:true});
  }else if(event==='attacks'){
    card.attacking=f.defender==='you'||f.defender==='you-or-your-planeswalker'?a:f.defender==='opponent'?b:card.ctrl===a?b:a;
    ctx.eventPlayer=f.playerField==='defender'?card.attacking:card.ctrl;
    game.combat={...(game.combat||{}),attackers:[card],defenders:new Map([[card.attacking,[card]]]),declaredAttackTargets:[card.attacking]};
    game.recalc();
    await game.emit('attacks',{card,player:card.ctrl,defender:card.attacking,firstThisTurn:game.recordCombatObjectEvent(card,'attacks')===1});
  }else if(['blocks','becomesBlocked','becomesBlockedByCreature'].includes(event)){
    // These are the exact object bindings emitted after a legal declaration.
    // The combat-rule matrix separately exercises full blocker selection.
    const objects={[f.field||(event==='blocks'?'blocker':'attacker')]:card};
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
    const separateSource=f.selfAttacking&&f.subject==='another'?1:0;
    const count=f.totalMax===1?1:Math.max(f.totalMin||1,(f.minMatching||1)+separateSource,f.minOtherThanAttached?f.minOtherThanAttached+1:1),attackers=[];
    if(f.selfAttacking||f.subject==='self')attackers.push(source);
    if(f.attachedAttacking)attackers.push(game.byIid(source.attachedTo));
    while(attackers.length<count)attackers.push(h.stageGenericTarget(MTG,ctx,{what:'creature',controller:player===a?'you':'opponent',...f.target},'v8-attack-'+attackers.length));
    for(const attacker of attackers){
      attacker.attacking=f.defendingYou||f.declaredDefender==='you'?a:player===a?b:a;
      if(f.attackerStatus==='suspected')attacker.meta.suspected=true;
      if(f.attackerStatus==='enchanted-by-you'){
        const aura=h.stageGenericTarget(MTG,ctx,{what:'permanent',zone:'battlefield',controller:'you'},'v8-attack-aura');
        aura.def={...aura.def,types:['Enchantment'],subtypes:['Aura']};game.recalc();await game.attach(aura,attacker);
      }
    }
    game.combat={...(game.combat||{}),attackers,defenders:new Map()};
    game.recalc();
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
