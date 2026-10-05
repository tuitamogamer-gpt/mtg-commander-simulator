// ===== scripts-commander-staples.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Explicit implementations for the manual Oracle batch
// `manual-commander-staples`: Smothering Tithe, Esper Sentinel, Orcish
// Bowmasters, Necropotence, Underworld Breach, Mana Drain and Urza, Lord High
// Artificer. Each card uses the normal Stack, trigger, target, cost, mana and
// casting-permission paths. Provenance and the pending snapshot verification
// are recorded in reports/oracle-import/commander-staples-cards.json.
(function () {
  const M = MTG, C = M.FDC, E = M.E, T = M.T, SC = M.SCRIPTS, G = M.Game.prototype;
  const BATCH = 'manual-commander-staples';

  // Names are passed as parameters, never written as script assignments, so
  // the source audit counts each card once (its manual batch row).
  const define = (name, contracts, spec) => {
    const marker = SC[name];
    if (!marker || marker.oracleBatch !== BATCH) throw new Error(name + ': register the manual Oracle batch before its script');
    SC[name] = Object.assign({}, marker, spec, {
      oracleImplemented: true,
      oracleId: marker.oracleId,
      semanticClass: 'manual-deck-semantic',
      oracleContracts: ['manual-oracle-resolution', ...contracts],
    });
  };

  const isOpponent = (controller, player) => !!player && player !== controller && !player.lost;
  // The exact battlefield object that created a triggered or activated ability.
  const sameSource = ctx => ctx.src?.zone === 'battlefield' && !ctx.src.phasedOut &&
    (ctx.sourceZoneVersion == null || ctx.src.zoneVersion === ctx.sourceZoneVersion);

  function availableMana(game, player) {
    try {
      return game.manaSources(player, null).length +
        Object.values(player.pool || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
    } catch (error) {
      return game.lands(player).filter(card => !card.tapped).length;
    }
  }

  // Local AI policy for a "may pay" / "unless that player pays" tax. The bot
  // pays only when the tax costs no more than the opponent would gain and,
  // while it is still developing on its own turn, leaves two mana for its own
  // plays. Human and remote players always receive both choices.
  function aiShouldPayTax(game, payer, amount, worth) {
    if (amount <= 0) return true;
    if (amount > worth) return false;
    if (!game.canPayMana(payer, M.parseCost('{' + amount + '}'))) return false;
    const developing = game.turnPlayer === payer && !['end', 'cleanup'].includes(game.phase) &&
      payer.hand.some(card => !card.is('Land'));
    return availableMana(game, payer) - amount >= (developing ? 2 : 0);
  }

  // The paying player decides. Returns true only when the tax was paid.
  async function payOrDecline(ctx, payer, amount, { worth, prompt, declineLabel }) {
    const game = ctx.g, cost = '{' + Math.max(0, amount) + '}', parsed = M.parseCost(cost);
    if (!payer || payer.lost || !payer.controller) return false;
    if (!game.canPayMana(payer, parsed, { card: ctx.src, isAbility: true })) {
      game.lg(`${payer.name} cannot pay ${cost} for ${ctx.src.name}.`);
      return false;
    }
    if (payer.isAI && !aiShouldPayTax(game, payer, amount, worth)) {
      game.lg(`${payer.name} declines to pay ${cost} for ${ctx.src.name}.`);
      return false;
    }
    const answer = await payer.controller.decide(game, {
      type: 'chooseOption', player: payer, prompt: `${ctx.src.name}: ${prompt}`,
      options: [
        { key: 'yes', label: 'Pay ' + cost, payment: { kind: 'mana', mana: cost } },
        { key: 'no', label: declineLabel },
      ],
      aiHint: { kind: 'oracleUnlessPayment', cost, src: ctx.src },
    });
    if (answer !== 'yes') {
      game.lg(`${payer.name} declines to pay ${cost} for ${ctx.src.name}.`);
      return false;
    }
    const paid = await game.payMana(payer, parsed, { card: ctx.src, isAbility: true });
    if (paid) game.lg(`${payer.name} pays ${cost} for ${ctx.src.name}.`);
    return !!paid;
  }

  // Last known power for abilities that read the source's power on resolution.
  const emit = G.emit;
  G.emit = function (name, data) {
    if (name === 'lto' && data?.snap?.sourceMeta && data.card?.def?.staplesUsesLastKnownPower) {
      data.snap.sourceMeta.staplesLastKnownPower = data.snap.power;
    }
    return emit.call(this, name, data);
  };

  // ---------------------------------------------------------------- Smothering Tithe
  define('Smothering Tithe', ['trigger-stack', 'draw-discard-replacement'], {
    triggers: [{
      on: 'draw', filter: (g, c, d) => isOpponent(c.ctrl, d.player),
      desc: 'That player may pay {2}; otherwise create a Treasure',
      run: async ctx => {
        const paid = await payOrDecline(ctx, ctx.data.player, 2, {
          worth: 2,
          prompt: `pay {2} so ${ctx.you.name} does not create a Treasure?`,
          declineLabel: `Decline — ${ctx.you.name} creates a Treasure`,
        });
        if (!paid) await ctx.g.makeTokens(M.TOKENS.treasure, ctx.you);
      },
    }],
  });

  // ---------------------------------------------------------------- Esper Sentinel
  // X is the power on resolution; after the creature leaves, its last known power.
  const sentinelPower = ctx => Math.max(0, Number(sameSource(ctx) ? ctx.src.power
    : ctx.sourceMeta?.staplesLastKnownPower ?? ctx.staplesTriggerPower ?? 0) || 0);
  define('Esper Sentinel', ['trigger-stack'], {
    staplesUsesLastKnownPower: true,
    triggers: [{
      on: 'cast',
      filter: (g, c, d) => isOpponent(c.ctrl, d.player) && !d.isCreature && d.nthNonCreature === 1,
      desc: 'Draw a card unless that player pays {X}',
      prepareTargets: ctx => { ctx.staplesTriggerPower = Math.max(0, Number(ctx.src.power) || 0); },
      run: async ctx => {
        const x = sentinelPower(ctx);
        const paid = await payOrDecline(ctx, ctx.data.player, x, {
          worth: 3,
          prompt: `pay {${x}} so ${ctx.you.name} does not draw a card?`,
          declineLabel: `Decline — ${ctx.you.name} draws a card`,
        });
        if (!paid) await ctx.g.draw(ctx.you, 1, ctx.src);
      },
    }],
  });

  // ---------------------------------------------------------------- Orcish Bowmasters
  const bowmastersTarget = () => T.any({
    prompt: 'Orcish Bowmasters: 1 damage to any target',
    aiHint: { goal: 'damage', amount: 1, n: 1 },
  });
  async function bowmastersShot(ctx) {
    const target = ctx.targets[0];
    if (target) await ctx.g.damageBatch([{ src: ctx.src, target, n: 1 }]);
    await E.amass(ctx.g, ctx.you, 1);
  }
  define('Orcish Bowmasters', ['trigger-stack', 'target-lock-revalidation', 'amass-army', 'draw-discard-replacement', 'flash-cast-timing'], {
    kws: ['flash'],
    triggers: [
      C.enterTrigger('1 damage to any target, then amass Orcs 1', bowmastersShot, { targets: [bowmastersTarget()] }),
      {
        // c1920DrawStepNth numbers only the active player's draws during
        // their own draw step, so every other opposing draw qualifies.
        on: 'draw', filter: (g, c, d) => isOpponent(c.ctrl, d.player) && d.c1920DrawStepNth !== 1,
        desc: 'An opponent drew an extra card: 1 damage to any target, then amass Orcs 1',
        targets: [bowmastersTarget()], run: bowmastersShot,
      },
    ],
  });

  // ---------------------------------------------------------------- Necropotence
  const pendingNecropotence = (game, player) =>
    game.delayed.filter(entry => entry.staplesNecropotence && entry.ctrl === player).length;
  async function necropotenceExile(ctx) {
    const player = ctx.you, card = player.library.at(-1);
    if (!card) return;
    await ctx.g.move(card, 'exile', { exileFaceDown: true, exileLookers: [] });
    if (card.zone !== 'exile') return;
    const row = C.row(card);
    ctx.g.lg(`${player.name} exiles the top card of their library face down (Necropotence).`);
    ctx.g.delayed.push({
      on: 'endStep', once: true, src: ctx.src, ctrl: player, staplesNecropotence: true,
      name: 'Put the face-down card into your hand',
      filter: (g, d) => d.player === player,
      run: async next => { if (C.current(row)) await next.g.move(row.card, 'hand'); },
    });
  }
  // Use spare life on the bot's own main phase, without drawing past the
  // maximum hand size (cleanup discards are exiled) or into lethal range.
  function necropotenceAiScore(game, card, player) {
    if (game.turnPlayer !== player || !['main1', 'main2'].includes(game.phase) || game.stack.length) return 0;
    const pending = pendingNecropotence(game, player);
    if (player.library.length <= pending + 1) return 0;
    if (player.hand.length + pending >= game.maximumHandSize(player)) return 0;
    const threat = player.opponents(game).reduce((sum, opponent) =>
      sum + game.creatures(opponent).reduce((n, creature) => n + Math.max(0, Number(creature.power) || 0), 0), 0);
    if (player.life - 1 <= Math.max(12, threat + 6)) return 0;
    return 3.5 - pending * 0.25;
  }
  define('Necropotence', ['trigger-stack', 'activated-ability-cost', 'mechanic-skip-draw-v9', 'graveyard-zone-change', 'draw-discard-replacement'], {
    c1719SkipDraw: true,
    triggers: [{
      on: 'discarded', filter: (g, c, d) => d.player === c.ctrl,
      desc: 'Exile the discarded card from your graveyard',
      prepareTargets: ctx => {
        const card = ctx.data.card;
        ctx.staplesDiscarded = card && card.zone === 'graveyard' ? C.row(card) : null;
      },
      run: async ctx => {
        const row = ctx.staplesDiscarded;
        if (row && C.current(row)) await ctx.g.move(row.card, 'exile');
      },
    }],
    abilities: [{
      label: 'Pay 1 life: exile the top card of your library face down; it goes to your hand at your next end step',
      cost: { life: 1 }, run: necropotenceExile, aiScore: necropotenceAiScore,
    }],
  });

  // ---------------------------------------------------------------- Underworld Breach
  // Each nonland card in its controller's graveyard gains escape for its mana
  // cost plus exiling three other graveyard cards. The offer uses the engine's
  // escape path, so the chosen cards are exiled after mana payment and the
  // spell counts as escaped. A card without a mana cost has an unpayable
  // escape cost (CR 118.6). Split cards, Rooms and the back faces of
  // double-faced cards are not offered.
  const BREACH = 'staplesBreach';
  const breachLive = (game, player) => game.bf().some(card => card.ctrl === player && card.def.staplesUnderworldBreach && C.live(card));
  function breachVariants(game, card) {
    if (card.def.bdfRoom || card.def.oracleSplit) return [];
    if (card.oracleFaces) {
      const front = card.oracleFaces.faces.find(face => face.key === 'front');
      return front ? [{ oracleFace: 'front', name: front.def.name, cost: front.def.cost }] : [];
    }
    return [{ cost: card.def.cost }];
  }
  function breachOffers(game, player) {
    if (!breachLive(game, player)) return [];
    const out = [];
    for (const card of player.graveyard) {
      if (card.is('Land') || player.graveyard.filter(other => other !== card).length < 3) continue;
      for (const variant of breachVariants(game, card)) {
        if (!variant.cost) continue;
        out.push({ card, from: 'graveyard', alt: {
          ...(variant.oracleFace ? { oracleFace: variant.oracleFace, name: variant.name } : {}),
          escape: true, exileN: 3, altCostStr: variant.cost,
          starterPermission: BREACH, starterCardVersion: card.zoneVersion,
          label: `Escape ${variant.cost} + exile three other cards (Underworld Breach)`,
        } });
      }
    }
    return out;
  }
  const S = M.StarterCasting;
  const previous = { offers: S.offers, allowed: S.allowed, prepare: S.prepare, validate: S.validate, commit: S.commit };
  const matchesBreachOffer = (game, player, card, alt) => breachOffers(game, player).some(row => row.card === card &&
    Object.keys(row.alt).every(key => JSON.stringify(alt[key]) === JSON.stringify(row.alt[key])) &&
    Object.keys(alt).every(key => key === 'from' ? alt[key] === card.zone
      : key === 'xVal' ? Number.isSafeInteger(alt[key]) && alt[key] >= 0
        : JSON.stringify(alt[key]) === JSON.stringify(row.alt[key])));
  S.offers = (game, player) => previous.offers(game, player).concat(breachOffers(game, player));
  S.allowed = (game, player, card, alt) => alt.starterPermission !== BREACH ? previous.allowed(game, player, card, alt)
    : game.canCastTiming(player, card, alt) && matchesBreachOffer(game, player, card, alt);
  S.validate = ctx => ctx.so.castOpts.starterPermission === BREACH
    ? S.allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts) : previous.validate(ctx);
  S.prepare = async (ctx, paid) => ctx.so.castOpts.starterPermission === BREACH
    ? S.allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts) : previous.prepare(ctx, paid);
  S.commit = ctx => ctx.so.castOpts.starterPermission === BREACH ? undefined : previous.commit(ctx);
  // A double-faced card's face choice is checked against the printed
  // graveyard permissions; Breach's granted escape is validated by its offer.
  const castChoiceAllowed = M.OracleV8Faces.castChoiceAllowed;
  M.OracleV8Faces.castChoiceAllowed = (game, player, card, alt) => alt.starterPermission === BREACH
    ? S.allowed(game, player, card, alt) : castChoiceAllowed(game, player, card, alt);
  define('Underworld Breach', ['trigger-stack', 'mechanic-escape', 'graveyard-zone-change'], {
    staplesUnderworldBreach: true,
    triggers: [{
      on: 'endStep', filter: () => true,
      desc: 'Sacrifice it at the beginning of the end step',
      run: async ctx => { if (sameSource(ctx) && ctx.src.ctrl === ctx.you) await ctx.g.sacrifice(ctx.you, ctx.src); },
    }],
  });

  // ---------------------------------------------------------------- Mana Drain
  // "Your next main phase" is whichever of your main phases begins first.
  function atNextMainPhase(game, player, source, name, run) {
    const state = { done: false }, entries = [];
    for (const on of ['precombatMain', 'postcombatMain']) {
      const entry = {
        on, once: true, src: source, ctrl: player, name, staplesNextMainPhase: true,
        filter: (g, d) => d.player === player && !state.done,
        run: async next => {
          state.done = true;
          for (const other of entries) {
            const index = next.g.delayed.indexOf(other);
            if (index >= 0) next.g.delayed.splice(index, 1);
          }
          await run(next);
        },
      };
      entries.push(entry);
      game.delayed.push(entry);
    }
  }
  define('Mana Drain', ['target-lock-revalidation', 'spell-counter', 'spell-add-mana'], {
    targets: [T.spell(null, { prompt: 'Mana Drain: counter target spell', aiHint: { goal: 'counter' } })],
    resolve: async ctx => {
      const so = ctx.targets[0];
      if (!so || !ctx.g.stack.includes(so)) return;
      // A spell that can't be countered is still a legal target, so the
      // delayed mana trigger is created either way.
      const amount = Math.max(0, Number(ctx.g.stackSpellManaValue(so)) || 0);
      await ctx.g.counterStackObject(so, { source: ctx.src });
      const caster = ctx.you;
      atNextMainPhase(ctx.g, caster, ctx.src, `Add ${amount} colorless mana`, async next => {
        if (!(amount > 0) || caster.lost) return;
        caster.pool.C += amount;
        next.g.note('mana', { p: caster });
        next.g.lg(`${caster.name} adds ${amount} colorless mana (Mana Drain).`);
      });
    },
  });

  // ---------------------------------------------------------------- Urza, Lord High Artificer
  async function urzaExile(ctx) {
    const player = ctx.you;
    M.shuffle(player.library, ctx.g.rnd);
    ctx.g.lg(`${player.name} shuffles their library (Urza, Lord High Artificer).`);
    const card = player.library.at(-1);
    if (!card) return;
    await ctx.g.move(card, 'exile');
    if (card.zone !== 'exile') return;
    C.playGrant(ctx, card, { turn: ctx.g.turnNo, free: true });
    ctx.g.lg(`${player.name} exiles ${card.name}; it may be played this turn without paying its mana cost.`);
  }
  // The exiled card is playable only this turn, so the bot activates on its
  // own main phase, when it can still play a land or a sorcery-speed card.
  const urzaAiScore = (game, card, player) => game.turnPlayer === player && ['main1', 'main2'].includes(game.phase) &&
    !game.stack.length && player.library.length > 0 ? 3 : 0;
  define('Urza, Lord High Artificer', ['trigger-stack', 'etb-token-creation', 'continuous-layer', 'mana-source', 'activated-ability-cost', 'cast-permission-v20'], {
    triggers: [C.enterTrigger('Create a 0/0 Construct with +1/+1 for each artifact you control',
      ctx => ctx.g.makeTokens(M.TOKENS.bomConstruct, ctx.you))],
    // Tapping another permanent is not a {T} cost of the tapped artifact, so
    // summoning-sick artifact creatures can pay it.
    mana: { cost: { tapPermanents: { n: 1, filter: (g, card) => card.is('Artifact') } }, produce: [{ U: 1 }] },
    abilities: [{
      label: '{5}: Shuffle, exile the top card; you may play it this turn without paying its mana cost',
      cost: { mana: '{5}' }, run: urzaExile, aiScore: urzaAiScore,
    }],
  });

  M.CommanderStaples = { batch: BATCH, aiShouldPayTax, breachOffers };
})();
