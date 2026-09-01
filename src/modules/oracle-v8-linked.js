// Runtime for closed descriptors only. Rules text is never interpreted here.
((MTG) => {
  const actions = new Set(['linked-exile-until', 'linked-exile', 'linked-return']);
  const exactExiledCards = records => [...new Set(records.flatMap(record => record.cards || [])
    .filter(entry => entry.card.zone === 'exile' && entry.card.zoneVersion === entry.zoneVersion)
    .map(entry => entry.card))];

  function abilityLifetime(ctx, leaving = false) {
    const snapshot = leaving && ctx.data?.card === ctx.src ? ctx.data.snap : null;
    const copying = snapshot ? snapshot.copying : ctx.sourceCopying ?? ctx.oracleSourceCapture?.copying ?? !!ctx.src.isCopyOf;
    const epoch = snapshot ? snapshot.copyEpoch : ctx.sourceCopyEpoch ?? ctx.oracleSourceCapture?.copyEpoch ?? ctx.src.copyEpoch;
    // A copied pair belongs to the particular copy effect that granted it.
    // The source's own printed pair keeps its separate, native link.
    return copying ? 'copy:' + (epoch || 0) : 'native';
  }

  async function subjects(ctx, effect, helpers) {
    let cards;
    if (effect.filters) {
      const filters = effect.filters.map(filter => helpers.target(filter, [], 0, ctx.data));
      cards = ctx.g.bf().filter(card => filters.some(filter => filter.filter(ctx.g, card, ctx.you, ctx.src)));
    } else cards = helpers.subjects(ctx, effect.target);
    cards = [...new Set(cards)].filter(card => card?.zone === (effect.from || 'battlefield'));
    if ((effect.chooseAny || effect.chooseCount) && cards.length) {
      const need = effect.chooseCount ? Math.min(effect.chooseCount, cards.length) : 0;
      const chosen = await ctx.you.controller.decide(ctx.g, {type: 'chooseCards', from: cards, min: need, max: effect.chooseCount ? need : cards.length,
        prompt: ctx.src.name + ': choose permanents to exile',
        aiHint: {kind: 'exile', goal: 'protect', src: ctx.src}});
      cards = Array.isArray(chosen) ? [...new Set(chosen)].filter(card => cards.includes(card)) : [];
    }
    return cards;
  }

  async function run(ctx, effect, helpers) {
    if (effect.action === 'linked-exile-until') {
      // CR 610.3a-b: a blinked source is a different object, even when CardInst
      // is reused, so an already ended duration must not move anything at all.
      if (!helpers.sameSource(ctx)) return;
      const cards = await subjects(ctx, effect, helpers);
      if (!helpers.sameSource(ctx) || !cards.length) return;
      const duration = {source: ctx.src, sourceZoneVersion: ctx.sourceZoneVersion ?? ctx.src.zoneVersion,
        cards: cards.map(card => ({card, zoneVersion: card.zoneVersion + 1}))};
      (ctx.g.oracleExileDurations ||= []).push(duration);
      await ctx.g.exileMany(cards);
      return;
    }
    if (effect.action === 'linked-exile') {
      const cards = await subjects(ctx, effect, helpers);
      if (!cards.length) return;
      // A linked ETB still exiles after its source has left. Keep the captured
      // battlefield incarnation, never the source object's current zoneVersion.
      const record = {source: ctx.src, sourceIid: ctx.sourceIid ?? ctx.src.iid,
        sourceZoneVersion: ctx.sourceZoneVersion ?? ctx.src.zoneVersion, link: effect.link, lifetime: abilityLifetime(ctx),
        cards: cards.map(card => ({card, zoneVersion: card.zoneVersion + 1}))};
      (ctx.g.oracleLinkedExiles ||= []).push(record);
      if (effect.from === 'graveyard') await ctx.g.moveGraveyardBatch(cards, 'exile');
      else await ctx.g.exileMany(cards);
      return;
    }
    if (effect.action === 'linked-return') {
      if (!['battlefield', 'hand', 'graveyard'].includes(effect.to) || !['owner', 'you'].includes(effect.controller) || effect.what && effect.what !== 'creature') throw new Error('Unsupported linked return descriptor');
      // LTB is captured after the structural move. Its snapshot identifies the
      // old battlefield object (including a stolen source's old controller).
      const sourceVersion = ctx.data?.card === ctx.src && ctx.data.snap ? ctx.data.snap.zoneVersion : ctx.sourceZoneVersion;
      const matches = (ctx.g.oracleLinkedExiles || []).filter(record => record.sourceIid === (ctx.sourceIid ?? ctx.src.iid)
        && record.sourceZoneVersion === sourceVersion && record.link === effect.link && record.lifetime === abilityLifetime(ctx, true));
      const cards = exactExiledCards(matches).filter(card => !effect.what || card.is('Creature'));
      // A typed return leaves other still-exiled linked cards available to a
      // later copy of the ability; stale zone incarnations are discarded.
      ctx.g.oracleLinkedExiles = (ctx.g.oracleLinkedExiles || []).flatMap(record => !matches.includes(record) ? [record] :
        [{...record, cards: record.cards.filter(entry => entry.card.zone === 'exile' && entry.card.zoneVersion === entry.zoneVersion && !cards.includes(entry.card))}].filter(row => row.cards.length));
      // CR 607.3 includes every card exiled by copies of the linked acquisition.
      await ctx.g.withBattlefieldEntryBatch(async () => {
        for (const card of cards) {
          if (effect.to === 'battlefield') await ctx.g.putPermanentOntoBattlefield(card, effect.controller === 'you' ? ctx.you : card.owner, {tapped: !!effect.tapped});
          else await ctx.g.move(card, effect.to);
        }
      });
      return;
    }
    throw new Error('Unknown linked exile action: ' + effect.action);
  }

  MTG.OracleV8Linked = {actions, run};
})(globalThis.MTG ||= {});
