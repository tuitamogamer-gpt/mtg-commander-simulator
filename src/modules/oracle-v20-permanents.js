'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,V=M.OracleV20;
 const live=card=>card?.zone==='battlefield'&&!card.phasedOut;
 const active=card=>live(card)&&!card.cur?.abilitiesDisabled;
 const chosenPlayer=(game,source)=>live(source)&&source.meta.oracleChosenOpponentV20?.version===source.zoneVersion?game.players.find(player=>!player.lost&&player.idx===source.meta.oracleChosenOpponentV20.player):null;
 const chosenObject=(game,source)=>{const row=source.meta.oracleChosenObjectV20,card=row&&game.byIid(row.iid);return row?.version===source.zoneVersion&&live(card)&&card.zoneVersion===row.objectVersion?card:null;};
 const departureEvents=new Set(['dies','lto','sacrificed','exploited','zkExiled','permanentUnattachedV20']);
 const asSnapshot=(card,snap)=>!snap?card:{...snap,_oracleLKI:true,zone:'battlefield',phasedOut:false,owner:card.owner,meta:snap.sourceMeta,def:snap.def||card.def,cur:{super:snap.super||[],abilitiesDisabled:snap.abilitiesDisabled},is:type=>(snap.types||[]).includes(type),hasSub:type=>(snap.subtypes||[]).includes(type)||!!snap.changeling&&M.CREATURE_SUBTYPES.has(type),kw:keyword=>(snap.kw||[]).includes(keyword)};
 const linked=(game,source,link)=>[...new Set((game.oracleLinkedExiles||[]).filter(row=>row.sourceIid===source.iid&&row.sourceZoneVersion===source.zoneVersion&&(!link||row.link===link)&&row.lifetime===(source.isCopyOf?'copy:'+(source.copyEpoch||0):'native')).flatMap(row=>row.cards||[]).filter(row=>row.card.zone==='exile'&&row.card.zoneVersion===row.zoneVersion).map(row=>row.card))];
 const received=(game,card,snapshot)=>{const row=snapshot?.sourceMeta?.oracleReceivedDamageV20||card.meta?.oracleReceivedDamageV20;return row?.turn===game.turnNo?row.n:0;};
 function hasAbilities(card){
  if(card.cur?.kw?.size||card.cur?.extraAbilities?.length||card.cur?.extraTriggers?.length||card.cur?.extraMana?.length||card.cur?.wardCost||card.cur?.extraWards?.length)return true;
  if(card.cur?.abilitiesDisabled)return false;
  const d=card.def;
  return !!(d.oracle?.trim()||(d.abilities||[]).length||(d.triggers||[]).length||(d.statics||[]).length||d.mana||d.cdaPower||d.cdaToughness||d.changeling||d.protection||d.ward||d.oracleNumericKeywordsV10?.length||d.modular||d.morph||d.equip||d.attachGrant||d.etbCounters);
 }
 function target(game,card,player,source,node){
  if(node.test==='relative-stat'){const right=node.right==='base power'?card.cur.basePower:node.right==='base toughness'?card.cur.baseToughness:card[node.right];return card[node.left]>right;}
  if(node.test==='greatest-stat')return card[node.stat]>=Math.max(...game.bf().filter(c=>c.is('Creature')).map(c=>c[node.stat]));
  if(node.test==='adventure')return !!card.def.adventure;
  if(node.test==='no-abilities')return !hasAbilities(card);
  return undefined;
 }
 function count(game,source,player,node){
  if(node.kind!=='permanent-count-v20')return undefined;
  switch(node.test){
   case 'chosen-player':{const opponent=chosenPlayer(game,source);return opponent?V.helpers.genericCount(game,source,opponent,node.count):0;}
   case 'grave-spells-and-exile-flashback':return player.graveyard.filter(card=>card.is('Instant')||card.is('Sorcery')).length+player.exile.filter(card=>card.def.flashback!==undefined).length;
   case 'life-minus-opponent-max':return player.life-Math.max(...game.alivePlayers().filter(p=>p!==player).map(p=>p.life));
   case 'highest-life':return Math.max(...game.alivePlayers().map(p=>p.life));
   case 'controlled-loyalty':return game.bf().filter(card=>card.ctrl===player&&card.is('Planeswalker')).reduce((n,card)=>n+(card.counters.loyalty||0),0);
   case 'opponent-max-hand':return Math.max(0,...game.alivePlayers().filter(p=>p!==player).map(p=>p.hand.length));
   case 'greater-toughness-creatures':return game.creatures(player).filter(c=>c.toughness>c.power).length;
   case 'attacked-players':return new Set(game.bf().filter(c=>c.is('Creature')&&c.attacking instanceof M.Player).map(c=>c.attacking)).size;
   case 'opponents-lost-life':return game.players.filter(p=>p!==player&&p.turnState.lifeLost>0).length;
   case 'all-life-lost':return game.players.reduce((n,p)=>n+(p.turnState.lifeLost||0),0);
   case 'player-damage':return player.turnState.oracleDamageV20||0;
   case 'cast-types':return new Set(player.turnState.oracleCastTypesV20||[]).size;
   case 'other-named-creatures':return game.bf().filter(c=>c!==source&&c.is('Creature')&&M.OracleV8NameGroups.names(c).includes(node.name)).length;
   default:throw Error('Invalid permanent count '+node.test);
  }
 }
 function condition(game,source,node,player,evidence){
  if(node.kind!=='permanent-condition-v20')return undefined;
  const snapshot=evidence?.departureSnapshotV10||(evidence&&source.zoneVersion!==evidence.zoneVersion?source.battlefieldLKI?.get(evidence.zoneVersion):null);
  switch(node.test){
   case 'event-creature-mana':return (evidence?.eventCreatureManaV20||0)>=node.min;
   case 'cast-ordinal':return (evidence?.castOrdinalV20??source.castMeta?.oracleCastOrdinalV20)===node.n&&(evidence?.castTurnV20??source.castMeta?.oracleCastTurnV20)===game.turnNo&&!!(evidence?.wasCast??source.castMeta?.wasCast);
   case 'borrowed-permanents':return game.bf().filter(card=>card.ctrl===player&&card.owner!==player).length>=node.min;
   case 'not-suspected':return !source.meta.suspected;
   case 'in-own-graveyard':return source.zone==='graveyard'&&source.owner===player&&(!evidence||evidence.zoneVersion===source.zoneVersion);
   case 'graveyard-or-battlefield':return (source.zone==='battlefield'||source.zone==='graveyard'&&source.owner===player)&&(!evidence||evidence.zoneVersion===source.zoneVersion);
   case 'no-ring-bearer':return !game.creatures(player).some(card=>card.meta.ringBearer);
   case 'surveilled':return !!player.turnState.surveilEvents;
   case 'death-not-subtype':return !asSnapshot(source,snapshot).hasSub(node.subtype);
   case 'another-flying-entry':return (player.turnState.oracleFlyingEntriesV20||[]).some(row=>row.iid!==source.iid||row.version!==source.zoneVersion);
   case 'attacked-spacecraft':return !!player.turnState.oracleAttackedSpacecraftV20;
   case 'shared-creature-type':{const cards=game.creatures(player);return [...M.CREATURE_SUBTYPES].some(type=>cards.filter(card=>card.hasSub(type)).length>=(node.min||2));}
   case 'any-player-discarded':return game.players.some(p=>p.turnState.discardedN>0);
   case 'any-player-life-lost':return game.players.some(p=>p.turnState.lifeLost>=node.min);
   case 'ring-bearer':return live(source)&&source.ctrl===player&&!!source.meta.ringBearer;
   case 'never-dealt-damage':return !(snapshot?.sourceMeta||source.meta)?.oracleEverDealtDamageV20;
   case 'only-grave-creature':return source.zone==='graveyard'&&source.owner===player&&(!evidence||evidence.zoneVersion===source.zoneVersion)&&player.graveyard.filter(c=>c.is('Creature')).every(c=>c===source);
   case 'all-nonlands-white':return game.bf().filter(c=>c.ctrl===player&&!c.is('Land')).every(c=>c.colors.includes('W'));
   case 'each-color':return ['W','U','B','R','G'].every(color=>game.bf().some(c=>c.ctrl===player&&c.colors.includes(color)));
   case 'pumped-creature':return game.creatures(player).some(c=>c.power>c.cur.basePower);
   case 'attacker-total':return (game.turnPlayer?.turnState.oracleAttackersV10?.turn===game.turnNo?game.turnPlayer.turnState.oracleAttackersV10.count:0)>=node.min;
   case 'damage-sources':return new Set(player.turnState.oracleDamageSourcesV20||[]).size>=node.min;
   case 'grave-creature-total':return game.players.reduce((n,p)=>n+(p.turnState.oracleGraveEntriesV20||[]).filter(row=>row.types.includes('Creature')).length,0)>=node.min;
   case 'instant-sorcery-cast-total':return (player.turnState.spellsCastList||[]).filter(row=>row.isInstantSorcery).length>=node.min;
   case 'no-suspected-subtype':return !game.creatures(player).some(card=>card.hasSub(node.subtype)&&card.meta.suspected);
   case 'no-permanent-left':return game.players.every(p=>!p.turnState.oracleDeparturesV20?.length);
   case 'grave-entry':return (player.turnState.oracleGraveEntriesV20||[]).some(row=>node.type==='Permanent'?row.types.some(t=>['Artifact','Battle','Creature','Enchantment','Land','Planeswalker'].includes(t)):row.types.includes(node.type));
   case 'departed':return (player.turnState.oracleDeparturesV20||[]).some(row=>!node.type||row.types.includes(node.type));
   case 'died-owned':return game.players.some(p=>(p.turnState.oracleDeparturesV20||[]).some(row=>row.owner===player.idx&&row.to==='graveyard'&&(!node.type||row.types.includes(node.type))));
   case 'creature-died':return game.players.some(p=>(p.turnState.oracleDeparturesV20||[]).some(row=>row.to==='graveyard'&&row.types.includes('Creature')&&(!node.excludeSubtype||!row.changeling&&!row.subtypes.includes(node.excludeSubtype))&&(!node.excludeName||!row.names.includes(node.excludeName))));
   case 'typed-entry':return (player.turnState.oraclePermanentEntries||[]).some(row=>row.types.includes('Creature')&&(row.changeling||node.subtypes.some(type=>row.subtypes.includes(type))));
   case 'attacked-battle':return (snapshot?.sourceMeta||source.meta)?.oracleAttackedBattleV20===game.turnNo;
   case 'soulbond-paired':{const other=M.OracleV8Soulbond.partner(game,source);return !!other&&!other.cur.abilitiesDisabled&&other.def.oracleImplementation?.some(op=>op.kind==='soulbond-v8');}
   case 'unlocked-doors':return game.bf().filter(c=>c.ctrl===player&&c.hasSub('Room')).reduce((n,c)=>n+(c.meta.bdfUnlocked||c.meta.unlocked||[]).length,0)>=node.min;
   case 'party-entry':return (player.turnState.oraclePermanentEntries||[]).some(row=>(row.iid!==source.iid||row.version!==source.zoneVersion)&&row.types.includes('Creature')&&(row.changeling||['Cleric','Rogue','Warrior','Wizard'].some(type=>row.subtypes.includes(type))));
   case 'entries':return (player.turnState.oraclePermanentEntries||[]).filter(row=>!node.type||row.types.includes(node.type)).length>=node.min;
   case 'source-received-damage':return received(game,source,snapshot)>=node.min;
   case 'player-damage':return (player.turnState.oracleDamageV20||0)>=node.min;
   case 'opponent-damage':return game.players.some(p=>p!==player&&(p.turnState.oracleDamageV20||0)>=node.min);
   case 'own-counter-put':return (player.turnState.oracleCounterRecipientsV20||[]).some(row=>row.counter===node.counter);
   case 'bounced-to-you':return !!player.turnState.oracleBouncedV20;
   case 'artifact-or-creature-died':return game.players.some(p=>p.turnState.oracleArtifactCreatureDiedV20);
   case 'linked-exile-count':return linked(game,source).length>=node.min;
   case 'linked-exile-types':return new Set(linked(game,source).flatMap(c=>c.def.types)).size>=node.min;
   default:throw Error('Invalid permanent condition '+node.test);
  }
 }
 function amount(node,ctx,h){
  if(node.kind==='permanent-count-v20')return count(ctx.g,ctx.src,ctx.you,node);
  if(node.kind!=='permanent-amount-v20')return undefined;
  if(node.test==='event-player-spells')return (ctx.data?.player?.turnState.spellsCastList||[]).filter(row=>node.quality==='all'||!row.isCreature).length;
  if(node.test==='apocalypse-x'){const x=Math.max(0,Number(ctx.x??ctx.so?.x??ctx.src.castMeta?.x)||0);return x>=5?2*x:x;}
  throw Error('Invalid permanent amount '+node.test);
 }
 function compile(op,script,entry,h){
  if(op.kind==='generic-trigger'&&['second-creature','entered-from-grave'].includes(op.permanentGraveTriggerV20)){
   const trigger=h.compileGenericTrigger(op),prior=trigger.filter;trigger.filter=(game,source,data)=>{
    if(op.permanentGraveTriggerV20==='second-creature')return data.player===source.ctrl&&data.card?.is('Creature')&&(data.player.turnState.spellsCastList||[]).filter(row=>row.isCreature).length===2&&prior(game,source,data);
    const card=data.card,cast=card?.castMeta;return !!card&&card.owner===source.ctrl&&(card.meta._enteredFromZone==='graveyard'||cast?.wasCast&&cast.from==='graveyard'&&cast.castBy===source.ctrl.idx)&&prior(game,source,data);
   };h.triggers.push(trigger);return true;
  }
  if(op.kind==='permanent-discard-replacement-v20'){script.oracleOpponentDiscardV20=op;return true;}
  if(op.kind==='generic-trigger'&&op.permanentOpponentDiscardV20){const trigger=h.compileGenericTrigger(op),prior=trigger.filter;trigger.filter=(game,source,data)=>!!data.oracleDiscardCauseV20&&data.oracleDiscardCauseV20!==data.player&&data.player===source.ctrl&&prior(game,source,data);h.triggers.push(trigger);return true;}
  if(op.kind==='generic-static'&&op.grantedOperation?.permanentFirstTapV20){const base=h.compileGenericStatic({...op,grantedOperation:undefined}),trigger=h.compileGenericTrigger(op.grantedOperation),prior=trigger.filter,filters=(op.filters||[]).map(filter=>h.genericTargetSpec(filter,[],0).filter);trigger.filter=(game,source,data)=>source.ctrl===game.turnPlayer&&data.firstThisTurn===true&&prior(game,source,data);h.statics.push({...base,oracleOperation:op,apply(game,self,bf){base.apply(game,self,bf);if(op.condition&&!h.genericCondition(game,self,op.condition,self.ctrl))return;for(const card of bf)if(op.scope==='self'?card===self:(!op.excludeSelf||card!==self)&&filters.some(filter=>filter(game,card,self.ctrl,self)))card.cur.extraTriggers.push(trigger);}});return true;}
  if(op.kind==='generic-trigger'&&op.permanentFirstTapV20){const trigger=h.compileGenericTrigger(op),prior=trigger.filter;trigger.filter=(game,source,data)=>source.ctrl===game.turnPlayer&&data.firstThisTurn===true&&prior(game,source,data);h.triggers.push(trigger);return true;}
  if(op.kind==='generic-trigger'&&op.permanentCopyAlsoV20){
   const cast=h.compileGenericTrigger(op),copy=h.compileGenericTrigger(op),prior=copy.filter;copy.on='spellCopied';copy.filter=(game,source,data)=>{data.player=data.ctrl;data.card=data.so?.card;return prior(game,source,data);};h.triggers.push(cast,copy);return true;
  }
  if(op.kind==='generic-trigger'&&op.permanentFirstCastV20){
   const trigger=h.compileGenericTrigger(op),prior=trigger.filter,rule=op.permanentFirstCastV20;trigger.filter=(game,source,data)=>{const players=rule.scope==='all'?game.players:[data.player],spells=players.flatMap(player=>player?.turnState.spellsCastList||[]).filter(row=>rule.quality==='noncreature'?!row.isCreature:(row.colors||[]).length>1);return spells.length===1&&prior(game,source,data);};h.triggers.push(trigger);return true;
  }
  if(op.kind==='permanent-native-trigger-v20'){
   const trigger=h.compileGenericTrigger({...op,kind:'generic-trigger'}),prior=trigger.filter;trigger.on=op.nativeEvent;trigger.filter=(game,source,data)=>(op.nativeSubject==='self'?data.card===source:data.crew===source)&&prior(game,source,data);h.triggers.push(trigger);return true;
  }
  if(op.kind==='generic-trigger'&&(op.permanentEntryFromV20||op.permanentAuraSpellV20)){
   const trigger=h.compileGenericTrigger(op),prior=trigger.filter;trigger.filter=(game,source,data)=>(!op.permanentEntryFromV20||data.card?.meta._enteredFromZone===op.permanentEntryFromV20&&(!op.permanentEntryOwnerV20||data.card.owner===source.ctrl))&&(!op.permanentAuraSpellV20||data.isSpell&&data.src?.hasSub?.('Aura'))&&prior(game,source,data);h.triggers.push(trigger);return true;
  }
  if(op.kind==='permanent-choose-object-v20'){
   const prior=script.asEnters,filter=h.genericTargetSpec(op.filter,[],0).filter;script.asEnters=async(game,source)=>{if(prior)await prior(game,source);const from=game.bf().filter(card=>filter(game,card,source.ctrl,source)),versions=new Map(from.map(card=>[card,card.zoneVersion])),choice=await source.ctrl.controller.decide(game,{type:'chooseCards',from,min:op.optional?0:Math.min(1,from.length),max:Math.min(1,from.length),prompt:source.name+': choose a nonland permanent',aiHint:{kind:'exile',goal:'removal',src:source}});if(!Array.isArray(choice)||choice.length>1||choice.some(card=>!from.includes(card)||card.zoneVersion!==versions.get(card)))throw Error('Invalid chosen permanent');if(choice.length)source.meta.oracleChosenObjectV20={version:source.zoneVersion,iid:choice[0].iid,objectVersion:choice[0].zoneVersion};};return true;
  }
  if(op.kind==='generic-trigger'&&op.permanentDuringCombatV20){const trigger=h.compileGenericTrigger(op),prior=trigger.filter;trigger.filter=(game,source,data)=>game.phase==='combat'&&prior(game,source,data);h.triggers.push(trigger);return true;}
  if(op.kind==='permanent-combat-tax-v20'){h.statics.push({oracleOperation:op,apply(game,source){if(!op.condition||h.genericCondition(game,source,op.condition,source.ctrl))(source.cur.oracleCombatTaxesV20||=[]).push(op);}});return true;}
  if(op.kind==='permanent-choose-card-type-v20'){
   const prior=script.asEnters;script.asEnters=async(game,source)=>{
    if(prior)await prior(game,source);
    if(op.lookHand){const opponents=game.alivePlayers().filter(player=>player!==source.ctrl);if(opponents.length){const answer=await source.ctrl.controller.decide(game,{type:'chooseOption',prompt:source.name+': choose an opponent whose hand to look at',options:opponents.map(player=>({key:String(player.idx),label:player.name})),aiHint:{kind:'choosePlayer',source}}),opponent=opponents.find(player=>String(player.idx)===String(answer));if(!opponent)throw Error('Invalid look-at-hand opponent');await game.revealToHuman({cards:opponent.hand.slice(),ctrl:source.ctrl,kind:'look',includeLands:true});}}
    const choices=['Artifact','Battle','Creature','Enchantment','Instant','Kindred','Land','Planeswalker','Sorcery'].filter(type=>!op.exclude.includes(type)),answer=await source.ctrl.controller.decide(game,{type:'chooseOption',prompt:source.name+': choose a card type',options:choices.map(type=>({key:type,label:type})),aiHint:{kind:'chooseCardType',source}});
    if(!choices.includes(answer))throw Error('Invalid entry card-type choice');source.meta.oracleChosenCardTypeV20={version:source.zoneVersion,choice:answer};
   };return true;
  }
  if(op.kind==='permanent-choose-opponent-v20'){
   const prior=script.asEnters;script.asEnters=async(game,source)=>{
    if(prior)await prior(game,source);const opponents=game.alivePlayers().filter(player=>player!==source.ctrl);if(!opponents.length)return;
    const result=await source.ctrl.controller.decide(game,{type:'chooseOption',prompt:source.name+': choose an opponent',options:opponents.map(player=>({key:String(player.idx),label:player.name})),aiHint:{kind:'choosePlayer',source}});
    const selected=opponents.find(player=>String(player.idx)===String(result));if(!selected)throw Error('Invalid permanent opponent choice');source.meta.oracleChosenOpponentV20={version:source.zoneVersion,player:selected.idx};
   };return true;
  }
  if(op.kind==='generic-trigger'&&op.permanentChosenUpkeepV20){const trigger=h.compileGenericTrigger(op),prior=trigger.filter;trigger.filter=(game,source,data)=>data.player===chosenPlayer(game,source)&&prior(game,source,data);h.triggers.push(trigger);return true;}
  if(op.kind==='permanent-unattach-trigger-v20'){
   h.triggers.push(h.compileGenericTrigger({kind:'generic-trigger',event:'permanentUnattachedV20',eventFilter:'self',effects:[{action:'permanent-unattach-v20',operation:op.operation}],targets:[],optional:false}));return true;
  }
  if(op.kind==='permanent-daystart-v20'){
   const prior=script.asEnters;script.asEnters=async(game,source)=>{if(prior)await prior(game,source);if(!game.bomDayNight)game.bomDayNight='day';};return true;
  }
  if(op.kind==='generic-trigger'&&(op.permanentDayNightV20||op.permanentCounterEachV20)){
   const trigger=h.compileGenericTrigger(op),prior=trigger.filter;
   if(op.permanentDayNightV20)trigger.filter=(game,source,data)=>['day','night'].includes(data.previousDayNight)&&['day','night'].includes(data.dayNight)&&data.previousDayNight!==data.dayNight&&prior(game,source,data);
   if(op.permanentCounterEachV20)trigger.times=(game,source,data)=>Math.max(0,data.n||0);h.triggers.push(trigger);return true;
  }
  if(op.kind==='permanent-haunt-v20'){
   const trigger=h.compileGenericTrigger({kind:'generic-trigger',event:'dies',eventFilter:'self',effects:[{action:'permanent-haunt-link-v20',target:0}],targets:[{what:'creature',zone:'battlefield',controller:'any',min:1}],optional:false});
   h.triggers.push(trigger);return true;
  }
  if(op.kind==='permanent-haunt-trigger-v20'){
   const trigger=h.compileGenericTrigger({...op,kind:'generic-trigger',eventFilter:{kind:'v8-event',target:{what:'creature',zone:'battlefield',controller:'any',min:1}}}),prior=trigger.filter;
   trigger.filter=(game,source,data)=>{const row=source.meta.oracleHauntV20;return !!row&&source.zone==='exile'&&source.zoneVersion===row.sourceVersion&&data.card?.iid===row.hauntedIid&&data.snap?.zoneVersion===row.hauntedVersion&&prior(game,source,data);};h.triggers.push(trigger);return true;
  }
  if(op.kind==='permanent-rule-v20'){
   if(op.rule==='creature-event-suppression')script.oracleCreatureEventSuppressionV20=true;
   else if(op.rule==='cant-equip')script.oracleCantEquipV20=true;
   else throw Error('Invalid permanent rule');return true;
  }
  if(op.kind==='permanent-event-trigger-v20'){
   const trigger=h.compileGenericTrigger({...op,kind:'generic-trigger',eventFilter:{kind:'v8-event',subject:'self',counter:op.filter.counter}}),prior=trigger.filter;
   trigger.filter=(g,c,d)=>d.before<op.filter.reaches&&d.after>=op.filter.reaches&&prior(g,c,d);
   h.triggers.push(trigger);return true;
  }
  if(op.kind==='permanent-trigger-doubler-v20'){
   const filter=op.filter&&h.genericTargetSpec(op.filter,[],0).filter,entryFilter=op.entryFilter&&h.genericTargetSpec(op.entryFilter,[],0).filter;
   (script.oracleTriggerDoublersV20||=[]).push((game,self,card,event,data)=>(!op.condition||h.genericCondition(game,self,op.condition,self.ctrl))&&card.ctrl===self.ctrl&&live(card)&&(!op.other||card.iid!==self.iid)&&(op.attached?self.attachedTo===card.iid:entryFilter?['etb','landfall'].includes(event)&&!!data.card&&entryFilter(game,data.card,self.ctrl,self):filter(game,card,self.ctrl,self)));return true;
  }
  if(op.kind==='permanent-counter-replacement-v20'){
   const previous=script.plusCountersAdjust,filter=op.filter&&h.genericTargetSpec(op.filter,[],0).filter;
   script.plusCountersAdjust=(n,game,card,self)=>{n=previous?.(n,game,card,self)??n;return n>0&&active(self)&&(op.self?card===self:filter(game,card,self.ctrl,self))?n*op.multiply+op.add:n;};return true;
  }
  if(op.kind!=='permanent-static-v20')return false;
  if(op.rule==='source-colors')h.statics.push({phase:1,oracleOperation:op,apply(game,self){if(h.genericCondition(game,self,op.condition,self.ctrl))self.cur.colors=op.colors.slice();}});
  else if(op.rule==='food-creatures')h.statics.push({phase:1,oracleOperation:op,apply(game,self,bf){for(const card of bf)if(card!==self&&card.is('Creature')){card.cur.types=[...new Set([...card.cur.types,'Artifact'])];card.cur.subtypes=[...new Set([...card.cur.subtypes,'Food'])];}}});
  else if(op.rule==='borrow-abilities'){const filter=h.genericTargetSpec(op.filter,[],0).filter,receivers=op.receivers&&h.genericTargetSpec(op.receivers,[],0).filter;h.statics.push({oracleOperation:op,apply(game,self){(self.cur.oracleBorrowRulesV20||=[]).push({op,filter,receivers});}});}
  else if(op.rule==='disable-chosen-activation')h.statics.push({oracleOperation:op,apply(game,self){const card=chosenObject(game,self);if(card)card.cur.activationDisabled=true;}});
  else if(op.rule==='disable-nonmana'){const filter=h.genericTargetSpec(op.filter,[],0).filter;h.statics.push({oracleOperation:op,apply(game,self,bf){for(const card of bf)if(filter(game,card,self.ctrl,self))card.cur.nonmanaDisabledV14=true;}});}
  else if(op.rule==='nameless-blockers')h.statics.push({oracleOperation:op,apply(game,self){const prior=self.cur.cantBeBlockedBy;self.cur.cantBeBlockedBy=(g,b)=>!!prior?.(g,b)||!M.OracleV8NameGroups.names(b).some(Boolean);}});
  else if(op.rule==='linked-keywords')h.statics.push({oracleOperation:op,apply(game,self){const cards=linked(game,self);for(const kw of op.keywords)if(cards.some(c=>c.kw(kw)))self.cur.kw.add(kw);}});
  else if(op.rule==='linked-protection-types')h.statics.push({oracleOperation:op,apply(game,self){const types=new Set(linked(game,self).flatMap(c=>c.def.types));self.cur.protectionFrom.push((g,c)=>!!c&&[...types].some(type=>c.is(type)));}});
  else if(op.rule==='artifact-lands')h.statics.push({phase:1,oracleOperation:op,apply(game,self,bf){if(self.cur.abilitiesDisabled)return;for(const c of bf)if(c.ctrl===self.ctrl&&c.is('Artifact')&&!c.isToken&&!c.cur.types.includes('Land'))c.cur.types.push('Land');}});
  else if(op.rule==='abilityless-pump')h.statics.push({phase:5,oracleOperation:op,apply(game,self,bf){for(const c of bf)if(c.is('Creature')&&!hasAbilities(c)){c.cur.power+=op.power;c.cur.toughness+=op.toughness;}}});
  else if(op.rule==='greatest-mv-protection')h.statics.push({oracleOperation:op,apply(game,self,bf){const max=Math.max(...bf.filter(c=>c.is('Creature')).map(c=>c.mv));for(const c of bf)if(c.is('Creature')&&c.mv===max)c.cur.protectionFrom.push((g,s)=>!!s?.colors?.length);}});
  else if(op.rule==='your-aura-base'){
   const matches=(game,self,c)=>c!==self&&c.ctrl===self.ctrl&&c.is('Creature')&&game.bf().some(a=>a.ctrl===self.ctrl&&a.hasSub('Aura')&&a.attachedTo===c.iid);
   h.statics.push({phase:7,oracleOperation:op,apply(game,self,bf){for(const c of bf)if(matches(game,self,c)){c.cur.basePower=op.power;c.cur.baseToughness=op.toughness;}}});
   h.statics.push({oracleOperation:op,apply(game,self,bf){for(const c of bf)if(matches(game,self,c))for(const kw of op.keywords)c.cur.kw.add(kw);}});
  }else throw Error('Invalid permanent static '+op.rule);
  return true;
 }
 function record(game,name,data){
  if(!data||!['damageToPlayer','dealtDamage','lto','cardToGraveyard','countersPlaced','cast','attacks','etb'].includes(name))return;
  if(data.oraclePermanentRecordedV20?.includes(name))return;
  (data.oraclePermanentRecordedV20||=[]).push(name);
  if(name==='damageToPlayer'&&data.n>0&&data.player)data.player.turnState.oracleDamageV20=(data.player.turnState.oracleDamageV20||0)+data.n;
  if(['damageToPlayer','dealtDamage'].includes(name)&&data.n>0&&data.src instanceof M.CardInst){
   const snap=data.src._oracleDamageSnapshot,ctrl=snap?.ctrl||data.src.ctrl,version=snap?.zoneVersion??data.src.zoneVersion;
   if(ctrl?.turnState){const sources=ctrl.turnState.oracleDamageSourcesV20||=[],identity=data.src.iid+':'+version;if(!sources.includes(identity))sources.push(identity);}
   if(!snap||version===data.src.zoneVersion)data.src.meta.oracleEverDealtDamageV20=true;
  }
  if(name==='dealtDamage'&&data.n>0){
   if(data.target instanceof M.CardInst){const c=data.target;if(c.meta.oracleReceivedDamageV20?.turn!==game.turnNo)c.meta.oracleReceivedDamageV20={turn:game.turnNo,n:0};c.meta.oracleReceivedDamageV20.n+=data.n;}
  }
  if(name==='lto'&&data.card&&data.snap){
   const to=data.to||data.card.zone;
   (data.snap.ctrl.turnState.oracleDeparturesV20||=[]).push({iid:data.card.iid,version:data.snap.zoneVersion,owner:data.card.owner.idx,types:data.snap.types.slice(),subtypes:data.snap.subtypes.slice(),changeling:!!data.snap.changeling,names:(data.snap.rulesNames||[data.snap.name]).slice(),to});
   if(to==='hand')data.card.owner.turnState.oracleBouncedV20=true;
   if(to==='graveyard'&&data.snap.types.some(t=>t==='Artifact'||t==='Creature'))data.snap.ctrl.turnState.oracleArtifactCreatureDiedV20=true;
   if(to==='graveyard'&&!data.card.isToken)(data.card.owner.turnState.oracleGraveEntriesV20||=[]).push({types:data.card.def.types.slice(),from:'battlefield'});
  }
  if(name==='cardToGraveyard'&&data.card&&!data.card.isToken)(data.card.owner.turnState.oracleGraveEntriesV20||=[]).push({types:data.card.def.types.slice(),from:data.from});
  if(name==='countersPlaced'&&data.n>0&&data.card?.ctrl?.turnState)(data.card.ctrl.turnState.oracleCounterRecipientsV20||=[]).push({counter:data.kind});
  if(name==='cast'&&data.player&&data.card)(data.player.turnState.oracleCastTypesV20||=[]).push(...['Artifact','Battle','Creature','Enchantment','Instant','Kindred','Land','Planeswalker','Sorcery'].filter(type=>game.castHasType(data.card,data.so?.castOpts||data.card.castMeta?.alt||{},type)));
  if(name==='cast'&&data.card?.castMeta){data.card.castMeta.oracleCastOrdinalV20=data.nthThisTurn;data.card.castMeta.oracleCastTurnV20=game.turnNo;}
  if(name==='attacks'&&data.card&&(data.defender||data.card.attacking)?.is?.('Battle'))data.card.meta.oracleAttackedBattleV20=game.turnNo;
  if(name==='attacks'&&data.card?.hasSub('Spacecraft'))data.card.ctrl.turnState.oracleAttackedSpacecraftV20=true;
  if(name==='etb'&&data.card){const card=data.card,version=data.oracleEntryVersion??card.zoneVersion,snap=card.zoneVersion!==version?card.battlefieldLKI?.get(version):null,view=asSnapshot(card,snap);if(view.is('Creature')&&view.kw('flying'))((snap?.ctrl||card.ctrl).turnState.oracleFlyingEntriesV20||=[]).push({iid:card.iid,version});}
 }
 function suppress(game,name,data){
  if(!['etb','landfall','dies'].includes(name)||!data?.card)return false;
  const creature=name==='dies'?data.snap?.types?.includes('Creature'):data.card.is('Creature');if(!creature)return false;
  if(game.bf().some(c=>active(c)&&c.def.oracleCreatureEventSuppressionV20))return true;
  if(name==='dies')return [data.snap,...(game._simultaneousLeaveSources||[]).map(row=>row.snap)].some(s=>s&&!s.abilitiesDisabled&&s.def.oracleCreatureEventSuppressionV20);
  return false;
 }
 function additionalTriggers(game,card,event,data,history,trigger){
  const observed=asSnapshot(card,history),sources=new Map(game.bf().map(c=>[c.iid,{card:c}]));
  if(departureEvents.has(event)){
   for(const row of game._simultaneousLeaveSources||[])sources.set(row.card.iid,row);
   if(data.card&&data.snap)sources.set(data.card.iid,{card:data.card,snap:data.snap});
  }
  let count=0;
  for(const row of sources.values()){
   const self=asSnapshot(row.card,row.snap);if(!active(self))continue;
   for(const match of self.def.oracleTriggerDoublersV20||[])if(match(game,self,observed,event,data,trigger))count++;
  }
  return count;
 }
 const unattached=(game,equipment,host,snapshot,hostSnapshot)=>{if(host)void game.emit('permanentUnattachedV20',{card:equipment,host,hostVersion:hostSnapshot?.zoneVersion??host.zoneVersion,snap:snapshot||game.snapshot(equipment)});};
 const applyDynamicPT=(game,card,effect)=>{
  if(!effect.permanentDynamicV20||effect.timestamp<(card.cur.oracleAbilityLossTimestamp??-Infinity))return;
  const op=effect.permanentDynamicV20,n=V.helpers.genericCount(game,card,card.ctrl,op.count)*op.multiply+op.offset;
  if(op.power)card.cur.basePower=n;if(op.toughness)card.cur.baseToughness=n+op.toughnessOffset;
 };
 const taxRows=game=>game.bf().flatMap(source=>(source.cur.oracleCombatTaxesV20||[]).map(op=>({source,op}))).concat((game.oracleCombatTaxesV20||[]).filter(row=>row.throughTurn===undefined?row.turn===game.turnNo:game.players[row.controller].turnsStarted<=row.throughTurn));
 function combatTax(game,creature,destination,mode){
  let mana=0;
  for(const {source,op,controller=source.ctrl.idx}of taxRows(game)){
   if(op.mode!==mode&&op.mode!=='both'||op.subject==='self'&&source!==creature||op.subject==='attached'&&source.attachedTo!==creature.iid||op.excludeColor&&creature.colors.includes(op.excludeColor))continue;
   const player=game.players[controller];
   if(op.defender&&!(destination===player||op.defender==='you-and-walkers'&&destination?.is?.('Planeswalker')&&destination.ctrl===player))continue;
   if(op.attackerPowerMin!==undefined&&destination?.power<op.attackerPowerMin)continue;
   const multiplier=op.multiply?.counter?creature.counters[op.multiply.counter]||0:op.multiply?V.helpers.genericCount(game,source,player,op.multiply):1;
   mana+=op.mana*multiplier;
  }
  return mana;
 }
 const attackTax=(game,card,target)=>combatTax(game,card,target,'attack');
 async function payBlockTaxes(game,attackers,player){
  if(!taxRows(game).some(row=>row.op.mode!=='attack')){if(game.c13PayBlockTaxes)await game.c13PayBlockTaxes(attackers,player);return;}
  const native=game.c13BlockTax?.()||0,blockers=[...new Set(attackers.flatMap(card=>card.blockedBy))],payments=blockers.map(card=>({card,mana:native+Math.max(0,...attackers.filter(attacker=>attacker.blockedBy.includes(card)).map(attacker=>combatTax(game,card,attacker,'block')))}));
  for(const {card,mana}of payments){if(!mana)continue;const cost=M.parseCost('{'+mana+'}');
   const accepted=game.canPayMana(player,cost)&&await player.controller.decide(game,{type:'chooseOption',prompt:card.name+': pay '+mana+' mana to block?',options:[{key:'yes',label:'Pay '+mana},{key:'no',label:'Do not block'}],aiHint:{kind:'payCost',source:card,mana}})==='yes';
   if(accepted&&await game.payMana(player,cost))continue;
   for(const attacker of attackers)attacker.blockedBy=attacker.blockedBy.filter(blocker=>blocker!==card);card.blocking=null;
  }
 }
 const borrowedCache=new WeakMap(),intrinsicMana=Object.entries({Plains:'W',Island:'U',Swamp:'B',Mountain:'R',Forest:'G'}).map(([type,color])=>({key:'intrinsic-'+type,label:'{T}: Add {'+color+'}.',cost:{tap:true},produce:[{[color]:1}],intrinsicLandType:type}));
 function borrowableAbilities(card){
  const printed=card.zone==='battlefield'&&card.cur.abilitiesDisabled?{abilities:[],mana:[]}:M.CDK.gainedArtifactAbilities(card.def,card.iid+':'+card.zoneVersion);
  const result={abilities:[...printed.abilities],mana:[...printed.mana]};
  if(card.zone==='battlefield'){result.abilities.push(...card.cur.extraAbilities);result.mana.push(...card.cur.extraMana);}
  else if(card.is('Land'))for(const ability of intrinsicMana)if(card.hasSub(ability.intrinsicLandType)&&!result.mana.some(row=>row.cost?.tap&&Object.keys(row.cost).length===1&&Array.isArray(row.produce)&&row.produce.some(output=>JSON.stringify(output)===JSON.stringify(ability.produce[0]))))result.mana.push(ability);
  return result;
 }
 function borrowedAbility(ability,source,receiver,donor,index,kind,once){
  let cache=borrowedCache.get(ability);if(!cache){cache=new Map();borrowedCache.set(ability,cache);}
  const key=[source.iid,source.zoneVersion,receiver.iid,receiver.zoneVersion,donor.iid,donor.zoneVersion,index,kind,!!once].join(':');
  if(!cache.has(key))cache.set(key,{...ability,oracleBorrowedV20:true,oracleBorrowedDonorV20:donor.iid,oracleUseKeyV20:'borrowed:'+key,...(once||ability.oncePerTurn?{oncePerTurn:true,...(kind==='mana'?{key:'borrowed:'+key}:{c1719UseKey:'borrowed:'+key})}:{})});
  return cache.get(key);
 }
 function inheritAbilities(game,bf,inAbilityLayer){
  const pending=bf.flatMap(source=>(source.cur.oracleBorrowRulesV20||[]).map(rule=>{
   const {op,filter,receivers}=rule;let donors=op.zone==='battlefield'?bf:op.zone==='graveyard'?game.players.flatMap(player=>player.graveyard):op.zone==='linked'?linked(game,source,'permanent-abilities-v20'):op.zone==='chosen'?[chosenObject(game,source)].filter(Boolean):op.zone==='top'?source.ctrl.library.slice(-1):op.zone==='craft'&&source.meta.oracleCraftV20?.version===source.zoneVersion?source.meta.oracleCraftV20.rows.filter(row=>row.card.zone==='exile'&&row.card.zoneVersion===row.version).map(row=>row.card):[];
   donors=donors.filter(card=>filter(game,card,source.ctrl,source)&&(!op.other||card!==source)&&(!op.differentName||!M.OracleV8NameGroups.names(card).some(name=>M.OracleV8NameGroups.names(source).includes(name))));
   return {source,op,donors,receivers:receivers?bf.filter(card=>receivers(game,card,source.ctrl,source)):[source]};
  }));
  // Ability-granting effects depend on grants to their donors. Apply each
  // effect once; a dependency cycle uses timestamp order, without recursively
  // manufacturing another ability on every recalculation.
  while(pending.length){const independent=pending.filter(row=>!pending.some(other=>other!==row&&other.receivers.some(card=>row.donors.includes(card))));const row=(independent.length?independent:pending).sort((a,b)=>a.source.timestamp-b.source.timestamp)[0];pending.splice(pending.indexOf(row),1);
   const grants=row.donors.map(donor=>({donor,...borrowableAbilities(donor)}));
   for(const receiver of row.receivers)inAbilityLayer(row.source.timestamp,()=>{for(const {donor,abilities,mana}of grants){if(donor===receiver)continue;receiver.cur.extraAbilities.push(...abilities.filter(ability=>(!row.op.excludeLoyalty||ability.loyalty===undefined)&&(!row.op.onlyLoyaltyV69||ability.loyalty!==undefined)).map((ability,i)=>borrowedAbility(ability,row.source,receiver,donor,i,'ability',row.op.once)));if(!row.op.excludeMana)receiver.cur.extraMana.push(...mana.map((ability,i)=>borrowedAbility(ability,row.source,receiver,donor,i,'mana',row.op.once)));}});
  }
 }
 function discardReplacements(game,card,to,snap,opts){
  const cause=opts.oracleDiscardCauseV20,player=opts.oracleDiscardPlayerV20;if(card.zone!=='hand'||!cause||cause===player)return [];
  const rows=[];
  if(to==='graveyard'&&card.def.oracleOpponentDiscardV20?.subject==='self'){const operation=card.def.oracleOpponentDiscardV20;rows.push({key:'opponent-discard-self-v20',label:card.name+' — put onto the battlefield',run:async()=>({toZone:'battlefield',opts:{ctrl:card.owner,...(operation.n?{additionalCounters:{...opts.additionalCounters,'+1/+1':(opts.additionalCounters?.['+1/+1']||0)+operation.n}}:{})}})});}
  for(const source of game.bf())if(active(source)&&source.ctrl===player&&source.def.oracleOpponentDiscardV20?.subject==='controller')rows.push({key:'opponent-discard-library-v20:'+source.iid,label:source.name+' — reveal and put on top of library',run:async()=>{const choice=await player.controller.decide(game,{type:'chooseOption',prompt:source.name+': reveal '+card.name+' and put it on top?',options:[{key:'yes',label:'Reveal and put on top'},{key:'no',label:'Keep destination'}],aiHint:{kind:'optTrigger',src:source}});if(choice!=='yes')return {toZone:to};await game.revealToHuman({cards:[card],ctrl:player,kind:'reveal'});return {toZone:'library',opts:{toBottom:false}};}});
  return rows;
 }
 M.OracleV20Permanents={record,suppress,hasAbilities,linked,additionalTriggers,unattached,applyDynamicPT,attackTax,payBlockTaxes,borrowableAbilities,inheritAbilities,discardReplacements};
 async function effect(ctx,node,h){
  if(node.action==='permanent-grave-exile-return-v20'){
   const source=ctx.src,version=ctx.sourceZoneVersion,valid=()=>source.zone==='graveyard'&&source.zoneVersion===version,filter=h.genericTargetSpec(node.filter,[],0).filter;
   if(!valid())return true;const from=ctx.you.graveyard.filter(card=>card!==source&&filter(ctx.g,card,ctx.you,source));if(!from.length)return true;
   const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:source.name+': exile another black creature card to return?',options:[{key:'yes',label:'Exile and return'},{key:'no',label:'Decline'}],aiHint:{kind:'optTrigger',src:source}});if(choice!=='yes')return true;
   const versions=new Map(from.map(card=>[card,card.zoneVersion])),chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt:source.name+': exile another black creature card',aiHint:{kind:'exile',src:source}});
   if(!Array.isArray(chosen)||chosen.length!==1||!from.includes(chosen[0]))throw Error('Invalid graveyard return payment');const card=chosen[0];if(!valid()||card.zone!=='graveyard'||card.zoneVersion!==versions.get(card))return true;
   await ctx.g.move(card,'exile');if(card.zone==='exile'&&card.zoneVersion===versions.get(card)+1&&valid())await ctx.g.putPermanentOntoBattlefield(source,ctx.you);return true;
  }
  if(node.action==='permanent-discard-return-v20'){const card=ctx.src,version=ctx.oracleSourceCapture?.eventCardZoneVersion??ctx.eventCardZoneVersion,zone=ctx.oracleSourceCapture?.zone,restore=async game=>{if(card.zoneVersion!==version||node.from==='graveyard'&&card.zone!=='graveyard'||node.from==='public'&&!['graveyard','exile','battlefield'].includes(card.zone))return;if(node.to==='battlefield')await game.putPermanentOntoBattlefield(card,ctx.you,{...(node.counter?{additionalCounters:{[node.counter]:node.n}}:{})});else await game.move(card,'hand');};if(node.delay)ctx.g.delayed.push({on:'endStep',once:true,src:card,ctrl:ctx.you,name:card.name+': return discarded card',run:next=>restore(next.g)});else await restore(ctx.g);return true;}
  if(node.action==='permanent-draw-other-players-v20'){const caster=ctx.oracleSourceCapture?.eventPlayer||ctx.data?.player;for(const player of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you))if(player!==caster)await h.runGenericEffect({...ctx,targets:[player]},{action:'draw',who:0,n:node.n});return true;}
  if(node.action==='permanent-borrow-abilities-v20'){
   const donor=h.genericEffectSubjects(ctx,node.target)[0];if(!h.sameBattlefieldSource(ctx)||!live(donor))return true;
   const all=borrowableAbilities(donor),timestamp=ctx.g.nextOracleTimestamp();
   for(const [kind,field]of [['abilities','extraAbilities'],['mana','extraMana']])ctx.g.untilEffects.push({kind:'oracleGrantedOperation',iid:ctx.src.iid,zoneVersion:ctx.src.zoneVersion,timestamp,expires:'eot',field,keywords:[],grants:all[kind].map((ability,i)=>borrowedAbility(ability,ctx.src,ctx.src,donor,i,kind+':'+timestamp,false))});ctx.g.recalc();return true;
  }
  if(node.action==='permanent-grave-aura-v20'){
   const host=ctx.oracleSourceCapture?.eventCard||ctx.data?.card,version=ctx.oracleSourceCapture?.eventCardZoneVersion??ctx.eventCardZoneVersion;
   if(ctx.src.zone==='graveyard'&&ctx.src.zoneVersion===ctx.sourceZoneVersion&&live(host)&&host.zoneVersion===version&&ctx.g.legalEntryAttachment(ctx.src,host,ctx.you))await ctx.g.move(ctx.src,'battlefield',{ctrl:ctx.you,attachTo:host});return true;
  }
  if(node.action==='permanent-host-death-return-v20'){
   if(ctx.src.zone==='graveyard'&&ctx.src.zoneVersion===ctx.sourceZoneVersion+1){
    if(!node.transformed)await ctx.g.move(ctx.src,'hand');
    else if(node.target===undefined)await ctx.g.move(ctx.src,'battlefield',{ctrl:ctx.you,oracleFace:'back'});
    else {const player=h.genericEffectSubjects(ctx,node.target)[0];if(player instanceof M.Player&&!player.lost)await ctx.g.move(ctx.src,'battlefield',{ctrl:ctx.you,oracleFace:'back',cursedPlayer:player});}
   }return true;
  }
  if(node.action==='permanent-combat-tax-v20'){(ctx.g.oracleCombatTaxesV20||=[]).push({source:ctx.src,controller:ctx.you.idx,op:{...node.rule,mana:h.genericAmount(node.rule.mana,ctx)},...(node.duration==='next-turn'?{throughTurn:ctx.you.turnsStarted}:{turn:ctx.g.turnNo})});return true;}
  if(node.action==='permanent-grave-exile-v20'){if(ctx.src.zone==='graveyard'&&ctx.src.zoneVersion===ctx.sourceZoneVersion)await ctx.g.move(ctx.src,'exile');return true;}
  if(node.action==='permanent-self-return-v20'){
   const iid=ctx.src.iid,version=ctx.data?.graveyardZoneVersion??(ctx.data?.card===ctx.src&&ctx.data.snap?ctx.data.snap.zoneVersion+1:null),owner=ctx.src.owner.idx,controller=ctx.you.idx,counters=node.fewerCounter?Math.max(0,(ctx.data?.snap?.counters?.[node.fewerCounter]||0)-1):node.n||0;
   const restore=async game=>{
    const source=game.byIid(iid),player=game.players.find(p=>p.idx===(node.controller==='you'?controller:owner));if(!source||source.zone!=='graveyard'||source.zoneVersion!==version||!player||player.lost)return;
    const counter=node.fewerCounter||node.counter;
    await game.putPermanentOntoBattlefield(source,player,{tapped:!!node.tapped,...(node.transformed?{oracleFace:'back'}:{}),...(counter?{additionalCounters:{[counter]:counters},additionalCounterBy:game.players.find(p=>p.idx===controller)}:{}),...(node.subtype?{entryAnimation:{types:[],subtypes:[node.subtype],retainTypes:true,retainAllSubtypes:true,keywords:[],temporary:false}}:{})});
    if(node.loseAbilities&&source.zone==='battlefield'){M.OracleV8AbilityLoss.add(game,[source],{keywords:node.keywords||[]});}
   };
   if(node.delay)ctx.g.delayed.push({on:node.delay==='owner-upkeep'?'upkeep':'endStep',once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' — delayed return',filter:(game,data)=>node.delay!=='owner-upkeep'||data.player?.idx===owner,run:later=>restore(later.g)});
   else await restore(ctx.g);return true;
  }
  if(node.action==='permanent-chosen-upkeep-v20'){
   const player=ctx.data?.player;if(!player||player.lost)return true;
   const damage={action:'damage',target:'event-player',n:node.rule==='rack'?Math.max(0,3-player.hand.length):3};
   if(node.rule==='rack')await h.runGenericEffect(ctx,damage);
   else {const n=h.genericAmount({kind:'source-counters',counter:'vortex'},ctx);await h.runGenericEffect(ctx,{action:'unless-cost',who:'event-player',payment:{kind:'mana',mana:'{'+n+'}'},effects:[damage]});}
   return true;
  }
  if(node.action==='permanent-dynamic-animation-v20'){
   const target=node.animation.target;
   if(target==='self'&&!h.sameBattlefieldSource(ctx))return true;
   for(const card of h.genericEffectSubjects(ctx,target))if(live(card)){
    ctx.g.addOracleAnimation(card,node.animation);
    ctx.g.addOracleBasePT(card,{temporary:!!node.animation.temporary,permanentDynamicV20:node.operation});
   }
   return true;
  }
  if(node.action==='permanent-unattach-v20'){
   const host=ctx.data?.host;if(!live(host)||host.zoneVersion!==ctx.data.hostVersion)return true;
   if(node.operation==='destroy')await ctx.g.destroy(host);else if(node.operation==='sacrifice'&&host.ctrl===ctx.you)await ctx.g.sacrifice(ctx.you,host);return true;
  }
  if(node.action==='permanent-haunt-link-v20'){
   const haunted=h.genericEffectSubjects(ctx,node.target)[0],source=ctx.src,version=ctx.data?.graveyardZoneVersion;
   if(!live(haunted)||source.zone!=='graveyard'||source.zoneVersion!==version)return true;
   const hauntedVersion=haunted.zoneVersion;
   await ctx.g.move(source,'exile');
   if(source.zone==='exile'&&source.zoneVersion===version+1)source.meta.oracleHauntV20={sourceVersion:source.zoneVersion,hauntedIid:haunted.iid,hauntedVersion};
   return true;
  }
  if(node.action!=='permanent-copy-event-counters-v20')return false;
  const snapshot=ctx.oracleSourceCapture?.eventSnap||ctx.data?.snap;
  if(!snapshot)return true;
  for(const c of h.genericEffectSubjects(ctx,node.target))if(live(c))for(const [kind,n]of Object.entries(snapshot.counters||{}))if(n>0&&(!node.counter||node.counter===kind))ctx.g.addCounters(c,kind,n,false,ctx.you);
  return true;
 }
 const attach=M.Game.prototype.attach;
 M.Game.prototype.attach=async function(att,host,...args){if(att?.hasSub('Equipment')&&active(host)&&host.def.oracleCantEquipV20)return false;if(live(att)&&live(host)&&att.attachedTo&&att.attachedTo!==host.iid)unattached(this,att,this.byIid(att.attachedTo));return attach.call(this,att,host,...args);};
 V.handlers.push({compile,target,count,condition,amount,effect});
})();
