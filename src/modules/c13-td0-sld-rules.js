'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.CSL;
  const direction = ctx => C.option(ctx, [{key: 'left', label: 'Left'}, {key: 'right', label: 'Right'}], 'Choose a direction');
  const neighbor = (g, p, dir) => {
    const players = g.alivePlayers(), index = players.indexOf(p);
    return players.length > 1 ? players[(index + (dir === 'right' ? -1 : 1) + players.length) % players.length] : null;
  };
  const tapOrUntap = async (ctx, card, player = ctx.you) => {
    if (!card) return;
    const key = await player.controller.decide(ctx.g, {type: 'chooseOption', player, options: [{key: 'tap', label: 'Tap ' + card.name}, {key: 'untap', label: 'Untap ' + card.name}], prompt: 'Tap or untap', aiHint: {kind: 'tapUntap', target: card}});
    if (key === 'tap') ctx.g.tap(card); else if (key === 'untap') ctx.g.untap(card); else throw Error('Invalid tap choice');
  };
  const counterCost = (kind, n = 'X') => ({n, kinds: [kind], self: true, among: false});
  const reanimateChoice = async (ctx, player, optional = false) => {
    const [card] = await C.choose(ctx.g, player, player.graveyard.filter(c => c.is('Creature')), optional ? 0 : 1, 1, 'Return a creature from your graveyard to the battlefield');
    if (card) await ctx.g.putPermanentOntoBattlefield(card, player);
    return !!card;
  };
  const tempting = async (ctx, action) => {
    await action(ctx.you);
    const choices = []; let accepted = 0;
    for (const p of ctx.g.apnapFrom(ctx.you).filter(p => p !== ctx.you)) if (await C.yes(ctx, 'Accept the tempting offer?', p)) choices.push(p);
    await ctx.g.withBattlefieldEntryBatch(async () => {for (const p of choices) if (await action(p) !== false) accepted++;});
    for (let n = 0; n < accepted; n++) await action(ctx.you);
  };
  const topOrder = async (ctx, cards, p = ctx.you) => {
    if (!cards.length) return;
    const order = cards.length === 1 ? cards : await C.choose(ctx.g, p, cards, cards.length, cards.length, 'Order cards from top to bottom');
    for (const card of order.slice().reverse()) await ctx.g.move(card, 'library');
  };
  const alive = (g, c) => c.zone === 'battlefield' && !c.phasedOut && g.bf().includes(c);
  const curseAttack = (g, c, d) => d.attackers.some(a => a.attacking === c.meta.cursedPlayer);
  const curseCreature = (g, c, d) => d.target === c.meta.cursedPlayer;
  const goat = C.registerToken('c13Goat', C.token('Goat', ['Goat'], 0, 1, ['W'], [], {tokenImageName: 'C13 Goat'}));
  const kobold = C.registerToken('c13Kobold', C.token('Kobolds of Kher Keep', ['Kobold'], 0, 1, ['R'], [], {tokenImageName: 'C13 Kobold'}));
  const thrull = C.registerToken('c13Thrull', C.token('Thrull', ['Thrull'], 1, 1, ['B'], [], {tokenImageName: 'C13 Thrull'}));
  const pridemate = C.registerToken('c13Pridemate', C.token("Ajani's Pridemate", ['Cat', 'Soldier'], 2, 2, ['W'], [], {
    tokenImageName: 'C13 Pridemate', triggers: [C.trigger('lifeGain', 'Put a +1/+1 counter on this token', ctx => C.same(ctx) && C.add(ctx, ctx.src, '+1/+1'))],
  }));
  M.C13 = {...C, direction, neighbor, tapOrUntap, counterCost, reanimateChoice, tempting, topOrder, alive, curseAttack, curseCreature, goat, kobold, thrull, pridemate};
})();
