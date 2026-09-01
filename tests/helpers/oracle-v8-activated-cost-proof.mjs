import assert from 'node:assert/strict';

// Stage only the closed v8 cost choices that are not already part of the
// generic proof harness. The returned cards are fed to the human controller's
// exact chooseCards route and are also retained for the post-payment witness.
export function stageActivatedCost(MTG, context, cost, helpers) {
  const returnCards = [];
  if (cost?.returnFilter) {
    for (let index = 0; index < cost.returnN; index++) {
      const staged = helpers.stageGenericTarget(MTG, context,
        { ...cost.returnFilter, controller: 'you' }, `activated-return-cost-${index}`);
      returnCards.push(...[staged].flat());
    }
  }
  return { returnCards, wantedCards: returnCards.slice() };
}

export function assertActivatedCost(context, cost, source, before, trace, label) {
  const { a } = context;
  if (cost?.returnFilter) {
    const choice = trace.findLast(row => row.query?.type === 'chooseCards' &&
      row.query.aiHint?.kind === 'bounceCost' && row.query.aiHint.card === source);
    assert.ok(choice, `${label}: controller receives the printed return-cost choice`);
    assert.equal(choice.result.length, cost.returnN, `${label}: exact return-cost count selected`);
    assert.equal(new Set(choice.result).size, cost.returnN, `${label}: return-cost cards are distinct`);
    for (const card of choice.result) {
      assert.ok(choice.query.from.includes(card), `${label}: returned card came from the legal cost pool`);
      assert.equal(before.cards.get(card)?.zone, 'battlefield', `${label}: return cost starts on battlefield`);
      assert.equal(card.zone, 'hand', `${label}: chosen return-cost card reaches its owner's hand`);
    }
    const moves = context.moveEvidence.slice(before.moveEvidenceIndex).filter(row =>
      choice.result.includes(row.card) && row.from === 'battlefield' && row.to === 'hand');
    assert.equal(moves.length, cost.returnN, `${label}: each selected permanent is actually returned`);
  }
  if (cost?.discardRandom) {
    const oldHand = before.players.get(a).handCards;
    const discarded = oldHand.filter(card => card.zone === 'graveyard');
    assert.equal(discarded.length, cost.discardRandom, `${label}: exact random-discard count is paid`);
    assert.ok(discarded.every(card => oldHand.includes(card)), `${label}: random discard uses only the payer's prior hand`);
    assert.equal(trace.some(row => row.query?.type === 'chooseCards' &&
      /random/i.test(String(row.query.prompt || ''))), false,
    `${label}: random discard never exposes a hidden card choice`);
  }
  if (cost?.exertSelf) {
    assert.equal(cost.tap, true, `${label}: supported exert cost is paired with the tap symbol`);
    assert.equal(source.tapped, true, `${label}: exert source pays the printed tap cost`);
    assert.equal(source.meta.noUntapOnce, true, `${label}: exert marks exactly the next untap`);
  }
}

export function assertActivatedManaCost(operation, source, before, chosen, label) {
  if (operation.activationCost?.exertSelf) {
    assert.equal(operation.activationCost.tap, true, `${label}: mana exert requires the tap symbol`);
    assert.equal(source.tapped, true, `${label}: mana source taps while producing mana`);
    assert.equal(source.meta.noUntapOnce, true, `${label}: mana-source exert marks the next untap`);
  }
  if (operation.storageCounterMana) {
    const kind = operation.storageCounterMana.kind;
    const amount = Object.entries(chosen || {}).filter(([color]) => 'WUBRGC'.includes(color))
      .reduce((sum, [, n]) => sum + Math.max(0, Number(n) || 0), 0);
    const old = before.cards.get(source)?.counters[kind] || 0;
    assert.ok(amount > 0 && amount <= old, `${label}: proof chooses a legal positive storage amount`);
    assert.equal(source.counters[kind] || 0, old - amount,
      `${label}: storage mana removes exactly one counter per produced mana`);
  }
}
