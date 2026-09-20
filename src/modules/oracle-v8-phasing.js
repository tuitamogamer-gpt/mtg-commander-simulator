((MTG) => {
  const actions = new Set(['phase-out-v8']);
  async function run(ctx, effect, helpers) {
    const candidates=effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>helpers.target(filter,[],0).filter(ctx.g,card,ctx.you,ctx.src))):helpers.subjects(ctx,effect.target);
    const cards = [...new Set(candidates)].filter(card => card instanceof MTG.CardInst && card.zone === 'battlefield' && !card.phasedOut);
    // Each directly phased permanent returns under its phase-out controller;
    // opponents targeted by this spell do not return on the caster's turn.
    ctx.g.phaseOutMany(cards);
  }
  MTG.OracleV8Phasing = { actions, run };
})(globalThis.MTG || (globalThis.MTG = {}));
