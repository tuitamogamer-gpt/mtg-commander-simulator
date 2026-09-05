import {combatExtraProof} from './oracle-v8-combat-restrictions-proof.mjs';
import assert from 'node:assert/strict';
import {stageCondition} from './oracle-v5-proof.mjs';

export async function combatStaticProof(MTG, entry, operation, role, h) {
  const ctx = h.gameFor(MTG, [h.decision(), h.decision()], {ai: role === 'ai'}), {game, a, b} = ctx;
  h.assertControllerRole(MTG, ctx, entry.raw.name + '/' + role + '/combat-restriction');
  const make = (name, player = a, fields = {}) => h.permanent(MTG, game, player, h.fixtureDefinition(name, fields.types || ['Creature'], {power: '2', toughness: '20', subtypes: ['Bear'], ...fields}));
  const source = h.permanent(MTG, game, a, entry.raw.name);
  if (Number(source.def.toughness) === 0) game.addCounters(source, '+1/+1', 3);
  let card = source;
  if (operation.kind === 'attachment-grant') {card = make('Combat enchanted host'); await game.attach(source, card);}
  else if (operation.scope === 'filtered-permanents') card = h.stageGenericTarget(MTG, ctx, {...operation.filters[0], controller: 'you'}, 'combat recipient');
  else if (operation.scope && operation.scope !== 'self') card = make('Combat group recipient', operation.scope === 'opponent-creatures' ? b : a);
  stageCondition(MTG, ctx, operation.condition, operation.conditionSubject === 'affected' ? card : source, h);
  if (operation.condition?.kind === 'source-quality' && operation.condition.filter.what === 'creature' && !source.is('Creature')) {
    const abilities = entry.implementation.filter(candidate => candidate.kind === 'generic-ability' && !candidate.from);
    const ordinal = abilities.findIndex(candidate => candidate.effects.some(effect => effect.action === 'animate' && effect.target === 'self'));
    assert.ok(ordinal >= 0, entry.raw.name + ': its printed animation satisfies the source quality');
    const compiled = source.def.abilities.filter(ability => ability.oracleCompiled)[ordinal]; h.fund(a, 100);
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.ability === compiled);
    assert.ok(action); assert.equal(await game.activateAbility(a, action), true); await h.resolveAll(game);
    assert.equal(source.is('Creature'), true, entry.raw.name + ': actual paid animation makes the source a creature');
  }
  const rule = operation.combatRule; game.recalc(); card.sick = false; card.tapped = false;
  const extra = await combatExtraProof(MTG,ctx,card,rule,h,entry.raw.name); if(extra !== null)return extra;
  const blocker = make('Combat legal blocker', b, {power: '2', kws: ['flying', 'reach', 'shadow', 'horsemanship'], colorsOverride: ['W', 'U', 'B', 'R', 'G']});
  // A shadow blocker cannot block ordinary creatures. Match the source's
  // existing evasion so each test isolates this printed additional clause.
  blocker.def.kws = ['flying', 'reach', 'horsemanship', ...(card.kw('shadow') ? ['shadow'] : [])];
  game.recalc(); card.attacking = b;
  const restricted = () => !!card.cur.cantBeBlockedBy?.(game, blocker);
  const attacks = () => game.canAttackTarget(card, b);
  const value = expected => {
    if (rule.kind === 'defender-attack') assert.equal(attacks(), expected);
    else if (rule.kind === 'attacker-block') assert.equal(!!card.cur.cantBlockCreature?.(game, blocker), !expected);
    else assert.equal(restricted(), expected);
  };
  if (rule.kind === 'block-capacity') {
    if (rule.equipment) for (let i = 0; i < 2; i++) {const equipment = make('Capacity Equipment ' + i, a, {types: ['Artifact'], subtypes: ['Equipment']}); await game.attach(equipment, card);}
    const expected = rule.any ? Infinity : 1 + (rule.equipment ? 2 : rule.additional);
    assert.equal(game.blockerCapacity(card), expected);
    card.attacking = null;
    const attackers = Array.from({length: Math.min(9, Number.isFinite(expected) ? expected + 1 : 5)}, (_, i) => make('Capacity incoming ' + i, b));
    assert.equal(game.blockDeclarationLegal(attackers, attackers.slice(0, Math.min(expected, attackers.length)).map(attacker => ({blocker: card, attacker}))), true);
    if (Number.isFinite(expected)) assert.equal(game.blockDeclarationLegal(attackers, attackers.map(attacker => ({blocker: card, attacker}))), false);
    const proposal = await a.controller.decide(game, {type: 'blockers', attackers, potential: [card], player: a});
    assert.equal(game.blockDeclarationLegal(attackers, Array.isArray(proposal) ? proposal : []), true);
    return 4;
  }
  if (rule.kind === 'blocker-bounds') {
    const bounds = game.blockerBounds(card); if (rule.min) assert.ok(bounds.min >= rule.min); if (rule.max) assert.ok(bounds.max <= rule.max);
    const others = [blocker, make('Second blocker', b, {kws: blocker.def.kws}), make('Third blocker', b, {kws: blocker.def.kws})];
    const n = rule.min || 1;
    assert.equal(game.blockDeclarationLegal([card], others.slice(0, n).map(blocker => ({blocker, attacker: card}))), bounds.min <= bounds.max);
    const bad = rule.max ? 2 : n - 1;
    assert.equal(game.blockDeclarationLegal([card], others.slice(0, bad).map(blocker => ({blocker, attacker: card}))), false);
    return 4;
  }
  if (rule.kind === 'companion') {
    const friend = make('Combat companion', a, {power: String(card.power + 1), colorsOverride: ['B', 'G']});
    for (const key of [rule.attack && 'attackGroupRestrictions', rule.block && 'blockGroupRestrictions'].filter(Boolean)) {
      assert.ok(card.cur[key]?.length); assert.equal(card.cur[key].every(test => test([card])), false);
      assert.equal(card.cur[key].every(test => test([card, friend])), true);
    }
    if (rule.attack) {
      const declarations = await a.controller.decide(game, {type: 'attackers', eligible: [card, friend], opponents: [b], attackTargets: [b], forced: [card]});
      const proposed = (Array.isArray(declarations) ? declarations : []).map(row => row.card);
      if (!proposed.includes(card)) proposed.push(card);
      game.completeAttackCompanions(proposed, [card, friend], [card]);
      assert.equal(game.attackGroupLegal(proposed), true); assert.equal(proposed.includes(friend), true);
    }
    return 5;
  }
  if (rule.kind === 'monarch-blockers') {game.monarch = a; value(false); game.monarch = b; value(true); game.monarch = a; value(false); return 3;}
  if (rule.kind === 'opponent-damaged') {
    assert.equal(attacks(), false); await game.loseLife(b, 1); assert.equal(attacks(), false);
    await game.damagePlayer(source, b, 1); assert.equal(attacks(), true); b.turnState = b.freshTurnState(); assert.equal(attacks(), false); return 4;
  }
  if (rule.kind === 'cast-history') {
    const probe = () => rule.mode === 'attack' ? attacks() : restricted(); assert.equal(probe(), false);
    const types = rule.quality === 'creature' ? ['Creature'] : ['Artifact'];
    const spell = new MTG.CardInst(h.fixtureDefinition('Combat qualifying cast', types, {cost: '{1}', power: '1', toughness: '1'}), a);
    spell.zone = 'hand'; a.hand.push(spell); h.fund(a);
    assert.equal(await game.castSpell(a, spell, {from: 'hand'}), true); assert.equal(probe(), true); await h.resolveAll(game);
    a.turnState = a.freshTurnState(); assert.equal(probe(), false); return 4;
  }
  const predicate = rule.predicate, flipped = rule.kind === 'defender-evasion' && !!rule.negate;
  const expect = state => value(flipped ? !state : state);
  if (predicate.kind === 'more-permanents') {
    // Equalize first, then cross the strict threshold in both directions.
    const count = player => game.bf().filter(card => card.ctrl === player && card.is(predicate.type)).length;
    while (count(a) < count(b)) make('Own comparison equalizer', a, {types: [predicate.type]});
    while (count(b) < count(a)) make('Other comparison equalizer', b, {types: [predicate.type]});
    expect(false); const support = make('Greater own count', a, {types: [predicate.type]}); expect(true); await game.move(support, 'graveyard'); expect(false);
  } else if (predicate.kind === 'most-creatures') {
    while (game.creatures(b).length < game.creatures(a).length) make('Tied defender', b);
    expect(true); make('Own strict lead'); expect(false); make('Defender restores tie', b); expect(true);
  } else if (predicate.kind === 'shared-creature-type') {
    // No initial three creatures share a subtype; one Changeling contributes
    // once to each actual subtype, never once for every possible type.
    expect(false); make('Shared bear', b); const support = make('Shared Changeling', b, {subtypes: [], changeling: true}); expect(true);
    await game.move(support, 'graveyard'); expect(false);
  } else if (predicate.kind === 'poisoned') {b.poison = 0; expect(false); b.poison = 1; expect(true); b.poison = 0; expect(false);
  } else if (predicate.kind === 'monarch') {game.monarch = a; expect(false); game.monarch = b; expect(true); game.monarch = a; expect(false);
  } else if (predicate.kind === 'graveyard') {b.graveyard.length = 0; expect(false); for (let i = 0; i < predicate.min; i++) h.zoneCard(MTG, b, 'Forest', 'graveyard'); expect(true); b.graveyard.pop(); expect(false);
  } else {
    expect(false);
    const support = make('Defender qualifying permanent', b, {types: predicate.types || ['Enchantment'], subtypes: [], super: predicate.snow ? ['Snow'] : []});
    expect(true);
    if (predicate.untapped) {support.tapped = true; expect(false); support.tapped = false; expect(true);}
    await game.move(support, 'graveyard'); expect(false);
  }
  return 4;
}
