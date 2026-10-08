import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semanticClass, createImportPlan, runtimeBatch} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import {fund, total, def, put, permanent, targets, source} from './helpers/oracle-v30-permanents-proof.mjs';

const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v31-common.json', import.meta.url), 'utf8'));
const plan = createImportPlan({cards: rows, bulk: {type: 'oracle_cards'}, sequence: 9984, limit: rows.length, compilerVersion: 31});
const M = loadEngine();
const absent = plan.report.cards.filter(entry => !M.DEFS[entry.raw.name]);
if (absent.length) M.registerOracleBatch({...runtimeBatch(plan.report), cards: absent});
M.initData(M.RAW_DATA);

test('v31 consumes every source paragraph and rejects unknown continuations', () => {
  for (const row of rows) {
    assert.ok(semanticClass(row, {compilerVersion: 31}).semanticClass, row.name);
    assert.equal(semanticClass({...row, oracle_text: row.oracle_text + '\nDo an unsupported thing.'}, {compilerVersion: 31}).semanticClass, undefined, row.name);
  }
});

test('v31 preserves successful historical descriptors exactly', () => {
  const older = JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v30-spells.json', import.meta.url), 'utf8'));
  for (const row of older) assert.deepEqual(semanticClass(row, {compilerVersion: 31}), semanticClass(row, {compilerVersion: 30}), row.name);
});

for (const role of ['human', 'ai']) {
  for (const tapped of [false, true]) test(`${role}: Brackish Blunder remembers tapped state before bouncing`, async () => {
    const f = context(M, role), {game: g, a, b} = f;
    fund(a);
    const victim = permanent(M, g, b, def('Brackish target'));
    if (tapped) g.tap(victim);
    targets(a, [victim]);
    await source(M, f, 'Brackish Blunder', settle);
    assert.equal(victim.zone, 'hand');
    assert.equal(victim.owner, b);
    const maps = g.bf().filter(c => c.isToken && c.hasSub('Map'));
    assert.equal(maps.length, tapped ? 1 : 0);
    if (tapped) {
      const explorer = permanent(M, g, a, def('Map explorer'));
      targets(a, [explorer]);
      const action = g.activatableList(a).find(x => x.card === maps[0]);
      assert.ok(action);
      const before = total(a), hand = a.hand.length;
      assert.equal(await g.activateAbility(a, action), true);
      await settle(g);
      assert.equal(total(a), before - 1);
      assert.equal(a.hand.length, hand + 1);
      assert.equal(maps[0].zone, 'ceased');
    }
    assertGameStateInvariants(g);
  });

  test(`${role}: Brackish Blunder fizzles after its sole target leaves`, async () => {
    const f = context(M, role), {game: g, a, b} = f;
    fund(a);
    const victim = permanent(M, g, b, def('Stale Brackish target'));
    g.tap(victim); targets(a, [victim]);
    const spell = put(M, a, 'Brackish Blunder', 'hand');
    assert.equal(await g.castSpell(a, spell, {from: 'hand'}), true);
    await g.sacrifice(b, victim);
    await settle(g);
    assert.equal(victim.zone, 'graveyard');
    assert.equal(g.bf().some(c => c.isToken && c.hasSub('Map')), false);
    assertGameStateInvariants(g);
  });

  test(`${role}: Abigale removes abilities, grants counters and excludes itself`, async () => {
    const f = context(M, role), {game: g, a, b} = f;
    fund(a);
    const victim = permanent(M, g, b, def('Abigale target', ['Creature'], {kws: ['haste']}));
    targets(a, [victim]);
    const abigale = await source(M, f, 'Abigale, Eloquent First-Year', settle);
    assert.equal(victim.kw('haste'), false);
    for (const keyword of ['flying', 'first strike', 'lifelink']) {
      assert.equal(victim.counters[keyword], 1);
      assert.equal(victim.kw(keyword), true);
    }
    const spec = abigale.def.triggers.find(t => t.targets?.length).targets[0];
    assert.equal(g.legalTargets(spec, abigale, a).includes(abigale), false);
    assertGameStateInvariants(g);
  });

  test(`${role}: Mithril Coat attaches only to your legendary creature`, async () => {
    const f = context(M, role), {game: g, a, b} = f;
    fund(a);
    const legend = permanent(M, g, a, def('Friendly legend', ['Creature'], {super: ['Legendary']}));
    const ordinary = permanent(M, g, a, def('Ordinary creature'));
    const enemy = permanent(M, g, b, def('Foreign legend', ['Creature'], {super: ['Legendary']}));
    targets(a, [legend]);
    const coat = await source(M, f, 'Mithril Coat', settle);
    assert.equal(coat.attachedTo, legend.iid);
    assert.equal(legend.kw('indestructible'), true);
    const spec = coat.def.triggers.find(t => t.targets?.length).targets[0];
    const legal = g.legalTargets(spec, coat, a);
    assert.equal(legal.includes(ordinary), false);
    assert.equal(legal.includes(enemy), false);
    assertGameStateInvariants(g);
  });
}
