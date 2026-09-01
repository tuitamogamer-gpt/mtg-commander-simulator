// Closed v8 effect descriptors. Oracle text is parsed only by the importer.
((MTG) => {
  const actions = new Set(['resolution-cost', 'player-counter', 'group-sequence', 'delayed-object', 'remove-from-combat']);
  const cardKinds = new Set(['discard', 'sacrifice', 'return', 'tap', 'exile', 'library', 'reveal', 'remove-counter', 'process-exile']);
  const amountKinds = new Set(['count', 'source-stat', 'explicit-source-stat', 'target-stat', 'target-count', 'affected-player-count', 'event-card-stat', 'event-amount', 'turn-count', 'source-counters', 'sum', 'max-stat', 'devotion', 'party', 'died-count', 'source-attachments', 'creature-total-power', 'opponent-count', 'opponent-poison-total']);
  const amountValid = value => Number.isInteger(value) && value >= 0 || value && amountKinds.has(value.kind) &&
    (value.kind !== 'sum' || Array.isArray(value.values) && value.values.every(amountValid));

  function validate(cost) {
    if (!cost || typeof cost !== 'object') throw new Error('Missing resolution payment');
    if (cost.kind === 'alternatives') {
      if (!Array.isArray(cost.choices) || cost.choices.length < 2 || cost.choices.some(row => row.kind === 'alternatives')) throw new Error('Invalid payment alternatives');
      cost.choices.forEach(validate); return;
    }
    if (cost.kind === 'mana') {
      if (typeof cost.mana !== 'string' || !/^(?:\{(?:\d+|[WUBRGCX]|[WUBRG]\/[WUBRG]|2\/[WUBRG]|[WUBRG]\/P)\})+$/.test(cost.mana) ||
          /\{X\}/.test(cost.mana) && !(cost.chooseX === true || amountValid(cost.xValue)) || cost.xMax !== undefined && !amountValid(cost.xMax)) throw new Error('Unsupported resolution mana');
      return;
    }
    if (cost.kind === 'draw') {
      if (!amountValid(cost.n)) throw new Error('Invalid draw payment');
      return;
    }
    if (cost.kind === 'life') {
      if (!amountValid(cost.n)) throw new Error('Invalid life payment');
      return;
    }
    if (!cardKinds.has(cost.kind) || !['battlefield', 'hand', 'graveyard', 'exile'].includes(cost.zone) ||
        cost.sameOwner !== undefined && cost.kind !== 'process-exile' ||
        !(Number.isInteger(cost.n) && cost.n >= 0 || cost.n === 'all' && cost.kind === 'discard' && cost.zone === 'hand')) throw new Error('Unsupported resolution card payment');
    if (cost.kind === 'sacrifice' && cost.zone !== 'battlefield' || cost.kind === 'tap' && cost.zone !== 'battlefield' ||
        cost.kind === 'discard' && cost.zone !== 'hand' || cost.kind === 'remove-counter' && (cost.zone !== 'battlefield' || typeof cost.counter !== 'string') ||
        cost.kind === 'reveal' && cost.zone !== 'hand' || cost.kind === 'library' && !['hand', 'graveyard'].includes(cost.zone) ||
        cost.kind === 'process-exile' && (cost.zone !== 'exile' || cost.owner !== 'opponent' || cost.target !== undefined || cost.filter ||
          cost.sameOwner !== undefined && (cost.sameOwner !== true || cost.n < 2)) ||
        cost.zone === 'exile' && cost.kind !== 'process-exile') throw new Error('Invalid payment zone');
    if (cost.kind === 'library' && !['top', 'bottom'].includes(cost.position)) throw new Error('Invalid payment library position');
  }

  function plan(ctx, cost, helpers) {
    if (cost.kind === 'mana') return { cost, x: cost.xValue !== undefined ? helpers.amount(cost.xValue, ctx) : 0,
      payable: ctx.g.canPayMana(ctx.you, MTG.parseCost(cost.mana), null, { xVal: cost.xValue !== undefined ? helpers.amount(cost.xValue, ctx) : 0 }) };
    if (cost.kind === 'life') {
      const n = helpers.amount(cost.n, ctx); return { cost, n, payable: n === 0 || ctx.you.life >= n };
    }
    if (cost.kind === 'draw') return { cost, n: helpers.amount(cost.n, ctx), payable: true };
    const self = cost.target === 'self';
    let cards = self ? (cost.zone === 'battlefield' ? helpers.sameSource(ctx) : ctx.src.zone === cost.zone && ctx.src.zoneVersion === ctx.sourceZoneVersion) ? [ctx.src] : []
      : cost.target !== undefined ? helpers.subjects(ctx, cost.target) : cost.kind === 'process-exile' ? ctx.g.players.filter(player => player !== ctx.you && !player.lost).flatMap(player => player.exile)
        : cost.zone === 'battlefield' ? ctx.g.bf().filter(card => card.ctrl === ctx.you) : ctx.you[cost.zone];
    const filter = cost.filter && helpers.target({ ...cost.filter, excludeSelf: !!cost.filter.excludeSelf && helpers.sameSource(ctx) }, [], 0, ctx.data).filter;
    cards = [...new Set(cards)].filter(card => card?.zone === cost.zone &&
      (cost.target !== undefined || cost.zone !== 'battlefield' || card.ctrl === ctx.you) &&
      (cost.kind === 'process-exile' ? card.owner !== ctx.you && !card.owner.lost && card.owner.exile.includes(card) : cost.zone === 'battlefield' || cost.target !== undefined || ctx.you[cost.zone].includes(card)) &&
      (!['sacrifice', 'tap', 'return'].includes(cost.kind) || card.ctrl === ctx.you) &&
      (cost.kind !== 'remove-counter' || cost.target !== 'self' || card.ctrl === ctx.you) &&
      (cost.kind !== 'sacrifice' || ctx.g.canSacrifice(card)) && (cost.kind !== 'tap' || !card.tapped) &&
      (cost.kind !== 'remove-counter' || (card.counters[cost.counter] || 0) >= cost.n) &&
      (!filter || filter(ctx.g, card, ctx.you, ctx.src)));
    const n = cost.n === 'all' ? cards.length : cost.kind === 'remove-counter' ? 1 : cost.n;
    const ownerGroups = cost.kind === 'process-exile' && cost.sameOwner
      ? [...new Set(cards.map(card => card.owner))].map(owner => ({ owner, cards: cards.filter(card => card.owner === owner) })).filter(group => group.cards.length >= n)
      : null;
    return { cost, cards, n, payable: ownerGroups ? ownerGroups.length > 0 : cards.length >= n,
      ...(ownerGroups ? { ownerGroups } : {}), locks: new Map(cards.map(card => [card, card.zoneVersion])) };
  }

  // Hybrid and Phyrexian choices for this cost occur during resolution. Do
  // not set payMana's isSpell flag: this spending is not spent casting a spell.
  async function manaOptions(ctx, cost, xVal) {
    const options = { hybridChoices: [], phyrexianChoices: [], twoBridgeChoices: [], xVal };
    for (const pip of MTG.parseCost(cost.mana).pips) {
      let field, choices;
      if (pip.includes('PHY')) { field = 'phyrexianChoices'; choices = [pip.find(symbol => 'WUBRG'.includes(symbol)), 'life']; }
      else if (pip.includes('TWO')) { field = 'twoBridgeChoices'; choices = ['color', 'generic']; }
      else if (pip.length > 1) { field = 'hybridChoices'; choices = pip.slice(); }
      else continue;
      const index = options[field].length;
      const legal = choices.filter(choice => ctx.g.canPayMana(ctx.you, MTG.parseCost(cost.mana), null,
        { ...options, [field]: [...options[field], choice] }));
      if (!legal.length) return null;
      const selected = legal.length === 1 ? legal[0] : await ctx.you.controller.decide(ctx.g, {
        type: 'chooseOption', player: ctx.you, prompt: ctx.src.name + ': choose how to pay ' + cost.mana,
        options: legal.map(key => ({ key, label: key === 'life' ? 'Pay 2 life' : key === 'generic' ? 'Pay {2}' : key === 'color' ? 'Pay colored mana' : 'Pay {' + key + '}' })),
        aiHint: { kind: 'alternativeManaPayment' },
      });
      if (!legal.includes(selected)) return null;
      options[field][index] = selected;
    }
    return options;
  }

  async function pay(ctx, initial, helpers, payoff) {
    const cost = initial.cost, current = plan(ctx, cost, helpers);
    if (!current.payable) return false;
    if (cost.target !== undefined && current.cards.some(card => !initial.locks.has(card) || initial.locks.get(card) !== card.zoneVersion)) return false;
    if (cost.kind === 'mana') {
      let xVal = current.x;
      if (cost.chooseX) {
        const max = Math.min(ctx.g.maxAffordableX(ctx.you, MTG.parseCost(cost.mana), null, { forSpell: {} }),
          cost.xMax !== undefined ? helpers.amount(cost.xMax, ctx) : Number.MAX_SAFE_INTEGER);
        const draw = { multiplier: 0, offset: 0 };
        const inspect = effects => { for (const effect of effects || []) {
          if (effect.action === 'draw' && effect.who === 'you') {
            if (effect.n === 'X') draw.multiplier++;
            else if (typeof effect.n === 'number') draw.offset += effect.n;
          }
          inspect(effect.effects); inspect(effect.elseEffects);
        } };
        inspect(payoff);
        const doubled = Math.pow(2, ctx.g.bf().filter(card => card.ctrl === ctx.you && card.def.drawDouble).length);
        const extra = !ctx.you.hand.length && ctx.g.bf().some(card => card.ctrl === ctx.you && card.def.drawWhileEmptyExtra) ? 1 : 0;
        const safeDrawX = draw.multiplier ? Math.max(0, Math.floor(((ctx.you.library.length - extra) / doubled - draw.offset) / draw.multiplier)) : max;
        xVal = await ctx.you.controller.decide(ctx.g, { type: 'chooseX', min: 0, max,
          prompt: ctx.src.name + ': choose X for the resolution payment', src: ctx.src, thresholds: [Math.min(max, safeDrawX)],
          aiHint: { kind: 'oracleResolutionX', drawMultiplier: draw.multiplier, drawOffset: draw.offset } });
        if (!Number.isInteger(xVal) || xVal < 0 || xVal > max) return false;
      }
      const options = await manaOptions(ctx, cost, xVal);
      const paid = options !== null && await ctx.g.payMana(ctx.you, MTG.parseCost(cost.mana), null, options);
      if (paid) ctx.oraclePaymentCapture = { kind: cost.kind, count: 0, cards: [] };
      if (paid && /\{X\}/.test(cost.mana)) ctx.x = xVal;
      return paid;
    }
    if (cost.kind === 'life') {
      ctx.oraclePaymentCapture = { kind: cost.kind, count: current.n, cards: [] };
      await ctx.g.loseLife(ctx.you, current.n, 'Oracle resolution payment'); return true;
    }
    if (cost.kind === 'draw') {
      // CR 121.3 permits this choice even with an empty library; the failure
      // to draw loses the game only after this entire effect has resolved.
      ctx.oraclePaymentCapture = { kind: cost.kind, count: current.n, cards: [] };
      await ctx.g.draw(ctx.you, current.n, ctx.src, { deferSBA: true }); return true;
    }
    let available = current.cards;
    if (current.ownerGroups) {
      let group = current.ownerGroups[0];
      if (current.ownerGroups.length > 1) {
        const options = current.ownerGroups.map(row => ({ key: String(row.owner.idx), label: row.owner.name }));
        const answer = await ctx.you.controller.decide(ctx.g, { type: 'chooseOption', player: ctx.you,
          prompt: ctx.src.name + ': choose the opponent whose exiled cards to process', options,
          aiHint: { kind: 'oracleProcessOwner', src: ctx.src } });
        group = current.ownerGroups.find(row => String(row.owner.idx) === answer);
        if (!group) return false;
      }
      available = group.cards;
    }
    let chosen = available;
    if (cost.n !== 'all' && cost.target === undefined && current.n > 0) {
      chosen = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', player: ctx.you, from: available, min: current.n, max: current.n,
        prompt: ctx.src.name + ': choose cards to ' + cost.kind,
        aiHint: { kind: cost.kind === 'discard' ? 'addlDiscard' : cost.kind === 'sacrifice' ? 'sacCost' : cost.kind === 'tap' ? 'tapCost' : cost.kind === 'exile' ? 'exileGY' : cost.kind === 'process-exile' ? 'oracleProcessExile' : cost.kind === 'remove-counter' ? 'counterCost' : 'bounceCost', src: ctx.src },
      });
    } else if (current.n === 0) chosen = [];
    const valid = picks => Array.isArray(picks) && picks.length === current.n && new Set(picks).size === picks.length &&
      (!cost.sameOwner || !picks.length || picks.every(card => card.owner === picks[0].owner)) &&
      picks.every(card => available.includes(card) && current.locks.has(card) && card.zoneVersion === current.locks.get(card) && plan(ctx, cost, helpers).cards.includes(card));
    if (!valid(chosen)) return false;
    if (cost.kind === 'library' && chosen.length > 1) {
      const order = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: chosen, min: chosen.length, max: chosen.length,
        prompt: 'Order cards on the ' + cost.position + ' of your library', aiHint: { kind: 'bottomOrder' } });
      if (!valid(order) || order.some(card => !chosen.includes(card))) return false;
      chosen = order;
    }
    // No cost is mutated before every choice and exact zone incarnation is
    // checked. Replacement effects still count as paying it (CR 118.11-12).
    const capture = { kind: cost.kind, count: cost.kind === 'remove-counter' ? cost.n : chosen.length,
      cards: chosen.map(card => ({ card, before: ctx.g.snapshot(card), zoneVersionBefore: card.zoneVersion })) };
    if (cost.kind === 'sacrifice') {
      ctx.sacd = chosen.map(card => ctx.g.snapshot(card));
      await ctx.g.sacrificeMany(ctx.you, chosen);
    } else if (cost.kind === 'discard') await ctx.g.discard(ctx.you, chosen);
    else if (cost.kind === 'tap') for (const card of chosen) ctx.g.tap(card);
    else if (cost.kind === 'remove-counter') for (const card of chosen) ctx.g.removeCounters(card, cost.counter, cost.n);
    else if (cost.kind === 'reveal') await ctx.g.revealToHuman({ cards: chosen, ctrl: ctx.you, kind: 'reveal', includeLands: true });
    else if (cost.kind === 'exile' && cost.zone === 'graveyard') await ctx.g.moveGraveyardBatch(chosen, 'exile');
    else if (cost.kind === 'exile' && cost.zone === 'battlefield') await ctx.g.exileMany(chosen);
    else if (cost.kind === 'process-exile') await ctx.g.withGraveyardEntryBatch(async () => {
      for (const card of chosen) await ctx.g.move(card, 'graveyard');
    });
    else {
      const ordered = cost.kind === 'library' && cost.position === 'top' ? chosen.slice().reverse() : chosen;
      for (const card of ordered) await ctx.g.move(card, cost.kind === 'return' ? 'hand' : cost.kind === 'exile' ? 'exile' : 'library', { toBottom: cost.position === 'bottom' });
    }
    for (const entry of capture.cards) entry.zoneVersionAfter = entry.card.zoneVersion;
    ctx.oraclePaymentCapture = capture;
    return true;
  }

  async function run(ctx, effect, helpers) {
    if (effect.action === 'remove-from-combat') {
      for (const card of new Set(helpers.subjects(ctx, effect.target))) if (card instanceof MTG.CardInst && card.zone === 'battlefield' && card.is('Creature')) ctx.g.removeFromCombat(card);
      return;
    }
    if (effect.action === 'delayed-object') {
      if (!['destroy', 'exile', 'bounce', 'sacrifice', 'counter', 'remove-counter'].includes(effect.operation) || !['endCombat', 'endStep'].includes(effect.on) || effect.your && effect.on !== 'endStep' ||
          ['counter', 'remove-counter'].includes(effect.operation) && (typeof effect.counter !== 'string' || !Number.isInteger(effect.n) || effect.n < 0)) throw new Error('Unsupported delayed object effect');
      const locked = [...new Set(helpers.subjects(ctx, effect.target))].filter(card => card instanceof MTG.CardInst && card.zone === 'battlefield').map(card => ({ card, version: card.zoneVersion }));
      // CR 603.7: the source/controller are established now, while each
      // object's characteristics and destruction protection are read later.
      ctx.g.delayed.push({ on: effect.on, src: ctx.src, ctrl: ctx.you, name: ctx.src.name + ' — delayed ' + effect.operation,
        ...(effect.your ? { filter: (game, data) => data?.player === ctx.you } : {}),
        run: async delayedCtx => {
          const live = locked.filter(row => row.card.zone === 'battlefield' && row.card.zoneVersion === row.version).map(row => row.card);
          if (effect.operation === 'destroy') await delayedCtx.g.destroyMany(live, { noRegen: !!effect.noRegen, source: ctx.src });
          else if (effect.operation === 'exile') await delayedCtx.g.exileMany(live);
          else if (effect.operation === 'bounce') await delayedCtx.g.bounceMany(live);
          else if (effect.operation === 'sacrifice') await delayedCtx.g.sacrificeMany(ctx.you, live.filter(card => card.ctrl === ctx.you));
          else {
            for (const card of live) if (effect.operation === 'counter') delayedCtx.g.addCounters(card, effect.counter, effect.n, false, ctx.you);
            else delayedCtx.g.removeCounters(card, effect.counter, effect.n);
            delayedCtx.g.recalc();
          }
        },
      });
      return;
    }
    if (effect.action === 'player-counter') {
      if (effect.counter !== 'poison' || !(effect.n === 'X' || amountValid(effect.n))) throw new Error('Unsupported player counter');
      const n = helpers.amount(effect.n, ctx);
      if (!Number.isInteger(n) || n < 0) throw new Error('Invalid player counter amount');
      const players = effect.who === 'each-player' ? ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you)
        : effect.who === 'each-opponent' ? ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you).filter(player => player !== ctx.you) : helpers.subjects(ctx, effect.who);
      const placed = [];
      for (const player of new Set(players)) if (player instanceof MTG.Player && !player.lost && n > 0) {
        const before = player.poison || 0; player.poison = before + n;
        placed.push({ player, kind: 'poison', n, before, after: player.poison, by: ctx.you, source: ctx.src });
      }
      for (const row of placed) {
        ctx.g.lg(row.player.name + ' gets ' + n + ' poison counter' + (n === 1 ? '' : 's') + '.');
        ctx.g.note('gameEffect', { kind: 'counterChange', counterKind: 'poison', target: row.player, amount: n, source: ctx.src });
        await ctx.g.emit('playerCountersPlaced', row);
      }
      return;
    }
    if (effect.action === 'group-sequence') {
      const allowed = new Set(['tap', 'untap', 'pump', 'counter', 'base-pt', 'cant-block-until-eot', 'unblockable-until-eot', 'skip-next-untap']);
      if (!Array.isArray(effect.filters) || !effect.filters.length || !Array.isArray(effect.effects) || !effect.effects.length || effect.effects.some(child => !allowed.has(child.action) || child.target !== 'affected-group')) throw new Error('Unsupported retained group effect');
      const filters = effect.filters.map(filter => helpers.target({ ...filter, excludeSelf: !!filter.excludeSelf && helpers.sameSource(ctx) }, [], 0, ctx.data).filter);
      const locked = ctx.g.bf().filter(card => filters.some(filter => filter(ctx.g, card, ctx.you, ctx.src))).map(card => ({ card, version: card.zoneVersion }));
      const index = (ctx.targets || []).length;
      for (const child of effect.effects) {
        const affected = locked.filter(row => row.card.zone === 'battlefield' && row.card.zoneVersion === row.version).map(row => row.card);
        const next = { ...child, target: index };
        // Each instruction reads its amount before it changes any member.
        for (const key of ['n', 'power', 'toughness', 'multiplier']) if (next[key] && typeof next[key] === 'object') next[key] = helpers.amount(next[key], ctx);
        await helpers.effects({ ...ctx, targets: [...(ctx.targets || []), affected] }, [next]);
      }
      return;
    }
    if (effect.action !== 'resolution-cost') throw new Error('Unsupported v8 effect descriptor: ' + effect.action);
    validate(effect.payment);
    if (!Array.isArray(effect.effects) || effect.elseEffects && !Array.isArray(effect.elseEffects)) throw new Error('Invalid resolution payment branches');
    const choices = effect.payment.kind === 'alternatives' ? effect.payment.choices : [effect.payment];
    const plans = choices.map((cost, index) => ({ ...plan(ctx, cost, helpers), index })).filter(row => row.payable);
    let selected = effect.optional === false && plans.length === 1 ? plans[0] : null;
    if (plans.length && !selected) {
      const options = plans.map(row => ({ key: choices.length === 1 ? 'yes' : 'pay-' + row.index,
        label: 'Pay: ' + (row.cost.mana || row.cost.kind + ' ' + (row.cost.n === 'all' ? row.n : row.cost.n)),
        payment: { ...row.cost, n: row.cost.n === 'all' || ['draw', 'life'].includes(row.cost.kind) ? row.n : row.cost.n } }));
      if (effect.optional !== false) options.push({ key: 'no', label: 'Do not pay' });
      const answer = await ctx.you.controller.decide(ctx.g, { type: 'chooseOption', player: ctx.you,
        prompt: ctx.src.name + ': pay for the following effect?', options, aiHint: { kind: 'oracleUnlessPayment', src: ctx.src } });
      selected = plans.find(row => answer === (choices.length === 1 ? 'yes' : 'pay-' + row.index));
    }
    const child = { ...ctx };
    if (effect.payment.kind === 'mana' && effect.payment.xValue !== undefined) child.x = helpers.amount(effect.payment.xValue, ctx);
    const paid = !!selected && await pay(child, selected, helpers, effect.effects);
    if (!paid) child.oraclePaymentCapture = null;
    const effects = paid ? effect.effects : effect.elseEffects || [];
    if ((paid ? effect.effectsOptional : effect.elseEffectsOptional) && effects.length) {
      const answer = await ctx.you.controller.decide(ctx.g, { type: 'chooseOption', prompt: ctx.src.name + ': use the following effect?',
        options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }], aiHint: { kind: 'optTrigger', src: ctx.src } });
      if (answer !== 'yes') return;
    }
    await helpers.effects(child, effects);
  }

  MTG.OracleV8Effects = {actions, run};
})(globalThis.MTG ||= {});
