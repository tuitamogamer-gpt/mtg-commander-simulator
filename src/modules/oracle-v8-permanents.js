// ===== oracle-v8-permanents.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Typed predicates for already emitted engine events. This adapter never
// interprets Oracle prose, invents an event, or broadens an older predicate.
(function () {
  function hasAllCreatureTypes(card){
    if(!(card instanceof MTG.CardInst)||card.zone!=='battlefield')return !!(card.changeling??card.def?.changeling);
    const cur=card.cur;
    return !!cur?.types.includes('Creature')&&!!(card.def.changeling&&!cur.abilitiesDisabled&&!cur.suppressPrintedChangeling||cur.allCreatureTypesFromOtherEffects||!card.def.changeling&&cur.allCreatureTypes);
  }
  MTG.oracleV8PermanentCount=function(game,source,player,node){
    const schemas={
      'source-counter-total':[],'attachments':['relative'],'shared-creature-types':['controller','other','relative'],
      'colors':['relative'],'mana-value':['relative'],'mana-symbols':['color','relative'],
      'creature-counters':['counter','other'],'graveyard-cycling':[],'commander-casts':[],
      'commander-mana-value':[],'graveyard-size-count':['min'],'creature-entries':[],
      'controller-graveyard':['creatures','relative'],
    },fields=schemas[node.test];
    if(node.kind!=='v8-permanent-count'||!fields||Object.keys(node).some(key=>!['kind','test','multiply',...fields].includes(key)))throw new Error('Invalid v8 permanent count');
    const live=source instanceof MTG.CardInst&&source.zone==='battlefield';
    const subtypes=card=>(card.cur?.subtypes||card.subtypes||card.def?.subtypes||[]).filter(type=>MTG.CREATURE_SUBTYPES.has(type));
    const changeling=hasAllCreatureTypes;
    switch(node.test){
      case 'source-counter-total':return Object.values(source?.counters||{}).reduce((sum,n)=>sum+Math.max(0,Number(n)||0),0);
      case 'attachments':return !source?0:live?game.bf().filter(card=>card.attachedTo===source.iid&&(card.hasSub('Aura')||card.hasSub('Equipment'))).length:(source.attachedSources||[]).filter(row=>row.snap.subtypes.some(type=>type==='Aura'||type==='Equipment')).length;
      case 'shared-creature-types':{
        if(!source)return 0;const ownTypes=subtypes(source),allTypes=changeling(source);
        return game.bf().filter(card=>card.iid!==source.iid&&card.is('Creature')&&(node.controller==='all'||card.ctrl===player)&&
          (allTypes&&changeling(card)||allTypes&&subtypes(card).length>0||changeling(card)&&ownTypes.length>0||subtypes(card).some(type=>ownTypes.includes(type)))).length;
      }
      case 'colors':return (source?.colors||[]).length;
      case 'mana-value':return source?.mv||0;
      case 'mana-symbols':return [...String(source?.def?.cost||'').matchAll(/\{([^}]+)\}/g)].filter(match=>match[1].split('/').includes(node.color)).length;
      case 'creature-counters':return game.creatures(player).filter(card=>card.iid!==source?.iid).reduce((sum,card)=>sum+(card.counters[node.counter]||0),0);
      case 'graveyard-cycling':return player.graveyard.filter(card=>!!card.def.cycling).length;
      case 'commander-casts':return player.commanderCasts;
      case 'commander-mana-value':return Math.max(0,...player.commanders.map(card=>card.mv));
      case 'graveyard-size-count':return game.alivePlayers().filter(owner=>owner.graveyard.length>=node.min).length;
      case 'creature-entries':return (player.turnState.oraclePermanentEntries||[]).filter(row=>row.types.includes('Creature')).length;
      case 'controller-graveyard':return (source?.ctrl?.graveyard||[]).filter(card=>!node.creatures||card.is('Creature')).length;
    }
  };

  MTG.oracleV8LiveCondition = function (game, source, condition, controller, genericTargetSpec, evidence) {
    if (condition.kind !== 'v8-live-condition') return undefined;
    const schemas = {
      'most-common-color': ['color'], 'half-starting-life': [], 'crime-turn': [], 'exile-adventure': [],
      'source-counter-total': ['min'], 'creature-counter-total': ['min'], 'creature-counter-minimum': ['min', 'counter', 'anyPlayer'],
      'renowned': [], 'attacking-alone': [], 'blocker-count': ['min'], 'controller-other-creatures': ['min', 'max'],
      'entry-turn': ['type','subtype','another'], 'sacrifice-turn': ['type'], 'counter-put-turn': ['counter','self'],
    }, fields = schemas[condition.test];
    if (!fields || Object.keys(condition).some(key => !['kind', 'test', ...fields].includes(key))) throw new Error('Invalid v8 live condition');
    for (const field of ['min', 'max']) if (condition[field] !== undefined && (!Number.isSafeInteger(condition[field]) || condition[field] < 0)) throw new Error('Invalid v8 live-condition threshold');
    const counts = values => Object.values(values || {}).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);
    const snapshot = evidence && source.zoneVersion !== evidence.zoneVersion ? source.battlefieldLKI?.get(evidence.zoneVersion) : null;
    switch (condition.test) {
      case 'most-common-color': {
        if (!['W', 'U', 'B', 'R', 'G'].includes(condition.color)) throw new Error('Invalid v8 common color');
        const totals = Object.fromEntries(['W', 'U', 'B', 'R', 'G'].map(color => [color, game.bf().filter(card => card.colors.includes(color)).length]));
        return totals[condition.color] === Math.max(...Object.values(totals));
      }
      case 'half-starting-life': return controller.life <= (controller.startingLife ?? 40) / 2;
      case 'crime-turn': return (controller.turnState.oracleCrimes || 0) > 0;
      case 'entry-turn': return (controller.turnState.oraclePermanentEntries||[]).some(row=>
        (!condition.another||row.iid!==source.iid||row.version!==source.zoneVersion)&&row.types.includes(condition.type)&&(!condition.subtype||row.changeling||row.subtypes.includes(condition.subtype)));
      case 'sacrifice-turn': return (controller.turnState.oracleSacrifices||[]).some(row=>!condition.type||row.types.includes(condition.type));
      case 'counter-put-turn': return (controller.turnState.oracleCounterPlacements||[]).some(row=>row.creature&&row.counter===condition.counter&&(!condition.self||row.iid===source.iid&&row.version===source.zoneVersion));
      case 'exile-adventure': return controller.exile.some(card => card.owner === controller && !!card.def.adventure);
      case 'source-counter-total': return counts(snapshot?.counters || source.counters) >= condition.min;
      case 'creature-counter-total': return game.creatures(controller).reduce((sum, card) => sum + counts(card.counters), 0) >= condition.min;
      case 'creature-counter-minimum': return game.bf().some(card => card.is('Creature') && (condition.anyPlayer || card.ctrl === controller) && (card.counters[condition.counter] || 0) >= condition.min);
      case 'renowned': return snapshot?!!snapshot.renowned:!!source.meta.renowned;
      case 'attacking-alone': return !!source.attacking && game.bf().filter(card => card.is('Creature') && card.ctrl === source.ctrl && card.attacking).length === 1;
      case 'blocker-count': return !!source.attacking && (source.blockedBy || []).filter(card => card.zone === 'battlefield' && card.is('Creature')).length >= condition.min;
      case 'controller-other-creatures': {
        const n = game.creatures(source.ctrl).filter(card => card !== source).length;
        return (condition.min === undefined || n >= condition.min) && (condition.max === undefined || n <= condition.max);
      }
    }
  };

  function hasCondition(node, test) {
    if(!node||typeof node!=='object')return false;
    return node.kind==='v8-live-condition'&&node.test===test||test==='entry-turn'&&node.kind==='v8-permanent-count'&&node.test==='creature-entries'||Object.values(node).some(child=>hasCondition(child,test));
  }
  MTG.oracleV8PermanentCountChanged=function(game,test){
    const has=node=>node&&typeof node==='object'&&(node.kind==='v8-permanent-count'&&node.test===test||Object.values(node).some(has));
    if(game.bf().some(card=>!card.cur.abilitiesDisabled&&((card.def.statics||[]).some(layer=>has(layer.oracleOperation))||(card.def.oracleAttachmentGrants||[]).some(has))))game.recalc();
  };
  function needsHistoryRecalc(game,test) {
    return game.bf().some(card=>!card.cur.abilitiesDisabled&&((card.def.statics||[]).some(layer=>hasCondition(layer.oracleOperation,test))||(card.def.oracleAttachmentGrants||[]).some(grant=>hasCondition(grant,test))));
  }
  MTG.oracleV8RecordConditionEntry=function(game,card){
    if(game._battlefieldEntryEvents)return;
    const rows=card.ctrl.turnState.oraclePermanentEntries||(card.ctrl.turnState.oraclePermanentEntries=[]);
    rows.push({iid:card.iid,version:card.zoneVersion,types:card.cur.types.slice(),subtypes:card.cur.subtypes.slice(),changeling:hasAllCreatureTypes(card)});
    if(needsHistoryRecalc(game,'entry-turn'))game.recalc();
  };
  MTG.oracleV8FinishConditionEntryBatch=function(game,batch){
    // All co-entrants' layer-4 characteristics and control effects are now
    // present. Record the whole event before any of its triggers are collected.
    for(const event of batch)if(event.name==='etb'){
      const card=event.data.card,version=event.data.oracleEntryVersion;
      const snap=card.zone==='battlefield'&&card.zoneVersion===version?null:card.battlefieldLKI?.get(version);
      if(!snap&&!(card.zone==='battlefield'&&card.zoneVersion===version))continue;
      const controller=snap?.ctrl||card.ctrl,rows=controller.turnState.oraclePermanentEntries||(controller.turnState.oraclePermanentEntries=[]);
      rows.push({iid:card.iid,version,types:(snap?.types||card.cur.types).slice(),subtypes:(snap?.subtypes||card.cur.subtypes).slice(),changeling:snap?!!snap.changeling:hasAllCreatureTypes(card)});
    }
    if(needsHistoryRecalc(game,'entry-turn'))game.recalc();
    for(const event of batch)if(event.name==='countersPlaced')MTG.oracleV8RecordConditionEvent(game,event.name,event.data);
  };
  MTG.oracleV8RecordConditionEvent=function(game,name,data){
    if(!data||data.oracleConditionRecorded||!['crime','sacrificed','countersPlaced'].includes(name))return;
    data.oracleConditionRecorded=true;
    if(name==='crime'&&data.player?.turnState){
      const first=!(data.player.turnState.oracleCrimes>0);
      data.player.turnState.oracleCrimes=(data.player.turnState.oracleCrimes||0)+1;
      if(first&&needsHistoryRecalc(game,'crime-turn'))game.recalc();
    }else if(name==='sacrificed'&&data.player?.turnState&&data.snap){
      (data.player.turnState.oracleSacrifices||=[]).push({types:(data.snap.types||[]).slice()});
      if(needsHistoryRecalc(game,'sacrifice-turn'))game.recalc();
    }else if(name==='countersPlaced'&&data.by?.turnState&&data.n>0&&data.card?.zone==='battlefield'){
      (data.by.turnState.oracleCounterPlacements||=[]).push({iid:data.card.iid,version:data.card.zoneVersion,counter:data.kind,creature:data.card.is('Creature')});
      if(needsHistoryRecalc(game,'counter-put-turn'))game.recalc();
    }
  };

  function isBestowed(card) {
    return !!(card instanceof MTG.CardInst && card.zone === 'battlefield' && card.meta?.oracleBestowed);
  }

  // Bestow's continuous type effect is not a copy effect. Keep the printed or
  // copied definition intact and overlay only the battlefield characteristics;
  // this lets a token copy of the Aura enter as the ordinary printed creature.
  function applyBestowBase(card, cur) {
    if (!isBestowed(card)) return false;
    cur.types = ['Enchantment'];
    cur.subtypes = ['Aura'];
    return true;
  }

  function bestowEntryMeta(definition) {
    const target = definition?.bestowTarget?.[0];
    if (!definition?.bestowCost || !target) throw new Error('Invalid bestow entry definition');
    return {oracleBestowed: true, oracleBestowTarget: target};
  }

  // The effect ends before the ordinary Aura SBA is applied. Removing the
  // attachment and marker reveals the underlying creature/copy characteristics
  // in the next normal recalculation pass.
  function ceaseBestow(game, card) {
    if (!isBestowed(card)) return false;
    if (card.attachedTo) {
      const host = game.byIid(card.attachedTo);
      if (host) host.attachments = host.attachments.filter(iid => iid !== card.iid);
      card.attachedTo = null;
    }
    delete card.meta.oracleBestowed;
    delete card.meta.oracleBestowTarget;
    return true;
  }

  function bestowAttachmentLegal(game, card, host) {
    const spec = card?.meta?.oracleBestowTarget || card?.def?.bestowTarget?.[0];
    return !!(isBestowed(card) && spec && host instanceof MTG.CardInst && host.zone === 'battlefield' &&
      (!spec.filter || spec.filter(game, host, card.ctrl, card)) && !game.isProtectedFrom(host, card));
  }

  // Zone permissions such as "play the top card" may inspect a card's types.
  // CR 702.103d evaluates only the characteristics modified by bestow for this
  // cast, so expose an immutable view instead of mutating the physical card.
  function bestowCastView(card) {
    if (!(card instanceof MTG.CardInst) || !card.def?.bestowCost) return card;
    const view = Object.create(card);
    view.def = {...card.def, types: ['Enchantment'], subtypes: ['Aura']};
    view.is = type => type === 'Enchantment';
    view.hasSub = subtype => subtype === 'Aura';
    return view;
  }

  MTG.OracleV8Permanents = Object.assign(MTG.OracleV8Permanents || {}, {
    isBestowed, applyBestowBase, bestowEntryMeta, ceaseBestow,
    bestowAttachmentLegal, bestowCastView,
  });

  MTG.oracleV8ApplyStaticCharacteristics=function(card,change){
    if(Object.keys(change).some(key=>!['addCreatureTypes','allCreatureTypes','colors'].includes(key)))throw new Error('Unsupported static characteristic change');
    if(change.colors){if(change.colors.some(color=>!['W','U','B','R','G'].includes(color)))throw new Error('Invalid static color');card.cur.colors=change.colors.slice();}
    if(change.addCreatureTypes||change.allCreatureTypes){
      if((change.addCreatureTypes||[]).some(type=>!MTG.CREATURE_SUBTYPES.has(type)))throw new Error('Invalid static creature subtype');
      if(card.cur.types.includes('Creature')||card.cur.types.includes('Kindred')){
        card.cur.subtypes=[...new Set(card.cur.subtypes.concat(change.addCreatureTypes||[]))];
        if(change.allCreatureTypes){card.cur.allCreatureTypes=true;card.cur.allCreatureTypesFromOtherEffects=true;}
      }
    }
  };

  MTG.oracleV8ApplyTypeStatic = function (card, change) {
    if (JSON.stringify(change) === '{"remove":["Creature"]}') {
      card.cur.types = card.cur.types.filter(type => type !== 'Creature');
      if (!card.cur.types.includes('Kindred') && !card.cur.types.includes('Tribal')) {
        card.cur.subtypes = card.cur.subtypes.filter(type => !MTG.CREATURE_SUBTYPES.has(type));
        card.cur.allCreatureTypes = false; card.cur.allCreatureTypesFromOtherEffects = false;
        card.cur.suppressPrintedChangeling = true;
      }
    } else if (JSON.stringify(change) === '{"add":["Artifact","Creature"]}') {
      card.cur.types = [...new Set(card.cur.types.concat(change.add))];
    } else throw new Error('Unsupported conditional type change');
  };

  function combatPredicate(game, own, other, predicate) {
    if (!(other instanceof MTG.Player)) return false;
    const permanents = game.bf().filter(card => card.ctrl === other);
    switch (predicate.kind) {
      case 'permanent': return permanents.some(card => predicate.types.every(type => card.is(type)) && (!predicate.untapped || !card.tapped) && (!predicate.snow || (card.cur.super || []).includes('Snow')));
      case 'more-permanents': return game.bf().filter(card => card.ctrl === own && card.is(predicate.type)).length > permanents.filter(card => card.is(predicate.type)).length;
      case 'enchantment-or-enchanted': return permanents.some(card => card.is('Enchantment') || (card.attachments || []).some(iid => {const aura = game.byIid(iid); return aura?.zone === 'battlefield' && aura.attachedTo === card.iid && aura.hasSub('Aura');}));
      case 'most-creatures': { const n = permanents.filter(card => card.is('Creature')).length; return game.alivePlayers().every(player => game.creatures(player).length <= n); }
      case 'shared-creature-type': { const creatures = permanents.filter(card => card.is('Creature')); return [...MTG.CREATURE_SUBTYPES].some(type => creatures.filter(card => card.hasSub(type)).length >= predicate.min); }
      case 'poisoned': return other.poison > 0;
      case 'monarch': return game.monarch === other;
      case 'graveyard': return other.graveyard.length >= predicate.min;
      default: throw new Error('Unknown combat player predicate: ' + predicate.kind);
    }
  }

  // Every restriction is re-created by normal recalculation. The callbacks
  // read live characteristics at declaration; nothing is baked into a card.
  MTG.oracleV8ApplyCombatRule = function (game, card, rule, controller) {
    if(MTG.OracleV8CombatRestrictions?.apply(game,card,rule,controller))return;
    const fields = {
      'blocker-bounds': ['min', 'max'], 'block-capacity': ['additional', 'any', 'equipment'], companion: ['attack', 'block', 'greaterPower', 'colors'],
      'defender-attack': ['predicate'], 'attacker-block': ['predicate'],
      'defender-evasion': ['predicate', 'negate', 'blockerPowerMin'], 'monarch-blockers': [],
      'cast-history': ['mode', 'quality'], 'opponent-damaged': [],
    }[rule?.kind];
    if (!fields) throw new Error('Unknown combat declaration rule');
    assertFields(rule, ['kind', ...fields], 'combat declaration');
    if (rule.kind === 'block-capacity') {
      if (['additional', 'any', 'equipment'].filter(key => rule[key] !== undefined).length !== 1 || rule.additional !== undefined && (!Number.isInteger(rule.additional) || rule.additional < 1) || rule.any !== undefined && rule.any !== true || rule.equipment !== undefined && rule.equipment !== true) throw new Error('Invalid blocker capacity');
      if (rule.any) card.cur.blockAnyNumber = true;
      else card.cur.additionalBlocks = (card.cur.additionalBlocks || 0) + (rule.equipment ? (card.attachments || []).filter(iid => {const equipment = game.byIid(iid); return equipment?.zone === 'battlefield' && equipment.attachedTo === card.iid && equipment.hasSub('Equipment');}).length : rule.additional);
      return;
    }
    if (rule.kind === 'blocker-bounds') {
      if (rule.min !== undefined) { if (!Number.isInteger(rule.min) || rule.min < 1) throw new Error('Invalid minimum blockers'); card.cur.minBlockers = Math.max(card.cur.minBlockers || 1, rule.min); }
      if (rule.max !== undefined) { if (!Number.isInteger(rule.max) || rule.max < 1) throw new Error('Invalid maximum blockers'); card.cur.maxBlockers = Math.min(card.cur.maxBlockers ?? Infinity, rule.max); }
      return;
    }
    if (rule.kind === 'companion') {
      if (typeof rule.attack !== 'boolean' || typeof rule.block !== 'boolean' || !rule.attack && !rule.block || rule.greaterPower !== undefined && rule.greaterPower !== true || rule.colors && JSON.stringify(rule.colors) !== '["B","G"]') throw new Error('Invalid companion restriction');
      const test = group => group.some(other => other !== card && (!rule.greaterPower || other.power > card.power) && (!rule.colors || other.colors.some(color => rule.colors.includes(color))));
      if (rule.attack) (card.cur.attackGroupRestrictions ||= []).push(test);
      if (rule.block) (card.cur.blockGroupRestrictions ||= []).push(test);
      return;
    }
    if (rule.predicate) {
      const permitted = {'permanent': ['types', 'untapped', 'snow'], 'more-permanents': ['type'], 'enchantment-or-enchanted': [], 'most-creatures': [], 'shared-creature-type': ['min'], poisoned: [], monarch: [], graveyard: ['min']}[rule.predicate.kind];
      if (!permitted) throw new Error('Invalid combat predicate');
      assertFields(rule.predicate, ['kind', ...permitted], 'combat player predicate');
      if (rule.predicate.kind === 'permanent' && (!Array.isArray(rule.predicate.types) || !rule.predicate.types.length || rule.predicate.types.some(type => !['Creature', 'Artifact', 'Enchantment', 'Land'].includes(type)))) throw new Error('Invalid combat types');
      if (['shared-creature-type', 'graveyard'].includes(rule.predicate.kind) && (!Number.isInteger(rule.predicate.min) || rule.predicate.min < 1)) throw new Error('Invalid combat count');
    }
    const cast = () => (controller.turnState.spellsCastList || []).some(record => rule.quality === 'historic' ? record.historic : rule.quality === 'creature' ? record.isCreature : !record.isCreature);
    if (rule.kind === 'cast-history' && (!['attack', 'evasion'].includes(rule.mode) || !['historic', 'creature', 'noncreature'].includes(rule.quality))) throw new Error('Invalid combat spell history');
    if (rule.kind === 'defender-attack' || rule.kind === 'cast-history' && rule.mode === 'attack' || rule.kind === 'opponent-damaged') {
      (card.cur.attackRestrictions ||= []).push((g, target) => rule.kind === 'defender-attack' ? combatPredicate(g, controller, target instanceof MTG.Player ? target : target.ctrl, rule.predicate)
        : rule.kind === 'cast-history' ? cast() : g.alivePlayers().some(player => player !== controller && player.turnState.damageTaken > 0));
    } else if (rule.kind === 'attacker-block') {
      const previous = card.cur.cantBlockCreature;
      card.cur.cantBlockCreature = (g, attacker) => !!previous?.(g, attacker) || !combatPredicate(g, controller, attacker.ctrl, rule.predicate);
    } else {
      const previous = card.cur.cantBeBlockedBy;
      card.cur.cantBeBlockedBy = (g, blocker) => {
        if (previous?.(g, blocker)) return true;
        if (rule.kind === 'monarch-blockers') return g.monarch === blocker.ctrl;
        if (rule.kind === 'cast-history') return cast();
        const defending = card.attacking instanceof MTG.Player ? card.attacking : card.attacking?.ctrl || blocker.ctrl;
        const applies = combatPredicate(g, controller, defending, rule.predicate);
        return (rule.negate ? !applies : applies) && (rule.blockerPowerMin === undefined || blocker.power >= rule.blockerPowerMin);
      };
    }
  };

  // A choice made during the turn-based untap action never goes on the Stack.
  // The turn runner collects all choices before applying any untap or stun
  // replacement; this helper neither changes the card nor grants priority.
  MTG.oracleV8ShouldUntap = async function (game, player, card) {
    if (!(card instanceof MTG.CardInst) || card.zone !== 'battlefield' || card.ctrl !== player) throw new Error('Invalid optional untap participant');
    if (!card.cur?.optionalUntap || !card.tapped) return true;
    if (card.cur.cantUntap || card.def.doesntUntap || card.meta.noUntapOnce) return false;
    const answer = await player.controller.decide(game, {
      type: 'chooseOption', prompt: 'Untap ' + card.name + '?',
      options: [{key: 'yes', label: 'Untap'}, {key: 'no', label: 'Keep tapped'}],
      aiHint: {kind: 'optionalUntap', card},
    });
    if (answer !== 'yes' && answer !== 'no') throw new Error('Invalid optional untap choice');
    return answer === 'yes';
  };

  const events = {
    cardToGraveyard: {fields: ['card'], player: 'owner', from: true},
    cardLeftGraveyard: {fields: ['card'], player: 'owner', to: true},
    turnedFaceUp: {fields: ['card'], player: 'player'},
    cycled: {fields: ['card'], player: 'player'},
    discarded: {fields: ['card'], player: 'player'},
    landPlayed: {fields: ['card'], player: 'player'},
    sacrificed: {fields: ['card'], player: 'player', snapshot: true},
    dies: {fields: ['card'], player: 'controller', snapshot: true},
    lto: {fields: ['card'], player: 'controller', snapshot: true},
    etb: {fields: ['card'], player: 'controller'},
    targeted: {fields: ['card'], player: 'byPlayer', targeted: true},
    cast: {fields: ['so'], player: 'player'},
    countersPlaced: {fields: ['card'], player: 'ctrl', counter: true, positive: true},
    countersRemoved: {fields: ['card'], player: 'ctrl', counter: true, positive: true},
    dealtDamage: {fields: ['target', 'src'], player: 'controller', damage: true, positive: true},
    damageToPlayer: {fields: ['src'], player: 'player', damage: true, positive: true},
    combatDamageToPlayer: {fields: ['card'], player: 'player', damage: true, positive: true},
    becameTapped: {fields: ['card'], player: 'player'},
    becameUntapped: {fields: ['card'], player: 'player'},
    abilityActivated: {fields: ['card'], player: 'player', activated: true},
    attacks: {fields: ['card'], player: 'player'},
    blocks: {fields: ['blocker', 'attacker'], player: 'controller', combatants: true},
    becomesBlocked: {fields: ['attacker'], player: 'controller', combatants: true, blockers: true},
    becomesBlockedByCreature: {fields: ['attacker', 'blocker'], player: 'controller', combatants: true},
    attackersDeclared: {fields: ['attackers'], player: 'player', attackers: true},
    lifeGain: {fields: [], player: 'player', positive: true},
    lifeLost: {fields: [], player: 'player', positive: true},
    draw: {fields: ['card'], player: 'player'},
    crime: {fields: [], player: 'player'},
    scry: {fields: [], player: 'player'},
  };
  const keys = new Set(['kind', 'field', 'target', 'player', 'playerField', 'subject', 'sourceSelf', 'attachedSource', 'sourceField', 'sourceSubject', 'blockerTarget', 'lookBack', 'from', 'to', 'counter', 'minAmount', 'maxAmount', 'zeroRemaining', 'combat', 'spellOnly', 'instantSorceryOnly', 'nonmana', 'firstThisTurn', 'totalMin', 'totalMax', 'minMatching', 'selfAttacking', 'defendingYou', 'defender', 'damageSourceController', 'enteredTapped', 'castTarget', 'castTargetsSelf', 'castOrdinal', 'castMinimumOrdinal', 'casterTurn', 'castKicked', 'castAdventure', 'perDefender', 'declaredDefender', 'attackerStatus', 'attachedAttacking', 'minOtherThanAttached']);
  keys.add('headerCondition');
  keys.add('damageByThisTurn');
  const zones = new Set(['battlefield', 'graveyard', 'hand', 'library', 'stack', 'exile', 'command']);

  function validate(event, rule) {
    if (rule?.kind !== 'v8-event') return null;
    const schema = events[event];
    if (!schema) throw new Error('Unsupported v8 event: ' + event);
    if (Object.keys(rule).some(key => !keys.has(key))) throw new Error('Unknown v8 event predicate field');
    if (rule.headerCondition !== undefined && (!['attacks', 'blocks'].includes(event) || rule.subject !== 'self' || !rule.headerCondition || typeof rule.headerCondition !== 'object')) throw new Error('Invalid v8 trigger-event condition');
    if(rule.damageByThisTurn!==undefined&&(event!=='dies'||!['self','attached'].includes(rule.damageByThisTurn)))throw new Error('Invalid v8 historical-damage event');
    if (rule.field !== undefined && !schema.fields.includes(rule.field)) throw new Error('Invalid v8 event object field');
    if (rule.player !== undefined && !['you', 'opponent', 'any'].includes(rule.player)) throw new Error('Invalid v8 event player relation');
    if (rule.playerField !== undefined && !(rule.playerField === 'by' && event === 'countersPlaced' || rule.playerField === 'owner' && ['dies', 'cardToGraveyard', 'cardLeftGraveyard'].includes(event) || rule.playerField === 'defender' && (schema.combatants||event==='attacks'))) throw new Error('Invalid v8 event player field');
    if (rule.lookBack !== undefined && !(rule.lookBack === false && ['dies', 'cardToGraveyard'].includes(event))) throw new Error('Invalid v8 event observation zone');
    if (rule.subject !== undefined && !['self', 'another', 'attached'].includes(rule.subject)) throw new Error('Invalid v8 event object relation');
    for (const key of ['sourceSelf', 'attachedSource', 'zeroRemaining', 'spellOnly', 'instantSorceryOnly', 'firstThisTurn', 'selfAttacking', 'defendingYou']) {
      if (rule[key] !== undefined && typeof rule[key] !== 'boolean') throw new Error('Invalid v8 event boolean predicate');
    }
    if ((rule.subject || rule.target) && !schema.fields.length) throw new Error('V8 event has no object');
    if (rule.sourceSelf && !schema.damage || rule.attachedSource && !schema.damage) throw new Error('V8 event has no damage source');
    if (rule.sourceSelf && rule.attachedSource) throw new Error('Conflicting v8 damage sources');
    if (rule.sourceField !== undefined && (!schema.combatants || !schema.fields.includes(rule.sourceField) || !['self', 'attached'].includes(rule.sourceSubject))) throw new Error('Invalid v8 combat participant binding');
    if (rule.sourceSubject !== undefined && rule.sourceField === undefined) throw new Error('Missing v8 combat participant field');
    if (rule.blockerTarget !== undefined && !schema.blockers) throw new Error('V8 event has no blocker group');
    if (rule.from !== undefined && (!schema.from || !zones.has(rule.from))) throw new Error('Invalid v8 source zone');
    if (rule.to !== undefined && (!schema.to || !zones.has(rule.to))) throw new Error('Invalid v8 destination zone');
    if (rule.counter !== undefined && (!schema.counter || typeof rule.counter !== 'string' || !rule.counter)) throw new Error('Invalid v8 counter predicate');
    if (rule.zeroRemaining && event !== 'countersRemoved') throw new Error('V8 event has no remaining-counter count');
    if (rule.combat !== undefined && (!schema.damage || typeof rule.combat !== 'boolean')) throw new Error('Invalid v8 combat predicate');
    if ((rule.spellOnly || rule.instantSorceryOnly) && !schema.targeted) throw new Error('V8 event has no targeting spell');
    if (rule.nonmana !== undefined && (!schema.activated || typeof rule.nonmana !== 'boolean')) throw new Error('Invalid v8 activated-ability predicate');
    if (rule.firstThisTurn && !['becameTapped', 'attacks', 'combatDamageToPlayer'].includes(event)) throw new Error('V8 event has no first-event marker');
    if (rule.perDefender !== undefined && (!schema.attackers || !['player', 'player-or-planeswalker'].includes(rule.perDefender))) throw new Error('Invalid v8 declared defender group');
    if (rule.declaredDefender !== undefined && (!schema.attackers || rule.declaredDefender !== 'you')) throw new Error('Invalid v8 declared defender relation');
    if (rule.attackerStatus !== undefined && (!schema.attackers || !['suspected', 'enchanted-by-you'].includes(rule.attackerStatus))) throw new Error('Invalid v8 declared attacker status');
    if (rule.attachedAttacking !== undefined && (!schema.attackers || rule.attachedAttacking !== true)) throw new Error('Invalid v8 attached attacker');
    if (rule.minOtherThanAttached !== undefined && (!schema.attackers || !rule.attachedAttacking || !Number.isSafeInteger(rule.minOtherThanAttached) || rule.minOtherThanAttached < 1)) throw new Error('Invalid v8 attached attacker cohort');
    if (rule.defender !== undefined && (event !== 'attacks' || !['you', 'opponent', 'you-or-your-planeswalker'].includes(rule.defender))) throw new Error('Invalid v8 attack defender');
    if (rule.damageSourceController !== undefined && (!schema.damage || !['you', 'opponent', 'any'].includes(rule.damageSourceController))) throw new Error('Invalid v8 damage source controller');
    if (rule.enteredTapped !== undefined && (event !== 'etb' || typeof rule.enteredTapped !== 'boolean')) throw new Error('Invalid v8 entry tap state');
    if (['castTarget', 'castTargetsSelf', 'castOrdinal', 'castMinimumOrdinal', 'casterTurn', 'castKicked', 'castAdventure'].some(key => rule[key] !== undefined) && event !== 'cast') throw new Error('V8 event has no cast declaration');
    if (rule.castTarget !== undefined && rule.castTarget?.zone !== 'battlefield' || rule.castTarget && rule.castTargetsSelf) throw new Error('Invalid v8 cast target predicate');
    for (const key of ['castTargetsSelf', 'casterTurn', 'castKicked', 'castAdventure']) if (rule[key] !== undefined && rule[key] !== true) throw new Error('Invalid v8 cast qualifier');
    for (const key of ['castOrdinal', 'castMinimumOrdinal']) if (rule[key] !== undefined && (!Number.isSafeInteger(rule[key]) || rule[key] < 1)) throw new Error('Invalid v8 cast ordinal');
    if (['totalMin', 'totalMax', 'minMatching', 'selfAttacking', 'defendingYou'].some(key => rule[key] !== undefined) && !schema.attackers) throw new Error('V8 event has no declared attackers');
    for (const key of ['minAmount', 'maxAmount', 'totalMin', 'totalMax', 'minMatching']) {
      if (rule[key] !== undefined && (!Number.isSafeInteger(rule[key]) || rule[key] < 0)) throw new Error('Invalid v8 event count');
    }
    if ((rule.minAmount !== undefined || rule.maxAmount !== undefined) && !schema.positive) throw new Error('V8 event has no positive amount');
    return schema;
  }

  function sourceSnapshot(game, source, data) {
    return data?.card === source && data.snap ||
      (game._simultaneousLeaveSources || []).find(entry => entry.card === source)?.snap ||
      (data?.snap?.attachedSources || []).find(entry => entry.card === source)?.snap;
  }

  function cardAt(event, rule, data) {
    const schema = events[event];
    const field = rule.field || schema.fields[0];
    if (!field || field === 'attackers') return null;
    return field === 'so' ? data?.so?.card : data?.[field];
  }

  function snapshotObject(card, snapshot) {
    if (!snapshot) return card;
    return {...snapshot, _oracleLKI: true, zone: 'battlefield', owner: card.owner,
      def: snapshot.def || card.def, cur: {super: snapshot.super || snapshot.def?.super || []},
      is: type => (snapshot.types || []).includes(type),
      hasSub: type => (snapshot.subtypes || []).includes(type) || !!(snapshot.def?.changeling && !snapshot.abilitiesDisabled),
      kw: keyword => (snapshot.kw || []).includes(keyword)};
  }

  function eventPlayer(event, rule, data, card) {
    const field = rule.playerField || events[event].player;
    if (field === 'defender') {const defender=data?.defender||data?.attacker?.attacking;return defender instanceof MTG.Player?defender:defender?.ctrl;}
    if (field === 'owner') return card?.owner;
    if (field === 'controller') return data?.card === card && data.snap ? data.snap.ctrl : card?.ctrl;
    return data?.[field];
  }

  MTG.oracleV8TriggerBindings = function (event, rule, game, source, data) {
    const schema = validate(event, rule);
    if (!schema) return null;
    const card = schema.attackers
      ? rule.totalMax === 1 && data?.attackers?.length === 1 ? data.attackers[0] : null
      : cardAt(event, rule, data);
    return {eventCard: card instanceof MTG.CardInst ? card : null,
      eventPlayer: eventPlayer(event, rule, data, card),
      eventController: schema.snapshot && rule.lookBack !== false && data?.card === card ? data.snap?.ctrl || card?.ctrl : card?.ctrl};
  };

  MTG.oracleV8CaptureConditionEvent = function (game, source, event, data) {
    const card = event === 'damageToPlayer' ? data?.src : data?.card;
    const past = ['dies', 'lto'].includes(event) && data?.snap;
    const snapshot = past || (card instanceof MTG.CardInst ? game.snapshot(card) : null);
    const sourceHistory = sourceSnapshot(game, source, data);
    const spell = data?.so;
    return {event, card, zoneVersion: snapshot?.zoneVersion, zone: past ? 'battlefield' : card?.zone,
      snapshot, source, sourceVersion: sourceHistory?.zoneVersion ?? source.zoneVersion,
      sourceSnapshot: sourceHistory || game.snapshot(source), player: data?.player,
      cast: event === 'cast' ? {kicked: !!spell?.kicked, manaSpent: Number(spell?.manaSpent) || 0} : null};
  };

  function conditionObject(record, source = false) {
    const card = source ? record.source : record.card;
    if (!(card instanceof MTG.CardInst)) return null;
    const version = source ? record.sourceVersion : record.zoneVersion;
    const zone = source ? 'battlefield' : record.zone;
    if (card.zoneVersion === version && card.zone === zone) return card;
    return snapshotObject(card, card.battlefieldLKI?.get(version) || (source ? record.sourceSnapshot : record.snapshot));
  }

  MTG.oracleV8EventCondition = function (game, source, condition, controller, record, genericTargetSpec) {
    if (condition?.kind !== 'v8-event-condition') return undefined;
    const fields = {
      'cast-kicked': [], 'caster-not-turn': [], 'cast-mana': ['min'], 'cast-mana-vs-source-power': [],
      'past-counters': ['counter', 'min', 'max'], 'past-blocking': ['negate'], 'past-quality': ['filter'], 'past-historic': [], 'past-owned-aura': [],
      'entered-turn': [], 'live-quality': ['filter'], 'live-keyword': ['keyword', 'negate'], 'live-stats': ['power', 'toughness'], 'greater-than-source': [],
    };
    const allowed = fields[condition.predicate];
    if (!allowed || Object.keys(condition).some(key => !['kind', 'predicate', ...allowed].includes(key))) throw new Error('Invalid bound Oracle condition');
    if (condition.negate !== undefined && condition.negate !== true) throw new Error('Invalid bound Oracle condition negation');
    for (const key of ['min', 'max', 'power', 'toughness']) if (condition[key] !== undefined && (!Number.isSafeInteger(condition[key]) || condition[key] < 0)) throw new Error('Invalid bound Oracle condition number');
    if (condition.counter !== undefined && typeof condition.counter !== 'string' || condition.keyword !== undefined && typeof condition.keyword !== 'string') throw new Error('Invalid bound Oracle condition property');
    if (!record) return false;
    const predicate = condition.predicate;
    if (predicate.startsWith('cast-') || predicate === 'caster-not-turn') {
      if (record.event !== 'cast' || !record.cast) return false;
      if (predicate === 'cast-kicked') return record.cast.kicked;
      if (predicate === 'caster-not-turn') return record.player instanceof MTG.Player && record.player !== game.turnPlayer;
      if (predicate === 'cast-mana') return record.cast.manaSpent >= condition.min;
      const currentSource = conditionObject(record, true);
      return !!currentSource && record.cast.manaSpent > Number(currentSource.power);
    }
    if (predicate.startsWith('past-')) {
      if (!['dies', 'lto'].includes(record.event) || !record.snapshot) return false;
      const snapshot = record.snapshot;
      if (predicate === 'past-counters') {
        const n = condition.counter ? snapshot.counters[condition.counter] || 0 : Object.values(snapshot.counters).reduce((total, value) => total + value, 0);
        return (condition.min === undefined || n >= condition.min) && (condition.max === undefined || n <= condition.max);
      }
      if (predicate === 'past-blocking') { const blocking = snapshot.blocking !== null && snapshot.blocking !== undefined && snapshot.blocking !== false; return condition.negate ? !blocking : blocking; }
      if (predicate === 'past-historic') return snapshot.types.includes('Artifact') || snapshot.super.includes('Legendary') || snapshot.subtypes.includes('Saga');
      if (predicate === 'past-owned-aura') return (snapshot.attachedSources || []).some(entry => entry.ctrl === controller && entry.snap?.subtypes?.includes('Aura'));
      return !!genericTargetSpec(condition.filter, [], 0).filter(game, snapshotObject(record.card, snapshot), controller, source);
    }
    const object = conditionObject(record);
    if (!object) return false;
    if (predicate === 'entered-turn') return (object._oracleLKI ? object.enteredTurn : object.meta?._enteredTurn) === game.turnNo;
    if (predicate === 'live-quality') return !!genericTargetSpec(condition.filter, [], 0).filter(game, object, controller, source);
    if (predicate === 'live-keyword') { const has = object.kw(condition.keyword); return condition.negate ? !has : has; }
    if (predicate === 'live-stats') return object.is('Creature') && object.power === condition.power && object.toughness === condition.toughness;
    if (predicate === 'greater-than-source') {
      const currentSource = conditionObject(record, true);
      return !!currentSource && object.is('Creature') && currentSource.is('Creature') && (object.power > currentSource.power || object.toughness > currentSource.toughness);
    }
    return false;
  };

  function declaredAttackers(game, source, data, rule, target) {
    if (!Array.isArray(data?.attackers)) return [];
    const controller = source.ctrl;
    return data.attackers.filter(attacker => {
      if (!(attacker instanceof MTG.CardInst)) return false;
      if (rule.declaredDefender === 'you' && attacker.attacking !== controller) return false;
      if (rule.perDefender && !(attacker.attacking instanceof MTG.Player || rule.perDefender === 'player-or-planeswalker' && attacker.attacking instanceof MTG.CardInst && attacker.attacking.is('Planeswalker'))) return false;
      if (rule.attackerStatus === 'suspected' && !attacker.meta?.suspected) return false;
      if (rule.attackerStatus === 'enchanted-by-you' && !(attacker.attachments || []).some(iid => {
        const aura = game.byIid(iid);
        return aura?.zone === 'battlefield' && aura.attachedTo === attacker.iid && aura.hasSub('Aura') && aura.ctrl === controller;
      })) return false;
      return !target || target.filter(game, attacker, controller, source);
    });
  }

  MTG.oracleV8TriggerTimes = function (event, rule, genericTargetSpec) {
    if (rule?.kind !== 'v8-event' || !rule.perDefender) return undefined;
    validate(event, rule);
    const target = rule.target ? genericTargetSpec(rule.target, [], 0) : null;
    return (game, source, data) => new Set(declaredAttackers(game, source, data, rule, target).map(attacker => attacker.attacking)).size;
  };

  MTG.oracleV8TriggerFilter = function (event, rule, genericTargetSpec, genericCondition) {
    const schema = validate(event, rule);
    if (!schema) return null;
    const target = rule.target ? genericTargetSpec(rule.target, [], 0) : null;
    const blockerTarget = rule.blockerTarget ? genericTargetSpec(rule.blockerTarget, [], 0) : null;
    const castTarget = rule.castTarget ? genericTargetSpec(rule.castTarget, [], 0) : null;
    return (game, source, data) => {
      if (!data) return false;
      const snap = sourceSnapshot(game, source, data), controller = snap?.ctrl || source.ctrl;
      if(rule.damageByThisTurn&&!MTG.OracleV8DamageHistory.damaged(game,source,snap,data.card,data.snap,rule.damageByThisTurn))return false;
      if (rule.headerCondition && !genericCondition(game, source, rule.headerCondition, controller)) return false;
      const card = cardAt(event, rule, data);
      if (event === 'cast') {
        if (rule.castOrdinal !== undefined && data.nthThisTurn !== rule.castOrdinal || rule.castMinimumOrdinal !== undefined && !(data.nthThisTurn >= rule.castMinimumOrdinal)) return false;
        if (rule.casterTurn && game.turnPlayer !== data.player || rule.castKicked && !data.so?.kicked) return false;
        if (rule.castAdventure && (!data.isCreature || !data.so?.card?.def.adventure || data.so?.castOpts?.adventure)) return false;
        const announcedTargets = (data.so?.targets || []).flat().filter(Boolean);
        if (rule.castTargetsSelf && !announcedTargets.includes(source) || castTarget && !announcedTargets.some(target => castTarget.filter(game, target, controller, source))) return false;
      }
      if (rule.enteredTapped !== undefined && (!card || !!card.tapped !== rule.enteredTapped)) return false;
      const player = eventPlayer(event, rule, data, card);
      if (rule.player && (!(player instanceof MTG.Player) || rule.player === 'you' && player !== controller || rule.player === 'opponent' && player === controller)) return false;
      if (schema.positive && !(Number(data.n) > 0)) return false;
      if (rule.minAmount !== undefined && data.n < rule.minAmount || rule.maxAmount !== undefined && data.n > rule.maxAmount) return false;
      if (rule.from !== undefined && data.from !== rule.from || rule.to !== undefined && data.to !== rule.to) return false;
      if (rule.counter !== undefined && data.kind !== rule.counter || rule.zeroRemaining && data.after !== 0) return false;
      if (rule.combat !== undefined && (event === 'combatDamageToPlayer' || !!data.combat) !== rule.combat) return false;
      if (rule.spellOnly && !data.isSpell || rule.instantSorceryOnly && !data.isInstantSorcery) return false;
      if (rule.nonmana !== undefined && data.isMana !== !rule.nonmana) return false;
      if (rule.firstThisTurn && !data.firstThisTurn) return false;
      if (rule.defender) {
        const defender = data.defender;
        const matches = rule.defender === 'you' ? defender === controller
          : rule.defender === 'opponent' ? defender instanceof MTG.Player && defender !== controller
          : defender === controller || defender instanceof MTG.CardInst && defender.is('Planeswalker') && defender.ctrl === controller;
        if (!matches) return false;
      }
      if (rule.sourceField) {
        const participant = data[rule.sourceField];
        if (rule.sourceSubject === 'self' ? participant !== source : !participant || participant.iid !== (snap?.attachedTo ?? source.attachedTo)) return false;
      }
      if (blockerTarget && (!Array.isArray(data.blockers) || !data.blockers.some(blocker => blockerTarget.filter(game, blocker, controller, source)))) return false;
      const damageSource = event === 'combatDamageToPlayer' ? data.card : data.src;
      if (rule.damageSourceController && (!(damageSource?.ctrl instanceof MTG.Player) ||
        rule.damageSourceController === 'you' && damageSource.ctrl !== controller ||
        rule.damageSourceController === 'opponent' && damageSource.ctrl === controller)) return false;
      if (rule.sourceSelf && !sameObject(damageSource, source)) return false;
      if (rule.attachedSource && (!damageSource || damageSource.iid !== (snap?.attachedTo ?? source.attachedTo))) return false;
      if (schema.attackers) {
        if (!Array.isArray(data.attackers)) return false;
        if (rule.totalMin !== undefined && data.attackers.length < rule.totalMin || rule.totalMax !== undefined && data.attackers.length > rule.totalMax) return false;
        if (rule.selfAttacking && !data.attackers.includes(source)) return false;
        const attached = rule.attachedAttacking && game.byIid(snap?.attachedTo ?? source.attachedTo);
        if (rule.attachedAttacking && (!attached || !data.attackers.includes(attached))) return false;
        if (rule.minOtherThanAttached !== undefined && data.attackers.filter(attacker => attacker !== attached).length < rule.minOtherThanAttached) return false;
        const matches = declaredAttackers(game, source, data, rule, target).filter(attacker =>
          (!rule.subject || (rule.subject === 'self' ? attacker === source : rule.subject === 'another' ? attacker !== source : attacker.iid === (snap?.attachedTo ?? source.attachedTo))) &&
          (!rule.defendingYou || attacker.attacking === controller || attacker.attacking?.ctrl === controller) &&
          (!target || target.filter(game, attacker, controller, source)));
        return matches.length >= (rule.minMatching ?? 1);
      }
      if (schema.fields.length && !card) return false;
      if (rule.subject === 'self' && card !== source || rule.subject === 'another' && card === source) return false;
      if (rule.subject === 'attached' && card?.iid !== (snap?.attachedTo ?? source.attachedTo)) return false;
      if (!target) return true;
      const object = (rule.field || schema.fields[0]) === 'so' ? data.so
        : snapshotObject(card, schema.snapshot && rule.lookBack !== false && data.card === card ? data.snap : null);
      return !!object && target.filter(game, object, controller, source);
    };
  };

  function assertFields(object, allowed, label) {
    if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(key => !allowed.includes(key))) throw new Error('Invalid v8 ' + label);
  }

  function arithmetic(transform) {
    assertFields(transform, ['add', 'multiply', 'divide', 'round', 'set'], 'replacement arithmetic');
    const modes = ['add', 'multiply', 'divide', 'set'].filter(key => transform[key] !== undefined);
    if (modes.length !== 1) throw new Error('V8 replacement needs exactly one arithmetic operation');
    const mode = modes[0], value = transform[mode];
    if (!Number.isSafeInteger(value) || mode !== 'add' && value < 0 || mode === 'divide' && value === 0 || mode === 'multiply' && value === 0) throw new Error('Invalid v8 replacement amount');
    if (mode === 'divide' ? transform.round !== 'down' : transform.round !== undefined) throw new Error('Invalid v8 replacement rounding');
    return n => Math.max(0, mode === 'set' ? value : mode === 'add' ? n + value : mode === 'multiply' ? n * value : Math.floor(n / value));
  }

  function sameObject(card, source) {
    return card === source || !!card && !!source && card.iid === source.iid && card.zoneVersion === source.zoneVersion;
  }

  function replacementSourcePredicate(rule, targetCompiler) {
    if (rule.alternatives) {
      assertFields(rule, ['alternatives'], 'damage source union');
      if (!Array.isArray(rule.alternatives) || rule.alternatives.length < 2) throw new Error('Invalid replacement source union');
      const alternatives = rule.alternatives.map(child => replacementSourcePredicate(child, targetCompiler));
      return (...args) => alternatives.some(match => match(...args));
    }
    assertFields(rule, ['subject', 'filter', 'controller', 'another', 'anotherThanAttached', 'spellOnly', 'permanentOnly'], 'damage source');
    if (rule.another !== undefined && typeof rule.another !== 'boolean' || rule.spellOnly !== undefined && typeof rule.spellOnly !== 'boolean' || rule.permanentOnly !== undefined && typeof rule.permanentOnly !== 'boolean') throw new Error('Invalid v8 replacement source predicate');
    if (rule.subject && !['self', 'attached'].includes(rule.subject) || rule.subject && (rule.filter || rule.controller || rule.another || rule.spellOnly)) throw new Error('Invalid v8 replacement source binding');
    if (!rule.subject && !rule.filter || rule.controller && !['you', 'opponent', 'any'].includes(rule.controller)) throw new Error('Invalid v8 replacement source filter');
    const target = rule.filter ? targetCompiler(rule.filter, [], 0) : null;
    return (game, card, source, snapshot) => {
      if (!card) return false;
      if (rule.subject === 'self') return sameObject(card, source);
      if (rule.subject === 'attached') return sameObject(card, game.byIid(source.attachedTo));
      if (rule.another && sameObject(card, source)) return false;
      if (rule.anotherThanAttached && sameObject(card, game.byIid(source.attachedTo))) return false;
      if (rule.permanentOnly && card.zone !== 'battlefield' && !card._oracleLKI) return false;
      const candidate = snapshotObject(card, snapshot);
      if (rule.controller === 'you' && candidate.ctrl !== source.ctrl || rule.controller === 'opponent' && candidate.ctrl === source.ctrl) return false;
      if (rule.spellOnly && card.zone !== 'stack') return false;
      return !!target.filter(game, candidate, source.ctrl, source);
    };
  }

  function replacementRecipientPredicate(rule, targetCompiler) {
    assertFields(rule, ['subject', 'players', 'permanents'], 'damage recipient');
    if (rule.subject && !['self', 'attached'].includes(rule.subject) || rule.subject && (rule.players || rule.permanents) || !rule.subject && !rule.players && !rule.permanents) throw new Error('Invalid v8 replacement recipient binding');
    if (rule.players && !['you', 'opponent', 'any'].includes(rule.players)) throw new Error('Invalid v8 replacement player relation');
    const target = rule.permanents ? targetCompiler(rule.permanents, [], 0) : null;
    return (game, card, source) => {
      if (rule.subject === 'self') return sameObject(card, source);
      if (rule.subject === 'attached') return sameObject(card, game.byIid(source.attachedTo));
      if (card instanceof MTG.Player) return !!rule.players && (rule.players === 'any' || (rule.players === 'you' ? card === source.ctrl : card !== source.ctrl));
      return !!target && card?.zone === 'battlefield' && !!target.filter(game, card, source.ctrl, source);
    };
  }

  // The central engine owns replacement ordering. `applies` is deliberately
  // pure so it can be rechecked after the affected player selects another
  // replacement; `run` transforms exactly one already selected event.
  MTG.oracleV8CompileReplacement = function (operation, helpers) {
    if (operation?.kind !== 'v8-replacement') return null;
    if (operation.contract !== 'ordered-replacement-effect') throw new Error('Invalid v8 replacement contract');
    const common = ['kind', 'event', 'contract'];
    let replacement;
    if (operation.event === 'etbTapped' || operation.event === 'etbCounters') {
      assertFields(operation, [...common, 'filters', operation.event === 'etbTapped' ? 'tapped' : 'n'], 'entry replacement');
      if (!Array.isArray(operation.filters) || !operation.filters.length || operation.filters.some(filter => filter.zone !== 'battlefield')) throw new Error('Invalid v8 entry recipients');
      if (operation.event === 'etbTapped' ? operation.tapped !== true : !Number.isSafeInteger(operation.n) || operation.n < 1) throw new Error('Invalid v8 entry outcome');
      const targets = operation.filters.map(filter => helpers.target(filter, [], 0));
      const applies = (game, card, source) => card instanceof MTG.CardInst && card.zone === 'battlefield' &&
        (operation.event !== 'etbCounters' || card.is('Creature')) && targets.some(target => target.filter(game, card, source.ctrl, source));
      replacement = operation.event === 'etbTapped'
        ? {event: 'etbTapped', applies, run: (game, card, source) => { if (applies(game, card, source)) card.tapped = true; }}
        : {event: 'etbCounters', applies, n: operation.n, run: applies};
    } else if (operation.event === 'damage') {
      assertFields(operation, [...common, 'source', 'recipient', 'transform', 'combat', 'minAmount', 'maxAmount', 'prevent', 'requiresCounter', 'counterEffect', 'condition'], 'damage replacement');
      if (operation.combat !== undefined && typeof operation.combat !== 'boolean' || ['minAmount', 'maxAmount'].some(field => operation[field] !== undefined && (!Number.isSafeInteger(operation[field]) || operation[field] < 1))) throw new Error('Invalid v8 replacement damage predicate');
      if (operation.prevent !== undefined && operation.prevent !== true) throw new Error('Invalid v8 damage prevention marker');
      if (operation.requiresCounter !== undefined && (!operation.prevent || operation.requiresCounter !== '+1/+1')) throw new Error('Invalid v8 prevention counter condition');
      const counter = operation.counterEffect;
      if (counter) {
        assertFields(counter, ['operation', 'subject', 'counter', 'n'], 'prevention counter instruction');
        if (!operation.prevent || !['remove', 'add'].includes(counter.operation) || !['self', 'recipient'].includes(counter.subject) || !['+1/+1', '-1/-1'].includes(counter.counter) ||
          !(['damage', 'prevented'].includes(counter.n) || Number.isSafeInteger(counter.n) && counter.n > 0)) throw new Error('Invalid v8 prevention counter instruction');
      }
      const from = replacementSourcePredicate(operation.source, helpers.target), to = replacementRecipientPredicate(operation.recipient, helpers.target), transform = arithmetic(operation.transform);
      const applies = (game, data, source) => data.n > 0 && (operation.combat === undefined || !!data.combat === operation.combat) &&
        (!operation.condition || helpers.condition(game, source, operation.condition)) &&
        (operation.minAmount === undefined || data.n >= operation.minAmount) && (operation.maxAmount === undefined || data.n <= operation.maxAmount) &&
        (!operation.requiresCounter || source.counters[operation.requiresCounter] > 0) && from(game, data.src, source, data.sourceSnapshot) && to(game, data.target, source);
      replacement = {event: 'damage', applies, ...(operation.prevent ? {prevent: !counter, oraclePrevention: true} : {}), run: (game, data, source) => {
        if (!applies(game, data, source)) return data.n;
        const allowed = !operation.prevent || !game.bf().some(card => !card.cur?.abilitiesDisabled && card.def.damageCantBePrevented);
        const result = allowed ? transform(data.n) : data.n;
        if (counter) {
          const card = counter.subject === 'self' ? source : data.target;
          if (!(card instanceof MTG.CardInst) || card.zone !== 'battlefield') throw new Error('Missing prevention counter recipient');
          const n = counter.n === 'damage' ? data.n : counter.n === 'prevented' ? data.n - result : counter.n;
          if (counter.operation === 'add') game.addCounters(card, counter.counter, n, false, source.ctrl);
          else game.removeCounters(card, counter.counter, n);
        }
        return result;
      }};
    } else if (operation.event === 'lifegain') {
      assertFields(operation, [...common, 'transform'], 'life replacement');
      const transform = arithmetic(operation.transform);
      const applies = (game, n, player, source) => n > 0 && player === source.ctrl;
      replacement = {event: 'lifegain', applies, run: (game, n, player, source) => applies(game, n, player, source) ? transform(n) : n};
    } else if (operation.event === 'createToken') {
      assertFields(operation, [...common, 'factor', 'tokenType', 'token', 'tokenKey'], 'token replacement');
      if (operation.tokenType && !['Creature', 'Artifact'].includes(operation.tokenType)) throw new Error('Invalid v8 replacement token type');
      const modes = ['factor', 'token', 'tokenKey'].filter(key => operation[key] !== undefined);
      if (modes.length !== 1 || operation.factor !== undefined && (!Number.isSafeInteger(operation.factor) || operation.factor < 2 || operation.factor > 3)) throw new Error('Invalid v8 replacement token outcome');
      if (operation.tokenKey !== undefined && !MTG.TOKENS[operation.tokenKey]) throw new Error('Unknown v8 replacement token');
      const extra = operation.token ? helpers.token(operation.token) : operation.tokenKey;
      const matches = spec => !operation.tokenType || (typeof spec === 'string' ? MTG.TOKENS[spec] : spec)?.types?.includes(operation.tokenType);
      const applies = (game, defs, player, source) => player === source.ctrl && defs.length > 0 && defs.some(matches);
      replacement = {event: 'createToken', applies, run: (game, defs, player, source) => {
        if (!applies(game, defs, player, source)) return defs;
        if (operation.factor) return defs.flatMap(def => matches(def) ? Array(operation.factor).fill(def) : [def]);
        return [...defs, extra];
      }};
    } else throw new Error('Unsupported v8 replacement event');
    return {replace: [{...replacement, oracleOperation: operation}]};
  };

  // Entry-state replacement sources come from the engine's pre-entry snapshot
  // during a simultaneous batch. A co-entrant never supplies an extra effect.
  MTG.oracleV8ApplyEntryState = async function (game, card) {
    const candidates = game.replacers('etbTapped');
    for (const source of game.bf()) {
      if (source.cur?.abilitiesDisabled) continue;
      if (source !== card && source.ctrl === card.ctrl && source.def.landsEnterUntapped && card.is('Land')) {
        candidates.push({key: 'legacy-untapped:' + source.iid, src: source, run: () => { card.tapped = false; }});
      }
      if (source.ctrl !== card.ctrl && source.def.opponentsCreaturesEnterTapped && card.is('Creature')) {
        candidates.push({key: 'legacy-tapped:' + source.iid, src: source, run: () => { card.tapped = true; }});
      }
    }
    const used = new Set();
    while (true) {
      const pending = candidates.filter(rule => !used.has(rule.key) && (!rule.applies || rule.applies(game, card, rule.src)));
      if (!pending.length) break;
      const rule = await game.chooseReplacement(card.ctrl, pending, 'etbTapped', card.tapped ? 1 : 0);
      used.add(rule.key);
      await rule.run(game, card, rule.src);
    }
  };
})();
