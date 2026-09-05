// Land types confer intrinsic mana in layer four; layer-six ability removal
// can subsequently remove it, just like a printed basic land's ability.
((MTG) => {
  const colors = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
  const mana = Object.fromEntries(Object.entries(colors).map(([type, color]) => [type, { key: 'intrinsic-' + type, label: '{T}: Add {' + color + '}.', cost: { tap: true }, produce: [{ [color]: 1 }], intrinsicLandType: type }]));
  function compile(operation, helpers) {
    if (operation.retain !== true || !Array.isArray(operation.types) || !operation.types.length || operation.types.some(type => !colors[type])) throw new Error('Unsupported basic land type operation');
    return { phase: 1, oracleOperation: operation, apply(game, source, bf) {
      const cards = operation.attached ? bf.filter(card => card.iid === source.attachedTo) : bf.filter(card => operation.filters.some(filter => helpers.target(filter).filter(game, card, source.ctrl, source)));
      for (const card of cards) if (card.is('Land')) card.cur.subtypes = [...new Set(card.cur.subtypes.concat(operation.types))];
    } };
  }
  function addIntrinsicMana(bf) {
    for (const card of bf) if (card.is('Land')) {
      const printed = card.cur.abilitiesDisabled ? [] : [card.def.mana].flat().filter(Boolean);
      for (const type of new Set(card.cur.subtypes)) if (mana[type]) {
        const color = colors[type];
        // Basic and dual land scripts already expose the same intrinsic
        // choices. Avoid multiplying equivalent payment branches.
        const alreadyPrinted = printed.some(ability => Object.keys(ability).every(key => ['cost', 'produce', 'possibleProduce', 'label', 'key'].includes(key)) &&
          ability.cost?.tap && Object.keys(ability.cost).length === 1 && Array.isArray(ability.produce) && ability.produce.some(output => output[color] === 1 && Object.keys(output).length === 1));
        if (!alreadyPrinted) card.cur.extraMana.push(mana[type]);
      }
    }
  }
  MTG.OracleV8LandTypes = { compile, addIntrinsicMana, actions: new Set(), run() { throw new Error('Unsupported basic land type action'); } };
})(globalThis.MTG || (globalThis.MTG = {}));
