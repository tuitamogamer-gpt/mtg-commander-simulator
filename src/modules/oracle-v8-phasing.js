((MTG) => {
  const actions = new Set(['phase-out-v8']);
  async function run(ctx, effect, helpers) {
    const cards = [...new Set(helpers.subjects(ctx, effect.target))].filter(card => card instanceof MTG.CardInst && card.zone === 'battlefield' && !card.phasedOut);
    // Each directly phased permanent returns under its phase-out controller;
    // opponents targeted by this spell do not return on the caster's turn.
    ctx.g.phaseOutMany(cards);
  }
  MTG.OracleV8Phasing = { actions, run };
})(globalThis.MTG || (globalThis.MTG = {}));
