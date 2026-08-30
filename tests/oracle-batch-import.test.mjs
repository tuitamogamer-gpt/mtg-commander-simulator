import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function stripReminderText(text) {
  let output = '';
  let depth = 0;
  for (const character of String(text || '')) {
    if (character === '(') { depth += 1; continue; }
    if (character === ')' && depth > 0) { depth -= 1; continue; }
    if (depth === 0) output += character;
  }
  return output.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
}

function battlefield(MTG, game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  return card;
}

test('početni Oracle batchovi ostaju stabilni dok katalog prihvata naredne batchove', () => {
  const MTG = loadEngine();
  const expected = [
    ['oracle-0001', 'A.I.M. Bot', 'Brushstrider'],
    ['oracle-0002', 'Bull Cerodon', 'Elite Vanguard'],
    ['oracle-0003', 'Elvish Archers', 'Griffin Sentinel'],
  ];
  const batches = expected.map(([id, first, last]) => {
    const batch = MTG.ORACLE_BATCHES.find(entry => entry.id === id);
    assert.ok(batch, id);
    assert.equal(batch.cards.length, 100, `${id}: size`);
    assert.equal(batch.cards[0].raw.name, first, `${id}: first card`);
    assert.equal(batch.cards.at(-1).raw.name, last, `${id}: last card`);
    return batch;
  });
  const allEntries = batches.flatMap(batch => batch.cards);
  assert.equal(new Set(allEntries.map(entry => entry.oracleId)).size, 300);
  assert.equal(new Set(allEntries.map(entry => entry.raw.name)).size, 300);

  for (const entry of allEntries) {
    const name = entry.raw.name;
    const raw = MTG.RAW_DATA.cards[name];
    const def = MTG.DEFS[name];
    const script = MTG.SCRIPTS[name];
    const catalog = MTG.CARD_CATALOG[name];
    assert.ok(raw, `${name}: raw definition`);
    assert.ok(def, `${name}: engine definition`);
    assert.ok(script, `${name}: explicit script marker`);
    assert.equal(raw.oracle, entry.raw.oracle, `${name}: exact Oracle text`);
    assert.equal(stripReminderText(raw.oracle), entry.rulesCore, `${name}: complete supported rules core`);
    assert.equal(raw._oracleId, entry.oracleId, `${name}: stable Oracle id`);
    assert.equal(script.oracleImplemented, true, `${name}: implementation status`);
    assert.equal(script.oracleBatch, raw._oracleBatch, `${name}: batch provenance`);
    assert.equal(!!def.autoScripted, false, `${name}: no heuristic autoscript`);
    assert.equal(catalog.engineStatus, 'certified', `${name}: deckbuilder status`);
    assert.equal(catalog.commanderLegality, 'legal', `${name}: Commander legality`);
    assert.equal(catalog.oracleId, entry.oracleId, `${name}: catalog Oracle id`);
    assert.deepEqual(Array.from(catalog.implementedKeywords), Array.from(entry.implementedKeywords), `${name}: interaction metadata`);
    assert.match(String(raw.power), /^-?\d+$/, `${name}: numeric power`);
    assert.match(String(raw.toughness), /^-?\d+$/, `${name}: numeric toughness`);
    for (const keyword of entry.implementedKeywords) {
      if (keyword.startsWith('ward ')) assert.ok(def.ward, `${name}: ${keyword}`);
      else assert.ok(def.kws.includes(keyword), `${name}: ${keyword}`);
    }
  }
});

test('Oracle batch keywordi koriste stvarne centralne combat i targeting putanje', () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 829, paced: false, maxTurns: 5 });
  const attacker = game.addPlayer('Attacker', { name: 'Oracle batch' }, null, false);
  const defender = game.addPlayer('Defender', { name: 'Oracle batch' }, null, false);
  game.turnPlayer = attacker;
  game.phase = 'combat';

  const flyer = battlefield(MTG, game, attacker, 'A.I.M. Bot');
  const ground = battlefield(MTG, game, defender, 'Aegis Turtle');
  const reach = battlefield(MTG, game, defender, 'Arachnoid');
  const hexproof = battlefield(MTG, game, defender, 'Bassara Tower Archer');
  const defenderCard = battlefield(MTG, game, attacker, 'Blistering Barrier');
  game.recalc();

  assert.equal(game.canBlock(ground, flyer), false, 'ground creature cannot block flying');
  assert.equal(game.canBlock(reach, flyer), true, 'reach blocks flying');
  assert.equal(game.canAttackAtAll(defenderCard), false, 'defender cannot attack');
  assert.equal(game.legalTargets({ what: 'creature' }, flyer, attacker).includes(hexproof), false, 'opponent hexproof is not a legal target');
  assert.ok(MTG.DEFS['Boros Swiftblade'].kws.includes('double strike'));
  assert.ok(MTG.DEFS['Boggart Ram-Gang'].kws.includes('wither'));
  assert.ok(MTG.DEFS['Bloodfire Expert'].triggers.some(trigger => trigger.desc === 'Prowess'));
});

test('CARD_CATALOG pokriva sve engine definicije i odvaja legacy od batch statusa', () => {
  const MTG = loadEngine();
  const batchEntries = MTG.ORACLE_BATCHES.flatMap(batch => batch.cards);
  const manualEntries = batchEntries.filter(entry => entry.semanticClass === 'manual-deck-semantic');
  assert.equal(Object.keys(MTG.CARD_CATALOG).length, Object.keys(MTG.DEFS).length);
  assert.equal(Object.values(MTG.CARD_CATALOG).filter(card => card.engineBatch).length, batchEntries.length);
  assert.equal(Object.values(MTG.CARD_CATALOG).filter(card => card.semanticClass === 'manual-deck-semantic').length, manualEntries.length);
  assert.equal(MTG.CARD_CATALOG['A.I.M. Bot'].engineStatus, 'certified');
  assert.equal(MTG.CARD_CATALOG['Sol Ring'].engineStatus, 'certified-legacy');
  assert.deepEqual(Array.from(MTG.CARD_CATALOG['A.I.M. Bot'].colorIdentity), ['U']);
});
