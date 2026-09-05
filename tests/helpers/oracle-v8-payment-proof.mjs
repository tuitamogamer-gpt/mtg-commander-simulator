import assert from 'node:assert/strict';
import { stageCount, countValue, matchesTarget } from './oracle-v5-proof.mjs';

const games = new WeakMap(), installed = new WeakSet();
const allCards = game => [...game.bf(), ...game.players.flatMap(player => ['hand', 'library', 'graveyard', 'exile', 'command'].flatMap(zone => player[zone] || []))];
const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);
const poolSize = pool => Object.values(pool || {}).reduce((sum, n) => sum + n, 0);

// One passive wrapper per loaded engine, with separate witness storage for
// every game. Neither card definitions, choices nor runtime effects change.
export function installPaymentProof(MTG, context, helpers) {
  const state = { context, helpers, witnesses: [], reveals: [] };
  games.set(context.game, state); context.paymentWitnesses = state.witnesses;
  const reveal = context.game.revealToHuman;
  context.game.revealToHuman = async function(query) { state.reveals.push(query); return reveal.call(this, query); };
  if (installed.has(MTG.OracleV8Effects)) return;
  installed.add(MTG.OracleV8Effects);
  const original = MTG.OracleV8Effects.run;
  MTG.OracleV8Effects.run = async function(runCtx, effect, runtimeHelpers) {
    const state = games.get(runCtx.g);
    if (!state || effect.action !== 'resolution-cost') return original.call(this, runCtx, effect, runtimeHelpers);
    const { context, helpers: h } = state;
    const snapshot = child => {
      const result = h.genericProofSnapshot(context, [runCtx.src, ...allCards(runCtx.g)]);
      for (const [card, value] of result.cards) { value.mv = card.mv; value.super = (card.cur?.super || card.def?.super || []).slice(); }
      result.drawEvidenceIndex = context.drawEvidence?.length || 0;
      result.oracleX = child?.x ?? runCtx.x ?? 0; return result;
    };
    const row = { effect, source: runCtx.src, sourceName: runCtx.src.name, player: runCtx.you, targets: (runCtx.targets || []).slice(),
      sourceZoneVersion: runCtx.sourceZoneVersion, before: snapshot(runCtx), branches: [],
      traceStart: h.trace?.length, sacrifices: context.sacrificeEvidence?.length || 0, reveals: state.reveals.length };
    state.witnesses.push(row);
    try {
      return await original.call(this, runCtx, effect, { ...runtimeHelpers, effects: async (child, effects) => {
        const branch = { effects, paid: effects === effect.effects, ctx: { ...child }, before: snapshot(child),
          traceEnd: h.trace?.length, reveals: state.reveals.length };
        row.branches.push(branch);
        const result = await runtimeHelpers.effects(child, effects);
        branch.after = snapshot(child); return result;
      } });
    } finally { row.after = snapshot(runCtx); row.traceEnd = h.trace?.length; row.revealEnd = state.reveals.length; }
  };
}

export function stagePaymentEffect(MTG, context, effect, h) {
  if (effect.action !== 'resolution-cost') return false;
  (context.paymentPreparations ||= []).push(effect);
  for (const cost of effect.payment.choices || [effect.payment]) {
    for (const value of [cost.xValue, cost.xMax, ['draw', 'life'].includes(cost.kind) ? cost.n : null]) {
      if (value && typeof value === 'object' && value.kind !== 'event-amount') stageCount(MTG, context, value, h);
    }
    if (cost.kind === 'remove-counter' && typeof cost.target === 'number') {
      for (const card of [context.oracleProofTargets?.[cost.target]].flat().filter(Boolean)) {
        const missing = Math.max(0, cost.n - (card.counters[cost.counter] || 0));
        if (missing) context.game.addCounters(card, cost.counter, missing, false, card.ctrl);
      }
    }
    if (cost.kind === 'process-exile') {
      const owner = context.b || context.game.players.find(player => player !== context.a && !player.lost);
      assert.ok(owner, 'processor proof has an opposing card owner');
      for (let i = 0; i < cost.n; i++) h.zoneCard(MTG, owner,
        h.fixtureDefinition('Oracle processed exile ' + i, ['Creature'], { power: '2', toughness: '2' }), 'exile');
      continue;
    }
    if (!cost.zone || cost.target !== undefined || cost.n === 'all') continue;
    for (let i = 0; i < cost.n; i++) {
      const stageZone = cost.zone === 'hand' ? 'graveyard' : cost.zone;
      const card = h.stageGenericTarget(MTG, context, { what: 'card', ...cost.filter, controller: 'you', zone: stageZone }, 'resolution-payment-' + i);
      if (cost.zone === 'hand') {
        const index = card.owner.graveyard.indexOf(card); assert.ok(index >= 0, 'payment hand fixture was staged in its owner graveyard');
        card.owner.graveyard.splice(index, 1); card.zone = 'hand'; card.owner.hand.push(card);
      }
    }
  }
  return true;
}

export function preparePaymentSource(MTG, context, source) {
  for (const effect of context.paymentPreparations || []) for (const cost of effect.payment.choices || [effect.payment]) {
    if (cost.kind === 'remove-counter' && cost.target === 'self' && source.zone === 'battlefield') {
      const missing = Math.max(0, cost.n - (source.counters[cost.counter] || 0));
      if (missing) context.game.addCounters(source, cost.counter, missing, false, context.a);
    }
    for (const value of [cost.xValue, cost.xMax, cost.kind === 'draw' ? cost.n : null]) if (value?.kind === 'source-counters' && source.zone === 'battlefield') {
      const missing = Math.max(0, 3 - (source.counters[value.counter] || 0));
      if (missing) context.game.addCounters(source, value.counter, missing, false, context.a);
    }
  }
}

function paymentAmount(ctx, source, value, before, targets) {
  if (typeof value === 'number') return value;
  if (value?.kind === 'payment-count') return Math.max(0, ctx.oraclePaymentCapture?.count || 0) * (value.multiply ?? 1);
  if (value?.kind === 'payment-stat') return Math.max(0, ctx.oraclePaymentCapture?.cards?.[0]?.before?.[value.stat] || 0) * (value.multiply ?? 1);
  if (value?.kind === 'target-stat') return Math.max(0, before.cards.get([targets[value.target]].flat()[0])?.[value.stat] || 0);
  if (value?.kind === 'target-count') return countValue({ ...ctx, a: [targets[value.target]].flat()[0] }, source, value.count, before) * (value.multiply ?? 1);
  if (value?.kind === 'event-amount') return ctx.eventAmount ?? 0;
  if (value?.kind === 'event-card-stat') return Math.max(0, ctx.eventCardStats?.[value.stat] ?? ctx.eventCardBefore?.[value.stat] ?? 0);
  if (['source-stat', 'explicit-source-stat'].includes(value?.kind)) return Math.max(0, before.cards.get(source)?.[value.stat] || 0);
  return countValue(ctx, source, value, before) * (value.multiply ?? 1);
}

export async function assertPaymentEffect(MTG, context, entry, effect, source, selectedTargets, damagedPlayer, before, trace, label, h) {
  if (effect.action !== 'resolution-cost') return false;
  const row = context.paymentWitnesses?.find(row => !row.verified && row.source === source && same(row.effect, effect));
  assert.ok(row, label + ': the real resolution-cost runtime was executed'); row.verified = true;
  const choices = trace.slice(row.traceStart ?? 0, row.traceEnd ?? trace.length);
  const question = choices.find(choice => choice.query.type === 'chooseOption' && choice.query.prompt === row.sourceName + ': pay for the following effect?');
  const cost = effect.payment.kind === 'alternatives'
    ? effect.payment.choices[Number(/^pay-(\d+)$/.exec(question?.result || '')?.[1] ?? -1)] : effect.payment;
  const branch = row.branches[0];
  const bodyDeclined = !branch && choices.some(choice => choice.query.prompt === row.sourceName + ': use the following effect?' && choice.result === 'no');
  const paid = branch?.paid || bodyDeclined;
  const afterCost = branch?.before || row.after;
  const old = row.before.players.get(row.player), current = afterCost.players.get(row.player);
  if (effect.optional === false && effect.payment.kind !== 'alternatives') assert.equal(question, undefined, label + ': mandatory cost has no optional payment prompt');
  if (paid) {
    assert.ok(cost, label + ': a paid cost is identified');
    const capture = branch?.ctx.oraclePaymentCapture;
    assert.ok(capture, label + ': successful payment exposes a lexical payment capture');
    assert.equal(capture.kind, cost.kind, label + ': capture records the chosen payment kind');
    if (effect.optional !== false) assert.ok(question && question.result !== 'no', label + ': controller chose to pay');
    if (cost.kind === 'mana') {
      const x = branch?.before.oracleX ?? choices.find(choice => choice.query.type === 'chooseX')?.result ?? row.after.oracleX ?? 0, parsed = MTG.parseCost(cost.mana);
      const nominal = parsed.generic + parsed.x * x + parsed.pips.length;
      // Staged bulk games use floating unrestricted mana. The standalone
      // effect tests also cover mana sources and alternative symbol choices.
      const phyLife = context.lifeEvidence?.slice(row.before.lifeEvidenceIndex, afterCost.lifeEvidenceIndex).filter(item => item.player === row.player).reduce((sum, item) => sum + item.actual, 0) || 0;
      const spent = poolSize(old.pool) - poolSize(current.pool);
      assert.ok(spent >= nominal - phyLife / 2, label + ': the exact resolution mana was consumed');
      assert.equal(capture.count, 0); assert.equal(capture.cards.length, 0);
      if (cost.chooseX) {
        const chosen = choices.find(choice => choice.query.type === 'chooseX' && choice.query.prompt === row.sourceName + ': choose X for the resolution payment');
        assert.ok(chosen, label + ': X chosen by the actual controller on resolution');
        assert.equal(x, chosen.result); assert.ok(Number.isInteger(x) && x >= chosen.query.min && x <= chosen.query.max);
        if (cost.xMax !== undefined) assert.ok(x <= paymentAmount(context, source, cost.xMax, row.before, row.targets));
      }
    } else if (cost.kind === 'life') {
      const n = paymentAmount(context, source, cost.n, row.before, row.targets);
      const loss = context.lifeEvidence?.slice(row.before.lifeEvidenceIndex, afterCost.lifeEvidenceIndex).find(item => item.player === row.player && item.n === n);
      assert.ok(loss || n === 0 && current.life === old.life, label + ': life cost has a real life-loss witness');
      assert.equal(capture.count, n); assert.equal(capture.cards.length, 0);
    } else if (cost.kind === 'draw') {
      const n = paymentAmount(context, source, cost.n, row.before, row.targets);
      assert.equal(capture.count, n); assert.equal(capture.cards.length, 0);
      const draw = context.drawEvidence?.slice(row.before.drawEvidenceIndex, afterCost.drawEvidenceIndex).find(item => item.player === row.player && item.source === source && item.n === n);
      if (context.drawEvidence) {
        assert.ok(draw, label + ': actual draw pipeline receives the exact cost amount');
        assert.ok(Number.isInteger(draw.drawn) && draw.drawn >= 0, label + ': draw replacements produce a concrete card count');
        const moves = context.moveEvidence.slice(row.before.moveEvidenceIndex, afterCost.moveEvidenceIndex);
        const libraryDelta = moves.reduce((sum, move) => sum + (move.from !== 'library' && move.after.zone === 'library' ? 1 : 0) - (move.from === 'library' && move.after.zone !== 'library' ? 1 : 0), 0);
        const extraHand = moves.filter(move => move.from !== 'hand' && move.after.zone === 'hand').length;
        assert.equal(current.library, old.library - draw.drawn + libraryDelta, label + ': draw and replacement library movements agree');
        assert.equal(current.hand, old.hand + draw.drawn + extraHand, label + ': drawn or replacement cards reach the payer hand before the payoff');
      } else {
        assert.equal(current.library, Math.max(0, old.library - n), label + ': draw cost moves the expected top cards');
        assert.equal(current.hand, old.hand + Math.min(n, old.library), label + ': draw payment reaches the payer hand before the payoff');
      }
    } else {
      const selection = choices.find(choice => choice.query.type === 'chooseCards' && choice.query.prompt === row.sourceName + ': choose cards to ' + cost.kind);
      const cards = cost.target === 'self' ? [source] : typeof cost.target === 'number' ? [row.targets[cost.target]].flat().filter(Boolean)
        : cost.n === 'all' ? old.handCards : selection?.result || [];
      const need = cost.kind === 'remove-counter' ? 1 : cost.n === 'all' ? old.handCards.length : cost.n;
      assert.equal(cards.length, need, label + ': exact cost cardinality'); assert.equal(new Set(cards).size, cards.length, label + ': distinct payment objects');
      assert.equal(capture.count, cost.kind === 'remove-counter' ? cost.n : cards.length, label + ': capture has the paid quantity');
      assert.equal(capture.cards.length, cards.length, label + ': capture has every paid card exactly once');
      assert.ok(capture.cards.every((item, index) => item.card === cards[index]), label + ': capture preserves paid object order');
      if (selection) { assert.equal(selection.query.min, need); assert.equal(selection.query.max, need); assert.ok(cards.every(card => selection.query.from.includes(card))); }
      for (const card of cards) {
        const start = row.before.cards.get(card), end = afterCost.cards.get(card);
        assert.ok(start && end, label + ': payment has before/after object evidence'); assert.equal(start.zone, cost.zone);
        const captured = capture.cards.find(item => item.card === card); assert.ok(captured, label + ': paid object has a capture row');
        assert.equal(captured.zoneVersionBefore, start.zoneVersion); assert.equal(captured.zoneVersionAfter, end.zoneVersion);
        // The capture keeps the engine's characteristic snapshot plus explicit
        // incarnation versions. Zone identity is proved independently by the
        // pre-payment snapshot and move witness above.
        for (const stat of ['power', 'toughness', 'mv']) assert.equal(captured.before[stat], start[stat], label + ': capture retains paid ' + stat);
        if (cost.filter) {
          const view = { ...card, ...start, cur: { ...card.cur, super: start.super }, is: type => start.types.includes(type), hasSub: type => start.subtypes.includes(type), kw: keyword => start.keywords.includes(keyword) };
          assert.ok(matchesTarget(view, { ...cost.filter, excludeSelf: false }, { ...context, a: row.player }, source), label + ': the paid card satisfies every printed quality');
          if (cost.filter.excludeSelf) assert.ok(card !== source || start.zoneVersion !== row.sourceZoneVersion, label + ': another never sacrifices the same source incarnation');
        }
        if (['sacrifice', 'tap', 'return'].includes(cost.kind)) assert.equal(start.ctrl, row.player, label + ': payer controls the paid permanent');
        if (cost.kind === 'tap') { assert.equal(start.tapped, false); assert.equal(end.tapped, true); assert.equal(start.zoneVersion, end.zoneVersion); }
        else if (cost.kind === 'remove-counter') assert.equal(end.counters[cost.counter] || 0, (start.counters[cost.counter] || 0) - cost.n);
        else if (cost.kind === 'reveal') {
          assert.equal(end.zoneVersion, start.zoneVersion, label + ': reveal leaves the card in its original hand');
          assert.ok(games.get(context.game).reveals.slice(row.reveals, branch?.reveals ?? row.revealEnd).some(query => query.cards.includes(card)), label + ': a reveal discloses the selected card');
        }
        else {
          const move = context.moveEvidence?.slice(row.before.moveEvidenceIndex, afterCost.moveEvidenceIndex).find(item => item.card === card && item.before.zoneVersion === start.zoneVersion);
          assert.ok(move, label + ': a real zone transition paid this cost');
          const destination = { sacrifice: 'graveyard', discard: 'graveyard', return: 'hand', exile: 'exile', library: 'library', 'process-exile': 'graveyard' }[cost.kind];
          assert.equal(move.to, destination, label + ': printed cost destination');
        }
        if (cost.kind === 'process-exile') assert.notEqual(card.owner, row.player, label + ': processor uses an opponent-owned exiled card');
      }
      if (cost.kind === 'library' && cards.length) {
        const order = cards.length > 1 ? choices.find(choice => choice.query.type === 'chooseCards' && choice.query.prompt === 'Order cards on the ' + cost.position + ' of your library')?.result : cards;
        assert.ok(order, label + ': library placement uses the owner ordering');
        const actual = (cost.position === 'top' ? current.libraryCards.slice(-cards.length) : current.libraryCards.slice(0, cards.length)).reverse();
        assert.equal(actual.length, order.length, label + ': ordered library payment has exact cardinality');
        assert.ok(actual.every((card, index) => card === order[index]), label + ': every paid card occupies the printed end in the chosen order');
      }
      if (cost.kind === 'sacrifice') assert.ok(context.sacrificeEvidence.slice(row.sacrifices).length >= need, label + ': payment emits actual sacrifice events');
    }
  } else {
    if (question) assert.equal(question.result, 'no', label + ': payable optional branch was declined by the controller');
    assert.equal(current.life, old.life, label + ': unpaid cost does not consume life');
    assert.deepEqual(current.pool, old.pool, label + ': unpaid cost does not consume mana');
    assert.deepEqual(current.handCards, old.handCards, label + ': unpaid cost leaves the hand unchanged');
    for (const [card, state] of row.before.cards) {
      const later = afterCost.cards.get(card); assert.ok(later); assert.equal(later.zoneVersion, state.zoneVersion, label + ': unpaid cost never moves an object');
      assert.equal(later.tapped, state.tapped, label + ': unpaid cost never taps a permanent');
    }
  }
  if (branch) {
    const childContext = { ...context, a: row.player, oraclePaymentCapture: branch.ctx.oraclePaymentCapture,
      oracleAnnouncementTrace: context.oracleAnnouncementTrace || trace,
      sacrificeEvidence: branch.ctx.sacd || context.sacrificeEvidence.slice(row.sacrifices) };
    const childTrace = trace.slice(branch.traceEnd ?? row.traceStart ?? 0, row.traceEnd ?? trace.length);
    for (const child of branch.effects) await h.assertGenericEffectEvidence(MTG, childContext, entry, child, source, row.targets, damagedPlayer, branch.before, childTrace, label + (paid ? '/paid' : '/declined'));
  } else assert.ok(bodyDeclined, label + ': missing payoff is an explicit second optional decline');
  return true;
}
