import assert from 'node:assert/strict';

const actions = new Set(['named-spell-trigger-v8', 'named-if-effect-v8']);
const conditions = new Set(['named-group-size-v8', 'named-event-unique-v8']);
export function isNamedCountOperation(node) {
  if (!node || typeof node !== 'object') return false;
  if (actions.has(node.action) || conditions.has(node.kind)) return true;
  return Object.values(node).some(value => Array.isArray(value) ? value.some(isNamedCountOperation) : isNamedCountOperation(value));
}
const pool = player => Object.values(player.pool).reduce((sum, value) => sum + value, 0);
function context(M, entry, role, h) {
  const f = h.gameFor(M, [h.decision(), h.decision()], {ai: role === 'ai'});
  h.assertControllerRole(M, f, entry.raw.name + '/named-count/' + role);
  const trace = [];
  for (const player of f.game.players) {
    h.fund(player, 30); h.fillLibrary(M, player, 30);
    const decide = player.controller.decide.bind(player.controller);
    player.controller.decide = async (game, query) => {
      const result = await decide(game, query); trace.push({query, result}); return result;
    };
  }
  h.installEffectEvidence(f);
  return {...f, trace};
}
async function cast(M, f, h, name, player = f.a) {
  h.fund(player, 30);
  const card = h.zoneCard(M, player, name, 'hand'), before = pool(player);
  const active = f.game.turnPlayer; f.game.turnPlayer = player;
  try { assert.equal(await f.game.castSpell(player, card, {from: 'hand'}), true, name + ': real paid cast'); }
  finally { f.game.turnPlayer = active; }
  const object = f.game.stack.find(row => row.card === card && !row.isCopy);
  assert.ok(object, name + ': physical spell is on the Stack');
  const cost = M.parseCost(card.def.cost), expected = cost.generic + cost.pips.length;
  assert.equal(before - pool(player), expected, name + ': exact printed source mana payment');
  return {card, object};
}
async function castPermanent(M, f, h, name, player = f.a) {
  const {card} = await cast(M, f, h, name, player); await h.resolveAll(f.game);
  assert.equal(card.zone, 'battlefield', name + ': paid permanent entered'); return card;
}
async function assertChildren(M, f, h, entry, effects, source, targets, before, start, label) {
  let checks = 0;
  for (const [index, effect] of effects.entries()) {
    assert.equal(actions.has(effect.action), false, label + ': child uses the existing independently checked effect');
    await h.assertGenericEffectEvidence(M, f, entry, effect, source, targets, f.b, before, f.trace.slice(start), label + '/child-' + index);
    checks++;
  }
  return checks;
}
function noFallback(f, label) {
  assert.equal((f.game.aiDecisionLog || []).some(row => row.fallback), false, label + ': no AI fallback');
}
function triggerOnTop(f, source, label) {
  const trigger = f.game.stack.at(-1);
  assert.ok(trigger?.kind === 'trigger' && trigger.srcCard === source, label + ': real source trigger is answerable on the Stack');
  return trigger;
}

async function shrineProof(M, entry, operation, role, h) {
  assert.equal(operation.effects.length, 1);
  const effect = operation.effects[0];
  assert.ok(['gain', 'damage', 'discard', 'squirrel'].includes(effect.mode));
  assert.ok([1, 2].includes(effect.multiply));
  let checks = 0;
  for (const caster of ['own', 'opponent']) {
    const f = context(M, entry, role, h), {game, a, b} = f;
    const third = game.addPlayer('Named graveyard witness', {name: 'Named graveyard witness'}, h.decision(), false);
    h.fillLibrary(M, third, 30);
    const source = await castPermanent(M, f, h, entry.raw.name);
    const player = caster === 'own' ? a : b;
    // Each of the three physical Sol Rings belongs to a different player.
    // Two matching cards in distinct graveyards prove the printed all-player
    // scope without giving one Commander deck duplicate nonbasic cards.
    for (const owner of game.players.filter(candidate => candidate !== player)) h.zoneCard(M, owner, 'Sol Ring', 'graveyard');
    h.zoneCard(M, player, 'Island', 'graveyard');
    for (let index = 0; index < 6; index++) h.zoneCard(M, player, 'Forest', 'hand');
    const {card: spell} = await cast(M, f, h, 'Sol Ring', player);
    await game.flushTriggers(); const trigger = triggerOnTop(f, source, entry.raw.name);
    assert.ok(trigger.ctx.oracleSourceCapture.eventPlayer === player);
    const matching = game.players.flatMap(owner => owner.graveyard).filter(card => card.name === spell.name).length;
    assert.equal(matching, 2, entry.raw.name + ': two independently staged graveyard matches');
    const n = matching * effect.multiply, before = h.genericProofSnapshot(f, [source]), start = f.trace.length;
    await game.resolveTop();
    const child = {
      gain: {action: 'gain-life', who: 0, n},
      damage: {action: 'damage', target: 0, n},
      discard: {action: 'discard', who: 0, n},
      squirrel: {action: 'token-key', tokenKey: 'squirrel', who: 0, n},
    }[effect.mode];
    checks += await assertChildren(M, f, h, entry, [child], source, [player], before, start, entry.raw.name + '/' + role + '/' + caster);
    if (effect.mode === 'gain' || effect.mode === 'damage') {
      for (const recipient of game.players) assert.equal(recipient.life - before.players.get(recipient).life,
        recipient === player ? (effect.mode === 'gain' ? n : -n) : 0, entry.raw.name + ': exact caster life change');
    } else if (effect.mode === 'discard') {
      assert.equal(before.players.get(player).handCards.length - player.hand.length, n);
      for (const recipient of game.players.filter(candidate => candidate !== player)) assert.equal(recipient.hand.length, before.players.get(recipient).handCards.length);
    } else {
      const tokens = game.bf().filter(card => card.isToken && !before.battlefield.includes(card));
      assert.equal(tokens.length, n);
      for (const token of tokens) {
        assert.ok(token.ctrl === player && token.owner === player);
        assert.equal(token.name, 'Squirrel Token'); assert.equal(token.power, 1); assert.equal(token.toughness, 1);
        assert.deepEqual([...token.colors], ['G']); assert.ok(token.is('Creature') && token.hasSub('Squirrel'));
      }
    }
    await h.resolveAll(game); noFallback(f, entry.raw.name);
  }
  return checks;
}

async function eventConditionProof(M, entry, operation, role, h) {
  const f = context(M, entry, role, h), {game, a} = f;
  let source;
  if (operation.condition.kind === 'named-group-size-v8') {
    assert.deepEqual(JSON.parse(JSON.stringify(operation.condition)), {kind:'named-group-size-v8',what:'permanent',min:2,nonland:true,nontoken:true});
    // A physical Clone supplies a second non-token with the first creature's
    // copied name through the actual paid copy-as-enters path.
    const original = await castPermanent(M, f, h, 'Grizzly Bears');
    const decide = f.a.controller.decide.bind(f.a.controller);
    if (role === 'human') f.a.controller.decide = async (g, q) => {
      if (q.type === 'chooseCards' && q.from.includes(original) || q.type === 'chooseTargets' && q.candidates.includes(original)) {
        const result = [original]; f.trace.push({query:q,result}); return result;
      }
      return decide(g,q);
    };
    const clone = await castPermanent(M, f, h, 'Clone');
    if (role === 'human') f.a.controller.decide = decide;
    assert.equal(clone.name, original.name); assert.equal(clone.isToken, false);
    source = (await cast(M, f, h, entry.raw.name)).card;
    await game.resolveTop();
  } else {
    assert.equal(operation.condition.kind, 'named-event-unique-v8');
    source = await castPermanent(M, f, h, entry.raw.name);
    const entered = (await cast(M, f, h, 'Grizzly Bears')).card;
    await game.resolveTop();
    assert.equal(entered.zone, 'battlefield');
    assert.equal(game.creatures(a).filter(card => card.name === entered.name).length, 1);
    assert.equal(a.graveyard.some(card => card.is('Creature') && card.name === entered.name), false);
  }
  await game.flushTriggers(); triggerOnTop(f, source, entry.raw.name);
  const before = h.genericProofSnapshot(f, [source]), start = f.trace.length;
  await game.resolveTop();
  const checks = await assertChildren(M, f, h, entry, operation.effects, source, [], before, start, entry.raw.name + '/' + role);
  for (const effect of operation.effects) if (effect.action === 'token-inline') {
    const tokens = game.bf().filter(card => card.isToken && !before.battlefield.includes(card));
    assert.equal(tokens.length, effect.n);
    for (const token of tokens) {
      assert.ok(token.ctrl === a && token.owner === a); assert.equal(token.name, effect.token.name + ' Token');
      assert.equal(token.power, Number(effect.token.power)); assert.equal(token.toughness, Number(effect.token.toughness));
      assert.deepEqual(Array.from(token.colors), Array.from(effect.token.colors));
      for (const type of effect.token.types) assert.ok(token.is(type));
      for (const subtype of effect.token.subtypes) assert.ok(token.hasSub(subtype));
    }
  }
  await h.resolveAll(game); noFallback(f, entry.raw.name); return checks;
}

async function namedEffectProof(M, entry, operation, role, h) {
  const f = context(M, entry, role, h), {game, a, b} = f;
  assert.equal(operation.kind, 'spell-generic');
  const matching = [h.permanent(M, game, b, 'Grizzly Bears'), h.permanent(M, game, a, 'Grizzly Bears')];
  const {card: source, object} = await cast(M, f, h, entry.raw.name);
  assert.equal(object.targets.length, 1); assert.ok(matching.includes(object.targets[0]));
  const before = h.genericProofSnapshot(f, [source, ...matching]), start = f.trace.length;
  await h.resolveAll(game);
  let checks = 0;
  for (const effect of operation.effects) {
    const children = effect.action === 'named-if-effect-v8' ? effect.effects : [effect];
    if (effect.action === 'named-if-effect-v8') assert.equal(effect.target, 0);
    checks += await assertChildren(M, f, h, entry, children, source, object.targets, before, start, entry.raw.name + '/' + role);
  }
  assert.equal(object.targets[0].zone, 'graveyard');
  assert.equal(matching.find(card => card !== object.targets[0]).zone, 'battlefield');
  noFallback(f, entry.raw.name); return checks;
}

export async function namedCountProof(M, entry, operation, role, h) {
  if (operation.effects?.some(effect => effect.action === 'named-spell-trigger-v8')) return shrineProof(M, entry, operation, role, h);
  if (operation.effects?.some(effect => effect.action === 'named-if-effect-v8')) return namedEffectProof(M, entry, operation, role, h);
  if (operation.kind === 'generic-trigger' && conditions.has(operation.condition?.kind)) return eventConditionProof(M, entry, operation, role, h);
  assert.fail('Missing named-count proof: ' + JSON.stringify(operation));
}
