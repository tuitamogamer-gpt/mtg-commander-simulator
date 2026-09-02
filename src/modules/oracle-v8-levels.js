// A leveler keeps one identity on the battlefield: only its characteristics
// follow the level counters on it. Every band is compiled ahead of time as an
// ordinary script, and its rules are gated on the band that is currently live.
((M) => {
  const MANA = /^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|2\/[WUBRG])\})+$/;
  const fail = message => { throw new Error('Oracle leveler: ' + message); };

  function level(card) {
    return (card && card.counters && card.counters.level) || 0;
  }

  function activeBand(bands, card) {
    const current = level(card);
    let live = null;
    for (const band of bands) if (current >= band.min && (band.max === null || current <= band.max)) live = band;
    return live;
  }

  function gate(bands, band) {
    return (game, card) => activeBand(bands, card) === band;
  }

  function compile(entry, operation, compileBand) {
    if (operation.contract !== 'mechanic-level-up-v8' || typeof operation.cost !== 'string' || !MANA.test(operation.cost) ||
      !Array.isArray(operation.bands) || operation.bands.length < 2 ||
      operation.bands.some((band, index) => !Number.isInteger(band.min) || band.min < 1 ||
        (band.max !== null && (!Number.isInteger(band.max) || band.max < band.min)) ||
        (band.power === null) !== (band.toughness === null) ||
        (band.power !== null && (!Number.isInteger(band.power) || !Number.isInteger(band.toughness))) ||
        (index && band.min <= operation.bands[index - 1].min))) fail('invalid level descriptor');

    // The printed card without its level rules is the level 0 body: its own
    // power, toughness and keywords already come from the ordinary compiler.
    const base = compileBand({...entry, implementation: (entry.implementation || [])
      .filter(item => item.kind !== 'mechanic-level-up-v8')});
    const bands = operation.bands.map(band => ({min: band.min, max: band.max === undefined ? null : band.max,
      power: band.power === undefined ? null : band.power,
      toughness: band.toughness === undefined ? null : band.toughness,
      script: band.implementation && band.implementation.length
        ? compileBand({...entry, implementedKeywords: band.implementedKeywords || [],
          implementation: band.implementation, oracleContracts: []})
        : {kws: band.implementedKeywords || []}}));

    const statics = [...(base.statics || [])];
    const triggers = [...(base.triggers || [])];
    const abilities = [...(base.abilities || [])];
    const manaAbilities = base.mana ? (Array.isArray(base.mana) ? [...base.mana] : [base.mana]) : [];

    // The printed band keywords sit on their own lines, so the generic loader
    // reads them as keywords of the whole card. They belong to their band
    // alone: clear every band keyword first, then grant the live band's.
    const printed = new Set((entry.implementedKeywords || []).map(keyword => String(keyword).toLowerCase()));
    const banded = new Set();
    for (const band of bands) for (const keyword of band.script.kws || []) {
      if (!printed.has(String(keyword).toLowerCase())) banded.add(keyword);
    }

    // Layer 7b: the live band sets the printed power and toughness outright.
    statics.push({phase: 7, apply: (game, card) => {
      for (const keyword of banded) card.cur.kw.delete(keyword);
      const band = activeBand(bands, card);
      if (!band) return;
      if (band.power !== null) {
        card.cur.basePower = band.power;
        card.cur.baseToughness = band.toughness;
      }
      for (const keyword of band.script.kws || []) card.cur.kw.add(keyword);
    }});

    for (const band of bands) {
      const live = gate(bands, band);
      for (const item of band.script.statics || []) {
        const previous = item.cond;
        statics.push({...item, cond: (game, card, ...rest) => live(game, card) && (!previous || previous(game, card, ...rest))});
      }
      for (const item of band.script.triggers || []) {
        const previous = item.filter;
        triggers.push({...item, filter: (game, source, data) => live(game, source) && (!previous || previous(game, source, data))});
      }
      for (const item of band.script.abilities || []) {
        const previous = item.cond;
        abilities.push({...item, cond: (game, source, player) => live(game, source) && (!previous || previous(game, source, player))});
      }
      const bandMana = band.script.mana ? (Array.isArray(band.script.mana) ? band.script.mana : [band.script.mana]) : [];
      for (const item of bandMana) {
        const previous = item.cond;
        manaAbilities.push({...item, cond: (game, card, player) => live(game, card) && (!previous || previous(game, card, player))});
      }
    }

    abilities.push({
      label: 'Level up ' + operation.cost,
      cost: {mana: operation.cost},
      sorcery: true,
      aiScore: (game, source) => {
        const current = level(source), next = bands.find(band => band.min > current);
        if (!next) return 0;
        // Levelling is worth the mana while a stronger band is still ahead.
        if (next.power === null) return 2;
        return 2 + Math.max(0, next.power - (source.cur ? source.cur.power : 0));
      },
      run: async ctx => { ctx.g.addCounters(ctx.src, 'level', 1, false, ctx.you); },
    });

    return {...base,
      ...(manaAbilities.length ? {mana: manaAbilities.length === 1 ? manaAbilities[0] : manaAbilities} : {}),
      ...(statics.length ? {statics} : {}),
      ...(triggers.length ? {triggers} : {}),
      abilities,
      // Deck-import certification compares the complete printed descriptor,
      // which the level-0 body alone does not carry.
      oracleImplementation: (entry.implementation || []).map(item => ({...item})),
      oracleContracts: (entry.oracleContracts || []).slice(),
      oracleLevelBands: bands.map(band => ({min: band.min, max: band.max, power: band.power, toughness: band.toughness})),
      oracleLevelUpCost: operation.cost,
    };
  }

  M.OracleV8Levels = {compile, level, activeBand};
})(globalThis.MTG || (globalThis.MTG = {}));
