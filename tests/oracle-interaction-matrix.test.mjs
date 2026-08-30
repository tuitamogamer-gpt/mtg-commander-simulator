import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function allEntries(MTG) {
  return MTG.ORACLE_BATCHES
    .flatMap(batch => batch.cards)
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic');
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
  assert.ok(entries.length >= 1300, `expected the initial 300 plus 1,000 new cards, found ${entries.length}`);
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
