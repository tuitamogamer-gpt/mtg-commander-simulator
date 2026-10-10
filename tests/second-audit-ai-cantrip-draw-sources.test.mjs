import test from 'node:test';
import assert from 'node:assert/strict';
import {cantripPosition} from './helpers/second-audit-ai-cantrip-fixtures.mjs';

for (const [name, draws] of [['Brainstorm', 3], ['Ponder', 1], ['Preordain', 1]]) {
  test(`human pays ${name} and its actual ${draws} printed draws lose with ${draws - 1} cards remaining`, async () => {
    const f = await cantripPosition(draws - 1), spell = f.put(name);
    await f.cast(spell); assert.equal(spell.castMeta.manaSpent, 1);
    assert.equal(f.a.lost, true); assert.equal(spell.zone, 'ceased'); f.clean();
  });
  test(`AI declines paid ${name} when its real printed drawing would exhaust the library`, async t => {
    const f = await cantripPosition(draws - 1), spell = f.put(name);
    assert.ok(f.g.castableList(f.a).some(row => row.card === spell));
    await f.botWindow(spell.is('Instant'));
    t.diagnostic(JSON.stringify({name, lost: f.a.lost, zone: spell.zone,
      library: f.a.library.length, chosen: (f.g.aiDecisionLog || []).map(row => row.chosen)}));
    assert.equal(f.a.lost, false); assert.equal(spell.zone, 'hand');
    assert.equal(f.a.library.length, draws - 1); f.clean();
  });
  test(`AI may pay safe ${name} when every real printed draw has a card available`, async t => {
    const f = await cantripPosition(draws), spell = f.put(name);
    await f.botWindow(spell.is('Instant'));
    t.diagnostic(JSON.stringify({name, lost: f.a.lost, zone: spell.zone,
      library: f.a.library.length, chosen: (f.g.aiDecisionLog || []).map(row => row.chosen)}));
    assert.equal(f.a.lost, false); assert.equal(spell.zone, 'graveyard');
    assert.equal(spell.castMeta.manaSpent, 1);
    assert.equal(f.a.library.length, name === 'Brainstorm' ? 2 : 0); f.clean();
  });
}
