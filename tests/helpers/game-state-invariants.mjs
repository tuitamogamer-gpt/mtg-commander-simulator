import assert from 'node:assert/strict';

const privateZones = ['library', 'hand', 'graveyard', 'exile', 'command'];
const numeric = (value, label, nonnegative = false) => {
  assert.ok(Number.isFinite(value), `${label}: finite number, got ${value}`);
  if (nonnegative) assert.ok(value >= 0, `${label}: nonnegative, got ${value}`);
};

// These are engine invariants, independent of the Oracle compiler's expected
// effect descriptors. Call only at a completed action/scenario boundary, never
// halfway through a zone move or a simultaneous event batch.
export function assertGameStateInvariants(game, label = 'game') {
  const locations = new Map();
  const identities = new Map();
  const visit = (card, zone, owner) => {
    const name = `${label}/${card?.name || '?'}#${card?.iid}`;
    assert.ok(card && typeof card === 'object', `${name}: actual card object`);
    assert.equal(locations.has(card), false, `${name}: duplicate zone membership (${locations.get(card)}, ${zone})`);
    locations.set(card, zone);
    assert.equal(identities.has(card.iid), false, `${name}: duplicate card identity`);
    identities.set(card.iid, card);
    assert.equal(card.zone, zone, `${name}: collection and zone agree`);
    assert.ok(game.players.includes(card.owner), `${name}: owner belongs to game`);
    assert.ok(game.players.includes(card.ctrl), `${name}: controller belongs to game`);
    if (owner) assert.ok(card.owner === owner, `${name}: private zone belongs to owner (owner seat ${card.owner?.idx}, zone seat ${owner.idx})`);
    numeric(card.zoneVersion, `${name}: zone version`, true);
    numeric(card.damage, `${name}: marked damage`, true);
    for (const [kind, count] of Object.entries(card.counters || {})) numeric(count, `${name}: ${kind} counters`, true);
    if (zone === 'battlefield') {
      numeric(card.power, `${name}: power`);
      numeric(card.toughness, `${name}: toughness`);
    }
  };
  for (const player of game.players) {
    numeric(player.life, `${label}/${player.name}: life`);
    numeric(player.poison || 0, `${label}/${player.name}: poison`, true);
    for (const [kind, count] of Object.entries(player.counters || {})) numeric(count, `${label}/${player.name}: ${kind}`, true);
    for (const [color, amount] of Object.entries(player.pool || {})) numeric(amount, `${label}/${player.name}: ${color} mana`, true);
    for (const zone of privateZones) for (const card of player[zone] || []) visit(card, zone, player);
  }
  for (const card of game.battlefield) visit(card, 'battlefield');
  // Activated/triggered abilities may reference their permanent or a card in
  // another zone. Spell copies also reference the original CardInst, but are
  // independent Stack objects, not additional physical cards.
  for (const object of game.stack) if (object.kind === 'spell' && !object.isCopy && object.card?.zone === 'stack') visit(object.card, 'stack');
  return { cards: locations.size, players: game.players.length };
}

function derivedState(game) {
  return {
    players: game.players.map(player => ({ life: player.life, poison: player.poison, pool: { ...player.pool }, counters: { ...player.counters } })),
    cards: game.battlefield.map(card => ({
      iid: card.iid, zone: card.zone, zoneVersion: card.zoneVersion,
      owner: card.owner.idx, controller: card.ctrl.idx,
      power: card.power, toughness: card.toughness,
      types: [...(card.cur?.types || [])].sort(), subtypes: [...(card.cur?.subtypes || [])].sort(),
      super: [...(card.cur?.super || [])].sort(), colors: [...(card.cur?.colors || [])].sort(),
      keywords: [...(card.cur?.kw || [])].sort(),
      damage: card.damage, counters: { ...card.counters }, tapped: card.tapped,
      abilitiesDisabled: !!card.cur?.abilitiesDisabled,
    })),
  };
}

export function assertRecalculationStable(game, label = 'game') {
  game.recalc();
  const first = derivedState(game);
  game.recalc();
  assert.deepEqual(derivedState(game), first, `${label}: repeated recalculation changes settled state`);
}
