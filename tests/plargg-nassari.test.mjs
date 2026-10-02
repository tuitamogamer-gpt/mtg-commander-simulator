import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();
function fixture(count = 4) {
  const game = new M.Game({ seed: 916, paced: false });
  const f = { game, questions: [], choose: () => undefined };
  const players = Array.from({ length: count }, (_, i) => game.addPlayer(`Player ${i}`, { name: 'Test' }, {
    decide: async (g, q) => {
      f.questions.push({ player: i, q });
      const answer = f.choose(i, q);
      if (answer !== undefined) return answer;
      if (q.aiHint?.kind === 'chooseOpponent') return String(players[1].idx);
      if (q.aiHint?.kind === 'denyCast') return [q.from.at(-1)];
      if (q.aiHint?.kind === 'castFreeUpTo') return q.from.slice(0, 2);
      if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
      if (q.type === 'chooseOption') return q.options[0]?.key;
      if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(o => o.key);
      if (q.type === 'chooseX') return q.min || 0;
      if (q.type === 'orderTriggers') return q.triggers;
      if (q.type === 'priority') return { kind: 'pass' };
      return null;
    },
  }, i > 0));
  Object.assign(f, { players, you: players[0] });
  game.turnPlayer = f.you; game.turnNo = 5; game.phase = 'upkeep';
  f.put = (name, owner = f.you, zone = 'library') => {
    assert.ok(M.DEFS[name], name);
    const c = new M.CardInst(M.DEFS[name], owner);
    c.zone = zone; c.ctrl = owner;
    if (zone === 'battlefield') game.battlefield.push(c); else owner[zone].push(c);
    return c;
  };
  f.source = f.put('Plargg and Nassari', f.you, 'battlefield');
  game.recalc();
  f.upkeep = async (player = f.you) => { await game.emit('upkeep', { player }); await game.flushTriggers(); };
  return f;
}

test('Plargg triggers only on its controller upkeep, exiles through lands and casts two spells for zero mana', async () => {
  const f = fixture(), names = ['Sol Ring', 'Arcane Signet', 'Mind Stone', 'Fellwar Stone'];
  const spells = f.players.map((p, i) => f.put(names[i], p));
  const lands = f.players.map(p => f.put('Mountain', p));
  await f.upkeep(f.players[1]);
  assert.equal(f.game.stack.length, 0);
  await f.upkeep();
  assert.equal(f.game.stack.length, 1);
  assert.equal(f.game.stack[0].kind, 'trigger');
  assert.equal(spells[0].zone, 'library', 'nothing is exiled before the trigger resolves');
  await f.game.resolveTop();
  assert.equal(f.game.stack.length, 2);
  assert.deepEqual(Array.from(f.game.stack, s => s.card.name), names.slice(0, 2));
  assert.ok(f.game.stack.every(s => s.ctrl === f.you && s.from === 'exile' && s.manaSpent === 0));
  assert.ok(lands.every(c => c.zone === 'exile' && c.owner.exile.includes(c)));
  assert.equal(spells[2].zone, 'exile'); assert.equal(spells[3].zone, 'exile');
  assert.equal(f.questions.find(({ q }) => q.aiHint?.kind === 'denyCast').player, 1);
  await f.game.resolveTop(); await f.game.resolveTop();
  assert.ok(spells.slice(0, 2).every(c => c.zone === 'battlefield' && c.ctrl === f.you));
  assert.equal(spells[1].owner, f.players[1]);
  assert.ok(!f.players[1].exile.includes(spells[1]));
});

test('Plargg permits zero spells, keeps every uncast card exiled and grants no later permission', async () => {
  const f = fixture(2), cards = f.players.map(p => f.put('Sol Ring', p));
  f.choose = (i, q) => q.aiHint?.kind === 'castFreeUpTo' ? [] : undefined;
  await f.upkeep(); await f.game.resolveTop();
  assert.equal(f.game.stack.length, 0);
  assert.ok(cards.every(c => c.zone === 'exile'));
  f.game.phase = 'main1';
  assert.ok(!f.game.castableList(f.you).some(e => cards.includes(e.card)));
});

test('Plargg in a two-player game allows only the one non-denied spell', async () => {
  const f = fixture(2), cards = f.players.map(p => f.put('Sol Ring', p));
  await f.upkeep(); await f.game.resolveTop();
  assert.equal(f.game.stack.length, 1); assert.equal(f.game.stack[0].card, cards[0]);
  assert.equal(f.questions.find(({ q }) => q.aiHint?.kind === 'castFreeUpTo').q.max, 1);
});

test('Plargg can cast Lightning Bolt then Twincast targeting that still-unresolved spell', async () => {
  const f = fixture();
  const bolt = f.put('Lightning Bolt'), twin = f.put('Twincast', f.players[1]);
  f.put('Sol Ring', f.players[2]); f.put('Arcane Signet', f.players[3]);
  f.choose = (i, q) => {
    if (q.aiHint?.kind === 'castFreeUpTo') return [bolt, twin];
    if (q.type === 'chooseTargets') return [q.candidates.find(c => c === f.players[3] || c.card === bolt)].filter(Boolean);
  };
  await f.upkeep(); await f.game.resolveTop();
  assert.equal(f.game.stack.length, 2);
  assert.equal(f.players[3].life, 40, 'neither spell resolves inside the upkeep ability');
  assert.equal(f.game.stack[1].card, twin);
  assert.ok(f.game.stack[1].targets.flat().some(t => t.card === bolt));
  await f.game.resolveTop(); await f.game.resolveTop(); await f.game.resolveTop();
  assert.equal(f.players[3].life, 34);
});

test('Plargg forces X to zero and leaves an uncastable targeted spell in exile', async () => {
  const f = fixture();
  const x = f.put('Walking Ballista'), counter = f.put('Counterspell', f.players[1]);
  f.put('Sol Ring', f.players[2]); f.put('Arcane Signet', f.players[3]);
  // Counterspell has no legal spell to target before the Ballista is cast.
  f.choose = (i, q) => q.aiHint?.kind === 'castFreeUpTo' ? [counter, x] : undefined;
  await f.upkeep(); await f.game.resolveTop();
  assert.equal(counter.zone, 'exile');
  assert.equal(f.players[1].exile.filter(c => c === counter).length, 1);
  assert.equal(f.game.stack.length, 1); assert.equal(f.game.stack[0].card, x);
  assert.equal(x.castMeta.x, 0); assert.equal(x.castMeta.manaSpent, 0);
});

test('Plargg handles empty libraries and libraries containing only lands', async () => {
  const f = fixture(), land = f.put('Mountain');
  await f.upkeep(); await f.game.resolveTop();
  assert.equal(f.game.stack.length, 0); assert.equal(land.zone, 'exile');
  assert.ok(!f.questions.some(({ q }) => q.aiHint?.kind === 'denyCast'));
});

test('Plargg trigger survives source removal, but free casting still requires mandatory additional costs', async () => {
  const f = fixture(2), fling = f.put('Fling'); f.put('Sol Ring', f.players[1]);
  await f.upkeep();
  await f.game.move(f.source, 'exile');
  await f.game.resolveTop();
  assert.equal(fling.zone, 'exile', 'Fling cannot be cast without a creature to sacrifice');
  assert.equal(f.game.stack.length, 0);
  assert.ok(f.questions.some(({ q }) => q.aiHint?.kind === 'castFreeUpTo'));
});

test('Plargg works with real local AI making both the delegation and free-cast decisions', async () => {
  const f = fixture();
  const spells = f.players.map((p, i) => f.put(['Sol Ring', 'Arcane Signet', 'Mind Stone', 'Fellwar Stone'][i], p));
  for (const p of f.players) {
    p.isAI = true; p.controller = new M.AIController(p, { difficulty: 'hard', style: 'balanced' });
  }
  await f.upkeep(); await f.game.resolveTop();
  assert.equal(f.game.stack.length, 2);
  assert.ok(f.game.stack.every(s => s.ctrl === f.you && s.manaSpent === 0));
  assert.equal(spells.filter(c => c.zone === 'exile').length, 2);
  assert.ok(!(f.game.aiDecisionLog || []).some(e => e.fallback));
});
