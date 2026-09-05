// Library choices operate on one locked inspected cohort. No runtime prose
// parsing, hidden-information shortcuts, or synthetic card insertion.
((M) => {
  const actions = new Set(['library-select-v8', 'library-zone-shuffle-v8', 'library-search-v8']);
  const permanentTypes = ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'];
  const cardTypes = new Set([...permanentTypes, 'Instant', 'Kindred', 'Sorcery']);
  const present = (player, entry) => entry.card.zone === 'library' && entry.card.zoneVersion === entry.version && player.library.includes(entry.card);

  function targetReference(ctx, index) {
    const saved = ctx._oracleTargetControllers?.[index]?.[0], card = saved?.subject;
    if (!saved || !card) return null;
    if (card.zoneVersion === saved.zoneVersion) return card;
    return card.battlefieldLKI?.get(saved.zoneVersion) || saved.stats || null;
  }
  function relationReference(ctx, reference) {
    if (reference?.kind === 'target') return targetReference(ctx, reference.index);
    if (reference?.kind === 'payment-card') return ctx.oraclePaymentCapture?.cards?.[reference.index]?.before || null;
    if (reference?.kind === 'event-card') {
      const card = ctx.oracleSourceCapture?.eventCard || ctx.data?.card;
      if (!card) return null;
      return ctx.data?.card === card && ctx.data?.snap ? ctx.data.snap
        : card.zoneVersion === ctx.eventCardZoneVersion ? card : card.battlefieldLKI?.get(ctx.eventCardZoneVersion) || null;
    }
    return null;
  }
  const definition = object => object?.def || object?.definition || null;
  function relationMatches(card, relation, reference) {
    if (!relation) return true;
    if (!reference) return false;
    if (relation.kind === 'stat') {
      const stat = relation.stat || 'mv', value = Number(card[stat]), threshold = Number(reference[stat]);
      return Number.isFinite(value) && Number.isFinite(threshold) &&
        (relation.comparison === 'greater' ? value > threshold : relation.comparison === 'lesser' ? value < threshold : false);
    }
    if (relation.kind === 'shares-card-type') {
      const types = new Set((definition(reference)?.types || reference.types || []).filter(type => cardTypes.has(type)));
      return (definition(card)?.types || []).some(type => types.has(type));
    }
    throw new Error('Unknown library relation');
  }

  async function order(ctx, entries, placement, random, owner, chooser) {
    const cards = entries.filter(entry => present(owner, entry)).map(entry => entry.card);
    let arranged = cards.slice();
    if (random) M.shuffle(arranged, ctx.g.rnd);
    else if (cards.length > 1) {
      arranged = await chooser.controller.decide(ctx.g, {type: 'chooseCards', from: cards, min: cards.length, max: cards.length,
        prompt: placement === 'top' ? 'Order inspected cards, top first' : 'Order inspected cards for the bottom', aiHint: {kind: 'orderBottom'}});
      if (!Array.isArray(arranged) || arranged.length !== cards.length || new Set(arranged).size !== cards.length || arranged.some(card => !cards.includes(card))) throw new Error('Invalid inspected-card order');
    }
    for (const card of arranged) owner.library.splice(owner.library.indexOf(card), 1);
    if (placement === 'top') owner.library.push(...arranged.slice().reverse());
    else owner.library.unshift(...arranged.slice().reverse());
  }

  async function process(ctx, effect, helpers, owner, chooser, execution) {
    let top;
    if (effect.until) {
      const count = Math.max(0, Math.floor(helpers.amount(effect.until.n, ctx)));
      const filter = helpers.target({...effect.until.filter, zone: 'graveyard', controller: 'any'}, [], 0, ctx.data).filter;
      const reference = effect.until.relation ? relationReference(ctx, effect.until.relation.reference) : null;
      top = []; let found = 0;
      if (count) for (const card of owner.library.slice().reverse()) {
        top.push(card); if (filter(ctx.g, card, ctx.you, ctx.src) && relationMatches(card, effect.until.relation, reference)) found++;
        if (found >= count) break;
      }
    } else {
      const n = Math.max(0, Math.floor(helpers.amount(effect.n, ctx)));
      top = n ? owner.library.slice(-n).reverse() : [];
    }
    const inspected = top.map(card => ({card, version: card.zoneVersion}));
    const cards = inspected.map(entry => entry.card), claimed = new Set(), selections = [];
    if (effect.visibility === 'reveal') await ctx.g.revealToHuman({cards, ctrl: chooser, kind: 'reveal'});
    else if (effect.visibility === 'look' && !chooser.isAI && cards.length) await chooser.controller.decide(ctx.g, {
      type: 'cardReveal', player: chooser, cards, kind: 'look', private: true,
    });
    else if (effect.visibility !== 'look') throw new Error('Unknown library visibility');

    for (const selection of effect.selections) {
      // The shared target predicate uses graveyard to mean card types outside
      // the battlefield. Only its predicate is reused; library choices never
      // become targets or receive battlefield-only "permanent" semantics.
      const filter = selection.filter && helpers.target({...selection.filter, zone: 'graveyard', controller: 'any'}, [], 0, ctx.data).filter;
      const reference = selection.relation ? relationReference(ctx, selection.relation.reference) : null;
      const eligible = inspected.filter(entry => present(owner, entry) && !claimed.has(entry.card) &&
        (!filter || filter(ctx.g, entry.card, ctx.you, ctx.src)) && relationMatches(entry.card, selection.relation, reference) &&
        (selection.destination !== 'battlefield' || permanentTypes.some(type => entry.card.is(type))));
      const maximum = selection.max === 'all' ? eligible.length : Math.min(eligible.length, helpers.amount(selection.max, ctx));
      const minimum = selection.required ? maximum : 0;
      const from = eligible.map(entry => entry.card);
      let chosen = [];
      if (maximum && selection.allOrNone) {
        const answer = await chooser.controller.decide(ctx.g, {type: 'chooseOption', prompt: 'Move all eligible inspected cards?',
          options: [{key: 'yes', label: 'Move all eligible cards'}, {key: 'no', label: 'Decline'}], aiHint: {kind: 'optTrigger', src: ctx.src}});
        if (!['yes', 'no'].includes(answer)) throw new Error('Invalid all-or-none selection');
        if (answer === 'yes') chosen = from;
      } else if (maximum) chosen = await chooser.controller.decide(ctx.g, {type: 'chooseCards', from, min: minimum, max: maximum,
        prompt: 'Choose inspected cards for ' + selection.destination, aiHint: {kind: 'bestCard'}});
      if (!Array.isArray(chosen) || chosen.length < minimum || chosen.length > maximum || new Set(chosen).size !== chosen.length || chosen.some(card => !from.includes(card))) throw new Error('Invalid inspected-card selection');
      for (const card of chosen) claimed.add(card);
      const selected = eligible.filter(entry => claimed.has(entry.card) && chosen.includes(entry.card));
      if (selection.reveal && chosen.length) await ctx.g.revealToHuman({cards: chosen, ctrl: chooser, kind: 'reveal'});
      selections.push({selection, entries: selected});
    }

    for (const destination of ['hand', 'exile']) for (const item of selections.filter(item => item.selection.destination === destination)) {
      for (const entry of item.entries) if (present(owner, entry)) await ctx.g.move(entry.card, destination);
    }
    await ctx.g.withGraveyardEntryBatch(async () => {
      for (const item of selections.filter(item => item.selection.destination === 'graveyard')) for (const entry of item.entries) if (present(owner, entry)) await ctx.g.move(entry.card, 'graveyard');
    });
    await ctx.g.withBattlefieldEntryBatch(async () => {
      for (const item of selections.filter(item => item.selection.destination === 'battlefield')) for (const entry of item.entries) if (present(owner, entry)) await ctx.g.putPermanentOntoBattlefield(entry.card, item.selection.controller === 'you' ? ctx.you : owner, {tapped: !!item.selection.tapped});
    });
    for (const item of selections.filter(item => ['top', 'bottom'].includes(item.selection.destination))) await order(ctx, item.entries, item.selection.destination, !!item.selection.random, owner, chooser);

    const reserved = new Set(selections.filter(item => ['top', 'bottom'].includes(item.selection.destination)).flatMap(item => item.entries.map(entry => entry.card)));
    const rest = inspected.filter(entry => present(owner, entry) && !reserved.has(entry.card));
    if (effect.rest.destination === 'graveyard') await ctx.g.withGraveyardEntryBatch(async () => {for (const entry of rest) await ctx.g.move(entry.card, 'graveyard');});
    else if (effect.rest.destination === 'hand') for (const entry of rest) await ctx.g.move(entry.card, 'hand');
    else if (effect.rest.destination === 'exile') for (const entry of rest) await ctx.g.move(entry.card, 'exile');
    else if (effect.rest.destination === 'shuffle') M.shuffle(owner.library, ctx.g.rnd);
    else if (effect.rest.destination === 'stay') {} // Revealing alone does not change library order.
    else if (['top', 'bottom'].includes(effect.rest.destination)) await order(ctx, rest, effect.rest.destination, !!effect.rest.random, owner, chooser);
    else throw new Error('Unknown library rest destination');
    if (effect.optionalShuffle) {
      const answer = await chooser.controller.decide(ctx.g, {type: 'chooseOption', prompt: 'Shuffle the inspected library?',
        options: [{key: 'yes', label: 'Shuffle'}, {key: 'no', label: 'Keep the library order'}], aiHint: {kind: 'optTrigger', src: ctx.src}});
      if (!['yes', 'no'].includes(answer)) throw new Error('Invalid library shuffle choice');
      if (answer === 'yes') M.shuffle(owner.library, ctx.g.rnd);
    }
  }

  async function shuffleZones(ctx, effect, helpers, owners, execution) {
    if (!Array.isArray(effect.zones) || !effect.zones.length ||
        effect.zones.some(zone => !['hand', 'graveyard'].includes(zone)) ||
        new Set(effect.zones).size !== effect.zones.length) throw new Error('Unknown library shuffle zone');
    const locked = owners.map(owner => ({
      owner,
      hand: effect.zones.includes('hand') ? owner.hand.map(card => ({card, version: card.zoneVersion})) : [],
      graveyard: effect.zones.includes('graveyard') ? owner.graveyard.map(card => ({card, version: card.zoneVersion})) : [],
    }));
    const present = (entry, zone) => entry.card.zone === zone && entry.card.zoneVersion === entry.version && entry.card.owner[zone].includes(entry.card);
    const graveyard = locked.flatMap(group => group.graveyard).filter(entry => present(entry, 'graveyard')).map(entry => entry.card);
    if (graveyard.length) await ctx.g.moveGraveyardBatch(graveyard, 'library');
    for (const group of locked) for (const entry of group.hand) if (present(entry, 'hand')) await ctx.g.move(entry.card, 'library');
    for (const {owner} of locked) M.shuffle(owner.library, ctx.g.rnd);
  }

  async function search(ctx, effect, helpers, owner, chooser, execution) {
    if (!Array.isArray(effect.placements) || !effect.placements.length ||
        effect.placements.some(item => !['hand', 'graveyard', 'battlefield', 'top'].includes(item.destination) ||
          !['number', 'string'].includes(typeof item.n) || typeof item.n === 'string' && !['all', 'rest'].includes(item.n) ||
          item.destination === 'top' && ![0, 2].includes(item.offset || 0))) throw new Error('Unknown library search placement');
    const named=Array.isArray(effect.names)&&effect.names.length>0&&effect.names.every(name=>typeof name==='string'&&name.trim()===name&&name.length>0);
    if(effect.names!==undefined&&!named||Number(!!effect.unrestricted)+Number(!!effect.filter)+Number(!!named)!==1) throw new Error('Unknown library search filter');
    if(effect.optionalSearch){
      const answer=await chooser.controller.decide(ctx.g,{type:'chooseOption',player:chooser,prompt:'Search your library?',options:[{key:'yes',label:'Search'},{key:'no',label:'Decline'}],aiHint:{kind:'confirm'}});
      if(!['yes','no'].includes(answer))throw new Error('Invalid optional search choice');
      if(answer==='no')return null;
    }
    const predicate = effect.filter && helpers.target({...effect.filter, zone: 'graveyard', controller: 'any'}, [], 0, ctx.data).filter;
    let candidates = owner.library.filter(card => (!named||effect.names.includes(card.name))&&(!predicate || predicate(ctx.g, card, effect.ownerSearch?owner:ctx.you, ctx.src)));
    if (effect.differentNames) {
      const names = new Set(); candidates = candidates.filter(card => !names.has(card.name) && names.add(card.name));
    }
    const requested = effect.n === 'all' ? candidates.length : Math.max(0, Math.floor(helpers.amount(effect.n, ctx)));
    const maximum = Math.min(candidates.length, requested), minimum = effect.upTo || !effect.unrestricted ? 0 : maximum;
    const versions=new Map(candidates.map(card=>[card,card.zoneVersion]));
    const picked = maximum ? await chooser.controller.decide(ctx.g, {type: 'chooseCards', from: candidates, min: minimum, max: maximum,
      search: true, prompt: 'Search your library', aiHint: {kind: effect.filter?.what === 'land' ? 'searchBasic' : 'recur'}}) : [];
    if (!Array.isArray(picked) || picked.length < minimum || picked.length > maximum || new Set(picked).size !== picked.length ||
        picked.some(card => !candidates.includes(card)||card.zone!=='library'||card.zoneVersion!==versions.get(card)||!owner.library.includes(card)) || effect.differentNames && new Set(picked.map(card => card.name)).size !== picked.length) {
      throw new Error('Invalid library search selection');
    }
    const selected = picked.map(card => ({card, version: card.zoneVersion}));
    const present = entry => entry.card.zone === 'library' && entry.card.zoneVersion === entry.version && owner.library.includes(entry.card);

    const unassigned = selected.slice(), assignments = [];
    for (const placement of effect.placements) {
      const count = placement.n === 'all' || placement.n === 'rest' ? unassigned.length : Math.min(unassigned.length, Math.max(0, Math.floor(placement.n)));
      let cards = unassigned.slice(0, count);
      if (count > 0 && count < unassigned.length) {
        const answer = await chooser.controller.decide(ctx.g, {type: 'chooseCards', from: unassigned.map(entry => entry.card), min: count, max: count,
          prompt: 'Choose searched cards for ' + placement.destination, aiHint: {kind: placement.destination === 'graveyard' ? 'discard' : 'bestCard'}});
        if (!Array.isArray(answer) || answer.length !== count || new Set(answer).size !== count || answer.some(card => !unassigned.some(entry => entry.card === card))) {
          throw new Error('Invalid searched-card partition');
        }
        cards = answer.map(card => unassigned.find(entry => entry.card === card));
      }
      for (const entry of cards) unassigned.splice(unassigned.indexOf(entry), 1);
      assignments.push({placement, entries: cards});
    }
    if (unassigned.length) throw new Error('Incomplete library search partition');
    const finish=async()=>{
      if (effect.reveal && selected.length) await ctx.g.revealToHuman({cards: selected.filter(present).map(entry => entry.card), ctrl: chooser, kind: 'reveal'});
    for (const destination of ['hand']) for (const item of assignments.filter(item => item.placement.destination === destination)) {
      for (const entry of item.entries) if (present(entry)) await ctx.g.move(entry.card, destination);
    }
    await ctx.g.withGraveyardEntryBatch(async () => {
      for (const item of assignments.filter(item => item.placement.destination === 'graveyard')) for (const entry of item.entries) if (present(entry)) await ctx.g.move(entry.card, 'graveyard');
    });
    await ctx.g.withBattlefieldEntryBatch(async () => {
      for (const item of assignments.filter(item => item.placement.destination === 'battlefield')) for (const entry of item.entries) if (present(entry)) {
        await ctx.g.putPermanentOntoBattlefield(entry.card, effect.ownerSearch?owner:ctx.you, {tapped: !!item.placement.tapped});
      }
    });
    const top = assignments.filter(item => item.placement.destination === 'top')
      .map(item => ({...item, entries: item.entries.filter(present)}));
    for (const item of top) for (const entry of item.entries) owner.library.splice(owner.library.indexOf(entry.card), 1);
    M.shuffle(owner.library, ctx.g.rnd);
    for (const item of top) {
      let arranged = item.entries.map(entry => entry.card);
      if (item.placement.order && arranged.length > 1) {
        arranged = await chooser.controller.decide(ctx.g, {type: 'chooseCards', from: arranged, min: arranged.length, max: arranged.length,
          prompt: 'Order searched cards, top first', aiHint: {kind: 'orderBottom'}});
        if (!Array.isArray(arranged) || arranged.length !== item.entries.length || new Set(arranged).size !== arranged.length ||
            arranged.some(card => !item.entries.some(entry => entry.card === card))) throw new Error('Invalid searched-card order');
      }
      const offset = item.placement.offset || 0;
      if (offset) owner.library.splice(Math.max(0, owner.library.length - offset), 0, ...arranged.slice().reverse());
      else owner.library.push(...arranged.slice().reverse());
    }
    };
    if(execution.deferPlacement)return finish;
    await finish();
  }

  async function run(ctx, effect, helpers) {
    if (!actions.has(effect.action)) throw new Error('Unknown v8 library action');
    const owners = effect.who === 'each-player' ? ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you)
      : effect.who === 'each-opponent' ? ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you).filter(player => player !== ctx.you)
      : effect.who !== undefined && effect.who !== 'you' ? helpers.subjects(ctx, effect.who) : [ctx.you];
    const execution = {}, affected = [...new Set(owners)].filter(player => player instanceof M.Player);
    if (effect.action === 'library-zone-shuffle-v8') return M.OracleV8Library.shuffleZones(ctx, effect, helpers, affected, execution);
    if (effect.action === 'library-search-v8') {
      if(effect.ownerSearch){
        execution.deferPlacement=true;const pending=[];
        for(const owner of affected){const finish=await M.OracleV8Library.search(ctx,effect,helpers,owner,owner,execution);if(finish)pending.push(finish);}
        await ctx.g.withBattlefieldEntryBatch(async()=>{for(const finish of pending)await finish();});
      }else for (const owner of affected) await M.OracleV8Library.search(ctx, effect, helpers, owner, effect.chooser === 'owner' ? owner : ctx.you, execution);
      return;
    }
    for (const owner of affected) {
      await M.OracleV8Library.process(ctx, effect, helpers, owner, effect.chooser === 'owner' ? owner : ctx.you, execution);
    }
  }

  M.OracleV8Library = {actions, run, process, shuffleZones, search};
})(globalThis.MTG ||= {});
