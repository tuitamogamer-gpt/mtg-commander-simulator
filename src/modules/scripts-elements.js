// ===== scripts-elements.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS, E7 = MTG.E7;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, data) => data.card === self;
  const eachOpp = (g, player) => E.eachOpp(g, player);
  const tok = (name, subtypes, power, toughness, kws, colors, extra) => Object.assign({
    name, cost: null, super: [], types: ['Creature'], subtypes,
    power: String(power), toughness: String(toughness), oracle: '', kws: kws || [],
    colorsOverride: colors || [], isTokenDef: true,
  }, extra || {});
  const anyPermanentTarget = (prompt, filter, aiHint) => T.permanent(filter || null, {
    prompt, aiHint: aiHint || { goal: 'removal' },
  });
  const graveTarget = (prompt, filter, anyGraveyard, upTo) => ({
    zone: 'graveyard', what: 'card', prompt, filter,
    anyGraveyard: !!anyGraveyard, upTo: !!upTo,
    aiHint: { kind: 'gyRecur' },
  });
  const chooseType = async (g, player, source, fallback = 'Elemental') => {
    const counts = {};
    for (const card of g.creatures(player).concat(player.hand.filter(card => card.is('Creature')))) {
      for (const subtype of (card.cur ? card.cur.subtypes : card.def.subtypes || [])) {
        counts[subtype] = (counts[subtype] || 0) + 1;
      }
    }
    const options = [...new Set([fallback, ...Object.keys(counts)])]
      .map(key => ({ key, label: key }));
    const result = await player.controller.decide(g, {
      type: 'chooseOption', prompt: `${source.name}: choose a creature type`, options,
      aiHint: { kind: 'chooseType', counts, source },
    });
    return options.some(option => option.key === result) ? result : fallback;
  };
  const colorsControlled = (g, player) => {
    const found = new Set();
    for (const card of g.bf().filter(card => card.ctrl === player)) {
      for (const color of (card.colors || card.def.colorsOverride || [])) found.add(color);
      for (const color of COLORS) if ((card.def.cost || '').includes(`{${color}}`)) found.add(color);
    }
    return found.size;
  };
  const returnToHand = async (g, card) => {
    if (card && card.zone === 'graveyard') await g.move(card, 'hand');
  };
  const putOnTop = async (g, card) => {
    if (!card || card.zone !== 'graveyard') return;
    g.remove(card); card.zone = 'library'; card.owner.library.push(card);
  };
  const evoke = (cost) => [{ label: `Evoke ${cost}`, altCostStr: cost, evoke: true }];
  const encore = (cost) => ({
    label: `Encore ${cost}`, cost, sorcery: true,
    run: async ctx => {
      const made = [];
      for (const opponent of eachOpp(ctx.g, ctx.you)) {
        const copies = await ctx.g.copyPermanentToken(ctx.src, ctx.you, {
          haste: true, tapped: !!ctx.g.combat, attacking: ctx.g.combat ? opponent : undefined,
        });
        for (const token of copies) token.meta.mustAttackPlayer = opponent;
        made.push(...copies);
      }
      if (made.length) E7.sacAtNextEnd(ctx.g, made, ctx.you);
      ctx.g.lg(`Encore: ${ctx.src.name} x${made.length}.`);
    },
  });
  const makeTriLand = (a, b, c) => ({
    producesColors: [a, b, c], entersTapped: true,
    mana: { cost: { tap: true }, produce: [{ [a]: 1 }, { [b]: 1 }, { [c]: 1 }] },
  });
  const putCreatureFromGraveyard = async (g, player, card) => {
    if (card && card.zone === 'graveyard' && card.is('Creature')) await g.move(card, 'battlefield', { ctrl: player });
  };
  const isPermanentSpell = card => ['Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'].some(type => card.is(type));

  TK.elementsShapeshifter11 = TK.elementsShapeshifter11 || tok(
    'Shapeshifter', ['Shapeshifter'], 1, 1, ['changeling'], []);
  TK.elementsPlant01 = TK.elementsPlant01 || tok('Plant', ['Plant'], 0, 1, [], ['G']);
  TK.elementsElemental55 = TK.elementsElemental55 || tok('Elemental', ['Elemental'], 5, 5, [], ['R', 'G']);
  TK.elementsRhino44 = TK.elementsRhino44 || tok('Rhino', ['Rhino'], 4, 4, ['trample'], ['G']);
  TK.elementsElemental44F = TK.elementsElemental44F || tok('Elemental', ['Elemental'], 4, 4, ['flying'], ['W']);
  TK.elementsSovereign = TK.elementsSovereign || tok('Elemental', ['Elemental'], 0, 0, [], ['W', 'G'], {
    cdaPower: (g, card) => g.creatures(card.ctrl).length,
    cdaToughness: (g, card) => g.creatures(card.ctrl).length,
  });

  // Commander: the granted evoke is represented as a battlefield cast permission.
  // The engine currently resolves evoke's sacrifice immediately after ETB triggers.
  SC['Ashling, the Limitless'] = {
    grantAltCosts: {
      filter: (g, source, card, player) => player === source.ctrl && card.zone === 'hand' &&
        isPermanentSpell(card) && card.hasSub('Elemental'),
      make: () => ({ label: 'Evoke {4}', altCostStr: '{4}', evoke: true }),
    },
    triggers: [{
      on: 'sacrificed', desc: 'Elemental echo',
      filter: (g, self, data) => data.player === self.ctrl && !data.card.isToken && data.card.hasSub('Elemental'),
      run: async ctx => {
        const made = await ctx.g.copyPermanentToken(ctx.data.card, ctx.you, { haste: true });
        if (!made.length) return;
        const ids = made.map(card => card.iid);
        ctx.g.delayed.push({
          on: 'endStep', name: 'Ashling echo payment', ctrl: ctx.you,
          run: async delayed => {
            const tokens = ids.map(id => delayed.g.byIid(id)).filter(card => card && card.zone === 'battlefield');
            if (!tokens.length) return;
            let keep = false;
            if (delayed.g.canPayMana(delayed.you, U.parseCost('{W}{U}{B}{R}{G}'))) {
              const answer = await delayed.you.controller.decide(delayed.g, {
                type: 'chooseOption', prompt: 'Ashling: pay {W}{U}{B}{R}{G} to keep the token?',
                options: [{ key: 'pay', label: 'Pay and keep it' }, { key: 'sac', label: 'Sacrifice it' }],
                aiHint: { kind: 'ashlingKeep', cards: tokens },
              });
              keep = answer === 'pay' && await delayed.g.payMana(delayed.you, U.parseCost('{W}{U}{B}{R}{G}'));
            }
            if (!keep) await delayed.g.sacrificeMany(delayed.you, tokens);
          },
        });
      },
    }],
  };

  const elementalMana = {
    cost: { tap: true }, produce: [{ ANY: true, n: 2 }], restrictAbilities: true,
    restrict: (g, action) => action && action.card && action.card.hasSub && action.card.hasSub('Elemental'),
  };
  SC.Flamebraider = { mana: elementalMana };
  SC.Smokebraider = { mana: elementalMana };

  SC['Eclipsed Flamekin'] = {
    triggers: [{
      on: 'etb', desc: 'Look at top four', filter: etbSelf,
      run: async ctx => {
        const top = ctx.you.library.slice(-4);
        const eligible = top.filter(card => card.hasSub('Elemental') || card.hasSub('Island') || card.hasSub('Mountain'));
        const pick = eligible.length ? await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: eligible, min: 0, max: 1,
          prompt: 'Eclipsed Flamekin: Elemental, Island, or Mountain to hand',
          aiHint: { kind: 'bestCard' },
        }) : [];
        if (pick[0]) await ctx.g.move(pick[0], 'hand');
        const rest = top.filter(card => card.zone === 'library');
        for (const card of rest) ctx.you.library.splice(ctx.you.library.indexOf(card), 1);
        U.shuffle(rest, ctx.g.rnd); ctx.you.library.unshift(...rest);
      },
    }],
  };
  SC.Endurance = {
    altCosts: [{
      label: 'Evoke — exile a green card', altCostStr: '{0}', evoke: true,
      cond: (g, player, card) => player.hand.some(other => other !== card && other.colors.includes('G')),
      pitchColor: 'G',
    }],
    triggers: [{
      on: 'etb', desc: 'Graveyard to library', filter: etbSelf,
      targets: [T.player({ prompt: 'Whose graveyard?', aiHint: { goal: 'gyHate' } })],
      run: async ctx => {
        const player = ctx.targets[0];
        if (!player) return;
        const cards = player.graveyard.slice(); U.shuffle(cards, ctx.g.rnd);
        for (const card of cards) { ctx.g.remove(card); card.zone = 'library'; player.library.unshift(card); }
      },
    }],
  };
  SC['Incandescent Soulstoke'] = {
    statics: [{ apply: (g, self, bf) => {
      for (const card of bf) if (card !== self && card.ctrl === self.ctrl && card.is('Creature') && card.hasSub('Elemental')) {
        card.cur.power += 1; card.cur.toughness += 1;
      }
    } }],
    abilities: [{
      label: 'Put an Elemental from hand', cost: { tap: true, mana: '{1}{R}' },
      cond: (g, self, player) => player.hand.some(card => card.is('Creature') && card.hasSub('Elemental')),
      run: async ctx => {
        const pool = ctx.you.hand.filter(card => card.is('Creature') && card.hasSub('Elemental'));
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: pool, min: 1, max: 1,
          prompt: 'Incandescent Soulstoke: Elemental to put onto the battlefield', aiHint: { kind: 'bestCard' } });
        if (!pick[0]) return;
        await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
        E.grantUntilEOT(ctx.g, pick[0], ['haste']); E7.sacAtNextEnd(ctx.g, [pick[0]], ctx.you);
      }, aiScore: () => 5,
    }],
  };
  SC.Realmwalker = {
    asEnters: async (g, card) => { card.meta.chosenType = await chooseType(g, card.ctrl, card); },
    revealOwnTop: true,
    playTop: (g, self, top) => top.is('Creature') && !!self.meta.chosenType && top.hasSub(self.meta.chosenType),
  };
  SC['Risen Reef'] = {
    triggers: [{
      on: 'etb', desc: 'Reef reveal',
      filter: (g, self, data) => data.card.ctrl === self.ctrl && data.card.hasSub('Elemental'),
      run: async ctx => {
        const top = ctx.you.library.at(-1); if (!top) return;
        if (top.is('Land')) {
          const answer = await ctx.you.controller.decide(ctx.g, { type: 'chooseOption', prompt: `Risen Reef: put ${top.name} onto battlefield tapped?`,
            options: [{ key: 'battlefield', label: 'Battlefield tapped' }, { key: 'hand', label: 'Hand' }], aiHint: { kind: 'reefLand', card: top } });
          if (answer === 'battlefield') await ctx.g.move(top, 'battlefield', { ctrl: ctx.you, tapped: true });
          else await ctx.g.move(top, 'hand');
        } else await ctx.g.move(top, 'hand');
      },
    }],
  };
  SC['Selvala, Heart of the Wilds'] = {
    triggers: [{
      on: 'etb', desc: 'Parley of strength',
      filter: (g, self, data) => data.card !== self && data.card.is('Creature') &&
        data.card.power > Math.max(0, ...g.creatures().filter(card => card !== data.card).map(card => card.power)),
      controller: (g, self, data) => data.card.ctrl,
      opt: true, run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
    mana: {
      cost: { tap: true },
      produce: (g, card) => {
        const n = Math.max(0, ...g.creatures(card.ctrl).map(creature => creature.power));
        return n ? [{ ANY: true, n }] : [];
      },
    },
  };
  SC['Foundation Breaker'] = {
    altCosts: evoke('{1}{G}'),
    triggers: [{
      on: 'etb', desc: 'Destroy artifact/enchantment', filter: etbSelf, opt: true,
      targets: [anyPermanentTarget('Artifact or enchantment', (g, card) => card.is('Artifact') || card.is('Enchantment'))],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
    }],
  };
  SC['Omnath, Locus of the Roil'] = {
    triggers: [{
      on: 'etb', desc: 'Elemental damage', filter: etbSelf,
      targets: [{ what: 'any', prompt: 'Any target', aiHint: { goal: 'removal' } }],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], ctx.g.creatures(ctx.you).filter(card => card.hasSub('Elemental')).length); },
    }, {
      on: 'landfall', desc: 'Counter and draw', filter: (g, self, data) => data.card.ctrl === self.ctrl,
      targets: [T.yourCreature({ prompt: '+1/+1 on an Elemental', filter: (g, card, ctrl) => card.zone === 'battlefield' && card.is('Creature') && card.ctrl === ctrl && card.hasSub('Elemental'), aiHint: { goal: 'buff' } })],
      run: async ctx => {
        if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1, false, ctx.you);
        if (ctx.g.lands(ctx.you).length >= 8) await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
  SC.Slithermuse = {
    altCosts: evoke('{3}{U}'),
    triggers: [{
      on: 'lto', desc: 'Draw to opponent hand size', filter: (g, self, data) => data.card === self,
      targets: [T.opponent({ prompt: 'Choose opponent', aiHint: { goal: 'drawSelf' } })],
      run: async ctx => { const opponent = ctx.targets[0]; if (opponent) await ctx.g.draw(ctx.you, Math.max(0, opponent.hand.length - ctx.you.hand.length)); },
    }],
  };
  SC['Cavalier of Thorns'] = {
    triggers: [{
      on: 'etb', desc: 'Mill five, land to battlefield', filter: etbSelf,
      run: async ctx => {
        const top = ctx.you.library.slice(-5); const lands = top.filter(card => card.is('Land'));
        const pick = lands.length ? await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: lands, min: 0, max: 1,
          prompt: 'Cavalier: land onto battlefield', aiHint: { kind: 'bestLand' } }) : [];
        if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
        for (const card of top) if (card.zone === 'library') await ctx.g.move(card, 'graveyard');
      },
    }, {
      on: 'dies', desc: 'Card on top', filter: (g, self, data) => data.card === self, opt: true,
      targets: [graveTarget('Another card in your graveyard', (g, card, ctrl, source) => card.owner === ctrl && card !== source, false, false)],
      run: async ctx => {
        const target = ctx.targets[0];
        if (!target || ctx.src.zone !== 'graveyard' || ctx.src.zoneVersion !== ctx.sourceZoneVersion + 1) return;
        await ctx.g.move(ctx.src, 'exile');
        if (ctx.src.zone !== 'exile') return;
        await putOnTop(ctx.g, target);
      },
    }],
  };
  SC.Fury = {
    altCosts: [{
      label: 'Evoke — exile a red card', altCostStr: '{0}', evoke: true,
      cond: (g, player, card) => player.hand.some(other => other !== card && other.colors.includes('R')),
      pitchColor: 'R',
    }],
    triggers: [{
      on: 'etb', desc: 'Four divided damage', filter: etbSelf,
      targets: [T.permanent((g, card) => card.is('Creature') || card.is('Planeswalker'), {
        prompt: 'Up to four creatures and/or planeswalkers', count: 4, min: 0, upTo: true,
        aiHint: { goal: 'damage', n: 4 },
      })],
      prepareTargets: async ctx => {
        const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
        const division = await E.divideDamage(ctx.g, ctx.you, ctx.src, targets, 4, { aiKind: 'furyDamage' });
        if (!division) return false;
        ctx.damageDivision = division; return true;
      },
      run: async ctx => {
        const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
        for (const target of targets) {
          const assignment = (ctx.damageDivision || []).find(entry => entry.iid === target.iid);
          if (assignment) await ctx.g.damageCreature(ctx.src, target, assignment.n, { deferSBA: true });
        }
        await ctx.g.checkSBA();
      },
    }],
  };
  SC['Horde of Notions'] = {
    abilities: [{
      label: 'Play Elemental from your graveyard', cost: { mana: '{W}{U}{B}{R}{G}' },
      targets: [graveTarget('Target Elemental card in your graveyard', (g, card) => card.hasSub('Elemental'))],
      run: async ctx => {
        const card = ctx.targets[0]; if (!card || card.zone !== 'graveyard' || card.owner !== ctx.you) return;
        await U.OracleV8PlayPermissions.castOne(ctx, [card], { free: true }, {});
      }, aiScore: () => 6,
    }],
  };
  SC['Ingot Chewer'] = {
    altCosts: evoke('{R}'),
    triggers: [{ on: 'etb', desc: 'Destroy artifact', filter: etbSelf,
      targets: [anyPermanentTarget('Artifact', (g, card) => card.is('Artifact'))],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); } }],
  };
  SC['Jegantha, the Wellspring'] = {
    mana: { cost: { tap: true }, coloredOnly: true, produce: [{ W: 1, U: 1, B: 1, R: 1, G: 1 }] },
  };
  SC['Mass of Mysteries'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Grant myriad', filter: (g, self, data) => data.player === self.ctrl,
      targets: [T.yourCreature({ prompt: 'Another Elemental gets myriad', filter: (g, card, ctrl, source) => card.zone === 'battlefield' && card.is('Creature') && card.ctrl === ctrl && card !== source && card.hasSub('Elemental'), aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) E.grantUntilEOT(ctx.g, ctx.targets[0], ['myriad']); },
    }],
  };
  SC.Mulldrifter = { altCosts: evoke('{2}{U}'), triggers: [{ on: 'etb', desc: 'Draw two', filter: etbSelf, run: async ctx => { await ctx.g.draw(ctx.you, 2); } }] };
  SC.Shimmercreep = {
    triggers: [{ on: 'etb', desc: 'Vivid drain', filter: etbSelf, run: async ctx => {
      const n = colorsControlled(ctx.g, ctx.you); if (!n) return;
      for (const opponent of eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(opponent, n, 'Shimmercreep');
      await ctx.g.gainLife(ctx.you, n);
    } }],
  };
  SC.Shriekmaw = {
    altCosts: evoke('{1}{B}'),
    triggers: [{ on: 'etb', desc: 'Destroy creature', filter: etbSelf,
      targets: [T.creature({ prompt: 'Nonartifact, nonblack creature', filter: (g, card) => card.zone === 'battlefield' && card.is('Creature') && !card.is('Artifact') && !(card.colors || []).includes('B'), aiHint: { goal: 'removal' } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); } }],
  };
  SC.Subterfuge = {
    gyAbility: encore('{7}{U}{U}'),
    triggers: [{
      on: 'etb', desc: 'Flying and combat draw', filter: etbSelf,
      targets: [T.creature({ prompt: 'Target creature', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const target = ctx.targets[0]; if (!target || target.zone !== 'battlefield' || !target.is('Creature')) return;
        E.grantUntilEOT(ctx.g, target, ['flying']);
        const iid = target.iid, zoneVersion = target.zoneVersion;
        // This is an ability granted to the creature, so its controller when
        // damage happens controls the trigger. Blinking ends the old grant.
        const trigger = {
          on: 'combatDamageToPlayer', desc: 'Subterfuge combat draw',
          filter: (g, self, data) => data.card === self,
          run: async granted => { await granted.g.draw(granted.you, granted.data.n); },
        };
        ctx.g.untilEffects.push({
          kind: 'subterfugeCombatDraw', expires: 'eot', iid, zoneVersion,
          apply: (g, battlefield) => {
            const creature = battlefield.find(card => card.iid === iid && card.zoneVersion === zoneVersion);
            if (creature) creature.cur.extraTriggers.push(trigger);
          },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Yarok, the Desecrated'] = {
    doubleTriggerFilter: (g, self, source, event, data) => source.ctrl === self.ctrl &&
      source.zone === 'battlefield' && event === 'etb' && data.card && data.card.ctrl === self.ctrl,
  };
  SC['Bane of Progress'] = {
    triggers: [{ on: 'etb', desc: 'Destroy artifacts/enchantments', filter: etbSelf, run: async ctx => {
      const doomed = ctx.g.bf().filter(card => card.is('Artifact') || card.is('Enchantment'));
      const n = await ctx.g.destroyMany(doomed); if (ctx.src.zone === 'battlefield' && n) ctx.g.addCounters(ctx.src, '+1/+1', n, false, ctx.you);
    } }],
  };
  SC.Belonging = { gyAbility: encore('{6}{W}{W}'), triggers: [{ on: 'etb', desc: 'Three changelings', filter: etbSelf,
    run: async ctx => { await ctx.g.makeTokens('elementsShapeshifter11', ctx.you, { n: 3 }); } }] };
  SC['Greenwarden of Murasa'] = {
    triggers: [{ on: 'etb', desc: 'Return a card', filter: etbSelf, opt: true,
      targets: [graveTarget('Card in your graveyard', (g, card, ctrl) => card.owner === ctrl, false, false)],
      run: async ctx => { await returnToHand(ctx.g, ctx.targets[0]); } }, {
      on: 'dies', desc: 'Exile to return a card', filter: (g, self, data) => data.card === self, opt: true,
      targets: [graveTarget('Card in your graveyard', (g, card, ctrl) => card.owner === ctrl, false, false)],
      run: async ctx => { if (!ctx.targets[0] || ctx.src.zone !== 'graveyard' || ctx.src.zoneVersion !== ctx.sourceZoneVersion + 1) return; await ctx.g.move(ctx.src, 'exile'); if (ctx.src.zone !== 'exile') return; await returnToHand(ctx.g, ctx.targets[0]); },
    }],
  };
  SC.Jubilation = { gyAbility: encore('{7}{G}{G}'), triggers: [{ on: 'etb', desc: '+2/+2 and trample', filter: etbSelf,
    run: async ctx => { E.pumpAllUntilEOT(ctx.g, card => card.ctrl === ctx.you && card.is('Creature'), 2, 2, ['trample']); } }] };
  SC.Lamentation = { gyAbility: encore('{6}{B}{B}'), triggers: [{ on: 'etb', desc: 'Destroy and gain three', filter: etbSelf,
    targets: [T.oppCreature({ prompt: 'Opponent creature', aiHint: { goal: 'removal' } })],
    run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); await ctx.g.gainLife(ctx.you, 3); } }] };
  SC['Muldrotha, the Gravetide'] = {
    grantsGraveyardPermanentTypes: true,
  };
  SC['Vernal Sovereign'] = {
    triggers: [{ on: 'etb', desc: 'Elemental token', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('elementsSovereign', ctx.you); } },
      { on: 'attacks', desc: 'Elemental token', filter: (g, self, data) => data.card === self,
        run: async ctx => { await ctx.g.makeTokens('elementsSovereign', ctx.you); } }],
  };
  SC['Avenger of Zendikar'] = {
    triggers: [{ on: 'etb', desc: 'Plants', filter: etbSelf,
      run: async ctx => { await ctx.g.makeTokens('elementsPlant01', ctx.you, { n: ctx.g.lands(ctx.you).length }); } },
      { on: 'landfall', desc: 'Grow Plants', filter: (g, self, data) => data.card.ctrl === self.ctrl,
        run: async ctx => { for (const plant of ctx.g.creatures(ctx.you).filter(card => card.hasSub('Plant'))) ctx.g.addCounters(plant, '+1/+1', 1, true, ctx.you); ctx.g.recalc(); } }],
  };
  SC.Impulsivity = {
    gyAbility: encore('{7}{R}{R}'),
    triggers: [{ on: 'etb', desc: 'Cast instant/sorcery from graveyard', filter: etbSelf, opt: true,
      targets: [graveTarget('Instant or sorcery in a graveyard', (g, card) => card.is('Instant') || card.is('Sorcery'), true, false)],
      run: async ctx => { const card = ctx.targets[0]; if (card) await ctx.g.castSpell(ctx.you, card, { from: 'graveyard', free: true, exileAfter: true }); } }],
  };
  SC['Omnath, Locus of Rage'] = {
    triggers: [{ on: 'landfall', desc: '5/5 Elemental', filter: (g, self, data) => data.card.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('elementsElemental55', ctx.you); } }, {
      on: 'dies', desc: 'Three damage', filter: (g, self, data) => data.snap.ctrl === self.ctrl && data.snap.types.includes('Creature') &&
        (data.card === self || data.card.hasSub('Elemental')),
      targets: [{ what: 'any', prompt: 'Any target', aiHint: { goal: 'removal' } }],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], 3); },
    }],
  };
  SC['Titan of Industry'] = {
    triggers: [{ on: 'etb', desc: 'Choose two', filter: etbSelf,
      prepareTargets: async ctx => {
        const modeDefs = [
          { key: '0', label: 'Destroy artifact or enchantment', spec: anyPermanentTarget('Artifact or enchantment', (g, card) => card.is('Artifact') || card.is('Enchantment')) },
          { key: '1', label: 'Target player gains 5 life', spec: T.player({ prompt: 'Player gains 5', aiHint: { goal: 'gainLife' } }) },
          { key: '2', label: 'Create a 4/4 Rhino' },
          { key: '3', label: 'Put a shield counter on your creature', spec: T.yourCreature({ prompt: 'Shield counter', aiHint: { goal: 'protect' } }) },
        ];
        const options = modeDefs.filter(mode => !mode.spec || ctx.g.legalTargets(mode.spec, ctx.src, ctx.you).length)
          .map(mode => ({ key: mode.key, label: mode.label }));
        if (options.length < 2) return false;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseMulti', prompt: 'Titan of Industry: choose two', options, min: 2, max: 2,
          aiHint: { kind: 'modes', card: ctx.src },
        });
        ctx.chosenModes = [...new Set(picked)].filter(key => options.some(option => option.key === key)).slice(0, 2).map(Number).sort();
        if (ctx.chosenModes.length !== 2) return false;
        ctx.targets = [];
        for (const mode of ctx.chosenModes) {
          const spec = modeDefs[mode].spec; if (!spec) continue;
          const candidates = ctx.g.legalTargets(spec, ctx.src, ctx.you);
          const choice = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseTargets', spec, candidates, min: 1, max: 1, src: ctx.src,
            prompt: spec.prompt, aiHint: spec.aiHint,
          });
          if (!choice[0] || !candidates.includes(choice[0])) return false;
          ctx.targets.push(choice[0]);
        }
        return true;
      },
      run: async ctx => {
        let targetIndex = 0;
        for (const mode of ctx.chosenModes || []) {
          if (mode === 0) { const target = ctx.targets[targetIndex++]; if (target) await ctx.g.destroy(target); }
          else if (mode === 1) { const player = ctx.targets[targetIndex++]; if (player) await ctx.g.gainLife(player, 5); }
          else if (mode === 2) await ctx.g.makeTokens('elementsRhino44', ctx.you);
          else if (mode === 3) { const target = ctx.targets[targetIndex++]; if (target) ctx.g.addCounters(target, 'shield', 1, false, ctx.you); }
        }
      } }],
  };
  SC['Maelstrom Wanderer'] = {
    cascade: 2,
    statics: [{ apply: (g, self, bf) => { for (const card of bf) if (card.ctrl === self.ctrl && card.is('Creature')) card.cur.kw.add('haste'); } }],
  };
  SC['Crib Swap'] = {
    targets: [T.creature({ prompt: 'Exile creature', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { const target = ctx.targets[0]; if (!target) return; const controller = target.ctrl; await ctx.g.exileCard(target); await ctx.g.makeTokens('elementsShapeshifter11', controller); },
  };
  SC['Return of the Wildspeaker'] = {
    modes: { pick: 1, list: [{ label: 'Draw cards' }, { label: 'Non-Humans +3/+3' }] },
    resolve: async ctx => {
      if ((ctx.mode || [0])[0] === 0) await ctx.g.draw(ctx.you, Math.max(0, ...ctx.g.creatures(ctx.you).filter(card => !card.hasSub('Human')).map(card => card.power)));
      else E.pumpAllUntilEOT(ctx.g, card => card.ctrl === ctx.you && card.is('Creature') && !card.hasSub('Human'), 3, 3);
    },
  };
  SC['Kindred Summons'] = {
    resolve: async ctx => {
      const type = await chooseType(ctx.g, ctx.you, ctx.src);
      const need = ctx.g.creatures(ctx.you).filter(card => card.hasSub(type)).length;
      const revealed = []; const hits = [];
      while (ctx.you.library.length && hits.length < need) {
        const card = ctx.you.library.pop(); revealed.push(card);
        if (card.is('Creature') && card.hasSub(type)) hits.push(card);
      }
      for (const card of hits) { card.zone = 'nowhere'; await ctx.g.move(card, 'battlefield', { ctrl: ctx.you }); }
      const rest = revealed.filter(card => !hits.includes(card)); U.shuffle(rest, ctx.g.rnd);
      for (const card of rest) { card.zone = 'library'; ctx.you.library.unshift(card); }
    },
  };
  SC["Kodama's Reach"] = { resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, bfN: 1, toHandN: 1, tapped: true }); } };
  SC['Distant Melody'] = { resolve: async ctx => { const type = await chooseType(ctx.g, ctx.you, ctx.src); await ctx.g.draw(ctx.you, ctx.g.bf().filter(card => card.ctrl === ctx.you && card.hasSub(type)).length); } };
  SC['Shatter the Sky'] = { resolve: async ctx => {
    for (const player of ctx.g.alivePlayers()) if (ctx.g.creatures(player).some(card => card.power >= 4)) await ctx.g.draw(player, 1);
    await ctx.g.destroyMany(ctx.g.bf().filter(card => card.is('Creature')));
  } };
  SC['Elemental Spectacle'] = { resolve: async ctx => {
    const n = colorsControlled(ctx.g, ctx.you); await ctx.g.makeTokens('elementsElemental55', ctx.you, { n }); await ctx.g.gainLife(ctx.you, ctx.g.creatures(ctx.you).length);
  } };
  SC['Haunting Voyage'] = {
    foretell: { cost: '{5}{B}{B}' },
    resolve: async ctx => {
      const type = await chooseType(ctx.g, ctx.you, ctx.src);
      const pool = ctx.you.graveyard.filter(card => card.is('Creature') && card.hasSub(type));
      let picks = pool;
      if (!(ctx.so.castOpts && ctx.so.castOpts.foretell)) picks = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: pool, min: 0, max: 2, prompt: 'Haunting Voyage: up to two creatures', aiHint: { kind: 'gyRecur' },
      });
      for (const card of picks.slice()) await putCreatureFromGraveyard(ctx.g, ctx.you, card);
    },
  };
  SC['Timeless Lotus'] = { entersTapped: true, mana: { cost: { tap: true }, produce: [{ W: 1, U: 1, B: 1, R: 1, G: 1 }] } };
  SC['Abundant Growth'] = {
    aura: true, auraTarget: [T.permanent((g, card) => card.is('Land'), { prompt: 'Enchant land', aiHint: { goal: 'ramp' } })],
    triggers: [{ on: 'etb', desc: 'Draw', filter: etbSelf, run: async ctx => { await ctx.g.draw(ctx.you, 1); } }],
    statics: [{ apply: (g, self) => { const land = self.attachedTo && g.byIid(self.attachedTo); if (land) land.cur.extraMana.push({ cost: { tap: true }, produce: [{ ANY: true, n: 1 }] }); } }],
  };
  SC['Cream of the Crop'] = {
    triggers: [{ on: 'etb', desc: 'Arrange top cards', opt: true,
      filter: (g, self, data) => data.card.ctrl === self.ctrl && data.card.is('Creature'),
      run: async ctx => {
        const top = ctx.you.library.slice(-Math.max(0, ctx.data.card.power)); if (!top.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: top, min: 1, max: 1,
          prompt: 'Cream of the Crop: card to keep on top', aiHint: { kind: 'bestCard' } });
        const chosen = pick[0] || top[0]; const bottom = top.filter(card => card !== chosen);
        for (const card of top) ctx.you.library.splice(ctx.you.library.indexOf(card), 1);
        const order = bottom.length > 1 ? await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: bottom, min: bottom.length, max: bottom.length,
          prompt: 'Order cards for the bottom', aiHint: { kind: 'orderBottom' } }) : bottom;
        ctx.you.library.unshift(...order); ctx.you.library.push(chosen);
      },
    }],
  };
  SC['Fertile Ground'] = {
    aura: true, auraTarget: [T.permanent((g, card) => card.is('Land'), { prompt: 'Enchant land', aiHint: { goal: 'ramp' } })],
    landTapHook: async (g, self, land, player) => {
      if (self.attachedTo !== land.iid) return;
      const color = await player.controller.decide(g, {
        type: 'chooseOption', prompt: 'Fertile Ground: choose the extra mana',
        options: COLORS.map(key => ({ key, label: key })), aiHint: { kind: 'manaColor' },
      });
      const chosen = COLORS.includes(color) ? color : 'G';
      player.pool[chosen] = (player.pool[chosen] || 0) + 1;
    },
  };
  SC['Hoofprints of the Stag'] = {
    triggers: [{ on: 'draw', desc: 'Hoofprint counter', opt: true, filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => { ctx.g.addCounters(ctx.src, 'hoofprint', 1); } }],
    abilities: [{ label: '4/4 flying Elemental', sorcery: true, cost: { mana: '{2}{W}', rmCounter: { kind: 'hoofprint', n: 4 } },
      cond: (g, card) => (card.counters.hoofprint || 0) >= 4,
      run: async ctx => { await ctx.g.makeTokens('elementsElemental44F', ctx.you); }, aiScore: () => 4 }],
  };
  SC['Springleaf Parade'] = {
    triggers: [{ on: 'etb', desc: 'X changelings', filter: etbSelf,
      run: async ctx => { await ctx.g.makeTokens('elementsShapeshifter11', ctx.you, { n: ctx.src.castMeta?.x || 0 }); } }],
    statics: [{ apply: (g, self, bf) => { for (const token of bf) if (token.ctrl === self.ctrl && token.is('Creature') && token.isToken) {
      token.cur.extraMana.push({ cost: { tap: true }, produce: [{ ANY: true, n: 1 }], creatureOK: false });
    } } }],
  };
  SC["Descendants' Fury"] = {
    triggers: [{ on: 'combatDamageGroupToPlayer', desc: 'Sacrifice and reveal', opt: true,
      filter: (g, self, data) => data.cards.some(card => card.ctrl === self.ctrl && card.is('Creature')),
      run: async ctx => {
        const dealt = ctx.data.cards.filter(card => card.ctrl === ctx.you && card.zone === 'battlefield');
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: dealt, min: 0, max: 1,
          prompt: "Descendants' Fury: sacrifice a creature", aiHint: { kind: 'sacOwn' } });
        const sacrificed = pick[0]; if (!sacrificed) return;
        const types = (sacrificed.cur.subtypes || []).slice(); if (!await ctx.g.sacrifice(ctx.you, sacrificed)) return;
        const revealed = []; let hit = null;
        while (ctx.you.library.length) { const card = ctx.you.library.pop(); revealed.push(card); if (card.is('Creature') && types.some(type => card.hasSub(type))) { hit = card; break; } }
        if (hit) { hit.zone = 'nowhere'; await ctx.g.move(hit, 'battlefield', { ctrl: ctx.you }); }
        const rest = revealed.filter(card => card !== hit); U.shuffle(rest, ctx.g.rnd); for (const card of rest) { card.zone = 'library'; ctx.you.library.unshift(card); }
      },
    }],
  };
  SC['Abundant Countryside'] = {
    producesColors: COLORS,
    mana: [{ cost: { tap: true }, produce: [{ C: 1 }] }, {
      cost: { tap: true }, produce: [{ ANY: true, n: 1 }], restrictAbilities: true,
      restrict: (g, action) => action && !action.isAbility && action.card && action.card.is('Creature'),
    }],
    abilities: [{ label: 'Create a changeling', cost: { tap: true, mana: '{6}' },
      run: async ctx => { await ctx.g.makeTokens('elementsShapeshifter11', ctx.you); }, aiScore: () => 2 }],
  };
  SC['Ancient Ziggurat'] = { producesColors: COLORS, mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }], restrictAbilities: true,
    restrict: (g, action) => action && !action.isAbility && action.card && action.card.is('Creature') } };
  SC['Flamekin Village'] = {
    producesColors: ['R'],
    asEnters: async (g, card) => {
      const pool = card.ctrl.hand.filter(other => other !== card && other.hasSub('Elemental'));
      const reveal = pool.length ? await card.ctrl.controller.decide(g, { type: 'chooseCards', from: pool, min: 0, max: 1,
        prompt: 'Reveal an Elemental for Flamekin Village', aiHint: { kind: 'revealLand' } }) : [];
      card.meta.revealedElemental = !!reveal[0];
    },
    entersTapped: (g, card) => !card.meta.revealedElemental,
    mana: { cost: { tap: true }, produce: [{ R: 1 }] },
    abilities: [{ label: 'Give haste', cost: { tap: true, mana: '{R}' }, targets: [T.yourCreature({ prompt: 'Creature gets haste', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) E.grantUntilEOT(ctx.g, ctx.targets[0], ['haste']); } }],
  };
  SC['Frontier Bivouac'] = makeTriLand('G', 'U', 'R');
  SC['Jungle Shrine'] = makeTriLand('R', 'G', 'W');
  SC['Opulent Palace'] = makeTriLand('B', 'G', 'U');
  SC['Opal Palace'] = {
    producesColors: COLORS,
    mana: [{ cost: { tap: true }, produce: [{ C: 1 }] }, {
      cost: { tap: true, mana: '{1}' }, produce: (g, card, player) => player.colorIdentity.map(color => ({ [color]: 1 })),
      restrict: (g, action) => !!(action && action.card && action.card.commander),
      onProduce: async (g, card, player, chosen, action) => { if (action && action.card && action.card.commander) {
        player.opalPalacePending = { commander: action.card, n: (action.card.cmdCasts || 0) + 1 };
      } },
    }],
    triggers: [{ on: 'etb', desc: 'Commander counters', filter: (g, self, data) => data.card.commander && data.card.ctrl === self.ctrl &&
      self.ctrl.opalPalacePending && self.ctrl.opalPalacePending.commander === data.card,
      run: async ctx => { const pending = ctx.you.opalPalacePending; delete ctx.you.opalPalacePending; if (pending) ctx.g.addCounters(ctx.data.card, '+1/+1', pending.n, false, ctx.you); } }],
  };
  SC['Primal Beyond'] = {
    producesColors: COLORS,
    asEnters: async (g, card) => {
      const pool = card.ctrl.hand.filter(other => other !== card && other.hasSub('Elemental'));
      const reveal = pool.length ? await card.ctrl.controller.decide(g, { type: 'chooseCards', from: pool, min: 0, max: 1,
        prompt: 'Reveal an Elemental for Primal Beyond', aiHint: { kind: 'revealLand' } }) : [];
      card.meta.revealedElemental = !!reveal[0];
    },
    entersTapped: (g, card) => !card.meta.revealedElemental,
    mana: [{ cost: { tap: true }, produce: [{ C: 1 }] }, {
      cost: { tap: true }, produce: [{ ANY: true, n: 1 }], restrictAbilities: true,
      restrict: (g, action) => action && action.card && action.card.hasSub && action.card.hasSub('Elemental'),
    }],
  };

  // These two hooks are deliberately local to the Elements module. They expose
  // Ashling's granted evoke option and pay the pitch-card part of Endurance/Fury
  // through the same cast path used by both the human UI and deterministic AI.
  const gameProto = MTG.Game && MTG.Game.prototype;
  if (gameProto && !gameProto._danceElementsCastHooks) {
    gameProto._danceElementsCastHooks = true;
    const baseCastable = gameProto.castableList;
    const baseCastSpell = gameProto.castSpell;
    gameProto.castableList = function (player) {
      const result = baseCastable.call(this, player);
      const ashling = this.bf().some(card => card.ctrl === player && card.name === 'Ashling, the Limitless');
      if (!ashling) return result;
      const alt = { label: 'Evoke {4} (Ashling)', altCostStr: '{4}', evoke: true, ashlingEvoke: true };
      for (const card of player.hand) {
        if (!isPermanentSpell(card) || !card.hasSub('Elemental') || result.some(entry => entry.card === card && entry.alt && entry.alt.ashlingEvoke)) continue;
        if (!this.canCastTiming(player, card, alt) || !this.canPayMana(player, U.parseCost('{4}'), { card })) continue;
        const specs = this.spellTargetSpecs(card, alt, player) || [];
        if (specs.some(spec => !spec.upTo && this.legalTargets(spec, card, player).length < (spec.count ?? 1))) continue;
        result.push({ card, from: 'hand', alt });
      }
      return result;
    };
    gameProto.castSpell = async function (player, card, opts = {}) {
      const alt = opts.alt || {};
      let pitch = null;
      if (alt.pitchColor) {
        const pool = player.hand.filter(other => other !== card && other.colors.includes(alt.pitchColor));
        if (!pool.length) return false;
        const pick = await player.controller.decide(this, {
          type: 'chooseCards', from: pool, min: 1, max: 1,
          prompt: `${card.name}: exile a ${alt.pitchColor === 'G' ? 'green' : 'red'} card for evoke`,
          aiHint: { kind: 'pitchCard', card, color: alt.pitchColor },
        });
        pitch = pick[0]; if (!pitch || !pool.includes(pitch)) return false;
        await this.move(pitch, 'exile');
      }
      const ok = await baseCastSpell.call(this, player, card, opts);
      if (!ok && pitch && pitch.zone === 'exile') await this.move(pitch, 'hand');
      return ok;
    };
  }
})();
