import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function allEntries(MTG) {
  return MTG.ORACLE_BATCHES
    .flatMap(batch => batch.cards)
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic');
}

function assertExecutableOperation(MTG, entry, definition, operation) {
  if (operation.kind === 'double-faced-v8') {
    // The runtime definition is the front face, so the printed faces are
    // checked against their own compiled operations.
    const front = operation.faces.find(face => face.key === 'front') || operation.faces[0];
    for (const child of front.implementation || []) assertExecutableOperation(MTG, entry, definition, child);
    return;
  }
  const implementation = definition.oracleImplementation || [];
  assert.ok(implementation.some(candidate => JSON.stringify(candidate) === JSON.stringify(operation)),
    `${entry.raw.name}: catalog keeps the exact compiled operation`);
  assert.ok(definition.oracleContracts.includes(operation.contract),
    `${entry.raw.name}: catalog exposes ${operation.contract}`);

  if (operation.kind === 'spell-v4') {
    assert.equal(operation.parserVersion, 4, `${entry.raw.name}: closed spell parser version`);
    assert.equal(operation.contract, 'spell-v4-closed-ast', `${entry.raw.name}: closed spell contract`);
    assert.equal(definition.oracleSpellV4, true, `${entry.raw.name}: spell-v4 reached the runtime compiler`);
    assert.deepEqual(definition.oracleSpellV4Operation, operation,
      `${entry.raw.name}: runtime retains the exact validated spell-v4 AST`);
    assert.equal(typeof definition.resolve, 'function', `${entry.raw.name}: spell-v4 has an executable resolver`);
    assert.equal(Array.isArray(operation.operations), true, `${entry.raw.name}: spell-v4 operations array`);
    assert.equal(operation.operations.length, 1, `${entry.raw.name}: one closed top-level operation`);
    assert.ok(['sequence', 'modal'].includes(operation.operations[0].kind),
      `${entry.raw.name}: supported spell-v4 top-level operation`);
    assert.equal(new Set(operation.targets.map(target => target.id)).size, operation.targets.length,
      `${entry.raw.name}: unique spell-v4 target ids`);
    assert.equal(new Set(operation.effects.map(effect => effect.id)).size, operation.effects.length,
      `${entry.raw.name}: unique spell-v4 effect ids`);
    for (const effect of operation.effects) {
      assert.ok(MTG.ORACLE_SPELL_V4_RUNTIME.effectKinds.includes(effect.kind),
        `${entry.raw.name}: executable spell-v4 effect ${effect.kind}`);
    }
    for (const cost of operation.additionalCosts) {
      assert.ok(MTG.ORACLE_SPELL_V4_RUNTIME.costKinds.includes(cost.kind),
        `${entry.raw.name}: executable spell-v4 additional cost ${cost.kind}`);
    }
    assert.ok(definition.targets || definition.modes, `${entry.raw.name}: spell-v4 exposes targets or modes`);
    return;
  }

  if (operation.kind === 'generic-trigger') {
    assert.ok((definition.triggers || []).some(trigger => trigger.desc === 'Oracle effect'),
      `${entry.raw.name}: generic trigger compiled to an engine trigger`);
    assert.ok(operation.v4Body || (Array.isArray(operation.effects) && operation.effects.length) ||
      (operation.modalBody && operation.modalBody.modes.every(mode => mode.body.effects.length)),
      `${entry.raw.name}: generic trigger has executable effects`);
    assert.ok(Array.isArray(operation.targets), `${entry.raw.name}: generic trigger has a closed target list`);
    return;
  }
  if (operation.kind === 'generic-ability') {
    assert.ok((operation.from==='hand'?[definition.handAbility]:operation.from==='graveyard'?[definition.gyAbility]:definition.abilities || []).some(ability => ability?.oracleCompiled),
      `${entry.raw.name}: generic ability compiled to an engine action`);
    assert.ok(operation.v4Body || (Array.isArray(operation.effects) && operation.effects.length) ||
      (operation.modalBody && operation.modalBody.modes.every(mode => mode.body.effects.length)),
      `${entry.raw.name}: generic ability has executable effects`);
    assert.ok(operation.cost && typeof operation.cost === 'object',
      `${entry.raw.name}: generic ability has an explicit cost object`);
    return;
  }
  if (operation.kind === 'generic-static') {
    assert.ok((definition.statics || []).length, `${entry.raw.name}: generic static compiled into the layer engine`);
    assert.ok(operation.scope, `${entry.raw.name}: generic static has a closed affected scope`);
    return;
  }
  if (operation.kind.startsWith('mechanic-')) {
    const adapterMechanics = new Set([
      'mechanic-affinity-artifacts', 'mechanic-afterlife', 'mechanic-battle-cry',
      'mechanic-bloodthirst', 'mechanic-bushido', 'mechanic-delve', 'mechanic-evolve',
      'mechanic-exalted', 'mechanic-extort', 'mechanic-flanking', 'mechanic-improvise',
      'mechanic-infect', 'mechanic-mentor', 'mechanic-myriad', 'mechanic-renown',
      'mechanic-riot', 'mechanic-toxic', 'mechanic-training', 'mechanic-typecycling',
      'mechanic-unleash',
    ]);
    if (adapterMechanics.has(operation.kind)) {
      assert.equal(MTG.applyOracleMechanic({}, operation), true,
        `${entry.raw.name}: ${operation.kind} is accepted by the real mechanic compiler`);
    }
  }
}

function namedFor(MTG, keyword) {
  const entry = allEntries(MTG).find(card => card.implementedKeywords.some(value =>
    value === keyword || keyword === 'ward' && value.startsWith('ward ')));
  assert.ok(entry, `representative for ${keyword}`);
  return entry.raw.name;
}

function castingContract(entry) {
  if (entry.raw.types.includes('Land')) return 'land-play';
  if (entry.raw.types.some(type => type === 'Instant' || type === 'Sorcery')) return 'spell-casting';
  if (entry.raw.types.includes('Creature')) return 'creature-casting';
  if (entry.raw.types.includes('Planeswalker')) return 'permanent-casting';
  if (entry.raw.types.some(type => type === 'Artifact' || type === 'Enchantment')) return 'permanent-casting';
  return null;
}

function permanent(MTG, game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  return card;
}

test('svaka generička Oracle batch karta mapira kompletan rules core na poznate interakcijske ugovore', () => {
  const MTG = loadEngine();
  const entries = allEntries(MTG);
  const batches = MTG.ORACLE_BATCHES.filter(batch => batch.id !== 'moxfield-sauron-dark-lord');
  assert.equal(batches.length, 148, 'generic Oracle catalog has exactly 148 batches');
  assert.ok(batches.every(batch => batch.cards.length === 100), 'every generic Oracle batch contains exactly 100 cards');
  assert.equal(entries.length, 14800, `expected all 148 generic Oracle batches (14,800 cards), found ${entries.length}`);
  for (const entry of entries) {
    const catalog = MTG.CARD_CATALOG[entry.raw.name];
    const deck = { cards: [{ n: 1, name: entry.raw.name }] };
    const audit = MTG.auditImportedDeckInteractions(deck, MTG.DEFS);
    assert.equal(audit.ready, true, `${entry.raw.name}: ${JSON.stringify(audit.unsupported)}`);
    const base = castingContract(entry);
    assert.ok(base, `${entry.raw.name}: supported runtime type`);
    assert.ok(audit.contracts.some(contract => contract.id === base), `${entry.raw.name}: ${base}`);
    for (const operation of entry.implementation || []) {
      assert.ok(MTG.ORACLE_INTERACTION_CONTRACTS[operation.contract], `${entry.raw.name}: known ${operation.contract}`);
      assert.ok(audit.contracts.some(contract => contract.id === operation.contract), `${entry.raw.name}: ${operation.contract}`);
      assertExecutableOperation(MTG, entry, MTG.DEFS[entry.raw.name], operation);
    }
    for (const keyword of entry.implementedKeywords) {
      const mechanic = keyword.startsWith('ward ') ? 'ward' : keyword;
      const contract = MTG.ORACLE_KEYWORD_CONTRACTS[mechanic];
      assert.ok(contract, `${entry.raw.name}: ${mechanic} contract`);
      assert.ok(audit.contracts.some(item => item.id === contract), `${entry.raw.name}: ${contract}`);
    }
    assert.equal(catalog.oracleText, entry.raw.oracle);
  }
});

test('stvarne batch karte prolaze centralnu evasion, targeting, timing i combat-step matricu', () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 300, paced: false, maxTurns: 5 });
  const a = game.addPlayer('A', { name: 'A' }, null, false);
  const b = game.addPlayer('B', { name: 'B' }, null, false);
  game.turnPlayer = a;
  game.phase = 'combat';

  const flyer = permanent(MTG, game, a, namedFor(MTG, 'flying'));
  const reach = permanent(MTG, game, b, namedFor(MTG, 'reach'));
  const ground = permanent(MTG, game, b, 'Elite Vanguard');
  const forestwalk = permanent(MTG, game, a, namedFor(MTG, 'forestwalk'));
  permanent(MTG, game, b, 'Forest');
  const defender = permanent(MTG, game, a, namedFor(MTG, 'defender'));
  const hexproof = permanent(MTG, game, b, namedFor(MTG, 'hexproof'));
  const shroud = permanent(MTG, game, a, namedFor(MTG, 'shroud'));
  const first = permanent(MTG, game, a, namedFor(MTG, 'first strike'));
  const double = permanent(MTG, game, a, namedFor(MTG, 'double strike'));
  const flash = permanent(MTG, game, a, namedFor(MTG, 'flash'));
  game.recalc();

  assert.equal(game.canBlock(ground, flyer), false);
  assert.equal(game.canBlock(reach, flyer), true);
  assert.equal(game.canBlock(ground, forestwalk), false);
  assert.equal(game.canAttackAtAll(defender), false);
  assert.equal(game.legalTargets({ what: 'creature' }, flyer, a).includes(hexproof), false);
  assert.equal(game.legalTargets({ what: 'creature' }, flyer, a).includes(shroud), false);
  assert.equal(game.legalTargets({ what: 'creature' }, shroud, a).includes(shroud), false);
  assert.ok(game.dmgAmount(first, 'first') > 0);
  assert.equal(game.dmgAmount(first, 'normal'), first.cur.power);
  first.meta._dealtFirstStrike = true;
  assert.equal(game.dmgAmount(first, 'normal'), 0);
  assert.ok(game.dmgAmount(double, 'first') > 0);
  double.meta._dealtFirstStrike = true;
  assert.ok(game.dmgAmount(double, 'normal') > 0);

  const flashCard = new MTG.CardInst(flash.def, a);
  flashCard.zone = 'hand';
  a.hand.push(flashCard);
  game.turnPlayer = b;
  game.phase = 'main1';
  assert.equal(game.canCastTiming(a, flashCard), true);
});

test('stvarne batch karte kompoziciono rješavaju lifelink, wither, deathtouch i indestructible', async () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 301, paced: false, maxTurns: 5 });
  const a = game.addPlayer('A', { name: 'A' }, null, false);
  const b = game.addPlayer('B', { name: 'B' }, null, false);
  const lifelink = permanent(MTG, game, a, namedFor(MTG, 'lifelink'));
  const wither = permanent(MTG, game, a, namedFor(MTG, 'wither'));
  const deathtouch = permanent(MTG, game, a, namedFor(MTG, 'deathtouch'));
  const indestructible = permanent(MTG, game, b, namedFor(MTG, 'indestructible'));
  const victim = permanent(MTG, game, b, 'Elite Vanguard');
  const victim2 = permanent(MTG, game, b, 'Aegis Turtle');
  game.recalc();

  a.life = 30;
  await game.damagePlayer(lifelink, b, 2);
  assert.equal(a.life, 32);
  await game.damageCreature(wither, victim2, 2);
  assert.equal(victim2.counters['-1/-1'], 2);
  await game.damageCreature(deathtouch, victim, 1);
  assert.equal(victim.zone, 'graveyard');
  await game.destroy(indestructible);
  assert.equal(indestructible.zone, 'battlefield');
});
