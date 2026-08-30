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

  function genericAmount(value, ctx) {
    if (value?.kind === 'event-card-stat') {
      const card = ctx.data?.card;
      const source = ctx.data?.snap || (card?.zone === 'battlefield' && card.zoneVersion === ctx.eventCardZoneVersion
        ? card : card?.battlefieldLKI?.get(ctx.eventCardZoneVersion));
      return Math.max(0, Number(source?.[value.stat]) || 0);
    }
    if(value?.kind==='source-stat') {
      const source=sameBattlefieldSource(ctx)?ctx.src:ctx.data?.card===ctx.src&&ctx.data.snap?ctx.data.snap:ctx.src?.battlefieldLKI?.get(ctx.sourceZoneVersion);
      return Math.max(0,Number(source?.[value.stat])||0);
    }
    if(value?.kind==='event-amount')return Math.max(0,Number(ctx.data?.n)||0);
    if (value && typeof value === 'object' && value.kind === 'count') {
      return genericCount(ctx.g,ctx.src,ctx.you,value) * (value.multiply ?? 1);
    }
    if (value !== 'X') return Math.max(0, Number(value) || 0);
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
    if (normalized === 'creature or land') return card.is('Creature') || card.is('Land');
    if (normalized === 'basic land') return card.is('Land') && (card.def.super || []).includes('Basic');
    if (normalized === 'creature or planeswalker') return card.is('Creature') || card.is('Planeswalker');
    if (normalized === 'instant or sorcery') return card.is('Instant') || card.is('Sorcery');
    return card.is(normalized.charAt(0).toUpperCase() + normalized.slice(1));
  }

  function genericTargetHint(target, effects, index) {
    const matching = (effects || []).filter(candidate => candidate.target === index || candidate.who === index);
    if(matching.some(effect=>effect.action==='damage')&&matching.some(effect=>effect.action==='tap'))return {goal:'tap'};
    const effect = matching.find(candidate => candidate.action === 'counter' && candidate.counter === 'stun') || matching[0];
    if (!effect) return null;
    if (effect.action === 'destroy' || effect.action === 'exile') {
      return { goal: 'removal', removalKind: effect.action };
    }
    if (effect.action === 'damage' || effect.action === 'lose-life') {
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
    if (effect.action === 'counter') {
      const harmful = effect.counter === '-1/-1' || effect.counter === 'stun';
      return { goal: harmful ? 'removal' : 'buff' };
    }
    if (effect.action === 'cant-block-until-eot') return { goal: 'debuff' };
    if (effect.action === 'pump') {
      const power = Number(effect.power || 0);
      const toughness = Number(effect.toughness || 0);
      const mixed = power > 0 && toughness < 0;
      const beneficial = power >= 0 && toughness >= 0;
      return {
        goal: mixed ? 'mixedPump' : beneficial ? 'buff' : 'debuff',
        power, toughness, keywords: (effect.keywords || []).slice(), untilEOT: true,
      };
    }
    return null;
  }

  function genericTargetSpec(target, effects, index, eventData) {
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
      count: target.max === undefined ? 1 : target.max,
    };
    if (spec.min === 0) spec.upTo = true;
    if (zone === 'graveyard' && target.controller !== 'you') spec.anyGraveyard = true;
    const defendingPlayer = eventData && eventData.defender
      ? (eventData.defender instanceof MTG.Player ? eventData.defender : eventData.defender.ctrl)
      : null;
    spec.filter = (game, candidate, controller, source) => {
      if (target.excludeSelf && candidate === source) return false;
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
      if(target.color) {
        const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
        if(colors[target.color]&&!candidate.colors.includes(colors[target.color]))return false;
        if(target.color==='colorless'&&candidate.colors.length!==0)return false;
        if(target.color==='multicolored'&&candidate.colors.length<2)return false;
        if(target.color==='monocolored'&&candidate.colors.length!==1)return false;
      }
      if (target.withKeyword && !candidate.kw(target.withKeyword)) return false;
      if (target.withoutKeyword && candidate.kw(target.withoutKeyword)) return false;
      if (target.stat) {
        const value = Number(candidate[target.stat]);
        if (target.comparison === 'less' ? value > target.threshold : value < target.threshold) return false;
      }

      if (target.controller === 'you') {
        const subjectController = candidate instanceof MTG.Player ? candidate :
          (candidate.zone === 'battlefield' ? candidate.ctrl : candidate.owner);
        if (subjectController !== controller) return false;
      } else if (target.controller === 'opponent') {
        const subjectController = candidate instanceof MTG.Player ? candidate :
          (candidate.zone === 'battlefield' ? candidate.ctrl : candidate.owner);
        if (subjectController === controller) return false;
      } else if (target.controller === 'defending-player') {
        if (!defendingPlayer || candidate instanceof MTG.Player || candidate.ctrl !== defendingPlayer) return false;
      }
      return true;
    };
    const hint = genericTargetHint(target, effects, index);
    if (hint) spec.aiHint = hint;
    return spec;
  }

  function genericTargetSpecs(targets, effects, eventData) {
    return (targets || []).map((target, index) => genericTargetSpec(target, effects, index, eventData));
  }

  function genericTriggerFilter(event, eventFilter) {
    if(eventFilter==='self-source')return (game,self,data)=>data.src===self;
    if(eventFilter?.kind==='your-filtered-cast')return (game,self,data)=>{
      if(data.player!==self.ctrl||!data.card)return false;
      const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'},what=eventFilter.what;
      if(colors[what])return data.card.colors.includes(colors[what]);
      if(what==='multicolored')return data.card.colors.length>1;
      if(what==='colorless')return data.card.colors.length===0;
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

  function genericEffectSubjects(ctx, reference) {
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

  async function genericDiscard(ctx, player, n) {
    if (!player || player.lost) return;
    n = Math.min(genericAmount(n, ctx), player.hand.length);
    if (!n) return;
    const cards = await player.controller.decide(ctx.g, {
      type: 'chooseCards', from: player.hand, min: n, max: n,
      prompt: 'Discard ' + n + (n === 1 ? ' card' : ' cards'),
      aiHint: { kind: 'addlDiscard' },
    });
    const chosen = Array.isArray(cards) ? [...new Set(cards)].filter(card => player.hand.includes(card)).slice(0, n) : [];
    if (chosen.length === n) await ctx.g.discard(player, chosen);
  }

  function genericInlineToken(token) {
    return {
      name: token.name, cost: null, super: (token.super || []).slice(),
      types: (token.types || ['Creature']).slice(), subtypes: (token.subtypes || []).slice(),
      power: String(token.power), toughness: String(token.toughness), oracle: '',
      kws: (token.keywords || []).slice(), colorsOverride: (token.colors || []).slice(), isTokenDef: true,
    };
  }

  async function genericExplore(ctx, subject) {
    const explorer = subject && subject.ctrl;
    if (!subject || subject.zone !== 'battlefield' || !explorer || !explorer.library.length) return;
    const top = explorer.library[explorer.library.length - 1];
    ctx.g.lg(`Explore: revealed ${top.name}.`);
    await ctx.g.revealToHuman({ cards: [top], ctrl: explorer, kind: 'reveal' });
    if (top.is('Land')) {
      await ctx.g.move(top, 'hand');
      return;
    }
    if (subject.zone === 'battlefield') ctx.g.addCounters(subject, '+1/+1', 1, false, explorer);
    const choice = await explorer.controller.decide(ctx.g, {
      type: 'chooseOption', prompt: `${top.name}: leave it on top or put it into your graveyard?`,
      options: [{ key: 'top', label: 'Top' }, { key: 'gy', label: 'Graveyard' }],
      aiHint: { kind: 'explore', card: top },
    });
    if (choice === 'gy' && top.zone === 'library' && explorer.library.includes(top)) {
      await ctx.g.move(top, 'graveyard');
    }
  }

  function genericSearchMatches(card,what) {
    if(/^(?:Plains|Island|Swamp|Mountain|Forest)(?: or (?:Plains|Island|Swamp|Mountain|Forest))+$/.test(what)) return what.split(' or ').some(type=>card.hasSub(type));
    const type=what.replace(/ permanent$/i,'');
    return genericTypeMatches(card,what,card.zone) ||
      (card.hasSub(type) && (!/ permanent$/i.test(what) || genericTypeMatches(card,'permanent',card.zone)));
  }

  function genericCount(game,source,player,node) {
    if(node.kind==='life-total')return player.life;
    if(!['battlefield','graveyard','hand'].includes(node.zone))throw new Error('Unknown Oracle count zone: '+node.zone);
    const owners=game.players.filter(p=>node.controller==='all'||(node.controller==='opponents'?p!==player:p===player));
    const cards=node.zone==='battlefield'?game.bf().filter(card=>owners.includes(card.ctrl)):owners.flatMap(p=>p[node.zone]||[]);
    if(!Array.isArray(cards)) throw new Error('Unknown Oracle count zone: '+node.zone);
    const filtered=cards.filter(card=>(!node.other || card!==source) && genericSearchMatches(card,node.what)).filter(card=>{
      if(!node.color)return true;
      const colors={white:'W',blue:'U',black:'B',red:'R',green:'G'};
      if(colors[node.color])return card.colors.includes(colors[node.color]);
      if(node.color==='colorless')return card.colors.length===0;
      if(node.color==='multicolored')return card.colors.length>1;
      if(node.color==='nonbasic')return !(card.def.super||[]).includes('Basic');
      throw new Error('Unknown Oracle count color '+node.color);
    });
    if(node.unique==='types')return new Set(filtered.flatMap(card=>card.def.types.map(type=>type==='Tribal'?'Kindred':type))).size;
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

  async function runGenericEffect(ctx, effect) {
    const n = genericAmount(effect.n, ctx);
    const subjects = genericEffectSubjects(ctx, effect.target);
    const who = effect.who === 'you' ? ctx.you
      : typeof effect.who === 'number' ? genericEffectSubjects(ctx, effect.who)[0]
        : null;

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
    if(effect.action==='reveal-hand-discard') {
      for(const player of subjects) {
        await ctx.g.revealToHuman({cards:player.hand.slice(),ctrl:player,kind:'reveal'});
        const candidates=player.hand.filter(card=>effect.what==='nonland'?!card.is('Land'):effect.what==='noncreature'?!card.is('Creature'):effect.what.includes(',')?!card.is('Creature')&&!card.is('Land'):genericSearchMatches(card,effect.what));
        if(!candidates.length)continue;
        const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:candidates,min:1,max:1,prompt:'Choose the revealed card to discard',aiHint:{kind:'bestCard'}});
        if(Array.isArray(picked)&&picked.length===1&&candidates.includes(picked[0]))await ctx.g.discard(player,picked);
      }return;
    }
    if(effect.action==='blink') {
      for(const subject of subjects) {
        if(subject.zone!=='battlefield')continue;
        const owner=subject.owner;
        await ctx.g.move(subject,'exile',{noCmdReplace:!effect.delayed});
        if(subject.zone!=='exile'||subject.isToken)continue;
        const version=subject.zoneVersion;
        const restore=async next=>{if(subject.zone==='exile'&&subject.zoneVersion===version)await next.g.move(subject,'battlefield',{ctrl:effect.controller==='you'?ctx.you:owner,tapped:!!effect.tapped});};
        if(effect.delayed)ctx.g.delayed.push({on:'endStep',once:true,ctrl:ctx.you,src:ctx.src,name:'Return exiled card',run:restore});
        else await restore(ctx);
      }return;
    }
    if(effect.action==='order-top' || effect.action==='look-select') {
      const top=ctx.you.library.slice(-n).reverse();
      if(effect.action==='order-top') {await genericOrder(ctx,top,'top');return;}
      if(effect.revealAll) await ctx.g.revealToHuman({cards:top,ctrl:ctx.you,kind:'reveal'});
      const candidates=top.filter(card=>genericSearchMatches(card,effect.what));
      const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:candidates,min:0,max:1,prompt:'Choose a card from the top of your library',aiHint:{kind:'bestCard'}});
      const selected=Array.isArray(picked)?[...new Set(picked)].filter(card=>candidates.includes(card)).slice(0,1):[];
      if(effect.reveal && selected.length) await ctx.g.revealToHuman({cards:selected,ctrl:ctx.you,kind:'reveal'});
      for(const card of selected) await ctx.g.move(card,'hand');
      const rest=top.filter(card=>ctx.you.library.includes(card));
      if(effect.rest==='graveyard') for(const card of rest) await ctx.g.move(card,'graveyard');
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
      if (effect.who === 'each-opponent') await ctx.g.loseLifeOpponents(ctx.src, ctx.you, n, 'Oracle effect');
      else if (effect.who === 'each-player') {
        for (const player of ctx.g.alivePlayers().slice()) await ctx.g.loseLife(player, n, 'Oracle effect');
      }
      else if (who) await ctx.g.loseLife(who, n, 'Oracle effect');
      return;
    }
    if (effect.action === 'damage') {
      if (effect.target === 'each-opponent') await ctx.g.damageOpponents(ctx.src, ctx.you, n, { deferSBA: true });
      else for (const subject of subjects) await ctx.g.damageAny(ctx.src, subject, n, { deferSBA: true });
      return;
    }
    if (effect.action === 'pump') {
      for (const subject of subjects) if (subject.zone === 'battlefield') {
        MTG.E.pumpUntilEOT(ctx.g, subject, Number(effect.power || 0), Number(effect.toughness || 0), effect.keywords || []);
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
      for (const subject of subjects) await ctx.g.destroy(subject, { source: ctx.src });
      return;
    }
    if (effect.action === 'exile') {
      for (const subject of subjects) await ctx.g.exileCard(subject);
      return;
    }
    if (effect.action === 'bounce' || effect.action === 'move-to-hand') {
      for (const subject of subjects) await ctx.g.move(subject, 'hand');
      return;
    }
    if (effect.action === 'reanimate') {
      for (const subject of subjects) if (subject.zone === 'graveyard') await ctx.g.move(subject, 'battlefield', {
        ctrl: effect.controller === 'you' ? ctx.you : subject.owner, tapped: !!effect.tapped,
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
        if (effect.maxMv !== null && card.mv > effect.maxMv) return false;
        if (type === 'basic land') return card.is('Land') && (card.def.super || []).includes('Basic');
        return genericSearchMatches(card,effect.what);
      });
      const picked=await ctx.you.controller.decide(ctx.g, {type:'chooseCards',from:candidates,min:type==='card'?Math.min(n,candidates.length):0,max:n,
        search:true,prompt:'Search your library',aiHint:{kind:type.includes('land')?'searchBasic':'recur'}});
      const selected=Array.isArray(picked) ? [...new Set(picked)].filter(card=>candidates.includes(card)).slice(0,n):[];
      if(effect.reveal && selected.length) await ctx.g.revealToHuman({cards:selected,ctrl:ctx.you,kind:'reveal'});
      for(const card of selected) await ctx.g.move(card,effect.destination,{ctrl:ctx.you,tapped:!!effect.tapped});
      MTG.shuffle(ctx.you.library,ctx.g.rnd);
      return;
    }
    if (effect.action === 'return-source-to-hand') {
      if (ctx.src && (ctx.src.zone === 'battlefield' || ctx.src.zone === 'graveyard') &&
          ctx.src.zoneVersion === ctx.sourceZoneVersion) {
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
      for(const card of selected)await ctx.g.move(card,'battlefield',{ctrl:ctx.you,tapped:!!effect.tapped});return;
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
      const spec = effect.action === 'token-key' ? effect.tokenKey : genericInlineToken(effect.token);
      const made = who ? await ctx.g.makeTokens(spec, who, { n, tapped: !!effect.tapped }) : [];
      ctx._oracleCreatedTokens = made.map(card => ({ card, zoneVersion: card.zoneVersion }));
      return;
    }
    if (effect.action === 'connive') {
      for (const subject of subjects) if (subject.zone === 'battlefield') await ctx.g.connive(subject);
      return;
    }
    if (effect.action === 'explore') {
      for (const subject of subjects) await genericExplore(ctx, subject);
      return;
    }
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
      if (who) await genericDiscard(ctx, who, n);
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

  async function runGenericEffects(ctx, effects) {
    const previous = ctx._oracleCreatedTokens;
    ctx._oracleCreatedTokens = [];
    try {
      // makeTokens queues ETB events without applying SBA mid-resolution, so
      // a created 0/0 can receive its following counter before SBA is checked.
      for (const effect of effects || []) await runGenericEffect(ctx, effect);
    } finally {
      if (previous === undefined) delete ctx._oracleCreatedTokens;
      else ctx._oracleCreatedTokens = previous;
    }
  }

  function compileGenericTrigger(operation) {
    const v4Body = operation.v4Body && MTG.compileOracleSpellV4(operation.v4Body);
    const dynamicTargets = (operation.targets || []).some(target => target.controller === 'defending-player');
    const targetedOptional = !!operation.optional && ((operation.targets || []).length > 0 || operation.v4Body?.targets.length > 0);
    // CardInst is intentionally reused across zones. Remember the exact
    // incarnation while collectTriggers examines the event, rather than when
    // the pending trigger is later flushed onto the Stack. A hidden Symbol
    // preserves the capture through AI simulation clones without exposing it in
    // public event payloads; the Map separates copies of the same definition.
    const sourceCaptures = Symbol('oracleGenericTriggerCapture');
    const rememberSource = (game, source, data) => {
      const simultaneous = (game._simultaneousLeaveSources || []).find(entry => entry.card === source);
      const controller = data && data.card === source && data.snap && data.snap.ctrl
        ? data.snap.ctrl
        : (simultaneous && simultaneous.ctrl) || source.ctrl;
      const capture = {
        iid: source instanceof MTG.CardInst ? source.iid : null,
        timestamp: source instanceof MTG.CardInst ? source.timestamp : null,
        zoneVersion: source instanceof MTG.CardInst ? source.zoneVersion : null,
        controller,
        castFrom: source.castMeta?.from,
        packTactics: operation.condition?.kind==='pack-tactics'?genericCondition(game,source,operation.condition,controller):undefined,
        defender: data?.defender || data?.attacker?.attacking || source.attacking || null,
        eventCardZoneVersion: data?.card?.zoneVersion,
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
      ctx.sourceTimestamp = capture.timestamp;
      ctx.sourceZoneVersion = capture.zoneVersion;
      ctx.eventCardZoneVersion = capture.eventCardZoneVersion;
    };
    const baseFilter = genericTriggerFilter(operation.event, operation.eventFilter);
    const trigger = {
      on: operation.event,
      desc: operation.desc || 'Oracle effect',
      // A printed "you may" changes what happens on resolution; it does not
      // make choosing targets optional while the ability is put on the Stack.
      // Keep untargeted legacy optionals on the engine's existing path.
      opt: !!operation.optional && !targetedOptional,
      oncePerTurn: !!operation.onceEachTurn,
      filter: (game, source, data) => {
        if (baseFilter && !baseFilter(game, source, data)) return false;
        if (operation.condition && !genericCondition(game,source,operation.condition,source.ctrl)) return false;
        if (operation.opponentOnly && (!data || !data.player || data.player === source.ctrl)) return false;
        rememberSource(game, source, data);
        return true;
      },
      controller: (game, source, data) =>
        (capturedSource(source, data) || rememberSource(game, source, data)).controller,
      prepareTargets: async ctx => {
        applyCapturedSource(ctx);
        return true;
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
        if(v4Body) await v4Body.resolve(v4Body.modes?Object.assign({},ctx,{mode:[ctx.mode]}):ctx);
        else await runGenericEffects(ctx, operation.effects);
      },
    };
    if ((operation.targets || []).length) {
      trigger.targets = dynamicTargets
        ? (game, source, data) => genericTargetSpecs(operation.targets, operation.effects, {...data,defender:capturedSource(source,data)?.defender})
        : genericTargetSpecs(operation.targets, operation.effects);
    }
    if(v4Body?.targets) trigger.targets = (game,source,data) => v4Body.targets(game,source,{},(capturedSource(source,data)||{}).controller||source.ctrl);
    if(v4Body?.modes) trigger.modes={list:v4Body.modes.list.map(mode=>({...mode,targets:(game,source,data)=>mode.targets(game,source,{},(capturedSource(source,data)||{}).controller||source.ctrl)}))};
    return trigger;
  }

  function genericAbilityAiScore(operation, cost) {
    return (game, source, player) => {
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
      if (cost.sacSelf) score -= Math.max(2, Number(source.mv) || 0);
      if (cost.sacCreature || cost.sac) score -= 2;
      return score;
    };
  }

  function compileGenericAbility(operation) {
    const v4Body = operation.v4Body && MTG.compileOracleSpellV4(operation.v4Body);
    const cost = Object.assign({}, operation.cost || {});
    if (cost.sacWhat) {
      const type = String(cost.sacWhat);
      cost.sac = (game, candidate) => genericTypeMatches(candidate, type);
      delete cost.sacWhat;
    }
    const targets = v4Body ? v4Body.targets(null,null,{},null) : genericTargetSpecs(operation.targets, operation.effects);
    if (cost.sacSelf && Array.isArray(targets)) for (const spec of targets) {
      spec.aiHint = Object.assign({}, spec.aiHint, { avoidCostSource: true });
    }
    return {
      label: operation.label || 'Oracle ability',
      cost,
      targets,
      sorcery: !!operation.sorceryOnly,
      oncePerTurn: !!operation.onceEachTurn,
      xCost: typeof cost.mana === 'string' && cost.mana.includes('{X}'),
      cond: operation.beforeAttackersOnly ? (game, source, player) =>
        game.turnPlayer === player && !player.turnState.reachedDeclareAttackers &&
        (['upkeep', 'draw', 'main1'].includes(game.phase) ||
          (game.phase === 'combat' && game.step === 'begin')) : undefined,
      aiScore: v4Body ? () => 2 : genericAbilityAiScore(operation, cost),
      run: async ctx => {
        if(operation.optional) {
          const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Use the optional effect?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'optTrigger',src:ctx.src}});
          if(answer!=='yes')return;
        }
        if(v4Body) await v4Body.resolve(ctx); else await runGenericEffects(ctx, operation.effects);
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
    if (normalized === 'tapped') return !!card.tapped;
    if (normalized === 'untapped') return !card.tapped;
    if (normalized === 'token') return !!card.isToken;
    if (normalized === 'nontoken' || normalized === 'non-token') return !card.isToken;
    if (normalized === 'enchanted') {
      return (card.attachments || []).some(iid => {
        const attachment = game.byIid(iid);
        const subtypes = attachment && ((attachment.cur && attachment.cur.subtypes) || attachment.def.subtypes || []);
        return !!attachment && attachment.zone === 'battlefield' && attachment.attachedTo === card.iid &&
          subtypes.includes('Aura');
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
    const sameSource = !evidence || (self.zone === 'battlefield' && self.zoneVersion === evidence.zoneVersion);
    if(condition.kind==='no-other-creatures')return !game.creatures(p).some(card=>!sameSource||card!==self);
    if(condition.kind==='hand-count')return p.hand.length===condition.n;
    if(condition.kind==='filtered-permanent-count')return game.bf().filter(card=>card.ctrl===p&&(!condition.tapped||card.tapped)&&genericSearchMatches(card,condition.what)).length>=condition.min;
    if(condition.kind==='creature-died')return game.diedThisTurn.some(card=>card.types.includes('Creature'));
    if(condition.kind==='coven')return new Set(game.creatures(p).map(card=>card.power)).size>=3;
    if(condition.kind==='formidable')return game.creatures(p).reduce((sum,card)=>sum+card.power,0)>=8;
    if(condition.kind==='pack-tactics')return evidence?.packTactics??(game.combat?.attackers||[]).filter(card=>card.ctrl===p).reduce((sum,card)=>sum+card.power,0)>=6;
    if(condition.kind==='has-permanent')return game.bf().some(card=>card.ctrl===p&&(!condition.other||!sameSource||card!==self)&&genericSearchMatches(card,condition.what));
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

  function compileGenericStatic(operation) {
    const scopes = new Set(['self', 'your-creatures', 'your-other-creatures', 'all-creatures', 'opponent-creatures']);
    if (!scopes.has(operation.scope)) throw new Error('Unknown generic Oracle static scope: ' + operation.scope);
    const unsupported = ['additionalBlocks', 'maxBlockers', 'combatAloneRestriction', 'lureSelf']
      .filter(field => operation[field] !== undefined);
    if (unsupported.length) {
      throw new Error('Generic Oracle static needs engine support: ' + unsupported.join(', '));
    }
    return {
      oracleOperation: operation,
      apply: (game, self, battlefield) => {
        if (operation.yourTurnOnly && game.turnPlayer !== self.ctrl) return;
        if (operation.condition && !genericCondition(game,self,operation.condition)) return;
        const affected = operation.scope === 'self' ? [self] : battlefield.filter(card =>
          (operation.scope==='all-creatures'||(operation.scope==='opponent-creatures'?card.ctrl!==self.ctrl:card.ctrl===self.ctrl)) && card.is('Creature') &&
          (operation.scope !== 'your-other-creatures' || card !== self) &&
          genericStaticSubjectMatches(game, card, operation.subtype));
        for (const card of affected) {
          const multiplier=operation.multiplier?genericCount(game,self,self.ctrl,operation.multiplier):1;
          card.cur.power += Number(operation.power || 0)*multiplier;
          card.cur.toughness += Number(operation.toughness || 0)*multiplier;
          for (const keyword of operation.keywords || []) card.cur.kw.add(keyword);
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
    if (operation.kind === 'spell-generic') return {
      targets: genericTargetSpecs(operation.targets, operation.effects),
      run: async (ctx,targets) => { await runGenericEffects(Object.assign({},ctx,{targets}),operation.effects); },
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

  function compileOracleScript(batch, entry) {
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
    for (const operation of entry.implementation || []) {
      if(operation.kind==='characteristic-pt') {
        script.oracleCharacteristicPT=true;
        const value=(game,card)=>genericCount(game,card,card.zone==='battlefield'?card.ctrl:card.owner,operation.count)*operation.multiply+operation.offset;
        if(operation.power)script.cdaPower=value;
        if(operation.toughness)script.cdaToughness=(game,card)=>value(game,card)+operation.toughnessOffset;
        continue;
      }
      if (operation.kind === 'generic-trigger') {
        for(const event of Array.isArray(operation.event)?operation.event:[operation.event])triggers.push(compileGenericTrigger({...operation,event}));
        continue;
      }
      if (operation.kind === 'generic-ability') {
        abilities.push(compileGenericAbility(operation));
        continue;
      }
      if (operation.kind === 'generic-static') {
        statics.push(compileGenericStatic(operation));
        continue;
      }
      if (operation.kind === 'enters-with-counters') {
        if (script.etbCounters) throw new Error(entry.raw.name + ': multiple enters-with-counters operations need explicit semantics');
        script.etbCounters = {
          kind: operation.counter,
          n: operation.n === 'X'
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
        mana.push({
          cost: operation.activationCost ? Object.assign({},operation.activationCost) : Object.assign({ tap: true }, operation.activationMana ? { mana: operation.activationMana } : {}),
          produce: operation.produce.map(option => Object.assign({}, option)),
        });
        continue;
      }
      if (operation.kind === 'enters-tapped') {
        script.entersTapped = true;
        continue;
      }
      if (operation.kind === 'conditional-enters-tapped') {
        if (script.entersTapped) {
          throw new Error(entry.raw.name + ': multiple enters-tapped contracts need explicit composition');
        }
        script.entersTapped = async (game, card) => {
          const player = card.ctrl;
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
      if (operation.kind.startsWith('mechanic-')) {
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
          grant.skipUntap || grant.cantAttack || grant.cantBlock);
        const negativeStats = declaredAttachmentGrants.some(grant =>
          Number(grant.power || 0) < 0 || Number(grant.toughness || 0) < 0);
        const positiveStats = declaredAttachmentGrants.some(grant =>
          Number(grant.power || 0) > 0 || Number(grant.toughness || 0) > 0 || (grant.keywords || []).length);
        const goal = own || (!restrictsHost && !negativeStats) ? 'buff'
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
        const fragment = compileSpell(operation);
        if (operation.kind === 'spell-v4') {
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
    if (mana.length) {
      script.mana = mana.length === 1 ? mana[0] : mana;
      const colors = new Set();
      for (const source of mana) {
        for (const option of source.produce) {
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
      script.attachGrant = (game, self, host) => {
        for (const grant of attachmentGrants) {
          host.cur.power += grant.power || 0;
          host.cur.toughness += grant.toughness || 0;
          for (const keyword of grant.keywords || []) host.cur.kw.add(keyword);
          if (grant.cantAttack) host.cur.cantAttack = true;
          if (grant.cantBlock) host.cur.cantBlock = true;
          if (grant.skipUntap) host.cur.cantUntap = true;
        }
      };
    }
    if (spellFragments.length) {
      script.targets = spellFragments.flatMap(fragment => fragment.targets || []);
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
            await fragment.run(ctx, localTargets);
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
})();
