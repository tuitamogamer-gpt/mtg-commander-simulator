// ===== oracle-catalog.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Oracle batches are generated from Scryfall's Oracle Cards bulk feed.  The
// registry keeps three concerns together without confusing them:
//   1. exact Oracle/raw data used by the rules engine,
//   2. an explicit, auditable engine implementation marker, and
//   3. searchable metadata that can later power the deckbuilder.
(function () {
  const batches = MTG.ORACLE_BATCHES = MTG.ORACLE_BATCHES || [];
  const registeredNames = new Map();
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  function sameBattlefieldSource(ctx) {
    return !!(ctx && ctx.src && ctx.g && ctx.src.zone === 'battlefield' &&
      ctx.g.bf().includes(ctx.src) &&
      (ctx.sourceZoneVersion === undefined || ctx.sourceZoneVersion === null ||
        ctx.src.zoneVersion === ctx.sourceZoneVersion));
  }

  function permanentSpec(what, prompt, aiGoal, constraints) {
    constraints = constraints || {};
    const kinds = what === 'creature or planeswalker' ? ['Creature', 'Planeswalker']
      : what === 'artifact or creature or planeswalker' ? ['Artifact','Creature','Planeswalker']
      : what === 'artifact or enchantment' ? ['Artifact', 'Enchantment']
        : what === 'artifact or creature' ? ['Artifact', 'Creature']
        : what === 'nonland permanent' ? ['nonland']
          : what === 'permanent' ? ['permanent']
            : [what.charAt(0).toUpperCase() + what.slice(1)];
    const spec = {
      what: 'permanent',
      prompt,
      filter: (game, card, controller) => card && card.zone === 'battlefield' && kinds.some(kind =>
        kind === 'permanent' ? true : kind === 'nonland' ? !card.is('Land') : card.is(kind)) &&
        (!constraints.controller || constraints.controller === 'any' ||
          constraints.controller === 'you' && card.ctrl === controller ||
          constraints.controller === 'opponent' && card.ctrl !== controller) &&
        (!constraints.attacking || !!card.attacking) &&
        (!constraints.blocking || !!card.blocking) &&
        (!constraints.attackingOrBlocking || !!card.attacking || !!card.blocking) &&
        (!constraints.tapped || !!card.tapped) &&
        (!constraints.stat || (constraints.comparison === 'less'
          ? Number(card[constraints.stat]) <= constraints.threshold
          : Number(card[constraints.stat]) >= constraints.threshold)),
    };
    if (aiGoal) spec.aiHint = { goal: aiGoal };
    return spec;
  }

  function damageSpec(what, amount) {
    const withAmount = spec => {
      spec.aiHint = Object.assign({}, spec.aiHint, { amount });
      return spec;
    };
    if (what === 'any target') return withAmount({ what: 'any', prompt: 'Damage target', aiHint: { goal: 'damage' } });
    if (what === 'target creature') return withAmount(permanentSpec('creature', 'Damage creature', 'damage'));
    if (what === 'target creature or planeswalker') return withAmount(permanentSpec('creature or planeswalker', 'Damage creature or planeswalker', 'damage'));
    if (what === 'target opponent') return withAmount({ what: 'opponent', prompt: 'Damage opponent', aiHint: { goal: 'damage' } });
    if (what === 'target player') return withAmount({ what: 'player', prompt: 'Damage player', aiHint: { goal: 'damage' } });
    if (what === 'target player or planeswalker') {
      return withAmount({
        what: 'any',
        prompt: 'Damage player or planeswalker',
        aiHint: { goal: 'damage' },
        filter: (game, target) => target instanceof MTG.Player || target && target.is && target.is('Planeswalker'),
      });
    }
    throw new Error('Unknown Oracle damage target class: ' + what);
  }

  function genericAmount(value, ctx, preserveNegative = false) {
    // CR 107.1b: comparisons and effects setting a specific P/T use signed
    // values. Quantities such as damage, mana and ordinary +X/+X retain the
    // existing zero floor. The caller supplies that rules context explicitly.
    const statNumber=value=>preserveNegative?(Number(value)||0):Math.max(0,Number(value)||0);
    if(value?.kind==='counter-payment-v8')return MTG.OracleV8VariableCounterCosts.amount(ctx,value);
    if(value?.kind==='combat-attacked-opponents-v8')return MTG.OracleV8CombatRestrictions.attackedOpponents(ctx,value);
    if(value?.kind==='combat-blocker-count-v8')return MTG.OracleV8CombatRestrictions.blockerCount(ctx,value);
    if(value?.kind==='v8-target-permanent-count'){
      const saved=ctx._oracleTargetControllers?.[value.target]?.[0],card=saved?.subject||genericEffectSubjects(ctx,value.target)[0];
      const object=value.target==='self'&&!sameBattlefieldSource(ctx)?ctx.src?.battlefieldLKI?.get(ctx.sourceZoneVersion):saved&&card?.zoneVersion!==saved.zoneVersion?(card?.battlefieldLKI?.get(saved.zoneVersion)||saved.stats):card;
      return MTG.oracleV8PermanentCount(ctx.g,object,ctx.you,value.count)*(value.multiply??1);
    }

    if(value?.kind==='v8-permanent-count'){
      const source=sameBattlefieldSource(ctx)?ctx.src:ctx.data?.card===ctx.src&&ctx.data.snap?ctx.data.snap:ctx.src?.battlefieldLKI?.get(ctx.sourceZoneVersion);
      return MTG.oracleV8PermanentCount(ctx.g,source,ctx.you,value)*(value.multiply??1);
    }
    if(value?.kind==='payment-stat')return statNumber(ctx.oraclePaymentCapture?.cards?.[0]?.before?.[value.stat])*(value.multiply??1);
    if(value?.kind==='payment-count')return Math.max(0,Number(ctx.oraclePaymentCapture?.count)||0)*(value.multiply??1);
    if(value?.kind==='damage-dealt')return Math.max(0,Number(ctx._oracleDamageDealt)||0)*(value.multiply??1);
    if(value?.kind==='life-lost')return Math.max(0,Number(ctx._oracleLifeLost)||0)*(value.multiply??1);
    if(value?.kind==='destroyed-count')return Math.max(0,Number(ctx._oracleDestroyedCount)||0)*(value.multiply??1);
    if(value?.kind==='sacrificed-stat'){const snap=ctx.sacd?.[0]||ctx.sacdSelf||ctx.so?.oracleV4AdditionalCost?.sacrifices?.[0]?.snapshot||ctx.so?.sacdSnaps?.[0];return statNumber(snap?.[value.stat]);}
    if(value?.kind==='grave-source-power')return statNumber(ctx.graveyardSourcePower);
    if(value?.kind==='paid-colors')return new Set((ctx.src.castMeta?.paymentColors||[]).filter(color=>COLORS.includes(color))).size*(value.multiply??1);
    if(value?.kind==='source-counters'){
      const source=sameBattlefieldSource(ctx)?ctx.src:ctx.data?.card===ctx.src&&ctx.data.snap?ctx.data.snap:ctx.src?.battlefieldLKI?.get(ctx.sourceZoneVersion);
      return (source?.counters?.[value.counter]||0)*(value.multiply??1);
    }
    if(value?.kind==='target-stat'){
      const saved=ctx._oracleTargetControllers?.[value.target]?.[0],card=saved?.subject||genericEffectSubjects(ctx,value.target)[0];
      const object=saved&&card?.zoneVersion!==saved.zoneVersion?(card?.battlefieldLKI?.get(saved.zoneVersion)||saved.stats):card;
      return statNumber(object?.[value.stat]);
    }
    if(value?.kind==='target-count'){
      const player=genericEffectSubjects(ctx,value.target)[0];
      return player instanceof MTG.Player?genericCount(ctx.g,ctx.src,player,value.count)*(value.multiply??1):0;
    }
    if(value?.kind==='signed')return value.sign*genericAmount(value.value,ctx,preserveNegative);
    if(value?.kind==='life-total')return ctx.you.life;
    if(value?.kind==='coin-wins-v8')return (ctx.oracleCoinWins||0)*(value.multiply??1);
    if(['max-stat','died-count','devotion','party','turn-count','source-attachments','opponent-poison-total','opponent-count','creature-total-power','casting-live-count-v8','casting-turn-count-v8'].includes(value?.kind))return genericCount(ctx.g,ctx.src,ctx.you,value,preserveNegative)*(value.multiply??1);
    if(value?.kind==='paid-times')return Math.max(0,Number(ctx.oracleSourceCapture?.paidTimes??ctx.src.castMeta?.paidTimes)||0);
    if(value?.kind==='sum')return value.values.reduce((sum,item)=>sum+genericAmount(item,ctx,preserveNegative),0)*(value.multiply??1);
    if (['event-card-stat','event-card-counters'].includes(value?.kind)) {
      const card = ctx.oracleSourceCapture?.eventCard || ctx.data?.card;
      const source = ctx.oracleSourceCapture?.eventSnap || (ctx.data?.card===card?ctx.data?.snap:null) || (card?.zone === 'battlefield' && card.zoneVersion === ctx.eventCardZoneVersion
        ? card : card?.battlefieldLKI?.get(ctx.eventCardZoneVersion));
      return statNumber(value.kind==='event-card-counters'?source?.counters?.[value.counter]:source?.[value.stat])*(value.multiply??1);
    }
    if(['source-stat','explicit-source-stat'].includes(value?.kind)) {
      const source=sameBattlefieldSource(ctx)?ctx.src:ctx.data?.card===ctx.src&&ctx.data.snap?ctx.data.snap:ctx.src?.battlefieldLKI?.get(ctx.sourceZoneVersion);
      return statNumber(source?.[value.stat]);
    }
    if(value?.kind==='event-amount')return Math.max(0,Number(ctx.oracleSourceCapture?.eventAmount??ctx.data?.n)||0);
    if (value && typeof value === 'object' && value.kind === 'count') {
      return genericCount(ctx.g,ctx.src,ctx.you,value) * (value.multiply ?? 1);
    }
    if (value !== 'X') return statNumber(value);
    const chosen = ctx && ctx.x !== undefined
      ? ctx.x
      : ctx && ctx.src && ctx.src.castMeta && ctx.src.castMeta.x;
    return Math.max(0, Number(chosen) || 0);
  }

  function genericTypeMatches(card, what, zone = card && card.zone) {
    if (!card || !card.is) return false;
    const normalized = String(what || 'card').toLowerCase()
      .replace(/^target\s+/, '').replace(/\s+card$/, '');
    if (normalized === 'card') return true;
    const isPermanentCard = ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker']
      .some(type => card.is(type));
    if (normalized === 'permanent') return zone === 'battlefield'
      ? card.zone === 'battlefield' : isPermanentCard;
    if (normalized === 'nonland permanent') return zone === 'battlefield'
      ? card.zone === 'battlefield' && !card.is('Land')
      : isPermanentCard && !card.is('Land');
    if (normalized === 'artifact or enchantment') return card.is('Artifact') || card.is('Enchantment');
    if (normalized === 'artifact or creature') return card.is('Artifact') || card.is('Creature');
    if (normalized === 'artifact or land') return card.is('Artifact') || card.is('Land');
    if (normalized === 'creature or artifact') return card.is('Creature') || card.is('Artifact');
    if (normalized === 'enchantment or land') return card.is('Enchantment') || card.is('Land');
    if (normalized === 'creature or enchantment') return card.is('Creature') || card.is('Enchantment');
    if (normalized === 'creature or land') return card.is('Creature') || card.is('Land');
    if (normalized === 'basic land') return card.is('Land') && (card.def.super || []).includes('Basic');
    if (normalized === 'creature or planeswalker') return card.is('Creature') || card.is('Planeswalker');
    if (normalized === 'artifact or creature or planeswalker') return card.is('Artifact') || card.is('Creature') || card.is('Planeswalker');
    if (normalized === 'instant or sorcery') return card.is('Instant') || card.is('Sorcery');
    return card.is(normalized.charAt(0).toUpperCase() + normalized.slice(1));
  }

  function genericTargetHint(target, effects, index) {
    const flatten=rows=>rows.flatMap(row=>[row,...(row.hits||[]).map(hit=>({...hit,action:'damage'})),...flatten(row.effects||[]),...flatten(row.elseEffects||[])]);
    const onlyYou=spec=>spec.controller==='you'||!!spec.alternatives?.length&&spec.alternatives.every(onlyYou);
    if(flatten(effects||[]).some(effect=>effect.action==='delayed-objects-v8'&&effect.operation==='return'&&effect.capture.kind==='subjects'&&effect.capture.target===index))return {goal:onlyYou(target)?'protect':'bounce'};
    const matching = flatten(effects || []).filter(candidate => candidate.target === index || candidate.otherTarget === index || candidate.who === index || candidate.sourceTarget === index);
    if(matching.some(effect=>effect.action==='damage')&&matching.some(effect=>effect.action==='tap'))return {goal:'tap'};
    // A color clause is neutral by itself. In a Wisp, the actual pump/tap/
    // untap instruction determines whether the shared target is helped.
    const effect = matching.find(candidate => candidate.action === 'counter' && candidate.counter === 'stun') || matching.find(candidate => !['change-characteristics-v8', 'characteristics-v8'].includes(candidate.action)) || matching[0];
    if (!effect) return null;
    if(effect.action==='next-draw-replacement-v8'&&effect.mode==='redirect')return {goal:'damage',oracleEffect:'draw-replacement'};
    if(effect.action==='role-token-v8')return {goal:effect.role==='Cursed'?'debuff':'buff'};
    if(effect.action==='same-name-group-v8')return {...genericTargetHint(target,[{...effect.effect,target:effect.target}],index),oracleNameGroup:effect};
    if(effect.action==='battlefield-group'&&typeof effect.target==='number'){
      const benefit=effect.operation==='untap'||effect.operation==='regenerate'||effect.operation==='pump'&&Number(effect.power||0)>=0&&Number(effect.toughness||0)>=0||effect.operation==='counter'&&!['-1/-1','stun'].includes(effect.counter);
      return {goal:benefit?'benefit':'damage',amount:effect.operation==='damage'?effect.n:0,oracleEffect:'player-scoped-group'};
    }
    if(effect.action==='prevent-all')return {goal:effect.direction==='by'?'debuff':'protect'};
    if(effect.action==='zone-select'&&typeof effect.who==='number')return {goal:effect.destination==='exile'?'damage':'benefit',amount:0,oracleEffect:'player-scoped-zone'};
    if(effect.action==='gain-control')return{goal:'steal'};
    if(effect.action==='copy-counters-v8')return {goal:'buff'};
    if(effect.action==='move-counters-v8')return {goal:effect.target===index?'counterTransferRecipient':'counterTransferDonor',counterKind:effect.counter,counterN:effect.n,counterSourceTarget:effect.sourceTarget,counterRecipientSelf:effect.target==='self'};
    if(effect.sourceTarget===index&&effect.target!==index)return {goal:'buff'};
    if(['copy-token','copy-token-v8'].includes(effect.action))return {goal:'copy'};
    if(effect.action==='become-copy-v8')return {goal:effect.otherTarget===index?'copy':'buff'};
    if (['grant-operation','choose-keyword','backup'].includes(effect.action)) return {goal:'buff'};
    if (['animate','base-pt'].includes(effect.action)) return {goal:'oracleBasePT',oracleBasePTEffect:effect};
    if (effect.action === 'goad'||effect.action==='suspect') return {goal:effect.action};
    if(effect.action==='same-name-search-v8')return {goal:effect.prior==='counter'?'counter':effect.owner==='target-player'?'damage':effect.destination==='exile'?'removal':'recur',...(effect.owner==='target-player'?{amount:0}:effect.destination==='exile'?{removalKind:'exile'}:{})};
    if (effect.action === 'counter-spell') return {goal:'counter'};
    if (effect.action === 'fight') return {goal: effect.target===index?'buff':'removal'};
    if (effect.action === 'bite') return {goal: effect.target===index&&effect.otherTarget!==index?'buff':'damage'};
    if (effect.action === 'blink') return {goal: target.controller==='you'||effect.controller==='you'?'protect':'bounce'};
    if (effect.action === 'phase-out-v8') return {goal: target.controller === 'you' ? 'protect' : 'removal'};
    if (effect.action === 'move-to-library') return {goal: target.zone==='graveyard'?'recur':'bounce'};
    if (effect.action === 'linked-exile' || effect.action === 'linked-exile-until') return {goal:target.controller==='you'?'protect':'removal',removalKind:'exile'};
    if (effect.action === 'destroy' || effect.action === 'exile') {
      return { goal: 'removal', removalKind: effect.action };
    }
    if (effect.action === 'damage' || effect.action === 'divided-damage-v8' || effect.action === 'lose-life') {
      return { goal: 'damage', amount: effect.n, n: effect.n };
    }
    if (effect.action === 'bounce') return { goal: target.controller === 'you' ? 'protect' : 'bounce' };
    if (effect.action === 'tap' || effect.action === 'untap') return { goal: effect.action };
    // Neither local-AI target scorer has a dedicated mill goal. Damage is the
    // closest hostile-player policy and, unlike the generic fallback, never
    // chooses the bot itself merely because its board has the highest threat.
    if (effect.action === 'mill') return { goal: 'damage', amount: 0, n: 0, oracleEffect: 'mill' };
    if (effect.action === 'discard' || effect.action==='reveal-hand-discard') return { goal: 'discard', amount: effect.n };
    if (effect.action === 'move-to-hand') return { goal: 'recur' };
    if (effect.action === 'reanimate') return { goal: 'recur' };
    if (['regenerate', 'prevent-next', 'unblockable-until-eot', 'attach-source'].includes(effect.action)) return { goal: 'buff' };
    if(effect.action==='player-counter'&&effect.counter==='poison')return {goal:'damage',amount:effect.n};
    if(effect.action==='set-basic-land-types-v8')return {goal:effect.retain?'buff':'debuff'};
    if (effect.action === 'counter') {
      const harmful = effect.counter === '-1/-1' || effect.counter === 'stun';
      return { goal: harmful ? 'removal' : 'buff' };
    }
    if (effect.action === 'remove-counters-v8')return {goal:['-1/-1','stun'].includes(effect.counter)?'buff':'debuff'};
    if (effect.action === 'cant-block-until-eot') return { goal: 'debuff' };
    if (effect.action === 'pump') {
      const power = effect.power?.kind==='signed'?effect.power.sign*2:Number(effect.power||0);
      const toughness = effect.toughness?.kind==='signed'?effect.toughness.sign*2:Number(effect.toughness||0);
      const mixed = power > 0 && toughness < 0;
      const beneficial = power >= 0 && toughness >= 0;
      return {
        goal: mixed ? 'mixedPump' : beneficial ? 'buff' : 'debuff',
        power, toughness, keywords: (effect.keywords || []).slice(), untilEOT: !effect.duration?.startsWith('source-controlled'),
      };
    }
    return null;
  }

  function genericTargetSpec(target, effects = [], index, eventData) {
    // The legacy union grammar stores a shared trailing control qualifier on
    // its last alternative ("creature or planeswalker you don't control").
    // Apply it to the whole union when every earlier term is unqualified;
    // explicitly mixed controller alternatives retain their separate scopes.
    if(target.alternatives?.length>1&&target.controller==='any'){
      const last=target.alternatives.at(-1);
      if(['you','opponent'].includes(last.controller)&&target.alternatives.slice(0,-1).every(part=>part.controller==='any'))target={...target,controller:last.controller};
    }
    if (target.dividedAmount !== undefined) {
      const {dividedAmount, unbounded, ...base} = target;
      const initial = genericTargetSpec({...base,min:0,max:0}, effects, index, eventData);
      initial.bindOracleContext = ctx => {
        const capture = ctx.oracleSourceCapture || eventData?.oracleSourceCapture;
        const amount = genericAmount(dividedAmount, {...ctx,
          x:ctx.so?.x ?? ctx.x ?? eventData?.oracleX,
          oracleSourceCapture:capture, sourceZoneVersion:capture?.zoneVersion ?? ctx.sourceZoneVersion});
        const maximum = Math.min(amount, unbounded ? amount : base.max ?? 1);
        return genericTargetSpec({...base,max:maximum}, effects, index, eventData);
      };
      return initial;
    }
    if(target.targetCountX){
      const {targetCountX,...base}=target;
      const bind=ctx=>{const x=ctx.so?.x??ctx.x??0;if(!Number.isSafeInteger(x)||x<0)throw new Error('Invalid target count X');return genericTargetSpec({...base,min:x,max:x},effects,index,{...eventData,oracleX:x});};
      return {...genericTargetSpec({...base,min:0,max:0},effects,index,eventData),bindOracleContext:bind};
    }
    const stackCopySpec=MTG.OracleV8StackCopy?.targetSpec(target,effects,index,{target:genericTargetSpec});if(stackCopySpec)return stackCopySpec;
    if(JSON.stringify(target).includes('"explicit-source-stat"')&&!eventData?.oracleSourceCapture&&!eventData?.oracleSourcePreflight){
      const spec=genericTargetSpec(target,effects,index,{...eventData,oracleSourcePreflight:true});
      spec.bindOracleContext=ctx=>genericTargetSpec(target,effects,index,{...eventData,oracleX:ctx.so?.x??ctx.x??eventData?.oracleX,oracleSourceCapture:ctx.oracleSourceCapture||{zoneVersion:ctx.sourceZoneVersion??ctx.src.zoneVersion}});
      return spec;
    }
    if(JSON.stringify(target).includes('"threshold":"X"')&&eventData?.oracleX===undefined){
      // Preflight can check the other qualifications before X is announced.
      // A fresh binding is made for this Stack object before target selection.
      const spec=genericTargetSpec(target,effects,index,{...eventData,oracleX:null});
      spec.bindOracleContext=ctx=>genericTargetSpec(target,effects,index,{...eventData,oracleX:ctx.so?.x??ctx.x??NaN});
      return spec;
    }
    const thresholdValue=(game,source,controller)=>target.threshold==='X'?eventData?.oracleX:typeof target.threshold==='object'?genericAmount(target.threshold,{g:game,src:source,you:controller,data:eventData,sourceZoneVersion:eventData?.oracleSourceCapture?.zoneVersion,oracleSourceCapture:eventData?.oracleSourceCapture,eventCardZoneVersion:eventData?.oracleSourceCapture?.eventCardZoneVersion},true):target.threshold;
    if(target.zone==='stack'&&target.what==='spell')return {
      what:'spell',zone:'stack',min:target.min??1,count:target.unbounded?Infinity:target.max??1,...(target.min===0?{upTo:true}:{}),prompt:'Choose a spell',aiHint:{goal:effects.some(effect=>effect.action==='copy-stack-v8'&&effect.target===index)?'copy-stack':'counter'},
      filter:(game,object,controller,source)=>{
        if(object?.kind!=='spell'||!object.card)return false;
        if(target.castFrom&&object.from!==target.castFrom)return false;
        if(target.targetsObject){
          // CR 115.9b: use the target's current characteristics and identity,
          // but do not require it to remain legal for the original spell.
          const refs=(object.targets||[]).flat(),identities=(object.targetIdentities||[]).flat();
          const referenceSpec=genericTargetSpec(target.targetsObject,[],0,eventData);
          if(!refs.some((subject,i)=>{
            if(subject instanceof MTG.Player)return !subject.lost&&referenceSpec.filter(game,subject,controller,source);
            const identity=identities[i];
            return subject?.zone==='battlefield'&&!subject.phasedOut&&(!identity||identity.iid===subject.iid&&identity.zoneVersion===subject.zoneVersion)&&referenceSpec.filter(game,subject,controller,source);
          }))return false;
        }
        if(target.controller==='opponent'&&object.ctrl===controller||target.controller==='you'&&object.ctrl!==controller)return false;
        const card=object.card,castOpts=object.castOpts||{},adventure=castOpts.adventure&&card.def.adventure;
        const copyDef=object.oracleDefinition,spellColors=copyDef?.colorsOverride||card.castMeta?.spellColors||card.colors;
        if(target.colorsAny&&!target.colorsAny.some(color=>spellColors.includes(color)))return false;
        const effective=Object.defineProperties(Object.create(card),{
          mv:{value:game.stackSpellManaValue(object)},colors:{value:spellColors},
          is:{value:type=>copyDef?copyDef.types.includes(type):game.castHasType(card,castOpts,type)},
          hasSub:{value:subtype=>copyDef?!!(copyDef.changeling||copyDef.subtypes?.includes(subtype)):adventure?subtype==='Adventure':card.hasSub(subtype)},
          ...(copyDef?{def:{value:copyDef}}:{}),
          ...(adventure?{def:{value:{...card.def,super:[],types:adventure.types.split(' '),subtypes:['Adventure'],cost:adventure.cost}}}:{}),
        });
        if(target.legendary&&!(effective.def.super||[]).includes('Legendary'))return false;
        if(target.stat&&!(target.threshold==='X'&&eventData?.oracleX===null)){const value=Number(effective[target.stat]),threshold=thresholdValue(game,source,controller);if(!Number.isFinite(threshold)||(target.comparison==='equal'?value!==threshold:target.comparison==='less'?value>threshold:value<threshold))return false;}
        if(target.spellFilter)return genericTargetSpec(target.spellFilter,[],0,eventData).filter(game,effective,controller,source);
        const q=target.spellQuality,colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
        if(!q||q==='any')return true;
        if(colors[q])return spellColors.includes(colors[q]);
        if(q.startsWith('non')&&colors[q.slice(3)])return !spellColors.includes(colors[q.slice(3)]);
        if(q==='colorless')return spellColors.length===0;
        if(q==='multicolored')return spellColors.length>1;
        if(q==='noncreature')return !effective.is('Creature');
        return effective.is(q[0].toUpperCase()+q.slice(1));
      },
    };
    const rawWhat = String(target.what || 'card').toLowerCase();
    const playerOrPlaneswalker = rawWhat === 'target player or planeswalker' || rawWhat === 'player or planeswalker';
    const anyTarget = rawWhat === 'any' || rawWhat === 'any target';
    const playerTarget = rawWhat === 'player' || rawWhat === 'opponent';
    const zone = target.zone === 'graveyard' || target.zone === 'stack' ? target.zone : 'battlefield';
    const spec = {
      what: playerTarget ? rawWhat : (anyTarget || playerOrPlaneswalker ? 'any' : 'permanent'),
      zone,
      prompt: target.prompt || 'Choose target',
      min: target.min === undefined ? 1 : target.min,
      count: target.unbounded ? Infinity : target.max === undefined ? 1 : target.max,
    };
    if (spec.min === 0) spec.upTo = true;
    if(target.differentFromPrevious)spec.differentFromPrevious=true;
    if (zone === 'graveyard' && target.controller !== 'you') spec.anyGraveyard = true;
    const defendingPlayer = eventData && eventData.defender
      ? (eventData.defender instanceof MTG.Player ? eventData.defender : eventData.defender.ctrl)
      : null;
    spec.filter = (game, candidate, controller, source) => {
      if(target.alternatives&&!target.alternatives.some(alternative=>genericTargetSpec(alternative,effects,index,eventData).filter(game,candidate,controller,source)))return false;
      if(target.excludeYou&&candidate===controller)return false;
      if (target.excludeSelf && candidate === source) return false;
      if(target.owner==='you'&&candidate.owner!==controller)return false;
      if(target.commander&&!candidate.commander)return false;
      if(target.anyCounter&&!Object.values(candidate.counters||{}).some(n=>n>0))return false;
      if(target.noCounters&&Object.values(candidate.counters||{}).some(n=>n>0))return false;
      if(target.notAllColors&&['W','U','B','R','G'].every(color=>candidate.colors?.includes(color)))return false;
      if(target.attachedHost){const host=game.byIid(candidate.attachedTo);if(host?.zone!=='battlefield'||!genericTargetSpec(target.attachedHost,[],0,eventData).filter(game,host,controller,source))return false;}
      if(target.damagedThisTurn&&candidate.meta?._lastDamageVisual?.turn!==game.turnNo)return false;
      if(target.enteredThisTurn&&(candidate.enteredTurn??candidate.meta?._enteredTurn)!==game.turnNo)return false;
      if(target.attackedThisTurn&&(candidate.attackedTurn??candidate.meta?._attackedTurn)!==game.turnNo)return false;
      if (playerTarget) {
        if (!(candidate instanceof MTG.Player)) return false;
      } else if (playerOrPlaneswalker) {
        if (!(candidate instanceof MTG.Player) && !(candidate && candidate.is && candidate.is('Planeswalker'))) return false;
      } else if (!anyTarget && !genericTypeMatches(candidate, rawWhat, zone)) return false;

      if (target.attacking && !candidate.attacking) return false;
      if (target.blocking && (candidate.blocking === null || candidate.blocking === undefined || candidate.blocking === false)) return false;
      if (target.attackingOrBlocking && !candidate.attacking &&
          (candidate.blocking === null || candidate.blocking === undefined || candidate.blocking === false)) return false;
      if (target.tapped && !candidate.tapped) return false;
      if (target.untapped && candidate.tapped) return false;
      if (target.nonblack && candidate.colors.includes('B')) return false;
      if (target.nonartifact && candidate.is('Artifact')) return false;
      if (target.nonlegendary && (candidate.def.super || []).includes('Legendary')) return false;
      if (target.nontoken && candidate.isToken) return false;
      if (target.hasCounter && !(candidate.counters?.[target.hasCounter]>0)) return false;
      if (target.withoutCounter && candidate.counters?.[target.withoutCounter]>0) return false;
      if (target.notType && candidate.is(target.notType)) return false;
      if (target.excludedTypes?.some(type=>candidate.is(type))) return false;
      if (target.alsoType && !candidate.is(target.alsoType)) return false;
      if (target.colorsAny && !target.colorsAny.some(color=>candidate.colors.includes(color))) return false;
      if (target.token && !candidate.isToken) return false;
      if (target.subtype && !candidate.hasSub(target.subtype)) return false;
      if (target.notSubtype && candidate.hasSub(target.notSubtype)) return false;
      const supertypes = candidate.zone === 'battlefield' ? candidate.cur?.super || candidate.def?.super || [] : candidate.def?.super || [];
      if (target.snow && !supertypes.includes('Snow')) return false;
      if (target.nonsnow && supertypes.includes('Snow')) return false;
      if (target.nonbasic && supertypes.includes('Basic')) return false;
      if (target.basic && !supertypes.includes('Basic')) return false;
      if (target.legendary && !supertypes.includes('Legendary')) return false;
      if (target.enchanted || target.equipped) {
        const subtype = target.enchanted ? 'Aura' : 'Equipment';
        if (!(candidate._oracleLKI?(target.enchanted?candidate.enchanted:candidate.equipped):(candidate.attachments || []).some(id => {
          const attachment = game.byIid(id);
          return attachment?.zone === 'battlefield' && !attachment.phasedOut && attachment.attachedTo === candidate.iid && attachment.hasSub(subtype);
        }))) return false;
      }
      if(target.color) {
        const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
        if(colors[target.color]&&!candidate.colors.includes(colors[target.color]))return false;
        if(target.color==='colorless'&&candidate.colors.length!==0)return false;
        if(target.color==='multicolored'&&candidate.colors.length<2)return false;
        if(target.color==='monocolored'&&candidate.colors.length!==1)return false;
      }
      if (target.notColor) {
        const color={white:'W',blue:'U',black:'B',red:'R',green:'G'}[target.notColor];
        if (color ? candidate.colors.includes(color) : candidate.colors.length === 0) return false;
      }
      if (target.withKeyword && !candidate.kw(target.withKeyword)) return false;
      if (target.withoutKeyword && candidate.kw(target.withoutKeyword)) return false;
      if (target.stat&&!(target.threshold==='X'&&eventData?.oracleX===null)) {
        const value = Number(candidate[target.stat]);
        const threshold=thresholdValue(game,source,controller);
        if (!Number.isFinite(threshold)||(target.comparison === 'equal' ? value !== threshold : target.comparison === 'less' ? value > threshold : value < threshold)) return false;
      }

      if(target.controller==='event-player'){const eventPlayer=eventData?.oracleEventPlayer;if(!eventPlayer)return false;const ctrl=candidate instanceof MTG.Player?candidate:candidate.zone==='battlefield'?candidate.ctrl:candidate.owner;if(ctrl!==eventPlayer)return false;}
      if (target.controller === 'you') {
        const subjectController = candidate instanceof MTG.Player ? candidate :
          (candidate.zone === 'battlefield' ? candidate.ctrl : candidate.owner);
        if (subjectController !== controller) return false;
      } else if (target.controller === 'opponent') {
        const subjectController = candidate instanceof MTG.Player ? candidate :
          (candidate.zone === 'battlefield' ? candidate.ctrl : candidate.owner);
        if (subjectController === controller) return false;
      } else if (target.controller === 'defending-player') {
        const defender=defendingPlayer||(source?.attacking instanceof MTG.Player?source.attacking:source?.attacking?.ctrl);
        if (!defender || candidate instanceof MTG.Player || candidate.ctrl !== defender) return false;
      }
      return true;
    };
    const hint = genericTargetHint(target, effects, index);
    if (hint) {
      spec.aiHint = hint;
      if(hint.goal==='oracleBasePT') {
        const effect=hint.oracleBasePTEffect;
        spec.aiHint={goal:hint.goal,basePT:(game,subject,player,source)=>{
          const targets=[];targets[index]=subject;
          const ctx={g:game,src:source,you:player,targets,data:eventData,sourceZoneVersion:eventData?.oracleSourceCapture?.zoneVersion,oracleSourceCapture:eventData?.oracleSourceCapture,eventCardZoneVersion:eventData?.oracleSourceCapture?.eventCardZoneVersion};
          return {...(effect.power!==undefined?{power:genericAmount(effect.power,ctx,true)}:{}),...(effect.toughness!==undefined?{toughness:genericAmount(effect.toughness,ctx,true)}:{}),keywords:effect.keywords||[],becomesCreature:effect.action==='animate',temporary:effect.temporary!==false};
        }};
      }
    }
    const condition=(effects||[]).find(effect=>effect.conditionTarget===index)?.condition;
    if(condition?.kind==='source-status'&&['tapped','untapped'].includes(condition.status))spec.aiHint={...spec.aiHint,oracleTargetTapped:condition.status==='tapped'};
    return spec;
  }

  function genericTargetSpecs(targets, effects, eventData) {
    return (targets || []).map((target, index) => genericTargetSpec(target, effects, index, eventData));
  }
  function genericResolutionTargetSpec(ctx,target,effects,index,data){
    return genericTargetSpec(target,effects,index,{...(data||ctx.data),oracleX:ctx.x??ctx.so?.x,
      oracleSourceCapture:ctx.oracleSourceCapture,oracleEventPlayer:ctx.oracleSourceCapture?.eventPlayer||ctx.data?.player,
      defender:ctx.oracleSourceCapture?.defender||ctx.data?.defender||ctx.data?.attacker?.attacking});
  }

  function genericTriggerFilter(event, eventFilter) {
    const energyFilter=event==='energyGained'&&MTG.OracleV8Energy?.triggerFilter(eventFilter);if(energyFilter)return energyFilter;
    if(eventFilter?.kind==='clash-v8')return (game,self,data)=>data.player===self.ctrl&&(!eventFilter.wonOnly||data.won);
    if(eventFilter?.kind==='coin-flip-v8')return (game,self,data)=>data.won===eventFilter.won&&(eventFilter.who==='any'||(data.player===self.ctrl)===(eventFilter.who==='you'));
    const damageFilter=MTG.OracleV8DamageEvents?.triggerFilter(eventFilter,{target:genericTargetSpec});if(damageFilter)return damageFilter;
    if(eventFilter?.kind==='observed-player-v8')return (game,self,data)=>data.player===self.ctrl&&(!eventFilter.first||(event==='lifeLost'?data.events===1:data.first===true))&&(!eventFilter.yourTurn||game.turnPlayer===self.ctrl)&&(!eventFilter.mainOrdinal||data.ordinal===eventFilter.mainOrdinal);
    if(eventFilter?.kind==='observed-explore-v8')return (game,self,data)=>data.player===self.ctrl&&!!data.snap?.types?.includes('Creature')&&(eventFilter.land===undefined||!!data.exploredCard&&data.exploredLand===eventFilter.land);
    if(eventFilter?.kind==='created-batch-v8')return (game,self,data)=>data.ctrl===self.ctrl&&data.tokens?.some(card=>!eventFilter.creature||card.is('Creature'));
    if(eventFilter?.kind==='batch-discard-v8')return (game,self,data)=>(eventFilter.controller==='any'||(data.player===self.ctrl)===(eventFilter.controller==='you'))&&!!data.card&&genericTargetSpec({...eventFilter.target,controller:'any'},[],0).filter(game,data.card,self.ctrl,self);
    const copyFilter=MTG.OracleV8StackCopy?.triggerFilter(event,eventFilter,{target:genericTargetSpec});if(copyFilter)return copyFilter;
    const castFilter=event==='cast'&&MTG.OracleV8CastEvents?.triggerFilter(eventFilter,{target:genericTargetSpec});if(castFilter)return castFilter;
    const v8Filter=MTG.oracleV8TriggerFilter?.(event,eventFilter,genericTargetSpec,genericCondition);if(v8Filter)return v8Filter;
    if(eventFilter?.kind==='source-damage-player')return (game,self,data)=>(event==='combatDamageToPlayer'?data.card:data.src)===self&&data.n>0&&(!eventFilter.opponent||data.player!==self.ctrl);
    if(eventFilter==='self-unblocked')return (game,self,data)=>!!self.attacking&&!self.wasBlocked&&data.attackers?.includes(self);
    if(eventFilter?.kind==='self-creature-combat')return (game,self,data)=>{
      const source=event==='blocks'?data.blocker:data.attacker,other=event==='blocks'?data.attacker:data.blocker;
      return source===self&&!!other&&genericTargetSpec(eventFilter.otherFilter,[],0).filter(game,other,self.ctrl,self);
    };
    if(eventFilter?.kind==='either'){
      const filters=eventFilter.clauses.filter(clause=>clause.event===event).map(clause=>genericTriggerFilter(event,clause.eventFilter));
      return (game,self,data)=>filters.some(filter=>filter(game,self,data));
    }
    if(eventFilter?.kind==='qualified-cast')return (game,self,data)=>data.player===self.ctrl&&!!data.so&&(!eventFilter.from||(eventFilter.from==='not-hand'
      ? data.so.from!=='hand'||data.so.card?.owner!==data.player
      : data.so.from===eventFilter.from&&(eventFilter.from!=='graveyard'||data.so.card?.owner===data.player)))&&genericTargetSpec(eventFilter.target,[],0).filter(game,data.so,self.ctrl,self);
    if(eventFilter?.kind==='graveyard-batch')return (game,self,data)=>data.cards?.some((card,index)=>{
      const snap=event==='cardsLeftGraveyard'?data.snapshots?.[index]:null;
      const object=snap?{...snap,zone:'graveyard',cur:{super:snap.def.super},is:type=>snap.types.includes(type),hasSub:type=>snap.subtypes.includes(type)||snap.def.changeling&&MTG.CREATURE_SUBTYPES.has(type),kw:keyword=>snap.kw.includes(keyword)}:card;
      return card.owner===self.ctrl&&(!eventFilter.from||(data.froms?.[index]||data.from)===eventFilter.from)&&genericTargetSpec({...eventFilter.target,controller:'any'},[],0).filter(game,object,self.ctrl,self);
    });
    if(eventFilter?.kind==='attackers-batch')return (game,self,data)=>data.player===self.ctrl&&data.attackers?.some(card=>eventFilter.filters.some(filter=>genericTargetSpec(filter,[],0).filter(game,card,self.ctrl,self)));
    if(eventFilter?.kind==='combat-damage-batch')return (game,self,data)=>data.hits?.some(hit=>eventFilter.filters.some(filter=>genericTargetSpec(filter,[],0).filter(game,hit.card,self.ctrl,self)));
    if(eventFilter==='your-attackers')return (game,self,data)=>data.player===self.ctrl&&data.attackers?.length>0;
    if(eventFilter?.kind==='your-numbered-cast')return (game,self,data)=>{
      if(data.player!==self.ctrl||eventFilter.opponentsTurn&&game.turnPlayer===self.ctrl)return false;
      const matches=entry=>eventFilter.what==='card'||eventFilter.what==='instant or sorcery'&&entry.isInstantSorcery||eventFilter.what==='noncreature'&&!entry.isCreature||entry.types?.includes(eventFilter.what[0].toUpperCase()+eventFilter.what.slice(1));
      return matches(data)&&(self.ctrl.turnState.spellsCastList||[]).filter(matches).length===eventFilter.n;
    };
    if(eventFilter?.kind==='exerted-creature-v8')return (game,self,data)=>MTG.OracleV8Exert.eventMatches(game,self,data,eventFilter);
    if(['exploited-self-v8','exploited-controller-v8'].includes(eventFilter?.kind))return (game,self,data)=>MTG.OracleV8Exploit.matches(game,self,data,eventFilter);
    if(eventFilter==='your-player')return (game,self,data)=>data.player===self.ctrl;
    if(eventFilter?.kind==='filtered-sacrifice')return (game,self,data)=>{
      const controller=(data.card===self?data.snap?.ctrl:(game._simultaneousLeaveSources||[]).find(row=>row.card===self)?.ctrl)||self.ctrl;
      if(data.player!==controller||eventFilter.another&&data.card===self)return false;
      const snap=data.snap;if(!snap)return false;
      const object={...snap,zone:'battlefield',cur:{super:snap.def.super},is:type=>snap.types.includes(type),hasSub:type=>snap.subtypes.includes(type),kw:keyword=>snap.kw.includes(keyword),mv:snap.mv,colors:snap.colors};
      return genericTargetSpec(eventFilter.target,[],0).filter(game,object,controller,self);
    };
    if(eventFilter?.kind==='targeted-object')return (game,self,data)=>!!data.card&&(eventFilter.self?data.card===self:data.card.is('Creature')&&data.card.ctrl===self.ctrl)&&(!eventFilter.opponent||data.byPlayer&&data.byPlayer!==self.ctrl);
    if(eventFilter==='self-block-combat')return (game,self,data)=>(event==='blocks'?data.blocker:data.attacker)===self;
    if(eventFilter?.kind==='attached-object')return (game,self,data)=>{
      const card=event==='blocks'?data.blocker:data.card;
      const snap=(game._simultaneousLeaveSources||[]).find(entry=>entry.card===self)?.snap||(data.snap?.attachedSources||[]).find(entry=>entry.card===self)?.snap;
      return !!card&&card.iid===(snap?.attachedTo??self.attachedTo);
    };
    if(eventFilter?.kind==='filtered-object')return (game,self,data)=>{
      const card=event==='blocks'?data.blocker:data.card;
      if(!card||eventFilter.another&&card===self)return false;
      if(eventFilter.includeSelf&&card===self)return true;
      const snap=['dies','lto'].includes(event)?data.snap:null;
      const controller=snap?((data.card===self?data.snap?.ctrl:(game._simultaneousLeaveSources||[]).find(row=>row.card===self)?.ctrl)||(data.snap?.attachedSources||[]).find(row=>row.card===self)?.ctrl||self.ctrl):self.ctrl;
      const object=snap?{...snap,zone:'battlefield',cur:{super:snap.def.super},is:type=>snap.types.includes(type),hasSub:type=>snap.subtypes.includes(type)||snap.def.changeling&&!snap.abilitiesDisabled,kw:keyword=>snap.kw.includes(keyword),mv:snap.mv,colors:snap.colors}:card;
      return genericTargetSpec(eventFilter.target,[],0).filter(game,object,controller,self);
    };
    if(eventFilter==='self-combat')return (game,self,data)=>(event==='attacks'?data.card:data.blocker)===self;
    if(eventFilter==='self-damaged')return (game,self,data)=>data.target===self;
    if(eventFilter==='opponent-player')return (game,self,data)=>data.player!==self.ctrl;
    if(eventFilter==='any-player')return ()=>true;
    if(eventFilter?.kind==='source-counters')return (game,self,data)=>data.card===self&&data.kind===eventFilter.counter&&data.n>0;
    if(eventFilter?.kind==='magecraft')return (game,self,data)=>{
      if(event==='spellCopied')return data.ctrl===self.ctrl&&game.isInstantSorcerySpell(data.so);
      return data.player===self.ctrl&&game.isInstantSorceryCast(data.card,data.so?.castOpts||{});
    };
    if(eventFilter==='self-source')return (game,self,data)=>data.src===self;
    if(eventFilter?.kind==='your-filtered-cast')return (game,self,data)=>{
      if(!data.card || (eventFilter.controller==='opponent'?data.player===self.ctrl:eventFilter.controller==='any'?false:data.player!==self.ctrl))return false;
      const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'},what=eventFilter.what;
      if(what==='historic')return !!data.historic;
      if(colors[what])return data.card.colors.includes(colors[what]);
      if(what==='multicolored')return data.card.colors.length>1;
      if(what==='colorless')return data.card.colors.length===0;
      if(what==='noncreature')return !game.castHasType(data.card,data.so?.castOpts||{},'Creature');
      if(what==='instant or sorcery')return game.isInstantSorceryCast(data.card,data.so?.castOpts||{});
      return genericSearchMatches(data.card,what);
    };
    if(eventFilter?.kind==='your-subtype-cast') return (game,self,data)=>data.player===self.ctrl&&eventFilter.subtypes.some(type=>data.card?.hasSub(type));
    if(eventFilter?.kind==='your-subtype') return (game,self,data)=>{
      if(!data.card||eventFilter.another&&data.card===self)return false;
      const controller=event==='dies'?data.snap?.ctrl:data.card.ctrl;
      const subtype=event==='dies'?(data.snap?.subtypes||[]).includes(eventFilter.subtype)||
        (!!data.snap?.def?.changeling && !data.snap?.abilitiesDisabled):data.card.hasSub(eventFilter.subtype);
      return controller===self.ctrl&&subtype;
    };
    if (eventFilter === 'each-upkeep' || eventFilter === 'each-end-step') return () => true;
    if (eventFilter === 'your-spell-targets-self') return (game, self, data) =>
      !!(data && data.player === self.ctrl && data.so && (data.so.targets || []).flat().includes(self));
    if (eventFilter === 'your-second-draw') return (game, self, data) =>
      !!(data && data.player === self.ctrl && data.nth === 2);
    if (eventFilter === 'your-life-gain') return (game, self, data) => !!(data && data.player === self.ctrl);
    if (eventFilter === 'your-landfall') return (game, self, data) => !!(data && data.card && data.card.ctrl === self.ctrl);
    if (['any-creature','another-creature','your-creature'].includes(eventFilter)) return (game,self,data) => {
      if (!data || !data.card || eventFilter === 'another-creature' && data.card === self) return false;
      const isCreature = event === 'dies' ? data.snap && data.snap.types.includes('Creature') : data.card.is('Creature');
      const controller = event === 'dies' ? data.snap && data.snap.ctrl : data.card.ctrl;
      return !!isCreature && (eventFilter !== 'your-creature' || controller === self.ctrl);
    };
    if (eventFilter === 'self') return (game, self, data) => data && data.card === self;
    if (eventFilter === 'self-attacker') return (game, self, data) => data && data.attacker === self;
    if (eventFilter === 'self-blocker') return (game, self, data) => data && data.blocker === self;
    if (eventFilter === 'self-card') return (game, self, data) => data && data.card === self;
    if (eventFilter === 'your-upkeep' || eventFilter === 'your-end-step' || eventFilter === 'your-combat' || eventFilter === 'your-draw-step') {
      return (game, self, data) => data && data.player === self.ctrl;
    }
    if (eventFilter === 'another-your-creature') {
      return (game, self, data) => {
        if (!data || !data.card || data.card === self) return false;
        if (event === 'dies') {
          return !!(data.snap && data.snap.ctrl === self.ctrl && data.snap.types.includes('Creature'));
        }
        return data.card.ctrl === self.ctrl && data.card.is('Creature');
      };
    }
    if (eventFilter === 'another-your-artifact') {
      return (game, self, data) => {
        if (!data || !data.card || data.card === self) return false;
        if (event === 'dies') {
          return !!(data.snap && data.snap.ctrl === self.ctrl && data.snap.types.includes('Artifact'));
        }
        return data.card.ctrl === self.ctrl && data.card.is('Artifact');
      };
    }
    if (eventFilter === 'your-cast' || eventFilter === 'your-draw') {
      return (game, self, data) => data && data.player === self.ctrl;
    }
    if (eventFilter) throw new Error('Unknown generic Oracle event filter: ' + eventFilter);
    if (event === 'etb' || event === 'dies' || event === 'attacks' || event === 'combatDamageToPlayer') {
      return (game, self, data) => data && data.card === self;
    }
    if (event === 'damageToPlayer') return (game, self, data) => data && data.src === self;
    if (event === 'landfall') return (game, self, data) => data && data.card && data.card.ctrl === self.ctrl;
    if (event === 'lifeGain') return (game, self, data) => data && data.player === self.ctrl;
    return null;
  }

  function captureAttachedHost(ctx) {
    const sourceVersion = ctx.sourceZoneVersion ?? ctx.oracleSourceCapture?.zoneVersion;
    const live = sameBattlefieldSource(ctx), sourceHistory = ctx.src.battlefieldLKI?.get(sourceVersion);
    const iid = live ? ctx.src.attachedTo : sourceHistory?.attachedTo || ctx.sourceMeta?._lastAttachedTo || ctx.sourceAttachedTo;
    const subject = ctx.g.byIid(iid);
    if (!subject) return null;
    let zoneVersion = live ? subject.zoneVersion : sourceHistory?.attachedTo ? sourceHistory.attachedHostVersion : null;
    if (zoneVersion === null || zoneVersion === undefined) {
      // A departing host detaches its Aura before moving that Aura. Its own
      // departure snapshot retains the actual attachment and both identities.
      const history = [...(subject.battlefieldLKI?.values() || [])].reverse().find(snapshot =>
        snapshot.attachedSources?.some(entry => entry.card === ctx.src && entry.snap.zoneVersion === sourceVersion));
      zoneVersion = history?.zoneVersion ?? ctx.sourceAttachedToZoneVersion;
    }
    const current = subject.zone === 'battlefield' && subject.zoneVersion === zoneVersion;
    const controller = current ? subject.ctrl : subject.battlefieldLKI?.get(zoneVersion)?.ctrl;
    return controller ? {subject, zoneVersion, controller} : null;
  }

  function genericEffectSubjects(ctx, reference) {
    if(reference==='attached-host-controller'){
      const captured=ctx._oracleAttachedHost;
      if(!captured)return [];
      const {subject,zoneVersion,controller}=captured;
      return [subject.zone==='battlefield'&&subject.zoneVersion===zoneVersion?subject.ctrl:subject.battlefieldLKI?.get(zoneVersion)?.ctrl||controller];
    }
    if(reference==='unless-player')return ctx.oracleUnlessPlayer?[ctx.oracleUnlessPlayer]:[];
    if(reference==='attached-host'){
      const live=sameBattlefieldSource(ctx),version=ctx.sourceZoneVersion??ctx.oracleSourceCapture?.zoneVersion;
      const view=live?ctx.src:ctx.src.battlefieldLKI?.get(version);
      const host=view&&ctx.g.byIid(view.attachedTo);return host?.zone==='battlefield'&&(live||host.zoneVersion===view.attachedHostVersion)?[host]:[];
    }
    if(reference?.kind==='locked-player')return genericEffectSubjects(ctx,reference.index).filter(subject=>subject instanceof MTG.Player);
    if(reference?.kind==='target-controller')return [...new Set((ctx._oracleTargetControllers?.[reference.index]||[]).map(row=>row.subject?.zoneVersion===row.zoneVersion?row.subject.ctrl:row.controller).filter(Boolean))];
    if(reference?.kind==='target-owner')return [...new Set((ctx._oracleTargetControllers?.[reference.index]||[]).map(row=>row.subject?.card?.owner||row.subject?.owner).filter(Boolean))];
    if(reference==='event-player')return ctx.oracleSourceCapture?.eventPlayer?[ctx.oracleSourceCapture.eventPlayer]:[];
    if(reference==='event-card-controller')return ctx.oracleSourceCapture?.eventController?[ctx.oracleSourceCapture.eventController]:[];
    if(reference==='event-card-owner'){const owner=(ctx.oracleSourceCapture?.eventCard||ctx.data?.card)?.owner;return owner?[owner]:[];}
    if(reference==='event-card'){const card=ctx.oracleSourceCapture?.eventCard||ctx.data?.card;return card&&card.zoneVersion===ctx.eventCardZoneVersion?[card]:[];}
    if (reference === 'you') return [ctx.you];
    if (reference === 'self') return sameBattlefieldSource(ctx) ? [ctx.src] : [];
    if (reference === 'created-tokens') {
      return (ctx._oracleCreatedTokens || []).filter(entry =>
        entry.card.zone === 'battlefield' && entry.card.zoneVersion === entry.zoneVersion)
        .map(entry => entry.card);
    }
    if (typeof reference === 'number') {
      const selected = ctx.targets && ctx.targets[reference];
      return (Array.isArray(selected) ? selected : [selected]).filter(Boolean);
    }
    return [];
  }

  MTG.oracleFlashGranted = (game,player,card,castOpts={}) => {
    // A spell's own conditional flash applies where it can be cast, not just
    // while that card is on the battlefield (CR 113.6e and 702.8).
    const definition=game.castDefinition(card,castOpts),adventure=castOpts.adventure&&definition.adventure;
    if(!castOpts.faceDownCast&&!adventure&&!castOpts.splitHalf&&!castOpts.splitFuse&&
      definition.oracleSelfFlashConditions?.some(condition=>!condition||genericCondition(game,card,condition,player)))return true;
    const sources=game.bf().filter(source=>!source.faceDown&&!source.cur?.abilitiesDisabled&&
      source.def.oracleFlashPermissions?.some(permission=>permission.scope==='all'||source.ctrl===player));
    const temporary=(player.turnState.oracleFlashUntilTurn||[]).filter(permission=>permission.turn===game.turnNo);
    if(!sources.length&&!temporary.length)return false;
    // Preflight must inspect the spell being announced, before castMeta has
    // been replaced (and independently of any earlier cast of this object).
    const colors=castOpts.faceDownCast?[]:adventure?MTG.colorsOfCost(adventure.cost||''):
      definition.oracleSplit&&(castOpts.splitHalf||castOpts.splitFuse)?MTG.colorsOfCost(game.oracleSplitPrintedCost(card,castOpts)):
      definition.colorsOverride||MTG.colorsOfCost(definition.cost||'');
    const view=Object.defineProperties(Object.create(card),{
      castMeta:{value:{spellColors:colors}},
      ...(castOpts.faceDownCast||adventure?{
        def:{value:{...definition,super:[],subtypes:adventure?['Adventure']:[]}},
        hasSub:{value:subtype=>!!adventure&&subtype==='Adventure'},
      }:{}),
    });
    const matches=(filter,source)=>genericTargetSpec({what:'spell',zone:'stack',spellFilter:filter},[],0)
      .filter(game,{kind:'spell',card:view,ctrl:player,castOpts},player,source);
    return sources.some(source=>
      (source.def.oracleFlashPermissions||[]).some(permission=>
        (permission.scope==='all'||source.ctrl===player)&&matches(permission.filter,source)))||
      temporary.some(permission=>matches(permission.filter,card));
  };

  async function genericDiscard(ctx, player, n, random = false) {
    if (!player || player.lost) return;
    n = Math.min(genericAmount(n, ctx), player.hand.length);
    if (!n) return;
    if (random) {
      await ctx.g.discard(player, MTG.shuffle(player.hand.slice(), ctx.g.rnd).slice(0, n));
      return;
    }
    const cards = await player.controller.decide(ctx.g, {
      type: 'chooseCards', from: player.hand, min: n, max: n,
      prompt: 'Discard ' + n + (n === 1 ? ' card' : ' cards'),
      aiHint: { kind: 'addlDiscard' },
    });
    const chosen = Array.isArray(cards) ? [...new Set(cards)].filter(card => player.hand.includes(card)).slice(0, n) : [];
    if (chosen.length === n) await ctx.g.discard(player, chosen);
  }

  function genericInlineToken(token) {
    // Three historical v5 manifests stored the type word after the creature
    // subtypes. Preserve those manifests while correcting their runtime type.
    const extra=(token.subtypes||[]).filter(type=>['artifact','enchantment'].includes(type));
    if(extra.length)token={...token,name:token.name.replace(/ (?:artifact|enchantment)(?= |$)/g,''),types:[...new Set([...(token.types||['Creature']),...extra.map(type=>type[0].toUpperCase()+type.slice(1))])],subtypes:token.subtypes.filter(type=>!extra.includes(type))};
    const raw={
      name: token.name, cost: null, super: (token.super || []).slice(),
      types: (token.types || ['Creature']).slice(), subtypes: (token.subtypes || []).slice(),
      power: token.power===undefined?undefined:String(token.power), toughness: token.toughness===undefined?undefined:String(token.toughness), oracle: token.oracle||'',
      kws: (token.keywords || []).slice(), colorsOverride: (token.colors || []).slice(), isTokenDef: true,
    };
    if(token.operations?.length)Object.assign(raw,compileOracleScript({id:'oracle-token'},{raw,oracleId:'oracle-token',semanticClass:'creature-template',implementation:token.operations,implementedKeywords:token.keywords,oracleContracts:token.operations.map(op=>op.contract)}));
    return raw;
  }

  async function genericExplore(ctx, subject, version) {
    if(!subject)return;
    const current=()=>subject.zone==='battlefield'&&subject.zoneVersion===version;
    const snap=current()?ctx.g.snapshot(subject):subject.battlefieldLKI?.get(version);
    const explorer=snap?.ctrl;
    if(!explorer||explorer.lost)return;
    const top=explorer.library.at(-1),topVersion=top?.zoneVersion;
    if(top){
      ctx.g.lg(`Explore: revealed ${top.name}.`);
      await ctx.g.revealToHuman({cards:[top],ctrl:explorer,kind:'reveal'});
    }
    if(top?.is('Land')){
      if(top.zone==='library'&&top.zoneVersion===topVersion)await ctx.g.move(top,'hand');
    }else{
      // CR 701.44: an empty library still takes the nonland branch. A source
      // that left can explore using LKI, but its new incarnation gets no counter.
      if(current())ctx.g.addCounters(subject,'+1/+1',1,false,explorer);
      if(top){
        const choice=await explorer.controller.decide(ctx.g,{
          type:'chooseOption',prompt:`${top.name}: leave it on top or put it into your graveyard?`,
          options:[{key:'top',label:'Top'},{key:'gy',label:'Graveyard'}],aiHint:{kind:'explore',card:top},
        });
        if(choice==='gy'&&top.zone==='library'&&top.zoneVersion===topVersion&&explorer.library.includes(top))await ctx.g.move(top,'graveyard');
      }
    }
    await ctx.g.emit('explored',{card:subject,player:explorer,snap,zoneVersion:version,exploredCard:top||null,exploredLand:!!top?.is('Land')});
  }

  function genericSearchMatches(card,what) {
    if(/^(?:Plains|Island|Swamp|Mountain|Forest)(?: or (?:Plains|Island|Swamp|Mountain|Forest))+$/.test(what)) return what.split(' or ').some(type=>card.hasSub(type));
    const type=what.replace(/ permanent$/i,'');
    return genericTypeMatches(card,what,card.zone) ||
      (card.hasSub(type) && (!/ permanent$/i.test(what) || genericTypeMatches(card,'permanent',card.zone)));
  }

  function genericCount(game,source,player,node,preserveNegative=false) {
    if(typeof node==='number')return node;
    if(node.kind==='v8-permanent-count')return MTG.oracleV8PermanentCount(game,source,player,node);
    if(['casting-turn-count-v8','casting-live-count-v8'].includes(node.kind))return MTG.OracleV8CastingRules.count(game,source,player,node);
    if(node.kind==='source-attachments')return game.bf().filter(card=>card.attachedTo===source.iid&&(node.what==='permanent'||card.hasSub(node.what))).length;
    if(node.kind==='opponent-poison-total')return game.alivePlayers().filter(other=>other!==player).reduce((n,other)=>n+(other.poison||0),0);
    if(node.kind==='opponent-count')return game.alivePlayers().filter(other=>other!==player).length;
    if(node.kind==='creature-total-power')return game.creatures(player).reduce((total,card)=>total+card.power,0);
    if(node.kind==='devotion')return game.devotion(player,node.colors);
    if(node.kind==='turn-count')return player.turnState[node.field]||0;
    if(node.kind==='party'){
      const creatures=game.creatures(player),types=['Cleric','Rogue','Warrior','Wizard'];
      const assigned=new Map();
      const assign=(type,seen)=>{for(const card of creatures){if(seen.has(card)||!card.hasSub(type))continue;seen.add(card);if(!assigned.has(card)||assign(assigned.get(card),seen)){assigned.set(card,type);return true;}}return false;};
      return types.filter(type=>assign(type,new Set())).length;
    }
    if(node.kind==='source-counters')return source.counters[node.counter]||0;
    if(node.kind==='died-count')return game.diedThisTurn.filter(row=>row.types.includes('Creature')).length;
    if(node.kind==='max-stat'){const values=game.bf().filter(card=>node.filters.some(target=>genericTargetSpec(target,[],0).filter(game,card,player,source))).map(card=>card[node.stat]);return values.length?Math.max(...values,...(preserveNegative?[]:[0])):0;}
    if(node.kind==='sum')return node.values.reduce((sum,item)=>sum+genericCount(game,source,player,item,preserveNegative),0);
    if(node.kind==='life-total')return player.life;
    if(!['battlefield','graveyard','hand','library','exile'].includes(node.zone))throw new Error('Unknown Oracle count zone: '+node.zone);
    const owners=game.players.filter(p=>node.controller==='all'||(node.controller==='opponents'?p!==player:p===player));
    const cards=node.zone==='battlefield'?game.bf().filter(card=>owners.includes(card.ctrl)):owners.flatMap(p=>p[node.zone]||[]);
    if(!Array.isArray(cards)) throw new Error('Unknown Oracle count zone: '+node.zone);
    const filtered=cards.filter(card=>(!node.other || card!==source) && (!node.name||card.name===node.name) && genericSearchMatches(card,node.what)&&(!node.filters||node.filters.some(target=>genericTargetSpec(target,[],0).filter(game,card,player,source)))).filter(card=>{
      if(!node.color)return true;
      const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
      if(colors[node.color])return card.colors.includes(colors[node.color]);
      if(node.color==='colorless')return card.colors.length===0;
      if(node.color==='multicolored')return card.colors.length>1;
      if(node.color==='nonbasic')return !(card.def.super||[]).includes('Basic');
      throw new Error('Unknown Oracle count color '+node.color);
    });
    if(node.aggregate)return filtered.reduce((sum,card)=>sum+(Number(card[node.aggregate])||0),0);
    if(node.unique==='types')return new Set(filtered.flatMap(card=>card.def.types.map(type=>type==='Tribal'?'Kindred':type))).size;
    if(node.unique==='mana-values')return new Set(filtered.map(card=>card.mv)).size;
    if(node.unique==='power'||node.unique==='toughness')return new Set(filtered.map(card=>card[node.unique])).size;
    if(node.unique==='colors')return new Set(filtered.flatMap(card=>card.colors)).size;
    if(node.unique==='basic-land-types')return ['Plains','Island','Swamp','Mountain','Forest'].filter(type=>filtered.some(card=>card.hasSub(type))).length;
    return filtered.length;
  }

  async function genericOrder(ctx,cards,placement,random=false) {
    let order=cards.slice();
    if(random) MTG.shuffle(order,ctx.g.rnd);
    else if(order.length>1) {
      const chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:order,min:order.length,max:order.length,
        prompt:'Order cards '+(placement==='top'?'top first':'for the bottom'),aiHint:{kind:'orderBottom'}});
      if(Array.isArray(chosen) && chosen.length===order.length && new Set(chosen).size===order.length && chosen.every(card=>order.includes(card))) order=chosen;
    }
    const present=order.filter(card=>ctx.you.library.includes(card));
    for(const card of present) ctx.you.library.splice(ctx.you.library.indexOf(card),1);
    if(placement==='top') ctx.you.library.push(...present.reverse());
    else ctx.you.library.unshift(...present.reverse());
  }

  function genericPreventionMatches(game,source,player,effect,data,locked) {
    if(effect.combat==='combat'&&!data.combat||effect.combat==='noncombat'&&data.combat)return false;
    if(effect.yourTurnOnly&&game.turnPlayer!==player)return false;
    if(effect.recipientPlayers&&!(data.target instanceof MTG.Player))return false;
    if(effect.sourceUnblocked&&(!data.src?.attacking||data.src.wasBlocked||data.src.blockedBy?.length))return false;
    const sourceView=data.src instanceof MTG.CardInst?Object.defineProperty(Object.create(data.src),'zone',{value:'battlefield'}):null;
    if(effect.sourceFilters&&!effect.sourceFilters.some(filter=>sourceView&&genericTargetSpec(filter,[],0).filter(game,sourceView,player,source)))return false;
    if(effect.recipientFilters&&!effect.recipientFilters.some(filter=>data.target instanceof MTG.CardInst&&genericTargetSpec(filter,[],0).filter(game,data.target,player,source)))return false;
    const matches=subject=>{
      if(!subject)return false;
      if(locked?.some(row=>subject.iid===row.iid&&subject.zoneVersion===row.version))return true;
      if(effect.target==='self'&&!locked&&subject===source)return true;
      if(effect.target==='attached-host'&&!locked&&subject.zone==='battlefield'&&subject.iid===source?.attachedTo)return true;
      if(effect.player==='you'&&subject===player)return true;
      return !!effect.filters?.some(filter=>subject instanceof MTG.CardInst&&genericTargetSpec(filter,[],0).filter(game,subject,player,source));
    };
    return effect.direction==='all'||effect.direction==='by'&&matches(data.src)||effect.direction==='to'&&matches(data.target)||effect.direction==='to and dealt by'&&(matches(data.src)||matches(data.target));
  }

  function protectionMatches(game,source,bearer,quality){
    if(!source)return false;
    if(quality.kind==='color')return source.colors?.includes(quality.value);
    if(quality.kind==='colorless')return source.colors?.length===0;
    if(quality.kind==='colored')return source.colors?.length>0;
    if(quality.kind==='monocolored')return source.colors?.length===1;
    if(quality.kind==='multicolored')return source.colors?.length>1;
    if(quality.kind==='type')return !!source.is?.(quality.value);
    if(quality.kind==='subtype')return !!source.hasSub?.(quality.value);
    if(quality.kind==='filters'){const view=Object.assign(Object.create(source),{zone:'battlefield'});return quality.filters.some(filter=>genericTargetSpec(filter,[],0).filter(game,view,bearer.ctrl,bearer));}
    return false;
  }

  async function runGenericEffect(ctx, effect) {
    if(MTG.OracleV8NamedCounts.actions.has(effect.action))return MTG.OracleV8NamedCounts.run(ctx,effect,{subjects:genericEffectSubjects,effect:runGenericEffect});
    if(['source-controlled','source-controlled-tapped'].includes(effect.duration)){
      const duration=MTG.OracleV8Untap.capture(ctx,effect.duration==='source-controlled-tapped'?'controlled-tapped':'controlled');
      if(!MTG.OracleV8Untap.sourceValid(ctx.g,duration))return;
      const prior=new Set(ctx.g.untilEffects);
      if(effect.action==='pump'){for(const card of genericEffectSubjects(ctx,effect.target))if(card.zone==='battlefield')ctx.g.untilEffects.push({kind:'oracleSourcePump',expires:'object',iid:card.iid,zoneVersion:card.zoneVersion,timestamp:ctx.g.nextOracleTimestamp(),power:genericAmount(effect.power,ctx,true),toughness:genericAmount(effect.toughness,ctx,true),keywords:effect.keywords||[]});}
      else await runGenericEffect(ctx,{...effect,duration:effect.action==='combat-restriction'?'eot':null});
      for(const record of ctx.g.untilEffects)if(!prior.has(record)&&['eot','object'].includes(record.expires))Object.assign(record,{sourceDuration:duration,expires:'sourceDuration'});
      ctx.g.recalc();return;
    }
    if(effect.action==='same-name-search-v8')return MTG.OracleV8NameSearch.run(ctx,effect,{subjects:genericEffectSubjects});
    if(effect.action==='same-name-group-v8')return MTG.OracleV8NameGroups.run(ctx,effect,{subjects:genericEffectSubjects,effect:runGenericEffect});
    if(effect.action==='no-hand-limit-v8'){ctx.you.noMaxHandForever=true;return;}
    if(MTG.OracleV8Energy?.actions.has(effect.action))return MTG.OracleV8Energy.run(ctx,effect,{amount:genericAmount,run:runGenericEffects});
    if(MTG.OracleV8LandTypes?.actions.has(effect.action))return MTG.OracleV8LandTypes.run(ctx,effect,{subjects:genericEffectSubjects});
    if(MTG.OracleV8CounterTransfers?.actions.has(effect.action))return MTG.OracleV8CounterTransfers.run(ctx,effect,{subjects:genericEffectSubjects});
    if(MTG.OracleV8CounterEffects?.actions.has(effect.action))return MTG.OracleV8CounterEffects.run(ctx,effect,{subjects:genericEffectSubjects,filter:(filter,card)=>genericResolutionTargetSpec(ctx,filter,[],0,ctx.data).filter(ctx.g,card,ctx.you,ctx.src)});
    if(MTG.OracleV8Phasing?.actions.has(effect.action))return MTG.OracleV8Phasing.run(ctx,effect,{subjects:genericEffectSubjects});
    if(MTG.OracleV8Characteristics?.actions.has(effect.action))return MTG.OracleV8Characteristics.run(ctx,effect,{subjects:genericEffectSubjects});
    if(effect.action==='reveal-card-v8')return MTG.OracleV8Revealed.run(ctx,effect,{run:runGenericEffects,target:genericTargetSpec});
    if(effect.action==='monstrosity-v8')return MTG.OracleV8CreatureUpgrades.run(ctx,effect,{amount:genericAmount});
    if(effect.action==='exploit-v8')return MTG.OracleV8Exploit.run(ctx,effect);
    if(effect.action==='role-token-v8')return MTG.OracleV8PredefinedTokens.run(ctx,effect,{subjects:genericEffectSubjects,inline:genericInlineToken,filter:(filter,card)=>genericResolutionTargetSpec(ctx,filter,[],0,ctx.data).filter(ctx.g,card,ctx.you,ctx.src)});
    if(effect.action==='next-draw-replacement-v8')return MTG.OracleV8DrawReplacements.run(ctx,effect,{subjects:genericEffectSubjects});
    if(effect.action==='choose-damage-source-v8')return MTG.OracleV8SourcePrevention.run(ctx,effect,{subjects:genericEffectSubjects});
    if(effect.action==='clash-v8')return MTG.OracleV8Clash.run(ctx,effect,{effect:runGenericEffect});
    if(effect.action==='coin-flip-v8')return MTG.OracleV8Coins.run(ctx,effect,{subjects:genericEffectSubjects,run:runGenericEffects});
    if(MTG.OracleV8DelayedObjects?.actions.has(effect.action))return MTG.OracleV8DelayedObjects.run(ctx,effect,{subjects:genericEffectSubjects,run:runGenericEffects,effect:runGenericEffect,filter:(filter,card)=>genericResolutionTargetSpec(ctx,filter,[],0,ctx.data).filter(ctx.g,card,ctx.you,ctx.src)});
    if(MTG.OracleV8TokenForms?.actions.has(effect.action))return MTG.OracleV8TokenForms.run(ctx,effect,{run:runGenericEffects,effect:runGenericEffect});
    if(effect.action==='install-trigger-v8')return MTG.OracleV8DelayedTriggers.install(ctx,effect,compileGenericTrigger);
    if(effect.action==='linked-untap-v8')return MTG.OracleV8Untap.run(ctx,effect,genericEffectSubjects);
    if(effect.action==='extra-turn-v8'){for(const player of genericEffectSubjects(ctx,effect.target))if(player instanceof MTG.Player&&!player.lost)ctx.g.scheduleExtraTurn(player);return;}
    if(effect.action==='extra-phase-v8'){
      const phase=ctx.g.phase;
      if(effect.after==='main'&&!['main1','main2'].includes(phase)||effect.after==='combat'&&phase!=='combat')return;
      ctx.g.scheduleAdditionalPhases(effect.phases);return;
    }
    if(ctx.oracleResolutionResults&&!ctx.oracleResultCaptureInner&&MTG.OracleV8Results.family(effect))return MTG.OracleV8Results.capture(ctx,effect,()=>runGenericEffect({...ctx,oracleResultCaptureInner:true},effect),{subjects:genericEffectSubjects,amount:genericAmount,target:(...args)=>genericResolutionTargetSpec(ctx,...args)});
    if(effect.action==='with-card-results-v8')return MTG.OracleV8Results.run(ctx,effect,{run:runGenericEffects,target:genericTargetSpec});
    if(MTG.OracleV8PlayPermissions?.actions.has(effect.action))return MTG.OracleV8PlayPermissions.run(ctx,effect,{subjects:genericEffectSubjects,amount:genericAmount,target:genericTargetSpec});
    if(MTG.OracleV8StackCopy?.actions.has(effect.action))return MTG.OracleV8StackCopy.run(ctx,effect,{subjects:genericEffectSubjects,amount:genericAmount,target:genericTargetSpec});
    if(effect.action==='grant-flash-turn-v8'){
      (ctx.you.turnState.oracleFlashUntilTurn||(ctx.you.turnState.oracleFlashUntilTurn=[])).push({turn:ctx.g.turnNo,filter:effect.filter});
      ctx.g.lg(`${ctx.you.name} may cast the permitted spells as though they had flash this turn.`,'effect');
      return;
    }
    if(MTG.OracleV8Library?.actions.has(effect.action))return MTG.OracleV8Library.run(ctx,effect,{amount:genericAmount,target:(...args)=>genericResolutionTargetSpec(ctx,...args),subjects:genericEffectSubjects});
    if(MTG.OracleV8MultizoneSearch?.actions.has(effect.action))return MTG.OracleV8MultizoneSearch.run(ctx,effect,{target:(...args)=>genericResolutionTargetSpec(ctx,...args)});
    if(MTG.OracleV8Linked?.actions.has(effect.action))return MTG.OracleV8Linked.run(ctx,effect,{subjects:genericEffectSubjects,amount:genericAmount,target:(...args)=>genericResolutionTargetSpec(ctx,...args),effects:runGenericEffects,sameSource:sameBattlefieldSource});
    if(MTG.OracleV8Effects?.actions.has(effect.action))return MTG.OracleV8Effects.run(ctx,effect,{subjects:genericEffectSubjects,amount:genericAmount,target:(...args)=>genericResolutionTargetSpec(ctx,...args),effects:runGenericEffects,sameSource:sameBattlefieldSource});
    if(MTG.OracleV8Copies?.actions.has(effect.action))return MTG.OracleV8Copies.run(ctx,effect,{subjects:genericEffectSubjects,amount:genericAmount,target:(...args)=>genericResolutionTargetSpec(ctx,...args),sameSource:sameBattlefieldSource,compile:operations=>compileOracleScript({id:'oracle-v8-copy-runtime'},{raw:{},implementation:operations})});
    if(effect.action==='damage-batch'){
      const hits=[],sourceCache=new Map();
      for(const hit of effect.hits){
        const cards=hit.filters?ctx.g.bf().filter(card=>hit.filters.some(filter=>genericResolutionTargetSpec(ctx,filter,[],0,ctx.data).filter(ctx.g,card,ctx.you,ctx.src))):hit.target==='each-opponent'?ctx.g.alivePlayers().filter(player=>player!==ctx.you):hit.target==='each-player'?ctx.g.alivePlayers():genericEffectSubjects(ctx,hit.target);
        if(hit.players)cards.push(...ctx.g.alivePlayers().filter(player=>hit.players==='each-player'||player!==ctx.you));
        if(!sourceCache.has(hit.source))sourceCache.set(hit.source,oracleDamageSource(ctx,hit.source));
        const n=genericAmount(hit.n,ctx),source=hit.sourceTarget!==undefined?genericEffectSubjects(ctx,hit.sourceTarget)[0]:sourceCache.get(hit.source);
        if(!source)continue;
        if(hit.sourceTarget!==undefined&&(source.zone!=='battlefield'||!source.is('Creature')))continue;
        for(const target of new Set(cards))hits.push({src:hit.selfDamageStat?target:source,target,n:hit.selfDamageStat?Math.max(0,target[hit.selfDamageStat]):n,opts:hit.exileDamagedThisTurn?{_oracleDamageRecipients:[]}:undefined});
      }
      ctx._oracleDamageDealt=await ctx.g.damageBatch(hits,{deferSBA:true});
      const recipients=hits.flatMap(hit=>hit.opts?._oracleDamageRecipients||[]);
      if(recipients.length)ctx.g.untilEffects.push({kind:'oracleDeathExile',expires:'eot',locked:recipients});
      return;
    }
    if(effect.n?.kind==='affected-player-count'){
      if(!['draw','gain-life','lose-life','mill','discard'].includes(effect.action))throw new Error('Unsupported player-scoped count action');
      const players=effect.who==='each-player'?ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you):effect.who==='each-opponent'?ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you).filter(player=>player!==ctx.you):genericEffectSubjects(ctx,effect.who);
      const fraction=effect.n.divide!==undefined;
      if(fraction&&(![2,3].includes(effect.n.divide)||!['up','down'].includes(effect.n.round)))throw new Error('Unsupported player-scoped fraction');
      const amounts=players.map(player=>{
        const amount=genericCount(ctx.g,ctx.src,player,effect.n.count)*(effect.n.multiply??1);
        return fraction?Math[effect.n.round==='up'?'ceil':'floor'](Math.max(0,amount)/effect.n.divide):amount;
      });
      let lost=0;
      for(const [index,player]of players.entries()){
        const child={...ctx,targets:[player]};
        await runGenericEffect(child,{...effect,who:0,n:amounts[index]});
        if(effect.action==='lose-life')lost+=child._oracleLifeLost||0;
      }
      if(effect.action==='lose-life')ctx._oracleLifeLost=lost;
      return;
    }
    if(effect.action==='counter-spells'){
      const objects=ctx.g.stack.filter(object=>genericResolutionTargetSpec(ctx,effect.filter,[],0).filter(ctx.g,object,ctx.you,ctx.src));
      for(const object of objects)await ctx.g.counterStackObject(object);return;
    }
    if(effect.action==='combat-mana'){
      const n=genericAmount(effect.n,ctx);if(n>0){ctx.you.pool.R=(ctx.you.pool.R||0)+n;(ctx.you.poolMeta||=[]).push({color:'R',n,persist:'combat'});}return;
    }
    if(effect.action==='exile-top'){
      const players=effect.who==='you'?[ctx.you]:effect.who==='each-player'?ctx.g.apnapFrom(ctx.g.turnPlayer):effect.who==='each-opponent'?ctx.g.apnapFrom(ctx.g.turnPlayer).filter(player=>player!==ctx.you):genericEffectSubjects(ctx,effect.who),n=genericAmount(effect.n,ctx);
      for(const player of players)for(const card of n>0?player.library.slice(-n).reverse():[]){
        await ctx.g.move(card,'exile');if(card.zone!=='exile'||!effect.permission)continue;
        card.meta.playableBy=ctx.you;card.meta.spellsOnly=!!effect.permission.spellsOnly;card.meta.anyColor=!!effect.permission.anyColor;
        if(effect.permission.nextOwnTurn)card.meta.playableUntilOwnTurn=ctx.you.turnsStarted+1;else card.meta.playableUntil=ctx.g.turnNo;
      }return;
    }
    if(effect.action==='owner-library-choice'){
      for(const card of genericEffectSubjects(ctx,effect.target))if(card.zone==='battlefield'){
        const choice=await card.owner.controller.decide(ctx.g,{type:'chooseOption',prompt:'Put '+card.name+' on top or bottom?',options:[{key:'top',label:'Top'},{key:'bottom',label:'Bottom'}],aiHint:{kind:'oracleLibraryChoice',card}});
        await ctx.g.move(card,'library',{toBottom:choice==='bottom'});
      }return;
    }
    if(effect.action==='inspect-top'){
      const player=effect.who==='you'?ctx.you:genericEffectSubjects(ctx,effect.who)[0];if(!player)return;
      const cards=player.library.slice(-effect.n).reverse();if(!cards.length)return;
      if(effect.reveal)await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal',includeLands:true});
      if(!ctx.you.isAI)await ctx.you.controller.decide(ctx.g,{type:'cardReveal',player:ctx.you,cards,kind:effect.reveal?'reveal':'look',private:!effect.reveal});
      const card=cards[0],mv=card.mv;let moved=false;
      if(effect.destination&&(!effect.filter||genericResolutionTargetSpec(ctx,effect.filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))){
        const selected=!effect.optionalMove||await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Move the inspected card?',options:[{key:'yes',label:'Move card'},{key:'no',label:'Leave card'}],aiHint:{kind:'optTrigger',src:ctx.src}})==='yes';
        if(selected){if(effect.revealSelected)await ctx.g.revealToHuman({cards:[card],ctrl:ctx.you,kind:'reveal',includeLands:true});if(effect.destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(card,ctx.you,{tapped:effect.tapped});else await ctx.g.move(card,effect.destination);moved=true;}
      }
      if(!moved&&effect.otherwise&&card.zone==='library'){
        const selected=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Move the inspected card to '+effect.otherwise+'?',options:[{key:'yes',label:'Move card'},{key:'no',label:'Leave card'}],aiHint:{kind:'optTrigger',src:ctx.src}});
        if(selected==='yes')await ctx.g.move(card,effect.otherwise==='bottom'?'library':effect.otherwise,{toBottom:effect.otherwise==='bottom'});
      }
      if(effect.loseLife==='mana-value')await ctx.g.loseLife(ctx.you,mv,'Revealed card');return;
    }
    if(effect.action==='combat-restriction'){
      const cards=effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>genericResolutionTargetSpec(ctx,filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))):genericEffectSubjects(ctx,effect.target);
      const restriction=MTG.OracleV8CombatRestrictions?.bind(ctx,effect.restriction)||effect.restriction;
      for(const card of cards)if(card.zone==='battlefield')ctx.g.untilEffects.push({kind:'oracleCombatRestriction',expires:effect.duration==='next-turn'?'untilTurnOf':effect.duration,...(effect.duration==='next-turn'?{whoTurn:ctx.you}:{}),iid:card.iid,zoneVersion:card.zoneVersion,controller:ctx.you.idx,restriction});
      ctx.g.recalc();return;
    }
    if(effect.action==='grant-protection'){
      const cards=effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>genericResolutionTargetSpec(ctx,filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))):genericEffectSubjects(ctx,effect.target);
      const options=effect.choose==='color'?COLORS.map(color=>({key:color,label:color,quality:{kind:'color',value:color}})):['Artifact','Battle','Creature','Enchantment','Instant','Kindred','Land','Planeswalker','Sorcery'].map(type=>({key:type,label:type,quality:{kind:'type',value:type}}));
      for(const [i,quality]of (effect.alternatives||[]).entries())options.push({key:'extra-'+i,label:quality.value||quality.kind,quality});
      let shared;
      if(effect.choose&&effect.chooser==='you'){const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose protection quality',options,aiHint:{kind:'oracleProtection',cards}});shared=options.find(option=>option.key===choice)?.quality||options[0].quality;}
      for(const card of cards)if(card.zone==='battlefield'){
        let quality=shared;
        if(effect.choose&&effect.chooser==='controller'){const choice=await card.ctrl.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose protection quality',options,aiHint:{kind:'oracleProtection',cards:[card]}});quality=options.find(option=>option.key===choice)?.quality||options[0].quality;}
        const qualities=effect.choose?[quality]:effect.qualities,iid=card.iid,version=card.zoneVersion;
        ctx.g.untilEffects.push({kind:'oracleProtection',expires:'eot',iid,zoneVersion:version,qualities,apply:(game,bf)=>{const current=bf.find(row=>row.iid===iid&&row.zoneVersion===version);if(current)for(const q of qualities)current.cur.protectionFrom.push((g,source,bearer)=>protectionMatches(g,source,bearer,q));}});
      }
      ctx.g.recalc();return;
    }
    if(effect.action==='death-exile'){
      const cards=effect.scope?[]:genericEffectSubjects(ctx,effect.target).filter(card=>card.zone==='battlefield');
      ctx.g.untilEffects.push({kind:'oracleDeathExile',expires:'eot',scope:effect.scope,controller:ctx.you.idx,locked:cards.map(card=>({iid:card.iid,version:card.zoneVersion}))});return;
    }
    if(effect.action==='exile-source'){
      const died=ctx.oracleSourceCapture?.zone==='graveyard'&&ctx.data?.card===ctx.src&&ctx.data.snap&&ctx.src.zone==='graveyard'&&ctx.src.zoneVersion===ctx.sourceZoneVersion;
      if(sameBattlefieldSource(ctx)||died)await ctx.g.move(ctx.src,'exile');return;
    }
    if(effect.action==='unless-cost'){
      const group=['each-player','each-opponent'].includes(effect.who);
      const players=group?ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you).filter(player=>effect.who==='each-player'||player!==ctx.you):effect.who==='you'?[ctx.you]:genericEffectSubjects(ctx,effect.who);
      for(const player of players){
        const choices=effect.payment.kind==='alternatives'?effect.payment.choices:[effect.payment];
        const plans=choices.map((cost,index)=>{
          const candidates=cost.zone?(cost.zone==='battlefield'?ctx.g.bf():player[cost.zone]).filter(card=>(cost.zone!=='battlefield'||card.ctrl===player)&&genericResolutionTargetSpec(ctx,cost.filter,[],0).filter(ctx.g,card,player,ctx.src)&&(cost.kind!=='sacrifice'||ctx.g.canSacrifice(card))):[];
          const payable=cost.kind==='mana'?ctx.g.canPayMana(player,MTG.parseCost(cost.mana)):cost.kind==='life'?player.life>=cost.n:candidates.length>=cost.n;
          return {cost,candidates,payable,index};
        }).filter(plan=>plan.payable);
        let paid=false;
        if(plans.length){
          const multiple=choices.length>1;
          const options=plans.map(plan=>({key:multiple?'pay-'+plan.index:'yes',label:'Pay: '+(plan.cost.mana||plan.cost.kind+' '+plan.cost.n),payment:plan.cost}));options.push({key:'no',label:'Do not pay'});
          const choice=await player.controller.decide(ctx.g,{type:'chooseOption',player,prompt:'Pay to avoid the Oracle effect?',options,aiHint:{kind:'oracleUnlessPayment',cost:plans[0].cost.mana||null}});
          const plan=plans.find(plan=>choice===(multiple?'pay-'+plan.index:'yes'));
          if(plan){const {cost,candidates}=plan;
            if(cost.kind==='mana')paid=await ctx.g.payMana(player,MTG.parseCost(cost.mana));
            else if(cost.kind==='life'){await ctx.g.loseLife(player,cost.n,'Oracle payment');paid=true;}
            else {
              let chosen;
              if(cost.random){chosen=candidates.slice();MTG.shuffle(chosen,ctx.g.rnd);chosen=chosen.slice(0,cost.n);}
              else chosen=await player.controller.decide(ctx.g,{type:'chooseCards',player,from:candidates,min:cost.n,max:cost.n,prompt:'Choose cards for Oracle payment',aiHint:{kind:cost.kind==='discard'?'addlDiscard':cost.kind==='sacrifice'?'sacCost':cost.kind==='tap'?'tapCost':'bounceCost',src:ctx.src}});
              if(Array.isArray(chosen)&&chosen.length===cost.n&&new Set(chosen).size===cost.n&&chosen.every(card=>candidates.includes(card))){
                if(cost.kind==='discard')await ctx.g.discard(player,chosen);
                else for(const card of chosen)if(cost.kind==='sacrifice')await ctx.g.sacrifice(player,card);else if(cost.kind==='return')await ctx.g.move(card,'hand');else ctx.g.tap(card);
                paid=true;
              }
            }
          }
        }
        if(!paid){
          const bind=value=>Array.isArray(value)?value.map(bind):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,['target','who'].includes(key)&&item===effect.who&&group?'unless-player':bind(item)])):value;
          await runGenericEffects({...ctx,oracleUnlessPlayer:player},group?effect.effects.map(bind):effect.effects);
        }
      }
      return;
    }
    if(['scale-pt','switch-pt','double-counters'].includes(effect.action)){
      const cards=effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>genericResolutionTargetSpec(ctx,filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))):genericEffectSubjects(ctx,effect.target);
      const rows=cards.filter(card=>card.zone==='battlefield').map(card=>({iid:card.iid,version:card.zoneVersion,power:card.power,toughness:card.toughness,counters:{...card.counters}}));
      for(const row of rows){
        if(effect.action==='double-counters'){const card=ctx.g.byIid(row.iid);for(const [kind,n]of Object.entries(row.counters))if(effect.counter==='all'||effect.counter===kind)ctx.g.addCounters(card,kind,n,false,ctx.you);continue;}
        ctx.g.untilEffects.push({kind:effect.action==='switch-pt'?'oraclePTSwitch':'oraclePTScale',expires:'eot',iid:row.iid,zoneVersion:row.version,...(effect.action==='scale-pt'?{apply:(game,bf)=>{const card=bf.find(card=>card.iid===row.iid&&card.zoneVersion===row.version);if(card){card.cur.power+=(effect.power?row.power:0)*(effect.factor-1);card.cur.toughness+=(effect.toughness?row.toughness:0)*(effect.factor-1);}}}:{})});
      }
      ctx.g.recalc();return;
    }
    if(effect.action==='prevent-all'){
      const locked=effect.target===undefined?null:genericEffectSubjects(ctx,effect.target).map(card=>({iid:card.iid,version:card.zoneVersion})),seat=ctx.you.idx,sourceId=ctx.src.iid;
      ctx.g.untilEffects.push({kind:'oracleDamagePrevention',expires:'eot',run:(game,data)=>genericPreventionMatches(game,game.byIid(sourceId),game.players[seat],effect,data,locked)?0:data.n});
      return;
    }
    if(effect.action==='goad'||effect.action==='suspect'){
      const cards=effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>genericResolutionTargetSpec(ctx,filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))):genericEffectSubjects(ctx,effect.target);
      for(const card of cards)if(card.zone==='battlefield'){
        if(effect.action==='suspect')card.meta.suspected=true;
        else {
          const version=card.zoneVersion,iid=card.iid,seat=ctx.you.idx;
          ctx.g.untilEffects.push({kind:'oracleGoad',expires:'untilTurnOf',whoTurn:ctx.you,apply:game=>{const current=game.bf().find(row=>row.iid===iid&&row.zoneVersion===version);if(current)(current.cur.goadedBy||(current.cur.goadedBy=[])).push(game.players[seat]);}});
        }
      }
      ctx.g.recalc();return;
    }
    if(effect.action==='reflexive-cost'){
      const cost=effect.cost,player=ctx.you;
      let candidates=[];
      if(cost.zone){
        const filter=genericResolutionTargetSpec(ctx,{...cost.filter,zone:cost.zone,controller:'you',excludeSelf:!!cost.filter.excludeSelf&&sameBattlefieldSource(ctx)},[],0).filter;
        candidates=(cost.zone==='battlefield'?ctx.g.bf().filter(card=>card.ctrl===player):player[cost.zone]).filter(card=>filter(ctx.g,card,player,ctx.src)&&(cost.action!=='sacrifice'||ctx.g.canSacrifice(card)));
        if(candidates.length<cost.n)return;
      }
      if(cost.life&&player.life<cost.life||cost.mana&&!ctx.g.canPayMana(player,MTG.parseCost(cost.mana))||cost.energy&&MTG.OracleV8Energy.count(player)<cost.energy)return;
      const answer=await player.controller.decide(ctx.g,{type:'chooseOption',prompt:'Pay the reflexive ability cost?',options:[{key:'yes',label:'Pay'},{key:'no',label:'Decline'}],aiHint:{kind:'optTrigger',src:ctx.src}});
      if(answer!=='yes')return;
      if(cost.energy&&!MTG.OracleV8Energy.spend(ctx.g,player,cost.energy,ctx.src))return;
      if(cost.mana&&!await ctx.g.payMana(player,MTG.parseCost(cost.mana)))return;
      if(cost.life)await ctx.g.loseLife(player,cost.life,'Reflexive ability cost');
      if(cost.zone){
        const keepTargets=candidates.filter(card=>effect.reflexiveBody.targets.some(target=>target.zone===cost.zone&&genericResolutionTargetSpec(ctx,target,[],0).filter(ctx.g,card,player,ctx.src)));
        const picked=await player.controller.decide(ctx.g,{type:'chooseCards',from:candidates,min:cost.n,max:cost.n,prompt:'Choose cards for the reflexive ability cost',aiHint:{kind:'reflexiveCost',keepTargets,src:ctx.src}});
        if(!Array.isArray(picked)||new Set(picked).size!==cost.n||picked.length!==cost.n||picked.some(card=>!candidates.includes(card)))return;
        if(cost.action==='sacrifice'){ctx.sacd=picked.map(card=>ctx.g.snapshot(card));await ctx.g.sacrificeMany(player,picked);}
        else if(cost.action==='discard')await ctx.g.discard(player,picked);
        else await ctx.g.moveGraveyardBatch(picked,'exile');
      }
      const body=effect.reflexiveBody;
      // CR 603.12: choose these targets only when the new trigger is put
      // on the Stack. Preserve its controller and original source identity.
      ctx.g.queueTrigger({src:ctx.src,ctrl:player,data:ctx.data,name:'When you do',oracleReflexive:effect,
        targets:(body.targets||[]).map((target,index)=>genericResolutionTargetSpec(ctx,target,body.effects,index)),
        prepareTargets:async child=>{for(const key of ['sourceIid','sourceTimestamp','sourceZoneVersion','oracleSourceCapture','eventCardZoneVersion','x','sacd'])if(ctx[key]!==undefined)child[key]=ctx[key];return true;},
        run:async child=>{
          if(body.optional){const use=await child.you.controller.decide(child.g,{type:'chooseOption',prompt:'Use the reflexive effect?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'optTrigger',src:child.src}});if(use!=='yes')return;}
          await runGenericEffects(child,body.effects);
        }});
      return;
    }
    if(effect.action==='zone-select'){
      const players=effect.who==='each-player'?ctx.g.alivePlayers():effect.who==='each-opponent'?ctx.g.alivePlayers().filter(p=>p!==ctx.you):effect.who==='you'?[ctx.you]:genericEffectSubjects(ctx,effect.who);
      const groups=[];
      for(const player of players){
        const from=player[effect.zone].filter(card=>genericResolutionTargetSpec(ctx,effect.filter,[],0).filter(ctx.g,card,player,ctx.src));
        let cards=from;
        if(effect.n!=='all'){
          const max=Math.min(genericAmount(effect.n,ctx),from.length),min=effect.upTo?0:max;
          if(!max)continue;
          const answer=await player.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt:'Choose cards from your '+effect.zone,aiHint:{kind:effect.destination==='exile'?'exileGY':'recur'}});
          if(!Array.isArray(answer)||new Set(answer).size!==answer.length||answer.length<min||answer.length>max||answer.some(card=>!from.includes(card)))throw new Error('Invalid Oracle zone choice');
          cards=answer;
        }
        groups.push({player,cards:cards.map(card=>({card,zoneVersion:card.zoneVersion}))});
      }
      const move=async()=>{
        for(const {player,cards}of groups)for(const {card,zoneVersion}of cards){
          if(card.zone!==effect.zone||card.zoneVersion!==zoneVersion)continue;
          if(effect.destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(card,player,{tapped:!!effect.tapped});
          else await ctx.g.move(card,effect.destination);
        }
      };
      if(effect.destination==='battlefield')await ctx.g.withBattlefieldEntryBatch(move);else await move();
      return;
    }
    if(effect.action==='exile-resolving-spell'){
      if(ctx.so?.kind==='spell'&&!ctx.so.isCopy&&ctx.so.card===ctx.src&&ctx.src.zone==='stack')await ctx.g.move(ctx.src,'exile');return;
    }
    if(effect.action==='return-grave-source'){
      if(ctx.src.zone==='graveyard'&&ctx.src.zoneVersion===ctx.sourceZoneVersion)await ctx.g.move(ctx.src,effect.destination,{ctrl:ctx.you,tapped:effect.tapped,additionalCounters:effect.additionalCounters});return;
    }
    if(effect.duration==='next-turn'||effect.duration==='combat'){
      const prior=new Set(ctx.g.untilEffects);await runGenericEffect(ctx,{...effect,duration:null});
      for(const record of ctx.g.untilEffects)if(!prior.has(record)&&record.expires==='eot'){record.expires=effect.duration==='combat'?'combat':'untilTurnOf';record.whoTurn=ctx.you;}return;
    }
    const n = genericAmount(effect.n, ctx);
    const subjects = genericEffectSubjects(ctx, effect.target);
    if(effect.action==='ability-loss-v8'){
      const cards=effect.controlledCreatures?subjects.flatMap(player=>ctx.g.creatures(player)):effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>genericResolutionTargetSpec(ctx,filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))):subjects;
      MTG.OracleV8AbilityLoss.add(ctx.g,cards,effect);return;
    }
    if(effect.action==='choose-keyword'){
      const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a keyword',options:effect.choices.map(key=>({key,label:key})),aiHint:{kind:'oracleKeyword',cards:subjects}}),keyword=effect.choices.includes(answer)?answer:effect.choices[0];
      for(const card of subjects)if(card.zone==='battlefield')MTG.E.pumpUntilEOT(ctx.g,card,effect.power,effect.toughness,[keyword]);return;
    }
    if(effect.action==='backup'){
      for(const card of subjects)if(card.zone==='battlefield'){
        ctx.g.addCounters(card,'+1/+1',n,false,ctx.you);
        if(card.iid===ctx.src.iid&&card.zoneVersion===ctx.sourceZoneVersion)continue;
        MTG.E.pumpUntilEOT(ctx.g,card,0,0,effect.keywords||[]);
        for(const operation of effect.operations)await runGenericEffect({...ctx,targets:[card]},{action:'grant-operation',target:0,operation});
      }return;
    }
    if(effect.action==='grant-operation'){
      const child=effect.operation.kind==='mana-source'&&manaUsesStack(effect.operation)?stackManaOperation(effect.operation):effect.operation;
      const grants=child.kind==='generic-trigger'?[].concat(child.event).map(event=>compileGenericTrigger({...child,event})):[child.kind==='mana-source'?compileGenericMana(child):compileGenericAbility(child)];
      const affected=(effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>genericResolutionTargetSpec(ctx,filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))):subjects).map(card=>({card,version:card.zoneVersion}));
      for(const {card,version}of affected)ctx.g.untilEffects.push({kind:'oracleGrantedOperation',expires:'eot',iid:card.iid,zoneVersion:version,field:child.kind==='generic-trigger'?'extraTriggers':child.kind==='mana-source'?'extraMana':'extraAbilities',grants,keywords:effect.keywords||[]});
      ctx.g.recalc();return;
    }
    if(effect.action==='animate'){const cards=effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>genericResolutionTargetSpec(ctx,filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))):subjects;const animation={...effect,...(effect.power!==undefined?{power:genericAmount(effect.power,ctx,true)}:{}),...(effect.toughness!==undefined?{toughness:genericAmount(effect.toughness,ctx,true)}:{})};for(const card of cards)if(card.zone==='battlefield')ctx.g.addOracleAnimation(card,animation);return;}
    if(effect.action==='optional-sacrifice'){
      const from=ctx.g.bf().filter(card=>card.ctrl===ctx.you&&ctx.g.canSacrifice(card)&&genericResolutionTargetSpec(ctx,effect.filter,[],0).filter(ctx.g,card,ctx.you,ctx.src));
      if(!from.length)return;
      const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:0,max:1,prompt:'You may sacrifice a permanent',aiHint:{kind:'sacCost',src:ctx.src,optional:true}});
      if(Array.isArray(picked)&&picked.length===1&&from.includes(picked[0])){const sacd=[ctx.g.snapshot(picked[0])];await ctx.g.sacrifice(ctx.you,picked[0]);await runGenericEffects({...ctx,sacd},effect.effects);}return;
    }
    if(effect.action==='exile-until-source-leaves'){
      if(!sameBattlefieldSource(ctx))return;
      const duration={source:ctx.src,sourceZoneVersion:ctx.src.zoneVersion,cards:subjects.filter(card=>card.zone==='battlefield').map(card=>({card,zoneVersion:card.zoneVersion+1}))};
      (ctx.g.oracleExileDurations||(ctx.g.oracleExileDurations=[])).push(duration);
      await ctx.g.exileMany(duration.cards.map(entry=>entry.card));return;
    }
    if(effect.action==='tap-or-untap'){
      for(const card of subjects)if(card.zone==='battlefield'){
        const options=[{key:'tap',label:'Tap'},{key:'untap',label:'Untap'},...(effect.may?[{key:'none',label:'Leave unchanged'}]:[])];
        const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Tap or untap '+card.name+'?',options,aiHint:{kind:'tapUntap',target:card}});
        if(choice==='tap')ctx.g.tap(card);else if(choice==='untap')ctx.g.untap(card);
      }return;
    }
    if(effect.action==='transform-self'){
      // A transforming permanent keeps its physical identity and swaps to its
      // other printed face. Leaving the battlefield resets it to the front.
      if(!sameBattlefieldSource(ctx))return;
      const faces=MTG.OracleV8Faces?.physical(ctx.src);
      if(!faces||faces.faces.length!==2)return;
      const next=ctx.src.oracleFace==='back'?'front':'back';
      if(MTG.OracleV8Faces.setFace(ctx.src,next)){
        ctx.src.oracleTransformCount=(ctx.src.oracleTransformCount||0)+1;
        ctx.g.recalc();
        ctx.g.lg(`${ctx.src.name} transforms.`,'effect');
        await ctx.g.emit('transformed',{card:ctx.src,face:next});
      }
      return;
    }
    if(effect.action==='gain-control'){
      for(const card of subjects)if(card.zone==='battlefield')MTG.OracleV8Control.gain(ctx.g,card,ctx.you,{temporary:!!effect.temporary});
      ctx.g.recalc();return;
    }
    if(effect.action==='base-pt'){
      const cards=effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>genericResolutionTargetSpec(ctx,filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))):subjects;
      const power=genericAmount(effect.power,ctx,true),toughness=genericAmount(effect.toughness,ctx,true);
      for(const card of cards)if(card.zone==='battlefield')ctx.g.addOracleBasePT(card,{power,toughness,keywords:effect.keywords||[],temporary:effect.temporary!==false});
      ctx.g.recalc();return;
    }
    if(effect.action==='sacrifice-unless-pay'){
      const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Pay '+effect.cost+'?',options:[{key:'no',label:'Do not pay'},{key:'yes',label:'Pay '+effect.cost}],aiHint:{kind:'pay',cost:effect.cost}});
      if(choice!=='yes'||!await ctx.g.payMana(ctx.you,MTG.parseCost(effect.cost),{card:ctx.src}))if(sameBattlefieldSource(ctx)&&ctx.src.ctrl===ctx.you)await ctx.g.sacrifice(ctx.you,ctx.src);
      return;
    }
    const who = effect.who === 'you' ? ctx.you
      : typeof effect.who === 'number' || ['locked-player','target-controller','target-owner'].includes(effect.who?.kind) || ['event-player','event-card-controller','event-card-owner','unless-player'].includes(effect.who) ? genericEffectSubjects(ctx, effect.who)[0]
        : null;

    if (['draw', 'gain-life', 'mill', 'discard', 'discard-hand','token-inline','token-key'].includes(effect.action) &&
        ['each-player', 'each-opponent'].includes(effect.who)) {
      for (const player of ctx.g.alivePlayers().slice()) {
        if (effect.who === 'each-opponent' && player === ctx.you) continue;
        await runGenericEffect({...ctx, targets: [player]}, {...effect, who: 0});
      }
      return;
    }
    if (effect.action === 'discard-hand') {
      if (who) await ctx.g.discard(who, who.hand.slice());
      return;
    }
    if(effect.action==='choose-permanents'){
      const players=ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you).filter(player=>effect.who==='each-player'||effect.who==='each-opponent'?effect.who==='each-player'||player!==ctx.you:player===who);
      const groups=[];
      for(const player of players){
        const candidates=ctx.g.bf().filter(card=>(effect.anyController||card.ctrl===player)&&genericResolutionTargetSpec(ctx,effect.filter,[],0).filter(ctx.g,card,player,ctx.src)&&(effect.operation!=='sacrifice'||ctx.g.canSacrifice(card)));
        const count=Math.min(n,candidates.length);if(!count)continue;
        const minimum=effect.upTo?0:count;
        const picked=await player.controller.decide(ctx.g,{type:'chooseCards',from:candidates,min:minimum,max:count,prompt:'Choose permanents to '+effect.operation,aiHint:{kind:['tap','untap'].includes(effect.operation)?'oraclePermanentChoice':effect.operation==='sacrifice'?'sacCost':'bounceCost',operation:effect.operation,src:ctx.src}});
        if(!Array.isArray(picked)||picked.length<minimum||picked.length>count||new Set(picked).size!==picked.length||picked.some(card=>!candidates.includes(card)))throw new Error('Invalid permanent choice');
        groups.push({player,cards:picked});
      }
      if(['tap','untap'].includes(effect.operation)){
        const changed=[];
        for(const card of groups.flatMap(group=>group.cards)){
          if(effect.operation==='untap'){if(ctx.g.untap(card,{deferEvent:true}))changed.push({card,player:card.ctrl});}
          else {const firstThisTurn=card.meta._firstTappedTurn!==ctx.g.turnNo;if(ctx.g.tap(card,{deferEvent:true}))changed.push({card,player:card.ctrl,firstThisTurn});}
        }
        ctx.g.recalc();for(const data of changed)await ctx.g.emit(effect.operation==='untap'?'becameUntapped':'becameTapped',data);
        return;
      }
      const previous=ctx.g._simultaneousLeaveSources,history=groups.flatMap(group=>group.cards.map(card=>({card,ctrl:card.ctrl,snap:ctx.g.snapshot(card)})));
      ctx.g._simultaneousLeaveSources=previous?previous.concat(history):history;
      try{for(const group of groups)if(effect.operation==='sacrifice')await ctx.g.sacrificeMany(group.player,group.cards);else await ctx.g.bounceMany(group.cards);}
      finally{ctx.g._simultaneousLeaveSources=previous;await ctx.g.returnOracleExiles();}
      return;
    }
    if(effect.action==='copy-token'){
      const copies=effect.target==='self'?[(sameBattlefieldSource(ctx)?ctx.src:{def:ctx.oracleSourceCapture?.copiableDef||ctx.data?.snap?.def||ctx.src?.battlefieldLKI?.get(ctx.sourceZoneVersion)?.def})]:subjects;
      const made=[];
      for(const card of copies)if(card.def)made.push(...await ctx.g.copyPermanentToken(card,ctx.you,{n,nonlegendary:!!effect.nonlegendary,modPT:effect.modPT,copyKeywords:effect.copyKeywords,entryMeta:effect.haste?{oracleHaste:true}:undefined}));
      if(effect.delayed&&made.length){
        const captured=made.map(card=>({card,version:card.zoneVersion}));
        ctx.g.delayed.push({on:'endStep',src:ctx.src,ctrl:ctx.you,name:'Created token — '+effect.delayed,
          run:async delayedCtx=>{const cards=captured.filter(({card,version})=>card.zone==='battlefield'&&card.zoneVersion===version).map(row=>row.card);if(effect.delayed==='sacrifice')await delayedCtx.g.sacrificeMany(delayedCtx.you,cards.filter(card=>card.ctrl===delayedCtx.you));else await delayedCtx.g.exileMany(cards);}});
      }
      return;
    }
    if(effect.action==='face-down'){
      if(effect.kind==='manifest-dread'){for(let i=0;i<n;i++)await ctx.g.manifestDread(ctx.you);}
      else await ctx.g.withBattlefieldEntryBatch(async()=>{for(let i=0;i<n;i++)await (effect.kind==='cloak'?ctx.g.cloakTop(ctx.you):ctx.g.manifestTop(ctx.you));});
      return;
    }
    if(effect.action==='bolster'){
      const creatures=ctx.g.creatures(ctx.you),minimum=Math.min(...creatures.map(card=>card.toughness)),from=creatures.filter(card=>card.toughness===minimum);
      if(!from.length)return;
      const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt:'Bolster: choose a creature with the least toughness',aiHint:{kind:'counterTarget'}});
      if(!Array.isArray(picked)||picked.length!==1||!from.includes(picked[0]))throw new Error('Invalid mandatory bolster choice');
      ctx.g.addCounters(picked[0],'+1/+1',n,false,ctx.you);return;
    }
    if(effect.action==='populate'){
      for(let i=0;i<n;i++){
        const from=ctx.g.creatures(ctx.you).filter(card=>card.isToken);if(!from.length)break;
        const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt:'Populate: choose a creature token',aiHint:{kind:'copyToken'}});
        if(!Array.isArray(picked)||picked.length!==1||!from.includes(picked[0]))throw new Error('Invalid mandatory populate choice');
        await ctx.g.copyPermanentToken(picked[0],ctx.you);
      }return;
    }
    if (effect.action === 'shuffle-library') {
      MTG.shuffle(ctx.you.library, ctx.g.rnd);
      return;
    }
    if (effect.action === 'add-mana') {
      const beforePool = {...ctx.you.pool};
      const multiplier=effect.multiplier?genericAmount(effect.multiplier,ctx):1;
      let produce=effect.produce;
      if(effect.choices){const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose mana',options:effect.choices.map((option,index)=>({key:String(index),label:Object.entries(option).map(([color,n])=>'{'+color+'}'.repeat(n)).join('')})),aiHint:{kind:'manaColor'}});produce=effect.choices[Number(answer)]||effect.choices[0];}
      if(produce.ANY){for(let i=0;i<(produce.n||1)*multiplier;i++){const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a mana color',options:COLORS.map(color=>({key:color,label:'{'+color+'}'})),aiHint:{kind:'manaColor'}});ctx.you.pool[COLORS.includes(answer)?answer:COLORS[0]]++;}}
      else for (const [color, amount] of Object.entries(produce)) if([...COLORS,'C'].includes(color))ctx.you.pool[color] += amount*multiplier;
      if (effect.restriction) {
        const descriptor = compileGenericMana({produce: [{}], restriction: effect.restriction});
        const source = Object.assign(Object.create(ctx.src || null), {ctrl: ctx.you});
        ctx.you.poolMeta ||= [];
        for (const color of [...COLORS, 'C']) {
          const n = (ctx.you.pool[color] || 0) - (beforePool[color] || 0);
          if (n > 0) ctx.you.poolMeta.push({color, n, source, restrict: descriptor.restrict, restrictAbilities: descriptor.restrictAbilities});
        }
      }
      ctx.g.note('mana', {p: ctx.you});
      return;
    }
    if (effect.action === 'remove-counter') {
      for (const subject of subjects) if (subject.zone === 'battlefield') {
        ctx.g.removeCounters(subject, effect.counter, n);
      }
      ctx.g.recalc();
      return;
    }
    if (effect.action === 'battlefield-group') {
      const filters=effect.filters.map(target=>genericResolutionTargetSpec(ctx,target,[],0,ctx.data).filter);
      const scopedPlayers=typeof effect.target==='number'?genericEffectSubjects(ctx,effect.target).filter(player=>player instanceof MTG.Player):null;
      const affected=ctx.g.bf().filter(card=>(!scopedPlayers||scopedPlayers.includes(card.ctrl))&&filters.some(filter=>filter(ctx.g,card,ctx.you,ctx.src)));
      if(effect.operation==='destroy')ctx._oracleDestroyedCount=await ctx.g.destroyMany(affected,{source:ctx.src,noRegen:!!effect.noRegen});
      else if(effect.operation==='exile')await ctx.g.exileMany(affected);
      else if(effect.operation==='bounce')await ctx.g.bounceMany(affected);
      else if(effect.operation==='tap')for(const card of affected)ctx.g.tap(card);
      else if(effect.operation==='untap')for(const card of affected)ctx.g.untap(card);
      else if(effect.operation==='regenerate')for(const card of affected)card.regenShield=(card.regenShield||0)+1;
      else if(effect.operation==='pump'){
        // Count once as the effect resolves. Applying the first bonus can
        // change a power-based count, but must not change later recipients.
        const multiplier=effect.multiplier?genericAmount(effect.multiplier,ctx):1;
        const power=(typeof effect.power==='object'?genericAmount(effect.power,ctx):Number(effect.power||0))*multiplier;
        const toughness=(typeof effect.toughness==='object'?genericAmount(effect.toughness,ctx):Number(effect.toughness||0))*multiplier;
        for(const card of affected)MTG.E.pumpUntilEOT(ctx.g,card,power,toughness,effect.keywords||[]);
      }
      else if(effect.operation==='counter')for(const card of affected)ctx.g.addCounters(card,effect.counter,n,false,ctx.you);
      else if(effect.operation==='damage') {
        const recipients=[],source=oracleDamageSource(ctx);
        ctx._oracleDamageDealt=await ctx.g.damageBatch([...new Set([...affected,...(effect.players?ctx.g.alivePlayers():[])])].map(target=>({src:source,target,n})),{deferSBA:true,...(effect.exileDamagedThisTurn?{_oracleDamageRecipients:recipients}:{})});
        if(recipients.length)ctx.g.untilEffects.push({kind:'oracleDeathExile',expires:'eot',locked:recipients});
      }else throw new Error('Unknown Oracle group operation: '+effect.operation);
      return;
    }
    if(effect.action==='fight') {
      const a=subjects[0], b=genericEffectSubjects(ctx,effect.otherTarget)[0];
      if(!a?.is('Creature')||a.zone!=='battlefield'||!b?.is('Creature')||b.zone!=='battlefield')return;
      const powerA=Math.max(0,a.power),powerB=Math.max(0,b.power);
      ctx._oracleDamageDealt=await ctx.g.damageBatch([{src:a,target:b,n:powerA},{src:b,target:a,n:powerB}],{deferSBA:true});
      return;
    }
    if(effect.action==='bite') {
      const source=subjects[0],recipient=genericEffectSubjects(ctx,effect.otherTarget)[0];
      if(!source?.is('Creature')||source.zone!=='battlefield'||!recipient)return;
      const amount=Math.max(0,source[effect.stat])*(effect.multiplier||1);
      await ctx.g.damageAny(source,recipient,amount,{deferSBA:true});
      return;
    }
    if(effect.action==='move-to-library') {
      const died=effect.target==='self'&&ctx.oracleSourceCapture?.zone==='graveyard'&&ctx.data?.card===ctx.src&&ctx.data.snap&&ctx.src.zone==='graveyard'&&ctx.src.zoneVersion===ctx.sourceZoneVersion;
      const movedSubjects=died?[ctx.src]:subjects;
      for(const card of movedSubjects)await ctx.g.move(card,'library',{toBottom:!!effect.bottom});
      if(effect.ownerOrders)for(const owner of ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you)){
        const moved=movedSubjects.filter(card=>card.owner===owner&&card.zone==='library');
        if(moved.length>1)await genericOrder({...ctx,you:owner},moved,effect.bottom?'bottom':'top');
      }
      return;
    }
    if(effect.action==='counter-spell') {
      for(const object of subjects)if(ctx.g.stack.includes(object)&&(object.kind!=='spell'||!MTG.isUncounterable(ctx.g,object))){
        const payment=effect.unlessGeneric!==undefined?'{'+genericAmount(effect.unlessGeneric,ctx)+'}':effect.unlessPay;
        if(payment){const player=object.ctrl;const choice=await player.controller.decide(ctx.g,{type:'chooseOption',prompt:'Pay '+payment+' to prevent counter?',options:[{key:'no',label:'Do not pay'},{key:'yes',label:'Pay '+payment}],aiHint:{kind:'pay',cost:payment}});if(choice==='yes'&&await ctx.g.payMana(player,MTG.parseCost(payment),{card:object.card}))continue;}
        await ctx.g.counterStackObject(object,{source:ctx.src,toZone:effect.toZone||'graveyard'});
      }
      return;
    }

    if(effect.action==='conditional') {
      const eventSubject=effect.conditionTarget==='event-card';
      const subject=effect.conditionTarget===undefined?ctx.src:eventSubject?(ctx.oracleSourceCapture?.eventCard||ctx.data?.card):genericEffectSubjects(ctx,effect.conditionTarget)[0];
      const evidence=effect.conditionTarget===undefined?(ctx.oracleSourceCapture||(ctx.so?.kind==='spell'?{zoneVersion:ctx.src.zoneVersion,stats:{power:ctx.src.power,toughness:ctx.src.toughness,mv:ctx.g.stackSpellManaValue(ctx.so)},castFrom:ctx.so.from,castX:ctx.so.x,wasCast:!ctx.so.isCopy,castPhase:ctx.so.isCopy?null:ctx.src.castMeta?.castPhase,manaSpent:ctx.so.isCopy?0:ctx.so.manaSpent,paymentColorCounts:ctx.so.isCopy?{}:ctx.so.paymentColorCounts,kicked:ctx.so.kicked}:undefined)):eventSubject?{zoneVersion:ctx.eventCardZoneVersion}:undefined;
      const passed=!!subject&&genericCondition(ctx.g,subject,effect.condition,ctx.you,evidence);
      await runGenericEffects(ctx,passed?effect.effects:effect.elseEffects||[]);
      return;
    }
    if(effect.action==='optional-payment') {
      const cost=effect.payment;
      if(cost.sacSelf && (!sameBattlefieldSource(ctx)||ctx.src.ctrl!==ctx.you)) return;
      if(cost.life && ctx.you.life<cost.life || cost.discard && !ctx.you.hand.length) return;
      if(cost.mana && !ctx.g.canPayMana(ctx.you,MTG.parseCost(cost.mana))) return;
      const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Pay the optional cost?',
        options:[{key:'yes',label:'Pay'},{key:'no',label:'Decline'}],aiHint:{kind:'optTrigger',src:ctx.src}});
      if(answer!=='yes') return;
      if(cost.mana && !await ctx.g.payMana(ctx.you,MTG.parseCost(cost.mana))) return;
      if(cost.life) await ctx.g.loseLife(ctx.you,cost.life,'Optional cost');
      if(cost.sacSelf) await ctx.g.sacrifice(ctx.you,ctx.src);
      if(cost.discard) {
        const cards=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:ctx.you.hand,min:1,max:1,prompt:'Discard a card',aiHint:{kind:'addlDiscard'}});
        if(!Array.isArray(cards)||cards.length!==1||!ctx.you.hand.includes(cards[0])) return;
        await ctx.g.discard(ctx.you,cards);
      }
      await runGenericEffects(ctx,effect.effects);
      return;
    }
    if(effect.action==='impulse') {
      const cards=ctx.you.library.slice(-n).reverse();
      for(const card of cards) {
        await ctx.g.move(card,'exile');if(card.zone!=='exile')continue;
        card.meta.playableBy=ctx.you;card.meta.spellsOnly=!!effect.spellsOnly;
        if(effect.nextOwnTurn)card.meta.playableUntilOwnTurn=ctx.you.turnsStarted+1;
        else card.meta.playableUntil=ctx.g.turnNo;
      }return;
    }
    if(effect.action==='reveal-hand'||effect.action==='reveal-random-card') {
      for(const player of genericEffectSubjects(ctx,effect.who)){
        if(!player||!Array.isArray(player.hand))continue;
        const cards=effect.action==='reveal-random-card'
          ? (player.hand.length?[player.hand[Math.floor(ctx.g.rnd()*player.hand.length)]]:[])
          : player.hand.slice();
        if(!cards.length){ctx.g.lg(`${player.name} has no cards in hand.`);continue;}
        await ctx.g.revealToHuman({cards,ctrl:player,kind:effect.look?'look':'reveal'});
        ctx.g.lg(effect.action==='reveal-random-card'
          ? `${player.name} reveals ${cards[0].name} at random from their hand.`
          : effect.look?`${ctx.you.name} looks at ${player.name}'s hand (${cards.length}).`
            :`${player.name} reveals their hand (${cards.length}).`,'reveal');
      }return;
    }
    if(effect.action==='reveal-hand-discard') {
      for(const player of subjects) {
        await ctx.g.revealToHuman({cards:player.hand.slice(),ctrl:player,kind:'reveal'});
        const candidates=player.hand.filter(card=>effect.filter?genericResolutionTargetSpec(ctx,effect.filter,[],0).filter(ctx.g,card,player,ctx.src):effect.what==='nonland'?!card.is('Land'):effect.what==='noncreature'?!card.is('Creature'):effect.what.includes(',')?!card.is('Creature')&&!card.is('Land'):genericSearchMatches(card,effect.what));
        if(!candidates.length)continue;
        const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:candidates,min:1,max:1,prompt:'Choose the revealed card to discard',aiHint:{kind:'bestCard'}});
        if(Array.isArray(picked)&&picked.length===1&&candidates.includes(picked[0])){
          if(!effect.destination||effect.destination==='graveyard')await ctx.g.discard(player,picked);
          else {await ctx.g.move(picked[0],effect.destination);if(effect.destination==='library')MTG.shuffle(player.library,ctx.g.rnd);}
        }
      }return;
    }
    if(effect.action==='discard-hand-draw'){
      const discarded=[],players=ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you).filter(player=>effect.who==='each-player'||effect.who==='each-opponent'?effect.who==='each-player'||player!==ctx.you:player===who);
      for(const player of players){const before=player.turnState.discardedN||0;await ctx.g.discard(player,player.hand.slice());discarded.push({player,n:(player.turnState.discardedN||0)-before});}
      for(const row of discarded)await ctx.g.draw(row.player,effect.n==='discarded'?row.n:n,ctx.src);
      return;
    }
    if(effect.action==='blink') {
      const departing=subjects.filter(card=>card.zone==='battlefield').map(card=>({iid:card.iid,version:card.zoneVersion+1,owner:card.owner.idx}));
      await ctx.g.exileMany(subjects,{noCmdReplace:!effect.delayed});
      const captured=departing.filter(row=>{const card=ctx.g.byIid(row.iid);return card?.zone==='exile'&&card.zoneVersion===row.version&&!card.isToken;});
      if(!captured.length)return;
      // Resolve through the current game, including AI simulation clones.
      // All permanents leave together, then all surviving cards enter together.
      const restore=async next=>next.g.withBattlefieldEntryBatch(async()=>{
        for(const row of captured){const card=next.g.byIid(row.iid);if(card?.zone==='exile'&&card.zoneVersion===row.version)await next.g.putPermanentOntoBattlefield(card,effect.controller==='you'?next.you:next.g.players[row.owner],{tapped:!!effect.tapped,additionalCounters:effect.additionalCounters});}
      });
      if(effect.delayed)ctx.g.delayed.push({on:'endStep',once:true,ctrl:ctx.you,src:ctx.src,name:'Return exiled card',run:restore});
      else await restore(ctx);
      return;
    }
    if(effect.action==='order-top' || effect.action==='look-select') {
      const top=n>0?ctx.you.library.slice(-n).reverse():[];
      if(effect.action==='order-top') {await genericOrder(ctx,top,'top');return;}
      if(effect.revealAll) await ctx.g.revealToHuman({cards:top,ctrl:ctx.you,kind:'reveal'});
      const candidates=top.filter(card=>genericSearchMatches(card,effect.what)&&(!effect.filter||genericResolutionTargetSpec(ctx,effect.filter,[],0).filter(ctx.g,card,ctx.you,ctx.src)));
      const max=effect.max==='all'?candidates.length:effect.max||1;
      const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:candidates,min:effect.required?Math.min(max,candidates.length):0,max,prompt:'Choose a card from the top of your library',aiHint:{kind:'bestCard'}});
      const selected=Array.isArray(picked)?[...new Set(picked)].filter(card=>candidates.includes(card)).slice(0,max):[];
      if(effect.reveal && selected.length) await ctx.g.revealToHuman({cards:selected,ctrl:ctx.you,kind:'reveal'});
      if(effect.destination==='battlefield')await ctx.g.withBattlefieldEntryBatch(async()=>{for(const card of selected)await ctx.g.putPermanentOntoBattlefield(card,ctx.you,{tapped:!!effect.tapped});});else for(const card of selected) await ctx.g.move(card,'hand');
      const rest=top.filter(card=>ctx.you.library.includes(card));
      if(effect.rest==='graveyard')await ctx.g.withGraveyardEntryBatch(async()=>{for(const card of rest)await ctx.g.move(card,'graveyard');});
      else if(effect.rest==='hand')for(const card of rest)await ctx.g.move(card,'hand');
      else await genericOrder(ctx,rest,'bottom',effect.random);
      return;
    }
    if(effect.action==='amass') {await MTG.E.amass(ctx.g,ctx.you,n,effect.subtype);return;}
    if(effect.action==='ring-tempts') {await MTG.E7.ringTempts(ctx.g,ctx.you);return;}
    if(effect.action==='learn') {
      if(!ctx.you.hand.length) return;
      const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Learn: discard a card to draw a card?',options:[{key:'yes',label:'Discard and draw'},{key:'no',label:'Decline'}],aiHint:{kind:'optTrigger',src:ctx.src}});
      if(answer!=='yes') return;
      const chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:ctx.you.hand,min:1,max:1,prompt:'Learn: discard a card',aiHint:{kind:'addlDiscard'}});
      if(!Array.isArray(chosen)||chosen.length!==1||!ctx.you.hand.includes(chosen[0])) return;
      await ctx.g.discard(ctx.you,chosen);await ctx.g.draw(ctx.you,1,ctx.src);return;
    }

    if (effect.action === 'draw') {
      if (who) await ctx.g.draw(who, n, ctx.src);
      return;
    }
    if (effect.action === 'gain-life') {
      if (who) await ctx.g.gainLife(who, n, ctx.src);
      return;
    }
    if (effect.action === 'lose-life') {
      ctx._oracleLifeLost=0;
      if (effect.who === 'each-opponent') ctx._oracleLifeLost=await ctx.g.loseLifeOpponents(ctx.src, ctx.you, n, 'Oracle effect');
      else if (effect.who === 'each-player') {
        for (const player of ctx.g.alivePlayers().slice()) ctx._oracleLifeLost+=await ctx.g.loseLife(player, n, 'Oracle effect');
      }
      else if (who) ctx._oracleLifeLost=await ctx.g.loseLife(who, n, 'Oracle effect');
      return;
    }
    if (effect.action === 'divided-damage-v8') {
      const source = oracleDamageSource(ctx, effect.source);
      const slot = (ctx.oracleTargetOffset || 0) + effect.target;
      const division = (ctx.so || ctx).damageDivision || [];
      const hits = subjects.flatMap(target => {
        const assignment = division.find(row => row.targetSlot === slot &&
          (target instanceof MTG.Player ? row.playerIdx === target.idx : row.iid === target.iid));
        return assignment ? [{src:source,target,n:assignment.n}] : [];
      });
      ctx._oracleDamageDealt = await ctx.g.damageBatch(hits, {deferSBA:true});
      return;
    }
    if (effect.action === 'damage') {
      const source=oracleDamageSource(ctx,effect.source);
      if (effect.target === 'each-opponent')ctx._oracleDamageDealt=await ctx.g.damageOpponents(source,ctx.you,n,{deferSBA:true});
      else {
        const recipients=[];
        ctx._oracleDamageDealt=await ctx.g.damageBatch(subjects.map(target=>({src:source,target,n})),{deferSBA:true,...(effect.exileDamagedThisTurn?{_oracleDamageRecipients:recipients}:{})});
        if(recipients.length)ctx.g.untilEffects.push({kind:'oracleDeathExile',expires:'eot',locked:recipients});
      }
      return;
    }
    if (effect.action === 'pump') {
      const multiplier = effect.multiplier ? genericAmount(effect.multiplier, ctx) : 1;
      for (const subject of subjects) if (subject.zone === 'battlefield') {
        MTG.E.pumpUntilEOT(ctx.g, subject, (typeof effect.power==='object'?genericAmount(effect.power,ctx):Number(effect.power||0))*multiplier, (typeof effect.toughness==='object'?genericAmount(effect.toughness,ctx):Number(effect.toughness||0))*multiplier, effect.keywords || []);
      }
      return;
    }
    if (effect.action === 'pump-group') {
      const allowed = new Set(['your-creatures', 'your-other-creatures', 'your-attacking-creatures', 'opponent-creatures', 'all-creatures', 'all-other-creatures']);
      if (!allowed.has(effect.who)) throw new Error('Unknown generic Oracle pump group: ' + effect.who);
      MTG.E.pumpAllUntilEOT(ctx.g, (game, card) =>
        (effect.who.startsWith('all-') || (effect.who === 'opponent-creatures' ? card.ctrl !== ctx.you : card.ctrl === ctx.you)) &&
        (!['your-other-creatures','all-other-creatures'].includes(effect.who) || card !== ctx.src || card.zoneVersion !== ctx.sourceZoneVersion) &&
        (effect.who !== 'your-attacking-creatures' || !!card.attacking),
        Number(effect.power || 0), Number(effect.toughness || 0), effect.keywords || []);
      return;
    }
    if (effect.action === 'counter') {
      for (const subject of subjects) if (subject.zone === 'battlefield') {
        if (effect.counter === '-1/-1') await ctx.g.addM1(subject, n, ctx.you, true);
        else ctx.g.addCounters(subject, effect.counter, n, false, ctx.you);
      }
      return;
    }
    if (effect.action === 'counter-group') {
      const allowed = new Set(['your-creatures', 'your-other-creatures']);
      if (!allowed.has(effect.who)) throw new Error('Unknown generic Oracle counter group: ' + effect.who);
      const affected = ctx.g.creatures(ctx.you).filter(card =>
        effect.who !== 'your-other-creatures' || card !== ctx.src || card.zoneVersion !== ctx.sourceZoneVersion);
      for (const subject of affected) {
        if (effect.counter === '-1/-1') await ctx.g.addM1(subject, n, ctx.you, true);
        else ctx.g.addCounters(subject, effect.counter, n, false, ctx.you);
      }
      return;
    }
    if (effect.action === 'destroy') {
      ctx._oracleDestroyedCount=await ctx.g.destroyMany(subjects,{source:ctx.src,noRegen:!!effect.noRegen});
      return;
    }
    if (effect.action === 'exile') {
      for (const subject of subjects) await ctx.g.exileCard(subject);
      return;
    }
    if (effect.action === 'bounce' || effect.action === 'move-to-hand') {
      for (const subject of subjects) {
        if(subject.kind==='spell'){
          const index=ctx.g.stack.indexOf(subject);if(index<0)continue;
          ctx.g.stack.splice(index,1);
          if(!subject.isCopy&&subject.card?.zone==='stack')await ctx.g.move(subject.card,'hand');
          ctx.g.note('stack',{});
        }else await ctx.g.move(subject, 'hand');
      }
      return;
    }
    if (effect.action === 'reanimate') {
      for (const subject of subjects) if (subject.zone === 'graveyard') await ctx.g.putPermanentOntoBattlefield(subject, effect.controller === 'you' ? ctx.you : subject.owner, {
        tapped: !!effect.tapped,
      });
      return;
    }
    if (effect.action === 'regenerate') {
      for (const subject of subjects) if (subject.zone === 'battlefield') subject.regenShield += 1;
      return;
    }
    if (effect.action === 'unblockable-until-eot') {
      for (const subject of subjects) if (subject.zone === 'battlefield') {
        const version = subject.zoneVersion;
        ctx.g.untilEffects.push({ expires: 'eot', apply: (game) => {
          if (subject.zone === 'battlefield' && subject.zoneVersion === version) subject.cur.unblockable = true;
        }});
      }
      ctx.g.recalc();
      return;
    }
    if (effect.action === 'attach-source') {
      if (sameBattlefieldSource(ctx)) for (const subject of subjects) await ctx.g.attach(ctx.src, subject);
      return;
    }
    if (effect.action === 'prevent-next') {
      for (const subject of subjects) ctx.g.untilEffects.push({
        kind: 'oraclePreventNextAmount', target: subject, zoneVersion: subject.zoneVersion, remaining: n, expires: 'eot',
        ...(effect.combat ? {combat:true} : {}), ...(effect.direction==='by' ? {direction:'by'} : {}),
      });
      return;
    }
    if (effect.action === 'draw-next-upkeep') {
      const turn = ctx.g.turnNo;
      ctx.g.delayed.push({on:'upkeep',ctrl:ctx.you,src:ctx.src,once:true,name:'Draw a card',
        filter: game => game.turnNo > turn, run: async delayed => { await delayed.g.draw(delayed.you,n); }});
      return;
    }
    if (effect.action === 'search-library') {
      const type = effect.what.toLowerCase();
      const candidates=ctx.you.library.filter(card => {
        if(effect.name&&card.name!==effect.name)return false;
        if(effect.filter&&!genericResolutionTargetSpec(ctx,effect.filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))return false;
        if (effect.maxMv !== null && card.mv > effect.maxMv) return false;
        if (type === 'basic land') return card.is('Land') && (card.def.super || []).includes('Basic');
        return genericSearchMatches(card,effect.what);
      });
      // CR 701.23d: a structural card selector adds no stated quality.
      // Searching simply for a quantity of cards cannot fail to find.
      const unqualifiedFilter=!effect.filter||effect.filter.what==='card'&&Object.keys(effect.filter).every(key=>['what','zone','controller','min','max'].includes(key));
      const mandatory=type==='card'&&!effect.name&&effect.maxMv==null&&unqualifiedFilter;
      const picked=await ctx.you.controller.decide(ctx.g, {type:'chooseCards',from:candidates,min:mandatory?Math.min(n,candidates.length):0,max:n,
        search:true,prompt:'Search your library',aiHint:{kind:type.includes('land')?'searchBasic':'recur'}});
      const selected=Array.isArray(picked) ? [...new Set(picked)].filter(card=>candidates.includes(card)).slice(0,n):[];
      if(effect.reveal && selected.length) await ctx.g.revealToHuman({cards:selected,ctrl:ctx.you,kind:'reveal'});
      for(const card of selected) if(effect.destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(card,ctx.you,{tapped:!!effect.tapped});else if(effect.destination==='library-top')ctx.you.library.splice(ctx.you.library.indexOf(card),1);else await ctx.g.move(card,effect.destination);
      MTG.shuffle(ctx.you.library,ctx.g.rnd);
      if(effect.destination==='library-top')ctx.you.library.push(...selected);
      return;
    }
    if (effect.action === 'return-source-to-hand') {
      if (ctx.src && (ctx.src.zone === 'stack'&&ctx.so?.card===ctx.src&&!ctx.so.isCopy||
          ['battlefield','graveyard'].includes(ctx.src.zone)&&ctx.src.zoneVersion === ctx.sourceZoneVersion)) {
        await ctx.g.move(ctx.src, 'hand');
      }
      return;
    }
    if (effect.action === 'sacrifice-source') {
      if (sameBattlefieldSource(ctx) && ctx.src.ctrl === ctx.you) await ctx.g.sacrifice(ctx.you, ctx.src);
      return;
    }
    if (effect.action === 'tap' || effect.action === 'untap') {
      for (const subject of subjects) {
        if (effect.action === 'tap') ctx.g.tap(subject);
        else ctx.g.untap(subject);
      }
      return;
    }
    if(effect.action==='skip-next-untap') {for(const subject of subjects) if(subject.zone==='battlefield') subject.meta.noUntapOnce=true;return;}
    if(effect.action==='put-from-hand') {
      const candidates=ctx.you.hand.filter(card=>genericSearchMatches(card,effect.what));
      const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:candidates,min:Math.min(n,candidates.length),max:n,prompt:'Put a card from your hand onto the battlefield',aiHint:{kind:'bestCard'}});
      const selected=Array.isArray(picked)?[...new Set(picked)].filter(card=>candidates.includes(card)).slice(0,n):[];
      for(const card of selected)await ctx.g.putPermanentOntoBattlefield(card,ctx.you,{tapped:!!effect.tapped});return;
    }
    if (effect.action === 'mill') {
      if (who) await ctx.g.mill(who, n);
      return;
    }
    if (effect.action === 'scry') {
      if (who) await MTG.E.scry(ctx.g, who, n);
      return;
    }
    if (effect.action === 'surveil') {
      if (who) await MTG.E.surveil(ctx.g, who, n);
      return;
    }
    if (effect.action === 'investigate') {
      if (!MTG.E || typeof MTG.E.investigate !== 'function') {
        throw new Error('Generic Oracle investigate needs the investigate runtime helper.');
      }
      if (who) await MTG.E.investigate(ctx.g, who, n);
      return;
    }
    if (effect.action === 'proliferate') {
      if (!MTG.E || typeof MTG.E.proliferate !== 'function') {
        throw new Error('Generic Oracle proliferate needs the proliferate runtime helper.');
      }
      if (who) await MTG.E.proliferate(ctx.g, who);
      return;
    }
    if (effect.action === 'monarch') {
      if (who) await ctx.g.becomeMonarch(who, { source: ctx.src, reason: 'Oracle effect' });
      return;
    }
    if (effect.action === 'token-key' || effect.action === 'token-inline') {
      const spec = effect.action === 'token-key' ? effect.tokenKey : genericInlineToken({...effect.token,
        power:effect.token.power==='X'||typeof effect.token.power==='object'?genericAmount(effect.token.power,ctx):effect.token.power,
        toughness:effect.token.toughness==='X'||typeof effect.token.toughness==='object'?genericAmount(effect.token.toughness,ctx):effect.token.toughness});
      const made = who ? await ctx.g.makeTokens(spec, who, { n, tapped: !!effect.tapped,
        ...(effect.attacking?{chooseAttacking:(game,token)=>game.combat&&who===game.turnPlayer&&token.is('Creature')?game.chooseAttackingDestination(who,null,token,ctx.src.name):null}:{}),
      }) : [];
      ctx._oracleCreatedTokens = made.map(card => ({ card, zoneVersion: card.zoneVersion }));
      return;
    }
    if (effect.action === 'connive') {
      for (const subject of subjects) if (subject.zone === 'battlefield') await ctx.g.connive(subject);
      return;
    }
    if (effect.action === 'explore') {
      const explorers=(effect.target==='self'?[ctx.src]:subjects).filter(Boolean).map(card=>({card,version:effect.target==='self'?ctx.sourceZoneVersion??card.zoneVersion:card.zoneVersion}));
      for(const entry of explorers)for(let i=0;i<(effect.n===undefined?1:n);i++)await genericExplore(ctx,entry.card,entry.version);
      return;
    }
    if (effect.action === 'remove-counters-v8')return {goal:['-1/-1','stun'].includes(effect.counter)?'buff':'debuff'};
    if (effect.action === 'cant-block-until-eot') {
      for (const subject of subjects) if (subject.zone === 'battlefield') {
        const iid = subject.iid;
        const timestamp = subject.timestamp;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'oracleCantBlock',
          apply: (game, battlefield) => {
            const current = battlefield.find(card => card.iid === iid && card.timestamp === timestamp);
            if (current) current.cur.cantBlock = true;
          },
        });
      }
      ctx.g.recalc();
      return;
    }
    if (effect.action === 'discard') {
      if (who) await genericDiscard(ctx, who, n, effect.random === true);
      return;
    }
    if (effect.action === 'discard-damaged-player') {
      await genericDiscard(ctx, ctx.data && ctx.data.player, n);
      return;
    }
    if (effect.action === 'discard-each-opponent') {
      const opponents = ctx.g.alivePlayers().filter(player => player !== ctx.you);
      await ctx.g.withGraveyardEntryBatch(async () => {
        for (const player of opponents) await genericDiscard(ctx, player, n);
      });
      return;
    }
    throw new Error('Unknown generic Oracle effect: ' + effect.action);
  }

  function oracleDamageSource(ctx,reference){
    const source=reference==='event-card'?(ctx.oracleSourceCapture?.eventCard||ctx.data?.card):ctx.src;
    if(!source)return null;
    const version=reference==='event-card'?ctx.eventCardZoneVersion:ctx.sourceZoneVersion;
    const snap=ctx.data?.card===source&&ctx.data.snap?ctx.data.snap:source.zoneVersion!==version?source.battlefieldLKI?.get(version):null;
    if(!snap)return source;
    return Object.defineProperties(Object.create(source),{
      ctrl:{value:snap.ctrl},def:{value:snap.def||source.def},name:{value:snap.name||source.name},mv:{value:snap.mv},colors:{value:snap.colors},power:{value:snap.power},toughness:{value:snap.toughness},zoneVersion:{value:snap.zoneVersion},
      counters:{value:{...snap.counters}},isToken:{value:!!snap.isToken},tapped:{value:!!snap.tapped},zone:{value:'battlefield'},
      _oracleDamageSnapshot:{value:snap},
      kw:{value:keyword=>snap.kw.includes(keyword)},is:{value:type=>snap.types.includes(type)},hasSub:{value:subtype=>snap.subtypes.includes(subtype)||(snap.changeling||snap.def?.changeling)&&!snap.abilitiesDisabled},
    });
  }
  async function runGenericEffects(ctx, effects) {
    const previous = ctx._oracleCreatedTokens;
    const previousControllers=ctx._oracleTargetControllers;
    const previousAttachedHost=ctx._oracleAttachedHost;
    if((effects||[]).some(effect=>effect.target==='attached-host-controller'))ctx._oracleAttachedHost=captureAttachedHost(ctx);
    if(!previousControllers)ctx._oracleTargetControllers=(ctx.targets||[]).map(selected=>[selected].flat().filter(Boolean).map(subject=>({subject,controller:subject.ctrl,zoneVersion:subject.zoneVersion,stats:{power:subject.power,toughness:subject.toughness,mv:subject.mv}})));
    ctx._oracleCreatedTokens = [];
    try {
      // makeTokens queues ETB events without applying SBA mid-resolution, so
      // a created 0/0 can receive its following counter before SBA is checked.
      for (const effect of effects || []) await runGenericEffect(ctx, effect);
    } finally {
      if (previous === undefined) delete ctx._oracleCreatedTokens;
      else ctx._oracleCreatedTokens = previous;
      if(!previousControllers)delete ctx._oracleTargetControllers;
      if(previousAttachedHost===undefined)delete ctx._oracleAttachedHost;
      else ctx._oracleAttachedHost=previousAttachedHost;
    }
  }

  const hasGenericDivision = effects => (effects || []).some(effect =>
    effect.action === 'divided-damage-v8' || hasGenericDivision(effect.effects) || hasGenericDivision(effect.elseEffects));
  async function prepareGenericDivisions(ctx, effects, offset = 0) {
    for (const effect of effects || []) {
      if (effect.action === 'conditional' && hasGenericDivision([effect])) {
        const captured = ctx.oracleSourceCapture || {kicked:!!ctx.so?.kicked};
        const branch = genericCondition(ctx.g, ctx.src, effect.condition, ctx.you, captured)
          ? effect.effects : effect.elseEffects;
        if (await prepareGenericDivisions(ctx, branch, offset) === false) return false;
      } else if (['optional-payment','resolution-cost'].includes(effect.action)) {
        if (await prepareGenericDivisions(ctx, effect.effects, offset) === false) return false;
      } else if (effect.action === 'divided-damage-v8') {
        const targets = [ctx.targets[effect.target]].flat().filter(Boolean);
        const total = genericAmount(effect.n, {...ctx,x:ctx.so?.x ?? ctx.x});
        const division = await MTG.E.divideDamage(ctx.g, ctx.you, ctx.src, targets, total);
        if (division === null) return false;
        const holder = ctx.so || ctx;
        holder.damageDivision = (holder.damageDivision || []).concat(division.map((row, targetOrdinal) =>
          ({...row,targetSlot:offset + effect.target,targetOrdinal})));
      }
    }
    return true;
  }

  function compileGenericTrigger(operation) {
    if(operation.eventFilter?.kind==='either'){
      const relevant=operation.eventFilter.clauses.filter(clause=>clause.event===operation.event);
      if(relevant.length===1)operation={...operation,eventFilter:relevant[0].eventFilter};
    }
    const v4Body = operation.v4Body && MTG.compileOracleSpellV4(operation.v4Body);
    const modalBody = operation.modalBody;
    if (modalBody && (modalBody.choose?.min !== 1 || modalBody.choose?.max !== 1 ||
        !Array.isArray(modalBody.modes) || modalBody.modes.length < 2 ||
        modalBody.modes.some(mode => !mode.body || mode.body.optional || !Array.isArray(mode.body.targets) ||
          !Array.isArray(mode.body.effects) || !mode.body.effects.length))) throw new Error('Unsupported Oracle trigger modes');
    const dynamicTargets = /"controller":"(?:defending-player|event-player)"|"event-card(?:-stat|-counters)?"|"threshold":"X"/.test(JSON.stringify(operation.targets||[]));
    // Cycling's optional effect is chosen when its trigger resolves, after
    // players have had the opportunity to respond to that Stack object.
    const targetedOptional = !!operation.optional && (operation.zone==='cycling-source' || operation.event==='state' || operation.event==='saga-chapter' || (operation.targets || []).length > 0 || operation.v4Body?.targets.length > 0);
    // CardInst is intentionally reused across zones. Remember the exact
    // incarnation while collectTriggers examines the event, rather than when
    // the pending trigger is later flushed onto the Stack. A hidden Symbol
    // preserves the capture through AI simulation clones without exposing it in
    // public event payloads; the Map separates copies of the same definition.
    const sourceCaptures = Symbol('oracleGenericTriggerCapture');
    const rememberSource = (game, source, data) => {
      const v8Bindings=MTG.OracleV8DamageEvents?.bindings(operation.eventFilter,game,source,data,{target:genericTargetSpec})||MTG.oracleV8TriggerBindings?.(operation.event,operation.eventFilter,game,source,data);
      const eventCard=v8Bindings?v8Bindings.eventCard:operation.eventFilter?.kind==='self-creature-combat'?(operation.event==='blocks'?data?.attacker:data?.blocker):operation.event==='blocks'?data?.blocker:data?.card;
      const simultaneous = (game._simultaneousLeaveSources || []).find(entry => entry.card === source);
      const attached=(data?.snap?.attachedSources||[]).find(entry=>entry.card===source);
      // A host leaving can put its Aura in the graveyard before this event is
      // collected. Capture the source incarnation that actually had the
      // trigger, not the now-empty counters of the reused graveyard object.
      // The source's own dies event still uses its post-move identity for
      // explicitly printed graveyard-return abilities.
      const history=data?.card!==source&&(simultaneous?.snap||attached?.snap);
      const controller = data && data.card === source && data.snap && data.snap.ctrl
        ? data.snap.ctrl
        : (simultaneous && simultaneous.ctrl) || attached?.ctrl || source.ctrl;
      const defendingObject=data?.defender||data?.attacker?.attacking||v8Bindings?.eventCard?.attacking||source.attacking||null;
      const capture = {
        defendingPlayer:defendingObject instanceof MTG.Player?defendingObject:defendingObject?.ctrl||null,
        iid: source instanceof MTG.CardInst ? source.iid : null,
        timestamp: source instanceof MTG.CardInst ? history?.timestamp??source.timestamp : null,
        zoneVersion: source instanceof MTG.CardInst ? history?.zoneVersion??source.zoneVersion : null,
        copyEpoch: history?history.copyEpoch||0:data?.card===source&&data.snap?data.snap.copyEpoch||0:source.copyEpoch||0,
        untapEpoch:source.meta?.oracleUntapEpoch||0,phaseEpoch:source.meta?.oraclePhaseEpoch||0,durationControlEpoch:source.meta?.oracleDurationControl?.epoch||0,
        copying: history?!!history.copying:data?.card===source&&data.snap?!!data.snap.copying:!!source.isCopyOf,
        zone: history?'battlefield':source.zone,
        controller,
        stats: Object.fromEntries(['power','toughness','mv'].map(stat=>[stat,history?history[stat]:data?.card===source&&data.snap?data.snap[stat]:source[stat]])),
        castFrom: source.castMeta?.from,
        wasCast:!!source.castMeta?.wasCast,
        castPhase:source.castMeta?.castPhase,manaSpent:source.castMeta?.manaSpent,paymentColorCounts:{...(source.castMeta?.paymentColorCounts||{})},
        castX: Number(operation.eventFilter?.kind==='qualified-cast-v8'&&operation.eventFilter.manaX?data?.so?.x:['turnedFaceUp','monstrous'].includes(operation.event)?data?.x:source.castMeta?.x) || 0,
        upgradeStatus: MTG.OracleV8CreatureUpgrades?.capture(source),
        kicked: !!source.castMeta?.kicked,
        paidTimes: Number(source.castMeta?.paidTimes)||0,
        copiableDef: source.isCopyOf||source.def,
        packTactics: operation.condition?.kind==='pack-tactics'?genericCondition(game,source,operation.condition,controller):undefined,
        defender: data?.defender || data?.attacker?.attacking || v8Bindings?.eventCard?.attacking || source.attacking || null,
        eventPlayer:v8Bindings?v8Bindings.eventPlayer:operation.eventFilter==='self-unblocked'?(source.attacking instanceof MTG.Player?source.attacking:source.attacking?.ctrl):data?.player,
        eventCard,
        eventRulesNames: MTG.OracleV8NameGroups.names(data?.so||eventCard),
        eventController: v8Bindings?v8Bindings.eventController:data?.snap?.ctrl||eventCard?.ctrl,
        eventCardZoneVersion:v8Bindings?.eventVersion??eventCard?.zoneVersion,
        eventAmount:v8Bindings?.eventAmount,eventSnap:v8Bindings?.eventSnap,
        boundEvent:operation.condition?.kind==='v8-event-condition'?MTG.oracleV8CaptureConditionEvent?.(game,source,operation.event,data):undefined,
      };
      if (data && (typeof data === 'object' || typeof data === 'function')) {
        let bySource = data[sourceCaptures];
        if (!bySource) {
          bySource = new Map();
          Object.defineProperty(data,sourceCaptures,{value:bySource});
        }
        bySource.set(source.iid, capture);
      }
      return capture;
    };
    const capturedSource = (source, data) => {
      const bySource = data && (typeof data === 'object' || typeof data === 'function')
        ? data[sourceCaptures]
        : null;
      return bySource && bySource.get(source.iid) || null;
    };
    const applyCapturedSource = ctx => {
      const capture = capturedSource(ctx.src, ctx.data);
      if (!capture) return;
      ctx.sourceIid = capture.iid;
      ctx.oracleSourceCapture = capture;
      ctx.sourceTimestamp = capture.timestamp;
      ctx.sourceZoneVersion = capture.zoneVersion;
      ctx.sourceCopyEpoch = capture.copyEpoch;
      ctx.sourceCopying = capture.copying;
      ctx.eventCardZoneVersion = capture.eventCardZoneVersion;
      if (['turnedFaceUp','monstrous'].includes(operation.event) || ['etb','cast'].includes(operation.event) && operation.eventFilter === 'self' || operation.eventFilter?.kind==='qualified-cast-v8'&&operation.eventFilter.manaX) ctx.x = capture.castX;
    };
    const baseFilter = genericTriggerFilter(operation.event, operation.eventFilter);
    const triggerTimes = MTG.oracleV8TriggerTimes?.(operation.event, operation.eventFilter, genericTargetSpec);
    const trigger = {
      on: operation.event,
      ...(triggerTimes ? {times: operation.onceEachTurn ? (...args) => Math.min(1, triggerTimes(...args)) : triggerTimes} : {}),
      ...(operation.zone ? {zone:operation.zone} : {}),
      desc: operation.desc || 'Oracle effect',
      // A printed "you may" changes what happens on resolution; it does not
      // make choosing targets optional while the ability is put on the Stack.
      // Keep untargeted legacy optionals on the engine's existing path.
      opt: !!operation.optional && !targetedOptional,
      oncePerTurn: !!operation.onceEachTurn,
      oncePerBatch:!!operation.oncePerBatch,
      onceKey: operation.onceGroup,
      filter: (game, source, data) => {
        if (baseFilter && !baseFilter(game, source, data)) return false;
        const capture=rememberSource(game,source,data);
        if (operation.condition && !genericCondition(game,source,operation.condition,capture.controller,capture)) return false;
        if (operation.opponentOnly && (!data || !data.player || data.player === source.ctrl)) return false;
        return true;
      },
      controller: (game, source, data) =>
        (capturedSource(source, data) || rememberSource(game, source, data)).controller,
      prepareTargets: async ctx => {
        applyCapturedSource(ctx);
        return prepareGenericDivisions(ctx, modalBody ? modalBody.modes[ctx.mode]?.body.effects : operation.effects);
      },
      run: async ctx => {
        applyCapturedSource(ctx);
        if (operation.condition && !genericCondition(ctx.g,ctx.src,operation.condition,ctx.you,capturedSource(ctx.src,ctx.data))) return;
        if (targetedOptional) {
          const yes = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseOption',
            prompt: `${ctx.src ? ctx.src.name : ''}: ${operation.desc || 'Oracle effect'} — use it?`,
            options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
            aiHint: { kind: 'optTrigger', src: ctx.src, name: operation.desc || 'Oracle effect' },
            data: ctx.data,
          });
          if (yes !== 'yes') return;
        }
        ctx.oracleOriginTrigger=trigger;
        if(modalBody) {
          if (!Number.isInteger(ctx.mode) || !modalBody.modes[ctx.mode]) return;
          await runGenericEffects(ctx, modalBody.modes[ctx.mode].body.effects);
        }
        else if(v4Body) await v4Body.resolve(v4Body.modes?Object.assign({},ctx,{mode:[ctx.mode]}):ctx);
        else await runGenericEffects(ctx, operation.effects);
      },
    };
    if ((operation.targets || []).length) {
      trigger.targets = dynamicTargets
        ? (game, source, data) => genericTargetSpecs(operation.targets, operation.effects, {...data,defender:capturedSource(source,data)?.defender,oracleEventPlayer:capturedSource(source,data)?.eventPlayer,oracleSourceCapture:capturedSource(source,data),oracleX:capturedSource(source,data)?.castX})
        : genericTargetSpecs(operation.targets, operation.effects);
    }
    if(v4Body?.targets) trigger.targets = (game,source,data) => v4Body.targets(game,source,{},(capturedSource(source,data)||{}).controller||source.ctrl);
    if(v4Body?.modes) trigger.modes={list:v4Body.modes.list.map(mode=>({...mode,targets:(game,source,data)=>mode.targets(game,source,{},(capturedSource(source,data)||{}).controller||source.ctrl)}))};
    if(modalBody) trigger.modes={list:modalBody.modes.map(mode=>({label:mode.label,
      targets:(game,source,data)=>{
        const capture=capturedSource(source,data)||rememberSource(game,source,data);
        return genericTargetSpecs(mode.body.targets,mode.body.effects,{...data,defender:capture.defender,
          oracleEventPlayer:capture.eventPlayer,oracleSourceCapture:capture,oracleX:capture.castX});
      },
    }))};
    return trigger;
  }

  function genericAbilityAiScore(operation, cost) {
    return (game, source, player) => {
      if(MTG.OracleV8VariableCounterCosts?.emptyOutcome(operation,source))return -100;
      const specs = genericTargetSpecs(operation.targets, operation.effects);
      for (const spec of specs) {
        const candidates = game.legalTargets(spec, source, player);
        const goal = spec.aiHint && spec.aiHint.goal;
        const useful = candidates.some(target => {
          if (cost.sacSelf && target === source) return false;
          const targetController = target instanceof MTG.Player ? target : target.ctrl || target.owner;
          const hostile = targetController && targetController !== player;
          if (goal === 'tap') return hostile && !target.tapped;
          if (goal === 'untap') return !hostile && !!target.tapped;
          if (goal === 'buff' || goal === 'recur' || goal === 'protect') return !hostile;
          if (goal === 'removal' || goal === 'damage' || goal === 'bounce' ||
              goal === 'debuff' || goal === 'discard') return hostile;
          return true;
        });
        if (!useful) return -8;
      }

      let score = 0;
      for (const effect of operation.effects || []) {
        const n = effect.n === 'X' ? 2 : Math.max(1, Number(effect.n) || 1);
        if (effect.action === 'draw') score += 2.5 * n;
        else if (effect.action === 'destroy' || effect.action === 'exile') score += 5;
        else if (effect.action === 'damage' || effect.action === 'lose-life') score += 1.4 * n;
        else if (effect.action === 'bounce' || effect.action === 'move-to-hand') score += 3.5;
        else if (effect.action === 'pump' || effect.action === 'counter') score += 2.2;
        else if (effect.action === 'tap' || effect.action === 'untap' || effect.action === 'cant-block-until-eot') score += 1.8;
        else if (effect.action === 'token-key' || effect.action === 'token-inline') score += 2 * n;
        else if (effect.action === 'gain-life') score += 0.45 * n;
        else if (effect.action === 'mill' || effect.action === 'scry' || effect.action === 'surveil') score += 0.5 * n;
        else if (effect.action === 'discard' && effect.who === 'you') score -= 1.5 * n;
        else score += 1;
      }
      if (cost.tap) score -= 0.4;
      if (cost.life) score -= Number(cost.life) * 0.25;
      if (cost.discard) score -= Number(cost.discard) * 1.5;
      if (cost.discardRandom) score -= Number(cost.discardRandom) * 1.5;
      if (cost.exertSelf) score -= 0.8;
      if (cost.sacSelf) score -= Math.max(2, Number(source.mv) || 0);
      if (cost.sacCreature || cost.sac) score -= 2;
      return score;
    };
  }

  function compileGenericMana(operation,key='oracle-granted') {
        if(operation.activationCost?.oracleCounterPayment)throw new Error('Counter payment mana abilities are not supported');
        const cost=operation.activationCost?compileGenericAbility({cost:operation.activationCost,targets:[],effects:[]}).cost:Object.assign({tap:true},operation.activationMana?{mana:operation.activationMana}:{});
        const produce=()=>operation.produce.map(option=>Object.assign({},option));
        const storageMana=operation.storageCounterMana;
        return {
          cost,
          possibleProduce:produce(),
          ...((operation.afterEffects||operation.restriction||storageMana)?{manual:true}:{}),
          ...(storageMana?{amountFlex:true,storageCounterMana:storageMana}:{}),
          produce:storageMana?(game,card)=>{
            const available=Math.max(0,Number(card.counters[storageMana.kind])||0);
            // A split storage land pays one counter per mana added, so every
            // division of the removed counters between its two printed colors
            // is a distinct printed choice.
            if(storageMana.colors){
              // Ordered by fewest counters first: the solver banks the first
              // option that covers the payment, and spending more counters
              // than the cost needs would destroy them for nothing.
              const options=[];
              for(let total=1;total<=available;total++)
                for(let first=total;first>=0;first--)
                  options.push({[storageMana.colors[0]]:first,[storageMana.colors[1]]:total-first});
              options.push({[storageMana.colors[0]]:0,[storageMana.colors[1]]:0});
              return options;
            }
            return [...Array.from({length:available},(_,index)=>({[storageMana.color]:index+1})),{[storageMana.color]:0}];
          }:operation.multiplier?(game,card,player)=>{const n=genericAmount(operation.multiplier,{g:game,src:card,you:player,sourceZoneVersion:card.zoneVersion,targets:[]});return produce().map(option=>Object.fromEntries(Object.entries(option).map(([key,value])=>[key,key==='ANY'?value:value*n])));}:produce(),
          ...(operation.condition?{cond:(game,card,player)=>genericCondition(game,card,operation.condition,player)}:{}),
          ...(operation.onceEachTurn?{oncePerTurn:true,key}:{}),
          ...(operation.restriction?{restrictAbilities:!!operation.restriction.abilities,restrict:(game,action,source)=>{
            if(action?.isAbility)return !!operation.restriction.abilities && (!operation.restriction.abilitySource ||
              !!action.card && genericTargetSpec(operation.restriction.abilitySource,[],0).filter(game,action.card,source.ctrl,source));
            if(operation.restriction.from && (action?.from || action?.card?.zone) !== operation.restriction.from)return false;
            if(operation.restriction.ownGraveyard && action?.card?.owner !== source.ctrl)return false;
            return !!action?.card&&!!operation.restriction.spell&&genericTargetSpec(operation.restriction.spell,[],0).filter(game,{...action,kind:'spell'},source.ctrl,source);
          }}:{}),
          ...(operation.afterEffects?{afterProduce:(game,source,player,sourceZoneVersion)=>runGenericEffects({g:game,src:source,you:player,sourceZoneVersion,targets:[]},operation.afterEffects)}:{}),
        };
  }

  function manaUsesStack(operation) {
    return !!operation.activationCost?.mill||(operation.afterEffects||[]).some(effect=>['draw','mill','search','look-select','library-select-v8','library-zone-shuffle-v8','library-search-v8','move-to-library','exile-top'].includes(effect.action));
  }
  function stackManaOperation(operation) {
    return {kind:'generic-ability',cost:operation.activationCost||{tap:true},targets:[],stackMana:true,
      effects:[{action:'add-mana',choices:operation.produce,...(operation.multiplier?{multiplier:operation.multiplier}:{}),...(operation.restriction?{restriction:operation.restriction}:{})},...(operation.afterEffects||[])],
      ...(operation.condition?{activationCondition:operation.condition}:{}),...(operation.onceEachTurn?{onceEachTurn:true}:{}),contract:'generic-activated-effect'};
  }
  MTG.oracleManaUsesStack=manaUsesStack;
  function compileGenericAbility(operation) {
    if(operation.from&&operation.cost?.oracleCounterPayment)throw new Error('Counter payment needs a battlefield activation');
    const v4Body = operation.v4Body && MTG.compileOracleSpellV4(operation.v4Body);
    const modalBody = operation.modalBody;
    if (modalBody && (modalBody.choose?.min !== 1 || modalBody.choose?.max !== 1 ||
        !Array.isArray(modalBody.modes) || modalBody.modes.length < 2 ||
        modalBody.modes.some(mode => !mode.body || mode.body.optional || !Array.isArray(mode.body.targets) ||
          !Array.isArray(mode.body.effects) || !mode.body.effects.length))) throw new Error('Unsupported Oracle ability modes');
    const cost = Object.assign({}, operation.cost || {});
    if(cost.oracleCounterPayment){const info=cost.oracleCounterPayment;cost.oracleCounterPayment=MTG.OracleV8CounterCosts.compile(info,info.filter?(game,card,source,player)=>genericTargetSpec(info.filter,[],0).filter(game,card,player,source):null);}
    if(cost.manaAdjustment) {
      const adjustment=cost.manaAdjustment,printed=cost.mana;
      if(typeof printed!=='string'||printed.includes('{X}')||!Number.isSafeInteger(adjustment.amount)||!adjustment.amount||
        Object.keys(adjustment).some(key=>!['amount','count','condition'].includes(key))||
        !!adjustment.count===!!adjustment.condition)throw new Error('Unsupported Oracle activation mana adjustment');
      cost.mana=(game,source)=>{
        const player=source.zone==='battlefield'?source.ctrl:source.owner,base=MTG.parseCost(printed);
        const units=adjustment.count?genericCount(game,source,player,adjustment.count):genericCondition(game,source,adjustment.condition,player)?1:0;
        if(!Number.isFinite(units)||units<0)throw new Error('Invalid Oracle activation cost multiplier');
        return {...base,generic:Math.max(0,base.generic+adjustment.amount*units),pips:base.pips.map(pip=>pip.slice())};
      };
      delete cost.manaAdjustment;
    }
    if(cost.tapFilter){const filter=cost.tapFilter;cost.tapPermanents={n:cost.tapN,filter:(game,card,source,player)=>genericTargetSpec(filter,[],0).filter(game,card,player,source)};delete cost.tapFilter;delete cost.tapN;}
    if(cost.discardFilter){const filter=cost.discardFilter;cost.discard={n:cost.discard,filter:(game,card,source,player)=>genericTargetSpec({...filter,zone:'hand'},[],0).filter(game,card,player,source)};delete cost.discardFilter;}
    if(cost.returnFilter){const filter=cost.returnFilter;cost.returnPermanents={n:cost.returnN,filter:(game,card,source,player)=>genericTargetSpec(filter,[],0).filter(game,card,player,source)};delete cost.returnFilter;delete cost.returnN;}
    if(cost.sacFilter){const filter=cost.sacFilter;cost.sac=(game,card,source)=>(!cost.sacOther||card!==source)&&genericTargetSpec(filter,[],0).filter(game,card,source.ctrl,source);delete cost.sacFilter;}
    if(cost.exileFilter){const filter=cost.exileFilter;cost.exileFromGY={n:cost.exileFromGY,filter:(game,card,source,player)=>genericTargetSpec(filter,[],0).filter(game,card,player,source)};delete cost.exileFilter;}
    if (cost.sacWhat) {
      const type = String(cost.sacWhat);
      cost.sac = (game, candidate, source) => (!cost.sacOther||candidate!==source)&&(type==='token'?!!candidate.isToken:genericSearchMatches(candidate, type));
      delete cost.sacWhat;
    }
    const targets = v4Body ? v4Body.targets(null,null,{},null) : genericTargetSpecs(operation.targets, operation.effects);
    const modes = modalBody && {list:modalBody.modes.map(mode=>({label:mode.label,
      targets:genericTargetSpecs(mode.body.targets,mode.body.effects)}))};
    if (cost.sacSelf && Array.isArray(targets)) for (const spec of targets) {
      spec.aiHint = Object.assign({}, spec.aiHint, { avoidCostSource: true });
    }
    if (cost.sacSelf && modes) for (const mode of modes.list) for (const spec of mode.targets) {
      spec.aiHint = Object.assign({}, spec.aiHint, { avoidCostSource: true });
    }
    const modeScores = modalBody?.modes.map(mode=>genericAbilityAiScore({...operation,...mode.body},cost));
    const ordinaryAbilityScore=genericAbilityAiScore(operation,cost);
    const baseAbilityScore=operation.oracleEquip?(game,source,player)=>{
      const useful=(targets||[]).some(spec=>game.legalTargets(spec,source,player).some(target=>target.iid!==source.attachedTo));
      return useful?Math.max(3,ordinaryAbilityScore(game,source,player)):-8;
    }:ordinaryAbilityScore;
    return {
      label: operation.label || 'Oracle ability',
      // Stabilna oznaka da je sposobnost proizvod Oracle prevodioca. Labela je
      // prezentacijska (buildDefs joj daje tekst same karte), pa se na nju ne
      // smije oslanjati nijedna provjera.
      oracleCompiled: true,
      ...(JSON.stringify(operation.effects||[]).includes('attached-host')?{oracleAttachedHostEffect:true}:{}),
      ...(operation.oracleEquip?{oracleEquip:true,equip:true}:{}),
      ...(operation.anyPlayer?{oracleAnyPlayer:true}:{}),
      cost,
      targets,
      ...(modes?{modes}:{}),
      ...(hasGenericDivision(operation.effects) || modalBody?.modes.some(mode => hasGenericDivision(mode.body.effects))
        ? {prepareTargets:ctx => prepareGenericDivisions(ctx, modalBody ? modalBody.modes[ctx.mode]?.body.effects : operation.effects)} : {}),
      sorcery: !!operation.sorceryOnly,
      oncePerTurn: !!operation.onceEachTurn,
      oncePerObject: !!operation.oncePerObject,
      powerUp: !!operation.powerUp,
      ...(operation.stackMana?{oracleManaUsesStack:true}:{}),
      ...(operation.loyalty!==undefined?{loyalty:operation.loyalty}:{}),
      xCost: typeof cost.mana === 'string' && cost.mana.includes('{X}'),
      ...(/"threshold":"X"|"targetCountX":true/.test(JSON.stringify(operation.targets||[]))?{oracleTargetX:true}:{}),
      cond: cost.energy || operation.beforeAttackersOnly || operation.activationCondition ? (game, source, player) =>
        (!cost.energy||(player.counters?.energy||0)>=cost.energy)&&
        (!operation.activationCondition||genericCondition(game,source,operation.activationCondition,player))&&(!operation.beforeAttackersOnly||game.turnPlayer === player && !player.turnState.reachedDeclareAttackers &&
        (['upkeep', 'draw', 'main1'].includes(game.phase) ||
          (game.phase === 'combat' && game.step === 'begin'))) : undefined,
      aiScore: modes ? (...args)=>Math.max(...modeScores.map(score=>score(...args))) : v4Body ? () => 2 : !operation.anyPlayer?baseAbilityScore:(game,source,player)=>{
        if(operation.anyPlayer){
          for(const effect of operation.effects||[])if(effect.target==='self'){
            const beneficial=effect.action==='scale-pt'&&effect.factor>1||effect.action==='counter'&&effect.n>0||effect.action==='pump'&&((effect.power||0)>0||(effect.toughness||0)>0);
            const harmful=effect.action==='pump'&&((effect.power||0)<0||(effect.toughness||0)<0);
            if(beneficial&&source.ctrl!==player||harmful&&source.ctrl===player)return -8;
          }
        }
        return baseAbilityScore(game,source,player);
      },
      run: async ctx => {
        if(operation.optional) {
          const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Use the optional effect?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'optTrigger',src:ctx.src}});
          if(answer!=='yes')return;
        }
        if(modalBody){
          if(!Number.isInteger(ctx.mode)||!modalBody.modes[ctx.mode])return;
          await runGenericEffects(ctx,modalBody.modes[ctx.mode].body.effects);
        }
        else if(v4Body) await v4Body.resolve(ctx); else await runGenericEffects(ctx, operation.effects);
      },
    };
  }

  function genericStaticSubjectMatches(game, card, rawDescriptor) {
    if (!rawDescriptor) return true;
    const descriptor = String(rawDescriptor).trim();
    const normalized = descriptor.toLowerCase();
    const colorSymbols = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
    if (colorSymbols[normalized]) return card.colors.includes(colorSymbols[normalized]);
    if (normalized === 'multicolored') return card.colors.length > 1;
    if (normalized === 'colorless') return card.colors.length === 0;
    if (normalized === 'artifact') return card.is('Artifact');
    if (normalized === 'legendary') return ((card.cur && card.cur.super) || card.def.super || []).includes('Legendary');
    if (normalized === 'attacking') return card.attacking !== null && card.attacking !== undefined;
    if (normalized === 'blocking') return card.blocking !== null && card.blocking !== undefined && card.blocking !== false;
    if (normalized === 'tapped') return !!card.tapped;
    if (normalized === 'untapped') return !card.tapped;
    if (normalized === 'token') return !!card.isToken;
    if (normalized === 'nontoken' || normalized === 'non-token') return !card.isToken;
    if (normalized === 'enchanted' || normalized === 'equipped') {
      return (card.attachments || []).some(iid => {
        const attachment = game.byIid(iid);
        const subtypes = attachment && ((attachment.cur && attachment.cur.subtypes) || attachment.def.subtypes || []);
        return !!attachment && attachment.zone === 'battlefield' && !attachment.phasedOut && attachment.attachedTo === card.iid &&
          subtypes.includes(normalized === 'enchanted' ? 'Aura' : 'Equipment');
      });
    }
    const excludedSubtype = /^non[- ](.+)$/i.exec(descriptor);
    if (excludedSubtype) return !card.hasSub(excludedSubtype[1]);
    const compoundSubtypes = descriptor.split(/\s+/);
    if (compoundSubtypes.length > 1) {
      return compoundSubtypes.every(subtype => MTG.CREATURE_SUBTYPES && MTG.CREATURE_SUBTYPES.has(subtype)) &&
        compoundSubtypes.every(subtype => card.hasSub(subtype));
    }
    return card.hasSub(descriptor);
  }

  function genericCondition(game,self,condition,p=self.ctrl,evidence) {
    if(MTG.OracleV8NamedCounts.conditions.has(condition?.kind))return MTG.OracleV8NamedCounts.condition(game,self,condition,p,evidence);
    if(['casting-window-v8','casting-spell-history-v8'].includes(condition?.kind))return MTG.OracleV8CastingLimits.condition(game,self,condition,p);
    if(condition?.kind==='creature-upgrade-state-v8')return MTG.OracleV8CreatureUpgrades.condition(game,self,condition,p,evidence);
    if(condition?.kind==='activation-state-v8')return MTG.OracleV8ActivationSuffixes.condition(game,self,condition,p);
    if(condition.kind==='v8-live-condition')return MTG.oracleV8LiveCondition(game,self,condition,p,genericTargetSpec,evidence);
    if(condition.kind==='combat-ordinal-v8')return game.phase==='combat'&&game.turnPlayer?.turnState.combatPhaseCount===condition.n;
    if(condition.kind==='phase-v8')return condition.phase==='main'&&['main1','main2'].includes(game.phase)&&(!condition.yourTurn||game.turnPlayer===p);
    if(['casting-turn-stat-v8','casting-opponent-upkeep-v8'].includes(condition.kind))return MTG.OracleV8CastingRules.condition(game,self,condition,p);
    if(condition.kind==='v8-event-condition')return !!MTG.oracleV8EventCondition?.(game,self,condition,p,evidence?.boundEvent,genericTargetSpec);
    if(condition.kind==='x-range'){const n=Math.max(0,Number(evidence?.castX??self.castMeta?.x)||0);return (condition.min===undefined||n>=condition.min)&&(condition.max===undefined||n<=condition.max);}
    if(condition.kind==='cast-origin'){const from=evidence?.castFrom??self.castMeta?.from;return condition.from==='not-hand'?!!from&&from!=='hand':from===condition.from;}
    if(condition.kind==='mana-total-spent')return Math.max(0,Number(evidence?.manaSpent??self.castMeta?.manaSpent)||0)>=condition.min;
    if(condition.kind==='another-entry-turn')return (p.turnState.permanentEntries||[]).some(row=>(row.iid!==self.iid||row.zoneVersion!==self.zoneVersion)&&(condition.what!=='creature'||row.creature));
    if(condition.kind==='cast-quality-turn')return condition.quality==='instant-or-sorcery'&&(p.turnState.spellsCastList||[]).some(row=>row.isInstantSorcery);
    if(condition.kind==='city-blessing')return !!p.cityBlessing;
    if(condition.kind==='source-controlled')return self.zone==='battlefield'&&(!evidence||self.zoneVersion===evidence.zoneVersion)&&self.ctrl===p;
    if(condition.kind==='starting-life'){const threshold=(p.startingLife??40)+condition.offset;return condition.comparison==='greater'?p.life>=threshold:p.life<=threshold;}
    if(condition.kind==='opponent-count-range')return game.alivePlayers().filter(player=>player!==p).some(player=>genericCount(game,self,player,condition.count)>=condition.min);
    if(condition.kind==='opponent-comparison'){
      const n=genericCount(game,self,p,condition.count),opponents=game.alivePlayers().filter(player=>player!==p),matches=player=>{const other=genericCount(game,self,player,condition.count);return condition.comparison==='greater'?other>n:other<n;};
      return condition.each?opponents.every(matches):opponents.some(matches);
    }
    if(condition.kind==='cast-main-phase')return ['main1','main2'].includes((evidence||self.castMeta)?.castPhase)&&!!(evidence||self.castMeta)?.wasCast;
    if(condition.kind==='no-mana-spent')return !(Number((evidence||self.castMeta)?.manaSpent)||0);
    if(condition.kind==='mana-spent'){const paid=(evidence||self.castMeta)?.paymentColorCounts||{};return condition.colors.every(color=>(paid[color]||0)>=(condition.min||condition.colors.filter(c=>c===color).length));}
    if(condition.kind==='player-zone-count')return game.alivePlayers().filter(player=>condition.players==='all'||player!==p).some(player=>{const n=player[condition.zone].length;return (condition.min===undefined||n>=condition.min)&&(condition.max===undefined||n<=condition.max);});
    if(condition.kind==='source-stat-comparison'){
      const n=Number(evidence&&(condition.past||self.zone!=='battlefield'||self.zoneVersion!==evidence.zoneVersion)?evidence.stats?.[condition.stat]:self[condition.stat])||0;
      return condition.comparison==='greater'?n>=condition.threshold:n<=condition.threshold;
    }
    if(condition?.kind==='your-phase')return game.turnPlayer===p&&(condition.phase==='main'?['main1','main2'].includes(game.phase):game.phase===condition.phase);
    if(condition.kind==='source-was-cast')return evidence?evidence.wasCast:!!self.castMeta?.wasCast;
    if(condition.kind==='control-commander')return game.bf().some(card=>card.ctrl===p&&card.commander);
    if(condition.kind==='monarch')return game.monarch===p;
    if(condition.kind==='source-any-counter')return Object.values((evidence&&self.zoneVersion!==evidence.zoneVersion?self.battlefieldLKI?.get(evidence.zoneVersion)?.counters:self.counters)||{}).some(n=>n>0);
    if(condition.kind==='source-modified')return game.isModifiedCreature(self);
    if(condition.kind==='spells-cast-last-turn'){
      const counts=game.players.map(player=>Number(player.lastTurnSpellsCast)||0);
      if(condition.max!==undefined)return counts.reduce((sum,n)=>sum+n,0)<=condition.max;
      if(condition.playerMin!==undefined)return counts.some(n=>n>=condition.playerMin);
      return false;
    }
    if(condition.kind==='source-quality'){
      const snap=evidence&&self.zoneVersion!==evidence.zoneVersion?self.battlefieldLKI?.get(evidence.zoneVersion):null;
      const object=snap?{...snap,_oracleLKI:true,zone:'battlefield',def:{super:snap.super},cur:{super:snap.super},is:type=>snap.types.includes(type),hasSub:type=>snap.subtypes.includes(type)||snap.changeling,kw:keyword=>snap.kw.includes(keyword)}:self;
      return genericTargetSpec(condition.filter,[],0).filter(game,object,p,self);
    }
    if(condition.kind==='source-entry-turn')return self.zone==='battlefield'&&self.meta._enteredTurn===game.turnNo;
    if(condition.kind==='source-attacked')return self.meta._attackedTurn===game.turnNo;
    if(condition.kind==='kicked')return evidence?evidence.kicked:!!self.castMeta?.kicked;
    const sameSource = !evidence || (self.zone === 'battlefield' && self.zoneVersion === evidence.zoneVersion);
    if(condition.kind==='not')return !genericCondition(game,self,condition.condition,p,evidence);
    if(condition.kind==='all')return condition.conditions.every(item=>genericCondition(game,self,item,p,evidence));
    if(condition.kind==='any')return condition.conditions.some(item=>genericCondition(game,self,item,p,evidence));
    if(condition.kind==='count-comparison'){const n=genericCount(game,self,p,condition.count);return (condition.min===undefined||n>=condition.min)&&(condition.max===undefined||n<=condition.max);}
    if(condition.kind==='turn-stat')return p.turnState[condition.field]>=condition.min;
    if(condition.kind==='opponent-life')return game.alivePlayers().some(player=>player!==p&&player.life<=condition.max);
    if(condition.kind==='opponent-poison')return game.alivePlayers().some(player=>player!==p&&player.poison>=condition.min);
    if(condition.kind==='no-other-creatures')return !game.creatures(p).some(card=>!sameSource||card!==self);
    if(condition.kind==='hand-count')return p.hand.length===condition.n;
    if(condition.kind==='filtered-permanent-count')return game.bf().filter(card=>card.ctrl===p&&(!condition.tapped||card.tapped)&&genericSearchMatches(card,condition.what)).length>=condition.min;
    if(condition.kind==='creature-died')return game.diedThisTurn.some(card=>card.types.includes('Creature'));
    if(condition.kind==='coven')return new Set(game.creatures(p).map(card=>card.power)).size>=3;
    if(condition.kind==='formidable')return game.creatures(p).reduce((sum,card)=>sum+card.power,0)>=8;
    if(condition.kind==='pack-tactics')return evidence?.packTactics??(game.combat?.attackers||[]).filter(card=>card.ctrl===p).reduce((sum,card)=>sum+card.power,0)>=6;
    if(condition.kind==='has-permanent'){
      // Older manifests retained the adjective from "a [quality] creature".
      // Keep those descriptors stable while testing the actual creature's
      // current characteristics. Outlaw itself describes any permanent with
      // one of the five creature types (including a noncreature Kindred).
      const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'},what=condition.what;
      const matches=card=>colors[what]?card.is('Creature')&&card.colors.includes(colors[what]):
        what==='colorless'?card.is('Creature')&&card.colors.length===0:
        what==='tapped'?card.is('Creature')&&card.tapped:
        what==='modified'?game.isModifiedCreature(card):
        what==='outlaw'?['Assassin','Mercenary','Pirate','Rogue','Warlock'].some(type=>card.hasSub(type)):
        what==='commander'?!!card.commander:genericSearchMatches(card,what);
      return game.bf().some(card=>card.ctrl===p&&(!condition.other||!sameSource||card!==self)&&matches(card));
    }
    if(condition.kind==='life')return condition.comparison==='less'?p.life<=condition.threshold:p.life>=condition.threshold;
    if(condition.kind==='source-status') {
      if (!sameSource) {
        const lki = self.battlefieldLKI?.get(evidence.zoneVersion);
        return !!lki && (condition.status === 'untapped' ? !lki.tapped : !!lki[condition.status]);
      }
      if(condition.status==='attacking')return !!self.attacking;
      if(condition.status==='blocking')return self.blocking!==null&&self.blocking!==undefined&&self.blocking!==false;
      if(condition.status==='tapped')return self.tapped;
      if(condition.status==='untapped')return !self.tapped;
      return (self.attachments||[]).some(id=>{const card=game.byIid(id);return card?.zone==='battlefield'&&card.attachedTo===self.iid&&card.hasSub(condition.status==='enchanted'?'Aura':'Equipment');});
    }
    if(condition.kind==='cast-from-hand') return (evidence?evidence.castFrom:self.castMeta?.from)==='hand';
    if(condition.kind==='attacked') return !!p.turnState.attacked;
    if(condition.kind==='opponent-lost-life') return game.alivePlayers().some(player=>player!==p && player.turnState.lifeLost>0);
    if(condition.kind==='ferocious') return game.creatures(p).some(card=>card.power>=4);
    if(condition.kind==='your-turn') return game.turnPlayer===p;
    if(condition.kind==='not-your-turn') return game.turnPlayer!==p;
    if(condition.kind==='graveyard-count') return p.graveyard.length>=condition.min;
    if(condition.kind==='graveyard-types') return new Set(p.graveyard.flatMap(card=>card.def.types)).size>=condition.min;
    if(condition.kind==='permanent-count') return game.bf().filter(card=>card.ctrl===p && genericTypeMatches(card,condition.type)).length>=condition.min;
    if(condition.kind==='land-subtype') return game.bf().some(card=>card.ctrl===p && card.is('Land') && card.hasSub(condition.subtype));
    throw new Error('Unknown Oracle static condition: '+condition.kind);
  }

  function applyGenericCombatRestriction(game,card,operation,controller=card.ctrl){
    if(operation.combatRule)MTG.oracleV8ApplyCombatRule(game,card,operation.combatRule,controller);
    if(operation.attackRequiresKeywords&&!operation.attackRequiresKeywords.some(keyword=>card.kw(keyword)))card.cur.cantAttack=true;
    for(const field of ['cantAttack','cantBlock','cantUntap','optionalUntap','unblockable','blockOnlyFlying','mustAttack','activationDisabled'])if(operation[field])card.cur[field]=true;
    if(operation.blockerFilters||operation.relativeBlockerPower){
      const previous=card.cur.cantBeBlockedBy;
      card.cur.cantBeBlockedBy=(currentGame,blocker)=>{
        const matches=operation.relativeBlockerPower?(operation.relativeBlockerPower==='greater'?blocker.power>card.power:blocker.power<card.power):operation.blockerFilters.some(filter=>genericTargetSpec(filter,[],0).filter(currentGame,blocker,controller,card));
        return !!(previous&&previous(currentGame,blocker))||(operation.blockOnly?!matches:matches);
      };
    }
    if(operation.attackerFilters||operation.relativeAttackerPower){
      const previous=card.cur.cantBlockCreature;
      card.cur.cantBlockCreature=(currentGame,attacker)=>!!(previous&&previous(currentGame,attacker))||(operation.relativeAttackerPower?(operation.relativeAttackerPower==='greater'?attacker.power>card.power:attacker.power<card.power):operation.attackerFilters.some(filter=>genericTargetSpec(filter,[],0).filter(currentGame,attacker,controller,card)));
    }
    if(operation.defenderRule||operation.cantAttackSourceController){
      (card.cur.attackRestrictions||=[]).push((currentGame,candidate)=>{
        const defender=candidate instanceof MTG.Player?candidate:candidate.ctrl;
        if(operation.cantAttackSourceController&&defender===controller&&(candidate instanceof MTG.Player||operation.includePlaneswalkers))return false;
        if(operation.defenderRule){const present=currentGame.bf().some(permanent=>operation.defenderRule.filters.some(filter=>genericTargetSpec(filter,[],0).filter(currentGame,permanent,defender,card)));if(present!==operation.defenderRule.require)return false;}
        return true;
      });
    }
  }
  MTG.applyOracleCombatRestriction=applyGenericCombatRestriction;

  function compileGenericStatic(operation) {
    const afterPower=JSON.stringify(operation.condition||{}).includes('"kind":"source-stat-comparison"');
    const originalGrant=operation.grantedOperation;
    const grant=originalGrant?.kind==='mana-source'&&manaUsesStack(originalGrant)?stackManaOperation(originalGrant):originalGrant;
    const granted=grant?(grant.kind==='generic-trigger'?[].concat(grant.event).map(event=>compileGenericTrigger({...grant,event})):grant.kind==='mana-source'?compileGenericMana(grant):compileGenericAbility(grant)):null;
    const scopes = new Set(['self', 'your-creatures', 'your-other-creatures', 'all-creatures', 'all-other-creatures', 'opponent-creatures', 'filtered-permanents']);
    if (!scopes.has(operation.scope)) throw new Error('Unknown generic Oracle static scope: ' + operation.scope);
    const unsupported = ['additionalBlocks', 'maxBlockers', 'combatAloneRestriction', 'lureSelf']
      .filter(field => operation[field] !== undefined);
    if (unsupported.length) {
      throw new Error('Generic Oracle static needs engine support: ' + unsupported.join(', '));
    }
    return {
      oracleOperation: operation,
      ...(operation.typeChange?{phase:1}:afterPower||operation.attackRequiresKeywords?{phase:5}:{}),
      apply: (game, self, battlefield) => {
        if (operation.yourTurnOnly && game.turnPlayer !== self.ctrl) return;
        if (operation.condition && operation.conditionSubject!=='affected' && !genericCondition(game,self,operation.condition)) return;
        const affected = operation.scope === 'filtered-permanents' ? battlefield.filter(card=>(!operation.excludeSelf||card!==self)&&operation.filters.some(filter=>genericTargetSpec(filter,[],0).filter(game,card,self.ctrl,self))) : operation.scope === 'self' ? [self] : battlefield.filter(card =>
          (operation.scope.startsWith('all-')||(operation.scope==='opponent-creatures'?card.ctrl!==self.ctrl:card.ctrl===self.ctrl)) && card.is('Creature') &&
          (!['your-other-creatures','all-other-creatures'].includes(operation.scope) || card !== self) &&
          genericStaticSubjectMatches(game, card, operation.subtype));
        for (const card of affected) {
          if(operation.conditionSubject==='affected'&&!genericCondition(game,card,operation.condition,self.ctrl))continue;
          if(operation.typeChange)MTG.oracleV8ApplyTypeStatic(card,operation.typeChange);
          if(granted){if(grant.kind==='generic-trigger')card.cur.extraTriggers.push(...granted);else if(grant.kind==='mana-source')card.cur.extraMana.push(granted);else card.cur.extraAbilities.push(granted);}
          const multiplier=operation.multiplier?genericCount(game,operation.multiplierSubject==='affected'?card:self,self.ctrl,operation.multiplier):1;
          card.cur.power += Number(operation.power || 0)*multiplier;
          card.cur.toughness += Number(operation.toughness || 0)*multiplier;
          for (const keyword of operation.keywords || []) card.cur.kw.add(keyword);
          for (const keyword of operation.removeKeywords || []) card.cur.kw.delete(keyword);
          applyGenericCombatRestriction(game,card,operation,self.ctrl);
          if(operation.defenderCanAttack)card.cur.defenderCanAttack=true;
          for (const quality of operation.protectionQualities || []) card.cur.protectionFrom.push((currentGame,source)=>{
            if(!source)return false;
            if(quality.kind==='color')return source.colors?.includes(quality.value);
            if(quality.kind==='colored')return source.colors?.length>0;
            if(quality.kind==='monocolored')return source.colors?.length===1;
            if(quality.kind==='multicolored')return source.colors?.length>1;
            if(quality.kind==='type')return source.is?.(quality.value);
            if(quality.kind==='subtype')return source.hasSub?.(quality.value);
            return false;
          });
        }
        if (operation.evasionMaxBlockerPower !== undefined || operation.evasionMinBlockerPower !== undefined || operation.blockedOnlyByFlying || operation.evasionLessThanOwnPower || operation.excludedBlockers || operation.blockedOnlyByFlyingOrReach) {
          const previous = self.cur.cantBeBlockedBy;
          const excluded=blocker=>operation.excludedBlockers==='walls'?blocker.hasSub('Wall'):operation.excludedBlockers==='artifact creatures'?blocker.is('Artifact'):!!({white:'W',blue:'U',black:'B',red:'R',green:'G'}[operation.excludedBlockers?.split(' ')[0]]&&blocker.colors.includes({white:'W',blue:'U',black:'B',red:'R',green:'G'}[operation.excludedBlockers.split(' ')[0]]));
          self.cur.cantBeBlockedBy = (currentGame, blocker) =>
            !!(previous && previous(currentGame, blocker)) ||
            (operation.evasionMaxBlockerPower !== undefined && blocker.power <= operation.evasionMaxBlockerPower) ||
            (operation.evasionMinBlockerPower !== undefined && blocker.power >= operation.evasionMinBlockerPower) ||
            (!!operation.evasionLessThanOwnPower && blocker.power < self.power) ||
            (!!operation.excludedBlockers && excluded(blocker)) ||
            (!!operation.blockedOnlyByFlyingOrReach && !blocker.kw('flying') && !blocker.kw('reach')) ||
            (!!operation.blockedOnlyByFlying && !blocker.kw('flying'));
        }
      },
    };
  }

  function compileSpell(operation) {
    if(operation.kind==='spell-modal-generic')return {
      modes:{pick:operation.choose.min===operation.choose.max?operation.choose.min:'any',min:operation.choose.min,repeats:false,
        list:operation.modes.map(mode=>({label:mode.label,targets:genericTargetSpecs(mode.body.targets,mode.body.effects)}))},
      resolve:async ctx=>{
        const selected=[...ctx.mode].sort((a,b)=>a-b);
        const entwined=!!ctx.so?.castOpts?.entwined&&ctx.src?.def?.entwine?.modeCount===operation.modes.length;
        const minimum=entwined?operation.modes.length:operation.choose.min,maximum=entwined?operation.modes.length:operation.choose.max;
        if(selected.length<minimum||selected.length>maximum||new Set(selected).size!==selected.length)throw new Error('Invalid Oracle modes');
        const refs=(ctx.targets||[]).map(target=>[target].flat().map(card=>({card,version:card?.zoneVersion})));
        let offset=0;
        for(const index of selected){
          const mode=operation.modes[index];if(!mode)throw new Error('Unknown Oracle mode');
          const targets=refs.slice(offset,offset+mode.body.targets.length).map((rows,i)=>{
            const values=rows.map(row=>row.card?.zoneVersion===row.version?row.card:null);
            return Array.isArray(ctx.targets[offset+i])?values.filter(Boolean):values[0];
          });
          offset+=mode.body.targets.length;
          await runGenericEffects({...ctx,targets},mode.body.effects);
        }
      },
    };
    if (operation.kind === 'spell-generic') return {
      targets: genericTargetSpecs(operation.targets, operation.effects),
      ...(hasGenericDivision(operation.effects) ? {prepareTargets:ctx => prepareGenericDivisions(ctx, operation.effects, ctx.oracleTargetOffset || 0)} : {}),
      run: async (ctx,targets) => { await runGenericEffects(Object.assign({},ctx,{targets}),operation.overloadedBody&&ctx.so?.castOpts?.overloaded?operation.overloadedBody.effects:operation.effects); },
    };
    if (operation.kind === 'spell-v4') {
      if (typeof MTG.compileOracleSpellV4 !== 'function') {
        throw new Error('Oracle spell v4 runtime is not loaded.');
      }
      return MTG.compileOracleSpellV4(operation);
    }
    const amount = ctx => operation.n === 'X' ? Math.max(0, Number(ctx.x) || 0) : operation.n;
    if (operation.kind === 'spell-draw') {
      return { targets: [], run: async ctx => { await ctx.g.draw(ctx.you, operation.n); } };
    }
    if (operation.kind === 'spell-draw-discard') {
      return {
        targets: [],
        run: async ctx => {
          await ctx.g.draw(ctx.you, operation.draw);
          const n = Math.min(operation.discard, ctx.you.hand.length);
          if (!n) return;
          const cards = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: ctx.you.hand, min: n, max: n,
            prompt: 'Discard ' + n + (n === 1 ? ' card' : ' cards'),
            aiHint: { kind: 'cleanupDiscard' },
          });
          await ctx.g.discard(ctx.you, cards);
        },
      };
    }
    if (operation.kind === 'spell-counter') {
      const spellType = operation.spellType || 'spell';
      const spec = {
        zone: 'stack',
        what: 'spell',
        prompt: 'Counter target spell',
        aiHint: { goal: 'counter' },
        filter: (game, stackObject) => stackObject && stackObject.kind === 'spell' &&
          (spellType === 'spell' || stackObject.card && (
            spellType === 'creature spell' && game.castHasType(stackObject.card, stackObject.castOpts || {}, 'Creature') ||
            spellType === 'instant spell' && game.castHasType(stackObject.card, stackObject.castOpts || {}, 'Instant') ||
            spellType === 'sorcery spell' && game.castHasType(stackObject.card, stackObject.castOpts || {}, 'Sorcery'))),
      };
      return {
        targets: [spec],
        run: async (ctx, targets) => {
          const target = targets[0];
          if (target && ctx.g.stack.includes(target) && !MTG.isUncounterable(ctx.g, target)) {
            await ctx.g.counterStackObject(target, { source: ctx.src });
          }
        },
      };
    }
    if (operation.kind === 'spell-destroy' || operation.kind === 'spell-exile') {
      const constraints = {
        attacking: !!operation.attacking,
        blocking: !!operation.blocking,
        attackingOrBlocking: !!operation.attackingOrBlocking,
        tapped: !!operation.tapped,
        stat: operation.stat,
        threshold: operation.threshold,
        comparison: operation.comparison,
      };
      const target = permanentSpec(operation.what,
        operation.kind === 'spell-destroy' ? 'Destroy target' : 'Exile target', 'removal', constraints);
      // Rules legality intentionally still includes indestructible permanents:
      // they are legal destroy targets even though the effect will not remove
      // them. Give only the local AI enough provenance to distinguish a dead
      // destroy choice from exile and other effective removal.
      target.aiHint.removalKind = operation.kind === 'spell-destroy' ? 'destroy' : 'exile';
      return {
        targets: [target],
        run: async (ctx, targets) => {
          const target = targets[0];
          if (!target) return;
          if (operation.kind === 'spell-destroy') await ctx.g.destroy(target, { noRegen: !!operation.noRegen });
          else await ctx.g.exileCard(target);
        },
      };
    }
    if (operation.kind === 'spell-damage') {
      return {
        targets: operation.what === 'each opponent' ? [] : [damageSpec(operation.what, operation.n)],
        run: async (ctx, targets) => {
          const n = amount(ctx);
          // A compound Oracle spell is one resolving object. Defer SBA until
          // every printed instruction finishes; the engine performs the one
          // authoritative check after the spell leaves the Stack.
          if (operation.what === 'each opponent') {
            await ctx.g.damageOpponents(ctx.src, ctx.you, n, { deferSBA: true });
          } else if (targets[0]) await ctx.g.damageAny(ctx.src, targets[0], n, { deferSBA: true });
        },
      };
    }
    if (operation.kind === 'spell-pump') {
      const printedPower = operation.power;
      const variablePowerSign = printedPower === 'X' ? 1 : printedPower === '-X' ? -1 : 0;
      const staticPower = variablePowerSign || Number(printedPower || 0);
      const beneficial = staticPower >= 0 && operation.toughness >= 0;
      const mixed = staticPower > 0 && operation.toughness < 0;
      const debuff = variablePowerSign < 0 && operation.toughness >= 0;
      const spec = permanentSpec('creature', 'Target creature', mixed ? 'mixedPump' : debuff ? 'debuff' : beneficial ? 'buff' : 'removal', {
        controller: operation.controller,
        attacking: !!operation.attacking,
      });
      Object.assign(spec.aiHint, {
        power: staticPower,
        toughness: Number(operation.toughness || 0),
        keywords: (operation.keywords || []).slice(),
        untilEOT: true,
      });
      if (mixed) Object.assign(spec.aiHint, { power: staticPower, toughness: operation.toughness });
      if (debuff) Object.assign(spec.aiHint, { power: printedPower, toughness: operation.toughness });
      return {
        targets: [spec],
        run: async (ctx, targets) => {
          const chosenX = Math.max(0, Number(ctx.x) || 0);
          const power = variablePowerSign ? variablePowerSign * chosenX : Number(printedPower || 0);
          if (targets[0]) MTG.E.pumpUntilEOT(ctx.g, targets[0], power, operation.toughness, operation.keywords || []);
        },
      };
    }
    if (operation.kind === 'spell-team-pump') {
      return {
        targets: [],
        run: async ctx => {
          const controller = operation.controller || (operation.attackingOnly ? 'any' : 'you');
          MTG.E.pumpAllUntilEOT(ctx.g, (game, card) =>
            (controller !== 'you' || card.ctrl === ctx.you) &&
            (!operation.attackingOnly || !!card.attacking),
          operation.power, operation.toughness, operation.keywords || []);
        },
      };
    }
    if (operation.kind === 'spell-global-pump') {
      return {
        targets: [],
        run: async ctx => {
          MTG.E.pumpAllUntilEOT(ctx.g, () => true, operation.power, operation.toughness, []);
        },
      };
    }
    if (operation.kind === 'spell-life-gain') {
      return { targets: [], run: async ctx => { await ctx.g.gainLife(ctx.you, operation.n, ctx.src); } };
    }
    if (operation.kind === 'spell-bounce') {
      return {
        targets: [permanentSpec(operation.what, 'Return target to hand', 'bounce')],
        run: async (ctx, targets) => { if (targets[0]) await ctx.g.move(targets[0], 'hand'); },
      };
    }
    if (operation.kind === 'spell-graveyard-return') {
      const types = operation.what === 'instant or sorcery' ? ['Instant', 'Sorcery']
        : operation.what === 'permanent'
          ? ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker']
          : [operation.what.charAt(0).toUpperCase() + operation.what.slice(1)];
      return {
        targets: [{
          zone: 'graveyard', what: 'card', prompt: 'Return card from your graveyard',
          aiHint: { goal: 'recur' },
          filter: (game, card, controller) => card && card.zone === 'graveyard' && card.owner === controller &&
            types.some(type => card.is(type)),
        }],
        run: async (ctx, targets) => { if (targets[0]) await ctx.g.move(targets[0], 'hand'); },
      };
    }
    if (operation.kind === 'spell-discard') {
      return {
        targets: [{
          what: operation.what,
          prompt: 'Choose player to discard',
          aiHint: { goal: 'discard', amount: operation.n },
        }],
        run: async (ctx, targets) => {
          const player = targets[0];
          if (!player) return;
          const n = Math.min(operation.n, player.hand.length);
          if (!n) return;
          const cards = await player.controller.decide(ctx.g, {
            type: 'chooseCards', from: player.hand, min: n, max: n,
            prompt: 'Discard ' + n + (n === 1 ? ' card' : ' cards'),
            aiHint: { kind: 'cleanupDiscard' },
          });
          await ctx.g.discard(player, cards);
        },
      };
    }
    if (operation.kind === 'spell-mill') {
      return {
        targets: [{ what: 'player', prompt: 'Choose player to mill', aiHint: { goal: 'mill' } }],
        run: async (ctx, targets) => { if (targets[0]) await ctx.g.mill(targets[0], operation.n); },
      };
    }
      if (operation.kind === 'spell-token') {
        return {
        targets: [],
        run: async ctx => {
          if (operation.tokenKey) await ctx.g.makeTokens(operation.tokenKey, ctx.you, { n: operation.n });
          else {
            const token = operation.token;
            const tokenDef = {
              name: token.name, cost: null, super: (token.super || []).slice(),
              types: (token.types || ['Creature']).slice(), subtypes: (token.subtypes || []).slice(),
              power: String(token.power), toughness: String(token.toughness), oracle: '',
              kws: (token.keywords || []).slice(), colorsOverride: (token.colors || []).slice(), isTokenDef: true,
            };
            await ctx.g.makeTokens(tokenDef, ctx.you, { n: operation.n });
          }
        },
        };
      }
      if (operation.kind === 'spell-token-roll-threshold') {
        return {
          targets: [],
          run: async ctx => {
            const token = operation.token;
            const tokenDef = {
              name: token.name, cost: null, super: (token.super || []).slice(),
              types: (token.types || ['Creature']).slice(), subtypes: (token.subtypes || []).slice(),
              power: String(token.power), toughness: String(token.toughness), oracle: '',
              kws: (token.keywords || []).slice(), colorsOverride: (token.colors || []).slice(), isTokenDef: true,
            };
            await ctx.g.makeTokens(tokenDef, ctx.you, { n: operation.n });
            const sides = Math.max(1, Number(operation.dieSides) || 6);
            const result = 1 + Math.floor(ctx.g.rnd() * sides);
            const threshold = ctx.g.creatures(ctx.you)
              .filter(card => card.hasSub(operation.compareSubtype)).length;
            ctx.g.lg(`${ctx.src.name}: rolled ${result} (needs ${threshold} or less).`);
            if (result <= threshold) await ctx.g.makeTokens(tokenDef, ctx.you, { n: operation.bonusN || 1 });
          },
        };
      }
    if (operation.kind === 'spell-counter-on-creature') {
      return {
        targets: [permanentSpec('creature', 'Put counters on target creature', 'buff', { controller: operation.controller })],
        run: async (ctx, targets) => {
          if (targets[0]) ctx.g.addCounters(targets[0], operation.counter, operation.n, false, ctx.you);
        },
      };
    }
    if (operation.kind === 'spell-fog') {
      return {
        targets: [],
        run: async ctx => {
          if (operation.playersOnly) {
            for (const player of ctx.g.alivePlayers()) {
              ctx.g.untilEffects.push({ kind: 'preventCombatToPlayer', who: player, expires: 'eot' });
            }
          } else ctx.g.untilEffects.push({ kind: 'preventAllCombat', expires: 'eot' });
        },
      };
    }
    if (operation.kind === 'spell-tap' || operation.kind === 'spell-untap') {
      const what = operation.what.includes('land') ? 'land' : operation.what.includes('permanent') ? 'permanent' : 'creature';
      const spec = permanentSpec(what, operation.kind === 'spell-tap' ? 'Tap target' : 'Untap target',
        operation.kind === 'spell-tap' ? 'tap' : 'untap');
      spec.count = operation.count;
      spec.upTo = operation.upTo;
      return {
        targets: [spec],
        run: async (ctx, targets) => {
          const selected = Array.isArray(targets[0]) ? targets[0] : targets;
          for (const target of selected) {
            if (operation.kind === 'spell-tap') ctx.g.tap(target);
            else ctx.g.untap(target);
          }
        },
      };
    }
    if (operation.kind === 'spell-scry' || operation.kind === 'spell-surveil') {
      return {
        targets: [],
        run: async ctx => {
          if (operation.kind === 'spell-scry') await MTG.E.scry(ctx.g, ctx.you, operation.n);
          else await MTG.E.surveil(ctx.g, ctx.you, operation.n, {
            drawReserve: Math.max(0, Number(ctx.oracleMandatoryDrawReserve) || 0),
          });
        },
      };
    }
    if (operation.kind === 'spell-add-mana') {
      return {
        targets: [],
        run: async ctx => {
          let produce = operation.produce;
          if (produce.ANY) {
            const choice = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseOption', prompt: 'Choose a mana color',
              options: COLORS.map(color => ({ key: color, label: color })),
              aiHint: { kind: 'manaColor' },
            });
            produce = { [COLORS.includes(choice) ? choice : 'W']: produce.n || 1 };
          }
          for (const [color, n] of Object.entries(produce)) ctx.you.pool[color] = (ctx.you.pool[color] || 0) + n;
          ctx.g.note('mana', { p: ctx.you });
        },
      };
    }
    if (operation.kind === 'spell-destroy-all') {
      const type = operation.what.charAt(0).toUpperCase() + operation.what.slice(1, -1);
      return {
        targets: [],
        run: async ctx => {
          await ctx.g.destroyMany(ctx.g.bf().filter(card => card.is(type)), {
            noRegen: !!operation.noRegen, source: ctx.src,
          });
        },
      };
    }
    throw new Error('Unknown Oracle spell implementation: ' + operation.kind);
  }

  // Frozen manifests retain their source bytes. Repair only the historical
  // one-word encoding when the printed rules use the single subtype Time Lord
  // and contain no independent Lord reference.
  MTG.normalizeOracleTimeLordEntry = entry => {
    const text = entry.raw?.oracle || '';
    if (!/\bTime Lord\b/.test(text) || /\bLord\b/.test(text.replace(/\bTime Lord\b/g, ''))) return entry;
    const normalize = node => Array.isArray(node) ? node.map(normalize) : node && typeof node === 'object' ?
      Object.fromEntries(Object.entries(node).map(([key, value]) => [key,
        (key === 'subtype' || key === 'notSubtype') && value === 'Lord' ? 'Time Lord' : normalize(value)])) : node;
    return { ...entry, implementation: normalize(entry.implementation) };
  };

  function compileOracleScript(batch, entry) {
    entry = MTG.normalizeOracleTimeLordEntry(entry);
    const faces=entry.implementation?.find(operation=>operation.kind==='double-faced-v8');
    if(faces)return MTG.OracleV8Faces.compile(entry,faces,faceEntry=>compileOracleScript(batch,faceEntry));
    const levels=entry.implementation?.find(operation=>operation.kind==='mechanic-level-up-v8');
    if(levels)return MTG.OracleV8Levels.compile(entry,levels,bandEntry=>compileOracleScript(batch,bandEntry));
    const implementedKeywords = (entry.implementedKeywords || []).slice();
    const script = {
      oracleBatch: batch.id,
      oracleId: entry.oracleId,
      oracleImplemented: true,
      semanticClass: entry.semanticClass,
      implementedKeywords,
      // Oracle rows may combine a simple keyword with an explicitly compiled
      // operation on the same line (for example, "Flying, protection from
      // artifacts"). The generic raw-text loader intentionally accepts only
      // all-keyword lines, so carry the compiler-certified keyword set into
      // the runtime script instead of silently dropping the valid prefix.
      kws: implementedKeywords.filter(keyword => !String(keyword).toLowerCase().startsWith('ward ')),
      oracleContracts: (entry.oracleContracts || []).slice(),
      oracleImplementation: (entry.implementation || []).map(operation => Object.assign({}, operation)),
    };
    const mana = [];
    const triggers = [];
    const statics = [];
    const abilities = [];
    const spellFragments = [];
    let spellV4Fragment = null;
    const attachmentGrants = [];
    const declaredAttachmentGrants = (entry.implementation || [])
      .filter(operation => operation.kind === 'attachment-grant');
    for (const operation of (entry.implementation || []).flatMap(operation=>operation.kind==='casting-cost-modifiers-v8'?operation.modifiers:[operation])) {
      if(MTG.OracleV8Ripple?.apply(script,operation))continue;
      if(MTG.OracleV8Exert?.apply(script,operation,{trigger:compileGenericTrigger,score:genericAbilityAiScore}))continue;
      MTG.OracleV8Exploit?.apply(script,operation,{score:genericAbilityAiScore,target:genericTargetSpec});
      if(MTG.OracleV8HandSize?.apply(script,operation))continue;
      if(MTG.OracleV8CastingLimits?.apply(script,operation))continue;
      if(MTG.StateTriggers?.apply(script,operation,{trigger:compileGenericTrigger,condition:genericCondition}))continue;
      if(operation.kind==='zone-replacement-v8'){(script.oracleZoneReplacements||=[]).push(MTG.OracleV8ZoneReplacements.compile(operation));continue;}
      if(['soulbond-v8','soulbond-grant-v8'].includes(operation.kind)){const compiled=MTG.OracleV8Soulbond.compile(operation,{static:compileGenericStatic});if(compiled.triggers)triggers.push(...compiled.triggers);if(compiled.static)statics.push(compiled.static);continue;}
      if(operation.kind==='creature-upgrade-entry-v8'){script.oracleCreatureEntryUpgrade=MTG.OracleV8CreatureUpgrades.compile(operation);continue;}
      if(operation.kind==='draw-replacement-v8'){(script.oracleDrawReplacements||=[]).push(MTG.OracleV8DrawReplacements.compile(operation));continue;}
      if(operation.kind==='entry-counters-v8'){(script.oracleEntryCounters||=[]).push(MTG.OracleV8EntryCounters.compile(operation));continue;}
      if(operation.kind==='entry-counter-bonus-v8'){(script.oracleEntryBonuses||=[]).push(MTG.OracleV8EntryCounters.compile(operation));continue;}
      if(operation.kind==='casting-restriction-v8') {
        const previous=script.oracleCastRestriction;
        script.oracleCastRestriction=(game,card,player)=>(!previous||previous(game,card,player))&&genericCondition(game,card,operation.condition,player);
        continue;
      }
      if(operation.kind==='mechanic-alternative-costs-v8'){
        const compiled=MTG.compileOracleAdditionalCosts(operation.costs),alternatives=script.altCosts||(script.altCosts=[]);
        alternatives.push({oracleAlternativeId:'oracle-alt-'+alternatives.length,oracleAlternativeCost:true,
          ...(operation.evoke===true?{evoke:true}:{}),
          ...(operation.emerge===true?{oracleEmergeCost:true}:{}),
          ...(operation.sneak===true?{oracleSneakCost:true,speed:'instant'}:{}),
          ...(operation.webSlinging===true?{oracleWebSlingingCost:true}:{}),
          altCostStr:operation.mana,oracleAdditionalCosts:operation.costs,label:operation.label,
          cond:(game,player,card)=>(!operation.condition||genericCondition(game,card,operation.condition,player))&&compiled.castCond(game,player,card),
          oraclePrepareCosts:compiled.prepareTargets});
        continue;
      }
      if(operation.kind==='mechanic-equip-reduction-v8'){
        if(!Number.isSafeInteger(operation.n)||operation.n<1||!['target-self','all','other-equipment'].includes(operation.scope))throw new Error('Invalid Equip reduction');
        const previous=script.abilityCostReduction;
        script.abilityCostReduction=(game,self,ctx)=>(previous?.(game,self,ctx)||0)+(
          !self.cur?.abilitiesDisabled&&ctx.kind==='equip'&&ctx.player===self.ctrl&&
          (operation.scope!=='target-self'||ctx.targets.flat(Infinity).includes(self))&&
          (operation.scope!=='other-equipment'||ctx.source!==self)?operation.n:0);
        continue;
      }
      if(operation.kind==='mechanic-encore-v8'){MTG.OracleV8Encore.install(script,operation);continue;}
      if(operation.kind==='mechanic-miracle-v8'){MTG.OracleV8Miracle.install(script,operation);continue;}
      if(['mechanic-zone-keyword-cost-v8','mechanic-cycling-rule-v8'].includes(operation.kind)){MTG.OracleV8ZoneKeywordCosts.install(script,operation);continue;}
      if(operation.kind==='mechanic-keyword-payment-v8'){MTG.OracleV8KeywordPayments.install(script,operation);continue;}
      if(operation.kind==='mechanic-upkeep-cost-v8'){MTG.OracleV8UpkeepCosts.install(script,operation);continue;}
      if(operation.kind==='mechanic-morph-cost-v8'){MTG.OracleV8MorphCosts.install(script,operation);continue;}
      if(operation.kind==='mechanic-awaken-v8'){MTG.OracleV8Awaken.install(script,operation);continue;}
      if(operation.kind==='mechanic-casting-choice-v8'){
        if(script.oracleCastingChoice)throw new Error('Duplicate mandatory casting choice');
        script.oracleCastingChoice=MTG.OracleV8CastingChoices.compile(operation);
        continue;
      }
      if(operation.kind==='flash-permission-v8'){
        (script.oracleFlashPermissions||(script.oracleFlashPermissions=[])).push({scope:operation.scope,filter:operation.filter});
        continue;
      }
      if(operation.kind==='mechanic-ward-v8'){
        const payment=operation.payment||{},validLife=payment.kind==='life'&&Number.isInteger(payment.n)&&payment.n>0,
          validDiscard=payment.kind==='discard'&&payment.n===1;
        if(script.ward||operation.contract!=='mechanic-ward-v8'||Object.keys(operation).some(key=>!['kind','payment','contract'].includes(key))||
          Object.keys(payment).some(key=>!['kind','n'].includes(key))||!(validLife||validDiscard)||
          (entry.raw.types||[]).some(type=>type==='Instant'||type==='Sorcery'))throw new Error(batch.id+'/'+entry.raw.name+': invalid Ward descriptor');
        script.ward=validLife?{life:payment.n}:{discard:1};
        continue;
      }
      if(operation.kind==='mechanic-mayhem-v8'){
        MTG.OracleV8Mayhem.compile(script,operation,entry);
        continue;
      }
      if(operation.kind==='mechanic-entwine'){
        const cost=operation.cost||{},validMana=cost.kind==='mana'&&typeof cost.mana==='string'&&
          /^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|2\/[WUBRG])\})+$/.test(cost.mana);
        const validSacrifice=cost.kind==='sacrifice'&&cost.type==='Land'&&Number.isInteger(cost.n)&&cost.n>=1&&cost.n<=4;
        if(script.entwine || operation.contract!=='mechanic-entwine' || !(validMana||validSacrifice) ||
          !Number.isInteger(operation.modeCount)||operation.modeCount<2 ||
          !Number.isInteger(operation.printedChoice?.min)||!Number.isInteger(operation.printedChoice?.max)||
          operation.printedChoice.min<1||operation.printedChoice.max>=operation.modeCount||
          !(entry.raw.types||[]).some(type=>type==='Instant'||type==='Sorcery'))
          throw new Error(batch.id+'/'+entry.raw.name+': invalid entwine descriptor');
        script.entwine={cost:validMana?{kind:'mana',mana:cost.mana}:{kind:'sacrifice',type:'Land',n:cost.n},
          modeCount:operation.modeCount,printedChoice:{min:operation.printedChoice.min,max:operation.printedChoice.max}};
        continue;
      }
      if(operation.kind==='mechanic-bestow'){
        if(script.bestowCost || operation.contract!=='mechanic-bestow' ||
          !/^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|2\/[WUBRG])\})+$/.test(operation.cost)||
          !(entry.raw.types||[]).includes('Enchantment')||!(entry.raw.types||[]).includes('Creature'))
          throw new Error(batch.id+'/'+entry.raw.name+': invalid bestow descriptor');
        const restrictsHost=declaredAttachmentGrants.some(grant=>grant.skipUntap||grant.cantAttack||grant.cantBlock);
        const negativeStats=declaredAttachmentGrants.some(grant=>Number(grant.power||0)<0||Number(grant.toughness||0)<0);
        const positiveStats=declaredAttachmentGrants.some(grant=>Number(grant.power||0)>0||Number(grant.toughness||0)>0||(grant.keywords||[]).length);
        const goal=!restrictsHost&&!negativeStats?'buff':!restrictsHost&&negativeStats&&positiveStats?'mixedPump':'removal';
        const spec=permanentSpec('creature','Choose a creature for '+entry.raw.name+' bestowed',goal,{controller:'any'});
        spec.oracleBestow=true;Object.assign(spec.aiHint,{bestow:true});
        script.bestowCost=operation.cost;script.bestowTarget=[spec];
        (script.altCosts||(script.altCosts=[])).push({bestow:true,altCostStr:operation.cost,label:'Bestow '+operation.cost});
        continue;
      }
      if(operation.kind==='commander-pairing'){
        const variants=new Set(['partner','named','with','background','doctorsCompanion']);
        if(!variants.has(operation.variant) || operation.variant==='named'&&!operation.label || operation.variant==='with'&&(!operation.partnerName||!operation.search))
          throw new Error(batch.id+'/'+entry.raw.name+': invalid commander pairing descriptor');
        script.oracleCommanderPairing={variant:operation.variant,...(operation.label?{label:operation.label}:{}),...(operation.partnerName?{partnerName:operation.partnerName}:{})};
        if(operation.variant==='with')triggers.push({
          on:'etb',desc:'Partner with '+operation.partnerName,
          filter:(game,self,data)=>data.card===self,
          targets:[MTG.T.player({prompt:'Who may find '+operation.partnerName+'?',aiHint:{goal:'gift'}})],
          run:async ctx=>{
            const player=ctx.targets[0];if(!player)return;
            const card=player.library.find(candidate=>candidate.name===operation.partnerName);
            let use='no';
            if(card)use=await player.controller.decide(ctx.g,{type:'chooseOption',prompt:'Put '+operation.partnerName+' into your hand?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'partnerSearch',card}});
            if(card&&use==='yes')await ctx.g.move(card,'hand');
            MTG.shuffle(player.library,ctx.g.rnd);
          },
        });
        continue;
      }
      if(operation.kind==='aura-control-v8'){
        script.oracleAuraControl=true;const priorAttach=script.onAttach;
        script.onAttach=async(game,source,host)=>{await priorAttach?.(game,source,host);MTG.OracleV8Control.attached(game,source,host);};continue;
      }
      if(operation.kind==='v8-replacement'){
        const compiled=MTG.oracleV8CompileReplacement(operation,{target:genericTargetSpec,token:genericInlineToken,condition:genericCondition});
        (script.replace||(script.replace=[])).push(...compiled.replace);continue;
      }
      if(operation.kind==='copy-as-enters-v8'){
        script.asEnters=(game,card)=>MTG.OracleV8Copies.asEnters(game,card,operation,{target:genericTargetSpec,compile:operations=>compileOracleScript(batch,{raw:entry.raw,implementation:operations})});
        continue;
      }
      if(operation.kind==='protection-static'){
        statics.push({apply:(game,source,bf)=>{
          if(operation.condition&&!genericCondition(game,source,operation.condition))return;
          const cards=operation.own?[source]:operation.attached?bf.filter(card=>card.iid===source.attachedTo):bf.filter(card=>operation.filters.some(filter=>genericTargetSpec(filter,[],0).filter(game,card,source.ctrl,source)));
          for(const card of cards){card.cur.power+=operation.power;card.cur.toughness+=operation.toughness;for(const keyword of operation.keywords)card.cur.kw.add(keyword);for(const quality of operation.qualities)card.cur.protectionFrom.push((g,origin,bearer)=>protectionMatches(g,origin,bearer,quality));}
        }});continue;
      }
      if(operation.kind==='v8-ability-loss-static'){
        statics.push(...MTG.OracleV8AbilityLoss.compile(operation,{target:filter=>genericTargetSpec(filter,[],0),condition:genericCondition}));continue;
      }
      if(operation.kind==='v8-layered-static'){
        const starts=new WeakMap(),child=operation.operation;
        const ongoing=source=>{const start=starts.get(source);return start?.cur===source.cur?start.chosen:[];};
        statics.push({phase:1,oracleOperation:operation,apply:(game,source,bf)=>{
          const enabled=!operation.condition||operation.conditionSubject==='affected'||genericCondition(game,source,operation.condition);
          const affected=!enabled?[]:operation.own?[source]:operation.attached?bf.filter(card=>card.iid===source.attachedTo):bf.filter(card=>operation.filters.some(filter=>genericTargetSpec(filter,[],0).filter(game,card,source.ctrl,source)));
          const chosen=affected.filter(card=>!operation.condition||operation.conditionSubject!=='affected'||genericCondition(game,card,operation.condition,source.ctrl));
          starts.set(source,{cur:source.cur,chosen});
          for(const card of chosen)MTG.oracleV8ApplyStaticCharacteristics(card,operation.change);
        }});
        // Once a single continuous effect starts in layer 4/5, removing its
        // source ability in layer 6 does not discard its remaining parts.
        if(child.kind==='generic-static'||child.kind==='attachment-grant'){
          const normalized={...child,kind:'generic-static',scope:'filtered-permanents',filters:[{what:'permanent',zone:'battlefield',controller:'any',min:1}],excludeSelf:false,condition:undefined};
          const stats=compileGenericStatic({...normalized,keywords:[],grantedOperation:undefined});
          const grant=compileGenericStatic({...normalized,power:0,toughness:0,multiplier:undefined});
          statics.push({...stats,continuesAfterType:true,apply:(game,source)=>{
            stats.apply(game,source,ongoing(source));
            grant.apply(game,source,ongoing(source).filter(card=>!(card.cur.oracleAbilityLossTimestamp>source.timestamp)));
          }});
        }else if(child.kind==='base-pt-static'){
          statics.push({phase:2,continuesAfterType:true,apply:(game,source)=>{for(const card of ongoing(source))if(!(card.cur.oracleAbilityLossTimestamp>source.timestamp))for(const keyword of child.keywords||[])card.cur.kw.add(keyword);}});
          statics.push({phase:7,continuesAfterType:true,apply:(game,source)=>{for(const card of ongoing(source)){if(child.power!==undefined)card.cur.basePower=genericAmount(child.power,{g:game,src:source,you:source.ctrl});if(child.toughness!==undefined)card.cur.baseToughness=genericAmount(child.toughness,{g:game,src:source,you:source.ctrl});}}});
        }else throw new Error('Unsupported layered static child');
        continue;
      }
      if(operation.kind==='v8-land-types'){statics.push(MTG.OracleV8LandTypes.compile(operation,{target:genericTargetSpec}));continue;}
      if(operation.kind==='v8-type-static'){
        statics.push({phase:1,oracleOperation:operation,apply:(game,source,bf)=>{
          if(operation.condition&&operation.conditionSubject!=='affected'&&!genericCondition(game,source,operation.condition))return;
          const affected=operation.own?[source]:operation.attached?bf.filter(card=>card.iid===source.attachedTo):bf.filter(card=>operation.filters.some(filter=>genericTargetSpec(filter,[],0).filter(game,card,source.ctrl,source)));
          for(const card of affected)if(!operation.condition||operation.conditionSubject!=='affected'||genericCondition(game,card,operation.condition,source.ctrl))MTG.oracleV8ApplyStaticCharacteristics(card,operation.change);
        }});continue;
      }
      if(operation.kind==='v8-graveyard-static'){
        const child=compileGenericStatic(operation.operation);
        (script.graveyardStatics||(script.graveyardStatics=[])).push({oracleOperation:operation,apply:(game,source,bf,owner)=>{
          if(operation.condition&&!genericCondition(game,source,operation.condition,owner))return;
          child.apply(game,source,bf);
        }});continue;
      }
      if(operation.kind==='base-pt-static'){
        const affected=(game,source,bf)=>operation.condition&&!genericCondition(game,source,operation.condition)?[]:operation.own?[source]:operation.attached?bf.filter(card=>card.iid===source.attachedTo):bf.filter(card=>operation.filters.some(filter=>genericTargetSpec(filter,[],0).filter(game,card,source.ctrl,source)));
        if(operation.subtypes.length)statics.push({phase:1,apply:(game,source,bf)=>{for(const card of affected(game,source,bf))card.cur.subtypes=[...new Set([...card.cur.subtypes,...operation.subtypes])];}});
        if(operation.keywords.length)statics.push({phase:2,apply:(game,source,bf)=>{for(const card of affected(game,source,bf))for(const keyword of operation.keywords)card.cur.kw.add(keyword);}});
        statics.push({phase:7,apply:(game,source,bf)=>{for(const card of affected(game,source,bf)){if(operation.power!==undefined)card.cur.basePower=genericAmount(operation.power,{g:game,src:source,you:source.ctrl});if(operation.toughness!==undefined)card.cur.baseToughness=genericAmount(operation.toughness,{g:game,src:source,you:source.ctrl});}}});
        continue;
      }
      if(operation.kind==='copy-as-enters'){
        const extra=operation.modifications.operation?compileOracleScript(batch,{raw:entry.raw,implementation:[operation.modifications.operation]}):{};
        script.asEnters=async(game,card)=>{
          if(operation.condition&&!genericCondition(game,card,operation.condition))return;
          const pool=operation.filter.zone==='graveyard'?game.players.flatMap(player=>player.graveyard):game.bf();
          const filter=genericTargetSpec(operation.filter,[],0).filter;
          const from=pool.filter(candidate=>candidate!==card&&filter(game,candidate,card.ctrl,card));
          if(!from.length)return;
          const selected=await card.ctrl.controller.decide(game,{type:'chooseCards',from,min:0,max:1,source:card,player:card.ctrl,aiHint:{kind:'bestCard'},prompt:'Choose a permanent or card to copy as this enters.'});
          const chosen=selected?.[0];if(!from.includes(chosen))return;
          const def={...(chosen.isCopyOf||chosen.def)},mod=operation.modifications;
          if(mod.power!==undefined){def.power=String(mod.power);delete def.cdaPower;}
          if(mod.toughness!==undefined){def.toughness=String(mod.toughness);delete def.cdaToughness;}
          def.types=[...new Set([...(def.types||[]),...(mod.types||[])])];
          def.subtypes=[...new Set([...(def.subtypes||[]),...(mod.subtypes||[])])];
          def.kws=[...new Set([...(def.kws||[]),...(mod.keywords||[])])];
          for(const field of ['abilities','triggers'])if(extra[field]?.length)def[field]=[...(def[field]||[]),...extra[field]];
          if(extra.mana)def.mana=[...[].concat(def.mana||[]),...[].concat(extra.mana)];
          card.meta.characteristicOriginalDef ||= card.def;
          card.def=def;card.isCopyOf=def;game.recalc();
        };
        continue;
      }
      if(operation.kind==='damage-prevention'){
        (script.replace||(script.replace=[])).push({event:'damage',prevent:true,oraclePrevention:true,applies:(game,data,source)=>data.n>0&&genericPreventionMatches(game,source,source.ctrl,operation,data),run:(game,data,source)=>genericPreventionMatches(game,source,source.ctrl,operation,data)?0:data.n});
        continue;
      }
      if(operation.kind==='saga-chapters'){
        script.saga=operation.chapters.map(chapter=>compileGenericTrigger({kind:'generic-trigger',event:'saga-chapter',eventFilter:'self',...chapter}));
        continue;
      }
      if(operation.kind==='split-faces'){
        script.oracleSplit={faces:operation.faces.map(({key,name,cost,types,aftermath})=>({key,name,cost,types,aftermath})),fuse:operation.fuse};
        script.splitHalves=Object.fromEntries(operation.faces.map(face=>[face.key,{targets:genericTargetSpecs(face.targets,face.effects),resolve:async ctx=>runGenericEffects(ctx,face.effects)}]));
        script.targets=script.splitHalves.left.targets;script.resolve=script.splitHalves.left.resolve;
        if (operation.faces.some(face => hasGenericDivision(face.effects))) {
          const previousPrepare = script.prepareTargets;
          script.prepareTargets = async ctx => {
            if (previousPrepare && await previousPrepare(ctx) === false) return false;
            const choices = ctx.so?.castOpts || {}, selected = operation.faces.filter(face =>
              choices.splitFuse || face.key === (choices.splitHalf || 'left'));
            let offset = 0;
            for (const face of selected) {
              const targets = ctx.targets.slice(offset, offset + face.targets.length);
              if (await prepareGenericDivisions({...ctx,targets}, face.effects, offset) === false) return false;
              offset += face.targets.length;
            }
            return true;
          };
        }
        continue;
      }
      if(operation.kind==='attachment-operation'){
        const child=operation.operation.kind==='mana-source'&&manaUsesStack(operation.operation)?stackManaOperation(operation.operation):operation.operation;
        const condition=operation.condition?{condition:operation.condition,...(operation.conditionSubject?{conditionSubject:operation.conditionSubject}:{})}:{};
        if(operation.grant)attachmentGrants.push({...operation.grant,...condition});
        if(child.kind==='generic-trigger')for(const event of [].concat(child.event))attachmentGrants.push({...condition,grantedOperation:{kind:'trigger',value:compileGenericTrigger({...child,event})}});
        else attachmentGrants.push({...condition,grantedOperation:{kind:child.kind==='mana-source'?'mana':'ability',value:child.kind==='mana-source'?compileGenericMana(child):compileGenericAbility(child)}});
        continue;
      }
      if(operation.kind==='adventure-face'){
        const targets=genericTargetSpecs(operation.targets,operation.effects);
        script.adventure={name:operation.name,cost:operation.cost,altCostStr:operation.cost,types:operation.types.join(' '),speed:operation.types.includes('Instant')?'instant':'sorcery',xCost:operation.cost.includes('{X}'),targets,
          ...(hasGenericDivision(operation.effects)?{prepareTargets:ctx=>prepareGenericDivisions(ctx,operation.effects)}:{}),
          resolve:async ctx=>{await runGenericEffects(ctx,operation.effects);}};
        continue;
      }
      if(operation.kind==='cost-modifier'){
        const units=(game,source,player)=>operation.condition&&!genericCondition(game,source,operation.condition,player)?0:Math.max(0,operation.multiplier?genericCount(game,source,player,operation.multiplier):1);
        const adjustment=(game,source,player)=>{
          const amount=operation.amount*units(game,source,player);
          return operation.reductionCap!==undefined?Math.max(-operation.reductionCap,amount):amount;
        };
        if(operation.self&&operation.coloredReduction){
          const previous=script.selfColoredCostReduction;
          script.selfColoredCostReduction=(game,card,player)=>[...(previous?previous(game,card,player):[]),...Array.from({length:units(game,card,player)},()=>operation.coloredReduction).flat()];
        }
        if(operation.self&&operation.coloredIncrease){
          const previous=script.selfColoredCostIncrease;
          script.selfColoredCostIncrease=(game,card,player)=>[...(previous?previous(game,card,player):[]),...Array.from({length:units(game,card,player)},()=>operation.coloredIncrease).flat()];
        }
        if(operation.targetCondition){
          const filter=genericTargetSpec(operation.targetCondition,[],0).filter;
          if(!script.oracleTargetCostModifiers){script.oracleTargetCostModifiers=[];script.oracleTargetBaseCostAdjust=script.selfTargetCostAdjust;}
          script.oracleTargetCostModifiers.push({amount:operation.amount,filter});
          script.selfTargetCostAdjust=(game,card,player,opts={})=>{
            const total=targets=>(script.oracleTargetBaseCostAdjust?script.oracleTargetBaseCostAdjust(game,card,player,{...opts,targets}):0)+
              script.oracleTargetCostModifiers.reduce((sum,modifier)=>sum+(targets.some(target=>target&&modifier.filter(game,target,player,card))?modifier.amount:0),0);
            if(opts.targets!==undefined)return total(opts.targets.flat());
            const targets=(game.spellTargetSpecs(card,opts,player)||[]).filter(spec=>(spec.count??1)>0).flatMap(spec=>game.legalTargets(spec,card,player));
            // Availability uses a prospective legal target. Actual payment
            // below the target announcement rechecks the chosen objects.
            return targets.length?Math.min(...targets.map(target=>total([target]))):total([]);
          };
        }else if(operation.self){const previous=script.selfCostAdjust;script.selfCostAdjust=(game,card,player,opts)=>(previous?previous(game,card,player,opts):0)+adjustment(game,card,player);}
        else (script.costMods||(script.costMods=[])).push((game,source,info)=>{
          if(operation.controller==='you'&&source.ctrl!==info.player||operation.controller==='opponents'&&source.ctrl===info.player)return 0;
          const card=info.card,castOpts=info.castOpts||{};
          const from=castOpts.from||card.zone;
          if(operation.from&&(operation.from==='not-hand'?from==='hand':from!==operation.from))return 0;
          // Project spell characteristics into the permanent-quality matcher;
          // the real card remains in its casting zone.
          const definition=game.castDefinition(card,castOpts),view=Object.create(card);
          Object.defineProperties(view,{
            zone:{value:'battlefield'},def:{value:definition},cur:{value:null},
            is:{value:type=>game.castHasType(card,castOpts,type)},
            hasSub:{value:type=>!castOpts.faceDownCast&&(castOpts.adventure?type==='Adventure':(definition.subtypes||[]).includes(type)||definition.changeling&&MTG.CREATURE_SUBTYPES?.has(type))},
            colors:{value:castOpts.faceDownCast?[]:castOpts.adventure?MTG.colorsOfCost(definition.adventure?.cost||''):definition.colorsOverride||MTG.colorsOfCost(definition.cost||'')},
            kw:{value:keyword=>!castOpts.faceDownCast&&(definition.kws||[]).includes(keyword)},
            mv:{value:game.stackSpellManaValue({card,castOpts,x:castOpts.x||0})},
          });
          if(!genericTargetSpec(operation.target,[],0).filter(game,view,source.ctrl,source))return 0;
          const generic=adjustment(game,source,source.ctrl);
          return operation.coloredIncrease?{generic,pips:Array.from({length:units(game,source,source.ctrl)},()=>operation.coloredIncrease.map(color=>[color])).flat()}:generic;
        });
        continue;
      }
      if(operation.kind==='characteristic-pt') {
        script.oracleCharacteristicPT=true;
        const value=(game,card)=>genericCount(game,card,card.zone==='battlefield'?card.ctrl:card.owner,operation.count)*operation.multiply+operation.offset;
        if(operation.power)script.cdaPower=value;
        if(operation.toughness)script.cdaToughness=(game,card)=>value(game,card)+operation.toughnessOffset;
        continue;
      }
      if (operation.kind === 'generic-trigger') {
        // Batch 0167's frozen descriptor bound "that land's controller" to
        // the ore-counter event's card (the Aura). Correct only this verified
        // printed clause and exact old shape; keep provenance unchanged.
        const mineOracle = "Enchant land\nThis Aura enters with three ore counters on it.\nAt the beginning of your upkeep and whenever enchanted land becomes tapped, remove an ore counter from this Aura.\nWhen the last ore counter is removed from this Aura, destroy enchanted land and this Aura deals 2 damage to that land's controller.";
        const mineTrigger = {kind:'generic-trigger',event:'countersRemoved',eventFilter:{kind:'v8-event',subject:'self',counter:'ore',zeroRemaining:true},effects:[{action:'destroy',target:'attached-host'},{action:'damage',target:'event-card-controller',n:2}],targets:[],optional:false,contract:'generic-trigger-effect'};
        const repaired = entry.oracleId==='a6bfa03e-6317-4550-960b-fbd2a30e521f' && entry.raw.oracle===mineOracle && JSON.stringify(operation)===JSON.stringify(mineTrigger);
        const runtimeOperation = repaired ? {...operation,effects:[operation.effects[0],{...operation.effects[1],target:'attached-host-controller'}]} : operation;
        if(repaired)script.oracleRuntimeRepairs=['orcish-mine-attached-controller'];
        for(const event of Array.isArray(runtimeOperation.event)?runtimeOperation.event:[runtimeOperation.event])triggers.push(compileGenericTrigger({...runtimeOperation,event}));
        continue;
      }
      if (operation.kind === 'generic-ability') {
        const compiled=compileGenericAbility(operation);
        if(operation.from==='hand')script.handAbility={...compiled,cost:compiled.cost.mana||'{0}',...(operation.forecast?{oracleForecast:true,oracleForecastTap:compiled.cost.tapPermanents}:{})};
        else if(operation.from==='graveyard')script.gyAbility={...compiled,cost:operation.cost.mana||'{0}',exileSelf:!operation.retainGraveSource,...(operation.retainGraveSource?{extraCost:compiled.cost}:{})};
        else abilities.push(compiled);
        continue;
      }
      if (operation.kind === 'generic-static') {
        if(operation.scope==='self'&&operation.keywords?.includes('flash'))
          (script.oracleSelfFlashConditions||(script.oracleSelfFlashConditions=[])).push(operation.condition||null);
        // Frozen early rows expanded modified into counters/enchanted/equipped,
        // losing the Aura-controller restriction. Repair only that exact
        // printed static clause; the stored provenance descriptor stays intact.
        const legacyModified={kind:'any',conditions:[{kind:'source-any-counter'},{kind:'source-status',status:'enchanted'},{kind:'source-status',status:'equipped'}]};
        const modifiedClause=/\bas long as (?:it's|this creature is) modified\b/i.test(entry.raw.oracle||'');
        const runtimeOperation=modifiedClause&&JSON.stringify(operation.condition)===JSON.stringify(legacyModified)?{...operation,condition:{kind:'source-modified'}}:operation;
        const staticLayer=compileGenericStatic(runtimeOperation);
        staticLayer.oracleOperation=operation;
        statics.push(staticLayer);
        continue;
      }
      if (operation.kind === 'enters-with-counters') {
        if(operation.tapped)script.entersTapped=true;
        if (script.etbCounters) throw new Error(entry.raw.name + ': multiple enters-with-counters operations need explicit semantics');
        script.etbCounters = {
          kind: operation.counter,
          n: operation.condition || typeof operation.n==='object' ? (game,card)=>(!operation.condition||genericCondition(game,card,operation.condition))?genericAmount(operation.n,{g:game,src:card,you:card.ctrl}):0 : operation.n === 'X'
            ? (game, card) => Math.max(0, Number(card.castMeta && card.castMeta.x) || 0)
            : Number(operation.n) || 0,
        };
        continue;
      }
      if (operation.kind === 'doesnt-untap') {
        statics.push({ apply: (game, self) => { self.cur.cantUntap = true; } });
        continue;
      }
      if (operation.kind === 'mana-source') {
        if(manaUsesStack(operation))abilities.push(compileGenericAbility(stackManaOperation(operation)));
        else mana.push(compileGenericMana(operation,'oracle-'+mana.length));
        continue;
      }
      if (operation.kind === 'enters-tapped') {
        script.entersTapped = true;
        continue;
      }
      if(operation.kind==='chosen-color-entry-v8'){
        if(!operation.colors?.length||operation.colors.some(color=>!COLORS.includes(color)))throw new Error('Invalid chosen-color entry');
        const prior=script.asEnters;
        script.asEnters=async(game,card)=>{
          await prior?.(game,card);
          const choice=await card.ctrl.controller.decide(game,{type:'chooseOption',prompt:card.name+': choose a color',options:operation.colors.map(color=>({key:color,label:color})),aiHint:{kind:'manaColor',card}});
          card.meta.oracleChosenColor=operation.colors.includes(choice)?choice:operation.colors[0];
        };
        if(operation.tapped)script.entersTapped=true;
        continue;
      }
      if(operation.kind==='chosen-color-mana-v8'){
        if(!Number.isInteger(operation.n)||operation.n<1||operation.n>4)throw new Error('Invalid chosen mana amount');
        mana.push({cost:{tap:true},possibleProduce:COLORS.map(color=>({[color]:operation.n})),produce:(_game,card)=>[
          ...(operation.fixed?[{[operation.fixed]:1}]:[]),
          ...(COLORS.includes(card.meta.oracleChosenColor)?[{[card.meta.oracleChosenColor]:operation.n}]:[])
        ],...(operation.landAbilities?{manual:true,restrictAbilities:true,restrict:(_game,action)=>!!action?.isAbility&&!!action.card?.is('Land')}:{} )});
        continue;
      }
      if (operation.kind === 'conditional-enters-tapped') {
        if (script.entersTapped) {
          throw new Error(entry.raw.name + ': multiple enters-tapped contracts need explicit composition');
        }
        script.entersTapped = async (game, card) => {
          const player = card.ctrl;
          if(operation.condition==='generic')return !genericCondition(game,card,operation.untappedCondition);
          if (operation.condition === 'other-land-count') {
            const count = game.lands(player).filter(land => land !== card).length;
            const untapped = operation.comparison === 'more'
              ? count >= operation.threshold
              : count <= operation.threshold;
            return !untapped;
          }
          if (operation.condition === 'life-at-most') {
            const players = operation.anyPlayer ? game.alivePlayers() : [player];
            return !players.some(candidate => candidate.life <= operation.threshold);
          }
          if (operation.condition === 'opponents-at-least') {
            return player.opponents(game).length < operation.threshold;
          }
          if (operation.condition === 'pay-life') {
            if (player.life < operation.life) return true;
            const choice = await player.controller.decide(game, {
              type: 'chooseOption',
              prompt: 'Pay ' + operation.life + ' life so ' + card.name + ' enters untapped?',
              options: [{ key: 'pay', label: 'Pay ' + operation.life + ' life' }, { key: 'tapped', label: 'Enter tapped' }],
              aiHint: { kind: 'payLifeForUntappedLand', card, life: operation.life },
            });
            if (choice !== 'pay') return true;
            await game.loseLife(player, operation.life, card.name + ' entry cost');
            return false;
          }
          throw new Error('Unknown conditional Oracle land entry: ' + operation.condition);
        };
        continue;
      }
      if (operation.kind === 'cant-block') {
        statics.push({ apply: (game, self) => { self.cur.cantBlock = true; } });
        continue;
      }
      if (operation.kind === 'must-attack') {
        script.mustAttack = true;
        continue;
      }
      if (operation.kind === 'must-be-blocked') {
        statics.push({ apply: (game, self) => { self.cur.mustBeBlocked = true; } });
        continue;
      }
      if (operation.kind === 'lure') {
        statics.push({ apply: (game, self) => { self.cur.lure = true; } });
        continue;
      }
      if (operation.kind === 'unblockable') {
        statics.push({ apply: (game, self) => { self.cur.unblockable = true; } });
        continue;
      }
      if (operation.kind === 'flying-blocker-only') {
        statics.push({ apply: (game, self) => { self.cur.blockOnlyFlying = true; } });
        continue;
      }
      if (operation.kind === 'protection-from') {
        const color = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' }[operation.from];
        statics.push({
          apply: (game, self) => {
            self.cur.protectionFrom.push((currentGame, source) => !!source &&
              (operation.from === 'artifacts' ? source.is && source.is('Artifact') : source.colors && source.colors.includes(color)));
          },
        });
        continue;
      }
      if (operation.kind === 'cycling') {
        script.cycling = { cost: operation.cost };
        continue;
      }
      if (operation.kind === 'self-pump-ability') {
        abilities.push({
          label: `${operation.power >= 0 ? '+' : ''}${operation.power}/${operation.toughness >= 0 ? '+' : ''}${operation.toughness}`,
          cost: { mana: operation.cost },
          aiScore: (game, source) => {
            const canAttack = game.turnPlayer === source.ctrl && game.phase === 'main1' &&
              (!source.sick || source.kw('haste')) && !source.tapped && !source.cur.cantAttack;
            const inCombat = !!source.attacking || source.blocking !== null && source.blocking !== undefined && source.blocking !== false;
            const toughnessLeft = Number(source.toughness || 0) - Number(source.damage || 0);
            if (Number(operation.toughness || 0) < 0 && toughnessLeft + Number(operation.toughness) <= 0) return -30;
            return canAttack || inCombat ? 4 : -30;
          },
          run: async ctx => {
            if (!sameBattlefieldSource(ctx)) return;
            MTG.E.pumpUntilEOT(ctx.g, ctx.src, operation.power, operation.toughness);
            await ctx.g.checkSBA();
          },
        });
        continue;
      }
      if (operation.kind === 'self-regenerate-ability') {
        abilities.push({
          label: 'Regenerate', cost: { mana: operation.cost },
          aiScore: (game, source) => {
            if (Number(source.regenShield || 0) > 0) return -30;
            const top = game.stack[game.stack.length - 1];
            const targeted = top && top.ctrl !== source.ctrl && (top.targets || []).flat().includes(source);
            const hostileOracle = String(top && top.card && top.card.def && top.card.def.oracle || '').toLowerCase();
            const globalDanger = top && top.ctrl !== source.ctrl &&
              /destroy all creatures|damage to each creature/.test(hostileOracle);
            const combatDanger = (!!source.attacking || source.blocking !== null && source.blocking !== undefined && source.blocking !== false) &&
              Number(source.damage || 0) > 0;
            return targeted || globalDanger || combatDanger ? 14 : -30;
          },
          run: async ctx => { if (sameBattlefieldSource(ctx)) ctx.src.regenShield += 1; },
        });
        continue;
      }
      if (operation.kind === 'self-keyword-ability') {
        abilities.push({
          label: `Gain ${operation.keyword}`, cost: { mana: operation.cost },
          aiScore: (game, source) => {
            const keyword = String(operation.keyword || '').toLowerCase();
            if (source.kw(keyword)) return -30;
            const top = game.stack[game.stack.length - 1];
            const targeted = top && top.ctrl !== source.ctrl && (top.targets || []).flat().includes(source);
            if (['shroud', 'hexproof', 'indestructible'].includes(keyword)) return targeted ? 14 : -30;
            if (keyword === 'haste') {
              return game.turnPlayer === source.ctrl && game.phase === 'main1' && source.sick && !source.tapped ? 6 : -30;
            }
            const canAttack = game.turnPlayer === source.ctrl && game.phase === 'main1' &&
              (!source.sick || source.kw('haste')) && !source.tapped && !source.cur.cantAttack;
            const inCombat = !!source.attacking || source.blocking !== null && source.blocking !== undefined && source.blocking !== false;
            const canDefend = game.turnPlayer !== source.ctrl && game.phase === 'combat' && !source.tapped;
            return canAttack || inCombat || canDefend ? 4 : -30;
          },
          run: async ctx => {
            if (sameBattlefieldSource(ctx)) MTG.E.grantUntilEOT(ctx.g, ctx.src, [operation.keyword]);
          },
        });
        continue;
      }
      if(operation.kind==='mechanic-ascend'){
        script.oracleAscend=true;
        continue;
      }
      if (operation.kind.startsWith('mechanic-')) {
        if(operation.kind==='mechanic-conditional-alternative'){
          (script.altCosts||(script.altCosts=[])).push({label:'Conditional free cast',free:true,oracleConditional:true,cond:(game,player,card)=>genericCondition(game,card,operation.condition)});continue;
        }
        if (MTG.applyOracleMechanic && MTG.applyOracleMechanic(script, operation)) continue;
        const mechanic = operation.kind.slice('mechanic-'.length);
        if (mechanic === 'flashback') {
          script.flashback = {
            cost: operation.cost,
            altCostStr: operation.cost,
            speed: operation.speed,
          };
        } else if (mechanic === 'suspend') {
          script.suspend = { cost: operation.cost, n: operation.n };
        } else if (mechanic === 'morph' || mechanic === 'disguise') {
          script[mechanic] = operation.cost;
        } else if (mechanic === 'devoid') {
          script.colorsOverride = [];
        } else if (mechanic === 'uncounterable') {
          script.uncounterable = true;
        } else script[mechanic] = true;
        continue;
      }
      if (operation.kind === 'etb-draw') {
        triggers.push({
          on: 'etb',
          desc: 'Draw ' + operation.n,
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.draw(ctx.you, operation.n); },
        });
        continue;
      }
      if (operation.kind === 'etb-life-gain') {
        triggers.push({
          on: 'etb',
          desc: 'Gain ' + operation.n + ' life',
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.gainLife(ctx.you, operation.n, ctx.src); },
        });
        continue;
      }
      if (operation.kind === 'dies-draw') {
        triggers.push({
          on: 'dies',
          desc: 'Draw ' + operation.n,
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.draw(ctx.you, operation.n); },
        });
        continue;
      }
      if (operation.kind === 'etb-loot') {
        triggers.push({
          on: 'etb', desc: operation.order === 'draw-discard' ? 'Draw, then discard' : 'Discard, then draw',
          filter: (game, self, data) => data.card === self,
          run: async ctx => {
            if (operation.order === 'draw-discard') await ctx.g.draw(ctx.you, 1, ctx.src);
            if (!ctx.you.hand.length) return;
            const cards = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseCards', from: ctx.you.hand,
              min: operation.optional ? 0 : 1, max: 1,
              prompt: operation.optional ? 'You may discard a card' : 'Discard a card',
              aiHint: { kind: operation.optional ? 'optionalLoot' : 'cleanupDiscard', card: ctx.src },
            });
            const chosen = Array.isArray(cards) ? cards.filter(card => ctx.you.hand.includes(card)).slice(0, 1) : [];
            if (!chosen.length) return;
            await ctx.g.discard(ctx.you, chosen);
            if (operation.order === 'discard-draw') await ctx.g.draw(ctx.you, 1, ctx.src);
          },
        });
        continue;
      }
      if (operation.kind === 'etb-treasure') {
        triggers.push({
          on: 'etb', desc: 'Create Treasure',
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you, { n: operation.n }); },
        });
        continue;
      }
      if (operation.kind === 'etb-each-opponent-discard') {
        triggers.push({
          on: 'etb', desc: 'Each opponent discards',
          filter: (game, self, data) => data.card === self,
          run: async ctx => {
            const choices = [];
            for (const player of ctx.g.alivePlayers().filter(player => player !== ctx.you && player.hand.length)) {
              const cards = await player.controller.decide(ctx.g, {
                type: 'chooseCards', from: player.hand, min: 1, max: 1,
                prompt: 'Discard a card', aiHint: { kind: 'cleanupDiscard' },
              });
              const chosen = Array.isArray(cards) ? cards.find(card => player.hand.includes(card)) : null;
              if (chosen) choices.push({ player, card: chosen });
            }
            await ctx.g.withGraveyardEntryBatch(async () => {
              for (const choice of choices) await ctx.g.discard(choice.player, [choice.card]);
            });
          },
        });
        continue;
      }
      if (operation.kind === 'dies-life-gain') {
        triggers.push({
          on: 'dies', desc: 'Gain ' + operation.n + ' life',
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.gainLife(ctx.you, operation.n, ctx.src); },
        });
        continue;
      }
      if (operation.kind === 'noncreature-cast-counter-self') {
        triggers.push({
          on: 'castNonCreature', desc: 'Put a counter on this creature',
          filter: (game, self, data) => data.player === self.ctrl,
          run: async ctx => {
            // "This creature" means the exact battlefield object that
            // triggered. CardInst is reused after zone changes, so a source
            // that died or blinked must not receive the counter in its new
            // zone/object state when the old trigger resolves.
            if (ctx.src.zone !== 'battlefield' ||
                ctx.src.zoneVersion !== ctx.sourceZoneVersion ||
                !ctx.g.bf().includes(ctx.src)) return;
            ctx.g.addCounters(ctx.src, operation.counter, operation.n, false, ctx.you);
          },
        });
        continue;
      }
      if (operation.kind === 'etb-scry' || operation.kind === 'etb-surveil') {
        triggers.push({
          on: 'etb',
          desc: (operation.kind === 'etb-scry' ? 'Scry ' : 'Surveil ') + operation.n,
          filter: (game, self, data) => data.card === self,
          run: async ctx => {
            if (operation.kind === 'etb-scry') await MTG.E.scry(ctx.g, ctx.you, operation.n);
            else await MTG.E.surveil(ctx.g, ctx.you, operation.n);
          },
        });
        continue;
      }
      if (operation.kind === 'etb-token') {
        const token = operation.token;
        const tokenDef = {
          name: token.name,
          cost: null,
          super: (token.super || []).slice(),
          types: (token.types || ['Creature']).slice(),
          subtypes: (token.subtypes || []).slice(),
          power: String(token.power),
          toughness: String(token.toughness),
          oracle: '',
          kws: (token.keywords || []).slice(),
          colorsOverride: (token.colors || []).slice(),
          isTokenDef: true,
        };
        triggers.push({
          on: 'etb',
          desc: 'Create ' + operation.n + ' ' + token.name,
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.makeTokens(tokenDef, ctx.you, { n: operation.n }); },
        });
        continue;
      }
      if (operation.kind === 'etb-counter-self') {
        triggers.push({
          on: 'etb', desc: `Put ${operation.counter} counter`,
          filter: (game, self, data) => data.card === self,
          run: async ctx => {
            if (sameBattlefieldSource(ctx)) {
              ctx.g.addCounters(ctx.src, operation.counter, operation.n, false, ctx.you);
            }
          },
        });
        continue;
      }
      if (operation.kind === 'attack-self-pump') {
        triggers.push({
          on: 'attacks', desc: 'Attack pump',
          filter: (game, self, data) => data.card === self,
          run: async ctx => {
            if (!sameBattlefieldSource(ctx)) return;
            MTG.E.pumpUntilEOT(ctx.g, ctx.src, operation.power, operation.toughness);
          },
        });
        continue;
      }
      if (operation.kind === 'combat-damage-draw') {
        triggers.push({
          on: 'combatDamageToPlayer', desc: 'Combat damage draw',
          filter: (game, self, data) => data.card === self,
          run: async ctx => { await ctx.g.draw(ctx.you, operation.n); },
        });
        continue;
      }
      if (operation.kind === 'equipment-equip') {
        script.equip = operation.cost;
        continue;
      }
      if (operation.kind === 'crew') {
        script.crew = operation.n;
        continue;
      }
      if (operation.kind === 'aura-target') {
        const own = operation.what === 'creature you control';
        const what = own ? 'creature' : operation.what;
        const restrictsHost = declaredAttachmentGrants.some(grant =>
          grant.skipUntap || grant.cantAttack || grant.cantBlock || grant.activationDisabled);
        const negativeStats = declaredAttachmentGrants.some(grant =>
          Number(grant.power || 0) < 0 || Number(grant.toughness || 0) < 0);
        const positiveStats = declaredAttachmentGrants.some(grant =>
          Number(grant.power || 0) > 0 || Number(grant.toughness || 0) > 0 || (grant.keywords || []).length);
        const goal = entry.implementation.some(op=>op.kind==='aura-control-v8')?'control':own || (!restrictsHost && !negativeStats) ? 'buff'
          : !restrictsHost && negativeStats && positiveStats ? 'mixedPump' : 'removal';
        const spec = permanentSpec(what, 'Choose what this Aura enchants', goal, {
          controller: own ? 'you' : 'any',
        });
        if (goal === 'mixedPump') {
          const grant = declaredAttachmentGrants.find(candidate =>
            Number(candidate.power || 0) !== 0 || Number(candidate.toughness || 0) !== 0) || {};
          Object.assign(spec.aiHint, {
            power: Number(grant.power || 0),
            toughness: Number(grant.toughness || 0),
          });
        }
        script.auraTarget = [spec];
        continue;
      }
      if (operation.kind === 'attachment-grant') {
        attachmentGrants.push(operation);
        continue;
      }
      if (operation.kind === 'aura-etb-tap') {
        triggers.push({
          on: 'etb', desc: 'Tap enchanted creature',
          filter: (game, self, data) => data.card === self,
          run: async ctx => {
            const host = ctx.g.byIid(ctx.sourceAttachedTo);
            if (host && host.zone === 'battlefield' &&
                host.zoneVersion === ctx.sourceAttachedToZoneVersion) ctx.g.tap(host);
          },
        });
        continue;
      }
      if (operation.kind === 'controlled-creature-pump-static' || operation.kind === 'attacking-creature-pump-static') {
        statics.push({
          apply: (game, self, battlefield) => {
            for (const card of battlefield) {
              if (card.ctrl !== self.ctrl || !card.is('Creature')) continue;
              if (operation.kind === 'attacking-creature-pump-static' && !card.attacking) continue;
              card.cur.power += operation.power;
              card.cur.toughness += operation.toughness;
            }
          },
        });
        continue;
      }
      if (operation.kind === 'global-creature-keyword-static') {
        statics.push({
          apply: (game, self, battlefield) => {
            for (const card of battlefield) if (card.is('Creature')) card.cur.kw.add(operation.keyword);
          },
        });
        continue;
      }
      if (operation.kind.startsWith('spell-')) {
        if(operation.overload)(script.altCosts||=[]).push({label:'Overload '+operation.overload,altCostStr:operation.overload,overloaded:true});
        const fragment = compileSpell(operation);
        if (operation.kind === 'spell-v4' || operation.kind === 'spell-modal-generic') {
          if (spellV4Fragment || spellFragments.length) {
            throw new Error(batch.id + '/' + entry.raw.name + ': spell-v4 cannot mix with legacy spell effect fragments');
          }
          spellV4Fragment = fragment;
          continue;
        }
        if (spellV4Fragment) {
          throw new Error(batch.id + '/' + entry.raw.name + ': legacy spell effect cannot follow spell-v4');
        }
        fragment.oracleOperation = operation;
        fragment.targetOffset = spellFragments.reduce((sum, existing) => sum + (existing.targets || []).length, 0);
        spellFragments.push(fragment);
        continue;
      }
      throw new Error(batch.id + '/' + entry.raw.name + ': unknown Oracle implementation ' + operation.kind);
    }
    // CR 305.6: basic land subtypes confer their mana ability even when
    // Scryfall prints it only as reminder text, outside the compiled rules.
    if ((entry.raw.types || []).includes('Land')) {
      for (const [subtype, color] of Object.entries({ Plains:'W', Island:'U', Swamp:'B', Mountain:'R', Forest:'G' })) {
        if (!(entry.raw.subtypes || []).includes(subtype)) continue;
        const alreadyPresent = mana.some(ability => !ability.cond && !ability.restrict && !ability.after &&
          ability.cost?.tap && Object.keys(ability.cost).length === 1 && Array.isArray(ability.produce) &&
          ability.produce.some(option => option[color] === 1 && Object.keys(option).length === 1));
        if (!alreadyPresent) mana.push({ key:'basic-'+subtype, cost:{tap:true}, produce:[{[color]:1}] });
      }
    }
    if (mana.length) {
      script.mana = mana.length === 1 ? mana[0] : mana;
      const colors = new Set();
      for (const source of mana) {
        for (const option of typeof source.produce==='function'?source.possibleProduce:source.produce) {
          if (option.ANY) COLORS.forEach(color => colors.add(color));
          else Object.keys(option).filter(color => COLORS.includes(color)).forEach(color => colors.add(color));
        }
      }
      script.producesColors = [...colors];
    }
    if (triggers.length) script.triggers = [...(script.triggers || []), ...triggers];
    if (statics.length) script.statics = [...(script.statics || []), ...statics];
    if (abilities.length) script.abilities = [...(script.abilities || []), ...abilities];
    if (attachmentGrants.length) {
      script.oracleAttachmentGrants=attachmentGrants;
      script.attachGrant = (game, self, host) => {
        for (const grant of self.def.oracleAttachmentGrants||attachmentGrants) {
          if(grant.condition&&!genericCondition(game,grant.conditionSubject==='affected'?host:self,grant.condition,self.ctrl))continue;
          const multiplier=grant.multiplier?.kind==='host-colors'?host.colors.length:grant.multiplier?genericCount(game,grant.multiplierSubject==='affected'?host:self,self.ctrl,grant.multiplier):1;
          host.cur.power += (grant.power || 0)*multiplier;
          host.cur.toughness += (grant.toughness || 0)*multiplier;
          for (const keyword of grant.keywords || []) host.cur.kw.add(keyword);
          for (const keyword of grant.removeKeywords || []) host.cur.kw.delete(keyword);
          if(grant.grantedOperation){const {kind,value}=grant.grantedOperation;host.cur[kind==='trigger'?'extraTriggers':kind==='mana'?'extraMana':'extraAbilities'].push(value);}
          applyGenericCombatRestriction(game,host,grant,self.ctrl);
          if (grant.skipUntap) host.cur.cantUntap = true;
        }
      };
    }
    if (spellFragments.length) {
      script.targets = spellFragments.flatMap(fragment => fragment.targets || []);
      if (spellFragments.some(fragment => fragment.prepareTargets)) {
        const existingPrepare = script.prepareTargets;
        script.prepareTargets = async ctx => {
          if (existingPrepare && await existingPrepare(ctx) === false) return false;
          for (const fragment of spellFragments) {
            const targets = (ctx.targets || []).slice(fragment.targetOffset, fragment.targetOffset + (fragment.targets || []).length);
            if (fragment.prepareTargets && await fragment.prepareTargets({...ctx,targets,oracleTargetOffset:fragment.targetOffset}) === false) return false;
          }
          return true;
        };
      }
      script.resolve = async ctx => {
        try {
          for (let index = 0; index < spellFragments.length; index++) {
            ctx.oracleMandatoryDrawReserve = spellFragments.slice(index + 1).reduce((sum, fragment) => {
              const operation = fragment.oracleOperation || {};
              if (operation.kind === 'spell-draw') return sum + Math.max(0, Number(operation.n) || 0);
              if (operation.kind === 'spell-draw-discard') return sum + Math.max(0, Number(operation.draw) || 0);
              return sum;
            }, 0);
            const fragment = spellFragments[index];
            const localTargets = (ctx.targets || []).slice(fragment.targetOffset,
              fragment.targetOffset + (fragment.targets || []).length);
            await fragment.run(fragment.prepareTargets ? {...ctx,oracleTargetOffset:fragment.targetOffset} : ctx, localTargets);
          }
        } finally {
          delete ctx.oracleMandatoryDrawReserve;
        }
      };
    }
    if (spellV4Fragment) {
      const existingCastCond = script.castCond;
      const existingPrepareTargets = script.prepareTargets;
      Object.assign(script, spellV4Fragment);
      if (existingCastCond && spellV4Fragment.castCond) {
        script.castCond = (...args) => existingCastCond(...args) && spellV4Fragment.castCond(...args);
      }
      if (existingPrepareTargets && spellV4Fragment.prepareTargets) {
        script.prepareTargets = async ctx => {
          if (await existingPrepareTargets(ctx) === false) return false;
          return spellV4Fragment.prepareTargets(ctx);
        };
      }
    }
    MTG.OracleV8Awaken.finish(script);
    if(script.oracleAscend&&entry.raw.types.some(type=>type==='Instant'||type==='Sorcery')){
      const resolve=script.resolve;
      script.resolve=async ctx=>{ctx.g.grantCityBlessing(ctx.you);await resolve?.(ctx);};
    }
    if(script.entwine){
      const modes=script.modes;
      const pick=modes?.pick==='any'?{min:modes.min??1,max:modes.list?.length}: {min:modes?.pick,max:modes?.pick};
      if(!modes||modes.repeats||!Array.isArray(modes.list)||modes.list.length!==script.entwine.modeCount||
        pick.min!==script.entwine.printedChoice.min||pick.max!==script.entwine.printedChoice.max)
        throw new Error(batch.id+'/'+entry.raw.name+': entwine requires its exact compiled modal spell');
    }
    return script;
  }

  MTG.registerOracleBatch = function (batch) {
    if (!batch || !batch.id || !Array.isArray(batch.cards)) {
      throw new Error('Oracle batch needs an id and cards array.');
    }
    if (batches.some(existing => existing.id === batch.id)) {
      throw new Error(`Duplicate Oracle batch id: ${batch.id}`);
    }

    for (const entry of batch.cards) {
      const name = entry && entry.raw && entry.raw.name;
      if (!name || !entry.oracleId || !entry.semanticClass) {
        throw new Error(`${batch.id}: every Oracle card needs name, oracleId, and semanticClass.`);
      }
      if (registeredNames.has(name)) {
        throw new Error(`${name} is already registered by ${registeredNames.get(name)}.`);
      }
      if (MTG.SCRIPTS[name]) {
        throw new Error(`${name} already has a manual engine script; Oracle batches never overwrite it.`);
      }

      registeredNames.set(name, batch.id);
      MTG.SCRIPTS[name] = compileOracleScript(batch, entry);
    }

    batches.push(batch);
  };

  MTG.applyOracleBatches = function (rawDB) {
    if (!rawDB || !rawDB.cards) throw new Error('Oracle batches need MTG raw card data.');
    const applied = new Set(rawDB.oracleBatches || []);
    for (const batch of batches) {
      for (const entry of batch.cards) {
        const raw = entry.raw;
        const existing = rawDB.cards[raw.name];
        if (existing) {
          if (existing._oracleId === entry.oracleId) continue;
          throw new Error(`${batch.id}: ${raw.name} collides with an existing raw definition.`);
        }
        rawDB.cards[raw.name] = Object.assign({}, raw, {
          _oracleBatch: batch.id,
          _oracleId: entry.oracleId,
          _scryfallId: entry.scryfallId,
        });
      }
      applied.add(batch.id);
    }
    rawDB.oracleBatches = [...applied];
    return rawDB;
  };

  function typeLine(raw) {
    const left = [...(raw.super || []), ...(raw.types || [])].join(' ');
    return `${left}${(raw.subtypes || []).length ? ` — ${raw.subtypes.join(' ')}` : ''}`;
  }

  MTG.buildCardCatalog = function (rawDB, defs) {
    const imported = new Map();
    for (const batch of batches) {
      for (const entry of batch.cards) imported.set(entry.raw.name, { batch, entry });
    }
    // Legacy raw data also contains cards from decks that are deliberately not
    // exposed by the current client. Those definitions are useful to active
    // deck scripts, but their mere presence is not proof that an arbitrary
    // imported deck can safely use them. Only cards exercised by an active
    // built-in deck, or cards from a certified Oracle batch, are importable.
    const activeDeckCards = new Set();
    for (const deck of Object.values(MTG.DECKS || {})) {
      for (const row of deck && deck.cards || []) {
        if (row && row.name) activeDeckCards.add(row.name);
      }
    }

    const catalog = {};
    for (const [name, raw] of Object.entries(rawDB.cards || {})) {
      const found = imported.get(name);
      const def = defs && defs[name];
      const metadata = found ? found.entry.catalog || {} : {};
      catalog[name] = Object.assign({
        name,
        oracleId: raw._oracleId || null,
        scryfallId: raw._scryfallId || null,
        manaCost: raw.cost || '',
        typeLine: metadata.typeLine || typeLine(raw),
        oracleText: raw.oracle || '',
        colorIdentity: metadata.colorIdentity || (MTG.cardColorIdentity && def ? MTG.cardColorIdentity(def) : raw._ci || []),
        keywords: metadata.keywords || [],
        commanderLegality: metadata.commanderLegality || null,
        set: metadata.set || null,
        setName: metadata.setName || null,
        collectorNumber: metadata.collectorNumber || null,
        rarity: metadata.rarity || null,
        releasedAt: metadata.releasedAt || null,
        engineStatus: found ? 'certified' : 'certified-legacy',
        deckImportEligible: !!found || activeDeckCards.has(name),
        engineBatch: found ? found.batch.id : null,
        semanticClass: found ? found.entry.semanticClass : 'manual',
        implementedKeywords: found ? (found.entry.implementedKeywords || []).slice() : [],
        oracleContracts: found ? (found.entry.oracleContracts || []).slice() : [],
        implementationKinds: found ? (found.entry.implementation || []).map(operation => operation.kind) : [],
      }, metadata);
    }
    MTG.CARD_CATALOG = catalog;
    return catalog;
  };
  MTG.OracleV8PredefinedTokens?.initialize({inline:genericInlineToken});
})();
