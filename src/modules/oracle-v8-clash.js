((M) => {
  M.Game.prototype.clash = async function(player, {opponent, source = null} = {}) {
    const candidates = M.E.eachOpp(this, player);
    if (!candidates.length || player.lost) return {player, opponent: null, won: false, opponentWon: false, revealed: []};
    if (opponent === undefined) opponent = await M.E.chooseOpponent(this, player, {candidates, prompt: 'Clash — choose an opponent', goal: 'clash'});
    if (!candidates.includes(opponent)) return {player, opponent: null, won: false, opponentWon: false, revealed: []};
    const rows = [player, opponent].map(owner => {
      const card = owner.library.at(-1);
      return {player: owner, card, zoneVersion: card?.zoneVersion, mv: card ? card.mv : -1, bottom: false};
    });
    const cards = rows.map(row => row.card).filter(Boolean);
    const won = !!rows[0].card && rows[0].mv > rows[1].mv;
    const opponentWon = !!rows[1].card && rows[1].mv > rows[0].mv;
    this.lg('Clash: ' + rows.map(row => row.player.name + ' (' + (row.card ? row.card.name + ' mv' + row.mv : 'empty library') + ')').join(' vs ') + '.');
    // CR 701.30c: simultaneous reveal, APNAP decisions, simultaneous movement.
    // Only these revealed objects are included in the decision; neither player
    // receives the unseen library order, and no permanent visibility flag leaks.
    const clashSummary = won ? player.name + (player.name === 'You' ? ' win' : ' wins') + ' the clash.' : opponentWon ? opponent.name + (opponent.name === 'You' ? ' win' : ' wins') + ' the clash.' : 'Equal mana values — nobody wins the clash.';
    await this.revealToHuman({cards, includeLands: true, kind: 'clash', clashSummary});
    for (const owner of this.apnapFrom(this.turnPlayer || this.players[0])) {
      const row = rows.find(row => row.player === owner);
      if (!row?.card) continue;
      const where = await owner.controller.decide(this, {
        type: 'chooseOption', prompt: 'Clash — ' + row.card.name + ' stays on top or goes to the bottom?', card: row.card,
        revealedCards: cards, clashSummary, options: [{key: 'top', label: 'Leave on top'}, {key: 'bottom', label: 'Put on the bottom'}],
        aiHint: {kind: 'clashPlace', card: row.card},
      });
      row.bottom = where === 'bottom';
    }
    for (const row of rows) if (row.bottom && row.player.library.at(-1) === row.card && row.card.zoneVersion === row.zoneVersion) {
      row.player.library.pop(); row.player.library.unshift(row.card);
    }
    const result = {player, opponent, source, won, opponentWon, revealed: cards};
    this.note('clash', result);
    for (const row of rows) await this.emit('clashed', {player: row.player, opponent: row.player === player ? opponent : player,
      won: row.player === player ? won : opponentWon, source, card: row.card || null});
    return result;
  };
  M.OracleV8Clash = {
    async run(ctx, effect, h) {
      const choose = async prompt => (await ctx.you.controller.decide(ctx.g, {type: 'chooseOption', prompt,
        options: [{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No'}], aiHint: {kind: 'optTrigger', src: ctx.src}})) === 'yes';
      if (effect.optionalClash && !await choose('Clash with an opponent?')) return;
      const defender = ctx.oracleSourceCapture?.defender || ctx.data?.defender;
      const opponent = effect.opponent === 'defending-player' ? ctx.oracleSourceCapture?.defendingPlayer || (defender instanceof M.Player ? defender : defender?.ctrl) || null : undefined;
      const result = await ctx.g.clash(ctx.you, {opponent, source: ctx.src});
      if (!result.opponent) return;
      if (result.won && effect.optionalWin && !await choose('Apply the effect for winning the clash?')) return;
      for (const child of result.won ? effect.effects : effect.elseEffects) await h.effect(ctx, child);
    },
  };
})(globalThis.MTG || (globalThis.MTG = {}));
