import assert from 'node:assert/strict';

const targetKinds = new Set([
  'spell-pump', 'spell-damage', 'spell-destroy', 'spell-exile', 'spell-bounce',
  'spell-tap', 'spell-untap', 'spell-counter-on-creature', 'spell-graveyard-return',
]);
const poolTotal = player => Object.values(player.pool).reduce((sum, amount) => sum + Number(amount || 0), 0);

function fundExact(MTG, player, cost, x = 3) {
  for (const color of Object.keys(player.pool)) player.pool[color] = 0;
  const parsed = MTG.parseCost(cost);
  player.pool.C = parsed.generic + (parsed.x || 0) * x;
  for (const pip of parsed.pips) {
    const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G', 'C'].includes(symbol));
    if (color) player.pool[color]++;
    else if (pip.includes('TWO')) player.pool.C += 2;
    else throw new Error('Mayhem proof cannot fund unknown pip ' + JSON.stringify(pip));
  }
  return {parsed, x};
}

async function stageSpell(MTG, context, entry, mayhem, helpers) {
  const staged = [];
  helpers.stageCardCosts?.(MTG, context, entry);
  for (const operation of entry.implementation || []) {
    if (operation === mayhem) continue;
    if (operation.kind === 'spell-v4') {
      for (const [index, target] of operation.targets.entries()) staged.push(await helpers.stageSpellV4Target(MTG, context,
        {name: entry.raw.name}, target, operation.effects.find(effect => effect.targetIds.includes(target.id)),
        helpers.spellV4TargetVariants(target)[0], index));
      continue;
    }
    for (const [index, target] of (operation.targets || []).entries()) staged.push(target.zone === 'stack'
      ? await helpers.stageGenericStackTarget(MTG, context, target, index)
      : helpers.stageGenericTarget(MTG, context, target, index, operation.effects?.find(effect => effect.target === index)));
    if (!targetKinds.has(operation.kind) || operation.targets?.length) continue;
    if (operation.kind === 'spell-graveyard-return') {
      const type = operation.what === 'instant or sorcery' ? 'Instant'
        : operation.what === 'permanent' ? 'Artifact' : operation.what[0].toUpperCase() + operation.what.slice(1);
      staged.push(helpers.zoneCard(MTG, context.a, helpers.fixtureDefinition('Mayhem graveyard value', [type], {
        cost: '{3}', power: '6', toughness: '6',
      }), 'graveyard'));
      continue;
    }
    const hostile = !['spell-counter-on-creature'].includes(operation.kind);
    const filter = {...operation, what: String(operation.what || 'creature').replace(/^target /, ''),
      controller: hostile ? 'opponent' : 'you'};
    const target = helpers.stageGenericTarget(MTG, context, filter, 'mayhem-target', {
      action: operation.kind.slice(6), n: operation.n, power: operation.power, toughness: operation.toughness,
    });
    staged.push(target);
  }
  return staged.flat().filter(Boolean);
}

export async function mayhemProof(MTG, entry, operation, role, helpers) {
  assert.equal(operation.kind, 'mechanic-mayhem-v8');
  assert.equal(operation.contract, 'mechanic-mayhem-v8');
  assert.ok(['Instant', 'Sorcery'].some(type => entry.raw.types.includes(type)));
  assert.equal(operation.speed, entry.raw.types.includes('Instant') ? 'instant' : 'sorcery');
  const trace = [];
  const controller = helpers.decision({
    chooseTargets: (game, query) => query.candidates.slice(0, query.min || 1),
    chooseCards: (game, query) => query.from.slice(0, query.min || 1),
    chooseOption: (game, query) => query.options.find(option => option.key === 'yes')?.key || query.options[0]?.key,
    chooseX: (game, query) => Math.min(3, query.max ?? 3),
  });
  const context = helpers.gameFor(MTG, [controller, helpers.decision()], {ai: role === 'ai'});
  const {game, a, b} = context;
  helpers.assertControllerRole(MTG, context, entry.raw.name + '/' + role + '/Mayhem');
  helpers.fillLibrary(MTG, a, 40); helpers.fillLibrary(MTG, b, 40);
  const staged = await stageSpell(MTG, context, entry, operation, helpers);
  let threat = staged.find(card => card instanceof MTG.CardInst && card.zone === 'battlefield' && card.ctrl === b);
  if (!threat) threat = helpers.permanent(MTG, game, b, helpers.fixtureDefinition('Mayhem opposing threat', ['Creature'], {
    cost: '{7}{G}', power: '20', toughness: '4',
  }));
  if (threat.is('Creature')) {
    // The proof fixture is private to this game.  Make removal immediately
    // useful so the real AI has a normal reason to spend the Mayhem spell.
    threat.def.power = '20'; threat.def.toughness = '4'; game.recalc();
  }
  const source = helpers.zoneCard(MTG, a, entry.raw.name, 'hand'), handVersion = source.zoneVersion;
  await game.discard(a, [source]);
  assert.equal(source.zone, 'graveyard'); assert.equal(source.zoneVersion, handVersion + 1);
  assert.equal(source.meta._discardedBy, a); assert.equal(source.meta._discardedTurn, game.turnNo);
  assert.equal(source.meta._discardedZoneVersion, source.zoneVersion);
  const {parsed, x} = fundExact(MTG, a, operation.cost);
  if (operation.speed === 'instant' && role === 'ai') {
    game.turnPlayer = b; game.phase = 'combat'; game.step = 'declareAttackers'; threat.attacking = a;
  }
  const offers = game.castableList(a).filter(candidate => candidate.card === source && candidate.alt?.mayhem);
  assert.equal(offers.length, 1, entry.raw.name + ': exact Mayhem graveyard offer');
  const offer = offers[0];
  assert.equal(offer.from, 'graveyard'); assert.equal(offer.alt.altCostStr, operation.cost);
  assert.equal(offer.alt.speed, operation.speed);
  const computed = game.spellCost(a, source, {...offer.alt, from: offer.from});
  assert.equal(computed.generic, parsed.generic); assert.equal(computed.x, parsed.x);
  assert.deepEqual(computed.pips.map(pip => Array.from(pip)), parsed.pips.map(pip => Array.from(pip)));
  const beforeMana = poolTotal(a);
  if (role === 'ai') {
    const type = operation.speed === 'instant' ? 'priority' : 'main';
    const action = await a.controller.decide(game, {type, player: a, phase: game.phase,
      casts: game.castableList(a), acts: game.activatableList(a), lands: [], stack: game.stack});
    trace.push(action); assert.equal(action.kind, 'cast', entry.raw.name + ': actual local AI chooses Mayhem');
    assert.equal(action.card, source); assert.equal(action.alt?.mayhem, true);
    assert.equal(await game.performAction(a, action), true);
  } else assert.equal(await game.castSpell(a, source, {from: offer.from, alt: offer.alt, xVal: x}), true);
  assert.equal(source.zone, 'stack'); assert.ok(poolTotal(a) < beforeMana || operation.cost === '{0}');
  const stackObject = game.stack.find(object => object.card === source);
  assert.ok(stackObject); assert.equal(stackObject.castOpts.mayhem, true);
  assert.equal(stackObject.castOpts.altCostStr, operation.cost); assert.equal(stackObject.from, 'graveyard');
  await helpers.resolveAll(game);
  assert.equal(source.zone, 'graveyard', entry.raw.name + ': resolved Mayhem spell is not exiled');
  assert.equal(game.castableList(a).some(candidate => candidate.card === source && candidate.alt?.mayhem), false,
    entry.raw.name + ': resolution created a new, undiscarded graveyard object');
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
  return 6;
}
