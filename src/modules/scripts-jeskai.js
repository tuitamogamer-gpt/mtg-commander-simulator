// ===== scripts-jeskai.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// JESKAI STRIKER — commander: Shiko and Narset, Unified
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS;

  const etbSelf = (g, self, data) => data.card === self;
  const attacksSelf = (g, self, data) => data.card === self;
  const anyTarget = prompt => ({ what: 'any', prompt, aiHint: { goal: 'damage' } });
  const tok = (name, subtypes, power, toughness, colors, kws, extra) => Object.assign({
    name, cost: null, super: [], types: ['Creature'], subtypes,
    power: String(power), toughness: String(toughness), oracle: '',
    colorsOverride: colors || [], kws: kws || [], isTokenDef: true,
  }, extra || {});

  TK.jeskaiMonk = TK.jeskaiMonk || tok('Monk', ['Monk'], 1, 1, ['W'], ['prowess']);
  TK.firstMateRagavan = TK.firstMateRagavan || tok(
    'First Mate Ragavan', ['Monkey', 'Pirate'], 2, 1, ['R'], [], { super: ['Legendary'] },
  );

  function zoneManaValue(card) {
    if (!card || !card.def) return 0;
    if (card.def.altMode === 'Split' && card.def.alt) {
      return U.mv(card.def.cost || '') + U.mv(card.def.alt.cost || '');
    }
    return U.mv(card.def.cost || '');
  }

  function stackManaValue(spell) {
    if (!spell || !spell.card) return 0;
    const opts = spell.castOpts || {};
    return opts.splitHalf || opts.splitFuse
      ? U.mv(opts.altCostStr || '', spell.x || 0)
      : U.mv(spell.card.def.cost || '', spell.x || 0);
  }

  function spellSharesType(first, candidate) {
    const firstTypes = first.card.def.types || [];
    const candidateTypes = candidate.def.types || [];
    return firstTypes.some(type => candidateTypes.includes(type));
  }

  async function chooseCards(game, player, pool, min, max, prompt, aiHint) {
    if (!pool.length || max <= 0) return [];
    const picked = await player.controller.decide(game, {
      type: 'chooseCards', from: pool, min, max: Math.min(max, pool.length), prompt,
      aiHint: aiHint || { kind: 'bestCard' },
    });
    return Array.isArray(picked)
      ? [...new Set(picked)].filter(card => pool.includes(card)).slice(0, max)
      : [];
  }

  async function chooseOne(game, player, pool, prompt, aiHint, optional) {
    return (await chooseCards(game, player, pool, optional ? 0 : 1, 1, prompt, aiHint))[0] || null;
  }

  async function chooseOption(game, player, prompt, options, aiHint) {
    const chosen = await player.controller.decide(game, {
      type: 'chooseOption', prompt, options, aiHint,
    });
    return options.some(option => option.key === chosen) ? chosen : options[0].key;
  }

  async function mayCastFree(game, player, card, from) {
    const choice = await chooseOption(game, player, `Cast ${card.name} without paying its mana cost?`, [
      { key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' },
    ], { kind: 'freeCast', card });
    if (choice !== 'yes' || card.zone !== from) return false;
    return game.castSpell(player, card, { from, free: true });
  }

  async function exileUntilNonlandAndMayCast(game, player) {
    const revealed = [];
    let hit = null;
    while (player.library.length) {
      const card = player.library[player.library.length - 1];
      await game.move(card, 'exile');
      revealed.push(card);
      if (!card.is('Land')) { hit = card; break; }
    }
    if (revealed.length) await game.revealToHuman({ cards: revealed, ctrl: player, kind: 'reveal' });
    if (hit && hit.zone === 'exile') await mayCastFree(game, player, hit, 'exile');
  }

  async function copyThenReturnSpell(ctx, target) {
    if (!target || !ctx.g.stack.includes(target)) return false;
    const copy = await ctx.g.copySpell(target, ctx.you, { mayNewTargets: true, copySource: ctx.src });
    const index = ctx.g.stack.indexOf(target);
    if (index < 0) return false;
    ctx.g.stack.splice(index, 1);
    if (target.isCopy) {
      ctx.g.lg(`${target.name} ceases to exist after leaving the stack.`);
    } else if (target.card.zone === 'stack') {
      await ctx.g.move(target.card, 'hand');
    }
    ctx.g.note('stack', {});
    return true;
  }

  async function counterExileAndMayCast(ctx, target) {
    if (!target || !ctx.g.stack.includes(target) || MTG.isUncounterable(ctx.g, target)) return false;
    const card = target.card;
    if (!await ctx.g.counterStackObject(target, { source: ctx.src, toZone: 'exile' })) return false;
    if (target.isCopy) return true;
    if (card.zone === 'exile') await mayCastFree(ctx.g, ctx.you, card, 'exile');
    return true;
  }

  SC['Shiko and Narset, Unified'] = {
    triggers: [{
      on: 'castSecond', desc: 'Flurry — copy the targeted spell or draw',
      filter: (game, self, data) => data.player === self.ctrl,
      run: async ctx => {
        const spell = ctx.data.so;
        const targetsPermanentOrPlayer = (spell.targets || []).flat().some(target =>
          target instanceof MTG.Player || target instanceof MTG.CardInst && target.zone === 'battlefield');
        if (targetsPermanentOrPlayer && ctx.g.stack.includes(spell)) {
          const copy = await ctx.g.copySpell(spell, ctx.you, { mayNewTargets: true, copySource: ctx.src });
          if (copy) return;
        }
        await ctx.g.draw(ctx.you, 1);
      },
    }],
  };

  SC['Baral and Kari Zev'] = {
    triggers: [{
      on: 'castIS', desc: 'First instant or sorcery — free lesser spell or First Mate Ragavan',
      filter: (game, self, data) => {
        if (data.player !== self.ctrl) return false;
        const casts = data.player.turnState.spellsCastList.filter(entry => {
          const opts = entry.so && entry.so.castOpts || {};
          return entry.card.is('Instant') || entry.card.is('Sorcery') ||
            !!opts.adventure && /Instant|Sorcery/.test(opts.types || entry.card.def.adventure && entry.card.def.adventure.types || '');
        });
        return casts.length === 1 && casts[0].so === data.so;
      },
      run: async ctx => {
        const first = ctx.data.so;
        const firstMV = ctx.data.mv;
        const pool = ctx.you.hand.filter(card => !card.is('Land') && zoneManaValue(card) < firstMV && spellSharesType(first, card));
        const chosen = await chooseOne(ctx.g, ctx.you, pool,
          'Cast a lesser spell that shares a card type without paying its mana cost',
          { kind: 'freeCast', cards: pool }, true);
        let cast = false;
        if (chosen) cast = await ctx.g.castSpell(ctx.you, chosen, { from: 'hand', free: true });
        if (!cast) await ctx.g.makeTokens('firstMateRagavan', ctx.you, { haste: true });
      },
    }],
  };

  SC['Elsha, Threefold Master'] = { triggers: [{
    on: 'combatDamageToPlayer', desc: 'Create Monk tokens equal to combat damage',
    filter: (game, self, data) => data.card === self && data.n > 0,
    run: async ctx => { await ctx.g.makeTokens('jeskaiMonk', ctx.you, { n: ctx.data.n }); },
  }] };

  SC['Monastery Mentor'] = { triggers: [{
    on: 'castNonCreature', desc: 'Create a Monk with prowess',
    filter: (game, self, data) => data.player === self.ctrl,
    run: async ctx => { await ctx.g.makeTokens('jeskaiMonk', ctx.you); },
  }] };

  SC['Mangara, the Diplomat'] = { triggers: [{
    on: 'attackersDeclared', desc: 'Draw for two or more attackers at you',
    filter: (game, self, data) => data.player !== self.ctrl && data.attackers.filter(attacker =>
      attacker.attacking === self.ctrl || attacker.attacking instanceof MTG.CardInst && attacker.attacking.ctrl === self.ctrl).length >= 2,
    run: async ctx => { await ctx.g.draw(ctx.you, 1); },
  }, {
    on: 'castSecond', desc: "Draw for an opponent's second spell",
    filter: (game, self, data) => data.player !== self.ctrl,
    run: async ctx => { await ctx.g.draw(ctx.you, 1); },
  }] };

  SC['Voracious Bibliophile'] = { triggers: [{
    on: 'cast', desc: 'Draw for each target',
    filter: (game, self, data) => data.player === self.ctrl && (data.so.targets || []).flat().filter(Boolean).length > 0,
    run: async ctx => { await ctx.g.draw(ctx.you, (ctx.data.so.targets || []).flat().filter(Boolean).length); },
  }] };

  SC['Caldera Pyremaw'] = { triggers: [{
    on: 'castIS', desc: 'Grow, then deal damage equal to power',
    filter: (game, self, data) => data.player === self.ctrl,
    targets: [T.opponent({ prompt: 'Opponent for Caldera Pyremaw damage', aiHint: { goal: 'damage' } })],
    run: async ctx => {
      if (ctx.src.zone !== 'battlefield') return;
      ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you);
      if (ctx.targets[0]) await ctx.g.damagePlayer(ctx.src, ctx.targets[0], ctx.src.power);
    },
  }] };

  SC['Lier, Disciple of the Drowned'] = {
    grantsFlashback: true,
    uncounterableSpells: 'all',
  };

  SC['Transcendent Dragon'] = { triggers: [{
    on: 'etb', desc: 'Counter, exile, then cast the spell',
    filter: (game, self, data) => etbSelf(game, self, data) && self.meta._enteredFromZone === 'stack',
    targets: [T.spell(null, { prompt: 'Spell to counter and exile', aiHint: { goal: 'counterspell' } })],
    run: async ctx => { await counterExileAndMayCast(ctx, ctx.targets[0]); },
  }] };

  SC['Velomachus Lorehold'] = { triggers: [{
    on: 'attacks', desc: 'Look at seven and cast a smaller instant or sorcery', filter: attacksSelf,
    run: async ctx => {
      const seen = ctx.you.library.slice(-7);
      for (const card of seen) ctx.you.library.splice(ctx.you.library.indexOf(card), 1);
      const eligible = seen.filter(card => (card.is('Instant') || card.is('Sorcery')) && zoneManaValue(card) <= ctx.src.power);
      const chosen = await chooseOne(ctx.g, ctx.you, eligible,
        `Cast an instant or sorcery with mana value ${ctx.src.power} or less`,
        { kind: 'freeCast', cards: eligible }, true);
      let cast = false;
      if (chosen) {
        chosen.zone = 'library';
        cast = await ctx.g.castSpell(ctx.you, chosen, { from: 'library', free: true });
      }
      const rest = seen.filter(card => card !== chosen || !cast);
      U.shuffle(rest, ctx.g.rnd);
      for (const card of rest) card.zone = 'library';
      ctx.you.library.unshift(...rest);
    },
  }] };

  SC.Consider = { resolve: async ctx => { await E.surveil(ctx.g, ctx.you, 1); await ctx.g.draw(ctx.you, 1); } };

  SC.Electrodominance = {
    xCost: true,
    targets: [anyTarget('Any target for Electrodominance')],
    resolve: async ctx => {
      if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], ctx.x || 0);
      const pool = ctx.you.hand.filter(card => card !== ctx.src && !card.is('Land') && zoneManaValue(card) <= (ctx.x || 0));
      const chosen = await chooseOne(ctx.g, ctx.you, pool,
        `Cast a spell with mana value ${ctx.x || 0} or less without paying its mana cost`,
        { kind: 'freeCast', cards: pool }, true);
      if (chosen) await ctx.g.castSpell(ctx.you, chosen, { from: 'hand', free: true });
    },
  };

  SC["Narset's Reversal"] = {
    targets: [T.spell((game, spell) => spell.card.is('Instant') || spell.card.is('Sorcery'), {
      prompt: 'Instant or sorcery spell to copy and return', aiHint: { goal: 'copySpell' },
    })],
    resolve: async ctx => { await copyThenReturnSpell(ctx, ctx.targets[0]); },
  };

  SC['Frantic Search'] = { resolve: async ctx => {
    await ctx.g.draw(ctx.you, 2);
    const discardN = Math.min(2, ctx.you.hand.length);
    const discarded = await chooseCards(ctx.g, ctx.you, ctx.you.hand, discardN, discardN,
      'Discard two cards', { kind: 'discard' });
    await ctx.g.discard(ctx.you, discarded);
    const lands = ctx.g.lands(ctx.you).filter(land => land.tapped);
    const picked = await chooseCards(ctx.g, ctx.you, lands, 0, Math.min(3, lands.length),
      'Untap up to three lands', { kind: 'untapLands' });
    for (const land of picked) land.tapped = false;
    ctx.g.recalc();
  } };

  SC['Transforming Flourish'] = {
    demonstrate: true,
    targets: [T.permanent((game, card, ctrl) => card.ctrl !== ctrl && (card.is('Artifact') || card.is('Creature')), {
      prompt: "Artifact or creature you don't control", aiHint: { goal: 'removal' },
    })],
    resolve: async ctx => {
      const target = ctx.targets[0];
      if (!target || target.zone !== 'battlefield') return;
      const controller = target.ctrl;
      if (await ctx.g.destroy(target)) await exileUntilNonlandAndMayCast(ctx.g, controller);
    },
  };

  SC['Expansion // Explosion'] = {
    targets: [T.spell((game, spell) =>
      (spell.card.is('Instant') || spell.card.is('Sorcery')) && stackManaValue(spell) <= 4, {
      prompt: 'Instant or sorcery spell with mana value 4 or less', aiHint: { goal: 'copySpell' },
    })],
    resolve: async ctx => {
      const target = ctx.targets[0];
      if (target && ctx.g.stack.includes(target)) await ctx.g.copySpell(target, ctx.you, { mayNewTargets: true, copySource: ctx.src });
    },
    splitHalves: {
      explosion: {
        targets: [anyTarget('Any target for Explosion damage'), T.player({
          prompt: 'Player who draws X cards', aiHint: { goal: 'draw' },
        })],
        resolve: async ctx => {
          if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], ctx.x || 0);
          if (ctx.targets[1]) await ctx.g.draw(ctx.targets[1], ctx.x || 0);
        },
      },
    },
    altCosts: [{
      name: 'Explosion', label: 'Explosion', altCostStr: '{X}{U}{U}{R}{R}', speed: 'instant', splitHalf: 'explosion',
    }],
  };

  SC['Ancestral Vision'] = {
    suspend: { cost: '{U}', n: 4 },
    targets: [T.player({ prompt: 'Player who draws three cards', aiHint: { goal: 'draw' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.draw(ctx.targets[0], 3); },
  };

  SC['Compulsive Research'] = {
    targets: [T.player({ prompt: 'Player who draws and discards', aiHint: { goal: 'draw' } })],
    resolve: async ctx => {
      const player = ctx.targets[0];
      if (!player) return;
      await ctx.g.draw(player, 3);
      const lands = player.hand.filter(card => card.is('Land'));
      const options = [];
      if (lands.length) options.push({ key: 'land', label: 'Discard a land card' });
      if (player.hand.length >= 2) options.push({ key: 'two', label: 'Discard two cards' });
      if (!options.length) return;
      const mode = await chooseOption(ctx.g, player, 'Compulsive Research — discard', options,
        { kind: 'discardChoice', card: ctx.src });
      const pool = mode === 'land' ? lands : player.hand;
      const n = mode === 'land' ? 1 : Math.min(2, pool.length);
      const discarded = await chooseCards(ctx.g, player, pool, n, n,
        mode === 'land' ? 'Discard a land card' : 'Discard two cards', { kind: 'discard' });
      await ctx.g.discard(player, discarded);
    },
  };

  SC['Will of the Jeskai'] = {
    modes: {
      pick: (game, player) => game.bf().some(card => card.ctrl === player && card.commander) ? 'any' : 1,
      min: 1,
      list: [
        { label: 'Each player may discard their hand and draw five cards' },
        { label: 'Your graveyard instants and sorceries gain flashback this turn' },
      ],
    },
    resolve: async ctx => {
      if (ctx.mode.includes(0)) {
        for (const player of ctx.g.apnapFrom(ctx.you)) {
          const choice = await chooseOption(ctx.g, player, 'Discard your hand and draw five cards?', [
            { key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' },
          ], { kind: 'wheelChoice', card: ctx.src });
          if (choice !== 'yes') continue;
          await ctx.g.discard(player, player.hand.slice());
          await ctx.g.draw(player, 5);
        }
      }
      if (ctx.mode.includes(1)) {
        for (const card of ctx.you.graveyard) {
          if ((card.is('Instant') || card.is('Sorcery')) && card.def.cost) card.meta.flashbackUntil = ctx.g.turnNo;
        }
      }
    },
  };

  SC['Adaptive Training Post'] = {
    triggers: [{
      on: 'castIS', desc: 'Put a charge counter on Adaptive Training Post',
      filter: (game, self, data) => data.player === self.ctrl && (self.counters.charge || 0) < 3,
      run: async ctx => {
        if (ctx.src.zone === 'battlefield' && (ctx.src.counters.charge || 0) < 3) {
          ctx.g.addCounters(ctx.src, 'charge', 1, false, ctx.you);
        }
      },
    }],
    abilities: [{
      label: 'Remove three charge counters: copy your next instant or sorcery this turn',
      cost: { rmCounter: { kind: 'charge', n: 3 } },
      run: async ctx => {
        const source = ctx.src, player = ctx.you;
        ctx.g.delayed.push({
          on: 'castIS', once: true, expires: 'eot', ctrl: player, src: source,
          name: 'Adaptive Training Post — copy the next instant or sorcery',
          filter: (game, data) => data.player === player,
          run: async delayed => {
            const spell = delayed.data.so;
            if (delayed.g.stack.includes(spell)) {
              await delayed.g.copySpell(spell, player, { mayNewTargets: true, copySource: source });
            }
          },
        });
      },
      aiScore: (game, card) => (card.counters.charge || 0) >= 3 ? 7 : 0,
    }],
  };

  SC['Aligned Heart'] = { triggers: [{
    on: 'castSecond', desc: 'Flurry — rally and create Monks',
    filter: (game, self, data) => data.player === self.ctrl,
    run: async ctx => {
      if (ctx.src.zone !== 'battlefield') return;
      ctx.g.addCounters(ctx.src, 'rally', 1, false, ctx.you);
      await ctx.g.makeTokens('jeskaiMonk', ctx.you, { n: ctx.src.counters.rally || 0 });
    },
  }] };

  SC['Tempest Technique'] = {
    storm: true,
    auraTarget: [T.yourCreature({ prompt: 'Creature you control to enchant', aiHint: { goal: 'buff' } })],
    statics: [{
      apply: (game, self, battlefield) => {
        if (!self.attachedTo) return;
        const host = battlefield.find(card => card.iid === self.attachedTo);
        if (!host) return;
        const enchantments = battlefield.filter(card => card.ctrl === self.ctrl && card.is('Enchantment')).length;
        host.cur.power += enchantments;
        host.cur.toughness += enchantments;
      },
    }],
  };

  SC['Perilous Landscape'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    cycling: { cost: '{U}{R}{W}' },
    abilities: [{
      label: 'Search for a basic Island, Mountain, or Plains', cost: { tap: true, sacSelf: true },
      run: async ctx => {
        await E.searchBasic(ctx.g, ctx.you, {
          n: 1, tapped: true,
          filter: def => ['Island', 'Mountain', 'Plains'].some(type => (def.subtypes || []).includes(type)),
          prompt: 'Choose a basic Island, Mountain, or Plains',
        });
      },
      aiScore: () => 5,
    }],
  };
})();
