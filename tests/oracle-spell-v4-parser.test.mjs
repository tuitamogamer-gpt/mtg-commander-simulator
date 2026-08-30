import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { extractRawData } from '../scripts/source-audit.mjs';
import {
  ORACLE_SPELL_V4_PARSER_VERSION,
  parseOracleSpellV4,
} from '../scripts/oracle-spell-v4.mjs';

const legacyRaw = extractRawData(fs.readFileSync(new URL('../src/data.js', import.meta.url), 'utf8'));

function legacyCard(name) {
  const card = legacyRaw.cards?.[name];
  assert.ok(card, `${name}: legacy named-card fixture exists`);
  return card;
}

function pinnedCard(batch, name) {
  const report = JSON.parse(fs.readFileSync(
    new URL(`../reports/oracle-import/batch-${batch}.json`, import.meta.url),
    'utf8',
  ));
  const card = report.cards.find(candidate => candidate.raw?.name === name);
  assert.ok(card, `${name}: pinned batch-${batch} fixture exists`);
  return card;
}

function walk(value, visitor) {
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visitor(child, key);
      walk(child, visitor);
    }
  }
}

function assertJsonClosed(result) {
  const serialized = JSON.stringify(result);
  assert.equal(typeof serialized, 'string');
  assert.deepEqual(JSON.parse(serialized), result, 'result survives a JSON round trip exactly');
  walk(result, (value, key) => {
    assert.notEqual(typeof value, 'function', `${key || 'value'} must not be executable`);
    if (key) {
      assert.ok(!['raw', 'handler', 'fallback', 'execute', 'callback'].includes(key), `${key} is not a closed AST field`);
    }
  });
}

function assertReferencesResolve(result) {
  assert.equal(result.ok, true);
  const targetIds = new Set(result.targets.map(target => target.id));
  const effectIds = new Set(result.effects.map(effect => effect.id));
  assert.equal(targetIds.size, result.targets.length, 'target ids are unique');
  assert.equal(effectIds.size, result.effects.length, 'effect ids are unique');
  for (const effect of result.effects) {
    for (const targetId of effect.targetIds) {
      assert.ok(targetIds.has(targetId), `${effect.id}: ${targetId} resolves`);
    }
  }
  for (const operation of result.operations) {
    if (operation.kind === 'sequence') {
      for (const effectId of operation.effectIds) assert.ok(effectIds.has(effectId));
    } else {
      for (const option of operation.options) {
        for (const effectId of option.effectIds) assert.ok(effectIds.has(effectId));
        for (const targetId of option.targetIds) assert.ok(targetIds.has(targetId));
      }
    }
  }
}

function parsePinned(batch, name) {
  const card = pinnedCard(batch, name);
  return parseOracleSpellV4(card, card.rulesCore);
}

test('pinned Oracle batches provide deterministic compound and single-atom fixtures', () => {
  const revitalize = parsePinned('0022', 'Revitalize');
  assert.equal(revitalize.ok, true);
  assert.deepEqual(revitalize.effects.map(effect => effect.kind), ['gainLife', 'draw']);
  assert.deepEqual(revitalize.effects.map(effect => effect.amount.value), [3, 1]);
  assert.deepEqual(revitalize.operations, [{
    id: 'operation-1',
    kind: 'sequence',
    effectIds: ['effect-1', 'effect-2'],
  }]);

  const assassinate = parsePinned('0014', 'Assassinate');
  assert.equal(assassinate.ok, true);
  assert.equal(assassinate.effects[0].kind, 'destroy');
  assert.deepEqual(assassinate.targets[0].filters, { tapped: true });

  const revoke = parsePinned('0010', 'Revoke Existence');
  assert.equal(revoke.ok, true);
  assert.equal(revoke.effects[0].kind, 'exile');
  assert.deepEqual(revoke.targets[0].types, ['Artifact', 'Enchantment']);
  assert.equal(revoke.targets[0].typeMatch, 'any');

  for (const result of [revitalize, assassinate, revoke]) {
    assertJsonClosed(result);
    assertReferencesResolve(result);
  }
});

test('compound conjunctions and recognized Treasure reminder text remain fully closed', () => {
  const deadlyDispute = parseOracleSpellV4(legacyCard('Deadly Dispute'));
  assert.equal(deadlyDispute.ok, true);
  assert.deepEqual(deadlyDispute.additionalCosts, [{
    id: 'cost-1',
    kind: 'sacrifice',
    quantity: { min: 1, max: 1 },
    object: {
      kind: 'permanent',
      types: ['Artifact', 'Creature'],
      typeMatch: 'any',
    },
  }]);
  assert.deepEqual(deadlyDispute.effects.map(effect => effect.kind), ['draw', 'createToken']);
  assert.deepEqual(deadlyDispute.effects[1].token, {
    name: 'Treasure',
    types: ['Artifact'],
    tapped: false,
  });

  const bigScore = parseOracleSpellV4(legacyCard('Big Score'));
  assert.equal(bigScore.ok, true);
  assert.equal(bigScore.additionalCosts[0].kind, 'discard');
  assert.equal(bigScore.effects[0].amount.value, 2);
  assert.equal(bigScore.effects[1].amount.value, 2);

  const catharticReunion = parseOracleSpellV4(legacyCard('Cathartic Reunion'));
  assert.equal(catharticReunion.ok, true);
  assert.equal(catharticReunion.additionalCosts[0].quantity.min, 2);
  assert.equal(catharticReunion.effects[0].kind, 'draw');
  assert.equal(catharticReunion.effects[0].amount.value, 3);

  for (const result of [deadlyDispute, bigScore, catharticReunion]) {
    assertJsonClosed(result);
    assertReferencesResolve(result);
  }
});

test('additional-cost alternatives are explicit choices rather than fallback text', () => {
  const result = parseOracleSpellV4(legacyCard('Bitter Triumph'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.additionalCosts, [{
    id: 'cost-1',
    kind: 'choice',
    choose: { min: 1, max: 1 },
    options: [
      {
        id: 'cost-2',
        kind: 'discard',
        quantity: { min: 1, max: 1 },
        object: { kind: 'card' },
      },
      {
        id: 'cost-3',
        kind: 'payLife',
        amount: { kind: 'number', value: 3 },
      },
    ],
  }]);
  assert.deepEqual(result.effects.map(effect => effect.kind), ['destroy']);
  assert.deepEqual(result.targets[0].types, ['Creature', 'Planeswalker']);
  assertJsonClosed(result);
  assertReferencesResolve(result);
});

test('single sacrifice, discard, and pay-life additional costs have exact closed shapes', () => {
  const fixtures = [
    {
      line: 'As an additional cost to cast this spell, sacrifice a creature.\nDraw a card.',
      expected: {
        kind: 'sacrifice',
        quantity: { min: 1, max: 1 },
        object: { kind: 'permanent', types: ['Creature'] },
      },
    },
    {
      line: 'As an additional cost to cast this spell, sacrifice an artifact.\nDraw a card.',
      expected: {
        kind: 'sacrifice',
        quantity: { min: 1, max: 1 },
        object: { kind: 'permanent', types: ['Artifact'] },
      },
    },
    {
      line: 'As an additional cost to cast this spell, discard two cards.\nDraw a card.',
      expected: {
        kind: 'discard',
        quantity: { min: 2, max: 2 },
        object: { kind: 'card' },
      },
    },
    {
      line: 'As an additional cost to cast this spell, pay 2 life.\nDraw a card.',
      expected: {
        kind: 'payLife',
        amount: { kind: 'number', value: 2 },
      },
    },
  ];
  for (const fixture of fixtures) {
    const result = parseOracleSpellV4(fixture.line);
    assert.equal(result.ok, true);
    assert.deepEqual(result.additionalCosts[0], { id: 'cost-1', ...fixture.expected });
    assertJsonClosed(result);
    assertReferencesResolve(result);
  }
});

test('Choose one produces a fully referenced modal AST for the real Abrade fixture', () => {
  const result = parseOracleSpellV4(legacyCard('Abrade'));
  assert.deepEqual(result, {
    ok: true,
    parserVersion: 4,
    semanticClass: 'spell-v4',
    additionalCosts: [],
    targets: [
      {
        id: 'target-1',
        kind: 'permanent',
        types: ['Creature'],
        zone: 'battlefield',
        quantity: { min: 1, max: 1 },
        distinct: true,
        controller: 'any',
      },
      {
        id: 'target-2',
        kind: 'permanent',
        types: ['Artifact'],
        zone: 'battlefield',
        quantity: { min: 1, max: 1 },
        distinct: true,
        controller: 'any',
      },
    ],
    effects: [
      {
        id: 'effect-1',
        kind: 'dealDamage',
        source: 'spell',
        amount: { kind: 'number', value: 3 },
        targetIds: ['target-1'],
      },
      {
        id: 'effect-2',
        kind: 'destroy',
        targetIds: ['target-2'],
      },
    ],
    operations: [{
      id: 'operation-1',
      kind: 'modal',
      choose: { min: 1, max: 1 },
      options: [
        { id: 'mode-1', effectIds: ['effect-1'], targetIds: ['target-1'] },
        { id: 'mode-2', effectIds: ['effect-2'], targetIds: ['target-2'] },
      ],
    }],
  });
  assertJsonClosed(result);
  assertReferencesResolve(result);
});

test('Choose two keeps compound option targets shared for the real Prismari Command fixture', () => {
  const result = parseOracleSpellV4(legacyCard('Prismari Command'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.operations[0].choose, { min: 2, max: 2 });
  assert.equal(result.operations[0].options.length, 4);
  assert.deepEqual(result.effects.map(effect => effect.kind), [
    'dealDamage',
    'draw',
    'discard',
    'createToken',
    'destroy',
  ]);
  assert.deepEqual(result.effects[1].targetIds, result.effects[2].targetIds,
    'draw/discard in the second mode resolve to the same chosen player');
  assert.deepEqual(result.operations[0].options[1], {
    id: 'mode-2',
    effectIds: ['effect-2', 'effect-3'],
    targetIds: ['target-2'],
  });
  assertJsonClosed(result);
  assertReferencesResolve(result);
});

test('Choose one or both enforces two fully parsed bullets', () => {
  const result = parseOracleSpellV4({
    name: 'Crush Contraband',
    oracle: 'Choose one or both —\n• Exile target artifact.\n• Exile target enchantment.',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.operations[0].choose, { min: 1, max: 2 });
  assert.equal(result.operations[0].options.length, 2);
  assert.deepEqual(result.effects.map(effect => effect.kind), ['exile', 'exile']);
  assertJsonClosed(result);
  assertReferencesResolve(result);
});

test('counter-unless, target-player lifegain, investigate, proliferate, and monarch are explicit atoms', () => {
  const manaLeak = parseOracleSpellV4({
    name: 'Mana Leak',
    oracle: 'Counter target spell unless its controller pays {3}.',
  });
  assert.equal(manaLeak.ok, true);
  assert.deepEqual(manaLeak.effects[0], {
    id: 'effect-1',
    kind: 'counterSpell',
    unless: {
      kind: 'controllerPaysMana',
      amount: { kind: 'genericMana', value: 3 },
    },
    targetIds: ['target-1'],
  });
  assert.equal(manaLeak.targets[0].zone, 'stack');

  const compound = parseOracleSpellV4(
    'Target player gains 4 life. Investigate. Proliferate. You become the monarch.',
  );
  assert.equal(compound.ok, true);
  assert.deepEqual(compound.effects.map(effect => effect.kind), [
    'gainLife',
    'investigate',
    'proliferate',
    'becomeMonarch',
  ]);
  assert.equal(compound.targets[0].kind, 'player');

  const rootOut = parseOracleSpellV4({
    name: 'Root Out',
    oracle: 'Destroy target artifact or enchantment. Investigate.',
  });
  assert.equal(rootOut.ok, true);
  assert.deepEqual(rootOut.effects.map(effect => effect.kind), ['destroy', 'investigate']);

  const contentiousPlan = parseOracleSpellV4({
    name: 'Contentious Plan',
    oracle: 'Proliferate.\nDraw a card.',
  });
  assert.equal(contentiousPlan.ok, true);
  assert.deepEqual(contentiousPlan.effects.map(effect => effect.kind), ['proliferate', 'draw']);

  const feast = parseOracleSpellV4({
    name: 'Feast of Succession',
    oracle: 'All creatures get -4/-4 until end of turn. You become the monarch.',
  });
  assert.equal(feast.ok, true);
  assert.deepEqual(feast.effects.map(effect => effect.kind), ['modifyPowerToughnessAll', 'becomeMonarch']);

  for (const result of [manaLeak, compound, rootOut, contentiousPlan, feast]) {
    assertJsonClosed(result);
    assertReferencesResolve(result);
  }
});

test('Reprieve targets the actual Stack and never rewrites a spell as a battlefield object', () => {
  const result = parsePinned('0041', 'Reprieve');
  assert.equal(result.ok, true);
  assert.deepEqual(result.targets, [{
    id: 'target-1',
    kind: 'spell',
    zone: 'stack',
    quantity: { min: 1, max: 1 },
    distinct: true,
  }]);
  assert.deepEqual(result.effects.map(effect => effect.kind), ['returnToHand', 'draw']);
  assertJsonClosed(result);
  assertReferencesResolve(result);
});

test('graveyard return/exile effects preserve closed source and destination contracts', () => {
  const returnToNature = parseOracleSpellV4({
    name: 'Return to Nature',
    oracle: 'Choose one —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Exile target card from a graveyard.',
  });
  assert.equal(returnToNature.ok, true);
  assert.equal(returnToNature.targets[2].kind, 'card');
  assert.equal(returnToNature.targets[2].zone, 'graveyard');
  assert.equal(returnToNature.targets[2].owner, 'any');

  const cremate = parseOracleSpellV4({
    name: 'Cremate',
    oracle: 'Exile target card from a graveyard. Draw a card.',
  });
  assert.equal(cremate.ok, true);
  assert.deepEqual(cremate.effects.map(effect => effect.kind), ['exile', 'draw']);

  const raiseDead = parseOracleSpellV4({
    name: 'Raise Dead',
    oracle: 'Return target creature card from your graveyard to your hand.',
  });
  assert.equal(raiseDead.ok, true);
  assert.deepEqual(raiseDead.effects[0], {
    id: 'effect-1',
    kind: 'returnToHand',
    destination: 'yourHand',
    targetIds: ['target-1'],
  });
  assert.equal(raiseDead.targets[0].owner, 'you');

  const reanimateTwo = parseOracleSpellV4(
    'Return up to two target creature cards from your graveyard to the battlefield tapped under your control. Exile all cards from target player\'s graveyard.',
  );
  assert.equal(reanimateTwo.ok, true);
  assert.deepEqual(reanimateTwo.targets[0].quantity, { min: 0, max: 2 });
  assert.deepEqual(reanimateTwo.effects[0], {
    id: 'effect-1',
    kind: 'returnToBattlefield',
    tapped: true,
    controller: 'you',
    targetIds: ['target-1'],
  });
  assert.equal(reanimateTwo.effects[1].kind, 'exileGraveyard');
  assert.equal(reanimateTwo.targets[1].kind, 'player');

  for (const result of [returnToNature, cremate, raiseDead, reanimateTwo]) {
    assertJsonClosed(result);
    assertReferencesResolve(result);
  }
});

test('multi-target tap and untap quantities are explicit, including unbounded target counts', () => {
  const result = parseOracleSpellV4(
    'Tap up to three target lands. Untap two target creatures. Tap any number of target artifacts. Tap or untap target permanent.',
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.effects.map(effect => effect.kind), ['tap', 'untap', 'tap', 'tapOrUntap']);
  assert.deepEqual(result.targets.map(target => target.quantity), [
    { min: 0, max: 3 },
    { min: 2, max: 2 },
    { min: 0, max: null },
    { min: 1, max: 1 },
  ]);
  assertJsonClosed(result);
  assertReferencesResolve(result);
});

test('unsupported fragments fail the whole spell without leaking partial operations', () => {
  const fixtures = [
    {
      name: 'unknown trailing sentence',
      card: 'Draw a card. Take an extra turn after this one.',
      code: 'unparsed-effect',
    },
    {
      name: 'one unknown modal bullet',
      card: 'Choose one —\n• Draw a card.\n• Search your library for any card.',
      code: 'unparsed-modal-option',
    },
    {
      name: 'missing bullet marker',
      card: 'Choose one —\nDraw a card.',
      code: 'malformed-modal',
    },
    {
      name: 'one-or-both with three bullets',
      card: 'Choose one or both —\n• Draw a card.\n• Investigate.\n• Proliferate.',
      code: 'malformed-modal',
    },
    {
      name: 'unsupported modal arity',
      card: 'Choose one or more —\n• Draw a card.\n• Investigate.',
      code: 'unsupported-modal-header',
    },
    {
      name: 'unsupported additional cost',
      card: 'As an additional cost to cast this spell, exile a blue card from your hand.\nDraw a card.',
      code: 'unsupported-additional-cost',
    },
    {
      name: 'additional cost without effect',
      card: 'As an additional cost to cast this spell, discard a card.',
      code: 'missing-spell-effect',
    },
    {
      name: 'arbitrary reminder is not discarded',
      card: 'Draw a card. (Then do anything you want.)',
      code: 'unparsed-effect',
    },
    {
      name: 'named damage source must match the card',
      card: { name: 'Not Abrade', oracle: 'Abrade deals 3 damage to target creature.' },
      code: 'unparsed-effect',
    },
  ];

  for (const fixture of fixtures) {
    const result = parseOracleSpellV4(fixture.card);
    assert.equal(result.ok, false, fixture.name);
    assert.equal(result.error.code, fixture.code, fixture.name);
    assert.deepEqual(result.additionalCosts, [], `${fixture.name}: no partial costs`);
    assert.deepEqual(result.targets, [], `${fixture.name}: no partial targets`);
    assert.deepEqual(result.effects, [], `${fixture.name}: no partial effects`);
    assert.deepEqual(result.operations, [], `${fixture.name}: no partial operations`);
    assertJsonClosed(result);
  }
});

test('the parser is stable across repeated calls and exposes version 4', () => {
  const card = legacyCard('Prismari Command');
  const first = parseOracleSpellV4(card);
  const second = parseOracleSpellV4(card);
  assert.equal(ORACLE_SPELL_V4_PARSER_VERSION, 4);
  assert.equal(first.parserVersion, ORACLE_SPELL_V4_PARSER_VERSION);
  assert.deepEqual(second, first);
  assertJsonClosed(first);
  assertReferencesResolve(first);
});
