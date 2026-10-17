import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();
function fixture(sourceName) {
  const game = new M.Game({ seed: 431, paced: true });
  const f = { game, pending: [], questions: [], choose: () => undefined };
  const controller = {
    decide: async (g, q) => {
      f.questions.push(q);
      if (q.type === 'cardReveal') return new Promise(resolve => f.pending.push({ q, resolve }));
      const answer = f.choose(q);
      if (answer !== undefined) return answer;
      if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
      if (q.type === 'chooseOption') return q.options.find(option => option.key === 'no')?.key ?? q.options[0]?.key;
      if (q.type === 'priority') return { kind: 'pass' };
      if (q.type === 'orderTriggers') return q.triggers;
      return null;
    },
  };
  f.you = game.addPlayer('You', { name: 'Test' }, controller, false);
  f.other = game.addPlayer('Other', { name: 'Test' }, { decide: async (g, q) => {
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    return null;
  } }, true);
  game.turnPlayer = f.you; game.turnNo = 4; game.phase = 'main1';
  f.put = (name, owner = f.you, zone = 'library') => {
    assert.ok(M.DEFS[name], name);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.ctrl = owner;
    if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
    return card;
  };
  f.source = f.put(sourceName, f.you, 'battlefield');
  game.recalc();
  f.ctx = { g: game, you: f.you, src: f.source, data: {}, so: {}, targets: [] };
  return f;
}

async function reviewUntilDone(f, run, check = () => {}) {
  let done = false, failure;
  const work = Promise.resolve().then(run).then(() => { done = true; }, error => { failure = error; done = true; });
  const seen = new Set();
  for (let attempt = 0; attempt < 500 && (!done || f.pending.length); attempt++) {
    await new Promise(resolve => setImmediate(resolve));
    const pending = f.pending.shift();
    if (!pending) continue;
    for (const card of pending.q.cards || []) seen.add(card);
    check(pending.q, seen);
    pending.resolve(null);
  }
  assert.ok(done, 'effect finishes after its reveal acknowledgements');
  await work;
  if (failure) throw failure;
  return [...seen];
}

test('Plargg reveals every land and hit in order before choosing any free casts', async () => {
  const f = fixture('Plargg and Nassari');
  const ownHit = f.put('Sol Ring'), ownLand = f.put('Mountain');
  const otherHit = f.put('Mind Stone', f.other), otherLand = f.put('Island', f.other);
  const expected = [ownLand, ownHit, otherLand, otherHit];
  const seen = await reviewUntilDone(f, () => M.SCRIPTS[f.source.name].triggers[0].run(f.ctx), (q, reviewed) => {
    assert.ok(!f.questions.some(question => question.aiHint?.kind === 'castFreeUpTo'), 'casting waits for the final review');
    const newest = [...reviewed].at(-1), index = expected.indexOf(newest);
    for (const future of expected.slice(index + 1)) assert.equal(future.zone, 'library', 'later cards stay in their library');
  });
  assert.deepEqual(seen, expected);
  assert.ok(expected.every(card => card.zone === 'exile'));
  assert.ok(f.questions.some(q => q.aiHint?.kind === 'castFreeUpTo'));
});

test('Creative Technique reviews each revealed land before continuing and never exiles those lands', async () => {
  const f = fixture('Creative Technique');
  const hit = f.put('Sol Ring'), land = f.put('Mountain');
  // A constant near one keeps Fisher-Yates swaps in place.
  f.game.rnd = () => 0.999999;
  const seen = await reviewUntilDone(f, () => M.SCRIPTS[f.source.name].resolve(f.ctx), (q, reviewed) => {
    assert.equal(land.zone, 'library');
    assert.ok(!f.you.exile.includes(land));
    for (const card of reviewed) assert.equal(f.game.byIid(card.iid), card, 'reviewed history remains addressable on reconnect');
    if (!reviewed.has(hit)) assert.ok(f.you.library.includes(hit));
    assert.ok(!f.questions.some(question => question.aiHint?.kind === 'freeCast'), 'free casting waits for review');
  });
  assert.deepEqual(seen, [land, hit]);
  assert.equal(hit.zone, 'exile');
  assert.ok(f.you.library.includes(land));
});

test('Dance with Calamity waits after each chosen exile before asking to continue or cast', async () => {
  const f = fixture('Dance with Calamity');
  const hit = f.put('Sol Ring'), land = f.put('Mountain');
  f.game.rnd = () => 0.999999;
  f.choose = q => q.aiHint?.kind === 'danceContinue' ? 'yes' : undefined;
  const seen = await reviewUntilDone(f, () => M.SCRIPTS[f.source.name].resolve(f.ctx), (q, reviewed) => {
    if (!reviewed.has(hit)) assert.equal(hit.zone, 'library');
    assert.ok(!f.questions.some(question => question.aiHint?.kind === 'danceFreeCasts'));
  });
  assert.deepEqual(seen, [land, hit]);
  assert.equal(f.questions.filter(q => q.aiHint?.kind === 'danceContinue').length, 2);
  assert.ok(f.questions.some(q => q.aiHint?.kind === 'danceFreeCasts'));
});

test('Kang Prime suspends only after reviewing the nonland and includes skipped lands', async () => {
  const f = fixture('Kang Prime'), hit = f.put('Sol Ring'), land = f.put('Mountain');
  const seen = await reviewUntilDone(f, () => M.SCRIPTS[f.source.name].triggers[0].run(f.ctx), () => {
    assert.equal(hit.meta.suspended, undefined);
  });
  assert.deepEqual(seen, [land, hit]);
  assert.equal(hit.meta.suspended, 2);
  assert.ok([land, hit].every(card => card.zone === 'exile'));
});

test('Glorious Purpose shows all four cards before casting or moving any to hand', async () => {
  const f = fixture('Glorious Purpose');
  f.source.counters.plan = 5;
  const cards = ['Sol Ring', 'Mountain', 'Mind Stone', 'Island'].map(name => f.put(name)).reverse();
  const seen = await reviewUntilDone(f, () => M.SCRIPTS[f.source.name].triggers[0].run(f.ctx), () => {
    assert.equal(f.you.hand.length, 0);
    assert.ok(!f.questions.some(question => question.aiHint?.kind === 'freeCast'));
  });
  assert.deepEqual(seen, cards);
  assert.ok(cards.every(card => card.zone === 'hand'));
});

test('face-down Extract Power never enters public reveal controls', async () => {
  const f = fixture('Extract Power'), ownCard = f.put('Sol Ring'), otherCard = f.put('Mountain', f.other);
  const seen = await reviewUntilDone(f, () => M.SCRIPTS[f.source.name].resolve(f.ctx));
  assert.deepEqual(seen, []);
  for (const card of [ownCard, otherCard]) {
    assert.equal(card.faceDown, true);
    assert.equal(card.zone, 'exile');
    assert.deepEqual(Array.from(card.meta.revealedTo), [f.you.idx]);
  }
});

test('Abstract Performance reviews only the face-up pile before the opponent chooses', async () => {
  const f = fixture('Abstract Performance');
  const faceUp = ['Sol Ring', 'Mountain', 'Mind Stone', 'Island'].map(name => f.put(name)).reverse();
  const hidden = ['Arcane Signet', 'Forest', 'Fellwar Stone', 'Plains'].map(name => f.put(name));
  const seen = await reviewUntilDone(f, () => M.SCRIPTS[f.source.name].resolve(f.ctx), (q, reviewed) => {
    assert.ok(hidden.every(card => card.faceDown && !reviewed.has(card)), 'hidden pile stays absent from reveal payloads');
    assert.ok(!f.questions.some(question => question.aiHint?.kind === 'abstractPile'));
  });
  assert.deepEqual(seen, faceUp);
});

for (const name of ['The Five Arrive', 'Wakanda Forever!']) {
  test(`${name} reviews all inspected cards before selecting destinations`, async () => {
    const f = fixture(name), spell = f.put('Sol Ring'), land = f.put('Mountain');
    if (name === 'The Five Arrive') {
      f.other.isAI = false;
      f.other.controller = { decide: async (g, q) => {
        assert.notEqual(q.type, 'cardReveal', 'a private look never reveals the cards to another human');
        return null;
      } };
    }
    const seen = await reviewUntilDone(f, () => M.SCRIPTS[f.source.name].resolve(f.ctx), () => {
      assert.equal(spell.zone, 'library');
      assert.equal(land.zone, 'library');
      assert.equal(f.game.byIid(land.iid), land);
      assert.equal(f.game.byIid(spell.iid), spell);
      assert.ok(!f.questions.some(question => question.type === 'chooseCards'));
    });
    assert.deepEqual(seen, [land, spell]);
    assert.ok([land, spell].every(card => card.zone === (name === 'The Five Arrive' ? 'hand' : 'graveyard')));
  });
}
